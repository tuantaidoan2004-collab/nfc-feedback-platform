// Khung trang dùng chung cho các trang của khách. Không inline script/style (CSP).
import { html } from '../lib/http.js';
import { asset } from './asset.js';

export function page(ctx, { title, body, script = 'app.js', bodyClass = '', data = {}, bare = false }) {
  const zalo = ctx.settings().zaloUrl;
  // data-now: giờ máy chủ, để đồng hồ đếm ngược không sai khi điện thoại khách lệch giờ.
  const attrs = Object.entries({ now: ctx.now(), ...data }).map(([k, v]) => html` data-${k}="${v}"`);
  return html`<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow">
<meta name="theme-color" content="#f4f1ea">
<title>${title} — Tiệm Bản Quyền</title>
<link rel="stylesheet" href="${asset('style.css')}">
</head>
<body class="${bodyClass}"${attrs}>
${bare ? '' : html`<header class="top"><a href="/" class="brand"><span class="logo">TBQ</span> Tiệm Bản Quyền</a></header>`}
<main class="wrap">
${body}
</main>
${bare ? '' : html`<footer class="foot"><a href="/privacy">Chính sách dữ liệu</a> · <a href="${zalo}" rel="noopener">Nhắn Zalo Tiệm</a></footer>`}
${script ? html`<script src="${asset(script)}" defer></script>` : ''}
</body>
</html>`;
}

/** Khối thông báo đơn giản. */
export function notice(ctx, { title, text, icon = 'ℹ️', actions = '' }) {
  return page(ctx, {
    title,
    body: html`<section class="card center"><div class="big-icon">${icon}</div><h1>${title}</h1><p>${text}</p>${actions}</section>`,
  });
}
