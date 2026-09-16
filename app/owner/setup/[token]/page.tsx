import { notFound } from 'next/navigation';
import OwnerSetup from '@/components/owner-setup';
import { OwnerSetupLinks } from '@/lib/owner/setup-link';
import { database } from '@/server/db';
import { ownerEnabled } from '@/server/owner-v2';
import styles from '@/components/owner-dashboard.module.css';

export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false, follow: false } };

// The token sits in the path, which reaches request logs. It is single use, expires in 48 hours and is stored
// only as a hash, and /owner/:path* already answers with no-store and no-referrer. Keeping it out of logs
// entirely would mean carrying it in the fragment and posting it from the browser; noted, not done here.
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  if (!ownerEnabled()) notFound();
  const { token } = await params;
  let link: { username: string } | null = null, unavailable = false;
  try { link = await new OwnerSetupLinks(database()).inspect(token) as { username: string } | null; }
  catch { unavailable = true; }

  if (unavailable) return <main className={styles.login}><h1>Dịch vụ đang gián đoạn</h1><p>Vui lòng thử lại sau.</p></main>;
  // One message for expired, already used, replaced and never existed: which one it was is not the visitor's
  // business, and saying would tell someone guessing links whether they had found a real one.
  if (!link) return <main className={styles.login}><p>QUẢN LÝ SHOP</p><h1>Liên kết không dùng được</h1>
    <p>Liên kết đã hết hạn, đã được dùng, hoặc đã bị thay bằng liên kết mới. Hãy liên hệ nơi cấp tài khoản để xin liên kết khác.</p></main>;

  return <OwnerSetup token={token} username={link.username}/>;
}
