// Mã phiếu + gia hạn. Thiết kế: docs/design-ma-phieu-workspace.md.
//  - once:    lấy mã đăng nhập 1 lần (phát ở quán).
//  - forever: lấy mã không giới hạn số lần, gắn SĐT đầu tiên dùng nó (nhân viên quán, khách quen).
//  - extend:  gia hạn slot đang chạy thêm N ngày, dùng 1 lần (chủ gửi qua Zalo khi khách mua thêm).
import crypto from 'node:crypto';
import { get, all, run, tx } from '../db/index.js';
import { logEvent } from '../lib/events.js';
import { DAY, MIN, localDayKey, startOfLocalDay } from '../lib/time.js';

// 31 ký tự dễ đọc: bỏ 0/O, 1/I/L.
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const CODE_LEN = 8;
export const VOUCHER_KINDS = { once: 'Lấy mã 1 lần', forever: 'Lấy mã vĩnh viễn', extend: 'Gia hạn' };
const MAX_BATCH = 500;
// Lô phiếu tự động: chạm thẻ / vé QS (tu-dong-…) và phiếu QS lấy qua API để hiện trên trang quán (qs-api-…).
export const AUTO_BATCH = 'tu-dong';
export const QS_API_BATCH = 'qs-api';

const no = (code, message) => ({ ok: false, code, message });

/** Chuẩn hoá chữ khách gõ: bỏ gạch / cách, chữ hoa. Ký tự dễ nhầm (O→0 không có trong bảng) giữ nguyên để báo sai. */
export const normalizeCode = (raw) => String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 32);
/** "ABCD2345" → "ABCD-2345" */
export const formatCode = (code) => (code.length === CODE_LEN ? `${code.slice(0, 4)}-${code.slice(4)}` : code);

function randomCode() {
  const bytes = crypto.randomBytes(CODE_LEN * 2);
  let s = '';
  // Loại bỏ lệch xác suất: chỉ nhận byte < 248 (= 31 × 8).
  for (const b of bytes) {
    if (b >= 248) continue;
    s += ALPHABET[b % ALPHABET.length];
    if (s.length === CODE_LEN) return s;
  }
  return randomCode();
}

/** Công cụ có cần mã phiếu khi lấy mã đăng nhập không. */
export const toolNeedsVoucher = (tool) => !!tool?.voucher_code;

/**
 * Tạo 1 lô mã. → {ok, batch, codes:[…]} | {ok:false, message}
 * tools: mảng slug (rỗng = mọi công cụ). expiresDays: hết hạn sau N ngày (null = không hết).
 */
