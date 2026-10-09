// Khung và các mảnh giao diện dùng chung của trang quản trị — phong cách chuẩn Tiệm (TBQ UI Kit: giấy ngà, mực, nét vàng đồng, chữ có chân).
import { readFileSync } from 'node:fs';
import { html, raw } from '../lib/http.js';
import { fmtLocal } from '../lib/time.js';
import { maskPhone } from '../lib/phone.js';
import { asset } from './asset.js';
import { TBQ_TAG } from './logos.js';

export const EVENT_LABEL = {
  login: 'Đăng nhập', otp_sent: 'Gửi OTP', otp_wrong: 'Nhập sai OTP', otp_send_failed: 'Gửi OTP lỗi',
  ticket_rejected: 'Link từ trang quán bị từ chối', ticket_forged: 'Nhiều link giả vào quán',
  claim_green: 'Nhận slot (xanh)', claim_yellow_passed: 'Ca vàng được cho qua (theo cài đặt)', claim_yellow_rejected: 'Ca vàng bị từ chối tự động', claim_red: 'Từ chối nhận slot',
  slot_started: 'Bắt đầu slot', slot_pending_invite: 'Chờ bot mời vào nhóm', worker_task_taken: 'Bot nhận việc', worker_task_failed: 'Bot làm lỗi',
  worker_task_stuck: 'Bot chưa làm được — làm tay', worker_unauthorized: 'Sai mã bot', slot_expired: 'Hết hạn slot', slot_revoked: 'Thu hồi slot', slot_rejected: 'Huỷ slot đang chờ',
  code_requested: 'Lấy mã', code_delivered: 'Đã giao mã', code_replaced: 'Thay mã mới', code_late: 'Mã về trễ', code_orphan_wait: 'Mã chờ người nhận',
  code_orphan: 'Mã mồ côi', worker_late_invite: 'Bot mời xong khi slot đã kết thúc → đã giao bot gỡ', code_to_owner: 'Mã đăng nhập giao cho chủ (việc tay)', owner_code_opened: 'Chủ bấm Lấy mã đăng nhập', code_second_device: 'Lấy mã từ máy khác',
  mail_unknown_sender: 'Thư lạ người gửi', mail_parse_failed: 'Không đọc được mã', mail_password_reset: 'Thư đặt lại mật khẩu',
  mail_wrong_route: 'Thư mã về nhầm hộp thư', mail_magic_link: 'Thư đăng nhập bằng link', mail_new_signin: 'Đăng nhập mới không qua Lấy mã', mail_hook_unauthorized: 'Webhook thư sai chữ ký',
  account_quarantined: 'Cách ly tài khoản', task_done: 'Xong việc tay', task_cancelled: 'Bỏ việc tay', qs_api_stock_added: 'Tài nạp kho (qua QS)',
  customer_locked: 'Khoá khách', customer_unlocked: 'Mở khoá khách', customer_erased: 'Xoá dữ liệu khách', strike: 'Ghi vi phạm', risk_added: 'Cộng điểm rủi ro', risk_reset: 'Chủ xoá điểm rủi ro',
  device_locked: 'Khoá máy', device_unlocked: 'Mở khoá máy', device_restored: 'Khôi phục mã máy',
  customer_report: 'Khách báo lỗi', zalo_click: 'Bấm mua qua Zalo', qs_shop_unmapped: 'Mã quán QS chưa có trong TBQ',
  tap_replay: 'Link thẻ NFC chép lại (đã chặn)', tap_forged: 'Link thẻ NFC giả', tap_jump: 'Bộ đếm thẻ NFC nhảy bất thường', tap_locked: 'Chạm thẻ đang khoá', tap_closed: 'Chạm thẻ khi quán đóng / tạm dừng',
  card_locked: 'Đã tự khoá thẻ NFC', card_anomaly: 'Thẻ NFC bị chạm bất thường', card_rotated: 'Đổi link thẻ NFC', card_unlocked: 'Mở khoá thẻ NFC',
  admin_login: 'Chủ đăng nhập quản trị', admin_login_failed: 'Sai mật khẩu quản trị', settings_saved: 'Lưu cài đặt',
  accounts_imported: 'Nhập kho tài khoản', accounts_kho_moved: 'Chuyển kho tài khoản', redeem_imported: 'Nhập kho mã / link', account_updated: 'Sửa tài khoản kho',
  totp_missing: 'Tài khoản thiếu khoá 2FA', totp_shown: 'Khách xem mã 2FA',
  tool_sold_out: 'Hết kho', tool_daily_cap: 'Hết lượt hôm nay', cafe_full: 'Quán hết suất hôm nay',
  voucher_batch: 'Tạo lô mã phiếu', voucher_used: 'Dùng mã phiếu', voucher_void: 'Huỷ mã phiếu', voucher_unbind: 'Gỡ khách khỏi mã vĩnh viễn',
  voucher_guessing: 'Nhập sai mã phiếu nhiều lần', slot_extended: 'Gia hạn slot', extend_requested: 'Khách xin gia hạn',
  qs_api_voucher: 'QS lấy phiếu cho trang quán', qs_api_cafe_opened: 'QS mở chương trình ở quán', qs_api_cafe_closed: 'QS đóng chương trình ở quán', qs_api_unauthorized: 'API QS: sai chữ ký', qs_api_limit: 'API QS: quán hết phiếu hôm nay', extend_declined: 'Bỏ qua yêu cầu gia hạn',
};

