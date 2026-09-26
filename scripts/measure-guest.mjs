// Đo trang khách như một khách trong quán (lát E6, 26/09/2026): Chrome thật, 4G chậm (RTT 150 ms, 1,6 Mbps xuống,
// 750 kbps lên), CPU chậm 4 lần, bộ nhớ đệm trống, màn hình điện thoại. Mọi lệnh ghi (POST /api/…) được trả lời giả ngay
// trong trình duyệt, nên đo production không đẻ lượt ghé nào vào database của quán.
//
//   E6_ORIGIN=https://quitesensational-review-bio.com E6_SLUGS=urr6ud,b5pbb E6_RUNS=2 [E6_DETAIL=1] node scripts/measure-guest.mjs
//
// In mỗi lượt: ttfb, fcp, lcp (+ phần tử), cls, tbt, load, readyMs (tới khi các nút dùng được), jsEnd, video (mốc bắt
// đầu xin, KB trong 3 giây đầu), KB theo loại. So hai bản thì đổi đúng một thứ và chạy cùng điều kiện.
import { chromium } from '@playwright/test';
const origin = process.env.E6_ORIGIN ?? 'https://quitesensational-review-bio.com';
const slugs = (process.env.E6_SLUGS ?? 'urr6ud').split(',');
const runs = Number(process.env.E6_RUNS ?? 2);
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const id = () => crypto.randomUUID();
for (const slug of slugs) for (let n = 0; n < runs; n++) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await page.route('**/api/**', route => {
    if (route.request().method() !== 'POST') return route.continue();
    const sid = id();
    if (route.request().url().endsWith('/visits')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      visit: { id: id(), sessionId: sid, openedAt: new Date().toISOString(), navigationKind: 'load' }, session: { id: sid, lastActivity: new Date().toISOString(), active: true }, experience: null }) });
    return route.fulfill({ status: 204 });
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6e6 / 8, uploadThroughput: 750e3 / 8 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const bytes = {}; const types = {};
  cdp.on('Network.responseReceived', e => { types[e.requestId] = `${e.type}:${new URL(e.response.url).pathname}`; });
  // Counted as bytes arrive, not when a request finishes: a video streams in ranges and may never "finish" in the window.
  const urls = {}; let video = { first: -1, kb: 0, at3s: 0 }; const start = Date.now();
  cdp.on('Network.requestWillBeSent', e => { urls[e.requestId] = e.request.url; if (e.request.url.endsWith('.mp4') && video.first < 0) video.first = Date.now() - start; });
  // Totals come from loadingFinished: over HTTP/2 Chrome reports 0 in dataReceived.encodedDataLength. The video, which
  // may never finish inside the window, is timed by dataReceived.dataLength (decoded, close to encoded for mp4).
  cdp.on('Network.loadingFinished', e => { const t = types[e.requestId]; if (t && !urls[e.requestId]?.endsWith('.mp4')) bytes[t] = (bytes[t] ?? 0) + e.encodedDataLength; });
  cdp.on('Network.dataReceived', e => { if (!urls[e.requestId]?.endsWith('.mp4')) return; const t = types[e.requestId];
    if (t) bytes[t] = (bytes[t] ?? 0) + e.dataLength;
    video.kb += e.dataLength / 1024; if (Date.now() - start < 3000) video.at3s += e.dataLength / 1024; });
  await page.addInitScript(() => {
    window.__e6 = { lcp: 0, lcpEl: '', cls: 0, tbt: 0 };
    new PerformanceObserver(l => { for (const e of l.getEntries()) { window.__e6.lcp = e.startTime; window.__e6.lcpEl = (e.element?.tagName ?? '') + '.' + (e.element?.className?.toString?.() ?? '').split(' ')[0] + (e.url ? ' ' + e.url.split('/').pop() : ''); } }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__e6.cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
    new PerformanceObserver(l => { for (const e of l.getEntries()) window.__e6.tbt += Math.max(0, e.duration - 50); }).observe({ type: 'longtask', buffered: true });
  });
  const t0 = start;
  await page.goto(`${origin}/${slug}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.locator('main[data-ready]').waitFor({ timeout: 90000 }); const ready = Date.now() - t0;
  await page.waitForLoadState('load', { timeout: 90000 }).catch(() => {});
  await page.waitForTimeout(4000);
  const m = await page.evaluate(() => { const nav = performance.getEntriesByType('navigation')[0]; const fcp = performance.getEntriesByName('first-contentful-paint')[0];
    const res = performance.getEntriesByType('resource');
    const jsEnd = Math.round(Math.max(0, ...res.filter(r => r.initiatorType === 'script' || r.name.endsWith('.js')).map(r => r.responseEnd)));
    return { jsEnd, ttfb: Math.round(nav.responseStart), fcp: Math.round(fcp?.startTime ?? -1), lcp: Math.round(window.__e6.lcp), lcpEl: window.__e6.lcpEl, cls: +window.__e6.cls.toFixed(3), tbt: Math.round(window.__e6.tbt), load: Math.round(nav.loadEventEnd) }; });
  const sum = re => Math.round(Object.entries(bytes).filter(([k]) => re.test(k)).reduce((a, [, v]) => a + v, 0) / 1024);
  console.log(JSON.stringify({ slug, run: n + 1, ...m, readyMs: ready, video: { requestedAt: video.first, kbIn3s: Math.round(video.at3s), kb: Math.round(video.kb) }, KB: { total: sum(/./), js: sum(/^Script:/), css: sum(/^Stylesheet:/), doc: sum(/^Document:/), media: sum(/^(Media|Image):/), font: sum(/^Font:/) } }));
  if (process.env.E6_DETAIL && n === 0) console.log(Object.entries(bytes).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => `  ${Math.round(v / 1024)}KB ${k}`).join('\n'));
  await context.close();
}
await browser.close();
