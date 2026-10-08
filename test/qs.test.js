// Khách đến từ khối "Công cụ làm việc" (khúc B) trên trang quán của Quite Sensational (QS), mang theo vé có chữ ký.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createTestCtx, seed, makeCustomer, makeDevice, makeTap, startTestServer, byId, ticketFor } from './helpers.js';
import { startClaim } from '../src/domain/claims.js';
import { openDb, run, get, all } from '../src/db/index.js';
import { saveSetting } from '../src/lib/settings.js';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1';
const ZALO_INAPP = 'Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36 Zalo android/12100733 ZaloTheme/light ZaloLanguage/vi';
const UA = { 'user-agent': IPHONE };

async function setup() {
  const ctx = createTestCtx();
  const data = seed(ctx);
  run(ctx.db, "UPDATE cafes SET qs_slug = 'cafe-test' WHERE id = ?", data.cafe.id);
  const srv = await startTestServer(ctx);
  return { ctx, ...data, srv, c: srv.client() };
}

const taps = (ctx) => get(ctx.db, 'SELECT COUNT(*) AS n FROM taps').n;

async function login(ctx, c, phone = '0912345678') {
  assert.equal((await c.post('/api/otp/send', { phone })).json.ok, true);
  const r = await c.post('/api/otp/verify', { phone, code: ctx.otpSent.at(-1).code, consent: true });
  assert.equal(r.json.ok, true, r.text);
}

test('vé từ trang quán: đúng quán → link sạch → đăng nhập → nhận slot (4G, không cần gì thêm)', async () => {
  const { ctx, srv, c, cafe, tools } = await setup();
  try {
    const t = ticketFor(ctx, 'cafe-test');
    const go = await c.get(`/qs/CAFE-TEST?t=${t}`, UA);
    assert.equal(go.status, 303, 'không phân biệt hoa thường');
    assert.equal(go.headers.get('location'), '/qs/cafe-test', 'bỏ vé khỏi thanh địa chỉ');
    const page = await c.get('/qs/cafe-test', UA);
    assert.match(page.text, /Cà phê Test 24h/);
    assert.match(page.text, /Công cụ làm việc miễn phí/);
    assert.match(page.text, /Gửi mã qua SMS/);
    assert.doesNotMatch(page.text, /Từ trang quán \(Quite Sensational\)/, 'không hiện tên lối vào ẩn cho khách');
    assert.equal(taps(ctx), 1);
    // Mở lại cùng vé trên cùng máy (bấm Back) không ghi thêm lượt.
    assert.equal((await c.get(`/qs/cafe-test?t=${t}`, UA)).status, 303);
    assert.equal(taps(ctx), 1);

    await login(ctx, c);
    assert.match((await c.get('/qs/cafe-test', UA)).text, /Hôm nay bạn cần món nào/);
    const ok = await c.post('/api/claim', { toolId: tools.chatgpt.id });
    assert.equal(ok.json.status, 'active', ok.text);
    const slot = get(ctx.db, 'SELECT s.cafe_id, k.kind FROM slots s JOIN cards k ON k.id = s.card_id');
    assert.deepEqual({ ...slot }, { cafe_id: cafe.id, kind: 'qs' });
  } finally {
    await srv.close();
  }
});

test('chạm thẻ lần nữa khi lượt vào cũ còn hạn → tính lại 30 phút từ lần chạm mới', async () => {
  const { ctx, srv, c, tools } = await setup();
  try {
    assert.equal((await c.get(`/qs/cafe-test?t=${ticketFor(ctx, 'cafe-test')}`, UA)).status, 303);
    await login(ctx, c);
    ctx.clock.advance(25 * 60_000);
    assert.equal((await c.get(`/qs/cafe-test?t=${ticketFor(ctx, 'cafe-test')}`, UA)).status, 303);
    assert.equal(taps(ctx), 2, 'vé mới ghi lượt vào mới');
    ctx.clock.advance(10 * 60_000);
    const ok = await c.post('/api/claim', { toolId: tools.chatgpt.id });
    assert.equal(ok.json.status, 'active', '35 phút sau lần chạm đầu, 10 phút sau lần chạm lại: vẫn nhận được');
  } finally {
    await srv.close();
  }
});

