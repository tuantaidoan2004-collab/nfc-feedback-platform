# Owner Auth + Dashboard v2 + Export — local development

Ngày 2026-09-14. Lát lớn tiếp theo Publishing Core, không editor/R2/production. Các file chính: `db/migrations/004_owner_dashboard.sql`, `lib/owner/{auth,filters,dashboard,export}.ts`, `server/owner-v2.ts`, `app/api/owner/v2/`, `app/owner/login/`, `app/ZZZ/[shop]/page.tsx`, `components/owner-dashboard-v2.tsx`, `components/owner-login.tsx` và CSS module riêng.

## Phạm vi và threat model

Tài cấp tài khoản nội bộ cho người quản lý; credential không tự đăng ký. Kẻ ngoài có thể đoán username/password, sửa slug/body/cursor, giả role, thử export chéo shop hoặc tiếp tục đọc sau khi hết quyền. Boundary server kiểm chứng credential/session/membership/shop state. Browser không là nguồn quyền. Private feedback/note/audit không đưa vào public response hoặc log. SQL có tham số, cấu trúc filter/dataset allowlist; React escape text, không HTML tùy ý.

Migration004 additive tạo identity/membership/session/throttle/case/audit v2, indexes đọc; không sửa/backfill foundation hoặc Publishing. Không mặc nhiên tin/migrate owner_users/memberships/owner_sessions legacy. `/owner` được dành riêng; nếu có shop cũ trùng tên thì migration từ chối, không tự đổi/xóa. Rollback004 chỉ chạy transaction khi không có dữ liệu mới; không xóa quyền/lịch sử để rollback.

## Đăng nhập và quyền

