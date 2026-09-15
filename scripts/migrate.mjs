// Applies every db/migrations/*.sql that schema_migrations does not already record, in filename order.
// One transaction plus one advisory lock covers the whole run: concurrent deploys wait instead of interleaving,
// and any failure rolls the run back so a half-applied schema is never recorded as done.
import { readFile, readdir } from 'node:fs/promises';
import pg from 'pg';
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL required');
const directory = new URL('../db/migrations/', import.meta.url);
const files = (await readdir(directory)).filter(name => name.endsWith('.sql')).sort();
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(7834251)');
  await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY)');
  const applied = new Set((await client.query('SELECT name FROM schema_migrations')).rows.map(row => row.name));
  const pending = files.filter(file => !applied.has(file.replace(/\.sql$/, '')));
  for (const file of pending) {
    const name = file.replace(/\.sql$/, '');
    await client.query(await readFile(new URL(file, directory), 'utf8'));
    await client.query('INSERT INTO schema_migrations VALUES($1)', [name]);
    console.log(`Applied ${name}.`);
  }
  await client.query('COMMIT');
  console.log(pending.length ? `Migrations applied: ${pending.length}.` : 'Migrations already up to date.');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}
