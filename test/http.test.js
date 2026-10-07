import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestCtx, seed, startTestServer, ticketFor, makeNfcCard } from './helpers.js';
import { hmac } from '../src/lib/crypto.js';
import { get } from '../src/db/index.js';
import { runJobs } from '../src/jobs.js';

const UA = { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1' };

async function setup() {
  const ctx = createTestCtx();
  const data = seed(ctx);
  const srv = await startTestServer(ctx);
  return { ctx, ...data, srv, c: srv.client() };
}

/** Khách chạm thẻ / quét QR trên bàn → trang quán QS → bấm nút có vé → TBQ ghi lượt vào rồi chuyển về link sạch. */
async function enter(ctx, c) {
  const r = await c.get(`/qs/quan-test?t=${ticketFor(ctx)}`, UA);
  assert.equal(r.status, 303, r.text);
  assert.equal(r.headers.get('location'), '/qs/quan-test');
  return c.get('/qs/quan-test', UA);
}

async function login(ctx, c, phone = '0912345678') {
  assert.equal((await enter(ctx, c)).status, 200);
  const sent = await c.post('/api/otp/send', { phone });
  assert.equal(sent.json.ok, true, sent.text);
  const code = ctx.otpSent.at(-1).code;
  const noConsent = await c.post('/api/otp/verify', { phone, code, consent: false });
  assert.equal(noConsent.json.code, 'consent_required');
  const ok = await c.post('/api/otp/verify', { phone, code, consent: true });
  assert.equal(ok.json.ok, true, ok.text);
}

test('luồng đầy đủ: vé từ trang quán → OTP → nhận slot → Lấy mã → thư về → hiện mã', async () => {
  const { ctx, srv, c, tools } = await setup();
  try {
    const page = await enter(ctx, c);
    assert.match(page.text, /Gửi mã qua SMS/);
    assert.ok(c.jar.has('did'));
    assert.match(page.headers.get('content-security-policy'), /default-src 'self'/);

    await login(ctx, c);
    assert.match((await c.get('/qs/quan-test', UA)).text, /Hôm nay bạn cần món nào/);

    const claim = await c.post('/api/claim', { toolId: tools.chatgpt.id });
    assert.equal(claim.json.status, 'active', claim.text);

    const me = await c.get('/me', UA);
    assert.match(me.text, /Lấy mã/);
    assert.match(me.text, /gpt[12]@kho\.test/);
    assert.match(me.text, /Chỉ dùng 1 máy để nhường slot cho bạn sau nhé/);

    const w = await c.post('/api/code/request', {});
    assert.equal(w.json.status, 'open', w.text);
    assert.equal((await c.get(`/api/code/status/${w.json.windowId}`)).json.status, 'waiting');

    const mail = JSON.stringify({ message_id: 'http-1', to: w.json.accountEmail, from: 'noreply@tm.openai.com', subject: 'Your ChatGPT code is 774411', text: 'code 774411' });
    const unsigned = await c.post('/hooks/mail', JSON.parse(mail));
    assert.equal(unsigned.status, 401);
    const signed = await fetch(`${srv.url}/hooks/mail`, {
      method: 'POST', body: mail,
      headers: { 'content-type': 'application/json', 'x-signature': `sha256=${hmac(ctx.config.mail.webhookSecret, mail)}` },
    }).then((r) => r.json());
    assert.equal(signed.results[0].verdict, 'matched');

    const st = await c.get(`/api/code/status/${w.json.windowId}`);
    assert.equal(st.json.code, '774411');

    // Máy khác (không có cookie) không xem được mã.
    const stranger = srv.client();
    assert.equal((await stranger.get(`/api/code/status/${w.json.windowId}`)).status, 401);
  } finally {
    await srv.close();
  }
});

test('bảo vệ: POST khác nguồn bị chặn; trình xem trước link không tiêu vé; link thẻ / màn hình quầy cũ không còn', async () => {
  const { ctx, srv, c } = await setup();
  try {
    const evil = await c.post('/api/otp/send', { phone: '0912345678' }, { origin: 'https://evil.example' });
    assert.equal(evil.status, 403);
    const t = ticketFor(ctx);
    await c.get(`/qs/quan-test?t=${t}`, { 'user-agent': 'facebookexternalhit/1.1' });
    await c.get(`/qs/quan-test?t=${t}`, { 'user-agent': 'Zalo' });
    assert.equal(get(ctx.db, 'SELECT COUNT(*) AS n FROM taps').n, 0);
    assert.equal(get(ctx.db, 'SELECT COUNT(*) AS n FROM qs_tickets').n, 0, 'máy xem trước link không giữ vé của khách');
    for (const old of ['/c/card-test-1', '/quan/disp-test-token', '/api/quan/disp-test-token/code']) assert.equal((await c.get(old, UA)).status, 404, old);
    assert.equal((await c.get('/static/../server.js')).status, 404);
    const r = await c.post('/api/claim', { toolId: 1 });
    assert.equal(r.status, 401);
    // Form POST thật của trình duyệt có thể gửi "Origin: null": chỉ cho qua khi Sec-Fetch-Site = same-origin.
    assert.equal((await c.postForm('/admin/login', { password: 'x' }, { origin: 'null' })).status, 403);
    assert.equal((await c.postForm('/admin/login', { password: 'x' }, { origin: 'null', 'sec-fetch-site': 'same-origin' })).status, 303);
    assert.equal((await c.postForm('/admin/login', { password: 'x' }, { origin: 'null', 'sec-fetch-site': 'cross-site' })).status, 403);
  } finally {
    await srv.close();
  }
});

test('vé: link gửi cho máy khác bị từ chối; link không vé chỉ hiện hướng dẫn, không có ô số điện thoại', async () => {
  const { ctx, srv, c, tools } = await setup();
  try {
    const t = ticketFor(ctx);
    assert.equal((await c.get(`/qs/quan-test?t=${t}`, UA)).status, 303);
    const friend = srv.client();
    const shared = await friend.get(`/qs/quan-test?t=${t}`, UA);
    assert.match(shared.text, /đã được mở trên một máy khác/);
    const plain = await friend.get('/qs/quan-test', UA);
    assert.match(plain.text, /Nhận tại quán nhé/);
    assert.doesNotMatch(plain.text, /Gửi mã qua SMS/);
    // Có đăng nhập nhưng chưa có lượt vào → need_entry.
    await login(ctx, c);
    ctx.clock.advance(31 * 60_000);
    const r = await c.post('/api/claim', { toolId: tools.capcut.id });
    assert.equal(r.json.status, 'need_entry');
    assert.match((await c.get(`/qs/quan-test?t=${ticketFor(ctx, 'quan-test', ctx.now() - 40 * 60_000)}`, UA)).text, /đã cũ/);
    assert.match((await c.get('/qs/quan-test?t=1.2.sai-sai-sai.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', UA)).text, /không hợp lệ/);
    assert.equal((await enter(ctx, c)).status, 200);
    const ok = await c.post('/api/claim', { toolId: tools.capcut.id });
    assert.equal(ok.json.status, 'active', ok.text);
    assert.equal((await c.get('/api/me')).json.view.password, 'Secret#123');
  } finally {
    await srv.close();
  }
});

test('thẻ NFC riêng của Tiệm (quán chưa dùng QS): chạm → OTP → nhận; link chép lại → bảo chạm lại; thẻ khoá / lạ → thông báo', async () => {
  const { ctx, srv, c, cafe, tools } = await setup();
  try {
    const card = makeNfcCard(ctx, cafe, 'Bàn 7');
    const link = `/c/${card.token}?m=04A1B2C3D4E5F6x000005`;
    const first = await c.get(link, UA);
    assert.equal(first.status, 200);
    assert.match(first.text, /Gửi mã qua SMS/);
    const sent = await c.post('/api/otp/send', { phone: '0912345678' });
    assert.equal(sent.json.ok, true, sent.text);
    assert.equal((await c.post('/api/otp/verify', { phone: '0912345678', code: ctx.otpSent.at(-1).code, consent: true })).json.ok, true);
    assert.match((await c.get(link, UA)).text, /Hôm nay bạn cần món nào/, 'tải lại cùng máy sau đăng nhập');
    const claim = await c.post('/api/claim', { toolId: tools.capcut.id });
    assert.equal(claim.json.status, 'active', claim.text);
    assert.equal(get(ctx.db, 'SELECT card_id FROM slots WHERE id = ?', claim.json.slotId).card_id, card.id);

    // Bạn ở nhà mở link được gửi qua Zalo (cùng bộ đếm) → không tính.
    const friend = srv.client();
    const copied = await friend.get(link, UA);
    assert.match(copied.text, /Chạm lại thẻ trên bàn/);
    assert.equal(get(ctx.db, "SELECT COUNT(*) AS n FROM taps WHERE card_id = ? AND verdict = 'replay'", card.id).n, 1);
    // Xem trước link (máy chủ Zalo) không ghi lượt chạm.
    const before = get(ctx.db, 'SELECT COUNT(*) AS n FROM taps').n;
    assert.match((await friend.get(link, { 'user-agent': 'facebookexternalhit/1.1' })).text, /Mở trang này trên điện thoại/);
    assert.equal(get(ctx.db, 'SELECT COUNT(*) AS n FROM taps').n, before);

    await friend.get('/', UA);
    assert.equal((await friend.get(`/c/${card.token}?m=04A1B2C3D4E5F6x000006`, UA)).status, 200);
    assert.doesNotMatch((await friend.get(`/c/${card.token}?m=04A1B2C3D4E5F6x000006`, UA)).text, /Chạm lại thẻ/);

    ctx.db.prepare("UPDATE cards SET status = 'locked' WHERE id = ?").run(card.id);
    assert.match((await friend.get(`/c/${card.token}?m=04A1B2C3D4E5F6x000007`, UA)).text, /Thẻ này đang tạm khoá/);
    assert.equal((await friend.get('/c/khong-co-the-nay', UA)).status, 404);
    // Lối vào QS ẩn không mở được bằng /c/.
    const qsToken = get(ctx.db, "SELECT token FROM cards WHERE kind = 'qs'").token;
    assert.equal((await friend.get(`/c/${qsToken}`, UA)).status, 404);
  } finally {
    await srv.close();
  }
});

test('quản trị: phải đăng nhập; trang trực duyệt trả JSON; thao tác cần CSRF', async () => {
  const { ctx, srv, c } = await setup();
  try {
    const r0 = await c.get('/admin');
    assert.equal(r0.status, 303);
    assert.equal(r0.headers.get('location'), '/admin/login');
    const bad = await c.postForm('/admin/login', { password: 'sai' });
    assert.match(bad.headers.get('location'), /msg=/);
    // Hết phiên ở trang Theo dõi → đăng nhập lại quay về đúng trang; next ra ngoài trang quản trị thì về Tổng quan.
    assert.equal((await c.get('/admin/live')).headers.get('location'), '/admin/login?next=%2Fadmin%2Flive');
    assert.match((await c.get('/admin/login?next=%2Fadmin%2Flive')).text, /name="next" value="\/admin\/live"/);
    assert.match((await c.get('/admin/login?next=https%3A%2F%2Fevil.test')).text, /name="next" value="\/admin"/);
    assert.match((await c.get('/admin/login?next=%2F%2Fevil.test%2Fadmin')).text, /name="next" value="\/admin"/);
    const ok = await c.postForm('/admin/login', { password: ctx.config.adminPassword, next: '/admin/live' });
    assert.equal(ok.headers.get('location'), '/admin/live');
    const home = await c.get('/admin');
    assert.equal(home.status, 200);
    assert.match(home.text, /Hôm nay/);
    const csrf = /data-csrf="([^"]+)"/.exec(home.text)[1];

    const live = await c.get('/admin/api/live');
    assert.deepEqual(Object.keys(live.json).sort(), ['alerts', 'now', 'ok', 'stock', 'tasks']);
    assert.equal((await c.post('/admin/api/tasks/1/done', {})).status, 403, 'thiếu CSRF');

    // Thêm quán: mã quán QS không bắt buộc (quán chưa dùng QS → thẻ NFC riêng của Tiệm).
    const noSlug = await c.postForm('/admin/cafes', { _csrf: csrf, name: 'Quán Không QS', daily_quota: '10' });
    assert.match(decodeURIComponent(noSlug.headers.get('location')), /Đã thêm quán\. Tạo thẻ NFC/);
    const plainUrl = noSlug.headers.get('location').split('?')[0];
    const made = await c.postForm(`${plainUrl}/cards`, { _csrf: csrf, count: '3', prefix: 'Bàn', start: '1' });
    assert.match(decodeURIComponent(made.headers.get('location')), /Đã tạo 3 thẻ/);
    const csv = await c.get(`${plainUrl}/cards.csv`);
    assert.equal(csv.status, 200);
    assert.equal(csv.text.trim().split('\n').length, 4);
    assert.match(csv.text, /\/c\/[A-Za-z0-9_-]+/);
    assert.match((await c.get(plainUrl)).text, /Thẻ NFC riêng của Tiệm \(3\)/);

    const created = await c.postForm('/admin/cafes', { _csrf: csrf, name: 'Quán Mới', qs_slug: 'quan-moi', daily_quota: '10' });
    assert.match(decodeURIComponent(created.headers.get('location')), /bật sự kiện/);
    const cafeUrl = created.headers.get('location').split('?')[0];
    const cafePage = await c.get(cafeUrl);
    assert.match(cafePage.text, /\/qs\/quan-moi/);
    const dash = (await c.get('/admin')).text;
    assert.match(dash, /Trang quán QS: quan-moi/);
    assert.match(dash, /Quán Không QS<\/a><\/td><td>Thẻ NFC riêng/);
    assert.doesNotMatch(cafePage.text, /Màn hình quầy|mã quầy/);
    assert.equal((await c.postForm('/admin/cafes', { _csrf: 'sai', name: 'X' })).status, 403);

    for (const p of ['/admin/live', '/admin/tasks', '/admin/cafes', '/admin/tools', '/admin/tools/new', '/admin/tools/1', '/admin/accounts', '/admin/accounts/1',
      '/admin/customers', '/admin/slots', '/admin/mails', '/admin/events', '/admin/settings']) {
      const r = await c.get(p);
      assert.equal(r.status, 200, `${p}: ${r.text.slice(0, 200)}`);
    }

    const saved = await c.postForm('/admin/settings', { _csrf: csrf, codeWindowSec: '240', yellowAction: 'approve' });
    assert.match(decodeURIComponent(saved.headers.get('location')), /Đã lưu cài đặt/);
    assert.equal(ctx.settings().codeWindowSec, 240);
    assert.equal(ctx.settings().yellowAction, 'approve');

    await runJobs(ctx);
  } finally {
    await srv.close();
  }
});

