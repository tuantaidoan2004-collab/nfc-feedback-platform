// Webhook: thư từ dịch vụ mail.
import { HttpError } from '../lib/http.js';
import { hmac, safeEqual } from '../lib/crypto.js';
import { logEvent } from '../lib/events.js';
import { hit } from '../lib/ratelimit.js';
import { MIN } from '../lib/time.js';
import { ingestMail } from '../domain/mail.js';
import { looksLikeMessage } from '../lib/mime.js';
import { resolveShop, createCafe, qsPageInfo } from '../domain/presence.js';
import { issueQsVoucher, formatCode } from '../domain/vouchers.js';
import { get, run } from '../db/index.js';
import { startOfLocalDay } from '../lib/time.js';
import { COUNTED, toolAvailability, toolClosing } from '../domain/quota.js';
import { addAccounts, addRedeemCodes, resolveKho, validateAccount, parseAccountLine, listAccounts, stockSummary, updateAccount, publicAccount, ACCOUNT_STATUSES } from '../domain/stock.js';

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
export function verifyQsSignature(ctx, rq, raw, key = ctx.config.qsTicketKey) {
  const sig = String(rq.req.headers['x-tbq-signature'] || '');
  return !!key && sig.startsWith('sha256=') && safeEqual(sig.slice(7), hmac(key, raw));
}

