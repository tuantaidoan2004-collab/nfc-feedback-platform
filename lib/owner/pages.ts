import type { PoolClient, Pool } from 'pg';
import { OwnerError, authorize, requirePermission, transaction, type OwnerAccess, type OwnerCredential } from './auth';
import { recordActivity } from './activity';
import { PublishingAdmin, PublishingError, templateVersionRow, type PageRef, type PauseReason, type TemplateReleases } from '../publishing/repository';
import { isTemplateKey, templateConfig } from '../publishing/config';
import { TEMPLATE_RELEASES, settingsOf } from '../publishing/versions';
import { convertSettings } from '../publishing/settings';
import { withShortCode } from '../short-code';

/**
 * Which page of the shop a dashboard request is about (migration 024, `docs/goi-va-trang.md`). Named by its link;
 * absent means the shop's first page, which is every shop's only page until the page list (lát P3) lets a shop make
 * more. A page of another shop is never found: the lookup names the shop the caller was authorized for.
 */
export async function pageOf(db: PoolClient | Pool, shopId: string, slug?: string | null): Promise<PageRef & { slug: string; state: PageSummary['state'] }> {
  if (slug !== undefined && slug !== null && !/^[A-Za-z0-9][A-Za-z0-9-]{0,62}$/.test(slug)) throw new OwnerError(404, 'PAGE_NOT_FOUND');
  // With no link named, the first page that is not closed (a closed page takes no more edits, migration 026).
  const row = (await db.query(`SELECT id,slug,state FROM pages WHERE shop_id=$1 AND ($2::text IS NULL OR lower(slug)=lower($2))
    ORDER BY state='closed',created_at,id LIMIT 1`, [shopId, slug ?? null])).rows[0];
  if (!row) throw new OwnerError(404, 'PAGE_NOT_FOUND');
  return { shopId, pageId: row.id, slug: row.slug, state: row.state };
}

export type PageSummary = { slug: string; label: string; state: 'draft' | 'active' | 'paused' | 'closed'; pauseReason: PauseReason | null;
  template: { key: string; version: number }; createdAt: string };
const label = (value: unknown) => {
  if (typeof value !== 'string' || value.trim().length > 60 || /[\u0000-\u001f<>]/.test(value)) throw new OwnerError(400, 'INVALID_PAGE');
  return value.trim();
};
const shape = (value: unknown, keys: string[]) => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join() !== [...keys].sort().join()) throw new OwnerError(400, 'INVALID_PAGE');
  return value as Record<string, unknown>;
};
/** Making a page decides what the shop pays (docs/goi-va-trang.md mục 4): the owner, signed in as themself, only. */
const ownerOnly = (access: OwnerAccess) => {
  if (access.actor.kind !== 'owner' || access.role !== 'owner') throw new OwnerError(403, 'OWNER_ROLE_REQUIRED');
};

/**
 * The shop's pages in the dashboard (lát P3, `docs/goi-va-trang.md` mục 3): list them, make a new one — a copy of a page
 * or a template fresh from the library — and name them. A new page starts as a draft at a new permanent link; it goes
 * live when the owner publishes it from the editor, like any other change.
 */
export class OwnerPages {
  constructor(private pool: Pool, private releases: TemplateReleases = TEMPLATE_RELEASES) {}

  async list(credential: OwnerCredential, slug: string) {
    return transaction(this.pool, async db => {
      const access = await authorize(db, credential, slug, 'design');
      const pages = (await db.query(`SELECT p.slug,p.label,p.state,p.pause_reason,tv.template_key,tv.version,p.created_at FROM pages p
        JOIN page_drafts d ON d.page_id=p.id JOIN template_versions tv ON tv.id=d.template_version_id
        WHERE p.shop_id=$1 ORDER BY p.created_at,p.id`, [access.shopId])).rows.map(row => ({ slug: row.slug, label: row.label, state: row.state, pauseReason: row.pause_reason,
          template: { key: row.template_key, version: Number(row.version) }, createdAt: new Date(row.created_at).toISOString() })) as PageSummary[];
      return { pages, canManage: access.actor.kind === 'owner' && access.role === 'owner' };
    });
  }

