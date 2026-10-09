// Thư báo động cho chủ (ALERT_EMAILS), hạn mức gửi thư trên trang Máy chủ, dọn máy chỉ ghé xem (đánh giá thương mại 09/10/2026).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestCtx, seed } from './helpers.js';
import { get, run } from '../src/db/index.js';
import { logEvent } from '../src/lib/events.js';
import { sendAlerts, ALERT_GAP, ALERT_DAY_CAP } from '../src/domain/bao-dong.js';
import { hostChecks, fetchMailQuota } from '../src/domain/may-chu.js';
import { retention } from '../src/jobs.js';
import { loadConfig, validateConfig } from '../src/config.js';
import { MIN, DAY } from '../src/lib/time.js';

const pick = (checks, key) => checks.find((c) => c.key === key);
const mailbox = () => {
  const out = [];
  const send = async (ctx, m) => { out.push(m); return { ok: true }; };
  return { out, send };
};
// DB_PATH=:memory: → trang Máy chủ không đọc thư mục ./data thật của máy chạy test.
const alertCtx = (env = {}) => createTestCtx({ env: { DB_PATH: ':memory:', ALERT_EMAILS: 'chu@tiem.test, sai-dia-chi', ...env } });

test('Báo động: địa chỉ sai bị bỏ qua, không làm máy chủ dừng', () => {
  const c = loadConfig({ NODE_ENV: 'test', ALERT_EMAILS: 'Chu@Tiem.test, sai-dia-chi, ,b@x.vn' });
  assert.deepEqual(c.alertEmails, ['chu@tiem.test', 'b@x.vn']);
  const prod = loadConfig({ NODE_ENV: 'production', ALERT_EMAILS: 'sai-dia-chi' });
  assert.ok(!validateConfig(prod).some((e) => /ALERT/.test(e)), 'không có lỗi cấu hình nào về ALERT_EMAILS');
});

test('Báo động: lần đầu chỉ ghi mốc (không gửi lại sự kiện cũ); sự kiện đỏ mới → 1 thư gộp, có tên quán + link quản trị', async () => {
  const ctx = alertCtx();
  const { cafe } = seed(ctx);
  logEvent(ctx, { type: 'tool_sold_out', severity: 'red', data: { tool: 'ChatGPT Plus', reason: 'hết tài khoản trong kho — nạp hàng' } });
  const box = mailbox();
  assert.equal((await sendAlerts(ctx, { send: box.send })).skipped, 'nothing', 'sự kiện có trước lần chạy đầu không gửi');
  logEvent(ctx, { type: 'tool_sold_out', severity: 'red', cafeId: cafe.id, data: { tool: 'Claude Pro', reason: 'hết kho riêng của quán' } });
  logEvent(ctx, { type: 'ticket_forged', severity: 'red', cafeId: cafe.id, data: { badTicketsLastHour: 31 } });
  logEvent(ctx, { type: 'otp_sent', data: {} }); // sự kiện thường: không báo
  const r = await sendAlerts(ctx, { send: box.send });
  assert.equal(r.sent, 1, 'chỉ gửi địa chỉ hợp lệ');
  assert.equal(box.out.length, 1);
  assert.equal(box.out[0].to, 'chu@tiem.test');
  assert.match(box.out[0].subject, /^\[TBQ\] Cần xử lý: /);
  assert.match(box.out[0].text, /Claude Pro/);
  assert.match(box.out[0].text, /Cà phê Test 24h/);
  assert.match(box.out[0].text, /http:\/\/localhost:3000\/admin/);
  assert.doesNotMatch(box.out[0].text, /ChatGPT Plus/, 'sự kiện cũ không gửi lại');
  assert.doesNotMatch(box.out[0].text, /Gửi OTP/);
  assert.equal((await sendAlerts(ctx, { send: box.send })).skipped, 'nothing', 'đã báo rồi thì thôi');
  assert.ok(get(ctx.db, "SELECT 1 FROM events WHERE type = 'alert_mail_sent'"));
});

