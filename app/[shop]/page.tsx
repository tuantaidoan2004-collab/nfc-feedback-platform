import PublishedPage, { publishedMetadata } from '@/components/published-page';
import { publishingEnabled } from '@/server/publishing-runtime';
import { notFound } from 'next/navigation';
export const dynamic='force-dynamic';
export async function generateMetadata({params}:{params:Promise<{shop:string}>}) {
 return publishingEnabled() ? publishedMetadata({slug:(await params).shop}) : {robots:{index:false,follow:false}};
}
export default async function Page({params}:{params:Promise<{shop:string}>}) {
 // One guest page: the published one (lát A3b). With publishing off there is no guest page at all.
 if (!publishingEnabled()) notFound();
 return <PublishedPage target={{slug:(await params).shop}}/>;
}
