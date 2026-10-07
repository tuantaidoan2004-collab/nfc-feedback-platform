// Công cụ của đợt chạy thử: ChatGPT (mật khẩu + 2FA, 5 khách/tài khoản), CapCut (7 ngày, 2 khách, dùng 1 lần),
// Gemini (mã / link 1 lần), Adobe (mật khẩu + mã email), giới hạn lượt/ngày. Canva: khách nhắn Zalo (không còn kiểu mời vào nhóm).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { T0, createTestCtx, makeCustomer, makeDevice, makeSession, makeTap, byId, startTestServer } from './helpers.js';
import { run, get, all } from '../src/db/index.js';
import { encrypt } from '../src/lib/crypto.js';
import { parseTotpSecret, totpNow } from '../src/lib/totp.js';
import { startClaim, currentSlotView, expireDueSlots } from '../src/domain/claims.js';
import { requestCode, totpStatus } from '../src/domain/codes.js';
import { ingestMail } from '../src/domain/mail.js';
import { toolAvailability } from '../src/domain/quota.js';
import { runJobs } from '../src/jobs.js';
import { mePage, cardPage } from '../src/views/public.js';
import { freeTextProblem } from '../src/lib/policy.js';
import { qsEntryCard } from '../src/domain/presence.js';
import { applyPilot } from '../scripts/pilot.js';
import { createBatch } from '../src/domain/vouchers.js';
import { SEC, MIN, HOUR, DAY } from '../src/lib/time.js';

const SECRET = 'JBSWY3DPEHPK3PXP';

/** Quán + công cụ chạy thử (đúng cấu hình npm run pilot). */
function setup() {
  const ctx = createTestCtx();
  const now = ctx.now();
  const cafeId = run(ctx.db,
    `INSERT INTO cafes(name, qs_slug, display_token, code_secret, presence_mode, daily_quota, created_at)
     VALUES('Quán Thử', 'quan-thu', 'disp', 'sec', 'none', 100, ?)`, now).lastInsertRowid;
  const card = qsEntryCard(ctx, byId(ctx, 'cafes', cafeId));
  applyPilot(ctx.db);
  const tool = (slug) => get(ctx.db, 'SELECT * FROM tools WHERE slug = ?', slug);
  const acct = (slug, email, o = {}) => byId(ctx, 'accounts', run(ctx.db,
    `INSERT INTO accounts(tool_id, login_email, password_enc, totp_enc, max_holders, status, created_at) VALUES(?, ?, ?, ?, ?, 'ready', ?)`,
    tool(slug).id, email, o.password ? encrypt(o.password, ctx.config.dataKey) : null, o.totp ? encrypt(o.totp, ctx.config.dataKey) : null,
    o.max ?? tool(slug).holders_default, ctx.now()).lastInsertRowid);
  let n = 0;
  /** Khách mới trên máy mới, vừa vào từ trang quán (vé đúng). → {customer, deviceId, session, claim(toolSlug, extra)} */
  const guest = () => {
    n++;
    const customer = makeCustomer(ctx, `849${String(10000000 + n).slice(-8)}`);
    const deviceId = `device-${String(n).padStart(16, '0')}`;
    makeDevice(ctx, deviceId, customer.id);
    const { session } = makeSession(ctx, { customerId: customer.id, deviceId });
    makeTap(ctx, { card, deviceId });
    const g = {
      customer, deviceId, session,
      claim: (slug, extra = {}) => startClaim(ctx, { customer: byId(ctx, 'customers', customer.id), deviceId, ip: '1.2.3.4', toolId: tool(slug).id, ...extra }),
      code: (extra = {}) => requestCode(ctx, { customer: byId(ctx, 'customers', customer.id), deviceId, ip: '1.2.3.4', ...extra }),
      view: () => currentSlotView(ctx, customer.id, deviceId),
    };
    return g;
  };
  return { ctx, tool, acct, guest, card, cafeId };
}

test('TOTP: đúng chuẩn RFC 6238 và đọc được khoá 2FA nhiều kiểu', () => {
  const rfc = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'; // "12345678901234567890"
  assert.equal(totpNow(rfc, 59_000).code, '287082');
  assert.equal(totpNow(rfc, 1111111109_000).code, '081804');
  assert.equal(totpNow(rfc, 59_000).remainSec, 1);
  assert.equal(parseTotpSecret('jbsw y3dp ehpk 3pxp'), SECRET);
  assert.equal(parseTotpSecret(`otpauth://totp/OpenAI:a@b.c?secret=${SECRET}&issuer=OpenAI`), SECRET);
  assert.equal(parseTotpSecret('123456'), null);
  assert.equal(parseTotpSecret('ABC'), null);
});

