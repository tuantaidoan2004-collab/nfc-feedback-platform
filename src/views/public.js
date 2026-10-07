// Giao diện khách: trang chủ, trang nhận công cụ (sau khi vào từ khối "Công cụ làm việc" trên trang quán / chạm thẻ),
// chọn quán, slot của tôi, về chúng tôi, chính sách dữ liệu. Giọng: trẻ, vui, thân thiện — nhưng các câu về dữ liệu,
// luật dùng tài khoản và chống lạm dụng giữ rõ ràng. Không câu nào nối công cụ với việc đánh giá quán.
import { html } from '../lib/http.js';
import { fmtLocal } from '../lib/time.js';
import { maskPhone } from '../lib/phone.js';
import { page } from './layout.js';
import { MSG } from '../domain/claims.js';
import { otpChannel } from '../services/otp.js';
import { QS_EVENT } from '../qs-event.js';

/** Chữ trên nút khách bấm ở trang quán (khối "Công cụ làm việc" của QS). */
const TAKE = QS_EVENT.items[0].label;
const HOLDING = ['active', 'pending_invite'];
const CONTACT_Q = 'Cần công cụ khác?';
/** Mã quán trên QS trong link (?shop=) — chỉ nhận đúng định dạng slug của QS. */
export const shopParam = (value) => {
  const s = String(value ?? '').trim().toLowerCase();
  return /^[a-z0-9][a-z0-9-]{0,62}$/.test(s) ? s : '';
};
/** "https://zalo.me/0988428496" → "0988 428 496" (để hiện số cho khách). */
const zaloPhone = (url) => {
  const d = String(url).match(/zalo\.me\/(0\d{9})\b/)?.[1];
  return d ? `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}` : '';
};

/** 24 → "24 giờ", 168 → "7 ngày". */
export const duration = (hours) => (hours >= 48 && hours % 24 === 0 ? `${hours / 24} ngày` : `${hours} giờ`);

const lines = (text) => String(text || '').split(/\r?\n/).filter((l) => l.trim()).map((l) => html`<p>${l}</p>`);

function copyable(value, label = 'Sao chép') {
  return html`<span class="copy-row"><code>${value}</code><button type="button" class="btn-mini" data-copy="${value}">${label}</button></span>`;
}

/** Khách đăng nhập bằng email (mã gửi vào hộp thư) thay vì số điện thoại. */
const byEmail = (ctx) => ctx.config.otp.loginBy === 'email';
/** "email" / "số điện thoại" — chữ dùng trong câu cho khách. */
const idWord = (ctx) => (byEmail(ctx) ? 'email' : 'số điện thoại');

function otpForm(ctx) {
  const ch = otpChannel(ctx.config);
  const em = byEmail(ctx);
  // Ô nhập vẫn tên "phone" (API /api/otp/* dùng chung cho cả email và SĐT).
  return html`
<form id="otp-form" class="card" autocomplete="on" novalidate data-channel="${ch}" data-kind="${em ? 'email' : 'phone'}">
  <h2>${em ? 'Xác nhận email nha ✉️' : 'Xác nhận số điện thoại nha 📱'}</h2>
  <p class="muted">${em ? 'Tiệm gửi mã 6 số vào email của bạn. Mỗi email nhận 1 công cụ mỗi ngày' : `Tiệm gửi mã 6 số qua ${ch}. Mỗi số nhận 1 công cụ mỗi ngày`} — để ai ngồi quán cũng có phần 💛</p>
  ${em ? html`<label for="phone">Email</label>
  <input id="phone" name="phone" type="email" inputmode="email" autocomplete="email" autocapitalize="off" spellcheck="false" placeholder="ban@gmail.com" required>`
    : html`<label for="phone">Số điện thoại${ch === 'Zalo' ? ' (có Zalo)' : ''}</label>
  <input id="phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="09xx xxx xxx" required>`}
  <label class="check"><input type="checkbox" name="consent" value="1">
    <span>Tôi đồng ý cho Tiệm Bản Quyền lưu ${idWord(ctx)}, mã thiết bị và địa chỉ IP để chống lạm dụng lượt dùng thử. <a href="/privacy">Xem chi tiết</a></span></label>
  <button type="submit" class="btn" data-act="send-otp">${em ? 'Gửi mã vào email' : `Gửi mã qua ${ch}`}</button>
  <div class="otp-step" hidden>
    <label for="otp-code">${em ? 'Mã 6 số vừa gửi vào email' : `Mã 6 số vừa gửi qua ${ch}`}</label>
    <input id="otp-code" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]*">
    <button type="button" class="btn" data-act="verify-otp">Xác nhận</button>
    <button type="button" class="link" data-act="resend-otp">Gửi lại mã</button>
  </div>
  <p class="msg" role="status" aria-live="polite"></p>
