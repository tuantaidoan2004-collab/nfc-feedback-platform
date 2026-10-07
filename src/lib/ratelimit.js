// Giới hạn tần suất dạng cửa sổ cố định, lưu trong SQLite (sống sót qua restart).
import { get, run } from '../db/index.js';

/** Tăng bộ đếm của key. Trả về {ok, count, remaining, retryAfterSec}. ok=false khi đã vượt limit. */
export function hit(ctx, key, limit, windowMs) {
  const now = ctx.now();
  const row = get(ctx.db, 'SELECT count, reset_at FROM rate_limits WHERE key = ?', key);
  let count;
  let resetAt;
  if (!row || row.reset_at <= now) {
    count = 1;
    resetAt = now + windowMs;
    run(ctx.db, 'INSERT INTO rate_limits(key, count, reset_at) VALUES(?, ?, ?) ON CONFLICT(key) DO UPDATE SET count = excluded.count, reset_at = excluded.reset_at', key, count, resetAt);
  } else {
    count = row.count + 1;
    resetAt = row.reset_at;
    run(ctx.db, 'UPDATE rate_limits SET count = ? WHERE key = ?', count, key);
  }
  return { ok: count <= limit, count, remaining: Math.max(0, limit - count), retryAfterSec: Math.ceil((resetAt - now) / 1000) };
}

/** Xem bộ đếm hiện tại mà không tăng. */
export function peek(ctx, key, limit) {
  const now = ctx.now();
  const row = get(ctx.db, 'SELECT count, reset_at FROM rate_limits WHERE key = ?', key);
  if (!row || row.reset_at <= now) return { ok: true, count: 0, remaining: limit, retryAfterSec: 0 };
  return { ok: row.count < limit, count: row.count, remaining: Math.max(0, limit - row.count), retryAfterSec: Math.ceil((row.reset_at - now) / 1000) };
}

export function reset(ctx, key) {
  run(ctx.db, 'DELETE FROM rate_limits WHERE key = ?', key);
}
