import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { AdminError } from './error';
import { PLATFORM_NAME } from '../brand';

/**
 * Time-based one-time codes for administrators (RFC 6238: HMAC-SHA1, thirty-second steps, six digits), written out
 * here rather than pulled in, because it is forty lines and a dependency in the login path is a dependency that can
 * be replaced under us.
 *
 * The shape is fixed and never taken from input: an attacker who could choose the digit count or the step length
 * could ask for a one-digit code.
 */
const STEP_SECONDS = 30, DIGITS = 6;
/** One step either side, for a phone clock that drifts. Wider would hand an attacker more valid codes at once. */
const DRIFT_STEPS = 1;
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export const stepAt = (at: Date) => Math.floor(at.getTime() / 1000 / STEP_SECONDS);

/** RFC 4648 base32, the form every authenticator app expects. No padding: apps accept it and it is easier to type. */
export function base32(bytes: Buffer) {
  let bits = 0, value = 0, out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += BASE32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}
export function fromBase32(text: string) {
  let bits = 0, value = 0; const out: number[] = [];
  for (const character of text.toUpperCase().replace(/[\s=]/g, '')) {
    const index = BASE32.indexOf(character);
    if (index < 0) throw new AdminError(400, 'INVALID_TOTP_SECRET');
    value = (value << 5) | index; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

/** The digits an app shows for this secret at this step. */
export function code(secret: Buffer, step: number) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const mac = createHmac('sha1', secret).update(counter).digest();
  const offset = mac[mac.length - 1] & 0x0f;
  const binary = mac.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 10 ** DIGITS).padStart(DIGITS, '0');
}

/**
 * Which step this code belongs to, or null. Every candidate step is checked even after a match, so the time taken
 * does not say how close a guess was; the comparison itself is constant-time.
 */
export function stepOf(secret: Buffer, digits: string, now: Date): number | null {
  if (!/^[0-9]{6}$/.test(digits)) return null;
  const current = stepAt(now); let found: number | null = null;
  for (let offset = -DRIFT_STEPS; offset <= DRIFT_STEPS; offset++) {
    const step = current + offset;
    const expected = Buffer.from(code(secret, step)), given = Buffer.from(digits);
    if (expected.length === given.length && timingSafeEqual(expected, given)) found = step;
  }
  return found;
}

export const newSecret = () => randomBytes(20);
/** What an authenticator app scans or accepts pasted. The label is what the person will see in their app. */
export const enrolmentUri = (username: string, secret: Buffer) =>
  `otpauth://totp/${encodeURIComponent(`NFC · ${username}`)}?secret=${base32(secret)}&issuer=${encodeURIComponent(PLATFORM_NAME)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`;

/**
 * The secret at rest. Reading this table must not be enough to produce codes, or the second factor protects nothing
 * against the one attacker it is there for. Missing or malformed key is refused outright: a second factor that
 * quietly stores its secret in the clear is worse than none, because everyone believes it is working.
 */
function key(env: Record<string, string | undefined> = process.env) {
  const raw = env.NFC_TOTP_KEY?.trim();
  if (!raw || !/^[a-f0-9]{64}$/i.test(raw)) throw new AdminError(503, 'TOTP_KEY_MISSING');
  return Buffer.from(raw, 'hex');
}
export function seal(secret: Buffer, env?: Record<string, string | undefined>) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key(env), iv);
  const body = Buffer.concat([cipher.update(secret), cipher.final()]);
  return `${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${body.toString('hex')}`;
}
export function open(sealed: string, env?: Record<string, string | undefined>) {
  const [iv, tag, body] = sealed.split(':');
  if (!iv || !tag || !body) throw new AdminError(503, 'TOTP_SECRET_UNREADABLE');
  try {
    const decipher = createDecipheriv('aes-256-gcm', key(env), Buffer.from(iv, 'hex'));
    decipher.setAuthTag(Buffer.from(tag, 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(body, 'hex')), decipher.final()]);
  } catch (error) {
    // A wrong key and a tampered row look the same here, which is the point: neither may be used.
    if (error instanceof AdminError) throw error;
    throw new AdminError(503, 'TOTP_SECRET_UNREADABLE');
  }
}
