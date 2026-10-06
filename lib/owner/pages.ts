import type { PoolClient, Pool } from 'pg';
import { OwnerError, authorize, requirePermission, transaction, type OwnerAccess, type OwnerCredential } from './auth';
import { recordActivity } from './activity';
import { PublishingAdmin, PublishingError, shownConfig, templateVersionRow, type PageRef, type PauseReason } from '../publishing/repository';
import { validateConfig } from '../publishing/config';
import { bindShop } from '../canvas/slots';
import { readProfile } from '../shop/profile';
import { canvasTemplate, pageFromTemplate } from '../canvas/templates';
import { withShortCode } from '../short-code';
import { pageLabel } from './page-names';

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
  template: { key: string; version: number }; createdAt: string;
  /**
   * "Nhờ Admin Tài dựng" still open for this page (lib/owner/edit-requests.ts): when it was sent, the template asked for, what
   * the shop wrote, and whether Tài has reached the shop yet.
   */
  request: { at: string; template: string | null; message: string | null; contacted: boolean } | null };
const label = (value: unknown) => {
  if (typeof value !== 'string' || value.trim().length > 60 || /[\u0000-\u001f<>]/.test(value)) throw new OwnerError(400, 'INVALID_PAGE');
  return value.trim();
};
const shape = (value: unknown, keys: string[]) => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join() !== [...keys].sort().join()) throw new OwnerError(400, 'INVALID_PAGE');
  return value as Record<string, unknown>;
};
/** Making a page decides what the shop pays (docs/goi-va-trang.md mục 4): the owner, signed in as themself, only. */
export const ownerOnly = (access: OwnerAccess) => {
  if (access.actor.kind !== 'owner' || access.role !== 'owner') throw new OwnerError(403, 'OWNER_ROLE_REQUIRED');
};
const core = (access: OwnerAccess, db: PoolClient) => new PublishingAdmin(db, async request => {
  if (request.shopId !== access.shopId) throw new OwnerError(403, 'ACCESS_DENIED');
  return { actorId: access.actor.kind === 'admin' ? `admin:${access.actor.adminId}` : `owner:${access.userId}` };
});

/**
 * A new page of the shop from a template (Tài 06/10: a shop picks a look; Tài matches it to the shop before it goes live): a
 * draft at a new permanent link, named as Library names pages. Only the owner makes pages, inside the caller's transaction.
 */
export async function newPageFromTemplate(db: PoolClient, access: OwnerAccess, key: string) {
  ownerOnly(access);
  const template = canvasTemplate(key); if (!template) throw new OwnerError(400, 'INVALID_TEMPLATE');
  const count = Number((await db.query('SELECT count(*)::int n FROM pages WHERE shop_id=$1', [access.shopId])).rows[0].n);
  const name = pageLabel(count), templateId = await templateVersionRow(db, template.key), admin = core(access, db);
  // A code no page has ever had: links are permanent and never issued twice (migration 024).
  const page = await withShortCode(async code => {
    await db.query('SAVEPOINT new_page');
    try { const made = await admin.createPage(access.shopId, templateId, pageFromTemplate(template.key, access.name), code, name); await db.query('RELEASE SAVEPOINT new_page'); return { ...made, slug: code }; }
    catch (error) { await db.query('ROLLBACK TO SAVEPOINT new_page'); throw error; }
  });
  await recordActivity(db, access, 'page.create', `${name} (${page.slug})`);
  return page;
}
/** The page's draft started again from another template; guests keep seeing the page as it is until Tài publishes the new one. */
export async function restartFromTemplate(db: PoolClient, access: OwnerAccess, page: PageRef, key: string) {
  const template = canvasTemplate(key); if (!template) throw new OwnerError(400, 'INVALID_TEMPLATE');
  return core(access, db).restartDraft(page, await templateVersionRow(db, template.key), pageFromTemplate(template.key, access.name)).catch(lifecycle);
}

/**
 * The shop's pages in the dashboard (lát P3, `docs/goi-va-trang.md` mục 3; Tài 06/10): each with where it stands, and the Zalo
 * this person last left for Tài, so asking again needs no typing. Pages are made by picking a template (lib/owner/edit-requests.ts)
 * and go live when Tài has matched them to the shop; the owner names, pauses and resumes them.
 */
export class OwnerPages {
  constructor(private pool: Pool) {}

  async list(credential: OwnerCredential, slug: string) {
    return transaction(this.pool, async db => {
      const access = await authorize(db, credential, slug, 'design');
      const rows = (await db.query(`SELECT p.slug,p.label,p.state,p.pause_reason,tv.template_key,tv.version,p.created_at,
          e.created_at request_at,e.template_key request_template,e.message request_message,e.contacted_at
        FROM pages p JOIN page_drafts d ON d.page_id=p.id JOIN template_versions tv ON tv.id=d.template_version_id
        LEFT JOIN edit_requests e ON e.page_id=p.id AND e.handled_at IS NULL
        WHERE p.shop_id=$1 ORDER BY p.created_at,p.id`, [access.shopId])).rows;
      // No price per page any more (Tài 05/10): a shop pays for a plan (lib/billing/plans.ts), not for each page.
      const pages = rows.map(row => ({ slug: row.slug, label: row.label, state: row.state, pauseReason: row.pause_reason,
        template: { key: row.template_key, version: Number(row.version) }, createdAt: new Date(row.created_at).toISOString(),
        request: row.request_at ? { at: new Date(row.request_at).toISOString(), template: row.request_template, message: row.request_message,
          contacted: !!row.contacted_at } : null })) as PageSummary[];
      // The number this person left last time, never a teammate's: each one's Zalo stays theirs and Tài's.
      const contact = (await db.query('SELECT contact FROM edit_requests WHERE shop_id=$1 AND requested_by=$2 ORDER BY created_at DESC LIMIT 1',
        [access.shopId, access.userId])).rows[0]?.contact as string | undefined;
      return { pages, canManage: access.actor.kind === 'owner' && access.role === 'owner', contact: contact ?? null };
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

  /**
   * One page drawn for the dashboard (its picture in Library and My Card): as guests see it -- the shop's data in its places --
   * or, while Tài is still matching it to the shop, as the template the shop picked, with its name in.
   */
  async picture(credential: OwnerCredential, slug: string, pageSlug: string) {
    return transaction(this.pool, async db => {
      const access = await authorize(db, credential, slug, 'design'), page = await pageOf(db, access.shopId, pageSlug);
      const row = (await db.query(`SELECT d.config,s.name,s.profile,s.is_template,s.google_url,
          EXISTS(SELECT 1 FROM edit_requests e WHERE e.page_id=d.page_id AND e.handled_at IS NULL) waiting
        FROM page_drafts d JOIN shops s ON s.id=d.shop_id WHERE d.shop_id=$1 AND d.page_id=$2`, [page.shopId, page.pageId])).rows[0];
      const config = validateConfig(row.config);
      const shown = row.waiting ? { ...config, doc: bindShop(config.doc, { name: row.name, profile: readProfile(row.profile) }, 'sample') } : shownConfig(config, row);
      return { slug: page.slug, config: shown, googleUrl: row.google_url && row.google_url !== 'https://maps.google.com/' ? row.google_url as string : null };
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
