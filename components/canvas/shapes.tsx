/**
 * Hình vẽ của trang canvas (lib/canvas/doc.ts `SHAPES`). Hình chữ nhật và tròn vẽ bằng CSS (bo góc, kính, viền chuyển màu);
 * các hình trang trí — sao nổ, lấp lánh, dấu cộng, tim, mũi tên vẽ tay, ruy băng, tia sáng, đường kẻ có chấm… — là SVG.
 */
import type { Fill, ShapeKey } from '@/lib/canvas/doc';
import { firstColor } from '@/lib/canvas/paint';

type Props = { shape: ShapeKey; fill?: Fill; stroke?: { w: number; color: string }; id: string };

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

export default function Shape({ shape, fill, stroke, id }: Props) {
  const paintId = `cvs-${id}`, color = fill ? (typeof fill === 'string' ? fill : `url(#${paintId})`) : 'currentColor';
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
