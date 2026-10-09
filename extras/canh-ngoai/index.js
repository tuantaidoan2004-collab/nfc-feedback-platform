// Bộ canh bên ngoài (Cloudflare Worker, chạy mỗi phút) — đánh giá thương mại 09/10/2026, P0-1.
// Máy chủ TBQ tắt hẳn / mất mạng / đường hầm chết thì máy chủ không tự báo được → Worker này gọi <TARGET_URL> (…/colap/healthz)
// như khách. Hỏng 3 lần liền (cách nhau 10 giây) → gửi thư cho chủ; ổn lại → gửi thư "đã ổn lại". Chỉ ghi KV khi đổi trạng thái
// (gói miễn phí: 1.000 lần ghi / ngày). Thư đi qua Cloudflare Email Sending (cùng tên miền gửi mã đăng nhập).
//
// Cấu hình (wrangler.jsonc): TARGET_URL, MAIL_FROM, ACCOUNT_ID; KV binding: STATE; cron "* * * * *".
// Bí mật: ALERT_TO (email nhận thư, cách nhau dấu phẩy), EMAIL_TOKEN (= CF_EMAIL_TOKEN của máy chủ), BACKUP_TOKEN (= OFFSITE_TOKEN của máy chủ, cho sao lưu ngoài — cuối tệp).
// Xem trạng thái: mở https://<worker>.workers.dev/ (chỉ trả "up" / "down" + thời điểm, không có gì bí mật).

const TRIES = 3;
const GAP_MS = 10_000;

async function probe(url, gapMs = GAP_MS) {
  for (let i = 0; i < TRIES; i++) {
    if (i) await new Promise((r) => setTimeout(r, gapMs));
    try {
      const r = await fetch(url, { headers: { 'user-agent': 'tbq-canh-ngoai' }, signal: AbortSignal.timeout(10_000), cf: { cacheTtl: 0 } });
      const body = (await r.text()).trim();
      if (r.ok && body === 'ok') return { ok: true };
      if (i === TRIES - 1) return { ok: false, error: `HTTP ${r.status}${body && body.length < 60 ? ` "${body}"` : ''}` };
    } catch (err) {
      if (i === TRIES - 1) return { ok: false, error: err?.name === 'TimeoutError' ? 'quá 10 giây không trả lời' : String(err?.message || err).slice(0, 120) };
    }
  }
  return { ok: false, error: 'không rõ' };
}

const vnTime = (ms) => new Date(ms + 7 * 3600_000).toISOString().replace('T', ' ').slice(0, 16);

async function mail(env, subject, text) {
  const to = String(env.ALERT_TO || '').split(',').map((s) => s.trim()).filter(Boolean);
  for (const addr of to) {
    const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.ACCOUNT_ID}/email/sending/send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.EMAIL_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: addr, from: { address: env.MAIL_FROM, name: 'TBQ báo động' }, subject, text }),
    });
    if (!r.ok) console.log('gửi thư lỗi', addr, r.status, (await r.text()).slice(0, 200));
  }
}

async function check(env) {
  const now = Date.now();
  const prev = (await env.STATE.get('state', 'json')) || { up: true, since: now };
  const res = await probe(env.TARGET_URL, env.GAP_MS != null ? Number(env.GAP_MS) : GAP_MS);
  if (res.ok === prev.up) return prev;
  const next = { up: res.ok, since: now, error: res.error || null };
  await env.STATE.put('state', JSON.stringify(next));
  if (!res.ok) {
    await mail(env, '[TBQ] TRANG KHÁCH KHÔNG VÀO ĐƯỢC',
      [`Lúc ${vnTime(now)} (giờ VN): ${env.TARGET_URL} không trả lời đúng sau ${TRIES} lần thử — ${res.error}.`, '',
        'Khách ở quán đang không nhận được công cụ. Kiểm theo thứ tự:',
        '1. Máy chủ VPS còn chạy không (trang quản lý VPS / ssh vào máy chủ).',
        '2. systemctl status tbq tbq-tunnel  ·  journalctl -u tbq -n 50',
        '3. Cloudflare → Zero Trust → Networks → Tunnels: đường hầm có "Healthy" không.',
        '4. Không sửa được nhanh: chạy chuyen-vps/quay-lai-mac.sh trên Mac để chạy tạm trên Mac.', '',
        'Thư này do bộ canh bên ngoài (Cloudflare Worker) gửi, mỗi lần đổi trạng thái 1 thư.'].join('\n'));
  } else {
    const mins = Math.round((now - prev.since) / 60_000);
    await mail(env, '[TBQ] Trang khách đã vào lại được',
      `Lúc ${vnTime(now)} (giờ VN): ${env.TARGET_URL} trả lời bình thường. Gián đoạn khoảng ${mins} phút (từ ${vnTime(prev.since)}).`);
  }
  return next;
}

