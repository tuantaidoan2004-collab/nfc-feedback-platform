import { randomBytes } from 'node:crypto';
import type { Pool } from 'pg';
import { PublishingAdmin } from '../publishing/repository';
import { PublishingError } from '../publishing/config';
import { googleUrlProblem } from '../publishing/policy';
import { parsePlaceId, reviewLink } from '../google/place-id';
import { OwnerSetupLinks, ownerEmail } from '../owner/setup-link';
import { loginBucket, transaction, username } from '../owner/auth';
import { BILLING_COLUMNS, billingRow } from '../billing/plans';
import { recordAdminAction } from './audit';
import { AdminError } from './auth';
import { shortCode, withShortCode } from '../short-code';
import { DEFAULT_TEMPLATE, pageFromTemplate, pageTemplate } from '../canvas/templates';
import { pageLabel } from '../owner/page-names';

// Opaque and short (lib/short-code.ts). A slug is a name only in the sense that it appears in a URL: a shop can be
// given a real one later without breaking anything, because cards carry the tag code and history keys off the id.

// The template shop's own sign-in. Its password is always chosen through a single-use link (templateAccountLink).
const TEMPLATE_USERNAME = 'yourshop';
const duplicate = (error: unknown) => typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';

export type ProvisionedShop = {
  shopId: string; pageId: string; slug: string; tagCode: string;
  ownerUserId: string; ownerUsername: string; ownerEmail: string;
  setupToken: string; setupExpiresAt: Date;
};

export type ProvisionInput = { name?: unknown; ownerUsername?: unknown; ownerEmail?: unknown; placeId?: unknown; templateKey?: unknown };

/** A canvas template's key (lib/canvas/templates.ts); absent means the hidden start page. */
const chosenTemplate = (value: unknown): string | null => value === undefined ? DEFAULT_TEMPLATE : pageTemplate(value)?.key ?? null;

const printable = (value: string) => ![...value].some(character => (character.codePointAt(0) ?? 0) < 32 || '<>'.includes(character));
export const shopName = (value: unknown) =>
  typeof value === 'string' && value.trim() && value.trim().length <= 100 && printable(value) ? value.trim() : null;

/**
 * The shop's Place ID (Tài 05/10: pasted by hand, like the owner does in onboarding) and the review link built from it.
 * Absent: the generic link every page starts with, until the shop supplies its own.
 */
const placeOf = (value: unknown) => {
  if (value === undefined || value === null || value === '') return { placeId: null, url: 'https://maps.google.com/' };
  const placeId = parsePlaceId(value);
  // The same rule the page editor applies (policy.ts): the Google button leads to Google and nowhere else (A7).
  return placeId && !googleUrlProblem(reviewLink(placeId)) ? { placeId, url: reviewLink(placeId) } : null;
};

export class ShopProvisioning {
  constructor(private pool: Pool) {}

