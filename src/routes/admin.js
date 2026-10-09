// Trang quản trị /admin/*. Đăng nhập bằng ADMIN_PASSWORD; cookie "adm" (SameSite=Strict, path /admin);
// mọi POST kiểm tra Origin + CSRF token.
import { readFileSync } from 'node:fs';
import { HttpError, html } from '../lib/http.js';
import { get, all, run, tx } from '../db/index.js';
import { randomToken, sha256, safeEqual, encrypt } from '../lib/crypto.js';
import { parseTotpSecret, verifyTotp } from '../lib/totp.js';
import { hit, reset } from '../lib/ratelimit.js';
import { logEvent } from '../lib/events.js';
import { normalizePhone, normalizeEmail, maskPhone, displayPhone } from '../lib/phone.js';
import { SETTING_DEFS, SETTING_RANGE, SETTING_GROUPS, SETTING_CHOICES, checkSetting, pairProblems } from '../lib/settings.js';
import { HOUR, MIN, DAY, startOfLocalDay, startOfLocalMonth, fmtLocal } from '../lib/time.js';
import { completeTask, revokeSlot, createTask, blockingHolders, keptSeats, workspaceName } from '../domain/claims.js';
import { createBatch, voidVoucher, voidBatch, unbindVoucher, extendSlot, formatCode, VOUCHER_KINDS, isAutoBatch, autoBatchSql } from '../domain/vouchers.js';
import { lockCustomer, unlockCustomer, addStrike, lockDevice, unlockDevice, lockCard, unlockCard, customerRisk } from '../domain/risk.js';
import { eraseCustomer } from '../domain/auth.js';
import { deliverManualCode, MANUAL_CODE_KINDS } from '../domain/codes.js';
import { accountLoad, toolAvailability, toolUsedToday, poolSeats, USABLE_SQL, COUNTED } from '../domain/quota.js';
import { quarantineAccount, DEFAULT_TOOL_PATTERNS } from '../domain/mail.js';
import { statsSince, cafeReport } from '../domain/stats.js';
import { freeTextProblem, POLICY_MESSAGE } from '../lib/policy.js';
import { rotateBotSeen } from './worker.js';
import { hostChecks, hostFacts, probePublic } from '../domain/may-chu.js';
import { QS_EVENT } from '../qs-event.js';
import { createCafe, shopFromInput, qsPageInfo, cafeByShop, cafeShopAliases, linkShop, mergeCafe, cafeKey } from '../domain/presence.js';
import { MAX_WORKSPACES, parseAccountLine, addAccounts, addRedeemCodes, updateAccount, dropRotateTasks, resolveKho } from '../domain/stock.js';
import {
  adminPage, csrfField, postButton, table, t, sev, badge, csvFile, eventSummary, secHead, stat, chips, link, icon, dayLabel,
  EVENT_LABEL, TICKET_ERROR, SLOT_STATUS, ACCOUNT_STATUS, LOGIN_TYPE, TASK_KIND, TASK_REASON, END_REASON, REUSE, ALERT_HINT, ACCOUNT_TONE, SLOT_TONE,
} from '../views/admin.js';

const SESSION_HOURS = 12;
const PKG_VERSION = (() => { try { return JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version; } catch { return ''; } })();
const BY = 'web';

// ---------- Đăng nhập & bao bọc handler ----------

function auth(rq) {
  const tok = rq.cookies.adm;
  rq.state.admin = tok ? get(rq.ctx.db, 'SELECT * FROM admin_sessions WHERE id = ? AND expires_at > ?', sha256(tok), rq.ctx.now()) || null : null;
  return rq.state.admin;
}

function view(rq, opts) {
  const { ctx } = rq;
  rq.sendHtml(200, adminPage({ csrf: rq.state.admin?.csrf, flash: rq.query.msg, nav: navCounts(ctx), today: dayLabel(ctx.now(), off(ctx)), ...opts }));
}

/** Số đếm trên thanh bên: đỏ = việc chờ chủ làm, xám = để biết. */
function navCounts(ctx) {
  const n = (sql, ...p) => get(ctx.db, sql, ...p)?.n || 0;
  const now = ctx.now();
  return {
    tasks: n("SELECT COUNT(*) AS n FROM rotation_tasks WHERE status = 'todo'"),
    extend: n("SELECT COUNT(*) AS n FROM extend_requests r JOIN slots s ON s.id = r.slot_id WHERE r.status = 'pending' AND s.status = 'active'"),
    alerts: n("SELECT COUNT(*) AS n FROM events WHERE severity = 'red' AND created_at > ?", now - 2 * HOUR),
    canva: n("SELECT COUNT(*) AS n FROM rotation_tasks WHERE status = 'todo' AND kind IN ('invite_member', 'remove_member') AND alerted_at IS NOT NULL"),
    orphans: n("SELECT COUNT(*) AS n FROM mails WHERE verdict = 'orphan' AND received_at > ?", now - DAY),
    ready: n("SELECT COUNT(*) AS n FROM accounts WHERE status = 'ready'"),
    cafes: n("SELECT COUNT(*) AS n FROM cafes WHERE status = 'active'"),
    slots: n("SELECT COUNT(*) AS n FROM slots WHERE status = 'active'"),
    host: hostChecks(ctx).filter((c) => c.level === 'bad').length,
  };
}

const plus = (label) => html`${icon('plus')}${label}`;

/** Trang GET cần đăng nhập. */
const P = (fn) => async (rq) => {
  if (!auth(rq)) {
    const here = rq.path + (rq.url.search || '');
    return rq.redirect(here === '/admin' ? '/admin/login' : `/admin/login?next=${encodeURIComponent(here)}`);
  }
  await fn(rq);
};