export function createBatch(ctx, { kind, count, days = null, tools = [], cafeId = null, expiresDays = null, note = null, by = 'admin' }) {
  if (!Object.hasOwn(VOUCHER_KINDS, kind)) return no('bad_kind', 'Loại mã không đúng.');
  const n = Number.parseInt(count, 10);
  if (!(n >= 1 && n <= MAX_BATCH)) return no('bad_count', `Số mã từ 1 đến ${MAX_BATCH}.`);
  const d = kind === 'extend' ? Number.parseInt(days, 10) : null;
  if (kind === 'extend' && !(d >= 1 && d <= 30)) return no('bad_days', 'Mã gia hạn: số ngày từ 1 đến 30.');
  const slugs = [...new Set((tools || []).map((x) => String(x).trim().toLowerCase()).filter(Boolean))];
  for (const slug of slugs) if (!get(ctx.db, 'SELECT 1 FROM tools WHERE slug = ?', slug)) return no('bad_tool', `Không có công cụ "${slug}".`);
  if (cafeId != null && !get(ctx.db, 'SELECT 1 FROM cafes WHERE id = ?', cafeId)) return no('bad_cafe', 'Không có quán này.');
  const exp = expiresDays == null || expiresDays === '' ? null : Number.parseInt(expiresDays, 10);
  if (exp != null && !(exp >= 1 && exp <= 3650)) return no('bad_expiry', 'Hạn dùng từ 1 đến 3650 ngày (bỏ trống = không hết hạn).');
  const now = ctx.now();
  const batch = `${localDayKey(now, ctx.settings().timezoneOffsetMin)}-${crypto.randomBytes(2).toString('hex')}`;
  const codes = tx(ctx.db, () => {
    const out = [];
    while (out.length < n) {
      const code = randomCode();
      const r = run(ctx.db,
        `INSERT OR IGNORE INTO vouchers(code, kind, days, tools, cafe_id, batch, note, max_uses, status, expires_at, created_at)
         VALUES(?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
        code, kind, d, slugs.length ? slugs.join(',') : null, cafeId, batch, note ? String(note).slice(0, 200) : null,
        kind === 'forever' ? null : 1, exp ? now + exp * DAY : null, now);
      if (r.changes) out.push(code);
    }
    return out;
  });
  logEvent(ctx, { type: 'voucher_batch', data: { batch, kind, count: n, days: d, tools: slugs, by } });
  return { ok: true, batch, codes };
}

/** Mã vĩnh viễn đã gắn SĐT này, dùng được cho công cụ này (khách không phải gõ lại). */
export function boundVoucher(ctx, customerId, tool, cafeId = null) {
  const rows = all(ctx.db, "SELECT * FROM vouchers WHERE customer_id = ? AND kind = 'forever' AND status = 'active' ORDER BY id", customerId);
  return rows.find((v) => !voucherProblem(ctx, v, { customerId, tool, cafeId, purpose: 'code' })) || null;
}

/** Vì sao mã này không dùng được → null | {code, message}. */
function voucherProblem(ctx, v, { customerId, tool, cafeId, purpose }) {
  const now = ctx.now();
  if (!v) return { code: 'voucher_invalid', message: 'Mã phiếu không đúng. Bạn xem lại từng chữ nhé.' };
  if (v.status === 'void') return { code: 'voucher_void', message: 'Mã phiếu này đã bị huỷ.' };
  if (v.status === 'used' || (v.max_uses != null && v.uses >= v.max_uses)) return { code: 'voucher_used', message: 'Mã phiếu này đã được dùng rồi. Mỗi phiếu chỉ dùng 1 lần.' };
  if (v.expires_at != null && v.expires_at <= now) return { code: 'voucher_expired', message: 'Mã phiếu đã hết hạn.' };
  if (purpose === 'code' && v.kind === 'extend') return { code: 'voucher_wrong_kind', message: 'Đây là mã gia hạn — nhập ở ô "Dùng thêm" bên dưới nhé.' };
  if (purpose === 'extend' && v.kind !== 'extend') return { code: 'voucher_wrong_kind', message: 'Đây là mã lấy mã đăng nhập, không phải mã gia hạn.' };
  if (v.tools && tool && !v.tools.split(',').includes(tool.slug)) return { code: 'voucher_wrong_tool', message: `Mã phiếu này không dùng cho ${tool.name}.` };
  if (v.cafe_id != null && cafeId != null && v.cafe_id !== cafeId) return { code: 'voucher_wrong_cafe', message: 'Mã phiếu này của quán khác.' };
  if (v.kind === 'forever' && v.customer_id != null && v.customer_id !== customerId) return { code: 'voucher_other_phone', message: 'Mã phiếu này đã gắn với người khác.' };
  return null;
}

/** Phiếu mới không gõ tay: chèn 1 mã 1 lần. */
function insertOnce(ctx, { batch, cafeId = null, deviceId = null, ttlMin, note }) {
  const now = ctx.now();
  for (;;) {
    const code = randomCode();
    const r = run(ctx.db,
      `INSERT OR IGNORE INTO vouchers(code, kind, batch, note, cafe_id, device_id, max_uses, status, expires_at, created_at)
       VALUES(?, 'once', ?, ?, ?, ?, 1, 'active', ?, ?)`, code, batch, note, cafeId, deviceId, now + ttlMin * MIN, now);
    if (r.changes) return get(ctx.db, 'SELECT * FROM vouchers WHERE id = ?', r.lastInsertRowid);
  }
}

/** Phiếu tự động đang chờ dùng của máy này (chưa dùng, chưa hết hạn) | null. */
export const pendingAutoVoucher = (ctx, deviceId) => (deviceId ? get(ctx.db,
  "SELECT * FROM vouchers WHERE device_id = ? AND status = 'active' AND uses = 0 AND expires_at > ? ORDER BY id DESC LIMIT 1", deviceId, ctx.now()) || null : null);

/**
 * Khách vừa chạm thẻ NFC / quét mã QR trên bàn (vé đúng từ trang quán QS, hoặc thẻ NFC riêng của Tiệm) → tự cấp 1 phiếu lấy mã,
 * gắn với máy. Khách bấm "Lấy mã" không phải gõ gì. Chạm lại khi phiếu cũ chưa dùng thì không cấp thêm.
 * Tối đa autoVoucherPerDay phiếu / máy / ngày (0 = tắt). → voucher | null
 */
export function issueEntryVoucher(ctx, { deviceId, cafeId, source }) {
  const s = ctx.settings();
  const perDay = Number(s.autoVoucherPerDay) || 0;
  if (!deviceId || perDay <= 0) return null;
  return tx(ctx.db, () => {
    const pending = pendingAutoVoucher(ctx, deviceId);
    if (pending) return pending;
    const day = startOfLocalDay(ctx.now(), s.timezoneOffsetMin);
    const today = get(ctx.db, 'SELECT COUNT(*) AS n FROM vouchers WHERE device_id = ? AND created_at >= ?', deviceId, day).n;
    if (today >= perDay) return null;
    // Không gắn quán: khách nhận slot ở quán A, hôm sau ngồi quán B chạm thẻ vẫn lấy mã được.
    return insertOnce(ctx, { batch: `${AUTO_BATCH}-${localDayKey(ctx.now(), s.timezoneOffsetMin)}`, deviceId,
      ttlMin: Number(s.autoVoucherTtlMin) || 60, note: `Chạm thẻ (${source}) · quán #${cafeId}` });
  });
}

/** Phiếu tự động của máy dùng được cho lượt lấy mã này (còn hạn, chưa vượt autoVoucherPerDay phiếu tự động / SĐT / ngày). */
export function deviceVoucher(ctx, { deviceId, customerId, tool, cafeId }) {
  const v = pendingAutoVoucher(ctx, deviceId);
  if (!v || voucherProblem(ctx, v, { customerId, tool, cafeId, purpose: 'code' })) return null;
  const s = ctx.settings();
  const used = get(ctx.db,
    `SELECT COUNT(*) AS n FROM voucher_uses u JOIN vouchers v ON v.id = u.voucher_id
     WHERE u.customer_id = ? AND v.device_id IS NOT NULL AND u.created_at >= ?`, customerId, startOfLocalDay(ctx.now(), s.timezoneOffsetMin)).n;
  return used >= (Number(s.autoVoucherPerDay) || 0) ? null : v;
}

/**
 * API cho QS (trang quán hiện mã phiếu khi khách mở bằng thẻ / mã QR): cấp 1 phiếu 1 lần cho quán, hết hạn sau autoVoucherTtlMin phút.
 * Tối đa qsVoucherPerCafeDay phiếu / quán / ngày. → {ok, voucher} | {ok:false, code, message}
 */
export function issueQsVoucher(ctx, { cafe }) {
  const s = ctx.settings();
  return tx(ctx.db, () => {
    const day = startOfLocalDay(ctx.now(), s.timezoneOffsetMin);
    const n = get(ctx.db, 'SELECT COUNT(*) AS n FROM vouchers WHERE cafe_id = ? AND batch LIKE ? AND created_at >= ?', cafe.id, `${QS_API_BATCH}-%`, day).n;
    if (n >= (Number(s.qsVoucherPerCafeDay) || 0)) return no('cafe_limit', 'Quán đã hết phiếu hôm nay.');
    const v = insertOnce(ctx, { batch: `${QS_API_BATCH}-${localDayKey(ctx.now(), s.timezoneOffsetMin)}`, cafeId: cafe.id,
      ttlMin: Number(s.autoVoucherTtlMin) || 60, note: 'Trang quán QS (API)' });
    return { ok: true, voucher: v };
  });
}

/**
 * Tìm + kiểm mã khách gõ. Sai thì tính 1 lần đoán sai cho máy (quá voucherFailsPer10Min lần → tạm khoá, báo vàng).
 * → {ok:true, voucher} | {ok:false, code, message}
 */
export function checkVoucher(ctx, { raw, customerId, deviceId, tool, cafeId, purpose }) {
  const s = ctx.settings();
  const key = `vfail:${deviceId}`;
  const limit = Number(s.voucherFailsPer10Min) || 5;
  const failRow = get(ctx.db, 'SELECT count, reset_at FROM rate_limits WHERE key = ?', key);
  if (failRow && failRow.reset_at > ctx.now() && failRow.count >= limit) {
    const min = Math.ceil((failRow.reset_at - ctx.now()) / 60000);
    return no('voucher_locked', `Nhập sai mã phiếu nhiều lần. Thử lại sau ${min} phút nhé.`);
  }
  const code = normalizeCode(raw);
  if (!code) return no('need_voucher', 'Nhập mã phiếu (nhận ở quán) để lấy mã nhé.');
  const v = get(ctx.db, 'SELECT * FROM vouchers WHERE code = ?', code);
  const problem = voucherProblem(ctx, v, { customerId, tool, cafeId, purpose });
  if (!problem) return { ok: true, voucher: v };
  if (problem.code === 'voucher_invalid') {
    const now = ctx.now();
    const count = failRow && failRow.reset_at > now ? failRow.count + 1 : 1;
    run(ctx.db, 'INSERT INTO rate_limits(key, count, reset_at) VALUES(?, ?, ?) ON CONFLICT(key) DO UPDATE SET count = excluded.count, reset_at = excluded.reset_at',
      key, count, failRow && failRow.reset_at > now ? failRow.reset_at : now + 10 * 60000);
    if (count === limit) logEvent(ctx, { type: 'voucher_guessing', severity: 'yellow', customerId, deviceId, data: { fails: count } });
  }
  return no(problem.code, problem.message);
}

/** Ghi 1 lần dùng. Gọi trong transaction với việc mở mã / gia hạn. */
export function useVoucher(ctx, { voucher, customerId, slotId, deviceId, purpose }) {
  const now = ctx.now();
  const r = run(ctx.db,
    `UPDATE vouchers SET uses = uses + 1, last_used_at = ?,
       customer_id = CASE WHEN kind = 'forever' AND customer_id IS NULL THEN ? ELSE customer_id END,
       status = CASE WHEN max_uses IS NOT NULL AND uses + 1 >= max_uses THEN 'used' ELSE status END
     WHERE id = ? AND status = 'active' AND (max_uses IS NULL OR uses < max_uses)`, now, customerId, voucher.id);
  if (!r.changes) throw new Error('voucher_race');
  run(ctx.db, 'INSERT INTO voucher_uses(voucher_id, customer_id, slot_id, device_id, purpose, created_at) VALUES(?, ?, ?, ?, ?, ?)',
    voucher.id, customerId, slotId, deviceId, purpose, now);
  logEvent(ctx, { type: 'voucher_used', customerId, deviceId, slotId, data: { voucher: formatCode(voucher.code), kind: voucher.kind, purpose } });
}

export function voidVoucher(ctx, id, by = 'admin') {
  const r = run(ctx.db, "UPDATE vouchers SET status = 'void' WHERE id = ? AND status = 'active'", id);
  if (r.changes) logEvent(ctx, { type: 'voucher_void', data: { id, by } });
  return r.changes > 0;
}

/** Lô phiếu hệ thống tự cấp (chạm thẻ / trang quán QS) — không in, không huỷ cả lô. */
export const isAutoBatch = (batch) => String(batch).startsWith(`${AUTO_BATCH}-`) || String(batch).startsWith(`${QS_API_BATCH}-`);
export const autoBatchSql = (col = 'batch') => `(${col} LIKE '${AUTO_BATCH}-%' OR ${col} LIKE '${QS_API_BATCH}-%')`;

/** Huỷ mọi mã còn dùng được của 1 lô in (mất xấp phiếu). → số mã vừa huỷ. */
export function voidBatch(ctx, batch, by = 'admin') {
  if (!batch || isAutoBatch(batch)) return 0;
  const n = run(ctx.db, "UPDATE vouchers SET status = 'void' WHERE batch = ? AND status = 'active'", String(batch)).changes;
  if (n) logEvent(ctx, { type: 'voucher_void', data: { batch, count: n, by } });
  return n;
}

/** Gỡ SĐT khỏi mã vĩnh viễn (khách đổi số / nhân viên mới). */
export function unbindVoucher(ctx, id, by = 'admin') {
  const r = run(ctx.db, "UPDATE vouchers SET customer_id = NULL WHERE id = ? AND kind = 'forever' AND customer_id IS NOT NULL", id);
  if (r.changes) logEvent(ctx, { type: 'voucher_unbind', data: { id, by } });
  return r.changes > 0;
}

// ---------- Gia hạn ----------

/**
 * Hạn mới nếu gia hạn slot thêm `days` ngày. → {ok, until, capped} | {ok:false, code, message}
 * Công cụ hết lượt cùng giờ (6h): hạn cũ đã đúng 6h → cộng nguyên ngày vẫn đúng 6h.
 * Không vượt: hạn tài khoản (account_days / dùng 1 lần), và maxExtendDays ngày tính từ bây giờ.
 */
export function extensionUntil(ctx, slot, days) {
  const now = ctx.now();
  const tool = get(ctx.db, 'SELECT * FROM tools WHERE id = ?', slot.tool_id);
  if (slot.status !== 'active') return no('not_active', 'Chỉ gia hạn được slot đang dùng.');
  if (tool.login_type === 'redeem') return no('not_extendable', `${tool.name} là mã nhận quà, không gia hạn được.`);
  const d = Number.parseInt(days, 10);
  if (!(d >= 1 && d <= 30)) return no('bad_days', 'Số ngày gia hạn từ 1 đến 30.');
  let until = slot.expires_at + d * DAY;
  const maxDays = Number(ctx.settings().maxExtendDays) || 7;
  const limit = now + (maxDays + 1) * DAY;
  let capped = false;
  if (until > limit) { until = slot.expires_at + Math.max(0, Math.floor((limit - slot.expires_at) / DAY)) * DAY; capped = true; }
  const account = slot.account_id ? get(ctx.db, 'SELECT * FROM accounts WHERE id = ?', slot.account_id) : null;
  if (account && tool.account_days != null) {
    const end = account.created_at + tool.account_days * DAY;
    if (until > end) { until = end; capped = true; }
  }
  if (account && tool.reuse === 'once') {
    const end = account.created_at + tool.slot_hours * 3600000;
    if (until > end) { until = end; capped = true; }
  }
  if (until <= slot.expires_at) return no('cannot_extend', 'Tài khoản này sắp hết hạn nên không gia hạn thêm được. Nhắn Zalo Tiệm để đổi tài khoản khác nhé.');
  return { ok: true, until, capped, tool };
}

/**
 * Gia hạn slot đang chạy. Khách đã gia hạn: lấy mã không cần mã phiếu / không cần ở quán (code_free),
 * 6h sáng bot làm mới tài khoản nhưng giữ Project của khách.
 * → {ok, message, until} | {ok:false, code, message}
 */
export function extendSlot(ctx, slotId, { days, by = 'admin', voucher = null, customerId = null, deviceId = null }) {
  return tx(ctx.db, () => {
    const slot = get(ctx.db, 'SELECT * FROM slots WHERE id = ?', slotId);
    if (!slot) return no('not_found', 'Không tìm thấy slot.');
    if (customerId != null && slot.customer_id !== customerId) return no('not_found', 'Không tìm thấy slot.');
    const x = extensionUntil(ctx, slot, days);
    if (!x.ok) return x;
    if (voucher) useVoucher(ctx, { voucher, customerId: slot.customer_id, slotId, deviceId, purpose: 'extend' });
    const added = Math.round((x.until - slot.expires_at) / DAY);
    run(ctx.db, 'UPDATE slots SET expires_at = ?, extended_days = extended_days + ?, code_free = 1 WHERE id = ?', x.until, Math.max(1, added), slotId);
    run(ctx.db, "UPDATE extend_requests SET status = 'done', done_at = ?, done_by = ? WHERE slot_id = ? AND status = 'pending'", ctx.now(), by, slotId);
    logEvent(ctx, { type: 'slot_extended', customerId: slot.customer_id, accountId: slot.account_id, slotId,
      data: { days: Number(days), until: x.until, capped: x.capped, by, voucher: voucher ? formatCode(voucher.code) : undefined } });
    return { ok: true, until: x.until, capped: x.capped,
      message: x.capped ? 'Đã gia hạn tới mức tối đa tài khoản cho phép.' : `Đã gia hạn thêm ${days} ngày.` };
  });
}

/** Khách xin gia hạn (chưa có mã) → chủ xem ở trang Gia hạn. Mỗi slot 1 yêu cầu đang chờ. */
export function requestExtension(ctx, { customerId, days }) {
  const slot = get(ctx.db, "SELECT * FROM slots WHERE customer_id = ? AND status = 'active' ORDER BY id DESC LIMIT 1", customerId);
  if (!slot) return no('no_slot', 'Bạn chưa có slot nào đang dùng.');
  const d = Math.min(30, Math.max(1, Number.parseInt(days, 10) || 1));
  const x = extensionUntil(ctx, slot, d);
  if (!x.ok) return x;
  const pending = get(ctx.db, "SELECT id FROM extend_requests WHERE slot_id = ? AND status = 'pending'", slot.id);
  if (pending) run(ctx.db, 'UPDATE extend_requests SET days = ? WHERE id = ?', d, pending.id);
  else run(ctx.db, 'INSERT INTO extend_requests(slot_id, customer_id, days, created_at) VALUES(?, ?, ?, ?)', slot.id, customerId, d, ctx.now());
  if (!pending) logEvent(ctx, { type: 'extend_requested', severity: 'yellow', customerId, slotId: slot.id, accountId: slot.account_id, data: { days: d } });
  return { ok: true, message: 'Đã gửi yêu cầu. Nhắn Zalo Tiệm để thanh toán — Tiệm gia hạn xong, trang này tự cập nhật.' };
}

/** Khách nhập mã gia hạn. */
export function redeemExtension(ctx, { customer, deviceId, raw }) {
  const slot = get(ctx.db, "SELECT * FROM slots WHERE customer_id = ? AND status = 'active' ORDER BY id DESC LIMIT 1", customer.id);
  if (!slot) return no('no_slot', 'Bạn chưa có slot nào đang dùng.');
  if (slot.device_id !== deviceId) return no('second_device', 'Gia hạn trên đúng máy đã nhận slot nhé.');
  const tool = get(ctx.db, 'SELECT * FROM tools WHERE id = ?', slot.tool_id);
  const c = checkVoucher(ctx, { raw, customerId: customer.id, deviceId, tool, cafeId: slot.cafe_id, purpose: 'extend' });
  if (!c.ok) return c;
  return extendSlot(ctx, slot.id, { days: c.voucher.days, by: 'voucher', voucher: c.voucher, deviceId });
}
