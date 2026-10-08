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
 * Trên trang khách, khối chỉ là các nút (Tài 08/10: "kéo xuống dưới thì chỉ hiện nút"); tiêu đề và câu ngắn là để chủ quán đọc ở
 * Library và /gov. Collab được báo ở khúc A bằng chỗ báo hiệu (doc.ts EventSpotEl). Nút mở trang của bên tổ chức ở tab mới, kèm mã quán
 * (`{shop}`). Nút có `ticket` mang thêm một **vé** (lib/events/ticket.ts) khi khách mở trang bằng thẻ / mã QR của quán:
 * bên tổ chức dùng vé để biết khách đang ngồi ở quán, thay cho mọi thứ phải đặt ở quán (màn hình, mã quầy, Wi-Fi).
 * Giao diện của khối theo template của trang: các nút dùng đúng kiểu nút link của template (`guest-links`).
 */
/** `pop`: the two small cards that pop out of the button (look `popout`, uiverse dexter-st/itchy-wolverine-84). */
export type EventItem = { key: string; label: Words; path: string; ticket?: true; pop?: readonly [Words, Words] };
/** A small link under the rules: a path on the organizer's address, or a full https address (their Zalo). */
export type EventLink = { key: string; label: Words; path: string };
export type EventDef = {
  key: string; organizer: string; title: Words; summary: Words; items: readonly EventItem[];
  /** Under the button on the guest page (Tài 08/10): what the guest gets, then the organizer's own rules and links. */
  note: Words; rules: readonly Words[]; links: readonly EventLink[];
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
        pop: [{ vi: 'Trải nghiệm trọn…', en: 'Yours for…' }, { vi: '…1 ngày', en: '…a whole day' }] },
    ],
    note: { vi: 'Quý khách được trải nghiệm công cụ mình muốn trong 1 ngày.', en: 'Try the tool you want for a whole day.' },
    // Chính sách của TBQ (trang /privacy và luật dùng thử trong src/views/public.js của TBQ, nhánh tbq/co-lap), viết gọn.
    rules: [
      { vi: 'Mỗi người nhận 1 công cụ mỗi ngày, để ai ngồi quán cũng có phần.', en: 'One tool per person a day, so everyone in the shop gets a turn.' },
      { vi: 'Lấy mã khi đang ở quán: nối Wi-Fi của quán hoặc nhập mã ở quầy.', en: 'Get your code while in the shop: on its Wi-Fi, or with the code at the counter.' },
      { vi: 'Tài khoản dùng chung: không đổi mật khẩu, email hay cài đặt bảo mật; không lưu thông tin riêng tư lên đó.',
        en: 'Shared accounts: do not change the password, email or security settings, and keep nothing private there.' },
      { vi: 'Tiệm chỉ lưu số điện thoại, mã thiết bị và IP để chống lạm dụng; không bán hay chia sẻ cho bên thứ ba.',
        en: 'The Tiệm keeps only your number, a device code and your IP, against abuse; never sold or shared.' },
    ],
    links: [
      { key: 'chinh-sach', label: { vi: 'Chính sách dữ liệu', en: 'Data policy' }, path: '/privacy' },
      { key: 'zalo', label: { vi: 'Hỗ trợ Zalo 0988 428 496', en: 'Help on Zalo 0988 428 496' }, path: 'https://zalo.me/0988428496' },
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
export type EventBlock = { key: EventKey; organizer: string; title: Words; note: Words; rules: readonly Words[];
  items: { key: string; label: Words; href: string; pop?: readonly [Words, Words] }[]; links: { key: string; label: Words; href: string }[] };

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
  return { key, organizer: event.organizer, title: event.title, note: event.note, rules: event.rules,
    items: event.items.map(item => {
      const href = origin + item.path.replace('{shop}', code);
      return { key: item.key, label: item.label, pop: item.pop, href: item.ticket && ticket ? `${href}${href.includes('?') ? '&' : '?'}t=${encodeURIComponent(ticket)}` : href };
    }),
    links: event.links.map(link => ({ key: link.key, label: link.label, href: link.path.startsWith('https://') ? link.path : origin + link.path })) };
}
