# Production — đường vào và cách mở

Phần đầu tệp là **bản đồ dùng hằng ngày**: vào đâu, đăng nhập bằng gì, cái nào đã có cái nào chưa. Phần sau là hồ sơ lát mở production 19/09, giữ lại để tra khi cần. **Đổi trạng thái thì sửa bảng ở đây**, đừng để người sau phải ghép từ checklist cũ.

## Đường vào

Production: **`https://quitesensational-review-bio.com`** (đổi 21/09/2026; Cloudflare đăng ký tên miền, DNS trỏ Vercel bằng CNAME **DNS only**). `https://quitesensational-review-bio.vercel.app` **308 về đây** — link cũ vẫn chạy nhưng **đừng ghi nó vào thẻ**. Deploy từ **`main`**, database là **branch Neon production**, đã migrate **001–029** (030 của M2b chờ Tài chạy) (số mới nhất luôn ở khối "TIẾP TỤC TỪ ĐÂY" của `decisions.md`).

**Hàm chạy ở `sin1` (Singapore)**, cùng vùng với Neon. Trước 21/09 nó chạy ở `iad1` (Washington DC) nên mỗi truy vấn là một vòng Thái Bình Dương ~250ms; xem `decisions.md` mục 8. Kiểm bằng `curl -s -D - -o /dev/null <url> | grep x-vercel-id` → phải thấy `::sin1::`.

**Đừng bật proxy Cloudflare (đám mây cam)** cho các bản ghi DNS này: nó thay IP khách bằng IP Cloudflare và làm tầng chặn bot của lát A1 đếm mọi khách của mọi quán như một địa chỉ.

Preview: **`https://nfc-feedback-platform-git-feat-local-app-foundation-mount-pro.vercel.app`**, deploy từ nhánh `feat/local-app-foundation`, database là branch Neon preview (cùng số migration với production). Alias này chỉ di chuyển theo **deployment do Git kích hoạt**; `vercel deploy` từ CLI không di chuyển nó (bẫy ở `platform-admin.md`).

| Đường | Là gì | Đăng nhập bằng | Trạng thái trên production (21/09) |
|---|---|---|---|
| `/gov` | Quản trị nền tảng: tạo shop, cấp link đặt mật khẩu | admin **`tai`** + **mã 6 số** từ ứng dụng xác thực (đã đăng ký 21/09; 10 mã dự phòng Tài giữ) | **Dùng được** |
| `/ZZZ/<slug>` | Dashboard chủ shop | `@handle` của chủ shop | **Có**: shop template `urr6ud` (`@yourshop`) và các shop Tài tạo (xem `/gov`). `caphe-demo` (shop giả, nháp) bị xoá ở migration 028 |
| `/<slug>` | Trang khách | không cần | **Có**: `/urr6ud`. Cảnh báo "Nguy hiểm" của Chrome trên tên miền cũ **đã hết** sau khi chuyển `.com` |
| `/t/<mã>` | Link ghi vào thẻ NFC | không cần | **Chưa ghi thẻ nào.** Lô thẻ đầu **phải** mang `.com`; mã thẻ chứa cả tên miền và không sửa được sau khi ghi |
| `/` | Trang chính của nền tảng (D4a), được lập chỉ mục | không cần | Lên production cùng lần đẩy D4 lên `main`; trước đó là trang tĩnh ngắn |
| `/bat-dau` | Chủ quán dựng trang không cần tài khoản, quét QR xem trên điện thoại, 3 câu hỏi, "Lưu trang của tôi" (D4a–D4b) | không cần; lưu thì tạo tài khoản | Cùng lần đẩy D4 |
| `/thu/<mã>` | Bản xem thử của một trang đang dựng: link có chữ ký, sống 7 ngày, không ghi lượt ghé | không cần | Cùng lần đẩy D4 |
| `/owner/login` | Trang đăng nhập chủ shop | `@handle` hoặc email | Có `?next=` thì về đó; không có (từ trang chính, D4b) thì về dashboard của tài khoản, hoặc `/owner/cho-duyet` nếu trang còn chờ duyệt |
| `/owner/cho-duyet` | Tài khoản tự tạo mà trang chưa được duyệt | `@handle` vừa tạo | Cùng lần đẩy D4. Duyệt ở `/gov` → khung "Trang chờ duyệt" |

