import PublishedPage from '@/components/published-page';
export const dynamic = 'force-dynamic';
export default async function Page({params}:{params:Promise<{code:string}>}) { return <PublishedPage target={{code:(await params).code}}/>; }
