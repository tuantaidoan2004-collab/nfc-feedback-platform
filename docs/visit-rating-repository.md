# Foundation visit/session/rating — hiệu chỉnh 15 phút, 2026-09-11

Quyết định mới của Tài thay mô hình experience-per-open và token riêng document trước đây. Một page_visit là open event; một visit_session ước tính gom nhiều open có cùng browser hash + shop + scope + entry attribution. Không dùng session/browser token làm unique person hoặc NFC tap. Không fingerprint/IP. Xóa/không chia sẻ storage có thể tạo browser token và session mới.

## Contract và bảng

- `visit_sessions`: id, thứ tự sequence, shop/scope/entry_key/browser_hash, started_at, last_activity, closed_at. Một candidate chưa đóng cho mỗi nhóm; candidate vẫn có thể đã hết idle window. Không có cleanup/TTL tự động.
- `page_visits`: id, session_id, shop/scope/entry_key, load_key, navigation_kind, opened_at. Mỗi load/reload/back_forward/resume thực sự có event key mới. Retry transport dùng cùng key, không thêm event.
- `rating_experiences`: session_id làm primary key. Open không tạo experience. Chỉ rating mới tạo/thay đổi experience, tối đa một/session. Reload cùng session trả lại snapshot rating/revision hiện tại để client tiếp tục đúng revision.
- `rating_intent_receipts`: unique session/intent; lưu payload, source visit và kết quả gốc. Composite FK bảo vệ shop/scope/entry/session và source page. Đổi score/revision/source visit cùng intent bị conflict. Replay trả receipt gốc + experience hiện tại, không ghi đè điểm mới.

Migration002 chưa phát hành được hoàn thiện trực tiếp theo ủy quyền.001 và bảng experiences legacy nguyên trạng, không tạo session/visit lịch sử giả. Migrations/down chạy transactionally; down002 từ chối nếu bất kỳ bảng v2 có dữ liệu. Khi đã phát hành002 ở môi trường khác phải viết migration mới, không sửa lại lịch sử đã chạy. Không tự chuyển dữ liệu hoặc runner001.

## Cửa sổ và thời gian

Tái dùng khi idle < 900000ms; idle >= 900000ms tạo phiên mới khi đăng ký open mới. Open mới hoặc rating **áp dụng thành công** cập nhật last_activity. Retry và request bị từ chối không phải hoạt động mới, không kéo dài session. Database time (`clock_timestamp`) được lấy sau khi khóa nhóm; API không nhận thời gian client. Test có clock riêng được inject vào repository để kiểm tra chính xác mốc899999/900000/900001ms. Runtime API không dùng test clock.

Phiên cũ được đóng khi rollover; retry receipt cũ vẫn trả được nhưng không làm sống lại phiên. Tab cũ gửi rating mới sau hết hạn nhận409 SESSION_EXPIRED và không ghi điểm: client cần đăng ký resume với event key mới trước một thao tác mới. Đây là lựa chọn boundary để không gán lại page_visit lịch sử sang session khác hoặc tự bịa open trong request rating. Nếu outcome rating trước đó chưa rõ, thử lại **intent + visit cũ** trước; không tự đổi sang intent/session mới rồi ghi hai lần.

Clock lùi không làm giảm last_activity. Thứ tự session dùng sequence thay vì dựa vào timestamp/UUID. Không có heartbeat/polling cập nhật hoạt động; không tự tính cuộn trang, đổi ngôn ngữ, góp ý, click hay các KPI khác.

## Concurrency và isolation

Mọi open/rating khóa transaction advisory theo tuple shop/scope/entry/browser hash, kể cả khi chưa có session. Hai tab đầu tiên và rollover đồng thời được tuần tự hóa. Hash collision khóa chỉ gây chờ thêm, không ghép dữ liệu vì query/FK vẫn so sánh tuple đầy đủ. Partial unique index cấm hai candidate chưa đóng cùng nhóm. Khóa hàng session và ghi experience/receipt/last_activity cùng transaction; lỗi receipt hoặc open rollback toàn bộ, kể cả rollover đóng phiên cũ.

Repository chỉ nhận context do server resolve. API hiện chỉ resolve `direct:shop`; entry khác trong test kiểm chứng ràng buộc nội bộ, không phải route/attribution mới cho client tự khai. Scope test vẫn chỉ trong fixture/repository, chưa có preview API. Không có auth chủ hay RLS mới.