  /**
   * The platform's sample shop ("YOUR SHOP", signed into as `yourshop`), created on first need with a page from the
   * default template; new shops start from the template chosen for them, not from this shop. Safe to call concurrently and to call
   * again after a half-finished run. No lock is held while waiting: a lock on one pooled connection while the
   * publish needs another starves a small pool (production has three) and every caller waits on every other.
   * Instead each step tolerates a racing twin (the unique index, the draft key, the draft revision) and a caller
   * that finds the work half done finishes it, retrying briefly while another caller is mid-publish.
   */
  async ensureTemplate(actorId: string) {
    let created = false;
    for (let attempt = 0; attempt < 20; attempt++) {
      let row = await this.templateRow();
      if (row?.active_release_id) {
        if (created) await recordAdminAction(this.pool, actorId, { action: 'template.create', shopId: row.id, detail: { slug: row.slug } });
        return { shopId: row.id, slug: row.slug, pageId: row.page_id! };
      }
      if (!row) {
        try {
          // A taken slug lands in the same catch as a racing twin: the loop simply tries again with a new code.
          await this.pool.query("INSERT INTO shops(slug,name,google_url,is_template)VALUES($1,'YOUR SHOP','https://maps.google.com/',true)", [shortCode(6)]);
          created = true;
        } catch (error) { if (!duplicate(error)) throw error; }
        row = (await this.templateRow())!;
      }
      const admin = new PublishingAdmin(this.pool, async () => ({ actorId }));
      try {
        // The template shop has one page, at the shop's own link (migration 024).
        const page = row.page_id ? { shopId: row.id, pageId: row.page_id }
          : await admin.createPage(row.id, await this.template(admin, DEFAULT_TEMPLATE), pageFromTemplate(DEFAULT_TEMPLATE, 'YOUR SHOP'), row.slug, pageLabel(0));
        const draft = (await this.pool.query('SELECT revision FROM page_drafts WHERE page_id=$1', [page.pageId])).rows[0];
        await admin.publish(page, Number(draft.revision));
        continue;
      } catch (error) {
        if (!(duplicate(error) || (error instanceof PublishingError && error.code === 'DRAFT_CONFLICT'))) throw error;
      }
      // Another caller is part way through the same steps; give it a moment, then look again.
      await new Promise(resolve => setTimeout(resolve, 25 + attempt * 10));
    }
    throw new AdminError(503, 'TEMPLATE_UNAVAILABLE');
  }

  /** Puts the sample shop's page back to a fresh copy of the default template and publishes it. Older releases stay in history. */
  async resetTemplate(actorId: string) {
    const template = await this.ensureTemplate(actorId);
    const admin = new PublishingAdmin(this.pool, async () => ({ actorId }));
    const page = { shopId: template.shopId, pageId: template.pageId };
    const draft = Number((await this.pool.query('SELECT revision FROM page_drafts WHERE page_id=$1', [page.pageId])).rows[0].revision);
    const saved = await admin.saveDraft(page, draft, pageFromTemplate(DEFAULT_TEMPLATE, 'YOUR SHOP'));
    const { releaseId } = await admin.publish(page, saved);
    await recordAdminAction(this.pool, actorId, { action: 'template.reset', shopId: template.shopId, detail: { releaseId } });
    return { ...template, releaseId };
  }

