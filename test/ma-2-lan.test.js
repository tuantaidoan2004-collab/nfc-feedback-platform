// Chủ chốt 09/10/2026: ChatGPT mỗi máy (mỗi slot) chỉ lấy 2 mã = 2 lần đăng nhập. Lượt tính theo mã ĐÃ VỀ tới khách,
// không theo lần bấm "Lấy mã"; số lần mở lượt có trần riêng để không ai giữ khoá tài khoản dùng chung mãi.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestCtx, seed, makeCustomer, makeDevice, makeSession, makeTap, byId, startTestServer } from './helpers.js';
import { startClaim } from '../src/domain/claims.js';
import { requestCode, expireWindows, deliverManualCode } from '../src/domain/codes.js';
import { ingestMail } from '../src/domain/mail.js';
import { get } from '../src/db/index.js';
import { SEC, MIN } from '../src/lib/time.js';

let seq = 0;
const codeMail = (to, code) => ({ message_id: `m2l${++seq}`, to, from: 'OpenAI <noreply@tm.openai.com>', subject: `Your ChatGPT code is ${code}`,
  text: `Enter this temporary verification code to continue: ${code}` });

function setup({ codeMax = 2 } = {}) {
  const ctx = createTestCtx();
  const data = seed(ctx);
  ctx.db.prepare("UPDATE tools SET code_max = ? WHERE slug = 'chatgpt'").run(codeMax);
  const customer = makeCustomer(ctx);
  const deviceId = 'device-2lan-aaaaaaaaaaa';
  makeDevice(ctx, deviceId, customer.id);
  const { session } = makeSession(ctx, { customerId: customer.id, deviceId });
  makeTap(ctx, { card: data.card, deviceId });
  const claim = startClaim(ctx, { session, customer, deviceId, ip: '1.2.3.4', toolId: data.tools.chatgpt.id });
  assert.equal(claim.status, 'active', JSON.stringify(claim));
  const slotId = claim.slotId;
  const email = byId(ctx, 'accounts', byId(ctx, 'slots', slotId).account_id).login_email;
  const req = (dev = deviceId) => requestCode(ctx, { customer: byId(ctx, 'customers', customer.id), deviceId: dev, ip: '1.2.3.4' });
  const slot = () => byId(ctx, 'slots', slotId);
  // Hết lượt 3 phút (+60 giây trễ) mà không có mã
  const lapse = () => { ctx.clock.advance(5 * MIN); expireWindows(ctx); };
  return { ctx, ...data, email, req, slot, lapse, deviceId };
}

test('ChatGPT 2 mã / máy: mã thứ 3 bị từ chối, báo rõ số mã', () => {
  const { ctx, email, req, slot, lapse } = setup();
  for (const code of ['111111', '222222']) {
    assert.equal(req().status, 'open');
    ctx.clock.advance(10 * SEC);
    assert.equal(ingestMail(ctx, codeMail(email, code)).verdict, 'matched');
    lapse();
  }
  assert.equal(slot().code_used, 2);
  const third = req();
  assert.equal(third.status, 'rejected');
  assert.equal(third.code, 'too_many_codes');
  assert.match(third.message, /đủ 2 mã/);
});

test('bấm "Lấy mã" mà mã không về (chưa bấm gửi bên ChatGPT / thư lạc) → KHÔNG mất lượt', () => {
  const { ctx, email, req, slot, lapse } = setup();
  assert.equal(req().status, 'open');
  lapse();
  assert.equal(req().status, 'open');
  lapse();
  assert.equal(slot().code_used, 0, 'chưa có mã nào về → chưa tính lượt');
  assert.equal(slot().code_requests, 2);
  assert.equal(req().status, 'open', 'vẫn lấy được mã');
  ctx.clock.advance(10 * SEC);
  ingestMail(ctx, codeMail(email, '333333'));
  assert.equal(slot().code_used, 1);
});

test('bấm mở lượt liên tục để giữ khoá tài khoản → trần số lần mở (2 mã + 3)', () => {
  const { req, lapse } = setup();
  for (let i = 0; i < 5; i++) { assert.equal(req().status, 'open', `lần mở ${i + 1}`); lapse(); }
  const r = req();
  assert.equal(r.status, 'rejected');
  assert.equal(r.code, 'too_many_opens');
});

