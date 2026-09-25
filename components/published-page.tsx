import { notFound } from 'next/navigation';
import { publicPage } from '@/server/publishing-runtime';
import { PublishingError } from '@/lib/publishing/config';
import ShopFeedbackV2 from './shop-feedback-v2';
export default async function PublishedPage({target}:{target:{slug:string}|{code:string}|{previewToken:string}}) {
  let page;
  try { page = await publicPage(target); }
  catch (error) {
    // Vòng đời trang (migration 026): a closed page's link no longer exists; a paused one says it is paused.
    if (error instanceof PublishingError && error.code === 'PAGE_CLOSED') notFound();
    if (error instanceof PublishingError && error.code === 'PAGE_PAUSED') return <main className="dashboard-wrap" data-page-paused>
      <h1>Trang tạm ngừng</h1><p>Quán đang tạm ngừng trang này. Vui lòng quay lại sau. / This page is paused for now. Please come back later.</p></main>;
    return <main className="dashboard-wrap"><h1>Trang chưa sẵn sàng</h1><p>Vui lòng thử lại sau. / Please try again later.</p></main>;
  }
  const c = page.config;
  return <ShopFeedbackV2 slug={page.slug} name={c.name} googleUrl={c.googleUrl} heroUrl={c.poster?.url ?? null} heroKind={c.poster?.kind ?? null}
    pageConfig={c} template={page.template} templateVersion={page.templateVersion} render={{proof:page.proof,preview:page.context.scope==='test'}}/>;
}
