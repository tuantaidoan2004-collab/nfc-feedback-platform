# Vòng đời platform NFC — đặc tả 2026-09-11

Trạng thái: foundation session15phút đã có contract/migration002/repository/API development và test local; chưa nối UI/Neon. Template/tag/editor dưới đây vẫn là đề xuất.001/legacy giữ nguyên. Quyết định15phút mới thay mô hình experience-per-open cũ.

## Ranh giới

Một app Node/Next.js dựng nhiều trang từ template và config. PostgreSQL lưu dữ liệu/quyền/config; R2 lưu asset; Git lưu code. Tạo shop theo template hiện hữu không cần clone app hoặc deploy code mới. Thêm loại component mới vẫn có thể cần sửa renderer và deploy.

Tài có quyền quản trị platform để tạo/publish; chủ shop có membership chỉ cho dữ liệu shop. Hai quyền này phải được kiểm tra riêng ở server; không suy ra quyền platform từ membership. Preview/test có scope riêng do server cấp, không nhận `is_test=false` hoặc shop_id tự khai làm bằng chứng quyền.

## Mô hình đề xuất

| Thực thể | Khóa/liên kết và dữ liệu chính | Ràng buộc/vòng đời |
|---|---|---|
| shops | id, slug, name, state, active_release_id | Slug duy nhất không phân biệt hoa thường, tránh api/ZZZ/t/demo; draft → active → suspended. Đổi slug cần alias/redirect, không tái cấp slug cũ tùy tiện. |
| template_versions | id, template_key, version, config_schema_version, renderer_version, capabilities | Template dùng chung, version đã phát hành bất biến; shop không tự động đổi theo template mới. |
| page_drafts | id, shop_id, template_version_id, config, revision | Tài sửa với optimistic concurrency; chưa public. Config giới hạn theo schema, không chứa JS/HTML tùy ý. |
| page_releases | id, shop_id, template_version_id, config_snapshot, created_by, created_at | Snapshot bất biến sau validation. shop trỏ release đang active; giữ release cũ để rollback. |
| media_assets | id, shop_id hoặc thư viện platform, object_key, kind, state, metadata | R2 chứa bytes; DB chứa metadata/key. pending → ready → retired. Không xóa asset còn được release tham chiếu; asset draft không mặc định public. |
| tags | id, public_code, shop_id, location_label, state | prepared → tested → active → disabled. Code công khai duy nhất; tag không là quyền truy cập. Mặc định theo active release của shop. |
| preview_sessions | id, shop_id, draft/release snapshot, token_hash, expires_at | Tài tạo sau xác thực; scope test riêng, hết hạn thì từ chối. Không tự động chuyển preview thành live. |
| visit_sessions | id, shop/scope/entry/browser_hash, started_at,last_activity,closed_at | Session ước tính: idle<15phút tái dùng;>=15phút tạo mới. Không unique person/NFC tap. |
| page_visits | id,session_id,shop/scope/entry,opened_at,load_key,navigation_kind; release/tag sau | Một lần load/reload/restore có event riêng; retry không trùng. Attribution do server resolve. |
| rating_experiences | session_id,shop/scope/entry,rating,first_interaction_at,revision | Tối đa một/session, chỉ tạo khi rating. Nhiều page_visit cùng session dùng chung điểm. |
| ratings / feedback / owner_notes | experience_id, shop_id, scope; nội dung/điểm/trạng thái tương ứng | Rating tối đa một/experience; revision chống request cũ. Có thể giữ gộp trong experiences ở lát đầu thay vì tách bảng ngay. Note chỉ owner đọc. |
| interaction_events | id, experience_id, kind, received_at, intent_key | Tùy nhu cầu đo click; unique intent chống retry. Không suy ra review Google đã đăng. |

Các liên kết theo shop/scope cần FK ghép hoặc kiểm tra tương đương, tránh tag A/visit B hay preview/live nối chéo. Kho dữ liệu preview đề xuất dùng bảng/schema riêng và repository riêng, không chỉ lọc ở frontend. Development dùng DB branch/bucket riêng; preview ngay trên platform live vẫn cần kho test riêng. Membership/session hiện có là nền, chưa là hệ thống login hoàn chỉnh.

