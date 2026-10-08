import { test, expect } from '@playwright/test';
import { parsePlaceId, placeIdOfFeature } from '../../lib/google/place-id';
import { placeIdFromLink } from '../../lib/google/place-from-link';

/** Tài 08/10: "phải tự động tìm place id khi dán link gg map chứ". */
const ORENCHI = 'https://www.google.com/maps/place/O%E2%80%99renchi+Cafe/@10.7358491,106.7028501,17z/data=!3m1!4b1!4m6!3m5!1s0x31752f20d05ee9bd:0x92b3ae61b9090beb!8m2!3d10.7358491!4d106.7028501!16s%2Fg%2F11v0b3229l?entry=ttu';

test('a place link carries its Place ID: the feature id 0x…:0x… made into the ChIJ… form', () => {
  // Google's own sample (Sydney) and a shop opened in Maps (checked on Google Maps by place_id, 08/10).
  expect(placeIdOfFeature('ftid=0x6b12ae37b47f5b37:0x8eaddfcd1b32ca52')).toBe('ChIJN1t_tDeuEmsRUsoyG83frY4');
  expect(parsePlaceId(ORENCHI)).toBe('ChIJvele0CAvdTER6wsJuWGus5I');
  // Inside the share text around it, and as before for a link with a placeid parameter or the bare ID.
  expect(parsePlaceId(`O’renchi Cafe\n${ORENCHI}`)).toBe('ChIJvele0CAvdTER6wsJuWGus5I');
  expect(parsePlaceId('https://search.google.com/local/writereview?placeid=ChIJN1t_tDeuEmsRUsoyG83frY4')).toBe('ChIJN1t_tDeuEmsRUsoyG83frY4');
  expect(parsePlaceId('ChIJN1t_tDeuEmsRUsoyG83frY4')).toBe('ChIJN1t_tDeuEmsRUsoyG83frY4');
  // A link with no place in it is no Place ID.
  expect(parsePlaceId('https://www.google.com/maps/@10.73,106.70,17z')).toBeNull();
});

test('a short share link is opened hop by hop, only on Google, and read where it lands', async () => {
  const hops: string[] = [];
  const fake = (to: Record<string, string>) => (async (url: string | URL | Request) => {
    hops.push(String(url));
    const next = to[String(url)];
    return new Response(null, { status: next ? 302 : 200, headers: next ? { location: next } : {} });
  }) as typeof fetch;
  expect(await placeIdFromLink('https://maps.app.goo.gl/abc123', fake({ 'https://maps.app.goo.gl/abc123': ORENCHI }))).toBe('ChIJvele0CAvdTER6wsJuWGus5I');
  // A full link needs no request at all.
  hops.length = 0;
  expect(await placeIdFromLink(ORENCHI, fake({}))).toBe('ChIJvele0CAvdTER6wsJuWGus5I');
  expect(hops).toEqual([]);
  // Sent off Google: not followed.
  expect(await placeIdFromLink('https://maps.app.goo.gl/x1', fake({ 'https://maps.app.goo.gl/x1': 'https://example.com/?0x1:0x2' }))).toBeNull();
  // Not a Maps link, or a network failure: null, the owner pastes the ID by hand.
  expect(await placeIdFromLink('https://example.com/maps', fake({}))).toBeNull();
  expect(await placeIdFromLink('https://maps.app.goo.gl/x2', (async () => { throw new Error('offline'); }) as typeof fetch)).toBeNull();
});
