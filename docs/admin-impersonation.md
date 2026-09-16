# Lát mạo danh — admin xem dashboard thay mặt chủ shop — 2026-09-16

Thực hiện mục 8 của [commercial-model.md](commercial-model.md), phần **đọc dữ liệu dashboard**. Quyền **sửa cấu hình hộ** chưa làm vì chưa có editor để sửa; nó đi cùng lát editor (Tài duyệt a).

## Tài đã chốt

- **Phiên mạo danh chỉ đọc** (b). `owner_feedback_cases.actor_id` bắt buộc trỏ một chủ shop; nếu admin được sửa, sổ sẽ ghi là chủ shop tự sửa.
- **Lý do bắt buộc, chủ shop đọc nguyên văn** (c), dài 10–200 ký tự, không ký tự điều khiển.
- Bốn yêu cầu bổ sung: export phải bị **chặn ở server** với phạm vi `overview`; chặn ghi **trong tầng authorize**; **tái dùng cổng owner**, không viết đường song song; **mỗi admin chỉ một phiên sống**. Ghi sổ **theo request**, export ghi **một dòng kèm số lượng**.

## Cách hoạt động

| | Chủ shop | Mạo danh `overview` | Mạo danh `feedback` |
|---|---|---|---|
| Số liệu, danh sách phiên | được | được, **server xoá** `topic`/`message`/`note` | được |
| Tải dữ liệu (mọi loại, kể cả từ điển) | được | **403 `IMPERSONATION_SCOPE`** | được |
| Đổi trạng thái / ghi chú góp ý | được | **403 `IMPERSONATION_READ_ONLY`** | **403 `IMPERSONATION_READ_ONLY`** |

`authorize(db, credential, slug, need)` nhận thêm **loại việc bắt buộc** (`overview` · `feedback` · `export` · `write`). Không route nào quên hỏi được, vì thiếu tham số thì không qua được typecheck.

**Một cổng chung.** `ownerShop()` kiểm identity active + membership active + `publishing_state='active'`. Nhánh chủ shop và nhánh mạo danh đều đi qua đúng hàm đó. Nhánh mạo danh kiểm thêm: phiên chưa kết thúc và chưa quá hạn; phiên admin đã mở nó còn sống; admin còn active. **Admin đăng xuất là mọi phiên mạo danh chết theo.** Phiên nêu đích danh một shop: dùng token ở shop khác thì 403.

**Thời hạn.** 30 phút, không gia hạn, và không vượt quá hạn của phiên admin. Database có CHECK `expires_at <= created_at + 30 phút`.

**Một phiên sống mỗi admin.** Unique index một phần trên `admin_id WHERE ended_at IS NULL`. Mở phiên mới thì phiên cũ đóng với `superseded` (hoặc `expired` nếu đã quá hạn) trong cùng transaction. Hai lần mở đồng thời được xếp hàng bằng advisory lock theo admin, nên không có lần nào rơi vào lỗi ràng buộc.

**Không sửa được.** Trigger chỉ cho đóng một lần (`ended_at`, `end_reason`), cấm mọi thay đổi khác và cấm xoá. Lý do mà chủ shop đọc không thể bị sửa sau.

**Cookie `nfc_impersonation_v1`.** Hai bản cho đúng hai đường `/ZZZ/<slug>` và `/api/owner/v2/<slug>`, HttpOnly, SameSite=Strict, hết hạn cùng phiên. Không đi kèm trang khách hay shop khác. Nếu trình duyệt có cả cookie chủ shop lẫn cookie mạo danh, **cookie mạo danh thắng** vì hẹp quyền hơn.

**Ghi sổ** vào `admin_audit`, luôn có `on_behalf_of`, và `detail.session` trỏ về phiên:

| action | Khi nào | detail |
|---|---|---|
| `impersonation.start` | mở phiên | scope, reason, expiresAt |
| `impersonation.read` | **mỗi GET dashboard** (không phải mỗi dòng) | scope, rows, feedbackShown |
| `impersonation.export` | **mỗi file**, ghi **trước** byte đầu tiên | scope, dataset, format, rows |
| `impersonation.end` | kết thúc / bị thay / hết hạn | endReason |

Số dòng export được đếm **trong cùng snapshot REPEATABLE READ** với cursor, nên khớp đúng số dòng của một file tải trọn vẹn. Tải dở vẫn còn trong sổ. Mỗi chunk kiểm lại quyền, nên phiên kết thúc giữa chừng thì stream bị cắt. Từ điển dữ liệu không ghi sổ vì không chứa dữ liệu, nhưng vẫn bị chặn với `overview`.

**Chủ shop nhìn thấy.** Dashboard có mục "Lượt truy cập của quản trị": 20 phiên gần nhất, gồm admin, thời điểm, phạm vi, lý do nguyên văn, số lần xem, số lần tải và số dòng đã tải. Mọi thành viên của shop đều thấy. Chủ shop xem mục này không sinh dòng sổ nào.

## File