// Vận hành độc lập: báo động trên trang Theo dõi kèm 1 câu "nên làm gì" để chủ không phải đoán.
export const ALERT_HINT = {
  code_orphan: 'Có người ngoài đang tự đăng nhập tài khoản này — đổi mật khẩu ngay (làm việc tay của tài khoản nếu đang chờ).',
  account_quarantined: 'Hãng báo mật khẩu / 2FA bị đổi — lấy lại tài khoản rồi làm việc tay bên trên (dán mật khẩu mới).',
  tool_sold_out: 'Mua thêm rồi nhập vào Kho tài khoản.',
  worker_task_stuck: 'Bot chưa làm xong (máy Mac tắt, hãng đổi giao diện, đòi xác minh người thật, hoặc hết ghế). Làm tay trên trang của hãng rồi bấm "Đã xong" ở việc tay bên trên.',
  voucher_guessing: 'Có máy đang dò mã phiếu — xem khách đó ở trang Khách, khoá máy nếu lặp lại.',
  qs_api_unauthorized: 'Có máy gọi API phiếu của QS sai chữ ký — kiểm QS_TICKET_KEY bên TBQ có trùng NFC_EVENT_TBQ_KEY bên QS không.',
  qs_api_cafe_opened: 'Tài vừa mở chương trình ở một quán mới (qua QS) → quán đã tự thêm. Xem lại số suất / ngày và kho cho quán này.',
  qs_api_limit: 'Quán dùng hết phiếu QS hôm nay — nâng "qsVoucherPerCafeDay" ở Cài đặt nếu quán đông thật.',
  extend_requested: 'Khách muốn dùng thêm — nhận tiền qua Zalo rồi bấm Gia hạn ở trang Gia hạn.',
  tool_daily_cap: 'Muốn giao thêm hôm nay: nâng "Lượt / ngày" ở trang Công cụ.',
  cafe_full: 'Muốn nhận thêm khách hôm nay: nâng "Suất / ngày" ở trang Quán.',
  card_locked: 'Link thẻ bị phát tán — vào trang quán đổi link thẻ rồi ghi lại chip.',
  card_anomaly: 'Theo dõi thêm; nếu lặp lại, đổi link thẻ.',
  ticket_forged: 'Có người dò link — kiểm QS_TICKET_KEY bên TBQ có trùng khoá bên QS không.',
  mail_hook_unauthorized: 'Kiểm MAIL_WEBHOOK_SECRET trong Cloudflare Worker.',
  mail_wrong_route: 'Địa chỉ này thiếu quy tắc riêng nên thư rơi vào hộp thư chung ma.tiembanquyen.site — khách không lấy được mã. Cloudflare → tiembanquyen.site → Email → Email Routing → Routing rules → Create address: gõ đúng địa chỉ này → Action "Send to a Worker" → tbq-mail. Thư cũ không chuyển lại được: khách bấm "Gửi lại mã" sau khi thêm quy tắc.',
  otp_send_failed: 'Kiểm kênh gửi mã (email: CF_EMAIL_TOKEN / gói Workers Paid / hạn mức gửi; SMS: tài khoản eSMS hết tiền / sai khoá) — khách đang không nhận được mã. Xem chi tiết lỗi trong sự kiện.',
  customer_report: 'Đọc lời khách, nhắn Zalo hỗ trợ nếu cần.',
  totp_missing: 'Mở tài khoản trong Kho và dán khoá 2FA.',
};