test('"Gửi lại mã" trong cùng lượt (một mình trên tài khoản) → mã mới thay mã cũ, không tính thêm lượt', () => {
  const { ctx, email, req, slot } = setup();
  assert.equal(req().status, 'open');
  ctx.clock.advance(10 * SEC);
  ingestMail(ctx, codeMail(email, '444444'));
  ctx.clock.advance(30 * SEC);
  ingestMail(ctx, codeMail(email, '555555'));
  assert.equal(get(ctx.db, 'SELECT code FROM code_windows WHERE slot_id = ?', slot().id).code, '555555', 'khách thấy mã mới');
  assert.equal(slot().code_used, 1);
});

test('chủ gửi mã tay cho lượt đang chờ → tính 1 lượt; gửi lại cho lượt đã có mã → không tính thêm', () => {
  const { ctx, email, req, slot } = setup();
  assert.equal(req().status, 'open');
  const acc = get(ctx.db, 'SELECT id FROM accounts WHERE login_email = ?', email);
  const mail = (id) => ctx.db.prepare("INSERT INTO mails(dedupe_key, account_id, kind, received_at, verdict) VALUES(?, ?, 'other', ?, 'ignored')")
    .run(`tay-${id}`, acc.id, ctx.now()).lastInsertRowid;
  assert.equal(deliverManualCode(ctx, { mailId: mail(1), code: '666666' }).ok, true);
  assert.equal(slot().code_used, 1);
  assert.equal(deliverManualCode(ctx, { mailId: mail(2), code: '777777' }).ok, true);
  assert.equal(slot().code_used, 1);
});

test('món không đặt riêng (code_max trống) → theo Cài đặt codeMaxRequests', () => {
  const { ctx, email, req, lapse } = setup({ codeMax: null });
  const max = ctx.settings().codeMaxRequests;
  for (let i = 0; i < max; i++) {
    assert.equal(req().status, 'open');
    ctx.clock.advance(10 * SEC);
    ingestMail(ctx, codeMail(email, String(100000 + i)));
    lapse();
  }
  assert.equal(req().code, 'too_many_codes');
});

test('máy khác lấy mã của slot → từ chối, không tính lượt', () => {
  const { ctx, card, req, slot } = setup();
  const other = 'may-khac-bbbbbbbbbbbbbb';
  makeTap(ctx, { card, deviceId: other });  // máy kia cũng đang ở quán — vẫn không được
  const r = req(other);
  assert.equal(r.code, 'second_device');
  assert.equal(slot().code_used, 0);
  assert.equal(slot().code_requests, 0);
});

test('Quản trị › Công cụ: ô "Số mã tối đa / máy" — lưu 2, để trống = theo Cài đặt, quá 20 thì giữ 20', async () => {
  const ctx = createTestCtx();
  const { tools } = seed(ctx);
  const srv = await startTestServer(ctx);
  try {
    const admin = srv.client();
    await admin.postForm('/admin/login', { password: ctx.config.adminPassword });
    const page = await admin.get(`/admin/tools/${tools.chatgpt.id}`);
    assert.match(page.text, /Số mã tối đa \/ máy/);
    assert.match(page.text, /name="code_max"/);
    const csrf = page.text.match(/name="_csrf" value="([^"]+)"/)[1];
    const base = { _csrf: csrf, name: 'ChatGPT Plus', login_type: 'email_code', enabled: '1', slot_hours: '24', cooldown_days: '30', lifetime_cap: '2', holders_default: '8' };
    const max = () => get(ctx.db, 'SELECT code_max FROM tools WHERE id = ?', tools.chatgpt.id).code_max;
    assert.equal((await admin.postForm(`/admin/tools/${tools.chatgpt.id}`, { ...base, code_max: '2' })).status, 303);
    assert.equal(max(), 2);
    assert.match((await admin.get(`/admin/tools/${tools.chatgpt.id}`)).text, /name="code_max"[^>]*value="2"/);
    await admin.postForm(`/admin/tools/${tools.chatgpt.id}`, { ...base, code_max: '' });
    assert.equal(max(), null);
    await admin.postForm(`/admin/tools/${tools.chatgpt.id}`, { ...base, code_max: '50' });
    assert.equal(max(), 20);
  } finally { await srv.close(); }
});
