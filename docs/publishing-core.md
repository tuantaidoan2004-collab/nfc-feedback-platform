# Publishing Core — development local, 2026-09-14

Một lát draft/release resolver + tag + preview xuyên suốt. Chưa production/editor/auth quản trị thật. Đọc cùng platform-lifecycle.md, visit-v2-api.md, public-v2-integration.md.

## Contract đã triển khai

Migration additive003, không sửa/backfill001/002. Template version/release snapshot bất biến. Draft CAS; publish khóa shop/draft, validate, tạo release + đổi pointer + tăng draft revision cùng transaction. Publish cạnh tranh cùng revision chỉ một thành công. Rollback CAS đổi pointer, không sửa lịch sử. Shop draft/active/suspended; active cần release cùng shop.

PublishingAdmin là boundary nội bộ bắt buộc callback authorization và actor, chưa có administrative HTTP endpoint. Callback fixture không phải auth thật. Template metadata version1/schema1/renderer1 cố định. Public client không được publish/đổi state.

`/<shop>` và `/t/<code>` resolve active release cùng renderer, không redirect hay clone project. Slug không phân biệt hoa thường; public code phân biệt hoa thường,8–64 ký tự. `/preview` dành riêng; migration từ chối nếu shop cũ trùng tên, không tự đổi/xóa shop. Tag identity/code/shop bất biến; prepared → tested → active → disabled, disabled kết thúc. Tested cần receipt preview đúng shop/tag; active cần shop active. Bằng chứng test này chưa chứng nhận mọi media/config/thiết bị thật.

GET chỉ đọc; client open mới tạo event. Retry loadKey không thêm event. Không suy ra NFC tap/unique customer.

## Attribution và session15phút

Release không nằm trong session grouping: browser + shop/scope/entry, idle15phút giữ nguyên. GET R1 → publish R2 → POST open vẫn pin R1. Load mới nhận R2 nhưng có thể cùng session/revision/experience.

- published_visit_contexts: release/tag/preview/scope/entry mỗi visit bất biến, FK ghép cùng shop/session/visit.
- session_initial_contexts: visit đầu session.
- experience_origin_contexts: visit có rating đầu, có thể khác release của open đầu.
- Receipt giữ source visit; join context cho release từng rating/feedback. Aggregate cuối không đại diện nguồn của mọi event.

Lịch sử cũ không được gán release giả; origin có thể chưa biết. Trigger bảo vệ template/release/preview/context/receipt khỏi UPDATE/DELETE. Retention tương lai cần thiết kế riêng.

## Proof, capability và API

Server ký HMAC-SHA256 canonical `{v,shopId,releaseId,tagId,previewId,scope,entryKey}` lúc render, client gửi X-NFC-Render. Đây là attribution công khai, không phải quyền owner/browser identity/preview capability. Không URL/log proof; không nhận bare context claims từ body. Document service không đổi binding giữa chừng. Browser Bearer CSPRNG, wire allowlist, revision/retry/expiry giữ foundation.

Write trong transaction kiểm tra shop/tag/capability/preview expiry, lấy DB time sau khóa. Publish giữ tab R1; suspend/disable chặn cả tab cũ và retry receipt, không xóa dữ liệu đã ghi.

Preview snapshot draft revision hoặc release; token CSPRNG32byte chỉ lưu hash SHA256 có domain separator trong DB. TTL900giây mặc định, tối đa3600. Internal caller nhận raw token để chuyển ngoài URL, chưa UI cấp token. POST `/preview/exchange` cùng origin/body chỉ token, trả204 không echo và đặt cookie HttpOnly/SameSiteStrict/Secure khi HTTPS. `/preview` đọc cookie server, noindex/nofollow; API preview dùng credentials same-origin. Live omit cookies. Cookie là lựa chọn kỹ thuật, Tài không cấm cookie.

