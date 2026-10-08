/**
 * Khúc B trên trang khách: mỗi sự kiện /gov đã mở cho quán mà trang chưa có logo collab thành một khúc canvas chỉ có nút
 * (lib/events/section.ts), vẽ bằng đúng SectionView của trang, đặt giữa khúc đầu và phần còn lại (render.tsx `afterFirst`). Mọi khách đều thấy, không phụ thuộc
 * việc bấm Google (luật 4 và 8).
 */
import type { PageDoc } from '@/lib/canvas/doc';
import type { EventBlock } from '@/lib/events/catalog';
import { eventSection, hasSign } from '@/lib/events/section';
import { SectionView } from './render';
import { EventTaps } from './live';

export default function EventSections({ doc, blocks }: { doc: PageDoc; blocks: EventBlock[] }) {
  // A page with its own collab logo for the event is tapped there (live.tsx EventSpot): no block of buttons under the first section.
  const shown = blocks.filter(block => !hasSign(doc, block.key));
  if (!shown.length) return null;
  return <>{shown.map(block => <EventTaps key={block.key} event={block.key} items={block.items}>
    <SectionView section={eventSection(doc, block)} index={1} mode="live" />
  </EventTaps>)}</>;
}
