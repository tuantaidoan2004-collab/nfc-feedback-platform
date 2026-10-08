// Hạn mức cứng khi nhận slot + chọn tài khoản trong kho.
import { get, all } from '../db/index.js';
import { startOfLocalDay, startOfLocalMonth, localParts, nextLocalHour, DAY, MIN } from '../lib/time.js';

// Slot "có tính lượt": không bị từ chối, và không kết thúc vì lỗi phía Tiệm (kể cả chủ huỷ slot Canva chưa mời được — vd. khách gõ sai email).
export const COUNTED = "status != 'rejected' AND (end_reason IS NULL OR end_reason NOT IN ('account_quarantined', 'no_account', 'refund', 'admin_cancelled'))";
const LIVE = "('active', 'pending_approval', 'pending_invite')";

const no = (code, message) => ({ ok: false, code, message });
const p2 = (n) => String(n).padStart(2, '0');

/** Khách là chủ tiệm đang thử (OWNER_IDS trong .env) → luôn nhận được tài khoản mới. */
export function isOwner(ctx, customer) {
  const ids = ctx.config?.ownerIds;
  return Boolean(customer?.phone && ids?.length && ids.includes(String(customer.phone).toLowerCase()));
}

/**
 * Kiểm tra mọi hạn mức. Phải gọi trong cùng transaction với lệnh tạo slot.
 * → {ok:true} | {ok:false, code, message}
 */
export function checkClaimQuota(ctx, { customer, tool, cafe, card, deviceId }) {
  const s = ctx.settings();
  const now = ctx.now();
  const off = s.timezoneOffsetMin;
  const dayStart = startOfLocalDay(now, off);
  const n = (sql, ...p) => get(ctx.db, sql, ...p).n;

  if (!tool || !tool.enabled) return no('tool_disabled', 'Công cụ này tạm ngưng.');
  if (isOwner(ctx, customer)) return { ok: true };

  if (n(`SELECT COUNT(*) AS n FROM slots WHERE customer_id = ? AND status IN ${LIVE}`, customer.id) >= s.activeSlotsPerCustomer) {
    return no('has_active_slot', 'Bạn đang có 1 slot. Dùng hết hoặc chờ hết hạn rồi nhận tiếp nhé.');
  }
  if (n(`SELECT COUNT(*) AS n FROM slots WHERE device_id = ? AND customer_id != ? AND status IN ${LIVE}`, deviceId, customer.id) > 0) {
    return no('device_busy', 'Máy này đang giữ slot của một người khác.');
  }
  // Chỉ tính SĐT khác đã từng NHẬN slot trên máy này (đăng nhập nhờ máy bạn thì chưa tính),
  // để người nhận trước không bị chặn chỉ vì có người khác mượn máy đăng nhập.
  const otherClaimers = n(`SELECT COUNT(DISTINCT customer_id) AS n FROM slots WHERE device_id = ? AND customer_id != ? AND ${COUNTED}`, deviceId, customer.id);
  if (otherClaimers >= s.maxPhonesPerDevice) {
    return no('device_phone_limit', 'Máy này đã được dùng cho một người khác (email / số điện thoại khác).');
  }
  if (n(`SELECT COUNT(*) AS n FROM slots WHERE customer_id = ? AND created_at >= ? AND ${COUNTED}`, customer.id, dayStart) >= s.toolsPerDayPerCustomer) {
    return no('daily_limit', 'Mỗi ngày bạn nhận được 1 công cụ. Hẹn bạn ngày mai nhé!');
  }
  if (n(`SELECT COUNT(*) AS n FROM slots WHERE customer_id = ? AND created_at >= ? AND ${COUNTED}`, customer.id, startOfLocalMonth(now, off)) >= s.monthlyCapPerCustomer) {
    return no('monthly_limit', 'Bạn đã dùng hết lượt trải nghiệm của tháng này.');
  }
  const own = customerToolBlock(ctx, customer, tool) || toolClosing(ctx, tool);
  if (own) return no(own.code, own.message);
  if (tool.daily_cap != null && toolUsedToday(ctx, tool.id) >= tool.daily_cap) {
    return no('tool_daily_cap', `Hôm nay ${tool.name} đã hết suất. Chọn công cụ khác hoặc quay lại ngày mai nhé!`);
  }
  if (n(`SELECT COUNT(*) AS n FROM slots WHERE cafe_id = ? AND created_at >= ? AND ${COUNTED}`, cafe.id, dayStart) >= cafe.daily_quota) {
    return no('cafe_quota', 'Hôm nay quán đã hết suất trải nghiệm. Quay lại ngày mai nhé!');
  }
  // Thẻ NFC riêng có link cố định → giới hạn theo thẻ để link bị chép không vét hết suất của quán. Lối vào QS là của cả quán.
  // Quán 1 thẻ ở quầy POS (chủ chọn 08/10): hạn mức thẻ không thấp hơn suất / ngày của quán, khỏi phải chỉnh 2 chỗ.
  const cardCap = Math.max(s.cardDailyClaims, cafe.daily_quota || 0);
  if (card && card.kind !== 'qs' && n(`SELECT COUNT(*) AS n FROM slots WHERE card_id = ? AND created_at >= ? AND ${COUNTED}`, card.id, dayStart) >= cardCap) {
    return no('card_quota', 'Thẻ này đã hết suất hôm nay. Quay lại ngày mai nhé!');
  }
  return { ok: true };
}

