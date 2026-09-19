# Astra — F-001/F-002 và rà quyền, 20/09/2026

Bản vá **`3b664a3`**, chờ Claude rà/tích hợp. Baseline `a129100`; nhánh `astra/setup-link-hardening`; worktree `/private/tmp/nfc-astra-setup-link-hardening`. Chỉ local, không đọc credential hoặc gọi Neon/R2/Vercel. Claude giữ tích hợp/deploy. Bản vá không có migration/dependency/UI.

## Bản vá

- **F-001:** `OwnerSetupLinks.write()` lấy advisory transaction lock theo tài khoản **trước** câu UPDATE; snapshot READ COMMITTED sau khi chờ thấy link vừa commit. Cả `/gov` reissue, tạo tài khoản, cấp link trong team dùng chung hàm này.
- **F-002:** `consume()` kiểm token và identity còn hiệu lực trước scrypt; chia sẻ slot KDF với owner login và changePassword. Thử lấy slot không chờ; bận trả `429 TOO_MANY_ATTEMPTS`, link không bị tiêu. Admin login giữ slot riêng, tránh owner flood chiếm cả cửa admin.
- Bucket riêng `setup-global` trong bảng limiter hiện có: tối đa 60 lần/phút, dùng chung database giữa các instance, đếm cả token không tồn tại. Từ chối được commit để không làm mất bộ đếm. Đây là giới hạn bảo vệ backend, **không thay cho A1 chống flood/IP tại ingress**: kẻ tấn công vẫn có thể làm người thật chạm ngưỡng. Không tin tuỳ tiện `X-Forwarded-For`.
- consume khóa identity trước account/token, kiểm lại token sau khi chờ và sau KDF; cập nhật mật khẩu, tiêu link, thu hồi phiên trong cùng giao dịch.
- `/gov/api/setup-links` đã có admin gate, origin, kiểm input, audit cùng giao dịch cấp link. Không chạy KDF. Việc kiểm lại admin khi revoke đồng thời cần một lát TOCTOU riêng.
- Admin login hiện có DB throttle và KDF slot riêng; kiểm đã giữ nguyên. Hai bootstrap nội bộ và hai hàm tài khoản khuôn preview vẫn gọi KDF ngoài slot: chưa thuộc cam kết giới hạn KDF cho mọi thao tác toàn hệ thống. Production template account đi nhánh setup link; rà preview/provisioning tiếp trước khi tuyên bố hardening hoàn chỉnh.

## Kiểm chứng và giới hạn

PostgreSQL 18 riêng `127.0.0.1:55449`, database `nfc_repo_test`, UTF8/en_US.UTF-8. Không dùng harness 3317–3319.

- Test F-001 đỏ trên baseline: link cũ vẫn inspect được; thêm khóa → 5/5 lần xanh, pool 3.
- Test F-002 đỏ: 3 token giả gọi scrypt 3 lần, consume vẫn thành công khi owner KDF slot đang bị giữ. Sau vá: 0 lần; 429 giữ nguyên link.
- Spec setup mở rộng: **12 passed**, gồm 6 consume đồng thời chỉ 1 thành công/1 scrypt, limiter giữ bộ đếm và hết hạn, đổi mật khẩu khi slot bận, admin lane độc lập.
- Theo dõi scrypt tại boundary `node:crypto`, luôn phục hồi trong finally; không bơm tải để thực sự làm cạn bộ nhớ.
- TypeScript `--noEmit --incremental false`, ESLint ba file thay đổi, `git diff --check`: exit 0.
- Kết quả bộ repository đầy đủ và contracts/client ghi khi xong bên dưới. Không tuyên bố đã chạy 7 bộ/Next HTTP/browser. Claude chạy đủ 7 bộ trên commit tích hợp như đã phân công.

## Phát hiện mới — chưa sửa trong bản vá này

### F-007 · Cao · Guard cấp link bỏ sót feedback_override

`lib/owner/team.ts:68` lấy permissions của role nhưng bỏ qua `feedback_override` của người bị tác động; `:152–156` trả token đặt mật khẩu toàn tài khoản sau guard đó. Quản lý có `members` mà không có `feedback` vẫn lấy được link của nhân viên có role rỗng nhưng được chủ bật `feedback_override=true`. Kẻ đó có thể đặt lại mật khẩu và đăng nhập thành người có quyền cao hơn.

**Đã tái hiện:** assertion mong `ROLE_ABOVE_YOU` bị đỏ vì nhận token. Đề xuất dùng quyền hiệu lực thống nhất với authorize() khi so sánh; đồng thời xử lý F-008, chỉ sửa override chưa đủ.

### F-008 · Cao · Quyền quản lý thành viên một shop cấp được quyền đặt mật khẩu danh tính toàn hệ thống

`lib/owner/team.ts:152–156` chỉ xét membership của shop đang quản lý, trong khi `OwnerSetupLinks.consume()` đổi mật khẩu identity dùng chung mọi shop. Fixture cho người là chủ shop B đồng thời là nhân viên shop A: chủ shop A cấp lại link, chọn mật khẩu mới, đăng nhập và lấy quyền `export` shop B thành công.

