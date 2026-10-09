// Kho tài khoản › Thêm vào kho: form gọn cho Canva (chủ thấy ô "Danh sách" chung quá rối, 09/10/2026).
// Chọn Canva → chỉ email chủ nhóm + số ghế; nhóm đã có (kể cả đã ngừng) → cập nhật / mở lại thay vì "đã có trong kho".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestCtx, seed, startTestServer } from './helpers.js';
import { run, get } from '../src/db/index.js';

test('Kho: form Canva gọn — thêm nhóm, mở lại nhóm đã ngừng, cập nhật số ghế; món khác vẫn dùng ô danh sách', async () => {
  const ctx = createTestCtx();
  const { tools } = seed(ctx);
  const canvaId = Number(run(ctx.db, `INSERT INTO tools(slug, name, login_type, login_url, slot_hours, cooldown_days, lifetime_cap, rotation_required, enabled, sort, holders_default)
    VALUES('canva', 'Canva Pro', 'team_invite', 'https://www.canva.com/login', 168, 30, 2, 0, 1, 50, 5)`).lastInsertRowid);
  const srv = await startTestServer(ctx);
  try {
    const admin = srv.client();
    assert.equal((await admin.postForm('/admin/login', { password: ctx.config.adminPassword })).status, 303);
    const msg = (r) => new URL(r.headers.get('location'), 'http://x').searchParams.get('msg');

    // Chọn sẵn Canva: hiện ô email chủ nhóm + số ghế (mặc định của món), ẩn ô danh sách.
    let page = await admin.get(`/admin/accounts?tool=${canvaId}`);
    const csrf = page.text.match(/name="_csrf" value="([^"]+)"/)[1];
    const form = page.text.split('data-import')[1].split('</form>')[0];
    assert.match(form, /<label class="field" data-show="team"><span>Email chủ nhóm Canva/);
    assert.match(form, /name="seats" type="number" min="1" max="50" value="5"/);
    assert.match(form, /<div class="wide" data-show="list" hidden>/);
    // Món khác: ô danh sách với mẫu dòng của đúng món đó, ô Canva ẩn + tắt.
    page = await admin.get(`/admin/accounts?tool=${tools.capcut.id}`);
    const f2 = page.text.split('data-import')[1].split('</form>')[0];
    assert.match(f2, /data-show="team" hidden/);
    assert.match(f2, /name="team_email"[^>]*disabled/);
    assert.match(f2, /<div class="wide" data-show="list">/);
    assert.ok(f2.includes('<textarea name="lines" rows="6" placeholder="email|mật khẩu\nemail|mật khẩu|số khách (tuỳ chọn)">'), 'mẫu dòng chỉ của CapCut');

    const add = (form) => admin.postForm('/admin/accounts', { _csrf: csrf, tool_id: String(canvaId), kho: 'chung', ...form });
    assert.equal(msg(await add({ team_email: '', seats: '5' })), 'Nhập email chủ nhóm Canva.');
    assert.match(msg(await add({ team_email: 'Chu.Nhom@Truong.test', seats: '8' })), /Đã thêm nhóm Canva chu\.nhom@truong\.test/);
    let a = get(ctx.db, "SELECT * FROM accounts WHERE login_email = 'chu.nhom@truong.test'");
    assert.equal(a.tool_id, canvaId);
    assert.equal(a.max_holders, 8);
    assert.equal(a.status, 'ready');

    // Nhóm đã ngừng → nhập lại = mở lại với số ghế mới.
    run(ctx.db, "UPDATE accounts SET status = 'retired', status_reason = 'Ngừng thử' WHERE id = ?", a.id);
    assert.match(msg(await add({ team_email: 'chu.nhom@truong.test', seats: '12' })), /đã mở lại — 12 ghế, kho chung/);
    a = get(ctx.db, 'SELECT * FROM accounts WHERE id = ?', a.id);
    assert.equal(a.status, 'ready');
    assert.equal(a.status_reason, null);
    assert.equal(a.max_holders, 12);
    // Đang sẵn sàng → chỉ cập nhật số ghế.
    assert.match(msg(await add({ team_email: 'chu.nhom@truong.test', seats: '3' })), /đã cập nhật — 3 ghế/);
    assert.equal(get(ctx.db, 'SELECT max_holders FROM accounts WHERE id = ?', a.id).max_holders, 3);

    // Email đang là tài khoản món khác → không đụng.
    const cc = get(ctx.db, 'SELECT login_email FROM accounts WHERE tool_id = ? LIMIT 1', tools.capcut.id).login_email;
    assert.match(msg(await add({ team_email: cc, seats: '5' })), /món khác/);
  } finally {
    await srv.close();
  }
});
