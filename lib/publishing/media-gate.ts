import type { PoolClient } from 'pg';
import { PublishingError, type PageConfig } from './config';
import { mediaOf } from '../canvas/layout';

/**
 * Cửa duyệt ảnh (migration 023, `docs/thiet-ke-va-template.md` mục 10): every picture or video a page shows must be an
 * approved asset before the page can be published. Checked where a shop publishes, never where a page is read: a page
 * already live stays live while its next image waits.
 *
 * Built-in pictures (`art:…` illustrations, `/tpl/…` files shipped with the app) are the platform's own and need no review.
 */
export const mediaUrls = (config: PageConfig): string[] => mediaOf(config.doc);

/**
 * An asset counts when it belongs to this shop: a page starts from a template's drawings, never from another shop's
 * uploads. The answer names the worst problem, so the shop knows what to do: a refused image must be replaced, a waiting
 * one only needs time, and an address that never came through an upload is not allowed at all.
 */
export async function assertMediaApproved(db: PoolClient, shopId: string, config: PageConfig) {
  const urls = mediaUrls(config); if (!urls.length) return;
  const rows = (await db.query('SELECT url,state FROM media_assets WHERE url = ANY($1) AND shop_id=$2', [urls, shopId])).rows as { url: string; state: string }[];
  const state = new Map(rows.map(row => [row.url, row.state]));
  if (urls.some(url => state.get(url) === 'rejected')) throw new PublishingError('MEDIA_REJECTED');
  if (urls.some(url => !state.has(url))) throw new PublishingError('MEDIA_UNKNOWN');
  if (urls.some(url => state.get(url) === 'pending')) throw new PublishingError('MEDIA_PENDING');
}
