import { notFound } from 'next/navigation';
import { AdminAuth } from '@/lib/admin/auth';
import { EditRequests } from '@/lib/admin/edit-requests';
import { validateConfig } from '@/lib/publishing/config';
import { bindShop } from '@/lib/canvas/slots';
import { readProfile } from '@/lib/shop/profile';
import { database } from '@/server/db';
import { adminEnabled, adminSessionToken } from '@/server/admin';
import CanvasPage from '@/components/canvas/render';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Trang chờ dựng', robots: { index: false, follow: false } };

/**
 * A page waiting for Tài to build it (/gov "Trang chờ dựng"): the template the shop picked, with its name in, as the owner sees it
 * while waiting -- what the two talk about on Zalo. Xem thử: nothing is recorded and Google does not open.
 * `?anh=1` draws it still, for the picture in the /gov list. Only while the request is open: /gov is not a window onto every draft.
 */
export default async function Page({ params, searchParams }: { params: Promise<{ page: string }>; searchParams: Promise<{ anh?: string }> }) {
  if (!adminEnabled()) notFound();
  try { await new AdminAuth(database()).access(await adminSessionToken()); } catch { notFound(); }
  const draft = await new EditRequests(database()).draft((await params).page);
  if (!draft) notFound();
  const doc = bindShop(validateConfig(draft.config).doc, { name: draft.name, profile: readProfile(draft.profile) }, 'sample');
  return <CanvasPage doc={doc} mode={(await searchParams).anh ? 'still' : 'demo'} slug={draft.slug} googleUrl={draft.google_url} />;
}
