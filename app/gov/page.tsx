import { notFound, redirect } from 'next/navigation';
import { AdminAuth, AdminError, type AdminPrincipal } from '@/lib/admin/auth';
import { ShopProvisioning } from '@/lib/admin/provisioning';
import { database } from '@/server/db';
import { adminEnabled, adminSessionToken } from '@/server/admin';
import AdminSignOut from '@/components/admin-sign-out';
import AdminShops, { type ShopRow } from '@/components/admin-shops';
import AdminMedia from '@/components/admin-media';
import { MediaReview, type MediaForReview } from '@/lib/admin/media-review';
import AdminTwoFactor from '@/components/admin-two-factor';
import AdminIncidents from '@/components/admin-incidents';
import AdminSignups, { type SignupRow } from '@/components/admin-signups';
import AdminTexts from '@/components/admin-texts';
import AdminBillingPanel from '@/components/admin-billing';
import { AdminBilling, type DueShop } from '@/lib/admin/billing';
import type { PaymentSettings } from '@/lib/billing/rules';
import { TextReview, type TextForReview } from '@/lib/admin/text-review';
import { ShopSignups } from '@/lib/start/signup';
import { signStartDraft } from '@/server/start';
import { isTemplateKey } from '@/lib/publishing/templates';
import { PageIncidents, type IncidentForReview } from '@/lib/admin/page-incidents';
import styles from '@/components/admin.module.css';
import { AuthCard, Eyebrow } from '@/components/platform/ui';
import ThemeToggle from '@/components/platform/theme';
import { themeFromCookie } from '@/components/platform/shell';

export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false, follow: false } };

export default async function Page() {
  if (!adminEnabled()) notFound();
  let principal: AdminPrincipal | null = null, shops: ShopRow[] = [], media: MediaForReview[] = [], incidents: IncidentForReview[] = [], signups: SignupRow[] = [], texts: TextForReview[] = [], unavailable = false;
  let payment: PaymentSettings | null = null, due: DueShop[] = [], latest: Record<string, { kind: 'trial' | 'payment'; coversUntil: string }> = {};
  try {
    principal = await new AdminAuth(database()).access(await adminSessionToken(), true);
    // The list is only fetched once the second factor is on; before that this page shows nothing else anyway.
    if (principal.twoFactor) {
      shops = await new ShopProvisioning(database()).list() as ShopRow[];
      media = await new MediaReview(database()).pending();
      texts = await new TextReview(database()).pending();
      const billing = new AdminBilling(database());
      [payment, due, latest] = await Promise.all([billing.settings(), billing.due(), billing.latest()]);
      incidents = await new PageIncidents(database()).open();
      // Each waiting page drawn the way its owner saw it, through a fresh draft link (lát D4b).
      signups = (await new ShopSignups(database()).waiting()).map(row => ({ ...row, previewUrl: isTemplateKey(row.template_key)
        ? `/thu/${signStartDraft({ name: row.shop_name, template: row.template_key, kind: null, hours: [], goals: [] }).token}` : null }));
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
    <AdminIncidents initial={incidents} origin={process.env.APP_ORIGIN ?? null}/>
    <AdminSignups initial={signups}/>
    <AdminMedia initial={media}/>
    <AdminTexts initial={texts}/>
    <AdminShops initial={shops} origin={process.env.APP_ORIGIN ?? null}/>
    <AdminBillingPanel initial={payment} due={due} latest={latest}
      shops={shops.filter(shop => !shop.is_template).map(shop => ({ id: shop.id, slug: shop.slug, name: shop.name, monthly: shop.monthly }))}/>
  </main>;
}
