import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { authorize, transaction, OwnerError, type OwnerCredential } from './auth';
import { recordAdminAction } from '../admin/audit';
import { presignUrl } from '../media/sigv4';

/**
 * Direct uploads to Cloudflare R2 (Tài, 2026-09-18). The browser asks for a short-lived signed PUT, then sends the
 * file straight to R2, so large videos never pass through the app. The signature pins the exact type and size, and
 * the key sits under the shop's own folder. Anyone who may edit the page may upload, including support in a
 * design session (recorded on the owner's behalf).
 */
export type R2Settings = { accountId: string; accessKeyId: string; secretAccessKey: string; bucket: string; publicOrigin: string };
const TYPES: Record<string, { kind: 'image' | 'video'; ext: string; max: number }> = {
  'image/jpeg': { kind: 'image', ext: 'jpg', max: 5 * 1024 * 1024 },
  'image/png': { kind: 'image', ext: 'png', max: 5 * 1024 * 1024 },
  'image/webp': { kind: 'image', ext: 'webp', max: 5 * 1024 * 1024 },
  'video/mp4': { kind: 'video', ext: 'mp4', max: 30 * 1024 * 1024 },
};
export const UPLOAD_EXPIRES_SECONDS = 300;

/** All five settings or none: a half-configured bucket answers "not configured" instead of failing mid-upload. */
export function r2Settings(env: Record<string, string | undefined> = process.env): R2Settings | null {
  const settings = { accountId: env.R2_ACCOUNT_ID, accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    bucket: env.R2_BUCKET, publicOrigin: env.MEDIA_PUBLIC_ORIGIN };
  if (Object.values(settings).some(value => !value?.trim())) return null;
  let origin: URL; try { origin = new URL(settings.publicOrigin!); } catch { return null; }
  if (origin.protocol !== 'https:' || !/^[a-f0-9]{32}$/.test(settings.accountId!) || !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(settings.bucket!)) return null;
  return { ...settings, publicOrigin: origin.origin } as R2Settings;
}

export class OwnerMedia {
  constructor(private pool: Pool, private settings: R2Settings | null = r2Settings(), private now: () => Date = () => new Date()) {}

  async presign(credential: OwnerCredential, slug: string, body: unknown) {
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).sort().join() !== 'size,type') throw new OwnerError(400, 'INVALID_UPLOAD');
    const { type, size } = body as Record<string, unknown>;
    const rule = typeof type === 'string' ? TYPES[type] : undefined;
    if (!rule) throw new OwnerError(415, 'UNSUPPORTED_MEDIA');
    if (!Number.isSafeInteger(size) || Number(size) < 1) throw new OwnerError(400, 'INVALID_UPLOAD');
    if (Number(size) > rule.max) throw new OwnerError(413, 'MEDIA_TOO_LARGE');
    const access = await transaction(this.pool, db => authorize(db, credential, slug, 'design'));
    if (!this.settings) throw new OwnerError(503, 'UPLOADS_NOT_CONFIGURED');
    const key = `shops/${access.shopId}/${randomUUID()}.${rule.ext}`;
    const upload = presignUrl({ method: 'PUT', host: `${this.settings.accountId}.r2.cloudflarestorage.com`, path: `/${this.settings.bucket}/${key}`,
      region: 'auto', service: 's3', accessKeyId: this.settings.accessKeyId, secretAccessKey: this.settings.secretAccessKey,
      date: this.now(), expiresSeconds: UPLOAD_EXPIRES_SECONDS, headers: { 'content-type': type as string, 'content-length': String(size) } });
    if (access.actor.kind === 'admin') await recordAdminAction(this.pool, access.actor.adminId, { action: 'impersonation.design.upload',
      shopId: access.shopId, onBehalfOf: access.userId, detail: { session: access.actor.sessionId, key, type, size } });
    return { upload, url: `${this.settings.publicOrigin}/${key}`, kind: rule.kind, headers: { 'Content-Type': type as string } };
  }
}
