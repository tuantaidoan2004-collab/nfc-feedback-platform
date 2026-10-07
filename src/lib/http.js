// Router và tiện ích HTTP tối giản (không phụ thuộc thư viện ngoài).

export class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code || null;
  }
}

// ---------- HTML an toàn ----------

export class SafeHtml {
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);

/** Đánh dấu chuỗi HTML tin cậy (không escape). Chỉ dùng cho HTML do chính mình tạo. */
export const raw = (s) => new SafeHtml(String(s ?? ''));

function renderValue(v) {
  if (v == null || v === false) return '';
  if (v instanceof SafeHtml) return v.s;
  if (Array.isArray(v)) return v.map(renderValue).join('');
  return escapeHtml(String(v));
}

/**
 * Template HTML tự escape: html`<p>${userInput}</p>`.
 * Giá trị là SafeHtml (từ html`` khác hoặc raw()) thì giữ nguyên; mảng được nối; null/false → rỗng.
 */
export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += renderValue(values[i]) + strings[i + 1];
  return new SafeHtml(out);
}

// ---------- Cookie ----------

export function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (!k || k in out) continue;
    try { out[k] = decodeURIComponent(part.slice(i + 1).trim()); } catch { /* bỏ qua cookie hỏng */ }
  }
  return out;
}

export function serializeCookie(name, value, opts = {}) {
  let s = `${name}=${encodeURIComponent(value)}`;
  s += `; Path=${opts.path || '/'}`;
  if (opts.maxAgeSec != null) s += `; Max-Age=${Math.floor(opts.maxAgeSec)}`;
  if (opts.httpOnly !== false) s += '; HttpOnly';
  if (opts.secure) s += '; Secure';
  s += `; SameSite=${opts.sameSite || 'Lax'}`;
  return s;
}

// ---------- IP ----------

/**
 * IP khách — dùng cho chống spam (giới hạn theo IP, OTP), nên KHÔNG được để khách tự khai.
 * Nguyên tắc: chỉ tin ĐÚNG MỘT header mà proxy của mình
 * ghi đè ở mọi request (Caddy: `header_up X-Real-IP {remote_host}` → CLIENT_IP_HEADER=x-real-ip; Cloudflare Tunnel:
 * cf-connecting-ip). Header khác (CF-Connecting-IP, X-Real-IP…) khách gửi kèm thì Caddy chuyển nguyên → bỏ qua.
 * Cấu hình cũ TRUST_PROXY=1 mà chưa đặt header: lấy địa chỉ CUỐI của X-Forwarded-For (do chính proxy của mình thêm).
 * Đã nói là có proxy mà request thiếu header → trả '' (không biết IP), KHÔNG lấy địa chỉ của proxy: nếu lấy, mọi khách
 * chung một IP → giới hạn theo IP chặn nhầm cả loạt khách.
 */
