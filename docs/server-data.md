# Trạng thái mới nhất

APIv2 development đã chuyển sang session15phút (browser token chung, open event riêng); chưa nối UI hoặc bật trên dịch vụ thật. Các đoạn trước đó về token riêng document đã bị thay thế. Xem docs/visit-v2-api.md và docs/visit-rating-repository.md. Phần legacy bên dưới vẫn mô tả code đang phục vụ UI.

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

Theo checkpoint, Neon development Singapore đã kết nối và migration 001_core chạy thành công; không kiểm tra lại hạ tầng trong bước đặc tả 2026-09-11. CI dùng PostgreSQL 17 tách biệt. Chưa có nhà cung cấp đăng nhập hoặc màn hình login: bảng session/membership và kiểm tra quyền đã có, test tạo phiên trong DB test. Không có endpoint login giả hoặc khóa mặc định. Chủ chưa thể tự đăng nhập bản thật cho đến bước nối auth.

Chưa có rate limit dùng chung, RLS role deployment, retention/xóa dữ liệu, backup/restore, chống tạo trải nghiệm hàng loạt, cấu hình onboarding/link tùy chỉnh cho shop, hoặc upload R2. Không bật `SERVER_DATA_ENABLED` trên môi trường công khai trước khi hoàn thành các phần này. Không dùng cookie 30 ngày như nhận diện chắc chắn một người hay một lần ghé.

Bản demo cũ tại `/t/demo` và `/demo/dashboard` vẫn chỉ dùng trình duyệt để xem UI, không đại diện cho dữ liệu server.

## Nguồn kỹ thuật

- https://node-postgres.com/features/queries
- https://nextjs.org/docs/app/api-reference/file-conventions/route
- https://developers.cloudflare.com/r2/objects/

## Khoảng cách với đặc tả 2026-09-11

Code hiện tại gọi POST experience khi component mở và tái dùng cookie 30 ngày. Đây là hành vi cũ, chưa đáp ứng quyết định page_visit riêng mỗi lần tải và rating experience dùng chung session15phút. Schema legacy001 chưa có page_visits, tags, template versions, drafts/releases hoặc preview scope; không được suy luận đã có phân tách test/live từ việc lọc shop_id. Owner API hiện có phân trang, ghi chú/trạng thái; chưa có lọc nghiệp vụ, export hoặc editor Tài.

Thiết kế thay thế và cách chuyển tiếp nằm tại [platform-lifecycle.md](platform-lifecycle.md). Không sửa migration 001_core đã chạy; thay đổi schema tương lai phải dùng migration mới, giữ dữ liệu cũ có nhãn legacy, không tự bịa visit lịch sử.


## Repository v2 riêng — chưa nối runtime

Migration002 và lib/repositories/visit-ratings.ts đã được kiểm thử PostgreSQL local: visit theo lần mở, lazy rating experience và intent receipts. Xem docs/visit-rating-repository.md. Runner hiện tại vẫn chỉ áp dụng001; không chạy002 trên Neon. Các endpoint/cookie/UI mô tả ở trên vẫn dùng legacy, chưa thay đổi theo v2.


## API v2 development — chưa bật hoặc nối UI

Hai POST mới tại `/api/v2/shops/<shop>/visits` và `/api/v2/shops/<shop>/visits/<visitId>/rating` delegate sang handler token. Scope live cố định, server time, không cookie. Chỉ hoạt động khi NFC_VISITS_V2_ENABLED=true và NODE_ENV không phải production, đồng thời DB/APP_ORIGIN được cấu hình; chưa thiết lập các giá trị này. Migration002 mới chỉ test local. Chi tiết contract/test/giới hạn tại docs/visit-v2-api.md. Runtime UI và endpoint legacy vẫn chưa chuyển sang v2.
