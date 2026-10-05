import { notFound } from 'next/navigation';
import { ownerEnabled, ownerCredential } from '@/server/owner-v2';
import { OwnerDesign } from '@/lib/owner/design';
import { database } from '@/server/db';
import CanvasPage from '@/components/canvas/render';
export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false, follow: false } };

/**
 * One page of the shop drawn still, for the picture beside it in the dashboard's page list (lát P3). It shows the
 * page's draft -- what the owner is working on -- so only someone who may edit the shop's design sees it. Still means
 * no visit is recorded and nothing moves. Framed only by this app (next.config.ts).
 */
export default async function Page({ params }: { params: Promise<{ shop: string; page: string }> }) {
  if (!ownerEnabled()) notFound();
  const { shop, page } = await params;
  let state;
  try { state = await new OwnerDesign(database()).read(await ownerCredential(), shop, page); }
  catch { notFound(); }
  return <CanvasPage doc={state.draft.config.doc} mode="still" slug={state.page.slug} googleUrl={state.googleUrl} />;
}
