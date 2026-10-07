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
    e.currentTarget.textContent = '🔔 Đã bật âm báo';
    beep();
  });

  async function post(url, body) {
    const r = await fetch(BASE + url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-csrf': csrf }, body: JSON.stringify(body || {}), credentials: 'same-origin' });
    let j = null;
    try { j = await r.json(); } catch { /* bỏ qua */ }
    if (r.status === 401) location.href = `${BASE}/admin/login?next=${encodeURIComponent(location.pathname.slice(BASE.length) + location.search)}`;
    return j || { ok: false, message: 'Lỗi mạng' };
  }

  function renderTasks(list) {
    elT.replaceChildren(...(list.length ? list.map((k) => el('div', { class: 'acard' },
      el('div', { class: 'acard-head' }, el('b', {}, k.kindText), ` · ${k.tool} · `, el('code', {}, k.email),
        el('span', { class: 'muted' }, ` · ${k.reason} · ${k.createdText}${k.phoneMasked ? ' · khách ' + k.phoneMasked : ''}`)),
      k.detail ? el('p', {}, 'Chi tiết: ', el('code', {}, k.detail)) : null,
      taskForm(k))) : [el('p', { class: 'muted' }, 'Không có việc tay nào.')]));
  }

  // Đổi mật khẩu: dán mật khẩu mới (bắt buộc với tài khoản không có 2FA); ChatGPT (2FA) được tick "giữ mật khẩu cũ".
  function taskForm(k) {
    const pw = k.kind === 'rotate' && (k.loginType === 'password' || k.loginType === 'password_totp');
    const input = pw ? el('input', { placeholder: 'Mật khẩu mới vừa đổi bên hãng', autocomplete: 'off' }) : null;
    const totpIn = pw && k.loginType === 'password_totp' ? el('input', { placeholder: 'Khoá 2FA mới (chỉ khi đổi 2FA)', autocomplete: 'off' }) : null;
    // Bị cách ly (mật khẩu / 2FA bị người ngoài đổi): không có lựa chọn giữ mật khẩu cũ.
    const keep = pw && k.loginType === 'password_totp' && k.reasonCode !== 'quarantine' ? el('input', { type: 'checkbox' }) : null;
    const msg = el('span', { class: 'muted' });
    return el('div', { class: 'row' }, input, totpIn, keep ? el('label', { class: 'muted' }, keep, ' Giữ mật khẩu cũ — chỉ đăng xuất mọi thiết bị') : null,
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

  // Kho hôm nay: đỏ = không giao được nữa (hết kho hoặc hết lượt / ngày), vàng = còn ≤ 3.
  function renderStock(list) {
    if (!elS) return;
    elS.replaceChildren(el('div', { class: 'stock-row' }, ...list.map((x) => el('a', {
      class: `stock ${x.free <= 0 ? 'red' : x.free <= 3 ? 'yellow' : ''}`, href: `${BASE}/admin/tools/${x.id}`,
    }, el('b', {}, x.name), el('span', {}, `Hôm nay ${x.today}${x.cap != null ? `/${x.cap}` : ''}`),
      el('span', {}, x.free <= 0 ? (x.cap != null && x.today >= x.cap ? 'Hết lượt hôm nay' : 'Hết kho') : `Còn ${x.free}`),
      x.reserved ? el('span', { class: 'muted' }, `+${x.reserved} dự phòng 6h`) : '',
      x.expiring ? el('span', { class: 'warn-text' }, `${x.expiring} tài khoản hết hạn trong 24 giờ`) : ''))));
  }

  function renderAlerts(list) {
    elE.replaceChildren(...(list.length ? list.map((e) => el('div', { class: `alert-item ${e.severity}` },
      el('span', { class: 'at' }, e.atText),
      el('span', {}, el('b', {}, e.label), e.phoneMasked ? ' · ' : '', e.phoneMasked && e.customerId ? el('a', { href: `${BASE}/admin/customers/${e.customerId}` }, e.phoneMasked) : '',
        e.account ? ` · ${e.account}` : '', e.cafe ? ` · ${e.cafe}` : '', e.summary ? ` — ${e.summary}` : '',
        e.hint ? el('div', { class: 'hint' }, `→ Nên làm: ${e.hint}`) : null))) : [el('p', { class: 'muted' }, 'Không có cảnh báo trong 2 giờ qua.')]));
  }

  async function refresh() {
    try {
      const r = await fetch(`${BASE}/admin/api/live`, { credentials: 'same-origin', cache: 'no-store' });
      if (r.status === 401) { location.href = `${BASE}/admin/login?next=${encodeURIComponent(location.pathname.slice(BASE.length) + location.search)}`; return; }
      const j = await r.json();
      // Chỉ vẽ lại việc tay khi danh sách đổi: đang gõ mật khẩu mới thì ô nhập không bị xoá mỗi 10 giây.
      const sig = j.tasks.map((k) => k.id).join(',');
      if (sig !== taskSig) { taskSig = sig; renderTasks(j.tasks); }
      renderAlerts(j.alerts);
      renderStock(j.stock || []);
      document.querySelector('[data-count=tasks]').textContent = j.tasks.length ? `(${j.tasks.length})` : '';
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
})();
