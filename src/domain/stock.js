// Kho tài khoản: kho chung cho mọi quán + kho riêng từng quán (accounts.cafe_id, chủ chọn 08/10): nhập, sửa, xem. Trang quản trị (Kho tài khoản) và API kho cho QS (/hooks/qs/kho,
// docs/phoi-hop-voi-QS.md mục 11) cùng gọi các hàm ở đây, để hai nơi hiểu một dòng / một tài khoản giống hệt nhau.
// Mật khẩu và khoá 2FA chỉ đi VÀO kho (mã hoá AES-GCM), không hàm nào ở đây trả chúng ra.
import { get, all, run, tx } from '../db/index.js';
import { encrypt } from '../lib/crypto.js';
import { parseTotpSecret } from '../lib/totp.js';
import { logEvent } from '../lib/events.js';
import { DAY } from '../lib/time.js';
import { createTask, completeTask, blockingHolders } from './claims.js';
import { accountLoad, toolAvailability, toolUsedToday, poolSeats, USABLE_SQL } from './quota.js';
import { quarantineAccount } from './mail.js';

export const MAX_WORKSPACES = 8; // ChatGPT: tối đa 8 Project (workspace) / tài khoản — chủ chọn 06/10
const EMAIL_RE = /^[^\s@<>()",;]+@[^\s@<>()",;]+\.[a-z]{2,}$/i;
// Tên đăng nhập cho loại mật khẩu (có hãng dùng username thay vì email).
const USERNAME_RE = /^[^\s|]{3,120}$/;
export const ACCOUNT_STATUSES = ['ready', 'needs_rotation', 'quarantined', 'retired'];

const toInt = (v) => (v === undefined || v === null || String(v).trim() === '' ? null : Number.parseInt(v, 10));
const usesPassword = (tool) => tool.login_type === 'password' || tool.login_type === 'password_totp';

/** 1 dòng nhập kho → các ô. Có "|" thì chỉ tách theo "|" (mật khẩu có thể chứa dấu phẩy); không thì tab, rồi "," ";". */
function splitLine(line) {
  const sep = line.includes('|') ? '|' : line.includes('\t') ? '\t' : /[,;]/;
  return line.split(sep).map((x) => x.trim());
}

/**
 * Kiểm 1 tài khoản theo kiểu đăng nhập của công cụ. → {email, password, totp, max} | {email, code, message}
 *  email_code / team_invite: email (+ số khách / số ghế) — email là hộp thư nhận mã
 *  password:                 tên đăng nhập + mật khẩu
 *  password_totp:            tên đăng nhập + mật khẩu + khoá 2FA
 */
export function validateAccount(tool, { email, password, totp, holders }) {
  email = String(email ?? '').trim();
  const pw = usesPassword(tool);
  const max = toInt(holders);
  if (pw ? !USERNAME_RE.test(email) : !EMAIL_RE.test(email)) return { email, code: 'bad_email', message: pw ? 'tên đăng nhập không hợp lệ' : 'email không hợp lệ' };
  password = pw ? String(password ?? '').trim() : '';
  if (pw && !password) return { email, code: 'no_password', message: 'thiếu mật khẩu' };
  if (pw && password.length > 200) return { email, code: 'bad_password', message: 'mật khẩu quá dài' };
  let secret = null;
  if (tool.login_type === 'password_totp') {
    secret = parseTotpSecret(String(totp ?? ''));
    if (!secret) return { email, code: 'bad_totp', message: 'khoá 2FA không hợp lệ (cần chuỗi chữ A–Z, số 2–7, hoặc link otpauth://)' };
  }
  if (max != null && (!Number.isFinite(max) || max < 1 || max > 50)) return { email, code: 'bad_holders', message: 'số khách dùng chung phải từ 1 đến 50' };
  return { email, password: password || null, totp: secret, max };
}

/** Đọc 1 dòng nhập kho (dán từ Google Sheet / ô "Danh sách"): email|mật khẩu|2FA|số khách tuỳ kiểu đăng nhập. */
export function parseAccountLine(tool, line) {
  const f = splitLine(line);
  const pw = usesPassword(tool);
  const totp = tool.login_type === 'password_totp';
  const r = validateAccount(tool, { email: f[0], password: pw ? f[1] : null, totp: totp ? f[2] : null, holders: totp ? f[3] : pw ? f[2] : f[1] });
  if (r.code && !r.email) r.email = line.slice(0, 60);
  // Dán cả cột mật khẩu từ Google Sheet cho món chỉ cần email (đăng nhập bằng mã) → nói rõ thay vì "số khách phải từ 1 đến 50".
  if (r.code === 'bad_holders' && !pw && tool.login_type !== 'team_invite' && !/^\d+$/.test(f[1] ?? '')) {
    return { email: r.email, code: 'extra_column', message: 'món này chỉ cần email (đăng nhập bằng mã) — bỏ cột mật khẩu' };
  }
  return r;
}

