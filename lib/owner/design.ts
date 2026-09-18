import type { Pool } from 'pg';
import { authorize, transaction, OwnerError, type OwnerAccess, type OwnerCredential } from './auth';
import { recordAdminAction } from '../admin/audit';
import { PublishingAdmin } from '../publishing/repository';
import { DEFAULT_FEEDBACK_BUTTON, PublishingError, validateConfig, type PageConfig } from '../publishing/config';
import { r2Settings } from './media';

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
  private admin(access: OwnerAccess) {
    const actor = access.actor.kind === 'admin' ? `admin:${access.actor.adminId}` : `owner:${access.userId}`;
    return new PublishingAdmin(this.pool, async request => {
      if (request.shopId !== access.shopId) throw new OwnerError(403, 'ACCESS_DENIED');
      return { actorId: actor };
    });
  }
  private async audit(access: OwnerAccess, action: string, detail: Record<string, unknown>) {
    if (access.actor.kind !== 'admin') return;
    await recordAdminAction(this.pool, access.actor.adminId, { action, shopId: access.shopId, onBehalfOf: access.userId,
      detail: { session: access.actor.sessionId, ...detail } });
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
    const access = await this.access(credential, slug);
    const revision = await this.admin(access).saveDraft(access.shopId, expected, data.config).catch(translate);
    await this.audit(access, 'impersonation.design.save', { revision });
    return { revision };
  }

  async publish(credential: OwnerCredential, slug: string, body: unknown) {
    const expected = revisionOf(input(body, ['action', 'expectedRevision']).expectedRevision);
    const access = await this.access(credential, slug);
    const published = await this.admin(access).publish(access.shopId, expected).catch(translate);
    await this.audit(access, 'impersonation.design.publish', { releaseId: published.releaseId });
    return { releaseId: published.releaseId, revision: published.draftRevision };
  }

  /** A preview of the saved draft. The token goes straight into an HttpOnly cookie in the route, never into JSON. */
  async preview(credential: OwnerCredential, slug: string, body: unknown) {
    const expected = revisionOf(input(body, ['action', 'expectedRevision']).expectedRevision);
    const access = await this.access(credential, slug);
    const preview = await this.admin(access).preview(access.shopId, { kind: 'draft', revision: expected }).catch(translate);
    await this.audit(access, 'impersonation.design.preview', { revision: expected });
    return preview;
  }
}
