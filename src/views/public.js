// Giao diện khách (thiết kế v2 "Vé vào ca", docs/thiet-ke-v2.md): trang chủ, trang nhận công cụ (chạm thẻ / khối "Công cụ làm việc"
// trên trang quán QS), vé của tôi, về chúng tôi, chính sách dữ liệu. Giọng: trẻ, vui, thân thiện — nhưng các câu về dữ liệu,
// luật dùng tài khoản và chống lạm dụng giữ rõ ràng. Không câu nào nối công cụ với việc đánh giá quán.
import { html, raw } from '../lib/http.js';
import { fmtLocal } from '../lib/time.js';
import { maskPhone } from '../lib/phone.js';
import { page } from './layout.js';
import { asset } from './asset.js';
import { CLAUDE_D, CHATGPT_D, TBQ_TAG } from './logos.js';
import { MSG } from '../domain/claims.js';
import { otpChannel } from '../services/otp.js';
import { QS_EVENT } from '../qs-event.js';
import { cafeTheme, backdrop, hero, band, stamp } from './quan-canh.js';

/** Chữ trên nút khách bấm ở trang quán (khối "Công cụ làm việc" của QS). */
const TAKE = QS_EVENT.items[0].label;
const HOLDING = ['active', 'pending_invite'];
/** Lớp body cho quán có cảnh riêng (ui.css "Cảnh quán"). */
const themeClass = (theme) => (theme ? ` q q-${theme.id}` : '');
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

/** Khách đăng nhập bằng email (mã gửi vào hộp thư) thay vì số điện thoại. */
const byEmail = (ctx) => ctx.config.otp.loginBy === 'email';
/** "email" / "số điện thoại" — chữ dùng trong câu cho khách. */
const idWord = (ctx) => (byEmail(ctx) ? 'email' : 'số điện thoại');

/** Logo đúng hình (SVG symbol nội tuyến, dùng lại bằng <use href="#ic-…">). Canva là ảnh tròn. */
const LOGO_SYMBOLS = raw(`<svg class="defs" width="0" height="0" focusable="false" aria-hidden="true"><defs>
<linearGradient id="g-gemini" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#1a73e8"/><stop offset=".55" stop-color="#6c63ff"/><stop offset="1" stop-color="#c17cf2"/></linearGradient>
<symbol id="ic-claude" viewBox="75.96 223.53 148.1 148.2"><path fill="#d97757" d="${CLAUDE_D}"/></symbol>
<symbol id="ic-chatgpt" viewBox="12 12 156 156"><path fill="#16151a" d="${CHATGPT_D}"/></symbol>
<symbol id="ic-capcut" viewBox="186 250 735 578"><g fill="#16151a"><path d="M192 330Q192 256 266 256H704Q778 256 778 330V361H192Z"/><path d="M192 748Q192 822 266 822H704Q778 822 778 748V717H192Z"/><path d="M192 361H257L915 703V817L192 440Z"/><path d="M192 717H257L915 375V261L192 638Z"/></g></symbol>
<symbol id="ic-gemini" viewBox="0 0 24 24"><path fill="url(#g-gemini)" d="M12 0C12 6.6 17.4 12 24 12C17.4 12 12 17.4 12 24C12 17.4 6.6 12 0 12C6.6 12 12 6.6 12 0Z"/></symbol>
<symbol id="ic-adobe" viewBox="0 1 24 22"><path fill="#ed1c24" d="M13.966 22.624l-1.69-4.281H8.122l3.892-9.144 5.662 13.425zM8.884 1.376H0v21.248zm15.116 0h-8.884L24 22.624Z"/></symbol>
</defs></svg>`);
const BRANDS = ['chatgpt', 'claude', 'capcut', 'canva', 'gemini', 'adobe'];
const logo = (name) => (name === 'canva'
  ? html`<img src="${asset('canva.png')}" alt="" width="24" height="24">`
  : html`<svg focusable="false" aria-hidden="true"><use href="#ic-${name}"/></svg>`);
/** Mã công cụ (chatgpt, claude, canva-edu…) → hãng; công cụ khác → 'other'. */
const brandOf = (slug) => BRANDS.find((n) => String(slug || '').startsWith(n)) || 'other';
/** Món này làm được gì — 1 dòng dưới tên, để khách chọn nhanh. */
const WHAT = { chatgpt: 'Viết, dịch, code — hỏi gì đáp nấy', claude: 'Đọc file dài không biết ngán', capcut: 'Dựng video cháy phố', canva: 'Slide, poster đẹp mê', gemini: 'A.I nhà Google, lanh lẹ', adobe: 'Photoshop, Premiere bao phê' };
/** Ô logo nền nhạt màu hãng. */
const icon = (slug, cls = '') => {
  const b = brandOf(slug);
  return html`<span class="ic b-${b}${cls ? ` ${cls}` : ''}" aria-hidden="true">${b === 'other' ? '🧰' : logo(b)}</span>`;
};

/** Thanh 3 bước: ở quán → chọn món → nhận vé. at = số bước đã xong (bước "ở quán" tự xong khi chạm thẻ). */
const progress = (at) => html`<div class="prog" role="img" aria-label="Bước ${Math.min(at + 1, 3)} trên 3">${[0, 1, 2].map((i) => html`<i class="${i < at ? 'd' : i === at ? 'n' : ''}"></i>`)}</div>`;

/** Hình điện thoại chạm thẻ (CSS động) + 1 dòng hướng dẫn — cho người chưa ở quán / chưa đăng nhập. */
function tapScreen({ eyebrow = '', title, text, note = '' }) {
  return html`<section class="tap">
  <div class="scene" aria-hidden="true"><span class="nfc-card">${raw(TBQ_TAG)}</span><span class="wave"></span><span class="wave w2"></span><span class="nfc-phone"></span></div>
  ${eyebrow ? html`<p class="eyebrow">${eyebrow}</p>` : ''}
  <h1>${title}</h1>
  <p class="sub">${text}</p>
  ${note ? html`<p class="hint">${note}</p>` : ''}
</section>`;
}

/** Cách bắt đầu: khách mở trang quán trên Quite Sensational (chạm thẻ / quét QR) rồi bấm nút trong khối "Công cụ làm việc". */
const entryHint = () => html`Ở quán, áp điện thoại vào thẻ của quán (ở quầy hoặc trên bàn), hoặc quét mã QR. Nếu mở ra trang của quán thì bấm <b>${TAKE}</b>.`;

