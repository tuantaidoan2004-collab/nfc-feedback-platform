// Trang Theo dõi / Việc tay: chủ làm việc tay trên tài khoản đăng nhập bằng mã qua email (ChatGPT, Claude).
// (Rà 08/10/2026: chủ đăng nhập để tạo Project / làm mới → mã về bị coi là "mã mồ côi": báo đỏ + cộng 15 điểm cho mọi khách cũ 7 ngày.
//  Việc "tạo Project" của tài khoản mới hiện nhãn "Đổi mật khẩu", ô kho ghi "Hết kho" dù 8 tài khoản chỉ chờ tạo Project;
//  Theo dõi thiếu cảnh báo "giữ Project khách gia hạn" và lỗi bot.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestCtx, seed, makeCustomer, startTestServer, T0 } from './helpers.js';
import { run, get, all } from '../src/db/index.js';
import { ingestMail } from '../src/domain/mail.js';
import { addAccounts } from '../src/domain/stock.js';
import { HOUR, MIN } from '../src/lib/time.js';

let seq = 0;
const codeMail = (to, code) => ({ message_id: `chu${++seq}`, to, from: 'OpenAI <noreply@tm.openai.com>', subject: `Your ChatGPT code is ${code}`,
  text: `Enter this temporary verification code to continue: ${code}\nIf you didn't try to log in, you can safely ignore this email.` });
const signinMail = (to) => ({ message_id: `chu${++seq}`, to, from: 'OpenAI <noreply@tm.openai.com>', subject: 'New login to ChatGPT', text: 'We noticed a new login from Chrome on Mac.' });

