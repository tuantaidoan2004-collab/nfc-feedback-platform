// Trang Quản trị › Gia hạn: khách gia hạn qua Zalo (không còn ô nhập mã / nút xin) → chủ tìm khách theo email / số slot rồi bấm Gia hạn.
// (Rà 08/10/2026: vẫn cho tạo "mã gia hạn" mà khách không có chỗ nhập; trang không có ô tìm; link "Gia hạn ›" ở trang khách không lọc.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestCtx, seed, makeCustomer, startTestServer, T0 } from './helpers.js';
import { run, get } from '../src/db/index.js';
import { HOUR, DAY } from '../src/lib/time.js';

test('Gia hạn: tìm theo email / số slot, lọc theo khách, báo hạn mới, không tạo mã gia hạn', async () => {
  const ctx = createTestCtx();
  const { tools, accounts, cafe, card } = seed(ctx);
  const srv = await startTestServer(ctx);
  try {
    const an = makeCustomer(ctx, 'an.nguyen@example.test');
    const binh = makeCustomer(ctx, 'binh.tran@example.test');
    const slot = (c, acc, tool, exp, status = 'active') => run(ctx.db, `INSERT INTO slots(customer_id, tool_id, account_id, cafe_id, card_id, device_id, status, created_at, started_at, expires_at)
      VALUES(?, ?, ?, ?, ?, 'dev-1', ?, ?, ?, ?)`, c.id, tool, acc, cafe.id, card.id, status, T0, T0, exp).lastInsertRowid;
    const sAn = slot(an, accounts.capcut1.id, tools.capcut.id, T0 + 5 * HOUR);
    const sBinh = slot(binh, accounts.gpt1.id, tools.chatgpt.id, T0 + 5 * HOUR);

    const admin = srv.client();
    await admin.postForm('/admin/login', { password: ctx.config.adminPassword });
    let page = await admin.get('/admin/gia-han');
    const csrf = page.text.match(/name="_csrf" value="([^"]+)"/)[1];
    const msg = (r) => new URL(r.headers.get('location'), 'http://x').searchParams.get('msg');
    const loc = (r) => new URL(r.headers.get('location'), 'http://x');
    const rows = (p) => [...p.text.matchAll(/action="\/admin\/gia-han\/(\d+)"/g)].map((m) => Number(m[1]));

    // Không còn nút tạo mã gia hạn, không còn mục "Yêu cầu đang chờ" rỗng.
    assert.doesNotMatch(page.text, /Tạo mã gia hạn/);
    assert.doesNotMatch(page.text, /Yêu cầu đang chờ/);
    assert.deepEqual(rows(page).sort(), [sAn, sBinh].sort());

    // Tìm theo một phần email, theo số slot (#n).
    assert.deepEqual(rows(await admin.get('/admin/gia-han?q=binh.tran')), [sBinh]);
    assert.deepEqual(rows(await admin.get(`/admin/gia-han?q=%23${sAn}`)), [sAn]);
    assert.deepEqual(rows(await admin.get('/admin/gia-han?q=khong-co-ai')), []);
    // Ký tự % không làm khớp mọi người.
    assert.deepEqual(rows(await admin.get('/admin/gia-han?q=%25')), []);

    // Trang khách → "Gia hạn ›" lọc đúng khách.
    page = await admin.get(`/admin/customers/${an.id}`);
    assert.match(page.text, new RegExp(`href="/admin/gia-han\\?customer=${an.id}"`));
    page = await admin.get(`/admin/gia-han?customer=${an.id}`);
    assert.deepEqual(rows(page), [sAn]);

    // Gia hạn từ trang đang lọc → quay về đúng trang lọc, báo hạn mới.
    let r = await admin.postForm(`/admin/gia-han/${sAn}`, { _csrf: csrf, days: '2', back: `/admin/gia-han?customer=${an.id}` });
    assert.equal(loc(r).pathname, '/admin/gia-han');
    assert.equal(loc(r).searchParams.get('customer'), String(an.id));
    assert.match(msg(r), new RegExp(`Slot #${sAn}: đã thêm 2 ngày — dùng tới`));
    assert.equal(get(ctx.db, 'SELECT expires_at FROM slots WHERE id = ?', sAn).expires_at, T0 + 5 * HOUR + 2 * DAY);
    // back lạ → về trang Gia hạn thường.
    r = await admin.postForm(`/admin/gia-han/${sAn}`, { _csrf: csrf, days: '1', back: 'https://evil.example/' });
    assert.equal(loc(r).pathname, '/admin/gia-han');
    assert.equal(loc(r).search.includes('evil'), false);

    // Tài khoản sắp hết hạn → câu cho chủ, không phải câu "Nhắn Zalo Tiệm" của khách.
    run(ctx.db, 'UPDATE tools SET account_days = 1 WHERE id = ?', tools.chatgpt.id);
    run(ctx.db, 'UPDATE accounts SET created_at = ? WHERE id = ?', T0 - 19 * HOUR, accounts.gpt1.id);
    r = await admin.postForm(`/admin/gia-han/${sBinh}`, { _csrf: csrf, days: '1' });
    assert.match(msg(r), /đổi khách sang tài khoản khác/);
    assert.doesNotMatch(msg(r), /Nhắn Zalo/);

    // Yêu cầu cũ của slot đã kết thúc: không hiện, không tính số đỏ.
    run(ctx.db, "INSERT INTO extend_requests(slot_id, customer_id, days, created_at) VALUES(?, ?, 1, ?)", sBinh, binh.id, T0);
    page = await admin.get('/admin/gia-han');
    assert.match(page.text, /Yêu cầu đang chờ \(1\)/);
    run(ctx.db, "UPDATE slots SET status = 'expired' WHERE id = ?", sBinh);
    page = await admin.get('/admin/gia-han');
    assert.doesNotMatch(page.text, /Yêu cầu đang chờ/);

    // Mã phiếu: không còn loại Gia hạn khi tạo; gửi tay kind=extend bị chặn.
    page = await admin.get('/admin/vouchers');
    assert.doesNotMatch(page.text, /<option value="extend"[^>]*>Gia hạn \(dùng thêm/);
    r = await admin.postForm('/admin/vouchers', { _csrf: csrf, kind: 'extend', count: '3', days: '1' });
    assert.match(msg(r), /Không cần mã gia hạn/);
    assert.equal(get(ctx.db, "SELECT COUNT(*) AS n FROM vouchers WHERE kind = 'extend'").n, 0);
  } finally {
    await srv.close();
  }
});
