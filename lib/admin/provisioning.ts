import { randomBytes } from 'node:crypto';
import type { Pool } from 'pg';
import { PublishingAdmin } from '../publishing/repository';
import { PublishingError, templateConfig, validateConfig } from '../publishing/config';
import { OwnerSetupLinks, ownerEmail } from '../owner/setup-link';
import { username } from '../owner/auth';
import { recordAdminAction } from './audit';
import { AdminError } from './auth';

// Opaque and short. A slug is a name only in the sense that it appears in a URL: a shop can be given a real
// one later without breaking anything, because cards carry the tag code and every history row keys off the id.
const code = (length: number) => randomBytes(32).toString('base64url').replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, length);

const TEMPLATE_KEY = 'standard';
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
          await this.pool.query("INSERT INTO shops(slug,name,google_url,is_template)VALUES($1,'YOUR SHOP','https://maps.google.com/',true)", [code(12)]);
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
    const slug = code(12);
    const shopId = (await this.pool.query('INSERT INTO shops(slug,name,google_url)VALUES($1,$2,$3)RETURNING id',
      [slug, name, google])).rows[0].id as string;

    const template = await this.template(admin);
    await admin.createDraft(shopId, template, config);

    // Prepared, not active: the card still has to be written and tested before anyone can scan it.
    const tagCode = code(12);
    await admin.createTag(shopId, tagCode);

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
        COALESCE((SELECT g.enabled FROM shop_support_grant_events g WHERE g.shop_id=s.id AND g.permission='feedback' ORDER BY g.id DESC LIMIT 1),false) feedback_support
      FROM shops s
      LEFT JOIN owner_memberships_v2 m ON m.shop_id=s.id AND m.active
      LEFT JOIN owner_identities_v2 i ON i.id=m.user_id
      ORDER BY s.is_template DESC,s.slug`)).rows;
  }
}
