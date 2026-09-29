import { presignUrl } from './sigv4';
import { storageHost, type StorageSettings } from './storage-settings';

export { storageSettings, type StorageSettings } from './storage-settings';

/** A signed URL for one object: PUT pins the exact headers the browser must send, GET reads it back, DELETE removes it. */
export function presignObject(settings: StorageSettings, method: 'GET' | 'PUT' | 'DELETE', key: string, options: { date: Date; expiresSeconds: number; headers?: Record<string, string> }) {
  return presignUrl({ method, ...storageHost(settings), path: `/${settings.bucket}/${key}`,
    region: settings.region, service: 's3', accessKeyId: settings.accessKeyId, secretAccessKey: settings.secretAccessKey,
    date: options.date, expiresSeconds: options.expiresSeconds, headers: options.headers });
}

/**
 * The key of a shop upload this app handed out (lib/owner/media.ts), read from its public URL; null for any other address
 * -- an older store's, a profile picture, a picture shipped with the app. Only such a key is ever removed (rà bảo mật
 * 29/09, C3b-2), so no URL in a request or a page can point a removal anywhere else.
 */
export function uploadKey(settings: StorageSettings, url: string): string | null {
  const prefix = `${settings.publicOrigin}/`;
  if (!url.startsWith(prefix)) return null;
  const key = url.slice(prefix.length), id = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
  return new RegExp(`^shops/${id}/${id}\\.(jpg|png|webp|mp4)$`).test(key) ? key : null;
}

/** Removes one object with a signed DELETE. Gone, or never sent (404), is removed; any other answer throws. */
export async function removeObject(settings: StorageSettings, key: string, fetcher: typeof fetch = fetch, now = new Date()) {
  const response = await fetcher(presignObject(settings, 'DELETE', key, { date: now, expiresSeconds: 60 }), { method: 'DELETE', signal: AbortSignal.timeout(10_000) });
  if (!response.ok && response.status !== 404) throw new Error(`STORE_${response.status}`);
  return true;
}
