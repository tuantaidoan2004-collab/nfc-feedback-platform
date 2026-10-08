// Trang Quản trị › Khách: "Xoá dữ liệu cá nhân" xoá cả email Canva khách tự nhập và kết thúc slot đang chạy; khoá 0 ngày không thành vĩnh viễn;
// lọc khách đang khoá / đang dùng; khoá máy dùng chung phải hỏi lại.
// (Rà 08/10/2026: máy thật có khách đã xoá dữ liệu mà trang Canva vẫn hiện email Canva của họ.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestCtx, seed, makeCustomer, makeDevice, startTestServer, T0 } from './helpers.js';
import { run, get } from '../src/db/index.js';
import { completeTask } from '../src/domain/claims.js';
import { runJobs } from '../src/jobs.js';
import { HOUR } from '../src/lib/time.js';

test('Khách: xoá dữ liệu xoá cả email Canva + kết thúc slot; khoá 0 ngày bị chặn; lọc; khoá máy hỏi lại', async () => {
  const ctx = createTestCtx();
  const { cafe, card } = seed(ctx);
  const canva = run(ctx.db, `INSERT INTO tools(slug, name, login_type, login_url, slot_hours, cooldown_days, lifetime_cap, rotation_required, enabled, sort, auto_worker)
    VALUES('canva', 'Canva Pro', 'team_invite', 'https://www.canva.com/login', 168, 30, 2, 0, 1, 50, 1)`).lastInsertRowid;
  const team = run(ctx.db, "INSERT INTO accounts(tool_id, login_email, max_holders, status, created_at) VALUES(?, 'chu-nhom@truong.test', 5, 'ready', ?)", canva, T0).lastInsertRowid;
  const guest = makeCustomer(ctx, 'khach.rieng@example.test');
  const slotId = run(ctx.db, `INSERT INTO slots(customer_id, tool_id, account_id, cafe_id, card_id, device_id, status, invite_email, created_at, started_at, expires_at)
    VALUES(?, ?, ?, ?, ?, 'dev-1', 'active', 'canva.rieng@gmail.com', ?, ?, ?)`, guest.id, canva, team, cafe.id, card.id, T0, T0, T0 + 100 * HOUR).lastInsertRowid;
  // Slot Canva cũ đã xong (việc mời đã làm) — email cũng phải xoá.
  const oldSlot = run(ctx.db, `INSERT INTO slots(customer_id, tool_id, account_id, cafe_id, card_id, device_id, status, invite_email, created_at, started_at, expires_at, ended_at, end_reason)
    VALUES(?, ?, ?, ?, ?, 'dev-1', 'expired', 'canva.rieng@gmail.com', ?, ?, ?, ?, 'expired')`, guest.id, canva, team, cafe.id, card.id, T0 - 200 * HOUR, T0 - 200 * HOUR, T0 - 30 * HOUR, T0 - 30 * HOUR).lastInsertRowid;
  run(ctx.db, "INSERT INTO rotation_tasks(account_id, slot_id, kind, reason, detail, status, created_at, done_at) VALUES(?, ?, 'invite_member', 'claim', 'canva.rieng@gmail.com', 'done', ?, ?)", team, oldSlot, T0 - 200 * HOUR, T0 - 200 * HOUR);
  const srv = await startTestServer(ctx);
  try {
    const admin = srv.client();
    await admin.postForm('/admin/login', { password: ctx.config.adminPassword });
    let page = await admin.get(`/admin/customers/${guest.id}`);
    const csrf = page.text.match(/name="_csrf" value="([^"]+)"/)[1];
    const msg = (r) => new URL(r.headers.get('location'), 'http://x').searchParams.get('msg');

    // Khoá 0 ngày → không khoá (trước: thành khoá vĩnh viễn).
    let r = await admin.postForm(`/admin/customers/${guest.id}/lock`, { _csrf: csrf, days: '0', reason: 'thử' });
    assert.match(msg(r), /Số ngày khoá từ 1 đến 3650/);
    assert.equal(get(ctx.db, 'SELECT status FROM customers WHERE id = ?', guest.id).status, 'active');

    // Lọc "Đang dùng".
    page = await admin.get('/admin/customers?f=live');
    assert.match(page.text, /khach\.rieng@example\.test/);

    // Xoá dữ liệu cá nhân → slot đang chạy kết thúc, bot được giao gỡ khỏi nhóm (giữ email tới khi gỡ xong), email Canva ở slot bị xoá.
    r = await admin.postForm(`/admin/customers/${guest.id}/erase`, { _csrf: csrf });
    assert.match(msg(r), /Đã xoá dữ liệu cá nhân và kết thúc 1 slot đang chạy/);
    const s = get(ctx.db, 'SELECT * FROM slots WHERE id = ?', slotId);
    assert.equal(s.status, 'revoked');
    assert.equal(s.end_reason, 'customer_erased');
    assert.equal(s.invite_email, null);
    assert.equal(get(ctx.db, 'SELECT invite_email FROM slots WHERE id = ?', oldSlot).invite_email, null);
    assert.equal(get(ctx.db, "SELECT detail FROM rotation_tasks WHERE slot_id = ? AND kind = 'invite_member'", oldSlot).detail, null);
    const remove = get(ctx.db, "SELECT * FROM rotation_tasks WHERE slot_id = ? AND kind = 'remove_member'", slotId);
    assert.equal(remove.status, 'todo');
    assert.equal(remove.detail, 'canva.rieng@gmail.com', 'việc gỡ cần email tới khi xong');
    page = await admin.get('/admin/canva');
    assert.doesNotMatch(page.text.replace(/<form[\s\S]*?<\/form>/g, ''), /canva\.rieng@gmail\.com<\/code>/, 'trang Canva không hiện email khách đã xoá');
    // Gỡ xong → lần dọn sau xoá nốt email trong việc gỡ.
    completeTask(ctx, remove.id, { by: 'bot:mac' });
    ctx.clock.advance(2 * HOUR);
    await runJobs(ctx);
    assert.equal(get(ctx.db, 'SELECT detail FROM rotation_tasks WHERE id = ?', remove.id).detail, null);
    assert.equal(get(ctx.db, "SELECT COUNT(*) AS n FROM slots WHERE invite_email = 'canva.rieng@gmail.com'").n, 0);

    // Trang khách đã xoá: tên rõ ràng, không còn nút xoá lần nữa.
    await admin.postForm('/admin/login', { password: ctx.config.adminPassword });
    page = await admin.get(`/admin/customers/${guest.id}`);
    assert.match(page.text, new RegExp(`<title>\\(đã xoá dữ liệu\\) #${guest.id}`));
    assert.doesNotMatch(page.text, /Xoá dữ liệu cá nhân<\/button>/);
    const csrf2 = page.text.match(/name="_csrf" value="([^"]+)"/)[1];

    // Khoá trống số ngày = vĩnh viễn; lọc "Đang khoá".
    const other = makeCustomer(ctx, 'khach.hai@example.test');
    await admin.postForm(`/admin/customers/${other.id}/lock`, { _csrf: csrf2, days: '', reason: 'gian lận' });
    assert.equal(get(ctx.db, 'SELECT locked_until FROM customers WHERE id = ?', other.id).locked_until, null);
    page = await admin.get('/admin/customers?f=locked');
    assert.match(page.text, /khach\.hai@example\.test/);
    assert.doesNotMatch(page.text, /khach\.rieng/);

    // Máy dùng chung 2 khách → nút Khoá máy hỏi lại, nói rõ ảnh hưởng khách khác.
    makeDevice(ctx, 'device-chung-aaaaaaaaaa', other.id);
    run(ctx.db, 'INSERT INTO device_customers(device_id, customer_id, first_seen_at) VALUES(?, ?, ?)', 'device-chung-aaaaaaaaaa', makeCustomer(ctx, 'khach.ba@example.test').id, ctx.now());
    page = await admin.get(`/admin/customers/${other.id}`);
    assert.match(page.text, /Máy này còn 1 khách khác dùng/);
    // Xoá điểm rủi ro có ghi nhật ký.
    await admin.postForm(`/admin/customers/${other.id}/risk-reset`, { _csrf: csrf2 });
    assert.ok(get(ctx.db, "SELECT 1 FROM events WHERE type = 'risk_reset' AND customer_id = ?", other.id));
  } finally {
    await srv.close();
  }
});
