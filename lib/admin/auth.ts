import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
// Only the KDF parameters and the transaction helper are shared with owner auth, so both roles keep identical
// password cost. Everything that decides access — tables, hash domains, throttle buckets, advisory lock — is
// separate on purpose: a shop owner has no identity in this space and cannot become an administrator.
import { passwordKey, transaction } from '../owner/auth';

export class AdminError extends Error { constructor(public status: number, public code: string) { super(code); } }

export const adminSessionHash = (token: string) => createHash('sha256').update(`nfc-admin-session-v1\0${token}`).digest('hex');
const bucketHash = (name: string) => createHash('sha256').update(`nfc-admin-login-v1\0${name}`).digest('hex');
export const adminUsername = (value: unknown) =>
  typeof value === 'string' && /^[a-z0-9][a-z0-9_.-]{2,63}$/.test(value.trim().toLowerCase()) ? value.trim().toLowerCase() : null;
// Longer than the owner minimum: one administrative credential reaches every shop on the platform.
export const validAdminPassword = (value: unknown): value is string =>
  typeof value === 'string' && value.length >= 16 && Buffer.byteLength(value) <= 256;

export type AdminPrincipal = { adminId: string; username: string };

/** Each caller supplies a transaction. A share lock linearizes revoke and deactivation against the work. */
export async function authorizeAdmin(db: PoolClient, token: string | undefined): Promise<AdminPrincipal> {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) throw new AdminError(401, 'ADMIN_LOGIN_REQUIRED');
  const row = (await db.query(`SELECT s.admin_id,s.expires_at,a.username FROM admin_auth_sessions s JOIN platform_admins a ON a.id=s.admin_id
    WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp() AND a.active FOR SHARE OF s,a`, [adminSessionHash(token)])).rows[0];
  if (!row) throw new AdminError(401, 'ADMIN_LOGIN_REQUIRED');
  if ((await db.query('SELECT clock_timestamp() now')).rows[0].now >= row.expires_at) throw new AdminError(401, 'ADMIN_LOGIN_REQUIRED');
  return { adminId: row.admin_id as string, username: row.username as string };
}

export class AdminAuth {
  constructor(private pool: Pool) {}

  /** Internal bootstrap only. There is no registration route; holding the database credential is the authority. */
  async bootstrap(name: string, password: string, permit: () => Promise<void>) {
    await permit();
    const normalized = adminUsername(name);
    if (!normalized || !validAdminPassword(password)) throw new AdminError(400, 'INVALID_CREDENTIAL');
    const salt = randomBytes(16).toString('hex'), key = await passwordKey(password, salt);
    return (await this.pool.query('INSERT INTO platform_admins(username,password_salt,password_key)VALUES($1,$2,$3)RETURNING id',
      [normalized, salt, key.toString('hex')])).rows[0].id as string;
  }

  async login(name: unknown, password: unknown, previous?: string) {
    const normalized = adminUsername(name);
    if (!normalized || typeof password !== 'string' || Buffer.byteLength(password) > 256) throw new AdminError(401, 'ADMIN_LOGIN_FAILED');
    const result = await transaction(this.pool, async db => {
      // A lock of its own, not the owner one. Sharing it would let a flood of owner attempts keep the operator
      // out of the platform exactly when an incident needs attention. At most two KDFs run at once overall.
      if (!(await db.query("SELECT pg_try_advisory_xact_lock(hashtextextended('nfc-admin-login-v1',0)) locked")).rows[0].locked) return null;
      await db.query("DELETE FROM admin_login_limits WHERE window_start<clock_timestamp()-interval '1 hour'");
      // Tighter than owner limits because legitimate administrative login volume is a handful of attempts a day.
      for (const [bucket, limit, seconds] of [['global', 20, 60], [bucketHash(normalized), 5, 900]] as const) {
        const attempt = (await db.query(`INSERT INTO admin_login_limits(bucket,window_start,attempts)VALUES($1,clock_timestamp(),1)
          ON CONFLICT(bucket) DO UPDATE SET attempts=CASE WHEN admin_login_limits.window_start<=clock_timestamp()-$2*interval '1 second' THEN 1 ELSE admin_login_limits.attempts+1 END,
          window_start=CASE WHEN admin_login_limits.window_start<=clock_timestamp()-$2*interval '1 second' THEN clock_timestamp() ELSE admin_login_limits.window_start END RETURNING attempts`,
          [bucket, seconds])).rows[0];
        if (attempt.attempts > limit) return null;
      }
      const admin = (await db.query('SELECT * FROM platform_admins WHERE username=$1 FOR SHARE', [normalized])).rows[0];
      // An unknown username still pays for a KDF, so response time never reveals which names exist.
      const derived = await passwordKey(password, admin?.password_salt ?? '0'.repeat(32));
      const matches = timingSafeEqual(derived, Buffer.from(admin?.password_key ?? '0'.repeat(64), 'hex'));
      if (!admin?.active || !matches) return null;
      if (previous && /^[a-f0-9]{64}$/.test(previous))
        await db.query('UPDATE admin_auth_sessions SET revoked_at=clock_timestamp() WHERE token_hash=$1', [adminSessionHash(previous)]);
      const token = randomBytes(32).toString('hex');
      const row = (await db.query(`INSERT INTO admin_auth_sessions(token_hash,admin_id,expires_at)
        VALUES($1,$2,clock_timestamp()+interval '4 hours')RETURNING expires_at`, [adminSessionHash(token), admin.id])).rows[0];
      return { token, expiresAt: row.expires_at as Date };
    });
    if (!result) throw new AdminError(401, 'ADMIN_LOGIN_FAILED');
    return result;
  }

  async logout(token?: string) {
    if (token && /^[a-f0-9]{64}$/.test(token))
      await this.pool.query('UPDATE admin_auth_sessions SET revoked_at=clock_timestamp() WHERE token_hash=$1 AND revoked_at IS NULL', [adminSessionHash(token)]);
  }

  async access(token: string | undefined): Promise<AdminPrincipal> {
    const principal = await transaction(this.pool, db => authorizeAdmin(db, token));
    // Approximate use timestamp, no sliding expiry and no per-request write.
    await this.pool.query("UPDATE admin_auth_sessions SET last_used_at=clock_timestamp() WHERE token_hash=$1 AND last_used_at<clock_timestamp()-interval '5 minutes'",
      [adminSessionHash(token!)]);
    return principal;
  }
}
