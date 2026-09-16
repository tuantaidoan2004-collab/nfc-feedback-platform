// Creates a platform administrator. Holding the database credential is the authority: there is no
// registration route and no way to reach this from the web.
//
// KDF PARAMETERS ARE DUPLICATED FROM lib/owner/auth.ts passwordKey(). A script cannot import that module
// because the project's TypeScript uses constructor parameter properties, which Node's type stripping
// rejects. If the parameters ever change, change them here too and bump password_scheme in both places;
// the CHECK on that column then rejects a stale write instead of silently storing an unusable hash.
import { randomBytes, scrypt } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { StringDecoder } from 'node:string_decoder';
import pg from 'pg';

const SCHEME = 'scrypt-131072-8-1';
const derive = (password, salt) => new Promise((resolve, reject) =>
  scrypt(password, Buffer.from(salt, 'hex'), 32, { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 },
    (error, key) => error ? reject(error) : resolve(key)));

const name = (process.argv[2] ?? '').trim().toLowerCase();
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL required');
if (!/^[a-z0-9][a-z0-9_.-]{2,63}$/.test(name)) throw new Error('Usage: node scripts/bootstrap-admin.mjs <username>');

// Read the password from stdin rather than an argument, so it never reaches shell history or the process list.
// Typing shows an asterisk per character: a prompt that looks frozen is a prompt people abandon or mistype.
function promptHidden(label) {
  process.stdout.write(label);
  process.stdin.setRawMode(true); process.stdin.resume();
  const decoder = new StringDecoder('utf8');
  return new Promise(resolve => {
    let value = '';
    const onData = chunk => {
      for (const byte of chunk) {
        if (byte === 3) { process.stdout.write('\n'); process.exit(130); }
        if (byte === 13 || byte === 10) {
          process.stdin.off('data', onData); process.stdin.setRawMode(false); process.stdin.pause();
          process.stdout.write('\n'); return resolve(value);
        }
        if (byte === 127 || byte === 8) { if (value) { value = value.slice(0, -1); process.stdout.write('\b \b'); } continue; }
        if (byte < 32) continue;
        // One byte at a time through the decoder, so a multi-byte character counts once and deletes once.
        const piece = decoder.write(Buffer.from([byte]));
        if (piece) { value += piece; process.stdout.write('*'); }
      }
    };
    process.stdin.on('data', onData);
  });
}

const invalid = value => value.length < 16 ? 'Password must be at least 16 characters.'
  : Buffer.byteLength(value) > 256 ? 'Password must be at most 256 bytes.' : null;

async function readPassword() {
  if (process.env.NFC_ADMIN_PASSWORD) {
    const reason = invalid(process.env.NFC_ADMIN_PASSWORD);
    if (reason) throw new Error(reason);
    return process.env.NFC_ADMIN_PASSWORD;
  }
  if (!process.stdin.isTTY) {
    const rl = createInterface({ input: process.stdin });
    try {
      const piped = (await rl.question('')).trim();
      const reason = invalid(piped);
      if (reason) throw new Error(reason);
      return piped;
    } finally { rl.close(); }
  }
  // Asking twice catches a typo now instead of at the login form, where the message is deliberately vague.
  for (let attempt = 3; attempt > 0; attempt--) {
    const value = await promptHidden(`Password for ${name} (at least 16 characters): `);
    const reason = invalid(value);
    if (reason) { console.error(`  ${reason} ${attempt - 1} attempt(s) left.`); continue; }
    if (value !== await promptHidden('Repeat it: ')) { console.error(`  The two entries differ. ${attempt - 1} attempt(s) left.`); continue; }
    return value;
  }
  throw new Error('No valid password entered; nothing was created.');
}

const password = await readPassword();

const salt = randomBytes(16).toString('hex');
const key = (await derive(password, salt)).toString('hex');
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query('BEGIN');
  const id = (await client.query(
    'INSERT INTO platform_admins(username,password_salt,password_key,password_scheme)VALUES($1,$2,$3,$4)RETURNING id',
    [name, salt, key, SCHEME])).rows[0].id;
  // Self-recorded, because no administrator existed to authorise it. The trail still shows where this came from.
  await client.query("INSERT INTO admin_audit(actor_id,action,detail)VALUES($1,'admin.bootstrap',$2)",
    [id, JSON.stringify({ username: name, via: 'scripts/bootstrap-admin.mjs' })]);
  await client.query('COMMIT');
  console.log(`Created platform administrator ${name} (${id}).`);
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}
