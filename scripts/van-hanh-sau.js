// Kịch bản vận hành sâu, tự động, chạy trên ĐÚNG bộ diễn tập (scripts/van-hanh.js): TBQ production sau Caddy giả, eSMS giả,
// thư qua code Cloudflare Worker, hãng giả kiểm đăng nhập thật, tua giờ bằng database. Không đụng dữ liệu diễn tập của bạn
// (chạy bản riêng ở cổng 3940, thư mục tạm).
//   npm run van-hanh-sau
// Mỗi "máy" là 1 địa chỉ riêng (wifi3.localhost, g4_7…) có cookie riêng, gửi Origin / User-Agent như điện thoại thật.
// Kết quả: docs/bao-cao-van-hanh-sau.md. Thoát mã 1 nếu có bước không đạt hoặc bộ diễn tập ghi vi phạm.
import http from 'node:http';
import { connect } from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = 3940;
const DIR = mkdtempSync(join(tmpdir(), 'tbq-van-hanh-sau-'));
const BP = '/colap';
const MOBILE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1';
const LAPTOP = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130.0 Safari/537.36';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Ghi kết quả ----------
const results = [];
const notes = [];
let section = '';
const part = (name) => { section = name; console.log(`\n▶ ${name}`); };
function check(name, ok, detail = '') {
  results.push({ section, name, ok: !!ok, detail: ok ? '' : String(typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 300) });
  console.log(`  ${ok ? '✔' : '✘'} ${name}${!ok && detail ? `  → ${String(typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 300)}` : ''}`);
  return !!ok;
}
const note = (s) => { notes.push(`${section}: ${s}`); console.log(`  ⚑ ${s}`); };

if (new Date(Date.now() + 7 * 3600e3).getUTCHours() === 5) {
  console.error('Đang 5h–6h sáng giờ VN: ChatGPT / Claude nhận lúc này hết lúc 6h, các lần tua đầu kịch bản sẽ làm hết slot sớm. Chạy lại sau 6h.');
  process.exit(1);
}
// ---------- Bộ diễn tập (bản riêng) ----------
// Cổng còn bị bản chạy dở lần trước giữ → kết quả sai (đăng nhập vào máy chủ cũ). Dừng sớm, nói rõ.
const busy = async (port) => new Promise((r) => { const c = connect(port, '127.0.0.1'); c.once('connect', () => { c.destroy(); r(true); }); c.once('error', () => r(false)); });
for (const port of [PORT, PORT + 1]) {
  if (await busy(port)) {
    console.error(`Cổng ${port} đang bận (còn bản diễn tập chạy dở?). Tìm: lsof -nP -iTCP:${port} -sTCP:LISTEN — tắt tiến trình đó rồi chạy lại.`);
    process.exit(1);
  }
}
const harness = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'scripts/van-hanh.js', '--reset', '--dir', DIR, '--port', String(PORT)],
  { cwd: ROOT, env: { PATH: process.env.PATH }, stdio: ['ignore', 'pipe', 'pipe'] });
let harnessLog = '';
harness.stdout.on('data', (b) => { harnessLog += b; });
harness.stderr.on('data', (b) => { harnessLog += b; });
const cleanup = () => { try { harness.kill('SIGTERM'); } catch { /* đã dừng */ } };
process.on('exit', () => { cleanup(); try { rmSync(DIR, { recursive: true, force: true }); } catch { /* thư mục tạm, hệ điều hành tự dọn */ } });
/** Tắt bộ diễn tập và chờ nó thoát hẳn (còn ghi tệp trạng thái) rồi mới xoá thư mục tạm. */
const stopHarness = () => new Promise((r) => {
  if (harness.exitCode !== null) return r();
  const t = setTimeout(r, 5000);
  harness.once('exit', () => { clearTimeout(t); r(); });
  cleanup();
});

// ---------- HTTP như trình duyệt ----------
function rawReq({ host, method = 'GET', path, headers = {}, body }) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port: PORT, method, path, headers: { Host: host, ...headers } }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text: Buffer.concat(chunks).toString('utf8') }));
    });
    r.on('error', reject);
    r.setTimeout(20000, () => r.destroy(new Error('timeout')));
    if (body) r.write(body);
    r.end();
  });
}

class Device {
  constructor(name, ua = MOBILE) { this.name = name; this.host = `${name}.localhost:${PORT}`; this.ua = ua; this.jar = {}; this.hint = null; this.phone = null; }
  async req(method, path, { json, form } = {}) {
    const headers = { 'User-Agent': this.ua, Accept: 'text/html,application/json' };
    const cookie = Object.entries(this.jar).map(([k, v]) => `${k}=${v}`).join('; ');
    if (cookie) headers.Cookie = cookie;
    if (this.hint) headers['x-device-hint'] = this.hint;
    let body;
    if (method === 'POST') { headers.Origin = `http://${this.host}`; headers['Sec-Fetch-Site'] = 'same-origin'; }
    if (json !== undefined) { body = JSON.stringify(json); headers['Content-Type'] = 'application/json'; }
    if (form !== undefined) { body = new URLSearchParams(form).toString(); headers['Content-Type'] = 'application/x-www-form-urlencoded'; }
    if (this.csrf && path.startsWith(`${BP}/admin/api/`)) headers['x-csrf'] = this.csrf;
    const res = await rawReq({ host: this.host, method, path, headers, body });
    for (const c of [].concat(res.headers['set-cookie'] || [])) {
      const [kv, ...attrs] = c.split(';'); const i = kv.indexOf('=');
      const k = kv.slice(0, i).trim(); const v = kv.slice(i + 1).trim();
      if (/max-age=0/i.test(attrs.join(';')) || v === '') delete this.jar[k]; else this.jar[k] = v;
    }
    if (res.headers['x-device-id']) this.hint = res.headers['x-device-id'];
    let data = null; try { data = JSON.parse(res.text); } catch { /* HTML */ }
    if (res.status >= 500) check(`${this.name} ${method} ${path} không lỗi máy chủ`, false, `${res.status} ${res.text.slice(0, 200)}`);
    return { ...res, data, location: res.headers.location };
  }
  get(p) { return this.req('GET', p); }
  post(p, json) { return this.req('POST', p, { json }); }
  postForm(p, form) { return this.req('POST', p, { form }); }
  /** Theo chuyển trang (kể cả từ bảng điều khiển sang đúng máy). */
  async follow(r, max = 5) {
    while (r.location && max-- > 0) {
      const u = new URL(r.location, `http://${this.host}`);
      r = await this.get(u.pathname + u.search);
    }
    return r;
  }
}

const panel = new Device('localhost'); panel.host = `localhost:${PORT}`;
const state = async () => (await panel.get('/dien-tap/api')).data;
const warp = async (h) => { await panel.postForm('/dien-tap/tua', { h: String(h) }); };
const vendorAction = (path, form) => panel.postForm(path, form);
const VNOFF = 7 * 3600e3;