function hello(ctx, customer) {
  return html`<p class="hello">Xin chào <b>${maskPhone(customer.phone)}</b> · <button type="button" class="link" data-act="logout">${byEmail(ctx) ? 'Đổi email khác' : 'Đổi số khác'}</button></p>`;
}

/** Trích bảng giá (giá "từ" trên tiembanquyen.com, 10/2026) — đổi giá ở web thì sửa ở đây. */
const PRICE_PEEK = [['ChatGPT', '150.000đ'], ['Claude', '120.000đ'], ['CapCut Pro', '10.000đ']];

/**
 * Thẻ thương hiệu Tiệm: logo thẻ treo, câu chữ ký của web, trích bảng giá, 2 nút.
 * Cho thấy giá trị thay vì hỏi "Tiệm là ai?" (tò mò + mỏ neo giá: thấy "từ 10.000đ" là muốn xem thêm).
 */
function tiemCard(ctx) {
  return html`<section class="tiem">
  <div class="tiem-h">${raw(TBQ_TAG)}<p class="eyebrow-s">Tiệm Bản Quyền · TBQ Space</p></div>
  <h2 class="serif">Alo là có liền,<br>chỉ có thể là <em>Tiệm Bản Quyền.</em></h2>
  <p class="tiem-p">60+ gói A.I, thiết kế, giải trí bản quyền xịn sò. Nhắn Zalo cái là có — 5–10 phút giao liền, chỉ tận tay cách dùng.</p>
  <p class="peek-cap">Giá mềm xèo, ngó thử nè:</p>
  <ul class="peek">${PRICE_PEEK.map(([n, p]) => html`<li><span>${n}</span><i></i><small>từ</small> <b>${p}</b></li>`)}</ul>
  <div class="tiem-a">
    <a class="btn gold" href="https://tiembanquyen.com" target="_blank" rel="noopener">Coi giá liền ›</a>
    <a class="btn ghost" href="${ctx.settings().zaloUrl}" rel="noopener">Alo Tiệm</a>
  </div>
</section>`;
}

/** Khách đang giữ 1 slot → thẻ nhỏ mở vé. */
const holdingCard = (view) => html`<a class="mini-ticket" href="/me">${icon(view.tool.slug)}<span><small>Bạn đang dùng</small><b>${view.tool.name}</b></span><em>Mở vé →</em></a>`;

/** Hết slot / cần công cụ khác → liên hệ Tiệm qua Zalo. */
function contactTiem(ctx) {
  return html`<a class="contact-tiem" href="${ctx.settings().zaloUrl}" rel="noopener"><span>${CONTACT_Q}</span><b>Liên hệ Tiệm</b></a>`;
}

/** Bảng trượt từ đáy: email → mã 6 số. Mở khi khách đã chọn món mà chưa đăng nhập (app.js "Giữ chỗ"). */
function otpSheet(ctx) {
  const ch = otpChannel(ctx.config);
  const em = byEmail(ctx);
  // Ô nhập vẫn tên "phone" (API /api/otp/* dùng chung cho cả email và SĐT).
  return html`<div class="sheet-wrap" data-sheet hidden>
  <div class="sheet-dim" data-sheet-close></div>
  <form class="sheet" id="otp-form" autocomplete="on" novalidate data-channel="${ch}" data-kind="${em ? 'email' : 'phone'}" role="dialog" aria-modal="true" aria-labelledby="sheet-h">
    <span class="grab" aria-hidden="true"></span>
    <button type="button" class="sheet-x" data-sheet-close aria-label="Đóng">✕</button>
    <p class="pick-sum" data-pick-sum></p>
    <div class="pane" data-pane="1">
      <h2 id="sheet-h">${em ? 'Để lại email nha' : 'Để lại số điện thoại nha'}</h2>
      <p class="sub">${em ? 'Tiệm gửi mã 6 số vào email. Mỗi email' : `Tiệm gửi mã 6 số qua ${ch}. Mỗi số`} nhận 1 món mỗi ngày. Không spam đâu — hứa!</p>
      ${em ? html`<input id="phone" name="phone" type="email" inputmode="email" autocomplete="email" autocapitalize="off" spellcheck="false" placeholder="ban@gmail.com" aria-label="Email" required>`
        : html`<input id="phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="09xx xxx xxx" aria-label="Số điện thoại${ch === 'Zalo' ? ' (có Zalo)' : ''}" required>`}
      <label class="check"><input type="checkbox" name="consent" value="1">
        <span>Tôi đồng ý cho Tiệm Bản Quyền lưu ${idWord(ctx)}, mã thiết bị và địa chỉ IP để chống lạm dụng lượt dùng thử. <a href="/privacy">Xem chi tiết</a></span></label>
      <button type="submit" class="btn" data-act="send-otp">${em ? 'Gửi mã vào email' : `Gửi mã qua ${ch}`}</button>
    </div>
    <div class="pane" data-pane="2">
      <h2>Mã đang bay tới nè</h2>
      <p class="sub">Vừa gửi tới <b data-otp-to></b>.${em ? ' Không thấy thì lục mục Spam thử nha.' : ''}</p>
      <div class="otp" data-otp-boxes>
        <input id="otp-code" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]*" aria-label="Mã 6 số">
        ${[1, 2, 3, 4, 5, 6].map(() => html`<i aria-hidden="true"></i>`)}
      </div>
      <p class="meta"><span>Đủ 6 số là tự vào</span><button type="button" class="link" data-act="resend-otp">Gửi lại mã</button></p>
      <button type="button" class="btn" data-act="verify-otp">Xác nhận</button>
      <p class="center"><button type="button" class="link" data-act="back-otp">${em ? 'Đổi email' : 'Đổi số'}</button></p>
    </div>
    <p class="msg" role="status" aria-live="polite"></p>
  </form>
