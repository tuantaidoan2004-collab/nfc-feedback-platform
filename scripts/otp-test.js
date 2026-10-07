// Thử kênh gửi OTP với cấu hình trong .env (không cần chạy máy chủ):
//   npm run otp-test -- ban@gmail.com     (OTP_PROVIDER=email: gửi 1 thư mã thật qua Cloudflare)
//   npm run otp-test -- 0912345678        (OTP_PROVIDER=esms)
// eSMS: đặt ESMS_SANDBOX=1 để eSMS chỉ kiểm tra thông số (không gửi tin, không tính tiền); =0 để gửi tin thật tới số trên.
import { loadConfig } from '../src/config.js';
import { normalizeLogin } from '../src/lib/phone.js';
import { randomDigits } from '../src/lib/crypto.js';
import { createOtpSender, otpChannel } from '../src/services/otp.js';
import { DEFAULT_SETTINGS } from '../src/lib/settings.js';

const config = loadConfig();
const to = normalizeLogin(process.argv[2], config.otp.loginBy);
if (!to) {
  console.error(config.otp.loginBy === 'email' ? 'Cách dùng: npm run otp-test -- ban@gmail.com' : 'Cách dùng: npm run otp-test -- 09xxxxxxxx');
  process.exit(1);
}
const ctx = { config: { ...config, isProd: false }, now: () => Date.now(), log: (l, m) => console.log(m), settings: () => DEFAULT_SETTINGS };
const sender = createOtpSender(ctx);
const code = randomDigits(6);
console.log(`Kênh: ${sender.name} (${otpChannel(config)})${config.otp.esms.sandbox && sender.name === 'esms' ? ' — SANDBOX: không gửi tin thật' : ''}`);
const r = await sender.send(to, code);
console.log(r.ok ? `Đã gửi mã ${code} tới ${to}.` : `Lỗi: ${r.error}`);
process.exit(r.ok ? 0 : 1);
