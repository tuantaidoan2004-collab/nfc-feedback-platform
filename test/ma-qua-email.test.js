// Đăng nhập bằng email (OTP_PROVIDER=email): khách nhập email, Tiệm gửi mã 6 số vào hộp thư qua Cloudflare Email Sending.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createTestCtx, seed } from './helpers.js';
import { loadConfig, validateConfig } from '../src/config.js';
import { createOtpSender, otpChannel } from '../src/services/otp.js';
import { issueOtp, verifyOtp, eraseCustomer } from '../src/domain/auth.js';
import { maskPhone, normalizeEmail } from '../src/lib/phone.js';

const PROD = {
  NODE_ENV: 'production', BASE_URL: 'https://thu.tiembanquyen.site/colap', CLIENT_IP_HEADER: 'cf-connecting-ip',
  QS_TICKET_KEY: 'k'.repeat(64), APP_SECRET: 's'.repeat(32), DATA_KEY: Buffer.alloc(32, 1).toString('base64'),
  ADMIN_PASSWORD: 'abcd-efgh-ijkm-npqr', MAIL_WEBHOOK_SECRET: 'm'.repeat(32),
};
const DEV = 'device-aaaaaaaaaaaaaaaa';

test('cấu hình: OTP_PROVIDER=email hợp lệ ở production khi đủ CF_ACCOUNT_ID / CF_EMAIL_TOKEN / MAIL_FROM', () => {
  const ok = { ...PROD, OTP_PROVIDER: 'email', CF_ACCOUNT_ID: 'acc123', CF_EMAIL_TOKEN: 'tok', MAIL_FROM: 'xacnhan@tiembanquyen.site' };
  assert.deepEqual(validateConfig(loadConfig(ok)), []);
  assert.equal(loadConfig(ok).otp.loginBy, 'email');
  assert.equal(otpChannel(loadConfig(ok)), 'email');
  assert.ok(validateConfig(loadConfig({ ...ok, CF_EMAIL_TOKEN: '' })).some((e) => /CF_EMAIL_TOKEN/.test(e)));
  assert.ok(validateConfig(loadConfig({ ...ok, MAIL_FROM: '' })).some((e) => /MAIL_FROM/.test(e)));
  assert.ok(validateConfig(loadConfig({ ...ok, LOGIN_BY: 'phone' })).some((e) => /LOGIN_BY/.test(e)));
  // Mặc định cũ không đổi: không đặt gì → đăng nhập bằng SĐT.
  assert.equal(loadConfig({ NODE_ENV: 'test' }).otp.loginBy, 'phone');
});

test('email: chuẩn hoá chữ thường, che bớt khi hiện', () => {
  assert.equal(normalizeEmail('  Ban.Hoc@Gmail.COM '), 'ban.hoc@gmail.com');
  assert.equal(normalizeEmail('khong-phai-email'), null);
  assert.equal(normalizeEmail('a@b'), null);
  assert.equal(maskPhone('banhoc@gmail.com'), 'ba***@gmail.com');
});

