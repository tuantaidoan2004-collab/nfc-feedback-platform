// Định danh khách: số điện thoại Việt Nam (lưu dạng 84xxxxxxxxx) hoặc email (chữ thường).
// Cột customers.phone / otps.phone giữ một trong hai, tuỳ LOGIN_BY.
import { hmac } from './crypto.js';

const MOBILE_PREFIX = /^84[35789]\d{8}$/;

/** Chuẩn hoá về 84xxxxxxxxx; trả về null nếu không phải số di động VN hợp lệ. */
export function normalizePhone(input) {
  if (input == null) return null;
  let d = String(input).replace(/[^\d+]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  if (d.startsWith('0084')) d = d.slice(2);
  if (d.startsWith('0') && d.length === 10) d = '84' + d.slice(1);
  else if (d.length === 9 && /^[35789]/.test(d)) d = '84' + d;
  return MOBILE_PREFIX.test(d) ? d : null;
}

const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/;

/** Email hợp lệ → chữ thường, bỏ khoảng trắng; không hợp lệ → null. */
export function normalizeEmail(input) {
  if (input == null) return null;
  const e = String(input).trim().toLowerCase();
  return e.length <= 254 && EMAIL_RE.test(e) ? e : null;
}

/** Chuẩn hoá theo kiểu đăng nhập: 'email' hoặc 'phone'. */
export const normalizeLogin = (input, by) => (by === 'email' ? normalizeEmail(input) : normalizePhone(input));

/** 84912345678 → 0912345678; email giữ nguyên */
export const displayPhone = (p) => (p && !p.includes('@') && p.startsWith('84') ? '0' + p.slice(2) : p || '');

/** 84912345678 → 0912***678; abcdef@gmail.com → ab***@gmail.com */
export function maskPhone(p) {
  // Khách đã "Xoá dữ liệu cá nhân": phone = del:<băm> → không hiện "del:***b63".
  if (p && p.startsWith('del:')) return '(đã xoá dữ liệu)';
  if (p && p.includes('@')) {
    const [u, d] = p.split('@');
    return `${u.slice(0, Math.min(2, Math.max(1, u.length - 1)))}***@${d}`;
  }
  const d = displayPhone(p);
  return d.length >= 7 ? d.slice(0, 4) + '***' + d.slice(-3) : d;
}

/**
 * Khi khách yêu cầu xoá dữ liệu: thay SĐT bằng dấu vết một chiều này (không đọc ngược ra số được),
 * để nếu số đó đăng ký lại thì vẫn nối với hạn mức cũ — xoá dữ liệu không thành cách nhận lại lượt thử.
 */
export const phoneTombstone = (appSecret, phone) => 'del:' + hmac(appSecret, `tombstone:${phone}`).slice(0, 32);
