import { LINK_SLOTS, type LinkSlot } from '../canvas/doc';
import { linkProblem } from '../canvas/validate';

/**
 * Thông tin quán (Tài 06/10: "mọi thứ như link, chữ trên hitbox… phải đồng bộ với shop"): the one place a shop's Zalo,
 * Facebook, TikTok, website, phone, handle, hours and wifi live. Every page of the shop shows them through its slots
 * (lib/canvas/slots.ts) at the moment it is shown, so a number changed here is right on every page at once, as the Google
 * link already is. Written by the administrator (scripts/sua-trang.mjs) from what the shop sends over Zalo; stored in
 * `shops.profile`. Reading never throws: a value that no longer passes is left out, and the element it fed stays hidden.
 */
export type ShopLink = { url: string; label?: string };
export type ShopProfile = {
  links: Partial<Record<LinkSlot, ShopLink>>;
  /** Without the "@". */
  handle?: string;
  hours?: string;
  address?: string;
  wifi?: { name: string; pass?: string };
};
export class ProfileError extends Error { constructor(public readonly at: string) { super(`INVALID_PROFILE at ${at}`); } }
const fail = (at: string): never => { throw new ProfileError(at); };

const TEXT = /[\u0000-\u001f\u007f<>]/;
const line = (value: unknown, at: string, max: number) => {
  if (typeof value !== 'string') fail(at);
  const text = (value as string).trim().replace(/\s+/g, ' ');
  if (!text || text.length > max || TEXT.test(text)) fail(at);
  return text;
};
/** A Vietnamese phone number as 0 and nine digits, from "0961 036 265", "+84 961 036 265" or "84961036265"; null if it is not one. */
export function vnPhone(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const digits = String(value).replace(/[\s.()-]/g, '');
  const local = /^\+?84[0-9]{9}$/.test(digits) ? `0${digits.replace(/^\+?84/, '')}` : digits;
  return /^0[35789][0-9]{8}$/.test(local) ? local : null;
}
const host = (url: string) => { try { return new URL(url).hostname.replace(/^www\.|^m\./, '').toLowerCase(); } catch { return ''; } };
const path = (url: string) => { try { return new URL(url).pathname.replace(/\/+$/, ''); } catch { return ''; } };
/** The social sites a link slot belongs to: a link to the site itself, with nothing after it, is still the template's sample. */
const SITES: Partial<Record<LinkSlot, string[]>> = { zalo: ['zalo.me', 'oa.zalo.me'], facebook: ['facebook.com', 'fb.com', 'fb.me'], instagram: ['instagram.com'],
  tiktok: ['tiktok.com', 'vt.tiktok.com'], youtube: ['youtube.com', 'youtu.be'] };
/** Handles typed where a link was asked ("@nhetenh") become the page they name, on the sites that have one per handle. */
const HANDLE = /^@?([A-Za-z0-9._]{1,40})$/;

/** One link slot's address, from what Tài was sent: a URL, a phone number (Zalo, phone), a handle (Instagram, TikTok). */
function address(slot: LinkSlot, value: unknown, at: string): string {
  if (slot === 'phone') { const phone = vnPhone(value); return phone ? `tel:+84${phone.slice(1)}` : fail(at); }
  if (typeof value !== 'string') fail(at);
  let url = (value as string).trim();
  if (slot === 'zalo') { const phone = vnPhone(url); if (phone) url = `https://zalo.me/${phone}`; }
  const handle = HANDLE.exec(url);
  if (handle && slot === 'instagram') url = `https://www.instagram.com/${handle[1]}/`;
  if (handle && slot === 'tiktok') url = `https://www.tiktok.com/@${handle[1]}`;
  if (!/^https:\/\//i.test(url) && /^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(url)) url = `https://${url}`;
  if (linkProblem(url)) fail(at);
  const sites = SITES[slot];
  if (sites && (!sites.includes(host(url)) || !path(url))) fail(at);
  if (!sites && placeholderUrl(url)) fail(at);
  return url;
}

/**
 * A link a template carries as a sample, never a shop's own: the bare front page of a social site, or this platform's own
 * domain. The publishing core refuses a page that still shows one (slots.ts placeholderLinks).
 */
export function placeholderUrl(url: string): boolean {
  const site = host(url);
  if (PLATFORM_HOSTS.includes(site)) return true;
  return Object.values(SITES).some(list => list.includes(site)) && !path(url);
}
/** This platform's own domains: a shop's page links here only by a template's mistake. */
export const PLATFORM_HOSTS = ['quitesensational-review-bio.com'];

/** The profile as Tài writes it (scripts/sua-trang.mjs): strict, with every problem named by where it is. */
export function parseProfile(input: unknown): ShopProfile {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('profile');
  const value = input as Record<string, unknown>;
  for (const key of Object.keys(value)) if (!['links', 'handle', 'hours', 'address', 'wifi'].includes(key)) fail(key);
  const out: ShopProfile = { links: {} };
  const links = value.links ?? {};
  if (!links || typeof links !== 'object' || Array.isArray(links)) fail('links');
  for (const [slot, entry] of Object.entries(links as Record<string, unknown>)) {
    const at = `links.${slot}`;
    if (!(LINK_SLOTS as readonly string[]).includes(slot)) fail(at);
    if (entry === null || entry === undefined || entry === '') continue;
    const given = typeof entry === 'object' && !Array.isArray(entry) ? entry as Record<string, unknown> : { url: entry };
    for (const key of Object.keys(given)) if (!['url', 'label'].includes(key)) fail(`${at}.${key}`);
    const link: ShopLink = { url: address(slot as LinkSlot, given.url, `${at}.url`) };
    if (given.label !== undefined && given.label !== null && given.label !== '') link.label = line(given.label, `${at}.label`, 60);
    out.links[slot as LinkSlot] = link;
  }
  if (value.handle) { const handle = HANDLE.exec(String(value.handle).trim()); out.handle = handle ? handle[1] : fail('handle'); }
  if (value.hours) out.hours = line(value.hours, 'hours', 120);
  if (value.address) out.address = line(value.address, 'address', 200);
  if (value.wifi) {
    const wifi = value.wifi as Record<string, unknown>;
    if (typeof wifi !== 'object' || Array.isArray(wifi) || Object.keys(wifi).some(key => !['name', 'pass'].includes(key))) fail('wifi');
    out.wifi = { name: line(wifi.name, 'wifi.name', 64) };
    if (wifi.pass !== undefined && wifi.pass !== null && wifi.pass !== '') {
      const pass = wifi.pass;
      if (typeof pass !== 'string' || pass.length > 64 || TEXT.test(pass)) return fail('wifi.pass');
      out.wifi.pass = pass;
    }
  }
  return out;
}

/** The profile as stored, for showing a page: whatever no longer passes is dropped, never thrown. */
export function readProfile(stored: unknown): ShopProfile {
  try { return parseProfile(stored ?? {}); }
  catch {
    const value = (stored && typeof stored === 'object' ? stored : {}) as Record<string, unknown>, out: ShopProfile = { links: {} };
    for (const [slot, entry] of Object.entries((value.links ?? {}) as Record<string, unknown>)) {
      try { Object.assign(out.links, parseProfile({ links: { [slot]: entry } }).links); } catch { /* left out */ }
    }
    for (const key of ['handle', 'hours', 'address', 'wifi'] as const) {
      try { Object.assign(out, { [key]: parseProfile({ [key]: value[key] })[key] }); } catch { /* left out */ }
    }
    return out;
  }
}
