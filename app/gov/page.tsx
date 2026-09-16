import { notFound, redirect } from 'next/navigation';
import { AdminAuth, AdminError, type AdminPrincipal } from '@/lib/admin/auth';
import { database } from '@/server/db';
import { adminEnabled, adminSessionToken } from '@/server/admin';
import AdminSignOut from '@/components/admin-sign-out';
import styles from '@/components/admin.module.css';
export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false, follow: false } };
export default async function Page() {
  if (!adminEnabled()) notFound();
  let principal: AdminPrincipal | null = null, unavailable = false;
  try { principal = await new AdminAuth(database()).access(await adminSessionToken()); }
  // A rejected session sends the visitor to the form; a database problem must not, or the two pages loop.
  catch (error) { if (error instanceof AdminError) principal = null; else unavailable = true; }
  if (unavailable) return <main className={styles.login}><h1>Dịch vụ đang gián đoạn</h1><p>Vui lòng thử lại sau.</p></main>;
  if (!principal) redirect('/gov/login');
  return <main className={styles.shell}>
    <div className={styles.row}>
      <div><p>QUẢN TRỊ NỀN TẢNG</p><h1>Xin chào, {principal.username}</h1></div>
      <AdminSignOut/>
    </div>
    <p>Danh sách shop, thanh toán và thao tác quản trị sẽ nằm ở đây.</p>
  </main>;
}
