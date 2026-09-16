# Quyết định dự án NFC

Checkpoint mới nhất: “Owner Auth + Dashboard v2 + Export — bàn giao” ở cuối file. Session15phút vẫn ưu tiên hơn các mô tả experience-per-open/token riêng document cũ.

## Mục tiêu đã xác nhận

Bán thẻ NFC cho shop; mở trang thương hiệu để khách chia sẻ trải nghiệm và chủ shop hiểu những điều doanh số, camera hoặc truyền miệng chưa giải thích được. Khoảng 100.000đ/shop/tháng là giả thuyết giá, chưa kiểm chứng. Chủ dự án tự lo kế hoạch bán hàng.

## Đã chốt

- Trang mobile có logo, ảnh/event shop chọn, tên shop, nút Google Maps, Zalo OA, Instagram và các link tùy chỉnh. Bỏ slogan trang trí.
- Một lần chấm sao ghi nhận ngay, không cần gửi chữ hoặc bấm Google. Đổi sao của cùng trải nghiệm cập nhật bản ghi cũ, không cộng thêm lượt.
- Mời Google giống nhau ở mọi mức sao và vẫn cho truy cập trước khi chấm. 1–3 sao mở thêm góp ý riêng; khách 4–5 sao cũng có thể gửi riêng. Đã bỏ phương án chỉ mời nhóm 4–5 sao lên Google.
- Sao nội bộ không phải sao Google. Bấm Google không đồng nghĩa đã đăng review.
- Copy: “Thật tuyệt nếu nhận được đánh giá của bạn trên:” → nút Google Maps kèm biểu tượng → “Chúng tôi sẽ rất cảm kích nếu nhận được đánh giá Google của bạn.”
- Tiếng Việt mặc định; bộ chọn “Ngôn ngữ / Language” chỉ có Tiếng Việt và English. Không tự nhận diện máy, không dịch AI từng lượt. Có thể đổi mặc định khi chủ yêu cầu.
- Góp ý mẫu barbershop: thời gian chờ, chất lượng cắt tóc, thái độ phục vụ, không gian/vệ sinh, khác. Bỏ “Ý tưởng / Mong muốn”, để phát triển sau.
- Dashboard và dữ liệu riêng cho mỗi shop, cần đăng nhập/phân quyền thực sự khi triển khai.
- Làm từng bước theo first principles, mô phỏng nhanh rồi cùng xem trước khi setup phức tạp.
- Trí nhớ theo nhu cầu: đọc lại checkpoint/Obsidian khi thiếu bối cảnh; chỉ hỏi phần còn thiếu. Không đồng bộ NFC hằng ngày.

## Đã làm

Mô phỏng hai ngôn ngữ và hai góc nhìn dùng chung dữ liệu tạm: trang khách, dashboard chủ. Có cập nhật sao cùng bản ghi, gửi riêng, trạng thái xử lý và ghi chú nội bộ. Ba bản ghi mẫu không phải dữ liệu khách thật. 4Râu là ví dụ; ảnh và logo còn placeholder.

## Chưa chốt / chưa triển khai

- Dashboard mới được đề xuất: số lượt chấm, điểm trung bình nội bộ, góp ý chưa xử lý, số bấm Google, nguồn thẻ, thời gian và ghi chú. Chờ chủ đánh giá.
- Đã chốt lại ngày 2026-09-11: experience theo lần mở có tương tác; reload là visit mới. Chi tiết tương tác và quay lại bằng back/forward còn mở.
- Tên repo GitHub, tên thương hiệu, shop pilot và tài nguyên được phép sử dụng.
- Stack, database, đăng nhập, chi phí và hosting; Next.js/TypeScript/Vercel/Neon mới được thảo luận. Không tự mua hoặc coi như đã setup.
- Đã được thay thế ngày 2026-09-11: editor chỉ dành cho Tài, xem cập nhật bên dưới.
- AI, gói giá, thanh toán và nhiều chi nhánh chưa thuộc phạm vi đã chốt.

## Khôi phục bối cảnh

Ghi chú chuẩn trong Obsidian: `20 Work/Projects/NFC Branded Feedback Platform.md`.
Task gốc: `01a08505-b525-7631-a2dd-839b3e49846e` (Hiểu dự án NFC card).
Chat tham khảo: `6a9fa1c3-c934-83ec-9b65-37a6783357fc` (Vercel làm được gì).
Chính sách Google đã tra: https://support.google.com/contributionpolicy/answer/7400114?hl=en

## Cập nhật 2026-09-09 — nền GitHub và kiến trúc

- Tài xác nhận tên `nfc-feedback-platform`, repo private đã tạo trong tài khoản `tuantaidoan2004-collab`.
- Tài là chủ dự án; Codex đảm nhiệm kiến trúc. Vercel là nơi chạy mục tiêu, cần đường chuyển khi chi phí hoặc vận hành không phù hợp.
- Thiết kế MVP hiện nằm tại `docs/mvp-architecture.md`; công nghệ đề xuất được phân biệt với hạ tầng đã triển khai.
- Không cập nhật lại Obsidian trong bước này theo yêu cầu Tài.

## Cập nhật 2026-09-10 — bắt đầu app local

- Tài yêu cầu bắt đầu bước app local/CI; thêm hiệu ứng nút góp ý khi chấm 1–3 sao: phồng lên/thu lại, màu đậm hơn lúc phồng.
- Lựa chọn triển khai: ba nhịp, dừng khi chấm 4–5 hoặc bấm nút; tôn trọng giảm chuyển động. Google vẫn giữ nguyên lời mời/vị trí ở mọi điểm.
- App giai đoạn đầu dùng dữ liệu demo trên trình duyệt, chưa có auth/database hay deploy. LocalStorage là công cụ thử giao diện, không phải kiến trúc lưu dữ liệu production.

## Cập nhật — skill cho agent

- Tài yêu cầu áp dụng `rohitg00/agentmemory` và `addyosmani/agent-skills` vào dự án.
- Tích hợp skill ở phạm vi project; hướng dẫn sử dụng và nguồn phiên bản tại `docs/agent-skills.md`.
- Quy tắc trí nhớ theo nhu cầu vẫn giữ nguyên. Chưa cài memory engine/MCP; dùng checkpoint và Obsidian hiện có, không thu thập hội thoại tự động.

## Cập nhật — URL shop và lưu server

- Tài xác nhận `/<shop>` là landing page, `/ZZZ/<shop>` là dashboard tương ứng, cùng domain tổng. Không chuyển khách qua dashboard sau khi chấm.
- Tách vai trò: ứng dụng Node/Next.js chạy trang/API; PostgreSQL (mục tiêu Neon) lưu dữ liệu/cấu hình/quyền; R2 lưu ảnh và có thể video. Neon không chạy mã dashboard.
- Bổ sung mã server theo shop, migration và kiểm tra quyền/revision; kích hoạt có chủ đích. Tiến độ và phần còn thiếu tại `docs/server-data.md`; chưa nối dịch vụ thật hoặc hoàn thành login/pilot.

## Neon development đã xác minh

- Project `purple-waterfall-11672045`, Free, AWS Singapore, PostgreSQL 18. Chủ đã tạo project qua console.
- Đã tạo nhánh `development` (`br-empty-water-aze789dm`) từ nhánh mặc định `production`, không tự xóa.
- Chỉ PostgreSQL được bật; Auth/Data API chưa bật. Trạng thái ban đầu thiếu kết nối đã được cập nhật ở dòng tiếp theo. Không chạy prompt deploy tổng quát của Neon.

- Đã lưu kết nối development vào `.env.local` (Git bỏ qua, quyền file 600) và chạy migration `001_core` thành công trên Neon. Chưa nối đăng nhập chủ hoặc deploy.

## Quyết định chủ sản phẩm — 2026-09-11

Nguồn: Tài qua task brainstorm chuyển giao; các quyết định này ưu tiên hơn mô tả cũ.

- Một codebase, nhiều shop bằng record/config. Platform không thiên ngành; barbershop chỉ là demo.
- Editor template chỉ dành cho Tài quản trị/thiết kế. Chủ shop xem, lọc, xuất và xử lý phản hồi; chưa triển khai đủ các chức năng này.
- Workflow: tạo shop → chọn slug → gắn template/version → nhập tài nguyên/link → preview bằng dữ liệu test → publish → tạo tag/link NFC → test → kích hoạt. Preview/test không ghi vào dữ liệu thật.
- URL: `/<shop>` trang thương hiệu; `/ZZZ/<shop>` dashboard được phân quyền; `/t/<tag-id>` mở shop/template đang publish của thẻ/vị trí đó. Route tag tổng quát chưa có, `/t/demo` chỉ là demo cũ.
- Mỗi lần tải/tải lại tạo page_visit mới kèm thời gian. Không gọi visit là khách duy nhất hay số lần chạm NFC chắc chắn; refresh/tab/bot preview có thể tạo visit.
- Experience chỉ hình thành khi có tương tác trong lần mở; đổi sao cùng lần mở cập nhật cùng experience. Quyết định này thay thế cách tái dùng experience qua cookie 30 ngày của code hiện tại. Chưa đổi code/migration trong bước đặc tả này.
- Template quản lý nền/gradient/watermark, font/effect chữ, logo/media, nút/link/icon, sao trong giới hạn, animation và âm thanh. Phạm vi biểu đạt đã chốt; giới hạn cấu hình cụ thể còn là đề xuất. Asset ở R2; DB lưu config/object key.
- Google luôn có lời mời giống nhau mọi điểm; 1–3 sao mở riêng/pulse ba nhịp; Việt mặc định + English thủ công; dữ liệu riêng theo shop vẫn là bất biến, không được template ghi đè.
- Phối hợp theo từng lát: brainstorm đề xuất prompt → task kỹ thuật làm đúng một lát → kiểm tra → checkpoint và báo. Không chạy vô hạn, tự mở rộng production hoặc tự commit.

Thiết kế đề xuất, vòng đời và acceptance criteria: `docs/platform-lifecycle.md`. Neon development/migration 001_core đã có theo checkpoint trước; chưa login chủ, R2 hay deploy. Bước này chỉ cập nhật tài liệu, không xác minh lại hạ tầng.

## Lát 1 — contract rating thuần đã kiểm chứng

