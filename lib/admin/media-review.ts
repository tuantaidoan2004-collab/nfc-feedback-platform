import type { Pool } from 'pg';
import { transaction } from '../owner/auth';
import { recordAdminAction } from './audit';
import { AdminError } from './auth';

/**
 * The operator's half of the image gate (migration 023, `docs/thiet-ke-va-template.md` mục 10). Shops upload; nothing
 * they upload reaches a guest page until it is approved here. A decision is final for that upload: to change a refused
 * image the shop uploads a new one, which queues again.
 */
export type MediaForReview = {
  id: string; shop_id: string; slug: string; shop_name: string; url: string; kind: 'image' | 'video';
  content_type: string | null; size_bytes: number | null; uploaded_by: string; created_at: string;
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const printable = (value: string) => ![...value].some(character => (character.codePointAt(0) ?? 0) < 32 || '<>'.includes(character));

export class MediaReview {
  constructor(private pool: Pool) {}

  /** Oldest first, so nothing waits behind newer uploads. */
  async pending(limit = 100): Promise<MediaForReview[]> {
    return (await this.pool.query(`SELECT m.id,m.shop_id,s.slug,s.name shop_name,m.url,m.kind,m.content_type,m.size_bytes,m.uploaded_by,m.created_at
      FROM media_assets m JOIN shops s ON s.id=m.shop_id WHERE m.state='pending' ORDER BY m.created_at,m.id LIMIT $1`, [limit])).rows;
  }

  /** Approve, or refuse with a reason the shop will read. The decision and its audit row commit together. */
  async decide(adminId: string, id: unknown, body: unknown) {
    if (typeof id !== 'string' || !UUID.test(id)) throw new AdminError(400, 'INVALID_INPUT');
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new AdminError(400, 'INVALID_INPUT');
    const { decision, reason } = body as Record<string, unknown>;
    const keys = Object.keys(body).sort().join();
    if (decision === 'approve' ? keys !== 'decision' : decision === 'reject' ? keys !== 'decision,reason' : true) throw new AdminError(400, 'INVALID_INPUT');
    const why = decision === 'reject' && typeof reason === 'string' ? reason.trim() : null;
    if (decision === 'reject' && (!why || why.length > 300 || !printable(why))) throw new AdminError(400, 'REASON_REQUIRED');
    return transaction(this.pool, async db => {
      const row = (await db.query('SELECT shop_id,url,state FROM media_assets WHERE id=$1 FOR UPDATE', [id])).rows[0];
      if (!row) throw new AdminError(404, 'MEDIA_NOT_FOUND');
      if (row.state !== 'pending') throw new AdminError(409, 'MEDIA_ALREADY_REVIEWED');
      const state = decision === 'approve' ? 'approved' : 'rejected';
      await db.query('UPDATE media_assets SET state=$2,reason=$3,reviewed_by=$4,reviewed_at=clock_timestamp() WHERE id=$1', [id, state, why, adminId]);
      await recordAdminAction(db, adminId, { action: `media.${decision}`, shopId: row.shop_id, detail: { media: id, url: row.url, ...(why ? { reason: why } : {}) } });
      return { id, state };
    });
  }
}
