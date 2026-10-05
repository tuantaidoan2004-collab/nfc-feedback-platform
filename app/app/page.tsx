import { notFound, redirect } from 'next/navigation';
import { homeShop, sessionAccount } from '@/lib/account/workspace';
import { database } from '@/server/db';
import { ownerEnabled, ownerToken } from '@/server/owner-v2';

export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false, follow: false } };

/** `/app`: the giao diện chính of whoever is signed in; onboarding first if their shop has not finished it. */
export default async function Page() {
  if (!ownerEnabled()) notFound();
  const pool = database(), account = await sessionAccount(pool, await ownerToken());
  if (!account) redirect('/owner/login?next=%2Fapp');
  const shop = await homeShop(pool, account.id);
  if (!shop) redirect('/bat-dau');
  if (shop.self_signup && !shop.onboarded_at) redirect('/bat-dau/tien-trinh');
  redirect(`/app/${shop.slug}`);
}
