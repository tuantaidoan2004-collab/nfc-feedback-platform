// Webhook: thư từ dịch vụ mail.
import { HttpError } from '../lib/http.js';
import { hmac, safeEqual } from '../lib/crypto.js';
import { logEvent } from '../lib/events.js';
import { hit } from '../lib/ratelimit.js';
import { MIN } from '../lib/time.js';
import { ingestMail } from '../domain/mail.js';
import { looksLikeMessage } from '../lib/mime.js';
import { cafeByShop, createCafe, qsPageInfo } from '../domain/presence.js';
import { issueQsVoucher, formatCode } from '../domain/vouchers.js';
import { get, run } from '../db/index.js';
import { startOfLocalDay } from '../lib/time.js';
import { COUNTED } from '../domain/quota.js';

/** Chữ ký: header X-Signature = sha256=<HMAC(MAIL_WEBHOOK_SECRET, nguyên body)> (Cloudflare Email Worker trong extras/ tự ký). */
function verifyMailAuth(rq, raw) {
  const { webhookSecret } = rq.ctx.config.mail;
  const sig = String(rq.req.headers['x-signature'] || '');
  return !!webhookSecret && sig.startsWith('sha256=') && safeEqual(sig.slice(7), hmac(webhookSecret, raw));
}

/**
 * Nội dung webhook → 1 thư hoặc mảng thư:
 *  - message/rfc822 (hoặc octet-stream, hoặc chữ trông như thư): nguyên thư gốc — Cloudflare Email Worker trong extras/
 *  - JSON (1 thư, mảng, hoặc {messages:[...]}) — `npm run fake-mail` khi chạy thử
 */
function parsePayload(rq, raw) {
  const type = String(rq.req.headers['content-type'] || '').toLowerCase();
  if (/^(message\/rfc822|application\/octet-stream)/.test(type)) return { raw };
  const text = raw.toString('utf8');
  if (type.startsWith('application/json')) {
    try { return JSON.parse(text); } catch { throw new HttpError(400, 'JSON không hợp lệ'); }
  }
  if (looksLikeMessage(text)) return { raw };
  throw new HttpError(400, 'Không đọc được nội dung (cần thư gốc hoặc JSON)');
}

export function registerHookRoutes(router) {
  router.post('/hooks/mail', async (rq) => {
    const { ctx } = rq;
    const raw = await rq.body(3_000_000);
    if (!verifyMailAuth(rq, raw)) {
      // Ai đó đoán URL webhook để đẩy thư giả → ghi lại (giới hạn để không làm đầy nhật ký).
      if (hit(ctx, `hookfail:${rq.ip}`, 5, 10 * MIN).ok) logEvent(ctx, { type: 'mail_hook_unauthorized', severity: 'yellow', ip: rq.ip });
      throw new HttpError(401, 'Sai chữ ký');
    }
    const payload = parsePayload(rq, raw);
    const items = Array.isArray(payload) ? payload : Array.isArray(payload?.messages) ? payload.messages : [payload];
    const results = [];
    for (const item of items.slice(0, 100)) {
      try { results.push(ingestMail(ctx, item)); } catch (err) {
        ctx.log('error', 'ingestMail failed', { err: String(err?.stack || err) });
        results.push({ ok: false });
      }
    }
    rq.sendJson(200, { ok: true, results: results.map((r) => ({ ok: r.ok, duplicate: !!r.duplicate, kind: r.kind, verdict: r.verdict })) });
  });
}

