/**
 * Hình vẽ của trang canvas (lib/canvas/doc.ts `SHAPES`). Hình chữ nhật và tròn vẽ bằng CSS (bo góc, kính, viền chuyển màu);
 * các hình trang trí — sao nổ, lấp lánh, dấu cộng, tim, mũi tên vẽ tay, ruy băng, tia sáng, đường kẻ có chấm… — là SVG.
 */
import { STICKERS, type Fill, type ShapeKey } from '@/lib/canvas/doc';
import { firstColor } from '@/lib/canvas/paint';

/** `w`: the element's width in design units (grain is sized in screen pixels, not in the drawing's own units). */
type Props = { shape: ShapeKey; fill?: Fill; stroke?: { w: number; color: string }; id: string; w?: number; grain?: boolean };

/** A stable seed per element: two stamps of the same dust or crayon never show the same grain. */
const seedOf = (id: string) => [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 9973, 7);

/** Crayon: the edge wavers (displacement) and small gaps open in the colour (a second noise as a mask). Sized for ~1.2px grain on screen. */
function Crayon({ id, w }: { id: string; w: number }) {
  const perUnit = Math.max(.08, w * 1.05 / 100), seed = seedOf(id);
  return <filter id={id} x="-10%" y="-10%" width="120%" height="120%">
    <feTurbulence type="fractalNoise" baseFrequency={(.55 * perUnit).toFixed(3)} numOctaves="2" seed={seed} result="n" />
    <feDisplacementMap in="SourceGraphic" in2="n" scale={(1.4 / perUnit).toFixed(2)} xChannelSelector="R" yChannelSelector="G" result="d" />
    <feTurbulence type="fractalNoise" baseFrequency={(.9 * perUnit).toFixed(3)} numOctaves="1" seed={seed + 7} result="m" />
    <feColorMatrix in="m" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -2.4 0 0 0 2.05" result="mask" />
    <feComposite in="d" in2="mask" operator="in" />
  </filter>;
}

/**
 * Ánh sáng (Tài 07/10: "ánh sáng làm nên cảm giác dễ chịu, thân thuộc"; mẫu 4RAU). Meant to be laid with `blend: "screen"`; the
 * element's own `blur` softens any of them when it should sit out of focus.
 *   cau-vong       a thin ribbon of spectrum, sharp-edged, its colours running side by side along it like light through a prism or
 *                  the edge of a soap film, narrow at both ends — barely noticed, felt as "premium" (the streaks in the 4RAU design)
 *   cau-vong-xoan  the same ribbon turning over once in the middle, its colours swapping sides
 *   vet-sang       a thin streak of light, bright in the middle, gone at both ends
 * The warm light itself (the orange corner of 4RAU) is `glow` in the shop's colour with `blend: "screen"`.
 */
