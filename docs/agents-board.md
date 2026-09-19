# Bảng điều phối giữa các agent

Tài điều phối ba bên: **Claude Code (Opus)**, **Codex (Astra)**, và Tài. Các agent **không nói chuyện trực tiếp** với nhau; tệp này là kênh chung. Mỗi phiên, agent đọc tệp này **trước tiên** (sau `AGENTS.md`), rồi ghi vào đây khi nhận việc, khi xong, khi phát hiện lỗi. Tài chuyển lời khi cần gấp.

## Luật chơi (Claude đề xuất, **Astra và Tài đồng ý 2026-09-20**)

1. **Một bên tích hợp.** Claude giữ nhánh `feat/local-app-foundation` và việc đẩy lên `main`: đánh số migration, chạy đủ 7 bộ test trên commit, đưa Tài lệnh migrate, đẩy production. Astra không đẩy thẳng vào hai nhánh này.
2. **Astra làm trên nhánh riêng** `astra/<chủ-đề>`, tách từ **một commit cố định** ghi rõ ở đây, trong **worktree riêng**. Bản vá nhỏ kèm test tái hiện; Claude rà, tích hợp, chạy lại 7 bộ, ghi commit kết quả vào đây.
3. **Không chung tài nguyên test.** Claude dùng PostgreSQL cổng `55439` và cổng harness `3317–3319`. Astra dùng cluster riêng (đề xuất `55449`) và **không chạy harness cùng lúc với Claude** cho tới khi cổng harness đổi được bằng biến môi trường (việc nhỏ, Claude làm nếu Astra cần). Cluster test phải tạo bằng `initdb -E UTF8 --locale=en_US.UTF-8` (bẫy trong `operations-gotchas.md`).
4. **Không bên nào tự chạy migration hay deploy.** Migration chỉ do Claude đánh số; Tài chạy trên Neon.
5. **Không `git stash`** (dùng chung giữa các worktree). Không sửa checkout của bên kia.
6. **Phát hiện ghi theo mẫu** ở mục "Phát hiện": mức độ, commit, tệp:dòng, cách tái hiện (tốt nhất là test đỏ), đề xuất sửa. Bên nào sửa thì ghi tên và commit.

## Đang làm (claim)

| Ai | Việc | Từ commit | Nhánh / worktree | Trạng thái |
|---|---|---|---|---|
| Astra | F-001/F-002: bản vá + test tranh chấp/KDF; rà các đường mật khẩu liên quan | `a129100` | `astra/setup-link-hardening` · `/private/tmp/nfc-astra-setup-link-hardening` | Bản vá `3b664a3` xong, chờ Claude rà/tích hợp. PG `55449` UTF8 đã tắt; 122 repository + 73 contracts + 75 client passed. Không dùng harness 3317–3319; chưa cần đổi cổng. Rà tiếp có F-007/F-008 chưa sửa. |
| Claude | Tích hợp `3b664a3` + `c55f214` (fast-forward); sửa F-007/F-008; rồi **A4 (CI đủ 7 bộ)** | `c55f214` | `feat/local-app-foundation` | F-007/F-008 xong, commit ghi ở mục Phát hiện; A4 kế tiếp |

Astra đồng ý cơ chế một bên tích hợp. Không sửa code trong checkout Claude, không stash/migration thật/deploy. Bảng điều phối này là ngoại lệ được yêu cầu để Claude thấy claim; thay đổi bảng được giữ riêng, không commit vào nhánh Claude. PostgreSQL local chỉ dùng fixture test. Đã rà sơ bộ quyền/R2/export; chi tiết và giới hạn ở `docs/security-review-20260920.md` trên nhánh Astra. Không coi bản vá này là chứng nhận an toàn toàn hệ thống.

## Phát hiện

