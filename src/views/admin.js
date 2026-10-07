// Khung và các mảnh giao diện dùng chung của trang quản trị.
import { html } from '../lib/http.js';
import { fmtLocal } from '../lib/time.js';
import { asset } from './asset.js';

export const EVENT_LABEL = {
  login: 'Đăng nhập', otp_sent: 'Gửi OTP', otp_wrong: 'Nhập sai OTP', otp_send_failed: 'Gửi OTP lỗi',
  ticket_rejected: 'Link từ trang quán bị từ chối', ticket_forged: 'Nhiều link giả vào quán',
  claim_green: 'Nhận slot (xanh)', claim_yellow_passed: 'Ca vàng được cho qua (theo cài đặt)', claim_yellow_rejected: 'Ca vàng bị từ chối tự động', claim_red: 'Từ chối nhận slot',
  slot_started: 'Bắt đầu slot', slot_pending_invite: 'Chờ bot mời vào nhóm', worker_task_taken: 'Bot nhận việc', worker_task_failed: 'Bot làm lỗi',
  worker_task_stuck: 'Bot chưa làm được — làm tay', worker_unauthorized: 'Sai mã bot', slot_expired: 'Hết hạn slot', slot_revoked: 'Thu hồi slot', slot_rejected: 'Huỷ slot đang chờ',
  code_requested: 'Lấy mã', code_delivered: 'Đã giao mã', code_replaced: 'Thay mã mới', code_late: 'Mã về trễ', code_orphan_wait: 'Mã chờ người nhận',
  code_orphan: 'Mã mồ côi', code_second_device: 'Lấy mã từ máy khác',
  mail_unknown_sender: 'Thư lạ người gửi', mail_parse_failed: 'Không đọc được mã', mail_password_reset: 'Thư đặt lại mật khẩu',
  mail_wrong_route: 'Thư mã về nhầm hộp thư', mail_magic_link: 'Thư đăng nhập bằng link', mail_new_signin: 'Đăng nhập mới không qua Lấy mã', mail_hook_unauthorized: 'Webhook thư sai chữ ký',
  account_quarantined: 'Cách ly tài khoản', task_done: 'Xong việc tay',
  customer_locked: 'Khoá khách', customer_unlocked: 'Mở khoá khách', customer_erased: 'Xoá dữ liệu khách', strike: 'Ghi vi phạm', risk_added: 'Cộng điểm rủi ro',
  device_locked: 'Khoá máy', device_unlocked: 'Mở khoá máy', device_restored: 'Khôi phục mã máy',
  customer_report: 'Khách báo lỗi', zalo_click: 'Bấm mua qua Zalo', qs_shop_unmapped: 'Mã quán QS chưa có trong TBQ',
  tap_replay: 'Link thẻ NFC chép lại (đã chặn)', tap_forged: 'Link thẻ NFC giả', tap_jump: 'Bộ đếm thẻ NFC nhảy bất thường', tap_locked: 'Chạm thẻ đang khoá', tap_closed: 'Chạm thẻ khi quán đóng / tạm dừng',
  card_locked: 'Đã tự khoá thẻ NFC', card_anomaly: 'Thẻ NFC bị chạm bất thường', card_rotated: 'Đổi link thẻ NFC', card_unlocked: 'Mở khoá thẻ NFC',
  admin_login: 'Chủ đăng nhập quản trị', admin_login_failed: 'Sai mật khẩu quản trị', settings_saved: 'Lưu cài đặt',
  accounts_imported: 'Nhập kho tài khoản', redeem_imported: 'Nhập kho mã / link', account_updated: 'Sửa tài khoản kho',
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
export const END_REASON = { expired: 'hết hạn', revoked: 'thu hồi', rejected: 'từ chối', account_quarantined: 'tài khoản bị cách ly', no_account: 'hết tài khoản', refund: 'trả lại lượt' };
export const TASK_REASON = { slot_expired: 'khách cuối vừa hết hạn', slot_revoked: 'slot bị thu hồi', quarantine: 'thư lạ từ hãng — tài khoản bị cách ly', claim: 'khách vừa nhận', setup: 'tài khoản mới — tạo Project trước khi giao', manual: 'chủ giao làm mới' };

const NAV = [
  ['/admin', 'Tổng quan'], ['/admin/live', 'Theo dõi'], ['/admin/tasks', 'Việc tay'], ['/admin/cafes', 'Quán'],
  ['/admin/tools', 'Công cụ'], ['/admin/accounts', 'Kho tài khoản'], ['/admin/canva', 'Canva'], ['/admin/vouchers', 'Mã phiếu'], ['/admin/gia-han', 'Gia hạn'], ['/admin/customers', 'Khách'], ['/admin/slots', 'Slot'],
  ['/admin/mails', 'Thư'], ['/admin/events', 'Nhật ký'], ['/admin/settings', 'Cài đặt'],
];

export function adminPage({ title, active, body, csrf, flash, live = false }) {
  return html`<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${title} — Quản trị TBQ</title>
<link rel="stylesheet" href="${asset('style.css')}">
<link rel="stylesheet" href="${asset('admin.css')}">
</head>
<body class="admin" data-csrf="${csrf || ''}"${live ? html` data-live="1"` : ''}>
${csrf ? html`<nav class="anav">
  ${NAV.map(([href, label]) => html`<a href="${href}"${href === active ? html` class="on"` : ''}>${label}</a>`)}
  <form method="post" action="/admin/logout" class="inline">${csrfField(csrf)}<button class="link">Đăng xuất</button></form>
</nav>` : ''}
<main class="awrap">
${flash ? html`<p class="flash">${flash}</p>` : ''}
${body}
</main>
<script src="${asset('admin.js')}" defer></script>
</body>
</html>`;
}

export const csrfField = (csrf) => html`<input type="hidden" name="_csrf" value="${csrf}">`;

/** Nút bấm nằm trong 1 form POST nhỏ. fields: {name: value} thêm vào form. */
export function postButton(action, label, csrf, { confirm = null, cls = 'btn-mini', fields = {} } = {}) {
  return html`<form method="post" action="${action}" class="inline"${confirm ? html` data-confirm="${confirm}"` : ''}>${csrfField(csrf)}${Object.entries(fields).map(([k, v]) => html`<input type="hidden" name="${k}" value="${v}">`)}<button class="${cls}">${label}</button></form>`;
}

export function table(headers, rows, empty = 'Chưa có dữ liệu.') {
  if (!rows.length) return html`<p class="muted">${empty}</p>`;
  return html`<div class="tscroll"><table><thead><tr>${headers.map((h) => html`<th>${h}</th>`)}</tr></thead>
<tbody>${rows.map((r) => html`<tr>${r.map((c) => html`<td>${c}</td>`)}</tr>`)}</tbody></table></div>`;
}

export const t = (ms, off = 420) => (ms ? fmtLocal(ms, off) : '—');
export const sev = (s) => html`<span class="sev sev-${s}">${s === 'red' ? 'ĐỎ' : s === 'yellow' ? 'VÀNG' : 'info'}</span>`;
export const badge = (text, kind = '') => html`<span class="badge ${kind}">${text}</span>`;
export const tile = (label, value, kind = '') => html`<div class="tile ${kind}"><b>${value}</b><span>${label}</span></div>`;

/** Ô CSV an toàn: bọc ngoặc kép, chặn công thức Excel (=, +, -, @ ở đầu). */
export function csvCell(v) {
  const s = String(v ?? '');
  return `"${(/^[=+\-@\t\r]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
}
export const csvFile = (rows) => `\uFEFF${rows.map((r) => r.map(csvCell).join(',')).join('\r\n')}`;

/** Tóm tắt dữ liệu của 1 sự kiện thành 1 dòng. */
export function eventSummary(data) {
  if (!data) return '';
  let d = data;
  if (typeof d === 'string') { try { d = JSON.parse(d); } catch { return d.slice(0, 160); } }
  const parts = [];
  if (d.subject) parts.push(`"${d.subject}"`);
  if (d.message) parts.push(`"${d.message}"`);
  if (d.reason) parts.push(d.reason);
  if (d.tool) parts.push(d.tool);
  if (d.score != null) parts.push(`điểm ${d.score}`);
  if (Array.isArray(d.reasons)) parts.push(d.reasons.map((r) => r.text).join(', '));
  if (d.devicesLastHour) parts.push(`${d.devicesLastHour} máy/giờ`);
  if (d.shop) parts.push(`mã quán QS "${d.shop}" — điền vào trang quán`);
  if (d.by) parts.push(`bởi ${d.by}`);
  if (d.points) parts.push(`+${d.points}`);
  return parts.join(' · ').slice(0, 240);
}