// ---------- Khách ----------
let phoneSeq = 0;
const newPhone = () => `09${String(31000000 + ++phoneSeq * 7919).slice(-8)}`;
async function smsCode(phone) {
  const want = `84${phone.slice(1)}`;
  for (let i = 0; i < 20; i++) {
    const s = await state();
    const m = s.sms.find((x) => x.phone === want);
    if (m) return /\d{6}/.exec(m.text)[0];
    await sleep(100);
  }
  return null;
}
/** Vào quán: quán QS → "chạm thẻ" trang quán (vé mới); quán thẻ NFC → chạm 1 thẻ (bộ đếm tăng). */
async function enter(dev, cafe, card) {
  const r = cafe.qs
    ? await panel.get(`/dien-tap/ve?may=${dev.name}&quan=${cafe.qs}`)
    : await panel.get(`/dien-tap/cham?may=${dev.name}&the=${card || cafe.cards[0]}`);
  return dev.follow(r);
}
async function login(dev, phone = newPhone()) {
  dev.phone = phone;
  const s = await dev.post(`${BP}/api/otp/send`, { phone });
  if (!s.data?.ok) return { ok: false, step: 'send', ...s.data };
  const code = await smsCode(phone);
  const v = await dev.post(`${BP}/api/otp/verify`, { phone, code, consent: true });
  return { ok: !!v.data?.ok, ...v.data };
}
// Đọc cả thẻ <input> (không phụ thuộc thứ tự thuộc tính — phiên 19 thêm data-login cho Canva và bộ đọc cũ không còn thấy "disabled").
const toolIds = (html) => Object.fromEntries([...html.matchAll(/<input type="radio" name="toolId"[^>]*>/g)].map(([tag]) => [
  /data-name="([^"]+)"/.exec(tag)?.[1], { id: Number(/value="(\d+)"/.exec(tag)?.[1]), disabled: /\sdisabled(?=[\s>])/.test(tag) }]));
async function claim(dev, cafe, toolName, { card, inviteEmail } = {}) {
  const page = await enter(dev, cafe, card);
  const t = toolIds(page.text)[toolName];
  if (!t) return { ok: false, code: 'no_tool_on_page', page: page.text.slice(0, 300) };
  const r = await dev.post(`${BP}/api/claim`, { toolId: t.id, ...(inviteEmail !== undefined ? { inviteEmail } : {}) });
  return { ...(r.data || {}), disabledOnPage: t.disabled };
}
async function me(dev) {
  const r = await dev.get(`${BP}/me`);
  const codes = [...r.text.matchAll(/<span class="copy-row"><code>([^<]*)<\/code>/g)].map((m) => m[1]);
  return { html: r.text, email: codes[0] || null, password: codes[1] || null, seat: Number(/Workspace của bạn: <b>Slot (\d+)<\/b>/.exec(r.text)?.[1]) || null,
    link: /class="btn" href="(https:\/\/one\.google\.com[^"]+)"/.exec(r.text)?.[1] || null };
}
// Mã phiếu (phiên 24): chủ tạo 1 lô ở trang Mã phiếu; khách lấy mã 2FA / mã email phải nhập 1 phiếu (phát ở quán).
let phieu = [];
const nextPhieu = () => {
  if (!phieu.length) phieu = q("SELECT code FROM vouchers WHERE kind = 'once' AND status = 'active' AND uses = 0 ORDER BY id").map((x) => x.code);
  return phieu.shift();
};
/** Lấy mã kèm phiếu; phiếu chỉ bị trừ khi mở được mã → mở không được thì trả phiếu lại hàng chờ. */
async function codeReq(dev, kind) {
  const v = nextPhieu();
  const r = (await dev.post(`${BP}/api/code/request`, { kind, voucher: v })).data;
  if (!(r?.status === 'totp' || r?.status === 'open') && v) phieu.unshift(v);
  return r;
}
const totp = (dev) => codeReq(dev, 'totp');
/** Slot đang chạy của 1 công cụ hết đúng 06:00 giờ VN? Kiểm ngay lúc nhận (tua giờ lùi mọi mốc nên kiểm sau khi tua sẽ lệch). */
const endsAt6 = (slug) => {
  const ends = q("SELECT DISTINCT s.expires_at AS e FROM slots s JOIN tools t ON t.id = s.tool_id WHERE t.slug = ? AND s.status = 'active'", slug).map((x) => x.e);
  return { ok: ends.length > 0 && ends.every((e) => { const d = new Date(e + VNOFF); return d.getUTCHours() === 6 && d.getUTCMinutes() === 0; }), ends: ends.map((e) => new Date(e + VNOFF).toISOString().slice(0, 16)) };
};
const totpCode = async (dev) => { const r = await totp(dev); return r?.status === 'totp' ? r.code : null; };
/** Đăng nhập hãng giả bằng thông tin Tiệm giao. getCode: hàm lấy mã (2FA / email) từ trang Tiệm. → 'ok' | lý do */
async function vendorLogin(dev, v, email, password, getCode) {
  let r = await dev.postForm(`/hang/${v}`, { email, password });
  if (r.status === 303) return 'ok';
  if (/Sai email hoặc mật khẩu/.test(r.text)) return 'sai_mat_khau';
  if (/name="step" value="code"/.test(r.text)) {
    const code = await getCode();
    if (!code) return 'khong_co_ma';
    r = await dev.postForm(`/hang/${v}`, { email, step: 'code', code });
    return r.status === 303 ? 'ok' : /Mã không đúng/.test(r.text) ? 'sai_ma' : 'loi';
  }
  return 'loi';
}
async function mailCode(dev) {
  const r = await codeReq(dev, 'mail');
  if (r?.status !== 'open') return { error: r };
  return { windowId: r.windowId, wait: async () => {
    for (let i = 0; i < 40; i++) {
      const st = (await dev.get(`${BP}/api/code/status/${r.windowId}`)).data;
      if (st?.status === 'ready') return st.code;
      await sleep(150);
    }
    return null;
  } };
}

// ---------- Chủ tiệm ----------
const owner = new Device('chu', LAPTOP);
async function ownerLogin(pw) {
  await owner.get(`${BP}/admin/login`);
  const r = await owner.postForm(`${BP}/admin/login`, { password: pw });
  const home = await owner.get(`${BP}/admin`);
  owner.csrf = /data-csrf="([^"]+)"/.exec(home.text)?.[1];
  return r;
}
const adminPost = (path, form) => owner.postForm(`${BP}${path}`, { _csrf: owner.csrf, ...form });
const msgOf = (r) => decodeURIComponent(/msg=([^&]+)/.exec(r.location || '')?.[1] || '');

// ---------- Kiểm trực tiếp database (chỉ đọc) ----------
let db;
const q = (sql, ...p) => db.prepare(sql).all(...p);
const one = (sql, ...p) => db.prepare(sql).get(...p);

