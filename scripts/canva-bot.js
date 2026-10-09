// Bot Canva (chạy trên VPS dưới màn hình ảo Xvfb, hoặc trên máy Mac): tự mời khách vào nhóm Canva Pro, hết giờ tự gỡ ra. Làm trên Canva THẬT, bằng Chrome thật.
//
//   npm run canva-bot -- --login                               → mở cửa sổ Chrome riêng của bot ở trang đăng nhập Canva.
//                                                             Chủ tự đăng nhập tài khoản chủ nhóm (1 lần, bot nhớ). Đóng bằng Ctrl+C.
//   npm run canva-bot -- --nhom chu-nhom@gmail.com --kiem    → mở trang Thành viên, báo bot có thấy đủ nút không (chạy sau khi đăng nhập
//                                                             và mỗi khi Canva đổi giao diện).
//   npm run canva-bot -- --nhom chu-nhom@gmail.com --thu-moi ban@gmail.com   → mời thử 1 email (không qua TBQ).
//   npm run canva-bot -- --nhom chu-nhom@gmail.com --thu-go  ban@gmail.com   → gỡ thử 1 email.
//   npm run canva-bot -- --nhom chu-nhom@gmail.com           → chạy thật: hỏi TBQ việc mời / gỡ mỗi 15 giây và làm.
//   Kiểm tra (chỉ xem, không đổi gì): --tim <email> (email đang ở đâu, hàng có nút gì) · --xem-menu <email> (mở menu của hàng rồi ESC)
//                                     · --ds (in danh sách thành viên + lời mời đang chờ) · --soi (in các ô nhập trong hộp mời)
//
// Đã hiệu chỉnh trên Canva Giáo dục thật (05/10/2026): "Mời mọi người" → ô "Nhập email cho thành viên 1" → giữ vai trò "Học sinh"
// → "Gửi lời mời" (1 lệnh invitations/create, không trùng). Gỡ: lời mời đang chờ → menu ô vai trò → "Hủy thư mời" (invitations/delete).
// Ô tìm kiếm của Canva KHÔNG tìm ra người "Đã mời" → bot đọc danh sách đầy đủ trước. Canva kèm mã chống bot khi tạo lời mời,
// nên bot luôn bấm trên Chrome thật, không gọi thẳng API.
//
// Cần: TBQ_URL (vd. https://thu.tiembanquyen.com/colap) và WORKER_TOKEN (giống trong .env của TBQ) — đặt trong .env cạnh package.json.
// Bot chỉ nhận từ TBQ: email khách cần mời / gỡ và email chủ nhóm. Không bao giờ nhận mật khẩu, số điện thoại khách.
//
// Cách bot làm: mở Chrome với hồ sơ riêng (~/.tbq-canva-bot/<email chủ nhóm>), điều khiển qua cổng gỡ lỗi của Chrome
// (DevTools Protocol, chỉ nghe trên máy này), tìm nút theo CHỮ trên nút (tiếng Anh hoặc tiếng Việt). Canva đổi chữ trên nút thì
// sửa danh sách NHAN dưới đây, hoặc ghi đè trong ~/.tbq-canva-bot/nhan.json, rồi chạy --kiem lại.
import { spawn } from 'node:child_process';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const flag = (name) => args.includes(name);

// Email chủ nhóm: chỉ cần khi chạy thật nhiều nhóm (mỗi nhóm 1 cửa sổ Chrome riêng). Bỏ trống = 1 nhóm, hồ sơ Chrome "mac-dinh".
const rawTeam = String(opt('--nhom') || process.env.CANVA_TEAM || '').trim().toLowerCase();
const TEAM = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(rawTeam) ? rawTeam : '';
if (rawTeam && !TEAM) console.log(`"${rawTeam}" không phải email — bỏ qua, dùng hồ sơ Chrome mặc định.`);
const HOME = join(homedir(), '.tbq-canva-bot');
// Hồ sơ Chrome: riêng theo email nhóm nếu đã đăng nhập bằng --nhom <email> --login; không thì dùng hồ sơ mặc định (đã đăng nhập bằng --login).
const TEAM_PROFILE = TEAM ? join(HOME, TEAM.replace(/[^a-z0-9.@_-]/g, '_')) : null;
const PROFILE = TEAM_PROFILE && (flag('--login') || existsSync(join(TEAM_PROFILE, 'Default'))) ? TEAM_PROFILE : join(HOME, 'mac-dinh');
const SHOTS = join(HOME, 'anh-loi');
mkdirSync(PROFILE, { recursive: true });
mkdirSync(SHOTS, { recursive: true });
const PORT = Number(opt('--cong') || 9333);
// Mac: Chrome / Brave trong /Applications. VPS (Linux): google-chrome, chạy có cửa sổ trên màn hình ảo (DISPLAY=:99) — Canva dễ chặn chế độ headless.
const CHROME = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  '/usr/bin/google-chrome-stable', '/usr/bin/google-chrome', '/usr/bin/chromium'].find((p) => p && existsSync(p));
const PEOPLE_URL = 'https://www.canva.com/settings/people';
const TBQ_URL = String(process.env.TBQ_URL || '').replace(/\/+$/, '');
const TOKEN = process.env.WORKER_TOKEN || '';
const WORKER = `canva-${(TEAM || 'mac-dinh').split('@')[0]}`.replace(/[^\w.-]/g, '').slice(0, 40);

