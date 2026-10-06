import type { Pool } from 'pg';
import { transaction } from '../owner/auth';
import { canvasTemplate } from '../canvas/templates';
import { recordAdminAction } from './audit';
import { AdminError } from './auth';

/**
 * Trang chờ Admin Tài dựng (lib/owner/edit-requests.ts), oldest first: the shop, the template it picked, what it wrote, and the
 * Zalo number to message. Tài messages the shop ("Đã nhắn Zalo" tells the owner someone is on it), gathers its details and
 * files, and hands them to the agent, whose publish closes the request (scripts/sua-trang.mjs). "Đóng" closes one by hand: the
 * shop changed its mind, or the page was done another way.
 */
export type EditRequestRow = { id: string; shop_slug: string; shop_name: string; page_id: string; page_slug: string; page_label: string | null; page_state: string;
  template_key: string | null; template_name: string | null; contact: string; message: string | null; created_at: string; contacted_at: string | null;
  owner_handle: string; owner_email: string | null;
  /** A shop that signed itself up and has not paid the 10k (kịch bản mục 3b): Admin Tài builds its page once it has. */
  awaiting_activation: boolean };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export class EditRequests {
  constructor(private pool: Pool) {}
  async open(): Promise<EditRequestRow[]> {
    const rows = (await this.pool.query(`SELECT e.id,s.slug shop_slug,s.name shop_name,p.id page_id,p.slug page_slug,p.label page_label,p.state page_state,
        e.template_key,e.contact,e.message,e.created_at,e.contacted_at,i.username owner_handle,i.email owner_email,
        (s.self_signup AND s.activated_at IS NULL AND s.paid_until IS NULL) awaiting_activation
      FROM edit_requests e JOIN shops s ON s.id=e.shop_id JOIN pages p ON p.shop_id=e.shop_id AND p.id=e.page_id JOIN owner_identities_v2 i ON i.id=e.requested_by
      WHERE e.handled_at IS NULL ORDER BY e.created_at,e.id`)).rows;
    return rows.map(row => ({ ...row, template_name: row.template_key ? canvasTemplate(row.template_key)?.name ?? row.template_key : null }));
  }
  /** `{ action: 'contacted' }`: Tài has messaged the shop. `{ action: 'done' }`: closed without publishing. */
  async act(adminId: string, id: unknown, body: unknown) {
    if (typeof id !== 'string' || !UUID.test(id)) throw new AdminError(400, 'INVALID_INPUT');
    const action = body && typeof body === 'object' && !Array.isArray(body) && Object.keys(body).join() === 'action' ? (body as { action: unknown }).action : null;
    if (action !== 'contacted' && action !== 'done') throw new AdminError(400, 'INVALID_INPUT');
    return transaction(this.pool, async db => {
      const row = action === 'contacted'
        ? (await db.query('UPDATE edit_requests SET contacted_at=COALESCE(contacted_at,clock_timestamp()) WHERE id=$1 AND handled_at IS NULL RETURNING shop_id,page_id', [id])).rows[0]
        : (await db.query(`UPDATE edit_requests SET handled_at=clock_timestamp(),handled_by=$2,outcome='closed' WHERE id=$1 AND handled_at IS NULL RETURNING shop_id,page_id`,
          [id, `admin:${adminId}`])).rows[0];
      if (!row) throw new AdminError(409, 'REQUEST_ALREADY_HANDLED');
      await recordAdminAction(db, adminId, { action: action === 'contacted' ? 'page.edit_request.contacted' : 'page.edit_request.done', shopId: row.shop_id,
        detail: { request: id, page: row.page_id } });
      return { id, action };
    });
  }
  /** The draft of a page waiting for Tài, for /gov/xem: only while it waits, so /gov is not a window onto every draft. */
  async draft(pageId: unknown) {
    if (typeof pageId !== 'string' || !UUID.test(pageId)) return null;
    return (await this.pool.query(`SELECT d.config,s.name,s.profile,s.is_template,s.google_url,p.slug FROM edit_requests e JOIN page_drafts d ON d.shop_id=e.shop_id AND d.page_id=e.page_id
      JOIN pages p ON p.id=e.page_id JOIN shops s ON s.id=e.shop_id WHERE e.page_id=$1 AND e.handled_at IS NULL`, [pageId])).rows[0] as
      { config: unknown; name: string; profile: unknown; is_template: boolean; google_url: string | null; slug: string } | undefined ?? null;
  }
}
