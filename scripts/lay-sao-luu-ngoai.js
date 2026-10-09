// Lấy bản sao lưu ngoài máy chủ về (khi VPS hỏng / mất): tải từ bộ canh Worker, giải mã bằng DATA_KEY, ghi ra tệp .sqlite.
// Chạy ở bất kỳ máy nào có .env chứa DATA_KEY + OFFSITE_URL + OFFSITE_TOKEN (vd. bản .env cất trên Mac).
//   node --env-file=.env scripts/lay-sao-luu-ngoai.js                 → liệt kê các bản đang giữ
//   node --env-file=.env scripts/lay-sao-luu-ngoai.js <tên> [nơi lưu] → tải + giải mã (mặc định ./khoi-phuc-<tên>)
// Sau đó: dừng app, chép tệp thành data/tbq.sqlite (xoá tbq.sqlite-wal / -shm cũ), chạy lại app. Xem docs/SO-TAY-SU-CO.md.
import { writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { loadConfig } from '../src/config.js';
import { openBackup } from '../src/domain/sao-luu-ngoai.js';

const config = loadConfig();
if (!config.offsite.url || !config.offsite.token || !config.dataKey) {
  console.error('Cần OFFSITE_URL, OFFSITE_TOKEN và DATA_KEY trong .env.');
  process.exit(1);
}
const auth = { Authorization: `Bearer ${config.offsite.token}` };
const name = process.argv[2];
if (!name) {
  const r = await fetch(config.offsite.url, { headers: auth });
  if (!r.ok) { console.error(`Lỗi ${r.status}: ${await r.text()}`); process.exit(1); }
  const list = await r.json();
  if (!list.length) console.log('Chưa có bản sao lưu ngoài nào.');
  for (const b of list) console.log(`${b.name}\t${Math.round((b.size || 0) / 1024)} KB\t${b.at ? new Date(b.at).toISOString() : ''}`);
  process.exit(0);
}
const r = await fetch(`${config.offsite.url}/${encodeURIComponent(name)}`, { headers: auth });
if (!r.ok) { console.error(`Lỗi ${r.status}: ${await r.text()}`); process.exit(1); }
const plain = openBackup(Buffer.from(await r.arrayBuffer()), config.dataKey);
const out = process.argv[3] || `./khoi-phuc-${name}`;
writeFileSync(out, plain);
const db = new DatabaseSync(out, { readOnly: true });
const ok = db.prepare('PRAGMA integrity_check').get().integrity_check;
const n = (t) => db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n;
console.log(`Đã ghi ${out} · kiểm toàn vẹn: ${ok} · khách ${n('customers')} · slot ${n('slots')} · tài khoản kho ${n('accounts')} · quán ${n('cafes')}`);
db.close();
