// Thời gian: lưu unix ms (UTC). "Ngày" và "giờ" tính theo múi giờ Việt Nam (offset phút, mặc định 420 = UTC+7).

export const SEC = 1000;
export const MIN = 60 * SEC;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;

export function localParts(ms, offsetMin = 420) {
  const d = new Date(ms + offsetMin * MIN);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
  };
}

const p2 = (n) => String(n).padStart(2, '0');

/** "2026-10-05" theo giờ địa phương. */
export function localDayKey(ms, offsetMin = 420) {
  const t = localParts(ms, offsetMin);
  return `${t.year}-${p2(t.month)}-${p2(t.day)}`;
}

/** Thời điểm 00:00 địa phương của ngày chứa ms. */
export function startOfLocalDay(ms, offsetMin = 420) {
  const shifted = ms + offsetMin * MIN;
  return shifted - (((shifted % DAY) + DAY) % DAY) - offsetMin * MIN;
}

/** Thời điểm 00:00 ngày 1 của tháng địa phương chứa ms. */
export function startOfLocalMonth(ms, offsetMin = 420) {
  const t = localParts(ms, offsetMin);
  return Date.UTC(t.year, t.month - 1, 1) - offsetMin * MIN;
}

/** Lần tới đồng hồ VN chỉ đúng `hour` giờ (sau nowMs). Vd. 23:00 → 6h sáng hôm sau; 02:00 → 6h sáng cùng ngày. */
export function nextLocalHour(nowMs, hour, offsetMin = 420) {
  let t = startOfLocalDay(nowMs, offsetMin) + hour * HOUR;
  while (t <= nowMs) t += DAY;
  return t;
}

export const localHour = (ms, offsetMin = 420) => localParts(ms, offsetMin).hour;

/** Giờ h có nằm trong [start, end) không. Hỗ trợ khoảng qua nửa đêm (22 → 6). start=end hoặc null → false. */
export function inHourRange(h, start, end) {
  if (start == null || end == null || start === end) return false;
  return start < end ? h >= start && h < end : h >= start || h < end;
}

/** "21:05 05/10" */
export function fmtLocal(ms, offsetMin = 420) {
  if (!ms) return '';
  const t = localParts(ms, offsetMin);
  return `${p2(t.hour)}:${p2(t.minute)} ${p2(t.day)}/${p2(t.month)}`;
}