| File | Việc |
|---|---|
| `db/migrations/007_admin_impersonation.sql` + rollback | bảng, unique index một phiên sống, trigger bất biến. Rollback từ chối khi có dữ liệu |
| `lib/owner/auth.ts` | `ownerShop()` dùng chung; `OwnerCredential`, `OwnerNeed`; nhánh mạo danh |
| `lib/admin/impersonation.ts` (mới) | `start` · `endByToken` · `endForAdmin` · kiểm lý do |
| `lib/owner/dashboard.ts` | `read`: xoá nội dung khi `overview`, ghi sổ, trả `viewer` và `adminVisits`; `update`: loại việc `write` |
| `lib/owner/export.ts` | loại việc `export`, đếm và ghi sổ, khoá chống export song song tính theo người thực hiện |
| `server/owner-v2.ts` | `ownerCredential()`, `setImpersonationCookies()`; `ownerFailure` ghi log nguyên nhân |
| `app/gov/api/impersonations/route.ts` (mới) | POST mở, DELETE kết thúc |
| `app/api/owner/v2/[shop]/impersonation/route.ts` (mới) | DELETE từ dải banner |
| `app/ZZZ/[shop]/page.tsx`, `components/owner-dashboard-v2.tsx` + CSS | banner, ẩn nút ghi và mục tải dữ liệu, mục lượt truy cập của quản trị |
| `components/admin-shops.tsx` | nút "Mạo danh", form chọn phạm vi và nhập lý do, nút kết thúc phiên |
| `repository-tests/impersonation.spec.ts` (mới) | 6 case |
| `integration-tests/admin-http.spec.ts` | 1 case HTTP đầy đủ; production gate phủ thêm hai route mới |
| `integration-tests/run-local.mjs`, `repository-tests/owner-dashboard.spec.ts` | thêm 005–007 vào danh sách migration, vì dashboard giờ đọc bảng phiên |

## Hai lỗi trong lát này

**Cookie hai đường, chỉ một bản tới trình duyệt — lỗi code của tôi.** Bản đầu gọi `response.cookies.set` hai lần cùng tên với hai `path`. `ResponseCookies` của Next **lưu theo tên**, nên lần sau ghi đè lần trước và chỉ đường API nhận được cookie. Dashboard không thấy cookie nên đẩy admin về form đăng nhập owner. Repository test không bắt được vì nó không đi qua HTTP; test tích hợp bắt được ngay. Đã sửa bằng `setImpersonationCookies()`, tự ghi từng header `Set-Cookie`. Đã tái hiện riêng: hai lần `set` chỉ ra một header.

**Test viết sai.** Test hết hạn phiên admin chỉ lùi `expires_at` nên vi phạm CHECK `expires_at > created_at`; phải lùi cả `created_at`, như test owner đã làm.

## Kiểm test có cắn không

Gỡ từng lớp chặn rồi chạy `impersonation.spec.ts`. Lần nào cũng đỏ, sau đó mã được khôi phục và kiểm bằng `cmp`:

| Gỡ | Kết quả |
|---|---|
| chặn ghi trong `authorize` | 2 failed |
| chặn phạm vi `feedback`/`export` | 1 failed |
| `publishing_state='active'` trong cổng chung | 1 failed |
| xoá nội dung ở `overview` | 2 failed |
| ghi sổ export | 1 failed |

## Kiểm chứng — 2026-09-16, PostgreSQL 18.6 local

| Lệnh | Kết quả |
|---|---|
| `node node_modules/typescript/bin/tsc --noEmit` | exit 0 |
| `node node_modules/eslint/bin/eslint.js .` | exit 0 |
| repository suite (`--config=playwright.repository.config.ts`) | **79 passed**, exit 0 (trước lát: 73) |
| `run-local.mjs --admin admin-http.spec.ts --build` | **4 passed** + production gate **2 passed**, exit 0 |
| `run-local.mjs --owner owner-dashboard.spec.ts --build` | **3 passed** + **2 passed**, exit 0 |
| `run-local.mjs --publishing publishing.spec.ts --build` | **4 passed** + **2 passed**, exit 0 |
| `run-local.mjs public-v2.spec.ts browser-hardening.spec.ts --build` | **15 passed, 1 skipped** + **2 passed**, exit 0 |
| `scripts/migrate.mjs` trên database trống | áp 001–007, chạy lại báo up to date, 30 bảng |
| rollback 007 khi bảng trống | xoá bảng và hàm trigger |

Test bị skip là `3E foreground visibility`, đã có `test.skip(true, …)` từ trước, không phải hồi quy.

## Còn lại

- Cookie mạo danh của một phiên bị **thay** (mở phiên mới cho shop khác) vẫn nằm trên đường của shop cũ cho tới khi hết hạn (≤30 phút). Nó không mở được gì (401 `IMPERSONATION_ENDED`), nhưng nếu admin cũng là chủ shop cũ thì phải bấm kết thúc hoặc chờ hết hạn mới thấy dashboard của mình.
- Chưa có quyền sửa cấu hình hộ (chờ editor).
- `app/gov/api/setup-links/route.ts` ghi sổ **ngoài** transaction phát link và không kiểm `shopId` khớp với chủ shop. Nằm ngoài lát này; đã sửa sau đó, xem `decisions.md` mục "Phát lại liên kết".
