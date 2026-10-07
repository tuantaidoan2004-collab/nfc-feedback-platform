// Luật Google cho chữ TBQ hiện cho khách + nội dung khối TBQ trên trang quán của QS (cùng dây bẫy với QS).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createTestCtx, seed, startTestServer } from './helpers.js';
import { fold, freeTextProblem } from '../src/lib/policy.js';
import { QS_EVENT, QS_LIMITS } from '../src/qs-event.js';
import { DEFAULT_SETTINGS } from '../src/lib/settings.js';
import { get } from '../src/db/index.js';

test('dây bẫy chữ giống QS: chặn nối đánh giá với quà/nhắc tên; câu trung tính vẫn qua', () => {
  assert.equal(fold('  Đánh GIÁ   Quán Ơi  '), 'danh gia quan oi');
  // Câu QS dùng làm ví dụ (google-policy.md mục 3b) và câu trong HANDOFF của Tài.
  assert.equal(freeTextProblem('Đánh giá Google 5 sao để nhận quà'), 'reward');
  assert.equal(freeTextProblem('Review quán để nhận quà'), 'reward');
  assert.equal(freeTextProblem('Đánh giá 5 sao để nhận tài khoản'), 'reward', 'QS (05/10) để lọt câu này; TBQ chặn');
  assert.equal(freeTextProblem('Đánh giá quán, nhận ngay 1 ngày dùng thử ChatGPT'), 'reward');
  assert.equal(freeTextProblem('Khi đánh giá Google hãy nhắc tên nhân viên An'), 'naming');
  for (const ok of ['Đánh giá của bạn rất quan trọng với quán', 'Trải nghiệm A.I Pro 1 ngày', 'Nhận tài khoản', 'Nhận công cụ làm việc miễn phí', 'Về chúng tôi',
    'Chọn "Tiếp tục với email", KHÔNG chọn Google/Apple/Microsoft.', 'Dùng miễn phí trọn 24 giờ']) {
    assert.equal(freeTextProblem(ok), null, ok);
  }
});

test('nội dung khối "Công cụ làm việc" trên trang quán (QS): đúng giới hạn độ dài, qua luật Google, khớp tài liệu gửi Tài', () => {
  const texts = [['title', QS_EVENT.title], ['summary', QS_EVENT.summary], ...QS_EVENT.items.map((i) => ['label', i.label])];
  for (const [k, v] of texts) {
    assert.ok([...v].length <= QS_LIMITS[k], `${k} dài ${[...v].length} > ${QS_LIMITS[k]}`);
    assert.equal(freeTextProblem(v), null, v);
    // Khối không nhắc tới đánh giá ở bất kỳ dạng nào (google-policy.md luật 8 bên QS).
    assert.doesNotMatch(fold(v), /\b(danh gia|review|google|sao|rating|star)\b/, v);
  }
  assert.match(QS_EVENT.key, /^[a-z][a-z0-9-]{0,31}$/);
  assert.deepEqual(QS_EVENT.items.map((i) => i.path), ['/qs/{shop}', '/ve-chung-toi?shop={shop}']);
  assert.equal(DEFAULT_SETTINGS.eventTitle, QS_EVENT.program);
  // Bản gửi Tài (tài liệu phối hợp) phải giống hệt chữ trong code.
  const doc = readFileSync(new URL('../docs/phoi-hop-voi-QS.md', import.meta.url), 'utf8');
  for (const v of [QS_EVENT.key, QS_EVENT.title, QS_EVENT.summary, QS_EVENT.organizer, ...QS_EVENT.items.flatMap((i) => [i.label, i.path])]) {
    assert.ok(doc.includes(v), `tài liệu thiếu: ${v}`);
  }
});

test('quản trị: chữ vi phạm không lưu được (tên sự kiện, tên/hướng dẫn công cụ); mã quán QS đúng định dạng QS', async () => {
  const ctx = createTestCtx();
  const { cafe, tools } = seed(ctx);
  const srv = await startTestServer(ctx);
  try {
    const c = srv.client();
    await c.postForm('/admin/login', { password: ctx.config.adminPassword });
    const csrf = get(ctx.db, 'SELECT csrf FROM admin_sessions').csrf;
    const msg = (r) => decodeURIComponent(r.headers.get('location') || '');

    const bad = await c.postForm('/admin/settings', { _csrf: csrf, eventTitle: 'Đánh giá 5 sao nhận A.I miễn phí' });
    assert.match(msg(bad), /eventTitle: nối đánh giá/);
    assert.equal(ctx.settings().eventTitle, QS_EVENT.program, 'giữ tên cũ');
    await c.postForm('/admin/settings', { _csrf: csrf, eventTitle: 'Thử A.I Pro 1 ngày' });
    assert.equal(ctx.settings().eventTitle, 'Thử A.I Pro 1 ngày');

    const tool = { _csrf: csrf, slug: 'chatgpt', name: 'ChatGPT Plus', login_type: 'email_code', enabled: '1' };
    const r = await c.postForm(`/admin/tools/${tools.chatgpt.id}`, { ...tool, instructions: 'Dùng thoải mái.\nNhớ đánh giá quán 5 sao để giữ tài khoản nhé' });
    assert.match(msg(r), /Không lưu: "Nhớ đánh giá quán 5 sao/);
    assert.equal(get(ctx.db, 'SELECT instructions FROM tools WHERE id = ?', tools.chatgpt.id).instructions, null);
    await c.postForm(`/admin/tools/${tools.chatgpt.id}`, { ...tool, instructions: 'Chọn "Tiếp tục với email", không chọn Google.' });
    assert.match(get(ctx.db, 'SELECT instructions FROM tools WHERE id = ?', tools.chatgpt.id).instructions, /Tiếp tục với email/);

    const base = { _csrf: csrf, name: cafe.name, presence_mode: 'code_or_wifi', daily_quota: '20' };
    assert.match(msg(await c.postForm(`/admin/cafes/${cafe.id}`, { ...base, qs_slug: 'quan_b' })), /chỉ gồm chữ thường/);
    assert.match(msg(await c.postForm(`/admin/cafes/${cafe.id}`, { ...base, qs_slug: 'a'.repeat(64) })), /chỉ gồm chữ thường/);
    await c.postForm(`/admin/cafes/${cafe.id}`, { ...base, qs_slug: 'K3X9Q' });
    assert.equal(get(ctx.db, 'SELECT qs_slug FROM cafes WHERE id = ?', cafe.id).qs_slug, 'k3x9q');
  } finally {
    await srv.close();
  }
});
