// QS đổi mã quán (09/10/2026 22:36: 8ugdc → bamos, 22:47: f69kk → orenchi). TBQ bản cũ tưởng quán mới → tạo quán trùng
// không có kho riêng → khách quét vé ở Bamos chỉ thấy Canva (kho chung), CapCut / ChatGPT "Tạm hết" dù kho Bamos còn đầy.
// Lần 08/10 (f69kk) cũng y hệt, lúc đó chỉ gộp tay dữ liệu. Giờ: mã mới trùng tên quán cũ → gắn vào quán cũ; mã cũ vẫn chạy;
// quán trùng đã lỡ tạo → nút Gộp ở trang Quán.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createTestCtx, seed, startTestServer, ticketFor, makeTap, makeCustomer, makeDevice, byId } from './helpers.js';
import { get, run } from '../src/db/index.js';
import { hmac } from '../src/lib/crypto.js';
import { cafeByShop, cafeKey, createCafe, qsEntryCard, cafeShopAliases } from '../src/domain/presence.js';
import { toolAvailability } from '../src/domain/quota.js';

/** Trang quán QS giả: /orenchi → "O’renchi Cafe", mã khác → tiêu đề chung của QS. */
async function fakeQs() {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(req.url === '/orenchi' ? '<html><head><title>O’renchi Cafe</title></head></html>' : '<html><head><title>Quite Sensational</title></head></html>');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { origin: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((r) => server.close(r)) };
}

function signer(ctx, client) {
  let n = 0;
  return (body) => {
    const raw = JSON.stringify({ ts: Math.floor(ctx.now() / 1000), nonce: `nonce-doima-${++n}-xyz`, ...body });
    return client.post('/hooks/qs/quan', JSON.parse(raw), { 'x-tbq-signature': `sha256=${hmac(ctx.config.qsTicketKey, raw)}` });
  };
}

/** Quán Bamos Coffee (mã 8ugdc) giữ toàn bộ CapCut + ChatGPT trong kho riêng, kho chung trống — giống máy thật 09/10. */
function bamos(ctx) {
  const data = seed(ctx);
  run(ctx.db, "UPDATE cafes SET name = 'Bamos Coffee', qs_slug = '8ugdc' WHERE id = ?", data.cafe.id);
  run(ctx.db, 'UPDATE accounts SET cafe_id = ?', data.cafe.id);
  return { ...data, cafe: byId(ctx, 'cafes', data.cafe.id) };
}

test('tên quán để so trùng: bỏ dấu, dấu nháy, chữ chung chung', () => {
  assert.equal(cafeKey('O’renchi Cafe'), cafeKey('O’renchi'));
  assert.equal(cafeKey('orenchicafe'), 'orenchi');
  assert.equal(cafeKey('Bamos Coffee'), 'bamos');
  assert.equal(cafeKey('Cà Phê Mây'), cafeKey('Mây Coffee'));
  assert.equal(cafeKey('Cafe'), '', 'chỉ có chữ chung chung → không so');
  assert.notEqual(cafeKey('Bamos Coffee'), cafeKey('Bamo Coffee'));
});

