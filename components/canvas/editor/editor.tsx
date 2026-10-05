'use client';
/**
 * Trình sửa trang canvas (đợt ②, kịch bản mục 9): sửa ngay trên trang thật, kiểu Canva. Mọi thay đổi vào lịch sử (hoàn tác,
 * làm lại) và tự lưu bản nháp sau một nhịp; trang khách chỉ đổi khi bấm Phát hành. Trước khi gửi, trình sửa tự kiểm những
 * gì máy chủ sẽ kiểm (tài liệu hợp lệ, luật Google, chữ đổi quà) để chỉ đúng phần tử cần sửa thay vì báo lỗi chung.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ARTBOARD, FIRST_SCREEN, type El, type Kid, type PageDoc } from '@/lib/canvas/doc';
import { CanvasError, validateDoc, walk } from '@/lib/canvas/validate';
import { googleProblems, placeAll } from '@/lib/canvas/layout';
import { freeTextProblem } from '@/lib/publishing/policy';
import { addSection, duplicate, freshId, insert, insertKid, locate, moveSection, patch, patchSection, remove, removeSection, reorder, type AnyEl } from '@/lib/canvas/edit';
import type { PageConfig } from '@/lib/publishing/config';
import type { FirstPublish, MediaState } from '@/lib/owner/design';
import SupportBanner, { type SupportSession } from '@/components/qs/support-banner';
import Icon from '@/components/qs/icons';
import Stage from './stage';
import { AddPanel, ElementPanel, PagePanel, SectionPanel, nameOf, type AddKind } from './panels';
import { UploadContext } from './upload';
import styles from './editor.module.css';

type Props = { shop: string; page: { slug: string; label: string | null; state: string }; revision: number; config: PageConfig; live: boolean;
  googleUrl: string | null; uploads: boolean; onboarding: boolean; origin: string;
  /** Where each uploaded picture of the draft stands in the image review (lib/owner/design.ts). */
  media: Record<string, MediaState>;
  /** A shop that signed itself up sends its first publish to Tài instead (kịch bản mục 4); null once it publishes on its own. */
  firstPublish: FirstPublish;
  /** An administrator's design session (lát D2): its strip sits above the editor. */
  support: SupportSession | null };
type Snapshot = { doc: PageDoc; name: string };
type Save = { kind: 'saved' } | { kind: 'dirty' } | { kind: 'saving' } | { kind: 'blocked'; message: string; id?: string } | { kind: 'error'; message: string; id?: undefined };
type Sheet = 'add' | 'section' | 'page' | 'props' | null;

/** What the server's refusals mean to the shop, and what to do about them. */
const REASONS: Record<string, string> = {
  INVALID_CONFIG: 'Trang có chỗ chưa hợp lệ — thường là một link chưa đúng (cần https://).',
  DRAFT_CONFLICT: 'Trang vừa được sửa ở nơi khác. Tải lại để lấy bản mới nhất rồi sửa tiếp.',
  PAGE_CLOSED: 'Trang này đã đóng, không sửa được nữa.',
  SHOP_SUSPENDED: 'Quán đang tạm khoá nên chưa phát hành được.',
  POLICY_GOOGLE_EXCHANGE: 'Có chữ giống đổi quà lấy đánh giá, hoặc nêu tên nhân viên. Google cấm điều này — sửa chữ đó nhé.',
  POLICY_GOOGLE_LINK: 'Link viết đánh giá Google chỉ dùng ở nút Google của nền tảng.',
  POLICY_GOOGLE_TWICE: 'Trang chỉ có một nút Google.',
  POLICY_GOOGLE_NOT_FIRST_SCREEN: 'Nút Google phải nằm trọn trên vạch cam “Màn hình đầu” của khúc đầu tiên.',
  MEDIA_PENDING: 'Có ảnh đang chờ duyệt. Phát hành được ngay khi ảnh được duyệt.',
  MEDIA_REJECTED: 'Có ảnh bị từ chối. Thay ảnh khác rồi phát hành lại.',
  MEDIA_UNKNOWN: 'Có ảnh chưa qua duyệt. Tải ảnh lên lại.',
  PERMISSION_REQUIRED: 'Tài khoản này chưa được quyền sửa trang.',
  OWNER_ROLE_REQUIRED: 'Chỉ chủ quán làm được việc này.',
  BODY_TOO_LARGE: 'Trang quá lớn để lưu. Bớt vài phần tử nhé.',
  SESSION_EXPIRED: 'Phiên đăng nhập đã hết. Đăng nhập lại để lưu.',
  UNAUTHENTICATED: 'Phiên đăng nhập đã hết. Đăng nhập lại để lưu.',
};
const reason = (code: unknown) => (typeof code === 'string' && REASONS[code]) || 'Chưa lưu được. Kiểm tra kết nối rồi thử lại.';

