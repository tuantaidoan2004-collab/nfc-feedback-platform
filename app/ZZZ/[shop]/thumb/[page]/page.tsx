import { notFound } from 'next/navigation';
import { ownerEnabled, ownerCredential } from '@/server/owner-v2';
import { OwnerDesign } from '@/lib/owner/design';
import { database } from '@/server/db';
import ShopFeedbackV2 from '@/components/shop-feedback-v2';
export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false, follow: false } };

/**
 * One page of the shop drawn still, for the picture beside it in the dashboard's page list (lát P3). It shows the
 * page's draft -- what the owner is working on -- so only someone who may edit the shop's design sees it. Still means
 * no visit is recorded and no video plays. Framed only by this app (next.config.ts).
 */
export default async function Page({ params }: { params: Promise<{ shop: string; page: string }> }) {
  if (!ownerEnabled()) notFound();
  const { shop, page } = await params;
  let state;
  try { state = await new OwnerDesign(database()).read(await ownerCredential(), shop, page); }
  catch { notFound(); }
  const c = state.draft.config;
  return <ShopFeedbackV2 still slug={state.page.slug} name={c.name} googleUrl={c.googleUrl} heroUrl={c.poster?.url ?? null} heroKind={c.poster?.kind ?? null}
    pageConfig={c} template={state.template.key} templateVersion={state.template.draft} />;
}