const SPECTRUM = ['#ff2d55', '#ff8a00', '#ffe14d', '#4dff88', '#38d6ff', '#5a6bff', '#c04dff'];
function ribbonBands(twist: boolean) {
  // The ribbon's middle line: one cubic curve across the box; its width swells in the middle and, twisted, passes through zero.
  const [p0, p1, p2, p3] = twist ? [[4, 86], [30, 20], [62, 96], [96, 14]] : [[4, 90], [26, 40], [58, 14], [96, 8]];
  const at = (t: number) => { const u = 1 - t; return [0, 1].map(i => u * u * u * p0[i] + 3 * u * u * t * p1[i] + 3 * u * t * t * p2[i] + t * t * t * p3[i]); };
  const tangent = (t: number) => { const u = 1 - t; return [0, 1].map(i => 3 * u * u * (p1[i] - p0[i]) + 6 * u * t * (p2[i] - p1[i]) + 3 * t * t * (p3[i] - p2[i])); };
  const steps = 72, edges: number[][][] = Array.from({ length: SPECTRUM.length + 1 }, () => []);
  for (let s = 0; s <= steps; s++) {
    const t = s / steps, [x, y] = at(t), [dx, dy] = tangent(t), len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
    const width = 7 * Math.pow(Math.sin(Math.PI * t), .9) * (twist ? Math.cos(Math.PI * 2 * t - .4) : 1);
    edges.forEach((edge, j) => { const o = (j / SPECTRUM.length - .5) * width; edge.push([x + nx * o, y + ny * o]); });
  }
  const line = (points: number[][]) => points.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`).join('');
  return { bands: SPECTRUM.map((color, k) => ({ color, d: `${line(edges[k])}${line([...edges[k + 1]].reverse()).replace('M', 'L')}Z` })), edge: line(edges[0]) };
}
function Rainbow({ id, twist }: { id: string; twist: boolean }) {
  const { bands, edge } = ribbonBands(twist);
  return <svg viewBox="0 0 100 100" width="100%" height="100%" preserveAspectRatio="none" aria-hidden="true" overflow="visible">
    <defs><filter id={`${id}-h`} x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2.2" /></filter></defs>
    {/* A soft halo under the ribbon, then the ribbon itself, sharp, with a fine bright edge on one side. */}
    <g filter={`url(#${id}-h)`} opacity=".35">{bands.map(b => <path key={b.color} d={b.d} fill={b.color} />)}</g>
    <g opacity=".8">{bands.map(b => <path key={b.color} d={b.d} fill={b.color} />)}</g>
    <path d={edge} fill="none" stroke="#fff" strokeWidth=".35" opacity=".7" vectorEffect="non-scaling-stroke" />
  </svg>;
}
function Streak({ color, id }: { color: string; id: string }) {
  return <svg viewBox="0 0 100 10" width="100%" height="100%" preserveAspectRatio="none" aria-hidden="true" overflow="visible">
    <defs><linearGradient id={`${id}-s`}><stop offset="0" stopColor={color} stopOpacity="0" /><stop offset=".5" stopColor={color} /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs>
    <rect x="0" y="4.2" width="100" height="1.6" rx=".8" fill={`url(#${id}-s)`} />
  </svg>;
}

/** A gradient fill as an SVG <defs> entry, so a decorative shape can carry one too. */
function Defs({ id, fill }: { id: string; fill?: Fill }) {
  if (!fill || typeof fill === 'string') return null;
  const stops = fill.stops.map(([color, at], i) => <stop key={i} offset={`${at}%`} stopColor={color} />);
  if (fill.kind === 'radial') return <defs><radialGradient id={id} cx={`${fill.x}%`} cy={`${fill.y}%`} r="75%">{stops}</radialGradient></defs>;
  const a = (fill.angle - 90) * Math.PI / 180, x = Math.cos(a) / 2, y = Math.sin(a) / 2;
  return <defs><linearGradient id={id} x1={.5 - x} y1={.5 - y} x2={.5 + x} y2={.5 + y}>{stops}</linearGradient></defs>;
}
const burst = (n: number, outer: number, inner: number) => Array.from({ length: n * 2 }, (_, i) => {
  const r = i % 2 ? inner : outer, a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
  return `${(50 + Math.cos(a) * r).toFixed(2)},${(50 + Math.sin(a) * r).toFixed(2)}`;
}).join(' ');

export default function Shape({ shape, fill, stroke, id, w = 40, grain }: Props) {
  const paintId = `cvs-${id}`, color = fill ? (typeof fill === 'string' ? fill : `url(#${paintId})`) : 'currentColor';
  if (shape === 've') {
    // Vé (uiverse.io zeeshan_2112/shy-rattlesnake-3, MIT): a dark ticket with round notches and a perforation, a perspective grid
    // drifting inside in the shop's colour, and a sheen crossing it now and then. Its words are the page's own text elements.
    return <div className="cv-ve" aria-hidden="true" style={{ '--acc': fill ? firstColor(fill) : '#7c3aed' } as React.CSSProperties}>
      <i className="cv-ve-grid" /><i className="cv-ve-perf" /><i className="cv-ve-sheen" /></div>;
  }
  if (shape === 'may-troi' || shape === 'sao-troi') {
    const seed = seedOf(id), r = (i: number, k: number) => ((Math.sin(seed * 7.31 + i * 12.989 + k * 78.233) * 43758.5453) % 1 + 1) % 1;
    const colors = !fill ? ['#ffffff'] : typeof fill === 'string' ? [fill] : fill.stops.map(([c]) => c);
    if (shape === 'sao-troi') return <div className="cv-troi cv-troi-len" aria-hidden="true">{[1, 2, 3].map(layer =>
      <div key={layer} className="cv-troi-lop" style={{ '--d': `${40 + layer * 40}s` } as React.CSSProperties}>{[0, 1].map(copy =>
        <svg key={copy} viewBox="0 0 100 100" preserveAspectRatio="none" width="100%" height="50%">{Array.from({ length: 34 - layer * 8 }, (_, i) =>
          <circle key={i} cx={(r(i, layer) * 100).toFixed(2)} cy={(r(i, layer + 9) * 100).toFixed(2)} r={(.18 + layer * .14).toFixed(2)} fill={colors[i % colors.length]} />)}</svg>)}</div>)}</div>;
    return <div className="cv-troi" aria-hidden="true">{[1, 2, 3].map(layer =>
      <div key={layer} className="cv-troi-lop cv-troi-ngang" style={{ '--d': `${150 - layer * 35}s`, opacity: .45 + layer * .17 } as React.CSSProperties}>{[0, 1].map(copy =>
        <svg key={copy} viewBox="0 0 200 100" preserveAspectRatio="none" width="50%" height="100%">
          <defs><filter id={`${paintId}-m${layer}`} x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation={4.5 - layer} /></filter></defs>
          <g filter={`url(#${paintId}-m${layer})`}>{Array.from({ length: 3 }, (_, c) => {
            const cx = 20 + c * 62 + r(c, layer) * 20, cy = 30 + layer * 14 + r(c, layer + 4) * 12, w = 22 + r(c, layer + 7) * 16, color = colors[(c + layer) % colors.length];
            return <g key={c} fill={color}>{Array.from({ length: 5 }, (_, p) => <ellipse key={p} cx={(cx + (p - 2) * w * .32).toFixed(1)} cy={(cy - Math.sin(p / 4 * Math.PI) * w * .22).toFixed(1)}
              rx={(w * (.26 + r(p, c + layer) * .14)).toFixed(1)} ry={(w * (.2 + r(p + 3, c) * .1)).toFixed(1)} />)}</g>; })}</g>
        </svg>)}</div>)}</div>;
  }
  if (shape === 'hat-bay') {
    // Each speck its own column, size, speed and start, fixed by the element's id so the page looks the same every visit.
    const seed = seedOf(id), r = (i: number, k: number) => ((Math.sin(seed * 9.13 + i * 12.989 + k * 78.233) * 43758.5453) % 1 + 1) % 1;
    return <div className="cv-hat-bay" aria-hidden="true">{Array.from({ length: 16 }, (_, i) =>
      <i key={i} style={{ left: `${(4 + r(i, 1) * 92).toFixed(1)}%`, '--s': (1.4 + r(i, 2) * 2).toFixed(2), '--d': `${(4.5 + r(i, 3) * 5).toFixed(2)}s`,
        '--l': `${(-r(i, 4) * 9).toFixed(2)}s`, '--c': fill ? firstColor(fill) : '#fff' } as React.CSSProperties} />)}</div>;
  }
  if (shape === 'cau-vong' || shape === 'cau-vong-xoan') return <Rainbow id={paintId} twist={shape === 'cau-vong-xoan'} />;
  if (shape === 'vet-sang') return <Streak color={fill ? firstColor(fill) : '#fff'} id={paintId} />;
  const sticker = STICKERS[shape];
  if (sticker) {
    const ink = fill ? firstColor(fill) : 'currentColor';
    return <svg viewBox={sticker.vb ?? '0 0 100 100'} width="100%" height="100%" aria-hidden="true" overflow="visible">
      <defs><Defs id={paintId} fill={fill} />{grain && <Crayon id={`${paintId}-c`} w={w} />}</defs>
      <g filter={grain ? `url(#${paintId}-c)` : undefined}>{sticker.paths.map((p, i) => p.fill
        ? <path key={i} d={p.d} fill={p.color ?? color} fillRule={p.evenodd ? 'evenodd' : undefined} opacity={p.opacity} />
        : <path key={i} d={p.d} fill="none" stroke={p.color ?? ink} strokeWidth={p.stroke} strokeLinecap="round" strokeLinejoin="round" opacity={p.opacity} />)}</g>
    </svg>;
  }
  const line = stroke ? { stroke: stroke.color, strokeWidth: stroke.w } : {};
  const svg = (children: React.ReactNode, ratio: 'none' | 'meet' = 'meet') =>
    <svg viewBox="0 0 100 100" width="100%" height="100%" preserveAspectRatio={ratio === 'none' ? 'none' : 'xMidYMid meet'} aria-hidden="true" overflow="visible">
      <Defs id={paintId} fill={fill} />{children}</svg>;
  switch (shape) {
    case 'burst': return svg(<polygon points={burst(18, 50, 30)} fill={color} {...line} />);
    case 'sparkle': return svg(<path d="M50 0C53 30 70 47 100 50 70 53 53 70 50 100 47 70 30 53 0 50 30 47 47 30 50 0Z" fill={color} {...line} />);
    case 'plus': return svg(<path d="M50 12v76M12 50h76" stroke={fill ? firstColor(fill) : 'currentColor'} strokeWidth="16" strokeLinecap="round" fill="none" />);
    case 'heart': return svg(<path d="M50 88S10 63 10 34A20 20 0 0 1 50 24a20 20 0 0 1 40 10c0 29-40 54-40 54Z" fill="none" stroke={fill ? firstColor(fill) : 'currentColor'}
      strokeWidth="5" strokeLinejoin="round" />);
    case 'arrow': return svg(<g fill="none" stroke={fill ? firstColor(fill) : 'currentColor'} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 30C30 6 64 10 78 44" /><path d="M64 38l15 8 4-17" /></g>);
    case 'ribbon': return svg(<polygon points="0,0 100,0 82,50 100,100 0,100" fill={color} {...line} />, 'none');
    case 'flare': return svg(<g>
      <defs><radialGradient id={`${paintId}-f`}><stop offset="0" stopColor="#fff" /><stop offset=".25" stopColor="#fff" stopOpacity=".9" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></radialGradient></defs>
      <circle cx="50" cy="50" r="22" fill={`url(#${paintId}-f)`} />
      <path d="M50 2v96M2 50h96" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" opacity=".9" />
      <path d="M22 78 78 22M30 30l40 40" stroke="#fff" strokeWidth=".9" strokeLinecap="round" opacity=".55" /></g>);
    case 'pin-line': return svg(<g stroke={fill ? firstColor(fill) : '#fff'} fill="none"><path d="M50 0v92" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
      <circle cx="50" cy="95.5" r="3.5" strokeWidth="1.6" vectorEffect="non-scaling-stroke" /></g>, 'none');
    case 'wave': return svg(<path d="M0 50c12.5-24 25-24 37.5 0s25 24 37.5 0 25-24 25 0" fill="none" stroke={fill ? firstColor(fill) : 'currentColor'} strokeWidth="6" strokeLinecap="round" />, 'none');
    case 'squiggle': return svg(<path d="M4 60 18 36 32 62 46 36 60 62 74 36 88 62 96 48" fill="none" stroke={fill ? firstColor(fill) : 'currentColor'} strokeWidth="6"
      strokeLinecap="round" strokeLinejoin="round" />);
    case 'dots': return svg(<g fill={fill ? firstColor(fill) : 'currentColor'}>{Array.from({ length: 25 }, (_, i) =>
      <circle key={i} cx={10 + (i % 5) * 20} cy={10 + Math.floor(i / 5) * 20} r="3.2" />)}</g>, 'none');
    case 'checker': return svg(<g>{Array.from({ length: 64 }, (_, i) => (Math.floor(i / 8) + i) % 2
      ? <rect key={i} x={(i % 8) * 12.5} y={Math.floor(i / 8) * 12.5} width="12.5" height="12.5" fill={fill ? firstColor(fill) : '#111'} /> : null)}</g>, 'none');
    case 'glow': return svg(<g><defs><radialGradient id={`${paintId}-g`}><stop offset="0" stopColor={fill ? firstColor(fill) : '#fff'} stopOpacity=".95" />
      <stop offset=".45" stopColor={fill ? firstColor(fill) : '#fff'} stopOpacity=".35" /><stop offset="1" stopColor={fill ? firstColor(fill) : '#fff'} stopOpacity="0" /></radialGradient></defs>
      <ellipse cx="50" cy="50" rx="50" ry="50" fill={`url(#${paintId}-g)`} /></g>, 'none');
    default: return null;
  }
}
