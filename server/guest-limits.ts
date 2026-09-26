import { createHash } from 'node:crypto';
import type { Pool } from 'pg';

/**
 * Flood control for the guest page (lát A1, Tài 2026-09-20).
 *
 * Tài put a peak minute at well over thirty taps on one card, and at that volume counting cannot tell a crowded
 * shop from a bot. So there are two different signals, and they answer different questions:
 *
 *   - how many requests a card, a page load or an address made in the last minute;
 *   - how long after the page opened the answer arrived. A person reads the page, opens the card, picks a star and
 *     presses send: seconds. Thirty people are still thirty people each taking seconds. A script answers in
 *     milliseconds, and it cannot fake the delay without slowing itself to a harmless speed.
 *
 * Nothing a customer sends is refused at the marking threshold and nothing is deleted: the session is marked, kept,
 * and left out of the shop's numbers until the shop asks to see it (Tài chose this over turning people away). The
 * Google button is untouched on every path -- `google-policy.md` rule 1.
 */
export type GuestVerdict = ({ suspected: true; reason: string } | { suspected: false }) & { sessionId: string | null };
export type GuestOperation = 'register' | 'rating' | 'feedback' | 'events' | 'erase';

/**
 * Marking threshold per minute, then the hard ceiling where the request really is refused. The ceiling is ten times
 * the threshold and exists only so one machine cannot fill the database: a crowd never reaches it, and a shop that
 * somehow does is a conversation, not a silent failure. Tài chose "take it and mark it" for customer-facing
 * behaviour; this is the separate question of keeping the service alive.
 */
const LIMITS = { visit: 20, entry: 120, address: 600 } as const;
const CEILING = 10;
/**
 * How soon after the page first opened an answer stops being possible for a person. Deliberately far below any
 * plausible customer -- tapping a card, waiting for the page, reading it and picking a star is seconds, and even a
 * hurried person is nowhere near this -- because a wrong mark hides a real customer's words from their shop by
 * default. A script answers in tens of milliseconds, an order of magnitude below these, so the gap is wide on both
 * sides and nothing has to be guessed about how fast a person "usually" is.
 */
const TOO_FAST_MS = { rating: 400, feedback: 800 } as const satisfies Record<'rating' | 'feedback', number>;

/**
 * The one header that carries the guest's address, trusted only because something in front of the app overwrites it
 * on every request (lát I1). A header a visitor can simply send proves nothing: before I1 this read three headers in
 * turn, so on any host but Vercel a script could send `x-forwarded-for` and step around the address tier.
 *
 *   - `NFC_CLIENT_IP_HEADER` names it when the app runs behind the operator's own proxy -- which must set it itself,
 *     e.g. nginx `proxy_set_header X-Real-IP $remote_addr;` with `NFC_CLIENT_IP_HEADER=x-real-ip`.
 *   - On Vercel (it sets `VERCEL=1` itself): `x-vercel-forwarded-for`, which Vercel overwrites to prevent spoofing.
 *   - Neither: no address. The address tier then simply does not run -- it must never fall back to one shared
 *     "unknown" bucket; that is exactly how F-002's platform-wide limit became a way to lock real people out.
 */
export function addressHeader(env: Record<string, string | undefined> = process.env): string | null {
  const named = env.NFC_CLIENT_IP_HEADER?.trim().toLowerCase();
  if (named) return /^[a-z0-9-]{1,64}$/.test(named) ? named : null;
  return env.VERCEL === '1' ? 'x-vercel-forwarded-for' : null;
}

export function clientAddress(request: Request, env: Record<string, string | undefined> = process.env): string | null {
  const header = addressHeader(env);
  const raw = header ? request.headers.get(header) : null;
  const first = raw?.split(',')[0].trim();
  return first && first.length <= 45 && /^[0-9a-f:.]+$/i.test(first) ? first : null;
}

/**
 * The address is counted, not kept. What goes in the table is a hash, so reading the table does not hand anyone a
 * list of who visited which shop. Say what this is and is not: it is pseudonymisation, not anonymisation -- there
 * are only four billion IPv4 addresses and anyone holding the table could work back through them. What makes the
 * data actually short-lived is `forget()` below, not this.
 */
const addressHash = (address: string) => createHash('sha256').update(`nfc-guest-address-v1\0${address}`).digest('hex');

/**
 * A counting row outlives its minute by nothing. Without this an address that tapped one card once would stay in
 * the table for good: the admin login limiter has swept its own rows since migration 005 and the guest one was
 * written without it (lát A1, Claude's miss, found while writing the privacy page).
 *
 * Swept on register only -- once a page load, not once a request -- and the sweep is what keeps the table small
 * enough for the scan to stay cheap. If it ever stops being small, the answer is an index on window_start.
 */
const forget = (pool: Pool) => pool.query("DELETE FROM public_request_limits WHERE window_start < clock_timestamp() - interval '1 hour'");