</form>`;
}

/** Cách bắt đầu: khách mở trang quán trên Quite Sensational (chạm thẻ / quét QR) rồi bấm nút trong khối "Công cụ làm việc". */
const entryHint = () => html`Ở quán, chạm điện thoại vào thẻ trên bàn (hoặc quét mã QR). Nếu mở ra trang của quán thì bấm <b>${TAKE}</b>.`;

/** Mục "Về chúng tôi" nằm ngay trong phần công cụ làm việc. */
const aboutLink = (shop) => html`<a class="about-link" href="/ve-chung-toi${shop ? `?shop=${shop}` : ''}">Về chúng tôi — Tiệm Bản Quyền là ai? →</a>`;

function hello(ctx, customer) {
  return html`<p class="muted hello">Xin chào <b>${maskPhone(customer.phone)}</b> · <button type="button" class="link" data-act="logout">${byEmail(ctx) ? 'Đổi email khác' : 'Đổi số khác'}</button></p>`;
}

export function homePage(ctx, { customer, view }) {
  return page(ctx, {
    title: ctx.settings().eventTitle,
    body: html`
<section class="card hero">
  <div class="big-icon">☕</div>
  <h1>${ctx.settings().eventTitle}</h1>
  <p>ChatGPT, CapCut, Canva, Gemini, Adobe… bản Pro xịn xò, ngồi quán là dùng free. Chọn 1 món, chạy deadline vèo vèo 🚀</p>
  <p>${entryHint()}</p>
  ${aboutLink('')}
</section>
${customer ? html`<section class="card">${hello(ctx, customer)}${HOLDING.includes(view?.status)
    ? html`<p>Bạn đang dùng <b>${view.tool.name}</b> nè.</p><a class="btn" href="/me">Xem slot của tôi</a>`
    : html`<p>Bạn chưa có công cụ nào đang chạy.</p><a class="btn ghost" href="/me">Slot của tôi</a>`}</section>` : ''}
<section class="card">
  <h2>Nhận trong 1 phút ⏱</h2>
  <ol class="steps">
    <li>Chạm điện thoại vào thẻ trên bàn (bật NFC nếu máy hỏi) hoặc quét mã QR.</li>
    <li>Nếu mở ra trang của quán: bấm <b>${TAKE}</b>.</li>
    <li>${byEmail(ctx) ? 'Nhập email, mở hộp thư lấy mã 6 số.' : html`Nhập số điện thoại, nhận mã qua ${otpChannel(ctx.config)}.`}</li>
    <li>Chọn 1 món.</li>
    <li>Làm theo hướng dẫn trên màn hình để đăng nhập. Vậy là xong!</li>
  </ol>
</section>`,
  });
}

/**
 * Trang nhận công cụ của 1 quán (/qs/<mã quán QS>). atCafe = máy này vừa vào bằng vé từ trang quán (thẻ / QR trên bàn).
 * Chưa có vé thì không hiện ô email / số điện thoại: khỏi tốn tin OTP cho người không nhận được.
 */
export function cardPage(ctx, { cafe, customer, tools, view, atCafe, shop = '' }) {
  let main;
  if (customer && HOLDING.includes(view?.status)) {
    main = html`<section class="card">${hello(ctx, customer)}<p>Bạn đang dùng <b>${view.tool.name}</b> nè.</p><a class="btn" href="/me">Xem slot của tôi</a></section>`;
  } else if (!atCafe) {
    main = html`<section class="card center" data-need-ticket>
  <div class="big-icon" aria-hidden="true">☕</div>
  <h2>Nhận tại quán nhé</h2>
  <p>${entryHint()}</p>
  <p class="muted">Mỗi lần chạm thẻ dùng được ${ctx.settings().entryTtlMin} phút, trên đúng điện thoại đã chạm.</p>