  /**
   * The only way into the template's dashboard, in every environment (lát F6, 2026-09-19; since 27/09 also outside
   * production, where a fixed `yourshop / 1` used to be issued -- it would have been public the day the repo was).
   * The account is closed until the link is used, like a shop owner's. Asking again closes it again (a new random
   * key, so no older password still opens it), issues a fresh link and clears the sign-in throttle.
   */
  async templateAccountLink(actorId: string) {
    const template = await this.ensureTemplate(actorId);
    return transaction(this.pool, async db => {
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended('nfc-template-account',0))");
      let user = (await db.query('SELECT id FROM owner_identities_v2 WHERE username=$1', [TEMPLATE_USERNAME])).rows[0];
      const created = !user;
      // A random key that no password matches: the account stays closed until the link is used.
      if (!user) user = (await db.query('INSERT INTO owner_identities_v2(username,password_salt,password_key)VALUES($1,$2,$3)RETURNING id',
        [TEMPLATE_USERNAME, randomBytes(16).toString('hex'), randomBytes(32).toString('hex')])).rows[0];
      else await db.query('UPDATE owner_identities_v2 SET password_salt=$2,password_key=$3,active=true WHERE id=$1',
        [user.id, randomBytes(16).toString('hex'), randomBytes(32).toString('hex')]);
      await db.query(`INSERT INTO owner_memberships_v2(user_id,shop_id,role)VALUES($1,$2,'owner')
        ON CONFLICT(user_id,shop_id) DO UPDATE SET active=true,role='owner'`, [user.id, template.shopId]);
      // Closed means closed: a browser still signed in with the old password is signed out too.
      if (!created) await db.query('UPDATE owner_auth_sessions_v2 SET revoked_at=clock_timestamp() WHERE user_id=$1 AND revoked_at IS NULL', [user.id]);
      await db.query("DELETE FROM owner_login_limits WHERE bucket=$1 OR bucket LIKE $1||':%'", [loginBucket(TEMPLATE_USERNAME)]);
      const link = await new OwnerSetupLinks(this.pool).write(db, user.id, created ? 'setup' : 'reset');
      await recordAdminAction(db, actorId, { action: 'template.account.link', shopId: template.shopId, onBehalfOf: user.id,
        detail: { username: TEMPLATE_USERNAME, created } });
      return { username: TEMPLATE_USERNAME, created, slug: template.slug, setupToken: link.token, expiresAt: link.expiresAt };
    });
  }

  private async templateRow() {
    return (await this.pool.query(`SELECT s.id,s.slug,p.id page_id,p.active_release_id FROM shops s LEFT JOIN pages p ON p.shop_id=s.id
      WHERE s.is_template ORDER BY p.created_at,p.id LIMIT 1`)).rows[0] as
      { id: string; slug: string; page_id: string | null; active_release_id: string | null } | undefined;
  }

  /**
   * Creates a shop, its first release (a copy of the chosen template with the shop's name), a tag, and an owner who has not chosen a
   * password yet, then returns the single-use link to hand over.
   *
   * The steps cannot share one transaction because PublishingAdmin opens its own per call, so the order is
   * what keeps a failure harmless. A taken username or address is checked before anything is written, and
   * publishing comes last: until that line the shop has no active release, the resolver refuses it, and a
   * failure anywhere above leaves a dark row rather than a live page nobody owns.
   */
  async create(actorId: string, input: ProvisionInput): Promise<ProvisionedShop> {
    const name = shopName(input.name), owner = username(input.ownerUsername);
    const email = ownerEmail(input.ownerEmail), place = placeOf(input.placeId), key = chosenTemplate(input.templateKey);
    if (!name || !owner || !email || !place || !key) throw new AdminError(400, 'INVALID_INPUT');
    if ((await this.pool.query('SELECT 1 FROM owner_identities_v2 WHERE username=$1 OR email=$2', [owner, email])).rowCount)
      throw new AdminError(409, 'OWNER_ALREADY_EXISTS');
    let provisioned!: Awaited<ReturnType<OwnerSetupLinks['provision']>>;
    const shop = await this.build(actorId, name, place, key, async shopId => {
      provisioned = await new OwnerSetupLinks(this.pool).provision(owner, email, async () => {});
      await this.pool.query("INSERT INTO owner_memberships_v2(user_id,shop_id,role)VALUES($1,$2,'owner')", [provisioned.userId, shopId]);
    });
    await recordAdminAction(this.pool, actorId, { action: 'shop.create', shopId: shop.shopId, detail: { slug: shop.slug, tagCode: shop.tagCode, ownerUsername: owner, templateKey: key } });
    return { ...shop, ownerUserId: provisioned.userId, ownerUsername: owner, ownerEmail: provisioned.email,
      setupToken: provisioned.link.token, setupExpiresAt: provisioned.link.expiresAt };
  }

  /**
   * A shop, its first page (a copy of the chosen template's document with the shop's name), a card and its owner,
   * published last.
   *
   * The steps cannot share one transaction because PublishingAdmin opens its own per call, so the order is what keeps
   * a failure harmless. Publishing comes last: until that line the shop has no active release, the resolver refuses
   * it, and a failure anywhere above leaves a dark row rather than a live page nobody owns. `owner` attaches the owner
   * to the new shop before it goes live.
   */
  private async build(actorId: string, name: string, place: { placeId: string | null; url: string }, key: string, owner: (shopId: string) => Promise<void>) {
    // Made before the shop row exists, so a broken template stops the run with nothing written for this shop. The Google
    // link is the shop's (shops.google_url), never the page's.
    const config = pageFromTemplate(key, name);
    const admin = new PublishingAdmin(this.pool, async () => ({ actorId }));
    // The shop's first page shares the shop's code, so its link is the one the shop is known by. A code already taken
    // by any page counts as taken: links are never reissued (migration 024).
    const { slug, shopId } = await withShortCode(async slug => {
      if ((await this.pool.query('SELECT 1 FROM pages WHERE lower(slug)=lower($1)', [slug])).rowCount) throw Object.assign(new Error('PAGE_SLUG_TAKEN'), { code: '23505' });
      return { slug, shopId: (await this.pool.query('INSERT INTO shops(slug,name,google_url,place_id)VALUES($1,$2,$3,$4)RETURNING id', [slug, name, place.url, place.placeId])).rows[0].id as string };
    });
    const template = await this.template(admin, key);
    const page = await admin.createPage(shopId, template, config, slug, pageLabel(0));
    // Prepared, not active: the card still has to be written and tested before anyone can scan it.
    const tagCode = await withShortCode(async code => { await admin.createTag(page, code); return code; });
    await owner(shopId);
    await admin.publish(page, 1);
    return { shopId, pageId: page.pageId, slug, tagCode };
  }

  /**
   * One shared row per template rather than one per shop, recording where a page started. Created on first use; a
   * racing twin lands on the unique (template_key, version) and the loser reads its row.
   */
  private async template(admin: PublishingAdmin, key: string) {
    const version = 1;
    const find = async () => (await this.pool.query('SELECT id FROM template_versions WHERE template_key=$1 AND version=$2', [key, version])).rows[0]?.id as string | undefined;
    const found = await find(); if (found) return found;
    try { return await admin.createTemplate(key, version); }
    catch (error) { const raced = duplicate(error) ? await find() : undefined; if (raced) return raced; throw error; }
  }

  /** What the administrative table shows: one row per shop, with what is needed to act on it. */
  async list() {
    const shops = await this.shopRows();
    const pages = (await this.pool.query('SELECT shop_id,count(*)::int n FROM pages GROUP BY shop_id')).rows as { shop_id: string; n: number }[];
    return shops.map(({ billing_plan, billing_paid_until, billing_today, billing_activate_by, billing_main_slug, billing_main_name, ...shop }) =>
      ({ ...shop, pages: pages.find(page => page.shop_id === shop.id)?.n ?? 0,
        billing: billingRow({ billing_plan, billing_paid_until, billing_today, billing_activate_by, billing_main_slug, billing_main_name }) }));
  }
  private async shopRows() {
    return (await this.pool.query(`SELECT s.id,s.slug,s.name,s.publishing_state,s.is_template,${BILLING_COLUMNS('s')},
        (SELECT count(*)::int FROM tags t WHERE t.shop_id=s.id) tags,
        (SELECT count(*)::int FROM tags t WHERE t.shop_id=s.id AND t.state='active') active_tags,
        i.id owner_user_id,i.username owner_username,i.email owner_email,
        (SELECT max(p.opened_at) FROM page_visits p WHERE p.shop_id=s.id) last_seen,
        (SELECT count(*)::int FROM edit_requests e WHERE e.shop_id=s.id AND e.outcome='published') edits_published,
        COALESCE((SELECT CASE WHEN g.permission='level' THEN g.level WHEN g.enabled THEN 'view' ELSE 'off' END FROM shop_support_grant_events g
          WHERE g.shop_id=s.id AND g.permission IN ('feedback','level') ORDER BY g.id DESC LIMIT 1),'off') support_level
      FROM shops s
      LEFT JOIN owner_memberships_v2 m ON m.shop_id=s.id AND m.active AND m.role='owner'
      LEFT JOIN owner_identities_v2 i ON i.id=m.user_id
      ORDER BY s.is_template DESC,s.slug`)).rows;
  }
}
