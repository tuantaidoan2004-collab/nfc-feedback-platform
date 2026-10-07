// Diễn tập vận hành: KHO GIẢ, VẬN HÀNH THẬT.
//   npm run van-hanh               → mở bảng điều khiển http://localhost:3930/dien-tap
//   npm run van-hanh -- --reset    → xoá dữ liệu diễn tập, làm lại từ đầu
// Khác `npm run local` (chế độ thử, OTP hiện trên trang) và `npm run sim` (đồng hồ tua, khách là máy):
//   · TBQ chạy ĐÚNG chế độ production: khoá thật, BASE_URL https://thu.tiembanquyen.com/colap, OTP đi đường eSMS, thư mã đi qua
//     đúng code Cloudflare Worker trong extras/. Phía trước là "Caddy giả" (cổng 3930) gắn X-Real-IP như Caddy thật.
//   · Người thật bấm trên trình duyệt. Mỗi máy khách là 1 địa chỉ riêng (may1.localhost, may2.localhost…) → cookie tách nhau
//     như điện thoại khác nhau. Chủ tiệm: chu.localhost. Chủ tự tạo quán, thẻ, nhập kho trong trang quản trị như ngày thật.
//   · Hãng giả (/hang/…): ChatGPT (mật khẩu + 2FA), Claude (chỉ email, mã 6 số gửi về hộp thư Tiệm → TBQ), Adobe (mật khẩu +
//     mã email gửi về TBQ), CapCut, Gemini (link 1 lần), Canva (nhóm Pro: khách xem mình đã được mời / chấp nhận lời mời).
//     Khách phải đăng nhập được bằng đúng thông tin TBQ giao. Chủ "đổi mật khẩu + đăng xuất mọi thiết bị" ở bảng điều khiển.
//   · Bot Canva giả: gọi đúng API /worker như bot thật (scripts/canva-bot.js) để mời / gỡ khách trong nhóm Canva giả.
//   · Điện thoại giả: tin SMS OTP mà TBQ gửi qua eSMS. Tua giờ: lùi mọi mốc thời gian trong database (thử hết hạn 24 giờ / 7 ngày).
//   · Tự kiểm: khoá 2FA không bao giờ hiện ra; mật khẩu chỉ hiện cho máy đang giữ slot; ai đăng nhập hãng mà không có slot → ghi vi phạm.
// Dữ liệu: ~/.tbq-van-hanh (không đụng database thật).
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomInt } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { totpNow } from '../src/lib/totp.js';
import { makeTicket } from '../src/domain/ticket.js';
import worker from '../extras/cloudflare-email-worker.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const opt = (name, d) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
// --port / --dir: chạy bản thứ 2 riêng (vd. kịch bản tự động scripts/van-hanh-sau.js) không đụng dữ liệu diễn tập đang có.
const PORT = Number(opt('--port', 3930)); // Caddy giả + bảng điều khiển + hãng giả
const APP_PORT = PORT + 1; // TBQ (khách vào qua Caddy giả, như trên VPS)
const DIR = opt('--dir', join(homedir(), '.tbq-van-hanh'));
const DB_PATH = join(DIR, 'tbq.sqlite');
const STATE = join(DIR, 'dien-tap.json');
const PUBLIC = `http://localhost:${PORT}`;
const BP = '/colap';

if (args.includes('--reset')) rmSync(DIR, { recursive: true, force: true });
mkdirSync(DIR, { recursive: true });

// ---------- Trạng thái diễn tập (lưu đĩa: tắt mở lại vẫn còn) ----------
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const rand32 = (n) => Array.from({ length: n }, () => B32[randomInt(32)]).join('');
const newPw = () => `Pw-${randomBytes(6).toString('base64url')}`;
const fresh = !existsSync(STATE);
const S = fresh ? {
  env: {
    NODE_ENV: 'production', PORT: String(APP_PORT), DB_PATH, BASE_URL: `https://thu.tiembanquyen.com${BP}`, CLIENT_IP_HEADER: 'x-real-ip',
    APP_SECRET: randomBytes(32).toString('base64'), DATA_KEY: randomBytes(32).toString('base64'),
    ADMIN_PASSWORD: `chu-tiem-${randomBytes(4).toString('hex')}`, MAIL_WEBHOOK_SECRET: randomBytes(32).toString('base64'),
    OTP_PROVIDER: 'esms', ESMS_URL: `http://127.0.0.1:${PORT}/dien-tap/esms`, ESMS_API_KEY: 'esms-dien-tap', ESMS_SECRET_KEY: randomBytes(16).toString('hex'),
    ESMS_BRANDNAME: 'TiemBanQuyen', QS_TICKET_KEY: randomBytes(32).toString('hex'),
    WORKER_TOKEN: randomBytes(32).toString('base64url'), // bot Canva thật trên máy Mac gọi /colap/worker/… qua Caddy giả
  },
  warpMs: 0, // đã tua bao lâu (mọi mốc thời gian trong database lùi đi chừng này)
  vendors: { chatgpt: {}, claude: {}, adobe: {}, capcut: {} }, // email → {password?, secret?, proUntil?, sessions: {sid: {host, since}}, pending: {dev: code}}
  canva: { owner: 'canva-nhom@kho.test', seats: 5, members: {}, botAuto: false, botLog: [] }, // nhóm Canva Pro giả; members: email → {status, at}
  gemini: {}, // link → {usedBy, at}
  sms: [], // {phone, text, at}
  mails: [], // {to, vendor, code, at, result}
  violations: [], // {at, msg}
  logins: [], // {at, vendor, email, host, ok, note}
  chips: {}, // token thẻ NFC → {uid, ctr}
  hostDid: {}, // máy (host) → mã máy TBQ (cookie did) — để biết máy nào giữ slot nào
} : JSON.parse(readFileSync(STATE, 'utf8'));
// Dữ liệu diễn tập cũ (trước khi có Claude / Canva) vẫn mở được.
S.vendors.claude ||= {};
S.canva ||= { owner: 'canva-nhom@kho.test', seats: 5, members: {}, botAuto: false, botLog: [] };
let saveTimer = null;
const save = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => writeFileSync(STATE, JSON.stringify(S, null, 1)), 200); };
const now = () => Date.now() + S.warpMs; // giờ "ảo" sau khi tua (dùng cho hạn Pro CapCut)
const violation = (msg) => { S.violations.unshift({ at: Date.now(), msg }); console.error(`✘ VI PHẠM: ${msg}`); save(); };

