// Mã 2FA (TOTP, RFC 6238) — giống ứng dụng Google Authenticator: 6 số, đổi mỗi 30 giây.
// Khoá 2FA chỉ nằm trên máy chủ (mã hoá trong database); khách chỉ thấy mã 6 số đang chạy.
import crypto from 'node:crypto';

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Chuẩn hoá khoá 2FA người bán đưa: "jbsw y3dp ehpk 3pxp" | otpauth://totp/...?secret=... → "JBSWY3DPEHPK3PXP". null nếu không hợp lệ. */
export function parseTotpSecret(input) {
  let s = String(input ?? '').trim();
  if (!s) return null;
  if (/^otpauth:\/\//i.test(s)) {
    try { s = new URL(s).searchParams.get('secret') || ''; } catch { return null; }
  }
  s = s.replace(/[\s-]/g, '').replace(/=+$/, '').toUpperCase();
  if (!/^[A-Z2-7]+$/.test(s)) return null;
  const bytes = base32Decode(s);
  return bytes.length >= 10 ? s : null; // khoá thật dài ≥ 80 bit (16 ký tự)
}

function base32Decode(s) {
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of s) {
    value = (value << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  return Buffer.from(out);
}

/** Mã hiện tại. → {code, remainSec} */
export function totpNow(secret, nowMs, { step = 30, digits = 6 } = {}) {
  const counter = Math.floor(nowMs / 1000 / step);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', base32Decode(secret)).update(msg).digest();
  const o = h[h.length - 1] & 0x0f;
  const bin = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return {
    code: String(bin % 10 ** digits).padStart(digits, '0'),
    remainSec: step - (Math.floor(nowMs / 1000) % step),
  };
}

/** Khoá 2FA mới (160 bit, base32) — cho đăng nhập quản trị (ADMIN_TOTP). */
export function newTotpSecret() {
  const bytes = crypto.randomBytes(20);
  let bits = 0, value = 0, out = '';
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

/**
 * Kiểm mã 6 số người dùng gõ: nhận khung 30 giây hiện tại ± window (đồng hồ điện thoại lệch). → số thứ tự khung khớp | null.
 * Người gọi tự chặn dùng lại (khung ≤ khung đã dùng lần trước).
 */
export function verifyTotp(secret, input, nowMs, { window = 1, step = 30 } = {}) {
  const code = String(input ?? '').replace(/\D/g, '');
  if (code.length !== 6) return null;
  const base = Math.floor(nowMs / 1000 / step);
  for (let d = -window; d <= window; d++) {
    if (totpNow(secret, (base + d) * step * 1000).code === code) return base + d;
  }
  return null;
}