</section>`;
  } else if (!customer) {
    main = otpForm(ctx);
  } else {
    main = html`
<form id="claim-form" class="card" novalidate>
  ${hello(ctx, customer)}
  <h2>Hôm nay bạn cần món nào? ✨</h2>
  <div class="tools">
    ${tools.map(({ tool, free, blocked }) => html`
    <label class="tool${free && !blocked ? '' : ' off'}">
      <input type="radio" name="toolId" value="${tool.id}" data-name="${tool.name}" data-login="${tool.login_type}"${free && !blocked ? '' : html` disabled`}>
      <span class="tool-name">${tool.name}</span>
      <span class="tool-free">${blocked ? blocked.short : !free ? 'Tạm hết' : tool.login_type === 'redeem' ? 'Mã nhận quà' : `${tool.end_hour != null ? `tới ${tool.end_hour}h sáng` : duration(tool.slot_hours)}${tool.login_type === 'team_invite' ? ' · mời vào nhóm' : ''}`}</span>
    </label>`)}
  </div>
  <div class="invite" hidden>
    <label for="invite-email">Email tài khoản <span data-tool-name></span> của bạn</label>
    <input id="invite-email" name="inviteEmail" type="email" autocomplete="email" inputmode="email" placeholder="ban@gmail.com">
    <p class="muted">Tiệm mời email này vào nhóm Pro. Chưa có tài khoản thì tạo miễn phí bằng email này trước nhé.</p>
  </div>
  <p class="ok-line">✓ Đã thấy bạn đang ở quán, chuẩn rồi!</p>
  <button type="submit" class="btn">Nhận ngay</button>
  <p class="msg" role="status" aria-live="polite"></p>
  ${contactTiem(ctx)}
</form>`;
  }
  return page(ctx, {
    title: `${ctx.settings().eventTitle} — ${cafe.name}`,
    body: html`
<section class="card hero compact">
  <p class="eyebrow"><span class="pill free">Miễn phí</span>${cafe.name}</p>
  <h1>${ctx.settings().eventTitle}</h1>
  <p>Chọn 1 công cụ bản quyền, dùng free ngay tại quán. Ai ngồi quán cũng nhận được ☕</p>
  <p class="muted">Tổ chức bởi Tiệm Bản Quyền</p>
</section>
${main}
<section class="card about-mini">
  <h2>Về chúng tôi</h2>
  <p>Tiệm Bản Quyền — "Alo là có liền": 60+ gói A.I, thiết kế, giải trí bản quyền, nhắn Zalo là có.</p>
  ${aboutLink(shop)}
