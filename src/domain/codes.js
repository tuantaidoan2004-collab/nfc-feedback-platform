// Lượt "Lấy mã": mỗi tài khoản chỉ 1 lượt mở → mã đăng nhập về khớp đúng 1 người, trên đúng 1 máy.
import { get, all, run, tx } from '../db/index.js';
import { logEvent } from '../lib/events.js';
import { maskPhone } from '../lib/phone.js';
import { SEC, MIN, DAY } from '../lib/time.js';
import { isCustomerLocked, addRisk } from './risk.js';
import { latestEntry } from './presence.js';
import { MSG } from './claims.js';
import { decrypt } from '../lib/crypto.js';
import { totpNow } from '../lib/totp.js';
import { toolNeedsVoucher, checkVoucher, boundVoucher, deviceVoucher, useVoucher } from './vouchers.js';

const GRACE = 60 * SEC;          // mã về trễ tối đa 60 giây sau khi lượt hết giờ vẫn nhận
const DATE_SKEW = 60 * SEC;      // lệch giờ cho phép giữa máy chủ thư và máy mình
const PRESEND_WINDOW = 90 * SEC; // khách bấm "Gửi mã" bên hãng trước khi bấm "Lấy mã"
const CODE_KEEP = 10 * MIN;      // mã bị xoá khỏi máy chủ sau 10 phút

const rejected = (code, message) => ({ status: 'rejected', code, message });

/**
 * Khách bấm "Lấy mã" (mã gửi qua email) hoặc "Lấy mã 2FA" (công cụ mật khẩu + 2FA). Xem CONTRACT.md mục 3.7.
 * kind: 'mail' | 'totp' — bỏ trống thì theo công cụ (password_totp → totp).
 */
/** Số mã tối đa của slot (1 slot = 1 máy): riêng món (tools.code_max) hoặc Cài đặt; mỗi ngày gia hạn thêm 1 phần (khách gia hạn
 *  bị đăng xuất lúc 6h, phải đăng nhập lại). Tính theo mã ĐÃ GIAO (slots.code_used), không theo lần bấm. */
export const codeLimit = (s, slot, tool) => (tool?.code_max ?? s.codeMaxRequests) * (1 + (slot.extended_days || 0));
export const codesLeft = (s, slot, tool) => Math.max(0, codeLimit(s, slot, tool) - (slot.code_used || 0));
/** Bấm "Lấy mã" mà mã không về (chưa bấm gửi bên hãng, thư lạc) thì không mất lượt — nhưng mỗi lượt mở khoá cả tài khoản 3 phút
 *  với người dùng chung, nên số lần MỞ cũng có trần: số mã + OPEN_SPARE. */
const OPEN_SPARE = 3;
const markUsed = (ctx, slotId) => run(ctx.db, 'UPDATE slots SET code_used = code_used + 1 WHERE id = ?', slotId);

/** Lấy mã có phải chạm thẻ / phiếu không. Mặc định không (codeNeedsTap = 0): mã tự đưa cho khách, chống spam chỉ bằng
 *  đúng máy đã nhận slot + số mã / slot (codeLimit, ChatGPT 2). Slot đã gia hạn (code_free) không bao giờ cần. */
export const slotNeedsTap = (s, slot) => Number(s.codeNeedsTap) === 1 && !slot.code_free;
/** Slot này lấy mã có cần mã phiếu không (bật chạm thẻ / phiếu, công cụ bật mã phiếu, slot chưa gia hạn). */
export const slotNeedsVoucher = (s, tool, slot) => slotNeedsTap(s, slot) && toolNeedsVoucher(tool);

