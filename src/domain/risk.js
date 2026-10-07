// Điểm rủi ro, khoá khách/máy/thẻ, chấm điểm khi nhận slot.
import { get, all, run, tx } from '../db/index.js';
import { logEvent } from '../lib/events.js';
import { localHour, inHourRange, DAY } from '../lib/time.js';
import { endSlot } from './claims.js';

/** Điểm sau khi giảm dần theo số ngày kể từ lần cập nhật (thuần, không đọc DB). */
export function decayed(points, updatedAt, nowMs, perDay) {
  if (!points) return 0;
  if (!updatedAt) return points;
  const days = Math.max(0, (nowMs - updatedAt) / DAY);
  return Math.max(0, Math.round(points - days * perDay));
}

export const customerRisk = (ctx, c) => decayed(c?.risk || 0, c?.risk_updated_at, ctx.now(), ctx.settings().riskDecayPerDay);
export const deviceRisk = (ctx, d) => decayed(d?.risk || 0, d?.risk_updated_at, ctx.now(), ctx.settings().riskDecayPerDay);

/** Cộng điểm rủi ro (đã áp giảm dần) cho khách và/hoặc máy. */
export function addRisk(ctx, { customerId, deviceId, points, reason }) {
  const now = ctx.now();
  if (customerId) {
    const c = get(ctx.db, 'SELECT risk, risk_updated_at FROM customers WHERE id = ?', customerId);
    if (c) run(ctx.db, 'UPDATE customers SET risk = ?, risk_updated_at = ? WHERE id = ?', customerRisk(ctx, c) + points, now, customerId);
  }
  if (deviceId) {
    const d = get(ctx.db, 'SELECT risk, risk_updated_at FROM devices WHERE id = ?', deviceId);
    if (d) run(ctx.db, 'UPDATE devices SET risk = ?, risk_updated_at = ? WHERE id = ?', deviceRisk(ctx, d) + points, now, deviceId);
  }
  logEvent(ctx, { type: 'risk_added', customerId, deviceId, data: { points, reason } });
}

export function isCustomerLocked(customer, nowMs) {
  return customer?.status === 'locked' && (customer.locked_until == null || customer.locked_until > nowMs);
}

/** Ghi 1 lỗi vi phạm. Thang: 1 = nhắc; 2 = khoá 7 ngày; từ 3 = khoá vĩnh viễn. */
export function addStrike(ctx, customerId, reason, by = 'admin') {
  return tx(ctx.db, () => {
    const c = get(ctx.db, 'SELECT strikes FROM customers WHERE id = ?', customerId);
    if (!c) return { strikes: 0, locked: false, until: null };
    const strikes = c.strikes + 1;
    run(ctx.db, 'UPDATE customers SET strikes = ? WHERE id = ?', strikes, customerId);
    logEvent(ctx, { type: 'strike', severity: 'yellow', customerId, data: { strikes, reason, by } });
    if (strikes === 2) {
      const until = ctx.now() + 7 * DAY;
      lockCustomer(ctx, customerId, { reason: `Vi phạm lần 2: ${reason}`, untilMs: until, by });
      return { strikes, locked: true, until };
    }
    if (strikes >= 3) {
      lockCustomer(ctx, customerId, { reason: `Vi phạm lần ${strikes}: ${reason}`, untilMs: null, by });
      return { strikes, locked: true, until: null };
    }
    return { strikes, locked: false, until: null };
  });
}

/** Khoá khách (untilMs=null → vĩnh viễn) và thu hồi mọi slot đang dùng/đang chờ. */
export function lockCustomer(ctx, customerId, { reason, untilMs = null, by = 'system' } = {}) {
  return tx(ctx.db, () => {
    run(ctx.db, "UPDATE customers SET status = 'locked', lock_reason = ?, locked_until = ? WHERE id = ?", reason || null, untilMs, customerId);
    const slots = all(ctx.db, "SELECT id FROM slots WHERE customer_id = ? AND status IN ('active', 'pending_approval', 'pending_invite')", customerId);
    for (const s of slots) endSlot(ctx, s.id, { status: 'revoked', reason: 'customer_locked', by });
    // Phiên đăng nhập bị xoá để máy đang dùng không tiếp tục lấy mã.
    run(ctx.db, 'DELETE FROM sessions WHERE customer_id = ?', customerId);
    logEvent(ctx, { type: 'customer_locked', severity: 'yellow', customerId, data: { reason, untilMs, by, revokedSlots: slots.length } });
    return { revokedSlots: slots.length };
  });
}

