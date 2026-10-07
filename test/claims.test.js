import { test } from 'node:test';
import assert from 'node:assert/strict';
import { saveSetting } from '../src/lib/settings.js';
import { createTestCtx, seed, makeCustomer, makeDevice, makeSession, makeTap, makeNfcCard, byId, T0 } from './helpers.js';
import { startClaim, expireDueSlots, completeTask, currentSlotView, revokeSlot } from '../src/domain/claims.js';
import { addStrike, lockCustomer, isCustomerLocked } from '../src/domain/risk.js';
import { get, all } from '../src/db/index.js';
import { MIN, HOUR, DAY } from '../src/lib/time.js';

/** Khách đã đăng nhập, vừa vào từ trang quán bằng vé (đang ở quán). */
function setup(opts = {}) {
  const ctx = createTestCtx(opts);
  const data = seed(ctx);
  const customer = makeCustomer(ctx);
  const deviceId = 'device-aaaaaaaaaaaaaaaa';
  makeDevice(ctx, deviceId, customer.id);
  const { session } = makeSession(ctx, { customerId: customer.id, deviceId });
  makeTap(ctx, { card: data.card, deviceId });
  const claim = (extra = {}) => startClaim(ctx, {
    customer: byId(ctx, 'customers', customer.id),
    deviceId, ip: '1.2.3.4', toolId: data.tools.capcut.id, ...extra,
  });
  return { ctx, ...data, customer, deviceId, session, claim };
}

test('xanh: cấp ngay, gán tài khoản, tính giờ 24h; mật khẩu chỉ hiện trên máy đã gắn', () => {
  const { ctx, claim, customer, deviceId, accounts } = setup();
  const r = claim();
  assert.equal(r.status, 'active');
  const slot = byId(ctx, 'slots', r.slotId);
  assert.equal(slot.account_id, accounts.capcut1.id);
  assert.equal(slot.expires_at - slot.started_at, 24 * HOUR);
  const view = currentSlotView(ctx, customer.id, deviceId);
  assert.equal(view.password, 'Secret#123');
  assert.equal(currentSlotView(ctx, customer.id, 'device-khac-bbbbbbbbbbb').password, null);
});

test('chưa vào từ trang quán → need_entry; vào rồi (4G hay Wi-Fi đều được) → qua; lượt vào quá 30 phút → need_entry', () => {
  const ctx = createTestCtx();
  const { card, tools } = seed(ctx);
  const c = makeCustomer(ctx);
  makeDevice(ctx, 'dev-4g-aaaaaaaaaaaaaaa', c.id);
  const args = { customer: c, deviceId: 'dev-4g-aaaaaaaaaaaaaaa', ip: '9.9.9.9', toolId: tools.capcut.id };
  assert.equal(startClaim(ctx, args).status, 'need_entry');
  makeTap(ctx, { card, deviceId: 'dev-4g-aaaaaaaaaaaaaaa', ip: '9.9.9.9' });
  ctx.clock.advance(31 * MIN);
  assert.equal(startClaim(ctx, args).status, 'need_entry');
  makeTap(ctx, { card, deviceId: 'dev-4g-aaaaaaaaaaaaaaa', ip: '9.9.9.9' });
  assert.equal(startClaim(ctx, args).status, 'active');
});

test('hạn mức: đang có slot; mỗi ngày 1 công cụ; chờ 30 ngày mới nhận lại cùng công cụ', () => {
  const { ctx, claim, tools, customer, deviceId, card } = setup();
  assert.equal(claim().status, 'active');
  assert.equal(claim({ toolId: tools.chatgpt.id }).code, 'has_active_slot');
  ctx.clock.advance(25 * HOUR);
  expireDueSlots(ctx);
  makeTap(ctx, { card, deviceId });
  // Hôm sau nhận được công cụ khác
  const r2 = claim({ toolId: tools.chatgpt.id });
  assert.equal(r2.status, 'active', JSON.stringify(r2));
  ctx.clock.advance(25 * HOUR);
  expireDueSlots(ctx);
  for (const t of all(ctx.db, "SELECT id FROM rotation_tasks WHERE status = 'todo'")) completeTask(ctx, t.id, { newPassword: 'Moi#123' });
  makeTap(ctx, { card, deviceId });
  const r3 = claim();
  assert.equal(r3.code, 'cooldown');
  assert.match(r3.message, /CapCut Pro/);
  void customer;
});

