import type { El, Kid, LinkSlot, PageDoc, RowKid, Words } from './doc';
import { placeholderUrl, type ShopProfile } from '../shop/profile';

/**
 * Chỗ của quán (doc.ts SLOTS; Tài 06/10): a page is a design, kept as the template left it, plus the shop's data, put in its
 * places each time the page is shown -- to a guest, as a picture in the dashboard, to the publishing core before it lets a
 * page go live. The Google button has always worked so (its link is the shop's, never the page's); now the shop's name,
 * links, handle, hours and wifi do too, so a page never shows a sample, and a number fixed once is right on every page.
 *
 *   live    everything the shop has goes in; an element whose data the shop lacks is not shown at all
 *   sample  only the name: the template as its future owner sees it before Tài has the rest (Library, the page waiting)
 */
export type ShopData = { name: string; profile: ShopProfile };
type Leafy = El | Kid | RowKid;

/** A line's width in ems, roughly: wide and narrow letters apart, accents ignored. Only ever compared with another line's. */
function ems(line: string) {
  let width = 0;
  for (const ch of line.normalize('NFD').replace(/[̀-ͯ]/g, '')) {
    width += ch === ' ' ? .28 : /[mwMW@]/.test(ch) ? .86 : /[iljtfrI1.,'|!:;]/.test(ch) ? .32 : /[A-Z0-9#&%]/.test(ch) ? .68 : .54;
  }
  return width;
}
/**
 * The size at which `name` fits where the template's sample sat (Tài 05/10: "Tên quán" là chỗ của tên thật), so a long name
 * shrinks instead of spilling out of its frame. A line holds what the sample's longest line took, or most of the box's width
 * when that is more; a sample over several lines lends the name its lines.
 */
function fittedSize(sample: string, name: string, size: number, width: number) {
  const lines = sample.split('\n'), room = Math.max(Math.max(...lines.map(ems)) * size, width * .9), wanted = ems(name) * size;
  if (wanted <= room) return size;
  if (lines.length > 1 && wanted <= room * lines.length * .85) return size;
  const scale = Math.max(.45, (lines.length > 1 ? room * lines.length * .85 : room * .97) / wanted);
  return Math.round(size * scale * 10) / 10;
}
const capitalised = (text: { caps?: boolean; words: Words }) => text.caps || text.words.vi === text.words.vi.toLocaleUpperCase('vi');
/** The host of a link, as a button shows it: "nhetenh.vn". */
const hostOf = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } };
/** A label that is itself an address ("tenquan.vn", "TENQUAN.VN – HẬU MÃI") is the sample's, and takes the shop's own. */
const looksLikeAddress = (label: string) => /[a-z0-9-]\.[a-z]{2,}\b/i.test(label);
/** The order a shop's buttons come in when a page names none: where guests go most, then the rest. */
export const LINKS_ORDER: LinkSlot[] = ['facebook', 'instagram', 'tiktok', 'zalo', 'youtube', 'website', 'menu', 'booking', 'maps', 'email', 'phone'];
const SAMPLE = Object.fromEntries(LINKS_ORDER.map(slot => [slot, slot === 'phone' ? 'tel:+84900000000' : slot === 'email' ? 'mailto:quan@example.com' : 'https://example.com/'])) as Record<LinkSlot, string>;
/** The first page a handle button leads to: the shop's social pages in the order guests most often follow them. */
const SOCIAL_ORDER = ['instagram', 'tiktok', 'facebook', 'youtube', 'zalo'] as const;

function fillLeaf(el: Leafy, shop: ShopData, width: number, mode: 'live' | 'sample') {
  if (!('slot' in el) || !el.slot) return;
  const slot = el.slot, profile = shop.profile, show = (on: boolean) => { if (on) delete el.hide; else el.hide = true; };
  if (slot === 'name' || slot === 'initial') {
    if (el.t !== 'text') return;
    if (slot === 'initial') { el.words = { vi: Array.from(shop.name.trim())[0]?.toLocaleUpperCase('vi') ?? 'Q' }; return; }
    const shown = capitalised(el) ? shop.name.toLocaleUpperCase('vi') : shop.name;
    el.size = fittedSize(el.caps ? el.words.vi.toLocaleUpperCase('vi') : el.words.vi, shown, el.size, width);
    el.words = { vi: el.words.vi === el.words.vi.toLocaleUpperCase('vi') ? shown : shop.name };
    return;
  }
  if (mode === 'sample') return;
  if (slot === 'handle') {
    const lead = SOCIAL_ORDER.map(key => profile.links[key]?.url).find(Boolean);
    // Written as the design writes it (Tài 06/10: the page adds nothing the design does not show): "@name" only where the sample has the "@".
    const sample = el.t === 'text' ? el.words.vi : el.t === 'button' ? el.label.vi : '@';
    const words: Words = { vi: `${sample.trim().startsWith('@') ? '@' : ''}${profile.handle}` };
    if (el.t === 'text') { show(!!profile.handle); if (profile.handle) el.words = words; }
    if (el.t === 'button') { show(!!profile.handle && !!lead); if (profile.handle && lead) { el.label = words; el.link = lead; } }
    return;
  }
  if (slot === 'hours' || slot === 'address') {
    const value = profile[slot];
    show(!!value); if (value && el.t === 'text') el.words = { vi: value };
    return;
  }
  if (slot === 'wifi') {
    show(!!profile.wifi); if (profile.wifi && el.t === 'button') el.wifi = { ...profile.wifi };
    return;
  }
  const link = profile.links[slot as LinkSlot];
  show(!!link);
  if (!link || !('link' in el || el.t === 'icon' || el.t === 'image' || el.t === 'shape')) return;
  (el as { link?: string }).link = link.url;
  if (el.t === 'button') labelled(el, link);
}
function labelled(el: { label: Words }, link: { url: string; label?: string }) {
  if (link.label) el.label = { vi: link.label };
  else if (looksLikeAddress(el.label.vi)) {
    const host = hostOf(link.url);
    el.label = { vi: el.label.vi === el.label.vi.toLocaleUpperCase('vi') ? host.toUpperCase() : host };
  }
}

