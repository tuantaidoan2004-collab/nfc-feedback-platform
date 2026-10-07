// Phiên 24: mã phiếu (lấy mã đăng nhập), workspace theo thứ tự, bot ChatGPT làm mới mỗi ngày, gia hạn.
// Thiết kế: docs/design-ma-phieu-workspace.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { T0, createTestCtx, makeCustomer, makeDevice, makeSession, makeTap, byId, startTestServer } from './helpers.js';
import { run, get, all } from '../src/db/index.js';
import { encrypt } from '../src/lib/crypto.js';
import { totpNow } from '../src/lib/totp.js';
import { saveSetting } from '../src/lib/settings.js';
import { startClaim, currentSlotView, expireDueSlots } from '../src/domain/claims.js';
import { requestCode } from '../src/domain/codes.js';
import { createBatch, normalizeCode, formatCode, extendSlot, requestExtension, redeemExtension, voidVoucher, unbindVoucher } from '../src/domain/vouchers.js';
import { qsEntryCard } from '../src/domain/presence.js';
import { runJobs } from '../src/jobs.js';
import { mePage } from '../src/views/public.js';
import { applyPilot } from '../scripts/pilot.js';
import { MIN, HOUR, DAY } from '../src/lib/time.js';

const SECRET = 'JBSWY3DPEHPK3PXP';
const BOT = { authorization: 'Bearer dev-worker-token-change-me-0123' };

function setup(settings = {}) {
  const ctx = createTestCtx({ settings });
  const cafeId = run(ctx.db,
    `INSERT INTO cafes(name, qs_slug, display_token, code_secret, presence_mode, daily_quota, created_at)
     VALUES('Quán Thử', 'quan-thu', 'disp', 'sec', 'none', 100, ?)`, ctx.now()).lastInsertRowid;
  const otherCafe = run(ctx.db,
    `INSERT INTO cafes(name, qs_slug, display_token, code_secret, presence_mode, daily_quota, created_at)
     VALUES('Quán Khác', 'quan-khac', 'disp2', 'sec2', 'none', 100, ?)`, ctx.now()).lastInsertRowid;
  const card = qsEntryCard(ctx, byId(ctx, 'cafes', cafeId));
  applyPilot(ctx.db);
  // Cấu hình trước 07/10 (ChatGPT mật khẩu + 2FA, Adobe có nút Lấy mã): giữ để kiểm các kiểu đăng nhập này — vẫn chọn được ở trang Công cụ.
  run(ctx.db, "UPDATE tools SET login_type = 'password_totp' WHERE slug = 'chatgpt'");
  run(ctx.db, "UPDATE tools SET mail_code = 1 WHERE slug = 'adobe'");
  const tool = (slug) => get(ctx.db, 'SELECT * FROM tools WHERE slug = ?', slug);
  const acct = (slug, email, o = {}) => byId(ctx, 'accounts', run(ctx.db,
    `INSERT INTO accounts(tool_id, login_email, password_enc, totp_enc, max_holders, status, created_at) VALUES(?, ?, ?, ?, ?, 'ready', ?)`,
    tool(slug).id, email, o.password ? encrypt(o.password, ctx.config.dataKey) : null, o.totp ? encrypt(o.totp, ctx.config.dataKey) : null,
    o.max ?? tool(slug).holders_default, o.createdAt ?? ctx.now()).lastInsertRowid);
  let n = 0;
  const guest = () => {
    n++;
    const customer = makeCustomer(ctx, `849${String(20000000 + n).slice(-8)}`);
    const deviceId = `device-${String(n).padStart(16, '0')}`;
    makeDevice(ctx, deviceId, customer.id);
    makeSession(ctx, { customerId: customer.id, deviceId });
    makeTap(ctx, { card, deviceId });
    const me = () => byId(ctx, 'customers', customer.id);
    return {
      customer, deviceId,
      tap: () => makeTap(ctx, { card, deviceId }),
      claim: (slug) => startClaim(ctx, { customer: me(), deviceId, ip: '1.2.3.4', toolId: tool(slug).id }),
      code: (extra = {}) => requestCode(ctx, { customer: me(), deviceId, ip: '1.2.3.4', ...extra }),
      view: () => currentSlotView(ctx, customer.id, deviceId),
    };
  };
  return { ctx, tool, acct, guest, cafeId, otherCafe };
}

