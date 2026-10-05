import type { Pool } from 'pg';
import { transaction } from '../owner/auth';
import { recordAdminAction } from './audit';
import { AdminError } from './auth';

/**
 * "Nhờ admin tạo giúp" (kịch bản mục 8): a shop asked from Library → More. Tài sees the open requests here, opens the
 * shop (impersonation with the owner's support switch, as for any help), and marks the request done.
 */
export type HelpRow = { id: string; shop_id: string; slug: string; shop_name: string; username: string; email: string | null; message: string | null; created_at: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export class HelpRequests {
  constructor(private pool: Pool) {}
  async open(): Promise<HelpRow[]> {
    return (await this.pool.query(`SELECT h.id,h.shop_id,s.slug,s.name shop_name,i.username,i.email,h.message,h.created_at FROM help_requests h
      JOIN shops s ON s.id=h.shop_id JOIN owner_identities_v2 i ON i.id=h.requested_by WHERE h.handled_at IS NULL ORDER BY h.created_at`)).rows;
  }
  async done(adminId: string, id: unknown) {
    if (typeof id !== 'string' || !UUID.test(id)) throw new AdminError(400, 'INVALID_INPUT');
    return transaction(this.pool, async db => {
      const row = (await db.query('UPDATE help_requests SET handled_at=clock_timestamp(),handled_by=$2 WHERE id=$1 AND handled_at IS NULL RETURNING shop_id', [id, adminId])).rows[0];
      if (!row) throw new AdminError(409, 'HELP_ALREADY_HANDLED');
      await recordAdminAction(db, adminId, { action: 'help.done', shopId: row.shop_id, detail: { request: id } });
      return { done: true };
    });
  }
}