async function main() {
  for (let i = 0; i < 100 && !harnessLog.includes('Bảng điều khiển'); i++) await sleep(100);
  for (let i = 0; i < 50; i++) { try { if ((await state())?.port) break; } catch { /* chưa lên */ } await sleep(100); }
  for (let i = 0; i < 100; i++) { try { if ((await rawReq({ host: panel.host, path: `${BP}/healthz` })).status === 200) break; } catch { /* chưa lên */ } await sleep(100); }
  const S0 = await state();
  db = new DatabaseSync(join(DIR, 'tbq.sqlite'), { readOnly: true });
  db.exec('PRAGMA busy_timeout = 5000');

  // ================================================================
  part('D1. Chủ tiệm dựng ngày đầu: 2 quán, thẻ NFC, nhập kho bằng trang quản trị');
  await ownerLogin(S0.adminPassword);
  check('đăng nhập quản trị (production)', !!owner.csrf);
  let r = await adminPost('/admin/cafes', { name: 'Cà phê Sáng Q1', address: 'Q1', qs_slug: 'sangq1', daily_quota: '40' });
  check('tạo quán có QS', /Đã thêm quán/.test(msgOf(r)), msgOf(r));
  r = await adminPost('/admin/cafes', { name: 'Cộng Đêm', address: 'BT', qs_slug: '', daily_quota: '8' });
  const cafeBId = /cafes\/(\d+)/.exec(r.location)?.[1];
  r = await adminPost(`/admin/cafes/${cafeBId}/cards`, { count: '4', prefix: 'Bàn', start: '1' });
  check('tạo 4 thẻ NFC cho quán chưa có QS', /Đã tạo 4 thẻ/.test(msgOf(r)), msgOf(r));
  const cafeA = { qs: 'sangq1', id: one("SELECT id FROM cafes WHERE qs_slug = 'sangq1'").id };
  const cafeB = { id: Number(cafeBId), cards: q('SELECT token FROM cards WHERE cafe_id = ? AND kind = ? ORDER BY id', Number(cafeBId), 'nfc').map((x) => x.token) };
  const toolId = Object.fromEntries(q('SELECT slug, id FROM tools').map((t) => [t.slug, t.id]));
  for (const b of S0.batches) {
    r = await adminPost('/admin/accounts', { tool_id: String(toolId[b.kind]), lines: b.lines.join('\n') });
    check(`nhập kho ${b.kind} (${b.lines.length} dòng)`, new RegExp(`Đã thêm ${b.lines.length} `).test(msgOf(r)) && !/Bỏ qua/.test(msgOf(r)), msgOf(r));
  }
  r = await adminPost('/admin/accounts', { tool_id: String(toolId.capcut), lines: S0.batches.find((b) => b.kind === 'capcut').lines.slice(0, 2).join('\n') });
  check('dán lại tài khoản đã có → báo "đã có trong kho", không tạo trùng', /đã có trong kho/.test(msgOf(r)) && /Đã thêm 0/.test(msgOf(r)), msgOf(r));
  r = await adminPost('/admin/accounts', { tool_id: String(toolId.chatgpt), lines: 'thieu-2fa@kho.test|MatKhau1' });
  const rv = await adminPost('/admin/vouchers', { kind: 'once', count: '200', note: 'Phiếu diễn tập' });
  check('ChatGPT thiếu khoá 2FA → bị bỏ qua, có lý do', /Bỏ qua/.test(msgOf(r)), msgOf(r));
  check('tạo 200 mã phiếu (trang Mã phiếu)', rv.status === 303 && one("SELECT COUNT(*) AS n FROM vouchers").n === 200, rv.status);

  // ================================================================
  part('D2. ChatGPT: 9 khách cùng quán → 8 người chung 1 tài khoản (Slot 1…8), người thứ 9 sang tài khoản khác');
  const gpt = [];
  for (let i = 1; i <= 9; i++) {
    const d = new Device(`wifi${100 + i}`);
    await enter(d, cafeA);
    const L = await login(d);
    const c = await claim(d, cafeA, 'ChatGPT Plus');
    const m = await me(d);
    gpt.push({ d, c, m });
    if (!L.ok || c.status !== 'active') check(`khách ${d.name} nhận ChatGPT`, false, { L, c });
  }
  const acc1 = gpt[0].m.email;
  check('8 khách đầu cùng 1 tài khoản', gpt.slice(0, 8).every((g) => g.m.email === acc1), gpt.map((g) => g.m.email));
  check('Slot 1…8 không trùng', new Set(gpt.slice(0, 8).map((g) => g.m.seat)).size === 8 && gpt.slice(0, 8).every((g) => g.m.seat >= 1 && g.m.seat <= 8), gpt.map((g) => g.m.seat));
  check('khách thứ 9 sang tài khoản khác, Slot 1', gpt[8].m.email !== acc1 && gpt[8].m.seat === 1, gpt[8].m);
  const e6 = endsAt6('chatgpt');
  check('cả 9 khách ChatGPT hết đúng 06:00 sáng mai (giờ VN)', e6.ok, e6.ends);
  check('trang khách ghi rõ "Dùng tới 06:00 …"', /Dùng tới <b>06:00 \d\d\/\d\d<\/b>/.test(gpt[0].m.html), /Dùng tới[^<]*<b>[^<]*/.exec(gpt[0].m.html)?.[0]);
  let okLogins = 0;
  for (const g of gpt) {
    const res = await vendorLogin(g.d, 'chatgpt', g.m.email, g.m.password, async () => totpCode(g.d));
    if (res === 'ok') okLogins++; else note(`${g.d.name} đăng nhập ChatGPT giả: ${res}`);
  }
  check('cả 9 đăng nhập được ChatGPT giả bằng mật khẩu + mã 2FA trên trang Tiệm', okLogins === 9, okLogins);

  // ================================================================
  part('D3. Quán thẻ NFC đặt 8 suất/ngày: khách thứ 9 không nhận được, câu báo rõ');
  const ccDev = [];
  for (let i = 1; i <= 9; i++) {
    const d = new Device(`g4${i}`);
    const card = cafeB.cards[(i - 1) % cafeB.cards.length];
    await enter(d, cafeB, card);
    await login(d);
    const c = await claim(d, cafeB, 'CapCut Pro', { card });
    ccDev.push({ d, c });
  }
  check('8 khách đầu nhận CapCut', ccDev.slice(0, 8).every((x) => x.c.status === 'active'), ccDev.map((x) => x.c.code || x.c.status));
  check('khách thứ 9: hết suất quán, có câu báo', ccDev[8].c.status !== 'active' && !!ccDev[8].c.message, ccDev[8].c);
  note(`câu khách thứ 9 thấy: "${ccDev[8].c.message}"`);
  const ccAccounts = new Set(); for (const x of ccDev.slice(0, 8)) ccAccounts.add((await me(x.d)).email);
  check('CapCut lấp đủ 2 người / tài khoản (8 khách → 4 tài khoản)', ccAccounts.size === 4, [...ccAccounts]);
  const cc1 = await me(ccDev[0].d);
  check('khách CapCut đăng nhập CapCut giả', (await vendorLogin(ccDev[0].d, 'capcut', cc1.email, cc1.password)) === 'ok');

  // ================================================================
  part('D4. Adobe tối đa 4 lượt/ngày: người thứ 5 thấy công cụ bị khoá trên trang');
  const ad = [];
  for (let i = 7; i <= 11; i++) {
    const d = new Device(`wifi${i}`);
    await enter(d, cafeA); await login(d);
    ad.push({ d, c: await claim(d, cafeA, 'Adobe Creative Cloud') });
  }
  check('4 khách đầu nhận Adobe', ad.slice(0, 4).every((x) => x.c.status === 'active'), ad.map((x) => x.c.code || x.c.status));
  check('khách thứ 5: Adobe bị khoá ngay trên trang chọn (không phải bấm rồi mới báo)', ad[4].c.disabledOnPage && ad[4].c.status !== 'active', ad[4].c);

  // ================================================================
  part('D5. Adobe lấy mã email: bấm Lấy mã trước / đăng nhập trước đều được; người ngoài biết mật khẩu → mã mồ côi, báo động');
  const a1 = await me(ad[0].d);
  let w = await mailCode(ad[0].d);
  let res = await vendorLogin(ad[0].d, 'adobe', a1.email, a1.password, async () => w.wait?.());
  check('khách 1: bấm "Lấy mã" trước → đăng nhập Adobe được', res === 'ok', { res, w: w.error });
  const a2 = await me(ad[1].d);
  let dbg2 = null;
  res = await vendorLogin(ad[1].d, 'adobe', a2.email, a2.password, async () => { const x = await mailCode(ad[1].d); dbg2 = x.error || 'mở lượt, chờ hết giờ'; return x.wait?.(); });
  check(`khách 2${a2.email === a1.email ? ' (cùng tài khoản với khách 1)' : ''}: đăng nhập Adobe trước (Adobe tự gửi mã) rồi mới bấm "Lấy mã" → vẫn được`, res === 'ok',
    { res, dbg2, mails: q('SELECT verdict, window_id FROM mails ORDER BY id DESC LIMIT 3') });
  const stranger = new Device('nha1');
  res = await vendorLogin(stranger, 'adobe', a1.email, a1.password, async () => null);
  check('người ngoài có mật khẩu Adobe (khách gửi cho) → kẹt ở bước mã email', res === 'khong_co_ma', res);
  await sleep(500);
  const orphanMail = one("SELECT verdict FROM mails WHERE account_id = (SELECT id FROM accounts WHERE login_email = ?) ORDER BY id DESC LIMIT 1", a1.email.toLowerCase());
  check('thư mã đó không giao cho ai (mồ côi / chờ)', ['orphan', 'orphan_wait'].includes(orphanMail?.verdict), orphanMail);

  // ================================================================
  part('D6. Gemini 5 link: khách 6 thấy hết; link đã nhận đưa cho bạn → hãng báo đã dùng');
  const gm = [];
  for (let i = 12; i <= 17; i++) {
    const d = new Device(`wifi${i}`);
    await enter(d, cafeA); await login(d);
    gm.push({ d, c: await claim(d, cafeA, 'Gemini Pro') });
  }
  check('5 khách đầu nhận link Gemini', gm.slice(0, 5).every((x) => x.c.status === 'active'), gm.map((x) => x.c.code || x.c.status));
  check('khách 6: Gemini bị khoá trên trang (hết link)', gm[5].c.disabledOnPage, gm[5].c);
  const g1 = await me(gm[0].d);
  r = await gm[0].d.postForm('/hang/gemini', { link: g1.link, gmail: 'khach-g1@gmail.com' });
  check('khách nhận Gemini bằng link của mình', /đã nhận Gemini Pro/.test(r.text));
  r = await new Device('nha2').postForm('/hang/gemini', { link: g1.link, gmail: 'ban-cua-khach@gmail.com' });
  check('bạn của khách dùng lại link → "đã được dùng"', /đã được dùng/.test(r.text));
  check('trang Gemini của khách không có đồng hồ đếm ngược', !/data-countdown/.test(g1.html));

  // ================================================================
  part('D7. Cùng số điện thoại đăng nhập máy thứ 2 (laptop): không thấy mật khẩu, không lấy được mã');
  const lap = new Device('g450', LAPTOP);
  await enter(lap, cafeA);
  const lapLogin = await login(lap, gpt[0].d.phone);
  const lapMe = await me(lap);
  check('máy 2 đăng nhập được bằng OTP', lapLogin.ok, lapLogin);
  check('máy 2 không thấy mật khẩu', !lapMe.password && !lapMe.html.includes(gpt[0].m.password));
  const lapCode = await totp(lap);
  check('máy 2 xin mã 2FA → từ chối', lapCode?.status !== 'totp', lapCode);

  // ================================================================
  part('D8. Khách báo lỗi bằng nút "Báo Tiệm" → chủ thấy trên trang Theo dõi');
  r = await gpt[2].d.post(`${BP}/api/report`, { message: 'Không vào được Project Slot của mình' });
  check('gửi báo lỗi', r.data?.ok, r.data);
  let live = (await owner.get(`${BP}/admin/api/live`)).data;
  check('trang Theo dõi có báo lỗi của khách', live?.alerts?.some((e) => e.type === 'customer_report' && /Project Slot/.test(e.summary || '')), live?.alerts?.map((e) => e.type));

  // ================================================================
  part('D9. eSMS sập (hết tiền / treo): khách thấy câu dễ hiểu, chủ được báo');
  await panel.get('/dien-tap/esms?trang-thai=error');
  const sx = new Device('wifi18'); await enter(sx, cafeA);
  let t0 = Date.now();
  let sres = (await sx.post(`${BP}/api/otp/send`, { phone: newPhone() })).data;
  check('eSMS báo lỗi → khách nhận câu báo, không treo', sres && !sres.ok && !!sres.message && Date.now() - t0 < 5000, sres);
  note(`câu khách thấy khi eSMS lỗi: "${sres?.message}"`);
  live = (await owner.get(`${BP}/admin/api/live`)).data;
  const smsAlert = live?.alerts?.find((e) => /otp|sms/i.test(e.type));
  check('chủ thấy cảnh báo gửi SMS lỗi trên Theo dõi', !!smsAlert, live?.alerts?.map((e) => e.type));
  await panel.get('/dien-tap/esms?trang-thai=timeout');
  t0 = Date.now();
  sres = (await sx.post(`${BP}/api/otp/send`, { phone: newPhone() })).data;
  const waited = Date.now() - t0;
  check('eSMS treo → khách chờ tối đa ~10 giây rồi được báo', sres && !sres.ok && waited < 12000, { sres, waited });
  note(`eSMS treo: khách chờ ${(waited / 1000).toFixed(1)} giây`);
  await panel.get('/dien-tap/esms?trang-thai=ok');
  const after = await login(sx);
  check('eSMS chạy lại → khách đăng nhập được ngay (không bị khoá vì các lần lỗi)', after.ok, after);

  // ================================================================
  part('D10. Vé hết hạn (khách ngồi lâu > 30 phút): phiếu tự động của lần chạm thẻ / phiếu giấy vẫn lấy được mã');
  await warp(0.6);
  // Phiên 24: ChatGPT cần mã phiếu — phiếu chỉ phát ở quán nên thay cho "đang ở quán" (cài đặt voucherNeedsCafe = 0).
  // Vé đã cũ (36 phút) nhưng phiếu tự động của lần chạm thẻ còn hạn 60 phút → lấy mã không phải gõ phiếu.
  const noPhieu = (await gpt[1].d.post(`${BP}/api/code/request`, { kind: 'totp' })).data;
  check('vé cũ 36 phút, phiếu tự động (chạm thẻ) còn hạn → lấy mã 2FA không phải gõ', noPhieu?.status === 'totp', noPhieu);
  const again = await totp(gpt[1].d);
  check('đang trong lượt xem → vẫn thấy mã', again?.status === 'totp', again);

  // ================================================================
  part('D11. Có người ngoài đổi mật khẩu tài khoản ChatGPT đang có 8 người → cách ly, thu hồi, khách nhận lại ngay');
  const hackedEmail = acc1;
  const holdersBefore = one("SELECT COUNT(*) AS n FROM slots s JOIN accounts a ON a.id = s.account_id WHERE a.login_email = ? AND s.status = 'active'", hackedEmail.toLowerCase()).n;
  await vendorAction('/dien-tap/hack', { v: 'chatgpt', email: hackedEmail });
  await sleep(600);
  const accRow = one('SELECT status FROM accounts WHERE login_email = ?', hackedEmail.toLowerCase());
  check('tài khoản bị cách ly', accRow?.status === 'quarantined', accRow);
  const revoked = q("SELECT s.status, s.end_reason FROM slots s JOIN accounts a ON a.id = s.account_id WHERE a.login_email = ?", hackedEmail.toLowerCase());
  check(`${holdersBefore} slot trên tài khoản đó bị thu hồi`, holdersBefore === 8 && revoked.length === holdersBefore && revoked.every((x) => x.status === 'revoked'), { holdersBefore, revoked });
  const victim = await me(gpt[0].d);
  check('khách thấy lời xin lỗi, không còn mật khẩu', !victim.password && /xin lỗi|bảo trì|Tiệm/i.test(victim.html), victim.html.slice(0, 200));
  const reClaim = await claim(gpt[0].d, cafeA, 'ChatGPT Plus');
  check('khách bị ảnh hưởng nhận lại ChatGPT ngay (tài khoản khác)', reClaim.status === 'active' && (await me(gpt[0].d)).email !== hackedEmail, reClaim);
  live = (await owner.get(`${BP}/admin/api/live`)).data;
  const qTask = live?.tasks?.find((k) => k.email === hackedEmail.toLowerCase());
  check('chủ có việc tay cho tài khoản bị cách ly, lý do dễ hiểu', !!qTask && !/^[a-z_]+$/.test(qTask.reason), qTask);
  if (qTask) {
    const keep = (await owner.post(`${BP}/admin/api/tasks/${qTask.id}/done`, { keepPassword: true })).data;
    check('tài khoản bị cách ly (mật khẩu đã bị người ngoài đổi): KHÔNG cho "Giữ mật khẩu cũ"', !keep?.ok, keep);
    const vendorPw = (await state()).vendors.chatgpt[hackedEmail].password;
    const done = (await owner.post(`${BP}/admin/api/tasks/${qTask.id}/done`, { newPassword: vendorPw })).data;
    check('chủ lấy lại tài khoản, dán mật khẩu mới → xong', done?.ok, done);
  }

  // ================================================================
  part('D12. Chủ thu hồi slot / khoá khách / mở khoá');
  const victim2 = gm[1];
  const sid = one("SELECT s.id FROM slots s JOIN customers c ON c.id = s.customer_id WHERE c.phone = ? AND s.status = 'active'", `84${victim2.d.phone.slice(1)}`)?.id;
  r = await adminPost(`/admin/slots/${sid}/revoke`, {});
  check('thu hồi slot', /thu hồi|Đã/i.test(msgOf(r)), msgOf(r));
  const cid = one('SELECT id FROM customers WHERE phone = ?', `84${ad[4].d.phone.slice(1)}`).id;
  r = await adminPost(`/admin/customers/${cid}/lock`, { days: '1', reason: 'thử khoá' });
  const lockedClaim = await claim(ad[4].d, cafeA, 'CapCut Pro');
  check('khách bị khoá không nhận được', lockedClaim.status !== 'active', lockedClaim);
  await adminPost(`/admin/customers/${cid}/unlock`, {});
  let unlockedClaim = await claim(ad[4].d, cafeA, 'CapCut Pro');
  if (unlockedClaim.code === 'no_tool_on_page') { // khoá khách là đăng xuất họ → mở khoá xong khách đăng nhập lại
    note('khoá khách = đăng xuất khách; mở khoá xong khách phải nhận SMS đăng nhập lại');
    await login(ad[4].d, ad[4].d.phone);
    unlockedClaim = await claim(ad[4].d, cafeA, 'CapCut Pro');
  }
  check('mở khoá → nhận được', unlockedClaim.status === 'active', unlockedClaim);

  // ================================================================
  part('D13. Claude Pro: 3 khách / tài khoản, mã đăng nhập về hộp thư Tiệm → đúng người; người ngoài kẹt ở bước mã');
  const cl = [];
  for (let i = 1; i <= 4; i++) {
    const d = new Device(`g4${100 + i}`);
    await enter(d, cafeA); await login(d);
    const c = await claim(d, cafeA, 'Claude Pro');
    cl.push({ d, c, m: await me(d) });
  }
  check('4 khách nhận Claude', cl.every((x) => x.c.status === 'active'), cl.map((x) => x.c.code || x.c.status));
  const clAcc = cl[0].m.email;
  check('3 khách đầu chung 1 tài khoản (Slot 1…3), khách 4 sang tài khoản khác', cl.slice(0, 3).every((x) => x.m.email === clAcc)
    && new Set(cl.slice(0, 3).map((x) => x.m.seat)).size === 3 && cl[3].m.email !== clAcc && cl[3].m.seat === 1, cl.map((x) => [x.m.email, x.m.seat]));
  const e6c = endsAt6('claude');
  check('khách Claude hết đúng 06:00 sáng mai (giờ VN)', e6c.ok, e6c.ends);
  check('trang khách Claude: không có mật khẩu, có nút "Lấy mã"', !cl[0].m.password && /Lấy mã/.test(cl[0].m.html));
  w = await mailCode(cl[0].d);
  res = await vendorLogin(cl[0].d, 'claude', clAcc, '', async () => w.wait?.());
  check('khách 1: bấm "Lấy mã" rồi đăng nhập Claude → mã về đúng khách', res === 'ok', { res, w: w.error });
  res = await vendorLogin(cl[1].d, 'claude', clAcc, '', async () => (await mailCode(cl[1].d)).wait?.());
  check('khách 2 (cùng tài khoản): đăng nhập trước, bấm "Lấy mã" sau → vẫn được', res === 'ok', res);
  res = await vendorLogin(new Device('nha3'), 'claude', clAcc, '', async () => null);
  check('người ngoài biết email Claude → kẹt ở bước mã', res === 'khong_co_ma', res);
  await sleep(500);
  const clOrphan = one('SELECT verdict FROM mails WHERE account_id = (SELECT id FROM accounts WHERE login_email = ?) ORDER BY id DESC LIMIT 1', clAcc.toLowerCase());
  check('mã do người ngoài làm Claude gửi → không giao cho ai', ['orphan', 'orphan_wait'].includes(clOrphan?.verdict), clOrphan);
  res = await vendorLogin(cl[3].d, 'claude', cl[3].m.email, '', async () => (await mailCode(cl[3].d)).wait?.());
  check('khách 4 (tài khoản 2) đăng nhập Claude được', res === 'ok', res);
  const clUnused = q("SELECT a.login_email FROM accounts a JOIN tools t ON t.id = a.tool_id WHERE t.slug = 'claude' AND NOT EXISTS (SELECT 1 FROM slots s WHERE s.account_id = a.id)");
  check('3 tài khoản Claude: 1 tài khoản được giữ dự phòng cho 6h sáng (trong ngày không giao)', clUnused.length === 1, clUnused);

  // ================================================================
  part('D14. Canva Pro: khách nhập email Canva → bot mời → bắt đầu tính 7 ngày; máy Mac tắt quá 10 phút → báo đỏ');
  const cv1 = new Device('g4111'); await enter(cv1, cafeA); await login(cv1);
  let cvc = await claim(cv1, cafeA, 'Canva Pro');
  check('không nhập email Canva → nhắc nhập email, chưa giữ ghế', cvc.status !== 'active' && cvc.code === 'invite_email_required', cvc);
  cvc = await claim(cv1, cafeA, 'Canva Pro', { inviteEmail: 'khach-canva1@gmail.com' });
  check('nhập email → chờ Tiệm mời (chưa tính giờ)', cvc.status === 'pending_invite', cvc);
  const cvMe = await me(cv1);
  check('trang khách: đang chờ mời, đúng email', /mời/i.test(cvMe.html) && /khach-canva1@gmail\.com/.test(cvMe.html), cvMe.html.slice(0, 300));
  await warp(0.25);
  live = (await owner.get(`${BP}/admin/api/live`)).data;
  check('bot (máy Mac) tắt quá 10 phút → Theo dõi báo đỏ để chủ mời tay', live?.alerts?.some((e) => e.type === 'worker_task_stuck'), live?.alerts?.map((e) => e.type));
  let botRun = (await panel.postForm('/dien-tap/bot', { lam: '1' })).data;
  check('bật bot → bot mời đúng email', botRun?.done?.some((x) => x.kind === 'invite_member' && x.email === 'khach-canva1@gmail.com' && x.ok), botRun);
  const cvSlot = one("SELECT status, started_at, expires_at FROM slots WHERE invite_email = 'khach-canva1@gmail.com' ORDER BY id DESC LIMIT 1");
  check('mời xong mới tính giờ: 7 ngày từ lúc mời', cvSlot?.status === 'active' && Math.abs(cvSlot.expires_at - cvSlot.started_at - 7 * 86400e3) < 60e3, cvSlot);
  await panel.postForm('/hang/canva', { email: 'khach-canva1@gmail.com' });
  const cv2 = new Device('g4112'); await enter(cv2, cafeA); await login(cv2);
  const cvc2 = await claim(cv2, cafeA, 'Canva Pro', { inviteEmail: 'Khach-Canva2@Gmail.com' });
  botRun = (await panel.postForm('/dien-tap/bot', { lam: '1' })).data;
  const team = (await state()).canva.members;
  check('khách 2 (email viết hoa) được mời bằng email chữ thường; nhóm có đủ 2 khách', cvc2.status === 'pending_invite' && !!team['khach-canva2@gmail.com'] && team['khach-canva1@gmail.com']?.status === 'member', { cvc2, team });
  const canvaAdmin = (await owner.get(`${BP}/admin/canva`)).text;
  check('trang quản trị Canva thấy 2 khách', /khach-canva1@gmail\.com/.test(canvaAdmin) && /khach-canva2@gmail\.com/.test(canvaAdmin));

  // ================================================================
  part('D15. Sửa phiên 20: bạn mượn máy đăng nhập không làm chủ máy bị từ chối; chạm thẻ lại thì tính lại 30 phút');
  const shared = new Device('g4121'); await enter(shared, cafeA);
  const friendIn = await login(shared); // bạn mượn máy đăng nhập số của bạn ấy, không nhận gì
  const ownerIn = await login(shared); // chủ máy đăng nhập số của mình
  const sharedClaim = await claim(shared, cafeA, 'CapCut Pro');
  check('chủ máy nhận được bình thường (trước đây: +30 điểm → mức vàng → bị từ chối mãi)', friendIn.ok && ownerIn.ok && sharedClaim.status === 'active', { friendIn, ownerIn, sharedClaim });
  const retap = new Device('g4122'); await enter(retap, cafeA); await login(retap);
  await warp(0.4);
  await enter(retap, cafeA); // chạm thẻ lần nữa ở phút 24
  await warp(0.15);
  const retapClaim = (await retap.post(`${BP}/api/claim`, { toolId: toolId.capcut })).data;
  check('chạm lại thẻ ở phút 24, bấm nhận ở phút 33 → vẫn nhận được', retapClaim?.status === 'active', retapClaim);

  // ================================================================
  part('D16. Lượt / ngày tính theo giờ Việt Nam (không theo giờ UTC)');
  // Lùi lượt Adobe mới nhất về 00:15 hôm nay giờ VN (= 17:15 UTC hôm qua): theo giờ VN vẫn là "hôm nay", theo UTC đã là hôm qua.
  const DAYMS = 86400e3;
  const vnMidnight = Math.floor((Date.now() + VNOFF) / DAYMS) * DAYMS - VNOFF;
  const lastAdobe = one("SELECT MAX(created_at) AS t FROM slots WHERE tool_id = ? AND status != 'rejected'", toolId.adobe).t;
  const shiftH = (lastAdobe - (vnMidnight + 15 * 60e3)) / 3600e3;
  if (shiftH > 0.05) {
    await warp(Number(shiftH.toFixed(3)));
    const d = new Device('wifi19'); await enter(d, cafeA); await login(d);
    const c = await claim(d, cafeA, 'Adobe Creative Cloud');
    check('lượt Adobe lúc 00:15 giờ VN (17:15 UTC hôm trước) vẫn tính là hôm nay → Adobe vẫn hết lượt', c.status !== 'active', c);
    await warp(0.5);
    await enter(d, cafeA);
    const c2 = await claim(d, cafeA, 'Adobe Creative Cloud');
    check('lùi thêm 30 phút (qua nửa đêm giờ VN) → Adobe có lượt lại', c2.status === 'active', c2);
  } else note('chạy lúc vừa qua nửa đêm VN — bỏ qua kiểm ranh giới ngày');

  // ================================================================
  part('D17. 6h sáng: ChatGPT + Claude hết cùng lúc → chủ "Đăng xuất mọi thiết bị" (giữ mật khẩu) → giao lại');
  // Tự đủ (không dựa vào khách các phần trước — tua giờ ở phần trước có thể đã qua 6h): chủ dọn việc tay còn tồn, khách mới nhận, tua tới 6h.
  const sess = (st, e) => Object.keys((st.vendors.chatgpt[e] || st.vendors.claude[e])?.sessions || {}).length;
  const logoutAll = async (tasks) => {
    let ok = true;
    for (const t of tasks) {
      await vendorAction('/dien-tap/xoay', { v: t.slug, email: t.login_email, keep: '1' });
      const d = (await owner.post(`${BP}/admin/api/tasks/${t.id}/done`, t.slug === 'chatgpt' ? { keepPassword: true } : {})).data;
      if (!d?.ok) { ok = false; note(`việc ${t.id} (${t.slug}): ${d?.message}`); }
    }
    return ok;
  };
  const rotateTodo = () => q(`SELECT r.id, a.login_email, t.slug FROM rotation_tasks r JOIN accounts a ON a.id = r.account_id JOIN tools t ON t.id = a.tool_id
                              WHERE r.status = 'todo' AND r.kind = 'rotate' AND t.slug IN ('chatgpt', 'claude')`);
  await ownerLogin(S0.adminPassword);
  const leftover = rotateTodo();
  if (leftover.length) note(`trước phần này còn ${leftover.length} việc "Đăng xuất mọi thiết bị" từ các lần tua trước → chủ làm xong`);
  await logoutAll(leftover);
  const six = [];
  for (const [i, tool] of [[1, 'ChatGPT Plus'], [2, 'ChatGPT Plus'], [3, 'Claude Pro'], [4, 'Claude Pro']]) {
    const d = new Device(`g4${150 + i}`);
    await enter(d, cafeA); await login(d);
    const c = await claim(d, cafeA, tool);
    six.push({ d, c, tool, m: await me(d) });
  }
  check('4 khách mới nhận ChatGPT / Claude', six.every((x) => x.c.status === 'active'), six.map((x) => x.c.code || x.c.status));
  const sixEnds = six.map((x) => one('SELECT expires_at AS e FROM slots WHERE id = ?', x.c.slotId)?.e).map((e) => new Date(e + VNOFF));
  check('cả 4 hết đúng 06:00 sáng (giờ VN)', sixEnds.every((d) => d.getUTCHours() === 6 && d.getUTCMinutes() === 0), sixEnds.map((d) => d.toISOString().slice(0, 16)));
  let in6 = 0;
  for (const x of six) {
    const r6 = x.tool === 'ChatGPT Plus'
      ? await vendorLogin(x.d, 'chatgpt', x.m.email, x.m.password, async () => totpCode(x.d))
      : await vendorLogin(x.d, 'claude', x.m.email, '', async () => (await mailCode(x.d)).wait?.());
    if (r6 === 'ok') in6++; else note(`${x.d.name} vào ${x.tool}: ${r6}`);
  }
  check('cả 4 đăng nhập được hãng', in6 === 4, in6);
  const live6 = q(`SELECT s.expires_at, a.login_email FROM slots s JOIN tools t ON t.id = s.tool_id JOIN accounts a ON a.id = s.account_id
                   WHERE s.status = 'active' AND t.slug IN ('chatgpt', 'claude')`);
  const accs6 = [...new Set(live6.map((x) => x.login_email))];
  note(`${live6.length} khách ChatGPT / Claude đang dùng trên ${accs6.length} tài khoản — tua tới 6h sáng`);
  await warp(Number(((Math.max(...live6.map((x) => x.expires_at)) - Date.now()) / 3600e3 + 0.05).toFixed(3)));
  const left6 = one("SELECT COUNT(*) AS n FROM slots s JOIN tools t ON t.id = s.tool_id WHERE s.status = 'active' AND t.slug IN ('chatgpt', 'claude')").n;
  const tasks6 = rotateTodo();
  check('6h: không còn ai dùng; mỗi tài khoản đã có người → đúng 1 việc "Đăng xuất mọi thiết bị"', left6 === 0 && tasks6.length === accs6.length
    && accs6.every((e) => tasks6.some((x) => x.login_email === e)), { left6, accs6, tasks6 });
  const s6 = await state();
  note(`6h, trước khi chủ làm: ${accs6.filter((e) => sess(s6, e)).length}/${accs6.length} tài khoản vẫn còn khách hôm qua đăng nhập ở hãng (hết khi chủ bấm Đăng xuất mọi thiết bị)`);
  const early = new Device('g4159'); await enter(early, cafeA); await login(early);
  const earlyTools = toolIds((await enter(early, cafeA)).text);
  const readyCl = one("SELECT COUNT(*) AS n FROM accounts a JOIN tools t ON t.id = a.tool_id WHERE t.slug = 'claude' AND a.status = 'ready'").n;
  const readyGpt = one("SELECT COUNT(*) AS n FROM accounts a JOIN tools t ON t.id = a.tool_id WHERE t.slug = 'chatgpt' AND a.status = 'ready'").n;
  check('khách tới lúc 6h05 (chủ chưa làm): Claude vẫn nhận được nhờ tài khoản dự phòng', earlyTools['Claude Pro'] && !earlyTools['Claude Pro'].disabled, { earlyTools, readyCl });
  check('ChatGPT chỉ hiện "còn" khi có tài khoản không phải chờ đăng xuất', earlyTools['ChatGPT Plus']?.disabled === (readyGpt === 0), { earlyTools, readyGpt });
  note(`khách tới lúc 6h05 trước khi chủ làm: Claude ${readyCl ? `còn (${readyCl} tài khoản không phải chờ)` : 'Tạm hết'}, ChatGPT ${readyGpt ? `còn (${readyGpt} tài khoản không phải chờ)` : 'Tạm hết'}`);
  await ownerLogin(S0.adminPassword);
  check('chủ "Đăng xuất mọi thiết bị" (giữ mật khẩu) + bấm Đã xong → tài khoản sẵn sàng', await logoutAll(tasks6)
    && tasks6.every((t) => one('SELECT status FROM accounts WHERE login_email = ?', t.login_email).status === 'ready'));
  const s6b = await state();
  check('sau khi chủ làm: không còn ai đăng nhập các tài khoản đó ở hãng', accs6.every((e) => sess(s6b, e) === 0));
  res = await vendorLogin(six[0].d, 'chatgpt', six[0].m.email, six[0].m.password, async () => totpCode(six[0].d));
  check('khách ChatGPT hôm qua: mật khẩu cũ vẫn đúng nhưng không lấy được mã 2FA → không vào lại', res === 'khong_co_ma', res);
  res = await vendorLogin(six[2].d, 'claude', six[2].m.email, '', async () => (await mailCode(six[2].d)).wait?.());
  check('khách Claude hôm qua: không lấy được mã → không vào lại', res === 'khong_co_ma', res);
  const earlyClaim = await claim(early, cafeA, 'Claude Pro');
  check('khách sáng sớm nhận được Claude', earlyClaim.status === 'active', earlyClaim);
  const early2 = new Device('g4158'); await enter(early2, cafeA); await login(early2);
  const e2Tools = toolIds((await enter(early2, cafeA)).text);
  const reservedNow = one("SELECT COUNT(*) AS n FROM accounts a JOIN tools t ON t.id = a.tool_id WHERE t.slug = 'claude' AND a.status = 'ready' AND NOT EXISTS (SELECT 1 FROM slots s WHERE s.account_id = a.id AND s.status = 'active')").n;
  note(`sau khi chủ làm xong: ${reservedNow} tài khoản Claude rảnh (1 cái lại được giữ dự phòng cho sáng mai) · trang chọn Claude: ${e2Tools['Claude Pro']?.disabled ? 'Tạm hết' : 'còn'}`);

  // ================================================================
  part('D18. Hết 7 ngày CapCut: tài khoản tự bỏ; kho cũ không giao; nạp mới giao được');
  await warp(7 * 24);
  const ccLeft = one("SELECT COUNT(*) AS n FROM accounts a JOIN tools t ON t.id = a.tool_id WHERE t.slug = 'capcut' AND a.status = 'retired'").n;
  check('4 tài khoản CapCut đã dùng tự "Ngừng dùng"', ccLeft >= 4, ccLeft);
  await ownerLogin(S0.adminPassword); // phiên quản trị 12 giờ đã hết sau khi tua
  const toolsPage = (await owner.get(`${BP}/admin/tools`)).text;
  check('trang Công cụ báo CapCut nhập quá 7 ngày, không giao', /nhập quá 7 ngày, hết Pro/.test(toolsPage));
  const late1 = new Device('wifi20'); await enter(late1, cafeA); await login(late1);
  check('khách mới: CapCut bị khoá trên trang (kho cũ)', toolIds((await enter(late1, cafeA)).text)['CapCut Pro']?.disabled);
  await panel.postForm('/dien-tap/nap', { k: 'capcut:10' });
  const fresh = (await state()).batches[0];
  r = await adminPost('/admin/accounts', { tool_id: String(toolId.capcut), lines: fresh.lines.join('\n') });
  const ccNew = await claim(late1, cafeA, 'CapCut Pro');
  const ccNewMe = await me(late1);
  check('nạp 10 CapCut mới → khách nhận tài khoản mới', ccNew.status === 'active' && fresh.lines.some((l) => l.startsWith(ccNewMe.email)), { ccNew, email: ccNewMe.email });
  check('đăng nhập CapCut giả: còn Pro', (await vendorLogin(late1, 'capcut', ccNewMe.email, ccNewMe.password)) === 'ok' && /còn tới/.test((await late1.get('/hang/capcut')).text));

  // ================================================================
  part('D19. Hết 7 ngày: bot gỡ khách Canva khỏi nhóm; Adobe tự bỏ; Claude nhập quá 7 ngày không giao');
  const cvEnded = q("SELECT status FROM slots WHERE invite_email IN ('khach-canva1@gmail.com', 'khach-canva2@gmail.com')");
  check('2 khách Canva hết hạn', cvEnded.length === 2 && cvEnded.every((x) => x.status === 'expired'), cvEnded);
  botRun = (await panel.postForm('/dien-tap/bot', { lam: '1' })).data;
  check('bot gỡ đúng 2 email khỏi nhóm', botRun?.done?.filter((x) => x.kind === 'remove_member' && x.ok).length === 2, botRun);
  const teamAfter = (await state()).canva.members;
  check('nhóm Canva giả không còn khách', Object.keys(teamAfter).length === 0, teamAfter);
  check('trang quản trị Canva: "Đã gỡ"', /Đã gỡ/.test((await owner.get(`${BP}/admin/canva`)).text));
  const adRetired = one("SELECT COUNT(*) AS n FROM accounts a JOIN tools t ON t.id = a.tool_id WHERE t.slug = 'adobe' AND a.status = 'retired'").n;
  check('tài khoản Adobe đã giao tự "Ngừng dùng" sau 7 ngày', adRetired >= 2, adRetired);
  const late2 = new Device('g4141'); await enter(late2, cafeA); await login(late2);
  const lateTools = toolIds((await enter(late2, cafeA)).text);
  check('Claude nhập kho quá 7 ngày → không giao (khoá trên trang)', lateTools['Claude Pro']?.disabled, lateTools['Claude Pro']);
  await panel.postForm('/dien-tap/nap', { k: 'claude:1' });
  const clFresh = (await state()).batches[0];
  r = await adminPost('/admin/accounts', { tool_id: String(toolId.claude), lines: clFresh.lines.join('\n') });
  const clNew = await claim(late2, cafeA, 'Claude Pro');
  check('nạp Claude mới → giao được', clNew.status === 'active', { clNew, msg: msgOf(r) });

  // ================================================================
  part('D20. Xoá dữ liệu khách: không thành cách nhận lại lượt');
  const er = ccDev[1];
  const erId = one('SELECT id FROM customers WHERE phone = ?', `84${er.d.phone.slice(1)}`).id;
  r = await adminPost(`/admin/customers/${erId}/erase`, {});
  check('xoá dữ liệu cá nhân', /xoá|Đã/i.test(msgOf(r)), msgOf(r));
  const erDev = new Device('g499'); await enter(erDev, cafeB, cafeB.cards[3]); await login(erDev, er.d.phone);
  const erClaim = await claim(erDev, cafeB, 'CapCut Pro', { card: cafeB.cards[3] });
  check('cùng số điện thoại đăng ký lại → vẫn không nhận lại CapCut (1 lần / khách)', erClaim.status !== 'active', erClaim);

  // ================================================================
  part('D21. Sao lưu database đang chạy');
  const bk = join(DIR, 'sao-luu.sqlite');
  const b = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', 'scripts/backup.js', bk], { cwd: ROOT, env: { PATH: process.env.PATH, DB_PATH: join(DIR, 'tbq.sqlite') }, encoding: 'utf8' });
  let bkOk = false;
  if (b.status === 0 && existsSync(bk)) { const x = new DatabaseSync(bk, { readOnly: true }); bkOk = x.prepare('SELECT COUNT(*) AS n FROM slots').get().n > 20; x.close(); }
  check('npm run backup ra tệp đọc được, đủ dữ liệu', bkOk, b.stderr || b.stdout);

  // ================================================================
  part('D22. Dò mật khẩu quản trị: khoá theo IP kẻ dò, chủ vẫn vào được');
  const bad = new Device('nha7', LAPTOP);
  await bad.get(`${BP}/admin/login`);
  let lastLoc = '';
  for (let i = 0; i < 11; i++) lastLoc = (await bad.postForm(`${BP}/admin/login`, { password: `doan-${i}` })).location || '';
  check('sau 10 lần sai → "thử lại sau 15 phút"', /15/.test(decodeURIComponent(lastLoc)), decodeURIComponent(lastLoc));
  const ownerAgain = await ownerLogin(S0.adminPassword);
  check('chủ (IP khác) vẫn đăng nhập được', !!owner.csrf && /admin/.test(ownerAgain.location || ''), ownerAgain.location);
  live = (await owner.get(`${BP}/admin/api/live`)).data;
  check('Theo dõi có cảnh báo đăng nhập sai', live?.alerts?.some((e) => e.type === 'admin_login_failed'), live?.alerts?.map((e) => e.type));

  // ================================================================
  part('D23. Tổng kết bộ diễn tập');
  const fin = await state();
  check('không vi phạm nào (lộ khoá 2FA / mật khẩu cho máy không giữ slot / vào hãng không giữ slot / còn trong nhóm Canva khi hết slot / lỗi 5xx)', fin.violations.length === 0, fin.violations.slice(0, 5));
  note(`${fin.sms.length} tin SMS · ${fin.mails.length} thư qua Worker · ${fin.logins.filter((l) => l.ok).length} lần vào hãng · tua ${(fin.warpMs / 3600e3).toFixed(1)} giờ`);
}

