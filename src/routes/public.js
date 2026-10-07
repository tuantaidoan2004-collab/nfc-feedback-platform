// Route của khách. server.js đã gắn rq.state.deviceId/device/session/customer và kiểm tra Origin cho POST.
import { HttpError } from '../lib/http.js';
import { get } from '../db/index.js';
import { hit } from '../lib/ratelimit.js';
import { logEvent } from '../lib/events.js';
import { HOUR, MIN, DAY } from '../lib/time.js';
import { cafeByShop, recordEntry, latestEntry, isCafeOpen, processTap } from '../domain/presence.js';
import { useTicket, TICKET_MESSAGES } from '../domain/ticket.js';
import { issueOtp, verifyOtp, createSession, logout } from '../domain/auth.js';
import { startClaim, currentSlotView } from '../domain/claims.js';
import { requestCode, codeStatus, cancelWindow, totpStatus, codeLimit } from '../domain/codes.js';
import { redeemExtension, requestExtension, issueEntryVoucher } from '../domain/vouchers.js';
import { toolAvailability } from '../domain/quota.js';
import { homePage, cardPage, mePage, privacyPage, aboutPage, shopParam } from '../views/public.js';
import { notice } from '../views/layout.js';

// Trình xem trước link (máy chủ Zalo, Facebook, Telegram... tải link để làm ảnh xem trước) → không tính là lượt vào.
// Trình duyệt BÊN TRONG app Zalo/Telegram (khách quét QR bằng Zalo rất phổ biến) có chữ Mobile/Android/iPhone → là khách thật.
const CRAWLER_RE = /bot\b|crawl|spider|preview|facebookexternalhit|whatsapp|slack|discord|skype|curl\/|wget|python|headless|go-http/i;
const isLinkPreview = (ua) => CRAWLER_RE.test(ua) || (/zalo|telegram/i.test(ua) && !/mobile|android|iphone|ipad/i.test(ua));
const previewRequest = (rq) => rq.method === 'HEAD' || isLinkPreview(String(rq.req.headers['user-agent'] || ''));

