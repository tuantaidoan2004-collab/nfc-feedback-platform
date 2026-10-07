import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestCtx, seed } from './helpers.js';
import { checkMailRoute, watchedAccounts } from '../src/domain/mail-route.js';
import { runJobs } from '../src/jobs.js';
import { run, get } from '../src/db/index.js';
import { MIN } from '../src/lib/time.js';

const HUB = { HUB_WATCH_URL: 'https://hop-thu.test', HUB_WATCH_TOKEN: 'watch-token-0123456789-abcdef' };

/** Kho: 2 Claude @tiembanquyen.site (mã qua email), 1 Claude tên miền khác, 1 CapCut (mật khẩu — không cần thư mã). */
function setup(env = HUB) {
  const ctx = createTestCtx({ env });
  seed(ctx);
  const tool = run(ctx.db, `INSERT INTO tools(slug, name, login_type, slot_hours, cooldown_days, lifetime_cap, rotation_required, high_value, enabled, sort)
    VALUES('claude', 'Claude Pro', 'email_code', 24, 30, 2, 1, 1, 1, 5)`).lastInsertRowid;
  const acct = (email, status = 'ready') => run(ctx.db,
    "INSERT INTO accounts(tool_id, login_email, max_holders, status, created_at) VALUES(?, ?, 3, ?, ?)", tool, email, status, ctx.now()).lastInsertRowid;
  const ids = { c1: acct('claude1@tiembanquyen.site'), c7: acct('Claude7@tiembanquyen.site'), other: acct('claude@khac.test'), old: acct('claude9@tiembanquyen.site', 'retired') };
  return { ctx, ids };
}

/** Hộp thư giả: ghi lại yêu cầu, trả số thư theo bảng `box`. */
function fakeHub(box, status = 200) {
  const calls = [];
  const fetchImpl = async (url, opt) => {
    calls.push({ url, auth: opt.headers.authorization, emails: JSON.parse(opt.body).emails });
    const addresses = JSON.parse(opt.body).emails.filter((e) => box[e]).map((e) => ({ email: e, ...box[e] }));
    return { ok: status === 200, status, json: async () => ({ addresses }) };
  };
  return { fetchImpl, calls };
}

test('Chỉ hỏi địa chỉ cần thư mã, còn dùng, đúng tên miền — không gửi CapCut / tài khoản ngừng / tên miền khác', async () => {
  const { ctx } = setup();
  assert.deepEqual(watchedAccounts(ctx).map((a) => a.email), ['claude1@tiembanquyen.site', 'claude7@tiembanquyen.site']);
  const hub = fakeHub({});
  const r = await checkMailRoute(ctx, { fetchImpl: hub.fetchImpl });
  assert.deepEqual(r, { checked: 2, bad: [], alerts: 0 });
  assert.equal(hub.calls[0].url, 'https://hop-thu.test/api/watch');
  assert.equal(hub.calls[0].auth, `Bearer ${HUB.HUB_WATCH_TOKEN}`);
  assert.equal(ctx.alerts('mail_wrong_route').length, 0);
});

test('Thư rơi nhầm → báo đỏ 1 lần, có thư mới → báo lại', async () => {
  const { ctx, ids } = setup();
  const box = { 'claude7@tiembanquyen.site': { messages: 1, last_at: ctx.now() - 5 * MIN } };
  const hub = fakeHub(box);
  let r = await checkMailRoute(ctx, { fetchImpl: hub.fetchImpl });
  assert.deepEqual(r.bad, ['claude7@tiembanquyen.site']);
  const a = ctx.alerts('mail_wrong_route');
  assert.equal(a.length, 1);
  assert.equal(a[0].severity, 'red');
  assert.match(JSON.parse(a[0].data).reason, /claude7@tiembanquyen\.site/);
  assert.equal(get(ctx.db, "SELECT account_id FROM events WHERE type = 'mail_wrong_route'").account_id, ids.c7);
  r = await checkMailRoute(ctx, { fetchImpl: hub.fetchImpl });  // không có thư mới → không báo lại
  assert.equal(r.alerts, 0);
  assert.equal(ctx.alerts('mail_wrong_route').length, 1);
  box['claude7@tiembanquyen.site'] = { messages: 2, last_at: ctx.now() };
  r = await checkMailRoute(ctx, { fetchImpl: hub.fetchImpl });
  assert.equal(r.alerts, 1);
  assert.equal(ctx.alerts('mail_wrong_route').length, 2);
});

test('Hộp thư lỗi / sai khoá → ghi trạng thái, không báo đỏ nhầm, không làm hỏng việc khác', async () => {
  const { ctx } = setup();
  const r = await checkMailRoute(ctx, { fetchImpl: fakeHub({}, 401).fetchImpl });
  assert.match(r.error, /HUB_WATCH_TOKEN/);
  assert.equal(ctx.alerts('mail_wrong_route').length, 0);
  const st = JSON.parse(get(ctx.db, "SELECT value FROM kv WHERE key = 'mailroute_status'").value);
  assert.equal(st.ok, false);
  const down = await checkMailRoute(ctx, { fetchImpl: async () => { throw new Error('mạng lỗi'); } });
  assert.match(down.error, /mạng lỗi/);
});

test('Chưa nối (thiếu URL / khoá) → bỏ qua, runJobs không gọi mạng', async () => {
  const { ctx } = setup({});
  assert.deepEqual(await checkMailRoute(ctx, { fetchImpl: () => assert.fail('không được gọi mạng') }), { skipped: true });
  const out = await runJobs(ctx);
  assert.equal(out.mailRoute, undefined);
});
