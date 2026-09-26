import { presignUrl } from './sigv4';
import { storageHost, type StorageSettings } from './storage-settings';

export { storageSettings, type StorageSettings } from './storage-settings';

/** A signed URL for one object: PUT pins the exact headers the browser must send, GET reads it back. */
export function presignObject(settings: StorageSettings, method: 'GET' | 'PUT', key: string, options: { date: Date; expiresSeconds: number; headers?: Record<string, string> }) {
  return presignUrl({ method, ...storageHost(settings), path: `/${settings.bucket}/${key}`,
    region: settings.region, service: 's3', accessKeyId: settings.accessKeyId, secretAccessKey: settings.secretAccessKey,
    date: options.date, expiresSeconds: options.expiresSeconds, headers: options.headers });
}
