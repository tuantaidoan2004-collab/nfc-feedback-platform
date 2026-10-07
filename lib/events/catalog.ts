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
 * Mỗi sự kiện là một khối có tiêu đề, một câu ngắn và vài nút; nút mở trang của bên tổ chức ở tab mới, kèm mã quán
 * (`{shop}`). Nút có `ticket` mang thêm một **vé** (lib/events/ticket.ts) khi khách mở trang bằng thẻ / mã QR của quán:
 * bên tổ chức dùng vé để biết khách đang ngồi ở quán, thay cho mọi thứ phải đặt ở quán (màn hình, mã quầy, Wi-Fi).
 * Giao diện của khối theo template của trang: các nút dùng đúng kiểu nút link của template (`guest-links`).
 */
export type EventItem = { key: string; label: Words; path: string; ticket?: true };
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
      { key: 'nhan', label: { vi: 'Nhận công cụ làm việc miễn phí', en: 'Get a free work tool' }, path: '/qs/{shop}', ticket: true },
      { key: 've-chung-toi', label: { vi: 'Về chúng tôi', en: 'About us' }, path: '/ve-chung-toi?shop={shop}' },
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
export type EventBlock = { key: EventKey; organizer: string; title: Words; summary: Words; items: { key: string; label: Words; href: string }[] };

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
  return { key, organizer: event.organizer, title: event.title, summary: event.summary,
    items: event.items.map(item => {
      const href = origin + item.path.replace('{shop}', code);
      return { key: item.key, label: item.label, href: item.ticket && ticket ? `${href}${href.includes('?') ? '&' : '?'}t=${encodeURIComponent(ticket)}` : href };
    }) };
}
