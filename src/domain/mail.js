// Bộ lọc thư: dịch vụ mail đẩy thư về → xác định tài khoản → phân loại → chỉ đưa CON SỐ MÃ cho đúng người.
// Không bao giờ chuyển nguyên thư, link đăng nhập, hay mã đặt lại mật khẩu cho khách.
import { get, all, run, tx } from '../db/index.js';
import { logEvent } from '../lib/events.js';
import { sha256 } from '../lib/crypto.js';
import { maskPhone } from '../lib/phone.js';
import { MIN, DAY } from '../lib/time.js';
import { parseMime, looksLikeMessage, headerBlockToObject } from '../lib/mime.js';
import { onLoginCode } from './codes.js';
import { revokeSlot } from './claims.js';

/** Mẫu mặc định theo slug công cụ: tên miền gửi thư mã (regex). Dùng khi tools.sender_pattern = NULL. */
export const DEFAULT_TOOL_PATTERNS = {
  chatgpt: { sender: 'openai\\.com|chatgpt\\.com' },
  claude: { sender: 'anthropic\\.com|claude\\.ai|claude\\.com' },
  capcut: { sender: 'capcut\\.com|capcutapi|bytedance' },
  adobe: { sender: 'adobe\\.com|adobesystems' },
  canva: { sender: 'canva\\.com' },
  gemini: { sender: 'google\\.com' },
  grok: { sender: 'x\\.ai|grok\\.com' },
  perplexity: { sender: 'perplexity\\.ai' },
  notion: { sender: 'notion\\.so|makenotion\\.com|notion\\.com' },
  cursor: { sender: 'cursor\\.(sh|com)|anysphere' },
  elevenlabs: { sender: 'elevenlabs\\.io' },
  midjourney: { sender: 'midjourney\\.com' },
  gamma: { sender: 'gamma\\.app' },
  freepik: { sender: 'freepik\\.com' },
  duolingo: { sender: 'duolingo\\.com' },
  youtube: { sender: 'google\\.com|youtube\\.com' },
  spotify: { sender: 'spotify\\.com' },
  netflix: { sender: 'netflix\\.com' },
};

// ---------- Chuẩn hoá thư đầu vào ----------

const EMAIL_IN = /[^\s<>,;"'()]+@[^\s<>,;"'()]+\.[A-Za-z]{2,}/g;

function dig(o, path) {
  return path.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);
}
function pick(o, keys) {
  for (const k of keys) {
    const v = dig(o, k);
    if (v != null && v !== '') return v;
  }
  return null;
}
function addresses(v) {
  if (v == null) return [];
  if (Array.isArray(v)) return v.flatMap(addresses);
  if (typeof v === 'object') return addresses(v.address ?? v.email ?? v.value ?? v.text ?? null);
  return (String(v).match(EMAIL_IN) || []).map((a) => a.toLowerCase());
}
function htmlToText(h) {
  return String(h)
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d|table)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}
function parseDate(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number' || /^\d+(\.\d+)?$/.test(String(v))) {
    const n = Number(v);
    return n < 1e12 ? Math.round(n * 1000) : Math.round(n);
  }
  const t = Date.parse(String(v));
  return Number.isFinite(t) ? t : null;
}

function parseJsonMaybe(v) {
  if (typeof v !== 'string') return v;
  try { return JSON.parse(v); } catch { return v; }
}

/** Tiêu đề phụ của thư: object, khối chữ (SendGrid), hoặc mảng [tên, giá trị] (Mailgun) → {tên-viết-thường: giá trị}. */
function headersOf(p) {
  const h = parseJsonMaybe(p.headers ?? p['message-headers']);
  let obj = {};
  if (typeof h === 'string') obj = headerBlockToObject(h);
  else if (Array.isArray(h)) obj = Object.fromEntries(h.filter((x) => Array.isArray(x) && x.length >= 2).map(([k, v]) => [String(k), v]));
  else if (h && typeof h === 'object') obj = h;
  const out = {};
  for (const [k, v] of Object.entries(obj)) if (!(k.toLowerCase() in out)) out[k.toLowerCase()] = v;
  return out;
}

const RAW_KEYS = ['raw', 'mime', 'rfc822', 'body-mime', 'raw_email', 'rawEmail'];

