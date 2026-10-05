import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import CanvasPage from '@/components/canvas/render';
import { canvasTemplate } from '@/lib/canvas/templates';

/**
 * Một template xem như trang khách thật, ở chế độ xem thử: không ghi lượt ghé, nút Google không mở (kịch bản mục 2 và 8).
 * `?anh=1`: vẽ tĩnh làm ảnh thu nhỏ (components/canvas/thumb.tsx).
 */
export async function generateMetadata({ params }: { params: Promise<{ key: string }> }): Promise<Metadata> {
  const template = canvasTemplate((await params).key);
  return template ? { title: `${template.name} · Template`, description: template.about } : {};
}
export default async function Page({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<{ anh?: string }> }) {
  const template = canvasTemplate((await params).key);
  if (!template) notFound();
  return <CanvasPage doc={template.doc} mode={(await searchParams).anh ? 'still' : 'demo'} slug={`mau-${template.key}`}
    googleUrl="https://search.google.com/local/writereview?placeid=demo" />;
}
