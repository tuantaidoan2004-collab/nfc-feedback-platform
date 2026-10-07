import type { Pool } from 'pg';

/**
 * Recording what a customer did on a shop's page (lát mục 7, Tài chốt 21/09/2026).
 *
 * This is the one append-only log everything else is derived from. Two rules decide its whole design, and both
 * come from what the log is *for*:
 *
 *   - it is measurement, so it must never be waited on. A telemetry row that never arrives costs nobody anything;
 *     a customer watching a spinner costs the shop the customer. The browser batches these and sends them with
 *     `sendBeacon`, and this endpoint answers 204 without the caller ever reading it;
 *   - it is shape, never content. Which star, which layout, which button, how many milliseconds. Never the
 *     message, never the phone number. The column is capped at 512 bytes so nobody can quietly widen that later.
 */
export type GuestEventName = 'page_opened' | 'google_tapped' | 'card_opened' | 'star_chosen' | 'feedback_sent' | 'card_abandoned' | 'event_tapped';
// `event_tapped` (khúc B): a guest opened one of an organizer's links; detail is `{ event, item }`, two catalog keys.
const NAMES: readonly GuestEventName[] = ['page_opened', 'google_tapped', 'card_opened', 'star_chosen', 'feedback_sent', 'card_abandoned', 'event_tapped'];

/** One event as the browser sends it. Everything else is filled in on the server, where it cannot be forged. */
export type GuestEvent = { name: GuestEventName; sinceOpenMs: number; detail?: Record<string, unknown> };
const uuid4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
/** A day, which is far longer than any real page visit and short enough that a wrong clock cannot store nonsense. */
const MAX_SINCE_OPEN_MS = 86_400_000;
/** More than one page's worth of interaction in a single beacon is not a page: it is someone filling the table. */
export const MAX_BATCH = 20;

/**
 * Only values the product itself chooses. A free-form object here would be the hole through which a message or a
 * phone number eventually arrives, whatever the comment above it said.
 */
function detail(value: unknown): Record<string, unknown> | null {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > 4) return null;
  for (const [key, item] of entries) {
    if (!/^[a-z][a-zA-Z0-9]{1,23}$/.test(key)) return null;
    const ok = typeof item === 'boolean'
      || (typeof item === 'number' && Number.isFinite(item) && Math.abs(item) < 1e9)
      // A short enumeration value such as a layout name, never prose: no spaces, no punctuation, no accents.
      || (typeof item === 'string' && /^[a-z][a-z0-9_-]{0,31}$/.test(item));
    if (!ok) return null;
  }
  return Object.fromEntries(entries);
}

export function readBatch(value: unknown): GuestEvent[] | null {
  if (!Array.isArray(value) || !value.length || value.length > MAX_BATCH) return null;
  const events: GuestEvent[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    const keys = Object.keys(item).sort().join();
    if (keys !== 'name,sinceOpenMs' && keys !== 'detail,name,sinceOpenMs') return null;
    const { name, sinceOpenMs } = item as Record<string, unknown>;
    if (typeof name !== 'string' || !NAMES.includes(name as GuestEventName)) return null;
    if (!Number.isSafeInteger(sinceOpenMs) || Number(sinceOpenMs) < 0 || Number(sinceOpenMs) > MAX_SINCE_OPEN_MS) return null;
    const shape = detail((item as Record<string, unknown>).detail);
    if (!shape) return null;
    events.push({ name: name as GuestEventName, sinceOpenMs: Number(sinceOpenMs), detail: shape });
  }
  return events;
}

/**
 * One statement for the whole batch. At a thousand active shops the arithmetic puts this at fourteen writes a
 * second, so a single insert is the right tool and anything with a broker in it would only add a hop.
 */
export async function record(pool: Pool, context: { shopId: string; scope: string; entryKey: string },
  visit: { sessionId?: string; visitId?: string }, events: GuestEvent[]) {
  const id = (value: string | undefined) => value && uuid4.test(value) ? value : null;
  await pool.query(`INSERT INTO page_events(shop_id,scope,entry_key,session_id,visit_id,name,since_open_ms,detail)
    SELECT $1,$2,$3,$4::uuid,$5::uuid,e.name,e.since_open_ms,e.detail
    FROM jsonb_to_recordset($6::jsonb) AS e(name text, since_open_ms int, detail jsonb)`,
    [context.shopId, context.scope, context.entryKey, id(visit.sessionId), id(visit.visitId),
      JSON.stringify(events.map(e => ({ name: e.name, since_open_ms: e.sinceOpenMs, detail: e.detail ?? {} })))]);
}
