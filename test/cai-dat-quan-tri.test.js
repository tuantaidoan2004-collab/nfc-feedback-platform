// Trang Quản trị › Cài đặt: ô số có khoảng (trước nhận mọi số: OTP 0 giây = không ai đăng nhập được, xoá nhật ký sau 0 ngày = mất hết);
// link Zalo chỉ https:// (nằm trên mọi trang khách); 1 ô sai → không lưu gì, vẽ lại form giữ chữ; nhật ký ghi rõ đổi gì.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestCtx, seed, startTestServer } from './helpers.js';
import { get } from '../src/db/index.js';
import { checkSetting, pairProblems, DEFAULT_SETTINGS } from '../src/lib/settings.js';

test('Cài đặt: khoảng hợp lệ, lưu trọn hoặc không, giữ chữ đã gõ, nhật ký ghi thay đổi', async () => {
  assert.throws(() => checkSetting('otpTtlSec', '0'), /từ 60 đến 1800/);
  assert.throws(() => checkSetting('retentionEventsDays', 0), /từ 7 đến 3650/);
  assert.throws(() => checkSetting('codeWindowSec', '-5'), /từ 60/);
  assert.throws(() => checkSetting('activeSlotsPerCustomer', '1.5'), /số nguyên/);
  assert.throws(() => checkSetting('zaloUrl', 'javascript:alert(1)'), /https/);
  assert.equal(checkSetting('otpTtlSec', ' 120 '), 120);
  assert.deepEqual(pairProblems(DEFAULT_SETTINGS), []);
  assert.match(pairProblems({ ...DEFAULT_SETTINGS, riskYellow: 70 }).join(), /phải nhỏ hơn điểm từ chối/);

  const ctx = createTestCtx();
  seed(ctx);
  const srv = await startTestServer(ctx);
  try {
    const admin = srv.client();
    await admin.postForm('/admin/login', { password: ctx.config.adminPassword });
    let page = await admin.get('/admin/settings');
    const csrf = page.text.match(/name="_csrf" value="([^"]+)"/)[1];
    assert.match(page.text, /<h3>OTP &amp; phiên đăng nhập<\/h3>|<h3>OTP & phiên đăng nhập<\/h3>/);
    assert.match(page.text, /name="otpTtlSec" type="number"[^>]*min="60" max="1800"/);
    assert.match(page.text, /<select name="yellowAction">/);

    // 1 ô đúng + 1 ô sai → không lưu ô nào, vẽ lại form với chữ đã gõ, báo bằng tên ô (không phải tên biến).
    let r = await admin.postForm('/admin/settings', { _csrf: csrf, codeWindowSec: '240', otpTtlSec: '0' });
    assert.equal(r.status, 200);
    assert.match(r.text, /Chưa lưu: (&quot;|")OTP hết hạn sau(&quot;|") — phải là số nguyên từ 60 đến 1800/);
    assert.match(r.text, /name="otpTtlSec"[^>]*value="0" aria-invalid="true"/);
    assert.match(r.text, /name="codeWindowSec"[^>]*value="240"/);
    assert.equal(ctx.settings().codeWindowSec, 180, 'không lưu nửa vời');
    assert.equal(ctx.settings().otpTtlSec, 300);

    // Cặp điểm rủi ro ngược nhau → chặn.
    r = await admin.postForm('/admin/settings', { _csrf: csrf, riskYellow: '80', riskRed: '60' });
    assert.equal(r.status, 200);
    assert.match(r.text, /phải nhỏ hơn điểm từ chối/);

    // Lưu đúng → báo số mục đổi, nhật ký ghi cũ → mới; gửi lại y nguyên → "Không có gì thay đổi", không ghi nhật ký.
    r = await admin.postForm('/admin/settings', { _csrf: csrf, codeWindowSec: '240', otpTtlSec: '300', yellowAction: 'reject' });
    const msg = (x) => new URL(x.headers.get('location'), 'http://x').searchParams.get('msg');
    assert.match(msg(r), /Đã lưu cài đặt \(1 mục: Mỗi lượt "Lấy mã" mở trong\)/);
    assert.equal(ctx.settings().codeWindowSec, 240);
    assert.match(get(ctx.db, "SELECT data FROM events WHERE type = 'settings_saved'").data, /codeWindowSec: 180 → 240/);
    r = await admin.postForm('/admin/settings', { _csrf: csrf, codeWindowSec: '240' });
    assert.equal(msg(r), 'Không có gì thay đổi.');
    assert.equal(get(ctx.db, "SELECT COUNT(*) AS n FROM events WHERE type = 'settings_saved'").n, 1);
    assert.match((await admin.get('/admin/events')).text, /codeWindowSec: 180 → 240/);
  } finally {
    await srv.close();
  }
});
