// Kiểm tra trước khi mở bán — chạy trên máy chủ, cùng .env với app:
//   npm run kiem-tra              → cấu hình, khoá, database, gói công cụ, kho, quán, bot Canva, thư, sao lưu (không gửi gì ra ngoài)
//   npm run kiem-tra -- --mang    → thêm: mở BASE_URL/healthz qua HTTPS (tên miền + chứng chỉ), hỏi số dư eSMS (chỉ đọc, không gửi tin)
// ✘ = chưa được mở bán · ⚠ = nên xem lại · ✓ = ổn. Thoát mã 1 nếu có ✘.
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig, validateConfig } from '../src/config.js';
import { openDb, get, all } from '../src/db/index.js';
import { createCtx } from '../src/ctx.js';
import { decrypt } from '../src/lib/crypto.js';
import { toolAvailability } from '../src/domain/quota.js';
import { watchedAccounts, queryHub } from '../src/domain/mail-route.js';
import { PILOT_TOOLS, PILOT_STOCK } from './pilot.js';

const net = process.argv.includes('--mang');
const rows = [];
const ok = (s) => rows.push(['✓', s]);
const warn = (s) => rows.push(['⚠', s]);
const bad = (s) => rows.push(['✘', s]);
const MIN = 60e3;
const ago = (t) => (t ? `${Math.round((Date.now() - t) / MIN)} phút trước` : 'chưa bao giờ');

// ---------- Máy & cấu hình ----------
const [maj, min] = process.versions.node.split('.').map(Number);
if (maj > 22 || (maj === 22 && min >= 13)) ok(`Node ${process.versions.node}`);
else bad(`Node ${process.versions.node} — cần 22.13 trở lên`);

const config = loadConfig();
if (!config.isProd) bad('NODE_ENV chưa là production (.env: NODE_ENV=production)');
const errors = validateConfig(config);
for (const e of errors) bad(e);
if (config.isProd && !errors.length) ok(`Cấu hình production đủ · ${config.baseUrl}`);
if (config.isProd && config.basePath !== '/colap') warn(`App chạy ở "${config.basePath || '/'}" — đã thống nhất với Tài là /colap (nút trên trang quán QS trỏ vào đó)`);
if (config.otp.provider === 'none') bad('Chưa có kênh gửi mã (OTP_PROVIDER=none) — khách chưa nhận được công cụ. Gửi mã qua email: OTP_PROVIDER=email + CF_ACCOUNT_ID, CF_EMAIL_TOKEN, MAIL_FROM');
if (config.otp.provider === 'email') ok(`Gửi mã qua email từ ${config.otp.email.from || '(chưa có MAIL_FROM)'} — thử thật: npm run otp-test -- <email của bạn>`);
if (/^(admin|password|123)/i.test(config.adminPassword)) bad('ADMIN_PASSWORD quá dễ đoán');

// ---------- Database ----------
if (!existsSync(config.dbPath)) {
  bad(`Chưa có database ở ${config.dbPath} — chạy "npm run seed" rồi "npm run pilot"`);
  finish();
}
const db = openDb(config.dbPath);
const ctx = createCtx({ config, db, log: () => {} });
ok(`Database ${config.dbPath} (${(statSync(config.dbPath).size / 1024).toFixed(0)} KB)`);

// DATA_KEY phải mở được mật khẩu đang lưu — sai khoá thì khách nhận mật khẩu hỏng.
const enc = all(db, "SELECT login_email, password_enc FROM accounts WHERE password_enc IS NOT NULL AND status != 'retired' ORDER BY id DESC LIMIT 5");
if (enc.length) {
  const broken = enc.filter((a) => { try { decrypt(a.password_enc, config.dataKey); return false; } catch { return true; } });
  if (broken.length) bad(`DATA_KEY không mở được mật khẩu trong kho (${broken.map((a) => a.login_email).join(', ')}) — khoá trong .env khác khoá lúc nhập kho`);
  else ok('DATA_KEY mở được mật khẩu trong kho');
}

