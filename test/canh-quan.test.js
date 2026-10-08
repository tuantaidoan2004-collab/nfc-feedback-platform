// Cảnh riêng của quán (O'renchi, Bamos) + trang vé vào thẳng tài khoản (chủ yêu cầu 08/10/2026).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestCtx, seed, makeCustomer, makeDevice, makeTap, byId } from './helpers.js';
import { startClaim, currentSlotView } from '../src/domain/claims.js';
import { cafeTheme } from '../src/views/quan-canh.js';
import { mePage, cardPage } from '../src/views/public.js';
import { toolAvailability } from '../src/domain/quota.js';
import { run } from '../src/db/index.js';

test('nhận ra quán theo mã QS hoặc theo tên; quán khác không có cảnh riêng', () => {
  assert.equal(cafeTheme({ qs_slug: '8ugdc', name: 'X' })?.id, 'bamos');
  assert.equal(cafeTheme({ qs_slug: null, name: 'Bamos Coffee Q7' })?.id, 'bamos');
  assert.equal(cafeTheme({ qs_slug: 'orenchi', name: 'X' })?.id, 'orenchi');
  assert.equal(cafeTheme({ qs_slug: '', name: 'O’renchi Cafe' })?.id, 'orenchi');
  assert.equal(cafeTheme({ qs_slug: 'quan-test', name: 'Cà phê Test' }), null);
});

test('trang quán + trang vé mặc áo của quán; trang vé vào thẳng tài khoản (không còn bước "Mở …")', () => {
  const ctx = createTestCtx();
  const { card, cafe, tools } = seed(ctx);
  run(ctx.db, "UPDATE cafes SET name = 'O''renchi Cafe', qs_slug = 'orenchi' WHERE id = ?", cafe.id);
  const c = makeCustomer(ctx, 'khach@vi-du.test');
  makeDevice(ctx, 'dev-canh-aaaaaaaaaaaaa', c.id);
  makeTap(ctx, { card, deviceId: 'dev-canh-aaaaaaaaaaaaa' });
  const o = byId(ctx, 'cafes', cafe.id);
  const pick = String(cardPage(ctx, { cafe: o, customer: c, tools: toolAvailability(ctx, c), view: null, atCafe: true }));
  assert.match(pick, /class="has-dock q q-orenchi q-hero"/);
  assert.match(pick, /nen-orenchi\.jpg/);
  assert.equal(startClaim(ctx, { customer: c, deviceId: 'dev-canh-aaaaaaaaaaaaa', ip: '1.2.3.4', toolId: tools.capcut.id }).status, 'active');
  const view = currentSlotView(ctx, c.id, 'dev-canh-aaaaaaaaaaaaa');
  const me = String(mePage(ctx, { customer: c, view, cafe: o }));
  assert.match(me, /class="q q-orenchi"/);
  assert.match(me, /Tài khoản của bạn/);
  assert.match(me, /Secret#123/);
  assert.match(me, /data-app="capcut:[^"]*"[^>]*data-copy-first|data-copy-first="[^"]+"[^>]*data-app="capcut:/); assert.match(me, />Mở app CapCut</);
  assert.doesNotMatch(me, /data-flow=/);
  assert.match(me, /Mẹo dùng mượt/);
  assert.match(me, /Kẹt chỗ nào hả\?/);
  // quán thường: không áo riêng
  assert.doesNotMatch(String(mePage(ctx, { customer: c, view, cafe: null })), /q-orenchi/);
});