test('ChatGPT 8 khách/tài khoản: lấp đầy tài khoản trước, mỗi khách 1 Slot; mã 2FA chỉ hiện đúng máy, đúng lượt', () => {
  const { ctx, acct, guest } = setup();
  const a = acct('chatgpt', 'gpt-a@kho.test', { password: 'Pw#1', totp: SECRET });
  const b = acct('chatgpt', 'gpt-b@kho.test', { password: 'Pw#2', totp: SECRET });
  const guests = Array.from({ length: 9 }, () => guest());
  for (const g of guests) assert.equal(g.claim('chatgpt').status, 'active');
  const seats = guests.map((g) => [g.view().accountEmail, g.view().seat]);
  assert.deepEqual(seats, [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ['gpt-a@kho.test', n]).concat([['gpt-b@kho.test', 1]]));

  const g = guests[0];
  const v = g.view();
  assert.equal(v.password, 'Pw#1');
  assert.equal(v.hasTotp, true);
  assert.equal(JSON.stringify(v).includes(SECRET), false, 'khoá 2FA không bao giờ ra khỏi máy chủ');

  // Phiên 24: lấy mã 2FA cần mã phiếu (phát ở quán), mỗi phiếu 1 lần.
  const [p1, p2, p3] = createBatch(ctx, { kind: 'once', count: 3 }).codes;
  assert.equal(g.code().status, 'need_voucher', 'không có mã phiếu → không lấy được mã');
  const r = g.code({ voucher: p1 });
  assert.equal(r.status, 'totp', JSON.stringify(r));
  assert.equal(r.code, totpNow(SECRET, ctx.now()).code);
  assert.equal(JSON.stringify(r).includes(SECRET), false);
  assert.equal(g.code().status, 'totp', 'bấm lại trong lượt → không tính thêm');
  assert.equal(byId(ctx, 'slots', v.slotId).code_requests, 1);
  assert.equal(totpStatus(ctx, { customerId: g.customer.id, deviceId: g.deviceId }).code, r.code);
  assert.equal(totpStatus(ctx, { customerId: g.customer.id, deviceId: 'may-khac-0000000000' }).status, 'closed');
  assert.equal(totpStatus(ctx, { customerId: guests[1].customer.id, deviceId: guests[1].deviceId }).status, 'closed', 'khách khác chưa mở lượt');
  // Nhiều khách cùng tài khoản xem mã cùng lúc vẫn được (không khoá như mã email).
  assert.equal(guests[1].code({ voucher: p1 }).status, 'need_voucher', 'phiếu đã dùng');
  assert.equal(guests[1].code({ voucher: p2 }).status, 'totp');

  ctx.clock.advance(4 * MIN);
  assert.equal(totpStatus(ctx, { customerId: g.customer.id, deviceId: g.deviceId }).status, 'closed', 'hết lượt xem');
  assert.equal(g.code({ voucher: p3 }).status, 'totp', 'lần 2 mở ngay với phiếu mới, không cần chủ duyệt');
  assert.equal(byId(ctx, 'slots', v.slotId).code_requests, 2);
  assert.ok(b);
});