test('mã phiếu: định dạng dễ đọc, gõ thường / có gạch / có cách đều nhận', () => {
  const { ctx } = setup();
  const r = createBatch(ctx, { kind: 'once', count: 50 });
  assert.equal(r.ok, true);
  assert.equal(new Set(r.codes).size, 50);
  for (const c of r.codes) assert.match(c, /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$/, 'không có 0/O/1/I/L');
  assert.equal(normalizeCode(` ${formatCode(r.codes[0]).toLowerCase()} `), r.codes[0]);
  assert.equal(createBatch(ctx, { kind: 'once', count: 0 }).ok, false);
  assert.equal(createBatch(ctx, { kind: 'xx', count: 1 }).ok, false);
  assert.equal(createBatch(ctx, { kind: 'extend', count: 1 }).ok, false, 'mã gia hạn cần số ngày');
  assert.equal(createBatch(ctx, { kind: 'once', count: 1, tools: ['khong-co'] }).ok, false);
});

test('ChatGPT: có email + mật khẩu nhưng không có mã phiếu thì không lấy được mã 2FA; phiếu 1 lần chỉ dùng 1 lần, không trừ khi chưa mở được', () => {
  const { ctx, acct, guest } = setup();
  acct('chatgpt', 'gpt-a@kho.test', { password: 'Pw#1', totp: SECRET });
  const [p1] = createBatch(ctx, { kind: 'once', count: 1 }).codes;
  const a = guest();
  const b = guest();
  assert.equal(a.claim('chatgpt').status, 'active');
  assert.equal(b.claim('chatgpt').status, 'active');
  assert.equal(a.view().needVoucher, true);
  assert.equal(a.code().status, 'need_voucher');
  assert.equal(a.code({ voucher: 'ABCD-EFGH' }).code, 'voucher_invalid');
  assert.equal(byId(ctx, 'slots', a.view().slotId).code_requests, 0, 'sai mã phiếu → không tính lượt lấy mã');

  // Máy khác máy nhận slot → từ chối, phiếu KHÔNG bị trừ.
  const other = requestCode(ctx, { customer: byId(ctx, 'customers', a.customer.id), deviceId: b.deviceId, ip: '1.2.3.4', voucher: p1 });
  assert.equal(other.code, 'second_device');
  assert.equal(get(ctx.db, 'SELECT uses FROM vouchers WHERE code = ?', p1).uses, 0);

  const r = a.code({ voucher: formatCode(p1).toLowerCase() });
  assert.equal(r.status, 'totp');
  assert.equal(r.code, totpNow(SECRET, ctx.now()).code);
  assert.equal(get(ctx.db, 'SELECT status FROM vouchers WHERE code = ?', p1).status, 'used');
  assert.equal(a.code().status, 'totp', 'đang trong lượt xem trên đúng máy → xem tiếp, không cần phiếu mới');
  assert.equal(b.code({ voucher: p1 }).code, 'voucher_used', 'người khác cầm phiếu đã dùng → không được');
  assert.equal(all(ctx.db, 'SELECT * FROM voucher_uses').length, 1);
});

test('mã phiếu thay cho "đang ở quán" (phiếu chỉ phát ở quán); bật voucherNeedsCafe thì cần cả hai', () => {
  const { ctx, acct, guest } = setup();
  acct('chatgpt', 'gpt-a@kho.test', { password: 'Pw#1', totp: SECRET });
  const codes = createBatch(ctx, { kind: 'once', count: 3 }).codes;
  const g = guest();
  assert.equal(g.claim('chatgpt').status, 'active');
  ctx.clock.advance(2 * HOUR); // đã quá 30 phút sau lần chạm thẻ
  assert.equal(g.code({ voucher: codes[0] }).status, 'totp');
  ctx.clock.advance(5 * MIN);
  saveSetting(ctx.db, 'voucherNeedsCafe', 1);
  ctx.settings.invalidate();
  assert.equal(g.code({ voucher: codes[1] }).status, 'need_entry');
  assert.equal(get(ctx.db, 'SELECT uses FROM vouchers WHERE code = ?', codes[1]).uses, 0);
  g.tap();
  assert.equal(g.code({ voucher: codes[1] }).status, 'totp');
});

