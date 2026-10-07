// Chạy thử TBQ trên máy bằng MỘT lệnh (như `node scripts/local.mjs` bên QS):
//   npm run local               → dựng dữ liệu mẫu (lần đầu), mở http://localhost:3919/colap, in sẵn link để thử
//   npm run local -- --reset    → xoá dữ liệu thử, dựng lại từ đầu
//   npm run local -- --qs <mã>  → mã quán QS gắn với quán demo (mặc định "chuquan" = quán mẫu của `node scripts/local.mjs` bên QS)
//   npm run local -- --root     → chạy ở gốc http://localhost:3919 (không có /colap)
//   npm run local -- --sdt      → khách đăng nhập bằng số điện thoại (mặc định: email, như bản thật)
// Dữ liệu ở ~/.tbq-local (không đụng database thật). Mã OTP hiện ngay trên màn hình, không gửi tin. Mật khẩu quản trị: admin.
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { openDb, get, all, run } from '../src/db/index.js';
import { loadConfig } from '../src/config.js';
import { makeTicket } from '../src/domain/ticket.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name, fallback) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? args[i + 1] : fallback; };

const PORT = Number(option('--port', 3919));
const DIR = join(homedir(), '.tbq-local');
const DB_PATH = join(DIR, 'tbq.sqlite');
const QS_SLUG = option('--qs', 'chuquan').toLowerCase();
const QS_ORIGIN = 'http://127.0.0.1:3321';
const env = {
  PATH: process.env.PATH, PORT: String(PORT), DB_PATH, OTP_DEV_SHOW: '1', LOGIN_BY: flag('--sdt') ? 'phone' : 'email',
  BASE_URL: `http://localhost:${PORT}${flag('--root') ? '' : '/colap'}`,
};
if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(QS_SLUG)) { console.error(`Mã quán QS không hợp lệ: ${QS_SLUG}`); process.exit(1); }

mkdirSync(DIR, { recursive: true });
if (flag('--reset')) for (const f of ['', '-wal', '-shm']) rmSync(DB_PATH + f, { force: true });
const fresh = !existsSync(DB_PATH);
if (fresh) {
  const r = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', 'scripts/seed.js', '--demo'], { cwd: ROOT, env, stdio: 'ignore' });
  if (r.status !== 0) { console.error('Không dựng được dữ liệu mẫu (scripts/seed.js --demo).'); process.exit(1); }
}

// Quán demo có QS mang mã quán của QS chạy trên máy, để nút trên trang quán QS dẫn đúng vào quán này.
const config = loadConfig({ ...env });
const db = openDb(DB_PATH);
const qsCafe = get(db, 'SELECT * FROM cafes WHERE qs_slug IS NOT NULL ORDER BY id LIMIT 1');
if (qsCafe && qsCafe.qs_slug !== QS_SLUG) run(db, 'UPDATE cafes SET qs_slug = ? WHERE id = ?', QS_SLUG, qsCafe.id);
const cards = all(db, "SELECT k.token, k.label, c.name FROM cards k JOIN cafes c ON c.id = k.cafe_id WHERE k.kind = 'nfc' AND k.status = 'active' ORDER BY k.id LIMIT 3");
const stock = all(db, "SELECT t.name, COUNT(a.id) AS n FROM tools t LEFT JOIN accounts a ON a.tool_id = t.id AND a.status = 'ready' WHERE t.enabled = 1 GROUP BY t.id ORDER BY t.sort");
db.close();

const base = config.baseUrl;
const ticket = makeTicket(config.qsTicketKey, QS_SLUG, Date.now(), randomBytes(12).toString('base64url'));
const ctr = String(Date.now() % 0xffffff).padStart(6, '0').slice(-6);
console.log(`
TBQ chạy thử ${fresh ? '(dữ liệu mẫu mới dựng)' : '(dữ liệu cũ — thêm --reset để làm lại)'} · dữ liệu: ${DB_PATH}

  Quản trị        ${base}/admin              mật khẩu: admin
  Kho             ${stock.map((s) => `${s.name} ${s.n}`).join(' · ')}

  Khách — quán có QS (${qsCafe?.name || '?'}, mã QS "${QS_SLUG}"):
    · Qua QS thật:  bật QS (node scripts/local.mjs, NFC_EVENT_TBQ_ORIGIN=${base}) → ${QS_ORIGIN}/t/<mã thẻ> → bấm "Nhận công cụ làm việc miễn phí"
    · Không cần QS: ${base}/qs/${QS_SLUG}?t=${ticket}
                    (link có vé như nút QS, dùng được 30 phút trên 1 máy — hết hạn thì: npm run ve -- ${QS_SLUG})

  Khách — quán chưa có QS (thẻ NFC riêng của Tiệm; mỗi lần "chạm" tăng 6 số cuối lên 1):
${cards.map((k) => `    · ${k.label}: ${base}/c/${k.token}?m=04A1B2C3D4E5F6x${ctr}`).join('\n')}

  Mã OTP hiện ngay trên trang (chế độ thử). Thử như khách khác: cửa sổ ẩn danh / trình duyệt khác.
  Giả thư mã đăng nhập (sau khi khách bấm Lấy mã): BASE_URL=${base} npm run fake-mail -- gpt-demo1@kho.local 482913
`);

const app = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'src/server.js'], { cwd: ROOT, env, stdio: 'inherit' });
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => app.kill(sig));
app.on('exit', (code) => process.exit(code ?? 0));
