// Trang Quản trị › Thư: ô "Gửi mã cho khách" chỉ với thư mã đăng nhập (trước hiện cả với thư đặt lại mật khẩu → đưa nhầm mã = mất tài khoản);
// thư đã giao mã ghi rõ giao cho khách nào; lọc "Cần xem".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestCtx, seed, makeCustomer, makeDevice, makeSession, makeTap, byId, startTestServer } from './helpers.js';
import { startClaim } from '../src/domain/claims.js';
import { requestCode, deliverManualCode } from '../src/domain/codes.js';
import { ingestMail } from '../src/domain/mail.js';
import { get } from '../src/db/index.js';
import { SEC } from '../src/lib/time.js';

const OPENAI = 'OpenAI <noreply@tm.openai.com>';

test('Thư: không gửi mã của thư đặt lại mật khẩu cho khách; ghi khách đã nhận mã; lọc Cần xem', async () => {
  const ctx = createTestCtx();
  const data = seed(ctx);
  const customer = makeCustomer(ctx, 'khach.thu@example.test');
  const deviceId = 'device-thu-aaaaaaaaaaaa';
  makeDevice(ctx, deviceId, customer.id);
  const { session } = makeSession(ctx, { customerId: customer.id, deviceId });
  makeTap(ctx, { card: data.card, deviceId });
  const claim = startClaim(ctx, { session, customer, deviceId, ip: '1.2.3.4', toolId: data.tools.chatgpt.id });
  assert.equal(claim.status, 'active', JSON.stringify(claim));
  const slot = byId(ctx, 'slots', claim.slotId);
  const email = byId(ctx, 'accounts', slot.account_id).login_email;
  const w = requestCode(ctx, { session: byId(ctx, 'sessions', session.id), customer: byId(ctx, 'customers', customer.id), deviceId, ip: '1.2.3.4' });
  assert.equal(w.status, 'open');

  // Thư đặt lại mật khẩu về đúng lúc khách đang chờ mã.
  ctx.clock.advance(10 * SEC);
  const reset = ingestMail(ctx, { message_id: 'r1', to: email, from: OPENAI, subject: 'Password reset request', text: 'Use code 774411 to reset your password.' });
  assert.equal(reset.kind, 'password_reset');
  // Backend chặn dù có ai gửi form tay.
  const bad = deliverManualCode(ctx, { mailId: reset.mailId, code: '774411' });
  assert.equal(bad.ok, false);
  assert.match(bad.message, /không phải thư mã đăng nhập/);
  assert.equal(get(ctx.db, 'SELECT status FROM code_windows WHERE id = ?', w.windowId).status, 'open', 'khách không nhận mã đặt lại mật khẩu');

  const srv = await startTestServer(ctx);
  try {
    const admin = srv.client();
    await admin.postForm('/admin/login', { password: ctx.config.adminPassword });
    let page = await admin.get(`/admin/mails/${reset.mailId}`);
    assert.doesNotMatch(page.text, /Gửi mã cho khách/, 'thư đặt lại mật khẩu không có ô gửi mã');

    // Thư mã đăng nhập thật → tự giao; trang thư ghi đã giao cho khách nào.
    ctx.clock.advance(10 * SEC);
    const code = ingestMail(ctx, { message_id: 'c1', to: email, from: OPENAI, subject: 'Your ChatGPT code is 482913', text: 'Enter this temporary verification code to continue: 482913' });
    assert.equal(code.verdict, 'matched');
    page = await admin.get(`/admin/mails/${code.mailId}`);
    assert.match(page.text, new RegExp(`Mã đã giao cho khách <a href="/admin/customers/${customer.id}">kh\\*\\*\\*@example\\.test</a> · slot <a href="/admin/slots\\?id=${slot.id}">`));
    assert.match(page.text, /Gửi mã cho khách/, 'thư mã đăng nhập vẫn gửi tay được khi khách còn chờ');

    // Lọc "Cần xem": có thư đặt lại mật khẩu (đã báo chủ), không có thư đã giao mã.
    page = await admin.get('/admin/mails');
    assert.match(page.text, /href="\/admin\/mails\?v=can-xem"/);
    page = await admin.get('/admin/mails?v=can-xem');
    assert.match(page.text, /Password reset request/);
    assert.doesNotMatch(page.text, /Your ChatGPT code is 482913/);
  } finally {
    await srv.close();
  }
});