// ---------- API cho QS (Tài): trang quán hiện mã phiếu ----------
// Máy chủ QS gọi khi khách mở trang quán bằng thẻ / mã QR trên bàn (đúng lúc QS gắn vé ?t= vào nút "Nhận công cụ"), rồi hiện mã
// trong khối "Công cụ làm việc". Khoá dùng chung = QS_TICKET_KEY (bên QS: NFC_EVENT_TBQ_KEY). Hợp đồng: docs/phoi-hop-voi-QS.md mục 9.
//
//   POST /hooks/qs/phieu   Content-Type: application/json
//   X-TBQ-Signature: sha256=<hex HMAC-SHA256(QS_TICKET_KEY, nguyên body)>
//   body: {"shop":"<mã quán QS>","ts":<giây unix>,"nonce":"<8–64 ký tự A-Za-z0-9_->"}
//   → 200 {ok:true, code:"ABCD-EFGH", expiresAt:<ms>, tools:["chatgpt","claude"], text:"…"} · 401 sai chữ ký / ts lệch / nonce lặp
//   → 404 {ok:false, code:"shop_unknown"} · 409 {ok:false, code:"cafe_paused"} · 429 {ok:false, code:"cafe_limit"}
const QS_SKEW_SEC = 120;
export function verifyQsSignature(ctx, rq, raw) {
  const key = ctx.config.qsTicketKey;
  const sig = String(rq.req.headers['x-tbq-signature'] || '');
  return !!key && sig.startsWith('sha256=') && safeEqual(sig.slice(7), hmac(key, raw));
}

/** Nội dung đã ký của QS: đúng chữ ký, ts lệch ≤ 2 phút, nonce chưa dùng. Sai → 401 (+ báo vàng, có giới hạn). → body JSON */
async function qsSignedBody(rq) {
  const { ctx } = rq;
  const raw = await rq.body(4_000);
  const deny = (why) => {
    if (hit(ctx, `qsapifail:${rq.ip}`, 5, 10 * MIN).ok) logEvent(ctx, { type: 'qs_api_unauthorized', severity: 'yellow', ip: rq.ip, data: { reason: why } });
    throw new HttpError(401, 'Sai chữ ký');
  };
  if (!verifyQsSignature(ctx, rq, raw)) deny('chữ ký');
  let body;
  try { body = JSON.parse(raw.toString('utf8')); } catch { throw new HttpError(400, 'JSON không hợp lệ'); }
  const ts = Number(body?.ts);
  const nonce = String(body?.nonce || '');
  if (!Number.isFinite(ts) || Math.abs(ctx.now() / 1000 - ts) > QS_SKEW_SEC) deny('giờ lệch');
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(nonce) || !hit(ctx, `qsnonce:${nonce}`, 1, 10 * MIN).ok) deny('nonce lặp');
  return body;
}

const QS_SHOP_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;

/** Tình trạng một quán cho QS: chỉ số đếm, không có gì về khách. */
function cafeStatus(ctx, cafe) {
  const dayStart = startOfLocalDay(ctx.now(), ctx.settings().timezoneOffsetMin);
  const used = get(ctx.db, `SELECT COUNT(*) AS n FROM slots WHERE cafe_id = ? AND created_at >= ? AND ${COUNTED}`, cafe.id, dayStart).n;
  return {
    shop: cafe.qs_slug, name: cafe.name, status: cafe.status, pausedBy: cafe.paused_by || null,
    dailyQuota: cafe.daily_quota, usedToday: used, link: `${ctx.config.baseUrl}/qs/${cafe.qs_slug}`,
  };
}