// Chữ trên các nút của Canva (không phân biệt hoa thường). Thứ tự = ưu tiên.
const NHAN_MAC_DINH = {
  invite: ['Mời mọi người', 'Invite people', 'Invite members', 'Invite team members', 'Mời thành viên', 'Mời học sinh/sinh viên', 'Invite students'],
  emailInput: ['Nhập email cho thành viên 1', 'Enter email for member 1', 'Nhập địa chỉ email', 'Enter email address', 'Enter email', 'Nhập email', 'email'],
  send: ['Gửi lời mời', 'Send invitations', 'Send invitation', 'Send invites', 'Send invite', 'Gửi', 'Send'],
  rowMenu: ['More', 'More options', 'Options', 'Thêm', 'Tuỳ chọn khác', 'Tùy chọn khác'],
  remove: ['Xóa khỏi trường học', 'Xoá khỏi trường học', 'Remove from school', 'Xóa khỏi đội nhóm', 'Xoá khỏi đội nhóm', 'Xóa khỏi đội', 'Xóa khỏi nhóm', 'Xoá khỏi nhóm', 'Remove from team', 'Remove from Team', 'Remove'],
  revoke: ['Hủy thư mời', 'Huỷ thư mời', 'Cancel invitation', 'Revoke invitation', 'Revoke invite', 'Thu hồi lời mời', 'Hủy lời mời', 'Huỷ lời mời'],
  // Hộp xác nhận: KHÔNG có chữ "Hủy" trơn (thường là nút huỷ thao tác).
  confirm: ['Hủy thư mời', 'Huỷ thư mời', 'Xóa khỏi trường học', 'Xoá khỏi trường học', 'Xóa khỏi đội nhóm', 'Xóa', 'Xoá', 'Cancel invitation', 'Remove', 'Revoke', 'Confirm', 'Thu hồi', 'Xác nhận', 'Đồng ý'],
  loggedOut: ['Log in', 'Sign up', 'Đăng nhập', 'Đăng ký'],
  search: ['Search by name or email', 'Search', 'Tìm kiếm theo tên hoặc email', 'Tìm kiếm'],
};
const NHAN_FILE = join(HOME, 'nhan.json');
const NHAN = { ...NHAN_MAC_DINH, ...(existsSync(NHAN_FILE) ? JSON.parse(readFileSync(NHAN_FILE, 'utf8')) : {}) };

const log = (...a) => console.log(new Date().toLocaleTimeString('vi-VN', { hour12: false }), ...a);

// ---------- Chrome + DevTools Protocol (không cần thư viện ngoài) ----------

let chrome = null;
async function startChrome() {
  if (!CHROME) throw new Error('Không thấy Google Chrome (Mac: /Applications, Linux: /usr/bin/google-chrome). Đặt CHROME_PATH nếu để chỗ khác.');
  try { await fetch(`http://127.0.0.1:${PORT}/json/version`); return; } catch { /* chưa chạy → mở */ }
  chrome = spawn(CHROME, [
    `--user-data-dir=${PROFILE}`, `--remote-debugging-port=${PORT}`, '--remote-allow-origins=http://127.0.0.1',
    '--lang=vi', '--no-first-run', '--no-default-browser-check', '--window-size=1280,900',
    // Linux không có Keychain → lưu đăng nhập trong hồ sơ, không hiện hộp hỏi mật khẩu keyring.
    ...(process.platform === 'linux' ? ['--password-store=basic', '--window-position=0,0'] : []), 'about:blank',
  ], { stdio: 'ignore' });
  for (let i = 0; i < 80; i++) {
    await sleep(250);
    try { await fetch(`http://127.0.0.1:${PORT}/json/version`); return; } catch { /* chờ */ }
  }
  throw new Error('Chrome không mở được cổng điều khiển.');
}

