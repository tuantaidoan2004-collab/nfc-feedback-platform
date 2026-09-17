# Private feedback v2 — contract thuần3C.1

Chưa DB/API/client/UI. `lib/domain/private-feedback.ts` là aggregate contract mới, tái dùng types/rateSession/canReuseSession hiện có. Runtime rating cũ chưa bị đổi. Cả hai write khi tích hợp phải dùng chung aggregate/revision trong cùng transaction; chỉ thêm endpoint feedback cạnh repository rating hiện tại sẽ chưa bảo đảm contract này.

## Bất biến và snapshot

> **Đã thay 2026-09-17 (lát B1, migration 010):** góp ý riêng **không cần sao**. Góp ý đầu tiên với `expectedRevision: 0` tạo experience có `rating: null`, revision 1; chấm sao sau đó dùng tiếp chuỗi revision đó. `RATING_REQUIRED` không còn tồn tại. Xem [redesign-v2.md](redesign-v2.md) mục Lát B1.

Không rating thì không experience: feedback đầu tiên trả RATING_REQUIRED, không tạo session/experience hay tự chấm sao. Sau bất kỳ1–5 sao, feedback được phép; low score mở form chỉ là UI, không phải quyền ghi. Google invitation giống nhau mọi sao; nội dung riêng không gửi Google. Contract không có chức năng mạng hay Google.

FeedbackExperience mở rộng RatingExperience bằng feedback:null hoặc {topic,message,submittedAt,updatedAt}. experience.revision là revision chung duy nhất, dùng expectedRevision cho cả rating và feedback; không có feedback concurrency token riêng. firstInteractionAt giữ lần rating đầu. Mỗi write applied tăng revision đúng1, cập nhật experience.updatedAt và session.lastActivity đơn điệu bằng server time được caller truyền. Feedback submittedAt giữ lần gửi riêng đầu, updatedAt chỉ đổi khi gửi riêng. Đổi rating giữ toàn bộ feedback; timestamp không lùi khi clock server lùi. Đây là activity của thao tác được chấp nhận, không thêm KPI click/form.

`rateFeedbackExperience` bọc logic rating cũ, giữ feedback và feedback receipts. `submitPrivateFeedback` thay snapshot góp ý hiện tại (không append nhiều feedback item), giữ rating. Receipt immutable lưu intent canonical + snapshot khi applied; state trả về luôn là state hiện tại. Không dùng receipt cũ để rollback UI/state mới.

Ví dụ: rating5 rev1 → feedback rev2 → rating2 rev3 (giữ feedback) → edit feedback rev4 (giữ rating2). Hai request expectedRevision1 cạnh tranh: chỉ một write được áp dụng; request kia conflict, phải reconcile rõ ràng. Contract thuần mô hình transition, chưa chứng minh atomicity/concurrency DB.

## Intent, context và lỗi

FeedbackIntent = VisitContext + intentId/expectedRevision/topic/message; visit/session/shop/scope/entry phải khớp trusted state trước khi lookup receipt. Cùng source session cho phép một open khác gửi intent mới nhưng retry phải giữ source visit gốc. Rating và feedback dùng chung namespace intentId trong session, đổi operation cùngID trả INTENT_CONFLICT. Hai receipt arrays chỉ là cách tổ chức state thuần, không chốt schema DB.

Retry feedback cùng intent/source/revision/topic/message đã chuẩn hóa trả receipt gốc; không tăng revision/activity, kể cả đã idle>=15phút/đóng session. Thay payload/source của intent cũ trả INTENT_CONFLICT. Intent mới khi expired trả SESSION_EXPIRED; không revive/chuyển sang phiên mới. Revision lệch trả REVISION_CONFLICT; mọi rejection/replay trả nguyên state input không mutate.

Rejections: CONTEXT_MISMATCH, INVALID_INPUT, INTENT_CONFLICT, REVISION_CONFLICT, SESSION_EXPIRED, RATING_REQUIRED. Đây là domain boundary với context đã xác thực, không thay capability/auth/tenant isolation của server. Không serialize nguyên FeedbackExperience/receipt vào rating public API: chúng chứa private content. Projection/authorization cụ thể phải thiết kế ở lát API sau; chưa cấp quyền đọc feedback/dashboard.

## Chuẩn hóa nội dung

Topic là code lowercase ASCII `[a-z][a-z0-9_-]{0,31}`, tối đa32ký tự, không tự trim/casefold; chỉ giới hạn an toàn, không taxonomy được chốt. Ví dụ service/general không phải danh sách ngành hay template schema.

Message: reject malformed UTF-16/unpaired surrogate; CRLF/CR→LF, Unicode NFC rồi trim; độ dài1..2000 theo Unicode code point sau normalize, không theo UTF-16 unit hoặc grapheme. Emoji😀=1, chuỗi ZWJ có thể nhiều code point. Giữ xuống dòng/tab bên trong; reject C0 khác và C1/DEL. Chuẩn hóa tương đương là cùng payload khi retry. Message là plain text; không HTML rendering, sanitizer hay Markdown execution. UI sau phải escape đúng, không dùng innerHTML với nội dung này. Không chốt taxonomy, retention/xóa, upload hay KPI.

## Bằng chứng và bước sau

24 feedback tests mới đạt;24 rating tests hiện có đạt ở lần chạy liên quan. Lần đầu47 tests (23+24) đạt; sau bổ sung regression clock lùi và sửa timestamp feedback chạy lại24 feedback đạt. Typecheck/lint/diff đạt. Tests bao gồm no rating,1–5 success, common revision/interleaving,5→2 preservefeedback, retry after expiry/closure, cross-operation intent collision, tenant/session/scope/entry/source mismatch, normalized retry, Unicode boundaries và immutability.

Chưa test DB/API/browser/client; không sửa visit-rating.ts/repository/server/client/UI hoặc dependency. Không Neon/secrets/commit/deploy. Đề xuất sau rà: thiết kế repository transaction cho aggregate chung và migration/projection riêng, trước khi thêm endpoint/client. Không tự triển khai lát sau.

## Tiến độ3C.2

Aggregate repository/002 local đã triển khai và kiểm chứng; xem docs/visit-rating-repository.md mục3C.2.22PG repository +48pure contracts đạt. Cả2write khóa chung/session revision, shared receipt namespace, public rating/register redact private fields. Chưa API/client/UI hoặc owner authorization; phần3C.1 ở trên là contract nền, không phải tuyên bố runtime đã nối đầy đủ.
