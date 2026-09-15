# Browser hardening 3E — 2026-09-13

Phạm vi: kiểm chứng browser thật qua NextHTTP và PostgreSQL fixture local của3D; không thêm tính năng và không sửa production code vì chưa có test chứng minh lỗi sản phẩm.

## Evidence

Ma trận9case: **8 đạt,1 chưa kiểm chứng/skip do môi trường**. Các case đã đạt không chạy lại. Chỉ chạy lại2case cần chẩn đoán; không lặp pure/repository suite, typecheck/lint/build vì production code giữ nguyên3D.

| Ca | Kết quả |
| --- | --- |
| Hai tab mở đồng thời, storage trống |1browser hash/session; rapid5→2, feedback revision3 ở tab thứ hai; tab đầu stale bị conflict, refresh rồi fresh rating revision4; feedback giữ nguyên, response không echo text |
| Xóa storage |Document hiện tại giữ identity đã pin; reload tạo session khác, không nhận lại điểm cũ |
| Storage bị chặn thật |Chrome `--disable-local-storage`, probe setItem thất bại; memory fallback rate/update cùng document; reload tách session |
| Trước/sau idle15phút |Fixture backdate bằng `clock_timestamp()` của PostgreSQL:14m50s và15m10s. Assert chênh lệch opened_at/last_activity thực sự nằm dưới/trên900000ms; reload reuse rồi tạo session mới, không tạo experience khi chưa chấm |
| Lost response qua expiry/tab mới |Server đã commit rating, client mất2response; tab mới tạo session sau expiry. Retry original payload3lần giống nhau, chỉ1receipt/experience; không tự migrate intent |
| Back/forward/BFCache thật |Chrome bỏ default Playwright disable-BFCache.2pageshow persisted=true, isTrusted=true; visibility hidden/visible thật đi kèm, DB1session. Chuỗi event DB khớp từng pageshow: load,resume,resume,reload trong lượt đạt |
| Gate off/legacy |Không gọiv2, endpoint404; legacy vẫn hoạt động |
| Demo |Không gọi API/không ghi các bảng DB |
| Hide/show độc lập do chuyển tab/cửa sổ |Chưa kiểm chứng: desktop automation không phát hidden. Ghi rõ skip, không giả visibility hay phát event để tính đạt |

Back/forward ban đầu đếm cứng2event đã fail vì browser vừa restore BFCache vừa có reload riêng trong Nextdev. Timeline chứng minh từng navigation có thật; test được sửa thành đối chiếu event thực, không sửa code để bỏ event hợp lệ. `goForward` chờ `load` bị timeout trên BFCache; test chờ navigation `commit` rồi kiểm DOM/state. Không kết luận nguyên nhân reload thuộc app hay framework chỉ từ quan sát này.

Visibility độc lập đã thử foreground target, minimize/restore và same-window target; trạng thái vẫn visible, không có event. Các probe không cung cấp bằng chứng code sai. BFCache có hidden/visible thật được kiểm tra riêng; không suy rộng nó thành mobile background/kill hoặc chuyển tab độc lập.

Các output JSON tại test-results (ignored) lưu timeline `isTrusted`, `persisted`, navigation type, kinds DB và lý do visibility chưa kiểm chứng. Không ghi browser secret/Authorization hoặc dữ liệu thật.

## Safari/WebKit

Playwright WebKit runtime chưa có. Safari26.6.2 và safaridriver có sẵn; probe tạo session trả `session not created`: phải bật Allow remote automation trong Safari Settings. Không thay thiết lập, cài runtime hoặc test bằng profile cá nhân. Vì vậy **Safari/WebKit chưa kiểm chứng**. Apple mô tả [WebDriver automation windows được cách ly](https://developer.apple.com/documentation/webkit/about-webdriver-for-safari); chỉ thử khả năng tạo phiên này rồi dừng driver.

## Mốc foundation

Client/API đạt mốc development trong phạm vi Chromium đã kiểm chứng: registration, shared15m session/revision, rating/private feedback, immutable retry/conflict/expiry, browser identity và dữ liệu public không lộ góp ý. Chưa phải hoàn tất cross-browser hoặc đủ điều kiện pilot.

Trước pilot còn cần:

- Safari/iOS/WebKit và hide/show độc lập/background/kill thật; không bỏ qua vì BFCache đã đạt.
- Chốt giới hạn memory-only/reload/offline mất draft/unknown intent; không hứa durable delivery.
- Rà bảo vệ vận hành trước khi bật thật: owner authorization/tenant isolation cho dashboard, abuse/rate limit, HTTPS/CSP, retention/rotation và quan sát lỗi. Các phần này chưa được triển khai trong3E.

Không redesign/tag/dashboard/editor/auth/R2/Neon/env thật/deploy/dependency/commit. Harness dùng source allowlist+env local, schema tạm. Checkpoint ở decisions.md là điểm dừng; không tự tiến sang sản phẩm tiếp.

Dọn cuối lượt:0schema nfc_ui_test còn lại; Next/PostgreSQL/Safari driver đã dừng, symlink dependency worktree đã tháo. Chỉ giữ test/source/docs và evidence test ignored.

Prompt kế tiếp đề xuất: “Đọc decisions.md và browser-hardening-3e.md. Chốt việc cần hoàn thành trước pilot, đặc biệt Safari/iOS và visibility/background độc lập, cùng giới hạn memory-only. Không lặp nền Chromium đã đạt; chưa triển khai tag/dashboard cho tới khi giao phạm vi cụ thể.”