Gõ mật khẩu bằng **bàn phím tiếng Anh**: bộ gõ tiếng Việt đổi `r` thành dấu hỏi, `s` thành dấu sắc, nên mật khẩu đúng vẫn báo sai (bẫy ở `operations-gotchas.md`).

**Muốn biết database production có sống không:** đăng nhập `/gov`. Trang đó đọc database để xác thực; `/gov/login` và `/owner/login` trả 200 **không** chứng minh gì vì chúng không đọc database. Đây là cách kiểm sau mỗi lần xoay credential hoặc chạy migration.

## Còn phải làm trên production (tính tới 21/09)

- [x] ~~Đăng nhập `/gov`, tạo shop template~~ — xong 21/09.
- [ ] **Tạo shop thật đầu tiên** và ghi thẻ NFC cho nó. Kiểm đường dẫn trong dashboard là `.com` trước khi ghi.
- [ ] **Thử tải một ảnh lên** từ dashboard — phép kiểm CORS bucket R2 và hai khoá R2 của production.
- [x] **21/09: `MEDIA_PUBLIC_ORIGIN` = `https://media.quitesensational-review-bio.com`** (custom domain của bucket `nfc-media`, Production và Preview). Tài tải lên thử, link ra đúng `media.…`. **r2.dev vẫn bật** cho ảnh đã lưu trước đó; tắt khi không còn cấu hình nào trỏ `pub-….r2.dev`. Ảnh đại diện cũ trên `r2.dev` phải tải lại, vì `lib/owner/profile.ts` chỉ nhận ảnh dưới `MEDIA_PUBLIC_ORIGIN`. Bản ghi DNS `media` **để đám mây cam** (R2 bắt buộc); luật "không bật cam" chỉ áp cho bản ghi trỏ Vercel.
- [ ] Thử dashboard trên **điện thoại** bằng tên miền production.

## Checklist mở production (19/09, đã xong bước 1–4)

1. **Tài: biến môi trường Production trên Vercel** (mục dưới). Phải xong **trước** khi deploy: Vercel chụp biến lúc tạo deployment.
2. **Tài: thêm tên miền production vào CORS của bucket R2** (Cloudflare → R2 → `nfc-media` → Settings → CORS policy): `AllowedOrigins` thêm `https://quitesensational-review-bio.vercel.app`, giữ origin preview.
3. **Tài: tạo admin `tai` trên database production** (lệnh dưới).
4. **Agent: push `feat/local-app-foundation` lên `main`** (fast-forward) → Vercel deploy production. Agent kiểm bằng request không đăng nhập: `/gov/login` 200, `/owner/login?next=…` 200, `/api/owner/v2/x` 401.
5. **Tài: vào `/gov` trên production**, tạo shop template, rồi tạo shop thật. Tài khoản template `yourshop` chỉ vào được bằng link đặt mật khẩu dùng một lần (mọi môi trường, từ 27/09).
6. Ghi thẻ NFC cho khách bằng link `https://quitesensational-review-bio.vercel.app/t/<mã>`.

## Biến Production

Giá trị không bí mật (dán cả khối vào ô Key của "Add Environment Variable", loại **Config**, chỉ chọn **Production**):

```
NFC_ENV=production
NFC_BUILD_TARGET=vercel
SERVER_DATA_ENABLED=true
NFC_VISITS_V2_ENABLED=true
NFC_OWNER_V2_ENABLED=true
NFC_PUBLISHING_ENABLED=true
NFC_ADMIN_ENABLED=true
APP_ORIGIN=https://quitesensational-review-bio.vercel.app
R2_BUCKET=nfc-media
```

