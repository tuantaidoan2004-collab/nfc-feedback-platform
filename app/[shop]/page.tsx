import PublishedPage from '@/components/published-page';
import { publishingEnabled } from '@/server/publishing-runtime';
import ShopFeedbackV2 from '@/components/shop-feedback-v2';
import { visitsV2Enabled } from '@/server/visit-v2-runtime';
import { shopBySlug,publicLink } from '@/server/shops';
import { HttpError } from '@/server/http';
import { notFound } from 'next/navigation';
export const dynamic='force-dynamic';
export default async function Page({params}:{params:Promise<{shop:string}>}) {
 if (publishingEnabled()) return <PublishedPage target={{slug:(await params).shop}}/>;
 // With every gate closed there is no guest page at all: the cookie-era page that used to answer here is gone (lát A3).
 if (!visitsV2Enabled()) notFound();
 let shop;
 try {shop=await shopBySlug((await params).shop);}
 catch(error){if(error instanceof HttpError&&error.status===404)notFound();return <main className="dashboard-wrap"><h1>Trang chưa sẵn sàng</h1><p>Kết nối dữ liệu của shop chưa được cấu hình hoặc đang gián đoạn. Vui lòng thử lại sau.</p></main>;}
 return <ShopFeedbackV2 slug={shop.slug} name={shop.name} googleUrl={publicLink(shop.google_url)} heroUrl={null} heroKind={null}/>;
}
