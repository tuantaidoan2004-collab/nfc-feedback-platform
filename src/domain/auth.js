// Nhận diện máy (cookie "did"), OTP qua email / SMS, phiên đăng nhập (cookie "sid"), xoá dữ liệu cá nhân.
import { get, all, run, tx } from '../db/index.js';
import { randomToken, randomDigits, sha256, hmac, safeEqual } from '../lib/crypto.js';
import { normalizeLogin, phoneTombstone } from '../lib/phone.js';
import { hit, peek } from '../lib/ratelimit.js';
import { logEvent } from '../lib/events.js';
import { MIN, HOUR, DAY } from '../lib/time.js';
import { isCustomerLocked } from './risk.js';
import { MSG, endSlot } from './claims.js';

export { deviceOtherPhones } from './presence.js';

const DID_RE = /^[A-Za-z0-9_-]{16,64}$/;
const FP_RE = /^[0-9a-f]{64}$/;

/**
 * Lấy/tạo mã máy. Cookie mất (trình duyệt dọn) mà JS còn giữ mã cũ trong localStorage (header x-device-hint)
 * → dùng lại mã cũ, để xoá cookie không thành cách nhận thêm lượt.
 */
export function ensureDevice(ctx, rq) {
  const now = ctx.now();
  const h = rq.req.headers;
  let id = DID_RE.test(rq.cookies.did || '') ? rq.cookies.did : null;
  const hint = DID_RE.test(String(h['x-device-hint'] || '')) ? String(h['x-device-hint']) : null;
  if (hint && hint !== id && get(ctx.db, 'SELECT 1 FROM devices WHERE id = ?', hint)) {
    const cur = id ? get(ctx.db, 'SELECT created_at FROM devices WHERE id = ?', id) : null;
    // Chỉ thay khi mã hiện tại vừa được tạo và chưa gắn với SĐT nào (tức là cookie vừa bị mất).
    const fresh = !cur || (now - cur.created_at < 10 * MIN && !get(ctx.db, 'SELECT 1 FROM device_customers WHERE device_id = ?', id));
    if (fresh) {
      if (id) {
        // Lượt chạm thẻ vừa ghi bằng mã mới → chuyển sang mã cũ để khách vẫn nhận slot được.
        run(ctx.db, 'UPDATE taps SET device_id = ? WHERE device_id = ?', hint, id);
        logEvent(ctx, { type: 'device_restored', deviceId: hint, ip: rq.ip, data: { from: id } });
      }
      id = hint;
    }
  }
  if (!id) id = randomToken(18);
  const fp = FP_RE.test(String(h['x-device-fp'] || '')) ? String(h['x-device-fp']) : null;
  run(ctx.db,
    `INSERT INTO devices(id, fp, status, created_at, last_seen_at) VALUES(?, ?, 'active', ?, ?)
     ON CONFLICT(id) DO UPDATE SET last_seen_at = excluded.last_seen_at, fp = COALESCE(excluded.fp, devices.fp)`,
    id, fp, now, now);
  rq.setCookie('did', id, { maxAgeSec: 400 * 86400 });
  rq.state.deviceId = id;
  rq.state.device = get(ctx.db, 'SELECT * FROM devices WHERE id = ?', id);
  return id;
}

const otpHash = (ctx, phone, code) => hmac(ctx.config.appSecret, `${phone}:${code}`);