/**
 * Khách này còn nhận được công cụ này không (chờ nhận lại / đã thử đủ số lần). → null | {code, message, short}
 * short: chữ ngắn hiện ngay trong danh sách chọn, để khách không bấm nhầm công cụ mình không nhận được.
 */
export function customerToolBlock(ctx, customer, tool) {
  const now = ctx.now();
  const off = ctx.settings().timezoneOffsetMin;
  const last = get(ctx.db, `SELECT MAX(created_at) AS t, COUNT(*) AS n FROM slots WHERE customer_id = ? AND tool_id = ? AND ${COUNTED}`, customer.id, tool.id);
  // Đủ số lần trước: đã hết lượt vĩnh viễn thì không hứa "nhận lại từ ngày …".
  if (last.n >= tool.lifetime_cap) {
    return { code: 'lifetime_cap', message: `Bạn đã trải nghiệm ${tool.name} đủ số lần. Nhắn Zalo Tiệm để có giá ưu đãi nhé.`, short: 'Đã thử đủ lần' };
  }
  if (last.t && last.t > now - tool.cooldown_days * DAY) {
    const d = localParts(last.t + tool.cooldown_days * DAY, off);
    return { code: 'cooldown', message: `Bạn đã thử ${tool.name} gần đây. Có thể nhận lại từ ${p2(d.day)}/${p2(d.month)}.`, short: `Đã thử · lại từ ${p2(d.day)}/${p2(d.month)}` };
  }
  return null;
}

/**
 * Công cụ hết lượt cùng giờ (end_hour, vd. ChatGPT / Claude tới 6h sáng): ngừng nhận trong endHourCloseMin phút trước giờ hết,
 * để khách không nhận lúc 5h45 rồi chỉ dùng được 15 phút mà vẫn mất lượt. → null | {code, message, short}
 */
export function toolClosing(ctx, tool) {
  const s = ctx.settings();
  const closeMin = Number(s.endHourCloseMin) || 0;
  if (tool.end_hour == null || closeMin <= 0) return null;
  const now = ctx.now();
  const end = nextLocalHour(now, tool.end_hour, s.timezoneOffsetMin);
  if (end - now > closeMin * MIN) return null;
  const from = localParts(end - closeMin * MIN, s.timezoneOffsetMin);
  const h = (p) => `${p.hour}h${p.minute ? p2(p.minute) : ''}`;
  return {
    code: 'tool_closing',
    message: `${tool.name} nghỉ nhận từ ${h(from)} tới ${tool.end_hour}h (lượt nào cũng hết lúc ${tool.end_hour}h, nhận bây giờ chỉ dùng được vài phút). Bạn quay lại sau ${tool.end_hour}h hoặc chọn công cụ khác nhé!`,
    short: `Mở lại lúc ${tool.end_hour}h`,
  };
}

// Chờ bot mời vào nhóm (Canva) cũng đã giữ 1 ghế.
const LOAD_SQL = "(SELECT COUNT(*) FROM slots s WHERE s.account_id = a.id AND s.status IN ('active', 'pending_invite'))";

/** Số chỗ đang dùng trên tài khoản. */
export function accountLoad(ctx, accountId) {
  return get(ctx.db, `SELECT ${LOAD_SQL} AS load FROM accounts a WHERE a.id = ?`, accountId)?.load ?? 0;
}

// Số lần tài khoản đã được giao (kể cả đã kết thúc) — cho công cụ "dùng 1 lần" (reuse = once).
const USES_SQL = "(SELECT COUNT(*) FROM slots s WHERE s.account_id = a.id AND s.status != 'rejected')";
// Chỗ còn giao được: rotate → max − đang dùng; once → max − max(đang dùng, đã từng giao).
const FREE_SQL = `CASE WHEN t.reuse = 'once' THEN a.max_holders - MAX(${LOAD_SQL}, ${USES_SQL}) ELSE a.max_holders - ${LOAD_SQL} END`;

