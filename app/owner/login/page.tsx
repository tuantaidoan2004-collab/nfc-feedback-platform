import OwnerLogin from '@/components/owner-login';
import { AuthCard } from '@/components/platform/ui';
import { ownerEnabled,safeDestination } from '@/server/owner-v2';
import { notFound } from 'next/navigation';
export const dynamic='force-dynamic';
export const metadata={robots:{index:false,follow:false}};
export default async function Page({searchParams}:{searchParams:Promise<{next?:string}>}){
 if(!ownerEnabled())notFound();const next=safeDestination((await searchParams).next);
 if(!next)return <AuthCard eyebrow="Quản lý shop"><h1>Mở đường dẫn dashboard của shop để đăng nhập</h1></AuthCard>;
 return <OwnerLogin next={next} contact={process.env.NFC_SUPPORT_CONTACT?.trim()||null}/>;
}