test('Báo động: giãn cách 15 phút, gộp chuyện xảy ra trong lúc chờ; quá 12 thư / ngày thì ngừng tới ngày sau', async () => {
  const ctx = alertCtx();
  seed(ctx);
  const box = mailbox();
  await sendAlerts(ctx, { send: box.send }); // ghi mốc
  logEvent(ctx, { type: 'tool_sold_out', severity: 'red', data: { tool: 'A' } });
  assert.equal((await sendAlerts(ctx, { send: box.send })).sent, 1);
  logEvent(ctx, { type: 'tool_sold_out', severity: 'red', data: { tool: 'B' } });
  ctx.clock.advance(5 * MIN);
  logEvent(ctx, { type: 'tool_sold_out', severity: 'red', data: { tool: 'C' } });
  assert.equal((await sendAlerts(ctx, { send: box.send })).skipped, 'gap');
  ctx.clock.advance(ALERT_GAP);
  assert.equal((await sendAlerts(ctx, { send: box.send })).sent, 1);
  assert.match(box.out[1].text, /\bB\b[\s\S]*\bC\b/, 'thư sau gộp cả B và C');
  for (let i = box.out.length; i < ALERT_DAY_CAP; i++) {
    ctx.clock.advance(ALERT_GAP);
    logEvent(ctx, { type: 'tool_sold_out', severity: 'red', data: { tool: `X${i}` } });
    assert.equal((await sendAlerts(ctx, { send: box.send })).sent, 1);
  }
  ctx.clock.advance(ALERT_GAP);
  logEvent(ctx, { type: 'tool_sold_out', severity: 'red', data: { tool: 'quá-hạn-mức' } });
  assert.equal((await sendAlerts(ctx, { send: box.send })).skipped, 'day_cap');
  ctx.clock.advance(DAY);
  assert.equal((await sendAlerts(ctx, { send: box.send })).sent, 1, 'ngày mới gửi tiếp');
  assert.match(box.out.at(-1).text, /quá-hạn-mức/, 'chuyện bị hoãn vẫn được báo');
});

test('Báo động: gửi lỗi thì giữ nguyên, lần sau gửi lại; mục Máy chủ chuyển đỏ → báo, ổn lại → báo "Đã ổn lại"', async () => {
  const ctx = alertCtx();
  const { tools } = seed(ctx);
  const box = mailbox();
  await sendAlerts(ctx, { send: box.send }); // ghi mốc
  run(ctx.db, 'UPDATE tools SET auto_worker = 1 WHERE id = ?', tools.capcut.id); // bot Canva chưa liên lạc → đỏ
  const fail = await sendAlerts(ctx, { send: async () => ({ ok: false, error: 'Cloudflare 500' }) });
  assert.equal(fail.skipped, 'failed');
  ctx.clock.advance(ALERT_GAP);
  assert.equal((await sendAlerts(ctx, { send: box.send })).sent, 1);
  assert.match(box.out[0].subject, /Bot Canva/);
  assert.match(box.out[0].text, /MÁY CHỦ CẦN XỬ LÝ/);
  ctx.clock.advance(ALERT_GAP);
  assert.equal((await sendAlerts(ctx, { send: box.send })).skipped, 'nothing', 'vẫn đỏ thì không nhắc lại mỗi 15 phút');
  run(ctx.db, "INSERT INTO kv(key, value, updated_at) VALUES('worker:canva-mac', 'heartbeat', ?)", ctx.now());
  assert.equal((await sendAlerts(ctx, { send: box.send })).sent, 1);
  assert.match(box.out[1].subject, /^\[TBQ\] Đã ổn lại: Bot Canva/);
});

test('Báo động: không có ALERT_EMAILS thì không làm gì', async () => {
  const ctx = createTestCtx();
  seed(ctx);
  logEvent(ctx, { type: 'tool_sold_out', severity: 'red', data: {} });
  assert.equal((await sendAlerts(ctx, { send: async () => assert.fail('không được gửi') })).skipped, 'off');
});

