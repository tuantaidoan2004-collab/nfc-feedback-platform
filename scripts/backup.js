// Sao lưu database đang chạy ra 1 tệp (an toàn cả khi app đang ghi).
//   npm run backup                          → ./data/backup/tbq-<ngày>.sqlite
//   npm run backup -- /backup/tbq.sqlite    → đường dẫn tự chọn
// Bản sao KHÔNG chứa DATA_KEY (nằm trong .env): cất DATA_KEY ở nơi khác, mất nó là mất mọi mật khẩu đã mã hoá.
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync, backup } from 'node:sqlite';
import { loadConfig } from '../src/config.js';

const config = loadConfig();
const dest = process.argv[2] || `./data/backup/tbq-${new Date().toISOString().slice(0, 10)}.sqlite`;
mkdirSync(dirname(dest), { recursive: true });
const db = new DatabaseSync(config.dbPath);
await backup(db, dest);
db.close();
console.log(`Đã sao lưu ${config.dbPath} → ${dest}`);