/** Gửi OTP. → {ok:true, phone, expiresInSec, devCode?} | {ok:false, code, message, retryAfterSec?} */
export async function issueOtp(ctx, { phone, deviceId, ip }) {
  const s = ctx.settings();
  const p = normalizeLogin(phone, ctx.config.otp.loginBy);
  if (!p) return { ok: false, code: 'invalid_phone', message: ctx.config.otp.loginBy === 'email' ? 'Email chưa đúng.' : 'Số điện thoại chưa đúng.' };
  const device = deviceId ? get(ctx.db, 'SELECT status FROM devices WHERE id = ?', deviceId) : null;
  if (device?.status === 'locked') return { ok: false, code: 'device_locked', message: MSG.device_locked };
  const customer = get(ctx.db, 'SELECT * FROM customers WHERE phone = ?', p);
  if (isCustomerLocked(customer, ctx.now())) return { ok: false, code: 'customer_locked', message: MSG.customer_locked };

  const limits = [[`otp:p:${p}`, s.otpPerPhonePerHour], [`otp:d:${deviceId}`, s.otpPerDevicePerHour], [`otp:i:${ip}`, s.otpPerIpPerHour]];
  const blocked = limits.map(([k, l]) => peek(ctx, k, l)).filter((r) => !r.ok);
  if (blocked.length) {
    const sec = Math.max(...blocked.map((b) => b.retryAfterSec));
    return { ok: false, code: 'rate_limited', retryAfterSec: sec, message: `Bạn yêu cầu mã quá nhiều lần. Thử lại sau ${Math.max(1, Math.ceil(sec / 60))} phút.` };
  }
  if (ctx.otp?.name === 'none') return { ok: false, code: 'not_open', message: 'Tiệm chưa mở nhận khách ở đây. Bạn nhắn Zalo Tiệm nhé.' };
  for (const [k, l] of limits) hit(ctx, k, l, HOUR);

  const code = randomDigits(6);
  const now = ctx.now();
  const otpId = tx(ctx.db, () => {
    run(ctx.db, 'UPDATE otps SET used_at = ? WHERE phone = ? AND used_at IS NULL', now, p);
    return run(ctx.db, 'INSERT INTO otps(phone, code_hash, device_id, ip, expires_at, created_at) VALUES(?, ?, ?, ?, ?, ?)',
      p, otpHash(ctx, p, code), deviceId, ip, now + s.otpTtlSec * 1000, now).lastInsertRowid;
  });
  let sent;
  try { sent = await ctx.otp.send(p, code); } catch (e) { sent = { ok: false, error: String(e?.message || e) }; }
  if (!sent?.ok) {
    run(ctx.db, 'UPDATE otps SET used_at = ? WHERE id = ?', ctx.now(), otpId);
    logEvent(ctx, { type: 'otp_send_failed', severity: 'yellow', deviceId, ip, data: { error: sent?.error, provider: ctx.otp?.name } });
    return { ok: false, code: 'send_failed', message: 'Chưa gửi được mã. Thử lại sau ít phút.' };
  }
  logEvent(ctx, { type: 'otp_sent', deviceId, ip, customerId: customer?.id });
  const out = { ok: true, phone: p, expiresInSec: s.otpTtlSec };
  if (ctx.config.otp.devShow && ctx.config.otp.provider === 'dev' && !ctx.config.isProd) out.devCode = code;
  return out;
}

