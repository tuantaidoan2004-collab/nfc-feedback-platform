import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
// Only the KDF parameters and the transaction helper are shared with owner auth, so both roles keep identical
// password cost. Everything that decides access — tables, hash domains, throttle buckets, advisory lock — is
// separate on purpose: a shop owner has no identity in this space and cannot become an administrator.
import { passwordKey, transaction } from '../owner/auth';
import { AdminError } from './error';
import { shortCode } from '../short-code';
import { base32, enrolmentUri, newSecret, open, seal, stepOf } from './totp';

export { AdminError } from './error';

export const adminSessionHash = (token: string) => createHash('sha256').update(`nfc-admin-session-v1\0${token}`).digest('hex');
export const backupCodeHash = (code: string) => createHash('sha256').update(`nfc-admin-backup-v1\0${code}`).digest('hex');
const bucketHash = (name: string) => createHash('sha256').update(`nfc-admin-login-v1\0${name}`).digest('hex');
export const adminUsername = (value: unknown) =>
  typeof value === 'string' && /^[a-z0-9][a-z0-9_.-]{2,63}$/.test(value.trim().toLowerCase()) ? value.trim().toLowerCase() : null;
// Longer than the owner minimum: one administrative credential reaches every shop on the platform.
export const validAdminPassword = (value: unknown): value is string =>
  typeof value === 'string' && value.length >= 16 && Buffer.byteLength(value) <= 256;

export type AdminPrincipal = { adminId: string; username: string; twoFactor: boolean };

/**
 * Each caller supplies a transaction. A share lock linearizes revoke and deactivation against the work.
 *
 * An administrator without the second factor is refused **here**, not in a page: the screen that asks for enrolment
 * would otherwise be a suggestion, and calling the API directly would walk around it. `enrolling` is the one
 * exception, for the handful of calls whose whole job is to turn it on (lát A2).
 */