class Page {
  static async open() {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    let t = list.find((x) => x.type === 'page');
    if (!t) t = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
    const p = new Page(t.webSocketDebuggerUrl);
    await p.ready;
    await p.send('Page.enable');
    await p.send('Runtime.enable');
    return p;
  }
  constructor(url) {
    this.id = 0; this.waiting = new Map(); this.events = []; this.requests = null;
    this.ws = new WebSocket(url);
    this.ready = new Promise((ok, bad) => { this.ws.onopen = ok; this.ws.onerror = () => bad(new Error('Không kết nối được Chrome')); });
    this.ws.onmessage = (m) => {
      const d = JSON.parse(m.data);
      if (d.id && this.waiting.has(d.id)) { const w = this.waiting.get(d.id); this.waiting.delete(d.id); d.error ? w.bad(new Error(d.error.message)) : w.ok(d.result); }
      else if (d.method) {
        this.events.push(d.method);
        if (this.requests && d.method === 'Network.requestWillBeSent' && d.params.request.method !== 'GET' && /canva\.com/.test(d.params.request.url)) {
          const r = d.params.request;
          this.requests.push({ at: new Date().toISOString(), method: r.method, url: r.url.split('?')[0], body: String(r.postData || '').slice(0, 2000) });
        }
      }
    };
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((ok, bad) => { this.waiting.set(id, { ok, bad }); setTimeout(() => { if (this.waiting.delete(id)) bad(new Error(`Chrome không trả lời ${method}`)); }, 30_000); });
  }
  async eval(fn, ...a) {
    const r = await this.send('Runtime.evaluate', { expression: `(${fn})(...${JSON.stringify(a)})`, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  }
  async goto(url) {
    this.events = [];
    await this.send('Page.navigate', { url });
    for (let i = 0; i < 60 && !this.events.includes('Page.loadEventFired'); i++) await sleep(250);
    await sleep(1500); // Canva vẽ giao diện bằng JS sau khi tải
  }
  async click(x, y) {
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
      await this.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
    }
  }
  async type(text) { await this.send('Input.insertText', { text }); }
  async key(key, code = key, keyCode = 13) {
    await this.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: keyCode });
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: keyCode });
  }
  async shot(name) {
    const { data } = await this.send('Page.captureScreenshot', { format: 'png' });
    const file = join(SHOTS, `${new Date().toISOString().replace(/[:.]/g, '-')}-${name}.png`);
    writeFileSync(file, Buffer.from(data, 'base64'));
    return file;
  }
}

// Chạy trong trang Canva: tìm phần tử bấm được có chữ / nhãn khớp 1 trong `labels`, trong `scope` (CSS) nếu có, ưu tiên hộp thoại đang mở.
// → {x, y, text} | null
function findInPage(labels, opts = {}) {
  const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const want = labels.map(norm);
  // Thấy được VÀ đang nổi trên cùng (không bị hộp thoại che) — bấm vào chỗ đó thì trúng đúng phần tử này.
  const visible = (el) => {
    const r = el.getBoundingClientRect(); const st = getComputedStyle(el);
    if (!(r.width > 2 && r.height > 2 && st.visibility !== 'hidden' && st.display !== 'none')) return false;
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!top && (top === el || el.contains(top) || top.contains(el));
  };
  const dialogs = [...document.querySelectorAll('[role=dialog], [aria-modal=true]')].filter(visible);
  if (opts.dialogOnly && !dialogs.length) return null; // chỉ tìm trong hộp thoại đang mở — không có thì thôi
  let roots = opts.inDialog && dialogs.length ? dialogs : [document];
  if (opts.nearText) {
    // Hàng thành viên chứa email: đi lên từ ô chữ có email tới khi gặp 1 khối có nút.
    const shown = (el) => el.getBoundingClientRect().height > 0 && !el.closest('input, textarea');
    const hit = [...document.querySelectorAll('body *')].find((el) => el.children.length === 0 && norm(el.textContent) === norm(opts.nearText) && shown(el))
      || [...document.querySelectorAll('body *')].find((el) => el.children.length === 0 && norm(el.textContent).includes(norm(opts.nearText)) && shown(el));
    if (!hit) return null;
    hit.scrollIntoView({ block: 'center' }); // danh sách dài: hàng có thể nằm ngoài màn hình
    let row = hit;
    for (let i = 0; i < 8 && row.parentElement; i++) {
      row = row.parentElement;
      if (row.querySelectorAll('button, [role=button], [aria-haspopup]').length) break;
    }
    roots = [row];
  }
  const sel = opts.input ? 'input, textarea, [contenteditable=true]' : 'button, [role=button], [role=menuitem], [role=option], a, [aria-haspopup]';
  for (const w of want) {
    for (const root of roots) {
      for (const el of root.querySelectorAll(sel)) {
        if (!visible(el) || el.disabled || el.getAttribute('aria-disabled') === 'true') continue;
        if (opts.input && (el.type === 'email' || el.getAttribute('inputmode') === 'email' || /@/.test(el.getAttribute('placeholder') || ''))) {
          const r = el.getBoundingClientRect();
          return { x: r.left + r.width / 2, y: r.top + r.height / 2, text: el.getAttribute('placeholder') || 'email' };
        }
        const texts = [el.textContent, el.getAttribute('aria-label'), el.getAttribute('title'), el.getAttribute('placeholder'), el.getAttribute('type') === 'email' ? 'email' : ''].map(norm);
        const ok = opts.input ? texts.some((t) => t && t.includes(w)) : texts.some((t) => t === w) || (w.length > 5 && texts.some((t) => t.startsWith(w)));
        if (ok) {
          const r = el.getBoundingClientRect();
          return { x: r.left + r.width / 2, y: r.top + r.height / 2, text: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 60) };
        }
      }
    }
    // Mục menu của Canva đôi khi là khối chữ thường (không phải nút): khớp CHÍNH XÁC chữ, đang nổi trên cùng → bấm vào đó.
    if (opts.leaf) {
      for (const root of roots) {
        for (const el of root.querySelectorAll('body *, *')) {
          if (el.children.length || norm(el.textContent) !== w || !visible(el) || el.closest('input, textarea')) continue;
          const r = el.getBoundingClientRect();
          return { x: r.left + r.width / 2, y: r.top + r.height / 2, text: el.textContent.trim().slice(0, 60) };
        }
      }
    }
    // Hàng thành viên: nút "…" thường chỉ có biểu tượng, không chữ → lấy nút cuối cùng của hàng.
    if (opts.nearText && opts.lastButton) {
      const btns = [...roots[0].querySelectorAll('button, [role=button], [aria-haspopup]')].filter(visible);
      const b = btns.at(-1);
      if (b) { const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, text: (b.getAttribute('aria-label') || '…').slice(0, 60) }; }
    }
  }
  return null;
}

