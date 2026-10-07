// Trang quản trị /admin/*. Đăng nhập bằng ADMIN_PASSWORD; cookie "adm" (SameSite=Strict, path /admin);
// mọi POST kiểm tra Origin + CSRF token.
import { HttpError, html } from '../lib/http.js';
import { get, all, run, tx } from '../db/index.js';
import { randomToken, sha256, safeEqual, encrypt } from '../lib/crypto.js';
import { parseTotpSecret } from '../lib/totp.js';
import { hit, reset } from '../lib/ratelimit.js';
import { logEvent } from '../lib/events.js';
import { normalizePhone, normalizeEmail, maskPhone, displayPhone } from '../lib/phone.js';
import { SETTING_DEFS, saveSetting } from '../lib/settings.js';
import { HOUR, MIN, DAY, startOfLocalDay, startOfLocalMonth } from '../lib/time.js';
import { completeTask, revokeSlot, createTask, blockingHolders, keptSeats, workspaceName } from '../domain/claims.js';
import { createBatch, voidVoucher, unbindVoucher, extendSlot, formatCode, VOUCHER_KINDS } from '../domain/vouchers.js';
import { lockCustomer, unlockCustomer, addStrike, lockDevice, unlockDevice, lockCard, unlockCard, customerRisk } from '../domain/risk.js';
import { eraseCustomer } from '../domain/auth.js';
import { deliverManualCode } from '../domain/codes.js';
import { accountLoad, toolAvailability, toolUsedToday, USABLE_SQL, COUNTED } from '../domain/quota.js';
import { quarantineAccount, DEFAULT_TOOL_PATTERNS } from '../domain/mail.js';
import { statsSince, cafeReport } from '../domain/stats.js';
import { freeTextProblem, POLICY_MESSAGE } from '../lib/policy.js';
import { QS_EVENT } from '../qs-event.js';
import {
  adminPage, csrfField, postButton, table, t, sev, badge, tile, csvFile, eventSummary,
  EVENT_LABEL, SLOT_STATUS, ACCOUNT_STATUS, LOGIN_TYPE, TASK_KIND, TASK_REASON, END_REASON, REUSE, ALERT_HINT,
} from '../views/admin.js';

const SESSION_HOURS = 12;
const MAX_WORKSPACES = 8; // ChatGPT: tối đa 8 Project (workspace) / tài khoản — chủ chọn 06/10
const BY = 'web';
const EMAIL_RE = /^[^\s@<>()",;]+@[^\s@<>()",;]+\.[a-z]{2,}$/i;
// Tên đăng nhập cho loại mật khẩu (có hãng dùng username thay vì email).
const USERNAME_RE = /^[^\s|]{3,120}$/;

/** 1 dòng nhập kho → các ô. Có "|" thì chỉ tách theo "|" (mật khẩu có thể chứa dấu phẩy); không thì tab, rồi "," ";". */
function splitLine(line) {
  const sep = line.includes('|') ? '|' : line.includes('\t') ? '\t' : /[,;]/;
  return line.split(sep).map((x) => x.trim());
}

/**
 * Đọc 1 dòng nhập kho theo kiểu đăng nhập của công cụ. → {email, password, totp, max} | {error}
 *  email_code:               email | (bỏ trống) | số khách     — email là hộp thư nhận mã
 *  password:                 email | mật khẩu | số khách
 *  password_totp:            email | mật khẩu | khoá 2FA | số khách
 */
function parseAccountLine(tool, line) {
  const f = splitLine(line);
  const totp = tool.login_type === 'password_totp';
  const pw = tool.login_type === 'password' || totp;
  // Mật khẩu: email|mật khẩu|(2FA)|số khách. Không mật khẩu (mã qua email, Canva nhóm): email|số khách.
  const email = f[0];
  const password = pw ? f[1] : null;
  const max = int(totp ? f[3] : pw ? f[2] : f[1]);
  if (pw ? !USERNAME_RE.test(email || '') : !EMAIL_RE.test(email || '')) return { error: `${email || line}: ${pw ? 'tên đăng nhập' : 'email'} không hợp lệ` };
  if (pw && !password) return { error: `${email}: thiếu mật khẩu` };
  let secret = null;
  if (totp) {
    secret = parseTotpSecret(f[2]);
    if (!secret) return { error: `${email}: khoá 2FA không hợp lệ (cần chuỗi chữ A–Z, số 2–7, hoặc link otpauth://)` };
  }
  return { email, password: password || null, totp: secret, max: max == null || Number.isNaN(max) ? null : max };
}

// ---------- Đăng nhập & bao bọc handler ----------

function auth(rq) {
  const tok = rq.cookies.adm;
  rq.state.admin = tok ? get(rq.ctx.db, 'SELECT * FROM admin_sessions WHERE id = ? AND expires_at > ?', sha256(tok), rq.ctx.now()) || null : null;
  return rq.state.admin;
}

function view(rq, opts) {
  rq.sendHtml(200, adminPage({ csrf: rq.state.admin?.csrf, flash: rq.query.msg, ...opts }));
}

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
  const to = typeof f.back === 'string' && f.back.startsWith('/admin') ? f.back : (r.to || '/admin');
  const base = to.replace(/([?&])msg=[^&]*&?/g, '$1').replace(/[?&]$/, '');
  rq.redirect(r.msg ? `${base}${base.includes('?') ? '&' : '?'}msg=${encodeURIComponent(r.msg)}` : base);
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
const TICKET_ERROR = { invalid: 'vé sai', expired: 'vé cũ', used_elsewhere: 'mở trên máy khác' };
/** Chữ khách thấy trong Cài đặt: phải qua luật Google của QS. */
const PUBLIC_TEXT_SETTINGS = ['eventTitle'];