- Đã thêm contract/hàm thuần visit→rating experience, 22 test đạt cùng typecheck/lint. Chỉ mô hình rating, không chốt KPI feedback/click.
- Retry cùng intent giữ nguyên kết quả cũ mà không rollback state mới; revision/tenant/scope/visit sai bị từ chối. ID/thời gian do caller truyền vào.
- Chưa nối runtime, DB hoặc UI; cơ chế cookie 30 ngày của app hiện tại chưa thay đổi. Không có migration mới/commit. Giới hạn và prompt lát 2 tại `docs/platform-lifecycle.md`.


## Lát 2 — PostgreSQL repository v2 đã kiểm chứng

- Migration002 additive dùng bảng page_visits/rating_experiences/rating_intent_receipts; giữ nguyên001 và experiences legacy, không bịa visit lịch sử. Lý do/rollback/retention tại docs/visit-rating-repository.md.
- Repository nội bộ bảo đảm một experience/visit, kiểm soát revision/intent retry, ràng buộc shop/scope và ghi receipt nguyên tử. Chưa là boundary auth/API; caller phải giải quyết context đáng tin.
- 11 test PostgreSQL thật18.4 trên cluster test local tách biệt đạt, gồm concurrency/rollback/legacy; 22 contract test, typecheck/lint đạt. Cluster tạm dừng sau kiểm tra. Không truy cập Neon hay file bí mật, không sửa runtime/UI/endpoint hoặc commit/deploy.
- Lát tiếp theo đề xuất3A là boundary API development có token/context đáng tin, trước khi nối client. Receipt chưa có TTL; retention/token/anti-abuse và auth cần hoàn thiện trước pilot. Không tự triển khai lát3.


## Lát 3A — API capability development đã kiểm chứng

- Được giao tiếp tục APIv2 riêng, chưa nối client.002 chưa phát hành nên bổ sung capability_hash NOT NULL theo ủy quyền;001/legacy nguyên trạng.
- Chọn document-generated secret32byte CSPRNG (client sẽ làm ở3B), header Bearer, DB chỉ lưu hash ràng buộc shop/scope; lookup còn kiểm tra visitId. Retry register giữ loadKey+secret, không cookie chung/30ngày. Độ dài token kiểm tra không chứng minh randomness của client.
- Hai POST v2 resolve shop từ path/DB, scope live cố định, thời gian server; allowlist/body size/origin/no-store, token trước đọc receipt. Gate mặc định đóng và chặn production. Không có route test/preview hoặc owner quyền.
- 11 API handler+PostgreSQL test,11 repository test và22 contract test đạt; typecheck/lint/diff đạt. Chưa kiểm thử Next HTTP/browser/hosting. Không đọc env/secrets, không Neon/dependency/commit/deploy. Cluster test dừng.
- Thiết kế/threat model, giới hạn expiry/retention/anti-abuse và prompt3B nối client tại docs/visit-v2-api.md. Dừng sau3A, không tự thực hiện3B.


## Foundation session15phút — quyết định Tài và hiệu chỉnh 2026-09-11

- Mỗi load/reload/restore ghi page_visit/open event riêng có server time/navigation kind. Session ước tính gom theo browser token + shop/scope/entry attribution; idle<15phút tái dùng, idle>=15phút tạo session mới. Không unique person/NFC tap, không fingerprint/IP; mất storage có thể tạo token/session khác.
- Browser secret32byte CSPRNG sẽ lưu first-party browser storage, khác event/loadKey mỗi lần mở. DB chỉ hash domain-separated; shop/scope/entry do server resolve, direct:shop hiện tại, tag sau. Token dài hạn không đồng nghĩa lifetime session; chưa chốt retention/rotation production.
- Chỉ rating tạo/thay đổi experience, tối đa một/session.5→2 qua hai page_visit cùng session cập nhật điểm/revision chung. Open/rating áp dụng cập nhật last_activity; retry/conflict không phải hoạt động mới. Server dùng DB clock sau khóa tuple để hai tab đồng thời không tách phiên.
- Lựa chọn kỹ thuật: rating mới trên session hết hạn trả SESSION_EXPIRED; cần đăng ký resume trước thao tác mới. Retry intent cũ vẫn đọc receipt cũ sau expiry để giải quyết unknown outcome, không gia hạn hay làm sống lại session. Không gán lại page_visit cũ sang session mới hoặc bịa open trong request rating.
- Đã sửa contract/migration002 chưa phát hành/repository/APIv2/test/docs;001/legacy giữ nguyên, không backfill giả.52 test đạt (24 pure+15 repository+13 API handler với PG thật18.4), typecheck/lint/diff đạt. Chưa Next HTTP/browser/storage thực. Cluster test dừng; không Neon/env thật/UI/auth chủ/R2/dependency/commit/deploy.
- Prompt3B cũ tạm dừng/thay thế. Prompt client3B mới ở docs/visit-v2-api.md chỉ là đề xuất; dừng sau foundation. Không chốt KPI tương tác khác hoặc retention production.


## Client3B.1 — module riêng đã kiểm chứng

- Sau handoff sang worktree1b35, kiểm tra foundation15phút còn nguyên; chưa có client dở. Chỉ thêm lib/client/browser-identity.ts và open-lifecycle.ts cùng test/config; chưa nối UI/API/DB.
- Sửa nguồn quyết định: Tài không cấm cookie; localStorage là lựa chọn kỹ thuật. Bài học: không gán lựa chọn kỹ thuật của agent thành yêu cầu chủ.
- Web Locks bảo vệ tạo token; thiếu coordination/token sẵn có hoặc storage lỗi dùng memory, thừa nhận có thể tách session. Token pin theo document. Lifecycle key pin qua remount/retry, resume mới sau hide, không chọn session ở client.
- 6 focused test đạt (3unit+3Chrome), typecheck/lint/diff đạt. Reload/multitab/storage thực; BFCache/visibility sequence mô phỏng, chưa WebKit/React/Next HTTP/PG. Không lặp foundation, không secret/dependency/commit/deploy. Chi tiết docs/client-identity-lifecycle.md; dừng3B.1.

## Client3B.2 — coordinator độc lập đã kiểm chứng

- Thêm `lib/client/visit-coordinator.ts`, transport/identity/UUID/retry delay được inject; chưa nối React/ShopFeedback hay HTTP thật. Client không chọn shop/scope/entry/session/time; snapshot server quyết định revision và phiên.
- Open phải được xác nhận trước rating. Unknown outcome giữ nguyên secret/event/visit/intent/score; chặn thao tác mới đến khi retry giải quyết. Retry tự động mặc định2 lần, tối đa3; không retry vô hạn.
- Revision conflict đọc lại snapshot bằng chính open cũ rồi trả conflict, không tự ghi đè. SESSION_EXPIRED đã xác định thì tạo resume mới trước rating mới; nếu intent cũ còn unknown phải giải quyết trước. Một action chỉ tự resume tối đa một lần.
- 11 unit test coordinator đạt; typecheck/lint/diff đạt. Không chạy HTTP/browser/PostgreSQL trong lát này; foundation và UI/demo nguyên trạng. Dependency có sẵn được liên kết tạm rồi tháo, không cài package/commit/deploy.
- Giới hạn và prompt đề xuất tiếp theo: `docs/client-transport-coordinator.md`. Dừng3B.2, chờ Tài giao tiếp.

## Client3B.3 — fetch transport thuần đã kiểm chứng

- Thêm lib/client/visit-fetch-transport.ts: public slug→same-origin APIv2, allowlisted JSON/Bearer/no-store, validate response và mã lỗi/status đúng contract. Không đổi server/API/DB/coordinator.
- Fetch/timer inject; timeout/abort/network/parse/schema/HTTP không rõ trả unknown, giữ original intent/visit ở coordinator. Timeout bao phủ đọc body, cleanup timer; không tạo key hay retry riêng.10giây mặc định là lựa chọn kỹ thuật, chưa SLA sản phẩm.
- 17 test mới +11 coordinator =28 đạt; typecheck/lint/diff đạt. Không HTTP/browser/PG/Neon/secrets/UI/dependency mới/auth/R2/deploy/commit. Liên kết dependency tạm đã tháo; foundation giữ nguyên.
- Chi tiết/giới hạn và đề xuất hàng đợi lifecycle tại docs/client-transport-coordinator.md. Dừng3B.3 để brainstorm rà trước lát sau.

## Client3B.4 — lifecycle queue đã kiểm chứng

- Thêm lib/client/lifecycle-queue.ts và client-tests/lifecycle-queue.spec.ts. Queue độc quyền coordinator; dedup cùng loadKey, giữ thứ tự mọi key khác, một call in-flight. Không đổi identity/lifecycle/coordinator/fetch/foundation.
- Unknown giữ nguyên job và retry qua coordinator trước event mới. Error/conflict xác định block chờ acknowledge rõ ràng; không âm thầm bỏ pending. Rating khi bận trả false, không xếp điểm chờ áp vào session tương lai. Busy/throw ngoài contract expose gap và giữ jobs.
- start/stop/subscription idempotent trong instance; phải giữ instance qua remount. Memory-only, chưa bảo đảm qua document reload/crash; policy UI và deferred server timestamp cần brainstorm rà.
- 10 queue +11 coordinator +17 adapter =38 test đạt; typecheck/lint/diff đạt. Không HTTP/browser/PG/Neon/secrets/UI/server/API/DB/dependency/commit/deploy. Liên kết dependency tạm đã tháo.
- Chi tiết/giới hạn/đề xuất tiếp ở docs/client-transport-coordinator.md. Dừng3B.4 để brainstorm rà, chưa làm lát sau.

## Client3B.4R — cảnh báo kiến trúc trước tích hợp

- Rà thuần, không sửa code/chạy test. FIFO3B.4 có thể trì hoãn open qua mốc15phút khi rating unknown;38 test trước không chứng minh policy thời gian phù hợp.
- Đề xuất3B.4fix: open lane độc lập + rating intent đóng băng context; latestDesired chỉ cùng experience, không tự chuyển recoveryS1 sangS2. Cần đổi coordinator chung current/pending/busy; không chỉ bypass queue. Chưa triển khai hoặc thay contract đã chạy.
- Memo/timeline/giới hạn và phân biệt kỹ thuật với quyết định cần chủ ở docs/client-transport-coordinator.md mục3B.4R. Durable reload/offline và semantics thời gian trễ còn phải chốt phạm vi trướcpilot. Dừng để brainstorm rà, chưa nối UI.