// ---------- Sao lưu ngoài máy chủ (P0-4) ----------
// Máy chủ đẩy bản sao lưu ĐÃ MÃ HOÁ (khoá chỉ máy chủ / chủ giữ) lên đây mỗi sáng: POST /sao-luu, Bearer BACKUP_TOKEN, header x-ten.
// Lưu trong KV với hạn 35 ngày (tự xoá). GET /sao-luu → danh sách; GET /sao-luu/<tên> → tải về (scripts/lay-sao-luu-ngoai.js giải mã).
const KEEP_SEC = 35 * 86400;
const NAME_RE = /^[A-Za-z0-9._-]{1,80}$/;

function safeEqual(a, b) {
  const x = new TextEncoder().encode(String(a)), y = new TextEncoder().encode(String(b));
  if (x.length !== y.length) return false;
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i];
  return d === 0;
}

async function backupApi(req, env, path) {
  const tok = String(req.headers.get('authorization') || '').replace(/^Bearer /, '');
  if (!env.BACKUP_TOKEN || env.BACKUP_TOKEN.length < 32 || !safeEqual(tok, env.BACKUP_TOKEN)) return new Response('Sai khoá', { status: 401 });
  if (req.method === 'POST' && path === '/sao-luu') {
    const name = String(req.headers.get('x-ten') || '');
    if (!NAME_RE.test(name)) return new Response('Tên tệp không hợp lệ', { status: 400 });
    const body = await req.arrayBuffer();
    const head = new TextDecoder().decode(new Uint8Array(body.slice(0, 5)));
    if (head !== 'TBQB1') return new Response('Chỉ nhận tệp đã mã hoá (TBQB1)', { status: 400 });
    if (body.byteLength > 24 * 1024 * 1024) return new Response('Tệp quá 24 MB', { status: 413 });
    await env.STATE.put(`sl:${name}`, body, { expirationTtl: KEEP_SEC, metadata: { size: body.byteLength, at: Date.now() } });
    return new Response('ok');
  }
  if (req.method === 'GET' && path === '/sao-luu') {
    const out = [];
    let cursor;
    do {
      const page = await env.STATE.list({ prefix: 'sl:', cursor });
      for (const k of page.keys) out.push({ name: k.name.slice(3), size: k.metadata?.size, at: k.metadata?.at });
      cursor = page.list_complete ? null : page.cursor;
    } while (cursor);
    out.sort((a, b) => (b.at || 0) - (a.at || 0));
    return Response.json(out);
  }
  if (req.method === 'GET' && path.startsWith('/sao-luu/')) {
    const name = decodeURIComponent(path.slice('/sao-luu/'.length));
    if (!NAME_RE.test(name)) return new Response('Tên tệp không hợp lệ', { status: 400 });
    const v = await env.STATE.get(`sl:${name}`, 'arrayBuffer');
    return v ? new Response(v, { headers: { 'content-type': 'application/octet-stream' } }) : new Response('Không có', { status: 404 });
  }
  return new Response('Không hỗ trợ', { status: 405 });
}

export default {
  async scheduled(_event, env, ctx) { ctx.waitUntil(check(env)); },
  async fetch(req, env) {
    const path = new URL(req.url).pathname.replace(/\/+$/, '');
    if (path === '/sao-luu' || path.startsWith('/sao-luu/')) return backupApi(req, env, path);
    const s = (await env.STATE.get('state', 'json')) || { up: true, since: null };
    return new Response(`${s.up ? 'up' : 'down'}${s.since ? ` từ ${vnTime(s.since)} (giờ VN)` : ''}\n`, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
  },
};
