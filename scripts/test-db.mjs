// The disposable PostgreSQL the repository and harness suites need: nfc_test@127.0.0.1:55439/nfc_repo_test, UTF-8, kept in
// ~/.nfc-local/pg-test (a short path: Unix sockets refuse long ones, and this cluster listens on TCP only). Made once,
// started when it is not running. `node scripts/test-db.mjs` then run the suites (docs/local-development.md).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const bin = process.env.PG_BIN ?? '/Applications/Postgres.app/Contents/Versions/latest/bin';
const data = join(homedir(), '.nfc-local', 'pg-test'), port = '55439';
const run = (command, args, allowFail = false) => {
  const result = spawnSync(join(bin, command), args, { stdio: 'ignore' });
  if (result.status !== 0 && !allowFail) throw new Error(`${command} ${args.join(' ')} exited ${result.status}`);
  return result.status;
};
if (!existsSync(join(data, 'PG_VERSION'))) { mkdirSync(data, { recursive: true }); run('initdb', ['-D', data, '-U', 'nfc_test', '--auth=trust', '-E', 'UTF8', '--locale=en_US.UTF-8']); }
if (run('pg_isready', ['-h', '127.0.0.1', '-p', port], true) !== 0)
  run('pg_ctl', ['-D', data, '-o', `-p ${port} -c unix_socket_directories= -c listen_addresses=127.0.0.1 -c max_connections=200`, '-l', join(data, 'log'), '-w', 'start']);
run('createdb', ['-h', '127.0.0.1', '-p', port, '-U', 'nfc_test', 'nfc_repo_test'], true);
console.log(`Test database ready: postgresql://nfc_test@127.0.0.1:${port}/nfc_repo_test`);
