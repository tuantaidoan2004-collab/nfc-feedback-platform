// Thư báo động ra ngoài: chủ không phải mở trang quản trị mới biết có chuyện (đánh giá thương mại 09/10/2026, P0-1).
// Gom (1) sự kiện mức đỏ mới (hết kho, nhiều vé giả, bot không làm xong…) và (2) mục trang Máy chủ vừa chuyển đỏ / vừa ổn lại
// thành 1 thư gửi ALERT_EMAILS. Thư đi thẳng qua API Cloudflare (không qua đường hầm) → đường hầm chết vẫn báo được.
// Máy chủ tắt hẳn thì không gửi được — phần đó do bộ canh bên ngoài (extras/canh-ngoai-worker.js) lo.
// Chống tràn: tối đa 1 thư / ALERT_GAP và ALERT_DAY_CAP thư / ngày (hạn mức 200 thư/ngày dùng chung với mã đăng nhập của khách).
import { get, all, run } from '../db/index.js';
import { hit } from '../lib/ratelimit.js';
import { logEvent } from '../lib/events.js';
import { MIN, HOUR, startOfLocalDay, fmtLocal } from '../lib/time.js';
import { hostChecks } from './may-chu.js';
import { sendCfEmail } from '../services/otp.js';
import { EVENT_LABEL, eventSummary } from '../views/admin.js';

export const ALERT_GAP = 15 * MIN;
export const ALERT_DAY_CAP = 12;
const MAX_LINES = 30;

const kvGet = (ctx, key) => get(ctx.db, 'SELECT value FROM kv WHERE key = ?', key)?.value ?? null;
const kvSet = (ctx, key, value) => run(ctx.db,
  'INSERT INTO kv(key, value, updated_at) VALUES(?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
  key, String(value), ctx.now());

/**
 * Có gì mới cần báo kể từ thư trước. Lần đầu chạy: chỉ ghi mốc (không gửi lại sự kiện cũ trong database).
 * → {events, newBad, recovered, badKeys, maxId}
 */
export function pendingAlerts(ctx) {
  const maxId = get(ctx.db, 'SELECT COALESCE(MAX(id), 0) AS m FROM events').m;
  const cursor = kvGet(ctx, 'alert_event_id');
  if (cursor == null) kvSet(ctx, 'alert_event_id', maxId);
  const events = cursor == null ? [] : all(ctx.db,
    `SELECT e.id, e.type, e.data, e.created_at, f.name AS cafe FROM events e LEFT JOIN cafes f ON f.id = e.cafe_id
     WHERE e.severity = 'red' AND e.id > ? ORDER BY e.id LIMIT ?`, Number(cursor), MAX_LINES + 1);
  const checks = hostChecks(ctx);
  const bad = checks.filter((c) => c.level === 'bad');
  let prev = [];
  try { prev = JSON.parse(kvGet(ctx, 'alert_host_bad') || '[]'); } catch { prev = []; }
  const newBad = bad.filter((c) => !prev.includes(c.key));
  const recovered = prev.filter((k) => !bad.some((c) => c.key === k)).map((k) => checks.find((c) => c.key === k) || { key: k, label: k });
  return { events, newBad, recovered, badKeys: bad.map((c) => c.key), maxId: events.length ? events.at(-1).id : Number(cursor ?? maxId) };
}

/** Nội dung thư (chữ thường, không ảnh / link lạ — thư báo động phải vào hộp thư chính, không vào spam). */
export function alertMail(ctx, { events, newBad, recovered }) {
  const off = ctx.settings().timezoneOffsetMin;
  const admin = `${ctx.config.baseUrl}/admin`;
  const lines = [];
  if (newBad.length) {
    lines.push('MÁY CHỦ CẦN XỬ LÝ:');
    for (const c of newBad) lines.push(`- ${c.label}: ${c.value}${c.hint ? `\n  → ${c.hint}` : ''}`);
    lines.push(`  Xem: ${admin}/may-chu`, '');
  }
  if (events.length) {
    lines.push('SỰ KIỆN ĐỎ:');
    for (const e of events.slice(0, MAX_LINES)) {
      const what = eventSummary(e.data, e.type);
      lines.push(`- ${fmtLocal(e.created_at, off)} · ${EVENT_LABEL[e.type] || e.type}${e.cafe ? ` · ${e.cafe}` : ''}${what ? ` — ${what}` : ''}`);
    }
    if (events.length > MAX_LINES) lines.push('- … còn nữa, xem ở trang Theo dõi.');
    lines.push(`  Xem: ${admin}`, '');
  }
  if (recovered.length) {
    lines.push('ĐÃ ỔN LẠI:');
    for (const c of recovered) lines.push(`- ${c.label}${c.value ? `: ${c.value}` : ''}`);
    lines.push('');
  }
  lines.push(`Thư tự động từ máy chủ TBQ. Tối đa 1 thư / ${ALERT_GAP / MIN} phút, ${ALERT_DAY_CAP} thư / ngày.`);
  const heads = [...newBad.map((c) => c.label), ...[...new Set(events.map((e) => EVENT_LABEL[e.type] || e.type))]];
  const subject = heads.length
    ? `[TBQ] Cần xử lý: ${heads.slice(0, 3).join(', ')}${heads.length > 3 ? ` +${heads.length - 3}` : ''}`
    : `[TBQ] Đã ổn lại: ${recovered.map((c) => c.label).join(', ')}`;
  return { subject: subject.slice(0, 160), text: lines.join('\n') };
}

/**
 * Gửi thư báo động nếu có chuyện mới. Gửi lỗi / đang chờ giãn cách / quá số thư ngày → giữ nguyên mốc, lần sau gửi gộp.
 * send để test thay được. → {sent:n} | {skipped:'off'|'nothing'|'gap'|'day_cap'|'failed'}
 */
export async function sendAlerts(ctx, { send = sendCfEmail } = {}) {
  const to = ctx.config.alertEmails || [];
  if (!to.length) return { skipped: 'off' };
  const p = pendingAlerts(ctx);
  if (!p.events.length && !p.newBad.length && !p.recovered.length) return { skipped: 'nothing' };
  const now = ctx.now();
  if (now - Number(kvGet(ctx, 'alert_sent_at') || 0) < ALERT_GAP) return { skipped: 'gap' };
  const day = startOfLocalDay(now, ctx.settings().timezoneOffsetMin);
  if (!hit(ctx, `alertmail:${day}`, ALERT_DAY_CAP, 26 * HOUR).ok) return { skipped: 'day_cap' };
  const mail = alertMail(ctx, p);
  let sent = 0;
  const errors = [];
  for (const addr of to) {
    const r = await send(ctx, { to: addr, ...mail });
    if (r?.ok) sent++; else errors.push(`${addr}: ${r?.error || 'lỗi'}`);
  }
  if (!sent) {
    ctx.log('warn', 'không gửi được thư báo động', { errors });
    return { skipped: 'failed', errors };
  }
  kvSet(ctx, 'alert_event_id', p.maxId);
  kvSet(ctx, 'alert_host_bad', JSON.stringify(p.badKeys));
  kvSet(ctx, 'alert_sent_at', now);
  logEvent(ctx, { type: 'alert_mail_sent', data: { events: p.events.length, bad: p.newBad.map((c) => c.key), recovered: p.recovered.map((c) => c.key), error: errors.length ? errors.join('; ') : undefined } });
  return { sent, subject: mail.subject };
}