</section>`,
  });
}

/** Hết slot / cần công cụ khác → liên hệ Tiệm qua Zalo. */
function contactTiem(ctx) {
  return html`<a class="contact-tiem" href="${ctx.settings().zaloUrl}" rel="noopener"><span>${CONTACT_Q}</span><b>Liên hệ Tiệm</b></a>`;
}

function codeHint(ctx, v) {
  if (v.codeRequestsLeft <= 0) return 'Đã hết lượt lấy mã cho slot này.';
  if (v.extendedDays > 0) return `Còn ${v.codeRequestsLeft} lần lấy mã · trên máy này`;
  if (v.needVoucher && !v.hasBoundVoucher) return `Còn ${v.codeRequestsLeft} lần lấy mã · mỗi lần cần 1 phiếu (chạm thẻ hoặc phiếu giấy), trên máy này`;
  if (v.needVoucher) return `Còn ${v.codeRequestsLeft} lần lấy mã · trên máy này`;
  return `Còn ${v.codeRequestsLeft} lần lấy mã · mỗi lần cần đang ở quán, trên máy này`;
}

/** Ô mã phiếu cạnh nút lấy mã: công cụ dùng chung cần phiếu (phát ở quán) để lấy mã đăng nhập. */
function voucherField(v) {
  if (!v.needVoucher) return '';
  if (v.hasBoundVoucher) return html`<p class="muted" data-voucher-bound>Bạn có mã phiếu dùng nhiều lần — không cần nhập.</p>`;
  if (v.hasAutoVoucher) return html`<p class="ok-line" data-voucher-auto>✓ Bạn vừa chạm thẻ ở quán — đã có phiếu, bấm lấy mã là được.</p>`;
  return html`<p class="muted">Chạm thẻ NFC / quét mã QR trên bàn của quán là tự có phiếu. Hoặc nhập phiếu giấy:</p>
  <label class="voucher"><span>Mã phiếu (nhận ở quán)</span>
    <input data-voucher inputmode="text" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="12" placeholder="XXXX-XXXX"></label>`;
}

/** Workspace (Project) theo thứ tự: tên + nút mở thẳng nếu bot đã tạo link. */
function workspaceBox(v) {
  if (!v.workspace) return '';
  const w = v.workspace;
  return html`<div class="seat">
    <p>Workspace của bạn: <b>${w.name}</b> — tài khoản này dùng chung ${v.seatTotal} người.</p>
    ${w.url ? html`<p><a class="btn ghost" href="${w.url}" target="_blank" rel="noopener noreferrer">Mở ${w.name}</a> <span class="muted">(đăng nhập xong rồi bấm)</span></p>` : ''}
    <p class="muted">Chỉ làm việc trong <b>${w.name}</b>: không mở, sửa hay xoá Project / đoạn chat của người khác. Đừng lưu thông tin riêng tư.</p>
  </div>`;
}

/** Dùng thêm (gia hạn): nhập mã gia hạn, hoặc xin gia hạn rồi nhắn Zalo thanh toán. */
function extendBox(ctx, v) {
  if (!v.canExtend) return '';
  const zalo = ctx.settings().zaloUrl;
  const daily = v.tool.end_hour != null;
  return html`<details class="card extend" id="extend"${v.extendRequest ? html` open` : ''}>
  <summary>Muốn dùng thêm? Gia hạn${v.extendedDays ? ` · đã gia hạn ${v.extendedDays} ngày` : ''}</summary>
  ${v.extendedDays && daily ? html`<p class="muted">Mỗi sáng ${v.tool.end_hour}h Tiệm làm mới tài khoản: bạn bị đăng xuất, đăng nhập lại như cũ (lấy mã không cần phiếu). Workspace của bạn được giữ nguyên.</p>` : ''}
  <form id="extend-form" class="row">
    <input name="code" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="12" placeholder="Mã gia hạn" aria-label="Mã gia hạn">
    <button class="btn">Gia hạn</button>
  </form>
  ${v.extendRequest
    ? html`<p class="ok-line">Đã gửi yêu cầu thêm ${v.extendRequest.days} ngày. <a href="${zalo}" rel="noopener">Nhắn Zalo Tiệm</a> để thanh toán — gia hạn xong trang này tự cập nhật.</p>`
    : html`<form id="extend-request" class="row">
    <span class="muted">Chưa có mã?</span>
    <select name="days" aria-label="Số ngày"><option value="1">1 ngày</option><option value="3">3 ngày</option><option value="7">7 ngày</option></select>
    <button class="btn ghost">Xin gia hạn</button></form>`}
  <p class="msg" role="status" aria-live="polite"></p>
