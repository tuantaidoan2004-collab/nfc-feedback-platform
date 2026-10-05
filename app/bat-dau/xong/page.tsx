import Finish from '@/components/qs/onboarding/finish';
import { onboardingShop } from '@/server/onboarding';

export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false, follow: false } };

export default async function Page() {
  const shop = await onboardingShop();
  return <Finish slug={shop.slug} />;
}
