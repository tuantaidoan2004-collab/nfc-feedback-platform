/**
 * The shop's Google Maps link (Tài 05/10): each shop pastes its own, and the Google Maps review tool reads that place.
 * Shared by the server (lib/google/business.ts) and the link field (components/qs/tabs/maps-link.tsx), so the field says
 * "đúng link" exactly when the server will take it.
 */
/** Links that open a place on Google Maps, which is what the tool reads (a review form or a search page is not). */
const MAPS_HOSTS: Record<string, RegExp> = {
  'maps.app.goo.gl': /^\/[A-Za-z0-9]/, 'goo.gl': /^\/maps\/./, 'maps.google.com': /^\//, 'maps.google.com.vn': /^\//,
  'google.com': /^\/maps\b/, 'www.google.com': /^\/maps\b/, 'google.com.vn': /^\/maps\b/, 'www.google.com.vn': /^\/maps\b/,
};
/** The link out of what owners paste: the link itself, or the share text around it ("Tên quán\nhttps://maps.app.goo.gl/…"). */
export function mapsLink(pasted: unknown): string | null {
  if (typeof pasted !== 'string' || pasted.length > 4000) return null;
  const found = pasted.match(/https:\/\/[^\s<>"']+/)?.[0];
  let url: URL; try { url = new URL(found ?? ''); } catch { return null; }
  const path = MAPS_HOSTS[url.hostname.toLowerCase()];
  return path && path.test(url.pathname) && !url.username && !url.password && url.href.length <= 2000 ? url.href : null;
}
