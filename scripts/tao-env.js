// Tạo tệp .env cho máy chủ thật từ .env.example, tự sinh mọi khoá bí mật (mỗi máy chủ 1 bộ khoá riêng).
//   npm run tao-env                                  → .env với BASE_URL https://thu.tiembanquyen.com/colap
//   npm run tao-env -- https://ten-mien-khac/colap   → địa chỉ khác
//   npm run tao-env -- --qs-key <khoá Tài đang dùng> → dùng khoá vé có sẵn bên QS thay vì sinh mới
// Không ghi đè .env đã có (mất DATA_KEY = mất mọi mật khẩu trong kho). Tệp tạo ra chỉ chủ máy đọc được (quyền 600).
// Sau đó tự điền ESMS_API_KEY / ESMS_SECRET_KEY / ESMS_BRANDNAME rồi chạy: npm run kiem-tra
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes, randomInt } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const qsIdx = args.indexOf('--qs-key');
const qsKey = qsIdx >= 0 ? String(args[qsIdx + 1] || '') : '';
const baseUrl = args.find((a, i) => /^https:\/\//.test(a) && (qsIdx < 0 || i !== qsIdx + 1)) || 'https://thu.tiembanquyen.com/colap';
const out = `${ROOT}.env`;

if (existsSync(out)) {
  console.error('Đã có .env — không ghi đè (mất DATA_KEY là mất mọi mật khẩu trong kho). Muốn làm lại: đổi tên .env cũ trước.');
  process.exit(1);
}
if (qsIdx >= 0 && qsKey.length < 32) {
  console.error('--qs-key phải dài ít nhất 32 ký tự (đúng khoá NFC_EVENT_TBQ_KEY bên QS).');
  process.exit(1);
}

// Mật khẩu quản trị dễ gõ trên điện thoại: chữ thường + số, bỏ ký tự dễ nhầm (l, 1, o, 0).
const ALNUM = 'abcdefghijkmnpqrstuvwxyz23456789';
const adminPw = Array.from({ length: 16 }, (_, i) => (i && i % 4 === 0 ? '-' : '') + ALNUM[randomInt(ALNUM.length)]).join('');
const values = {
  NODE_ENV: 'production',
  BASE_URL: baseUrl,
  QS_TICKET_KEY: qsKey || randomBytes(32).toString('hex'),
  WORKER_TOKEN: randomBytes(32).toString('base64url'),
  APP_SECRET: randomBytes(32).toString('base64'),
  DATA_KEY: randomBytes(32).toString('base64'),
  ADMIN_PASSWORD: adminPw,
  MAIL_WEBHOOK_SECRET: randomBytes(32).toString('base64'),
};
const text = readFileSync(`${ROOT}.env.example`, 'utf8').split('\n')
  .map((line) => { const m = /^([A-Z_]+)=/.exec(line); return m && values[m[1]] !== undefined ? `${m[1]}=${values[m[1]]}` : line; })
  .join('\n');
writeFileSync(out, text, { mode: 0o600 });

console.log(`Đã tạo .env (chỉ chủ máy đọc được) cho ${baseUrl}
  Mật khẩu trang quản trị: ${adminPw}
Việc tiếp theo:
  1. Sao chép DATA_KEY trong .env cất ở nơi khác (két / trình quản lý mật khẩu) — mất là mất mọi mật khẩu trong kho.
  2. ${qsKey ? 'QS_TICKET_KEY: đã dùng khoá Tài đưa.' : 'Gửi QS_TICKET_KEY cho Tài qua kênh riêng (không dán vào nhóm chat) — Tài đặt đúng chuỗi đó làm NFC_EVENT_TBQ_KEY.'}
  3. Cloudflare Email Worker: WEBHOOK_SECRET = MAIL_WEBHOOK_SECRET trong .env.
  4. Máy Mac chạy bot Canva: WORKER_TOKEN = đúng chuỗi trong .env, TBQ_URL=${baseUrl}
  5. Điền ESMS_API_KEY, ESMS_SECRET_KEY, ESMS_BRANDNAME rồi chạy: npm run kiem-tra`);
