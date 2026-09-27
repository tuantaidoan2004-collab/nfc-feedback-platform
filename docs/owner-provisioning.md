# Lát 2 — địa chỉ liên hệ và link thiết lập một lần — 2026-09-16

Thực hiện hai thứ [commercial-model.md](commercial-model.md) đòi mà hệ thống chưa có: chỗ liên hệ chủ shop (chính sách xoá dữ liệu hứa gửi bản ghi trước khi xoá), và cách tạo tài khoản **mà Tài không bao giờ biết mật khẩu của khách**.

Tài chốt: **link sống 48 giờ**, **email bắt buộc** với tài khoản tạo từ nay.

## Không sửa `lib/owner/auth.ts`

Kế hoạch ban đầu là thêm email vào `bootstrap()`. Bỏ, vì đổi chữ ký hàm đó là đụng vào đường đăng nhập đã có test. Thay bằng `provision()` ở module mới.

Tài khoản tạo ra mang **mật khẩu không dùng được**: `password_key` là 32 byte ngẫu nhiên, **không dẫn xuất từ chuỗi nào**, nên không input nào khớp và tài khoản đóng cho tới khi khách tự đặt mật khẩu qua link. Đây là cách Django và nhiều framework khác làm. Hệ quả quan trọng: Tài **chưa từng cầm** mật khẩu của shop, nên ngày có tranh chấp "ai vào tài khoản tôi" thì không ai nghi ngờ được.

`lib/owner/auth.ts` không bị sửa một dòng nào.

## Template chuẩn đã theo

- Token CSPRNG 32 byte; DB **chỉ lưu SHA256** với domain riêng `nfc-owner-setup-v1`, tách khỏi domain phiên nên không thể đem token này dùng như session và ngược lại.
- **Dùng một lần bằng thao tác nguyên tử**: `UPDATE … WHERE used_at IS NULL AND superseded_at IS NULL AND expires_at>clock_timestamp() RETURNING user_id`. Hai request đua nhau trên cùng một link thì đúng một cái thắng.
- **Hạn tuyệt đối 48 giờ**, không gia hạn.
- **Phát link mới thì link cũ bị retire** (`superseded_at`): chỉ cái mới nhất dùng được.
- **Mật khẩu bị từ chối không tiêu link** — kiểm mật khẩu trước khi claim.
- **Đặt mật khẩu xong thu hồi mọi phiên** của tài khoản đó, trong cùng transaction.
- `inspect()` đọc link mà **không tiêu**, để hiện form trước khi khách gõ.
- Email chuẩn hoá lowercase + trim, unique index nên hai cách viết của một địa chỉ là một tài khoản. Regex **cố tình dễ dãi**: địa chỉ hoặc gửi được hoặc không, pattern chặt quá sẽ loại nhầm địa chỉ hợp lệ.

## Email: nullable trong DB, bắt buộc trong code

Cột thêm dạng nullable vì hàng cũ có trước nó và luật bàn giao cấm backfill 004. `provision()` bắt buộc email. CHECK chặn địa chỉ sai dạng, quá 254 byte, hoặc còn chữ hoa.

**Chưa có xác minh email.** Xác minh đòi phải gửi thư thật; lát này link được **in ra cho Tài copy gửi qua Zalo**, nên việc tiêu link không chứng minh khách kiểm soát hòm thư đó. Cột `email_verified_at` cố ý chưa thêm — sẽ thêm cùng lát gửi email, để không tạo một trường mang nghĩa sai.

## File

Mới: `db/migrations/006_owner_email_setup.sql` (+rollback), `lib/owner/setup-link.ts`, `repository-tests/owner-setup.spec.ts`. Không sửa file nào.

## Bộ test repository phải chạy một worker

Thêm spec này làm lộ lại lỗi cũ ở dạng nặng hơn. Owner login giữ advisory lock **phạm vi toàn database**, còn test cô lập bằng **schema**. Lát trước chỉ `owner-dashboard.spec.ts` gọi owner login nên `fullyParallel: false` là đủ — case trong cùng file chạy tuần tự, hai file vẫn song song. Giờ `owner-setup.spec.ts` cũng login, nên **hai file** chạy song song trên hai worker lại giẫm chân nhau: 2 failed, cả hai báo `LOGIN_FAILED` như thể sai mật khẩu.

Đã chuyển `workers: 1`. Suite từ ~9s lên ~16s, đổi lấy kết quả tất định. Muốn song song trở lại thì phải cấp cho mỗi file **một database riêng**, không phải một schema riêng — ghi trong comment của config để lần sau khỏi vá nhầm chỗ.

## Kiểm chứng — 2026-09-16, PostgreSQL 18.6

