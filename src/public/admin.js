// JS trang quản trị: hỏi lại trước thao tác nguy hiểm; trang trực duyệt tự làm mới + âm báo.
(() => {
  'use strict';
  // Tiền tố khi Tiệm chạy dưới thư mục con (vd. /colap): đọc từ chính đường dẫn file này (…/static/admin.js).
  const BASE = new URL(document.currentScript.src).pathname.replace(/\/static\/[^/]*$/, '');
  const $ = (s, el = document) => el.querySelector(s);
  const csrf = document.body.dataset.csrf;

  document.addEventListener('submit', (e) => {
    const msg = e.target.dataset?.confirm;
    if (msg && !window.confirm(msg)) e.preventDefault();
  });

  if (!document.body.dataset.live) return;

  const elT = $('#live-tasks');
  const elE = $('#live-alerts');
  const elS = $('#live-stock');
  const status = $('[data-live-status]');
  const seen = { alerts: new Set() };
  let first = true;
  let taskSig = null;
  let audio = null;
  let soundOn = false;

  // Dựng phần tử bằng DOM (textContent) để không bao giờ chèn HTML từ dữ liệu.
  function el(tag, attrs = {}, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') n.className = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    }
    for (const k of kids.flat()) if (k != null && k !== false) n.append(k.nodeType ? k : document.createTextNode(String(k)));
    return n;
  }

  function beep() {
    if (!soundOn || !audio) return;
    try {
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.25, audio.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.6);
      o.connect(g).connect(audio.destination);
      o.start();
      o.stop(audio.currentTime + 0.6);
    } catch { /* bỏ qua */ }
  }
  function notify(title, body) {
    try { if (window.Notification && Notification.permission === 'granted') new Notification(title, { body, tag: title }); } catch { /* bỏ qua */ }
  }
  $('[data-act=enable-sound]').addEventListener('click', async (e) => {
    try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); await audio.resume(); } catch { /* bỏ qua */ }
    soundOn = true;
    try { if (window.Notification && Notification.permission === 'default') await Notification.requestPermission(); } catch { /* bỏ qua */ }
    e.currentTarget.textContent = 'Đã bật âm báo';
    e.currentTarget.classList.add('on');
    beep();
  });

  async function post(url, body) {
    const r = await fetch(BASE + url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-csrf': csrf }, body: JSON.stringify(body || {}), credentials: 'same-origin' });
    let j = null;
    try { j = await r.json(); } catch { /* bỏ qua */ }
    if (r.status === 401) location.href = `${BASE}/admin/login?next=${encodeURIComponent(location.pathname.slice(BASE.length) + location.search)}`;
    return j || { ok: false, message: 'Lỗi mạng' };
  }

  const badge = (text, kind = '') => el('span', { class: `badge ${kind}` }, text);
  const link = (href, ...kids) => el('a', { href: BASE + href }, ...kids);

  function renderTasks(list) {
    elT.replaceChildren(...(list.length ? list.map((k) => el('div', { class: 'task', id: `task-${k.id}` },
      el('div', { class: 'task-h' }, badge(k.title || k.kindText, k.kind === 'rotate' && !k.setup ? 'yellow' : 'info'), ' ',
        el('b', {}, k.toolId ? link(`/admin/tools/${k.toolId}`, k.tool) : k.tool), ' ',
        el('a', { class: 'acc', href: `${BASE}/admin/accounts/${k.accountId}` }, el('code', {}, k.email)),
        k.bot ? ' ' : null, k.bot ? badge(k.bot[0], k.bot[1]) : null),
      el('div', { class: 'task-m' }, `${k.reason} · ${k.createdText}`, k.phoneMasked ? ' · khách ' : '',
        k.phoneMasked ? (k.customerId ? link(`/admin/customers/${k.customerId}`, k.phoneMasked) : k.phoneMasked) : ''),
      k.detail ? el('p', {}, k.kind === 'invite_member' ? 'Mời email: ' : k.kind === 'remove_member' ? 'Gỡ email: ' : 'Ghi chú: ', el('code', {}, k.detail)) : null,
      k.howTo ? el('p', { class: 'how' }, k.howTo) : null,
      k.kept ? el('p', {}, badge('Giữ lại', 'ok'), ' ', k.kept) : null,
      k.lastError ? el('p', { class: 'red-text' }, k.lastError) : null,
      k.canCode ? codeRow(k) : null,
      k.busy ? el('p', { class: 'warn' }, `Còn ${k.busy} khách đang dùng tài khoản này (tới ${k.busyUntilText}) — đổi mật khẩu / đăng xuất bây giờ sẽ đá họ ra. Nên đợi họ hết giờ rồi làm.`) : null,
      k.drop ? dropButton(k) : null,
      taskForm(k))) : [el('p', { class: 'empty' }, '✓ Không có việc tay nào.')]));
  }

  // Tài khoản đăng nhập bằng mã qua email: chủ bấm "Lấy mã đăng nhập" → mã về trong 10 phút hiện ngay ở đây (không báo mồ côi).
  function codeRow(k) {
    const msg = el('span', { class: 'muted' });
    return el('p', { class: 'owner-code' },
      k.code ? ['Mã đăng nhập: ', el('code', { class: 'big-code' }, k.code.value), ' ', el('small', { class: 'muted' }, `về lúc ${k.code.atText}`), ' ']
        : k.codeOpen ? [el('span', { class: 'muted' }, 'Đang chờ mã về hộp thư kho…'), ' '] : null,
      el('button', {
        class: 'btn-mini',
        onclick: async (ev) => {
          const b = ev.currentTarget;
          b.disabled = true;
          const r = await post(`/admin/api/tasks/${k.id}/code`, {});
          msg.textContent = r.message || '';
          if (r.ok) refresh(); else b.disabled = false;
        },
      }, k.codeOpen ? 'Chờ thêm 10 phút' : 'Lấy mã đăng nhập'), ' ', msg);
  }

  // Việc đổi mật khẩu của tài khoản đã ngừng dùng / quá hạn: bỏ được (máy chủ kiểm lại điều kiện).
  function dropButton(k) {
    const msg = el('span', { class: 'red-text' });
    return el('p', {}, el('button', {
      class: 'btn-mini',
      onclick: async (ev) => {
        if (!confirm('Bỏ việc đổi mật khẩu này?')) return;
        const b = ev.currentTarget;
        b.disabled = true;
        const r = await post(`/admin/api/tasks/${k.id}/cancel`, {});
        if (r.ok) { refresh(); return; }
        b.disabled = false;
        msg.textContent = r.message || 'Chưa bỏ được.';
      },
    }, k.drop), ' ', msg);
  }

  // Đổi mật khẩu: dán mật khẩu mới (bắt buộc với tài khoản không có 2FA); ChatGPT (2FA) được tick "giữ mật khẩu cũ".
  function taskForm(k) {
    const pw = k.kind === 'rotate' && (k.loginType === 'password' || k.loginType === 'password_totp');
    const input = pw ? el('input', { placeholder: 'Mật khẩu mới vừa đổi bên hãng', autocomplete: 'off' }) : null;
    const totpIn = pw && k.loginType === 'password_totp' ? el('input', { placeholder: 'Khoá 2FA mới (chỉ khi đổi 2FA)', autocomplete: 'off' }) : null;
    // Bị cách ly (mật khẩu / 2FA bị người ngoài đổi): không có lựa chọn giữ mật khẩu cũ.
    const keep = pw && k.loginType === 'password_totp' && k.reasonCode !== 'quarantine' ? el('input', { type: 'checkbox' }) : null;
    const msg = el('span', { class: 'red-text' });
    return el('div', { class: 'row' }, input, totpIn, keep ? el('label', { class: 'check muted' }, keep, ' Giữ mật khẩu cũ — chỉ đăng xuất mọi thiết bị') : null,
      el('button', {
        class: 'btn-mini ok',
        onclick: async (ev) => {
          const b = ev.currentTarget;
          b.disabled = true;
          const r = await post(`/admin/api/tasks/${k.id}/done`, { newPassword: input ? input.value.trim() : '', keepPassword: !!keep?.checked, newTotp: totpIn ? totpIn.value.trim() : '' });
          if (r.ok) { refresh(); return; }
          b.disabled = false;
          msg.textContent = r.message || 'Chưa xong.';
        },
      }, 'Đã xong'), msg);
  }

  // Kho hôm nay: đỏ = không giao được nữa (hết kho hoặc hết lượt / ngày), vàng = còn ≤ 3. Bấm → kho tài khoản của món đó.
  // (Trang Tổng quan vẽ y hệt phía máy chủ: stockTiles trong routes/admin.js.)
  function renderStock(list) {
    if (!elS) return;
    elS.replaceChildren(list.length ? el('div', { class: 'stock-row' }, ...list.map((x) => el('a', {
      class: `stock ${x.free <= 0 ? 'red' : x.free <= 3 ? 'yellow' : ''}`, href: `${BASE}/admin/accounts?tool=${x.id}`,
    }, el('b', {}, x.name),
      el('span', { class: 'big' }, x.free <= 0 ? (x.cap != null && x.today >= x.cap ? 'Hết lượt' : 'Hết kho') : String(x.free)),
      el('span', { class: 'muted' }, `${x.free > 0 ? 'còn giao · ' : ''}hôm nay ${x.today}${x.cap != null ? `/${x.cap}` : ''}${x.reserved ? ` · +${x.reserved} dự phòng` : ''}`),
      x.expiring ? el('span', { class: 'warn-text' }, `${x.expiring} tài khoản hết hạn trong 24 giờ`) : '',
      x.waiting ? el('span', { class: 'warn-text' }, x.waiting) : '')))
      : el('p', { class: 'empty' }, 'Chưa bật món nào.'));
  }

  function renderAlerts(list) {
    elE.replaceChildren(list.length ? el('div', { class: 'alerts' }, ...list.map((e) => el('div', { class: `alert-item ${e.severity}` },
      el('span', { class: 'at' }, e.atText),
      el('div', {}, el('b', {}, e.label),
        e.phoneMasked ? ' · ' : '', e.phoneMasked ? (e.customerId ? link(`/admin/customers/${e.customerId}`, e.phoneMasked) : e.phoneMasked) : '',
        e.account ? ' · ' : '', e.account ? (e.accountId ? el('a', { class: 'acc', href: `${BASE}/admin/accounts/${e.accountId}` }, el('code', {}, e.account)) : e.account) : '',
        e.cafe ? ' · ' : '', e.cafe ? (e.cafeId ? link(`/admin/cafes/${e.cafeId}`, e.cafe) : e.cafe) : '',
        e.summary ? el('span', { class: 'muted' }, ` — ${e.summary}`) : '',
        e.hint ? el('div', { class: 'hint' }, `→ Nên làm: ${e.hint}`) : null))))
      : el('p', { class: 'empty' }, '✓ Không có cảnh báo trong 2 giờ qua.'));
  }

  async function refresh() {
    try {
      const r = await fetch(`${BASE}/admin/api/live`, { credentials: 'same-origin', cache: 'no-store' });
      if (r.status === 401) { location.href = `${BASE}/admin/login?next=${encodeURIComponent(location.pathname.slice(BASE.length) + location.search)}`; return; }
      const j = await r.json();
      // Chỉ vẽ lại việc tay khi danh sách đổi: đang gõ mật khẩu mới thì ô nhập không bị xoá mỗi 10 giây.
      const sig = j.tasks.map((k) => [k.id, k.bot?.[0], k.busy, k.drop, k.kept, k.lastError, k.codeOpen, k.code?.value].join(':')).join(',');
      if (sig !== taskSig) { taskSig = sig; renderTasks(j.tasks); }
      renderAlerts(j.alerts);
      renderStock(j.stock || []);
      const cnt = document.querySelector('[data-count=tasks]');
      cnt.textContent = String(j.tasks.length);
      cnt.hidden = !j.tasks.length;
      document.title = j.tasks.length ? `(${j.tasks.length}) Theo dõi` : 'Theo dõi — Quản trị TBQ';
      const newRed = j.alerts.filter((e) => e.severity === 'red' && !seen.alerts.has(e.id));
      j.alerts.forEach((e) => seen.alerts.add(e.id));
      if (!first && newRed.length) {
        beep();
        notify('Báo động đỏ', newRed[0].label);
      }
      first = false;
      status.textContent = `Cập nhật ${new Date().toLocaleTimeString('vi-VN')}`;
    } catch {
      status.textContent = 'Mất kết nối — đang thử lại…';
    }
  }
  refresh();
  setInterval(refresh, 10_000);
  // Điện thoại tạm dừng tab nền (khoá màn hình, chuyển app) → quay lại là cập nhật ngay, không đợi 10 giây.
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  window.addEventListener('pageshow', (e) => { if (e.persisted) refresh(); });
})();
