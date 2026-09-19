import { randomBytes, createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { OwnerError, passwordKey, transaction, username, validPassword } from './auth';

/** Its own hash domain, so a setup token can never be replayed as a session token or the other way round. */
export const setupTokenHash = (token: string) => createHash('sha256').update(`nfc-owner-setup-v1\0${token}`).digest('hex');

// Deliberately permissive: an address either routes or it does not, and a stricter pattern rejects valid ones.
// Stored lowercase so the unique index treats two spellings of one address as the same account.
export const ownerEmail = (value: unknown) => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) && Buffer.byteLength(normalized) <= 254 ? normalized : null;
};

const HOURS = 48;
export type SetupPurpose = 'setup' | 'reset';
export type SetupLink = { token: string; expiresAt: Date };

const duplicate = (error: unknown) => typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';

export class OwnerSetupLinks {
  constructor(private pool: Pool) {}

  /**
   * Creates an identity that cannot be signed into yet. The stored key is random rather than derived from any
   * password, so no input matches it and the account stays closed until the shop chooses its own. The operator
   * therefore never holds a shop's password and cannot be accused later of having used it.
   */
  async provision(name: unknown, email: unknown, permit: () => Promise<void>) {
    await permit();
    const normalized = username(name), address = ownerEmail(email);
    if (!normalized || !address) throw new OwnerError(400, 'INVALID_CREDENTIAL');
    return transaction(this.pool, async db => {
      let userId: string;
      try {
        userId = (await db.query(
          'INSERT INTO owner_identities_v2(username,password_salt,password_key,email)VALUES($1,$2,$3,$4)RETURNING id',
          [normalized, randomBytes(16).toString('hex'), randomBytes(32).toString('hex'), address])).rows[0].id;
      } catch (error) { throw duplicate(error) ? new OwnerError(409, 'OWNER_ALREADY_EXISTS') : error; }
      return { userId, email: address, link: await this.write(db, userId, 'setup') };
    });
  }

  /**
   * Reissues a link for one shop's owner. The shop is checked against a live membership, because the caller names it
   * only to attribute the work; `record` writes that attribution in the same transaction, so a link never exists
   * without its trace. Only the membership counts, not the shop's publishing state: a shop that is not live yet
   * still needs a way in.
   */
  async reissue(userId: string, shopId: string, record: (db: PoolClient) => Promise<void>) {
    return transaction(this.pool, async db => {
      if (!(await db.query(`SELECT 1 FROM owner_memberships_v2 m JOIN owner_identities_v2 u ON u.id=m.user_id
        WHERE m.user_id=$1 AND m.shop_id=$2 AND m.active AND u.active FOR SHARE OF m,u`, [userId, shopId])).rowCount)
        throw new OwnerError(404, 'OWNER_NOT_FOUND');
      const link = await this.write(db, userId, 'reset');
      await record(db);
      return link;
    });
  }

