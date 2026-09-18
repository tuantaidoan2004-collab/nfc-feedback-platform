/**
 * "vài giây trước", "3 giờ trước", "7 ngày trước"… as YouTube writes it (lát F4, Tài 2026-09-18). The exact date and
 * time go in the ⓘ details, not in the line.
 */
export function relativeTime(iso: string, now: number = Date.now()) {
  const seconds = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return 'vài giây trước';
  const minutes = Math.floor(seconds / 60); if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.floor(minutes / 60); if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24); if (days < 7) return `${days} ngày trước`;
  if (days < 30) return `${Math.floor(days / 7)} tuần trước`;
  if (days < 365) return `${Math.floor(days / 30)} tháng trước`;
  return `${Math.floor(days / 365)} năm trước`;
}
