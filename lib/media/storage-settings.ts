/**
 * Where uploads live: any S3-compatible object store (lát I1, Tài 26/09: the platform must run without renting a
 * particular service). Cloudflare R2 is one choice of configuration, not a dependency in the code.
 *
 *   - `STORAGE_ENDPOINT` unset: Cloudflare R2 at `https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com`, as production has
 *     run since 18/09 -- nothing to change on Vercel.
 *   - `STORAGE_ENDPOINT` set (e.g. `https://s3.ap-southeast-1.amazonaws.com`, or SeaweedFS on the same machine): that
 *     store, path-style (`/<bucket>/<key>`), with `STORAGE_REGION` (default `auto`, which R2 accepts; SeaweedFS takes any).
 *
 * The key, secret and bucket keep their historic `R2_*` names so no deployment has to rename anything; they name
 * whichever store the endpoint points at. Plain `http` is accepted only on this machine (loopback), for a local store.
 */
/** `publicOrigin` is where guests read an object: `${publicOrigin}/${key}` (an origin, or origin + path prefix). */
export type StorageSettings = { endpoint: string; region: string; accessKeyId: string; secretAccessKey: string; bucket: string; publicOrigin: string };

const loopback = (url: URL) => ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
/**
 * An origin, or with `withPath` an origin plus a path prefix: a store addressed path-style serves a public object at
 * `<origin>/<bucket>/<key>` (SeaweedFS, S3), where R2 behind its own domain serves it at `<origin>/<key>`.
 */
const safeOrigin = (value: string | undefined, withPath = false) => {
  let url: URL; try { url = new URL(value ?? ''); } catch { return null; }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback(url))) return null;
  if (url.username || url.password || url.search || url.hash) return null;
  const path = url.pathname.replace(/\/+$/, '');
  if (path && (!withPath || !/^(\/[a-z0-9][a-z0-9._-]{0,62})+$/.test(path))) return null;
  return url.origin + path;
};

/** All settings or none: a half-configured store answers "not configured" instead of failing mid-upload. */
export function storageSettings(env: Record<string, string | undefined> = process.env, prefix: 'R2' | 'R2_BACKUP' = 'R2'): StorageSettings | null {
  const read = (name: string) => env[`${prefix}_${name}`]?.trim() || undefined;
  const accessKeyId = read('ACCESS_KEY_ID'), secretAccessKey = read('SECRET_ACCESS_KEY'), bucket = read('BUCKET');
  const accountId = read('ACCOUNT_ID');
  const custom = (prefix === 'R2' ? env.STORAGE_ENDPOINT : read('ENDPOINT'))?.trim();
  const endpoint = custom ? safeOrigin(custom) : accountId && /^[a-f0-9]{32}$/.test(accountId) ? `https://${accountId}.r2.cloudflarestorage.com` : null;
  const region = ((prefix === 'R2' ? env.STORAGE_REGION : read('REGION'))?.trim()) || 'auto';
  // The backup bucket (prefix R2_BACKUP) is never read by the public, so it has no public origin.
  const publicOrigin = prefix === 'R2' ? safeOrigin(env.MEDIA_PUBLIC_ORIGIN, true) : '';
  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket || publicOrigin === null || !/^[a-z0-9-]{1,63}$/.test(region)) return null;
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket)) return null;
  return { endpoint, region, accessKeyId, secretAccessKey, bucket, publicOrigin };
}

/** Host (with any port) and scheme of the store, for callers that sign with lib/media/sigv4.ts directly (the scripts). */
export function storageHost(settings: StorageSettings) {
  const url = new URL(settings.endpoint);
  return { host: url.host, scheme: url.protocol === 'http:' ? 'http' as const : 'https' as const };
}