</details>`;
}

const END_TEXT = {
  account_quarantined: MSG.quarantined_apology,
  no_account: MSG.no_account,
  risk_high: MSG.risk_high,
  need_review: MSG.need_review,
  rejected_by_admin: 'Yêu cầu chưa được chấp nhận. Nếu có nhầm lẫn, nhắn Zalo cho Tiệm nhé.',
  locked_by_admin: MSG.customer_locked,
  customer_locked: MSG.customer_locked,
};

/** Ô lấy mã: mode 'mail' (mã hãng gửi về email kho) | 'totp' (mã 2FA 6 số đổi mỗi 30 giây). */
function codeBox(ctx, v, mode) {
  const totp = mode === 'totp';
  return html`
  <div id="code-box" class="code-box" data-mode="${mode}" data-totp-open="${totp && v.totpOpen ? '1' : ''}" data-window-id="${v.openWindow?.id || ''}" data-window-expires="${v.openWindow?.expiresAt || ''}">
    ${voucherField(v)}
    <div class="code-actions">
      <button type="button" class="btn" data-act="request-code">${totp ? 'Lấy mã 2FA' : 'Lấy mã'}</button>
      <span class="muted" data-code-hint>${codeHint(ctx, v)}</span>
    </div>
    <div class="code-wait" hidden><div class="spinner small" aria-hidden="true"></div> Đang chờ mã… còn <b data-left>3:00</b>
      <button type="button" class="link" data-act="cancel-code">Huỷ</button></div>
    <div class="code-ready" hidden>
      <p class="muted">${totp ? 'Mã xác thực 2 lớp:' : 'Mã đăng nhập của bạn:'}</p>
      <div class="code-digits" data-code></div>
      ${totp ? html`<p class="muted">Đổi sau <b data-remain>30</b> giây</p>` : ''}
      <button type="button" class="btn-mini" data-act="copy-code">Sao chép mã</button>
    </div>
    <p class="msg" role="status" aria-live="polite"></p>
  </div>`;
}

function slotBody(ctx, v) {
  const zalo = ctx.settings().zaloUrl;
  const t = v.tool;
  if (v.status === 'expired') {
    return html`<section class="card center">
      <div class="big-icon">🎉</div>
      <h1>Hết giờ dùng thử rồi nè!</h1>
      <p>Cảm ơn bạn đã dùng thử <b>${t.name}</b> 💛 Ưng thì dùng tiếp với giá mềm ở Tiệm nha.</p>
      <a class="btn" href="/zalo" rel="noopener">Mua gói giá tốt qua Zalo</a></section>`;
  }
  if (v.status === 'revoked' || v.status === 'rejected') {
    const text = END_TEXT[v.endReason] || (v.status === 'revoked' ? 'Slot đã bị thu hồi. Nếu có nhầm lẫn, nhắn Zalo cho Tiệm nhé.' : MSG.risk_high);
    const again = v.endReason === 'account_quarantined' || v.endReason === 'no_account';
    return html`<section class="card center">
      <div class="big-icon">${again ? '🙏' : '⚠️'}</div>
      <h1>${v.status === 'revoked' ? 'Slot đã dừng' : 'Chưa nhận được slot'}</h1>
      <p>${text}</p>
      ${again ? html`<p>Mở lại trang của quán và bấm <b>${TAKE}</b> để chọn món khác nhé.</p>` : html`<a class="btn ghost" href="${zalo}" rel="noopener">Nhắn Zalo Tiệm</a>`}
    </section>`;
  }

  if (v.status === 'pending_invite') {
    return html`<section class="card center" data-pending-invite>
      <div class="spinner" aria-hidden="true"></div>
      <h1>Đang mời bạn vào nhóm ${t.name}</h1>
      <p>Lời mời gửi tới <b>${v.inviteEmail}</b>, thường trong 1–2 phút. Mở hộp thư (cả mục Quảng cáo / Spam) và bấm <b>Chấp nhận lời mời</b>.</p>
      <p class="muted">Thời gian dùng chỉ bắt đầu tính khi đã mời xong. Trang này tự cập nhật.</p>
      <p class="muted">Lâu quá chưa thấy? <a href="${zalo}" rel="noopener">Nhắn Zalo Tiệm</a>.</p>
    </section>`;
  }

  // active
  const loginLink = t.login_url ? html`<a href="${t.login_url}" target="_blank" rel="noopener noreferrer">trang đăng nhập ${t.name}</a>` : html`trang đăng nhập ${t.name}`;
  const seat = workspaceBox(v);
  let how;
  if (t.login_type === 'email_code') {
    how = html`
<section class="card">
  <h2>Cách đăng nhập</h2>
  <ol class="steps">
    <li>Mở ${loginLink} — trên <b>laptop</b> hoặc ngay điện thoại này.</li>
    <li>Nhập email: ${copyable(v.accountEmail)}</li>
    <li>Bấm <b>Lấy mã</b> ở dưới <b>trước</b>, rồi mới bấm gửi mã bên ${t.name}.</li>
    <li>Mã hiện ngay tại đây trong 1–2 phút. Dùng laptop thì mã vẫn hiện trên điện thoại này.</li>
  </ol>
  ${seat}
  ${codeBox(ctx, v, 'mail')}
  <p class="muted">"1 máy" nghĩa là chỉ đăng nhập ${t.name} trên 1 thiết bị. ${v.extendedDays ? 'Lấy mã trên máy này.' : v.needVoucher ? 'Lấy mã cần mã phiếu (nhận ở quán), trên máy này.' : 'Lấy mã cần đang ở quán, trên máy này — ở xa thì nhắn Zalo Tiệm.'}</p>
