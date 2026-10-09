// Sao lưu ngoài máy chủ (mã hoá + đẩy lên Worker) và bộ canh bên ngoài (extras/canh-ngoai) — đánh giá thương mại 09/10/2026.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createTestCtx, seed } from './helpers.js';
import { sealBackup, openBackup, pushOffsite } from '../src/domain/sao-luu-ngoai.js';
import { hostChecks } from '../src/domain/may-chu.js';
import { HOUR } from '../src/lib/time.js';
import worker from '../extras/canh-ngoai/index.js';

const KEY = randomBytes(32).toString('base64');
const TOKEN = 'k'.repeat(40);
const pick = (checks, key) => checks.find((c) => c.key === key);

/** KV giả đủ dùng cho Worker: get(json|arrayBuffer), put(+metadata), list(prefix). */
function fakeKv() {
  const m = new Map();
  return {
    m,
    async get(k, type) { const v = m.get(k)?.v; if (v == null) return null; return type === 'json' ? JSON.parse(v) : v; },
    async put(k, v, opts = {}) { m.set(k, { v, meta: opts.metadata, ttl: opts.expirationTtl }); },
    async list({ prefix }) { return { keys: [...m].filter(([k]) => k.startsWith(prefix)).map(([name, x]) => ({ name, metadata: x.meta })), list_complete: true }; },
  };
}

test('Sao lưu ngoài: mã hoá rồi giải mã ra đúng tệp; sai khoá / tệp sửa đổi thì báo lỗi; Cloudflare không đọc được nội dung', () => {
  const plain = Buffer.from('SQLite format 3\0' + 'khach@email.vn '.repeat(200));
  const sealed = sealBackup(plain, KEY);
  assert.equal(sealed.subarray(0, 5).toString(), 'TBQB1');
  assert.ok(!sealed.includes(Buffer.from('khach@email.vn')), 'không lộ chữ gốc');
  assert.ok(sealed.length < plain.length, 'đã nén');
  assert.deepEqual(openBackup(sealed, KEY), plain);
  assert.throws(() => openBackup(sealed, randomBytes(32).toString('base64')));
  const bad = Buffer.from(sealed); bad[bad.length - 1] ^= 1;
  assert.throws(() => openBackup(bad, KEY));
});