test('máy đã có SĐT khác nhận slot → chặn; tài khoản lỗi phía Tiệm không tính lượt', () => {
  const { ctx, claim, deviceId, card, tools } = setup();
  const r = claim();
  assert.equal(r.status, 'active');
  revokeSlot(ctx, r.slotId, 'account_quarantined');
  for (const t of all(ctx.db, "SELECT id FROM rotation_tasks WHERE status = 'todo'")) completeTask(ctx, t.id, { newPassword: 'Moi#123' });
  makeTap(ctx, { card, deviceId });
  assert.equal(claim().status, 'active', 'thu hồi vì lỗi tài khoản thì được nhận lại ngay');

  const other = makeCustomer(ctx, '84987654321');
  makeDevice(ctx, deviceId, other.id);
  const { session } = makeSession(ctx, { customerId: other.id, deviceId });
  const r2 = startClaim(ctx, { customer: other, deviceId, ip: '1.2.3.4', toolId: tools.chatgpt.id });
  void session;
  assert.equal(r2.code, 'device_busy');
});

test('bạn mượn máy chỉ để đăng nhập (không nhận) → chủ máy vẫn nhận bình thường; bạn đó nhận trên máy này thì bị chặn', () => {
  const { ctx, claim, deviceId, tools, card } = setup();
  const friend = makeCustomer(ctx, '84987654321');
  makeDevice(ctx, deviceId, friend.id);
  makeSession(ctx, { customerId: friend.id, deviceId });
  const r = claim();
  assert.equal(r.status, 'active', JSON.stringify(r));
  assert.doesNotMatch(byId(ctx, 'slots', r.slotId).risk_reasons, /device_other_phone/);
  ctx.clock.advance(25 * HOUR);
  expireDueSlots(ctx);
  makeTap(ctx, { card, deviceId });
  // Chủ máy đã nhận trên máy này → hôm sau bạn nhận trên cùng máy thì bị chặn cứng như cũ.
  const r2 = startClaim(ctx, { customer: byId(ctx, 'customers', friend.id), deviceId, ip: '1.2.3.4', toolId: tools.chatgpt.id });
  assert.equal(r2.code, 'device_phone_limit', JSON.stringify(r2));
});

test('vàng: mặc định tự từ chối (không ai duyệt tay), không tính lượt; cài đặt approve → cho qua như xanh', () => {
  // Khách có 30 điểm rủi ro tích luỹ → vàng.
  const { ctx, claim, customer } = setup();
  ctx.db.prepare('UPDATE customers SET risk = 30, risk_updated_at = ? WHERE id = ?').run(ctx.now(), customer.id);
  const r = claim();
  assert.equal(r.code, 'need_review');
  assert.equal(byId(ctx, 'slots', r.slotId).status, 'rejected');
  assert.equal(ctx.alerts('claim_yellow_rejected').length, 1);
  assert.throws(() => saveSetting(ctx.db, 'yellowAction', 'telegram'), /reject hoặc approve/);
  saveSetting(ctx.db, 'yellowAction', 'approve');
  ctx.settings.invalidate();
  const ok = claim();
  assert.equal(ok.status, 'active', JSON.stringify(ok));
  assert.equal(ctx.alerts('claim_yellow_passed').length, 1);
});

test('đỏ → từ chối + báo động', () => {
  const { ctx, claim, customer } = setup();

  ctx.db.prepare('UPDATE customers SET risk = 50, strikes = 1, risk_updated_at = ? WHERE id = ?').run(ctx.now(), customer.id);
  const red = claim();
  assert.equal(red.code, 'risk_high');
  assert.equal(ctx.alerts('claim_red').length, 1);
});

