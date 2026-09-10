import ShopDashboard from '@/components/shop-dashboard';
import { requireOwner } from '@/server/auth';
import { shopBySlug } from '@/server/shops';
export const dynamic='force-dynamic';
export default async function Page({params}:{params:Promise<{shop:string}>}) {
 let shop;
 try{shop=await shopBySlug((await params).shop);await requireOwner(shop.id);}
 catch{return <main className="dashboard-wrap"><h1>Cần đăng nhập với quyền quản lý shop</h1><p>Dashboard được bảo vệ. Luồng đăng nhập chưa được kết nối; dữ liệu sẽ không được hiển thị khi chưa xác thực.</p></main>;}
 return <ShopDashboard slug={shop.slug} name={shop.name}/>;
}