/** Máy giả: tên → IP mà Caddy giả gắn vào X-Real-IP. */
const DEVICES = {
  may1: { ip: '113.161.20.30', label: 'Máy 1 · iPhone · Wi-Fi quán' },
  may2: { ip: '113.161.20.30', label: 'Máy 2 · Android · Wi-Fi quán' },
  may3: { ip: '27.72.100.13', label: 'Máy 3 · 4G Viettel' },
  may4: { ip: '1.53.40.40', label: 'Máy 4 · ở nhà (bạn của khách)' },
  chu: { ip: '171.244.1.1', label: 'Chủ tiệm' },
};
const hostName = (req) => String(req.headers.host || '').split(':')[0].replace(/\.localhost$/, '');
// Thêm máy tuỳ ý cho kịch bản tự động: wifiN = Wi-Fi quán, g4N = 4G (mỗi máy 1 IP), nhaN = ở nhà.
function devOf(req) {
  const h = hostName(req);
  if (DEVICES[h]) return h;
  const m = /^(wifi|g4|nha)(\d{1,3})$/.exec(h);
  if (!m) return null;
  const n = Number(m[2]);
  DEVICES[h] = { ip: m[1] === 'wifi' ? '113.161.20.30' : m[1] === 'g4' ? `27.72.${100 + (n >> 8)}.${n & 255}` : `1.53.${40 + (n >> 8)}.${n & 255}`,
    label: `${m[1] === 'wifi' ? 'Wi-Fi quán' : m[1] === 'g4' ? '4G' : 'Ở nhà'} #${n}` };
  return h;
}
const devUrl = (dev, path) => `http://${dev}.localhost:${PORT}${path}`;

// ---------- Kho giả ----------
function addStock(kind, n) {
  const tag = randomBytes(2).toString('hex');
  const out = [];
  for (let i = 1; i <= n; i++) {
    if (kind === 'gemini') { const l = `https://one.google.com/join/${rand32(10)}`; S.gemini[l] = { usedBy: null }; out.push(l); continue; }
    if (kind === 'canva') { out.push(`${S.canva.owner}|${S.canva.seats}`); continue; }
    const email = `${{ chatgpt: 'gpt', claude: 'cl', adobe: 'ad', capcut: 'cc' }[kind]}-${tag}-${i}@kho.test`;
    // Claude: không mật khẩu — đăng nhập bằng mã 6 số gửi về email (hộp thư của Tiệm, Cloudflare chuyển về TBQ).
    const a = { password: kind === 'claude' ? null : newPw(), sessions: {}, pending: {}, created: now() };
    if (kind === 'chatgpt') a.secret = rand32(32);
    if (kind === 'capcut') a.proUntil = now() + 7 * 24 * 3600e3; // Pro dùng thử 7 ngày tính từ lúc tạo tài khoản
    S.vendors[kind][email] = a;
    out.push(kind === 'chatgpt' ? `${email}|${a.password}|${a.secret.match(/.{4}/g).join(' ')}` : kind === 'claude' ? email : `${email}|${a.password}`);
  }
  (S.batches ||= []).unshift({ kind, at: Date.now(), lines: out });
  save();
  return out;
}
// Kho chuẩn chủ chọn 06/10: 3 ChatGPT (× 8 khách), 3 Claude (× 3, 1 dự phòng cho 6h sáng).
if (fresh) { addStock('chatgpt', 3); addStock('claude', 3); addStock('adobe', 4); addStock('capcut', 10); addStock('gemini', 5); addStock('canva', 1); }

const allPasswords = () => Object.entries(S.vendors).flatMap(([v, accs]) => Object.entries(accs).filter(([, a]) => a.password).map(([email, a]) => ({ v, email, password: a.password })));
const allSecrets = () => Object.values(S.vendors.chatgpt).map((a) => a.secret);

// ---------- Database TBQ (chỉ để đọc / tua giờ / kiểm) ----------
let db = null;
const dbx = () => { if (!db) { db = new DatabaseSync(DB_PATH); db.exec('PRAGMA busy_timeout = 5000;'); } return db; };
const q = (sql, ...p) => dbx().prepare(sql).all(...p);
/** Máy (host) đang giữ slot còn hạn của tài khoản này? */
function holds(host, email) {
  const did = S.hostDid[host];
  if (!did) return null;
  return q(`SELECT s.id, s.seat, s.expires_at FROM slots s JOIN accounts a ON a.id = s.account_id
            WHERE a.login_email = ? AND s.device_id = ? AND s.status = 'active'`, email.toLowerCase(), did)[0] || null;
}

/** Lùi mọi mốc thời gian (ms) trong database đi `ms` → như thời gian trôi qua. Rồi chạy việc định kỳ ngay. */
async function warp(ms) {
  // Giá trị hỏng (vô cực / không phải số) sẽ làm hỏng mọi mốc thời gian trong database → từ chối.
  if (!Number.isFinite(ms) || ms <= 0) throw new Error(`Tua giờ không hợp lệ: ${ms}`);
  const d = dbx();
  const tables = q("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").map((r) => r.name);
  d.exec('BEGIN IMMEDIATE');
  try {
    for (const t of tables) {
      const cols = d.prepare(`PRAGMA table_info(${t})`).all().filter((c) => /(_at|_until)$/.test(c.name) && /INT/i.test(c.type)).map((c) => c.name);
      for (const c of cols) d.prepare(`UPDATE ${t} SET ${c} = ${c} - ? WHERE ${c} > 1000000000000`).run(ms);
    }
    d.exec('COMMIT');
  } catch (err) { d.exec('ROLLBACK'); throw err; }
  S.warpMs += ms;
  save();
  // Chạy việc định kỳ ngay (đúng code src/jobs.js) thay vì chờ 30 giây.
  const { loadConfig } = await import('../src/config.js');
  const { openDb } = await import('../src/db/index.js');
  const { createCtx } = await import('../src/ctx.js');
  const { runJobs } = await import('../src/jobs.js');
  const jdb = openDb(DB_PATH);
  try { await runJobs(createCtx({ config: loadConfig(S.env), db: jdb, log: () => {} })); } finally { jdb.close(); }
}