## Client3B.4fix — core hai lane hiện hành

- Phạm vi MVP được giao: DB processing/receipt time canonical, không observed-time metadata; chưa durable recovery qua document crash/reload/offline. Không production-ready.
- Thay FIFO chung bằng hai lane trong cùng coordinator: per-key open ledger độc lập rating, duplicate không auto retry; retryOpen riêng key. Recovery rating đóng băng source/intent, SESSION_EXPIRED không tự chuyển score sang phiên mới; chỉ fresh action sau đó được resume.
- LatestDesired chỉ cùng load/session, coalesce5→2→3 thành5 rồi3. Open mới bỏ desired cũ với notice; conflict/external revision không tự overwrite. Queue wrapper không còn acknowledge/global busy; API rate/retry trả Promise state rõ.
- 38 focused test mới/cập nhật đạt (16 coordinator+5 queue+17 adapter), typecheck/lint/diff đạt; thay tests encode FIFO/autoresume cũ. Không browser/HTTP/PG/foundation test, không identity/lifecycle/fetch/server/API/DB/UI/dependency/secrets/commit/deploy.
- Docs/client-transport-coordinator.md mục3B.4fix thay semantics lịch sử3B.2–3B.4. Ledger memory-only, chưa composition/React, không bảo đảm delivery qua reload. Dừng để brainstorm rà trước lát sau.

## Client3B.5 — document composition service

- Thêm lib/client/document-feedback-service.ts, registry theo Document/Window ghép5module. Factory cùng config trả cùng instance; đổi shop trên cùng document bị từ chối. Public config chỉ slug, API same-origin cố định.
- State deep-readonly copy + subscribe/start/stop/rate/retry/retryOpen; subscriber cleanup không dừng service. Initial event một lần; subscription giữ mọi resume khi stopped để dispatch khi start. Pending/error/conflict/notice không tự acknowledge, command chưa nhận được trả lỗi rõ.
- 10 composition +38 core client =48 pure tests đạt; typecheck/lint/diff đạt. Import không cần browser globals; DI/mock fetch/document. Không browser/HTTP/PG/foundation, không sửa core/server/UI/dependency/secrets/commit/deploy; dependency symlink tạm đã tháo.
- DB time canonical/memory-only vẫn giữ; chưa React/BFCache thật hoặc durable reload/offline. Chi tiết docs/client-transport-coordinator.md mục3B.5. Hoàn thành/dừng để rà, chưa tự chạy lát UI tiếp.

## Client3B.6 — hook React, chưa nối ShopFeedback

- Thêm use-document-feedback.ts: useSyncExternalStore + snapshot cache theo service; null/off mặc định, start effect idempotent, cleanup không stop service; actions giữ nguyên result. Không đổi gate/app routes hoặc core/service.
-3 test React19/DOM Chrome profile tạm đạt +10 composition pure tests liên quan đạt; typecheck/lint/diff đạt. Fetch giả, mọi network request bị chặn. Chrome sandbox launch fail, lần ngoài sandbox đạt; không claim Next/API/DB/BFCache thật.
- Giữ ShopFeedback và /t/demo vì chưa có private-feedback v2 contract. Không dependency/PG/Neon/server/DB/visual/commit/deploy. Checkpoint chi tiết mục3B.6 trong docs/client-transport-coordinator.md; dừng để rà trước tích hợp UI.

## Client3C.1 — contract góp ý riêng thuần

- Thêm lib/domain/private-feedback.ts + tests/contracts/private-feedback.spec.ts. Feedback chỉ sau rating, cho mọi1–5 sao, chung experience/revision; rating wrapper giữ feedback. Visit-rating/runtime hiện tại nguyên trạng.
- Intent namespace chung rating/feedback; retry canonical payload/source trả receipt gốc và current state, không activity mới; context/revision/expiry được kiểm tra. Message NFC/line ending/trim1..2000codepoint, topic ASCII neutral32ký tự tối đa, chưa taxonomy/KPI/retention.
-24 feedback tests mới đạt,24 rating tests liên quan đạt; typecheck/lint/diff đạt. Clock lùi có regression timestamp. Chỉ pure domain, không DB/API/client/UI/PG/browser/Neon/secrets/dependency/commit/deploy.
- Docs/private-feedback-v2.md ghi contract/compatibility và yêu cầu tương lai: cả2write chung transaction/revision, không serialize private snapshot vào public rating response. Dừng3C.1 để rà, chưa làm repository/API.

## Client3C.2 — aggregate PostgreSQL riêng đã kiểm chứng

-002 unreleased mở rộng feedback columns trên experience/receipt, operation discriminator trong shared receipt table; PK intent và unique revision chung không chứa operation.001/legacy nguyên trạng, không backfill.
- Repository2write cùng transaction/tuple+session lock, contract3C.1/revision chung. No-rating/expiry/context/capability guard, replay không activity; rating giữ feedback. Public register/rating/current+receipt whitelist không private content; recordPrivateFeedback result tách, chưa owner/API auth.
-22PG tests (15cũ cóảnhhưởng+7mới) +48pure contracts đạt;3projection/rollback tests chạy lại sau regression extras đạt. Typecheck/lint/diff đạt. PostgreSQL18.4 test local đã dừng; docs ghi role/port để tránh dò lại. Không Neon/env thật/API/client/UI/browser/dependency/commit/deploy.
- Rollback guard bảo vệ feedback chung bảng; docs/visit-rating-repository.md mục3C.2 và private-feedback-v2.md cập nhật. Dừng để rà trước API/client, chưa tự làm bước sau.

## Client3C.3 — feedback API development

- Thêm POSTv2 visits/<visitId>/feedback qua handler/runtime chung. Gate off/nonproduction giữ nguyên, body allowlist/capability/server context; domain validation tái dùng qua repository.
- Feedback response chỉ current rating/revision/time + original receipt intentId/revision/time, không echo content; public register/rating/error không private fields. RATING_REQUIRED409; các guard/error/no-store chung giữ nguyên.
-37tests đạt (15handler+22repository),2feedback test chạy lại sau thêm malformed/media/503 đạt; typecheck/lint/diff đạt. PGlocal đã dừng, không NextHTTP/client/UI/browser/Neon/envthật/dependency/commit/deploy.
-4096byte wire limit giữ nguyên có thể nhỏ hơn2000Unicode codepoint; ghi giới hạn trong docs/visit-v2-api.md mục3C.3, cần rà trướcUI. Dừng để rà, chưa tự làm client.

## Client3C.4A — feedback wire/transport

-Feedback wire cap16KiB theo phạm vi được giao; register/rating4KiB không đổi. Cap rawbytes vẫn áp dụng với whitespace/escape phình lớn;2000codepoint canonical UTF8 JSON có đủ không gian.
- Fetch transport thêm feedback port, giữ exactpayload/Bearer/sameorigin/no-store/timeout; exactresponse whitelist không private text, validate receipt correlation; RATING_REQUIRED409. Chưa nối mutation coordinator/UI.
-7handlerunit +20adapter tests đạt, typecheck/lint/diff đạt. Handler dùng pool sentinel, khôngDB; threshold PGfixture cập nhật nhưng không chạyPG. Không browser/clientUI/Neon/schema/auth/dependency/commit/deploy. Dừng để rà trước3C.4B.

## Client3C.4B — aggregate mutation client

- Coordinator có một mutation lane chung rating+feedback, open vẫn độc lập. Immutable unknown replay source/context/payload; buffer latest rating và latest explicitly submitted feedback cùng load/session, lấy shared revision khi dispatch.
- No-rating feedback từ chối; conflict/externalrevision refresh+reconcile, loadchange/expiry không migrate; bufferclear có notice. Public state mutation (rating alias) không text/topic, private payload chỉ nội bộ khi còn cần retry và được bỏ references sau kết quả xác định.
- Queue/service/hook thêm feedback pass-through, chưa ShopFeedback/UI.62pure clienttests đạt (10aggregate+16coordinator+5queue+11service+20adapter), typecheck/lint/diff đạt. Không Reactbrowser/server/DB/PG/Neon/dependency/commit/deploy.
- Docs/client-transport-coordinator.md mục3C.4B ghi resultdiscriminator/alias/lastAction vs mutationstate và memory-only limits. Dừng để rà trước form integration, chưa tự làm bước sau.

## Client3D — public development vertical slice hoàn tất (2026-09-13)

- Đã nối `/<shop>` → ShopFeedbackV2 → document service/React hook → Next APIv2/PG. Gate chung server chỉ NODE_ENV=development + flagtrue; off giữ legacy, production không bật được. `/t/demo` browser-only và foundation3C.4B nguyên trạng.
- UI giữ Google/VI-EN/pulse/hero/CSS. Sao chờ open, coalesce rapid rating. Form chỉ gửi sau rating xác nhận và mutation rảnh; khóa draft/sao lúc feedback pending, retry đúng intent, success xóa ô nhập. Conflict/expiry giữ draft, không tự chuyển submission; trạng thái VIEN không raw codes. Policy UI là lựa chọn kỹ thuật3D, không quy thành yêu cầu ban đầu của Tài.
-9 integration development cases đạt trên NextHTTP+Chrome+PG18.4local riêng, thêm1production gate case đạt với flagtrue. Typecheck/lint/diff/build+prepare-standalone đạt. Lỗi null guard/tên fixture lint đã sửa; standalone external-symlink issue được giải quyết bằng copy dependency trong harness, không cài mới. Không lặp suite foundation đã đạt.
- Synthetic resume được test; chưa actual BFCache/back-forward/Safari/WebKit/mobile kill, UI hai tab thực. Memory-only không bảo đảm delivery/draft qua reload/crash. Evidence/policy/prompt tiếp ở docs/public-v2-integration.md.
-0schema test còn lại, Next/PG đã dừng, dependency symlink đã tháo. Không Neon/env thật/auth owner/R2/editor/deploy/dependency mới/commit. Đã bảo toàn các thay đổi foundation có sẵn. Dừng cuối3D, chưa tự làm lát mới.

## Client3E — browser hardening đã rà, còn giới hạn môi trường (2026-09-13)

