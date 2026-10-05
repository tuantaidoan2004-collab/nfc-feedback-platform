import type { Pool } from 'pg';
import { PublishingAdmin } from '../lib/publishing/repository';
import { DEFAULT_TEMPLATE, pageFromTemplate } from '../lib/canvas/templates';

/**
 * The public suites' two shops, each with a page published at the shop's own link (lát A3b). The guest page has one
 * path since then -- the published one, bound by its render proof -- so these suites run on it exactly as a card does.
 * Idempotent: a shop that already has a page is left alone, so it costs nothing on the second test.
 */
export async function publishedShops(db: Pool) {
  const bare = (await db.query<{ id: string; slug: string; name: string; google_url: string | null }>(
    "SELECT s.id, s.slug, s.name, s.google_url FROM shops s WHERE s.slug IN ('one', 'two') AND NOT EXISTS (SELECT 1 FROM pages p WHERE p.shop_id = s.id)")).rows;
  if (!bare.length) return;
  const admin = new PublishingAdmin(db, async () => ({ actorId: 'local-fixture-only' }));
  const existing = (await db.query<{ id: string }>("SELECT id FROM template_versions WHERE template_key='neutral' AND version=1")).rows[0]?.id;
  const template = existing ?? await admin.createTemplate('neutral', 1);
  for (const shop of bare) {
    // A canvas page from the default template; the Google button takes the shop's own link (shops.google_url).
    const page = await admin.createPage(shop.id, template, pageFromTemplate(DEFAULT_TEMPLATE, shop.name), shop.slug);
    await admin.publish(page, 1);
  }
}
