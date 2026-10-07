// IP khách dùng cho giới hạn chống spam (OTP / IP / giờ) → khách không được tự khai (cùng cách Quite Sensational làm).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestCtx, seed, startTestServer } from './helpers.js';
import { clientIp } from '../src/lib/http.js';

const req = (headers, remote = '10.0.0.9') => ({ headers, socket: { remoteAddress: remote } });

test('clientIp: chỉ tin đúng header proxy ghi đè; TRUST_PROXY cũ lấy địa chỉ cuối X-Forwarded-For', () => {
  const forged = { 'cf-connecting-ip': '1.2.3.4', 'x-real-ip': '1.2.3.4', 'x-forwarded-for': '1.2.3.4, 113.22.5.6' };
  assert.equal(clientIp(req(forged), { header: '', trustProxy: false }), '10.0.0.9', 'không cấu hình proxy → địa chỉ kết nối');
  assert.equal(clientIp(req(forged), { header: '', trustProxy: true }), '113.22.5.6', 'phần đầu X-Forwarded-For do khách tự ghi');
  assert.equal(clientIp(req({ ...forged, 'x-real-ip': '113.22.5.6' }), { header: 'x-real-ip' }), '113.22.5.6');
  assert.equal(clientIp(req({ 'cf-connecting-ip': '1.2.3.4' }), { header: 'x-real-ip' }), '', 'thiếu header proxy → không biết IP, không lấy IP của proxy');
  assert.equal(clientIp(req({}), { trustProxy: true }), '', 'TRUST_PROXY mà thiếu X-Forwarded-For → không biết IP');
  assert.equal(clientIp(req({ 'x-real-ip': '::ffff:113.22.5.6' }), { header: 'x-real-ip' }), '113.22.5.6');
  assert.equal(clientIp(req(forged), true), '113.22.5.6', 'gọi kiểu cũ clientIp(req, true) vẫn an toàn');
});

test('khách tự ghi "CF-Connecting-IP" / "X-Real-IP" khác nhau cũng không lách được giới hạn OTP theo IP', async () => {
  const ctx = createTestCtx({ env: { TRUST_PROXY: '1' }, settings: { otpPerIpPerHour: 2 } });
  seed(ctx);
  const srv = await startTestServer(ctx);
  try {
    // Đây là thứ app nhận được sau proxy: proxy thật đặt IP thật (113.22.5.6) ở CUỐI X-Forwarded-For;
    // mọi thứ còn lại (CF-Connecting-IP, X-Real-IP, phần đầu X-Forwarded-For) là khách tự ghi.
    const send = (i) => srv.client().post('/api/otp/send', { phone: `091234567${i}` },
      { 'cf-connecting-ip': `1.2.3.${i}`, 'x-real-ip': `1.2.3.${i}`, 'x-forwarded-for': `1.2.3.${i}, 113.22.5.6` });
    assert.equal((await send(1)).json.ok, true);
    assert.equal((await send(2)).json.ok, true);
    assert.equal((await send(3)).json.code, 'rate_limited');
  } finally {
    await srv.close();
  }
});

test('production: thiếu cấu hình IP sau proxy hoặc khoá vé QS thì không cho chạy; header lạ cũng không', async () => {
  const { loadConfig, validateConfig } = await import('../src/config.js');
  const base = { NODE_ENV: 'production', BASE_URL: 'https://thu.tiembanquyen.com', APP_SECRET: 'x'.repeat(32), DATA_KEY: Buffer.alloc(32, 1).toString('base64'),
    ADMIN_PASSWORD: 'mat-khau-dai-du-12', MAIL_WEBHOOK_SECRET: 'y'.repeat(32), OTP_PROVIDER: 'esms', ESMS_API_KEY: 'k', ESMS_SECRET_KEY: 's', ESMS_BRANDNAME: 'TBQ', QS_TICKET_KEY: 'k'.repeat(64) };
  assert.ok(validateConfig(loadConfig(base)).some((e) => /CLIENT_IP_HEADER/.test(e)));
  assert.ok(validateConfig(loadConfig({ ...base, CLIENT_IP_HEADER: 'x-real-ip', QS_TICKET_KEY: '' })).some((e) => /QS_TICKET_KEY/.test(e)), 'thiếu khoá vé thì không chạy');
  assert.deepEqual(validateConfig(loadConfig({ ...base, CLIENT_IP_HEADER: 'X-Real-IP' })), []);
  assert.ok(validateConfig(loadConfig({ ...base, CLIENT_IP_HEADER: 'x real ip' })).some((e) => /tên 1 header/.test(e)));
});

test('/healthz cho công cụ giám sát: trả ok, không tạo mã máy hay ghi gì', async () => {
  const ctx = createTestCtx();
  seed(ctx);
  const srv = await startTestServer(ctx);
  try {
    const count = () => ctx.db.prepare('SELECT (SELECT COUNT(*) FROM devices) + (SELECT COUNT(*) FROM events) AS n').get().n;
    const before = count();
    for (let i = 0; i < 3; i++) {
      const r = await fetch(`${srv.url}/healthz`);
      assert.equal(r.status, 200);
      assert.equal(await r.text(), 'ok');
      assert.equal(r.headers.get('set-cookie'), null);
    }
    assert.equal(count(), before);
  } finally {
    await srv.close();
  }
});