// ---------- Khởi động TBQ (production) ----------
const ENV = { PATH: process.env.PATH, ...S.env };
if (fresh) {
  for (const s of ['scripts/seed.js', 'scripts/pilot.js']) {
    const r = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', s], { cwd: ROOT, env: ENV, encoding: 'utf8' });
    if (r.status !== 0) { console.error(`Lỗi ${s}:\n${r.stderr}`); process.exit(1); }
  }
}
const app = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'src/server.js'], { cwd: ROOT, env: ENV, stdio: ['ignore', 'pipe', 'pipe'] });
const appLog = [];
for (const s of [app.stdout, app.stderr]) {
  s.on('data', (b) => {
    for (const line of String(b).split('\n').filter(Boolean)) {
      appLog.push(line); if (appLog.length > 300) appLog.shift();
      if (/"level":"(error|warn)"/.test(line)) console.error(`TBQ: ${line}`);
    }
  });
}
app.on('exit', (code) => { console.error(`TBQ dừng (mã ${code}).`); process.exit(code ?? 1); });
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { writeFileSync(STATE, JSON.stringify(S, null, 1)); app.kill(sig); });
process.on('exit', () => { try { app.kill(); } catch { /* đã dừng */ } }); // không để sót máy chủ TBQ giữ cổng

