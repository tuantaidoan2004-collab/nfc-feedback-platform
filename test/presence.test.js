import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestCtx, seed, makeTap, ticketFor, makeNfcCard, byId } from './helpers.js';
import { cafeByShop, qsEntryCard, recordEntry, latestEntry, isCafeOpen, processTap, parseMirror } from '../src/domain/presence.js';
import { useTicket, makeTicket, ticketSignature } from '../src/domain/ticket.js';
import { get, run } from '../src/db/index.js';
import { MIN, HOUR } from '../src/lib/time.js';

test('vé: đúng chữ ký + đúng quán + còn hạn → nhận; tải lại trên cùng máy vẫn nhận (không còn là vé mới)', () => {
  const ctx = createTestCtx();
  const { cafe } = seed(ctx);
  const t = ticketFor(ctx);
  assert.deepEqual(useTicket(ctx, { cafe, shop: 'quan-test', ticket: t, deviceId: 'd1', ip: '9.9.9.9' }), { ok: true, fresh: true });
  assert.deepEqual(useTicket(ctx, { cafe, shop: 'quan-test', ticket: t, deviceId: 'd1', ip: '9.9.9.9' }), { ok: true, fresh: false });
});

test('vé: mỗi vé 1 máy — máy khác mở cùng link (gửi cho bạn ở nhà) bị từ chối', () => {
  const ctx = createTestCtx();
  const { cafe } = seed(ctx);
  const t = ticketFor(ctx);
  assert.equal(useTicket(ctx, { cafe, shop: 'quan-test', ticket: t, deviceId: 'd1' }).ok, true);
  assert.equal(useTicket(ctx, { cafe, shop: 'quan-test', ticket: t, deviceId: 'd2' }).error, 'used_elsewhere');
});

test('vé: sai khoá, sai quán, sửa chữ, phát trong tương lai → invalid; quá 30 phút → expired', () => {
  const ctx = createTestCtx();
  const { cafe } = seed(ctx);
  const use = (ticket, shop = 'quan-test') => useTicket(ctx, { cafe, shop, ticket, deviceId: 'd1' }).error;
  assert.equal(use(makeTicket('khoa-khac-0123456789-0123456789-01', 'quan-test', ctx.now(), 'n-sai-khoa-aaaa')), 'invalid');
  assert.equal(use(ticketFor(ctx, 'quan-khac')), 'invalid', 'vé của quán khác');
  const t = ticketFor(ctx);
  assert.equal(use(t.replace(/^1\.(\d+)/, (_, s) => `1.${Number(s) + 1}`)), 'invalid', 'sửa giờ phát vé');
  assert.equal(use(''), 'invalid');
  assert.equal(use('rác'), 'invalid');
  assert.equal(use(ticketFor(ctx, 'quan-test', ctx.now() + 10 * MIN)), 'invalid', 'vé phát trong tương lai');
  assert.equal(use(ticketFor(ctx, 'quan-test', ctx.now() + 1 * MIN)), undefined, 'lệch đồng hồ 1 phút vẫn nhận');
  assert.equal(use(ticketFor(ctx, 'quan-test', ctx.now() - 31 * MIN)), 'expired');
  assert.equal(use(ticketFor(ctx, 'QUAN-TEST'.toLowerCase(), ctx.now() - 29 * MIN)), undefined);
});

test('vé: thiếu khoá thì không ai vào được; khớp đúng công thức chữ ký của QS', () => {
  const ctx = createTestCtx();
  const { cafe } = seed(ctx);
  const t = ticketFor(ctx);
  // Công thức phải giống hệt lib/events/ticket.ts bên QS (HMAC-SHA256, base64url, 32 ký tự, mã quán chữ thường).
  const [, issued, nonce, sig] = t.split('.');
  assert.equal(sig, ticketSignature(ctx.config.qsTicketKey, 'QUAN-TEST', issued, nonce));
  assert.equal(sig.length, 32);
  ctx.config.qsTicketKey = '';
  assert.equal(useTicket(ctx, { cafe, shop: 'quan-test', ticket: t, deviceId: 'd1' }).error, 'invalid');
});

test('vé giả dồn dập vào 1 quán → báo động 1 lần mỗi giờ', () => {
  const ctx = createTestCtx();
  const { cafe } = seed(ctx);
  for (let i = 0; i < 40; i++) useTicket(ctx, { cafe, shop: 'quan-test', ticket: `1.${Math.floor(ctx.now() / 1000)}.nonce-gia-${i}-aaaa.${'x'.repeat(32)}`, deviceId: `d${i}` });
  assert.equal(ctx.alerts('ticket_forged').length, 1);
});

