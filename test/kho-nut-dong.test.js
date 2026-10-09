// Chủ 09/10/2026: "không có chỗ bấm" ở Kho tài khoản → mỗi dòng có nút Sửa / Ngừng dùng / Dùng lại.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestCtx, seed, startTestServer } from './helpers.js';
import { get } from '../src/db/index.js';

test('Kho tài khoản: nút Ngừng dùng / Dùng lại trên dòng, về lại đúng danh sách; back lạ / trạng thái lạ bị chặn', async () => {
  const ctx = createTestCtx();
  const { tools } = seed(ctx);
  const srv = await startTestServer(ctx);
  try {
    const admin = srv.client();
    await admin.postForm('/admin/login', { password: ctx.config.adminPassword });
    const list = `/admin/accounts?tool=${tools.chatgpt.id}`;
    const page = await admin.get(list);
    const acc = get(ctx.db, "SELECT id, login_email FROM accounts WHERE tool_id = ? AND status = 'ready' ORDER BY id LIMIT 1", tools.chatgpt.id);
    assert.match(page.text, new RegExp(`action="/admin/accounts/${acc.id}/trang-thai"`));
    assert.match(page.text, />Ngừng dùng<\/button>/);
    assert.match(page.text, new RegExp(`href="/admin/accounts/${acc.id}">Sửa<`));
    const csrf = page.text.match(/name="_csrf" value="([^"]+)"/)[1];
    const status = () => get(ctx.db, 'SELECT status FROM accounts WHERE id = ?', acc.id).status;
    const where = (r) => new URL(r.headers.get('location'), 'http://x');

    let r = await admin.postForm(`/admin/accounts/${acc.id}/trang-thai`, { _csrf: csrf, status: 'retired', back: list });
    assert.equal(r.status, 303);
    assert.equal(where(r).pathname + where(r).search.replace(/&?msg=[^&]*/, ''), list);
    assert.match(where(r).searchParams.get('msg'), /đã ngừng dùng/);
    assert.equal(status(), 'retired');

    r = await admin.postForm(`/admin/accounts/${acc.id}/trang-thai`, { _csrf: csrf, status: 'ready', back: 'https://evil.example/' });
    assert.equal(where(r).host, 'x', 'back lạ → về /admin/accounts');
    assert.equal(where(r).pathname, '/admin/accounts');
    assert.equal(status(), 'ready');

    r = await admin.postForm(`/admin/accounts/${acc.id}/trang-thai`, { _csrf: csrf, status: 'quarantined', back: list });
    assert.match(where(r).searchParams.get('msg'), /không hợp lệ/);
    assert.equal(status(), 'ready', 'cách ly chỉ làm ở trang tài khoản (có thu hồi khách)');

    r = await admin.postForm(`/admin/accounts/${acc.id}/trang-thai`, { status: 'retired', back: list });
    assert.notEqual(status(), 'retired', 'thiếu csrf → không đổi');
  } finally { await srv.close(); }
});

test('Kho tài khoản: ChatGPT đang chờ tạo Project → nút "Xong · giao khách" trên dòng, bấm là Sẵn sàng; ô tick nhập kho mặc định trống', async () => {
  const ctx = createTestCtx();
  const { tools } = seed(ctx);
  ctx.db.prepare("UPDATE tools SET workspace_bot = 1 WHERE id = ?").run(tools.chatgpt.id);
  const srv = await startTestServer(ctx);
  try {
    const admin = srv.client();
    await admin.postForm('/admin/login', { password: ctx.config.adminPassword });
    const list = `/admin/accounts?tool=${tools.chatgpt.id}`;
    let page = await admin.get(list);
    assert.doesNotMatch(page.text, /name="setup" value="1" checked/, 'mặc định: đã tạo sẵn Project → không chờ');
    const csrf = page.text.match(/name="_csrf" value="([^"]+)"/)[1];
    // Nhập kho, tick "chưa tạo Project" → chờ; không tick → sẵn sàng ngay
    await admin.postForm('/admin/accounts', { _csrf: csrf, tool_id: String(tools.chatgpt.id), lines: 'cho-tao@kho.test|8', setup: '1' });
    await admin.postForm('/admin/accounts', { _csrf: csrf, tool_id: String(tools.chatgpt.id), lines: 'tao-san@kho.test|8' });
    const acc = (e) => get(ctx.db, 'SELECT id, status FROM accounts WHERE login_email = ?', e);
    assert.equal(acc('cho-tao@kho.test').status, 'needs_rotation');
    assert.equal(acc('tao-san@kho.test').status, 'ready');
    page = await admin.get(list);
    const task = get(ctx.db, "SELECT id FROM rotation_tasks WHERE account_id = ? AND status = 'todo'", acc('cho-tao@kho.test').id).id;
    assert.match(page.text, new RegExp(`action="/admin/tasks/${task}/done"`));
    assert.match(page.text, /Xong · giao khách/);
    const r = await admin.postForm(`/admin/tasks/${task}/done`, { _csrf: csrf, back: list });
    assert.equal(new URL(r.headers.get('location'), 'http://x').pathname, '/admin/accounts', 'về lại trang Kho');
    assert.equal(acc('cho-tao@kho.test').status, 'ready');
  } finally { await srv.close(); }
});
