// The local app's picture store (scripts/local.mjs): the part of an S3-compatible store the app uses, on 127.0.0.1, files in
// ~/.nfc-local/media. Local only -- production and self-hosting use R2 or SeaweedFS (lib/media/storage-settings.ts).
//   PUT    /<bucket>/<key>  signed (lib/owner/media.ts): exact type and size, before the link expires
//   GET    /<bucket>/<key>  public, as guests read pictures from the real store
//   DELETE /<bucket>/<key>  signed: a picture refused in /gov is removed (rà bảo mật 29/09, C3b-2)
// The signature is checked with the app's own signer, so an upload that works here is shaped as the real store wants it.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { timingSafeEqual } from 'node:crypto';
import { presignUrl } from '@/lib/media/sigv4';

const endpoint = new URL(process.env.STORAGE_ENDPOINT ?? ''), bucket = process.env.R2_BUCKET ?? '', region = process.env.STORAGE_REGION || 'auto';
const accessKeyId = process.env.R2_ACCESS_KEY_ID ?? '', secretAccessKey = process.env.R2_SECRET_ACCESS_KEY ?? '';
const root = process.env.NFC_LOCAL_MEDIA_DIR ?? '', app = process.env.APP_ORIGIN ?? '';
const MAX = 50 * 1024 * 1024, KEY = /^shops\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp|mp4)$/;
const TYPES: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', mp4: 'video/mp4' };

function signed(request: IncomingMessage, url: URL, method: 'PUT' | 'DELETE') {
  const q = url.searchParams, stamp = q.get('X-Amz-Date') ?? '', expires = Number(q.get('X-Amz-Expires')), given = q.get('X-Amz-Signature') ?? '';
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(stamp);
  if (!match || !Number.isSafeInteger(expires) || expires < 1 || expires > 604800) return false;
  const date = new Date(Date.UTC(+match[1], +match[2] - 1, +match[3], +match[4], +match[5], +match[6]));
  if (Date.now() > date.getTime() + expires * 1000) return false;
  const names = (q.get('X-Amz-SignedHeaders') ?? '').split(';').filter(name => name && name !== 'host');
  const headers = Object.fromEntries(names.map(name => [name, String(request.headers[name] ?? '')]));
  const expected = new URL(presignUrl({ method, host: endpoint.host, scheme: 'http', path: url.pathname, region, service: 's3', accessKeyId,
    secretAccessKey, date, expiresSeconds: expires, headers })).searchParams.get('X-Amz-Signature') ?? '';
  return given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

function answer(response: ServerResponse, status: number, headers: Record<string, string> = {}, body?: Buffer | string) {
  response.writeHead(status, { 'Access-Control-Allow-Origin': app, Vary: 'Origin', ...headers }); response.end(body);
}

createServer((request, response) => {
  const url = new URL(request.url ?? '/', endpoint), prefix = `/${bucket}/`;
  if (request.method === 'OPTIONS') return answer(response, 204, { 'Access-Control-Allow-Methods': 'PUT', 'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Max-Age': '600' });
  const key = url.pathname.startsWith(prefix) ? decodeURIComponent(url.pathname.slice(prefix.length)) : '';
  if (!KEY.test(key)) return answer(response, 404);
  const file = join(root, key);
  if (request.method === 'GET' || request.method === 'HEAD') {
    if (!existsSync(file)) return answer(response, 404);
    const body = readFileSync(file);
    return answer(response, 200, { 'Content-Type': TYPES[key.split('.').pop()!], 'Content-Length': String(body.length), 'Cache-Control': 'public, max-age=60' }, request.method === 'GET' ? body : undefined);
  }
  if (request.method === 'DELETE') {
    if (!signed(request, url, 'DELETE')) return answer(response, 403);
    rmSync(file, { force: true }); return answer(response, 204);
  }
  if (request.method !== 'PUT') return answer(response, 405);
  const size = Number(request.headers['content-length']);
  if (!signed(request, url, 'PUT') || !Number.isSafeInteger(size) || size < 1 || size > MAX) { request.resume(); return answer(response, 403); }
  const parts: Buffer[] = []; let got = 0;
  request.on('data', (part: Buffer) => { got += part.length; if (got <= size) parts.push(part); });
  request.on('end', () => {
    if (got !== size) return answer(response, 400);
    mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, Buffer.concat(parts));
    answer(response, 200, { ETag: `"${got}"` });
  });
}).listen(Number(endpoint.port), endpoint.hostname, () => console.log(`Kho ảnh local: ${endpoint.origin}/${bucket} (tệp ở ${root})`));
