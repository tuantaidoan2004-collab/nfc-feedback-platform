// Trang Quản trị › Slot: lý do kết thúc hiện chữ (trước: "admin_revoked" / "risk_high"); slot Canva chờ mời có nút Huỷ (trước: kẹt mãi, giữ ghế);
// thu hồi quay về đúng trang đang xem; câu hỏi lại nói rõ hậu quả (tài khoản dùng chung → đổi mật khẩu đá cả khách khác).
// (Rà 08/10/2026: máy thật 3 slot chủ thu hồi đều hiện "admin_revoked".)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestCtx, seed, makeCustomer, startTestServer, T0 } from './helpers.js';
import { run, get } from '../src/db/index.js';
import { COUNTED } from '../src/domain/quota.js';
import { HOUR } from '../src/lib/time.js';

test('Slot: nhãn lý do, Huỷ slot Canva chờ mời, thu hồi giữ trang, cảnh báo tài khoản dùng chung', async () => {
  const ctx = createTestCtx();
  const { cafe, card, tools, accounts } = seed(ctx);
  run(ctx.db, 'UPDATE accounts SET max_holders = 2 WHERE id = ?', accounts.gpt1.id);
  const canva = run(ctx.db, `INSERT INTO tools(slug, name, login_type, login_url, slot_hours, cooldown_days, lifetime_cap, rotation_required, enabled, sort, auto_worker)
    VALUES('canva', 'Canva Pro', 'team_invite', 'https://www.canva.com/login', 168, 30, 2, 0, 1, 50, 1)`).lastInsertRowid;
  const team = run(ctx.db, "INSERT INTO accounts(tool_id, login_email, max_holders, status, created_at) VALUES(?, 'chu-nhom@truong.test', 5, 'ready', ?)", canva, T0).lastInsertRowid;
  const slot = (cust, toolId, accId, status, extra = {}) => run(ctx.db,
    `INSERT INTO slots(customer_id, tool_id, account_id, cafe_id, card_id, device_id, status, seat, invite_email, created_at, started_at, expires_at, ended_at, end_reason)
     VALUES(:c, :t, :a, :cafe, :card, 'dev-1', :status, :seat, :email, :now, :started, :exp, :ended, :reason)`,
    { c: cust, t: toolId, a: accId, cafe: cafe.id, card: card.id, status, now: T0, seat: null, email: null, started: T0, exp: T0 + 20 * HOUR, ended: null, reason: null, ...extra }).lastInsertRowid;
  const an = makeCustomer(ctx, 'khach.an@example.test');
  const binh = makeCustomer(ctx, 'khach.binh@example.test');
  const chi = makeCustomer(ctx, 'khach.chi@example.test');
  const sAn = slot(an.id, tools.chatgpt.id, accounts.gpt1.id, 'active', { seat: 1 });
  slot(binh.id, tools.chatgpt.id, accounts.gpt1.id, 'active', { seat: 2 });
  const sChi = slot(chi.id, canva, team, 'pending_invite', { email: 'chi.go.sai@gmial.com', started: null, exp: null });
  const invite = run(ctx.db, "INSERT INTO rotation_tasks(account_id, slot_id, kind, reason, detail, status, created_at, attempts, last_error) VALUES(?, ?, 'invite_member', 'claim', 'chi.go.sai@gmial.com', 'todo', ?, 3, 'không tìm thấy email')", team, sChi, T0).lastInsertRowid;
  slot(chi.id, tools.capcut.id, null, 'rejected', { started: null, exp: null, ended: T0, reason: 'risk_high' });

  const srv = await startTestServer(ctx);
  try {
    const admin = srv.client();
    await admin.postForm('/admin/login', { password: ctx.config.adminPassword });
    let page = await admin.get('/admin/slots');
    const csrf = page.text.match(/name="_csrf" value="([^"]+)"/)[1];
    const loc = (r) => new URL(r.headers.get('location'), 'http://x');

    // Lý do từ chối hiện chữ, không hiện mã.
    assert.match(page.text, /rủi ro cao — tự từ chối/);
    assert.doesNotMatch(page.text, />risk_high</);
    // Slot Canva chờ mời: có nút Huỷ (trước: không có nút nào), cột hết hạn ghi "tính từ lúc mời".
    assert.match(page.text, new RegExp(`/admin/slots/${sChi}/revoke"[^>]*data-confirm="Huỷ slot #${sChi}\\?`));
    assert.match(page.text, /tính từ lúc mời/);
    // Tài khoản dùng chung: hỏi lại nói rõ còn 1 khách khác sẽ bị đá khi đổi mật khẩu.
    assert.match(page.text, new RegExp(`Thu hồi slot #${sAn}\\? Khách mất quyền dùng ngay\\. Tài khoản dùng chung còn 1 khách khác`));
    // Trang Canva cũng có nút Huỷ.
    assert.match((await admin.get('/admin/canva')).text, new RegExp(`/admin/slots/${sChi}/revoke`));

    // Thu hồi từ trang Slot đang lọc theo khách → quay về đúng trang lọc, báo việc tiếp theo, nhãn "chủ thu hồi".
    let r = await admin.postForm(`/admin/slots/${sAn}/revoke`, { _csrf: csrf, back: `/admin/slots?customer=${an.id}` });
    let u = loc(r);
    assert.equal(u.pathname, '/admin/slots');
    assert.equal(u.searchParams.get('customer'), String(an.id));
    assert.match(u.searchParams.get('msg'), new RegExp(`Đã thu hồi slot #${sAn} — việc đổi mật khẩu ở Việc tay`));
    assert.equal(get(ctx.db, 'SELECT end_reason FROM slots WHERE id = ?', sAn).end_reason, 'admin_revoked');
    page = await admin.get(`/admin/slots?customer=${an.id}`);
    assert.match(page.text, /chủ thu hồi/);
    assert.doesNotMatch(page.text, /admin_revoked/);

    // Huỷ slot Canva chờ mời từ trang Canva → về Canva; việc mời bị huỷ, không sinh việc gỡ, ghế trả lại, không tính lượt của khách.
    r = await admin.postForm(`/admin/slots/${sChi}/revoke`, { _csrf: csrf, back: '/admin/canva' });
    u = loc(r);
    assert.equal(u.pathname, '/admin/canva');
    assert.match(u.searchParams.get('msg'), /Đã huỷ slot #\d+ — đã huỷ việc mời, trả ghế, không tính lượt/);
    const s = get(ctx.db, 'SELECT * FROM slots WHERE id = ?', sChi);
    assert.equal(s.status, 'revoked');
    assert.equal(s.end_reason, 'admin_cancelled');
    assert.equal(get(ctx.db, 'SELECT status FROM rotation_tasks WHERE id = ?', invite).status, 'cancelled');
    assert.equal(get(ctx.db, "SELECT COUNT(*) AS n FROM rotation_tasks WHERE slot_id = ? AND kind = 'remove_member'", sChi).n, 0);
    assert.equal(get(ctx.db, `SELECT COUNT(*) AS n FROM slots WHERE customer_id = ? AND tool_id = ? AND ${COUNTED}`, chi.id, canva).n, 0);

    // back lạ → về trang Slot; slot đã kết thúc → báo, không lỗi.
    r = await admin.postForm(`/admin/slots/${sAn}/revoke`, { _csrf: csrf, back: 'https://la.example/admin' });
    u = loc(r);
    assert.equal(u.host, 'x');
    assert.equal(u.pathname, '/admin/slots');
    assert.equal(u.searchParams.get('msg'), 'Slot không còn chạy.');

    // Trang khách: thu hồi quay về trang khách (trước: nhảy sang trang Slot).
    page = await admin.get(`/admin/customers/${binh.id}`);
    const sBinh = get(ctx.db, "SELECT id FROM slots WHERE customer_id = ? AND status = 'active'", binh.id).id;
    assert.match(page.text, new RegExp(`Thu hồi slot #${sBinh}\\? Khách mất quyền dùng ngay\\. Sẽ có việc đổi mật khẩu`), 'người cuối: không còn ai bị đá');
    r = await admin.postForm(`/admin/slots/${sBinh}/revoke`, { _csrf: csrf, back: `/admin/customers/${binh.id}` });
    assert.equal(loc(r).pathname, `/admin/customers/${binh.id}`);
  } finally {
    await srv.close();
  }
});

