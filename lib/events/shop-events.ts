import type { Pool, PoolClient } from 'pg';
import { recordAdminAction } from '../admin/audit';
import { AdminError } from '../admin/auth';
import { transaction } from '../owner/auth';
import { EVENT_KEYS, isEventKey, type EventKey } from './catalog';

/**
 * Which events are open for which shop (khúc B, bảng `shop_events`). Only /gov switches it: Tài opens an event for a shop
 * that agreed to it, and the block shows on every live page of that shop, under the shop's own blocks. The shop's owner
 * does nothing and is asked for nothing -- the organizer runs everything on its own side. Closing takes the block off
 * every page at once; nothing is republished, because no page's configuration carries it.
 */
type Db = Pool | PoolClient;
/**
 * The table came after the new frame went live (05/10). Until it is created on a database built from an older
 * db/schema.sql, every shop has no event: a guest page must never break over an organizer's block.
 */
const missingTable = (error: unknown) => (error as { code?: string })?.code === '42P01';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The shop's open events, in the catalog's order. */
export async function openEvents(db: Db, shopId: string): Promise<EventKey[]> {
  let rows: { event_key: string }[];
  try { rows = (await db.query('SELECT event_key FROM shop_events WHERE shop_id=$1', [shopId])).rows; }
  catch (error) { if (missingTable(error)) return []; throw error; }
  const open = new Set(rows.map(row => row.event_key));
  return EVENT_KEYS.filter(key => open.has(key));
}

/** /gov: open or close one event for one shop. Every change is in the administrators' books. */
export class ShopEvents {
  constructor(private pool: Pool) {}
  async byShop(): Promise<Map<string, EventKey[]>> {
    let rows: { shop_id: string; event_key: string }[];
    try { rows = (await this.pool.query('SELECT shop_id,event_key FROM shop_events ORDER BY opened_at')).rows; }
    catch (error) { if (missingTable(error)) return new Map(); throw error; }
    const map = new Map<string, EventKey[]>();
    for (const row of rows) if (isEventKey(row.event_key)) map.set(row.shop_id, [...(map.get(row.shop_id) ?? []), row.event_key]);
    return map;
  }
  async set(adminId: string, input: unknown) {
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).sort().join() !== 'event,open,shopId') throw new AdminError(400, 'INVALID_INPUT');
    const { shopId, event, open } = input as Record<string, unknown>;
    if (typeof shopId !== 'string' || !UUID.test(shopId) || !isEventKey(event) || typeof open !== 'boolean') throw new AdminError(400, 'INVALID_INPUT');
    return transaction(this.pool, async db => {
      const shop = (await db.query('SELECT slug,name FROM shops WHERE id=$1 FOR SHARE', [shopId])).rows[0] as { slug: string; name: string } | undefined;
      if (!shop) throw new AdminError(404, 'SHOP_NOT_FOUND');
      // Without the table, say so in /gov rather than fail as a server error.
      if (!(await db.query("SELECT to_regclass('shop_events') IS NOT NULL ok")).rows[0].ok) throw new AdminError(409, 'EVENTS_TABLE_MISSING');
      const changed = open
        ? (await db.query('INSERT INTO shop_events(shop_id,event_key,opened_by) VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [shopId, event, adminId])).rowCount
        : (await db.query('DELETE FROM shop_events WHERE shop_id=$1 AND event_key=$2', [shopId, event])).rowCount;
      if (changed) await recordAdminAction(db, adminId, { action: open ? 'event.open' : 'event.close', shopId, detail: { event } });
      return { shopId, event, open, slug: shop.slug, name: shop.name };
    });
  }
}
