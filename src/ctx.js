// "ctx" là đối tượng phụ thuộc truyền vào mọi hàm domain: db, cấu hình, đồng hồ, OTP.
// Báo động không gửi đi đâu: ghi vào bảng events (mức red / yellow), trang quản trị "Trực duyệt" đọc thẳng từ đó.
import { createSettingsGetter } from './lib/settings.js';

function defaultLog(level, msg, data) {
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...(data || {}) });
  if (level === 'error' || level === 'warn') console.error(line);
  else console.log(line);
}

export function createCtx({ config, db, otp, now, log }) {
  return {
    config,
    db,
    now: now || (() => Date.now()),
    log: log || defaultLog,
    otp: otp || null,
    settings: createSettingsGetter(db),
  };
}
