// A test cluster that is not UTF-8 makes every Vietnamese CHECK constraint behave by bytes, and a dozen suites fail
// as if the product were broken (docs/operations-gotchas.md). Fail here instead, with the reason.
import pg from 'pg';
const client = new pg.Client({ connectionString: process.env.NFC_TEST_DATABASE_URL });
await client.connect();
try {
  const { rows } = await client.query('SHOW server_encoding');
  const encoding = rows[0].server_encoding;
  if (encoding !== 'UTF8') throw new Error(`The test cluster is ${encoding}; it must be UTF8.`);
  console.log(`Test cluster encoding: ${encoding}.`);
} finally { await client.end(); }
