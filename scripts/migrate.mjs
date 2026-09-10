import { readFile } from 'node:fs/promises';
import pg from 'pg';
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL required');
const client=new pg.Client({connectionString:process.env.DATABASE_URL});await client.connect();
try{await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(7834251)');await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY)');const result=await client.query('SELECT name FROM schema_migrations WHERE name=$1',['001_core']);if(!result.rowCount){await client.query(await readFile(new URL('../db/migrations/001_core.sql',import.meta.url),'utf8'));await client.query('INSERT INTO schema_migrations VALUES($1)',['001_core']);}await client.query('COMMIT');console.log('Migrations applied.');}catch(e){await client.query('ROLLBACK');throw e;}finally{await client.end();}