/**
 * Thư gốc (Cloudflare Worker) → đọc bằng parseMime.
 * Người nhận ưu tiên theo độ tin cậy: phong bì của nhà cung cấp → X-Envelope-To (Worker thêm) → Delivered-To → To/Cc.
 */
function expandRaw(p) {
  let key = RAW_KEYS.find((k) => p[k] != null && p[k] !== '');
  if (!key && looksLikeMessage(p.email)) key = 'email';
  if (!key) return p;
  const m = parseMime(p[key]);
  const envelope = parseJsonMaybe(p.envelope);
  const h = (k) => m.headers[k]?.[0];
  return {
    to: [envelope?.to, p.recipient, p.rcpt, h('x-envelope-to'), h('delivered-to'), h('x-original-to'), m.to, key === 'email' ? null : p.to],
    from: m.from ?? p.from ?? p.sender,
    subject: m.subject || p.subject,
    text: m.text,
    html: m.html,
    message_id: m.messageId,
    date: m.date ?? p.date,
  };
}

/** → {dedupeKey, to:[...], from, subject, text, date, hasLink} */
export function normalizeInbound(input = {}) {
  const raw = expandRaw(input);
  const p = typeof raw.envelope === 'string' ? { ...raw, envelope: parseJsonMaybe(raw.envelope) } : raw;
  const headers = headersOf(p);
  const to = [...new Set(addresses(pick(p, ['to', 'recipient', 'rcpt', 'envelope.to', 'To', 'address', 'email'])))];
  const from = addresses(pick(p, ['from', 'sender', 'From', 'envelope.from']))[0] || String(pick(p, ['from', 'sender', 'From']) || '').toLowerCase();
  const subject = String(pick(p, ['subject', 'Subject', 'title']) || '').replace(/\s+/g, ' ').trim();
  const html = pick(p, ['html', 'body_html', 'body-html', 'html_body', 'htmlBody']);
  let text = pick(p, ['text', 'body', 'plain', 'text_body', 'body-plain', 'content', 'textBody']);
  text = text != null ? String(text) : html != null ? htmlToText(html) : '';
  const date = parseDate(pick(p, ['date', 'Date', 'timestamp', 'received_at', 'receivedAt']) ?? headers.date);
  const mid = pick(p, ['message_id', 'messageId', 'Message-Id', 'Message-ID', 'id']) ?? headers['message-id'];
  const dedupeKey = mid ? `mid:${String(mid).trim()}` : `sha:${sha256([to.join(','), from, subject, text].join('|'))}`;
  const hasLink = /https?:\/\//i.test(text) || /<a\s[^>]*href=/i.test(String(html || ''));
  return { dedupeKey, to, from, subject, text, date, hasLink };
}

// ---------- Phân loại & bóc mã ----------

const uniq = (arr) => [...new Set(arr || [])];
const stripUrls = (s) => String(s || '').replace(/https?:\/\/\S+/gi, ' ');

/** Bóc mã đăng nhập. Chỉ trả về khi chắc chắn có đúng 1 mã. */
export function extractCode(tool, { subject = '', text = '' }) {
  const subj = stripUrls(subject);
  const body = stripUrls(text);
  if (tool?.code_regex) {
    try {
      const m = new RegExp(tool.code_regex, 'i').exec(`${subj}\n${body}`);
      if (m) return (m[1] ?? m[0]).trim();
    } catch { /* regex hỏng → dùng cách mặc định */ }
  }
  const six = (s) => uniq(s.match(/(?<![\d.,])\d{6}(?![.,]?\d)/g));
  const s6 = six(subj);
  if (s6.length === 1) return s6[0];
  const near = uniq([...body.matchAll(/(?:code|mã|otp|passcode|verification|xác (?:minh|nhận|thực))\D{0,40}?(?<![\d])(\d{4,8})(?!\d)/gi)].map((m) => m[1]));
  if (near.length === 1) return near[0];
  const near6 = near.filter((c) => c.length === 6);
  if (near6.length === 1) return near6[0];
  const b6 = six(body);
  if (b6.length === 1) return b6[0];
  return null;
}

