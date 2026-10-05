import type { Pool } from 'pg';
import type { SignalKind, SignalRow } from '../signals';

/**
 * Where lib/signals.ts writes, and what /gov reads (lát B3 phần hai, migration 033). One statement per write, however many
 * signals it carries; each write also forgets what is older than 30 days, so the table never grows past a month.
 */
export async function writeSignals(pool: Pool, rows: SignalRow[]) {
  if (!rows.length) return;
  await pool.query(`INSERT INTO server_signals(kind,code,day,count,first_at,last_at)
    SELECT kind,code,(last_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,count,first_at,last_at
    FROM unnest($1::text[],$2::text[],$3::bigint[],$4::timestamptz[],$5::timestamptz[]) AS s(kind,code,count,first_at,last_at)
    ON CONFLICT (kind,code,day) DO UPDATE SET count=server_signals.count+EXCLUDED.count,
      first_at=LEAST(server_signals.first_at,EXCLUDED.first_at),last_at=GREATEST(server_signals.last_at,EXCLUDED.last_at)`,
    [rows.map(r => r.kind), rows.map(r => r.code), rows.map(r => r.count), rows.map(r => r.first), rows.map(r => r.last)]);
  await pool.query("DELETE FROM server_signals WHERE day < (clock_timestamp() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - 30");
}

export type SignalSummary = { kind: SignalKind; code: string; count: number; last_at: string };
/**
 * The last `days` days, newest first; null when migration 033 has not run on this database yet, so /gov says so instead
 * of failing.
 */
export async function recentSignals(pool: Pool, days = 7): Promise<SignalSummary[] | null> {
  try {
    return (await pool.query(`SELECT kind,code,LEAST(sum(count),2147483647)::int AS count,max(last_at) AS last_at FROM server_signals
      WHERE day >= (clock_timestamp() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - ($1::int - 1)
      GROUP BY kind,code ORDER BY max(last_at) DESC LIMIT 100`, [days])).rows;
  } catch (error) {
    if ((error as { code?: string }).code === '42P01') return null;
    throw error;
  }
}
