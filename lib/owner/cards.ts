import type { Pool } from 'pg';
import { authorize, requirePermission, transaction, OwnerError, type OwnerCredential } from './auth';
import { recordActivity } from './activity';
import { withShortCode } from '../short-code';
import { pageOf } from './pages';

/**
 * The shop's NFC cards (lát E, 2026-09-18). "Nhân bản thẻ" makes another card for the same page: one page, many
 * cards, each with its own short code and name, so figures split by card. Anyone who runs the shop may add, rename
 * and switch a card off; only the owner switches a card on, because a live card sends guests straight to the page.
 * Support never changes cards, at any switch position.
 */
export type CardState = 'prepared' | 'tested' | 'active' | 'disabled';
export type Card = { id: string; code: string; label: string; state: CardState; page: string };

const label = (value: unknown) => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 60 || /[\u0000-\u001f<>]/.test(value)) throw new OwnerError(400, 'INVALID_CARD');
  return value.trim();
};
const shape = (value: unknown, keys: string[]) => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join() !== [...keys].sort().join()) throw new OwnerError(400, 'INVALID_CARD');
  return value as Record<string, unknown>;
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class OwnerCards {
  constructor(private pool: Pool) {}

  async list(credential: OwnerCredential, slug: string) {
    return transaction(this.pool, async db => {
      const access = await authorize(db, credential, slug, 'cards');
      // Every card of the shop, each with the link of the page it opens (migration 024).
      const cards = (await db.query(`SELECT t.id,t.public_code code,t.location_label label,t.state,p.slug page FROM tags t JOIN pages p ON p.id=t.page_id
        WHERE t.shop_id=$1 ORDER BY t.state='disabled',t.public_code`, [access.shopId])).rows as Card[];
      const active = cards.filter(card => card.state === 'active').length;
      // No fee per card: a card only holds a link and is sold on its own. A shop pays for a plan (lib/billing/plans.ts).
      return { cards, active, canActivate: access.actor.kind === 'owner' && access.role === 'owner' };
    });
  }

  /** A new card for one page of the shop: `pageSlug`, or the shop's first page when absent (lib/owner/pages.ts). */
  async create(credential: OwnerCredential, slug: string, body: unknown, pageSlug?: string | null) {
    const name = label(shape(body, ['label']).label);
    const { access, page } = await transaction(this.pool, async db => {
      const a = await authorize(db, credential, slug, 'write'); requirePermission(a, 'cards');
      const page = await pageOf(db, a.shopId, pageSlug);
      if (page.state === 'closed') throw new OwnerError(409, 'PAGE_CLOSED');
      return { access: a, page };
    });
    const card = await withShortCode(async code => ({ ...(await this.pool.query(`INSERT INTO tags(shop_id,page_id,public_code,location_label) VALUES($1,$2,$3,$4)
      RETURNING id,public_code code,location_label label,state`, [page.shopId, page.pageId, code, name])).rows[0], page: page.slug }) as Card);
    await recordActivity(this.pool, access, 'card.create', `${card.label} (${card.code})`);
    return card;
  }

  async update(credential: OwnerCredential, slug: string, body: unknown) {
    const data = body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : {};
    const change = 'label' in data ? shape(body, ['id', 'label']) : 'page' in data ? shape(body, ['id', 'page']) : shape(body, ['id', 'state']);
    if (typeof change.id !== 'string' || !uuid.test(change.id)) throw new OwnerError(400, 'INVALID_CARD');
    return transaction(this.pool, async db => {
      const access = await authorize(db, credential, slug, 'write');
      requirePermission(access, 'cards');
      const card = (await db.query('SELECT state,public_code,location_label,page_id FROM tags WHERE shop_id=$1 AND id=$2 FOR UPDATE', [access.shopId, change.id])).rows[0];
      if (!card) throw new OwnerError(404, 'CARD_NOT_FOUND');
      if ('label' in change) {
        await db.query('UPDATE tags SET location_label=$3 WHERE shop_id=$1 AND id=$2', [access.shopId, change.id, label(change.label)]);
        await recordActivity(db, access, 'card.rename', `${label(change.label)} (${card.public_code})`, { from: card.location_label ?? '' });
        return { id: change.id, label: label(change.label) };
      }
      // Tài 08/10: a card moves to another page of the shop (O'renchi's card onto its new page), as one written to the chip
      // cannot be rewritten in the shop. A live card goes only onto a live page; a closed page takes no card.
      if ('page' in change) {
        const page = await pageOf(db, access.shopId, typeof change.page === 'string' ? change.page : '-');
        if (page.state === 'closed') throw new OwnerError(409, 'PAGE_CLOSED');
        if (card.state === 'active' && page.state !== 'active') throw new OwnerError(409, 'SHOP_UNAVAILABLE');
        await db.query('UPDATE tags SET page_id=$3 WHERE shop_id=$1 AND id=$2', [access.shopId, change.id, page.pageId]);
        await recordActivity(db, access, 'card.page', `${card.location_label ?? ''} (${card.public_code})`, { page: page.slug });
        return { id: change.id, page: page.slug };
      }
      if (change.state !== 'active' && change.state !== 'disabled') throw new OwnerError(400, 'INVALID_CARD');
      if (change.state === card.state) return { id: change.id, state: card.state };
      if (change.state === 'active') {
        if (access.role !== 'owner') throw new OwnerError(403, 'OWNER_ROLE_REQUIRED');
        // A card goes live only onto a live page of a live shop.
        const live = (await db.query(`SELECT s.publishing_state,p.state FROM shops s JOIN pages p ON p.shop_id=s.id AND p.id=$2
          WHERE s.id=$1 FOR SHARE OF s,p`, [access.shopId, card.page_id])).rows[0];
        if (!live || live.publishing_state !== 'active' || live.state !== 'active') throw new OwnerError(409, 'SHOP_UNAVAILABLE');
      }
      await db.query('UPDATE tags SET state=$3 WHERE shop_id=$1 AND id=$2', [access.shopId, change.id, change.state]);
      await recordActivity(db, access, 'card.state', `${card.location_label ?? ''} (${card.public_code})`, { state: change.state === 'active' ? 'bật' : 'tắt' });
      return { id: change.id, state: change.state };
    });
  }
}
