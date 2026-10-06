import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import CanvasPage from '@/components/canvas/render';
import { canvasTemplate } from '@/lib/canvas/templates';
import { bindShop } from '@/lib/canvas/slots';
import { turnKnobs } from '@/lib/canvas/knobs';

/**
 * Một template xem như trang khách thật, ở chế độ xem thử: không ghi lượt ghé, nút Google không mở (kịch bản mục 2 và 8).
 * `?anh=1`: vẽ tĩnh làm ảnh thu nhỏ (components/canvas/thumb.tsx). `?ten=<tên quán>`: mẫu mang sẵn tên quán, như trang
 * quán sẽ có khi chọn mẫu này (Library → xem mẫu). `?mau=<số>`: bảng màu thứ mấy của mẫu (núm, lib/canvas/knobs.ts), bắt đầu từ 1.
 */
export async function generateMetadata({ params }: { params: Promise<{ key: string }> }): Promise<Metadata> {
  const template = canvasTemplate((await params).key);
  return template ? { title: `${template.name} · Template`, description: template.about } : {};
}
export default async function Page({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<{ anh?: string; ten?: string; mau?: string }> }) {
  const template = canvasTemplate((await params).key), query = await searchParams;
  if (!template) notFound();
  const name = typeof query.ten === 'string' ? query.ten.trim().slice(0, 60).replace(/[\u0000-\u001f<>]/g, '') : '';
  // The shop's name in its place, every other place keeping the template's sample: the look the shop is choosing.
  const palette = Number(query.mau) - 1, knobs = template.knobs;
  const turned = knobs && Number.isInteger(palette) && palette > 0 && palette < knobs.palettes.length ? turnKnobs(template.doc, knobs, {}, { palette }) : template.doc;
  const doc = name ? bindShop(turned, { name, profile: { links: {} } }, 'sample') : turned;
  return <CanvasPage doc={doc} mode={query.anh ? 'still' : 'demo'} slug={`mau-${template.key}`}
    googleUrl="https://search.google.com/local/writereview?placeid=demo" />;
}
