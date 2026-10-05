# Sao lưu database production (lát B2, 26/09/2026)

**Mỗi đêm 02:00 giờ Việt Nam**, GitHub Actions (`.github/workflows/backup.yml`) chạy `scripts/backup.mjs`:

1. `pg_dump` database production bằng một **người dùng chỉ-đọc** — lệnh sao lưu không sửa hay xoá được gì.
2. **Mã hoá** bản dump bằng mật khẩu sao lưu (AES-256-GCM, khoá dẫn từ mật khẩu bằng scrypt — `scripts/backup-crypto.mjs`).
   Bản dump chứa lời khách và số điện thoại, nên nó không bao giờ rời máy chạy ở dạng rõ.
3. Tải lên **bucket R2 riêng, không công khai**, tên `production/<thời điểm UTC>.dump.enc`.
4. **Tải ngược về và so mã băm** — tệp trên R2 phải đúng từng byte với tệp vừa tải lên.

Bucket tự xoá bản cũ hơn 30 ngày (luật vòng đời của chính bucket). Chạy tay bất cứ lúc nào: tab **Actions** → **Nightly
backup** → **Run workflow**. Miễn phí: GitHub Actions và R2 trong hạn mức miễn phí.

**Khôi phục** (`scripts/restore-backup.mjs`): giải mã rồi `pg_restore` vào một database, in số dòng từng bảng. Script
**chỉ chịu khôi phục vào database trên máy** (localhost). Khôi phục đè lên Neon là quyết định của người ngồi ở bảng điều
khiển, không phải của script.

Đã thử trên máy 26/09: sao lưu → khôi phục vào database trống → số dòng mọi bảng khớp, chữ tiếng Việt nguyên vẹn; sai
mật khẩu thì từ chối; đích không phải localhost thì từ chối. Test hợp đồng `tests/contracts/backup.spec.ts` giữ: mở lại
đúng từng byte, tệp mã hoá không chứa chữ gốc, sửa một byte / cắt cụt / sai mật khẩu đều bị từ chối.

## Việc của Tài — một lần

**Mật khẩu sao lưu là chìa duy nhất.** Mất nó thì mọi bản sao lưu thành rác. Cất trong trình quản lý mật khẩu, không để
trong repo, không gửi qua chat.

### 1. Người dùng chỉ-đọc trên Neon (branch production)

Tạo mật khẩu cho người dùng này trên máy:
```bash
openssl rand -base64 24 | tr -d '/+='
```
Trong Neon → branch **production** → **SQL Editor**, chạy (thay `<mật khẩu>`):
```sql
CREATE ROLE backup_reader WITH LOGIN PASSWORD '<mật khẩu>';
GRANT pg_read_all_data TO backup_reader;
```
Nếu dòng `GRANT pg_read_all_data` bị từ chối, chạy thay bằng:
```sql
GRANT USAGE ON SCHEMA public TO backup_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO backup_reader;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO backup_reader;
ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public GRANT SELECT ON TABLES TO backup_reader;
ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public GRANT SELECT ON SEQUENCES TO backup_reader;
```
Chuỗi kết nối: lấy chuỗi production trong Neon → **Connect**, **tắt "Connection pooling"** (pg_dump không chạy qua
pooler — host không có chữ `-pooler`), rồi thay người dùng và mật khẩu:
`postgresql://backup_reader:<mật khẩu>@<host không -pooler>/neondb?sslmode=require&channel_binding=require`

### 2. Bucket và khoá R2 (Cloudflare)

- R2 → **Create bucket** tên `nfc-backups`. **Không** bật truy cập công khai, không gắn tên miền.
- Bucket `nfc-backups` → **Settings** → **Object lifecycle rules** → thêm luật: xoá object sau **30 ngày**.
- R2 → **Manage API tokens** → **Create API token**: quyền **Object Read & Write**, chỉ áp cho bucket **`nfc-backups`**.
  Ghi lại *Access Key ID* và *Secret Access Key* (chỉ hiện một lần). Account ID nằm ở trang R2.

### 3. Mật khẩu sao lưu

```bash
openssl rand -base64 32
```
Cất vào trình quản lý mật khẩu **trước**, rồi mới dán vào GitHub.

### 4. Secrets trên GitHub

Repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**, sáu cái:

| Tên | Giá trị |
|---|---|
| `NEON_BACKUP_URL` | chuỗi kết nối của `backup_reader` (bước 1) |
| `BACKUP_PASSPHRASE` | mật khẩu sao lưu (bước 3) |
| `R2_BACKUP_ACCOUNT_ID` | Account ID của Cloudflare (hoặc, với kho S3 khác: `R2_BACKUP_ENDPOINT` + `R2_BACKUP_REGION`, xem `tu-chay.md`) |
| `R2_BACKUP_ACCESS_KEY_ID` | Access Key ID (bước 2) |
| `R2_BACKUP_SECRET_ACCESS_KEY` | Secret Access Key (bước 2) |
| `R2_BACKUP_BUCKET` | `nfc-backups` |

### 5. Chạy thử

Tab **Actions** → **Nightly backup** → **Run workflow**. Log bước cuối phải có dòng
`Uploaded production/…dump.enc: dump … bytes, sealed … bytes, sha256 …, read back and matched`.

### 6. Diễn tập khôi phục (một lần, ghi thời gian)

Trên máy, tạo một database trống rồi khôi phục bản vừa lên R2 vào đó. Lệnh cho zsh; bí mật đọc bằng `read -rs`:
```bash
cd "/Users/doantai/Desktop/QuiteSensational" && export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh" && B=/Applications/Postgres.app/Contents/Versions/latest/bin
```
Sau đó Claude đưa lệnh khôi phục cụ thể (cần database Postgres chạy trên máy và tên tệp trên R2 lấy từ log bước 5).
Kết quả: danh sách bảng + số dòng + "Restored in …s", đối chiếu với số dòng trên Neon.

## Giới hạn, nói thẳng

- Sao lưu là **bản chụp mỗi đêm**: sự cố lúc 23:00 thì mất tới gần một ngày dữ liệu. Quay ngược tới từng phút là gói trả
  phí của Neon (B1) — chưa chọn.
- Bản sao nằm cùng nhà cung cấp với ảnh (Cloudflare) nhưng khác nhà cung cấp với database (Neon). Mất cả tài khoản
  Cloudflare thì mất bản sao — chấp nhận ở giai đoạn này.
- Chưa có cảnh báo khi sao lưu thất bại ngoài email mặc định của GitHub khi workflow đỏ (B3 giám sát).
