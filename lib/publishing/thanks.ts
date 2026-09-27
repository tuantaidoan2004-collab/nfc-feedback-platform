import type { PoolClient } from 'pg';
import { PublishingError, type Localized, type PageConfig } from './config';

/**
 * The shop's own thank-you line (lát M2b; docs/ui-ux-nguon-tham-khao.md ý 3, Tài 27/09: the shop edits it, an
 * administrator approves it). It replaces only the card's first line; the sentence that says Google opens in a new tab is
 * the platform's, because it has to stay true.
 *
 * The gate works like the image gate (media-gate.ts, migration 023): saving a draft with new words queues them, and a
 * page publishes only when those exact words, in both languages, are approved for this shop or for the template shop a
 * new shop is cloned from. Checked where a shop publishes, never where a page is read: the live page keeps its line.
 */
export const DEFAULT_THANKS: Localized = { vi: 'Cảm ơn quý khách đã ghé!', en: 'Thank you for stopping by!' };

/** The line a page asks for, or null when it uses the platform's (absent, or written exactly as the default). */
export function ownThanks(config: PageConfig): Localized | null {
  const line = config.thanks;
  if (!line || (line.vi === DEFAULT_THANKS.vi && line.en === DEFAULT_THANKS.en)) return null;
  return line;
}

/** Queues the page's own line for review; words already queued or decided for this shop are left as they are. */
export async function queueThanks(db: PoolClient, shopId: string, config: PageConfig, by: string) {
  const line = ownThanks(config); if (!line) return;
  await db.query(`INSERT INTO text_reviews(shop_id,kind,text_vi,text_en,submitted_by)VALUES($1,'thanks',$2,$3,$4)
    ON CONFLICT(shop_id,kind,text_vi,text_en) DO NOTHING`, [shopId, line.vi, line.en, by]);
}

/** Where the page's own line stands for this shop: what the editor shows beside the box. Null when it uses the default. */
export async function thanksReview(db: { query: PoolClient['query'] }, shopId: string, config: PageConfig) {
  const line = ownThanks(config); if (!line) return null;
  const row = (await db.query(`SELECT state,reason FROM text_reviews WHERE kind='thanks' AND text_vi=$2 AND text_en=$3
    AND (shop_id=$1 OR shop_id IN (SELECT id FROM shops WHERE is_template)) ORDER BY state='approved' DESC,created_at DESC LIMIT 1`,
    [shopId, line.vi, line.en])).rows[0] as { state: 'pending' | 'approved' | 'rejected'; reason: string | null } | undefined;
  return row ?? { state: 'unsent' as const, reason: null };
}

/** Throws unless the page's own line, if it has one, is approved. Three answers, as for images: each asks something else. */
export async function assertThanksApproved(db: PoolClient, shopId: string, config: PageConfig) {
  const review = await thanksReview(db, shopId, config); if (!review) return;
  if (review.state === 'approved') return;
  throw new PublishingError(review.state === 'rejected' ? 'THANKS_REJECTED' : review.state === 'pending' ? 'THANKS_PENDING' : 'THANKS_UNKNOWN');
}