test('ChatGPT 8 khách / tài khoản, dùng tới 6h sáng: ai nhận lúc nào cũng hết 6h → đúng 1 việc "Đăng xuất mọi thiết bị"', () => {
  const { ctx, acct, guest } = setup(); // T0 = 20:00 giờ VN
  const a = acct('chatgpt', 'gpt-a@kho.test', { password: 'Pw#1', totp: SECRET });
  assert.equal(a.max_holders, 8);
  const sixAm = T0 + 10 * HOUR; // 06:00 sáng hôm sau
  const gs = [];
  for (let i = 0; i < 8; i++) {
    const g = guest();
    assert.equal(g.claim('chatgpt').status, 'active', `khách ${i + 1}`);
    assert.equal(g.view().expiresAt, sixAm, 'nhận 20h–23h đều hết lúc 6h sáng');
    gs.push(g);
    ctx.clock.advance(20 * MIN);
  }
  assert.equal(gs[7].view().seat, 8);
  assert.equal(guest().claim('chatgpt').code, 'no_account', 'khách thứ 9 → tài khoản đã đủ 8');
  ctx.clock.set(T0 + 6 * HOUR); // 02:00 sáng
  const late = acct('chatgpt', 'gpt-b@kho.test', { password: 'Pw#2', totp: SECRET });
  const g9 = guest();
  assert.equal(g9.claim('chatgpt').status, 'active');
  assert.equal(g9.view().expiresAt, sixAm, 'nhận lúc 2h sáng → hết 6h cùng sáng');
  ctx.clock.set(sixAm + MIN);
  expireDueSlots(ctx);
  assert.equal(get(ctx.db, "SELECT COUNT(*) AS n FROM slots WHERE status = 'active'").n, 0);
  const tasks = all(ctx.db, "SELECT account_id FROM rotation_tasks WHERE kind = 'rotate' AND status = 'todo' ORDER BY account_id");
  assert.deepEqual(tasks.map((t) => t.account_id), [a.id, late.id], 'mỗi tài khoản đúng 1 việc đăng xuất');
});

test('Claude 3 khách / tài khoản tới 6h sáng; tài khoản quá 7 ngày kể từ lúc nhập không giao, khách không được hứa quá hạn', () => {
  const { ctx, acct, guest } = setup();
  const c = acct('claude', 'claude-a@kho.test');
  assert.equal(c.max_holders, 3);
  const gs = [guest(), guest(), guest()];
  for (const g of gs) assert.equal(g.claim('claude').status, 'active');
  assert.equal(gs[0].view().expiresAt, T0 + 10 * HOUR);
  assert.equal(guest().claim('claude').code, 'no_account');
  // Ngày thứ 7, 22:00: tài khoản tự hết lúc 20:00 ngày thứ 7 → đã quá hạn, không giao nữa.
  ctx.clock.set(T0 + 7 * DAY + 2 * HOUR);
  run(ctx.db, "UPDATE slots SET status = 'expired' WHERE status = 'active'");
  run(ctx.db, "UPDATE accounts SET status = 'ready'");
  assert.equal(guest().claim('claude').code, 'no_account', 'quá 7 ngày từ lúc nhập kho');
  // Ngày thứ 6, 23:00: còn 21 giờ tới lúc tài khoản tự hết, nhưng lượt chỉ tới 6h sáng → 7 giờ.
  ctx.clock.set(T0 + 6 * DAY + 3 * HOUR);
  const g = guest();
  assert.equal(g.claim('claude').status, 'active');
  assert.equal(g.view().expiresAt, T0 + 7 * DAY - 14 * HOUR);
});

test('CapCut 7 ngày, 2 khách, dùng 1 lần: hết lượt thì bỏ tài khoản, không giao lại, không cần đổi mật khẩu', () => {
  const { ctx, acct, guest } = setup();
  const c1 = acct('capcut', 'cc1@kho.test', { password: 'Cc#1' });
  const g = [guest(), guest()];
  for (const x of g) assert.equal(x.claim('capcut').status, 'active');
  assert.equal(g[0].view().accountEmail, 'cc1@kho.test');
  assert.equal(g[1].view().accountEmail, 'cc1@kho.test');
  assert.equal(g[0].view().password, 'Cc#1');
  assert.equal(g[0].claim('chatgpt').code, 'has_active_slot', 'đang giữ CapCut 7 ngày thì chưa nhận công cụ khác');
  assert.ok(Math.abs(g[0].view().expiresAt - ctx.now() - 7 * DAY) < SEC);
  assert.equal(g[0].view().seat, 1);
  assert.equal(g[1].view().seat, 2);
  assert.equal(c1.max_holders, 2);
  ctx.clock.advance(7 * DAY + MIN);
  expireDueSlots(ctx);
  assert.equal(byId(ctx, 'accounts', c1.id).status, 'retired');
  assert.equal(get(ctx.db, 'SELECT COUNT(*) AS n FROM rotation_tasks').n, 0);
});

