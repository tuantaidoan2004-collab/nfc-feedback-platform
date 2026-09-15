# Bàn giao NFC cho Antigravity — 2026-09-15

## Mở đúng bản trước khi làm gì

Thư mục nguồn được xác minh khi bàn giao:
`/Users/doantai/.codex/worktrees/1b35/Branded page through NFC card`

Branch: `feat/local-app-foundation`; HEAD: `172af2f4628635666ac835cccd19ba77b7cbcfd3`.
**HEAD không chứa hết công việc:** nhiều source, migration, test và docs còn untracked/dirty. Không chỉ đọc git diff hoặc clone GitHub rồi kết luận đã có bản mới.

Thư mục `/Users/doantai/Documents/ChatGPT/Branded page through NFC card` tại lúc kiểm tra là main, HEAD `68e435b98b8c98a888690ca343503c767c678097`, không phải bản tiếp tục. Không chép đè hai bản lên nhau. Symlink node_modules ở worktree trỏ dependencies có sẵn trong Documents; đó không phải vị trí source chính và không đưa vào Git.

Chỉ một agent được sửa source tại một thời điểm. Tài cần tạm dừng writer khác trước khi Antigravity làm việc. Nếu không mở được worktree này, báo đường dẫn thực tế và dừng sửa; chưa có bản copy thay thế nào được tạo trong lần bàn giao này.

## Lượt đầu: tiếp nhận, chưa phát triển

1. Xác nhận `pwd`, `git rev-parse --show-toplevel`, branch/HEAD và `git status --short`.
2. Chạy `python3 scripts/verify-handoff.py`. So khớp inventory hash của source đã bàn giao, không chạy app/test và không đọc .env. Khác biệt không đồng nghĩa lỗi: liệt kê, xác định người tạo và lý do trước khi sửa. Không tự restore cho khớp hash.
3. Đọc lần lượt AGENTS.md → docs/decisions.md (ưu tiên cuối file) → docs/agent-skills.md → docs/publishing-core.md → docs/owner-dashboard-v2.md. Đọc docs/local-development.md trước chạy app và các contract liên quan trước sửa module. Nếu thiếu quyết định sản phẩm mới tra Obsidian theo AGENTS; không nhập cả vault/chat.
4. Báo ngắn: đang mở đường dẫn nào, hiểu kiến trúc ra sao, phần nào đã đạt/chưa production, phần dự định sửa và phần giữ nguyên. Chờ Tài chọn/duyệt lát tiếp; không mặc định tiếp tục yêu cầu cũ từ ảnh hoặc lịch sử chat.

Inventory là mốc so sánh file, không phải backup, chữ ký tin cậy hoặc bằng chứng code an toàn. Nếu người khác sửa source sau mốc, không ghi đè thay đổi đó. Không tự cập nhật inventory để che diff.

## Bối cảnh và các bất biến

Sản phẩm bán thẻ NFC cho nhiều shop. Một app/template dùng chung; mỗi shop có config/release và dữ liệu riêng, không tạo một Vercel project cho mỗi shop. Tài chủ dự án và quyết định sản phẩm; không coi đề xuất cũ là đã chốt.

- `/<shop>`: trang khách; `/t/<code>`: thẻ resolve active release; `/ZZZ/<shop>`: dashboard cần auth/membership thật. URL không phải quyền.
- Google invitation giống nhau mọi mức sao, truy cập được trước rating. 1–3 có góp ý riêng/pulse, không giấu Google. Sao nội bộ không phải Google review; chưa metric chứng minh Google click/review.
- Trang khách mặc định Việt + đổi English thủ công, không nhận diện/dịch AI từng lượt.
- Mỗi load/reload/restore/resume có visit; retry loadKey không nhân đôi. Session idle15phút theo browser/shop/scope/entry, không unique person. Rating/feedback cùng experience/shared revision. Không tái thiết kế coordinator đã kiểm thử.
- Release không tách session. Render proof pin nguồn của visit, initial session source và first-rating origin có thể khác; receipts bất biến. Disable/suspend chặn tab cũ. Preview capability riêng, scope test không vào live.
- Dashboard cohort là các phiên có open phù hợp bộ lọc, xem trạng thái experience hiện tại. CSV/JSONL/dictionary dùng cùng semantics; đọc docs trước sửa KPI.
- Tài không cấm cookie: browser anonymous identity và owner HttpOnly auth cookie là hai mục đích riêng.

## Bản đồ tránh sửa nhầm

