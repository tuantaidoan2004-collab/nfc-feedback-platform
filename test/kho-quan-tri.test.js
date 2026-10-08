// Trang Quản trị › Kho tài khoản: form "Sửa tài khoản" phải đi đúng luật như nút "Cách ly ngay" / "Đã xong" ở Việc tay
// (trước 08/10/2026 form ghi thẳng trạng thái: cách ly mà khách vẫn dùng, mở lại bằng mật khẩu cũ, "Chờ đổi mật khẩu" kẹt không có việc tay).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestCtx, seed, makeCustomer, startTestServer, T0 } from './helpers.js';
import { run, get, all } from '../src/db/index.js';
import { decrypt } from '../src/lib/crypto.js';
import { DAY } from '../src/lib/time.js';

test('Kho tài khoản: form Sửa — cách ly thu hồi khách, về Sẵn sàng phải có mật khẩu mới, không chọn tay "Chờ đổi mật khẩu"; báo quá hạn', async () => {
  const ctx = createTestCtx();
  const { tools, accounts, cafe, card } = seed(ctx);
  const srv = await startTestServer(ctx);
  try {
    const cc = accounts.capcut1.id;
    const guest = makeCustomer(ctx);
    const slotId = run(ctx.db, `INSERT INTO slots(customer_id, tool_id, account_id, cafe_id, card_id, device_id, status, created_at, started_at)
      VALUES(?, ?, ?, ?, ?, 'dev-1', 'active', ?, ?)`, guest.id, tools.capcut.id, cc, cafe.id, card.id, T0, T0).lastInsertRowid;

    const admin = srv.client();
    assert.equal((await admin.postForm('/admin/login', { password: ctx.config.adminPassword })).status, 303);
    let page = await admin.get(`/admin/accounts/${cc}`);
    const csrf = page.text.match(/name="_csrf" value="([^"]+)"/)[1];
    assert.doesNotMatch(page.text, /<option value="needs_rotation"/, 'không chọn tay "Chờ đổi mật khẩu"');
    const save = (accId, form) => admin.postForm(`/admin/accounts/${accId}`, { _csrf: csrf, label: '', max_holders: '1', ...form });
    const msg = (r) => new URL(r.headers.get('location'), 'http://x').searchParams.get('msg');

    // Cách ly bằng form = như nút "Cách ly ngay": thu hồi khách + tạo việc đổi mật khẩu.
    assert.match(msg(await save(cc, { status: 'quarantined' })), /Đã cách ly, thu hồi 1/);
    assert.equal(get(ctx.db, 'SELECT status FROM slots WHERE id = ?', slotId).status, 'revoked');
    assert.equal(all(ctx.db, "SELECT * FROM rotation_tasks WHERE account_id = ? AND kind = 'rotate' AND status = 'todo'", cc).length, 1);
    page = await admin.get(`/admin/accounts/${cc}`);
    assert.match(page.text, /Đang có việc tay/);

    // Về "Sẵn sàng" không dán mật khẩu mới → không lưu, tài khoản vẫn cách ly.
    assert.match(msg(await save(cc, { status: 'ready' })), /^Chưa lưu: Dán mật khẩu mới/);
    assert.equal(get(ctx.db, 'SELECT status FROM accounts WHERE id = ?', cc).status, 'quarantined');
    // Dán mật khẩu mới → xong việc tay, tài khoản sẵn sàng với mật khẩu mới.
    assert.match(msg(await save(cc, { password: 'MoiDoi#2' })), /sẵn sàng/);
    const a = get(ctx.db, 'SELECT * FROM accounts WHERE id = ?', cc);
    assert.equal(a.status, 'ready');
    assert.equal(decrypt(a.password_enc, ctx.config.dataKey), 'MoiDoi#2');
    assert.equal(all(ctx.db, "SELECT * FROM rotation_tasks WHERE account_id = ? AND status = 'todo'", cc).length, 0);

    // "Chờ đổi mật khẩu" gửi tay bị bỏ qua (không tạo trạng thái kẹt không có việc tay); số người ngoài 1–50 bị từ chối.
    await save(accounts.gpt1.id, { status: 'needs_rotation' });
    assert.equal(get(ctx.db, 'SELECT status FROM accounts WHERE id = ?', accounts.gpt1.id).status, 'ready');
    assert.match(msg(await save(accounts.gpt1.id, { max_holders: '999' })), /^Chưa lưu: .*1 đến 50/);
    assert.equal(msg(await admin.postForm('/admin/accounts/9999', { _csrf: csrf, status: 'ready' })), 'Không có tài khoản này.');

    // Tài khoản quá hạn (account_days) vẫn "Sẵn sàng" nhưng không giao → trang kho phải nói rõ.
    run(ctx.db, 'UPDATE tools SET account_days = 7 WHERE id = ?', tools.chatgpt.id);
    run(ctx.db, 'UPDATE accounts SET created_at = ? WHERE id = ?', T0 - 8 * DAY, accounts.gpt2.id);
    page = await admin.get('/admin/accounts');
    assert.match(page.text, /1 quá hạn \(không giao\)/);
    assert.match(page.text.split('gpt2@kho.test')[1].split('</tr>')[0], /Quá hạn — không giao/);
    assert.doesNotMatch(page.text.split('gpt1@kho.test')[1].split('</tr>')[0], /Quá hạn/);

    // Dán cột mật khẩu cho món chỉ cần email → báo rõ.
    const imp = await admin.postForm('/admin/accounts', { _csrf: csrf, tool_id: String(tools.chatgpt.id), lines: 'moi@kho.test|matkhau' });
    assert.match(msg(imp), /chỉ cần email/);
  } finally {
    await srv.close();
  }
});