Cơ sở khóa: [PostgreSQL explicit/advisory locks](https://www.postgresql.org/docs/18/explicit-locking.html). Origin và bearer protection tại [visit-v2-api.md](visit-v2-api.md).

## Verification

Dùng PostgreSQL local riêng, database tên `nfc_repo_test`. Test chỉ đọc `NFC_TEST_DATABASE_URL`, từ chối host ngoài máy/DB khác/query override; không nạp `.env.local` hoặc fallback DATABASE_URL. Mỗi test schema UUID riêng rồi xóa đúng schema đó.

```sh
pnpm exec playwright test --config=playwright.contracts.config.ts
pnpm exec playwright test --config=playwright.repository.config.ts
```

Đã đạt24 test thuần và28 PostgreSQL/handler test (15 repository +13 API) trên PostgreSQL thật18.4. Typecheck/lint/diff check đạt. Bao gồm boundary15phút, BFCache/resume metadata, tabs đồng thời/rollover,5→2 qua nhiều open, token/context khác, retry, invalid input, FK, rollback và legacy. Cluster local dừng sau kiểm tra. Test handler dùng Request/Response thực và PG nhưng chưa chạy qua Next HTTP/browser/hosting; không suy ra client/storage hoạt động đã hoàn tất. Không Neon/secret thật/UI/dependency/commit/deploy.

Production còn cần retention/xóa, expiry/rotation browser token, anti-abuse, auth chủ, quyền DB và triển khai an toàn. Cửa sổ session15phút không phải TTL dữ liệu hoặc thời hạn xóa token/receipt; không tự chốt các chính sách đó.

##3C.2 — aggregate rating/private-feedback hiện hành

002 chưa phát hành được mở rộng tại chỗ theo phạm vi được giao;001/legacy không đổi, không backfill. rating_experiences giữ tên để giảm migration nhưng nay chứa feedback_topic/message/submitted_at/updated_at nullable cùng rating và revision chung. Check all-null/all-present, topic pattern, message char_length1..2000 (PostgreSQL code point), finite timestamps và thứ tự feedback timestamps. Domain chịu NFC/line-ending/trim/Unicode controls; DB constraints là lớp bổ sung, không thay domain validation.

rating_intent_receipts cũng giữ tên lịch sử; operation rating/feedback (default rating cho insert cũ), thêm snapshot feedback columns. Feedback operation bắt buộc có content. Cùng PK(shop,scope,entry,session,intent) và unique applied_revision, **không thêm operation vào key**, nên DB trực tiếp chặn cross-operation intent collision và trùng revision. Composite FKs vẫn ràng buộc experience và source page/session/context. Cột score ở feedback receipt là rating tại thời điểm feedback áp dụng, không phải một rating intent mới.

VisitRatingRepository.recordRating và recordPrivateFeedback dùng cùng transaction helper, advisory tuple lock và khóa row session, DB time lấy sau khóa như trước. Nạp current aggregate và receipt mục tiêu, gọi contract3C.1 chung; UPSERT aggregate + receipt + last_activity trong cùng transaction. Retry chỉ đọc, trả original receipt và current snapshot; rejection không ghi. No-rating feedback trả RATING_REQUIRED, expiry không revive; capability/context resolve trước receipt lookup. Unknown DB/transport không được giả định rollback bởi caller.

Public register/rating projection chỉ có RatingExperience whitelist; rating receipt cũng whitelist snapshot và không nhận extra message/topic từ command. Không trả feedback/topic/message/private receipt qua các method này dù đã có feedback. recordPrivateFeedback có result type riêng chứa private snapshot/receipt, capability-scoped theo source visit; đây không phải owner authorization hay owner API. Chưa có endpoint hoặc quyền đọc dashboard/private khác. API layer hiện không sửa, không chạy API tests trong lát này; không suy ra auth/private endpoint đã hoàn tất.

Rollback002 vẫn từ chối khi bất cứ bảng v2 có data, bao gồm feedback chung bảng; chỉ drop empty aggregate tables, giữ001. Khi002 đã phát hành ở môi trường khác phải migration tiến tiếp, không rerun002 hoặc chỉnh lịch sử. Default operation không phải fake backfill; cluster tests tạo schema sạch mỗi case.

### Verification3C.2

22 repository tests đạt trên PostgreSQL18.4 local:15test rating/session có ảnh hưởng +7test aggregate mới;48pure contract tests liên quan đạt. Thêm regression command extra private fields rồi chạy lại3projection/guardedrollback tests đạt. Typecheck/lint/diff đạt. Concurrent rating↔feedback dùng cùng expectedRevision có một winner; concurrent same feedback retries chỉ một receipt; same intent cross-operation bị từ chối, DB PK trực tiếp kiểm chứng; no-rating/5→2 preservation/original vs current replay/context/scope/entry/hash/expiry/rollback/Unicode đều đạt. Receipt trigger lỗi rollback insert/edit/revision/last_activity; legacy data/down/reapply được giữ.

Dùng lại cluster `/private/tmp/nfc-pg-test-On7KIL`, port55439, database nfc_repo_test, role nfc_test (local trust, không password). Test chỉ NFC_TEST_DATABASE_URL, mỗi case schema UUID rồi drop; không nạp env thật hoặc Neon. Sandbox chặn shared memory/network nên khởi động và test chạy ngoài sandbox theo approval. Hai role thông dụng thử không tồn tại; đã đọc tên role qua single-user SELECT rolname trước chạy thành công, không đọc password. Cluster đã dừng sau tests. Không browser/client/UI/API tests, không dependency/commit/deploy.

Bước đề xuất sau rà: API private-feedback v2 có allowlist/body limit/authorization/projection và client handling chung revision; phải phân biệt public rating snapshot với private content. Chưa thực hiện.