/** Xác minh OTP. → {ok:true, customer, isNew} | {ok:false, code, message} */
export function verifyOtp(ctx, { phone, code, deviceId, ip, consent }) {
  const s = ctx.settings();
  const now = ctx.now();
  const p = normalizeLogin(phone, ctx.config.otp.loginBy);
  if (!p) return { ok: false, code: 'invalid', message: 'Mã chưa đúng.' };
  const otp = get(ctx.db, 'SELECT * FROM otps WHERE phone = ? AND used_at IS NULL ORDER BY id DESC LIMIT 1', p);
  if (!otp || otp.expires_at <= now) return { ok: false, code: 'expired', message: 'Mã đã hết hạn, bấm gửi lại nhé.' };
  if (otp.attempts >= s.otpMaxAttempts) return { ok: false, code: 'too_many_attempts', message: 'Bạn nhập sai nhiều lần. Bấm gửi lại để lấy mã mới nhé.' };
  const input = String(code ?? '').replace(/\D/g, '');
  if (!safeEqual(otp.code_hash, otpHash(ctx, p, input))) {
    const attempts = otp.attempts + 1;
    run(ctx.db, 'UPDATE otps SET attempts = ?, used_at = CASE WHEN ? >= ? THEN ? ELSE used_at END WHERE id = ?', attempts, attempts, s.otpMaxAttempts, now, otp.id);
    logEvent(ctx, { type: 'otp_wrong', deviceId, ip, data: { attempts } });
    if (attempts >= s.otpMaxAttempts) return { ok: false, code: 'too_many_attempts', message: 'Bạn nhập sai nhiều lần. Bấm gửi lại để lấy mã mới nhé.' };
    return { ok: false, code: 'invalid', message: 'Mã chưa đúng.' };
  }

  const tomb = phoneTombstone(ctx.config.appSecret, p);
  let customer = get(ctx.db, 'SELECT * FROM customers WHERE phone = ?', p);
  const revived = customer ? null : get(ctx.db, 'SELECT * FROM customers WHERE phone = ?', tomb);
  const existing = customer || revived;
  if (isCustomerLocked(existing, now)) {
    run(ctx.db, 'UPDATE otps SET used_at = ? WHERE id = ?', now, otp.id);
    return { ok: false, code: 'customer_locked', message: MSG.customer_locked };
  }
  const needConsent = !customer || customer.consent_version !== s.consentVersion;
  // Chưa đồng ý thì KHÔNG huỷ OTP, để khách tick rồi bấm lại.
  if (needConsent && !(consent === true || consent === 'true' || consent === '1' || consent === 1 || consent === 'on')) {
    return { ok: false, code: 'consent_required', message: 'Bạn cần đồng ý điều khoản để tiếp tục.' };
  }

  const isNew = !existing;
  customer = tx(ctx.db, () => {
    run(ctx.db, 'UPDATE otps SET used_at = ? WHERE id = ?', now, otp.id);
    let id;
    if (revived) {
      id = revived.id;
      run(ctx.db, 'UPDATE customers SET phone = ?, consent_at = ?, consent_version = ? WHERE id = ?', p, now, s.consentVersion, id);
    } else if (customer) {
      id = customer.id;
      if (needConsent) run(ctx.db, 'UPDATE customers SET consent_at = ?, consent_version = ? WHERE id = ?', now, s.consentVersion, id);
    } else {
      id = run(ctx.db, "INSERT INTO customers(phone, status, consent_at, consent_version, created_at) VALUES(?, 'active', ?, ?, ?)",
        p, now, s.consentVersion, now).lastInsertRowid;
    }
    if (deviceId) run(ctx.db, 'INSERT OR IGNORE INTO device_customers(device_id, customer_id, first_seen_at) VALUES(?, ?, ?)', deviceId, id, now);
    logEvent(ctx, { type: 'login', customerId: id, deviceId, ip, data: { isNew, revived: !!revived } });
    return get(ctx.db, 'SELECT * FROM customers WHERE id = ?', id);
  });
  return { ok: true, customer, isNew };
}

export function createSession(ctx, rq, { customerId, deviceId }) {
  const token = randomToken(24);
  const now = ctx.now();
  const days = ctx.settings().sessionDays;
  run(ctx.db, 'INSERT INTO sessions(id, customer_id, device_id, created_at, expires_at) VALUES(?, ?, ?, ?, ?)',
    sha256(token), customerId, deviceId, now, now + days * DAY);
  rq.setCookie('sid', token, { maxAgeSec: days * 86400 });
  rq.state.session = get(ctx.db, 'SELECT * FROM sessions WHERE id = ?', sha256(token));
  rq.state.customer = get(ctx.db, 'SELECT * FROM customers WHERE id = ?', customerId);
  return token;
}

