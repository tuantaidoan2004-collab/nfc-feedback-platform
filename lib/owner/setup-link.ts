import { randomBytes, createHash } from 'node:crypto';
import type { Pool } from 'pg';
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

  /** Issuing a link retires any other open one for the same purpose: only the newest can ever be used. */
  async issue(userId: string, purpose: SetupPurpose = 'reset') {
    return transaction(this.pool, async db => {
      if (!(await db.query('SELECT 1 FROM owner_identities_v2 WHERE id=$1 AND active FOR SHARE', [userId])).rowCount)
        throw new OwnerError(404, 'OWNER_NOT_FOUND');
      return this.write(db, userId, purpose);
    });
  }

  private async write(db: Pool | Parameters<Parameters<typeof transaction>[1]>[0], userId: string, purpose: SetupPurpose): Promise<SetupLink> {
    await db.query('UPDATE owner_setup_tokens SET superseded_at=clock_timestamp() WHERE user_id=$1 AND purpose=$2 AND used_at IS NULL AND superseded_at IS NULL',
      [userId, purpose]);
    const token = randomBytes(32).toString('hex');
    const row = (await db.query(
      `INSERT INTO owner_setup_tokens(token_hash,user_id,purpose,expires_at)VALUES($1,$2,$3,clock_timestamp()+$4*interval '1 hour')RETURNING expires_at`,
      [setupTokenHash(token), userId, purpose, HOURS])).rows[0];
    return { token, expiresAt: row.expires_at as Date };
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
    const salt = randomBytes(16).toString('hex'), key = await passwordKey(password, salt);
    return transaction(this.pool, async db => {
      const claimed = (await db.query(`UPDATE owner_setup_tokens SET used_at=clock_timestamp()
        WHERE token_hash=$1 AND used_at IS NULL AND superseded_at IS NULL AND expires_at>clock_timestamp() RETURNING user_id`,
        [setupTokenHash(token)])).rows[0];
      if (!claimed) throw new OwnerError(400, 'SETUP_LINK_INVALID');
      if (!(await db.query('UPDATE owner_identities_v2 SET password_salt=$2,password_key=$3 WHERE id=$1 AND active',
        [claimed.user_id, salt, key.toString('hex')])).rowCount) throw new OwnerError(404, 'OWNER_NOT_FOUND');
      // Anything signed in with the previous password loses access at the moment the new one takes effect.
      await db.query('UPDATE owner_auth_sessions_v2 SET revoked_at=clock_timestamp() WHERE user_id=$1 AND revoked_at IS NULL', [claimed.user_id]);
      return claimed.user_id as string;
    });
  }
}