// Chạy trong trang: ô vai trò ở cuối hàng của email này (vd. "Học sinh ▾" / "Student ▾") — mở menu Vai trò + Thao tác của hàng.
// Chỉ nhận ô nằm trong CHÍNH hàng chứa email (khối cao < 200px), không bao giờ bấm ô tick hay ảnh đại diện.
function rowRoleButton(email) {
  const norm = (x) => String(x || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const ROLE = /^(học sinh|giáo viên|thành viên|nhà thiết kế|student|teacher|member|designer)$/;
  const cell = [...document.querySelectorAll('main *, [role=main] *')].find((el) => el.children.length === 0 && norm(el.textContent) === norm(email)
    && el.getBoundingClientRect().height > 0 && !el.closest('input, textarea, [role=dialog]'));
  if (!cell) return null;
  cell.scrollIntoView({ block: 'center' });
  let row = cell;
  for (let i = 0; i < 10 && row.parentElement; i++) {
    row = row.parentElement;
    if (row.getBoundingClientRect().height > 200) return null;
    const role = [...row.querySelectorAll('*')].reverse().find((el) => ROLE.test(norm(el.textContent)) && el.getBoundingClientRect().height > 0
      && (el.matches('button, [role=button], [aria-haspopup], [role=combobox]') || el.closest('button, [role=button], [aria-haspopup], [role=combobox]')));
    if (role) {
      const btn = role.closest('button, [role=button], [aria-haspopup], [role=combobox]') || role;
      const r = btn.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, text: norm(btn.textContent) };
    }
  }
  return null;
}

// Chạy trong trang: bấm 1 mục của menu đang mở (role=menuitem) bằng chính phần tử đó — không bấm theo toạ độ, vì menu của Canva
// có thể nằm dưới hàng thành viên khác (bấm chuột sẽ trúng hàng của người khác). Ưu tiên khớp CHÍNH XÁC chữ; không có thì mục
// CUỐI CÙNG (phần "Thao tác" luôn ở cuối). Không bao giờ bấm một mục vai trò. → chữ của mục đã bấm | null
function clickMenuItem(labels) {
  const norm = (x) => String(x || '').normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();
  const ROLE = /^(quản trị viên|giáo viên|học sinh|thành viên|nhà thiết kế|admin|administrator|teacher|student|member|designer|owner|chủ sở hữu)/;
  const items = [...document.querySelectorAll('[role=menuitem], [role=menuitemradio], [role=menuitemcheckbox]')].filter((el) => el.getBoundingClientRect().height > 0);
  if (!items.length) return null;
  const want = labels.map(norm);
  let el = items.find((x) => want.includes(norm(x.innerText || x.textContent)));
  if (!el) {
    const last = items.at(-1);
    const t = norm(last.innerText || last.textContent);
    if (ROLE.test(t) || /gửi lại|resend/.test(t)) return null; // mục cuối phải là thao tác xoá / huỷ, không phải vai trò hay "Gửi lại"
    el = last;
  }
  el.click();
  return norm(el.innerText || el.textContent).slice(0, 60);
}

// Chạy trong trang: mục CUỐI CÙNG của menu đang mở (phần "Thao tác"). Không bao giờ trả về một mục vai trò.
function lastMenuAction() {
  const norm = (x) => String(x || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const ROLE = /^(quản trị viên|giáo viên|học sinh|thành viên|nhà thiết kế|admin|administrator|teacher|student|member|designer|owner|chủ sở hữu)/;
  const onTop = (el) => { const r = el.getBoundingClientRect(); if (r.height < 2) return false; const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return t && (t === el || el.contains(t) || t.contains(el)); };
  // Hộp menu đang mở: khối nổi chứa tiêu đề "Thao tác" / "Actions".
  const head = [...document.querySelectorAll('body *')].find((el) => el.children.length === 0 && /^(thao tác|actions)$/.test(norm(el.textContent)) && onTop(el));
  if (!head) return null;
  let box = head;
  for (let i = 0; i < 6 && box.parentElement; i++) { box = box.parentElement; if (box.getBoundingClientRect().height > 120) break; }
  const leaves = [...box.querySelectorAll('*')].filter((el) => el.children.length === 0 && norm(el.textContent) && onTop(el));
  const after = leaves.slice(leaves.indexOf(head) + 1);
  const last = after.at(-1);
  if (!last || ROLE.test(norm(last.textContent))) return null;
  const r = last.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, text: last.textContent.trim().slice(0, 60) };
}

