import type { Pool } from 'pg';

/**
 * Erasing what a customer wrote, at the customer's own request (lát B, Tài chốt 21/09/2026).
 *
 * No account, no email, no support ticket: the secret their browser already holds is the proof that a session is
 * theirs. Nobody else can present it, and they can present it without telling us who they are -- which is the
 * strongest form this can take, and the reason it is worth building rather than promising a manual process.
 *
 * What goes: the words, the call-back number, and the behaviour log for that session. What stays: that a visit
 * happened and what star was given. A star on its own names nobody, the shop's totals stay honest, and the
 * published-context rows the platform cannot alter are untouched -- they hold no personal data to begin with.
 * The privacy page says exactly this, in these words.
 */
/** Must match the literal the trigger in migration 021 allows; the test proves they still agree. */
export const ERASED = '(đã xoá theo yêu cầu)';

export type Erasure = { erased: boolean };

/**
 * Every session this browser opened on this card, not only the current one (A5). A session closes after fifteen idle
 * minutes, so a customer who comes back a week later to erase is holding a new session: erasing only that one would
 * leave the words they came to remove. The four columns are the ones the capability hash already binds, and the
 * ones index `visit_sessions_browser_latest` leads with.
 */
export type Owner = { shopId: string; scope: string; entryKey: string; browserHash: string };

export async function erase(pool: Pool, owner: Owner): Promise<Erasure> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const sessionIds = (await client.query<{ id: string }>(
      'SELECT id FROM visit_sessions WHERE shop_id=$1 AND scope=$2 AND entry_key=$3 AND browser_hash=$4',
      [owner.shopId, owner.scope, owner.entryKey, owner.browserHash])).rows.map(row => row.id);
    // The live row first: this is what the shop reads, so it is what stops showing the words soonest.
    const live = await client.query(
      `UPDATE rating_experiences SET feedback_message=$2,feedback_phone=NULL
       WHERE session_id=ANY($1::uuid[]) AND feedback_message IS NOT NULL AND feedback_message<>$2`, [sessionIds, ERASED]);
    // Then the receipt, which is the copy the database used to refuse to change at all.
    const receipts = await client.query(
      `UPDATE rating_intent_receipts SET feedback_message=$2,feedback_phone=NULL
       WHERE session_id=ANY($1::uuid[]) AND feedback_message IS NOT NULL AND feedback_message<>$2`, [sessionIds, ERASED]);
    // And the behaviour, which holds no words but does say what this person did, step by step.
    const events = await client.query('DELETE FROM page_events WHERE session_id=ANY($1::uuid[])', [sessionIds]);
    await client.query('COMMIT');
    return { erased: !!(live.rowCount || receipts.rowCount || events.rowCount) };
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
