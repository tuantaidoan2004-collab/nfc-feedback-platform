import type { Pool } from 'pg';
import { authorize, requirePermission, transaction, OwnerError, type OwnerCredential } from './auth';
import { recordActivity } from './activity';
import { withShortCode } from '../short-code';

/**
 * The shop's NFC cards (lát E, 2026-09-18). "Nhân bản thẻ" makes another card for the same page: one page, many
 * cards, each with its own short code and name, so figures split by card. Anyone who runs the shop may add, rename
 * and switch a card off; only the owner switches a card on, because active cards are what the shop pays for.
 * Support never changes cards, at any switch position.
 */
export type CardState = 'prepared' | 'tested' | 'active' | 'disabled';
export type Card = { id: string; code: string; label: string; state: CardState };

/** Price list of commercial-model.md §3: five active cards come with the plan, then 8k each to 20, then 5k. */
export const INCLUDED_CARDS = 5;
export function cardMonthlyFee(activeCards: number) {
  const tier1 = Math.max(0, Math.min(activeCards, 20) - INCLUDED_CARDS), tier2 = Math.max(0, activeCards - 20);
  return tier1 * 8000 + tier2 * 5000;
}
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
      const cards = (await db.query(`SELECT id,public_code code,location_label label,state FROM tags WHERE shop_id=$1
        ORDER BY state='disabled',public_code`, [access.shopId])).rows as Card[];
      const active = cards.filter(card => card.state === 'active').length;
      return { cards, active, included: INCLUDED_CARDS, monthlyFee: cardMonthlyFee(active), nextFee: cardMonthlyFee(active + 1) - cardMonthlyFee(active),
        canActivate: access.actor.kind === 'owner' && access.role === 'owner' };
    });
  }

  async create(credential: OwnerCredential, slug: string, body: unknown) {
    const name = label(shape(body, ['label']).label);
    const access = await transaction(this.pool, async db => { const a = await authorize(db, credential, slug, 'write'); requirePermission(a, 'cards'); return a; });
    const card = await withShortCode(async code => (await this.pool.query(`INSERT INTO tags(shop_id,public_code,location_label) VALUES($1,$2,$3)
      RETURNING id,public_code code,location_label label,state`, [access.shopId, code, name])).rows[0] as Card);
    await recordActivity(this.pool, access, 'card.create', `${card.label} (${card.code})`);
    return card;
  }

  async update(credential: OwnerCredential, slug: string, body: unknown) {
    const data = body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : {};
    const change = 'label' in data ? shape(body, ['id', 'label']) : shape(body, ['id', 'state']);
    if (typeof change.id !== 'string' || !uuid.test(change.id)) throw new OwnerError(400, 'INVALID_CARD');
    return transaction(this.pool, async db => {
      const access = await authorize(db, credential, slug, 'write');
      requirePermission(access, 'cards');
      const card = (await db.query('SELECT state,public_code,location_label FROM tags WHERE shop_id=$1 AND id=$2 FOR UPDATE', [access.shopId, change.id])).rows[0];
      if (!card) throw new OwnerError(404, 'CARD_NOT_FOUND');
      if ('label' in change) {
        await db.query('UPDATE tags SET location_label=$3 WHERE shop_id=$1 AND id=$2', [access.shopId, change.id, label(change.label)]);
        await recordActivity(db, access, 'card.rename', `${label(change.label)} (${card.public_code})`, { from: card.location_label ?? '' });
        return { id: change.id, label: label(change.label) };
      }
      if (change.state !== 'active' && change.state !== 'disabled') throw new OwnerError(400, 'INVALID_CARD');
      if (change.state === card.state) return { id: change.id, state: card.state };
      if (change.state === 'active') {
        if (access.role !== 'owner') throw new OwnerError(403, 'OWNER_ROLE_REQUIRED');
        const shop = (await db.query('SELECT publishing_state,active_release_id FROM shops WHERE id=$1 FOR SHARE', [access.shopId])).rows[0];
        if (shop.publishing_state !== 'active' || !shop.active_release_id) throw new OwnerError(409, 'SHOP_UNAVAILABLE');
      }
      await db.query('UPDATE tags SET state=$3 WHERE shop_id=$1 AND id=$2', [access.shopId, change.id, change.state]);
      await recordActivity(db, access, 'card.state', `${card.location_label ?? ''} (${card.public_code})`, { state: change.state === 'active' ? 'bật' : 'tắt' });
      return { id: change.id, state: change.state };
    });
  }
}