/** Nội dung đã ký của QS: đúng chữ ký, ts lệch ≤ 2 phút, nonce chưa dùng. Sai → 401 (+ báo vàng, có giới hạn). → body JSON */
async function qsSignedBody(rq, { key = rq.ctx.config.qsTicketKey, maxBytes = 4_000 } = {}) {
  const { ctx } = rq;
  const raw = await rq.body(maxBytes);
  const deny = (why) => {
    if (hit(ctx, `qsapifail:${rq.ip}`, 5, 10 * MIN).ok) logEvent(ctx, { type: 'qs_api_unauthorized', severity: 'yellow', ip: rq.ip, data: { reason: why } });
    throw new HttpError(401, 'Sai chữ ký');
  };
  if (!verifyQsSignature(ctx, rq, raw, key)) deny('chữ ký');
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
    // Khối "Công cụ làm việc" trên trang quán hiện "Tạm hết" đúng lúc: công cụ nào khách ở quán này nhận được ngay bây giờ.
    // Chỉ có / không — không số tài khoản, không email. `available` = quán còn suất + kho riêng của quán hoặc kho chung còn chỗ.
    tools: toolAvailability(ctx, null, cafe.id).map(({ tool, free }) => {
      const closing = toolClosing(ctx, tool);
      const open = cafe.status === 'active' && used < cafe.daily_quota;
      return { slug: tool.slug, name: tool.name, available: open && free > 0 && !closing, reason: cafe.status !== 'active' ? 'cafe_paused' : !open ? 'cafe_full' : closing ? 'tool_closing' : free > 0 ? null : 'sold_out' };
    }),
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
    const clean = (v, n) => String(v ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
    // Mã lạ nhưng tên trùng quán có sẵn = QS đổi mã quán → gắn vào quán cũ (cùng kho, cùng suất), không tạo quán trùng.
    let cafe = await resolveShop(ctx, shop, { name: clean(body.name, 120) });
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
    const cafe = await resolveShop(ctx, shop);
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

// ---------- API kho cho QS (Tài): thêm / sửa / xem tài khoản trong kho dùng chung ----------
// Hợp đồng: docs/phoi-hop-voi-QS.md mục 11. Ký GIỐNG /hooks/qs/quan (X-TBQ-Signature, ts, nonce) nhưng bằng khoá RIÊNG QS_KHO_KEY.
// Mật khẩu / khoá 2FA chỉ gửi vào, không lệnh nào trả ra. Mọi lần thêm / sửa ghi sự kiện (Theo dõi), by = 'qs-api'.
//   body: {"action":"summary"|"list"|"get"|"add"|"update", ...,"ts","nonce"}
const KHO_BY = 'qs-api';
const MAX_ADD = 500;

function toolBySlug(ctx, slug) {
  return get(ctx.db, 'SELECT * FROM tools WHERE slug = ?', String(slug ?? '').trim().toLowerCase()) || null;
}

function accountRef(ctx, body) {
  if (body.id != null) return get(ctx.db, 'SELECT * FROM accounts WHERE id = ?', Number.parseInt(body.id, 10) || 0);
  if (body.email) return get(ctx.db, 'SELECT * FROM accounts WHERE login_email = ?', String(body.email).trim().toLowerCase());
  return null;
}

export function registerKhoApi(router) {
  router.post('/hooks/qs/kho', async (rq) => {
    const { ctx } = rq;
    if (!ctx.config.qsKhoKey) return rq.sendJson(503, { ok: false, code: 'api_off', message: 'API kho đang tắt (chưa có QS_KHO_KEY).' });
    if (!hit(ctx, `qskho:${rq.ip}`, 300, 10 * MIN).ok) return rq.sendJson(429, { ok: false, code: 'too_many', message: 'Gọi quá nhiều, thử lại sau ít phút.' });
    const body = await qsSignedBody(rq, { key: ctx.config.qsKhoKey, maxBytes: 512_000 });
    const action = String(body.action || '');
    const bad = (code, message, status = 400) => rq.sendJson(status, { ok: false, code, message });

    if (action === 'summary') return rq.sendJson(200, { ok: true, tools: stockSummary(ctx) });

    if (action === 'list') {
      const tool = body.tool ? toolBySlug(ctx, body.tool) : null;
      if (body.tool && !tool) return bad('tool_unknown', 'Không có công cụ này.', 404);
      if (body.status && !ACCOUNT_STATUSES.includes(body.status)) return bad('bad_status', `status: ${ACCOUNT_STATUSES.join(' | ')}`);
      const limit = Number.parseInt(body.limit, 10) || 200;
      const offset = Number.parseInt(body.offset, 10) || 0;
      // shop: "<mã quán QS>" = kho riêng của quán đó; "chung" = kho chung; bỏ trống = mọi kho.
      let kho;
      if (Object.hasOwn(body, 'shop') && body.shop !== undefined) {
        const k = resolveKho(ctx, body.shop, { byShop: true });
        if (!k.ok) return bad('shop_unknown', k.message, 404);
        kho = k.cafe;
      }
      return rq.sendJson(200, { ok: true, accounts: listAccounts(ctx, { tool, status: body.status || null, kho, limit, offset }) });
    }

    if (action === 'get') {
      const a = accountRef(ctx, body);
      return a ? rq.sendJson(200, { ok: true, account: publicAccount(ctx, a) }) : bad('not_found', 'Không có tài khoản này.', 404);
    }

    if (action === 'add') {
      const tool = toolBySlug(ctx, body.tool);
      if (!tool) return bad('tool_unknown', 'Không có công cụ này (xem action summary để biết mã công cụ).', 404);
      const label = String(body.label ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 120) || null;
      const dryRun = body.dryRun === true;
      // shop: "<mã quán QS>" → kho riêng của quán đó (chỉ khách ở quán đó nhận); bỏ trống = kho chung.
      const kho = resolveKho(ctx, body.shop, { byShop: true });
      if (!kho.ok) return bad('shop_unknown', kho.message, 404);
      let r;
      if (tool.login_type === 'redeem') {
        if (kho.cafe) return bad('shop_not_supported', 'Mã / link nhận quà chỉ có kho chung — bỏ shop.');
        const values = Array.isArray(body.codes) ? body.codes : Array.isArray(body.lines) ? body.lines : null;
        if (!values) return bad('no_items', 'Công cụ mã / link nhận quà: gửi codes: ["…"].');
        if (values.length > MAX_ADD) return bad('too_many_items', `Tối đa ${MAX_ADD} mục mỗi lần.`);
        r = addRedeemCodes(ctx, { tool, values, label, by: KHO_BY, dryRun });
      } else {
        // accounts: [{email, password?, totp?, holders?}] hoặc lines: ["email|mật khẩu|…"] (dòng chép từ Google Sheet, giống ô nhập ở trang quản trị).
        const items = Array.isArray(body.accounts) ? body.accounts.map((x) => validateAccount(tool, x && typeof x === 'object' ? x : {}))
          : Array.isArray(body.lines) ? body.lines.map((l) => String(l ?? '').trim()).filter(Boolean).map((l) => parseAccountLine(tool, l)) : null;
        if (!items) return bad('no_items', 'Gửi accounts: [{email, password, totp, holders}] hoặc lines: ["email|mật khẩu"].');
        if (items.length > MAX_ADD) return bad('too_many_items', `Tối đa ${MAX_ADD} tài khoản mỗi lần.`);
        // Công cụ "làm mới mỗi ngày" (ChatGPT): mặc định chờ tạo Project rồi mới giao, giống ô tick ở trang quản trị.
        r = addAccounts(ctx, { tool, items, label, setup: body.setup !== false, by: KHO_BY, dryRun, cafeId: kho.cafe?.id ?? null });
      }
      if (!dryRun && r.added) logEvent(ctx, { type: 'qs_api_stock_added', cafeId: kho.cafe?.id ?? null, data: { tool: tool.slug, added: r.added, skipped: r.skipped.length } });
      return rq.sendJson(dryRun ? 200 : r.added ? 201 : 200, { ok: true, dryRun, tool: tool.slug, shop: kho.cafe ? kho.cafe.qs_slug || null : 'chung', ...r });
    }

    if (action === 'update') {
      const a = accountRef(ctx, body);
      if (!a) return bad('not_found', 'Không có tài khoản này.', 404);
      const patch = {};
      for (const k of ['label', 'holders', 'password', 'totp', 'keepPassword', 'status']) if (Object.hasOwn(body, k)) patch[k] = body[k];
      // Chuyển kho: shop "<mã quán QS>" = kho riêng của quán; "chung" / null = kho chung.
      if (Object.hasOwn(body, 'shop')) {
        const k = resolveKho(ctx, body.shop, { byShop: true });
        if (!k.ok) return bad('shop_unknown', k.message, 404);
        patch.cafeId = k.cafe?.id ?? null;
      }
      if (!Object.keys(patch).length) return bad('nothing', 'Không có gì để sửa (label, holders, password, totp, status, shop).');
      const r = updateAccount(ctx, a.id, patch, KHO_BY);
      return r.ok ? rq.sendJson(200, r) : bad(r.code, r.message, r.code === 'not_found' ? 404 : r.code === 'task_rejected' || r.code === 'not_usable' ? 409 : 400);
    }

    return bad('bad_action', 'action phải là summary, list, get, add hoặc update.');
  });
}