/** Đọc phiên. Phiên phải thuộc đúng máy đang dùng (cookie sid chép sang máy khác thì vô hiệu). */
export function loadSession(ctx, rq) {
  rq.state.session = null;
  rq.state.customer = null;
  const token = rq.cookies.sid;
  if (!token) return null;
  const session = get(ctx.db, 'SELECT * FROM sessions WHERE id = ?', sha256(token));
  if (!session || session.expires_at <= ctx.now() || session.device_id !== rq.state.deviceId) {
    rq.clearCookie('sid');
    return null;
  }
  const customer = get(ctx.db, 'SELECT * FROM customers WHERE id = ?', session.customer_id);
  if (!customer) return null;
  rq.state.session = session;
  rq.state.customer = customer;
  return { session, customer };
}

export function logout(ctx, rq) {
  if (rq.cookies.sid) run(ctx.db, 'DELETE FROM sessions WHERE id = ?', sha256(rq.cookies.sid));
  rq.clearCookie('sid');
  rq.state.session = null;
  rq.state.customer = null;
}

/**
 * Xoá dữ liệu cá nhân theo yêu cầu (Luật BVDLCN). SĐT thay bằng dấu vết một chiều để vẫn giữ hạn mức:
 * đăng ký lại bằng số cũ sẽ nối về dòng này, nên xoá dữ liệu không thành cách nhận lại lượt thử.
 */
export function eraseCustomer(ctx, customerId, by = 'admin') {
  return tx(ctx.db, () => {
    const c = get(ctx.db, 'SELECT * FROM customers WHERE id = ?', customerId);
    if (!c) return { ok: false, message: 'Không tìm thấy khách.' };
    if (c.phone.startsWith('del:')) return { ok: false, message: 'Dữ liệu của khách này đã được xoá trước đó.' };
    // Khách đã xoá dữ liệu thì không đăng nhập lại được nữa → kết thúc slot còn chạy (Canva: giao bot gỡ khỏi nhóm, việc gỡ giữ email tới khi xong).
    const live = all(ctx.db, "SELECT id FROM slots WHERE customer_id = ? AND status IN ('active', 'pending_approval', 'pending_invite')", customerId);
    for (const s of live) endSlot(ctx, s.id, { status: 'revoked', reason: 'customer_erased', by });
    run(ctx.db, 'UPDATE customers SET phone = ?, note = NULL WHERE id = ?', phoneTombstone(ctx.config.appSecret, c.phone), customerId);
    run(ctx.db, 'DELETE FROM sessions WHERE customer_id = ?', customerId);
    run(ctx.db, 'DELETE FROM otps WHERE phone = ?', c.phone);
    run(ctx.db, 'UPDATE events SET ip = NULL, data = NULL WHERE customer_id = ?', customerId);
    scrubErased(ctx);
    logEvent(ctx, { type: 'customer_erased', customerId, data: { by, endedSlots: live.length } });
    return { ok: true, message: `Đã xoá dữ liệu cá nhân${live.length ? ` và kết thúc ${live.length} slot đang chạy` : ''}. Hạn mức cũ vẫn được giữ.` };
  });
}

/**
 * Xoá nốt email Canva khách tự nhập (slots.invite_email, rotation_tasks.detail) của khách đã xoá dữ liệu. Việc gỡ khỏi nhóm còn chờ
 * thì giữ email tới khi bot / chủ làm xong (jobs gọi lại mỗi giờ). Trước 08/10/2026: "Xoá dữ liệu cá nhân" bỏ sót email này.
 */
export function scrubErased(ctx) {
  const erased = "SELECT id FROM customers WHERE phone LIKE 'del:%'";
  const slots = run(ctx.db, `UPDATE slots SET invite_email = NULL WHERE invite_email IS NOT NULL AND customer_id IN (${erased})
    AND status NOT IN ('active', 'pending_approval', 'pending_invite')`).changes;
  const tasks = run(ctx.db, `UPDATE rotation_tasks SET detail = NULL WHERE detail IS NOT NULL AND status != 'todo'
    AND kind IN ('invite_member', 'remove_member') AND slot_id IN (SELECT id FROM slots WHERE customer_id IN (${erased}))`).changes;
  return slots + tasks;
}
