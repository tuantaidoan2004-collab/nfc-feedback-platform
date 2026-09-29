import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { authorize, transaction, OwnerError, type OwnerCredential } from './auth';
import { recordAdminAction } from '../admin/audit';
import { presignObject, storageSettings, type StorageSettings } from '../media/storage';
import { recordActivity } from './activity';

/**
 * Direct uploads to the object store (Tài, 2026-09-18; any S3-compatible store since lát I1 -- lib/media/storage.ts).
 * The browser asks for a short-lived signed PUT, then sends the file straight to the store, so large videos never pass
 * through the app. The signature pins the exact type and size, and
 * the key sits under the shop's own folder. Anyone who may edit the page may upload, including support in a
 * design session (recorded on the owner's behalf).
 */
/**
 * A Map, not an object: `TYPES['constructor']` on a plain object answers with something inherited from
 * Object.prototype, so a made-up type name passed the "is this allowed" test and then carried `max: undefined`,
 * which no size can exceed — a signed PUT for a gigabyte (F-012, Astra, 2026-09-20). A Map has no such keys.
 */
const TYPES = new Map<string, { kind: 'image' | 'video'; ext: string; max: number }>([
  ['image/jpeg', { kind: 'image', ext: 'jpg', max: 5 * 1024 * 1024 }],
  ['image/png', { kind: 'image', ext: 'png', max: 5 * 1024 * 1024 }],
  ['image/webp', { kind: 'image', ext: 'webp', max: 5 * 1024 * 1024 }],
  // A poster clip after the editor has re-recorded it at 720p (lát E9): about four minutes at 1.5 Mbps.
  ['video/mp4', { kind: 'video', ext: 'mp4', max: 50 * 1024 * 1024 }],
]);
/** Second lock on the same door: whatever a rule says, nothing above this is ever signed. */
const MAX_UPLOAD = 50 * 1024 * 1024;
export const UPLOAD_EXPIRES_SECONDS = 300;
/**
 * When a picture can be decided in /gov (rà bảo mật 29/09, M1). A signed PUT can be sent again -- other bytes, the same
 * size and type -- until it expires, so a picture approved before then could be swapped for one nobody saw. The link's
 * lifetime, and a minute more for the store's clock and this app's disagreeing.
 */
export const UPLOAD_SETTLE_SECONDS = UPLOAD_EXPIRES_SECONDS + 60;
/**
 * How many files one shop may have waiting for review at once (rà bảo mật 29/09, M3). Every signed upload waits in the
 * operator's queue until decided, whether or not a file was ever sent, and a page shows at most five: without a bound one
 * shop could fill the queue, and the store, with files nobody will look at. A decision frees a place.
 */
export const PENDING_UPLOADS_MAX = 20;

export class OwnerMedia {
  constructor(private pool: Pool, private settings: StorageSettings | null = storageSettings(), private now: () => Date = () => new Date()) {}

  async presign(credential: OwnerCredential, slug: string, body: unknown) {
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).sort().join() !== 'size,type') throw new OwnerError(400, 'INVALID_UPLOAD');
    const { type, size } = body as Record<string, unknown>;
    const rule = typeof type === 'string' ? TYPES.get(type) : undefined;
    if (!rule) throw new OwnerError(415, 'UNSUPPORTED_MEDIA');
    if (!Number.isSafeInteger(size) || Number(size) < 1) throw new OwnerError(400, 'INVALID_UPLOAD');
    if (Number(size) > MAX_UPLOAD || Number(size) > rule.max) throw new OwnerError(413, 'MEDIA_TOO_LARGE');
    const settings = this.settings;
    const { access, key, url, upload } = await transaction(this.pool, async db => {
      const access = await authorize(db, credential, slug, 'design');
      if (!settings) throw new OwnerError(503, 'UPLOADS_NOT_CONFIGURED');
      // One shop's uploads are counted one at a time, so two asked at once cannot both take the last place.
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended('nfc-media-upload:'||$1,0))", [access.shopId]);
      const waiting = (await db.query("SELECT count(*)::int n FROM media_assets WHERE shop_id=$1 AND state='pending'", [access.shopId])).rows[0].n as number;
      if (waiting >= PENDING_UPLOADS_MAX) throw new OwnerError(429, 'UPLOAD_QUEUE_FULL');
      const key = `shops/${access.shopId}/${randomUUID()}.${rule.ext}`, url = `${settings.publicOrigin}/${key}`;
      // Every upload enters the review queue (migration 023): the page cannot be published with it until approved.
      await db.query('INSERT INTO media_assets(shop_id,url,kind,content_type,size_bytes,uploaded_by)VALUES($1,$2,$3,$4,$5,$6)',
        [access.shopId, url, rule.kind, type, size, access.actor.kind === 'admin' ? `admin:${access.actor.adminId}` : `owner:${access.userId}`]);
      const upload = presignObject(settings, 'PUT', key,
        { date: this.now(), expiresSeconds: UPLOAD_EXPIRES_SECONDS, headers: { 'content-type': type as string, 'content-length': String(size) } });
      return { access, key, url, upload };
    });
    if (access.actor.kind === 'admin') await recordAdminAction(this.pool, access.actor.adminId, { action: 'impersonation.design.upload',
      shopId: access.shopId, onBehalfOf: access.userId, detail: { session: access.actor.sessionId, key, type, size } });
    await recordActivity(this.pool, access, 'media.upload', rule.kind === 'video' ? 'Video' : 'Ảnh', { type: type as string });
    return { upload, url, kind: rule.kind, headers: { 'Content-Type': type as string }, review: 'pending' as const };
  }
}
