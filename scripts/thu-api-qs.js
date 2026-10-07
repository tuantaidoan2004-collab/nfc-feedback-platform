// Thử API phiếu cho QS (docs/phoi-hop-voi-QS.md mục 9) giống hệt cách máy chủ QS sẽ gọi.
//   node scripts/thu-api-qs.js <mã quán QS> [TBQ_URL]      (khoá: QS_TICKET_KEY trong .env, hoặc khoá chạy thử mặc định)
import { createHmac, randomBytes } from 'node:crypto';

const shop = process.argv[2];
const origin = String(process.argv[3] || process.env.TBQ_URL || process.env.BASE_URL || 'http://127.0.0.1:3700/colap').replace(/\/+$/, '');
const key = process.env.QS_TICKET_KEY || 'dev-qs-ticket-key-change-me-0123456789';
if (!shop) { console.error('Cách dùng: node scripts/thu-api-qs.js <mã quán QS> [TBQ_URL]'); process.exit(1); }
const body = JSON.stringify({ shop, ts: Math.floor(Date.now() / 1000), nonce: randomBytes(12).toString('base64url') });
const r = await fetch(`${origin}/hooks/qs/phieu`, {
  method: 'POST', body, headers: { 'content-type': 'application/json', 'x-tbq-signature': `sha256=${createHmac('sha256', key).update(body).digest('hex')}` },
});
console.log(r.status, await r.text());