test('vận hành độc lập: hết kho / hết lượt / quán hết suất → báo trên Theo dõi kèm "nên làm"; sửa nhanh lượt và suất trên danh sách', async () => {
  const { ctx, srv, c, tools, cafe } = await setup();
  try {
    // Chủ đăng nhập quản trị (máy riêng).
    const admin = srv.client();
    await admin.postForm('/admin/login', { password: ctx.config.adminPassword });
    const csrf = /data-csrf="([^"]+)"/.exec((await admin.get('/admin')).text)[1];
    // Quán chỉ còn 1 suất, ChatGPT chỉ 1 lượt / ngày.
    ctx.db.prepare('UPDATE cafes SET daily_quota = 1 WHERE id = ?').run(cafe.id);
    ctx.db.prepare('UPDATE tools SET daily_cap = 1 WHERE id = ?').run(tools.chatgpt.id);
    await login(ctx, c);
    assert.equal((await c.post('/api/claim', { toolId: tools.chatgpt.id })).json.status, 'active');
    const live = (await admin.get('/admin/api/live')).json;
    const chat = live.stock.find((x) => x.id === tools.chatgpt.id);
    assert.deepEqual([chat.today, chat.cap, chat.free], [1, 1, 0]);
    const types = live.alerts.map((e) => e.type);
    assert.ok(types.includes('tool_daily_cap'), types.join());
    assert.ok(types.includes('cafe_full'), types.join());
    const capAlert = live.alerts.find((e) => e.type === 'tool_daily_cap');
    assert.equal(capAlert.label, 'Hết lượt hôm nay');
    assert.match(capAlert.hint, /Lượt \/ ngày/);
    // Báo 1 lần / ngày, không lặp.
    await login(ctx, srv.client(), '0987000111').catch(() => {});
    assert.equal((await admin.get('/admin/api/live')).json.alerts.filter((e) => e.type === 'cafe_full').length, 1);
    // Sửa nhanh trên danh sách.
    let r = await admin.postForm(`/admin/tools/${tools.chatgpt.id}/cap`, { _csrf: csrf, daily_cap: '20' });
    assert.match(decodeURIComponent(r.headers.get('location')), /20 lượt/);
    assert.equal(get(ctx.db, 'SELECT daily_cap FROM tools WHERE id = ?', tools.chatgpt.id).daily_cap, 20);
    r = await admin.postForm(`/admin/tools/${tools.chatgpt.id}/cap`, { _csrf: csrf, daily_cap: '' });
    assert.equal(get(ctx.db, 'SELECT daily_cap FROM tools WHERE id = ?', tools.chatgpt.id).daily_cap, null, 'để trống = không giới hạn');
    r = await admin.postForm(`/admin/cafes/${cafe.id}/quota`, { _csrf: csrf, daily_quota: '30' });
    assert.equal(get(ctx.db, 'SELECT daily_quota FROM cafes WHERE id = ?', cafe.id).daily_quota, 30);
    assert.equal((await admin.postForm(`/admin/cafes/${cafe.id}/quota`, { daily_quota: '99' })).status, 403, 'thiếu CSRF');
    assert.match((await admin.get('/admin/cafes')).text, /1 \/\s*<input name="daily_quota"/);
    // Kho CapCut chỉ 1 tài khoản → khách lấy xong là hết kho: báo ĐỎ (có âm báo) + "nên làm".
    const c2 = srv.client();
    await login(ctx, c2, '0977000222');
    assert.equal((await c2.post('/api/claim', { toolId: tools.capcut.id })).json.status, 'active');
    const sold = (await admin.get('/admin/api/live')).json.alerts.find((e) => e.type === 'tool_sold_out');
    assert.ok(sold, 'có báo hết kho');
    assert.equal(sold.severity, 'red');
    assert.match(sold.hint, /Mua thêm/);
  } finally {
    await srv.close();
  }
});