test('lượt vào: ghi qua lối vào QS ẩn của quán; còn hạn 30 phút; quán tạm dừng / ngoài giờ không tính', () => {
  const ctx = createTestCtx();
  const { cafe, card } = seed(ctx);
  assert.equal(qsEntryCard(ctx, cafe).id, card.id, 'mỗi quán đúng 1 lối vào QS');
  assert.equal(cafeByShop(ctx, 'QUAN-TEST').id, cafe.id);
  assert.equal(cafeByShop(ctx, 'khong-co'), null);
  assert.equal(recordEntry(ctx, { cafe, deviceId: 'd1', ip: '9.9.9.9' }).verdict, 'ok');
  assert.equal(latestEntry(ctx, 'd1').cafeId, cafe.id);
  assert.equal(latestEntry(ctx, 'd1', cafe.id + 1), null, 'lượt vào của quán khác');
  ctx.clock.advance(31 * MIN);
  assert.equal(latestEntry(ctx, 'd1'), null);

  run(ctx.db, "UPDATE cafes SET status = 'paused' WHERE id = ?", cafe.id);
  const paused = get(ctx.db, 'SELECT * FROM cafes WHERE id = ?', cafe.id);
  assert.equal(recordEntry(ctx, { cafe: paused, deviceId: 'd2' }).verdict, 'locked');
  assert.equal(latestEntry(ctx, 'd2'), null);
  run(ctx.db, "UPDATE cafes SET status = 'active', open_hour = 6, close_hour = 7 WHERE id = ?", cafe.id);
  const closed = get(ctx.db, 'SELECT * FROM cafes WHERE id = ?', cafe.id);
  assert.equal(recordEntry(ctx, { cafe: closed, deviceId: 'd3' }).verdict, 'closed');
  makeTap(ctx, { card, deviceId: 'd4', verdict: 'closed' });
  assert.equal(latestEntry(ctx, 'd4'), null);
});

test('giờ mở chương trình', () => {
  const night = { open_hour: 7, close_hour: 23 };
  assert.ok(isCafeOpen(night, Date.UTC(2026, 9, 5, 13), 420));   // 20:00
  assert.ok(!isCafeOpen(night, Date.UTC(2026, 9, 5, 17), 420));  // 00:00
  assert.ok(isCafeOpen({ open_hour: null, close_hour: null }, 0, 420));
  void HOUR;
});

// ---------- Thẻ NFC riêng của Tiệm (quán chưa dùng QS) ----------

const UID = '04A1B2C3D4E5F6';
const tapWith = (ctx, card, cafe, query, deviceId, ip = '1.2.3.4') =>
  processTap(ctx, { card: byId(ctx, 'cards', card.id), cafe, query, deviceId, ip });

test('thẻ riêng: bộ đếm tăng → ok; link chép lại (bộ đếm cũ) → replay, không thành lượt vào; tải lại cùng máy → ok', () => {
  const ctx = createTestCtx();
  const { cafe } = seed(ctx);
  const card = makeNfcCard(ctx, cafe);
  assert.equal(tapWith(ctx, card, cafe, { m: `${UID}x00000A` }, 'd1').verdict, 'ok');
  assert.equal(byId(ctx, 'cards', card.id).last_counter, 10);
  assert.equal(byId(ctx, 'cards', card.id).nfc_uid, UID, 'nhớ UID lần đầu');
  assert.equal(latestEntry(ctx, 'd1', cafe.id).cardId, card.id);

  assert.equal(tapWith(ctx, card, cafe, { m: `${UID}x00000A` }, 'd1').verdict, 'ok', 'tải lại trang trên cùng máy');
  const copy = tapWith(ctx, card, cafe, { m: `${UID}x00000A` }, 'd2', '9.9.9.9');
  assert.equal(copy.verdict, 'replay', 'máy khác mở link chép lại');
  assert.equal(latestEntry(ctx, 'd2'), null);
  assert.equal(tapWith(ctx, card, cafe, { m: `${UID}x000009` }, 'd3').verdict, 'replay', 'bộ đếm lùi');
  assert.equal(tapWith(ctx, card, cafe, {}, 'd4').verdict, 'replay', 'cắt bỏ tham số mirror');
  assert.equal(tapWith(ctx, card, cafe, { m: `${UID}x00000B` }, 'd2').verdict, 'ok', 'chạm lại thẻ thật → được');
  assert.equal(latestEntry(ctx, 'd2').cardId, card.id);
  assert.ok(get(ctx.db, "SELECT 1 FROM events WHERE type = 'tap_replay'"));
});

