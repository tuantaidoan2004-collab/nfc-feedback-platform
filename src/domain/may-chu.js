// Sức khoẻ máy chủ cho trang Quản trị › Máy chủ: chỉ những gì có thể làm khách không nhận được công cụ.
// Mỗi mục: {key, label, level: 'ok'|'warn'|'bad', value, hint}. hint = 1 câu "nên làm gì" khi không ổn.
// Không cần quyền root, không gọi lệnh hệ thống: chạy được cả trong systemd đã khoá quyền (ProtectSystem=strict).
import { readdirSync, readFileSync, statSync, statfsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import os from 'node:os';
import { get, run } from '../db/index.js';
import { MIN, HOUR } from '../lib/time.js';
import { lastOffsite } from './sao-luu-ngoai.js';

const PROBE_KEY = 'job_selfcheck';
export const PROBE_EVERY = 5 * MIN;
const BACKUP_MAX_AGE = 26 * HOUR;

const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);
const mb = (n) => (n < 1048576 ? `${Math.round(n / 1024)} KB` : `${Math.round(n / 1048576)} MB`);
const gb = (n) => `${(n / 1073741824).toFixed(1)} GB`;
/** "3 phút trước" / "2 giờ trước" / "1 ngày trước". */
export function ago(ms, now) {
  const d = Math.max(0, now - ms);
  if (d < MIN) return 'vừa xong';
  if (d < HOUR) return `${Math.floor(d / MIN)} phút trước`;
  if (d < 48 * HOUR) return `${Math.floor(d / HOUR)} giờ trước`;
  return `${Math.floor(d / (24 * HOUR))} ngày trước`;
}
const dur = (sec) => {
  const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60);
  return d ? `${d} ngày ${h} giờ` : h ? `${h} giờ ${m} phút` : `${m} phút`;
};

/** RAM còn dùng được (byte) trên Linux, null nơi khác. meminfo để test thay được. */
export function memAvailable(meminfo = () => readFileSync('/proc/meminfo', 'utf8')) {
  try {
    const m = /^MemAvailable:\s+(\d+)\s*kB/m.exec(meminfo());
    return m ? Number(m[1]) * 1024 : null;
  } catch { return null; }
}

/** Thư mục chứa database (tuyệt đối) và thư mục sao lưu (BACKUP_DIR hoặc <data>/backup). */
function paths(ctx) {
  const db = ctx.config.dbPath === ':memory:' ? null : resolve(ctx.config.dbPath);
  const dataDir = db ? dirname(db) : null;
  const backupDir = process.env.BACKUP_DIR ? resolve(process.env.BACKUP_DIR) : dataDir ? join(dataDir, 'backup') : null;
  return { db, dataDir, backupDir };
}

/** Bản sao lưu mới nhất: {at, size, name} hoặc null. */
export function newestBackup(dir) {
  if (!dir) return null;
  let best = null;
  try {
    for (const name of readdirSync(dir)) {
      if (!name.endsWith('.sqlite')) continue;
      const st = statSync(join(dir, name));
      if (!best || st.mtimeMs > best.at) best = { at: st.mtimeMs, size: st.size, name };
    }
  } catch { /* chưa có thư mục */ }
  return best;
}

/** Kết quả tự gọi trang công khai lần gần nhất (job chạy mỗi 5 phút): {ok, at, ms, error} hoặc null. */
export function lastProbe(ctx) {
  const row = get(ctx.db, 'SELECT value FROM kv WHERE key = ?', PROBE_KEY);
  if (!row) return null;
  try { return JSON.parse(row.value); } catch { return null; }
}

/** Gọi <BASE_URL>/healthz như khách (qua Cloudflare) → lưu kết quả. fetchImpl để test thay được. */
export async function probePublic(ctx, { fetchImpl = fetch, timeoutMs = 8000 } = {}) {
  const started = Date.now();
  let res;
  try {
    const r = await fetchImpl(`${ctx.config.baseUrl}/healthz`, { signal: AbortSignal.timeout(timeoutMs), headers: { 'user-agent': 'tbq-tu-kiem' } });
    const body = (await r.text()).trim();
    res = r.ok && body === 'ok' ? { ok: true } : { ok: false, error: `HTTP ${r.status}${body && body.length < 60 ? ` "${body}"` : ''}` };
  } catch (err) {
    res = { ok: false, error: err?.name === 'TimeoutError' ? `quá ${timeoutMs / 1000} giây không trả lời` : String(err?.cause?.code || err?.message || err).slice(0, 120) };
  }
  res.at = ctx.now();
  res.ms = Date.now() - started;
  run(ctx.db, 'INSERT INTO kv(key, value, updated_at) VALUES(?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
    PROBE_KEY, JSON.stringify(res), res.at);
  return res;
}

