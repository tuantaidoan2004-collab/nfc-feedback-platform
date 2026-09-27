import type { Pool } from 'pg';
import { transaction } from '../owner/auth';
import { recordAdminAction } from './audit';
import { AdminError } from './auth';

/**
 * The operator's half of the text gate (migration 030, lát M2b): a shop's own thank-you line reaches guests only once it
 * is approved here, like an image (media-review.ts). A decision is final for those words; the shop changes the words to
 * send them again.
 */
export type TextForReview = { id: string; shop_id: string; slug: string; shop_name: string; kind: 'thanks'; text_vi: string; text_en: string;
  submitted_by: string; created_at: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const printable = (value: string) => ![...value].some(character => (character.codePointAt(0) ?? 0) < 32 || '<>'.includes(character));

export class TextReview {
  constructor(private pool: Pool) {}

  async pending(limit = 100): Promise<TextForReview[]> {
    return (await this.pool.query(`SELECT t.id,t.shop_id,s.slug,s.name shop_name,t.kind,t.text_vi,t.text_en,t.submitted_by,t.created_at
      FROM text_reviews t JOIN shops s ON s.id=t.shop_id WHERE t.state='pending' ORDER BY t.created_at,t.id LIMIT $1`, [limit])).rows;
  }

  /** Approve, or refuse with a reason the shop reads beside the box. The decision and its audit row commit together. */
  async decide(adminId: string, id: unknown, body: unknown) {
    if (typeof id !== 'string' || !UUID.test(id)) throw new AdminError(400, 'INVALID_INPUT');
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new AdminError(400, 'INVALID_INPUT');
    const { decision, reason } = body as Record<string, unknown>;
    const keys = Object.keys(body).sort().join();
    if (decision === 'approve' ? keys !== 'decision' : decision === 'reject' ? keys !== 'decision,reason' : true) throw new AdminError(400, 'INVALID_INPUT');
    const why = decision === 'reject' && typeof reason === 'string' ? reason.trim() : null;
    if (decision === 'reject' && (!why || why.length > 300 || !printable(why))) throw new AdminError(400, 'REASON_REQUIRED');
    return transaction(this.pool, async db => {
      const row = (await db.query('SELECT shop_id,kind,text_vi,text_en,state FROM text_reviews WHERE id=$1 FOR UPDATE', [id])).rows[0];
      if (!row) throw new AdminError(404, 'TEXT_NOT_FOUND');
      if (row.state !== 'pending') throw new AdminError(409, 'TEXT_ALREADY_REVIEWED');
      const state = decision === 'approve' ? 'approved' : 'rejected';
      await db.query('UPDATE text_reviews SET state=$2,reason=$3,reviewed_by=$4,reviewed_at=clock_timestamp() WHERE id=$1', [id, state, why, adminId]);
      await recordAdminAction(db, adminId, { action: `text.${decision}`, shopId: row.shop_id,
        detail: { text: id, kind: row.kind, vi: row.text_vi, en: row.text_en, ...(why ? { reason: why } : {}) } });
      return { id, state };
    });
  }
}
