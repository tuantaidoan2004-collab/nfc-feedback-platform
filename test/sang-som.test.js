// Buổi sáng của công cụ hết lượt cùng giờ (ChatGPT / Claude tới 6h sáng) — chủ chọn 06/10:
// nghỉ nhận 5h–6h (nhận lúc đó chỉ dùng được vài phút) và giữ 1 tài khoản dự phòng cho lúc các tài khoản khác chờ "Đăng xuất mọi thiết bị".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { saveSetting } from '../src/lib/settings.js';
import { createTestCtx, seed, makeCustomer, makeDevice, makeTap, byId } from './helpers.js';
import { startClaim, expireDueSlots, completeTask } from '../src/domain/claims.js';
import { toolAvailability } from '../src/domain/quota.js';
import { run, get } from '../src/db/index.js';
import { MIN } from '../src/lib/time.js';

/** Giờ VN ngày 06/10/2026 → ms. */
const vn = (h, m = 0) => Date.UTC(2026, 9, 6, h - 7, m);

function guest(ctx, card, phone) {
  const c = makeCustomer(ctx, phone);
  const deviceId = `dev-${phone}-aaaaaaaaaa`;
  makeDevice(ctx, deviceId, c.id);
  makeTap(ctx, { card, deviceId });
  return {
    c, deviceId,
    tap: () => makeTap(ctx, { card, deviceId }),
    claim: (toolId) => startClaim(ctx, { customer: byId(ctx, 'customers', c.id), deviceId, ip: '1.2.3.4', toolId }),
  };
}

test('công cụ hết lúc 6h: nghỉ nhận 5h–6h, trang chọn ghi "Mở lại lúc 6h"; công cụ khác vẫn nhận; 0 phút = không nghỉ', () => {
  const ctx = createTestCtx({ now: vn(5, 10) });
  const { card, tools } = seed(ctx);
  run(ctx.db, 'UPDATE tools SET end_hour = 6 WHERE id = ?', tools.chatgpt.id);
  const g = guest(ctx, card, '84911000001');
  const r = g.claim(tools.chatgpt.id);
  assert.equal(r.code, 'tool_closing', JSON.stringify(r));
  assert.match(r.message, /từ 5h tới 6h/);
  const avail = toolAvailability(ctx, g.c);
  assert.equal(avail.find((x) => x.tool.id === tools.chatgpt.id).blocked.short, 'Mở lại lúc 6h');
  assert.equal(avail.find((x) => x.tool.id === tools.capcut.id).blocked, null, 'CapCut (7 ngày) không nghỉ');

  ctx.clock.set(vn(4, 59));
  assert.equal(toolAvailability(ctx, g.c).find((x) => x.tool.id === tools.chatgpt.id).blocked, null, '4h59 vẫn nhận');
  ctx.clock.set(vn(6, 0));
  g.tap();
  assert.equal(g.claim(tools.chatgpt.id).status, 'active', '6h00 mở lại (dùng tới 6h hôm sau)');

  const g2 = guest(ctx, card, '84911000002');
  ctx.clock.set(vn(5, 30) + 86400e3);
  g2.tap();
  saveSetting(ctx.db, 'endHourCloseMin', 0);
  ctx.settings.invalidate();
  assert.equal(g2.claim(tools.chatgpt.id).status, 'active', 'endHourCloseMin = 0 → không nghỉ');
});

test('giữ 1 tài khoản dự phòng: trong ngày không giao; tài khoản khác chờ đăng xuất (6h) thì giao; chỉ còn 1 tài khoản thì giao bình thường', () => {
  const ctx = createTestCtx({ now: vn(20) - 86400e3 }); // 20:00 ngày 05/10
  const { card, tools, accounts } = seed(ctx);
  run(ctx.db, 'UPDATE tools SET end_hour = 6, reserve_account = 1 WHERE id = ?', tools.chatgpt.id);
  const [a, b, c] = ['84912000001', '84912000002', '84912000003'].map((p) => guest(ctx, card, p));
  const gpt = () => toolAvailability(ctx).find((x) => x.tool.id === tools.chatgpt.id);

  const r1 = a.claim(tools.chatgpt.id);
  assert.equal(r1.status, 'active');
  assert.equal(byId(ctx, 'slots', r1.slotId).account_id, accounts.gpt1.id);
  assert.deepEqual({ free: gpt().free, reserved: gpt().reserved }, { free: 0, reserved: 1 }, 'gpt2 đang được giữ làm dự phòng');
  assert.equal(b.claim(tools.chatgpt.id).code, 'no_account', 'trong ngày không giao tài khoản dự phòng');

  // 6h: khách hôm qua hết lượt → gpt1 chờ "Đăng xuất mọi thiết bị" → dự phòng mở ra cho khách sáng sớm.
  ctx.clock.set(vn(6, 5));
  expireDueSlots(ctx);
  assert.equal(byId(ctx, 'accounts', accounts.gpt1.id).status, 'needs_rotation');
  assert.equal(gpt().reserved, 0);
  b.tap();
  const r2 = b.claim(tools.chatgpt.id);
  assert.equal(r2.status, 'active', JSON.stringify(r2));
  assert.equal(byId(ctx, 'slots', r2.slotId).account_id, accounts.gpt2.id);

  // Chủ đăng xuất xong gpt1 → gpt1 rảnh, gpt2 có người → gpt1 thành dự phòng mới.
  const task = get(ctx.db, "SELECT id FROM rotation_tasks WHERE account_id = ? AND status = 'todo'", accounts.gpt1.id);
  assert.equal(completeTask(ctx, task.id, {}).ok, true);
  c.tap();
  assert.equal(c.claim(tools.chatgpt.id).code, 'no_account', 'luôn giữ lại 1 tài khoản rảnh');

  // Chỉ còn 1 tài khoản giao được (gpt2 ngừng dùng) → không giữ gì, giao bình thường.
  run(ctx.db, "UPDATE accounts SET status = 'retired' WHERE id = ?", accounts.gpt2.id);
  ctx.clock.advance(MIN);
  assert.equal(c.claim(tools.chatgpt.id).status, 'active');
});

test('tài khoản tự hết hạn (Claude 7 ngày): báo trước 24 giờ, quá hạn thì không đếm nữa', () => {
  const ctx = createTestCtx();
  const { tools, accounts } = seed(ctx);
  run(ctx.db, 'UPDATE tools SET account_days = 7 WHERE id = ?', tools.chatgpt.id);
  const at = (id, daysAgo) => run(ctx.db, 'UPDATE accounts SET created_at = ? WHERE id = ?', ctx.now() - daysAgo * 86400e3, id);
  const expiring = () => toolAvailability(ctx).find((x) => x.tool.id === tools.chatgpt.id).expiring;
  at(accounts.gpt1.id, 6.5);
  at(accounts.gpt2.id, 1);
  assert.equal(expiring(), 1, 'gpt1 còn 12 giờ');
  at(accounts.gpt1.id, 7.2);
  assert.equal(expiring(), 0, 'đã quá hạn: không giao nữa, không còn là "sắp hết"');
  assert.equal(toolAvailability(ctx).find((x) => x.tool.id === tools.capcut.id).expiring, 0, 'công cụ không tự hết hạn');
});
