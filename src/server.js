// Điểm khởi động: `npm start`. createApp(ctx) dùng chung cho test.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadConfig, validateConfig } from './config.js';
import { openDb, get } from './db/index.js';
import { createCtx } from './ctx.js';
import { createRouter, createRq, HttpError, html } from './lib/http.js';
import { ensureDevice, loadSession } from './domain/auth.js';
import { registerPublicRoutes } from './routes/public.js';
import { registerHookRoutes, registerQsApi, registerKhoApi } from './routes/hooks.js';
import { registerAdminRoutes } from './routes/admin.js';
import { registerWorkerRoutes } from './routes/worker.js';
import { createOtpSender } from './services/otp.js';
import { startJobs } from './jobs.js';

const PUBLIC_DIR = new URL('./public/', import.meta.url);
const STATIC_TYPES = { '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon' };

async function serveStatic(rq, name) {
  if (!/^[a-z0-9_-]+\.(js|css|svg|png|jpg|ico)$/i.test(name)) throw new HttpError(404, 'Không tìm thấy');
  let body;
  try { body = await readFile(new URL(name, PUBLIC_DIR)); } catch { throw new HttpError(404, 'Không tìm thấy'); }
  rq.send(200, body, { 'Content-Type': STATIC_TYPES[extname(name).toLowerCase()], 'Cache-Control': 'public, max-age=3600' });
}

/** Route của khách: cần cookie máy + phiên đăng nhập. */
function isCustomerPath(p) {
  return p === '/' || p === '/me' || p === '/privacy' || p === '/zalo' || p.startsWith('/qs/') || p.startsWith('/c/') || p.startsWith('/api/');
}

function errorPage(status, message) {
  return html`<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${status} — Tiệm Bản Quyền</title><link rel="stylesheet" href="/static/style.css"></head>
<body><main class="wrap"><div class="card"><h1>Ôi, có lỗi rồi</h1><p>${message}</p><p><a href="/">Về trang chủ</a></p></div></main></body></html>`;
}

export function createApp(ctx) {
  const router = createRouter();
  registerPublicRoutes(router);
  registerHookRoutes(router);
  registerQsApi(router);
  registerKhoApi(router);
  registerAdminRoutes(router);
  registerWorkerRoutes(router);
  // Kiểm tra sống cho công cụ giám sát (uptime): không tạo mã máy, không ghi gì.
  router.get('/healthz', (rq) => { get(ctx.db, 'SELECT 1 AS ok'); rq.send(200, 'ok', { 'Content-Type': 'text/plain; charset=utf-8' }); });

  return async function handler(req, res) {
    let url;
    try { url = new URL(req.url, ctx.config.baseUrl); } catch { res.writeHead(400).end(); return; }
    // Chạy dưới thư mục con (BASE_URL = https://…/colap): chỉ nhận đường dẫn bắt đầu bằng /colap, rồi cắt đi để route như ở gốc.
    const base = ctx.config.basePath;
    if (base) {
      // Gốc tên miền và "/colap" thiếu dấu / → về trang chủ của Tiệm (như Caddy `redir / /colap/`).
      if (url.pathname === base || url.pathname === '/') { res.writeHead(url.pathname === '/' ? 302 : 308, { Location: `${base}/${url.search}` }).end(); return; }
      if (!url.pathname.startsWith(`${base}/`)) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Không tìm thấy'); return; }
      url.pathname = url.pathname.slice(base.length);
    }
    const rq = createRq(req, res, ctx, url);
    const wantsJson = url.pathname.startsWith('/api/') || url.pathname.startsWith('/hooks/') || url.pathname.startsWith('/worker/');
    try {
      if ((req.method === 'GET' || req.method === 'HEAD') && url.pathname.startsWith('/static/')) {
        await serveStatic(rq, url.pathname.slice('/static/'.length));
        return;
      }
      const m = router.match(req.method, url.pathname);
      if (!m) throw new HttpError(404, 'Không tìm thấy trang này.');
      if (m.methodNotAllowed) throw new HttpError(405, 'Phương thức không được hỗ trợ.');
      rq.params = m.params;
      if (isCustomerPath(url.pathname)) {
        if (req.method === 'POST') rq.assertSameOrigin();
        ensureDevice(ctx, rq);
        loadSession(ctx, rq);
      }
      await m.handler(rq);
      if (!res.headersSent) rq.send(204, '');
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      const message = err instanceof HttpError ? err.message : 'Hệ thống đang bận, bạn thử lại sau ít phút nhé.';
      if (status >= 500) ctx.log('error', 'request failed', { path: url.pathname, err: String(err?.stack || err) });
      if (res.headersSent) { res.end(); return; }
      if (wantsJson) rq.sendJson(status, { ok: false, code: err?.code || null, message });
      else rq.sendHtml(status, errorPage(status, message));
    }
  };
}

export async function main() {
  const config = loadConfig();
  const errors = validateConfig(config);
  if (errors.length) {
    console.error('Cấu hình chưa đúng:\n- ' + errors.join('\n- '));
    process.exit(1);
  }
  const db = openDb(config.dbPath);
  const ctx = createCtx({ config, db });
  ctx.otp = createOtpSender(ctx);
  const stopJobs = startJobs(ctx, 30_000);
  const server = http.createServer(createApp(ctx));
  server.listen(config.port, config.host, () => {
    ctx.log('info', `Đang chạy tại ${config.baseUrl} (cổng ${config.port}), OTP=${config.otp.provider}`);
  });
  const shutdown = () => {
    ctx.log('info', 'Đang tắt...');
    stopJobs();
    server.close(() => { db.close(); process.exit(0); });
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
