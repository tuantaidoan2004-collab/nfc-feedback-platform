// API mở / đóng quán cho QS (/hooks/qs/quan, docs/phoi-hop-voi-QS.md mục 10) + thêm quán bằng cách dán link trang quán QS.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createTestCtx, startTestServer } from './helpers.js';
import { get } from '../src/db/index.js';
import { hmac } from '../src/lib/crypto.js';
import { shopFromInput } from '../src/domain/presence.js';

/** Trang quán QS giả: /sakz8 → "Bamos Coffee", mã khác → tiêu đề chung của QS (giống trang thật). */
async function fakeQs() {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(req.url === '/sakz8' ? '<html><head><title>Bamos Coffee</title></head></html>' : '<html><head><title>Quite Sensational</title></head></html>');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { origin: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((r) => server.close(r)) };
}

function signer(ctx, qs) {
  let n = 0;
  return (body, key = ctx.config.qsTicketKey) => {
    const raw = JSON.stringify({ ts: Math.floor(ctx.now() / 1000), nonce: `nonce-quan-${++n}-xyz`, ...body });
    return qs.post('/hooks/qs/quan', JSON.parse(raw), { 'x-tbq-signature': `sha256=${hmac(key, raw)}` });
  };
}

test('mã quán từ link: dán nguyên link trang quán QS hay chỉ mã đều ra mã', () => {
  assert.equal(shopFromInput('https://quitesensational-review-bio.com/sakz8'), 'sakz8');
  assert.equal(shopFromInput(' https://quitesensational-review-bio.com/SAKZ8?utm=x#a '), 'sakz8');
  assert.equal(shopFromInput('sakz8'), 'sakz8');
  assert.equal(shopFromInput(''), '');
});

test('API quán cho QS: open tạo quán (tên đọc từ trang QS), close tạm dừng, open mở lại; chủ dừng thì QS không mở lại được', async () => {
  const ctx = createTestCtx();
  const fake = await fakeQs();
  ctx.config.qsOrigin = fake.origin;
  const srv = await startTestServer(ctx);
  try {
    const call = signer(ctx, srv.client());
    assert.equal((await call({ action: 'open', shop: 'sakz8' }, 'khoa-sai')).status, 401);
    assert.equal((await call({ action: 'mo', shop: 'sakz8' })).status, 400);
    assert.equal((await call({ action: 'open', shop: '../x' })).status, 400);
    assert.equal((await call({ action: 'status', shop: 'sakz8' })).status, 404);

    const open = await call({ action: 'open', shop: 'SAKZ8', dailyQuota: 30 });
    assert.equal(open.status, 201, open.text);
    assert.equal(open.json.created, true);
    assert.equal(open.json.name, 'Bamos Coffee');
    assert.equal(open.json.status, 'active');
    assert.equal(open.json.dailyQuota, 30);
    assert.equal(open.json.link, `${srv.url}/qs/sakz8`);
    assert.equal(ctx.alerts('qs_api_cafe_opened').length, 1, 'chủ thấy có quán mới');

    const again = await call({ action: 'open', shop: 'sakz8' });
    assert.equal(again.status, 200);
    assert.equal(again.json.created, false);
    assert.equal(get(ctx.db, 'SELECT COUNT(*) AS n FROM cafes').n, 1, 'mở lần 2 không tạo trùng');

    assert.equal((await call({ action: 'close', shop: 'sakz8' })).json.status, 'paused');
    assert.match((await srv.client().get('/qs/sakz8')).text, /tạm dừng/);
    assert.equal((await call({ action: 'open', shop: 'sakz8' })).json.status, 'active', 'QS dừng thì QS mở lại được');

    // Chủ Tiệm tự dừng → QS bấm Mở cũng không mở lại.
    const { run } = await import('../src/db/index.js');
    run(ctx.db, "UPDATE cafes SET status = 'paused', paused_by = 'admin'");
    const blocked = await call({ action: 'open', shop: 'sakz8' });
    assert.equal(blocked.json.status, 'paused');
    assert.equal(blocked.json.pausedBy, 'admin');

    // Mã quán không có trang trên QS → vẫn tạo, tên tạm = mã quán; QS gửi kèm tên thì dùng tên đó.
    assert.equal((await call({ action: 'open', shop: 'k3x9q' })).json.name, 'k3x9q');
    assert.equal((await call({ action: 'open', shop: 'abc12', name: 'Quán <b>Mây</b>' })).json.name, 'Quán b Mây /b', 'bỏ thẻ HTML');
  } finally { await srv.close(); await fake.close(); }
});

test('quản trị: dán link trang quán QS, để trống tên → tự lấy tên quán; link sai → báo lỗi, không tạo', async () => {
  const ctx = createTestCtx();
  const fake = await fakeQs();
  ctx.config.qsOrigin = fake.origin;
  const srv = await startTestServer(ctx);
  try {
    const c = srv.client();
    await c.postForm('/admin/login', { password: ctx.config.adminPassword });
    const csrf = /data-csrf="([^"]+)"/.exec((await c.get('/admin')).text)[1];
    const bad = await c.postForm('/admin/cafes', { _csrf: csrf, qs_slug: 'https://quitesensational-review-bio.com/khongco1', daily_quota: '20' });
    assert.match(decodeURIComponent(bad.headers.get('location')), /Không mở được trang quán QS/);
    assert.equal(get(ctx.db, 'SELECT COUNT(*) AS n FROM cafes').n, 0);
    const ok = await c.postForm('/admin/cafes', { _csrf: csrf, qs_slug: 'https://quitesensational-review-bio.com/sakz8', daily_quota: '20' });
    assert.equal(ok.status, 303);
    const cafe = get(ctx.db, 'SELECT * FROM cafes');
    assert.equal(cafe.name, 'Bamos Coffee');
    assert.equal(cafe.qs_slug, 'sakz8');
  } finally { await srv.close(); await fake.close(); }
});
