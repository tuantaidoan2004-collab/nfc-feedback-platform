// Đóng gói bản cài đặt cho máy chủ thật: ../ban-phat-hanh/tbq-<phiên bản>.tar.gz (+ .sha256).
//   npm run dong-goi
// Chỉ lấy những gì máy chủ cần (mã chạy, lệnh vận hành, tệp cài Caddy / systemd, hướng dẫn) — không có dữ liệu, .env,
// bài kiểm, mô phỏng, diễn tập. Đóng gói xong tự thử: giải nén ra thư mục tạm → tạo .env → seed + pilot → chạy máy chủ
// production → /colap/healthz phải trả "ok" → npm run kiem-tra phải thấy cấu hình đủ.
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, appendFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const NAME = `tbq-${pkg.version}`;
const OUT = join(ROOT, '..', 'ban-phat-hanh');
const NODE_FLAGS = '--disable-warning=ExperimentalWarning';

const FILES = [
  'README.md', '.env.example', 'src', 'extras', 'deploy',
  'docs/HUONG-DAN-MO-BAN.md', 'docs/phoi-hop-voi-QS.md', 'docs/qs-patch',
  ...['seed', 'pilot', 'backup', 'otp-test', 'canva-bot', 'kiem-tra', 'tao-env', 've', 'fake-mail', 'quan-qs'].map((s) => `scripts/${s}.js`),
];
const SCRIPTS = {
  start: `node ${NODE_FLAGS} --env-file-if-exists=.env src/server.js`,
  'tao-env': `node ${NODE_FLAGS} scripts/tao-env.js`,
  'kiem-tra': `node ${NODE_FLAGS} --env-file-if-exists=.env scripts/kiem-tra.js`,
  seed: `node ${NODE_FLAGS} --env-file-if-exists=.env scripts/seed.js`,
  pilot: `node ${NODE_FLAGS} --env-file-if-exists=.env scripts/pilot.js`,
  backup: `node ${NODE_FLAGS} --env-file-if-exists=.env scripts/backup.js`,
  'otp-test': `node ${NODE_FLAGS} --env-file-if-exists=.env scripts/otp-test.js`,
  've': `node ${NODE_FLAGS} --env-file-if-exists=.env scripts/ve.js`,
  'fake-mail': `node ${NODE_FLAGS} --env-file-if-exists=.env scripts/fake-mail.js`,
  'canva-bot': `node ${NODE_FLAGS} --env-file-if-exists=.env scripts/canva-bot.js`,
  quan: `node ${NODE_FLAGS} --env-file-if-exists=.env scripts/quan-qs.js`,
};

// ---------- Gom tệp ----------
const stage = mkdtempSync(join(tmpdir(), 'tbq-dong-goi-'));
const dir = join(stage, NAME);
for (const f of FILES) cpSync(join(ROOT, f), join(dir, f), { recursive: true, filter: (p) => !/\.DS_Store$/.test(p) });
mkdirSync(join(dir, 'data'), { recursive: true });
writeFileSync(join(dir, 'data', '.giu-cho'), ''); // thư mục database (systemd chỉ cho ghi ở đây)
writeFileSync(join(dir, 'package.json'), `${JSON.stringify({
  name: pkg.name, version: pkg.version, private: true, type: 'module', description: pkg.description, engines: pkg.engines, scripts: SCRIPTS,
}, null, 2)}\n`);
writeFileSync(join(dir, 'PHIEN-BAN.txt'), `${NAME} — đóng gói ${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}\nĐọc docs/HUONG-DAN-MO-BAN.md trước.\n`);

mkdirSync(OUT, { recursive: true });
const tarball = join(OUT, `${NAME}.tar.gz`);
const tar = spawnSync('tar', ['-czf', tarball, '-C', stage, NAME], { env: { ...process.env, COPYFILE_DISABLE: '1' }, encoding: 'utf8' });
if (tar.status !== 0) { console.error(tar.stderr); process.exit(1); }
const sha = createHash('sha256').update(readFileSync(tarball)).digest('hex');
writeFileSync(`${tarball}.sha256`, `${sha}  ${NAME}.tar.gz\n`);
rmSync(stage, { recursive: true, force: true });

// ---------- Tự thử bản vừa gói ----------
const test = mkdtempSync(join(tmpdir(), 'tbq-thu-goi-'));
const fail = (msg) => { console.error(`✘ Thử bản gói: ${msg}`); rmSync(test, { recursive: true, force: true }); process.exit(1); };
spawnSync('tar', ['-xzf', tarball, '-C', test]);
const app = join(test, NAME);
const run = (args, env = {}) => spawnSync(process.execPath, [NODE_FLAGS, ...args], { cwd: app, env: { PATH: process.env.PATH, ...env }, encoding: 'utf8' });
let r = run(['scripts/tao-env.js']);
if (r.status !== 0) fail(`tao-env: ${r.stderr}`);
const PORT = 39000 + Math.floor(Math.random() * 500);
appendFileSync(join(app, '.env'), `\nPORT=${PORT}\nCF_ACCOUNT_ID=thu-goi\nCF_EMAIL_TOKEN=thu-goi\nMAIL_FROM=xacnhan@thu-goi.test\n`);
for (const s of ['scripts/seed.js', 'scripts/pilot.js']) {
  r = run(['--env-file=.env', s]);
  if (r.status !== 0) fail(`${s}: ${r.stderr || r.stdout}`);
}
const server = spawn(process.execPath, [NODE_FLAGS, '--env-file=.env', 'src/server.js'], { cwd: app, env: { PATH: process.env.PATH }, stdio: 'ignore' });
let health = '';
for (let i = 0; i < 50 && health !== 'ok'; i++) {
  await new Promise((res) => setTimeout(res, 200));
  try { health = (await (await fetch(`http://127.0.0.1:${PORT}/colap/healthz`, { headers: { 'X-Real-IP': '127.0.0.1' } })).text()).trim(); } catch { /* chưa lên */ }
}
server.kill();
if (health !== 'ok') fail('máy chủ production không trả /colap/healthz = ok');
r = run(['--env-file=.env', 'scripts/kiem-tra.js']);
if (!/Cấu hình production đủ/.test(r.stdout) || !/Gói 6 công cụ/.test(r.stdout)) fail(`kiem-tra:\n${r.stdout}${r.stderr}`);
rmSync(test, { recursive: true, force: true });

console.log(`✓ ${tarball}
  sha256 ${sha}
  Đã thử: giải nén → tạo .env → seed + pilot → máy chủ production trả /colap/healthz "ok" → kiem-tra thấy cấu hình + gói 6 công cụ đủ.`);
