import type { Pool, PoolClient } from 'pg';
import { authorize, transaction, OwnerError, type OwnerAccess, type OwnerCredential } from './auth';
import { recordAdminAction } from '../admin/audit';
import { PublishingAdmin } from '../publishing/repository';
import { DEFAULT_FEEDBACK_BUTTON, PublishingError, validateConfig, type PageConfig } from '../publishing/config';
import { r2Settings } from './media';
import { recordActivity } from './activity';

/**
 * The Design & Link editor behind the dashboard (lát D, 2026-09-18). Owners and managers edit their own page; an
 * administrator edits only through a 'design' impersonation, which the owner's switch allows at positions 2 and 3.
 * Every administrator save and publish is recorded as done on the owner's behalf.
 */
export type DesignState = { draft: { revision: number; config: PageConfig }; live: { releaseId: string; config: PageConfig } | null; uploads: boolean };

/** Older pages are v1; the editor always works in v2, which adds the card layout, more buttons and the plane. */
export function upgradeConfig(config: PageConfig): PageConfig {
  return config.schemaVersion === 2 ? config : { ...config, schemaVersion: 2, feedbackButton: { ...DEFAULT_FEEDBACK_BUTTON } };
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
    if (error.code === 'SHOP_SUSPENDED') throw new OwnerError(403, 'SHOP_SUSPENDED');
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
  private write<T>(credential: OwnerCredential, slug: string, run: (db: PoolClient, access: OwnerAccess) => Promise<T>) {
    return transaction(this.pool, async db => run(db, await authorize(db, credential, slug, 'design')));
  }

  async read(credential: OwnerCredential, slug: string): Promise<DesignState> {
    const access = await this.access(credential, slug);
    const draft = (await this.pool.query('SELECT revision,config FROM page_drafts WHERE shop_id=$1', [access.shopId])).rows[0];
    if (!draft) throw new OwnerError(404, 'DRAFT_MISSING');
    const live = (await this.pool.query(`SELECT r.id,r.config_snapshot FROM shops s JOIN page_releases r ON r.id=s.active_release_id
      WHERE s.id=$1`, [access.shopId])).rows[0];
    return { draft: { revision: Number(draft.revision), config: upgradeConfig(validateConfig(draft.config)) },
      live: live ? { releaseId: live.id, config: validateConfig(live.config_snapshot) } : null,
      // Whether the upload buttons can work here: all R2 settings present.
      uploads: r2Settings() !== null };
  }

  async save(credential: OwnerCredential, slug: string, body: unknown) {
    const data = input(body, ['expectedRevision', 'config']), expected = revisionOf(data.expectedRevision);
    return this.write(credential, slug, async (db, access) => {
      const revision = await this.admin(access, db).saveDraft(access.shopId, expected, data.config).catch(translate);
      await this.audit(db, access, 'impersonation.design.save', { revision });
      await recordActivity(db, access, 'design.save', `Bản nháp ${revision}`);
      return { revision };
    });
  }

  async publish(credential: OwnerCredential, slug: string, body: unknown) {
    const expected = revisionOf(input(body, ['action', 'expectedRevision']).expectedRevision);
    return this.write(credential, slug, async (db, access) => {
      const published = await this.admin(access, db).publish(access.shopId, expected).catch(translate);
      await this.audit(db, access, 'impersonation.design.publish', { releaseId: published.releaseId });
      await recordActivity(db, access, 'design.publish', `Bản nháp ${published.draftRevision}`);
      return { releaseId: published.releaseId, revision: published.draftRevision };
    });
  }

  /** A preview of the saved draft. The token goes straight into an HttpOnly cookie in the route, never into JSON. */
  async preview(credential: OwnerCredential, slug: string, body: unknown) {
    const expected = revisionOf(input(body, ['action', 'expectedRevision']).expectedRevision);
    // A preview writes a row too, so it joins the same transaction rather than leaving an unrecorded one behind.
    return this.write(credential, slug, async (db, access) => {
      const preview = await this.admin(access, db).preview(access.shopId, { kind: 'draft', revision: expected }).catch(translate);
      await this.audit(db, access, 'impersonation.design.preview', { revision: expected });
      return preview;
    });
  }
}
