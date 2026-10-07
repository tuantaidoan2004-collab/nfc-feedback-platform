// Nội dung khối "Công cụ làm việc" trên trang quán của Quite Sensational (QS — tính năng của Tài), ở "khúc B" của trang
// (dưới nút Google và các nút của quán). Khối này là điểm nối DUY NHẤT giữa 2 tính năng: khách bấm → mở BASE_URL + path của TBQ.
// Một nguồn duy nhất bên TBQ: trang khách TBQ, trang quản trị và docs/phoi-hop-voi-QS.md cùng dùng; test kiểm độ dài + luật Google.
// Bên QS chép đúng chữ này vào `lib/events/catalog.ts` (sự kiện 'tbq-cong-cu'); hai bên phải giống nhau.

export const QS_EVENT = {
  /** Mã sự kiện bên QS (bảng shop_events, sự kiện đo đạc `event_tapped`). */
  key: 'tbq-cong-cu',
  /** Tiêu đề khối — tối đa ~40 ký tự. */
  title: 'Công cụ làm việc',
  /** Câu ngắn dưới tiêu đề — tối đa 160 ký tự, khách đọc trong 3 giây. Không nhắc tới đánh giá. */
  summary: 'ChatGPT, Canva, CapCut… bản Pro xịn xò cho bạn chạy deadline ngay tại quán. Ai ngồi quán cũng nhận được, chọn 1 món là xong.',
  /** Hai nút của khối. `{shop}` = mã quán trên QS (chữ thường). */
  items: [
    { key: 'nhan', label: 'Nhận công cụ làm việc miễn phí', path: '/qs/{shop}' },
    { key: 've-chung-toi', label: 'Về chúng tôi', path: '/ve-chung-toi?shop={shop}' },
  ],
  organizer: 'Tiệm Bản Quyền',
  /** Tên chương trình trên các trang của TBQ (cài đặt eventTitle mặc định). */
  program: 'Công cụ làm việc miễn phí',
};

/** Giới hạn độ dài của khối (theo HANDOFF của Tài). */
export const QS_LIMITS = { title: 40, summary: 160, label: 40 };
