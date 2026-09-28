# Nền tảng như một ứng dụng lớn — logic gốc, đích kiến trúc, việc còn lại

Duyệt lại toàn bộ ngày 26/09/2026, theo yêu cầu của Tài: dừng làm lát mới; đọc lại mọi quyết định từ đầu; hiểu lại logic
hệ thống — kho template như Canva, mỗi template một cách chỉnh, web là **tổ hợp các module tính năng**; giữ khả năng **tự chạy
không cần thuê Vercel hay các dịch vụ tương tự**; và chuẩn bị để sau này Tài **thuê coder và designer** làm việc trên hệ
thống. Tệp này là nguồn cho hướng đi đó. Luật Google (`google-policy.md`) vẫn đứng trên tất cả.

Danh sách lát còn lại (cập nhật tới 26/09) ở [`roadmap-slices.md`](roadmap-slices.md).

---

## 1. Logic gốc — một trang

- **Sản phẩm:** khách chạm thẻ NFC hay quét mã ở quán → mở **trang của quán**, về lâu dài là *"web của quán bản thu
  nhỏ"* (poster như quảng cáo, sự kiện, link, video…). Trên trang luôn có **lời mời đánh giá Google giống hệt nhau với
  mọi khách** và **thêm** một đường góp ý riêng cho quán. Không chọn lọc khách, không đổi quà lấy đánh giá.
- **Người dùng:** khách của quán (quan trọng nhất, dưới 30 giây, 4G) · chủ quán và nhân viên (dashboard) · người vận hành
  nền tảng (`/gov`). Sắp tới thêm hai nhóm **làm ra** sản phẩm: **designer** (làm template) và **coder** (làm module).
- **Ba lớp, cập nhật độc lập** (`goi-va-trang.md` mục 1): **nền tảng** (một bản cho mọi người) · **template** (mỗi template nhiều
  bản, trang ghim bản) · **nội dung** (thuộc trang, đổi template không mất).
- **Quán → trang → bản phát hành → thẻ.** Một quán nhiều trang; mỗi trang một link vĩnh viễn, một template@bản, cài đặt, nội
  dung, bản nháp và các bản phát hành **bất biến**; thẻ trỏ vào trang.
- **Dữ liệu hai cấp:** bề nổi cho chủ quán xem · hành vi cho "engine" sau này (đang thu từ 21/09; đọc để sau — Tài 26/09).
- **Kinh doanh:** giá theo template/trang, hai suất miễn phí mỗi quán, thẻ bán riêng; thu bằng chuyển khoản, Tài ghi nhận ở `/gov` (P5b-lite, 28/09); chưa tự tạm ngừng khi quá hạn.

## 2. Hôm nay đã "module" tới đâu — đánh giá thật

Ý Tài đưa (Gemini): template là **dữ liệu**, một **bộ chỉnh lõi** dùng chung, trang ghép từ **thành phần**, trang thật không
tải mã chỉnh. So với mã hôm nay:

| Nguyên tắc | Hôm nay | Đánh giá |
|---|---|---|
| Trang là dữ liệu (JSON) | `PageConfig` lưu trong bản nháp và bản phát hành | **Đúng** |
| Template có phiên bản, đóng băng | `template_versions` + CSS mỗi bản (`templates/<khoá>/v<bản>.css`, lát M1) | **Đúng** |
| Bộ chỉnh lõi đọc khai báo của template | Bảng cài đặt mỗi bản template (P2); trình chỉnh vẽ ô theo bảng | **Đúng cho phần diện mạo.** Phần nội dung (tên, poster, logo, link) vẫn viết cứng |
| Trang thật không tải mã chỉnh | Trang khách ~153 KB JS, không có trình chỉnh | **Đúng** |
| Trang ghép từ thành phần | Bố cục **cố định**: poster → logo → tên → Google → link → góp ý | **Chưa có.** Không thêm được "ô sự kiện", "video YouTube" mà không sửa lõi |
| Hành vi riêng của template là module | Kính (template 3), chuyển cảnh 300 ms và ánh sáng theo độ nghiêng (template 6) nằm **chung** trong `components/shop-feedback-v2.tsx` (~600 dòng) | **Chưa.** Thêm template có hiệu ứng = sửa component lõi của mọi template |
| Một template là một gói | **Xong M1 (27/09):** `templates/<khoá>/manifest.json` + `v<bản>.css`; `node scripts/templates.mjs` sinh registry và danh sách CSS | **Đúng.** Designer thêm/sửa template không đụng TypeScript (hướng dẫn: `templates/README.md`) |

