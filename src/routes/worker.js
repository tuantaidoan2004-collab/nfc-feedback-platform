// API cho bot chạy trên máy của chủ tiệm:
//  - bot Canva (scripts/canva-bot.js): mời / gỡ thành viên nhóm. Chỉ nhận email cần mời / gỡ và email tài khoản nhóm.
//  - việc "làm mới" (rotate) của công cụ dùng chung: API trả danh sách Project cần giữ; chỉ giao khi không còn khách thường đang dùng.
// Xác thực: header "Authorization: Bearer <WORKER_TOKEN>".
//
//   POST /worker/tasks/next      {worker, account?, kinds?}  → {task | null}   (kinds mặc định = việc của bot Canva)
//   POST /worker/tasks/:id/done  {worker, workspaces?}
//   POST /worker/tasks/:id/fail  {worker, error, retry?: false, needOwner?: true}
//   POST /worker/heartbeat       {worker}                    (trang Theo dõi hiện "bot đang chạy")
import { HttpError } from '../lib/http.js';
import { get, all, run, tx } from '../db/index.js';
import { safeEqual } from '../lib/crypto.js';
import { hit } from '../lib/ratelimit.js';
import { logEvent } from '../lib/events.js';
import { MIN } from '../lib/time.js';
import { completeTask, createTask, blockingHolders, keptSeats, workspaceName } from '../domain/claims.js';

export const WORKER_KINDS = ['invite_member', 'remove_member', 'rotate'];
const CANVA_KINDS = ['invite_member', 'remove_member'];
export const WORKER_MAX_ATTEMPTS = 3;
const LEASE = 10 * MIN; // bot giữ việc tối đa 10 phút; quá thì việc trả về hàng chờ

function auth(rq) {
  const token = rq.ctx.config.workerToken;
  if (!token) throw new HttpError(404, 'Không tìm thấy trang này.');
  const h = String(rq.req.headers.authorization || '');
  if (h.startsWith('Bearer ') && safeEqual(h.slice(7), token)) return;
  if (hit(rq.ctx, `workerfail:${rq.ip}`, 5, 10 * MIN).ok) logEvent(rq.ctx, { type: 'worker_unauthorized', severity: 'yellow', ip: rq.ip });
  throw new HttpError(401, 'Sai mã bot');
}

// Bot "làm mới" (rotate: xoá Project, đăng xuất, tạo lại Project) chỉ tính là có khi đã hỏi việc rotate gần đây.
// Chưa có bot nào làm việc này (08/10/2026) → việc làm mới là việc của chủ: không ghi "Bot sẽ tự làm", không báo đỏ "bot chưa làm xong".
const ROTATE_BOT_KEY = 'worker-kind:rotate';
const ROTATE_BOT_FRESH = 30 * MIN;
/** Lúc bot làm mới hỏi việc lần cuối nếu trong 30 phút qua, không thì null. */
export function rotateBotSeen(ctx) {
  const t = get(ctx.db, 'SELECT updated_at FROM kv WHERE key = ?', ROTATE_BOT_KEY)?.updated_at;
  return t && t > ctx.now() - ROTATE_BOT_FRESH ? t : null;
}