export function unlockCustomer(ctx, customerId, by = 'admin') {
  run(ctx.db, "UPDATE customers SET status = 'active', lock_reason = NULL, locked_until = NULL WHERE id = ?", customerId);
  logEvent(ctx, { type: 'customer_unlocked', customerId, data: { by } });
}

export function lockDevice(ctx, deviceId, reason, by = 'system') {
  if (!deviceId) return;
  run(ctx.db, "UPDATE devices SET status = 'locked' WHERE id = ?", deviceId);
  logEvent(ctx, { type: 'device_locked', severity: 'yellow', deviceId, data: { reason, by } });
}

export function unlockDevice(ctx, deviceId, by = 'admin') {
  run(ctx.db, "UPDATE devices SET status = 'active' WHERE id = ?", deviceId);
  logEvent(ctx, { type: 'device_unlocked', deviceId, data: { by } });
}

// Chỉ thẻ NFC riêng của Tiệm. Lối vào QS ẩn là của cả quán — muốn dừng quán thì "Tạm dừng" quán. → true nếu đã đổi.
export function lockCard(ctx, cardId, reason, by = 'admin') {
  const ok = run(ctx.db, "UPDATE cards SET status = 'locked', lock_reason = ? WHERE id = ? AND kind = 'nfc'", reason || null, cardId).changes > 0;
  if (ok) logEvent(ctx, { type: 'card_locked', severity: 'yellow', cardId, data: { reason, by } });
  return ok;
}

export function unlockCard(ctx, cardId, by = 'admin') {
  const ok = run(ctx.db, "UPDATE cards SET status = 'active', lock_reason = NULL WHERE id = ? AND kind = 'nfc'", cardId).changes > 0;
  if (ok) logEvent(ctx, { type: 'card_unlocked', cardId, data: { by } });
  return ok;
}

/**
 * Chấm điểm 1 yêu cầu nhận slot.
 * → {score, level:'green'|'yellow'|'red', reasons:[{code, points, text}]}
 */
export function scoreClaim(ctx, { customer, device, tool, entry, otherPhones = 0, isNewDevice = false }) {
  const s = ctx.settings();
  const reasons = [];
  const add = (code, points, text) => { if (points > 0) reasons.push({ code, points, text }); };

  if (entry?.verdict === 'jump') add('tap_jump', entry.riskPoints, 'Bộ đếm chip nhảy bất thường');
  if (otherPhones > 0) add('device_other_phone', 30 * otherPhones, `Máy này đã dùng cho ${otherPhones} SĐT khác`);
  if (isNewDevice) add('new_device', 10, 'Khách quen dùng máy mới');
  const cr = Math.min(50, customerRisk(ctx, customer));
  add('customer_risk', cr, `Điểm rủi ro tích luỹ của khách: ${cr}`);
  const dr = device ? Math.min(50, deviceRisk(ctx, device)) : 0;
  add('device_risk', dr, `Điểm rủi ro tích luỹ của máy: ${dr}`);
  if (customer?.strikes > 0) add('strikes', 15 * customer.strikes, `Đã vi phạm ${customer.strikes} lần`);
  if (tool?.high_value && inHourRange(localHour(ctx.now(), s.timezoneOffsetMin), s.peakStartHour, s.peakEndHour)) {
    add('high_value_peak', 10, 'Công cụ giá trị cao vào giờ cao điểm');
  }

  const score = reasons.reduce((a, r) => a + r.points, 0);
  const level = score < s.riskYellow ? 'green' : score < s.riskRed ? 'yellow' : 'red';
  return { score, level, reasons };
}