test('mã vĩnh viễn: gắn SĐT đầu tiên, lần sau không cần gõ; SĐT khác không dùng được; chủ gỡ gắn / huỷ được', () => {
  const { ctx, acct, guest } = setup();
  acct('chatgpt', 'gpt-a@kho.test', { password: 'Pw#1', totp: SECRET });
  const { codes: [forever] } = createBatch(ctx, { kind: 'forever', count: 1, note: 'Nhân viên quán' });
  const a = guest();
  const b = guest();
  a.claim('chatgpt');
  b.claim('chatgpt');
  assert.equal(a.code({ voucher: forever }).status, 'totp');
  const v = get(ctx.db, 'SELECT * FROM vouchers WHERE code = ?', forever);
  assert.equal(v.customer_id, a.customer.id);
  assert.equal(v.status, 'active', 'vĩnh viễn không hết sau 1 lần');
  assert.equal(b.code({ voucher: forever }).code, 'voucher_other_phone');
  ctx.clock.advance(5 * MIN);
  assert.equal(a.view().hasBoundVoucher, true);
  assert.match(String(mePage(ctx, { customer: byId(ctx, 'customers', a.customer.id), view: a.view() })), /không cần nhập/);
  assert.equal(a.code().status, 'totp', 'không gõ mã: dùng mã vĩnh viễn đã gắn');
  assert.equal(get(ctx.db, 'SELECT uses FROM vouchers WHERE code = ?', forever).uses, 2);
  assert.equal(unbindVoucher(ctx, v.id), true);
  ctx.clock.advance(5 * MIN);
  assert.equal(b.code({ voucher: forever }).status, 'totp', 'gỡ gắn → người kế tiếp gắn vào');
  assert.equal(voidVoucher(ctx, v.id), true);
  ctx.clock.advance(5 * MIN);
  assert.equal(b.code().status, 'need_voucher', 'mã đã huỷ → không tự dùng nữa');
});

test('mã phiếu theo công cụ / quán / hạn dùng; dò mã sai 5 lần thì khoá 10 phút + báo vàng', () => {
  const { ctx, acct, guest, otherCafe } = setup();
  acct('chatgpt', 'gpt-a@kho.test', { password: 'Pw#1', totp: SECRET });
  const g = guest();
  g.claim('chatgpt');
  const [claudeOnly] = createBatch(ctx, { kind: 'once', count: 1, tools: ['claude'] }).codes;
  const [cafeB] = createBatch(ctx, { kind: 'once', count: 1, cafeId: otherCafe }).codes;
  const [soon] = createBatch(ctx, { kind: 'once', count: 1, expiresDays: 1 }).codes;
  const [ext] = createBatch(ctx, { kind: 'extend', count: 1, days: 1 }).codes;
  assert.equal(g.code({ voucher: claudeOnly }).code, 'voucher_wrong_tool');
  assert.equal(g.code({ voucher: cafeB }).code, 'voucher_wrong_cafe');
  assert.equal(g.code({ voucher: ext }).code, 'voucher_wrong_kind');
  ctx.clock.advance(DAY + MIN);
  makeTap(ctx, { card: get(ctx.db, "SELECT * FROM cards WHERE kind = 'qs' LIMIT 1"), deviceId: g.deviceId });
  // Slot hết 6h sáng → chuyển sang khách mới cho phần dò mã.
  const h = guest();
  acct('chatgpt', 'gpt-b@kho.test', { password: 'Pw#2', totp: SECRET });
  expireDueSlots(ctx);
  assert.equal(h.claim('chatgpt').status, 'active');
  assert.equal(h.code({ voucher: soon }).code, 'voucher_expired');
  for (let i = 0; i < 4; i++) assert.equal(h.code({ voucher: `ZZZZ-ZZZ${'23456789'[i]}` }).code, 'voucher_invalid');
  assert.equal(ctx.alerts('voucher_guessing').length, 0);
  assert.equal(h.code({ voucher: 'ZZZZ-ZZZZ' }).code, 'voucher_invalid');
  assert.equal(ctx.alerts('voucher_guessing').length, 1);
  const [good] = createBatch(ctx, { kind: 'once', count: 1 }).codes;
  assert.equal(h.code({ voucher: good }).code, 'voucher_locked', 'đang khoá thì mã đúng cũng chờ');
  ctx.clock.advance(11 * MIN);
  assert.equal(h.code({ voucher: good }).status, 'totp');
});