export const SLOT_STATUS = { active: 'Đang dùng', pending_approval: 'Đang nhận', pending_invite: 'Chờ mời vào nhóm', expired: 'Hết hạn', revoked: 'Thu hồi', rejected: 'Từ chối' };
export const ACCOUNT_STATUS = { ready: 'Sẵn sàng', needs_rotation: 'Chờ đổi mật khẩu', quarantined: 'Cách ly', retired: 'Ngừng dùng' };
export const LOGIN_TYPE = { email_code: 'Mã qua email', password: 'Mật khẩu', password_totp: 'Mật khẩu + mã 2FA', team_invite: 'Mời vào nhóm (Canva)', redeem: 'Mã / link nhận quà (1 lần)' };
export const REUSE = { rotate: 'Hết lượt → đổi mật khẩu rồi giao lại', once: 'Mỗi chỗ giao 1 lần rồi bỏ tài khoản (vd. tài khoản dùng thử 7 ngày)' };
export const TASK_KIND = { rotate: 'Đổi mật khẩu / làm mới + đăng xuất', invite_member: 'Mời vào nhóm', remove_member: 'Gỡ khỏi nhóm' };
export const END_REASON = { expired: 'hết hạn', revoked: 'thu hồi', rejected: 'từ chối', admin_revoked: 'chủ thu hồi', admin_cancelled: 'chủ huỷ trước khi mời',
  risk_high: 'rủi ro cao — tự từ chối', need_review: 'rủi ro vừa — tự từ chối', account_quarantined: 'tài khoản bị cách ly', no_account: 'hết tài khoản', refund: 'trả lại lượt', customer_erased: 'khách xoá dữ liệu', customer_locked: 'khách bị khoá' };
export const TASK_REASON = { slot_expired: 'khách cuối vừa hết hạn', slot_revoked: 'slot bị thu hồi', quarantine: 'tài khoản bị cách ly', claim: 'khách vừa nhận', setup: 'tài khoản mới — tạo Project trước khi giao', manual: 'chủ giao làm mới' };

