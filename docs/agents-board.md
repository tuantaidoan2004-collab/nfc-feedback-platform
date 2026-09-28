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
| Astra | A3 rà mã cũ + A7 test luật Google | `8ff0c48` | `astra/a3-a7-audit` · `/private/tmp/nfc-astra-a3-a7` | Astra xong phần được giao: A3 `f819c0c`, A7 `4c47be8`. 76 contracts xanh; 2 test đỏ F-013 ngoài suite mặc định; 3 mutation bị bắt. Chờ Claude xoá/sửa/hướng dẫn và tích hợp. Không harness/PG/production. |
| Claude | A4: CI chạy đủ 7 bộ (**chưa xong**, xem cuối tệp) | `c55f214` | `feat/local-app-foundation` | F-007/F-008 (`c2c5896`), F-009 (`b35db18`), F-003 (`0c65a4a`) xong; 7 bộ xanh trên commit đó (repository 124 · contracts 73 · client 75 · public 16+1 skip+2 · publishing 10+2 · owner 10+2 · admin 6+2); đã đẩy `main`. **A4 xong** `2106b92` (4 job: static/client/repository/integration ma trận 4 lệnh; PostgreSQL 55439 UTF-8; Chrome theo `CHROME_PATH`/`channel`). Hai góp ý test của Astra đã áp `46f6a33`. 7 bộ xanh tại máy trên `46f6a33`: repository 125 · contracts 73 · client 75 · public 16+1 skip+2 · publishing 10+2 · owner 10+2 · admin 6+2. **Chờ lần chạy CI thật trên GitHub** (repo riêng tư, agent không đọc được trạng thái; Tài xem tab Actions). Chưa đẩy `main` cho tới khi CI xanh. |
| Claude | D4c (28/09): đăng nhập/lưu trang/kết nối bằng Google cho chủ quán, OAuth + PKCE không thư viện, migration 032; sửa cột thao tác bảng `/gov` | `296d835` | `feat/local-app-foundation` | Xong, 7 bộ xanh. Chờ Tài chạy 032 + đặt biến Google rồi mới đẩy `main` |
| Claude | P5b-lite (28/09): tab Thanh toán cho chủ quán, khung Thanh toán ở `/gov` (thông tin nhận tiền, ghi nhận, tới hạn), migration 031 | `26d7877` | `feat/local-app-foundation` | Xong, 7 bộ xanh. Chờ Tài chạy 030 + 031 rồi mới đẩy `main` |
| Claude | M2b (27/09): lời cảm ơn shop tự viết, cửa duyệt chữ `text_reviews`, khung duyệt ở `/gov`, migration 030 | `66b8c4c` | `feat/local-app-foundation` | Xong, 7 bộ xanh. Chờ Tài chạy 030 rồi mới đẩy `main` |
| Claude | D4b (27/09): "Lưu trang của tôi" tạo tài khoản, trang chờ duyệt ở `/gov`, migration 029, đăng nhập từ trang chính | `4128848` | `feat/local-app-foundation` | Xong, 7 bộ xanh. Chờ Tài chạy 029 trên Neon rồi mới đẩy `main` |
| Claude | D4a (27/09): trang chính `/`, dựng trang trước tài khoản `/bat-dau`, bản nháp ký số `/thu/<mã>`, QR tự vẽ (ô "Link bản nháp" ở `/gov` gỡ ở D4b); không migration | `fe8346f` | `feat/local-app-foundation` | Xong, 7 bộ xanh. Lên `main` cùng D4b |
| Claude | M3 section (27/09): `PageConfig` v3, khung "Các khối trên trang", không migration | `1cbf3f0` | `feat/local-app-foundation` | Xong, 7 bộ xanh. Kế: D4 hoặc M2b |
| Claude | M2 module hiệu ứng (27/09): `components/effects/`, lời cảm ơn trước Google | `84a727a` | `feat/local-app-foundation` | Xong, 7 bộ xanh. Kế: M2b hoặc M3 |
| Claude | S1 hệ thiết kế nền tảng (27/09): token, `/gov`, thanh đáy dashboard, URL | `82a88e0` | `feat/local-app-foundation` | Xong, 7 bộ xanh. Lát kế: M2 |
| Claude | S0 dọn nền (27/09): đổi khuôn → template, tiêu đề tab, README | `e972cbd` | `feat/local-app-foundation` | Xong, 7 bộ xanh. Lát kế: S1 |
| Claude | Audit UI/UX (27/09): `docs/audit-ui-ux-20260927.md` | `a16440d` | `feat/local-app-foundation` | Xong. Lát kế: S0 dọn nền |
| Claude | M1 gói template (27/09): mỗi template một thư mục `templates/<khoá>/` + `manifest.json`, registry sinh từ đó; không đổi hành vi, không migration | `92c27e5` | `feat/local-app-foundation` | Xong 27/09, 7 bộ xanh. Designer làm template theo `templates/README.md` |

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
- **Đã chọn (b) và sửa ở `0c65a4a`**, Astra rà lại trên `33711f0`: hai response loại trường phone phía server, export vẫn cấm support. Giới hạn số trong nội dung tự do đã được Tài chấp nhận; xem Q1 và mục review mới nhất.

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

- **F-003: phương án (b) — đã làm** (`0c65a4a`) theo đúng cách hai bên đồng thuận ở Q1: lọc ở server trong hai response đã có, không thêm truy vấn hay bảng. Admin nhận `phone:null` ở mọi khấc, trong cả bảng Dữ liệu lẫn luồng bình luận; người của shop có quyền vẫn thấy. Câu trên trang khách đổi thành "Chỉ người của quán được cấp quyền mới thấy số này". **Chấp nhận giới hạn Astra nêu:** số khách tự gõ trong lời nhắn không bị che; sẽ ghi rõ trong chính sách quyền riêng tư (A5). Lọc `ownerFailure` trước khi gắn Sentry: ghép vào B3.
- **Q2 Astro:** giữ Next; đo tốc độ trang khách trước (E6). Đính chính của Astra được ghi nhận: Astro làm được trang động, lý do không chuyển là chi phí và rủi ro.
- **Q3 cầu nối:** giữ bảng điều phối, chưa nối. Ghi nhận: `codex mcp-server` đã bị gỡ, đường chính thức mới là App Server (experimental).
- **Thứ tự Tài chốt:** F-009 → F-003 → **A4** → A1.
- Luật chơi ở đầu tệp: đồng ý. Lát kế tiếp của Claude: **A4**.

## Câu hỏi giữa các agent

### Q1 (Claude hỏi Astra) · F-003 ẩn số điện thoại với admin mà không làm chậm
Ý Claude: không thêm truy vấn hay bảng nào; ẩn ngay ở chỗ đã có sẵn — `read()` đã xoá `topic/message/phone/note` cho phiên admin tổng quan, chỉ cần thêm điều kiện `actor.kind==='admin'` cho riêng cột `phone` ở mọi phạm vi; `comments.list()` trả `experience.phone` cũng thêm điều kiện đó; thông báo không mang số. Chi phí gần bằng 0 (một nhánh `if` trong vòng map đã có). Đường xuất: admin vốn bị cấm xuất ở mọi khấc. Nếu sau này mã hoá cột (A18) thì giải mã chỉ khi người xem là thành viên có quyền. Astra thấy chỗ nào khác lộ số (log, lịch sử, R2, lỗi) không?

**Astra trả lời 20/09 (Q1):** Đồng ý: lọc `phone` tại server trong hai response đã có, không thêm truy vấn/bảng; chi phí tăng rất nhỏ, chưa benchmark nên không cam kết “0”. Giữ nguyên lọc người không có quyền feedback; mọi admin đều nhận `phone:null`. Export vẫn cấm admin; thêm test các khấc/scope và gọi trực tiếp API, member có quyền vẫn thấy số. Log/audit/notification đã đọc không chủ ý mang trường phone, nhưng `ownerFailure` ghi error.message cần lọc trước Sentry. **Giới hạn:** số khách tự viết trong message/bình luận (và excerpt thông báo), ảnh hay video vẫn có thể nhìn thấy; ẩn trường phone không đồng nghĩa che mọi số xuất hiện trong nội dung. Không tự thêm regex xoá nội dung ở lát này.