test('Claude (mã qua email): cần mã phiếu; tài khoản đang có người khác lấy mã → không trừ phiếu', () => {
  const { ctx, acct, guest } = setup();
  acct('claude', 'claude1@tiem.test');
  acct('claude', 'claude2@tiem.test');
  acct('claude', 'claude3@tiem.test'); // dự phòng
  const [p1, p2] = createBatch(ctx, { kind: 'once', count: 2, tools: ['claude'] }).codes;
  const a = guest();
  const b = guest();
  assert.equal(a.claim('claude').status, 'active');
  assert.equal(b.claim('claude').status, 'active');
  assert.equal(a.view().accountEmail, b.view().accountEmail, 'lấp đầy tài khoản trước');
  assert.equal(a.code().status, 'need_voucher');
  assert.equal(a.code({ voucher: p1 }).status, 'open');
  const busy = b.code({ voucher: p2 });
  assert.equal(busy.status, 'busy');
  assert.equal(get(ctx.db, 'SELECT uses FROM vouchers WHERE code = ?', p2).uses, 0, 'bận → phiếu còn nguyên');
  assert.equal(a.code().status, 'open', 'lượt của mình còn mở → không cần phiếu');
});

test('workspace theo thứ tự: khách nhận chỗ nhỏ nhất còn trống, thấy tên + link Project bot đã tạo', () => {
  const { ctx, acct, guest } = setup();
  const a = acct('chatgpt', 'gpt-a@kho.test', { password: 'Pw#1', totp: SECRET });
  run(ctx.db, "INSERT INTO workspaces(account_id, seat, name, url, updated_at) VALUES(?, 2, 'Slot 2', 'https://chatgpt.com/g/g-p-abc-slot-2/project', ?)", a.id, ctx.now());
  const gs = [guest(), guest(), guest()];
  for (const g of gs) g.claim('chatgpt');
  assert.deepEqual(gs.map((g) => g.view().workspace.name), ['Slot 1', 'Slot 2', 'Slot 3']);
  assert.equal(gs[1].view().workspace.url, 'https://chatgpt.com/g/g-p-abc-slot-2/project');
  const page = String(mePage(ctx, { customer: byId(ctx, 'customers', gs[1].customer.id), view: gs[1].view() }));
  assert.match(page, /Workspace của bạn: <b>Slot 2<\/b>/);
  assert.match(page, /href="https:\/\/chatgpt\.com\/g\/g-p-abc-slot-2\/project"/);
  assert.match(page, /Mã phiếu \(nhận ở quán\)/);
});

