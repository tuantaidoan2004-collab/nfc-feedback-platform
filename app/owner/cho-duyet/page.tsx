import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AuthCard } from '@/components/platform/ui';
import { OwnerError } from '@/lib/owner/auth';
import { OwnerProfiles } from '@/lib/owner/profile';
import { ShopSignups } from '@/lib/start/signup';
import { database } from '@/server/db';
import { ownerEnabled, ownerToken } from '@/server/owner-v2';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Trang đang chờ duyệt', robots: { index: false, follow: false } };

/**
 * Where an account lands when it signs in with no shop yet (lát D4b): its saved page is waiting for approval. Once
 * the shop exists, the same sign-in leads to its dashboard instead.
 */
export default async function Page() {
  if (!ownerEnabled()) notFound();
  let profile;
  try { profile = await new OwnerProfiles(database()).get(await ownerToken()); }
  catch (error) { if (error instanceof OwnerError && error.status === 401) redirect('/owner/login'); throw error; }
  if (profile.shops.length) redirect(`/ZZZ/${profile.shops[0].slug}`);
  const signup = await new ShopSignups(database()).ofUser(profile.id);
  return <AuthCard eyebrow="Trang của bạn" data-signup-waiting="">
    {signup ? <>
      <h1>{signup.shop_name} đang chờ duyệt</h1>
      <p>Chúng tôi xem từng trang trước khi mở cho khách. Khi trang được duyệt, đăng nhập bằng @{profile.handle} là vào thẳng
        dashboard của quán.</p>
      <p>Đã lưu lúc {signup.created_at.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}.</p>
    </> : <>
      <h1>Tài khoản chưa có quán nào</h1>
      <p>Dựng trang của quán rồi bấm “Lưu trang của tôi”.</p>
      <p><Link href="/bat-dau">Dựng trang của quán</Link></p>
    </>}
  </AuthCard>;
}