// ---------- Tiện ích HTTP ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const readBody = (req) => new Promise((r) => { const c = []; req.on('data', (x) => c.push(x)); req.on('end', () => r(Buffer.concat(c))); });
const cookies = (req) => Object.fromEntries(String(req.headers.cookie || '').split(';').map((s) => s.trim().split('=')).filter((p) => p[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
const send = (res, status, body, type = 'text/html; charset=utf-8', extra = {}) => { res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', ...extra }); res.end(body); };
const redirect = (res, to, extra = {}) => { res.writeHead(303, { Location: to, ...extra }); res.end(); };
const t = (ms) => new Date(ms).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false });
const page = (title, body) => `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><style>
body{font:15px/1.45 system-ui,sans-serif;margin:0;padding:16px;max-width:1100px;color:#222;background:#f6f6f4}
h1{font-size:20px;margin:0 0 4px}h2{font-size:16px;margin:20px 0 8px;border-bottom:1px solid #ddd;padding-bottom:4px}
.box{background:#fff;border:1px solid #ddd;border-radius:8px;padding:12px;margin:8px 0}
table{border-collapse:collapse;width:100%;font-size:13px}td,th{border-bottom:1px solid #eee;padding:4px 6px;text-align:left;vertical-align:top}
code,textarea{font:12px ui-monospace,monospace}textarea{width:100%;box-sizing:border-box}
.bad{color:#b00020;font-weight:600}.ok{color:#0a7a2f}.muted{color:#777;font-size:12px}
button,.btn{font:inherit;padding:6px 12px;border-radius:6px;border:1px solid #888;background:#fff;cursor:pointer;text-decoration:none;color:#222;display:inline-block;margin:2px}
.hang{max-width:380px;margin:30px auto;background:#fff;border:1px solid #ddd;border-radius:12px;padding:20px}
.hang input{width:100%;box-sizing:border-box;padding:8px;margin:4px 0 10px;font:inherit}.tag{font-size:11px;background:#fde68a;padding:2px 6px;border-radius:4px}
</style></head><body>${body}</body></html>`;

// ---------- Hãng giả ----------
const VENDOR_NAME = { chatgpt: 'ChatGPT', claude: 'Claude', adobe: 'Adobe', capcut: 'CapCut', gemini: 'Gemini', canva: 'Canva' };
async function sendVendorMail(to, vendor, code, { subject, text } = {}) {
  // Thư của hãng → Cloudflare Email Worker (đúng code extras/) → POST /colap/hooks/mail qua Caddy giả, như thật.
  const from = { adobe: 'message@adobe.com', capcut: 'no-reply@capcut.com', chatgpt: 'noreply@tm.openai.com', claude: 'no-reply@mail.anthropic.com' }[vendor];
  const raw = [`From: ${VENDOR_NAME[vendor]} <${from}>`, `To: ${to}`, `Subject: ${subject || `Your ${VENDOR_NAME[vendor]} verification code`}`,
    `Message-ID: <dt-${Date.now()}-${randomBytes(3).toString('hex')}@${vendor}.fake>`, `Date: ${new Date().toUTCString()}`, 'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8', '', text || `Your verification code is ${code}`, ''].join('\r\n');
  let result = 'ok';
  try {
    await worker.email({ to, from, raw: new Blob([raw]).stream(), setReject: (r) => { result = `từ chối: ${r}`; }, forward: async () => { result = 'chuyển hộp dự phòng'; } },
      { WEBHOOK_URL: `http://127.0.0.1:${PORT}${BP}/hooks/mail`, WEBHOOK_SECRET: S.env.MAIL_WEBHOOK_SECRET });
  } catch (err) { result = `lỗi: ${err.message}`; }
  S.mails.unshift({ to, vendor, code: code || subject, at: Date.now(), result });
  save();
}

function vendorPage(vendor, req, msg = '', step = 'login', email = '') {
  const host = devOf(req);
  const sid = cookies(req)[`hang_${vendor}`];
  const sess = sid && Object.entries(S.vendors[vendor] || {}).find(([, a]) => a.sessions[sid]);
  let body;
  if (vendor === 'gemini') {
    body = `<p>Dán link / mã nhận Gemini Pro mà Tiệm giao, và Gmail của bạn.</p>
<form method="post"><label>Link hoặc mã</label><input name="link" required><label>Gmail của bạn</label><input name="gmail" type="email" required><button>Nhận</button></form>`;
  } else if (sess) {
    const [em, a] = sess;
    const extra = vendor === 'capcut' ? `<p>Pro: ${now() < a.proUntil ? `<b class="ok">còn tới ${t(a.proUntil - S.warpMs)}</b>` : '<b class="bad">đã hết Pro dùng thử</b>'}</p>` : '';
    body = `<p class="ok">✔ Đã đăng nhập <b>${esc(em)}</b></p>${extra}<p class="muted">Phiên này còn sống tới khi chủ tài khoản đổi mật khẩu + đăng xuất mọi thiết bị.</p>
<form method="post" action="?logout=1"><button>Đăng xuất</button></form>`;
  } else if (step === 'code') {
    body = `<p>${vendor === 'chatgpt' ? 'Nhập mã 6 số từ ứng dụng xác thực (2FA).' : `${VENDOR_NAME[vendor]} đã gửi mã 6 số tới email tài khoản. Bấm <b>Lấy mã</b> trên trang Tiệm.`}</p>
<form method="post"><input type="hidden" name="email" value="${esc(email)}"><input type="hidden" name="step" value="code"><label>Mã 6 số</label><input name="code" inputmode="numeric" autocomplete="one-time-code" required><button>Tiếp tục</button></form>`;
  } else if (vendor === 'claude') {
    body = `<form method="post"><label>Email</label><input name="email" type="email" required value="${esc(email)}"><button>Tiếp tục với email</button></form>`;
  } else {
    body = `<form method="post"><label>Email</label><input name="email" type="email" required value="${esc(email)}"><label>Mật khẩu</label><input name="password" type="password" required><button>Đăng nhập</button></form>`;
  }
  return page(`${VENDOR_NAME[vendor]} (giả)`, `<div class="hang"><h1>${VENDOR_NAME[vendor]} <span class="tag">HÃNG GIẢ · diễn tập</span></h1>
<p class="muted">${esc(host ? DEVICES[host].label : 'máy không rõ — mở bằng may1.localhost…')}</p>${msg ? `<p class="bad">${esc(msg)}</p>` : ''}${body}</div>`);
}

async function vendorPost(vendor, req, res, url) {
  const host = devOf(req) || 'khong-ro';
  const f = Object.fromEntries(new URLSearchParams(String(await readBody(req))));
  const log = (email, ok, note) => { S.logins.unshift({ at: Date.now(), vendor, email, host, ok, note }); save(); };
  if (vendor === 'gemini') {
    const l = S.gemini[String(f.link || '').trim()];
    if (!l) { log(f.link, false, 'link không có'); return send(res, 200, vendorPage(vendor, req, 'Link / mã không hợp lệ.')); }
    if (l.usedBy) { log(f.link, false, `đã dùng bởi ${l.usedBy}`); return send(res, 200, vendorPage(vendor, req, 'Link này đã được dùng.')); }
    l.usedBy = `${f.gmail} (${host})`; l.at = Date.now();
    const holder = q(`SELECT s.device_id FROM slots s JOIN redeem_codes r ON r.id = s.redeem_id WHERE r.value = ?`, f.link.trim())[0];
    if (!holder || holder.device_id !== S.hostDid[host]) violation(`Gemini: ${host} dùng link không phải của máy mình`);
    log(f.link, true, f.gmail); save();
    return send(res, 200, page('Gemini (giả)', `<div class="hang"><h1>Gemini <span class="tag">HÃNG GIẢ</span></h1><p class="ok">✔ ${esc(f.gmail)} đã nhận Gemini Pro.</p></div>`));
  }
  const accs = S.vendors[vendor];
  if (url.searchParams.get('logout')) {
    const sid = cookies(req)[`hang_${vendor}`];
    for (const a of Object.values(accs)) delete a.sessions[sid];
    save();
    return redirect(res, `/hang/${vendor}`);
  }
  const email = String(f.email || '').trim().toLowerCase();
  const a = accs[email];
  const devKey = cookies(req)[`hang_dev`] || randomBytes(8).toString('hex');
  const devCookie = `hang_dev=${devKey}; Path=/; HttpOnly`;
  if (f.step !== 'code' && vendor === 'claude') {
    // Claude: không mật khẩu — lần nào cũng gửi mã 6 số về email tài khoản (hộp thư của Tiệm).
    if (!a) { log(email, false, 'email không có'); return send(res, 200, vendorPage(vendor, req, 'Không tìm thấy tài khoản.', 'login', email)); }
    const code = String(randomInt(100000, 1000000)); a.pending[devKey] = code; save();
    await sendVendorMail(email, vendor, code);
    return send(res, 200, vendorPage(vendor, req, '', 'code', email), undefined, { 'Set-Cookie': devCookie });
  }
  if (f.step !== 'code') {
    if (!a || a.password !== f.password) { log(email, false, 'sai mật khẩu'); return send(res, 200, vendorPage(vendor, req, 'Sai email hoặc mật khẩu.', 'login', email)); }
    if (vendor === 'chatgpt') { a.pending[devKey] = 'pw-ok'; save(); return send(res, 200, vendorPage(vendor, req, '', 'code', email), undefined, { 'Set-Cookie': devCookie }); }
    if (vendor === 'adobe' && !a.knownDevices?.includes(devKey)) {
      const code = String(randomInt(100000, 1000000)); a.pending[devKey] = code; save();
      await sendVendorMail(email, vendor, code);
      return send(res, 200, vendorPage(vendor, req, '', 'code', email), undefined, { 'Set-Cookie': devCookie });
    }
  } else {
    if (!a || !a.pending[devKey]) return send(res, 200, vendorPage(vendor, req, 'Hết phiên, đăng nhập lại.'));
    const ok = vendor === 'chatgpt'
      ? [0, -30e3].some((d) => totpNow(a.secret, Date.now() + d).code === String(f.code).trim())
      : a.pending[devKey] === String(f.code).trim();
    if (!ok) { log(email, false, 'sai mã'); return send(res, 200, vendorPage(vendor, req, 'Mã không đúng.', 'code', email)); }
    delete a.pending[devKey];
    if (vendor === 'adobe') (a.knownDevices ||= []).push(devKey);
  }
  const sid = randomBytes(9).toString('hex');
  a.sessions[sid] = { host, since: Date.now() };
  const h = holds(host, email);
  log(email, true, h ? `giữ slot #${h.id}${h.seat ? ` · Slot ${h.seat}` : ''}` : 'KHÔNG giữ slot');
  if (!h) violation(`${VENDOR_NAME[vendor]}: ${DEVICES[host]?.label || host} đăng nhập ${email} mà không giữ slot còn hạn`);
  save();
  return redirect(res, `/hang/${vendor}`, { 'Set-Cookie': [`hang_${vendor}=${sid}; Path=/; HttpOnly`, devCookie] });
}

// ---------- Canva giả: nhóm Pro + bot giả gọi đúng API /worker như scripts/canva-bot.js ----------
function canvaPage(req, msg = '') {
  const email = String(new URL(req.url, PUBLIC).searchParams.get('email') || '').trim().toLowerCase();
  const m = email && S.canva.members[email];
  const body = !email
    ? `<form><label>Email tài khoản Canva của bạn</label><input name="email" type="email" required><button>Xem nhóm của tôi</button></form>`
    : !m ? `<p>Chưa có lời mời nào cho <b>${esc(email)}</b>.</p><p class="muted">Tiệm mời xong thì lời mời hiện ở đây.</p>`
      : m.status === 'invited' ? `<p>Bạn được mời vào nhóm <b>Canva Pro của Tiệm</b>.</p><form method="post"><input type="hidden" name="email" value="${esc(email)}"><button>Chấp nhận lời mời</button></form>`
        : `<p class="ok">✔ <b>${esc(email)}</b> đang ở nhóm Canva Pro của Tiệm.</p>`;
  return page('Canva (giả)', `<div class="hang"><h1>Canva <span class="tag">HÃNG GIẢ · diễn tập</span></h1>${msg ? `<p class="bad">${esc(msg)}</p>` : ''}${body}</div>`);
}

/** Gọi API TBQ qua Caddy giả như bot trên máy Mac của chủ (IP không phải máy khách). */
function workerApi(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body || {});
    const r = http.request({ host: '127.0.0.1', port: PORT, method: 'POST', path: `${BP}${path}`, headers: {
      Host: `localhost:${PORT}`, 'Content-Type': 'application/json', Authorization: `Bearer ${S.env.WORKER_TOKEN}`, 'Content-Length': Buffer.byteLength(data),
    } }, (res) => { const c = []; res.on('data', (x) => c.push(x)); res.on('end', () => { try { resolve(JSON.parse(Buffer.concat(c).toString('utf8'))); } catch (err) { reject(err); } }); });
    r.on('error', reject);
    r.end(data);
  });
}

