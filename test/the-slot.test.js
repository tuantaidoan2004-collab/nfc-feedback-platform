// Thẻ tài khoản ChatGPT / Claude ghi rõ Slot của khách (chủ 10/10/2026: "thiếu ui slot nào" — vé ở trên cuộn khuất).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestCtx, seed, makeCustomer, makeDevice, makeTap } from './helpers.js';
import { startClaim, currentSlotView } from '../src/domain/claims.js';
import { mePage } from '../src/views/public.js';
import { run } from '../src/db/index.js';

test('ChatGPT dùng chung: nhãn Slot đầu thẻ + bước 4 vào đúng Project; tài khoản 1 người thì không có', () => {
  const ctx = createTestCtx();
  const { card, cafe, tools, accounts } = seed(ctx);
  run(ctx.db, 'UPDATE accounts SET max_holders = 8 WHERE id = ?', accounts.gpt1.id);
  run(ctx.db, "UPDATE accounts SET status = 'retired' WHERE id = ?", accounts.gpt2.id);
  const me = (email, dev) => {
    const c = makeCustomer(ctx, email);
    makeDevice(ctx, dev, c.id);
    makeTap(ctx, { card, deviceId: dev });
    assert.equal(startClaim(ctx, { customer: c, deviceId: dev, ip: '1.2.3.4', toolId: tools.chatgpt.id }).status, 'active');
    return String(mePage(ctx, { customer: c, view: currentSlotView(ctx, c.id, dev), cafe }));
  };
  const a = me('a@vi-du.test', 'dev-slot-aaaaaaaaaaaaaa');
  assert.match(a, /Tài khoản của bạn<span class="acc-ws">Slot 1<\/span>/);
  assert.match(a, /data-g="4"><span>Vào Project <b>Slot 1<\/b>/);
  const b = me('b@vi-du.test', 'dev-slot-bbbbbbbbbbbbbb');
  assert.match(b, /class="acc-ws">Slot 2</);

  run(ctx.db, 'UPDATE accounts SET max_holders = 1 WHERE id = ?', accounts.gpt1.id);
  run(ctx.db, "UPDATE accounts SET status = 'ready' WHERE id = ?", accounts.gpt2.id);
  const solo = me('c@vi-du.test', 'dev-slot-cccccccccccccc');
  assert.doesNotMatch(solo, /acc-ws|data-g="4"/);
});
