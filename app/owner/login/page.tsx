import OwnerLogin from '@/components/owner-login';
import { ownerEnabled,safeDestination } from '@/server/owner-v2';
import { notFound } from 'next/navigation';
export const dynamic='force-dynamic';
export const metadata={robots:{index:false,follow:false}};
export default async function Page({searchParams}:{searchParams:Promise<{next?:string}>}){
 // No `next`: signing in from the front page leads to the account's own shop (lát D4b).
 if(!ownerEnabled())notFound();const next=safeDestination((await searchParams).next);
 return <OwnerLogin next={next} contact={process.env.NFC_SUPPORT_CONTACT?.trim()||null}/>;
}
