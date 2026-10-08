// Chủ tiệm đang thử (OWNER_IDS, chủ chọn 08/10/2026): luôn nhận được tài khoản mới. Khách thường giữ nguyên mọi hạn mức.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestCtx, seed, makeCustomer, makeDevice, makeTap, byId } from './helpers.js';
import { startClaim, currentSlotView } from '../src/domain/claims.js';
import { lockCustomer } from '../src/domain/risk.js';
import { toolAvailability } from '../src/domain/quota.js';
import { run } from '../src/db/index.js';
import { encrypt } from '../src/lib/crypto.js';
import { cardPage } from '../src/views/public.js';

const OWNER = 'chu.thu@vi-du.vn';

function setup(phone) {
  const ctx = createTestCtx({ env: { OWNER_IDS: ` ${OWNER.toUpperCase()} , khac@x.vn` } });
  const data = seed(ctx);
  // Thêm vài tài khoản CapCut để thử nhận nhiều lần.
  for (let i = 2; i <= 4; i++) {
    run(ctx.db, "INSERT INTO accounts(tool_id, login_email, password_enc, max_holders, status, created_at) VALUES(?, ?, ?, 1, 'ready', ?)",
      data.tools.capcut.id, `capcut${i}@kho.test`, encrypt('Secret#123', ctx.config.dataKey), ctx.now());
  }
  const customer = makeCustomer(ctx, phone);
  const deviceId = 'device-chu-aaaaaaaaaaaa';
  makeDevice(ctx, deviceId, customer.id);
  makeTap(ctx, { card: data.card, deviceId });
  const claim = (toolId = data.tools.capcut.id) => startClaim(ctx, { customer: byId(ctx, 'customers', customer.id), deviceId, ip: '1.2.3.4', toolId });
  return { ctx, ...data, customer, deviceId, claim };
}

test('chủ: nhận liên tiếp nhiều lần cùng công cụ, mỗi lần 1 tài khoản mới; trang "vé" hiện cái mới nhất', () => {
  const { ctx, claim, customer, deviceId } = setup(OWNER);
  const got = [];
  for (let i = 0; i < 4; i++) {
    const r = claim();
    assert.equal(r.status, 'active', `lần ${i + 1}: ${r.code}`);
    got.push(byId(ctx, 'slots', r.slotId).account_id);
  }
  assert.equal(new Set(got).size, 4);
  const last = byId(ctx, 'accounts', got.at(-1)).login_email;
  assert.equal(currentSlotView(ctx, customer.id, deviceId).accountEmail, last);
  // Hết kho thì vẫn báo hết hàng (không bịa tài khoản).
  assert.equal(claim().code, 'no_account');
});

test('chủ: bỏ qua khoá khách / khoá máy / máy đang giữ slot người khác; vẫn cần chạm thẻ ở quán', () => {
  const { ctx, claim, customer, deviceId, card } = setup(OWNER);
  lockCustomer(ctx, customer.id, { reason: 'thử' });
  run(ctx.db, "UPDATE devices SET status = 'locked' WHERE id = ?", deviceId);
  const other = makeCustomer(ctx, 'nguoi-khac@x.vn');
  run(ctx.db, `INSERT INTO slots(customer_id, tool_id, cafe_id, card_id, device_id, status, created_at) VALUES(?, ?, ?, ?, ?, 'active', ?)`,
    other.id, 1, card.cafe_id, card.id, deviceId, ctx.now());
  assert.equal(claim().status, 'active');
  ctx.clock.advance(3 * 60 * 60_000); // lượt chạm thẻ hết hạn
  assert.equal(claim().status, 'need_entry');
});

test('chủ: danh sách món không ghi "đã thử" và trang quán vẫn cho chọn khi đang có vé; khách thường thì không', () => {
  const { ctx, claim, customer, cafe, deviceId } = setup(OWNER);
  assert.equal(claim().status, 'active');
  const c = byId(ctx, 'customers', customer.id);
  assert.ok(toolAvailability(ctx, c).every((t) => t.blocked === null));
  const view = currentSlotView(ctx, customer.id, deviceId);
  assert.doesNotMatch(cardPage(ctx, { cafe, customer: c, tools: toolAvailability(ctx, c), view, atCafe: true, owner: true }).s, /Bạn có vé rồi nè/);
  assert.match(cardPage(ctx, { cafe, customer: c, tools: toolAvailability(ctx, c), view, atCafe: true, owner: false }).s, /Bạn có vé rồi nè/);
});

test('khách thường (không có trong OWNER_IDS) vẫn bị hạn mức như cũ', () => {
  const { claim } = setup('khach@x.vn');
  assert.equal(claim().status, 'active');
  assert.equal(claim().code, 'has_active_slot');
});
