# Tốc độ trang khách (lát E6, 26/09/2026)

**Đo thế nào:** `scripts/measure-guest.mjs` — Chrome thật, 4G chậm (RTT 150 ms, 1,6 Mbps xuống), CPU chậm 4 lần, bộ nhớ
đệm trống, màn hình điện thoại. Mọi lệnh ghi được trả lời giả trong trình duyệt, nên đo production không ghi lượt ghé
nào. "Dùng được" = mốc trang có `data-ready` (sao và nút góp ý hoạt động). Ngưỡng "tốt" của Google: LCP < 2,5 s, CLS < 0,1.

## Production trước lát (bảy shop, mỗi shop hai lượt)

| Shop (khuôn) | LCP | CLS | Dùng được | Tải |
|---|---|---|---|---|
| YOUR SHOP `urr6ud` (standard, ảnh poster) | 1,2–1,5 s | 0 | 2,1–2,3 s | 229 KB |
| Fluty (standard, ảnh poster) | 1,2–1,4 s | 0 | 2,1 s | 229 KB |
| Bammy (minimal), Flassy (spotlight), Glassy (glass), Patty (deco), Googy (big-button) | 0,6–1,2 s | 0 | 1,9–2,5 s | 186 KB |

Mọi trang đã "tốt". JS 154 KB (nén) là phần lớn nhất; luồng chính nghẽn dưới 10 ms. Chưa shop nào trên production dùng
video nền.

## Rủi ro thật: video nền (đo trên máy, shop khuôn standard mặc định, video 3,1 MB, mỗi bên ba lượt)

Thẻ `<video preload="auto">` nằm trong HTML đầu, nên trình duyệt xin video ngay khi đọc HTML và chia 4G với JS.

| | Video bắt đầu tải | Video trong 3 s đầu | JS xong | **Dùng được** | LCP |
|---|---|---|---|---|---|
| Trước | 185 ms | 264 KB | 2,71 s | **2,52 s** | 0,72 s |
| Video gắn sau khi trang tải xong | 1,8 s | ~190 KB | 2,35 s | **2,00 s** | 0,71 s |
| + bỏ tải trước hai trang pháp lý | 1,8 s | ~200 KB | 1,77 s | **2,00 s** | 0,70 s |

Bước hai không làm trang nhanh hơn; nó bớt hai request (~8 KB) khách không cần. Ảnh tĩnh (khung đầu của video) hiện
suốt lúc chờ, nên khách không thấy khác gì ngoài việc nút bấm được sớm hơn. Máy bật "tiết kiệm dữ liệu" không tải video.

## Còn lại

- **Video chủ quán tải lên (tới 30 MB, Full HD / 4K):** Tài muốn chiều khách (26/09). Nhờ gắn sau khi tải xong, video to
  không làm chậm trang; nhưng khách vẫn tiêu 4G cho cả tệp. Lát riêng **E9** (`roadmap-slices.md`).
- **JS 150 KB** là phần còn lại của 2 giây; phần lớn là React/Next. Giảm thêm là việc lớn, chưa đáng khi trang đã "tốt".
- Video 3,1 MB mặc định chưa nén lại: máy không có `ffmpeg`, và `avconvert` có sẵn của macOS chỉ có preset cố định
  (bản 320 px vẫn 1,8 MB). Gộp vào E9.
