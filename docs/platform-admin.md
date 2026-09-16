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

---

# Lát 1b — tầng HTTP của admin — 2026-09-16

## File

| Mới | |
|---|---|
| `server/admin.ts` | cổng runtime, cookie, kiểm origin, đọc body, helper JSON |
| `app/gov/api/login/route.ts`, `app/gov/api/logout/route.ts` | API |
| `app/gov/login/page.tsx`, `app/gov/page.tsx` | trang đăng nhập và vỏ admin |
| `components/admin-login.tsx`, `components/admin-sign-out.tsx`, `components/admin.module.css` | UI |
| `integration-tests/admin-http.spec.ts` | 3 case (1 chạy ở pha production) |

| Sửa | |
|---|---|
| `next.config.ts` | thêm `/gov` và `/gov/:path*` vào nhóm header riêng tư |
| `.env.example` | `NFC_ADMIN_ENABLED` |
| `integration-tests/run-local.mjs` | cờ `--admin`: áp migration 005, bật `NFC_ADMIN_ENABLED` |

## API nằm dưới `/gov`, không phải `/api/admin`

Lệch quy ước của owner một cách có chủ ý. Cookie chỉ nhận **một** path; đặt cả trang lẫn API dưới `/gov` cho phép `path:'/gov'`, nên **credential mở được mọi shop không bao giờ đi kèm request vào trang khách**. Owner cookie hiện vẫn `path:'/'` (`app/api/owner/v2/login/route.ts:9`); thu hẹp nó là thay đổi trên route đã kiểm thử, không thuộc lát này.

Test khẳng định trực tiếp điều này: sau khi đăng nhập, cookie có `path='/gov'`, `httpOnly`, `sameSite='Strict'`; rồi điều hướng sang `/one` và kiểm **header `cookie` của request điều hướng không chứa `nfc_admin_v1`**.

Phụ thêm: một tiền tố `/gov/:path*` phủ cả trang lẫn API trong `next.config.ts`, không phải khai báo hai nhóm.

## Không có tham số chuyển hướng

Owner login nhận `next` nên cần `safeDestination()` chặn open-redirect. Admin luôn về `/gov` cố định, nên **không có bề mặt đó**. Route từ chối mọi khoá ngoài `username` và `password` — gửi kèm `next` sẽ bị `INVALID_INPUT`, và test khẳng định điều đó.

## Tái dùng thay vì chép

`adminOrigin` và `adminInput` gọi thẳng `ownerOrigin`/`ownerInput` rồi **dịch kiểu lỗi** sang `AdminError`. Một bộ đọc body đã được làm chặt, sửa ở một chỗ; route admin vẫn không bao giờ trả mã lỗi của owner. Cùng lý do với việc dùng chung `passwordKey`: chia sẻ phần cơ học, tách hoàn toàn phần quyết định quyền.

## `/gov` khi phiên hỏng so với khi database hỏng

Phiên bị từ chối → chuyển về `/gov/login`. Database lỗi → hiện trang "Dịch vụ đang gián đoạn". Nếu gộp hai nhánh, một sự cố database sẽ đẩy người dùng vào vòng lặp giữa hai trang.

## Kiểm chứng — 2026-09-16, sau khi sửa `next.config.ts` và harness

| Bộ | Kết quả |
|---|---|
| contracts | 60 passed |
| client (Chrome thật) | 73 passed |
| repository | 61 passed |
| public-v2 + browser-hardening | 15 passed, 1 skipped + 2 production gate |
| publishing | 4 passed + 2 |
| owner dashboard | 3 passed + 2 |
| **admin HTTP** | **2 passed + 2** |

Tất cả exit 0. Pha production gate giờ là **2** ở mọi lượt `--build` vì test admin chạy cùng test cũ: nó chỉ khẳng định HTTP 404 nên không cần migration 005, tức admin đóng kể cả ở lượt chạy không bật cờ admin.

## Một test viết sai, đã sửa

Bản đầu dùng `page.getByRole('alert')` và vi phạm strict mode: Next tự render `__next-route-announcer__` với `role="alert"` trên mọi trang. Thu hẹp thành `getByRole('main').getByRole('alert')`.

## Chạy

```
node integration-tests/run-local.mjs --admin admin-http.spec.ts --build
```

`--admin` kéo theo `--owner` và publishing, vì `admin_audit` tham chiếu `owner_identities_v2`. Như các lệnh khác, **chạy riêng**, không gộp với spec khác.

Tạo admin đầu tiên:

```
DATABASE_URL='…' node scripts/bootstrap-admin.mjs <username>
```

## Chưa có

