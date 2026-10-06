import { notFound } from 'next/navigation';
import { AdminAuth } from '@/lib/admin/auth';
import { EditDesk, deskDoc } from '@/lib/admin/desk';
import { database } from '@/server/db';
import { adminEnabled, adminSessionToken } from '@/server/admin';
import CanvasPage from '@/components/canvas/render';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Bàn dựng · xem trước', robots: { index: false, follow: false } };

/** The draft on Bàn dựng as guests will see it after "Phát hành": the waiting details in their places. `?anh=1` draws it still. */
export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ anh?: string }> }) {
  if (!adminEnabled()) notFound();
  try { await new AdminAuth(database()).access(await adminSessionToken()); } catch { notFound(); }
  const desk = await new EditDesk(database()).load((await params).id).catch(() => null);
  if (!desk) notFound();
  return <CanvasPage doc={deskDoc(desk)} mode={(await searchParams).anh ? 'still' : 'demo'} slug={desk.page.slug}
    googleUrl="https://search.google.com/local/writereview?placeid=demo" />;
}
