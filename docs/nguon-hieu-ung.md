# Nguồn hiệu ứng: uiverse.io

Tài 07/10: lưu lại để sau này, khi khách tự nhắn yêu cầu trong tool, Claude tìm được hiệu ứng liên quan. **https://uiverse.io**:
~4.500 phần tử giao diện mã nguồn mở, **giấy phép MIT** (ghi ở chân trang của site), chia thư viện riêng nên dễ tìm.

| Thư viện | Link | Dùng cho trang quán |
|---|---|---|
| Buttons | https://uiverse.io/buttons | nút Google, nút mạng xã hội |
| Cards | https://uiverse.io/cards | thẻ chính, thẻ kính |
| Patterns | https://uiverse.io/patterns | nền, hoạ tiết |
| Loaders | https://uiverse.io/loaders | chuyển động nhỏ (hạt, xoay, nhịp) |
| Switches, Checkboxes, Radio, Inputs, Forms, Tooltips | https://uiverse.io/elements | ít dùng (ô góp ý riêng) |

**Cách tìm nhanh:** theo thẻ `https://uiverse.io/tags/<thẻ>` (vd `shine`, `glow`, `neon`, `shimmer`, `gradient`, `border`,
`glassmorphism`, `pulse`, `floating`, `sparkle`). Mỗi trang phần tử có sẵn mã HTML + CSS trong khối JSON-LD (`"text"`, sau
`/* CSS */`): đọc mã, không cần chụp màn hình từng cái.

**Luật khi lấy về:**
- Chỉ lấy hiệu ứng **tự chạy hoặc chạy khi chạm** — trên điện thoại không có hover. Có `@keyframes` là dấu hiệu tốt.
- **Không dán CSS tự do vào trang** (trang chỉ nhận danh sách có sẵn, `lib/canvas/doc.ts`): viết lại thành một hiệu ứng có tên
  trong `components/canvas/canvas.css` / `shapes.tsx`, đổi màu theo quán, rồi trang dùng bằng tên đó.
- Giữ ghi công (MIT): tên tác giả + đường dẫn phần tử trong chú thích code và trong bảng dưới.

## Đã lấy về

| Tên trong trang | Gốc | Tác giả | Ở đâu |
|---|---|---|---|
| `google.shine` (vệt sáng đôi quét qua nút) | https://uiverse.io/Ashon-G/rotten-frog-52 | Ashon-G | `.cv-quet`, `live.tsx` |
| `motion.loop: "xu"` (lật như đồng xu rồi nghỉ) | https://uiverse.io/JohnnyCSilva/black-rabbit-68 | João Silva | `.cv-loop-xu` |
| `shape: "hat-bay"` (hạt sáng bay lên) | https://uiverse.io/vinh_8995/tame-lionfish-65 | vinh_8995 | `.cv-hat-bay`, `shapes.tsx` |

Copyright các phần gốc thuộc tác giả trên uiverse.io, phát hành theo MIT License (https://uiverse.io — chân trang).
| `shape: "ve"` (vé tối: khấc, đục lỗ, lưới phối cảnh chạy, vệt ánh kim) + `text.paint` (chữ chuyển màu) | https://uiverse.io/zeeshan_2112/shy-rattlesnake-3 | zeeshan_2112 | `.cv-ve`, `shapes.tsx` |
| `shape: "may-troi"` (mây ba lớp trôi ngang, lớp xa chậm) và `shape: "sao-troi"` (sao ba lớp trôi lên) | https://uiverse.io/jaykdoe/tasty-dragon-12 | jaykdoe | `.cv-troi`, `shapes.tsx` |
