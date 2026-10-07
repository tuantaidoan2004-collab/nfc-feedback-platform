import { ARTBOARD, FIRST_SCREEN, type DeckEl, type El, type Kid, type PageDoc, type StackEl } from './doc';
import { linkProblem, walk } from './validate';

/**
 * Vị trí thật của từng phần tử, tính trên máy chủ (doc.ts: mọi chiều cao đều khai báo). Dùng cho hai việc: luật Google ở
 * cửa phát hành (nút Google trọn trong màn hình đầu, nằm trên mọi chỗ góp ý) và khung chọn của trình sửa.
 */
export type Rect = { x: number; y: number; w: number; h: number };
type Point = [number, number];
export type Placed = { id: string; section: number; rect: Rect; kid: boolean };

const rotate = ([x, y]: Point, [cx, cy]: Point, deg: number): Point => {
  if (!deg) return [x, y];
  const a = deg * Math.PI / 180, s = Math.sin(a), c = Math.cos(a);
  return [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c];
};
const corners = (r: Rect): Point[] => [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h]];
const bounds = (points: Point[]): Rect => {
  const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
};
const centre = (r: Rect): Point => [r.x + r.w / 2, r.y + r.h / 2];

/** The column of a stack or a deck's front card: each child's box, the container's own height. */
export function column(list: Kid[], x: number, y: number, w: number, gap: number, pad = 0, align: StackEl['align'] = 'center') {
  const inner = w - pad * 2, boxes: { kid: Kid; rect: Rect; hidden: boolean }[] = [];
  let top = y + pad, shown = 0;
  for (const kid of list) {
    if (kid.hide) { boxes.push({ kid, rect: { x, y: top, w: 0, h: 0 }, hidden: true }); continue; }
    if (shown++) top += gap;
    const kw = kid.t === 'row' ? Math.min(kid.w ?? inner, inner) : align === 'stretch' ? inner : Math.min(kid.w ?? inner, inner);
    const kx = x + pad + (align === 'end' ? inner - kw : align === 'start' || align === 'stretch' ? 0 : (inner - kw) / 2);
    boxes.push({ kid, rect: { x: kx, y: top, w: kw, h: kid.h }, hidden: false });
    top += kid.h;
  }
  return { boxes, height: top - y + pad };
}
/** A row's children side by side, centred in the row's box. */
export function row(kids: { w?: number; h: number; hide?: boolean }[], box: Rect, gap: number) {
  const shown = kids.filter(k => !k.hide), total = shown.reduce((s, k) => s + (k.w ?? 0), 0) + gap * Math.max(0, shown.length - 1);
  let left = box.x + (box.w - total) / 2;
  return kids.map(k => { if (k.hide) return null; const r = { x: left, y: box.y + (box.h - k.h) / 2, w: k.w ?? 0, h: k.h }; left += (k.w ?? 0) + gap; return r; });
}
export const deckFront = (deck: DeckEl) => column(deck.front.kids, deck.x, deck.y, deck.w, deck.front.gap, deck.front.pad ?? 0, 'center');

/** Every element's box on the page, as the guest sees it once everything has appeared, rotations included. */
export function placeAll(doc: PageDoc): Placed[] {
  const out: Placed[] = [];
  doc.sections.forEach((section, index) => {
    for (const el of section.els) {
      if (el.hide) continue;
      const own: Rect = { x: el.x, y: el.y, w: el.w, h: el.h };
      const containerTurn = (el.r ?? 0) + (el.t === 'deck' ? el.front.tilt ?? 0 : 0);
      const place = (id: string, rect: Rect, turn: number, kid: boolean, container: Rect) => {
        const turned = corners(rect).map(p => rotate(p, centre(rect), turn)).map(p => rotate(p, centre(container), kid ? containerTurn : 0));
        out.push({ id, section: index, rect: bounds(turned), kid });
      };
      if (el.t === 'stack' || el.t === 'deck') {
        const laid = el.t === 'stack' ? column(el.kids, el.x, el.y, el.w, el.gap, el.pad ?? 0, el.align) : deckFront(el);
        const container = { ...own, h: laid.height };
        out.push({ id: el.id, section: index, rect: bounds(corners(container).map(p => rotate(p, centre(container), containerTurn))), kid: false });
        for (const { kid, rect, hidden } of laid.boxes) {
          if (hidden) continue;
          if (kid.t === 'row') {
            row(kid.kids, rect, kid.gap).forEach((r, i) => { if (r) place(kid.kids[i].id, r, kid.kids[i].r ?? 0, true, container); });
            place(kid.id, rect, 0, true, container);
          } else place(kid.id, rect, kid.r ?? 0, true, container);
        }
      } else place(el.id, own, el.r ?? 0, false, own);
    }
  });
  return out;
}