/** Refused outright: past the ceiling, not past the marking threshold. */
export class GuestFlood extends Error {
  constructor(readonly bucket: string) { super('TOO_MANY_REQUESTS'); }
}

/**
 * One fixed one-minute window per bucket, the shape migration 004 already uses for owner login. Counted in its own
 * transaction and committed even when the caller goes on to fail, because a rejected attempt still costs work and
 * still has to count -- rolling the counter back with the request is how a limiter stops limiting.
 */
async function count(pool: Pool, buckets: string[]): Promise<{ bucket: string; attempts: number }[]> {
  if (!buckets.length) return [];
  const rows = await pool.query<{ bucket: string; attempts: number }>(
    `INSERT INTO public_request_limits(bucket,window_start,attempts) SELECT b,clock_timestamp(),1 FROM unnest($1::text[]) b
     ON CONFLICT(bucket) DO UPDATE SET
       attempts=CASE WHEN public_request_limits.window_start<=clock_timestamp()-interval '1 minute' THEN 1
                     ELSE LEAST(public_request_limits.attempts,$2::int)+1 END,
       window_start=CASE WHEN public_request_limits.window_start<=clock_timestamp()-interval '1 minute' THEN clock_timestamp()
                         ELSE public_request_limits.window_start END
     RETURNING bucket,attempts`, [buckets, LIMITS.address * CEILING]);
  return rows.rows;
}

/**
 * Called before the write. Throws GuestFlood past the ceiling; otherwise answers whether this one looks like a
 * person, and the caller marks the session afterwards, once it exists.
 */
export async function inspect(pool: Pool, request: Request, context: { shopId: string; scope: string; entryKey: string },
  operation: GuestOperation, visitId?: string): Promise<GuestVerdict> {
  // The visit is read first so the session is known whatever the verdict turns out to be; registering has no visit
  // yet, and the caller passes the session the write just created.
  // `pg` hands a timestamptz back as a Date, not a string; Date.parse on it is NaN, which silently turned the
  // whole timing signal off until a test caught it. new Date() takes either.
  // Only a visit of this very shop, scope and entry counts (C3, 26/09): an id from anywhere else -- guessed, or learned
  // from another shop's guest -- must not move that visit's counter, or a stranger could push the real guest's next
  // answer past the ceiling. The request still counts against its own entry and address.
  const visit = visitId ? (await pool.query<{ session_id: string; started: Date | string | null }>(
    `SELECT v.session_id, (SELECT min(p.opened_at) FROM page_visits p WHERE p.session_id=v.session_id) started
     FROM page_visits v WHERE v.id=$1 AND v.shop_id=$2 AND v.scope=$3 AND v.entry_key=$4`, [visitId, context.shopId, context.scope, context.entryKey])).rows[0] : undefined;
  const sessionId = visit?.session_id ?? null;
  const address = clientAddress(request);
  if (operation === 'register') await forget(pool);
  // The card, not the shop: one card being pumped must not mark the shop's other cards.
  const buckets: [string, number][] = [[`entry:${context.shopId}:${context.scope}:${context.entryKey}`, LIMITS.entry]];
  if (visit) buckets.push([`visit:${visitId}`, LIMITS.visit]);
  if (address) buckets.push([`address:${context.shopId}:${addressHash(address)}`, LIMITS.address]);
  const counted = new Map((await count(pool, buckets.map(([name]) => name))).map(row => [row.bucket, Number(row.attempts)]));
  for (const [name, limit] of buckets) {
    const attempts = counted.get(name) ?? 0;
    if (attempts > limit * CEILING) throw new GuestFlood(name.split(':')[0]);
    if (attempts > limit) return { suspected: true, reason: `${name.split(':')[0]}_rate`, sessionId };
  }
  // A beacon and an erasure are not answers a person gave the shop, so "too fast" says nothing about either;
  // only the counters apply. Erasure in particular must never be marked as suspicious -- it is a right.
  if (operation !== 'rating' && operation !== 'feedback') return { suspected: false, sessionId };
  if (!visit?.started) return { suspected: false, sessionId };
  // Measured from the session's first open, so coming back to an open tab is not mistaken for haste.
  const elapsed = Date.now() - new Date(visit.started).getTime();
  return elapsed >= 0 && elapsed < TOO_FAST_MS[operation]
    ? { suspected: true, reason: 'too_fast', sessionId } : { suspected: false, sessionId };
}

/** First reason wins: the mark records what was seen first, and a later request does not rewrite that history. */
export async function mark(pool: Pool, sessionId: string, reason: string) {
  await pool.query(`UPDATE visit_sessions SET suspected_at=clock_timestamp(),suspected_reason=$2
    WHERE id=$1 AND suspected_at IS NULL`, [sessionId, reason]);
}