## Draft, preview, publish và tag

1. Tài tạo shop draft, đặt slug còn trống, chọn version template.
2. Nhập config/media/link; kiểm tra kiểu, kích thước, quyền asset, URL cho phép và ràng buộc sản phẩm. Media phải ready trước publish.
3. Preview đóng băng draft revision vào snapshot; dữ liệu minh họa và tương tác thử chỉ vào kho test. Không tự điền dữ liệu khách thật vào preview. Preview không được cache công khai/index.
4. Publish kiểm tra quyền Tài và revision; trong một transaction tạo release và đổi active_release_id. Publish chưa kích hoạt tag. Nếu bước nào lỗi, giữ release cũ. Cache công khai theo shop/release; vô hiệu cache con trỏ sau commit, có retry nếu invalidation lỗi.
5. Tạo tag prepared, link `/t/<public_code>`. Test bằng scope test đã xác thực, không bật tạm tag live để test. Test lại sau thay đổi ảnh hưởng routing/config.
6. Kích hoạt sau test: server kiểm tra shop/release/tag hợp lệ. Tag chưa active không phục vụ trang live; có thể trả trang chưa kích hoạt nhưng không đưa vào thống kê khách live.
7. `/t/<tag-id>` resolve tag → shop → active release và render cùng template như `/<shop>`, giữ tag attribution. Không tạo thêm visit do redirect nội bộ. Direct slug có tag_id null. Không tạo Vercel project mới.
8. Publish version mới không sửa visit đang mở: visit pin release tại thời điểm mở; lần mở kế tiếp nhận release mới. Khi shop/tag bị khóa, từ chối tương tác mới kể cả trang cũ còn mở. Rollback đổi con trỏ về release cũ, không sửa lịch sử.

## Page visit, session và experience — đã chốt lại

Mỗi load/reload/back-forward/resume có page_visit riêng với server time/navigation kind. Server gom theo anonymous browser hash + shop/scope/entry attribution, idle<15phút dùng lại session; idle>=15phút tạo mới. Chỉ rating tạo/thay đổi tối đa một experience/session. Không fingerprint/IP hoặc gọi session là khách duy nhất/chạm NFC. Browser secret dùng first-party storage, event key riêng mỗi open; storage mất/đổi có thể tạo phiên khác.

Open mới/rating áp dụng cập nhật hoạt động; retry/conflict không gia hạn. Tab hết hạn phải đăng ký resume trước rating mới; receipt cũ replay được để xử lý unknown outcome nhưng không làm sống lại session. Details, transaction/FK, clock và lý do ở [visit-rating-repository.md](visit-rating-repository.md); protocol/threat model ở [visit-v2-api.md](visit-v2-api.md).

Đo bằng endpoint đăng ký open; prefetch không phải open. Metadata navigation client báo không chứng minh NFC. Khi JS/storage/mạng bị chặn, số đo có thể thiếu hoặc tách phiên; không hứa đếm mọi lượt. Chưa chốt KPI cho click, gõ form, scroll, đổi ngôn ngữ hoặc feedback. Legacy giữ riêng, không gán session/visit lịch sử giả.

## Bất biến và giới hạn template

- Google invitation: một component và cùng copy/vị trí/độ nổi bật ở mọi mức sao, truy cập trước chấm. Template không có rule ẩn/đổi Google theo rating.
- 1–3 sao mở góp ý riêng, pulse ba nhịp; dừng khi chọn 4–5 hoặc bấm nút, tôn trọng reduced motion. 4–5 vẫn gửi riêng được.
- Việt mặc định, English thủ công; version config phải có copy hai ngôn ngữ hoặc fallback được kiểm chứng. Không dịch AI theo lượt.
- Template không thiên ngành: danh mục/copy cấu hình theo shop, tên nhóm barbershop chỉ là ví dụ.
- Nền/gradient/watermark, font/effect, logo/media, link/icon, sao, animation/audio có trong phạm vi thiết kế. Đề xuất allowlist component/font/effect, ngân sách kích thước và tương phản; không cho custom script. Audio mặc định tắt, chỉ phát sau thao tác; giới hạn cụ thể chưa chốt.
- Mọi đọc/lọc/export/ghi private kiểm tra session + membership server, scope live/test; private no-store. CSV cần chống formula injection. Dashboard owner không có API chỉnh draft/publish.

