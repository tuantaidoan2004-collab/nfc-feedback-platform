import { ownerEnabled,ownerCredential } from '@/server/owner-v2';
import { OwnerAuth,OwnerError } from '@/lib/owner/auth';
import { database } from '@/server/db';
import OwnerDashboard from '@/components/owner-dashboard-v2';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import ShopDashboard from '@/components/shop-dashboard';
import { requireOwner } from '@/server/auth';
import { shopBySlug } from '@/server/shops';
export const dynamic='force-dynamic';
export const metadata={robots:{index:false,follow:false}};
export default async function Page({params}:{params:Promise<{shop:string}>}) {
 if(ownerEnabled()){
  const slug=(await params).shop;
  let access;
  const credential=await ownerCredential();
  // The frame only: each view asks for its own data with its own need, so a design session can open the page too.
  try{access=await new OwnerAuth(database()).access(credential,slug,'shell');}
  catch(error){
   // A finished impersonation must not fall through to the owner's sign-in form: the administrator is not the owner.
   if(error instanceof OwnerError && error.code==='IMPERSONATION_ENDED')return <main className="dashboard-wrap"><h1>Phiên xem thay mặt đã kết thúc</h1><p>Mở phiên mới từ trang quản trị nếu vẫn cần hỗ trợ shop này.</p><Link href="/gov">Về trang quản trị</Link></main>;
   if(error instanceof OwnerError && error.status===401)redirect(`/owner/login?next=${encodeURIComponent(`/ZZZ/${slug}`)}`);
   // Signed in as someone without this shop: offer the other door instead of a dead end.
   return <main className="dashboard-wrap"><h1>Không thể mở dashboard</h1><p>Tài khoản đang đăng nhập chưa có quyền với shop này, hoặc dịch vụ đang gián đoạn.</p>
    <p><a href={`/owner/login?next=${encodeURIComponent(`/ZZZ/${slug}`)}`}>Đăng nhập bằng tài khoản khác</a></p></main>;}
  const actor=access.actor;
  return <OwnerDashboard slug={access.slug} name={access.name} customerUrl={`${process.env.APP_ORIGIN ?? ''}/${access.slug}`} impersonation={actor.kind==='admin'?{admin:actor.adminUsername,scope:actor.scope,reason:actor.reason,expiresAt:actor.expiresAt}:null}/>;
 }
 let shop;
 try{shop=await shopBySlug((await params).shop);await requireOwner(shop.id);}
 catch{return <main className="dashboard-wrap"><h1>Cần đăng nhập với quyền quản lý shop</h1><p>Dashboard được bảo vệ. Luồng đăng nhập chưa được kết nối; dữ liệu sẽ không được hiển thị khi chưa xác thực.</p></main>;}
 return <ShopDashboard slug={shop.slug} name={shop.name}/>;
}
