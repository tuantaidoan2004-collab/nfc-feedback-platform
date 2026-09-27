import type { Pool, PoolClient } from 'pg';
import { authorize, transaction, OwnerError, type OwnerAccess, type OwnerCredential } from './auth';
import { recordAdminAction } from '../admin/audit';
import { PublishingAdmin } from '../publishing/repository';
import { PublishingError, currentConfig, validateConfig, type PageConfig } from '../publishing/config';
import { settingsOf, type TemplateRelease } from '../publishing/versions';
import { lockedChange, type SettingField } from '../publishing/settings';
import { storageSettings } from '../media/storage';
import { recordActivity } from './activity';
import { pageOf } from './pages';
import type { PageRef, TemplateReleases } from '../publishing/repository';
import { isTemplateKey, TEMPLATE_RELEASES } from '../publishing/templates';

/**
 * The Design & Link editor behind the dashboard (lát D, 2026-09-18). Owners and managers edit their own page; an
 * administrator edits only through a 'design' impersonation, which the owner's switch allows at positions 2 and 3.
 * Every administrator save and publish is recorded as done on the owner's behalf.
 */
/**
 * Which template the page wears and on which version (versions.ts): the draft's, the live page's, and every version
 * the platform ships for it, so the editor can offer a newer one. The shop never changes template here, only version.
 */
export type TemplateState = { key: string; draft: number; live: number | null; versions: readonly TemplateRelease[]; settings: readonly SettingField[] };
export type DesignState = { page: { slug: string }; draft: { revision: number; config: PageConfig }; live: { releaseId: string; config: PageConfig } | null; uploads: boolean;
  template: TemplateState };
/** The versions shipped per template. Injected so a test can ship a second version the code does not have yet. */

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
    // A version the platform does not ship for this page's template (versions.ts).
    if (error.code === 'INVALID_TEMPLATE') throw new OwnerError(400, 'INVALID_TEMPLATE_VERSION');
    if (error.code === 'PAGE_NOT_FOUND') throw new OwnerError(404, 'PAGE_NOT_FOUND');
    if (error.code === 'PAGE_CLOSED') throw new OwnerError(409, 'PAGE_CLOSED');
    if (error.code === 'INVALID_SETTING') throw new OwnerError(400, 'INVALID_SETTING');
    if (error.code === 'SHOP_SUSPENDED') throw new OwnerError(403, 'SHOP_SUSPENDED');
    // Separate answers, because the shop fixes each one differently (lát F-013, A7).
    if (error.code === 'POLICY_LINK_LABEL' || error.code === 'POLICY_GOOGLE_EXCHANGE' || error.code === 'POLICY_GOOGLE_URL') throw new OwnerError(400, error.code);
    // Cửa duyệt ảnh (migration 023): three answers, because each asks the shop for something different.
    if (error.code === 'MEDIA_PENDING' || error.code === 'MEDIA_REJECTED' || error.code === 'MEDIA_UNKNOWN') throw new OwnerError(409, error.code);
  }
  throw error;
};

export class OwnerDesign {
  constructor(private pool: Pool, private releases: TemplateReleases = TEMPLATE_RELEASES) {}

  private async access(credential: OwnerCredential, slug: string) {
    return transaction(this.pool, db => authorize(db, credential, slug, 'design'));
  }
  private admin(access: OwnerAccess, db: PoolClient) {
    const actor = access.actor.kind === 'admin' ? `admin:${access.actor.adminId}` : `owner:${access.userId}`;
    return new PublishingAdmin(db, async request => {
      if (request.shopId !== access.shopId) throw new OwnerError(403, 'ACCESS_DENIED');
      return { actorId: actor };
    }, this.releases);
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
    const draft = (await this.pool.query(`SELECT d.revision,d.config,tv.template_key,tv.version FROM page_drafts d
      JOIN template_versions tv ON tv.id=d.template_version_id WHERE d.shop_id=$1 AND d.page_id=$2`, [page.shopId, page.pageId])).rows[0];
    if (!draft) throw new OwnerError(404, 'DRAFT_MISSING');
    const live = (await this.pool.query(`SELECT r.id,r.config_snapshot,tv.version FROM pages p JOIN page_releases r ON r.page_id=p.id AND r.id=p.active_release_id
      JOIN template_versions tv ON tv.id=r.template_version_id WHERE p.shop_id=$1 AND p.id=$2`, [page.shopId, page.pageId])).rows[0];
    return { page: { slug: page.slug }, draft: { revision: Number(draft.revision), config: currentConfig(validateConfig(draft.config)) },
      live: live ? { releaseId: live.id, config: validateConfig(live.config_snapshot) } : null,
      // Whether the upload buttons can work here: all R2 settings present.
      uploads: storageSettings() !== null,
      template: { key: draft.template_key, draft: Number(draft.version), live: live ? Number(live.version) : null,
        versions: isTemplateKey(draft.template_key) ? this.releases[draft.template_key] ?? [] : [],
        // What the editor draws for this page: its draft's template version's table (settings.ts).
        settings: settingsOf(this.releases, draft.template_key, Number(draft.version)) } };
  }

