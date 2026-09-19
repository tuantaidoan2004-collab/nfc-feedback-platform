import { randomBytes } from 'node:crypto';
import type { Pool } from 'pg';
import { PublishingAdmin } from '../publishing/repository';
import { PublishingError, templateConfig, validateConfig } from '../publishing/config';
import { OwnerSetupLinks, ownerEmail } from '../owner/setup-link';
import { loginBucket, passwordKey, transaction, username } from '../owner/auth';
import { recordAdminAction } from './audit';
import { AdminError } from './auth';
import { shortCode, withShortCode } from '../short-code';

// Opaque and short (lib/short-code.ts). A slug is a name only in the sense that it appears in a URL: a shop can be
// given a real one later without breaking anything, because cards carry the tag code and history keys off the id.

const TEMPLATE_KEY = 'standard';
// Test sign-in for the template shop. Weak on purpose and refused in production; see ensureTemplateAccount.
const TEMPLATE_USERNAME = 'yourshop', TEMPLATE_PASSWORD = '1';
const duplicate = (error: unknown) => typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';

export type ProvisionedShop = {
  shopId: string; slug: string; tagCode: string;
  ownerUserId: string; ownerUsername: string; ownerEmail: string;
  setupToken: string; setupExpiresAt: Date;
};

export type ProvisionInput = { name?: unknown; ownerUsername?: unknown; ownerEmail?: unknown; googleUrl?: unknown };

const printable = (value: string) => ![...value].some(character => (character.codePointAt(0) ?? 0) < 32 || '<>'.includes(character));
const shopName = (value: unknown) =>
  typeof value === 'string' && value.trim() && value.trim().length <= 100 && printable(value) ? value.trim() : null;

const googleLink = (value: unknown) => {
  if (value === undefined || value === null || value === '') return 'https://maps.google.com/';
  if (typeof value !== 'string') return null;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : null; } catch { return null; }
};

export class ShopProvisioning {
  constructor(private pool: Pool) {}

  /**
   * The template shop every new shop is cloned from, created on first need. Safe to call concurrently and to call
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
        return { shopId: row.id, slug: row.slug };
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
        const draft = (await this.pool.query('SELECT revision FROM page_drafts WHERE shop_id=$1', [row.id])).rows[0];
        const revision = draft ? Number(draft.revision) : await admin.createDraft(row.id, await this.template(admin), templateConfig());
        await admin.publish(row.id, revision);
        continue;
      } catch (error) {
        if (!(duplicate(error) || (error instanceof PublishingError && error.code === 'DRAFT_CONFLICT'))) throw error;
      }
      // Another caller is part way through the same steps; give it a moment, then look again.
      await new Promise(resolve => setTimeout(resolve, 25 + attempt * 10));
    }
    throw new AdminError(503, 'TEMPLATE_UNAVAILABLE');
  }

  /**
   * Publishes today's built-in defaults (templateConfig) on the template as a new release, so the operator can
   * adopt new defaults without an editor (Tài, 2026-09-18). Older releases stay in history, and shops made earlier
   * keep the page they were cloned with; only shops created afterwards start from the new one.
   */
  async resetTemplate(actorId: string) {
    const template = await this.ensureTemplate(actorId);
    const admin = new PublishingAdmin(this.pool, async () => ({ actorId }));
    const draft = Number((await this.pool.query('SELECT revision FROM page_drafts WHERE shop_id=$1', [template.shopId])).rows[0].revision);
    const saved = await admin.saveDraft(template.shopId, draft, templateConfig());
    const { releaseId } = await admin.publish(template.shopId, saved);
    await recordAdminAction(this.pool, actorId, { action: 'template.reset', shopId: template.shopId, detail: { releaseId } });
    return { ...template, releaseId };
  }