test('đăng nhập bằng email: gửi mã, sai email bị từ chối, nhập mã đúng → tạo khách theo email', async () => {
  const ctx = createTestCtx({ env: { LOGIN_BY: 'email' } });
  seed(ctx);
  const bad = await issueOtp(ctx, { phone: '0912345678', deviceId: DEV, ip: '1.2.3.4' });
  assert.equal(bad.code, 'invalid_phone');
  assert.match(bad.message, /Email/);
  const r = await issueOtp(ctx, { phone: 'Khach.Moi@Gmail.com', deviceId: DEV, ip: '1.2.3.4' });
  assert.equal(r.ok, true);
  assert.equal(ctx.otpSent.at(-1).phone, 'khach.moi@gmail.com');
  const v = verifyOtp(ctx, { phone: 'khach.moi@gmail.com', code: ctx.otpSent.at(-1).code, deviceId: DEV, ip: '1.2.3.4', consent: true });
  assert.equal(v.ok, true);
  assert.equal(v.customer.phone, 'khach.moi@gmail.com');
  // Gõ hoa / thường khác nhau vẫn là 1 khách.
  await issueOtp(ctx, { phone: 'KHACH.MOI@gmail.com', deviceId: DEV, ip: '1.2.3.4' });
  const v2 = verifyOtp(ctx, { phone: 'KHACH.MOI@gmail.com', code: ctx.otpSent.at(-1).code, deviceId: DEV, ip: '1.2.3.4' });
  assert.equal(v2.customer.id, v.customer.id);
  // Xoá dữ liệu: email thay bằng dấu vết, đăng ký lại vẫn nối về khách cũ.
  assert.equal(eraseCustomer(ctx, v.customer.id).ok, true);
  await issueOtp(ctx, { phone: 'khach.moi@gmail.com', deviceId: DEV, ip: '1.2.3.4' });
  const v3 = verifyOtp(ctx, { phone: 'khach.moi@gmail.com', code: ctx.otpSent.at(-1).code, deviceId: DEV, ip: '1.2.3.4', consent: true });
  assert.equal(v3.customer.id, v.customer.id);
});

test('kênh email: gọi đúng API Cloudflare (Bearer, from, to, mã trong tiêu đề); lỗi / bounce → ok:false', async () => {
  const calls = [];
  let reply = { success: true, errors: [], result: { delivered: ['khach@gmail.com'], permanent_bounces: [], queued: [] } };
  const srv = createServer((req, res) => {
    let b = '';
    req.on('data', (c) => { b += c; });
    req.on('end', () => {
      calls.push({ url: req.url, auth: req.headers.authorization, body: JSON.parse(b) });
      res.writeHead(reply.success ? 200 : 400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(reply));
    });
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  try {
    const ctx = createTestCtx({ env: {
      OTP_PROVIDER: 'email', CF_ACCOUNT_ID: 'acc123', CF_EMAIL_TOKEN: 'tok-xyz', MAIL_FROM: 'xacnhan@tiembanquyen.site',
      CF_EMAIL_URL: `http://127.0.0.1:${srv.address().port}/send`,
    } });
    const sender = createOtpSender(ctx);
    assert.equal(sender.name, 'email');
    assert.deepEqual(await sender.send('khach@gmail.com', '123456'), { ok: true });
    const c = calls[0];
    assert.equal(c.auth, 'Bearer tok-xyz');
    assert.equal(c.body.to, 'khach@gmail.com');
    assert.equal(c.body.from.address, 'xacnhan@tiembanquyen.site');
    assert.match(c.body.subject, /123456/);
    assert.match(c.body.text, /123456/);
    assert.match(c.body.html, /123456/);

    reply = { success: true, errors: [], result: { delivered: [], permanent_bounces: ['khach@gmail.com'], queued: [] } };
    assert.equal((await sender.send('khach@gmail.com', '111111')).ok, false);
    reply = { success: false, errors: [{ code: 10004, message: 'email.sending.error.throttled' }], result: null };
    const r = await sender.send('khach@gmail.com', '222222');
    assert.equal(r.ok, false);
    assert.match(r.error, /10004/);
  } finally {
    srv.close();
  }
});

test('mặc định Cloudflare URL theo CF_ACCOUNT_ID', () => {
  const ctx = createTestCtx({ env: { OTP_PROVIDER: 'email', CF_ACCOUNT_ID: 'acc123', CF_EMAIL_TOKEN: 't', MAIL_FROM: 'a@b.site' } });
  const orig = globalThis.fetch;
  let url;
  globalThis.fetch = async (u) => { url = u; return new Response(JSON.stringify({ success: true, result: { permanent_bounces: [] } })); };
  return createOtpSender(ctx).send('x@y.com', '000000').then((r) => {
    globalThis.fetch = orig;
    assert.equal(r.ok, true);
    assert.equal(url, 'https://api.cloudflare.com/client/v4/accounts/acc123/email/sending/send');
  });
});
