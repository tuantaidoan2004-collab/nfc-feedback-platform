# Quyết định dự án NFC — 2026-09-09

## Mục tiêu đã xác nhận

Bán thẻ NFC cho shop; mở trang thương hiệu để khách chia sẻ trải nghiệm và chủ shop hiểu những điều doanh số, camera hoặc truyền miệng chưa giải thích được. Khoảng 100.000đ/shop/tháng là giả thuyết giá, chưa kiểm chứng. Chủ dự án tự lo kế hoạch bán hàng.

## Đã chốt

- Trang mobile có logo, ảnh/event shop chọn, tên shop, nút Google Maps, Zalo OA, Instagram và các link tùy chỉnh. Bỏ slogan trang trí.
- Một lần chấm sao ghi nhận ngay, không cần gửi chữ hoặc bấm Google. Đổi sao của cùng trải nghiệm cập nhật bản ghi cũ, không cộng thêm lượt.
- Mời Google giống nhau ở mọi mức sao và vẫn cho truy cập trước khi chấm. 1–3 sao mở thêm góp ý riêng; khách 4–5 sao cũng có thể gửi riêng. Đã bỏ phương án chỉ mời nhóm 4–5 sao lên Google.
- Sao nội bộ không phải sao Google. Bấm Google không đồng nghĩa đã đăng review.
- Copy: “Thật tuyệt nếu nhận được đánh giá của bạn trên:” → nút Google Maps kèm biểu tượng → “Chúng tôi sẽ rất cảm kích nếu nhận được đánh giá Google của bạn.”
- Tiếng Việt mặc định; bộ chọn “Ngôn ngữ / Language” chỉ có Tiếng Việt và English. Không tự nhận diện máy, không dịch AI từng lượt. Có thể đổi mặc định khi chủ yêu cầu.
- Góp ý mẫu barbershop: thời gian chờ, chất lượng cắt tóc, thái độ phục vụ, không gian/vệ sinh, khác. Bỏ “Ý tưởng / Mong muốn”, để phát triển sau.
- Dashboard và dữ liệu riêng cho mỗi shop, cần đăng nhập/phân quyền thực sự khi triển khai.
- Làm từng bước theo first principles, mô phỏng nhanh rồi cùng xem trước khi setup phức tạp.
- Trí nhớ theo nhu cầu: đọc lại checkpoint/Obsidian khi thiếu bối cảnh; chỉ hỏi phần còn thiếu. Không đồng bộ NFC hằng ngày.

## Đã làm

Mô phỏng hai ngôn ngữ và hai góc nhìn dùng chung dữ liệu tạm: trang khách, dashboard chủ. Có cập nhật sao cùng bản ghi, gửi riêng, trạng thái xử lý và ghi chú nội bộ. Ba bản ghi mẫu không phải dữ liệu khách thật. 4Râu là ví dụ; ảnh và logo còn placeholder.

## Chưa chốt / chưa triển khai

- Dashboard mới được đề xuất: số lượt chấm, điểm trung bình nội bộ, góp ý chưa xử lý, số bấm Google, nguồn thẻ, thời gian và ghi chú. Chờ chủ đánh giá.
- Nhận diện cùng trải nghiệm khi khách quay lại; khi nào lượt ghé mới tạo bản ghi mới. Mã ẩn danh trình duyệt mới là đề xuất và không nhận diện chắc qua máy khác/xóa dữ liệu.
- Tên repo GitHub, tên thương hiệu, shop pilot và tài nguyên được phép sử dụng.
- Stack, database, đăng nhập, chi phí và hosting; Next.js/TypeScript/Vercel/Neon mới được thảo luận. Không tự mua hoặc coi như đã setup.
- Chủ tự sửa trang hay yêu cầu Tài tùy chỉnh.
- AI, gói giá, thanh toán và nhiều chi nhánh chưa thuộc phạm vi đã chốt.

## Khôi phục bối cảnh

Ghi chú chuẩn trong Obsidian: `20 Work/Projects/NFC Branded Feedback Platform.md`.
Task gốc: `01a08505-b525-7631-a2dd-839b3e49846e` (Hiểu dự án NFC card).
Chat tham khảo: `6a9fa1c3-c934-83ec-9b65-37a6783357fc` (Vercel làm được gì).
Chính sách Google đã tra: https://support.google.com/contributionpolicy/answer/7400114?hl=en

## Cập nhật 2026-09-09 — nền GitHub và kiến trúc

- Tài xác nhận tên `nfc-feedback-platform`, repo private đã tạo trong tài khoản `tuantaidoan2004-collab`.
- Tài là chủ dự án; Codex đảm nhiệm kiến trúc. Vercel là nơi chạy mục tiêu, cần đường chuyển khi chi phí hoặc vận hành không phù hợp.
- Thiết kế MVP hiện nằm tại `docs/mvp-architecture.md`; công nghệ đề xuất được phân biệt với hạ tầng đã triển khai.
- Không cập nhật lại Obsidian trong bước này theo yêu cầu Tài.

## Cập nhật 2026-09-10 — bắt đầu app local

- Tài yêu cầu bắt đầu bước app local/CI; thêm hiệu ứng nút góp ý khi chấm 1–3 sao: phồng lên/thu lại, màu đậm hơn lúc phồng.
- Lựa chọn triển khai: ba nhịp, dừng khi chấm 4–5 hoặc bấm nút; tôn trọng giảm chuyển động. Google vẫn giữ nguyên lời mời/vị trí ở mọi điểm.
- App giai đoạn đầu dùng dữ liệu demo trên trình duyệt, chưa có auth/database hay deploy. LocalStorage là công cụ thử giao diện, không phải kiến trúc lưu dữ liệu production.

## Cập nhật — skill cho agent

- Tài yêu cầu áp dụng `rohitg00/agentmemory` và `addyosmani/agent-skills` vào dự án.
- Tích hợp skill ở phạm vi project; hướng dẫn sử dụng và nguồn phiên bản tại `docs/agent-skills.md`.
- Quy tắc trí nhớ theo nhu cầu vẫn giữ nguyên. Chưa cài memory engine/MCP; dùng checkpoint và Obsidian hiện có, không thu thập hội thoại tự động.
