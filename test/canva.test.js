// Canva Pro (mời vào nhóm): khách nhập email của mình → bot trên máy Mac mời qua API /worker → hết giờ bot gỡ.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestCtx, seed, startTestServer, ticketFor } from './helpers.js';
import { get, run } from '../src/db/index.js';
import { runJobs } from '../src/jobs.js';
import { HOUR, MIN } from '../src/lib/time.js';

const UA = { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1' };
const BOT = { authorization: 'Bearer dev-worker-token-change-me-0123' };

async function setup() {
  const ctx = createTestCtx();
  seed(ctx);
  const canvaId = run(ctx.db, `INSERT INTO tools(slug, name, login_type, login_url, slot_hours, cooldown_days, lifetime_cap, rotation_required, enabled, sort, auto_worker, holders_default)
    VALUES('canva', 'Canva Pro', 'team_invite', 'https://www.canva.com/login', 24, 30, 2, 0, 1, 50, 1, 5)`).lastInsertRowid;
  run(ctx.db, "INSERT INTO accounts(tool_id, login_email, max_holders, status, created_at) VALUES(?, 'chu-nhom@truong.test', 2, 'ready', ?)", canvaId, ctx.now());
  const srv = await startTestServer(ctx);
  return { ctx, srv, canvaId };
}

async function customer(ctx, srv, phone) {
  const c = srv.client();
  assert.equal((await c.get(`/qs/quan-test?t=${ticketFor(ctx)}`, UA)).status, 303);
  await c.post('/api/otp/send', { phone });
  const ok = await c.post('/api/otp/verify', { phone, code: ctx.otpSent.at(-1).code, consent: true });
  assert.equal(ok.json.ok, true, ok.text);
  return c;
}

test('Canva: nhận → chờ bot mời → bot mời xong mới tính giờ → hết hạn → bot gỡ', async () => {
  const { ctx, srv, canvaId } = await setup();
  try {
    const c = await customer(ctx, srv, '0911000001');
    const noEmail = await c.post('/api/claim', { toolId: canvaId });
    assert.equal(noEmail.json.code, 'invite_email_required');

    const claim = await c.post('/api/claim', { toolId: canvaId, inviteEmail: ' Khach.Mot@Gmail.com ' });
    assert.equal(claim.json.status, 'pending_invite', claim.text);
    const me = await c.get('/me', UA);
    assert.match(me.text, /Đang mời bạn vào nhóm Canva Pro/);
    assert.match(me.text, /khach\.mot@gmail\.com/);
    assert.doesNotMatch(me.text, /chu-nhom@truong\.test/, 'khách không cần thấy email chủ nhóm');

    // Sai mã bot → 401; bot nhóm khác → không nhận việc.
    assert.equal((await srv.client().post('/worker/tasks/next', {}, { authorization: 'Bearer sai' })).status, 401);
    assert.equal((await srv.client().post('/worker/tasks/next', { account: 'nhom-khac@x.test' }, BOT)).json.task, null);

    const bot = srv.client();
    const next = await bot.post('/worker/tasks/next', { worker: 'mac', account: 'chu-nhom@truong.test' }, BOT);
    assert.equal(next.json.task.kind, 'invite_member');
    assert.equal(next.json.task.email, 'khach.mot@gmail.com');
    assert.equal(next.json.task.account.email, 'chu-nhom@truong.test');
    assert.ok(!JSON.stringify(next.json).includes('0911000001'), 'bot không nhận SĐT khách');
    // Đang giữ việc → bot thứ 2 không nhận trùng.
    assert.equal((await bot.post('/worker/tasks/next', { worker: 'mac2' }, BOT)).json.task, null);

    ctx.clock.advance(2 * MIN);
    const done = await bot.post(`/worker/tasks/${next.json.task.id}/done`, { worker: 'mac' }, BOT);
    assert.equal(done.json.ok, true, done.text);
    const slot = get(ctx.db, 'SELECT * FROM slots WHERE id = ?', claim.json.slotId);
    assert.equal(slot.status, 'active');
    assert.equal(slot.expires_at, slot.started_at + 24 * HOUR, 'giờ tính từ lúc mời xong');
    assert.match((await c.get('/me', UA)).text, /Đang dùng/);

    ctx.clock.advance(24 * HOUR + MIN);
    await runJobs(ctx);
    assert.equal(get(ctx.db, 'SELECT status FROM slots WHERE id = ?', slot.id).status, 'expired');
    const rm = await bot.post('/worker/tasks/next', { worker: 'mac' }, BOT);
    assert.equal(rm.json.task.kind, 'remove_member');
    assert.equal(rm.json.task.email, 'khach.mot@gmail.com');
    assert.equal((await bot.post(`/worker/tasks/${rm.json.task.id}/done`, { worker: 'mac' }, BOT)).json.ok, true);
    assert.equal(get(ctx.db, "SELECT COUNT(*) AS n FROM rotation_tasks WHERE status = 'todo'").n, 0);
  } finally { await srv.close(); }
});

test('Canva: chờ mời đã giữ ghế; bot tắt quá 10 phút → báo đỏ, chủ bấm "Đã mời tay"', async () => {
  const { ctx, srv, canvaId } = await setup();
  try {
    const a = await customer(ctx, srv, '0911000002');
    const b = await customer(ctx, srv, '0911000003');
    const c3 = await customer(ctx, srv, '0911000004');
    assert.equal((await a.post('/api/claim', { toolId: canvaId, inviteEmail: 'a@gmail.com' })).json.status, 'pending_invite');
    assert.equal((await b.post('/api/claim', { toolId: canvaId, inviteEmail: 'b@gmail.com' })).json.status, 'pending_invite');
    // Nhóm 2 ghế đã có 2 người chờ mời → người thứ 3 không nhận được (không mời quá số ghế).
    assert.equal((await c3.post('/api/claim', { toolId: canvaId, inviteEmail: 'c@gmail.com' })).json.code, 'no_account');

    ctx.clock.advance(11 * MIN);
    await runJobs(ctx);
    const alerts = ctx.alerts('worker_task_stuck');
    assert.equal(alerts.length, 2);
    assert.equal(alerts[0].severity, 'red');

    const task = get(ctx.db, "SELECT id FROM rotation_tasks WHERE kind = 'invite_member' AND detail = 'a@gmail.com'");
    const { completeTask } = await import('../src/domain/claims.js');
    assert.equal(completeTask(ctx, task.id, { by: 'admin' }).ok, true);
    assert.equal(get(ctx.db, "SELECT status FROM slots WHERE invite_email = 'a@gmail.com'").status, 'active');
  } finally { await srv.close(); }
});

test('Canva: bot báo lỗi 3 lần → thôi giao bot, báo chủ làm tay', async () => {
  const { ctx, srv, canvaId } = await setup();
  try {
    const a = await customer(ctx, srv, '0911000005');
    await a.post('/api/claim', { toolId: canvaId, inviteEmail: 'a@gmail.com' });
    const bot = srv.client();
    for (let i = 1; i <= 3; i++) {
      const n = await bot.post('/worker/tasks/next', { worker: 'mac' }, BOT);
      assert.equal(n.json.task.attempt, i);
      const f = await bot.post(`/worker/tasks/${n.json.task.id}/fail`, { worker: 'mac', error: 'Không thấy nút mời' }, BOT);
      assert.equal(f.json.willRetry, i < 3);
    }
    assert.equal((await bot.post('/worker/tasks/next', { worker: 'mac' }, BOT)).json.task, null);
    assert.equal(ctx.alerts('worker_task_stuck').length, 1);
  } finally { await srv.close(); }
});
