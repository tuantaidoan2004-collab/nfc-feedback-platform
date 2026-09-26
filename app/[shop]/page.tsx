import PublishedPage from '@/components/published-page';
import { publishingEnabled } from '@/server/publishing-runtime';
import { notFound } from 'next/navigation';
export const dynamic='force-dynamic';
export default async function Page({params}:{params:Promise<{shop:string}>}) {
 // One guest page: the published one (lát A3b). With publishing off there is no guest page at all.
 if (!publishingEnabled()) notFound();
 return <PublishedPage target={{slug:(await params).shop}}/>;
}