/** Bot giả làm hết việc đang chờ (mời / gỡ). → [{id, kind, email, ok}] */
let botBusy = null;
function botCycle() {
  if (botBusy) return botBusy;
  botBusy = (async () => {
    const done = [];
    await workerApi('/worker/heartbeat', { worker: 'bot-gia' });
    for (let i = 0; i < 50; i++) {
      const { task } = await workerApi('/worker/tasks/next', { worker: 'bot-gia', account: S.canva.owner });
      if (!task) break;
      const email = String(task.email || '').toLowerCase();
      let ok = true;
      if (task.kind === 'invite_member') {
        if (Object.keys(S.canva.members).length >= S.canva.seats && !S.canva.members[email]) ok = false;
        else S.canva.members[email] ||= { status: 'invited', at: Date.now() };
      } else if (task.kind === 'remove_member') delete S.canva.members[email];
      await workerApi(`/worker/tasks/${task.id}/${ok ? 'done' : 'fail'}`, ok ? { worker: 'bot-gia' } : { worker: 'bot-gia', error: 'Nhóm Canva hết ghế (giả)' });
      S.canva.botLog.unshift({ at: Date.now(), kind: task.kind, email, ok }); S.canva.botLog.length = Math.min(S.canva.botLog.length, 50);
      done.push({ id: task.id, kind: task.kind, email, ok });
    }
    checkCanva();
    save();
    return done;
  })().finally(() => { botBusy = null; });
  return botBusy;
}

/** Ai còn trong nhóm Canva mà không giữ slot còn hạn (và không có việc gỡ đang chờ) → vi phạm. */
function checkCanva() {
  for (const email of Object.keys(S.canva.members)) {
    const live = q("SELECT 1 FROM slots WHERE invite_email = ? AND status IN ('active', 'pending_invite')", email).length;
    const pendingRemove = q("SELECT 1 FROM rotation_tasks WHERE kind = 'remove_member' AND status = 'todo' AND detail = ?", email).length;
    if (!live && !pendingRemove && !S.canva.members[email].flagged) {
      S.canva.members[email].flagged = true;
      violation(`Canva: ${email} còn trong nhóm mà không giữ slot`);
    }
  }
}
setInterval(() => { if (S.canva.botAuto) botCycle().catch((err) => console.error(`Bot Canva giả: ${err.message}`)); }, 3000).unref();

