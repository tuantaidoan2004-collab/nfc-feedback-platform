// Số liệu cho trang tổng quan, lệnh /stats và bản tóm tắt buổi sáng.
import { get, all } from '../db/index.js';
import { startOfLocalDay, localDayKey, DAY, HOUR, MIN } from '../lib/time.js';
import { COUNTED } from './quota.js';

/** Số liệu từ 00:00 hôm nay (hoặc từ `since`). */
export function statsSince(ctx, since = startOfLocalDay(ctx.now(), ctx.settings().timezoneOffsetMin)) {
  const n = (sql, ...p) => get(ctx.db, sql, ...p).n;
  const byStatus = Object.fromEntries(all(ctx.db, 'SELECT status, COUNT(*) AS n FROM slots WHERE created_at >= ? GROUP BY status', since).map((r) => [r.status, r.n]));
  return {
    since,
    taps: n('SELECT COUNT(*) AS n FROM taps WHERE created_at >= ?', since),
    tapDevices: n('SELECT COUNT(DISTINCT device_id) AS n FROM taps WHERE created_at >= ?', since),
    logins: n("SELECT COUNT(*) AS n FROM events WHERE type = 'login' AND created_at >= ?", since),
    newCustomers: n('SELECT COUNT(*) AS n FROM customers WHERE created_at >= ?', since),
    claims: Object.values(byStatus).reduce((a, b) => a + b, 0),
    claimsByStatus: byStatus,
    activeNow: n("SELECT COUNT(*) AS n FROM slots WHERE status = 'active'"),
    codesDelivered: n("SELECT COUNT(*) AS n FROM code_windows WHERE status = 'delivered' AND opened_at >= ?", since),
    orphans: n("SELECT COUNT(*) AS n FROM events WHERE type = 'code_orphan' AND created_at >= ?", since),
    redEvents: n("SELECT COUNT(*) AS n FROM events WHERE severity = 'red' AND created_at >= ?", since),
    yellowEvents: n("SELECT COUNT(*) AS n FROM events WHERE severity = 'yellow' AND created_at >= ?", since),
    todoTasks: n("SELECT COUNT(*) AS n FROM rotation_tasks WHERE status = 'todo'"),
    accounts: Object.fromEntries(all(ctx.db, 'SELECT status, COUNT(*) AS n FROM accounts GROUP BY status').map((r) => [r.status, r.n])),
    perCafe: all(ctx.db,
      `SELECT f.id, f.name, f.qs_slug, f.daily_quota,
              (SELECT COUNT(*) FROM slots s WHERE s.cafe_id = f.id AND s.created_at >= ? AND s.status != 'rejected') AS claims
       FROM cafes f ORDER BY f.id`, since),
  };
}

export const last24h = (ctx) => statsSince(ctx, ctx.now() - DAY);

/**
 * Báo cáo 1 quán trong [since, until). "Lượt vào" = từ khối sự kiện QS + thẻ NFC riêng. Chỉ có số đếm, không có SĐT hay thông tin cá nhân → chụp gửi chủ quán được.
 * "Lượt dùng thử" = slot đã thật sự bắt đầu (started_at). "Khách quay lại" = khách đã từng dùng thử ở quán vào một ngày trước đó.
 */
