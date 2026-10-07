import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestCtx, seed, makeCustomer, makeDevice, makeSession, makeTap, byId } from './helpers.js';
import { startClaim, expireDueSlots, completeTask } from '../src/domain/claims.js';
import { requestCode, codeStatus, expireWindows, escalatePendingOrphans } from '../src/domain/codes.js';
import { ingestMail, normalizeInbound, classifyMail, extractCode } from '../src/domain/mail.js';
import { get } from '../src/db/index.js';
import { SEC, MIN, HOUR } from '../src/lib/time.js';

const OPENAI = 'noreply@tm.openai.com';
let seq = 0;
const codeMail = (to, code, extra = {}) => ({ message_id: `m${++seq}`, to, from: `OpenAI <${OPENAI}>`, subject: `Your ChatGPT code is ${code}`, text: `Enter this temporary verification code to continue: ${code}\nIf you didn't try to log in, you can safely ignore this email.`, ...extra });

/** Khách A có slot ChatGPT đang chạy (tài khoản gpt1). */
function setup() {
  const ctx = createTestCtx();
  const data = seed(ctx);
  const customer = makeCustomer(ctx);
  const deviceId = 'device-aaaaaaaaaaaaaaaa';
  makeDevice(ctx, deviceId, customer.id);
  const { session } = makeSession(ctx, { customerId: customer.id, deviceId });
  makeTap(ctx, { card: data.card, deviceId });
  const claim = startClaim(ctx, { session, customer, deviceId, ip: '1.2.3.4', toolId: data.tools.chatgpt.id });
  assert.equal(claim.status, 'active', JSON.stringify(claim));
  const slot = byId(ctx, 'slots', claim.slotId);
  const req = (extra = {}) => requestCode(ctx, {
    session: byId(ctx, 'sessions', session.id), customer: byId(ctx, 'customers', customer.id), deviceId, ip: '1.2.3.4', ...extra,
  });
  return { ctx, ...data, customer, deviceId, session, slot, email: byId(ctx, 'accounts', slot.account_id).login_email, req };
}

test('Lấy mã → thư về → chỉ đúng khách + đúng máy thấy mã', () => {
  const { ctx, req, email, customer, deviceId } = setup();
  const w = req();
  assert.equal(w.status, 'open');
  assert.equal(w.accountEmail, email);
  assert.equal(codeStatus(ctx, { windowId: w.windowId, customerId: customer.id, deviceId }).status, 'waiting');
  ctx.clock.advance(20 * SEC);
  const r = ingestMail(ctx, codeMail(email, '482913'));
  assert.equal(r.verdict, 'matched');
  assert.deepEqual(codeStatus(ctx, { windowId: w.windowId, customerId: customer.id, deviceId }).code, '482913');
  assert.equal(codeStatus(ctx, { windowId: w.windowId, customerId: customer.id, deviceId: 'may-khac-aaaaaaaaaaa' }).status, 'not_found');
  assert.equal(ingestMail(ctx, codeMail(email, '482913', { message_id: `m${seq}` })).duplicate, true);
  ctx.clock.advance(11 * MIN);
  expireWindows(ctx);
  assert.equal(codeStatus(ctx, { windowId: w.windowId, customerId: customer.id, deviceId }).status, 'expired', 'mã bị xoá sau 10 phút');
});

test('mã về khi không ai giữ, không ai lấy mã → mồ côi: báo đỏ + cộng điểm người giữ cũ', () => {
  const { ctx, slot, email, customer } = setup();
  ctx.db.prepare("UPDATE slots SET status = 'expired', ended_at = ? WHERE id = ?").run(ctx.now(), slot.id);
  ctx.clock.advance(HOUR);
  const r = ingestMail(ctx, codeMail(email, '111222'));
  assert.equal(r.verdict, 'orphan');
  assert.equal(ctx.alerts('code_orphan').length, 1);
  assert.equal(byId(ctx, 'customers', customer.id).risk, 15);
});

