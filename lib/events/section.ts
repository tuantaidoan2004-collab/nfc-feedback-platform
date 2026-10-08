import type { ButtonEl, El, PageDoc, Section, TextEl } from '../canvas/doc';
import { walk } from '../canvas/validate';
import type { EventBlock, EventKey } from './catalog';

/**
 * Khúc của sự kiện trên trang canvas, cho trang **chưa có logo collab** (trang có logo thì logo là chỗ bấm, `hasSign`): một khúc canvas thật
 * chỉ gồm vạch ngăn và các nút của sự kiện, không chữ nào khác (Tài 08/10), đặt giữa khúc đầu và phần còn lại
 * (components/canvas/render.tsx `afterFirst`). Khúc này không nằm trong tài liệu của quán, chủ quán không sửa được và không
 * phải làm gì; nó mượn nét của chính trang để mỗi quán một vẻ:
 *
 * - nền: màu trang chạy tiếp ở dưới khúc cuối (giống dòng chân trang), nên khúc B nối liền với trang;
 * - mực (vạch ngăn, nút không có kiểu riêng): màu chữ đầu tiên của template nếu đủ tương phản trên nền đó, không thì trắng / gần đen;
 * - nút: kiểu nút của template (pill, gradient, ring…) với màu của nó; template không có nút hợp thì pill đảo màu.
 *
 * Luật Google (docs/google-policy.md luật 4 và 8): khúc này không bao giờ là khúc đầu (nút Google luôn ở màn hình đầu,
 * khúc đầu cao hết màn hình) và có một vạch ngăn với phần của quán.
 */
const W = 390;
const BTN_W = 310;
/** The popout button leaves room on both sides for its corner marks. */
const POP_W = 290;
/** Looks that draw their own surface, so they read the same on any page colour. The rest (text, link, box, tag, tail) lean on the template's background. */
const FILLED = new Set<ButtonEl['look']>(['pill', 'gradient', 'glow', 'ring', 'outline', 'soft', 'note']);

const hex6 = (c: string) => /^#[0-9a-f]{3}$/i.test(c) ? c.replace(/^#(.)(.)(.)$/, '#$1$1$2$2$3$3') : c.slice(0, 7);
function luminance(color: string) {
  const hex = hex6(color);
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return null;
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  return .2126 * r + .7152 * g + .0722 * b;
}
export function contrast(a: string, b: string) {
  const x = luminance(a), y = luminance(b);
  if (x === null || y === null) return 0;
  return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
}

/** The colour the page continues in below its last section: that section's own, the backdrop's, or near-black under a picture. */
export function baseColor(doc: PageDoc): string {
  const last = doc.sections[doc.sections.length - 1]?.bg?.fill ?? doc.backdrop?.fill;
  const color = !last ? '#0b0b0c' : typeof last === 'string' ? last : last.stops[last.stops.length - 1][0];
  return luminance(color) === null ? '#0b0b0c' : hex6(color);
}

/** Every element of the page, children of stacks and rows included (only their looks are read here, never their places). */
const elements = (doc: PageDoc) => [...walk(doc)] as El[];

export function eventSection(doc: PageDoc, block: EventBlock): Section {
  const base = baseColor(doc), dark = (luminance(base) ?? 0) < .35;
  const all = elements(doc);
  const title = all.find((el): el is TextEl => el.t === 'text' && !el.arc && !el.disc);
  const ink = title && contrast(title.color, base) >= 4.5 ? hex6(title.color) : dark ? '#f6f3ee' : '#17171a';
  const model = all.find((el): el is ButtonEl => el.t === 'button' && !el.wifi && FILLED.has(el.look));
  const h = Math.min(56, Math.max(44, model?.h ?? 48));
  const button = (key: string, label: EventBlock['items'][number]['label'], href: string, y: number): ButtonEl => model
    ? { id: `${block.key}-${key}`, t: 'button', x: (W - BTN_W) / 2, y, w: BTN_W, h, look: model.look, label, link: href,
      bg: model.bg, fg: model.fg, edge: model.edge, font: model.font,
      // The label is a sentence, not a shop's one-word link: never smaller than 15 units, whatever the template's buttons use.
      size: Math.min(18, Math.max(15, model.size ?? 16)), weight: model.weight, spacing: model.spacing, shadow: model.shadow }
    : { id: `${block.key}-${key}`, t: 'button', x: (W - BTN_W) / 2, y, w: BTN_W, h, look: 'pill', label, link: href, bg: ink, fg: base, font: 'sans', size: 16, weight: 650 };
    let y = 56;
  const els: El[] = [
    // Vạch ngăn: khúc của sự kiện tách khỏi phần của quán ở trên (luật 8).
    { id: `${block.key}-rule`, t: 'shape', shape: 'rect', x: (W - 56) / 2, y: 14, w: 56, h: 2, radius: 1, fill: ink, o: .28 },
  ];
  // Only the buttons (Tài 08/10: no words, no rules -- the organizer's own page has them).
  for (const item of block.items) {
    if (item.pop) {
      // The popout button keeps its own lime (uiverse dexter-st/itchy-wolverine-84); its corner marks take the page's ink.
      els.push({ id: `${block.key}-${item.key}`, t: 'button', x: (W - POP_W) / 2, y, w: POP_W, h: 56, look: 'popout', label: item.label, link: item.href,
        pop: [item.pop[0], item.pop[1]], font: 'sans', size: 17, weight: 800, edge: { w: 1, color: dark ? 'rgba(255,255,255,.45)' : 'rgba(0,0,0,.3)' } });
      y += 56 + 40;
    } else { els.push(button(item.key, item.label, item.href, y)); y += h + 12; }
  }
  return { id: `khuc-b-${block.key}`, name: block.title.vi, h: y + 8, bg: { fill: base }, els };
}

/** The page carries its own collab logo for this event (doc.ts EventSpotEl): the logo is then where the guest taps, and no block is added. */
export const hasSign = (doc: PageDoc, key: string) => elements(doc).some(el => el.t === 'event' && el.event === key);

/**
 * The page as a guest sees it today: an event's sign (doc.ts EventSpotEl) stays only while /gov has its event open for the shop,
 * so closing an event takes its sign off every page at once, as it takes off the block, with nothing republished.
 */
export function withOpenEvents(doc: PageDoc, open: readonly EventKey[]): PageDoc {
  const shown = new Set<string>(open);
  if (!doc.sections.some(section => section.els.some(el => el.t === 'event' && !shown.has(el.event)))) return doc;
  return { ...doc, sections: doc.sections.map(section => ({ ...section, els: section.els.filter(el => el.t !== 'event' || shown.has(el.event)) })) };
}
