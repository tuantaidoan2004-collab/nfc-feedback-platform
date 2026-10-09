// Khởi động trang Tiệm trên Botkeep (botkeep.cloud). Trong gói ZIP tệp này nằm ở thư mục gốc; ở mã nguồn là deploy/botkeep/.
//   Lệnh chạy trên Botkeep: node --disable-warning=ExperimentalWarning botkeep.js   (hoặc npm start trong gói ZIP)
// Làm 3 việc rồi chạy src/server.js y như trên Mac/VPS (không sửa mã app):
//   1. Botkeep cấp cổng qua SERVER_PORT và yêu cầu nghe 0.0.0.0 → đặt PORT / HOST nếu chưa có.
//   2. Botkeep không có lịch hẹn giờ (systemd timer) → tự sao lưu database lúc 05:30 giờ VN, giữ BACKUP_KEEP bản (mặc định 14).
//   3. LOG_IP_HEADERS=1 → in các header mang IP của 20 request đầu, để biết proxy Botkeep gửi IP khách qua header nào
//      (rồi đặt CLIENT_IP_HEADER cho đúng và tắt LOG_IP_HEADERS). Không in cookie hay header khác.
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import http from 'node:http';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = existsSync(join(here, 'src/server.js')) ? here : resolve(here, '../..');
process.chdir(ROOT); // DB_PATH mặc định ./data/tbq.sqlite tính từ thư mục app

const env = process.env;
if (!env.PORT && env.SERVER_PORT) env.PORT = env.SERVER_PORT;
if (!env.HOST) env.HOST = '0.0.0.0';

const log = (msg) => console.log(`[botkeep] ${new Date().toISOString()} ${msg}`);

// --- 3. Xem proxy gửi IP khách qua header nào ---
if (env.LOG_IP_HEADERS === '1') {
  const IP_HEADERS = ['x-forwarded-for', 'x-real-ip', 'cf-connecting-ip', 'true-client-ip', 'forwarded', 'x-client-ip'];
  let left = 20;
  const orig = http.createServer;
  http.createServer = function (...args) {
    const i = args.findIndex((a) => typeof a === 'function');
    if (i >= 0) {
      const handler = args[i];
      args[i] = function (req, res) {
        if (left > 0) {
          left--;
          const seen = Object.fromEntries(IP_HEADERS.filter((h) => req.headers[h]).map((h) => [h, req.headers[h]]));
          log(`ip-headers ${req.method} ${req.url.split('?')[0]} socket=${req.socket?.remoteAddress} ${JSON.stringify(seen)}`);
        }
        return handler.call(this, req, res);
      };
    }
    return orig.apply(this, args);
  };
  log('LOG_IP_HEADERS=1: sẽ in header IP của 20 request đầu');
}

// --- 2. Sao lưu hằng ngày 05:30 giờ VN ---
const BACKUP_DIR = join(ROOT, 'data/backup');
const KEEP = Math.max(3, Number.parseInt(env.BACKUP_KEEP || '14', 10) || 14);
let lastBackupDay = '';
function vnNow() {
  const d = new Date(Date.now() + 7 * 3600_000); // VN không đổi giờ mùa hè
  return { day: d.toISOString().slice(0, 10), minutes: d.getUTCHours() * 60 + d.getUTCMinutes() };
}
function prune() {
  if (!existsSync(BACKUP_DIR)) return;
  const files = readdirSync(BACKUP_DIR).filter((f) => /^tbq-\d{4}-\d{2}-\d{2}\.sqlite$/.test(f)).sort();
  for (const f of files.slice(0, Math.max(0, files.length - KEEP))) rmSync(join(BACKUP_DIR, f), { force: true });
}
function runBackup(day) {
  lastBackupDay = day;
  const child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'scripts/backup.js', join(BACKUP_DIR, `tbq-${day}.sqlite`)], {
    cwd: ROOT, env, stdio: 'inherit',
  });
  child.on('exit', (code) => {
    if (code === 0) prune();
    else log(`sao lưu lỗi (mã ${code})`);
  });
}
if (env.BACKUP_DAILY !== '0') {
  setInterval(() => {
    const { day, minutes } = vnNow();
    if (minutes >= 5 * 60 + 30 && lastBackupDay !== day && !existsSync(join(BACKUP_DIR, `tbq-${day}.sqlite`))) runBackup(day);
  }, 60_000).unref();
}

// --- Chạy app ---
log(`cổng ${env.PORT || '(mặc định 3000)'}, nghe ${env.HOST}, thư mục ${ROOT}, Node ${process.version}`);
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 13)) {
  log(`Cần Node 22.13 trở lên (đang là ${process.version}) — chọn bản Node mới hơn khi tạo server trên Botkeep.`);
  process.exit(1);
}
const { main } = await import(pathToFileURL(join(ROOT, 'src/server.js')).href);
await main();