</div>`;
}

/** Chữ nhỏ dưới tên món: thời hạn, cách nhận, số suất còn (số thật, chỉ khi còn ít). */
function tileMeta(tool, free, blocked) {
  if (blocked) return blocked.short;
  if (!free) return 'Tạm hết';
  if (tool.login_type === 'redeem') return 'Mã nhận quà';
  const time = tool.end_hour != null ? `Đến ${tool.end_hour}h sáng` : `Dùng ${duration(tool.slot_hours)}`;
  return `${time}${tool.login_type === 'team_invite' ? ' · mời vào nhóm' : ''}`;
}

/** Món không chọn được: mỗi món 1 dòng gọn (logo nhỏ xám + tên), mờ, nhãn lý do bên phải (Tạm hết / Mở lại lúc 6h / Đã thử đủ lần). */
function offGroup(title, aside, items) {
  if (!items.length) return '';
  return html`<div class="out">
    <p class="out-h">${title}${aside ? html`<small>${aside}</small>` : ''}</p>
    <div class="list">${items.map(({ tool, free, blocked }) => html`<div class="tile off" data-off="${tool.name}">
      ${icon(tool.slug)}
      <span class="tx"><b>${tool.name}</b></span>
      <span class="sold">${tileMeta(tool, free, blocked)}</span>
    </div>`)}</div>
  </div>`;
}

/** Lưới chọn món + ô email Canva + nút dính đáy. Không đăng nhập thì nút mở bảng giữ chỗ trước. */
function pickForm(ctx, { tools, customer }) {
  const ok = ({ free, blocked }) => free > 0 && !blocked;
  const on = tools.filter(ok);
  const sold = tools.filter((x) => !ok(x) && !x.blocked); // hết suất — ai cũng thấy hết
  const held = tools.filter((x) => x.blocked); // còn hàng nhưng khách này chưa nhận được (đã thử, đang nghỉ nhận…)
  const tile = ({ tool, free, blocked }) => {
    const meta = tileMeta(tool, free, blocked);
    return html`<label class="tile">
      <input type="radio" name="toolId" value="${tool.id}" data-name="${tool.name}" data-login="${tool.login_type}" data-sub="${meta}">
      ${icon(tool.slug)}
      <span class="tx"><b>${tool.name}</b>${WHAT[brandOf(tool.slug)] ? html`<span class="what">${WHAT[brandOf(tool.slug)]}</span>` : ''}<em${free <= 5 ? html` class="low"` : ''}>${meta}${free <= 5 ? ` · còn ${free}` : ''}</em></span>
      <span class="tick" aria-hidden="true"></span>
    </label>`;
  };
  return html`<form id="claim-form" class="pick" novalidate${customer ? html` data-logged="1"` : ''}>
  ${on.length ? html`<div class="list">${on.map(tile)}</div>` : ''}
  ${offGroup(on.length ? 'Hôm nay cháy hàng' : 'Các món hôm nay', on.length ? 'Mai ghé sớm nha' : '', sold)}
  ${offGroup('Chưa nhận được lúc này', '', held)}
  <div class="invite" data-invite>
    <label for="invite-email">Email <span data-tool-name>tài khoản</span> của bạn</label>
    <input id="invite-email" name="inviteEmail" type="email" autocomplete="email" inputmode="email" placeholder="ban@gmail.com">
    <p class="hint">Tiệm mời email này vào nhóm Pro. Chưa có tài khoản thì tạo free bằng email này trước nha.</p>
  </div>
  <p class="msg" role="status" aria-live="polite"></p>
  ${on.length ? html`<div class="dock">
    <button type="submit" class="btn" data-cta>Nhận ngay</button>
    <p class="hint">Mỗi ${idWord(ctx)} 1 món/ngày — chia đều cho cả quán cùng vui</p>
  </div>` : ''}
</form>`;
}

export function homePage(ctx, { customer, view, cafe = null }) {
  const theme = cafeTheme(cafe);
  return page(ctx, {
    title: ctx.settings().eventTitle,
    bodyClass: themeClass(theme).trim(),
    body: html`${LOGO_SYMBOLS}${backdrop(theme)}${theme ? band(theme) : ''}
<section class="intro home">
  <span class="free">Miễn phí ở quán</span>
  <h1>Ngồi quán, dùng đồ <mark>Pro</mark>.</h1>
  <p class="sub">ChatGPT, Claude, CapCut, Canva… bản xịn sò, không tốn một xu. Deadline thấy bạn là chạy.</p>
  <div class="logos" aria-hidden="true">${BRANDS.map((b) => html`<span>${logo(b)}</span>`)}</div>
</section>
${customer ? html`${HOLDING.includes(view?.status) ? holdingCard(view) : ''}${hello(ctx, customer)}` : ''}
<ol class="how">
  <li><b>1</b><p>Chạm thẻ của quán<small>chạm nhẹ là mở, không thì quét QR</small></p></li>
  <li><b>2</b><p>Chọn 1 món, nhập ${idWord(ctx)}<small>mã 6 số bay về trong 30 giây</small></p></li>
  <li><b>3</b><p>Nhận vé, vào cày<small>Tiệm chỉ từng bước, khỏi sợ lạc</small></p></li>