**Đã tái hiện trên mô hình membership hợp lệ**, bằng seed SQL tạo membership thứ hai (chưa chứng minh UI hiện có cho phép tạo cấu hình nhiều shop này). Assertion mong bị từ chối quyền shop B bị đỏ; nhận đủ quyền owner.

Đề xuất tách lời mời shop khỏi reset identity: shop chỉ được cấp lại lời mời tài khoản chưa kích hoạt và do shop đó tạo, có kiểm nguyên tử tài khoản chưa dùng/chưa có membership ngoài phạm vi. Tài khoản đã hoạt động tự khôi phục qua kênh đã xác minh hoặc quy trình admin riêng. Không chỉ chặn trường hợp `role=owner` trong shop hiện tại.

**Cách tái hiện cả hai:** trong worktree test riêng, chép nội dung `docs/security-repros/team-reset-tests.txt` xuống cuối `repository-tests/team.spec.ts`, trỏ fixture về DB test riêng và chạy `team.spec.ts -g 'audit:'`. Hai test được kỳ vọng đỏ đến khi sửa. Không đưa test đỏ vào bộ mặc định; mã tái hiện được lưu để bên tích hợp thêm vào lát sửa tiếp theo.

## Các bề mặt khác đã đọc

- `authorize`/impersonation: ràng buộc shop/session/admin, kiểm scope và support level mỗi lần, cấm export cho support. Chưa kiểm race thu hồi role/support đang chạy; không xem việc đọc code là chứng nhận an toàn.
- `notifications`: READS_FEEDBACK có xử lý override, list lọc lại quyền và membership hiện tại; support không có inbox. Có hai truy vấn items/count nên chưa có cam kết snapshot thống nhất khi đổi quyền đồng thời.
- `comments`: ghi bởi admin cần feedback scope **và** support level full; code có cả hai kiểm tra. F-003 vẫn thấy phone khi đọc feedback; chờ quyết định Tài.
- `media`/`profile`: key tải lên do server tạo từ shopId/userId đã xác thực + UUID, client không chọn prefix; type/length được ký. Không kiểm bucket thật, nội dung file thực, quota hay thu hồi URL ký trước hạn. Quyền URL ký vẫn tồn tại tới hết hạn 5 phút.
- `export`: admin bị chặn, quyền owner/member kiểm lại theo chunk, cursor và timeout có giới hạn. Vai `export` là quyền riêng có thể mang dữ liệu feedback dù thiếu quyền xem feedback; cần làm rõ chính sách trước khi gọi đó là bug.

## Bẫy vận hành của lượt này

- Sandbox không ghi được Git common-dir; retry có quyền tạo worktree thành công. Không đổi nhánh Claude.
- initdb trong sandbox thất bại shared memory; chạy có quyền mới khởi tạo được. Test kết nối local đầu tiên EPERM, không tính là test tái hiện lỗi; test có quyền sau đó mới cho bằng chứng đỏ.
- Fixture cũ hardcode 55439: chạy repository bằng script local tạm đổi literal sang 55449 rồi phục hồi byte-for-byte trong finally. Chỉ spec setup được sửa lâu dài để chấp nhận hai URL loopback chính xác. Không đổi harness hoặc fixture Claude.

## Kết quả cuối lượt

- Repository: **122 passed (57.6s)**; contracts: **73 passed (648ms)**; client: **75 passed (2.8s)**.
- Client lần đầu trong sandbox: 4 failed, 5 did not run, 66 passed vì EPERM mở listener/Chrome; chạy lại có quyền: 75 passed. Không phải hồi quy code.
- Schema fixture còn lại: **0**; PostgreSQL 55449 đã tắt. Không chạy Next harness/build/production.
- Bản vá `3b664a3` chỉ có `lib/owner/auth.ts`, `lib/owner/setup-link.ts`, `repository-tests/owner-setup.spec.ts`. Không thay đổi team/notifications/comments/media/export trong lượt rà này.
- Claude cherry-pick bản vá trên nhánh tích hợp và chạy đủ 7 bộ; tài liệu/repro ở commit riêng. Không cherry-pick mù bảng điều phối khi checkout Claude còn chỉnh bảng — giữ bản bảng hiện tại, ghép mục Astra.
- Ưu tiên kế tiếp: F-007/F-008 trước khi bán; A1 cần xử lý ingress/trusted IP và tính sẵn sàng khi bị flood. F-003 vẫn chờ Tài.

## Cập nhật tích hợp — Claude, 2026-09-20

- `3b664a3` và `c55f214` đã fast-forward vào `feat/local-app-foundation`.
- F-007 và F-008 đã sửa trong `lib/owner/team.ts`; hai test tái hiện ở `docs/security-repros/team-reset-tests.txt` đã chuyển (có mở rộng) vào `repository-tests/team.spec.ts` và nằm trong bộ mặc định. Chi tiết ở `agents-board.md`.

