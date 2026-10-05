/**
 * Hai minh hoạ của Dashboard, vẽ bằng SVG như tranh minh hoạ của YouTube Studio: nét đen, mảng màu phẳng, viền sáng. Orb thu
 * nhỏ (mascot, kịch bản mục 6) xuất hiện trong cả hai.
 */
export function FirstCardArt() {
  return <svg viewBox="0 0 220 150" width="180" height="123" aria-hidden="true">
    <defs>
      <radialGradient id="qs-art-orb" cx="35%" cy="30%" r="70%"><stop offset="0" stopColor="#fff" /><stop offset=".6" stopColor="#e3ebff" /><stop offset="1" stopColor="#a9bdf5" /></radialGradient>
    </defs>
    <g fill="none" stroke="#0b0b0c" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round">
      <rect x="36" y="44" width="92" height="60" rx="10" fill="#1f5bff" transform="rotate(-12 82 74)" />
      <path d="M62 66a14 14 0 0 1 0 18M68 60a22 22 0 0 1 0 30" stroke="#fff" transform="rotate(-12 82 74)" />
      <rect x="112" y="22" width="54" height="98" rx="12" fill="#fff" transform="rotate(10 139 71)" />
      <rect x="121" y="34" width="36" height="58" rx="5" fill="#ffe8e0" transform="rotate(10 139 71)" />
      <path d="M128 102h20" transform="rotate(10 139 71)" />
      <path d="M96 30c4-8 10-12 18-12M100 20l-4 10 10-2" stroke="#ff5a36" />
      <circle cx="178" cy="112" r="17" fill="url(#qs-art-orb)" />
      <path d="M171 112h.01M185 112h.01" strokeWidth="3.4" />
      <path d="M174 119c2.6 2 5.4 2 8 0" />
    </g>
    <g fill="#ff5a36"><path d="m30 28 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z" /><path d="m196 40 2 4 4 2-4 2-2 4-2-4-4-2 4-2Z" /></g>
  </svg>;
}

export function NewTemplatesArt() {
  return <svg viewBox="0 0 320 170" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
    <defs>
      <linearGradient id="qs-art-party" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2a1f4a" /><stop offset="1" stopColor="#140f26" /></linearGradient>
      <linearGradient id="qs-art-dental" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#13706d" /><stop offset="1" stopColor="#0b3b3a" /></linearGradient>
      <linearGradient id="qs-art-coffee" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#b98a62" /><stop offset="1" stopColor="#6d4a31" /></linearGradient>
      <radialGradient id="qs-art-orb2" cx="35%" cy="30%" r="70%"><stop offset="0" stopColor="#fff" /><stop offset=".6" stopColor="#e3ebff" /><stop offset="1" stopColor="#a9bdf5" /></radialGradient>
    </defs>
    <rect width="320" height="170" rx="18" fill="#f3f0ff" />
    <g stroke="#0b0b0c" strokeWidth="2.2" strokeLinejoin="round">
      <g transform="rotate(-10 92 92)"><rect x="56" y="26" width="72" height="128" rx="12" fill="url(#qs-art-coffee)" />
        <circle cx="92" cy="72" r="20" fill="#f7efe6" /><path d="M84 72c4-6 12-6 16 0" fill="none" stroke="#b98a62" />
        <rect x="66" y="112" width="52" height="12" rx="6" fill="#fff" /></g>
      <g transform="rotate(9 228 92)"><rect x="192" y="26" width="72" height="128" rx="12" fill="url(#qs-art-dental)" />
        <path d="M218 58c0-8 20-8 20 0 0 6-3 8-4 16-1 6-4 6-5 0-1-4-1-4-2 0-1 6-4 6-5 0-1-8-4-10-4-16Z" fill="#fff" />
        <rect x="202" y="112" width="52" height="12" rx="6" fill="#fff" /></g>
      <g><rect x="124" y="14" width="74" height="136" rx="13" fill="url(#qs-art-party)" />
        <rect x="114" y="48" width="34" height="46" rx="8" fill="#ff4fa3" transform="rotate(-14 131 71)" />
        <rect x="174" y="52" width="34" height="46" rx="8" fill="#7c5cff" transform="rotate(12 191 75)" />
        <rect x="140" y="40" width="42" height="56" rx="9" fill="#2b2250" />
        <circle cx="161" cy="56" r="7" fill="#fff" />
        <rect x="134" y="108" width="54" height="13" rx="6.5" fill="#fff" /></g>
      <circle cx="270" cy="36" r="15" fill="url(#qs-art-orb2)" />
    </g>
    <g fill="#ff5a36"><path d="m40 36 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z" /><path d="m292 120 2 5 5 2-5 2-2 5-2-5-5-2 5-2Z" /></g>
    <g fill="#7c5cff"><path d="m150 162 2 4 4 2-4 2-2 4-2-4-4-2 4-2Z" /></g>
  </svg>;
}