## Lát triển khai đề xuất

Mỗi lát: đọc checkpoint → thực hiện đúng scope → chạy verification → báo và dừng; chỉ commit khi Tài yêu cầu. Không tự chuyển sang lát tiếp theo.

| Lát | Acceptance criteria | Verification |
|---|---|---|
| 1. Contract vòng đời thuần TypeScript | Định nghĩa visit/interaction/experience và reducer thuần: load chỉ tạo visit; rating đầu tạo experience; đổi sao cùng session qua nhiều visit cập nhật; reload tạo visit khác; request revision cũ không ghi đè. Không DB/UI/network mới. | Unit tests table-driven cho load, 5→2, reload, revision cũ, retry intent, tenant/scope mismatch; typecheck/lint. Đây là chứng minh contract, chưa chứng minh DB/concurrency. |
| 2. Schema + repository visit/rating | Migration additive, unique session/experience, legacy không đổi, test/live tách theo context; ghi rating nguyên tử. Không endpoint/UI. | PostgreSQL test đồng thời, retry, FK tenant/scope, rollback; DB local riêng, không Neon. |
| 3. Boundary API rồi client theo lần mở | Làm API development có context/token đáng tin trước; client là phần tiếp theo theo session15phút và browser storage. Không tái dùng cookie 30 ngày làm visit. | API: giả scope/shop/token, retry/revision. Khi nối client: browser hai tab/reload, không tương tác có 0 experience, 5→2, lỗi mạng; DB assertions. |
| 4. Draft/release resolver | Version bất biến, publish nguyên tử, mở trang pin release; validation chặn config vi phạm bất biến. Chưa editor lớn. | Unit config + DB publish cạnh tranh/rollback, draft không public, cache key đúng shop/version. |
| 5. Tag và preview isolation | Resolve `/t/<id>` giữ attribution; test không ghi live; disable chặn ghi mới; activation sau test. | Hai shop, tag tắt, preview hết hạn, giả scope/token, một open chỉ một visit; live totals không đổi sau test. |
| 6. Auth và dashboard chủ | Login thật; xem/lọc/export/xử lý chỉ shop được cấp; không quyền editor. | Session hết hạn, owner A đọc/ghi/export B bị từ chối, CSV an toàn, no-store. |
| 7. Editor Tài và R2 | Tạo shop theo template/version, upload asset an toàn, preview/publish/test/activate; thay config không clone code. | Admin/owner permission, upload lỗi/asset thiếu, end-to-end workflow, không đụng dữ liệu thật khi preview. |

Thứ tự có thể chỉnh khi Tài chốt rủi ro/ưu tiên; không phải cam kết lịch ngày. Public pilot còn cần rate limit dùng chung, retention/xóa, backup/restore, log an toàn, ngân sách và phép phát hành.

## Foundation hiện tại và bước tiếp theo

Lát1/2/3A cũ đã được hiệu chỉnh theo quyết định15phút.24 test thuần +28 PostgreSQL/handler test đạt, cùng typecheck/lint/diff. Chưa chạy Next HTTP/browser hoặc nối client. Không Neon/secrets/UI/dependency/commit/deploy; cluster test dừng sau kiểm tra. Prompt3B cũ không còn áp dụng; prompt mới chỉ đề xuất tại [visit-v2-api.md](visit-v2-api.md). Dừng sau hiệu chỉnh foundation; không tự chạy client3B.

## Cập nhật Publishing Core (2026-09-14)

Lát draft/release + tag + preview đã triển khai development local. Các mục “đề xuất” và foundation cũ ở trên là lịch sử. Contract/evidence hiện tại ở [publishing-core.md](publishing-core.md). Preview dùng scope test/FK ghép trong bảng foundation chung, thay đề xuất bảng/schema riêng. Release không tách session15phút; từng visit pin release bằng proof server ký. Chưa auth/dashboard/editor/R2/cache/visual mới.
