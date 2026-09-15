# API v2 development — browser session 15 phút

Quyết định mới của Tài thay token riêng document và experience-per-visit. Prompt3B cũ bị hủy; client chưa nối. Xem [contract/repository](visit-rating-repository.md).

## Token và threat model

Client3B sẽ sinh browser secret32byte bằng Web Crypto CSPRNG, encode64hex thường, lưu first-party browser storage dùng chung giữa tab/reload (localStorage là lựa chọn kỹ thuật để chia sẻ giữa reload/tab, không phải chỉ dẫn cấm cookie của Tài). Browser secret dài hạn khác event/loadKey và intentId. Mỗi load/reload/restore thực sự sinh event key UUIDv4 mới; retry cùng event giữ key và navigationKind.

Khởi tạo secret khi hai tab mở lần đầu phải được phối hợp trước request đầu (ví dụ Web Locks khi có, fallback phải được kiểm thử); nếu storage bị chặn/xóa/partitioned hoặc token đổi thì có thể tạo session khác, không hứa unique browser/person tuyệt đối. Không nhận secret/event key từ URL hoặc nội dung template; không đặt secret vào URL, log, analytics hay response. Không dùng cookie chung/cookie30ngày. Module storage/coordination riêng đã có ở3B.1, chưa nối app; xem client-identity-lifecycle.md.

Cả hai POST dùng `Authorization: Bearer <browserSecret>`. DB chỉ lưu SHA256 domain-separated `nfc-browser-v1 + shop + scope + entry + secret` trong visit_sessions. Query rating còn kiểm tra source visit/session cùng context. Cùng browser token không cấp quyền shop/scope/entry tùy ý. Public API luôn live + direct:shop do server resolve; shop tra DB từ path. Tag/preview attribution tương lai cũng phải resolve server, hiện chưa có endpoint.

64hex kiểm tra không gian biểu diễn256bit, không thể chứng minh chuỗi client thực sự ngẫu nhiên. Client phải dùng CSPRNG, không Math.random. Đây là capability rating ẩn danh, không phải credential đăng nhập chủ. Browser secret dùng lâu hơn nên XSS cùng origin có thể đọc nó; lưu first-party giảm chia sẻ bên thứ ba nhưng không miễn nhiễm XSS. Không custom script/template HTML, tránh script bên thứ ba; trước pilot cần CSP/XSS test, redaction Authorization, HTTPS, rate limit và chính sách rotation/xóa. Không tự chốt retention production trong bước này.

Hiện chọn localStorage ở client như một phương án kỹ thuật, không phải vì Tài cấm cookie; HttpOnly cookie vẫn là phương án có thể đánh giá riêng. secret trong memory riêng tab an toàn hơn về thời gian tồn tại nhưng không đáp ứng chia sẻ reload/tab. Không fingerprint/IP. Secret bị lộ cho phép thay đổi rating các phiên hợp lệ của browser/context đó nếu có visitId; không đọc private owner data. Origin kiểm tra không ngăn bot giả header.

## Contract POST

| Route | Body allowlist | Response200 |
|---|---|---|
| `/api/v2/shops/<shop>/visits` | `{loadKey, navigationKind}` | `{visit:{id,sessionId,openedAt,navigationKind},session:{id,lastActivity,active},experience:null hoặc snapshot rating/revision/time}` |
| `/api/v2/shops/<shop>/visits/<visitId>/rating` | `{intentId,expectedRevision,score}` | `{outcome:applied/replayed,experience:{rating,revision,firstInteractionAt,updatedAt},receipt:{intentId,score,revision,firstInteractionAt,updatedAt}}` |

navigationKind chỉ nhận `load`, `reload`, `back_forward`, `resume`. Đây là metadata browser báo, không bằng chứng NFC hoặc quyền. Server cấp thời gian DB sau khi khóa nhóm; không nhận openedAt/receivedAt/sessionId/shopId/scope/entryKey/tagId trong body. Client không điều khiển cửa sổ15phút.

