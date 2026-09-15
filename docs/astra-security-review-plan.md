# Kế hoạch dùng Astra rà bảo mật NFC

2026-09-15 — kế hoạch bàn giao, chưa chạy audit và chưa tạo task/lịch nền. Tài chủ động mở phiên Astra ở các mốc dưới đây. Không model nào bảo đảm hệ thống không bị hack; yêu cầu bằng chứng và kiểm tra hồi quy thay vì lời khẳng định an toàn.

## Các mốc

| Khi nào | Astra rà gì | Điều kiện qua mốc |
|---|---|---|
| Trước mở rộng quyền admin | Auth/membership/session/throttle/export hiện có; đường đi dữ liệu private; baseline độc lập | Finding có file/line, đường khai thác local, mức ảnh hưởng; lỗi nghiêm trọng được sửa và test chứng minh |
| Sau editor + duplicate shop local | Owner không thành admin; mass assignment/IDOR, CAS publish/rollback, preview expiry, copy không mang auth/khách hàng/test thành live | Tests hai owner/hai shop/admin, forged IDs/roles, concurrent writes; không chỉ kiểm nút ẩn |
| Sau media/upload boundary, trước R2 thật | Quyền asset theo tenant, signed upload TTL/key/size, MIME và file signature, SVG/HTML/script, filename/path traversal, SSRF nếu fetch URL, asset references/retire, abuse chi phí | Fixture mô phỏng invalid file/URL/cross-tenant/oversize; chưa dùng bucket/key thật khi không được cấp |
| Trước pilot | Login/recovery/session revocation/HTTPS cookies/CSRF/XSS/SQLi; headers/cache/BFCache; CSV injection; preview/private leaks; DoS/throttle/export backpressure/DB pool; dependency audit; retention/backup/restore/log redaction/budget | Không còn Critical/High đã xác nhận; các rủi ro còn lại có owner và quyết định. Test restore và giới hạn vận hành có evidence; Tài quyết định go/no-go |
| Sau pilot hoặc thay đổi nhạy cảm | Diff mới + lỗi/phát hiện thực tế, auth/upload/export/schema/provider đổi | Regression phù hợp, kiểm môi trường được phép; không tự quét hệ thống công khai |

Không đợi hoàn thiện mọi UI mới rà auth. Antigravity thực hiện lát, dừng và ghi báo cáo; Astra rà snapshot đó khi không có writer khác. Nếu cần sửa, giao rõ một writer; sau sửa Astra kiểm lại finding/test. Audit độc lập giảm điểm mù, không phải chứng nhận.

## Gói đưa cho Astra

- Thư mục nguồn chính hiện tại, branch/HEAD và git status; chỉ rõ dirty/untracked là một phần của snapshot.
- START-HERE-ANTIGRAVITY.md, AGENTS.md, decisions.md, contract của module vừa đổi.
- Diff từ mốc bàn giao: đủ file mới, migration, dependency/lockfile nếu được phép thay; không chỉ git diff mặc định.
- Báo cáo Antigravity: file/behavior thay đổi, test đã chạy (và chưa chạy), output tóm tắt, rủi ro, cách tái hiện bằng fixture.
- Phạm vi được phép: local/test DB nào, không credential thật. Credential từng lộ trong chat cần thay trước đưa production vào hoạt động; không đưa giá trị đó vào gói review.

## Prompt Astra dùng lại

Bạn rà bảo mật dự án NFC tại thư mục nguồn do Tài chỉ định. Đọc START-HERE-ANTIGRAVITY.md, AGENTS.md, docs/decisions.md, docs/publishing-core.md, docs/owner-dashboard-v2.md và báo cáo thay đổi Antigravity mới nhất. Xác minh cwd, HEAD, dirty/untracked và mốc bàn giao trước khi kết luận.

Lượt này review read-only source; được viết báo cáo và test tái hiện bằng fixture local trong phạm vi Tài cấp. Chưa sửa production code, commit, cài dependency, đọc .env/secrets, gọi Neon/R2 thật, deploy hay quét endpoint bên ngoài. Nếu cần quyền khác, nêu chính xác hành động và lý do.

Lập threat model từ luồng thực tế và rà tất cả đường server nhận input/trả private data, không chỉ đường UI bình thường. Ưu tiên auth/session/membership/admin-owner isolation, tenant/scope boundaries, publish/preview, upload/asset nếu có, export/privacy/cache và DoS. Không coi comment, test pass hoặc việc ẩn nút là chứng minh authorization. Tái dùng evidence trước cho boundary không đổi; chạy test khi xác minh finding cần thiết.

Mỗi finding: severity, file/line, điều kiện, bước tái hiện local tối thiểu, expected/actual, tác động, sửa tối thiểu và regression cần có. Phân biệt confirmed, suspected và untested; không thổi phồng hoặc coi không tìm thấy lỗi là an toàn tuyệt đối. Không đưa secrets/private payload thật vào báo cáo. Đánh giá cả giới hạn lifecycle/browser, pool/resource cleanup và abuse chi phí.

Kết quả: docs/security-review-YYYY-MM-DD.md với scope/snapshot, findings, evidence, khoảng trống và go/no-go có điều kiện. Gửi bản tóm tắt ngắn cho Tài, đề xuất lượt sửa rõ phạm vi rồi dừng; không tự nối sang triển khai.
