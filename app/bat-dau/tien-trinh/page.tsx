import GrayShell from '@/components/qs/onboarding/gray-shell';
import Progress from '@/components/qs/onboarding/progress';
import { onboardingShop } from '@/server/onboarding';

export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false, follow: false } };

/** Tài khoản 20% · Template +30% (làm hoặc bỏ qua) · Dashboard +40% · Hoàn tất 100%. */
export default async function Page() {
  const shop = await onboardingShop();
  return <GrayShell percent={20 + (shop.template ? 30 : 0) + (shop.dashboard ? 40 : 0)}><Progress slug={shop.slug} template={shop.template} dashboard={shop.dashboard} /></GrayShell>;
}
