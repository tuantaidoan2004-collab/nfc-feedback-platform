// Mô phỏng sâu: nhiều ngày, nhiều quán, khách "như thật" với tài khoản giả định. 2 quán đi qua trang quán QS (vé),
// 1 quán chưa dùng QS: thẻ NFC riêng của Tiệm trên bàn (chip NTAG thường, đa số bật UID + bộ đếm, vài chip không bật).
//   npm run sim                         (9 ngày, 3 quán, hạt giống 2026)
//   npm run sim -- --days=5 --seed=7 --rate=40
//   npm run sim -- --gpt=6 --adobe=4 --quota=30     (so phương án kho: số tài khoản ChatGPT / Adobe, suất mỗi quán)
//   npm run theo-doi                    (xem trực tiếp: bảng theo dõi http://localhost:3921, trang quản trị http://localhost:3920)
// Chạy đúng code máy chủ (createApp + HTTP thật + việc định kỳ) ở cấu hình production, nhưng đồng hồ được tua nhanh.
// Mỗi hãng có 1 "bản giả" (ChatGPT kiểm mật khẩu + 2FA, Adobe gửi mã email, CapCut, Gemini link 1 lần)
// để kiểm khách đăng nhập được thật và người không có quyền KHÔNG vào được.
// Kết quả: docs/bao-cao-mo-phong.md. Thoát mã 1 nếu có vi phạm (giao trùng, vượt giới hạn, lộ mật khẩu/2FA, lỗi 500...).
import http from 'node:http';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHmac, randomBytes } from 'node:crypto';
import { loadConfig, validateConfig } from '../src/config.js';
import { openDb, get, all } from '../src/db/index.js';
import { createCtx } from '../src/ctx.js';
import { createApp } from '../src/server.js';
import { runJobs } from '../src/jobs.js';
import { totpNow } from '../src/lib/totp.js';
import { USABLE_SQL, COUNTED, toolAvailability, toolUsedToday } from '../src/domain/quota.js';
import { makeTicket } from '../src/domain/ticket.js';
import { applyPilot } from './pilot.js';

