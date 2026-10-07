// API kho cho QS (/hooks/qs/kho, docs/phoi-hop-voi-QS.md mục 11): Tài thêm / sửa / xem tài khoản trong kho dùng chung.
// + lệnh status của /hooks/qs/quan trả "công cụ nào còn nhận được" cho khối trên trang quán.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestCtx, startTestServer, seed } from './helpers.js';
import { get, run } from '../src/db/index.js';
import { hmac, decrypt } from '../src/lib/crypto.js';
import { loadConfig, validateConfig } from '../src/config.js';

let n = 0;
function signer(ctx, client, path = '/hooks/qs/kho') {
  return (body, key = ctx.config.qsKhoKey) => {
    const raw = JSON.stringify({ ts: Math.floor(ctx.now() / 1000), nonce: `nonce-kho-${++n}-xyzw`, ...body });
    return client.post(path, JSON.parse(raw), { 'x-tbq-signature': `sha256=${hmac(key, raw)}` });
  };
}

test('API kho: sai khoá / khoá vé → 401; tắt khoá → 503; summary đếm kho', async () => {
  const ctx = createTestCtx();
  seed(ctx);
  const srv = await startTestServer(ctx);
  try {
    const kho = signer(ctx, srv.client());
    assert.equal((await kho({ action: 'summary' }, 'khoa-sai-hoan-toan')).status, 401);
    assert.equal((await kho({ action: 'summary' }, ctx.config.qsTicketKey)).status, 401, 'khoá vé không mở được kho');
    assert.equal(ctx.alerts('qs_api_unauthorized').length, 2, 'chủ thấy có người gõ cửa kho');

    const s = await kho({ action: 'summary' });
    assert.equal(s.status, 200, s.text);
    const gpt = s.json.tools.find((t) => t.tool === 'chatgpt');
    assert.equal(gpt.accounts.ready, 2);
    assert.equal(gpt.free, 2);
    assert.ok(!JSON.stringify(s.json).includes('Secret#123'));

    assert.equal((await kho({ action: 'xoa' })).status, 400);
    ctx.config.qsKhoKey = '';
    assert.equal((await kho({ action: 'summary' }, 'x')).status, 503);
  } finally { await srv.close(); }
});

test('API kho: add (accounts / lines / dryRun / trùng / lỗi từng dòng), list không lộ mật khẩu', async () => {
  const ctx = createTestCtx();
  seed(ctx);
  const srv = await startTestServer(ctx);
  try {
    const kho = signer(ctx, srv.client());
    assert.equal((await kho({ action: 'add', tool: 'khong-co', accounts: [] })).status, 404);

    const dry = await kho({ action: 'add', tool: 'capcut', dryRun: true, accounts: [{ email: 'cc2@kho.test', password: 'Pw-2' }] });
    assert.equal(dry.json.added, 1);
    assert.equal(get(ctx.db, "SELECT COUNT(*) AS n FROM accounts WHERE login_email = 'cc2@kho.test'").n, 0, 'dryRun không lưu');

    const add = await kho({ action: 'add', tool: 'capcut', label: 'Lô 08/10', accounts: [
      { email: 'cc2@kho.test', password: 'Pw-2', holders: 2 },
      { email: 'CC3@kho.test', password: 'Pw-3' },
      { email: 'capcut1@kho.test', password: 'x' },   // đã có
      { email: 'cc4@kho.test' },                       // thiếu mật khẩu
      { email: 'cc2@kho.test', password: 'Pw-2' },    // trùng trong cùng lần gửi
    ] });
    assert.equal(add.status, 201, add.text);
    assert.equal(add.json.added, 2);
    assert.deepEqual(add.json.skipped.map((x) => x.code), ['exists', 'no_password', 'exists']);
    const cc2 = get(ctx.db, "SELECT * FROM accounts WHERE login_email = 'cc2@kho.test'");
    assert.equal(decrypt(cc2.password_enc, ctx.config.dataKey), 'Pw-2');
    assert.equal(cc2.max_holders, 2);
    assert.equal(cc2.label, 'Lô 08/10');
    assert.ok(get(ctx.db, "SELECT 1 FROM accounts WHERE login_email = 'cc3@kho.test'"), 'email lưu chữ thường');

    // Dòng chép từ Google Sheet (Tab) — giống ô nhập ở trang quản trị.
    const lines = await kho({ action: 'add', tool: 'chatgpt', lines: ['gpt3@kho.test\t8', 'khong-phai-email'] });
    assert.equal(lines.json.added, 1);
    assert.equal(lines.json.skipped[0].code, 'bad_email');
    assert.equal(get(ctx.db, "SELECT max_holders FROM accounts WHERE login_email = 'gpt3@kho.test'").max_holders, 8);

    const list = await kho({ action: 'list', tool: 'capcut' });
    assert.equal(list.json.accounts.length, 3);
    assert.ok(list.json.accounts.every((a) => a.hasPassword && !('password' in a) && !('password_enc' in a)));
    assert.ok(!list.text.includes('Pw-2') && !list.text.includes('Secret#123'), 'không lộ mật khẩu');
    assert.equal((await kho({ action: 'get', email: 'CC2@kho.test' })).json.account.maxHolders, 2);
    assert.equal((await kho({ action: 'list', status: 'xyz' })).status, 400);
    assert.ok(ctx.alerts().every((e) => e.type !== 'qs_api_unauthorized'));
  } finally { await srv.close(); }
});