// ---------- Bảng điều khiển ----------
function dashboard() {
  let cafes = []; let cards = []; let slots = []; let tasks = []; let dbErr = '';
  try {
    cafes = q('SELECT id, name, qs_slug, status FROM cafes ORDER BY id');
    cards = q("SELECT k.token, k.label, k.status, c.name AS cafe FROM cards k JOIN cafes c ON c.id = k.cafe_id WHERE k.kind = 'nfc' ORDER BY k.id");
    slots = q(`SELECT s.id, s.status, s.device_id, s.seat, s.expires_at, a.login_email, t.name AS tool, cu.phone FROM slots s JOIN tools t ON t.id = s.tool_id
               LEFT JOIN accounts a ON a.id = s.account_id JOIN customers cu ON cu.id = s.customer_id ORDER BY s.id DESC LIMIT 30`);
    tasks = q(`SELECT r.id, r.kind, r.status, a.login_email FROM rotation_tasks r JOIN accounts a ON a.id = r.account_id WHERE r.status = 'todo'`);
  } catch (err) { dbErr = err.message; }
  const didHost = Object.fromEntries(Object.entries(S.hostDid).map(([h, d]) => [d, h]));
  const devRows = Object.entries(DEVICES).filter(([k]) => k !== 'chu').map(([k, d]) => `<tr><td><b>${k}</b><br><span class="muted">${esc(d.label)} · IP ${d.ip}</span></td><td>
${cafes.filter((c) => c.qs_slug).map((c) => `<a class="btn" target="_blank" href="/dien-tap/ve?may=${k}&quan=${encodeURIComponent(c.qs_slug)}">Chạm thẻ QS · ${esc(c.name)}</a>`).join('')}
${cards.filter((c) => c.status === 'active').map((c) => `<a class="btn" target="_blank" href="/dien-tap/cham?may=${k}&the=${c.token}">Chạm thẻ NFC · ${esc(c.cafe)} · ${esc(c.label)}</a>`).join('')}
${cards.filter((c) => c.status === 'active').slice(0, 1).map((c) => `<a class="btn" target="_blank" href="/dien-tap/cham?may=${k}&the=${c.token}&tron=1">Mở link thẻ KHÔNG bộ đếm</a>`).join('')}
<br><a class="btn" target="_blank" href="${devUrl(k, `${BP}/me`)}">Trang của tôi</a>
${['chatgpt', 'claude', 'adobe', 'capcut', 'gemini', 'canva'].map((v) => `<a class="btn" target="_blank" href="${devUrl(k, `/hang/${v}`)}">${VENDOR_NAME[v]} giả</a>`).join('')}
</td></tr>`).join('');
  const vendorRows = ['chatgpt', 'claude', 'adobe', 'capcut'].flatMap((v) => Object.entries(S.vendors[v]).map(([email, a]) => {
    const live = Object.values(a.sessions).map((s) => `${s.host}${holds(s.host, email) ? '' : ' <span class="bad">(hết slot)</span>'}`).join(', ');
    return `<tr><td>${VENDOR_NAME[v]}</td><td><code>${esc(email)}</code></td><td><code>${esc(a.password)}</code></td>
<td>${a.password ? '' : '<span class="muted">mã qua email</span>'}${a.secret ? `<code>${totpNow(a.secret, Date.now()).code}</code>` : ''}${a.proUntil ? (now() < a.proUntil ? 'Pro còn' : '<span class="bad">hết Pro</span>') : ''}</td>
<td>${live || '<span class="muted">—</span>'}</td><td><form method="post" action="/dien-tap/xoay"><input type="hidden" name="v" value="${v}"><input type="hidden" name="email" value="${esc(email)}">${a.password ? '<button>Đổi MK + đăng xuất mọi thiết bị</button>' : '<button name="keep" value="1">Đăng xuất mọi thiết bị</button>'}${a.secret ? '<button name="keep" value="1">Chỉ đăng xuất (giữ MK)</button>' : ''}</form>
${a.password ? `<form method="post" action="/dien-tap/hack"><input type="hidden" name="v" value="${v}"><input type="hidden" name="email" value="${esc(email)}"><button title="Người ngoài đổi mật khẩu, hãng gửi thư báo">Giả: bị đổi MK</button></form>` : ''}</td></tr>`;
  })).join('');
  const batch = (S.batches || []).map((b) => `<div class="box"><b>${VENDOR_NAME[b.kind]}</b> <span class="muted">${t(b.at)} · ${b.lines.length} dòng → Quản trị › Kho tài khoản › chọn ${VENDOR_NAME[b.kind]} › dán</span>
<textarea rows="${Math.min(b.lines.length, 6)}" readonly onclick="this.select()">${esc(b.lines.join('\n'))}</textarea></div>`).join('');
  return page('Diễn tập vận hành TBQ', `<h1>Diễn tập vận hành — kho giả, vận hành thật</h1>
<p class="muted">TBQ production (BASE_URL ${esc(S.env.BASE_URL)}) sau Caddy giả. Đã tua giờ: <b>${(S.warpMs / 3600e3).toFixed(1)} giờ</b>. Tự làm mới mỗi 10 giây.</p>
${S.violations.length ? `<div class="box bad">Vi phạm (${S.violations.length}):<br>${S.violations.slice(0, 20).map((v) => `${t(v.at)} · ${esc(v.msg)}`).join('<br>')}</div>` : '<div class="box ok">Chưa có vi phạm nào.</div>'}
${dbErr ? `<p class="bad">DB: ${esc(dbErr)}</p>` : ''}
<h2>Chủ tiệm</h2><div class="box">Quản trị: <a target="_blank" href="${devUrl('chu', `${BP}/admin`)}">${devUrl('chu', `${BP}/admin`)}</a> · mật khẩu <code>${esc(S.env.ADMIN_PASSWORD)}</code>
· <a target="_blank" href="${devUrl('chu', `${BP}/admin/live`)}">Theo dõi</a>${tasks.length ? ` · <b class="bad">${tasks.length} việc tay đang chờ</b>` : ''}</div>
<h2>Máy khách</h2><table>${devRows}</table>
${cafes.length ? '' : '<p class="muted">Chưa có quán. Chủ tiệm vào Quản trị › Quán để tạo (có mã quán QS → nút "Chạm thẻ QS"; tạo thẻ NFC → nút "Chạm thẻ NFC").</p>'}
<h2>Điện thoại — tin SMS OTP (eSMS giả)</h2><div class="box">eSMS: <b class="${S.esmsDown ? 'bad' : 'ok'}">${S.esmsDown === 'error' ? 'báo lỗi (hết tiền)' : S.esmsDown === 'timeout' ? 'không trả lời' : 'chạy bình thường'}</b>
· <a href="/dien-tap/esms?trang-thai=ok">bình thường</a> · <a href="/dien-tap/esms?trang-thai=error">giả lỗi</a> · <a href="/dien-tap/esms?trang-thai=timeout">giả treo</a></div><div class="box">${S.sms.slice(0, 12).map((s) => `${t(s.at)} · <b>${esc(s.phone)}</b> · ${esc(s.text)}`).join('<br>') || '<span class="muted">Chưa có tin.</span>'}</div>
<h2>Đồng hồ</h2><form method="post" action="/dien-tap/tua" class="box">Tua: ${[1, 6, 12, 24, 72, 168].map((h) => `<button name="h" value="${h}">+${h} giờ</button>`).join('')}
<span class="muted">Lùi mọi mốc thời gian trong database rồi chạy việc định kỳ ngay (slot hết hạn, mở khoá, việc tay đổi mật khẩu…).</span></form>
<h2>Slot gần đây</h2><table><tr><th>#</th><th>Công cụ</th><th>Tài khoản</th><th>Khách</th><th>Máy</th><th>Trạng thái</th><th>Hết hạn</th></tr>
${slots.map((s) => `<tr><td>${s.id}</td><td>${esc(s.tool)}${s.seat ? ` · Slot ${s.seat}` : ''}</td><td><code>${esc(s.login_email || '')}</code></td><td>${esc(s.phone)}</td><td>${esc(didHost[s.device_id] || s.device_id.slice(0, 6))}</td><td>${esc(s.status)}</td><td>${s.expires_at ? t(s.expires_at + S.warpMs) : ''}</td></tr>`).join('')}</table>
<h2>Hãng giả — tài khoản (chủ tiệm xem / đổi mật khẩu)</h2><table><tr><th>Hãng</th><th>Email</th><th>Mật khẩu hiện tại</th><th>2FA / Pro</th><th>Đang đăng nhập</th><th></th></tr>${vendorRows}</table>
<div class="box"><b>Canva — nhóm Pro giả</b> (chủ nhóm <code>${esc(S.canva.owner)}</code>, ${S.canva.seats} ghế) ·
bot giả: <b class="${S.canva.botAuto ? 'ok' : 'bad'}">${S.canva.botAuto ? 'đang chạy (3 giây/lượt)' : 'tắt — như máy Mac của chủ đang tắt'}</b>
<form method="post" action="/dien-tap/bot" style="display:inline"><button name="tu-dong" value="${S.canva.botAuto ? '0' : '1'}">${S.canva.botAuto ? 'Tắt bot' : 'Bật bot'}</button><button name="lam" value="1">Bot làm 1 lượt</button></form><br>
Thành viên: ${Object.entries(S.canva.members).map(([e, m]) => `<code>${esc(e)}</code> ${m.status === 'invited' ? 'đã mời' : 'đã vào'}`).join(' · ') || '<span class="muted">chưa có</span>'}<br>
<span class="muted">${S.canva.botLog.slice(0, 6).map((l) => `${t(l.at)} ${l.kind === 'invite_member' ? 'mời' : 'gỡ'} ${esc(l.email)} ${l.ok ? '✔' : '✘'}`).join(' · ')}</span></div>
<div class="box">Gemini: ${Object.entries(S.gemini).map(([l, g]) => `<code>${esc(l.slice(-10))}</code> ${g.usedBy ? `→ ${esc(g.usedBy)}` : 'chưa dùng'}`).join(' · ')}</div>
<h2>Đăng nhập hãng gần đây</h2><div class="box">${S.logins.slice(0, 15).map((l) => `${t(l.at)} · ${VENDOR_NAME[l.vendor]} · ${esc(l.host)} · <code>${esc(l.email)}</code> · <span class="${l.ok ? 'ok' : 'bad'}">${l.ok ? 'vào được' : 'không vào'}</span> · ${esc(l.note)}`).join('<br>') || '<span class="muted">—</span>'}</div>
<h2>Thư mã hãng gửi (qua Cloudflare Worker giả)</h2><div class="box">${S.mails.slice(0, 10).map((m) => `${t(m.at)} · ${esc(m.to)} · mã ${esc(m.code)} · ${esc(m.result)}`).join('<br>') || '<span class="muted">—</span>'}</div>
<h2>Kho giả — dán vào Quản trị › Kho tài khoản</h2>
<form method="post" action="/dien-tap/nap" class="box">Sinh thêm: <button name="k" value="capcut:10">+10 CapCut</button><button name="k" value="gemini:5">+5 link Gemini</button><button name="k" value="chatgpt:1">+1 ChatGPT</button><button name="k" value="claude:1">+1 Claude</button><button name="k" value="adobe:1">+1 Adobe</button></form>
${batch}
<script>setTimeout(()=>{if(!document.querySelector('textarea:focus'))location.reload()},10000)</script>`);
}

