# Kiến trúc MVP — Vercel trước, có đường chuyển

Ngày thiết kế ban đầu: 2026-09-09; cập nhật đặc tả 2026-09-11. Neon development và migration 001_core đã có theo checkpoint. Các phần khác bên dưới là thiết kế mục tiêu, không phải xác nhận đã triển khai. Đặc tả vòng đời mới tại [platform-lifecycle.md](platform-lifecycle.md) ưu tiên khi khác mô hình sơ bộ bên dưới.

## Quyền sở hữu và phân công

- Tài là chủ sản phẩm: giữ tài khoản GitHub, domain, billing, dữ liệu; quyết định kinh doanh, ngân sách và thời điểm phát hành.
- Codex đảm nhiệm kiến trúc và triển khai trong task: thiết kế, code, kiểm thử, review thay đổi và báo rõ giới hạn. Không phải nhân sự vận hành trực 24/7.
- GitHub private `tuantaidoan2004-collab/nfc-feedback-platform` là nguồn mã và lịch sử thay đổi. Mọi cấu hình có thể tái tạo nằm trong repo; bí mật nằm ở môi trường triển khai, không commit.
- Obsidian đã có checkpoint; không cập nhật thêm ở bước này theo yêu cầu. Quyết định mới được lưu trong repo.

## Các phần chạy ở đâu

| Phần | Chọn cho MVP | Cách giữ khả năng chuyển |
|---|---|---|
| Web khách, dashboard chủ, API | Một ứng dụng Next.js + TypeScript, Node.js runtime trên Vercel | Có bản chạy Node/Docker; logic nghiệp vụ không gọi SDK Vercel trực tiếp |
| Database | Neon PostgreSQL, tài khoản chủ quản lý trực tiếp | SQL migrations và kết nối PostgreSQL chuẩn; export/restore sang Postgres khác |
| Logo, ảnh bìa/event | Cloudflare R2 Standard | API tương thích S3; lưu object key trong DB, host ảnh qua cấu hình |
| Domain của thẻ | Domain thuộc tài khoản Tài; DNS độc lập với nơi chạy, đề xuất Cloudflare DNS | URL thẻ dạng `https://<domain-cua-ban>/t/<tag-id>` không đổi khi chuyển hosting |
| Đăng nhập chủ | Thư viện auth hỗ trợ Node/Postgres, session lưu DB; ưu tiên thử Auth.js với Google OAuth | Giữ định danh người dùng/quyền shop trong DB; xác minh phiên bản và hỗ trợ trước khi tích hợp |
| Email/thông báo | Chưa cần cho bản kiểm chứng đầu; chủ xem trong dashboard | Nếu cần reset/alert email thì thêm nhà cung cấp qua adapter, không nhúng vào logic feedback |

Tên miền trên đây chỉ là mẫu, chưa có domain thật. Không ghi URL `*.vercel.app` lên lô thẻ dùng lâu dài.
Một shop không tương ứng một project Vercel hoặc database riêng. Nhiều shop dùng chung ứng dụng và database, dữ liệu được phân quyền theo shop.

## Luồng khách

1. Chạm NFC → domain của Tài → tìm tag đang gắn với shop → lấy trang thương hiệu.
2. Ảnh công khai tải trực tiếp từ domain ảnh nối R2, tránh đi vòng qua API Vercel.
3. Chấm sao → API kiểm tra tag, token trải nghiệm, dữ liệu → upsert đánh giá trong PostgreSQL.
4. Cùng trải nghiệm chấm lại thì cập nhật, không tạo thêm bản ghi. Cần chống yêu cầu cũ ghi đè yêu cầu mới khi mạng chậm bằng revision/kiểm soát thứ tự.
5. Góp ý riêng là thao tác gửi chủ động; mở form ở điểm thấp không ảnh hưởng lời mời/nút Google, vốn giữ cùng vị trí và độ nổi bật ở mọi điểm.
6. Tiếng Việt mặc định; bộ chọn thủ công Việt/English dùng bản dịch sẵn. Không gọi dịch AI.

Phân biệt `page_visit`, `experience`, `rating`, `feedback`, `google_link_click`. Mỗi lần tải/tải lại có visit mới; chỉ tương tác mới tạo experience, đổi sao cùng lần mở cập nhật cùng experience. Website ghi nhận mở trang theo URL tag; không khẳng định mỗi lần mở là một lần chạm NFC vật lý, một người duy nhất hay review đã đăng Google.

## Luồng chủ và cấu trúc dữ liệu

Chủ đăng nhập → kiểm tra membership → chỉ truy xuất shop được cấp quyền. Cache dashboard/private API luôn private/no-store, không dùng cache public của trang khách.

Mô hình chi tiết đề xuất tại [platform-lifecycle.md](platform-lifecycle.md): `shops`, memberships, template versions, page drafts/releases, tags, preview sessions, page visits và experiences. Dùng tên `shops` theo migration hiện tại thay cho tên `businesses` trong bản phác thảo cũ. Schema hiện vẫn gộp rating/feedback/note trong experiences; việc tách bảng không được coi là đã triển khai.

Editor giai đoạn đầu chỉ dành cho Tài. Dashboard chủ shop tập trung xem/lọc/xuất/xử lý, không chỉnh template. Workflow quản trị: tạo shop → slug → template/version → tài nguyên/link → preview/test → publish → tag → test → kích hoạt. Bản publish bất biến và dữ liệu preview tách khỏi live theo thiết kế mới.

