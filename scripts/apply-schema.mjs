// The database of a self-hosted platform (deploy/docker-compose.yml, docs/tu-chay.md): db/schema.sql, the whole schema in one
// file (Tài 05/10: no migrations while the frame is rebuilt). An empty database gets it; a database already built from this
// same file is left alone; one built from another version stops the start, because changing a live schema is Tài's call on
// the day the new frame replaces production ("ask Tài again on that day") -- never something a restart does on its own.
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import pg from 'pg';
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL required');
// Same rule as lib/db-url.ts, repeated because this script cannot import the project's TypeScript: name the certificate
// checking the driver already applies, so it stops warning about a future change on every run.
function explicitSslMode(value) {
  let url; try { url = new URL(value); } catch { return value; }
  const mode = url.searchParams.get('sslmode');
  if (!mode || !['prefer', 'require', 'verify-ca'].includes(mode)) return value;
  url.searchParams.set('sslmode', 'verify-full'); return url.toString();
}
const schema = await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8');
const hash = createHash('sha256').update(schema).digest('hex').slice(0, 16);
const client = new pg.Client({ connectionString: explicitSslMode(process.env.DATABASE_URL) });
await client.connect();
try {
  await client.query('BEGIN');
  // Two starts at once wait for each other instead of building twice.
  await client.query('SELECT pg_advisory_xact_lock(7834251)');
  const built = (await client.query("SELECT to_regclass('shops') IS NOT NULL AS shops, to_regclass('applied_schema') IS NOT NULL AS marked")).rows[0];
  if (!built.shops) {
    await client.query(schema);
    await client.query('CREATE TABLE applied_schema (hash text NOT NULL, applied_at timestamptz NOT NULL DEFAULT clock_timestamp())');
    await client.query('INSERT INTO applied_schema(hash) VALUES($1)', [hash]);
    await client.query('COMMIT');
    console.log(`Database: built from db/schema.sql (${hash}).`);
  } else {
    const current = built.marked ? (await client.query('SELECT hash FROM applied_schema ORDER BY applied_at DESC LIMIT 1')).rows[0]?.hash : null;
    await client.query('ROLLBACK');
    if (current === hash) console.log(`Database: already on db/schema.sql (${hash}).`);
    else {
      console.error(`Database: built from ${current ? `another db/schema.sql (${current})` : 'the old migration chain'}, not this one (${hash}). ` +
        'Nothing was changed. Rebuilding a database that holds data is decided by Tài on the day (docs/tu-chay.md).');
      process.exitCode = 1;
    }
  }
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  throw error;
} finally {
  await client.end();
}