// Icon nét 1.6px (kiểu TBQ UI Kit: nét theo màu chữ, không ô màu chuyển sắc). Chỉ là hình, không có chữ khách.
const ICON = {
  home: '<path d="M3.5 10.5 12 3.5l8.5 7"/><path d="M5.5 9v11h13V9"/><path d="M10 20v-5.5h4V20"/>',
  pulse: '<path d="M3 12h4l3-7.5 4 15 3-7.5h4"/>',
  check: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  grid: '<rect x="4" y="4" width="6.5" height="6.5" rx="1"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1"/>',
  box: '<path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5z"/><path d="M3.5 7.5 12 12l8.5-4.5M12 12v9"/>',
  palette: '<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.2 0 1.8-.9 1.4-1.9-.5-1.2.3-2.6 1.6-2.6h1.8a3.7 3.7 0 0 0 3.7-3.7C20.5 7.2 16.7 3.5 12 3.5z"/><circle cx="7.8" cy="11" r="1"/><circle cx="10.5" cy="7.3" r="1"/><circle cx="15" cy="7.8" r="1"/>',
  ticket: '<path d="M3.5 8.5V6h17v2.5a2.5 2.5 0 0 0 0 5V18h-17v-4.5a2.5 2.5 0 0 0 0-5z"/><path d="M14 7v1.5M14 11v2M14 15.5V17"/>',
  cup: '<path d="M4 8.5h12v5.5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M16 10.5h1.5a2.5 2.5 0 0 1 0 5H16"/><path d="M8 3.5v2.5M12 3.5v2.5"/>',
  users: '<circle cx="9" cy="8.5" r="3.5"/><path d="M2.5 20c.6-3.4 3.3-5.5 6.5-5.5s5.9 2.1 6.5 5.5"/><path d="M16 5.2a3.5 3.5 0 0 1 0 6.6M18 14.8c1.9.7 3.2 2.5 3.5 5.2"/>',
  key: '<circle cx="8" cy="15" r="4.5"/><path d="m11.2 11.8 8.3-8.3M16.5 6.5l2.5 2.5M14 9l2 2"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 6.5 8.5 6.5 8.5-6.5"/>',
  list: '<path d="M8.5 6H20M8.5 12H20M8.5 18H20"/><path d="M4 6h.5M4 12h.5M4 18h.5"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M2.5 12h3M18.5 12h3M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  out: '<path d="M14 4h4.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H14"/><path d="M10 16.5 5.5 12 10 7.5M5.5 12H15"/>',
  ext: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  alert: '<path d="M12 4 2.8 19.5h18.4z"/><path d="M12 10v4.5M12 17.2v.1"/>',
  enter: '<path d="M10 4h8.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H10"/><path d="M3.5 12H14M10.5 8.5 14 12l-3.5 3.5"/>',
  play: '<circle cx="12" cy="12" r="8.5"/><path d="m10 8.5 5 3.5-5 3.5z"/>',
  send: '<path d="M20.5 3.5 10.5 13.5M20.5 3.5 14 20.5l-3.5-7-7-3.5z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  chart: '<path d="M4 20V4M4 20h16"/><path d="M8 16v-4M12 16V8M16 16v-6"/>',
  bubble: '<path d="M4 5.5h16v10H9l-5 4z"/>',
  server: '<rect x="3.5" y="4" width="17" height="7" rx="1.5"/><rect x="3.5" y="13" width="17" height="7" rx="1.5"/><path d="M7 7.5h.5M7 16.5h.5M11 7.5h6M11 16.5h6"/>',
};
export const icon = (name) => raw(`<svg class="i" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICON[name] || ''}</svg>`);

// Thanh bên chia nhóm như app Bot nhắc hạn của Tiệm. [href, nhãn, icon, đếm]: đếm đỏ = việc phải làm, đếm xám = chỉ để biết.
const NAV = [
  ['Việc hôm nay', [
    ['/admin', 'Tổng quan', 'home'],
    ['/admin/live', 'Theo dõi', 'pulse', 'alerts'],
    ['/admin/tasks', 'Việc tay', 'check', 'tasks'],
    ['/admin/gia-han', 'Gia hạn', 'clock', 'extend'],
  ]],
  ['Kho hàng', [
    ['/admin/tools', 'Công cụ', 'grid'],
    ['/admin/accounts', 'Kho tài khoản', 'box', 'ready'],
    ['/admin/canva', 'Canva', 'palette', 'canva'],
    ['/admin/vouchers', 'Mã phiếu', 'ticket'],
  ]],
  ['Quán & khách', [
    ['/admin/cafes', 'Quán', 'cup', 'cafes'],
    ['/admin/customers', 'Khách', 'users'],
    ['/admin/slots', 'Slot', 'key', 'slots'],
  ]],
  ['Hệ thống', [
    ['/admin/mails', 'Thư', 'mail', 'orphans'],
    ['/admin/events', 'Nhật ký', 'list'],
    ['/admin/may-chu', 'Máy chủ', 'server', 'host'],
    ['/admin/settings', 'Cài đặt', 'gear'],
  ]],
];
const RED_COUNT = new Set(['alerts', 'tasks', 'extend', 'canva', 'orphans', 'host']);
const WEEKDAY = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
const VERSION = (() => { try { return JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version; } catch { return ''; } })();

/** "Thứ 5, 8/10/2026" theo giờ VN (off = phút lệch UTC). */
export function dayLabel(ms, off = 420) {
  const d = new Date(ms + off * 60000);
  return `${WEEKDAY[d.getUTCDay()]}, ${d.getUTCDate()}/${d.getUTCMonth() + 1}/${d.getUTCFullYear()}`;
}