Kết luận: nền móng đúng nhánh; phần thiếu là **section** và **module hiệu ứng** (gói template xong M1, 27/09). Không cần viết lại — nâng
dần theo đúng nhánh đang có (luật "tư duy từ gốc, nâng cấp tuyến tính").

## 3. Đích kiến trúc — tổ hợp module

### 3.1 Bốn loại module

| Loại | Là gì | Ví dụ | Ai làm |
|---|---|---|---|
| **Section** (khối nội dung) | Một khối trên trang khách: lược đồ dữ liệu + cách vẽ + các ô chỉnh nó cần | Poster · Hàng link · Sự kiện ("Hôm nay ở quán") · Video/YouTube xem trước · Thực đơn | Coder |
| **Loại ô** (field type) | Một loại ô trong bộ chỉnh lõi | Màu · thanh kéo · lựa chọn · bật/tắt · ảnh · video · chữ hai thứ tiếng · danh sách link | Coder |
| **Hiệu ứng** (effect) | Một mẩu JS nhỏ, template bật bằng tên | Kính khúc xạ · chuyển cảnh khi rời · ánh sáng theo nghiêng · hạt/lưới tương tác · gradient chuyển động | Coder |
| **Gói template** (template package) | Một thư mục: `manifest` (tên, giá, trạng thái thử/mở, section cho phép và vùng đặt, ô cài đặt, hiệu ứng dùng) + CSS đóng băng theo bản + ảnh xem trước | Sáu template hôm nay; template theo ngành (A22); template có tranh (A34) | **Designer** |

Trình chỉnh lõi **không biết template nào có gì**: đọc manifest và lược đồ section rồi tự vẽ ô (mở rộng đúng cái P2 đã làm).
Trang khách vẽ từ JSON phía server và **chỉ tải mã của section và hiệu ứng trang đó dùng**.

### 3.2 Trang = template@bản + cài đặt + danh sách section

```
page = { template: "glass@2", settings: {...}, sections: [ {type:"poster",...}, {type:"event",...}, {type:"links",...} ] }
```

**Lõi cố định, không phải section:** lời mời Google, nút góp ý riêng, chân trang pháp lý và nút "Xoá dữ liệu của tôi".
Chúng luôn có mặt, cùng chỗ, với mọi khách — đó là cách luật Google đứng vững *theo cấu tạo* chứ không nhờ cẩn thận.

### 3.3 Hai rào của riêng nền tảng này

1. **Luật Google theo cấu tạo:** section không được đẩy lời mời Google ra khỏi màn hình đầu, không được đặt nội dung ưu
   đãi cạnh nó, và chữ tự do của mọi section đi qua cùng hàng rào ở biên ghi (`lib/publishing/policy.ts`).
2. **Không khung vẽ trắng** (`PRODUCT.md`): chủ quán **chọn** section từ danh sách ngắn và xếp thứ tự trong vùng template cho
   phép; kéo thả tự do chỉ có ở lớp trang trí có ràng buộc (A35).

### 3.4 Kiểm tự động cho mỗi gói template

Mỗi gói template phải qua, trong CI, trước khi vào kho: nút Google trọn trong màn hình đầu · tương phản ≥ 4,5:1 · nút Google
nổi hơn nút góp ý · CSS thêm ≤ 40 KB · CSS chỉ đọc ô đã khai · không thêm/bớt/đổi thứ tự nút lõi. Phần lớn đã có dưới dạng
test rời (`tests/contracts/skin.spec.ts`, `google-policy.spec.ts`); gom thành **một lệnh kiểm gói** để designer tự chạy.

### 3.5 Thứ tự nâng — mỗi bước lên production được, không bước nào viết lại