- Local credential flow thật: username chuẩn hóa ASCII lowercase, password bootstrap tối thiểu12 ký tự/tối đa256byte. Node async scrypt, N=131072/r=8/p=1, salt ngẫu nhiên16byte, key32byte, maxmem256MiB; scheme cố định/versioned. Timing-safe compare; tài khoản không tồn tại vẫn chạy KDF với dummy material. [Node crypto scrypt](https://nodejs.org/api/crypto.html#cryptoscryptpassword-salt-keylen-options-callback).
- Bootstrap là method nội bộ bắt buộc callback cấp quyền; fixture callback chỉ dành test. Chưa có cấp account/admin UI, reset mật khẩu, OAuth/email/MFA. Không có account/password hardcode, không đọc env thật, không NEXT_PUBLIC secret.
- DB throttle: một KDF cùng lúc/database qua try advisory transaction lock, global60attempt/phút và8attempt/username trong15phút. Bucket username chỉ hash domain-separated, attempt thất bại vẫn commit; account không tồn tại/có thật chung lỗi LOGIN_FAILED. Xóa bucket cũ sau1giờ. Không tin IP header. Đây là mức local tối thiểu; trước production cần edge/distributed admission, chống credential stuffing/DoS, policy recovery/reset/MFA và benchmark KDF trên hạ tầng thật.
- Login tạo token CSPRNG32byte; DB chỉ SHA256 với domain `nfc-owner-session-v2`. Cookie nfc_owner_v2, HttpOnly, SameSiteStrict, path `/`, Secure khi requestHTTPS. Rotate mỗi login, revoke token cũ trong cùng transaction; logout revoke rồi clear cookie. Hết hạn tuyệt đối8giờ; không sliding expiry. Last-used cập nhật gần đúng mỗi5phút qua access shell/export; không phải analytics mọi request.
- Mọi read/write/export: active identity, session chưa revoke/hết hạn, active membership cùng shop, shop active. Role owner/manager hiện cùng quyền xem/xử lý/export; chưa platform admin/test UI. Authz share locks trên session/user/member/shop đến hết transaction read/write; kiểm DB expiry lại sau khóa. Slug/client role không cấp quyền. Export kiểm lại fresh auth trước từng chunk, nên revoke/suspend ngắt các chunk sau.
- State changes yêu cầu Origin bằng APP_ORIGIN chuẩn + Sec-Fetch-Site same-origin nếu có, JSON có cap/allowlist. Không đổi CORS; cookie không ở JavaScript. `/ZZZ/<shop>` chưa login redirect về `/owner/login?next=...`; next chỉ cho đúng path dashboard, không open redirect.

## KPI và bộ lọc: cùng một cohort

Nhóm chọn là **page_visits live phù hợp khoảng thời gian + nguồn/tag + release**, cùng optional rating/status hiện tại của experience. Các chỉ số:

| KPI | Nghĩa |
|---|---|
| opens | Số lượt mở trong nhóm chọn; không chứng minh chạm NFC |
| sessions | Số session15phút khác nhau có ít nhất một open trong nhóm; không unique person |
| rated | Số experience hiện tại của các session đó |
| average | Trung bình sao nội bộ của rated experiences; null nếu không có |
| feedback | Số experience trong nhóm đang có góp ý riêng |
| unresolved | Feedback có effective status khác resolved |

Một phiên có open trong khoảng lọc có thể được chấm hoặc sửa sau khoảng đó; bảng cho **trạng thái hiện tại**. Không coi đây là số rating events trong ngày. Không có Google click/review KPI vì v2 chưa có event đáng tin; giữ backlog.

Date input là ngày lịch Asia/Ho_Chi_Minh: from inclusive00:00, to inclusive cả ngày, query UTC exclusive00:00 ngày kế. Source direct/tag UUID/unknown; release UUID/unknown; rating1–5; status new/progress/resolved. API không nhận scope=test. Source/release của hàng experience là open mới nhất phù hợp bộ lọc; origin_release_id riêng giữ nguồn rating đầu. Unattributed history được để null/chưa rõ.

KPI và rows cùng một SQL statement snapshot. Bảng50hàng, seek theo first_interaction_at DESC/session_id DESC, cursor giữ6 số microsecond để không bỏ/trùng hàng cùng millisecond. Không OFFSET. Các trang sau là fresh snapshots: thay filter/state giữa các request có thể đổi tập chọn, không hứa snapshot toàn bộ phiên duyệt. UI source/release options tối đa100 gần đây; API vẫn hỗ trợ ID cũ hợp lệ trong shop. Không lộ browser hash, credential, proof, token.

## Xử lý góp ý

Case riêng theo live experience, optimistic case_revision và expectedExperienceRevision. Khóa experience để tránh rating/feedback mới chen xử lý; case revision stale hoặc customer revision thay đổi trả409. Mỗi lần lưu append audit actor/time/status/note/customer revision; audit bất biến. Không mutate receipt/release/customer history. Chỉ experience có private feedback mới xử lý được.

Case lưu feedback_seen_at. Góp ý mới hơn mốc đã xử lý thì effective status tự trở lại new, giữ note/audit cũ. Lần rating mới không tự mở lại góp ý. Hai người quản lý cùng shop cập nhật cạnh tranh chỉ một thắng. UI conflict tải trạng thái mới, yêu cầu xem lại; không tự ghi đè. Mất kết nối sau gửi thì yêu cầu tải lại kiểm tra, không hứa exactly-once cho note/action vì chưa có handling intent idempotency.

## Export version1

GET `/api/owner/v2/<shop>/export` với cùng filters; không nhận cursor. `dataset=experiences|page_visits|receipts`, `format=csv|jsonl|dictionary`.

- Experiences: aggregate hiện tại, một hàng/session của cohort, kèm private message/latest handling note/status.
- Page visits: từng open phù hợp bộ lọc, không thêm fake event.
- Receipts: toàn bộ immutable rating/feedback history của session thuộc cohort, có source visit/release của từng receipt. Có thể chứa event ngoài khoảng thời gian/release của open filter; từ điển ghi rõ. Không phải xuất bảng auth hoặc browser identities. Audit xử lý owner chưa là một dataset export riêng.
- CSV UTF-8 BOM, CRLF, mọi cell quote và escape double-quote; prefix apostrophe cho text bắt đầu control hoặc whitespace + `=+-@`. Cùng áp dụng cho mọi cột text, kể cả note/topic/source label. Không dựa vào quote đơn thuần chống formula. Giá trị text nguy hiểm được trung hòa, nên khác raw text; JSONL giữ raw text.
- File có schemaVersion/dataset rõ; header X-NFC-Export-Version và filename cố định theo enum, không lấy input để ghép filename. JSONL một JSON object/dòng. Dictionary JSON mô tả mọi field/type/unit/nullability/timezone và cohort/raw-vs-aggregate semantics.
- PostgreSQL read-only repeatable-read cursor, FETCH256hàng/chunk, ReadableStream backpressure highWaterMark0. Buffer ứng dụng tối đa một chunk, không gom dataset. DB có thể sort/materialize/spill tùy query; chưa benchmark triệu hàng.
- Một export đang mở/owner qua advisory lock; export thứ hai trả409. Cancel/request abort/DB error/idle60giây đóng connection và snapshot; fresh authorization trước từng FETCH. File bị ngắt phải bỏ và tải lại, không có resume/checksum/job queue. Bytes đã gửi trước revoke không thu hồi được. Runtime cursor có pool riêng max2, tách pool auth/API max3 để cursor không chiếm hết chỗ kiểm quyền; connection timeout5giây. Chưa load-test nhiều owner export đồng thời; cần pool/admission/work_mem/timeout vận hành trước production.

## UI và caching

Shell server đã auth, dữ liệu riêng lấy API no-store. Dashboard tiếng Việt, filter/KPI/feedback/export, responsive390px/desktop, loading/empty/error/expired rõ. Không menu editor/nút giả. /t/demo và /demo/dashboard giữ browser-only legacy. ~~Khi tab hidden dữ liệu/draft note trong memory được bỏ~~ (thay ngày 18/09, lát C2: Tài chọn tốc độ, dữ liệu ở lại khi tab ẩn và được cập nhật âm thầm khi quay về; khôi phục BFCache vẫn tải lại); chưa hứa lưu draft qua chuyển tab/reload/crash. English dashboard chưa làm; trang khách VI/EN nguyên trạng.

Private API/export/login/logout có `private, no-store`, nosniff, no-referrer, frame deny; owner routes có CSP frame-ancestors/object/base restrictions và noindex. **Next16.3.4 dev tự override HTML Cache-Control thành no-cache,must-revalidate** (đã đọc base-server.js); không sửa framework. Shell không chứa feedback/note. Bản build dynamic owner HTML đã kiểm tra no-store. Trước phát hành cần kiểm tra HTTPS/Secure cookie và history/caching trên Safari/iPhone thật; chưa claim các test đó.

Gate `NODE_ENV=development && NFC_OWNER_V2_ENABLED=true`; không bật được bằng flag ở production. Runtime fixture còn bật Publishing/V2 bằng flags tương ứng. Không kích hoạt môi trường thật.

## Verification / lệnh

`node integration-tests/run-local.mjs --owner owner-dashboard.spec.ts --build` dùng source allowlist/env sạch/DB schema ngẫu nhiên, không đọc .env*. PostgreSQL fixture tại127.0.0.1:55439; khởi động pg_ctl cần `-o '-p 55439 -h 127.0.0.1'`, tránh cổng mặc định5432. Dependencies có sẵn, không cài thêm.

- Pure: timezone/invalid filters, CSV injection/quote/dictionary, domain-separated hash.
- PG: credential/rotation/revoke/expiry/membership/tenant, throttle, live/test/date/release cohort, CAS/audit/reopen, keyset microseconds, export601rows/3chunks, cancel/abort/revoke/DB termination/concurrency/resource cleanup, rollback guard.
- Next HTTP/Chrome: customer Publishingv2→login→dashboard true numbers, handling/conflict, filters, native CSV download + JSONL/dictionary, expired/unauthorized/cross-shop/CSRF, no-store/no-leak, logout, mobile-width layout, minimal legacy demo regression. Locator lỗi ban đầu đã sửa dùng accessible role; không nới assertions dữ liệu.
- Build/standalone/type/lint/diff và production gate owner/publishing đóng. Kết quả cuối trong decisions.md. Không chạy lại full client/Publishing/Safari matrix không thay đổi.

## Điểm dừng và prompt kế tiếp

Không pilot-ready: chưa provision/reset/recovery/MFA production, HTTPS cookie/browser lifecycle thật, retention/backup/rate-limit/load testing, UI English, export resume/jobs hoặc audit UI. Không Neon/env thật/R2/editor/AI/payment/deploy/dependency mới/commit.

Prompt đề xuất: “Đọc decisions.md và owner-dashboard-v2.md. Bảo toàn dirty foundation; rà Owner Auth/Dashboard/Export trước. Chuẩn bị lát lớn Admin editor + media library/R2 boundary + duplicate product: phân quyền Tài riêng owner, validated versioned config, asset lifecycle/ownership, preview/publish/CAS, copy config sang shop mới không copy dữ liệu khách/auth. Chỉ nối R2 thật khi được cấp phạm vi tài nguyên; không tự deploy/đọc secrets/cài dependency. Kiểm thử local boundary mới và dừng cuối lát.”
