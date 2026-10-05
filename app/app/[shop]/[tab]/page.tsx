import { notFound, redirect } from 'next/navigation';
import { OwnerAuth } from '@/lib/owner/auth';
import { onboardingOf } from '@/lib/account/workspace';
import { database } from '@/server/db';
import { ownerCredential } from '@/server/owner-v2';
import { TAB_KEYS, type TabKey } from '@/components/qs/tabs-config';
import TabContent from '@/components/qs/tabs';
import { templateCards } from '@/lib/publishing/templates';

export const dynamic = 'force-dynamic';

/** One tab of the giao diện chính. Library stays open during onboarding: it is where the Template step happens. */
export default async function Page({ params, searchParams }: { params: Promise<{ shop: string; tab: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { shop, tab } = await params;
  if (!TAB_KEYS.includes(tab as TabKey)) notFound();
  const pool = database(), access = await new OwnerAuth(pool).access(await ownerCredential(), shop, 'shell');
  const onboarding = await onboardingOf(pool, access.shopId);
  if (!onboarding.done && access.actor.kind === 'owner' && tab !== 'library') redirect('/bat-dau/tien-trinh');
  return <TabContent tab={tab as TabKey} slug={access.slug} name={access.name} origin={process.env.APP_ORIGIN ?? ''}
    role={access.actor.kind === 'owner' ? access.role : 'support'} onboarding={!onboarding.done} query={await searchParams}
    templates={tab === 'library' ? templateCards() : []} />;
}