test('vé của quán A không mở được quán B; mã quán QS lạ báo chủ 1 lần/giờ; /qs trống không còn', async () => {
  const { ctx, srv, c } = await setup();
  try {
    run(ctx.db, "INSERT INTO cafes(name, display_token, code_secret, qs_slug, created_at) VALUES('Quán Khác', 'd2', 's2', 'quan-khac', ?)", ctx.now());
    assert.match((await c.get(`/qs/quan-khac?t=${ticketFor(ctx, 'cafe-test')}`, UA)).text, /không hợp lệ/);
    for (let i = 0; i < 2; i++) assert.match((await c.get('/qs/quan-moi-chua-gan', UA)).text, /chưa mở chương trình ở quán này/);
    assert.equal(all(ctx.db, "SELECT * FROM events WHERE type = 'qs_shop_unmapped'").length, 1);
    assert.equal((await c.get('/qs', UA)).status, 404);
    assert.equal(taps(ctx), 0);
  } finally {
    await srv.close();
  }
});

test('quán tạm dừng / ngoài giờ: không nhận, không ghi lượt vào hợp lệ', async () => {
  const { ctx, srv, c, cafe } = await setup();
  try {
    run(ctx.db, "UPDATE cafes SET status = 'paused' WHERE id = ?", cafe.id);
    await c.get(`/qs/cafe-test?t=${ticketFor(ctx, 'cafe-test')}`, UA);
    assert.match((await c.get('/qs/cafe-test', UA)).text, /tạm dừng/);
    assert.equal(get(ctx.db, "SELECT COUNT(*) AS n FROM taps WHERE verdict = 'ok'").n, 0);
  } finally {
    await srv.close();
  }
});

test('trình duyệt trong app Zalo (khách quét QR bằng Zalo) được tính; máy xem trước link thì không', async () => {
  const { ctx, srv, c } = await setup();
  try {
    const t = ticketFor(ctx, 'cafe-test');
    await c.get(`/qs/cafe-test?t=${t}`, { 'user-agent': 'Zalo' });
    await c.get(`/qs/cafe-test?t=${t}`, { 'user-agent': 'facebookexternalhit/1.1' });
    await c.get(`/qs/cafe-test?t=${t}`, { 'user-agent': 'TelegramBot (like TwitterBot)' });
    assert.equal(taps(ctx), 0);
    await c.get(`/qs/cafe-test?t=${t}`, { 'user-agent': ZALO_INAPP });
    assert.equal(taps(ctx), 1);
  } finally {
    await srv.close();
  }
});

test('lối vào QS dùng chung cả quán: nhiều khách cùng giờ đều nhận được (chỉ dính suất / quán / ngày)', () => {
  const ctx = createTestCtx();
  const { card, tools } = seed(ctx);
  for (let i = 3; i <= 10; i++) {
    run(ctx.db, "INSERT INTO accounts(tool_id, login_email, max_holders, status, created_at) VALUES(?, ?, 1, 'ready', ?)", tools.chatgpt.id, `gpt${i}@kho.test`, ctx.now());
  }
  for (let i = 0; i < 8; i++) {
    const customer = makeCustomer(ctx, `8491000000${i}`);
    const deviceId = `device-qs-${String(i).padStart(10, '0')}`;
    makeDevice(ctx, deviceId, customer.id);
    makeTap(ctx, { card, deviceId });
    const r = startClaim(ctx, { customer, deviceId, ip: '1.2.3.4', toolId: tools.chatgpt.id });
    assert.equal(r.status, 'active', `khách ${i + 1}: ${JSON.stringify(r)}`);
  }
  assert.equal(byId(ctx, 'cards', card.id).status, 'active');
});

test('luật Google (docs/google-policy.md của QS): trang khách không có chữ nối quà với đánh giá', async () => {
  const { ctx, srv, c } = await setup();
  try {
    await c.get(`/qs/cafe-test?t=${ticketFor(ctx, 'cafe-test')}`, UA);
    const pages = ['/', '/qs/cafe-test', '/qs/khong-co', '/me', '/privacy'];
    for (const p of pages) {
      const r = await c.get(p, UA);
      assert.equal(r.status, 200, p);
      assert.doesNotMatch(r.text, /đánh giá|review|rating|5 sao|năm sao|google/i, p);
    }
    // "Về chúng tôi" mở thẳng web tiembanquyen.com (Cài đặt → aboutUrl); link hỏng → trang giới thiệu cũ của TBQ.
    const about = await c.get('/ve-chung-toi?shop=cafe-test', UA);
    assert.equal(about.status, 302);
    assert.equal(about.headers.get('location'), 'https://tiembanquyen.com');
    assert.throws(() => saveSetting(ctx.db, 'aboutUrl', 'javascript:alert(1)'), /https/);
    run(ctx.db, "INSERT INTO settings(key, value) VALUES('aboutUrl', '\"http://khong-an-toan.test\"') ON CONFLICT(key) DO UPDATE SET value = excluded.value");
    ctx.settings.invalidate();
    const fallback = await c.get('/ve-chung-toi?shop=cafe-test', UA);
    assert.equal(fallback.status, 200);
    assert.doesNotMatch(fallback.text, /đánh giá|review|rating|5 sao|năm sao|google/i);
  } finally {
    await srv.close();
  }
});

