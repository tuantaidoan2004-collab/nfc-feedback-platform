// Nhận slot, kích hoạt, kết thúc, việc tay sau khi hết hạn, và dữ liệu cho trang "Slot của tôi".
import { get, all, run, tx } from '../db/index.js';
import { logEvent } from '../lib/events.js';
import { decrypt, encrypt } from '../lib/crypto.js';
import { parseTotpSecret } from '../lib/totp.js';
import { HOUR, DAY, nextLocalHour } from '../lib/time.js';
import { latestEntry, deviceOtherPhones, isCafeOpen } from './presence.js';
import { TICKET_MESSAGES } from './ticket.js';
import { checkClaimQuota, isOwner, pickAccount, pickRedeem, hasStock, toolAvailability, toolUsedToday, COUNTED } from './quota.js';
import { hit } from '../lib/ratelimit.js';
import { startOfLocalDay } from '../lib/time.js';
import { scoreClaim, isCustomerLocked } from './risk.js';
import { codesLeft, slotNeedsTap, slotNeedsVoucher } from './codes.js';
import { boundVoucher, deviceVoucher } from './vouchers.js';

export const PRESENCE_MESSAGES = {
  cafe_closed: 'Quán đang ngoài giờ trải nghiệm.',
  cafe_paused: 'Quán đang tạm dừng chương trình.',
};

export const MSG = {
  customer_locked: 'Số này đang tạm khoá. Nhắn Zalo Tiệm nếu có nhầm lẫn.',
  device_locked: 'Máy này đang tạm khoá. Nhắn Zalo Tiệm nếu có nhầm lẫn.',
  need_entry: TICKET_MESSAGES.need_ticket,
  need_code_entry: 'Lấy mã cần đang ở quán: bạn chạm thẻ của quán (ở quầy hoặc trên bàn) hoặc quét mã QR của quán (nếu mở ra trang quán thì bấm lại nút “Nhận công cụ làm việc miễn phí”), rồi quay lại đây bấm lấy mã nhé. Không ở quán thì nhắn Zalo Tiệm.',
  no_account: 'Công cụ này tạm hết slot. Chọn công cụ khác hoặc quay lại sau nhé.',
  risk_high: 'Yêu cầu chưa được chấp nhận. Nếu có nhầm lẫn, nhắn Zalo cho Tiệm nhé.',
  need_review: 'Hiện chưa duyệt được, bạn quay lại sau nhé.',
  quarantined_apology: 'Tài khoản gặp sự cố nên Tiệm đã thu hồi. Lượt này không tính, bạn có thể nhận lại ngay.',
};

const LIVE = "('active', 'pending_approval', 'pending_invite')";
// Đang giữ chỗ trên tài khoản / nhóm: đang dùng, hoặc đang chờ bot mời vào nhóm (Canva).
const HOLDING = "('active', 'pending_invite')";
const EMAIL_RE = /^[^\s@<>()",;]+@[^\s@<>()",;]+\.[a-z]{2,}$/i;
const rejected = (code, message) => ({ status: 'rejected', code, message });

/**
 * Bắt đầu nhận slot. Xem CONTRACT.md mục 3.5 cho thứ tự kiểm tra và các kết quả trả về.
 */
