import ShopFeedback from '@/components/shop-feedback';
import { shopBySlug,mediaUrl,publicLink } from '@/server/shops';
import { HttpError } from '@/server/http';
import { notFound } from 'next/navigation';
export const dynamic='force-dynamic';
export default async function Page({params}:{params:Promise<{shop:string}>}) {
 let shop;
 try {shop=await shopBySlug((await params).shop);}
 catch(error){if(error instanceof HttpError&&error.status===404)notFound();return <main className="dashboard-wrap"><h1>Trang chưa sẵn sàng</h1><p>Kết nối dữ liệu của shop chưa được cấu hình hoặc đang gián đoạn. Vui lòng thử lại sau.</p></main>;}
 return <ShopFeedback slug={shop.slug} name={shop.name} googleUrl={publicLink(shop.google_url)} heroUrl={mediaUrl(shop.hero_key)} heroKind={shop.hero_kind}/>;
}
