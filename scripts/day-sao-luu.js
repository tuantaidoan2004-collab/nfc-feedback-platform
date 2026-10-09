// Đẩy bản sao lưu mới nhất ra ngoài máy chủ (mã hoá bằng khoá suy ra từ DATA_KEY) — chạy ngay sau scripts/backup.js
// (tbq-backup.service: ExecStartPost). Cần OFFSITE_URL + OFFSITE_TOKEN trong .env; thiếu thì bỏ qua, không làm hỏng sao lưu trong máy.
//   npm run day-sao-luu                     → tệp tbq-*.sqlite mới nhất trong ./data/backup
//   npm run day-sao-luu -- <tệp.sqlite>     → tệp tự chọn
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from '../src/config.js';
import { openDb } from '../src/db/index.js';
import { pushOffsite } from '../src/domain/sao-luu-ngoai.js';

const config = loadConfig();
if (!config.offsite.url || !config.offsite.token) {
  console.log('Chưa cấu hình sao lưu ngoài máy (OFFSITE_URL / OFFSITE_TOKEN) — bỏ qua.');
  process.exit(0);
}
if (!config.offsite.url.startsWith('https://') || config.offsite.token.length < 32) {
  console.error('OFFSITE_URL phải là https:// và OFFSITE_TOKEN dài ít nhất 32 ký tự (giống BACKUP_TOKEN của Worker).');
  process.exit(1);
}
let file = process.argv[2];
if (!file) {
  const dir = './data/backup';
  const list = readdirSync(dir).filter((n) => /^tbq-.*\.sqlite$/.test(n)).map((n) => ({ n, t: statSync(join(dir, n)).mtimeMs })).sort((a, b) => b.t - a.t);
  if (!list.length) { console.error('Chưa có bản sao lưu nào trong ./data/backup.'); process.exit(1); }
  file = join(dir, list[0].n);
}
const db = openDb(config.dbPath);
const r = await pushOffsite({ config, db, file });
db.close();
if (r.ok) console.log(`Đã đẩy ${r.name} ra ngoài máy chủ (${Math.round(r.size / 1024)} KB, đã mã hoá).`);
else { console.error(`Không đẩy được sao lưu ra ngoài: ${r.error}`); process.exit(1); }
