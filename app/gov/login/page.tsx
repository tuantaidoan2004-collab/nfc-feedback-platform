import AdminLogin from '@/components/admin-login';
import { adminEnabled } from '@/server/admin';
import { notFound } from 'next/navigation';
export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false, follow: false } };
export default async function Page() {
  if (!adminEnabled()) notFound();
  return <AdminLogin/>;
}
