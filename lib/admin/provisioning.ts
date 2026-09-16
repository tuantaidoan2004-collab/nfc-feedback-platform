import { randomBytes } from 'node:crypto';
import type { Pool } from 'pg';
import { PublishingAdmin } from '../publishing/repository';
import { defaultConfig } from '../publishing/config';
import { OwnerSetupLinks, ownerEmail } from '../owner/setup-link';
import { username } from '../owner/auth';
import { recordAdminAction } from './audit';
import { AdminError } from './auth';

// Opaque and short. A slug is a name only in the sense that it appears in a URL: a shop can be given a real
// one later without breaking anything, because cards carry the tag code and every history row keys off the id.
const code = (length: number) => randomBytes(32).toString('base64url').replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, length);

const TEMPLATE_KEY = 'standard';

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
   * Creates a shop, its first release, a tag, and an owner who has not chosen a password yet, then returns the
   * single-use link to hand over.
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

    const admin = new PublishingAdmin(this.pool, async () => ({ actorId }));
    const slug = code(12);
    const shopId = (await this.pool.query('INSERT INTO shops(slug,name,google_url)VALUES($1,$2,$3)RETURNING id',
      [slug, name, google])).rows[0].id as string;

    const template = await this.template(admin);
    await admin.createDraft(shopId, template, { ...defaultConfig(name), googleUrl: google });

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
    return (await this.pool.query(`SELECT s.id,s.slug,s.name,s.publishing_state,
        (SELECT count(*)::int FROM tags t WHERE t.shop_id=s.id) tags,
        (SELECT count(*)::int FROM tags t WHERE t.shop_id=s.id AND t.state='active') active_tags,
        i.username owner_username,i.email owner_email,
        (SELECT max(p.opened_at) FROM page_visits p WHERE p.shop_id=s.id) last_seen
      FROM shops s
      LEFT JOIN owner_memberships_v2 m ON m.shop_id=s.id AND m.active
      LEFT JOIN owner_identities_v2 i ON i.id=m.user_id
      ORDER BY s.slug`)).rows;
  }
}
