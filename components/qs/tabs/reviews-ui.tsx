'use client';
/**
 * Mảnh giao diện lấy từ tool theo dõi đánh giá Google Maps của Tài (`~/MAps/frontend`, Tài 05/10: "di chuột thao tác rất
 * mượt, hãy lấy hầu hết đem từ tool qua"): sao, nhãn trạng thái, ảnh đại diện, khung chi tiết trượt từ phải, biểu đồ đánh giá
 * theo tháng có ô số khi rê chuột, phân bố số sao. Vẽ bằng SVG và CSS của app (không thêm thư viện biểu đồ); màu theo
 * nút Sáng/Tối (`--qs-series-*` trong qs.css). Data và Dashboard dùng chung.
 */
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Icon from '../icons';
import styles from './reviews.module.css';

const number = (n: number | null | undefined, decimals = 0) => n === null || n === undefined ? '—'
  : n.toLocaleString('vi-VN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
/** "T11/25", as the tool labels a month. */
export const monthLabel = (ym: string) => { const [y, m] = ym.split('-'); return `T${Number(m)}/${y.slice(2)}`; };
/** The tool's threshold (lib/owner/overview.ts LOW): 1–3★ is a low review. */
export const LOW = 3;

const STAR = 'M12 2.8l2.75 5.57 6.15.9-4.45 4.33 1.05 6.12L12 16.83l-5.5 2.89 1.05-6.12L3.1 9.27l6.15-.9Z';
export function Stars({ value, size = 14 }: { value: number | null; size?: number }) {
  const v = Math.round(value ?? 0);
  return <span className={styles.stars} role="img" aria-label={`${v} trên 5 sao`}>
    {[1, 2, 3, 4, 5].map(i => <svg key={i} viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" data-on={i <= v}><path d={STAR} /></svg>)}
  </span>;
}

export type Tone = 'neutral' | 'accent' | 'good' | 'warning' | 'critical';
export function Badge({ tone = 'neutral', icon, children }: { tone?: Tone; icon?: ReactNode; children: ReactNode }) {
  return <span className={styles.badge} data-tone={tone}>{icon}{children}</span>;
}

export function Avatar({ src, name, size = 36, kind = 'google' }: { src?: string | null; name: string; size?: number; kind?: 'google' | 'private' }) {
  const [broken, setBroken] = useState(false);
  if (kind === 'private') return <span className={styles.avatar} data-kind="private" style={{ width: size, height: size }}><Icon name="lock" size={Math.round(size * 0.45)} /></span>;
  const initials = name.split(/\s+/).filter(Boolean).slice(-2).map(word => Array.from(word)[0] ?? '').join('').toUpperCase();
  // eslint-disable-next-line @next/next/no-img-element -- Google's avatar, a few pixels, shown as Google serves it
  if (src && !broken) return <img className={styles.avatar} src={src} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} style={{ width: size, height: size }} />;
  return <span className={styles.avatar} style={{ width: size, height: size, fontSize: size * 0.36 }}>{initials || '?'}</span>;
}

/** One choice of a few (the tool's Segmented). */
export function Segmented<T extends string>({ value, onChange, options, label, size = 'md' }:
  { value: T; onChange: (value: T) => void; options: { value: T; label: ReactNode }[]; label: string; size?: 'sm' | 'md' }) {
  return <div className={styles.segmented} data-size={size} role="radiogroup" aria-label={label}>
    {options.map(option => <button key={option.value} type="button" role="radio" aria-checked={value === option.value} onClick={() => onChange(option.value)}>{option.label}</button>)}
  </div>;
}

export function Empty({ icon, title, children }: { icon?: ReactNode; title: ReactNode; children?: ReactNode }) {
  return <div className={styles.empty}>{icon && <div className={styles.emptyIcon}>{icon}</div>}<p>{title}</p>{children && <div>{children}</div>}</div>;
}

/** The detail panel sliding in from the right (the tool's Drawer), drawn at the root of the app's frame so it keeps the theme. */
export function Drawer({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode }) {
  const close = useRef<HTMLButtonElement>(null), titleId = useId();
  useEffect(() => {
    if (!open) return;
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key); close.current?.focus();
    return () => window.removeEventListener('keydown', key);
  }, [open, onClose]);
  if (!open || typeof document === 'undefined') return null;
  const root = document.querySelector<HTMLElement>('.qs') ?? document.body;
  return createPortal(<div className={styles.drawerLayer}>
    <div className={styles.drawerShade} onClick={onClose} />
    <aside className={styles.drawer} role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <header><h2 id={titleId}>{title}</h2><button ref={close} type="button" className={styles.iconButton} onClick={onClose} aria-label="Đóng"><Icon name="close" size={18} /></button></header>
      <div className={styles.drawerBody}>{children}</div>
      {/* Not a <footer>: app/globals.css still styles that element for the old guest page (tiny, spaced letters). */}
      {footer && <div className={styles.drawerFoot}>{footer}</div>}
    </aside>
  </div>, root);
}

function Legend({ items }: { items: { label: string; color: string }[] }) {
  return <div className={styles.legend}>{items.map(item => <span key={item.label}><i style={{ background: item.color }} />{item.label}</span>)}</div>;
}
const GOOD = 'var(--qs-series-good)', BAD = 'var(--qs-series-bad)';
const goodLabel = `${LOW + 1}–5★`, badLabel = `1–${LOW}★`;

export type MonthPoint = { month: string; good: number; bad: number; avg: number | null };
/** "Đánh giá theo tháng": stacked bars (1–3★ below, 4–5★ above) or the same as a table. */
export function MonthlyChart({ data }: { data: MonthPoint[] }) {
  const [view, setView] = useState<'chart' | 'table'>('chart');
  return <div className={styles.monthly}>
    <div className={styles.chartHead}>
      <Legend items={[{ label: goodLabel, color: GOOD }, { label: badLabel, color: BAD }]} />
      <Segmented size="sm" label="Cách xem" value={view} onChange={setView} options={[{ value: 'chart', label: 'Biểu đồ' }, { value: 'table', label: 'Bảng' }]} />
    </div>
    {view === 'chart' ? <Bars data={data} /> : <div className={styles.tableBox}><table className={styles.table}>
      <thead><tr><th>Tháng</th><th>{goodLabel}</th><th>{badLabel}</th><th>Điểm TB</th></tr></thead>
      <tbody>{[...data].reverse().map(d => <tr key={d.month}><td>{monthLabel(d.month)}</td><td>{d.good}</td><td>{d.bad}</td><td>{number(d.avg, 2)}</td></tr>)}</tbody>
    </table></div>}
  </div>;
}

/** A step that keeps 3–5 whole-number lines on the axis. */
function stepOf(max: number) {
  const raw = max / 4, power = 10 ** Math.floor(Math.log10(Math.max(raw, 1)));
  return Math.max(1, [1, 2, 5, 10].map(k => k * power).find(step => step >= raw) ?? power * 10);
}
const H = 240, LEFT = 30, RIGHT = 4, TOP = 10, BOTTOM = 26;
/** A bar with its top corners rounded (the upper one of a stack). */
const topRounded = (x: number, y: number, w: number, h: number, r: number) => {
  const k = Math.min(r, h, w / 2);
  return `M${x},${y + h}V${y + k}Q${x},${y} ${x + k},${y}H${x + w - k}Q${x + w},${y} ${x + w},${y + k}V${y + h}Z`;
};
function Bars({ data }: { data: MonthPoint[] }) {
  const box = useRef<HTMLDivElement>(null), [width, setWidth] = useState(0), [grown, setGrown] = useState(false);
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);
  useEffect(() => {
    const el = box.current; if (!el) return;
    const watch = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width)); watch.observe(el);
    const frame = requestAnimationFrame(() => setGrown(true));
    return () => { watch.disconnect(); cancelAnimationFrame(frame); };
  }, []);
  const max = Math.max(1, ...data.map(d => d.good + d.bad)), step = stepOf(max), top = Math.ceil(max / step) * step;
  const ticks = Array.from({ length: top / step + 1 }, (_, i) => i * step);
  const plot = Math.max(0, width - LEFT - RIGHT), band = plot / data.length, bar = Math.min(24, band * 0.75);
  const y = (value: number) => TOP + (H - TOP - BOTTOM) * (1 - value / top);
  // Every month when there is room, else every other one counted back from the last, so the newest always has its label.
  const every = band >= 38 ? 1 : band >= 19 ? 2 : 3, last = data.length - 1;
  const point = (event: React.PointerEvent<SVGRectElement>) => {
    const rect = (event.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect(), x = event.clientX - rect.left;
    setHover({ i: Math.min(data.length - 1, Math.max(0, Math.floor((x - LEFT) / band))), x, y: event.clientY - rect.top });
  };
  const shown = hover ? data[hover.i] : null;
  return <div ref={box} className={styles.bars}>
    {width > 0 && <svg width={width} height={H} role="img" aria-label="Đánh giá theo tháng">
      {ticks.map(t => <g key={t}><line x1={LEFT} x2={width - RIGHT} y1={y(t)} y2={y(t)} className={styles.grid} />
        <text x={LEFT - 8} y={y(t) + 4} textAnchor="end" className={styles.axis}>{t}</text></g>)}
      {hover && <rect x={LEFT + hover.i * band} y={TOP} width={band} height={H - TOP - BOTTOM} className={styles.cursor} />}
      {data.map((d, i) => {
        const x = LEFT + i * band + (band - bar) / 2, base = y(0), mid = y(d.bad), high = y(d.bad + d.good);
        // Grows from the axis on first view, one month after another.
        return <g key={d.month} className={styles.column} data-grown={grown} style={{ transitionDelay: `${i * 28}ms`, transformOrigin: `0 ${base}px` }}>
          {d.bad > 0 && (d.good > 0 ? <rect x={x} y={mid} width={bar} height={base - mid} fill={BAD} className={styles.cut} />
            : <path d={topRounded(x, mid, bar, base - mid, 4)} fill={BAD} className={styles.cut} />)}
          {d.good > 0 && <path d={topRounded(x, high, bar, mid - high, 4)} fill={GOOD} className={styles.cut} />}
        </g>;
      })}
      {data.map((d, i) => (last - i) % every === 0 && <text key={d.month} x={LEFT + i * band + band / 2} y={H - 6} textAnchor="middle" className={styles.axis}>{monthLabel(d.month)}</text>)}
      <rect x={LEFT} y={TOP} width={plot} height={H - TOP - BOTTOM} fill="transparent" onPointerMove={point} onPointerDown={point} onPointerLeave={() => setHover(null)} />
    </svg>}
    {shown && hover && <div className={styles.tip} style={{ left: Math.min(Math.max(hover.x + 14, 0), Math.max(0, width - 170)), top: Math.max(0, hover.y - 30) }}>
      <div className={styles.tipTitle}>Tháng {monthLabel(shown.month).slice(1)}</div>
      <div><i style={{ background: GOOD }} /><b>{shown.good}</b> {goodLabel}</div>
      <div><i style={{ background: BAD }} /><b>{shown.bad}</b> {badLabel}</div>
      {shown.avg !== null && <div><i /><b>{number(shown.avg, 2)}</b> điểm TB</div>}
    </div>}
  </div>;
}

