// Khung trang dùng chung cho các trang của khách. Không inline script/style (CSP).
import { html, raw } from '../lib/http.js';
import { asset } from './asset.js';
import { TBQ_TAG } from './logos.js';

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
<meta name="theme-color" content="#191914">
<title>${title} — Tiệm Bản Quyền</title>
<link rel="icon" href="${asset('logo.svg')}" type="image/svg+xml">
<link rel="stylesheet" href="${asset('ui.css')}">
</head>
<body class="${bodyClass}"${attrs}>
${bare ? '' : html`<header class="top"><div class="top-in">
  <a href="https://tiembanquyen.com" class="brand" target="_blank" rel="noopener" aria-label="Tiệm Bản Quyền — tiembanquyen.com">${raw(TBQ_TAG)}<span class="wordmark"><b>TBQ Space</b><small>Tiệm Bản Quyền</small></span></a>
  <a class="top-zalo" href="${zalo}" rel="noopener">Zalo</a>
</div></header>`}
<main class="wrap">
${body}
</main>
${bare ? '' : html`<footer class="foot"><a href="https://tiembanquyen.com" target="_blank" rel="noopener">tiembanquyen.com</a><a href="/privacy">Chính sách dữ liệu</a><a href="${zalo}" rel="noopener">Nhắn Zalo Tiệm</a></footer>`}
${script ? html`<script src="${asset(script)}" defer></script>` : ''}
</body>
</html>`;
}

/** Khối thông báo đơn giản. */
export function notice(ctx, { title, text, icon = 'ℹ️', actions = '' }) {
  return page(ctx, {
    title,
    body: html`<section class="state"><div class="state-ic" aria-hidden="true">${icon}</div><h1>${title}</h1><p class="sub">${text}</p>${actions}</section>`,
  });
}