/** The element a validation path points at ("doc.sections.0.els.3.kids.1.link"), so the editor can select it. */
function elementAt(doc: PageDoc, at: string): string | undefined {
  const m = /^doc\.sections\.(\d+)\.els\.(\d+)(?:\.(?:front\.)?kids\.(\d+))?(?:\.kids\.(\d+))?/.exec(at);
  if (!m) return undefined;
  const top = doc.sections[Number(m[1])]?.els[Number(m[2])];
  if (!top || m[3] === undefined) return top?.id;
  const kids: Kid[] = top.t === 'stack' ? top.kids : top.t === 'deck' ? top.front.kids : [];
  const kid = kids[Number(m[3])];
  return m[4] !== undefined && kid?.t === 'row' ? kid.kids[Number(m[4])]?.id ?? kid.id : kid?.id ?? top.id;
}
/** What the server would refuse, found here first, with the element to look at. */
function localProblem(doc: PageDoc, name: string): { message: string; id?: string } | null {
  if (!name.trim()) return { message: 'Trang cần một cái tên (mục Trang).' };
  try { validateDoc(doc); } catch (error) {
    if (error instanceof CanvasError) return { message: /link/.test(error.at) ? 'Có link chưa đúng — cần bắt đầu bằng https:// hoặc là số điện thoại.' : 'Có ô chưa hợp lệ.', id: elementAt(doc, error.at) };
    throw error;
  }
  const google = googleProblems(doc);
  if (google) return { message: REASONS[`POLICY_${google}`], id: [...walk(doc)].find(el => el.t === 'google')?.id };
  for (const el of walk(doc)) {
    const words = el.t === 'text' ? [el.words] : el.t === 'button' ? [el.label, el.tag] : el.t === 'image' ? [el.caption] : [];
    for (const w of words) if (w && (freeTextProblem(w.vi) || (w.en && freeTextProblem(w.en)))) return { message: REASONS.POLICY_GOOGLE_EXCHANGE, id: el.id };
  }
  for (const s of doc.sections) for (const el of s.els) if (el.t === 'deck') for (const card of el.cards)
    if (freeTextProblem(card.label.vi) || (card.label.en && freeTextProblem(card.label.en))) return { message: REASONS.POLICY_GOOGLE_EXCHANGE, id: el.id };
  if (freeTextProblem(name)) return { message: REASONS.POLICY_GOOGLE_EXCHANGE };
  return null;
}

