import type { PoolClient } from 'pg';
import { parseProfile, readProfile, type ShopProfile } from '../shop/profile';
import { parsePlaceId, reviewLink } from '../google/place-id';
import { googleUrlProblem, assertPublishable } from '../publishing/policy';
import { PublishingError, validateConfig } from '../publishing/config';
import { shownConfig } from '../publishing/repository';
import { placeholderLinks } from '../canvas/slots';
import { recordAdminAction } from './audit';

/**
 * Thông tin quán as the administrator sets it (Tài 06/10): its name, its details (lib/shop/profile.ts) and its Place ID, from what
 * the shop sent over Zalo. The details show on every page of the shop the moment they are saved, so every page already live is
 * checked first as its guests would see it with them -- the Google rules, the words, no sample link -- and a change that would
 * break one is refused, naming the page.
 */
export class ShopDetailsError extends Error { constructor(public readonly code: string, public readonly at = '') { super(at ? `${code} (${at})` : code); } }
export type ShopDetailsInput = { name?: unknown; profile?: unknown; placeId?: unknown };

export async function saveShopDetails(db: PoolClient, adminId: string, shopId: string, input: ShopDetailsInput) {
  const shop = (await db.query('SELECT name,profile,place_id,google_url,is_template FROM shops WHERE id=$1 FOR UPDATE', [shopId])).rows[0];
  if (!shop) throw new ShopDetailsError('SHOP_NOT_FOUND');
  let name = shop.name as string;
  if (input.name !== undefined && input.name !== null) {
    if (typeof input.name !== 'string' || !input.name.trim() || input.name.trim().length > 100 || /[\u0000-\u001f\u007f<>]/.test(input.name)) throw new ShopDetailsError('INVALID_NAME');
    name = input.name.trim();
  }
  let profile: ShopProfile = readProfile(shop.profile);
  if (input.profile !== undefined && input.profile !== null) {
    try { profile = parseProfile(input.profile); } catch (error) { throw new ShopDetailsError('INVALID_PROFILE', error instanceof Error && 'at' in error ? String(error.at) : ''); }
  }
  let place = { id: shop.place_id as string | null, url: shop.google_url as string | null };
  if (input.placeId !== undefined && input.placeId !== null && input.placeId !== '') {
    const id = parsePlaceId(input.placeId);
    if (!id || googleUrlProblem(reviewLink(id))) throw new ShopDetailsError('INVALID_PLACE_ID');
    place = { id, url: reviewLink(id) };
  }
  // Every page guests can open today, with the new details in its places.
  const live = (await db.query(`SELECT p.slug,r.config_snapshot FROM pages p JOIN page_releases r ON r.id=p.active_release_id
    WHERE p.shop_id=$1 AND p.state<>'closed'`, [shopId])).rows;
  for (const page of live) {
    const shown = shownConfig(validateConfig(page.config_snapshot), { name, profile, is_template: shop.is_template });
    try { assertPublishable(shown); } catch (error) { throw new ShopDetailsError(error instanceof PublishingError ? error.code : 'INVALID_CONFIG', page.slug); }
    if (!shop.is_template && placeholderLinks(shown.doc).length) throw new ShopDetailsError('PAGE_NOT_SYNCED', page.slug);
  }
  const changed = [name !== shop.name && 'name', JSON.stringify(profile) !== JSON.stringify(readProfile(shop.profile)) && 'profile',
    place.id !== shop.place_id && 'place'].filter(Boolean) as string[];
  if (!changed.length) return { changed };
  await db.query('UPDATE shops SET name=$2,profile=$3,place_id=$4,google_url=$5 WHERE id=$1', [shopId, name, JSON.stringify(profile), place.id, place.url]);
  await recordAdminAction(db, adminId, { action: 'shop.details', shopId, detail: { changed } });
  return { changed };
}
