import { healthProbe } from '@/lib/health';
import { database } from '@/server/db';

/**
 * 200 while this app answers and its database does, 503 otherwise (roadmap B3). Nothing else is said -- no version, no
 * cause, no timing -- since anyone can call it; lib/health.ts keeps the database from being asked more than once every
 * five seconds.
 */
export const dynamic = 'force-dynamic';
const up = healthProbe(() => database().query('SELECT 1'));
export async function GET() {
  const ok = await up();
  return Response.json({ status: ok ? 'ok' : 'unavailable' }, { status: ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } });
}
