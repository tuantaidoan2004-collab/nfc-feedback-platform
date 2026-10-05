import type { Pool } from 'pg';
import { authorize, OwnerError, transaction, type OwnerCredential } from './auth';

/**
 * What happened on the shop's page since the dashboard last asked (kịch bản mục 6): the Orb bounces on any tap, harder
 * on a Google tap, turns red on private feedback and green on a five-star rating. Counts only, never content, and only
 * the live page. `since` is the server time this endpoint returned last; the first call only starts the clock.
 * An administrator standing in for the shop gets nothing: every read of theirs is audited, and a poll every few seconds
 * would bury the trail in noise.
 */
export type Pulse = { cursor: string; taps: number; google: number; feedback: number; good: number };
const empty = (cursor: string): Pulse => ({ cursor, taps: 0, google: 0, feedback: 0, good: 0 });

/** The cursor keeps Postgres's microseconds: cut to milliseconds, an event in the same millisecond as a read waited a turn. */
const CURSOR = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/;

export async function readPulse(pool: Pool, credential: OwnerCredential, slug: string, since: string | null): Promise<Pulse> {
  return transaction(pool, async db => {
    const access = await authorize(db, credential, slug, 'overview');
    const now = (await db.query(`SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') now`)).rows[0].now as string;
    if (since === null || access.actor.kind === 'admin') return empty(now);
    if (!CURSOR.test(since) || Number.isNaN(Date.parse(since))) throw new OwnerError(400, 'INVALID_SINCE');
    // A tab left open overnight asks about the last ten minutes, not the whole night.
    const row = (await db.query(`WITH w AS (SELECT GREATEST($2::timestamptz, $3::timestamptz - interval '10 minutes') a, $3::timestamptz b) SELECT
      (SELECT count(*)::int FROM page_events, w WHERE shop_id=$1 AND scope='live' AND at>w.a AND at<=w.b) taps,
      (SELECT count(*)::int FROM page_events, w WHERE shop_id=$1 AND scope='live' AND name='google_tapped' AND at>w.a AND at<=w.b) google,
      (SELECT count(*)::int FROM page_events, w WHERE shop_id=$1 AND scope='live' AND name='feedback_sent' AND at>w.a AND at<=w.b) feedback,
      (SELECT count(*)::int FROM rating_experiences, w WHERE shop_id=$1 AND scope='live' AND rating=5 AND updated_at>w.a AND updated_at<=w.b) good`,
      [access.shopId, since, now])).rows[0];
    return { cursor: now, taps: row.taps, google: row.google, feedback: row.feedback, good: row.good };
  });
}