- Chỉ thêm integration-tests/browser-hardening.spec.ts + docs/browser-hardening-3e.md; không sửa production code. Ma trận9case:8đạt,1skip/unverified visibility độc lập do desktop automation không phát hidden. Không claim case đó đạt.
- BFCache thật2restore persisted=true/isTrusted=true + hidden/visible thật; mỗi navigation khớp DB event/session. Reload phát sinh riêng trong Nextdev được ghi đúng, không bị bỏ. Test ban đầu đếm cứng sai/đợi load trên BFCache đã được sửa theo timeline/commit; không phải lỗi sản phẩm.
- Hai tab storage trống chung identity/session;5→2/feedback chungrevision/conflict; xóa/chặn storage thật; DBclock trước/sau15phút; lostresponse retryoriginal xuyên expiry/tabmới; publicno-leak và gate/demo regression đạt. Không lặp suite foundation hay build/lint/typecheck vì không đổi production code.
- Safari26.6.2 có driver nhưng không tạo session vì Remote Automation chưa bật; WebKit Playwright chưa cài. Không đổi setting/cài thêm; chưa kiểm chứng Safari/iOS/visibilityđộc lập/mobilekill. Memory-only/durable và bảo vệ vận hành vẫn là blocker trướcpilot.
- Mốc foundation client/API đạt mức development trên Chromium trong phạm vi đã kiểm chứng, không đồng nghĩa cross-browser/pilot-ready. Chi tiết/evidence và giới hạn tại docs/browser-hardening-3e.md. Dừng3E, chưa tự làm tag/dashboard.

## Client3E-Safari — macOS đạt, iPhone chưa paired (2026-09-13)

- Tài đã bật Remote Automation; Safari26.6.2/macOS tạo session thật qua safaridriver có sẵn.7nhóm critical path đạt:1open,5→2,feedbacksharedrev3/publicno-leak/draftclear,reload,backforward/BFCachetrustedpersistedtrue+visibilitythật,storageclear/pinnedidentity,layout390/768desktop.
- iPhone thật được driver thấy nhưng báo device is not paired; chưa tạo phiên iOS. Không giả lập, không đổi trust/setting/càiWebKit; không biết unlock/trust ngoài pairingerror. Chưa testtouch/mobilebackgroundkill. Không đưa tên/UDID thiết bị vào docs.
- Chỉ thêm integration-tests/safari-local.mjs, nhánh --safari trong harness, docs/safari-hardening-3e.md. Prewarm /t/demo tránh FastRefresh biên dịch route mới chen history; không đổi production code, không lặp suites/typecheck/lint/build.
- Không Neon/env thật/auth/R2/tag/dashboard/editor/deploy/commit. Dừng3E-Safari. Chi tiết/giới hạn ở docs/safari-hardening-3e.md; iOS tiếp theo cần pairing và endpointHTTPS test mà thiết bị thật truy cập được, chưa tự setup.

## iOS Safari pairing probe — thành công (2026-09-13)

- Sau khi Tài pairing lại, safaridriver tạo được session **iOS/Safari26.6.1**, safari:useSimulator=false. Mở https://example.com/ thành công, title Example Domain,5touchPoints,viewport393px. Đây là iPhone thật; không ghi tên/UDID thiết bị. User-agent có OS token khác platformVersion, dùng capability driver làm evidence phiên bản.
- Lỗi device is not paired của lượt trước đã được giải quyết ở lần probe này. Chưa thử app NFC trên thiết bị; không suy ra khóa/trust/network path ngoài việc phiên đã hoạt động.
- Đã đóng session/driver. Không Next/PG/env thật/đổi setting/cài phần mềm/tunnel/certificate/profile/production code/commit. Điểm dừng: cần Tài cho phép chuẩn bị endpointHTTPS local trên Mac mà iPhone truy cập được trước test NFC iOS; chưa tự tạo endpoint.

## Publishing Core — quyết định triển khai (2026-09-14)

- Tài chốt full-bleed mặc định; card là biến thể sau cùng dữ liệu. Schema có poster/logo/background/watermark/text/links an toàn; watermark showcase đúng YOUR LOGO;5sao phẳng bằng nhau. Lát này chưa redesign/editor/upload.
- Release không tách session15phút. Mỗi visit pin release/tag/scope/entry của lầnrender; session giữ nguồn openđầu, experience giữ nguồn ratingđầu; receipt/intent giữ sourcevisit để suy ra release bất biến. Không coi session là unique person.
- Renderproof server ký canonical context để GETR1/publishR2/POSTopen vẫn ghiR1; proof công khai chỉ là attribution, không quyền owner. Không URL/log proof, secret ký chỉ server/testfixture. Recheck shop/tag/previewexpiry trong transaction khi tương tác.

## Publishing Core — hoàn tất local (2026-09-14)

- Migration003 additive, template/release/context/receipt bất biến; draft/publish/rollback CAS, shop state, tag prepared/tested/active/disabled và preview capability hash/expiry. Không sửa/backfill001/002. Admin boundary nội bộ yêu cầu callback authorization, chưa auth thật/endpoint quản trị.
- `/<shop>` và `/t/<code>` cùng resolver/renderer; proof server ký pin release theo render, publish không tách session15phút. Session nguồn open đầu, experience nguồn rating đầu, từng receipt nguồn visit riêng. Recheck shop/tag/preview trong transaction chặn cả tab cũ; giữ core revision/retry/expiry.
- Preview dùng scope=test/entry riêng + FK ghép trong bảng foundation chung, thay đề xuất kho riêng cũ; live totals phải lọc scope và membership server-side ở lát dashboard. Capability qua exchange same-origin/HttpOnly cookie, không URL/JS props; cookie là lựa chọn kỹ thuật.
- 48 checks đạt:2pure publishing +8PG +33focused client +4NextHTTP/Chrome/PG +1production gate. TypeScript/ESLint/diff/build+standalone đạt. Đã sửa proof canonical, lookup slug không phân biệt hoa thường, preview của tag disabled và reserved /preview; đã chạy lại kiểm tra liên quan. Lần final HTTP/build bị auto-review usage limit, sau Tài yêu cầu tiếp tục đã chạy thành công; không còn blocker này.
- Schema có full-bleed/poster/logo/background/watermark YOUR LOGO/text/links; renderer nối name/poster/question/Google và nhận config. Chưa visual mới cho background/logo/watermark/custom links/card; không redesign. Google/VIEN/pulse và demo/legacy gate off giữ nguyên. Publishing chỉ development; production gate đóng cả khi flags true.
-0schema fixture còn lại; Next/PG đã dừng, dependency symlink đã tháo. Bảo toàn dirty foundation, không commit/Neon/env thật/auth owner/R2/editor/deploy/dependency mới. Chưa Safari/iOS cho Publishing Core, auth/pilot/rate-limit/retention/cache/asset validation/rotation runtime/durable delivery.
- Chi tiết file/contract/evidence/giới hạn/prompt kế tiếp ở [publishing-core.md](publishing-core.md). Dừng đúng cuối Publishing Core, chưa tự làm auth/dashboard hoặc renderer showcase.


## Owner Auth + Dashboard v2 + Export — bàn giao (2026-09-14)

- Hoàn thành lát local: migration004 additive, identities/memberships/session/throttle v2; credential login bằng Node scrypt131072/8/1, bootstrap nội bộ yêu cầu authority, không account hardcode/public registration. Cookie opaque32byte HttpOnly/SameSiteStrict/Secure khiHTTPS, DB hash domain-separated,8giờ tuyệt đối/rotation/logout revoke. Mọi read/write/export kiểm identity/session/member/shop active tại server. Chỉ bật development+owner flag, chưa production.
- /ZZZ/<shop> auth shell + dashboard v2 live: cohort là open phù hợp date/source/release và current rating/status; sessions không unique person, sao không Google review.50-row microsecond keyset. Case/note riêng với CAS case+customer revision và audit actor/time bất biến; feedback mới về new. UI Việt390px/desktop, không editor/nút giả. /t/demo và /demo/dashboard giữ legacy.
- CSV UTF8 BOM/quote/formula protection, JSONL và dictionary versioned cho experiences/page_visits/receipts, cùng auth/filter/cohort. Receipt export chứa toàn lịch sử của selected sessions. Cursor snapshot FETCH256/chunk/backpressure; cancel/abort/DB error/idle/revoke cleanup. Một export/owner; pool cursor max2 tách auth/API max3.601rows đã đọc đủ3chunk, không claim benchmark triệu rows.
-15 nhóm kiểm tra đạt:3pure+8PG+3NextHTTP/Chrome/PG+1production gate. Typecheck/ESLint/diff/build+standalone đạt. Đã xem ảnh390px/desktop. Không chạy lại full client/Publishing/Safari matrix không thay đổi. Test locator ban đầu sai đã sửa theo accessible role; export xử lý lỗi DB và pool auth tách riêng đã kiểm chứng.
- Next16development tự override HTML cache thành no-cache,must-revalidate; private API/export vẫn no-store và shell không chứa feedback/note. Bản build dynamic HTML no-store, owner/publishing gates đóng đã kiểm chứng. Không sửa dependency để ép test.
- Các file/lệnh/threat model/giới hạn đầy đủ: [owner-dashboard-v2.md](owner-dashboard-v2.md). Chưa production provisioning/reset/MFA/HTTPS cookie/Safari-iPhone owner lifecycle/retention/backup/load-test/UIEnglish/exportjob-resume. Draft note không durable qua hidden/reload; mất ACK handling phải tải lại kiểm tra. Export ngắt phải bỏ partial file.
- Đã xác nhận0schema fixture còn lại; Next harness kết thúc và PostgreSQL đã dừng. Lệnh cleanup+checkpoint trước bị auto-review từ chối vì usage limit. **Symlink node_modules vẫn còn**, trỏ dependency có sẵn ở checkout Documents; thư mục kết quả test tạm có thể còn. Không ghi nhận cleanup đó là đã chạy. Theo yêu cầu mới của Tài, lượt cuối chỉ cập nhật checkpoint rồi dừng.
- Không commit/push/deploy/Neon/env thật/R2/editor/AI/payment/dependency mới. Bảo toàn toàn bộ dirty foundation. Nhiều file source/migration/test/docs vẫn untracked: GitHub hiện không đại diện đầy đủ trạng thái local.

### Bàn giao sang Claude — chỉ dẫn cho người tiếp nhận

