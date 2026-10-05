import { readFile } from 'node:fs/promises';
import type { Pool, PoolClient } from 'pg';

/**
 * The whole database in one step: db/schema.sql into the test's own schema (its search_path). Since 05/10 there are no
 * migrations while the frame is rebuilt (Tài), so tests start from the schema as it is, not from a chain of files.
 */
export async function applySchema(db: Pool | PoolClient) {
  await db.query(await readFile('db/schema.sql', 'utf8'));
}