## Riêng tư và kiểm thử bắt buộc trước pilot

- Backend xác thực membership; không tin business_id do trình duyệt tự gửi. Kiểm tra cả đọc, ghi, thống kê và tải ảnh.
- PostgreSQL RLS là lớp bổ sung, chỉ đáng tin khi app dùng role không bypass RLS và context theo transaction an toàn với connection pool. Migration role riêng, không dùng quyền superuser cho app.
- Thử owner A đọc/sửa feedback shop B: phải bị từ chối; thử user chưa đăng nhập không xem được dashboard.
- Token trải nghiệm là ngẫu nhiên và kiểm tra phía server; khách không sửa đánh giá của người khác bằng đổi ID.
- Giới hạn tần suất ghi, kiểm tra độ dài/range, xử lý XSS, kiểm tra link chỉ http/https phù hợp, bảo vệ thao tác có session.
- Preview/dev dùng DB và bucket riêng; không trỏ vào dữ liệu khách production.
- Bản ghi rating chỉ báo đã lưu khi server xác nhận. Network retry không tạo bản ghi trùng; yêu cầu đến sai thứ tự không đảo điểm mới thành cũ.
- Backup dữ liệu và kiểm tra restore thật trước nhận dữ liệu trả tiền. Không coi lịch sử Git là backup database.

## Ảnh và chi phí

Ban đầu Tài tải bộ ảnh đã tối ưu; ảnh event/logo công khai đặt trong bucket media riêng. Ảnh upload tương lai cần giới hạn dung lượng/định dạng, xác minh MIME, tạo kích thước phù hợp và bỏ metadata không cần thiết.
Giữ vài kích thước ảnh cố định và cache tên ảnh có phiên bản. Tránh tạo biến thể ảnh vô hạn hoặc tối ưu lại mỗi request. Không cache phản hồi riêng tư với ảnh công khai.

Mức tham khảo tra ngày 2026-09-09, cần kiểm tra lại lúc đăng ký:
- Vercel Pro: nền $20/tháng gồm 1 deploying seat và $20 usage credit; vượt các mức đi kèm vẫn phát sinh usage. Không phải $20 cho mỗi shop.
- Neon Free phù hợp phát triển trong hạn mức; Launch tính theo sử dụng, $15/tháng là mức “typical spend” minh họa, không phải giá cố định/cam kết.
- R2 Standard: free tier 10 GB-month, 1 triệu Class A và 10 triệu Class B mỗi tháng; ngoài hạn mức tính tiền lưu và thao tác. Egress trực tiếp miễn phí, không có nghĩa mọi dịch vụ nối thêm đều miễn phí.
- Domain gia hạn riêng; phí phụ thuộc tên/TLD/registrar. Không giả định được tặng .com.
- Chưa chốt ngân sách production. Không bật nâng gói hoặc dịch vụ phát sinh tiền ở bước kiến trúc.

Cảnh báo chi phí và ngưỡng tạm dừng là hai việc khác nhau. Vercel Spend Management không tự dừng nếu chỉ đặt cảnh báo; tùy chọn pause ảnh hưởng production và cần cân nhắc tính liên tục. Ngưỡng này không bao trọn hóa đơn Neon/R2/domain. Không hứa hóa đơn được chặn tuyệt đối theo thời gian thực.

## Đường chuyển khỏi Vercel

Từ đầu giữ app Node.js chuẩn, SQL migrations, database bên ngoài, media bên ngoài, domain riêng và config môi trường. Không thêm Vercel KV/Blob/Queues chỉ vì tiện khi MVP chưa cần.
Trước production phải chứng minh cùng mã chạy bằng Node hoặc Docker ngoài Vercel; không chỉ ghi “portable” trong tài liệu.

Khi cần chuyển: dựng bản Node/Docker ở nơi mới → nối DB/R2 hiện có → thử login, tag, ghi sao, quyền riêng tư, ảnh và cache → đổi DNS → theo dõi → giữ bản cũ đủ để rollback. Chuyển database là dự án riêng có backup/restore/cutover; không bắt buộc chuyển cùng hosting.
Khả năng chuyển không đồng nghĩa tự động failover hoặc không downtime. Nếu muốn tính sẵn sàng cao hơn, cần ngân sách và kế hoạch riêng.

## Lộ trình làm thật

1. Nền GitHub: repo private, checkpoint, kiến trúc, PR template và cách kiểm tra/rollback.
2. App local: Next.js/TypeScript được pin phiên bản, trang khách hai ngôn ngữ, chạy được và có lockfile; thêm CI lint/typecheck/build + các test theo behavior.
3. DB/auth: migration, một shop mẫu, tag, ghi/cập nhật sao, dashboard và kiểm thử cách ly hai shop.
4. Media/preview: R2, ảnh tối ưu, preview Vercel dùng dữ liệu thử, URL domain thật khi có domain.
5. Pilot: backup/restore, giới hạn abuse/chi phí, log không lộ dữ liệu, test Node/Docker và rollback; chủ duyệt trước production.

Chưa cần microservices, VPS tự quản, AI insight, notification/SMS, billing tự động hoặc analytics toàn diện.

## Nguồn

- https://nextjs.org/docs/app/guides/self-hosting
- https://vercel.com/docs/plans/pro-plan
- https://vercel.com/docs/spend-management
- https://neon.com/pricing
- https://developers.cloudflare.com/r2/pricing/
- https://developers.cloudflare.com/r2/get-started/