test('thẻ riêng: nhảy vọt → jump (vẫn vào, bộ đếm không đổi); UID lạ → forged; lượt cũ quá 30 phút không tính là tải lại', () => {
  const ctx = createTestCtx();
  const { cafe } = seed(ctx);
  const card = makeNfcCard(ctx, cafe);
  tapWith(ctx, card, cafe, { m: `${UID}x000010` }, 'd1');
  const jump = tapWith(ctx, card, cafe, { m: `${UID}xFFFFFF` }, 'd2');
  assert.equal(jump.verdict, 'jump');
  assert.equal(jump.riskPoints, 25);
  assert.equal(latestEntry(ctx, 'd2').verdict, 'jump');
  assert.equal(byId(ctx, 'cards', card.id).last_counter, 16, 'số giả không đẩy bộ đếm lên');
  assert.equal(tapWith(ctx, card, cafe, { m: `${UID}x000011` }, 'd3').verdict, 'ok', 'lượt chạm thật kế tiếp vẫn nhận');

  const forged = tapWith(ctx, card, cafe, { m: '04FFFFFFFFFFFFx000099' }, 'd5');
  assert.equal(forged.verdict, 'forged');
  assert.equal(latestEntry(ctx, 'd5'), null);
  assert.equal(get(ctx.db, "SELECT severity FROM events WHERE type = 'tap_forged'").severity, 'red');

  ctx.clock.advance(31 * MIN);
  assert.equal(tapWith(ctx, card, cafe, { m: `${UID}x000011` }, 'd3').verdict, 'replay', 'quá 30 phút: link cũ trên máy cũng hết');
});

test('thẻ riêng: chip không bật bộ đếm → mở là tính; thẻ khoá / quán dừng / ngoài giờ không tính', () => {
  const ctx = createTestCtx();
  const { cafe } = seed(ctx);
  const card = makeNfcCard(ctx, cafe);
  assert.equal(tapWith(ctx, card, cafe, {}, 'd1').verdict, 'ok');
  assert.equal(tapWith(ctx, card, cafe, {}, 'd2').verdict, 'ok');
  assert.equal(byId(ctx, 'cards', card.id).last_counter, null);

  run(ctx.db, "UPDATE cards SET status = 'locked' WHERE id = ?", card.id);
  assert.equal(tapWith(ctx, card, cafe, {}, 'd3').verdict, 'locked');
  assert.equal(latestEntry(ctx, 'd3'), null);
  run(ctx.db, "UPDATE cards SET status = 'active' WHERE id = ?", card.id);
  run(ctx.db, 'UPDATE cafes SET open_hour = 6, close_hour = 7 WHERE id = ?', cafe.id);
  assert.equal(tapWith(ctx, card, byId(ctx, 'cafes', cafe.id), {}, 'd4').verdict, 'closed');
  assert.equal(latestEntry(ctx, 'd4'), null);
});

test('thẻ riêng: quá nhiều máy mở 1 thẻ trong 1 giờ → báo động 1 lần rồi tự khoá', () => {
  const ctx = createTestCtx({ settings: { cardTapsPerHourAlert: 3, cardTapsPerHourLock: 5 } });
  const { cafe } = seed(ctx);
  const card = makeNfcCard(ctx, cafe);
  for (let i = 0; i < 6; i++) tapWith(ctx, card, cafe, {}, `dev${i}`, `1.2.3.${i}`);
  const k = byId(ctx, 'cards', card.id);
  assert.equal(k.status, 'locked');
  assert.match(k.lock_reason, /quá nhiều máy/);
  assert.deepEqual(ctx.alerts().map((e) => e.type).filter((t) => t.startsWith('card_')), ['card_anomaly', 'card_locked']);
  assert.equal(tapWith(ctx, card, cafe, {}, 'dev9').verdict, 'locked');
});

test('parseMirror: các dạng link NXP TagWriter / NFC Tools', () => {
  assert.deepEqual(parseMirror({ uid: '04a1b2c3d4e5f6', ctr: '00000f' }), { uid: '04A1B2C3D4E5F6', counter: 15 });
  assert.deepEqual(parseMirror({}), { uid: null, counter: null });
  assert.deepEqual(parseMirror({ UID: '04A1B2C3D4E5F6x00002A' }), { uid: '04A1B2C3D4E5F6', counter: 42 });
  assert.deepEqual(parseMirror({ m: '04a1b2c3d4e5f6x0000ff' }), { uid: '04A1B2C3D4E5F6', counter: 255 });
  assert.deepEqual(parseMirror({ UID: '04A1B2C3D4E5F6' }), { uid: '04A1B2C3D4E5F6', counter: null });
  assert.deepEqual(parseMirror({ ctr: 'zzzzzz', uid: '123' }), { uid: null, counter: null }, 'rác thì bỏ qua');
});
