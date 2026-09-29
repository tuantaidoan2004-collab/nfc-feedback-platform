import type { Pool } from 'pg';
import { transaction } from '../owner/auth';
import { recordAdminAction } from './audit';
import { AdminError } from './auth';
import { UPLOAD_SETTLE_SECONDS } from '../owner/media';
import { removeObject, storageSettings, uploadKey } from '../media/storage';

/**
 * The operator's half of the image gate (migration 023, `docs/thiet-ke-va-template.md` mục 10). Shops upload; nothing
 * they upload reaches a guest page until it is approved here. A decision is final for that upload: to change a refused
 * image the shop uploads a new one, which queues again.
 */
export type MediaForReview = {
  id: string; shop_id: string; slug: string; shop_name: string; url: string; kind: 'image' | 'video';
  content_type: string | null; size_bytes: number | null; uploaded_by: string; created_at: string;
  /** From when it can be decided (UPLOAD_SETTLE_SECONDS); `uploading` until then, by the database's clock. */
  ready_at: string; uploading: boolean;
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** Removes a refused upload's file; false when there is nothing here to remove (no store, or not an upload of this app). */
export type RemoveUpload = (url: string) => Promise<boolean>;
export const storeRemover = (settings = storageSettings()): RemoveUpload => async url => {
  const key = settings && uploadKey(settings, url);
  return settings && key ? removeObject(settings, key) : false;
};
const printable = (value: string) => ![...value].some(character => (character.codePointAt(0) ?? 0) < 32 || '<>'.includes(character));

export class MediaReview {
  constructor(private pool: Pool, private remove: RemoveUpload = storeRemover()) {}

  /** Oldest first, so nothing waits behind newer uploads. */
  async pending(limit = 100): Promise<MediaForReview[]> {
    return (await this.pool.query(`SELECT m.id,m.shop_id,s.slug,s.name shop_name,m.url,m.kind,m.content_type,m.size_bytes,m.uploaded_by,m.created_at,
      m.created_at+$2*interval '1 second' ready_at,m.created_at>clock_timestamp()-$2*interval '1 second' uploading
      FROM media_assets m JOIN shops s ON s.id=m.shop_id WHERE m.state='pending' ORDER BY m.created_at,m.id LIMIT $1`, [limit, UPLOAD_SETTLE_SECONDS])).rows;
  }

  /**
   * Approve, or refuse with a reason the shop will read. The decision and its audit row commit together. Neither is taken
   * while the upload link still works: the file could still change (UPLOAD_SETTLE_SECONDS). A refused file is then removed
   * from the store (rà bảo mật 29/09, C3b-2): a refusal is final, and nothing refused stays readable at its public address.
   */
  async decide(adminId: string, id: unknown, body: unknown) {
    if (typeof id !== 'string' || !UUID.test(id)) throw new AdminError(400, 'INVALID_INPUT');
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new AdminError(400, 'INVALID_INPUT');
    const { decision, reason } = body as Record<string, unknown>;
    const keys = Object.keys(body).sort().join();
    if (decision === 'approve' ? keys !== 'decision' : decision === 'reject' ? keys !== 'decision,reason' : true) throw new AdminError(400, 'INVALID_INPUT');
    const why = decision === 'reject' && typeof reason === 'string' ? reason.trim() : null;
    if (decision === 'reject' && (!why || why.length > 300 || !printable(why))) throw new AdminError(400, 'REASON_REQUIRED');
    const decided = await transaction(this.pool, async db => {
      const row = (await db.query(`SELECT shop_id,url,state,created_at>clock_timestamp()-$2*interval '1 second' uploading FROM media_assets WHERE id=$1 FOR UPDATE`,
        [id, UPLOAD_SETTLE_SECONDS])).rows[0];
      if (!row) throw new AdminError(404, 'MEDIA_NOT_FOUND');
      if (row.state !== 'pending') throw new AdminError(409, 'MEDIA_ALREADY_REVIEWED');
      if (row.uploading) throw new AdminError(409, 'MEDIA_STILL_UPLOADING');
      const state = decision === 'approve' ? 'approved' : 'rejected';
      await db.query('UPDATE media_assets SET state=$2,reason=$3,reviewed_by=$4,reviewed_at=clock_timestamp() WHERE id=$1', [id, state, why, adminId]);
      await recordAdminAction(db, adminId, { action: `media.${decision}`, shopId: row.shop_id, detail: { media: id, url: row.url, ...(why ? { reason: why } : {}) } });
      return { id, state, url: row.url as string };
    });
    // After the commit, and never undoing it: a store that is down leaves the refusal standing and a line in the log.
    let removed = false;
    if (decided.state === 'rejected') {
      try { removed = await this.remove(decided.url); }
      // The cause is the store's status (STORE_403) or the fetch's own message; neither carries the signed address.
      catch (error) { console.error('MEDIA_REMOVE_FAILED', JSON.stringify({ media: id, cause: error instanceof Error ? error.message.slice(0, 80) : 'unknown' })); }
    }
    return { id: decided.id, state: decided.state, removed };
  }
}
