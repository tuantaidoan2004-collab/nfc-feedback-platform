// JS phía khách: OTP, nhận slot, đếm ngược, lấy mã, báo lỗi. Không thư viện ngoài.
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
    if (btn) { const old = btn.textContent; btn.textContent = 'Đã chép ✓'; setTimeout(() => { btn.textContent = old; }, 1500); }
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-copy]');
    if (b) { e.preventDefault(); copy(b.dataset.copy, b); }
  });

  // ---------- Đăng xuất ----------
  $$('[data-act=logout]').forEach((b) => b.addEventListener('click', async () => {
    await api('/api/logout', {});
    location.reload();
  }));

  // ---------- OTP ----------
  const otpForm = $('#otp-form');
  if (otpForm) {
    const step = $('.otp-step', otpForm);
    const sendBtn = $('[data-act=send-otp]', otpForm);
    const resendBtn = $('[data-act=resend-otp]', otpForm);
    let busy = false;
    let cooldown = null;
    const startCooldown = (sec) => {
      let left = sec;
      resendBtn.disabled = true;
      clearInterval(cooldown);
      cooldown = setInterval(() => {
        left -= 1;
        resendBtn.textContent = left > 0 ? `Gửi lại mã (${left}s)` : 'Gửi lại mã';
        if (left <= 0) { clearInterval(cooldown); resendBtn.disabled = false; }
      }, 1000);
    };
    async function send() {
      if (busy) return;
      const isEmail = otpForm.dataset.kind === 'email';
      if (!otpForm.phone.value.trim()) { say(otpForm, isEmail ? 'Bạn nhập email nhé.' : 'Bạn nhập số điện thoại nhé.', 'err'); return; }
      busy = true; sendBtn.disabled = true;
      say(otpForm, 'Đang gửi mã…');
      const r = await api('/api/otp/send', { phone: otpForm.phone.value });
      busy = false; sendBtn.disabled = false;
      if (!r.ok) { say(otpForm, r.message, 'err'); return; }
      step.hidden = false;
      sendBtn.hidden = true;
      otpForm.code.focus();
      startCooldown(30);
      const ch = otpForm.dataset.channel || 'Zalo';
      say(otpForm, r.devCode ? `(Chế độ thử) Mã của bạn: ${r.devCode}`
        : isEmail ? 'Đã gửi mã vào email. Mở hộp thư để xem mã (không thấy thì xem cả mục Spam / Quảng cáo nhé).'
          : `Đã gửi mã qua ${ch}. Mở ${ch === 'Zalo' ? 'Zalo' : 'tin nhắn'} để xem mã nhé.`, 'ok');
    }
    async function verify() {
      if (busy) return;
      const code = otpForm.code.value.replace(/\D/g, '');
      if (code.length !== 6) { say(otpForm, 'Mã gồm 6 chữ số.', 'err'); return; }
      busy = true;
      say(otpForm, 'Đang xác nhận…');
      const r = await api('/api/otp/verify', { phone: otpForm.phone.value, code, consent: otpForm.consent.checked });
      busy = false;
      if (!r.ok) {
        say(otpForm, r.message, 'err');
        if (r.code === 'consent_required') otpForm.consent.closest('label').classList.add('need');
        return;
      }
      say(otpForm, 'Xác nhận xong!', 'ok');
      location.reload();
    }
    otpForm.addEventListener('submit', (e) => { e.preventDefault(); if (step.hidden) send(); else verify(); });
    $('[data-act=verify-otp]', otpForm).addEventListener('click', verify);
    resendBtn.addEventListener('click', send);
    otpForm.code.addEventListener('input', () => { if (otpForm.code.value.replace(/\D/g, '').length === 6) verify(); });
  }

  // ---------- Nhận slot ----------
  const claimForm = $('#claim-form');
  if (claimForm) {
    const btn = $('button[type=submit]', claimForm);
    const invite = $('.invite', claimForm);
    // Canva (mời vào nhóm): chọn thì hiện ô email tài khoản của khách.
    claimForm.addEventListener('change', (e) => {
      if (e.target.name !== 'toolId') return;
      invite.hidden = e.target.dataset.login !== 'team_invite';
      $('[data-tool-name]', invite).textContent = e.target.dataset.name;
      if (!invite.hidden) claimForm.inviteEmail.focus();
    });
    claimForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const sel = $('input[name=toolId]:checked', claimForm);
      if (!sel) { say(claimForm, 'Bạn chọn 1 công cụ nhé.', 'err'); return; }
      btn.disabled = true;
      say(claimForm, 'Đang xử lý…');
      const isInvite = sel.dataset.login === 'team_invite';
      if (isInvite && !/^\S+@\S+\.\S+$/.test(claimForm.inviteEmail.value.trim())) { say(claimForm, `Nhập email tài khoản ${sel.dataset.name} của bạn nhé.`, 'err'); claimForm.inviteEmail.focus(); return; }
      const r = await api('/api/claim', { toolId: Number(sel.value), inviteEmail: isInvite ? claimForm.inviteEmail.value.trim() : undefined });
      btn.disabled = false;
      if (r.unauthorized) { location.reload(); return; }
      if (r.status === 'active' || r.status === 'pending_invite') { location.href = `${BASE}/me`; return; }
      say(claimForm, r.message || 'Chưa nhận được slot.', 'err');
    });
  }

  // ---------- Canva: chờ bot mời vào nhóm → tự tải lại khi đã mời ----------
  if ($('[data-pending-invite]')) {
    const timer = setInterval(async () => {
      const r = await api('/api/me');
      if (r.unauthorized || r.view?.status !== 'pending_invite') { clearInterval(timer); location.reload(); }
    }, 5000);
  }

  // ---------- Đếm ngược ----------
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
        hint.textContent = r.codeRequestsLeft > 0 ? `Còn ${r.codeRequestsLeft} lần lấy mã · mỗi lần cần đang ở quán, trên máy này` : 'Đã hết lượt lấy mã cho slot này.';
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

  // ---------- Gia hạn ----------
  const extendForm = $('#extend-form');
  if (extendForm) {
    const panel = $('#extend');
    extendForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const b = $('button', extendForm);
      b.disabled = true;
      const r = await api('/api/extend', { code: extendForm.code.value });
      b.disabled = false;
      if (r.unauthorized) { location.reload(); return; }
      say(panel, r.message || (r.ok ? 'Đã gia hạn.' : 'Chưa gia hạn được.'), r.ok ? 'ok' : 'err');
      if (r.ok) setTimeout(() => location.reload(), 1200);
    });
    const reqForm = $('#extend-request');
    if (reqForm) {
      reqForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const b = $('button', reqForm);
        b.disabled = true;
        const r = await api('/api/extend/request', { days: Number(reqForm.days.value) });
        if (r.unauthorized) { location.reload(); return; }
        say(panel, r.message || 'Chưa gửi được.', r.ok ? 'ok' : 'err');
        if (r.ok) setTimeout(() => location.reload(), 1500); else b.disabled = false;
      });
    }
    // Đang chờ Tiệm gia hạn: hỏi lại mỗi 20 giây, Tiệm bấm Gia hạn xong thì tải lại trang (đồng hồ mới).
    if ($('#extend .ok-line')) {
      const before = Number($('[data-countdown]')?.dataset.countdown) || 0;
      setInterval(async () => {
        if (document.hidden) return;
        const r = await api('/api/me');
        if (r.view && (r.view.expiresAt !== before || !r.view.extendRequest)) location.reload();
      }, 20_000);
    }
  }

  // ---------- Báo lỗi ----------
  const report = $('#report-form');
  if (report) {
    report.addEventListener('submit', async (e) => {
      e.preventDefault();
      const b = $('button', report);
      b.disabled = true;
      const r = await api('/api/report', { message: report.message.value });
      b.disabled = false;
      say(report, r.message || (r.ok ? 'Đã gửi.' : 'Chưa gửi được.'), r.ok ? 'ok' : 'err');
      if (r.ok) report.message.value = '';
    });
  }
})();
