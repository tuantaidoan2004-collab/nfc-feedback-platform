# Public client 3D — development integration

Ngày 2026-09-13. Phần mới nối `/<shop>` → document service/hook → Next APIv2 → PostgreSQL. Không đổi domain/repository/client coordinator đã kiểm chứng ở3C.4B.

## Gate và cách ly

- `server/visit-v2-runtime.ts` xuất một gate chung cho trang và API: **NODE_ENV=development** và **NFC_VISITS_V2_ENABLED=true**. Mặc định đóng, production luôn đóng kể cả flag true; chặt hơn non-production của foundation trước đó.
- Server chọn `ShopFeedbackV2` hoặc `ShopFeedback` legacy. Chỉ props shop công khai được truyền; không NEXT_PUBLIC flag/DB URI/secret trong props. Không cấu hình env thật trong lát này.
- `components/shop-feedback.tsx`, `/t/demo`, legacy endpoints và foundation giữ nguyên. Hai component cố ý tách để không gọi cả hai luồng hoặc trộn trải nghiệm cũ/v2. Markup/CSS hiện tại được giữ, chưa trừu tượng hóa template.
- Service được tạo sau hydration, sở hữu theo Document, hook subscribe/start idempotent; StrictMode không sinh thêm open. Không stop service theo unmount.

## Hành vi UI được chọn cho lát này

- Sao khóa đến khi open được xác nhận. Rapid rating giữ lựa chọn gần nhất khi đang lưu; số “đã lưu” chỉ lấy snapshot server. Xung đột hiển thị sao server, không tự ghi đè.
- Góp ý mở được ở mọi mức sao. Nút gửi chờ rating được xác nhận và mutation hiện tại kết thúc; có câu giải thích ngay trong form. Không xếp thêm feedback UI khi đang gửi. Đây là policy UI đơn giản cho MVP; core vẫn hỗ trợ buffer explicit feedback nhưng UI3D không sử dụng.
- Trong lúc gửi góp ý hoặc unknown outcome, khóa sửa nội dung/sao, giữ nguyên draft và cho retry chính intent cũ. Thành công xác định xóa ô nhập/topic. Conflict/expiry giữ draft để khách kiểm tra và chủ động gửi lại; không tự gửi qua phiên mới. Không coi gõ chữ là submission.
- Retry mutation và retry từng open pending tách biệt. Resume mới vẫn đăng ký qua open lane khi mutation cũ đang chờ. Cảnh báo context thay đổi được hiển thị; thông báo lỗi cũ không gắn sang open mới.
- Copy trạng thái VI/EN riêng, không hiển thị raw error code/secret. Không dùng copy “demo đã lưu” cho dữ liệu server.
- Google invitation, link và vị trí giống nhau ở mọi điểm. VI mặc định/English thủ công, pulse1–3/reduced motion, ảnh/video hero hiện tại giữ nguyên. Không đếm Google click/review hay KPI khác.

## Kiểm thử local tách biệt

`integration-tests/run-local.mjs` sao chép allowlist source vào thư mục tạm, loại mọi `.env*`. Env process được dựng riêng; không kế thừa DATABASE_URL/Neon/secret đang có. Cluster PostgreSQL18.4 localhost127.0.0.1:55439, role nfc_test, DB nfc_repo_test; schema `nfc_ui_test_<uuid>` tạo rồi drop. Đây chỉ là fixture đã dùng trước, không dữ liệu shop thật.

Hai Next dev trên3317(gate on)/3318(gate off), Chrome profile tạm của Playwright, chặn tài nguyên ngoài localhost. Build dùng bản sao dependency đã có (symlink ngoài project khiến standalone tracing không đóng gói được). Không install/lockfile change. Harness xóa copy/schema và dừng Next sau chạy; cluster được dừng riêng sau toàn lượt.

Chạy bằng Node hiện có, từ worktree với dependency tạm đã liên kết:

```
node integration-tests/run-local.mjs
node integration-tests/run-local.mjs --build-only
```

Harness cần cluster local fixture đang chạy; từ chối đổi DB/schema qua test env. `--build-only` build + prepare-standalone theo scripts dự án, rồi kiểm chứng production gate với flag cố ý true. Lần development không chạy test production; lần production chỉ chạy case gate đó.

9 case development đạt: initial1open/rapid5→2/sharedfeedbackrevision/reload; lost feedback response+retry idempotent; conflict do write HTTP khác; SESSION_EXPIRED+fresh action; unknown initial open; gate off legacy; demo không ghi DB; NextHTTP feedback trước rating bị từ chối; synthetic resume không giữ lỗi cũ. Snapshot/public responses không echo private feedback; DB kiểm tra dữ liệu thật trong fixture. Không lặp suite pure/repository đã đạt trước.

Ảnh Chrome390px đã xem; kiểm tra overflow320/768/1024/1440, VI/EN và reduced motion đạt. Test happy path không có pageerror. Không claim audit accessibility đầy đủ hoặc đo performance production.

## Giới hạn

- Memory-only: reload/crash có thể mất pending intent/draft. Retry trong document hiện tại không đồng nghĩa durable/offline delivery.
- Resume test phát pagehide/pageshow **mô phỏng**. Chưa kiểm BFCache thực, browser back/forward end-to-end, Safari/WebKit, mobile background/kill thật trong3D. Identity/multitab có bằng chứng lớp trước, chưa kiểm lại UI hai tab thực ở lát này.
- Development integration không phải pilot/production-ready; chưa auth owner, dashboardv2, rate limit/retention/policy production, Neon/R2/deploy.
- Form topic theo copy hiện tại; chưa phát triển taxonomy/editor. Không redesign.

## Kết quả cuối

9 development cases và1production gate case đạt. Typecheck/lint/diff đạt; Next build + prepare-standalone đạt. Lần đầu typecheck báo thiếu explicit null guard và lint nhận nhầm tên fixture `use`; đã sửa, không nới rule. Build kế tiếp vướng external dependency symlink ở standalone tracing; harness chuyển sang copy dependency nội bộ rồi build đạt. Chỉ kiểm lại case chịu ảnh hưởng/production gate, không chạy lại foundation suites.

Đã xác minh còn0schema `nfc_ui_test_*`, dừng cluster và Next, tháo dependency symlink worktree. Không commit/deploy hoặc dùng env thật.

Prompt kế tiếp đề xuất, cần Tài giao mới: “Đọc decisions.md và public-v2-integration.md. Rà độc lập kết quả3D, ưu tiên vòng đời UI hai tab/BFCache/Safari và trải nghiệm retry/draft; xác định phần nào bắt buộc trước pilot. Chưa mở rộng dashboard/auth/Neon/R2/deploy hoặc redesign khi chưa chốt lát tiếp.”

### Cập nhật kiểm chứng sau3D

3E đã kiểm BFCache/back-forward thật và hai tab trên Chromium; xem [browser-hardening-3e.md](browser-hardening-3e.md). Những mục “chưa kiểm” ở phần3D trên là trạng thái lịch sử của lát3D. Safari và visibility độc lập vẫn chưa kiểm chứng.