test('gia hạn: mã gia hạn +1 ngày; 6h sáng khách thường hết, bot vẫn làm mới tài khoản nhưng GIỮ Project của khách gia hạn', async () => {
  const { ctx, acct, guest } = setup(); // T0 = 20:00
  const a = acct('chatgpt', 'gpt-a@kho.test', { password: 'Pw#1', totp: SECRET });
  const srv = await startTestServer(ctx);
  try {
    const gs = [guest(), guest(), guest()];
    for (const g of gs) assert.equal(g.claim('chatgpt').status, 'active');
    const sixAm = T0 + 10 * HOUR;
    const [ext] = createBatch(ctx, { kind: 'extend', count: 1, days: 1 }).codes;
    const x = redeemExtension(ctx, { customer: byId(ctx, 'customers', gs[1].customer.id), deviceId: gs[1].deviceId, raw: ext });
    assert.equal(x.ok, true, JSON.stringify(x));
    assert.equal(gs[1].view().expiresAt, sixAm + DAY, 'tới 6h sáng ngày kia');
    assert.equal(gs[1].view().extendedDays, 1);
    assert.equal(gs[1].view().needVoucher, false, 'đã gia hạn → lấy mã không cần phiếu');
    assert.equal(redeemExtension(ctx, { customer: byId(ctx, 'customers', gs[0].customer.id), deviceId: gs[0].deviceId, raw: ext }).code, 'voucher_used');

    // 6h: 2 khách thường hết → việc làm mới (rotate) được tạo dù khách gia hạn còn dùng.
    ctx.clock.set(sixAm);
    await runJobs(ctx);
    assert.equal(gs[0].view().status, 'expired');
    assert.equal(gs[1].view().status, 'active');
    const task = get(ctx.db, "SELECT * FROM rotation_tasks WHERE account_id = ? AND kind = 'rotate' AND status = 'todo'", a.id);
    assert.ok(task, 'có việc làm mới');
    assert.equal(byId(ctx, 'accounts', a.id).status, 'needs_rotation');

    // Bot Canva (không gửi kinds) không nhận việc của ChatGPT.
    const bot = srv.client();
    assert.equal((await bot.post('/worker/tasks/next', { worker: 'canva-x' }, BOT)).json.task, null);
    const next = await bot.post('/worker/tasks/next', { worker: 'gpt-mac', kinds: ['rotate'] }, BOT);
    const t = next.json.task;
    assert.equal(t.kind, 'rotate');
    assert.equal(t.account.email, 'gpt-a@kho.test');
    assert.equal(t.workspaces.length, 8);
    assert.deepEqual(t.keep, [{ seat: 2, name: 'Slot 2' }]);
    assert.equal(t.deleteAllChats, false, 'giữ Project → không được "Delete all chats" (xoá cả chat trong Project)');
    assert.ok(!JSON.stringify(next.json).includes('Pw#1') && !JSON.stringify(next.json).includes(SECRET), 'việc không kèm mật khẩu / khoá 2FA');

    const done = await bot.post(`/worker/tasks/${t.id}/done`, { worker: 'gpt-mac', workspaces: [
      { seat: 1, name: 'Slot 1', url: 'https://chatgpt.com/g/g-p-111-slot-1/project' },
      { seat: 2, name: 'Slot 2', url: 'https://chatgpt.com/g/g-p-222-slot-2/project' },
      { seat: 3, name: 'Slot 3', url: 'https://evil.example/phish' },
      { seat: 99, name: 'Slot 99', url: 'https://chatgpt.com/x' },
    ] }, BOT);
    assert.equal(done.json.ok, true, done.text);
    assert.match(done.json.message, /giữ 1 chỗ/);
    assert.equal(byId(ctx, 'accounts', a.id).status, 'ready', 'tài khoản mở lại cho khách mới');
    assert.equal(get(ctx.db, 'SELECT url FROM workspaces WHERE account_id = ? AND seat = 3', a.id).url, null, 'link lạ không được lưu');
    assert.equal(get(ctx.db, 'SELECT COUNT(*) AS n FROM workspaces WHERE account_id = ?', a.id).n, 3);

    // Khách mới sáng nay: chỗ 1, 3, … (chỗ 2 giữ cho khách gia hạn).
    const n1 = guest();
    const n2 = guest();
    assert.equal(n1.claim('chatgpt').status, 'active');
    assert.equal(n2.claim('chatgpt').status, 'active');
    assert.deepEqual([n1.view().seat, n2.view().seat], [1, 3]);
    assert.equal(n1.view().workspace.url, 'https://chatgpt.com/g/g-p-111-slot-1/project');

    // Khách gia hạn bị đăng xuất → đăng nhập lại: không cần phiếu, không cần đang ở quán.
    ctx.clock.advance(3 * HOUR);
    const again = gs[1].code();
    assert.equal(again.status, 'totp', JSON.stringify(again));
    assert.equal(gs[1].view().codeRequestsLeft, 2 * ctx.settings().codeMaxRequests - 1, 'mỗi ngày gia hạn thêm lượt lấy mã');
  } finally { await srv.close(); }
});

