import type { PoolClient, Pool } from 'pg';
import { OwnerError } from './auth';
import type { PageRef } from '../publishing/repository';

/**
 * Which page of the shop a dashboard request is about (migration 024, `docs/goi-va-trang.md`). Named by its link;
 * absent means the shop's first page, which is every shop's only page until the page list (lát P3) lets a shop make
 * more. A page of another shop is never found: the lookup names the shop the caller was authorized for.
 */
export async function pageOf(db: PoolClient | Pool, shopId: string, slug?: string | null): Promise<PageRef & { slug: string }> {
  if (slug !== undefined && slug !== null && !/^[A-Za-z0-9][A-Za-z0-9-]{0,62}$/.test(slug)) throw new OwnerError(404, 'PAGE_NOT_FOUND');
  const row = (await db.query(`SELECT id,slug FROM pages WHERE shop_id=$1 AND ($2::text IS NULL OR lower(slug)=lower($2))
    ORDER BY created_at,id LIMIT 1`, [shopId, slug ?? null])).rows[0];
  if (!row) throw new OwnerError(404, 'PAGE_NOT_FOUND');
  return { shopId, pageId: row.id, slug: row.slug };
}