test('Sao lưu ngoài: đẩy lên Worker thật (KV giả) → lấy danh sách → tải về giải mã đúng; sai khoá / tệp chưa mã hoá bị từ chối', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tbq-sl-'));
  try {
    const file = join(dir, 'tbq-2026-10-09.sqlite');
    const plain = randomBytes(5000);
    writeFileSync(file, plain);
    const env = { STATE: fakeKv(), BACKUP_TOKEN: TOKEN };
    const viaWorker = (url, opts = {}) => worker.fetch(new Request(url, opts), env);
    const ctx = createTestCtx({ env: { DB_PATH: ':memory:', OFFSITE_URL: 'https://canh.test/sao-luu', OFFSITE_TOKEN: TOKEN } });
    seed(ctx);
    const config = { ...ctx.config, dataKey: KEY };
    const r = await pushOffsite({ config, db: ctx.db, file, now: ctx.now(), fetchImpl: viaWorker });
    assert.equal(r.ok, true, r.error);
    assert.equal(env.STATE.m.get('sl:tbq-2026-10-09.sqlite').ttl, 35 * 86400, 'tự xoá sau 35 ngày');
    const list = await (await viaWorker('https://canh.test/sao-luu', { headers: { Authorization: `Bearer ${TOKEN}` } })).json();
    assert.equal(list[0].name, 'tbq-2026-10-09.sqlite');
    const got = await viaWorker('https://canh.test/sao-luu/tbq-2026-10-09.sqlite', { headers: { Authorization: `Bearer ${TOKEN}` } });
    assert.deepEqual(openBackup(Buffer.from(await got.arrayBuffer()), KEY), plain);
    assert.equal((await viaWorker('https://canh.test/sao-luu', { headers: { Authorization: 'Bearer sai' } })).status, 401);
    assert.equal((await viaWorker('https://canh.test/sao-luu', { method: 'POST', body: 'chua ma hoa', headers: { Authorization: `Bearer ${TOKEN}`, 'x-ten': 'x.sqlite' } })).status, 400);
    assert.equal((await viaWorker('https://canh.test/sao-luu/..%2F..%2Fstate', { headers: { Authorization: `Bearer ${TOKEN}` } })).status, 400);
    // Trang Máy chủ: vừa đẩy xong → ổn; quá 26 giờ → đỏ; lần đẩy lỗi → đỏ kèm lý do.
    assert.equal(pick(hostChecks(ctx), 'offsite').level, 'ok');
    assert.match(pick(hostChecks(ctx), 'offsite').value, /tbq-2026-10-09\.sqlite · vừa xong · \d+ KB \(đã mã hoá\)/);
    ctx.clock.advance(27 * HOUR);
    assert.equal(pick(hostChecks(ctx), 'offsite').level, 'bad');
    const fail = await pushOffsite({ config: { ...config, offsite: { ...config.offsite, token: 'sai'.repeat(12) } }, db: ctx.db, file, now: ctx.now(), fetchImpl: viaWorker });
    assert.equal(fail.ok, false);
    assert.match(pick(hostChecks(ctx), 'offsite').value, /HTTP 401/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('Sao lưu ngoài: chưa cấu hình thì trang Máy chủ không hiện mục này', () => {
  const ctx = createTestCtx({ env: { DB_PATH: ':memory:' } });
  seed(ctx);
  assert.equal(pick(hostChecks(ctx), 'offsite'), undefined);
});

test('Bộ canh bên ngoài: trang hỏng 3 lần liền → 1 thư báo; còn hỏng thì không gửi thêm; vào lại được → 1 thư "đã vào lại"', async () => {
  const env = { STATE: fakeKv(), TARGET_URL: 'https://thu.test/colap/healthz', ALERT_TO: 'a@x.vn,b@x.vn', MAIL_FROM: 'xacnhan@x.vn', ACCOUNT_ID: 'acc', EMAIL_TOKEN: 'tok', GAP_MS: 0 };
  const realFetch = globalThis.fetch;
  let up = true;
  const calls = { probe: 0, mail: [] };
  globalThis.fetch = async (url, opts = {}) => {
    if (String(url).includes('/email/sending/send')) { calls.mail.push(JSON.parse(opts.body)); return new Response('{"success":true}'); }
    calls.probe++;
    return up ? new Response('ok') : new Response('Bad gateway', { status: 502 });
  };
  const tick = async () => { let p; await worker.scheduled({}, env, { waitUntil: (x) => { p = x; } }); await p; };
  try {
    await tick();
    assert.equal(calls.mail.length, 0, 'đang chạy tốt: không thư, không ghi KV');
    assert.equal(env.STATE.m.size, 0);
    up = false;
    calls.probe = 0;
    await tick();
    assert.equal(calls.probe, 3, 'thử 3 lần trước khi báo');
    assert.equal(calls.mail.length, 2, 'mỗi địa chỉ 1 thư');
    assert.match(calls.mail[0].subject, /KHÔNG VÀO ĐƯỢC/);
    assert.match(calls.mail[0].text, /HTTP 502/);
    await tick();
    assert.equal(calls.mail.length, 2, 'vẫn hỏng: không gửi thêm');
    up = true;
    await tick();
    assert.equal(calls.mail.length, 4);
    assert.match(calls.mail[2].subject, /đã vào lại được/);
    const page = await (await worker.fetch(new Request('https://canh.test/'), env)).text();
    assert.match(page, /^up từ /);
  } finally { globalThis.fetch = realFetch; }
});