const workerName = (body) => String(body?.worker || 'bot').replace(/[^\w.-]/g, '').slice(0, 40) || 'bot';
const json = (rq, obj) => rq.send(200, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8' });

/** Báo chủ trên trang Theo dõi: bot không làm được việc này → làm tay ở trang Việc tay. Mỗi việc báo 1 lần. */
export function escalateTask(ctx, taskId, why) {
  const t = get(ctx.db, "SELECT * FROM rotation_tasks WHERE id = ? AND status = 'todo' AND alerted_at IS NULL", taskId);
  if (!t) return;
  run(ctx.db, 'UPDATE rotation_tasks SET alerted_at = ? WHERE id = ?', ctx.now(), taskId);
  const tool = get(ctx.db, 'SELECT t.name FROM accounts a JOIN tools t ON t.id = a.tool_id WHERE a.id = ?', t.account_id)?.name || 'hãng';
  // Làm mới ChatGPT trễ = khách mới sáng nay không nhận được tài khoản đó → đỏ như mời Canva trễ.
  logEvent(ctx, { type: 'worker_task_stuck', severity: t.kind === 'remove_member' ? 'yellow' : 'red', accountId: t.account_id, slotId: t.slot_id,
    data: { taskId, reason: `${why} Làm tay trên ${tool} rồi bấm "Đã xong" ở trang Việc tay.`, error: t.last_error } });
}

export function registerWorkerRoutes(router) {
  router.post('/worker/tasks/next', async (rq) => {
    auth(rq);
    const { ctx } = rq;
    const body = await rq.json();
    const worker = workerName(body);
    // Mỗi cửa sổ Chrome của bot đăng nhập 1 nhóm Canva → chỉ nhận việc của nhóm đó.
    const account = typeof body.account === 'string' ? body.account.trim().toLowerCase() : '';
    const kinds = Array.isArray(body.kinds) ? body.kinds.filter((k) => WORKER_KINDS.includes(k)) : CANVA_KINDS;
    const now = ctx.now();
    const task = tx(ctx.db, () => {
      const list = kinds.length ? all(ctx.db,
        `SELECT r.*, a.login_email, a.label, a.max_holders, t.slug, t.name AS tool_name FROM rotation_tasks r
         JOIN accounts a ON a.id = r.account_id JOIN tools t ON t.id = a.tool_id
         WHERE r.status = 'todo' AND r.kind IN (${kinds.map(() => '?').join(', ')})
           AND ((r.kind = 'rotate' AND t.workspace_bot = 1) OR (r.kind != 'rotate' AND t.auto_worker = 1))
           AND (r.lease_until IS NULL OR r.lease_until < ?) AND r.attempts < ? AND (? = '' OR a.login_email = ?)
         ORDER BY r.kind = 'remove_member' DESC, r.id LIMIT 20`, ...kinds, now, WORKER_MAX_ATTEMPTS, account, account) : [];
      // Làm mới (đăng xuất mọi thiết bị) chỉ khi không còn khách thường nào đang dùng: việc tạo vì thu hồi giữa ngày
      // chờ tới 6h (hoặc chủ làm tay) — bot không được xoá Project của khách đang dùng.
      const t = list.find((x) => x.kind !== 'rotate' || blockingHolders(ctx, x.account_id) === 0);
      if (!t) return null;
      run(ctx.db, 'UPDATE rotation_tasks SET lease_until = ?, worker = ?, attempts = attempts + 1 WHERE id = ?', now + LEASE, worker, t.id);
      return t;
    });
    run(ctx.db, 'INSERT INTO kv(key, value, updated_at) VALUES(?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
      `worker:${worker}`, 'next', now);
    if (kinds.includes('rotate')) {
      run(ctx.db, 'INSERT INTO kv(key, value, updated_at) VALUES(?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
        ROTATE_BOT_KEY, worker, now);
    }
    if (!task) return json(rq, { ok: true, task: null });
    logEvent(ctx, { type: 'worker_task_taken', accountId: task.account_id, slotId: task.slot_id, data: { taskId: task.id, worker, attempt: task.attempts + 1 } });
    const out = {
      id: task.id, kind: task.kind, email: task.detail, slotId: task.slot_id, attempt: task.attempts + 1, leaseUntil: now + LEASE,
      tool: { slug: task.slug, name: task.tool_name }, account: { email: task.login_email, label: task.label },
    };
    if (task.kind === 'rotate') {
      const keep = keptSeats(ctx, task.account_id).filter((k) => k.seat);
      const seats = Math.min(8, task.max_holders);
      out.email = null;
      out.reason = task.reason;
      out.workspaces = Array.from({ length: seats }, (_, i) => ({ seat: i + 1, name: workspaceName(ctx, i + 1) }));
      out.keep = keep.map((k) => ({ seat: k.seat, name: workspaceName(ctx, k.seat) }));
      // "Delete all chats" xoá cả chat trong Project → chỉ dùng khi không giữ Project nào.
      out.deleteAllChats = keep.length === 0;
    }
    json(rq, { ok: true, task: out });
  });

  router.post('/worker/tasks/:id/done', async (rq) => {
    auth(rq);
    const body = await rq.json();
    const taskId = Number(rq.params.id) || 0;
    const task = get(rq.ctx.db, "SELECT kind FROM rotation_tasks WHERE id = ? AND status = 'todo'", taskId);
    // Slot kết thúc (khách huỷ / bị thu hồi) lúc bot đang mời → việc mời đã bị huỷ, nhưng bot vẫn mời xong: khách đã ở trong nhóm
    // mà không ai gỡ. Tạo việc gỡ ngay (trước 08/10/2026: trả "đã xử lý rồi", khách ở lại nhóm Canva Pro mãi).
    const late = task ? null : get(rq.ctx.db,
      `SELECT r.*, s.status AS slot_status FROM rotation_tasks r JOIN slots s ON s.id = r.slot_id
       WHERE r.id = ? AND r.kind = 'invite_member' AND r.status = 'cancelled' AND s.status NOT IN ('active', 'pending_invite')`, taskId);
    if (late && !get(rq.ctx.db, "SELECT 1 FROM rotation_tasks WHERE slot_id = ? AND kind = 'remove_member'", late.slot_id)) {
      createTask(rq.ctx, { accountId: late.account_id, slotId: late.slot_id, kind: 'remove_member', reason: 'slot_revoked', detail: late.detail });
      logEvent(rq.ctx, { type: 'worker_late_invite', severity: 'yellow', accountId: late.account_id, slotId: late.slot_id, data: { taskId, worker: workerName(body) } });
      return json(rq, { ok: true, message: 'Slot đã kết thúc trong lúc mời — đã tạo việc gỡ khách ra khỏi nhóm.' });
    }
    // Làm mới ChatGPT: giữ mật khẩu (khách cũ không có mã 2FA nên không vào lại được), lưu link Project bot vừa tạo.
    const r = completeTask(rq.ctx, taskId, task?.kind === 'rotate'
      ? { by: `bot:${workerName(body)}`, keepPassword: true, workspaces: Array.isArray(body.workspaces) ? body.workspaces : null }
      : { by: `bot:${workerName(body)}` });
    run(rq.ctx.db, 'UPDATE rotation_tasks SET lease_until = NULL WHERE id = ?', taskId);
    json(rq, r);
  });

  router.post('/worker/tasks/:id/fail', async (rq) => {
    auth(rq);
    const { ctx } = rq;
    const body = await rq.json();
    const taskId = Number(rq.params.id) || 0;
    const task = get(ctx.db, "SELECT * FROM rotation_tasks WHERE id = ? AND status = 'todo'", taskId);
    if (!task) return json(rq, { ok: false, message: 'Việc này đã xử lý rồi.' });
    const error = String(body.error || 'Không rõ lỗi').replace(/\s+/g, ' ').slice(0, 300);
    run(ctx.db, 'UPDATE rotation_tasks SET lease_until = NULL, last_error = ? WHERE id = ?', error, taskId);
    logEvent(ctx, { type: 'worker_task_failed', severity: 'yellow', accountId: task.account_id, slotId: task.slot_id, data: { taskId, worker: workerName(body), error } });
    const giveUp = body.retry === false || task.attempts >= WORKER_MAX_ATTEMPTS;
    // Hãng đòi xác minh người thật / captcha: bot không vượt, chủ làm tay trong cửa sổ bot.
    if (body.needOwner) escalateTask(ctx, taskId, 'Hãng đòi xác minh người thật (captcha) — bot không tự vượt.');
    else if (giveUp) escalateTask(ctx, taskId, `Bot đã thử ${task.attempts} lần không được.`);
    json(rq, { ok: true, willRetry: !giveUp });
  });

  // Bot gặp captcha / trang lạ: báo chủ ngay (đỏ trên Theo dõi) và giữ việc thêm 15 phút trong lúc chờ chủ làm tay trong cửa sổ bot.
  router.post('/worker/tasks/:id/alert', async (rq) => {
    auth(rq);
    const { ctx } = rq;
    const body = await rq.json();
    const taskId = Number(rq.params.id) || 0;
    const t = get(ctx.db, "SELECT * FROM rotation_tasks WHERE id = ? AND status = 'todo' AND worker = ?", taskId, workerName(body));
    if (!t) return json(rq, { ok: false, message: 'Việc này đã xử lý rồi.' });
    const msg = String(body.message || 'Bot cần chủ giúp').replace(/\s+/g, ' ').slice(0, 200);
    run(ctx.db, 'UPDATE rotation_tasks SET lease_until = ?, last_error = ? WHERE id = ?', ctx.now() + 15 * MIN, msg, taskId);
    escalateTask(ctx, taskId, `${msg} — mở cửa sổ Chrome của bot (VPS: zsh chuyen-vps/bot-canva-len-vps.sh dang-nhap) và làm tay bước đó, bot sẽ tự làm tiếp.`);
    json(rq, { ok: true, leaseUntil: ctx.now() + 15 * MIN });
  });

  router.post('/worker/heartbeat', async (rq) => {
    auth(rq);
    const body = await rq.json();
    run(rq.ctx.db, 'INSERT INTO kv(key, value, updated_at) VALUES(?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
      `worker:${workerName(body)}`, 'heartbeat', rq.ctx.now());
    json(rq, { ok: true, now: rq.ctx.now() });
  });
}
