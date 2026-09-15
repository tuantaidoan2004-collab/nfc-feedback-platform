# Client3B.1 — identity và open lifecycle

Chỉ module độc lập; chưa nối ShopFeedback, React, API/Next HTTP hoặc database. Foundation15phút không đổi. localStorage là lựa chọn kỹ thuật chia sẻ token giữa reload/tab, không phải yêu cầu cấm cookie của Tài. Luôn phân biệt quyết định triển khai với chỉ dẫn chủ dự án.

`lib/client/browser-identity.ts`: CSPRNG32byte/64hex, key `nfc:browser-secret:v1`. Web Locks cùng origin bảo vệ thao tác đọc/tạo; chờ tối đa1.5giây rồi fallback memory. Không có Web Locks: dùng token hợp lệ đã lưu nếu có, nếu chưa có thì memory và không tranh ghi localStorage. Storage hỏng/bị chặn/ghi thất bại cũng trả trạng thái memory; không cần BroadcastChannel hoặc gửi secret qua channel. Memory có thể tách session giữa tab/reload, không được hiển thị như browser/person duy nhất. Crypto không khả dụng thì từ chối, không dùng nguồn ngẫu nhiên yếu.

Provider giữ một promise/token suốt document để không đổi credential của intent đang dở. Xóa storage không tự đổi token của document đang mở; document mới đọc/tạo lại. Storage dài hạn vẫn chịu rủi ro XSS cùng origin; chưa quyết định retention/rotation hay xem như owner auth.

`lib/client/open-lifecycle.ts`: core thuần inject UUID và adapter theo document. Initial load/reload/back_forward có key riêng; pagehide/visibility-hidden đánh dấu rời trang, pageshow persisted hoặc visible đầu tiên phát resume. Những tín hiệu còn lại cùng boundary không tạo key mới. Không dùng thời gian browser để chọn session15phút. Remount/subscribe/retry nhận cùng key; future transport bắt buộc dedup theo key, vì subscriber mới nhận snapshot hiện tại. Document listeners tồn tại cùng document, không đăng ký unload và không tạo theo React effect. Re-entry SPA cùng document chưa xử lý trong lát này.

Nguồn: [Web Locks](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API), [pageshow](https://developer.mozilla.org/en-US/docs/Web/API/Window/pageshow_event).

## Bằng chứng

6 test đạt:3 unit và3 test trên Chrome/Chromium thật với profile riêng, HTTP HTML local. Kiểm chứng hai tab trống storage đồng thời, token qua reload, storage xóa/chặn, thiếu Web Locks/BroadcastChannel; actual reload và key không trùng qua mô phỏng chuỗi pagehide/pageshow persisted/visibility. Typecheck/lint/diff đạt. BFCache/visibility events trong test cuối là synthetic, không phải chứng minh BFCache restore thực. Chưa WebKit, React StrictMode tích hợp, Next HTTP hoặc DB. Không chạy lại foundation/PG, không đọc secrets, không dependency mới/commit/deploy.

Lệnh: `pnpm exec playwright test --config=playwright.client.config.ts` (Chrome đã cài). Worktree chưa có node_modules; lần này liên kết tạm dependency có sẵn từ checkout gốc để kiểm tra, rồi bỏ liên kết; không cài thêm package.

Bước đề xuất3B.2: xây coordinator transport độc lập sử dụng identity+event key, retry original intent/visit, snapshot revision/conflict/expiry; chưa redesign. Cần test BFCache/visibility thực và React adapter trước khi tuyên bố không duplicate trong app. Chỉ thực hiện khi được giao tiếp.
