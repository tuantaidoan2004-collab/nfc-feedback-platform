// Việc định kỳ: hết hạn slot / lượt lấy mã, mở khoá hết hạn, dọn dữ liệu.
import { get, all, run } from './db/index.js';
import { logEvent } from './lib/events.js';
import { MIN, HOUR, DAY } from './lib/time.js';
import { expireDueSlots, blockingHolders } from './domain/claims.js';
import { expireWindows, escalatePendingOrphans } from './domain/codes.js';
import { escalateTask } from './routes/worker.js';
import { checkMailRoute, MAIL_ROUTE_EVERY } from './domain/mail-route.js';

const kvGet = (ctx, key) => get(ctx.db, 'SELECT value FROM kv WHERE key = ?', key)?.value ?? null;
const kvSet = (ctx, key, value) => run(ctx.db,
  'INSERT INTO kv(key, value, updated_at) VALUES(?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
  key, String(value), ctx.now());

/** Việc mời / gỡ giao cho bot Canva mà quá workerAlertMin phút chưa xong → báo chủ làm tay (máy chạy bot có thể đang tắt). */
export function watchWorkerTasks(ctx) {
  const cut = ctx.now() - ctx.settings().workerAlertMin * MIN;
  const due = all(ctx.db,
    `SELECT r.id, r.account_id, r.kind FROM rotation_tasks r JOIN accounts a ON a.id = r.account_id JOIN tools t ON t.id = a.tool_id
     WHERE r.status = 'todo' AND r.alerted_at IS NULL AND r.created_at < ?
       AND ((t.auto_worker = 1 AND r.kind IN ('invite_member', 'remove_member')) OR (t.workspace_bot = 1 AND r.kind = 'rotate'))`, cut);
  let n = 0;
  for (const r of due) {
    // Làm mới ChatGPT: chỉ tính trễ khi đã tới lượt làm (không còn khách thường đang dùng) VÀ không bot nào đang giữ việc.
    if (r.kind === 'rotate') {
      if (blockingHolders(ctx, r.account_id) > 0) continue;
      const lastEnd = get(ctx.db, "SELECT MAX(ended_at) AS t FROM slots WHERE account_id = ? AND status IN ('expired', 'revoked')", r.account_id).t || 0;
      const leased = get(ctx.db, 'SELECT lease_until FROM rotation_tasks WHERE id = ?', r.id).lease_until > ctx.now();
      if (lastEnd > cut || leased) continue;
    }
    escalateTask(ctx, r.id, `Quá ${ctx.settings().workerAlertMin} phút bot chưa làm xong (máy chạy bot có thể đang tắt).`);
    n++;
  }
  return n;
}

/** Khách hết thời hạn khoá → tự mở. */
export function unlockExpired(ctx) {
  const due = all(ctx.db, "SELECT id FROM customers WHERE status = 'locked' AND locked_until IS NOT NULL AND locked_until <= ?", ctx.now());
  for (const { id } of due) {
    run(ctx.db, "UPDATE customers SET status = 'active', lock_reason = NULL, locked_until = NULL WHERE id = ?", id);
    logEvent(ctx, { type: 'customer_unlocked', customerId: id, data: { by: 'auto' } });
  }
  return due.length;
}

/** Dọn dữ liệu theo thời hạn lưu trữ (Luật BVDLCN: chỉ giữ đủ lâu để chống lạm dụng). */
export function retention(ctx) {
  const s = ctx.settings();
  const now = ctx.now();
  const ipCut = now - s.retentionIpDays * DAY;
  const evCut = now - s.retentionEventsDays * DAY;
  const r = {};
  r.mailBodies = run(ctx.db, 'UPDATE mails SET body = NULL WHERE body IS NOT NULL AND received_at < ?', now - s.retentionMailBodyHours * HOUR).changes;
  r.mailCodes = run(ctx.db, "UPDATE mails SET code = NULL WHERE code IS NOT NULL AND verdict != 'orphan_wait' AND received_at < ?", now - HOUR).changes;
  r.eventIps = run(ctx.db, 'UPDATE events SET ip = NULL WHERE ip IS NOT NULL AND created_at < ?', ipCut).changes;
  r.tapIps = run(ctx.db, 'UPDATE taps SET ip = NULL WHERE ip IS NOT NULL AND created_at < ?', ipCut).changes;
  r.events = run(ctx.db, 'DELETE FROM events WHERE created_at < ?', evCut).changes;
  r.taps = run(ctx.db, 'DELETE FROM taps WHERE created_at < ?', evCut).changes;
  // Vé từ trang quán chỉ cần nhớ đủ lâu để chặn dùng lại (vé hết hạn sau ticketTtlMin phút).
  r.tickets = run(ctx.db, 'DELETE FROM qs_tickets WHERE used_at < ?', now - 2 * DAY).changes;
  r.mails = run(ctx.db, 'DELETE FROM mails WHERE received_at < ?', evCut).changes;
  r.otps = run(ctx.db, 'DELETE FROM otps WHERE created_at < ?', now - DAY).changes;
  r.sessions = run(ctx.db, 'DELETE FROM sessions WHERE expires_at < ?', now).changes;
  r.adminSessions = run(ctx.db, 'DELETE FROM admin_sessions WHERE expires_at < ?', now).changes;
  r.rateLimits = run(ctx.db, 'DELETE FROM rate_limits WHERE reset_at < ?', now).changes;
  r.codeWindows = run(ctx.db, "DELETE FROM code_windows WHERE status != 'open' AND opened_at < ?", evCut).changes;
  return r;
}

export async function runJobs(ctx) {
  const steps = {
    expireDueSlots, expireWindows, escalatePendingOrphans, unlockExpired, watchWorkerTasks,
  };
  const out = {};
  for (const [name, fn] of Object.entries(steps)) {
    try { out[name] = fn(ctx); } catch (err) { ctx.log('error', `job ${name} failed`, { err: String(err?.stack || err) }); }
  }
  const now = ctx.now();
  try {
    if (now - Number(kvGet(ctx, 'job_retention_at') || 0) >= HOUR) {
      out.retention = retention(ctx);
      kvSet(ctx, 'job_retention_at', now);
    }
  } catch (err) { ctx.log('error', 'job retention failed', { err: String(err?.stack || err) }); }
  // Thư mã về nhầm hộp thư catch-all (thiếu quy tắc riêng trên Cloudflare) → báo đỏ. Gọi mạng nên 10 phút / lần.
  try {
    if (ctx.config.hubWatch?.url && now - Number(kvGet(ctx, 'job_mailroute_at') || 0) >= MAIL_ROUTE_EVERY) {
      kvSet(ctx, 'job_mailroute_at', now);
      out.mailRoute = await checkMailRoute(ctx);
    }
  } catch (err) { ctx.log('error', 'job mailRoute failed', { err: String(err?.stack || err) }); }
  return out;
}

/** Chạy runJobs mỗi intervalMs. Trả về hàm dừng. */
export function startJobs(ctx, intervalMs = 30_000) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try { await runJobs(ctx); } finally { running = false; }
  };
  const first = setTimeout(tick, 1000);
  const timer = setInterval(tick, intervalMs);
  return () => { clearTimeout(first); clearInterval(timer); };
}
