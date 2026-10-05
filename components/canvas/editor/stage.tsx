'use client';
/**
 * Sân khấu của trình sửa: chính trang khách (components/canvas/render.tsx, chế độ `still`) vẽ ở giữa, và một lớp phủ để chọn,
 * kéo, đổi cỡ. Vị trí trên lớp phủ lấy từ phép tính của máy chủ (lib/canvas/layout.ts `placeAll`), cùng phép tính cửa phát hành
 * dùng để kiểm luật Google — nên cái chủ quán thấy khi sửa và cái được kiểm là một.
 *
 * Chạm trên điện thoại: chạm lần đầu chỉ chọn (kéo chỗ trống hay phần tử chưa chọn vẫn cuộn trang); phần tử đã chọn thì kéo
 * được. Chuột: bấm là chọn và kéo luôn.
 */
import { useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { ARTBOARD, FIRST_SCREEN, MAX_SECTION_H, type El, type PageDoc } from '@/lib/canvas/doc';
import { placeAll, type Placed } from '@/lib/canvas/layout';
import { keepGoogleInPlace, locate, patch, patchSection, type AnyEl } from '@/lib/canvas/edit';
import CanvasPage from '../render';
import { KIND, nameOf } from './panels';
import styles from './editor.module.css';

type Drag =
  | { kind: 'move'; id: string; x0: number; y0: number; ox: number; oy: number; moved: boolean }
  | { kind: 'size'; id: string; dir: 'se' | 'e' | 's'; x0: number; y0: number; ow: number; oh: number; size?: number }
  | { kind: 'section'; index: number; y0: number; oh: number };

const kidsOf = (el: El) => el.t === 'stack' ? el.kids : el.t === 'deck' ? el.front.kids : [];
const holdsGoogle = (el: El) => el.t === 'google' || kidsOf(el).some(k => k.t === 'google' || (k.t === 'row' && k.kids.some(c => c.t === 'google')));
/** Aspect kept on a corner resize: pictures and drawings. */
const keepsAspect = (el: El) => el.t === 'image' || el.t === 'icon' || (el.t === 'shape' && el.shape !== 'rect' && el.shape !== 'line') || (el.t === 'google' && el.look === 'ring');

export default function Stage({ doc, zoom, selected, section, onSelect, onSection, onChange, slug, googleUrl, onAddSection }: {
  doc: PageDoc; zoom: number; selected: string | null; section: number;
  onSelect: (id: string | null) => void; onSection: (index: number) => void;
  onChange: (doc: PageDoc, key: string) => void; slug: string; googleUrl: string | null; onAddSection: () => void;
}) {
  const overlay = useRef<HTMLDivElement>(null), drag = useRef<Drag | null>(null), frame = useRef(0), pending = useRef<PageDoc | null>(null);
  const [guide, setGuide] = useState<number | null>(null);
  // The page as last drawn, for the pointer handlers between two renders.
  const docRef = useRef(doc);
  useLayoutEffect(() => { docRef.current = doc; }, [doc]);
  const placed = useMemo(() => placeAll(doc), [doc]);
  const byId = useMemo(() => new Map(placed.map(p => [p.id, p])), [placed]);
  const tops = useMemo(() => doc.sections.map((_, i) => doc.sections.slice(0, i).reduce((sum, s) => sum + s.h, 0)), [doc.sections]);
  const total = doc.sections.reduce((sum, s) => sum + s.h, 0);
  const px = (n: number) => n * zoom;

  // Hit boxes, lowest layer first so the DOM stacks them like the page does: in each section its elements in order, the one
  // holding the Google button last (it is always on top, canvas.css `.cv-top`), each container's children above it.
  const hits = useMemo(() => {
    const out: { place: Placed; top: El; kid: boolean; label: string }[] = [];
    doc.sections.forEach(s => {
      const order = [...s.els.filter(el => !holdsGoogle(el)), ...s.els.filter(holdsGoogle)];
      for (const el of order) {
        // The paper plane floats over the guest's screen, not in a section: it is chosen in the Khúc list, never on the stage.
        if (el.hide || el.t === 'feedback') continue;
        const own = byId.get(el.id); if (!own) continue;
        out.push({ place: own, top: el, kid: false, label: nameOf(el) });
        for (const kid of kidsOf(el)) {
          const p = byId.get(kid.id); if (!p) continue;
          out.push({ place: p, top: el, kid: true, label: nameOf(kid) });
          if (kid.t === 'row') for (const c of kid.kids) { const q = byId.get(c.id); if (q) out.push({ place: q, top: el, kid: true, label: nameOf(c) }); }
        }
      }
    });
    return out;
  }, [doc.sections, byId]);

  /** Applies a change on the next frame: a finger moves faster than a page redraws. */
  const schedule = (next: PageDoc, key: string) => {
    pending.current = next;
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => { frame.current = 0; if (pending.current) { onChange(pending.current, key); pending.current = null; } });
  };

  const start = (event: ReactPointerEvent, next: Drag) => {
    drag.current = next;
    overlay.current?.setPointerCapture(event.pointerId);
  };
  const downOnHit = (event: ReactPointerEvent, hit: { place: Placed; top: El }) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    const id = hit.place.id, was = selected;
    onSelect(id); onSection(hit.place.section);
    // A finger's first touch only selects; the page keeps scrolling under it until the element is chosen.
    if (event.pointerType !== 'mouse' && was !== id) return;
    if (hit.top.lock || !('x' in hit.top)) return;
    start(event, { kind: 'move', id: hit.top.id, x0: event.clientX, y0: event.clientY, ox: hit.top.x, oy: hit.top.y, moved: false });
  };
  const downOnHandle = (event: ReactPointerEvent, dir: 'se' | 'e' | 's', el: El) => {
    event.stopPropagation();
    if (!('w' in el)) return;
    start(event, { kind: 'size', id: el.id, dir, x0: event.clientX, y0: event.clientY, ow: el.w, oh: el.h, size: el.t === 'text' ? el.size : undefined });
  };
  const downOnSection = (event: ReactPointerEvent, index: number) => {
    event.stopPropagation();
    onSection(index);
    start(event, { kind: 'section', index, y0: event.clientY, oh: doc.sections[index].h });
  };
  const move = (event: ReactPointerEvent) => {
    const d = drag.current; if (!d) return;
    const current = docRef.current;
    if (d.kind === 'section') {
      const h = Math.round(Math.min(MAX_SECTION_H, Math.max(120, d.oh + (event.clientY - d.y0) / zoom)));
      schedule(patchSection(current, d.index, s => ({ ...s, h })), `section:${current.sections[d.index].id}:h`);
      return;
    }
    const dx = (event.clientX - d.x0) / zoom, dy = (event.clientY - d.y0) / zoom;
    if (d.kind === 'move') {
      if (!d.moved && Math.hypot(dx, dy) < 3 / zoom) return;
      d.moved = true;
      const found = locate(current, d.id); if (!found || !('x' in found.top)) return;
      let x = Math.round(d.ox + dx);
      const y = Math.round(d.oy + dy);
      // The page's middle pulls a little: centring something by eye is the most common wish.
      const centre = x + found.top.w / 2;
      const snap = Math.abs(centre - ARTBOARD / 2) < 4;
      if (snap) x = Math.round(ARTBOARD / 2 - found.top.w / 2);
      setGuide(snap ? ARTBOARD / 2 : null);
      schedule(keepGoogleInPlace(patch(current, d.id, el => ({ ...el, x, y }) as AnyEl), d.id), `move:${d.id}`);
      return;
    }
    const found = locate(current, d.id); if (!found) return;
    const el = found.top, auto = el.t === 'stack' || el.t === 'deck';
    let w = d.ow, h = d.oh;
    if (d.dir !== 's') w = Math.max(8, Math.round(d.ow + dx));
    if (d.dir !== 'e' && !auto) h = Math.max(8, Math.round(d.oh + dy));
    if (d.dir === 'se' && keepsAspect(el)) h = Math.max(8, Math.round(d.oh * w / d.ow));
    // Text grows with its corner: the words keep their place in the box (Canva does the same).
    const size = d.dir === 'se' && d.size ? Math.min(240, Math.max(4, Math.round(d.size * w / d.ow * 10) / 10)) : undefined;
    if (d.dir === 'se' && d.size) h = Math.max(8, Math.round(d.oh * w / d.ow));
    schedule(keepGoogleInPlace(patch(current, d.id, item => ({ ...item, w, h, ...(size ? { size } : {}) }) as AnyEl), d.id), `size:${d.id}`);
  };
  const end = (event: ReactPointerEvent) => {
    if (!drag.current) return;
    drag.current = null; setGuide(null);
    overlay.current?.releasePointerCapture?.(event.pointerId);
  };

  const sel = selected ? byId.get(selected) : undefined;
  const found = selected ? locate(doc, selected) : null;
  const parent = found?.kid ? byId.get(found.top.id) : undefined;
  const top = found && !found.kid ? found.top : null;
  const box = (p: Placed) => ({ left: px(p.rect.x), top: px(tops[p.section] + p.rect.y), width: px(p.rect.w), height: px(p.rect.h) });

  return <div className={styles.frame} style={{ width: px(ARTBOARD) }}>
    <div className={styles.page} aria-hidden="true"><CanvasPage doc={doc} mode="still" slug={slug} googleUrl={googleUrl} edit /></div>
    <div ref={overlay} className={styles.overlay} style={{ height: px(total) }}
      onPointerDown={event => {
        if (event.target !== overlay.current) return;
        onSelect(null);
        const y = (event.clientY - overlay.current.getBoundingClientRect().top) / zoom;
        let index = 0; tops.forEach((t, i) => { if (t <= y) index = i; }); onSection(index);
      }}
      onPointerMove={move} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={() => { drag.current = null; setGuide(null); }}>
      {doc.sections.map((s, i) => <div key={s.id} className={styles.band} data-active={i === section || undefined} style={{ top: px(tops[i]), height: px(s.h), pointerEvents: 'none' }}>
        <button type="button" className={styles.secLabel} onClick={() => { onSection(i); onSelect(null); }}>{s.name ?? `Khúc ${i + 1}`}</button>
        {i === 0 && <div className={styles.fold} style={{ top: px(FIRST_SCREEN) }}><span>Màn hình đầu</span></div>}
      </div>)}
      {hits.map(({ place, top: holder, kid, label }) => <div key={place.id} className={styles.hit} data-id={place.id} title={label}
        data-selected={selected === place.id || (selected === holder.id && !kid) || undefined} data-locked={holder.lock || undefined}
        style={box(place)} onPointerDown={event => downOnHit(event, { place, top: holder })} />)}
      {doc.sections.map((s, i) => <div key={`h-${s.id}`} className={styles.secHandle} style={{ top: px(tops[i] + s.h) - 9, bottom: 'auto' }}
        role="slider" aria-label={`Chiều cao ${s.name ?? `khúc ${i + 1}`}`} aria-valuenow={s.h} aria-valuemin={120} aria-valuemax={MAX_SECTION_H}
        onPointerDown={event => downOnSection(event, i)} />)}
      {parent && <div className={styles.parent} style={box(parent)} />}
      {sel && <>
        <div className={styles.sel} data-kid={found?.kid ? '' : undefined} style={box(sel)} />
        <span className={styles.tag} style={{ left: box(sel).left, top: box(sel).top }}>{found ? KIND[(found.rowKid ?? found.kid ?? found.top).t] : ''}</span>
      </>}
      {sel && top && !top.lock && 'w' in top && <>
        <span className={styles.handle} data-dir="e" style={{ left: box(sel).left + box(sel).width, top: box(sel).top + box(sel).height / 2 }} onPointerDown={e => downOnHandle(e, 'e', top)} />
        {top.t !== 'stack' && top.t !== 'deck' && <>
          <span className={styles.handle} data-dir="s" style={{ left: box(sel).left + box(sel).width / 2, top: box(sel).top + box(sel).height }} onPointerDown={e => downOnHandle(e, 's', top)} />
          <span className={styles.handle} data-dir="se" style={{ left: box(sel).left + box(sel).width, top: box(sel).top + box(sel).height }} onPointerDown={e => downOnHandle(e, 'se', top)} />
        </>}
      </>}
      {guide !== null && <div className={styles.guide} style={{ left: px(guide) }} />}
      <button type="button" className={styles.addSection} style={{ top: px(total) }} onClick={onAddSection}>+ Thêm khúc</button>
    </div>
  </div>;
}
