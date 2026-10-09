// Bật / tắt mã 2FA cho đăng nhập trang quản trị (ADMIN_TOTP trong .env). Chạy trên máy chủ, trong thư mục app:
//   npm run bat-2fa-quan-tri            → tạo khoá mới, thêm vào app Authenticator, gõ đúng mã đang hiện thì mới lưu
//   npm run bat-2fa-quan-tri -- --tat   → tắt 2FA (mất điện thoại); chỉ người vào được máy chủ mới làm được
// Lưu xong phải khởi động lại app (sudo systemctl restart tbq). Phiên quản trị đang mở vẫn dùng tiếp tới khi hết 12 giờ.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { newTotpSecret, verifyTotp } from '../src/lib/totp.js';

const ENV = '.env';
if (!existsSync(ENV)) { console.error('Không thấy .env — chạy trong thư mục app (vd. /opt/tbq-trial).'); process.exit(1); }
const text = readFileSync(ENV, 'utf8');
const save = (value) => {
  const line = `ADMIN_TOTP=${value}`;
  const next = /^ADMIN_TOTP=.*$/m.test(text) ? text.replace(/^ADMIN_TOTP=.*$/m, line) : `${text.replace(/\n*$/, '\n')}${line}\n`;
  writeFileSync(ENV, next, { mode: 0o600 });
};

if (process.argv.includes('--tat')) {
  save('');
  console.log('Đã tắt 2FA quản trị. Khởi động lại: sudo systemctl restart tbq');
  process.exit(0);
}

const secret = newTotpSecret();
const uri = `otpauth://totp/${encodeURIComponent('TBQ:Quản trị')}?secret=${secret}&issuer=TBQ&digits=6&period=30`;
console.log(`
1. Mở app Authenticator (Google Authenticator / Microsoft Authenticator / Mật khẩu của iPhone) → Thêm → Nhập khoá thủ công:
     Tên:  TBQ Quản trị
     Khoá: ${secret.match(/.{1,4}/g).join(' ')}
     Loại: dựa theo thời gian (6 số, 30 giây)
   (hoặc mở link này trên điện thoại: ${uri})
2. Cất khoá trên vào trình quản lý mật khẩu — mất điện thoại thì thêm lại từ đó.
`);
const rl = createInterface({ input: process.stdin });
const lines = rl[Symbol.asyncIterator]();
for (let i = 0; i < 3; i++) {
  process.stdout.write('3. Gõ mã 6 số đang hiện trong app: ');
  const { value: code, done } = await lines.next();
  if (done) break;
  if (verifyTotp(secret, code, Date.now()) != null) {
    rl.close();
    save(secret);
    console.log('\n✓ Đúng mã. Đã lưu ADMIN_TOTP vào .env. Khởi động lại để bật: sudo systemctl restart tbq');
    process.exit(0);
  }
  console.log('  Chưa đúng (kiểm giờ trên điện thoại có tự đặt không). Thử lại.');
}
rl.close();
console.error('Sai 3 lần — chưa lưu gì, 2FA vẫn như cũ.');
process.exit(1);
