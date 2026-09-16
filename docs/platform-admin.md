# Lát 1a — nền danh tính admin — 2026-09-16

Thực hiện quyết định ở [commercial-model.md](commercial-model.md) mục 8. **Không sửa một file hiện có nào**; toàn bộ là file mới cộng một migration additive, nên gỡ ra không ảnh hưởng phần đang chạy.

Chưa có ở lát này: route HTTP, cookie, trang đăng nhập, UI, mạo danh. Đó là lát 1b.

## File

| Mới | Nội dung |
|---|---|
| `db/migrations/005_platform_admin.sql` | `platform_admins`, `admin_auth_sessions`, `admin_login_limits`, `admin_audit` + trigger bất biến; giữ chỗ slug `gov` |
| `db/rollback/005_platform_admin.sql` | từ chối khi đã có dữ liệu admin |
| `lib/admin/auth.ts` | `bootstrap` · `login` · `logout` · `access` · `authorizeAdmin` |
| `lib/admin/audit.ts` | `recordAdminAction`, chỉ thêm |
| `scripts/bootstrap-admin.mjs` | tạo admin đầu tiên |
| `repository-tests/admin-auth.spec.ts` | 8 case |

## Ba chỗ cố ý khác owner, và lý do

### Khoá advisory riêng

Owner login dùng `pg_try_advisory_xact_lock(hashtextextended('nfc-owner-login-v2',0))` để chỉ một KDF chạy mỗi lúc trên mỗi database. Admin dùng khoá **khác** (`nfc-admin-login-v1`).

Nếu dùng chung, một luồng đăng nhập owner dồn dập sẽ **khoá luôn đường vào của người vận hành** — đúng lúc sự cố cần xử lý. Đánh đổi: tối đa hai KDF chạy song song thay vì một, vẫn có trần.

### Bảng throttle riêng

`owner_login_limits` có bucket tên `'global'` dùng chung. Tái dùng bảng đó nghĩa là lượt đăng nhập owner ăn vào hạn mức của admin. `admin_login_limits` là bảng riêng, ngưỡng chặt hơn: **20 lần/phút toàn cục, 5 lần/username trong 15 phút** — lưu lượng đăng nhập admin hợp lệ chỉ vài lần mỗi ngày.

### Phiên 4 giờ

Owner là 8 giờ. Token admin mở được **mọi shop**, nên thời hạn tuyệt đối ngắn hơn. Không có sliding expiry, giống owner.

## Giữ nguyên từ owner

Cùng tham số KDF (scrypt N=131072, r=8, p=1, salt 16 byte, key 32 byte, maxmem 256MiB, scheme cố định và có version). Timing-safe compare. Tài khoản không tồn tại **vẫn chạy KDF** với material giả nên thời gian phản hồi không lộ tên nào có thật. Token CSPRNG 32 byte, DB chỉ lưu SHA256 với domain riêng `nfc-admin-session-v1`. Xoay phiên khi đăng nhập lại và thu hồi phiên cũ trong cùng transaction. Share lock khi kiểm quyền, kiểm lại hạn sau khi khoá.

`lib/admin/auth.ts` chỉ import `passwordKey` và `transaction` từ `lib/owner/auth.ts` để hai vai trò luôn cùng chi phí mật khẩu. **Mọi thứ quyết định quyền đều tách**: bảng, domain hash, bucket, khoá.

Mật khẩu admin tối thiểu **16 ký tự**, cao hơn mức 12 của owner.

## Audit

`admin_audit` chỉ thêm, có trigger `publishing_immutable()` chặn UPDATE và DELETE. Trường `on_behalf_of` phân biệt việc admin làm **thay mặt** chủ shop với việc chủ shop tự làm — thiếu nó thì một lần hỗ trợ sẽ lẫn vào lịch sử của chính chủ shop và tranh chấp sau không gỡ được. `detail` là jsonb giới hạn 4096 byte ở cả tầng code lẫn CHECK.

Viết audit **trong cùng transaction với hành động nó mô tả**, để không hành động nào thành công mà không để lại dấu.

## Nợ kỹ thuật đã biết: script nhân bản tham số KDF

`scripts/bootstrap-admin.mjs` lặp lại bốn tham số scrypt và chuỗi scheme, vì Node không import được module TypeScript của dự án — mã dùng constructor parameter property, thứ mà type stripping của Node từ chối.

Đây là rủi ro trôi lệch thật. Chặn bằng test `a password created by the bootstrap script opens a session through the library`: test chạy **chính script đó** rồi đăng nhập bằng thư viện. Đổi tham số một bên mà quên bên kia thì test đỏ ngay.

Script đọc mật khẩu từ stdin chứ không từ tham số dòng lệnh, nên nó không vào lịch sử shell hay danh sách tiến trình. Không có route đăng ký; **giữ được credential database chính là thẩm quyền**.

## Kiểm chứng — 2026-09-16, PostgreSQL 18.6 local

| Kiểm | Kết quả |
|---|---|
| `tsc --noEmit` | exit 0 |
| `eslint .` | exit 0 |
| `admin-auth.spec.ts` | **8 passed** |
| Toàn bộ repository suite | **61 passed**, exit 0, **chạy 3 lần liên tiếp** đều xanh |
| Migration qua `scripts/migrate.mjs` | áp đủ 001–005; chạy lại báo up to date; 28 bảng |
| Rollback khi có dữ liệu | `ADMIN_DATA_EXISTS`, 4 bảng và dữ liệu còn nguyên |
| Rollback khi sạch | xoá 4 bảng và ràng buộc `shops_gov_reserved` |

Chạy 3 lần vì lần đầu phát hiện một test **flaky**, xem mục dưới.

## Một test đã viết sai, ghi lại vì dễ lặp

Bản đầu kiểm cách ly throttle bằng cách gọi owner login 4 lần rồi khẳng định `owner_login_limits` có dòng. Nó **đúng vì lý do sai và hỏng khi chạy song song**: owner `login()` kiểm advisory lock **trước** khi ghi bucket, nên khi `owner-dashboard.spec.ts` chạy trên worker kia và đang giữ khoá đó, lượt login trả `null` ngay, vẫn ném `LOGIN_FAILED` để `rejects` pass, nhưng không ghi bucket nào.

Bản sửa tất định: so sánh trực tiếp hai giá trị `hashtextextended` để chứng minh khoá khác nhau, rồi **giữ đúng khoá admin** và khẳng định login admin bị chặn — đó mới là thứ xác định admin dùng khoá nào. Cố ý **không** giữ khoá owner: nó phạm vi toàn database nên sẽ làm hỏng spec owner đang chạy song song.

## Bước tiếp — lát 1b

Route HTTP `/api/admin/login|logout`, cookie `nfc_admin_v1` (HttpOnly, SameSite=Strict, Secure khi HTTPS), kiểm Origin + Sec-Fetch-Site như `ownerOrigin`, cổng runtime `nfcEnvDeclared() && NFC_ADMIN_ENABLED`, thêm tiền tố admin vào header bảo mật trong `next.config.ts`, và trang đăng nhập.
