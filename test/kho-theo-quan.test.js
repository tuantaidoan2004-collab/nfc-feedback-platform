// Kho riêng từng quán (chủ chọn 08/10/2026, "làm thêm kho cho Orenchi"): tài khoản gắn quán chỉ giao cho khách ở quán đó;
// quán dùng kho riêng trước, hết thì lấy kho chung; không bao giờ lấy kho của quán khác.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestCtx, seed, makeCustomer, makeDevice, makeTap, makeNfcCard, startTestServer, byId } from './helpers.js';
import { startClaim } from '../src/domain/claims.js';
import { toolAvailability } from '../src/domain/quota.js';
import { addAccounts, parseAccountLine, updateAccount, stockSummary } from '../src/domain/stock.js';
import { run, get, all } from '../src/db/index.js';
import { hmac } from '../src/lib/crypto.js';

function setup() {
  const ctx = createTestCtx();
  const data = seed(ctx); // quán "Cà phê Test 24h" + capcut1@kho.test ở kho chung
  const orenchiId = run(ctx.db, `INSERT INTO cafes(name, qs_slug, display_token, code_secret, presence_mode, daily_quota, created_at)
    VALUES('Orenchi', 'orenchi', 'disp-orenchi', 'secret-orenchi', 'none', 20, ?)`, ctx.now()).lastInsertRowid;
  const orenchi = byId(ctx, 'cafes', orenchiId);
  const card2 = makeNfcCard(ctx, orenchi);
  const cc = data.tools.capcut;
  const add = (emails, cafeId) => addAccounts(ctx, { tool: cc, items: emails.map((e) => parseAccountLine(cc, `${e}|Secret#123|1`)), by: 'test', cafeId });
  let seq = 0;
  // Khách mới ở quán (thẻ của quán đó) nhận CapCut → {status, code, accountEmail}
  const claimAt = (card) => {
    const c = makeCustomer(ctx, `khach${++seq}@x.vn`);
    const dev = `device-kho-${seq}-aaaaaaaaaaaa`;
    makeDevice(ctx, dev, c.id);
    makeTap(ctx, { card, deviceId: dev, ip: `10.0.0.${seq}` });
    const r = startClaim(ctx, { customer: byId(ctx, 'customers', c.id), deviceId: dev, ip: `10.0.0.${seq}`, toolId: cc.id });
    const slot = r.slotId ? byId(ctx, 'slots', r.slotId) : null;
    return { ...r, accountEmail: slot?.account_id ? byId(ctx, 'accounts', slot.account_id).login_email : null };
  };
  const free = (cafeId) => toolAvailability(ctx, null, cafeId).find((x) => x.tool.id === cc.id).free;
  return { ctx, ...data, orenchi, card2, add, claimAt, free };
}

test('kho riêng: Orenchi dùng kho riêng trước rồi tới kho chung; quán khác không đụng kho Orenchi', () => {
  const { ctx, card, card2, orenchi, add, claimAt, free } = setup();
  assert.equal(add(['o1@kho.test', 'o2@kho.test'], orenchi.id).added, 2);
  assert.equal(get(ctx.db, "SELECT cafe_id FROM accounts WHERE login_email = 'o1@kho.test'").cafe_id, orenchi.id);

  // Đếm: Orenchi thấy 2 riêng + 1 chung; quán test chỉ thấy 1 chung; cả hệ thống 3.
  assert.equal(free(orenchi.id), 3);
  assert.equal(free(card.cafe_id), 1);
  assert.equal(free(null), 3);

  // Khách ở Orenchi: lấy kho riêng trước.
  assert.equal(claimAt(card2).accountEmail, 'o1@kho.test');
  assert.equal(claimAt(card2).accountEmail, 'o2@kho.test');
  // Quán test: lấy kho chung, không bao giờ lấy kho Orenchi.
  add(['o3@kho.test'], orenchi.id);
  assert.equal(claimAt(card).accountEmail, 'capcut1@kho.test');
  // Kho chung hết → quán test "Tạm hết" dù Orenchi còn hàng.
  const r = claimAt(card);
  assert.equal(r.code, 'no_account');
  assert.equal(free(card.cafe_id), 0);
  assert.equal(free(orenchi.id), 1);
  // Báo đỏ riêng cho quán hết hàng (quán khác vẫn còn).
  assert.equal(all(ctx.db, "SELECT * FROM events WHERE type = 'tool_sold_out' AND severity = 'red' AND cafe_id = ?", card.cafe_id).length, 1, 'báo hết ở quán test');
  assert.equal(all(ctx.db, "SELECT * FROM events WHERE type = 'tool_sold_out' AND cafe_id IS NULL").length, 0, 'cả hệ thống còn hàng → không báo hết kho chung');
  assert.equal(claimAt(card2).accountEmail, 'o3@kho.test');
});