const pageText = (p) => p.eval(() => document.body.innerText.toLowerCase());

/**
 * Tìm 1 email trong danh sách thành viên bằng ô tìm kiếm của Canva (danh sách dài chỉ hiện dần khi cuộn).
 * → null (không có) | {status: 'member' | 'invited', role, text}
 */
async function findMember(p, email) {
  // Tìm trong 1 hàng của danh sách đang hiện: ô chữ đúng bằng email → đi lên tới hàng (khối có nút).
  const scan = () => p.eval((e) => {
    const norm = (x) => String(x || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const cell = [...document.querySelectorAll('main *, [role=main] *')].find((el) => el.children.length === 0 && norm(el.textContent) === e
      && !el.closest('input, [role=dialog]') && el.getBoundingClientRect().height > 0);
    if (!cell) return null;
    let row = cell;
    for (let i = 0; i < 8 && row.parentElement; i++) { row = row.parentElement; if (row.querySelector('button, [role=button], [aria-haspopup]')) break; }
    const text = norm(row.innerText);
    const buttons = [...row.querySelectorAll('button, [role=button], [aria-haspopup], [role=combobox]')]
      .map((b) => norm(b.getAttribute('aria-label') || b.textContent || b.getAttribute('title') || '?'));
    return { status: /đã mời|invited|pending|chờ/.test(text) ? 'invited' : 'member', text: text.slice(0, 160), buttons };
  }, email.toLowerCase());
  // 1) Danh sách đầy đủ (không lọc): lời mời đang chờ chỉ có ở đây — ô tìm kiếm của Canva không tìm ra người "Đã mời".
  // Chờ danh sách tải xong (có ít nhất 1 email trong bảng), rồi mới tìm.
  for (let t = 0; t < 15_000; t += 500) {
    if (await p.eval(() => /@[\w-]+\./.test(document.querySelector('main, [role=main]')?.innerText || ''))) break;
    await sleep(500);
  }
  await sleep(800);
  const direct = await scan();
  if (direct) return direct;
  // 2) Ô tìm kiếm: cho thành viên đã vào nhóm nằm sâu trong danh sách dài.
  const box = await waitFind(p, NHAN.search, { input: true }, 8000);
  if (!box) throw new CanvaError(`Không thấy ô tìm kiếm thành viên. Ảnh: ${await p.shot('khong-thay-tim-kiem')}`);
  await p.click(box.x, box.y);
  await p.eval(() => { const el = document.activeElement; if (el && 'value' in el) el.select?.(); });
  await p.type(email);
  await sleep(2500);
  return scan();
}

async function waitFind(p, labels, opts = {}, ms = 10_000) {
  for (let t = 0; t < ms; t += 400) {
    const r = await p.eval(findInPage, labels, opts);
    if (r) return r;
    await sleep(400);
  }
  return null;
}

class CanvaError extends Error { constructor(msg, { retry = true } = {}) { super(msg); this.retry = retry; } }

async function openPeople(p) {
  await p.goto(PEOPLE_URL);
  await waitFind(p, NHAN.invite, {}, 25_000); // Canva vẽ trang chậm: chờ tới khi thấy nút mời
  const url = await p.eval(() => location.href);
  if (/\/login|\/signup/.test(url) || (await p.eval(findInPage, NHAN.loggedOut, {})) && !(await p.eval(findInPage, NHAN.invite, {}))) {
    throw new CanvaError(`Cửa sổ Chrome của bot chưa đăng nhập Canva. Chạy: npm run canva-bot -- ${TEAM ? `--nhom ${TEAM} ` : ''}--login`, { retry: false });
  }
}

/** Ghi lại các lệnh POST Canva gửi trong lúc bot thao tác → ~/.tbq-canva-bot/api-<việc>.json (để chuyển sang gọi API trực tiếp). */
async function recordApi(p, name, fn) {
  await p.send('Network.enable');
  p.requests = [];
  try { return await fn(); } finally {
    const file = join(HOME, `api-${name}.json`);
    writeFileSync(file, JSON.stringify(p.requests, null, 1));
    log(`  (đã ghi ${p.requests.length} lệnh mạng của Canva vào ${file})`);
    p.requests = null;
  }
}

async function inviteEmail(p, email) {
  await openPeople(p);
  const had = await findMember(p, email);
  if (had) { log(`  ${email} đã ${had.status === 'invited' ? 'được mời (chờ chấp nhận)' : 'là thành viên'} → coi như xong`); return; }
  await openPeople(p);
  const btn = await waitFind(p, NHAN.invite);
  if (!btn) throw new CanvaError(`Không thấy nút mời (${NHAN.invite[0]}). Ảnh: ${await p.shot('khong-thay-nut-moi')}`);
  await p.click(btn.x, btn.y);
  await sleep(1500); // chờ hộp mời trượt lên xong (bấm lúc đang trượt sẽ hụt)
  const input = await waitFind(p, NHAN.emailInput, { input: true, inDialog: true });
  if (!input) throw new CanvaError(`Không thấy ô nhập email trong hộp mời. Ảnh: ${await p.shot('khong-thay-o-email')}`);
  await p.click(input.x, input.y);
  // Đặt con trỏ thẳng vào ô email đầu tiên của hộp mời (phòng khi cú bấm hụt), rồi gõ như bàn phím.
  await p.eval((labels) => {
    const d = document.querySelector('[role=dialog],[aria-modal=true]') || document;
    const el = [...d.querySelectorAll('input')].find((i) => labels.some((l) => `${i.placeholder} ${i.getAttribute('aria-label')}`.toLowerCase().includes(l.toLowerCase())));
    el?.focus();
  }, NHAN.emailInput);
  await p.type(email);
  // KHÔNG bấm Enter (Canva thêm 1 dòng email trùng) và KHÔNG đổi ô vai trò — giữ "Học sinh" như Canva đặt sẵn.
  await sleep(1200);
  const typed = await p.eval(() => document.activeElement?.value || '');
  if (typed.trim().toLowerCase() !== email.toLowerCase()) {
    throw new CanvaError(`Gõ email vào ô mời không được (ô đang có "${typed.slice(0, 60)}"). Ảnh: ${await p.shot('go-email-loi')}`);
  }
  const send = await waitFind(p, NHAN.send, { inDialog: true });
  if (!send) throw new CanvaError(`Không thấy nút gửi lời mời. Ảnh: ${await p.shot('khong-thay-nut-gui')}`);
  await recordApi(p, 'moi', async () => { await p.click(send.x, send.y); await sleep(3000); });
  // Kiểm tra: tải lại trang Thành viên, email phải xuất hiện (thành viên hoặc lời mời đang chờ).
  for (let i = 0; i < 3; i++) {
    await sleep(2500);
    await openPeople(p);
    if (await findMember(p, email)) return;
  }
  throw new CanvaError(`Đã bấm gửi nhưng không thấy ${email} trong danh sách (có thể nhóm hết ghế). Ảnh: ${await p.shot('moi-khong-thay')}`);
}

async function removeEmail(p, email) {
  await openPeople(p);
  const m = await findMember(p, email);
  if (!m) { log(`  ${email} không còn trong nhóm → coi như xong`); return; }
  // Lá chắn: bot chỉ gỡ khách. Không bao giờ gỡ chủ nhóm / quản trị / giáo viên (người thật của nhóm), dù TBQ có gửi nhầm.
  if (email.toLowerCase() === TEAM || /chủ sở hữu|owner|quản trị|admin|giáo viên|teacher/.test(m.text)) {
    throw new CanvaError(`${email} là chủ nhóm / quản trị / giáo viên — bot không gỡ. Kiểm tra lại việc này trong trang quản trị TBQ.`, { retry: false });
  }
  // Danh sách đang lọc theo email (ô tìm kiếm) → hàng của khách đang hiện, bấm nút tuỳ chọn của đúng hàng đó.
  const menu = await p.eval(rowRoleButton, email);
  if (!menu) throw new CanvaError(`Không thấy ô vai trò ở hàng ${email}. Ảnh: ${await p.shot('khong-thay-menu')}`);
  await sleep(500);
  const at = (await p.eval(rowRoleButton, email)) || menu; // toạ độ sau khi cuộn xong
  await p.click(at.x, at.y);
  const labels = m.status === 'invited' ? NHAN.revoke : NHAN.remove;
  await recordApi(p, 'go', async () => {
    let picked = null;
    for (let t = 0; t < 5000 && !picked; t += 400) { picked = await p.eval(clickMenuItem, labels); if (!picked) await sleep(400); }
    if (!picked) throw new CanvaError(`Không thấy mục xoá / huỷ thư mời trong menu. Ảnh: ${await p.shot('khong-thay-xoa')}`);
    log(`  bấm "${picked}"`);
    // Hộp xác nhận (nếu Canva hỏi lại): bấm thẳng nút có chữ khớp chính xác, chỉ trong hộp thoại; không bao giờ "Hủy"/"Cancel" trơn.
    for (let t = 0; t < 4000; t += 400) {
      const c = await p.eval((labels) => {
        const norm = (x) => String(x || '').normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();
        const d = [...document.querySelectorAll('[role=dialog], [role=alertdialog], [aria-modal=true]')].filter((x) => x.getBoundingClientRect().height > 0).at(-1);
        if (!d) return null;
        const b = [...d.querySelectorAll('button')].find((x) => labels.map(norm).includes(norm(x.innerText)) && !/^(hủy|huỷ|cancel)$/.test(norm(x.innerText)));
        if (!b) return null;
        b.click();
        return norm(b.innerText);
      }, NHAN.confirm);
      if (c) { log(`  xác nhận "${c}"`); break; }
      await sleep(400);
    }
    await sleep(3000);
  });
  for (let i = 0; i < 3; i++) {
    await sleep(2500);
    await openPeople(p);
    if (!(await findMember(p, email))) return;
  }
  throw new CanvaError(`Đã bấm xoá nhưng ${email} vẫn còn trong danh sách. Ảnh: ${await p.shot('go-van-con')}`);
}

// ---------- TBQ ----------

async function tbq(path, body = {}) {
  const r = await fetch(`${TBQ_URL}/worker/${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ worker: WORKER, account: TEAM, ...body }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`TBQ trả ${r.status}: ${j.message || ''}`);
  return j;
}

async function loop(p) {
  if (!TBQ_URL || !TOKEN) { console.error('Thiếu TBQ_URL hoặc WORKER_TOKEN (đặt trong .env).'); process.exit(1); }
  log(`Bot Canva chạy cho nhóm ${TEAM || '(nhóm đang đăng nhập)'} → ${TBQ_URL}. Để máy không ngủ và đừng đóng cửa sổ Chrome của bot.`);
  let lastBeat = 0;
  for (;;) {
    try {
      if (Date.now() - lastBeat > 60_000) { await tbq('heartbeat'); lastBeat = Date.now(); }
      const { task } = await tbq('tasks/next');
      if (!task) { await sleep(15_000); continue; }
      log(`Việc #${task.id}: ${task.kind === 'invite_member' ? 'mời' : 'gỡ'} ${task.email} (lần ${task.attempt})`);
      try {
        if (task.kind === 'invite_member') await inviteEmail(p, task.email);
        else await removeEmail(p, task.email);
        const r = await tbq(`tasks/${task.id}/done`);
        log(`  ✓ xong — ${r.message || ''}`);
      } catch (err) {
        log(`  ✗ ${err.message}`);
        await tbq(`tasks/${task.id}/fail`, { error: err.message, retry: err.retry !== false });
        await sleep(5000);
      }
    } catch (err) {
      log(`Lỗi kết nối: ${err.message} — thử lại sau 30 giây`);
      await sleep(30_000);
    }
  }
}

