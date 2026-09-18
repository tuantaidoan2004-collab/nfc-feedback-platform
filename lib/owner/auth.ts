import { randomBytes, createHash, scrypt, timingSafeEqual } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
export class OwnerError extends Error { constructor(public status: number, public code: string) { super(code); } }
export const sessionHash = (token: string) => createHash('sha256').update(`nfc-owner-session-v2\0${token}`).digest('hex');
/** The sign-in throttle bucket for a username; resetting the template test account clears its row. */
export const loginBucket = (name: string) => createHash('sha256').update(`nfc-owner-login-v2\0${name}`).digest('hex');
export const username = (value: unknown) => typeof value === 'string' && /^[a-z0-9][a-z0-9_.-]{2,63}$/.test(value.trim().toLowerCase()) ? value.trim().toLowerCase() : null;
export const validPassword = (value: unknown): value is string => typeof value === 'string' && value.length >= 12 && Buffer.byteLength(value) <= 256;
// Fixed, versioned parameters; never accept KDF work factors from public input.
export function passwordKey(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => scrypt(password, Buffer.from(salt, 'hex'), 32,
    { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 }, (error, key) => error ? reject(error) : resolve(key)));
}
export async function transaction<T>(pool: Pool, operation: (db: PoolClient) => Promise<T>): Promise<T> {
  const db = await pool.connect();
  try { await db.query('BEGIN'); const result = await operation(db); await db.query('COMMIT'); return result; }
  catch (error) { await db.query('ROLLBACK'); throw error; } finally { db.release(); }
}
export const impersonationHash = (token: string) => createHash('sha256').update(`nfc-impersonation-v1\0${token}`).digest('hex');
const opaque = (token: unknown): token is string => typeof token === 'string' && /^[a-f0-9]{64}$/.test(token);

/** A bare string is an owner session token. An administrator standing in for the owner presents the other form. */
export type OwnerCredential = string | undefined | { impersonation: string | undefined };
/**
 * What the caller is about to do. Every caller names it, so no route can forget to ask:
 * shell = the dashboard frame only, no data · overview = counts and rows without feedback text · feedback = feedback
 * text · design = edit and publish the customer page · export = bulk files, never for support · write = change
 * case notes and the support switch, never for support.
 */
export type OwnerNeed = 'shell' | 'overview' | 'feedback' | 'design' | 'export' | 'write';
export type ImpersonationScope = 'overview' | 'feedback' | 'design';
export type OwnerActor = { kind: 'owner' }
  | { kind: 'admin'; adminId: string; adminUsername: string; sessionId: string; scope: ImpersonationScope; reason: string; expiresAt: string };
export type OwnerAccess = { userId: string; shopId: string; slug: string; name: string; role: 'owner' | 'manager'; actor: OwnerActor };

/**
 * The one gate both kinds of caller pass through: the owner identity is active, the membership is active and the
 * shop is active. An impersonation stands in for a specific owner, so it is held to exactly the same conditions
 * as that owner signing in — a shop that is suspended, or an owner who was switched off, is closed to both.
 */
export async function ownerShop(db: PoolClient, userId: string, shop: { slug: string } | { id: string }) {
  const [where, key] = 'slug' in shop ? ['lower(s.slug)=lower($2)', shop.slug] : ['s.id=$2', shop.id];
  return (await db.query(`SELECT s.id,s.slug,s.name,m.role FROM owner_memberships_v2 m JOIN shops s ON s.id=m.shop_id
    JOIN owner_identities_v2 u ON u.id=m.user_id
    WHERE m.user_id=$1 AND ${where} AND u.active AND m.active AND s.publishing_state='active' FOR SHARE OF m,s,u`, [userId, key])).rows[0] as
    { id: string; slug: string; name: string; role: 'owner' | 'manager' } | undefined;
}

/**
 * The owner's four-position support switch (migration 012): off · view (1: read feedback) · edit (2: change the
 * page, no data at all) · full (3). Older on/off rows still count: on = view. No row means off.
 */
