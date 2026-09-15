import OwnerLogin from '@/components/owner-login';
import { ownerEnabled,safeDestination } from '@/server/owner-v2';
import { notFound } from 'next/navigation';
export const dynamic='force-dynamic';
export const metadata={robots:{index:false,follow:false}};
export default async function Page({searchParams}:{searchParams:Promise<{next?:string}>}){
 if(!ownerEnabled())notFound();const next=safeDestination((await searchParams).next);
 if(!next)return <main className="dashboard-wrap"><h1>Mở đường dẫn dashboard của shop để đăng nhập</h1></main>;
 return <OwnerLogin next={next}/>;
}
