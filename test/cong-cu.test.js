// Trang Quản trị › Công cụ: sửa món không làm hỏng ngầm, lưu lỗi không mất chữ đã gõ.
// (Rà 08/10/2026: đổi slug làm mất mẫu thư mã / API kho QS / mã phiếu / icon; đổi cách đăng nhập khi kho còn hàng → khách nhận mật khẩu trống;
//  lỗi lưu quay về danh sách, mất hết chữ; "-" (không kiểm người gửi) hiện thành ô trống, lưu lại thành mẫu mặc định.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestCtx, seed, startTestServer } from './helpers.js';
import { run, get } from '../src/db/index.js';

test('Công cụ: slug cố định, không đổi cách đăng nhập khi còn hàng, lỗi giữ chữ đã gõ, kiểm tuỳ chọn', async () => {
  const ctx = createTestCtx();
  const { tools } = seed(ctx);
  const srv = await startTestServer(ctx);
  try {
    const admin = srv.client();
    await admin.postForm('/admin/login', { password: ctx.config.adminPassword });
    let page = await admin.get(`/admin/tools/${tools.chatgpt.id}`);
    const csrf = page.text.match(/name="_csrf" value="([^"]+)"/)[1];
    const msg = (r) => new URL(r.headers.get('location'), 'http://x').searchParams.get('msg');
    const gpt = () => get(ctx.db, 'SELECT * FROM tools WHERE id = ?', tools.chatgpt.id);
    const base = { _csrf: csrf, name: 'ChatGPT Plus', login_type: 'email_code', enabled: '1', slot_hours: '24', cooldown_days: '30', lifetime_cap: '2', holders_default: '1' };

    // Slug: ô chỉ đọc; gửi slug khác cũng không đổi.
    assert.match(page.text, /<input value="chatgpt" readonly/);
    assert.doesNotMatch(page.text, /name="slug"/);
    let r = await admin.postForm(`/admin/tools/${tools.chatgpt.id}`, { ...base, slug: 'chat-gpt', name: 'ChatGPT Plus mới' });
    assert.equal(msg(r), 'Đã lưu ChatGPT Plus mới.');
    assert.equal(gpt().slug, 'chatgpt');
    assert.equal(gpt().name, 'ChatGPT Plus mới');

    // Đổi cách đăng nhập khi kho còn 2 tài khoản → không lưu, form giữ chữ vừa gõ.
    r = await admin.postForm(`/admin/tools/${tools.chatgpt.id}`, { ...base, login_type: 'password', instructions: 'Dòng hướng dẫn vừa gõ' });
    assert.equal(r.status, 200);
    assert.match(r.text, /Chưa lưu: kho còn 2 tài khoản kiểu &quot;Mã qua email&quot;|Chưa lưu: kho còn 2 tài khoản kiểu "Mã qua email"/);
    assert.match(r.text, /Dòng hướng dẫn vừa gõ<\/textarea>/);
    assert.equal(gpt().login_type, 'email_code');
    assert.equal(gpt().instructions, null);
    // Ngừng dùng hết → đổi được.
    run(ctx.db, "UPDATE accounts SET status = 'retired' WHERE tool_id = ?", tools.chatgpt.id);
    r = await admin.postForm(`/admin/tools/${tools.chatgpt.id}`, { ...base, login_type: 'password_totp' });
    assert.equal(r.status, 303);
    assert.equal(gpt().login_type, 'password_totp');

    // Thêm món trùng slug → vẽ lại form "Thêm công cụ" với chữ đã gõ.
    r = await admin.postForm('/admin/tools/new', { ...base, slug: 'capcut', name: 'Món mới của tôi' });
    assert.equal(r.status, 200);
    assert.match(r.text, /slug &quot;capcut&quot; đã có món khác dùng|slug "capcut" đã có món khác dùng/);
    assert.match(r.text, /name="slug" value="capcut"/);
    assert.match(r.text, /name="name" value="Món mới của tôi"/);

    // Link đăng nhập phải https; "Làm mới mỗi ngày" cần giờ hết lượt; "Cần mã phiếu" chỉ cho món lấy mã.
    assert.match((await admin.postForm(`/admin/tools/${tools.chatgpt.id}`, { ...base, login_type: 'password_totp', login_url: 'javascript:alert(1)' })).text, /phải bắt đầu bằng https/);
    assert.match((await admin.postForm(`/admin/tools/${tools.chatgpt.id}`, { ...base, login_type: 'password_totp', workspace_bot: '1' })).text, /cần ô &quot;Hết lượt lúc&quot;|cần ô "Hết lượt lúc"/);
    r = await admin.postForm(`/admin/tools/${tools.chatgpt.id}`, { ...base, login_type: 'password_totp', workspace_bot: '1', end_hour: '6' });
    assert.equal(r.status, 303);
    assert.match((await admin.postForm(`/admin/tools/${tools.capcut.id}`, { ...base, name: 'CapCut Pro', login_type: 'password', voucher_code: '1' })).text, /Cần mã phiếu/);
    r = await admin.postForm(`/admin/tools/${tools.capcut.id}`, { ...base, name: 'CapCut Pro', login_type: 'password', voucher_code: '1', mail_code: '1' });
    assert.equal(r.status, 303, 'mật khẩu + mã qua email thì được');

    // "-" = không kiểm người gửi: hiện lại "-" (trước hiện ô trống → lưu lại thành mẫu mặc định).
    await admin.postForm(`/admin/tools/${tools.capcut.id}`, { ...base, name: 'CapCut Pro', login_type: 'password', sender_pattern: '-' });
    assert.equal(get(ctx.db, 'SELECT sender_pattern FROM tools WHERE id = ?', tools.capcut.id).sender_pattern, '');
    assert.match((await admin.get(`/admin/tools/${tools.capcut.id}`)).text, /name="sender_pattern" value="-"/);

    // Trạng thái bot: chưa có bot làm mới → nói rõ việc này của chủ.
    page = await admin.get(`/admin/tools/${tools.chatgpt.id}`);
    assert.match(page.text, /Chưa có bot làm mới nào chạy → việc này là của bạn/);
    run(ctx.db, "INSERT INTO kv(key, value, updated_at) VALUES('worker-kind:rotate', 'bot-mac', ?)", ctx.now());
    assert.match((await admin.get(`/admin/tools/${tools.chatgpt.id}`)).text, /Bot làm mới đang chạy/);
  } finally {
    await srv.close();
  }
});