`owner-setup.spec.ts` **6 passed**; repository suite **69 passed**, chạy hai lượt liên tiếp đều xanh; typecheck và ESLint exit 0. Migration áp sạch chồng lên 001–005; CHECK từ chối email viết hoa và email sai dạng (kiểm trực tiếp bằng psql); rollback từ chối khi đã có địa chỉ hoặc link.

## Chưa có

Gửi email thật (cần Tài chọn nhà cung cấp), route HTTP, trang đặt mật khẩu, nút Generate, xác minh email.

---

# Lát 3 — nút Generate và trang đặt mật khẩu — 2026-09-16

Vòng lặp hoàn chỉnh: Tài bấm một nút → ra shop, thẻ, tài khoản chủ shop và một liên kết → gửi qua Zalo → chủ shop tự đặt mật khẩu → tự đăng nhập dashboard của mình. Tài **không bao giờ biết mật khẩu đó**.

## Thứ tự các bước là thứ giữ cho lỗi vô hại

`PublishingAdmin` mở transaction riêng cho mỗi lệnh, nên cả chuỗi không thể nằm trong một transaction. Bản đầu xếp sai thứ tự và **test bắt được**: `publish()` chạy trước khi tạo owner, nên một username trùng để lại **một shop `active` không có chủ** — trang công khai mà không ai đăng nhập vào sửa được.

Đã sửa hai chỗ:
- **Kiểm username/email trùng trước khi ghi bất cứ thứ gì.** Đây là lỗi thường gặp nhất, bắt sớm thì không có gì để dọn.
- **`publish()` xuống cuối cùng.** Tới dòng đó shop mới có active release; hỏng ở bất kỳ bước nào phía trên chỉ để lại một hàng tối, resolver từ chối, không ai thấy.

Test khẳng định trực tiếp: sau một lần bị từ chối vì trùng, số shop và số tag **không tăng**.

## Chi tiết đáng ghi

- **Thẻ sinh ra ở trạng thái `prepared`, không phải `active`.** Đúng thực tế: thẻ vật lý còn phải ghi và thử trước khi khách quét được. `tag_transition()` ở migration 003 cũng chỉ cho `prepared → tested → active`.
- **Một template dùng chung** cho mọi shop thay vì mỗi shop một cái, nên tất cả render qua cùng một renderer có version.
- **Slug là mã ngẫu nhiên 12 ký tự.** Đổi sang tên đẹp sau không hỏng gì: thẻ mang mã tag, mọi lịch sử khoá theo `shops.id`.
- **Liên kết chỉ hiện một lần**, trong phản hồi `no-store`, vì hệ thống chỉ giữ bản băm. Mất thì phát lại — có sẵn nút, và phát lại sẽ **huỷ liên kết cũ**, nên đó cũng là cách cắt một liên kết lỡ gửi nhầm chỗ.
- **Trang đặt mật khẩu nói một câu duy nhất** cho hết hạn, đã dùng, bị thay và chưa từng tồn tại. Phân biệt ra là nói cho người dò liên kết biết họ đã trúng.

## Token nằm trong đường dẫn

`/owner/setup/<token>` — token đi vào log request của nền tảng. Giảm nhẹ bằng: dùng một lần, hết hạn 48 giờ, chỉ lưu bản băm, và `/owner/:path*` đã trả `no-store` + `no-referrer`. Muốn token không bao giờ tới máy chủ thì phải để nó trong fragment và cho trình duyệt POST lên; ghi nhận, chưa làm.

## Hai lỗi trong lúc làm, ghi lại vì dễ lặp

**Quên thêm migration 006 vào harness integration.** Đã thêm vào fixture repository nhưng không thêm vào `run-local.mjs`, nên cột `email` không tồn tại, `list()` ném lỗi và trang `/gov` hiện "Dịch vụ đang gián đoạn" — trông hệt như lỗi hạ tầng. **Thêm migration là phải sửa cả hai chỗ.**

**Chọn phần tử test bằng tên class của CSS module.** Class bị băm lúc build nên `.handover` không khớp gì. Đổi sang thuộc tính `data-handover`.

## Kiểm chứng — 2026-09-16

Bảy bộ đều exit 0: contracts 60 · client 73 · repository **73** · public+browser 15 passed 1 skipped + 2 production gate · publishing 4+2 · owner 3+2 · **admin 3+2**, trong đó có test chạy trọn vòng lặp qua trình duyệt thật.

## Chưa có

Mạo danh (lát 4). Kích hoạt thẻ `prepared → tested → active`. Gửi email tự động. Thanh toán. `NFC_PUBLISHING_ENABLED` vẫn tắt trên preview, nên trang khách còn render đường legacy; bật nó cần mọi shop có release, kể cả `caphe-demo` vốn được seed bằng INSERT thẳng.