test('API kho: update — đổi mật khẩu, ngừng, mở lại, xong việc đổi mật khẩu, cách ly; lỗi thì không đổi gì', async () => {
  const ctx = createTestCtx();
  const { accounts } = seed(ctx);
  const srv = await startTestServer(ctx);
  try {
    const kho = signer(ctx, srv.client());
    const id = accounts.capcut1.id;
    assert.equal((await kho({ action: 'update', id: 9999, label: 'x' })).status, 404);
    assert.equal((await kho({ action: 'update', id })).status, 400);

    // Lỗi một ô → không ô nào đổi.
    const bad = await kho({ action: 'update', id, label: 'mới', holders: 0 });
    assert.equal(bad.json.code, 'bad_holders');
    assert.equal(get(ctx.db, 'SELECT label FROM accounts WHERE id = ?', id).label, null);
    assert.equal((await kho({ action: 'update', id: accounts.gpt1.id, password: 'abc' })).json.code, 'no_password_tool');

    const up = await kho({ action: 'update', id, label: 'Lô A', holders: 3, password: 'Moi#456' });
    assert.equal(up.status, 200, up.text);
    assert.equal(up.json.account.maxHolders, 3);
    assert.equal(decrypt(get(ctx.db, 'SELECT password_enc FROM accounts WHERE id = ?', id).password_enc, ctx.config.dataKey), 'Moi#456');
    assert.ok(!up.text.includes('Moi#456'));

    assert.equal((await kho({ action: 'update', id, status: 'retired' })).json.account.status, 'retired');
    assert.equal((await kho({ action: 'update', id, status: 'ready' })).json.account.status, 'ready');
    assert.equal((await kho({ action: 'update', id, status: 'needs_rotation' })).json.code, 'bad_status');

    // Việc "đổi mật khẩu" đang chờ: loại mật khẩu mà không gửi mật khẩu mới → từ chối (giống nút Đã xong), gửi mật khẩu → xong việc, mở lại.
    run(ctx.db, "UPDATE accounts SET status = 'needs_rotation' WHERE id = ?", id);
    run(ctx.db, "INSERT INTO rotation_tasks(account_id, kind, reason, status, created_at) VALUES(?, 'rotate', 'expired', 'todo', ?)", id, ctx.now());
    const refused = await kho({ action: 'update', id, status: 'ready' });
    assert.equal(refused.status, 409);
    assert.equal(refused.json.code, 'task_rejected');
    const done = await kho({ action: 'update', id, password: 'Sau#789' });
    assert.equal(done.json.account.status, 'ready', done.text);
    assert.equal(done.json.account.pendingTask, false);
    assert.equal(get(ctx.db, "SELECT done_by FROM rotation_tasks WHERE account_id = ?", id).done_by, 'qs-api');

    // ChatGPT (mã qua email): xong việc làm mới chỉ cần status ready.
    const g = accounts.gpt1.id;
    run(ctx.db, "UPDATE accounts SET status = 'needs_rotation' WHERE id = ?", g);
    run(ctx.db, "INSERT INTO rotation_tasks(account_id, kind, reason, status, created_at) VALUES(?, 'rotate', 'expired', 'todo', ?)", g, ctx.now());
    assert.equal((await kho({ action: 'update', email: 'gpt1@kho.test', status: 'ready' })).json.account.status, 'ready');

    const q = await kho({ action: 'update', id, status: 'quarantined' });
    assert.equal(q.json.account.status, 'quarantined');
    assert.equal(q.json.account.pendingTask, true);
  } finally { await srv.close(); }
});

test('status quán cho QS kèm công cụ còn nhận được (kho chung + suất của quán)', async () => {
  const ctx = createTestCtx();
  seed(ctx);
  const srv = await startTestServer(ctx);
  try {
    const quan = signer(ctx, srv.client(), '/hooks/qs/quan');
    const st = await quan({ action: 'status', shop: 'quan-test' }, ctx.config.qsTicketKey);
    assert.equal(st.status, 200, st.text);
    assert.deepEqual(st.json.tools.map((t) => [t.slug, t.available]), [['chatgpt', true], ['capcut', true]]);
    assert.ok(!st.text.includes('@kho.test'), 'không có email kho');

    run(ctx.db, "UPDATE accounts SET status = 'retired' WHERE tool_id = (SELECT id FROM tools WHERE slug = 'capcut')");
    const sold = (await quan({ action: 'status', shop: 'quan-test' }, ctx.config.qsTicketKey)).json.tools.find((t) => t.slug === 'capcut');
    assert.deepEqual([sold.available, sold.reason], [false, 'sold_out']);

    run(ctx.db, "UPDATE cafes SET daily_quota = 0");
    const full = (await quan({ action: 'status', shop: 'quan-test' }, ctx.config.qsTicketKey)).json.tools;
    assert.ok(full.every((t) => !t.available && t.reason === 'cafe_full'));
  } finally { await srv.close(); }
});

test('cấu hình: QS_KHO_KEY ngắn hoặc trùng khoá vé → báo lỗi; trống = tắt, không lỗi', () => {
  const base = { NODE_ENV: 'production', BASE_URL: 'https://x.vn/colap', CLIENT_IP_HEADER: 'x-real-ip', APP_SECRET: 'a'.repeat(40), DATA_KEY: 'ZGV2LWRhdGEta2V5LTMyLWJ5dGVzLWxvbmctLS0tLS0=', ADMIN_PASSWORD: 'p'.repeat(16), QS_TICKET_KEY: 't'.repeat(64) };
  const errs = (env) => validateConfig(loadConfig({ ...base, ...env })).filter((e) => e.includes('QS_KHO_KEY'));
  assert.equal(errs({}).length, 0);
  assert.equal(errs({ QS_KHO_KEY: 'ngan' }).length, 1);
  assert.equal(errs({ QS_KHO_KEY: 't'.repeat(64) }).length, 1);
  assert.equal(errs({ QS_KHO_KEY: 'k'.repeat(64) }).length, 0);
});