| # | Bước | Thay đổi thấy được | Migration |
|---|---|---|---|
| **M1** ✓ | **Gói template (xong 27/09):** mỗi template một thư mục + manifest; registry sinh từ đó | Không (cùng hành vi) — từ đây designer làm template không đụng TypeScript | Không |
| **M2** ✓ | **Module hiệu ứng (xong 27/09):** `components/effects/` — kính, hạt ngọc + nghiêng, lớp sương, lời cảm ơn trước Google; một sổ đăng ký, trang khách không phải sửa khi thêm hiệu ứng | Lời cảm ơn trước Google (template 1–5), con trỏ nhiều màu | Không |
| **M3** ✓ | **Section (xong 27/09):** `PageConfig` v3 có `sections` = khối nào hiện, thứ tự nào; dữ liệu của khối vẫn ở nội dung trang (`poster`, `links`, `page_profile`). Vùng trên nút Google chỉ có poster (sàn 1); khối mới (sự kiện, video — M4) đứng dưới. Trang v1/v2 vẫn đọc được, lên v3 khi lưu | Chủ quán bật/tắt khối trong trình chỉnh | **Không** (không ràng buộc nào trên phiên bản cấu hình) |
| **M4** | **Section mới + đợt cải tổ UI/UX:** Sự kiện (A16), Video/YouTube xem trước, khung poster tự theo khổ video/ảnh và bo góc, nền có chiều sâu (ảnh hero, gradient chuyển động, mixed media, hạt/lưới); nền đứng yên khi cuộn, bỏ kéo-để-tải-lại dính trên Chrome iPhone (Tài 27/09) | Có | Tuỳ section |
| **M5** | **Kho template thử → mở:** gói template mới vào kho ở trạng thái thử (admin thấy), rồi mở; giá lấy từ manifest | `/gov` và kho template | Có thể |
| **M6** | **Lệnh kiểm gói template** + trang xem trước gói cho designer | Công cụ nội bộ | Không |

## 4. Tự chạy được, không cần thuê dịch vụ

Mục tiêu (từ `mvp-architecture.md`, 09/09, và Tài 26/09): cùng mã chạy được trên một máy Node/Docker bất kỳ; mỗi dịch vụ
thuê chỉ là **một lựa chọn cấu hình**, không phải một phụ thuộc trong mã.

**Lát I1 xong 26/09** — sổ tay [`tu-chay.md`](tu-chay.md), `Dockerfile`, `deploy/docker-compose.yml`, job CI `self-host`.

| Phần | Hôm nay (production) | Tự chạy | Trạng thái |
|---|---|---|---|
| Ứng dụng | Vercel | `Dockerfile` (bản build standalone) | **Có**, CI dựng và kiểm mỗi lần đẩy |
| Database | Neon | PostgreSQL trong compose, hoặc bất kỳ | **Có** — migration SQL chuẩn |
| Ảnh/video | Cloudflare R2 | SeaweedFS trong compose, S3, bất kỳ kho S3 | **Có** — `STORAGE_ENDPOINT` (`lib/media/storage-settings.ts`); không đặt thì vẫn là R2 |
| IP khách (chặn bot) | Header của Vercel | Header proxy của mình ghi đè (`NFC_CLIENT_IP_HEADER`) | **Có** — và đóng một lỗ: trước I1, ngoài Vercel khách tự gửi header để giả IP |
| Sao lưu | GitHub Actions → R2 | Mọi PostgreSQL → mọi kho S3 (`R2_BACKUP_ENDPOINT`) | Script **có**; chạy bằng cron trên máy chủ là việc nhỏ còn lại |
| Tên miền, DNS | Cloudflare | Bất kỳ | Không phụ thuộc |
| Email, Zalo | Chưa có | — | Làm qua adapter khi tới (B5, B7) |

## 5. Sẵn sàng cho đội ngũ

- **Designer** làm **gói template** (CSS + manifest + ảnh), không đụng TypeScript; tự chạy lệnh kiểm gói (M1, M6).
- **Coder** làm **module** (section, loại ô, hiệu ứng) và lõi, theo ranh giới thư mục rõ; mỗi module có README ngắn và test.
- **Quy trình như ứng dụng lớn:** mọi thay đổi qua PR + review + 7 bộ test (CI đã có — A4); bảo vệ nhánh `main` (F5);
  migration đánh số, chạy trước khi đẩy code; số bản nền tảng + nhật ký thay đổi (P6); mỗi quyết định một ADR, sổ tay vận
  hành, hướng dẫn người mới (A25); môi trường staging dữ liệu giả (D8).
