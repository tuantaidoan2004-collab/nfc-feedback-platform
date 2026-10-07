// Tiệm chạy dưới thư mục con: BASE_URL = https://thu.tiembanquyen.com/colap → mọi trang, link, cookie, chuyển trang đều ở /colap/…
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestCtx, seed, startTestServer, ticketFor, makeNfcCard } from './helpers.js';
import { loadConfig, validateConfig, basePathOf } from '../src/config.js';
import { withBase, withBaseHtml } from '../src/lib/http.js';

const UA = { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1' };
const B = '/colap';

/** Mọi href / src / action trỏ vào trang của mình phải có /colap. */
function assertAllPrefixed(page) {
  const bad = [...page.matchAll(/\b(?:href|src|action|formaction)="(\/[^"]*)"/g)].map((m) => m[1]).filter((p) => !p.startsWith(`${B}/`) && !p.startsWith('//'));
  assert.deepEqual(bad, [], 'còn link thiếu /colap');
}

test('cấu hình: tiền tố lấy từ BASE_URL; BASE_URL sai dạng bị từ chối', () => {
  assert.equal(basePathOf('https://thu.tiembanquyen.com/colap'), '/colap');
  assert.equal(basePathOf('https://thu.tiembanquyen.com/colap/'), '/colap');
  assert.equal(basePathOf('https://thu.tiembanquyen.com'), '');
  assert.equal(loadConfig({ BASE_URL: 'https://thu.tiembanquyen.com/colap/' }).basePath, '/colap');
  const errs = (u) => validateConfig(loadConfig({ BASE_URL: u })).filter((e) => e.startsWith('BASE_URL phải dạng'));
  assert.equal(errs('https://thu.tiembanquyen.com/colap').length, 0);
  assert.equal(errs('https://thu.tiembanquyen.com').length, 0);
  assert.equal(errs('https://thu.tiembanquyen.com/colap?x=1').length, 1);
  assert.equal(errs('https://thu.tiembanquyen.com/có dấu').length, 1);

  assert.equal(withBase('/me', B), '/colap/me');
  assert.equal(withBase('https://zalo.me/0988428496', B), 'https://zalo.me/0988428496');
  assert.equal(withBase('//x.test/a', B), '//x.test/a');
  assert.equal(withBase('/me', ''), '/me');
  assert.equal(withBaseHtml('<a href="/me">x</a><a href="https://a.b/">y</a><form action="/api">', B),
    '<a href="/colap/me">x</a><a href="https://a.b/">y</a><form action="/colap/api">');
});

test('chạy dưới /colap: vé QS → OTP → nhận slot; thẻ NFC; cookie và link đều có /colap; ngoài /colap là 404', async () => {
  const ctx = createTestCtx();
  const { tools, cafe } = seed(ctx);
  const srv = await startTestServer(ctx, { basePath: B });
  const c = srv.client();
  const origin = srv.url.slice(0, -B.length);
  try {
    assert.equal(ctx.config.basePath, B);

    // Ngoài thư mục con: không phục vụ. Gõ thiếu dấu / cuối → chuyển về /colap/.
    assert.equal((await fetch(`${origin}/qs/quan-test`, { redirect: 'manual' })).status, 404);
    assert.equal((await fetch(`${origin}/colapx/`, { redirect: 'manual' })).status, 404);
    const bare = await fetch(`${origin}${B}?a=1`, { redirect: 'manual' });
    assert.equal(bare.status, 308);
    assert.equal(bare.headers.get('location'), `${B}/?a=1`);
    const root = await fetch(`${origin}/`, { redirect: 'manual' });
    assert.equal(root.status, 302);
    assert.equal(root.headers.get('location'), `${B}/`);
    assert.equal((await c.get('/healthz')).text, 'ok');

    // Vé từ trang quán → chuyển về link sạch, vẫn trong /colap.
    const r = await c.get(`/qs/quan-test?t=${ticketFor(ctx)}`, UA);
    assert.equal(r.status, 303, r.text);
    assert.equal(r.headers.get('location'), `${B}/qs/quan-test`);
    const cookies = r.headers.getSetCookie();
    assert.ok(cookies.length > 0);
    for (const ck of cookies) assert.match(ck, /; Path=\/colap(;|$)/, ck);

    const page = await c.get('/qs/quan-test', UA);
    assert.equal(page.status, 200);
    assertAllPrefixed(page.text);
    assert.match(page.text, /src="\/colap\/static\/app\.js\?v=/);
    const js = await c.get(page.text.match(/src="\/colap(\/static\/app\.js\?v=[^"]+)"/)[1]);
    assert.equal(js.status, 200);
    assert.match(js.text, /const BASE = /);

    // OTP + nhận slot qua /colap/api/…
    const phone = '0912345678';
    assert.equal((await c.post('/api/otp/send', { phone })).json.ok, true);
    const ok = await c.post('/api/otp/verify', { phone, code: ctx.otpSent.at(-1).code, consent: true });
    assert.equal(ok.json.ok, true, ok.text);
    const claim = await c.post('/api/claim', { toolId: tools.chatgpt.id });
    assert.equal(claim.json.status, 'active', claim.text);
    const me = await c.get('/me', UA);
    assert.match(me.text, /Lấy mã/);
    assertAllPrefixed(me.text);

    for (const p of ['/', '/privacy', '/ve-chung-toi?shop=quan-test', '/khong-co']) assertAllPrefixed((await c.get(p, UA)).text);

    // Thẻ NFC riêng của Tiệm: chạm thẻ (link /colap/c/…) vẫn vào được.
    const card = makeNfcCard(ctx, cafe, 'Bàn 7');
    const tap = await srv.client().get(`/c/${card.token}?m=04A1B2C3D4E5F6x000005`, UA);
    assert.equal(tap.status, 200, tap.text);
    assert.match(tap.text, /Gửi mã qua SMS/);
    assertAllPrefixed(tap.text);
  } finally {
    await srv.close();
  }
});

test('quản trị dưới /colap: đăng nhập, cookie Path=/colap/admin, link và chuyển trang có /colap', async () => {
  const ctx = createTestCtx();
  seed(ctx);
  const srv = await startTestServer(ctx, { basePath: B });
  const c = srv.client();
  try {
    const r0 = await c.get('/admin');
    assert.equal(r0.status, 303);
    assert.equal(r0.headers.get('location'), `${B}/admin/login`);
    assertAllPrefixed((await c.get('/admin/login')).text);
    const ok = await c.postForm('/admin/login', { password: ctx.config.adminPassword });
    assert.equal(ok.headers.get('location'), `${B}/admin`);
    assert.match(ok.headers.getSetCookie().join('\n'), /adm=[^;]+; Path=\/colap\/admin;/);
    for (const p of ['/admin', '/admin/cafes', '/admin/live', '/admin/accounts', '/admin/settings']) {
      const pg = await c.get(p);
      assert.equal(pg.status, 200, p);
      assertAllPrefixed(pg.text);
    }
    const cafes = await c.get('/admin/cafes');
    assert.match(cafes.text, new RegExp(`${srv.url.replace(/[.]/g, '\\.')}/qs/`), 'link mẫu cho QS phải có /colap');
  } finally {
    await srv.close();
  }
});
