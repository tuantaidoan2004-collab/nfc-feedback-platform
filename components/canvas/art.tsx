/**
 * Tranh minh hoạ dựng sẵn của template (nguồn ảnh `art:<khoá>`, lib/canvas/doc.ts `ARTS`). Vẽ bằng vector để template mặc
 * định không mang ảnh của ai: không ảnh kho có bản quyền, không logo thật. Quán thay bằng ảnh của mình khi sửa trang (ảnh tải
 * lên qua cửa duyệt). Mỗi tranh lấp đầy hộp của nó (`slice`), vẽ một lần trên máy chủ, không tải gì thêm.
 */
import type { ReactNode } from 'react';
import type { ArtKey } from '@/lib/canvas/doc';

/** Same stars every time: a page drawn on the server and again in the browser must match. */
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 2 ** 32; };
}
/** `top`: a section's background keeps its top edge on the design's top edge (the elements on it are placed from the top). */
type ArtProps = { id: string; top?: boolean };
const frame = (w: number, h: number, children: ReactNode, fit: 'slice' | 'meet' = 'slice', top = false) =>
  <svg viewBox={`0 0 ${w} ${h}`} width="100%" height="100%" preserveAspectRatio={`xMid${top && fit === 'slice' ? 'YMin' : 'YMid'} ${fit}`} aria-hidden="true">{children}</svg>;

function Space({ id, top }: ArtProps) {
  const rand = seeded(4207);
  const stars = Array.from({ length: 170 }, (_, i) => {
    const x = rand() * 390, y = rand() * 700, r = rand() < .9 ? .35 + rand() * .8 : 1 + rand() * .9;
    const tint = rand(), color = tint < .08 ? '#ffd9a8' : tint < .16 ? '#bcd7ff' : '#ffffff';
    return <circle key={i} cx={x.toFixed(1)} cy={y.toFixed(1)} r={r.toFixed(2)} fill={color} opacity={(.35 + rand() * .65).toFixed(2)} />;
  });
  const bright = [[48, 118], [318, 74], [352, 382], [86, 520], [240, 610], [140, 300]].map(([x, y], i) => <g key={i} transform={`translate(${x} ${y})`} opacity=".9">
    <circle r="7" fill={`url(#${id}-star)`} /><path d="M-12 0h24M0-12v24" stroke="#fff" strokeWidth=".6" opacity=".8" /><circle r="1.4" fill="#fff" /></g>);
  return frame(390, 700, <>
    <defs>
      <radialGradient id={`${id}-sky`} cx="50%" cy="40%" r="80%"><stop offset="0" stopColor="#0d1020" /><stop offset=".6" stopColor="#06070d" /><stop offset="1" stopColor="#020205" /></radialGradient>
      <radialGradient id={`${id}-neb`} cx="50%" cy="50%" r="50%"><stop offset="0" stopColor="#3a2d6b" stopOpacity=".55" /><stop offset=".5" stopColor="#1d2a5c" stopOpacity=".25" /><stop offset="1" stopColor="#000" stopOpacity="0" /></radialGradient>
      <radialGradient id={`${id}-neb2`} cx="50%" cy="50%" r="50%"><stop offset="0" stopColor="#6b2d4f" stopOpacity=".35" /><stop offset="1" stopColor="#000" stopOpacity="0" /></radialGradient>
      <radialGradient id={`${id}-star`}><stop offset="0" stopColor="#fff" /><stop offset=".3" stopColor="#cfe0ff" stopOpacity=".6" /><stop offset="1" stopColor="#cfe0ff" stopOpacity="0" /></radialGradient>
      <radialGradient id={`${id}-horizon`} cx="50%" cy="100%" r="60%"><stop offset="0" stopColor="#8ab8ff" stopOpacity=".55" /><stop offset=".35" stopColor="#4b7bd8" stopOpacity=".18" /><stop offset="1" stopColor="#000" stopOpacity="0" /></radialGradient>
      <filter id={`${id}-soft`}><feGaussianBlur stdDeviation="18" /></filter>
    </defs>
    <rect width="390" height="700" fill={`url(#${id}-sky)`} />
    <ellipse cx="250" cy="250" rx="260" ry="90" transform="rotate(-28 250 250)" fill={`url(#${id}-neb)`} filter={`url(#${id}-soft)`} />
    <ellipse cx="90" cy="430" rx="150" ry="70" transform="rotate(20 90 430)" fill={`url(#${id}-neb2)`} filter={`url(#${id}-soft)`} />
    <circle cx="-120" cy="300" r="260" fill="none" stroke="#9fb7ff" strokeOpacity=".08" strokeWidth="1.2" />
    {stars}{bright}
    <ellipse cx="195" cy="700" rx="260" ry="80" fill={`url(#${id}-horizon)`} />
    <path d="M40 672 Q195 662 350 672" stroke="#d6e6ff" strokeOpacity=".75" strokeWidth="1.4" fill="none" filter={`url(#${id}-soft)`} />
    <path d="M70 671 Q195 664 320 671" stroke="#ffffff" strokeOpacity=".9" strokeWidth=".9" fill="none" />
  </>, 'slice', top);
}

