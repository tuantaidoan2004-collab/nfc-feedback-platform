import { notFound, redirect } from 'next/navigation';
import { AdminAuth, AdminError, type AdminPrincipal } from '@/lib/admin/auth';
import { ShopProvisioning } from '@/lib/admin/provisioning';
import { database } from '@/server/db';
import { adminEnabled, adminSessionToken } from '@/server/admin';
import AdminSignOut from '@/components/admin-sign-out';
import AdminShops, { type ShopRow } from '@/components/admin-shops';
import { DEFAULT_TEMPLATE, templateCards } from '@/lib/canvas/templates';
import AdminMedia from '@/components/admin-media';
import { MediaReview, type MediaForReview } from '@/lib/admin/media-review';
import AdminTwoFactor from '@/components/admin-two-factor';
import AdminIncidents from '@/components/admin-incidents';
import AdminEditRequests from '@/components/admin-edit-requests';
import AdminPayments from '@/components/admin-payments';
import { EditRequests, type EditRequestRow } from '@/lib/admin/edit-requests';
import { PageIncidents, type IncidentForReview } from '@/lib/admin/page-incidents';
import styles from '@/components/admin.module.css';
import { AuthCard, Eyebrow } from '@/components/platform/ui';
import ThemeToggle from '@/components/platform/theme';
import { themeFromCookie } from '@/components/platform/shell';

export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false, follow: false } };

export default async function Page() {
  if (!adminEnabled()) notFound();
  let principal: AdminPrincipal | null = null, shops: ShopRow[] = [], media: MediaForReview[] = [], incidents: IncidentForReview[] = [], edits: EditRequestRow[] = [], unavailable = false;
  try {
    principal = await new AdminAuth(database()).access(await adminSessionToken(), true);
    // The list is only fetched once the second factor is on; before that this page shows nothing else anyway.
    if (principal.twoFactor) {
      shops = await new ShopProvisioning(database()).list() as ShopRow[];
      media = await new MediaReview(database()).pending();
      incidents = await new PageIncidents(database()).open();
      edits = await new EditRequests(database()).open();
    }
  }
  // A rejected session sends the visitor to the form; a database problem must not, or the two pages loop.
  catch (error) { if (error instanceof AdminError) principal = null; else unavailable = true; }

  if (unavailable) return <AuthCard><h1>Dịch vụ đang gián đoạn</h1><p>Vui lòng thử lại sau.</p></AuthCard>;
  if (!principal) redirect('/gov/login');
  // Nothing else on this page until the second factor is on: "bắt buộc" has to mean the work is unreachable
  // without it, not that a banner asks nicely (lát A2).
  if (!principal.twoFactor) return <AdminTwoFactor/>;

  return <main className={styles.shell}>
    <header className={styles.top}>
      <div><Eyebrow>Quản trị nền tảng</Eyebrow><h1>Xin chào, {principal.username}</h1></div>
      <div className={styles.topTools}><ThemeToggle initial={await themeFromCookie()}/><AdminSignOut/></div>
    </header>
    <AdminEditRequests initial={edits}/>
    <AdminPayments/>
    <AdminIncidents initial={incidents} origin={process.env.APP_ORIGIN ?? null}/>
    <AdminMedia initial={media}/>
    <AdminShops initial={shops} origin={process.env.APP_ORIGIN ?? null}
      templates={templateCards().map(({ key, name }) => ({ key, name })).sort((a, b) => Number(b.key === DEFAULT_TEMPLATE) - Number(a.key === DEFAULT_TEMPLATE))}/>
  </main>;
}