export function requestCode(ctx, { customer, deviceId, ip, kind, voucher: voucherRaw }) {
  const now = ctx.now();
  const s = ctx.settings();
  if (isCustomerLocked(customer, now)) return rejected('customer_locked', MSG.customer_locked);
  const slot = get(ctx.db, "SELECT * FROM slots WHERE customer_id = ? AND status = 'active' ORDER BY id DESC LIMIT 1", customer.id);
  if (!slot) {
    const last = get(ctx.db, 'SELECT status FROM slots WHERE customer_id = ? ORDER BY id DESC LIMIT 1', customer.id);
    return last?.status === 'expired' ? rejected('expired', 'Slot của bạn đã hết hạn.') : rejected('no_slot', 'Bạn chưa có slot nào đang hoạt động.');
  }
  if (slot.expires_at <= now) return rejected('expired', 'Slot của bạn đã hết hạn.');
  const tool = get(ctx.db, 'SELECT * FROM tools WHERE id = ?', slot.tool_id);
  const mode = codeMode(tool, kind);
  if (!mode) return rejected('not_code_tool', 'Công cụ này không cần lấy mã.');
  const account = get(ctx.db, 'SELECT * FROM accounts WHERE id = ?', slot.account_id);
  if (!account || account.status === 'quarantined' || account.status === 'retired') {
    return rejected('account_unavailable', 'Tài khoản đang bảo trì, Tiệm sẽ liên hệ bạn.');
  }
  if (mode === 'totp' && !account.totp_enc) {
    logEvent(ctx, { type: 'totp_missing', severity: 'yellow', accountId: account.id, slotId: slot.id });
    return rejected('no_totp', 'Tài khoản chưa cài mã 2FA. Tiệm sẽ xử lý ngay, bạn bấm "Báo Tiệm" bên dưới nhé.');
  }

  const opened = { accountEmail: account.login_email, loginUrl: tool.login_url };
  return tx(ctx.db, () => {
    if (mode === 'totp') {
      // Đang trong lượt xem mã 2FA trên đúng máy này → trả mã hiện tại, không tính thêm lượt.
      if (slot.totp_until > now && slot.totp_device === deviceId) return totpView(ctx, account, slot.totp_until);
    } else {
      const mine = get(ctx.db, "SELECT * FROM code_windows WHERE slot_id = ? AND status = 'open' AND expires_at > ? ORDER BY id DESC LIMIT 1", slot.id, now);
      if (mine) return { status: 'open', windowId: mine.id, expiresAt: mine.expires_at, ...opened };
    }
    // Mở lượt mã MỚI phải đang ở quán: máy này vừa vào từ trang quán (vé còn hạn). Chặn kiểu về nhà rồi đăng nhập thêm máy
    // hay đưa mã cho bạn. Tiệm không có gì ở quán để kiểm → khách chạm thẻ / quét QR trên bàn lại 1 lần là được.
    // Công cụ cần mã phiếu: phiếu chỉ phát ở quán nên thay cho việc kiểm "đang ở quán" (trừ khi chủ bật voucherNeedsCafe).
    // Slot đã gia hạn (khách trả tiền, có thể ở nhà): không cần ở quán, không cần phiếu — vẫn phải đúng máy.
    const needVoucher = slotNeedsVoucher(s, tool, slot);
    const cafeCheck = slotNeedsTap(s, slot) && (!needVoucher || Number(s.voucherNeedsCafe) === 1);
    if (cafeCheck && !latestEntry(ctx, deviceId)) return { status: 'need_entry', message: MSG.need_code_entry };

    // Mỗi slot chỉ 1 máy: lấy mã từ máy khác máy đã nhận slot → từ chối (không có ai duyệt tay).
    if (deviceId !== slot.device_id) {
      logEvent(ctx, { type: 'code_second_device', severity: 'yellow', customerId: customer.id, deviceId, slotId: slot.id, accountId: account.id, ip });
      return rejected('second_device', 'Mỗi slot chỉ dùng trên 1 máy để nhường slot cho bạn sau nhé.');
    }
    // Lấy thêm mã (tối đa codeLimit mã / slot) không cần duyệt: lần nào cũng phải đang ở quán (kiểm ở trên) và đúng máy.
    if (!codesLeft(s, slot, tool)) {
      return rejected('too_many_codes', `Máy này đã lấy đủ ${codeLimit(s, slot, tool)} mã cho slot này. Cần hỗ trợ thì nhắn Zalo Tiệm nhé.`);
    }
    if (slot.code_requests >= codeLimit(s, slot, tool) + OPEN_SPARE) {
      return rejected('too_many_opens', 'Bạn đã bấm "Lấy mã" nhiều lần mà chưa nhận được mã. Nhắn Zalo Tiệm để được hỗ trợ nhé.');
    }
    // Mã phiếu: khách gõ, hoặc mã vĩnh viễn đã gắn SĐT này. Chỉ trừ lượt khi mở được mã (bận / lỗi thì không trừ).
    let voucher = null;
    if (needVoucher) {
      if (String(voucherRaw ?? '').trim()) {
        const c = checkVoucher(ctx, { raw: voucherRaw, customerId: customer.id, deviceId, tool, cafeId: slot.cafe_id, purpose: 'code' });
        if (!c.ok) return { status: c.code === 'voucher_locked' ? 'rejected' : 'need_voucher', code: c.code, message: c.message };
        voucher = c.voucher;
      } else {
        // Không gõ: mã vĩnh viễn đã gắn SĐT, rồi tới phiếu tự động của lần chạm thẻ vừa rồi.
        voucher = boundVoucher(ctx, customer.id, tool, slot.cafe_id) || deviceVoucher(ctx, { deviceId, customerId: customer.id, tool, cafeId: slot.cafe_id });
        if (!voucher) return { status: 'need_voucher', code: 'need_voucher', message: 'Chạm thẻ của quán (ở quầy hoặc trên bàn) / quét mã QR của quán (tự có phiếu), hoặc nhập mã phiếu giấy vào ô bên trên rồi bấm lấy mã nhé.' };
      }
    }
    const r = mode === 'totp' ? openTotp(ctx, { slot, account, customer, deviceId, ip }) : openWindow(ctx, { slot, account, customer, deviceId, ip, opened });
    if (voucher && (r.status === 'totp' || r.status === 'open')) useVoucher(ctx, { voucher, customerId: customer.id, slotId: slot.id, deviceId, purpose: 'code' });
    return r;
  });
}