Mất response register: retry cùng browser secret + event key + nav; phần visit/time không đổi, session/experience là snapshot hiện tại. Key cùng context khác token/nav nhận409 VISIT_CONFLICT, không lộ visit. Retry cũ sau idle trả `session.active=false`, không tạo phiên/event và không gia hạn phiên. New open/resume với key mới chọn phiên theo idle<15phút; đúng15phút tạo phiên mới. Open không tạo experience.

Rating mới trên phiên đã idle>=15phút/đóng nhận409 SESSION_EXPIRED. Client đăng ký resume khi quay lại, rồi dùng snapshot revision của phiên mới; không tự gán page_visit cũ sang phiên mới. Nếu request cũ chưa rõ kết quả, retry intent+visit gốc trước: receipt đã áp dụng vẫn replay được sau hết hạn, không gia hạn phiên. Chỉ rating áp dụng thành công và open mới cập nhật last_activity. Replay/conflict không kéo dài hoạt động.

Lỗi:400 input/body,401 token/visit không được phép,403 origin,404 shop/disabled,409 revision/intent/visit conflict hoặc session expired,413 body>4096byte,415 JSON required,503 hạ tầng. Handler trả no-store ở mọi nhánh; không cookie/CORS, hash, secret, private shop/note/message hay chi tiếtSQL. Query string bị chặn. Origin phải khớp APP_ORIGIN cấu hình, không tự tin Host; Fetch-Metadata cross-site bị chặn nếu có.

## Gate và verification

Mặc định đóng. Runtime hiện hành3D chỉ cho NODE_ENV=development + NFC_VISITS_V2_ENABLED=true, cùng SERVER_DATA_ENABLED/DB/APP_ORIGIN cấu hình riêng. Chưa bật cấu hình thật;001, legacy UI/API và migration runner giữ nguyên. Không đọc `.env.local`/credential, không Neon/auth chủ/R2/dependency/commit/deploy.

Đã đạt13 API handler+PG test,15 repository test và24 contract test; typecheck/lint/diff đạt. Actual Request/Response handler mà Next routes delegate tới được thử với PostgreSQL thật18.4; chưa chạy qua Next HTTP/browser/hosting hoặc test browser storage. Bằng chứng và lệnh tại visit-rating-repository.md.