// ---------- Tham số ----------
const arg = (k, d) => Number((process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=')[1]) || d;
const DAYS = arg('days', 9);
const SEED = arg('seed', 2026);
const RATE = arg('rate', 28); // lượt khách / quán / ngày (trung bình)
const GPT_ACCOUNTS = arg('gpt', 3); // số tài khoản ChatGPT (5 khách / tài khoản, đổi mật khẩu rồi giao lại)
const ADOBE_ACCOUNTS = arg('adobe', 2);
const CAFE_QUOTA = arg('quota', 20); // suất / quán / ngày
const SMS_PRICE = 800; // đ / tin (giả định để ước tính chi phí)
// Chế độ xem trực tiếp: chạy theo thời gian thật (tua nhanh `speed` lần), mở trang quản trị TBQ + bảng theo dõi trên máy.
// --chu-that: VẬN HÀNH ĐỘC LẬP — tắt chủ tiệm tự động (không tự nạp hàng, không tự đổi mật khẩu). Người thật làm chủ:
// trang quản trị TBQ + "Trang của chủ" (http://localhost:3921/chu: tài khoản của mình ở các hãng + chợ mua tài khoản). Kho bắt đầu trống,
// đồng hồ đứng ở 06:00 ngày 1 tới khi bấm ▶ trên bảng theo dõi.
const HUMAN = process.argv.includes('--chu-that');
const SERVE = process.argv.includes('--serve') || HUMAN;
const PORT = arg('port', 3920);
const DASH_PORT = arg('dash', 3921);
let speed = arg('speed', 120); // 120 → 1 phút mô phỏng = 0,5 giây thật; 1 ngày ≈ 12 phút
let paused = HUMAN;
let simDone = false;
let finalReport = '';
const ADMIN_PW = SERVE ? 'xem-mo-phong' : 'mat-khau-chu-tiem-sim';

const SEC = 1000; const MIN = 60 * SEC; const HOUR = 60 * MIN; const DAY = 24 * HOUR; const VN = 7 * HOUR;
const START = Date.UTC(2026, 9, 12) - VN; // 00:00 thứ Hai 12/10/2026 giờ VN
const END = START + DAYS * DAY + 12 * HOUR; // thêm nửa ngày cho hết hạn / thu hồi / gỡ nhóm
const hourOf = (t) => ((t + VN) % DAY) / HOUR;
const dayOf = (t) => Math.floor((t - START) / DAY);
const at = (day, h, m = 0) => START + day * DAY + h * HOUR + m * MIN;
const fmtT = (t) => { const d = new Date(t + VN); return `N${dayOf(t) + 1} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`; };

// ---------- Ngẫu nhiên có hạt giống (chạy lại ra đúng kết quả) ----------
let rs = SEED >>> 0;
const rng = () => { rs = (rs + 0x6D2B79F5) >>> 0; let t = rs; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const chance = (p) => rng() < p;
const between = (a, b) => a + Math.floor(rng() * (b - a + 1));
const pickW = (pairs) => { let x = rng() * pairs.reduce((s, [, w]) => s + w, 0); for (const [v, w] of pairs) { x -= w; if (x < 0) return v; } return pairs.at(-1)[0]; };
const gauss = () => Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const rand32 = (n) => Array.from({ length: n }, () => B32[Math.floor(rng() * 32)]).join('');
const pw = () => `Pw-${Math.floor(rng() * 36 ** 8).toString(36).padStart(8, '0')}`;

// ---------- Đồng hồ + hàng đợi sự kiện ----------
const clock = { t: START };
const heap = [];
let seq = 0;
function push(t, fn) {
  heap.push({ t: Math.round(t / SEC) * SEC, n: seq++, fn });
  let i = heap.length - 1;
  while (i > 0) { const p = (i - 1) >> 1; if (less(heap[p], heap[i])) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; }
}
const less = (a, b) => a.t < b.t || (a.t === b.t && a.n < b.n);
function pop() {
  const top = heap[0]; const last = heap.pop();
  if (heap.length) {
    heap[0] = last; let i = 0;
    for (;;) { const l = 2 * i + 1; const r = l + 1; let m = i; if (l < heap.length && less(heap[l], heap[m])) m = l; if (r < heap.length && less(heap[r], heap[m])) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; }
  }
  return top;
}
let running = 0;
let idle = [];
const setRunning = (d) => { running += d; if (running === 0) idle.splice(0).forEach((r) => r()); };
const whenIdle = () => (running === 0 ? Promise.resolve() : new Promise((r) => idle.push(r)));
function spawn(fn, label) {
  setRunning(+1);
  Promise.resolve().then(fn).catch((e) => violation('flow', `Luồng "${label}" lỗi: ${String(e?.stack || e).split('\n').slice(0, 3).join(' | ')}`)).finally(() => setRunning(-1));
}
const atTime = (t, fn, label) => push(t, () => spawn(fn, label));
const wait = (ms) => new Promise((res) => { push(clock.t + Math.max(SEC, ms), () => { setRunning(+1); res(); }); setRunning(-1); });

// ---------- Ghi nhận ----------
const violations = [];
function violation(kind, text) { if (violations.length < 200) violations.push({ t: clock.t, kind, text }); feed('vipham', `VI PHẠM [${kind}] ${text}`); }
/** Dòng sự kiện cho bảng theo dõi. */
const feedLog = [];
function feed(kind, text) { feedLog.push({ t: clock.t, kind, text }); if (feedLog.length > 400) feedLog.shift(); }
const mask = (p) => (p && p.length >= 7 ? `${p.slice(0, 4)}***${p.slice(-3)}` : p);
const count = new Map();
// Kết quả gian lận → hiện lên dòng sự kiện.
const FEED_KEYS = { 'o_nha_khong_ve:': 'Ở nhà, không có vé', 'qr_ve_nha:': 'Chụp QR về nhà quét', 'nhieu_sim:': '1 máy dùng SIM thứ 2', 'chia_se:': 'Chia sẻ ChatGPT cho bạn', 'khach_cu:chatgpt:': 'Khách cũ vào lại ChatGPT', 'khach_cu:adobe:': 'Khách cũ vào lại Adobe', 'khach_cu:capcut:': 'Khách cũ vào lại CapCut', 'gian_lan:spam_otp': 'Spam OTP' };
const inc = (k, n = 1) => {
  count.set(k, (count.get(k) || 0) + n);
  const p = Object.keys(FEED_KEYS).find((x) => k.startsWith(x));
  if (p) feed('gianlan', `${FEED_KEYS[p]} → ${k.slice(p.length).replace(/_/g, ' ') || 'thử'}`);
};
const samples = new Map();
const sample = (k, v) => { if (!samples.has(k)) samples.set(k, []); samples.get(k).push(v); };
const stat = (k) => { const a = samples.get(k) || []; if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return { n: a.length, avg: a.reduce((x, y) => x + y, 0) / a.length, p90: s[Math.floor(s.length * 0.9)], max: s.at(-1) }; };

// ---------- Máy chủ TBQ (cấu hình production, OTP + báo động bắt lại trong mô phỏng) ----------
const DIR = mkdtempSync(join(tmpdir(), 'tbq-sim-'));
const ENV = {
  NODE_ENV: 'production', BASE_URL: 'https://thu.test', DB_PATH: join(DIR, 'sim.sqlite'), CLIENT_IP_HEADER: 'x-real-ip',
  APP_SECRET: randomBytes(32).toString('base64'), DATA_KEY: randomBytes(32).toString('base64'), ADMIN_PASSWORD: ADMIN_PW,
  MAIL_WEBHOOK_SECRET: randomBytes(32).toString('base64'), QS_TICKET_KEY: randomBytes(32).toString('hex'),
  // OTP: cấu hình eSMS cho đúng production; tin thật không gửi — mô phỏng bắt lại mã ở ctx.otp bên dưới.
  OTP_PROVIDER: 'esms', ESMS_URL: 'https://esms.invalid/', ESMS_API_KEY: 'sim', ESMS_SECRET_KEY: 'sim', ESMS_BRANDNAME: 'TiemBanQuyen',
  // Xem trên trình duyệt của máy: http://localhost (không https), mã OTP hiện ngay trên trang để tự thử làm khách.
  ...(SERVE ? { NODE_ENV: 'development', BASE_URL: `http://localhost:${PORT}`, OTP_PROVIDER: 'dev', OTP_DEV_SHOW: '1' } : {}),
};
const config = loadConfig(ENV);
const cfgErrors = validateConfig(config);
if (cfgErrors.length) throw new Error(`Cấu hình sai: ${cfgErrors.join('; ')}`);
const db = openDb(ENV.DB_PATH);
const otpInbox = new Map();
let smsSent = 0;
const ctx = createCtx({
  config, db, now: () => clock.t,
  log: (level, msg, data) => { if (level === 'error') violation('server', `${msg} ${JSON.stringify(data || {}).slice(0, 300)}`); },
  otp: { name: 'sim', async send(phone, code) { otpInbox.set(phone, code); smsSent++; return { ok: true }; } },
});
const server = http.createServer(createApp(ctx));
await new Promise((r) => server.listen(SERVE ? PORT : 0, '127.0.0.1', r));
const URL_ = `http://127.0.0.1:${server.address().port}`;
const sign = (body) => `sha256=${createHmac('sha256', ENV.MAIL_WEBHOOK_SECRET).update(body).digest('hex')}`;

// ---------- Bản giả của các hãng ----------
const secrets = new Set(); // khoá 2FA — không bao giờ được xuất hiện trong bất kỳ trang nào
const pwOwner = new Map(); // mật khẩu → email tài khoản
const slotOf = (email, phone) => get(db,
  `SELECT s.* FROM slots s JOIN accounts a ON a.id = s.account_id JOIN customers c ON c.id = s.customer_id
   WHERE a.login_email = ? AND c.phone = ? ORDER BY s.id DESC LIMIT 1`, email, `84${phone.slice(1)}`);
const isHolder = (email, phone) => slotOf(email, phone)?.status === 'active';

class PwVendor {
  /** codeOnly: không mật khẩu, mỗi máy mới đăng nhập bằng mã hãng gửi về email kho (ChatGPT / Claude thật từ 07/10). */
  constructor(name, { totp = false, emailCode = false, codeOnly = false } = {}) { this.name = name; this.totp = totp; this.emailCode = emailCode || codeOnly; this.codeOnly = codeOnly; this.acc = new Map(); }
  add(email, o = {}) {
    const a = { password: this.codeOnly ? null : pw(), secret: this.totp ? rand32(32) : null, sessions: new Map(), pending: new Map(), proUntil: o.proUntil ?? Infinity };
    this.acc.set(email, a);
    if (a.password) pwOwner.set(a.password, email);
    if (a.secret) secrets.add(a.secret);
    return a;
  }
  /** → 'ok' | 'bad_password' | 'need_2fa' | 'bad_2fa' | 'need_email_code' */
  async login({ email, password, code, device, who, friendOf }) {
    const a = this.acc.get(email);
    if (!a || (!this.codeOnly && a.password !== password)) return 'bad_password';
    if (this.totp) {
      if (!code) return 'need_2fa';
      if (code !== totpNow(a.secret, clock.t).code && code !== totpNow(a.secret, clock.t - 30 * SEC).code) return 'bad_2fa';
    }
    if (this.emailCode && !a.sessions.has(device)) {
      if (!code) { const c = String(between(100000, 999999)); a.pending.set(device, c); await sendMail(email, this.name, c); return 'need_email_code'; }
      if (a.pending.get(device) !== code) return 'bad_code';
    }
    a.sessions.set(device, { who, since: clock.t, friendOf });
    const legit = isHolder(email, who);
    inc(`dangnhap:${this.name}:${legit ? 'chu_slot' : friendOf ? 'ban_cua_khach' : 'khong_quyen'}`);
    if (!legit && !friendOf) violation('vendor', `${this.name}: ${who} đăng nhập ${email} mà không có slot`);
    return 'ok';
  }
  /** Chủ đổi mật khẩu + đăng xuất mọi thiết bị (keep: chỉ đăng xuất, giữ mật khẩu). Đo người đã hết hạn còn dùng được bao lâu. */
  rotate(email, { keep = false } = {}) {
    const a = this.acc.get(email);
    for (const s of a.sessions.values()) {
      const slot = slotOf(email, s.who);
      if (slot?.status === 'active') inc(`xoay:${this.name}:da_nguoi_dang_dung`);
      else if (slot?.ended_at) sample(`con_vao_duoc_sau_het_han:${this.name}`, (clock.t - slot.ended_at) / MIN);
    }
    a.sessions.clear();
    a.pending.clear();
    if (keep || this.codeOnly) return a.password;
    pwOwner.delete(a.password);
    a.password = pw();
    pwOwner.set(a.password, email);
    return a.password;
  }
}
const V = {
  // Khớp scripts/pilot.js: ChatGPT đăng nhập bằng mã gửi về email kho; Adobe như CapCut (email + mật khẩu, Pro tự hết sau 7 ngày).
  chatgpt: new PwVendor('ChatGPT', { codeOnly: true }),
  adobe: new PwVendor('Adobe'),
  capcut: new PwVendor('CapCut'),
  gemini: { links: new Map(), redeem(v, gmail) { const l = this.links.get(v); if (!l) return 'invalid'; if (l.usedBy) return 'used'; l.usedBy = gmail; return 'ok'; } },
};
// ---------- Trang của chủ (vận hành độc lập): tài khoản của chủ ở các hãng + chợ mua tài khoản ----------
const ownerLog = [];
const logOwner = (text) => { ownerLog.push({ t: clock.t, text }); feed('chu', `Chủ: ${text}`); };
const purchases = [];
const VNAME = { chatgpt: 'ChatGPT', adobe: 'Adobe', capcut: 'CapCut', gemini: 'Gemini' };
let buySeq = 0;
function buy(kind, n) {
  buySeq++;
  const lines = [];
  for (let i = 1; i <= n; i++) {
    if (kind === 'gemini') { const l = `https://one.google.com/join/${rand32(10)}`; V.gemini.links.set(l, {}); lines.push(l); continue; }
    const email = `${kind === 'chatgpt' ? 'gpt' : kind === 'adobe' ? 'ad' : 'cc'}-m${buySeq}-${i}@kho.test`;
    const a = V[kind].add(email, kind === 'capcut' || kind === 'adobe' ? { proUntil: clock.t + 7 * DAY } : {});
    lines.push(kind === 'chatgpt' ? email : `${email}|${a.password}`);
  }
  purchases.unshift({ t: clock.t, kind, lines });
  logOwner(`mua ${n} ${VNAME[kind]}`);
}
const escH = (x) => String(x ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
async function sendMail(to, vendor, code) {
  const body = JSON.stringify({ message_id: `sim-${seq++}-${code}`, to, from: vendor === 'Adobe' ? 'Adobe <message@adobe.com>' : 'noreply@tm.openai.com',
    subject: `Your ${vendor} verification code`, text: `Your verification code is ${code}`, date: new Date(clock.t).toISOString() });
  const res = await fetch(`${URL_}/hooks/mail`, { method: 'POST', body, headers: { 'Content-Type': 'application/json', 'X-Signature': sign(body), 'X-Real-IP': '104.30.0.1' } });
  const j = await res.json();
  inc(`thu:${j.results?.[0]?.verdict || res.status}`);
}

// ---------- Trình duyệt / điện thoại ----------
const MOBILE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1';
const LAPTOP = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130.0 Safari/537.36';
let httpCount = 0;
class Device {
  constructor(label, ip, ua = MOBILE) { this.label = label; this.ip = ip; this.ua = ua; this.jar = {}; this.hint = null; this.extra = {}; this.admin = false; }
  async req(method, path, { json, form, headers = {} } = {}) {
    const h = { 'User-Agent': this.ua, 'X-Real-IP': this.ip, ...this.extra, ...headers };
    if (this.hint) h['x-device-hint'] = this.hint;
    const cookie = Object.entries(this.jar).map(([k, v]) => `${k}=${v}`).join('; ');
    if (cookie) h.Cookie = cookie;
    if (method === 'POST') h.Origin = config.baseUrl;
    let body;
    if (json !== undefined) { body = JSON.stringify(json); h['Content-Type'] = 'application/json'; }
    if (form !== undefined) { body = new URLSearchParams(form).toString(); h['Content-Type'] = 'application/x-www-form-urlencoded'; }
    const res = await fetch(URL_ + path, { method, headers: h, body, redirect: 'manual' });
    httpCount++;
    for (const c of res.headers.getSetCookie()) {
      const [kv, ...attrs] = c.split(';'); const i = kv.indexOf('=');
      const k = kv.slice(0, i).trim(); const v = kv.slice(i + 1).trim();
      if (/max-age=0/i.test(attrs.join(';')) || v === '') delete this.jar[k]; else this.jar[k] = v;
    }
    const id = res.headers.get('x-device-id'); if (id) this.hint = id;
    const text = await res.text();
    if (res.status >= 500) violation('http', `${method} ${path} → ${res.status}: ${text.slice(0, 160)}`);
    this.scan(text, path);
    let data = null; try { data = JSON.parse(text); } catch { /* HTML */ }
    return { status: res.status, text, data, location: res.headers.get('location') };
  }
  /** Kiểm lộ bí mật: khoá 2FA không bao giờ được hiện; mật khẩu chỉ hiện cho máy đang giữ slot của đúng tài khoản. */
  scan(text, path) {
    for (const s of secrets) if (text.includes(s)) violation('lo_bi_mat', `Khoá 2FA lộ ra ở ${path} (${this.label})`);
    if (this.admin) return;
    for (const [p, email] of pwOwner) {
      if (!text.includes(p)) continue;
      const ok = get(db, "SELECT 1 FROM slots s JOIN accounts a ON a.id = s.account_id WHERE a.login_email = ? AND s.device_id = ? AND s.status = 'active'", email, this.jar.did || '');
      if (!ok) violation('lo_bi_mat', `Mật khẩu ${email} hiện cho máy không giữ slot (${this.label}, ${path})`);
    }
  }
  get(p, o) { return this.req('GET', p, o); }
  post(p, json, o = {}) { return this.req('POST', p, { json, ...o }); }
}

// ---------- Quán ----------
const CAFES = [
  { name: 'Cà phê Sáng Q1', slug: 'sangq1', ip: '113.161.10.11', open: 7, close: 23, rate: RATE + 2 },
  { name: 'The Note 24h', slug: 'thenote', ip: '14.241.20.22', open: null, close: null, rate: RATE },
  // Quán chưa dùng QS: 8 thẻ NFC riêng của Tiệm (6 chip bật UID + bộ đếm, 2 chip không bật). slug chỉ là tên gọi trong mô phỏng.
  { name: 'Cộng Đêm Bình Thạnh', slug: 'congdem', ip: '171.244.30.33', open: null, close: null, rate: RATE - 4, nfc: { cards: 8, noMirror: 2 } },
];
const HOUR_W = [1, 0.8, 0.5, 0.3, 0.2, 0.3, 0.8, 2, 4, 5, 5, 4, 3, 4, 5, 5, 4, 4, 5, 6, 6, 5, 3, 2];
const isOpen = (cafe, t) => cafe.open == null || (hourOf(t) >= cafe.open && hourOf(t) < cafe.close);
/** Vé QS gắn vào nút "Nhận công cụ" khi khách mở trang quán bằng thẻ / QR trên bàn (at = lúc mở trang quán). */
const ticketFor = (cafe, t = clock.t) => makeTicket(ENV.QS_TICKET_KEY, cafe.slug, t, rand32(16));
const hex6 = (n) => Math.max(0, n).toString(16).toUpperCase().padStart(6, '0');
/** Chạm 1 chip thật: bộ đếm tăng; chip bật mirror gửi kèm UID + bộ đếm, chip không bật thì link trơn. */
const tapUrl = (chip) => (chip.mirror ? `/c/${chip.token}?m=${chip.uid}x${hex6(++chip.ctr)}` : `/c/${chip.token}`);
/**
 * Khách vào trang nhận công cụ của quán. Quán có QS: bấm nút trên trang quán (vé) → TBQ kiểm vé, chuyển về link sạch.
 * Quán chưa dùng QS: chạm thẻ NFC trên bàn → /c/<token>. dev.entryUrl = link để tải lại trang sau đó.
 * chip: chọn sẵn chip (mặc định 1 bàn ngẫu nhiên).
 */
async function enterCafe(dev, cafe, { chip } = {}) {
  if (cafe.nfc) {
    dev.entryUrl = tapUrl(chip || cafe.chips[Math.floor(rng() * cafe.chips.length)]);
    return dev.get(dev.entryUrl);
  }
  dev.entryUrl = `/qs/${cafe.slug}`;
  const go = await dev.get(`/qs/${cafe.slug}?t=${ticketFor(cafe)}`);
  return go.status === 303 ? dev.get(go.location) : go;
}

// ---------- Chủ tiệm ----------
const owner = new Device('chủ tiệm', '171.244.1.1', LAPTOP);
owner.admin = true;
let csrf = null;
async function ownerLogin() {
  await owner.req('POST', '/admin/login', { form: { password: ENV.ADMIN_PASSWORD } });
  csrf = /name="_csrf" value="([^"]+)"/.exec((await owner.get('/admin')).text)?.[1];
}
async function admin(path, form) {
  let r = await owner.req('POST', path, { form: { _csrf: csrf, ...form } });
  if (r.status === 401 || r.status === 403) { await ownerLogin(); r = await owner.req('POST', path, { form: { _csrf: csrf, ...form } }); }
  return r;
}
const toolId = {};
async function importLines(slug, lines) {
  const r = await admin('/admin/accounts', { tool_id: String(toolId[slug]), lines: lines.join('\n') });
  const msg = decodeURIComponent(/msg=([^&]+)/.exec(r.location || '')?.[1] || '').replace(/\+/g, ' ');
  if (!/Đã thêm/.test(msg) || /Bỏ qua/.test(msg)) violation('owner', `Nhập kho ${slug} lỗi: ${msg}`);
}
/** 6:30 mỗi sáng: nạp CapCut mới (10 tài khoản × 2 khách) + 5 link Gemini, rồi làm việc tay. */
async function ownerMorning(day) {
  const cc = Array.from({ length: 10 }, (_, i) => { const e = `cc-n${day + 1}-${i + 1}@kho.test`; const a = V.capcut.add(e, { proUntil: clock.t + 7 * DAY }); /* Pro dùng thử 7 ngày tính từ lúc tạo tài khoản */ return `${e}|${a.password}`; });
  await importLines('capcut', cc);
  const links = Array.from({ length: 5 }, () => { const l = `https://one.google.com/join/${rand32(10)}`; V.gemini.links.set(l, {}); return l; });
  await importLines('gemini', links);
  inc('chu:nap_hang');
  feed('chu', 'Chủ tiệm nạp hàng: +10 tài khoản CapCut, +5 link Gemini');
  await ownerTasks();
}
/** Chủ mở trang Việc tay: đổi mật khẩu + đăng xuất (ChatGPT, Adobe). */
async function ownerTasks() {
  const live = (await owner.get('/admin/api/live')).data;
  if (!live?.ok) { await ownerLogin(); return; }
  for (const k of live.tasks) {
    const row = get(db, 'SELECT t.slug FROM rotation_tasks r JOIN accounts a ON a.id = r.account_id JOIN tools t ON t.id = a.tool_id WHERE r.id = ?', k.id);
    if (k.kind === 'rotate') {
      const vendor = V[row.slug];
      const newPw = vendor.rotate(k.email);
      await admin(`/admin/tasks/${k.id}/done`, newPw ? { newPassword: newPw } : {});
      inc(`chu:doi_mat_khau:${row.slug}`);
      feed('chu', `Chủ ${newPw ? 'đổi mật khẩu + ' : ''}đăng xuất mọi thiết bị: ${k.email}`);
    }
  }
}
/** Báo động = sự kiện mức red / yellow trong nhật ký (trang Theo dõi của chủ đọc từ đó). Đếm theo loại; đỏ thì hiện ở bảng theo dõi. */
let lastEventId = 0;
function pollAlerts() {
  for (const e of all(db, "SELECT id, type, severity FROM events WHERE id > ? AND severity IN ('red', 'yellow') ORDER BY id", lastEventId)) {
    lastEventId = e.id;
    inc(`baodong:${e.type}`);
    if (e.severity === 'red') feed('baodong', `Báo động đỏ: ${e.type}`);
  }
}

// ---------- Khách ----------
const PERSONAS = [['wifi', 45], ['4g', 19], ['laptop', 11], ['vonvoi', 5], ['chiase', 5], ['nhieusim', 4], ['onha', 3], ['qrnha', 2], ['spamotp', 2], ['xoacookie', 4]];
const TOOLS_W = [['chatgpt', 45], ['capcut', 30], ['gemini', 12], ['adobe', 13]]; // Canva: khách nhắn Zalo (không trong gói)
const people = [];
let phoneSeq = 0;
function newPhone() { phoneSeq++; return `09${String(10000000 + ((phoneSeq * 7919 + SEED) % 89999999)).slice(-8)}`; }
function newCustomer() {
  const prefs = []; const left = [...TOOLS_W];
  while (left.length) { const s = pickW(left); prefs.push(s); left.splice(left.findIndex(([x]) => x === s), 1); }
  const c = { id: people.length + 1, phone: newPhone(), persona: pickW(PERSONAS), prefs, gmail: `kh${people.length + 1}.${rand32(4).toLowerCase()}@gmail.com`, visits: 0 };
  c.device = new Device(`khách ${c.id}`, '0.0.0.0');
  c.exCustomer = chance(0.2);
  people.push(c);
  return c;
}
const ip4g = () => `${pickW([['27.72', 1], ['171.224', 1], ['42.118', 1]])}.${between(0, 255)}.${between(1, 254)}`;
const homeIp = () => `14.${between(160, 191)}.${between(0, 255)}.${between(1, 254)}`;
const LABEL = {
  'nhan:chatgpt': 'Nhận ChatGPT', 'nhan:capcut': 'Nhận CapCut', 'nhan:gemini': 'Nhận Gemini', 'nhan:adobe': 'Nhận Adobe',
  het_cho_moi_cong_cu: 'Mọi công cụ khách muốn đều tạm hết', cafe_quota: 'Quán hết suất trong ngày', dang_co_slot: 'Đang giữ slot (quay lại xem)',
  daily_limit: 'Đã nhận hôm nay', cooldown: 'Mới thử công cụ này gần đây', has_active_slot: 'Đang giữ slot khác', no_account: 'Hết tài khoản lúc bấm',
  tool_daily_cap: 'Công cụ hết lượt trong ngày', need_entry: 'Chưa vào từ thẻ / trang quán', card_quota: 'Thẻ ở bàn hết suất trong ngày',
  need_review: 'Rủi ro vừa (vàng) — tự từ chối', device_phone_limit: 'Máy đã dùng cho SĐT khác', device_busy: 'Máy đang giữ slot SĐT khác', bi_chan_o_nha: 'Ở nhà, không có vé — bị chặn',
  spam_otp: 'Spam OTP', lifetime_cap: 'Đã thử đủ số lần',
};
const out = (c, k) => {
  inc(`ketqua:${k}`);
  c.last = k;
  feed(k.startsWith('nhan:') ? 'giao' : 'khach', `${mask(c.phone)} @ ${c.cafeName || '?'}: ${LABEL[k] || k.replace(/_/g, ' ')}`);
};

async function otpLogin(c, dev, phone = c.phone) {
  const s = await dev.post('/api/otp/send', { phone });
  if (!s.data?.ok) return { ok: false, code: s.data?.code || 'send_failed' };
  await wait(between(20, 90) * SEC);
  const code = otpInbox.get(`84${phone.slice(1)}`);
  if (chance(0.04)) await dev.post('/api/otp/verify', { phone, code: String((Number(code) + 1) % 1e6).padStart(6, '0'), consent: true });
  const v = await dev.post('/api/otp/verify', { phone, code, consent: true });
  return v.data?.ok ? { ok: true } : { ok: false, code: v.data?.code };
}
const parseTools = (html) => [...html.matchAll(/name="toolId" value="(\d+)" data-name="[^"]+"( disabled)?/g)]
  .map((m) => ({ id: Number(m[1]), slug: Object.keys(toolId).find((k) => toolId[k] === Number(m[1])), free: !m[2] }));

async function visit(c, cafe) {
  await visitOnce(c, cafe);
  // Kẽ hở đã biết của vé: QS không phân biệt quét QR ở bàn hay quét ảnh chụp QR ở nhà. Đo xem lọt bao nhiêu (không phải vi phạm).
  if (c.persona === 'qrnha') inc(`qr_ve_nha:${c.last?.startsWith('nhan:') ? 'LOT' : `khong_nhan:${c.last}`}`);
}

async function visitOnce(c, cafe) {
  c.visits++;
  c.cafeName = cafe.name;
  const dev = c.device;
  dev.ip = c.persona === '4g' ? ip4g() : c.persona === 'qrnha' ? homeIp() : cafe.ip;
  if (c.persona === 'onha') return homeNoTicket(c, cafe);
  if (c.persona === 'qrnha' && c.visits === 1) inc('gian_lan:qr_ve_nha');
  if (c.persona === 'spamotp' && c.visits === 1) return otpSpammer(c);
  if (c.persona === 'xoacookie' && c.visits > 1) {
    // Quay lại sau, xoá cookie để nhận thêm. Nửa giữ localStorage (hệ thống nhận lại máy), nửa dùng chế độ ẩn danh + SIM thứ 2.
    dev.jar = {};
    c.phone = newPhone();
    if (chance(0.5)) { dev.hint = null; inc('gian_lan:xoa_cookie_sim2'); } else inc('gian_lan:xoa_cookie');
  }
  // Quán dùng thẻ riêng: người ở nhà không chạm được chip, chỉ có link của chip KHÔNG bật bộ đếm là mở được (kẽ hở đã biết).
  let page = await enterCafe(dev, cafe, { chip: c.persona === 'qrnha' && cafe.nfc ? cafe.chips.find((k) => !k.mirror) : undefined });
  let entry = dev.entryUrl;
  // Tải lại trang. Thẻ riêng: TBQ bảo "chạm lại thẻ" (lượt chạm quá 30 phút / link không còn hợp lệ) → khách chạm lại 1 lần.
  const reload = async (why) => {
    const p = await dev.get(entry);
    if (!cafe.nfc || !/Chạm lại thẻ/.test(p.text)) return p;
    inc(`the_rieng:bao_cham_lai:${why}:${c.persona}`);
    const again = await enterCafe(dev, cafe);
    entry = dev.entryUrl;
    return again;
  };
  if (cafe.nfc && /Chạm lại thẻ/.test(page.text)) inc(`the_rieng:bao_cham_lai:luot_dau:${c.persona}`);
  if (/tạm dừng|ngoài giờ/.test(page.text)) return out(c, 'quan_dong_cua');
  if (page.text.includes('id="otp-form"')) {
    const l = await otpLogin(c, dev);
    if (!l.ok) return out(c, `otp_${l.code}`);
    page = await reload('sau_otp');
  }
  if (page.text.includes('Bạn đang dùng')) return out(c, 'dang_co_slot');
  const tried = new Set();
  let slug;
  let r;
  // Bấm công cụ thích nhất còn chỗ; bị báo hết (người khác vừa nhận mất) thì chọn công cụ khác 1 lần nữa.
  for (let attempt = 0; attempt < 2; attempt++) {
    const tools = parseTools(page.text);
    slug = c.prefs.find((s) => !tried.has(s) && tools.find((t) => t.slug === s && t.free));
    if (!slug) { if (chance(0.3)) inc('zalo:hoi_dich_vu_khac'); return out(c, 'het_cho_moi_cong_cu'); }
    tried.add(slug);
    if (slug !== c.prefs[0]) inc('chon_lai_cong_cu_khac');
    r = await dev.post('/api/claim', { toolId: toolId[slug] });
    if (!['no_account', 'tool_daily_cap', 'cooldown', 'lifetime_cap'].includes(r.data?.code)) break;
    inc(`bam_roi_moi_bao_het:${r.data.code}`);
    page = await reload('chon_lai');
  }
  if (r.data?.status !== 'active') return out(c, r.data?.code || r.data?.error || r.data?.status || 'loi');
  out(c, `nhan:${slug}`);
  inc(`giao:${slug}:N${dayOf(clock.t) + 1}`);
  await useTool(c, slug, cafe);
  if (c.persona === 'nhieusim') await multiSim(c, cafe);
}

async function useTool(c, slug, cafe) {
  const dev = c.device;
  const loginDev = c.persona === 'laptop' ? `${c.id}-laptop` : `${c.id}-phone`;
  await wait(between(1, 4) * MIN);
  const view = async () => (await dev.get('/api/me')).data?.view;
  let v = await view();
  if (!v) { inc(`vao_hang:${slug}:khong_thay_slot`); return; }
  if (slug === 'chatgpt') {
    // Như bản thật: bấm "Lấy mã" trên trang Tiệm (dùng phiếu tự có khi chạm thẻ) → nhập email bên ChatGPT → hãng gửi mã về
    // hộp thư kho → TBQ hiện mã cho đúng khách. Khách vội: bấm gửi mã bên ChatGPT trước rồi mới bấm "Lấy mã".
    const r = await codeLogin(dev, 'chatgpt', v, loginDev, c.phone, { early: c.persona === 'vonvoi' });
    inc(`vao_hang:chatgpt:${r}${c.persona === 'vonvoi' ? ':vonvoi' : ''}`);
    if (r === 'ok' && c.persona === 'chiase') atTime(clock.t + between(10, 150) * MIN, () => friendLogin(c, cafe, v), 'bạn của khách');
  } else if (slug === 'adobe') {
    inc(`vao_hang:adobe:${await V.adobe.login({ email: v.accountEmail, password: v.password, device: loginDev, who: c.phone })}`);
  } else if (slug === 'capcut') {
    inc(`vao_hang:capcut:${await V.capcut.login({ email: v.accountEmail, password: v.password, device: loginDev, who: c.phone })}`);
  } else if (slug === 'gemini') {
    inc(`vao_hang:gemini:${v.redeem ? V.gemini.redeem(v.redeem.value, c.gmail) : 'khong_thay_ma'}`);
  }
  v = await view();
  if (v?.expiresAt) {
    // Hết hạn: một số khách bấm "Mua gói qua Zalo"; khách cũ thử tự vào lại ở nhà.
    if (chance(0.15)) atTime(v.expiresAt + between(5, 300) * MIN, async () => { c.device.ip = homeIp(); await c.device.get('/me'); await c.device.get('/zalo'); inc('zalo:bam_mua'); }, 'bấm Zalo');
    // Khách cũ thử vào lại: nửa thử ngay sau khi hết hạn (mật khẩu thường vẫn đúng vì tài khoản dùng chung chưa đổi), nửa thử hôm sau.
    const later = chance(0.5) ? between(10, 180) * MIN : between(3, 36) * HOUR;
    if (c.exCustomer && ['chatgpt', 'adobe', 'capcut'].includes(slug)) atTime(v.expiresAt + later, () => exCustomer(c, slug, v), 'khách cũ thử vào lại');
  }
}

/**
 * Đăng nhập món "mã gửi về email kho": mở lượt lấy mã trên TBQ (máy của khách) + đăng nhập bên hãng trên máy loginDev, chờ mã hiện.
 * early: bấm gửi mã bên hãng trước khi bấm "Lấy mã" (thư tới trước → TBQ giữ thư chờ, giao khi khách mở lượt). → kết quả đăng nhập
 */
async function codeLogin(dev, slug, v, loginDev, who, { early = false, friendOf } = {}) {
  const vendor = V[slug];
  if (early) { await vendor.login({ email: v.accountEmail, device: loginDev, who, friendOf }); await wait(between(20, 70) * SEC); }
  const w = await dev.post('/api/code/request', {});
  if (w.data?.status !== 'open') return `tbq_${w.data?.code || w.data?.status}`;
  if (!early) await vendor.login({ email: v.accountEmail, device: loginDev, who, friendOf });
  let code = null;
  for (let i = 0; i < 9 && !code; i++) { const s = (await dev.get(`/api/code/status/${w.data.windowId}`)).data; if (s?.status === 'ready') code = s.code; else await wait(20 * SEC); }
  return code ? vendor.login({ email: v.accountEmail, code, device: loginDev, who, friendOf }) : 'khong_nhan_duoc_ma';
}

/** Khách chia sẻ cho bạn: bạn đăng nhập máy khác, cần mã email → khách lấy mã lần nữa (ở quán hay đã về nhà). */
async function friendLogin(c, cafe, v) {
  inc('gian_lan:chia_se');
  const dev = c.device;
  const home = clock.t - (get(db, "SELECT started_at FROM slots WHERE customer_id = (SELECT id FROM customers WHERE phone = ?) ORDER BY id DESC", `84${c.phone.slice(1)}`)?.started_at || 0) > 60 * MIN;
  if (home) dev.ip = homeIp();
  const r = await codeLogin(dev, 'chatgpt', v, `${c.id}-ban`, c.phone, { friendOf: c.phone });
  inc(`chia_se:${r === 'ok' ? 'lot' : r.startsWith('tbq_') ? `bi_chan:${r.slice(4)}` : r}`);
}

/** Hết hạn rồi, ở nhà, tự đăng nhập lại bằng mật khẩu còn nhớ. */
async function exCustomer(c, slug, v) {
  inc(`khach_cu:thu:${slug}`);
  c.device.ip = homeIp();
  // Dù mật khẩu đã đổi hay chưa: TBQ không được đưa thêm gì cho slot đã hết hạn (mã 2FA, mã email, mật khẩu).
  const meNow = (await c.device.get('/api/me')).data?.view;
  if (meNow?.status === 'active') return; // đã nhận slot mới trong lúc chờ — không phải khách cũ nữa
  if (meNow?.password || meNow?.accountEmail) violation('khach_cu', `${c.phone}: slot hết hạn vẫn hiện thông tin đăng nhập`);
  for (const kind of ['totp', 'mail']) {
    const probe = (await c.device.post('/api/code/request', { kind })).data;
    if (probe?.status === 'totp' || probe?.status === 'open') violation('khach_cu', `${c.phone}: slot hết hạn vẫn lấy được mã (${kind})`);
  }
  const t = (await c.device.get('/api/totp')).data;
  if (t?.status === 'totp') violation('khach_cu', `${c.phone}: slot hết hạn vẫn xem được mã 2FA`);
  const dev = `${c.id}-nha`;
  let r = await V[slug].login({ email: v.accountEmail, password: v.password, device: dev, who: c.phone, friendOf: 'khach_cu' });
  if (r === 'need_2fa') {
    const t = await c.device.post('/api/code/request', { kind: 'totp' });
    r = t.data?.status === 'totp' ? 'LOT_2FA' : `can_2fa_tbq_tu_choi`;
  } else if (r === 'need_email_code') r = 'can_ma_email_khong_nhan_duoc';
  else if (r === 'ok' && (slug === 'capcut' || slug === 'adobe')) r = V[slug].acc.get(v.accountEmail).proUntil < clock.t ? 'vao_duoc_nhung_het_pro' : 'vao_duoc_con_pro';
  inc(`khach_cu:${slug}:${r}`);
  if (r === 'LOT_2FA' || r === 'ok' || r === 'vao_duoc_con_pro') violation('vendor', `Khách cũ ${c.phone} vào lại ${slug} sau khi hết hạn (${r})`);
}

async function multiSim(c, cafe) {
  inc('gian_lan:nhieu_sim');
  const phone2 = newPhone();
  await c.device.post('/api/logout', {});
  const l = await otpLogin(c, c.device, phone2);
  if (!l.ok) { inc(`nhieu_sim:bi_chan:${l.code}`); return; }
  const page = await c.device.get(c.device.entryUrl || `/qs/${cafe.slug}`);
  if (cafe.nfc && /Chạm lại thẻ/.test(page.text)) inc('the_rieng:bao_cham_lai:sim2_tai_lai_link_cu:nhieusim');
  const t = parseTools(page.text).find((x) => x.free);
  if (!t) { inc('nhieu_sim:het_cho'); return; }
  const r = await c.device.post('/api/claim', { toolId: t.id });
  inc(`nhieu_sim:${r.data?.status === 'active' ? 'LOT' : `bi_chan:${r.data?.code || r.data?.status}`}`);
  if (r.data?.status === 'active') violation('gian_lan', `1 máy nhận 2 slot bằng 2 SIM (${c.phone}, ${phone2})`);
  await c.device.post('/api/logout', {});
  await otpLogin(c, c.device); // quay về số của mình
}

/**
 * Ở nhà, không có vé hợp lệ: link trang quán lan trên mạng (không vé), link có vé bạn gửi (bạn đã mở ở quán), hoặc link cũ
 * từ hôm trước. Gửi kèm header giả IP quán cho chắc. Phải bị chặn hết.
 */
async function homeNoTicket(c, cafe) {
  inc('gian_lan:o_nha_khong_ve');
  const dev = c.device;
  dev.ip = homeIp();
  dev.extra = { 'CF-Connecting-IP': cafe.ip, 'X-Forwarded-For': cafe.ip, 'True-Client-IP': cafe.ip };
  let kind;
  if (cafe.nfc) {
    // Thẻ riêng (chip bật bộ đếm): link bạn vừa chạm ở quán gửi qua Zalo, link cắt bỏ ?m=, link cũ từ hôm trước.
    const chip = cafe.chips.filter((k) => k.mirror)[Math.floor(rng() * (cafe.nfc.cards - cafe.nfc.noMirror))];
    kind = pickW([['the_ban_gui', 2], ['the_cat_tham_so', 1], ['the_link_cu', 1]]);
    if (kind === 'the_ban_gui') {
      const url = tapUrl(chip);
      await new Device(`bạn của khách ${c.id} ở quán`, cafe.ip).get(url);
      await dev.get(url);
    } else if (kind === 'the_cat_tham_so') await dev.get(`/c/${chip.token}`);
    else await dev.get(`/c/${chip.token}?m=${chip.uid}x${hex6(chip.ctr - between(1, 40))}`);
  } else kind = pickW([['link_lan_tren_mang', 2], ['ve_ban_gui', 2], ['ve_cu', 1]]);
  if (kind === 'link_lan_tren_mang') await dev.get(`/qs/${cafe.slug}`);
  else if (kind === 've_cu') await dev.get(`/qs/${cafe.slug}?t=${ticketFor(cafe, clock.t - between(2, 30) * HOUR)}`);
  else if (kind === 've_ban_gui') {
    const t = ticketFor(cafe);
    await new Device(`bạn của khách ${c.id} ở quán`, cafe.ip).get(`/qs/${cafe.slug}?t=${t}`); // bạn mở trước ở quán rồi gửi link
    await dev.get(`/qs/${cafe.slug}?t=${t}`);
  }
  const l = await otpLogin(c, dev);
  if (!l.ok) return out(c, `otp_${l.code}`);
  const r = await dev.post('/api/claim', { toolId: toolId.chatgpt });
  const lot = r.data?.status === 'active';
  inc(`o_nha_khong_ve:${lot ? `LOT:${kind}` : `bi_chan:${kind}:${r.data?.code || r.data?.status}`}`);
  if (lot) violation('gian_lan', `Ở nhà không có vé (${kind}) vẫn nhận được slot (${c.phone})`);
  return out(c, lot ? 'LOT_o_nha' : 'bi_chan_o_nha');
}

async function otpSpammer(c) {
  inc('gian_lan:spam_otp');
  let sent = 0;
  for (let i = 0; i < 12; i++) { const r = await c.device.post('/api/otp/send', { phone: newPhone() }); if (r.data?.ok) sent++; }
  sample('spam_otp:gui_duoc', sent);
  return out(c, 'spam_otp');
}

// ---------- Kiểm bất biến (mỗi giờ + cuối) ----------
function checkInvariants() {
  const bad = (sql, kind, fmt, ...p) => { for (const r of all(db, sql, ...p)) violation(kind, fmt(r)); };
  bad(`SELECT a.login_email, a.max_holders, COUNT(*) AS n FROM slots s JOIN accounts a ON a.id = s.account_id
       WHERE s.status = 'active' GROUP BY a.id HAVING n > a.max_holders`, 'giao_trung', (r) => `${r.login_email}: ${r.n} người / tối đa ${r.max_holders}`);
  bad(`SELECT a.login_email, s.seat, COUNT(*) AS n FROM slots s JOIN accounts a ON a.id = s.account_id
       WHERE s.status = 'active' AND s.seat IS NOT NULL GROUP BY a.id, s.seat HAVING n > 1`, 'giao_trung', (r) => `${r.login_email}: Slot ${r.seat} trùng ${r.n} người`);
  bad(`SELECT a.login_email, COUNT(s.id) AS n, a.max_holders FROM accounts a JOIN tools t ON t.id = a.tool_id JOIN slots s ON s.account_id = a.id AND s.status != 'rejected'
       WHERE t.reuse = 'once' GROUP BY a.id HAVING n > a.max_holders`, 'giao_trung', (r) => `Tài khoản dùng 1 lần ${r.login_email} giao ${r.n} lượt`);
  bad(`SELECT t.slug, (s.created_at + ${VN}) / ${DAY} AS d, COUNT(*) AS n, t.daily_cap FROM slots s JOIN tools t ON t.id = s.tool_id
       WHERE t.daily_cap IS NOT NULL AND ${COUNTED.replaceAll('status', 's.status').replaceAll('end_reason', 's.end_reason')} GROUP BY t.id, d HAVING n > t.daily_cap`, 'vuot_gioi_han', (r) => `${r.slug}: ${r.n} lượt/ngày > ${r.daily_cap}`);
  bad(`SELECT f.name, (s.created_at + ${VN}) / ${DAY} AS d, COUNT(*) AS n, f.daily_quota FROM slots s JOIN cafes f ON f.id = s.cafe_id
       WHERE ${COUNTED.replaceAll('status', 's.status').replaceAll('end_reason', 's.end_reason')} GROUP BY f.id, d HAVING n > f.daily_quota`, 'vuot_gioi_han', (r) => `${r.name}: ${r.n} suất/ngày > ${r.daily_quota}`);
  bad(`SELECT k.label, f.name, (s.created_at + ${VN}) / ${DAY} AS d, COUNT(*) AS n FROM slots s JOIN cards k ON k.id = s.card_id JOIN cafes f ON f.id = s.cafe_id
       WHERE k.kind = 'nfc' AND ${COUNTED.replaceAll('status', 's.status').replaceAll('end_reason', 's.end_reason')} GROUP BY k.id, d HAVING n > ?`, 'vuot_gioi_han',
  (r) => `${r.name} — ${r.label}: ${r.n} suất/ngày > giới hạn thẻ`, ctx.settings().cardDailyClaims);
  bad(`SELECT s.id, x.verdict FROM slots s JOIN taps x ON x.card_id = s.card_id AND x.device_id = s.device_id
       WHERE x.id = (SELECT MAX(id) FROM taps WHERE device_id = s.device_id AND created_at <= s.created_at) AND x.verdict NOT IN ('ok', 'jump')`, 'gian_lan',
  (r) => `Slot #${r.id} nhận ngay sau lượt vào không hợp lệ (${r.verdict})`);
  bad(`SELECT customer_id, (created_at + ${VN}) / ${DAY} AS d, COUNT(*) AS n FROM slots WHERE ${COUNTED} GROUP BY customer_id, d HAVING n > 1`, 'vuot_gioi_han', (r) => `Khách #${r.customer_id} nhận ${r.n} lượt / ngày`);
  bad(`SELECT customer_id, COUNT(*) AS n FROM slots WHERE status IN ('active', 'pending_approval') GROUP BY customer_id HAVING n > 1`, 'vuot_gioi_han', (r) => `Khách #${r.customer_id} giữ ${r.n} slot cùng lúc`);
  bad(`SELECT redeem_id, COUNT(*) AS n FROM slots WHERE redeem_id IS NOT NULL GROUP BY redeem_id HAVING n > 1`, 'giao_trung', (r) => `Mã Gemini #${r.redeem_id} giao ${r.n} lần`);
  bad(`SELECT s.id, a.login_email FROM slots s JOIN accounts a ON a.id = s.account_id JOIN tools t ON t.id = a.tool_id
       WHERE s.status = 'active' AND NOT ${USABLE_SQL}`, 'giao_sai', (r) => `Slot #${r.id} giao tài khoản thiếu mật khẩu/2FA ${r.login_email}`);
}

// ---------- Chạy ----------
const t0 = Date.now();
clock.t = at(0, 6);
applyPilot(db);
for (const t of all(db, 'SELECT id, slug FROM tools WHERE enabled = 1')) toolId[t.slug] = t.id;
await ownerLogin();
for (const cafe of CAFES) {
  await admin('/admin/cafes', { name: cafe.name, address: 'TP.HCM', qs_slug: cafe.nfc ? '' : cafe.slug, daily_quota: String(CAFE_QUOTA), open_hour: cafe.open ?? '', close_hour: cafe.close ?? '' });
  cafe.id = get(db, 'SELECT id FROM cafes WHERE name = ?', cafe.name).id;
  if (!cafe.nfc) continue;
  // Tạo thẻ trong quản trị, ghi link vào chip, rồi chủ chạm thử từng chip 1 lần (TBQ nhớ UID + bộ đếm của chip).
  await admin(`/admin/cafes/${cafe.id}/cards`, { count: String(cafe.nfc.cards), prefix: 'Bàn', start: '1' });
  cafe.chips = all(db, "SELECT token FROM cards WHERE cafe_id = ? AND kind = 'nfc' ORDER BY id", cafe.id).map((k, i) => ({
    token: k.token, uid: `04${Array.from({ length: 12 }, () => '0123456789ABCDEF'[between(0, 15)]).join('')}`, ctr: between(0, 40), mirror: i >= cafe.nfc.noMirror,
  }));
  const tester = new Device('chủ chạm thử chip', cafe.ip);
  for (const chip of cafe.chips) await tester.get(tapUrl(chip));
}
// Kho cố định: ChatGPT (8 khách / tài khoản, đăng nhập bằng mã email), Adobe (2 khách).
if (!HUMAN) await importLines('chatgpt', Array.from({ length: GPT_ACCOUNTS }, (_, k) => k + 1).map((i) => { const e = `gpt-0${i}@kho.test`; V.chatgpt.add(e); return e; }));
if (!HUMAN) await importLines('adobe', Array.from({ length: ADOBE_ACCOUNTS }, (_, k) => k + 1).map((i) => { const e = `adobe-0${i}@kho.test`; const a = V.adobe.add(e, { proUntil: clock.t + 7 * DAY }); return `${e}|${a.password}`; }));

for (let d = 0; d <= DAYS; d++) {
  if (!HUMAN) {
    atTime(at(d, 6, 30), () => ownerMorning(d), 'chủ nạp hàng');
    for (const [h, m] of [[12, 30], [17, 30], [21, 30]]) atTime(at(d, h, m), () => ownerTasks(), 'chủ làm việc tay');
  }
  if (d < DAYS) push(at(d, 0, 1), () => planDay(d));
}
/** Đầu mỗi ngày: lên lịch khách đến từng quán. 25% là khách đã từng đến (quay lại), còn lại khách mới. */
function planDay(d) {
  for (const cafe of CAFES) {
    const n = Math.max(0, Math.round(cafe.rate + Math.sqrt(cafe.rate) * gauss()));
    const w = HOUR_W.map((x, h) => [h, isOpen(cafe, at(d, h)) ? x : 0]);
    const old = people.filter((p) => p.visits > 0 && p.lastDay < d);
    for (let i = 0; i < n; i++) {
      const t = at(d, pickW(w), between(0, 59));
      const c = old.length && chance(0.25) ? old.splice(Math.floor(rng() * old.length), 1)[0] : newCustomer();
      c.lastDay = d;
      atTime(t, () => visit(c, cafe), `khách ${c.id}`);
    }
  }
}

// ---------- Xem trực tiếp: chạy theo thời gian thật ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let anchor = null; // mốc {sim, real} để quy đổi thời gian mô phỏng → thời gian thật
async function pace(target) {
  if (!SERVE) return;
  for (;;) {
    if (paused) { anchor = null; await sleep(200); continue; }
    if (!Number.isFinite(speed)) return;
    if (!anchor) anchor = { sim: clock.t, real: Date.now() };
    const left = anchor.real + (target - anchor.sim) / speed - Date.now();
    if (left <= 5) return;
    await sleep(Math.min(left, 200));
  }
}
if (SERVE) {
  startDashboard();
  console.log(`\nBảng theo dõi:   http://localhost:${DASH_PORT}\nTrang quản trị:  ${config.baseUrl}/admin  (mật khẩu: ${ADMIN_PW})\n`);
  process.on('SIGTERM', () => { rmSync(DIR, { recursive: true, force: true }); process.exit(0); });
  process.on('SIGINT', () => { rmSync(DIR, { recursive: true, force: true }); process.exit(0); });
}

let nextTick = clock.t;
let nextCheck = clock.t + HOUR;
const statusLine = () => process.stdout.write(`\r  ${fmtT(clock.t)} · ${people.length} khách · ${httpCount} lượt gọi API · ${violations.length} vi phạm   `);
while (heap.length || nextTick <= END) {
  const t = heap.length ? Math.min(heap[0].t, END + 1) : END + 1;
  while (nextTick <= Math.min(t, END)) {
    await pace(nextTick);
    clock.t = nextTick;
    // Bạn đang mở trang quản trị: giữ phiên đăng nhập (12 giờ mô phỏng trôi qua chỉ trong vài phút thật).
    if (SERVE) db.prepare('UPDATE admin_sessions SET expires_at = ? WHERE expires_at > ?').run(clock.t + 12 * HOUR, clock.t - HOUR);
    await runJobs(ctx);
    pollAlerts();
    await whenIdle();
    if (clock.t >= nextCheck) { checkInvariants(); if (Math.round(hourOf(clock.t)) % 6 === 0) statusLine(); nextCheck += HOUR; }
    nextTick += 5 * MIN;
  }
  if (t > END) break;
  await pace(t);
  clock.t = t;
  while (heap.length && heap[0].t === t) pop().fn();
  await whenIdle();
}
checkInvariants();
pollAlerts();
statusLine();
console.log('\n');

// CapCut: slot 7 ngày nhưng Pro dùng thử tính từ lúc tạo tài khoản → khách nhận muộn mất mấy giờ Pro cuối.
for (const r of all(db, "SELECT s.expires_at, a.login_email FROM slots s JOIN accounts a ON a.id = s.account_id JOIN tools t ON t.id = s.tool_id WHERE t.slug = 'capcut' AND s.expires_at IS NOT NULL")) {
  sample('capcut_mat_gio_pro', Math.max(0, (r.expires_at - V.capcut.acc.get(r.login_email).proUntil) / HOUR));
}

// ---------- Báo cáo ----------
const c = (k) => count.get(k) || 0;
const sumPrefix = (p) => [...count].filter(([k]) => k.startsWith(p)).reduce((s, [, v]) => s + v, 0);
const byPrefix = (p) => [...count].filter(([k]) => k.startsWith(p)).map(([k, v]) => [k.slice(p.length), v]).sort((a, b) => b[1] - a[1]);
const pct = (a, b) => (b ? `${Math.round((100 * a) / b)}%` : '—');
const fmtStat = (k, unit = 'phút') => { const s = stat(k); return s ? `${s.n} lần · TB ${s.avg.toFixed(1)} · 90% dưới ${s.p90.toFixed(1)} · lâu nhất ${s.max.toFixed(1)} ${unit}` : 'không có'; };

const visits = sumPrefix('ketqua:');
const got = sumPrefix('ketqua:nhan:');
// Chốt chặn: mô phỏng không đọc được trang (đổi HTML…) thì không ai nhận được gì và "0 vi phạm" sẽ là giả → báo lỗi.
if (visits >= 50 && got < visits * 0.2) violation('mo_phong', `Chỉ ${got}/${visits} lượt nhận được công cụ — mô phỏng có thể không đọc được trang, kết quả không tin được`);
const days = Array.from({ length: DAYS }, (_, d) => `N${d + 1}`);
const toolRows = ['capcut', 'chatgpt', 'gemini', 'adobe'].map((s) => {
  const cap = get(db, 'SELECT daily_cap FROM tools WHERE slug = ?', s).daily_cap;
  return `| ${s} | ${cap ?? '—'} | ${days.map((d) => c(`giao:${s}:${d}`)).join(' | ')} |`;
});
const vendorRows = ['chatgpt', 'adobe', 'capcut', 'gemini'].map((s) => {
  const items = byPrefix(`vao_hang:${s}:`);
  const total = items.reduce((x, [, v]) => x + v, 0);
  const ok = items.filter(([k]) => k.startsWith('ok')).reduce((x, [, v]) => x + v, 0);
  return `| ${s} | ${total} | ${ok} (${pct(ok, total)}) | ${items.filter(([k]) => !k.startsWith('ok')).map(([k, v]) => `${k}: ${v}`).join(', ') || '—'} |`;
});
const report = `# Báo cáo mô phỏng khách thật — ${DAYS} ngày, ${CAFES.length} quán

Chạy lúc ${new Date().toLocaleString('vi-VN')} · hạt giống ${SEED} · ${RATE} lượt/quán/ngày (trung bình) · ${((Date.now() - t0) / 1000).toFixed(0)} giây máy, ${httpCount.toLocaleString('vi-VN')} lượt gọi API.
Máy chủ chạy đúng code thật, cấu hình production; tài khoản đều là **giả định** (bản giả của từng hãng trong \`scripts/sim.js\`).

## Kết luận: ${violations.length ? `❌ ${violations.length} vi phạm` : '✅ không có vi phạm nào'}

${violations.length ? violations.slice(0, 40).map((v) => `- ${fmtT(v.t)} [${v.kind}] ${v.text}`).join('\n') : `Trong suốt ${DAYS} ngày: không giao trùng tài khoản / Slot / mã Gemini, không vượt giới hạn lượt (quán, công cụ, khách),
không lộ mật khẩu cho máy khác, khoá 2FA không xuất hiện ở bất kỳ trang nào, không có lỗi 500, khách cũ không vào lại được sau khi hết hạn.`}

## 1. Khách

- ${people.length} khách khác nhau, ${visits} lượt ghé (có khách quay lại ngày khác).
- **${got} lượt nhận được công cụ (${pct(got, visits)})**, ${c('chon_lai_cong_cu_khac')} lượt phải chọn công cụ thứ 2 vì công cụ thích nhất đã hết.
- SMS OTP đã gửi: **${smsSent}** tin ≈ ${(smsSent * SMS_PRICE).toLocaleString('vi-VN')}đ (giả định ${SMS_PRICE}đ/tin).
- Bấm "Mua gói qua Zalo" sau khi hết hạn: ${c('zalo:bam_mua')} · hỏi "dịch vụ khác" qua Zalo: ${c('zalo:hoi_dich_vu_khac')}.

| Kết quả mỗi lượt ghé | Số lượt |
|---|---|
${byPrefix('ketqua:').map(([k, v]) => `| ${LABEL[k] || k} | ${v} |`).join('\n')}

## 2. Lượt giao mỗi ngày (so với giới hạn)

| Công cụ | Giới hạn/ngày | ${days.join(' | ')} |
|---|---|${days.map(() => '---').join('|')}|
${toolRows.join('\n')}

Kho: CapCut +10 tài khoản/ngày (2 khách), Gemini +5 link/ngày, ChatGPT **${GPT_ACCOUNTS} tài khoản** (8 khách, đăng nhập bằng mã email, 6h đăng xuất mọi thiết bị rồi giao lại), Adobe **${ADOBE_ACCOUNTS} tài khoản** (2 khách). Canva: khách nhắn Zalo. Mỗi quán **${CAFE_QUOTA} suất/ngày**.
Trung bình mỗi ngày: ${['capcut', 'chatgpt', 'gemini', 'adobe'].map((s) => `${s} ${(days.reduce((x, d) => x + c(`giao:${s}:${d}`), 0) / DAYS).toFixed(1)}`).join(' · ')}.
Bấm công cụ đang hiện "còn chỗ" rồi mới bị báo hết (người khác vừa nhận mất): ${sumPrefix('bam_roi_moi_bao_het:')} lần.

## 3. Khách đăng nhập được thật không (bản giả của hãng)

| Công cụ | Lần thử | Vào được | Không vào được |
|---|---|---|---|
${vendorRows.join('\n')}

- CapCut: Pro dùng thử tính từ lúc tạo tài khoản, slot khách tính từ lúc nhận → số giờ Pro khách bị hụt cuối slot: ${fmtStat('capcut_mat_gio_pro', 'giờ')}.

## 4. Gian lận và lách luật

| Kiểu | Số lần | Kết quả |
|---|---|---|
| Ở nhà, không có vé / không chạm thẻ (link lan trên mạng / link bạn gửi / link cũ / cắt bỏ bộ đếm của chip) + giả IP quán | ${c('gian_lan:o_nha_khong_ve')} | ${byPrefix('o_nha_khong_ve:').map(([k, v]) => `${k}: ${v}`).join(', ') || '—'} |
| Chụp mã QR trên bàn về nhà quét; ở quán thẻ riêng: link của chip KHÔNG bật bộ đếm (kẽ hở đã biết) | ${c('gian_lan:qr_ve_nha')} khách, ${sumPrefix('qr_ve_nha:')} lượt | ${byPrefix('qr_ve_nha:').map(([k, v]) => `${k}: ${v}`).join(', ') || '—'} — vẫn dính giới hạn / khách / máy / quán |
| 1 máy, SIM thứ 2 | ${c('gian_lan:nhieu_sim')} | ${byPrefix('nhieu_sim:').map(([k, v]) => `${k}: ${v}`).join(', ') || '—'} |
| Xoá cookie, quay lại | ${c('gian_lan:xoa_cookie')} | (máy được nhận lại → giới hạn vẫn áp dụng) |
| Ẩn danh + SIM thứ 2 (máy "mới") | ${c('gian_lan:xoa_cookie_sim2')} | **lọt được** nếu có SIM thật khác — vẫn phải có vé mới từ trang quán, vẫn tính suất quán |
| Spam OTP (12 số / 1 máy) | ${c('gian_lan:spam_otp')} | gửi được ${fmtStat('spam_otp:gui_duoc', 'tin')} |
| Chia sẻ ChatGPT cho bạn | ${c('gian_lan:chia_se')} | ${byPrefix('chia_se:').map(([k, v]) => `${k}: ${v}`).join(', ') || '—'} |
| Khách cũ tự vào lại sau hết hạn | ${sumPrefix('khach_cu:thu:')} | ${byPrefix('khach_cu:').filter(([k]) => !k.startsWith('thu:')).map(([k, v]) => `${k}: ${v}`).join(', ') || '—'} |

- Người đã hết hạn còn dùng tiếp được (phiên cũ chưa bị đăng xuất) tới khi chủ đổi mật khẩu:
  ChatGPT ${fmtStat('con_vao_duoc_sau_het_han:ChatGPT')}; Adobe ${fmtStat('con_vao_duoc_sau_het_han:Adobe')}.
- Thư mã về hộp thư kho: ${byPrefix('thu:').map(([k, v]) => `${k}: ${v}`).join(', ') || '—'}.

- Quán dùng thẻ NFC riêng (${CAFES.filter((x) => x.nfc).map((x) => `${x.name}: ${x.nfc.cards} thẻ, ${x.nfc.noMirror} chip không bật bộ đếm`).join('; ') || 'không có'}):
  lượt chạm theo kết quả ${all(db, "SELECT verdict, COUNT(*) AS n FROM taps t JOIN cards k ON k.id = t.card_id WHERE k.kind = 'nfc' GROUP BY verdict ORDER BY n DESC").map((r) => `${r.verdict} ${r.n}`).join(', ') || '—'};
  thẻ bị tự khoá: ${get(db, "SELECT COUNT(*) AS n FROM cards WHERE kind = 'nfc' AND status = 'locked'").n}; lượt bị "thẻ hết suất": ${c('ketqua:card_quota')}.
  Khách thật bị bảo "chạm lại thẻ": ${byPrefix('the_rieng:bao_cham_lai:').map(([k, v]) => `${k}: ${v}`).join(', ') || 'không có'}.

## 5. Việc của chủ tiệm

- Không có ca nào phải duyệt tay: ca vàng khi nhận slot tự từ chối (cài đặt yellowAction = reject) — ${c('ketqua:need_review')} lượt; lấy thêm mã tự cho qua nếu đang ở quán và đúng máy.
- Đổi mật khẩu + đăng xuất: ChatGPT ${c('chu:doi_mat_khau:chatgpt')} lần, Adobe ${c('chu:doi_mat_khau:adobe')} lần.
- Việc tay chờ chủ làm: ${(() => { const w = all(db, "SELECT (COALESCE(done_at, ?) - created_at) / 60000.0 AS m, status FROM rotation_tasks WHERE kind = 'rotate'", clock.t); if (!w.length) return 'không có'; const done = w.filter((x) => x.status === 'done'); const ms = w.map((x) => x.m).sort((a, b) => a - b); return `${w.length} việc (${done.length} xong, ${w.length - done.length} còn treo) · TB ${(ms.reduce((a, b) => a + b, 0) / ms.length).toFixed(0)} phút · lâu nhất ${ms.at(-1).toFixed(0)} phút`; })()}.${HUMAN ? `
- **Vận hành độc lập** (\`--chu-that\`): chủ là người thật, chỉ dùng trang quản trị + Trang của chủ. Nhật ký thao tác của chủ: ${ownerLog.length} lần — ${ownerLog.slice(0, 40).map((x) => `${fmtT(x.t)} ${x.text}`).join('; ')}` : ''}
- Cảnh báo ghi ở trang Theo dõi (đỏ / vàng): ${byPrefix('baodong:').map(([k, v]) => `${k}: ${v}`).join(', ') || 'không có'}.

## Giả định của mô phỏng (không phải số đo thật)

- Kiểu khách: ${PERSONAS.map(([k, w]) => `${k} ${w}%`).join(', ')}. Công cụ khách thích: ${TOOLS_W.map(([k, w]) => `${k} ${w}%`).join(', ')}.
- 25% lượt ghé là khách cũ quay lại; 20% khách thử tự vào lại sau khi hết hạn; 15% bấm "Mua gói qua Zalo" (chỉ để thử đường đi, không phải tỉ lệ thật).
- Chủ tiệm: nạp hàng 6:30, mở trang Việc tay 12:30 / 17:30 / 21:30. Giá SMS ${SMS_PRICE}đ/tin.
- Chạy lại đúng kết quả này: \`npm run sim -- --seed=${SEED} --days=${DAYS} --rate=${RATE} --gpt=${GPT_ACCOUNTS} --adobe=${ADOBE_ACCOUNTS} --quota=${CAFE_QUOTA}\`.
`;
if (SERVE) {
  // Xem trực tiếp: giữ máy chủ chạy để xem lại trang quản trị và báo cáo; không ghi đè báo cáo trong docs/.
  finalReport = report;
  simDone = true;
  feed('chu', `Mô phỏng xong — ${violations.length ? `${violations.length} vi phạm` : 'không có vi phạm nào'}`);
  console.log('Mô phỏng xong. Bảng theo dõi và trang quản trị vẫn mở để xem lại.');
} else {
  const reportPath = fileURLToPath(new URL('../docs/bao-cao-mo-phong.md', import.meta.url));
  writeFileSync(reportPath, report);
  console.log(report);
  console.log('(Đã lưu: docs/bao-cao-mo-phong.md)');
  server.close();
  db.close();
  rmSync(DIR, { recursive: true, force: true });
  process.exit(violations.length ? 1 : 0);
}

function ownerPage(msg = '') {
  const rows = ['chatgpt', 'adobe', 'capcut'].flatMap((v) => [...V[v].acc].map(([email, a]) => `<tr><td>${VNAME[v]}</td><td><code>${escH(email)}</code></td><td><code>${escH(a.password)}</code></td>
<td>${a.secret ? `<code>${totpNow(a.secret, clock.t).code}</code>` : v === 'capcut' ? (clock.t < a.proUntil ? 'Pro còn' : 'hết Pro') : ''}</td><td>${a.sessions.size}</td>
<td><form method="post" action="/chu/doi"><input type="hidden" name="v" value="${v}"><input type="hidden" name="email" value="${escH(email)}"><button>Đổi mật khẩu + đăng xuất mọi thiết bị</button>${a.secret ? '<button name="keep" value="1">Chỉ đăng xuất mọi thiết bị</button>' : ''}</form></td></tr>`)).join('');
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Trang của chủ</title>
<style>body{font:15px/1.45 system-ui,sans-serif;margin:16px;max-width:1100px;background:#f6f2ea}table{border-collapse:collapse;width:100%;font-size:13px}td,th{border-bottom:1px solid #e4dccd;padding:4px 6px;text-align:left}textarea{width:100%;font:12px ui-monospace,monospace}.box{background:#fff;border:1px solid #e4dccd;border-radius:8px;padding:10px;margin:8px 0}.msg{background:#e7f3e8;padding:8px;border-radius:6px}</style></head><body>
<h1>Trang của chủ — giờ mô phỏng ${fmtT(clock.t)}</h1><p><a href="/">← Bảng theo dõi</a> · <a href="${config.baseUrl}/admin" target="_blank">Quản trị TBQ</a></p>
${msg ? `<p class="msg">${escH(msg)}</p>` : ''}
<h2>Chợ tài khoản (mua hàng)</h2><form method="post" action="/chu/mua" class="box">
${[['chatgpt', 'ChatGPT Plus (5 khách)'], ['adobe', 'Adobe (2 khách)'], ['capcut', 'CapCut Pro 7 ngày (2 khách)'], ['gemini', 'Link Gemini']].map(([k, l]) => `<label>${l}: <input name="${k}" type="number" min="0" max="50" value="0" style="width:60px"></label> `).join('')}<button>Mua</button></form>
${purchases.slice(0, 6).map((p) => `<div class="box"><b>${VNAME[p.kind]}</b> · mua lúc ${fmtT(p.t)} · ${p.lines.length} dòng — dán vào Quản trị › Kho tài khoản<textarea rows="${Math.min(6, p.lines.length)}" readonly onclick="this.select()">${escH(p.lines.join('\n'))}</textarea></div>`).join('')}
<h2>Tài khoản của tôi ở các hãng</h2><table><tr><th>Hãng</th><th>Email</th><th>Mật khẩu hiện tại</th><th>2FA / Pro</th><th>Thiết bị đang đăng nhập</th><th></th></tr>${rows || '<tr><td colspan="6">Chưa mua tài khoản nào.</td></tr>'}</table>
</body></html>`;
}

// ---------- Bảng theo dõi (http://localhost:3921) ----------
function dashState() {
  const now = clock.t;
  const dayStart = START + dayOf(now) * DAY;
  const n = (sql, ...p) => get(db, sql, ...p).n;
  const sumP = (p) => [...count].filter(([k]) => k.startsWith(p)).reduce((x, [, v]) => x + v, 0);
  const avail = new Map(toolAvailability(ctx).map((x) => [x.tool.id, x.free]));
  const d = new Date(now + VN);
  return {
    clock: `Ngày ${dayOf(now) + 1}/${DAYS} · ${['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][d.getUTCDay()]} ${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')} · ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`,
    progress: Math.min(100, Math.round(((now - START) / (END - START)) * 100)),
    speed: Number.isFinite(speed) ? speed : 'max', paused, done: simDone,
    stats: {
      khach: people.filter((p) => p.visits > 0).length, luot: sumP('ketqua:'), nhan: sumP('ketqua:nhan:'),
      dangDung: n("SELECT COUNT(*) AS n FROM slots WHERE status = 'active'"),
      viecTay: n("SELECT COUNT(*) AS n FROM rotation_tasks WHERE status = 'todo'"),
      sms: smsSent, viPham: violations.length, gianLanChan: sumP('o_nha_khong_ve:bi_chan') + sumP('nhieu_sim:bi_chan') + sumP('chia_se:bi_chan'),
    },
    tools: all(db, 'SELECT * FROM tools WHERE enabled = 1 ORDER BY sort').map((t) => ({
      name: t.name, today: toolUsedToday(ctx, t.id), cap: t.daily_cap, free: avail.get(t.id) ?? 0,
      dangDung: n("SELECT COUNT(*) AS n FROM slots WHERE tool_id = ? AND status = 'active'", t.id),
    })),
    cafes: CAFES.map((c) => {
      const row = get(db, 'SELECT * FROM cafes WHERE id = ?', c.id);
      return {
        name: c.name, open: isOpen(c, now),
        today: n(`SELECT COUNT(*) AS n FROM slots WHERE cafe_id = ? AND created_at >= ? AND ${COUNTED}`, c.id, dayStart), quota: row.daily_quota,
        // Quán dùng thẻ riêng: link như chạm chip Bàn 3 lần kế tiếp (không tăng bộ đếm trong mô phỏng).
        entry: c.nfc ? `${config.baseUrl}/c/${c.chips[2].token}?m=${c.chips[2].uid}x${hex6(c.chips[2].ctr + 1)}` : `${config.baseUrl}/qs/${c.slug}?t=${ticketFor(c, now)}`,
      };
    }),
    feed: feedLog.slice(-150).reverse().map((e) => ({ at: fmtT(e.t), kind: e.kind, text: e.text })),
    violations: violations.slice(-30).map((v) => `${fmtT(v.t)} [${v.kind}] ${v.text}`),
    admin: { url: `${config.baseUrl}/admin`, password: ADMIN_PW },
    report: simDone ? finalReport : '',
    debug: { running, queued: heap.length, next: heap.length ? fmtT(heap[0].t) : null, paused, speed: String(speed) },
  };
}

function startDashboard() {
  http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://localhost');
    if (u.pathname === '/state') { res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(dashState())); return; }
    if (u.pathname === '/chu' || u.pathname.startsWith('/chu/')) {
      let msg = '';
      if (req.method === 'POST') {
        const chunks = []; for await (const c of req) chunks.push(c);
        const f = Object.fromEntries(new URLSearchParams(Buffer.concat(chunks).toString('utf8')));
        if (u.pathname === '/chu/mua') {
          for (const k of ['chatgpt', 'adobe', 'capcut', 'gemini']) { const n = Math.min(50, Math.max(0, Number(f[k]) || 0)); if (n) buy(k, n); }
          msg = 'Đã mua. Dán danh sách vào Kho tài khoản.';
        }
        if (u.pathname === '/chu/doi' && V[f.v]?.acc.has(f.email)) {
          const np = V[f.v].rotate(f.email, { keep: f.keep === '1' });
          if (f.keep !== '1') inc(`chu:doi_mat_khau:${f.v}`);
          logOwner(`${f.keep === '1' ? 'chỉ đăng xuất' : 'đổi mật khẩu + đăng xuất'} ${f.email}`);
          msg = f.keep === '1' ? `Đã đăng xuất mọi thiết bị của ${f.email} (giữ mật khẩu).` : `Mật khẩu mới của ${f.email}: ${np}`;
        }
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(ownerPage(msg));
      return;
    }
    if (u.pathname === '/control' && req.method === 'POST') {
      const a = u.searchParams.get('a');
      if (a === 'pause') paused = true;
      if (a === 'resume') paused = false;
      if (a === 'speed') { const v = u.searchParams.get('v'); speed = v === 'max' ? Infinity : Math.max(1, Number(v) || 120); paused = false; }
      anchor = null;
      res.writeHead(204).end();
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(dashHtml());
  }).listen(DASH_PORT, '127.0.0.1');
}

function dashHtml() {
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Theo dõi mô phỏng — Tiệm Bản Quyền</title>
<style>
:root{--ink:#1d1b18;--paper:#f6f2ea;--card:#fffdf9;--line:#e4dccd;--gold:#b38b45;--gold50:#f8eedb;--stone:#6b645a;--green:#2f6b3a;--red:#a3322b}
*{box-sizing:border-box}body{margin:0;font:15px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:var(--paper);color:var(--ink)}
header{background:var(--ink);color:#f6f2ea;padding:14px 20px;display:flex;flex-wrap:wrap;gap:14px;align-items:center;justify-content:space-between}
header h1{font:600 18px Georgia,serif;margin:0}header .clock{font:600 22px ui-monospace,Menlo,monospace;color:#d9be86}
.bar{height:4px;background:#3a352e}.bar i{display:block;height:4px;background:var(--gold);width:0}
.ctl button{font:inherit;font-size:13px;border:1px solid #6b645a;background:transparent;color:#f6f2ea;border-radius:999px;padding:5px 12px;cursor:pointer;margin-left:4px}
.ctl button.on{background:var(--gold);border-color:var(--gold);color:var(--ink)}
main{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);gap:16px;padding:16px 20px;max-width:1400px;margin:0 auto}
@media(max-width:900px){main{grid-template-columns:1fr}}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px 16px;margin-bottom:16px}
.card h2{font:600 16px Georgia,serif;margin:0 0 10px}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.stat{background:var(--gold50);border-radius:8px;padding:8px 10px}
.stat b{display:block;font-size:22px}.stat span{font-size:12px;color:var(--stone)}.stat.bad{background:#f7e3e1}.stat.bad b{color:var(--red)}.stat.good b{color:var(--green)}
table{width:100%;border-collapse:collapse;font-size:14px}td,th{padding:6px 6px;border-bottom:1px solid var(--line);text-align:left}th{font-size:12px;color:var(--stone);font-weight:600}
.meter{height:6px;background:#eee6d6;border-radius:3px;overflow:hidden;min-width:60px}.meter i{display:block;height:6px;background:var(--gold)}
.code{font:600 16px ui-monospace,Menlo,monospace;letter-spacing:2px}.off{color:var(--red);font-weight:600}.muted{color:var(--stone);font-size:13px}
a{color:#76561f}.feed{height:640px;overflow:auto;font-size:13.5px}.feed div{padding:5px 0;border-bottom:1px dashed var(--line)}
.feed time{font:12px ui-monospace,Menlo,monospace;color:var(--stone);margin-right:6px}
.k-giao{color:var(--green)}.k-chu{color:#76561f}.k-mac{color:#33507a}.k-gianlan{color:#8a4b12}.k-baodong{color:var(--red)}.k-vipham{color:#fff;background:var(--red);padding:2px 4px}
.links a{display:inline-block;margin:0 10px 6px 0}pre{white-space:pre-wrap;font-size:13px;max-height:500px;overflow:auto;background:#fbf8f2;padding:10px;border-radius:8px}
.ok{color:var(--green);font-weight:600}
</style></head><body>
<header><div><h1>Theo dõi mô phỏng · Tiệm Bản Quyền</h1><div class="muted" id="sub" style="color:#c9bfae"></div></div>
<div class="clock" id="clock">…</div>
<div class="ctl"><button data-a="pause">⏸ Tạm dừng</button><button data-v="60" title="1 phút mô phỏng = 1 giây">Chậm</button><button data-v="120" title="1 ngày ≈ 12 phút">Vừa</button><button data-v="600" title="1 ngày ≈ 2,4 phút">Nhanh</button><button data-v="3600" title="1 giờ mô phỏng = 1 giây">Rất nhanh</button><button data-v="max" title="Chạy hết sức máy">Tối đa</button></div></header>
<div class="bar"><i id="prog"></i></div>
<main><div>
<section class="card"><div class="stats" id="stats"></div></section>
<section class="card"><h2>Hôm nay theo công cụ</h2><table id="tools"></table></section>
<section class="card"><h2>Quán</h2><table id="cafes"></table><p class="muted">"Vào như khách" = link có vé như nút trên trang quán QS (dùng được 30 phút mô phỏng, 1 máy). Muốn tự thử làm khách: bấm <b>Tạm dừng</b> trước (đồng hồ mô phỏng chạy rất nhanh) rồi mở link.</p></section>
<section class="card"><h2>Trang quản trị TBQ (đang chạy trong mô phỏng)</h2><p class="links" id="links"></p><p class="muted" id="pw"></p></section>
<section class="card" id="viol"></section>
<section class="card" id="rep" hidden><h2>Báo cáo cuối</h2><pre id="report"></pre></section>
</div><div><section class="card"><h2>Đang diễn ra</h2><div class="feed" id="feed"></div></section></div></main>
<script>
const $=(s)=>document.querySelector(s);const esc=(x)=>String(x).replace(/[&<>"]/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
document.querySelectorAll('.ctl button').forEach((b)=>b.onclick=()=>{const a=b.dataset.a?(b.classList.contains('on')?'resume':'pause'):'speed';fetch('/control?a='+a+(b.dataset.v?'&v='+b.dataset.v:''),{method:'POST'}).then(tick);});
let linksDone=false;
async function tick(){let s;try{s=await fetch('/state').then((r)=>r.json());}catch{$('#clock').textContent='Mất kết nối';return;}
$('#clock').textContent=s.done?'Xong · '+s.clock:s.clock;$('#prog').style.width=s.progress+'%';
$('#sub').textContent=s.done?'Mô phỏng đã chạy xong':(s.paused?'Đang tạm dừng — đồng hồ mô phỏng đứng yên':(s.speed==='max'?'Tốc độ tối đa':'1 ngày mô phỏng ≈ '+(s.speed>=3600?Math.round(86400/s.speed)+' giây':Math.round(1440/s.speed*10)/10+' phút')+' thật'));
document.querySelectorAll('.ctl button').forEach((b)=>{b.classList.toggle('on',b.dataset.a?s.paused:(!s.paused&&String(s.speed)===b.dataset.v));if(b.dataset.a)b.textContent=s.paused?'▶ Chạy tiếp':'⏸ Tạm dừng';});
const st=s.stats;const card=(v,l,c='')=>'<div class="stat '+c+'"><b>'+v+'</b><span>'+l+'</span></div>';
$('#stats').innerHTML=card(st.khach,'khách đã đến')+card(st.nhan+' / '+st.luot,'lượt nhận được / lượt ghé')+card(st.dangDung,'slot đang dùng')
+card(st.viecTay,'việc tay chưa xong')+card(st.gianLanChan,'lần gian lận bị chặn','good')+card(st.sms,'SMS OTP đã gửi')+card(st.viPham,'vi phạm',st.viPham?'bad':'good');
$('#tools').innerHTML='<tr><th>Công cụ</th><th>Giao hôm nay</th><th></th><th>Còn giao được</th><th>Đang dùng</th></tr>'+s.tools.map((t)=>'<tr><td>'+esc(t.name)+'</td><td>'+t.today+(t.cap!=null?' / '+t.cap:'')+'</td><td><div class="meter"><i style="width:'+(t.cap?Math.min(100,100*t.today/t.cap):0)+'%"></i></div></td><td>'+t.free+'</td><td>'+t.dangDung+'</td></tr>').join('');
$('#cafes').innerHTML='<tr><th>Quán</th><th>Suất hôm nay</th><th></th></tr>'+s.cafes.map((c)=>'<tr><td>'+esc(c.name)+(c.open?'':' <span class="muted">(đóng cửa)</span>')+'</td><td>'+c.today+' / '+c.quota+'</td><td><a href="'+esc(c.entry)+'" target="_blank">vào như khách</a></td></tr>').join('');
if(!linksDone){const a=s.admin.url;$('#links').innerHTML=[['','Tổng quan'],['/live','Theo dõi'],['/tasks','Việc tay'],['/tools','Công cụ'],['/accounts','Kho tài khoản'],['/slots','Slot'],['/customers','Khách'],['/events','Nhật ký'],['/cafes','Quán']].map(([p,l])=>'<a href="'+a+p+'" target="_blank">'+l+'</a>').join('')+' · <a href="/chu" target="_blank"><b>Trang của chủ (hãng + chợ)</b></a>';$('#pw').innerHTML='Mật khẩu quản trị (chỉ dùng trong mô phỏng): <b class="code">'+esc(s.admin.password)+'</b>';linksDone=true;}
$('#viol').innerHTML='<h2>Vi phạm</h2>'+(s.violations.length?s.violations.map((v)=>'<div class="k-vipham">'+esc(v)+'</div>').join(''):'<p class="ok">Chưa có vi phạm nào ✓</p>');
$('#feed').innerHTML=s.feed.map((e)=>'<div class="k-'+e.kind+'"><time>'+e.at+'</time>'+esc(e.text)+'</div>').join('');
if(s.done&&s.report){$('#rep').hidden=false;$('#report').textContent=s.report;}}
tick();setInterval(tick,1000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)tick();});
</script></body></html>`;
}