export function startClaim(ctx, { customer, deviceId, ip, toolId, inviteEmail }) {
  const now = ctx.now();
  const s = ctx.settings();
  // Chủ tiệm đang thử (OWNER_IDS): luôn nhận được tài khoản mới — bỏ qua khoá, hạn mức, chấm rủi ro. Vẫn phải ở quán + kho còn hàng.
  const owner = isOwner(ctx, customer);
  if (!owner && isCustomerLocked(customer, now)) return rejected('customer_locked', MSG.customer_locked);
  const device = get(ctx.db, 'SELECT * FROM devices WHERE id = ?', deviceId);
  if (!owner && device?.status === 'locked') return rejected('device_locked', MSG.device_locked);

  // Lượt vào còn hạn = khách vừa mở trang quán bằng thẻ / mã QR trên bàn (vé từ QS) → đang ở quán. Không có cách nào khác.
  const entry = latestEntry(ctx, deviceId);
  if (!entry) return { status: 'need_entry', message: MSG.need_entry };
  const card = get(ctx.db, 'SELECT * FROM cards WHERE id = ?', entry.cardId);
  const cafe = get(ctx.db, 'SELECT * FROM cafes WHERE id = ?', entry.cafeId);
  if (!card || card.status !== 'active') return rejected('card_locked', 'Thẻ này đang tạm khoá.');
  if (!cafe || cafe.status !== 'active') return rejected('cafe_paused', PRESENCE_MESSAGES.cafe_paused);
  if (!isCafeOpen(cafe, now, s.timezoneOffsetMin)) return rejected('cafe_closed', PRESENCE_MESSAGES.cafe_closed);

  const tool = get(ctx.db, 'SELECT * FROM tools WHERE id = ?', Number(toolId) || 0);
  if (!tool || !tool.enabled) return rejected('tool_disabled', 'Công cụ này tạm ngưng.');
  // Canva: khách dùng tài khoản của chính mình, Tiệm (bot) mời email đó vào nhóm Pro.
  let email = null;
  if (tool.login_type === 'team_invite') {
    email = String(inviteEmail || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return rejected('invite_email_required', `Nhập email tài khoản ${tool.name} của bạn để Tiệm mời vào nhóm.`);
  }

  const result = tx(ctx.db, () => {
    const q = checkClaimQuota(ctx, { customer, tool, cafe, card, deviceId });
    if (!q.ok) return rejected(q.code, q.message);
    if (!hasStock(ctx, tool, cafe.id)) return { status: 'unavailable', code: 'no_account', message: MSG.no_account };

    const prior = get(ctx.db, "SELECT COUNT(*) AS n, COALESCE(SUM(device_id = ?), 0) AS same FROM slots WHERE customer_id = ? AND status != 'rejected'", deviceId, customer.id);
    const risk = owner ? { level: 'green', score: 0, reasons: ['owner'] } : scoreClaim(ctx, {
      customer, device, tool, cafe, entry,
      otherPhones: deviceOtherPhones(ctx, deviceId, customer.id),
      isNewDevice: prior.n > 0 && prior.same === 0,
    });
    const insertSlot = (status, endReason = null) => run(ctx.db,
      `INSERT INTO slots(customer_id, tool_id, cafe_id, card_id, device_id, status, risk_score, risk_reasons, invite_email, created_at, ended_at, end_reason)
       VALUES(:customerId, :toolId, :cafeId, :cardId, :deviceId, :status, :score, :reasons, :email, :now, :endedAt, :endReason)`,
      {
        customerId: customer.id, toolId: tool.id, cafeId: cafe.id, cardId: card.id, deviceId, status,
        score: risk.score, reasons: JSON.stringify(risk.reasons), email, now,
        endedAt: status === 'rejected' ? now : null, endReason,
      }).lastInsertRowid;
    const ev = { customerId: customer.id, deviceId, cardId: card.id, cafeId: cafe.id, ip };

    if (risk.level === 'red') {
      const slotId = insertSlot('rejected', 'risk_high');
      logEvent(ctx, { ...ev, type: 'claim_red', severity: 'red', slotId, data: { tool: tool.slug, score: risk.score, reasons: risk.reasons } });
      return { ...rejected('risk_high', MSG.risk_high), slotId };
    }
    // Rủi ro vừa (vàng): không ai duyệt tay — làm theo cài đặt yellowAction (mặc định từ chối; approve = cho qua như xanh).
    if (risk.level === 'yellow') {
      if (s.yellowAction !== 'approve') {
        const slotId = insertSlot('rejected', 'need_review');
        logEvent(ctx, { ...ev, type: 'claim_yellow_rejected', severity: 'yellow', slotId, data: { tool: tool.slug, score: risk.score, reasons: risk.reasons } });
        return { ...rejected('need_review', MSG.need_review), slotId };
      }
      logEvent(ctx, { ...ev, type: 'claim_yellow_passed', severity: 'yellow', data: { tool: tool.slug, score: risk.score, reasons: risk.reasons } });
    }
    // Ghi slot rồi gán tài khoản ngay trong cùng giao dịch ('pending_approval' chỉ là trạng thái tạm, không ai nhìn thấy).
    const slotId = insertSlot('pending_approval');
    const a = activateSlot(ctx, slotId);
    if (!a.ok) {
      run(ctx.db, "UPDATE slots SET status = 'rejected', ended_at = ?, end_reason = 'no_account' WHERE id = ?", now, slotId);
      return { status: 'unavailable', code: 'no_account', message: MSG.no_account };
    }
    logEvent(ctx, { ...ev, type: 'claim_green', slotId, data: { tool: tool.slug, score: risk.score } });
    noteCafeFull(ctx, cafe);
    return { status: a.status, slotId };
  });
  return result;
}

/**
 * Lúc hết lượt của khách:
 *  - end_hour (ChatGPT / Claude): mọi khách trong ngày cùng hết lúc end_hour giờ tới (vd. 6h sáng hôm sau) → cuối ngày chủ đăng xuất
 *    mọi thiết bị 1 lần cho mỗi tài khoản.
 *  - còn lại: đủ slot_hours kể từ lúc nhận.
 *  - tài khoản tự hết Pro (account_days, hoặc dùng 1 lần): không hứa quá ngày tài khoản tự hết.
 */
export function slotEnd(ctx, tool, now, account = null) {
  let end = tool.end_hour != null ? nextLocalHour(now, tool.end_hour, ctx.settings().timezoneOffsetMin) : now + tool.slot_hours * HOUR;
  if (account && tool.reuse === 'once') end = Math.min(end, account.created_at + tool.slot_hours * HOUR);
  if (account && tool.account_days != null) end = Math.min(end, account.created_at + tool.account_days * DAY);
  return end;
}

/** Số Slot nhỏ nhất còn trống trên tài khoản dùng chung (1..max_holders). */
function freeSeat(ctx, account) {
  const used = new Set(all(ctx.db, `SELECT seat FROM slots WHERE account_id = ? AND status IN ${HOLDING} AND seat IS NOT NULL`, account.id).map((r) => r.seat));
  for (let n = 1; n <= Math.max(account.max_holders, used.size + 1); n++) if (!used.has(n)) return n;
  return null;
}

/**
 * Gán tài khoản (hoặc mã nhận quà) và bắt đầu tính giờ. Canva (team_invite): giữ ghế trong nhóm, giao việc mời cho bot,
 * chỉ tính giờ khi bot (hoặc chủ) mời xong — markInvited.
 * → {ok:true, status} | {ok:false, code:'no_account'}
 */
export function activateSlot(ctx, slotId) {
  return tx(ctx.db, () => {
    const now = ctx.now();
    const slot = get(ctx.db, 'SELECT * FROM slots WHERE id = ?', slotId);
    if (!slot) return { ok: false, code: 'not_found' };
    const tool = get(ctx.db, 'SELECT * FROM tools WHERE id = ?', slot.tool_id);
    if (tool.login_type === 'redeem') {
      const code = pickRedeem(ctx, tool.id);
      if (!code) return { ok: false, code: 'no_account' };
      run(ctx.db, "UPDATE redeem_codes SET status = 'given', slot_id = ?, given_at = ? WHERE id = ? AND status = 'ready'", slot.id, now, code.id);
      run(ctx.db, "UPDATE slots SET status = 'active', redeem_id = ?, started_at = ?, expires_at = ? WHERE id = ?",
        code.id, now, slotEnd(ctx, tool, now), slot.id);
      logEvent(ctx, { type: 'slot_started', customerId: slot.customer_id, slotId: slot.id, data: { redeemId: code.id } });
      noteSoldOut(ctx, tool, slot.cafe_id);
      return { ok: true, status: 'active' };
    }
    const account = pickAccount(ctx, tool, slot.cafe_id);
    if (!account) return { ok: false, code: 'no_account' };
    const seat = account.max_holders > 1 ? freeSeat(ctx, account) : null;
    if (tool.login_type === 'team_invite') {
      run(ctx.db, 'UPDATE accounts SET last_assigned_at = ? WHERE id = ?', now, account.id);
      run(ctx.db, "UPDATE slots SET status = 'pending_invite', account_id = ?, seat = ? WHERE id = ?", account.id, seat, slot.id);
      createTask(ctx, { accountId: account.id, slotId: slot.id, kind: 'invite_member', reason: 'claim', detail: slot.invite_email });
      logEvent(ctx, { type: 'slot_pending_invite', customerId: slot.customer_id, accountId: account.id, slotId: slot.id });
      noteSoldOut(ctx, tool, slot.cafe_id);
      return { ok: true, status: 'pending_invite' };
    }
    run(ctx.db, 'UPDATE accounts SET last_assigned_at = ? WHERE id = ?', now, account.id);
    // Tài khoản dùng 1 lần (CapCut / Adobe / Claude): Pro tự hết sau slot_hours kể từ lúc nhập kho (≈ lúc tạo) → khách nhận muộn
    // chỉ còn phần còn lại, đồng hồ trên trang khách không được hứa quá ngày tài khoản tự hết.
    const end = slotEnd(ctx, tool, now, account);
    run(ctx.db, "UPDATE slots SET status = 'active', account_id = ?, seat = ?, started_at = ?, expires_at = ? WHERE id = ?",
      account.id, seat, now, end, slot.id);
    logEvent(ctx, { type: 'slot_started', customerId: slot.customer_id, accountId: account.id, slotId: slot.id, data: seat ? { seat } : null });
    noteSoldOut(ctx, tool, slot.cafe_id);
    return { ok: true, status: 'active' };
  });
}

/**
 * Vận hành độc lập: công cụ vừa giao lượt cuối (hết kho hoặc hết lượt / ngày) → báo chủ trên trang Theo dõi, mỗi loại 1 lần / ngày.
 * Hết kho = đỏ (có âm báo: nạp hàng ngay); hết lượt / ngày = vàng (chủ quyết có nâng lượt không).
 */
/** Quán vừa dùng hết suất / ngày → báo chủ (vàng, 1 lần / quán / ngày): khách tới sau sẽ không nhận được, chủ quyết có nâng suất không. */
function noteCafeFull(ctx, cafe) {
  const day = startOfLocalDay(ctx.now(), ctx.settings().timezoneOffsetMin);
  const used = get(ctx.db, `SELECT COUNT(*) AS n FROM slots WHERE cafe_id = ? AND created_at >= ? AND ${COUNTED}`, cafe.id, day).n;
  if (used < cafe.daily_quota || !hit(ctx, `cafefull:${cafe.id}:${day}`, 1, 26 * HOUR).ok) return;
  logEvent(ctx, { type: 'cafe_full', severity: 'yellow', cafeId: cafe.id, data: { reason: `đã giao đủ ${cafe.daily_quota} suất hôm nay — khách tới sau sẽ không nhận được` } });
}

function noteSoldOut(ctx, tool, cafeId = null) {
  const x = toolAvailability(ctx).find((a) => a.tool.id === tool.id);
  // Cả hệ thống còn hàng nhưng kho riêng của quán này + kho chung đã hết → khách ở quán này "Tạm hết" dù quán khác còn: báo riêng quán.
  if (x && x.free > 0 && cafeId != null) return noteCafeSoldOut(ctx, tool, cafeId);
  if (!x || x.free > 0) return;
  const capHit = tool.daily_cap != null && toolUsedToday(ctx, tool.id) >= tool.daily_cap;
  const day = startOfLocalDay(ctx.now(), ctx.settings().timezoneOffsetMin);
  if (!hit(ctx, `soldout:${tool.id}:${day}:${capHit ? 'cap' : 'stock'}`, 1, 26 * HOUR).ok) return;
  logEvent(ctx, { type: capHit ? 'tool_daily_cap' : 'tool_sold_out', severity: capHit ? 'yellow' : 'red',
    data: { tool: tool.name, reason: capHit ? `đã giao đủ ${tool.daily_cap} lượt hôm nay` : 'hết tài khoản trong kho — nạp hàng' } });
}

function noteCafeSoldOut(ctx, tool, cafeId) {
  const x = toolAvailability(ctx, null, cafeId).find((a) => a.tool.id === tool.id);
  if (!x || x.free > 0 || (tool.daily_cap != null && toolUsedToday(ctx, tool.id) >= tool.daily_cap)) return;
  const day = startOfLocalDay(ctx.now(), ctx.settings().timezoneOffsetMin);
  if (!hit(ctx, `soldout:${tool.id}:${day}:cafe${cafeId}`, 1, 26 * HOUR).ok) return;
  logEvent(ctx, { type: 'tool_sold_out', severity: 'red', cafeId,
    data: { tool: tool.name, reason: 'hết kho riêng của quán và kho chung (quán khác vẫn còn) — nạp hàng cho quán này' } });
}

/** Bot (hoặc chủ) đã mời khách vào nhóm → bắt đầu tính giờ. */
export function markInvited(ctx, slotId, by = 'admin') {
  return tx(ctx.db, () => {
    const now = ctx.now();
    const slot = get(ctx.db, "SELECT * FROM slots WHERE id = ? AND status = 'pending_invite'", slotId);
    if (!slot) return { ok: false, message: 'Slot không còn chờ mời.' };
    const tool = get(ctx.db, 'SELECT * FROM tools WHERE id = ?', slot.tool_id);
    run(ctx.db, "UPDATE slots SET status = 'active', started_at = ?, expires_at = ? WHERE id = ?", now, slotEnd(ctx, tool, now), slotId);
    run(ctx.db, "UPDATE rotation_tasks SET status = 'done', done_at = ?, done_by = ?, lease_until = NULL WHERE slot_id = ? AND kind = 'invite_member' AND status = 'todo'", now, by, slotId);
    logEvent(ctx, { type: 'slot_started', customerId: slot.customer_id, accountId: slot.account_id, slotId, data: { invitedBy: by } });
    return { ok: true, message: 'Đã mời — bắt đầu tính giờ cho khách.' };
  });
}

/**
 * Người đang giữ tài khoản mà việc "làm mới" (đăng xuất mọi thiết bị) phải chờ họ hết giờ. Khách đã gia hạn của công cụ hết lượt
 * cùng giờ (6h) KHÔNG phải chờ: họ còn chạy qua lần làm mới này, bot giữ Project của họ, họ đăng nhập lại (lấy mã không cần phiếu).
 */
export function blockingHolders(ctx, accountId, exceptSlotId = 0) {
  return get(ctx.db,
    `SELECT COUNT(*) AS n FROM slots s JOIN tools t ON t.id = s.tool_id
     WHERE s.account_id = ? AND s.status IN ${HOLDING} AND s.id != ?
       AND NOT (t.end_hour IS NOT NULL AND s.code_free = 1 AND s.expires_at > ?)`, accountId, exceptSlotId, ctx.now() + HOUR).n;
}

/** Chỗ của khách đã gia hạn trên tài khoản (bot giữ Project của họ khi làm mới). → [{seat, slotId, expiresAt}] */
export function keptSeats(ctx, accountId) {
  return all(ctx.db,
    `SELECT s.seat, s.id AS slotId, s.expires_at AS expiresAt FROM slots s JOIN tools t ON t.id = s.tool_id
     WHERE s.account_id = ? AND s.status IN ${HOLDING} AND t.end_hour IS NOT NULL AND s.code_free = 1 AND s.expires_at > ?
     ORDER BY s.seat`, accountId, ctx.now() + HOUR);
}

/**
 * Món có Project (workspace) riêng cho từng khách trên tài khoản dùng chung: chỉ ChatGPT, Claude (hoặc món bật "Làm mới mỗi ngày").
 * CapCut, Adobe… dùng chung mà không có Project → khách không thấy "Slot N" (chủ báo 08/10/2026).
 */
const PROJECT_TOOLS = new Set(['chatgpt', 'claude']);
export const hasProjects = (tool) => !!tool && (PROJECT_TOOLS.has(tool.slug) || !!tool.workspace_bot);

/** Tên workspace (Project) của chỗ n: "<workspacePrefix> n". */
export const workspaceName = (ctx, seat) => `${ctx.settings().workspacePrefix || 'Slot'} ${seat}`;

export function createTask(ctx, { accountId, slotId, kind, reason, detail }) {
  return run(ctx.db,
    "INSERT INTO rotation_tasks(account_id, slot_id, kind, reason, detail, status, created_at) VALUES(?, ?, ?, ?, ?, 'todo', ?)",
    accountId, slotId, kind, reason, detail, ctx.now()).lastInsertRowid;
}

/**
 * Kết thúc slot (hết hạn / thu hồi). Slot đang chờ duyệt thì chuyển 'rejected'.
 * Tạo việc tay đổi mật khẩu + đăng xuất (nếu tool yêu cầu).
 */
export function endSlot(ctx, slotId, { status, reason, by = 'system' }) {
  const r = tx(ctx.db, () => {
    const now = ctx.now();
    const slot = get(ctx.db, `SELECT * FROM slots WHERE id = ? AND status IN ${LIVE}`, slotId);
    if (!slot) return { ok: false };
    const final = slot.status === 'pending_approval' ? 'rejected' : status;
    run(ctx.db, 'UPDATE slots SET status = ?, ended_at = ?, end_reason = ? WHERE id = ?', final, now, reason, slotId);
    // Đóng cả lượt đã nhận mã: slot kết thúc thì khách không được thấy thêm mã nào của tài khoản này nữa.
    run(ctx.db, "UPDATE code_windows SET status = 'cancelled', code = NULL WHERE slot_id = ? AND status IN ('open', 'delivered')", slotId);
    if (slot.account_id) {
      const tool = get(ctx.db, 'SELECT * FROM tools WHERE id = ?', slot.tool_id);
      const others = get(ctx.db, `SELECT COUNT(*) AS n FROM slots WHERE account_id = ? AND status IN ${HOLDING}`, slot.account_id).n;
      if (tool.login_type === 'team_invite') {
        // Chưa mời thì chỉ huỷ việc mời; đã mời rồi thì giao bot gỡ khách ra khỏi nhóm.
        const invite = run(ctx.db,
          "UPDATE rotation_tasks SET status = 'cancelled', done_at = ?, done_by = ?, lease_until = NULL WHERE slot_id = ? AND kind = 'invite_member' AND status = 'todo'",
          now, by, slotId);
        if (!invite.changes) createTask(ctx, { accountId: slot.account_id, slotId, kind: 'remove_member', reason: reasonOf(status), detail: slot.invite_email });
      } else if (tool.reuse === 'once') {
        // Tài khoản dùng 1 lần (vd. CapCut Pro dùng thử 7 ngày): không còn ai dùng → bỏ, không cần đổi mật khẩu.
        // Bỏ cả khi chưa đủ lượt (diễn tập vận hành): Pro dùng thử tính từ lúc tạo tài khoản, người đầu hết hạn thì
        // người sau gần như không còn Pro. Riêng thu hồi vì lỗi phía Tiệm thì tài khoản đã bị cách ly, không đụng.
        const account = get(ctx.db, 'SELECT max_holders FROM accounts WHERE id = ?', slot.account_id);
        const uses = get(ctx.db, "SELECT COUNT(*) AS n FROM slots WHERE account_id = ? AND status != 'rejected'", slot.account_id).n;
        if (others === 0 && final !== 'rejected') {
          run(ctx.db, "UPDATE accounts SET status = 'retired', status_reason = ? WHERE id = ? AND status = 'ready'",
            uses >= account.max_holders ? 'Đã dùng hết lượt' : 'Người dùng cuối đã hết hạn (Pro dùng thử tính từ lúc tạo tài khoản)', slot.account_id);
        }
      } else if (tool.rotation_required && get(ctx.db, 'SELECT status FROM accounts WHERE id = ?', slot.account_id)?.status !== 'retired') {
        // Tài khoản đã "Ngừng dùng" thì không giao nữa → không sinh việc đổi mật khẩu (trước đây sinh việc không bỏ được).
        run(ctx.db, "UPDATE accounts SET status = 'needs_rotation', status_reason = ? WHERE id = ? AND status = 'ready'", `Slot #${slotId} kết thúc`, slot.account_id);
        const exists = get(ctx.db, "SELECT 1 FROM rotation_tasks WHERE account_id = ? AND kind = 'rotate' AND status = 'todo'", slot.account_id);
        // Tài khoản dùng chung: hết hạn thì chờ người cuối cùng hết mới tạo việc đổi mật khẩu (đăng xuất mọi thiết bị
        // sẽ đá cả người đang dùng). Bị thu hồi (vi phạm) thì tạo ngay. Khách đã gia hạn không phải chờ (blockingHolders).
        if (!exists && (blockingHolders(ctx, slot.account_id, slotId) === 0 || status === 'revoked')) {
          createTask(ctx, { accountId: slot.account_id, slotId, kind: 'rotate', reason: reasonOf(status), detail: null });
        }
      }
    }
    logEvent(ctx, { type: `slot_${final}`, customerId: slot.customer_id, accountId: slot.account_id, slotId, data: { reason, by } });
    return { ok: true, status: final };
  });
  return r;
}

const reasonOf = (status) => (status === 'expired' ? 'slot_expired' : 'slot_revoked');

export const revokeSlot = (ctx, slotId, reason, by = 'admin') => endSlot(ctx, slotId, { status: 'revoked', reason, by });

/** Slot đã quá giờ → kết thúc. Trả về số slot đã xử lý. */
export function expireDueSlots(ctx) {
  const due = all(ctx.db, "SELECT id FROM slots WHERE status = 'active' AND expires_at <= ?", ctx.now());
  let n = 0;
  for (const { id } of due) if (endSlot(ctx, id, { status: 'expired', reason: 'expired', by: 'system' }).ok) n++;
  return n;
}

/** Chủ bấm "Xong" một việc tay. → {ok, message} */
export function completeTask(ctx, taskId, { by = 'admin', newPassword, keepPassword = false, newTotp, workspaces = null } = {}) {
  return tx(ctx.db, () => {
    const now = ctx.now();
    const task = get(ctx.db, 'SELECT * FROM rotation_tasks WHERE id = ?', taskId);
    if (!task) return { ok: false, message: 'Không tìm thấy việc này.' };
    if (task.status !== 'todo') return { ok: false, message: 'Việc này đã xử lý rồi.' };
    if (task.kind === 'invite_member') {
      const r = markInvited(ctx, task.slot_id, by);
      if (!r.ok) run(ctx.db, "UPDATE rotation_tasks SET status = 'cancelled', done_at = ?, done_by = ? WHERE id = ?", now, by, taskId);
      return r.ok ? r : { ok: false, message: 'Slot không còn chờ mời nên đã huỷ việc này.' };
    }
    if (task.kind === 'remove_member') {
      run(ctx.db, "UPDATE rotation_tasks SET status = 'done', done_at = ?, done_by = ?, lease_until = NULL WHERE id = ?", now, by, taskId);
      logEvent(ctx, { type: 'task_done', accountId: task.account_id, slotId: task.slot_id, data: { taskId, kind: task.kind, by } });
      return { ok: true, message: 'Đã gỡ khách khỏi nhóm.' };
    }
    // Diễn tập vận hành: chủ đổi mật khẩu bên hãng rồi bấm "Đã xong" quên dán mật khẩu mới → kho giữ mật khẩu cũ,
    // khách sau nhận mật khẩu sai. Nên tài khoản đăng nhập bằng mật khẩu phải có mật khẩu mới. Riêng loại có 2FA (ChatGPT)
    // được giữ mật khẩu cũ nếu chủ tick rõ "chỉ đăng xuất" (khách cũ không có mã 2FA nên không vào lại được).
    const loginType = get(ctx.db, 'SELECT t.login_type FROM accounts a JOIN tools t ON t.id = a.tool_id WHERE a.id = ?', task.account_id)?.login_type;
    if (task.kind === 'rotate' && !newPassword) {
      if (loginType === 'password') return { ok: false, message: 'Dán mật khẩu mới vào ô rồi bấm Đã xong (tài khoản không có 2FA: giữ mật khẩu cũ thì khách cũ vẫn vào lại được).' };
      // Bị cách ly = hãng báo mật khẩu / 2FA vừa bị đổi → mật khẩu trong kho chắc chắn đã sai.
      if (loginType === 'password_totp' && task.reason === 'quarantine') return { ok: false, message: 'Tài khoản bị cách ly vì mật khẩu / 2FA bị đổi: lấy lại tài khoản, dán mật khẩu mới (và khoá 2FA mới nếu 2FA cũng bị đổi).' };
      if (loginType === 'password_totp' && !keepPassword) return { ok: false, message: 'Dán mật khẩu mới, hoặc tick "Giữ mật khẩu cũ — chỉ đăng xuất mọi thiết bị".' };
    }
    let totpEnc = null;
    if (newTotp) {
      const secret = parseTotpSecret(newTotp);
      if (!secret) return { ok: false, message: 'Khoá 2FA mới không hợp lệ (dán chuỗi chữ hoặc link otpauth://).' };
      totpEnc = encrypt(secret, ctx.config.dataKey);
    }
    run(ctx.db, "UPDATE rotation_tasks SET status = 'done', done_at = ?, done_by = ? WHERE id = ?", now, by, taskId);
    logEvent(ctx, { type: 'task_done', accountId: task.account_id, slotId: task.slot_id, data: { taskId, kind: task.kind, by } });
    // Việc tay duy nhất: đổi mật khẩu + đăng xuất (rotate).
    if (newPassword) run(ctx.db, 'UPDATE accounts SET password_enc = ? WHERE id = ?', encrypt(newPassword, ctx.config.dataKey), task.account_id);
    if (totpEnc) run(ctx.db, 'UPDATE accounts SET totp_enc = ? WHERE id = ?', totpEnc, task.account_id);
    run(ctx.db, 'UPDATE accounts SET last_rotated_at = ? WHERE id = ?', now, task.account_id);
    const holders = blockingHolders(ctx, task.account_id);
    const otherRotate = get(ctx.db, "SELECT COUNT(*) AS n FROM rotation_tasks WHERE account_id = ? AND kind = 'rotate' AND status = 'todo'", task.account_id).n;
    if (workspaces) saveWorkspaces(ctx, task.account_id, workspaces);
    if (holders === 0 && otherRotate === 0) {
      run(ctx.db, "UPDATE accounts SET status = 'ready', status_reason = NULL WHERE id = ? AND status IN ('needs_rotation', 'quarantined')", task.account_id);
      const kept = keptSeats(ctx, task.account_id).length;
      return { ok: true, message: kept ? `Tài khoản đã sẵn sàng giao tiếp (giữ ${kept} chỗ của khách đã gia hạn).` : 'Tài khoản đã sẵn sàng giao tiếp.' };
    }
    return { ok: true, message: holders ? `Đã ghi nhận. Tài khoản còn ${holders} người đang dùng nên chưa mở lại.` : 'Đã ghi nhận. Còn việc đổi mật khẩu khác chưa xong.' };
  });
}

/**
 * Bot vừa tạo lại Project trên tài khoản → lưu tên + link từng chỗ. workspaces: [{seat, name, url}].
 * Link chỉ nhận https:// cùng miền với trang đăng nhập của công cụ (không để bot / dữ liệu lạ đưa khách sang trang khác).
 */
export function saveWorkspaces(ctx, accountId, workspaces) {
  const tool = get(ctx.db, 'SELECT t.* FROM accounts a JOIN tools t ON t.id = a.tool_id WHERE a.id = ?', accountId);
  const account = get(ctx.db, 'SELECT max_holders FROM accounts WHERE id = ?', accountId);
  if (!tool || !account || !Array.isArray(workspaces)) return 0;
  let host = null;
  try { host = new URL(tool.login_url).hostname.replace(/^(www|auth)\./, ''); } catch { host = null; }
  let n = 0;
  for (const w of workspaces.slice(0, 50)) {
    const seat = Number.parseInt(w?.seat, 10);
    if (!(seat >= 1 && seat <= account.max_holders)) continue;
    let url = null;
    try {
      const u = new URL(String(w.url || ''));
      if (u.protocol === 'https:' && host && (u.hostname === host || u.hostname.endsWith(`.${host}`))) url = u.href;
    } catch { url = null; }
    const name = String(w.name || workspaceName(ctx, seat)).replace(/\s+/g, ' ').trim().slice(0, 60);
    run(ctx.db, `INSERT INTO workspaces(account_id, seat, name, url, updated_at) VALUES(?, ?, ?, ?, ?)
                 ON CONFLICT(account_id, seat) DO UPDATE SET name = excluded.name, url = excluded.url, updated_at = excluded.updated_at`,
      accountId, seat, name, url, ctx.now());
    n++;
  }
  return n;
}

/**
 * Dữ liệu cho trang "Slot của tôi". Ưu tiên slot đang chạy/chờ; nếu không có, slot vừa kết thúc trong 24 giờ.
 */
export function currentSlotView(ctx, customerId, deviceId) {
  const now = ctx.now();
  const s = ctx.settings();
  const slot = get(ctx.db, `SELECT * FROM slots WHERE customer_id = ? AND status IN ${LIVE} ORDER BY id DESC LIMIT 1`, customerId)
    || get(ctx.db, "SELECT * FROM slots WHERE customer_id = ? AND status IN ('expired', 'revoked', 'rejected') AND COALESCE(ended_at, created_at) > ? ORDER BY id DESC LIMIT 1", customerId, now - DAY);
  if (!slot) return null;
  const tool = get(ctx.db, 'SELECT id, name, slug, login_type, login_url, instructions, mail_code, slot_hours, end_hour FROM tools WHERE id = ?', slot.tool_id);
  const account = slot.account_id ? get(ctx.db, 'SELECT id, login_email, password_enc, totp_enc, max_holders FROM accounts WHERE id = ?', slot.account_id) : null;
  const deviceMatches = slot.device_id === deviceId;
  const active = slot.status === 'active';

  let password = null;
  if (active && deviceMatches && (tool.login_type === 'password' || tool.login_type === 'password_totp') && account?.password_enc) {
    try { password = decrypt(account.password_enc, ctx.config.dataKey); } catch { password = null; }
    if (password && !slot.password_shown_at) run(ctx.db, 'UPDATE slots SET password_shown_at = ? WHERE id = ?', now, slot.id);
  }
  let redeem = null;
  if (active && deviceMatches && slot.redeem_id) {
    const r = get(ctx.db, 'SELECT value FROM redeem_codes WHERE id = ?', slot.redeem_id);
    if (r) redeem = { value: r.value, isLink: /^https:\/\//i.test(r.value) };
  }
  const ws = active && slot.seat && account ? get(ctx.db, 'SELECT name, url FROM workspaces WHERE account_id = ? AND seat = ?', account.id, slot.seat) : null;
  const fullTool = get(ctx.db, 'SELECT * FROM tools WHERE id = ?', slot.tool_id);
  const needVoucher = slotNeedsVoucher(s, fullTool, slot);
  const extendReq = active ? get(ctx.db, "SELECT days, created_at FROM extend_requests WHERE slot_id = ? AND status = 'pending'", slot.id) : null;
  const win = active ? get(ctx.db,
    "SELECT id, status, expires_at FROM code_windows WHERE slot_id = ? AND status = 'open' AND expires_at > ? ORDER BY id DESC LIMIT 1", slot.id, now) : null;

  return {
    slotId: slot.id,
    status: slot.status,
    tool,
    // Canva: khách đăng nhập bằng tài khoản của chính mình, không cần biết tài khoản nhóm của Tiệm.
    accountEmail: active && tool.login_type !== 'team_invite' ? account?.login_email ?? null : null,
    inviteEmail: slot.invite_email,
    password,
    seat: slot.seat,
    seatTotal: account?.max_holders ?? null,
    // Workspace (Project) của khách — chỉ món có Project (hasProjects): tên theo số chỗ; có link khi bot đã tạo (ChatGPT).
    workspace: slot.seat && account?.max_holders > 1 && hasProjects(fullTool) ? { name: ws?.name || workspaceName(ctx, slot.seat), url: ws?.url || null } : null,
    needVoucher,
    hasBoundVoucher: needVoucher && !!boundVoucher(ctx, customerId, fullTool, slot.cafe_id),
    hasAutoVoucher: needVoucher && deviceMatches && !!deviceVoucher(ctx, { deviceId, customerId, tool: fullTool, cafeId: slot.cafe_id }),
    extendedDays: slot.extended_days || 0,
    canExtend: active && deviceMatches && tool.login_type !== 'redeem',
    extendRequest: extendReq ? { days: extendReq.days, at: extendReq.created_at } : null,
    redeem,
    hasTotp: tool.login_type === 'password_totp',
    canMailCode: tool.login_type === 'email_code' || (!!tool.mail_code && (tool.login_type === 'password' || tool.login_type === 'password_totp')),
    totpOpen: active && slot.totp_until != null && slot.totp_until > now && slot.totp_device === deviceId,
    startedAt: slot.started_at,
    expiresAt: slot.expires_at,
    deviceMatches,
    cafeId: slot.cafe_id, // cảnh riêng của quán trên trang vé
    codeRequests: slot.code_used,
    codeRequestsLeft: codesLeft(s, slot, fullTool),
    needTap: slotNeedsTap(s, slot),
    // Lấy mã cần đang ở quán: lượt chạm / vé còn hạn tới lúc này (null = phải chạm lại thẻ của quán).
    atCafeUntil: (() => { const e = active && deviceMatches ? latestEntry(ctx, deviceId) : null; return e ? e.at + s.entryTtlMin * 60_000 : null; })(),
    openWindow: win ? { id: win.id, expiresAt: win.expires_at } : null,
    endedAt: slot.ended_at,
    endReason: slot.end_reason,
  };
}
