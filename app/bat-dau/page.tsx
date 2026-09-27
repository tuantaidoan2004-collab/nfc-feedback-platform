import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import PlatformShell from '@/components/platform/shell';
import Builder from '@/components/start/builder';
import { startEnabled } from '@/server/start';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Dựng trang của quán', description: 'Dựng thử trang của quán trong một phút, xem ngay trên điện thoại của bạn. Chưa cần tài khoản.' };

/** Building a page before there is an account (lát D4); saving makes the account and the page waits for approval (D4b). */
export default async function Page() {
  if (!startEnabled()) notFound();
  return <PlatformShell><Builder /></PlatformShell>;
}
