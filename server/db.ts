import 'server-only';
import { Pool } from 'pg';
let pool: Pool | undefined;
export function database() {
  if (process.env.SERVER_DATA_ENABLED !== 'true' || !process.env.DATABASE_URL) throw new Error('DATABASE_NOT_CONFIGURED');
  return pool ??= new Pool({ connectionString: process.env.DATABASE_URL, max: 3, connectionTimeoutMillis: 5000, statement_timeout: 5000 });
}

// Long-running owner cursors have a separate bounded pool so fresh auth checks never wait behind all cursors.
let ownerExportPool: Pool | undefined;
export function ownerExportDatabase() {
  database(); // Same explicit server-data/env gate; no separate credential source.
  // Export streams a server-side cursor across many FETCHes, which needs a session-mode connection. A pooled
  // connection string in transaction mode would drop the cursor between fetches, so deployments that route
  // DATABASE_URL through a transaction pooler point DATABASE_URL_DIRECT at the same database without one.
  // DATABASE_URL_UNPOOLED is the name managed Postgres providers commonly publish for that same
  // connection; it is accepted so a provider-populated variable does not have to be copied by hand.
  // Unset means both pools share DATABASE_URL, which is the self-hosted and local behaviour.
  const connectionString = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  return ownerExportPool ??= new Pool({ connectionString, max: 2, connectionTimeoutMillis: 5000, statement_timeout: 5000 });
}