const RESET_RE = /reset (your |the )?password|password reset|forgot (your )?password|(set|create|choose) (a )?new password|đặt lại mật khẩu|khôi phục mật khẩu|quên mật khẩu|recover (your )?account/i;
const SECURITY_RE = new RegExp([
  'password (was |has been )?(changed|updated)', 'changed your password',
  'email (address )?(was |has been )?(changed|updated)', 'changed your email', 'email change', 'change (your |of )?email',
  'two[- ]?factor', '\\b2fa\\b', '2-step', 'multi-factor', 'authenticator', 'passkey',
  'recovery (email|phone|code)', 'security (alert|notice|warning)', 'account (was |has been )?(deleted|deactivated|suspended|locked|disabled)',
  'đã đổi mật khẩu', 'mật khẩu (của bạn )?(đã|vừa) (được )?(thay )?đổi', 'thay đổi mật khẩu', 'email (của bạn )?(đã|vừa) (được )?(thay )?đổi', 'thay đổi email',
  'xác (minh|thực) (2|hai) (bước|lớp)', 'cảnh báo bảo mật',
].join('|'), 'i');
// Dùng cho NỘI DUNG thư (tiêu đề không rõ): chỉ những câu khẳng định đã có thay đổi, tránh thư quảng cáo "hãy bật 2FA".
const SECURITY_STRONG_RE = /password (was |has been )?(changed|updated)|changed your password|email (address )?(was |has been )?(changed|updated)|changed your email|(two[- ]?factor|2-step|2fa|passkey)[^.\n]{0,40}(enabled|turned on|disabled|turned off|added|removed)|mật khẩu (của bạn )?(đã|vừa) (được )?(thay )?đổi|đã đổi mật khẩu|email (của bạn )?(đã|vừa) (được )?(thay )?đổi/i;
const NEW_SIGNIN_RE = /new (sign[- ]?in|login|device)|signed in (from|on|to)|sign[- ]?in (from|on) (a )?new|logged in from|đăng nhập (mới|từ thiết bị|trên thiết bị)|thiết bị mới|unusual (sign[- ]?in|activity|login)/i;
const BILLING_RE = /receipt|invoice|payment|subscription|billing|renew|trial (is )?ending|hoá đơn|hóa đơn|thanh toán|gia hạn/i;
const CODE_HINT_RE = /code|mã|verif|xác (minh|nhận|thực)|\botp\b|one[- ]time|passcode/i;
const SIGNIN_HINT_RE = /sign[- ]?in|log[- ]?in|đăng nhập|magic link/i;
// Câu điều kiện ở chân thư ("nếu không phải bạn, hãy đổi mật khẩu") không phải cảnh báo thật.
const CONDITIONAL_RE = /[^.\n]*(if (this |it )?(wasn'?t|was not|isn'?t) you|if you did(n'?t| not)|nếu (đây |đó )?không phải (là )?bạn|nếu bạn không)[^.\n]*[.\n]?/gi;

function senderOk(tool, from) {
  const pattern = tool?.sender_pattern ?? DEFAULT_TOOL_PATTERNS[tool?.slug]?.sender ?? null;
  if (!pattern) return true;
  try { return new RegExp(pattern, 'i').test(String(from || '')); } catch { return true; }
}

/**
 * → {kind, code, unknownSender?}; kind ∈ login_code | magic_link | password_reset | security_alert | new_signin | billing | other
 * Ưu tiên tiêu đề. Thư đặt lại mật khẩu KHÔNG BAO GIỜ được coi là thư mã, kể cả khi có mã.
 */
export function classifyMail(tool, { from = '', subject = '', text = '', hasLink = false }) {
  if (!senderOk(tool, from)) return { kind: 'other', code: null, unknownSender: true };
  if (RESET_RE.test(subject)) return { kind: 'password_reset', code: null };
  if (SECURITY_RE.test(subject)) return { kind: 'security_alert', code: null };

  const code = extractCode(tool, { subject, text });
  const looksCode = CODE_HINT_RE.test(subject) || CODE_HINT_RE.test(text.slice(0, 2000));
  if (code && looksCode) return { kind: 'login_code', code };
  if (NEW_SIGNIN_RE.test(subject)) return { kind: 'new_signin', code: null };
  if (CODE_HINT_RE.test(subject) || (SIGNIN_HINT_RE.test(subject) && !BILLING_RE.test(subject))) {
    if (!code && hasLink && SIGNIN_HINT_RE.test(`${subject}\n${text}`) && !/\d{4,8}/.test(stripUrls(subject))) return { kind: 'magic_link', code: null };
    return { kind: 'login_code', code };
  }
  if (BILLING_RE.test(subject)) return { kind: 'billing', code: null };

  // Tiêu đề không rõ → xem đoạn đầu nội dung, bỏ các câu điều kiện ở chân thư.
  const head = text.slice(0, 1500).replace(CONDITIONAL_RE, ' ');
  if (SECURITY_STRONG_RE.test(head)) return { kind: 'security_alert', code: null };
  if (NEW_SIGNIN_RE.test(head)) return { kind: 'new_signin', code: null };
  return { kind: 'other', code: null };
}

// ---------- Nhận thư ----------

function findAccount(ctx, addrs) {
  for (const a of addrs) {
    const exact = get(ctx.db, 'SELECT * FROM accounts WHERE login_email = ?', a);
    if (exact) return { account: exact, addr: a };
    const [local, domain] = a.split('@');
    if (local.includes('+')) {
      const base = `${local.split('+')[0]}@${domain}`;
      const acc = get(ctx.db, 'SELECT * FROM accounts WHERE login_email = ?', base);
      if (acc) return { account: acc, addr: a };
    }
  }
  return null;
}

/**
 * Nhận 1 thư từ webhook. → {ok:true, mailId, kind, verdict} | {ok:true, duplicate:true}
 */
export function ingestMail(ctx, payload) {
  const m = normalizeInbound(payload);
  const r = tx(ctx.db, () => {
    const now = ctx.now();
    if (get(ctx.db, 'SELECT 1 FROM mails WHERE dedupe_key = ?', m.dedupeKey)) return { ok: true, duplicate: true };
    const found = findAccount(ctx, m.to);
    const insert = (o) => run(ctx.db,
      `INSERT INTO mails(dedupe_key, account_id, to_addr, from_addr, subject, body, kind, code, verdict, received_at)
       VALUES(:key, :accountId, :to, :from, :subject, :body, :kind, :code, :verdict, :now)`,
      { key: m.dedupeKey, to: (found?.addr || m.to[0] || '').slice(0, 320), from: m.from.slice(0, 320), subject: m.subject.slice(0, 500), now, ...o }).lastInsertRowid;

    if (!found) {
      const mailId = insert({ accountId: null, body: null, kind: 'unknown_recipient', code: null, verdict: 'ignored' });
      return { ok: true, mailId, kind: 'unknown_recipient', verdict: 'ignored' };
    }
    const { account } = found;
    const tool = get(ctx.db, 'SELECT * FROM tools WHERE id = ?', account.tool_id);
    const c = classifyMail(tool, m);
    const mailId = insert({ accountId: account.id, body: m.text.slice(0, 20000), kind: c.kind, code: c.code, verdict: null });
    const setVerdict = (v) => run(ctx.db, 'UPDATE mails SET verdict = ?, window_id = COALESCE(?, window_id) WHERE id = ?', v.verdict, v.windowId ?? null, mailId);
    const base = { accountId: account.id, data: { mailId, subject: m.subject, from: m.from } };
    const where = `${tool.name} — ${account.login_email}`;
    let verdict;

    if (c.unknownSender) {
      verdict = 'ignored';
      if (CODE_HINT_RE.test(m.subject) || SECURITY_RE.test(m.subject) || RESET_RE.test(m.subject)) {
        logEvent(ctx, { ...base, type: 'mail_unknown_sender', severity: 'yellow' });
      }
    } else if (c.kind === 'login_code' && c.code) {
      const o = onLoginCode(ctx, { account, code: c.code, mailId, mailDate: m.date });
      verdict = o.verdict === 'replaced' ? 'matched' : o.verdict;
      setVerdict({ verdict, windowId: o.windowId });
      return { ok: true, mailId, kind: c.kind, verdict };
    } else if (c.kind === 'login_code') {
      verdict = 'parse_failed';
      logEvent(ctx, { ...base, type: 'mail_parse_failed', severity: 'yellow' });
      const waiting = get(ctx.db, "SELECT 1 FROM code_windows WHERE account_id = ? AND status = 'open'", account.id);
    } else if (c.kind === 'security_alert') {
      verdict = 'quarantined';
      setVerdict({ verdict });
      quarantineAccount(ctx, account.id, `Thư bảo mật: ${m.subject}`);
      return { ok: true, mailId, kind: c.kind, verdict };
    } else if (c.kind === 'password_reset') {
      verdict = 'alerted';
      logEvent(ctx, { ...base, type: 'mail_password_reset', severity: 'red' });
    } else if (c.kind === 'magic_link') {
      verdict = 'alerted';
      const waiting = get(ctx.db, "SELECT 1 FROM code_windows WHERE account_id = ? AND status = 'open'", account.id);
      const severity = waiting ? 'yellow' : 'red';
      logEvent(ctx, { ...base, type: 'mail_magic_link', severity });
    } else if (c.kind === 'new_signin') {
      const recentCode = get(ctx.db, "SELECT 1 FROM code_windows WHERE account_id = ? AND status = 'delivered' AND code_received_at > ?", account.id, now - 15 * MIN);
      const passwordHolder = tool.login_type === 'password' && get(ctx.db, "SELECT 1 FROM slots WHERE account_id = ? AND status = 'active'", account.id);
      // Chủ vừa bấm "Lấy mã đăng nhập" ở việc tay → thư "đăng nhập mới" là của chủ.
      const ownerTask = get(ctx.db, "SELECT 1 FROM rotation_tasks WHERE account_id = ? AND status = 'todo' AND code_until >= ?", account.id, now - 15 * MIN);
      if (recentCode || passwordHolder || ownerTask) verdict = 'ignored';
      else {
        verdict = 'alerted';
        logEvent(ctx, { ...base, type: 'mail_new_signin', severity: 'yellow' });
      }
    } else {
      verdict = 'ignored';
    }
    setVerdict({ verdict });
    return { ok: true, mailId, kind: c.kind, verdict };
  });
  return r;
}

/**
 * Cách ly tài khoản: ngừng giao, thu hồi slot (không tính lượt của khách), tạo việc đổi mật khẩu, báo đỏ.
 * KHÔNG tự phạt ai: thủ phạm có thể là khách cũ còn phiên đăng nhập.
 */
export function quarantineAccount(ctx, accountId, reason) {
  const r = tx(ctx.db, () => {
    const now = ctx.now();
    const account = get(ctx.db, 'SELECT * FROM accounts WHERE id = ?', accountId);
    if (!account) return { revokedSlots: 0 };
    run(ctx.db, "UPDATE accounts SET status = 'quarantined', status_reason = ? WHERE id = ?", reason, accountId);
    // Tạo việc đổi mật khẩu trước, để endSlot không tạo thêm việc trùng.
    if (!get(ctx.db, "SELECT 1 FROM rotation_tasks WHERE account_id = ? AND kind = 'rotate' AND status = 'todo'", accountId)) {
      const taskId = run(ctx.db,
        "INSERT INTO rotation_tasks(account_id, kind, reason, detail, status, created_at) VALUES(?, 'rotate', 'quarantine', ?, 'todo', ?)",
        accountId, reason, now).lastInsertRowid;
    }
    const holders = all(ctx.db,
      "SELECT s.id, s.customer_id, c.phone FROM slots s JOIN customers c ON c.id = s.customer_id WHERE s.account_id = ? AND s.status = 'active'",
      accountId);
    for (const h of holders) revokeSlot(ctx, h.id, 'account_quarantined', 'system');
    const past = all(ctx.db,
      `SELECT s.customer_id, c.phone, MAX(s.ended_at) AS ended_at FROM slots s JOIN customers c ON c.id = s.customer_id
       WHERE s.account_id = ? AND s.status IN ('expired', 'revoked') AND s.ended_at > ? AND s.end_reason != 'account_quarantined'
       GROUP BY s.customer_id ORDER BY ended_at DESC`,
      accountId, now - 7 * DAY);
    // Ai đang / đã giữ tài khoản trong 7 ngày: hiện ở nhật ký để chủ biết hỏi ai (không tự phạt).
    logEvent(ctx, { type: 'account_quarantined', severity: 'red', accountId,
      data: { reason, revoked: holders.length, holders: holders.map((h) => maskPhone(h.phone)), past: past.map((p) => maskPhone(p.phone)) } });
    return { revokedSlots: holders.length };
  });
  return r;
}
