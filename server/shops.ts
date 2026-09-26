import 'server-only';
import { database } from './db';
import { HttpError } from './http';
/** A shop by its link, for the guest page when publishing is off (the v2 visit gate only). */
export type Shop = { id: string; slug: string; name: string; google_url: string | null };
export async function shopBySlug(slug: string): Promise<Shop> {
  if (!/^[A-Za-z0-9][A-Za-z0-9-]{0,62}$/.test(slug) || ['api','zzz','t','demo'].includes(slug.toLowerCase())) throw new HttpError(404,'SHOP_NOT_FOUND');
  const { rows } = await database().query<Shop>('SELECT id,slug,name,google_url FROM shops WHERE slug=$1',[slug]);
  if (!rows[0]) throw new HttpError(404,'SHOP_NOT_FOUND'); return rows[0];
}
export function publicLink(value: string | null) {
  try { const url = new URL(value ?? ''); return url.protocol === 'https:' ? url.href : null; } catch { return null; }
}
