// Tiện ích dùng chung cho test: ctx với SQLite trong RAM, đồng hồ điều khiển được, notifier/OTP giả.
import { openDb, run, get, all } from '../src/db/index.js';
import { createCtx } from '../src/ctx.js';
import { loadConfig } from '../src/config.js';
import { saveSetting } from '../src/lib/settings.js';
import { encrypt, sha256, randomToken } from '../src/lib/crypto.js';
import { qsEntryCard } from '../src/domain/presence.js';
import { makeTicket } from '../src/domain/ticket.js';

/** 20:00 ngày 05/10/2026 giờ Việt Nam. */
export const T0 = Date.UTC(2026, 9, 5, 13, 0, 0);

export function createTestCtx({ now = T0, settings = {}, env = {} } = {}) {
  const db = openDb(':memory:');
  const config = loadConfig({ NODE_ENV: 'test', BASE_URL: 'http://localhost:3000', ...env });
  const clock = { t: now };
  const otpSent = [];
  const otp = { name: 'fake', async send(phone, code) { otpSent.push({ phone, code }); return { ok: true }; } };
  const ctx = createCtx({ config, db, otp, now: () => clock.t, log: () => {} });
  for (const [k, v] of Object.entries(settings)) saveSetting(db, k, v);
  ctx.settings.invalidate();
  ctx.clock = {
    advance(ms) { clock.t += ms; },
    set(ms) { clock.t = ms; },
  };
  // Báo động = sự kiện mức red / yellow trong bảng events (trang Trực duyệt đọc từ đó).
  ctx.alerts = (type) => all(db, "SELECT type, severity, data FROM events WHERE severity IN ('red', 'yellow') AND (? IS NULL OR type = ?) ORDER BY id", type ?? null, type ?? null);
  ctx.otpSent = otpSent;
  return ctx;
}

const ins = (ctx, sql, params) => run(ctx.db, sql, params).lastInsertRowid;
const byId = (ctx, table, id) => get(ctx.db, `SELECT * FROM ${table} WHERE id = ?`, id);

/**
 * Dữ liệu mẫu: 1 quán (mã quán QS "quan-test") + lối vào QS ẩn của quán, 3 công cụ (mỗi kiểu đăng nhập 1 cái), tài khoản kho.
 * → {cafe, card (lối vào QS), tools:{chatgpt, capcut}, accounts:{gpt1, gpt2, capcut1}}
 */
export function seed(ctx) {
  const now = ctx.now();
  const cafeId = ins(ctx,
    `INSERT INTO cafes(name, address, qs_slug, display_token, code_secret, presence_mode, daily_quota, created_at)
     VALUES('Cà phê Test 24h', '1 Test, Q1', 'quan-test', 'disp-test-token', 'cafe-secret-1', 'none', 20, :now)`,
    { now });
  const cardId = qsEntryCard(ctx, byId(ctx, 'cafes', cafeId)).id;
  const tool = (o) => ins(ctx,
    `INSERT INTO tools(slug, name, login_type, login_url, instructions, sender_pattern, code_regex, slot_hours, cooldown_days, lifetime_cap, rotation_required, high_value, enabled, sort)
     VALUES(:slug, :name, :login_type, :login_url, :instructions, :sender_pattern, :code_regex, 24, 30, 2, :rotation_required, :high_value, 1, :sort)`,
    { instructions: null, sender_pattern: null, code_regex: null, rotation_required: 1, high_value: 0, ...o });
  const chatgpt = tool({ slug: 'chatgpt', name: 'ChatGPT Plus', login_type: 'email_code', login_url: 'https://chatgpt.com/auth/login', sender_pattern: 'openai\\.com|chatgpt\\.com', high_value: 1, sort: 1 });
  const capcut = tool({ slug: 'capcut', name: 'CapCut Pro', login_type: 'password', login_url: 'https://www.capcut.com/login', sort: 2 });
  const acct = (o) => ins(ctx,
    `INSERT INTO accounts(tool_id, label, login_email, password_enc, max_holders, status, created_at)
     VALUES(:tool_id, :label, :login_email, :password_enc, :max_holders, 'ready', :now)`,
    { label: null, password_enc: null, max_holders: 1, now, ...o });
  const gpt1 = acct({ tool_id: chatgpt, login_email: 'gpt1@kho.test' });
  const gpt2 = acct({ tool_id: chatgpt, login_email: 'gpt2@kho.test' });
  const capcut1 = acct({ tool_id: capcut, login_email: 'capcut1@kho.test', password_enc: encrypt('Secret#123', ctx.config.dataKey) });
  return {
    cafe: byId(ctx, 'cafes', cafeId),
    card: byId(ctx, 'cards', cardId),
    tools: { chatgpt: byId(ctx, 'tools', chatgpt), capcut: byId(ctx, 'tools', capcut) },
    accounts: {
      gpt1: byId(ctx, 'accounts', gpt1),
      gpt2: byId(ctx, 'accounts', gpt2),
      capcut1: byId(ctx, 'accounts', capcut1),
    },
  };
}

