import GrayShell from '@/components/qs/onboarding/gray-shell';
import GoogleStep from '@/components/qs/onboarding/google-step';
import { onboardingShop } from '@/server/onboarding';

export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false, follow: false } };

export default async function Page() {
  const shop = await onboardingShop();
  return <GrayShell percent={20 + (shop.template ? 30 : 0) + (shop.dashboard ? 40 : 0)}><GoogleStep slug={shop.slug} /></GrayShell>;
}