/** Công cụ này lấy mã kiểu gì: 'totp' | 'mail' | null. */
export function codeMode(tool, kind) {
  const pw = tool.login_type === 'password' || tool.login_type === 'password_totp';
  const mailOk = tool.login_type === 'email_code' || (pw && !!tool.mail_code);
  const totpOk = tool.login_type === 'password_totp';
  if (kind === 'mail') return mailOk ? 'mail' : null;
  if (kind === 'totp') return totpOk ? 'totp' : null;
  return totpOk ? 'totp' : mailOk ? 'mail' : null;
}

function totpView(ctx, account, until) {
  let secret = null;
  try { secret = decrypt(account.totp_enc, ctx.config.dataKey); } catch { secret = null; }
  if (!secret) return rejected('no_totp', 'Tài khoản chưa cài mã 2FA. Tiệm sẽ xử lý ngay, bạn bấm "Báo Tiệm" bên dưới nhé.');
  return { status: 'totp', until, ...totpNow(secret, ctx.now()) };
}

/** Mở lượt xem mã 2FA (dài bằng 1 lượt lấy mã). Không khoá tài khoản như mã email: nhiều người xem cùng lúc vẫn đúng. */
function openTotp(ctx, { slot, account, customer, deviceId, ip }) {
  const until = ctx.now() + ctx.settings().codeWindowSec * SEC;
  run(ctx.db, 'UPDATE slots SET code_requests = code_requests + 1, code_used = code_used + 1, totp_until = ?, totp_device = ? WHERE id = ?',
    until, deviceId, slot.id);
  logEvent(ctx, { type: 'totp_shown', customerId: customer.id, deviceId, slotId: slot.id, accountId: account.id, ip });
  return totpView(ctx, account, until);
}

/** Mã 2FA đang chạy cho khách đang trong lượt xem (đúng khách, đúng máy, slot còn chạy). */
export function totpStatus(ctx, { customerId, deviceId }) {
  const now = ctx.now();
  const slot = get(ctx.db, "SELECT * FROM slots WHERE customer_id = ? AND status = 'active' ORDER BY id DESC LIMIT 1", customerId);
  if (!slot || !(slot.totp_until > now) || slot.totp_device !== deviceId || slot.expires_at <= now) return { status: 'closed' };
  const account = get(ctx.db, 'SELECT * FROM accounts WHERE id = ?', slot.account_id);
  if (!account || account.status === 'quarantined') return { status: 'closed' };
  return totpView(ctx, account, slot.totp_until);
}

