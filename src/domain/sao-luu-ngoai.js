// Sao lưu ngoài máy chủ (đánh giá thương mại 09/10/2026, P0-4): bản sao lưu mới nhất được nén + mã hoá rồi đẩy lên bộ canh
// Worker tbq-canh-ngoai (lưu trong Workers KV, tự xoá sau 35 ngày). Máy chủ VPS hỏng / mất hẳn vẫn còn bản ngoài, không phụ thuộc
// máy Mac (Mac ngủ / tắt thì không kéo về được).
// Mã hoá AES-256-GCM, khoá suy ra từ DATA_KEY (HKDF, nhãn riêng) → Cloudflare chỉ giữ dữ liệu đã mã hoá; khôi phục cần DATA_KEY
// (cất trong trình quản lý mật khẩu + bản .env trên Mac). Không có OFFSITE_URL / OFFSITE_TOKEN → không làm gì.
import crypto from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { get, run } from '../db/index.js';

const MAGIC = Buffer.from('TBQB1');
const KV_KEY = 'offsite_backup';
/** Workers KV nhận tối đa 25 MiB / giá trị — chừa khoảng trống. */
export const OFFSITE_MAX = 24 * 1024 * 1024;

const backupKey = (dataKeyB64) => Buffer.from(crypto.hkdfSync('sha256', Buffer.from(dataKeyB64, 'base64'), Buffer.alloc(0), 'tbq-sao-luu-ngoai-v1', 32));

/** Nén + mã hoá. → Buffer "TBQB1" | iv(12) | tag(16) | dữ liệu */
export function sealBackup(plain, dataKeyB64) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', backupKey(dataKeyB64), iv);
  const ct = Buffer.concat([c.update(gzipSync(plain)), c.final()]);
  return Buffer.concat([MAGIC, iv, c.getAuthTag(), ct]);
}

/** Giải mã + giải nén. Sai khoá / dữ liệu hỏng → ném lỗi. */
export function openBackup(sealed, dataKeyB64) {
  if (!sealed.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('Không phải tệp sao lưu TBQ (thiếu TBQB1)');
  const iv = sealed.subarray(5, 17), tag = sealed.subarray(17, 33), ct = sealed.subarray(33);
  const d = crypto.createDecipheriv('aes-256-gcm', backupKey(dataKeyB64), iv);
  d.setAuthTag(tag);
  return gunzipSync(Buffer.concat([d.update(ct), d.final()]));
}

/**
 * Đẩy 1 tệp sao lưu lên OFFSITE_URL (POST, Bearer OFFSITE_TOKEN, header x-ten = tên tệp). Ghi kết quả vào kv để trang Máy chủ đọc.
 * db: database đang chạy (ghi kết quả). → {ok, name, size, at} | {ok:false, error, at}
 */
export async function pushOffsite({ config, db, file, now = Date.now(), fetchImpl = fetch }) {
  const name = basename(file);
  let res;
  try {
    const sealed = sealBackup(readFileSync(file), config.dataKey);
    if (sealed.length > OFFSITE_MAX) throw new Error(`tệp đã mã hoá ${Math.round(sealed.length / 1048576)} MB, quá giới hạn 24 MB của Workers KV — chuyển sang R2`);
    const r = await fetchImpl(config.offsite.url, {
      method: 'POST', body: sealed, signal: AbortSignal.timeout(60_000),
      headers: { Authorization: `Bearer ${config.offsite.token}`, 'Content-Type': 'application/octet-stream', 'x-ten': name },
    });
    const text = (await r.text()).slice(0, 160);
    res = r.ok ? { ok: true, name, size: sealed.length } : { ok: false, error: `HTTP ${r.status} ${text}`.trim() };
  } catch (err) {
    res = { ok: false, error: String(err?.cause?.code || err?.message || err).slice(0, 160) };
  }
  res.at = now;
  if (db) {
    run(db, 'INSERT INTO kv(key, value, updated_at) VALUES(?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
      KV_KEY, JSON.stringify(res), now);
  }
  return res;
}

/** Kết quả đẩy gần nhất (null = chưa đẩy lần nào). */
export function lastOffsite(db) {
  const row = get(db, 'SELECT value FROM kv WHERE key = ?', KV_KEY);
  if (!row) return null;
  try { return JSON.parse(row.value); } catch { return null; }
}