export function clientIp(req, proxy) {
  const { header = '', trustProxy = false } = typeof proxy === 'object' && proxy ? proxy : { trustProxy: !!proxy };
  const list = (name) => String(req.headers[name] ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  if (header) {
    const v = list(header);
    return v.length ? normalizeIp(header === 'x-forwarded-for' ? v.at(-1) : v[0]) : '';
  }
  if (trustProxy) {
    const xff = list('x-forwarded-for');
    return xff.length ? normalizeIp(xff.at(-1)) : '';
  }
  return normalizeIp(req.socket?.remoteAddress || '');
}

export const normalizeIp = (ip) => (ip.startsWith('::ffff:') ? ip.slice(7) : ip);

// ---------- Router ----------

export function createRouter() {
  const routes = [];
  const add = (method, path, handler) => {
    const keys = [];
    const pattern = path
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\/:([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, k) => { keys.push(k); return '/([^/]+)'; })
      .replace(/\/\*$/, '/(.*)');
    if (path.endsWith('/*')) keys.push('rest');
    routes.push({ method, re: new RegExp(`^${pattern}/?$`), keys, handler });
  };
  return {
    get: (p, h) => add('GET', p, h),
    post: (p, h) => add('POST', p, h),
    /** Trả về {handler, params} hoặc {methodNotAllowed:true} hoặc null. */
    match(method, pathname) {
      let pathMatched = false;
      for (const r of routes) {
        const m = r.re.exec(pathname);
        if (!m) continue;
        pathMatched = true;
        if (r.method !== method && !(method === 'HEAD' && r.method === 'GET')) continue;
        const params = {};
        r.keys.forEach((k, i) => {
          try { params[k] = decodeURIComponent(m[i + 1]); } catch { params[k] = m[i + 1]; }
        });
        return { handler: r.handler, params };
      }
      return pathMatched ? { methodNotAllowed: true } : null;
    },
  };
}

// ---------- Thư mục con (BASE_URL có đường dẫn, vd. /colap) ----------
// Code viết đường dẫn như chạy ở gốc ("/me", "/admin"…); tiền tố chỉ thêm ở đây, lúc trả về trình duyệt:
// Location khi chuyển trang, Path của cookie, và href / src / action trong HTML. Chiều vào: server.js cắt tiền tố.

/** "/me" → "/colap/me". Link ngoài ("https://…", "//…") và link tương đối giữ nguyên. */
export const withBase = (path, base) => (base && /^\/(?!\/)/.test(path) ? base + path : path);

/** Thêm tiền tố cho mọi href="/…", src="/…", action="/…" trong trang HTML do mình tạo. */
export const withBaseHtml = (page, base) =>
  (base ? page.replace(/\b(href|src|action|formaction)="\/(?!\/)/g, `$1="${base}/`) : page);

// ---------- Request wrapper ----------

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  // Không gửi Referer sang trang khác: link thẻ (/c/<token>) không bị lộ ra ngoài.
  // (Không dùng 'no-referrer': khi đó trình duyệt gửi "Origin: null" cho form POST và chặn nhầm form hợp lệ.)
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
};

export async function readBody(req, limit = 1_000_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new HttpError(413, 'Nội dung quá lớn');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/**
 * Đối tượng `rq` truyền cho mọi handler: handler(rq).
 *  rq.req, rq.res, rq.ctx, rq.params, rq.query (object), rq.url (URL), rq.cookies, rq.ip, rq.method, rq.path
 *  await rq.body()  → Buffer (đọc 1 lần, có cache)
 *  await rq.json()  → object (400 nếu JSON hỏng)
 *  await rq.form()  → object từ application/x-www-form-urlencoded
 *  rq.setCookie(name, value, opts), rq.clearCookie(name)
 *  rq.sendJson(status, obj), rq.sendHtml(status, html), rq.send(status, body, headers), rq.redirect(location, status=303)
 *  rq.assertSameOrigin() → ném HttpError 403 nếu POST đến từ trang khác (chống CSRF)
 *  rq.state → chỗ để middleware gắn dữ liệu (deviceId, session, customer, admin...)
 */
export function createRq(req, res, ctx, url, params = {}) {
  const cookiesOut = [];
  let bodyCache = null;
  const secure = ctx.config.baseUrl.startsWith('https://');
  const base = ctx.config.basePath || '';
  const cookiePath = (p) => withBase(p || '/', base).replace(/(.)\/$/, '$1');
  const rq = {
    req, res, ctx, url, params,
    method: req.method,
    path: url.pathname,
    query: Object.fromEntries(url.searchParams),
    cookies: parseCookies(req.headers.cookie),
    ip: clientIp(req, { header: ctx.config.clientIpHeader, trustProxy: ctx.config.trustProxy }),
    state: {},
    async body(limit) {
      if (!bodyCache) bodyCache = await readBody(req, limit);
      return bodyCache;
    },
    async json() {
      const b = await rq.body();
      if (!b.length) return {};
      try { return JSON.parse(b.toString('utf8')); } catch { throw new HttpError(400, 'JSON không hợp lệ'); }
    },
    async form() {
      const b = await rq.body();
      return Object.fromEntries(new URLSearchParams(b.toString('utf8')));
    },
    setCookie(name, value, opts = {}) {
      cookiesOut.push(serializeCookie(name, value, { secure, ...opts, path: cookiePath(opts.path) }));
    },
    clearCookie(name, opts = {}) {
      cookiesOut.push(serializeCookie(name, '', { secure, ...opts, path: cookiePath(opts.path), maxAgeSec: 0 }));
    },
    send(status, body, headers = {}) {
      if (res.headersSent) return;
      const h = { 'Cache-Control': 'no-store', ...SECURITY_HEADERS, ...headers };
      if (cookiesOut.length) h['Set-Cookie'] = cookiesOut;
      res.writeHead(status, h);
      res.end(req.method === 'HEAD' ? undefined : body);
    },
    sendJson(status, obj) {
      rq.send(status, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8' });
    },
    sendHtml(status, page) {
      rq.send(status, withBaseHtml(String(page), base), { 'Content-Type': 'text/html; charset=utf-8' });
    },
    redirect(location, status = 303) {
      rq.send(status, '', { Location: withBase(location, base) });
    },
    assertSameOrigin() {
      const expected = new URL(ctx.config.baseUrl).host;
      const origin = req.headers.origin;
      const referer = req.headers.referer;
      let host = null;
      try {
        if (origin && origin !== 'null') host = new URL(origin).host;
        else if (referer) host = new URL(referer).host;
      } catch { host = null; }
      if (host) {
        if (host !== expected && host !== req.headers.host) throw new HttpError(403, 'Yêu cầu không hợp lệ (khác nguồn)');
        return;
      }
      // Không đọc được Origin/Referer (trình duyệt gửi "Origin: null") → dựa vào Sec-Fetch-Site do trình duyệt tự đặt.
      if (req.headers['sec-fetch-site'] === 'same-origin') return;
      throw new HttpError(403, 'Yêu cầu không hợp lệ (thiếu Origin)');
    },
  };
  return rq;
}
