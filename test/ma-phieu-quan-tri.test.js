// Trang Quản trị › Mã phiếu: phiếu tự động không lẫn với phiếu in, không in mã hết hạn, huỷ cả lô, giữ lọc khi huỷ.
// (Rà 08/10/2026: máy thật có 18 phiếu tự động hết hạn nằm thành 2 "lô" có nút In phiếu → in ra 13 phiếu hết hạn; huỷ 1 mã mất lọc lô;
//  ô "Dùng cho công cụ" liệt kê cả món không cần phiếu; CSV ghi trạng thái tiếng Anh.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestCtx, seed, startTestServer } from './helpers.js';
import { run, get, all } from '../src/db/index.js';
import { issueEntryVoucher, formatCode } from '../src/domain/vouchers.js';
import { DAY, HOUR } from '../src/lib/time.js';

test('Mã phiếu: phiếu tự động tách riêng, in chỉ mã còn dùng, huỷ cả lô, giữ lọc', async () => {
  const ctx = createTestCtx();
  const { tools, cafe } = seed(ctx);
  run(ctx.db, 'UPDATE tools SET voucher_code = 1 WHERE id = ?', tools.chatgpt.id);
  const srv = await startTestServer(ctx);
  try {
    const admin = srv.client();
    await admin.postForm('/admin/login', { password: ctx.config.adminPassword });
    let page = await admin.get('/admin/vouchers');
    const csrf = page.text.match(/name="_csrf" value="([^"]+)"/)[1];
    const msg = (r) => new URL(r.headers.get('location'), 'http://x').searchParams.get('msg');
    const loc = (r) => new URL(r.headers.get('location'), 'http://x');

    // Chỉ món cần phiếu mới có ô tick.
    assert.match(page.text, /name="tool_chatgpt"/);
    assert.doesNotMatch(page.text, /name="tool_capcut"/);

    // Lô in 3 mã hạn 1 ngày + 1 phiếu tự động (khách chạm thẻ).
    let r = await admin.postForm('/admin/vouchers', { _csrf: csrf, kind: 'once', count: '3', expiresDays: '1', tool_chatgpt: '1' });
    const batch = loc(r).searchParams.get('batch');
    const auto = issueEntryVoucher(ctx, { deviceId: 'dev-auto-1', cafeId: cafe.id, source: 'nfc' });
    assert.ok(auto);
    page = await admin.get('/admin/vouchers');
    assert.match(page.text, new RegExp(`Lô phiếu in`));
    assert.match(page.text, new RegExp(batch));
    assert.doesNotMatch(page.text, /href="\/admin\/vouchers\/in\?batch=tu-dong/, 'không có nút In cho phiếu tự động');
    assert.doesNotMatch(page.text, new RegExp(formatCode(auto.code)), 'mặc định không liệt kê phiếu tự động');
    assert.match(page.text, /Phiếu tự động/);
    assert.match((await admin.get('/admin/vouchers?src=auto')).text, new RegExp(formatCode(auto.code)));
    assert.equal((await admin.get(`/admin/vouchers/in?batch=${auto.batch}`)).text.match(/class="v"/g), null, 'trang in bỏ phiếu tự động');

    // Huỷ 1 mã khi đang xem lô → quay về đúng lô.
    const [v1, v2] = all(ctx.db, 'SELECT * FROM vouchers WHERE batch = ? ORDER BY id', batch);
    r = await admin.postForm(`/admin/vouchers/${v1.id}/void`, { _csrf: csrf, back: `/admin/vouchers?batch=${batch}` });
    assert.equal(loc(r).searchParams.get('batch'), batch);
    assert.equal(msg(r), 'Đã huỷ mã.');

    // Trang in + CSV: 2 mã còn dùng; CSV tiếng Việt.
    assert.equal((await admin.get(`/admin/vouchers/in?batch=${batch}`)).text.match(/class="v"/g).length, 2);
    assert.match((await admin.get(`/admin/vouchers/in?batch=${batch}`)).text, /Trang slot: .*\/me/);
    let csv = (await admin.get(`/admin/vouchers.csv?batch=${batch}`)).text;
    assert.match(csv, /Đã huỷ/);
    assert.match(csv, /Còn dùng/);
    assert.doesNotMatch(csv, /,active,|,void,/);

    // Quá hạn → trang in không còn phiếu nào, CSV ghi "Hết hạn", không còn nút Huỷ từng mã.
    ctx.clock.advance(DAY + HOUR);
    await admin.postForm('/admin/login', { password: ctx.config.adminPassword }); // phiên quản trị cũng hết hạn sau 1 ngày
    const csrf2 = (await admin.get('/admin/vouchers')).text.match(/name="_csrf" value="([^"]+)"/)[1];
    assert.equal((await admin.get(`/admin/vouchers/in?batch=${batch}`)).text.match(/class="v"/g), null);
    csv = (await admin.get(`/admin/vouchers.csv?batch=${batch}`)).text;
    assert.match(csv, /Hết hạn/);

    // Lô mới không hạn → "Huỷ cả lô" (mất xấp phiếu).
    r = await admin.postForm('/admin/vouchers', { _csrf: csrf2, kind: 'once', count: '5' });
    const b2 = loc(r).searchParams.get('batch');
    page = await admin.get('/admin/vouchers');
    assert.match(page.text, /Huỷ cả lô/);
    r = await admin.postForm('/admin/vouchers/batch/void', { _csrf: csrf2, batch: b2 });
    assert.equal(msg(r), `Đã huỷ 5 mã của lô ${b2}.`);
    assert.equal(get(ctx.db, "SELECT COUNT(*) AS n FROM vouchers WHERE batch = ? AND status = 'void'", b2).n, 5);
    // Không huỷ cả lô phiếu tự động được.
    r = await admin.postForm('/admin/vouchers/batch/void', { _csrf: csrf2, batch: auto.batch });
    assert.equal(msg(r), 'Lô này không còn mã nào dùng được.');
    assert.notEqual(v2.status, 'void');
  } finally {
    await srv.close();
  }
});
