// Thư mã về NHẦM hộp thư (chủ duyệt 06/10/2026, "bịt chỗ hở").
// Tên miền kho (tiembanquyen.site) có luật catch-all → hộp thư ma.tiembanquyen.site của CapCut Tool. Địa chỉ kho nào THIẾU quy tắc
// riêng "địa chỉ → Worker tbq-mail" thì thư mã của hãng rơi vào hộp thư kia: TBQ không nhận được → khách bấm Lấy mã mà không có mã.
// Mỗi 10 phút hỏi hộp thư kia (POST /api/watch, khoá riêng HUB_WATCH_TOKEN): nó chỉ trả SỐ thư + giờ thư mới nhất của từng địa chỉ —
// không mã, không tiêu đề, không nội dung. Thấy thư mới của địa chỉ kho → báo đỏ trên Theo dõi kèm cách sửa.
import { all, get, run } from '../db/index.js';
import { logEvent } from '../lib/events.js';
import { MIN } from '../lib/time.js';

export const MAIL_ROUTE_EVERY = 10 * MIN;
const BATCH = 200; // hộp thư nhận tối đa 200 địa chỉ mỗi lần

const kvGet = (ctx, key) => get(ctx.db, 'SELECT value FROM kv WHERE key = ?', key)?.value ?? null;
const kvSet = (ctx, key, value) => run(ctx.db,
  'INSERT INTO kv(key, value, updated_at) VALUES(?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
  key, String(value), ctx.now());

/** Địa chỉ kho cần nhận thư mã (Claude: mã qua email; Adobe: mail_code), còn dùng, thuộc tên miền của hộp thư kia. */
export function watchedAccounts(ctx) {
  const domain = ctx.config.hubWatch.domain;
  return all(ctx.db,
    `SELECT a.id, lower(a.login_email) AS email FROM accounts a JOIN tools t ON t.id = a.tool_id
     WHERE a.status != 'retired' AND a.login_email IS NOT NULL AND (t.login_type = 'email_code' OR t.mail_code = 1)
     ORDER BY a.id`)
    .filter((a) => !domain || a.email.endsWith(`@${domain}`));
}

/** Hỏi hộp thư kia: [{email, messages, last_at}] cho các địa chỉ có thư. Lỗi mạng / sai khoá → ném lỗi. */
export async function queryHub(config, emails, fetchImpl = fetch) {
  const { url, token } = config.hubWatch;
  const out = [];
  for (let i = 0; i < emails.length; i += BATCH) {
    const r = await fetchImpl(`${url.replace(/\/+$/, '')}/api/watch`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`, 'content-type': 'application/json',
        // tên miền bật chống bot của Cloudflare: không có User-Agent kiểu trình duyệt thì bị trả 1010
        'user-agent': 'Mozilla/5.0 (compatible; TBQ-ColAp)',
      },
      body: JSON.stringify({ emails: emails.slice(i, i + BATCH) }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) throw new Error(r.status === 401 ? 'sai HUB_WATCH_TOKEN (khác khoá watch_token của hộp thư)' : `hộp thư trả HTTP ${r.status}`);
    const d = await r.json();
    out.push(...(d.addresses || []));
  }
  return out;
}

/** Việc định kỳ: báo đỏ mỗi khi có thư MỚI của địa chỉ kho rơi vào hộp thư kia. Chưa nối (thiếu URL / khoá) → bỏ qua. */
export async function checkMailRoute(ctx, { fetchImpl = fetch } = {}) {
  const { url, token } = ctx.config.hubWatch;
  if (!url || !token) return { skipped: true };
  const accounts = watchedAccounts(ctx);
  let found;
  try {
    found = accounts.length ? await queryHub(ctx.config, accounts.map((a) => a.email), fetchImpl) : [];
  } catch (err) {
    const error = String(err?.message || err).slice(0, 200);
    kvSet(ctx, 'mailroute_status', JSON.stringify({ at: ctx.now(), ok: false, error }));
    ctx.log?.('warn', 'mail route check failed', { error });
    return { error };
  }
  const byEmail = new Map(accounts.map((a) => [a.email, a]));
  const bad = [];
  let alerts = 0;
  for (const x of found) {
    const a = byEmail.get(String(x.email || '').toLowerCase());
    if (!a || !x.messages) continue;
    bad.push(a.email);
    const key = `mailroute_seen:${a.id}`;
    if (Number(x.last_at) > Number(kvGet(ctx, key) || 0)) {  // chỉ báo khi có thư mới từ lần trước
      logEvent(ctx, {
        type: 'mail_wrong_route', severity: 'red', accountId: a.id,
        data: { reason: `${x.messages} thư của ${a.email} đang về hộp thư ma.tiembanquyen.site, TBQ không nhận được` },
      });
      kvSet(ctx, key, Number(x.last_at));
      alerts++;
    }
  }
  kvSet(ctx, 'mailroute_status', JSON.stringify({ at: ctx.now(), ok: true, checked: accounts.length, bad }));
  return { checked: accounts.length, bad, alerts };
}