// ---------- Chạy ----------
await startChrome();
const p = await Page.open();
// Lệnh chạy 1 lần xong thì đóng hẳn Chrome của bot (kể cả cửa sổ còn sót từ lần trước) để lần sau không bị treo.
const finish = async (code = 0) => { try { await Promise.race([p.send('Browser.close'), sleep(3000)]); } catch { /* đã đóng */ } chrome?.kill(); process.exit(code); };
process.on('SIGINT', () => finish(0));
process.on('unhandledRejection', (err) => { console.error(`✗ ${err?.message || err}`); finish(1); });

if (flag('--login')) {
  await p.goto('https://www.canva.com/login');
  log(`Đăng nhập Canva bằng tài khoản CHỦ NHÓM trong cửa sổ Chrome vừa mở. Xong thì bấm Ctrl+C ở đây (bot nhớ đăng nhập).`);
  await new Promise(() => {});
} else if (flag('--kiem')) {
  await openPeople(p).catch((e) => { console.error(e.message); process.exit(1); });
  const found = {};
  found.invite = await waitFind(p, NHAN.invite, {}, 25_000);
  // In chữ mọi nút đang thấy → để chỉnh danh sách NHAN khi Canva đổi giao diện.
  const buttons = await p.eval(() => [...document.querySelectorAll('button, [role=button], a[href]')]
    .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 2 && r.height > 2; })
    .map((el) => (el.textContent || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 80));
  console.log(`  Địa chỉ đang mở: ${await p.eval(() => location.href)}`);
  console.log(`  Các nút thấy trên trang: ${buttons.map((b) => `"${b.slice(0, 40)}"`).join(', ')}`);
  console.log(`Trang Thành viên: ${PEOPLE_URL}`);
  console.log(`  Nút mời: ${found.invite ? `✓ "${found.invite.text}"` : '✗ không thấy'}`);
  const btn = found.invite;
  if (btn) {
    await p.click(btn.x, btn.y);
    const input = await waitFind(p, NHAN.emailInput, { input: true, inDialog: true }, 6000);
    const send = await waitFind(p, NHAN.send, { inDialog: true }, 3000);
    console.log(`  Ô nhập email: ${input ? '✓' : '✗ không thấy'}   Nút gửi: ${send ? `✓ "${send.text}"` : '✗ không thấy (có thể chỉ hiện sau khi nhập email)'}`);
    await p.key('Escape', 'Escape', 27);
  }
  console.log(`  Ảnh trang: ${await p.shot('kiem')}`);
  await finish(found.invite ? 0 : 1);
} else if (flag('--soi')) {
  // Gỡ lỗi: mở hộp mời rồi in mọi ô nhập đang thấy (loại, chữ gợi ý, vị trí, có bị che không).
  await openPeople(p);
  const btn = await waitFind(p, NHAN.invite, {}, 20_000);
  await p.click(btn.x, btn.y);
  await sleep(2500);
  console.log(JSON.stringify(await p.eval(() => [...document.querySelectorAll('input, textarea, [contenteditable]')].map((el) => {
    const r = el.getBoundingClientRect();
    const top = r.width ? document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) : null;
    return { tag: el.tagName, type: el.type, ph: el.getAttribute('placeholder'), aria: el.getAttribute('aria-label'), x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), w: Math.round(r.width),
      topIs: top === el ? 'chính nó' : top ? `${top.tagName}.${String(top.className).slice(0, 40)}` : null, inDialog: !!el.closest('[role=dialog],[aria-modal=true]') };
  }).filter((x) => x.w > 0)), null, 1));
  console.log('dialogs:', await p.eval(() => [...document.querySelectorAll('[role=dialog],[aria-modal=true]')].length));
  await finish(process.exitCode || 0);
} else if (flag('--ds')) {
  // Gỡ lỗi: in chữ của danh sách thành viên (không lọc) + trang chủ (mục lời mời đang chờ).
  await openPeople(p);
  await sleep(2000);
  console.log((await p.eval(() => document.querySelector('main')?.innerText || document.body.innerText)).slice(0, 2500));
  await p.goto('https://www.canva.com/');
  await sleep(4000);
  const home = await p.eval(() => document.body.innerText);
  const i = home.search(/Phê duyệt|lời mời|invitation/i);
  console.log('--- Trang chủ ---\n' + (i >= 0 ? home.slice(Math.max(0, i - 50), i + 800) : '(không có mục lời mời)'));
  await finish(process.exitCode || 0);
} else if (opt('--xem-menu')) {
  // Gỡ lỗi: mở menu ở hàng của email (nút cuối của hàng), in các mục, rồi ESC — KHÔNG chọn gì.
  const email = String(opt('--xem-menu')).toLowerCase();
  await openPeople(p);
  const m = await findMember(p, email);
  if (!m) { console.log('không thấy hàng'); await finish(1); }
  const menu = await p.eval(rowRoleButton, email);
  if (!menu) { console.log('không thấy ô vai trò ở hàng'); await finish(1); }
  await sleep(500);
  const again = await p.eval(rowRoleButton, email); // toạ độ sau khi cuộn xong
  await p.click(again.x, again.y);
  await sleep(1500);
  console.log('Đã mở:', menu.text);
  console.log(JSON.stringify(await p.eval(() => [...document.querySelectorAll('[role=menuitem], [role=option], [role=menu] *, [role=listbox] *, [role=dialog] button')]
    .filter((el) => el.getBoundingClientRect().height > 0 && el.children.length === 0).map((el) => el.textContent.trim()).filter(Boolean))));
  console.log('Soi:', JSON.stringify(await p.eval(() => {
    const els = [...document.querySelectorAll('[role=menuitem], [role=option], [role=menu] *, [role=listbox] *, [role=dialog] button')]
      .filter((el) => el.getBoundingClientRect().height > 0 && el.children.length === 0 && el.textContent.trim());
    const el = els.at(-1);
    if (!el) return null;
    const r = el.getBoundingClientRect(); const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    const host = el.closest('[role]');
    return { text: el.textContent, codes: [...el.textContent].map((c) => c.codePointAt(0).toString(16)).join(' '), tag: el.tagName, hostRole: host?.getAttribute('role'), hostTag: host?.tagName,
      rect: [r.left, r.top, r.width, r.height].map(Math.round), top: t ? `${t.tagName} ${t === el ? 'chính nó' : t.contains(el) ? 'cha' : el.contains(t) ? 'con' : 'KHÁC: ' + String(t.textContent).slice(0, 40)}` : null };
  })));
  console.log('Mục bot sẽ bấm:', await p.eval((labels) => {
    const norm = (x) => String(x || '').normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();
    const items = [...document.querySelectorAll('[role=menuitem]')].filter((el) => el.getBoundingClientRect().height > 0);
    return (items.find((x) => labels.map(norm).includes(norm(x.innerText))) || items.at(-1))?.innerText;
  }, m.status === 'invited' ? NHAN.revoke : NHAN.remove));
  console.log(`Ảnh: ${await p.shot('xem-menu')}`);
  await p.key('Escape', 'Escape', 27);
  await finish(0);
} else if (opt('--tim')) {
  await openPeople(p);
  const email = String(opt('--tim')).toLowerCase();
  const m = await findMember(p, email);
  console.log(m ? `${email}: ${m.status === 'invited' ? 'đã mời, chờ chấp nhận' : 'thành viên'} — "${m.text}" · nút: ${JSON.stringify(m.buttons)}` : `${email}: không có trong nhóm`);
  const me = await p.eval(() => document.body.innerText.match(/[\w.+-]+@[\w-]+\.[\w.]+/g)?.slice(0, 3));
  console.log(`Ảnh: ${await p.shot('tim')}`);
  await finish(process.exitCode || 0);
} else if (opt('--thu-moi') || opt('--thu-go')) {
  const email = String(opt('--thu-moi') || opt('--thu-go')).toLowerCase();
  try {
    if (opt('--thu-moi')) await inviteEmail(p, email); else await removeEmail(p, email);
    console.log(`✓ Đã ${opt('--thu-moi') ? 'mời' : 'gỡ'} ${email}`);
  } catch (err) { console.error(`✗ ${err.message}`); process.exitCode = 1; }
  await finish(process.exitCode || 0);
} else {
  await loop(p);
}
