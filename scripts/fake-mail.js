// Giả lập dịch vụ mail đẩy 1 thư về webhook (để chạy thử luồng "Lấy mã" trên máy).
//   npm run fake-mail -- <email-kho> <mã> ["Tiêu đề"] [người-gửi]
//   npm run fake-mail -- --raw <email-kho> <mã> ...   (đẩy NGUYÊN THƯ GỐC qua đúng code Cloudflare Worker trong extras/)
// Ví dụ: npm run fake-mail -- gpt-demo1@kho.local 482913
//        npm run fake-mail -- gpt-demo1@kho.local 0 "Your password was changed"   (thử cách ly tài khoản)
import { loadConfig } from '../src/config.js';
import { hmac } from '../src/lib/crypto.js';
import worker from '../extras/cloudflare-email-worker.js';

const args = process.argv.slice(2);
const useRaw = args[0] === '--raw';
const [to, code, subject, from] = useRaw ? args.slice(1) : args;
if (!to || !code) {
  console.error('Cách dùng: npm run fake-mail -- [--raw] <email-kho> <mã> ["Tiêu đề"] [người-gửi]');
  process.exit(1);
}
const config = loadConfig();
const mail = {
  message_id: `fake-${Date.now()}`,
  to,
  from: from || 'noreply@tm.openai.com',
  subject: subject || `Your ChatGPT code is ${code}`,
  text: `Enter this temporary verification code to continue: ${code}`,
  date: new Date().toISOString(),
};

if (useRaw) {
  const raw = [
    `From: OpenAI <${mail.from}>`, `To: ${to}`, `Subject: ${mail.subject}`, `Message-ID: <${mail.message_id}@fake>`,
    `Date: ${new Date().toUTCString()}`, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64', '', Buffer.from(mail.text).toString('base64'), '',
  ].join('\r\n');
  await worker.email(
    { to, from: mail.from, raw: new Blob([raw]).stream(), setReject: (r) => console.log('Worker từ chối:', r), forward: async (a) => console.log('Worker chuyển sang', a) },
    { WEBHOOK_URL: `${config.baseUrl}/hooks/mail`, WEBHOOK_SECRET: config.mail.webhookSecret },
  );
  console.log('Đã đẩy thư gốc qua Cloudflare Worker giả lập.');
} else {
  const body = JSON.stringify(mail);
  const res = await fetch(`${config.baseUrl}/hooks/mail`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Signature': `sha256=${hmac(config.mail.webhookSecret, body)}` },
    body,
  });
  console.log(res.status, await res.text());
}
