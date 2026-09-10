import 'server-only';
import { database } from './db';
import { HttpError } from './http';
export type Shop = { id: string; slug: string; name: string; google_url: string | null; hero_key: string | null; hero_kind: 'image' | 'video' | null };
export async function shopBySlug(slug: string): Promise<Shop> {
  if (!/^[A-Za-z0-9][A-Za-z0-9-]{0,62}$/.test(slug) || ['api','zzz','t','demo'].includes(slug.toLowerCase())) throw new HttpError(404,'SHOP_NOT_FOUND');
  const { rows } = await database().query<Shop>('SELECT id,slug,name,google_url,hero_key,hero_kind FROM shops WHERE slug=$1',[slug]);
  if (!rows[0]) throw new HttpError(404,'SHOP_NOT_FOUND'); return rows[0];
}
export function mediaUrl(key: string | null): string | null {
  const base = process.env.MEDIA_PUBLIC_ORIGIN;
  if (!base || !key || key.split('/').some(p => !p || p === '.' || p === '..')) return null;
  const url = new URL(base); if (url.protocol !== 'https:') return null;
  return `${url.origin}/${key.split('/').map(encodeURIComponent).join('/')}`;
}
export function publicLink(value: string | null) {
  try { const url = new URL(value ?? ''); return url.protocol === 'https:' ? url.href : null; } catch { return null; }
}
