// Trang Quản trị › Nhật ký: chi tiết sự kiện đọc được — lỗi bot hiện ra (trước bị bỏ), lý do kết thúc slot thành chữ, QS mở quán bình thường không bị
// ghi "điền vào trang quán", có slot liên quan, mọi loại sự kiện có nhãn.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestCtx, seed, startTestServer } from './helpers.js';
import { logEvent } from '../src/lib/events.js';
import { EVENT_LABEL } from '../src/views/admin.js';

test('Nhật ký: chi tiết sự kiện đọc được', async () => {
  const ctx = createTestCtx();
  const { cafe, accounts } = seed(ctx);
  logEvent(ctx, { type: 'worker_task_failed', severity: 'yellow', accountId: accounts.gpt1.id, slotId: 77, data: { taskId: 10, worker: 'canva-mac', error: 'Không thấy mục xoá / huỷ thư mời trong menu.' } });
  logEvent(ctx, { type: 'qs_api_cafe_opened', severity: 'yellow', cafeId: cafe.id, data: { shop: 'k9kr5y', created: true } });
  logEvent(ctx, { type: 'qs_shop_unmapped', severity: 'yellow', data: { shop: 'zz999' } });
  logEvent(ctx, { type: 'slot_revoked', slotId: 5, data: { reason: 'admin_revoked', by: 'admin' } });
  logEvent(ctx, { type: 'ticket_rejected', severity: 'yellow', cafeId: cafe.id, data: { error: 'invalid' } });
  logEvent(ctx, { type: 'task_cancelled', accountId: accounts.gpt1.id, data: { taskId: 3, by: 'admin' } });
  logEvent(ctx, { type: 'account_updated', accountId: accounts.gpt1.id, data: { status: 'retired', by: 'admin' } });
  const srv = await startTestServer(ctx);
  try {
    const admin = srv.client();
    await admin.postForm('/admin/login', { password: ctx.config.adminPassword });
    const page = (await admin.get('/admin/events')).text;
    assert.match(page, /Không thấy mục xoá \/ huỷ thư mời trong menu\. · bot canva-mac/);
    assert.match(page, /slot <a href="\/admin\/slots\?id=77">#77<\/a>/);
    assert.match(page, /QS &quot;k9kr5y&quot; · quán mới tự thêm|QS "k9kr5y" · quán mới tự thêm/);
    assert.equal((page.match(/điền vào trang quán/g) || []).length, 1, 'chỉ sự kiện mã quán chưa gán mới bảo điền');
    assert.match(page, /chủ thu hồi · bởi admin/);
    assert.match(page, /vé sai/);
    assert.match(page, /Bỏ việc tay/);
    assert.match(page, /→ Ngừng dùng · bởi admin/);
    assert.doesNotMatch(page, /admin_revoked|>task_cancelled</);
  } finally {
    await srv.close();
  }
  for (const k of ['task_cancelled', 'qs_api_stock_added']) assert.ok(EVENT_LABEL[k], k);
});
