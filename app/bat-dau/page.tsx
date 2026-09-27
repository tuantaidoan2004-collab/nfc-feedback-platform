import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import PlatformShell from '@/components/platform/shell';
import Builder from '@/components/start/builder';
import { CONTACT } from '@/components/legal-page';
import { startEnabled } from '@/server/start';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Dựng trang của quán', description: 'Dựng thử trang của quán trong một phút, xem ngay trên điện thoại của bạn. Chưa cần tài khoản.' };

/** Building a page before there is an account (lát D4). The builder is a client component; nothing here is stored. */
export default async function Page() {
  if (!startEnabled()) notFound();
  return <PlatformShell><Builder zaloHref={CONTACT.zaloHref} email={CONTACT.email} /></PlatformShell>;
}