export type SupportLevel = 'off' | 'view' | 'edit' | 'full';
export const SUPPORT_LEVELS: SupportLevel[] = ['off', 'view', 'edit', 'full'];
export async function supportLevel(db: PoolClient, shopId: string): Promise<SupportLevel> {
  const row = (await db.query(`SELECT permission,enabled,level FROM shop_support_grant_events WHERE shop_id=$1 AND permission IN ('feedback','level')
    ORDER BY id DESC LIMIT 1`, [shopId])).rows[0];
  if (!row) return 'off';
  return row.permission === 'level' ? row.level : row.enabled ? 'view' : 'off';
}

async function now(db: PoolClient) { return (await db.query('SELECT clock_timestamp() now')).rows[0].now as Date; }

/** Each caller supplies a transaction. Share locks linearize revoke/membership/suspend/ending against a read or write. */
export async function authorize(db: PoolClient, credential: OwnerCredential, slug: string, need: OwnerNeed): Promise<OwnerAccess> {
  if (typeof credential === 'object') return authorizeImpersonation(db, credential.impersonation, slug, need);
  const token = credential;
  if (!opaque(token)) throw new OwnerError(401, 'LOGIN_REQUIRED');
  const session = (await db.query(`SELECT a.user_id,a.expires_at FROM owner_auth_sessions_v2 a JOIN owner_identities_v2 u ON u.id=a.user_id
    WHERE a.token_hash=$1 AND a.revoked_at IS NULL AND a.expires_at>clock_timestamp() AND u.active FOR SHARE OF a,u`, [sessionHash(token)])).rows[0];
  if (!session) throw new OwnerError(401, 'LOGIN_REQUIRED');
  const shop = await ownerShop(db, session.user_id, { slug });
  if (!shop) throw new OwnerError(403, 'ACCESS_DENIED');
  if (await now(db) >= session.expires_at) throw new OwnerError(401,'LOGIN_REQUIRED');
  return { userId: session.user_id, shopId: shop.id, slug: shop.slug, name: shop.name, role: shop.role, actor: { kind: 'owner' } };
}