Mạo danh (hai quyền tách theo `commercial-model.md` mục 8), bảng danh sách shop, nút Generate, thanh toán. Vỏ `/gov` hiện chỉ hiện tên người đăng nhập và nút đăng xuất — đó là chỗ cho bảng admin ở lát 5.

## Bật trên preview — 2026-09-16

- `NFC_ADMIN_ENABLED=true` cho môi trường Preview (phạm vi Preview, không gắn branch).
- Migration 005 đã áp lên Neon branch `preview/feat/local-app-foundation` (host `ep-bold-moon-azqi1spp`): `Applied 005_platform_admin.`, chạy lại báo up-to-date, đủ 4 bảng, 0 admin.
- Sau khi Tài reset mật khẩu `neondb_owner`, tích hợp Neon–Vercel tự xoay chuỗi: preview vẫn nối DB được, `/caphe-demo` trả 200 với dữ liệu thật.

### Hai điều về vận hành Vercel, dễ mất thời gian nếu không biết

**`vercel env pull` cần `--git-branch`.** Chuỗi Neon do tích hợp quản lý được gắn phạm vi `Preview (feat/local-app-foundation)`, nên `vercel env pull --environment=preview` **không** trả về nó. Thêm `--git-branch=feat/local-app-foundation` thì lấy được. Nhờ vậy chạy migration lên preview không cần ai dán chuỗi kết nối vào đâu cả: Vercel → file cục bộ → biến môi trường → `migrate.mjs`, rồi xoá file.

**`vercel deploy` từ CLI không di chuyển alias theo branch.** Chỉ deployment do Git kích hoạt mới cập nhật `…-git-<branch>-….vercel.app`. Bản deploy bằng CLI chạy đúng khi gọi thẳng URL của nó, nhưng alias vẫn trỏ bản cũ — và vì `APP_ORIGIN` đặt theo alias, đăng nhập qua URL deployment sẽ bị chặn origin. Đổi biến môi trường xong thì **push một commit** để Git deploy, đừng dùng `vercel deploy`.

## Xoay mật khẩu database thì phải deploy lại

Sau khi Tài reset mật khẩu `neondb_owner` trong Neon, mọi đường chạm database trên preview bắt đầu trả 503 và trang khách chuyển sang "Trang chưa sẵn sàng". Log runtime cho lý do thật:

```
ADMIN_UNEXPECTED error: password authentication failed for user 'neondb_owner'
```

Nghịch lý làm rõ cơ chế: `vercel env pull` lấy về chuỗi **mới** và chuỗi đó xác thực thành công từ máy local, trong khi deployment đang phục vụ vẫn hỏng. **Vercel chụp ảnh biến môi trường tại thời điểm tạo deployment**; tích hợp Neon cập nhật cấu hình project, nhưng bản đang chạy giữ ảnh chụp cũ. Đổi biến không có hiệu lực cho tới khi có deployment mới — và vì `vercel deploy` không di chuyển alias theo branch, cách đúng là **push một commit**.

Ghi lại vì nó sẽ lặp: **mỗi lần xoay credential database, phải deploy lại**, nếu không sẽ thấy một hệ thống "tự dưng hỏng" mà mọi kiểm tra thủ công đều báo bình thường.

Dòng log này chính là thứ commit "Record why an administrative request failed unexpectedly" thêm vào. Không có nó thì chỉ thấy `SERVICE_UNAVAILABLE` và không có gì để lần.

## Về chi phí 1,9 giây của scrypt

Đo trên preview khi hệ thống chạy đúng: POST bị chặn origin 0,41s · GET có database 0,66s · POST login 2,54s. Phần chênh ~1,9s là `scrypt`.

**Đây không phải lỗi hiệu năng cần sửa.** `N=131072, r=8, p=1` đúng bằng mức OWASP khuyến nghị cho scrypt; nó **cố tình đắt** để kẻ tấn công không dò được hàng loạt. Máy local nhanh hơn ~10 lần chỉ vì Apple Silicon mạnh hơn CPU chia sẻ của serverless, không phải vì nền tảng kém. Giảm tham số là hạ mức bảo vệ mật khẩu xuống dưới khuyến nghị, và còn phải bump `password_scheme` rồi băm lại toàn bộ.

Với một thao tác vài lần mỗi ngày, 1,9s là cái giá đúng. Điều đáng ghi nhận để bàn sau: `login()` **giữ một kết nối database và một transaction suốt thời gian chạy scrypt** — trên local 0,2s nên không ai thấy, trên serverless là 2 giây giữ chỗ trong pool chỉ để tính CPU.