Preview dùng bảng foundation chung, scope=test và entry preview riêng, browser hash phân miền/FK ghép; **không dùng bảng/schema test riêng trong lát này**. Đây là lựa chọn thay đề xuất cũ, không lọc ở frontend. Dashboard/export sau này phải membership + scope server-side; không đếm toàn bảng thành khách thật. Chưa dashboardv2.

POST `/api/v2/pages/visits`, `/<visitId>/rating`, `/<visitId>/feedback` dùng body/response v2 và proof header. Lỗi403 xác định: INVALID_RENDER_PROOF, RENDER_CONTEXT_MISMATCH, PAGE_UNAVAILABLE, TAG_UNAVAILABLE, PREVIEW_UNAVAILABLE, PREVIEW_EXPIRED. Không echo private feedback. Khi publishing bật, legacy shop-v2/experience writes đóng để tránh bypass; off và /t/demo giữ legacy.

Gate: NODE_ENV=development + NFC_VISITS_V2_ENABLED=true + NFC_PUBLISHING_ENABLED=true. Signing key server-only NFC_RENDER_SIGNING_KEY ít nhất32byte, test tự sinh fixture, không đọc env thật. Live proof không TTL vì không phải capability; state kiểm tra mỗi write. Primitive hỗ trợ retained keys, runtime hiện một key v1; rotation vận hành chưa triển khai. Route dynamic, chưa cache pointer/CDN.

## Config và renderer

Schema1 allowlist full-bleed, name, poster image/video reference, logo, solid/gradient/media background, watermark YOUR LOGO/diagonal-linear, question VI/EN, Google URL, tối đa6 links. URL HTTPS không userinfo; text có giới hạn, không HTML/JS/CSS/rating-gating. Chưa R2/media registry/upload/kiểm tra quyền asset.

Renderer nối name/poster/question/Google và nhận full config; giữ UI/CSS, Google giống nhau mọi sao, VIEN/pulse. **Full-bleed là config mặc định; chưa dựng visual mới cho background/logo/watermark/custom links**, card chưa hỗ trợ. Không coi schema/capability là hiệu ứng đã hiển thị.

## Verification

- 2 pure contract: allowlist, proof tamper/canonical/retained keys.
- 8 PostgreSQL18.4 local: auth boundary, CAS/concurrent publish, rollback, immutability, cross-shop FK, render/publish race, nguồn open khác rating, preview isolation/capability/expiry, tag lifecycle/suspend, reserved route và rollback003.
- 4 Next HTTP + Chrome + PG: GETR1/publishR2/POSTopen; reload/session/revision3/no-leak/Google/VIEN/pulse; preview cookie/test scope; tag disable tab cũ; proof tamper/legacy bypass/origin/suspend; gate off/demo.
- 33 focused client transport/service tests, thêm binding document/cookie/proof header. Không lặp coordinator/browser foundation không đổi.
- TypeScript/ESLint/diff, build+standalone preparation và production gate. Kết quả lần cuối ghi trong decisions.md.

Harness: `node integration-tests/run-local.mjs --publishing publishing.spec.ts --build`. Source copy allowlist/env fixture/schema ngẫu nhiên local, không read/copy .env*. Cleanup schema/temp/process. Dependencies có sẵn, không cài mới. Rollback003 chạy trong transaction, từ chối khi có publishing data/pointer.

Chưa Safari/iPhone cho Publishing Core, auth thật, rate-limit chung, retention/backup, R2/editor/owner dashboard/export, HTTPS/mobile lifecycle/durable delivery, cache/load testing. Proof không chống người dùng tạo nhiều browser identities. Chưa pilot-ready. Không Neon/env thật/deploy/dependency mới/commit.

## Prompt kế tiếp đề xuất, chưa thực hiện

Đọc decisions.md và publishing-core.md, rà diff Publishing Core. Giữ foundation dirty/session15phút/attribution/Google/VIEN/pulse. Chốt lát kế với task điều phối: auth + dashboard chủ v2 có membership/scope server-side hoặc renderer showcase nếu Tài ưu tiên. Không tự mở editor/R2/deploy; không coi callback fixture là auth. Chỉ regression boundary thay đổi.
