import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import CanvasPage from '@/components/canvas/render';
import { canvasTemplate, pageFromTemplate } from '@/lib/canvas/templates';

/**
 * Một template xem như trang khách thật, ở chế độ xem thử: không ghi lượt ghé, nút Google không mở (kịch bản mục 2 và 8).
 * `?anh=1`: vẽ tĩnh làm ảnh thu nhỏ (components/canvas/thumb.tsx). `?ten=<tên quán>`: mẫu mang sẵn tên quán, như trang
 * quán sẽ có khi chọn mẫu này (Library → xem mẫu).
 */
export async function generateMetadata({ params }: { params: Promise<{ key: string }> }): Promise<Metadata> {
  const template = canvasTemplate((await params).key);
  return template ? { title: `${template.name} · Template`, description: template.about } : {};
}
export default async function Page({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<{ anh?: string; ten?: string }> }) {
  const template = canvasTemplate((await params).key), query = await searchParams;
  if (!template) notFound();
  const name = typeof query.ten === 'string' ? query.ten.trim().slice(0, 60).replace(/[\u0000-\u001f<>]/g, '') : '';
  let doc = template.doc;
  if (name) try { doc = pageFromTemplate(template.key, name).doc; } catch { /* a name the page refuses: the template as it is */ }
  return <CanvasPage doc={doc} mode={query.anh ? 'still' : 'demo'} slug={`mau-${template.key}`}
    googleUrl="https://search.google.com/local/writereview?placeid=demo" />;
}