// Công cụ "dùng 1 lần" (vd. CapCut Pro dùng thử): tài khoản nhập kho quá thời hạn 1 slot thì Pro dùng thử chắc chắn đã hết → không giao.
// Tham số kèm theo: giờ hiện tại (ms).
// Tài khoản tự hết Pro sau account_days ngày kể từ lúc nhập kho (Claude / CapCut / Adobe) → quá hạn thì không giao.
const FRESH_SQL = "(t.reuse != 'once' OR a.created_at > ? - t.slot_hours * 3600000) AND (t.account_days IS NULL OR a.created_at > ? - t.account_days * 86400000)";

// Tài khoản đủ thông tin cho kiểu đăng nhập của công cụ (đổi kiểu đăng nhập mà kho cũ thiếu mật khẩu / 2FA thì không giao).
export const USABLE_SQL = `((t.login_type NOT IN ('password', 'password_totp') OR a.password_enc IS NOT NULL)
  AND (t.login_type != 'password_totp' OR a.totp_enc IS NOT NULL))`;

// Kho riêng từng quán (chủ chọn 08/10): tài khoản gắn quán (accounts.cafe_id) chỉ giao cho khách ở quán đó; không gắn quán = kho chung.
// Tham số kèm theo: mã quán 2 lần (NULL = cả hệ thống, dùng cho trang quản trị / tổng kho).
const POOL_SQL = '(? IS NULL OR a.cafe_id IS NULL OR a.cafe_id = ?)';
const pool = (cafeId) => [cafeId ?? null, cafeId ?? null];

const toolOf = (ctx, tool) => (typeof tool === 'object' && tool ? tool : get(ctx.db, 'SELECT * FROM tools WHERE id = ?', Number(tool) || 0));

/**
 * Tài khoản dự phòng đang được giữ lại (tools.reserve_account = 1) → id | null.
 * Công cụ hết lượt cùng giờ (6h sáng): mọi tài khoản có người dùng hôm qua đều chờ chủ "Đăng xuất mọi thiết bị" → khách tới sáng sớm
 * gặp "Tạm hết". Nên giữ 1 tài khoản không ai dùng: trong ngày không giao; có tài khoản đang chờ đăng xuất / cách ly thì mới giao.
 * Chỉ giữ khi công cụ còn ít nhất 2 tài khoản giao được (1 tài khoản thì giao bình thường). Giữ đúng cái mà pickAccount sẽ chọn sau cùng.
 */
export function reserveAccountId(ctx, tool) {
  const t = toolOf(ctx, tool);
  if (!t?.reserve_account || t.login_type === 'redeem') return null;
  if (get(ctx.db, "SELECT 1 FROM accounts WHERE tool_id = ? AND status IN ('needs_rotation', 'quarantined') LIMIT 1", t.id)) return null;
  const ready = all(ctx.db,
    `SELECT a.id, ${LOAD_SQL} AS load FROM accounts a JOIN tools t ON t.id = a.tool_id
     WHERE a.tool_id = ? AND a.status = 'ready' AND ${USABLE_SQL} AND ${FRESH_SQL}
     ORDER BY a.last_assigned_at IS NOT NULL, a.last_assigned_at ASC, a.id ASC`, t.id, ctx.now(), ctx.now());
  if (ready.length < 2) return null;
  return ready.filter((a) => a.load === 0).at(-1)?.id ?? null;
}

/**
 * Tài khoản sẵn sàng còn chỗ cho khách ở quán cafeId: kho riêng của quán trước, hết thì kho chung (không bao giờ lấy kho quán khác).
 * Trong mỗi kho: lấp đầy tài khoản đang có người trước (tài khoản dùng chung: ít tài khoản phải đổi mật khẩu,
 * tài khoản "dùng 1 lần": các khách cùng tài khoản bắt đầu gần nhau), rồi tới tài khoản lâu chưa giao nhất.
 */
export function pickAccount(ctx, tool, cafeId = null) {
  const t = toolOf(ctx, tool);
  if (!t || t.login_type === 'redeem') return null;
  return get(ctx.db,
    `SELECT * FROM (SELECT a.*, ${LOAD_SQL} AS load, ${FREE_SQL} AS free FROM accounts a JOIN tools t ON t.id = a.tool_id
                    WHERE a.tool_id = ? AND a.status = 'ready' AND ${USABLE_SQL} AND ${FRESH_SQL} AND ${POOL_SQL} AND a.id != ?)
     WHERE free > 0
     ORDER BY cafe_id IS NULL, load DESC, last_assigned_at IS NOT NULL, last_assigned_at ASC, id ASC LIMIT 1`,
    t.id, ctx.now(), ctx.now(), ...pool(cafeId), reserveAccountId(ctx, t) ?? -1) || null;
}