// ---------- Gói công cụ ----------
const tools = all(db, 'SELECT * FROM tools WHERE enabled = 1 ORDER BY sort, id');
const missing = PILOT_TOOLS.filter((p) => !tools.some((t) => t.slug === p.slug));
const stale = PILOT_TOOLS.filter((p) => tools.some((t) => t.slug === p.slug
  && (t.slot_hours !== p.slot_hours || (t.end_hour ?? null) !== (p.end_hour ?? null) || t.holders_default !== p.holders_default)));
if (!tools.length) bad('Chưa bật công cụ nào — chạy "npm run pilot"');
else if (missing.length || stale.length) warn(`Gói công cụ khác gói chuẩn (${[...missing, ...stale].map((p) => p.name).join(', ')}) — chạy "npm run pilot" nếu không cố ý sửa`);
else ok(`Gói ${tools.length} công cụ: ${tools.map((t) => t.name).join(', ')}`);

// ---------- Kho ----------
const avail = toolAvailability(ctx);
const empty = avail.filter((a) => a.free <= 0);
for (const a of avail) {
  const line = `${a.tool.name}: còn giao được ${a.free}${a.reserved ? ` (+${a.reserved} dự phòng cho ${a.tool.end_hour ?? 6}h sáng)` : ''}`;
  if (a.free > 0) ok(line); else warn(`${line} — khách sẽ thấy "Tạm hết"`);
  const waiting = get(db, "SELECT 1 FROM accounts WHERE tool_id = ? AND status IN ('needs_rotation', 'quarantined') LIMIT 1", a.tool.id);
  const plan = PILOT_STOCK[a.tool.slug];
  if (plan) {
    // Tài khoản còn dùng được (chưa bỏ, chưa quá hạn tự hết) — kể cả đang có người / đang chờ đăng xuất.
    const have = get(db, `SELECT COUNT(*) AS n FROM accounts WHERE tool_id = ? AND status IN ('ready', 'needs_rotation')
      AND (? IS NULL OR created_at > ?)`, a.tool.id, a.tool.account_days, Date.now() - (a.tool.account_days ?? 0) * 86400e3).n;
    if (have < plan.accounts) warn(`${a.tool.name}: kho có ${have} tài khoản, kho chuẩn ${plan.accounts} (${plan.note})`);
    else ok(`${a.tool.name}: ${have} tài khoản / kho chuẩn ${plan.accounts} (${plan.note})`);
  }
  if (a.expiring) warn(`${a.tool.name}: ${a.expiring} tài khoản tự hết hạn trong 24 giờ tới — chuẩn bị tài khoản mới, nhập kho ngay ngày tạo`);
  if (a.tool.reserve_account && !a.reserved && !waiting) warn(`${a.tool.name}: chưa có tài khoản dự phòng cho ${a.tool.end_hour ?? 6}h sáng — cần ít nhất 2 tài khoản, 1 cái không ai dùng`);
}
if (avail.length && empty.length === avail.length) bad('Kho trống hết — nhập kho ở Quản trị › Kho tài khoản trước khi mở');

// ---------- Canva: bot trên máy Mac ----------
const canva = tools.find((t) => t.login_type === 'team_invite');
if (canva) {
  if (!config.workerToken) bad('Canva đang bật nhưng thiếu WORKER_TOKEN — bot không lấy được việc mời / gỡ');
  const beat = get(db, "SELECT MAX(updated_at) AS t FROM kv WHERE key LIKE 'worker:%'")?.t;
  if (beat && Date.now() - beat < 10 * MIN) ok(`Bot Canva liên lạc ${ago(beat)}`);
  else warn(`Bot Canva liên lạc lần cuối: ${ago(beat)} — mở máy Mac, chạy "npm run canva-bot -- --nhom <email chủ nhóm>" (tắt bot thì khách Canva phải chờ)`);
}