test('QS đổi mã quán (8ugdc → bamos): không tạo quán trùng, khách quét vé mới thấy đúng kho Bamos; link mã cũ vẫn chạy', async () => {
  const ctx = createTestCtx();
  const { cafe, tools } = bamos(ctx);
  const srv = await startTestServer(ctx);
  try {
    const call = signer(ctx, srv.client());
    const open = await call({ action: 'open', shop: 'bamos', name: 'Bamos Coffee' });
    assert.equal(open.status, 200, open.text);
    assert.equal(open.json.created, false, 'không tạo quán mới');
    assert.equal(open.json.link, `${srv.url}/qs/bamos`, 'QS nhận link theo mã mới');
    assert.equal(get(ctx.db, 'SELECT COUNT(*) AS n FROM cafes').n, 1);
    assert.equal(cafeByShop(ctx, 'bamos').id, cafe.id);
    assert.equal(cafeByShop(ctx, '8ugdc').id, cafe.id, 'mã cũ vẫn về đúng quán');
    assert.deepEqual(cafeShopAliases(ctx, cafe.id), ['8ugdc']);
    assert.equal(ctx.alerts('qs_shop_linked').length, 1, 'chủ thấy trên Theo dõi');
    assert.equal(open.json.tools.find((x) => x.slug === 'capcut').available, true, 'khối Công cụ trên trang QS không báo Tạm hết');

    // Khách quét vé mới (mã bamos) → trang chọn món có CapCut + ChatGPT chọn được (trước: chỉ Canva, CapCut "Tạm hết").
    const guest = srv.client();
    assert.equal((await guest.get(`/qs/bamos?t=${ticketFor(ctx, 'bamos')}`)).status, 303);
    const page = await guest.get('/qs/bamos');
    assert.match(page.text, /data-name="CapCut Pro"/);
    assert.match(page.text, /data-name="ChatGPT Plus"/);
    assert.doesNotMatch(page.text, /Tạm hết/);
    assert.ok(toolAvailability(ctx, null, cafe.id).find((x) => x.tool.id === tools.capcut.id).free > 0);

    // Vé / link theo mã cũ (QS chưa đổi hết chỗ) vẫn vào đúng quán.
    const old = srv.client();
    assert.equal((await old.get(`/qs/8ugdc?t=${ticketFor(ctx, '8ugdc')}`)).status, 303);
    assert.match((await old.get('/qs/8ugdc')).text, /data-name="CapCut Pro"/);
    assert.equal(get(ctx.db, 'SELECT COUNT(DISTINCT cafe_id) AS n FROM taps').n, 1, 'mọi lượt vào ghi cho 1 quán');
  } finally { await srv.close(); }
});

test('QS đổi mã mà không gọi API: khách mở /qs/<mã mới> → TBQ đọc tên trên trang QS, trùng quán cũ thì gắn luôn', async () => {
  const ctx = createTestCtx();
  const fake = await fakeQs();
  ctx.config.qsOrigin = fake.origin;
  const { cafe } = bamos(ctx);
  run(ctx.db, "UPDATE cafes SET name = 'O’renchi', qs_slug = 'f69kk' WHERE id = ?", cafe.id);
  const srv = await startTestServer(ctx);
  try {
    const guest = srv.client();
    assert.equal((await guest.get(`/qs/orenchi?t=${ticketFor(ctx, 'orenchi')}`)).status, 303);
    assert.match((await guest.get('/qs/orenchi')).text, /data-name="CapCut Pro"/);
    assert.equal(byId(ctx, 'cafes', cafe.id).qs_slug, 'orenchi');
    assert.equal(cafeByShop(ctx, 'f69kk').id, cafe.id);
    // Mã lạ thật (trang QS không có tên) → vẫn "chưa có chương trình", không gắn bừa.
    assert.match((await srv.client().get('/qs/zz9xx')).text, /chưa có chương trình/);
    assert.equal(cafeByShop(ctx, 'zz9xx'), null);
  } finally { await srv.close(); await fake.close(); }
});

test('2 quán đang chạy cùng tên → không đoán, tạo quán mới như cũ; quán chủ đã dừng không bị gắn', async () => {
  const ctx = createTestCtx();
  bamos(ctx);
  createCafe(ctx, { name: 'Bamos', qsSlug: 'bms2' });
  const srv = await startTestServer(ctx);
  try {
    const call = signer(ctx, srv.client());
    const r = await call({ action: 'open', shop: 'bamos', name: 'Bamos Coffee' });
    assert.equal(r.status, 201);
    assert.equal(r.json.created, true);
    run(ctx.db, "UPDATE cafes SET status = 'paused', paused_by = 'admin' WHERE qs_slug = 'bms2' OR qs_slug = 'bamos'");
    // Còn đúng 1 quán đang chạy tên Bamos → gắn vào quán đó.
    const r2 = await call({ action: 'open', shop: 'bamos-q7', name: 'BAMOS coffee' });
    assert.equal(r2.json.created, false);
    assert.equal(cafeByShop(ctx, 'bamos-q7').qs_slug, 'bamos-q7');
    assert.equal(cafeByShop(ctx, 'bamos-q7').name, 'Bamos Coffee');
  } finally { await srv.close(); }
});