test('gia hạn: không quá hạn tài khoản (Claude 7 ngày) và không quá maxExtendDays; xin gia hạn → chủ gia hạn ở trang Gia hạn', async () => {
  const { ctx, acct, guest } = setup();
  // Tài khoản Claude tạo gần 7 ngày trước: còn 9 giờ (hết trước 6h sáng) → khách hết cùng tài khoản, không gia hạn được.
  acct('claude', 'claude1@tiem.test', { createdAt: ctx.now() - 7 * DAY + 9 * HOUR });
  acct('claude', 'claude2@tiem.test');
  const g = guest();
  assert.equal(g.claim('claude').status, 'active');
  assert.equal(g.view().accountEmail, 'claude1@tiem.test', 'claude2 là dự phòng');
  assert.equal(g.view().expiresAt, ctx.now() + 9 * HOUR);
  assert.equal(extendSlot(ctx, g.view().slotId, { days: 3 }).code, 'cannot_extend');
  assert.equal(requestExtension(ctx, { customerId: g.customer.id, days: 3 }).code, 'cannot_extend');

  acct('chatgpt', 'gpt-a@kho.test', { password: 'Pw#1', totp: SECRET });
  const other = guest();
  assert.equal(other.claim('chatgpt').status, 'active');
  const slotId = other.view().slotId;
  const r = extendSlot(ctx, slotId, { days: 30 });
  assert.equal(r.ok, true);
  assert.equal(r.capped, true);
  assert.ok(byId(ctx, 'slots', slotId).expires_at <= ctx.now() + 8 * DAY, 'tối đa 7 ngày tính từ hôm nay');
  assert.equal(extendSlot(ctx, slotId, { days: 1 }).code, 'cannot_extend', 'đã tới mức tối đa');

  const srv = await startTestServer(ctx);
  try {
    const third = guest();
    acct('chatgpt', 'gpt-b@kho.test', { password: 'Pw#2', totp: SECRET });
    assert.equal(third.claim('chatgpt').status, 'active');
    const req = requestExtension(ctx, { customerId: third.customer.id, days: 1 });
    assert.equal(req.ok, true, JSON.stringify(req));
    assert.equal(requestExtension(ctx, { customerId: third.customer.id, days: 3 }).ok, true, 'xin lại → sửa số ngày, không tạo trùng');
    assert.equal(all(ctx.db, "SELECT * FROM extend_requests WHERE status = 'pending'").length, 1);
    assert.equal(ctx.alerts('extend_requested').length, 1);
    assert.match(String(mePage(ctx, { customer: byId(ctx, 'customers', third.customer.id), view: third.view() })), /<b>Gia hạn<\/b><small>nhắn Zalo<\/small>/, "gia hạn = nhắn Zalo");

    const admin = srv.client();
    const login = await admin.postForm('/admin/login', { password: ctx.config.adminPassword });
    assert.equal(login.status, 303, login.text);
    const page = await admin.get('/admin/gia-han');
    assert.match(page.text, /Yêu cầu đang chờ \(1\)/);
    const csrf = page.text.match(/name="_csrf" value="([^"]+)"/)[1];
    const tid = third.view().slotId;
    const before = byId(ctx, 'slots', tid).expires_at;
    assert.equal((await admin.postForm(`/admin/gia-han/${tid}`, { _csrf: csrf, days: '3' })).status, 303);
    assert.equal(byId(ctx, 'slots', tid).expires_at, before + 3 * DAY);
    assert.equal(get(ctx.db, 'SELECT status FROM extend_requests WHERE slot_id = ?', tid).status, 'done');
    assert.equal(third.view().extendRequest, null);
  } finally { await srv.close(); }
});

test('quản trị: tạo lô mã phiếu → trang in + CSV; huỷ mã; nhập kho ChatGPT có tick → chờ bot tạo Project', async () => {
  const { ctx, tool } = setup();
  const srv = await startTestServer(ctx);
  try {
    const admin = srv.client();
    await admin.postForm('/admin/login', { password: ctx.config.adminPassword });
    let page = await admin.get('/admin/vouchers');
    assert.equal(page.status, 200);
    assert.match(page.text, /ChatGPT Plus, Claude Pro/, 'trang nói rõ công cụ nào cần mã phiếu');
    const csrf = page.text.match(/name="_csrf" value="([^"]+)"/)[1];
    const made = await admin.postForm('/admin/vouchers', { _csrf: csrf, kind: 'once', count: '6', tool_chatgpt: '1', note: 'Quán A' });
    assert.equal(made.status, 303);
    const batch = get(ctx.db, 'SELECT batch FROM vouchers LIMIT 1').batch;
    assert.equal(get(ctx.db, 'SELECT COUNT(*) AS n FROM vouchers WHERE batch = ? AND tools = ?', batch, 'chatgpt').n, 6);
    const print = await admin.get(`/admin/vouchers/in?batch=${batch}`);
    assert.equal((print.text.match(/class="v"/g) || []).length, 6);
    assert.doesNotMatch(print.text, /kho\.test|Pw#/, 'phiếu in không lộ email / mật khẩu');
    const csv = await admin.get(`/admin/vouchers.csv?batch=${batch}`);
    assert.match(csv.headers.get('content-type'), /text\/csv/);
    assert.equal(csv.text.trim().split('\r\n').length, 7);
    const one = get(ctx.db, 'SELECT id FROM vouchers LIMIT 1').id;
    await admin.postForm(`/admin/vouchers/${one}/void`, { _csrf: csrf });
    assert.equal(byId(ctx, 'vouchers', one).status, 'void');

    await admin.postForm('/admin/accounts', { _csrf: csrf, tool_id: String(tool('chatgpt').id), setup: '1', lines: `moi@kho.test|Pw#9|${SECRET}|12` });
    const a = get(ctx.db, "SELECT * FROM accounts WHERE login_email = 'moi@kho.test'");
    assert.equal(a.max_holders, 8, 'ChatGPT tối đa 8 workspace');
    assert.equal(a.status, 'needs_rotation');
    assert.ok(get(ctx.db, "SELECT 1 FROM rotation_tasks WHERE account_id = ? AND kind = 'rotate' AND reason = 'setup'", a.id));
    const detail = await admin.get(`/admin/accounts/${a.id}`);
    assert.match(detail.text, /Workspace \(Project\) theo thứ tự/);
    assert.match(detail.text, /Đang chờ làm mới/);
    // Không chạy bot quá 10 phút → báo chủ làm tay.
    ctx.clock.advance(11 * MIN);
    await runJobs(ctx);
    assert.equal(ctx.alerts('worker_task_stuck').length, 1);
    assert.equal((await admin.get('/admin/live')).status, 200);
  } finally { await srv.close(); }
});

