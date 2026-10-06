import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AdminAuth, AdminError } from '@/lib/admin/auth';
import { EditDesk } from '@/lib/admin/desk';
import { CANVAS_TEMPLATES } from '@/lib/canvas/templates';
import { database } from '@/server/db';
import { adminEnabled, adminSessionToken } from '@/server/admin';
import AdminDesk from '@/components/admin-desk';
import styles from '@/components/admin.module.css';
import { Eyebrow } from '@/components/platform/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Bàn dựng', robots: { index: false, follow: false } };

/** Bàn dựng of one open request (kịch bản 9b): /gov → Trang chờ dựng → a request. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  if (!adminEnabled()) notFound();
  try {
    const principal = await new AdminAuth(database()).access(await adminSessionToken());
    if (!principal.twoFactor) redirect('/gov');
  } catch (error) { if (error instanceof AdminError) redirect('/gov/login'); throw error; }
  const desk = await new EditDesk(database()).load((await params).id).catch(() => null);
  if (!desk) notFound();
  const templates = [...CANVAS_TEMPLATES].map(t => ({ key: t.key, name: t.name, knobs: t.knobs ?? null })).sort((a, b) => Number(!!b.knobs) - Number(!!a.knobs));
  return <main className={styles.shell}>
    <header className={styles.top}>
      <div><Eyebrow><Link href="/gov">← Trang chờ dựng</Link> · Bàn dựng</Eyebrow>
        <h1>{desk.details?.name ?? desk.shop.name}</h1>
        <p className={styles.muted}>{desk.page.label || 'Trang'} /{desk.page.slug} · {desk.page.state === 'active' ? 'trang cũ đang chạy' : 'chưa phát hành'} · Zalo {desk.request.contact}</p></div>
    </header>
    <AdminDesk initial={desk} templates={templates} origin={process.env.APP_ORIGIN ?? ''} />
  </main>;
}
