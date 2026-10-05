'use client';
/**
 * Ô nhập của trình sửa trang. Mỗi ô chỉ đưa vào tài liệu một giá trị hợp lệ (lib/canvas/validate.ts): đang gõ dở thì giữ ở ô,
 * hợp lệ mới áp, nên trang lúc nào cũng lưu được.
 */
import { useState, type ReactNode } from 'react';
import type { Fill, Words } from '@/lib/canvas/doc';
import { COLOR, linkProblem } from '@/lib/canvas/validate';
import styles from './editor.module.css';

/** Characters a page's words may not carry (validate.ts `text`): control characters and < >. */
const clean = (value: string) => value.replace(/[\u0000-\u0008\u000b-\u001f\u007f<>]/g, '');

export function Field({ label, hint, error, children }: { label: string; hint?: ReactNode; error?: string | null; children: ReactNode }) {
  return <div className={styles.field} role="group" aria-label={label}>
    <span>{label}</span>{children}
    {error ? <small data-error>{error}</small> : hint ? <small>{hint}</small> : null}
  </div>;
}

/** Vietnamese always, English when the shop writes it (kịch bản luật 0.3: missing English shows the Vietnamese). */
export function WordsField({ label, value, onChange, max = 600, lines = 2 }: { label: string; value: Words; onChange: (words: Words) => void; max?: number; lines?: number }) {
  const [vi, setVi] = useState(value.vi), [en, setEn] = useState(value.en ?? '');
  const push = (nextVi: string, nextEn: string) => { if (nextVi.trim()) onChange(nextEn.trim() ? { vi: nextVi, en: nextEn } : { vi: nextVi }); };
  return <Field label={label} error={vi.trim() ? null : 'Cần ít nhất một chữ.'}>
    {lines > 1
      ? <textarea rows={lines} maxLength={max} value={vi} onChange={e => { const v = clean(e.target.value); setVi(v); push(v, en); }} />
      : <input className={styles.input} maxLength={max} value={vi} onChange={e => { const v = clean(e.target.value); setVi(v); push(v, en); }} />}
    <input className={styles.input} maxLength={max} value={en} placeholder="Tiếng Anh (không bắt buộc)" aria-label={`${label} — tiếng Anh`}
      onChange={e => { const v = clean(e.target.value); setEn(v); push(vi, v); }} />
  </Field>;
}

export function TextField({ label, value, onChange, max = 100, placeholder, required = true }: { label: string; value: string; onChange: (value: string) => void; max?: number;
  placeholder?: string; required?: boolean }) {
  const [text, setText] = useState(value);
  return <Field label={label} error={required && !text.trim() ? 'Không để trống.' : null}>
    <input className={styles.input} value={text} maxLength={max} placeholder={placeholder}
      onChange={e => { const v = clean(e.target.value); setText(v); if (!required || v.trim()) onChange(v); }} />
  </Field>;
}

