import type { Pool } from 'pg';
import { sessionHash } from '../owner/auth';

/**
 * Who is signed in, and which shop their giao diện chính opens on (kịch bản mục 1). Read-only helpers for pages; every
 * API still goes through `authorize`, which checks the session and the shop together.
 */
export async function sessionAccount(pool: Pool, token: string | undefined) {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  return ((await pool.query(`SELECT u.id,u.username FROM owner_auth_sessions_v2 a JOIN owner_identities_v2 u ON u.id=a.user_id
    WHERE a.token_hash=$1 AND a.revoked_at IS NULL AND a.expires_at>clock_timestamp() AND u.active`, [sessionHash(token)])).rows[0] as
    { id: string; username: string } | undefined) ?? null;
}

/** The shop the account opens on: the one it owns first, else any it belongs to. */
export async function homeShop(pool: Pool, userId: string) {
  return ((await pool.query(`SELECT s.slug,s.self_signup,s.onboarded_at FROM owner_memberships_v2 m JOIN shops s ON s.id=m.shop_id
    WHERE m.user_id=$1 AND m.active ORDER BY m.role<>'owner',s.created_at,s.slug LIMIT 1`, [userId])).rows[0] as
    { slug: string; self_signup: boolean; onboarded_at: Date | null } | undefined) ?? null;
}

export type Onboarding = { selfSignup: boolean; template: 'done' | 'skipped' | null; dashboard: boolean; done: boolean;
  placeId: string | null; name: string; slug: string };
export async function onboardingOf(pool: Pool, shopId: string): Promise<Onboarding> {
  const row = (await pool.query('SELECT slug,name,self_signup,onboarding_template,onboarding_dashboard_at,onboarded_at,place_id FROM shops WHERE id=$1', [shopId])).rows[0];
  return { selfSignup: row.self_signup, template: row.onboarding_template, dashboard: !!row.onboarding_dashboard_at, done: !!row.onboarded_at || !row.self_signup,
    placeId: row.place_id, name: row.name, slug: row.slug };
}
