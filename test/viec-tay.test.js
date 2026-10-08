// Trang Quản trị › Việc tay: không sinh / không kẹt việc đổi mật khẩu của tài khoản đã ngừng dùng; báo khi còn khách đang dùng;
// phân biệt việc bot tự làm. (Rà 08/10/2026: việc của tài khoản đã ngừng không bỏ được — "Đã xong" bắt dán mật khẩu mới.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestCtx, seed, makeCustomer, startTestServer, T0 } from './helpers.js';
import { run, get, all } from '../src/db/index.js';
import { revokeSlot, expireDueSlots } from '../src/domain/claims.js';
import { updateAccount } from '../src/domain/stock.js';
import { DAY, HOUR } from '../src/lib/time.js';

test('Việc tay: tài khoản ngừng dùng / quá hạn bỏ được việc, cảnh báo còn khách dùng, nhãn bot', async () => {
  const ctx = createTestCtx();
  const { tools, accounts, cafe, card } = seed(ctx);
  const srv = await startTestServer(ctx);
  try {
    const guest = makeCustomer(ctx);
    const slot = (acc, tool, exp) => run(ctx.db, `INSERT INTO slots(customer_id, tool_id, account_id, cafe_id, card_id, device_id, status, created_at, started_at, expires_at)
      VALUES(?, ?, ?, ?, ?, 'dev-1', 'active', ?, ?, ?)`, guest.id, tool, acc, cafe.id, card.id, T0, T0, exp).lastInsertRowid;
    const todo = (a) => all(ctx.db, "SELECT * FROM rotation_tasks WHERE account_id = ? AND status = 'todo'", a);
    const cc = accounts.capcut1.id;

    // Ngừng dùng lúc còn khách → khách hết giờ: không sinh việc đổi mật khẩu.
    slot(cc, tools.capcut.id, T0 + HOUR);
    updateAccount(ctx, cc, { status: 'retired' }, 'web');
    ctx.clock.advance(2 * HOUR);
    expireDueSlots(ctx);
    assert.equal(todo(cc).length, 0);

    const admin = srv.client();
    await admin.postForm('/admin/login', { password: ctx.config.adminPassword });
    let page = await admin.get('/admin/tasks');
    const csrf = page.text.match(/name="_csrf" value="([^"]+)"/)[1];
    const msg = (r) => new URL(r.headers.get('location'), 'http://x').searchParams.get('msg');

    // Việc cũ của tài khoản đã ngừng (sinh trước bản sửa) → nút "Bỏ việc".
    run(ctx.db, "INSERT INTO rotation_tasks(account_id, kind, reason, status, created_at) VALUES(?, 'rotate', 'slot_expired', 'todo', ?)", cc, ctx.now());
    page = await admin.get('/admin/tasks');
    assert.match(page.text, /Bỏ việc \(tài khoản đã ngừng dùng\)/);
    assert.equal(msg(await admin.postForm(`/admin/tasks/${todo(cc)[0].id}/cancel`, { _csrf: csrf })), 'Đã bỏ việc.');
    assert.equal(todo(cc).length, 0);

    // Việc của tài khoản bình thường thì không bỏ được.
    const g1 = accounts.gpt1.id;
    run(ctx.db, "INSERT INTO rotation_tasks(account_id, kind, reason, status, created_at) VALUES(?, 'rotate', 'manual', 'todo', ?)", g1, ctx.now());
    assert.match(msg(await admin.postForm(`/admin/tasks/${todo(g1)[0].id}/cancel`, { _csrf: csrf })), /Chỉ bỏ được/);
    assert.equal(todo(g1).length, 1);

    // Quá hạn (account_days) → "ngừng dùng & bỏ việc".
    run(ctx.db, 'UPDATE tools SET account_days = 7 WHERE id = ?', tools.chatgpt.id);
    run(ctx.db, 'UPDATE accounts SET created_at = ? WHERE id = ?', ctx.now() - 8 * DAY, g1);
    page = await admin.get('/admin/tasks');
    assert.match(page.text, /Tài khoản quá hạn — ngừng dùng &amp; bỏ việc/);
    const live = await admin.get('/admin/api/live');
    assert.equal(live.json.tasks.find((k) => k.accountId === g1).drop, 'Tài khoản quá hạn — ngừng dùng & bỏ việc');
    const api = await admin.post(`/admin/api/tasks/${todo(g1)[0].id}/cancel`, {}, { 'x-csrf': csrf });
    assert.equal(api.json.ok, true, api.text);
    assert.equal(get(ctx.db, 'SELECT status FROM accounts WHERE id = ?', g1).status, 'retired');
    assert.equal(todo(g1).length, 0);

    // Tài khoản dùng chung: thu hồi 1 khách khi người kia còn dùng → cảnh báo đừng làm ngay.
    const g2 = accounts.gpt2.id;
    run(ctx.db, 'UPDATE accounts SET max_holders = 2 WHERE id = ?', g2);
    const s1 = slot(g2, tools.chatgpt.id, ctx.now() + 5 * HOUR);
    slot(g2, tools.chatgpt.id, ctx.now() + 5 * HOUR);
    revokeSlot(ctx, s1, 'admin_revoked');
    page = await admin.get('/admin/tasks');
    assert.match(page.text, /Còn <b>1<\/b> khách đang dùng tài khoản này/);
    assert.doesNotMatch(page.text, /Bot sẽ tự làm/);
    // Món làm mới mỗi ngày nhưng chưa có bot làm mới nào chạy → việc của chủ, không ghi "Bot sẽ tự làm".
    run(ctx.db, 'UPDATE tools SET workspace_bot = 1 WHERE id = ?', tools.chatgpt.id);
    assert.doesNotMatch((await admin.get('/admin/tasks')).text, /Bot sẽ tự làm/);
    // Bot làm mới vừa hỏi việc → nhãn "Bot sẽ tự làm".
    run(ctx.db, "INSERT INTO kv(key, value, updated_at) VALUES('worker-kind:rotate', 'bot-mac', ?)", ctx.now());
    assert.match((await admin.get('/admin/tasks')).text, /Bot sẽ tự làm/);
  } finally {
    await srv.close();
  }
});