export function cafeReport(ctx, cafeId, { since, until }) {
  const cafe = get(ctx.db, 'SELECT * FROM cafes WHERE id = ?', cafeId);
  if (!cafe) return null;
  const off = ctx.settings().timezoneOffsetMin;
  const shift = off * MIN;
  const day = (col) => `((${col} + ${shift}) / ${DAY})`; // số thứ tự ngày theo giờ VN (chia nguyên)
  const n = (sql) => get(ctx.db, sql, cafeId, since, until).n;
  const TAPS = "FROM taps WHERE cafe_id = ? AND verdict = 'ok' AND created_at >= ? AND created_at < ?";
  const TRIALS = 'FROM slots s WHERE s.cafe_id = ? AND s.started_at >= ? AND s.started_at < ?';
  const ZALO = "FROM events WHERE type = 'zalo_click' AND cafe_id = ? AND created_at >= ? AND created_at < ?";

  const byHour = Array(24).fill(0);
  for (const r of all(ctx.db, `SELECT ((s.started_at + ${shift}) / ${HOUR}) % 24 AS h, COUNT(*) AS n ${TRIALS} GROUP BY h`, cafeId, since, until)) byHour[r.h] = r.n;

  const days = new Map();
  for (let d = Math.floor((since + shift) / DAY); d * DAY - shift < until; d++) {
    days.set(d, { day: localDayKey(d * DAY - shift, off), taps: 0, devices: 0, trials: 0, customers: 0, counted: 0, zalo: 0 });
  }
  const fill = (sql, map) => {
    for (const r of all(ctx.db, sql, cafeId, since, until)) if (days.has(r.d)) map(days.get(r.d), r);
  };
  fill(`SELECT ${day('created_at')} AS d, COUNT(*) AS n, COUNT(DISTINCT device_id) AS m ${TAPS} GROUP BY d`, (o, r) => { o.taps = r.n; o.devices = r.m; });
  fill(`SELECT ${day('s.started_at')} AS d, COUNT(*) AS n, COUNT(DISTINCT s.customer_id) AS m ${TRIALS} GROUP BY d`, (o, r) => { o.trials = r.n; o.customers = r.m; });
  fill(`SELECT ${day('created_at')} AS d, COUNT(*) AS n FROM slots WHERE cafe_id = ? AND created_at >= ? AND created_at < ? AND ${COUNTED} GROUP BY d`, (o, r) => { o.counted = r.n; });
  fill(`SELECT ${day('created_at')} AS d, COUNT(*) AS n ${ZALO} GROUP BY d`, (o, r) => { o.zalo = r.n; });
  const byDay = [...days.values()].map(({ counted, ...o }) => ({ ...o, full: cafe.daily_quota > 0 && counted >= cafe.daily_quota }));

  return {
    cafe, since, until,
    taps: n(`SELECT COUNT(*) AS n ${TAPS}`),
    tapDevices: n(`SELECT COUNT(DISTINCT device_id) AS n ${TAPS}`),
    trials: n(`SELECT COUNT(*) AS n ${TRIALS}`),
    customers: n(`SELECT COUNT(DISTINCT s.customer_id) AS n ${TRIALS}`),
    returning: n(`SELECT COUNT(DISTINCT s.customer_id) AS n ${TRIALS} AND EXISTS (
      SELECT 1 FROM slots p WHERE p.customer_id = s.customer_id AND p.cafe_id = s.cafe_id AND p.started_at IS NOT NULL
        AND ${day('p.started_at')} < ${day('s.started_at')})`),
    zaloClicks: n(`SELECT COUNT(*) AS n ${ZALO}`),
    redAlerts: n("SELECT COUNT(*) AS n FROM events WHERE severity = 'red' AND cafe_id = ? AND created_at >= ? AND created_at < ?"),
    fullDays: byDay.filter((d) => d.full).length,
    byTool: all(ctx.db, `SELECT t.name, COUNT(*) AS n ${TRIALS.replace('FROM slots s', 'FROM slots s JOIN tools t ON t.id = s.tool_id')} GROUP BY t.id ORDER BY n DESC, t.sort`, cafeId, since, until),
    byHour,
    byDay,
    // Lối vào QS ẩn (cả quán) + từng thẻ NFC riêng của Tiệm. Lối vào QS chưa từng dùng thì không có dòng.
    byCard: all(ctx.db,
      `SELECT k.id, k.kind, k.label, k.status,
              (SELECT COUNT(*) FROM taps x WHERE x.card_id = k.id AND x.verdict = 'ok' AND x.created_at >= :since AND x.created_at < :until) AS taps,
              (SELECT COUNT(*) FROM slots s WHERE s.card_id = k.id AND s.started_at >= :since AND s.started_at < :until) AS trials
       FROM cards k WHERE k.cafe_id = :cafeId ORDER BY k.kind = 'qs' DESC, trials DESC, taps DESC, k.id`, { cafeId, since, until }),
  };
}