function openWindow(ctx, { slot, account, customer, deviceId, ip, opened }) {
  const now = ctx.now();
  // Lượt đã quá giờ của người khác thì nhả khoá ngay (mã về trễ của họ vẫn được nhận diện là 'late').
  run(ctx.db, "UPDATE code_windows SET status = 'expired' WHERE account_id = ? AND status = 'open' AND expires_at <= ?", account.id, now);
  const busy = get(ctx.db, "SELECT expires_at FROM code_windows WHERE account_id = ? AND status = 'open'", account.id);
  if (busy) {
    const sec = Math.max(1, Math.ceil((busy.expires_at - now) / 1000));
    return { status: 'busy', retryAfterSec: sec, message: `Tài khoản đang có người khác lấy mã. Thử lại sau ${sec} giây nhé.` };
  }
  const expiresAt = now + ctx.settings().codeWindowSec * SEC;
  let windowId;
  try {
    windowId = run(ctx.db,
      "INSERT INTO code_windows(account_id, slot_id, customer_id, device_id, status, opened_at, expires_at) VALUES(?, ?, ?, ?, 'open', ?, ?)",
      account.id, slot.id, customer.id, deviceId, now, expiresAt).lastInsertRowid;
  } catch (e) {
    if (!/UNIQUE/i.test(String(e?.message))) throw e;
    return { status: 'busy', retryAfterSec: ctx.settings().codeWindowSec, message: 'Tài khoản đang có người khác lấy mã. Thử lại sau ít phút nhé.' };
  }
  run(ctx.db, 'UPDATE slots SET code_requests = code_requests + 1 WHERE id = ?', slot.id);
  logEvent(ctx, { type: 'code_requested', customerId: customer.id, deviceId, slotId: slot.id, accountId: account.id, ip, data: { windowId } });

  // Khách bấm "Gửi mã" bên hãng trước khi bấm "Lấy mã": mã mồ côi vừa về trong 90 giây → gắn luôn.
  const early = get(ctx.db,
    "SELECT id, code FROM mails WHERE account_id = ? AND kind = 'login_code' AND verdict IN ('orphan', 'orphan_wait') AND code IS NOT NULL AND received_at >= ? ORDER BY id DESC LIMIT 1",
    account.id, now - PRESEND_WINDOW);
  if (early) {
    run(ctx.db, "UPDATE code_windows SET status = 'delivered', code = ?, code_received_at = ?, mail_id = ? WHERE id = ?", early.code, now, early.id, windowId);
    run(ctx.db, "UPDATE mails SET verdict = 'matched', window_id = ? WHERE id = ?", windowId, early.id);
    markUsed(ctx, slot.id);
    logEvent(ctx, { type: 'code_delivered', customerId: customer.id, slotId: slot.id, accountId: account.id, data: { windowId, early: true } });
  }
  return { status: 'open', windowId, expiresAt, ...opened };
}

/** Trạng thái lượt lấy mã — chỉ chủ lượt (đúng khách, đúng máy) xem được. */
export function codeStatus(ctx, { windowId, customerId, deviceId }) {
  const now = ctx.now();
  const w = get(ctx.db, 'SELECT * FROM code_windows WHERE id = ? AND customer_id = ? AND device_id = ?', Number(windowId) || 0, customerId, deviceId);
  if (!w) return { status: 'not_found' };
  if (w.status === 'open') return now > w.expires_at + GRACE ? { status: 'expired' } : { status: 'waiting', expiresAt: w.expires_at };
  if (w.status === 'delivered' && w.code) {
    if (!w.shown_at) run(ctx.db, 'UPDATE code_windows SET shown_at = ? WHERE id = ?', now, w.id);
    return { status: 'ready', code: w.code, receivedAt: w.code_received_at, alts: altCodes(ctx, w) };
  }
  return { status: 'expired' };
}