Tham chiếu: [OWASP session management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html), [Next.js Route Handlers](https://nextjs.org/docs/app/api-reference/file-conventions/route).

## Prompt client3B mới — đề xuất, chưa thực hiện

“Đọc decisions.md, visit-v2-api.md và visit-rating-repository.md. Chỉ nối client development theo foundation session15phút: browser secret32byte CSPRNG trong first-party storage, phối hợp khởi tạo nhiều tab; event key mới cho mỗi load/reload/back-forward/resume thật, giữ key/nav khi retry. Cùng browser+shop/scope/entry được server gom session, không để client chọn session/time/attribution. Không chấm=không tạo experience; rating dùng revision snapshot, xử lý conflict giữa tab và unknown outcome bằng replay intent+visit gốc. SESSION_EXPIRED yêu cầu đăng ký resume khi hoạt động lại, không làm sống lại session cũ hoặc tự chuyển intent chưa rõ kết quả sang phiên mới. Tránh ghi hai open do mount/pageshow/StrictMode; kiểm chứng BFCache/restore thực trên browser. Giữ Google invitation/VI-EN/pulse. Test Next+browser+PostgreSQL local riêng, không tự nạp env thật; kiểm tra storage lỗi/xóa, hai tab lần đầu, reload/restore trong và ngoài15phút, retry/mạng lỗi và5→2 dùng chung session. Không KPI tương tác khác, Neon/secrets thật/auth chủ/R2/dependency/production/commit. Kiểm chứng, checkpoint và dừng.”

##3C.3 — private-feedback development boundary

POST `/api/v2/shops/<shop>/visits/<visitId>/feedback`, Bearer browser capability như rating, body chỉ `{intentId,expectedRevision,topic,message}`. Server resolve shop/live/direct:shop/time. Route Node delegate cùng handler/runtime gate: mặc định đóng, NODE_ENV production không được bật. Không owner/dashboard API hoặc client wiring.

Handler kiểm tra envelope/UUID/revision/string types; Unicode/topic normalization và content limits dùng domain3C.1 qua repository, không copy logic. Body wire vẫn4096byte như endpoints hiện có: đây là giới hạn riêng trước normalization, có thể từ chối message Unicode nhiều byte dù <=2000codepoint. Không hứa mọi chuỗi2000codepoint đều qua HTTP; cần rà wire budget trước UI, không tự nâng limit ở lát này.

Response200: `{outcome:applied|replayed,experience:{rating,revision,firstInteractionAt,updatedAt},receipt:{intentId,revision,updatedAt}}`. Receipt phản ánh feedback intent gốc, experience là revision/rating hiện tại; không echo topic/message, private receipt snapshot hay owner data. Client phải giữ immutable original payload khi outcome unknown và kiểm tra receipt.intentId/revision; response không phải endpoint đọc lại góp ý. Public register/rating projection giữ nguyên whitelist, kể cả sau feedback/replay.

RATING_REQUIRED/REVISION_CONFLICT/INTENT_CONFLICT/SESSION_EXPIRED→409; context/capability sai→401 VISIT_NOT_AUTHORIZED; input/JSON sai400, origin403, body413, media415, service503. Error chỉ `{error:code}`, không echo nội dung/SQL. Same origin/Fetch-Metadata/query rejection/no-store như boundary hiện có. Không thay intent/session khi retry, không gửi Google.

Evidence3C.3:15API-handler+22repository tests=37 đạt trên PostgreSQL18.4 local riêng;2feedback tests chạy lại sau bổ sung malformed JSON/media/503 đạt. Typecheck/lint/diff đạt. Coverage save/replay/revision/rating interleave/no-rating/expiry/wrong capability-shop-visit/validation/oversize/origin/gate/public no-leak. Request/Response handler thật với PG; chưa Next HTTP/browser/client/production runtime integration. Cluster đã dừng; không env thật/Neon/dependency/commit/deploy. Đề xuất tiếp: chốt feedback wire budget và thiết kế client shared revision handling trước nối form; chưa thực hiện.

##3C.4A — wire budget hiện hành

Feedback body cap tăng riêng lên16384byte (16KiB), register/rating vẫn4096byte. Reader cộng Uint8Array.byteLength và reject khi vượt, giữ no-store/413/privacy.16KiB đủ cho2000Unicode codepoint nội dung đã chuẩn hóa với JSON.stringify UTF8 thông thường và envelope hiện có. Đây vẫn là cap toàn bộ raw JSON: whitespace dư, escaped representation phình lớn hoặc đầu vào trước normalization quá lớn vẫn có thể bị từ chối; không bỏ cap vì độ dài sau normalize.

7handler unit tests (không DB) đạt:16383/16384/16385 bytes, UTF8 byte vs JS length,2000emoji qua wire+domain validation độc lập, register/rating giữ4096. Pool sentinel cố ý trả503 sau envelope để chứng minh request đã qua wire, không giả làm success/persistence DB.20fetch adapter tests đạt; typecheck/lint/diff đạt. PGtest oversized fixture cập nhật17000bytes theo cap mới, không chạyPG/API integration trong lát này.

##3D — public page integration

Trang `/<shop>` dùng gate server chung với API, mặc định đóng và production luôn đóng. Client service/hook đã nối rating/private-feedback; NextHTTP+Chromium+PG local được kiểm chứng riêng. Evidence và giới hạn mới tại [public-v2-integration.md](public-v2-integration.md); các đoạn evidence trên là lịch sử theo lát.