async function authorizeImpersonation(db: PoolClient, token: string | undefined, slug: string, need: OwnerNeed): Promise<OwnerAccess> {
  if (!opaque(token)) throw new OwnerError(401, 'IMPERSONATION_ENDED');
  // Alive only while the administrator is: the session that opened it still valid, the account still active.
  const row = (await db.query(`SELECT i.id,i.admin_id,a.username,i.owner_user_id,i.shop_id,i.scope,i.reason,
      LEAST(i.expires_at,s.expires_at) expires_at
    FROM admin_impersonation_sessions i JOIN admin_auth_sessions s ON s.token_hash=i.admin_session_hash JOIN platform_admins a ON a.id=i.admin_id
    WHERE i.token_hash=$1 AND i.ended_at IS NULL AND i.expires_at>clock_timestamp()
      AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp() AND a.active FOR SHARE OF i,s,a`, [impersonationHash(token)])).rows[0];
  if (!row) throw new OwnerError(401, 'IMPERSONATION_ENDED');
  // Refused here, not in the interface: a request sent by hand meets the same answer as a disabled button.
  if (need === 'write') throw new OwnerError(403, 'IMPERSONATION_READ_ONLY');
  // The shop's data leaves only through the shop's own hands. No scope and no switch opens bulk export to support.
  if (need === 'export') throw new OwnerError(403, 'IMPERSONATION_NO_EXPORT');
  if (need === 'feedback' && row.scope !== 'feedback') throw new OwnerError(403, 'IMPERSONATION_SCOPE');
  if (need === 'design' && row.scope !== 'design') throw new OwnerError(403, 'IMPERSONATION_SCOPE');
  const shop = await ownerShop(db, row.owner_user_id, { slug });
  // The cookie is scoped to one shop's paths, but the session is what decides: it names exactly one shop.
  if (!shop || shop.id !== row.shop_id) throw new OwnerError(403, 'ACCESS_DENIED');
  // Asked on every request, so moving the switch takes effect at once rather than when the session runs out.
  const level = await supportLevel(db, shop.id);
  if (row.scope === 'feedback' && !['view', 'full'].includes(level)) throw new OwnerError(403, 'SUPPORT_NOT_GRANTED');
  if (row.scope === 'design' && !['edit', 'full'].includes(level)) throw new OwnerError(403, 'SUPPORT_NOT_GRANTED');
  // Position 2 lets support edit the page but hides every figure, even the overview allowed when the switch is off.
  if ((need === 'overview' || need === 'feedback') && level === 'edit') throw new OwnerError(403, 'SUPPORT_NOT_GRANTED');
  if (await now(db) >= row.expires_at) throw new OwnerError(401, 'IMPERSONATION_ENDED');
  return { userId: row.owner_user_id, shopId: shop.id, slug: shop.slug, name: shop.name, role: shop.role,
    actor: { kind: 'admin', adminId: row.admin_id, adminUsername: row.username, sessionId: row.id, scope: row.scope, reason: row.reason,
      expiresAt: (row.expires_at as Date).toISOString() } };
}
export class OwnerAuth {
  constructor(private pool: Pool) {}
  /** Internal bootstrap only. No registration/provisioning HTTP route; real administrative authority required later. */
  async bootstrap(name: string, password: string, permit: () => Promise<void>) {
    await permit(); const normalized = username(name);
    if (!normalized || !validPassword(password)) throw new OwnerError(400, 'INVALID_CREDENTIAL');
    const salt = randomBytes(16).toString('hex'), key = await passwordKey(password, salt);
    return (await this.pool.query('INSERT INTO owner_identities_v2(username,password_salt,password_key)VALUES($1,$2,$3)RETURNING id', [normalized, salt, key.toString('hex')])).rows[0].id as string;
  }
  async login(name: unknown, password: unknown, previous?: string) {
    const normalized = username(name);
    if (!normalized || typeof password !== 'string' || Buffer.byteLength(password) > 256) throw new OwnerError(401, 'LOGIN_FAILED');
    // One KDF in flight per database, across app instances; fail fast instead of queueing expensive hashes.
    const result = await transaction(this.pool, async db => {
      if (!(await db.query("SELECT pg_try_advisory_xact_lock(hashtextextended('nfc-owner-login-v2',0)) locked")).rows[0].locked) return null;
      await db.query("DELETE FROM owner_login_limits WHERE window_start<clock_timestamp()-interval '1 hour'");
      for (const [bucket, limit, seconds] of [['global', 60, 60], [loginBucket(normalized), 8, 900]] as const) {
        const r = (await db.query(`INSERT INTO owner_login_limits(bucket,window_start,attempts)VALUES($1,clock_timestamp(),1)
          ON CONFLICT(bucket) DO UPDATE SET attempts=CASE WHEN owner_login_limits.window_start<=clock_timestamp()-$2*interval '1 second' THEN 1 ELSE owner_login_limits.attempts+1 END,
          window_start=CASE WHEN owner_login_limits.window_start<=clock_timestamp()-$2*interval '1 second' THEN clock_timestamp() ELSE owner_login_limits.window_start END RETURNING attempts`, [bucket, seconds])).rows[0];
        if (r.attempts > limit) return null;
      }
      const user = (await db.query('SELECT * FROM owner_identities_v2 WHERE username=$1 FOR SHARE', [normalized])).rows[0];
      const derived = await passwordKey(password, user?.password_salt ?? '0'.repeat(32));
      const matches = timingSafeEqual(derived, Buffer.from(user?.password_key ?? '0'.repeat(64), 'hex'));
      if (!user?.active || !matches) return null;
      if (previous && /^[a-f0-9]{64}$/.test(previous)) await db.query('UPDATE owner_auth_sessions_v2 SET revoked_at=clock_timestamp() WHERE token_hash=$1', [sessionHash(previous)]);
      const token = randomBytes(32).toString('hex');
      const row = (await db.query("INSERT INTO owner_auth_sessions_v2(token_hash,user_id,expires_at)VALUES($1,$2,clock_timestamp()+interval '8 hours')RETURNING expires_at", [sessionHash(token), user.id])).rows[0];
      return { token, expiresAt: row.expires_at as Date };
    });
    if (!result) throw new OwnerError(401, 'LOGIN_FAILED'); return result;
  }
  /**
   * The owner's own password change (Tài, 2026-09-18). Only a real owner session, never a stand-in. The current
   * password is checked against the same per-account limit as signing in, so this screen cannot be used to guess it;
   * the attempt is counted even when the check fails. Every other session of the account is signed out; this one stays.
   */
  async changePassword(credential: OwnerCredential, current: unknown, next: unknown) {
    if (typeof credential === 'object') throw new OwnerError(403, 'IMPERSONATION_READ_ONLY');
    if (!opaque(credential)) throw new OwnerError(401, 'LOGIN_REQUIRED');
    if (typeof current !== 'string' || !current || Buffer.byteLength(current) > 256) throw new OwnerError(400, 'INVALID_PASSWORD');
    if (!validPassword(next)) throw new OwnerError(400, 'WEAK_PASSWORD');
    if (next === current) throw new OwnerError(400, 'SAME_PASSWORD');
    const token = credential;
    // Decided inside the transaction, thrown after it commits, so a wrong guess still counts against the limit.
    const outcome = await transaction(this.pool, async db => {
      const user = (await db.query(`SELECT u.id,u.username,u.password_salt,u.password_key FROM owner_auth_sessions_v2 a
        JOIN owner_identities_v2 u ON u.id=a.user_id WHERE a.token_hash=$1 AND a.revoked_at IS NULL AND a.expires_at>clock_timestamp() AND u.active
        FOR UPDATE OF u`, [sessionHash(token)])).rows[0];
      if (!user) return 'LOGIN_REQUIRED' as const;
      const attempts = (await db.query(`INSERT INTO owner_login_limits(bucket,window_start,attempts)VALUES($1,clock_timestamp(),1)
        ON CONFLICT(bucket) DO UPDATE SET attempts=CASE WHEN owner_login_limits.window_start<=clock_timestamp()-interval '900 seconds' THEN 1 ELSE owner_login_limits.attempts+1 END,
        window_start=CASE WHEN owner_login_limits.window_start<=clock_timestamp()-interval '900 seconds' THEN clock_timestamp() ELSE owner_login_limits.window_start END
        RETURNING attempts`, [loginBucket(user.username)])).rows[0].attempts as number;
      if (attempts > 8) return 'TOO_MANY_ATTEMPTS' as const;
      const matches = timingSafeEqual(await passwordKey(current, user.password_salt), Buffer.from(user.password_key, 'hex'));
      if (!matches) return 'WRONG_PASSWORD' as const;
      const salt = randomBytes(16).toString('hex'), key = (await passwordKey(next, salt)).toString('hex');
      await db.query('UPDATE owner_identities_v2 SET password_salt=$2,password_key=$3 WHERE id=$1', [user.id, salt, key]);
      await db.query('UPDATE owner_auth_sessions_v2 SET revoked_at=clock_timestamp() WHERE user_id=$1 AND token_hash<>$2 AND revoked_at IS NULL', [user.id, sessionHash(token)]);
      // A successful change clears the account's failed-guess count, as a successful sign-in would reset its window.
      await db.query('DELETE FROM owner_login_limits WHERE bucket=$1', [loginBucket(user.username)]);
      return 'CHANGED' as const;
    });
    if (outcome === 'LOGIN_REQUIRED') throw new OwnerError(401, outcome);
    if (outcome === 'TOO_MANY_ATTEMPTS') throw new OwnerError(429, outcome);
    if (outcome === 'WRONG_PASSWORD') throw new OwnerError(403, outcome);
    return { changed: true };
  }
  async logout(token?: string) {
    if (token && /^[a-f0-9]{64}$/.test(token)) await this.pool.query('UPDATE owner_auth_sessions_v2 SET revoked_at=clock_timestamp() WHERE token_hash=$1 AND revoked_at IS NULL', [sessionHash(token)]);
  }
  async access(credential: OwnerCredential, slug: string, need: OwnerNeed) {
    const access = await transaction(this.pool, db => authorize(db, credential, slug, need));
    // Approximate use timestamp, no sliding expiry. No credential value is returned to dashboard code.
    if (typeof credential === 'string') await this.pool.query("UPDATE owner_auth_sessions_v2 SET last_used_at=clock_timestamp() WHERE token_hash=$1 AND last_used_at<clock_timestamp()-interval '5 minutes'", [sessionHash(credential)]);
    return access;
  }
}