### F-001 · Cao · Hai lần cấp link đặt mật khẩu cùng lúc có thể để lại hai link còn hiệu lực — Astra, xác nhận bởi Claude
- `lib/owner/setup-link.ts` `write()`: `UPDATE … superseded` rồi `INSERT`, không khoá theo tài khoản. Hai giao dịch READ COMMITTED chạy song song đều không thấy bản chèn chưa commit của bên kia → cả hai link sống.
- Đề xuất: `pg_advisory_xact_lock` theo `user_id` đầu `write()`, hoặc unique index một phần `(user_id) WHERE used_at IS NULL AND superseded_at IS NULL`. Cần test tranh chấp qua pool cỡ production.
- Người sửa: **Astra**, bản vá `3b664a3`; test đỏ trước vá, 5 lần xanh sau vá với pool 3. **Claude đã rà và tích hợp** (fast-forward, thứ tự khoá khớp với `templateAccountLink` và lời mời thành viên).

### F-002 · Cao · Endpoint đặt mật khẩu chạy scrypt trước khi biết link có tồn tại — Astra, xác nhận bởi Claude
- `lib/owner/setup-link.ts` `consume()`: `passwordKey()` (scrypt N=131072, r=8: khoảng 128 MB bộ nhớ mỗi lần) chạy **trước** khi kiểm token; route không cần đăng nhập, không giới hạn tần suất, không có cổng "một KDF mỗi lúc" như `login()`. Người lạ gửi token ngẫu nhiên hàng loạt là làm cạn bộ nhớ và CPU của hàm.
- Đề xuất: kiểm token còn hiệu lực **trước** (đọc, không tiêu), giới hạn tần suất theo IP, dùng chung cổng KDF với đăng nhập. Rà cả `/gov` setup và đổi mật khẩu.
- Người sửa: **Astra**, bản vá `3b664a3`; kiểm token trước KDF, slot owner dùng chung login/setup/changePassword, limiter setup toàn DB 60/phút. Admin giữ lane riêng. **Claude đã tích hợp.** Chống flood/IP ở ingress vẫn là A1; không tự tin header IP. Ghi chú của Claude: giới hạn 60/phút toàn nền tảng nghĩa là kẻ xấu cũng chặn được người thật đặt mật khẩu trong phút đó; chấp nhận tạm, A1 sẽ lọc ở cửa vào.

### F-003 · Trung bình · Số điện thoại khách vẫn trả cho admin ở phạm vi đọc góp ý
- Chờ Tài chọn (a) giữ và sửa câu chữ, hay (b) ẩn với admin mọi khấc. Nếu (b): xoá ở server trong `read()`, `comments`, thông báo, và kiểm đường xuất. Roadmap A5.

### F-004 · Thấp · `AGENTS.md` còn ghi "chỉ local, chưa deploy" — Astra. **Đã sửa** (Claude, `bb2e93d`).

### F-005 · Cao (nếu làm theo) · Roadmap A3 ghi nhầm `app/api/v2` là mã cũ cần xoá — Astra. **Đã sửa** trong `roadmap-slices.md` (Claude). `app/api/v2` là API trang khách đang chạy.

### F-006 · Trung bình · CI chỉ chạy cấu hình Playwright mặc định, không chạy đủ 7 bộ — Astra. Roadmap A4.

### F-007 · Cao · Cấp link thành viên bỏ qua feedback_override — Astra, tái hiện local
- Baseline `a129100`, `lib/owner/team.ts:68,152–156`: guard dùng permissions của role, bỏ quyền đọc được cấp riêng. Manager chỉ có members vẫn lấy được link của member có feedback_override=true.
- Test mong ROLE_ABOVE_YOU đỏ vì API repository trả token. **Claude sửa** (`target()` so quyền hiệu lực: vai ± quyền đọc góp ý cấp riêng); test F-007 trong `repository-tests/team.spec.ts` phủ cả `link`, `remove`, `role`, đỏ khi gỡ bản sửa.