/**
 * Khung trang quản trị: thanh bên (nhóm mục + đếm việc) | thanh trên (đường dẫn, tiêu đề, ngày, nút chính) + nội dung.
 * heading: tiêu đề trên trang (mặc định = title) · sub: dòng nhỏ dưới tiêu đề (mặc định = hôm nay) ·
 * crumbs: [[href, nhãn]…] trang cha · actions: nút bên phải thanh trên · nav: số đếm cho thanh bên.
 */
export function adminPage({ title, heading, sub, crumbs = [], actions = '', active, body, csrf, flash, flashError = false, live = false, nav = {}, today = '' }) {
  const head = html`<!doctype html>
<html lang="vi" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<meta name="theme-color" content="#f4f1ea">
<title>${title} — Quản trị TBQ</title>
<link rel="icon" href="${asset('logo.svg')}" type="image/svg+xml">
<link rel="stylesheet" href="${asset('tbq-ui.css')}">
<link rel="stylesheet" href="${asset('admin.css')}">
</head>`;
  const flashBox = flash ? html`<p class="flash${flashError ? ' err' : ''}" role="${flashError ? 'alert' : 'status'}">${flash}</p>` : '';
  if (!csrf) {
    return html`${head}
<body class="adm adm-out" data-csrf="">
<main class="adm-login">
  <div class="side-brand">${raw(TBQ_TAG)}<span><b>TBQ Space</b><small>Quản trị · Dùng thử</small></span></div>
  ${flashBox}
  ${body}
</main>
</body>
</html>`;
  }
  const count = (key) => {
    const n = key ? Number(nav[key] || 0) : 0;
    if (!n) return '';
    return RED_COUNT.has(key) ? html`<span class="nb">${n}</span>` : html`<span class="nq">${n}</span>`;
  };
  return html`${head}
<body class="adm" data-csrf="${csrf}"${live ? html` data-live="1"` : ''}>
<div class="adm-app">
<aside class="adm-side">
  <a class="side-brand" href="/admin">${raw(TBQ_TAG)}<span><b>TBQ Space</b><small>Quản trị · Dùng thử</small></span></a>
  <form class="side-search" method="get" action="/admin/customers" role="search">${icon('search')}<input name="q" placeholder="Tìm khách: email, SĐT" aria-label="Tìm khách theo email hoặc số điện thoại"></form>
  <nav class="side-nav" aria-label="Mục quản trị">
    ${NAV.map(([group, items]) => html`<div class="nav-g"><p class="nav-h">${group}</p>
      ${items.map(([href, label, ic, key]) => html`<a class="nav${href === active ? ' on' : ''}" href="${href}"${href === active ? html` aria-current="page"` : ''}>${icon(ic)}<span>${label}</span>${count(key)}</a>`)}
    </div>`)}
  </nav>
  <div class="side-foot">
    <a href="/" target="_blank" rel="noopener">${icon('ext')}Mở trang khách</a>
    <form method="post" action="/admin/logout">${csrfField(csrf)}<button type="submit">${icon('out')}Đăng xuất</button></form>
    <p>Bản ${VERSION} · giờ Việt Nam</p>
  </div>
</aside>
<main class="adm-main">
  <header class="adm-top">
    <div class="top-t">
      ${crumbs.length ? html`<p class="crumbs">${crumbs.map(([href, label]) => html`<a href="${href}">${label}</a><span aria-hidden="true">›</span>`)}</p>` : ''}
      <h1>${heading ?? title}</h1>
      <p class="top-sub">${sub ?? today}</p>
    </div>
    ${actions ? html`<div class="top-act">${actions}</div>` : ''}
  </header>
  ${flashBox}
  ${body}
</main>
</div>
<script src="${asset('admin.js')}" defer></script>
</body>
</html>`;
}

