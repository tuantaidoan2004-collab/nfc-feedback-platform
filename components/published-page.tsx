import { publicPage } from '@/server/publishing-runtime';
import ShopFeedbackV2 from './shop-feedback-v2';
export default async function PublishedPage({target}:{target:{slug:string}|{code:string}|{previewToken:string}}) {
  let page;
  try { page = await publicPage(target); }
  catch { return <main className="dashboard-wrap"><h1>Trang chưa sẵn sàng</h1><p>Vui lòng thử lại sau. / Please try again later.</p></main>; }
  const c = page.config;
  return <ShopFeedbackV2 slug={page.slug} name={c.name} googleUrl={c.googleUrl} heroUrl={c.poster?.url ?? null} heroKind={c.poster?.kind ?? null}
    pageConfig={c} template={page.template} render={{proof:page.proof,preview:page.context.scope==='test'}}/>;
}