/**
 * Mã khác về cùng tài khoản quanh lượt này. Tài khoản dùng chung (ChatGPT / Claude): hãng không ghi mã của máy nào → 2 người
 * đăng nhập gần cùng lúc có thể bị đổi mã cho nhau (~1% lượt trong mô phỏng 09/10/2026). Khách thử mã dự phòng thay vì tốn
 * thêm 1 lượt lấy mã. An toàn: mã hãng gắn với đúng phiên đăng nhập đã xin mã, nhập ở máy khác không dùng được; chỉ người đang
 * giữ chính tài khoản này, đang có lượt, mới thấy. Không bao giờ có: mã của chủ (việc tay), mã đã báo mồ côi, mã các lượt của
 * chính slot này (lượt này / lượt trước — mã cũ hãng đã huỷ).
 */
function altCodes(ctx, w) {
  return all(ctx.db,
    `SELECT code, MAX(id) AS last FROM mails WHERE account_id = ? AND kind = 'login_code' AND code IS NOT NULL AND code != ?
     AND verdict IN ('matched', 'orphan_wait') AND received_at BETWEEN ? AND ?
     AND (window_id IS NULL OR window_id NOT IN (SELECT id FROM code_windows WHERE slot_id = ?))
     GROUP BY code ORDER BY last DESC LIMIT 2`,
    w.account_id, w.code, w.opened_at - PRESEND_WINDOW, w.expires_at + GRACE, w.slot_id).map((r) => r.code);
}

export function cancelWindow(ctx, { windowId, customerId }) {
  const r = run(ctx.db, "UPDATE code_windows SET status = 'cancelled' WHERE id = ? AND customer_id = ? AND status = 'open'", Number(windowId) || 0, customerId);
  return { ok: r.changes > 0 };
}

/**
 * Có mã đăng nhập về hộp thư của tài khoản. Gọi trong transaction của ingestMail.
 * → {verdict:'matched'|'owner'|'replaced'|'late'|'orphan'|'orphan_wait', windowId?}
 *   orphan_wait: đang có người giữ tài khoản → chờ 90 giây xem họ có bấm "Lấy mã" không rồi mới báo động.
 */
