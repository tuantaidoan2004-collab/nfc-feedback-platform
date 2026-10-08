import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const SCHEMA = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');

/** Mở (hoặc tạo) database SQLite và chạy schema. path=':memory:' cho test. */
export function openDb(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

/** Database tạo từ bản cũ: thêm cột mới (CREATE TABLE IF NOT EXISTS không tự thêm cột). Chạy lại nhiều lần an toàn. */
function migrate(db) {
  const add = (table, column, def) => {
    if (db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column)) return false;
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`);
    return true;
  };
  add('cafes', 'qs_slug', 'TEXT');
  add('cafes', 'paused_by', 'TEXT');
  add('cards', 'kind', "TEXT NOT NULL DEFAULT 'nfc'");
  add('tools', 'reuse', "TEXT NOT NULL DEFAULT 'rotate'");
  add('tools', 'mail_code', 'INTEGER NOT NULL DEFAULT 0');
  add('tools', 'daily_cap', 'INTEGER');
  add('tools', 'holders_default', 'INTEGER NOT NULL DEFAULT 1');
  add('accounts', 'totp_enc', 'TEXT');
  add('slots', 'seat', 'INTEGER');
  add('slots', 'redeem_id', 'INTEGER');
  add('slots', 'totp_until', 'INTEGER');
  add('slots', 'totp_device', 'TEXT');
  add('tools', 'auto_worker', 'INTEGER NOT NULL DEFAULT 0');
  add('tools', 'end_hour', 'INTEGER');
  add('tools', 'account_days', 'INTEGER');
  add('slots', 'invite_email', 'TEXT');
  add('rotation_tasks', 'lease_until', 'INTEGER');
  add('rotation_tasks', 'worker', 'TEXT');
  add('rotation_tasks', 'attempts', 'INTEGER NOT NULL DEFAULT 0');
  add('rotation_tasks', 'last_error', 'TEXT');
  add('rotation_tasks', 'alerted_at', 'INTEGER');
  add('tools', 'reserve_account', 'INTEGER NOT NULL DEFAULT 0');
  add('tools', 'voucher_code', 'INTEGER NOT NULL DEFAULT 0');
  add('tools', 'workspace_bot', 'INTEGER NOT NULL DEFAULT 0');
  add('slots', 'extended_days', 'INTEGER NOT NULL DEFAULT 0');
  add('slots', 'code_free', 'INTEGER NOT NULL DEFAULT 0');
  add('vouchers', 'device_id', 'TEXT');
  add('rotation_tasks', 'code_until', 'INTEGER');
  add('accounts', 'cafe_id', 'INTEGER REFERENCES cafes(id)');
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS cafes_qs_slug ON cafes(qs_slug COLLATE NOCASE) WHERE qs_slug IS NOT NULL;
           CREATE UNIQUE INDEX IF NOT EXISTS one_qs_entry_per_cafe ON cards(cafe_id) WHERE kind = 'qs';
           CREATE INDEX IF NOT EXISTS vouchers_device ON vouchers(device_id) WHERE device_id IS NOT NULL;`);
}

const stmtCache = new WeakMap();

function stmt(db, sql) {
  let m = stmtCache.get(db);
  if (!m) { m = new Map(); stmtCache.set(db, m); }
  let s = m.get(sql);
  if (!s) { s = db.prepare(sql); m.set(sql, s); }
  return s;
}

// node:sqlite không nhận undefined/boolean → đổi sang null/0/1.
function clean(v) {
  if (v === undefined) return null;
  if (v === true) return 1;
  if (v === false) return 0;
  return v;
}

function bind(params) {
  if (params.length === 1 && params[0] !== null && typeof params[0] === 'object' && !Array.isArray(params[0])) {
    const o = {};
    for (const [k, v] of Object.entries(params[0])) o[k] = clean(v);
    return [o];
  }
  return params.map(clean);
}

/** Một dòng hoặc undefined. Tham số: vị trí (?, ?) hoặc 1 object ({id} cho :id). */
export const get = (db, sql, ...params) => stmt(db, sql).get(...bind(params));
/** Mảng các dòng. */
export const all = (db, sql, ...params) => stmt(db, sql).all(...bind(params));
/** Chạy lệnh ghi. Trả về {changes, lastInsertRowid}. */
export function run(db, sql, ...params) {
  const r = stmt(db, sql).run(...bind(params));
  return { changes: Number(r.changes), lastInsertRowid: Number(r.lastInsertRowid) };
}

/**
 * Chạy fn trong 1 transaction (BEGIN IMMEDIATE). fn phải ĐỒNG BỘ — không await bên trong.
 * Gọi lồng nhau thì chỉ transaction ngoài cùng có hiệu lực.
 */
export function tx(db, fn) {
  if (db.isTransaction) return fn();
  db.exec('BEGIN IMMEDIATE');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch { /* đã rollback */ }
    throw e;
  }
}