test('hết hạn → việc đổi mật khẩu; chủ bấm Xong → tài khoản sẵn sàng', () => {
  const { ctx, claim, accounts } = setup();
  claim();
  ctx.clock.advance(24 * HOUR + 1);
  assert.equal(expireDueSlots(ctx), 1);
  assert.equal(byId(ctx, 'accounts', accounts.capcut1.id).status, 'needs_rotation');
  const task = get(ctx.db, "SELECT * FROM rotation_tasks WHERE kind = 'rotate' AND status = 'todo'");
  assert.ok(task);
  // Diễn tập vận hành: quên dán mật khẩu mới → không cho xong (kho sẽ giữ mật khẩu cũ, khách sau nhận mật khẩu sai).
  const forgot = completeTask(ctx, task.id, { by: 'test' });
  assert.equal(forgot.ok, false);
  assert.match(forgot.message, /mật khẩu mới/);
  assert.equal(completeTask(ctx, task.id, { by: 'test', keepPassword: true }).ok, false, 'không có 2FA thì không được giữ mật khẩu cũ');
  assert.equal(byId(ctx, 'accounts', accounts.capcut1.id).status, 'needs_rotation');
  assert.equal(completeTask(ctx, task.id, { by: 'test', newPassword: 'Moi#456' }).ok, true);
  assert.equal(byId(ctx, 'accounts', accounts.capcut1.id).status, 'ready');
});

test('quán: hết daily_quota suất / ngày → cafe_quota', () => {
  const ctx = createTestCtx();
  const { cafe, card, tools } = seed(ctx);
  ctx.db.prepare('UPDATE cafes SET daily_quota = 1 WHERE id = ?').run(cafe.id);
  for (const [i, phone] of ['84911111111', '84922222222'].entries()) {
    const c = makeCustomer(ctx, phone);
    const dev = `device-cafe-${i}-aaaaaaaaaa`;
    makeDevice(ctx, dev, c.id);
    makeTap(ctx, { card, deviceId: dev });
    const r = startClaim(ctx, { customer: c, deviceId: dev, ip: '1.2.3.4', toolId: i === 0 ? tools.capcut.id : tools.chatgpt.id });
    assert.equal(i === 0 ? r.status : r.code, i === 0 ? 'active' : 'cafe_quota');
  }
});

test('vi phạm: lần 2 khoá 7 ngày và thu hồi slot; hết hạn khoá thì không còn bị coi là khoá', () => {
  const { ctx, claim, customer } = setup();
  const r = claim();
  addStrike(ctx, customer.id, 'test');
  const s2 = addStrike(ctx, customer.id, 'test');
  assert.equal(s2.locked, true);
  assert.equal(byId(ctx, 'slots', r.slotId).status, 'revoked');
  const c = byId(ctx, 'customers', customer.id);
  assert.ok(isCustomerLocked(c, ctx.now()));
  assert.ok(!isCustomerLocked(c, ctx.now() + 8 * DAY));
  assert.equal(all(ctx.db, 'SELECT * FROM sessions WHERE customer_id = ?', customer.id).length, 0);
  void lockCustomer; void T0;
});

test('thẻ NFC riêng: quá cardDailyClaims slot/ngày từ 1 thẻ → card_quota; lối vào QS của quán không bị giới hạn này', () => {
  const ctx = createTestCtx({ settings: { cardDailyClaims: 1 } });
  const { cafe, card: qsCard, tools } = seed(ctx);
  const nfc = makeNfcCard(ctx, cafe);
  const phones = ['84911111111', '84922222222', '84933333333'];
  const results = phones.map((phone, i) => {
    const c = makeCustomer(ctx, phone);
    const dev = `device-card-${i}-aaaaaaaaaa`;
    makeDevice(ctx, dev, c.id);
    makeTap(ctx, { card: i < 2 ? nfc : qsCard, deviceId: dev });
    return startClaim(ctx, { customer: c, deviceId: dev, ip: '1.2.3.4', toolId: tools.capcut.id });
  });
  assert.equal(results[0].status, 'active');
  assert.equal(results[0].slotId && byId(ctx, 'slots', results[0].slotId).card_id, nfc.id);
  assert.equal(results[1].code, 'card_quota');
  assert.notEqual(results[2].code, 'card_quota', 'khách vào qua trang quán QS');
});