/** Trang quay về sau khi đăng nhập: chỉ đường dẫn nội bộ của trang quản trị. */
const safeNext = (v) => (/^\/admin(\/[A-Za-z0-9/_.-]*)?(\?[^#\s]*)?$/.test(String(v || '')) && !String(v).includes('//') ? String(v) : '/admin');

/** Form POST: kiểm tra Origin + CSRF; fn trả về {to, msg} để chuyển trang kèm thông báo. */
const A = (fn) => async (rq) => {
  if (!auth(rq)) throw new HttpError(401, 'Cần đăng nhập quản trị.');
  rq.assertSameOrigin();
  const f = await rq.form();
  if (!safeEqual(f._csrf, rq.state.admin.csrf)) throw new HttpError(403, 'Phiên làm việc đã đổi. Tải lại trang rồi thử lại.');
  const r = (await fn(rq, f)) || {};
  if (r.rendered) return; // fn đã tự vẽ lại trang (vd. form lỗi giữ nguyên chữ đã gõ)
  const to = typeof f.back === 'string' && f.back.startsWith('/admin') ? f.back : (r.to || '/admin');
  // "#them" phải nằm sau msg=… (để trước thì msg rơi vào phần # → không hiện báo).
  const [path, hash] = to.split('#');
  const base = path.replace(/([?&])msg=[^&]*&?/g, '$1').replace(/[?&]$/, '');
  rq.redirect(`${r.msg ? `${base}${base.includes('?') ? '&' : '?'}msg=${encodeURIComponent(r.msg)}` : base}${hash ? `#${hash}` : ''}`);
};

/** JSON cho trang trực duyệt: POST cần header x-csrf. */
const J = (fn) => async (rq) => {
  if (!auth(rq)) throw new HttpError(401, 'Cần đăng nhập quản trị.');
  if (rq.method === 'POST') {
    rq.assertSameOrigin();
    if (!safeEqual(rq.req.headers['x-csrf'], rq.state.admin.csrf)) throw new HttpError(403, 'Phiên làm việc đã đổi. Tải lại trang.');
  }
  rq.sendJson(200, await fn(rq));
};

const go = (to, msg) => ({ to, msg });
const int = (v, d = null) => (v === undefined || v === null || String(v).trim() === '' ? d : Number.parseInt(v, 10));
const hourOrNull = (v) => { const n = int(v); return n == null || Number.isNaN(n) ? null : Math.min(23, Math.max(0, n)); };
const id = (rq) => Number(rq.params.id) || 0;
const off = (ctx) => ctx.settings().timezoneOffsetMin;

// ---------- Truy vấn dùng chung ----------

const QS_SLUG_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;
/** Chữ khách thấy trong Cài đặt: phải qua luật Google của QS. */
const PUBLIC_TEXT_SETTINGS = ['eventTitle'];

/** Mã quán trên Quite Sensational (slug trang quán, ví dụ k3x9q); không trùng quán khác. Để trống = null. → {value} | {error} */
function qsSlug(ctx, raw, cafeId = 0) {
  const v = shopFromInput(raw);
  if (!v) return { value: null };
  // Giống ràng buộc slug của QS (db/schema.sql shops_slug_check): chữ không dấu, số, '-', tối đa 63 ký tự.
  if (!QS_SLUG_RE.test(v)) return { error: 'Mã quán QS chỉ gồm chữ thường không dấu, số và dấu "-" (đúng như trong link trang quán trên QS).' };
  const other = cafeByShop(ctx, v);
  if (other && other.id !== cafeId) return { error: `Mã quán QS "${v}" đang gắn với quán ${other.name}.` };
  return { value: v };
}

/** Khoảng thời gian cho báo cáo quán (theo giờ VN). key: 7d | 30d | month | prev. */
function reportRange(ctx, key) {
  const o = off(ctx);
  const now = ctx.now();
  const today = startOfLocalDay(now, o);
  const month = startOfLocalMonth(now, o);
  const R = {
    '7d': ['7 ngày qua', today - 6 * DAY, today + DAY],
    '30d': ['30 ngày qua', today - 29 * DAY, today + DAY],
    month: ['Tháng này', month, today + DAY],
    prev: ['Tháng trước', startOfLocalMonth(month - 1, o), month],
  };
  const k = Object.hasOwn(R, key) ? key : '30d';
  return { key: k, label: R[k][0], since: R[k][1], until: R[k][2], options: Object.entries(R).map(([k2, v]) => [k2, v[0]]) };
}

/**
 * Hạn giao của tài khoản — đúng như FRESH_SQL (domain/quota.js) dùng khi giao: quá hạn thì hệ thống không giao dù trạng thái "Sẵn sàng".
 * a: hàng accounts kèm reuse, slot_hours, account_days của công cụ. → {at: ms | null, expired}
 */
function accountExpiry(a, now) {
  const ends = [];
  if (a.reuse === 'once') ends.push(a.created_at + a.slot_hours * HOUR);
  if (a.account_days != null) ends.push(a.created_at + a.account_days * DAY);
  const at = ends.length ? Math.min(...ends) : null;
  return { at, expired: at != null && at <= now };
}

/** Mẫu 1 dòng nhập kho theo kiểu đăng nhập (khớp parseAccountLine / addRedeemCodes) — khung mẫu ô "Danh sách" lấy từ cài đặt món thật. */
const LINE_FORMAT = {
  email_code: 'email', password: 'email|mật khẩu', password_totp: 'email|mật khẩu|khoá 2FA',
  team_invite: 'email chủ nhóm|số ghế', redeem: 'mỗi dòng 1 mã hoặc 1 link https',
};
/** Khung mẫu ô "Danh sách" cho đúng 1 món (2 dòng ví dụ). */
const pickFormat = (x) => {
  const f = LINE_FORMAT[x.login_type] || 'email';
  return x.login_type === 'redeem' ? f : `${f}\n${f}${x.login_type === 'team_invite' ? '' : '|số khách (tuỳ chọn)'}`;
};

/** Kho mã / link nhận quà của 1 công cụ loại redeem (vd. Gemini): mỗi khách 1 mã. */
function redeemSection(ctx, csrf, tool) {
  const o = off(ctx);
  const rows = all(ctx.db,
    `SELECT r.*, c.phone, c.id AS customer_id FROM redeem_codes r LEFT JOIN slots s ON s.id = r.slot_id LEFT JOIN customers c ON c.id = s.customer_id
     WHERE r.tool_id = ? ORDER BY r.status = 'ready' DESC, r.id DESC LIMIT 200`, tool.id);
  const left = rows.filter((r) => r.status === 'ready').length;
  return html`${secHead(tool.name, { n: `còn ${left}`, note: 'Mã / link nhận quà — mỗi khách 1 mã', link: [`/admin/tools/${tool.id}`, 'Cài đặt món'] })}
${table(['#', 'Mã / link', 'Trạng thái', 'Giao cho', 'Lúc giao', ''], rows.map((r) => [
  r.id, html`<code>${r.value.length > 60 ? r.value.slice(0, 57) + '…' : r.value}</code>`,
  badge(r.status === 'ready' ? 'Còn' : r.status === 'given' ? 'Đã giao' : 'Đã bỏ', r.status === 'ready' ? 'ok' : r.status === 'given' ? 'info' : ''),
  link.cust(r.customer_id, r.phone), t(r.given_at, o),
  r.status === 'ready' ? postButton(`/admin/redeem/${r.id}/void`, 'Bỏ', csrf, { confirm: 'Bỏ mã này (không giao cho ai)?' }) : '',
]), 'Chưa có mã nào. Dán vào ô "Thêm vào kho" bên dưới, chọn món này.')}`;
}

function todoTasks(ctx) {
  return all(ctx.db,
    `SELECT r.*, a.login_email, a.tool_id, a.status AS account_status, a.created_at AS account_created_at, t.name AS tool_name, t.login_type,
            t.workspace_bot, t.auto_worker, t.reuse, t.slot_hours, t.account_days, t.mail_code, a.max_holders,
            (SELECT c.phone FROM slots s JOIN customers c ON c.id = s.customer_id WHERE s.id = r.slot_id) AS phone,
            (SELECT s.customer_id FROM slots s WHERE s.id = r.slot_id) AS customer_id
     FROM rotation_tasks r JOIN accounts a ON a.id = r.account_id JOIN tools t ON t.id = a.tool_id
     WHERE r.status = 'todo' ORDER BY r.id`);
}

function recentAlerts(ctx, sinceMs, limit = 50) {
  return all(ctx.db,
    `SELECT e.*, c.phone, a.login_email, f.name AS cafe_name FROM events e
     LEFT JOIN customers c ON c.id = e.customer_id LEFT JOIN accounts a ON a.id = e.account_id LEFT JOIN cafes f ON f.id = e.cafe_id
     WHERE e.severity IN ('red', 'yellow') AND e.created_at > ? ORDER BY e.id DESC LIMIT ?`, sinceMs, limit);
}

// ---------- Mảnh giao diện ----------

/** Workspace (Project) của tài khoản dùng chung: chỗ nào ai đang dùng, link bot đã tạo, chỗ giữ cho khách gia hạn. */
function workspacesBlock(ctx, a, csrf) {
  if (a.max_holders <= 1) return '';
  const ws = new Map(all(ctx.db, 'SELECT * FROM workspaces WHERE account_id = ?', a.id).map((w) => [w.seat, w]));
  const holders = new Map(all(ctx.db,
    `SELECT s.seat, s.id, s.expires_at, s.extended_days, c.phone FROM slots s JOIN customers c ON c.id = s.customer_id
     WHERE s.account_id = ? AND s.status IN ('active', 'pending_invite') AND s.seat IS NOT NULL`, a.id).map((r) => [r.seat, r]));
  const kept = new Set(keptSeats(ctx, a.id).map((k) => k.seat));
  const task = get(ctx.db, "SELECT * FROM rotation_tasks WHERE account_id = ? AND kind = 'rotate' AND status = 'todo' ORDER BY id DESC LIMIT 1", a.id);
  const rows = Array.from({ length: a.max_holders }, (_, i) => {
    const seat = i + 1;
    const w = ws.get(seat);
    const h = holders.get(seat);
    return [seat, w?.name || workspaceName(ctx, seat), w?.url ? html`<a href="${w.url}" target="_blank" rel="noopener noreferrer">mở ↗</a>` : html`<span class="muted">chưa có link</span>`,
      h ? html`${link.cust(get(ctx.db, 'SELECT customer_id FROM slots WHERE id = ?', h.id).customer_id, h.phone)} tới ${t(h.expires_at, off(ctx))}${kept.has(seat) ? html` ${badge(`gia hạn ${h.extended_days} ngày — bot giữ Project`, 'ok')}` : ''}` : html`<span class="muted">trống</span>`,
      w ? t(w.updated_at, off(ctx)) : '—'];
  });
  return html`${secHead('Workspace (Project) theo thứ tự', { note: `${a.max_holders} chỗ` })}
${table(['Chỗ', 'Tên', 'Link', 'Khách', 'Bot tạo lúc'], rows)}
${a.workspace_bot ? html`<div class="actions">${task ? html`${badge(`Đang chờ làm mới (${TASK_REASON[task.reason] || task.reason})`, 'yellow')} <a class="go" href="/admin/tasks#task-${task.id}">Mở việc tay ›</a>${task.last_error ? html` <small class="muted">${task.last_error}</small>` : ''}`
    : postButton(`/admin/accounts/${a.id}/reset`, 'Tạo việc làm mới ngay', csrf, { confirm: 'Tạo việc tay: xoá mọi Project + chat (trừ khách gia hạn), đăng xuất mọi thiết bị, tạo lại Project. Khách đang dùng phải chờ hết giờ. Tiếp tục?' })}</div>` : ''}`;
}

/**
 * Tình trạng 1 việc tay (todoTasks) để chủ biết việc nào phải làm / đợi / bỏ — trang Việc tay, Tổng quan và Theo dõi (API live) dùng chung.
 *  bot:  'doing' (bot đang giữ việc) | 'stuck' (bot báo chưa làm được → làm tay) | 'auto' (bot sẽ tự làm) | null (việc của chủ)
 *  busy: số khách thường còn đang dùng tài khoản — đổi mật khẩu / đăng xuất bây giờ sẽ đá họ ra; busyUntil: lúc người cuối hết giờ
 *  drop: 'cancel' (tài khoản đã ngừng dùng) | 'retire' (quá hạn, chưa ngừng) | null — việc đổi mật khẩu thừa, bỏ được
 *  title / howTo: tên việc + cách làm (việc "tạo Project" của tài khoản mới không phải đổi mật khẩu)
 *  canCode: tài khoản đăng nhập bằng mã qua email → nút "Lấy mã đăng nhập"; codeOpen: đang chờ mã cho chủ; code: {value, at} mã vừa về
 *  kept: tên Project phải giữ (khách đã gia hạn)
 */
function taskInfo(ctx, k) {
  const now = ctx.now();
  // Việc làm mới chỉ là của bot khi có bot làm mới đang chạy (rotateBotSeen); chưa có thì là việc của chủ.
  const botTool = k.kind === 'rotate' ? !!k.workspace_bot && !!rotateBotSeen(ctx) : !!k.auto_worker;
  const bot = !botTool ? null : k.lease_until > now ? 'doing' : k.alerted_at ? 'stuck' : 'auto';
  const title = k.kind === 'rotate' && k.reason === 'setup' ? 'Tạo Project' : TASK_KIND[k.kind] || k.kind;
  if (k.kind !== 'rotate') return { bot, title, howTo: null, busy: 0, busyUntil: null, drop: null, canCode: false, codeOpen: false, code: null, kept: [] };
  const prefix = ctx.settings().workspacePrefix || 'Slot';
  const canCode = k.login_type === 'email_code' || !!k.mail_code;
  const howTo = k.reason === 'setup'
    ? `Đăng nhập ${k.login_email}${canCode ? ' (bấm "Lấy mã đăng nhập" — mã hiện ngay ở đây)' : ''}, tạo ${k.max_holders > 1 ? `${k.max_holders} Project "${prefix} 1" … "${prefix} ${k.max_holders}"` : `Project "${prefix} 1"`} rồi bấm Đã xong.`
    : canCode && k.login_type === 'email_code' ? 'Bấm "Lấy mã đăng nhập" để vào tài khoản (mã hiện ngay ở đây), làm mới rồi đăng xuất mọi thiết bị, bấm Đã xong.' : null;
  const codeOpen = canCode && k.code_until >= now;
  const m = canCode && k.code_until ? get(ctx.db,
    "SELECT code, received_at FROM mails WHERE account_id = ? AND verdict = 'owner' AND code IS NOT NULL AND received_at >= ? ORDER BY id DESC LIMIT 1",
    k.account_id, k.code_until - OWNER_CODE_WINDOW) : null;
  const code = m ? { value: m.code, at: m.received_at } : null;
  const kept = keptSeats(ctx, k.account_id).map((x) => workspaceName(ctx, x.seat));
  const busy = blockingHolders(ctx, k.account_id);
  const busyUntil = busy ? get(ctx.db, "SELECT MAX(expires_at) AS t FROM slots WHERE account_id = ? AND status IN ('active', 'pending_invite')", k.account_id).t : null;
  const expired = accountExpiry({ created_at: k.account_created_at, reuse: k.reuse, slot_hours: k.slot_hours, account_days: k.account_days }, now).expired;
  const drop = k.account_status === 'retired' ? 'cancel' : expired ? 'retire' : null;
  return { bot, title, howTo, busy, busyUntil, drop, canCode, codeOpen, code, kept };
}
// Chủ bấm "Lấy mã đăng nhập": mã về hộp thư kho trong 10 phút là của chủ (codes.js onLoginCode).
const OWNER_CODE_WINDOW = 10 * MIN;
const TASK_BOT = { doing: ['Bot đang làm…', 'info'], stuck: ['Bot chưa làm được — bạn làm tay', 'red'], auto: ['Bot sẽ tự làm', 'info'] };
const KEPT_TEXT = (names) => `Không xoá Project: ${names.join(', ')} (khách đã gia hạn) — vì vậy đừng bấm "Delete all chats", xoá từng Project / đoạn chat còn lại.`;
const TASK_DROP = { cancel: 'Bỏ việc (tài khoản đã ngừng dùng)', retire: 'Tài khoản quá hạn — ngừng dùng & bỏ việc' };

function tasksBlock(ctx, list, csrf, back) {
  if (!list.length) return html`<p class="empty">✓ Không có việc tay nào.</p>`;
  const infos = new Map(list.map((k) => [k.id, taskInfo(ctx, k)]));
  const info = (k) => infos.get(k.id);
  return list.map((k) => html`
<div class="task" id="task-${k.id}">
  <div class="task-h">${badge(info(k).title, k.kind === 'rotate' && k.reason !== 'setup' ? 'yellow' : 'info')} <b>${link.tool(k.tool_id, k.tool_name)}</b> ${link.acc(k.account_id, k.login_email)}${info(k).bot ? html` ${badge(...TASK_BOT[info(k).bot])}` : ''}</div>
  <div class="task-m">${TASK_REASON[k.reason] || k.reason} · ${t(k.created_at, off(ctx))}${k.phone ? html` · khách ${link.cust(k.customer_id, k.phone)}` : ''}</div>
  ${k.detail ? html`<p>${k.kind === 'invite_member' ? 'Mời email' : k.kind === 'remove_member' ? 'Gỡ email' : 'Ghi chú'}: <code>${k.detail}</code></p>` : ''}
  ${info(k).howTo ? html`<p class="how">${info(k).howTo}</p>` : ''}
  ${info(k).kept.length ? html`<p>${badge('Giữ lại', 'ok')} ${KEPT_TEXT(info(k).kept)}</p>` : ''}
  ${info(k).canCode ? html`<p class="owner-code">${info(k).code ? html`Mã đăng nhập: <code class="big-code">${info(k).code.value}</code> <small class="muted">về lúc ${t(info(k).code.at, off(ctx))}</small> `
    : info(k).codeOpen ? html`<span class="muted">Đang chờ mã về hộp thư kho… (tải lại trang sau khi bấm gửi mã bên hãng)</span> ` : ''}${postButton(`/admin/tasks/${k.id}/code`, info(k).codeOpen ? 'Chờ thêm 10 phút' : 'Lấy mã đăng nhập', csrf, { cls: 'btn-mini', fields: { back } })}</p>` : ''}
  ${k.last_error ? html`<p class="red-text">Bot báo lỗi (${k.attempts} lần): ${k.last_error}</p>` : ''}
  ${info(k).busy ? html`<p class="warn">Còn <b>${info(k).busy}</b> khách đang dùng tài khoản này (tới ${t(info(k).busyUntil, off(ctx))}) — đổi mật khẩu / đăng xuất bây giờ sẽ đá họ ra. Nên đợi họ hết giờ rồi làm.</p>` : ''}
  ${info(k).drop ? html`<p class="muted">${k.account_status === 'retired' ? 'Tài khoản đã ngừng dùng, không giao nữa — không cần đổi mật khẩu.' : 'Tài khoản đã quá hạn, hệ thống không giao nữa — có thể ngừng dùng và bỏ việc này.'}
    ${postButton(`/admin/tasks/${k.id}/cancel`, TASK_DROP[info(k).drop], csrf, { cls: 'btn-mini', confirm: 'Bỏ việc đổi mật khẩu này?', fields: { back } })}</p>` : ''}
  <form method="post" action="/admin/tasks/${k.id}/done" class="row">
    ${csrfField(csrf)}<input type="hidden" name="back" value="${back}">
    ${k.kind === 'rotate' && (k.login_type === 'password' || k.login_type === 'password_totp') ? html`<input name="newPassword" placeholder="Mật khẩu mới vừa đổi bên hãng" autocomplete="off"${k.login_type === 'password' ? html` required` : ''}>` : ''}
    ${k.kind === 'rotate' && k.login_type === 'password_totp' ? html`<input name="newTotp" placeholder="Khoá 2FA mới (chỉ khi đổi 2FA)" autocomplete="off">` : ''}
    ${k.kind === 'rotate' && k.login_type === 'password_totp' && k.reason !== 'quarantine' ? html`<label class="check muted"><input type="checkbox" name="keepPassword" value="1"> Giữ mật khẩu cũ — chỉ đăng xuất mọi thiết bị</label>` : ''}
    <button class="btn-mini ok">Đã xong</button>
  </form>
</div>`);
}

/** Cảnh báo dạng danh sách (giống trang Theo dõi): lúc · nhãn · khách / tài khoản / quán (đều bấm được) · nên làm gì. */
function alertsList(ctx, rows, empty = 'Không có cảnh báo.') {
  if (!rows.length) return html`<p class="empty">✓ ${empty}</p>`;
  return html`<div class="alerts">${rows.map((e) => html`<div class="alert-item ${e.severity}">
  <span class="at">${t(e.created_at, off(ctx))}</span>
  <div><b>${EVENT_LABEL[e.type] || e.type}</b>${e.customer_id ? html` · ${link.cust(e.customer_id, e.phone)}` : ''}${e.account_id && e.login_email ? html` · ${link.acc(e.account_id, e.login_email)}` : ''}${e.cafe_id && e.cafe_name ? html` · ${link.cafe(e.cafe_id, e.cafe_name)}` : ''}${eventSummary(e.data, e.type) ? html` <span class="muted">— ${eventSummary(e.data, e.type)}</span>` : ''}
    ${ALERT_HINT[e.type] ? html`<div class="hint">→ Nên làm: ${ALERT_HINT[e.type]}</div>` : ''}</div>
</div>`)}</div>`;
}

/** Kho hôm nay: mỗi món 1 ô — đỏ = không giao được nữa, vàng = còn ≤ 3. Bấm → kho của món đó. (Trang Theo dõi vẽ y hệt bằng admin.js.) */
/** Số tài khoản đang chờ việc tay theo món (vd. 8 ChatGPT chờ tạo Project) — "Hết kho" mà có số này thì là chờ bạn, không phải hết hàng. */
function waitingByTool(ctx) {
  return new Map(all(ctx.db,
    `SELECT a.tool_id, COUNT(DISTINCT a.id) AS n, SUM(r.reason = 'setup') AS setup FROM rotation_tasks r JOIN accounts a ON a.id = r.account_id
     WHERE r.status = 'todo' AND r.kind = 'rotate' AND a.status IN ('needs_rotation', 'quarantined') GROUP BY a.tool_id`).map((r) => [r.tool_id, r]));
}
const waitingText = (w) => (w ? `${w.n} tài khoản chờ ${w.setup >= w.n ? 'tạo Project' : 'việc tay'}` : null);

/**
 * Kho riêng từng quán: chỗ còn giao theo kho của mỗi món — chỉ món nào có kho riêng mới có dòng này.
 * → Map(toolId → [["Kho chung", 0], ["O'renchi", 5], …]) — kho trống bỏ đi (chủ thấy "chung 0 · Bamos 17 · O'renchi 28" rối, 08/10).
 * Số là chỗ còn trống trong kho (chưa trừ dự phòng / giới hạn mỗi ngày).
 */
function khoText(ctx) {
  const names = new Map(all(ctx.db, 'SELECT id, name FROM cafes').map((c) => [c.id, c.name]));
  const by = new Map();
  for (const r of poolSeats(ctx)) (by.get(r.tool_id) || by.set(r.tool_id, []).get(r.tool_id)).push(r);
  const out = new Map();
  for (const [toolId, list] of by) {
    if (!list.some((r) => r.cafe_id != null)) continue;
    const shared = list.find((r) => r.cafe_id == null)?.free ?? 0;
    out.set(toolId, [['Kho chung', shared], ...list.filter((r) => r.cafe_id != null).map((r) => [names.get(r.cafe_id) || `quán #${r.cafe_id}`, r.free])]
      .map(([n, f]) => [n, Math.max(0, f)]).filter(([, f]) => f > 0));
  }
  return out;
}

/**
 * Quán đang mở mà khách ở đó không nhận được món (kho riêng của quán + kho chung đã hết) trong khi quán khác vẫn còn.
 * → Map(toolId → [tên quán]). Chưa có kho riêng nào thì mọi quán chung 1 kho → không có gì để báo.
 */
function cafeShortages(ctx, stock) {
  const out = new Map();
  if (!get(ctx.db, "SELECT 1 FROM accounts WHERE cafe_id IS NOT NULL AND status != 'retired' LIMIT 1")) return out;
  const left = new Set(stock.filter((x) => x.free > 0).map((x) => x.tool.id));
  for (const c of all(ctx.db, "SELECT id, name FROM cafes WHERE status = 'active' ORDER BY id")) {
    for (const x of toolAvailability(ctx, null, c.id)) {
      if (left.has(x.tool.id) && x.free <= 0) (out.get(x.tool.id) || out.set(x.tool.id, []).get(x.tool.id)).push(c.name);
    }
  }
  return out;
}

function stockTiles(ctx, stock) {
  if (!stock.length) return html`<p class="empty">Chưa bật món nào — vào <a href="/admin/tools">Công cụ</a> để bật.</p>`;
  const waiting = waitingByTool(ctx);
  const kho = khoText(ctx);
  const short = cafeShortages(ctx, stock);
  return html`<div class="stock-row">${stock.map(({ tool, free, reserved, expiring }) => {
    const wait = waitingText(waiting.get(tool.id));
    const today = toolUsedToday(ctx, tool.id);
    const capHit = tool.daily_cap != null && today >= tool.daily_cap;
    return html`<a class="stock ${free <= 0 ? 'red' : free <= 3 ? 'yellow' : ''}" href="/admin/accounts?tool=${tool.id}">
      <b>${tool.name}</b><span class="big">${free <= 0 ? (capHit ? 'Hết lượt' : 'Hết kho') : free}</span>
      <span class="muted">${free > 0 ? 'lượt còn giao hôm nay · ' : ''}đã giao ${today}${tool.daily_cap != null ? `/${tool.daily_cap}` : ''}${reserved ? ` · +${reserved} dự phòng` : ''}</span>
      ${kho.get(tool.id)?.length ? html`<span class="kho-l">${kho.get(tool.id).map(([n, f]) => html`<i>${n} <b>${f}</b> chỗ</i>`)}</span>` : ''}${short.get(tool.id) ? html`<span class="warn-text">Hết ở quán: ${short.get(tool.id).join(', ')}</span>` : ''}
      ${expiring ? html`<span class="warn-text">${expiring} tài khoản hết hạn trong 24 giờ</span>` : ''}${wait ? html`<span class="warn-text">${wait}</span>` : ''}</a>`;
  })}</div>`;
}

const MAIL_KIND = { login_code: 'Mã đăng nhập', security_alert: 'Cảnh báo bảo mật', password_reset: 'Đặt lại mật khẩu', magic_link: 'Link đăng nhập', new_signin: 'Đăng nhập mới', billing: 'Hoá đơn', other: 'Khác', unknown_recipient: 'Lạ người nhận' };
const MAIL_VERDICT = {
  matched: ['đã giao mã', 'ok'], owner: ['mã của chủ (việc tay)', 'ok'], late: ['về trễ', 'yellow'], replaced: ['thay mã mới', 'ok'], orphan: ['mồ côi', 'red'], orphan_wait: ['chờ người nhận', 'yellow'],
  parse_failed: ['không đọc được mã', 'yellow'], quarantined: ['đã cách ly tài khoản', 'red'], alerted: ['đã báo chủ', 'yellow'], ignored: ['bỏ qua', ''],
};
const mailVerdict = (m) => (m.verdict ? badge(...(MAIL_VERDICT[m.verdict] || [m.verdict, ''])) : '');

/** Ô "nơi xảy ra" của 1 sự kiện: tài khoản / quán, bấm được. */
const eventWhere = (e) => html`${e.account_id && e.login_email ? link.acc(e.account_id, e.login_email) : e.cafe_id && e.cafe_name ? link.cafe(e.cafe_id, e.cafe_name) : ''}${e.slot_id ? html`<span class="sub">slot ${link.slot(e.slot_id)}</span>` : ''}`;

function field(label, input, hint = '', { show = null, hidden = false } = {}) {
  return html`<label class="field"${show ? html` data-show="${show}"` : ''}${hidden ? html` hidden` : ''}><span>${label}</span>${input}${hint ? html`<small>${hint}</small>` : ''}</label>`;
}
const select = (name, options, current) => html`<select name="${name}">${Object.entries(options).map(([v, l]) => html`<option value="${v}"${String(current) === v ? html` selected` : ''}>${l}</option>`)}</select>`;
const checkbox = (name, on) => html`<input type="checkbox" name="${name}" value="1"${on ? html` checked` : ''}>`;

/** Trang sửa / thêm công cụ. Lưu lỗi thì vẽ lại với chữ chủ vừa gõ (flash = lỗi), không bắt gõ lại từ đầu. */
function toolForm(rq, x, { isNew, flash, saved = x } = {}) {
  const { ctx } = rq;
  // saved = bản đang lưu trong máy (đầu trang, số kho); x = chữ trong form (có thể là chữ vừa gõ chưa lưu được).
  const used = isNew ? null : get(ctx.db, "SELECT COUNT(*) AS n FROM slots WHERE tool_id = ? AND status = 'active'", x.id).n;
  const bots = { any: get(ctx.db, "SELECT MAX(updated_at) AS t FROM kv WHERE key LIKE 'worker:%'")?.t || null, rotate: rotateBotSeen(ctx) };
  const stockN = isNew ? null : saved.login_type === 'redeem'
    ? get(ctx.db, "SELECT COUNT(*) AS n FROM redeem_codes WHERE tool_id = ? AND status = 'ready'", saved.id).n
    : get(ctx.db, "SELECT COUNT(*) AS n FROM accounts WHERE tool_id = ? AND status != 'retired'", saved.id).n;
  view(rq, {
    ...(flash ? { flash, flashError: true } : {}),
    title: isNew ? 'Thêm công cụ' : saved.name, active: '/admin/tools', crumbs: [['/admin/tools', 'Công cụ']],
    sub: isNew ? 'Món mới hiện cho khách khi bật và có hàng trong kho' : html`${saved.enabled ? badge('Đang bật', 'ok') : badge('Tắt')} ${LOGIN_TYPE[saved.login_type] || saved.login_type}`,
    actions: isNew ? '' : html`<a class="btn-mini" href="/admin/accounts?tool=${x.id}">Kho: ${stockN} ${saved.login_type === 'redeem' ? 'mã' : 'tài khoản'} ›</a>
      <a class="btn-mini" href="/admin/slots?tool=${x.id}">Đang dùng: ${used} ›</a>${x.voucher_code ? html`<a class="btn-mini" href="/admin/vouchers">Mã phiếu ›</a>` : ''}`,
    body: html`<form method="post" action="/admin/tools/${isNew ? 'new' : x.id}" class="acard grid">${csrfField(rq.state.admin.csrf)}
  <h3>Khách thấy gì</h3>
  ${field('Tên hiển thị', html`<input name="name" value="${x.name || ''}" required>`)}
  ${isNew ? field('Slug', html`<input name="slug" value="${x.slug || ''}" pattern="[a-z0-9-]+" required>`, `Chữ thường, không dấu — đặt rồi KHÔNG đổi được. Có mẫu thư mặc định cho: ${Object.keys(DEFAULT_TOOL_PATTERNS).join(', ')}`)
    : field('Slug', html`<input value="${x.slug}" readonly aria-readonly="true">`, 'Không đổi được: mẫu thư mã của hãng, API kho của QS, mã phiếu và icon đều theo slug này.')}
  ${field('Cách đăng nhập', select('login_type', LOGIN_TYPE, x.login_type), `Mời vào nhóm (Canva): khách nhập email tài khoản của họ; nhập kho mỗi dòng = 1 nhóm: email chủ nhóm|số ghế.${stockN ? ` Kho đang có ${stockN} ${saved.login_type === 'redeem' ? 'mã' : 'tài khoản'} — muốn đổi thì ngừng dùng hết trước.` : ''}`)}
  ${field('Link trang đăng nhập', html`<input name="login_url" value="${x.login_url || ''}" type="url">`)}
  <div class="wide">${field('Hướng dẫn cho khách', html`<textarea name="instructions" rows="4">${x.instructions || ''}</textarea>`, 'Mỗi dòng 1 ý.')}</div>
  <h3>Thư mã từ hãng</h3>
  ${field('Mẫu người gửi thư mã (regex)', html`<input name="sender_pattern" value="${x.sender_pattern === '' ? '-' : x.sender_pattern ?? ''}">`, 'Để trống = dùng mẫu mặc định theo slug. Nhập "-" = không kiểm tra người gửi.')}
  ${field('Regex bóc mã (tuỳ chọn)', html`<input name="code_regex" value="${x.code_regex || ''}">`, 'Có 1 nhóm bắt, ví dụ: code is (\\d{6}). Để trống = tự tìm dãy 6 số.')}
  <h3>Thời gian &amp; lượt</h3>
  ${field('Số giờ dùng', html`<input name="slot_hours" type="number" min="1" value="${x.slot_hours}">`, '24 = 1 ngày, 168 = 7 ngày.')}
  ${field('Số khách / tài khoản (mặc định khi nhập kho)', html`<input name="holders_default" type="number" min="1" value="${x.holders_default ?? 1}">`, 'Vd. ChatGPT 5, CapCut 2, Adobe 2. Dòng nhập kho ghi số khác thì theo dòng đó. Nhiều khách → mỗi khách nhận "Slot 1, 2…".')}
  ${field('Số mã tối đa / máy (mỗi slot)', html`<input name="code_max" type="number" min="1" max="20" value="${x.code_max ?? ''}" placeholder="trống = theo Cài đặt">`, 'Vd. ChatGPT 2 = mỗi khách đăng nhập tối đa 2 lần (2 thiết bị). Chỉ tính mã đã về tới khách: bấm "Lấy mã" mà mã không về thì không mất lượt.')}
  ${field('Hết lượt thì', select('reuse', REUSE, x.reuse || 'rotate'))}
  ${field('Hết lượt lúc (giờ VN)', html`<input name="end_hour" type="number" min="0" max="23" value="${x.end_hour ?? ''}" placeholder="trống = đủ thời gian ở trên">`, 'Vd. 6 = ai nhận lúc nào trong ngày cũng dùng tới 6h sáng hôm sau, 6h bạn đăng xuất mọi thiết bị (ChatGPT, Claude).')}
  ${field('Tài khoản tự hết sau (ngày, kể từ lúc nhập kho)', html`<input name="account_days" type="number" min="1" value="${x.account_days ?? ''}" placeholder="trống = không tự hết">`, 'Vd. 7 cho Claude / CapCut / Adobe dùng thử: quá hạn không giao, khách không được hứa quá ngày tài khoản hết.')}
  ${field('Lượt tối đa / ngày (cả hệ thống)', html`<input name="daily_cap" type="number" min="0" value="${x.daily_cap ?? ''}">`, 'Để trống = không giới hạn (chỉ giới hạn theo kho).')}
  ${field('Chờ bao nhiêu ngày mới nhận lại', html`<input name="cooldown_days" type="number" min="0" value="${x.cooldown_days}">`)}
  ${field('Tối đa số lần / khách', html`<input name="lifetime_cap" type="number" min="1" value="${x.lifetime_cap}">`)}
  ${field('Thứ tự', html`<input name="sort" type="number" value="${x.sort}">`)}
  <h3>Tuỳ chọn</h3>
  <label class="check">${checkbox('rotation_required', x.rotation_required)} Hết hạn thì tạo việc đổi mật khẩu + đăng xuất</label>
  <label class="check">${checkbox('auto_worker', x.auto_worker)} Mời vào nhóm: bot trên máy của Tiệm tự mời / gỡ (scripts/canva-bot.js). Bot chưa làm xong sau vài phút → trang Theo dõi báo bạn làm tay${bots.any ? ` · bot hỏi việc lần cuối ${fmtLocal(bots.any, off(ctx))}` : ' · chưa thấy bot nào chạy'}</label>
  <label class="check">${checkbox('mail_code', x.mail_code)} Loại mật khẩu: hãng hay gửi mã qua email khi đăng nhập (vd. Adobe) → khách có nút "Lấy mã"</label>
  <label class="check">${checkbox('reserve_account', x.reserve_account)} Giữ 1 tài khoản dự phòng: trong ngày không giao; lúc các tài khoản khác chờ "Đăng xuất mọi thiết bị" (6h sáng) thì mới giao — khách sáng sớm không gặp "Tạm hết". Cần ít nhất 2 tài khoản</label>
  <label class="check">${checkbox('voucher_code', x.voucher_code)} Cần mã phiếu khi lấy mã đăng nhập (mã 2FA / mã email): có email tài khoản mà không có mã phiếu (phát ở quán) thì không lấy được mã. Tạo mã ở trang Mã phiếu</label>
  <label class="check">${checkbox('workspace_bot', x.workspace_bot)} Làm mới mỗi ngày giữ chỗ cho khách gia hạn: việc "làm mới" (xoá Project + chat, đăng xuất mọi thiết bị, tạo lại Project "Slot 1…N", tối đa 8) được tạo khi chỉ còn khách đã gia hạn — chủ làm tay ở trang Việc tay, giữ Project của khách gia hạn. Cần ô "Hết lượt lúc".${bots.rotate ? ` Bot làm mới đang chạy (hỏi việc lúc ${fmtLocal(bots.rotate, off(ctx))}).` : ' Chưa có bot làm mới nào chạy → việc này là của bạn.'}</label>
  <label class="check">${checkbox('high_value', x.high_value)} Công cụ giá trị cao (cộng điểm rủi ro giờ cao điểm)</label>
  <label class="check">${checkbox('enabled', x.enabled)} Đang bật</label>
  <button class="btn">Lưu</button></form>`,
  });
}

// ---------- Route ----------

export function registerAdminRoutes(router) {
  router.get('/admin/login', (rq) => {
    if (auth(rq)) return rq.redirect('/admin');
    rq.sendHtml(200, adminPage({
      title: 'Đăng nhập', flash: rq.query.msg,
      body: html`<form method="post" action="/admin/login" class="acard">
        <h2>Đăng nhập quản trị</h2><input type="hidden" name="next" value="${safeNext(rq.query.next)}">
        ${field('Mật khẩu quản trị', html`<input type="password" name="password" autocomplete="current-password" required autofocus>`)}
        ${rq.ctx.config.adminTotpRaw ? field('Mã 2FA (6 số trong app Authenticator)', html`<input name="totp" inputmode="numeric" pattern="[0-9 ]{6,7}" maxlength="7" autocomplete="one-time-code" required>`) : ''}
        <button class="btn">Đăng nhập</button></form>`,
    }));
  });

  router.post('/admin/login', async (rq) => {
    const { ctx } = rq;
    rq.assertSameOrigin();
    const lim = hit(ctx, `adminlogin:${rq.ip}`, 10, 15 * MIN);
    if (!lim.ok) return rq.redirect(`/admin/login?msg=${encodeURIComponent('Sai quá nhiều lần, thử lại sau 15 phút.')}`);
    const f = await rq.form();
    if (!ctx.config.adminPassword || !safeEqual(sha256(f.password || ''), sha256(ctx.config.adminPassword))) {
      logEvent(ctx, { type: 'admin_login_failed', severity: 'yellow', ip: rq.ip });
      return rq.redirect(`/admin/login?msg=${encodeURIComponent('Sai mật khẩu.')}`);
    }
    // 2FA (ADMIN_TOTP): kiểm SAU mật khẩu; mỗi mã chỉ dùng 1 lần (khung 30 giây đã dùng thì không nhận lại — chống nhìn trộm / chép lại).
    if (ctx.config.adminTotpRaw) {
      const step = verifyTotp(ctx.config.adminTotpRaw, f.totp, ctx.now());
      const last = Number(get(ctx.db, "SELECT value FROM kv WHERE key = 'admin_totp_step'")?.value || 0);
      if (step == null || step <= last) {
        logEvent(ctx, { type: 'admin_login_failed', severity: 'yellow', ip: rq.ip, data: { reason: step == null ? 'sai mã 2FA' : 'mã 2FA đã dùng' } });
        return rq.redirect(`/admin/login?msg=${encodeURIComponent(step == null ? 'Sai mã 2FA (xem lại giờ trên điện thoại).' : 'Mã 2FA này vừa dùng rồi — đợi mã mới.')}`);
      }
      run(ctx.db, "INSERT INTO kv(key, value, updated_at) VALUES('admin_totp_step', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at", String(step), ctx.now());
    }
    reset(ctx, `adminlogin:${rq.ip}`);
    const tok = randomToken(24);
    const now = ctx.now();
    run(ctx.db, 'INSERT INTO admin_sessions(id, csrf, created_at, expires_at) VALUES(?, ?, ?, ?)', sha256(tok), randomToken(18), now, now + SESSION_HOURS * HOUR);
    rq.setCookie('adm', tok, { path: '/admin', sameSite: 'Strict', maxAgeSec: SESSION_HOURS * 3600 });
    logEvent(ctx, { type: 'admin_login', ip: rq.ip });
    rq.redirect(safeNext(f.next));
  });

  router.post('/admin/logout', A((rq) => {
    run(rq.ctx.db, 'DELETE FROM admin_sessions WHERE id = ?', sha256(rq.cookies.adm));
    rq.clearCookie('adm', { path: '/admin', sameSite: 'Strict' });
    return go('/admin/login');
  }));

  // ----- Tổng quan -----
  router.get('/admin', P((rq) => {
    const { ctx } = rq;
    const s = statsSince(ctx);
    const csrf = rq.state.admin.csrf;
    const nav = navCounts(ctx);
    const stock = toolAvailability(ctx);
    const tasks = todoTasks(ctx);
    const out = stock.filter((x) => x.free <= 0);
    const short = [...cafeShortages(ctx, stock)].map(([toolId, cafes]) => `${stock.find((x) => x.tool.id === toolId).tool.name} (${cafes.join(', ')})`);
    // "Việc của bạn hôm nay" như app Bot nhắc hạn: mỗi viên = 1 loại việc, bấm sang đúng trang để làm.
    const todo = [
      [nav.alerts, 'báo đỏ trong 2 giờ', '/admin/live', true],
      [nav.tasks, 'việc tay chờ làm', '/admin/tasks', false],
      [nav.extend, 'khách xin gia hạn', '/admin/gia-han', false],
      [nav.canva, 'khách Canva bot chưa mời / gỡ được', '/admin/canva', true],
      [out.length, `món không giao được: ${out.map((x) => x.tool.name).join(', ')}`, '#kho', false],
      [short.length, `món hết ở quán (kho riêng + kho chung): ${short.join('; ')}`, '#kho', false],
      [nav.orphans, 'mã mồ côi trong 24 giờ', '/admin/mails', true],
      [nav.host, 'mục máy chủ đang đỏ (trang, sao lưu, ổ đĩa, bot…)', '/admin/may-chu', true],
    ].filter(([n]) => n > 0);
    view(rq, {
      title: 'Tổng quan', heading: 'Hôm nay', active: '/admin',
      actions: html`<a class="btn-line" href="/admin/live">${icon('pulse')}Mở Theo dõi</a>`,
      body: html`
<div class="acard"><p class="todo-h">${icon('check')}Việc của bạn hôm nay</p>
  ${todo.length ? html`<div class="todo">${todo.map(([n, label, href, red]) => html`<a class="${red ? 'red' : ''}" href="${href}"><b>${n}</b>${label}</a>`)}</div>`
    : html`<p class="all-clear">✓ Không còn việc nào chờ bạn.</p>`}
</div>
<div class="stats">
  ${stat('Lượt vào', s.taps, { icon: 'enter', tone: 'info', sub: `${s.tapDevices} máy khác nhau`, href: '/admin/cafes' })}
  ${stat('Nhận slot', s.claims, { icon: 'key', tone: 'success', href: '/admin/slots' })}
  ${stat('Đang chạy', s.activeNow, { icon: 'play', tone: 'accent', href: '/admin/slots' })}
  ${stat('Giao mã', s.codesDelivered, { icon: 'send', tone: 'plum', href: '/admin/events?type=code_delivered' })}
  ${stat('Mã mồ côi', s.orphans, { icon: 'mail', tone: 'danger', hot: s.orphans > 0, href: '/admin/events?type=code_orphan' })}
  ${stat('Báo đỏ', s.redEvents, { icon: 'alert', tone: 'danger', hot: s.redEvents > 0, href: '/admin/events?sev=red' })}
  ${stat('Việc tay', s.todoTasks, { icon: 'check', tone: 'warning', hot: s.todoTasks > 0, href: '/admin/tasks' })}
</div>
${secHead('Kho hôm nay', { id: 'kho', note: 'còn giao được · bấm để xem tài khoản', link: ['/admin/accounts', 'Mở Kho tài khoản'] })}
${stockTiles(ctx, stock)}
${secHead('Quán', { n: s.perCafe.length, link: ['/admin/cafes', 'Mở Quán'] })}
${table(['Quán', 'Lối vào', 'Suất hôm nay', ''], s.perCafe.map((c) => [
  link.cafe(c.id, c.name), c.qs_slug ? `Trang quán QS: ${c.qs_slug}` : 'Thẻ NFC riêng',
  html`<a href="/admin/slots?cafe=${c.id}">${c.claims}/${c.daily_quota}</a>`,
  html`<a class="go" href="/admin/cafes/${c.id}/report">Thống kê ›</a>`,
]), 'Chưa có quán nào. Vào "Quán" để thêm.')}
${secHead('Việc tay', { n: tasks.length, link: ['/admin/tasks', 'Mở Việc tay'] })}
${tasksBlock(ctx, tasks.slice(0, 3), csrf, '/admin')}
${tasks.length > 3 ? html`<p><a class="go" href="/admin/tasks">Còn ${tasks.length - 3} việc nữa ›</a></p>` : ''}
${secHead('Cảnh báo 24 giờ', { link: ['/admin/events?sev=red', 'Mở Nhật ký'] })}
${alertsList(ctx, recentAlerts(ctx, ctx.now() - DAY, 40), 'Không có cảnh báo trong 24 giờ qua.')}`,
    });
  }));

  // ----- Trực duyệt -----
  router.get('/admin/live', P((rq) => view(rq, {
    title: 'Theo dõi', active: '/admin/live', live: true, sub: 'Tự làm mới mỗi 10 giây · kêu khi có cảnh báo đỏ · mở sẵn trên điện thoại',
    actions: html`<span class="live-dot" data-live-status>Đang tải…</span><button type="button" class="btn-line" data-act="enable-sound">Bật âm báo</button>`,
    body: html`
${secHead('Kho hôm nay', { note: 'còn giao được', link: ['/admin/accounts', 'Mở Kho tài khoản'] })}<div id="live-stock"></div>
${secHead(html`Việc tay<span class="sec-n" data-count="tasks" hidden></span>`, { link: ['/admin/tasks', 'Mở Việc tay'] })}<div id="live-tasks"></div>
${secHead('Cảnh báo 2 giờ qua', { link: ['/admin/events?sev=red', 'Mở Nhật ký'] })}<div id="live-alerts"></div>
<p class="muted">Không có ca nào phải duyệt tay: ca vàng làm theo <a href="/admin/settings">Cài đặt</a>.</p>`,
  })));

  const liveTaskInfo = (ctx, k, o) => {
    const x = taskInfo(ctx, k);
    return { bot: x.bot ? TASK_BOT[x.bot] : null, busy: x.busy, busyUntilText: x.busyUntil ? t(x.busyUntil, o) : null, drop: x.drop ? TASK_DROP[x.drop] : null,
      title: x.title, howTo: x.howTo, kept: x.kept.length ? KEPT_TEXT(x.kept) : null, canCode: x.canCode, codeOpen: x.codeOpen,
      code: x.code ? { value: x.code.value, atText: t(x.code.at, o) } : null, lastError: k.last_error ? `Bot báo lỗi (${k.attempts} lần): ${k.last_error}` : null };
  };
  const liveStock = (ctx) => {
    const stock = toolAvailability(ctx);
    const w = waitingByTool(ctx);
    const kho = khoText(ctx);
    const short = cafeShortages(ctx, stock);
    return stock.map(({ tool, free, reserved, expiring }) => ({ id: tool.id, name: tool.name, today: toolUsedToday(ctx, tool.id), cap: tool.daily_cap, free, reserved, expiring,
      waiting: waitingText(w.get(tool.id)), kho: kho.get(tool.id) || null, short: short.get(tool.id)?.join(', ') || null }));
  };
  router.get('/admin/api/live', J((rq) => {
    const { ctx } = rq;
    const o = off(ctx);
    return {
      ok: true,
      now: ctx.now(),
      // Kho hôm nay: giao bao nhiêu / giới hạn, còn giao được bao nhiêu — chủ thấy sắp hết để nạp hàng / nâng lượt.
      stock: liveStock(ctx),
      tasks: todoTasks(ctx).map((k) => ({ ...liveTaskInfo(ctx, k, o),
        id: k.id, kind: k.kind, kindText: TASK_KIND[k.kind] || k.kind, setup: k.reason === 'setup', tool: k.tool_name, toolId: k.tool_id, email: k.login_email, accountId: k.account_id, detail: k.detail,
        reason: TASK_REASON[k.reason] || k.reason, reasonCode: k.reason, loginType: k.login_type, createdText: t(k.created_at, o), phoneMasked: k.phone ? maskPhone(k.phone) : null,
        customerId: k.customer_id,
      })),
      alerts: recentAlerts(ctx, ctx.now() - 2 * HOUR, 60).map((e) => ({
        id: e.id, severity: e.severity, type: e.type, label: EVENT_LABEL[e.type] || e.type, at: e.created_at, atText: t(e.created_at, o),
        phoneMasked: e.phone ? maskPhone(e.phone) : null, customerId: e.customer_id, account: e.login_email, accountId: e.account_id, cafe: e.cafe_name, cafeId: e.cafe_id,
        summary: eventSummary(e.data, e.type), hint: ALERT_HINT[e.type] || null,
      })),
    };
  }));

  router.post('/admin/api/tasks/:id/done', J(async (rq) => {
    const b = await rq.json();
    return completeTask(rq.ctx, id(rq), { by: BY, newPassword: String(b.newPassword || '').trim() || undefined, keepPassword: b.keepPassword === true,
      newTotp: String(b.newTotp || '').trim() || undefined });
  }));

  // Bỏ việc đổi mật khẩu thừa: chỉ cho tài khoản đã ngừng dùng, hoặc quá hạn (khi đó ngừng dùng luôn). Việc khác phải làm xong.
  const cancelTask = (ctx, taskId) => {
    const k = todoTasks(ctx).find((x) => x.id === taskId);
    if (!k) return { ok: false, message: 'Việc này đã xử lý rồi.' };
    const drop = taskInfo(ctx, k).drop;
    if (!drop) return { ok: false, message: 'Chỉ bỏ được việc đổi mật khẩu của tài khoản đã ngừng dùng hoặc quá hạn.' };
    if (drop === 'retire') updateAccount(ctx, k.account_id, { status: 'retired' }, BY);
    dropRotateTasks(ctx, k.account_id, BY);
    logEvent(ctx, { type: 'task_cancelled', accountId: k.account_id, data: { taskId, by: BY } });
    return { ok: true, message: drop === 'retire' ? 'Đã ngừng dùng tài khoản quá hạn và bỏ việc.' : 'Đã bỏ việc.' };
  };
  router.post('/admin/api/tasks/:id/cancel', J((rq) => cancelTask(rq.ctx, id(rq))));

  // "Lấy mã đăng nhập" cho chủ làm việc tay trên tài khoản đăng nhập bằng mã qua email: 10 phút tới mã về là của chủ
  // (không báo mã mồ côi, không cộng điểm khách cũ). Mã hiện trên thẻ việc (Việc tay / Theo dõi / Tổng quan).
  const openOwnerCode = (ctx, taskId) => {
    const k = todoTasks(ctx).find((x) => x.id === taskId);
    if (!k) return { ok: false, message: 'Việc này đã xử lý rồi.' };
    if (!taskInfo(ctx, k).canCode) return { ok: false, message: 'Tài khoản này không đăng nhập bằng mã qua email.' };
    run(ctx.db, 'UPDATE rotation_tasks SET code_until = ? WHERE id = ?', ctx.now() + OWNER_CODE_WINDOW, taskId);
    logEvent(ctx, { type: 'owner_code_opened', accountId: k.account_id, data: { taskId, by: BY } });
    return { ok: true, message: `Bấm gửi mã bên ${k.tool_name} cho ${k.login_email} — mã về trong 10 phút sẽ hiện ở thẻ việc này.` };
  };
  router.post('/admin/api/tasks/:id/code', J((rq) => openOwnerCode(rq.ctx, id(rq))));
  router.post('/admin/tasks/:id/code', A((rq, f) => {
    const back = ['/admin', '/admin/tasks'].includes(f.back) ? f.back : '/admin/tasks';
    return go(back, openOwnerCode(rq.ctx, id(rq)).message);
  }));
  router.post('/admin/tasks/:id/cancel', A((rq) => go('/admin/tasks', cancelTask(rq.ctx, id(rq)).message)));

  router.post('/admin/tasks/:id/done', A((rq, f) => {
    const r = completeTask(rq.ctx, id(rq), { by: BY, newPassword: f.newPassword?.trim() || undefined, keepPassword: f.keepPassword === '1', newTotp: f.newTotp?.trim() || undefined });
    // Bấm từ dòng Kho tài khoản → về lại đúng danh sách đó.
    return go(/^\/admin\/accounts(\?[^#]*)?$/.test(String(f.back || '')) ? f.back : '/admin/tasks', r.message);
  }));

  // ----- Việc tay -----
  router.get('/admin/tasks', P((rq) => {
    const { ctx } = rq;
    const done = all(ctx.db,
      `SELECT r.*, a.login_email, a.tool_id, t.name AS tool_name FROM rotation_tasks r JOIN accounts a ON a.id = r.account_id JOIN tools t ON t.id = a.tool_id
       WHERE r.status != 'todo' ORDER BY r.id DESC LIMIT 50`);
    const todo = todoTasks(ctx);
    view(rq, {
      title: 'Việc tay', heading: 'Việc tay cần làm', active: '/admin/tasks',
      sub: todo.length ? `${todo.length} việc đang chờ bạn` : 'Không có việc nào đang chờ',
      body: html`<details class="help"><summary>Làm việc tay thế nào?</summary>
<p>Đổi mật khẩu: đổi mật khẩu tài khoản trên trang của hãng, bấm "Đăng xuất khỏi mọi thiết bị" trong cài đặt của hãng, dán mật khẩu mới vào ô rồi bấm <b>Đã xong</b>.
Mời / gỡ nhóm Canva: làm trên Canva rồi bấm Đã xong (bot Canva thường tự làm — xem <a href="/admin/canva">Canva</a>).</p></details>
${tasksBlock(ctx, todo, rq.state.admin.csrf, '/admin/tasks')}
${secHead('Đã xử lý gần đây', { n: done.length })}
${table(['#', 'Việc', 'Tài khoản', 'Chi tiết', 'Trạng thái', 'Lúc', 'Bởi'], done.map((k) => [
  k.id, TASK_KIND[k.kind] || k.kind, html`${link.acc(k.account_id, k.login_email)}<span class="sub">${link.tool(k.tool_id, k.tool_name)}</span>`, k.detail || '',
  k.status === 'done' ? badge('Xong', 'ok') : k.status === 'cancelled' ? badge('Huỷ') : badge(k.status, 'yellow'), t(k.done_at, off(ctx)), k.done_by || '',
]))}`,
    });
  }));

  // ----- Quán -----
  // Quán là dữ liệu NỘI BỘ của Tiệm: tên, mã quán trên QS (nếu quán dùng QS), số suất / ngày, thẻ NFC riêng của Tiệm (nếu có).
  // Không xin chủ quán quyền gì, không đặt màn hình / mã quầy. Khách vào bằng 1 trong 2 lối: khối "Công cụ làm việc" trên trang
  // quán của QS (vé, Tài bật ở /gov), hoặc thẻ NFC riêng của Tiệm trên bàn (/c/<mã thẻ>).
  // Giờ mở cửa: điền cả 2 hoặc trống cả 2 (24 giờ). Bắt đầu = kết thúc → inHourRange luôn sai → quán đóng cả ngày (lỗi cũ).
  const cafeFields = (f) => {
    const open = hourOrNull(f.open_hour);
    const close = hourOrNull(f.close_hour);
    if ((open == null) !== (close == null)) return { error: 'Điền cả giờ bắt đầu và giờ kết thúc, hoặc để trống cả 2 (= mở 24 giờ).' };
    if (open != null && open === close) return { error: `Giờ bắt đầu và kết thúc đều là ${open}h → quán sẽ đóng cả ngày. Muốn mở 24 giờ thì để trống cả 2.` };
    const quota = int(f.daily_quota, 20);
    if (!(quota >= 0 && quota <= 500)) return { error: 'Số suất mới / ngày từ 0 đến 500.' };
    return { open, close, quota };
  };
  // Chữ vừa gõ (form lỗi) → dạng dòng cafes cho cafeForm.
  const typed = (f, base = {}) => ({ ...base, name: f.name ?? base.name, address: f.address ?? base.address, qs_slug: f.qs_slug ?? base.qs_slug,
    daily_quota: f.daily_quota ?? base.daily_quota, open_hour: f.open_hour ?? base.open_hour, close_hour: f.close_hour ?? base.close_hour, status: f.status ?? base.status });

  const cafeForm = (c = {}) => html`
    ${field('Tên quán', html`<input name="name" value="${c.name || ''}"${c.id ? ' required' : ''} placeholder="${c.id ? '' : 'Để trống nếu đã dán link QS'}">`)}
    ${field('Địa chỉ', html`<input name="address" value="${c.address || ''}">`)}
    ${field('Mã quán trên Quite Sensational', html`<input name="qs_slug" value="${c.qs_slug || ''}" placeholder="vd: sakz8 hoặc dán nguyên link trang quán">`, 'Dán nguyên link trang quán trên QS hoặc chỉ phần cuối (quitesensational-review-bio.com/<mã>). Để trống tên quán thì Tiệm tự lấy tên từ trang QS. Để trống nếu quán chưa dùng QS — khi đó dùng thẻ NFC riêng của Tiệm.')}
    ${field('Số suất mới / ngày', html`<input name="daily_quota" type="number" min="0" value="${c.daily_quota ?? 20}">`)}
    ${field('Giờ bắt đầu', html`<input name="open_hour" type="number" min="0" max="23" value="${c.open_hour ?? ''}">`, 'Để trống cả 2 = 24 giờ')}
    ${field('Giờ kết thúc', html`<input name="close_hour" type="number" min="0" max="23" value="${c.close_hour ?? ''}">`)}`;

  // Quán do QS tự thêm (Tài bấm Mở chương trình cho quán chưa có ở Tiệm) → chủ kiểm có phải quán thật không.
  const qsCreated = (ctx) => new Map(all(ctx.db,
    "SELECT cafe_id, MIN(created_at) AS at FROM events WHERE type = 'qs_api_cafe_opened' AND json_extract(data, '$.created') = 1 GROUP BY cafe_id").map((r) => [r.cafe_id, r.at]));
  const qsBadge = (ctx, at) => (at ? html` <span title="Tài mở chương trình trên QS lúc ${fmtLocal(at, off(ctx))}">${badge('QS tự thêm', 'info')}</span>` : '');

  const cafesPage = (rq, { flash, form } = {}) => {
    const { ctx } = rq;
    const fromQs = qsCreated(ctx);
    const dayStart = startOfLocalDay(ctx.now(), ctx.settings().timezoneOffsetMin);
    const cafes = all(ctx.db, `SELECT f.*, (SELECT COUNT(*) FROM cards k WHERE k.cafe_id = f.id AND k.kind = 'nfc') AS cards,
      (SELECT COUNT(*) FROM slots s WHERE s.cafe_id = f.id AND s.created_at >= ? AND ${COUNTED}) AS used_today FROM cafes f ORDER BY f.id`, dayStart);
    const aliasOf = new Map(all(ctx.db, 'SELECT cafe_id, GROUP_CONCAT(shop, \', \') AS s FROM cafe_shops GROUP BY cafe_id').map((r) => [r.cafe_id, r.s]));
    // Quán đang chạy trùng tên 1 quán đang chạy tạo trước nó (QS đổi mã quán) → nhắc gộp.
    const twinOf = (c) => c.status === 'active' && cafeKey(c.name) ? cafes.find((o) => o.id !== c.id && o.status === 'active' && o.created_at < c.created_at && cafeKey(o.name) === cafeKey(c.name)) : null;
    view(rq, {
      ...(flash ? { flash, flashError: true } : {}),
      title: 'Quán & thẻ', heading: 'Quán', active: '/admin/cafes',
      sub: `${cafes.filter((c) => c.status === 'active').length} quán đang chạy · ${cafes.reduce((n, c) => n + c.used_today, 0)} suất đã nhận hôm nay`,
      actions: html`<a class="btn" href="#them">${plus('Thêm quán')}</a>`,
      body: html`<details class="help"><summary>Khách vào quán bằng lối nào?</summary>
<p>Hai lối vào, đều do Tiệm lo (không cần chủ quán làm gì):
  <b>trang quán QS</b> — khách chạm thẻ / quét QR của QS → bấm "${QS_EVENT.items[0].label}" → <code>${ctx.config.baseUrl}/qs/&lt;mã quán QS&gt;</code> kèm vé;
  <b>thẻ NFC riêng của Tiệm</b> trên bàn → <code>${ctx.config.baseUrl}/c/&lt;mã thẻ&gt;</code>.</p></details>
${table(['Quán', 'Lối vào', 'Hôm nay / suất mỗi ngày', 'Giờ', 'Trạng thái', ''], cafes.map((c) => [
  html`${link.cafe(c.id, c.name)}${c.address ? html`<span class="sub">${c.address}</span>` : ''}${qsBadge(ctx, fromQs.get(c.id))}${twinOf(c) ? html` <a href="/admin/cafes/${c.id}#gop">${badge(`Trùng #${twinOf(c).id} — gộp ›`, 'red')}</a>` : ''}`,
  html`${c.qs_slug ? html`Trang quán QS <code>${c.qs_slug}</code>${aliasOf.get(c.id) ? html`<span class="sub">mã cũ: ${aliasOf.get(c.id)}</span>` : ''}` : ''}${c.cards ? html`${c.qs_slug ? html`<br>` : ''}${c.cards} thẻ NFC riêng` : ''}${!c.qs_slug && !c.cards ? html`<span class="muted">chưa có lối vào</span>` : ''}`,
  html`<form method="post" action="/admin/cafes/${c.id}/quota" class="inline">${csrfField(rq.state.admin.csrf)}${c.used_today} /
    <input name="daily_quota" type="number" min="0" value="${c.daily_quota}" class="num-mini" aria-label="Suất mỗi ngày"><button class="btn-mini">Lưu</button></form>`,
  c.open_hour == null || c.close_hour == null ? '24h' : `${c.open_hour}h–${c.close_hour}h`,
  c.status === 'active' ? badge('Đang chạy', 'ok') : badge(c.paused_by === 'qs' ? 'Tạm dừng (QS)' : 'Tạm dừng', 'yellow'),
  html`<a class="go" href="/admin/slots?cafe=${c.id}">Slot ›</a> &nbsp; <a class="go" href="/admin/cafes/${c.id}/report">Thống kê ›</a>`,
]), 'Chưa có quán nào.')}
${secHead('Thêm quán', { id: 'them' })}
<form method="post" action="/admin/cafes" class="acard grid">${csrfField(rq.state.admin.csrf)}${cafeForm(form)}<button class="btn">Thêm quán</button></form>`,
    });
  };
  router.get('/admin/cafes', P((rq) => cafesPage(rq)));

  router.post('/admin/cafes', A(async (rq, f) => {
    const { ctx } = rq;
    const fail = (msg) => { cafesPage(rq, { flash: `Chưa thêm: ${msg}`, form: typed(f) }); return { rendered: true }; };
    const slug = qsSlug(ctx, f.qs_slug);
    if (slug.error) return fail(slug.error);
    const v = cafeFields(f);
    if (v.error) return fail(v.error);
    // Có link QS mà để trống tên / địa chỉ → đọc từ trang quán QS.
    const page = slug.value && (!f.name?.trim() || !f.address?.trim()) ? await qsPageInfo(ctx, slug.value) : null;
    if (slug.value && !f.name?.trim() && !page) return fail(`không mở được trang quán QS "${slug.value}". Kiểm tra lại link, hoặc gõ tên quán.`);
    if (!f.name?.trim() && !page?.name) return fail('cần nhập tên quán.');
    const cid = createCafe(ctx, {
      name: f.name?.trim() || page.name, address: f.address?.trim() || page?.address || null, qsSlug: slug.value,
      dailyQuota: v.quota, openHour: v.open, closeHour: v.close,
    });
    return go(`/admin/cafes/${cid}`, slug.value ? 'Đã thêm quán. Nhắn Tài bật sự kiện cho quán này ở /gov của QS.' : 'Đã thêm quán. Tạo thẻ NFC ở dưới rồi ghi link vào chip.');
  }));

  const cafePage = (rq, c, { flash, form } = {}) => {
    const { ctx } = rq;
    const qsAt = qsCreated(ctx).get(c.id);
    const csrf = rq.state.admin.csrf;
    const day = ctx.now() - DAY;
    const qs = get(ctx.db,
      `SELECT COUNT(*) AS taps, COUNT(DISTINCT device_id) AS devices, MAX(created_at) AS last FROM taps
       WHERE cafe_id = ? AND verdict = 'ok' AND created_at > ?`, c.id, day);
    const bad = all(ctx.db,
      "SELECT json_extract(data, '$.error') AS error, COUNT(*) AS n FROM events WHERE type = 'ticket_rejected' AND cafe_id = ? AND created_at > ? GROUP BY 1", c.id, day);
    const back = `/admin/cafes/${c.id}`;
    const aliases = cafeShopAliases(ctx, c.id);
    // Quán trùng tên (QS đổi mã quán → TBQ bản cũ tạo quán mới): gợi ý gộp vào quán gốc.
    const others = all(ctx.db, 'SELECT id, name, status, qs_slug, created_at FROM cafes WHERE id != ? ORDER BY id', c.id);
    const twin = cafeKey(c.name) ? others.find((o) => o.created_at < c.created_at && o.status === 'active' && cafeKey(o.name) === cafeKey(c.name)) : null;
    const cards = all(ctx.db,
      `SELECT k.*, (SELECT MAX(created_at) FROM taps WHERE card_id = k.id) AS last_tap,
              (SELECT COUNT(*) FROM taps WHERE card_id = k.id AND created_at > ?) AS taps_24h,
              (SELECT COUNT(*) FROM taps WHERE card_id = k.id AND verdict IN ('replay', 'forged') AND created_at > ?) AS bad_24h
       FROM cards k WHERE k.cafe_id = ? AND k.kind = 'nfc' ORDER BY k.id`, day, day, c.id);
    const today = get(ctx.db, `SELECT COUNT(*) AS n FROM slots s WHERE s.cafe_id = ? AND s.created_at >= ? AND ${COUNTED}`, c.id, startOfLocalDay(ctx.now(), off(ctx))).n;
    view(rq, {
      ...(flash ? { flash, flashError: true } : {}),
      title: c.name, active: '/admin/cafes', crumbs: [['/admin/cafes', 'Quán']],
      sub: html`${c.status === 'active' ? badge('Đang chạy', 'ok') : badge(c.paused_by === 'qs' ? 'Tạm dừng (QS)' : 'Tạm dừng', 'yellow')}${qsBadge(ctx, qsAt)} ${c.address || ''}${c.qs_slug ? html` · trang quán QS <code>${c.qs_slug}</code>` : ' · thẻ NFC riêng của Tiệm'}${aliases.length ? html` <span class="muted">(mã cũ: ${aliases.join(', ')})</span>` : ''}`,
      actions: html`<a class="btn-mini" href="/admin/slots?cafe=${c.id}">Slot của quán ›</a><a class="btn-line" href="/admin/cafes/${c.id}/report">${icon('chart')}Thống kê quán</a>`,
      body: html`${twin ? html`<p class="warn">${badge('Có thể trùng', 'red')} Quán này trùng tên với <a href="/admin/cafes/${twin.id}">#${twin.id} ${twin.name}</a>${twin.qs_slug ? html` (mã QS <code>${twin.qs_slug}</code>)` : ''}. Khách vào quán này chỉ thấy kho chung, không thấy kho của quán #${twin.id}. Đúng là 1 quán thì bấm <a href="#gop">Gộp</a> ở cuối trang.</p>` : ''}${qsAt && !get(ctx.db, 'SELECT 1 FROM slots WHERE cafe_id = ? LIMIT 1', c.id) ? html`<p class="warn">${badge('QS tự thêm', 'info')} Quán này do Tài mở chương trình trên QS lúc ${t(qsAt, off(ctx))} (Tiệm chưa có quán này nên tự thêm, ${c.daily_quota} suất / ngày). Kiểm tra đúng quán thật chưa — không phải thì chọn Tạm dừng.</p>` : ''}
<div class="stats">
  ${stat('Hôm nay / suất', `${today}/${c.daily_quota}`, { icon: 'key', tone: 'success', href: `/admin/slots?cafe=${c.id}`, hot: today >= c.daily_quota && c.daily_quota > 0 })}
  ${stat('Lượt vào 24 giờ', qs.taps, { icon: 'enter', tone: 'info', sub: `${qs.devices} máy · lần cuối ${t(qs.last, off(ctx))}` })}
  ${stat('Link bị từ chối 24 giờ', bad.reduce((n, b) => n + b.n, 0), { icon: 'alert', tone: 'danger', hot: bad.length > 0, sub: bad.length ? bad.map((b) => `${TICKET_ERROR[b.error] || b.error} ${b.n}`).join(' · ') : 'không có', href: `/admin/events?type=ticket_rejected&cafe=${c.id}` })}
  ${stat('Thẻ NFC riêng', cards.length, { icon: 'ticket', tone: 'plum', href: '#the' })}
</div>
${c.qs_slug ? '' : html`<p class="warn">Quán chưa dùng QS: khách vào bằng <b>thẻ NFC riêng của Tiệm</b> (tạo thẻ ở dưới). Quán dùng QS thì điền "Mã quán trên Quite Sensational" ở form dưới.</p>`}
<details class="help"${c.qs_slug ? '' : ' hidden'}><summary>Nối với trang quán (Quite Sensational — tính năng của Tài)</summary>
  <p>Khách chạm thẻ / quét QR trên bàn → trang quán trên QS → khối "${QS_EVENT.title}" → bấm "${QS_EVENT.items[0].label}" → sang
    <code class="break">${ctx.config.baseUrl}/qs/${c.qs_slug || '<mã quán>'}</code> kèm vé (nút "${QS_EVENT.items[1].label}" → trang giới thiệu Tiệm).
    Vé chứng minh khách vừa mở trang quán bằng thẻ / QR trên bàn; link trang quán lan trên mạng không có vé nên không nhận được.</p>
  <p>Nhiều "vé sai" → kiểm tra QS_TICKET_KEY (TBQ) có trùng NFC_EVENT_TBQ_KEY (QS) không.
    Bên QS: Tài bấm "Mở" ở cột Sự kiện cho quán này trong /gov. Quán không phải làm gì. Xem docs/phoi-hop-voi-QS.md.</p>
</details>
${secHead('Thông tin quán')}
<form method="post" action="/admin/cafes/${c.id}" class="acard grid">${csrfField(csrf)}
  ${cafeForm(form || c)}
  ${field('Trạng thái', select('status', { active: 'Đang chạy', paused: 'Tạm dừng' }, (form || c).status), c.paused_by === 'qs' ? 'QS đang tạm dừng quán này (Tài bấm Đóng). Chọn Đang chạy = bạn mở lại.' : '')}
  <button class="btn">Lưu</button></form>
${secHead(`Thẻ NFC riêng của Tiệm (${cards.length})`, { id: 'the', link: [`/admin/cafes/${c.id}/cards.csv`, 'Tải CSV tất cả link'] })}
<details class="help"><summary>Ghi link vào chip thế nào?</summary>
<p>Dùng cho quán chưa có QS (quán có QS thì thẻ / QR của QS đã đủ). Ghi link vào chip NTAG213/215/216 bằng app NFC Tools
  hoặc NXP TagWriter (bản ghi URL). <b>Nên bật "UID + counter mirror"</b> và thêm <code>?m=</code> vào cuối link: mỗi lần chạm, chip gửi kèm
  bộ đếm → link bị chụp / chép mang về nhà không dùng lại được. Chưa bật thì ai có link là mở được (chỉ còn giới hạn ${ctx.settings().cardDailyClaims} suất / thẻ / ngày).</p></details>
${table(['Nhãn', 'Link ghi vào chip', 'Bộ đếm', 'Chạm 24h', 'Link cũ / giả 24h', 'Lần cuối', 'Trạng thái', ''], cards.map((k) => [
  k.label || `#${k.id}`, html`<code class="break">${ctx.config.baseUrl}/c/${k.token}</code>`,
  k.last_counter != null ? badge('Đã bật', 'ok') : badge('Chưa thấy', 'yellow'),
  k.taps_24h, k.bad_24h || '', t(k.last_tap, off(ctx)),
  k.status === 'active' ? badge('Hoạt động', 'ok') : badge(`Khoá: ${k.lock_reason || ''}`, 'red'),
  html`${k.status === 'active'
    ? postButton(`/admin/cards/${k.id}/lock`, 'Khoá', csrf, { fields: { back } })
    : postButton(`/admin/cards/${k.id}/unlock`, 'Mở', csrf, { fields: { back } })}
    ${postButton(`/admin/cards/${k.id}/rotate`, 'Đổi link', csrf, { confirm: 'Link cũ sẽ ngừng hoạt động, phải ghi lại chip. Tiếp tục?', fields: { back } })}`,
]), 'Chưa có thẻ.')}
<form method="post" action="/admin/cafes/${c.id}/cards" class="acard grid">${csrfField(csrf)}
  <h3>Tạo thẻ mới</h3>
  ${field('Số thẻ', html`<input name="count" type="number" min="1" max="100" value="10">`)}
  ${field('Tiền tố nhãn', html`<input name="prefix" value="Bàn">`)}
  ${field('Bắt đầu từ số', html`<input name="start" type="number" min="1" value="${cards.length + 1}">`)}
  <button class="btn">Tạo thẻ</button></form>
${others.length ? html`${secHead('Gộp quán trùng', { id: 'gop' })}
<form method="post" action="/admin/cafes/${c.id}/gop" class="acard grid" data-confirm="Gộp ${c.name} vào quán đã chọn? Lượt vào, slot, kho riêng, thẻ và mã QS của quán này chuyển hết sang quán đó; quán này tạm dừng.">${csrfField(csrf)}
  ${field('Gộp quán này vào', select('into', Object.fromEntries(others.map((o) => [o.id, `#${o.id} ${o.name}${o.qs_slug ? ` · QS ${o.qs_slug}` : ''}${o.status === 'active' ? '' : ' · tạm dừng'}`])), twin?.id ?? ''),
    'Dùng khi 1 quán thật bị tách làm 2 (vd. QS đổi mã quán). Mã QS của quán này vẫn dẫn về quán đã chọn, khách thấy đúng kho của quán đó.')}
  <button class="btn">Gộp</button></form>` : ''}`,
    });
  };
  router.get('/admin/cafes/:id', P((rq) => {
    const c = get(rq.ctx.db, 'SELECT * FROM cafes WHERE id = ?', id(rq));
    if (!c) throw new HttpError(404, 'Không có quán này.');
    cafePage(rq, c);
  }));

  router.post('/admin/cafes/:id/quota', A((rq, f) => {
    const q = Math.min(500, Math.max(0, int(f.daily_quota, 20) || 0));
    run(rq.ctx.db, 'UPDATE cafes SET daily_quota = ? WHERE id = ?', q, id(rq));
    logEvent(rq.ctx, { type: 'settings_saved', cafeId: id(rq), data: { daily_quota: q, by: BY } });
    return go('/admin/cafes', `Đã đặt ${q} suất / ngày.`);
  }));

  router.post('/admin/cafes/:id', A((rq, f) => {
    const { ctx } = rq;
    const c = get(ctx.db, 'SELECT * FROM cafes WHERE id = ?', id(rq));
    if (!c) throw new HttpError(404, 'Không có quán này.');
    const fail = (msg) => { cafePage(rq, c, { flash: `Chưa lưu: ${msg}`, form: typed(f, c) }); return { rendered: true }; };
    if (!f.name?.trim()) return fail('cần tên quán.');
    const slug = qsSlug(ctx, f.qs_slug, id(rq));
    if (slug.error) return fail(slug.error);
    const v = cafeFields(f);
    if (v.error) return fail(v.error);
    // Đổi trạng thái thì ghi chủ là người đổi (QS không mở lại quán chủ đã dừng); không đổi thì giữ nguyên.
    const status = f.status === 'paused' ? 'paused' : 'active';
    tx(ctx.db, () => {
      // Đổi mã QS: mã cũ giữ làm mã phụ (link / vé cũ vẫn về quán này). Xoá trống = ngắt hẳn khỏi QS (bỏ cả mã phụ).
      if (slug.value) linkShop(ctx, c, slug.value);
      else run(ctx.db, 'DELETE FROM cafe_shops WHERE cafe_id = ?', c.id);
      run(ctx.db,
        `UPDATE cafes SET name = ?, address = ?, qs_slug = ?, daily_quota = ?, open_hour = ?, close_hour = ?, status = ?,
          paused_by = CASE WHEN status = ? THEN paused_by ELSE ? END WHERE id = ?`,
        f.name.trim(), f.address?.trim() || null, slug.value, v.quota, v.open, v.close, status, status, status === 'paused' ? 'admin' : null, id(rq));
    });
    return go(`/admin/cafes/${id(rq)}`, 'Đã lưu.');
  }));

  router.post('/admin/cafes/:id/gop', A((rq, f) => {
    const r = mergeCafe(rq.ctx, id(rq), Number.parseInt(f.into, 10) || 0, BY);
    if (!r.ok) throw new HttpError(400, r.message);
    const into = Number.parseInt(f.into, 10);
    return go(`/admin/cafes/${into}`, `Đã gộp: ${r.moved.slots} slot, ${r.moved.taps} lượt vào, ${r.moved.accounts} tài khoản kho riêng chuyển sang quán này.`);
  }));

  router.post('/admin/cafes/:id/cards', A((rq, f) => {
    const { ctx } = rq;
    if (!get(ctx.db, 'SELECT 1 FROM cafes WHERE id = ?', id(rq))) throw new HttpError(404, 'Không có quán này.');
    const count = Math.min(100, Math.max(1, int(f.count, 1)));
    const start = Math.max(1, int(f.start, 1));
    const prefix = (f.prefix || 'Bàn').trim();
    tx(ctx.db, () => {
      for (let i = 0; i < count; i++) {
        run(ctx.db, "INSERT INTO cards(cafe_id, token, kind, label, created_at) VALUES(?, ?, 'nfc', ?, ?)", id(rq), randomToken(9), `${prefix} ${start + i}`, ctx.now());
      }
    });
    return go(`/admin/cafes/${id(rq)}`, `Đã tạo ${count} thẻ. Tải CSV rồi ghi từng link vào chip.`);
  }));

  router.get('/admin/cafes/:id/cards.csv', P((rq) => {
    const { ctx } = rq;
    const cards = all(ctx.db, "SELECT * FROM cards WHERE cafe_id = ? AND kind = 'nfc' ORDER BY id", id(rq));
    const csv = csvFile([['Nhãn', 'Link', 'Trạng thái'], ...cards.map((k) => [k.label, `${ctx.config.baseUrl}/c/${k.token}`, k.status])]);
    rq.send(200, csv, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="the-nfc-quan-${id(rq)}.csv"` });
  }));

  const cardBack = (f) => (/^\/admin\/cafes\/\d+$/.test(f.back || '') ? f.back : '/admin/cafes');
  router.post('/admin/cards/:id/lock', A((rq, f) => { lockCard(rq.ctx, id(rq), 'Khoá thủ công', BY); return go(cardBack(f), 'Đã khoá thẻ.'); }));
  router.post('/admin/cards/:id/unlock', A((rq, f) => { unlockCard(rq.ctx, id(rq), BY); return go(cardBack(f), 'Đã mở thẻ.'); }));
  router.post('/admin/cards/:id/rotate', A((rq, f) => {
    run(rq.ctx.db, "UPDATE cards SET token = ?, last_counter = NULL, nfc_uid = NULL, status = 'active', lock_reason = NULL WHERE id = ? AND kind = 'nfc'", randomToken(9), id(rq));
    logEvent(rq.ctx, { type: 'card_rotated', cardId: id(rq), data: { by: BY } });
    return go(cardBack(f), 'Đã đổi link thẻ. Nhớ ghi link mới vào chip.');
  }));

  // ----- Báo cáo theo quán -----
  const dm = (key) => `${key.slice(8, 10)}/${key.slice(5, 7)}`;
  const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '—');

  router.get('/admin/cafes/:id/report', P((rq) => {
    const { ctx } = rq;
    const range = reportRange(ctx, rq.query.range);
    const r = cafeReport(ctx, id(rq), range);
    if (!r) throw new HttpError(404, 'Không có quán này.');
    const maxHour = Math.max(1, ...r.byHour);
    const used = r.byDay.filter((d) => d.trials || d.taps || d.zalo);
    view(rq, {
      title: `Thống kê — ${r.cafe.name}`, heading: `Thống kê: ${r.cafe.name}`, active: '/admin/cafes',
      crumbs: [['/admin/cafes', 'Quán'], [`/admin/cafes/${r.cafe.id}`, r.cafe.name]],
      sub: `${range.label}: ${dm(r.byDay[0].day)} – ${dm(r.byDay.at(-1).day)} · số liệu nội bộ, chỉ có số đếm (không có SĐT / thông tin cá nhân)`,
      actions: html`<a class="btn-mini noprint" href="/admin/cafes/${r.cafe.id}/report.csv?range=${range.key}">Tải CSV theo ngày</a>`,
      body: html`<div class="noprint">${chips(range.options.map(([k, label]) => [`?range=${k}`, label, null, k === range.key]))}</div>
<div class="stats">
  ${stat('Lượt vào', r.taps, { icon: 'enter', tone: 'info' })}${stat('Máy khác nhau', r.tapDevices, { icon: 'grid', tone: 'ink' })}
  ${stat('Lượt dùng thử', r.trials, { icon: 'key', tone: 'success' })}${stat('Khách khác nhau', r.customers, { icon: 'users', tone: 'accent' })}
  ${stat('Khách quay lại', r.returning, { icon: 'users', tone: 'plum', sub: pct(r.returning, r.customers) })}
  ${stat('Bấm "Mua qua Zalo"', r.zaloClicks, { icon: 'bubble', tone: 'info' })}
  ${stat('Ngày hết suất', `${r.fullDays}/${r.byDay.length}`, { icon: 'clock', tone: 'warning', hot: r.fullDays > 0 })}
  ${stat('Báo đỏ tại quán', r.redAlerts, { icon: 'alert', tone: 'danger', hot: r.redAlerts > 0 })}
</div>
${r.fullDays ? html`<p class="warn">Có ${r.fullDays} ngày hết suất (đang để ${r.cafe.daily_quota} suất/ngày) → khách đến sau không nhận được. Cân nhắc tăng "Số suất mới / ngày" ở <a href="/admin/cafes/${r.cafe.id}">trang quán</a> nếu kho còn tài khoản.</p>` : ''}
<p class="muted">Khách quay lại = đã dùng thử ở quán này vào một ngày trước đó. Bấm "Mua qua Zalo" = bấm nút mua sau khi hết lượt (mỗi máy tính 1 lần/ngày), chưa phải đơn đã chốt.</p>
${secHead('Theo công cụ')}
${table(['Công cụ', 'Lượt dùng thử', 'Tỉ lệ'], r.byTool.map((x) => [x.name, x.n, pct(x.n, r.trials)]), 'Chưa có lượt dùng thử.')}
${secHead('Theo giờ trong ngày')}
${r.trials ? table(['Giờ', 'Lượt dùng thử', ''], r.byHour.map((n, h) => [
  `${String(h).padStart(2, '0')}:00–${String(h).padStart(2, '0')}:59`, n, html`<progress class="hbar" max="${maxHour}" value="${n}"></progress>`,
])) : html`<p class="empty">Chưa có lượt dùng thử.</p>`}
${secHead('Theo lối vào')}
${table(['Lối vào', 'Lượt vào', 'Lượt dùng thử', 'Trạng thái'], r.byCard.map((k) => [
  k.kind === 'qs' ? 'Trang quán (QS)' : `Thẻ NFC: ${k.label || '#' + k.id}`, k.taps, k.trials,
  k.status === 'active' ? badge('Hoạt động', 'ok') : badge('Đang khoá', 'red'),
]), 'Chưa có lối vào nào.')}
${secHead('Theo ngày')}
${table(['Ngày', 'Lượt vào', 'Máy', 'Dùng thử', 'Khách', 'Bấm Zalo', ''], used.slice().reverse().map((d) => [
  dm(d.day), d.taps, d.devices, d.trials, d.customers, d.zalo, d.full ? badge('Hết suất', 'yellow') : '',
]), 'Chưa có hoạt động trong khoảng này.')}`,
    });
  }));

  router.get('/admin/cafes/:id/report.csv', P((rq) => {
    const { ctx } = rq;
    const range = reportRange(ctx, rq.query.range);
    const r = cafeReport(ctx, id(rq), range);
    if (!r) throw new HttpError(404, 'Không có quán này.');
    const csv = csvFile([
      ['Ngày', 'Lượt vào', 'Máy', 'Lượt dùng thử', 'Khách', 'Bấm Mua qua Zalo', 'Hết suất'],
      ...r.byDay.map((d) => [d.day, d.taps, d.devices, d.trials, d.customers, d.zalo, d.full ? 'có' : '']),
    ]);
    rq.send(200, csv, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="bao-cao-quan-${r.cafe.id}-${range.key}.csv"` });
  }));


  // ----- Canva: bot mời / gỡ thành viên nhóm -----
  router.get('/admin/canva', P((rq) => {
    const { ctx } = rq;
    const o = off(ctx);
    const now = ctx.now();
    const tools = all(ctx.db, "SELECT * FROM tools WHERE login_type = 'team_invite' ORDER BY sort, id");
    // Bot đang làm 1 việc (vd. mời mất vài phút) không báo về → vẫn tính là đang chạy nếu còn giữ việc (lease).
    const busy = new Set(all(ctx.db, "SELECT DISTINCT worker FROM rotation_tasks WHERE status = 'todo' AND lease_until > ? AND worker IS NOT NULL", now).map((r) => r.worker));
    const bots = all(ctx.db, "SELECT key, value, updated_at FROM kv WHERE key LIKE 'worker:%' ORDER BY updated_at DESC")
      .map((b) => ({ ...b, name: b.key.slice(7) }));
    const teams = all(ctx.db,
      `SELECT a.*, t.name AS tool_name,
        (SELECT COUNT(*) FROM slots s WHERE s.account_id = a.id AND s.status = 'active') AS using_n,
        (SELECT COUNT(*) FROM slots s WHERE s.account_id = a.id AND s.status = 'pending_invite') AS waiting_n
       FROM accounts a JOIN tools t ON t.id = a.tool_id WHERE t.login_type = 'team_invite' AND a.status != 'retired' ORDER BY a.id`);
    // Mỗi khách Canva 1 dòng: slot + việc bot mới nhất của slot đó.
    const rows = all(ctx.db,
      `SELECT s.*, c.phone, a.login_email AS team_email, f.name AS cafe_name,
        r.id AS task_id, r.kind AS task_kind, r.status AS task_status, r.attempts, r.last_error, r.done_by, r.done_at, r.alerted_at
       FROM slots s JOIN tools t ON t.id = s.tool_id JOIN customers c ON c.id = s.customer_id
       LEFT JOIN accounts a ON a.id = s.account_id LEFT JOIN cafes f ON f.id = s.cafe_id
       LEFT JOIN rotation_tasks r ON r.id = (SELECT MAX(id) FROM rotation_tasks WHERE slot_id = s.id AND kind IN ('invite_member', 'remove_member'))
       WHERE t.login_type = 'team_invite' AND s.status != 'rejected' ORDER BY s.id DESC LIMIT 200`);
    const stateOf = (x) => {
      if (x.status === 'pending_invite') return x.alerted_at ? badge('Chờ mời — bot chưa làm được', 'red') : badge('Chờ bot mời', 'info');
      if (x.status === 'active') return badge('Đang dùng', 'ok');
      if (x.task_kind === 'remove_member' && x.task_status === 'todo') return x.alerted_at ? badge('Hết hạn — bot chưa gỡ được', 'red') : badge('Hết hạn — chờ bot gỡ', 'yellow');
      if (x.task_kind === 'remove_member' && x.task_status === 'done') return badge('Đã gỡ khỏi nhóm');
      return badge(SLOT_STATUS[x.status] || x.status);
    };
    const live = (b) => now - b.updated_at < 2 * MIN || busy.has(b.name);
    // Bot tên cũ (đổi máy / đổi tên bot): đã có bot khác liên lạc sau nó hơn 1 giờ, hoặc im hơn 1 ngày → xám "không chạy nữa", không đỏ mãi.
    const replaced = (b) => now - b.updated_at > DAY || bots.some((x) => x !== b && x.updated_at > b.updated_at + HOUR);
    const botState = (b) => (live(b) ? badge(busy.has(b.name) ? 'Đang làm việc' : 'Đang chạy', 'ok') : replaced(b) ? badge('Không chạy nữa') : badge('Tắt / mất kết nối', 'red'));
    const csrf = rq.state.admin.csrf;
    const canvaTool = tools[0];
    view(rq, {
      title: 'Canva', heading: 'Canva — mời vào nhóm', active: '/admin/canva',
      sub: bots.some(live) ? 'Bot Canva đang chạy' : 'Bot Canva đang tắt',
      actions: canvaTool ? html`<a class="btn-mini" href="/admin/accounts?tool=${canvaTool.id}">Nhóm trong kho ›</a><a class="btn-mini" href="/admin/tools/${canvaTool.id}">Cài đặt món ›</a>` : '',
      body: html`${secHead('Bot Canva')}
${bots.length ? table(['Bot', 'Trạng thái', 'Lần cuối liên lạc'], bots.map((b) => [b.name, botState(b), t(b.updated_at, o)]))
    : html`<p class="warn">Chưa có bot nào kết nối. Trên VPS: <code>systemctl status tbq-canva-bot</code> (máy Mac: <code>npm run canva-bot</code>, xem README mục Canva).</p>`}
${secHead('Nhóm Canva', { n: teams.length, note: 'trong Kho tài khoản', link: canvaTool ? [`/admin/accounts?tool=${canvaTool.id}`, 'Mở kho Canva'] : null })}
${tools.length ? '' : html`<p class="warn">Chưa có công cụ kiểu "Mời vào nhóm". Chạy <code>npm run pilot</code> hoặc thêm ở trang <a href="/admin/tools">Công cụ</a>.</p>`}
${table(['Email chủ nhóm', 'Ghế', 'Đang dùng', 'Chờ mời', 'Còn trống', 'Trạng thái'], teams.map((a) => [
  link.acc(a.id, a.login_email), a.max_holders, a.using_n ? html`<a href="/admin/slots?account=${a.id}">${a.using_n}</a>` : 0, a.waiting_n,
  a.status === 'ready' ? Math.max(0, a.max_holders - a.using_n - a.waiting_n) : html`<span class="muted">không giao</span>`,
  badge(ACCOUNT_STATUS[a.status] || a.status, ACCOUNT_TONE[a.status] ?? 'yellow'),
]), 'Chưa nhập nhóm nào. Vào Kho tài khoản → chọn Canva Pro → dán: email chủ nhóm|số ghế.')}
${secHead('Khách Canva', { n: rows.length })}
${table(['#', 'Khách', 'Email Canva của khách', 'Quán', 'Nhóm', 'Trạng thái', 'Mời lúc', 'Hết hạn', 'Bot', ''], rows.map((x) => [
  link.slot(x.id), link.cust(x.customer_id, x.phone),
  html`<code>${x.invite_email || ''}</code>`, link.cafe(x.cafe_id, x.cafe_name), x.account_id ? link.acc(x.account_id, x.team_email) : '', stateOf(x),
  x.status === 'pending_invite' ? html`<span class="muted">chờ từ ${t(x.created_at, o)}</span>` : t(x.started_at, o), x.status === 'pending_invite' ? html`<span class="muted">tính từ lúc mời</span>` : t(x.expires_at, o),
  x.task_id ? html`${x.task_status === 'done' ? `xong (${x.done_by || ''})` : x.task_status === 'cancelled' ? 'đã huỷ' : `${x.attempts} lần thử`}${x.last_error && x.task_status === 'todo' ? html`<br><small class="muted">${x.last_error}</small>` : ''}` : '',
  html`${x.task_id && x.task_status === 'todo' ? html`<form method="post" action="/admin/tasks/${x.task_id}/done" class="inline">${csrfField(csrf)}<input type="hidden" name="back" value="/admin/canva">
    <button class="btn-mini ok" title="Bạn đã tự làm trên Canva">${x.task_kind === 'invite_member' ? 'Đã mời tay' : 'Đã gỡ tay'}</button></form>
    ${x.attempts ? html`<form method="post" action="/admin/canva/tasks/${x.task_id}/retry" class="inline">${csrfField(csrf)}<button class="btn-mini">Cho bot thử lại</button></form>` : ''}` : ''}${x.status === 'pending_invite' ? slotEndButton(ctx, x, csrf, '/admin/canva') : ''}`,
]), 'Chưa có khách nhận Canva.')}
<p class="muted">Bot chỉ nhận email khách và email chủ nhóm. Bot không bao giờ gỡ chủ nhóm / quản trị / giáo viên. Vai trò khi mời: giữ "Học sinh" như Canva đặt sẵn.</p>`,
    });
  }));

  router.post('/admin/canva/tasks/:id/retry', A((rq) => {
    run(rq.ctx.db, "UPDATE rotation_tasks SET attempts = 0, last_error = NULL, alerted_at = NULL, lease_until = NULL WHERE id = ? AND status = 'todo'", id(rq));
    return go('/admin/canva', 'Đã giao lại cho bot.');
  }));

  // ----- Công cụ -----
  router.get('/admin/tools', P((rq) => {
    const { ctx } = rq;
    const tools = all(ctx.db, 'SELECT * FROM tools ORDER BY sort, id');
    const avail = new Map(toolAvailability(ctx).map((x) => [x.tool.id, x]));
    const counts = new Map(all(ctx.db, 'SELECT tool_id, COUNT(*) AS n FROM accounts WHERE status != ? GROUP BY tool_id', 'retired').map((r) => [r.tool_id, r.n]));
    const redeemLeft = new Map(all(ctx.db, "SELECT tool_id, COUNT(*) AS n FROM redeem_codes WHERE status = 'ready' GROUP BY tool_id").map((r) => [r.tool_id, r.n]));
    // Công cụ dùng 1 lần (CapCut Pro dùng thử): tài khoản nhập kho quá thời hạn 1 slot không giao nữa → nói rõ cho chủ biết vì sao "Còn giao được" = 0.
    const stale = new Map(all(ctx.db, `SELECT a.tool_id, COUNT(*) AS n FROM accounts a JOIN tools t ON t.id = a.tool_id
      WHERE t.reuse = 'once' AND a.status = 'ready' AND a.created_at <= ? - t.slot_hours * 3600000 GROUP BY a.tool_id`, ctx.now()).map((r) => [r.tool_id, r.n]));
    const dur = (x) => (x.slot_hours % 24 === 0 ? `${x.slot_hours / 24} ngày` : `${x.slot_hours} giờ`);
    view(rq, {
      title: 'Công cụ', active: '/admin/tools',
      sub: `${tools.filter((x) => x.enabled).length} món đang bật · bấm tên món để sửa, bấm số kho để xem tài khoản`,
      actions: html`<a class="btn" href="/admin/tools/new">${plus('Thêm công cụ')}</a>`,
      body: html`${table(['Món', 'Đăng nhập', 'Thời gian', 'Hôm nay / lượt mỗi ngày', 'Mỗi khách', 'Kho', 'Còn giao được', 'Trạng thái'], tools.map((x) => [
  html`${link.tool(x.id, x.name)}<span class="sub">${x.slug} · thứ tự ${x.sort}</span>`, LOGIN_TYPE[x.login_type] || x.login_type,
  x.end_hour != null ? `tới ${x.end_hour}h sáng` : dur(x),
  html`<form method="post" action="/admin/tools/${x.id}/cap" class="inline">${csrfField(rq.state.admin.csrf)}${toolUsedToday(ctx, x.id)} /
    <input name="daily_cap" type="number" min="0" value="${x.daily_cap ?? ''}" placeholder="∞" class="num-mini" aria-label="Lượt tối đa mỗi ngày"><button class="btn-mini">Lưu</button></form>`,
  html`tối đa ${x.lifetime_cap} lần<span class="sub">chờ ${x.cooldown_days} ngày mới nhận lại</span>`,
  html`<a href="/admin/accounts?tool=${x.id}">${x.login_type === 'redeem' ? `${redeemLeft.get(x.id) || 0} mã` : `${counts.get(x.id) || 0} tài khoản`}</a>${stale.get(x.id) ? html`<span class="sub">${stale.get(x.id)} nhập quá ${dur(x)}, hết Pro — không giao</span>` : ''}`,
  html`${(avail.get(x.id)?.free ?? 0) > 0 ? html`<b>${avail.get(x.id).free}</b>` : x.enabled ? badge('Hết', 'red') : '—'}${avail.get(x.id)?.reserved ? html`<span class="sub">+${avail.get(x.id).reserved} dự phòng cho ${x.end_hour ?? 6}h sáng</span>` : ''}`,
  x.enabled ? badge('Đang bật', 'ok') : badge('Tắt'),
]), 'Chưa có công cụ.')}`,
    });
  }));

  router.get('/admin/tools/:id', P((rq) => {
    const { ctx } = rq;
    const isNew = rq.params.id === 'new';
    const x = isNew ? { slot_hours: 24, cooldown_days: 30, lifetime_cap: 2, rotation_required: 1, enabled: 1, sort: 0, login_type: 'email_code', reuse: 'rotate', holders_default: 1 } : get(ctx.db, 'SELECT * FROM tools WHERE id = ?', id(rq));
    if (!x) throw new HttpError(404, 'Không có công cụ này.');
    toolForm(rq, x, { isNew });
  }));

  // Sửa nhanh "lượt / ngày" ngay trên danh sách (vận hành độc lập: hết lượt giữa ngày phải nâng nhanh, không mở từng trang).
  router.post('/admin/tools/:id/cap', A((rq, f) => {
    const v = String(f.daily_cap ?? '').trim();
    const cap = v === '' ? null : Math.max(0, int(v, 0));
    run(rq.ctx.db, 'UPDATE tools SET daily_cap = ? WHERE id = ?', cap, id(rq));
    logEvent(rq.ctx, { type: 'settings_saved', data: { tool: id(rq), daily_cap: cap, by: BY } });
    return go('/admin/tools', cap == null ? 'Đã bỏ giới hạn lượt / ngày.' : `Đã đặt ${cap} lượt / ngày.`);
  }));

  router.post('/admin/tools/:id', A((rq, f) => {
    const { ctx } = rq;
    const isNew = rq.params.id === 'new';
    const old = isNew ? null : get(ctx.db, 'SELECT * FROM tools WHERE id = ?', id(rq));
    if (!isNew && !old) return go('/admin/tools', 'Không có công cụ này.');
    // Slug cố định sau khi tạo: mẫu thư mã mặc định, API kho QS (/hooks/qs/kho), mã phiếu (vouchers.tools) và icon đều theo slug.
    const slug = isNew ? String(f.slug || '').trim().toLowerCase() : old.slug;
    let sender = String(f.sender_pattern ?? '').trim();
    sender = sender === '' ? null : sender === '-' ? '' : sender;
    const p = {
      slug, name: String(f.name || '').trim(), login_type: LOGIN_TYPE[f.login_type] ? f.login_type : 'email_code', login_url: f.login_url?.trim() || null,
      instructions: f.instructions?.trim() || null, sender_pattern: sender, code_regex: f.code_regex?.trim() || null,
      slot_hours: Math.max(1, int(f.slot_hours, 24)), cooldown_days: Math.max(0, int(f.cooldown_days, 30)), lifetime_cap: Math.max(1, int(f.lifetime_cap, 2)),
      rotation_required: f.rotation_required === '1', high_value: f.high_value === '1', enabled: f.enabled === '1', sort: int(f.sort, 0),
      reuse: f.reuse === 'once' ? 'once' : 'rotate', mail_code: f.mail_code === '1', auto_worker: f.auto_worker === '1', end_hour: hourOrNull(f.end_hour),
      account_days: int(f.account_days) > 0 ? int(f.account_days) : null,
      daily_cap: int(f.daily_cap) == null || Number.isNaN(int(f.daily_cap)) ? null : Math.max(0, int(f.daily_cap)),
      holders_default: Math.min(50, Math.max(1, int(f.holders_default, 1))), reserve_account: f.reserve_account === '1',
      code_max: int(f.code_max) > 0 ? Math.min(20, int(f.code_max)) : null,
      voucher_code: f.voucher_code === '1', workspace_bot: f.workspace_bot === '1',
    };
    if (p.workspace_bot) p.holders_default = Math.min(MAX_WORKSPACES, p.holders_default);
    // Lỗi → vẽ lại form với đúng chữ vừa gõ (trước: về danh sách, mất hết).
    const fail = (msg) => {
      toolForm(rq, { ...old, ...p, sender_pattern: f.sender_pattern ?? '', id: old?.id }, { isNew, flash: `Chưa lưu: ${msg}`, saved: old || undefined });
      return { rendered: true };
    };
    if (!/^[a-z0-9-]+$/.test(slug)) return fail('slug chỉ gồm chữ thường không dấu, số và dấu gạch ngang.');
    if (!p.name) return fail('cần tên hiển thị.');
    if (p.login_url && !/^https:\/\/[^\s]+$/.test(p.login_url)) return fail('link trang đăng nhập phải bắt đầu bằng https://');
    for (const r of [sender, p.code_regex]) {
      if (r) { try { new RegExp(r); } catch { return fail(`regex không hợp lệ: ${r}`); } }
    }
    // Tên và hướng dẫn hiện trên trang khách → cùng luật Google với Quite Sensational (kiểm từng dòng như khách đọc).
    for (const line of [p.name, ...String(p.instructions || '').split(/\r?\n/)]) {
      const problem = freeTextProblem(line);
      if (problem) return fail(`"${String(line).trim().slice(0, 80)}" ${POLICY_MESSAGE[problem]}.`);
    }
    // Đổi cách đăng nhập khi kho còn hàng → tài khoản cũ thiếu mật khẩu / 2FA (khách nhận mật khẩu trống) hoặc thừa.
    if (old && p.login_type !== old.login_type) {
      const n = old.login_type === 'redeem'
        ? get(ctx.db, "SELECT COUNT(*) AS n FROM redeem_codes WHERE tool_id = ? AND status = 'ready'", old.id).n
        : get(ctx.db, "SELECT COUNT(*) AS n FROM accounts WHERE tool_id = ? AND status != 'retired'", old.id).n;
      if (n) return fail(`kho còn ${n} ${old.login_type === 'redeem' ? 'mã' : 'tài khoản'} kiểu "${LOGIN_TYPE[old.login_type]}". Ngừng dùng hết (Kho tài khoản) rồi mới đổi cách đăng nhập, hoặc thêm món mới.`);
    }
    if (p.workspace_bot && p.end_hour == null) return fail('"Làm mới mỗi ngày" cần ô "Hết lượt lúc" (vd. 6) — Project chỉ được giữ cho khách gia hạn khi món hết lượt theo giờ.');
    const codeTool = p.login_type === 'email_code' || p.login_type === 'password_totp' || (p.login_type === 'password' && p.mail_code);
    if (p.voucher_code && !codeTool) return fail('"Cần mã phiếu" chỉ dùng cho món khách bấm Lấy mã (mã qua email, mã 2FA, hoặc mật khẩu + mã qua email).');
    if (p.mail_code && !['password', 'password_totp'].includes(p.login_type)) p.mail_code = false;
    try {
      if (isNew) {
        run(ctx.db, `INSERT INTO tools(slug, name, login_type, login_url, instructions, sender_pattern, code_regex, slot_hours, cooldown_days, lifetime_cap, rotation_required, high_value, enabled, sort, reuse, mail_code, daily_cap, holders_default, auto_worker, end_hour, account_days, reserve_account, voucher_code, workspace_bot, code_max)
          VALUES(:slug, :name, :login_type, :login_url, :instructions, :sender_pattern, :code_regex, :slot_hours, :cooldown_days, :lifetime_cap, :rotation_required, :high_value, :enabled, :sort, :reuse, :mail_code, :daily_cap, :holders_default, :auto_worker, :end_hour, :account_days, :reserve_account, :voucher_code, :workspace_bot, :code_max)`, p);
      } else {
        run(ctx.db, `UPDATE tools SET name = :name, login_type = :login_type, login_url = :login_url, instructions = :instructions,
          sender_pattern = :sender_pattern, code_regex = :code_regex, slot_hours = :slot_hours, cooldown_days = :cooldown_days, lifetime_cap = :lifetime_cap,
          rotation_required = :rotation_required, high_value = :high_value, enabled = :enabled, sort = :sort, reuse = :reuse, mail_code = :mail_code,
          daily_cap = :daily_cap, holders_default = :holders_default, auto_worker = :auto_worker, end_hour = :end_hour, account_days = :account_days,
          reserve_account = :reserve_account, voucher_code = :voucher_code, workspace_bot = :workspace_bot, code_max = :code_max WHERE id = :id`, (({ slug: _, ...rest }) => ({ ...rest, id: old.id }))(p));
      }
    } catch (e) {
      return fail(/UNIQUE/.test(String(e)) ? `slug "${slug}" đã có món khác dùng.` : e.message);
    }
    return go('/admin/tools', `Đã lưu ${p.name}.`);
  }));

  // ----- Kho tài khoản -----
  router.get('/admin/accounts', P((rq) => {
    const { ctx } = rq;
    const csrf = rq.state.admin.csrf;
    const here = rq.path + (rq.url.search || '');
    const o = off(ctx);
    const tools = all(ctx.db, 'SELECT * FROM tools ORDER BY sort, id');
    const toolId = Number(rq.query.tool) || 0;
    // Mặc định ẩn tài khoản "Ngừng dùng" (đã dọn) cho gọn; bấm chip "Ngừng dùng" để xem lại.
    const status = ACCOUNT_STATUS[rq.query.status] ? rq.query.status : '';
    // Kho: '' = mọi kho, 'chung' = kho chung, id quán = kho riêng của quán đó.
    const cafes = all(ctx.db, 'SELECT id, name, status FROM cafes ORDER BY id');
    const multiKho = cafes.length > 0;
    const kho = rq.query.kho === 'chung' || cafes.some((c) => String(c.id) === rq.query.kho) ? rq.query.kho : '';
    const where = [status ? 'a.status = :status' : "a.status != 'retired'"];
    const params = status ? { status } : {};
    if (toolId) { where.push('a.tool_id = :tool'); params.tool = toolId; }
    if (kho === 'chung') where.push('a.cafe_id IS NULL');
    else if (kho) { where.push('a.cafe_id = :kho'); params.kho = Number(kho); }
    const rows = all(ctx.db,
      `SELECT a.*, t.name AS tool_name, t.reuse, t.slot_hours, t.account_days, ${USABLE_SQL} AS usable, k.name AS kho_name
       FROM accounts a JOIN tools t ON t.id = a.tool_id LEFT JOIN cafes k ON k.id = a.cafe_id
       WHERE ${where.join(' AND ')} ORDER BY t.sort, a.status != 'ready', a.id LIMIT 500`, params);
    const khoOf = new Map(all(ctx.db, `SELECT cafe_id, COUNT(*) AS n FROM accounts WHERE status != 'retired' ${toolId ? 'AND tool_id = ?' : ''} GROUP BY cafe_id`, ...(toolId ? [toolId] : [])).map((r) => [r.cafe_id, r.n]));
    const khoOpts = { chung: 'Kho chung — mọi quán', ...Object.fromEntries(cafes.map((c) => [String(c.id), `Kho riêng: ${c.name}`])) };
    const stockOf = new Map(all(ctx.db, "SELECT tool_id, COUNT(*) AS n FROM accounts WHERE status != 'retired' GROUP BY tool_id").map((r) => [r.tool_id, r.n]));
    const codesOf = new Map(all(ctx.db, "SELECT tool_id, SUM(status = 'ready') AS n, COUNT(*) AS total FROM redeem_codes GROUP BY tool_id").map((r) => [r.tool_id, r]));
    const byStatus = new Map(all(ctx.db, `SELECT status, COUNT(*) AS n FROM accounts ${toolId ? 'WHERE tool_id = ?' : ''} GROUP BY status`, ...(toolId ? [toolId] : [])).map((r) => [r.status, r.n]));
    const avail = new Map(toolAvailability(ctx).map((x) => [x.tool.id, x]));
    const taskOf = new Map(all(ctx.db, "SELECT account_id, MIN(id) AS id FROM rotation_tasks WHERE status = 'todo' GROUP BY account_id").map((r) => [r.account_id, r.id]));
    const rotateOf = new Map(all(ctx.db, "SELECT account_id, MIN(id) AS id FROM rotation_tasks WHERE status = 'todo' AND kind = 'rotate' GROUP BY account_id").map((r) => [r.account_id, r.id]));
    const toolById = new Map(tools.map((x) => [x.id, x]));
    const toolCount = (x) => (x.login_type === 'redeem' ? codesOf.get(x.id)?.n || 0 : stockOf.get(x.id) || 0);
    const url = ({ tool = toolId, st = status, k = kho } = {}) => {
      const p = new URLSearchParams();
      if (tool) p.set('tool', tool);
      if (st) p.set('status', st);
      if (k) p.set('kho', k);
      return `/admin/accounts${p.size ? `?${p}` : ''}`;
    };
    const toolOpts = Object.fromEntries(tools.map((x) => [String(x.id), `${x.name} (${LOGIN_TYPE[x.login_type]})`]));
    // Form nhập: chỉ công cụ đang bật, chọn sẵn công cụ đang lọc (dán xong CapCut rồi dán Adobe không bị rơi nhầm vào công cụ đầu danh sách).
    const importOpts = Object.fromEntries(tools.filter((x) => x.enabled).map((x) => [String(x.id), toolOpts[String(x.id)]]));
    const wsTools = tools.filter((x) => x.enabled && x.workspace_bot);
    // Form chỉ hiện ô của món đang chọn (chủ thấy rối 09/10): Canva = email chủ nhóm + số ghế; món khác = ô danh sách với mẫu dòng của đúng món đó.
    // admin.js đổi ô theo món khi chọn lại; không có JS thì form vẽ đúng theo món chọn sẵn.
    const pick = tools.find((x) => x.enabled && String(x.id) === String(rq.query.tool)) || tools.find((x) => x.enabled) || {};
    const team = pick.login_type === 'team_invite';
    const importKinds = Object.fromEntries(tools.filter((x) => x.enabled).map((x) => [x.id, {
      mode: x.login_type === 'team_invite' ? 'team' : 'list', ws: x.workspace_bot ? 1 : 0, fmt: pickFormat(x), seats: x.holders_default ?? 5 }]));
    const labels = all(ctx.db, "SELECT label, COUNT(*) AS n FROM accounts WHERE status != 'retired' AND label IS NOT NULL GROUP BY label ORDER BY label LIMIT 50");
    const accRow = (a) => {
      const load = accountLoad(ctx, a.id);
      const task = taskOf.get(a.id);
      return [
        html`<a href="/admin/accounts/${a.id}">${a.id}</a>`,
        html`${link.acc(a.id, a.login_email)}${a.label ? html`<span class="sub">${a.label}</span>` : ''}`,
        html`${badge(ACCOUNT_STATUS[a.status] || a.status, ACCOUNT_TONE[a.status] ?? 'yellow')}${a.totp_enc ? html` ${badge('2FA', 'info')}` : ''}${a.usable || a.status === 'retired' ? '' : html` ${badge('Thiếu mật khẩu / 2FA — không giao', 'red')}`}${a.status !== 'retired' && accountExpiry(a, ctx.now()).expired ? html` ${badge('Quá hạn — không giao', 'red')}` : ''}${a.status_reason ? html`<span class="sub">${a.status_reason}</span>` : ''}${task ? html`<a class="go" href="/admin/tasks#task-${task}">Làm việc tay ›</a>` : ''}`,
        load ? html`<a href="/admin/slots?account=${a.id}" title="Xem khách đang dùng">${load}/${a.max_holders}</a>` : `0/${a.max_holders}`,
        t(a.last_assigned_at, o), t(a.last_rotated_at, o),
        // Nút ngay trên dòng (chủ 09/10/2026: "không có chỗ bấm") — Sửa mở trang tài khoản; Ngừng dùng / Dùng lại làm luôn, về lại đúng danh sách.
        html`<span class="row-acts">${rotateOf.has(a.id) && a.status === 'needs_rotation' && toolById.get(a.tool_id)?.login_type === 'email_code'
          // Việc tay của tài khoản đăng nhập bằng mã email (ChatGPT / Claude) không cần dán gì → xong ngay trên dòng.
          ? postButton(`/admin/tasks/${rotateOf.get(a.id)}/done`, 'Xong · giao khách', csrf, { cls: 'btn-mini ok', fields: { back: here },
            confirm: `${a.login_email}: đã tạo đủ Project ${ctx.settings().workspacePrefix} 1–${a.max_holders} và đăng xuất mọi thiết bị? Bấm OK là giao cho khách.` })
          : ''}<a class="btn-mini" href="/admin/accounts/${a.id}">Sửa</a>${a.status === 'retired'
          ? postButton(`/admin/accounts/${a.id}/trang-thai`, 'Dùng lại', csrf, { fields: { status: 'ready', back: here }, confirm: `Giao lại ${a.login_email} cho khách?` })
          : postButton(`/admin/accounts/${a.id}/trang-thai`, 'Ngừng dùng', csrf, { cls: 'btn-mini danger', fields: { status: 'retired', back: here },
            confirm: `Ngừng giao ${a.login_email}?${load ? ` ${load} khách đang dùng vẫn dùng tới hết giờ.` : ''}` })}</span>`,
      ];
    };
    // Xem "mọi kho": mỗi món chia bảng theo kho (Kho chung trước, rồi từng quán) — khỏi gắn nhãn kho trên từng dòng.
    const khoGroups = (list) => {
      const by = new Map();
      for (const a of list) by.set(a.cafe_id ?? 0, [...(by.get(a.cafe_id ?? 0) || []), a]);
      return [...by].sort(([x], [y]) => x - y).map(([cid, part]) => [cid ? `Kho ${part[0].kho_name}` : 'Kho chung', part]);
    };
    const groups = new Map();
    for (const a of rows) (groups.get(a.tool_id) || groups.set(a.tool_id, []).get(a.tool_id)).push(a);
    const sections = tools.filter((x) => (toolId ? x.id === toolId : true)).map((x) => {
      if (x.login_type === 'redeem') return !status && (toolId || codesOf.get(x.id)?.n) ? redeemSection(ctx, csrf, x) : '';
      const list = groups.get(x.id) || [];
      if (!list.length && !toolId) return '';
      const av = avail.get(x.id);
      return html`${secHead(x.name, {
        n: list.length,
        // Chủ thấy "còn giao được 15 · kho: chung 0 · Bamos 17 · O'renchi 28" rối (08/10): số theo kho đã nằm ở các ô kho phía trên,
        // ở đây chỉ còn 1 con số — hôm nay còn giao bao nhiêu lượt (đã tính giới hạn mỗi ngày nếu món có).
        note: html`${LOGIN_TYPE[x.login_type] || x.login_type} · hôm nay còn giao <b>${av?.free ?? 0}</b> lượt${x.daily_cap != null ? ` (giới hạn ${x.daily_cap}/ngày, cả hệ thống)` : ''}${av?.reserved ? ` · +${av.reserved} dự phòng` : ''}${x.enabled ? '' : ' · món đang tắt'}`,
        link: [`/admin/tools/${x.id}`, 'Cài đặt món'],
      })}
${(multiKho && !kho && list.length ? khoGroups(list) : [[null, list]]).map(([g, part]) => html`${g ? html`<h3 class="kho-h">${g} <span class="sec-n">${part.length}</span></h3>` : ''}
${table(['#', 'Email / tên đăng nhập', 'Trạng thái', 'Đang dùng', 'Giao lần cuối', 'Đổi MK lần cuối', ''], part.map(accRow),
  status ? 'Không có tài khoản ở trạng thái này.' : 'Kho trống — dán tài khoản ở ô "Thêm vào kho" bên dưới.', { cls: 't-acc' })}`)}`;
    });
    // Món đang bật mà chưa có hàng: gom 1 dòng (không vẽ bảng rỗng), bấm tên → mở ô thêm, chọn sẵn món đó.
    const empty = toolId || status ? [] : tools.filter((x) => x.enabled && !toolCount(x));
    const stale = all(ctx.db, `SELECT a.created_at, t.reuse, t.slot_hours, t.account_days FROM accounts a JOIN tools t ON t.id = a.tool_id
      WHERE a.status = 'ready' ${toolId ? 'AND a.tool_id = ?' : ''}`, ...(toolId ? [toolId] : [])).filter((a) => accountExpiry(a, ctx.now()).expired).length;
    // Ô kho (thay hàng chip "Kho" — chủ thấy rối 08/10): mỗi kho 1 ô — số tài khoản, lượt còn trống theo món, kho này cho ai. Bấm ô để lọc, bấm lại để bỏ lọc.
    const seatsOf = new Map();
    for (const r of poolSeats(ctx)) if (!toolId || r.tool_id === toolId) seatsOf.set(r.cafe_id, [...(seatsOf.get(r.cafe_id) || []), r]);
    const toolName = new Map(tools.map((x) => [x.id, x.name]));
    const khoList = [{ id: null, k: 'chung', name: 'Kho chung', who: 'Mọi quán — lấy khi kho riêng của quán đã hết' },
      ...cafes.filter((c) => c.status === 'active' || khoOf.get(c.id)).map((c) => ({ id: c.id, k: String(c.id), name: `Kho ${c.name}`, who: `Chỉ khách ở ${c.name} — dùng trước kho chung` }))];
    const khoCards = multiKho ? html`<div class="stats kho-cards">${khoList.map((b) => {
      const seats = (seatsOf.get(b.id) || []).filter((r) => r.free > 0);
      const on = kho === b.k;
      return stat(b.name, khoOf.get(b.id) || 0, {
        href: url({ k: on ? '' : b.k }), icon: b.id ? 'cup' : 'box', tone: b.id ? 'accent' : 'info', cls: on ? 'on' : '',
        sub: html`${seats.length ? seats.map((r, i) => html`${i ? html`<br>` : ''}${toolName.get(r.tool_id)}: ${Math.max(0, r.free)} lượt trống`) : 'Trống — chưa giao được gì'}<br><i>${b.who}</i>`,
      });
    })}</div>${kho ? html`<p class="muted kho-filter">Đang xem ${khoList.find((b) => b.k === kho)?.name} — <a href="${url({ k: '' })}">xem mọi kho</a></p>` : ''}` : '';
    view(rq, {
      title: 'Kho tài khoản', active: '/admin/accounts',
      sub: `${byStatus.get('ready') || 0} sẵn sàng · ${byStatus.get('needs_rotation') || 0} chờ đổi mật khẩu${byStatus.get('quarantined') ? ` · ${byStatus.get('quarantined')} cách ly` : ''}${stale ? ` · ${stale} quá hạn (không giao)` : ''}`,
      actions: html`<a class="btn" href="${toolId ? `?tool=${toolId}` : ''}#them">${plus('Thêm vào kho')}</a>`,
      body: html`${chips([[url({ tool: 0 }), 'Mọi món', null, !toolId], ...tools.filter((x) => x.enabled || toolCount(x)).map((x) => [url({ tool: x.id }), x.name, toolCount(x), toolId === x.id])])}
${chips([[url({ st: '' }), 'Đang có', [...byStatus].filter(([k]) => k !== 'retired').reduce((n, [, v]) => n + v, 0), !status],
  ...Object.entries(ACCOUNT_STATUS).map(([k, label]) => [url({ st: k }), label, byStatus.get(k) || 0, status === k])])}
${khoCards}
${sections}
${!rows.length && !toolId && !sections.some(Boolean) ? html`<p class="empty">${status ? 'Không có tài khoản ở trạng thái này.' : 'Kho trống.'}</p>` : ''}
${empty.length ? html`<p class="warn">Chưa có hàng: ${empty.map((x, i) => html`${i ? ', ' : ''}<a href="/admin/accounts?tool=${x.id}#them">${x.name}</a>`)} — khách không nhận được các món này. Bấm tên món để dán thêm.</p>` : ''}
${secHead('Thêm vào kho', { id: 'them', note: pick.login_type === 'team_invite' ? 'nhóm Canva: email chủ nhóm + số ghế' : 'mỗi dòng 1 tài khoản' })}
<form method="post" action="/admin/accounts" class="acard grid" data-import data-tools="${JSON.stringify(importKinds)}">${csrfField(csrf)}
  ${field('Công cụ', select('tool_id', importOpts, String(pick.id ?? '')))}
  ${cafes.length ? field('Kho', select('kho', khoOpts, kho || 'chung'), 'Kho riêng: chỉ khách ở quán đó nhận. Quán dùng kho riêng trước, hết thì lấy kho chung.') : ''}
  ${field('Email chủ nhóm Canva', html`<input name="team_email" type="email" autocomplete="off" placeholder="email bot đang đăng nhập Canva"${team ? '' : html` disabled`}>`,
    'Email tài khoản chủ nhóm (đang đăng nhập trên bot Canva). Nhóm đã có trong kho thì chỉ cập nhật số ghế / kho — đã ngừng thì mở lại.', { show: 'team', hidden: !team })}
  ${field('Số ghế cho khách', html`<input name="seats" type="number" min="1" max="50" value="${pick.login_type === 'team_invite' ? pick.holders_default ?? 5 : 5}"${team ? '' : html` disabled`}>`,
    'Bao nhiêu khách được mời vào nhóm cùng lúc.', { show: 'team', hidden: !team })}
  ${field('Nhãn chung (tuỳ chọn)', html`<input name="label"${team ? html` disabled` : ''}>`, '', { show: 'list', hidden: team })}
  ${wsTools.length ? html`<label class="check" data-show="ws"${pick.workspace_bot ? '' : html` hidden`}>${checkbox('setup', false)} Tôi <b>chưa</b> tạo Project "${ctx.settings().workspacePrefix} 1…N" — chờ tôi tạo rồi mới giao (đã tạo sẵn thì để trống, nhập xong giao luôn)</label>` : ''}
  <div class="wide" data-show="list"${team ? html` hidden` : ''}>${field('Danh sách', html`<textarea name="lines" rows="6" placeholder="${pickFormat(pick)}"${team ? html` disabled` : ''}></textarea>`,
    html`Mỗi dòng 1 tài khoản, các ô cách nhau bằng <code>|</code>. Số cuối dòng = số khách dùng chung (bỏ trống = theo cài đặt của công cụ). Khoá 2FA: chuỗi chữ hoặc link <code>otpauth://</code> — chỉ lưu trên máy chủ, khách chỉ thấy mã 6 số.`)}</div>
  <button class="btn">Thêm vào kho</button></form>
${cafes.length && labels.length ? html`${secHead('Chuyển kho theo nhãn', { id: 'chuyen-kho', note: 'cả nhóm tài khoản cùng nhãn (trừ "Ngừng dùng")' })}
<form method="post" action="/admin/accounts/chuyen-kho" class="acard grid">${csrfField(csrf)}
  ${field('Nhãn', select('label', Object.fromEntries(labels.map((l) => [l.label, `${l.label} (${l.n} tài khoản)`])), ''))}
  ${field('Chuyển sang', select('kho', khoOpts, 'chung'), 'Khách đang dùng vẫn dùng tiếp; lượt giao sau theo kho mới.')}
  <button class="btn">Chuyển kho</button></form>` : ''}`,
    });
  }));

  router.post('/admin/accounts', A((rq, f) => {
    const { ctx } = rq;
    const tool = get(ctx.db, 'SELECT * FROM tools WHERE id = ?', Number(f.tool_id) || 0);
    if (!tool) return go('/admin/accounts', 'Chọn công cụ.');
    const lines = String(f.lines || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const label = f.label?.trim() || null;
    const kho = resolveKho(ctx, f.kho);
    if (!kho.ok) return go(`/admin/accounts?tool=${tool.id}#them`, kho.message);
    if (kho.cafe && tool.login_type === 'redeem') return go(`/admin/accounts?tool=${tool.id}#them`, 'Mã / link nhận quà chỉ có kho chung — chọn "Kho chung".');
    // Form gọn Canva: 1 nhóm = email chủ nhóm + số ghế. Nhóm đã có (kể cả đã ngừng) → cập nhật số ghế / kho và mở lại, không báo "đã có trong kho".
    if (tool.login_type === 'team_invite' && f.team_email !== undefined) {
      const email = String(f.team_email || '').trim().toLowerCase();
      const seats = String(f.seats ?? '').trim();
      const back = `/admin/accounts?tool=${tool.id}`;
      if (!email) return go(`${back}#them`, 'Nhập email chủ nhóm Canva.');
      const had = get(ctx.db, 'SELECT * FROM accounts WHERE login_email = ?', email);
      if (had && had.tool_id !== tool.id) return go(`${back}#them`, `${email} đang là tài khoản của món khác trong kho.`);
      if (had) {
        const r = updateAccount(ctx, had.id, { holders: seats || undefined, cafeId: kho.cafe?.id ?? null, ...(had.status === 'ready' ? {} : { status: 'ready' }) }, BY);
        return go(back, r.ok ? `Nhóm ${email}: ${had.status === 'ready' ? 'đã cập nhật' : 'đã mở lại'} — ${r.account.maxHolders} ghế${kho.cafe ? `, kho riêng ${kho.cafe.name}` : ', kho chung'}.` : `Chưa lưu: ${r.message}`);
      }
      const r = addAccounts(ctx, { tool, items: [parseAccountLine(tool, seats ? `${email}|${seats}` : email)], by: BY, cafeId: kho.cafe?.id ?? null });
      return go(r.added ? back : `${back}#them`, r.added ? `Đã thêm nhóm Canva ${email}${kho.cafe ? ` vào kho riêng ${kho.cafe.name}` : ''}.` : `Chưa thêm: ${r.skipped[0]?.message || 'lỗi'}.`);
    }
    const r = tool.login_type === 'redeem'
      ? addRedeemCodes(ctx, { tool, values: lines, label, by: BY })
      : addAccounts(ctx, { tool, items: lines.map((l) => parseAccountLine(tool, l)), label, setup: f.setup === '1', by: BY, cafeId: kho.cafe?.id ?? null });
    const errors = r.skipped.map((x) => `${x.email}: ${x.message}`);
    const what = tool.login_type === 'redeem' ? 'mã / link' : 'tài khoản';
    return go(`/admin/accounts?tool=${tool.id}${kho.cafe ? `&kho=${kho.cafe.id}` : ''}`,
      `Đã thêm ${r.added} ${what}${kho.cafe ? ` vào kho riêng ${kho.cafe.name}` : ''}.${errors.length ? ' Bỏ qua: ' + errors.slice(0, 5).join('; ') : ''}`);
  }));

  // Chuyển cả nhóm tài khoản cùng nhãn sang kho khác (vd. 10 CapCut nhãn "Bamos" → kho riêng Bamos). Không đụng tài khoản đã ngừng dùng.
  router.post('/admin/accounts/chuyen-kho', A((rq, f) => {
    const { ctx } = rq;
    const label = String(f.label ?? '').trim();
    const kho = resolveKho(ctx, f.kho);
    if (!label) return go('/admin/accounts#chuyen-kho', 'Chọn nhãn.');
    if (!kho.ok) return go('/admin/accounts#chuyen-kho', kho.message);
    const to = kho.cafe?.id ?? null;
    const moved = run(ctx.db, "UPDATE accounts SET cafe_id = ? WHERE label = ? AND status != 'retired' AND cafe_id IS NOT ?", to, label, to).changes;
    const name = kho.cafe ? `kho riêng ${kho.cafe.name}` : 'kho chung';
    if (!moved) return go(`/admin/accounts?kho=${kho.cafe?.id ?? 'chung'}`, `Các tài khoản nhãn "${label}" đã ở ${name}.`);
    logEvent(ctx, { type: 'accounts_kho_moved', cafeId: to, data: { label, moved, kho: kho.cafe ? kho.cafe.name : 'Kho chung', by: BY } });
    return go(`/admin/accounts?kho=${kho.cafe?.id ?? 'chung'}`, `Đã chuyển ${moved} tài khoản nhãn "${label}" sang ${name}.`);
  }));

  router.get('/admin/accounts/:id', P((rq) => {
    const { ctx } = rq;
    const a = get(ctx.db, 'SELECT a.*, t.name AS tool_name, t.login_type, t.workspace_bot, t.reuse, t.slot_hours, t.account_days FROM accounts a JOIN tools t ON t.id = a.tool_id WHERE a.id = ?', id(rq));
    if (!a) throw new HttpError(404, 'Không có tài khoản này.');
    const csrf = rq.state.admin.csrf;
    const o = off(ctx);
    const slots = all(ctx.db, `SELECT s.*, c.phone, f.name AS cafe_name FROM slots s JOIN customers c ON c.id = s.customer_id LEFT JOIN cafes f ON f.id = s.cafe_id
      WHERE s.account_id = ? ORDER BY s.id DESC LIMIT 30`, a.id);
    const mails = all(ctx.db, 'SELECT * FROM mails WHERE account_id = ? ORDER BY id DESC LIMIT 20', a.id);
    const tasks = all(ctx.db, "SELECT * FROM rotation_tasks WHERE account_id = ? AND status = 'todo' ORDER BY id", a.id);
    const load = accountLoad(ctx, a.id);
    const pw = a.login_type === 'password' || a.login_type === 'password_totp';
    const rotate = tasks.find((k) => k.kind === 'rotate');
    // "Chờ đổi mật khẩu" chỉ hiện khi tài khoản đang ở trạng thái đó (hệ thống đặt, kèm việc tay) — không chọn tay được.
    const statusOpts = Object.fromEntries(Object.entries(ACCOUNT_STATUS).filter(([k]) => k !== 'needs_rotation' || a.status === k));
    const exp = accountExpiry(a, ctx.now());
    const cafes = all(ctx.db, 'SELECT id, name FROM cafes ORDER BY id');
    view(rq, {
      title: a.login_email, heading: a.login_email, active: '/admin/accounts',
      crumbs: [['/admin/accounts', 'Kho tài khoản'], [`/admin/accounts?tool=${a.tool_id}`, a.tool_name]],
      sub: html`${badge(ACCOUNT_STATUS[a.status] || a.status, ACCOUNT_TONE[a.status] ?? 'yellow')}${exp.expired && a.status !== 'retired' ? html` ${badge('Quá hạn — không giao', 'red')}` : ''} ${a.status_reason || ''} · ${link.tool(a.tool_id, a.tool_name)} · nhập kho ${t(a.created_at, o)}${exp.at ? ` · ${exp.expired ? 'hết hạn' : 'hết hạn lúc'} ${t(exp.at, o)}` : ''}`,
      actions: html`<a class="btn-mini" href="/admin/slots?account=${a.id}">Đang dùng ${load}/${a.max_holders} ›</a>`,
      body: html`${tasks.map((k) => html`<p class="warn">Đang có việc tay: <b>${TASK_KIND[k.kind] || k.kind}</b> (${TASK_REASON[k.reason] || k.reason}) — <a href="/admin/tasks#task-${k.id}">mở Việc tay ›</a></p>`)}
${secHead('Sửa tài khoản')}
<form method="post" action="/admin/accounts/${a.id}" class="acard grid">${csrfField(csrf)}
  ${field('Nhãn', html`<input name="label" value="${a.label || ''}">`)}
  ${cafes.length ? field('Kho', select('kho', { chung: 'Kho chung — mọi quán', ...Object.fromEntries(cafes.map((c) => [String(c.id), `Kho riêng: ${c.name}`])) }, a.cafe_id ? String(a.cafe_id) : 'chung'),
    'Kho riêng: chỉ khách ở quán đó nhận. Khách đang dùng vẫn dùng tiếp.') : ''}
  ${field('Số người dùng cùng lúc', html`<input name="max_holders" type="number" min="1" max="${a.workspace_bot ? MAX_WORKSPACES : 50}" value="${a.max_holders}">`, a.workspace_bot ? `Tối đa ${MAX_WORKSPACES} Project (workspace).` : 'Từ 1 đến 50.')}
  ${field('Trạng thái', select('status', statusOpts, a.status), rotate
    ? (pw ? 'Đang có việc tay: dán mật khẩu mới vừa đổi bên hãng rồi Lưu (hoặc bấm "Đã xong" ở Việc tay) — xong việc thì tự về Sẵn sàng.' : 'Đang có việc tay: làm xong rồi chọn "Sẵn sàng" (hoặc bấm "Đã xong" ở Việc tay).')
    : 'Cách ly = thu hồi ngay khách đang dùng + tạo việc đổi mật khẩu. Ngừng dùng = không giao nữa, khách đang dùng vẫn dùng tới hết giờ.')}
  ${pw ? field('Mật khẩu mới', html`<input name="password" autocomplete="off" placeholder="Để trống = giữ nguyên">`) : ''}
  ${a.login_type === 'password_totp' ? field('Khoá 2FA mới', html`<input name="totp" autocomplete="off" placeholder="${a.totp_enc ? 'Đã có — để trống = giữ nguyên' : 'Chưa có khoá 2FA!'}">`, 'Khi đổi 2FA trên trang của hãng, dán khoá mới vào đây.') : ''}
  ${rotate && a.login_type === 'password_totp' && rotate.reason !== 'quarantine' ? html`<label class="check">${checkbox('keepPassword', false)} Giữ mật khẩu cũ — chỉ đăng xuất mọi thiết bị (khi chọn "Sẵn sàng")</label>` : ''}
  <button class="btn">Lưu</button></form>
${a.status !== 'quarantined' ? html`<div class="actions">${postButton(`/admin/accounts/${a.id}/quarantine`, 'Cách ly ngay (thu hồi slot đang chạy)', csrf, { cls: 'btn-mini danger', confirm: 'Cách ly tài khoản và thu hồi mọi slot đang chạy?' })}</div>` : ''}
${workspacesBlock(ctx, a, csrf)}
${secHead('Lịch sử giao', { n: slots.length, link: [`/admin/slots?account=${a.id}`, 'Xem ở trang Slot'] })}
${table(['Slot', 'Chỗ', 'Khách', 'Quán', 'Trạng thái', 'Bắt đầu', 'Kết thúc'], slots.map((s) => [
  link.slot(s.id), s.seat ? `Slot ${s.seat}` : '', link.cust(s.customer_id, s.phone), link.cafe(s.cafe_id, s.cafe_name),
  html`${badge(SLOT_STATUS[s.status] || s.status, SLOT_TONE[s.status] ?? '')}${s.end_reason ? html`<span class="sub">${END_REASON[s.end_reason] || s.end_reason}</span>` : ''}`,
  t(s.started_at, o), t(s.ended_at, o),
]), 'Chưa giao cho ai.')}
${secHead('Thư gần đây', { n: mails.length, link: ['/admin/mails', 'Mở Thư'] })}
${table(['Lúc', 'Tiêu đề', 'Loại', 'Kết quả'], mails.map((m) => [t(m.received_at, o), html`<a href="/admin/mails/${m.id}">${m.subject || '(không tiêu đề)'}</a>`, MAIL_KIND[m.kind] || m.kind, mailVerdict(m)]), 'Chưa có thư nào về tài khoản này.')}`,
    });
  }));

  // Đi chung đường với API kho (updateAccount): Cách ly = thu hồi khách + tạo việc đổi mật khẩu; về Sẵn sàng khi đang có việc tay
  // = làm xong việc đó (cùng luật nút "Đã xong": loại mật khẩu phải dán mật khẩu mới); dán mật khẩu mới lúc đang chờ đổi = xong việc.
  // Trước đây form ghi thẳng trạng thái → cách ly mà khách vẫn dùng, "Chờ đổi mật khẩu" không có việc tay (kẹt), mở lại bằng mật khẩu cũ.
  router.post('/admin/accounts/:id', A((rq, f) => {
    const { ctx } = rq;
    const a = get(ctx.db, 'SELECT * FROM accounts WHERE id = ?', id(rq));
    if (!a) return go('/admin/accounts', 'Không có tài khoản này.');
    const patch = { label: f.label ?? '', holders: String(f.max_holders ?? '').trim() || undefined, password: f.password, totp: f.totp, keepPassword: f.keepPassword === '1' };
    if (f.kho !== undefined) {
      const kho = resolveKho(ctx, f.kho);
      if (!kho.ok) return go(`/admin/accounts/${a.id}`, `Chưa lưu: ${kho.message}`);
      patch.cafeId = kho.cafe?.id ?? null;
    }
    // Chỉ gửi trạng thái khi chủ đổi; "Chờ đổi mật khẩu" do hệ thống đặt (kèm việc tay) → dùng nút "Tạo việc làm mới" / "Cách ly".
    if (f.status && f.status !== a.status && ['ready', 'retired', 'quarantined'].includes(f.status)) patch.status = f.status;
    const r = updateAccount(ctx, a.id, patch, BY);
    return go(`/admin/accounts/${a.id}`, r.ok ? r.message : `Chưa lưu: ${r.message}`);
  }));

  // Nút trên dòng Kho tài khoản: Ngừng dùng / Dùng lại (cùng đường với ô Trạng thái ở trang tài khoản), về lại đúng danh sách đang xem.
  router.post('/admin/accounts/:id/trang-thai', A((rq, f) => {
    const back = /^\/admin\/accounts(\?[^#]*)?$/.test(String(f.back || '')) ? f.back : '/admin/accounts';
    if (!['ready', 'retired'].includes(f.status)) return go(back, 'Trạng thái không hợp lệ.');
    const a = get(rq.ctx.db, 'SELECT id, login_email, status FROM accounts WHERE id = ?', id(rq));
    if (!a) return go(back, 'Không có tài khoản này.');
    if (a.status === f.status) return go(back, `${a.login_email} đã ở trạng thái này.`);
    const r = updateAccount(rq.ctx, a.id, { status: f.status }, BY);
    return go(back, r.ok ? `${a.login_email}: ${f.status === 'retired' ? 'đã ngừng dùng' : 'giao lại cho khách'}.` : `Chưa lưu: ${r.message}`);
  }));

  // Tạo việc làm mới tài khoản ngay (vd. nghi khách cũ còn vào được). Còn khách thường đang dùng thì bot chờ họ hết giờ.
  router.post('/admin/accounts/:id/reset', A((rq) => {
    const { ctx } = rq;
    const a = get(ctx.db, 'SELECT a.*, t.workspace_bot FROM accounts a JOIN tools t ON t.id = a.tool_id WHERE a.id = ?', id(rq));
    if (!a?.workspace_bot) return go(`/admin/accounts/${id(rq)}`, 'Công cụ này không bật làm mới mỗi ngày.');
    if (get(ctx.db, "SELECT 1 FROM rotation_tasks WHERE account_id = ? AND kind = 'rotate' AND status = 'todo'", a.id)) return go(`/admin/accounts/${a.id}`, 'Đã có việc làm mới đang chờ.');
    tx(ctx.db, () => {
      run(ctx.db, "UPDATE accounts SET status = 'needs_rotation', status_reason = 'Chủ tạo việc làm mới' WHERE id = ? AND status = 'ready'", a.id);
      createTask(ctx, { accountId: a.id, slotId: null, kind: 'rotate', reason: 'manual', detail: null });
    });
    const busy = blockingHolders(ctx, a.id);
    return go(`/admin/accounts/${a.id}`, busy ? `Đã tạo việc. Còn ${busy} khách đang dùng — làm sau khi họ hết giờ.` : 'Đã tạo việc làm mới ở trang Việc tay.');
  }));

  router.post('/admin/redeem/:id/void', A((rq) => {
    const r = run(rq.ctx.db, "UPDATE redeem_codes SET status = 'void' WHERE id = ? AND status = 'ready'", id(rq));
    const c = get(rq.ctx.db, 'SELECT tool_id FROM redeem_codes WHERE id = ?', id(rq));
    return go(`/admin/accounts${c ? `?tool=${c.tool_id}` : ''}`, r.changes ? 'Đã bỏ mã này.' : 'Mã đã giao hoặc đã bỏ trước đó.');
  }));

  router.post('/admin/accounts/:id/quarantine', A((rq) => {
    const r = quarantineAccount(rq.ctx, id(rq), `Cách ly thủ công bởi ${BY}`);
    return go(`/admin/accounts/${id(rq)}`, `Đã cách ly, thu hồi ${r.revokedSlots} slot.`);
  }));

  // ----- Khách -----
  const custName = (c) => (c.phone.startsWith('del:') ? `(đã xoá dữ liệu) #${c.id}` : displayPhone(c.phone));
  router.get('/admin/customers', P((rq) => {
    const { ctx } = rq;
    const q = String(rq.query.q || '').trim();
    let rows;
    if (q) {
      const p = normalizePhone(q) || normalizeEmail(q);
      const digits = q.replace(/\D/g, '');
      rows = p ? all(ctx.db, 'SELECT * FROM customers WHERE phone = ?', p)
        : q.includes('@') || /[a-z]/i.test(q) ? all(ctx.db, "SELECT * FROM customers WHERE phone LIKE ? ESCAPE '\\' ORDER BY id DESC LIMIT 100", `%${q.toLowerCase().replace(/[\\%_]/g, '\\$&')}%`)
        : digits.length >= 3 ? all(ctx.db, 'SELECT * FROM customers WHERE phone LIKE ? ORDER BY id DESC LIMIT 100', `%${digits}`)
          : [];
    } else if (rq.query.f === 'locked') {
      rows = all(ctx.db, "SELECT * FROM customers WHERE status = 'locked' ORDER BY id DESC LIMIT 200");
    } else if (rq.query.f === 'live') {
      rows = all(ctx.db, "SELECT * FROM customers WHERE id IN (SELECT customer_id FROM slots WHERE status IN ('active', 'pending_invite')) ORDER BY id DESC LIMIT 200");
    } else {
      rows = all(ctx.db, 'SELECT * FROM customers ORDER BY id DESC LIMIT 50');
    }
    const fl = q ? '' : ['locked', 'live'].includes(rq.query.f) ? rq.query.f : '';
    const nLocked = get(ctx.db, "SELECT COUNT(*) AS n FROM customers WHERE status = 'locked'").n;
    const nLive = get(ctx.db, "SELECT COUNT(DISTINCT customer_id) AS n FROM slots WHERE status IN ('active', 'pending_invite')").n;
    const live = new Map(all(ctx.db, "SELECT customer_id, COUNT(*) AS n FROM slots WHERE status = 'active' GROUP BY customer_id").map((r) => [r.customer_id, r.n]));
    view(rq, {
      title: 'Khách', active: '/admin/customers',
      sub: q ? `Tìm "${q}": ${rows.length} khách` : fl ? `${rows.length} khách ${fl === 'locked' ? 'đang khoá' : 'đang dùng'}` : `${get(ctx.db, 'SELECT COUNT(*) AS n FROM customers').n} khách · đang xem 50 khách mới nhất`,
      body: html`${q ? '' : chips([['/admin/customers', 'Mới nhất', null, !fl], ['/admin/customers?f=live', 'Đang dùng', nLive, fl === 'live'], ['/admin/customers?f=locked', 'Đang khoá', nLocked, fl === 'locked']])}
<form method="get" class="row tight"><input name="q" value="${q}" placeholder="Email, SĐT hoặc 3 số cuối" aria-label="Tìm khách"><button class="btn-mini">Tìm</button>${q ? html`<a class="go" href="/admin/customers">Bỏ tìm</a>` : ''}</form>
${table(['#', 'Email / SĐT', 'Trạng thái', 'Đang dùng', 'Vi phạm', 'Điểm rủi ro', 'Tham gia'], rows.map((c) => [
  html`<a href="/admin/customers/${c.id}">${c.id}</a>`, html`<a href="/admin/customers/${c.id}">${custName(c)}</a>`,
  c.status === 'locked' ? badge(c.locked_until ? `Khoá đến ${t(c.locked_until, off(ctx))}` : 'Khoá vĩnh viễn', 'red') : badge('Bình thường', 'ok'),
  live.get(c.id) ? html`<a href="/admin/slots?customer=${c.id}">${live.get(c.id)} slot</a>` : '—',
  c.strikes || '—', customerRisk(ctx, c), t(c.created_at, off(ctx)),
]), q ? 'Không tìm thấy.' : 'Chưa có khách.')}`,
    });
  }));

  router.get('/admin/customers/:id', P((rq) => {
    const { ctx } = rq;
    const c = get(ctx.db, 'SELECT * FROM customers WHERE id = ?', id(rq));
    if (!c) throw new HttpError(404, 'Không có khách này.');
    const csrf = rq.state.admin.csrf;
    const back = `/admin/customers/${c.id}`;
    const slots = all(ctx.db,
      `SELECT s.*, t.name AS tool_name, a.login_email, f.name AS cafe_name, k.label AS card_label FROM slots s
       JOIN tools t ON t.id = s.tool_id LEFT JOIN accounts a ON a.id = s.account_id LEFT JOIN cafes f ON f.id = s.cafe_id LEFT JOIN cards k ON k.id = s.card_id
       WHERE s.customer_id = ? ORDER BY s.id DESC LIMIT 50`, c.id);
    const devices = all(ctx.db,
      `SELECT d.*, dc.first_seen_at, (SELECT COUNT(*) FROM device_customers x WHERE x.device_id = d.id AND x.customer_id != ?) AS others
       FROM device_customers dc JOIN devices d ON d.id = dc.device_id WHERE dc.customer_id = ? ORDER BY dc.first_seen_at DESC`, c.id, c.id);
    const events = all(ctx.db, `SELECT e.*, a.login_email, f.name AS cafe_name FROM events e LEFT JOIN accounts a ON a.id = e.account_id LEFT JOIN cafes f ON f.id = e.cafe_id
      WHERE e.customer_id = ? ORDER BY e.id DESC LIMIT 100`, c.id);
    view(rq, {
      title: custName(c), heading: custName(c), active: '/admin/customers',
      crumbs: [['/admin/customers', 'Khách']],
      sub: html`${c.status === 'locked' ? badge(`Khoá ${c.locked_until ? 'đến ' + t(c.locked_until, off(ctx)) : 'vĩnh viễn'}: ${c.lock_reason || ''}`, 'red') : badge('Bình thường', 'ok')}
  · Vi phạm: ${c.strikes} · Điểm rủi ro: ${customerRisk(ctx, c)} · Đồng ý điều khoản ${c.consent_version} lúc ${t(c.consent_at, off(ctx))}`,
      actions: html`<a class="btn-mini" href="/admin/slots?customer=${c.id}">Slot của khách ›</a><a class="btn-mini" href="/admin/gia-han?customer=${c.id}">Gia hạn ›</a>`,
      body: html`<div class="actions">
  ${c.status === 'locked'
    ? postButton(`/admin/customers/${c.id}/unlock`, 'Mở khoá', csrf, { cls: 'btn-mini ok' })
    : html`<form method="post" action="/admin/customers/${c.id}/lock" class="inline" data-confirm="Khoá khách này và thu hồi slot?">${csrfField(csrf)}
        <input name="days" type="number" min="1" placeholder="Số ngày (trống = vĩnh viễn)"><input name="reason" placeholder="Lý do"><button class="btn-mini danger">Khoá</button></form>`}
  <form method="post" action="/admin/customers/${c.id}/strike" class="inline" data-confirm="Ghi 1 vi phạm? (lần 2 khoá 7 ngày, lần 3 khoá vĩnh viễn)">${csrfField(csrf)}<input name="reason" placeholder="Lý do vi phạm"><button class="btn-mini">Ghi vi phạm</button></form>
  ${postButton(`/admin/customers/${c.id}/risk-reset`, 'Xoá điểm rủi ro', csrf)}
  ${c.phone.startsWith('del:') ? '' : postButton(`/admin/customers/${c.id}/erase`, 'Xoá dữ liệu cá nhân', csrf, { cls: 'btn-mini danger', confirm: 'Xoá email / SĐT, email Canva và dữ liệu cá nhân của khách này? Slot đang chạy sẽ kết thúc. Không hoàn tác được.' })}
</div>
<form method="post" action="/admin/customers/${c.id}/note" class="acard">${csrfField(csrf)}
  ${field('Ghi chú nội bộ', html`<textarea name="note" rows="2">${c.note || ''}</textarea>`)}<button class="btn-mini">Lưu ghi chú</button></form>
${secHead('Slot', { n: slots.length, link: [`/admin/slots?customer=${c.id}`, 'Xem ở trang Slot'] })}
${table(['#', 'Công cụ', 'Tài khoản', 'Quán', 'Trạng thái', 'Điểm', 'Tạo', 'Hết hạn / kết thúc', ''], slots.map((s) => [
  link.slot(s.id), link.tool(s.tool_id, s.tool_name), link.acc(s.account_id, s.login_email), link.cafe(s.cafe_id, s.cafe_name, s.card_label),
  html`${badge(SLOT_STATUS[s.status] || s.status, SLOT_TONE[s.status] ?? '')}${s.end_reason ? html`<span class="sub">${END_REASON[s.end_reason] || s.end_reason}</span>` : ''}${s.extended_days ? html`<span class="sub">gia hạn ${s.extended_days} ngày</span>` : ''}`, s.risk_score,
  t(s.created_at, off(ctx)), t(s.ended_at || s.expires_at, off(ctx)),
  slotEndButton(ctx, s, csrf, back),
]), 'Khách chưa nhận món nào.')}
${secHead('Thiết bị', { n: devices.length })}
${table(['Mã máy', 'Trạng thái', 'Điểm', 'Khách khác', 'Lần đầu', 'Lần cuối', ''], devices.map((d) => [
  html`<code>${d.id.slice(0, 10)}…</code>`, d.status === 'locked' ? badge('Khoá', 'red') : badge('Bình thường', 'ok'), d.risk, d.others || '—', t(d.first_seen_at, off(ctx)), t(d.last_seen_at, off(ctx)),
  d.status === 'locked' ? postButton(`/admin/devices/${d.id}/unlock`, 'Mở', csrf, { fields: { back } })
    : postButton(`/admin/devices/${d.id}/lock`, 'Khoá máy', csrf, { cls: 'btn-mini danger', fields: { back }, confirm: d.others ? `Máy này còn ${d.others} khách khác dùng — khoá máy thì họ cũng không nhận được nữa. Khoá?` : 'Khoá máy này? Mọi khách dùng máy này sẽ không nhận được nữa.' }),
]))}
${secHead('Nhật ký', { n: events.length })}
${table(['Lúc', 'Mức', 'Sự kiện', 'Nơi', 'Chi tiết', 'IP'], events.map((e) => [t(e.created_at, off(ctx)), sev(e.severity), EVENT_LABEL[e.type] || e.type, eventWhere(e), eventSummary(e.data, e.type), e.ip || '']))}`,
    });
  }));

  router.post('/admin/customers/:id/lock', A((rq, f) => {
    const days = int(f.days);
    // Trống = vĩnh viễn; 0 / số âm trước đây cũng thành vĩnh viễn (hoặc khoá đã hết hạn) → báo nhập lại.
    if (days != null && !(days >= 1 && days <= 3650)) return go(`/admin/customers/${id(rq)}`, 'Số ngày khoá từ 1 đến 3650 (để trống = khoá vĩnh viễn). Chưa khoá.');
    lockCustomer(rq.ctx, id(rq), { reason: f.reason?.trim() || 'Khoá thủ công', untilMs: days ? rq.ctx.now() + days * DAY : null, by: BY });
    return go(`/admin/customers/${id(rq)}`, 'Đã khoá khách.');
  }));
  router.post('/admin/customers/:id/unlock', A((rq) => { unlockCustomer(rq.ctx, id(rq), BY); return go(`/admin/customers/${id(rq)}`, 'Đã mở khoá.'); }));
  router.post('/admin/customers/:id/strike', A((rq, f) => {
    const r = addStrike(rq.ctx, id(rq), f.reason?.trim() || 'Vi phạm', BY);
    return go(`/admin/customers/${id(rq)}`, `Đã ghi vi phạm lần ${r.strikes}.${r.locked ? ' Khách đã bị khoá.' : ''}`);
  }));
  router.post('/admin/customers/:id/risk-reset', A((rq) => {
    run(rq.ctx.db, 'UPDATE customers SET risk = 0, risk_updated_at = ? WHERE id = ?', rq.ctx.now(), id(rq));
    logEvent(rq.ctx, { type: 'risk_reset', customerId: id(rq), data: { by: BY } });
    return go(`/admin/customers/${id(rq)}`, 'Đã xoá điểm rủi ro.');
  }));
  router.post('/admin/customers/:id/note', A((rq, f) => {
    run(rq.ctx.db, 'UPDATE customers SET note = ? WHERE id = ?', String(f.note || '').trim().slice(0, 1000) || null, id(rq));
    return go(`/admin/customers/${id(rq)}`, 'Đã lưu ghi chú.');
  }));
  router.post('/admin/customers/:id/erase', A((rq) => {
    const r = eraseCustomer(rq.ctx, id(rq), BY);
    return go(`/admin/customers/${id(rq)}`, r.message);
  }));
  router.post('/admin/devices/:id/lock', A((rq) => { lockDevice(rq.ctx, rq.params.id, 'Khoá thủ công', BY); return go('/admin/customers', 'Đã khoá máy.'); }));
  router.post('/admin/devices/:id/unlock', A((rq) => { unlockDevice(rq.ctx, rq.params.id, BY); return go('/admin/customers', 'Đã mở máy.'); }));

  // ----- Mã phiếu (docs/design-ma-phieu-workspace.md) -----
  router.get('/admin/vouchers', P((rq) => {
    const { ctx } = rq;
    const csrf = rq.state.admin.csrf;
    const o = off(ctx);
    const tools = all(ctx.db, "SELECT id, slug, name, voucher_code FROM tools WHERE enabled = 1 AND login_type != 'redeem' ORDER BY sort, id");
    const cafes = all(ctx.db, 'SELECT id, name FROM cafes ORDER BY name');
    const q = String(rq.query.q || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const where = [];
    const params = {};
    if (q) { where.push('v.code LIKE :q'); params.q = `%${q}%`; }
    if (rq.query.batch) { where.push('v.batch = :batch'); params.batch = String(rq.query.batch); }
    if (VOUCHER_KINDS[rq.query.kind]) { where.push('v.kind = :kind'); params.kind = rq.query.kind; }
    if (['active', 'used', 'void'].includes(rq.query.status)) { where.push('v.status = :status'); params.status = rq.query.status; }
    // Phiếu tự động (chạm thẻ / trang quán QS, sống 60 phút) mỗi lượt khách 1 mã → mặc định ẩn khỏi danh sách cho khỏi ngập phiếu in.
    const src = ['auto', 'all'].includes(rq.query.src) ? rq.query.src : '';
    if (!rq.query.batch && !q && src !== 'all') where.push(src === 'auto' ? autoBatchSql('v.batch') : `NOT ${autoBatchSql('v.batch')}`);
    const here = rq.path + (rq.url.search || '');
    const rows = all(ctx.db,
      `SELECT v.*, c.phone, f.name AS cafe_name FROM vouchers v LEFT JOIN customers c ON c.id = v.customer_id LEFT JOIN cafes f ON f.id = v.cafe_id
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY v.id DESC LIMIT 300`, params);
    const batches = all(ctx.db,
      `SELECT batch, kind, MIN(days) AS days, MIN(note) AS note, MIN(created_at) AS created_at, COUNT(*) AS n,
              SUM(status = 'used') AS used, SUM(uses > 0) AS touched, SUM(status = 'void') AS voided
       FROM vouchers WHERE NOT ${autoBatchSql()} GROUP BY batch ORDER BY MIN(id) DESC LIMIT 30`);
    const now = ctx.now();
    const autoDays = all(ctx.db,
      `SELECT substr(batch, instr(batch, '-20') + 1) AS day, COUNT(*) AS n, SUM(uses > 0) AS used, SUM(status = 'active' AND uses = 0 AND expires_at <= ?) AS expired
       FROM vouchers WHERE ${autoBatchSql()} GROUP BY day ORDER BY day DESC LIMIT 7`, now);
    const needTools = tools.filter((x) => x.voucher_code);
    const expired = (v) => v.status === 'active' && v.expires_at && v.expires_at <= now;
    const kindLabel = (v) => (v.kind === 'extend' ? `${VOUCHER_KINDS.extend} ${v.days} ngày` : VOUCHER_KINDS[v.kind]);
    view(rq, {
      title: 'Mã phiếu', active: '/admin/vouchers',
      sub: html`Cần mã phiếu khi lấy mã đăng nhập: ${needTools.length ? needTools.map((x, i) => html`${i ? ', ' : ''}${link.tool(x.id, x.name)}`) : 'chưa món nào (bật "Cần mã phiếu" ở trang Công cụ)'}`,
      actions: html`<a class="btn" href="#tao">${plus('Tạo lô mã')}</a>`,
      body: html`<details class="help"><summary>Mã phiếu dùng để làm gì?</summary>
<p>Khách cần <b>mã phiếu</b> mới lấy được mã đăng nhập của ${needTools.length ? needTools.map((x) => x.name).join(', ') : html`<b>công cụ nào bật "Cần mã phiếu"</b> (chưa có — bật ở trang <a href="/admin/tools">Công cụ</a>)`}.
Có email tài khoản mà không có mã phiếu thì không lấy được mã. Phiếu phát ở quán. Khách muốn dùng thêm ngày thì nhắn Zalo — bạn gia hạn ở trang <a href="/admin/gia-han">Gia hạn</a>, không cần mã.</p></details>
${secHead('Lô phiếu in', { n: batches.length })}
${table(['Lô', 'Loại', 'Ghi chú', 'Tạo lúc', 'Số mã', 'Đã dùng', 'Huỷ', ''], batches.map((b) => [
  html`<a href="/admin/vouchers?batch=${b.batch}#ma">${b.batch}</a>`, b.kind === 'extend' ? `Gia hạn ${b.days} ngày` : VOUCHER_KINDS[b.kind], b.note || '', t(b.created_at, o),
  b.n, b.kind === 'forever' ? `${b.touched} đã gắn` : b.used, b.voided || '',
  html`<a class="btn-mini" href="/admin/vouchers/in?batch=${b.batch}" target="_blank">In phiếu</a> <a class="btn-mini" href="/admin/vouchers.csv?batch=${b.batch}">CSV</a>
    ${b.n - b.voided - (b.kind === 'forever' ? 0 : b.used) > 0 ? postButton(`/admin/vouchers/batch/void`, 'Huỷ cả lô', csrf, { cls: 'btn-mini danger', confirm: `Huỷ mọi mã còn dùng được của lô ${b.batch}? (vd. mất xấp phiếu)`, fields: { batch: b.batch, back: here } }) : ''}`,
]), 'Chưa in lô nào. Tạo ở mục "Tạo lô mã" bên dưới.')}
${secHead('Phiếu tự động', { note: 'khách chạm thẻ / vào từ trang quán QS — tự cấp, sống ' + (ctx.settings().autoVoucherTtlMin || 60) + ' phút, không cần in', link: ['/admin/vouchers?src=auto#ma', 'Xem mã'] })}
${autoDays.length ? table(['Ngày', 'Đã cấp', 'Khách đã dùng', 'Hết hạn chưa dùng'], autoDays.map((d) => [d.day, d.n, d.used, d.expired]))
    : html`<p class="empty">Chưa cấp phiếu tự động nào.</p>`}
${secHead(`Mã${rq.query.batch ? ` trong lô ${rq.query.batch}` : src === 'auto' ? ' tự động' : ' gần đây'}`, { id: 'ma', n: rows.length, link: rq.query.batch || src ? ['/admin/vouchers#ma', 'Phiếu in'] : null })}
<form method="get" class="row tight"><input name="q" value="${rq.query.q || ''}" placeholder="Tìm mã" aria-label="Tìm mã">
  ${select('kind', { '': 'Mọi loại', ...VOUCHER_KINDS }, rq.query.kind || '')}
  ${select('status', { '': 'Mọi trạng thái', active: 'Còn dùng được', used: 'Đã dùng', void: 'Đã huỷ' }, rq.query.status || '')}
  ${rq.query.batch ? '' : select('src', { '': 'Phiếu in', auto: 'Phiếu tự động', all: 'Cả hai' }, src)}
  ${rq.query.batch ? html`<input type="hidden" name="batch" value="${rq.query.batch}">` : ''}<button class="btn-mini">Lọc</button></form>
${table(['Mã', 'Loại', 'Công cụ', 'Quán', 'Đã dùng', 'Gắn khách', 'Trạng thái', 'Hết hạn', 'Dùng lần cuối', ''], rows.map((v) => [
  html`<code>${formatCode(v.code)}</code>`, kindLabel(v), v.tools || 'mọi', v.cafe_id ? link.cafe(v.cafe_id, v.cafe_name) : 'mọi',
  `${v.uses}${v.max_uses != null ? `/${v.max_uses}` : ''}`, link.cust(v.customer_id, v.phone),
  badge(v.status === 'active' ? (expired(v) ? 'Hết hạn' : 'Còn dùng') : v.status === 'used' ? 'Đã dùng' : 'Đã huỷ',
    v.status === 'active' && !expired(v) ? 'ok' : v.status === 'void' ? 'red' : ''),
  t(v.expires_at, o), t(v.last_used_at, o),
  html`${v.status === 'active' && !expired(v) ? postButton(`/admin/vouchers/${v.id}/void`, 'Huỷ', csrf, { cls: 'btn-mini danger', confirm: 'Huỷ mã này? Khách giữ phiếu sẽ không dùng được.', fields: { back: here } }) : ''}
    ${v.kind === 'forever' && v.customer_id ? postButton(`/admin/vouchers/${v.id}/unbind`, 'Gỡ khách', csrf, { confirm: 'Gỡ khách khỏi mã? Người dùng tiếp theo sẽ gắn vào.', fields: { back: here } }) : ''}`,
]), 'Không có mã nào.')}
${secHead('Tạo lô mã', { id: 'tao' })}
<form method="post" action="/admin/vouchers" class="acard grid">${csrfField(csrf)}
  ${field('Loại', select('kind', { once: 'Lấy mã 1 lần (phát ở quán)', forever: 'Lấy mã vĩnh viễn (gắn khách đầu tiên dùng)' }, 'once'))}
  ${field('Số mã', html`<input name="count" type="number" min="1" max="500" value="20" required>`)}
  ${field('Hạn dùng mã (ngày)', html`<input name="expiresDays" type="number" min="1" max="3650" placeholder="trống = không hết hạn">`)}
  ${field('Quán', select('cafeId', { '': 'Mọi quán', ...Object.fromEntries(cafes.map((c) => [String(c.id), c.name])) }, ''), 'Chọn quán = phiếu chỉ dùng cho khách nhận slot ở quán đó.')}
  ${field('Ghi chú', html`<input name="note" maxlength="200" placeholder="vd. Phiếu quán A tuần 41">`)}
  <div class="wide">${needTools.length ? html`<span>Dùng cho công cụ (không tick = mọi món cần phiếu):</span>
    ${needTools.map((x) => html`<label class="check"><input type="checkbox" name="tool_${x.slug}" value="1"> ${x.name}</label>`)}`
    : html`<p class="warn">Chưa món nào bật "Cần mã phiếu" — mã tạo ra sẽ chưa dùng vào việc gì. Bật ở trang <a href="/admin/tools">Công cụ</a>.</p>`}</div>
  <button class="btn">Tạo mã</button></form>`,
    });
  }));

  router.post('/admin/vouchers', A((rq, f) => {
    const { ctx } = rq;
    // Mã gia hạn: khách không còn chỗ nhập (gia hạn qua Zalo, chủ bấm ở trang Gia hạn) → không tạo nữa.
    if (f.kind === 'extend') return go('/admin/gia-han', 'Không cần mã gia hạn nữa — nhận tiền qua Zalo rồi bấm Gia hạn ở đây.');
    const tools = Object.keys(f).filter((k) => k.startsWith('tool_') && f[k] === '1').map((k) => k.slice(5));
    const r = createBatch(ctx, {
      kind: f.kind, count: f.count, days: f.days, tools, cafeId: int(f.cafeId), expiresDays: f.expiresDays, note: f.note?.trim() || null, by: BY,
    });
    if (!r.ok) return go('/admin/vouchers', r.message);
    return go(`/admin/vouchers?batch=${r.batch}`, `Đã tạo ${r.codes.length} mã (lô ${r.batch}). Bấm "In phiếu" để in.`);
  }));

  // Trang in: mỗi mã 1 phiếu nhỏ, cắt ra phát ở quán. Không lộ email / mật khẩu.
  router.get('/admin/vouchers/in', P((rq) => {
    const { ctx } = rq;
    // Chỉ in mã còn dùng được (bỏ mã hết hạn); phiếu tự động không in.
    const rows = isAutoBatch(rq.query.batch) ? [] : all(ctx.db, "SELECT * FROM vouchers WHERE batch = ? AND status = 'active' AND (expires_at IS NULL OR expires_at > ?) ORDER BY id",
      String(rq.query.batch || ''), ctx.now());
    const site = ctx.config.baseUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const names = new Map(all(ctx.db, 'SELECT slug, name FROM tools').map((x) => [x.slug, x.name]));
    const title = ctx.settings().eventTitle;
    const o = off(ctx);
    rq.sendHtml(200, html`<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>In phiếu ${rq.query.batch || ''}</title>
<meta name="robots" content="noindex,nofollow">
<style>
  body{font-family:Georgia,serif;margin:12px;color:#2b2118}
  .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
  .v{border:1px dashed #8a6d3b;border-radius:8px;padding:10px 12px;break-inside:avoid;page-break-inside:avoid}
  .v h3{margin:0 0 4px;font-size:13px}.v .code{font:700 22px/1.3 ui-monospace,Menlo,monospace;letter-spacing:2px;margin:6px 0}
  .v p{margin:2px 0;font-size:11px}.muted{color:#6b5a48}
  @media print{.noprint{display:none}body{margin:0}}
</style></head><body>
<p class="noprint"><button onclick="print()">In</button> ${rows.length} phiếu còn dùng được · lô ${rq.query.batch || ''}</p>
<div class="grid">${rows.map((v) => html`<div class="v">
  <h3>${title}</h3>
  <p class="muted">${v.kind === 'extend' ? `Mã gia hạn ${v.days} ngày` : v.kind === 'forever' ? 'Mã phiếu dùng nhiều lần' : 'Mã phiếu lấy mã đăng nhập'}${v.tools ? ` · ${v.tools.split(',').map((x) => names.get(x) || x).join(', ')}` : ''}</p>
  <div class="code">${formatCode(v.code)}</div>
  <p>${v.kind === 'extend' ? 'Nhắn Zalo Tiệm kèm mã này để được gia hạn.' : 'Nhập ở ô "Mã phiếu" khi bấm Lấy mã trên trang slot của bạn.'}</p>
  ${v.kind === 'extend' ? '' : html`<p class="muted">Trang slot: ${site}/me</p>`}
  ${v.expires_at ? html`<p class="muted">Dùng trước ${t(v.expires_at, o)}</p>` : ''}
</div>`)}</div></body></html>`);
  }));

  router.get('/admin/vouchers.csv', P((rq) => {
    const { ctx } = rq;
    const batch = String(rq.query.batch || '');
    const rows = all(ctx.db, 'SELECT * FROM vouchers WHERE batch = ? ORDER BY id', batch);
    const csv = csvFile([['Mã', 'Loại', 'Số ngày', 'Công cụ', 'Trạng thái', 'Đã dùng', 'Hết hạn'],
      ...rows.map((v) => [formatCode(v.code), VOUCHER_KINDS[v.kind], v.days ?? '', v.tools || 'mọi',
        v.status === 'void' ? 'Đã huỷ' : v.status === 'used' ? 'Đã dùng' : v.expires_at && v.expires_at <= ctx.now() ? 'Hết hạn' : 'Còn dùng',
        v.uses, v.expires_at ? fmtLocal(v.expires_at, off(ctx)) : ''])]);
    rq.send(200, csv, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="ma-phieu-${batch.replace(/[^\w-]/g, '')}.csv"` });
  }));

  router.post('/admin/vouchers/batch/void', A((rq, f) => {
    const n = voidBatch(rq.ctx, String(f.batch || ''), BY);
    return go('/admin/vouchers', n ? `Đã huỷ ${n} mã của lô ${f.batch}.` : 'Lô này không còn mã nào dùng được.');
  }));
  router.post('/admin/vouchers/:id/void', A((rq) => go('/admin/vouchers', voidVoucher(rq.ctx, id(rq), BY) ? 'Đã huỷ mã.' : 'Mã đã dùng hết hoặc đã huỷ.')));
  router.post('/admin/vouchers/:id/unbind', A((rq) => go('/admin/vouchers', unbindVoucher(rq.ctx, id(rq), BY) ? 'Đã gỡ khách khỏi mã.' : 'Mã chưa gắn khách nào.')));

  // ----- Gia hạn -----
  // Khách bấm "Gia hạn" trên trang slot → nhắn Zalo Tiệm (kèm email). Chủ nhận tiền, tìm khách ở đây rồi bấm Gia hạn.
  // (Khách không còn ô nhập mã gia hạn / nút xin gia hạn từ phiên 30 — bảng extend_requests chỉ còn dữ liệu cũ.)
  router.get('/admin/gia-han', P((rq) => {
    const { ctx } = rq;
    const csrf = rq.state.admin.csrf;
    const o = off(ctx);
    const maxDays = Number(ctx.settings().maxExtendDays) || 7;
    const q = String(rq.query.q || '').trim();
    const customerId = Number(rq.query.customer) > 0 ? Number(rq.query.customer) : null;
    const where = ["s.status = 'active'", "t.login_type != 'redeem'"];
    const params = {};
    if (customerId) { where.push('s.customer_id = :cid'); params.cid = customerId; }
    if (q) {
      const digits = q.replace(/^#/, '');
      if (/^\d{1,7}$/.test(digits)) { where.push("(s.id = :sid OR c.phone LIKE :tail)"); params.sid = Number(digits); params.tail = `%${digits}`; }
      else { where.push("c.phone LIKE :like ESCAPE '\\'"); params.like = `%${q.toLowerCase().replace(/[\\%_]/g, '\\$&')}%`; }
    }
    const reqs = all(ctx.db,
      `SELECT r.*, s.expires_at, s.extended_days, s.seat, s.tool_id, s.account_id, c.phone, t.name AS tool_name, a.login_email FROM extend_requests r
       JOIN slots s ON s.id = r.slot_id JOIN customers c ON c.id = r.customer_id JOIN tools t ON t.id = s.tool_id LEFT JOIN accounts a ON a.id = s.account_id
       WHERE r.status = 'pending' AND s.status = 'active' ORDER BY r.id`);
    const live = all(ctx.db,
      `SELECT s.*, c.phone, t.name AS tool_name, a.login_email FROM slots s JOIN customers c ON c.id = s.customer_id JOIN tools t ON t.id = s.tool_id
       LEFT JOIN accounts a ON a.id = s.account_id WHERE ${where.join(' AND ')} ORDER BY s.expires_at LIMIT 300`, params);
    const filtered = Boolean(q || customerId);
    const extendForm = (slotId, days) => html`<form method="post" action="/admin/gia-han/${slotId}" class="inline">${csrfField(csrf)}
      ${filtered ? html`<input type="hidden" name="back" value="${rq.path + rq.url.search}">` : ''}
      <input name="days" type="number" min="1" max="${maxDays}" value="${Math.min(days, maxDays)}" class="num-mini" aria-label="Số ngày"><button class="btn-mini ok">Gia hạn</button></form>`;
    const who = customerId ? (live[0] ? maskPhone(live[0].phone) : `khách #${customerId}`) : null;
    view(rq, {
      title: 'Gia hạn', heading: who ? `Gia hạn — ${who}` : 'Gia hạn — khách dùng thêm', active: '/admin/gia-han',
      sub: reqs.length ? `${reqs.length} yêu cầu cũ đang chờ` : 'Khách nhắn Zalo kèm email → tìm email ở đây → nhận tiền rồi bấm Gia hạn',
      actions: filtered ? html`<a class="btn-mini" href="/admin/gia-han">Bỏ lọc — xem mọi slot</a>` : '',
      body: html`<details class="help"><summary>Gia hạn hoạt động thế nào?</summary>
<p>Khách bấm <b>Gia hạn</b> trên trang slot → mở Zalo Tiệm, nhắn kèm email đã nhận. Bạn nhận tiền qua Zalo, gõ email (hoặc số slot) vào ô tìm bên dưới rồi bấm <b>Gia hạn</b> — trang khách tự cập nhật.
Khách đã gia hạn: lấy mã không cần mã phiếu / không cần ở quán; 6h sáng bot vẫn làm mới tài khoản nhưng giữ Project của khách, khách đăng nhập lại.
Mỗi lần tối đa ${maxDays} ngày tính từ hôm nay (đổi ở <a href="/admin/settings">Cài đặt</a>), không quá hạn của tài khoản.</p></details>
${reqs.length ? html`${secHead(`Yêu cầu đang chờ (${reqs.length})`, { note: 'gửi từ bản cũ, trước khi khách chuyển sang nhắn Zalo' })}
${table(['Lúc', 'Khách', 'Công cụ', 'Tài khoản / chỗ', 'Đang hết lúc', 'Xin thêm', ''], reqs.map((r) => [
  t(r.created_at, o), link.cust(r.customer_id, r.phone), link.tool(r.tool_id, r.tool_name),
  html`${link.acc(r.account_id, r.login_email)}${r.seat ? html`<span class="sub">${workspaceName(ctx, r.seat)}</span>` : ''}`, t(r.expires_at, o), `${r.days} ngày`,
  html`${extendForm(r.slot_id, r.days)} ${postButton(`/admin/gia-han/req/${r.id}/decline`, 'Bỏ qua', csrf)}`,
]))}` : ''}
${secHead('Slot đang chạy', { n: live.length, note: filtered ? `tìm "${q || who}"` : 'sớm hết hạn ở trên', link: ['/admin/slots', 'Mở Slot'] })}
<form method="get" class="row tight" role="search"><input name="q" value="${q}" placeholder="Email khách, SĐT hoặc số slot" aria-label="Tìm slot để gia hạn"><button class="btn-mini">Tìm</button>${filtered ? html`<a class="go" href="/admin/gia-han">Bỏ tìm</a>` : ''}</form>
${table(['#', 'Khách', 'Công cụ', 'Tài khoản / chỗ', 'Hết lúc', 'Đã gia hạn', ''], live.map((s) => [
  link.slot(s.id), link.cust(s.customer_id, s.phone), link.tool(s.tool_id, s.tool_name),
  html`${link.acc(s.account_id, s.login_email)}${s.seat ? html`<span class="sub">${workspaceName(ctx, s.seat)}</span>` : ''}`, t(s.expires_at, o), s.extended_days ? badge(`${s.extended_days} ngày`, 'ok') : '—',
  extendForm(s.id, 1),
]), filtered ? 'Không thấy slot đang chạy nào khớp. Khách hết giờ rồi thì phải nhận lại ở quán.' : 'Không có slot nào đang chạy.')}`,
    });
  }));

  router.post('/admin/gia-han/:id', A((rq, f) => {
    const { ctx } = rq;
    const back = String(f.back || '').startsWith('/admin/gia-han?') ? f.back : '/admin/gia-han';
    const r = extendSlot(ctx, id(rq), { days: int(f.days, 1), by: BY });
    if (!r.ok) {
      // Câu của domain viết cho khách ("Nhắn Zalo Tiệm…") → nói lại cho chủ.
      const ADMIN_MSG = { cannot_extend: 'Tài khoản của slot này sắp hết hạn nên không gia hạn thêm được — đổi khách sang tài khoản khác.' };
      return go(back, ADMIN_MSG[r.code] || r.message);
    }
    return go(back, `Slot #${id(rq)}: ${r.capped ? 'gia hạn tới mức tối đa cho phép' : `đã thêm ${int(f.days, 1)} ngày`} — dùng tới ${fmtLocal(r.until, off(ctx))}.`);
  }));

  router.post('/admin/gia-han/req/:id/decline', A((rq) => {
    const { ctx } = rq;
    const r = run(ctx.db, "UPDATE extend_requests SET status = 'declined', done_at = ?, done_by = ? WHERE id = ? AND status = 'pending'", ctx.now(), BY, id(rq));
    if (r.changes) logEvent(ctx, { type: 'extend_declined', data: { requestId: id(rq), by: BY } });
    return go('/admin/gia-han', r.changes ? 'Đã bỏ qua yêu cầu.' : 'Yêu cầu đã xử lý rồi.');
  }));

  // ----- Slot -----
  // Nút "Thu hồi" (slot đang dùng) / "Huỷ" (Canva chưa mời được) — câu hỏi lại nói rõ chuyện gì xảy ra sau đó. back = trang quay về.
  const slotEndButton = (ctx, s, csrf, back) => {
    if (s.status === 'pending_invite') {
      return postButton(`/admin/slots/${s.id}/revoke`, 'Huỷ', csrf, { cls: 'btn-mini danger', fields: { back },
        confirm: `Huỷ slot #${s.id}? Khách chưa được mời vào nhóm (vd. gõ sai email) — trả ghế, không tính lượt, khách nhận lại được.` });
    }
    if (s.status !== 'active') return '';
    const x = get(ctx.db, `SELECT t.login_type, t.reuse, t.rotation_required, a.status AS acc_status,
        (SELECT COUNT(*) FROM slots o WHERE o.account_id = s.account_id AND o.status IN ('active', 'pending_invite') AND o.id != s.id) AS others
       FROM slots s JOIN tools t ON t.id = s.tool_id LEFT JOIN accounts a ON a.id = s.account_id WHERE s.id = ?`, s.id);
    let then = '';
    if (!s.account_id) then = '';
    else if (x.login_type === 'team_invite') then = ' Bot sẽ gỡ khách khỏi nhóm.';
    else if (x.reuse === 'once') then = x.others ? '' : ' Tài khoản dùng 1 lần này sẽ ngừng dùng.';
    else if (x.rotation_required && x.acc_status !== 'retired') {
      then = x.others ? ` Tài khoản dùng chung còn ${x.others} khách khác — sẽ có việc đổi mật khẩu ngay, làm việc đó sẽ đá cả họ ra.` : ' Sẽ có việc đổi mật khẩu ở Việc tay.';
    }
    return postButton(`/admin/slots/${s.id}/revoke`, 'Thu hồi', csrf, { cls: 'btn-mini danger', fields: { back }, confirm: `Thu hồi slot #${s.id}? Khách mất quyền dùng ngay.${then}` });
  };
  router.get('/admin/slots', P((rq) => {
    const { ctx } = rq;
    const csrf = rq.state.admin.csrf;
    // Lọc theo link chéo từ các trang khác: ?id= (1 slot), ?tool=, ?account=, ?cafe=, ?customer=.
    const F = { id: 's.id', tool: 's.tool_id', account: 's.account_id', cafe: 's.cafe_id', customer: 's.customer_id' };
    const filters = Object.entries(F).filter(([k]) => Number(rq.query[k]) > 0).map(([k, col]) => [k, col, Number(rq.query[k])]);
    const cond = filters.map(([, col, v]) => ` AND ${col} = ${v}`).join('');
    const q = (where, limit) => all(ctx.db,
      `SELECT s.*, c.phone, t.name AS tool_name, a.login_email, f.name AS cafe_name, k.label AS card_label FROM slots s
       JOIN customers c ON c.id = s.customer_id JOIN tools t ON t.id = s.tool_id LEFT JOIN accounts a ON a.id = s.account_id
       LEFT JOIN cafes f ON f.id = s.cafe_id LEFT JOIN cards k ON k.id = s.card_id WHERE ${where}${cond} ORDER BY s.id DESC LIMIT ${limit}`);
    const row = (s) => [
      link.slot(s.id), link.cust(s.customer_id, s.phone), link.tool(s.tool_id, s.tool_name), html`${link.acc(s.account_id, s.login_email)}${s.seat ? html`<span class="sub">Slot ${s.seat}</span>` : ''}`,
      link.cafe(s.cafe_id, s.cafe_name, s.card_label),
      html`${badge(SLOT_STATUS[s.status] || s.status, SLOT_TONE[s.status] ?? '')}${s.end_reason ? html`<span class="sub">${END_REASON[s.end_reason] || s.end_reason}</span>` : ''}${s.extended_days ? html`<span class="sub">gia hạn ${s.extended_days} ngày</span>` : ''}`,
      s.status === 'pending_invite' ? html`<span class="muted">chờ mời từ ${t(s.created_at, off(ctx))}</span>` : t(s.started_at || s.created_at, off(ctx)),
      s.status === 'pending_invite' ? html`<span class="muted">tính từ lúc mời</span>` : t(s.ended_at || s.expires_at, off(ctx)), s.code_requests ? `${s.code_used ?? 0} mã · ${s.code_requests} lần bấm` : '—',
    ];
    const here = rq.path + (rq.url.search || '');
    const live = q("s.status IN ('active', 'pending_invite')", 300);
    const ended = q("s.status IN ('expired', 'revoked', 'rejected')", 100);
    // Tên của bộ lọc đang bật — tra thẳng bảng (lọc không ra slot nào vẫn có tên thật, trước ghi "Slot — công cụ").
    const nameOf = (sql, v, dflt) => get(ctx.db, sql, v)?.n ?? dflt;
    const NAME = {
      id: (v) => `slot #${v}`,
      tool: (v) => nameOf('SELECT name AS n FROM tools WHERE id = ?', v, `công cụ #${v}`),
      account: (v) => nameOf('SELECT login_email AS n FROM accounts WHERE id = ?', v, `tài khoản #${v}`),
      cafe: (v) => nameOf('SELECT name AS n FROM cafes WHERE id = ?', v, `quán #${v}`),
      customer: (v) => { const p = nameOf('SELECT phone AS n FROM customers WHERE id = ?', v, null); return p ? maskPhone(p) : `khách #${v}`; },
    };
    view(rq, {
      title: 'Slot', heading: filters.length ? `Slot — ${filters.map(([k, , v]) => NAME[k](v)).join(' · ')}` : 'Slot', active: '/admin/slots',
      sub: `${live.length} đang chạy · ${ended.length} kết thúc gần đây`,
      actions: filters.length ? html`<a class="btn-mini" href="/admin/slots">Bỏ lọc — xem mọi slot</a>` : '',
      body: html`${secHead('Đang chạy', { n: live.length, link: ['/admin/gia-han', 'Gia hạn'] })}
${table(['#', 'Khách', 'Công cụ', 'Tài khoản', 'Quán', 'Trạng thái', 'Bắt đầu', 'Hết hạn', 'Lấy mã', ''], live.map((s) => [...row(s), slotEndButton(ctx, s, csrf, here)]), 'Không có slot nào đang chạy.')}
${secHead('Kết thúc gần đây', { n: ended.length })}
${table(['#', 'Khách', 'Công cụ', 'Tài khoản', 'Quán', 'Trạng thái', 'Bắt đầu', 'Kết thúc', 'Lấy mã'], ended.map(row), 'Chưa có slot nào kết thúc.')}`,
    });
  }));
  // Nút gửi back (trang Slot đang lọc / trang khách / Canva) → A() quay về đó; không có thì về trang Slot.
  router.post('/admin/slots/:id/revoke', A((rq) => {
    const { ctx } = rq;
    const back = '/admin/slots';
    const s = get(ctx.db, "SELECT * FROM slots WHERE id = ? AND status IN ('active', 'pending_invite')", id(rq));
    if (!s) return go(back, 'Slot không còn chạy.');
    const cancel = s.status === 'pending_invite';
    const last = get(ctx.db, 'SELECT COALESCE(MAX(id), 0) AS n FROM rotation_tasks').n;
    if (!revokeSlot(ctx, s.id, cancel ? 'admin_cancelled' : 'admin_revoked', BY).ok) return go(back, 'Slot không còn chạy.');
    const task = get(ctx.db, 'SELECT kind FROM rotation_tasks WHERE id > ? AND slot_id = ? ORDER BY id LIMIT 1', last, s.id);
    const rotating = s.account_id && get(ctx.db, "SELECT 1 FROM rotation_tasks WHERE account_id = ? AND kind = 'rotate' AND status = 'todo'", s.account_id);
    const then = cancel ? 'đã huỷ việc mời, trả ghế, không tính lượt của khách'
      : task?.kind === 'remove_member' ? 'bot sẽ gỡ khách khỏi nhóm'
      : rotating ? 'việc đổi mật khẩu ở Việc tay' : '';
    return go(back, `Đã ${cancel ? 'huỷ' : 'thu hồi'} slot #${s.id}${then ? ` — ${then}` : ''}.`);
  }));

  // ----- Thư -----
  router.get('/admin/mails', P((rq) => {
    const { ctx } = rq;
    // "Cần xem": thư hệ thống không tự xử lý trọn (mồ côi, không đọc được mã, đã báo chủ, cách ly, về trễ).
    const ATTN = "m.verdict IN ('orphan', 'orphan_wait', 'parse_failed', 'alerted', 'quarantined', 'late')";
    const attn = rq.query.v === 'can-xem';
    const where = attn ? `WHERE ${ATTN}` : rq.query.kind ? 'WHERE m.kind = :kind' : '';
    const mails = all(ctx.db, `SELECT m.*, a.login_email FROM mails m LEFT JOIN accounts a ON a.id = m.account_id ${where} ORDER BY m.id DESC LIMIT 150`,
      !attn && rq.query.kind ? { kind: rq.query.kind } : {});
    const kindCount = new Map(all(ctx.db, 'SELECT kind, COUNT(*) AS n FROM mails GROUP BY kind').map((r) => [r.kind, r.n]));
    const attnCount = get(ctx.db, `SELECT COUNT(*) AS n FROM mails m WHERE ${ATTN}`).n;
    view(rq, {
      title: 'Thư', heading: 'Thư về hộp thư kho', active: '/admin/mails',
      sub: `Nội dung thư tự xoá sau ${ctx.settings().retentionMailBodyHours} giờ · đang xem 150 thư mới nhất`,
      body: html`${chips([['/admin/mails', 'Mọi loại', null, !rq.query.kind && !attn], ...(attnCount ? [['/admin/mails?v=can-xem', 'Cần xem', attnCount, attn]] : []), ...Object.entries(MAIL_KIND).filter(([k]) => kindCount.get(k)).map(([k, label]) => [`/admin/mails?kind=${k}`, label, kindCount.get(k), !attn && rq.query.kind === k])])}
${table(['Lúc', 'Tới', 'Từ', 'Tiêu đề', 'Loại', 'Kết quả'], mails.map((m) => [
  t(m.received_at, off(ctx)), m.account_id ? link.acc(m.account_id, m.login_email) : html`<code>${m.to_addr || ''}</code>`, m.from_addr || '', html`<a href="/admin/mails/${m.id}">${m.subject || '(không tiêu đề)'}</a>`,
  MAIL_KIND[m.kind] || m.kind, mailVerdict(m),
]), attn ? 'Không có thư nào cần xem.' : 'Chưa có thư nào.')}
<details class="help"><summary>Thư vào đây bằng đường nào?</summary><p>Webhook: <code>POST ${ctx.config.baseUrl}/hooks/mail</code> (ký HMAC-SHA256 header X-Signature) — Cloudflare Worker tbq-mail chuyển thư vào.</p></details>`,
    });
  }));

  router.get('/admin/mails/:id', P((rq) => {
    const { ctx } = rq;
    const m = get(ctx.db, 'SELECT m.*, a.login_email FROM mails m LEFT JOIN accounts a ON a.id = m.account_id WHERE m.id = ?', id(rq));
    if (!m) throw new HttpError(404, 'Không có thư này.');
    // Ô "Gửi mã cho khách" chỉ cho thư mã đăng nhập (hoặc thư chưa phân loại) — trước hiện cả với thư đặt lại mật khẩu / cảnh báo bảo mật.
    const waiting = m.account_id && MANUAL_CODE_KINDS.includes(m.kind) ? get(ctx.db, "SELECT w.*, c.phone FROM code_windows w JOIN customers c ON c.id = w.customer_id WHERE w.account_id = ? AND w.status IN ('open', 'delivered') AND w.expires_at + 60000 >= ? ORDER BY w.id DESC LIMIT 1", m.account_id, ctx.now()) : null;
    // Mã trong thư đã giao cho ai (lượt nhận mã gắn với thư).
    const given = m.window_id ? get(ctx.db, 'SELECT w.id, w.customer_id, w.slot_id, c.phone FROM code_windows w JOIN customers c ON c.id = w.customer_id WHERE w.id = ?', m.window_id) : null;
    view(rq, {
      title: m.subject || 'Thư', heading: m.subject || '(không tiêu đề)', active: '/admin/mails', crumbs: [['/admin/mails', 'Thư']],
      sub: html`${t(m.received_at, off(ctx))} · ${MAIL_KIND[m.kind] || m.kind} ${mailVerdict(m)}`,
      body: html`<p class="kv"><span>Tới ${m.account_id ? link.acc(m.account_id, m.login_email) : html`<code>${m.to_addr}</code>`}</span><span>Từ <code>${m.from_addr}</code></span>${given ? html`<span>Mã đã giao cho khách ${link.cust(given.customer_id, given.phone)}${given.slot_id ? html` · slot ${link.slot(given.slot_id)}` : ''}</span>` : ''}</p>
${waiting ? html`<form method="post" action="/admin/mails/${m.id}/deliver" class="acard row">${csrfField(rq.state.admin.csrf)}
  <span>Khách ${link.cust(waiting.customer_id, waiting.phone)} đang chờ mã (lượt #${waiting.id}). Đọc mã trong thư rồi gửi:</span>
  <input name="code" placeholder="Mã" autocomplete="off" required><button class="btn-mini ok">Gửi mã cho khách</button></form>` : ''}
<pre class="mail-body">${m.body ?? '(nội dung đã được xoá theo thời hạn lưu trữ)'}</pre>
<p class="muted">Không bao giờ chuyển link hay nguyên thư cho khách. Thư đặt lại mật khẩu/cảnh báo bảo mật: không đưa mã cho ai.</p>`,
    });
  }));
  router.post('/admin/mails/:id/deliver', A((rq, f) => go(`/admin/mails/${id(rq)}`, deliverManualCode(rq.ctx, { mailId: id(rq), code: f.code, by: BY }).message)));

  // ----- Nhật ký -----
  router.get('/admin/events', P((rq) => {
    const { ctx } = rq;
    const where = [];
    const params = {};
    if (rq.query.sev) { where.push('e.severity = :sev'); params.sev = rq.query.sev; }
    if (rq.query.type) { where.push('e.type = :type'); params.type = rq.query.type; }
    const cafeF = Number(rq.query.cafe) > 0 ? get(ctx.db, 'SELECT id, name FROM cafes WHERE id = ?', Number(rq.query.cafe)) : null;
    if (cafeF) { where.push('e.cafe_id = :cafe'); params.cafe = cafeF.id; }
    const rows = all(ctx.db,
      `SELECT e.*, c.phone, a.login_email, f.name AS cafe_name FROM events e LEFT JOIN customers c ON c.id = e.customer_id
       LEFT JOIN accounts a ON a.id = e.account_id LEFT JOIN cafes f ON f.id = e.cafe_id
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY e.id DESC LIMIT 300`, params);
    const sevUrl = (s) => `/admin/events?${new URLSearchParams({ ...(s ? { sev: s } : {}), ...(rq.query.type ? { type: rq.query.type } : {}), ...(cafeF ? { cafe: cafeF.id } : {}) })}`;
    view(rq, {
      title: 'Nhật ký', active: '/admin/events',
      sub: `${rows.length} sự kiện${rq.query.type ? ` · ${EVENT_LABEL[rq.query.type] || rq.query.type}` : ''}${cafeF ? ` · quán ${cafeF.name}` : ''} · mới nhất trước`,
      actions: rq.query.type || rq.query.sev || cafeF ? html`<a class="btn-mini" href="/admin/events">Bỏ lọc</a>` : '',
      body: html`${chips([[sevUrl(''), 'Mọi mức', null, !rq.query.sev], [sevUrl('red'), 'Đỏ', null, rq.query.sev === 'red'], [sevUrl('yellow'), 'Vàng', null, rq.query.sev === 'yellow'], [sevUrl('info'), 'Thông tin', null, rq.query.sev === 'info']])}
<form method="get" class="row tight">${rq.query.sev ? html`<input type="hidden" name="sev" value="${rq.query.sev}">` : ''}${cafeF ? html`<input type="hidden" name="cafe" value="${cafeF.id}">` : ''}
  ${select('type', { '': 'Mọi sự kiện', ...EVENT_LABEL }, rq.query.type || '')}<button class="btn-mini">Lọc</button></form>
${table(['Lúc', 'Mức', 'Sự kiện', 'Khách', 'Tài khoản / quán', 'Chi tiết', 'IP'], rows.map((e) => [
  t(e.created_at, off(ctx)), sev(e.severity), html`<a href="/admin/events?type=${e.type}">${EVENT_LABEL[e.type] || e.type}</a>`,
  link.cust(e.customer_id, e.phone), eventWhere(e), eventSummary(e.data, e.type), e.ip || '',
]), 'Không có sự kiện nào.')}`,
    });
  }));

  // ----- Cài đặt -----
  // typed: chữ chủ vừa gõ (lưu lỗi thì vẽ lại, không mất chữ). bad: các ô sai (viền đỏ).
  const settingsPage = (rq, { flash = '', typed = null, bad = new Set() } = {}) => {
    const { ctx } = rq;
    const s = ctx.settings();
    const groupAt = new Map(SETTING_GROUPS.map(([title, k]) => [k, title]));
    const val = (k) => (typed && k in typed ? typed[k] : s[k] ?? '');
    const input = (k) => (SETTING_CHOICES[k]
      ? select(k, SETTING_CHOICES[k], String(val(k)))
      : SETTING_RANGE[k]
        ? html`<input name="${k}" type="number" inputmode="numeric" step="1" min="${SETTING_RANGE[k][0]}" max="${SETTING_RANGE[k][1]}" value="${val(k)}"${bad.has(k) ? html` aria-invalid="true"` : ''}>`
        : html`<input name="${k}" value="${val(k)}"${bad.has(k) ? html` aria-invalid="true"` : ''}>`);
    view(rq, {
      title: 'Cài đặt', active: '/admin/settings', sub: 'Cài đặt chung của chương trình — suất từng quán ở trang Quán, lượt từng món ở trang Công cụ',
      ...(flash ? { flash, flashError: true } : {}),
      body: html`<form method="post" action="/admin/settings" class="acard grid">${csrfField(rq.state.admin.csrf)}
  ${Object.entries(SETTING_DEFS).map(([k, [def, label]]) => html`${groupAt.has(k) ? html`<h3>${groupAt.get(k)}</h3>` : ''}${field(label, input(k),
    `${k} · mặc định: ${def ?? '(trống)'}${SETTING_RANGE[k] && !SETTING_CHOICES[k] ? ` · từ ${SETTING_RANGE[k][0]} đến ${SETTING_RANGE[k][1]}` : ''}`)}`)}
  <button class="btn">Lưu cài đặt</button></form>`,
    });
  };
  router.get('/admin/settings', P((rq) => settingsPage(rq)));

  // ----- Máy chủ: trang khách còn vào được không, sao lưu, ổ đĩa, RAM, bot, gửi mã, database -----
  const LEVEL = { ok: ['Ổn', 'ok'], warn: ['Để ý', 'yellow'], bad: ['Cần xử lý', 'red'] };
  router.get('/admin/may-chu', P((rq) => {
    const { ctx } = rq;
    const checks = hostChecks(ctx, { deep: true });
    const bad = checks.filter((c) => c.level === 'bad').length;
    const warn = checks.filter((c) => c.level === 'warn').length;
    view(rq, {
      title: 'Máy chủ', active: '/admin/may-chu',
      sub: bad ? `${bad} mục cần xử lý ngay` : warn ? `${warn} mục nên để ý` : 'Mọi thứ đang ổn · tự kiểm trang khách mỗi 5 phút',
      actions: postButton('/admin/may-chu/kiem', html`${icon('pulse')}Kiểm lại ngay`, rq.state.admin.csrf, { cls: 'btn-line' }),
      body: html`
${secHead('Sức khoẻ', { note: 'đỏ = khách có thể không nhận được công cụ' })}
${table(['Mục', 'Tình trạng', '', 'Nên làm'], checks.map((c) => [
  html`<b>${c.label}</b>`, badge(LEVEL[c.level][0], LEVEL[c.level][1]), c.value, c.hint || '—',
]), 'Không có mục nào.', { cls: 'host' })}
${secHead('Đang chạy')}
${table(['', ''], hostFacts(ctx, PKG_VERSION).map(([k, v]) => [html`<b>${k}</b>`, v]))}
<p class="muted">Sao lưu tự động 05:30 trên máy chủ; máy Mac tự kéo 1 bản về lúc 05:45. Trang khách sập hẳn (máy chủ tắt) thì trang này cũng không mở được —
phần đó do bộ canh bên ngoài (Cloudflare Worker <code>tbq-canh-ngoai</code>, gọi <code>${ctx.config.baseUrl}/healthz</code> mỗi phút) gửi thư.
Mục chuyển đỏ và sự kiện đỏ được gửi thư cho chủ (dòng "Thư báo động" ở trên).</p>`,
    });
  }));
  router.post('/admin/may-chu/kiem', A(async (rq) => {
    const r = await probePublic(rq.ctx);
    return go('/admin/may-chu', r.ok ? `Trang khách trả lời trong ${r.ms} ms.` : `Trang khách lỗi: ${r.error}`);
  }));

  // Kiểm hết rồi mới lưu (1 ô sai → không lưu ô nào, vẽ lại form giữ chữ đã gõ). Trước: lưu phần đúng, bỏ phần sai, chữ gõ mất.
  router.post('/admin/settings', A((rq, f) => {
    const { ctx } = rq;
    const cur = ctx.settings();
    const label = (k) => SETTING_DEFS[k][1].split(' — ')[0].split(' (')[0];
    const errors = [];
    const bad = new Set();
    const next = {};
    const typed = {};
    for (const k of Object.keys(SETTING_DEFS)) {
      if (!(k in f)) continue;
      typed[k] = String(f[k]);
      try {
        const v = checkSetting(k, f[k]);
        const problem = PUBLIC_TEXT_SETTINGS.includes(k) ? freeTextProblem(String(v)) : null;
        if (problem) throw new Error(`${k}: ${POLICY_MESSAGE[problem]}`);
        next[k] = v;
      } catch (e) {
        bad.add(k);
        errors.push(`"${label(k)}" — ${e.message.replace(new RegExp(`^${k}:? `), '')}`);
      }
    }
    if (!errors.length) errors.push(...pairProblems({ ...cur, ...next }));
    if (errors.length) {
      settingsPage(rq, { flash: `Chưa lưu: ${errors.join('; ')}.`, typed, bad });
      return { rendered: true };
    }
    const changed = Object.entries(next).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(cur[k]));
    tx(ctx.db, () => {
      for (const [k, v] of changed) run(ctx.db, 'INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', k, JSON.stringify(v));
    });
    ctx.settings.invalidate();
    if (!changed.length) return go('/admin/settings', 'Không có gì thay đổi.');
    // Nhật ký ghi rõ đổi gì (trước chỉ ghi "đã lưu").
    logEvent(ctx, { type: 'settings_saved', data: { by: BY, reason: changed.map(([k, v]) => `${k}: ${cur[k] ?? '(trống)'} → ${v ?? '(trống)'}`).join(', ').slice(0, 400) } });
    return go('/admin/settings', `Đã lưu cài đặt (${changed.length} mục: ${changed.map(([k]) => label(k)).join(', ')}).`);
  }));
}
