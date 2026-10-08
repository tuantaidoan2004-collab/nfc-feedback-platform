import { mapsLink } from './maps-link';
import { parsePlaceId } from './place-id';

/**
 * The Place ID behind a Google Maps link an owner pasted (Tài 08/10). A full place link carries it already (./place-id
 * `placeIdOfFeature`); a short share link (maps.app.goo.gl, goo.gl/maps) is opened here, without following it, and the
 * address it points to is read the same way -- a few hops at most, and only ever on Google's own hosts. Null when Google
 * says nothing usable: the owner can still paste the Place ID by hand.
 */
const GOOGLE = /(^|\.)(google\.[a-z.]+|goo\.gl)$/i;
export async function placeIdFromLink(pasted: unknown, fetcher: typeof fetch = fetch): Promise<string | null> {
  const direct = parsePlaceId(pasted);
  if (direct) return direct;
  let url = mapsLink(pasted);
  for (let hop = 0; url && hop < 4; hop++) {
    const host = new URL(url).hostname;
    if (!GOOGLE.test(host)) return null;
    const found = parsePlaceId(url);
    if (found) return found;
    let response: Response;
    try { response = await fetcher(url, { redirect: 'manual', signal: AbortSignal.timeout(6000), headers: { 'User-Agent': 'Mozilla/5.0' } }); }
    catch { return null; }
    const next = response.headers.get('location');
    if (!next) return null;
    try { url = new URL(next, url).href; } catch { return null; }
  }
  return url ? parsePlaceId(url) : null;
}
