import type { Pool } from 'pg';
import { transaction } from '../owner/auth';
import { PublishingAdmin, PublishingError } from '../publishing/repository';
import { recordAdminAction } from './audit';
import { AdminError } from './auth';

/**
 * Lần phát hành đầu của một quán tự đăng ký (kịch bản mục 4: một trang lừa đảo trên tên miền là Chrome gắn "Nguy hiểm" cả
 * tên miền). The owner presses Gửi duyệt, the page waits here, and Tài looks at its draft as it is now (/gov/xem/<page>).
 * Approving marks the shop as seen -- from then on it publishes on its own -- and publishes the very revision he was shown:
 * if the owner edited the page meanwhile, the approval stops and the list shows the newer draft, so what goes live is always
 * what he saw. Refusing keeps the shop unseen, with a reason the owner reads in the editor; they fix the page and ask again.
 */
export type PublishReviewRow = {
  id: string; shop_id: string; shop_slug: string; shop_name: string; page_id: string; page_slug: string; page_label: string | null;
  /** The draft as it is now: what /gov/xem shows, and what approving publishes. */
  revision: number; requested_at: string; place_id: string | null; google_address: string | null;
  owner_handle: string | null; owner_email: string | null;
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const printable = (value: string) => ![...value].some(character => (character.codePointAt(0) ?? 0) < 32 || '<>'.includes(character));
const refused = (error: unknown): never => {
  if (error instanceof PublishingError) {
    // The owner saved again after the list was drawn: Tài looks at the newer draft before anything goes live.
    if (error.code === 'DRAFT_CONFLICT') throw new AdminError(409, 'DRAFT_CHANGED');
    if (['MEDIA_PENDING', 'MEDIA_REJECTED', 'MEDIA_UNKNOWN', 'PAGE_CLOSED', 'SHOP_SUSPENDED'].includes(error.code)) throw new AdminError(409, error.code);
    if (error.code.startsWith('POLICY_') || error.code === 'INVALID_CONFIG') throw new AdminError(409, 'PAGE_NOT_PUBLISHABLE');
  }
  throw error;
};

export class PublishReviews {
  constructor(private pool: Pool) {}

  /** Oldest first, so no shop waits behind newer ones. */
  async pending(limit = 100): Promise<PublishReviewRow[]> {
    return (await this.pool.query(`SELECT r.id,r.shop_id,s.slug shop_slug,s.name shop_name,r.page_id,p.slug page_slug,p.label page_label,
        d.revision::int revision,r.requested_at,s.place_id,s.google_address,o.username owner_handle,o.email owner_email
      FROM publish_reviews r JOIN shops s ON s.id=r.shop_id JOIN pages p ON p.shop_id=r.shop_id AND p.id=r.page_id
      JOIN page_drafts d ON d.shop_id=r.shop_id AND d.page_id=r.page_id
      LEFT JOIN LATERAL (SELECT i.username,i.email FROM owner_memberships_v2 m JOIN owner_identities_v2 i ON i.id=m.user_id
        WHERE m.shop_id=r.shop_id AND m.role='owner' AND m.active ORDER BY m.joined_at LIMIT 1) o ON true
      WHERE r.state='pending' ORDER BY r.requested_at,r.id LIMIT $1`, [limit])).rows;
  }

  /** `{decision:'approve', revision}` publishes that revision of the page; `{decision:'reject', reason}` sends it back. */
  async decide(adminId: string, id: unknown, body: unknown) {
    if (typeof id !== 'string' || !UUID.test(id)) throw new AdminError(400, 'INVALID_INPUT');
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new AdminError(400, 'INVALID_INPUT');
    const { decision, revision, reason } = body as Record<string, unknown>, keys = Object.keys(body).sort().join();
    if (decision === 'approve' ? keys !== 'decision,revision' || !Number.isSafeInteger(revision) || Number(revision) < 1
      : decision === 'reject' ? keys !== 'decision,reason' : true) throw new AdminError(400, 'INVALID_INPUT');
    const why = decision === 'reject' && typeof reason === 'string' ? reason.trim() : null;
    if (decision === 'reject' && (!why || why.length > 500 || !printable(why))) throw new AdminError(400, 'REASON_REQUIRED');
    return transaction(this.pool, async db => {
      const row = (await db.query('SELECT shop_id,page_id,state FROM publish_reviews WHERE id=$1 FOR UPDATE', [id])).rows[0];
      if (!row) throw new AdminError(404, 'REVIEW_NOT_FOUND');
      if (row.state !== 'pending') throw new AdminError(409, 'REVIEW_ALREADY_DECIDED');
      if (decision === 'reject') {
        await db.query("UPDATE publish_reviews SET state='rejected',reason=$2,decided_by=$3,decided_at=clock_timestamp() WHERE id=$1", [id, why, adminId]);
        await recordAdminAction(db, adminId, { action: 'shop.first_publish.reject', shopId: row.shop_id, detail: { review: id, page: row.page_id, reason: why } });
        return { id, state: 'rejected' as const };
      }
      // Seen, then published in the same transaction: a publish that fails takes the approval back with it.
      await db.query('UPDATE shops SET publish_approved_at=clock_timestamp() WHERE id=$1', [row.shop_id]);
      const page = { shopId: row.shop_id as string, pageId: row.page_id as string };
      const published = await new PublishingAdmin(db, async () => ({ actorId: `admin:${adminId}` })).publish(page, Number(revision)).catch(refused);
      await db.query("UPDATE publish_reviews SET state='approved',decided_by=$2,decided_at=clock_timestamp() WHERE id=$1", [id, adminId]);
      await recordAdminAction(db, adminId, { action: 'shop.first_publish.approve', shopId: row.shop_id,
        detail: { review: id, page: row.page_id, revision: Number(revision), release: published.releaseId } });
      return { id, state: 'approved' as const, releaseId: published.releaseId };
    });
  }

  /** The draft of a page waiting here, for /gov/xem: only while its shop waits, so /gov is not a window onto every draft. */
  async draft(pageId: unknown) {
    if (typeof pageId !== 'string' || !UUID.test(pageId)) return null;
    return (await this.pool.query(`SELECT d.config,s.google_url,p.slug FROM publish_reviews r JOIN page_drafts d ON d.shop_id=r.shop_id AND d.page_id=r.page_id
      JOIN pages p ON p.id=r.page_id JOIN shops s ON s.id=r.shop_id WHERE r.page_id=$1 AND r.state='pending'`, [pageId])).rows[0] as
      { config: unknown; google_url: string | null; slug: string } | undefined ?? null;
  }
}