test('kho riêng: Orenchi hết kho riêng thì lấy kho chung', () => {
  const { orenchi, add, claimAt, card2 } = setup();
  add(['o1@kho.test'], orenchi.id);
  assert.equal(claimAt(card2).accountEmail, 'o1@kho.test');
  assert.equal(claimAt(card2).accountEmail, 'capcut1@kho.test');
  assert.equal(claimAt(card2).code, 'no_account');
});

test('chuyển kho: updateAccount cafeId; stockSummary chia theo kho', () => {
  const { ctx, orenchi, tools, accounts, free, card } = setup();
  assert.equal(updateAccount(ctx, accounts.capcut1.id, { cafeId: orenchi.id }, 'test').ok, true);
  assert.equal(free(card.cafe_id), 0);
  assert.equal(free(orenchi.id), 1);
  assert.equal(updateAccount(ctx, accounts.capcut1.id, { cafeId: 9999 }, 'test').code, 'cafe_unknown');
  const kho = stockSummary(ctx).find((t) => t.tool === tools.capcut.slug).kho;
  assert.deepEqual(kho.map((k) => [k.name, k.free]), [['Orenchi', 1]]);
  assert.equal(updateAccount(ctx, accounts.capcut1.id, { cafeId: null }, 'test').ok, true);
  assert.equal(free(card.cafe_id), 1);
});

