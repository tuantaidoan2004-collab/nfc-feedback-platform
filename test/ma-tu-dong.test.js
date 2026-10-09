// Chủ chốt 09/10/2026: mã đăng nhập (ChatGPT…) tự đưa cho khách — không chạm thẻ lại, không mã phiếu (codeNeedsTap = 0, mặc định).
// Chống spam chỉ bằng: đúng máy đã nhận slot + tối đa 2 mã / slot (1 email đăng nhập + 1 máy). Bật codeNeedsTap = 1 → như cũ.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestCtx, seed, makeCustomer, makeDevice, makeSession, makeTap, byId } from './helpers.js';
import { startClaim, currentSlotView } from '../src/domain/claims.js';
import { requestCode, expireWindows } from '../src/domain/codes.js';
import { ingestMail } from '../src/domain/mail.js';
import { mePage } from '../src/views/public.js';
import { SEC, MIN, HOUR } from '../src/lib/time.js';

let seq = 0;
const codeMail = (to, code) => ({ message_id: `mtd${++seq}`, to, from: 'OpenAI <noreply@tm.openai.com>', subject: `Your ChatGPT code is ${code}`,
  text: `Enter this temporary verification code to continue: ${code}` });

function setup(settings = {}) {
  const ctx = createTestCtx({ settings });
  const data = seed(ctx);
  // ChatGPT bật mã phiếu + 2 mã / slot như trên máy chủ thật.
  ctx.db.prepare("UPDATE tools SET code_max = 2, voucher_code = 1 WHERE slug = 'chatgpt'").run();
  const customer = makeCustomer(ctx);
  const deviceId = 'device-tudong-aaaaaaaaa';
  makeDevice(ctx, deviceId, customer.id);
  const { session } = makeSession(ctx, { customerId: customer.id, deviceId });
  makeTap(ctx, { card: data.card, deviceId });
  const claim = startClaim(ctx, { session, customer, deviceId, ip: '1.2.3.4', toolId: data.tools.chatgpt.id });
  assert.equal(claim.status, 'active', JSON.stringify(claim));
  const slotId = claim.slotId;
  const email = byId(ctx, 'accounts', byId(ctx, 'slots', slotId).account_id).login_email;
  const req = (dev = deviceId) => requestCode(ctx, { customer: byId(ctx, 'customers', customer.id), deviceId: dev, ip: '1.2.3.4' });
  return { ctx, customer, deviceId, email, req, slot: () => byId(ctx, 'slots', slotId) };
}

test('mặc định: về nhà (hết lượt chạm), không phiếu → vẫn lấy được mã; trang không hiện ô phiếu', () => {
  const { ctx, customer, deviceId, req } = setup();
  ctx.clock.advance(3 * HOUR); // lượt chạm thẻ + phiếu tự động đã hết hạn
  const view = currentSlotView(ctx, customer.id, deviceId);
  assert.equal(view.needVoucher, false);
  assert.equal(view.needTap, false);
  const page = String(mePage(ctx, { customer: byId(ctx, 'customers', customer.id), view }));
  assert.ok(page.includes('data-act="request-code"'), 'có nút Lấy mã');
  assert.ok(!page.includes('data-voucher'), 'không có ô mã phiếu');
  assert.ok(!/chạm (lại )?thẻ/i.test(page.slice(page.indexOf('id="code-box"'), page.indexOf('data-code-hint') + 200)), 'không bảo chạm thẻ');
  assert.match(page, /Còn 2 lần lấy mã · trên máy này/);
  assert.ok(page.includes('data-guide'), 'món đăng nhập bằng mã email có khung 3 bước');
  const r = req();
  assert.equal(r.status, 'open', JSON.stringify(r));
});

test('mặc định: tối đa 2 mã / slot, máy khác bị từ chối', () => {
  const { ctx, email, req, slot } = setup();
  assert.equal(req('device-khac-bbbbbbbbbbb').code, 'second_device');
  for (const code of ['111111', '222222']) {
    assert.equal(req().status, 'open');
    ctx.clock.advance(10 * SEC);
    assert.equal(ingestMail(ctx, codeMail(email, code)).verdict, 'matched');
    ctx.clock.advance(5 * MIN);
    expireWindows(ctx);
  }
  assert.equal(slot().code_used, 2);
  assert.equal(req().code, 'too_many_codes');
});

test('codeNeedsTap = 1: quay lại như cũ (cần phiếu / chạm thẻ)', () => {
  const { ctx, req } = setup({ codeNeedsTap: 1, autoVoucherPerDay: 0 });
  ctx.clock.advance(3 * HOUR);
  assert.equal(req().status, 'need_voucher');
});