test('Máy chủ: hạn mức gửi thư — ≥70% vàng, ≥90% đỏ; không hỏi được thì vàng; kênh SMS thì không hiện', async () => {
  const env = { OTP_PROVIDER: 'email', LOGIN_BY: 'email', CF_ACCOUNT_ID: 'acc', CF_EMAIL_TOKEN: 'tok', MAIL_FROM: 'xacnhan@tiem.test' };
  const ctx = createTestCtx({ env: { DB_PATH: ':memory:', ...env } });
  seed(ctx);
  assert.equal(pick(hostChecks(ctx), 'mailquota'), undefined, 'chưa hỏi lần nào');
  const quota = (sent) => async (url, opts) => {
    assert.match(url, /\/accounts\/acc\/email\/sending\/limits$/);
    assert.equal(opts.headers.Authorization, 'Bearer tok');
    return new Response(JSON.stringify({ success: true, result: { quota: { value: 200, unit: 'day' }, usage: { sent, resets_at: new Date(ctx.now() + 3 * 3600_000).toISOString() } } }));
  };
  await fetchMailQuota(ctx, { fetchImpl: quota(12) });
  const ok = pick(hostChecks(ctx), 'mailquota');
  assert.equal(ok.level, 'ok');
  assert.match(ok.value, /đã gửi 12 \/ 200 thư \(6%\) · làm mới sau 3 giờ/);
  await fetchMailQuota(ctx, { fetchImpl: quota(150) });
  assert.equal(pick(hostChecks(ctx), 'mailquota').level, 'warn');
  await fetchMailQuota(ctx, { fetchImpl: quota(185) });
  assert.equal(pick(hostChecks(ctx), 'mailquota').level, 'bad');
  await fetchMailQuota(ctx, { fetchImpl: async () => new Response(JSON.stringify({ success: false, errors: [{ code: 10000 }] }), { status: 403 }) });
  const no = pick(hostChecks(ctx), 'mailquota');
  assert.equal(no.level, 'warn');
  assert.match(no.value, /Cloudflare 10000/);
  const sms = createTestCtx({ env: { OTP_PROVIDER: 'esms', LOGIN_BY: 'phone' } });
  seed(sms);
  assert.equal(pick(hostChecks(sms), 'mailquota'), undefined);
});

test('Dọn dữ liệu: máy chỉ ghé xem quá hạn thì xoá; máy có khách / slot / phiếu / bị khoá / có điểm rủi ro thì giữ', () => {
  const ctx = createTestCtx();
  const { tools, cafe } = seed(ctx);
  const t = ctx.now();
  const dev = (id, extra = {}) => run(ctx.db, 'INSERT INTO devices(id, status, risk, created_at, last_seen_at) VALUES(?, ?, ?, ?, ?)',
    id, extra.status || 'active', extra.risk || 0, extra.at ?? t, extra.at ?? t);
  const days = ctx.settings().retentionEventsDays;
  const old = t - (days + 1) * DAY;
  dev('chi-ghe-xem-cu', { at: old });
  dev('chi-ghe-xem-moi');
  dev('co-khach', { at: old });
  dev('co-slot', { at: old });
  dev('bi-khoa', { at: old, status: 'locked' });
  dev('co-diem', { at: old, risk: 20 });
  const cust = run(ctx.db, "INSERT INTO customers(phone, status, consent_at, consent_version, created_at) VALUES('a@b.vn', 'active', ?, 1, ?)", t, t).lastInsertRowid;
  run(ctx.db, 'INSERT INTO device_customers(device_id, customer_id, first_seen_at) VALUES(?, ?, ?)', 'co-khach', cust, old);
  run(ctx.db, "INSERT INTO slots(customer_id, tool_id, cafe_id, device_id, status, created_at) VALUES(?, ?, ?, 'co-slot', 'expired', ?)", cust, tools.capcut.id, cafe.id, old);
  const r = retention(ctx);
  assert.equal(r.devices, 1);
  const left = new Set(ctx.db.prepare('SELECT id FROM devices').all().map((d) => d.id));
  assert.ok(!left.has('chi-ghe-xem-cu'));
  for (const id of ['chi-ghe-xem-moi', 'co-khach', 'co-slot', 'bi-khoa', 'co-diem']) assert.ok(left.has(id), id);
});
