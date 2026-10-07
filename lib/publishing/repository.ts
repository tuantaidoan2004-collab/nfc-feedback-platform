import { createHash, randomBytes } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
export { PublishingError } from './config';
import { PublishingError, TEMPLATE_ROW, validateConfig, type PageConfig } from './config';
import { openEvents } from '../events/shop-events';
import { assertPublishable } from './policy';
import { bindShop, placeholderLinks } from '../canvas/slots';
import { readProfile } from '../shop/profile';
import { assertMediaApproved } from './media-gate';
import type { RenderContext } from './proof';
import { BILLING_COLUMNS, billingRow } from '../billing/plans';
export const previewHash = (token: string) => createHash('sha256').update(`nfc-preview-v1\0${token}`).digest('hex');
export type AuthorizePublishing = (request: { action: string; shopId?: string }) => Promise<{ actorId: string }>;
/**
 * A page of a shop (migration 024, `docs/goi-va-trang.md`). The shop is the tenant: every query names both, so a page
 * id from another shop matches nothing. Authorization is on the shop, as before.
 */
export type PageRef = { shopId: string; pageId: string };
/** Why a page is paused (migration 026): the owner's emergency stop, an administrator, or an unpaid plan (lát P5). */
export type PauseReason = 'emergency' | 'admin' | 'billing';
const error = (code: string): never => { throw new PublishingError(code); };
/**
 * A page as its guests see it (lib/canvas/slots.ts): the shop's name and data in their places. The sample shop that shows the
 * dashboard (`is_template`) keeps its template's samples, with its name in. The page's own name (its tab title) stays its own.
 */