/**
 * Kho của 1 quán: mã quán (số) / mã quán QS → quán | null (kho chung). Trống / "chung" = kho chung. → {ok, cafe} | {ok:false, message}
 */
export function resolveKho(ctx, value, { byShop = false } = {}) {
  const v = String(value ?? '').trim().toLowerCase();
  if (!v || v === 'chung' || v === '0') return { ok: true, cafe: null };
  const cafe = byShop ? get(ctx.db, 'SELECT * FROM cafes WHERE qs_slug = ? COLLATE NOCASE', v) : get(ctx.db, 'SELECT * FROM cafes WHERE id = ?', Number.parseInt(v, 10) || 0);
  return cafe ? { ok: true, cafe } : { ok: false, message: byShop ? `Không có quán QS "${v}" trong TBQ.` : 'Không có quán này.' };
}

/**
 * Thêm tài khoản vào kho. items: [{email, password, totp, max}] đã qua validateAccount / parseAccountLine (mục có `code` = lỗi, bỏ qua).
 * cafeId: kho riêng của quán (chỉ giao cho khách ở quán đó); null = kho chung.
 * setup: công cụ "làm mới mỗi ngày" → tài khoản chờ chủ / bot tạo Project trước khi giao. dryRun: chỉ kiểm, không lưu.
 * → {added, ids, skipped: [{email, code, message}]}
 */
export function addAccounts(ctx, { tool, items, label = null, setup = false, by, dryRun = false, cafeId = null }) {
  const skipped = [];
  const ids = [];
  const seen = new Set();
  const doIt = () => {
    for (const a of items) {
      if (a.code) { skipped.push({ email: a.email, code: a.code, message: a.message }); continue; }
      const key = a.email.toLowerCase();
      if (seen.has(key) || get(ctx.db, 'SELECT 1 FROM accounts WHERE login_email = ?', key)) { skipped.push({ email: a.email, code: 'exists', message: 'đã có trong kho' }); continue; }
      seen.add(key);
      if (dryRun) { ids.push(null); continue; }
      const wait = !!tool.workspace_bot && !!setup;
      let max = Math.max(1, a.max ?? tool.holders_default ?? 1);
      if (tool.workspace_bot) max = Math.min(MAX_WORKSPACES, max);
      const accountId = run(ctx.db, 'INSERT INTO accounts(tool_id, label, login_email, password_enc, totp_enc, max_holders, status, status_reason, created_at, cafe_id) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        tool.id, label || null, key, a.password ? encrypt(a.password, ctx.config.dataKey) : null,
        a.totp ? encrypt(a.totp, ctx.config.dataKey) : null, max, wait ? 'needs_rotation' : 'ready', wait ? 'Chờ bot tạo Project' : null, ctx.now(), cafeId ?? null).lastInsertRowid;
      if (wait) createTask(ctx, { accountId, slotId: null, kind: 'rotate', reason: 'setup', detail: null });
      ids.push(Number(accountId));
    }
  };
  if (dryRun) doIt(); else tx(ctx.db, doIt);
  if (!dryRun) logEvent(ctx, { type: 'accounts_imported', cafeId: cafeId ?? null, data: { tool: tool.slug, added: ids.length, by } });
  return { added: ids.length, ids: dryRun ? [] : ids, skipped };
}