</ol>
${tiemCard(ctx)}`,
  });
}

/**
 * Logo + 2 màu dấu X riêng của quán (theo mã quán QS) cho khối collab. Logo = chữ của quán, nền trong suốt (cắt từ ảnh đại diện trang QS).
 * Quán chưa có ở đây → vòng tròn chữ cái đầu tên quán, X nâu cà phê + vàng TBQ.
 */
const CAFE_BRAND = {
  '8ugdc': { logo: 'quan-8ugdc.png', tagline: 'Coffee & Tea', x: ['#c08a5b', '#62b8cc'] }, // Bamos — logo chữ mảnh từ banner collab (Gemini 07/10), tô sáng cho nền đêm; X nâu đồng + teal
};
/** "Quán của @tai" → "T", "Bamos Coffee" → "B". */
const monogram = (name) => (String(name || '')
  .replace(/^\s*(quán\s+của|quán|cafe|café|cà\s*phê|coffee)\s+/i, '')
  .match(/[\p{L}\p{N}]/u)?.[0] || '☕').toUpperCase();

/**
 * Dấu X kiểu banner collab: 4 cánh nhọn như tia chớp (mỗi cánh 1 lưỡi dài + 1 lưỡi ngắn lệch bên), 2 màu chéo nhau,
 * hạt cà phê trong vòng tròn ở tâm. Màu đặt bằng thuộc tính fill (CSP chặn style="" nội tuyến).
 */
function collabX([c1, c2]) {
  const arm = (deg, c) => `<g transform="rotate(${deg})" fill="${c}"><path d="M-5 -9.5L4.4 -9.5L0 -48Z"/><path d="M5 -14L11.2 -16.8L13.8 -40Z" opacity=".85"/><path d="M-5.6 -12.5L-10.4 -15L-11 -32Z" opacity=".6"/></g>`;
  return raw(`<svg viewBox="0 0 100 100" focusable="false" aria-hidden="true"><g transform="translate(50 50)">`
    + arm(-45, c1) + arm(135, c1) + arm(45, c2) + arm(-135, c2)
    + `<circle r="9.5" class="hole"/><g class="bean"><circle r="7" fill="${c1}"/><path d="M-1.6 -5.6Q2.6 -1.2 -0.4 2.2Q-2.6 4.6 1.4 6" fill="none"/></g></g></svg>`);
}

/**
 * Khối "collab" đầu trang quán, theo banner Bamos × TBQ: nằm thẳng trên nền đêm (cùng màu trang), màu sáng cho tương phản, [chữ quán] ✕ [thẻ treo TBQ Space], chữ COLLAB dưới cùng.
 * Mở trang: dấu X xoay vào, hạt cà phê bật, 2 bên trượt vào giữa (ui.css "Collab").
 */
function collab(cafe) {
  const b = CAFE_BRAND[String(cafe.qs_slug || '').toLowerCase()] || {};
  return html`<div class="collab">
  <div class="cb-row">
    <figure class="cb-side cafe">
      ${b.logo ? html`<img src="${asset(b.logo)}" alt="${cafe.name}" width="120" height="36">` : html`<span class="cb-mono">${monogram(cafe.name)}</span>`}
      <figcaption>${b.tagline || cafe.name}</figcaption>
    </figure>
    <div class="cb-x">${collabX(b.x || ['#c08a5b', '#d4b06a'])}</div>
    <figure class="cb-side tbq">
      ${raw(TBQ_TAG)}
      <figcaption><b>TBQ Space</b><small>Tiệm Bản Quyền</small></figcaption>
    </figure>
  </div>
  <p class="cb-word">Collab</p>
  <p class="cb-free">Miễn phí tại quán</p>
</div>`;
}

/**
 * Trang nhận công cụ của 1 quán (/qs/<mã quán QS>). atCafe = máy này vừa vào bằng vé từ trang quán (thẻ / QR trên bàn).
 * Chưa có vé thì không hiện ô email / số điện thoại: khỏi tốn tin OTP cho người không nhận được.
 * Thứ tự: chọn món trước → (chưa đăng nhập) bảng giữ chỗ: email → mã → nhận luôn món đã chọn.
 */
export function cardPage(ctx, { cafe, customer, tools, view, atCafe, owner = false }) {
  const theme = cafeTheme(cafe);
  const eyebrow = theme ? hero(theme) : collab(cafe);
  let body;
  // Chủ tiệm đang thử (OWNER_IDS) ở quán: luôn hiện danh sách chọn món, kể cả khi đang có vé.
  if (customer && HOLDING.includes(view?.status) && !(owner && atCafe)) {
    body = html`<section class="intro">${progress(3)}${eyebrow}<h1>Bạn có vé rồi nè</h1><p class="sub">Mỗi ngày 1 món thôi nha. Mở vé vào cày tiếp nè.</p></section>
${holdingCard(view)}${hello(ctx, customer)}`;
  } else if (!atCafe) {
    body = html`${theme ? html`<section class="intro">${hero(theme)}</section>` : ''}${tapScreen({
      eyebrow: 'Nhận tại quán nhé', title: 'Chạm nhẹ thẻ là mở',
      text: html`Áp lưng điện thoại vào thẻ của quán (ở quầy hoặc trên bàn) ở <b>${cafe.name}</b>. Máy không có NFC? Quét QR trên thẻ cũng được luôn.`,
      note: `Mỗi lần chạm dùng được ${ctx.settings().entryTtlMin} phút, trên đúng điện thoại đã chạm.`,
    })}${tiemCard(ctx)}`;
  } else {
    // không còn món nào chọn được → nói thẳng ở tiêu đề, khỏi bảo khách "chọn 1 món"
    const none = !tools.some(({ free, blocked }) => free > 0 && !blocked);
    const [h, sub] = !none ? ['Hôm nay bạn cần món nào?', 'Đồ Pro xịn sò, free 100%. Chọn 1 món — 1 phút là vào việc.']
      : tools.some(({ blocked }) => blocked) ? ['Lúc này chưa có món cho bạn', 'Lý do ghi ở từng món bên dưới nha. Cần gấp thì nhắn Tiệm.']
        : ['Hôm nay cháy hàng rồi', 'Đồ Pro free nên đắt khách quá. Mai ghé sớm nha — cần gấp thì nhắn Tiệm.'];
    body = html`<section class="intro">${progress(1)}${eyebrow}
  <h1>${h}</h1>
  <p class="sub">${sub}</p>
