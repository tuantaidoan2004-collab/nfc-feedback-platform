// Trang Quản trị › Máy chủ: báo đúng những gì làm khách không nhận được công cụ (trang công khai, sao lưu, ổ đĩa, RAM, bot Canva,
// gửi mã, database); số đỏ hiện ở thanh bên + "Việc của bạn hôm nay"; tự kiểm trang công khai mỗi 5 phút (chỉ production).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTestCtx, seed, startTestServer } from './helpers.js';
import { run } from '../src/db/index.js';
import { logEvent } from '../src/lib/events.js';
import { hostChecks, probePublic, lastProbe, ago } from '../src/domain/may-chu.js';
import { runJobs } from '../src/jobs.js';
import { MIN, HOUR } from '../src/lib/time.js';

function withDataDir() {
  const dir = mkdtempSync(join(tmpdir(), 'tbq-may-chu-'));
  mkdirSync(join(dir, 'backup'));
  writeFileSync(join(dir, 'tbq.sqlite'), 'x'.repeat(2048));
  return dir;
}
const pick = (checks, key) => checks.find((c) => c.key === key);
const okFetch = async () => new Response('ok', { status: 200 });

test('Máy chủ: sao lưu — chưa có / cũ quá 26 giờ thì đỏ, mới thì ổn', () => {
  const dir = withDataDir();
  try {
    const ctx = createTestCtx({ now: Date.now(), env: { DB_PATH: join(dir, 'tbq.sqlite') } });
    seed(ctx);
    assert.equal(pick(hostChecks(ctx), 'backup').level, 'bad');
    const f = join(dir, 'backup', 'tbq-2026-10-09.sqlite');
    writeFileSync(f, 'b');
    const old = (Date.now() - 30 * HOUR) / 1000;
    utimesSync(f, old, old);
    const stale = pick(hostChecks(ctx), 'backup');
    assert.equal(stale.level, 'bad');
    assert.match(stale.value, /giờ trước|ngày trước/);
    utimesSync(f, Date.now() / 1000, Date.now() / 1000);
    assert.equal(pick(hostChecks(ctx), 'backup').level, 'ok');
    // Ổ đĩa + database đọc được từ thư mục dữ liệu thật.
    assert.match(pick(hostChecks(ctx), 'disk').value, /đã dùng \d+%/);
    assert.match(pick(hostChecks(ctx, { deep: true }), 'db').value, /nguyên vẹn/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('Máy chủ: bot Canva chỉ báo khi có công cụ dùng bot; im lặng > 30 phút thì đỏ', () => {
  const ctx = createTestCtx();
  const { tools } = seed(ctx);
  assert.equal(pick(hostChecks(ctx), 'bot'), undefined, 'không công cụ nào dùng bot → không báo');
  run(ctx.db, 'UPDATE tools SET auto_worker = 1 WHERE id = ?', tools.capcut.id);
  assert.equal(pick(hostChecks(ctx), 'bot').level, 'bad', 'chưa liên lạc lần nào');
  run(ctx.db, "INSERT INTO kv(key, value, updated_at) VALUES('worker:canva-mac', 'heartbeat', ?)", ctx.now());
  assert.equal(pick(hostChecks(ctx), 'bot').level, 'ok');
  ctx.clock.advance(10 * MIN);
  assert.equal(pick(hostChecks(ctx), 'bot').level, 'warn');
  ctx.clock.advance(25 * MIN);
  assert.equal(pick(hostChecks(ctx), 'bot').level, 'bad');
  run(ctx.db, 'UPDATE tools SET enabled = 0 WHERE id = ?', tools.capcut.id);
  assert.equal(pick(hostChecks(ctx), 'bot'), undefined, 'công cụ dùng bot đã tắt → không báo');
});

test('Máy chủ: gửi mã lỗi trong 1 giờ qua thì đỏ, quá 1 giờ thì hết', () => {
  const ctx = createTestCtx();
  seed(ctx);
  assert.equal(pick(hostChecks(ctx), 'otp').level, 'ok');
  logEvent(ctx, { type: 'otp_send_failed', severity: 'red', data: { error: 'quota' } });
  const c = pick(hostChecks(ctx), 'otp');
  assert.equal(c.level, 'bad');
  assert.match(c.value, /1 lần lỗi/);
  ctx.clock.advance(HOUR + MIN);
  assert.equal(pick(hostChecks(ctx), 'otp').level, 'ok');
});

test('Máy chủ: tự kiểm trang công khai — lỗi / quá giờ / ổn; chỉ hiện ở production', async () => {
  const ctx = createTestCtx();
  seed(ctx);
  assert.equal(pick(hostChecks(ctx), 'public'), undefined, 'chạy thử trên máy (không production) → không kiểm');
  ctx.config.isProd = true;
  assert.equal(pick(hostChecks(ctx), 'public').level, 'warn', 'chưa kiểm lần nào');

  const bad = await probePublic(ctx, { fetchImpl: async () => new Response('Bad gateway', { status: 502 }) });
  assert.equal(bad.ok, false);
  assert.match(pick(hostChecks(ctx), 'public').value, /HTTP 502/);
  assert.equal(pick(hostChecks(ctx), 'public').level, 'bad');

  const slow = await probePublic(ctx, { timeoutMs: 50, fetchImpl: (url, { signal }) => new Promise((_, rej) => signal.addEventListener('abort', () => rej(signal.reason))) });
  assert.equal(slow.ok, false);
  assert.match(slow.error, /không trả lời/);

  await probePublic(ctx, { fetchImpl: okFetch });
  assert.equal(pick(hostChecks(ctx), 'public').level, 'ok');
  ctx.clock.advance(20 * MIN);
  assert.equal(pick(hostChecks(ctx), 'public').level, 'warn', 'việc tự kiểm ngừng chạy');
});

test('Máy chủ: việc nền tự kiểm 5 phút / lần (production), không kiểm khi chạy thử', async () => {
  const ctx = createTestCtx();
  seed(ctx);
  const srv = await startTestServer(ctx);
  try {
    await runJobs(ctx);
    assert.equal(lastProbe(ctx), null, 'không production → không gọi mạng');
    ctx.config.isProd = true;
    const out = await runJobs(ctx);
    assert.equal(out.selfCheck.ok, true, 'gọi được /healthz của chính nó');
    const again = await runJobs(ctx);
    assert.equal(again.selfCheck, undefined, 'chưa đủ 5 phút → không gọi lại');
    ctx.clock.advance(5 * MIN);
    assert.equal((await runJobs(ctx)).selfCheck.ok, true);
  } finally { await srv.close(); }
});

test('Máy chủ: trang quản trị — bảng sức khoẻ, số đỏ ở thanh bên + Việc hôm nay, nút Kiểm lại ngay', async () => {
  const ctx = createTestCtx({ env: { DB_PATH: ':memory:' } });
  const { tools } = seed(ctx);
  run(ctx.db, 'UPDATE tools SET auto_worker = 1 WHERE id = ?', tools.capcut.id); // bot chưa liên lạc → 1 mục đỏ
  const srv = await startTestServer(ctx);
  try {
    const admin = srv.client();
    assert.equal((await admin.get('/admin/may-chu')).status, 303, 'chưa đăng nhập → về trang đăng nhập');
    await admin.postForm('/admin/login', { password: ctx.config.adminPassword });
    const home = (await admin.get('/admin')).text;
    assert.match(home, /href="\/admin\/may-chu"[^>]*>.*Máy chủ<\/span><span class="nb">1<\/span>/s);
    assert.match(home, /<b>1<\/b>mục máy chủ đang đỏ/);
    const page = (await admin.get('/admin/may-chu')).text;
    for (const s of ['Bot Canva', 'Gửi mã đăng nhập', 'RAM', 'Cần xử lý', 'Phiên bản', 'App chạy liền', '/healthz']) assert.ok(page.includes(s), s);
    assert.doesNotMatch(page, /Trang khách \(qua internet\)/, 'không production → không có mục tự kiểm');

    ctx.config.isProd = true;
    const csrf = page.match(/data-csrf="([^"]+)"/)[1];
    const r = await admin.postForm('/admin/may-chu/kiem', { _csrf: csrf });
    assert.equal(r.status, 303);
    assert.match(decodeURIComponent(r.headers.get('location')), /Trang khách trả lời trong \d+ ms/);
    assert.equal(lastProbe(ctx).ok, true);
    assert.match((await admin.get('/admin/may-chu')).text, /Trang khách \(qua internet\)/);
    assert.equal((await admin.postForm('/admin/may-chu/kiem', { _csrf: 'sai' })).status, 403, 'sai CSRF → chặn');
  } finally { await srv.close(); }
});

test('ago(): chữ thời gian dễ đọc', () => {
  const now = Date.now();
  assert.equal(ago(now, now), 'vừa xong');
  assert.equal(ago(now - 3 * MIN, now), '3 phút trước');
  assert.equal(ago(now - 5 * HOUR, now), '5 giờ trước');
  assert.equal(ago(now - 72 * HOUR, now), '3 ngày trước');
});

test('memAvailable(): đọc MemAvailable trên Linux, null nơi khác (không báo RAM sai trên Mac)', async () => {
  const { memAvailable } = await import('../src/domain/may-chu.js');
  assert.equal(memAvailable(() => 'MemTotal:  3960000 kB\nMemFree:  100000 kB\nMemAvailable:  3400000 kB\n'), 3400000 * 1024);
  assert.equal(memAvailable(() => { throw new Error('ENOENT'); }), null);
  assert.equal(memAvailable(() => 'MemTotal: 1 kB\n'), null);
});
