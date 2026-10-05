import type { Pool, PoolClient } from 'pg';
import { authorize, transaction, OwnerError, type OwnerAccess, type OwnerCredential } from './auth';
import { recordAdminAction } from '../admin/audit';
import { PublishingAdmin } from '../publishing/repository';
import { PublishingError, validateConfig, type PageConfig } from '../publishing/config';
import { storageSettings } from '../media/storage';
import { mediaOf } from '../canvas/layout';
import { recordActivity } from './activity';
import { pageOf } from './pages';
import type { PageRef } from '../publishing/repository';

/**
 * Behind the canvas editor (đợt ②, kịch bản mục 9): read a page's draft and live document, save the draft, preview it,
 * publish it. Owners and managers edit their own pages; an administrator edits only through a 'design' impersonation,
 * which the owner's switch allows at positions 2 and 3. Every administrator save and publish is recorded as done on the
 * owner's behalf.
 */
export type DesignState = { page: { slug: string; label: string | null; state: string }; draft: { revision: number; config: PageConfig };
  live: { releaseId: string; config: PageConfig } | null; uploads: boolean;
  /** Where each picture the draft shows stands in the image review (media-gate.ts); a picture missing here was never uploaded. */
  media: Record<string, MediaState>;
  /** The template the page started from (a page is a copy of it: editing the page never changes the template). */
  template: { key: string };
  /** The shop's Google review link, which every Google button on its pages uses; null until the shop has its Place ID. */
  googleUrl: string | null;
  firstPublish: FirstPublish };
/**
 * Where a shop that signed itself up stands with its first publish (kịch bản mục 4): `needed` until it asks, `pending` while
 * Tài looks, `rejected` with his reason until it asks again. Null once it may publish on its own -- every shop /gov made.
 */
export type MediaState = 'pending' | 'approved' | 'rejected';
export type FirstPublish = { state: 'needed' | 'pending' | 'rejected'; reason: string | null; page: string | null } | null;
export async function firstPublishOf(db: Pool | PoolClient, shopId: string): Promise<FirstPublish> {
  const shop = (await db.query('SELECT self_signup,publish_approved_at FROM shops WHERE id=$1', [shopId])).rows[0];
  if (!shop?.self_signup || shop.publish_approved_at) return null;
  const last = (await db.query(`SELECT r.state,r.reason,p.slug FROM publish_reviews r JOIN pages p ON p.id=r.page_id
    WHERE r.shop_id=$1 ORDER BY r.requested_at DESC,r.id LIMIT 1`, [shopId])).rows[0];
  return { state: last?.state === 'pending' || last?.state === 'rejected' ? last.state : 'needed', reason: last?.state === 'rejected' ? last.reason : null,
    page: last?.slug ?? null };
}

const revisionOf = (value: unknown) => {
  if (!Number.isSafeInteger(value) || Number(value) < 1) throw new OwnerError(400, 'INVALID_DESIGN');
  return Number(value);
};
const input = (value: unknown, keys: string[]) => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join() !== [...keys].sort().join()) throw new OwnerError(400, 'INVALID_DESIGN');
  return value as Record<string, unknown>;
};
const translate = (error: unknown): never => {
  if (error instanceof PublishingError) {
    if (error.code === 'INVALID_CONFIG') throw new OwnerError(400, 'INVALID_CONFIG');
    if (error.code === 'DRAFT_CONFLICT' || error.code === 'PREVIEW_SOURCE_CONFLICT') throw new OwnerError(409, 'DRAFT_CONFLICT');
    if (error.code === 'PAGE_NOT_FOUND') throw new OwnerError(404, 'PAGE_NOT_FOUND');
    if (error.code === 'PAGE_CLOSED') throw new OwnerError(409, 'PAGE_CLOSED');
    if (error.code === 'SHOP_SUSPENDED') throw new OwnerError(403, 'SHOP_SUSPENDED');
    // Separate answers, because the shop fixes each one differently (lát F-013, A7; layout.ts googleProblems): words that
    // trade with a review, a link that writes one, and where the Google button stands.
    if (error.code.startsWith('POLICY_')) throw new OwnerError(400, error.code);
    // Cửa duyệt ảnh (migration 023): three answers, because each asks the shop for something different.
    if (error.code === 'MEDIA_PENDING' || error.code === 'MEDIA_REJECTED' || error.code === 'MEDIA_UNKNOWN') throw new OwnerError(409, error.code);
  }
  throw error;
};

export class OwnerDesign {
  constructor(private pool: Pool) {}

  private async access(credential: OwnerCredential, slug: string) {
    return transaction(this.pool, db => authorize(db, credential, slug, 'design'));
  }
  private admin(access: OwnerAccess, db: PoolClient) {
    const actor = access.actor.kind === 'admin' ? `admin:${access.actor.adminId}` : `owner:${access.userId}`;
    return new PublishingAdmin(db, async request => {
      if (request.shopId !== access.shopId) throw new OwnerError(403, 'ACCESS_DENIED');
      return { actorId: actor };
    });
  }
  private async audit(db: PoolClient, access: OwnerAccess, action: string, detail: Record<string, unknown>) {
    if (access.actor.kind !== 'admin') return;
    await recordAdminAction(db, access.actor.adminId, { action, shopId: access.shopId, onBehalfOf: access.userId,
      detail: { session: access.actor.sessionId, ...detail } });
  }
  /**
   * One transaction for the permission check, the change and the record of it, so the three cannot disagree. Before
   * this, the draft was saved on one connection and written into the books on the next: an audit insert that failed
   * left a renamed page nobody had recorded (F-011, Astra, 2026-09-20).
   *
   * An operation that has already passed the check runs to the end even if the person's access is taken away while
   * it runs (Tài, 2026-09-20: whoever got there first holds the floor). The row locks decide who is first, and the
   * next request from that person is refused like any other. Across requests -- read the page, edit it, save it --
   * the gap is the person's own thinking time and no lock can close it; `expectedRevision` is what keeps two editors
   * from overwriting each other there, and the check runs again on the way in.
   */
  private write<T>(credential: OwnerCredential, slug: string, page: string | null | undefined, run: (db: PoolClient, access: OwnerAccess, page: PageRef) => Promise<T>) {
    return transaction(this.pool, async db => {
      const access = await authorize(db, credential, slug, 'design');
      return run(db, access, await pageOf(db, access.shopId, page));
    });
  }