test('quản trị: nhập vào kho Orenchi, lọc theo kho, sửa kho, chuyển kho theo nhãn, Tổng quan báo quán hết hàng', async () => {
  const { ctx, orenchi, tools, accounts } = setup();
  const srv = await startTestServer(ctx);
  try {
    const admin = srv.client();
    assert.equal((await admin.postForm('/admin/login', { password: ctx.config.adminPassword })).status, 303);
    let page = await admin.get('/admin/accounts');
    const csrf = page.text.match(/name="_csrf" value="([^"]+)"/)[1];
    assert.match(page.text, /<option value="\d+">Kho riêng: Orenchi<\/option>/);
    const msg = (r) => new URL(r.headers.get('location'), 'http://x').searchParams.get('msg');
    const loc = (r) => r.headers.get('location');

    let r = await admin.postForm('/admin/accounts', { _csrf: csrf, tool_id: String(tools.capcut.id), kho: String(orenchi.id), label: 'Orenchi', lines: 'o1@kho.test|Secret#1\no2@kho.test|Secret#2' });
    assert.match(msg(r), /Đã thêm 2 tài khoản vào kho riêng Orenchi/);
    assert.equal(all(ctx.db, 'SELECT * FROM accounts WHERE cafe_id = ?', orenchi.id).length, 2);
    // Lỗi + "#them": báo vẫn hiện (msg nằm trước #).
    r = await admin.postForm('/admin/accounts', { _csrf: csrf, tool_id: String(tools.capcut.id), kho: '9999', lines: 'x@kho.test|a' });
    assert.match(loc(r), /\?tool=\d+&msg=[^#]+#them$/);

    page = await admin.get(`/admin/accounts?kho=${orenchi.id}`);
    assert.match(page.text, /o1@kho\.test/);
    assert.doesNotMatch(page.text, /capcut1@kho\.test/);
    assert.match(page.text, /Kho Orenchi/);
    // Ô kho (thay dòng "kho: chung 1 · Orenchi 2"): mỗi kho 1 ô, ô đang lọc sáng, ghi lượt trống theo món + kho cho ai.
    assert.match(page.text, /class="stat on"[^]*?Kho Orenchi<\/span><b class="stat-v">2<\/b>[^]*?CapCut Pro: 2 lượt trống[^]*?Chỉ khách ở Orenchi/);
    assert.match(page.text, /Kho chung<\/span><b class="stat-v">3<\/b>[^]*?CapCut Pro: 1 lượt trống/);
    assert.match(page.text, /xem mọi kho/);
    page = await admin.get('/admin/accounts');
    assert.match(page.text, /<h3 class="kho-h">Kho chung[^]*?<h3 class="kho-h">Kho Orenchi/); // mọi kho: bảng chia theo kho
    page = await admin.get('/admin/accounts?kho=chung');
    assert.match(page.text, /capcut1@kho\.test/);
    assert.doesNotMatch(page.text, /o1@kho\.test/);

    // Sửa 1 tài khoản: chuyển sang kho Orenchi.
    r = await admin.postForm(`/admin/accounts/${accounts.capcut1.id}`, { _csrf: csrf, label: 'Bamos', max_holders: '1', kho: String(orenchi.id) });
    assert.match(msg(r), /Đã lưu/);
    assert.equal(byId(ctx, 'accounts', accounts.capcut1.id).cafe_id, orenchi.id);
    page = await admin.get('/admin');
    assert.match(page.text, /món hết ở quán \(kho riêng \+ kho chung\): CapCut Pro \(Cà phê Test 24h\)/);

    // Chuyển theo nhãn: cả nhóm "Orenchi" về kho chung.
    r = await admin.postForm('/admin/accounts/chuyen-kho', { _csrf: csrf, label: 'Orenchi', kho: 'chung' });
    assert.match(msg(r), /Đã chuyển 2 tài khoản nhãn "Orenchi" sang kho chung/);
    assert.equal(all(ctx.db, 'SELECT * FROM accounts WHERE cafe_id IS NULL AND label = ?', 'Orenchi').length, 2);
    r = await admin.postForm('/admin/accounts/chuyen-kho', { _csrf: csrf, label: 'Orenchi', kho: 'chung' });
    assert.match(msg(r), /đã ở kho chung/);
    page = await admin.get('/admin/events');
    assert.match(page.text, /2 tài khoản nhãn (&quot;|")Orenchi(&quot;|") · → Kho chung/);
  } finally { await srv.close(); }
});

let n = 0;
test('API kho QS: add / list / update với shop', async () => {
  const { ctx, orenchi } = setup();
  const srv = await startTestServer(ctx);
  try {
    const client = srv.client();
    const kho = (body) => {
      const raw = JSON.stringify({ ts: Math.floor(ctx.now() / 1000), nonce: `nonce-khoq-${++n}-xyzw`, ...body });
      return client.post('/hooks/qs/kho', JSON.parse(raw), { 'x-tbq-signature': `sha256=${hmac(ctx.config.qsKhoKey, raw)}` });
    };
    let r = await kho({ action: 'add', tool: 'capcut', shop: 'orenchi', lines: ['q1@kho.test|Secret#1'] });
    assert.equal(r.status, 201, r.text);
    assert.equal(r.json.shop, 'orenchi');
    assert.equal(get(ctx.db, "SELECT cafe_id FROM accounts WHERE login_email = 'q1@kho.test'").cafe_id, orenchi.id);
    assert.equal((await kho({ action: 'add', tool: 'capcut', shop: 'khong-co', lines: ['q2@kho.test|x'] })).status, 404);

    r = await kho({ action: 'list', shop: 'orenchi' });
    assert.deepEqual(r.json.accounts.map((a) => [a.email, a.kho.shop]), [['q1@kho.test', 'orenchi']]);
    r = await kho({ action: 'list', shop: 'chung' });
    assert.ok(r.json.accounts.every((a) => a.kho === null));

    r = await kho({ action: 'update', email: 'q1@kho.test', shop: null });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.json.account.kho, null);
    // Trang quán QS: khối công cụ đếm theo kho của quán.
    const s = (await kho({ action: 'summary' })).json.tools.find((t) => t.tool === 'capcut');
    assert.equal(s.free, 2);
  } finally { await srv.close(); }
});