/** Chỗ còn giao được theo từng kho (chưa trừ dự phòng / lượt mỗi ngày) — cho trang quản trị. → [{tool_id, cafe_id (null = kho chung), free, n}] */
export function poolSeats(ctx) {
  return all(ctx.db,
    `SELECT a.tool_id, a.cafe_id, SUM(MAX(0, ${FREE_SQL})) AS free, COUNT(*) AS n FROM accounts a JOIN tools t ON t.id = a.tool_id
     WHERE a.status = 'ready' AND ${USABLE_SQL} AND ${FRESH_SQL} GROUP BY a.tool_id, a.cafe_id`, ctx.now(), ctx.now());
}

/** Mã / link nhận quà còn trong kho (login_type = redeem), cũ nhất trước. */
export function pickRedeem(ctx, toolId) {
  return get(ctx.db, "SELECT * FROM redeem_codes WHERE tool_id = ? AND status = 'ready' ORDER BY id LIMIT 1", toolId) || null;
}

/** Còn hàng để giao không (tài khoản còn chỗ, hoặc còn mã nhận quà). */
export const hasStock = (ctx, tool, cafeId = null) => (tool.login_type === 'redeem' ? !!pickRedeem(ctx, tool.id) : !!pickAccount(ctx, tool, cafeId));

/** Số lượt của công cụ đã giao hôm nay (cả hệ thống). */
export function toolUsedToday(ctx, toolId) {
  const dayStart = startOfLocalDay(ctx.now(), ctx.settings().timezoneOffsetMin);
  return get(ctx.db, `SELECT COUNT(*) AS n FROM slots WHERE tool_id = ? AND created_at >= ? AND ${COUNTED}`, toolId, dayStart).n;
}

/**
 * Công cụ đang bật kèm số chỗ trống (đã trừ giới hạn lượt/ngày và tài khoản dự phòng đang giữ). reserved: số chỗ của tài khoản dự phòng.
 * cafeId: chỉ đếm kho riêng của quán đó + kho chung (khách ở quán đó nhận được gì); không có = cả hệ thống.
 * expiring: số tài khoản tự hết hạn (account_days) trong 24 giờ tới.
 * blocked: công cụ đang nghỉ nhận trước giờ hết; có customer thì thêm lý do riêng của khách này (đã thử gần đây…). → [{tool, free, reserved, expiring, blocked}]
 */
export function toolAvailability(ctx, customer = null, cafeId = null) {
  const tools = all(ctx.db, 'SELECT * FROM tools WHERE enabled = 1 ORDER BY sort, id');
  const seats = new Map(all(ctx.db,
    `SELECT a.tool_id, SUM(MAX(0, ${FREE_SQL})) AS free FROM accounts a JOIN tools t ON t.id = a.tool_id
     WHERE a.status = 'ready' AND ${USABLE_SQL} AND ${FRESH_SQL} AND ${POOL_SQL} GROUP BY a.tool_id`, ctx.now(), ctx.now(), ...pool(cafeId)).map((r) => [r.tool_id, r.free]));
  const codes = new Map(all(ctx.db, "SELECT tool_id, COUNT(*) AS n FROM redeem_codes WHERE status = 'ready' GROUP BY tool_id").map((r) => [r.tool_id, r.n]));
  const owner = isOwner(ctx, customer);
  return tools.map((tool) => {
    let free = (tool.login_type === 'redeem' ? codes.get(tool.id) : seats.get(tool.id)) || 0;
    const rid = reserveAccountId(ctx, tool);
    // Tài khoản dự phòng thuộc kho quán khác thì không nằm trong số đếm của quán này → không trừ.
    const reserved = rid ? Math.max(0, get(ctx.db, `SELECT ${FREE_SQL} AS f FROM accounts a JOIN tools t ON t.id = a.tool_id WHERE a.id = ? AND ${POOL_SQL}`, rid, ...pool(cafeId))?.f ?? 0) : 0;
    free = Math.max(0, free - reserved);
    if (tool.daily_cap != null && !owner) free = Math.min(free, Math.max(0, tool.daily_cap - toolUsedToday(ctx, tool.id)));
    // Tài khoản tự hết sau account_days ngày (Claude 7 ngày): báo trước 24 giờ để chủ chuẩn bị tài khoản mới.
    const expiring = tool.account_days == null ? 0 : get(ctx.db,
      `SELECT COUNT(*) AS n FROM accounts WHERE tool_id = ? AND status != 'retired' AND created_at > ? AND created_at <= ?`,
      tool.id, ctx.now() - tool.account_days * DAY, ctx.now() - (tool.account_days - 1) * DAY).n;
    if (owner) return { tool, free, reserved, expiring, blocked: null };
    return { tool, free, reserved, expiring, blocked: (customer && customerToolBlock(ctx, customer, tool)) || toolClosing(ctx, tool) };
  });
}