  async save(credential: OwnerCredential, slug: string, body: unknown, pageSlug?: string | null) {
    const data = input(body, ['expectedRevision', 'config']), expected = revisionOf(data.expectedRevision);
    return this.write(credential, slug, pageSlug, async (db, access, page) => {
      // The owner's door: a look the template does not offer cannot be changed here (settings.ts, lát P2).
      const draft = (await db.query(`SELECT d.config,tv.template_key,tv.version FROM page_drafts d JOIN template_versions tv ON tv.id=d.template_version_id
        WHERE d.shop_id=$1 AND d.page_id=$2`, [page.shopId, page.pageId])).rows[0];
      if (!draft) throw new OwnerError(404, 'DRAFT_MISSING');
      let after; try { after = currentConfig(validateConfig(data.config)); } catch (error) { translate(error); }
      if (lockedChange(settingsOf(this.releases, draft.template_key, Number(draft.version)), currentConfig(validateConfig(draft.config)), after!))
        throw new OwnerError(400, 'SETTING_LOCKED');
      const revision = await this.admin(access, db).saveDraft(page, expected, data.config).catch(translate);
      await this.audit(db, access, 'impersonation.design.save', { revision });
      await recordActivity(db, access, 'design.save', `Bản nháp ${revision}`);
      return { revision };
    });
  }

  async publish(credential: OwnerCredential, slug: string, body: unknown, pageSlug?: string | null) {
    const expected = revisionOf(input(body, ['action', 'expectedRevision']).expectedRevision);
    return this.write(credential, slug, pageSlug, async (db, access, page) => {
      const published = await this.admin(access, db).publish(page, expected).catch(translate);
      await this.audit(db, access, 'impersonation.design.publish', { releaseId: published.releaseId });
      await recordActivity(db, access, 'design.publish', `Bản nháp ${published.draftRevision}`);
      return { releaseId: published.releaseId, revision: published.draftRevision };
    });
  }

  /**
   * Moves the draft to another version of its template (versions.ts). Nothing reaches the guest page until Publish,
   * so a shop can try the new version in Preview and move back if it does not like it.
   */
  async version(credential: OwnerCredential, slug: string, body: unknown, pageSlug?: string | null) {
    const data = input(body, ['action', 'expectedRevision', 'version']), expected = revisionOf(data.expectedRevision);
    if (!Number.isSafeInteger(data.version) || Number(data.version) < 1) throw new OwnerError(400, 'INVALID_DESIGN');
    const version = Number(data.version);
    return this.write(credential, slug, pageSlug, async (db, access, page) => {
      const result = await this.admin(access, db).setDraftTemplate(page, expected, version).catch(translate);
      // Choosing the version already in use changed nothing, so it leaves no line in the books.
      if (result.revision === expected) return result;
      await this.audit(db, access, 'impersonation.design.version', { version, revision: result.revision });
      await recordActivity(db, access, 'design.version', `Bản nháp dùng template bản ${version}`);
      return result;
    });
  }

  /**
   * Puts the page on another template (Tài, 25/09), keeping its link, cards and content. Only the shop's owner, signed
   * in as themself: the template decides the page's price (docs/goi-va-trang.md mục 4).
   */
  async template(credential: OwnerCredential, slug: string, body: unknown, pageSlug?: string | null) {
    const data = input(body, ['action', 'expectedRevision', 'template']), expected = revisionOf(data.expectedRevision);
    if (!isTemplateKey(data.template)) throw new OwnerError(400, 'INVALID_DESIGN');
    const key = data.template;
    return this.write(credential, slug, pageSlug, async (db, access, page) => {
      if (access.actor.kind !== 'owner' || access.role !== 'owner') throw new OwnerError(403, 'OWNER_ROLE_REQUIRED');
      const result = await this.admin(access, db).changeTemplate(page, expected, key).catch(translate);
      if (result.revision === expected) return result;
      await recordActivity(db, access, 'design.template', `Bản nháp dùng template ${key}`);
      return result;
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