</section>
${pickForm(ctx, { tools, customer })}
${customer ? hello(ctx, customer) : otpSheet(ctx)}
${contactTiem(ctx)}`;
  }
  return page(ctx, {
    title: `${ctx.settings().eventTitle} — ${cafe.name}`,
    bodyClass: `has-dock${themeClass(theme)}${theme ? ' q-hero' : ''}`,
    body: html`${LOGO_SYMBOLS}${backdrop(theme)}${body}`,
  });
}

function codeHint(ctx, v) {
  if (v.codeRequestsLeft <= 0) return 'Đã hết lượt lấy mã cho slot này.';
  if (v.extendedDays > 0) return `Còn ${v.codeRequestsLeft} lần lấy mã · trên máy này`;
  if (v.needVoucher && !v.hasBoundVoucher) return `Còn ${v.codeRequestsLeft} lần lấy mã · mỗi lần cần 1 phiếu (chạm thẻ hoặc phiếu giấy), trên máy này`;
  if (v.needVoucher) return `Còn ${v.codeRequestsLeft} lần lấy mã · trên máy này`;
  const at = v.atCafeUntil ? `đang ở quán tới ${fmtLocal(v.atCafeUntil, ctx.settings().timezoneOffsetMin).slice(0, 5)}` : 'cần chạm lại thẻ của quán (ở quầy hoặc trên bàn)';
  return `Còn ${v.codeRequestsLeft} lần lấy mã · ${at}, trên máy này`;
}

/** Ô mã phiếu cạnh nút lấy mã: công cụ dùng chung cần phiếu (phát ở quán) để lấy mã đăng nhập. */
function voucherField(v) {
  if (!v.needVoucher) return '';
  if (v.hasBoundVoucher) return html`<p class="hint" data-voucher-bound>Bạn có mã phiếu dùng nhiều lần — không cần nhập.</p>`;
  if (v.hasAutoVoucher) return html`<p class="ok-line" data-voucher-auto>✓ Bạn vừa chạm thẻ ở quán — đã có phiếu, bấm lấy mã là được.</p>`;
  return html`<p class="hint">Chạm thẻ NFC / quét mã QR của quán là tự có phiếu. Hoặc nhập phiếu giấy:</p>
  <label class="voucher"><span>Mã phiếu (nhận ở quán)</span>
    <input data-voucher inputmode="text" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="12" placeholder="XXXX-XXXX"></label>`;
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
    <button type="button" class="btn sm" data-act="request-code">${totp ? 'Lấy mã 2FA' : 'Lấy mã'}</button>
    <p class="hint" data-code-hint>${codeHint(ctx, v)}</p>
    <div class="code-wait" hidden><span class="spin" aria-hidden="true"></span> Đang chờ mã… còn <b data-left>3:00</b>
      <button type="button" class="link" data-act="cancel-code">Huỷ</button></div>
    <div class="code-ready" hidden>
      <div class="code-digits" data-code></div>
      ${totp ? html`<p class="hint">Đổi sau <b data-remain>30</b> giây</p>` : ''}
      <button type="button" class="chip-btn" data-act="copy-code">Chép mã</button>
    </div>
    <p class="msg" role="status" aria-live="polite"></p>
  </div>`;
}

/** Email dài: cho xuống dòng ngay trước @ thay vì bẻ giữa chữ ("tiembanqu / yen.site"). */
const breakable = (value) => {
  const v = String(value ?? '');
  const at = v.indexOf('@');
  return at > 0 ? html`${v.slice(0, at)}<wbr>${v.slice(at)}` : v;
};
/** 1 dòng cần chép: nhãn + giá trị + nút Chép. */
const copyRow = (label, value, key = '') => html`<span class="cp"${key ? html` data-cp="${key}"` : ''}><small>${label}</small><code>${breakable(value)}</code><button type="button" class="chip-btn" data-copy="${value}">Chép</button></span>`;

/** Khung báo trạng thái (dừng, chưa nhận…). */
const statusCard = (emoji, title, text, action = '') => html`<section class="state"><div class="state-ic" aria-hidden="true">${emoji}</div><h1>${title}</h1><p class="sub">${text}</p>${action}</section>`;

/** "6g 46p" / "2 ngày 3g". */
function usedFor(ms) {
  const min = Math.max(1, Math.round(ms / 60_000));
  const d = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  const m = min % 60;
  return d ? `${d} ngày${h ? ` ${h}g` : ''}` : h ? `${h}g ${String(m).padStart(2, '0')}p` : `${m} phút`;
}

/** Hết giờ: cảm ơn + gợi dùng tiếp qua Zalo (lúc kết — khách nhớ nhất). */
function endScreen(ctx, v) {
  const t = v.tool;
  const used = v.startedAt ? usedFor((v.endedAt || v.expiresAt) - v.startedAt) : '';
  return html`<section class="end">
  <div class="cup" aria-hidden="true">☕</div>
  <h1>Hết ca rồi!</h1>
  <p class="sub">Cảm ơn bạn đã cày cùng <b>${t.name}</b> và Tiệm. Hôm nay bạn đỉnh lắm!</p>
  ${used ? html`<div class="stat"><div><b>${used}</b><small>đã cày</small></div><div>${icon(t.slug)}<small>${t.name}</small></div></div>` : ''}
  <div class="offer">
    <b>Ghiền rồi đúng hông?</b>
    <p>Dùng tiếp ở nhà với giá mềm xèo — 60+ gói A.I, thiết kế, giải trí. Alo là có liền.</p>
    <a class="btn dark" href="/zalo" rel="noopener">Nhắn Tiệm qua Zalo</a>
  </div>
  <p class="hint">Mai ghé quán, nhận lượt mới nha · <a href="https://tiembanquyen.com" target="_blank" rel="noopener">tiembanquyen.com</a></p>
</section>`;
}

/** Vé: logo trong vòng thời gian còn lại, tên món, workspace, đếm ngược, giờ hết. */
function ticket(ctx, v, sub) {
  const t = v.tool;
  const timed = t.login_type !== 'redeem' && v.expiresAt;
  return html`<section class="ticket">
  <div class="tk-h">
    <span class="ring" data-ring data-start="${v.startedAt || ''}" data-end="${v.expiresAt || ''}">${icon(t.slug)}</span>
    <div><h1>${t.name}</h1><small>${sub}</small></div>
    ${v.theme ? stamp(v.theme) : ''}
  </div>
  ${timed ? html`<div class="tk-cut" aria-hidden="true"></div>
  <p class="tk-row"><span>Còn</span><b data-countdown="${v.expiresAt}">--:--:--</b></p>
  <p class="tk-row"><span>Dùng đến</span><b>${fmtLocal(v.expiresAt, ctx.settings().timezoneOffsetMin)}</b></p>` : ''}
  ${v.deviceMatches ? '' : html`<p class="tk-warn">Slot này được nhận trên một máy khác. Mở trang này trên máy đó để dùng đầy đủ.</p>`}
</section>`;
}

/**
 * Món có app điện thoại: trang web của hãng không có Universal Link (capcut.com không có apple-app-site-association) nên link
 * web chỉ mở trình duyệt. Có ở đây thì trên điện thoại nút "Mở …" mở thẳng app (app.js "Mở app"), laptop vẫn mở login_url.
 * scheme: link mở app, như web CapCut tự dùng · android: tên gói (mở bằng intent://, chưa cài thì Chrome tự qua Play Store) · ios: App Store.
 */