test('Việc tay: "Lấy mã đăng nhập" giao mã cho chủ (không báo mồ côi, không phạt khách cũ); việc tạo Project rõ ràng', async () => {
  const ctx = createTestCtx();
  const { tools, accounts, cafe, card } = seed(ctx);
  const srv = await startTestServer(ctx);
  try {
    const old = makeCustomer(ctx, 'khach.cu@example.test');
    // Khách cũ vừa dùng xong gpt1 và gpt2 → mỗi tài khoản có việc làm mới đang chờ.
    for (const acc of [accounts.gpt1, accounts.gpt2]) {
      run(ctx.db, `INSERT INTO slots(customer_id, tool_id, account_id, cafe_id, card_id, device_id, status, created_at, started_at, expires_at, ended_at, end_reason)
        VALUES(?, ?, ?, ?, ?, 'dev-1', 'expired', ?, ?, ?, ?, 'expired')`, old.id, tools.chatgpt.id, acc.id, cafe.id, card.id, T0 - 25 * HOUR, T0 - 25 * HOUR, T0 - HOUR, T0 - HOUR);
      run(ctx.db, "UPDATE accounts SET status = 'needs_rotation' WHERE id = ?", acc.id);
      run(ctx.db, "INSERT INTO rotation_tasks(account_id, kind, reason, status, created_at) VALUES(?, 'rotate', 'slot_expired', 'todo', ?)", acc.id, T0 - HOUR);
    }
    const taskOf = (acc) => get(ctx.db, "SELECT * FROM rotation_tasks WHERE account_id = ? AND status = 'todo'", acc.id);
    const risk = () => get(ctx.db, 'SELECT risk FROM customers WHERE id = ?', old.id).risk;
    const orphans = (acc) => all(ctx.db, "SELECT * FROM events WHERE type = 'code_orphan' AND account_id = ?", acc.id).length;

    const admin = srv.client();
    await admin.postForm('/admin/login', { password: ctx.config.adminPassword });
    let page = await admin.get('/admin/tasks');
    const csrf = page.text.match(/name="_csrf" value="([^"]+)"/)[1];
    const msg = (r) => new URL(r.headers.get('location'), 'http://x').searchParams.get('msg');
    assert.match(page.text, /Lấy mã đăng nhập/);

    // Không bấm "Lấy mã": mã về = mồ côi như cũ (giữ báo động người lạ).
    assert.equal(ingestMail(ctx, codeMail('gpt2@kho.test', '111111')).verdict, 'orphan');
    assert.equal(orphans(accounts.gpt2), 1);
    const riskAfterOrphan = risk();
    assert.ok(riskAfterOrphan > 0);

    // Bấm "Lấy mã đăng nhập" (form) → mã về là của chủ: không mồ côi, không cộng điểm, hiện trên thẻ việc.
    let r = await admin.postForm(`/admin/tasks/${taskOf(accounts.gpt1).id}/code`, { _csrf: csrf, back: '/admin/tasks' });
    assert.match(msg(r), /mã về trong 10 phút sẽ hiện/);
    page = await admin.get('/admin/tasks');
    assert.match(page.text, /Đang chờ mã về hộp thư kho/);
    ctx.clock.advance(MIN);
    assert.equal(ingestMail(ctx, codeMail('gpt1@kho.test', '482913')).verdict, 'owner');
    assert.equal(orphans(accounts.gpt1), 0);
    assert.equal(risk(), riskAfterOrphan);
    assert.equal(ingestMail(ctx, signinMail('gpt1@kho.test')).verdict, 'ignored', 'thư "đăng nhập mới" của chủ không báo');
    page = await admin.get('/admin/tasks');
    assert.match(page.text, /Mã đăng nhập: <code class="big-code">482913<\/code>/);
    let live = (await admin.get('/admin/api/live')).json;
    assert.equal(live.tasks.find((k) => k.accountId === accounts.gpt1.id).code.value, '482913');
    assert.equal(live.tasks.find((k) => k.accountId === accounts.gpt2.id).code, null);

    // Hết 10 phút → mã sau lại là mồ côi.
    ctx.clock.advance(10 * MIN);
    assert.equal(ingestMail(ctx, codeMail('gpt1@kho.test', '222333')).verdict, 'orphan');
    // API (trang Theo dõi) mở lại được.
    const api = await admin.post(`/admin/api/tasks/${taskOf(accounts.gpt1).id}/code`, {}, { 'x-csrf': csrf });
    assert.equal(api.json.ok, true, api.text);
    assert.equal(ingestMail(ctx, codeMail('gpt1@kho.test', '444555')).verdict, 'owner');
    // Tài khoản mật khẩu (CapCut) không có nút lấy mã.
    run(ctx.db, "INSERT INTO rotation_tasks(account_id, kind, reason, status, created_at) VALUES(?, 'rotate', 'manual', 'todo', ?)", accounts.capcut1.id, ctx.now());
    const cc = taskOf(accounts.capcut1);
    assert.equal((await admin.post(`/admin/api/tasks/${cc.id}/code`, {}, { 'x-csrf': csrf })).json.ok, false);

    // Tài khoản mới chờ tạo Project: nhãn "Tạo Project" + cách làm; ô kho nói "chờ tạo Project" thay vì chỉ "Hết kho".
    run(ctx.db, 'UPDATE tools SET workspace_bot = 1, end_hour = 6 WHERE id = ?', tools.chatgpt.id);
    const tool = get(ctx.db, 'SELECT * FROM tools WHERE id = ?', tools.chatgpt.id);
    const [newId] = addAccounts(ctx, { tool, items: [{ email: 'gpt-moi@kho.test', max: 3 }], setup: true, by: 'test' }).ids;
    live = (await admin.get('/admin/api/live')).json;
    const st = live.tasks.find((k) => k.accountId === newId);
    assert.equal(st.title, 'Tạo Project');
    assert.match(st.howTo, /tạo 3 Project "Slot 1" … "Slot 3"/);
    assert.equal(st.canCode, true);
    assert.match(live.stock.find((x) => x.id === tools.chatgpt.id).waiting, /chờ việc tay|chờ tạo Project/);
    page = await admin.get('/admin');
    assert.match(page.text, /tài khoản chờ (việc tay|tạo Project)/);
    page = await admin.get('/admin/tasks');
    assert.match(page.text, /Tạo Project<\/span>/);

    // Khách đã gia hạn trên tài khoản đang chờ làm mới → Theo dõi cũng nhắc giữ Project.
    run(ctx.db, `INSERT INTO slots(customer_id, tool_id, account_id, cafe_id, card_id, device_id, status, seat, code_free, created_at, started_at, expires_at)
      VALUES(?, ?, ?, ?, ?, 'dev-2', 'active', 2, 1, ?, ?, ?)`, makeCustomer(ctx, 'gia.han@example.test').id, tools.chatgpt.id, accounts.gpt1.id, cafe.id, card.id, ctx.now(), ctx.now(), ctx.now() + 30 * HOUR);
    live = (await admin.get('/admin/api/live')).json;
    assert.match(live.tasks.find((k) => k.accountId === accounts.gpt1.id).kept, /Không xoá Project: Slot 2/);
    // Lỗi bot hiện ở Theo dõi.
    run(ctx.db, "UPDATE rotation_tasks SET last_error = 'Không thấy nút Project', attempts = 2 WHERE id = ?", taskOf(accounts.gpt2).id);
    live = (await admin.get('/admin/api/live')).json;
    assert.equal(live.tasks.find((k) => k.accountId === accounts.gpt2.id).lastError, 'Bot báo lỗi (2 lần): Không thấy nút Project');
  } finally {
    await srv.close();
  }
});
