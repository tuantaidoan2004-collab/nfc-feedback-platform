import { notFound } from 'next/navigation';
import { AdminAuth } from '@/lib/admin/auth';
import { PublishReviews } from '@/lib/admin/publish-reviews';
import { validateConfig } from '@/lib/publishing/config';
import { database } from '@/server/db';
import { adminEnabled, adminSessionToken } from '@/server/admin';
import CanvasPage from '@/components/canvas/render';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Bản nháp chờ duyệt', robots: { index: false, follow: false } };

/**
 * The draft of a page waiting for its shop's first publish, as the guest would get it, for Tài to look at before approving
 * (/gov, kịch bản mục 4). Xem thử: nothing is recorded and Google does not open. `?anh=1` draws it still, for the picture in
 * the /gov list. Only while the shop waits: /gov is not a window onto every shop's drafts.
 */
export default async function Page({ params, searchParams }: { params: Promise<{ page: string }>; searchParams: Promise<{ anh?: string }> }) {
  if (!adminEnabled()) notFound();
  try { await new AdminAuth(database()).access(await adminSessionToken()); } catch { notFound(); }
  const draft = await new PublishReviews(database()).draft((await params).page);
  if (!draft) notFound();
  return <CanvasPage doc={validateConfig(draft.config).doc} mode={(await searchParams).anh ? 'still' : 'demo'} slug={draft.slug} googleUrl={draft.google_url} />;
}
