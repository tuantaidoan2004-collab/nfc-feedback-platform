import { createHash, randomBytes } from 'node:crypto';
import type { Pool } from 'pg';
import { OwnerError, openSession, passwordKey, transaction, username, validPassword } from '../owner/auth';
import { ownerEmail } from '../owner/setup-link';
import { shortCode } from '../short-code';

/**
 * Đăng ký USER — bước 1 của onboarding (kịch bản mục 4, Tài 05/10: "đăng ký xong dùng được ngay"). The account, its shop
 * and the owner's membership are made at once, and a session opens. What still waits for Tài is a self-signed-up shop's
 * first publish (shops.publish_approved_at), not the account: a stranger can build at once, but cannot put a page on the
 * platform's domain unseen.
 *
 * A public form that runs scrypt and writes rows, so three brakes, all in the database: the one KDF slot owner sign-in
 * shares (never two 128 MB hashes at once), a per-hour limit for the platform and one per address, kept in the sign-in
 * limiter's table. Either a password the owner chose, or their Google account (no password stored then).
 */
export const SIGNUP_LIMITS = { perHour: 60, perAddressPerHour: 5 } as const;
const addressBucket = (address: string) => `signup-address:${createHash('sha256').update(`nfc-signup-address-v1\0${address}`).digest('hex')}`;
const duplicate = (error: unknown) => typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === '23505';

export const BUSINESS_KINDS = ['cafe', 'restaurant', 'tea', 'beauty', 'retail', 'other'] as const;
export type BusinessKind = typeof BUSINESS_KINDS[number];
/** The owner's own name (1–60 characters, no markup) and what the shop is; both optional, both asked on the sky screens. */
export const displayName = (value: unknown) => typeof value === 'string' && value.trim() && value.trim().length <= 60 && !/[\u0000-\u001f<>]/.test(value) ? value.trim() : null;
export const businessKind = (value: unknown): BusinessKind | null => BUSINESS_KINDS.includes(value as BusinessKind) ? value as BusinessKind : null;
export type SignupInput = { username: unknown; displayName?: unknown; kind?: unknown } & ({ email: unknown; password: unknown } | { google: { sub: string; email: string } });

export class AccountSignup {
  constructor(private pool: Pool) {}

  async create(input: SignupInput, address: string | null, previous?: string) {
    const name = username(typeof input.username === 'string' ? input.username.replace(/^@/, '') : input.username);
    const google = 'google' in input ? input.google : null;
    const email = ownerEmail(google ? google.email : 'email' in input ? input.email : null);
    if (!name) throw new OwnerError(400, 'INVALID_USERNAME');
    if (!email) throw new OwnerError(400, 'INVALID_EMAIL');
    const password = 'password' in input ? input.password : null;
    if (!google && !validPassword(password)) throw new OwnerError(400, 'WEAK_PASSWORD');
    const result = await transaction(this.pool, async db => {
      if (!google && !(await db.query("SELECT pg_try_advisory_xact_lock(hashtextextended('nfc-owner-login-v2',0)) locked")).rows[0].locked)
        return { error: 'TOO_MANY_ATTEMPTS' } as const;
      await db.query("DELETE FROM owner_login_limits WHERE window_start<clock_timestamp()-interval '1 hour'");
      const buckets: [string, number][] = [['signup-global', SIGNUP_LIMITS.perHour], ...(address ? [[addressBucket(address), SIGNUP_LIMITS.perAddressPerHour] as [string, number]] : [])];
      for (const [bucket, limit] of buckets) {
        const attempts = (await db.query(`INSERT INTO owner_login_limits(bucket,window_start,attempts)VALUES($1,clock_timestamp(),1)
          ON CONFLICT(bucket) DO UPDATE SET attempts=CASE WHEN owner_login_limits.window_start<=clock_timestamp()-interval '1 hour' THEN 1
          ELSE LEAST(owner_login_limits.attempts,1000)+1 END,
          window_start=CASE WHEN owner_login_limits.window_start<=clock_timestamp()-interval '1 hour' THEN clock_timestamp()
          ELSE owner_login_limits.window_start END RETURNING attempts`, [bucket])).rows[0].attempts as number;
        if (attempts > limit) return { error: 'TOO_MANY_ATTEMPTS' } as const;
      }
      if ((await db.query('SELECT 1 FROM owner_identities_v2 WHERE username=$1 OR email=$2', [name, email])).rowCount) return { error: 'OWNER_ALREADY_EXISTS' } as const;
      if (google && (await db.query('SELECT 1 FROM owner_identities_v2 WHERE google_sub=$1', [google.sub])).rowCount) return { error: 'GOOGLE_ALREADY_LINKED' } as const;
      const salt = randomBytes(16).toString('hex');
      const key = google ? randomBytes(32).toString('hex') : (await passwordKey(password as string, salt)).toString('hex');
      // A savepoint, so a name taken by a racing twin comes back as an answer and the limiter rows above still commit.
      await db.query('SAVEPOINT signup');
      try {
        const userId = (await db.query('INSERT INTO owner_identities_v2(username,password_salt,password_key,email,google_sub,display_name)VALUES($1,$2,$3,$4,$5,$6)RETURNING id',
          [name, salt, key, email, google?.sub ?? null, displayName(input.displayName)])).rows[0].id as string;
        let shop: { id: string; slug: string } | undefined;
        for (let attempt = 0; attempt < 5 && !shop; attempt++) {
          await db.query('SAVEPOINT shop');
          try {
            // Active at once: the owner works in it straight away. Its first publish is what waits for Tài.
            shop = (await db.query(`INSERT INTO shops(slug,name,self_signup,publishing_state,business_kind)VALUES($1,$2,true,'active',$3)RETURNING id,slug`,
              [shortCode(6), `Quán của @${name}`, businessKind(input.kind)])).rows[0];
            await db.query('RELEASE SAVEPOINT shop');
          } catch (error) { if (!duplicate(error)) throw error; await db.query('ROLLBACK TO SAVEPOINT shop'); }
        }
        if (!shop) throw new OwnerError(503, 'SERVICE_UNAVAILABLE');
        await db.query("INSERT INTO owner_memberships_v2(user_id,shop_id,role)VALUES($1,$2,'owner')", [userId, shop.id]);
        const session = await openSession(db, userId, previous);
        return { userId, username: name, slug: shop.slug, session };
      } catch (error) {
        if (!duplicate(error)) throw error;
        await db.query('ROLLBACK TO SAVEPOINT signup');
        return { error: 'OWNER_ALREADY_EXISTS' } as const;
      }
    });
    if ('error' in result) throw new OwnerError(result.error === 'OWNER_ALREADY_EXISTS' || result.error === 'GOOGLE_ALREADY_LINKED' ? 409 : 429, result.error!);
    return result;
  }
}