export function registerQsApi(router) {
  // Mở / đóng / hỏi tình trạng chương trình ở một quán — QS gọi khi Tài bấm Mở / Đóng cột Sự kiện trong /gov,
  // nên chủ Tiệm không phải thêm quán tay. Hợp đồng: docs/phoi-hop-voi-QS.md mục 10.
  //   body: {"action":"open"|"close"|"status","shop":"<mã quán QS>","name"?,"address"?,"dailyQuota"?,"ts","nonce"}
  router.post('/hooks/qs/quan', async (rq) => {
    const { ctx } = rq;
    const body = await qsSignedBody(rq);
    const action = String(body.action || '');
    const shop = String(body.shop || '').trim().toLowerCase();
    if (!['open', 'close', 'status'].includes(action)) return rq.sendJson(400, { ok: false, code: 'bad_action', message: 'action phải là open, close hoặc status.' });
    if (!QS_SHOP_RE.test(shop)) return rq.sendJson(400, { ok: false, code: 'bad_shop', message: 'Mã quán QS không hợp lệ.' });
    let cafe = cafeByShop(ctx, shop);
    if (action === 'status') {
      return cafe ? rq.sendJson(200, { ok: true, ...cafeStatus(ctx, cafe) }) : rq.sendJson(404, { ok: false, code: 'shop_unknown', message: 'Quán này chưa có trong TBQ.' });
    }
    if (action === 'close') {
      if (!cafe) return rq.sendJson(404, { ok: false, code: 'shop_unknown', message: 'Quán này chưa có trong TBQ.' });
      if (cafe.status === 'active') {
        run(ctx.db, "UPDATE cafes SET status = 'paused', paused_by = 'qs' WHERE id = ?", cafe.id);
        logEvent(ctx, { type: 'qs_api_cafe_closed', cafeId: cafe.id, data: { shop } });
      }
      return rq.sendJson(200, { ok: true, ...cafeStatus(ctx, get(ctx.db, 'SELECT * FROM cafes WHERE id = ?', cafe.id)) });
    }
    // open
    let created = false;
    if (!cafe) {
      const clean = (v, n) => String(v ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
      const name = clean(body.name, 120) || (await qsPageInfo(ctx, shop))?.name || shop;
      const q = Number.parseInt(body.dailyQuota, 10);
      const id = createCafe(ctx, { name, address: clean(body.address, 200) || null, qsSlug: shop, dailyQuota: Number.isFinite(q) ? Math.min(200, Math.max(0, q)) : 20 });
      cafe = get(ctx.db, 'SELECT * FROM cafes WHERE id = ?', id);
      created = true;
      // Vàng để chủ thấy trên Theo dõi: có quán mới → xem lại số suất / ngày và kho.
      logEvent(ctx, { type: 'qs_api_cafe_opened', severity: 'yellow', cafeId: id, data: { shop, created: true } });
    } else if (cafe.status === 'paused' && cafe.paused_by === 'qs') {
      run(ctx.db, "UPDATE cafes SET status = 'active', paused_by = NULL WHERE id = ?", cafe.id);
      cafe = get(ctx.db, 'SELECT * FROM cafes WHERE id = ?', cafe.id);
      logEvent(ctx, { type: 'qs_api_cafe_opened', cafeId: cafe.id, data: { shop, created: false } });
    }
    // Chủ Tiệm tự dừng quán thì QS không mở lại được: trả về paused để Tài thấy.
    rq.sendJson(created ? 201 : 200, { ok: true, created, ...cafeStatus(ctx, cafe) });
  });

  router.post('/hooks/qs/phieu', async (rq) => {
    const { ctx } = rq;
    const body = await qsSignedBody(rq);
    const shop = String(body.shop || '').trim().toLowerCase();
    const cafe = cafeByShop(ctx, shop);
    if (!cafe) return rq.sendJson(404, { ok: false, code: 'shop_unknown', message: 'Quán này chưa có trong TBQ.' });
    if (cafe.status !== 'active') return rq.sendJson(409, { ok: false, code: 'cafe_paused', message: 'Quán đang tạm dừng chương trình.' });
    const r = issueQsVoucher(ctx, { cafe });
    if (!r.ok) {
      if (hit(ctx, `qsapilimit:${cafe.id}`, 1, 12 * 3600000).ok) logEvent(ctx, { type: 'qs_api_limit', severity: 'yellow', cafeId: cafe.id, data: { reason: r.message } });
      return rq.sendJson(429, { ok: false, code: r.code, message: r.message });
    }
    const tools = get(ctx.db, "SELECT GROUP_CONCAT(slug) AS s FROM tools WHERE enabled = 1 AND voucher_code = 1").s;
    logEvent(ctx, { type: 'qs_api_voucher', cafeId: cafe.id, data: { voucherId: r.voucher.id } });
    rq.sendJson(200, {
      ok: true, code: formatCode(r.voucher.code), expiresAt: r.voucher.expires_at, tools: tools ? tools.split(',') : [],
      text: 'Mã phiếu lấy mã đăng nhập — nhập ở ô "Mã phiếu" trên trang công cụ.',
    });
  });
}
