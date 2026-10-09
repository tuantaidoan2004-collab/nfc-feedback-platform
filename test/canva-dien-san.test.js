// Ô email mời Canva điền sẵn email khách vừa nhận mã (09/10/2026: khách gõ tay thiếu 1 số → bot mời đúng email gõ nhầm, thư mời đi lạc).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestCtx, seed, startTestServer, ticketFor } from './helpers.js';
import { run } from '../src/db/index.js';

const UA = { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1' };

test('Canva: đăng nhập bằng email → ô email mời điền sẵn email đó; chưa đăng nhập / đăng nhập bằng SĐT → để trống', async () => {
  for (const loginBy of ['email', 'phone']) {
    const ctx = createTestCtx({ env: { LOGIN_BY: loginBy } });
    seed(ctx);
    run(ctx.db, `INSERT INTO tools(slug, name, login_type, login_url, slot_hours, cooldown_days, lifetime_cap, rotation_required, enabled, sort, holders_default)
      VALUES('canva', 'Canva Pro', 'team_invite', 'https://www.canva.com/login', 168, 30, 2, 0, 1, 50, 5)`);
    run(ctx.db, "INSERT INTO accounts(tool_id, login_email, max_holders, status, created_at) SELECT id, 'chu-nhom@truong.test', 5, 'ready', ? FROM tools WHERE slug = 'canva'", ctx.now());
    const srv = await startTestServer(ctx);
    try {
      const c = srv.client();
      const go = await c.get(`/qs/quan-test?t=${ticketFor(ctx)}`, UA);
      assert.equal(go.status, 303);
      const pickUrl = go.headers.get('location');
      const input = (text) => text.match(/<input id="invite-email"[^>]*>/)[0];
      assert.doesNotMatch(input((await c.get(pickUrl, UA)).text), /value=/, 'chưa đăng nhập: chưa biết email');

      const id = loginBy === 'email' ? 'Khach.That@Gmail.com' : '0911000001';
      await c.post('/api/otp/send', { phone: id });
      assert.equal((await c.post('/api/otp/verify', { phone: id, code: ctx.otpSent.at(-1).code, consent: true })).json.ok, true);
      const page = (await c.get(pickUrl, UA)).text;
      if (loginBy === 'email') {
        assert.match(input(page), /value="khach\.that@gmail\.com" data-me="khach\.that@gmail\.com"/);
        assert.match(page, /Điền sẵn email bạn vừa nhận mã/);
      } else {
        assert.doesNotMatch(input(page), /value=/, 'đăng nhập bằng SĐT: không có email để điền');
      }
    } finally {
      await srv.close();
    }
  }
});