</section>`;
  } else if (t.login_type === 'password' || t.login_type === 'password_totp') {
    const totp = t.login_type === 'password_totp';
    how = html`
<section class="card">
  <h2>Thông tin đăng nhập</h2>
  ${v.password
    ? html`<dl class="creds">
    <dt>Trang đăng nhập</dt><dd>${t.login_url ? html`<a href="${t.login_url}" target="_blank" rel="noopener noreferrer">${t.login_url}</a>` : '—'}</dd>
    <dt>Email</dt><dd>${copyable(v.accountEmail)}</dd>
    <dt>Mật khẩu</dt><dd>${copyable(v.password)}</dd>
  </dl>`
    : html`<p class="warn">Mật khẩu chỉ hiện trên máy đã nhận slot.</p>`}
  ${seat}
  ${totp && v.password ? html`<p>Khi ${t.name} hỏi <b>mã xác thực 2 lớp</b> (6 số): bấm <b>Lấy mã 2FA</b> ở dưới rồi nhập mã đang hiện.</p>${codeBox(ctx, v, 'totp')}` : ''}
  ${!totp && v.canMailCode && v.password ? html`<p>Nếu ${t.name} hỏi <b>mã gửi qua email</b>: bấm <b>Lấy mã</b> ở dưới <b>trước</b>, rồi mới bấm gửi mã bên ${t.name}.</p>${codeBox(ctx, v, 'mail')}` : ''}
  <p class="warn">Đừng đổi mật khẩu, email hay ${totp ? 'tắt / đổi' : 'bật'} xác thực 2 lớp — tài khoản sẽ bị khoá và slot bị thu hồi.</p>
</section>`;
  } else if (t.login_type === 'team_invite') {
    how = html`
<section class="card">
  <h2>Cách dùng</h2>
  <ol class="steps">
    <li>Mở ${loginLink}, đăng nhập bằng <b>tài khoản của chính bạn</b>: ${copyable(v.inviteEmail)}</li>
    <li>Chưa vào nhóm thì mở thư mời của ${t.name} và bấm <b>Chấp nhận lời mời</b>.</li>
    <li>Chọn nhóm của Tiệm ở góc trên — các tính năng Pro sẽ mở.</li>
  </ol>
  <p class="muted">Hết giờ Tiệm gỡ bạn khỏi nhóm. Thiết kế của bạn vẫn còn trong tài khoản của bạn, chỉ phần Pro bị khoá lại.</p>
</section>`;
  } else if (t.login_type === 'redeem') {
    how = html`
<section class="card">
  <h2>Quà của bạn</h2>
  ${!v.redeem
    ? html`<p class="warn">Mã chỉ hiện trên máy đã nhận.</p>`
    : v.redeem.isLink
      ? html`<p>Bấm nút dưới để nhận ${t.name}. Đăng nhập bằng Gmail của chính bạn.</p>
  <a class="btn" href="${v.redeem.value}" target="_blank" rel="noopener noreferrer">Nhận ${t.name}</a>
  <p class="muted">Link chỉ dùng được 1 lần, dành riêng cho bạn — đừng chia sẻ.</p>`
      : html`<p>Mã nhận quà của bạn:</p>${copyable(v.redeem.value)}
  ${t.login_url ? html`<p>Mở <a href="${t.login_url}" target="_blank" rel="noopener noreferrer">trang nhập mã</a>, đăng nhập tài khoản của chính bạn và dán mã.</p>` : ''}
  <p class="muted">Mã chỉ dùng được 1 lần, dành riêng cho bạn — đừng chia sẻ.</p>`}
</section>`;
  }
  return html`