test('Khách đã xoá dữ liệu: các trang quản trị không hiện "del:***"', async () => {
  const ctx = createTestCtx();
  const { cafe, card, tools, accounts } = seed(ctx);
  const gone = makeCustomer(ctx, 'del:9f3a1c0b63');
  run(ctx.db, `INSERT INTO slots(customer_id, tool_id, account_id, cafe_id, card_id, device_id, status, created_at, started_at, expires_at, ended_at, end_reason)
    VALUES(?, ?, ?, ?, ?, 'dev-1', 'revoked', ?, ?, ?, ?, 'customer_erased')`, gone.id, tools.capcut.id, accounts.capcut1.id, cafe.id, card.id, T0, T0, T0 + HOUR, T0);
  const srv = await startTestServer(ctx);
  try {
    const admin = srv.client();
    await admin.postForm('/admin/login', { password: ctx.config.adminPassword });
    for (const path of ['/admin/slots', `/admin/slots?customer=${gone.id}`]) {
      const page = await admin.get(path);
      assert.doesNotMatch(page.text, /del:/, path);
      assert.match(page.text, /đã xoá/, path);
    }
    assert.match((await admin.get('/admin/slots')).text, new RegExp(`\\(đã xoá\\) #${gone.id}`));
    // Lọc theo món chưa có slot nào → tiêu đề vẫn có tên món.
    assert.match((await admin.get(`/admin/slots?tool=${tools.chatgpt.id}`)).text, /<h1[^>]*>Slot — ChatGPT Plus</);
  } finally {
    await srv.close();
  }
});