const SWATCHES = ['#111111', '#ffffff', '#f5efe6', '#1f5bff', '#e5484d', '#30a46c', '#f5a524', '#7a5af8', '#ff6fa3', '#6b4f3a'];
const hex6 = (color: string) => {
  if (/^#[0-9a-f]{3}$/i.test(color)) return `#${[...color.slice(1)].map(c => c + c).join('')}`.toLowerCase();
  return color.slice(0, 7).toLowerCase();
};
export function ColorField({ label, value, onChange, swatches = true }: { label: string; value: string; onChange: (color: string) => void; swatches?: boolean }) {
  const [text, setText] = useState(value);
  const apply = (next: string) => { setText(next); if (COLOR.test(next)) onChange(next); };
  return <Field label={label} error={COLOR.test(text) ? null : 'Màu viết dạng #rrggbb.'}>
    <div className={styles.color}>
      <input type="color" value={hex6(COLOR.test(text) ? text : value)} onChange={e => apply(e.target.value)} aria-label={label} />
      <input className={styles.input} value={text} maxLength={9} onChange={e => apply(e.target.value.trim())} aria-label={`${label} — mã màu`} />
    </div>
    {swatches && <div className={styles.swatches}>{SWATCHES.map(c => <button key={c} type="button" style={{ background: c }} aria-label={c} onClick={() => apply(c)} />)}</div>}
  </Field>;
}

/** A colour, or a gradient kept as it is until a colour is chosen over it. */
export function FillField({ label, value, onChange }: { label: string; value: Fill | undefined; onChange: (fill: Fill) => void }) {
  if (value && typeof value !== 'string') {
    const stops = value.stops.map(([c, at]) => `${c} ${at}%`).join(', ');
    return <Field label={label} hint="Đang là màu chuyển. Chọn một màu dưới đây để thay.">
      <div style={{ height: 34, borderRadius: 10, border: '1px solid var(--qs-line)', background: `linear-gradient(90deg, ${stops})` }} />
      <div className={styles.swatches}>{SWATCHES.map(c => <button key={c} type="button" style={{ background: c }} aria-label={c} onClick={() => onChange(c)} />)}</div>
    </Field>;
  }
  return <ColorField label={label} value={value ?? '#ffffff'} onChange={onChange} />;
}

/**
 * A link: https only, or a phone number (tel:). Helps the way people type: "facebook.com/quan" becomes https://facebook.com/quan,
 * "0901 234 567" becomes tel:0901234567.
 */
export function normalizeLink(raw: string) {
  const value = raw.trim();
  if (/^\+?[0-9][0-9 .-]{6,}$/.test(value)) return `tel:${value.replace(/[ .-]/g, '')}`;
  if (value && !/^[a-z][a-z0-9+.-]*:/i.test(value) && /\./.test(value)) return `https://${value}`;
  return value;
}
export function LinkField({ label = 'Link', value, onChange, hint }: { label?: string; value: string; onChange: (link: string) => void; hint?: ReactNode }) {
  const [text, setText] = useState(value);
  const next = normalizeLink(text), bad = linkProblem(next);
  return <Field label={label} hint={hint} error={bad ? 'Dán link bắt đầu bằng https:// (hoặc một số điện thoại).' : null}>
    <input className={styles.input} value={text} inputMode="url" autoCapitalize="off" autoCorrect="off" spellCheck={false} placeholder="https://…"
      onChange={e => { setText(e.target.value); const n = normalizeLink(e.target.value); if (!linkProblem(n)) onChange(n); }}
      onBlur={() => { if (!bad) setText(next); }} />
  </Field>;
}

export function NumberField({ label, value, onChange, min, max, step = 1 }: { label: string; value: number; onChange: (value: number) => void; min: number; max: number; step?: number }) {
  const [text, setText] = useState(String(value));
  const n = Number(text), ok = text.trim() !== '' && Number.isFinite(n) && n >= min && n <= max;
  return <Field label={label} error={ok ? null : `Từ ${min} đến ${max}.`}>
    <input className={styles.input} type="number" inputMode="decimal" min={min} max={max} step={step} value={text}
      onChange={e => { setText(e.target.value); const v = Number(e.target.value); if (e.target.value.trim() !== '' && Number.isFinite(v) && v >= min && v <= max) onChange(v); }} />
  </Field>;
}

export function SelectField<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: readonly (readonly [T, string])[]; onChange: (value: T) => void }) {
  return <Field label={label}>
    <select value={value} onChange={e => onChange(e.target.value as T)}>{options.map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select>
  </Field>;
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: readonly (readonly [T, string])[]; onChange: (value: T) => void; label: string }) {
  return <div className={styles.seg} role="group" aria-label={label}>{options.map(([key, name]) =>
    <button key={key} type="button" aria-pressed={value === key} onClick={() => onChange(key)}>{name}</button>)}</div>;
}

export function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className={styles.toggle}><span>{label}</span><input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} /></label>;
}