const QUOTA_KEY = 'mail_quota';
export const QUOTA_EVERY = 30 * MIN;

/**
 * Hạn mức gửi thư trong ngày của Cloudflare Email Sending (mã đăng nhập + thư báo động dùng chung) → lưu kv.
 * Hết hạn mức = khách không nhận được mã đăng nhập. fetchImpl để test thay được. → {ok, limit, sent, resetsAt, at} | {ok:false, error, at}
 */
export async function fetchMailQuota(ctx, { fetchImpl = fetch } = {}) {
  const e = ctx.config.otp.email;
  let res;
  try {
    const r = await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(e.accountId)}/email/sending/limits`,
      { headers: { Authorization: `Bearer ${e.token}` }, signal: AbortSignal.timeout(10000) });
    const j = await r.json().catch(() => null);
    const limit = Number(j?.result?.quota?.value), sent = Number(j?.result?.usage?.sent);
    res = j?.success && limit > 0 && Number.isFinite(sent)
      ? { ok: true, limit, sent, resetsAt: Date.parse(j.result.usage.resets_at) || null }
      : { ok: false, error: `Cloudflare ${j?.errors?.[0]?.code ?? r.status}` };
  } catch (err) {
    res = { ok: false, error: String(err?.cause?.code || err?.message || err).slice(0, 120) };
  }
  res.at = ctx.now();
  run(ctx.db, 'INSERT INTO kv(key, value, updated_at) VALUES(?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
    QUOTA_KEY, JSON.stringify(res), res.at);
  return res;
}

export function lastMailQuota(ctx) {
  const row = get(ctx.db, 'SELECT value FROM kv WHERE key = ?', QUOTA_KEY);
  if (!row) return null;
  try { return JSON.parse(row.value); } catch { return null; }
}

/**
 * Các mục sức khoẻ. Đồng bộ, rẻ (đọc vài tệp + vài câu SQL) → dùng được cho số đỏ trên thanh bên mỗi trang.
 * deep: thêm kiểm tra toàn vẹn database (PRAGMA quick_check) — chỉ trên trang Máy chủ.
 */
export function hostChecks(ctx, { deep = false } = {}) {
  const now = ctx.now();
  const { db, dataDir, backupDir } = paths(ctx);
  const checks = [];
  const add = (key, label, level, value, hint = '') => checks.push({ key, label, level, value, hint });

  // 1. Khách có vào được trang không (qua Cloudflare, như khách thật).
  if (ctx.config.isProd) {
    const p = lastProbe(ctx);
    if (!p) add('public', 'Trang khách (qua internet)', 'warn', 'chưa kiểm lần nào', 'Đợi 5 phút hoặc bấm "Kiểm lại ngay".');
    else if (!p.ok) add('public', 'Trang khách (qua internet)', 'bad', `lỗi ${ago(p.at, now)}: ${p.error}`,
      'Khách có thể không vào được. Kiểm đường hầm Cloudflare: ssh vào máy chủ → systemctl status tbq-tunnel.');
    else if (now - p.at > 3 * PROBE_EVERY) add('public', 'Trang khách (qua internet)', 'warn', `lần kiểm cuối ${ago(p.at, now)}`, 'Việc tự kiểm đang không chạy — khởi động lại app.');
    else add('public', 'Trang khách (qua internet)', 'ok', `trả lời ${p.ms} ms · ${ago(p.at, now)}`);
  }

  // 2. Sao lưu.
  if (backupDir) {
    const b = newestBackup(backupDir);
    if (!b) add('backup', 'Sao lưu', 'bad', 'chưa có bản nào', 'Bật sao lưu tự động: systemctl enable --now tbq-backup.timer.');
    else if (now - b.at > BACKUP_MAX_AGE) add('backup', 'Sao lưu', 'bad', `bản mới nhất ${ago(b.at, now)}`, 'Sao lưu 05:30 không chạy — xem: journalctl -u tbq-backup.');
    else add('backup', 'Sao lưu', 'ok', `${ago(b.at, now)} · ${mb(b.size)}`);
  }

  // 2b. Bản sao lưu ngoài máy chủ (bộ canh Worker) — chỉ khi đã cấu hình OFFSITE_URL. Máy chủ mất hẳn thì đây là bản còn lại.
  if (ctx.config.offsite?.url) {
    const o = lastOffsite(ctx.db);
    if (!o) add('offsite', 'Sao lưu ngoài máy chủ', 'warn', 'chưa đẩy lần nào', 'Chạy thử: npm run day-sao-luu (trên máy chủ).');
    else if (!o.ok) add('offsite', 'Sao lưu ngoài máy chủ', 'bad', `lỗi ${ago(o.at, now)}: ${o.error}`, 'Kiểm OFFSITE_TOKEN (= BACKUP_TOKEN của Worker tbq-canh-ngoai) và Worker còn chạy không.');
    else if (now - o.at > BACKUP_MAX_AGE) add('offsite', 'Sao lưu ngoài máy chủ', 'bad', `bản mới nhất ${ago(o.at, now)}`, 'Việc đẩy sau sao lưu 05:30 không chạy — xem: journalctl -u tbq-backup.');
    else add('offsite', 'Sao lưu ngoài máy chủ', 'ok', `${o.name} · ${ago(o.at, now)} · ${mb(o.size)} (đã mã hoá)`);
  }

  // 3. Ổ đĩa (nơi chứa database + sao lưu). Đầy ổ = database không ghi được = khách không nhận được gì.
  if (dataDir) {
    try {
      const s = statfsSync(dataDir);
      const total = s.blocks * s.bsize, free = s.bavail * s.bsize, used = pct(total - free, total);
      const level = used >= 90 ? 'bad' : used >= 80 ? 'warn' : 'ok';
      add('disk', 'Ổ đĩa', level, `đã dùng ${used}% · còn ${gb(free)} / ${gb(total)}`, level === 'ok' ? '' : 'Xoá bớt bản sao lưu cũ hoặc nâng gói máy chủ.');
    } catch { /* hệ điều hành không hỗ trợ */ }
  }

  // 4. RAM cả máy. Chỉ đánh giá trên Linux (MemAvailable = còn dùng được, đã tính bộ đệm giải phóng được);
  //    macOS / Windows không có số tương đương (os.freemem bỏ qua bộ đệm → báo sai "sắp hết") → chỉ hiện.
  const total = os.totalmem(), avail = memAvailable(), rss = process.memoryUsage().rss;
  if (avail == null) add('ram', 'RAM', 'ok', `app dùng ${mb(rss)} · máy ${mb(total)}`);
  else {
    const freePct = pct(avail, total);
    const ramLevel = freePct < 5 ? 'bad' : freePct < 15 ? 'warn' : 'ok';
    add('ram', 'RAM', ramLevel, `còn dùng được ${freePct}% (${mb(avail)} / ${mb(total)}) · app dùng ${mb(rss)}`,
      ramLevel === 'ok' ? '' : 'Máy sắp hết RAM — khởi động lại app; nếu lặp lại thì nâng gói.');
  }

  // 5. Bot Canva (chỉ khi có công cụ dùng bot mời vào nhóm). Bot báo "còn sống" mỗi phút.
  const needBot = get(ctx.db, 'SELECT 1 AS x FROM tools WHERE auto_worker = 1 AND enabled = 1 LIMIT 1');
  if (needBot) {
    const seen = get(ctx.db, "SELECT MAX(updated_at) AS t FROM kv WHERE key LIKE 'worker:%'")?.t || 0;
    const quiet = seen ? now - seen : Infinity;
    const level = quiet > 30 * MIN ? 'bad' : quiet > 5 * MIN ? 'warn' : 'ok';
    add('bot', 'Bot Canva (máy Mac)', level, seen ? `liên lạc ${ago(seen, now)}` : 'chưa liên lạc lần nào',
      level === 'ok' ? '' : 'Máy Mac đang tắt / ngủ hoặc bot đã dừng → khách Canva phải chờ mời tay. Mở Mac, kiểm cửa sổ Chrome của bot.');
  }

  // 6. Gửi mã đăng nhập (email / SMS) trong 1 giờ qua.
  const otpFail = get(ctx.db, "SELECT COUNT(*) AS n, MAX(created_at) AS t FROM events WHERE type = 'otp_send_failed' AND created_at > ?", now - HOUR);
  add('otp', 'Gửi mã đăng nhập', otpFail.n ? 'bad' : 'ok', otpFail.n ? `${otpFail.n} lần lỗi trong 1 giờ (gần nhất ${ago(otpFail.t, now)})` : 'không lỗi trong 1 giờ qua',
    otpFail.n ? 'Khách không nhận được mã → xem sự kiện "Gửi OTP lỗi" ở Nhật ký.' : '');

  // 6b. Hạn mức gửi thư trong ngày (Cloudflare Email Sending) — chỉ khi đăng nhập bằng email. Hỏi Cloudflare mỗi 30 phút.
  if (ctx.config.otp.provider === 'email') {
    const q = lastMailQuota(ctx);
    if (q?.ok && now - q.at < 2 * HOUR) {
      const used = pct(q.sent, q.limit);
      const level = used >= 90 ? 'bad' : used >= 70 ? 'warn' : 'ok';
      const reset = q.resetsAt && q.resetsAt > now ? ` · làm mới sau ${dur(Math.round((q.resetsAt - now) / 1000))}` : '';
      add('mailquota', 'Hạn mức gửi thư hôm nay', level, `đã gửi ${q.sent} / ${q.limit} thư (${used}%)${reset}`,
        level === 'ok' ? '' : 'Hết hạn mức thì khách không nhận được mã đăng nhập. Xin nâng hạn mức Email Sending trên Cloudflare, hoặc tạm giảm suất / ngày của quán.');
    } else if (q && !q.ok) add('mailquota', 'Hạn mức gửi thư hôm nay', 'warn', `không hỏi được Cloudflare (${q.error})`, 'Token gửi thư có thể thiếu quyền xem hạn mức — gửi mã vẫn chạy, xem ở mục "Gửi mã đăng nhập".');
  }

  // 7. Database.
  if (db) {
    let size = 0, wal = 0;
    try { size = statSync(db).size; } catch { /* */ }
    try { wal = statSync(`${db}-wal`).size; } catch { /* */ }
    let level = 'ok', value = `${mb(size)}${wal ? ` + nhật ký ghi ${mb(wal)}` : ''}`, hint = '';
    if (deep) {
      const r = get(ctx.db, 'PRAGMA quick_check')?.quick_check;
      if (r !== 'ok') { level = 'bad'; value += ` · LỖI: ${String(r).slice(0, 80)}`; hint = 'Database hỏng — dừng app và khôi phục bản sao lưu gần nhất.'; } else value += ' · nguyên vẹn';
    }
    add('db', 'Database', level, value, hint);
  }
  return checks;
}

/** Thông tin để biết đang chạy gì, ở đâu (không đánh giá). */
export function hostFacts(ctx, version = '') {
  const cpus = os.cpus().length || 1;
  const [l1] = os.loadavg();
  return [
    ['Phiên bản', version || '—'],
    ['Máy', `${os.hostname()} · ${os.platform()} ${os.release()}`],
    ['CPU', `${cpus} nhân · tải ${l1.toFixed(2)} (${pct(l1, cpus)}%)`],
    ['Node', process.version],
    ['App chạy liền', dur(process.uptime())],
    ['Máy bật liền', dur(os.uptime())],
    ['Địa chỉ', ctx.config.baseUrl],
    ['Đăng nhập quản trị', ctx.config.adminTotpRaw ? 'mật khẩu + mã 2FA' : 'chỉ mật khẩu — nên bật 2FA: npm run bat-2fa-quan-tri'],
    ['Thư báo động', ctx.config.alertEmails?.length ? `gửi tới ${ctx.config.alertEmails.join(', ')}` : 'chưa bật (đặt ALERT_EMAILS trong .env)'],
  ];
}

/** Số mục đỏ (cho thanh bên + Việc hôm nay). */
export const hostBadCount = (ctx) => hostChecks(ctx).filter((c) => c.level === 'bad').length;
