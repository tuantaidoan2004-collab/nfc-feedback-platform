import { test, expect } from '@playwright/test';
import { bindShop, placeholderLinks, slotReport } from '../../lib/canvas/slots';
import { parseProfile, readProfile, vnPhone, placeholderUrl, ProfileError } from '../../lib/shop/profile';
import { validateDoc, walk } from '../../lib/canvas/validate';
import { canvasTemplate } from '../../lib/canvas/templates';
import type { ButtonEl, DeckEl, PageDoc, StackEl, TextEl } from '../../lib/canvas/doc';

/**
 * Chỗ của quán (Tài 06/10): a template marks where the shop's own data goes; the page shows the shop's data there, or nothing
 * at all, and never a template's sample link. The shop's details are one record (lib/shop/profile.ts) every page reads.
 */
const at = (error: unknown) => (error instanceof ProfileError ? error.at : String(error));
const refused = (input: unknown) => { try { parseProfile(input); return null; } catch (error) { return at(error); } };
const el = <T,>(doc: PageDoc, id: string) => [...walk(doc)].find(item => item.id === id) as T;

test('a phone number in any of the ways a shop writes it, and nothing that is not one', () => {
  for (const value of ['0912345678', '0912 345 678', '+84 912 345 678', '84912345678', '0912.345.678']) expect(vnPhone(value), value).toBe('0912345678');
  for (const value of ['091234567', '1912345678', '0212345678', 'zalo', '', null, 912345678]) expect(vnPhone(value), String(value)).toBeNull();
});

test('the shop\'s details: what Tài is sent becomes links the page can use, and anything else is refused by where it is', () => {
  const profile = parseProfile({ links: { zalo: '0912 345 678', instagram: '@nhetenh', tiktok: 'nhetenh.tea', website: 'nhetenh.vn', phone: '+84912345678',
    facebook: { url: 'https://www.facebook.com/nhetenh', label: '  Nhẹ   Tênh  ' }, menu: '' }, handle: '@nhetenh', hours: ' Mở cửa  7:00 – 22:00 ', wifi: { name: 'NheTenh', pass: '' } });
  expect(profile).toEqual({ links: { zalo: { url: 'https://zalo.me/0912345678' }, instagram: { url: 'https://www.instagram.com/nhetenh/' },
    tiktok: { url: 'https://www.tiktok.com/@nhetenh.tea' }, website: { url: 'https://nhetenh.vn' }, phone: { url: 'tel:+84912345678' },
    facebook: { url: 'https://www.facebook.com/nhetenh', label: 'Nhẹ Tênh' } }, handle: 'nhetenh', hours: 'Mở cửa 7:00 – 22:00', wifi: { name: 'NheTenh' } });
  // A social site's front page, this platform, a stranger address, a field nobody knows: each named where it is.
  expect(refused({ links: { facebook: 'https://www.facebook.com/' } })).toBe('links.facebook.url');
  expect(refused({ links: { zalo: 'https://zalo.me/' } })).toBe('links.zalo.url');
  expect(refused({ links: { instagram: 'https://www.tiktok.com/@x' } })).toBe('links.instagram.url');
  expect(refused({ links: { website: 'https://quitesensational-review-bio.com/' } })).toBe('links.website.url');
  expect(refused({ links: { website: 'javascript:alert(1)' } })).toBe('links.website.url');
  expect(refused({ links: { website: 'http://nhetenh.vn' } })).toBe('links.website.url');
  expect(refused({ links: { phone: '123' } })).toBe('links.phone.url');
  expect(refused({ links: { fax: 'x' } })).toBe('links.fax');
  expect(refused({ links: { menu: { url: 'https://x.vn', color: 'red' } } })).toBe('links.menu.color');
  expect(refused({ handle: 'nhẹ tênh' })).toBe('handle');
  expect(refused({ hours: '<b>' })).toBe('hours');
  expect(refused({ wifi: { name: 'x', password: 'y' } })).toBe('wifi');
  expect(refused({ logo: 'x' })).toBe('logo');
  expect(placeholderUrl('https://www.tiktok.com/')).toBe(true); expect(placeholderUrl('https://www.tiktok.com/@nhetenh')).toBe(false);
  // Reading what is stored never throws: whatever no longer passes is simply not there.
  expect(readProfile({ links: { zalo: '0912345678', facebook: 'https://www.facebook.com/' }, hours: '<b>', handle: 'nhetenh' }))
    .toEqual({ links: { zalo: { url: 'https://zalo.me/0912345678' } }, handle: 'nhetenh' });
  expect(readProfile(null)).toEqual({ links: {} });
});

