import 'server-only';
import { Pool } from 'pg';
let pool: Pool | undefined;
export function database() {
  if (process.env.SERVER_DATA_ENABLED !== 'true' || !process.env.DATABASE_URL) throw new Error('DATABASE_NOT_CONFIGURED');
  return pool ??= new Pool({ connectionString: process.env.DATABASE_URL, max: 3, connectionTimeoutMillis: 5000, statement_timeout: 5000 });
}
