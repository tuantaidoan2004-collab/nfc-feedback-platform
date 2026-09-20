import { notFound, redirect } from 'next/navigation';
import { AdminAuth, AdminError, type AdminPrincipal } from '@/lib/admin/auth';
import { ShopProvisioning } from '@/lib/admin/provisioning';
import { database } from '@/server/db';
import { adminEnabled, adminSessionToken } from '@/server/admin';
import { nfcEnv } from '@/server/env';
import AdminSignOut from '@/components/admin-sign-out';
import AdminShops, { type ShopRow } from '@/components/admin-shops';
import AdminTwoFactor from '@/components/admin-two-factor';
import styles from '@/components/admin.module.css';

export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false, follow: false } };

export default async function Page() {
  if (!adminEnabled()) notFound();
  let principal: AdminPrincipal | null = null, shops: ShopRow[] = [], unavailable = false;
  try {
    principal = await new AdminAuth(database()).access(await adminSessionToken(), true);
    // The list is only fetched once the second factor is on; before that this page shows nothing else anyway.
    if (principal.twoFactor) shops = await new ShopProvisioning(database()).list() as ShopRow[];
  }
  // A rejected session sends the visitor to the form; a database problem must not, or the two pages loop.
  catch (error) { if (error instanceof AdminError) principal = null; else unavailable = true; }

  if (unavailable) return <main className={styles.login}><h1>Dịch vụ đang gián đoạn</h1><p>Vui lòng thử lại sau.</p></main>;
  if (!principal) redirect('/gov/login');
  // Nothing else on this page until the second factor is on: "bắt buộc" has to mean the work is unreachable
  // without it, not that a banner asks nicely (lát A2).
  if (!principal.twoFactor) return <AdminTwoFactor/>;

  return <main className={styles.shell}>
    <div className={styles.row}>
      <div><p>QUẢN TRỊ NỀN TẢNG</p><h1>Xin chào, {principal.username}</h1></div>
      <AdminSignOut/>
    </div>
    <AdminShops initial={shops} origin={process.env.APP_ORIGIN ?? null} testAccountAllowed={nfcEnv() !== 'production'}/>
  </main>;
}