/** Thêm mã / link nhận quà (login_type = redeem): mỗi giá trị 1 mã hoặc 1 link https, dùng 1 lần. */
export function addRedeemCodes(ctx, { tool, values, label = null, by, dryRun = false }) {
  const skipped = [];
  let added = 0;
  const doIt = () => {
    for (const raw of values) {
      const value = String(raw ?? '').trim();
      const short = value.slice(0, 40);
      if (!value || value.length > 500 || /\s/.test(value)) { skipped.push({ email: short, code: 'bad_code', message: 'không hợp lệ (1 mã / 1 link mỗi dòng)' }); continue; }
      if (/^http:\/\//i.test(value)) { skipped.push({ email: short, code: 'bad_code', message: 'link phải là https://' }); continue; }
      if (dryRun) {
        if (get(ctx.db, 'SELECT 1 FROM redeem_codes WHERE tool_id = ? AND value = ?', tool.id, value)) skipped.push({ email: short, code: 'exists', message: 'đã có trong kho' }); else added++;
        continue;
      }
      const r = run(ctx.db, "INSERT OR IGNORE INTO redeem_codes(tool_id, value, label, status, created_at) VALUES(?, ?, ?, 'ready', ?)", tool.id, value, label || null, ctx.now());
      if (r.changes) added++; else skipped.push({ email: short, code: 'exists', message: 'đã có trong kho' });
    }
  };
  if (dryRun) doIt(); else tx(ctx.db, doIt);
  if (!dryRun) logEvent(ctx, { type: 'redeem_imported', data: { tool: tool.slug, added, by } });
  return { added, ids: [], skipped };
}

/** Một tài khoản để đưa ra ngoài trang quản trị: KHÔNG có mật khẩu / khoá 2FA, chỉ cho biết đã có hay chưa. */
export function publicAccount(ctx, a) {
  const tool = get(ctx.db, 'SELECT * FROM tools WHERE id = ?', a.tool_id);
  const cafe = a.cafe_id ? get(ctx.db, 'SELECT name, qs_slug FROM cafes WHERE id = ?', a.cafe_id) : null;
  return {
    id: a.id, tool: tool.slug, label: a.label || null, email: a.login_email, status: a.status, statusReason: a.status_reason || null,
    // Kho: null = kho chung; có = kho riêng của quán (shop = mã quán QS nếu có).
    kho: cafe ? { cafeId: a.cafe_id, name: cafe.name, shop: cafe.qs_slug || null } : null,
    inUse: accountLoad(ctx, a.id), maxHolders: a.max_holders, hasPassword: !!a.password_enc, has2fa: !!a.totp_enc,
    usable: !!get(ctx.db, `SELECT ${USABLE_SQL} AS u FROM accounts a JOIN tools t ON t.id = a.tool_id WHERE a.id = ?`, a.id).u,
    pendingTask: !!get(ctx.db, "SELECT 1 FROM rotation_tasks WHERE account_id = ? AND kind = 'rotate' AND status = 'todo'", a.id),
    createdAt: a.created_at, expiresAt: tool.account_days == null ? null : a.created_at + tool.account_days * DAY,
    lastAssignedAt: a.last_assigned_at || null, lastRotatedAt: a.last_rotated_at || null,
  };
}

/** Danh sách tài khoản (lọc theo công cụ / trạng thái / kho), không có mật khẩu. kho: undefined = mọi kho, null = kho chung, quán = kho riêng. */
export function listAccounts(ctx, { tool = null, status = null, kho = undefined, limit = 200, offset = 0 } = {}) {
  const rows = all(ctx.db,
    `SELECT a.* FROM accounts a JOIN tools t ON t.id = a.tool_id
     WHERE (:tool IS NULL OR t.id = :tool) AND (:status IS NULL OR a.status = :status)
       AND (:anyKho = 1 OR (:kho IS NULL AND a.cafe_id IS NULL) OR a.cafe_id = :kho)
     ORDER BY t.sort, a.id LIMIT :limit OFFSET :offset`,
    { tool: tool?.id ?? null, status, anyKho: kho === undefined ? 1 : 0, kho: kho?.id ?? null, limit: Math.min(500, Math.max(1, limit)), offset: Math.max(0, offset) });
  return rows.map((a) => publicAccount(ctx, a));
}

/** Tổng kho theo công cụ: còn bao nhiêu chỗ giao được, đã giao hôm nay, tài khoản theo trạng thái. */
export function stockSummary(ctx) {
  const counts = all(ctx.db, 'SELECT tool_id, status, COUNT(*) AS n FROM accounts GROUP BY tool_id, status');
  const codes = new Map(all(ctx.db, "SELECT tool_id, COUNT(*) AS n FROM redeem_codes WHERE status = 'ready' GROUP BY tool_id").map((r) => [r.tool_id, r.n]));
  const avail = new Map(toolAvailability(ctx).map((x) => [x.tool.id, x]));
  const cafes = new Map(all(ctx.db, 'SELECT id, name, qs_slug FROM cafes').map((c) => [c.id, c]));
  const pools = poolSeats(ctx);
  return all(ctx.db, 'SELECT * FROM tools ORDER BY sort, id').map((t) => {
    const accounts = Object.fromEntries(ACCOUNT_STATUSES.map((s) => [s, 0]));
    for (const c of counts) if (c.tool_id === t.id) accounts[c.status] = c.n;
    const a = avail.get(t.id);
    return {
      tool: t.slug, name: t.name, loginType: t.login_type, enabled: !!t.enabled,
      free: a ? a.free : 0, reserved: a ? a.reserved : 0, expiringSoon: a ? a.expiring : 0,
      usedToday: toolUsedToday(ctx, t.id), dailyCap: t.daily_cap ?? null, holdersDefault: t.holders_default,
      accounts, redeemCodes: t.login_type === 'redeem' ? codes.get(t.id) || 0 : undefined,
      // Chỗ trống theo kho (chưa trừ dự phòng / lượt mỗi ngày): kho chung + từng kho riêng của quán.
      kho: pools.filter((p) => p.tool_id === t.id).map((p) => {
        const c = p.cafe_id ? cafes.get(p.cafe_id) : null;
        return { cafeId: p.cafe_id ?? null, name: c ? c.name : 'Kho chung', shop: c?.qs_slug || null, accounts: p.n, free: p.free };
      }),
    };
  });
}

/** Bỏ việc đổi mật khẩu / làm mới đang chờ của tài khoản đã ngừng dùng. → số việc đã bỏ */
export function dropRotateTasks(ctx, accountId, by) {
  return run(ctx.db, "UPDATE rotation_tasks SET status = 'cancelled', done_at = ?, done_by = ?, lease_until = NULL WHERE account_id = ? AND kind = 'rotate' AND status = 'todo'",
    ctx.now(), by, accountId).changes;
}

/**
 * Sửa 1 tài khoản (API kho). patch: {label, holders, password, totp, keepPassword, status: 'ready' | 'retired' | 'quarantined', cafeId}.
 *  - cafeId: chuyển kho — id quán = kho riêng của quán đó, null = kho chung. Khách đang dùng vẫn dùng tiếp; chỉ lượt giao sau theo kho mới.
 *  - Tài khoản đang có việc "đổi mật khẩu / làm mới" (sau lượt dùng, cách ly, 6h sáng): gửi mật khẩu mới hoặc status 'ready'
 *    = xong việc đó, đi đúng đường của nút "Đã xong" ở Việc tay (cùng điều kiện: loại mật khẩu phải có mật khẩu mới…).
 *    Còn khách đang dùng thì chưa mở lại (status vẫn needs_rotation).
 *  - 'retired': ngừng giao; khách đang dùng vẫn dùng tới hết giờ. 'quarantined': thu hồi ngay mọi chỗ + tạo việc đổi mật khẩu.
 * → {ok, account, message} | {ok:false, code, message}
 */
export function updateAccount(ctx, accountId, patch, by) {
  const a = get(ctx.db, 'SELECT * FROM accounts WHERE id = ?', accountId);
  if (!a) return { ok: false, code: 'not_found', message: 'Không có tài khoản này.' };
  const tool = get(ctx.db, 'SELECT * FROM tools WHERE id = ?', a.tool_id);
  const has = (k) => Object.hasOwn(patch, k) && patch[k] !== undefined;
  const fail = (code, message) => ({ ok: false, code, message });

  // Kiểm hết trước khi ghi: lỗi ở một ô thì không ô nào đổi.
  if (has('status') && !['ready', 'retired', 'quarantined'].includes(patch.status)) return fail('bad_status', 'status chỉ nhận ready, retired hoặc quarantined.');
  let holders = null;
  if (has('holders')) {
    holders = toInt(patch.holders);
    if (!Number.isFinite(holders) || holders < 1 || holders > 50) return fail('bad_holders', 'Số khách dùng chung phải từ 1 đến 50.');
    if (tool.workspace_bot) holders = Math.min(MAX_WORKSPACES, holders);
  }
  const password = has('password') && patch.password !== null ? String(patch.password).trim() : '';
  if (password && !usesPassword(tool)) return fail('no_password_tool', 'Công cụ này không đăng nhập bằng mật khẩu.');
  if (password.length > 200) return fail('bad_password', 'Mật khẩu quá dài.');
  let totp = null;
  if (has('totp') && patch.totp) {
    if (tool.login_type !== 'password_totp') return fail('no_totp_tool', 'Công cụ này không dùng 2FA.');
    totp = parseTotpSecret(String(patch.totp));
    if (!totp) return fail('bad_totp', 'Khoá 2FA không hợp lệ (chuỗi chữ A–Z, số 2–7, hoặc link otpauth://).');
  }
  const label = has('label') ? (String(patch.label ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 120) || null) : undefined;
  if (has('cafeId') && patch.cafeId !== null && !get(ctx.db, 'SELECT 1 FROM cafes WHERE id = ?', Number(patch.cafeId) || 0)) return fail('cafe_unknown', 'Không có quán này.');
  const moveKho = has('cafeId') && (patch.cafeId === null ? null : Number(patch.cafeId)) !== (a.cafe_id ?? null);

  try { return tx(ctx.db, () => {
    if (label !== undefined) run(ctx.db, 'UPDATE accounts SET label = ? WHERE id = ?', label, a.id);
    if (moveKho) run(ctx.db, 'UPDATE accounts SET cafe_id = ? WHERE id = ?', patch.cafeId === null ? null : Number(patch.cafeId), a.id);
    if (holders != null) run(ctx.db, 'UPDATE accounts SET max_holders = ? WHERE id = ?', holders, a.id);
    let message = 'Đã lưu.';
    const task = get(ctx.db, "SELECT id FROM rotation_tasks WHERE account_id = ? AND kind = 'rotate' AND status = 'todo' ORDER BY id LIMIT 1", a.id);

    if (patch.status === 'quarantined') {
      if (password) run(ctx.db, 'UPDATE accounts SET password_enc = ? WHERE id = ?', encrypt(password, ctx.config.dataKey), a.id);
      if (totp) run(ctx.db, 'UPDATE accounts SET totp_enc = ? WHERE id = ?', encrypt(totp, ctx.config.dataKey), a.id);
      const r = quarantineAccount(ctx, a.id, `Cách ly qua API bởi ${by}`);
      message = `Đã cách ly, thu hồi ${r.revokedSlots} chỗ.`;
    } else if (task && (password || patch.status === 'ready')) {
      const r = completeTask(ctx, task.id, { by, newPassword: password || undefined, newTotp: totp || undefined, keepPassword: !!patch.keepPassword });
      if (!r.ok) throw Object.assign(new Error(r.message), { stockCode: 'task_rejected' });
      message = r.message;
    } else {
      if (password) run(ctx.db, 'UPDATE accounts SET password_enc = ?, last_rotated_at = ? WHERE id = ?', encrypt(password, ctx.config.dataKey), ctx.now(), a.id);
      if (totp) run(ctx.db, 'UPDATE accounts SET totp_enc = ? WHERE id = ?', encrypt(totp, ctx.config.dataKey), a.id);
      if (patch.status === 'retired' && a.status !== 'retired') {
        run(ctx.db, "UPDATE accounts SET status = 'retired', status_reason = ? WHERE id = ?", `Ngừng qua API bởi ${by}`, a.id);
        // Không giao nữa → việc đổi mật khẩu / làm mới đang chờ thành thừa (mời / gỡ nhóm Canva vẫn giữ: khách còn phải được gỡ).
        dropRotateTasks(ctx, a.id, by);
        const busy = blockingHolders(ctx, a.id);
        message = busy ? `Đã ngừng giao. ${busy} khách đang dùng vẫn dùng tới hết giờ.` : 'Đã ngừng giao.';
      } else if (patch.status === 'ready' && a.status !== 'ready') {
        // Không còn việc chờ (vd. mở lại tài khoản đã ngừng): chỉ mở khi đủ mật khẩu / 2FA cho kiểu đăng nhập.
        run(ctx.db, "UPDATE accounts SET status = 'ready', status_reason = NULL WHERE id = ?", a.id);
        if (!get(ctx.db, `SELECT ${USABLE_SQL} AS u FROM accounts a JOIN tools t ON t.id = a.tool_id WHERE a.id = ?`, a.id).u) {
          throw Object.assign(new Error('Thiếu mật khẩu / khoá 2FA nên chưa mở lại được — gửi kèm password (và totp).'), { stockCode: 'not_usable' });
        }
        message = 'Đã mở lại, tài khoản sẵn sàng giao.';
      }
    }
    logEvent(ctx, { type: 'account_updated', accountId: a.id, data: { by, fields: Object.keys(patch).filter((k) => has(k) && (k !== 'cafeId' || moveKho)), status: patch.status || null,
      ...(moveKho ? { kho: patch.cafeId === null ? 'Kho chung' : get(ctx.db, 'SELECT name FROM cafes WHERE id = ?', Number(patch.cafeId)).name } : {}) } });
    return { ok: true, message, account: publicAccount(ctx, get(ctx.db, 'SELECT * FROM accounts WHERE id = ?', a.id)) };
  }); } catch (e) {
    // Lỗi nghiệp vụ giữa chừng → cả lần sửa bị huỷ (rollback), trả lỗi rõ ràng.
    if (e.stockCode) return fail(e.stockCode, e.message);
    throw e;
  }
}
