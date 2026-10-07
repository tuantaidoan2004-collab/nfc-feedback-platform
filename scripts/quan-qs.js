// Mở / đóng / xem một quán QS bằng đúng API máy chủ QS gọi (/hooks/qs/quan, docs/phoi-hop-voi-QS.md mục 10).
//   npm run quan -- mo <link hoặc mã quán QS> [số suất / ngày]
//   npm run quan -- dong <mã quán>
//   npm run quan -- xem <mã quán>
// Khoá: QS_TICKET_KEY trong .env (hoặc khoá chạy thử mặc định). Địa chỉ TBQ: TBQ_URL, hoặc mặc định máy này 127.0.0.1:3700/colap.
import { createHmac, randomBytes } from 'node:crypto';
import { shopFromInput } from '../src/domain/presence.js';

const ACTIONS = { mo: 'open', dong: 'close', xem: 'status', open: 'open', close: 'close', status: 'status' };
const [verb, input, quota] = process.argv.slice(2);
const action = ACTIONS[verb];
const shop = shopFromInput(input);
if (!action || !shop) {
  console.error('Cách dùng: npm run quan -- mo|dong|xem <link hoặc mã quán QS> [số suất / ngày]');
  process.exit(1);
}
const origin = String(process.env.TBQ_URL || `http://127.0.0.1:${process.env.PORT || 3700}/colap`).replace(/\/+$/, '');
const key = process.env.QS_TICKET_KEY || 'dev-qs-ticket-key-change-me-0123456789';
const body = JSON.stringify({
  action, shop, ...(quota ? { dailyQuota: Number(quota) } : {}), ts: Math.floor(Date.now() / 1000), nonce: randomBytes(12).toString('base64url'),
});
const r = await fetch(`${origin}/hooks/qs/quan`, {
  method: 'POST', body, headers: { 'content-type': 'application/json', 'x-tbq-signature': `sha256=${createHmac('sha256', key).update(body).digest('hex')}` },
});
const j = await r.json().catch(() => null);
if (!j?.ok) { console.error(`✘ ${r.status} ${j?.message || j?.code || 'lỗi'}`); process.exit(1); }
const st = j.status === 'active' ? 'Đang chạy' : `Tạm dừng${j.pausedBy === 'admin' ? ' (chủ Tiệm dừng — mở ở trang quản trị)' : ''}`;
console.log(`✔ ${j.created ? 'Đã thêm quán' : 'Quán'} ${j.name} (${j.shop}) — ${st} — hôm nay ${j.usedToday}/${j.dailyQuota} suất`);
console.log(`  Link khối "Công cụ làm việc" bên QS: ${j.link}?t=<vé>`);
