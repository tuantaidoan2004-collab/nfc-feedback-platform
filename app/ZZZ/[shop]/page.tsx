import { ownerEnabled,ownerToken } from '@/server/owner-v2';
import { OwnerAuth,OwnerError } from '@/lib/owner/auth';
import { database } from '@/server/db';
import OwnerDashboard from '@/components/owner-dashboard-v2';
import { redirect } from 'next/navigation';
import ShopDashboard from '@/components/shop-dashboard';
import { requireOwner } from '@/server/auth';
import { shopBySlug } from '@/server/shops';
export const dynamic='force-dynamic';
export const metadata={robots:{index:false,follow:false}};
export default async function Page({params}:{params:Promise<{shop:string}>}) {
 if(ownerEnabled()){
  const slug=(await params).shop;
  let access;
  try{access=await new OwnerAuth(database()).access(await ownerToken(),slug);}
  catch(error){if(error instanceof OwnerError && error.status===401)redirect(`/owner/login?next=${encodeURIComponent(`/ZZZ/${slug}`)}`);
   return <main className="dashboard-wrap"><h1>Không thể mở dashboard</h1><p>Bạn chưa có quyền với shop này hoặc dịch vụ đang gián đoạn.</p></main>;}
  return <OwnerDashboard slug={access.slug} name={access.name}/>;
 }
 let shop;
 try{shop=await shopBySlug((await params).shop);await requireOwner(shop.id);}
 catch{return <main className="dashboard-wrap"><h1>Cần đăng nhập với quyền quản lý shop</h1><p>Dashboard được bảo vệ. Luồng đăng nhập chưa được kết nối; dữ liệu sẽ không được hiển thị khi chưa xác thực.</p></main>;}
 return <ShopDashboard slug={shop.slug} name={shop.name}/>;
}
