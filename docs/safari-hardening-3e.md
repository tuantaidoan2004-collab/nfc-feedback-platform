# 3E-Safari — 2026-09-13

Kiểm chứng bằng **Safari branded26.6.2/macOS + safaridriver có sẵn**, W3C HTTP trên localhost. Không Playwright WebKit, giả lập iPhone hay dependency mới. Tái dùng source/env/schema local cô lập của3D; script mới integration-tests/safari-local.mjs, chạy `node integration-tests/run-local.mjs --safari`.

## macOS:7 nhóm critical path đạt

1. Public load tạo đúng1open,1session,0experience.
2. Rating5→2; Google link/copy không thay đổi, pulse low-score hoạt động.
3. Private feedback dùng chung experience/revision3, draft được xóa sau xác nhận. Response đã quan sát không echo message/topic/nội dung riêng.
4. Reload tạo open mới, giữ session/rating/feedback server.
5. Back/forward thật giữ session; **BFCache pageshow persisted=true và isTrusted=true**. Có visibilitychange hidden→visible thật, trusted. Snapshot DB sau lần Back đầu: load,reload,resume, không ghi đôi do pageshow+visibility.
6. Xóa storage giữ identity document hiện tại; reload tạo session mới, không mang điểm cũ sang.
7. Safari desktop resize390/768px: scrollWidth đúng viewport, không overflow. Đây không phải touch/iPhone.

Lượt đầu history bị Fast Refresh/full reload chen vào khi biên dịch /t/demo lần đầu. Harness prewarm route trước khi Safari gắn HMR; lượt sau history/BFCache đạt. Không sửa production code hoặc bỏ event hợp lệ. Không lặp pure/PG/Chromium suites/typecheck/lint/build vì production code không đổi.

Evidence chi tiết ở test-results/safari/evidence.json (ignored): phiên bản/platform, nhóm đạt, lifecycle events trusted/persisted, DB navigation kinds, viewport và blocker iOS. Không ghi browser secret/Authorization. Không đưa tên/UDID thiết bị vào checkpoint.

## iOS: thiết bị được thấy nhưng chưa có phiên

Yêu cầu driver chọn platformName=iOS, safari:deviceType=iPhone, safari:useSimulator=false. Driver báo **device is not paired**: có thiết bị kết nối được phát hiện, nhưng không thể tạo WebDriver session. Không biết thêm trạng thái unlock/trust ngoài lỗi pairing mà driver cung cấp.

Không tự pair/trust/đổi setting, không thay bằng simulator, không tuyên bố Safari iOS đạt. Chưa có touch, app background/kill hoặc layout thiết bị thật. Playwright WebKit runtime vẫn chưa cài và không được dùng.

Khi pairing đã xử lý, còn cần endpoint HTTPS local mà iPhone thật truy cập được; localhost trên iPhone không mặc nhiên là localhost của Mac. Chưa thiết lập tunnel/mạng/certificate hoặc dịch vụ ngoài trong lượt này.

## Mốc và giới hạn

Safari macOS critical path ở mức development đã đạt; đây là bổ sung cho mốc Chromium3E. BFCache visibility không thay cho chuyển app/background độc lập hay mobile kill. Memory-only/reload mất pending draft, yêu cầu vận hành/auth/tenant/abuse trước pilot vẫn giữ.

Không Neon/env thật/auth/R2/tag/dashboard/editor/deploy/commit. Dừng3E-Safari; phần iOS chờ pairing và đường truy cập test phù hợp, không tự mở lát sản phẩm tiếp.

Dọn cuối lượt:0schema test còn lại; Safari automation session/driver, Next và PostgreSQL đã dừng, dependency symlink đã tháo. Evidence chỉ là fixture local, không có dữ liệu khách thật.
