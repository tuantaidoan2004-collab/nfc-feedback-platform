# Lát 2 — địa chỉ liên hệ và link thiết lập một lần — 2026-09-16

Thực hiện hai thứ [commercial-model.md](commercial-model.md) đòi mà hệ thống chưa có: chỗ liên hệ chủ shop (chính sách xoá dữ liệu hứa gửi bản ghi trước khi xoá), và cách tạo tài khoản **mà Tài không bao giờ biết mật khẩu của khách**.

Tài chốt: **link sống 48 giờ**, **email bắt buộc** với tài khoản tạo từ nay.

## Không sửa `lib/owner/auth.ts`

Kế hoạch ban đầu là thêm email vào `bootstrap()`. Bỏ, vì đổi chữ ký hàm đó là đụng vào đường đăng nhập đã có test. Thay bằng `provision()` ở module mới.

Tài khoản tạo ra mang **mật khẩu không dùng được**: `password_key` là 32 byte ngẫu nhiên, **không dẫn xuất từ chuỗi nào**, nên không input nào khớp và tài khoản đóng cho tới khi khách tự đặt mật khẩu qua link. Đây là cách Django và nhiều framework khác làm. Hệ quả quan trọng: Tài **chưa từng cầm** mật khẩu của shop, nên ngày có tranh chấp "ai vào tài khoản tôi" thì không ai nghi ngờ được.

`lib/owner/auth.ts` không bị sửa một dòng nào.

## Khuôn chuẩn đã theo

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