const APPS = {
  capcut: { name: 'CapCut', scheme: 'capcut://main/tabbar?index=0', android: 'com.lemon.lvoverseas', ios: 'https://apps.apple.com/app/id1500855883' },
  // Món có app nhận link web của hãng (chủ yêu cầu 08/10/2026 "những nút khác cũng vậy"): iPhone mở link chính chủ → iOS tự bật app nếu đã cài;
  // Android mở intent:// kèm tên gói, chưa cài thì Chrome tự quay về trang web (browser_fallback_url).
  chatgpt: { name: 'ChatGPT', link: 'https://chatgpt.com/', android: 'com.openai.chatgpt', ios: 'https://apps.apple.com/app/id6448311069' },
  claude: { name: 'Claude', link: 'https://claude.ai/', android: 'com.anthropic.claude', ios: 'https://apps.apple.com/app/id6473753684' },
  canva: { name: 'Canva', link: 'https://www.canva.com/', android: 'com.canva.editor', ios: 'https://apps.apple.com/app/id897446215' },
};
const appOf = (t) => (t.login_url ? APPS[brandOf(t.slug)] || null : null);

/** Nút "Mở <món>": link web; món có app thì kèm data-app để app.js mở app trên điện thoại. */
function openBtn(t, cls, next = false, copyFirst = '') {
  const app = appOf(t);
  // Món có app: chữ "Mở app …" (không có ↗ — khách hiểu là vào thẳng app). Máy tính / trình duyệt trong Zalo: app.js đổi sang data-web-label.
  return html`<a class="${cls}" href="${t.login_url}" target="_blank" rel="noopener noreferrer"${next ? html` data-next` : ''}${copyFirst ? html` data-copy-first="${copyFirst}"` : ''}${app
    ? html`${app.scheme ? html` data-app="${app.scheme}"` : html` data-app-link="${app.link}"`} data-app-android="${app.android}" data-web-label="Mở ${t.name}${app.scheme ? ' bản web' : ''} ↗">Mở app ${app.name}`
    : html`>Mở ${t.name} ↗`}</a>`;
}

/**
 * Các bước đăng nhập — MỖI BƯỚC MỘT MÀN (app.js "Từng màn"): thanh tiến độ, nút "‹ Quay lại" / "Tiếp ›", màn sau trượt vào,
 * chép / mở / bấm nút xong thì tự qua bước kế; hết bước → màn "Xong". Bước đang ở nhớ trên máy này.
 * Không JS: hiện hết các bước thành danh sách.
 * steps: [{ title, body, manual? (chữ nút xong cho bước không có thao tác) }] — phần tử null bị bỏ qua.
 * account: "Tài khoản đã nhận" hiện luôn trên màn Xong (email / mật khẩu + nút Chép) — khách quay lại trang vé
 * (bị đăng xuất, đổi máy trong ngày…) chép lại được ngay, không phải lật lại từng bước. (Chủ yêu cầu 08/10/2026.)
 */
function checklist(v, all, account = null) {
  const steps = all.filter(Boolean);
  const t = v.tool;
  const n = steps.length;
  return html`<section class="steps pager" data-flow="${v.slotId}">
  <div class="pg-top">
    <h2>${n} bước là vào việc</h2>
    <p class="pg-count" data-pg-count aria-live="polite" hidden></p>
    <div class="pg-bar" data-pg-bar hidden>${steps.map((st, i) => html`<button type="button" data-st-go="${i}" aria-label="Bước ${i + 1}: ${st.title}"></button>`)}</div>
  </div>
  <ol class="pg-view">${steps.map((st, i) => html`
    <li class="st" data-st>
      <div class="st-h"><span class="n" aria-hidden="true">${i + 1}</span><span class="tt">${st.title}</span></div>
      <div class="st-b">${st.body}${st.manual ? html`<button type="button" class="chip-btn" data-next>${st.manual}</button>` : ''}</div>
    </li>`)}
    <li class="st pg-done${account ? ' has-acc' : ''}" data-flow-done hidden>
      <svg class="done-ok" viewBox="0 0 56 56" aria-hidden="true"><circle cx="28" cy="28" r="25"/><path d="M17 29l7.5 7.5L40 21"/></svg>
      <h3>Xong! Vào việc thôi</h3>
      ${account ? html`<div class="pg-acc"><p class="pg-acc-h">Tài khoản đã nhận · cần thì chép lại</p>${account}</div>`
    : html`<p class="sub">Đăng nhập ngon lành rồi đó. Cày deadline vèo vèo nha!</p>`}
      ${t.login_url ? openBtn(t, 'btn sm') : ''}
      <button type="button" class="link" data-st-go="0">Xem lại các bước</button>
    </li>
  </ol>
  <nav class="pg-nav" data-pg-nav hidden>
    <button type="button" class="btn ghost" data-pg-prev>‹ Quay lại</button>
    <button type="button" class="btn" data-pg-next>Tiếp ›</button>
  </nav>
</section>`;
}

/**
 * Trang vé: vào là thấy tài khoản luôn (chủ yêu cầu 08/10/2026: "quá nhiều chữ, bỏ bước 1, vào trang nhận tài khoản luôn").
 * Email / mật khẩu + nút Chép, nút mở món ngay dưới; mã (2FA / email) nằm ngay trong thẻ, không còn chuỗi bước.
 */