test('shown live, a page takes the shop\'s data in its places and drops what the shop lacks; the stored page never changes', () => {
  const doc = canvasTemplate('hien-dai')!.doc, before = JSON.stringify(doc);
  const profile = parseProfile({ links: { zalo: '0912345678', website: 'https://nhetenh.vn/hau-mai' } });
  const shown = bindShop(doc, { name: 'Nhẹ Tênh Tea', profile });
  expect(JSON.stringify(doc)).toBe(before);
  expect(el<TextEl>(shown, 'ten-quan').words.vi).toBe('NHẸ TÊNH TEA');
  expect(el<ButtonEl>(shown, 'zalo')).toMatchObject({ link: 'https://zalo.me/0912345678', label: { vi: 'Zalo OA' } });
  // A label that was itself an address takes the shop's, in the template's capitals.
  expect(el<ButtonEl>(shown, 'hau-mai')).toMatchObject({ link: 'https://nhetenh.vn/hau-mai', label: { vi: 'NHETENH.VN' } });
  for (const id of ['tiktok', 'bang-gia']) expect(el<ButtonEl>(shown, id).hide, id).toBe(true);
  expect(placeholderLinks(shown)).toEqual([]);
  // A label the shop chose wins over the template's.
  const labelled = bindShop(doc, { name: 'x', profile: parseProfile({ links: { website: { url: 'https://nhetenh.vn', label: 'NHETENH.VN – HẬU MÃI' } } }) });
  expect(el<ButtonEl>(labelled, 'hau-mai').label).toEqual({ vi: 'NHETENH.VN – HẬU MÃI' });
  // Sample: only the name, every other place keeps the template's sample (what the shop picks from).
  const sample = bindShop(doc, { name: 'Nhẹ Tênh Tea', profile }, 'sample');
  expect(el<ButtonEl>(sample, 'zalo')).toMatchObject({ link: 'https://zalo.me/' });expect(el<ButtonEl>(sample, 'tiktok').hide).toBeUndefined();
  expect(placeholderLinks(sample).sort()).toEqual(['bang-gia', 'hau-mai', 'tiktok', 'zalo']);
});

test('a handle, the hours, the wifi; a row with nothing left disappears; a deck shows only the cards the shop can fill', () => {
  const salon = canvasTemplate('hair-styling')!.doc, cafe = canvasTemplate('nen-ca-phe')!.doc, party = canvasTemplate('party')!.doc;
  const profile = parseProfile({ links: { tiktok: '@nhetenh' }, handle: 'nhetenh', wifi: { name: 'NheTenh', pass: '12345678' } });
  const shownSalon = bindShop(salon, { name: 'Salon', profile });
  expect(el<TextEl>(shownSalon, 'handle').words.vi).toBe('@nhetenh');
  const shownCafe = bindShop(cafe, { name: 'Cà phê', profile });
  expect(el<ButtonEl>(shownCafe, 'wifi').wifi).toEqual({ name: 'NheTenh', pass: '12345678' });
  expect(el<TextEl>(bindShop(cafe, { name: 'Cà phê', profile: { links: {} } }), 'handle').hide).toBe(true);
  // A handle button leads to the shop's first social page, and is gone without one.
  const hotel = canvasTemplate('khach-san')!.doc;
  expect(el<ButtonEl>(bindShop(hotel, { name: 'KS', profile }), 'handle')).toMatchObject({ label: { vi: '@nhetenh' }, link: 'https://www.tiktok.com/@nhetenh' });
  expect(el<ButtonEl>(bindShop(hotel, { name: 'KS', profile: parseProfile({ handle: 'nhetenh' }) }), 'handle').hide).toBe(true);
  // Basic 1: three social buttons in a row; with none of them the row goes too.
  const basic = bindShop(canvasTemplate('basic-1')!.doc, { name: 'B', profile: { links: {} } });
  const row = (basic.sections[0].els.find(item => item.t === 'stack') as StackEl).kids.find(kid => kid.t === 'row')!;
  expect(row.hide).toBe(true);
  const deck = bindShop(party, { name: 'P', profile }).sections.flatMap(s => s.els).find(item => item.t === 'deck') as DeckEl;
  expect(deck.cards.map(card => [card.slot, !!card.hide, card.link])).toEqual([['instagram', true, 'https://www.instagram.com/'], ['tiktok', false, 'https://www.tiktok.com/@nhetenh'], ['zalo', true, 'https://zalo.me/']]);
  expect(slotReport(party, { name: 'P', profile }).filter(item => item.filled).map(item => item.slot).sort()).toEqual(['initial', 'name', 'tiktok']);
});

test('a slot only where the shop\'s data can show; a hidden element and what is inside a hidden one lead nowhere', () => {
  const doc = structuredClone(canvasTemplate('basic-1')!.doc);
  const stack = doc.sections[0].els.find(item => item.t === 'stack') as StackEl;
  const set = (patch: Record<string, unknown>) => { const copy = structuredClone(doc); Object.assign([...walk(copy)].find(item => item.id === 'zalo')!, patch); return copy; };
  expect(() => validateDoc(set({ slot: 'name' }))).toThrow('INVALID_PAGE');
  expect(() => validateDoc(set({ slot: 'wifi' }))).toThrow('INVALID_PAGE');
  expect(() => validateDoc(set({ slot: 'fax' }))).toThrow('INVALID_PAGE');
  const google = structuredClone(doc); Object.assign([...walk(google)].find(item => item.t === 'google')!, { slot: 'website' });
  expect(() => validateDoc(google)).toThrow('INVALID_PAGE');
  const container = structuredClone(doc); Object.assign(container.sections[0].els.find(item => item.t === 'stack')!, { slot: 'zalo' });
  expect(() => validateDoc(container)).toThrow('INVALID_PAGE');
  // The raw template still leads to samples; hiding the stack they sit in takes them all out of reach.
  expect(placeholderLinks(doc).sort()).toEqual(['instagram', 'tiktok', 'zalo']);
  stack.hide = true;
  expect(placeholderLinks(doc)).toEqual([]);
});

test('a phone and an email read back from the store stay on the page (07/10: the stored "tel:" form used to drop the phone)', () => {
  const stored = parseProfile({ links: { phone: '0912 345 678', email: 'xinchao@quan.vn' } });
  expect(stored.links).toEqual({ phone: { url: 'tel:+84912345678' }, email: { url: 'mailto:xinchao@quan.vn' } });
  expect(readProfile(JSON.parse(JSON.stringify(stored))).links).toEqual(stored.links);
});
