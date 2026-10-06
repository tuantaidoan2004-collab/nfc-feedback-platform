import { redirect } from 'next/navigation';
import GrayShell from '@/components/qs/onboarding/gray-shell';
import JoinWait from '@/components/qs/onboarding/join-wait';
import { sessionAccount } from '@/lib/account/workspace';
import { myRequests } from '@/lib/account/join';
import { database } from '@/server/db';
import { ownerToken } from '@/server/owner-v2';

export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false, follow: false } };

/** Nhân viên chờ chủ quán duyệt (G3): yêu cầu đã gửi, gửi thêm cho quán khác, và lối vào quán khi đã được duyệt. */
export default async function Page() {
  const pool = database(), account = await sessionAccount(pool, await ownerToken());
  if (!account) redirect('/owner/login?next=%2Fbat-dau%2Fcho-duyet');
  const mine = await myRequests(pool, account.id);
  return <GrayShell><JoinWait handle={account.username} initial={JSON.parse(JSON.stringify(mine))} /></GrayShell>;
}
