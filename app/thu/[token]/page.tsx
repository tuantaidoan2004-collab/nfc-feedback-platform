import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import ShopFeedbackV2 from '@/components/shop-feedback-v2';
import { openStartDraft, startEnabled } from '@/server/start';
import { DraftError } from '@/lib/start/draft';
import { isTemplateKey, latestVersion, templateConfig } from '@/lib/publishing/templates';
import '@/components/start/draft-banner.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Bản xem thử', robots: { index: false, follow: false } };

/**
 * A page built before there is an account (lát D4), drawn with the template it chose: what the owner's guests would
 * see, on the owner's own phone. Nothing is recorded -- the page has no render proof, so it opens no visit -- and the
 * page says it is a preview. `?khung=1` is the builder's own frame (no banner); `?t=` shows the same draft in another
 * template, for the builder's template grid.
 */
export default async function Page({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ khung?: string; t?: string }> }) {
  if (!startEnabled()) notFound();
  const [{ token }, query] = await Promise.all([params, searchParams]);
  let draft;
  try { draft = openStartDraft(token); }
  catch (error) {
    if (!(error instanceof DraftError)) throw error;
    return <main className="draft-gone" lang="vi"><h1>{error.code === 'DRAFT_EXPIRED' ? 'Bản xem thử đã hết hạn' : 'Không mở được bản xem thử'}</h1>
      <p>Bản xem thử chỉ sống 7 ngày và không lưu ở đâu cả. Dựng lại mất chưa tới một phút.</p>
      <p><Link href="/bat-dau">Dựng trang của quán</Link></p></main>;
  }
  const key = isTemplateKey(query.t) ? query.t : draft.template;
  const config = { ...templateConfig(key), name: draft.name };
  const framed = query.khung === '1';
  return <>
    {!framed && <p className="draft-banner" data-draft-banner role="note">Bản xem thử · hết hạn {draft.expiresAt.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: 'numeric', month: 'numeric' })}</p>}
    <ShopFeedbackV2 slug="ban-xem-thu" name={config.name} googleUrl={config.googleUrl} heroUrl={null} heroKind={null} pageConfig={config}
      template={key} templateVersion={latestVersion(key)} />
  </>;
}
