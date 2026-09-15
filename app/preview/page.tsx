import { cookies } from 'next/headers';
import PublishedPage from '@/components/published-page';
export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false, follow: false } };
export default async function Page() { return <PublishedPage target={{previewToken:(await cookies()).get('nfc_preview')?.value ?? ''}}/>; }