1. Mở đúng worktree `/Users/doantai/.codex/worktrees/1b35/Branded page through NFC card`; đọc AGENTS.md, checkpoint này, docs/publishing-core.md và docs/owner-dashboard-v2.md. Đọc docs/agent-skills.md để hiểu overrides; skill không phải memory engine đã cài.
2. Kiểm tra git status/diff/untracked, bảo toàn tất cả thay đổi. Không reset/clean/checkout đè, không dùng git diff đơn lẻ để kết luận đủ source. Symlink node_modules không phải dependency cần đưa lên GitHub; không copy .env/secrets/vault. Chỉ commit/push khi Tài cho phép.
3. Trước khi chuyển qua clone/máy khác, cần một snapshot source đã rà secrets và gồm cả untracked, hoặc commit đã được Tài duyệt. Không clone GitHub rồi mặc định đã có mọi việc vừa làm. Không đưa credential cũ trong hội thoại vào prompt bàn giao.
4. Rà độc lập auth/authz/export và định nghĩa cohort trước khi mở rộng. Evidence đạt là local development, không production-ready. Không lặp toàn bộ test đã đạt nếu boundary không đổi; lệnh fixture và giới hạn nằm trong tài liệu lát.
5. Lát tiếp theo đề xuất: Admin editor + media library/R2 boundary + duplicate product; tách quyền Tài khỏi owner, copy config không copy customer/auth data, giữ version/CAS/preview/isolation. Chưa tự làm. Sau đó mới xác minh production auth/HTTPS/retention/rate-limit/backup/chi phí và pilot.

DỪNG theo Tài: chỉ cập nhật checkpoint ở lượt bàn giao này, không sửa code, không chạy thêm test, không tiếp tục editor hay công việc nền.

## Antigravity tiếp nhận và Astra review — 2026-09-15

- Tài yêu cầu chuẩn bị bàn giao Antigravity và kế hoạch dùng Astra rà bảo mật sau các lát tiếp theo. Đã kiểm tra worktree1b35/feat/local-app-foundation/HEAD172af2f là bản nguồn hiện tại; Documents/main/HEAD68e435b là bản cũ. Không copy/merge/commit/push hay mở writer tự động.
- Hướng dẫn tiếp nhận, bản đồ file thật/legacy, phạm vi và prompt: START-HERE-ANTIGRAVITY.md. docs/handoff-inventory.json + scripts/verify-handoff.py ghi/kiểm hash source (gồm untracked), không đọc .env và không đi theo node_modules symlink. Inventory chỉ là mốc so sánh, không backup/security attestation.
- docs/astra-security-review-plan.md là kế hoạch đề xuất: baseline auth/export → sau admin editor/duplicate → trước media thật → trước pilot. Tài chủ động mở Astra; chưa tạo task, automation hoặc audit mới. Mỗi lượt có snapshot/diff/fixture/evidence, phân biệt lỗi xác nhận với nghi ngờ và go/no-go có điều kiện.
- Cần Tài chọn/duyệt snapshot source đã rà secrets hoặc commit chọn lọc trước chuyển sang clone/máy khác. Không đưa credentials trong chat vào gói bàn giao. Bản code và kết quả test vẫn theo checkpoint14/09; lượt này không sửa app/chạy lại test.

## Kết nối Antigravity MCP + khảo sát đường ra hạ tầng — 2026-09-15

- Tài chọn chế độ "chuẩn bị rồi bàn giao": Claude dựng kết nối/tài liệu, Antigravity code tiếp. Lát này không sửa source, không chạy app/test, không đọc `.env`, không deploy, không nhập credential. verify-handoff MATCH 178 file trước khi làm.
- Thêm `.agents/mcp_config.json` (workspace scope Antigravity): neon `https://mcp.neon.tech/mcp` bật, vercel `https://mcp.vercel.com` và cloudflare `https://mcp.cloudflare.com/mcp` để `disabled` chờ tài khoản. Cả ba dùng OAuth trình duyệt nên file không chứa secret. Chưa gọi MCP tool nào, chưa OAuth, chưa tạo tài nguyên. MCP không phải sandbox: grant OAuth là quyền thật trên tài khoản thật.
- **Máy này chưa có Node/npx/pnpm trên PATH.** `node_modules` symlink có dependency nhưng không có interpreter; `pnpm dev/build/test` và `scripts/migrate.mjs` hiện không chạy được. Evidence test trong checkpoint là từ sandbox Codex của Astra. MCP remote không cần Node; lát code đầu tiên thì cần Node24 + corepack, Tài tự cài.
- Bốn chặn thật trước khi deploy có ý nghĩa, đã khảo sát trong code: (1) `NODE_ENV==='development'` ở `server/owner-v2.ts:5` và `server/visit-v2-runtime.ts:7` tắt toàn bộ owner/visit/publishing trên Vercel; (2) `scripts/migrate.mjs` chỉ áp `001_core`, thiếu 002–004; (3) `pg.Pool` max3+max2 nhân theo lambda, cần pooled endpoint nhưng export cursor FETCH256 không sống qua PgBouncer transaction mode; (4) `output:'standalone'` xung đột builder Vercel. Không tự hạ gate hay sửa migration cũ để deploy cho chạy.
- Khuyến nghị đã trình: đăng ký Vercel + bật R2 sớm nhưng chưa tích hợp, vì preview HTTPS gỡ đúng blocker HTTPS-cookie và owner flow iPhone/Safari còn treo. Vercel Hobby cấm dùng thương mại → có shop trả tiền phải lên Pro. R2 free tier egress miễn phí nhưng Cloudflare bắt nhập thẻ mới bật. Neon giữ database dev tách khỏi pilot.
- Chi tiết/giới hạn: [antigravity-connect.md](antigravity-connect.md). Dừng ở kết nối; chưa sửa bốn chặn, chờ Tài chọn lát tiếp.

## Lát A — mở đường deploy — 2026-09-15 (đạt; còn repository/integration suite chưa chạy)

- Tài chốt phương án gate: biến `NFC_ENV` riêng (`local|preview|production`), không set = tắt. Phần pool/export giao Claude quyết với ràng buộc ưu tiên tự chủ, không khoá vào Vercel. Nguyên tắc áp cho cả lát: mặc định là hành vi self-host, thứ riêng của một nền tảng phải khai báo tường minh, repo không nhắc tên nền tảng nào.
- Sửa: `server/env.ts` (mới), `server/owner-v2.ts:6`, `server/visit-v2-runtime.ts:8`, `server/db.ts`, `scripts/migrate.mjs`, `scripts/prepare-standalone.mjs`, `next.config.ts`, `integration-tests/run-local.mjs`, `.env.example`. Không đụng nội dung migration 001–004, `lib/`, component, legacy/demo, logic auth/cohort/session.
- Bất biến giữ: feature flag một mình không đủ mở v2. Lớp chặn đổi từ `NODE_ENV` sang khai báo tường minh `NFC_ENV`; production giờ mở được nhưng phải cố ý. Test `production gate` (`integration-tests/public-v2.spec.ts:223`) không sửa và nay kiểm đúng bất biến mới, vì harness cố ý không đặt `NFC_ENV` cho bản build.
- `DATABASE_URL_DIRECT` tuỳ chọn, chỉ cho `ownerExportDatabase()`, fallback `DATABASE_URL` nên self-host/local không đổi hành vi. Migrate quét cả thư mục, giữ advisory lock, tên ghi `001_core` trùng script cũ nên DB cũ không áp lại.
- Tài đã cài Node24.21.0 qua nvm; corepack trong dự án tự dùng đúng pnpm11.19.0. Đã chạy và đạt: typecheck exit0, ESLint exit0, contract60 passed, client73 passed (Chrome thật), build cả hai target exit0 với `.next/standalone` xuất hiện/vắng đúng theo `NFC_BUILD_TARGET`.
- Gate đã kiểm qua HTTP thật trên bản build standalone, env cô lập `env -i`, cả ba flag true: `NFC_ENV` chưa set → 404 cả6 endpoint owner/preview/v2; `NFC_ENV=production` → 503/200/403, tức đã vào handler. Bất biến "flag một mình không mở được v2" đã được chứng minh trên bản production, không phải suy luận. `/api/v2/shops/one/visits` 404 ở cả hai cột là do loại trừ publishing có sẵn (`visit-v2-runtime.ts:12`); chạy lại với publishing=false cho401, đã xác nhận riêng.
- **Cảnh báo vận hành: không chạy `pnpm <script>` trong worktree này.** `node_modules` là symlink sang checkout Documents, pnpm đòi xoá thư mục modules trước khi chạy (`ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`). Không TTY nên tự huỷ, nhưng trong terminal thật sẽ xoá dependency của cả hai bản. Gọi thẳng `node node_modules/<tool>` như harness.
- **A.3 đã kiểm chứng trên Neon branch `development`.** Trạng thái trước khi chạy: `production` không có bảng nào; `development` có đúng5 bảng của `001_core` và `schema_migrations` một dòng `001_core` — tức đã có người chạy migrate bản cũ lên Neon, **mâu thuẫn với checkpoint các lát trước vốn ghi "không Neon/env thật"**. Không nghiêm trọng (schema rỗng, không dữ liệu khách) nhưng xác nhận tài liệu bàn giao không phải lúc nào cũng khớp hiện trạng. Lần1 áp đúng 002/003/004 và bỏ qua 001; lần2 in `Migrations already up to date.`; kiểm độc lập cho `schema_migrations` đủ4 dòng và **23 bảng** khớp tổng 5+4+8+6. Runner mới đạt cả nhánh áp-phần-thiếu lẫn nhánh idempotent.
- Cảnh báo cần xử lý trước production: `pg` hiện hiểu `sslmode=require` như `verify-full`, nhưng từ `pg` v9 sẽ chuyển sang ngữ nghĩa libpq yếu hơn. Chuỗi Neon mặc định dùng `require`; khi đặt env thật nên ghi rõ `sslmode=verify-full`. Không sửa trong repo vì thuộc cấu hình deployment.
- Vệ sinh: connection string branch `development` đã bị dán vào hội thoại, chỉ tồn tại tạm trong scratchpad phiên và đã xoá, không ghi vào repo/`.env`/Git. Cần reset password `neondb_owner`. Branch `production` chưa từng được kết nối.
- **Chưa chạy được vì máy không có PostgreSQL** (`postgres`/`pg_ctl`/`initdb`/`psql`/`docker` đều không có, cổng55439 đóng): `repository-tests`, `integration-tests` (gồm test `production gate`, owner/publishing suite), (A.3 đã gỡ riêng bằng Neon, xem gạch đầu dòng trên). Vẫn cần PostgreSQL local hoặc đường khác cho hai suite này.
- Lỗ hổng phủ test đã biết: chưa có case tự động cho dev + flag true + `NFC_ENV` chưa set. Chưa deploy/tạo tài nguyên/xác minh cookie HTTPS/test iPhone.
- MCP: `.agents/mcp_config.json` có 7 server remote OAuth (neon, vercel, 5 cloudflare) theo đúng playbook chính hãng. Phần CLI/skills của hai playbook không chạy được vì thiếu node/npm/npx/bun/claude CLI; `vercel login` là việc của Tài, agent không nhập credential. Chi tiết: [antigravity-connect.md](antigravity-connect.md).