test('bot ChatGPT không làm mới khi còn khách thường đang dùng (việc tạo vì thu hồi giữa ngày chờ tới 6h)', async () => {
  const { ctx, acct, guest } = setup();
  const a = acct('chatgpt', 'gpt-a@kho.test', { password: 'Pw#1', totp: SECRET });
  const srv = await startTestServer(ctx);
  try {
    const g1 = guest();
    const g2 = guest();
    g1.claim('chatgpt');
    g2.claim('chatgpt');
    const { revokeSlot } = await import('../src/domain/claims.js');
    revokeSlot(ctx, g1.view().slotId, 'admin_revoked');
    assert.ok(get(ctx.db, "SELECT 1 FROM rotation_tasks WHERE account_id = ? AND status = 'todo'", a.id));
    const bot = srv.client();
    assert.equal((await bot.post('/worker/tasks/next', { worker: 'gpt', kinds: ['rotate'] }, BOT)).json.task, null, 'g2 còn dùng → bot chờ');
    ctx.clock.set(T0 + 10 * HOUR);
    await runJobs(ctx);
    const t = (await bot.post('/worker/tasks/next', { worker: 'gpt', kinds: ['rotate'] }, BOT)).json.task;
    assert.ok(t, '6h: g2 hết → bot nhận việc');
    assert.equal(t.deleteAllChats, true);
  } finally { await srv.close(); }
});