  /**
   * `{ copy: <page link>, label }` copies that page's draft — template version, look and content — to a new link.
   * `{ template: <key>, label }` starts from the template's bare skeleton at its newest version; the editor then offers
   * "Nhập dữ liệu từ trang khác" to bring the shop's content in.
   */
  async create(credential: OwnerCredential, slug: string, body: unknown) {
    const data = body && typeof body === 'object' && 'copy' in body ? shape(body, ['copy', 'label']) : shape(body, ['template', 'label']);
    const name = label(data.label);
    return transaction(this.pool, async db => {
      const access = await authorize(db, credential, slug, 'write'); requirePermission(access, 'design'); ownerOnly(access);
      let templateId: string, config: unknown;
      if ('copy' in data) {
        const source = await pageOf(db, access.shopId, typeof data.copy === 'string' ? data.copy : '-');
        const draft = (await db.query('SELECT template_version_id,config FROM page_drafts WHERE page_id=$1', [source.pageId])).rows[0];
        templateId = draft.template_version_id; config = draft.config;
      } else {
        const key = data.template, shipped = isTemplateKey(key) ? this.releases[key] : undefined;
        if (!isTemplateKey(key) || !shipped?.length) throw new OwnerError(400, 'INVALID_PAGE');
        const version = shipped[shipped.length - 1].version;
        templateId = await templateVersionRow(db, key, version);
        const settings = convertSettings(settingsOf(this.releases, key, version), undefined);
        config = { ...templateConfig(key), ...(settings ? { settings } : {}) };
      }
      const admin = new PublishingAdmin(db, async request => {
        if (request.shopId !== access.shopId) throw new OwnerError(403, 'ACCESS_DENIED');
        return { actorId: `owner:${access.userId}` };
      }, this.releases);
      // A code no page has ever had: links are permanent and never issued twice (migration 024).
      const page = await withShortCode(async code => {
        await db.query('SAVEPOINT new_page');
        try { const made = await admin.createPage(access.shopId, templateId, config, code); await db.query('RELEASE SAVEPOINT new_page'); return { ...made, slug: code }; }
        catch (error) { await db.query('ROLLBACK TO SAVEPOINT new_page'); throw error; }
      });
      await db.query('UPDATE pages SET label=$3 WHERE shop_id=$1 AND id=$2', [page.shopId, page.pageId, name]);
      await recordActivity(db, access, 'page.create', `${name || page.slug} (${page.slug})`);
      return { slug: page.slug, label: name };
    });
  }

  async rename(credential: OwnerCredential, slug: string, body: unknown) {
    const data = shape(body, ['page', 'label']), name = label(data.label);
    return transaction(this.pool, async db => {
      const access = await authorize(db, credential, slug, 'write'); requirePermission(access, 'design');
      const page = await pageOf(db, access.shopId, typeof data.page === 'string' ? data.page : '-');
      if (page.state === 'closed') throw new OwnerError(409, 'PAGE_CLOSED');
      await db.query('UPDATE pages SET label=$3 WHERE shop_id=$1 AND id=$2', [page.shopId, page.pageId, name]);
      await recordActivity(db, access, 'page.rename', `${name || page.slug} (${page.slug})`);
      return { slug: page.slug, label: name };
    });
  }
}

/** The publishing layer's refusals, as the dashboard answers them. */
const lifecycle = (error: unknown): never => {
  if (error instanceof PublishingError && ['PAGE_CLOSED', 'PAGE_NOT_LIVE', 'PAGE_NOT_PAUSED', 'PAUSE_NOT_YOURS'].includes(error.code)) throw new OwnerError(409, error.code);
  throw error;
};
export class OwnerPageLifecycle {
  constructor(private pool: Pool) {}
  private admin(access: OwnerAccess, db: PoolClient) {
    return new PublishingAdmin(db, async request => {
      if (request.shopId !== access.shopId) throw new OwnerError(403, 'ACCESS_DENIED');
      return { actorId: `owner:${access.userId}` };
    });
  }
  /**
   * The owner's emergency stop (Tài, 25/09): the page stops at once -- guests see "Trang tạm ngừng" -- its plan pauses
   * with it, and a report goes to the administrators, who decide what the shop is owed. Owner only, like making a page.
   */
  async pause(credential: OwnerCredential, slug: string, body: unknown) {
    const data = shape(body, ['action', 'page', 'reason']);
    const reason = typeof data.reason === 'string' ? data.reason.trim() : '';
    if (!reason || reason.length > 1000 || /[<>]/.test(reason)) throw new OwnerError(400, 'REASON_REQUIRED');
    return transaction(this.pool, async db => {
      const access = await authorize(db, credential, slug, 'write'); requirePermission(access, 'design'); ownerOnly(access);
      const page = await pageOf(db, access.shopId, typeof data.page === 'string' ? data.page : '-');
      await this.admin(access, db).pausePage(page, 'emergency').catch(lifecycle);
      const incident = (await db.query('INSERT INTO page_incidents(shop_id,page_id,reported_by,reason) VALUES($1,$2,$3,$4) RETURNING id',
        [page.shopId, page.pageId, access.userId, reason])).rows[0].id as string;
      await recordActivity(db, access, 'page.pause', `${page.slug}: ${reason}`.slice(0, 200));
      return { slug: page.slug, state: 'paused' as const, incident };
    });
  }
  /** The owner lifts their own emergency stop; a stop by an administrator or an unpaid plan is not theirs to lift. */
  async resume(credential: OwnerCredential, slug: string, body: unknown) {
    const data = shape(body, ['action', 'page']);
    return transaction(this.pool, async db => {
      const access = await authorize(db, credential, slug, 'write'); requirePermission(access, 'design'); ownerOnly(access);
      const page = await pageOf(db, access.shopId, typeof data.page === 'string' ? data.page : '-');
      await this.admin(access, db).resumePage(page, ['emergency']).catch(lifecycle);
      await recordActivity(db, access, 'page.resume', page.slug);
      return { slug: page.slug, state: 'active' as const };
    });
  }
}