export async function authorizeAdmin(db: PoolClient, token: string | undefined, enrolling = false): Promise<AdminPrincipal> {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) throw new AdminError(401, 'ADMIN_LOGIN_REQUIRED');
  const row = (await db.query(`SELECT s.admin_id,s.expires_at,a.username,a.totp_enrolled_at FROM admin_auth_sessions s JOIN platform_admins a ON a.id=s.admin_id
    WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp() AND a.active FOR SHARE OF s,a`, [adminSessionHash(token)])).rows[0];
  if (!row) throw new AdminError(401, 'ADMIN_LOGIN_REQUIRED');
  if ((await db.query('SELECT clock_timestamp() now')).rows[0].now >= row.expires_at) throw new AdminError(401, 'ADMIN_LOGIN_REQUIRED');
  const principal = { adminId: row.admin_id as string, username: row.username as string, twoFactor: row.totp_enrolled_at !== null };
  if (!principal.twoFactor && !enrolling) throw new AdminError(403, 'TWO_FACTOR_REQUIRED');
  return principal;
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

  /**
   * One step, not two. A "password accepted, code pending" state would be a half-authenticated session, and those
   * are where second-factor bugs live; here the two are checked in one transaction and nothing exists until both
   * pass. Every failure answers the same `ADMIN_LOGIN_FAILED`, so the reply never says which half was wrong --
   * including whether this account has a second factor at all (lát A2).
   */
  async login(name: unknown, password: unknown, previous?: string, second?: unknown) {
    const normalized = adminUsername(name);
    if (!normalized || typeof password !== 'string' || Buffer.byteLength(password) > 256) throw new AdminError(401, 'ADMIN_LOGIN_FAILED');
    if (second !== undefined && (typeof second !== 'string' || second.length > 64)) throw new AdminError(401, 'ADMIN_LOGIN_FAILED');
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
      // The second factor is checked after the password on purpose: an unknown name has already paid for a KDF, so
      // reaching here says nothing that timing did not already hide.
      if (admin.totp_enrolled_at !== null && !(await this.secondFactor(db, admin, second))) return null;
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

  /**
   * A code from the app, or one of the printed backup codes. Both are spent by being used: the app's code has its
   * thirty-second step recorded, so reading it over a shoulder buys nothing, and a backup code is marked used.
   * Both are claimed with a write that the database refuses to do twice, not with a read-then-write.
   */
  private async secondFactor(db: PoolClient, admin: { id: string; totp_secret: string }, given: unknown) {
    if (typeof given !== 'string' || !given.trim()) return false;
    const offered = given.trim();
    const digits = offered.replace(/\s/g, '');
    if (/^[0-9]{6}$/.test(digits)) {
      const step = stepOf(open(admin.totp_secret), digits, (await db.query('SELECT clock_timestamp() now')).rows[0].now as Date);
      if (step === null) return false;
      // ON CONFLICT DO NOTHING: the row is the claim, so a replay inside the same window finds it already taken.
      return (await db.query('INSERT INTO admin_totp_steps(admin_id,step)VALUES($1,$2)ON CONFLICT DO NOTHING', [admin.id, step])).rowCount === 1;
    }
    const hash = backupCodeHash(offered.toLowerCase().replace(/[^a-z0-9]/g, ''));
    return (await db.query(`UPDATE admin_backup_codes SET used_at=clock_timestamp()
      WHERE code_hash=$1 AND admin_id=$2 AND used_at IS NULL`, [hash, admin.id])).rowCount === 1;
  }

  /**
   * Hands back a secret and the link an authenticator app accepts. Nothing is switched on here: the secret is
   * stored while `totp_enrolled_at` stays null, which is an enrolment in progress and does not yet demand a code
   * at login. Starting this and walking away must never be able to lock the only administrator out.
   *
   * Starting again replaces the pending secret, so a half-finished attempt on a lost phone cannot be completed.
   */
  async beginEnrolment(token: string | undefined) {
    return transaction(this.pool, async db => {
      const principal = await authorizeAdmin(db, token, true);
      if (principal.twoFactor) throw new AdminError(409, 'TWO_FACTOR_ALREADY_ON');
      const secret = newSecret();
      await db.query('UPDATE platform_admins SET totp_secret=$2 WHERE id=$1 AND totp_enrolled_at IS NULL', [principal.adminId, seal(secret)]);
      return { secret: base32(secret), uri: enrolmentUri(principal.username, secret) };
    });
  }

  /**
   * Switches it on, and only against a code the app actually produced. The backup codes are shown here once and
   * never again: they are stored as hashes, so nothing can print them a second time -- which is the point.
   */
  async confirmEnrolment(token: string | undefined, digits: unknown) {
    return transaction(this.pool, async db => {
      const principal = await authorizeAdmin(db, token, true);
      if (principal.twoFactor) throw new AdminError(409, 'TWO_FACTOR_ALREADY_ON');
      const row = (await db.query('SELECT totp_secret FROM platform_admins WHERE id=$1 FOR UPDATE', [principal.adminId])).rows[0];
      if (!row?.totp_secret) throw new AdminError(409, 'TWO_FACTOR_NOT_STARTED');
      if (typeof digits !== 'string' || stepOf(open(row.totp_secret), digits.replace(/\s/g, ''), (await db.query('SELECT clock_timestamp() now')).rows[0].now as Date) === null)
        throw new AdminError(400, 'TWO_FACTOR_CODE_WRONG');
      // Ten codes, from the alphabet that has no 0/o or 1/l/i, because these get written on paper and read back.
      const codes = Array.from({ length: 10 }, () => `${shortCode(5)}-${shortCode(5)}`);
      for (const code of codes)
        await db.query('INSERT INTO admin_backup_codes(code_hash,admin_id)VALUES($1,$2)', [backupCodeHash(code.replace('-', '')), principal.adminId]);
      await db.query('UPDATE platform_admins SET totp_enrolled_at=clock_timestamp() WHERE id=$1', [principal.adminId]);
      await db.query(`INSERT INTO admin_audit(actor_id,action,detail)VALUES($1,'admin.two_factor.on',$2)`,
        [principal.adminId, JSON.stringify({ codes: codes.length })]);
      return { codes };
    });
  }

  /** How many printed codes are still unspent, so `/gov` can say when it is time to make new ones. */
  async backupCodesLeft(token: string | undefined) {
    return transaction(this.pool, async db => {
      const principal = await authorizeAdmin(db, token, true);
      return (await db.query('SELECT count(*)::int n FROM admin_backup_codes WHERE admin_id=$1 AND used_at IS NULL', [principal.adminId])).rows[0].n as number;
    });
  }

  async logout(token?: string) {
    if (token && /^[a-f0-9]{64}$/.test(token))
      await this.pool.query('UPDATE admin_auth_sessions SET revoked_at=clock_timestamp() WHERE token_hash=$1 AND revoked_at IS NULL', [adminSessionHash(token)]);
  }

  async access(token: string | undefined, enrolling = false): Promise<AdminPrincipal> {
    const principal = await transaction(this.pool, db => authorizeAdmin(db, token, enrolling));
    // Approximate use timestamp, no sliding expiry and no per-request write.
    await this.pool.query("UPDATE admin_auth_sessions SET last_used_at=clock_timestamp() WHERE token_hash=$1 AND last_used_at<clock_timestamp()-interval '5 minutes'",
      [adminSessionHash(token!)]);
    return principal;
  }
}
