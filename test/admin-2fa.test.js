// Đăng nhập quản trị có mã 2FA (ADMIN_TOTP) — đánh giá thương mại 09/10/2026, P1-1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestCtx, seed, startTestServer } from './helpers.js';
import { newTotpSecret, totpNow, verifyTotp, parseTotpSecret } from '../src/lib/totp.js';
import { loadConfig, validateConfig } from '../src/config.js';

const loggedIn = async (c) => (await c.get('/admin')).status === 200;

test('2FA: khoá mới hợp lệ (base32, 32 ký tự), app Authenticator đọc được; mã lệch ±30 giây vẫn nhận, lệch hơn thì không', () => {
  const s = newTotpSecret();
  assert.match(s, /^[A-Z2-7]{32}$/);
  assert.equal(parseTotpSecret(s), s);
  const t = Date.UTC(2026, 9, 9, 7, 0, 10);
  assert.notEqual(verifyTotp(s, totpNow(s, t).code, t), null);
  assert.notEqual(verifyTotp(s, totpNow(s, t - 30_000).code, t), null);
  assert.notEqual(verifyTotp(s, totpNow(s, t + 30_000).code, t), null);
  assert.equal(verifyTotp(s, totpNow(s, t - 90_000).code, t), null);
  assert.equal(verifyTotp(s, '12345', t), null);
});

test('2FA: ADMIN_TOTP sai định dạng thì máy chủ không chạy (không được tắt 2FA trong im lặng)', () => {
  const base = { NODE_ENV: 'production' };
  assert.ok(validateConfig(loadConfig({ ...base, ADMIN_TOTP: 'abc' })).some((e) => /ADMIN_TOTP/.test(e)));
  assert.ok(!validateConfig(loadConfig({ ...base, ADMIN_TOTP: newTotpSecret() })).some((e) => /ADMIN_TOTP/.test(e)));
  assert.ok(!validateConfig(loadConfig(base)).some((e) => /ADMIN_TOTP/.test(e)), 'để trống = chỉ mật khẩu');
});

test('2FA: có ADMIN_TOTP → cần mật khẩu + mã đúng; mã sai / thiếu / dùng lại đều bị từ chối và ghi nhật ký', async () => {
  const secret = newTotpSecret();
  const ctx = createTestCtx({ env: { ADMIN_TOTP: secret } });
  seed(ctx);
  const srv = await startTestServer(ctx);
  try {
    const page = await srv.client().get('/admin/login');
    assert.match(page.text, /name="totp"[^>]*autocomplete="one-time-code"/);
    const pw = ctx.config.adminPassword;
    const a = srv.client();
    await a.postForm('/admin/login', { password: pw });
    assert.equal(await loggedIn(a), false, 'thiếu mã');
    await a.postForm('/admin/login', { password: pw, totp: '000000' === totpNow(secret, ctx.now()).code ? '111111' : '000000' });
    assert.equal(await loggedIn(a), false, 'sai mã');
    await a.postForm('/admin/login', { password: 'sai-mat-khau', totp: totpNow(secret, ctx.now()).code });
    assert.equal(await loggedIn(a), false, 'đúng mã nhưng sai mật khẩu');
    const code = totpNow(secret, ctx.now()).code;
    await a.postForm('/admin/login', { password: pw, totp: code.slice(0, 3) + ' ' + code.slice(3) });
    assert.equal(await loggedIn(a), true, 'đúng cả hai (mã có dấu cách vẫn nhận)');
    const b = srv.client();
    await b.postForm('/admin/login', { password: pw, totp: code });
    assert.equal(await loggedIn(b), false, 'mã vừa dùng không dùng lại được');
    ctx.clock.advance(31_000);
    await b.postForm('/admin/login', { password: pw, totp: totpNow(secret, ctx.now()).code });
    assert.equal(await loggedIn(b), true, 'mã của khung mới thì được');
    assert.ok(ctx.db.prepare("SELECT COUNT(*) AS n FROM events WHERE type = 'admin_login_failed'").get().n >= 3);
  } finally { await srv.close(); }
});

test('2FA: không có ADMIN_TOTP → đăng nhập chỉ bằng mật khẩu như cũ', async () => {
  const ctx = createTestCtx();
  seed(ctx);
  const srv = await startTestServer(ctx);
  try {
    assert.doesNotMatch((await srv.client().get('/admin/login')).text, /name="totp"/);
    const a = srv.client();
    await a.postForm('/admin/login', { password: ctx.config.adminPassword });
    assert.equal(await loggedIn(a), true);
  } finally { await srv.close(); }
});
