import { notFound } from 'next/navigation';
import { ownerEnabled, ownerCredential } from '@/server/owner-v2';
import { OwnerPages } from '@/lib/owner/pages';
import { database } from '@/server/db';
import CanvasPage from '@/components/canvas/render';
export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false, follow: false } };

/**
 * One page of the shop drawn still, for its picture in Library and My Card (lát P3): as guests see it, or -- while Tài is still
 * matching it to the shop -- as the template the shop picked (lib/owner/pages.ts `picture`). Only someone who may see the
 * shop's design sees it. Still means no visit is recorded and nothing moves. Framed only by this app (next.config.ts).
 */
export default async function Page({ params }: { params: Promise<{ shop: string; page: string }> }) {
  if (!ownerEnabled()) notFound();
  const { shop, page } = await params;
  let shown;
  try { shown = await new OwnerPages(database()).picture(await ownerCredential(), shop, page); }
  catch { notFound(); }
  return <CanvasPage doc={shown.config.doc} mode="still" slug={shown.slug} googleUrl={shown.googleUrl} />;
}