/** Tiêu đề một khối: "Tên  (số)  ·  ghi chú nhỏ  ·  Mở … ›" (link sang trang liên quan). */
export function secHead(title, { n = null, note = '', link = null, id = '' } = {}) {
  return html`<div class="sec"${id ? html` id="${id}"` : ''}><h2>${title}${n != null ? html` <span class="sec-n">${n}</span>` : ''}</h2>${note ? html`<span class="sec-note">${note}</span>` : ''}${link ? html`<a class="sec-link" href="${link[0]}">${link[1]} ›</a>` : ''}</div>`;
}

/** Ô số liệu (kiểu thẻ "Hết hạn hôm nay" của Bot nhắc hạn). href → bấm sang trang chi tiết. tone: info|success|warning|danger|plum|accent. hot = tô nhẹ khi cần để ý. */
export function stat(label, value, { href = '', icon: ic = 'list', tone = 'accent', sub = '', hot = false, cls: extra = '' } = {}) {
  const zero = value === 0 || value === '0';
  const cls = `stat${hot ? ` hot ${tone}` : ''}${zero ? ' zero' : ''}${extra ? ` ${extra}` : ''}`;
  const inner = html`<span class="stat-l"><span class="stat-ic ${tone}">${icon(ic)}</span>${label}</span><b class="stat-v">${value}</b>${sub ? html`<span class="stat-s">${sub}</span>` : ''}`;
  return href ? html`<a class="${cls}" href="${href}">${inner}</a>` : html`<div class="${cls}">${inner}</div>`;
}

/** Hàng lọc dạng chip: [[href, nhãn, số|null, đang chọn]…]. */
export const chips = (items) => html`<nav class="chips">${items.map(([href, label, n, on]) => html`<a class="chip${on ? ' on' : ''}" href="${href}"${on ? html` aria-current="true"` : ''}>${label}${n != null ? html`<span class="chip-n">${n}</span>` : ''}</a>`)}</nav>`;