/** The page with the shop's data in its places (see the top of this file). The document passed in is never changed. */
export function bindShop(doc: PageDoc, shop: ShopData, mode: 'live' | 'sample' = 'live'): PageDoc {
  const out = structuredClone(doc);
  for (const section of out.sections) for (const el of section.els) {
    if (el.t === 'links') {
      // One button per link the shop has; in a preview of an empty template, every kind once, so the look can be judged.
      const order = el.order ?? LINKS_ORDER;
      el.items = mode === 'sample' ? order.map(slot => ({ slot, url: SAMPLE[slot] }))
        : order.flatMap(slot => { const link = shop.profile.links[slot]; return link ? [{ slot, url: link.url, ...(link.label ? { label: link.label } : {}) }] : []; });
      if (el.items.length) delete el.hide; else el.hide = true;
      continue;
    }
    fillLeaf(el, shop, el.w, mode);
    const column = el.t === 'stack' ? { kids: el.kids, inner: el.w - 2 * (el.pad ?? 0) } : el.t === 'deck' ? { kids: el.front.kids, inner: el.w - 2 * (el.front.pad ?? 0) } : null;
    for (const kid of column?.kids ?? []) {
      if (kid.t === 'row') {
        for (const c of kid.kids) fillLeaf(c, shop, c.w, mode);
        // A row whose every child is gone leaves no empty band behind.
        if (kid.kids.some(c => c.slot) && kid.kids.every(c => c.hide)) kid.hide = true; else if (kid.kids.some(c => c.slot)) delete kid.hide;
      } else fillLeaf(kid, shop, Math.min(kid.w ?? column!.inner, column!.inner), mode);
    }
    if (el.t === 'deck' && mode === 'live') for (const card of el.cards) {
      if (!card.slot) continue;
      const link = shop.profile.links[card.slot];
      if (link) { delete card.hide; card.link = link.url; labelled(card, link); } else card.hide = true;
    }
  }
  return out;
}

/** Every element a guest can reach, with where it leads: hidden ones, and anything inside a hidden container, left out. */
function* shownLinks(doc: PageDoc): Generator<{ id: string; link: string }> {
  const one = function* (el: Leafy): Generator<{ id: string; link: string }> {
    if (el.hide) return;
    if ('link' in el && typeof el.link === 'string') yield { id: el.id, link: el.link };
    if (el.t === 'row') for (const kid of el.kids) yield* one(kid);
  };
  for (const section of doc.sections) for (const el of section.els) {
    if (el.hide) continue;
    yield* one(el);
    if (el.t === 'stack') for (const kid of el.kids) yield* one(kid);
    if (el.t === 'links') for (const item of el.items ?? []) yield { id: `${el.id}.${item.slot}`, link: item.url };
    if (el.t === 'deck') {
      for (const kid of el.front.kids) yield* one(kid);
      for (const [i, card] of el.cards.entries()) if (!card.hide) yield { id: `${el.id}.${i}`, link: card.link };
    }
  }
}
/**
 * Where a page, as a guest would see it, still leads to a template's sample (a social site's bare front page, this platform):
 * the publishing core refuses such a page (lib/publishing/repository.ts), whoever publishes it.
 */
export function placeholderLinks(doc: PageDoc): string[] {
  return [...shownLinks(doc)].filter(item => placeholderUrl(item.link)).map(item => item.id);
}

/** Every slot of the page and whether the shop has its data, for the administrator's checklist (scripts/sua-trang.mjs). */
export function slotReport(doc: PageDoc, shop: ShopData) {
  const bound = bindShop(doc, shop), out: { id: string; slot: string; filled: boolean }[] = [];
  const visit = (el: Leafy) => { if ('slot' in el && el.slot) out.push({ id: el.id, slot: el.slot, filled: !el.hide }); if (el.t === 'row') el.kids.forEach(visit); };
  for (const section of bound.sections) for (const el of section.els) {
    visit(el);
    if (el.t === 'stack') el.kids.forEach(visit);
    if (el.t === 'deck') { el.front.kids.forEach(visit); el.cards.forEach((card, i) => { if (card.slot) out.push({ id: `${el.id}.${i}`, slot: card.slot, filled: !card.hide }); }); }
  }
  return out;
}
