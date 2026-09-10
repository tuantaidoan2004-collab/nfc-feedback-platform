# Ranh giới server và dữ liệu shop

## URL và trách nhiệm

- `/<shop>`: trang khách công khai, ví dụ `/A`, `/B`.
- `/ZZZ/<shop>`: dashboard riêng, cùng ứng dụng; mỗi lần đọc/ghi đều kiểm tra phiên server và membership. `ZZZ` không phải mật khẩu.
- `/api/shops/<shop>/experience`: tạo/lấy trải nghiệm của cookie, ghi sao/góp ý vào PostgreSQL. Không trả ghi chú nội bộ hoặc danh sách khách.
- `/api/owner/<shop>`: đọc phân trang và cập nhật xử lý/ghi chú, chỉ owner đúng shop.
- Next.js/Node (Vercel hoặc nơi khác) chạy trang và API. Neon PostgreSQL lưu bản ghi và cấu hình; không lưu/chạy mã dashboard.
- R2 lưu file ảnh/video. DB chỉ lưu object key và loại media; trình duyệt tải qua `MEDIA_PUBLIC_ORIGIN`, video chỉ tải khi người dùng xem. Chưa có upload R2 hoặc xử lý/transcode video.

Khách chấm ở `/A` vẫn ở `/A`; chủ mở/làm mới `/ZZZ/A` để thấy dữ liệu đã lưu. Chưa có push realtime.

## Cơ chế đã có trong mã

- Migration `db/migrations/001_core.sql`; chạy bằng `node scripts/migrate.mjs` trên DB development riêng, không tự chạy khi request tới.
- Bật bằng `SERVER_DATA_ENABLED=true`, `DATABASE_URL`, `APP_ORIGIN`; không có DB thì báo không sẵn sàng, không chuyển sang lưu localStorage.
- Token trải nghiệm ngẫu nhiên nằm trong cookie HttpOnly; DB chỉ lưu hash. Unique theo shop/token. Thời gian cookie 30 ngày là lựa chọn tạm của bản development, chưa phải quy tắc nhiều lần ghé.
- Ghi rating/góp ý dùng revision có điều kiện; request cũ bị 409, không ghi đè điểm mới. Trình duyệt tuần tự hóa thao tác và chỉ xác nhận lưu khi server trả thành công. Sau lỗi không rõ đã lưu hay chưa, tải lại để lấy revision thực tế.
- Các truy vấn dùng tham số. Owner API lọc shop_id cả đọc và ghi; phiên hết hạn/không có quyền bị từ chối. Phản hồi riêng tư no-store.
- Có hai test PostgreSQL bổ sung: hai shop, hai trình duyệt, lưu qua server, reload, không lộ private data, cross-shop, Origin sai và revision cũ.

## Chưa được coi là sẵn sàng pilot

Chưa kết nối Neon thật; máy hiện tại chưa có PostgreSQL. CI dùng PostgreSQL 17 tách biệt. Chưa có nhà cung cấp đăng nhập hoặc màn hình login: bảng session/membership và kiểm tra quyền đã có, test tạo phiên trong DB test. Không có endpoint login giả hoặc khóa mặc định. Chủ chưa thể tự đăng nhập bản thật cho đến bước nối auth.

Chưa có rate limit dùng chung, RLS role deployment, retention/xóa dữ liệu, backup/restore, chống tạo trải nghiệm hàng loạt, cấu hình onboarding/link tùy chỉnh cho shop, hoặc upload R2. Không bật `SERVER_DATA_ENABLED` trên môi trường công khai trước khi hoàn thành các phần này. Không dùng cookie 30 ngày như nhận diện chắc chắn một người hay một lần ghé.

Bản demo cũ tại `/t/demo` và `/demo/dashboard` vẫn chỉ dùng trình duyệt để xem UI, không đại diện cho dữ liệu server.

## Nguồn kỹ thuật

- https://node-postgres.com/features/queries
- https://nextjs.org/docs/app/api-reference/file-conventions/route
- https://developers.cloudflare.com/r2/objects/