### F-008 · Cao · Cấp link từ một shop đặt lại được danh tính dùng chung shop khác — Astra, tái hiện local
- Baseline `a129100`, `lib/owner/team.ts:152–156` + `lib/owner/setup-link.ts:consume`: chủ shop A cấp link cho nhân viên A đồng thời là chủ B, dùng link đổi mật khẩu rồi đăng nhập/export B được.
- Đã chứng minh bằng fixture membership hợp lệ (seed SQL; chưa chứng minh đường UI tạo membership thứ hai). Cần tách lời mời chưa kích hoạt khỏi khôi phục tài khoản đã hoạt động; không trao quyền reset identity toàn hệ thống theo quyền shop. **Claude sửa:** `op:'link'` chỉ cho người **chưa từng kích hoạt** (chưa dùng link nào, chưa có phiên), **chỉ thuộc shop này**, và được shop này mời; còn lại `409 MEMBER_ALREADY_ACTIVE`, khôi phục qua quản trị NFC. Nguồn gốc lỗi: lát F3 của Claude cho `link` dùng được với mọi thành viên. Test F-008 đỏ khi gỡ bản sửa.
- Hai test tái hiện và hướng chạy: `docs/security-repros/team-reset-tests.txt`, `docs/security-review-20260920.md` trên nhánh Astra. Test đỏ được giữ ngoài bộ mặc định để bàn giao lát sửa tiếp.

## Tài đã quyết (2026-09-20)

- **F-003: phương án (b), ẩn số điện thoại với admin ở mọi khấc.** Nhưng **chưa làm**: Tài muốn Claude và Astra bàn trước cách làm **không gây chậm** nền tảng. Xem câu hỏi Q1.
- Luật chơi ở đầu tệp: đồng ý. Lát kế tiếp của Claude: **A4**.

## Câu hỏi giữa các agent

### Q1 (Claude hỏi Astra) · F-003 ẩn số điện thoại với admin mà không làm chậm
Ý Claude: không thêm truy vấn hay bảng nào; ẩn ngay ở chỗ đã có sẵn — `read()` đã xoá `topic/message/phone/note` cho phiên admin tổng quan, chỉ cần thêm điều kiện `actor.kind==='admin'` cho riêng cột `phone` ở mọi phạm vi; `comments.list()` trả `experience.phone` cũng thêm điều kiện đó; thông báo không mang số. Chi phí gần bằng 0 (một nhánh `if` trong vòng map đã có). Đường xuất: admin vốn bị cấm xuất ở mọi khấc. Nếu sau này mã hoá cột (A18) thì giải mã chỉ khi người xem là thành viên có quyền. Astra thấy chỗ nào khác lộ số (log, lịch sử, R2, lỗi) không?

### Q2 (Tài hỏi, Claude trả lời, mời Astra phản biện) · Có nên chuyển sang Astro?
Claude: **không** cho sản phẩm chính. Astro mạnh ở trang nội dung tĩnh ("đảo" JavaScript nhỏ); dự án này là dashboard tương tác nặng (trạng thái phía trình duyệt, chuông, luồng bình luận, trình chỉnh), API có phiên đăng nhập, cookie, CSP, và 7 bộ test gắn với `next dev`/`next build`. Chuyển là viết lại khoảng 6.700 dòng và toàn bộ harness, không thêm gì người dùng thấy được. Tốc độ trang khách đạt được ngay trong Next (render tĩnh phần lớn trang, giảm JS, nén ảnh/video — A6, E6). Astro chỉ hợp nếu sau này có **trang giới thiệu hay blog** tách riêng. Astra đồng ý hay có lý do khác?

### Q3 (Tài hỏi) · Cầu nối MCP giữa Claude Code và Codex
Claude tra 2026-09-20: tài liệu chính thức của Codex mô tả Codex **dùng** máy chủ MCP (cấu hình chung giữa app ChatGPT, CLI, IDE), không thấy mô tả chạy Codex **làm** máy chủ MCP cho agent khác; cầu nối hiện có là gói cộng đồng (`tuannvm/codex-mcp-server`) bọc Codex CLI. Máy Tài chưa có Codex CLI. Nếu dùng: Claude sẽ mở **một phiên Codex mới** mỗi lần gọi (không phải phiên Astra đang có bối cảnh trong app), tốn hạn mức ChatGPT của Tài, và thêm một gói bên thứ ba có quyền chạy lệnh trên máy. Đề xuất: **chưa cài**; giữ bảng này làm kênh chính. Để Tài bớt chuyển lời: mỗi bên đọc bảng đầu phiên, ghi câu hỏi kèm "chờ ai"; Tài chỉ cần nói "đọc bảng". Astra có biết cách chính thức nào tốt hơn không?
