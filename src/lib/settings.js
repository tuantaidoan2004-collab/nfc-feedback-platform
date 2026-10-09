// Tham số chỉnh được trên trang quản trị. Giá trị lưu trong bảng settings (JSON), thiếu thì dùng mặc định.
import { all, run } from '../db/index.js';
import { QS_EVENT } from '../qs-event.js';

/** [mặc định, mô tả hiển thị trên trang quản trị] */
export const SETTING_DEFS = {
  // Hạn mức khách
  activeSlotsPerCustomer: [1, 'Số slot đang dùng tối đa / khách'],
  toolsPerDayPerCustomer: [1, 'Số công cụ nhận tối đa / khách / ngày'],
  monthlyCapPerCustomer: [4, 'Số lần nhận tối đa / khách / tháng'],
  maxPhonesPerDevice: [1, 'Số SĐT tối đa trên 1 máy (vượt → chặn)'],
  cardDailyClaims: [6, 'Số slot tối đa / 1 thẻ NFC riêng của Tiệm / ngày'],
  reportsPerHour: [3, 'Số lần khách bấm "Báo lỗi" tối đa / giờ'],
  // OTP
  otpTtlSec: [300, 'OTP hết hạn sau (giây)'],
  otpMaxAttempts: [5, 'Số lần nhập sai OTP tối đa'],
  otpPerPhonePerHour: [3, 'Số OTP gửi tối đa / SĐT / giờ'],
  otpPerDevicePerHour: [5, 'Số OTP gửi tối đa / máy / giờ'],
  otpPerIpPerHour: [30, 'Số OTP gửi tối đa / IP / giờ'],
  sessionDays: [7, 'Phiên đăng nhập của khách kéo dài (ngày)'],
  // Khách đang ở quán (vé từ trang quán QS — Tiệm không đặt gì ở quán)
  ticketTtlMin: [30, 'Link "Nhận công cụ" từ trang quán còn dùng được trong (phút) — tính từ lúc khách mở trang quán bằng thẻ / mã QR'],
  entryTtlMin: [30, 'Sau khi vào (vé trang quán / chạm thẻ), được nhận công cụ và lấy mã trong (phút)'],
  // Thẻ NFC riêng của Tiệm (quán chưa dùng QS)
  tapCounterMaxJump: [500, 'Bộ đếm chip tăng quá số này → nghi giả mạo'],
  cardTapsPerHourAlert: [30, 'Số máy khác nhau mở 1 thẻ trong 1 giờ → báo động'],
  cardTapsPerHourLock: [80, 'Số máy khác nhau mở 1 thẻ trong 1 giờ → tự khoá thẻ'],
  // Lấy mã
  codeWindowSec: [180, 'Mỗi lượt "Lấy mã" mở trong (giây)'],
  workerAlertMin: [10, 'Bot Canva quá (phút) chưa mời / gỡ xong → báo chủ làm tay (máy chạy bot có thể đang tắt)'],
  endHourCloseMin: [60, 'Công cụ hết lượt cùng giờ (ChatGPT, Claude — 6h sáng): ngừng nhận trước giờ hết (phút), để khách không nhận rồi chỉ dùng được vài phút. 0 = không ngừng'],
  voucherNeedsCafe: [0, 'Công cụ cần mã phiếu (ChatGPT, Claude): 0 = có mã phiếu là lấy được mã (phiếu chỉ phát ở quán) · 1 = vừa cần mã phiếu vừa phải đang ở quán'],
  autoVoucherPerDay: [2, 'Chạm thẻ NFC / mã QR trên bàn (vé từ trang quán QS hoặc thẻ của Tiệm) → tự có phiếu lấy mã: tối đa số phiếu này / máy / ngày và / SĐT / ngày. 0 = tắt (chỉ dùng phiếu giấy)'],
  autoVoucherTtlMin: [60, 'Phiếu tự động (chạm thẻ) và phiếu QS lấy qua API còn dùng được trong (phút)'],
  qsVoucherPerCafeDay: [60, 'API cho QS (trang quán hiện mã phiếu): tối đa số phiếu / quán / ngày'],
  voucherFailsPer10Min: [5, 'Nhập sai mã phiếu quá số lần này / máy / 10 phút → tạm khoá ô nhập mã phiếu'],
  workspacePrefix: ['Slot', 'Tên Project (workspace) trên tài khoản dùng chung = chữ này + số chỗ, vd. "Slot 3". Đổi thì bot tạo lại theo tên mới'],
  maxExtendDays: [7, 'Gia hạn tối đa (ngày) tính từ hôm nay'],
  codeMaxRequests: [4, 'Số mã tối đa / slot (1 máy) cho món không đặt riêng — chỉ tính mã đã về tới khách; lần nào cũng phải đang ở quán và đúng máy'],
  // Điểm rủi ro
  riskYellow: [30, 'Điểm từ mức này → mức vàng (xử lý theo "Ca vàng" bên dưới)'],
  riskRed: [60, 'Điểm từ mức này → từ chối'],
  riskDecayPerDay: [10, 'Điểm rủi ro tích luỹ giảm mỗi ngày'],
  peakStartHour: [19, 'Giờ cao điểm bắt đầu'],
  peakEndHour: [23, 'Giờ cao điểm kết thúc'],
  yellowAction: ['reject', 'Ca vàng (rủi ro vừa) khi nhận slot: reject = từ chối · approve = cho qua (không ai duyệt tay)'],
  // Lưu trữ dữ liệu (Luật BVDLCN)
  retentionMailBodyHours: [24, 'Xoá nội dung thư sau (giờ)'],
  retentionIpDays: [30, 'Xoá IP sau (ngày)'],
  retentionEventsDays: [180, 'Xoá nhật ký sau (ngày)'],
  // Khác
  consentVersion: ['2026-10', 'Phiên bản điều khoản đồng ý'],
  eventTitle: [QS_EVENT.program, 'Tên chương trình trên các trang của Tiệm (khối trên trang quán của QS tên "Công cụ làm việc", nút "Nhận công cụ làm việc miễn phí")'],
  zaloUrl: ['https://zalo.me/0988428496', 'Link Zalo mua gói trả phí'],
  aboutUrl: ['https://tiembanquyen.com', 'Nút "Về chúng tôi" (khối Công cụ làm việc trên trang quán QS) mở link này — dán link tab "Về chúng tôi" trên tiembanquyen.com khi làm xong. Phải bắt đầu bằng https://'],
  timezoneOffsetMin: [420, 'Múi giờ (phút so với UTC)'],
};

