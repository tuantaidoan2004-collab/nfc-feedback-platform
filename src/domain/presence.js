// Khách đang ở quán nào — từ 2 lối vào, đều là thứ Tiệm tự lo, không cần gì của chủ quán
// (không màn hình quầy, không mã quầy, không Wi-Fi):
//
// 1) Trang quán của Quite Sensational (QS): khách chạm thẻ / quét QR → trang quán → nút "Nhận công cụ làm việc miễn phí" mang
//    vé có chữ ký (src/domain/ticket.js) → /qs/<mã quán QS>?t=<vé>. Vé đúng → recordEntry qua "lối vào QS" ẩn của quán (cards.kind = 'qs').
// 2) Thẻ NFC riêng của Tiệm đặt trên bàn (quán chưa dùng QS; cards.kind = 'nfc'): chip thường NTAG213/215/216, link cố định
//    /c/<token> → processTap. Link cố định thì ai chép cũng mở được, nên nên bật "UID + bộ đếm chạm" (mirror) khi ghi chip: mỗi lần
//    chạm bộ đếm tăng, link chép lại mang bộ đếm cũ → 'replay' → không tính là đang ở quán, khách phải chạm lại thẻ.
//    Bộ đếm không có chữ ký (chip thường) nên người rành vẫn sửa được số → chặn tiếp bằng giới hạn / thẻ / ngày, báo động khi
//    quá nhiều máy mở 1 thẻ, và OTP / SĐT. Chip không bật bộ đếm: mở link là tính, chỉ còn các giới hạn đó.
//
// Lượt vào còn hạn (entryTtlMin, verdict ok / jump) = khách đang ở quán; nhận công cụ và mở lượt lấy mã phải trong thời gian đó.

import { get, all, run, tx } from '../db/index.js';
import { randomToken } from '../lib/crypto.js';
import { logEvent } from '../lib/events.js';
import { hit } from '../lib/ratelimit.js';
import { localHour, inHourRange, MIN, HOUR } from '../lib/time.js';
import { COUNTED } from './quota.js';

export function isCafeOpen(cafe, nowMs, offsetMin = 420) {
  if (cafe.open_hour == null || cafe.close_hour == null) return true;
  return inHourRange(localHour(nowMs, offsetMin), cafe.open_hour, cafe.close_hour);
}

/** Quán có mã quán QS này — mã đang dùng hoặc mã cũ / phụ (cafe_shops), không phân biệt hoa thường | null. */
export function cafeByShop(ctx, shop) {
  if (!shop) return null;
  return get(ctx.db, 'SELECT * FROM cafes WHERE qs_slug = ? COLLATE NOCASE', shop)
    || get(ctx.db, 'SELECT f.* FROM cafe_shops s JOIN cafes f ON f.id = s.cafe_id WHERE s.shop = ? COLLATE NOCASE', shop) || null;
}

/** Mã quán QS cũ / phụ của quán (không gồm mã đang dùng). */
export function cafeShopAliases(ctx, cafeId) {
  return all(ctx.db, 'SELECT shop FROM cafe_shops WHERE cafe_id = ? ORDER BY created_at, shop', cafeId).map((r) => r.shop);
}

/**
 * Gắn mã quán QS vào quán có sẵn: mã này thành mã đang dùng, mã cũ của quán giữ lại làm mã phụ (link / vé cũ vẫn về đúng quán).
 * Mã đang thuộc quán khác thì không gắn. → true | false
 */
export function linkShop(ctx, cafe, shop) {
  const v = String(shop || '').trim().toLowerCase();
  if (!v) return false;
  const owner = cafeByShop(ctx, v);
  if (owner && owner.id !== cafe.id) return false;
  tx(ctx.db, () => {
    const cur = get(ctx.db, 'SELECT qs_slug FROM cafes WHERE id = ?', cafe.id)?.qs_slug;
    run(ctx.db, 'DELETE FROM cafe_shops WHERE shop = ? COLLATE NOCASE', v);
    if (cur && cur.toLowerCase() !== v) run(ctx.db, 'INSERT OR IGNORE INTO cafe_shops(shop, cafe_id, created_at) VALUES(?, ?, ?)', cur.toLowerCase(), cafe.id, ctx.now());
    run(ctx.db, 'UPDATE cafes SET qs_slug = ? WHERE id = ?', v, cafe.id);
  });
  return true;
}