test('CapCut dùng 1 lần: khách thứ 3 sang tài khoản mới; tài khoản đã đủ 2 lượt không giao nữa dù 1 người đã hết', () => {
  const { ctx, acct, guest } = setup();
  const c1 = acct('capcut', 'cc1@kho.test', { password: 'Cc#1' });
  const g1 = guest();
  const g2 = guest();
  g1.claim('capcut');
  g2.claim('capcut');
  const g3 = guest();
  assert.equal(g3.claim('capcut').code, 'no_account');
  run(ctx.db, "UPDATE slots SET expires_at = ? WHERE customer_id = ?", ctx.now() - 1, g1.customer.id);
  expireDueSlots(ctx);
  assert.equal(byId(ctx, 'accounts', c1.id).status, 'ready', 'còn g2 dùng');
  assert.equal(guest().claim('capcut').code, 'no_account', 'đã giao đủ 2 lượt');
  const c2 = acct('capcut', 'cc2@kho.test', { password: 'Cc#2' });
  const g5 = guest();
  assert.equal(g5.claim('capcut').status, 'active');
  assert.equal(g5.view().accountEmail, c2.login_email);
});

test('Gemini: mỗi khách đúng 1 mã / link, hết kho thì báo hết; link https hiện thành nút', () => {
  const { ctx, tool, guest } = setup();
  const t = tool('gemini');
  for (const v of ['https://one.google.com/join/abc', 'GEMI-NI12-3456']) {
    run(ctx.db, "INSERT INTO redeem_codes(tool_id, value, status, created_at) VALUES(?, ?, 'ready', ?)", t.id, v, ctx.now());
  }
  assert.equal(toolAvailability(ctx).find((x) => x.tool.slug === 'gemini').free, 2);
  const g1 = guest();
  const g2 = guest();
  assert.equal(g1.claim('gemini').status, 'active');
  assert.equal(g2.claim('gemini').status, 'active');
  assert.deepEqual(g1.view().redeem, { value: 'https://one.google.com/join/abc', isLink: true });
  assert.deepEqual(g2.view().redeem, { value: 'GEMI-NI12-3456', isLink: false });
  assert.equal(currentSlotView(ctx, g1.customer.id, 'may-khac-0000000000').redeem, null, 'máy khác không thấy');
  assert.equal(guest().claim('gemini').code, 'no_account');
  assert.equal(get(ctx.db, "SELECT COUNT(*) AS n FROM redeem_codes WHERE status = 'given'").n, 2);
});

test('giới hạn lượt / ngày của công cụ (cả hệ thống), sang ngày mới thì mở lại', () => {
  const { ctx, tool, acct, guest } = setup();
  run(ctx.db, 'UPDATE tools SET daily_cap = 2 WHERE slug = ?', 'chatgpt');
  acct('chatgpt', 'gpt-a@kho.test', { password: 'Pw#1', totp: SECRET });
  assert.equal(guest().claim('chatgpt').status, 'active');
  assert.equal(guest().claim('chatgpt').status, 'active');
  assert.equal(toolAvailability(ctx).find((x) => x.tool.slug === 'chatgpt').free, 0);
  assert.equal(guest().claim('chatgpt').code, 'tool_daily_cap');
  ctx.clock.advance(DAY);
  assert.equal(guest().claim('chatgpt').status, 'active');
  assert.ok(tool('chatgpt'));
});

test('Adobe: mật khẩu + nút "Lấy mã" email (mã về đúng khách)', () => {
  const { ctx, acct, guest } = setup();
  const a = acct('adobe', 'adobe1@kho.test', { password: 'Ad#1' });
  const g = guest();
  assert.equal(g.claim('adobe').status, 'active');
  const v = g.view();
  assert.equal(v.password, 'Ad#1');
  assert.equal(v.canMailCode, true);
  assert.equal(v.hasTotp, false);
  const w = g.code();
  assert.equal(w.status, 'open', JSON.stringify(w));
  const m = ingestMail(ctx, { message_id: 'ad1', to: a.login_email, from: 'Adobe <message@adobe.com>', subject: 'Your Adobe verification code', text: 'Your verification code is 482913' });
  assert.equal(m.verdict, 'matched');
  assert.equal(g.code({ kind: 'totp' }).code, 'not_code_tool', 'Adobe không có 2FA');
});

