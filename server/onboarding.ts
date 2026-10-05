import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { homeShop, sessionAccount } from '@/lib/account/workspace';
import { THEME_COOKIE } from '@/components/platform/theme-cookie';
import { database } from './db';
import { ownerToken } from './owner-v2';

/** Who is onboarding, and their shop. No session: back to step 1. Finished already: to the giao diện chính. */
export async function onboardingShop() {
  const pool = database(), account = await sessionAccount(pool, await ownerToken());
  if (!account) redirect('/bat-dau');
  const shop = await homeShop(pool, account.id);
  if (!shop) redirect('/bat-dau');
  if (!shop.self_signup || shop.onboarded_at) redirect(`/app/${shop.slug}`);
  const row = (await pool.query('SELECT onboarding_template,onboarding_dashboard_at FROM shops WHERE slug=$1', [shop.slug])).rows[0];
  return { slug: shop.slug, template: row.onboarding_template as 'done' | 'skipped' | null, dashboard: !!row.onboarding_dashboard_at };
}
/** White by default, like the giao diện chính; dark only when chosen. */
export async function qsTheme() {
  const chosen = (await cookies()).get(THEME_COOKIE)?.value;
  return chosen === 'dark' || chosen === 'system' ? chosen : 'light';
}
