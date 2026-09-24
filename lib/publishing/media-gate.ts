import type { PoolClient } from 'pg';
import { PublishingError, type PageConfig } from './config';

/**
 * Cửa duyệt ảnh (migration 023, `docs/thiet-ke-va-khuon.md` mục 10): every picture or video a page shows must be an
 * approved asset before the page can be published. Checked where a shop publishes, never where a page is read: a page
 * already live stays live while its next image waits.
 *
 * Built-in media (`/media/…`, shipped inside the app) is the platform's own and needs no review.
 */
export function mediaUrls(config: PageConfig): string[] {
  const found = [config.poster?.url, config.poster?.still, config.logo?.url,
    config.background.kind === 'media' ? config.background.media.url : undefined,
    config.background.kind === 'media' ? config.background.media.still : undefined];
  return [...new Set(found.filter((url): url is string => typeof url === 'string' && url.startsWith('https://')))];
}

/**
 * An asset counts when it belongs to this shop or to the template shop (a new shop starts from the template's page,
 * images included). The answer names the worst problem, so the shop knows what to do: a refused image must be
 * replaced, a waiting one only needs time, and an address that never came through an upload is not allowed at all.
 */
export async function assertMediaApproved(db: PoolClient, shopId: string, config: PageConfig) {
  const urls = mediaUrls(config); if (!urls.length) return;
  const rows = (await db.query(`SELECT url,state FROM media_assets WHERE url = ANY($1)
    AND (shop_id=$2 OR shop_id IN (SELECT id FROM shops WHERE is_template))`, [urls, shopId])).rows as { url: string; state: string }[];
  const state = new Map(rows.map(row => [row.url, row.state]));
  if (urls.some(url => state.get(url) === 'rejected')) throw new PublishingError('MEDIA_REJECTED');
  if (urls.some(url => !state.has(url))) throw new PublishingError('MEDIA_UNKNOWN');
  if (urls.some(url => state.get(url) === 'pending')) throw new PublishingError('MEDIA_PENDING');
}