test('chữ trên trang khách của mọi loại công cụ không phạm luật Google của QS', () => {
  const { ctx, tool, acct, guest } = setup();
  acct('chatgpt', 'gpt-a@kho.test', { password: 'Pw#1', totp: SECRET });
  acct('capcut', 'cc1@kho.test', { password: 'Cc#1' });
  acct('adobe', 'ad1@kho.test', { password: 'Ad#1' });
  run(ctx.db, "INSERT INTO redeem_codes(tool_id, value, status, created_at) VALUES(?, 'https://x.test/j', 'ready', ?)", tool('gemini').id, ctx.now());
  for (const [slug, extra] of [['chatgpt'], ['capcut'], ['adobe'], ['gemini']]) {
    const g = guest();
    assert.equal(g.claim(slug, extra).status, 'active', slug);
    const page = String(mePage(ctx, { customer: g.customer, view: g.view() }));
    const text = page.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, '\n').replace(/&[a-z#0-9]+;/g, ' ');
    for (const line of text.split(/\n|(?<=[.!?])\s/).map((x) => x.trim()).filter(Boolean)) {
      assert.equal(freeTextProblem(line), null, `${slug}: "${line}"`);
    }
  }
  assert.equal(all(ctx.db, 'SELECT 1 FROM tools').length >= 4, true);
});

test('đổi kiểu đăng nhập (ChatGPT: mã email → mật khẩu + 2FA): kho cũ thiếu mật khẩu / 2FA không được giao', () => {
  const { ctx, acct, guest } = setup();
  acct('chatgpt', 'cu-khong-mk@kho.test'); // nhập từ thời "mã qua email"
  acct('chatgpt', 'co-mk-thieu-2fa@kho.test', { password: 'Pw#0' });
  assert.equal(toolAvailability(ctx).find((x) => x.tool.slug === 'chatgpt').free, 0);
  assert.equal(guest().claim('chatgpt').code, 'no_account');
  acct('chatgpt', 'du@kho.test', { password: 'Pw#1', totp: SECRET });
  const g = guest();
  assert.equal(g.claim('chatgpt').status, 'active');
  assert.equal(g.view().accountEmail, 'du@kho.test');
  assert.equal(applyPilot(ctx.db).unusable.length, 2);
});

test('trang chọn công cụ: công cụ khách đã thử gần đây hiện "Đã thử · lại từ…" và không chọn được', () => {
  const { ctx, acct, guest } = setup();
  acct('capcut', 'cc1@kho.test', { password: 'Cc#1' });
  acct('capcut', 'cc2@kho.test', { password: 'Cc#2' });
  const g = guest();
  assert.equal(g.claim('capcut').status, 'active');
  ctx.clock.advance(8 * DAY);
  expireDueSlots(ctx);
  // Tài khoản nhập 8 ngày trước: Pro dùng thử 7 ngày đã hết → không giao nữa (cc1 bỏ, cc2 quá hạn nhập kho).
  assert.equal(get(ctx.db, "SELECT status FROM accounts WHERE login_email = 'cc1@kho.test'").status, 'retired');
  assert.equal(toolAvailability(ctx).find((x) => x.tool.slug === 'capcut').free, 0, 'kho cũ hết Pro không tính là còn chỗ');
  acct('capcut', 'cc3@kho.test', { password: 'Cc#3' });
  const capcut = toolAvailability(ctx, g.customer).find((x) => x.tool.slug === 'capcut');
  assert.equal(capcut.free > 0, true, 'kho còn chỗ');
  assert.equal(capcut.blocked.code, 'lifetime_cap', 'CapCut chỉ 1 lần / khách');
  const other = guest();
  assert.equal(toolAvailability(ctx, other.customer).find((x) => x.tool.slug === 'capcut').blocked, null);
  const cafe = get(ctx.db, 'SELECT * FROM cafes LIMIT 1');
  const page = String(cardPage(ctx, { cafe, customer: g.customer, tools: toolAvailability(ctx, g.customer), view: null, atCafe: true }));
  assert.match(page, /data-name="CapCut Pro"[^>]* disabled>/);
  assert.match(page, /Đã thử đủ lần/);
});

test('CapCut / Adobe / Claude tự hết 7 ngày kể từ lúc tạo: khách nhận muộn chỉ còn phần còn lại', () => {
  const { ctx, acct, guest } = setup();
  acct('capcut', 'cc-muon@kho.test', { password: 'Cc#9' });
  ctx.clock.advance(3 * DAY);
  const g = guest();
  assert.equal(g.claim('capcut').status, 'active');
  assert.ok(Math.abs(g.view().expiresAt - ctx.now() - 4 * DAY) < SEC, 'nhập kho 3 ngày trước → khách còn 4 ngày');
});