// ---------- Quán ----------
const cafes = all(db, "SELECT id, name, qs_slug, daily_quota FROM cafes WHERE status = 'active'");
if (!cafes.length) bad('Chưa có quán nào đang chạy — Quản trị › Quán › Thêm quán');
for (const c of cafes) {
  if (c.qs_slug) { ok(`Quán "${c.name}": qua trang quán QS (mã ${c.qs_slug}), ${c.daily_quota} suất/ngày`); continue; }
  const cards = all(db, "SELECT nfc_uid, last_counter FROM cards WHERE cafe_id = ? AND kind = 'nfc' AND status = 'active'", c.id);
  if (!cards.length) bad(`Quán "${c.name}": không có mã quán QS và chưa có thẻ NFC — khách không có lối vào`);
  else if (!cards.some((k) => k.nfc_uid || k.last_counter != null)) warn(`Quán "${c.name}": ${cards.length} thẻ NFC nhưng chưa thẻ nào được chạm thử (chạm thử từng chip sau khi ghi)`);
  else ok(`Quán "${c.name}": ${cards.length} thẻ NFC, ${c.daily_quota} suất/ngày`);
}

// ---------- Thư mã (Cloudflare Email Worker) ----------
const needMail = tools.some((t) => t.login_type === 'email_code' || t.mail_code);
const lastMail = get(db, 'SELECT MAX(received_at) AS t FROM mails')?.t;
if (needMail && !lastMail) warn('Chưa nhận thư nào qua Cloudflare — gửi thử 1 thư tới 1 địa chỉ kho, xem Quản trị › Thư (Claude / Adobe cần đường này)');
else if (needMail) ok(`Thư mã: thư gần nhất ${ago(lastMail)}`);
// Thư về nhầm hộp thư catch-all (địa chỉ kho thiếu quy tắc riêng trên Cloudflare)
if (needMail) {
  const watched = watchedAccounts(ctx);
  const showBad = (list) => bad(`Thư mã của ${list.join(', ')} đang về NHẦM hộp thư ma.tiembanquyen.site — thêm quy tắc riêng "địa chỉ → Worker tbq-mail" trên Cloudflare Email Routing`);
  if (!config.hubWatch.url || !config.hubWatch.token) {
    warn('Chưa bật kiểm thư về nhầm hộp thư (HUB_WATCH_URL / HUB_WATCH_TOKEN) — địa chỉ kho quên tạo quy tắc Cloudflare thì khách không lấy được mã mà không ai biết');
  } else if (net) {
    try {
      const found = (await queryHub(config, watched.map((a) => a.email))).filter((x) => x.messages > 0).map((x) => x.email);
      if (found.length) showBad(found); else ok(`Thư về đúng chỗ: ${watched.length} địa chỉ kho không có thư nào rơi vào hộp thư chung`);
    } catch (err) { bad(`Không hỏi được hộp thư ma.tiembanquyen.site: ${err.message}`); }
  } else {
    const st = JSON.parse(get(db, "SELECT value FROM kv WHERE key = 'mailroute_status'")?.value || 'null');
    if (!st) warn('Kiểm thư về nhầm hộp thư: app chưa chạy lần nào (chạy app, hoặc "npm run kiem-tra -- --mang")');
    else if (!st.ok) warn(`Kiểm thư về nhầm hộp thư lỗi ${ago(st.at)}: ${st.error}`);
    else if (st.bad?.length) showBad(st.bad);
    else ok(`Thư về đúng chỗ (kiểm ${ago(st.at)}, ${st.checked} địa chỉ kho)`);
  }
}

// ---------- Việc tay tồn ----------
const oldTasks = get(db, "SELECT COUNT(*) AS n FROM rotation_tasks WHERE status = 'todo' AND created_at < ?", Date.now() - 2 * 60 * MIN).n;
if (oldTasks) warn(`${oldTasks} việc tay chờ quá 2 giờ — tài khoản đó chưa giao lại được (Quản trị › Việc tay)`);

