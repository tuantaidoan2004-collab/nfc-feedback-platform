import { createHash, randomBytes } from 'node:crypto';
import type { Pool } from 'pg';
import { OwnerError, passwordKey, transaction, username, validPassword } from '../owner/auth';
import { ownerEmail } from '../owner/setup-link';
import type { Draft } from './draft';

/**
 * "Lưu trang của tôi" (lát D4b): the owner's account is made at once, with the password they choose; the page they
 * built waits in `shop_signups` until an administrator approves it (Tài 27/09: "chờ duyệt"). No shop, page or card
 * exists before that, so a stranger cannot put a name on the platform's domain unseen. Approval and refusal are in
 * lib/admin/provisioning.ts, next to "Tạo shop mới".
 *
 * A public form that runs scrypt and writes rows, so three brakes, all in the database: the one KDF slot owner sign-in
 * and set-password share (F-002: never two 128 MB hashes at once), a per-hour limit for the platform and for the address,
 * and a ceiling on how many requests may wait. None holds a lock across pooled work.
 */
export const SIGNUP_LIMITS = { perHour: 20, perAddressPerHour: 3, waiting: 50 } as const;
const addressBucket = (address: string) => `signup-address:${createHash('sha256').update(`nfc-signup-address-v1\0${address}`).digest('hex')}`;
const duplicate = (error: unknown) => typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';

/** A Zalo number as people write it: spaces, dots and a +84 allowed; kept as the digits a Vietnamese number is dialled with. */
export function zaloNumber(value: unknown): string | null | undefined {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') return undefined;
  const digits = value.replace(/[\s.()-]/g, '').replace(/^\+84/, '0');
  return /^[0-9]{8,15}$/.test(digits) ? digits : undefined;
}

export type SignupInput = { draft: Draft; username: unknown; email: unknown; password: unknown; zalo: unknown };
export type WaitingSignup = {
  id: string; shop_name: string; template_key: string; kind: string | null; hours: string[]; goals: string[]; zalo: string | null;
  created_at: string; username: string; email: string; decision: 'approved' | null;
};

export class ShopSignups {
  constructor(private pool: Pool) {}

  async create(input: SignupInput, address: string | null) {
    const name = username(typeof input.username === 'string' ? input.username.replace(/^@/, '') : input.username);
    const email = ownerEmail(input.email), zalo = zaloNumber(input.zalo);
    if (!name) throw new OwnerError(400, 'INVALID_USERNAME');
    if (!email) throw new OwnerError(400, 'INVALID_EMAIL');
    if (!validPassword(input.password)) throw new OwnerError(400, 'WEAK_PASSWORD');
    if (zalo === undefined) throw new OwnerError(400, 'INVALID_ZALO');
    const { draft } = input, password = input.password, contact: string | null = zalo;
    const result = await transaction(this.pool, async db => {
      if (!(await db.query("SELECT pg_try_advisory_xact_lock(hashtextextended('nfc-owner-login-v2',0)) locked")).rows[0].locked)
        return { error: 'TOO_MANY_ATTEMPTS' } as const;
      // The address is kept as a hash for its hour and no longer: swept here as sign-in sweeps its own rows.
      await db.query("DELETE FROM owner_login_limits WHERE window_start<clock_timestamp()-interval '1 hour'");
      // Counted before anything else and committed even when refused (an error object, not a throw), like set-password.
      const buckets: [string, number][] = [['signup-global', SIGNUP_LIMITS.perHour], ...(address ? [[addressBucket(address), SIGNUP_LIMITS.perAddressPerHour] as [string, number]] : [])];
      for (const [bucket, limit] of buckets) {
        const attempts = (await db.query(`INSERT INTO owner_login_limits(bucket,window_start,attempts)VALUES($1,clock_timestamp(),1)
          ON CONFLICT(bucket) DO UPDATE SET attempts=CASE WHEN owner_login_limits.window_start<=clock_timestamp()-interval '1 hour' THEN 1
          ELSE LEAST(owner_login_limits.attempts,1000)+1 END,
          window_start=CASE WHEN owner_login_limits.window_start<=clock_timestamp()-interval '1 hour' THEN clock_timestamp()
          ELSE owner_login_limits.window_start END RETURNING attempts`, [bucket])).rows[0].attempts as number;
        if (attempts > limit) return { error: 'TOO_MANY_ATTEMPTS' } as const;
      }
      const waiting = (await db.query("SELECT count(*)::int n FROM shop_signups WHERE decision IS NULL")).rows[0].n as number;
      if (waiting >= SIGNUP_LIMITS.waiting) return { error: 'SIGNUPS_FULL' } as const;
      if ((await db.query('SELECT 1 FROM owner_identities_v2 WHERE username=$1 OR email=$2', [name, email])).rowCount) return { error: 'OWNER_ALREADY_EXISTS' } as const;
      const salt = randomBytes(16).toString('hex'), key = (await passwordKey(password as string, salt)).toString('hex');
      // A savepoint, so a name taken by a racing twin comes back as an answer and the limiter rows above still commit.
      await db.query('SAVEPOINT signup');
      try {
        const userId = (await db.query('INSERT INTO owner_identities_v2(username,password_salt,password_key,email)VALUES($1,$2,$3,$4)RETURNING id',
          [name, salt, key, email])).rows[0].id as string;
        const id = (await db.query(`INSERT INTO shop_signups(owner_user_id,shop_name,template_key,kind,hours,goals,zalo)VALUES($1,$2,$3,$4,$5,$6,$7)RETURNING id`,
          [userId, draft.name, draft.template, draft.kind, draft.hours, draft.goals, contact])).rows[0].id as string;
        return { id, username: name };
      } catch (error) {
        if (!duplicate(error)) throw error;
        await db.query('ROLLBACK TO SAVEPOINT signup');
        return { error: 'OWNER_ALREADY_EXISTS' } as const;
      }
    });
    if ('error' in result) throw new OwnerError(result.error === 'OWNER_ALREADY_EXISTS' ? 409 : result.error === 'SIGNUPS_FULL' ? 503 : 429, result.error!);
    return result;
  }

  /** What waits for /gov: requests not decided yet, and approvals whose shop was not finished. Oldest first. */
  async waiting(): Promise<WaitingSignup[]> {
    return (await this.pool.query(`SELECT s.id,s.shop_name,s.template_key,s.kind,s.hours,s.goals,s.zalo,s.created_at,s.decision,i.username,i.email
      FROM shop_signups s JOIN owner_identities_v2 i ON i.id=s.owner_user_id
      WHERE s.decision IS NULL OR (s.decision='approved' AND s.shop_id IS NULL) ORDER BY s.created_at`)).rows;
  }

  /** The request of a signed-in account that has no shop yet: what /owner/cho-duyet tells them. */
  async ofUser(userId: string) {
    return (await this.pool.query('SELECT shop_name,decision,created_at FROM shop_signups WHERE owner_user_id=$1', [userId])).rows[0] as
      { shop_name: string; decision: 'approved' | 'rejected' | null; created_at: Date } | undefined;
  }
}
