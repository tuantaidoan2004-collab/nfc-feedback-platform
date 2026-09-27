import PublishedPage, { publishedMetadata } from '@/components/published-page';
export const dynamic = 'force-dynamic';
export async function generateMetadata({params}:{params:Promise<{code:string}>}) { return publishedMetadata({code:(await params).code}); }
export default async function Page({params}:{params:Promise<{code:string}>}) { return <PublishedPage target={{code:(await params).code}}/>; }