/**
 * Tên quán để so trùng: bỏ dấu, ký tự lạ và chữ chung chung (coffee, cafe, cà phê, tea, quán…).
 * "O’renchi Cafe" = "O’renchi" = "orenchicafe" = "orenchi"; "Bamos Coffee" = "Bamos" = "bamos". Còn dưới 3 ký tự → '' (không so).
 */
export function cafeKey(name) {
  const k = String(name || '').normalize('NFD').replace(/\p{M}/gu, '').replace(/[đĐ]/g, 'd').toLowerCase()
    .replace(/['’‘`´]/g, '')
    .replace(/\b(ca\s*phe|coffee|cafe|caffe|caf|tea|tra\s*sua|quan|the|and)\b/g, ' ')
    .replace(/[^a-z0-9]/g, '')
    .replace(/^(?:caphe|coffee|cafe)(?=[a-z0-9]{3})|(?<=[a-z0-9]{3})(?:caphe|coffee|cafe)$/g, ''); // viết liền: orenchicafe
  return k.length >= 3 ? k : '';
}

/**
 * Quán có sẵn trùng tên (theo cafeKey) để gắn mã QS mới vào, thay vì tạo quán mới. Ưu tiên quán đang chạy; không có thì quán
 * QS tạm dừng. Quán chủ tự dừng (vd. quán trùng đã gộp) không tính. Nhiều quán khớp → null (không đoán).
 */
export function sameNameCafe(ctx, name) {
  const key = cafeKey(name);
  if (!key) return null;
  const hits = all(ctx.db, 'SELECT * FROM cafes').filter((c) => cafeKey(c.name) === key);
  const active = hits.filter((c) => c.status === 'active');
  if (active.length) return active.length === 1 ? active[0] : null;
  const byQs = hits.filter((c) => c.paused_by === 'qs');
  return byQs.length === 1 ? byQs[0] : null;
}

/**
 * Mã quán QS → quán. Mã lạ mà tên quán (QS gửi kèm, hoặc đọc từ trang quán QS) trùng 1 quán có sẵn → QS vừa đổi mã quán:
 * gắn mã mới vào quán đó (báo vàng cho chủ) thay vì coi là quán mới / quán chưa có chương trình. → quán | null
 */
export async function resolveShop(ctx, shop, { name = '' } = {}, fetchImpl = fetch) {
  const v = String(shop || '').trim().toLowerCase();
  const found = cafeByShop(ctx, v);
  if (found || !/^[a-z0-9][a-z0-9-]{0,62}$/.test(v)) return found;
  let n = name;
  // Đọc trang QS tối đa 1 lần / 10 phút / mã, để link rác không bắt máy chủ đi hỏi QS liên tục.
  if (!cafeKey(n) && hit(ctx, `qsresolve:${v}`, 1, 10 * MIN).ok) n = (await qsPageInfo(ctx, v, fetchImpl))?.name || '';
  const same = sameNameCafe(ctx, n);
  if (!same) return null;
  const old = same.qs_slug;
  if (!linkShop(ctx, same, v)) return null;
  logEvent(ctx, { type: 'qs_shop_linked', severity: 'yellow', cafeId: same.id, data: { shop: v, old: old || null, name: n } });
  return get(ctx.db, 'SELECT * FROM cafes WHERE id = ?', same.id);
}

/** Mã quán QS từ chữ chủ dán vào: mã trần (sakz8) hoặc nguyên link trang quán (https://quitesensational-review-bio.com/sakz8?x=1). */
export function shopFromInput(raw) {
  const s = String(raw ?? '').trim();
  const m = /^https?:\/\/[^/]+\/([^/?#]+)/i.exec(s);
  return (m ? decodeURIComponent(m[1]) : s).toLowerCase();
}

/**
 * Đọc tên quán từ trang quán QS (thẻ <title>). Trang QS trả 200 cả với mã lạ, khi đó tiêu đề là "Quite Sensational…" → null.
 * → {name, address: null} | null (mã lạ, mạng lỗi, quá 5 giây).
 */
export async function qsPageInfo(ctx, shop, fetchImpl = fetch) {
  try {
    const r = await fetchImpl(`${ctx.config.qsOrigin}/${encodeURIComponent(shop)}`, { signal: AbortSignal.timeout(5000), redirect: 'follow' });
    if (!r.ok) return null;
    const m = /<title[^>]*>([^<]{1,200})<\/title>/i.exec((await r.text()).slice(0, 200_000));
    const name = (m?.[1] || '').replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
    if (!name || /^quite sensational\b/i.test(name)) return null;
    return { name: name.slice(0, 120), address: null };
  } catch { return null; }
}

/** Thêm quán (trang quản trị hoặc API QS). display_token / code_secret: cột cũ, vẫn bắt buộc trong bảng. → id */
export function createCafe(ctx, { name, address = null, qsSlug = null, dailyQuota = 20, openHour = null, closeHour = null }) {
  return run(ctx.db,
    `INSERT INTO cafes(name, address, qs_slug, display_token, code_secret, presence_mode, daily_quota, open_hour, close_hour, created_at)
     VALUES(?, ?, ?, ?, ?, 'none', ?, ?, ?, ?)`,
    name, address, qsSlug, randomToken(18), randomToken(24), dailyQuota, openHour, closeHour, ctx.now()).lastInsertRowid;
}

/** Lối vào QS (ẩn) của quán; chưa có thì tạo. */
export function qsEntryCard(ctx, cafe) {
  const found = get(ctx.db, "SELECT * FROM cards WHERE cafe_id = ? AND kind = 'qs'", cafe.id);
  if (found) return found;
  run(ctx.db, "INSERT OR IGNORE INTO cards(cafe_id, token, kind, label, created_at) VALUES(?, ?, 'qs', 'Từ trang quán (Quite Sensational)', ?)",
    cafe.id, randomToken(12), ctx.now());
  return get(ctx.db, "SELECT * FROM cards WHERE cafe_id = ? AND kind = 'qs'", cafe.id);
}

/**
 * Gộp quán trùng `fromId` vào quán `intoId`: lượt vào, vé, slot, kho riêng, phiếu, thẻ NFC, nhật ký chuyển sang quán gốc; mã QS
 * của quán trùng thành mã của quán gốc (quán trùng tạo sau → mã của nó là mã QS mới → thành mã đang dùng). Quán trùng: tạm dừng,
 * không còn mã QS, tên ghi "(trùng — đã gộp vào #…)". → {ok} | {ok:false, message}
 */
export function mergeCafe(ctx, fromId, intoId, by = 'admin') {
  const from = get(ctx.db, 'SELECT * FROM cafes WHERE id = ?', fromId);
  const into = get(ctx.db, 'SELECT * FROM cafes WHERE id = ?', intoId);
  if (!from || !into) return { ok: false, message: 'Không có quán này.' };
  if (from.id === into.id) return { ok: false, message: 'Chọn một quán khác để gộp vào.' };
  const moved = {};
  tx(ctx.db, () => {
    const keep = qsEntryCard(ctx, into);
    const dup = get(ctx.db, "SELECT id FROM cards WHERE cafe_id = ? AND kind = 'qs'", from.id);
    if (dup) {
      for (const t of ['taps', 'slots', 'events']) run(ctx.db, `UPDATE ${t} SET card_id = ? WHERE card_id = ?`, keep.id, dup.id);
      run(ctx.db, 'DELETE FROM cards WHERE id = ?', dup.id);
    }
    for (const t of ['cards', 'taps', 'qs_tickets', 'slots', 'accounts', 'vouchers', 'events', 'cafe_shops']) {
      moved[t] = Number(run(ctx.db, `UPDATE ${t} SET cafe_id = ? WHERE cafe_id = ?`, into.id, from.id).changes);
    }
    run(ctx.db, 'UPDATE sessions SET presence_cafe_id = ? WHERE presence_cafe_id = ?', into.id, from.id);
    const shop = from.qs_slug;
    run(ctx.db, "UPDATE cafes SET qs_slug = NULL, status = 'paused', paused_by = 'admin', name = ? WHERE id = ?",
      `${from.name} (trùng — đã gộp vào #${into.id} ${into.name})`.slice(0, 200), from.id);
    if (shop) {
      if (!into.qs_slug || from.created_at > into.created_at) linkShop(ctx, into, shop);
      else run(ctx.db, 'INSERT OR IGNORE INTO cafe_shops(shop, cafe_id, created_at) VALUES(?, ?, ?)', shop.toLowerCase(), into.id, ctx.now());
    }
  });
  logEvent(ctx, { type: 'cafe_merged', cafeId: into.id, data: { from: from.id, fromName: from.name, shop: from.qs_slug || null, moved, by } });
  return { ok: true, moved };
}

/** Điểm rủi ro theo lượt vào (dùng khi chấm điểm lúc nhận slot). replay / forged / closed / locked không thành lượt vào. */
export const TAP_RISK = { ok: 0, jump: 25, replay: 40, closed: 30, forged: 60, locked: 100 };
/** Lượt vào được tính là "đang ở quán". */
const ENTRY_VERDICTS = "('ok', 'jump')";

/**
 * Ghi 1 lượt vào sau khi vé đã đúng (ticket.js).
 * → {tapId, verdict:'ok'|'locked'|'closed', riskPoints}
 */
export function recordEntry(ctx, { cafe, deviceId, ip }) {
  const card = qsEntryCard(ctx, cafe);
  const now = ctx.now();
  let verdict = 'ok';
  if (card.status !== 'active' || cafe.status !== 'active') verdict = 'locked';
  else if (!isCafeOpen(cafe, now, ctx.settings().timezoneOffsetMin)) verdict = 'closed';
  const tapId = run(ctx.db,
    'INSERT INTO taps(card_id, cafe_id, device_id, ip, counter, verdict, created_at) VALUES(?, ?, ?, ?, NULL, ?, ?)',
    card.id, cafe.id, deviceId, ip, verdict, now).lastInsertRowid;
  return { tapId, verdict, riskPoints: TAP_RISK[verdict] };
}

/**
 * Lượt vào gần nhất của máy này còn hiệu lực (trong entryTtlMin). cafeId truyền vào thì phải cùng quán.
 * → {tapId, cardId, cafeId, verdict, riskPoints, at} | null
 */
export function latestEntry(ctx, deviceId, cafeId = null) {
  const s = ctx.settings();
  const row = get(ctx.db,
    `SELECT id, card_id, cafe_id, verdict, created_at FROM taps
     WHERE device_id = ? AND created_at > ? AND verdict IN ${ENTRY_VERDICTS} ${cafeId == null ? '' : 'AND cafe_id = ?'}
     ORDER BY id DESC LIMIT 1`,
    ...[deviceId, ctx.now() - s.entryTtlMin * MIN, ...(cafeId == null ? [] : [cafeId])]);
  if (!row) return null;
  return { tapId: row.id, cardId: row.card_id, cafeId: row.cafe_id, verdict: row.verdict, riskPoints: TAP_RISK[row.verdict], at: row.created_at };
}

// ---------- Thẻ NFC riêng của Tiệm ----------

/**
 * Đọc UID / bộ đếm nếu chip có bật mirror. Hỗ trợ các dạng:
 *   ?UID=<14 hex>x<6 hex>   NXP TagWriter bật cả UID + bộ đếm
 *   ?UID=<14 hex>           TagWriter chỉ bật UID
 *   ?ctr=<6 hex>            TagWriter chỉ bật bộ đếm
 *   ?m=<14 hex>x<6 hex>     tự cấu hình MIRROR_PAGE/MIRROR_BYTE
 * Tên tham số không phân biệt hoa thường.
 */
export function parseMirror(query = {}) {
  const q = {};
  for (const [k, v] of Object.entries(query)) q[k.toLowerCase()] ??= String(v ?? '');
  let uid = null;
  let counter = null;
  for (const v of [q.m, q.uid]) {
    const both = /^([0-9a-f]{14})x([0-9a-f]{6})$/i.exec(v || '');
    if (both) { uid = both[1].toUpperCase(); counter = Number.parseInt(both[2], 16); break; }
  }
  if (!uid && /^[0-9a-f]{14}$/i.test(q.uid || '')) uid = q.uid.toUpperCase();
  if (counter == null && /^[0-9a-f]{6}$/i.test(q.ctr || '')) counter = Number.parseInt(q.ctr, 16);
  return { uid, counter };
}

/**
 * Ghi nhận 1 lần mở link thẻ riêng của Tiệm.
 * → {tapId, verdict:'ok'|'jump'|'replay'|'forged'|'locked'|'closed', riskPoints, counter}
 */
export function processTap(ctx, { card, cafe, query, deviceId, ip }) {
  const s = ctx.settings();
  const now = ctx.now();
  const { uid, counter } = parseMirror(query);
  let verdict = 'ok';
  if (card.status !== 'active' || cafe.status !== 'active') verdict = 'locked';
  else if (!isCafeOpen(cafe, now, s.timezoneOffsetMin)) verdict = 'closed';
  else if (uid && card.nfc_uid && uid !== String(card.nfc_uid).toUpperCase()) verdict = 'forged';
  // Chip đã từng gửi bộ đếm / UID mà link lần này không có → link bị chép lại rồi cắt bớt tham số.
  else if ((counter == null && card.last_counter != null) || (!uid && card.nfc_uid)) verdict = 'replay';
  else if (counter != null && card.last_counter != null) {
    if (counter <= card.last_counter) {
      // Trình duyệt tải lại đúng link vừa chạm (cùng máy, cùng bộ đếm) → không phải dùng lại link.
      const reload = get(ctx.db,
        "SELECT 1 FROM taps WHERE card_id = ? AND device_id = ? AND counter = ? AND verdict IN ('ok', 'jump') AND created_at > ? LIMIT 1",
        card.id, deviceId, counter, now - s.entryTtlMin * MIN);
      verdict = reload ? 'ok' : 'replay';
    } else if (counter - card.last_counter > s.tapCounterMaxJump) verdict = 'jump';
  }
  // Chỉ cập nhật bộ đếm khi hợp lệ: nếu nhận số "nhảy vọt" giả, các lượt chạm thật sau đó sẽ bị coi là dùng lại.
  if (verdict === 'ok' && counter != null) run(ctx.db, 'UPDATE cards SET last_counter = MAX(COALESCE(last_counter, -1), ?) WHERE id = ?', counter, card.id);
  // Lần đầu thấy UID (thường là lúc chủ chạm thử sau khi ghi chip) → nhớ lại; chip khác mang cùng link sẽ bị coi là giả.
  if (verdict === 'ok' && uid && !card.nfc_uid) run(ctx.db, 'UPDATE cards SET nfc_uid = ? WHERE id = ? AND nfc_uid IS NULL', uid, card.id);

  const tapId = run(ctx.db,
    'INSERT INTO taps(card_id, cafe_id, device_id, ip, counter, verdict, created_at) VALUES(?, ?, ?, ?, ?, ?, ?)',
    card.id, cafe.id, deviceId, ip, counter, verdict, now).lastInsertRowid;
  if (verdict !== 'ok' && verdict !== 'locked') {
    logEvent(ctx, {
      type: `tap_${verdict}`, severity: verdict === 'forged' ? 'red' : 'yellow',
      deviceId, cardId: card.id, cafeId: cafe.id, ip, data: { counter, last: card.last_counter, uid },
    });
  }
  if (card.status === 'active') checkCardAnomaly(ctx, card, cafe);
  return { tapId, verdict, riskPoints: TAP_RISK[verdict], counter };
}

/** Quá nhiều máy khác nhau mở 1 thẻ trong 1 giờ → link thẻ có thể đã bị phát tán. */
function checkCardAnomaly(ctx, card, cafe) {
  const s = ctx.settings();
  const { n } = get(ctx.db,
    'SELECT COUNT(DISTINCT COALESCE(device_id, ip)) AS n FROM taps WHERE card_id = ? AND created_at > ?', card.id, ctx.now() - HOUR);
  if (n >= s.cardTapsPerHourLock) {
    run(ctx.db, "UPDATE cards SET status = 'locked', lock_reason = ? WHERE id = ? AND status = 'active'", 'Tự khoá: quá nhiều máy chạm trong 1 giờ', card.id);
    logEvent(ctx, { type: 'card_locked', severity: 'red', cardId: card.id, cafeId: cafe.id, data: { devicesLastHour: n } });
  } else if (n === s.cardTapsPerHourAlert) {
    logEvent(ctx, { type: 'card_anomaly', severity: 'yellow', cardId: card.id, cafeId: cafe.id, data: { devicesLastHour: n } });
  }
}

/**
 * Số khách KHÁC đã NHẬN slot trên máy này (như quota.js). Bạn mượn máy chỉ để đăng nhập thì không tính —
 * trước đây tính cả → chủ máy bị +30 điểm (mức vàng) và bị từ chối mãi.
 */
export function deviceOtherPhones(ctx, deviceId, customerId) {
  return get(ctx.db, `SELECT COUNT(DISTINCT customer_id) AS n FROM slots WHERE device_id = ? AND customer_id != ? AND ${COUNTED}`, deviceId, customerId ?? -1).n;
}
