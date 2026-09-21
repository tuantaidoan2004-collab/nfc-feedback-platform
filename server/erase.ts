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

export async function erase(pool: Pool, sessionId: string): Promise<Erasure> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // The live row first: this is what the shop reads, so it is what stops showing the words soonest.
    const live = await client.query(
      `UPDATE rating_experiences SET feedback_message=$2,feedback_phone=NULL
       WHERE session_id=$1 AND feedback_message IS NOT NULL AND feedback_message<>$2`, [sessionId, ERASED]);
    // Then the receipt, which is the copy the database used to refuse to change at all.
    const receipts = await client.query(
      `UPDATE rating_intent_receipts SET feedback_message=$2,feedback_phone=NULL
       WHERE session_id=$1 AND feedback_message IS NOT NULL AND feedback_message<>$2`, [sessionId, ERASED]);
    // And the behaviour, which holds no words but does say what this person did, step by step.
    const events = await client.query('DELETE FROM page_events WHERE session_id=$1', [sessionId]);
    await client.query('COMMIT');
    return { erased: !!(live.rowCount || receipts.rowCount || events.rowCount) };
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
