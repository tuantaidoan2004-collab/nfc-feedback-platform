// Vé từ trang quán QS — lối vào 1 (quán có QS) để biết khách đang ngồi ở quán. Lối vào 2 (quán chưa có QS): thẻ NFC riêng
// của Tiệm trên bàn, xem presence.processTap. Quán không phải làm gì và Tiệm không xin quán quyền gì (không màn hình quầy,
// không mã quầy, không Wi-Fi).
// Khách chạm thẻ / quét mã QR trên bàn → trang quán của QS. Chỉ khi khách vào bằng thẻ / QR (không phải link trang quán
// lan trên mạng), QS gắn vào nút "Nhận công cụ làm việc miễn phí" một vé có chữ ký:
//
//   ?t=1.<giây phát vé>.<nonce>.<chữ ký 32 ký tự>
//   chữ ký = base64url(HMAC-SHA256(QS_TICKET_KEY, "tbq-ticket|1|<mã quán QS, chữ thường>|<giây phát vé>|<nonce>")) cắt 32 ký tự
//
// Khoá dùng chung với QS (bên QS tên NFC_EVENT_TBQ_KEY, mã nguồn lib/events/ticket.ts). Vé hợp lệ khi: đúng chữ ký, đúng quán,
// phát chưa quá ticketTtlMin phút, và chưa được máy KHÁC dùng (mỗi vé 1 máy — chặn kiểu gửi link cho bạn ở nhà).
// Kẽ hở còn lại: chụp mã QR mang về nhà rồi quét. Chặn tiếp bằng OTP mỗi SĐT, giới hạn lượt / khách / máy, suất / quán / ngày.

import { createHmac } from 'node:crypto';
import { get, run } from '../db/index.js';
import { safeEqual } from '../lib/crypto.js';
import { logEvent } from '../lib/events.js';
import { hit } from '../lib/ratelimit.js';
import { MIN, HOUR } from '../lib/time.js';

const TICKET_RE = /^1\.(\d{1,12})\.([A-Za-z0-9_-]{8,64})\.([A-Za-z0-9_-]{32})$/;
/** Đồng hồ hai máy chủ lệch nhau tối đa bao nhiêu thì vẫn nhận vé "phát trong tương lai". */
const CLOCK_SKEW_MS = 2 * MIN;

export const ticketSignature = (key, shop, issuedSec, nonce) =>
  createHmac('sha256', key).update(`tbq-ticket|1|${String(shop).toLowerCase()}|${issuedSec}|${nonce}`).digest('base64url').slice(0, 32);

/** Tạo vé như QS tạo (dùng cho test, mô phỏng và chạy thử khi chưa nối QS). */
export function makeTicket(key, shop, nowMs, nonce) {
  const issued = Math.floor(nowMs / 1000);
  return `1.${issued}.${nonce}.${ticketSignature(key, shop, issued, nonce)}`;
}

export const TICKET_MESSAGES = {
  need_ticket: 'Bạn chạm thẻ hoặc quét mã QR trên bàn của quán (nếu mở ra trang quán thì bấm “Nhận công cụ làm việc miễn phí”) nhé.',
  invalid: 'Link này không hợp lệ. Bạn chạm thẻ hoặc quét mã QR trên bàn của quán, rồi bấm lại nút trên trang quán nhé.',
  expired: 'Link này đã cũ. Bạn chạm thẻ hoặc quét mã QR trên bàn của quán một lần nữa, rồi bấm lại nút trên trang quán nhé.',
  used_elsewhere: 'Link này đã được mở trên một máy khác. Mỗi người tự chạm thẻ hoặc quét mã QR trên bàn của quán để nhận nhé.',
};

/**
 * Kiểm vé và giữ vé cho máy này. Chạy lại với cùng máy (tải lại trang) vẫn đúng.
 * → {ok:true, fresh} | {ok:false, error:'invalid'|'expired'|'used_elsewhere'} — fresh: vé này máy mới mở lần đầu (chạm thẻ lần nữa).
 */
export function useTicket(ctx, { cafe, shop, ticket, deviceId, ip }) {
  const key = ctx.config.qsTicketKey;
  const m = TICKET_RE.exec(String(ticket ?? ''));
  const fail = (error) => {
    logEvent(ctx, { type: 'ticket_rejected', severity: error === 'invalid' ? 'yellow' : 'info', deviceId, cafeId: cafe.id, ip, data: { error } });
    // Nhiều vé giả cùng 1 quán trong 1 giờ → có người đang dò. Báo 1 lần mỗi giờ.
    if (error === 'invalid' && hit(ctx, `ticketbad:${cafe.id}`, 30, HOUR).count === 31) {
      // Gợi ý cho chủ: kiểm tra QS_TICKET_KEY có trùng NFC_EVENT_TBQ_KEY bên QS không.
      logEvent(ctx, { type: 'ticket_forged', severity: 'red', cafeId: cafe.id, ip, data: { badTicketsLastHour: 31 } });
    }
    return { ok: false, error };
  };
  if (!key || !m || !deviceId) return fail('invalid');
  const [, issuedSec, nonce, signature] = m;
  if (!safeEqual(signature, ticketSignature(key, shop, issuedSec, nonce))) return fail('invalid');
  const issuedMs = Number(issuedSec) * 1000;
  const now = ctx.now();
  if (issuedMs > now + CLOCK_SKEW_MS) return fail('invalid');
  if (now - issuedMs > ctx.settings().ticketTtlMin * MIN) return fail('expired');
  const fresh = run(ctx.db, 'INSERT OR IGNORE INTO qs_tickets(nonce, cafe_id, device_id, issued_at, used_at) VALUES(?, ?, ?, ?, ?)', nonce, cafe.id, deviceId, issuedMs, now).changes > 0;
  const holder = get(ctx.db, 'SELECT device_id, cafe_id FROM qs_tickets WHERE nonce = ?', nonce);
  if (holder.device_id !== deviceId || holder.cafe_id !== cafe.id) return fail('used_elsewhere');
  return { ok: true, fresh };
}