// ---------- Cách 2: chạm thẻ tự có phiếu + API phiếu cho trang quán QS ----------
const UA = { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1' };

async function guestHttp(ctx, srv, phone) {
  const { ticketFor } = await import('./helpers.js');
  const c = srv.client();
  c.tap = async () => assert.equal((await c.get(`/qs/quan-thu?t=${ticketFor(ctx, 'quan-thu')}`, UA)).status, 303);
  await c.tap();
  await c.post('/api/otp/send', { phone });
  const ok = await c.post('/api/otp/verify', { phone, code: ctx.otpSent.at(-1).code, consent: true });
  assert.equal(ok.json.ok, true, ok.text);
  return c;
}

test('chạm thẻ (vé QS) → tự có phiếu, bấm lấy mã không phải gõ; tối đa 2 phiếu / máy / ngày; phiếu giấy vẫn dùng song song', async () => {
  const { ctx, acct, tool } = setup();
  acct('chatgpt', 'gpt-a@kho.test', { password: 'Pw#1', totp: SECRET });
  const srv = await startTestServer(ctx);
  try {
    const c = await guestHttp(ctx, srv, '0912000001');
    assert.equal((await c.post('/api/claim', { toolId: tool('chatgpt').id })).json.status, 'active');
    assert.match((await c.get('/me', UA)).text, /đã có phiếu, bấm lấy mã là được/);
    const r1 = await c.post('/api/code/request', { kind: 'totp' });
    assert.equal(r1.json.status, 'totp', r1.text);
    assert.equal(get(ctx.db, "SELECT COUNT(*) AS n FROM vouchers WHERE device_id IS NOT NULL AND status = 'used'").n, 1);

    ctx.clock.advance(5 * MIN);
    assert.equal((await c.post('/api/code/request', { kind: 'totp' })).json.status, 'need_voucher', 'phiếu đã dùng → cần chạm lại');
    await c.tap();
    assert.equal((await c.post('/api/code/request', { kind: 'totp' })).json.status, 'totp', 'chạm lại → phiếu thứ 2');
    ctx.clock.advance(5 * MIN);
    await c.tap();
    const third = await c.post('/api/code/request', { kind: 'totp' });
    assert.equal(third.json.status, 'need_voucher', 'quá 2 phiếu tự động / ngày');
    assert.match(third.json.message, /phiếu giấy/);
    const [paper] = createBatch(ctx, { kind: 'once', count: 1 }).codes;
    assert.equal((await c.post('/api/code/request', { kind: 'totp', voucher: paper })).json.status, 'totp', 'phiếu giấy vẫn dùng được');

    // Mở lại đúng link cũ (bấm Back) → không cấp thêm phiếu; tắt tính năng (0) → không cấp.
    saveSetting(ctx.db, 'autoVoucherPerDay', 0);
    ctx.settings.invalidate();
    const before = get(ctx.db, 'SELECT COUNT(*) AS n FROM vouchers WHERE device_id IS NOT NULL').n;
    await c.tap();
    assert.equal(get(ctx.db, 'SELECT COUNT(*) AS n FROM vouchers WHERE device_id IS NOT NULL').n, before);
  } finally { await srv.close(); }
});

test('API phiếu cho QS: đúng chữ ký → mã dùng được; sai chữ ký / giờ lệch / nonce lặp → 401; quán lạ 404; quá giới hạn 429', async () => {
  const { ctx, acct, tool } = setup({ qsVoucherPerCafeDay: 2 });
  acct('chatgpt', 'gpt-a@kho.test', { password: 'Pw#1', totp: SECRET });
  const { hmac } = await import('../src/lib/crypto.js');
  const srv = await startTestServer(ctx);
  try {
    const qs = srv.client();
    let n = 0;
    const call = (body, key = ctx.config.qsTicketKey) => {
      const raw = JSON.stringify({ ts: Math.floor(ctx.now() / 1000), nonce: `nonce-qs-${++n}-xyz`, ...body });
      return qs.post('/hooks/qs/phieu', JSON.parse(raw), { 'x-tbq-signature': `sha256=${hmac(key, raw)}` });
    };
    assert.equal((await call({ shop: 'quan-thu' }, 'khoa-sai')).status, 401);
    assert.equal((await call({ shop: 'quan-thu', ts: Math.floor(ctx.now() / 1000) - 600 })).status, 401, 'giờ lệch 10 phút');
    const replay = JSON.stringify({ shop: 'quan-thu', ts: Math.floor(ctx.now() / 1000), nonce: 'nonce-lap-lai-1' });
    const sig = { 'x-tbq-signature': `sha256=${hmac(ctx.config.qsTicketKey, replay)}` };
    assert.equal((await qs.post('/hooks/qs/phieu', JSON.parse(replay), sig)).status, 200);
    assert.equal((await qs.post('/hooks/qs/phieu', JSON.parse(replay), sig)).status, 401, 'nonce lặp');
    assert.equal((await call({ shop: 'khong-co' })).status, 404);
    const ok = await call({ shop: 'quan-thu' });
    assert.equal(ok.status, 200, ok.text);
    assert.match(ok.json.code, /^[2-9A-Z]{4}-[2-9A-Z]{4}$/);
    assert.deepEqual(ok.json.tools.sort(), ['chatgpt', 'claude']);
    assert.equal((await call({ shop: 'quan-thu' })).status, 429, 'quá 2 phiếu / quán / ngày');
    assert.equal(ctx.alerts('qs_api_limit').length, 1);

    // Mã QS cấp dùng được cho khách nhận slot ở đúng quán đó.
    const c = await guestHttp(ctx, srv, '0912000002');
    assert.equal((await c.post('/api/claim', { toolId: tool('chatgpt').id })).json.status, 'active');
    ctx.clock.advance(MIN);
    await c.post('/api/code/request', { kind: 'totp' }); // dùng phiếu tự động của lần chạm
    ctx.clock.advance(5 * MIN);
    const r = await c.post('/api/code/request', { kind: 'totp', voucher: ok.json.code });
    assert.equal(r.json.status, 'totp', r.text);
  } finally { await srv.close(); }
});
