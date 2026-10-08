// Trang Quản trị › Quán: giờ mở cửa không làm quán đóng cả ngày, quán QS tự thêm có nhãn, lỗi giữ chữ đã gõ, Nhật ký lọc đúng quán.
// (Rà 08/10/2026: giờ bắt đầu = giờ kết thúc → inHourRange luôn sai → khách không nhận được gì; điền 1 ô → "7h–nullh";
//  2 quán QS tự thêm trên máy thật trông như quán chủ thêm; lỗi lưu về danh sách mất chữ; số suất âm.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestCtx, seed, startTestServer } from './helpers.js';
import { get } from '../src/db/index.js';
import { logEvent } from '../src/lib/events.js';
import { createCafe } from '../src/domain/presence.js';

test('Quán: kiểm giờ mở cửa / số suất, nhãn "QS tự thêm", lỗi giữ chữ, Nhật ký lọc theo quán', async () => {
  const ctx = createTestCtx();
  const { cafe } = seed(ctx);
  const srv = await startTestServer(ctx);
  try {
    const admin = srv.client();
    await admin.postForm('/admin/login', { password: ctx.config.adminPassword });
    let page = await admin.get('/admin/cafes');
    const csrf = page.text.match(/name="_csrf" value="([^"]+)"/)[1];
    const base = { _csrf: csrf, name: 'Cà phê Test 24h', address: '1 Test, Q1', qs_slug: 'quan-test', daily_quota: '20', status: 'active' };
    const row = () => get(ctx.db, 'SELECT * FROM cafes WHERE id = ?', cafe.id);

    // Giờ bắt đầu = kết thúc → không lưu (trước: quán đóng cả ngày).
    let r = await admin.postForm(`/admin/cafes/${cafe.id}`, { ...base, name: 'Tên mới chưa lưu', open_hour: '0', close_hour: '0' });
    assert.equal(r.status, 200);
    assert.match(r.text, /Chưa lưu: Giờ bắt đầu và kết thúc đều là 0h → quán sẽ đóng cả ngày/);
    assert.match(r.text, /name="name" value="Tên mới chưa lưu"/, 'giữ chữ vừa gõ');
    assert.equal(row().name, 'Cà phê Test 24h');
    // Điền 1 ô → không lưu.
    assert.match((await admin.postForm(`/admin/cafes/${cafe.id}`, { ...base, open_hour: '7' })).text, /Điền cả giờ bắt đầu và giờ kết thúc/);
    // Số suất âm / quá lớn → không lưu.
    assert.match((await admin.postForm(`/admin/cafes/${cafe.id}`, { ...base, daily_quota: '-5' })).text, /Số suất mới \/ ngày từ 0 đến 500/);
    // Quán mở qua đêm 22h–6h → lưu được.
    r = await admin.postForm(`/admin/cafes/${cafe.id}`, { ...base, open_hour: '22', close_hour: '6' });
    assert.equal(r.status, 303);
    assert.equal(row().open_hour, 22);
    assert.equal(row().close_hour, 6);
    // Ô sửa nhanh số suất: số âm → 0.
    await admin.postForm(`/admin/cafes/${cafe.id}/quota`, { _csrf: csrf, daily_quota: '-3' });
    assert.equal(row().daily_quota, 0);

    // Thêm quán lỗi → vẽ lại form thêm với chữ đã gõ.
    r = await admin.postForm('/admin/cafes', { _csrf: csrf, name: 'Quán Mới Toanh', address: '9 Lê Lợi', open_hour: '8', close_hour: '8', daily_quota: '10' });
    assert.equal(r.status, 200);
    assert.match(r.text, /Chưa thêm:/);
    assert.match(r.text, /name="name" value="Quán Mới Toanh"/);
    assert.match(r.text, /name="address" value="9 Lê Lợi"/);
    assert.equal(get(ctx.db, "SELECT COUNT(*) AS n FROM cafes WHERE name = 'Quán Mới Toanh'").n, 0);

    // Quán QS tự thêm (Tài bấm Mở cho quán chưa có ở Tiệm) → nhãn ở danh sách + trang quán.
    const qid = createCafe(ctx, { name: 'Quán của @tai', qsSlug: 'k9kr5y', dailyQuota: 20 });
    logEvent(ctx, { type: 'qs_api_cafe_opened', severity: 'yellow', cafeId: qid, data: { shop: 'k9kr5y', created: true } });
    page = await admin.get('/admin/cafes');
    assert.match(page.text, /Quán của @tai<\/a> <span title="Tài mở chương trình trên QS lúc [^"]+"><span class="badge[^"]*">QS tự thêm/);
    assert.match((await admin.get(`/admin/cafes/${qid}`)).text, /Quán này do Tài mở chương trình trên QS/);
    assert.doesNotMatch((await admin.get(`/admin/cafes/${cafe.id}`)).text, /QS tự thêm/);

    // "Link bị từ chối" → Nhật ký lọc đúng quán.
    logEvent(ctx, { type: 'ticket_rejected', severity: 'yellow', cafeId: cafe.id, data: { error: 'bad_sig' } });
    logEvent(ctx, { type: 'ticket_rejected', severity: 'yellow', cafeId: qid, data: { error: 'bad_sig' } });
    page = await admin.get(`/admin/cafes/${cafe.id}`);
    assert.match(page.text, new RegExp(`href="/admin/events\\?type=ticket_rejected&amp;cafe=${cafe.id}"`));
    page = await admin.get(`/admin/events?type=ticket_rejected&cafe=${cafe.id}`);
    assert.match(page.text, /1 sự kiện · .* · quán Cà phê Test 24h/);
  } finally {
    await srv.close();
  }
});