<section class="card slot">
  <div class="slot-head"><h1>${t.name}</h1><span class="badge ok">Đang dùng</span></div>
  ${t.login_type === 'redeem' ? '' : html`<p class="countdown">Còn <b data-countdown="${v.expiresAt}">--:--:--</b></p>
  <p class="muted">Dùng tới <b>${fmtLocal(v.expiresAt, ctx.settings().timezoneOffsetMin)}</b></p>
  <p class="love">Chỉ dùng 1 máy để nhường slot cho bạn sau nhé 💛</p>`}
  ${v.deviceMatches ? '' : html`<p class="warn">Slot này được nhận trên một máy khác. Mở trang này trên máy đó để dùng đầy đủ.</p>`}
</section>
${how}
${extendBox(ctx, v)}
${t.instructions ? html`<section class="card"><h2>Lưu ý</h2>${lines(t.instructions)}</section>` : ''}
<details class="card report">
  <summary>Không đăng nhập được? Báo Tiệm</summary>
  <form id="report-form">
    <label for="report-msg">Mô tả ngắn: lỗi gì, ở bước nào</label>
    <textarea id="report-msg" name="message" maxlength="500" rows="3"></textarea>
    <button type="submit" class="btn ghost">Gửi báo lỗi</button>
    <p class="msg" role="status"></p>
    <p class="muted">Cần gấp thì <a href="${zalo}" rel="noopener">nhắn Zalo Tiệm</a>.</p>
  </form>
</details>`;
}

export function mePage(ctx, { customer, view }) {
  const body = !customer
    ? html`<section class="card center"><div class="big-icon">📱</div><h1>Bạn chưa đăng nhập</h1><p>${entryHint()}</p></section>`
    : html`${view ? slotBody(ctx, view) : html`<section class="card center"><div class="big-icon">☕</div><h1>Bạn chưa nhận công cụ nào</h1><p>${entryHint()}</p></section>`}
<p class="center">${hello(ctx, customer)}</p>`;
  return page(ctx, { title: 'Slot của tôi', body, data: { page: 'me' } });
}

/** "Về chúng tôi" — nằm trong phần công cụ làm việc (nút thứ 2 của khối trên trang quán). Thông tin lấy từ tiembanquyen.com. */
export function aboutPage(ctx, { shop }) {
  const zalo = ctx.settings().zaloUrl;
  const phone = zaloPhone(zalo);
  return page(ctx, {
    title: 'Về chúng tôi',
    body: html`
<section class="card hero">
  <p class="eyebrow"><span class="pill free">Về chúng tôi</span>Tiệm Bản Quyền · TBQ Space</p>
  <h1>Alo là có liền 👋</h1>
  <p>Tiệm Bản Quyền là tiệm nhỏ chuyên các gói A.I, thiết kế, giải trí và học tập bản quyền. Giá mềm, giao nhanh, hỗ trợ tận tình qua Zalo.</p>
</section>
<section class="card">
  <h2>Tiệm có gì?</h2>
  <ul class="facts">
    <li><b>60+ dịch vụ:</b> ChatGPT, Claude, Gemini, Canva, CapCut, Adobe, Netflix, Spotify…</li>
    <li><b>Nhắn Zalo là xong:</b> Tiệm báo giá, giao thường trong 5–10 phút, kèm hướng dẫn kích hoạt.</li>
    <li><b>Dùng chung hay chính chủ:</b> gói dùng chung giá rẻ hơn, gói chính chủ là tài khoản riêng của bạn.</li>
    <li><b>Bảo hành theo gói:</b> lỗi giữa chừng thì hoàn tiền phần chưa dùng hoặc đổi tài khoản khác.</li>
    <li><b>Hỗ trợ 24/7</b> qua Zalo${phone ? html` ${phone}` : ''}.</li>
  </ul>
</section>
<section class="card">
  <h2>Công cụ free ở quán để làm gì?</h2>
  <p>Tụi mình muốn bạn ngồi quán mà vẫn chạy deadline mượt: thử đồ xịn trước, ưng thì mới mua. Ai ngồi quán cũng nhận được, không cần làm gì thêm.</p>
  <p class="muted">Mỗi ${idWord(ctx)} nhận 1 công cụ mỗi ngày, để ai cũng có phần. Chỉ dùng 1 máy để nhường slot cho bạn sau nhé 💛</p>