| Phần | Nguồn chính | Chú ý |
|---|---|---|
| Trang khách v2 | components/shop-feedback-v2.tsx; lib/client/; server/visit-v2-*; app/api/v2/ | Giữ lifecycle/retry/revision; đừng sửa demo để tưởng đã sửa sản phẩm |
| Publishing | lib/publishing/; server/publishing-runtime.ts; migration003 | Admin callback nội bộ chưa phải admin UI/auth production |
| Owner thật local | components/owner-dashboard-v2.tsx; components/owner-login.tsx; lib/owner/; server/owner-v2.ts; app/api/owner/v2/; migration004 | Data thật fixture v2, server tenant/live-scope guards |
| Legacy/demo | components/owner-dashboard.tsx; components/shop-dashboard.tsx; lib/demo-store.ts; /t/demo; /demo/dashboard; server/auth.ts | Không thay thế owner-v2 bằng demo-store; không tin legacy sessions như auth mới |
| Media/editor sau | schema config hiện có, chưa R2/editor | Full-bleed/logo/background/watermark/links trong schema không có nghĩa visual đã dựng xong |
| Quyết định/evidence | docs/decisions.md + tài liệu từng lát | Test đã chạy là lịch sử local, không được tự claim đã chạy lại |

## Trạng thái kiểm chứng lúc bàn giao

Publishing Core:48checks; Owner Auth/Dashboard/Export:15nhóm (3pure+8PG+3HTTP/Chrome/PG+1production gate), type/lint/build đạt ở các lượt trước. Owner export601rows/3chunk, không phải benchmark triệu hàng. Đọc chi tiết ngày/lệnh/giới hạn trong docs, không rerun full client/Safari nếu không đổi boundary.

Next/PostgreSQL test đã dừng ở cuối lát trước; không khởi động lại trong lần lập tài liệu này. Symlink node_modules vẫn còn. Runtime development gates đóng production; chưa deploy. Không có bảo đảm đầy đủ iPhone/Safari owner flow, MFA/reset/provisioning production, HTTPS cookie thực tế, retention/backup/load test. Next dev HTML no-cache là override framework; private API/export no-store và build HTML no-store đã được kiểm tra.

## Quy trình mỗi lát sau khi Tài cho phép

- Nêu phạm vi file và acceptance criteria trước edit; đọc git status/baseline, giữ dirty foundation.
- Phân biệt thay đổi Antigravity với nền có sẵn. Không git reset/clean, checkout đè, blanket stage hoặc chép toàn Documents lên worktree. Commit/push cần Tài cho phép riêng.
- Không đọc/copy .env, credential từng dán trong chat, vault hoặc dữ liệu khách vào prompt/log/Git. Không cài dependency/service, deploy, R2 thật hoặc đổi production gates khi chưa được phép.
- DB migrations mới additive; không sửa lịch sử001–004 đã bàn giao để làm test xanh. Không tự đổi auth, session, cohort, preview isolation hoặc giảm test/security bar; nếu cần, trình quyết định cụ thể.
- Test local bằng harness allowlist/env fixture, không chạy Next trực tiếp tại chỗ có .env thật. Kiểm tra fixture runtime/DB paths có tồn tại; không tự cài khi thiếu. Xem docs/owner-dashboard-v2.md cho cổng55439 và lệnh.
- Cuối lát ghi docs: mục tiêu, file tạo/sửa, nguồn quyết định, lệnh/kết quả, lỗi còn lại, giới hạn; dừng. Gửi cho Astra path/HEAD + diff của cả tracked/untracked, migration, test và checkpoint, không full transcript.

## Thứ tự tiếp theo đề xuất, chưa được lệnh thực hiện

1. Tài duyệt một snapshot source đầy đủ đã rà secrets hoặc commit chọn lọc; gồm untracked, loại .env/node_modules/build/test artifacts. Giữ mốc quay lại trước writer mới.
2. Admin editor và duplicate product local: quyền Tài riêng owner, versioned config/CAS/preview/publish; copy cấu hình không copy auth/khách hàng/lịch sử.
3. Astra review ranh giới admin/owner và publish trước nối media thật.
4. Media library/R2 boundary local rồi Astra review upload/asset ownership; R2 thật chỉ khi được cấp phạm vi.
5. Renderer showcase dựa config đã ổn định; giữ Google/VIEN/session. Astra review tổng thể trước pilot.

Kế hoạch và prompt Astra: docs/astra-security-review-plan.md. Không có task hay lịch chạy nền nào được tạo.