## Quyền editor và hướng media — Tài chốt 2026-09-15

- **Chủ shop được tự sửa trang tương tác, có giới hạn**, không chỉ admin. Đây là **thay đổi so với thiết kế Astra để lại**, vốn đặt editor sau admin boundary nội bộ của Tài (`docs/publishing-core.md`). Chủ shop đổi chữ/màu/link và upload poster/logo; Tài giữ quyền duyệt và các phần nhạy cảm.
- Hệ quả bắt buộc cho lát media/R2, không được bỏ qua: kiểm tra file upload thật sự (không tin đuôi file hay content-type; SVG nhúng script; ảnh bomb), cách ly asset theo tenant, hạn mức dung lượng/tần suất mỗi shop, và đường duyệt nội dung. R2 free ~10GB chia cho toàn bộ shop.
- Schema `lib/publishing/config.ts` đã phủ đủ nhu cầu sản phẩm Tài mô tả: `poster`, `logo`, `background` (solid/gradient/video loop), `text.question` song ngữ, `googleUrl`, `links[]` tối đa6 với icon `zalo|instagram|booking|link`, `watermark`. Phần thiếu là **UI editor**, **đường upload R2** và **visual của renderer**, không phải thiếu mô hình dữ liệu.
- Tài hỏi về bộ repo "bán lại mã nguồn mở" (CRM, SEO, changedetection, website-cloner, ppt-master, OmniRoute, Strix): đã rà, **không cái nào liên quan sản phẩm này**; chỉ Strix (pentest tự động) có thể dùng ở giai đoạn security review trước pilot, không phải bây giờ. Không cài.
- Nhắc lại cho người tiếp nhận: `.agents/skills/` chỉ là tài liệu quy trình. `AGENTS.md` ghi rõ runtime/MCP của agentmemory **không được cài**; trí nhớ dự án nằm ở `docs/decisions.md` do người viết, không có cơ chế tự ghi.

## Preview trên Vercel + Neon chạy được — 2026-09-16

- Chuỗi hoàn chỉnh đã chứng minh trên hạ tầng thật: Vercel preview → Neon branch `preview/feat/local-app-foundation` → trang khách render. `vercel curl` qua Deployment Protection cho `/caphe-demo` =200 với tên shop `Cà Phê Demo` đọc từ Neon, `aria-label` `1 sao`…`5 sao`, câu hỏi tiếng Việt, link Google, ô `Gửi góp ý`, `<html lang="vi">`.
- **Gate chứng minh đúng hai chiều trên cùng một code**: preview có `NFC_ENV=preview` → `/api/owner/v2/<shop>` trả **401** (mở, chặn vì thiếu auth) và `/owner/login` trả200; production không đặt `NFC_ENV` → cả hai trả **404**. Không còn là suy luận từ đọc code.
- Nguyên nhân mọi deployment sau bản đầu bị chặn: **commit author email `doantai@192.168.2.26`**. Máy không có `~/.gitconfig` nên Git dựng danh tính từ tên máy/IP; Vercel chặn commit author không thuộc tài khoản Git. `vercel ls` hiện `Blocked` thành `UNKNOWN` với build `0ms`, rất dễ đọc nhầm thành hàng đợi treo. Đã đặt `git config --global` email `tuantaidoan2004@gmail.com`; commit `52d5bf0` deploy thông trong37s. Không viết lại3 commit đã push.
- Neon: migrate cả `production` (branch mặc định) nên branch preview Vercel tạo về sau tự kế thừa23 bảng. `vercel-dev` vẫn rỗng, chưa dùng tới, không phải sự cố. Shop demo seed qua SQL Editor, chuỗi kết nối không đi qua prompt agent.
- Tồn tại: Deployment Protection bật trên preview (mọi request ẩn danh →302 `vercel.com/sso-api`), nên **chưa test được iPhone/Safari** trừ khi đăng nhập Vercel trên thiết bị hoặc tắt bảo vệ. Chưa xác minh cookie `Secure` khi chấm sao thật, chưa kiểm ghi visit/feedback vào DB, chưa bật publishing, chưa có tài khoản chủ shop (bootstrap cần authority). `main` vẫn ở `68e435b`, chưa merge.

## Bộ test cần PostgreSQL đã chạy; hai lỗi trong test đã sửa — 2026-09-16

- Dựng cluster fixture bằng binary Postgres.app18.6 (máy không có Homebrew), cổng55439/role `nfc_test`/DB `nfc_repo_test`, không dùng server mặc định; đã dừng sau khi xong. Lệnh đầy đủ trong [antigravity-connect.md](antigravity-connect.md).
- Đạt hết: repository **53 passed**; public-v2+browser-hardening **15 passed +1 skipped** và **production gate 1 passed**; publishing **4+1**; owner dashboard **3+1**. Tất cả exit0. Skip duy nhất là `3E foreground visibility` với `test.skip(true,…)` Astra đặt sẵn, không phải hồi quy.
- **Lỗi test1:** `playwright.repository.config.ts` để `fullyParallel: true, workers: 2`, nhưng `OwnerAuth.login` giữ `pg_try_advisory_xact_lock` phạm vi **toàn database** (cố ý: một KDF mỗi lúc) còn test cô lập bằng **schema**. Hai case login song song → một case `LOGIN_FAILED`. Đổi `fullyParallel: false`, giữ `workers: 2`. Không sửa sản phẩm, không giảm test.
- **Lỗi test2:** `public-v2.spec.ts:169` (`gate off…`) gọi cổng3319 là app build production, nhưng harness build/dựng3319 **sau** pha test chính nên `ECONNREFUSED` kể cả có `--build` — test này không bao giờ pass được. Bốn dòng đó trùng y nguyên test `production gate` (dòng223) vốn có `test.skip` đúng pha. Đã bỏ ba dòng3319, giữ assertion thuộc cổng3318 và `experiences>0`. Chúng được thêm ở lát owner dashboard mà lệnh lát đó không chạy file này, nên chưa từng được chạy lại.
- Ba lệnh harness **loại trừ nhau**, phải chạy riêng: không cờ cho public-v2/browser-hardening, `--publishing publishing.spec.ts --build`, `--owner owner-dashboard.spec.ts --build`. Chạy `--owner --build` với toàn bộ spec cho11 failed vì `publishing = owner || --publishing` đổi `/one` sang renderer publishing.
- `main` đã fast-forward `68e435b`→`8edd68a` theo yêu cầu Tài; Vercel production build lại, gate vẫn đóng. `/caphe-demo` trên production trả200 kèm trang "Trang chưa sẵn sàng" vì `SERVER_DATA_ENABLED` chỉ đặt cho Preview — production trơ đúng chủ ý. Ghi nhận để sau: cấu hình thiếu nên trả503 thay vì200 để giám sát uptime không tưởng site khoẻ.
- Deployment Protection đã tắt theo Tài chọn (B); preview truy cập ẩn danh được, `/caphe-demo`200 và `/api/owner/v2/*`401. Còn tồn: chưa test iPhone/Safari thật, chưa có tài khoản chủ shop, chưa bật publishing trên preview, còn một `next-server` chạy hơn5 ngày từ phiên trước chưa tắt.

## Mô hình thương mại, tầng admin, cấu trúc URL — Tài chốt 2026-09-16

Phiên brainstorm, **không viết code**. Chi tiết đầy đủ: [commercial-model.md](commercial-model.md). Tóm tắt các quyết định đã duyệt:

