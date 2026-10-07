// OTP_PROVIDER=none: máy chủ production chạy được khi chưa có eSMS (chủ nhập kho trước), khách được báo nhắn Zalo, không tốn lượt giới hạn.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestCtx, seed } from './helpers.js';
import { loadConfig, validateConfig } from '../src/config.js';
import { createOtpSender } from '../src/services/otp.js';
import { issueOtp } from '../src/domain/auth.js';

test('OTP_PROVIDER=none: production hợp lệ khi chưa có eSMS; dev vẫn bị cấm', () => {
  const env = {
    NODE_ENV: 'production', BASE_URL: 'https://thu.tiembanquyen.site/colap', CLIENT_IP_HEADER: 'cf-connecting-ip',
    QS_TICKET_KEY: 'k'.repeat(64), APP_SECRET: 's'.repeat(32), DATA_KEY: Buffer.alloc(32, 1).toString('base64'),
    ADMIN_PASSWORD: 'abcd-efgh-ijkm-npqr', MAIL_WEBHOOK_SECRET: 'm'.repeat(32),
  };
  assert.deepEqual(validateConfig(loadConfig({ ...env, OTP_PROVIDER: 'none' })), []);
  assert.ok(validateConfig(loadConfig({ ...env, OTP_PROVIDER: 'esms' })).some((e) => /ESMS_API_KEY/.test(e)));
  assert.ok(validateConfig(loadConfig({ ...env, OTP_PROVIDER: 'dev' })).some((e) => /OTP_PROVIDER/.test(e)));
});

test('OTP_PROVIDER=none: khách xin mã → "chưa mở nhận khách", không tạo mã', async () => {
  const ctx = createTestCtx();
  seed(ctx);
  ctx.config.otp.provider = 'none';
  ctx.otp = createOtpSender(ctx);
  const r = await issueOtp(ctx, { phone: '0912345678', deviceId: 'device-aaaaaaaaaaaaaaaa', ip: '1.2.3.4' });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'not_open');
  assert.match(r.message, /Zalo/);
  const n = ctx.db.prepare('SELECT COUNT(*) AS n FROM otps').get().n;
  assert.equal(n, 0);
});