function accountCard(ctx, v, { rows, code = '', codeFold = '' }) {
  const t = v.tool;
  const app = appOf(t);
  // UI tâm lý (chủ yêu cầu 08/10/2026): 1 nút chính lên đầu; bấm là tự chép email + mở thẳng app; quay lại trang thì dòng kế tiếp (mật khẩu / lấy mã)
  // sáng lên kèm lời nhắc; dòng đã chép có ✓. "Chưa có app?" chỉ hiện khi mở app không được (app.js).
  return html`<section class="steps acc-card" data-acc>
  <h2>Tài khoản của bạn</h2>
  ${t.login_url ? html`${openBtn(t, 'btn acc-open', false, v.accountEmail || '')}
  <p class="acc-auto" data-acc-auto>Tự chép sẵn email · ${app ? 'vào app' : 'mở ra'} dán là xong</p>` : ''}
  ${app?.scheme ? html`<p class="hint acc-miss" data-app-miss hidden>Chưa có app? <a href="${app.ios}" data-app-get data-ios="${app.ios}" data-android="https://play.google.com/store/apps/details?id=${app.android}" target="_blank" rel="noopener noreferrer">Tải ${app.name}</a> · <a href="${t.login_url}" target="_blank" rel="noopener noreferrer">dùng bản web</a></p>` : ''}
  ${app ? html`<p class="hint acc-miss" data-in-app hidden>Đang mở trong Zalo / Facebook — bấm ⋯ chọn <b>Mở bằng trình duyệt</b> để vào thẳng app ${app.name}.</p>` : ''}
  <div class="acc-rows">${rows}</div>
  ${v.workspace ? html`<p class="pg-acc-ws">Workspace của bạn: <b>${v.workspace.name}</b>${v.workspace.url ? html` · <a href="${v.workspace.url}" target="_blank" rel="noopener noreferrer">mở ↗</a>` : ''}</p>` : ''}
  ${code ? html`<div class="acc-code" data-acc-target>${code.title ? html`<p class="acc-code-h">${code.title}</p>` : ''}${code.body}</div>` : ''}
  ${codeFold ? html`<details class="acc-more"><summary>${codeFold.title}</summary>${codeFold.body}</details>` : ''}
</section>`;
}

/** Lời nhắc hiện khi khách mở app xong quay lại trang (app.js): đặt ngay trên dòng cần làm tiếp. */
const nextHint = (text) => html`<p class="acc-next" data-acc-next hidden>${text}</p>`;

/** Ghi chú riêng của món (Cài đặt → Công cụ): bỏ câu nói lại điều "Mẹo dùng mượt" đã có (1 máy / email + mật khẩu), khỏi lặp ý. */
const extraNotes = (text) => String(text || '').split(/\r?\n/)
  .filter((l) => !/1\s*(máy|thiết bị)|email\s*\+\s*mật khẩu/i.test(l)).join('\n');

function slotBody(ctx, v) {
  const zalo = ctx.settings().zaloUrl;
  const t = v.tool;
  if (v.status === 'expired') return endScreen(ctx, v);
  if (v.status === 'revoked' || v.status === 'rejected') {
    const text = END_TEXT[v.endReason] || (v.status === 'revoked' ? 'Slot đã bị thu hồi. Nếu có nhầm lẫn, nhắn Zalo cho Tiệm nhé.' : MSG.risk_high);
    const again = v.endReason === 'account_quarantined' || v.endReason === 'no_account';
    return statusCard(again ? '🙏' : '⚠️', v.status === 'revoked' ? 'Slot đã dừng' : 'Chưa nhận được slot', text,
      again ? html`<p class="sub">Mở lại trang của quán và bấm <b>${TAKE}</b> để chọn món khác nhé.</p>` : html`<a class="btn" href="${zalo}" rel="noopener">Nhắn Zalo Tiệm</a>`);
  }

  if (v.status === 'pending_invite') {
    return html`${ticket(ctx, { ...v, expiresAt: null }, 'Đang mời…')}
<section class="steps waiting" data-pending-invite>
  <h2>Đang mời bạn vào nhóm ${t.name}</h2>
  <ol>
    <li class="st now"><span class="st-h"><span class="n"><span class="spin" aria-hidden="true"></span></span><span class="tt">Tiệm đang gửi thiệp mời</span></span>
      <div class="st-b"><p>Tới <b>${v.inviteEmail}</b>, thường trong 1–2 phút.</p></div></li>
    <li class="st"><span class="st-h"><span class="n">2</span><span class="tt">Mở hộp thư, bấm <b>Chấp nhận lời mời</b></span></span></li>
    <li class="st"><span class="st-h"><span class="n">3</span><span class="tt">Trang này tự cập nhật</span></span></li>
  </ol>
  <p class="hint">Thời gian dùng chỉ bắt đầu tính khi đã mời xong. Lâu quá chưa thấy? <a href="${zalo}" rel="noopener">Nhắn Zalo Tiệm</a>.</p>
</section>`;
  }

  // active — Canva vẫn theo chuỗi bước (chấp nhận lời mời → đăng nhập → chọn nhóm); món có tài khoản thì vào thẳng thẻ tài khoản.
  const open = t.login_url
    ? openBtn(t, 'btn ghost sm', true)
    : html`<p>Mở ứng dụng / trang ${t.name}.</p>`;
  const rules = [html`Dùng trên 1 máy thôi nha — để bạn sau cũng có phần 💛`];
  let how;
  if (t.login_type === 'email_code') {
    rules.push(html`Giữ nguyên email, thông tin tài khoản giúp Tiệm nha`);
    how = accountCard(ctx, v, { rows: html`${copyRow('Email', v.accountEmail, 'email')}${nextHint(`Quay lại rồi nè — bấm Lấy mã trước, rồi bấm gửi mã bên ${t.name} nha 👇`)}`,
      code: { title: '', body: codeBox(ctx, v, 'mail') } });
  } else if (t.login_type === 'password' || t.login_type === 'password_totp') {
    const totp = t.login_type === 'password_totp';
    rules.push(totp ? html`Giữ nguyên mật khẩu, email, 2FA — để ai cũng vào được` : html`Giữ nguyên mật khẩu, email, đừng bật 2FA nha — để ai cũng vào được`);
    how = !v.password
      ? statusCard('🔒', 'Mật khẩu ở máy kia', 'Mật khẩu chỉ hiện trên máy đã nhận slot.')
      : accountCard(ctx, v, {
        rows: html`${copyRow('Email', v.accountEmail, 'email')}${nextHint('Quay lại rồi nè — chép mật khẩu dán tiếp nha 👇')}<div data-acc-target>${copyRow('Mật khẩu', v.password, 'pass')}</div>`,
        code: totp ? { title: 'Mã 2 lớp', body: codeBox(ctx, v, 'totp') } : '',
        codeFold: !totp && v.canMailCode ? { title: 'Bị hỏi mã email?', body: html`<p class="hint">Bấm <b>Lấy mã</b> trước, rồi mới gửi mã bên ${t.name}.</p>${codeBox(ctx, v, 'mail')}` } : '',
      });
  } else if (t.login_type === 'team_invite') {
    rules.push(html`Hết giờ Tiệm mời bạn ra nhóm, thiết kế vẫn còn nguyên`);
    how = checklist(v, [
      { title: 'Chấp nhận lời mời', body: html`<p>Mở thư ${t.name} gửi tới <b>${v.inviteEmail}</b> → bấm <b>Chấp nhận</b>.</p>`, manual: 'Đã chấp nhận ✓' },
      { title: `Đăng nhập ${t.name} của bạn`, body: open, manual: t.login_url ? '' : 'Xong ✓' },
      { title: 'Chọn nhóm của Tiệm', body: html`<p class="hint">Ở góc trên. Tính năng Pro sẽ mở.</p>`, manual: 'Xong ✓' },
    ]);
  } else if (t.login_type === 'redeem') {
    how = html`<section class="steps">
  <h2>Quà của bạn</h2>
  ${!v.redeem
    ? html`<p class="warn">Mã chỉ hiện trên máy đã nhận.</p>`
    : v.redeem.isLink
      ? html`<p>Bấm nút dưới để nhận ${t.name}. Đăng nhập bằng Gmail của chính bạn.</p>
  <a class="btn" href="${v.redeem.value}" target="_blank" rel="noopener noreferrer">Nhận ${t.name}</a>
  <p class="hint">Link chỉ dùng được 1 lần, dành riêng cho bạn — đừng chia sẻ.</p>`
      : html`${copyRow('Mã', v.redeem.value)}
  ${t.login_url ? html`<p>Mở <a href="${t.login_url}" target="_blank" rel="noopener noreferrer">trang nhập mã</a>, đăng nhập tài khoản của chính bạn và dán mã.</p>` : ''}
  <p class="hint">Mã chỉ dùng được 1 lần, dành riêng cho bạn — đừng chia sẻ.</p>`}
</section>`;
  }
  if (v.workspace) rules.push(html`Ngồi đúng ${v.workspace.name} của bạn nha`);
  return html`${ticket(ctx, v, v.workspace ? html`Đang dùng · ${v.workspace.name}` : 'Đang dùng')}
${how}
${t.login_type === 'redeem' ? '' : html`<details class="fold">
  <summary>Mẹo dùng mượt ✨</summary>
  <ul>${rules.map((r) => html`<li>${r}</li>`)}</ul>
  ${t.instructions ? lines(extraNotes(t.instructions)) : ''}
</details>`}
<div class="zalo-row">
  ${v.canExtend ? html`<a class="zbtn" href="${zalo}" rel="noopener"><b>Dùng thêm ngày</b><small>${v.extendedDays ? `đã thêm ${v.extendedDays} ngày · ` : ''}nhắn Tiệm kèm email nha</small></a>` : ''}
  <a class="zbtn" href="${zalo}" rel="noopener"><b>Kẹt chỗ nào hả?</b><small>nhắn Tiệm, gỡ liền 💬</small></a>
</div>
${tiemCard(ctx)}`;
}

