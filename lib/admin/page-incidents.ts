import type { Pool } from 'pg';
import { transaction } from '../owner/auth';
import { PublishingAdmin, PublishingError } from '../publishing/repository';
import { recordAdminAction } from './audit';
import { AdminError } from './auth';

/**
 * The operator's side of the page lifecycle (lát P4, migration 026, `docs/goi-va-trang.md` mục 5): the emergency stops
 * owners report, and the page actions only an administrator takes -- pause, resume whatever the reason, close for good.
 * How a shop is compensated for an emergency is not decided yet (Tài, 25/09); the resolution note records what was done.
 */
export type IncidentForReview = {
  id: string; shop_id: string; shop_slug: string; shop_name: string; page_id: string; page_slug: string; page_label: string;
  page_state: string; pause_reason: string | null; reason: string; created_at: string;
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const note = (value: unknown) => {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text || text.length > 1000 || /[<>]/.test(text)) throw new AdminError(400, 'NOTE_REQUIRED');
  return text;
};
const refused = (error: unknown): never => {
  if (error instanceof PublishingError && ['PAGE_CLOSED', 'PAGE_NOT_LIVE', 'PAGE_NOT_PAUSED', 'PAGE_NOT_FOUND'].includes(error.code))
    throw new AdminError(error.code === 'PAGE_NOT_FOUND' ? 404 : 409, error.code);
  throw error;
};

export class PageIncidents {
  constructor(private pool: Pool) {}

  /** Oldest first, so no report waits behind newer ones. */
  async open(limit = 100): Promise<IncidentForReview[]> {
    return (await this.pool.query(`SELECT i.id,i.shop_id,s.slug shop_slug,s.name shop_name,i.page_id,p.slug page_slug,p.label page_label,
        p.state page_state,p.pause_reason,i.reason,i.created_at FROM page_incidents i JOIN shops s ON s.id=i.shop_id JOIN pages p ON p.id=i.page_id
      WHERE i.state='open' ORDER BY i.created_at,i.id LIMIT $1`, [limit])).rows;
  }

  /** Marks a report handled, with what was done about it. The page itself is left as it is. */
  async resolve(adminId: string, id: unknown, body: unknown) {
    if (typeof id !== 'string' || !UUID.test(id)) throw new AdminError(400, 'INVALID_INPUT');
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).join() !== 'resolution') throw new AdminError(400, 'INVALID_INPUT');
    const resolution = note((body as Record<string, unknown>).resolution);
    return transaction(this.pool, async db => {
      const row = (await db.query('SELECT shop_id,page_id,state FROM page_incidents WHERE id=$1 FOR UPDATE', [id])).rows[0];
      if (!row) throw new AdminError(404, 'INCIDENT_NOT_FOUND');
      if (row.state !== 'open') throw new AdminError(409, 'INCIDENT_ALREADY_RESOLVED');
      await db.query("UPDATE page_incidents SET state='resolved',resolved_by=$2,resolved_at=clock_timestamp(),resolution=$3 WHERE id=$1", [id, adminId, resolution]);
      await recordAdminAction(db, adminId, { action: 'page.incident.resolve', shopId: row.shop_id, detail: { incident: id, page: row.page_id, resolution } });
      return { id, state: 'resolved' as const };
    });
  }

  /** `pause` (reason: admin), `resume` (any reason), `close` (for good). Each commits with its audit row. */
  async act(adminId: string, pageId: unknown, body: unknown) {
    if (typeof pageId !== 'string' || !UUID.test(pageId)) throw new AdminError(400, 'INVALID_INPUT');
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).join() !== 'action') throw new AdminError(400, 'INVALID_INPUT');
    const action = (body as Record<string, unknown>).action;
    if (action !== 'pause' && action !== 'resume' && action !== 'close') throw new AdminError(400, 'INVALID_INPUT');
    return transaction(this.pool, async db => {
      const row = (await db.query('SELECT shop_id,slug FROM pages WHERE id=$1', [pageId])).rows[0];
      if (!row) throw new AdminError(404, 'PAGE_NOT_FOUND');
      const page = { shopId: row.shop_id as string, pageId }, admin = new PublishingAdmin(db, async () => ({ actorId: `admin:${adminId}` }));
      if (action === 'pause') await admin.pausePage(page, 'admin').catch(refused);
      else if (action === 'resume') await admin.resumePage(page, ['emergency', 'admin', 'billing']).catch(refused);
      else await admin.closePage(page).catch(refused);
      await recordAdminAction(db, adminId, { action: `page.${action}`, shopId: page.shopId, detail: { page: pageId, slug: row.slug } });
      return { page: pageId, action };
    });
  }
}
