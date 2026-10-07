import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestCtx, seed, makeCustomer, makeDevice, makeSession, startTestServer, makeNfcCard, T0 } from './helpers.js';
import { cafeReport } from '../src/domain/stats.js';
import { logEvent } from '../src/lib/events.js';
import { run, get } from '../src/db/index.js';
import { startOfLocalDay, DAY, HOUR } from '../src/lib/time.js';

/**
 * Quán Test (2 suất/ngày): khách A dùng thử 03/10 và 05/10 lúc 20h (khách quay lại), khách B 05/10 lúc 3h sáng,
 * khách C bị từ chối (không tính), 1 lượt ở quán khác (không tính), 3 lượt vào hợp lệ + 1 lượt lúc quán tạm dừng, 2 lượt bấm Zalo.
 */
function setup() {
  const ctx = createTestCtx();
  const data = seed(ctx);
  run(ctx.db, 'UPDATE cafes SET daily_quota = 2 WHERE id = ?', data.cafe.id);
  const other = run(ctx.db, "INSERT INTO cafes(name, display_token, code_secret, created_at) VALUES('Quán khác', 'd2', 's2', ?)", T0).lastInsertRowid;
  const [a, b, c] = ['84911111111', '84922222222', '84933333333'].map((p) => makeCustomer(ctx, p));
  const slot = (customer, at, { cafeId = data.cafe.id, status = 'expired', started = true } = {}) => run(ctx.db,
    `INSERT INTO slots(customer_id, tool_id, account_id, cafe_id, card_id, device_id, status, created_at, started_at)
     VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    customer.id, data.tools.chatgpt.id, data.accounts.gpt1.id, cafeId, cafeId === data.cafe.id ? data.card.id : null, `dev-${customer.id}`, status, at, started ? at : null);
  slot(a, T0 - 2 * DAY);
  slot(a, T0, { status: 'active' });
  slot(b, T0 - 17 * HOUR);
  slot(c, T0 - HOUR, { status: 'rejected', started: false });
  slot(c, T0 - HOUR, { cafeId: other });
  const tap = (verdict, device, at = T0) => run(ctx.db, 'INSERT INTO taps(card_id, cafe_id, device_id, verdict, created_at) VALUES(?, ?, ?, ?, ?)', data.card.id, data.cafe.id, device, verdict, at);
  tap('ok', 'dev-a'); tap('ok', 'dev-a', T0 - 2 * DAY); tap('ok', 'dev-b'); tap('locked', 'dev-x');
  logEvent(ctx, { type: 'zalo_click', cafeId: data.cafe.id });
  logEvent(ctx, { type: 'zalo_click', cafeId: data.cafe.id });
  logEvent(ctx, { type: 'zalo_click', cafeId: other });
  const today = startOfLocalDay(T0, 420);
  return { ctx, ...data, a, range: { since: today - 6 * DAY, until: today + DAY } };
}

test('cafeReport: chỉ đếm lượt đã bắt đầu ở đúng quán; khách quay lại; theo giờ VN; ngày hết suất', () => {
  const { ctx, cafe, range } = setup();
  const r = cafeReport(ctx, cafe.id, range);
  assert.equal(r.trials, 3);
  assert.equal(r.customers, 2);
  assert.equal(r.returning, 1, 'chỉ khách A quay lại vào ngày khác');
  assert.equal(r.taps, 3);
  assert.equal(r.tapDevices, 2);
  assert.equal(r.zaloClicks, 2);
  assert.equal(r.byHour[20], 2);
  assert.equal(r.byHour[3], 1, '20:00 UTC = 3 giờ sáng giờ VN');
  assert.deepEqual(r.byTool.map((x) => [x.name, x.n]), [['ChatGPT Plus', 3]]);
  assert.equal(r.byDay.length, 7);
  assert.equal(r.byDay.at(-1).day, '2026-10-05');
  assert.deepEqual({ ...r.byDay.at(-1) }, { day: '2026-10-05', taps: 2, devices: 2, trials: 2, customers: 2, zalo: 2, full: true });
  assert.equal(r.byDay.at(-3).trials, 1);
  assert.equal(r.fullDays, 1);
  assert.deepEqual(r.byCard.map((k) => [k.kind, k.taps, k.trials]), [['qs', 3, 3]]);
  assert.equal(cafeReport(ctx, 9999, range), null);

  // Thêm thẻ NFC riêng: 1 lượt chạm + 1 lượt dùng thử qua thẻ → dòng riêng sau lối vào QS.
  const nfc = makeNfcCard(ctx, cafe, 'Bàn 3');
  run(ctx.db, "INSERT INTO taps(card_id, cafe_id, device_id, verdict, created_at) VALUES(?, ?, 'dev-n', 'ok', ?)", nfc.id, cafe.id, T0);
  run(ctx.db, "INSERT INTO taps(card_id, cafe_id, device_id, verdict, created_at) VALUES(?, ?, 'dev-z', 'replay', ?)", nfc.id, cafe.id, T0);
  run(ctx.db, `INSERT INTO slots(customer_id, tool_id, cafe_id, card_id, device_id, status, created_at, started_at)
    SELECT customer_id, tool_id, cafe_id, ?, 'dev-n', 'expired', ?, ? FROM slots LIMIT 1`, nfc.id, T0, T0);
  assert.deepEqual(cafeReport(ctx, cafe.id, range).byCard.map((k) => [k.kind, k.label, k.taps, k.trials]),
    [['qs', 'Từ trang quán (Quite Sensational)', 3, 3], ['nfc', 'Bàn 3', 1, 1]]);
});

test('trang báo cáo + CSV trong quản trị; nút "Mua qua Zalo" đếm theo quán, không ghi khách', async () => {
  const { ctx, cafe, a } = setup();
  const srv = await startTestServer(ctx);
  try {
    const admin = srv.client();
    assert.equal((await admin.get(`/admin/cafes/${cafe.id}/report`)).status, 303, 'chưa đăng nhập → về trang đăng nhập');
    await admin.postForm('/admin/login', { password: ctx.config.adminPassword });
    const page = await admin.get(`/admin/cafes/${cafe.id}/report?range=7d`);
    assert.equal(page.status, 200);
    assert.match(page.text, /Thống kê: Cà phê Test 24h/);
    assert.match(page.text, /Khách quay lại/);
    assert.match(page.text, /Theo lối vào[\s\S]*Trang quán \(QS\)/);
    assert.doesNotMatch(page.text, /849111|0911 ?111/, 'không lộ số điện thoại');
    for (const k of ['30d', 'month', 'prev', 'linh-tinh']) assert.equal((await admin.get(`/admin/cafes/${cafe.id}/report?range=${k}`)).status, 200);
    const csv = await admin.get(`/admin/cafes/${cafe.id}/report.csv?range=7d`);
    assert.match(csv.headers.get('content-type'), /text\/csv/);
    assert.match(csv.text, /"2026-10-05","2","2","2","2","2","có"/);
    assert.equal((await admin.get('/admin/cafes/9999/report')).status, 404);

    // Khách A (đã có slot) bấm "Mua qua Zalo" 2 lần trong ngày → chỉ tính 1, chuyển sang Zalo.
    const deviceId = 'device-zzzzzzzzzzzzzzzz';
    makeDevice(ctx, deviceId, a.id);
    const { token } = makeSession(ctx, { customerId: a.id, deviceId });
    const before = get(ctx.db, "SELECT COUNT(*) AS n FROM events WHERE type = 'zalo_click'").n;
    const headers = { cookie: `sid=${token}; did=${deviceId}`, 'user-agent': 'Mozilla/5.0 (iPhone)' };
    for (let i = 0; i < 2; i++) {
      const res = await fetch(`${srv.url}/zalo`, { headers, redirect: 'manual' });
      assert.equal(res.status, 302);
      assert.equal(res.headers.get('location'), ctx.settings().zaloUrl);
    }
    const ev = ctx.db.prepare("SELECT * FROM events WHERE type = 'zalo_click' ORDER BY id DESC").all();
    assert.equal(ev.length, before + 1);
    assert.equal(ev[0].cafe_id, cafe.id);
    assert.equal(ev[0].customer_id, null);
    assert.equal(ev[0].device_id, null);
    assert.equal(ev[0].ip, null);
    // Người lạ (chưa đăng nhập) vẫn được chuyển sang Zalo nhưng không tính.
    assert.equal((await fetch(`${srv.url}/zalo`, { redirect: 'manual' })).status, 302);
    assert.equal(get(ctx.db, "SELECT COUNT(*) AS n FROM events WHERE type = 'zalo_click'").n, before + 1);
  } finally {
    await srv.close();
  }
});