function json(rq, status, obj) {
  rq.send(status, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8', 'X-Device-Id': rq.state.deviceId || '' });
}

function requireCustomer(rq) {
  if (!rq.state.customer || !rq.state.session) throw new HttpError(401, 'Phiên đăng nhập đã hết. Bạn tải lại trang để đăng nhập nhé.', 'unauthorized');
  return rq.state.customer;
}

function limit(rq, key, max, windowMs) {
  const r = hit(rq.ctx, key, max, windowMs);
  if (!r.ok) throw new HttpError(429, `Bạn thao tác nhanh quá. Thử lại sau ${Math.ceil(r.retryAfterSec / 60)} phút nhé.`, 'rate_limited');
}

/** Trang nhận công cụ của 1 quán. entry = lượt vào còn hạn của máy này ở quán này (vé từ trang quán QS) | null. */
function renderEntry(rq, cafe, entry, shop) {
  const { ctx } = rq;
  if (cafe.status !== 'active') {
    rq.sendHtml(200, notice(ctx, { title: 'Quán đang tạm dừng chương trình', icon: '⏸', text: 'Bạn quay lại sau nhé.' }));
    return;
  }
  if (!isCafeOpen(cafe, ctx.now(), ctx.settings().timezoneOffsetMin)) {
    rq.sendHtml(200, notice(ctx, { title: 'Quán đang ngoài giờ trải nghiệm', icon: '🌙', text: 'Bạn quay lại trong giờ mở chương trình nhé.' }));
    return;
  }
  const customer = rq.state.customer;
  rq.sendHtml(200, cardPage(ctx, {
    cafe, customer,
    tools: entry || customer ? toolAvailability(ctx, customer) : [], // chọn món trước, đăng nhập sau
    view: customer ? currentSlotView(ctx, customer.id, rq.state.deviceId) : null,
    atCafe: !!entry,
    shop,
  }));
}

export function registerPublicRoutes(router) {
  router.get('/', (rq) => {
    const { ctx } = rq;
    const c = rq.state.customer;
    rq.sendHtml(200, homePage(ctx, { customer: c, view: c ? currentSlotView(ctx, c.id, rq.state.deviceId) : null }));
  });

  router.get('/privacy', (rq) => rq.sendHtml(200, privacyPage(rq.ctx)));

  // "Về chúng tôi": nút thứ 2 trong khối "Công cụ làm việc" trên trang quán (QS gắn ?shop=<mã quán>). Chỉ là trang giới
  // thiệu: không ghi lượt vào, không cần đang ở quán. Nút "Nhận công cụ" trên trang này quay về đúng quán.
  router.get('/ve-chung-toi', (rq) => rq.sendHtml(200, aboutPage(rq.ctx, { shop: shopParam(rq.query.shop) })));

  // Lối vào 1 (quán có QS): nút "Nhận công cụ làm việc miễn phí" trong khối "Công cụ làm việc" trên trang quán của QS.
  // QS gắn mã quán vào link (/qs/<mã quán QS>) và, khi khách mở trang quán bằng thẻ / mã QR trên bàn, một vé ?t=…
  // (src/domain/ticket.js). Vé đúng → ghi lượt vào rồi chuyển về link sạch (không còn vé trên thanh địa chỉ để chép gửi người khác).
  router.get('/qs/:shop', (rq) => {
    const { ctx } = rq;
    if (previewRequest(rq)) {
      rq.sendHtml(200, notice(ctx, { title: ctx.settings().eventTitle, icon: '☕', text: 'Mở trang này trên điện thoại khi đang ngồi ở quán để nhận nhé.' }));
      return;
    }
    const shop = String(rq.params.shop || '').trim().toLowerCase().slice(0, 80);
    const cafe = cafeByShop(ctx, shop);
    if (!cafe) {
      // Mã quán QS chưa có trong TBQ → báo chủ tiệm (1 lần/giờ/mã) để thêm quán ở trang quản trị.
      if (/^[a-z0-9][a-z0-9-]{0,62}$/.test(shop) && hit(ctx, `qsunmapped:${shop}`, 1, HOUR).ok) {
        logEvent(ctx, { type: 'qs_shop_unmapped', severity: 'yellow', data: { shop } });
      }
      rq.sendHtml(200, notice(ctx, { title: 'Quán này chưa có chương trình', icon: '☕', text: 'Tiệm Bản Quyền chưa mở chương trình ở quán này. Bạn nhắn Zalo Tiệm nếu cần nhé.' }));
      return;
    }
    const link = `/qs/${encodeURIComponent(shop)}`;
    if (rq.query.t !== undefined) {
      const r = useTicket(ctx, { cafe, shop, ticket: rq.query.t, deviceId: rq.state.deviceId, ip: rq.ip });
      if (!r.ok) {
        rq.sendHtml(200, notice(ctx, { title: 'Chưa mở được', icon: '☕', text: TICKET_MESSAGES[r.error] }));
        return;
      }
      // Vé mới (khách chạm thẻ lần nữa) → tính lại thời gian ở quán từ bây giờ. Mở lại đúng vé cũ (bấm Back) thì không ghi thêm.
      if (r.fresh || !latestEntry(ctx, rq.state.deviceId, cafe.id)) recordEntry(ctx, { cafe, deviceId: rq.state.deviceId, ip: rq.ip });
      // Chạm thẻ / quét QR của quán (vé đúng) → tự có 1 phiếu lấy mã cho máy này (cách 2: phiếu giấy vẫn dùng song song).
      if (r.fresh) issueEntryVoucher(ctx, { deviceId: rq.state.deviceId, cafeId: cafe.id, source: 'qs' });
      rq.redirect(link, 303);
      return;
    }
    renderEntry(rq, cafe, latestEntry(ctx, rq.state.deviceId, cafe.id), shopParam(shop));
  });

  // Lối vào 2: thẻ NFC riêng của Tiệm đặt trên bàn (quán chưa dùng QS). Link cố định /c/<token>, chip bật mirror thì có thêm
  // UID + bộ đếm chạm (presence.processTap). Link chép lại (bộ đếm cũ) / chip lạ → không tính, khách phải chạm lại thẻ.
  router.get('/c/:token', (rq) => {
    const { ctx } = rq;
    const card = get(ctx.db, "SELECT * FROM cards WHERE token = ? AND kind = 'nfc'", rq.params.token);
    if (!card) throw new HttpError(404, 'Thẻ này không có trong hệ thống. Bạn thử chạm lại nhé.');
    if (previewRequest(rq)) {
      rq.sendHtml(200, notice(ctx, { title: ctx.settings().eventTitle, icon: '☕', text: 'Mở trang này trên điện thoại khi đang ngồi ở quán để nhận nhé.' }));
      return;
    }
    const cafe = get(ctx.db, 'SELECT * FROM cafes WHERE id = ?', card.cafe_id);
    const tap = processTap(ctx, { card, cafe, query: rq.query, deviceId: rq.state.deviceId, ip: rq.ip });
    if (tap.verdict === 'locked' && cafe.status === 'active') {
      rq.sendHtml(200, notice(ctx, { title: 'Thẻ này đang tạm khoá', icon: '⏸', text: 'Bạn thử thẻ ở bàn khác hoặc nhắn Zalo Tiệm nhé.' }));
      return;
    }
    if (tap.verdict === 'replay' || tap.verdict === 'forged') {
      rq.sendHtml(200, notice(ctx, { title: 'Chạm lại thẻ trên bàn nhé', icon: '☕',
        text: 'Link này đã cũ hoặc không phải từ thẻ trên bàn. Bạn chạm điện thoại trực tiếp vào thẻ NFC trên bàn của quán để nhận nhé.' }));
      return;
    }
    if (tap.verdict === 'ok') issueEntryVoucher(ctx, { deviceId: rq.state.deviceId, cafeId: cafe.id, source: 'nfc' });
    renderEntry(rq, cafe, latestEntry(ctx, rq.state.deviceId, cafe.id), shopParam(cafe.qs_slug || ''));
  });

  // Nút "Mua gói giá tốt qua Zalo": đếm lượt bấm theo QUÁN (không ghi khách/máy/IP) để biết quán nào mang lại khách mua.
  // Mỗi máy tính tối đa 1 lượt/ngày. Sau đó chuyển thẳng sang Zalo.
  router.get('/zalo', (rq) => {
    const { ctx } = rq;
    const c = rq.state.customer;
    if (c && !previewRequest(rq) && hit(ctx, `zalo:${rq.state.deviceId}`, 1, DAY).ok) {
      const slot = get(ctx.db, 'SELECT cafe_id, tool_id FROM slots WHERE customer_id = ? AND started_at IS NOT NULL ORDER BY id DESC LIMIT 1', c.id);
      if (slot) logEvent(ctx, { type: 'zalo_click', cafeId: slot.cafe_id, data: { toolId: slot.tool_id } });
    }
    rq.redirect(ctx.settings().zaloUrl, 302);
  });

  router.get('/me', (rq) => {
    const { ctx } = rq;
    const c = rq.state.customer;
    rq.sendHtml(200, mePage(ctx, { customer: c, view: c ? currentSlotView(ctx, c.id, rq.state.deviceId) : null }));
  });

  router.post('/api/otp/send', async (rq) => {
    const body = await rq.json();
    const r = await issueOtp(rq.ctx, { phone: body.phone, deviceId: rq.state.deviceId, ip: rq.ip });
    json(rq, 200, r);
  });

  router.post('/api/otp/verify', async (rq) => {
    const { ctx } = rq;
    limit(rq, `verify:d:${rq.state.deviceId}`, 20, 10 * MIN);
    const body = await rq.json();
    const r = verifyOtp(ctx, { phone: body.phone, code: body.code, deviceId: rq.state.deviceId, ip: rq.ip, consent: body.consent });
    if (!r.ok) return json(rq, 200, r);
    createSession(ctx, rq, { customerId: r.customer.id, deviceId: rq.state.deviceId });
    json(rq, 200, { ok: true, isNew: r.isNew });
  });

  router.post('/api/claim', async (rq) => {
    const { ctx } = rq;
    const customer = requireCustomer(rq);
    limit(rq, `claim:d:${rq.state.deviceId}`, 30, 10 * MIN);
    const body = await rq.json();
    const r = startClaim(ctx, { customer, deviceId: rq.state.deviceId, ip: rq.ip, toolId: body.toolId, inviteEmail: body.inviteEmail });
    json(rq, 200, { ok: r.status === 'active' || r.status === 'pending_invite', ...r });
  });

  router.get('/api/me', (rq) => {
    const customer = requireCustomer(rq);
    json(rq, 200, { ok: true, view: currentSlotView(rq.ctx, customer.id, rq.state.deviceId) });
  });

  router.post('/api/code/request', async (rq) => {
    const { ctx } = rq;
    const customer = requireCustomer(rq);
    limit(rq, `code:d:${rq.state.deviceId}`, 30, 10 * MIN);
    const body = await rq.json();
    const r = requestCode(ctx, { customer, deviceId: rq.state.deviceId, ip: rq.ip, kind: body.kind, voucher: body.voucher });
    // Số lần lấy mã còn lại sau lần này → trang khách cập nhật dòng "Còn x lần lấy mã" không cần tải lại.
    const slot = get(ctx.db, "SELECT code_requests, extended_days FROM slots WHERE customer_id = ? AND status = 'active' ORDER BY id DESC LIMIT 1", customer.id);
    const left = slot ? Math.max(0, codeLimit(ctx.settings(), slot) - slot.code_requests) : undefined;
    json(rq, 200, { ok: r.status === 'open' || r.status === 'totp', ...r, codeRequestsLeft: left });
  });

  // Mã 2FA đang chạy (đổi mỗi 30 giây) trong lượt xem đã mở bằng /api/code/request.
  router.get('/api/totp', (rq) => {
    const customer = requireCustomer(rq);
    limit(rq, `totp:d:${rq.state.deviceId}`, 120, 10 * MIN);
    json(rq, 200, { ok: true, ...totpStatus(rq.ctx, { customerId: customer.id, deviceId: rq.state.deviceId }) });
  });

  router.get('/api/code/status/:id', (rq) => {
    const customer = requireCustomer(rq);
    json(rq, 200, { ok: true, ...codeStatus(rq.ctx, { windowId: rq.params.id, customerId: customer.id, deviceId: rq.state.deviceId }) });
  });

  router.post('/api/code/cancel/:id', (rq) => {
    const customer = requireCustomer(rq);
    json(rq, 200, cancelWindow(rq.ctx, { windowId: rq.params.id, customerId: customer.id }));
  });

  // Gia hạn bằng mã gia hạn (chủ gửi qua Zalo khi khách mua thêm ngày).
  router.post('/api/extend', async (rq) => {
    const { ctx } = rq;
    const customer = requireCustomer(rq);
    limit(rq, `extend:d:${rq.state.deviceId}`, 20, 10 * MIN);
    const body = await rq.json();
    const r = redeemExtension(ctx, { customer, deviceId: rq.state.deviceId, raw: body.code });
    json(rq, 200, r);
  });

  // Xin gia hạn (chưa có mã) → chủ thấy ở trang Gia hạn, khách nhắn Zalo thanh toán.
  router.post('/api/extend/request', async (rq) => {
    const { ctx } = rq;
    const customer = requireCustomer(rq);
    limit(rq, `extendreq:${customer.id}`, 5, HOUR);
    const body = await rq.json();
    json(rq, 200, requestExtension(ctx, { customerId: customer.id, days: body.days }));
  });

  router.post('/api/logout', (rq) => {
    logout(rq.ctx, rq);
    json(rq, 200, { ok: true });
  });

  router.post('/api/report', async (rq) => {
    const { ctx } = rq;
    const customer = requireCustomer(rq);
    const body = await rq.json();
    const message = String(body.message || '').replace(/\s+/g, ' ').trim().slice(0, 500);
    if (!message) return json(rq, 200, { ok: false, message: 'Bạn nhập vài chữ mô tả lỗi nhé.' });
    const r = hit(ctx, `report:${customer.id}`, ctx.settings().reportsPerHour, HOUR);
    if (!r.ok) return json(rq, 200, { ok: false, message: 'Bạn đã báo lỗi nhiều lần. Tiệm đang xem, hoặc nhắn Zalo cho nhanh nhé.' });
    const slot = get(ctx.db,
      `SELECT s.id, s.account_id, t.name AS tool_name, a.login_email FROM slots s JOIN tools t ON t.id = s.tool_id
       LEFT JOIN accounts a ON a.id = s.account_id WHERE s.customer_id = ? ORDER BY s.id DESC LIMIT 1`, customer.id);
    logEvent(ctx, { type: 'customer_report', severity: 'yellow', customerId: customer.id, deviceId: rq.state.deviceId, slotId: slot?.id, accountId: slot?.account_id, ip: rq.ip, data: { message } });
    json(rq, 200, { ok: true, message: 'Đã gửi. Tiệm sẽ xem ngay và liên hệ bạn qua Zalo nếu cần.' });
  });
}