// ---------- Máy chủ phía trước: Caddy giả + bảng điều khiển + hãng giả ----------
const front = http.createServer(async (req, res) => {
  const url = new URL(req.url, PUBLIC);
  const p = url.pathname;
  try {
    if (p === '/dien-tap/esms' && req.method === 'POST') { // eSMS giả: TBQ gửi OTP tới đây
      const b = JSON.parse(String(await readBody(req)) || '{}');
      const okKey = b.ApiKey === S.env.ESMS_API_KEY && b.SecretKey === S.env.ESMS_SECRET_KEY && b.Brandname === S.env.ESMS_BRANDNAME;
      if (!okKey) violation('eSMS nhận khoá sai');
      if (S.esmsDown === 'error') return send(res, 200, JSON.stringify({ CodeResult: '99', ErrorMessage: 'Tài khoản eSMS hết tiền (giả)' }), 'application/json');
      if (S.esmsDown === 'timeout') return; // không trả lời → TBQ chờ tới hết thời gian
      S.sms.unshift({ phone: b.Phone, text: b.Content, at: Date.now() }); save();
      return send(res, 200, JSON.stringify({ CodeResult: '100', SMSID: randomBytes(6).toString('hex') }), 'application/json');
    }
    if (p === '/dien-tap' || p === '/dien-tap/') return send(res, 200, dashboard());
    if (p === '/dien-tap/ve') { // vé QS: như khách chạm thẻ / quét QR trên trang quán QS rồi bấm nút
      const slug = url.searchParams.get('quan'); const dev = url.searchParams.get('may');
      return redirect(res, devUrl(dev, `${BP}/qs/${encodeURIComponent(slug)}?t=${makeTicket(S.env.QS_TICKET_KEY, slug, Date.now(), rand32(16))}`));
    }
    if (p === '/dien-tap/cham') { // chạm thẻ NFC riêng: chip NTAG213 bật UID + bộ đếm
      const tok = url.searchParams.get('the'); const dev = url.searchParams.get('may');
      const chip = (S.chips[tok] ||= { uid: `04${randomBytes(6).toString('hex').toUpperCase()}`, ctr: randomInt(1, 50) });
      chip.ctr++; save();
      const m = url.searchParams.get('tron') ? '' : `?m=${chip.uid}x${chip.ctr.toString(16).toUpperCase().padStart(6, '0')}`;
      return redirect(res, devUrl(dev, `${BP}/c/${tok}${m}`));
    }
    if (p === '/dien-tap/tua' && req.method === 'POST') {
      const h = Number(new URLSearchParams(String(await readBody(req))).get('h')) || 1;
      await warp(h * 3600e3);
      return redirect(res, '/dien-tap');
    }
    if (p === '/dien-tap/nap' && req.method === 'POST') {
      const [k, n] = String(new URLSearchParams(String(await readBody(req))).get('k')).split(':');
      addStock(k, Number(n));
      return redirect(res, '/dien-tap');
    }
    if (p === '/dien-tap/api') return send(res, 200, JSON.stringify({ ...S, env: undefined, adminPassword: S.env.ADMIN_PASSWORD, qsTicketKey: S.env.QS_TICKET_KEY, workerToken: S.env.WORKER_TOKEN, port: PORT }), 'application/json');
    if (p === '/dien-tap/esms' && req.method === 'GET') { // ?trang-thai=ok|error|timeout
      S.esmsDown = ['error', 'timeout'].includes(url.searchParams.get('trang-thai')) ? url.searchParams.get('trang-thai') : null; save();
      return redirect(res, '/dien-tap');
    }
    if (p === '/dien-tap/hack' && req.method === 'POST') { // có người ngoài đổi mật khẩu tài khoản kho → hãng gửi thư báo về TBQ
      const f = Object.fromEntries(new URLSearchParams(String(await readBody(req))));
      const a = S.vendors[f.v]?.[f.email];
      if (a?.password) { // Claude không có mật khẩu để đổi
        a.password = newPw(); a.sessions = {}; a.pending = {}; a.knownDevices = []; a.hacked = true; save();
        await sendVendorMail(f.email, f.v, null, { subject: `Your ${VENDOR_NAME[f.v]} password was changed`, text: 'The password for your account was just changed. If this was not you, reset it now.' });
      }
      return redirect(res, '/dien-tap');
    }
    if (p === '/dien-tap/bot' && req.method === 'POST') { // tu-dong=1|0: bật / tắt bot giả; lam=1: bot làm hết việc đang chờ ngay
      const f = Object.fromEntries(new URLSearchParams(String(await readBody(req))));
      if (f['tu-dong'] !== undefined) { S.canva.botAuto = f['tu-dong'] === '1'; save(); }
      if (f.lam) {
        const done = await botCycle();
        if (/json/.test(String(req.headers.accept || ''))) return send(res, 200, JSON.stringify({ ok: true, done }), 'application/json');
      }
      return redirect(res, '/dien-tap');
    }
    if (p === '/hang/canva') {
      if (req.method === 'POST') {
        const email = String(new URLSearchParams(String(await readBody(req))).get('email') || '').trim().toLowerCase();
        const m = S.canva.members[email];
        if (m) { m.status = 'member'; save(); }
        return redirect(res, `/hang/canva?email=${encodeURIComponent(email)}`);
      }
      return send(res, 200, canvaPage(req));
    }
    if (p === '/dien-tap/xoay' && req.method === 'POST') { // chủ đổi mật khẩu + đăng xuất mọi thiết bị trên trang hãng
      const f = Object.fromEntries(new URLSearchParams(String(await readBody(req))));
      const a = S.vendors[f.v]?.[f.email];
      if (a) { if (!f.keep) a.password = newPw(); a.sessions = {}; a.pending = {}; a.knownDevices = []; save(); }
      return redirect(res, '/dien-tap');
    }
    const vm = /^\/hang\/(chatgpt|claude|adobe|capcut|gemini)\/?$/.exec(p);
    if (vm) return req.method === 'POST' ? vendorPost(vm[1], req, res, url) : send(res, 200, vendorPage(vm[1], req));
    if (p.startsWith('/dien-tap') || p.startsWith('/hang')) return send(res, 404, 'Không có trang này.', 'text/plain; charset=utf-8');
    return proxy(req, res);
  } catch (err) {
    console.error(err);
    send(res, 500, `Lỗi bộ diễn tập: ${esc(err.message)}`);
  }
});

