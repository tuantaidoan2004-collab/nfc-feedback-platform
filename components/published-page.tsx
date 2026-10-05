import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { publicPage } from '@/server/publishing-runtime';
import { PublishingError } from '@/lib/publishing/config';
import CanvasPage from './canvas/render';

type Target = {slug:string}|{code:string}|{previewToken:string};
// One read per request: the tab title and the page itself both need the published page (lát S0). `cache` keys on its
// arguments by identity, so the target travels as two strings.
const load = cache((kind: 'slug'|'code'|'previewToken', value: string) =>
  publicPage(kind === 'slug' ? {slug:value} : kind === 'code' ? {code:value} : {previewToken:value}));
const read = (target: Target) => 'slug' in target ? load('slug', target.slug) : 'code' in target ? load('code', target.code) : load('previewToken', target.previewToken);

/**
 * A guest page's tab carries the shop's own name, never the platform's (the root title used to read "Bản thử" on every
 * shop). Guest pages are never indexed: a card's page is for the person standing in the shop.
 */
export async function publishedMetadata(target: Target): Promise<Metadata> {
  let name: string | undefined;
  try { name = (await read(target)).config.name; } catch { /* The page answers for itself: paused, closed, or not ready. */ }
  return { ...(name ? { title: { absolute: name } } : {}), robots: { index: false, follow: false } };
}

export default async function PublishedPage({target}:{target:Target}) {
  let page;
  try { page = await read(target); }
  catch (error) {
    // Vòng đời trang (migration 026): a closed page's link no longer exists; a paused one says it is paused.
    if (error instanceof PublishingError && error.code === 'PAGE_CLOSED') notFound();
    if (error instanceof PublishingError && error.code === 'PAGE_PAUSED') return <main className="dashboard-wrap" data-page-paused>
      <h1>Trang tạm ngừng</h1><p>Quán đang tạm ngừng trang này. Vui lòng quay lại sau. / This page is paused for now. Please come back later.</p></main>;
    return <main className="dashboard-wrap"><h1>Trang chưa sẵn sàng</h1><p>Vui lòng thử lại sau. / Please try again later.</p></main>;
  }
  // The page is the shop's canvas document (đợt ②); the Google button always takes the shop's own review link.
  return <CanvasPage doc={page.config.doc} mode="live" slug={page.slug} googleUrl={page.googleUrl} render={{proof:page.proof,preview:page.context.scope==='test'}}/>;
}
