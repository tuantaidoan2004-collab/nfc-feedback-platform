// Test thực tế backend: chạy TBQ ở chế độ PRODUCTION (như trên VPS sau Caddy) trong 1 tiến trình riêng,
// rồi đóng vai chủ tiệm + nhiều khách (máy, mạng, IP khác nhau) gọi đúng các API thật.
//   npm run e2e
// Không đụng database thật: dùng file tạm trong thư mục tạm của hệ điều hành, xoá khi xong.
// Mất khoảng 30 giây (có chờ việc định kỳ xử lý hết hạn slot và mã mồ côi).
import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { createHmac, randomBytes } from 'node:crypto';
import { totpNow } from '../src/lib/totp.js';
import { makeTicket } from '../src/domain/ticket.js';
import { openDb } from '../src/db/index.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = 4791;
const HOOK_PORT = 4792;
// E2E_BASE_PATH=/colap npm run e2e → chạy cả bộ khi Tiệm đặt dưới thư mục con (BASE_URL = https://…/colap).
const BP = process.env.E2E_BASE_PATH || '';
const BASE = `https://thu.test${BP}`; // địa chỉ công khai giả (Caddy lo HTTPS)
const URL_ = `http://127.0.0.1:${PORT}${BP}`;
const DIR = mkdtempSync(join(tmpdir(), 'tbq-e2e-'));
const DB_PATH = join(DIR, 'tbq.sqlite');
const sec = () => randomBytes(32).toString('base64');
const ENV = {
  NODE_ENV: 'production', PORT: String(PORT), BASE_URL: BASE, DB_PATH, CLIENT_IP_HEADER: 'x-real-ip',
  APP_SECRET: sec(), DATA_KEY: sec(), ADMIN_PASSWORD: 'mat-khau-chu-tiem-2026', MAIL_WEBHOOK_SECRET: sec(),
  // OTP đi đúng đường SMS thật (eSMS), chỉ khác địa chỉ: máy eSMS giả bên dưới.
  OTP_PROVIDER: 'esms', ESMS_URL: `http://127.0.0.1:${HOOK_PORT}/esms`, ESMS_API_KEY: 'esms-key-e2e', ESMS_SECRET_KEY: sec(), ESMS_BRANDNAME: 'TiemBanQuyen',
  QS_TICKET_KEY: randomBytes(32).toString('hex'), // giống NFC_EVENT_TBQ_KEY bên QS
};
const hmac = (key, body) => createHmac('sha256', key).update(body).digest('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1';
const LAPTOP_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130.0 Safari/537.36';
const CAFE_IP = '113.161.20.30'; // IP Wi-Fi của quán (chỉ để nhiều khách cùng 1 IP — Tiệm không dùng IP để đoán quán)

/** Trang Công cụ: "hôm nay / lượt mỗi ngày" (lượt mỗi ngày là ô sửa nhanh). */
const capShown = (page, used, cap) => new RegExp(`${used} /\\s*<input name="daily_cap"[^>]*value="${cap}"`).test(page);

// ---------- Ghi kết quả ----------
const results = [];
let section = '';
function part(name) { section = name; console.log(`\n▶ ${name}`); }
function check(name, ok, detail = '') {
  results.push({ section, name, ok: !!ok, detail });
  console.log(`  ${ok ? '✔' : '✘'} ${name}${!ok && detail ? `  → ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`);
  return !!ok;
}
const notes = [];
const note = (s) => { notes.push(s); console.log(`  ⚑ ${s}`); };

// ---------- Máy eSMS giả: nhận tin OTP như eSMS.vn (CodeResult "100" = đã nhận) ----------
const otpInbox = new Map(); // 84xxxxxxxxx → [code...]
let badOtpSig = 0;
const hookServer = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    if (req.url === '/cf-email') {
      // Cloudflare Email Sending giả: kiểm Bearer + người gửi, lưu mã theo địa chỉ nhận.
      if (req.headers.authorization !== 'Bearer cf-email-token-e2e' || body.from?.address !== 'xacnhan@tiembanquyen.test') badOtpSig++;
      const code = /\b\d{6}\b/.exec(body.subject || '')?.[0];
      otpInbox.set(body.to, [...(otpInbox.get(body.to) || []), code]);
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ success: true, errors: [], result: { delivered: [body.to], permanent_bounces: [], queued: [] } }));
      return;
    }
    if (req.url === '/esms') {
      if (body.ApiKey !== ENV.ESMS_API_KEY || body.SecretKey !== ENV.ESMS_SECRET_KEY || body.Brandname !== ENV.ESMS_BRANDNAME) badOtpSig++;
      const code = /\b\d{6}\b/.exec(body.Content || '')?.[0];
      otpInbox.set(body.Phone, [...(otpInbox.get(body.Phone) || []), code]);
    }
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ CodeResult: '100' }));
  });
});
/** Báo động = sự kiện mức red / yellow trong nhật ký (trang Theo dõi của chủ đọc từ đây). */
const alertEvent = (type) => db.prepare("SELECT * FROM events WHERE type = ? AND severity IN ('red', 'yellow') ORDER BY id DESC LIMIT 1").get(type);

// ---------- Tiến trình TBQ ----------
let server = null;
let serverLog = '';
function startServer(env = ENV) {
  // Chạy lúc 5h–6h sáng giờ VN: ChatGPT / Claude đang "nghỉ nhận" (endHourCloseMin) → tắt cho lần chạy này để kiểm phần khác.
  // Giờ nghỉ có bài kiểm riêng với đồng hồ giả (test/sang-som.test.js).
  if (new Date(Date.now() + 7 * 3600e3).getUTCHours() === 5 && env.DB_PATH) {
    const d = openDb(env.DB_PATH);
    d.prepare("INSERT INTO settings(key, value) VALUES('endHourCloseMin', '0') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
    d.close();
    if (!notes.some((n) => /5h–6h/.test(n))) note('Chạy lúc 5h–6h sáng: đã tắt giờ nghỉ nhận ChatGPT / Claude cho lần chạy này (đã có bài kiểm riêng)');
  }
  const p = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'src/server.js'], { cwd: ROOT, env: { PATH: process.env.PATH, ...env } });
  p.stdout.on('data', (d) => { serverLog += d; });
  p.stderr.on('data', (d) => { serverLog += d; });
  return p;
}
async function waitHealthy() {
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`${URL_}/healthz`)).ok) return true; } catch { /* chưa lên */ }
    await sleep(100);
  }
  return false;
}
async function stopServer() {
  if (!server) return;
  const done = new Promise((r) => server.once('exit', r));
  server.kill('SIGTERM');
  await done;
  server = null;
}

// ---------- "Điện thoại" của khách: cookie riêng, IP riêng (do Caddy ghi vào X-Real-IP) ----------
class Device {
  constructor(label, ip, ua = MOBILE_UA) { this.label = label; this.ip = ip; this.ua = ua; this.jar = {}; this.extra = {}; }
  async req(method, path, { json, form, headers = {}, redirect = 'manual' } = {}) {
    const h = { 'User-Agent': this.ua, 'X-Real-IP': this.ip, ...this.extra, ...headers };
    const cookie = Object.entries(this.jar).map(([k, v]) => `${k}=${v}`).join('; ');
    if (cookie) h.Cookie = cookie;
    let body;
    if (method === 'POST' && !('Origin' in h)) h.Origin = BASE;
    if (json !== undefined) { body = JSON.stringify(json); h['Content-Type'] = 'application/json'; }
    if (form !== undefined) { body = new URLSearchParams(form).toString(); h['Content-Type'] = 'application/x-www-form-urlencoded'; }
    // Location trả về đã có tiền tố (/colap/…) → bỏ đi vì URL_ đã kèm.
    const p = BP && path.startsWith(`${BP}/`) ? path.slice(BP.length) : path;
    const res = await fetch(URL_ + p, { method, headers: h, body, redirect });
    for (const c of res.headers.getSetCookie()) {
      const [kv, ...attrs] = c.split(';');
      const i = kv.indexOf('=');
      const k = kv.slice(0, i).trim();
      const v = kv.slice(i + 1).trim();
      if (/max-age=0/i.test(attrs.join(';')) || v === '') delete this.jar[k]; else this.jar[k] = v;
    }
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch { data = null; }
    return { status: res.status, text, data, location: res.headers.get('location') };
  }
  get(path, o) { return this.req('GET', path, o); }
  post(path, json, o = {}) { return this.req('POST', path, { json, ...o }); }
}

const vn = (p) => '84' + p.slice(1);
const lastOtp = (phone) => (otpInbox.get(vn(phone)) || []).at(-1);
async function login(dev, phone) {
  const s = await dev.post('/api/otp/send', { phone });
  if (!s.data?.ok) return { ok: false, step: 'send', ...s.data };
  await sleep(30);
  const code = lastOtp(phone);
  const v = await dev.post('/api/otp/verify', { phone, code, consent: true });
  return v.data?.ok ? { ok: true } : { ok: false, step: 'verify', ...v.data };
}

/** Vé như QS gắn vào nút "Nhận công cụ làm việc miễn phí" khi khách mở trang quán bằng thẻ / QR trên bàn. */
const ticket = (shop, at = Date.now()) => makeTicket(ENV.QS_TICKET_KEY, shop, at, randomBytes(12).toString('base64url'));
/** Khách bấm nút trên trang quán QS: link có vé → TBQ ghi lượt vào, chuyển về link sạch → mở trang. */
async function enter(dev, shop, t = ticket(shop)) {
  const go = await dev.get(`/qs/${shop}?t=${t}`);
  if (go.status !== 303) return go;
  return dev.get(go.location);
}

let db;
const q = (sql, ...p) => db.prepare(sql).get(...p);
const qa = (sql, ...p) => db.prepare(sql).all(...p);

async function mail(payload, { secret = ENV.MAIL_WEBHOOK_SECRET } = {}) {
  const body = JSON.stringify({ message_id: `m-${randomBytes(6).toString('hex')}`, date: new Date().toISOString(), ...payload });
  const res = await fetch(`${URL_}/hooks/mail`, {
    method: 'POST', body,
    headers: { 'Content-Type': 'application/json', 'X-Signature': `sha256=${hmac(secret, body)}`, 'X-Real-IP': '104.30.0.1' },
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}
const gptCode = (to, code) => mail({ to, from: 'noreply@tm.openai.com', subject: `Your ChatGPT code is ${code}`, text: `Enter this temporary verification code to continue: ${code}` });
const claudeCode = (to, code) => mail({ to, from: 'no-reply@mail.anthropic.com', subject: 'Your Claude login code', text: `Your verification code is ${code}` });
async function waitFor(fn, ms = 40_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { const v = await fn(); if (v) return v; await sleep(500); }
  return null;
}

// ========================================================================================
async function main() {
  await new Promise((r) => hookServer.listen(HOOK_PORT, '127.0.0.1', r));

  part('0. Khởi động như production');
  {
    const bad = startServer({ ...ENV, CLIENT_IP_HEADER: '' });
    const code = await new Promise((r) => bad.once('exit', r));
    check('Thiếu CLIENT_IP_HEADER ở production → từ chối chạy', code === 1 && /CLIENT_IP_HEADER/.test(serverLog), serverLog.slice(-200));
    serverLog = '';
    const devOtp = startServer({ ...ENV, OTP_PROVIDER: 'dev', OTP_DEV_SHOW: '1' });
    const code2 = await new Promise((r) => devOtp.once('exit', r));
    check('OTP dev (hiện mã ra màn hình) ở production → từ chối chạy', code2 === 1);
    serverLog = '';
    const noKey = startServer({ ...ENV, QS_TICKET_KEY: '' });
    const code3 = await new Promise((r) => noKey.once('exit', r));
    check('Thiếu QS_TICKET_KEY (khoá vé chung với QS) ở production → từ chối chạy', code3 === 1 && /QS_TICKET_KEY/.test(serverLog), serverLog.slice(-200));
    serverLog = '';
    // Thêm danh sách công cụ như lúc cài đặt lần đầu (npm run seed)
    await new Promise((r) => spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'scripts/seed.js'], { cwd: ROOT, env: { PATH: process.env.PATH, ...ENV } }).once('exit', r));
    server = startServer();
    check('Server production chạy, /healthz trả ok', await waitHealthy(), serverLog);
    db = new DatabaseSync(DB_PATH);
    db.exec('PRAGMA busy_timeout = 5000');
  }

  part('1. Chủ tiệm thêm quán có QS (chỉ cần mã quán QS), nhập kho tài khoản (qua trang quản trị)');
  const owner = new Device('chủ tiệm', '171.244.1.1', LAPTOP_UA);
  let csrf;
  const tool = Object.fromEntries(qa('SELECT slug, id FROM tools').map((t) => [t.slug, t.id]));
  {
    const wrong = await owner.req('POST', '/admin/login', { form: { password: 'sai-mat-khau' } });
    check('Sai mật khẩu quản trị → không vào được', !owner.jar.adm && /Sai/.test(decodeURIComponent(wrong.location || '')));
    const forged = await owner.req('POST', '/admin/login', { form: { password: ENV.ADMIN_PASSWORD }, headers: { Origin: 'https://evil.example' } });
    check('Đăng nhập quản trị từ trang lạ (CSRF) → 403', forged.status === 403);
    await owner.req('POST', '/admin/login', { form: { password: ENV.ADMIN_PASSWORD } });
    const home = await owner.get('/admin');
    csrf = /name="_csrf" value="([^"]+)"/.exec(home.text)?.[1];
    check('Đúng mật khẩu → vào trang quản trị', home.status === 200 && csrf);
    const admin = (path, form) => owner.req('POST', path, { form: { _csrf: csrf, ...form } });

    const noCsrf = await owner.req('POST', '/admin/cafes', { form: { name: 'Quán giả' } });
    check('Form quản trị thiếu mã CSRF → 403', noCsrf.status === 403);

    const badSlug = await admin('/admin/cafes', { name: 'Cà phê Thử 24h', qs_slug: 'Có dấu!', daily_quota: '20' });
    check('Mã quán QS sai định dạng → nhắc sửa, chưa thêm quán', /chữ thường không dấu/.test(decodeURIComponent(badSlug.location || '')) && !q("SELECT 1 FROM cafes"));
    await admin('/admin/cafes', { name: 'Cà phê Thử 24h', address: '12 Lê Lợi, Q1', qs_slug: 'ab12cd', daily_quota: '20' });
    const cafe = q("SELECT * FROM cafes WHERE name = 'Cà phê Thử 24h'");
    check('Thêm quán, gắn mã quán QS "ab12cd" — không tạo thẻ / màn hình gì ở quán', cafe?.qs_slug === 'ab12cd' && q("SELECT COUNT(*) AS n FROM cards WHERE kind = 'nfc'").n === 0);
    const page = await owner.get(`/admin/cafes/${cafe.id}`);
    check('Trang quán có cách nối QS, không có màn hình quầy / mã quầy, chưa có thẻ riêng', page.text.includes('/qs/ab12cd') && !/Màn hình quầy|mã quầy/.test(page.text) && /Thẻ NFC riêng của Tiệm \(0\)/.test(page.text));
    await admin('/admin/accounts', { tool_id: String(tool.chatgpt), lines: 'gpt-a@kho.test\ngpt-b@kho.test' });
    await admin('/admin/accounts', { tool_id: String(tool.claude), lines: 'claude-a@kho.test' });
    await admin('/admin/accounts', { tool_id: String(tool.capcut), lines: 'capcut-a@kho.test,MatKhauCapCut#1' });
    check('Nhập kho: 2 ChatGPT, 1 Claude, 1 CapCut (có mật khẩu)', q('SELECT COUNT(*) AS n FROM accounts').n === 4);
    const enc = q("SELECT password_enc FROM accounts WHERE login_email = 'capcut-a@kho.test'").password_enc;
    check('Mật khẩu trong kho được mã hoá (không lưu chữ thường)', enc && !enc.includes('MatKhauCapCut'));
  }
  const cafe = q("SELECT * FROM cafes WHERE name = 'Cà phê Thử 24h'");
  const acct = (email) => q('SELECT * FROM accounts WHERE login_email = ?', email);
  const admin = (path, form) => owner.req('POST', path, { form: { _csrf: csrf, ...form } });
  const adminJson = (path, json) => owner.req('POST', path, { json, headers: { 'x-csrf': csrf } });

  part('2. Vé từ trang quán QS — Tiệm không đặt gì ở quán');
  {
    const X = new Device('người lạ', '14.161.9.9');
    for (const old of [`/quan/${cafe.display_token}`, `/api/quan/${cafe.display_token}/code`, '/qs']) {
      check(`Link cũ ${old.replace(cafe.display_token, '<token>')} → 404 (không còn màn hình quầy / link chung)`, (await X.get(old)).status === 404);
    }
    check('Thẻ NFC không có trong hệ thống /c/abc → 404', (await X.get('/c/abc')).status === 404);
    const plain = await X.get('/qs/ab12cd');
    check('Link trang quán KHÔNG có vé (lan trên mạng) → chỉ hướng dẫn chạm thẻ / quét QR, không có ô SĐT', /Nhận tại quán nhé/.test(plain.text) && !/Gửi mã qua/.test(plain.text));
    const bad = await X.get(`/qs/ab12cd?t=${ticket('ab12cd').slice(0, -4)}AAAA`);
    check('Vé sửa chữ ký → không hợp lệ', /không hợp lệ/.test(bad.text));
    const old = await X.get(`/qs/ab12cd?t=${ticket('ab12cd', Date.now() - 31 * 60e3)}`);
    check('Vé quá 30 phút → "Link này đã cũ"', /đã cũ/.test(old.text));
    const otherShop = await X.get(`/qs/ab12cd?t=${ticket('quankhac')}`);
    check('Vé của quán khác → không hợp lệ', /không hợp lệ/.test(otherShop.text));
    check('Không vé nào ở trên tạo lượt vào', q('SELECT COUNT(*) AS n FROM taps').n === 0);
  }

  part('3. Khách A — ngồi quán, chạm thẻ → trang quán QS → bấm nút (có vé) → nhận ChatGPT');
  const A = new Device('A', CAFE_IP);
  {
    const tA = ticket('ab12cd');
    const bot = new Device('Zalo xem trước link', '125.212.1.1', 'Zalo-Link-Preview/1.0');
    await bot.get(`/qs/ab12cd?t=${tA}`);
    check('Máy chủ Zalo tải link để làm ảnh xem trước → không tính lượt vào, không giữ vé', q('SELECT COUNT(*) AS n FROM taps').n === 0 && q('SELECT COUNT(*) AS n FROM qs_tickets').n === 0);

    const go = await A.get(`/qs/ab12cd?t=${tA}`);
    check('Bấm nút trên trang quán → vé đúng → chuyển về link sạch /qs/ab12cd', go.status === 303 && go.location === `${BP}/qs/ab12cd`);
    const entry = await A.get('/qs/ab12cd');
    check('Trang của đúng quán, có ô nhận mã', entry.status === 200 && entry.text.includes('Cà phê Thử 24h') && /Gửi mã qua/.test(entry.text));
    const s1 = await A.post('/api/otp/send', { phone: '0901000001' });
    await sleep(30);
    check('Gửi OTP → đi qua eSMS (đúng khoá API, brandname)', s1.data?.ok && lastOtp('0901000001') && badOtpSig === 0, s1.data);
    check('Production KHÔNG trả mã OTP về trình duyệt', s1.data && !('devCode' in s1.data));
    const w = await A.post('/api/otp/verify', { phone: '0901000001', code: '000000', consent: true });
    check('Nhập sai OTP → báo sai', w.data?.code === 'invalid');
    const nc = await A.post('/api/otp/verify', { phone: '0901000001', code: lastOtp('0901000001') });
    check('Chưa tick đồng ý điều khoản → chưa cho vào', nc.data?.code === 'consent_required');
    const ok = await A.post('/api/otp/verify', { phone: '0901000001', code: lastOtp('0901000001'), consent: true });
    check('Đúng OTP + đồng ý → đăng nhập', ok.data?.ok && A.jar.sid);
    const reuse = await new Device('A2', CAFE_IP).post('/api/otp/verify', { phone: '0901000001', code: lastOtp('0901000001'), consent: true });
    check('Dùng lại OTP đã dùng → không được', !reuse.data?.ok);

    const c = await A.post('/api/claim', { toolId: tool.chatgpt });
    check('Nhận ChatGPT ngay (không Wi-Fi, không mã quầy)', c.data?.status === 'active', c.data);
    const me = await A.get('/api/me');
    check('Trang "Slot của tôi": hiện email tài khoản, còn ~24 giờ', me.data?.view?.accountEmail && Math.abs(me.data.view.expiresAt - Date.now() - 24 * 3600e3) < 60e3, me.data?.view);
  }
  const slotA = q("SELECT * FROM slots WHERE customer_id = (SELECT id FROM customers WHERE phone = '84901000001')");
  const gptA = q('SELECT * FROM accounts WHERE id = ?', slotA.account_id);

  part('4. Khách A lấy mã đăng nhập ChatGPT');
  {
    const r = await A.post('/api/code/request', {});
    check('Bấm "Lấy mã" → mở lượt chờ mã 3 phút', r.data?.status === 'open', r.data);
    const fake = await mail({ to: gptA.login_email, from: 'noreply@tm.openai.com', subject: 'Your ChatGPT code is 111111', text: 'code 111111' }, { secret: 'doan-bua' });
    check('Thư giả (sai chữ ký webhook) → 401, không nhận', fake.status === 401);
    const m = await gptCode(gptA.login_email, '482913');
    check('Dịch vụ mail đẩy thư mã về → nhận ra là mã đăng nhập, khớp lượt của A', m.data?.results?.[0]?.verdict === 'matched', m.data);
    const st = await A.get(`/api/code/status/${r.data.windowId}`);
    check('A thấy mã 482913 trên điện thoại', st.data?.code === '482913', st.data);
    const spy = new Device('kẻ tò mò', CAFE_IP);
    await login(spy, '0901000099');
    const spySt = await spy.get(`/api/code/status/${r.data.windowId}`);
    check('Người khác đoán số lượt → không xem được mã của A', spySt.data?.code === undefined, spySt.data);
    const dup = await mail({ message_id: 'trung-lap-1', to: gptA.login_email, from: 'noreply@tm.openai.com', subject: 'Your ChatGPT code is 555555', text: '555555' });
    const dup2 = await mail({ message_id: 'trung-lap-1', to: gptA.login_email, from: 'noreply@tm.openai.com', subject: 'Your ChatGPT code is 555555', text: '555555' });
    check('Dịch vụ mail gửi lại cùng 1 thư 2 lần → chỉ xử lý 1 lần', dup2.data?.results?.[0]?.duplicate === true && !dup.data?.results?.[0]?.duplicate);

    const r2 = await A.post('/api/code/request', {});
    // Lượt 1 đã nhận mã nhưng vẫn còn trong 3 phút → trả lại lượt cũ. Đóng lượt rồi xin lần 2.
    await A.post(`/api/code/cancel/${r.data.windowId}`, {});
    db.prepare("UPDATE code_windows SET status = 'expired' WHERE id = ?").run(r.data.windowId);
    const r4 = await A.post('/api/code/request', {});
    check('Xin mã lần 2 (vẫn ở quán, đúng máy) → mở ngay, không ai phải duyệt', r4.data?.status === 'open', { r2: r2.data, r4: r4.data });
    await gptCode(gptA.login_email, '777001');
    const st4 = await A.get(`/api/code/status/${r4.data.windowId}`);
    check('Mã lần 2 về đúng A', st4.data?.code === '777001', st4.data);
    await A.post(`/api/code/cancel/${r4.data.windowId}`, {});
    const A2 = new Device('laptop của A', CAFE_IP, LAPTOP_UA);
    await enter(A2, 'ab12cd');
    await login(A2, '0901000001');
    const other = await A2.post('/api/code/request', {});
    check('Xin mã trên máy khác (dù đang ở quán) → từ chối, ghi cảnh báo', other.data?.code === 'second_device' && !!alertEvent('code_second_device'), other.data);
  }

  part('5. Khách B — dùng 4G, gửi link cho bạn ở nhà');
  const B = new Device('B', '27.72.100.5');
  {
    const tB = ticket('ab12cd');
    const e = await enter(B, 'ab12cd', tB);
    check('4G vào bình thường bằng vé (Tiệm không xem IP)', e.status === 200 && e.text.includes('Cà phê Thử 24h'));
    const friend = new Device('bạn của B ở nhà', '14.161.30.30');
    const shared = await friend.get(`/qs/ab12cd?t=${tB}`);
    check('B gửi link (có vé) cho bạn ở nhà → bạn bị từ chối "đã mở trên một máy khác"', /đã được mở trên một máy khác/.test(shared.text));
    await login(friend, '0901000020');
    const fr = await friend.post('/api/claim', { toolId: tool.chatgpt });
    check('Bạn ở nhà đăng nhập rồi gọi thẳng API nhận → need_entry', fr.data?.status === 'need_entry', fr.data);
    check('B đăng nhập', (await login(B, '0901000002')).ok);
    const c = await B.post('/api/claim', { toolId: tool.chatgpt });
    check('B nhận ChatGPT (tài khoản thứ 2)', c.data?.status === 'active', c.data);
  }
  const slotB = q("SELECT * FROM slots WHERE customer_id = (SELECT id FROM customers WHERE phone = '84901000002') AND status = 'active'");
  check('A và B được giao 2 tài khoản ChatGPT khác nhau', slotB && slotB.account_id !== slotA.account_id);

  part('6. Khách C — muốn ChatGPT nhưng kho đã hết, chuyển sang Claude');
  const C = new Device('C', CAFE_IP);
  {
    await enter(C, 'ab12cd');
    check('C vào bằng vé → 1 lượt vào', q('SELECT COUNT(*) AS n FROM taps WHERE device_id = ?', C.jar.did).n === 1);
    check('C đăng nhập', (await login(C, '0901000003')).ok);
    const x = await C.post('/api/claim', { toolId: tool.chatgpt });
    check('ChatGPT hết tài khoản → báo tạm hết slot', x.data?.code === 'no_account', x.data);
    const y = await C.post('/api/claim', { toolId: tool.claude });
    check('Chọn Claude → nhận được', y.data?.status === 'active', y.data);
    const z = await C.post('/api/claim', { toolId: tool.capcut });
    check('Nhận thêm công cụ thứ 2 trong ngày → bị chặn', z.data?.ok === false && ['has_active_slot', 'daily_limit'].includes(z.data?.code), z.data);
  }

  part('7. Gian lận: ở nhà, có link trang quán nhưng không có vé');
  {
    const H = new Device('ở nhà', '14.161.7.7');
    H.extra = { 'CF-Connecting-IP': CAFE_IP, 'X-Forwarded-For': CAFE_IP, 'True-Client-IP': CAFE_IP };
    await H.get('/qs/ab12cd');
    await login(H, '0901000004');
    const r = await H.post('/api/claim', { toolId: tool.capcut });
    check('Giả IP quán + link không vé → vẫn need_entry', r.data?.status === 'need_entry', r.data);
    const forged = await H.get(`/qs/ab12cd?t=1.${Math.floor(Date.now() / 1000)}.tu-che-ve-0001.${'A'.repeat(32)}`);
    check('Tự chế vé (không có khoá) → không hợp lệ', /không hợp lệ/.test(forged.text));
    const unk = await H.get('/qs/khongcoquannay');
    check('Mã quán QS lạ → báo "chưa có chương trình" + ghi nhật ký cho chủ', unk.status === 200 && /chưa mở chương trình/.test(unk.text) && q("SELECT COUNT(*) AS n FROM events WHERE type = 'qs_shop_unmapped'").n === 1);
  }

  part('8. Gian lận: 1 máy, nhiều SĐT');
  {
    const r = await login(A, '0901000005');
    const c = await A.post('/api/claim', { toolId: tool.capcut });
    check('Máy của A đăng nhập SĐT thứ 2 rồi xin slot → bị chặn', c.data?.ok === false && ['device_busy', 'device_phone_limit'].includes(c.data?.code), { login: r, claim: c.data });
    await login(A, '0901000001'); // A đăng nhập lại số của mình
  }

  part('9. Gian lận: chép cookie phiên sang máy khác, gửi yêu cầu từ trang lạ, dò OTP');
  {
    const thief = new Device('kẻ trộm cookie', '14.161.7.8');
    thief.jar.sid = A.jar.sid;
    const r = await thief.get('/api/me');
    check('Chép cookie đăng nhập của A sang máy khác → không dùng được', r.status === 401, r.data);
    const csrfTry = await A.post('/api/claim', { toolId: tool.capcut }, { headers: { Origin: 'https://evil.example' } });
    check('Trang lạ ra lệnh nhận slot thay A (CSRF) → 403', csrfTry.status === 403);
    const G = new Device('dò OTP', '14.161.7.9');
    await G.post('/api/otp/send', { phone: '0901000006' });
    const tries = [];
    for (let i = 0; i < 5; i++) tries.push((await G.post('/api/otp/verify', { phone: '0901000006', code: String(100000 + i), consent: true })).data);
    const real = await G.post('/api/otp/verify', { phone: '0901000006', code: lastOtp('0901000006'), consent: true });
    check('Đoán OTP 5 lần sai → mã bị huỷ, mã đúng cũng không dùng được nữa', tries[4]?.code === 'too_many_attempts' && !real.data?.ok, { last: tries[4], real: real.data });
    const sends = [];
    for (let i = 0; i < 4; i++) sends.push((await G.post('/api/otp/send', { phone: '0901000007' })).data);
    check('Xin OTP liên tục cho 1 SĐT → lần thứ 4 trong giờ bị chặn', sends.slice(0, 3).every((s) => s.ok) && sends[3].code === 'rate_limited', sends.map((s) => s.code || 'ok'));
  }

  part('10. Mã mồ côi: có người tự đăng nhập tài khoản kho mà không bấm "Lấy mã"');
  {
    const gptB = acct(q('SELECT login_email FROM accounts WHERE id = ?', slotB.account_id).login_email);
    const m = await gptCode(gptB.login_email, '909090');
    check('Mã về khi B đang giữ nhưng không ai bấm "Lấy mã" → chờ 90 giây (có thể B bấm gửi sớm)', m.data?.results?.[0]?.verdict === 'orphan_wait', m.data);
    db.prepare("UPDATE mails SET received_at = received_at - 100000 WHERE verdict = 'orphan_wait'").run();
    const a = await waitFor(() => alertEvent('code_orphan'));
    check('Quá 90 giây không ai nhận → việc định kỳ báo động đỏ "mã mồ côi" cho chủ', !!a);
    const st = await B.get('/api/me');
    check('Mã mồ côi KHÔNG hiện cho ai', !JSON.stringify(st.data).includes('909090'));
  }

  part('11. Ai đó đổi mật khẩu tài khoản Claude → cách ly');
  {
    const cl = acct('claude-a@kho.test');
    const m = await mail({ to: cl.login_email, from: 'no-reply@mail.anthropic.com', subject: 'Your password was changed', text: 'The password for your Claude account was changed.' });
    check('Thư "mật khẩu đã đổi" → tài khoản bị cách ly', m.data?.results?.[0]?.verdict === 'quarantined' && acct('claude-a@kho.test').status === 'quarantined', m.data);
    const me = await C.get('/api/me');
    check('Slot của C bị thu hồi (lỗi phía Tiệm)', me.data?.view?.status === 'revoked' && me.data.view.endReason === 'account_quarantined', me.data?.view);
    check('Có việc tay "đổi mật khẩu" + báo động đỏ', q("SELECT COUNT(*) AS n FROM rotation_tasks WHERE account_id = ? AND kind = 'rotate' AND status = 'todo'", cl.id).n === 1
      && !!alertEvent('account_quarantined'));
    const again = await C.post('/api/claim', { toolId: tool.capcut });
    check('C không bị mất lượt: nhận ngay CapCut thay thế', again.data?.status === 'active', again.data);
    const me2 = await C.get('/api/me');
    check('CapCut: C thấy mật khẩu trên đúng máy đã nhận', me2.data?.view?.password === 'MatKhauCapCut#1');
    const C2 = new Device('laptop của C', CAFE_IP, LAPTOP_UA);
    await login(C2, '0901000003');
    const me3 = await C2.get('/api/me');
    check('CapCut: mở trên máy khác → KHÔNG thấy mật khẩu', me3.data?.view && me3.data.view.password === null, me3.data?.view);
  }

  part('13. Nhiều người tranh 1 tài khoản cuối cùng cùng lúc');
  {
    await admin('/admin/accounts', { tool_id: String(tool.claude), lines: 'claude-b@kho.test' });
    const crowd = [];
    for (let i = 0; i < 8; i++) {
      const d = new Device(`khách ${i}`, CAFE_IP);
      await enter(d, 'ab12cd');
      const l = await login(d, `09020000${String(i).padStart(2, '0')}`);
      if (l.ok) crowd.push(d);
    }
    check('8 khách cùng quán đăng nhập được', crowd.length === 8);
    const rs = await Promise.all(crowd.map((d) => d.post('/api/claim', { toolId: tool.claude })));
    const won = rs.filter((r) => r.data?.status === 'active').length;
    check('8 người bấm cùng lúc → đúng 1 người nhận, 7 người báo hết slot', won === 1 && rs.filter((r) => r.data?.code === 'no_account').length === 7, rs.map((r) => r.data?.status || r.data?.code));
    check('Tài khoản không bị giao trùng', q("SELECT COUNT(*) AS n FROM slots WHERE account_id = ? AND status = 'active'", acct('claude-b@kho.test').id).n === 1);
    const E = crowd[rs.findIndex((r) => r.data?.code === 'no_account')];
    await admin('/admin/accounts', { tool_id: String(tool.claude), lines: 'claude-c@kho.test' });
    const dbl = await Promise.all(Array.from({ length: 5 }, () => E.post('/api/claim', { toolId: tool.claude })));
    check('1 khách bấm "Nhận" 5 lần liên tục → chỉ 1 slot', q("SELECT COUNT(*) AS n FROM slots WHERE device_id = ? AND status = 'active'", E.jar.did).n === 1, dbl.map((r) => r.data?.status || r.data?.code));
  }

  part('14. Hết 24 giờ → thu hồi, việc tay đổi mật khẩu');
  {
    db.prepare('UPDATE slots SET expires_at = ? WHERE id = ?').run(Date.now() - 1000, slotA.id);
    const expired = await waitFor(() => q('SELECT status FROM slots WHERE id = ?', slotA.id).status === 'expired');
    check('Việc định kỳ tự kết thúc slot quá giờ của A', !!expired);
    check('Tài khoản của A chuyển "cần đổi mật khẩu", không giao cho người khác', acct(gptA.login_email).status === 'needs_rotation');
    const me = await A.get('/api/me');
    check('A thấy slot đã hết hạn, không còn email tài khoản', me.data?.view?.status === 'expired' && !me.data.view.accountEmail, me.data?.view);
    const code = await A.post('/api/code/request', {});
    check('A hết hạn xin mã tiếp → bị từ chối', code.data?.code === 'expired', code.data);
    const late = await gptCode(gptA.login_email, '313131');
    check('A ở nhà tự đăng nhập lại → mã mồ côi, A bị cộng điểm rủi ro', late.data?.results?.[0]?.verdict === 'orphan'
      && q("SELECT risk FROM customers WHERE phone = '84901000001'").risk >= 15, late.data);
    const task = q("SELECT * FROM rotation_tasks WHERE account_id = ? AND kind = 'rotate' AND status = 'todo'", gptA.id);
    const r = await admin(`/admin/tasks/${task.id}/done`, {});
    check('Chủ đổi mật khẩu xong, bấm "Xong" → tài khoản sẵn sàng giao lại', r.status === 303 && acct(gptA.login_email).status === 'ready');
  }

  part('15. Khởi động lại máy chủ giữa chừng');
  {
    await stopServer();
    server = startServer();
    await waitHealthy();
    const me = await B.get('/api/me');
    check('Sau khi khởi động lại: B vẫn đăng nhập, slot vẫn chạy', me.data?.view?.status === 'active', me.data);
  }

  part('16. Chủ tạm dừng quán');
  {
    await admin(`/admin/cafes/${cafe.id}`, { name: cafe.name, address: cafe.address, qs_slug: 'ab12cd', daily_quota: '20', status: 'paused' });
    const F = new Device('F', CAFE_IP);
    const e = await enter(F, 'ab12cd');
    await login(F, '0901000010');
    const r = await F.post('/api/claim', { toolId: tool.chatgpt });
    check('Quán tạm dừng → khách mới không nhận được', /tạm dừng/.test(e.text) && r.data?.ok === false, r.data);
    await admin(`/admin/cafes/${cafe.id}`, { name: cafe.name, address: cafe.address, qs_slug: 'ab12cd', daily_quota: '20', status: 'active' });
  }

  part('17. Quán đông khách: nhiều người cùng Wi-Fi xin OTP trong 1 giờ');
  {
    const sentFromCafe = q("SELECT COUNT(*) AS n FROM otps WHERE ip = ?", CAFE_IP).n;
    let firstBlocked = null;
    for (let i = 0; i < 40 && !firstBlocked; i++) {
      const d = new Device(`đông ${i}`, CAFE_IP);
      const r = await d.post('/api/otp/send', { phone: `09030000${String(i).padStart(2, '0')}` });
      if (!r.data?.ok) firstBlocked = sentFromCafe + i + 1;
    }
    if (firstBlocked) note(`Cùng 1 Wi-Fi quán: người thứ ${firstBlocked} trong 1 giờ không nhận được OTP (giới hạn "OTP / IP / giờ" = 30). Đủ dùng khi quán có 20 suất/ngày; tăng suất lớn thì tăng số này.`);
    check('Có giới hạn OTP theo IP (chống spam SMS/ZNS tốn tiền)', !!firstBlocked);
  }

  part('18. Quán chưa dùng QS — thẻ NFC riêng của Tiệm trên bàn (chip NTAG thường)');
  {
    const made = await admin('/admin/cafes', { name: 'Cà phê Không QS', address: '9 Hai Bà Trưng', daily_quota: '20' });
    const plain = q("SELECT * FROM cafes WHERE name = 'Cà phê Không QS'");
    check('Thêm quán KHÔNG cần mã quán QS', plain && plain.qs_slug === null && /Tạo thẻ NFC/.test(decodeURIComponent(made.location || '')));
    await admin(`/admin/cafes/${plain.id}/cards`, { count: '3', prefix: 'Bàn', start: '1' });
    const csv = await owner.get(`/admin/cafes/${plain.id}/cards.csv`);
    const links = [...csv.text.matchAll(new RegExp(`${BASE.replace(/[./]/g, '\\$&')}/c/([A-Za-z0-9_-]+)`, 'g'))].map((m) => m[1]);
    check('Tạo 3 thẻ, tải CSV link để ghi chip', csv.status === 200 && links.length === 3, csv.text);
    await admin('/admin/accounts', { tool_id: String(tool.capcut), lines: 'capcut-n1@kho.test,MatKhauN1#1\ncapcut-n2@kho.test,MatKhauN2#2\ncapcut-n3@kho.test,MatKhauN3#3' });
    const IP2 = '113.161.40.50'; // Wi-Fi quán thứ 2
    const UID = '04A1B2C3D4E5F6';
    const t1 = (n) => `/c/${links[0]}?m=${UID}x${n.toString(16).padStart(6, '0').toUpperCase()}`;

    const G = new Device('G', IP2);
    const g1 = await G.get(t1(1));
    check('Chạm thẻ Bàn 1 (chip bật UID + bộ đếm) → trang nhận của đúng quán, có ô nhận mã', g1.status === 200 && g1.text.includes('Cà phê Không QS') && /Gửi mã qua/.test(g1.text));
    check('Lần chạm đầu: TBQ nhớ UID chip và bộ đếm', q('SELECT nfc_uid, last_counter FROM cards WHERE token = ?', links[0])?.last_counter === 1);
    check('Khách G đăng nhập OTP', (await login(G, '0904000001')).ok);
    check('Tải lại cùng link trên cùng máy (sau đăng nhập) → vẫn ở quán', /Hôm nay bạn cần món nào/.test((await G.get(t1(1))).text));
    const gc = await G.post('/api/claim', { toolId: tool.capcut });
    check('Nhận CapCut qua thẻ riêng', gc.data?.status === 'active', gc.data);
    check('Slot ghi đúng quán + đúng thẻ', q("SELECT k.label FROM slots s JOIN cards k ON k.id = s.card_id WHERE s.customer_id = (SELECT id FROM customers WHERE phone = '84904000001')")?.label === 'Bàn 1');

    const H = new Device('H (bạn ở nhà của G)', '27.72.1.1');
    const h1 = await H.get(t1(1));
    check('Bạn ở nhà mở link G gửi qua Zalo (bộ đếm cũ) → bảo chạm lại thẻ, không tính lượt vào', /Chạm lại thẻ/.test(h1.text) && !/Gửi mã qua/.test(h1.text));
    const h2 = await H.get(`/c/${links[0]}`);
    check('Cắt bỏ phần ?m= khỏi link → cũng bị chặn', /Chạm lại thẻ/.test(h2.text));
    const h3 = await H.get(`/c/${links[0]}?m=04FFFFFFFFFFFFx000099`);
    check('Tự bịa UID chip khác → bị chặn, báo đỏ', /Chạm lại thẻ/.test(h3.text) && q("SELECT 1 FROM events WHERE type = 'tap_forged'"));
    await login(H, '0904000002');
    const hc = await H.post('/api/claim', { toolId: tool.capcut });
    check('Bạn ở nhà không nhận được công cụ', hc.data?.status === 'need_entry', hc.data);
    const g2 = new Device('G2 (chạm thật lần sau)', IP2);
    check('Khách khác chạm thật (bộ đếm tăng) → được', /Gửi mã qua/.test((await g2.get(t1(2))).text));

    // Chip không bật bộ đếm: chỉ còn giới hạn suất / thẻ / ngày.
    await admin('/admin/settings', { cardDailyClaims: '1' });
    const I = new Device('I', IP2);
    const J = new Device('J', IP2);
    await I.get(`/c/${links[1]}`);
    await login(I, '0904000003');
    const ic = await I.post('/api/claim', { toolId: tool.capcut });
    await J.get(`/c/${links[1]}`);
    await login(J, '0904000004');
    const jc = await J.post('/api/claim', { toolId: tool.capcut });
    check('Chip không bật bộ đếm: mở link là tính, nhưng mỗi thẻ có giới hạn suất / ngày (card_quota)', ic.data?.status === 'active' && jc.data?.code === 'card_quota', [ic.data, jc.data]);
    await admin('/admin/settings', { cardDailyClaims: '6' });
    check('Trang quán: thẻ Bàn 1 "Đã bật" bộ đếm, Bàn 2 "Chưa thấy"', /Đã bật[\s\S]*Chưa thấy/.test((await owner.get(`/admin/cafes/${plain.id}`)).text));

    const card3 = q('SELECT id FROM cards WHERE token = ?', links[2]).id;
    await admin(`/admin/cards/${card3}/lock`, { back: `/admin/cafes/${plain.id}` });
    check('Chủ khoá thẻ Bàn 3 → khách chạm thấy "tạm khoá"', /tạm khoá/.test((await new Device('K', IP2).get(`/c/${links[2]}`)).text));
    const qsCard = q("SELECT id FROM cards WHERE cafe_id = ? AND kind = 'qs'", cafe.id)?.id;
    if (qsCard) {
      await admin(`/admin/cards/${qsCard}/lock`, { back: `/admin/cafes/${cafe.id}` });
      check('Không khoá được lối vào QS ẩn (khoá nó = khoá cả quán; muốn dừng thì Tạm dừng quán)', q('SELECT status FROM cards WHERE id = ?', qsCard).status === 'active');
    }
    const card1 = q('SELECT id FROM cards WHERE token = ?', links[0]).id;
    await admin(`/admin/cards/${card1}/rotate`, { back: `/admin/cafes/${plain.id}` });
    check('Đổi link thẻ Bàn 1 → link cũ không còn (404), phải ghi lại chip', (await new Device('L', IP2).get(t1(3))).status === 404);
    const rep = await owner.get(`/admin/cafes/${plain.id}/report`);
    check('Thống kê quán có bảng "Theo lối vào" từng thẻ', /Theo lối vào[\s\S]*Thẻ NFC: Bàn 1/.test(rep.text));
  }

  part('19. Thống kê nội bộ theo quán');
  {
    const rep = await owner.get(`/admin/cafes/${cafe.id}/report`);
    check('Thống kê theo quán mở được', rep.status === 200 && rep.text.includes('Cà phê Thử 24h'));
    const errs = serverLog.split('\n').filter((l) => /"level":"error"|request failed|TypeError|ReferenceError/.test(l));
    check('Máy chủ không có lỗi 500 nào trong suốt quá trình', errs.length === 0, errs.slice(0, 3).join('\n'));
  }
  await pilot();
}

// ========================================================================================
// Phần 2 — gói chạy thử thật, dựng lại từ đầu trên database trống (như ngày đầu cài đặt):
// npm run seed → npm run pilot → chủ tạo quán, nhập kho đúng định dạng → khách nhận từng loại công cụ.
async function pilot() {
  part('P0. Cài gói chạy thử trên database mới (npm run seed + npm run pilot)');
  await stopServer();
  db.close();
  const PDB = join(DIR, 'pilot.sqlite');
  const env = { ...ENV, DB_PATH: PDB };
  const runScript = (file) => new Promise((r) => {
    let out = '';
    const p = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', file], { cwd: ROOT, env: { PATH: process.env.PATH, ...env } });
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { out += d; });
    p.once('exit', (code) => r({ code, out }));
  });
  await runScript('scripts/seed.js');
  const pl = await runScript('scripts/pilot.js');
  check('npm run pilot: cài 6 công cụ (CapCut/Adobe 7 ngày, ChatGPT 8 + Claude 3 khách tới 6h sáng, Gemini, Canva)', pl.code === 0 && /CapCut Pro\s+7 ngày/.test(pl.out)
    && /ChatGPT Plus\s+tới 6h sáng\s+8 khách/.test(pl.out) && /Claude Pro\s+tới 6h sáng\s+3 khách/.test(pl.out)
    && /Adobe Creative Cloud\s+7 ngày/.test(pl.out) && /Canva Pro/.test(pl.out), pl.out.slice(0, 300));
  serverLog = '';
  server = startServer(env);
  check('Máy chủ chạy với gói chạy thử', await waitHealthy());
  db = new DatabaseSync(PDB);
  db.exec('PRAGMA busy_timeout = 5000');
  const tool = Object.fromEntries(qa('SELECT slug, id FROM tools').map((t) => [t.slug, t.id]));

  const CAFE2_IP = '14.232.50.60';
  const owner = new Device('chủ tiệm', '171.244.1.1', LAPTOP_UA);
  await owner.req('POST', '/admin/login', { form: { password: ENV.ADMIN_PASSWORD } });
  const csrf = /name="_csrf" value="([^"]+)"/.exec((await owner.get('/admin')).text)?.[1];
  const admin = (path, form) => owner.req('POST', path, { form: { _csrf: csrf, ...form } });
  const flash = (r) => decodeURIComponent(/msg=([^&]+)/.exec(r.location || '')?.[1] || '').replace(/\+/g, ' ');
  await admin('/admin/cafes', { name: 'Cà phê Pilot', address: '1 Nguyễn Huệ', qs_slug: 'pilot1', daily_quota: '100' });

  part('P1. Nhập kho đúng định dạng từng loại');
  const GPT_SECRET = 'JBSWY3DPEHPK3PXP';
  {
    const r1 = await admin('/admin/accounts', { tool_id: String(tool.chatgpt), lines: [
      `gpt1@kho.test|P@ss,w0rd;1|${GPT_SECRET}|5`,
      `gpt2@kho.test|Pw#2|jbsw y3dp ehpk 3pxp`,
      'gpt3@kho.test|Pw#3|khong-phai-2fa',
    ].join('\n') });
    check('ChatGPT: 2 tài khoản email|mật khẩu|2FA (mật khẩu có dấu phẩy vẫn đúng), dòng 2FA sai bị bỏ kèm lý do',
      /Đã thêm 2 tài khoản/.test(flash(r1)) && /gpt3@kho.test: khoá 2FA không hợp lệ/.test(flash(r1)), flash(r1));
    const enc = q("SELECT totp_enc, password_enc, max_holders FROM accounts WHERE login_email = 'gpt2@kho.test'");
    check('Khoá 2FA được mã hoá, mặc định 8 khách/tài khoản', enc.totp_enc && !enc.totp_enc.includes(GPT_SECRET) && enc.max_holders === 8);
    await admin('/admin/accounts', { tool_id: String(tool.capcut), lines: 'cc1@kho.test|CapCut#1\ncc2@kho.test|CapCut#2' });
    await admin('/admin/accounts', { tool_id: String(tool.adobe), lines: 'ad1@kho.test|Adobe#1\nad2@kho.test|Adobe#2' });
    const g = await admin('/admin/accounts', { tool_id: String(tool.gemini), lines: 'https://one.google.com/join/AAA111\nhttps://one.google.com/join/BBB222\nGEMINI-CODE-333\nhttp://khong-an-toan.test/x' });
    check('Gemini: 3 mã/link vào kho, link http (không an toàn) bị từ chối', /Đã thêm 3 mã/.test(flash(g)) && /https/.test(flash(g)), flash(g));
    const tl = await owner.get('/admin/tools');
    check('Trang Công cụ hiện thời gian (7 ngày / tới 6h sáng) và lượt/ngày (ChatGPT theo kho, Adobe 4)', /7 ngày/.test(tl.text) && /tới 6h sáng/.test(tl.text)
      && capShown(tl.text, 0, '') && capShown(tl.text, 0, 4) && /3 mã/.test(tl.text));
  }
  const guest = async (phone) => {
    const d = new Device(phone, CAFE2_IP);
    await enter(d, 'pilot1');
    const l = await login(d, phone);
    if (!l.ok) throw new Error(`đăng nhập ${phone}: ${JSON.stringify(l)}`);
    return d;
  };

  let first;
  part('P2. Trang chọn công cụ');
  {
    const d = await guest('0911000001');
    const page = (await d.get('/qs/pilot1')).text;
    check('Thấy đủ công cụ kèm thời gian (7 ngày / Mã nhận quà)', ['ChatGPT Plus', 'CapCut Pro', 'Claude Pro', 'Gemini Pro', 'Adobe Creative Cloud', 'Canva Pro'].every((n) => page.includes(n))
      && /7 ngày/.test(page) && /Mã nhận quà/.test(page));
    check('Có Claude, Canva (mời vào nhóm); có nút "Cần công cụ khác? Liên hệ Tiệm"', page.includes('Claude Pro') && /Canva Pro[\s\S]*?mời vào nhóm|Canva Pro[\s\S]*?Tạm hết/.test(page)
      && /Cần công cụ khác\?/.test(page) && /Liên hệ Tiệm/.test(page));
    check('Trang ghi đúng kênh gửi mã: "Gửi mã qua SMS"', /Gửi mã qua SMS/.test((await enter(new Device('x', CAFE2_IP), 'pilot1')).text));
    first = d;
  }

  part('P3. ChatGPT Plus: số khách / tài khoản theo dòng nhập (gpt1 = 5), Slot riêng, mã 2FA');
  {
    const gs = [first];
    for (let i = 2; i <= 6; i++) gs.push(await guest(`091100000${i}`));
    const rs = [];
    for (const g of gs) rs.push((await g.post('/api/claim', { toolId: tool.chatgpt })).data);
    check('6 khách nhận ChatGPT', rs.every((r) => r.status === 'active'), rs.map((r) => r.status || r.code));
    const views = [];
    for (const g of gs) views.push((await g.get('/api/me')).data.view);
    check('5 khách đầu cùng gpt1 (Slot 1→5), khách 6 sang gpt2 Slot 1',
      JSON.stringify(views.map((v) => [v.accountEmail, v.seat])) === JSON.stringify([['gpt1@kho.test', 1], ['gpt1@kho.test', 2], ['gpt1@kho.test', 3], ['gpt1@kho.test', 4], ['gpt1@kho.test', 5], ['gpt2@kho.test', 1]]),
      views.map((v) => [v.accountEmail, v.seat]));
    const me3 = (await gs[2].get('/me')).text;
    check('Trang khách 3: mật khẩu, "Workspace của bạn: Slot 3", vừa chạm thẻ nên "đã có phiếu", nút "Lấy mã 2FA"', me3.includes('P@ss,w0rd;1') && /Workspace của bạn: <b>Slot 3<\/b>/.test(me3) && /đã có phiếu/.test(me3) && /Lấy mã 2FA/.test(me3));
    check('Khoá 2FA KHÔNG có trong trang khách', !me3.includes(GPT_SECRET) && !JSON.stringify(views).includes(GPT_SECRET));
    const t = (await gs[2].post('/api/code/request', { kind: 'totp' })).data;
    const expect = totpNow(GPT_SECRET, Date.now()).code;
    const prev = totpNow(GPT_SECRET, Date.now() - 30_000).code;
    check('Bấm "Lấy mã 2FA" → mã 6 số đúng như app Authenticator', t.status === 'totp' && (t.code === expect || t.code === prev), t);
    const again = (await gs[2].get('/api/totp')).data;
    check('Mã tự cập nhật (GET /api/totp) trong lượt xem', again.status === 'totp' && /^\d{6}$/.test(again.code));
    const lap = new Device('laptop khách 3', CAFE2_IP, LAPTOP_UA);
    await login(lap, '0911000003');
    check('Laptop của chính khách 3 (máy khác máy đã nhận slot) → không thấy mã 2FA', (await lap.get('/api/totp')).data.status === 'closed');
    const other = (await gs[3].get('/api/totp')).data;
    check('Khách 4 chưa bấm → không thấy mã', other.status === 'closed');
    // Không còn phiếu tự động (đã dùng / hết hạn) và không có phiếu giấy → không lấy được mã dù biết email + mật khẩu.
    db.prepare("UPDATE vouchers SET status = 'void' WHERE device_id IS NOT NULL").run();
    const noVoucher = (await gs[4].post('/api/code/request', { kind: 'totp' })).data;
    check('Không có phiếu → không lấy được mã 2FA (dù biết email + mật khẩu)', noVoucher.status === 'need_voucher', noVoucher);
    db.prepare("INSERT INTO vouchers(code, kind, batch, max_uses, status, created_at) VALUES('E2EPHIEU', 'once', 'e2e', 1, 'active', ?)").run(Date.now());
    const paper = (await gs[4].post('/api/code/request', { kind: 'totp', voucher: 'e2ep-hieu' })).data;
    check('Phiếu giấy vẫn dùng song song → lấy được mã 2FA', paper.status === 'totp', paper);
  }

  part('P4. CapCut Pro: 7 ngày, 2 khách / tài khoản, dùng 1 lần');
  {
    const gs = [];
    for (let i = 1; i <= 5; i++) gs.push(await guest(`091200000${i}`));
    const rs = [];
    for (const g of gs) rs.push((await g.post('/api/claim', { toolId: tool.capcut })).data);
    check('4 khách nhận (2 tài khoản × 2), khách 5 báo hết', rs.slice(0, 4).every((r) => r.status === 'active') && rs[4].code === 'no_account', rs.map((r) => r.status || r.code));
    const v = (await gs[0].get('/api/me')).data.view;
    check('Thời hạn 7 ngày, có mật khẩu, Slot 1/2', Math.abs(v.expiresAt - Date.now() - 7 * 86400e3) < 120e3 && v.password === 'CapCut#1' && v.seat === 1 && v.seatTotal === 2, v);
    const blocked = (await gs[0].post('/api/claim', { toolId: tool.gemini })).data;
    check('Đang giữ CapCut 7 ngày → chưa nhận thêm công cụ khác', blocked.ok === false, blocked);
    // Hết 7 ngày → tài khoản bỏ luôn, không tạo việc đổi mật khẩu.
    const cc1 = q("SELECT id FROM accounts WHERE login_email = 'cc1@kho.test'").id;
    db.prepare('UPDATE slots SET expires_at = ? WHERE account_id = ?').run(Date.now() - 1000, cc1);
    const retired = await waitFor(() => q('SELECT status FROM accounts WHERE id = ?', cc1).status === 'retired');
    check('Hết 7 ngày: tài khoản CapCut tự chuyển "Ngừng dùng", không có việc đổi mật khẩu', !!retired && q('SELECT COUNT(*) AS n FROM rotation_tasks WHERE account_id = ?', cc1).n === 0);
  }

  part('P5. Gemini Pro: link / mã nhận quà dùng 1 lần');
  {
    const gs = [];
    for (let i = 1; i <= 4; i++) gs.push(await guest(`091300000${i}`));
    const rs = [];
    for (const g of gs) rs.push((await g.post('/api/claim', { toolId: tool.gemini })).data);
    check('3 khách nhận, khách 4 báo hết', rs.slice(0, 3).every((r) => r.status === 'active') && rs[3].code === 'no_account', rs.map((r) => r.status || r.code));
    const me = (await gs[0].get('/me')).text;
    check('Khách thấy nút "Nhận Gemini Pro" trỏ đúng link của mình', /href="https:\/\/one\.google\.com\/join\/AAA111"/.test(me) && /Nhận Gemini Pro/.test(me));
    const me3 = (await gs[2].get('/me')).text;
    check('Khách nhận mã (không phải link) thấy mã + nút sao chép', me3.includes('GEMINI-CODE-333') && /data-copy="GEMINI-CODE-333"/.test(me3));
    const vals = [];
    for (const g of gs.slice(0, 3)) vals.push((await g.get('/api/me')).data.view.redeem.value);
    check('3 khách nhận 3 mã/link khác nhau', new Set(vals).size === 3, vals);
  }

  part('P6. Adobe: 2 tài khoản × 2 khách, tối đa 4 lượt/ngày, lấy mã email khi Adobe hỏi');
  {
    const gs = [];
    for (let i = 1; i <= 5; i++) gs.push(await guest(`091400000${i}`));
    const rs = [];
    for (const g of gs) rs.push((await g.post('/api/claim', { toolId: tool.adobe })).data);
    check('4 khách nhận, khách 5 báo hết suất hôm nay', rs.slice(0, 4).every((r) => r.status === 'active') && rs[4].code === 'tool_daily_cap', rs.map((r) => r.status || r.code));
    const v = (await gs[0].get('/api/me')).data.view;
    const w = (await gs[0].post('/api/code/request', {})).data;
    check('Khách bấm "Lấy mã" (mã email của Adobe)', v.canMailCode && w.status === 'open', w);
    await mail({ to: v.accountEmail, from: 'Adobe <message@adobe.com>', subject: 'Your Adobe verification code', text: 'Your verification code is 640213' });
    const st = (await gs[0].get(`/api/code/status/${w.windowId}`)).data;
    check('Mã email của Adobe hiện cho đúng khách', st.code === '640213', st);
  }

  part('P8. Tổng kết gói chạy thử');
  {
    const tl = (await owner.get('/admin/tools')).text;
    check('Trang Công cụ: ChatGPT 6 lượt (theo kho), Adobe 4/4 lượt hôm nay', capShown(tl, 6, '') && capShown(tl, 4, 4));
    const errs = serverLog.split('\n').filter((l) => /"level":"error"|request failed|TypeError|ReferenceError/.test(l));
    check('Máy chủ không có lỗi 500 nào', errs.length === 0, errs.slice(0, 3).join('\n'));
  }

  part('P9. Không dùng eSMS: khách nhập email, Tiệm gửi mã vào hộp thư (OTP_PROVIDER=email)');
  {
    await stopServer();
    serverLog = '';
    const { ESMS_URL, ESMS_API_KEY, ESMS_SECRET_KEY, ESMS_BRANDNAME, ...rest } = env;
    server = startServer({ ...rest, OTP_PROVIDER: 'email', CF_ACCOUNT_ID: 'acc-e2e', CF_EMAIL_TOKEN: 'cf-email-token-e2e',
      MAIL_FROM: 'xacnhan@tiembanquyen.test', CF_EMAIL_URL: `http://127.0.0.1:${HOOK_PORT}/cf-email` });
    check('Máy chủ production chạy với kênh email, không cần ESMS_*', await waitHealthy(), serverLog.slice(-300));
    const d = new Device('khách email', CAFE2_IP);
    const page = (await enter(d, 'pilot1')).text;
    check('Trang hỏi email (ô type=email, "Gửi mã vào email"), không hỏi số điện thoại', /type="email"/.test(page) && /Gửi mã vào email/.test(page) && !/type="tel"/.test(page));
    const badIn = (await d.post('/api/otp/send', { phone: '0913000001' })).data;
    check('Gõ số điện thoại → "Email chưa đúng."', badIn.code === 'invalid_phone' && /Email/.test(badIn.message), badIn);
    const before = badOtpSig;
    const sent = (await d.post('/api/otp/send', { phone: 'Khach.Email@Gmail.com' })).data;
    await sleep(30);
    const code = (otpInbox.get('khach.email@gmail.com') || []).at(-1);
    check('Gửi mã: thư tới đúng địa chỉ (chữ thường), đúng token + người gửi', sent.ok && /^\d{6}$/.test(code || '') && badOtpSig === before, sent);
    const v = (await d.post('/api/otp/verify', { phone: 'khach.email@gmail.com', code, consent: true })).data;
    check('Nhập mã → đăng nhập, khách lưu theo email', v.ok && q("SELECT 1 FROM customers WHERE phone = 'khach.email@gmail.com'"), v);
    const after = (await d.get('/qs/pilot1')).text;
    check('Trang chào "kh***@gmail.com · Đổi email khác"', /kh\*\*\*@gmail\.com/.test(after) && /Đổi email khác/.test(after));
    let got = null;
    for (const slug of ['gemini', 'claude', 'chatgpt', 'adobe', 'capcut']) {
      const r = (await d.post('/api/claim', { toolId: tool[slug] })).data;
      if (r.status === 'active') { got = slug; break; }
    }
    check('Khách đăng nhập bằng email nhận được công cụ như bình thường', !!got);
    const findRes = (await owner.get('/admin/customers?q=khach.email')).text;
    check('Quản trị tìm khách theo email', /khach\.email@gmail\.com/.test(findRes));
    const errs = serverLog.split('\n').filter((l) => /"level":"error"|request failed|TypeError|ReferenceError/.test(l));
    check('Không có lỗi 500 khi chạy kênh email', errs.length === 0, errs.slice(0, 3).join('\n'));
  }
}

try {
  await main();
} catch (err) {
  check('Kịch bản chạy hết không bị dừng giữa chừng', false, String(err?.stack || err));
} finally {
  await stopServer().catch(() => {});
  hookServer.close();
  db?.close();
  rmSync(DIR, { recursive: true, force: true });
}
const failed = results.filter((r) => !r.ok);
console.log(`\n=== Kết quả: ${results.length - failed.length}/${results.length} đạt ===`);
for (const f of failed) console.log(`✘ [${f.section}] ${f.name}`);
for (const n of notes) console.log(`⚑ ${n}`);
process.exit(failed.length ? 1 : 0);