Chép từ biến Preview (loại Config nên xem được): `R2_ACCOUNT_ID`, `MEDIA_PUBLIC_ORIGIN`.

Bí mật (loại **Secret/Sensitive**, chỉ Production):
- `NFC_RENDER_SIGNING_KEY`: khoá **mới**, khác preview, sinh và thêm thẳng bằng CLI để không hiện ra màn hình.
- `NFC_TOTP_KEY` (thêm ở lát A2, 20/09): 32 byte hex, **khác nhau giữa Production và Preview**. Mã hoá bí mật 2FA của admin khi lưu. Thiếu biến này thì đường đăng ký 2FA **từ chối chạy** (`TOTP_KEY_MISSING`) chứ không lưu bí mật trần. **Đổi khoá này là mọi admin mất 2FA và phải đăng ký lại** — nếu buộc phải đổi, xoá `totp_secret`/`totp_enrolled_at` của họ trong cùng một lần.
- `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`: biến preview là Secret nên không đọc lại được. Nếu còn giữ khoá cũ thì dùng lại; không thì tạo token R2 mới (Cloudflare → R2 → Manage API tokens → Create: Object Read & Write, chỉ bucket `nfc-media`).

`DATABASE_URL`, `DATABASE_URL_UNPOOLED` do tích hợp Neon đặt sẵn cho Production. `NFC_SUPPORT_CONTACT` đã có cho Production.

## Admin trên database production

`scripts/bootstrap-admin.mjs` hỏi mật khẩu (ít nhất 16 ký tự, không hiện ra màn hình) và từ lát F6 nhận `--handle` và `--title`, vì migration 014 chỉ gắn huy hiệu cho admin `tai` **đã có** lúc chạy migration. Gõ mật khẩu bằng **bàn phím tiếng Anh** (bẫy bộ gõ tiếng Việt trong `operations-gotchas.md`). Nếu báo `duplicate key` thì admin đã có: chạy lại với `--reset` (đặt mật khẩu mới và gắn huy hiệu).

## Khi có `.com`

Gắn `.com` vào Vercel bằng DNS Cloudflare, đổi `APP_ORIGIN`, deploy lại, cho `quitesensational-review-bio.vercel.app` chuyển hướng 308 sang `.com`. Thẻ đã ghi vẫn chạy qua chuyển hướng; mọi người đăng nhập lại một lần. Có `.com` trên Cloudflare mới gắn được `media.<tên-miền>` cho R2 thay `r2.dev`.

Trước lát 19/09 production **đóng**: không có `NFC_ENV`, và `main` còn là mã cũ (`df0a485`). `main` là tổ tiên của `feat/local-app-foundation`, nên gộp là fast-forward, không xung đột.

## Đã làm (19/09)

- Tài đặt đủ 17 biến Production (kiểm bằng `vercel env ls production`). Lần kiểm đầu agent lọc sai cột bằng `awk` và tưởng thiếu biến; đọc bảng nguyên văn thì đủ.
- Tài tạo admin `tai` trên database production bằng `bootstrap-admin.mjs --handle=Quitesensational --title="Admin Tài"`. Script in cảnh báo SSL của `pg` vì chưa đổi `sslmode` như `migrate.mjs`; đã sửa trong script.
- Agent fast-forward `main` từ `df0a485` lên `c56cb7b` (19/09). Trong lúc build, tên miền production còn phục vụ bản `main` cũ với biến mới (Vercel đã redeploy bản cũ khi Tài thêm biến), nên lần kiểm đầu tưởng đã xong; phải kiểm một dấu hiệu chỉ bản mới có (chữ "@handle hoặc email" ở trang đăng nhập) và `vercel ls --prod` (trạng thái Building).
- **Production mở, kiểm không đăng nhập:** `/gov/login` 200 · `/owner/login` 200 (có dòng "Quên mật khẩu? Liên hệ …") · `/ZZZ/<mã>` 307 về đăng nhập · `/gov` 307 về `/gov/login` · `/api/owner/v2/<mã>`, `/notifications`, `/profile` 401 · `/t/<mã lạ>` 200 (trang "chưa sẵn sàng") · header `x-frame-options: DENY`, `cache-control: private, no-store`, HSTS.
- **Còn lại cho Tài:** đăng nhập `/gov` trên production bằng admin `tai`, tạo shop template, tạo shop thật, rồi thử tải ảnh lên (kiểm CORS R2 và hai khoá R2 mới).
- **Từ giờ:** production deploy từ `main`. Mỗi lát xong trên branch và đã kiểm trên preview thì fast-forward `main`; lát có migration thì migrate Neon production **trước** khi đẩy `main`.

