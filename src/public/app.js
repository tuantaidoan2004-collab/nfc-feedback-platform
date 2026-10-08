// JS phía khách (thiết kế v2 "Vé vào ca"): chọn món, bảng giữ chỗ (email → mã), nhận slot, đếm ngược, lấy mã, checklist. Không thư viện ngoài.
(() => {
  'use strict';
  // Tiền tố khi Tiệm chạy dưới thư mục con (vd. /colap): đọc từ chính đường dẫn file này (…/static/app.js).
  const BASE = new URL(document.currentScript.src).pathname.replace(/\/static\/[^/]*$/, '');
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const skew = (Number(document.body.dataset.now) || Date.now()) - Date.now();
  const serverNow = () => Date.now() + skew;

  // ---------- Mã máy: giữ trong localStorage để khôi phục khi cookie bị dọn ----------
  let did = null;
  try { did = localStorage.getItem('tbq_did'); } catch { /* chế độ riêng tư */ }
  let fp = null;
  const fpReady = (async () => {
    try {
      if (!window.crypto?.subtle) return;
      const parts = [navigator.userAgent, navigator.language, (navigator.languages || []).join(','), `${screen.width}x${screen.height}`,
        screen.colorDepth, window.devicePixelRatio, Intl.DateTimeFormat().resolvedOptions().timeZone,
        navigator.hardwareConcurrency, navigator.platform, navigator.maxTouchPoints].join('|');
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(parts));
      fp = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch { /* bỏ qua */ }
  })();

  async function api(path, body) {
    await fpReady;
    const headers = { Accept: 'application/json' };
    if (did) headers['x-device-hint'] = did;
    if (fp) headers['x-device-fp'] = fp;
    const opts = { method: body === undefined ? 'GET' : 'POST', headers, credentials: 'same-origin' };
    if (body !== undefined) { headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    let res;
    try { res = await fetch(BASE + path, opts); } catch { return { ok: false, message: 'Mất kết nối mạng. Bạn thử lại nhé.' }; }
    const id = res.headers.get('x-device-id');
    if (id) { did = id; try { localStorage.setItem('tbq_did', id); } catch { /* bỏ qua */ } }
    let j = null;
    try { j = await res.json(); } catch { /* không phải JSON */ }
    if (!j) j = { ok: false, message: 'Hệ thống đang bận, bạn thử lại sau ít phút nhé.' };
    if (res.status === 401) j.unauthorized = true;
    return j;
  }

  function say(el, text, kind = '') {
    const m = el.classList?.contains('msg') ? el : $('.msg', el);
    if (!m) return;
    m.textContent = text || '';
    m.className = `msg${kind ? ' ' + kind : ''}`;
  }
  const pad = (n) => String(n).padStart(2, '0');
  function fmt(ms, withHours) {
    const s = Math.max(0, Math.floor(ms / 1000));
    if (withHours && s >= 86400) {
      const d = Math.floor(s / 86400);
      return `${d} ngày ${fmt((s % 86400) * 1000, true)}`;
    }
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return withHours || h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
  }
  const buzz = () => { try { navigator.vibrate?.(200); } catch { /* bỏ qua */ } };

  // ---------- Sao chép ----------
  async function copy(text, btn) {
    try { await navigator.clipboard.writeText(text); } catch {
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch { /* bỏ qua */ }
      ta.remove();
    }
    if (btn) {
      const old = btn.dataset.label || (btn.dataset.label = btn.textContent);
      btn.textContent = 'Đã chép';
      btn.classList.add('ok');
      clearTimeout(btn.copyTimer);
      btn.copyTimer = setTimeout(() => { btn.textContent = old; btn.classList.remove('ok'); }, 1600);
    }
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-copy]');
    if (b) { e.preventDefault(); copy(b.dataset.copy, b); b.closest('.cp')?.classList.add('done'); }
  });

  // ---------- Mở app (chủ yêu cầu 08/10/2026: "bấm mở là qua app luôn", mọi món có app) ----------
  // data-app = scheme riêng (CapCut): iPhone mở scheme, Android intent:// kèm tên gói (chưa cài → Play Store).
  // data-app-link = link chính chủ (ChatGPT, Claude, Canva): iPhone mở link đó cùng thẻ → iOS tự bật app nếu đã cài;
  //   Android intent://…;scheme=https kèm tên gói, chưa cài thì Chrome quay về trang web (browser_fallback_url).
  // Máy tính / trình duyệt trong Zalo, Facebook (chặn mở app lạ): giữ link web, đổi chữ nút theo data-web-label; trong Zalo nhắc "Mở bằng trình duyệt".
  // data-copy-first: bấm mở là tự chép sẵn email; quay lại trang thì dòng cần làm tiếp sáng lên kèm lời nhắc (UI tâm lý).
  const ua = navigator.userAgent;
  const android = /Android/i.test(ua);
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const inApp = /; wv\)|FBAN|FBAV|Instagram|Zalo|Line\//i.test(ua) || (ios && !/Safari\//.test(ua));
  const canApp = (android || ios) && !inApp;
  $$('a[data-app], a[data-app-link]').forEach((a) => {
    if (!canApp) { a.textContent = a.dataset.webLabel || a.textContent; return; }
    if (ios && a.dataset.appLink) { a.href = a.dataset.appLink; a.removeAttribute('target'); }
  });
  if ((android || ios) && inApp) $$('[data-in-app]').forEach((p) => { p.hidden = false; });

  // Lời nhắc "Quay lại rồi nè" chỉ hiện khi khách đã thật sự rời trang (sang app / tab khác) rồi quay lại — không hiện chỉ vì bấm nút
  // (iPhone hỏi "Mở trong CapCut?" mà trang vẫn còn trước mặt). Chủ yêu cầu 08/10/2026.
  let opened = false;
  let away = false;
  const afterOpen = () => {
    if (!opened || !away) return;
    opened = false; away = false;
    const hint = $('[data-acc-next]');
    const target = $('[data-acc-target]');
    if (hint) hint.hidden = false;
    if (target) {
      target.classList.remove('nudge'); void target.offsetWidth; target.classList.add('nudge');
      target.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'center' });
    }
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { if (opened) away = true; } else setTimeout(afterOpen, 250);
  });
  window.addEventListener('pagehide', () => { if (opened) away = true; });
  window.addEventListener('pageshow', (e) => { if (e.persisted && opened) away = true; setTimeout(afterOpen, 250); });

  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-app], a[data-app-link], a[data-copy-first]');
    if (!a) return;
    if (a.dataset.copyFirst) {
      copy(a.dataset.copyFirst, $('[data-cp=email] [data-copy]'));
      $('[data-cp=email]')?.classList.add('done');
      const note = $('[data-acc-auto]');
      if (note) { note.textContent = '✓ Đã chép email'; note.classList.add('ok'); note.hidden = false; }
      opened = true; away = false;
    }
    if (!canApp || !(a.dataset.app || a.dataset.appLink)) return; // máy tính: mở trang web như link thường
    const pkg = a.dataset.appAndroid;
    if (a.dataset.app) {
      e.preventDefault();
      const [scheme, rest] = a.dataset.app.split('://');
      const go = () => { location.href = android ? `intent://${rest}#Intent;scheme=${scheme};package=${pkg};end` : a.dataset.app; };
      setTimeout(go, a.dataset.copyFirst ? 120 : 0); // chờ chép email xong
    } else if (android) {
      e.preventDefault();
      const u = new URL(a.dataset.appLink);
      const go = () => { location.href = `intent://${u.host}${u.pathname}#Intent;scheme=https;package=${pkg};S.browser_fallback_url=${encodeURIComponent(a.dataset.appLink)};end`; };
      setTimeout(go, a.dataset.copyFirst ? 120 : 0);
    } // iPhone + link chính chủ: để trình duyệt mở link (iOS tự bật app)
  });

  // ---------- Đăng xuất ----------
  $$('[data-act=logout]').forEach((b) => b.addEventListener('click', async () => {
    await api('/api/logout', {});
    location.reload();
  }));

  const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  // ---------- Khung không cuộn (ui.css .page): bàn phím iPhone có thể đẩy cả tài liệu lên; gõ xong kéo về chỗ cũ ----------
  const typing = () => document.activeElement?.matches?.('input, textarea, select, [contenteditable]');
  const settle = () => { if (!typing() && (window.scrollY || document.documentElement.scrollTop)) window.scrollTo(0, 0); };
  window.addEventListener('focusout', () => setTimeout(settle, 150));
  window.visualViewport?.addEventListener('resize', () => setTimeout(settle, 150));
  window.addEventListener('pageshow', settle);
  const store = (k, v) => { try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, JSON.stringify(v)); } catch { /* bỏ qua */ } };
  const load = (k) => { try { return JSON.parse(sessionStorage.getItem(k) || 'null'); } catch { return null; } };
  const isEmailLike = (v) => /^\S+@\S+\.\S+$/.test(v);

  // ---------- Chọn món (bước 1) ----------
  // Chọn ô → nút đáy thành "Nhận <món>". Chưa đăng nhập → mở bảng giữ chỗ (email → mã), xác nhận xong nhận luôn món đã chọn.
  const claimForm = $('#claim-form');
  const sel = () => claimForm && $('input[name=toolId]:checked', claimForm);
  const isInvite = () => sel()?.dataset.login === 'team_invite';
  const inviteEmail = () => (claimForm?.inviteEmail?.value || '').trim();

  async function claim(picked, email) {
    const r = await api('/api/claim', { toolId: Number(picked.value), inviteEmail: picked.dataset.login === 'team_invite' ? email : undefined });
    if (r.status === 'active' || r.status === 'pending_invite') { store('tbq-pick', null); location.href = `${BASE}/me`; return null; }
    return r;
  }

  if (claimForm) {
    const cta = $('[data-cta]', claimForm);
    claimForm.classList.add('js');
    const paint = () => {
      const s = sel();
      $$('.tile', claimForm).forEach((t) => t.classList.toggle('on', !!t.querySelector('input:checked')));
      claimForm.classList.toggle('canva', isInvite());
      if (s) $('[data-tool-name]', claimForm).textContent = s.dataset.name;
      if (cta) { cta.disabled = !s; cta.textContent = s ? `Nhận ${s.dataset.name}` : 'Chọn 1 món đã nè'; }
    };
    // Quay lại sau khi xác nhận mã (tải lại trang): chọn sẵn món cũ.
    const kept = load('tbq-pick');
    if (kept) {
      const r = $(`input[name=toolId][value="${CSS.escape(String(kept.toolId))}"]`, claimForm);
      if (r) r.checked = true;
      if (kept.inviteEmail) claimForm.inviteEmail.value = kept.inviteEmail;
    }
    const flash = load('tbq-msg');
    if (flash) { say(claimForm, flash, 'err'); store('tbq-msg', null); }
    paint();
    claimForm.addEventListener('change', (e) => {
      if (e.target.name !== 'toolId') return;
      say(claimForm, '');
      paint();
      if (isInvite()) setTimeout(() => claimForm.inviteEmail.focus(), 200);
    });
    claimForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const picked = sel();
      if (!picked) return;
      if (isInvite() && !isEmailLike(inviteEmail())) {
        claimForm.inviteEmail.classList.add('need');
        claimForm.inviteEmail.focus();
        say(claimForm, 'Bạn nhập email tài khoản để Tiệm gửi lời mời nhé.', 'err');
        return;
      }
      claimForm.inviteEmail.classList.remove('need');
      store('tbq-pick', { toolId: picked.value, inviteEmail: inviteEmail() });
      if (!claimForm.dataset.logged) { openSheet(picked); return; }
      cta.disabled = true;
      say(claimForm, 'Đang giữ chỗ cho bạn…');
      const r = await claim(picked, inviteEmail());
      cta.disabled = false;
      if (!r) return;
      if (r.unauthorized) { location.reload(); return; }
      say(claimForm, r.message || 'Chưa nhận được slot.', 'err');
    });
  }

  // ---------- Bảng giữ chỗ: email → mã 6 số ----------
  const sheet = $('[data-sheet]');
  const otpForm = $('#otp-form');
  let lastFocus = null;
  function openSheet(picked) {
    if (!sheet) return;
    const sum = $('[data-pick-sum]', sheet);
    sum.textContent = '';
    const ic = picked.closest('.tile')?.querySelector('.ic');
    if (ic) sum.append(ic.cloneNode(true));
    const t = document.createElement('span');
    const b = document.createElement('b');
    b.textContent = picked.dataset.name;
    t.append('Đang giữ chỗ ', b, ' cho bạn nè');
    sum.append(t);
    lastFocus = document.activeElement;
    sheet.hidden = false;
    requestAnimationFrame(() => requestAnimationFrame(() => sheet.classList.add('open')));
    setTimeout(() => (otpForm.dataset.step === '2' ? otpForm.code : otpForm.phone).focus(), still ? 0 : 320);
  }
  function closeSheet() {
    sheet.classList.remove('open');
    setTimeout(() => { sheet.hidden = true; lastFocus?.focus?.(); }, still ? 0 : 300);
  }
  if (sheet && otpForm) {
    const panes = $$('[data-pane]', otpForm);
    const showPane = (n) => {
      otpForm.dataset.step = String(n);
      panes.forEach((p) => p.classList.toggle('now', p.dataset.pane === String(n)));
    };
    otpForm.classList.add('js');
    showPane(1);
    sheet.addEventListener('click', (e) => { if (e.target.closest('[data-sheet-close]')) closeSheet(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !sheet.hidden) closeSheet(); });

    const sendBtn = $('[data-act=send-otp]', otpForm);
    const resendBtn = $('[data-act=resend-otp]', otpForm);
    const boxes = $('[data-otp-boxes]', otpForm);
    const cells = $$('i', boxes);
    let busy = false;
    let cooldown = null;
    const startCooldown = (sec) => {
      let left = sec;
      resendBtn.disabled = true;
      resendBtn.textContent = `Gửi lại sau ${left}s`;
      clearInterval(cooldown);
      cooldown = setInterval(() => {
        left -= 1;
        resendBtn.textContent = left > 0 ? `Gửi lại sau ${left}s` : 'Gửi lại mã';
        if (left <= 0) { clearInterval(cooldown); resendBtn.disabled = false; }
      }, 1000);
    };
    const paintCells = () => {
      const v = otpForm.code.value.replace(/\D/g, '').slice(0, 6);
      if (otpForm.code.value !== v) otpForm.code.value = v;
      cells.forEach((c, i) => { c.textContent = v[i] || ''; c.className = i < v.length ? 'f' : i === v.length ? 'c' : ''; });
      return v;
    };
    async function send() {
      if (busy) return;
      const isEmail = otpForm.dataset.kind === 'email';
      const val = otpForm.phone.value.trim();
      if (!val) { say(otpForm, isEmail ? 'Bạn nhập email nhé.' : 'Bạn nhập số điện thoại nhé.', 'err'); otpForm.phone.focus(); return; }
      if (!otpForm.consent.checked) {
        otpForm.consent.closest('label').classList.add('need');
        say(otpForm, 'Bạn tích ô đồng ý giúp Tiệm nha.', 'err');
        return;
      }
      otpForm.consent.closest('label').classList.remove('need');
      busy = true; sendBtn.disabled = true;
      say(otpForm, 'Đang phóng mã đi…');
      const r = await api('/api/otp/send', { phone: val });
      busy = false; sendBtn.disabled = false;
      if (!r.ok) { say(otpForm, r.message, 'err'); return; }
      $('[data-otp-to]', otpForm).textContent = val;
      showPane(2);
      otpForm.code.value = '';
      paintCells();
      setTimeout(() => otpForm.code.focus(), 60);
      startCooldown(30);
      say(otpForm, r.devCode ? `(Chế độ thử) Mã của bạn: ${r.devCode}` : '', 'ok');
    }
    async function verify() {
      if (busy) return;
      const code = paintCells();
      if (code.length !== 6) { say(otpForm, 'Mã có 6 số nha.', 'err'); return; }
      busy = true;
      say(otpForm, 'Đang xác nhận…');
      const r = await api('/api/otp/verify', { phone: otpForm.phone.value, code, consent: otpForm.consent.checked });
      if (!r.ok) {
        busy = false;
        say(otpForm, r.message, 'err');
        if (r.code === 'consent_required') { showPane(1); otpForm.consent.closest('label').classList.add('need'); return; }
        boxes.classList.add('bad');
        setTimeout(() => { boxes.classList.remove('bad'); otpForm.code.value = ''; paintCells(); otpForm.code.focus(); }, 450);
        return;
      }
      // Đã đăng nhập → nhận luôn món đã chọn. Không được (vd. đã thử món này gần đây) → tải lại, báo lý do, món vẫn chọn sẵn.
      const picked = sel();
      if (picked) {
        say(otpForm, 'Ngon! Đang lấy vé cho bạn…', 'ok');
        const c = await claim(picked, inviteEmail());
        if (!c) return;
        if (c.message) store('tbq-msg', c.message);
      }
      location.reload();
    }
    otpForm.addEventListener('submit', (e) => { e.preventDefault(); if (otpForm.dataset.step === '2') verify(); else send(); });
    $('[data-act=verify-otp]', otpForm).addEventListener('click', verify);
    $('[data-act=back-otp]', otpForm).addEventListener('click', () => { showPane(1); say(otpForm, ''); otpForm.phone.focus(); });
    resendBtn.addEventListener('click', send);
    otpForm.code.addEventListener('input', () => { if (paintCells().length === 6) verify(); });
    otpForm.code.addEventListener('focus', () => boxes.classList.add('focus'));
    otpForm.code.addEventListener('blur', () => boxes.classList.remove('focus'));
  }

  // ---------- Canva: chờ bot mời vào nhóm → tự tải lại khi đã mời ----------
  if ($('[data-pending-invite]')) {
    const timer = setInterval(async () => {
      const r = await api('/api/me');
      if (r.unauthorized || r.view?.status !== 'pending_invite') { clearInterval(timer); location.reload(); }
    }, 5000);
  }

  // ---------- Đếm ngược + vòng thời gian quanh logo ----------
  $$('[data-countdown]').forEach((el) => {
    const end = Number(el.dataset.countdown);
    if (!end) return;
    const tick = () => {
      const ms = end - serverNow();
      el.textContent = ms > 0 ? fmt(ms, true) : 'Đã hết giờ';
      if (ms <= 0) { clearInterval(timer); setTimeout(() => location.reload(), 35_000); }
    };
    const timer = setInterval(tick, 1000);
    tick();
  });
  $$('[data-ring]').forEach((el) => {
    const start = Number(el.dataset.start);
    const end = Number(el.dataset.end);
    if (!start || !end || end <= start) return;
    const draw = () => el.style.setProperty('--p', Math.max(0, Math.min(1, (end - serverNow()) / (end - start))).toFixed(3));
    draw();
    setInterval(draw, 30_000);
  });

  // ---------- Lấy mã ----------
  const box = $('#code-box');
  if (box) {
    const totpMode = box.dataset.mode === 'totp';
    const btn = $('[data-act=request-code]', box);
    const wait = $('.code-wait', box);
    const ready = $('.code-ready', box);
    const left = $('[data-left]', wait);
    const digits = $('[data-code]', ready);
    let windowId = box.dataset.windowId || null;
    let expiresAt = Number(box.dataset.windowExpires) || 0;
    let tickTimer = null;
    let pollTimer = null;

    const stop = () => { clearInterval(tickTimer); clearInterval(pollTimer); };
    function idle(text, kind) {
      stop();
      wait.hidden = true;
      btn.disabled = false;
      if (text) say(box, text, kind);
    }
    function tick() {
      const ms = expiresAt - serverNow();
      left.textContent = fmt(ms);
      if (ms < -60_000) idle('Hết thời gian chờ mã. Bấm Lấy mã để thử lại.', 'err');
    }
    async function poll() {
      if (!windowId) return;
      const r = await api(`/api/code/status/${windowId}`);
      if (r.unauthorized) { location.reload(); return; }
      if (r.status === 'ready') {
        stop();
        wait.hidden = true;
        ready.hidden = false;
        btn.disabled = false;
        if (digits.textContent !== r.code) buzz();
        digits.textContent = r.code;
        say(box, 'Nhập mã này vào trang đăng nhập. Mã chỉ dùng được trong vài phút.', 'ok');
        // Khách bấm "gửi lại mã" bên hãng → mã mới thay mã cũ: tiếp tục nghe thêm 1 lúc.
        clearInterval(pollTimer);
        let extra = 0;
        pollTimer = setInterval(async () => {
          extra += 1;
          if (extra > 40) { clearInterval(pollTimer); return; }
          const again = await api(`/api/code/status/${windowId}`);
          if (again.status === 'ready' && again.code !== digits.textContent) { digits.textContent = again.code; buzz(); }
          if (again.status === 'expired') clearInterval(pollTimer);
        }, 4000);
      } else if (r.status === 'expired' || r.status === 'not_found') {
        idle('Chưa nhận được mã. Bấm Lấy mã để thử lại, nhớ bấm gửi mã bên trang đăng nhập SAU khi bấm Lấy mã.', 'err');
      }
    }
    function waiting() {
      wait.hidden = false;
      ready.hidden = true;
      btn.disabled = true;
      stop();
      tick();
      tickTimer = setInterval(tick, 1000);
      pollTimer = setInterval(poll, 3000);
      poll();
    }

    // ----- Mã 2FA: hiện mã đang chạy, tự đổi khi hết 30 giây, đóng khi hết lượt xem -----
    const remainEl = $('[data-remain]', ready);
    let totp = null;
    let totpTimer = null;
    function closeTotp(text) {
      clearInterval(totpTimer);
      totp = null;
      ready.hidden = true;
      btn.disabled = false;
      if (text) say(box, text, 'err');
    }
    async function refreshTotp() {
      const r = await api('/api/totp');
      if (totp) totp.loading = false;
      if (r.unauthorized) { location.reload(); return; }
      if (r.status === 'totp') showTotp(r);
      else closeTotp('Hết lượt xem mã 2FA. Cần nữa thì bấm Lấy mã 2FA.');
    }
    // Tính giây còn lại theo đồng hồ, không đếm theo nhịp: khách chuyển sang app ChatGPT thì trình duyệt ngừng chạy trang,
    // quay lại phải thấy ngay mã đúng chứ không phải mã cũ đang "đếm tiếp".
    function showTotp(r) {
      const fresh = digits.textContent !== r.code;
      totp = { code: r.code, until: r.until, changeAt: serverNow() + r.remainSec * 1000, loading: false };
      ready.hidden = false;
      btn.disabled = true;
      digits.textContent = r.code;
      if (remainEl) remainEl.textContent = String(r.remainSec);
      if (fresh) buzz();
      say(box, 'Nhập mã này ở bước xác thực 2 lớp. Mã đổi sau mỗi 30 giây — hết giờ thì nhập mã mới.', 'ok');
      clearInterval(totpTimer);
      totpTimer = setInterval(totpTick, 1000);
    }
    function totpTick() {
      if (!totp || totp.loading) return;
      if (serverNow() > totp.until) { closeTotp('Hết lượt xem mã 2FA. Cần nữa thì bấm Lấy mã 2FA.'); return; }
      const remain = Math.ceil((totp.changeAt - serverNow()) / 1000);
      if (remainEl) remainEl.textContent = String(Math.max(0, remain));
      if (remain <= 0) { totp.loading = true; refreshTotp(); }
    }
    // Quay lại trang (từ app khác / tab khác): cập nhật ngay.
    const resume = () => {
      if (document.hidden) return;
      if (totp) { totp.loading = true; refreshTotp(); } else if (windowId && !wait.hidden) poll();
    };
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('pageshow', (e) => { if (e.persisted) resume(); });

    btn.addEventListener('click', async () => {
      btn.disabled = true;
      ready.hidden = true;
      say(box, totpMode ? 'Đang lấy mã 2FA…' : 'Đang mở lượt lấy mã…');
      const vInput = $('[data-voucher]', box);
      const r = await api('/api/code/request', { kind: totpMode ? 'totp' : 'mail', voucher: vInput ? vInput.value : undefined });
      if (vInput && (r.status === 'totp' || r.status === 'open')) vInput.value = '';
      if (vInput && r.status === 'need_voucher') vInput.focus();
      if (r.unauthorized) { location.reload(); return; }
      const hint = $('[data-code-hint]', box);
      if (hint && typeof r.codeRequestsLeft === 'number') {
        hint.textContent = r.codeRequestsLeft > 0 ? hint.textContent.replace(/Còn \d+ lần/, `Còn ${r.codeRequestsLeft} lần`) : 'Đã hết lượt lấy mã cho slot này.';
      }
      if (r.status === 'totp') { showTotp(r); return; }
      if (r.status === 'open') {
        windowId = r.windowId;
        expiresAt = r.expiresAt;
        say(box, 'Giờ bấm "gửi mã" ở trang đăng nhập. Mã sẽ hiện ngay tại đây.', 'ok');
        waiting();
        return;
      }
      btn.disabled = false;
      say(box, r.message || 'Chưa lấy được mã.', 'err');
    });
    $('[data-act=cancel-code]', box).addEventListener('click', async () => {
      if (windowId) await api(`/api/code/cancel/${windowId}`, {});
      windowId = null;
      idle('Đã huỷ lượt lấy mã.');
    });
    $('[data-act=copy-code]', box).addEventListener('click', (e) => copy(digits.textContent, e.currentTarget));

    if (totpMode && box.dataset.totpOpen) refreshTotp();
    if (windowId) waiting();
  }

  // ---------- Từng màn: mỗi bước đăng nhập 1 màn, trượt qua lại; chép / mở / xong → tự qua bước kế (nhớ trên máy này) ----------
  const flow = $('[data-flow]');
  if (flow) {
    const steps = $$('[data-st]', flow);
    const items = [...steps, $('[data-flow-done]', flow)]; // phần tử cuối = màn "Xong"
    const key = `tbq-flow-${flow.dataset.flow}`;
    const bars = $$('[data-pg-bar] button', flow);
    const count = $('[data-pg-count]', flow);
    const prev = $('[data-pg-prev]', flow);
    const next = $('[data-pg-next]', flow);
    let at = 0;
    try { at = Math.min(Number(localStorage.getItem(key)) || 0, steps.length); } catch { /* bỏ qua */ }
    const paint = (dir = 0) => {
      items.forEach((li, i) => {
        const on = i === at;
        li.hidden = !on;
        li.classList.toggle('now', on);
        li.classList.remove('in-l', 'in-r');
        if (on && dir && !still) { void li.offsetWidth; li.classList.add(dir > 0 ? 'in-r' : 'in-l'); }
      });
      bars.forEach((b, i) => { b.classList.toggle('d', i < at); b.classList.toggle('now', i === at); });
      const end = at >= steps.length;
      flow.classList.toggle('at-end', end);
      count.textContent = end ? 'Xong hết rồi' : `Bước ${at + 1}/${steps.length}`;
      prev.disabled = at === 0;
      next.hidden = end;
      next.textContent = at === steps.length - 1 ? 'Xong ✓' : 'Tiếp ›';
    };
    const go = (i) => {
      const to = Math.max(0, Math.min(steps.length, i));
      if (to === at) return;
      const dir = Math.sign(to - at);
      at = to;
      try { localStorage.setItem(key, String(at)); } catch { /* bỏ qua */ }
      paint(dir);
      if (at === steps.length && dir > 0) cheer(items[at]);
      // đầu khung bước đã trôi khuất dưới thanh TBQ (mép trên vùng cuộn) → cuộn lên cho thấy
      if (flow.getBoundingClientRect().top < ($('[data-scroll]')?.getBoundingClientRect().top || 0)) flow.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' });
    };
    // tới màn Xong: giấy màu rơi + rung khẽ
    const cheer = (el) => {
      if (still) return;
      const colors = ['#5fd3a2', '#d4b06a', '#f0ebe0', '#ff7b72', '#7d97c9'];
      for (let i = 0; i < 16; i += 1) {
        const c = document.createElement('i');
        c.className = 'confetti';
        c.style.left = `${10 + Math.random() * 80}%`;
        c.style.background = colors[i % colors.length];
        c.style.animationDelay = `${0.35 + Math.random() * 0.3}s`;
        el.append(c);
        setTimeout(() => c.remove(), 2400);
      }
      try { navigator.vibrate?.([12, 40, 12]); } catch { /* bỏ qua */ }
    };
    flow.classList.add('js');
    $('[data-pg-bar]', flow).hidden = false;
    $('[data-pg-nav]', flow).hidden = false;
    count.hidden = false;
    paint();
    let timer = 0;
    flow.addEventListener('click', (e) => {
      const g = e.target.closest('[data-st-go]');
      if (g) { go(Number(g.dataset.stGo)); return; }
      if (e.target.closest('[data-pg-prev]')) { clearTimeout(timer); go(at - 1); return; }
      if (e.target.closest('[data-pg-next]')) { clearTimeout(timer); go(at + 1); return; }
      const did = e.target.closest('[data-copy], [data-next], [data-act=copy-code]');
      const li = did?.closest('[data-st]');
      if (!li || li !== items[at]) return;
      if (did.matches('[data-copy]')) {
        did.dataset.done = '1';
        // bước có nhiều dòng (email + mật khẩu): chép đủ mới sang bước sau
        if ($$('[data-copy]', li).some((b) => !b.dataset.done)) return;
      }
      const from = at;
      clearTimeout(timer);
      timer = setTimeout(() => { if (at === from) go(at + 1); }, 750); // chờ chút cho khách thấy "Đã chép"
    });
    // vuốt ngang để qua lại (không vướng ô chép / nút)
    let sx = 0; let sy = 0;
    const view = $('.pg-view', flow);
    view.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
    view.addEventListener('touchend', (e) => {
      const dx = e.changedTouches[0].clientX - sx; const dy = e.changedTouches[0].clientY - sy;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) { clearTimeout(timer); go(at + (dx < 0 ? 1 : -1)); }
    }, { passive: true });
  }

  // ---------- Vé hiện ra lần đầu: giấy màu rơi 1 lần ----------
  const tk = $('.ticket');
  if (tk && flow && !still) {
    const key = `tbq-yay-${flow.dataset.flow}`;
    let seen = false;
    try { seen = !!localStorage.getItem(key); localStorage.setItem(key, '1'); } catch { /* bỏ qua */ }
    if (!seen) {
      const colors = ['#ffd23f', '#ff5b2e', '#12b886', '#ffffff', '#7d2ae8'];
      for (let i = 0; i < 18; i += 1) {
        const c = document.createElement('i');
        c.className = 'confetti';
        c.style.left = `${5 + Math.random() * 90}%`;
        c.style.background = colors[i % colors.length];
        c.style.animationDelay = `${Math.random() * 0.35}s`;
        tk.append(c);
        setTimeout(() => c.remove(), 2000);
      }
      buzz();
    }
  }
  // ---------- Sống động: hiện dần khi cuộn (xong thì gỡ lớp .rv để trả lại hiệu ứng bấm gốc), tiêu đề lên từng chữ, vé nghiêng theo ngón tay ----------
  // Chuyển động có mục đích (Apple HIG Motion / NN/g): cho biết nội dung từ đâu tới, phản hồi khi chạm. Giảm chuyển động → chỉ mờ dần.
  const groups = ['.how li', '.list .tile', '.out-h', '.tiem', '.peek li', '.steps', '.fold', '.zalo-row', '.contact-tiem', '.stat div', '.offer', '.mini-ticket', '.panel', '.actions .btn'];
  const items = [];
  for (const sel of groups) $$(sel).forEach((el, i) => { el.classList.add('rv'); el.style.setProperty('--d', `${Math.min(i, 6) * 0.07}s`); items.push(el); });
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { const el = e.target; el.classList.add('in'); io.unobserve(el); setTimeout(() => el.classList.remove('rv', 'in'), 1300); } }), { rootMargin: '0px 0px -8% 0px' });
    items.forEach((el) => io.observe(el));
  } else items.forEach((el) => el.classList.add('in'));

  if (!still) {
    // Tiêu đề: tách chữ (giữ nguyên thẻ con như <mark>), mỗi chữ trồi lên nối nhau.
    $$('.intro h1, .tap h1, .end h1, .state h1').forEach((h) => {
      let k = 0;
      const wrap = () => {
        const s = document.createElement('span');
        s.className = 'w';
        s.style.setProperty('--d', `${0.08 + k++ * 0.06}s`);
        return s;
      };
      [...h.childNodes].forEach((n) => {
        if (n.nodeType === 3) {
          const frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach((part) => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.append(part); return; }
            const s = wrap(); s.textContent = part; frag.append(s);
          });
          n.replaceWith(frag);
        } else if (n.nodeType === 1) { const s = wrap(); n.replaceWith(s); s.append(n); }
      });
    });

    // Vé: nghiêng 3D + ánh giấy bóng theo ngón tay / chuột.
    const tkt = $('.ticket');
    if (tkt) {
      const move = (e) => {
        const r = tkt.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5;
        const y = (e.clientY - r.top) / r.height - 0.5;
        tkt.classList.add('held');
        tkt.style.setProperty('--ry', `${(x * 10).toFixed(2)}deg`);
        tkt.style.setProperty('--rx', `${(-y * 8).toFixed(2)}deg`);
        tkt.style.setProperty('--mx', `${((x + 0.5) * 100).toFixed(0)}%`);
      };
      const leave = () => { tkt.classList.remove('held'); tkt.style.setProperty('--rx', '0deg'); tkt.style.setProperty('--ry', '0deg'); };
      tkt.addEventListener('pointermove', move);
      tkt.addEventListener('pointerdown', move);
      ['pointerleave', 'pointerup', 'pointercancel'].forEach((ev) => tkt.addEventListener(ev, leave));
    }
  }

  // Cảnh quán: cuộn xuống → ảnh quán phía sau tối dần (chủ yêu cầu 08/10: "lướt xuống là nền tối để nổi bật chữ"). --qd 0…1 trên body, ui.css phủ lớp tối theo nó.
  const qScroll = document.body.classList.contains('q') && $('[data-scroll]');
  if (qScroll) {
    let raf = 0;
    const dim = () => {
      raf = 0;
      const t = Math.min(1, Math.max(0, (qScroll.scrollTop - 8) / 140));
      document.body.style.setProperty('--qd', (t * t * (3 - 2 * t)).toFixed(3));
    };
    qScroll.addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(dim); }, { passive: true });
    dim();
  }

  // Chọn món: nảy nhẹ + rung khẽ (phản hồi "đã nhận" — ngưỡng Doherty).
  $('#claim-form')?.addEventListener('change', (e) => {
    const t = e.target.closest('.tile');
    if (!t) return;
    t.classList.remove('pop'); void t.offsetWidth; t.classList.add('pop');
    try { navigator.vibrate?.(12); } catch { /* bỏ qua */ }
  });
})();
