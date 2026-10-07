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
  codeMaxRequests: [4, 'Số lần lấy mã tối đa / slot (lần nào cũng phải đang ở quán và đúng máy đã nhận slot)'],
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
  timezoneOffsetMin: [420, 'Múi giờ (phút so với UTC)'],
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

/** Ép kiểu theo giá trị mặc định rồi lưu. Ném lỗi nếu key lạ hoặc sai kiểu. */
export function saveSetting(db, key, value) {
  if (!(key in SETTING_DEFS)) throw new Error(`Không có tham số ${key}`);
  const def = SETTING_DEFS[key][0];
  let v = value;
  if (v === '' || v === undefined) v = null;
  if (v !== null && (typeof def === 'number' || (def === null && /Hour$/.test(key)))) {
    v = Number(v);
    if (!Number.isFinite(v)) throw new Error(`${key} phải là số`);
  }
  if (v === null && def !== null) throw new Error(`${key} không được để trống`);
  if (key === 'voucherNeedsCafe' && ![0, 1].includes(v)) throw new Error('voucherNeedsCafe chỉ nhận 0 hoặc 1');
  if (key === 'workspacePrefix' && !/^[\p{L}\p{N} _-]{1,20}$/u.test(String(v))) throw new Error('workspacePrefix: 1–20 chữ / số / khoảng trắng');
  if (key === 'yellowAction' && !['reject', 'approve'].includes(v)) throw new Error('yellowAction chỉ nhận reject hoặc approve');
  run(db, 'INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, JSON.stringify(v));
}

/** Getter có cache; gọi invalidate() sau khi lưu. */
export function createSettingsGetter(db) {
  let cache = null;
  const get = () => (cache ??= loadSettings(db));
  get.invalidate = () => { cache = null; };
  return get;
}