- **Tài liệu nguồn:** tệp này (kiến trúc) · `PRODUCT.md` (cho ai) · `DESIGN.md` (trông thế nào) · `google-policy.md` (luật
  cứng) · `goi-va-trang.md` (quán, trang, gói) · `operations-gotchas.md` (bẫy đã dính).

## 6. Quyết định lớn Tài đã nêu mà chưa thực hiện (từ 09/09 tới 26/09)

| Quyết định / ý lớn | Nêu khi | Trạng thái |
|---|---|---|
| Web là tổ hợp module; kho template như Canva, mỗi template một cách chỉnh | 26/09 | Đích ở mục 3; M1–M6 chưa làm |
| Trang = "web của quán bản thu nhỏ": ô sự kiện khi lướt xuống, link YouTube xem trước | 26/09 | M4, cùng A16 |
| Khung poster tự theo khổ video, bo góc, tuỳ chỉnh kiểu Canva; nền có chiều sâu thay video | 26/09 | M4 — đợt cải tổ UI/UX |
| Tự chạy được không cần thuê Vercel; tạo việc làm cho coder, designer | 09/09 · 26/09 | **I1 xong 26/09**; đội ngũ ở mục 5 |
| "Hôm nay ở quán", trò "săn" bé nhồi bông, dấu thương hiệu nền tảng, "quanh đây có gì" | 20/09 | A16, F6, D7 — chưa làm |
| Kho template có trạng thái thử → mở; template theo ngành; ba template có tranh | 25/09 · 20/09 | M5, A22, A34 (chờ ảnh) |
| Lớp trang trí kéo thả có ràng buộc cho template 4 | 23/09 | A35 |
| App admin trên tên miền riêng | 25/09 | P7 |
| Số bản nền tảng `năm.tháng.lần` + nhật ký thay đổi | 25/09 | P6 |
| Thu tiền: kỳ tháng, chuyển khoản QR, admin xác nhận, huỷ → tạm ngừng 30 ngày → đóng | 25/09 | P5b — Tài: chưa thu, cần cảm nhận khách trước |
| Đền bù khi chủ quán tạm dừng khẩn cấp | 25/09 | Tài: bàn sau |
| Một thẻ NFC chuyển được giữa các trang của cùng quán không | 25/09 | Chưa chốt |
| Dữ liệu trang đã đóng: xoá ngay hay giữ bao lâu | 25/09 | Chưa chốt (đi cùng hạn giữ dữ liệu) |
| Số điện thoại có hai mục đích (gọi lại vì khiếu nại · sự kiện/quay thưởng) → cần cột `purpose` **trước khi có loại thứ hai** | 21/09 | **Chưa làm** — phải làm trước A16 nếu A16 xin số |
| Hạn giữ dữ liệu: trang chính sách hứa tối đa 12 tháng | 21/09 | Dời; **hạn chót 9/2027** |
| Đọc dòng sự kiện hành vi (engine, số liệu, so sánh bản) | 21/09 | Dời (Tài 26/09) |
| Dashboard tiếng Anh ("Review Landing Pages") | 18/09 | A24 |
| Quên mật khẩu tự gửi email; báo cáo tuần | 18/09 | B5 — chờ dịch vụ email |
| 2FA cho chủ quán, danh sách phiên đăng nhập | 20/09 | A12, A11 |
| Nhận diện nền tảng, nhãn hiệu, luật sư | 20/09 | F1, F2, F6 |

## 7. Đề xuất thứ tự tiếp theo

1. ~~**I1 · Tự chạy được**~~ — **xong 26/09** ([`tu-chay.md`](tu-chay.md)).
2. **M1 · Gói template** rồi **M2 · Module hiệu ứng** — không đổi hành vi, không migration; mở cửa cho designer.
3. **Cột `purpose` cho số điện thoại** — nhỏ, có migration; phải có trước bất kỳ section nào xin số.
4. **M3 · Section** — bước có migration lớn nhất của đợt này.
5. **M4 · Đợt cải tổ UI/UX** cùng A16 — lúc này sự kiện, YouTube, poster tự khổ chỉ là section mới.

Song song phía Tài: sao lưu (`sao-luu.md`), F4, F5, thử sáu template trên điện thoại thật, quán thật đầu tiên.