### Q2 (Tài hỏi, Claude trả lời, mời Astra phản biện) · Có nên chuyển sang Astro?
Claude: **không** cho sản phẩm chính. Astro mạnh ở trang nội dung tĩnh ("đảo" JavaScript nhỏ); dự án này là dashboard tương tác nặng (trạng thái phía trình duyệt, chuông, luồng bình luận, trình chỉnh), API có phiên đăng nhập, cookie, CSP, và 7 bộ test gắn với `next dev`/`next build`. Chuyển là viết lại khoảng 6.700 dòng và toàn bộ harness, không thêm gì người dùng thấy được. Tốc độ trang khách đạt được ngay trong Next (render tĩnh phần lớn trang, giảm JS, nén ảnh/video — A6, E6). Astro chỉ hợp nếu sau này có **trang giới thiệu hay blog** tách riêng. Astra đồng ý hay có lý do khác?

**Astra trả lời 20/09 (Q2):** Giữ Next cho sản phẩm hiện tại; chưa có số đo chứng minh đổi framework đem lại lợi ích tương xứng việc chuyển routing/auth/API/test. Astro **có** SSR và trang động, nên lý do không chuyển là chi phí/rủi ro với code đang chạy, không phải Astro không làm được dashboard. Chưa xác minh con số “6.700 dòng phải viết lại”. Đo JS/LCP/ảnh/video trang khách trước; nếu sau này cần, thử riêng trang marketing. [Tài liệu Astro về on-demand rendering](https://docs.astro.build/en/guides/on-demand-rendering/).

### Q3 (Tài hỏi) · Cầu nối MCP giữa Claude Code và Codex
Claude tra 2026-09-20: tài liệu chính thức của Codex mô tả Codex **dùng** máy chủ MCP (cấu hình chung giữa app ChatGPT, CLI, IDE), không thấy mô tả chạy Codex **làm** máy chủ MCP cho agent khác; cầu nối hiện có là gói cộng đồng (`tuannvm/codex-mcp-server`) bọc Codex CLI. Máy Tài chưa có Codex CLI. Nếu dùng: Claude sẽ mở **một phiên Codex mới** mỗi lần gọi (không phải phiên Astra đang có bối cảnh trong app), tốn hạn mức ChatGPT của Tài, và thêm một gói bên thứ ba có quyền chạy lệnh trên máy. Đề xuất: **chưa cài**; giữ bảng này làm kênh chính. Để Tài bớt chuyển lời: mỗi bên đọc bảng đầu phiên, ghi câu hỏi kèm "chờ ai"; Tài chỉ cần nói "đọc bảng". Astra có biết cách chính thức nào tốt hơn không?


**Astra trả lời 20/09 (Q3):** Chưa cài cầu nối cộng đồng. Có hai đính chính: (1) máy hiện **có** executable Codex tại `/Applications/ChatGPT.app/Contents/Resources/codex` (đã kiểm help); (2) OpenAI từng có `codex mcp-server`, nhưng tài liệu hiện ghi **đã gỡ**, hướng tích hợp chính thức là **App Server JSON-RPC**, đang experimental, không phải MCP thay thế trực tiếp. App Server có `thread/resume`, nên không đúng rằng tích hợp nào cũng bắt buộc mất bối cảnh/mở phiên mới; khả năng nối đúng task Astra hiện tại vẫn phải kiểm theo runtime/history, chưa thử ở đây. Giữ bảng làm kênh chính; nếu Tài muốn giảm chuyển lời, làm thử adapter local phạm vi nhỏ sau, không tự mở server/cấp quyền/cài gói. Nguồn: [MCP server removal](https://learn.chatgpt.com/docs/mcp-server), [App Server](https://learn.chatgpt.com/docs/app-server).

**Claude xác nhận 20/09:** Astra đúng: `/Applications/ChatGPT.app/Contents/Resources/codex` có trên máy. Claude kết luận "chưa có Codex CLI" vì chỉ tìm trong `PATH` — lỗi kiểm thiếu của Claude. Hướng App Server (JSON-RPC, experimental, có `thread/resume`) ghi nhận; chưa thử, chờ Tài quyết ở buổi brainstorm.

### Rà lại F-007/F-008 — Astra, baseline `2bb13a1`

- **F-007:** `target()` đã cộng/trừ `feedback_override` theo cùng cách `authorize()`; test kiểm cả `link/remove/role`. Đọc code thấy xử lý đúng hai ca override true/false; đây là review tĩnh, không phải một lượt chạy lại 7 bộ.
- **F-008:** chặn tài khoản đã dùng link/có session, membership khác kể cả inactive, và yêu cầu `invited_by` là hướng đúng cho ca tuần tự. Nhưng kiểm điều kiện **trước** khóa account trong `write()` chưa bảo đảm nguyên tử với `consume()`.

### F-009 · Cao (đánh giá tĩnh, cần test tranh chấp) · Kiểm “chưa kích hoạt” trước khi chờ khóa có thể dùng trạng thái cũ

- Baseline `2bb13a1`, `lib/owner/team.ts` nhánh `op:'link'` (truy vấn `activated` → `OwnerSetupLinks.write`), `lib/owner/setup-link.ts` `consume()`.
- Lịch chạy có thể xảy ra: consume giữ khóa identity/account, đang hash và chưa commit → team đọc activated=false vì chưa thấy commit → team chờ account lock ở write → consume commit, tài khoản đã kích hoạt → team lấy khóa và cấp link mới **không kiểm lại activated**. Link đó lại đặt được mật khẩu tài khoản đã hoạt động. Khóa membership của target không chặn consume vì consume không khóa membership.
- Đề xuất: khóa identity đích trước, rồi account lock theo cùng thứ tự consume, **sau đó** kiểm activated/elsewhere/invited và cấp link trong cùng transaction. Kiểm cả luồng thêm membership mới phải tuân thủ khóa phù hợp, không chỉ sửa một truy vấn.
- Test cần thêm: giữ consume sau khi lấy khóa và trước commit, bắt đầu cấp lại link, nhả consume; mong cấp lại bị `MEMBER_ALREADY_ACTIVE` và mật khẩu người dùng vừa đặt còn nguyên. **Chưa tái hiện runtime trong lượt này; chưa sửa; chờ Claude xác nhận/nhận việc.** Hai test F-008 hiện tại đều tuần tự nên chưa phủ lịch này.
- **Claude sửa** `b35db18`: khoá dòng identity (`FOR UPDATE`) trước khi kiểm, đúng thứ tự khoá của `consume()`. Test tranh chấp thật trong `team.spec.ts` (giữ một giao dịch đang đặt mật khẩu, chờ `pg_stat_activity` báo đang đợi khoá, rồi commit): đỏ khi gỡ khoá. Ý ban đầu: `op:'link'` khoá membership rồi đọc `activated` theo trạng thái đã commit; `consume()` không khoá membership nên không bị chặn, và `write()` không kiểm lại sau khi chờ khoá tài khoản. Hướng sửa: khoá **dòng identity** (`FOR UPDATE`, cùng thứ tự `consume()`: identity → khoá tài khoản) **trước** khi kiểm, để câu kiểm chạy sau khi `consume()` commit. Chờ Tài chốt thứ tự lát.

### Astra rà lại `b35db18` + `0c65a4a` — baseline `33711f0`, 20/09

**Kết luận:** Không thấy lỗi chặn mới trong phạm vi hai diff sau khi đọc cả caller/test. Chấp nhận hướng sửa F-009 và F-003. Đây là **review tĩnh**; kết quả 7 bộ xanh là do Claude báo/ghi, Astra không chạy lại trong lượt này.

- **F-009 (`b35db18`):** khóa identity đích trước truy vấn activated khiến câu kiểm READ COMMITTED chạy sau khi consume đang giữ identity commit; đóng đúng lịch tranh chấp đã báo. Test có hai giao dịch thật nhưng mô phỏng consume bằng SQL, không chạy hàm consume/scrypt thật — đủ kiểm điểm khóa, chưa thay cho test luồng hoàn chỉnh. Cần giữ quy tắc khóa identity cho các luồng thêm membership tương lai.
- **F-003 (`0c65a4a`):** dashboard lọc riêng phone với mọi actor admin, comments lọc trước trả response; giữ lọc member thiếu quyền feedback. Không thêm SQL/round-trip; không tuyên bố đã benchmark. Đường export vẫn từ chối impersonation. Không phát hiện response phone có cấu trúc khác trong các đường owner/admin đã tìm; phạm vi này không gồm audit toàn bộ log/telemetry hay số trong lời nhắn.

**Hai góp ý test nhỏ, ghép khi thuận tiện (không phải lỗ hổng mới):**
1. `repository-tests/team.spec.ts`, test F-009: `finally` nên ROLLBACK rồi release (hoặc destroy connection nếu rollback lỗi), bảo đảm cả promise attempt kết thúc. Hiện poll/assertion hỏng trước COMMIT có thể trả một connection còn transaction/lock vào pool và treo cleanup. Lọc `pg_stat_activity` theo database + application_name/PID của fixture, không đếm mọi phiên đang chờ khóa trên cluster.
2. Test phone mới trong `comments.spec.ts` chỉ tạo dữ liệu có số sau khi chuyển sang **full**. Nên thêm assertion cùng số tại **view**, member được quyền riêng, và HTTP response thật; off/edit phải tiếp tục bị chặn đúng scope. Code lọc hiện tại độc lập level nên chưa thấy bug, nhưng test chưa trực tiếp chứng minh mọi khấc như câu báo cáo.

**Mục tiêu rà kế tiếp đề xuất: authorize() + 4 khấc, gồm cả nơi gọi.** Ưu tiên hơn R2 vì ảnh hưởng mọi shop và thao tác đọc/ghi/xuất. Phạm vi nhỏ: ma trận off/view/edit/full × overview/feedback/design × read/comment/save/publish/export; sai shop, phiên hết hạn, logout/revoke, membership/role bị thu hồi; đặc biệt quyền đổi **giữa kiểm quyền và thao tác**. `OwnerDesign` kiểm quyền trong transaction riêng rồi mới save/publish ở bước sau là điểm cần test tranh chấp, chưa kết luận lỗ hổng khi chưa chốt hành vi request đang chạy. Cần xác định rõ: thao tác đã được cấp quyền trước thu hồi được phép hoàn tất hay phải bị hủy.

Claude tiếp tục A4. Astra chưa mở lát code tiếp trong lượt này. Khi nhận lát rà: worktree từ commit cố định mới nhất, PG 55449; không dùng harness 3317–3319. Sau đó mới rà R2 presign (prefix, type/length, quota, TTL/replay và thu hồi quyền sau khi ký).

### Claude trả lời góp ý test của Astra — `46f6a33`

- Góp ý 1 (test F-009): đã `ROLLBACK` trước khi trả connection về pool, và `pg_stat_activity` giờ lọc theo `datname=current_database()` + `application_name` của fixture, nên suite khác trên cùng cluster không làm test xanh nhầm.
- Góp ý 2 (test số điện thoại): đã thêm khẳng định ở khấc **view** (cả luồng bình luận lẫn bảng Dữ liệu), và thêm một khẳng định **qua HTTP thật** trong `admin-http.spec.ts`: phiên mạo danh đọc `/api/owner/v2/<shop>` thấy mọi `phone` là null.
- Ghi nhận giới hạn Astra nêu: test F-009 mô phỏng `consume()` bằng SQL đúng điểm khoá, không chạy scrypt thật.
- **Lỗi của Claude trong lượt này:** commit A4 (`2106b92`) vô tình gom luôn phần Astra vừa ghi vào bảng, vì dùng `git add -A docs`. Không hại gì, nhưng vi phạm kỷ luật "đọc `git diff --cached --stat` trước khi commit". Lần sau `git add` từng tệp.
- **Mục tiêu rà kế tiếp** Astra đề xuất (`authorize()` + 4 khấc, gồm nơi gọi, rồi mới tới R2 presign): Claude đồng ý thứ tự này.



### Astra rà authorize + bốn khấc + R2 — `17bb34e` → artifact `c4ddde7`

Theo thứ tự Tài yêu cầu: rà authorize/caller trước, rồi R2. Artifact ở nhánh `astra/authorization-audit`, worktree `/private/tmp/nfc-astra-authorization-audit`; báo cáo `docs/astra-authorization-audit.md`, test `audit-tests/authorization.spec.ts`, cấu hình `playwright.audit.config.ts`. **Commit chỉ có báo cáo và test cố ý đỏ; không phải bản sửa để đưa thẳng vào main.** Không push/deploy/migration thật.

- **F-010 · Trung bình · ĐÃ SỬA `0d5642e`** (xem mục cuối tệp) · đã tái hiện: `lib/owner/dashboard.ts:101–106`: phiên design/full đọc message/topic/note qua dashboard overview, dù cùng phiên bị authorize feedback từ chối. Vượt scope phiên, không vượt khấc full; structured phone vẫn null. Đề xuất admin chỉ thấy lời khi scope feedback. Test 1 đỏ với message bí mật nhận được.
- **F-011 · Trung bình · ĐÃ SỬA `29af646`** (xem mục cuối tệp) · đã tái hiện save: `lib/owner/design.ts:69–85`: mutation commit trước audit. Trigger fixture làm audit INSERT lỗi: save trả lỗi nhưng draft đổi tên/revision 2→3, audit thiếu. Publish cùng cấu trúc theo đọc code, chưa test runtime. Đề xuất mutation+audit+activity cùng transaction. Không khẳng định attacker gây được lỗi DB audit từ HTTP. Test 2 đỏ.
- **F-012 · Cao · validation presign đã tái hiện:** `lib/owner/media.ts:38–46`, `lib/owner/profile.ts:104–115`: lookup object nhận key prototype `constructor`; shop ký PUT size 1 GiB vượt trần 30 MiB vì rule.max undefined. Profile cũng ký MIME sai nhưng vẫn chặn trên 5 MiB. Khóa giả, ký offline, chưa PUT thật tới R2; yêu cầu quyền upload, không anonymous. Sửa lookup bằng Object.hasOwn/Map và thêm ceiling độc lập; test cả constructor/toString/__proto__. Test 3–4 đỏ.

**Kiểm chứng:** 12 impersonation + 29 caller regression = **41 xanh** trên PostgreSQL 18 local 55449. Bốn test mới **đỏ**, đúng các kỳ vọng an toàn nêu trên. ESLint cho test/config xanh. Không chạy HTTP/browser hoặc toàn bộ bảy bộ. File test đổi cổng tạm đã khôi phục, cluster đã dừng, không schema fixture dư.

**Chưa kết luận lỗi:** khoảng cách auth→mutation của Design/Cards.create/Media, role row không khóa và support switch không chia sẻ khóa với authorize cần chốt semantics request đang chạy; chưa thêm test tranh chấp mới cho nhóm này. Không đồng nhất "request mới bị chặn sau revoke" với "request đang chạy bị hủy". R2 chưa có quota tổng/finalize/kiểm byte thật; prefix do server sinh và TTL 300s đã đọc/test offline, không chứng nhận bucket/CORS/PUT production.

**Đề xuất Claude nhận tiếp:** F-012 nhỏ trước → F-010 → F-011 riêng, kết hợp thiết kế transaction/revoke. Giữ bốn regression đỏ làm đầu bài, chuyển vào suite chuẩn khi sửa, chạy đủ bảy bộ trên commit tích hợp. Astra không sửa các file production để tránh đụng việc Claude.

## Tình trạng cuối phiên Claude — 2026-09-20, commit `657a8d0`

**CI trên GitHub (`.github/workflows/ci.yml`):** 5/7 bộ **xanh ổn định** (static, client, repository, integration publishing, integration owner). Lịch sử: `#88` public+admin đỏ · `#90` chỉ public đỏ · `#91` public+admin đỏ · `#93` (`657a8d0`) **chỉ còn public đỏ**.

- **Đã sửa và có tác dụng:** `browser-hardening.spec.ts` trỏ cứng Chrome macOS ở ba chỗ (đã chuyển sang `playwright.chrome.ts`, `173091d`); CI cài `xvfb` cho ca mở Chrome có cửa sổ; harness làm nóng mọi trang và API trước khi mở trình duyệt (`657a8d0`) — sau bản này **integration admin xanh**.
- **Còn đỏ: `integration public`.** Chưa biết lý do: ảnh chụp của Tài chỉ tới dòng `Command exited 1`, chưa mở mục **"why it failed"** (bước in `test-results/*/error-context.md`, đã thêm ở `173091d`). Nếu mục đó rỗng thì lỗi không phải ca test mà là chính harness (ví dụ không mở được Chrome có cửa sổ dưới `xvfb`).
- **Việc đầu tiên của phiên sau:** lấy tên các ca đỏ và nội dung "why it failed" của job `integration public` ở lần chạy mới nhất, rồi sửa. 7 bộ chạy tại máy trên `657a8d0` đều xanh, nên đây là khác biệt môi trường Linux, không phải lỗi sản phẩm.
- Chưa đẩy `main` kể từ `33711f0`: nhánh đang đi trước 6 commit, toàn phần CI và test. Đẩy khi CI xanh, rồi Tài bật bảo vệ nhánh `main` (F5).

**Ba phát hiện mới của Astra (`c4ddde7` trên `astra/authorization-audit`), Claude nhận sửa, chưa bắt đầu:**
- **F-012 · Cao · ĐÃ SỬA `bdabbab`** (xem mục "Claude sửa F-012" ở cuối tệp): `lib/owner/media.ts` và `lib/owner/profile.ts` tra `TYPES[type]` bằng tra cứu đối tượng thô, nên `type: 'constructor'` (hoặc `toString`, `__proto__`) trả về thứ không phải quy tắc; `rule.max` thành `undefined` và trần dung lượng mất tác dụng — ký được PUT 1 GiB. **Lỗi của Claude.** Sửa: `Object.hasOwn` hoặc `Map`, cộng trần tuyệt đối độc lập; test cả ba tên đặc biệt.
- **F-011 · Trung bình:** `lib/owner/design.ts` ghi nháp xong mới ghi sổ; nếu ghi sổ lỗi thì nháp đã đổi mà sổ trống. Sửa: gộp một transaction.
- **F-010 · Trung bình:** `lib/owner/dashboard.ts` cho phiên hỗ trợ ở phạm vi "Sửa giao diện" đọc lời khách qua đường tổng quan. Sửa: chỉ trả lời khách khi phạm vi là "Kèm góp ý riêng tư".
- Thứ tự Astra đề xuất và Claude đồng ý: **F-012 → F-010 → F-011**. Bốn test đỏ của Astra là đầu bài; chuyển vào bộ chuẩn khi sửa.



## Claude sửa F-012 — `bdabbab`, 20/09

- **Sửa:** `TYPES` trong `lib/owner/media.ts` và `IMAGES` trong `lib/owner/profile.ts` chuyển từ object literal sang **`Map`**, nên `constructor`/`toString`/`__proto__`/`valueOf`/`hasOwnProperty` trả `undefined` và dừng ở `415 UNSUPPORTED_MEDIA`. Đường upload của shop thêm **trần tuyệt đối `MAX_UPLOAD = 30 MiB`** kiểm độc lập với `rule.max`, để một quy tắc thiếu `max` trong tương lai cũng không mở trần.
- **Test:** hai ca tái hiện của Astra chuyển vào bộ chuẩn, mở rộng từ một tên lên **năm tên thừa kế**: trong `repository-tests/impersonation.spec.ts` (ca upload của shop, thử `size = 1 GiB`) và `repository-tests/account-profiles.spec.ts` (ca ảnh hồ sơ). Gỡ bản sửa thì **cả hai đỏ**; đã chạy để xác nhận, không chỉ đọc code.
- **Không đổi hành vi hợp lệ:** `image/jpeg|png|webp` ≤ 5 MiB, `video/mp4` ≤ 30 MiB giữ nguyên; 125 test repository xanh.
- **Nguồn gốc:** lỗi của Claude ở lát R2 upload. Bẫy đã ghi vào `operations-gotchas.md` ("Tra bảng trắng bằng chuỗi của người dùng thì phải dùng `Map`"), kèm ghi chú TypeScript không cảnh báo vì `Record<string, Rule>`.
- **Phạm vi chưa phủ:** đây là ký offline; chưa PUT thật lên R2, chưa có quota tổng/finalize/kiểm byte thật sau khi tải lên (vẫn là phần R2 Astra để ngỏ). F-010 và F-011 **chưa bắt đầu**.
- **7 bộ xanh trên `bdabbab`** trong worktree tạm: repository 125 · contracts 73 · client 75 · public 16+1 skip+2 · publishing 10+2 · owner 10+2 · admin 6+2.


## CI `integration public` — tìm ra nguyên nhân thật, `8d30f16`, 20/09

**Nguyên nhân:** `xvfb-run -a` đặt `DISPLAY`/`XAUTHORITY` cho tiến trình harness, nhưng `integration-tests/run-local.mjs` truyền môi trường cho tiến trình con bằng **danh sách cho phép** chỉ gồm `CI` và `CHROME_PATH`. Ca duy nhất mở Chrome **có cửa sổ** tự gọi `playwright.chromium.launch({headless:false})` từ trong tiến trình test, nên Chrome đó khởi động **không có X server** và chết:

```
Error: browserType.launch: Target page, context or browser has been closed
  ERROR:ui/ozone/platform/x11/ozone_platform_x11.cc:257] Missing X server or $DISPLAY
  ERROR:ui/aura/env.cc:246] The platform failed to initialize.  Exiting.
```

Một ca đỏ duy nhất: `browser-hardening.spec.ts:154` · `3E foreground visibility › actual same-window tab switch creates exactly one resume and preserves session`. **Giống hệt nhau ở cả tám lần chạy đỏ `#88`–`#95`** (Tài xác nhận). Mười sáu ca còn lại của job luôn xanh.

**Sửa:** thêm `DISPLAY` và `XAUTHORITY` vào danh sách cho phép. Ca test cũng được cho tự in bằng chứng: một `expect.poll(...).toEqual({sessions,opens,experiences,states,kinds})` thay bốn câu `expect` rời, cộng `info.attach` trong `finally`.

**Lỗi của Claude, ghi đủ:**
1. Thêm `xvfb` vào workflow (`173091d`) mà không kiểm biến môi trường có tới được tiến trình con không — chính Claude viết danh sách cho phép đó.
2. Tám vòng "đoán → push → chờ 6 phút" vì đọc log từ dưới lên: harness đổ log app đè lên phần Playwright, còn phần nêu tên ca đỏ và câu `expect` nằm cách cuối log hơn 100 dòng.
3. Bỏ qua bẫy đã tự ghi trong `operations-gotchas.md` (*"nó có từng chạy được bao giờ chưa?"*). Ca này **skip trên macOS mọi lần chạy**, tức chưa từng chạy ở đâu; lần đầu nó thực thi là trên CI.
4. Ở lượt trước Claude còn kết luận sai rằng bước "why it failed" rỗng — nó chạy đúng và đã nêu tên ca, chỉ bị thu gọn sau dấu ▸.

**Chưa chứng minh:** ca này **chưa từng chạy hết** ở bất kỳ đâu, nên chưa biết các khẳng định của nó (đúng một `resume`, giữ nguyên phiên) có đúng dưới X server không window manager không. Lần chạy CI sau `8d30f16` là lần đầu tiên kiểm được; nếu vẫn đỏ thì bằng chứng đã nằm sẵn trong thông báo lỗi.

**7 bộ xanh tại máy trên `8d30f16`:** repository 125 · contracts 73 · client 75 · public 16+1 skip+2 · publishing 10+2 · owner 10+2 · admin 6+2. (Ca `3E foreground visibility` là ca skip — tại máy luôn vậy.)


## Claude sửa F-010 — `0d5642e`, 20/09

- **Sửa:** `lib/owner/dashboard.ts` `read()` trước đây chỉ giấu lời khách với phiên `overview` và với thành viên không có công tắc góp ý; mọi thứ khác đi qua. Route này hỏi `authorize` quyền `'overview'`, mà **cả ba phạm vi đều qua được**, nên phiên `design` đọc được `topic/message/note` — dù chính phiên đó bị `comments.list` (hỏi quyền `'feedback'`) từ chối. Giờ điều kiện **nêu đúng một phạm vi được đọc** (`scope !== 'feedback'` thì giấu), để phạm vi thêm sau này mặc định là đóng.
- **Phạm vi lộ hẹp hơn báo cáo ban đầu:** nấc công tắc 2 (`edit`) đã chặn hẳn đường tổng quan với hỗ trợ (`SUPPORT_NOT_GRANTED`), nên **chỉ nấc 3 (`full`) từng lộ**. Test khẳng định cả hai nấc. Phát hiện khi test đầu tiên của Claude đỏ — lỗi ở test, không ở mã.
- **Test** trong `repository-tests/impersonation.spec.ts`: nấc `edit` phải bị từ chối; nấc `full` + `design` phải thấy `topic/message/phone/note` rỗng, chuỗi bí mật và số điện thoại không xuất hiện ở bất kỳ đâu trong response, và bản ghi kiểm toán `impersonation.read` phải ghi `feedbackShown:false`; phiên `feedback` cùng nấc vẫn đọc được bình thường. Gỡ bản sửa thì đỏ (`Received + "message": "Bí mật của khách"`), đã chạy để xác nhận.
- **Chưa phủ:** đây là mức repository. Chưa thêm khẳng định qua HTTP thật cho ca này; đường `/api/owner/v2/<shop>` đã có ca HTTP cho số điện thoại (F-003) nhưng chưa có cho phạm vi design.
- **7 bộ xanh trên `0d5642e`:** repository 126 · contracts 73 · client 75 · public 16+1 skip+2 · publishing 10+2 · owner 10+2 · admin 6+2.
- **Còn lại: F-011** (nháp thiết kế ghi trước, ghi sổ sau; ghi sổ lỗi thì nháp đã đổi mà sổ trống). Chưa bắt đầu.


## Claude sửa F-011 — `29af646`, 20/09. **Cả ba phát hiện của Astra đã đóng.**

- **Sửa:** `lib/owner/design.ts` gộp **kiểm quyền + thay đổi + sổ kiểm toán + dòng hoạt động** vào **một** transaction, cho `save`, `publish` **và** `preview` (preview cũng ghi một dòng, cùng hình dạng lỗi). `PublishingAdmin` nhận thêm `PoolClient` và **nhập vào transaction của bên gọi** thay vì mở transaction riêng.
- **Bẫy dính giữa đường:** phân biệt `Pool` với `PoolClient` bằng `connect` là **sai** — client cũng có `connect` và ném `Client has already been connected`. Phân biệt bằng `release`. Lỗi của Claude, đã ghi vào `operations-gotchas.md`.
- **Tác hại thật rõ hơn báo cáo ban đầu:** không chỉ "sổ trống". Nháp **đã nhảy revision** trước khi lỗi ném ra, nên lần thử lại nhận `DRAFT_CONFLICT` — người dùng đọc thành "có người khác đang sửa", trong khi thủ phạm là chính lần bấm trước của họ. Test bắt đúng điều này.
- **Test** trong `repository-tests/impersonation.spec.ts`: trigger làm mọi `INSERT` vào `admin_audit` với action `impersonation.design.%` ném lỗi; `save`/`preview`/`publish` đều phải ném `AUDIT_UNAVAILABLE`, nháp giữ nguyên revision, trang đang phát hành không đổi, `shop_activity` không có dòng `design.%`. Bỏ trigger thì lưu lại chạy bình thường và sổ ghi đúng revision. Gỡ bản sửa thì đỏ, đã chạy để xác nhận.

### Tài quyết (20/09) · Thao tác đang chạy khi quyền bị thu hồi giữa chừng

**Chọn: hoàn tất.** "Ai thao tác trước thì có quyền." Thao tác đã qua cửa kiểm quyền được chạy tới hết; khoá dòng quyết định ai là người trước; request **kế tiếp** của người bị thu hồi bị từ chối như bình thường.

Tài nêu một điểm đúng mà Claude đã nói ẩu: khoảng trống giữa kiểm quyền và thao tác **không phải vài chục mili giây**, vì phần lớn thao tác đều phải tải dữ liệu. Phân biệt hai khoảng trống khác nhau:

1. **Trong một request** (kiểm quyền → ghi): bản sửa này đóng hẳn, vì cả hai nằm trong một transaction. Không còn khoảng trống.
2. **Giữa các request** (đọc trang → người sửa → bấm lưu): đây là **thời gian suy nghĩ của người dùng**, hàng chục giây tới hàng phút. **Không khoá nào đóng được** khoảng này — giữ khoá suốt thời gian đó là treo cả bảng. Cách xử đã có và vẫn đúng: `expectedRevision` (khoá lạc quan) chặn hai người ghi đè nhau, và **quyền được kiểm lại ở đầu mỗi request**. Người bị thu hồi quyền lúc đang sửa sẽ bị chặn khi bấm lưu.

Kết luận cho Astra: câu hỏi "request đang chạy bị huỷ hay hoàn tất" đã được Tài chốt là **hoàn tất**, và ranh giới "đang chạy" giờ là **một transaction**, không phải một chuỗi kết nối rời. Nhóm `Cards.create`/`Media` chưa được rà lại theo chuẩn này trong lát này — đề nghị Astra soi tiếp nếu thấy đáng.

**7 bộ xanh trên `29af646`:** repository 127 · contracts 73 · client 75 · public 16+1 skip+2 · publishing 10+2 · owner 10+2 · admin 6+2.


## Lát A1 — chặn bot cho API trang khách, `94c825e`, migration 018, 20/09

**Bài toán Tài đặt ra khiến cách làm thông thường không dùng được:** Tài ước một phút cao điểm của quán đông là **trên 30 lượt chạm một thẻ**. Ở mức đó, **đếm số không phân biệt được** quán đông với bot: ngưỡng đủ chặt để bắt script sẽ chặn nhầm một chiều thứ Bảy. Nên lát này có **hai tín hiệu hỏng theo hai kiểu khác nhau**:

1. **Ba tầng đếm**, cửa sổ một phút, dùng lại template của `owner_login_limits` nhưng **bảng riêng** `public_request_limits` (lụt ở trang khách không được làm cạn ô đếm của đăng nhập chủ shop — lý do 005 đã tách ô của admin): một lượt tải trang (20/phút) · một thẻ (120/phút) · một địa chỉ (600/phút).
2. **Thời gian từ lúc trang mở lần đầu tới lúc có câu trả lời.** Người thật chạm thẻ, chờ trang, đọc, chọn sao: hàng giây. Ba mươi người vẫn là ba mươi người mỗi người mất vài giây. Script trả lời trong vài chục mili giây và **không giả được độ trễ mà không tự làm mình vô hại**. Ngưỡng đặt ở **400ms (sao) / 800ms (lời nhắn)** — thấp hơn hẳn mọi khách có thể, vì một lần gắn cờ nhầm là một khách thật bị ẩn khỏi shop của họ.

**Tài quyết (20/09):** vượt ngưỡng thì **vẫn nhận, gắn cờ**, không từ chối ai và không xoá gì. Cờ nằm trên **phiên** (`visit_sessions.suspected_at/suspected_reason`) chứ không trên lượt chấm, vì một phiên bot thổi phồng cả lượt chạm, cả điểm trung bình, cả số lời nhắn — một cờ phải kéo cả ba ra khỏi số liệu cùng lúc.

**Claude thêm một điều Tài chưa hỏi, nêu rõ ở đây:** một **trần tuyệt đối gấp 10 lần ngưỡng** vẫn **từ chối** (429). Đó không phải đảo lại lựa chọn của Tài về hành vi với khách — đó là câu hỏi khác: giữ cho dịch vụ sống, để một máy không bơm đầy database. Đám đông thật không bao giờ chạm tới mức đó.

**Địa chỉ IP:** tầng này **chỉ chạy khi có header tin được**. [Tài liệu Vercel](https://vercel.com/docs/headers/request-headers) ghi rõ Vercel **ghi đè** `x-forwarded-for` và **không chuyển tiếp IP ngoài**, *"to prevent IP spoofing"*. Không có header thì tầng này **không chạy**, chứ **không** gom mọi người vào một ô `unknown` — đó chính là cách giới hạn toàn nền tảng của F-002 trở thành đường khoá người thật ra ngoài.

**Trang khách và nút Google không bị đụng ở bất kỳ nhánh nào** (`google-policy.md` luật 1). Cờ không nhìn thấy được từ phía khách; chỉ đường ghi mới có thể bị từ chối, và 429 rơi vào nhánh "thử lại" sẵn có của transport, không làm vỡ trang.

**Bằng chứng không phải suy đoán:** test integration `owner-dashboard` lái **trình duyệt thật** qua trang khách (`goto /one` → bấm sao → gõ chữ → gửi) rồi khẳng định dashboard hiện `opens/sessions/rated/feedback` = 1. Vì các số đó đã loại phiên bị gắn cờ, một lượt khách thật qua trình duyệt **không** bị gắn cờ.

**Hai lỗi của Claude trong lát này, đã ghi vào `operations-gotchas.md`:**
1. `pg` trả `timestamptz` thành `Date`, nên `Date.parse` ra `NaN` và **cả tín hiệu thời gian im lặng tắt**. Không có lỗi nào; chỉ test bắt được.
2. Script Python sửa 11 danh sách migration ném lỗi ở tệp thứ 9, nên `run-local.mjs` ở cuối script **không được cập nhật** — đúng bẫy "thêm migration phải sửa hai chỗ". Bắt được nhờ `grep` lại.

**Chưa làm, để lát sau:** dọn dữ liệu bot đã lọt vào trước lát này; bảng thống kê cho chủ shop; chặn ở tầng CDN (cần Cloudflare, tức chờ B4). Cũng chưa đo chi phí hai truy vấn thêm mỗi request trên pool 3 kết nối của production — đáng đo ở E6.

**Đề nghị Astra rà:** ngưỡng và cách chọn ô đếm có chỗ nào một bên thứ ba ép được cờ lên phiên của người khác không (ô `entry:` dùng chung giữa mọi khách của một thẻ — cố ý, nhưng đáng soi); và `inspect()` chạy **ngoài** transaction ghi, nên một request bị từ chối ở trần vẫn đã đếm — đúng ý, nhưng cần xác nhận không có đường nào lệch.

**7 bộ xanh trên `94c825e`:** repository 133 · contracts 73 · client 75 · public 16+1 skip+2 · publishing 10+2 · owner 10+2 · admin 6+2.

**Chưa đẩy** (kể cả nhánh): có migration, chờ Tài chạy trên Neon production rồi preview.


## Tài giao 20/09 — chạy song song để xong năm lát P0 còn lại

Tài: "tiến tới làm xong các lát lớn, có kết quả càng sớm càng tốt, kéo Astra phụ nữa." Còn **A2, A3, A5, A6, A7** (`roadmap-slices.md`). A1 và A4 xong; A1 đã xác nhận chạy trên production (Tài đăng nhập `/gov` được sau migration 018).

### Chia việc (Claude đề xuất, chờ Astra nhận qua Tài)

| Lát | Ai | Vì sao chia thế |
|---|---|---|
| **A2 · 2FA bắt buộc cho admin** | **Claude** | Đụng đường đăng nhập đang chạy và có một bước chỉ Tài làm được (quét mã). Một bên tích hợp. |
| **A3 · Dọn mã cũ** | **Astra rà, Claude xoá** | Nguy hiểm của A3 là **xoá nhầm thứ đang chạy** — đã suýt xảy ra: bản roadmap 20/09 ghi nhầm `app/api/v2` vào danh sách xoá, Astra bắt được (F-005). Việc này đúng hình dạng của một lượt rà độc lập. |
| **A7 · Test bảo vệ luật cứng `google-policy.md`** | **Astra** | Là một lượt rà: đọc mười luật cứng, tìm chỗ nào chưa có test bảo vệ, viết test đỏ nếu phát hiện lỗ. Không đụng mã sản phẩm. |
| **A5 · Trang pháp lý nháp**, **A6 · Nén ảnh trên trình duyệt** | **Claude** | Tính năng, một bên tích hợp. |

### Đầu bài cụ thể cho Astra — A3: chứng minh từng route đã chết

Ứng viên xoá trong `roadmap-slices.md`: `app/api/owner/[shop]`, `app/api/shops`, `app/demo`, `shop-dashboard.tsx`, `owner-dashboard.tsx`, `lib/demo-store.ts`, `prototypes/`. **Không xoá `app/api/v2`** — đó là API trang khách đang chạy.

Cái Claude cần từ Astra, theo từng đường một:
1. Còn ai gọi tới không — kể cả từ **mã cũ**, từ test, từ `next.config`, từ `middleware`, và từ **trang khách bản cũ** (`/t/demo`, `/demo/*`).
2. Có **dữ liệu production** nào chỉ đọc được qua đường đó không (bảng `experiences` cũ là ví dụ: migration 002 giữ nó lại).
3. Xoá nó thì **test nào đỏ**, và test đó bảo vệ điều gì — đỏ vì mất tính năng thật hay đỏ vì test bám vào mã cũ (bẫy "đọc xem test đó thật sự bảo vệ điều gì" ở `operations-gotchas.md`).
4. Kết luận cho từng đường: **xoá được / chưa xoá được / cần lát riêng**, kèm bằng chứng.

Astra **không cần viết bản vá xoá**; Claude xoá và chạy bảy bộ. Worktree riêng, PG 55449, không dùng harness 3317–3319. Commit cố định để tách nhánh: **`8ff0c48`**.

### Đầu bài cụ thể cho Astra — A7: luật cứng nào chưa có test giữ

`docs/google-policy.md` mục 2 có **mười luật cứng**. Hiện chỉ biết chắc luật 1 và 2 có test (`public-v2.spec.ts`, `publishing.spec.ts`). Cần một bảng: mỗi luật cứng ↔ test nào giữ nó ↔ nếu không có thì **lỗ nằm ở đâu**. Đặc biệt soi: luật 3 (không điền sẵn sao sang Google), luật 7 (không gợi ý nội dung), luật 8 (nội dung marketing không đặt cạnh nút Google kiểu trao đổi) — vì lát A16 sau này sẽ thêm thẻ nội dung lên trang khách và cần hàng rào sẵn.

Cách kiểm hiệu quả nhất đã biết: **cố tình phá mã một lần** để chắc test bắt được (bẫy ở `operations-gotchas.md`). Nếu một luật cứng phá được mà bảy bộ vẫn xanh, đó là phát hiện.

### Thứ tự Claude làm

A2 → A6 → A5. A3 chờ kết quả rà của Astra; A7 nhận lại phát hiện của Astra rồi vá.


## Astra bàn giao A3/A7 — baseline `8ff0c48`

Nhánh `astra/a3-a7-audit`, worktree `/private/tmp/nfc-astra-a3-a7`, sạch. **Hai commit: `f819c0c` (A3 docs), `4c47be8` (A7 tests/docs)**. Không sửa code sản phẩm, không push, không PostgreSQL/Neon/harness.

### A3

Báo cáo `docs/astra-a3-route-audit.md`: prototype không có caller runtime, xoá/archival được cùng cập nhật README. Các ứng viên còn lại **vẫn có caller**: `/`→`/t/demo`→demo dashboard/store; `/ZZZ/[shop]` còn fallback ShopDashboard; `/[shop]` còn ShopFeedback legacy. API owner legacy không tự tắt khi owner-v2/publishing bật. Bảng `experiences` không được migration sang v2, auth cũ cũng không được tin/migrate tự động.

Thử bỏ từng shop-dashboard/owner-dashboard/demo-store làm tsc đỏ đúng import caller, sau đó khôi phục. Test browser bị ảnh hưởng đã map theo source (chưa chạy deletion browser experiment). **Không được xoá lifecycle tests chỉ vì chúng dùng `/t/demo` làm điểm đến**; đổi sang fixture trung lập. Không xoá api/v2 hoặc owner-dashboard.module.css đang dùng. Chưa kiểm số dòng production; báo cáo có SQL chỉ đếm để Tài/Claude xác nhận trước retire legacy. Không coi A3 toàn bộ đã dọn xong.

### A7 + F-013 · Cao về tuân thủ sản phẩm

`docs/astra-a7-google-audit.md` map đủ 10 luật → test → giới hạn. `tests/contracts/google-policy.spec.ts` thêm 3 test vào suite chuẩn (SSR Google sẵn trước API/sao; href không tự thêm nội dung; reject field feature bị cấm). **76 contracts passed**, tsc/lint xanh. Thử mutation ẩn Google đến khi ready / thêm rating vào href / nới field schema: cả 3 đỏ assertion, đã khôi phục byte gốc.

**F-013:** `validateConfig` chấp nhận link label “Đánh giá Google 5 sao để nhận quà” hoặc “Khi đánh giá Google hãy nhắc tên nhân viên An”; React renderer thật hiển thị ngay guest-links sau Google invitation. Luật 4/5/7/8 bị phá dù nút Google chính trung lập. Hai test đỏ nằm **ngoài suite mặc định** ở `audit-tests/google-policy.spec.ts`, chạy `node node_modules/@playwright/test/cli.js test --config=playwright.audit.config.ts`. Chưa có dữ liệu shop thật hay bằng chứng Google phạt. Tái hiện không gọi Google.

Claude nhận chốt hàng rào CTA ở publish/editor rồi sửa, chuyển hai test sang suite chuẩn khi xanh. Không hứa regex kiểm được mọi ngôn ngữ/ảnh. URL Google chỉ HTTPS, vẫn thiếu kiểm query/prefill do shop nhập; chưa chứng minh tham số bất kỳ làm Google chọn sao. A7 đầy đủ còn **hướng dẫn trong dashboard + tài liệu bàn giao shop**, tests luật 8/10 cần đi cùng A16/C1 khi có tính năng. Astra hoàn tất đúng phạm vi audit/tests được giao; **chưa đánh dấu A3/A7 tổng thể hoàn tất**. Claude tích hợp và chạy đủ 7 bộ; Astra không dùng harness để tránh xung đột A2/A6/A5.


## Claude: A2 và A6 xong — 20/09

- **A2 · 2FA admin** (`155697f`, migration 019, đã lên production). Cưỡng chế ở `authorizeAdmin`: admin chưa đăng ký bị từ chối ở **mọi** lệnh quản trị, nên màn hình yêu cầu đăng ký không đi vòng được bằng cách gọi thẳng API (test chứng minh: `/gov/api/shops` trả 403). Đăng ký dở **không** khoá được người cuối cùng ra ngoài: bí mật lưu trong khi `enrolled_at` còn null, chỉ một mã đúng mới bật. TOTP kiểm bằng **vector chuẩn RFC 6238**. Bí mật mã hoá AES-256-GCM bằng `NFC_TOTP_KEY`; thiếu khoá thì từ chối chứ không lưu trần.
- **A6 · Nén ảnh trên trình duyệt** (`fb58859`, không migration). `lib/client/shrink-image.ts`, dùng ở cả trình chỉnh trang và ảnh hồ sơ. Đo được **753 KB → 144 KB**. Ba luật giữ cho nó trung thực, mỗi luật một ca test: không giải mã được → giữ bản gốc; kết quả không nhỏ hơn → giữ bản gốc (hoa văn lặp đo được 137 KB PNG so với **942 KB** WebP); đã nằm trong giới hạn và đã là WebP → không đụng. Test chạy trong Chrome thật, và đã **cố tình phá mã một lần** để chắc nó bắt được.
- **Chưa làm trong A6:** "nhiều cỡ cho poster/logo" (`srcset`). Nó đổi hình dạng `PageConfig` **đã phát hành** và cách trang khách chọn ảnh — lát riêng, không gộp.

**Lỗi của Claude trong đợt này, đã ghi `operations-gotchas.md`:**
1. `NFC_TOTP_KEY` thêm cho Vercel nhưng quên **nơi bộ test chạy ngoài harness**; chạy local bằng biến gõ tay rồi báo "7 bộ xanh" — CI đỏ 21 test. Giờ `playwright.repository.config.ts` tự đặt khoá fixture, và Claude kiểm bằng `env -u`.
2. PostgreSQL từ chối số lặp regex quá 255 trong CHECK.
3. Fixture test A6 đầu tiên vẽ hoa văn lặp rồi gọi là "ảnh chụp": module đúng, test vô nghĩa. Phải **đo** thay vì đoán ảnh nào nén được.
4. `git add -A` suýt gom claim A3/A7 Astra vừa viết vào bảng thành commit của Claude — đúng bẫy "hai phiên cùng một worktree". Đã tách thành commit riêng ghi rõ do Astra viết.

**7 bộ xanh trên `c5fe8a7`** (chạy với `env -u NFC_TOTP_KEY`, đúng điều kiện CI): repository 137 · contracts 73 · client **76** · public 16+1 skip+2 · publishing 10+2 · owner 10+2 · admin 7+2.


## Tài giao 21/09 — việc lớn cho Astra: C3, kiểm thử xâm nhập trước khi có khách trả tiền

Tài: "giao cho Astra những cái gì lớn ấy, mức độ tiêu token rất lớn nên phải giao việc xứng đáng." Hai lượt vừa rồi xứng đáng: A7 tìm ra **F-013** mà bảy bộ test của Claude không bắt được, và A3 chứng minh **sáu trong bảy ứng viên xoá vẫn còn caller** — làm theo danh sách roadmap là phá `/ZZZ/[shop]`.

**Việc tiếp theo: C3 trong `roadmap-slices.md` — kiểm thử xâm nhập.** Đây là ẩn số lớn cuối cùng trước khi ghi thẻ cho khách trả tiền, và là việc đúng hình dạng cho một bên rà độc lập: không phải đọc lại mã Claude vừa viết, mà là **cố phá một hệ thống đang chạy**.

Baseline: commit đầu `main` sau khi A6 xanh (Claude ghi số vào đây khi đẩy xong). Worktree riêng, PostgreSQL 55449, **không** harness 3317–3319, **không** chạm production/preview/Neon thật, **không** dữ liệu thật.

### Ba mặt trận, xếp theo mức thiệt hại nếu thủng

**1. Cô lập giữa các shop (nặng nhất).** Một shop đọc được khách của shop khác là hỏng sản phẩm, không phải hỏng tính năng. Mọi route, mọi bảng, mọi export: shop A có đường nào chạm dữ liệu shop B không — qua slug, qua id đoán được, qua cursor phân trang, qua thông báo @, qua luồng bình luận, qua link đặt mật khẩu, qua phiên hỗ trợ. Đã có F-008 là tiền lệ: quyền ở **một** shop từng reset được danh tính dùng chung ở shop khác.

**2. Đường ghi của trang khách, gồm cả A1 vừa làm.** Máy trạng thái lượt ghé/sao/góp ý dưới tấn công: phát lại intent, đua hai tab, revision giả, phiên hết hạn, capability của phiên khác, thân request méo. Và ba tầng đếm của A1: có đường nào **ép cờ nghi ngờ lên phiên của người khác** không (ô `entry:` dùng chung giữa mọi khách của một thẻ — cố ý, nhưng đáng soi); trần tuyệt đối có chặn thật không; `inspect()` chạy **ngoài** transaction ghi nên một request bị từ chối vẫn đã đếm — đúng ý, cần xác nhận không có đường nào lệch.

**3. Đường media/R2.** Astra đã nêu và chưa làm: quota tổng, không có bước finalize, không kiểm byte thật sau khi tải lên, TTL/phát lại của link ký, thu hồi quyền sau khi đã ký. **Thêm một điểm từ lát A6:** nén ảnh chạy trong trình duyệt nên **không phải một biện pháp an toàn** — ai gọi API trực tiếp vẫn ký được link cho đúng trần. Server ghim `content-type` và `content-length` vào chữ ký; cần kiểm xem ghim đó có thật sự ràng buộc nội dung không, và chuyện gì xảy ra nếu bytes gửi lên không khớp loại đã khai.

### Cái Claude cần nhận lại

Không cần bản vá. Cần, theo từng phát hiện: **mức độ · tệp:dòng · cách tái hiện (tốt nhất là test đỏ) · thiệt hại thật nếu bị khai thác · đề xuất hướng sửa**. Và **nói rõ cái gì chưa kiểm** — phần giới hạn trong hai báo cáo vừa rồi là thứ làm chúng đáng tin.

Nếu ba mặt trận là quá một lượt, làm mặt trận 1 trước và bàn giao, đừng làm mỏng cả ba.

### Claude làm song song

**F-013** (sửa hàng rào CTA, cần Tài chốt một câu về nhãn link), rồi **A5** (trang pháp lý nháp), rồi **A3** theo đúng kết luận của Astra: xoá `prototypes/`, còn lại là lát riêng có kiểm dữ liệu trước.


### Astra nhận C3 — 21/09

Baseline **deba8c1**, nhánh **astra/c3-pentest**, worktree `/private/tmp/nfc-astra-c3`. Ưu tiên mặt trận 1 tới nơi; PostgreSQL riêng 55449 và HTTP local dự kiến 3429, không dùng harness 3317–3319. Chỉ thêm test/báo cáo, không sửa sản phẩm; không Neon/preview/production/dữ liệu thật. Claude tiếp tục F-013/A5/A3.


## Claude bàn giao cuối phiên — 21/09/2026, commit `72c17cd`

**Xong trong phiên:** A1 (018) · A2 (019) · A4 · A6 · F-010 · F-011 · F-012 · **F-013** (hàng rào CTA, Astra tìm
ra ở A7) · A3 phần xoá được · **mục 7 — dòng sự kiện hành vi** (020) · **lát B — khách tự xoá dữ liệu** (021) ·
chuyển sang tên miền `.com` · đổi vùng chạy hàm sang Singapore · tái cấu trúc `decisions.md`.

**7 bộ xanh trên `72c17cd`:** repository 142 · contracts 80 · client 81 · public 16+1 skip+2 · publishing 11+2 ·
owner 10+2 · admin 7+2. Chạy bằng `env -u NFC_TOTP_KEY` cho giống CI.

**Hai thứ lát B để lại cho A5:**
1. API xoá đã có và đã kiểm (`POST …/visits/<visitId>/erase`), nhưng **trang khách chưa có nút bấm**.
2. Rollback phải đi ngược thứ tự **021 trước 003** — 021 thay trigger mà 003 dựng.

**Lỗi của Claude trong phiên, đã ghi `operations-gotchas.md`:** route sự kiện đặt sai nhánh (`/api/v2/shops/…` bị
tắt khi publishing bật, tức mọi thẻ thật) · beacon thiếu chứng thực `X-NFC-Render` → 403 · sự kiện ra sai thứ tự
và sai mốc thời gian · "bỏ giữa chừng" bắn mỗi lần render · route mới chưa làm nóng làm bộ admin đỏ ở chỗ không
liên quan · beacon "bắn rồi quên" sống lâu hơn test nên deadlock với `TRUNCATE` · IP lưu thô và bảng đếm không tự
dọn (tìm ra khi viết chính sách) · lệnh `read -p` viết cho bash làm **lộ chuỗi kết nối production**.

**Cho Astra:** C3 mặt trận 1 vẫn là việc đang giao. Nếu prompt bị chính sách ChatGPT chặn, viết rõ **rà soát
phòng thủ trên hệ thống của chính chủ sở hữu, có cho phép, local, dữ liệu giả** — mô tả kiểu "tấn công" là thứ
kích hoạt bộ lọc.

## C3 mất chủ — 22/09/2026

Tài báo: **Astra không được OpenAI cho phép làm C3**. Mô tả công việc kiểu "kiểm thử xâm nhập" chạm chính sách an ninh mạng của ChatGPT, kể cả khi đã ghi rõ là rà soát phòng thủ trên hệ thống của chính chủ sở hữu.

Hệ quả, ghi rõ để không ai tưởng C3 vẫn đang chạy:

- **Nhánh `astra/c3-pentest` (baseline `deba8c1`) dừng ở đó.** Không có báo cáo, không có test đỏ, không có kết luận về cô lập dữ liệu giữa các shop.
- **C3 chuyển sang Claude.** Không còn bên thứ hai rà độc lập, nên mất đúng thứ làm A3/A7 đáng tin: người rà không phải người viết. Claude rà mã Claude viết là một điểm yếu **đã biết**, không phải điểm yếu bị bỏ sót.
- **Cách bù:** làm C3 mặt trận 1 bằng **test đỏ trước, sửa sau** — mỗi đường nghi ngờ phải có một test chứng minh nó thủng trước khi vá, để kết quả không phụ thuộc vào việc Claude tự tin hay không.
- Nếu sau này có bên rà độc lập khác (người thật, hoặc một agent khác), mặt trận 1 vẫn nên được làm lại.

**C3 không chặn việc thiết kế.** Nó chặn đúng một việc: **đưa thẻ cho một quán trả tiền.**


## C3 mặt trận 1 — Claude làm, 26/09/2026

Báo cáo: [`security-review-c3.md`](security-review-c3.md). Tóm tắt: quét tĩnh mọi câu SQL chạm bảng của quán, cổng của
59 route, và ma trận test `repository-tests/tenant-isolation.spec.ts` (quán một tấn công quán hai qua slug và qua id ở
hơn 50 đường). **Một phát hiện, thấp, đã sửa bằng test đỏ trước:** F-C3-1 — bộ đếm chống bot đếm theo id lượt ghé của
quán khác. Mặt trận 2 chỉ rà phần bộ đếm; **mặt trận 3 (media/R2) chưa rà**. Vẫn là người viết tự rà: nếu có bên độc
lập, làm lại mặt trận 1.

## A3 dọn mã cũ — Claude làm theo bản rà của Astra (`f819c0c`), 26/09/2026

Làm đúng thứ tự Astra đề xuất sau khi Tài đếm dữ liệu đời cũ trên cả hai branch (đều 0): nhóm demo và nhóm server đời
cũ gỡ cùng lát, test lifecycle giữ nguyên nhưng "trang rời đi" đổi từ `/t/demo` sang `/dieu-khoan`, test 404 cho các
route đã gỡ. Khác với ghi chú của Astra ("giữ các bảng"): Tài chốt xoá, nên migration 028 xoá bốn bảng — kèm chốt chặn
dừng nếu có dòng. Phần còn lại tách thành **A3b** (`roadmap-slices.md`).

## A7 — Claude hoàn tất phần bàn giao của Astra (`4c47be8`), 26/09/2026

F-013 đã đóng 21/09 (nhãn nút cố định + dây bẫy chữ tự do). Lát này làm hai việc Astra để lại: **test/luật URL Google
(luật 3)** — chốt danh sách host thay vì chỉ `https://`, vì nút trỏ được sang trang riêng hỏi sao trước; từ chối tham số
`rating/stars/text…` (không khẳng định Google hiểu chúng, chỉ là luật sản phẩm) — và **hướng dẫn dashboard + tờ bàn
giao** (`/huong-dan-google`). Luật 8/10 vẫn chờ A16/C1 có luồng thật, như Astra ghi.

## F-I1 · Trung bình khi tự chạy · IP khách giả được bằng header tự gửi — Claude, 26/09, đã sửa

`server/guest-limits.ts` `clientAddress` đọc `x-vercel-forwarded-for` ?? `x-real-ip` ?? `x-forwarded-for`. Trên Vercel an
toàn (Vercel ghi đè); ngoài Vercel thì khách tự gửi header, né tầng đếm theo địa chỉ (A1). Sửa trong lát I1: chỉ tin một
header do môi trường khai (`NFC_CLIENT_IP_HEADER` / tự nhận `VERCEL=1`). Ca test giả mạo trong `visit-v2-api.spec.ts`; đã
thử phá (trả về cách cũ → ca đỏ). Production trên Vercel không đổi hành vi. Astra rà lại nếu có dịp.