export function mePage(ctx, { customer, view, cafe = null }) {
  const theme = cafeTheme(cafe);
  if (view && theme) view = { ...view, theme };
  const body = !customer
    ? tapScreen({ title: 'Ủa, chưa thấy bạn đâu', text: entryHint() })
    : html`${view ? slotBody(ctx, view) : tapScreen({ title: 'Chưa có món nào hết trơn', text: entryHint() })}
${hello(ctx, customer)}`;
  return page(ctx, { title: 'Slot của tôi', bodyClass: themeClass(theme).trim(), body: html`${LOGO_SYMBOLS}${backdrop(theme)}${theme ? band(theme) : ''}${body}`, data: { page: 'me' } });
}

/** "Về chúng tôi" — nằm trong phần công cụ làm việc (nút thứ 2 của khối trên trang quán). Thông tin lấy từ tiembanquyen.com. */
export function aboutPage(ctx, { shop }) {
  const zalo = ctx.settings().zaloUrl;
  const phone = zaloPhone(zalo);
  return page(ctx, {
    title: 'Về chúng tôi',
    body: html`
<section class="intro">
  <p class="eyebrow">Tiệm Bản Quyền · TBQ Space</p>
  <h1>Alo là có liền 👋</h1>
  <p class="sub">Tiệm nhỏ chuyên các gói A.I, thiết kế, giải trí và học tập bản quyền. Giá mềm, giao nhanh, hỗ trợ tận tình qua Zalo.</p>
</section>
<section class="panel">
  <h2>Tiệm có gì?</h2>
  <ul class="facts">
    <li><b>60+ dịch vụ:</b> ChatGPT, Claude, Gemini, Canva, CapCut, Adobe, Netflix, Spotify…</li>
    <li><b>Nhắn Zalo là xong:</b> Tiệm báo giá, giao thường trong 5–10 phút, kèm hướng dẫn kích hoạt.</li>
    <li><b>Dùng chung hay chính chủ:</b> gói dùng chung giá rẻ hơn, gói chính chủ là tài khoản riêng của bạn.</li>
    <li><b>Bảo hành theo gói:</b> lỗi giữa chừng thì hoàn tiền phần chưa dùng hoặc đổi tài khoản khác.</li>
    <li><b>Hỗ trợ 24/7</b> qua Zalo${phone ? html` ${phone}` : ''}.</li>
  </ul>
</section>
<section class="panel">
  <h2>Công cụ free ở quán để làm gì?</h2>
  <p>Tụi mình muốn bạn ngồi quán mà vẫn chạy deadline mượt: thử đồ xịn trước, ưng thì mới mua. Ai ngồi quán cũng nhận được, không cần làm gì thêm.</p>
  <p class="hint">Mỗi ${idWord(ctx)} nhận 1 công cụ mỗi ngày, để ai cũng có phần. Chỉ dùng 1 máy để nhường slot cho bạn sau nhé 💛</p>
</section>
<div class="actions">
  <a class="btn" href="/qs${shop ? `/${shop}` : ''}">${TAKE}</a>
  <a class="btn ghost" href="https://tiembanquyen.com" target="_blank" rel="noopener">Xem bảng giá</a>
  <a class="btn ghost" href="${zalo}" rel="noopener">Nhắn Zalo Tiệm</a>
</div>`,
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