test('quản trị: điền mã quán QS (không bắt buộc, kiểm định dạng, không trùng; để trống = bỏ gắn)', async () => {
  const { ctx, srv, c, cafe } = await setup();
  try {
    await c.postForm('/admin/login', { password: ctx.config.adminPassword });
    const csrf = get(ctx.db, 'SELECT csrf FROM admin_sessions').csrf;
    const base = { _csrf: csrf, name: 'Cà phê Test 24h', daily_quota: '20' };
    const other = run(ctx.db, "INSERT INTO cafes(name, display_token, code_secret, qs_slug, created_at) VALUES('Quán B', 'd2', 's2', 'quan-b', ?)", ctx.now()).lastInsertRowid;
    const bad = await c.postForm(`/admin/cafes/${cafe.id}`, { ...base, qs_slug: 'Có dấu!' });
    assert.match(bad.text, /Chưa lưu: Mã quán QS chỉ gồm chữ thường/, 'lỗi hiện ngay trên form');
    const dup = await c.postForm(`/admin/cafes/${cafe.id}`, { ...base, qs_slug: 'QUAN-B' });
    assert.match(dup.text, /đang gắn với quán Quán B/);
    assert.match(dup.text, /name="qs_slug" value="QUAN-B"/, 'giữ chữ vừa gõ');
    await c.postForm(`/admin/cafes/${cafe.id}`, { ...base, qs_slug: 'Cafe-Moi' });
    assert.equal(byId(ctx, 'cafes', cafe.id).qs_slug, 'cafe-moi');
    const empty = await c.postForm(`/admin/cafes/${other}`, { ...base, name: 'Quán B', qs_slug: '' });
    assert.match(decodeURIComponent(empty.headers.get('location')), /Đã lưu/);
    assert.equal(byId(ctx, 'cafes', other).qs_slug, null, 'để trống = quán thôi dùng QS (dùng thẻ NFC riêng)');
    assert.match((await c.get(`/admin/cafes/${other}`)).text, /chưa dùng QS/);

    const pageText = (await c.get(`/admin/cafes/${cafe.id}`)).text;
    assert.match(pageText, /Quite Sensational/);
    assert.match(pageText, /\/qs\/cafe-moi/);
  } finally {
    await srv.close();
  }
});

test('database bản cũ (chưa có cột QS) tự nâng cấp khi khởi động', () => {
  const path = join(tmpdir(), `tbq-old-${process.pid}.sqlite`);
  try {
    const oldSchema = readFileSync(new URL('../src/db/schema.sql', import.meta.url), 'utf8')
      .split('\n').filter((l) => !/^\s+(qs_slug|kind) TEXT/.test(l)).join('\n');
    const old = new DatabaseSync(path);
    old.exec(oldSchema);
    assert.ok(!old.prepare('PRAGMA table_info(cafes)').all().some((c) => c.name === 'qs_slug'));
    old.exec("INSERT INTO cafes(name, display_token, code_secret, created_at) VALUES('Q', 'd', 's', 1); INSERT INTO cards(cafe_id, token, created_at) VALUES(1, 't', 1);");
    old.close();
    const db = openDb(path);
    assert.ok(db.prepare('PRAGMA table_info(cafes)').all().some((c) => c.name === 'qs_slug'));
    assert.equal(db.prepare('SELECT kind FROM cards').get().kind, 'nfc', 'thẻ cũ thành thẻ NFC riêng');
    db.close();
    openDb(path).close();
  } finally {
    for (const ext of ['', '-wal', '-shm']) rmSync(path + ext, { force: true });
  }
});
