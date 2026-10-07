import { run } from '../db/index.js';

/**
 * Ghi nhật ký/sự kiện rủi ro. severity: info | yellow | red.
 * Trả về id. Không bao giờ ném lỗi ra ngoài (nhật ký không được làm hỏng luồng chính).
 */
export function logEvent(ctx, e) {
  try {
    return run(ctx.db,
      `INSERT INTO events(type, severity, customer_id, device_id, card_id, cafe_id, account_id, slot_id, ip, data, created_at)
       VALUES(:type, :severity, :customerId, :deviceId, :cardId, :cafeId, :accountId, :slotId, :ip, :data, :now)`,
      {
        type: e.type,
        severity: e.severity || 'info',
        customerId: e.customerId, deviceId: e.deviceId, cardId: e.cardId, cafeId: e.cafeId,
        accountId: e.accountId, slotId: e.slotId, ip: e.ip,
        data: e.data == null ? null : JSON.stringify(e.data),
        now: ctx.now(),
      }).lastInsertRowid;
  } catch (err) {
    ctx.log?.('error', 'logEvent failed', { err: String(err), type: e.type });
    return null;
  }
}
