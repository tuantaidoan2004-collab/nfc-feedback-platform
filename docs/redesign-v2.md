# Làm lại trang khách và dashboard — thiết kế — 2026-09-17

Tài chốt trong buổi brainstorm 17/09, dựa trên hai ảnh trang review (tràn màn hình và dạng thẻ), ba màn dashboard (Dữ liệu · Thiết kế giao diện · Sản phẩm & link) và một video nền. **Chưa có code.** Mục "Còn phải chốt" ở cuối file vẫn đang để mở.

## Quyết định

| Chủ đề | Chốt |
|---|---|
| Khuôn nhân bản | **Một shop khuôn riêng, tên trung tính "YOUR SHOP"**, chỉ dùng để nhân bản. Nút Tạo shop sao chép **cấu hình** của khuôn, không bao giờ sao chép dữ liệu. `caphe-demo` (thật ra là 4Rau Barbershop) là một shop bình thường, không phải khuôn |
| Thêm bàn | **Một trang, nhiều thẻ.** Mỗi bàn là một thẻ `/t/<mã>` có nhãn. Sửa nút một lần là áp cho mọi bàn; số liệu tách theo bàn ở mục "Nguồn thẻ" |
| Dashboard | **Theo mẫu, không tùy biến.** Ba tab và ô chuyển shop, giống nhau cho mọi shop. Phần tùy biến nằm ở trang khách |
| Bố cục trang khách | Hai lựa chọn: **tràn màn hình** (đang có) và **dạng thẻ** (gọn hơn) |
| Google | **Luôn là nút nổi bật nhất**, có chữ nhấn như bản cũ. Không điền sẵn số sao (chốt 17/09) |
| Phản hồi riêng | Nút **luôn hiện**, **gửi được khi chưa chấm sao**. Cần đổi API: hiện API trả `RATING_REQUIRED` |
| Video nền | File mp4 Tài gửi (720×1280, 20 giây, H.264, 3 MB). Tạm đặt trong mã nguồn làm nền mặc định của khuôn cho tới khi có R2 |
| QR | Không làm |

## Hành vi trang khách v2

1. **Thứ tự:** poster (nhãn "POSTER SỰ KIỆN") → logo tròn đè lên mép poster → tên thương hiệu → câu hỏi → 5 sao → **nút Google** → nút phản hồi riêng → hàng nút mạng xã hội (Instagram, Facebook, Zalo, Liên hệ, link).
2. **Chấm 4–5 sao:** không có gì thay đổi. Nút Google vẫn là trọng tâm.
3. **Chấm 1–3 sao:** trang tự cuộn tới nút phản hồi riêng và **mở rộng** nó thành một khung riêng gồm hai ô: "Điều bạn muốn chia sẻ" (chủ đề) và "Góp ý của bạn".
4. **Chạm ra ngoài khung:** khung thu gọn lại thành nút "Gửi góp ý riêng cho quản lý". Bấm nút lại thì khung mở ra.
5. **Gửi xong:** hiện popup cảm ơn kiểu 3D nảy (giống hiệu ứng trên Canva) kèm pháo giấy. Dự kiến dùng `canvas-confetti` (MIT, nhỏ); popup chỉ cần CSS. Người đã bật "giảm chuyển động" thì bỏ hiệu ứng, chỉ hiện chữ cảm ơn.
6. **Bấm Google:** khách rời sang Google như hiện tại.
7. **Về sau:** khi khách đã xong phần đánh giá **nội bộ**, trang chuyển sang một màn "Cảm ơn quý khách", rồi trở lại bình thường khi hết phiên 15 phút.
8. **Chuyển động:** video nền chạy lặp, không tiếng, phát trực tiếp trong trang (`playsinline`). Có ảnh tĩnh thay thế khi iPhone ở chế độ tiết kiệm pin; có chế độ tĩnh cho người đã bật "giảm chuyển động".

### Hai giới hạn đã nêu với Tài

- **Không thể biết khách đã đăng review Google hay chưa.** Google không gửi tín hiệu nào về. "Đánh giá xong" chỉ có thể là đánh giá **nội bộ** (sao và góp ý). `AGENTS.md` cấm suy ra việc khách đã review Google.
- **Nguyên tắc gốc:** điểm thấp được mở phản hồi riêng **nhưng không được giấu Google**. Nếu tự cuộn làm nút Google trôi khỏi màn hình ngay lúc khách chấm 1–3 sao, thì đó chính là dẫn khách chê ra khỏi Google, tức "review gating" mà Google cấm (hình phạt là xoá review của quán). Xem mục "Còn phải chốt".

## Dashboard mới

Theo ảnh mockup. Khung chung gồm logo NFC Feedback, ô "Shop đang xem" (một tài khoản quản nhiều shop) và ba tab.

- **Dữ liệu:** thẻ số lớn (lượt mở, phiên, đã chấm sao), biểu đồ 7 ngày vẽ bằng CSS (không thêm thư viện), Nguồn thẻ theo nhãn. Danh sách góp ý và xử lý giữ như hiện tại. Nút tải JSON/CSV **chỉ dành cho chủ shop**.
- **Thiết kế giao diện:** bố cục (tràn/thẻ), poster, logo, nền (màu, gradient, video), watermark, âm thanh popup (sau), nút và đường dẫn. Có Lưu nháp · xem trước đúng bản sẽ phát hành · Phát hành. Tầng thư viện (`PublishingAdmin`: nháp, xem trước, phát hành) đã có sẵn.
- **Sản phẩm & link:** sửa nút và link; tự tạo thẻ cho bàn mới (có nhãn), lấy link `/t/<mã>` để ghi vào NFC; kích hoạt thẻ (`prepared → tested → active`). **Giá tính theo thẻ active**, nên giao diện phải báo trước chi phí khi kích hoạt.
- **Công tắc hỗ trợ 4 vị trí** (xem `commercial-model.md` mục 8) nằm trong dashboard; chỉ vai `owner` gạt được.

## Cần đổi schema (có version)

- `layout`: thêm `card`.
- Icon: thêm `facebook`, `phone`. Link `tel:` cho nút Liên hệ; hiện `url()` chỉ nhận `https:`.
- Phản hồi riêng không cần sao trước: đổi API và cách đếm số liệu (một phiên có góp ý nhưng không có sao).
- Shop khuôn: đánh dấu một shop là khuôn; Tạo shop sao chép bản phát hành đang chạy của khuôn.
- Công tắc 4 vị trí: migration mới, chỉ thêm, giữ nguyên lịch sử của migration 008.

## Thứ tự lát

| Lát | Nội dung |
|---|---|
| A | Shop khuôn "YOUR SHOP", Tạo shop sao chép từ khuôn, video nền mặc định |
| B | Trang khách v2: hai bố cục, nút mới, phản hồi riêng không cần sao, khung mở/thu gọn, popup cảm ơn |
| C | Dashboard mới: khung, ô chuyển shop, tab Dữ liệu |
| D | Tab Thiết kế giao diện và công tắc 4 vị trí |
| E | Tab Sản phẩm & link: nút, thẻ theo bàn, kích hoạt thẻ |

Tải ảnh và video riêng cho từng shop cần **Cloudflare R2**; đó là việc Tài còn treo.

## Còn phải chốt

- Khi khách chấm 1–3 sao, cuộn tới mức nào: vẫn **giữ nút Google trong màn hình** (đề xuất), hay cuộn hẳn tới khung góp ý?
