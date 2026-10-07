'use client';
/**
 * Bột phấn (Tài 07/10, nền kiểu Sentry): drawn like a spray brush in a painting app, not with a noise filter. A brush is only numbers
 * (lib/canvas/brushes.json — how many flakes, how big, how far they spread, how they clump, how much haze); the colour is the
 * shop's, given by the element. Each stamp scatters its own flakes from a seed made of the element's id, so the same page always
 * looks the same and no two stamps on it do. Sizes are in screen pixels: the grain is as fine on a small dab as on a large cloud.
 */
import { useEffect, useRef } from 'react';
import { BRUSHES } from '@/lib/canvas/doc';

/** A small seeded random generator (mulberry32). */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const seedOf = (id: string) => [...id].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 2166136261);

function paint(canvas: HTMLCanvasElement, brush: string, color: string, id: string) {
  const p = BRUSHES[brush], w = canvas.clientWidth, h = canvas.clientHeight;
  if (!p || !w || !h) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d'); if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
  const rand = seeded(seedOf(id));
  const gauss = () => { let u = 0, v = 0; while (!u) u = rand(); while (!v) v = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const sx = w * p.spread * .5, sy = h * p.spread * .5;
  const clumps = Array.from({ length: p.clumps }, () => ({ x: w / 2 + gauss() * w * p.clumpSpread * .5 * Math.min(p.stretch, 1.6), y: h / 2 + gauss() * h * p.clumpSpread * .5,
    weight: .5 + rand() }));
  const total = clumps.reduce((n, c) => n + c.weight, 0);
  const pick = () => { let r = rand() * total; for (const c of clumps) { r -= c.weight; if (r <= 0) return c; } return clumps[0]; };
  ctx.fillStyle = color;
  // The haze under the flakes: one soft round of light per clump.
  if (p.haze > 0) for (const c of clumps) {
    const r = Math.max(sx, sy) * 1.4, g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, r);
    g.addColorStop(0, color); g.addColorStop(1, 'transparent');
    ctx.save(); ctx.globalAlpha = p.haze * c.weight / 1.5; ctx.translate(c.x, c.y); ctx.scale(sx / Math.max(sx, sy), sy / Math.max(sx, sy)); ctx.translate(-c.x, -c.y);
    ctx.fillStyle = g; ctx.fillRect(c.x - r, c.y - r, r * 2, r * 2); ctx.restore();
  }
  ctx.fillStyle = color;
  const count = Math.round(p.flakes * w * h / 1000);
  for (let i = 0; i < count; i++) {
    const c = pick(), far = rand() < p.stray ? 2.3 : 1;
    const x = c.x + gauss() * sx * far, y = c.y + gauss() * sy * far;
    if (x < 0 || y < 0 || x > w || y > h) continue;
    // Fewer, fainter flakes towards the edge of the box, so a stamp never shows a straight border.
    const edge = Math.min(x, y, w - x, h - y) / (Math.min(w, h) * .18);
    if (edge < 1 && rand() > edge) continue;
    const size = p.size[0] + (p.size[1] - p.size[0]) * rand() * rand();
    ctx.globalAlpha = p.alpha[0] + (p.alpha[1] - p.alpha[0]) * rand();
    // A flake is a small chip, not a dot: three to five corners at uneven distances.
    const corners = 3 + Math.floor(rand() * 3), turn = rand() * Math.PI * 2;
    ctx.beginPath();
    for (let k = 0; k < corners; k++) {
      const a = turn + k * Math.PI * 2 / corners + (rand() - .5) * .6, r = size * (.55 + rand() * .6);
      if (k) ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); else ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ctx.closePath(); ctx.fill();
  }
}

export default function Powder({ brush, color, id }: { brush: string; color: string; id: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current; if (!canvas) return;
    const draw = () => paint(canvas, brush, color, id);
    draw();
    const watch = new ResizeObserver(draw); watch.observe(canvas);
    return () => watch.disconnect();
  }, [brush, color, id]);
  return <canvas ref={ref} aria-hidden="true" style={{ display: 'block', width: '100%', height: '100%' }} />;
}