test('slot vừa hết hạn: mã mới về KHÔNG hiện cho khách cũ (dù lượt lấy mã cuối chưa quá giờ) → mồ côi', () => {
  const { ctx, req, slot, email, customer, deviceId } = setup();
  const w = req();
  ingestMail(ctx, codeMail(email, '482913'));
  ctx.clock.advance(MIN);
  ctx.db.prepare('UPDATE slots SET expires_at = ? WHERE id = ?').run(ctx.now() - 1, slot.id);
  expireDueSlots(ctx);
  assert.equal(byId(ctx, 'slots', slot.id).status, 'expired');
  assert.equal(codeStatus(ctx, { windowId: w.windowId, customerId: customer.id, deviceId }).status, 'expired', 'mã cũ cũng không còn hiện');
  ctx.clock.advance(30 * SEC);
  const r = ingestMail(ctx, codeMail(email, '313131', { date: new Date(ctx.now()).toISOString() }));
  assert.equal(r.verdict, 'orphan');
  assert.notEqual(codeStatus(ctx, { windowId: w.windowId, customerId: customer.id, deviceId }).code, '313131');
  assert.equal(ctx.alerts('code_orphan').length, 1);
});

test('khách bấm "Gửi mã" bên hãng trước rồi mới bấm "Lấy mã" → vẫn nhận được mã, không báo động', () => {
  const { ctx, req, email, customer, deviceId } = setup();
  const r = ingestMail(ctx, codeMail(email, '333444'));
  assert.equal(r.verdict, 'orphan_wait');
  ctx.clock.advance(30 * SEC);
  const w = req();
  assert.equal(codeStatus(ctx, { windowId: w.windowId, customerId: customer.id, deviceId }).code, '333444');
  ctx.clock.advance(2 * MIN);
  escalatePendingOrphans(ctx);
  assert.equal(ctx.alerts('code_orphan').length, 0);
});

test('tài khoản dùng chung: người 2 đăng nhập ngay sau khi người 1 vừa lấy mã → mã của người 2 KHÔNG bị gán cho người 1', () => {
  const { ctx, req, slot, email, customer, deviceId, card, tools } = setup();
  ctx.db.prepare('UPDATE accounts SET max_holders = 2 WHERE id = ?').run(slot.account_id);
  const w1 = req();
  assert.equal(ingestMail(ctx, codeMail(email, '111111')).verdict, 'matched');
  // Người 2 nhận slot trên cùng tài khoản rồi đăng nhập hãng ngay → hãng gửi mã mới về hộp thư chung.
  const b = makeCustomer(ctx, '84911111111');
  const bDev = 'device-bbbbbbbbbbbbbbbb';
  makeDevice(ctx, bDev, b.id);
  const { session: bs } = makeSession(ctx, { customerId: b.id, deviceId: bDev });
  makeTap(ctx, { card, deviceId: bDev });
  const bc = startClaim(ctx, { session: bs, customer: b, deviceId: bDev, ip: '1.2.3.5', toolId: tools.chatgpt.id });
  assert.equal(byId(ctx, 'slots', bc.slotId).account_id, slot.account_id, 'cùng tài khoản');
  ctx.clock.advance(20 * SEC);
  const m2 = ingestMail(ctx, codeMail(email, '222222', { date: new Date(ctx.now()).toISOString() }));
  assert.equal(m2.verdict, 'orphan_wait', 'không thay mã của người 1, không coi là mã về trễ của người 1');
  assert.equal(codeStatus(ctx, { windowId: w1.windowId, customerId: customer.id, deviceId }).code, '111111');
  ctx.clock.advance(10 * SEC);
  const w2 = requestCode(ctx, { session: byId(ctx, 'sessions', bs.id), customer: byId(ctx, 'customers', b.id), deviceId: bDev, ip: '1.2.3.5' });
  assert.equal(w2.status, 'open');
  assert.equal(codeStatus(ctx, { windowId: w2.windowId, customerId: b.id, deviceId: bDev }).code, '222222', 'người 2 bấm Lấy mã → nhận đúng mã của mình');
  // Người ngoài (có mật khẩu) đăng nhập lúc cả 2 lượt đã giao → không bị nuốt, chờ rồi thành mồ côi.
  ctx.clock.advance(20 * SEC);
  assert.equal(ingestMail(ctx, codeMail(email, '999999', { date: new Date(ctx.now()).toISOString() })).verdict, 'orphan_wait');
  ctx.clock.advance(2 * MIN);
  escalatePendingOrphans(ctx);
  assert.equal(ctx.alerts('code_orphan').length, 1);
});