/**
 * Khoảng cho phép của tham số số (số nguyên). Trước đây nhận mọi số → gõ nhầm 1 ô là hỏng cả hệ thống
 * (vd. OTP hết hạn sau 0 giây = không ai đăng nhập được; xoá nhật ký sau 0 ngày = mất hết nhật ký).
 */
export const SETTING_RANGE = {
  activeSlotsPerCustomer: [1, 10], toolsPerDayPerCustomer: [1, 10], monthlyCapPerCustomer: [1, 100], maxPhonesPerDevice: [1, 10],
  cardDailyClaims: [1, 500], reportsPerHour: [1, 60],
  otpTtlSec: [60, 1800], otpMaxAttempts: [1, 20], otpPerPhonePerHour: [1, 30], otpPerDevicePerHour: [1, 60], otpPerIpPerHour: [1, 1000], sessionDays: [1, 90],
  ticketTtlMin: [5, 240], entryTtlMin: [5, 240],
  tapCounterMaxJump: [1, 100000], cardTapsPerHourAlert: [1, 10000], cardTapsPerHourLock: [1, 10000],
  codeWindowSec: [60, 900], workerAlertMin: [1, 240], endHourCloseMin: [0, 240], voucherNeedsCafe: [0, 1],
  autoVoucherPerDay: [0, 20], autoVoucherTtlMin: [5, 1440], qsVoucherPerCafeDay: [0, 1000], voucherFailsPer10Min: [1, 50],
  maxExtendDays: [1, 30], codeMaxRequests: [1, 20],
  riskYellow: [1, 1000], riskRed: [1, 1000], riskDecayPerDay: [0, 100], peakStartHour: [0, 23], peakEndHour: [0, 23],
  retentionMailBodyHours: [1, 720], retentionIpDays: [1, 365], retentionEventsDays: [7, 3650],
  timezoneOffsetMin: [-720, 840],
};

/** Nhóm trên trang Cài đặt: [tiêu đề, tham số đầu nhóm] (theo thứ tự SETTING_DEFS). */
export const SETTING_GROUPS = [
  ['Hạn mức khách', 'activeSlotsPerCustomer'], ['OTP & phiên đăng nhập', 'otpTtlSec'], ['Khách đang ở quán', 'ticketTtlMin'],
  ['Thẻ NFC riêng của Tiệm', 'tapCounterMaxJump'], ['Lấy mã, phiếu, gia hạn', 'codeWindowSec'], ['Điểm rủi ro', 'riskYellow'],
  ['Lưu trữ dữ liệu (Luật BVDLCN)', 'retentionMailBodyHours'], ['Khác', 'consentVersion'],
];