  /** Every method takes the page by its link; absent means the shop's first page (lib/owner/pages.ts). */
  async read(credential: OwnerCredential, slug: string, pageSlug?: string | null): Promise<DesignState> {
    const access = await this.access(credential, slug), page = await pageOf(this.pool, access.shopId, pageSlug);
    const draft = (await this.pool.query(`SELECT d.revision,d.config,tv.template_key,p.label,s.google_url FROM page_drafts d
      JOIN template_versions tv ON tv.id=d.template_version_id JOIN pages p ON p.id=d.page_id JOIN shops s ON s.id=d.shop_id
      WHERE d.shop_id=$1 AND d.page_id=$2`, [page.shopId, page.pageId])).rows[0];
    if (!draft) throw new OwnerError(404, 'DRAFT_MISSING');
    const live = (await this.pool.query(`SELECT r.id,r.config_snapshot FROM pages p JOIN page_releases r ON r.page_id=p.id AND r.id=p.active_release_id
      WHERE p.shop_id=$1 AND p.id=$2`, [page.shopId, page.pageId])).rows[0];
    const config = validateConfig(draft.config), shown = mediaOf(config.doc);
    const media = shown.length ? (await this.pool.query('SELECT url,state FROM media_assets WHERE shop_id=$1 AND url = ANY($2)', [page.shopId, shown])).rows : [];
    return { page: { slug: page.slug, label: draft.label, state: page.state }, draft: { revision: Number(draft.revision), config },
      live: live ? { releaseId: live.id, config: validateConfig(live.config_snapshot) } : null,
      // Whether the upload buttons can work here: all R2 settings present.
      uploads: storageSettings() !== null,
      media: Object.fromEntries(media.map(row => [row.url, row.state])),
      template: { key: draft.template_key },
      googleUrl: draft.google_url && draft.google_url !== 'https://maps.google.com/' ? draft.google_url : null,
      firstPublish: await firstPublishOf(this.pool, page.shopId) };
  }

  async save(credential: OwnerCredential, slug: string, body: unknown, pageSlug?: string | null) {
    const data = input(body, ['expectedRevision', 'config']), expected = revisionOf(data.expectedRevision);
    return this.write(credential, slug, pageSlug, async (db, access, page) => {
      const revision = await this.admin(access, db).saveDraft(page, expected, data.config).catch(translate);
      await this.audit(db, access, 'impersonation.design.save', { revision });
      await recordActivity(db, access, 'design.save', `Bản nháp ${revision}`);
      return { revision };
    });
  }

  async publish(credential: OwnerCredential, slug: string, body: unknown, pageSlug?: string | null) {
    const expected = revisionOf(input(body, ['action', 'expectedRevision']).expectedRevision);
    return this.write(credential, slug, pageSlug, async (db, access, page) => {
      let published;
      try { published = await this.admin(access, db).publish(page, expected); }
      catch (error) {
        if (!(error instanceof PublishingError && error.code === 'PUBLISH_REVIEW_REQUIRED')) return translate(error);
        // The shop's first publish waits for Tài (kịch bản mục 4). One request per shop stands; asking again names the page
        // asked last, and Tài approves the draft he sees then (lib/admin/publish-reviews.ts).
        const requester = access.actor.kind === 'admin' ? `admin:${access.actor.adminId}` : `owner:${access.userId}`;
        await db.query(`INSERT INTO publish_reviews(shop_id,page_id,requested_by) VALUES($1,$2,$3)
          ON CONFLICT (shop_id) WHERE state='pending' DO UPDATE SET page_id=EXCLUDED.page_id,requested_by=EXCLUDED.requested_by,requested_at=clock_timestamp()`,
          [page.shopId, page.pageId, requester]);
        await this.audit(db, access, 'impersonation.design.review', { revision: expected });
        await recordActivity(db, access, 'design.review', `Bản nháp ${expected}`);
        return { review: 'pending' as const, revision: expected };
      }
      await this.audit(db, access, 'impersonation.design.publish', { releaseId: published.releaseId });
      await recordActivity(db, access, 'design.publish', `Bản nháp ${published.draftRevision}`);
      return { releaseId: published.releaseId, revision: published.draftRevision };
    });
  }

  /** A preview of the saved draft. The token goes straight into an HttpOnly cookie in the route, never into JSON. */
  async preview(credential: OwnerCredential, slug: string, body: unknown, pageSlug?: string | null) {
    const expected = revisionOf(input(body, ['action', 'expectedRevision']).expectedRevision);
    // A preview writes a row too, so it joins the same transaction rather than leaving an unrecorded one behind.
    return this.write(credential, slug, pageSlug, async (db, access, page) => {
      const preview = await this.admin(access, db).preview(page, { kind: 'draft', revision: expected }).catch(translate);
      await this.audit(db, access, 'impersonation.design.preview', { revision: expected });
      return preview;
    });
  }
}