/** Mã quán trên Quite Sensational (slug trang quán, ví dụ k3x9q); không trùng quán khác. Để trống = null. → {value} | {error} */
function qsSlug(ctx, raw, cafeId = 0) {
  const v = String(raw ?? '').trim().toLowerCase();
  if (!v) return { value: null };
  // Giống ràng buộc slug của QS (db/schema.sql shops_slug_check): chữ không dấu, số, '-', tối đa 63 ký tự.
  if (!QS_SLUG_RE.test(v)) return { error: 'Mã quán QS chỉ gồm chữ thường không dấu, số và dấu "-" (đúng như trong link trang quán trên QS).' };
  const other = get(ctx.db, 'SELECT name FROM cafes WHERE qs_slug = ? COLLATE NOCASE AND id != ?', v, cafeId);
  if (other) return { error: `Mã quán QS "${v}" đang gắn với quán ${other.name}.` };
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

/** Kho mã / link nhận quà (công cụ loại redeem). toolId = null → mọi công cụ redeem. */
function redeemBlock(ctx, csrf, toolId) {
  const tools = all(ctx.db, "SELECT id, name FROM tools WHERE login_type = 'redeem'" + (toolId ? ' AND id = ?' : ''), ...(toolId ? [toolId] : []));
  if (!tools.length) return '';
  const o = off(ctx);
  return tools.map((tool) => {
    const rows = all(ctx.db,
      `SELECT r.*, c.phone FROM redeem_codes r LEFT JOIN slots s ON s.id = r.slot_id LEFT JOIN customers c ON c.id = s.customer_id
       WHERE r.tool_id = ? ORDER BY r.status = 'ready' DESC, r.id DESC LIMIT 200`, tool.id);
    const left = rows.filter((r) => r.status === 'ready').length;
    return html`<h2>${tool.name}: mã / link nhận quà — còn ${left}</h2>
${table(['#', 'Mã / link', 'Trạng thái', 'Giao cho', 'Lúc giao', ''], rows.map((r) => [
  r.id, html`<code>${r.value.length > 60 ? r.value.slice(0, 57) + '…' : r.value}</code>`,
  badge(r.status === 'ready' ? 'Còn' : r.status === 'given' ? 'Đã giao' : 'Đã bỏ', r.status === 'ready' ? 'ok' : r.status === 'given' ? '' : 'yellow'),
  r.phone ? maskPhone(r.phone) : '', t(r.given_at, o),
  r.status === 'ready' ? postButton(`/admin/redeem/${r.id}/void`, 'Bỏ', csrf, { confirm: 'Bỏ mã này (không giao cho ai)?' }) : '',
]), 'Chưa có mã nào. Thêm ở ô "Thêm tài khoản" bên dưới, chọn công cụ này.')}`;
  });
}

function todoTasks(ctx) {
  return all(ctx.db,
    `SELECT r.*, a.login_email, a.status AS account_status, t.name AS tool_name, t.login_type,
            (SELECT c.phone FROM slots s JOIN customers c ON c.id = s.customer_id WHERE s.id = r.slot_id) AS phone
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
    return [seat, w?.name || workspaceName(ctx, seat), w?.url ? html`<a href="${w.url}" target="_blank" rel="noopener noreferrer">mở</a>` : html`<span class="muted">chưa có link</span>`,
      h ? html`<a href="/admin/customers/${get(ctx.db, 'SELECT customer_id FROM slots WHERE id = ?', h.id).customer_id}">${maskPhone(h.phone)}</a> tới ${t(h.expires_at, off(ctx))}${kept.has(seat) ? html` ${badge(`gia hạn ${h.extended_days} ngày — bot giữ Project`, 'ok')}` : ''}` : html`<span class="muted">trống</span>`,
      w ? t(w.updated_at, off(ctx)) : '—'];
  });
  return html`<h2>Workspace (Project) theo thứ tự</h2>
${table(['Chỗ', 'Tên', 'Link', 'Khách', 'Bot tạo lúc'], rows)}
${a.workspace_bot ? html`<p>${task ? html`${badge(`Đang chờ làm mới (${TASK_REASON[task.reason] || task.reason})`, 'yellow')}${task.last_error ? html` <small class="muted">${task.last_error}</small>` : ''}`
    : postButton(`/admin/accounts/${a.id}/reset`, 'Tạo việc làm mới ngay', csrf, { confirm: 'Tạo việc tay: xoá mọi Project + chat (trừ khách gia hạn), đăng xuất mọi thiết bị, tạo lại Project. Khách đang dùng phải chờ hết giờ. Tiếp tục?' })}</p>` : ''}`;
}

function tasksBlock(ctx, list, csrf, back) {
  if (!list.length) return html`<p class="muted">Không có việc tay nào.</p>`;
  return list.map((k) => html`
<div class="acard">
  <div class="acard-head"><b>${TASK_KIND[k.kind] || k.kind}</b> · ${k.tool_name} · <code>${k.login_email}</code>
    <span class="muted">· ${TASK_REASON[k.reason] || k.reason} · ${t(k.created_at, off(ctx))}${k.phone ? ' · khách ' + maskPhone(k.phone) : ''}</span></div>
  ${k.detail ? html`<p>${k.kind === 'invite_member' ? 'Mời email' : k.kind === 'remove_member' ? 'Gỡ email' : 'Ghi chú'}: <code>${k.detail}</code></p>` : ''}
  ${k.kind === 'rotate' && keptSeats(ctx, k.account_id).length ? html`<p>${badge('Giữ lại', 'ok')} Không xoá Project: <b>${keptSeats(ctx, k.account_id).map((x) => workspaceName(ctx, x.seat)).join(', ')}</b> (khách đã gia hạn) — vì vậy đừng bấm "Delete all chats", xoá từng Project / đoạn chat còn lại.</p>` : ''}
  ${k.last_error ? html`<p class="muted">Bot báo lỗi (${k.attempts} lần): ${k.last_error}</p>` : ''}
  <form method="post" action="/admin/tasks/${k.id}/done" class="row">
    ${csrfField(csrf)}<input type="hidden" name="back" value="${back}">
    ${k.kind === 'rotate' && (k.login_type === 'password' || k.login_type === 'password_totp') ? html`<input name="newPassword" placeholder="Mật khẩu mới vừa đổi bên hãng" autocomplete="off"${k.login_type === 'password' ? html` required` : ''}>` : ''}
    ${k.kind === 'rotate' && k.login_type === 'password_totp' ? html`<input name="newTotp" placeholder="Khoá 2FA mới (chỉ khi đổi 2FA)" autocomplete="off">` : ''}
    ${k.kind === 'rotate' && k.login_type === 'password_totp' && k.reason !== 'quarantine' ? html`<label class="muted"><input type="checkbox" name="keepPassword" value="1"> Giữ mật khẩu cũ — chỉ đăng xuất mọi thiết bị</label>` : ''}
    <button class="btn-mini ok">Đã xong</button>
  </form>
</div>`);
}

function alertsTable(ctx, rows) {
  return table(['Lúc', 'Mức', 'Sự kiện', 'Khách', 'Tài khoản / quán', 'Chi tiết'], rows.map((e) => [
    t(e.created_at, off(ctx)), sev(e.severity), EVENT_LABEL[e.type] || e.type,
    e.customer_id ? html`<a href="/admin/customers/${e.customer_id}">${maskPhone(e.phone)}</a>` : '',
    e.login_email || e.cafe_name || '', eventSummary(e.data),
  ]), 'Không có cảnh báo.');
}

function field(label, input, hint = '') {
  return html`<label class="field"><span>${label}</span>${input}${hint ? html`<small>${hint}</small>` : ''}</label>`;
}
const select = (name, options, current) => html`<select name="${name}">${Object.entries(options).map(([v, l]) => html`<option value="${v}"${String(current) === v ? html` selected` : ''}>${l}</option>`)}</select>`;
const checkbox = (name, on) => html`<input type="checkbox" name="${name}" value="1"${on ? html` checked` : ''}>`;

// ---------- Route ----------

export function registerAdminRoutes(router) {
  router.get('/admin/login', (rq) => {
    if (auth(rq)) return rq.redirect('/admin');
    rq.sendHtml(200, adminPage({
      title: 'Đăng nhập', flash: rq.query.msg,
      body: html`<form method="post" action="/admin/login" class="acard login">
        <h1>Quản trị Tiệm Bản Quyền</h1><input type="hidden" name="next" value="${safeNext(rq.query.next)}">
        ${field('Mật khẩu quản trị', html`<input type="password" name="password" autocomplete="current-password" required autofocus>`)}
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
    view(rq, {
      title: 'Tổng quan', active: '/admin',
      body: html`
<h1>Hôm nay</h1>
<div class="tiles">
  ${tile('Lượt vào', `${s.taps} (${s.tapDevices} máy)`)}${tile('Nhận slot', s.claims)}${tile('Đang chạy', s.activeNow)}
  ${tile('Giao mã', s.codesDelivered)}${tile('Mã mồ côi', s.orphans, s.orphans ? 'red' : '')}${tile('Báo đỏ', s.redEvents, s.redEvents ? 'red' : '')}
  ${tile('Việc tay', s.todoTasks, s.todoTasks ? 'yellow' : '')}
</div>
<p class="muted">Kho: ${Object.entries(s.accounts).map(([k, v]) => `${ACCOUNT_STATUS[k] || k} ${v}`).join(' · ') || 'trống'} ·
  <a href="/admin/live">Mở trang theo dõi (tự làm mới, có âm báo)</a></p>
<h2>Quán</h2>
${table(['Quán', 'Lối vào', 'Suất hôm nay', ''], s.perCafe.map((c) => [
  html`<a href="/admin/cafes/${c.id}">${c.name}</a>`, c.qs_slug ? `Trang quán QS: ${c.qs_slug}` : 'Thẻ NFC riêng', `${c.claims}/${c.daily_quota}`,
  html`<a href="/admin/cafes/${c.id}/report">Thống kê</a>`,
]), 'Chưa có quán nào. Vào "Quán" để thêm.')}
<h2>Việc tay</h2>${tasksBlock(ctx, todoTasks(ctx), csrf, '/admin')}
<h2>Cảnh báo 24 giờ</h2>${alertsTable(ctx, recentAlerts(ctx, ctx.now() - DAY, 40))}`,
    });
  }));

  // ----- Trực duyệt -----
  router.get('/admin/live', P((rq) => view(rq, {
    title: 'Theo dõi', active: '/admin/live', live: true,
    body: html`
<div class="live-head"><h1>Theo dõi</h1>
  <button type="button" class="btn-mini" data-act="enable-sound">🔔 Bật âm báo & thông báo</button>
  <span class="muted" data-live-status>Đang tải…</span></div>
<p class="muted">Trang tự làm mới mỗi 10 giây, có âm báo khi có cảnh báo đỏ. Mở sẵn trên điện thoại. Không có ca nào phải duyệt tay: ca vàng làm theo Cài đặt.</p>
<h2>Kho hôm nay</h2><div id="live-stock"></div>
<h2>Việc tay <span data-count="tasks"></span></h2><div id="live-tasks"></div>
<h2>Cảnh báo 2 giờ qua</h2><div id="live-alerts"></div>`,
  })));

  router.get('/admin/api/live', J((rq) => {
    const { ctx } = rq;
    const o = off(ctx);
    return {
      ok: true,
      now: ctx.now(),
      // Kho hôm nay: giao bao nhiêu / giới hạn, còn giao được bao nhiêu — chủ thấy sắp hết để nạp hàng / nâng lượt.
      stock: toolAvailability(ctx).map(({ tool, free, reserved, expiring }) => ({ id: tool.id, name: tool.name, today: toolUsedToday(ctx, tool.id), cap: tool.daily_cap, free, reserved, expiring })),
      tasks: todoTasks(ctx).map((k) => ({
        id: k.id, kind: k.kind, kindText: TASK_KIND[k.kind] || k.kind, tool: k.tool_name, email: k.login_email, detail: k.detail,
        reason: TASK_REASON[k.reason] || k.reason, reasonCode: k.reason, loginType: k.login_type, createdText: t(k.created_at, o), phoneMasked: k.phone ? maskPhone(k.phone) : null,
      })),
      alerts: recentAlerts(ctx, ctx.now() - 2 * HOUR, 60).map((e) => ({
        id: e.id, severity: e.severity, type: e.type, label: EVENT_LABEL[e.type] || e.type, at: e.created_at, atText: t(e.created_at, o),
        phoneMasked: e.phone ? maskPhone(e.phone) : null, customerId: e.customer_id, account: e.login_email, cafe: e.cafe_name, summary: eventSummary(e.data),
        hint: ALERT_HINT[e.type] || null,
      })),
    };
  }));

  router.post('/admin/api/tasks/:id/done', J(async (rq) => {
    const b = await rq.json();
    return completeTask(rq.ctx, id(rq), { by: BY, newPassword: String(b.newPassword || '').trim() || undefined, keepPassword: b.keepPassword === true,
      newTotp: String(b.newTotp || '').trim() || undefined });
  }));

  router.post('/admin/tasks/:id/done', A((rq, f) => {
    const r = completeTask(rq.ctx, id(rq), { by: BY, newPassword: f.newPassword?.trim() || undefined, keepPassword: f.keepPassword === '1', newTotp: f.newTotp?.trim() || undefined });
    return go('/admin/tasks', r.message);
  }));

  // ----- Việc tay -----
  router.get('/admin/tasks', P((rq) => {
    const { ctx } = rq;
    const done = all(ctx.db,
      `SELECT r.*, a.login_email, t.name AS tool_name FROM rotation_tasks r JOIN accounts a ON a.id = r.account_id JOIN tools t ON t.id = a.tool_id
       WHERE r.status != 'todo' ORDER BY r.id DESC LIMIT 50`);
    view(rq, {
      title: 'Việc tay', active: '/admin/tasks',
      body: html`<h1>Việc tay cần làm</h1>
<p class="muted">Đổi mật khẩu: đổi mật khẩu tài khoản, bấm "Đăng xuất khỏi mọi thiết bị" trong cài đặt của hãng, rồi bấm Đã xong.</p>
${tasksBlock(ctx, todoTasks(ctx), rq.state.admin.csrf, '/admin/tasks')}
<h2>Đã xử lý gần đây</h2>
${table(['#', 'Việc', 'Tài khoản', 'Chi tiết', 'Trạng thái', 'Lúc', 'Bởi'], done.map((k) => [
  k.id, TASK_KIND[k.kind] || k.kind, `${k.tool_name} — ${k.login_email}`, k.detail || '', k.status, t(k.done_at, off(ctx)), k.done_by || '',
]))}`,
    });
  }));

  // ----- Quán -----
  // Quán là dữ liệu NỘI BỘ của Tiệm: tên, mã quán trên QS (nếu quán dùng QS), số suất / ngày, thẻ NFC riêng của Tiệm (nếu có).
  // Không xin chủ quán quyền gì, không đặt màn hình / mã quầy. Khách vào bằng 1 trong 2 lối: khối "Công cụ làm việc" trên trang
  // quán của QS (vé, Tài bật ở /gov), hoặc thẻ NFC riêng của Tiệm trên bàn (/c/<mã thẻ>).
  const cafeForm = (c = {}) => html`
    ${field('Tên quán', html`<input name="name" value="${c.name || ''}" required>`)}
    ${field('Địa chỉ', html`<input name="address" value="${c.address || ''}">`)}
    ${field('Mã quán trên Quite Sensational', html`<input name="qs_slug" value="${c.qs_slug || ''}" placeholder="vd: k3x9q" pattern="[a-zA-Z0-9][a-zA-Z0-9\\-]{0,62}">`, 'Phần cuối link trang quán trên QS (quitesensational-review-bio.com/<mã>). Để trống nếu quán chưa dùng QS — khi đó dùng thẻ NFC riêng của Tiệm.')}
    ${field('Số suất mới / ngày', html`<input name="daily_quota" type="number" min="0" value="${c.daily_quota ?? 20}">`)}
    ${field('Giờ bắt đầu', html`<input name="open_hour" type="number" min="0" max="23" value="${c.open_hour ?? ''}">`, 'Để trống cả 2 = 24 giờ')}
    ${field('Giờ kết thúc', html`<input name="close_hour" type="number" min="0" max="23" value="${c.close_hour ?? ''}">`)}`;

  router.get('/admin/cafes', P((rq) => {
    const { ctx } = rq;
    const dayStart = startOfLocalDay(ctx.now(), ctx.settings().timezoneOffsetMin);
    const cafes = all(ctx.db, `SELECT f.*, (SELECT COUNT(*) FROM cards k WHERE k.cafe_id = f.id AND k.kind = 'nfc') AS cards,
      (SELECT COUNT(*) FROM slots s WHERE s.cafe_id = f.id AND s.created_at >= ? AND ${COUNTED}) AS used_today FROM cafes f ORDER BY f.id`, dayStart);
    view(rq, {
      title: 'Quán & thẻ', active: '/admin/cafes',
      body: html`<h1>Quán</h1>
<p class="muted">Hai lối vào, đều do Tiệm lo (không cần chủ quán làm gì):
  <b>trang quán QS</b> — khách chạm thẻ / quét QR của QS → bấm "${QS_EVENT.items[0].label}" → <code>${ctx.config.baseUrl}/qs/&lt;mã quán QS&gt;</code> kèm vé;
  <b>thẻ NFC riêng của Tiệm</b> trên bàn → <code>${ctx.config.baseUrl}/c/&lt;mã thẻ&gt;</code>.</p>
${table(['Quán', 'Mã quán QS', 'Thẻ riêng', 'Hôm nay / suất mỗi ngày', 'Giờ', 'Trạng thái'], cafes.map((c) => [
  html`<a href="/admin/cafes/${c.id}">${c.name}</a> · <a href="/admin/cafes/${c.id}/report">Thống kê</a>`, c.qs_slug || '—', c.cards || '—',
  html`<form method="post" action="/admin/cafes/${c.id}/quota" class="inline">${csrfField(rq.state.admin.csrf)}${c.used_today} /
    <input name="daily_quota" type="number" min="0" value="${c.daily_quota}" class="num-mini" aria-label="Suất mỗi ngày"><button class="btn-mini">Lưu</button></form>`,
  c.open_hour == null ? '24h' : `${c.open_hour}h–${c.close_hour}h`, c.status === 'active' ? 'Đang chạy' : 'Tạm dừng',
]), 'Chưa có quán nào.')}
<h2>Thêm quán</h2>
<form method="post" action="/admin/cafes" class="acard grid">${csrfField(rq.state.admin.csrf)}${cafeForm()}<button class="btn">Thêm quán</button></form>`,
    });
  }));

  router.post('/admin/cafes', A((rq, f) => {
    const { ctx } = rq;
    if (!f.name?.trim()) return go('/admin/cafes', 'Cần nhập tên quán.');
    const slug = qsSlug(ctx, f.qs_slug);
    if (slug.error) return go('/admin/cafes', slug.error);
    // display_token / code_secret: cột cũ (màn hình quầy), không dùng nữa nhưng vẫn bắt buộc trong bảng.
    const cid = run(ctx.db,
      `INSERT INTO cafes(name, address, qs_slug, display_token, code_secret, presence_mode, daily_quota, open_hour, close_hour, created_at)
       VALUES(?, ?, ?, ?, ?, 'none', ?, ?, ?, ?)`,
      f.name.trim(), f.address?.trim() || null, slug.value, randomToken(18), randomToken(24),
      int(f.daily_quota, 20), hourOrNull(f.open_hour), hourOrNull(f.close_hour), ctx.now()).lastInsertRowid;
    return go(`/admin/cafes/${cid}`, slug.value ? 'Đã thêm quán. Nhắn Tài bật sự kiện cho quán này ở /gov của QS.' : 'Đã thêm quán. Tạo thẻ NFC ở dưới rồi ghi link vào chip.');
  }));

  router.get('/admin/cafes/:id', P((rq) => {
    const { ctx } = rq;
    const c = get(ctx.db, 'SELECT * FROM cafes WHERE id = ?', id(rq));
    if (!c) throw new HttpError(404, 'Không có quán này.');
    const csrf = rq.state.admin.csrf;
    const day = ctx.now() - DAY;
    const qs = get(ctx.db,
      `SELECT COUNT(*) AS taps, COUNT(DISTINCT device_id) AS devices, MAX(created_at) AS last FROM taps
       WHERE cafe_id = ? AND verdict = 'ok' AND created_at > ?`, c.id, day);
    const bad = all(ctx.db,
      "SELECT json_extract(data, '$.error') AS error, COUNT(*) AS n FROM events WHERE type = 'ticket_rejected' AND cafe_id = ? AND created_at > ? GROUP BY 1", c.id, day);
    const back = `/admin/cafes/${c.id}`;
    const cards = all(ctx.db,
      `SELECT k.*, (SELECT MAX(created_at) FROM taps WHERE card_id = k.id) AS last_tap,
              (SELECT COUNT(*) FROM taps WHERE card_id = k.id AND created_at > ?) AS taps_24h,
              (SELECT COUNT(*) FROM taps WHERE card_id = k.id AND verdict IN ('replay', 'forged') AND created_at > ?) AS bad_24h
       FROM cards k WHERE k.cafe_id = ? AND k.kind = 'nfc' ORDER BY k.id`, day, day, c.id);
    view(rq, {
      title: c.name, active: '/admin/cafes',
      body: html`<h1>${c.name}</h1>
<p><a class="btn-mini" href="/admin/cafes/${c.id}/report">📊 Thống kê quán (nội bộ)</a></p>
${c.qs_slug ? '' : html`<div class="acard"><p>Quán chưa dùng QS: khách vào bằng <b>thẻ NFC riêng của Tiệm</b> (tạo thẻ ở dưới). Lượt vào 24 giờ qua: <b>${qs.taps}</b> (${qs.devices} máy) · Lần cuối: ${t(qs.last, off(ctx))}.
  Quán dùng QS thì điền "Mã quán trên Quite Sensational" ở form dưới.</p></div>`}
<div class="acard"${c.qs_slug ? '' : ' hidden'}>
  <h2>Nối với trang quán (Quite Sensational — tính năng của Tài)</h2>
  <p>Khách chạm thẻ / quét QR trên bàn → trang quán trên QS → khối "${QS_EVENT.title}" → bấm "${QS_EVENT.items[0].label}" → sang
    <code class="break">${ctx.config.baseUrl}/qs/${c.qs_slug || '<mã quán>'}</code> kèm vé (nút "${QS_EVENT.items[1].label}" → trang giới thiệu Tiệm).
    Vé chứng minh khách vừa mở trang quán bằng thẻ / QR trên bàn; link trang quán lan trên mạng không có vé nên không nhận được.</p>
  <p>Mã quán trên QS: ${c.qs_slug ? html`<b>${c.qs_slug}</b>` : 'chưa dùng QS'} · Lượt vào 24 giờ qua (cả 2 lối): <b>${qs.taps}</b> (${qs.devices} máy) · Lần cuối: ${t(qs.last, off(ctx))}</p>
  <p class="muted">Link bị từ chối 24 giờ qua: ${bad.length ? bad.map((b) => `${TICKET_ERROR[b.error] || b.error} ${b.n}`).join(' · ') : 'không có'}.
    Nhiều "vé sai" → kiểm tra QS_TICKET_KEY (TBQ) có trùng NFC_EVENT_TBQ_KEY (QS) không.</p>
  <p class="muted">Bên QS: Tài bấm "Mở" ở cột Sự kiện cho quán này trong /gov. Quán không phải làm gì. Xem docs/phoi-hop-voi-QS.md.</p>
</div>
<form method="post" action="/admin/cafes/${c.id}" class="acard grid">${csrfField(csrf)}
  ${cafeForm(c)}
  ${field('Trạng thái', select('status', { active: 'Đang chạy', paused: 'Tạm dừng' }, c.status))}
  <button class="btn">Lưu</button></form>
<h2>Thẻ NFC riêng của Tiệm (${cards.length})</h2>
<p class="muted">Dùng cho quán chưa có QS (quán có QS thì thẻ / QR của QS đã đủ). Ghi link vào chip NTAG213/215/216 bằng app NFC Tools
  hoặc NXP TagWriter (bản ghi URL). <b>Nên bật "UID + counter mirror"</b> và thêm <code>?m=</code> vào cuối link: mỗi lần chạm, chip gửi kèm
  bộ đếm → link bị chụp / chép mang về nhà không dùng lại được. Chưa bật thì ai có link là mở được (chỉ còn giới hạn ${ctx.settings().cardDailyClaims} suất / thẻ / ngày).
  <a href="/admin/cafes/${c.id}/cards.csv">Tải CSV tất cả link</a></p>
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
  <h3>Tạo thẻ hàng loạt</h3>
  ${field('Số thẻ', html`<input name="count" type="number" min="1" max="100" value="10">`)}
  ${field('Tiền tố nhãn', html`<input name="prefix" value="Bàn">`)}
  ${field('Bắt đầu từ số', html`<input name="start" type="number" min="1" value="${cards.length + 1}">`)}
  <button class="btn">Tạo thẻ</button></form>`,
    });
  }));

  router.post('/admin/cafes/:id/quota', A((rq, f) => {
    const q = Math.max(0, int(f.daily_quota, 20));
    run(rq.ctx.db, 'UPDATE cafes SET daily_quota = ? WHERE id = ?', q, id(rq));
    logEvent(rq.ctx, { type: 'settings_saved', cafeId: id(rq), data: { daily_quota: q, by: BY } });
    return go('/admin/cafes', `Đã đặt ${q} suất / ngày.`);
  }));

  router.post('/admin/cafes/:id', A((rq, f) => {
    const { ctx } = rq;
    const slug = qsSlug(ctx, f.qs_slug, id(rq));
    if (slug.error) return go(`/admin/cafes/${id(rq)}`, slug.error);
    run(ctx.db,
      'UPDATE cafes SET name = ?, address = ?, qs_slug = ?, daily_quota = ?, open_hour = ?, close_hour = ?, status = ? WHERE id = ?',
      f.name?.trim() || 'Quán', f.address?.trim() || null, slug.value, int(f.daily_quota, 20),
      hourOrNull(f.open_hour), hourOrNull(f.close_hour), f.status === 'paused' ? 'paused' : 'active', id(rq));
    return go(`/admin/cafes/${id(rq)}`, 'Đã lưu.');
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
      title: `Thống kê — ${r.cafe.name}`, active: '/admin/cafes',
      body: html`<h1>Thống kê: ${r.cafe.name}</h1>
<p class="row noprint">${range.options.map(([k, label]) => (k === range.key ? badge(label, 'ok') : html`<a class="btn-mini" href="?range=${k}">${label}</a>`))}
  <a class="btn-mini" href="/admin/cafes/${r.cafe.id}/report.csv?range=${range.key}">Tải CSV theo ngày</a>
  <a class="btn-mini" href="/admin/cafes/${r.cafe.id}">← Về trang quán</a></p>
<p class="muted">${range.label}: ${dm(r.byDay[0].day)} – ${dm(r.byDay.at(-1).day)}. Số liệu nội bộ của Tiệm (chỉ có số đếm, không có số điện thoại hay thông tin cá nhân) — để biết quán nào kéo được khách.</p>
<div class="tiles">
  ${tile('Lượt vào', r.taps)}${tile('Máy khác nhau', r.tapDevices)}
  ${tile('Lượt dùng thử', r.trials)}${tile('Khách khác nhau', r.customers)}
  ${tile('Khách quay lại', `${r.returning} (${pct(r.returning, r.customers)})`)}
  ${tile('Bấm "Mua qua Zalo"', r.zaloClicks)}
  ${tile('Ngày hết suất', `${r.fullDays}/${r.byDay.length}`, r.fullDays ? 'yellow' : '')}
  ${tile('Báo đỏ tại quán', r.redAlerts, r.redAlerts ? 'red' : '')}
</div>
${r.fullDays ? html`<p class="muted">Có ${r.fullDays} ngày hết suất (đang để ${r.cafe.daily_quota} suất/ngày) → khách đến sau không nhận được. Cân nhắc tăng "Số suất mới / ngày" nếu kho còn tài khoản.</p>` : ''}
<p class="muted">Khách quay lại = đã dùng thử ở quán này vào một ngày trước đó. Bấm "Mua qua Zalo" = bấm nút mua sau khi hết lượt (mỗi máy tính 1 lần/ngày), chưa phải đơn đã chốt.</p>
<h2>Theo công cụ</h2>
${table(['Công cụ', 'Lượt dùng thử', 'Tỉ lệ'], r.byTool.map((x) => [x.name, x.n, pct(x.n, r.trials)]), 'Chưa có lượt dùng thử.')}
<h2>Theo giờ trong ngày</h2>
${r.trials ? table(['Giờ', 'Lượt dùng thử', ''], r.byHour.map((n, h) => [
  `${String(h).padStart(2, '0')}:00–${String(h).padStart(2, '0')}:59`, n, html`<progress class="hbar" max="${maxHour}" value="${n}"></progress>`,
])) : html`<p class="muted">Chưa có lượt dùng thử.</p>`}
<h2>Theo lối vào</h2>
${table(['Lối vào', 'Lượt vào', 'Lượt dùng thử', 'Trạng thái'], r.byCard.map((k) => [
  k.kind === 'qs' ? 'Trang quán (QS)' : `Thẻ NFC: ${k.label || '#' + k.id}`, k.taps, k.trials,
  k.status === 'active' ? '' : badge('Đang khoá', 'red'),
]), 'Chưa có lối vào nào.')}
<h2>Theo ngày</h2>
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
    const bots = all(ctx.db, "SELECT key, value, updated_at FROM kv WHERE key LIKE 'worker:%' ORDER BY updated_at DESC");
    const teams = all(ctx.db,
      `SELECT a.*, t.name AS tool_name,
        (SELECT COUNT(*) FROM slots s WHERE s.account_id = a.id AND s.status = 'active') AS using_n,
        (SELECT COUNT(*) FROM slots s WHERE s.account_id = a.id AND s.status = 'pending_invite') AS waiting_n
       FROM accounts a JOIN tools t ON t.id = a.tool_id WHERE t.login_type = 'team_invite' ORDER BY a.id`);
    // Mỗi khách Canva 1 dòng: slot + việc bot mới nhất của slot đó.
    const rows = all(ctx.db,
      `SELECT s.*, c.phone, a.login_email AS team_email, f.name AS cafe_name,
        r.id AS task_id, r.kind AS task_kind, r.status AS task_status, r.attempts, r.last_error, r.done_by, r.done_at, r.alerted_at
       FROM slots s JOIN tools t ON t.id = s.tool_id JOIN customers c ON c.id = s.customer_id
       LEFT JOIN accounts a ON a.id = s.account_id LEFT JOIN cafes f ON f.id = s.cafe_id
       LEFT JOIN rotation_tasks r ON r.id = (SELECT MAX(id) FROM rotation_tasks WHERE slot_id = s.id AND kind IN ('invite_member', 'remove_member'))
       WHERE t.login_type = 'team_invite' AND s.status != 'rejected' ORDER BY s.id DESC LIMIT 200`);
    const stateOf = (x) => {
      if (x.status === 'pending_invite') return x.alerted_at ? '🔴 Chờ mời — bot chưa làm được' : '⏳ Chờ bot mời';
      if (x.status === 'active') return '🟢 Đang dùng';
      if (x.task_kind === 'remove_member' && x.task_status === 'todo') return x.alerted_at ? '🔴 Hết hạn — bot chưa gỡ được' : '⏳ Hết hạn — chờ bot gỡ';
      if (x.task_kind === 'remove_member' && x.task_status === 'done') return '⚪ Đã gỡ khỏi nhóm';
      return `⚪ ${SLOT_STATUS[x.status] || x.status}`;
    };
    const live = (b) => now - b.updated_at < 2 * MIN;
    const csrf = rq.state.admin.csrf;
    view(rq, {
      title: 'Canva', active: '/admin/canva',
      body: html`<h1>Canva — mời vào nhóm</h1>
<h2>Bot trên máy Mac</h2>
${bots.length ? table(['Bot', 'Trạng thái', 'Lần cuối liên lạc'], bots.map((b) => [b.key.slice(7), live(b) ? '🟢 Đang chạy' : '🔴 Tắt / mất kết nối', t(b.updated_at, o)]))
    : html`<p class="warn">Chưa có bot nào kết nối. Trên máy Mac: <code>npm run canva-bot</code> (xem README mục Canva).</p>`}
<h2>Nhóm Canva (trong Kho tài khoản)</h2>
${tools.length ? '' : html`<p class="warn">Chưa có công cụ kiểu "Mời vào nhóm". Chạy <code>npm run pilot</code> hoặc thêm ở trang Công cụ.</p>`}
${table(['Email chủ nhóm', 'Ghế', 'Đang dùng', 'Chờ mời', 'Còn trống', 'Trạng thái'], teams.map((a) => [
  html`<a href="/admin/accounts/${a.id}">${a.login_email}</a>`, a.max_holders, a.using_n, a.waiting_n, Math.max(0, a.max_holders - a.using_n - a.waiting_n),
  ACCOUNT_STATUS[a.status] || a.status,
]), 'Chưa nhập nhóm nào. Vào Kho tài khoản → chọn Canva Pro → dán: email chủ nhóm|số ghế.')}
<h2>Khách Canva</h2>
${table(['#', 'Khách', 'Email Canva của khách', 'Quán', 'Nhóm', 'Trạng thái', 'Mời lúc', 'Hết hạn', 'Bot', ''], rows.map((x) => [
  html`<a href="/admin/slots?id=${x.id}">${x.id}</a>`, html`<a href="/admin/customers/${x.customer_id}">${maskPhone(x.phone)}</a>`,
  html`<code>${x.invite_email || ''}</code>`, x.cafe_name || '', x.team_email || '', stateOf(x), t(x.started_at, o), t(x.expires_at, o),
  x.task_id ? html`${x.task_status === 'done' ? `xong (${x.done_by || ''})` : `${x.attempts} lần thử`}${x.last_error ? html`<br><small class="muted">${x.last_error}</small>` : ''}` : '',
  x.task_id && x.task_status === 'todo' ? html`<form method="post" action="/admin/tasks/${x.task_id}/done" class="inline">${csrfField(csrf)}<input type="hidden" name="back" value="/admin/canva">
    <button class="btn-mini ok" title="Bạn đã tự làm trên Canva">${x.task_kind === 'invite_member' ? 'Đã mời tay' : 'Đã gỡ tay'}</button></form>
    ${x.attempts ? html`<form method="post" action="/admin/canva/tasks/${x.task_id}/retry" class="inline">${csrfField(csrf)}<button class="btn-mini">Cho bot thử lại</button></form>` : ''}` : '',
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
    view(rq, {
      title: 'Công cụ', active: '/admin/tools',
      body: html`<h1>Công cụ</h1>
<p><a class="btn-mini" href="/admin/tools/new">+ Thêm công cụ</a></p>
${table(['Thứ tự', 'Công cụ', 'Slug', 'Đăng nhập', 'Thời gian', 'Hôm nay / lượt mỗi ngày', 'Chờ nhận lại', 'Tối đa/khách', 'Kho', 'Còn giao được', 'Bật'], tools.map((x) => [
  x.sort, html`<a href="/admin/tools/${x.id}">${x.name}</a>`, x.slug, LOGIN_TYPE[x.login_type] || x.login_type,
  x.end_hour != null ? `tới ${x.end_hour}h sáng` : x.slot_hours % 24 === 0 ? `${x.slot_hours / 24} ngày` : `${x.slot_hours} giờ`,
  html`<form method="post" action="/admin/tools/${x.id}/cap" class="inline">${csrfField(rq.state.admin.csrf)}${toolUsedToday(ctx, x.id)} /
    <input name="daily_cap" type="number" min="0" value="${x.daily_cap ?? ''}" placeholder="∞" class="num-mini" aria-label="Lượt tối đa mỗi ngày"><button class="btn-mini">Lưu</button></form>`,
  `${x.cooldown_days} ngày`, x.lifetime_cap, x.login_type === 'redeem' ? `${redeemLeft.get(x.id) || 0} mã` : html`${counts.get(x.id) || 0}${stale.get(x.id) ? html` <small class="muted">(${stale.get(x.id)} nhập quá ${x.slot_hours % 24 === 0 ? `${x.slot_hours / 24} ngày` : `${x.slot_hours} giờ`}, hết Pro — không giao)</small>` : ''}`, html`${avail.get(x.id)?.free ?? 0}${avail.get(x.id)?.reserved ? html` <small class="muted">(+${avail.get(x.id).reserved} dự phòng cho ${x.end_hour ?? 6}h sáng)</small>` : ''}`, x.enabled ? '✓' : '—',
]), 'Chưa có công cụ.')}`,
    });
  }));

  router.get('/admin/tools/:id', P((rq) => {
    const { ctx } = rq;
    const isNew = rq.params.id === 'new';
    const x = isNew ? { slot_hours: 24, cooldown_days: 30, lifetime_cap: 2, rotation_required: 1, enabled: 1, sort: 0, login_type: 'email_code', reuse: 'rotate', holders_default: 1 } : get(ctx.db, 'SELECT * FROM tools WHERE id = ?', id(rq));
    if (!x) throw new HttpError(404, 'Không có công cụ này.');
    view(rq, {
      title: isNew ? 'Thêm công cụ' : x.name, active: '/admin/tools',
      body: html`<h1>${isNew ? 'Thêm công cụ' : x.name}</h1>
<form method="post" action="/admin/tools/${isNew ? 'new' : x.id}" class="acard grid">${csrfField(rq.state.admin.csrf)}
  ${field('Tên hiển thị', html`<input name="name" value="${x.name || ''}" required>`)}
  ${field('Slug', html`<input name="slug" value="${x.slug || ''}" pattern="[a-z0-9-]+" required>`, `Chữ thường, không dấu. Có mẫu thư mặc định cho: ${Object.keys(DEFAULT_TOOL_PATTERNS).join(', ')}`)}
  ${field('Cách đăng nhập', select('login_type', LOGIN_TYPE, x.login_type), 'Mời vào nhóm (Canva): khách nhập email tài khoản của họ; nhập kho mỗi dòng = 1 nhóm: email chủ nhóm|số ghế.')}
  ${field('Link trang đăng nhập', html`<input name="login_url" value="${x.login_url || ''}" type="url">`)}
  ${field('Hướng dẫn cho khách', html`<textarea name="instructions" rows="4">${x.instructions || ''}</textarea>`, 'Mỗi dòng 1 ý.')}
  ${field('Mẫu người gửi thư mã (regex)', html`<input name="sender_pattern" value="${x.sender_pattern ?? ''}">`, 'Để trống = dùng mẫu mặc định theo slug. Nhập "-" = không kiểm tra người gửi.')}
  ${field('Regex bóc mã (tuỳ chọn)', html`<input name="code_regex" value="${x.code_regex || ''}">`, 'Có 1 nhóm bắt, ví dụ: code is (\\d{6}). Để trống = tự tìm dãy 6 số.')}
  ${field('Số giờ dùng', html`<input name="slot_hours" type="number" min="1" value="${x.slot_hours}">`, '24 = 1 ngày, 168 = 7 ngày.')}
  ${field('Số khách / tài khoản (mặc định khi nhập kho)', html`<input name="holders_default" type="number" min="1" value="${x.holders_default ?? 1}">`, 'Vd. ChatGPT 5, CapCut 2, Adobe 2. Dòng nhập kho ghi số khác thì theo dòng đó. Nhiều khách → mỗi khách nhận "Slot 1, 2…".')}
  ${field('Hết lượt thì', select('reuse', REUSE, x.reuse || 'rotate'))}
  ${field('Hết lượt lúc (giờ VN)', html`<input name="end_hour" type="number" min="0" max="23" value="${x.end_hour ?? ''}" placeholder="trống = đủ thời gian ở trên">`, 'Vd. 6 = ai nhận lúc nào trong ngày cũng dùng tới 6h sáng hôm sau, 6h bạn đăng xuất mọi thiết bị (ChatGPT, Claude).')}
  ${field('Tài khoản tự hết sau (ngày, kể từ lúc nhập kho)', html`<input name="account_days" type="number" min="1" value="${x.account_days ?? ''}" placeholder="trống = không tự hết">`, 'Vd. 7 cho Claude / CapCut / Adobe dùng thử: quá hạn không giao, khách không được hứa quá ngày tài khoản hết.')}
  ${field('Lượt tối đa / ngày (cả hệ thống)', html`<input name="daily_cap" type="number" min="0" value="${x.daily_cap ?? ''}">`, 'Để trống = không giới hạn (chỉ giới hạn theo kho).')}
  ${field('Chờ bao nhiêu ngày mới nhận lại', html`<input name="cooldown_days" type="number" min="0" value="${x.cooldown_days}">`)}
  ${field('Tối đa số lần / khách', html`<input name="lifetime_cap" type="number" min="1" value="${x.lifetime_cap}">`)}
  ${field('Thứ tự', html`<input name="sort" type="number" value="${x.sort}">`)}
  <label class="check">${checkbox('rotation_required', x.rotation_required)} Hết hạn thì tạo việc đổi mật khẩu + đăng xuất</label>
  <label class="check">${checkbox('auto_worker', x.auto_worker)} Mời vào nhóm: bot trên máy của Tiệm tự mời / gỡ (scripts/canva-bot.js). Bot chưa làm xong sau vài phút → trang Theo dõi báo bạn làm tay</label>
  <label class="check">${checkbox('mail_code', x.mail_code)} Loại mật khẩu: hãng hay gửi mã qua email khi đăng nhập (vd. Adobe) → khách có nút "Lấy mã"</label>
  <label class="check">${checkbox('reserve_account', x.reserve_account)} Giữ 1 tài khoản dự phòng: trong ngày không giao; lúc các tài khoản khác chờ "Đăng xuất mọi thiết bị" (6h sáng) thì mới giao — khách sáng sớm không gặp "Tạm hết". Cần ít nhất 2 tài khoản</label>
  <label class="check">${checkbox('voucher_code', x.voucher_code)} Cần mã phiếu khi lấy mã đăng nhập (mã 2FA / mã email): có email tài khoản mà không có mã phiếu (phát ở quán) thì không lấy được mã. Tạo mã ở trang Mã phiếu</label>
  <label class="check">${checkbox('workspace_bot', x.workspace_bot)} Làm mới mỗi ngày giữ chỗ cho khách gia hạn: việc "làm mới" (xoá Project + chat, đăng xuất mọi thiết bị, tạo lại Project "Slot 1…N", tối đa 8) được tạo khi chỉ còn khách đã gia hạn — chủ làm tay ở trang Việc tay, giữ Project của khách gia hạn</label>
  <label class="check">${checkbox('high_value', x.high_value)} Công cụ giá trị cao (cộng điểm rủi ro giờ cao điểm)</label>
  <label class="check">${checkbox('enabled', x.enabled)} Đang bật</label>
  <button class="btn">Lưu</button></form>`,
    });
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
    const slug = String(f.slug || '').trim().toLowerCase();
    if (!/^[a-z0-9-]+$/.test(slug) || !f.name?.trim()) return go('/admin/tools', 'Cần tên và slug hợp lệ.');
    let sender = String(f.sender_pattern ?? '').trim();
    sender = sender === '' ? null : sender === '-' ? '' : sender;
    for (const r of [sender, f.code_regex]) {
      if (r) { try { new RegExp(r); } catch { return go('/admin/tools', `Regex không hợp lệ: ${r}`); } }
    }
    // Tên và hướng dẫn hiện trên trang khách → cùng luật Google với Quite Sensational (kiểm từng dòng như khách đọc).
    for (const line of [f.name, ...String(f.instructions || '').split(/\r?\n/)]) {
      const problem = freeTextProblem(line);
      if (problem) return go('/admin/tools', `Không lưu: "${String(line).trim().slice(0, 80)}" ${POLICY_MESSAGE[problem]}.`);
    }
    const p = {
      slug, name: f.name.trim(), login_type: LOGIN_TYPE[f.login_type] ? f.login_type : 'email_code', login_url: f.login_url?.trim() || null,
      instructions: f.instructions?.trim() || null, sender_pattern: sender, code_regex: f.code_regex?.trim() || null,
      slot_hours: Math.max(1, int(f.slot_hours, 24)), cooldown_days: Math.max(0, int(f.cooldown_days, 30)), lifetime_cap: Math.max(1, int(f.lifetime_cap, 2)),
      rotation_required: f.rotation_required === '1', high_value: f.high_value === '1', enabled: f.enabled === '1', sort: int(f.sort, 0),
      reuse: f.reuse === 'once' ? 'once' : 'rotate', mail_code: f.mail_code === '1', auto_worker: f.auto_worker === '1', end_hour: hourOrNull(f.end_hour),
      account_days: int(f.account_days) > 0 ? int(f.account_days) : null,
      daily_cap: int(f.daily_cap) == null || Number.isNaN(int(f.daily_cap)) ? null : Math.max(0, int(f.daily_cap)),
      holders_default: Math.max(1, int(f.holders_default, 1)), reserve_account: f.reserve_account === '1',
      voucher_code: f.voucher_code === '1', workspace_bot: f.workspace_bot === '1',
    };
    if (p.workspace_bot) p.holders_default = Math.min(MAX_WORKSPACES, p.holders_default);
    try {
      if (rq.params.id === 'new') {
        run(ctx.db, `INSERT INTO tools(slug, name, login_type, login_url, instructions, sender_pattern, code_regex, slot_hours, cooldown_days, lifetime_cap, rotation_required, high_value, enabled, sort, reuse, mail_code, daily_cap, holders_default, auto_worker, end_hour, account_days, reserve_account, voucher_code, workspace_bot)
          VALUES(:slug, :name, :login_type, :login_url, :instructions, :sender_pattern, :code_regex, :slot_hours, :cooldown_days, :lifetime_cap, :rotation_required, :high_value, :enabled, :sort, :reuse, :mail_code, :daily_cap, :holders_default, :auto_worker, :end_hour, :account_days, :reserve_account, :voucher_code, :workspace_bot)`, p);
      } else {
        run(ctx.db, `UPDATE tools SET slug = :slug, name = :name, login_type = :login_type, login_url = :login_url, instructions = :instructions,
          sender_pattern = :sender_pattern, code_regex = :code_regex, slot_hours = :slot_hours, cooldown_days = :cooldown_days, lifetime_cap = :lifetime_cap,
          rotation_required = :rotation_required, high_value = :high_value, enabled = :enabled, sort = :sort, reuse = :reuse, mail_code = :mail_code,
          daily_cap = :daily_cap, holders_default = :holders_default, auto_worker = :auto_worker, end_hour = :end_hour, account_days = :account_days,
          reserve_account = :reserve_account, voucher_code = :voucher_code, workspace_bot = :workspace_bot WHERE id = :id`, { ...p, id: id(rq) });
      }
    } catch (e) {
      return go('/admin/tools', /UNIQUE/.test(String(e)) ? 'Slug đã tồn tại.' : `Lỗi: ${e.message}`);
    }
    return go('/admin/tools', 'Đã lưu công cụ.');
  }));

  // ----- Kho tài khoản -----
  router.get('/admin/accounts', P((rq) => {
    const { ctx } = rq;
    const csrf = rq.state.admin.csrf;
    const tools = all(ctx.db, 'SELECT * FROM tools ORDER BY sort, id');
    const where = [];
    const params = {};
    if (rq.query.tool) { where.push('a.tool_id = :tool'); params.tool = Number(rq.query.tool); }
    if (rq.query.status) { where.push('a.status = :status'); params.status = rq.query.status; }
    const rows = all(ctx.db,
      `SELECT a.*, t.name AS tool_name, ${USABLE_SQL} AS usable FROM accounts a JOIN tools t ON t.id = a.tool_id
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY t.sort, a.id LIMIT 500`, params);
    const toolOpts = Object.fromEntries(tools.map((x) => [String(x.id), `${x.name} (${LOGIN_TYPE[x.login_type]})`]));
    // Form nhập: chỉ công cụ đang bật, chọn sẵn công cụ đang lọc (dán xong CapCut rồi dán Adobe không bị rơi nhầm vào công cụ đầu danh sách).
    const importOpts = Object.fromEntries(tools.filter((x) => x.enabled).map((x) => [String(x.id), toolOpts[String(x.id)]]));
    view(rq, {
      title: 'Kho tài khoản', active: '/admin/accounts',
      body: html`<h1>Kho tài khoản</h1>
<form method="get" class="row">${select('tool', { '': 'Mọi công cụ', ...toolOpts }, rq.query.tool || '')}${select('status', { '': 'Mọi trạng thái', ...ACCOUNT_STATUS }, rq.query.status || '')}<button class="btn-mini">Lọc</button></form>
${redeemBlock(ctx, csrf, rq.query.tool ? Number(rq.query.tool) : null)}
${table(['#', 'Công cụ', 'Nhãn', 'Email / tên đăng nhập', 'Trạng thái', 'Đang dùng', 'Giao lần cuối', 'Đổi MK lần cuối'], rows.map((a) => [
  html`<a href="/admin/accounts/${a.id}">${a.id}</a>`, html`${a.tool_name}${a.totp_enc ? html` <small class="muted">· 2FA</small>` : ''}`, a.label || '', html`<code>${a.login_email}</code>`,
  html`${badge(ACCOUNT_STATUS[a.status] || a.status, a.status === 'ready' ? 'ok' : a.status === 'quarantined' ? 'red' : 'yellow')}${a.status_reason ? html` <small class="muted">${a.status_reason}</small>` : ''}${a.usable ? '' : html` ${badge('Thiếu mật khẩu / 2FA — không giao', 'red')}`}`,
  `${accountLoad(ctx, a.id)}/${a.max_holders}`, t(a.last_assigned_at, off(ctx)), t(a.last_rotated_at, off(ctx)),
]), 'Kho trống.')}
<h2>Thêm tài khoản</h2>
<form method="post" action="/admin/accounts" class="acard grid">${csrfField(csrf)}
  ${field('Công cụ', select('tool_id', importOpts, importOpts[rq.query.tool] ? rq.query.tool : ''))}
  ${field('Nhãn chung (tuỳ chọn)', html`<input name="label">`)}
  <label class="check">${checkbox('setup', true)} Công cụ có "làm mới mỗi ngày": chờ bạn tạo sẵn Project "${ctx.settings().workspacePrefix} 1…N" rồi mới giao (bỏ tick nếu bạn đã tự tạo)</label>
  <div class="wide">${field('Danh sách', html`<textarea name="lines" rows="8" placeholder="Mật khẩu + 2FA (ChatGPT):  email|mật khẩu|khoá 2FA&#10;Mật khẩu (CapCut, Adobe):  email|mật khẩu&#10;Mã qua email (Claude):      email&#10;Nhóm Canva:                 email chủ nhóm|số ghế&#10;Mã / link nhận quà (Gemini): mỗi dòng 1 mã hoặc 1 link https&#10;(Thêm |số ở cuối dòng nếu muốn khác số khách mặc định của công cụ)"></textarea>`,
    html`Mỗi dòng 1 tài khoản, các ô cách nhau bằng <code>|</code>. Số cuối dòng = số khách dùng chung (bỏ trống = theo cài đặt của công cụ). Khoá 2FA: chuỗi chữ hoặc link <code>otpauth://</code> — chỉ lưu trên máy chủ, khách chỉ thấy mã 6 số.`)}</div>
  <button class="btn">Thêm vào kho</button></form>`,
    });
  }));

  router.post('/admin/accounts', A((rq, f) => {
    const { ctx } = rq;
    const tool = get(ctx.db, 'SELECT * FROM tools WHERE id = ?', Number(f.tool_id) || 0);
    if (!tool) return go('/admin/accounts', 'Chọn công cụ.');
    const lines = String(f.lines || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    let added = 0;
    const errors = [];
    if (tool.login_type === 'redeem') {
      // Mỗi dòng 1 mã hoặc 1 link nhận quà (dùng 1 lần).
      tx(ctx.db, () => {
        for (const value of lines) {
          if (value.length > 500 || /\s/.test(value)) { errors.push(`${value.slice(0, 40)}: không hợp lệ (1 mã / 1 link mỗi dòng)`); continue; }
          if (/^http:\/\//i.test(value)) { errors.push(`${value.slice(0, 40)}: link phải là https://`); continue; }
          const r = run(ctx.db, "INSERT OR IGNORE INTO redeem_codes(tool_id, value, label, status, created_at) VALUES(?, ?, ?, 'ready', ?)",
            tool.id, value, f.label?.trim() || null, ctx.now());
          if (r.changes) added++; else errors.push(`${value.slice(0, 40)}: đã có trong kho`);
        }
      });
      logEvent(ctx, { type: 'redeem_imported', data: { tool: tool.slug, added, by: BY } });
      return go(`/admin/accounts?tool=${tool.id}`, `Đã thêm ${added} mã / link.${errors.length ? ' Bỏ qua: ' + errors.slice(0, 5).join('; ') : ''}`);
    }
    tx(ctx.db, () => {
      for (const line of lines) {
        const a = parseAccountLine(tool, line);
        if (a.error) { errors.push(a.error); continue; }
        if (get(ctx.db, 'SELECT 1 FROM accounts WHERE login_email = ?', a.email)) { errors.push(`${a.email}: đã có trong kho`); continue; }
        // Bot ChatGPT tạo Project "Slot 1…N" trước khi giao (ô tick khi nhập kho) → tài khoản chờ bot, xong mới sẵn sàng.
        const setup = !!tool.workspace_bot && f.setup === '1';
        let max = Math.max(1, a.max ?? tool.holders_default ?? 1);
        if (tool.workspace_bot) max = Math.min(MAX_WORKSPACES, max);
        const accountId = run(ctx.db, 'INSERT INTO accounts(tool_id, label, login_email, password_enc, totp_enc, max_holders, status, status_reason, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)',
          tool.id, f.label?.trim() || null, a.email.toLowerCase(), a.password ? encrypt(a.password, ctx.config.dataKey) : null,
          a.totp ? encrypt(a.totp, ctx.config.dataKey) : null, max, setup ? 'needs_rotation' : 'ready', setup ? 'Chờ bot tạo Project' : null, ctx.now()).lastInsertRowid;
        if (setup) createTask(ctx, { accountId, slotId: null, kind: 'rotate', reason: 'setup', detail: null });
        added++;
      }
    });
    logEvent(ctx, { type: 'accounts_imported', data: { tool: tool.slug, added, by: BY } });
    return go(`/admin/accounts?tool=${tool.id}`, `Đã thêm ${added} tài khoản.${errors.length ? ' Bỏ qua: ' + errors.slice(0, 5).join('; ') : ''}`);
  }));

  router.get('/admin/accounts/:id', P((rq) => {
    const { ctx } = rq;
    const a = get(ctx.db, 'SELECT a.*, t.name AS tool_name, t.login_type, t.workspace_bot FROM accounts a JOIN tools t ON t.id = a.tool_id WHERE a.id = ?', id(rq));
    if (!a) throw new HttpError(404, 'Không có tài khoản này.');
    const csrf = rq.state.admin.csrf;
    const slots = all(ctx.db, `SELECT s.*, c.phone FROM slots s JOIN customers c ON c.id = s.customer_id WHERE s.account_id = ? ORDER BY s.id DESC LIMIT 30`, a.id);
    const mails = all(ctx.db, 'SELECT * FROM mails WHERE account_id = ? ORDER BY id DESC LIMIT 20', a.id);
    view(rq, {
      title: a.login_email, active: '/admin/accounts',
      body: html`<h1>${a.tool_name} — <code>${a.login_email}</code></h1>
<p>${badge(ACCOUNT_STATUS[a.status] || a.status)} ${a.status_reason || ''} · Đang dùng ${accountLoad(ctx, a.id)}/${a.max_holders}</p>
<form method="post" action="/admin/accounts/${a.id}" class="acard grid">${csrfField(csrf)}
  ${field('Nhãn', html`<input name="label" value="${a.label || ''}">`)}
  ${field('Số người dùng cùng lúc', html`<input name="max_holders" type="number" min="1"${a.workspace_bot ? html` max="${MAX_WORKSPACES}"` : ''} value="${a.max_holders}">`, a.workspace_bot ? `Tối đa ${MAX_WORKSPACES} Project (workspace).` : '')}
  ${field('Trạng thái', select('status', ACCOUNT_STATUS, a.status), 'Chuyển về "Sẵn sàng" chỉ khi đã đổi mật khẩu và đăng xuất mọi thiết bị.')}
  ${a.login_type === 'password' || a.login_type === 'password_totp' ? field('Mật khẩu mới', html`<input name="password" autocomplete="off" placeholder="Để trống = giữ nguyên">`) : ''}
  ${a.login_type === 'password_totp' ? field('Khoá 2FA mới', html`<input name="totp" autocomplete="off" placeholder="${a.totp_enc ? 'Đã có — để trống = giữ nguyên' : 'Chưa có khoá 2FA!'}">`, 'Khi đổi 2FA trên trang của hãng, dán khoá mới vào đây.') : ''}
  <button class="btn">Lưu</button></form>
${workspacesBlock(ctx, a, csrf)}
${a.status !== 'quarantined' ? postButton(`/admin/accounts/${a.id}/quarantine`, 'Cách ly ngay (thu hồi slot đang chạy)', csrf, { cls: 'btn-mini danger', confirm: 'Cách ly tài khoản và thu hồi mọi slot đang chạy?' }) : ''}
<h2>Lịch sử giao</h2>
${table(['Slot', 'Chỗ', 'Khách', 'Trạng thái', 'Bắt đầu', 'Kết thúc', 'Lý do'], slots.map((s) => [
  s.id, s.seat ? `Slot ${s.seat}` : '', html`<a href="/admin/customers/${s.customer_id}">${maskPhone(s.phone)}</a>`, SLOT_STATUS[s.status] || s.status, t(s.started_at, off(ctx)), t(s.ended_at, off(ctx)), END_REASON[s.end_reason] || s.end_reason || '',
]))}
<h2>Thư gần đây</h2>
${table(['Lúc', 'Tiêu đề', 'Loại', 'Kết quả'], mails.map((m) => [t(m.received_at, off(ctx)), html`<a href="/admin/mails/${m.id}">${m.subject || '(không tiêu đề)'}</a>`, m.kind, m.verdict || '']))}`,
    });
  }));

  router.post('/admin/accounts/:id', A((rq, f) => {
    const { ctx } = rq;
    const status = ACCOUNT_STATUS[f.status] ? f.status : 'ready';
    const wsBot = get(ctx.db, 'SELECT t.workspace_bot FROM accounts a JOIN tools t ON t.id = a.tool_id WHERE a.id = ?', id(rq))?.workspace_bot;
    const max = Math.max(1, int(f.max_holders, 1));
    run(ctx.db, 'UPDATE accounts SET label = ?, max_holders = ?, status = ?, status_reason = CASE WHEN ? = status THEN status_reason ELSE ? END WHERE id = ?',
      f.label?.trim() || null, wsBot ? Math.min(MAX_WORKSPACES, max) : max, status, status, `Đổi tay bởi ${BY}`, id(rq));
    if (f.password?.trim()) run(ctx.db, 'UPDATE accounts SET password_enc = ?, last_rotated_at = ? WHERE id = ?', encrypt(f.password.trim(), ctx.config.dataKey), ctx.now(), id(rq));
    if (f.totp?.trim()) {
      const secret = parseTotpSecret(f.totp);
      if (!secret) return go(`/admin/accounts/${id(rq)}`, 'Khoá 2FA không hợp lệ — các mục khác đã lưu.');
      run(ctx.db, 'UPDATE accounts SET totp_enc = ? WHERE id = ?', encrypt(secret, ctx.config.dataKey), id(rq));
    }
    logEvent(ctx, { type: 'account_updated', accountId: id(rq), data: { status, by: BY } });
    return go(`/admin/accounts/${id(rq)}`, 'Đã lưu.');
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
    } else {
      rows = all(ctx.db, 'SELECT * FROM customers ORDER BY id DESC LIMIT 50');
    }
    view(rq, {
      title: 'Khách', active: '/admin/customers',
      body: html`<h1>Khách</h1>
<form method="get" class="row"><input name="q" value="${q}" placeholder="Email, SĐT hoặc 3 số cuối"><button class="btn-mini">Tìm</button></form>
${table(['#', 'Email / SĐT', 'Trạng thái', 'Vi phạm', 'Điểm rủi ro', 'Tham gia'], rows.map((c) => [
  html`<a href="/admin/customers/${c.id}">${c.id}</a>`, html`<a href="/admin/customers/${c.id}">${c.phone.startsWith('del:') ? '(đã xoá dữ liệu)' : displayPhone(c.phone)}</a>`,
  c.status === 'locked' ? badge(c.locked_until ? `Khoá đến ${t(c.locked_until, off(ctx))}` : 'Khoá vĩnh viễn', 'red') : badge('Bình thường', 'ok'),
  c.strikes, customerRisk(ctx, c), t(c.created_at, off(ctx)),
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
    const events = all(ctx.db, 'SELECT * FROM events WHERE customer_id = ? ORDER BY id DESC LIMIT 100', c.id);
    view(rq, {
      title: displayPhone(c.phone), active: '/admin/customers',
      body: html`<h1>${c.phone.startsWith('del:') ? '(đã xoá dữ liệu)' : displayPhone(c.phone)}</h1>
<p>${c.status === 'locked' ? badge(`Khoá ${c.locked_until ? 'đến ' + t(c.locked_until, off(ctx)) : 'vĩnh viễn'}: ${c.lock_reason || ''}`, 'red') : badge('Bình thường', 'ok')}
  · Vi phạm: ${c.strikes} · Điểm rủi ro: ${customerRisk(ctx, c)} · Đồng ý điều khoản ${c.consent_version} lúc ${t(c.consent_at, off(ctx))}</p>
<div class="row wrap">
  ${c.status === 'locked'
    ? postButton(`/admin/customers/${c.id}/unlock`, 'Mở khoá', csrf, { cls: 'btn-mini ok' })
    : html`<form method="post" action="/admin/customers/${c.id}/lock" class="inline" data-confirm="Khoá khách này và thu hồi slot?">${csrfField(csrf)}
        <input name="days" type="number" min="1" placeholder="Số ngày (trống = vĩnh viễn)"><input name="reason" placeholder="Lý do"><button class="btn-mini danger">Khoá</button></form>`}
  <form method="post" action="/admin/customers/${c.id}/strike" class="inline" data-confirm="Ghi 1 vi phạm? (lần 2 khoá 7 ngày, lần 3 khoá vĩnh viễn)">${csrfField(csrf)}<input name="reason" placeholder="Lý do vi phạm"><button class="btn-mini">Ghi vi phạm</button></form>
  ${postButton(`/admin/customers/${c.id}/risk-reset`, 'Xoá điểm rủi ro', csrf)}
  ${postButton(`/admin/customers/${c.id}/erase`, 'Xoá dữ liệu cá nhân', csrf, { cls: 'btn-mini danger', confirm: 'Xoá email / SĐT và dữ liệu cá nhân của khách này? Không hoàn tác được.' })}
</div>
<form method="post" action="/admin/customers/${c.id}/note" class="acard">${csrfField(csrf)}
  ${field('Ghi chú nội bộ', html`<textarea name="note" rows="2">${c.note || ''}</textarea>`)}<button class="btn-mini">Lưu ghi chú</button></form>
<h2>Slot</h2>
${table(['#', 'Công cụ', 'Tài khoản', 'Quán', 'Trạng thái', 'Điểm', 'Tạo', 'Hết hạn / kết thúc', ''], slots.map((s) => [
  s.id, s.tool_name, s.login_email || '', `${s.cafe_name || ''}${s.card_label ? ' — ' + s.card_label : ''}`,
  html`${SLOT_STATUS[s.status] || s.status}${s.end_reason ? html` <small class="muted">${END_REASON[s.end_reason] || s.end_reason}</small>` : ''}`, s.risk_score,
  t(s.created_at, off(ctx)), t(s.ended_at || s.expires_at, off(ctx)),
  s.status === 'active' ? postButton(`/admin/slots/${s.id}/revoke`, 'Thu hồi', csrf, { confirm: 'Thu hồi slot này?', fields: { back } }) : '',
]))}
<h2>Thiết bị</h2>
${table(['Mã máy', 'Trạng thái', 'Điểm', 'Khách khác', 'Lần đầu', 'Lần cuối', ''], devices.map((d) => [
  html`<code>${d.id.slice(0, 10)}…</code>`, d.status, d.risk, d.others, t(d.first_seen_at, off(ctx)), t(d.last_seen_at, off(ctx)),
  d.status === 'locked' ? postButton(`/admin/devices/${d.id}/unlock`, 'Mở', csrf, { fields: { back } }) : postButton(`/admin/devices/${d.id}/lock`, 'Khoá máy', csrf, { fields: { back } }),
]))}
<h2>Nhật ký</h2>
${table(['Lúc', 'Mức', 'Sự kiện', 'Chi tiết', 'IP'], events.map((e) => [t(e.created_at, off(ctx)), sev(e.severity), EVENT_LABEL[e.type] || e.type, eventSummary(e.data), e.ip || '']))}`,
    });
  }));

  router.post('/admin/customers/:id/lock', A((rq, f) => {
    const days = int(f.days);
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
    const rows = all(ctx.db,
      `SELECT v.*, c.phone, f.name AS cafe_name FROM vouchers v LEFT JOIN customers c ON c.id = v.customer_id LEFT JOIN cafes f ON f.id = v.cafe_id
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY v.id DESC LIMIT 300`, params);
    const batches = all(ctx.db,
      `SELECT batch, kind, MIN(days) AS days, MIN(note) AS note, MIN(created_at) AS created_at, COUNT(*) AS n,
              SUM(status = 'used') AS used, SUM(uses > 0) AS touched, SUM(status = 'void') AS voided
       FROM vouchers GROUP BY batch ORDER BY MIN(id) DESC LIMIT 30`);
    const needTools = tools.filter((x) => x.voucher_code);
    const kindLabel = (v) => (v.kind === 'extend' ? `${VOUCHER_KINDS.extend} ${v.days} ngày` : VOUCHER_KINDS[v.kind]);
    view(rq, {
      title: 'Mã phiếu', active: '/admin/vouchers',
      body: html`<h1>Mã phiếu</h1>
<p class="muted">Khách cần <b>mã phiếu</b> mới lấy được mã đăng nhập của ${needTools.length ? needTools.map((x) => x.name).join(', ') : html`<b>công cụ nào bật "Cần mã phiếu"</b> (chưa có — bật ở trang Công cụ)`}.
Có email tài khoản mà không có mã phiếu thì không lấy được mã. Phiếu phát ở quán; mã gia hạn gửi khách qua Zalo khi khách mua thêm ngày.</p>
<form method="post" action="/admin/vouchers" class="acard grid">${csrfField(csrf)}
  <h3>Tạo lô mã</h3>
  ${field('Loại', select('kind', { once: 'Lấy mã 1 lần (phát ở quán)', forever: 'Lấy mã vĩnh viễn (gắn khách đầu tiên dùng)', extend: 'Gia hạn (dùng thêm N ngày, 1 lần)' }, 'once'))}
  ${field('Số mã', html`<input name="count" type="number" min="1" max="500" value="20" required>`)}
  ${field('Số ngày gia hạn', html`<input name="days" type="number" min="1" max="30" value="1">`, 'Chỉ dùng cho loại Gia hạn.')}
  ${field('Hạn dùng mã (ngày)', html`<input name="expiresDays" type="number" min="1" max="3650" placeholder="trống = không hết hạn">`)}
  ${field('Quán', select('cafeId', { '': 'Mọi quán', ...Object.fromEntries(cafes.map((c) => [String(c.id), c.name])) }, ''), 'Chọn quán = phiếu chỉ dùng cho khách nhận slot ở quán đó.')}
  ${field('Ghi chú', html`<input name="note" maxlength="200" placeholder="vd. Phiếu quán A tuần 41">`)}
  <div class="wide"><span>Dùng cho công cụ (không tick = mọi công cụ):</span>
    ${tools.map((x) => html`<label class="check"><input type="checkbox" name="tool_${x.slug}" value="1"> ${x.name}</label>`)}</div>
  <button class="btn">Tạo mã</button></form>
<h2>Các lô</h2>
${table(['Lô', 'Loại', 'Ghi chú', 'Tạo lúc', 'Số mã', 'Đã dùng', 'Huỷ', ''], batches.map((b) => [
  html`<a href="/admin/vouchers?batch=${b.batch}">${b.batch}</a>`, b.kind === 'extend' ? `Gia hạn ${b.days} ngày` : VOUCHER_KINDS[b.kind], b.note || '', t(b.created_at, o),
  b.n, b.kind === 'forever' ? `${b.touched} đã gắn` : b.used, b.voided || '',
  html`<a class="btn-mini" href="/admin/vouchers/in?batch=${b.batch}" target="_blank">In phiếu</a> <a class="btn-mini" href="/admin/vouchers.csv?batch=${b.batch}">CSV</a>`,
]), 'Chưa tạo mã nào.')}
<h2>Mã${rq.query.batch ? ` trong lô ${rq.query.batch}` : ' gần đây'}</h2>
<form method="get" class="row"><input name="q" value="${rq.query.q || ''}" placeholder="Tìm mã">
  ${select('kind', { '': 'Mọi loại', ...VOUCHER_KINDS }, rq.query.kind || '')}
  ${select('status', { '': 'Mọi trạng thái', active: 'Còn dùng được', used: 'Đã dùng', void: 'Đã huỷ' }, rq.query.status || '')}
  ${rq.query.batch ? html`<input type="hidden" name="batch" value="${rq.query.batch}">` : ''}<button class="btn-mini">Lọc</button></form>
${table(['Mã', 'Loại', 'Công cụ', 'Quán', 'Đã dùng', 'Gắn khách', 'Trạng thái', 'Hết hạn', 'Dùng lần cuối', ''], rows.map((v) => [
  html`<code>${formatCode(v.code)}</code>`, kindLabel(v), v.tools || 'mọi', v.cafe_name || 'mọi',
  `${v.uses}${v.max_uses != null ? `/${v.max_uses}` : ''}`, v.phone ? maskPhone(v.phone) : '',
  badge(v.status === 'active' ? (v.expires_at && v.expires_at <= ctx.now() ? 'Hết hạn' : 'Còn dùng') : v.status === 'used' ? 'Đã dùng' : 'Đã huỷ',
    v.status === 'active' && !(v.expires_at && v.expires_at <= ctx.now()) ? 'ok' : v.status === 'void' ? 'red' : ''),
  t(v.expires_at, o), t(v.last_used_at, o),
  html`${v.status === 'active' ? postButton(`/admin/vouchers/${v.id}/void`, 'Huỷ', csrf, { confirm: 'Huỷ mã này? Khách giữ phiếu sẽ không dùng được.' }) : ''}
    ${v.kind === 'forever' && v.customer_id ? postButton(`/admin/vouchers/${v.id}/unbind`, 'Gỡ khách', csrf, { confirm: 'Gỡ SĐT khỏi mã? Người dùng tiếp theo sẽ gắn vào.' }) : ''}`,
]), 'Không có mã nào.')}`,
    });
  }));

  router.post('/admin/vouchers', A((rq, f) => {
    const { ctx } = rq;
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
    const rows = all(ctx.db, "SELECT * FROM vouchers WHERE batch = ? AND status = 'active' ORDER BY id", String(rq.query.batch || ''));
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
  <p>${v.kind === 'extend' ? 'Nhập ở ô "Dùng thêm" trên trang slot của bạn.' : 'Nhập ở ô "Mã phiếu" khi bấm Lấy mã trên trang slot của bạn.'}</p>
  ${v.expires_at ? html`<p class="muted">Dùng trước ${t(v.expires_at, o)}</p>` : ''}
</div>`)}</div></body></html>`);
  }));

  router.get('/admin/vouchers.csv', P((rq) => {
    const { ctx } = rq;
    const batch = String(rq.query.batch || '');
    const rows = all(ctx.db, 'SELECT * FROM vouchers WHERE batch = ? ORDER BY id', batch);
    const csv = csvFile([['Mã', 'Loại', 'Số ngày', 'Công cụ', 'Trạng thái', 'Đã dùng', 'Hết hạn'],
      ...rows.map((v) => [formatCode(v.code), VOUCHER_KINDS[v.kind], v.days ?? '', v.tools || 'mọi', v.status, v.uses, t(v.expires_at, off(ctx))])]);
    rq.send(200, csv, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="ma-phieu-${batch.replace(/[^\w-]/g, '')}.csv"` });
  }));

  router.post('/admin/vouchers/:id/void', A((rq) => go('/admin/vouchers', voidVoucher(rq.ctx, id(rq), BY) ? 'Đã huỷ mã.' : 'Mã đã dùng hết hoặc đã huỷ.')));
  router.post('/admin/vouchers/:id/unbind', A((rq) => go('/admin/vouchers', unbindVoucher(rq.ctx, id(rq), BY) ? 'Đã gỡ khách khỏi mã.' : 'Mã chưa gắn khách nào.')));

  // ----- Gia hạn -----
  router.get('/admin/gia-han', P((rq) => {
    const { ctx } = rq;
    const csrf = rq.state.admin.csrf;
    const o = off(ctx);
    const reqs = all(ctx.db,
      `SELECT r.*, s.expires_at, s.extended_days, s.seat, c.phone, t.name AS tool_name, a.login_email FROM extend_requests r
       JOIN slots s ON s.id = r.slot_id JOIN customers c ON c.id = r.customer_id JOIN tools t ON t.id = s.tool_id LEFT JOIN accounts a ON a.id = s.account_id
       WHERE r.status = 'pending' ORDER BY r.id`);
    const live = all(ctx.db,
      `SELECT s.*, c.phone, t.name AS tool_name, a.login_email FROM slots s JOIN customers c ON c.id = s.customer_id JOIN tools t ON t.id = s.tool_id
       LEFT JOIN accounts a ON a.id = s.account_id WHERE s.status = 'active' AND t.login_type != 'redeem' ORDER BY s.expires_at LIMIT 300`);
    const extendForm = (slotId, days) => html`<form method="post" action="/admin/gia-han/${slotId}" class="inline">${csrfField(csrf)}
      <input name="days" type="number" min="1" max="30" value="${days}" class="num-mini" aria-label="Số ngày"><button class="btn-mini ok">Gia hạn</button></form>`;
    view(rq, {
      title: 'Gia hạn', active: '/admin/gia-han',
      body: html`<h1>Gia hạn (khách dùng thêm)</h1>
<p class="muted">Khách xin dùng thêm trên trang slot → hiện ở đây. Nhận tiền qua Zalo rồi bấm <b>Gia hạn</b> (trang khách tự cập nhật).
Hoặc tạo <a href="/admin/vouchers">mã gia hạn</a> gửi khách tự nhập. Khách đã gia hạn: lấy mã không cần mã phiếu / không cần ở quán;
6h sáng bot vẫn làm mới tài khoản nhưng giữ Project của khách, khách đăng nhập lại. Tối đa ${ctx.settings().maxExtendDays} ngày tính từ hôm nay, không quá hạn tài khoản.</p>
<h2>Yêu cầu đang chờ (${reqs.length})</h2>
${table(['Lúc', 'Khách', 'Công cụ', 'Tài khoản / chỗ', 'Đang hết lúc', 'Xin thêm', ''], reqs.map((r) => [
  t(r.created_at, o), html`<a href="/admin/customers/${r.customer_id}">${maskPhone(r.phone)}</a>`, r.tool_name,
  html`${r.login_email || ''}${r.seat ? ` · ${workspaceName(ctx, r.seat)}` : ''}`, t(r.expires_at, o), `${r.days} ngày`,
  html`${extendForm(r.slot_id, r.days)} ${postButton(`/admin/gia-han/req/${r.id}/decline`, 'Bỏ qua', csrf)}`,
]), 'Không có yêu cầu nào.')}
<h2>Slot đang chạy</h2>
${table(['#', 'Khách', 'Công cụ', 'Tài khoản / chỗ', 'Hết lúc', 'Đã gia hạn', ''], live.map((s) => [
  s.id, html`<a href="/admin/customers/${s.customer_id}">${maskPhone(s.phone)}</a>`, s.tool_name,
  html`${s.login_email || ''}${s.seat ? ` · ${workspaceName(ctx, s.seat)}` : ''}`, t(s.expires_at, o), s.extended_days ? `${s.extended_days} ngày` : '',
  extendForm(s.id, 1),
]), 'Không có slot nào đang chạy.')}`,
    });
  }));

  router.post('/admin/gia-han/:id', A((rq, f) => {
    const r = extendSlot(rq.ctx, id(rq), { days: int(f.days, 1), by: BY });
    return go('/admin/gia-han', r.message);
  }));

  router.post('/admin/gia-han/req/:id/decline', A((rq) => {
    const { ctx } = rq;
    const r = run(ctx.db, "UPDATE extend_requests SET status = 'declined', done_at = ?, done_by = ? WHERE id = ? AND status = 'pending'", ctx.now(), BY, id(rq));
    if (r.changes) logEvent(ctx, { type: 'extend_declined', data: { requestId: id(rq), by: BY } });
    return go('/admin/gia-han', r.changes ? 'Đã bỏ qua yêu cầu.' : 'Yêu cầu đã xử lý rồi.');
  }));

  // ----- Slot -----
  router.get('/admin/slots', P((rq) => {
    const { ctx } = rq;
    const csrf = rq.state.admin.csrf;
    const q = (where, limit) => all(ctx.db,
      `SELECT s.*, c.phone, t.name AS tool_name, a.login_email, f.name AS cafe_name, k.label AS card_label FROM slots s
       JOIN customers c ON c.id = s.customer_id JOIN tools t ON t.id = s.tool_id LEFT JOIN accounts a ON a.id = s.account_id
       LEFT JOIN cafes f ON f.id = s.cafe_id LEFT JOIN cards k ON k.id = s.card_id WHERE ${where} ORDER BY s.id DESC LIMIT ${limit}`);
    const row = (s) => [
      s.id, html`<a href="/admin/customers/${s.customer_id}">${maskPhone(s.phone)}</a>`, s.tool_name, s.login_email || '',
      `${s.cafe_name || ''}${s.card_label ? ' — ' + s.card_label : ''}`, html`${SLOT_STATUS[s.status] || s.status}${s.end_reason ? html` <small class="muted">${END_REASON[s.end_reason] || s.end_reason}</small>` : ''}`,
      t(s.started_at || s.created_at, off(ctx)), t(s.ended_at || s.expires_at, off(ctx)), s.code_requests,
    ];
    const live = q("s.status = 'active'", 300);
    view(rq, {
      title: 'Slot', active: '/admin/slots',
      body: html`<h1>Slot đang chạy (${live.length})</h1>
${table(['#', 'Khách', 'Công cụ', 'Tài khoản', 'Quán', 'Trạng thái', 'Bắt đầu', 'Hết hạn', 'Lấy mã', ''], live.map((s) => [...row(s), html`
  ${postButton(`/admin/slots/${s.id}/revoke`, 'Thu hồi', csrf, { confirm: 'Thu hồi slot này?' })}`]), 'Không có slot nào đang chạy.')}
<h2>Kết thúc gần đây</h2>
${table(['#', 'Khách', 'Công cụ', 'Tài khoản', 'Quán', 'Trạng thái', 'Bắt đầu', 'Kết thúc', 'Lấy mã'], q("s.status IN ('expired', 'revoked', 'rejected')", 100).map(row))}`,
    });
  }));
  router.post('/admin/slots/:id/revoke', A((rq) => {
    const r = revokeSlot(rq.ctx, id(rq), 'admin_revoked', BY);
    return go('/admin/slots', r.ok ? 'Đã thu hồi slot.' : 'Slot không còn chạy.');
  }));

  // ----- Thư -----
  router.get('/admin/mails', P((rq) => {
    const { ctx } = rq;
    const where = rq.query.kind ? 'WHERE m.kind = :kind' : '';
    const mails = all(ctx.db, `SELECT m.*, a.login_email FROM mails m LEFT JOIN accounts a ON a.id = m.account_id ${where} ORDER BY m.id DESC LIMIT 150`,
      rq.query.kind ? { kind: rq.query.kind } : {});
    const kinds = { '': 'Mọi loại', login_code: 'Mã đăng nhập', security_alert: 'Cảnh báo bảo mật', password_reset: 'Đặt lại mật khẩu', magic_link: 'Link đăng nhập', new_signin: 'Đăng nhập mới', billing: 'Hoá đơn', other: 'Khác', unknown_recipient: 'Lạ người nhận' };
    view(rq, {
      title: 'Thư', active: '/admin/mails',
      body: html`<h1>Thư về hộp thư kho</h1>
<p class="muted">Webhook: <code>POST ${ctx.config.baseUrl}/hooks/mail</code> (ký HMAC-SHA256 header X-Signature). Nội dung thư tự xoá sau ${ctx.settings().retentionMailBodyHours} giờ.</p>
<form method="get" class="row">${select('kind', kinds, rq.query.kind || '')}<button class="btn-mini">Lọc</button></form>
${table(['Lúc', 'Tới', 'Từ', 'Tiêu đề', 'Loại', 'Kết quả'], mails.map((m) => [
  t(m.received_at, off(ctx)), m.login_email || m.to_addr || '', m.from_addr || '', html`<a href="/admin/mails/${m.id}">${m.subject || '(không tiêu đề)'}</a>`,
  kinds[m.kind] || m.kind, m.verdict === 'orphan' ? badge('mồ côi', 'red') : m.verdict === 'parse_failed' ? badge('không đọc được mã', 'yellow') : (m.verdict || ''),
]), 'Chưa có thư nào.')}`,
    });
  }));

  router.get('/admin/mails/:id', P((rq) => {
    const { ctx } = rq;
    const m = get(ctx.db, 'SELECT m.*, a.login_email FROM mails m LEFT JOIN accounts a ON a.id = m.account_id WHERE m.id = ?', id(rq));
    if (!m) throw new HttpError(404, 'Không có thư này.');
    const waiting = m.account_id ? get(ctx.db, "SELECT w.*, c.phone FROM code_windows w JOIN customers c ON c.id = w.customer_id WHERE w.account_id = ? AND w.status IN ('open', 'delivered') AND w.expires_at + 60000 >= ? ORDER BY w.id DESC LIMIT 1", m.account_id, ctx.now()) : null;
    view(rq, {
      title: m.subject || 'Thư', active: '/admin/mails',
      body: html`<h1>${m.subject || '(không tiêu đề)'}</h1>
<p>Tới <code>${m.login_email || m.to_addr}</code> · từ <code>${m.from_addr}</code> · ${t(m.received_at, off(ctx))} · loại <b>${m.kind}</b> · kết quả <b>${m.verdict || ''}</b></p>
${waiting ? html`<form method="post" action="/admin/mails/${m.id}/deliver" class="acard row">${csrfField(rq.state.admin.csrf)}
  <span>Khách ${maskPhone(waiting.phone)} đang chờ mã (lượt #${waiting.id}). Đọc mã trong thư rồi gửi:</span>
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
    const rows = all(ctx.db,
      `SELECT e.*, c.phone, a.login_email, f.name AS cafe_name FROM events e LEFT JOIN customers c ON c.id = e.customer_id
       LEFT JOIN accounts a ON a.id = e.account_id LEFT JOIN cafes f ON f.id = e.cafe_id
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY e.id DESC LIMIT 300`, params);
    view(rq, {
      title: 'Nhật ký', active: '/admin/events',
      body: html`<h1>Nhật ký</h1>
<form method="get" class="row">${select('sev', { '': 'Mọi mức', red: 'Đỏ', yellow: 'Vàng', info: 'Thông tin' }, rq.query.sev || '')}
  ${select('type', { '': 'Mọi sự kiện', ...EVENT_LABEL }, rq.query.type || '')}<button class="btn-mini">Lọc</button></form>
${table(['Lúc', 'Mức', 'Sự kiện', 'Khách', 'Tài khoản / quán', 'Chi tiết', 'IP'], rows.map((e) => [
  t(e.created_at, off(ctx)), sev(e.severity), EVENT_LABEL[e.type] || e.type,
  e.customer_id ? html`<a href="/admin/customers/${e.customer_id}">${maskPhone(e.phone)}</a>` : '', e.login_email || e.cafe_name || '', eventSummary(e.data), e.ip || '',
]))}`,
    });
  }));

  // ----- Cài đặt -----
  router.get('/admin/settings', P((rq) => {
    const { ctx } = rq;
    const s = ctx.settings();
    view(rq, {
      title: 'Cài đặt', active: '/admin/settings',
      body: html`<h1>Cài đặt</h1>
<form method="post" action="/admin/settings" class="acard grid">${csrfField(rq.state.admin.csrf)}
  ${Object.entries(SETTING_DEFS).map(([k, [def, label]]) => field(label, html`<input name="${k}" value="${s[k] ?? ''}">`, `${k} · mặc định: ${def ?? '(trống)'}`))}
  <button class="btn">Lưu cài đặt</button></form>`,
    });
  }));

  router.post('/admin/settings', A((rq, f) => {
    const { ctx } = rq;
    const errors = [];
    for (const k of Object.keys(SETTING_DEFS)) {
      if (!(k in f)) continue;
      const v = String(f[k]).trim();
      const problem = PUBLIC_TEXT_SETTINGS.includes(k) ? freeTextProblem(v) : null;
      if (problem) { errors.push(`${k}: ${POLICY_MESSAGE[problem]}`); continue; }
      try { saveSetting(ctx.db, k, v); } catch (e) { errors.push(e.message); }
    }
    ctx.settings.invalidate();
    logEvent(ctx, { type: 'settings_saved', data: { by: BY, errors: errors.length } });
    return go('/admin/settings', errors.length ? `Đã lưu, trừ: ${errors.join('; ')}` : 'Đã lưu cài đặt.');
  }));
}
