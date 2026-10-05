import { redirect } from 'next/navigation';
import { OwnerAuth } from '@/lib/owner/auth';
import { onboardingOf } from '@/lib/account/workspace';
import { database } from '@/server/db';
import { ownerCredential } from '@/server/owner-v2';
import Home from '@/components/qs/home';

export const dynamic = 'force-dynamic';

/** The Orb's own screen. A shop that signed itself up and has not finished onboarding goes back to it first. */
export default async function Page({ params, searchParams }: { params: Promise<{ shop: string }>; searchParams: Promise<{ chao?: string }> }) {
  const pool = database(), access = await new OwnerAuth(pool).access(await ownerCredential(), (await params).shop, 'shell');
  const onboarding = await onboardingOf(pool, access.shopId);
  if (!onboarding.done && access.actor.kind === 'owner') redirect('/bat-dau/tien-trinh');
  return <Home name={access.name} welcome={(await searchParams).chao === '1'} />;
}