export function makeCustomer(ctx, phone = '84912345678', extra = {}) {
  const id = ins(ctx,
    `INSERT INTO customers(phone, status, strikes, risk, consent_at, consent_version, created_at)
     VALUES(:phone, :status, :strikes, :risk, :now, :ver, :now)`,
    { phone, status: 'active', strikes: 0, risk: 0, now: ctx.now(), ver: ctx.settings().consentVersion, ...extra });
  return byId(ctx, 'customers', id);
}

/** Tạo máy, tuỳ chọn gắn với khách. */
export function makeDevice(ctx, id = 'device-aaaaaaaaaaaaaaaa', customerId = null) {
  run(ctx.db, "INSERT OR IGNORE INTO devices(id, status, created_at, last_seen_at) VALUES(?, 'active', ?, ?)", id, ctx.now(), ctx.now());
  if (customerId) {
    run(ctx.db, 'INSERT OR IGNORE INTO device_customers(device_id, customer_id, first_seen_at) VALUES(?, ?, ?)', id, customerId, ctx.now());
  }
  return byId(ctx, 'devices', id);
}

/** Phiên đăng nhập. → {token, session} */
export function makeSession(ctx, { customerId, deviceId }) {
  const token = randomToken();
  run(ctx.db,
    'INSERT INTO sessions(id, customer_id, device_id, created_at, expires_at) VALUES(?, ?, ?, ?, ?)',
    sha256(token), customerId, deviceId, ctx.now(), ctx.now() + 7 * 86400000);
  return { token, session: byId(ctx, 'sessions', sha256(token)) };
}

/** Giả lập 1 lượt vào hợp lệ từ trang quán (ghi thẳng bảng taps, như sau khi vé đúng). → tapId */
export function makeTap(ctx, { card, deviceId, ip = '1.2.3.4', verdict = 'ok' }) {
  return ins(ctx,
    'INSERT INTO taps(card_id, cafe_id, device_id, ip, verdict, created_at) VALUES(:cardId, :cafeId, :deviceId, :ip, :verdict, :now)',
    { cardId: card.id, cafeId: card.cafe_id, deviceId, ip, verdict, now: ctx.now() });
}

/** Thẻ NFC riêng của Tiệm (quán chưa dùng QS) — link /c/<token>. → card */
let cardSeq = 0;
export function makeNfcCard(ctx, cafe, label = 'Bàn 1') {
  const id = ins(ctx, "INSERT INTO cards(cafe_id, token, kind, label, created_at) VALUES(:cafeId, :token, 'nfc', :label, :now)",
    { cafeId: cafe.id, token: `the-test-${++cardSeq}`, label, now: ctx.now() });
  return byId(ctx, 'cards', id);
}

/** Vé như QS gắn vào nút "Nhận công cụ" (khoá thử của config test). */
let nonceSeq = 0;
export const ticketFor = (ctx, shop = 'quan-test', at = ctx.now(), nonce = `nonce-test-${++nonceSeq}-aaaa`) =>
  makeTicket(ctx.config.qsTicketKey, shop, at, nonce);

export { byId };

/**
 * Chạy server thật trên cổng ngẫu nhiên với ctx của test. basePath: chạy dưới thư mục con (vd. '/colap'), url đã kèm tiền tố.
 * → {url, close(), client()}; client() giữ cookie như trình duyệt:
 *   await c.get(path, headers?) · await c.post(path, jsonBody, headers?) · await c.postForm(path, obj, headers?)
 *   → {status, headers, text, json}
 */
export async function startTestServer(ctx, { basePath = '' } = {}) {
  const http = await import('node:http');
  const { createApp } = await import('../src/server.js');
  const server = http.createServer(createApp(ctx));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}${basePath}`;
  ctx.config.baseUrl = url;
  return {
    url,
    close: () => new Promise((r) => server.close(r)),
    client: () => makeClient(url),
  };
}

function makeClient(base) {
  const jar = new Map();
  const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
  async function req(method, path, body, headers = {}) {
    const h = { ...headers };
    if (jar.size) h.cookie = cookieHeader();
    if (method === 'POST' && !('origin' in h)) h.origin = base;
    const res = await fetch(base + path, { method, headers: h, body, redirect: 'manual' });
    for (const c of res.headers.getSetCookie()) {
      const [pair, ...attrs] = c.split(';');
      const i = pair.indexOf('=');
      const k = pair.slice(0, i).trim();
      const v = pair.slice(i + 1).trim();
      if (attrs.some((a) => /max-age=0/i.test(a.trim())) || v === '') jar.delete(k);
      else jar.set(k, v);
    }
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* không phải JSON */ }
    return { status: res.status, headers: res.headers, text, json };
  }
  return {
    jar,
    get: (path, headers) => req('GET', path, undefined, headers),
    post: (path, obj = {}, headers = {}) => req('POST', path, JSON.stringify(obj), { 'content-type': 'application/json', ...headers }),
    postForm: (path, obj = {}, headers = {}) => req('POST', path, new URLSearchParams(obj).toString(), { 'content-type': 'application/x-www-form-urlencoded', ...headers }),
  };
}