/** The kinds of every element, by id, for the checks below. */
const kinds = (doc: PageDoc) => new Map([...walk(doc)].map(el => [el.id, el.t]));

/**
 * The page's own Google rules (docs/google-policy.md; kịch bản luật 0.1): at most one Google button; when there is one it
 * sits wholly inside the first screen of the first section. The private card opens only from the paper plane, which floats
 * over the page and steps aside from the button (components/canvas/live.tsx), so nothing about feedback stands above it.
 * Checked where a page is saved or published, never where it is read.
 */
export function googleProblems(doc: PageDoc): string | null {
  const placed = placeAll(doc), types = kinds(doc);
  const google = placed.filter(p => types.get(p.id) === 'google');
  if (google.length > 1) return 'GOOGLE_TWICE';
  const button = google[0];
  if (!button) return null;
  if (button.section !== 0 || button.rect.y < 0 || button.rect.y + button.rect.h > FIRST_SCREEN || button.rect.x < -2 || button.rect.x + button.rect.w > ARTBOARD + 2)
    return 'GOOGLE_NOT_FIRST_SCREEN';
  return null;
}

/** Every word the page shows, in both languages: the trip-wire of policy.ts reads them all. */
export function wordsOf(doc: PageDoc): string[] {
  const out: string[] = [];
  const add = (w?: { vi: string; en?: string }) => { if (w) { out.push(w.vi); if (w.en) out.push(w.en); } };
  for (const el of walk(doc)) {
    if (el.t === 'text') add(el.words);
    if (el.t === 'button') { add(el.label); add(el.tag); if (el.wifi) out.push(el.wifi.name); }
    if (el.t === 'image') add(el.caption);
  }
  for (const section of doc.sections) for (const el of section.els) if (el.t === 'deck') el.cards.forEach(card => add(card.label));
  return out;
}

/** Every address a page sends a guest to. */
export function linksOf(doc: PageDoc): string[] {
  const out: string[] = [];
  for (const el of walk(doc)) if ('link' in el && typeof el.link === 'string') out.push(el.link);
  for (const section of doc.sections) for (const el of section.els) if (el.t === 'deck') el.cards.forEach(card => out.push(card.link));
  return out;
}

/** A link that writes a Google review: only the platform's own Google button may lead there, and never with words or stars. */
const REVIEW_LINK = /(^https:\/\/search\.google\.com\/local\/writereview)|(^https:\/\/g\.page\/r\/[^/]+\/review)|[?&](rating|stars?|review_text)=/i;
/** The first rule about where the page sends guests that the page breaks, or null (the words are policy.ts's to check). */
export function linkRuleProblem(doc: PageDoc): string | null {
  for (const value of linksOf(doc)) { if (linkProblem(value)) return 'INVALID_PAGE'; if (REVIEW_LINK.test(value)) return 'POLICY_GOOGLE_LINK'; }
  return null;
}

/** The uploads a page shows: each must pass the image review before the page publishes (media-gate.ts). */
export function mediaOf(doc: PageDoc): string[] {
  const found = [doc.backdrop?.src, ...doc.sections.map(s => s.bg?.src), doc.fonts?.chinh, doc.fonts?.dacBiet, doc.sound?.src];
  for (const el of walk(doc)) if (el.t === 'image') found.push(el.src, ...(el.flip ?? []));
  // Everything but the app's own pictures: an address that is not built in must be an approved upload of the shop.
  return [...new Set(found.filter((src): src is string => typeof src === 'string' && !src.startsWith('art:') && !src.startsWith('/tpl/')))];
}
