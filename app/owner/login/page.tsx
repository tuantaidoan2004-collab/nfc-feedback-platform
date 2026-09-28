import OwnerLogin from '@/components/owner-login';
import { ownerEnabled,safeDestination } from '@/server/owner-v2';
import { googleSettings } from '@/lib/owner/google';
import { googleMessage } from '@/lib/owner/google-messages';
import { notFound } from 'next/navigation';
export const dynamic='force-dynamic';
export const metadata={robots:{index:false,follow:false}};
export default async function Page({searchParams}:{searchParams:Promise<{next?:string;google?:string}>}){
 // No `next`: signing in from the front page leads to the account's own shop (lát D4b).
 if(!ownerEnabled())notFound();const query=await searchParams,next=safeDestination(query.next);
 // The Google button shows only where the deployment has a Google client (lát D4c); `?google=` is what came back from it.
 return <OwnerLogin next={next} contact={process.env.NFC_SUPPORT_CONTACT?.trim()||null} google={!!googleSettings()} notice={googleMessage(query.google)}/>;
}