  /**
   * A sign-in to the template's own dashboard, for testing: username `yourshop`, password `1`, as Tài asked on
   * 2026-09-17. It deliberately bypasses the 12-character minimum, so the caller must refuse it in production
   * (`allowed`). An existing account is attached to the template but its password is never reset here. Rotating it
   * belongs to the planned tightening of every password.
   */
  async ensureTemplateAccount(actorId: string, allowed: boolean) {
    if (!allowed) throw new AdminError(403, 'TEST_ACCOUNT_FORBIDDEN');
    const template = await this.ensureTemplate(actorId);
    const salt = randomBytes(16).toString('hex'), key = (await passwordKey(TEMPLATE_PASSWORD, salt)).toString('hex');
    return transaction(this.pool, async db => {
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended('nfc-template-account',0))");
      let user = (await db.query('SELECT id FROM owner_identities_v2 WHERE username=$1', [TEMPLATE_USERNAME])).rows[0];
      const created = !user;
      if (!user) user = (await db.query('INSERT INTO owner_identities_v2(username,password_salt,password_key)VALUES($1,$2,$3)RETURNING id',
        [TEMPLATE_USERNAME, salt, key])).rows[0];
      await db.query(`INSERT INTO owner_memberships_v2(user_id,shop_id,role)VALUES($1,$2,'owner')
        ON CONFLICT(user_id,shop_id) DO UPDATE SET active=true,role='owner'`, [user.id, template.shopId]);
      if (created) await recordAdminAction(db, actorId, { action: 'template.account.create', shopId: template.shopId, onBehalfOf: user.id,
        detail: { username: TEMPLATE_USERNAME, weakPassword: true } });
      return { username: TEMPLATE_USERNAME, created, slug: template.slug };
    });
  }

  /**
   * Production's way into the template's dashboard (lát F6, 2026-09-19). `yourshop / 1` is refused there, which left
   * no way to edit the template at all. Here the account is created closed, like a shop owner's, and Tài gets a
   * single-use link to choose a strong password; asking again issues a fresh link and clears the sign-in throttle.
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
      else await db.query('UPDATE owner_identities_v2 SET active=true WHERE id=$1', [user.id]);
      await db.query(`INSERT INTO owner_memberships_v2(user_id,shop_id,role)VALUES($1,$2,'owner')
        ON CONFLICT(user_id,shop_id) DO UPDATE SET active=true,role='owner'`, [user.id, template.shopId]);
      await db.query('DELETE FROM owner_login_limits WHERE bucket=$1', [loginBucket(TEMPLATE_USERNAME)]);
      const link = await new OwnerSetupLinks(this.pool).write(db, user.id, created ? 'setup' : 'reset');
      await recordAdminAction(db, actorId, { action: 'template.account.link', shopId: template.shopId, onBehalfOf: user.id,
        detail: { username: TEMPLATE_USERNAME, created } });
      return { username: TEMPLATE_USERNAME, created, slug: template.slug, setupToken: link.token, expiresAt: link.expiresAt };
    });
  }

  /**
   * Puts the template's test sign-in back to `yourshop` / `1` and clears that username's sign-in throttle, for when
   * the password is unknown or too many attempts locked it out (Tài, 2026-09-18). Same production refusal as
   * issuing it: the password is deliberately weak.
   */
  async resetTemplateAccount(actorId: string, allowed: boolean) {
    if (!allowed) throw new AdminError(403, 'TEST_ACCOUNT_FORBIDDEN');
    const template = await this.ensureTemplate(actorId);
    const salt = randomBytes(16).toString('hex'), key = (await passwordKey(TEMPLATE_PASSWORD, salt)).toString('hex');
    return transaction(this.pool, async db => {
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended('nfc-template-account',0))");
      const existing = (await db.query('SELECT id FROM owner_identities_v2 WHERE username=$1', [TEMPLATE_USERNAME])).rows[0];
      const user = existing
        ? (await db.query('UPDATE owner_identities_v2 SET password_salt=$2,password_key=$3,active=true WHERE id=$1 RETURNING id', [existing.id, salt, key])).rows[0]
        : (await db.query('INSERT INTO owner_identities_v2(username,password_salt,password_key)VALUES($1,$2,$3)RETURNING id', [TEMPLATE_USERNAME, salt, key])).rows[0];
      await db.query(`INSERT INTO owner_memberships_v2(user_id,shop_id,role)VALUES($1,$2,'owner')
        ON CONFLICT(user_id,shop_id) DO UPDATE SET active=true,role='owner'`, [user.id, template.shopId]);
      await db.query('DELETE FROM owner_login_limits WHERE bucket=$1', [loginBucket(TEMPLATE_USERNAME)]);
      await recordAdminAction(db, actorId, { action: 'template.account.reset', shopId: template.shopId, onBehalfOf: user.id,
        detail: { username: TEMPLATE_USERNAME, weakPassword: true, created: !existing } });
      return { username: TEMPLATE_USERNAME, created: !existing, slug: template.slug };
    });
  }

  private async templateRow() {
    return (await this.pool.query('SELECT id,slug,active_release_id FROM shops WHERE is_template')).rows[0] as
      { id: string; slug: string; active_release_id: string | null } | undefined;
  }

  /** The configuration a new shop starts from: the template's live release, with the new shop's own name and link. */
  private async fromTemplate(actorId: string, name: string, googleUrl: string) {
    const template = await this.ensureTemplate(actorId);
    const release = (await this.pool.query(`SELECT r.config_snapshot FROM shops s JOIN page_releases r ON r.shop_id=s.id AND r.id=s.active_release_id
      WHERE s.id=$1`, [template.shopId])).rows[0];
    if (!release) throw new AdminError(503, 'TEMPLATE_UNAVAILABLE');
    return validateConfig({ ...release.config_snapshot, name, googleUrl });
  }

  /**
   * Creates a shop, its first release (cloned from the template shop), a tag, and an owner who has not chosen a
   * password yet, then returns the single-use link to hand over.
   *
   * The steps cannot share one transaction because PublishingAdmin opens its own per call, so the order is
   * what keeps a failure harmless. A taken username or address is checked before anything is written, and
   * publishing comes last: until that line the shop has no active release, the resolver refuses it, and a
   * failure anywhere above leaves a dark row rather than a live page nobody owns.
   */
  async create(actorId: string, input: ProvisionInput): Promise<ProvisionedShop> {
    const name = shopName(input.name), owner = username(input.ownerUsername);
    const email = ownerEmail(input.ownerEmail), google = googleLink(input.googleUrl);
    if (!name || !owner || !email || !google) throw new AdminError(400, 'INVALID_INPUT');
    if ((await this.pool.query('SELECT 1 FROM owner_identities_v2 WHERE username=$1 OR email=$2', [owner, email])).rowCount)
      throw new AdminError(409, 'OWNER_ALREADY_EXISTS');
    // Read before the shop row exists, so a missing or broken template stops the run with nothing written for this shop.
    const config = await this.fromTemplate(actorId, name, google);

    const admin = new PublishingAdmin(this.pool, async () => ({ actorId }));
    const { slug, shopId } = await withShortCode(async slug => ({ slug,
      shopId: (await this.pool.query('INSERT INTO shops(slug,name,google_url)VALUES($1,$2,$3)RETURNING id', [slug, name, google])).rows[0].id as string }));

    const template = await this.template(admin);
    await admin.createDraft(shopId, template, config);

    // Prepared, not active: the card still has to be written and tested before anyone can scan it.
    const tagCode = await withShortCode(async code => { await admin.createTag(shopId, code); return code; });

    const links = new OwnerSetupLinks(this.pool);
    const provisioned = await links.provision(owner, email, async () => {});
    await this.pool.query("INSERT INTO owner_memberships_v2(user_id,shop_id,role)VALUES($1,$2,'owner')", [provisioned.userId, shopId]);
    await admin.publish(shopId, 1);

    await recordAdminAction(this.pool, actorId, { action: 'shop.create', shopId, detail: { slug, tagCode, ownerUsername: owner } });
    return { shopId, slug, tagCode, ownerUserId: provisioned.userId, ownerUsername: owner, ownerEmail: provisioned.email,
      setupToken: provisioned.link.token, setupExpiresAt: provisioned.link.expiresAt };
  }

  /** One shared template rather than one per shop: every shop renders through the same versioned renderer. */
  private async template(admin: PublishingAdmin) {
    const found = (await this.pool.query('SELECT id FROM template_versions WHERE template_key=$1 AND version=1', [TEMPLATE_KEY])).rows[0];
    return (found?.id as string) ?? await admin.createTemplate(TEMPLATE_KEY, 1);
  }

  /** What the administrative table shows: one row per shop, with what is needed to act on it. */
  async list() {
    return (await this.pool.query(`SELECT s.id,s.slug,s.name,s.publishing_state,s.is_template,
        (SELECT count(*)::int FROM tags t WHERE t.shop_id=s.id) tags,
        (SELECT count(*)::int FROM tags t WHERE t.shop_id=s.id AND t.state='active') active_tags,
        i.id owner_user_id,i.username owner_username,i.email owner_email,
        (SELECT max(p.opened_at) FROM page_visits p WHERE p.shop_id=s.id) last_seen,
        COALESCE((SELECT CASE WHEN g.permission='level' THEN g.level WHEN g.enabled THEN 'view' ELSE 'off' END FROM shop_support_grant_events g
          WHERE g.shop_id=s.id AND g.permission IN ('feedback','level') ORDER BY g.id DESC LIMIT 1),'off') support_level
      FROM shops s
      LEFT JOIN owner_memberships_v2 m ON m.shop_id=s.id AND m.active
      LEFT JOIN owner_identities_v2 i ON i.id=m.user_id
      ORDER BY s.is_template DESC,s.slug`)).rows;
  }
}