export function onLoginCode(ctx, { account, code, mailId, mailDate }) {
  const now = ctx.now();
  const dateOk = (w) => mailDate == null || mailDate >= w.opened_at - DATE_SKEW;

  const open = get(ctx.db, "SELECT * FROM code_windows WHERE account_id = ? AND status = 'open' AND expires_at + ? >= ? ORDER BY id DESC LIMIT 1", account.id, GRACE, now);
  if (open && dateOk(open)) {
    run(ctx.db, "UPDATE code_windows SET status = 'delivered', code = ?, code_received_at = ?, mail_id = ?, shown_at = NULL WHERE id = ?", code, now, mailId, open.id);
    markUsed(ctx, open.slot_id);  // mã về tới khách mới tính lượt (mã thay thế "gửi lại mã" của cùng lượt thì không tính thêm)
    logEvent(ctx, { type: 'code_delivered', customerId: open.customer_id, slotId: open.slot_id, accountId: account.id, data: { windowId: open.id } });
    return { verdict: 'matched', windowId: open.id };
  }
  // Chủ đang làm việc tay (tạo Project / đổi mật khẩu) và đã bấm "Lấy mã đăng nhập": mã là của chủ — hiện trên thẻ việc,
  // không báo mồ côi, không cộng điểm cho khách cũ. (Trước 08/10/2026 chủ đăng nhập làm việc tay = báo đỏ + phạt khách cũ.)
  const task = get(ctx.db, "SELECT id FROM rotation_tasks WHERE account_id = ? AND status = 'todo' AND code_until >= ? ORDER BY id DESC LIMIT 1", account.id, now);
  if (task) {
    logEvent(ctx, { type: 'code_to_owner', accountId: account.id, data: { taskId: task.id, mailId } });
    return { verdict: 'owner' };
  }
  const delivered = get(ctx.db, "SELECT * FROM code_windows WHERE account_id = ? AND status = 'delivered' AND expires_at + ? >= ? ORDER BY id DESC LIMIT 1", account.id, GRACE, now);
  // Mã mới thay mã vừa giao (khách bấm "gửi lại mã" bên hãng) CHỈ khi không còn ai khác dùng tài khoản. Tài khoản dùng chung
  // (diễn tập vận hành): người thứ 2 đăng nhập ngay sau người thứ 1 → mã của người 2 từng bị gán cho người 1, người 2 chờ mãi,
  // và mã của người ngoài cũng bị nuốt (mất báo động mồ côi). Giờ để chờ (orphan_wait): ai bấm "Lấy mã" trong 90 giây sẽ nhận.
  const othersOnAccount = delivered
    ? get(ctx.db, "SELECT COUNT(*) AS n FROM slots WHERE account_id = ? AND status = 'active' AND id != ?", account.id, delivered.slot_id).n : 0;
  if (delivered && dateOk(delivered) && othersOnAccount === 0) {
    run(ctx.db, 'UPDATE code_windows SET code = ?, code_received_at = ?, mail_id = ?, shown_at = NULL WHERE id = ?', code, now, mailId, delivered.id);
    logEvent(ctx, { type: 'code_replaced', customerId: delivered.customer_id, slotId: delivered.slot_id, accountId: account.id, data: { windowId: delivered.id } });
    return { verdict: 'replaced', windowId: delivered.id };
  }
  if (mailDate != null) {
    // Mã về trễ chỉ tính khi slot còn chạy. Slot đã kết thúc mà có mã về → người cũ đang tự đăng nhập → mồ côi.
    const w = get(ctx.db,
      `SELECT id, customer_id, slot_id FROM code_windows WHERE account_id = ? AND opened_at - ? <= ? AND expires_at + ? >= ?
       AND slot_id IN (SELECT id FROM slots WHERE status = 'active') ORDER BY id DESC LIMIT 1`,
      account.id, DATE_SKEW, mailDate, GRACE, mailDate);
    // Tài khoản dùng chung: mã có thể là của người khác vừa đăng nhập → không coi là "mã về trễ" của lượt cũ (như nhánh trên).
    const others = w ? get(ctx.db, "SELECT COUNT(*) AS n FROM slots WHERE account_id = ? AND status = 'active' AND id != ?", account.id, w.slot_id).n : 0;
    if (w && others === 0) {
      logEvent(ctx, { type: 'code_late', severity: 'yellow', customerId: w.customer_id, accountId: account.id, data: { windowId: w.id, mailId } });
      return { verdict: 'late', windowId: w.id };
    }
  }
  const holders = get(ctx.db, "SELECT COUNT(*) AS n FROM slots WHERE account_id = ? AND status = 'active'", account.id).n;
  if (holders > 0) {
    logEvent(ctx, { type: 'code_orphan_wait', accountId: account.id, data: { mailId } });
    return { verdict: 'orphan_wait' };
  }
  escalateOrphan(ctx, { account, mailId });
  return { verdict: 'orphan' };
}

/**
 * Mã mồ côi: có người biết email kho và đang tự đăng nhập (thường là khách cũ ở nhà).
 * Cộng điểm cho người đã giữ tài khoản trong 7 ngày (KHÔNG phạt người đang giữ) và ghi báo động đỏ.
 */
function escalateOrphan(ctx, { account, mailId }) {
  const now = ctx.now();
  const past = all(ctx.db,
    `SELECT s.customer_id, c.phone, MAX(s.ended_at) AS ended_at FROM slots s JOIN customers c ON c.id = s.customer_id
     WHERE s.account_id = ? AND s.status IN ('expired', 'revoked') AND s.ended_at > ? GROUP BY s.customer_id ORDER BY ended_at DESC`,
    account.id, now - 7 * DAY);
  for (const p of past) addRisk(ctx, { customerId: p.customer_id, points: 15, reason: `code_orphan:${account.id}` });
  const current = all(ctx.db,
    "SELECT c.phone FROM slots s JOIN customers c ON c.id = s.customer_id WHERE s.account_id = ? AND s.status = 'active'", account.id);
  // Người giữ 7 ngày qua (+15 điểm) và người đang giữ (có thể chỉ bấm gửi mã sớm): hiện ở nhật ký để chủ biết hỏi ai.
  logEvent(ctx, { type: 'code_orphan', severity: 'red', accountId: account.id,
    data: { mailId, past: past.map((p) => maskPhone(p.phone)), current: current.map((c) => maskPhone(c.phone)) } });
}