let crashed = null;
try { await main(); } catch (err) { crashed = err; console.error(err); }
const failed = results.filter((x) => !x.ok);
const bySection = [...new Set(results.map((x) => x.section))];
const md = `# Kịch bản vận hành sâu (\`npm run van-hanh-sau\`) — ${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}

Chạy trên bộ diễn tập: TBQ **production** sau Caddy giả, OTP qua eSMS giả, thư qua code Cloudflare Worker, hãng giả kiểm đăng nhập thật, tua giờ bằng database.
Mỗi máy 1 địa chỉ riêng (cookie riêng). Không đụng dữ liệu diễn tập của bạn.

## Kết quả: ${crashed ? '❌ dừng giữa chừng' : failed.length ? `❌ ${failed.length} bước không đạt` : '✅'} — ${results.length - failed.length}/${results.length} bước đạt

${bySection.map((sec) => `### ${sec}\n${results.filter((x) => x.section === sec).map((x) => `- ${x.ok ? '✔' : '✘'} ${x.name}${x.ok ? '' : ` — \`${x.detail.replace(/`/g, "'")}\``}`).join('\n')}`).join('\n\n')}

## Ghi nhận
${notes.map((n) => `- ${n}`).join('\n') || '- (không có)'}
${crashed ? `\n## Lỗi dừng kịch bản\n\`\`\`\n${String(crashed.stack || crashed).slice(0, 1500)}\n\`\`\`\n` : ''}`;
writeFileSync(join(ROOT, 'docs/bao-cao-van-hanh-sau.md'), md);
console.log(`\n=== ${results.length - failed.length}/${results.length} bước đạt${crashed ? ' (dừng giữa chừng)' : ''} — docs/bao-cao-van-hanh-sau.md ===`);
await stopHarness();
process.exit(failed.length || crashed ? 1 : 0);