/** "Phân bố số sao": one bar per star, low ones red. `counts` is 1★…5★. */
export function StarBars({ counts }: { counts: number[] }) {
  const [grown, setGrown] = useState(false);
  useEffect(() => { const frame = requestAnimationFrame(() => setGrown(true)); return () => cancelAnimationFrame(frame); }, []);
  const total = counts.reduce((a, b) => a + b, 0) || 1, max = Math.max(1, ...counts);
  return <div className={styles.starBars}>
    {[5, 4, 3, 2, 1].map(star => {
      const n = counts[star - 1] ?? 0, share = Math.round(n / total * 100);
      return <div key={star} className={styles.starRow} title={`${star} sao: ${n} đánh giá (${share}%)`}>
        <span>{star}★</span>
        <div className={styles.track}><i style={{ width: grown ? `${Math.max(n / max * 100, n ? 1.5 : 0)}%` : 0, background: star <= LOW ? BAD : GOOD }} /></div>
        <span className={styles.count}>{number(n)}<small>({share}%)</small></span>
      </div>;
    })}
    <Legend items={[{ label: goodLabel, color: GOOD }, { label: badLabel, color: BAD }]} />
  </div>;
}

/** Pages of the list (the tool's Pagination). */
export function Pagination({ page, size, total, onChange }: { page: number; size: number; total: number; onChange: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / size));
  if (total <= size) return null;
  return <div className={styles.pagination}>
    <span>{(page - 1) * size + 1}–{Math.min(total, page * size)} / {total}</span>
    <div>
      <button type="button" className={styles.iconButton} disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Trang trước"><span className={styles.flip}><Icon name="arrow" size={16} /></span></button>
      <span>Trang {page}/{pages}</span>
      <button type="button" className={styles.iconButton} disabled={page >= pages} onClick={() => onChange(page + 1)} aria-label="Trang sau"><Icon name="arrow" size={16} /></button>
    </div>
  </div>;
}