- **URL:** một slug suy ra hai đường `/<slug>` (khách) và `/ZZZ/<slug>` (dashboard), không phải hai tên rời — hai tên rời sẽ có ngày gắn lệch và chủ shop A thấy dữ liệu shop B. **Thẻ in `/t/<mã>`, không in slug**, vì slug là tên và tên sẽ đổi. Đã kiểm chứng đổi slug an toàn: không bảng nào ngoài `shops` lưu slug, mọi lịch sử tham chiếu `shops.id`. Khi generate, slug là mã ngẫu nhiên; đổi sang tên đẹp sau bằng một nút.
- **Tên miền:** `quitesensational` (trùng Instagram của Tài); đuôi chưa chốt, `.app` được khuyến nghị vì nằm trong HSTS preload. Chưa kiểm tình trạng còn trống.
- **Tách trạng thái:** giữ `publishing_state` cho vận hành, thêm `paid_until` **chỉ là một ngày** cho thương mại. Ba cổng đọc khác nhau (**khoá giữa**): trang khách chỉ cần `active` nên **vẫn chạy khi quá hạn**; ghi visit và dashboard cần thêm còn hạn. Lý do: dùng `suspended` để đòi nợ sẽ giết thẻ NFC trên quầy và phạt khách của shop, hại thương hiệu Tài. `grace_days` để trong bảng, không hardcode.
- **Bảng giá:** tháng đầu miễn phí, sau đó trả trước. **Bỏ gói 3 tháng** (300k bằng đúng 3×100k, không ai chọn).100k/chi nhánh gồm5 thẻ active;8k cho thẻ6–20;5k từ thẻ21; chi nhánh thứ2+ giảm20% nền; gói năm1.000k. **Chỉ tính thẻ `active`.** Hỗ trợ shop nhỏ nằm sẵn trong cấu trúc giá, không cần mã.
- **Chuỗi = nhiều shop, không phải một dashboard.** Ràng buộc sản phẩm chứ không phải giá: mỗi chi nhánh có Google Maps riêng nên `googleUrl` riêng. `owner_memberships_v2` đã hỗ trợ một tài khoản nhiều shop; mockup đã có ô chuyển shop.
- **Mã giảm giá:** khai trương 50% **chỉ cho gói1 tháng**,2 mã mỗi shop. Tài đã được nêu rủi ro neo giá và đường băng3 tháng, **chấp nhận giữ nguyên**; từ chối đổi sang mã cho gói năm vì mở cửa cho trả giá. Mã sự kiện về sau **chỉ dùng lấy khách mới, không dùng cho gia hạn** — nếu không khách sẽ để hết hạn rồi chờ sale. Giữ khách bằng **khoá giá 17% cho ai gia hạn năm liên tục**.
- **Ân hạn7 ngày** áp cả tháng dùng thử; quyền khoá có hiệu lực từ đúng thời điểm hết hạn.3 tháng không hoạt động → báo admin → xoá theo chính sách; **gửi bản ghi về email chủ shop** kèm nhật ký truy cập. Tài chấp nhận audit ghi lại cả lần chính mình vào xem.
- **Thẻ bán đứt, thuê bao riêng.** Ngừng trả thì mất dashboard, không mất thẻ.
- **Thanh toán:** chuyển khoản + VietQR, chưa dùng cổng thẻ. **Nguồn thanh toán cắm rời**: bot chỉ là một nguồn tạo bản ghi, admin gõ tay tạo cùng loại bản ghi; `paid_until` chỉ đổi qua bản ghi đó. Không tự động gia hạn chỉ theo số tiền.
- **Admin là bảng danh tính riêng**, không phải cột `role` trên `owner_identities_v2`. Mọi hành động admin ghi sổ bất biến. **Mạo danh tách hai quyền**: sửa cấu hình hộ (thường xuyên) tách khỏi đọc dữ liệu gồm góp ý riêng tư (nhạy cảm, có hạn giờ, ghi sổ, chủ shop nhìn thấy). **Tài không bao giờ biết mật khẩu khách** — dùng link thiết lập một lần.
- **Nút Generate không đụng Vercel**, chỉ là một transaction Neon; hai URL tồn tại ngay vì là đường dẫn trên cùng app.1 hay1000 shop chi phí hạ tầng gần như không đổi.
- **Thiếu sót đã phát hiện:** `owner_identities_v2` **không có trường email** nên hiện không liên hệ được chủ shop, trong khi chính sách xoá dữ liệu yêu cầu gửi bản ghi; cần thêm email + xác minh + dịch vụ gửi mail. Mockup có âm thanh popup, nút Facebook, nút gọi điện (`tel:` bị `url()` chặn vì chỉ cho `https:`), bố cục card, gradient chuyển động — đều chưa có trong schema. Cookie owner đang `path:'/'` nên gửi kèm cả request trang khách; không phải lỗ hổng nhưng là phơi bày thừa.
- Còn để mở: đuôi tên miền, dịch vụ email, nhà cung cấp bot, thuế/đăng ký kinh doanh, thời hạn chính xác tới lúc xoá, giá bán thẻ.

## Lát 1a — nền danh tính admin — 2026-09-16

- Thực hiện mục 8 của [commercial-model.md](commercial-model.md). **Không sửa file hiện có nào**; chỉ thêm `db/migrations/005_platform_admin.sql` (+rollback), `lib/admin/auth.ts`, `lib/admin/audit.ts`, `scripts/bootstrap-admin.mjs`, `repository-tests/admin-auth.spec.ts`. Chưa có route HTTP/cookie/UI/mạo danh — để lát 1b.
- Admin là **không gian danh tính tách hẳn** khỏi owner: bảng riêng, domain hash riêng, bucket throttle riêng, khoá advisory riêng. Chỉ dùng chung `passwordKey` và `transaction` của owner để hai vai trò cùng chi phí mật khẩu.
- **Khoá advisory riêng** (`nfc-admin-login-v1`): nếu dùng chung khoá owner, một luồng đăng nhập owner dồn dập sẽ khoá luôn đường vào của người vận hành đúng lúc cần xử lý sự cố. Đánh đổi: tối đa2 KDF song song.
- **`admin_login_limits` là bảng riêng** vì `owner_login_limits` có bucket `'global'` dùng chung; ngưỡng chặt hơn20/phút và5/username/15phút. **Phiên4 giờ** thay vì8 của owner vì token admin mở mọi shop. Mật khẩu admin tối thiểu16 ký tự thay vì12.
- `admin_audit` chỉ thêm, trigger `publishing_immutable()` chặn UPDATE/DELETE; `on_behalf_of` phân biệt việc admin làm thay mặt chủ shop với việc chủ shop tự làm. Ghi audit trong cùng transaction với hành động.
- **Nợ kỹ thuật có chủ ý:** `scripts/bootstrap-admin.mjs` nhân bản4 tham số scrypt vì Node không import được module TS (constructor parameter property không qua được type stripping). Chặn trôi lệch bằng test chạy chính script đó rồi đăng nhập qua thư viện. Script đọc mật khẩu từ stdin, không từ tham số dòng lệnh. Giữ credential database chính là thẩm quyền; không có route đăng ký.
- Kiểm chứng: typecheck và ESLint exit0; `admin-auth.spec.ts` **8 passed**; **toàn bộ repository suite 61 passed, chạy3 lần liên tiếp** đều xanh; `scripts/migrate.mjs` áp đủ001–005 rồi báo up-to-date,28 bảng; rollback từ chối khi có dữ liệu và xoá sạch khi trống.
- **Một test bản đầu viết sai, đã sửa:** kiểm cách ly throttle bằng owner login là flaky — owner `login()` kiểm advisory lock trước khi ghi bucket, nên khi spec owner chạy song song giữ khoá đó thì lượt login trả null, vẫn ném `LOGIN_FAILED` để `rejects` pass nhưng không ghi bucket. Bản sửa so sánh trực tiếp hai giá trị `hashtextextended` rồi giữ đúng khoá admin; cố ý không giữ khoá owner vì nó phạm vi toàn database. Chi tiết: [platform-admin.md](platform-admin.md).

## Lát 1b — tầng HTTP của admin — 2026-09-16

- Thêm `server/admin.ts`, `app/gov/api/{login,logout}/route.ts`, `app/gov/{login/,}page.tsx`, `components/admin-{login,sign-out}.tsx` + CSS riêng, `integration-tests/admin-http.spec.ts`. Sửa `next.config.ts` (header cho `/gov`), `.env.example` (`NFC_ADMIN_ENABLED`), `integration-tests/run-local.mjs` (cờ `--admin`).
- **API admin đặt dưới `/gov/api/...` chứ không phải `/api/admin/...`**, lệch quy ước owner có chủ ý: cookie chỉ nhận một path, nên gom cả trang lẫn API dưới `/gov` cho phép `path:'/gov'` — credential mở được mọi shop không bao giờ đi kèm request vào trang khách. Test khẳng định trực tiếp bằng cách đọc header `cookie` của request điều hướng sang `/one`. Owner cookie vẫn `path:'/'`; thu hẹp nó là việc của lát khác.
- Admin **không nhận tham số chuyển hướng**: luôn về `/gov`, nên không có bề mặt open-redirect để bảo vệ như `safeDestination()` của owner. Route từ chối mọi khoá ngoài `username`/`password`.
- `adminOrigin`/`adminInput` gọi lại `ownerOrigin`/`ownerInput` rồi dịch kiểu lỗi sang `AdminError`: một bộ đọc body đã làm chặt, sửa một chỗ, mà route admin không trả mã lỗi owner.
- `/gov` phân biệt phiên bị từ chối (về `/gov/login`) với database lỗi (trang gián đoạn); gộp lại sẽ tạo vòng lặp khi database hỏng.
- Kiểm chứng sau thay đổi: **7 bộ đều exit0** — contracts60, client73, repository61, public+browser15+1skip và2 production gate, publishing4+2, owner3+2, **admin HTTP2+2**. Test production gate của admin chỉ khẳng định HTTP404 nên chạy cả ở lượt không bật cờ admin.
- Một test viết sai đã sửa: `getByRole('alert')` vi phạm strict mode vì Next render `__next-route-announcer__` cũng `role="alert"`; thu hẹp bằng `getByRole('main')`.
- Chưa có: mạo danh, bảng danh sách shop, nút Generate, thanh toán. Chi tiết: [platform-admin.md](platform-admin.md).

## Admin chạy thật trên preview — 2026-09-16

- Chuỗi đầy đủ đã chứng minh trên hạ tầng thật: bootstrap danh tính → `--reset` mật khẩu → đăng nhập → phiên với cookie `path=/gov` → vỏ `/gov`. Production vẫn trả404 cho `/gov` và `/gov/login`.
- **Lỗi lớn nhất của lát này không nằm trong code ứng dụng: Vercel chụp ảnh biến môi trường tại thời điểm tạo deployment.** Sau khi Tài xoay mật khẩu Neon, mọi đường chạm database trả503 trong khi `vercel env pull` lấy về chuỗi mới và chuỗi đó xác thực được từ máy local — bản đang phục vụ vẫn giữ ảnh chụp cũ. **Xoay credential database thì phải deploy lại**, và vì `vercel deploy` không di chuyển alias theo branch, cách đúng là push một commit.
- Thứ trả lời được câu hỏi đó là dòng log `ADMIN_UNEXPECTED` thêm ở commit trước: trước đó chỉ thấy `SERVICE_UNAVAILABLE` và không có gì để lần. `ownerFailure` vẫn nuốt lỗi tương tự — đáng thêm log khi có dịp.
- **Không xoá được tài khoản admin** vì `admin_audit` tham chiếu actor và trigger chặn DELETE. Đúng về toàn vẹn sổ sách, nhưng thiếu đường đặt lại mật khẩu là kẹt; đã thêm `--reset` (thay hash, thu hồi mọi phiên, ghi `admin.password_reset`).
- Hai lỗi trong script bootstrap đã sửa và có test: prompt gõ tay không phản hồi rồi thoát hẳn khi sai; nhánh đọc qua ống dùng readline đợi hết *dòng* nên treo vĩnh viễn với input không có ký tự xuống dòng, thoát mà không ghi gì và không báo lỗi nào ra ngoài. Nghi ngờ mật khẩu đầu tiên sai do **bộ gõ tiếng Việt** biến đổi ký tự ngay tại Terminal — số ký tự khớp, nội dung không; không chứng minh được nên chỉ ghi là nghi ngờ. Khuyến nghị: đặt mật khẩu qua đường ống, không gõ tay.
- Đo trên preview: POST chặn origin0,41s · GET có database0,66s · POST login2,54s. Phần chênh ~1,9s là scrypt, đúng mức OWASP khuyến nghị, **không phải lỗi hiệu năng cần tinh chỉnh**. Ghi nhận để bàn sau: `login()` giữ một kết nối database suốt thời gian chạy scrypt.
- Repository suite **63 passed**. Một commit đã lỡ push khi typecheck đỏ vì chuỗi lệnh không chặn; đã sửa ở commit kế và từ đó nối `&&` để commit chỉ chạy sau khi typecheck, lint và test đều xanh.