function Barber({ id, top }: ArtProps) {
  const rand = seeded(17);
  const bokeh = Array.from({ length: 22 }, (_, i) => <circle key={i} cx={(rand() * 390).toFixed(1)} cy={(rand() * 700).toFixed(1)} r={(4 + rand() * 14).toFixed(1)}
    fill="#fff" opacity={(.04 + rand() * .08).toFixed(2)} />);
  const marquee = Array.from({ length: 28 }, (_, i) => { const a = i / 28 * Math.PI * 2; return <circle key={i} cx={(70 + Math.cos(a) * 52).toFixed(1)} cy={(78 + Math.sin(a) * 52).toFixed(1)} r="3" fill="#f2f2f2" />; });
  return frame(390, 700, <>
    <defs>
      <linearGradient id={`${id}-wall`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2b2b2b" /><stop offset=".55" stopColor="#3b3b3b" /><stop offset="1" stopColor="#161616" /></linearGradient>
      <linearGradient id={`${id}-floor`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#262626" /><stop offset="1" stopColor="#0d0d0d" /></linearGradient>
      <filter id={`${id}-dof`}><feGaussianBlur stdDeviation="1.6" /></filter>
      <filter id={`${id}-far`}><feGaussianBlur stdDeviation="3.2" /></filter>
    </defs>
    <rect width="390" height="700" fill={`url(#${id}-wall)`} />
    <g filter={`url(#${id}-far)`}>
      <rect x="0" y="520" width="390" height="180" fill={`url(#${id}-floor)`} />
      {[[252, 140, 70, 92], [300, 250, 64, 86], [258, 360, 72, 98], [330, 430, 52, 74]].map(([x, y, w, h], i) => <g key={i}>
        <rect x={x} y={y} width={w} height={h} fill="#e9e9e9" opacity=".75" /><rect x={x + 7} y={y + 7} width={w - 14} height={h - 14} fill="#4a4a4a" />
        <ellipse cx={x + w / 2} cy={y + h / 2 - 6} rx={w / 5} ry={h / 4.5} fill="#8a8a8a" /></g>)}
      <rect x="292" y="40" width="88" height="70" rx="8" fill="#515151" /><text x="336" y="82" textAnchor="middle" fontSize="13" fill="#bbb" fontFamily="Georgia, serif" fontWeight="700">SINCE</text>
      <g>{marquee}</g><circle cx="70" cy="78" r="38" fill="#3c3c3c" />
      <rect x="18" y="300" width="26" height="150" rx="10" fill="#d9d9d9" />
      {Array.from({ length: 7 }, (_, i) => <path key={i} d={`M18 ${312 + i * 20} L44 ${300 + i * 20}`} stroke="#5d5d5d" strokeWidth="6" />)}
      <rect x="22" y="288" width="18" height="14" rx="6" fill="#9a9a9a" /><rect x="22" y="448" width="18" height="14" rx="6" fill="#9a9a9a" />
    </g>
    <g filter={`url(#${id}-dof)`}>
      <path d="M104 700 L120 560 Q128 520 170 512 L236 506 Q266 504 270 540 L282 700Z" fill="#1d1d1d" />
      <path d="M150 420 Q148 360 186 342 Q226 330 236 380 Q240 420 214 446 Q190 462 166 452Z" fill="#555" />
      <path d="M128 520 Q140 452 186 448 Q236 446 252 500 L262 560 L118 566Z" fill="#2f2f2f" />
      <rect x="292" y="560" width="98" height="120" rx="14" fill="#232323" /><rect x="300" y="520" width="82" height="52" rx="12" fill="#2d2d2d" />
    </g>
    {bokeh}
  </>, 'slice', top);
}

function Car({ id, top }: ArtProps) {
  return frame(390, 250, <>
    <defs>
      <linearGradient id={`${id}-body`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#c3c8cf" /><stop offset=".3" stopColor="#6c727a" /><stop offset=".62" stopColor="#2c2f34" /><stop offset="1" stopColor="#0e0f11" /></linearGradient>
      <linearGradient id={`${id}-glass`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#3b4250" /><stop offset=".5" stopColor="#0e1015" /><stop offset="1" stopColor="#1c2029" /></linearGradient>
      <radialGradient id={`${id}-rim`}><stop offset="0" stopColor="#5a5f66" /><stop offset=".6" stopColor="#1b1d20" /><stop offset="1" stopColor="#050506" /></radialGradient>
      <radialGradient id={`${id}-shadow`} cx="50%" cy="50%" r="50%"><stop offset="0" stopColor="#000" stopOpacity=".9" /><stop offset="1" stopColor="#000" stopOpacity="0" /></radialGradient>
      <linearGradient id={`${id}-shine`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#fff" stopOpacity="0" /><stop offset=".5" stopColor="#fff" stopOpacity=".55" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></linearGradient>
    </defs>
    <ellipse cx="200" cy="214" rx="190" ry="16" fill={`url(#${id}-shadow)`} />
    <path d="M18 176 Q16 150 46 142 L120 126 Q160 86 214 78 Q268 74 300 98 L352 124 Q382 132 384 160 L384 182 Q384 194 372 196 L30 198 Q18 196 18 176Z" fill={`url(#${id}-body)`} />
    <path d="M132 124 Q170 92 216 88 Q262 86 292 108 L300 118 L140 128Z" fill={`url(#${id}-glass)`} />
    <path d="M150 122 L212 92 M240 92 L262 118" stroke="#5c6470" strokeWidth="1.2" opacity=".7" />
    <path d="M60 140 Q190 112 352 132" stroke={`url(#${id}-shine)`} strokeWidth="2.4" fill="none" />
    <path d="M150 96 Q210 70 282 92" stroke="#ffffff" strokeOpacity=".7" strokeWidth="1.6" fill="none" />
    <path d="M24 176 Q22 160 40 152" stroke="#ffffff" strokeOpacity=".5" strokeWidth="1.2" fill="none" />
    <path d="M30 168 Q200 160 378 168" stroke="#7d838b" strokeWidth=".8" fill="none" opacity=".6" />
    <path d="M340 128 L378 136 L376 146 L346 142Z" fill="#c9302c" /><path d="M342 131 L374 137" stroke="#ff6a5f" strokeWidth="1.4" />
    <path d="M22 160 L52 150 L54 156 L24 166Z" fill="#e8eef7" opacity=".85" />
    <path d="M300 98 L338 92 L346 100 L318 108Z" fill="#1a1c20" />
    {[[96, 188], [306, 188]].map(([cx, cy], i) => <g key={i}><circle cx={cx} cy={cy} r="32" fill="#0b0b0c" /><circle cx={cx} cy={cy} r="24" fill={`url(#${id}-rim)`} />
      {Array.from({ length: 10 }, (_, k) => { const a = k / 10 * Math.PI * 2; return <path key={k} d={`M${cx} ${cy} L${(cx + Math.cos(a) * 22).toFixed(1)} ${(cy + Math.sin(a) * 22).toFixed(1)}`} stroke="#8a9098" strokeWidth="1.6" />; })}
      <circle cx={cx} cy={cy} r="5" fill="#b9bec5" /></g>)}
  </>, 'meet', top);
}

function Drinks({ id, top }: ArtProps) {
  const cup = (x: number, liquid: string, cream: string, tall: number, key: string) => <g key={key}>
    <path d={`M${x - 26} ${170 - tall} L${x + 26} ${170 - tall} L${x + 20} 172 L${x - 20} 172Z`} fill={`url(#${id}-cup)`} />
    <path d={`M${x - 24} ${176 - tall} L${x + 24} ${176 - tall} L${x + 19} 168 L${x - 19} 168Z`} fill={liquid} opacity=".92" />
    <ellipse cx={x} cy={170 - tall} rx="28" ry="7" fill="#f4f1ec" />
    <path d={`M${x - 26} ${168 - tall} Q${x - 22} ${150 - tall} ${x - 6} ${150 - tall} Q${x} ${138 - tall} ${x + 10} ${148 - tall} Q${x + 26} ${150 - tall} ${x + 26} ${168 - tall}Z`} fill={cream} />
    <path d={`M${x - 14} ${156 - tall} q8 -6 18 0 q6 4 10 -2`} stroke="#c7893f" strokeWidth="2" fill="none" opacity={liquid === '#7b5a3e' ? 1 : 0} />
    <rect x={x + 6} y={110 - tall} width="5" height="46" rx="2.5" fill="#1f8a52" transform={`rotate(14 ${x + 8} ${130 - tall})`} />
    <circle cx={x} cy={196 - tall * .4} r="11" fill="#1e7a4c" opacity=".9" /><path d={`M${x - 5} ${196 - tall * .4} q5 -9 10 0 q-5 6 -10 0Z`} fill="#fff" opacity=".9" />
  </g>;
  return frame(307, 190, <>
    <defs>
      <linearGradient id={`${id}-wall`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#bfe3d8" /><stop offset="1" stopColor="#8fcdbd" /></linearGradient>
      <linearGradient id={`${id}-cup`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#ffffff" stopOpacity=".55" /><stop offset=".5" stopColor="#ffffff" stopOpacity=".25" /><stop offset="1" stopColor="#ffffff" stopOpacity=".6" /></linearGradient>
    </defs>
    <rect width="307" height="190" fill={`url(#${id}-wall)`} />
    <g fill="#5fae7d" opacity=".75">{[[250, -10, 30], [282, 10, 60], [210, -20, -10]].map(([x, y, r], i) =>
      <path key={i} d="M0 0 C20 10 40 40 44 90 C30 60 12 40 0 0Z" transform={`translate(${x} ${y}) rotate(${r})`} />)}</g>
    <rect x="18" y="128" width="96" height="70" rx="4" fill="#f4b6c8" /><rect x="100" y="100" width="110" height="98" rx="4" fill="#f7c4d3" /><rect x="198" y="140" width="96" height="60" rx="4" fill="#efa9bd" />
    <rect x="100" y="100" width="110" height="10" fill="#fbd6e1" /><circle cx="112" cy="118" r="3" fill="#d9a441" /><circle cx="196" cy="118" r="3" fill="#d9a441" />
    {cup(66, '#7b5a3e', '#fbf6ee', 52, 'a')}{cup(154, '#f3efe8', '#fbf6ee', 84, 'b')}{cup(246, '#8fbf5a', '#f3f6e9', 40, 'c')}
  </>, 'slice', top);
}

function Smile({ id, top }: ArtProps) {
  return frame(220, 222, <>
    <defs>
      <linearGradient id={`${id}-skin`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#e9b996" /><stop offset=".55" stopColor="#d99b77" /><stop offset="1" stopColor="#c98563" /></linearGradient>
      <linearGradient id={`${id}-lip`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#d9707a" /><stop offset="1" stopColor="#b84d5c" /></linearGradient>
      <linearGradient id={`${id}-teeth`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffffff" /><stop offset="1" stopColor="#e9edf1" /></linearGradient>
      <filter id={`${id}-soft`}><feGaussianBlur stdDeviation="2.2" /></filter>
    </defs>
    <rect width="220" height="222" fill={`url(#${id}-skin)`} />
    <ellipse cx="110" cy="22" rx="46" ry="26" fill="#c98563" opacity=".55" filter={`url(#${id}-soft)`} />
    <path d="M84 30 Q110 48 136 30" stroke="#b9714f" strokeWidth="3" fill="none" opacity=".6" />
    <path d="M28 118 Q60 74 96 80 Q110 86 124 80 Q160 74 192 118 Q160 112 110 114 Q60 112 28 118Z" fill={`url(#${id}-lip)`} />
    <path d="M30 120 Q110 112 190 120 Q170 176 110 182 Q50 176 30 120Z" fill="#7a2f3a" />
    <path d="M38 121 Q110 113 182 121 L176 140 Q110 150 44 140Z" fill={`url(#${id}-teeth)`} />
    {[62, 80, 98, 116, 134, 152].map((x, i) => <path key={i} d={`M${x + 8} 118 L${x + 6} 144`} stroke="#d5dbe0" strokeWidth="1.2" />)}
    <path d="M54 150 Q110 168 166 150 L160 158 Q110 170 60 158Z" fill="#f4f6f8" opacity=".9" />
    <path d="M30 120 Q50 182 110 188 Q170 182 190 120 Q172 196 110 204 Q48 196 30 120Z" fill={`url(#${id}-lip)`} />
    <path d="M70 196 Q110 206 150 196" stroke="#f3a6ae" strokeWidth="3" fill="none" opacity=".7" strokeLinecap="round" />
  </>, 'slice', top);
}

function Arches({ id, top }: ArtProps) {
  const arch = (x: number, y: number, w: number, h: number, key: string) => <path key={key} d={`M${x} ${y + h} V${y + w / 2} A${w / 2} ${w / 2} 0 0 1 ${x + w} ${y + w / 2} V${y + h}Z`} fill="#d8c8ae" />;
  return frame(390, 700, <>
    <defs>
      <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3f7fc2" /><stop offset=".55" stopColor="#86b6e3" /><stop offset="1" stopColor="#cfe3f3" /></linearGradient>
      <linearGradient id={`${id}-stone`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#f7efe2" /><stop offset="1" stopColor="#e6d6bd" /></linearGradient>
      <filter id={`${id}-cloud`}><feGaussianBlur stdDeviation="9" /></filter>
    </defs>
    <rect width="390" height="700" fill={`url(#${id}-sky)`} />
    <g fill="#fff" opacity=".85" filter={`url(#${id}-cloud)`}><ellipse cx="80" cy="120" rx="90" ry="22" /><ellipse cx="260" cy="70" rx="120" ry="18" /><ellipse cx="320" cy="200" rx="80" ry="16" /><ellipse cx="60" cy="260" rx="70" ry="14" /></g>
    <g>
      <rect x="300" y="60" width="34" height="380" fill={`url(#${id}-stone)`} /><rect x="294" y="160" width="46" height="12" fill="#efe3cf" /><rect x="294" y="250" width="46" height="12" fill="#efe3cf" />
      <path d="M300 60 Q317 10 334 60Z" fill="#e7d7bb" /><rect x="315" y="0" width="4" height="22" fill="#cdb48a" /><circle cx="317" cy="0" r="4" fill="#cdb48a" />
      {[90, 130, 190, 220, 280, 320, 360].map((y, i) => <rect key={i} x="310" y={y} width="14" height="20" rx="7" fill="#c7b08c" opacity=".7" />)}
    </g>
    <path d="M0 380 L390 340 L390 700 L0 700Z" fill={`url(#${id}-stone)`} />
    <path d="M0 380 L390 340 L390 352 L0 394Z" fill="#efe3cf" />
    {Array.from({ length: 7 }, (_, i) => arch(10 + i * 56, 420 - i * 5, 40, 90, `a${i}`))}
    <path d="M0 520 L390 488 L390 498 L0 532Z" fill="#efe3cf" />
    {Array.from({ length: 7 }, (_, i) => arch(10 + i * 56, 548 - i * 4, 40, 110, `b${i}`))}
    {Array.from({ length: 7 }, (_, i) => <g key={i} fill="#bfa47c" opacity=".55">{Array.from({ length: 4 }, (_, k) => <rect key={k} x={16 + i * 56 + k * 7} y={436 - i * 5} width="3" height="66" />)}</g>)}
  </>, 'slice', top);
}

function Dental({ id, top }: ArtProps) {
  return frame(220, 300, <>
    <defs>
      <linearGradient id={`${id}-steel`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#5c6670" /><stop offset=".35" stopColor="#e9eef2" /><stop offset=".6" stopColor="#9aa5ae" /><stop offset="1" stopColor="#4b545c" /></linearGradient>
      <radialGradient id={`${id}-mirror`} cx="40%" cy="35%" r="70%"><stop offset="0" stopColor="#ffffff" /><stop offset=".5" stopColor="#b9c4cc" /><stop offset="1" stopColor="#6c7882" /></radialGradient>
      <linearGradient id={`${id}-glove`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ffffff" /><stop offset="1" stopColor="#d9dfe3" /></linearGradient>
    </defs>
    <g transform="rotate(10 120 150)">
      <rect x="118" y="30" width="7" height="200" rx="3" fill={`url(#${id}-steel)`} /><path d="M121 30 L121 14 Q121 6 128 6" stroke="#c9d2d8" strokeWidth="2.4" fill="none" />
      <rect x="117" y="70" width="9" height="40" rx="3" fill="#8f9aa3" opacity=".6" />
    </g>
    <g transform="rotate(-12 100 150)">
      <rect x="92" y="40" width="8" height="190" rx="3.5" fill={`url(#${id}-steel)`} />
      <circle cx="96" cy="28" r="22" fill="#4d5761" /><circle cx="96" cy="28" r="18.5" fill={`url(#${id}-mirror)`} /><path d="M86 20 Q92 14 100 16" stroke="#fff" strokeWidth="2" fill="none" opacity=".8" />
      {Array.from({ length: 8 }, (_, i) => <rect key={i} x="92" y={120 + i * 8} width="8" height="2.6" fill="#59636d" opacity=".55" />)}
    </g>
    <path d="M58 300 L52 224 Q48 196 70 190 L94 186 Q96 170 112 170 Q128 170 128 186 L150 186 Q168 186 170 204 L176 300Z" fill={`url(#${id}-glove)`} />
    <path d="M70 190 Q60 206 74 214 L126 212 Q140 210 138 196" fill="#f3f6f8" stroke="#c9d1d6" strokeWidth="1.4" />
    <path d="M78 214 Q76 232 92 236 L134 232 Q146 230 144 216" fill="#eef2f5" stroke="#c9d1d6" strokeWidth="1.4" />
    <path d="M74 238 Q72 256 90 258 L136 254 Q150 252 148 238" fill="#e9eef2" stroke="#c9d1d6" strokeWidth="1.4" />
    <path d="M120 170 Q140 156 148 168 Q154 182 140 192" fill="#f6f8fa" stroke="#c9d1d6" strokeWidth="1.4" />
  </>, 'meet', top);
}

function Latte({ id, top }: ArtProps) {
  return frame(390, 700, <>
    <defs>
      <radialGradient id={`${id}-bg`} cx="50%" cy="40%" r="80%"><stop offset="0" stopColor="#a8927f" /><stop offset=".5" stopColor="#806858" /><stop offset="1" stopColor="#4a3a31" /></radialGradient>
      <radialGradient id={`${id}-coffee`} cx="45%" cy="40%" r="60%"><stop offset="0" stopColor="#cfa173" /><stop offset=".55" stopColor="#a6743f" /><stop offset="1" stopColor="#6e4522" /></radialGradient>
      <linearGradient id={`${id}-skin`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#f2cbb0" /><stop offset="1" stopColor="#c98f6b" /></linearGradient>
      <linearGradient id={`${id}-sleeve`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#c56a2c" /><stop offset="1" stopColor="#7a3a14" /></linearGradient>
      <filter id={`${id}-blur`}><feGaussianBlur stdDeviation="16" /></filter>
      <filter id={`${id}-soft`}><feGaussianBlur stdDeviation="1.2" /></filter>
    </defs>
    <rect width="390" height="700" fill={`url(#${id}-bg)`} />
    <g filter={`url(#${id}-blur)`}>
      <rect x="-30" y="20" width="450" height="60" fill="#d8cdc2" opacity=".35" /><rect x="-30" y="300" width="450" height="36" fill="#d8cdc2" opacity=".22" />
      <ellipse cx="80" cy="560" rx="150" ry="160" fill="#9b5527" opacity=".75" /><ellipse cx="330" cy="620" rx="190" ry="130" fill="#b8632a" opacity=".85" />
      <circle cx="150" cy="420" r="46" fill="#ece5dc" opacity=".45" /><circle cx="250" cy="470" r="38" fill="#ece5dc" opacity=".35" />
    </g>
    <path d="M420 700 L420 420 Q360 350 318 300 L262 330 Q300 420 300 520 L290 700Z" fill={`url(#${id}-sleeve)`} />
    <path d="M318 300 Q296 262 262 250 Q236 246 228 268 L250 330 Q268 344 290 336Z" fill={`url(#${id}-skin)`} />
    <g filter={`url(#${id}-soft)`}>{[0, 1, 2, 3].map(i => <path key={i} d={`M${300 - i * 10} ${118 + i * 30} q${30 - i * 2} 6 ${28 - i * 2} ${22} q-4 12 -30 8`}
      fill="#eab896" stroke="#c4896a" strokeWidth="1.3" />)}</g>
    <circle cx="200" cy="190" r="104" fill="#f5f1eb" /><circle cx="200" cy="190" r="104" fill="none" stroke="#dcd3c7" strokeWidth="2.2" />
    <circle cx="200" cy="190" r="92" fill={`url(#${id}-coffee)`} />
    <g fill="#f6efe4" opacity=".96" transform="translate(-5 16) scale(.92)" style={{ transformOrigin: '205px 182px' }}>
      <path d="M205 100 C238 114 250 156 232 188 C218 210 192 210 178 188 C160 156 172 114 205 100Z" />
      <path d="M205 212 C186 220 178 242 190 256 C198 264 212 264 220 256 C232 242 224 220 205 212Z" opacity=".9" />
      <path d="M205 108 L205 262" stroke="#a6743f" strokeWidth="2.2" />
      {[0, 1, 2, 3].map(i => <path key={i} d={`M${184 + i * 2} ${136 + i * 17} Q205 ${152 + i * 17} ${226 - i * 2} ${136 + i * 17}`} stroke="#b88452" strokeWidth="2" fill="none" />)}
    </g>
  </>, 'slice', top);
}

function Hair({ id, top }: ArtProps) {
  const rand = seeded(91);
  const strands = Array.from({ length: 46 }, (_, i) => {
    const x = -40 + i * 10 + rand() * 8, amp = 18 + rand() * 26, w = 3 + rand() * 9;
    const d = `M${x} -20 C${x + amp} 120 ${x - amp} 240 ${x + amp * .6} 360 S${x - amp} 560 ${x + amp * .4} 720`;
    return <path key={i} d={d} stroke={`url(#${id}-gold)`} strokeWidth={w.toFixed(1)} fill="none" opacity={(.35 + rand() * .55).toFixed(2)} strokeLinecap="round" />;
  });
  return frame(390, 700, <>
    <defs>
      <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#f3f1ee" /><stop offset="1" stopColor="#dcd6cf" /></linearGradient>
      <linearGradient id={`${id}-gold`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#8a5a2b" /><stop offset=".3" stopColor="#d6a565" /><stop offset=".55" stopColor="#f2d39b" /><stop offset=".8" stopColor="#c48a4a" /><stop offset="1" stopColor="#8a5a2b" /></linearGradient>
      <filter id={`${id}-soft`}><feGaussianBlur stdDeviation="1.1" /></filter>
    </defs>
    <rect width="390" height="700" fill={`url(#${id}-bg)`} />
    <ellipse cx="150" cy="200" rx="74" ry="96" fill="#efcfb6" />
    <path d="M118 196 q12 -8 24 0 M162 196 q12 -8 24 0" stroke="#7a5a44" strokeWidth="3" fill="none" strokeLinecap="round" />
    <path d="M130 250 Q152 266 176 250" stroke="#c9707a" strokeWidth="5" fill="none" strokeLinecap="round" />
    <g filter={`url(#${id}-soft)`}>{strands}</g>
  </>, 'slice', top);
}

function Prism({ id, top }: ArtProps) {
  const bands = ['#ff4d6d', '#ffa53d', '#ffe45c', '#5ce17b', '#4fb4ff', '#9b6bff'];
  return frame(390, 300, <>
    <defs><filter id={`${id}-b`}><feGaussianBlur stdDeviation="5" /></filter></defs>
    <g filter={`url(#${id}-b)`} opacity=".55">{bands.map((c, i) => <path key={i} d={`M-40 ${210 - i * 9} Q120 ${40 - i * 9} 420 ${-20 - i * 9}`} stroke={c} strokeWidth="9" fill="none" />)}</g>
    <g opacity=".35">{bands.map((c, i) => <path key={i} d={`M-20 ${300 - i * 7} Q90 ${150 - i * 7} 230 ${40 - i * 7}`} stroke={c} strokeWidth="5" fill="none" />)}</g>
  </>, 'slice', top);
}

function Photo({ id, top }: ArtProps) {
  return frame(200, 200, <>
    <defs><linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffd6c2" /><stop offset="1" stopColor="#f6a98d" /></linearGradient></defs>
    <rect width="200" height="200" fill={`url(#${id}-sky)`} /><circle cx="140" cy="62" r="20" fill="#fff4e0" />
    <path d="M0 160 L52 98 L96 146 L128 112 L200 172 L200 200 L0 200Z" fill="#e2775a" /><path d="M0 178 L64 132 L120 176 L160 150 L200 186 L200 200 L0 200Z" fill="#b8503d" />
  </>, 'slice', top);
}

function Racing({ id, top }: ArtProps) {
  return frame(390, 700, <>
    <defs><linearGradient id={`${id}-bg`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1a1a1d" /><stop offset="1" stopColor="#0b0b0c" /></linearGradient></defs>
    <rect width="390" height="700" fill={`url(#${id}-bg)`} />
    {Array.from({ length: 9 }, (_, i) => <path key={i} d={`M${-60 + i * 14} ${700 - i * 80} L${450} ${600 - i * 80}`} stroke="#e10600" strokeOpacity={.06 + (i % 3) * .04} strokeWidth={2 + (i % 4) * 2} />)}
    <g opacity=".22">{Array.from({ length: 48 }, (_, i) => (Math.floor(i / 12) + i) % 2 ? <rect key={i} x={(i % 12) * 34} y={620 + Math.floor(i / 12) * 20} width="34" height="20" fill="#fff" /> : null)}</g>
  </>, 'slice', top);
}
function Nails({ id, top }: ArtProps) {
  const rand = seeded(5);
  return frame(390, 700, <>
    <defs><linearGradient id={`${id}-bg`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ffe3ee" /><stop offset=".5" stopColor="#f6d2ff" /><stop offset="1" stopColor="#ffd9e6" /></linearGradient></defs>
    <rect width="390" height="700" fill={`url(#${id}-bg)`} />
    {Array.from({ length: 90 }, (_, i) => <circle key={i} cx={(rand() * 390).toFixed(1)} cy={(rand() * 700).toFixed(1)} r={(.6 + rand() * 1.8).toFixed(2)}
      fill={rand() < .5 ? '#ffffff' : '#e7a6ff'} opacity={(.4 + rand() * .6).toFixed(2)} />)}
  </>, 'slice', top);
}
function Pho({ id, top }: ArtProps) {
  return frame(390, 700, <>
    <defs><radialGradient id={`${id}-bg`} cx="50%" cy="30%" r="80%"><stop offset="0" stopColor="#fff3dc" /><stop offset="1" stopColor="#f3d3a4" /></radialGradient></defs>
    <rect width="390" height="700" fill={`url(#${id}-bg)`} />
    <g fill="none" stroke="#c0392b" strokeOpacity=".12" strokeWidth="3">{Array.from({ length: 6 }, (_, i) => <path key={i} d={`M0 ${80 + i * 110} q20 -20 40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0`} />)}</g>
  </>, 'slice', top);
}
function Party({ id, top }: ArtProps) {
  const rand = seeded(8);
  return frame(390, 700, <>
    <rect width="390" height="700" fill="#1d1529" />
    {Array.from({ length: 40 }, (_, i) => <rect key={i} x={(rand() * 390).toFixed(1)} y={(rand() * 700).toFixed(1)} width="5" height="2.4" rx="1"
      fill={['#ff4fa3', '#9b7bff', '#ffd166', '#4dd6c8'][i % 4]} opacity=".55" transform={`rotate(${Math.round(rand() * 180)})`} />)}
    <title id={`${id}-t`}>party</title>
  </>, 'slice', top);
}

const ARTWORK: Record<ArtKey, (props: ArtProps) => ReactNode> = {
  space: Space, barber: Barber, car: Car, drinks: Drinks, smile: Smile, arches: Arches, dental: Dental, latte: Latte, hair: Hair, prism: Prism,
  photo: Photo, racing: Racing, nails: Nails, pho: Pho, party: Party,
};
export default function Art({ art, id, top }: { art: ArtKey; id: string; top?: boolean }) {
  const Draw = ARTWORK[art];
  return <Draw id={`cva-${id}`} top={top} />;
}