/** Ô 2 lựa chọn → hiện thành ô chọn thay vì ô gõ. */
export const SETTING_CHOICES = {
  voucherNeedsCafe: { 0: '0 — có mã phiếu là lấy được mã', 1: '1 — cần mã phiếu và phải đang ở quán' },
  yellowAction: { reject: 'reject — từ chối', approve: 'approve — cho qua' },
};

export const DEFAULT_SETTINGS = Object.fromEntries(Object.entries(SETTING_DEFS).map(([k, [v]]) => [k, v]));

export function loadSettings(db) {
  const s = { ...DEFAULT_SETTINGS };
  for (const row of all(db, 'SELECT key, value FROM settings')) {
    if (!(row.key in SETTING_DEFS)) continue;
    try { s[row.key] = JSON.parse(row.value); } catch { /* giữ mặc định */ }
  }
  return s;
}

/** Ép kiểu theo giá trị mặc định + kiểm khoảng. → giá trị đã ép. Ném lỗi (câu cho chủ đọc) nếu sai. */
export function checkSetting(key, value) {
  if (!(key in SETTING_DEFS)) throw new Error(`Không có tham số ${key}`);
  const def = SETTING_DEFS[key][0];
  let v = value;
  if (typeof v === 'string') v = v.trim();
  if (v === '' || v === undefined) v = null;
  if (v !== null && (typeof def === 'number' || (def === null && /Hour$/.test(key)))) {
    v = Number(v);
    if (!Number.isFinite(v)) throw new Error(`${key} phải là số`);
  }
  if (v === null && def !== null) throw new Error(`${key} không được để trống`);
  const range = SETTING_RANGE[key];
  if (range && v !== null && (!Number.isInteger(v) || v < range[0] || v > range[1])) throw new Error(`${key} phải là số nguyên từ ${range[0]} đến ${range[1]}`);
  if (key === 'voucherNeedsCafe' && ![0, 1].includes(v)) throw new Error('voucherNeedsCafe chỉ nhận 0 hoặc 1');
  if (key === 'workspacePrefix' && !/^[\p{L}\p{N} _-]{1,20}$/u.test(String(v))) throw new Error('workspacePrefix: 1–20 chữ / số / khoảng trắng');
  if (key === 'aboutUrl' && !/^https:\/\/[^\s"'<>]+$/.test(String(v))) throw new Error('aboutUrl phải là link bắt đầu bằng https://');
  // Link Zalo nằm trên mọi trang khách → chỉ nhận https:// (trước nhận cả "javascript:…").
  if (key === 'zaloUrl' && !/^https:\/\/[^\s"'<>]+$/.test(String(v))) throw new Error('zaloUrl phải là link bắt đầu bằng https://');
  if (key === 'yellowAction' && !['reject', 'approve'].includes(v)) throw new Error('yellowAction chỉ nhận reject hoặc approve');
  if ((key === 'consentVersion' || key === 'eventTitle') && String(v).length > (key === 'eventTitle' ? 80 : 20)) throw new Error(`${key} dài quá`);
  return v;
}

/** Kiểm các tham số đi cặp (sau khi gộp giá trị mới vào giá trị đang dùng). → [câu lỗi] */
export function pairProblems(s) {
  const out = [];
  if (s.riskYellow >= s.riskRed) out.push(`Điểm vàng (${s.riskYellow}) phải nhỏ hơn điểm từ chối (${s.riskRed})`);
  if (s.cardTapsPerHourLock < s.cardTapsPerHourAlert) out.push(`Số máy / giờ để tự khoá thẻ (${s.cardTapsPerHourLock}) không được nhỏ hơn số máy để báo động (${s.cardTapsPerHourAlert})`);
  if (s.timezoneOffsetMin % 15) out.push('Múi giờ phải là bội của 15 phút (Việt Nam: 420)');
  return out;
}

export function saveSetting(db, key, value) {
  const v = checkSetting(key, value);
  run(db, 'INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, JSON.stringify(v));
}

/** Getter có cache; gọi invalidate() sau khi lưu. */
export function createSettingsGetter(db) {
  let cache = null;
  const get = () => (cache ??= loadSettings(db));
  get.invalidate = () => { cache = null; };
  return get;
}
