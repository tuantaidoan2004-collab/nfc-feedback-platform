# Tải ảnh và video lên Cloudflare R2 — 2026-09-18

**Đang chạy trên preview (18/09):** Tài tạo bucket `nfc-media` (APAC), bật R2.dev URL, thêm CORS và 5 biến cho branch `feat/local-app-foundation`; tải poster và logo lên, phát hành, trang khách hiện đúng.

Tài có tài khoản Cloudflare R2 và yêu cầu làm mọi thứ liên quan. Mã đã xong; bật lên cần Tài làm các bước tài khoản ở dưới.

## Cách chạy

1. Trong **Thiết kế & Link**, bấm **Tải poster lên**, **Tải logo lên** hoặc (nền "Ảnh hoặc video của shop") **Tải nền lên**.
2. Trình duyệt hỏi app một link tải lên (`POST /api/owner/v2/<shop>/media` với loại và kích thước tệp). App kiểm quyền sửa giao diện, loại tệp và kích thước, rồi ký một link **PUT** có hạn **5 phút**, khoá cứng đúng loại tệp và đúng số byte (chữ ký SigV4, `lib/media/sigv4.ts`, kiểm bằng ví dụ chính thức của AWS).
3. Trình duyệt gửi tệp **thẳng lên R2**; tệp không đi qua app. Khoá nằm dưới thư mục riêng của shop: `shops/<id shop>/<uuid>.<đuôi>`.
4. Link công khai (`MEDIA_PUBLIC_ORIGIN/…`) được điền vào ô. Chưa bấm Lưu nháp hay Phát hành thì khách chưa thấy gì.

- **Kho nào cũng được** từ lát I1: không đặt `STORAGE_ENDPOINT` thì là R2 theo `R2_ACCOUNT_ID`; đặt thì là S3, SeaweedFS hay kho tương thích S3 bất kỳ (`docs/tu-chay.md`).
- Nhận: ảnh JPG, PNG, WebP tối đa **5 MB**; video MP4 (chỉ cho poster) tối đa **50 MB** — trình duyệt nén về 720p trước khi tải lên (`lib/client/shrink-video.ts`); trình duyệt không nén được thì gửi bản gốc.
- Chủ shop, quản lý, và quản trị trong phiên "Sửa giao diện" (khấc 2, 3) tải lên được; mỗi lần quản trị tải lên được ghi sổ `impersonation.design.upload` thay mặt chủ shop.
- Thiếu biến nào trong năm biến dưới đây thì nút tải lên ẩn đi, ghi "Tải lên cần bật kho lưu trữ R2"; vẫn dán link https được.
- Chưa có: dọn tệp không còn dùng; tạo ảnh tĩnh cho video tải lên (video tải lên chưa có ảnh thay thế khi máy tiết kiệm pin).

## Việc Tài làm trên Cloudflare

1. **R2 → Create bucket**, tên `nfc-media`, vị trí tự động.
2. **Bucket → Settings → Public access → R2.dev subdomain → Allow.** Chép link `https://pub-….r2.dev`: đó là `MEDIA_PUBLIC_ORIGIN`. r2.dev bị giới hạn tốc độ, hợp cho giai đoạn thử; có tên miền thật thì gắn custom domain thay vào.
3. **Bucket → Settings → CORS policy → Add**, dán:
   ```json
   [{"AllowedOrigins":["https://nfc-feedback-platform-git-feat-local-app-foundation-mount-pro.vercel.app"],"AllowedMethods":["PUT"],"AllowedHeaders":["content-type"],"MaxAgeSeconds":3600}]
   ```
   Khi có tên miền production thì thêm nó vào `AllowedOrigins`. **19/09:** thêm `https://quitesensational-review-bio.vercel.app` (xem `production-launch.md`).
4. **R2 → Manage API tokens → Create API token**: quyền **Object Read & Write**, chỉ bucket `nfc-media`. Chép **Access Key ID** và **Secret Access Key** (chỉ hiện một lần). **Account ID** nằm ở trang tổng quan R2.

## Việc Tài làm trên Vercel

Project → Settings → Environment Variables, môi trường **Preview** (và Production khi mở production):

| Biến | Giá trị |
|---|---|
| `R2_ACCOUNT_ID` | Account ID (32 ký tự) |
| `R2_ACCESS_KEY_ID` | Access Key ID |
| `R2_SECRET_ACCESS_KEY` | Secret Access Key, đánh dấu **Sensitive** |
| `R2_BUCKET` | `nfc-media` |
| `MEDIA_PUBLIC_ORIGIN` | `https://media.quitesensational-review-bio.com` (từ 21/09; trước đó `https://pub-….r2.dev`) |

Vercel chụp biến môi trường lúc tạo deployment (gotchas), nên sau khi thêm biến phải **deploy lại bằng một commit**. Tài báo xong, agent push commit rỗng.
