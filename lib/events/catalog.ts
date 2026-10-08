import type { Words } from '../canvas/doc';

/**
 * Sự kiện của bên tổ chức, đặt ở khúc B của trang quán: vùng dưới lời mời Google, dưới các khối của chính quán.
 * Chỉ /gov bật / tắt cho từng quán (bảng `shop_events`); chủ quán không phải làm gì. Bên tổ chức tự lo mọi thứ của mình
 * (kho, máy chủ, hỗ trợ khách) và không xin quán quyền gì.
 *
 * Luật Google (docs/google-policy.md luật 4 và 8): mọi khách đều thấy, không phụ thuộc việc bấm Google, chữ không nhắc
 * tới đánh giá. Chữ ở đây là của nền tảng, không phải của shop, và vẫn qua cùng dây bẫy với chữ của shop
 * (tests/contracts/events.spec.ts).
 *
 * Trên trang khách không có chữ nào của sự kiện (Tài 08/10: "xoá hết mấy dòng chữ, bỏ luôn chính sách vì bên đó có"); tiêu đề và
 * câu ngắn là để chủ quán đọc ở Library và /gov. Mỗi quán có **logo collab riêng** (doc.ts EventSpotEl, đặt ở đâu trên trang là
 * do trang) và chính logo đó là chỗ bấm: nút đầu tiên của sự kiện gộp vào logo — nhãn của nút thành dòng ghi chú trên logo,
 * hiệu ứng popout của nút chạy quanh logo. Trang chưa có logo thì khúc của sự kiện chỉ là nút (lib/events/section.ts).
 * Mọi quán đều chạy về cùng một trang của bên tổ chức, kèm mã quán (`{shop}`), mở ở tab mới. Nút có `ticket` mang thêm một
 * **vé** (lib/events/ticket.ts) khi khách mở trang bằng thẻ / mã QR của quán: bên tổ chức dùng vé để biết khách đang ngồi ở
 * quán, thay cho mọi thứ phải đặt ở quán (màn hình, mã quầy, Wi-Fi).
 */
/** `pop`: the two small cards that pop out of the button (look `popout`, uiverse dexter-st/itchy-wolverine-84). */
export type EventItem = { key: string; label: Words; path: string; ticket?: true; pop?: readonly [Words, Words] };
export type EventDef = {
  key: string; organizer: string; title: Words; summary: Words; items: readonly EventItem[];
  /** Địa chỉ gốc của bên tổ chức, https, có thể kèm thư mục (TBQ: /colap). Máy thử đổi được bằng biến `originEnv` (chỉ http://127.0.0.1 khi NFC_ENV=local). */
  origin: string; originEnv: string;
  /** Biến chứa khoá ký vé, dùng chung với bên tổ chức. Thiếu khoá thì nút vẫn có, chỉ không mang vé. */
  ticketKeyEnv: string;
  /** Tên trong /gov. */
  name: string;
  /** Đường API của bên tổ chức mà /gov gọi khi mở / đóng sự kiện cho một quán (lib/events/organizer.ts), nếu bên đó có. */
  hook?: string;
};

export const EVENTS = {
  // Tiệm Bản Quyền (TBQ): khách nhận một công cụ làm việc bản quyền dùng miễn phí, ngay tại quán. Nguồn chữ bên TBQ:
  // `src/qs-event.js` của TBQ; hai bên phải giống nhau.
  'tbq-cong-cu': {
    key: 'tbq-cong-cu',
    organizer: 'Tiệm Bản Quyền',
    title: { vi: 'Công cụ làm việc', en: 'Work tools' },
    summary: {
      vi: 'ChatGPT, Canva, CapCut… bản Pro xịn xò cho bạn chạy deadline ngay tại quán. Ai ngồi quán cũng nhận được, chọn 1 món là xong.',
      en: 'ChatGPT, Canva, CapCut… the Pro versions, ready for your deadline right here. Everyone in the shop can get one, just pick a tool.',
    },
    items: [
      { key: 'nhan', label: { vi: 'Nhận công cụ Pro miễn phí', en: 'Get a free Pro tool' }, path: '/qs/{shop}', ticket: true,
        pop: [{ vi: 'Trải nghiệm trọn…', en: 'Yours for…' }, { vi: '…7 ngày', en: '…a whole week' }] },
    ],
    origin: 'https://thu.tiembanquyen.site/colap',
    originEnv: 'NFC_EVENT_TBQ_ORIGIN',
    ticketKeyEnv: 'NFC_EVENT_TBQ_KEY',
    name: 'Công cụ làm việc · Tiệm Bản Quyền',
    // TBQ 1.3 (phoi-hop-voi-QS.md mục 10): mở / đóng ở /gov thì TBQ tự thêm / tạm dừng quán bên đó.
    hook: '/hooks/qs/quan',
  },
} as const satisfies Record<string, EventDef>;

export type EventKey = keyof typeof EVENTS;
export const EVENT_KEYS = Object.keys(EVENTS) as EventKey[];
export const isEventKey = (value: unknown): value is EventKey => typeof value === 'string' && Object.hasOwn(EVENTS, value);

/** What the guest page draws for one event on one shop: the words and the finished links. */
export type EventBlock = { key: EventKey; organizer: string; title: Words;
  items: { key: string; label: Words; href: string; pop?: readonly [Words, Words] }[] };

/** The organizer's base address: https, or a local one on a test machine, with an optional plain folder (/colap) and no query. Anything else falls back to the default. */
export function eventOrigin(key: EventKey, env: Record<string, string | undefined> = process.env): string {
  const event: EventDef = EVENTS[key], value = env[event.originEnv];
  if (!value) return event.origin;
  let url: URL; try { url = new URL(value); } catch { return event.origin; }
  const local = env.NFC_ENV === 'local' && url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !local) || url.username || url.password || url.search || url.hash) return event.origin;
  if (!/^(\/[A-Za-z0-9_-]+)*\/?$/.test(url.pathname)) return event.origin;
  return url.origin + url.pathname.replace(/\/+$/, '');
}

/**
 * The block for one shop. The shop's link goes on the organizer's address in lower case, as the organizer keys it; a
 * ticket, when there is one, goes only on the items that take it.
 */
export function eventBlock(key: EventKey, shop: string, ticket: string | null = null, env: Record<string, string | undefined> = process.env): EventBlock {
  const event: EventDef = EVENTS[key], origin = eventOrigin(key, env), code = encodeURIComponent(shop.toLowerCase());
  return { key, organizer: event.organizer, title: event.title,
    items: event.items.map(item => {
      const href = origin + item.path.replace('{shop}', code);
      return { key: item.key, label: item.label, pop: item.pop, href: item.ticket && ticket ? `${href}${href.includes('?') ? '&' : '?'}t=${encodeURIComponent(ticket)}` : href };
    }) };
}