/** Link chéo giữa các trang: công cụ ↔ kho ↔ slot ↔ khách ↔ quán. */
export const link = {
  tool: (id, name) => (id ? html`<a href="/admin/tools/${id}">${name}</a>` : name || ''),
  acc: (id, email) => (id ? html`<a class="acc" href="/admin/accounts/${id}"><code>${email}</code></a>` : ''),
  cust: (id, phone) => (id ? html`<a href="/admin/customers/${id}">${!phone ? `#${id}` : phone.startsWith('del:') ? `(đã xoá) #${id}` : maskPhone(phone)}</a>` : ''),
  cafe: (id, name, extra = '') => (id ? html`<a href="/admin/cafes/${id}">${name}</a>${extra ? ` — ${extra}` : ''}` : ''),
  slot: (id) => html`<a href="/admin/slots?id=${id}">#${id}</a>`,
};

export const csrfField = (csrf) => html`<input type="hidden" name="_csrf" value="${csrf}">`;

/** Nút bấm nằm trong 1 form POST nhỏ. fields: {name: value} thêm vào form. */
export function postButton(action, label, csrf, { confirm = null, cls = 'btn-mini', fields = {} } = {}) {
  return html`<form method="post" action="${action}" class="inline"${confirm ? html` data-confirm="${confirm}"` : ''}>${csrfField(csrf)}${Object.entries(fields).map(([k, v]) => html`<input type="hidden" name="${k}" value="${v}">`)}<button class="${cls}">${label}</button></form>`;
}

export function table(headers, rows, empty = 'Chưa có dữ liệu.', { cls = '' } = {}) {
  if (!rows.length) return html`<p class="empty">${empty}</p>`;
  return html`<div class="tscroll"><table${cls ? html` class="${cls}"` : ''}><thead><tr>${headers.map((h) => html`<th>${h}</th>`)}</tr></thead>
<tbody>${rows.map((r) => html`<tr>${r.map((c) => html`<td>${c}</td>`)}</tr>`)}</tbody></table></div>`;
}

// Giờ dạng "00:02 08/10" với khoảng trắng không ngắt → không gãy dòng giữa giờ và ngày trong bảng.
export const t = (ms, off = 420) => (ms ? fmtLocal(ms, off).replace(' ', '\u00a0') : '—');
export const sev = (s) => html`<span class="badge ${s === 'red' ? 'red' : s === 'yellow' ? 'yellow' : ''}">${s === 'red' ? 'Đỏ' : s === 'yellow' ? 'Vàng' : 'Thường'}</span>`;
/** Nhãn trạng thái có chấm màu. kind: ok | red | yellow | info | plum | '' (xám). */
export const badge = (text, kind = '') => html`<span class="badge ${kind}">${text}</span>`;
export const ACCOUNT_TONE = { ready: 'ok', needs_rotation: 'yellow', quarantined: 'red', retired: '' };
export const SLOT_TONE = { active: 'ok', pending_approval: 'info', pending_invite: 'info', expired: '', revoked: 'red', rejected: '' };
export const tile = (label, value, kind = '') => stat(label, value, { tone: kind === 'red' ? 'danger' : kind === 'yellow' ? 'warning' : 'accent', hot: !!kind });

/** Ô CSV an toàn: bọc ngoặc kép, chặn công thức Excel (=, +, -, @ ở đầu). */
export function csvCell(v) {
  const s = String(v ?? '');
  return `"${(/^[=+\-@\t\r]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
}
export const csvFile = (rows) => `\uFEFF${rows.map((r) => r.map(csvCell).join(',')).join('\r\n')}`;

/** Tóm tắt dữ liệu của 1 sự kiện thành 1 dòng. */
export const TICKET_ERROR = { invalid: 'vé sai', expired: 'vé cũ', used_elsewhere: 'mở trên máy khác' };

/** Chi tiết 1 sự kiện thành 1 dòng chữ (dùng cả ở Theo dõi — chữ thường, không HTML). type: để đọc đúng nghĩa từng trường. */
export function eventSummary(data, type = '') {
  if (!data) return '';
  let d = data;
  if (typeof d === 'string') { try { d = JSON.parse(d); } catch { return d.slice(0, 160); } }
  const parts = [];
  if (d.subject) parts.push(`"${d.subject}"`);
  if (d.from && type.startsWith('mail_')) parts.push(`từ ${d.from}`);
  if (d.message) parts.push(`"${d.message}"`);
  // Lý do kết thúc slot là mã (admin_revoked…) → chữ như trang Slot.
  if (d.reason) parts.push(type.startsWith('slot_') ? END_REASON[d.reason] || d.reason : d.reason);
  // Lỗi bot (kèm đường dẫn ảnh chụp lỗi) — trước không hiện. Vé bị từ chối: mã lỗi → chữ.
  if (d.error) parts.push(type === 'ticket_rejected' ? TICKET_ERROR[d.error] || d.error : d.error);
  if (d.tool) parts.push(d.tool);
  if (d.status && type === 'account_updated') parts.push(`→ ${ACCOUNT_STATUS[d.status] || d.status}`);
  if (d.added) parts.push(`+${d.added} tài khoản${d.skipped ? `, bỏ ${d.skipped}` : ''}`);
  if (d.moved) parts.push(`${d.moved} tài khoản${d.label ? ` nhãn "${d.label}"` : ''}`);
  if (d.kho) parts.push(`→ ${d.kho}`);
  if (d.seat) parts.push(`Slot ${d.seat}`);
  if (d.score != null) parts.push(`điểm ${d.score}`);
  if (Array.isArray(d.reasons)) parts.push(d.reasons.map((r) => r.text).join(', '));
  if (d.devicesLastHour) parts.push(`${d.devicesLastHour} máy/giờ`);
  // Chỉ khi QS gửi mã quán chưa gán mới cần "điền vào trang quán"; quán QS mở / đóng bình thường thì chỉ ghi mã.
  if (d.shop) parts.push(type === 'qs_shop_unmapped' ? `mã quán QS "${d.shop}" — điền vào trang quán` : `QS "${d.shop}"${d.created ? ' · quán mới tự thêm' : ''}`);
  if (type === 'login' && d.isNew) parts.push('khách mới');
  if (d.worker && !d.by) parts.push(`bot ${d.worker}${d.attempt ? ` · lần ${d.attempt}` : ''}`);
  if (d.by) parts.push(`bởi ${d.by}`);
  if (d.points) parts.push(`+${d.points}`);
  return parts.join(' · ').slice(0, 240);
}