</section>
<section class="card center actions">
  <a class="btn" href="/qs${shop ? `/${shop}` : ''}">${TAKE}</a>
  <a class="btn ghost" href="https://tiembanquyen.com" target="_blank" rel="noopener">Xem bảng giá</a>
  <a class="btn ghost" href="${zalo}" rel="noopener">Nhắn Zalo Tiệm</a>
</section>`,
  });
}

export function privacyPage(ctx) {
  const zalo = ctx.settings().zaloUrl;
  return page(ctx, {
    title: 'Chính sách dữ liệu cá nhân',
    script: null,
    body: html`
<article class="card prose">
  <h1>Chính sách dữ liệu cá nhân</h1>
  <p class="muted">Phiên bản ${ctx.settings().consentVersion}. Áp dụng cho chương trình dùng thử miễn phí tại quán đối tác của Tiệm Bản Quyền.</p>
  <h2>Tiệm thu thập gì</h2>
  <ul>
    ${byEmail(ctx) ? html`<li><b>Email</b> của bạn, để gửi mã xác nhận và giới hạn mỗi người 1 lượt mỗi ngày.</li>`
    : html`<li><b>Số điện thoại</b> của bạn, để gửi mã xác nhận qua SMS và giới hạn mỗi người 1 lượt mỗi ngày.</li>`}
    <li><b>Mã thiết bị</b>: một chuỗi ngẫu nhiên lưu trong cookie của trình duyệt, cùng vài đặc điểm kỹ thuật của trình duyệt.</li>
    <li><b>Địa chỉ IP</b> và thời điểm bạn vào trang, nhận slot, lấy mã.</li>
    <li>${byEmail(ctx) ? 'Email tài khoản Canva' : 'Email'} bạn nhập (chỉ với công cụ mời vào nhóm), để Tiệm gửi lời mời.</li>
  </ul>
  <p>Nếu bạn mở trang này từ trang của quán (thẻ trên bàn hoặc mã QR), Tiệm <b>không nhận</b> dữ liệu cá nhân nào của bạn từ trang đó — chỉ biết bạn đang ở quán nào. Bạn tự nhập ${idWord(ctx)} ở đây.</p>
  <h2>Để làm gì</h2>
  <p>Chỉ để vận hành chương trình dùng thử và chống lạm dụng (một người nhận nhiều lượt, chia sẻ tài khoản ra ngoài). Tiệm không bán hay chia sẻ dữ liệu của bạn cho bên thứ ba. Tiệm chỉ nhắn tin quảng cáo khi bạn chủ động nhắn Zalo cho Tiệm.</p>
  <h2>Giữ trong bao lâu</h2>
  <ul>
    <li>Địa chỉ IP: xoá sau ${ctx.settings().retentionIpDays} ngày.</li>
    <li>Nhật ký sử dụng: xoá sau ${ctx.settings().retentionEventsDays} ngày.</li>
    <li>Mã đăng nhập: xoá khỏi máy chủ sau 10 phút.</li>
  </ul>
  <h2>Quyền của bạn</h2>
  <p>Bạn có quyền xem, sửa, rút lại đồng ý hoặc yêu cầu xoá dữ liệu cá nhân. ${byEmail(ctx) ? html`Nhắn <a href="${zalo}" rel="noopener">Zalo Tiệm</a> kèm email đó. Khi xoá, email được thay bằng một dấu vết mã hoá một chiều (không đọc ngược ra email được),`
    : html`Nhắn <a href="${zalo}" rel="noopener">Zalo Tiệm</a> từ chính số điện thoại đó. Khi xoá, số điện thoại được thay bằng một dấu vết mã hoá một chiều (không đọc ngược ra số được),`} chỉ để chương trình nhớ hạn mức đã dùng.</p>
  <h2>Lưu ý khi dùng tài khoản dùng chung</h2>
  <p>Không đổi mật khẩu, email hay cài đặt bảo mật của tài khoản. Không lưu thông tin riêng tư lên tài khoản dùng chung, vì người dùng sau có thể thấy.</p>
  <p class="muted">Đơn vị chịu trách nhiệm: Tiệm Bản Quyền (tiembanquyen.com).</p>
</article>`,
  });
}