  /**
   * Issuing a link retires every other open link of the account, whatever its purpose: only the newest can ever be
   * used. Until lát F6 only links of the same purpose were retired, so the first setup link stayed usable for its 48
   * hours after a reset link replaced it (found by the template account test, 2026-09-19).
   */
  async write(db: PoolClient, userId: string, purpose: SetupPurpose): Promise<SetupLink> {
    // Serialize before UPDATE takes its READ COMMITTED snapshot; a concurrent INSERT
    // must be committed and visible before we retire the previous account links.
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended('nfc-owner-setup:'||$1,0))", [userId]);
    await db.query('UPDATE owner_setup_tokens SET superseded_at=clock_timestamp() WHERE user_id=$1 AND used_at IS NULL AND superseded_at IS NULL',
      [userId]);
    const token = randomBytes(32).toString('hex');
    const row = (await db.query(
      `INSERT INTO owner_setup_tokens(token_hash,user_id,purpose,expires_at)VALUES($1,$2,$3,clock_timestamp()+$4*interval '1 hour')RETURNING expires_at`,
      [setupTokenHash(token), userId, purpose, HOURS])).rows[0];
    return { token, expiresAt: row.expires_at as Date };
  }

  /**
   * Where a new password should lead: the dashboard of a shop this account runs. Owner memberships come first;
   * a chain owner with several shops lands on one of them and switches from there.
   */
  async dashboardSlug(userId: string) {
    return ((await this.pool.query(`SELECT s.slug FROM owner_memberships_v2 m JOIN shops s ON s.id=m.shop_id
      WHERE m.user_id=$1 AND m.active ORDER BY m.role<>'owner',s.slug LIMIT 1`, [userId])).rows[0]?.slug as string | undefined) ?? null;
  }

  /** Reads a link without spending it, so the form can be shown before a password is typed. */
  async inspect(token: unknown) {
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return null;
    return (await this.pool.query(`SELECT t.user_id,t.purpose,i.username,i.email FROM owner_setup_tokens t JOIN owner_identities_v2 i ON i.id=t.user_id
      WHERE t.token_hash=$1 AND t.used_at IS NULL AND t.superseded_at IS NULL AND t.expires_at>clock_timestamp() AND i.active`,
      [setupTokenHash(token)])).rows[0] ?? null;
  }

  /**
   * Spends the link and sets the password. The claim is a conditional UPDATE, so two requests racing on the
   * same link leave exactly one winner; a rejected password is checked first and costs nothing.
   */
  async consume(token: unknown, password: unknown) {
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw new OwnerError(400, 'SETUP_LINK_INVALID');
    if (!validPassword(password)) throw new OwnerError(400, 'INVALID_CREDENTIAL');
    const result = await transaction(this.pool, async db => {
      // Same database-wide KDF slot as owner login/password change. No hash queue,
      // and no separate connection held while asking the pool for more work.
      if (!(await db.query("SELECT pg_try_advisory_xact_lock(hashtextextended('nfc-owner-login-v2',0)) locked")).rows[0].locked)
        return { error: 'TOO_MANY_ATTEMPTS' } as const;
      // Invalid tokens are cheap but still bounded. Commit rejected attempts; throwing
      // inside this transaction would roll the limiter back. No raw token/IP is stored.
      const attempt = (await db.query(`INSERT INTO owner_login_limits(bucket,window_start,attempts)VALUES('setup-global',clock_timestamp(),1)
        ON CONFLICT(bucket) DO UPDATE SET attempts=CASE WHEN owner_login_limits.window_start<=clock_timestamp()-interval '1 minute' THEN 1
        ELSE LEAST(owner_login_limits.attempts,60)+1 END,
        window_start=CASE WHEN owner_login_limits.window_start<=clock_timestamp()-interval '1 minute' THEN clock_timestamp()
        ELSE owner_login_limits.window_start END RETURNING attempts`)).rows[0].attempts;
      if (attempt > 60) return { error: 'TOO_MANY_ATTEMPTS' } as const;
      const hash = setupTokenHash(token);
      const candidate = (await db.query(`SELECT user_id FROM owner_setup_tokens WHERE token_hash=$1
        AND used_at IS NULL AND superseded_at IS NULL AND expires_at>clock_timestamp()`, [hash])).rows[0];
      if (!candidate) return { error: 'SETUP_LINK_INVALID' } as const;
      // Identity before account lock/token row: reissue checks the identity first too.
      // This prevents resetting against an old key while login/password change is in flight.
      if (!(await db.query('SELECT 1 FROM owner_identities_v2 WHERE id=$1 AND active FOR UPDATE', [candidate.user_id])).rowCount)
        return { error: 'SETUP_LINK_INVALID' } as const;
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended('nfc-owner-setup:'||$1,0))", [candidate.user_id]);
      if (!(await db.query(`SELECT 1 FROM owner_setup_tokens WHERE token_hash=$1 AND used_at IS NULL
        AND superseded_at IS NULL AND expires_at>clock_timestamp() FOR UPDATE`, [hash])).rowCount)
        return { error: 'SETUP_LINK_INVALID' } as const;
      const salt = randomBytes(16).toString('hex'), key = await passwordKey(password, salt);
      // Recheck expiration after hashing. A failed final claim rolls back every write.
      const claimed = (await db.query(`UPDATE owner_setup_tokens SET used_at=clock_timestamp()
        WHERE token_hash=$1 AND used_at IS NULL AND superseded_at IS NULL AND expires_at>clock_timestamp() RETURNING user_id`,
        [hash])).rows[0];
      if (!claimed) throw new OwnerError(400, 'SETUP_LINK_INVALID');
      await db.query('UPDATE owner_identities_v2 SET password_salt=$2,password_key=$3 WHERE id=$1',
        [claimed.user_id, salt, key.toString('hex')]);
      await db.query('UPDATE owner_auth_sessions_v2 SET revoked_at=clock_timestamp() WHERE user_id=$1 AND revoked_at IS NULL', [claimed.user_id]);
      return { userId: claimed.user_id as string };
    });
    if ('error' in result) throw new OwnerError(result.error === 'TOO_MANY_ATTEMPTS' ? 429 : 400, result.error!);
    return result.userId;
  }
}
