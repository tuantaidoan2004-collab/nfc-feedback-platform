import { notFound } from 'next/navigation';
import { EditDesk, deskDoc } from '@/lib/admin/desk';
import { database } from '@/server/db';
import CanvasPage from '@/components/canvas/render';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Xem thử trang của quán', robots: { index: false, follow: false } };

/**
 * The link Admin Tài sends the shop over Zalo from Bàn dựng (kịch bản 9b.5): the page being built, on the shop's own phone, before
 * it goes live. Xem thử: nothing is recorded and the Google button does not open. Dead after 7 days or once the request is closed.
 */
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const desk = await new EditDesk(database()).byPreview((await params).token).catch(() => null);
  if (!desk) notFound();
  return <CanvasPage doc={deskDoc(desk)} mode="demo" slug={desk.page.slug} googleUrl="https://search.google.com/local/writereview?placeid=demo" />;
}