/** Caddy giả: chuyển tiếp nguyên vẹn, GHI ĐÈ X-Real-IP theo máy; soát mọi trang TBQ gửi cho khách xem có lộ bí mật không. */
function proxy(req, res) {
  const dev = devOf(req);
  const headers = { ...req.headers };
  delete headers['x-forwarded-for']; delete headers['cf-connecting-ip'];
  headers['x-real-ip'] = dev ? DEVICES[dev].ip : '104.30.0.1'; // không phải máy nào (vd. Cloudflare Worker gửi thư)
  delete headers['accept-encoding'];
  const did = cookies(req).did;
  if (dev && dev !== 'chu' && did && S.hostDid[dev] !== did) { S.hostDid[dev] = did; save(); }
  const up = http.request({ host: '127.0.0.1', port: APP_PORT, method: req.method, path: req.url, headers }, (r) => {
    const type = String(r.headers['content-type'] || '');
    const setDid = [].concat(r.headers['set-cookie'] || []).map((c) => /^did=([^;]+)/.exec(c)?.[1]).find(Boolean);
    if (dev && dev !== 'chu' && setDid && S.hostDid[dev] !== setDid) { S.hostDid[dev] = setDid; save(); }
    if (!dev || dev === 'chu' || !/html|json/.test(type)) { res.writeHead(r.statusCode, r.headers); r.pipe(res); return; }
    const chunks = [];
    r.on('data', (c) => chunks.push(c));
    r.on('end', () => {
      const body = Buffer.concat(chunks);
      const text = body.toString('utf8');
      for (const s of allSecrets()) if (s && text.includes(s)) violation(`Khoá 2FA lộ ra cho ${dev} ở ${req.url}`);
      const myDid = setDid || did;
      for (const { email, password } of allPasswords()) {
        if (!text.includes(password)) continue;
        const ok = myDid && q("SELECT 1 FROM slots s JOIN accounts a ON a.id = s.account_id WHERE a.login_email = ? AND s.device_id = ? AND s.status = 'active'", email, myDid).length;
        if (!ok) violation(`Mật khẩu ${email} hiện cho ${dev} (không giữ slot) ở ${req.url}`);
      }
      if (r.statusCode >= 500) violation(`TBQ lỗi ${r.statusCode} ở ${req.method} ${req.url}`);
      res.writeHead(r.statusCode, r.headers);
      res.end(body);
    });
  });
  up.on('error', () => send(res, 502, 'TBQ chưa chạy (502)', 'text/plain; charset=utf-8'));
  req.pipe(up);
}

front.listen(PORT, '127.0.0.1', () => {
  console.log(`
Diễn tập vận hành TBQ ${fresh ? '(mới dựng)' : '(dữ liệu cũ — thêm --reset để làm lại)'} · dữ liệu: ${DIR}
  Bảng điều khiển   ${PUBLIC}/dien-tap
  Quản trị (chủ)    ${devUrl('chu', `${BP}/admin`)}   mật khẩu: ${S.env.ADMIN_PASSWORD}
  Máy khách         may1 … may4 .localhost:${PORT} (mỗi máy cookie riêng)
`);
});
