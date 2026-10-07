/**
 * Khúc B trên trang khách: mỗi sự kiện /gov đã mở cho quán thành một khúc canvas (lib/events/section.ts), vẽ bằng đúng
 * SectionView của trang, đặt giữa khúc đầu và phần còn lại (render.tsx `afterFirst`). Mọi khách đều thấy, không phụ thuộc
 * việc bấm Google (luật 4 và 8).
 */
import type { PageDoc } from '@/lib/canvas/doc';
import type { EventBlock } from '@/lib/events/catalog';
import { eventSection } from '@/lib/events/section';
import { SectionView } from './render';
import { EventTaps } from './live';

export default function EventSections({ doc, blocks }: { doc: PageDoc; blocks: EventBlock[] }) {
  if (!blocks.length) return null;
  return <>{blocks.map(block => <EventTaps key={block.key} event={block.key} items={block.items}>
    <SectionView section={eventSection(doc, block)} index={1} mode="live" />
  </EventTaps>)}</>;
}
