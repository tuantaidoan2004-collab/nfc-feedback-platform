import crypto from 'node:crypto';

/** Chuỗi ngẫu nhiên an toàn, base64url. 18 byte ≈ 24 ký tự. */
export const randomToken = (bytes = 18) => crypto.randomBytes(bytes).toString('base64url');

/** n chữ số ngẫu nhiên (OTP). */
export function randomDigits(n) {
  let s = '';
  for (let i = 0; i < n; i++) s += crypto.randomInt(0, 10);
  return s;
}

export const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

export const hmac = (key, data, enc = 'hex') => crypto.createHmac('sha256', key).update(data).digest(enc);

/** So sánh chuỗi chống timing attack. */
export function safeEqual(a, b) {
  const A = Buffer.from(String(a ?? ''));
  const B = Buffer.from(String(b ?? ''));
  if (A.length !== B.length) return false;
  return crypto.timingSafeEqual(A, B);
}

function key32(keyB64) {
  const k = Buffer.from(keyB64 || '', 'base64');
  if (k.length !== 32) throw new Error('DATA_KEY phải là 32 byte base64');
  return k;
}

/** Mã hoá AES-256-GCM. Kết quả dạng "v1.<iv>.<tag>.<ciphertext>" (base64url). */
export function encrypt(plain, keyB64) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key32(keyB64), iv);
  const ct = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  return ['v1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), ct.toString('base64url')].join('.');
}

export function decrypt(enc, keyB64) {
  if (!enc) return null;
  const [v, iv, tag, ct] = String(enc).split('.');
  if (v !== 'v1') throw new Error('Định dạng mã hoá không hỗ trợ');
  const d = crypto.createDecipheriv('aes-256-gcm', key32(keyB64), Buffer.from(iv, 'base64url'));
  d.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(ct, 'base64url')), d.final()]).toString('utf8');
}