## Tài khoản dashboard template trên production (19/09)

Tài hỏi tài khoản dashboard template. Preview là `yourshop / 1`; production **từ chối** mật khẩu yếu đó (`TEST_ACCOUNT_FORBIDDEN`), nên lát mở production để lại một lỗ: **không có cách nào sửa template trên production**. Agent không lường trước khi lên kế hoạch lát này.

Sửa: trên production, nút ở `/gov` thành **"Tạo tài khoản cho template (link đặt mật khẩu)"** và **"Tạo lại link đặt mật khẩu cho yourshop"** (`ShopProvisioning.templateAccountLink`). Tài khoản `yourshop` tạo ở trạng thái khoá (như chủ shop mới), `/gov` hiện link đặt mật khẩu dùng một lần 48 giờ; Tài tự đặt mật khẩu mạnh rồi đăng nhập dashboard template bằng `@yourshop`. Cấp link mới cũng mở khoá đếm đăng nhập sai. **Từ 27/09 preview cũng vậy:** `yourshop / 1` bị gỡ hẳn (repo công khai thì mật khẩu cố định là mật khẩu ai cũng biết); cấp lại link thì khoá tài khoản và đăng xuất mọi phiên cũ trước.

**Lỗi cũ test mới bắt được:** `OwnerSetupLinks.write` chỉ huỷ link còn mở **cùng loại** (`setup` hoặc `reset`). Link đặt mật khẩu đầu tiên (`setup`) vì thế **vẫn dùng được** sau khi admin cấp lại link (`reset`) cho chủ shop, cho tới khi hết 48 giờ. Giờ link mới huỷ mọi link còn mở của tài khoản.
- 7 bộ trên commit `0aa2f47`: tsc exit 0 · eslint exit 0 · repository `116 passed` · contracts `73 passed` · client `75 passed` · public-v2 + browser-hardening `1 skipped, 16 passed` + `2 passed` · publishing `10 passed` + `2 passed` · owner `10 passed` + `2 passed` · admin `6 passed` + `2 passed`. Không có migration; đã đẩy lên `main`.


## Đã làm (20/09)

- Lát **A1** (chặn bot trang khách) lên production cùng **migration 018**. Tài xoay mật khẩu `neondb_owner` trên **cả hai** branch Neon rồi mới migrate cả hai, sau khi một lệnh sai shell của Claude làm chuỗi kết nối production rơi vào dòng lệnh và `~/.zsh_history` (bẫy `read -p` trong `operations-gotchas.md`).
- Kiểm bản mới lên đúng bằng **`dpl-id`** trong HTML, không bằng mã trạng thái: bản cũ `dpl_GVc1WLuw8Bh…` → bản mới `dpl_6kMpix7VqHqz…` sau 45 giây. Đây là cách đúng, vì Vercel có thể redeploy **bản cũ** với biến mới và làm người kiểm tưởng đã xong.
- **Chưa chứng minh được database production đã nối lại**: mọi đường Claude kiểm được từ bên ngoài đều không đọc database, và production chưa có shop nào để mở một trang có đọc. Phép kiểm còn lại là Tài đăng nhập `/gov`.
