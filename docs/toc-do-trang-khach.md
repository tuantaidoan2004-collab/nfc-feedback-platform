# Tốc độ trang khách (lát E6, E9 — 26/09/2026)

**Đo thế nào:** `scripts/measure-guest.mjs` — Chrome thật, 4G chậm (RTT 150 ms, 1,6 Mbps xuống), CPU chậm 4 lần, bộ nhớ
đệm trống, màn hình điện thoại. Mọi lệnh ghi được trả lời giả trong trình duyệt, nên đo production không ghi lượt ghé
nào. "Dùng được" = mốc trang có `data-ready` (sao và nút góp ý hoạt động). Ngưỡng "tốt" của Google: LCP < 2,5 s, CLS < 0,1.

## Production (bảy shop, 26/09)

| | LCP | CLS | Dùng được | Tải |
|---|---|---|---|---|
| YOUR SHOP (template 1, ảnh nền mặc định 61 KB, sau E9) | 0,9–1,1 s | 0 | 2,2–2,4 s | 239 KB |
| Fluty (template 1, ảnh poster) | 1,1–1,9 s | 0 | 2,1–2,4 s | 220 KB |
| Năm template còn lại | 0,6–1,3 s | 0 | 1,9–2,6 s | 176 KB |

Mọi trang "tốt". JS ~153 KB (nén) là phần lớn nhất — phần lớn là React/Next; giảm thêm là việc lớn, chưa đáng.
Trang khách không tải trước hai trang pháp lý (bớt ~8 KB và hai request lúc khởi động).

## Video: chỉ ở poster (Tài 26/09)

**Nền trang không bao giờ là video.** Video cắt vào khung điện thoại vừa nặng vừa mất nét; chiều sâu và chuyển động của
nền đến từ thiết kế của template (ảnh hero, gradient, hạt — đợt cải tổ UI/UX). Video chỉ ở **poster**, như một quảng cáo:

- **Lúc chủ quán tải lên:** trình duyệt nén về **720p (cạnh ngắn), ~1,5 Mbps** trước khi gửi (`lib/client/shrink-video.ts`)
  — một phút ≈ 11 MB. Không giới hạn độ dài; nén mất khoảng bằng độ dài clip, cần giữ tab mở. Trình duyệt không ghi được
  MP4 (Firefox) thì gửi bản gốc. Trần server 50 MB.
- **Lúc khách mở trang:** video poster không nằm trong HTML đầu; gắn sau khi trang tải xong và tải dần như YouTube; máy
  tiết kiệm dữ liệu thì không tải. Lúc chờ là ảnh khung đầu. Lý do đo được: một video 3,1 MB nằm trong HTML đầu bị xin
  ngay lúc đọc HTML và chia 4G với JS — trang dùng được ở 2,5 s; hoãn đến sau khi tải xong còn 2,0 s.
- **Trang phát hành trước 26/09 có video nền:** trang khách chỉ hiện ảnh khung đầu; lần lưu hay phát hành kế tiếp đổi hẳn
  nền thành ảnh đó.