// ---------- Sao lưu ----------
const bdir = process.env.BACKUP_DIR || './data/backup';
let newest = 0;
try { for (const f of readdirSync(bdir)) if (f.endsWith('.sqlite')) newest = Math.max(newest, statSync(join(bdir, f)).mtimeMs); } catch { /* chưa có thư mục */ }
if (newest && Date.now() - newest < 26 * 60 * MIN) ok(`Sao lưu gần nhất ${ago(newest)} (${bdir})`);
else warn(`Chưa thấy bản sao lưu trong 26 giờ ở ${bdir} — bật deploy/tbq-backup.timer (hoặc đặt BACKUP_DIR nếu sao lưu chỗ khác)`);

// ---------- Mạng (tuỳ chọn) ----------
if (net) {
  try {
    const r = await fetch(`${config.baseUrl}/healthz`, { signal: AbortSignal.timeout(10000) });
    const text = (await r.text()).trim();
    if (r.ok && /ok/i.test(text)) ok(`${config.baseUrl}/healthz trả "${text}" qua HTTPS`);
    else bad(`${config.baseUrl}/healthz trả ${r.status} — kiểm tra Caddy / systemd`);
  } catch (err) {
    bad(`Không mở được ${config.baseUrl}/healthz (${err.cause?.code || err.message}) — kiểm tra DNS, Caddy, chứng chỉ HTTPS`);
  }
  if (config.otp.provider === 'email' && config.otp.email.token) {
    // Chỉ đọc hạn mức gửi, không gửi thư. Token chỉ có quyền gửi thì có thể bị từ chối ở đây → chỉ cảnh báo.
    try {
      const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(config.otp.email.accountId)}/email/sending/limits`,
        { headers: { Authorization: `Bearer ${config.otp.email.token}` }, signal: AbortSignal.timeout(10000) });
      const j = await r.json().catch(() => null);
      if (j?.success) ok(`Cloudflare Email Sending trả lời được (hạn mức: ${JSON.stringify(j.result).slice(0, 160)})`);
      else warn(`Cloudflare chưa cho xem hạn mức gửi thư (${j?.errors?.[0]?.code ?? r.status}) — thử gửi thật: npm run otp-test -- <email của bạn>`);
    } catch (err) {
      warn(`Không hỏi được Cloudflare Email Sending (${err.message}) — thử "npm run otp-test -- <email của bạn>"`);
    }
  }
  if (config.otp.esms.apiKey) {
    try {
      const r = await fetch(`https://rest.esms.vn/MainService.svc/json/GetBalance/${encodeURIComponent(config.otp.esms.apiKey)}/${encodeURIComponent(config.otp.esms.secretKey)}`,
        { signal: AbortSignal.timeout(10000) });
      const j = await r.json();
      if (String(j.CodeResponse) === '100') {
        const bal = Number(j.Balance) || 0;
        if (bal < 50000) warn(`Số dư eSMS còn ${bal.toLocaleString('vi-VN')}đ — nạp thêm (hết tiền thì khách không nhận được mã)`);
        else ok(`Số dư eSMS ${bal.toLocaleString('vi-VN')}đ`);
      } else bad(`eSMS từ chối khoá (mã ${j.CodeResponse}) — kiểm tra ESMS_API_KEY / ESMS_SECRET_KEY`);
    } catch (err) {
      warn(`Không hỏi được số dư eSMS (${err.message}) — thử "npm run otp-test -- <SĐT của bạn>"`);
    }
  }
}

finish();

function finish() {
  for (const [mark, text] of rows) console.log(`${mark} ${text}`);
  const nBad = rows.filter((r) => r[0] === '✘').length;
  const nWarn = rows.filter((r) => r[0] === '⚠').length;
  console.log(nBad ? `\n✘ Chưa sẵn sàng mở bán: ${nBad} mục phải sửa${nWarn ? `, ${nWarn} mục nên xem` : ''}.`
    : `\n✓ Sẵn sàng mở bán${nWarn ? ` (${nWarn} mục nên xem)` : ''}.${net ? '' : ' Trên máy chủ thật chạy thêm: npm run kiem-tra -- --mang'}`);
  process.exit(nBad ? 1 : 0);
}
