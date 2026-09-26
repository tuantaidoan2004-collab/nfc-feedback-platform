import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { OwnerError, sessionHash, transaction, username, type OwnerCredential } from './auth';
import { presignObject, storageSettings, type StorageSettings } from '../media/storage';
import { UPLOAD_EXPIRES_SECONDS } from './media';

/**
 * Account profiles (lát F2, Tài 2026-09-18): every person in a shop has an account that reads like a social
 * network's — a name, an @handle, a short bio, a round picture and a cover. The handle is the username, so changing
 * it changes what the person signs in with. Only the person themselves edits their profile: support standing in for
 * an owner never does, at any switch position.
 */
export type Profile = {
  id: string; handle: string; displayName: string | null; bio: string | null; avatarUrl: string | null; coverUrl: string | null;
  email: string | null; joinedAt: string; uploads: boolean;
  /** Each shop with the person's role there: the owner, or a role with its icon and colour (migration 015). */
  shops: { slug: string; name: string; role: 'owner' | 'manager'; roleName: string | null; roleIcon: string | null; roleColor: string | null; showBadge: boolean }[];
};
/** A Map for the same reason as the shop uploads in media.ts: a plain object answers to 'constructor' (F-012). */
const IMAGES = new Map<string, string>([['image/jpeg', 'jpg'], ['image/png', 'png'], ['image/webp', 'webp']]);
const MAX_IMAGE = 5 * 1024 * 1024;
const FIELDS = ['avatarUrl', 'bio', 'coverUrl', 'displayName', 'handle'];

/** Trimmed text of 1..max characters with no control characters or angle brackets; empty means "none". */
function text(value: unknown, max: number) {
  if (value === null) return null;
  if (typeof value !== 'string') throw new OwnerError(400, 'INVALID_PROFILE');
  const trimmed = value.trim();
  if (!trimmed) return null;
  if ([...trimmed].length > max || /[\u0000-\u001f\u007f<>]/.test(trimmed)) throw new OwnerError(400, 'INVALID_PROFILE');
  return trimmed;
}

export class OwnerProfiles {
  constructor(private pool: Pool, private settings: StorageSettings | null = storageSettings(), private now: () => Date = () => new Date()) {}

  /** The signed-in person, never a stand-in: the impersonation cookie belongs to the shop's paths, not to a person. */
  private async user(db: PoolClient, credential: OwnerCredential, lock = false) {
    if (typeof credential === 'object') throw new OwnerError(403, 'IMPERSONATION_READ_ONLY');
    if (typeof credential !== 'string' || !/^[a-f0-9]{64}$/.test(credential)) throw new OwnerError(401, 'LOGIN_REQUIRED');
    const row = (await db.query(`SELECT u.* FROM owner_auth_sessions_v2 a JOIN owner_identities_v2 u ON u.id=a.user_id
      WHERE a.token_hash=$1 AND a.revoked_at IS NULL AND a.expires_at>clock_timestamp() AND u.active ${lock ? 'FOR UPDATE OF u' : 'FOR SHARE OF a,u'}`,
      [sessionHash(credential)])).rows[0];
    if (!row) throw new OwnerError(401, 'LOGIN_REQUIRED');
    return row;
  }

  /** Images must be ones this person uploaded: under their own folder on the configured media store. */
  private image(value: unknown, userId: string) {
    if (value === null || value === '') return null;
    const prefix = this.settings ? `${this.settings.publicOrigin}/users/${userId}/` : null;
    if (typeof value !== 'string' || !prefix || !value.startsWith(prefix) || !/^[a-f0-9-]{36}\.(jpg|png|webp)$/.test(value.slice(prefix.length)))
      throw new OwnerError(400, 'INVALID_PROFILE');
    return value;
  }

  async get(credential: OwnerCredential): Promise<Profile> {
    return transaction(this.pool, async db => {
      const u = await this.user(db, credential);
      const shops = (await db.query(`SELECT s.slug,s.name,m.role,r.name "roleName",r.icon "roleIcon",r.color "roleColor",m.show_badge "showBadge"
        FROM owner_memberships_v2 m JOIN shops s ON s.id=m.shop_id LEFT JOIN shop_roles r ON r.id=m.role_id
        WHERE m.user_id=$1 AND m.active AND s.publishing_state='active' ORDER BY m.role='owner' DESC,s.name`, [u.id])).rows;
      return { id: u.id, handle: u.username, displayName: u.display_name, bio: u.bio, avatarUrl: u.avatar_url, coverUrl: u.cover_url,
        email: u.email ?? null, joinedAt: (u.created_at as Date).toISOString(), shops, uploads: !!this.settings };
    });
  }

  async update(credential: OwnerCredential, body: unknown) {
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).sort().join() !== FIELDS.join()) throw new OwnerError(400, 'INVALID_PROFILE');
    const data = body as Record<string, unknown>;
    const handle = typeof data.handle === 'string' ? username(data.handle.trim().replace(/^@/, '')) : null;
    if (!handle) throw new OwnerError(400, 'INVALID_HANDLE');
    const displayName = text(data.displayName, 60), bio = text(data.bio, 160);
    await transaction(this.pool, async db => {
      const u = await this.user(db, credential, true);
      const avatar = this.image(data.avatarUrl, u.id), cover = this.image(data.coverUrl, u.id);
      if (handle !== u.username && (await db.query('SELECT 1 FROM owner_identities_v2 WHERE username=$1', [handle])).rowCount) throw new OwnerError(409, 'HANDLE_TAKEN');
      try {
        await db.query('UPDATE owner_identities_v2 SET username=$2,display_name=$3,bio=$4,avatar_url=$5,cover_url=$6 WHERE id=$1',
          [u.id, handle, displayName, bio, avatar, cover]);
      } catch (error) {
        // Two people taking the same free handle at once: the unique index decides, the loser hears it is taken.
        if ((error as { code?: string }).code === '23505') throw new OwnerError(409, 'HANDLE_TAKEN');
        throw error;
      }
    });
    return this.get(credential);
  }

  /** A signed PUT for one picture straight to the media store, under the person's own folder. */
  async presign(credential: OwnerCredential, body: unknown) {
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).sort().join() !== 'size,type') throw new OwnerError(400, 'INVALID_UPLOAD');
    const { type, size } = body as Record<string, unknown>;
    const ext = typeof type === 'string' ? IMAGES.get(type) : undefined;
    if (!ext) throw new OwnerError(415, 'UNSUPPORTED_MEDIA');
    if (!Number.isSafeInteger(size) || Number(size) < 1) throw new OwnerError(400, 'INVALID_UPLOAD');
    if (Number(size) > MAX_IMAGE) throw new OwnerError(413, 'MEDIA_TOO_LARGE');
    const u = await transaction(this.pool, db => this.user(db, credential));
    if (!this.settings) throw new OwnerError(503, 'UPLOADS_NOT_CONFIGURED');
    const key = `users/${u.id}/${randomUUID()}.${ext}`;
    const upload = presignObject(this.settings, 'PUT', key,
      { date: this.now(), expiresSeconds: UPLOAD_EXPIRES_SECONDS, headers: { 'content-type': type as string, 'content-length': String(size) } });
    return { upload, url: `${this.settings.publicOrigin}/${key}`, kind: 'image' as const, headers: { 'Content-Type': type as string } };
  }
}
