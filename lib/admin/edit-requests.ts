import type { Pool } from 'pg';
import { transaction } from '../owner/auth';
import { recordAdminAction } from './audit';
import { AdminError } from './auth';

/**
 * Trang chờ admin sửa (lib/owner/edit-requests.ts): what /gov lists, oldest first. Tài reads the shop's words, collects its
 * files over Zalo and hands both to the agent, who publishes the edit with scripts/sua-trang.mjs; that closes the request.
 * "Đã xong" here closes one by hand (the shop changed its mind, or the edit was done another way).
 */
export type EditRequestRow = { id: string; shop_slug: string; shop_name: string; page_slug: string; page_label: string | null; page_state: string;
  message: string | null; created_at: string; owner_handle: string; owner_email: string | null };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export class EditRequests {
  constructor(private pool: Pool) {}
  async open(): Promise<EditRequestRow[]> {
    return (await this.pool.query(`SELECT e.id,s.slug shop_slug,s.name shop_name,p.slug page_slug,p.label page_label,p.state page_state,e.message,e.created_at,
        i.username owner_handle,i.email owner_email
      FROM edit_requests e JOIN shops s ON s.id=e.shop_id JOIN pages p ON p.shop_id=e.shop_id AND p.id=e.page_id JOIN owner_identities_v2 i ON i.id=e.requested_by
      WHERE e.handled_at IS NULL ORDER BY e.created_at,e.id`)).rows;
  }
  async done(adminId: string, id: unknown) {
    if (typeof id !== 'string' || !UUID.test(id)) throw new AdminError(400, 'INVALID_INPUT');
    return transaction(this.pool, async db => {
      const row = (await db.query(`UPDATE edit_requests SET handled_at=clock_timestamp(),handled_by=$2 WHERE id=$1 AND handled_at IS NULL RETURNING shop_id,page_id`,
        [id, `admin:${adminId}`])).rows[0];
      if (!row) throw new AdminError(409, 'REQUEST_ALREADY_HANDLED');
      await recordAdminAction(db, adminId, { action: 'page.edit_request.done', shopId: row.shop_id, detail: { request: id, page: row.page_id } });
      return { done: true };
    });
  }
}