export function shownConfig(config: PageConfig, shop: { name: string; profile: unknown; is_template: boolean }): PageConfig {
  const data = { name: shop.name, profile: readProfile(shop.profile) };
  return { ...config, doc: bindShop(config.doc, data, shop.is_template ? 'sample' : 'live') };
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const pageRef = (page: PageRef) => { if (!page || !UUID.test(page.shopId) || !UUID.test(page.pageId)) error('PAGE_NOT_FOUND'); };
const revision = (n: number) => { if (!Number.isSafeInteger(n) || n < 1 || n >= Number.MAX_SAFE_INTEGER) error('INVALID_REVISION'); };
/**
 * A pool opens its own transaction; a client means the caller already has one and wants this work inside it, so the
 * caller decides what commits together. That is how a page change and the record of who made it become one unit
 * (F-011). The two are told apart by `release`, which only a checked-out client has -- a client has `connect` too,
 * inherited from the plain Client it is, and calling it says "already connected".
 */
export type PublishingDb = Pool | PoolClient;
const borrowed = (db: PublishingDb): db is PoolClient => typeof (db as PoolClient).release === 'function';
async function tx<T>(pool: PublishingDb, run: (db: PoolClient) => Promise<T>): Promise<T> {
  if (borrowed(pool)) return run(pool);
  const db = await pool.connect(); try { await db.query('BEGIN'); const result = await run(db); await db.query('COMMIT'); return result; }
  catch (e) { await db.query('ROLLBACK'); throw e; } finally { db.release(); }
}
/**
 * The row naming the template a page started from, created on first use; a racing twin lands on the unique (key, version).
 * A canvas page is a copy of its template's document (lib/canvas/templates.ts), so the row only records where it came from.
 */
export async function templateVersionRow(db: PublishingDb, key: string, version = 1) {
  await db.query(`INSERT INTO template_versions(template_key,version,schema_version,renderer_version,capabilities) VALUES($1,$2,$3,$4,$5)
    ON CONFLICT(template_key,version) DO NOTHING`, [key, version, TEMPLATE_ROW.schemaVersion, TEMPLATE_ROW.rendererVersion, JSON.stringify(TEMPLATE_ROW.capabilities)]);
  return (await db.query('SELECT id FROM template_versions WHERE template_key=$1 AND version=$2', [key, version])).rows[0].id as string;
}
/** INTERNAL boundary: callers authorize (lib/owner/pages.ts, lib/admin/provisioning.ts, scripts/sua-trang.ts). */
export class PublishingAdmin {
  constructor(private pool: PublishingDb, private authorize: AuthorizePublishing) {}
  private async actor(action: string, shopId?: string) {
    const principal = await this.authorize({ action, shopId });
    if (!principal?.actorId?.trim()) error('PUBLISH_FORBIDDEN'); return principal.actorId;
  }
  private async onPage(action: string, page: PageRef) { pageRef(page); return this.actor(action, page.shopId); }
  /** The page, share-locked, refusing a closed one: a closed page changes no more (migration 026). */
  private async openPage(db: PublishingDb, page: PageRef, lock: 'SHARE' | 'UPDATE' = 'SHARE') {
    const row = (await db.query(`SELECT state,pause_reason FROM pages WHERE shop_id=$1 AND id=$2 FOR ${lock}`, [page.shopId, page.pageId])).rows[0];
    if (!row) error('PAGE_NOT_FOUND'); if (row.state === 'closed') error('PAGE_CLOSED');
    return row as { state: 'draft' | 'active' | 'paused'; pause_reason: PauseReason | null };
  }
  async createTemplate(templateKey: string, version: number) {
    await this.actor('template:create'); if (!/^[a-z][a-z0-9-]{0,63}$/.test(templateKey) || !Number.isSafeInteger(version) || version < 1) error('INVALID_TEMPLATE');
    return (await this.pool.query(`INSERT INTO template_versions(template_key,version,schema_version,renderer_version,capabilities) VALUES($1,$2,$3,$4,$5) RETURNING id`,
      [templateKey, version, TEMPLATE_ROW.schemaVersion, TEMPLATE_ROW.rendererVersion, JSON.stringify(TEMPLATE_ROW.capabilities)])).rows[0].id as string;
  }
  /**
   * A new page of the shop, at `slug`, with its first draft (revision 1). The link is permanent from here on: pages are
   * never deleted and their slug never changes.
   */
  /** `label`: what the shop calls the page (lib/owner/page-names.ts); empty when the caller names it afterwards. */
  async createPage(shopId: string, templateId: string, input: unknown, slug: string, label = ''): Promise<PageRef> {
    await this.actor('page:create', shopId); if (!UUID.test(shopId)) error('SHOP_NOT_FOUND');
    const config = validateConfig(input); assertPublishable(config);
    return tx(this.pool, async db => {
      const pageId = (await db.query(`INSERT INTO pages(id,shop_id,slug,entry_key,label) SELECT g,$1,$2,'direct:page:'||g,$3 FROM (SELECT gen_random_uuid() g) n
        RETURNING id`, [shopId, slug, label])).rows[0].id as string;
      await db.query('INSERT INTO page_drafts(shop_id,page_id,template_version_id,config) VALUES($1,$2,$3,$4)', [shopId, pageId, templateId, config]);
      return { shopId, pageId };
    });
  }
  async saveDraft(page: PageRef, expected: number, input: unknown) {
    // The product's Google rules are checked where a shop writes, never where a page is read: a rule added today
    // must not take a page published yesterday off the air (lát F-013).
    await this.onPage('draft:save', page); revision(expected); const config = validateConfig(input); assertPublishable(config);
    return tx(this.pool, async db => {
      await this.openPage(db, page);
      const draft = (await db.query('SELECT revision FROM page_drafts WHERE shop_id=$1 AND page_id=$2 FOR UPDATE', [page.shopId, page.pageId])).rows[0];
      if (!draft || Number(draft.revision) !== expected) error('DRAFT_CONFLICT');
      await db.query('UPDATE page_drafts SET config=$3,revision=revision+1 WHERE shop_id=$1 AND page_id=$2', [page.shopId, page.pageId, config]);
      return expected + 1;
    });
  }
  /**
   * The page's draft started again from another template (Tài 06/10: a shop picks a new look for a page it has): its document
   * and the template it records both change, the revision moves on, and what guests see stays as it is until the next publish.
   */
  async restartDraft(page: PageRef, templateId: string, input: unknown) {
    await this.onPage('draft:save', page); if (!UUID.test(templateId)) error('INVALID_TEMPLATE');
    const config = validateConfig(input); assertPublishable(config);
    return tx(this.pool, async db => {
      await this.openPage(db, page);
      const updated = (await db.query(`UPDATE page_drafts SET config=$3,template_version_id=$4,revision=revision+1 WHERE shop_id=$1 AND page_id=$2 RETURNING revision`,
        [page.shopId, page.pageId, config, templateId])).rows[0];
      if (!updated) error('PAGE_NOT_FOUND');
      return Number(updated.revision);
    });
  }
  /**
   * Vòng đời trang (migration 026, `goi-va-trang.md` mục 5). Paused: guests see "Trang tạm ngừng", nothing is lost, and
   * the page can be resumed. Only a live page pauses. Who may resume depends on why it paused -- the caller says which
   * reasons it may lift (the owner lifts only their own emergency stop; an unpaid plan lifts only by paying, lát P5).
   */
  async pausePage(page: PageRef, reason: PauseReason) {
    await this.onPage('page:pause', page); if (!['emergency', 'admin', 'billing'].includes(reason)) error('INVALID_STATE');
    return tx(this.pool, async db => {
      if ((await this.openPage(db, page, 'UPDATE')).state !== 'active') error('PAGE_NOT_LIVE');
      await db.query("UPDATE pages SET state='paused',paused_at=clock_timestamp(),pause_reason=$3 WHERE shop_id=$1 AND id=$2", [page.shopId, page.pageId, reason]);
    });
  }
  async resumePage(page: PageRef, allowed: readonly PauseReason[]) {
    await this.onPage('page:resume', page);
    return tx(this.pool, async db => {
      const row = await this.openPage(db, page, 'UPDATE');
      if (row.state !== 'paused') error('PAGE_NOT_PAUSED');
      if (!allowed.includes(row.pause_reason!)) error('PAUSE_NOT_YOURS');
      await db.query("UPDATE pages SET state='active',paused_at=NULL,pause_reason=NULL WHERE shop_id=$1 AND id=$2", [page.shopId, page.pageId]);
      return { reason: row.pause_reason! };
    });
  }
  /** Closed for good: the link answers "không tồn tại" and is never issued again. The data stays (goi-va-trang.md mục 9). */
  async closePage(page: PageRef) {
    await this.onPage('page:close', page);
    return tx(this.pool, async db => {
      await this.openPage(db, page, 'UPDATE');
      await db.query("UPDATE pages SET state='closed',closed_at=clock_timestamp(),paused_at=NULL,pause_reason=NULL WHERE shop_id=$1 AND id=$2", [page.shopId, page.pageId]);
    });
  }
  async publish(page: PageRef, expected: number) {
    const actor = await this.onPage('release:publish', page); revision(expected);
    const { shopId, pageId } = page;
    return tx(this.pool, async db => {
      // Lock order everywhere: shop, then page, then what hangs off the page.
      const shop = (await db.query('SELECT publishing_state,name,profile,is_template FROM shops WHERE id=$1 FOR UPDATE', [shopId])).rows[0];
      if (!shop) error('SHOP_NOT_FOUND'); if (shop.publishing_state === 'suspended') error('SHOP_SUSPENDED');
      await this.openPage(db, page, 'UPDATE');
      const draft = (await db.query('SELECT * FROM page_drafts WHERE shop_id=$1 AND page_id=$2 FOR UPDATE', [shopId, pageId])).rows[0];
      if (!draft || Number(draft.revision) !== expected) error('DRAFT_CONFLICT');
      // Checked again on the way out, as guests will see it -- the shop's data in its places (slots.ts): a draft written before
      // a rule existed cannot be published under it, and neither can a page that still leads to a template's sample link.
      const config = validateConfig(draft.config), shown = shownConfig(config, shop);
      assertPublishable(shown);
      if (!shop.is_template && placeholderLinks(shown.doc).length) error('PAGE_NOT_SYNCED');
      // Every uploaded picture on the page must have passed review (migration 023). The page already live stays live.
      await assertMediaApproved(db, shopId, shown);
      const release = (await db.query(`INSERT INTO page_releases(shop_id,page_id,template_version_id,config_snapshot,draft_revision,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,
        [shopId, pageId, draft.template_version_id, config, expected, actor])).rows[0].id;
      // A draft goes live; a paused page takes the new release and stays paused until it is resumed (migration 026).
      await db.query("UPDATE pages SET active_release_id=$3,state=CASE WHEN state='draft' THEN 'active' ELSE state END WHERE shop_id=$1 AND id=$2", [shopId, pageId, release]);
      // The shop is open once any of its pages is: owners sign in to an active shop (lib/owner/auth.ts).
      await db.query("UPDATE shops SET publishing_state='active' WHERE id=$1", [shopId]);
      await db.query('UPDATE page_drafts SET revision=revision+1 WHERE shop_id=$1 AND page_id=$2', [shopId, pageId]);
      return { releaseId: release as string, draftRevision: expected + 1 };
    });
  }
  async rollback(page: PageRef, releaseId: string, expectedActive: string) {
    await this.onPage('release:rollback', page);
    // pages_release_fk holds the release to this page.
    const result = await this.pool.query('UPDATE pages SET active_release_id=$3 WHERE shop_id=$1 AND id=$2 AND active_release_id=$4 RETURNING id',
      [page.shopId, page.pageId, releaseId, expectedActive]);
    if (!result.rowCount) error('RELEASE_CONFLICT');
  }
  async setShopState(shopId: string, state: 'active' | 'suspended') {
    await this.actor('shop:state', shopId); if (!['active','suspended'].includes(state)) error('INVALID_STATE');
    if (!(await this.pool.query('UPDATE shops SET publishing_state=$2 WHERE id=$1', [shopId, state])).rowCount) error('SHOP_NOT_FOUND');
  }
  async createTag(page: PageRef, publicCode: string) {
    await this.onPage('tag:create', page);
    return tx(this.pool, async db => {
      await this.openPage(db, page);
      return (await db.query('INSERT INTO tags(shop_id,page_id,public_code) VALUES($1,$2,$3) RETURNING id', [page.shopId, page.pageId, publicCode])).rows[0].id as string;
    });
  }
  async setTagState(page: PageRef, tagId: string, state: 'tested' | 'active' | 'disabled', previewId?: string) {
    await this.onPage('tag:state', page); if (!['tested','active','disabled'].includes(state)) error('INVALID_STATE');
    await tx(this.pool, async db => {
      const shop = (await db.query('SELECT publishing_state FROM shops WHERE id=$1 FOR SHARE', [page.shopId])).rows[0];
      if (!shop) error('SHOP_NOT_FOUND');
      const live = (await db.query('SELECT state FROM pages WHERE shop_id=$1 AND id=$2 FOR SHARE', [page.shopId, page.pageId])).rows[0];
      if (!live) error('PAGE_NOT_FOUND');
      if (state === 'active' && (shop.publishing_state !== 'active' || live.state !== 'active')) error('SHOP_UNAVAILABLE');
      if (state === 'tested' && !(await db.query(`SELECT 1 FROM published_visit_contexts c JOIN rating_intent_receipts r ON r.visit_id=c.visit_id
        WHERE c.shop_id=$1 AND c.tag_id=$2 AND c.preview_id=$3 AND c.scope='test' LIMIT 1`, [page.shopId, tagId, previewId])).rowCount) error('TAG_TEST_REQUIRED');
      if (!(await db.query('UPDATE tags SET state=$4 WHERE shop_id=$1 AND page_id=$2 AND id=$3', [page.shopId, page.pageId, tagId, state])).rowCount) error('TAG_NOT_FOUND');
    });
  }
  async preview(page: PageRef, source: { kind: 'draft'; revision: number } | { kind: 'release'; id: string }, ttlSeconds = 900, tagId: string | null = null) {
    await this.onPage('preview:create', page);
    if (!Number.isInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > 3600) error('INVALID_EXPIRY');
    const { shopId, pageId } = page;
    return tx(this.pool, async db => {
      await this.openPage(db, page);
      const row = source.kind === 'draft'
        ? (await db.query('SELECT template_version_id,config AS config_snapshot,revision FROM page_drafts WHERE shop_id=$1 AND page_id=$2 AND revision=$3 FOR SHARE', [shopId, pageId, source.revision])).rows[0]
        : (await db.query('SELECT template_version_id,config_snapshot FROM page_releases WHERE shop_id=$1 AND page_id=$2 AND id=$3', [shopId, pageId, source.id])).rows[0];
      if (!row) error('PREVIEW_SOURCE_CONFLICT'); const config = validateConfig(row.config_snapshot);
      // A card previews the page it belongs to, never another page of the shop.
      if (tagId !== null && !(await db.query('SELECT 1 FROM tags WHERE shop_id=$1 AND page_id=$2 AND id=$3', [shopId, pageId, tagId])).rowCount) error('TAG_NOT_FOUND');
      const token = randomBytes(32).toString('hex');
      const created = (await db.query(`INSERT INTO preview_sessions(shop_id,page_id,template_version_id,config_snapshot,source_release_id,source_draft_revision,tag_id,token_hash,expires_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,clock_timestamp()+$9*interval '1 second') RETURNING id,expires_at`,
        [shopId, pageId, row.template_version_id, config, source.kind === 'release' ? source.id : null, source.kind === 'draft' ? source.revision : null, tagId, previewHash(token), ttlSeconds])).rows[0];
      // Returned ONLY to internal authorized caller for out-of-band delivery. Never log/URL/API JSON this token.
      return { id: created.id as string, token, expiresAt: created.expires_at as Date };
    });
  }
}
/**
 * A shop more than 14 days past its paid date (kịch bản mục 3b): its page is off, and every card and link of it goes
 * straight to the shop's own Google review page, so a guest never meets a broken page. Paying turns the page back on.
 */
export class ShopUnpaid extends PublishingError { constructor(public readonly googleUrl: string | null) { super('SHOP_UNPAID'); } }
export class PublishingResolver {
  constructor(private pool: Pool) {}
  async live(target: { slug: string } | { code: string }) {
    // The page as published, and the shop's Google link: the Google button always leads to the shop's own review page (its
    // Place ID), never to a link written into the page, so a link fixed today reaches every page at once.
    const row = 'slug' in target
      ? (await this.pool.query(`SELECT s.id,s.slug shop_slug,s.publishing_state,s.google_url,s.name shop_name,s.profile,s.is_template,p.id page_id,p.slug,p.state page_state,p.active_release_id,p.entry_key,r.config_snapshot,
          tv.template_key,tv.version template_version,NULL::uuid tag_id,${BILLING_COLUMNS('s')} FROM pages p JOIN shops s ON s.id=p.shop_id
        JOIN page_releases r ON r.page_id=p.id AND r.id=p.active_release_id JOIN template_versions tv ON tv.id=r.template_version_id
        WHERE lower(p.slug)=lower($1)`, [target.slug])).rows[0]
      : (await this.pool.query(`SELECT s.id,s.slug shop_slug,s.publishing_state,s.google_url,s.name shop_name,s.profile,s.is_template,p.id page_id,p.slug,p.state page_state,p.active_release_id,p.entry_key,r.config_snapshot,
          tv.template_key,tv.version template_version,t.id tag_id,t.state tag_state,${BILLING_COLUMNS('s')} FROM tags t
        JOIN pages p ON p.id=t.page_id JOIN shops s ON s.id=p.shop_id JOIN page_releases r ON r.page_id=p.id AND r.id=p.active_release_id
        JOIN template_versions tv ON tv.id=r.template_version_id WHERE t.public_code=$1`, [target.code])).rows[0];
    if (!row || row.publishing_state !== 'active' || ('code' in target && row.tag_state !== 'active')) error('PAGE_UNAVAILABLE');
    // A closed page does not exist any more; a paused one says so, rather than looking broken (migration 026).
    if (row.page_state === 'closed') error('PAGE_CLOSED');
    if (billingRow(row).state === 'off') throw new ShopUnpaid(row.google_url ?? null);
    if (row.page_state === 'paused') error('PAGE_PAUSED');
    if (row.page_state !== 'active') error('PAGE_UNAVAILABLE');
    const context: RenderContext = { v: 1, shopId: row.id, releaseId: row.active_release_id, tagId: row.tag_id, previewId: null, scope: 'live', entryKey: row.tag_id ? `tag:${row.tag_id}` : row.entry_key };
    // The organizers' events /gov has opened for the shop (khúc B): not part of any release, so opening or closing one
    // changes every page of the shop at once, with nothing to publish.
    return { slug: row.slug as string, shopSlug: row.shop_slug as string, pageId: row.page_id as string, template: row.template_key as string, templateVersion: Number(row.template_version),
      config: shownConfig(validateConfig(row.config_snapshot), { name: row.shop_name, profile: row.profile, is_template: row.is_template }),
      googleUrl: row.google_url as string | null, context,
      events: await openEvents(this.pool, row.id) };
  }
  async preview(token: string) {
    if (!/^[a-f0-9]{64}$/.test(token)) error('PREVIEW_UNAVAILABLE');
    const row = (await this.pool.query(`SELECT v.*,p.slug,s.slug shop_slug,p.state page_state,s.publishing_state,s.google_url,s.name shop_name,s.profile,s.is_template,t.state tag_state,tv.template_key,tv.version template_version FROM preview_sessions v
      JOIN shops s ON s.id=v.shop_id JOIN pages p ON p.id=v.page_id JOIN template_versions tv ON tv.id=v.template_version_id
      LEFT JOIN tags t ON t.shop_id=v.shop_id AND t.id=v.tag_id WHERE v.token_hash=$1 AND v.expires_at>clock_timestamp()`, [previewHash(token)])).rows[0];
    if (!row || row.publishing_state === 'suspended' || row.tag_state === 'disabled' || row.page_state === 'closed') error('PREVIEW_UNAVAILABLE');
    const context: RenderContext = { v: 1, shopId: row.shop_id, releaseId: row.source_release_id, tagId: row.tag_id, previewId: row.id, scope: 'test', entryKey: `preview:${row.id}` };
    return { slug: row.slug as string, shopSlug: row.shop_slug as string, pageId: row.page_id as string, template: row.template_key as string, templateVersion: Number(row.template_version),
      config: shownConfig(validateConfig(row.config_snapshot), { name: row.shop_name, profile: row.profile, is_template: row.is_template }),
      googleUrl: row.google_url as string | null, context, expiresAt: row.expires_at as Date, events: await openEvents(this.pool, row.shop_id) };
  }
}