test('quán trùng đã lỡ tạo: trang Quán báo trùng, bấm Gộp → lượt vào / slot / thẻ / mã QS về quán gốc, khách thấy đúng kho', async () => {
  const ctx = createTestCtx();
  const { cafe, tools } = bamos(ctx);
  // Như máy thật: QS tạo quán #7 "Bamos Coffee" (mã bamos) sau quán gốc, có 1 lượt vào + 1 slot.
  ctx.clock.advance(60_000);
  const dupId = createCafe(ctx, { name: 'Bamos Coffee', qsSlug: 'bamos' });
  const dup = byId(ctx, 'cafes', dupId);
  const dupCard = qsEntryCard(ctx, dup);
  const dev = 'device-gop-aaaaaaaaaaaaaaaa';
  const c = makeCustomer(ctx, 'khach-gop@x.vn');
  makeDevice(ctx, dev, c.id);
  makeTap(ctx, { card: dupCard, deviceId: dev });
  run(ctx.db, `INSERT INTO slots(customer_id, tool_id, cafe_id, device_id, status, created_at, expires_at)
    VALUES(?, ?, ?, ?, 'ended', ?, ?)`, c.id, tools.capcut.id, dupId, dev, ctx.now(), ctx.now() + 3600000);
  assert.equal(toolAvailability(ctx, null, dupId).find((x) => x.tool.id === tools.capcut.id).free, 0, 'quán trùng: kho trống');

  const srv = await startTestServer(ctx);
  try {
    const admin = srv.client();
    await admin.postForm('/admin/login', { password: ctx.config.adminPassword });
    const list = await admin.get('/admin/cafes');
    assert.match(list.text, new RegExp(`Trùng #${cafe.id}`));
    const page = await admin.get(`/admin/cafes/${dupId}`);
    assert.match(page.text, /Có thể trùng/);
    assert.match(page.text, new RegExp(`<option value="${cafe.id}" selected>`), 'gợi ý sẵn quán gốc');
    const csrf = page.text.match(/name="_csrf" value="([^"]+)"/)[1];
    const r = await admin.postForm(`/admin/cafes/${dupId}/gop`, { _csrf: csrf, into: String(cafe.id) });
    assert.equal(r.status, 303, r.text);

    const after = byId(ctx, 'cafes', dupId);
    assert.equal(after.status, 'paused');
    assert.equal(after.qs_slug, null);
    assert.match(after.name, /trùng — đã gộp vào #/);
    assert.equal(byId(ctx, 'cafes', cafe.id).qs_slug, 'bamos', 'mã QS mới (quán trùng tạo sau) thành mã đang dùng');
    assert.deepEqual(cafeShopAliases(ctx, cafe.id), ['8ugdc']);
    assert.equal(get(ctx.db, 'SELECT COUNT(*) AS n FROM slots WHERE cafe_id = ?', dupId).n, 0);
    assert.equal(get(ctx.db, 'SELECT COUNT(*) AS n FROM taps WHERE cafe_id = ?', dupId).n, 0);
    assert.equal(get(ctx.db, 'SELECT COUNT(*) AS n FROM cards WHERE cafe_id = ?', dupId).n, 0);
    assert.equal(get(ctx.db, "SELECT COUNT(*) AS n FROM cards WHERE cafe_id = ? AND kind = 'qs'", cafe.id).n, 1);

    // Máy vừa quét vé ở quán trùng giờ đang "ở" quán gốc → thấy kho Bamos.
    const guest = srv.client();
    assert.equal((await guest.get(`/qs/bamos?t=${ticketFor(ctx, 'bamos')}`)).status, 303);
    assert.match((await guest.get('/qs/bamos')).text, /data-name="CapCut Pro"/);
    // Gộp vào chính nó / quán không có → báo lỗi.
    assert.equal((await admin.postForm(`/admin/cafes/${cafe.id}/gop`, { _csrf: csrf, into: String(cafe.id) })).status, 400);
  } finally { await srv.close(); }
});