/** Mã 'orphan_wait' đã quá 90 giây mà không ai nhận → nâng thành mồ côi (gọi từ jobs). */
export function escalatePendingOrphans(ctx) {
  const due = all(ctx.db, "SELECT id, account_id FROM mails WHERE verdict = 'orphan_wait' AND received_at < ?", ctx.now() - PRESEND_WINDOW);
  for (const m of due) {
    const changed = run(ctx.db, "UPDATE mails SET verdict = 'orphan' WHERE id = ? AND verdict = 'orphan_wait'", m.id).changes;
    const account = get(ctx.db, 'SELECT * FROM accounts WHERE id = ?', m.account_id);
    if (changed && account) escalateOrphan(ctx, { account, mailId: m.id });
  }
  return due.length;
}

/** Đóng lượt quá giờ, xoá mã cũ khỏi máy chủ. Trả về số lượt vừa đóng. */
export function expireWindows(ctx) {
  const now = ctx.now();
  const n = run(ctx.db, "UPDATE code_windows SET status = 'expired' WHERE status = 'open' AND expires_at + ? < ?", GRACE, now).changes;
  run(ctx.db, 'UPDATE code_windows SET code = NULL WHERE code IS NOT NULL AND opened_at < ?', now - CODE_KEEP);
  run(ctx.db, "UPDATE mails SET code = NULL WHERE code IS NOT NULL AND verdict NOT IN ('orphan_wait') AND received_at < ?", now - CODE_KEEP);
  return n;
}

/** Chủ đọc thư không bóc được mã và tự nhập mã cho lượt đang mở của tài khoản. */
/** Loại thư chủ được đọc mã rồi gửi tay cho khách. Thư đặt lại mật khẩu / cảnh báo / link đăng nhập: mã trong đó KHÔNG bao giờ đưa khách. */
export const MANUAL_CODE_KINDS = ['login_code', 'other'];

export function deliverManualCode(ctx, { mailId, code, by = 'admin' }) {
  const c = String(code || '').trim();
  if (!/^[A-Za-z0-9-]{4,12}$/.test(c)) return { ok: false, message: 'Mã không hợp lệ.' };
  return tx(ctx.db, () => {
    const mail = get(ctx.db, 'SELECT * FROM mails WHERE id = ?', mailId);
    if (!mail?.account_id) return { ok: false, message: 'Không tìm thấy thư.' };
    if (!MANUAL_CODE_KINDS.includes(mail.kind)) return { ok: false, message: 'Thư này không phải thư mã đăng nhập — không gửi mã trong thư này cho khách.' };
    const w = get(ctx.db, "SELECT * FROM code_windows WHERE account_id = ? AND status IN ('open', 'delivered') AND expires_at + ? >= ? ORDER BY id DESC LIMIT 1",
      mail.account_id, GRACE, ctx.now());
    if (!w) return { ok: false, message: 'Không có khách nào đang chờ mã của tài khoản này.' };
    run(ctx.db, "UPDATE code_windows SET status = 'delivered', code = ?, code_received_at = ?, mail_id = ?, shown_at = NULL WHERE id = ?", c, ctx.now(), mail.id, w.id);
    run(ctx.db, "UPDATE mails SET verdict = 'matched', window_id = ? WHERE id = ?", w.id, mail.id);
    if (w.status === 'open') markUsed(ctx, w.slot_id);
    logEvent(ctx, { type: 'code_delivered', customerId: w.customer_id, slotId: w.slot_id, accountId: mail.account_id, data: { windowId: w.id, manual: true, by } });
    return { ok: true, message: 'Đã gửi mã cho khách.' };
  });
}