test('mã chờ quá 90 giây không ai nhận → nâng thành mồ côi', () => {
  const { ctx, email } = setup();
  ingestMail(ctx, codeMail(email, '555666'));
  ctx.clock.advance(91 * SEC);
  escalatePendingOrphans(ctx);
  assert.equal(ctx.alerts('code_orphan').length, 1);
});

test('lấy thêm mã không cần duyệt: lần 2–4 mở ngay (đang ở quán, đúng máy); lần 5 bị chặn', () => {
  const { ctx, req, email } = setup();
  for (let i = 1; i <= 4; i++) {
    assert.equal(req().status, 'open', `lần ${i}`);
    ingestMail(ctx, codeMail(email, `10020${i}`));
    ctx.clock.advance(4 * MIN);
  }
  assert.equal(req().code, 'too_many_codes');
});

test('lượt lấy mã đang mở được trả lại (không mở lượt mới, không tính thêm)', () => {
  const { ctx, req, slot } = setup();
  const w = req();
  assert.equal(req().windowId, w.windowId);
  assert.equal(byId(ctx, 'slots', slot.id).code_requests, 1);
});

test('lấy mã phải đang ở quán: về nhà (hết lượt vào) → need_entry; chạm thẻ / quét QR lại → lấy được', () => {
  const { ctx, req, card, deviceId } = setup();
  ctx.clock.advance(31 * MIN);
  const r = req();
  assert.equal(r.status, 'need_entry');
  assert.match(r.message, /quét mã QR trên bàn/);
  makeTap(ctx, { card, deviceId });
  assert.equal(req().status, 'open');
});

test('máy khác máy đã gắn: ở nhà (đưa cho bạn) → need_entry; ở quán → từ chối + ghi cảnh báo', () => {
  const { ctx, req, card } = setup();
  assert.equal(req({ deviceId: 'may-khac-aaaaaaaaaaaa' }).status, 'need_entry');
  makeTap(ctx, { card, deviceId: 'may-khac-aaaaaaaaaaaa' });
  const r = req({ deviceId: 'may-khac-aaaaaaaaaaaa' });
  assert.equal(r.code, 'second_device');
  assert.equal(ctx.alerts('code_second_device').length, 1);
});

test('thư bảo mật → cách ly tài khoản, thu hồi slot (không tính lượt), tạo việc đổi mật khẩu', () => {
  const { ctx, email, slot } = setup();
  const r = ingestMail(ctx, { message_id: 'sec1', to: email, from: OPENAI, subject: 'Your password was changed', text: 'Your OpenAI password was changed.' });
  assert.equal(r.verdict, 'quarantined');
  assert.equal(byId(ctx, 'accounts', slot.account_id).status, 'quarantined');
  const s = byId(ctx, 'slots', slot.id);
  assert.equal(s.status, 'revoked');
  assert.equal(s.end_reason, 'account_quarantined');
  const task = get(ctx.db, "SELECT * FROM rotation_tasks WHERE account_id = ? AND kind = 'rotate' AND reason = 'quarantine'", slot.account_id);
  assert.ok(task);
  // Loại mật khẩu + 2FA (ChatGPT): bị cách ly thì không được "giữ mật khẩu cũ"; khoá 2FA mới dán kèm được.
  ctx.db.prepare("UPDATE tools SET login_type = 'password_totp' WHERE id = (SELECT tool_id FROM accounts WHERE id = ?)").run(slot.account_id);
  assert.equal(completeTask(ctx, task.id, { keepPassword: true }).ok, false);
  assert.equal(completeTask(ctx, task.id, { newPassword: 'Moi#1', newTotp: 'khong-hop-le' }).ok, false);
  assert.equal(completeTask(ctx, task.id, { newPassword: 'Moi#1', newTotp: 'JBSW Y3DP EHPK 3PXP' }).ok, true);
  assert.ok(byId(ctx, 'accounts', slot.account_id).totp_enc);
  assert.equal(byId(ctx, 'accounts', slot.account_id).status, 'ready');
});