/** Light or dark under new words in a section: its colour, or dark under a picture. */
function inkFor(doc: PageDoc, section: number) {
  const bg = doc.sections[section]?.bg;
  if (bg?.src) return '#ffffff';
  const fill = bg?.fill, color = !fill ? '#ffffff' : typeof fill === 'string' ? fill : fill.stops[0][0];
  const hex = color.length === 4 ? color.replace(/^#(.)(.)(.)$/, '#$1$1$2$2$3$3') : color.slice(0, 7);
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  return .2126 * r + .7152 * g + .0722 * b > .55 ? '#111111' : '#ffffff';
}

export default function CanvasEditor({ shop, page, revision: initialRevision, config, live: initiallyLive, googleUrl, uploads, onboarding, origin, firstPublish, support, media }: Props) {
  const router = useRouter();
  // A picture uploaded here waits for review from the moment it is signed; the page learns other decisions when it reloads.
  const [states, setStates] = useState(media);
  const uploadContext = useMemo(() => ({ shop, enabled: uploads, states,
    added: (url: string) => setStates(current => ({ ...current, [url]: 'pending' as const })) }), [shop, uploads, states]);
  const [doc, setDoc] = useState(config.doc), [name, setName] = useState(config.name);
  const [selected, setSelected] = useState<string | null>(null), [section, setSection] = useState(0);
  const [save, setSave] = useState<Save>({ kind: 'saved' }), [sheet, setSheet] = useState<Sheet>(null), [tab, setTab] = useState<'add' | 'section' | 'page'>('add');
  const [stamp, setStamp] = useState(0), [busy, setBusy] = useState<'' | 'publish' | 'preview'>(''), [toast, setToast] = useState<{ text: string; link?: string } | null>(null);
  const [live, setLive] = useState(initiallyLive), [zoom, setZoom] = useState(1), [review, setReview] = useState(firstPublish);
  const docRef = useRef(doc), nameRef = useRef(name), revision = useRef(initialRevision), version = useRef(0), savedVersion = useRef(0);
  const history = useRef({ past: [] as Snapshot[], future: [] as Snapshot[], key: '', at: 0 });
  const inflight = useRef<Promise<boolean> | null>(null), stage = useRef<HTMLDivElement>(null);
  const [steps, setSteps] = useState({ undo: 0, redo: 0 });

  /** One change: into the history (typing in one field within a moment is one step), then onto the page, then saved soon. */
  const change = useCallback((next: PageDoc, key = '', nextName?: string) => {
    if (next === docRef.current && (nextName === undefined || nextName === nameRef.current)) return;
    const h = history.current, now = Date.now();
    if (!(key && key === h.key && now - h.at < 1500)) { h.past.push({ doc: docRef.current, name: nameRef.current }); if (h.past.length > 150) h.past.shift(); }
    h.future = []; h.key = key; h.at = now;
    docRef.current = next; if (nextName !== undefined) nameRef.current = nextName;
    version.current++; setDoc(next); setName(nameRef.current); setSave({ kind: 'dirty' }); setSteps({ undo: h.past.length, redo: 0 });
  }, []);
  const restore = (from: 'past' | 'future') => {
    const h = history.current, snap = h[from].pop(); if (!snap) return;
    h[from === 'past' ? 'future' : 'past'].push({ doc: docRef.current, name: nameRef.current }); h.key = '';
    docRef.current = snap.doc; nameRef.current = snap.name; version.current++;
    setDoc(snap.doc); setName(snap.name); setSave({ kind: 'dirty' }); setStamp(n => n + 1); setSteps({ undo: h.past.length, redo: h.future.length });
    setSelected(current => current && locate(snap.doc, current) ? current : null);
  };

  /** Saves the draft if anything changed since the last save. Answers whether the draft on the server is now this page. */
  const flush = useCallback(async (): Promise<boolean> => {
    while (inflight.current) await inflight.current;
    if (savedVersion.current === version.current) return true;
    const problem = localProblem(docRef.current, nameRef.current);
    if (problem) { setSave({ kind: 'blocked', ...problem }); return false; }
    const sending = version.current;
    setSave({ kind: 'saving' });
    inflight.current = (async () => {
      try {
        const response = await fetch(`/api/owner/v2/${shop}/design`, { method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ page: page.slug, expectedRevision: revision.current, config: { schemaVersion: 4, name: nameRef.current, doc: docRef.current } }) });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) { setSave({ kind: 'error', message: reason(body.error) }); return false; }
        revision.current = body.revision; savedVersion.current = sending;
        setSave(sending === version.current ? { kind: 'saved' } : { kind: 'dirty' });
        return true;
      } catch { setSave({ kind: 'error', message: 'Mất kết nối — chưa lưu được. Sẽ thử lại khi bạn sửa tiếp.' }); return false; }
      finally { inflight.current = null; }
    })();
    return inflight.current;
  }, [shop, page.slug]);

  // Saved a moment after the last change.
  useEffect(() => {
    if (save.kind !== 'dirty') return;
    const timer = window.setTimeout(() => { void flush(); }, 1200);
    return () => window.clearTimeout(timer);
  }, [doc, name, save.kind, flush]);
  // Leaving with unsaved changes asks first.
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (savedVersion.current !== version.current) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);
  // The page as wide as the middle allows: 390 units = the phone's width, never wider than the guest page's column (480px).
  useEffect(() => {
    const el = stage.current; if (!el) return;
    const fit = () => { const wide = window.innerWidth >= 900; setZoom(Math.max(.5, Math.min(1.2, (el.clientWidth - (wide ? 140 : 20)) / ARTBOARD))); };
    fit(); const watch = new ResizeObserver(fit); watch.observe(el);
    return () => watch.disconnect();
  }, []);

  const select = useCallback((id: string | null) => {
    setSelected(id); setStamp(n => n + 1);
    if (id) { const found = locate(docRef.current, id); if (found) setSection(found.section); }
  }, []);
  const found = selected ? locate(doc, selected) : null;

  /** The middle of what the stage shows of a section, in its units: where a new element lands. */
  const visibleMiddle = (index: number) => {
    const el = stage.current, s = doc.sections[index];
    if (!el || !s) return 200;
    let top = 0; for (let i = 0; i < index; i++) top += doc.sections[i].h;
    const frameTop = (el.firstElementChild as HTMLElement | null)?.offsetTop ?? 0;
    const y = (el.scrollTop + el.clientHeight / 2 - frameTop) / zoom - top;
    return Math.round(Math.max(60, Math.min(s.h - 60, y)));
  };
  const add = (kind: AddKind) => {
    if (kind === 'section') { const made = addSection(doc, section); if (made) { change(made.doc, 'section-add'); setSection(made.index); select(null); } return; }
    const index = kind === 'google' ? 0 : section, mid = visibleMiddle(index), ink = inkFor(doc, index);
    const base: Record<Exclude<AddKind, 'section'>, string> = { heading: 'tieu-de', text: 'chu', button: 'nut', image: 'anh', rect: 'khoi', circle: 'tron', icon: 'bieu-tuong',
      google: 'google', feedback: 'gop-y' };
    const id = freshId(doc, base[kind]);
    const el: El = kind === 'heading' ? { id, t: 'text', x: 35, y: mid - 30, w: 320, h: 60, words: { vi: 'Tiêu đề của bạn' }, font: 'display', size: 34, weight: 800, color: ink, align: 'center' }
      : kind === 'text' ? { id, t: 'text', x: 45, y: mid - 24, w: 300, h: 48, words: { vi: 'Viết vài dòng về quán của bạn' }, font: 'sans', size: 16, color: ink, align: 'center' }
      : kind === 'button' ? { id, t: 'button', look: 'pill', label: { vi: 'Nút mới' }, link: 'https://example.com', icon: 'link', x: 95, y: mid - 24, w: 200, h: 48,
        bg: ink === '#111111' ? '#111111' : '#ffffff', fg: ink === '#111111' ? '#ffffff' : '#111111' }
      : kind === 'image' ? { id, t: 'image', src: 'art:photo', x: 75, y: mid - 120, w: 240, h: 240, radius: 18 }
      : kind === 'rect' ? { id, t: 'shape', shape: 'rect', x: 95, y: mid - 60, w: 200, h: 120, fill: '#f2f2f4', radius: 18 }
      : kind === 'circle' ? { id, t: 'shape', shape: 'circle', x: 135, y: mid - 60, w: 120, h: 120, fill: '#ffd34d' }
      : kind === 'icon' ? { id, t: 'icon', icon: 'heart', x: 171, y: mid - 24, w: 48, h: 48, color: ink }
      : kind === 'google' ? { id, t: 'google', look: 'g', x: 45, y: Math.max(24, Math.min(FIRST_SCREEN - 72, mid - 28)), w: 300, h: 56, bg: '#ffffff', fg: '#1f1f1f' }
      // The original paper plane, as every page had it (components/guest/plane.css): blue, edged in white, at the lower left.
      : { id, t: 'feedback', icon: 'plane', color: '#229ED9', edge: '#FFFFFF', x: 14, y: 20, w: 60, h: 60 };
    // The block holding the Google button is drawn above everything in its section (luật 0.1), so a new element never lands
    // under it: below it when there is room, above it otherwise.
    if (kind !== 'google' && kind !== 'feedback') {
      const holders = new Set(doc.sections[index].els.filter(e => e.t === 'google' || ((e.t === 'stack' || e.t === 'deck') && [...walk({ ...doc, sections: [{ ...doc.sections[index], els: [e] }] })]
        .some(k => k.t === 'google'))).map(e => e.id));
      const blocked = placeAll(doc).filter(p => p.section === index && holders.has(p.id)).map(p => p.rect);
      for (const rect of blocked) if (el.y < rect.y + rect.h && el.y + el.h > rect.y) {
        const below = rect.y + rect.h + 16, above = rect.y - el.h - 16, room = doc.sections[index].h;
        el.y = below + el.h <= room ? below : above >= 0 ? above : el.y;
      }
    }
    const next = insert(doc, index, el);
    if (!next) { setToast({ text: 'Khúc này đã đủ phần tử. Thêm một khúc mới nhé.' }); return; }
    change(next, `add:${id}`); select(id); setSheet(window.innerWidth < 900 ? 'props' : null);
  };
  const addKid = (containerId: string, kind: 'button' | 'text') => {
    const id = freshId(doc, kind === 'button' ? 'nut' : 'chu');
    const kid: Kid = kind === 'button' ? { id, t: 'button', look: 'pill', label: { vi: 'Nút mới' }, link: 'https://example.com', icon: 'link', h: 44, bg: '#ffffff', fg: '#111111' }
      : { id, t: 'text', h: 40, words: { vi: 'Dòng chữ mới' }, font: 'sans', size: 15, color: '#111111', align: 'center' };
    const next = insertKid(doc, containerId, kid);
    if (next) { change(next, `add:${id}`); select(id); }
  };
  const removeSelected = () => { if (!selected) return; change(remove(doc, selected), `remove:${selected}`); select(null); };
  const duplicateSelected = () => { if (!selected) return; const made = duplicate(doc, selected); if (made) { change(made.doc, `dup:${made.id}`); select(made.id); } };
  const nudge = (dx: number, dy: number) => {
    if (!found || found.kid || found.top.lock) return;
    change(patch(doc, found.top.id, el => ({ ...el, x: (el as El).x + dx, y: (el as El).y + dy }) as AnyEl), `move:${found.top.id}`);
  };

  // Keyboard: Delete, arrows (Shift: 10), Cmd/Ctrl+Z, Shift+Cmd+Z or Ctrl+Y, Cmd/Ctrl+D, Escape — never while typing in a field.
  const keys = useRef<(event: KeyboardEvent) => void>(() => {});
  const onKey = (event: KeyboardEvent) => {
    const typing = (event.target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable]');
    const mod = event.metaKey || event.ctrlKey;
    if (mod && event.key.toLowerCase() === 'z' && !typing) { event.preventDefault(); restore(event.shiftKey ? 'future' : 'past'); return; }
    if (mod && event.key.toLowerCase() === 'y' && !typing) { event.preventDefault(); restore('future'); return; }
    if (mod && event.key.toLowerCase() === 's') { event.preventDefault(); void flush(); return; }
    if (typing) return;
    if (mod && event.key.toLowerCase() === 'd' && selected) { event.preventDefault(); duplicateSelected(); return; }
    if ((event.key === 'Delete' || event.key === 'Backspace') && selected) { event.preventDefault(); removeSelected(); return; }
    if (event.key === 'Escape') { select(null); setSheet(null); return; }
    const step = event.shiftKey ? 10 : 1;
    const arrows: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (arrows[event.key] && selected) { event.preventDefault(); nudge(...arrows[event.key]); }
  };
  useEffect(() => { keys.current = onKey; });
  useEffect(() => { const on = (event: KeyboardEvent) => keys.current(event); window.addEventListener('keydown', on); return () => window.removeEventListener('keydown', on); }, []);

  const preview = async () => {
    const tab = window.open('', '_blank');
    setBusy('preview');
    try {
      if (!(await flush())) { tab?.close(); return; }
      const response = await fetch(`/api/owner/v2/${shop}/design`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ page: page.slug, action: 'preview', expectedRevision: revision.current }) });
      if (!response.ok) { tab?.close(); setToast({ text: reason((await response.json().catch(() => ({}))).error) }); return; }
      if (tab) tab.location.href = '/preview'; else router.push('/preview');
    } finally { setBusy(''); }
  };
  const publish = async () => {
    if ([...walk(doc)].some(el => 'link' in el && el.link === 'https://example.com')) {
      const first = [...walk(doc)].find(el => 'link' in el && el.link === 'https://example.com');
      if (first) select(first.id);
      setToast({ text: `Nút “${first ? nameOf(first) : ''}” còn link mẫu. Dán link thật của quán rồi phát hành nhé.` }); return;
    }
    setBusy('publish');
    try {
      if (!(await flush())) return;
      const response = await fetch(`/api/owner/v2/${shop}/design`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ page: page.slug, action: 'publish', expectedRevision: revision.current }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) { setToast({ text: reason(body.error) }); return; }
      revision.current = body.revision;
      if (body.review === 'pending') {
        setReview({ state: 'pending', reason: null, page: page.slug });
        setToast({ text: 'Đã gửi duyệt. Trang lên ngay khi Quite Sensational duyệt xong — thường trong ngày. Bạn vẫn sửa tiếp được.' }); return;
      }
      setReview(null); setLive(true);
      setToast({ text: 'Đã phát hành. Khách chạm thẻ là thấy trang mới.', link: `${origin}/${page.slug}` });
    } finally { setBusy(''); }
  };
  const leave = async (to: string) => { await flush(); router.push(to); };
  const finishOnboarding = async () => {
    await flush();
    await fetch(`/api/owner/v2/${shop}/onboarding`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ step: 'template', value: 'done' }) }).catch(() => null);
    router.push('/bat-dau/tien-trinh');
  };

  const hasGoogle = useMemo(() => [...walk(doc)].some(el => el.t === 'google'), [doc]);
  const hasFeedback = useMemo(() => [...walk(doc)].some(el => el.t === 'feedback'), [doc]);
  const statusText = save.kind === 'saved' ? (live ? 'Đã lưu · trang khách đổi khi bấm Phát hành' : 'Đã lưu bản nháp') : save.kind === 'saving' ? 'Đang lưu…'
    : save.kind === 'dirty' ? 'Có thay đổi chưa lưu' : save.message;
  const sidePane = tab === 'add' ? <AddPanel onAdd={add} hasGoogle={hasGoogle} hasFeedback={hasFeedback} full={false} />
    : tab === 'section' ? <SectionPanel key={`${section}:${stamp}`} doc={doc} index={Math.min(section, doc.sections.length - 1)} selected={selected}
      set={(s, key) => change(patchSection(doc, Math.min(section, doc.sections.length - 1), () => s), key)}
      move={by => { change(moveSection(doc, section, by), 'section-move'); setSection(section + by); }}
      remove={() => { change(removeSection(doc, section), 'section-remove'); setSection(Math.max(0, section - 1)); select(null); }}
      add={() => add('section')} select={id => { select(id); if (window.innerWidth < 900) setSheet('props'); }}
      toggle={id => change(patch(doc, id, el => el.hide ? { ...el, hide: undefined } as AnyEl : { ...el, hide: true } as AnyEl), `hide:${id}`)} />
    : <PagePanel key={stamp} doc={doc} name={name} setName={value => change(doc, 'name', value)} setDoc={change} googleUrl={googleUrl} shop={shop} />;

  return <UploadContext.Provider value={uploadContext}><div className={styles.root}>
    <header className={styles.top}>
      <button type="button" className={styles.iconBtn} onClick={() => void leave(`/app/${shop}/library`)} aria-label="Về Library"><Icon name="back" /></button>
      <div className={styles.name}>
        <input value={name} maxLength={100} aria-label="Tên trang" onChange={event => { const v = event.target.value.replace(/[\u0000-\u001f<>]/g, ''); change(doc, 'name', v); }} />
        <small className={styles.status} data-kind={save.kind} role="status">{statusText}{save.kind === 'blocked' && save.id &&
          <> · <button type="button" style={{ border: 0, background: 'none', padding: 0, color: 'inherit', textDecoration: 'underline', cursor: 'pointer', font: 'inherit' }}
            onClick={() => { select(save.id!); setSheet('props'); }}>Xem chỗ cần sửa</button></>}</small>
      </div>
      <div className={styles.topActions}>
        <button type="button" className={styles.iconBtn} disabled={!steps.undo} onClick={() => restore('past')} aria-label="Hoàn tác" title="Hoàn tác (⌘Z)"><Icon name="undo" /></button>
        <button type="button" className={`${styles.iconBtn} ${styles.hideNarrow}`} disabled={!steps.redo} onClick={() => restore('future')} aria-label="Làm lại" title="Làm lại (⇧⌘Z)"><Icon name="redo" /></button>
        <button type="button" className={styles.ghost} disabled={!!busy} onClick={() => void preview()}><Icon name="phone" size={18} /><span className={styles.hideNarrow}>Xem trước</span></button>
        <button type="button" className={styles.primary} disabled={!!busy} onClick={() => void publish()}>
          {busy === 'publish' ? (review ? 'Đang gửi…' : 'Đang phát hành…') : review ? 'Gửi duyệt' : 'Phát hành'}</button>
      </div>
    </header>
    <div>
      {support && <SupportBanner slug={shop} session={support} row />}
      {onboarding && <div className={styles.banner}>
        <span><b>Bước Template.</b> Sửa chữ, link, màu cho đúng quán — xong thì bấm Xong. Mọi thứ sửa lại được sau.</span>
        <span className={styles.actions}>
          <button type="button" className={styles.primary} onClick={() => void finishOnboarding()}>Xong</button>
          <span className={styles.skip}><button type="button" className={styles.ghost} onClick={() => void finishOnboarding()}>Bỏ qua, đến bước tạo Dashboard</button>
            <button type="button" onClick={() => void finishOnboarding()}>skip</button></span>
        </span>
      </div>}
      {review && <div className={styles.banner} data-review={review.state} role="note">
        <span>{review.state === 'pending' ? (review.page && review.page !== page.slug
          ? <><b>Đang chờ duyệt trang /{review.page}.</b> Bấm Gửi duyệt để gửi trang này thay vào.</>
          : <><b>Đang chờ duyệt.</b> Quite Sensational xem bản mới nhất của trang này rồi phát hành giúp bạn — bạn vẫn sửa tiếp được.</>)
          : review.state === 'rejected' ? <><b>Chưa được duyệt:</b> {review.reason} Sửa lại rồi bấm Gửi duyệt.</>
          : <><b>Lần phát hành đầu cần duyệt.</b> Quite Sensational xem qua trang đầu tiên của mỗi quán mới để giữ tên miền an toàn cho mọi quán. Trang xong thì bấm Gửi duyệt.</>}</span>
      </div>}
    </div>
    <div className={styles.body}>
      <aside className={styles.side} data-open={sheet === 'add' || sheet === 'section' || sheet === 'page' || undefined} aria-label="Thêm, khúc, trang">
        <div className={styles.sheetHead}><span>{tab === 'add' ? 'Thêm vào trang' : tab === 'section' ? 'Khúc' : 'Trang'}</span>
          <button type="button" className={styles.iconBtn} onClick={() => setSheet(null)} aria-label="Đóng"><Icon name="close" /></button></div>
        <div className={styles.tabs}>{([['add', 'Thêm'], ['section', 'Khúc'], ['page', 'Trang']] as const).map(([key, label]) =>
          <button key={key} type="button" aria-pressed={tab === key} onClick={() => { setTab(key); if (sheet) setSheet(key); }}>{label}</button>)}</div>
        {sidePane}
      </aside>
      <div ref={stage} className={styles.stage}>
        <Stage doc={doc} zoom={zoom} selected={selected} section={section} slug={page.slug} googleUrl={googleUrl}
          onSelect={id => { select(id); if (!id && window.innerWidth < 900) setSheet(null); }} onSection={setSection}
          onChange={(next, key) => change(next, key)} onAddSection={() => add('section')} />
      </div>
      <aside className={styles.props} data-open={sheet === 'props' || undefined} aria-label="Thuộc tính">
        <div className={styles.sheetHead}><span>{found ? nameOf(found.rowKid ?? found.kid ?? found.top) : 'Thuộc tính'}</span>
          <button type="button" className={styles.iconBtn} onClick={() => setSheet(null)} aria-label="Đóng"><Icon name="close" /></button></div>
        {found ? <ElementPanel key={`${selected}:${stamp}`} found={found} uploads={uploads}
          set={(el, key) => change(patch(doc, el.id, () => el), key)} remove={removeSelected} duplicate={duplicateSelected}
          layer={to => change(reorder(doc, selected!, to), `layer:${selected}`)} select={id => select(id)} addKid={addKid} />
          : <div className={styles.pane}>
            <p className={styles.note}>Chọn một phần tử trên trang để sửa chữ, màu, link. Kéo để di chuyển, kéo chấm xanh để đổi cỡ.</p>
            <p className={styles.note}>Phím tắt: Delete xoá · mũi tên dịch 1 (Shift: 10) · ⌘Z hoàn tác · ⌘D nhân đôi.</p>
            <p className={styles.note}>Vạch cam là đáy màn hình đầu: khách thấy ngay phần phía trên vạch khi chạm thẻ.</p>
          </div>}
      </aside>
    </div>
    <nav className={styles.dock} aria-label="Công cụ">
      <button type="button" aria-pressed={sheet === 'add'} onClick={() => { setTab('add'); setSheet(sheet === 'add' ? null : 'add'); }}><Icon name="plus" />Thêm</button>
      <button type="button" aria-pressed={sheet === 'section'} onClick={() => { setTab('section'); setSheet(sheet === 'section' ? null : 'section'); }}><Icon name="section" />Khúc</button>
      <button type="button" aria-pressed={sheet === 'page'} onClick={() => { setTab('page'); setSheet(sheet === 'page' ? null : 'page'); }}><Icon name="settings" />Trang</button>
      <button type="button" aria-pressed={sheet === 'props'} disabled={!found} onClick={() => setSheet(sheet === 'props' ? null : 'props')}><Icon name="pencil" />Sửa</button>
    </nav>
    {toast && <div className={styles.toast} role="status"><span>{toast.text}</span>{toast.link && <a href={toast.link} target="_blank" rel="noreferrer">Mở trang ↗</a>}
      <button type="button" onClick={() => setToast(null)} aria-label="Đóng">×</button></div>}
  </div></UploadContext.Provider>;
}
