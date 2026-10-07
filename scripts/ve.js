// Tạo link "Nhận công cụ làm việc miễn phí" có vé — y như nút trên trang quán QS — để thử TBQ khi chưa nối QS.
//   npm run ve -- <mã quán QS>        vd: npm run ve -- quan-demo
// Link dùng được ticketTtlMin phút (mặc định 30) và chỉ trên 1 máy. Dùng QS_TICKET_KEY trong .env (giống bên QS).
import { randomBytes } from 'node:crypto';
import { loadConfig } from '../src/config.js';
import { makeTicket } from '../src/domain/ticket.js';

const shop = String(process.argv[2] || '').trim().toLowerCase();
if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(shop)) {
  console.error('Cách dùng: npm run ve -- <mã quán QS>   (vd: npm run ve -- quan-demo)');
  process.exit(1);
}
const config = loadConfig();
if (!config.qsTicketKey) {
  console.error('Thiếu QS_TICKET_KEY trong .env.');
  process.exit(1);
}
const ticket = makeTicket(config.qsTicketKey, shop, Date.now(), randomBytes(12).toString('base64url'));
console.log(`${config.baseUrl}/qs/${shop}?t=${ticket}`);