test('thư đặt lại mật khẩu có mã → KHÔNG giao mã, chỉ báo động; không cách ly', () => {
  const { ctx, req, email, slot, customer, deviceId } = setup();
  const w = req();
  const r = ingestMail(ctx, { message_id: 'rs1', to: email, from: OPENAI, subject: 'Reset your password', text: 'Your password reset code is 987654' });
  assert.equal(r.kind, 'password_reset');
  assert.equal(codeStatus(ctx, { windowId: w.windowId, customerId: customer.id, deviceId }).status, 'waiting');
  assert.equal(byId(ctx, 'accounts', slot.account_id).status, 'ready');
});

test('thư lạ người nhận / người gửi giả → bỏ qua', () => {
  const { ctx, email } = setup();
  assert.equal(ingestMail(ctx, codeMail('ai-do@kho.test', '123123')).verdict, 'ignored');
  const fake = ingestMail(ctx, codeMail(email, '123123', { from: 'support@openai-security.top' }));
  assert.equal(fake.verdict, 'ignored');
});

test('normalizeInbound: nhiều kiểu payload', () => {
  const a = normalizeInbound({ recipient: 'Kho <GPT1+abc@Kho.Test>', sender: 'x@openai.com', Subject: ' Hi ', 'body-html': '<p>Code: <b>123456</b></p><style>p{}</style>', timestamp: 1759669200 });
  assert.deepEqual(a.to, ['gpt1+abc@kho.test']);
  assert.equal(a.subject, 'Hi');
  assert.match(a.text, /Code: 123456/);
  assert.equal(a.date, 1759669200000);
  const b = normalizeInbound({ envelope: { to: ['a@b.co', 'c@d.co'] }, text: 'x', headers: { 'message-id': '<abc@x>' } });
  assert.deepEqual(b.to, ['a@b.co', 'c@d.co']);
  assert.equal(b.dedupeKey, 'mid:<abc@x>');
});

test('classifyMail / extractCode: các mẫu thư thường gặp', () => {
  const t = { slug: 'chatgpt', sender_pattern: 'openai\\.com' };
  const c = (subject, text, extra = {}) => classifyMail(t, { from: OPENAI, subject, text, ...extra });
  assert.deepEqual(c('Your ChatGPT code is 123456', ''), { kind: 'login_code', code: '123456' });
  assert.deepEqual(c('Mã xác minh của bạn', 'Mã của bạn là 482913. Nếu không phải bạn, hãy đổi mật khẩu.'), { kind: 'login_code', code: '482913' });
  assert.deepEqual(c('Your new login code', 'Code: 246810'), { kind: 'login_code', code: '246810' });
  assert.equal(c('Set a new password', 'Click the link').kind, 'password_reset');
  assert.equal(c('Two-factor authentication enabled', '').kind, 'security_alert');
  assert.equal(c('New login to ChatGPT', 'We noticed a new login from Chrome on Mac.').kind, 'new_signin');
  assert.equal(c('Protect your account', 'Turn on two-factor authentication today! If you did not request this, change your password.').kind, 'other');
  assert.equal(c('Sign in to ChatGPT', 'Click here to sign in: https://chatgpt.com/magic/abc', { hasLink: true }).kind, 'magic_link');
  assert.equal(c('Your receipt from OpenAI', 'Invoice #123456').kind, 'billing');
  assert.equal(extractCode(t, { subject: 'Hello', text: 'Your code is 1234 and order 999999' }), '1234');
  assert.equal(extractCode(t, { subject: 'Code 111111', text: 'or 222222' }), '111111');
  assert.equal(extractCode(t, { subject: 'Hi', text: 'Visit https://x.com/123456 now' }), null);
});
