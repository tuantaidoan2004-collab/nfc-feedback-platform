// Checks a self-hosted platform (lát I1, docs/tu-chay.md): the app answers, reaches its database, and uploads to its
// own S3-compatible store with the same signer the app uses -- nothing rented anywhere.
//
//   APP_ORIGIN=http://127.0.0.1:3000 STORAGE_ENDPOINT=http://127.0.0.1:9000 MEDIA_PUBLIC_ORIGIN=http://127.0.0.1:9000/nfc-media \
//   R2_ACCESS_KEY_ID=… R2_SECRET_ACCESS_KEY=… R2_BUCKET=nfc-media node scripts/selfhost-smoke.mjs
//
// Writes one small object to the store, and nothing to the database. Exits non-zero on the first thing that is wrong.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { presignUrl } from '../lib/media/sigv4.ts';
import { storageHost, storageSettings } from '../lib/media/storage-settings.ts';

const origin = process.env.APP_ORIGIN;
assert.ok(origin, 'APP_ORIGIN is required');
const check = async (label, run) => { await run(); console.log(`ok  ${label}`); };

await check('front door, terms and the Google guide render', async () => {
  const home = await fetch(`${origin}/`);
  assert.equal(home.status, 200); assert.match(await home.text(), /Trang của quán, mở từ thẻ NFC/);
  for (const path of ['/dieu-khoan', '/quyen-rieng-tu', '/huong-dan-google']) assert.equal((await fetch(`${origin}${path}`)).status, 200, path);
});
await check('a guest write without the published page\'s proof is refused', async () => {
  const reply = await fetch(`${origin}/api/v2/pages/visits`, { method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json', Authorization: `Bearer ${'a'.repeat(64)}` },
    body: JSON.stringify({ loadKey: randomUUID(), navigationKind: 'load' }) });
  assert.equal(reply.status, 403); assert.deepEqual(await reply.json(), { error: 'INVALID_RENDER_PROOF' });
});
await check('the app reaches its database (a wrong sign-in is refused as wrong, not as unavailable)', async () => {
  const reply = await fetch(`${origin}/api/owner/v2/login`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'nobody-here', password: 'not-a-real-password', next: '/ZZZ/none' }) });
  assert.equal(reply.status, 401, `expected 401, got ${reply.status} ${await reply.text()}`);
});
await check('an upload signed like the app signs it lands in the store, and guests can read it', async () => {
  const store = storageSettings(process.env);
  assert.ok(store, 'storage settings are incomplete');
  const key = `selfhost-smoke/${randomUUID()}.txt`, body = `self-host ${new Date().toISOString()}`;
  const put = presignUrl({ method: 'PUT', ...storageHost(store), path: `/${store.bucket}/${key}`, region: store.region, service: 's3',
    accessKeyId: store.accessKeyId, secretAccessKey: store.secretAccessKey, date: new Date(), expiresSeconds: 300,
    headers: { 'content-type': 'text/plain', 'content-length': String(Buffer.byteLength(body)) } });
  const sent = await fetch(put, { method: 'PUT', headers: { 'content-type': 'text/plain' }, body });
  assert.equal(sent.status, 200, `store refused the signed PUT: ${sent.status} ${await sent.text()}`);
  const read = await fetch(`${store.publicOrigin}/${key}`);
  assert.equal(read.status, 200); assert.equal(await read.text(), body);
  // And an unsigned write is refused: the bucket is public to read, never to write.
  assert.notEqual((await fetch(`${store.endpoint}/${store.bucket}/${key}-unsigned`, { method: 'PUT', body: 'x' })).status, 200);
});
console.log('Self-hosted platform: all checks passed.');
