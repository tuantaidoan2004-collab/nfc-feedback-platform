# PRODUCT.md — nền tảng này phục vụ ai, làm gì cho họ

Tệp này trả lời **ai dùng và để làm gì**. `DESIGN.md` trả lời **nó phải trông như thế nào**. `AGENTS.md` trả lời
**xây bằng cách nào**. Công cụ thiết kế và agent đọc cả ba trước khi động vào giao diện.

## Sản phẩm

Khách chạm thẻ NFC ở quán → mở trang của quán đó → thấy lời mời đánh giá Google **giống hệt nhau với mọi khách**,
và **thêm** một đường góp ý riêng cho quán. Không chọn lọc khách, không đổi quà lấy đánh giá.

Nền tảng: web, Next.js, không có ứng dụng cài đặt.

## Ba người dùng, ba hoàn cảnh khác hẳn nhau

### 1. Khách của quán — người quan trọng nhất, và người mình không bao giờ gặp

- Đang **đứng hoặc ngồi trong quán**, vừa uống xong, điện thoại một tay.
- Trên **4G, không phải wifi**. Máy có thể là Android rẻ ba năm tuổi.
- Ở lại trang **dưới ba mươi giây**. Không đăng nhập, không cài gì, không quay lại lần hai.
- Không biết nền tảng này tên gì và không cần biết.
- **Mặc định tiếng Việt.** Tiếng Anh chỉ khi tự đổi.

Trang phải làm được một việc trong ba giây đầu: cho họ thấy **họ đang ở đúng quán vừa ngồi**, và một nút đánh giá
Google không phải tìm.

### 2. Chủ quán — người trả tiền

- Chủ quán cà phê, quán ăn, spa, salon, bar. Phần lớn **không phải dân công nghệ**.
- Quyết định mua trong **mười giây** nhìn trang khách trên điện thoại của chính họ.
- Điều họ muốn: **thêm đánh giá Google**, và **biết khách phàn nàn gì trước khi khách viết lên mạng**.
- Không có thời gian thiết kế. Không có ảnh đẹp của quán mình. Không đọc hướng dẫn.
- Vào dashboard **vài lần một tuần**, trên điện thoại nhiều hơn máy tính.

Hệ quả thiết kế: **không đưa cho họ một khung vẽ trắng.** Đưa vài lựa chọn đã đẹp sẵn, để họ chọn chứ không thiết kế.

### 3. Người vận hành nền tảng (`/gov`) — hiện là Đoàn Tuấn Tài, một người

- Tạo shop, cấp link, **duyệt ảnh shop tải lên**, xem số liệu nền tảng.
- Làm việc này xen giữa việc khác, trên điện thoại cũng phải làm được.
- Là **nút cổ chai** nếu thiết kế bắt mọi thứ phải chờ người duyệt. Đừng thiết kế như vậy.

## Luật không đổi, bất kể giao diện

Chi tiết đầy đủ ở `docs/google-policy.md`; tệp đó **thắng mọi thứ**. Phần liên quan trực tiếp tới thiết kế:

1. **Lời mời Google giống hệt nhau với mọi khách.** Không hỏi sao trước rồi mới quyết định hiện gì.
2. **Nút Google nằm trong màn hình đầu**, có mặt trong HTML từ máy chủ, trước hydration và trước bất kỳ API nào.
3. **Góp ý riêng là kênh thêm, không phải kênh thay.** Nó không được nổi hơn nút Google.
4. Không gợi ý nội dung đánh giá, không nối ưu đãi với đánh giá, không chế độ máy của quán.

Ai đang đọc tệp này để thiết kế: bốn dòng trên **không phải sở thích**. Chúng có test chặn, và người chịu phạt
nếu phá là **chủ quán**, không phải nền tảng.

## Ranh giới hiện tại

- Production chạy từ 19/09/2026. **Chưa có shop thật, chưa ghi thẻ nào, chưa có khách thật nào.**
- Dữ liệu hành vi đã bắt đầu thu (migration 020) nhưng **chưa ai đọc**.
- Ảnh và logo shop tải lên **phải qua admin duyệt** trước khi lên trang (quyết định 22/09).
- Không có kênh email giao dịch, không có thanh toán tự động, chưa nối API Google.

## Cái gì làm khách bỏ đi

Xếp theo mức thiệt hại, đây là thứ thiết kế phải tránh trước khi lo đẹp:

1. Trang tải chậm trên 4G. Nền trang vì thế **không bao giờ là video** (Tài 26/09); video chỉ ở poster, nén 720p và chờ trang tải xong (`docs/toc-do-trang-khach.md`).
2. Nút Google phải cuộn mới thấy.
3. Chữ quá nhạt trên nền ảnh, đọc không ra dưới nắng.
4. Vùng chạm nhỏ hơn ngón tay.
5. Dấu tiếng Việt đặt sai trên tên quán in cỡ lớn — lộ ngay là hàng cẩu thả.