## Lát mạo danh — admin xem dashboard thay mặt chủ shop — 2026-09-16

- Tài duyệt: tách quyền sửa cấu hình sang lát editor (chưa có gì để sửa); **phiên mạo danh chỉ đọc**; **lý do bắt buộc, chủ shop đọc nguyên văn**, giới hạn 10–200 ký tự. Bốn yêu cầu thêm: chặn export `overview` **ở server**; chặn ghi **trong `authorize`**; **tái dùng cổng owner**; **một phiên sống mỗi admin**. Ghi sổ theo request, export một dòng kèm số lượng.
- `authorize()` nhận thêm **loại việc bắt buộc** (`overview`/`feedback`/`export`/`write`). Cổng chung `ownerShop()` (identity + membership + shop active) dùng cho cả hai nhánh. Mạo danh còn phụ thuộc phiên admin: **admin đăng xuất là phiên mạo danh chết theo**.
- Migration 007: `admin_impersonation_sessions`, CHECK tối đa 30 phút, unique index một phiên sống, trigger chỉ cho đóng một lần. `admin_audit` ghi `impersonation.start/read/export/end`. Số dòng export đếm trong cùng snapshot với cursor và ghi **trước** byte đầu tiên.
- Chủ shop thấy mục "Lượt truy cập của quản trị" gồm lý do nguyên văn, số lần xem, số lần tải và số dòng đã tải.
- **Lỗi của agent trong lát, đã sửa:** `response.cookies.set` của Next lưu theo tên, nên đặt cùng cookie cho hai `path` chỉ ra một header; dashboard không nhận cookie. Repository test không bắt được, test HTTP bắt được. Sửa bằng cách tự ghi `Set-Cookie`. Thêm một lỗi test: lùi `expires_at` mà quên `created_at` nên vi phạm CHECK.
- Nợ cũ đã trả: `ownerFailure` giờ ghi `OWNER_UNEXPECTED`.
- Kiểm chứng: tsc/eslint exit 0; repository **79 passed**; harness admin 4+2, owner 3+2, publishing 4+2, public 15+1 skip+2, tất cả exit 0; migrate 001–007 idempotent. Đã **gỡ từng lớp chặn** (ghi, phạm vi, shop active, xoá nội dung, ghi sổ export) và lần nào test cũng đỏ. Chi tiết: [admin-impersonation.md](admin-impersonation.md).
- Ngoài phạm vi lát này: `app/gov/api/setup-links/route.ts` ghi sổ ngoài transaction và không kiểm `shopId` khớp chủ shop. **Đã sửa ở mục kế tiếp.**

## Phát lại liên kết: một transaction, đúng shop — 2026-09-16

- Lỗi cũ ở `app/gov/api/setup-links/route.ts`: phát link rồi mới ghi `admin_audit` bằng **hai câu lệnh rời**, nên link có thể tồn tại mà không có dòng sổ; và `shopId` lấy thẳng từ request ghi vào sổ **không kiểm chủ shop có thuộc shop đó**, nên sổ có thể quy việc phát lại cho sai shop.
- Sửa: `OwnerSetupLinks.reissue(userId, shopId, record)` kiểm membership, phát link và gọi `record` (ghi sổ) **trong cùng một transaction**. Route kiểm `ownerUserId`/`shopId` đúng dạng UUID.
- **Tài chọn: chỉ kiểm membership** (membership active + danh tính active), không xét `publishing_state`. Shop draft hoặc bị đình chỉ vẫn phát lại link được; membership đã tắt thì không. Không dùng `ownerShop()` vì nó đòi shop `active`.
- Lỗi phụ phát hiện khi sửa: `OwnerError('OWNER_NOT_FOUND')` không được `adminFailure` dịch, nên chủ shop không tồn tại trả **503** thay vì 404. Route giờ đổi `OwnerError` thành `AdminError`: shop sai hoặc chủ shop không còn → 404, id lệch dạng → 400.
- Test: repository thêm ca shop sai, ghi sổ thất bại (link mới bị huỷ, link reset trước đó vẫn mở), shop đình chỉ vẫn được, membership tắt bị chặn. Harness admin thêm ca HTTP 404/400/200 và đếm dòng sổ. **Gỡ từng lớp** (bỏ kiểm shop, bỏ kiểm membership active, ghi sổ ngoài transaction) — lần nào test cũng đỏ.
- **Lỗi của agent trong lát, đã sửa trước khi chạy/báo cáo:** bản test đầu kiểm "link cũ vẫn mở" bằng link `setup`, trong khi phát lại chỉ thay link `reset` — ca đó xanh cả khi code sai; đã đổi sang link `reset` phát trước. Lần chạy harness đầu in `EXIT=$?` sau `| tail`, tức là mã thoát của `tail`, không phải của harness; đã chạy lại với output ghi ra file để lấy đúng mã.
- Kiểm chứng: tsc/eslint exit 0; repository **80 passed**; harness admin **5 passed + 2 passed**, exit 0.

## Phát lại liên kết: nguyên tử và đúng shop — 2026-09-16

- Làm ở một phiên phụ, chạy **ngay trong worktree này**; phần dọn và commit làm ở phiên chính.
- `OwnerSetupLinks.reissue(userId, shopId, record)`: kiểm membership còn hoạt động, phát liên kết và ghi sổ **trong cùng một transaction**. Trước đó route ghi sổ riêng một lệnh, và nhận `shopId` bất kỳ nên sổ có thể ghi sai shop. Route cũng kiểm định dạng mã (sai định dạng trả 400 thay vì 503).
- **Tài xác nhận:** chỉ xét membership, không xét trạng thái shop. Shop chưa lên sóng vẫn cần liên kết; shop bị khoá cũng không mở được gì vì dashboard vẫn đóng.
- Dọn: bỏ `issue()` vì không còn mã thật nào gọi (test chuyển sang `reissue`), xoá file rác `.bak`. Test của phiên phụ từng ghi "Tài chose" khi anh chưa chọn; giờ đã được anh xác nhận.

## TIẾP TỤC TỪ ĐÂY — cập nhật 2026-09-16

Khối này luôn nằm cuối `decisions.md`. Phiên mới đọc nó trước, rồi mới đọc theo thứ tự bên dưới.

### Đang ở đâu

Branch `feat/local-app-foundation`, đã đồng bộ `main`. Preview Vercel chạy thật với Neon branch `preview/feat/local-app-foundation` (migration 001–006). Production deploy được nhưng **đóng**: không đặt `NFC_ENV` nên mọi bề mặt v2 trả 404, và không có `SERVER_DATA_ENABLED` nên không chạm database.

Chạy được trên preview: trang khách · dashboard chủ shop · quản trị `/gov` (đăng nhập, tạo shop, phát lại liên kết) · trang chủ shop tự đặt mật khẩu.

**Mạo danh (chỉ đọc) đã xong ở local, CHƯA lên preview.** Migration 007 chưa áp lên Neon. **Phải migrate 007 lên branch mặc định và branch preview TRƯỚC khi push**: dashboard chủ shop giờ đọc `admin_impersonation_sessions`, nên thiếu bảng là dashboard trả 503 cho mọi chủ shop.

Chưa có: sửa cấu hình hộ (chờ editor) · kích hoạt thẻ (`prepared → tested → active`, nên `/t/<mã>` chưa sống) · thanh toán · gửi email tự động · editor cho chủ shop · R2 · tên miền riêng. `NFC_PUBLISHING_ENABLED` vẫn tắt trên preview, nên trang khách còn render đường legacy.

### Thứ tự đọc cho phiên mới

1. `AGENTS.md` — quy tắc làm việc
2. **`docs/operations-gotchas.md`** — mọi bẫy đã dính, đọc trước khi dựng môi trường hay deploy
3. `docs/commercial-model.md` — mô hình kinh doanh, bảng giá, tầng admin, quyền. Đây là nơi chốt **cái gì** phải xây
4. Khối này, rồi lùi lên các checkpoint gần nhất trong `decisions.md`
5. Chỉ đọc tài liệu lát cụ thể khi sắp sửa đúng phần đó: `platform-admin.md`, `admin-impersonation.md`, `owner-provisioning.md`, `publishing-core.md`, `owner-dashboard-v2.md`, `antigravity-connect.md`

### Dựng môi trường

Node 24 qua nvm (`~/.zshrc` đã nạp sẵn). PostgreSQL dùng binary Postgres.app, **dựng cluster riêng cổng 55439** — lệnh đầy đủ trong `antigravity-connect.md`. Cluster nằm ở thư mục tạm nên **mất sau khi khởi động lại máy**, dựng lại từ đầu là bình thường.

Kiểm tra: `node node_modules/typescript/bin/tsc --noEmit` · `node node_modules/eslint/bin/eslint.js .` · bốn lệnh harness trong `operations-gotchas.md`. **Không dùng `pnpm <script>`.**

### Lát tiếp theo, theo thứ tự đề xuất

1. **Đưa mạo danh lên preview**: migrate 007 (Tài làm bước có credential), push, rồi thử thật trên preview.
2. **Kích hoạt thẻ** để `/t/<mã>` sống.
3. **Thanh toán** — `shop_billing` với `paid_until` **chỉ là một ngày**, ghi tay trước, bot sau. Ba cổng đọc khác nhau, xem `commercial-model.md` mục 2.
4. **Bật `NFC_PUBLISHING_ENABLED`** — cần mọi shop có release, kể cả `caphe-demo` vốn seed bằng INSERT thẳng.

### Việc còn treo của Tài

Mua tên miền (`quitesensational`, chưa kiểm còn trống). Đăng ký Cloudflare R2. Xoay mật khẩu `neondb_owner` và mật khẩu admin `tai` khi xong giai đoạn thử — cả hai đã xuất hiện trong hội thoại.
