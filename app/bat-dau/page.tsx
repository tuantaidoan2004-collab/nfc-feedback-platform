import { redirect } from 'next/navigation';
import SkySignup from '@/components/qs/onboarding/sky-signup';
import { homeShop, sessionAccount } from '@/lib/account/workspace';
import { googleSettings } from '@/lib/owner/google';
import { database } from '@/server/db';
import { ownerToken } from '@/server/owner-v2';

export const dynamic = 'force-dynamic';

/** Bước 1 — pha trời xanh (chào mừng → tên → loại quán → tài khoản). Someone already signed in goes on to where they left off. */
export default async function Page({ searchParams }: { searchParams: Promise<{ google?: string }> }) {
  const pool = database(), account = await sessionAccount(pool, await ownerToken());
  if (account) {
    const shop = await homeShop(pool, account.id);
    if (shop) redirect(shop.self_signup && !shop.onboarded_at ? '/bat-dau/tien-trinh' : `/app/${shop.slug}`);
    // An account with no shop of its own is staff waiting for, or about to ask, an owner (G3).
    redirect('/bat-dau/cho-duyet');
  }
  const notice = (await searchParams).google ?? null;
  return <SkySignup google={!!googleSettings()} notice={notice && /^[A-Z_]{2,40}$/.test(notice) ? notice : null} />;
}
