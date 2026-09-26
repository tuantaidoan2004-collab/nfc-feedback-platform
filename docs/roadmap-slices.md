# Danh sách lát — từ báo cáo tổng quan 2026-09-19 và ý Tài thêm 2026-09-20

Tài chốt cách xếp: **không theo mốc thời gian**, mà theo **mức sẵn sàng** (điều kiện đã có chưa), **cỡ** và **thứ tự**. Mỗi ý trong báo cáo thành một dòng ở đây. Điểm mạnh của các "đỉnh" (Netflix, Telegram, Salesforce, Canva, AWS) được lấy vào lát tương ứng, ghi ở cột "Học từ".

**Cỡ:** **L** = lớn (nhiều lát hoặc migration lớn) · **V** = vừa (một lát) · **N** = nhỏ, kẹp vào lát gần nhất.
**P0** = phải xong trước khi ghi thẻ cho khách trả tiền.
Mọi lát chạm trang khách hay marketing phải qua [`google-policy.md`](google-policy.md). Làm xong lát nào thì gạch và ghi commit.

## A. Sẵn sàng — agent làm được ngay, theo thứ tự

| # | Lát | Cỡ | Học từ | Ghi chú |
|---|---|---|---|---|
| A1 | ~~**Chặn bot và giới hạn tần suất** cho API trang khách~~ **xong 20/09** (`94c825e`, migration 018): ba tầng đếm (phiên · thẻ · địa chỉ) cộng tín hiệu thời gian, gắn cờ và loại khỏi số liệu thay vì từ chối khách; trần tuyệt đối gấp 10 lần mới từ chối | V | AWS WAF, Telegram | P0. Còn lại: dọn dữ liệu bot đã lọt, và chặn ở tầng CDN khi có Cloudflare (B4) |
| A2 | ~~**2FA bắt buộc cho admin**~~ **xong 20/09** (`155697f`, migration 019): cưỡng chế ở `authorizeAdmin` chứ không ở trang, 10 mã dự phòng dùng một lần, bí mật mã hoá bằng `NFC_TOTP_KEY` | V | Telegram | P0 |
| A3 | ~~**Dọn mã cũ**~~ **xong 26/09** (migration 028): trang khách đời cookie, dashboard đời `owner_sessions`, trang demo `/t/demo` + `/demo/dashboard`, `lib/demo-store.ts`, `server/auth.ts`, route `/api/owner/[shop]` và `/api/shops` đã gỡ; cờ tắt giờ là **404**, không còn đường lùi. `/` thành một trang tĩnh ngắn (trước là demo 4Râu). 028 xoá bốn bảng đời cũ, view `shop_profile`, cột `hero_*`, và shop giả `caphe-demo` (chỉ khi không còn gì trỏ tới). **Không xoá `app/api/v2`** | V | — | Còn lại là **A3b** ngay dưới |
| A3b | **Một đường trang khách**: bỏ chế độ "lượt ghé v2 mà không publishing" (`/api/v2/shops/<slug>/…`, `visitV2Api`, nhánh không `resolve` trong `server/visit-v2-api.ts`, nhánh không `render` trong `visit-fetch-transport.ts` / `page-events.ts`). Production và preview đều chạy publishing; chế độ này chỉ còn harness `public` dùng. Kèm dọn CSS đời cũ trong `app/globals.css` | V | — | Không migration. Phải viết lại harness `public-v2` + `browser-hardening` chạy trên trang đã phát hành, và phần API của `visit-v2-api.spec.ts` |
| A4 | ~~**CI chạy đủ 7 bộ** trên GitHub Actions~~ **xong 20/09** (`.github/workflows/ci.yml`: 4 job, Postgres 55439 UTF-8, ma trận harness) | V | AWS Well-Architected | P0. Còn lại: **Tài bật bảo vệ nhánh `main`** (mục F5) sau khi thấy CI xanh |
| A5 | ~~**Trang pháp lý bản nháp** + **nút để khách tự xoá dữ liệu** trên trang khách~~ **xong 21/09**: `/quyen-rieng-tu`, `/dieu-khoan`, dòng chân trang, câu cạnh ô số điện thoại; xoá giờ phủ mọi phiên của cùng trình duyệt trên cùng thẻ. Tài chốt 21/09: **không banner, không popup** — chân trang một dòng chữ nhỏ, một câu cạnh ô số điện thoại, hai trang tĩnh. API xoá đã xong ở lát B (021) | V | — | **P0 cuối cùng.** Luật sư duyệt ở C2 |
| A6 | ~~**Nén ảnh ngay trên trình duyệt** trước khi tải lên~~ **xong 20/09** (`fb58859`): `lib/client/shrink-image.ts`, poster ≤1600px, ảnh đại diện ≤512px, WebP; đo được 753 KB → 144 KB. **Phần "nhiều cỡ cho poster/logo" chưa làm** — nó đổi hình dạng `PageConfig` đã phát hành và cách trang khách chọn ảnh, nên là lát riêng | V | Canva | P0 |
| A7 | ~~**Hướng dẫn tuân thủ Google cho shop** trong dashboard + khi bàn giao shop; **test bảo vệ luật cứng**~~ **xong 26/09**: test luật (Astra `4c47be8`), nhãn nút cố định (F-013, 21/09), **nút Google chỉ dẫn tới Google** + không tham số điền sẵn, trang in `/huong-dan-google`, khung luật trong dashboard, nhắc ở khung bàn giao `/gov` (`google-policy.md` mục 3c) | V | — | P0. Còn: luật 8/10 khi A16/C1 có thật |
| A8–A10 | **Đọc dòng sự kiện hành vi** — gộp một: bộ số liệu chuẩn, bảng tổng hợp theo ngày, so sánh bản phát hành. Nền đã có (migration 020, lát mục 7). **Chỉ làm khi đã có khách thật**; xây bảng phân tích trên giếng rỗng là đúng cái sai Tài đã chỉ ra | V | Netflix | Sau A5 và sau khi ghi thẻ |
| A9 | **Bộ số liệu chuẩn + bảng tổng hợp theo ngày** (lượt chạm, tỷ lệ bấm Google, tỷ lệ góp ý, sao trung bình, chủ đề đứng đầu); dashboard đọc bảng tổng hợp thay vì quét bảng gốc | V | Netflix | Tốc độ dashboard khi nhiều dữ liệu · **Dời (Tài 26/09): làm sau khi mọi thứ khác ổn, brainstorm lại** |
| A10 | **So sánh bản phát hành** (A/B tự nhiên): bản thiết kế nào cho tỷ lệ bấm Google, góp ý cao hơn | V | Netflix | Sau A8, A9 · **Dời (Tài 26/09): làm sau khi mọi thứ khác ổn, brainstorm lại** |
| A11 | **Danh sách phiên đăng nhập** + đăng xuất máy khác | V | Telegram | |
| A12 | **2FA cho chủ shop và thành viên** (tuỳ chọn, rồi chủ shop bắt buộc) | V | Telegram | Sau A2 |
| A13 | **Gán người phụ trách** + cờ **"đã liên hệ khách"** cho mỗi phản hồi (thay trạng thái đã bỏ bằng tín hiệu nhẹ) | V | Salesforce | Có migration |
| A14 | **Quy tắc tự động** trong dashboard: 1–2 sao hay có số gọi lại → chuông báo ngay cho người phụ trách | V | Salesforce Flow | Sau A13 |
| A15 | **Lưu bộ lọc** ("danh sách lưu") trong Dữ liệu | V | Salesforce list views | |
| A16 | **"Hôm nay ở quán"**: thẻ nội dung chủ shop đăng trên trang khách (sự kiện, món mới, trò "săn"), có hạn hiển thị | L | — | Ý tò mò của Tài, [`ideas-curiosity.md`](ideas-curiosity.md). Qua `google-policy.md` |
| A17 | **CSP đầy đủ** cho mọi trang, cả trang khách | V | Telegram | |
| A18 | **Mã hoá cột số điện thoại** khi lưu | V | Telegram | Cần một khoá môi trường mới (Tài thêm) |
| A19 | **Hệ thiết kế**: token màu, chữ, khoảng cách; thành phần nút, ô nhập, thẻ, hộp nổi; gom 3 thế hệ CSS về một | L | Salesforce Lightning, Canva | Bẫy `.app label/button` đã gây lỗi 3 lần |
| A20 | **Onboarding "3 bước bắt đầu"** + màn trống có hướng dẫn | V | Salesforce, Canva | |
| A21 | **`/gov`**: tìm kiếm shop, số liệu nền tảng (shop, thẻ đang hoạt động, doanh thu tháng, rời bỏ), bảng dùng được trên điện thoại | V | Salesforce | |
| A22 | **Mẫu giao diện theo ngành** (cà phê, spa, quán ăn) | V | Canva | |
| A23 | **Dọn tệp R2 mồ côi** | V | AWS | |
| A24 | **Dashboard tiếng Anh** | V | — | Tên mục đã chốt: Review Landing Pages |
| A25 | **Tài liệu cho đội ngũ**: ADR (mỗi quyết định một tệp), sổ tay vận hành, hướng dẫn người mới; giữ `operations-gotchas.md` | V | AWS | Để đội ngũ tiếp quản khi không còn agent |
| A26 | **PWA + thông báo đẩy** trên điện thoại cho chuông | V | Salesforce Mobile | |

| A27 | ~~**`DESIGN.md` + `PRODUCT.md`**~~ **xong 22/09** (`1b5e6de`): — sản phẩm phải trông và cư xử như thế nào, viết bằng markdown để cả agent lẫn công cụ thiết kế đọc được | N | Google Stitch | **Lát kế tiếp.** Không dependency, không migration |
| A28 | **Hệ áo khoác trang khách** — *một phần xong 22–23/09*:: `PageConfig` v3 lưu `coat: '<tên>'`, một bộ token cho mỗi áo, test giữ bốn sàn cho **từng** áo | L | — | `decisions.md` mục 9. Thay phần lớn A19 ở phía trang khách |
| A29 | ~~**Dựng trọn áo đầu tiên trong repo**~~ **xong 23/09** (`5f80321`, khuôn `ap-phich`, bố cục biên tập lệch trái):, đầy đủ tính năng, xem trên preview | V | — | Không clone logic; chỉ thay lớp trình bày |
| A30 | **Cửa duyệt ảnh shop**: bảng ảnh có trạng thái, `validateConfig` chỉ nhận ảnh đã duyệt, hàng chờ duyệt trong `/gov` | V | — | **Có migration.** `decisions.md` mục 10. Rủi ro pháp lý nếu không làm |
| A32 | ~~**Tách nội dung khỏi khuôn**: `shop_profile` + ghép lúc đọc~~ **xong 23/09** (`5375358`, migration 022). Nội dung thuộc tài khoản, diện mạo thuộc khuôn; đổi khuôn không mất dữ liệu | V | — | 7 bộ xanh. `decisions.md` mục 11 |
| A33 | **Sáu khoá khuôn**: `templateConfig(key)`, sáu hàng `template_versions`, ô chọn khuôn trong `/gov` lúc tạo shop | V | — | **Xong 23/09.** Bộ xương thôi, chưa diện mạo |
| A36 | **Dựng lại lớp da**: token `--c-*`, `--c-floor`, hai luật dùng chung (quãng cuộn dư · nút máy bay bất biến) trên `.guest[data-template]` | V | — | **Xong 23/09.** `components/skin.css` |
| K6 | **Khuôn 6 · Nút lớn**: diện mạo + chuyển cảnh 300ms cùng tab | V | — | **Xong 23/09** |
| M23 | **Cửa duyệt ảnh** (migration 023): chặn ảnh chưa duyệt lúc phát hành, hàng chờ ở `/gov` | L | — | **Xong 24/09** (Tài chạy 023 cả hai branch) |
| K1 | **Khuôn 1 · Bản gốc — thẻ trôi**: mép trên mờ dần, nền thở theo cuộn | V | ảnh Tài | **Xong 24/09**. Ý 3 (màu từ ảnh nền) đi với cửa duyệt ảnh |
| K2 | **Khuôn 2 · Tối giản**: thẻ tối, quầng mờ quanh thẻ, link lưới ô đều | V | ảnh Tài | **Xong 24/09** |
| K4 | **Khuôn 4 · Chồng thẻ**: thẻ nghiêng trên thẻ poster, link hàng dọc, nút Google trắng | V | ảnh Tài | **Xong 24/09**. Kéo thả trang trí vẫn là A35 |
| K3 | **Khuôn 3 · Kính**: kính khúc xạ thật, cùng kết quả ở Chrome/Safari/Firefox | V | kube.io | **Xong 23/09** — `thiet-ke-va-khuon.md` mục 15 |
| K7 | **Bản khuôn**: mỗi khuôn một số bản, bản phát hành ghim bản, CSS mỗi bản đóng băng (`components/skins/`), chủ quán tự chuyển bản trong trình chỉnh | V | — | **Xong 25/09**, không migration. `thiet-ke-va-khuon.md` mục 16. Số bản nền tảng `năm.tháng.lần` + nhật ký thay đổi: **chưa** |
| P1 | **Tách quán / trang** (migration 024): `pages` dưới `shops`; link, bản nháp, bản phát hành, thẻ, xem trước, nội dung theo trang; link vĩnh viễn | L | — | **Xong 25/09**, 024 đã chạy cả hai branch Neon. P2–P7 ở `goi-va-trang.md` mục 8 |
| P2 | **Bảng cài đặt theo bản khuôn**: ô có sẵn + ô chung; trình chỉnh đọc bảng; server từ chối ô khuôn không mở | V | — | **Xong 25/09**, không migration. `goi-va-trang.md` mục 11 |
| P3 | **Danh sách trang**: ảnh thu nhỏ, tên trang (025), nhân bản, trang mới từ kho, đổi khuôn, nhập dữ liệu, thẻ theo trang | V | — | **Xong 25/09**, 025 đã chạy cả hai branch, đã lên production. `goi-va-trang.md` mục 12 |
| P4 | **Vòng đời trang** (026): tạm ngừng / đóng, tạm dừng khẩn cấp + báo cáo ở `/gov`, admin mở lại / đóng | V | — | **Xong 25/09**, 026 đã chạy cả hai branch, đã lên production. `goi-va-trang.md` mục 13 |
| P5a | **Hiện giá, chưa thu**: bảng giá khuôn, hai suất miễn phí, giá từng trang + tổng dự kiến, cột `/gov`; bỏ phí thẻ | V | — | **Xong 26/09**, không migration. Phần thu tiền (P5b) chờ Tài quyết. `goi-va-trang.md` mục 14 |
| P1d | **Dọn nợ P1** (027): bỏ `shops.active_release_id`, `shop_profile` → `page_profile` (+ view tạm cho khoảng chờ deploy) | N | — | **Xong 26/09**, chờ Tài chạy 027. Migration sau xoá view `shop_profile` |
| K5 | **Khuôn 5 · Ánh sáng tụ**: nền tối, quầng sáng ở nút Google, chấm nhoè theo khoảng cách | V | — | **Xong 23/09** |
| A34 | **Ba khuôn có tranh** (Hero · Chia đôi · Nhập vai) | V | — | Chờ ảnh của Tài, bản kê ở `anh-can-cho-ao-khoac.md` |
| A35 | **Lớp trang trí có ràng buộc** cho khuôn 4 — kéo thả trong vùng an toàn loại trừ dải CTA, toạ độ theo phần trăm | L | Canva | Bản đầy đủ kiểu bảng trắng **không làm**; xem `thiet-ke-va-khuon.md` mục 12 |
| A31 | **Trang giới thiệu nền tảng** + nhận diện — chỗ duy nhất hiệu ứng nặng của Componentry đáng tiền | L | Componentry | Cần F6. Không đụng trang khách |

## B. Cần Tài làm hoặc quyết trước

| # | Lát | Cỡ | Điều kiện | Học từ |
|---|---|---|---|---|
| B1 | **Sao lưu thật**: Neon gói trả phí (quay ngược 7–30 ngày) + **diễn tập khôi phục** một lần, ghi thời gian | V | Tài nâng gói Neon | AWS |
| B2 | **Bản sao thứ hai mỗi đêm**: `pg_dump` bằng GitHub Actions đẩy ra R2 — **mã xong 26/09** (`docs/sao-luu.md`), chờ Tài tạo tài khoản + secrets rồi chạy thử và diễn tập khôi phục | V | Tài thêm secrets vào GitHub | AWS |
| B3 | **Giám sát lỗi + kiểm tra sống + cảnh báo** về Zalo/email | V | Tài tạo tài khoản dịch vụ giám sát | AWS CloudWatch |
| B4 | **Tên miền `.com` trên Cloudflare** → R2 tên miền riêng (bỏ `r2.dev`), đổi `APP_ORIGIN`, chuyển hướng 308 | V | Tài mua `.com` | Canva |
| B5 | **Email giao dịch**: tự đặt lại mật khẩu, lời mời thành viên, báo đăng nhập mới, **báo cáo tuần** | L | Tài chọn dịch vụ email, cần `.com` | Telegram, Salesforce |
| B6 | **Thanh toán**: ghi sổ thu tay (bảng `payments` đã thiết kế) → VietQR + bot biến động số dư → tự "khoá giữa" khi quá hạn | L | Tài chọn nhà cung cấp bot | SaaS |
| B7 | **Zalo OA**: gửi thông báo cho chủ shop qua Zalo | V | Tài tạo Zalo OA | Salesforce |

## C. Chờ bên ngoài

| # | Lát | Chờ gì |
|---|---|---|
| C1 | **Google Business Profile API**: số đánh giá, số sao theo ngày, ghép ước đoán với lượt bấm Google | Hồ sơ doanh nghiệp xác minh + 60 ngày + Google duyệt quyền API |
| C2 | **Pháp lý đầy đủ**: xác nhận vai "bên xử lý dữ liệu", hồ sơ chuyển dữ liệu sang Singapore, đánh giá tác động, hợp đồng xử lý dữ liệu với shop; duyệt bản nháp A5; khuyến mại cho trò chơi ở A16 | Luật sư |
| C3 | **Kiểm thử xâm nhập** | Astra |
| C4 | **Lưu dữ liệu trong nước** (nếu C2 kết luận cần) | Kết luận C2 |

## D. Chờ quy mô — làm khi có dữ liệu, khách hay đội ngũ

| # | Lát | Khi nào |
|---|---|---|
| D1 | **Kho phân tích riêng** (lakehouse, xem mục "Kiến trúc dữ liệu" dưới) | Dashboard chậm dù đã có A9, hoặc khoảng 200 shop |
| D2 | **Chuẩn ngành ẩn danh** ("quán cà phê quận 1 tối thứ Sáu trung bình 4,3 sao") | Khoảng 30 shop cùng ngành, cùng khu |
| D3 | **AI tóm tắt góp ý** theo tuần, gom chủ đề | Shop có đủ góp ý; tính chi phí API |
| D4 | **Tự đăng ký + dùng thử** | Khi có kênh bán |
| D5 | **API + webhook cho đối tác QR/NFC** | Khi có đối tác đầu tiên |
| D6 | **Chuỗi**: đăng nhập một lần (SSO), bộ nhận diện thương hiệu chuỗi | Khách chuỗi đầu tiên |
| D7 | **"Quanh đây có gì"**: trang gom sự kiện các quán dùng nền tảng (hiệu ứng mạng lưới) | Đủ shop + chính sách nội dung |
| D8 | **Môi trường staging dữ liệu giả, sổ tay sự cố, cảnh báo chi phí** | Khi có người thứ hai trong đội |
| D9 | **Passkey** (Face ID, vân tay) | Sau A12 |

## E. Lặt vặt — kẹp vào lát gần nhất chạm cùng chỗ

| # | Việc |
|---|---|
| E1 | Menu điện thoại chật: nút Đăng xuất rơi hàng riêng |
| E2 | Khung chờ (skeleton) thay chữ "Đang tải…" |
| E3 | Tương phản chữ nhạt đạt WCAG AA |
| E4 | Dùng bàn phím trong popup, hộp nổi, menu ⋮ |
| E5 | Chế độ tối |
| E6 | ~~Đo Core Web Vitals trang khách trên 4G~~ **xong 26/09** ([`toc-do-trang-khach.md`](toc-do-trang-khach.md)): bảy trang production đều "tốt" (LCP 0,6–1,5 s, CLS 0); video nền gắn sau khi trang tải xong, không tải khi máy tiết kiệm dữ liệu — trang có video dùng được từ 2,5 s xuống 2,0 s. Nén video chuyển sang E9 |
| E7 | Nhấn nút ⓘ, "Phản hồi" đủ cỡ chạm 44px trên điện thoại |
| E8 | ~~Hỏi Tài lại câu "Chỉ quản lý của quán thấy số này"~~ Tài giữ nguyên câu hiện tại (21/09) |
| E9 | **Video tải lên cho điện thoại**: chủ quán tải video Full HD / 4K (tới 30 MB) — Tài muốn chiều (26/09). Trang đã không chậm vì nó (E6), nhưng khách tiêu 4G cho cả tệp. Hướng: lúc tải lên, trình duyệt của chủ quán làm thêm một bản nhẹ cho điện thoại (WebCodecs, miễn phí), trang khách chọn bản theo màn hình; kèm nén video mặc định 3 MB. Không dịch vụ trả phí |

## F. Việc của Tài (không phải code)

| # | Việc |
|---|---|
| F1 | Gặp luật sư dữ liệu (C2) và luật sư sở hữu trí tuệ |
| F2 | **Nộp đơn nhãn hiệu** tên và logo nền tảng (nhóm 9, 35, 42), trước khi bán rộng — xem `ideas-curiosity.md` |
| F3 | Neon gói trả phí (B1), mua `.com` (B4) |
| F4 | Xoay mật khẩu đã lộ trong hội thoại: `neondb_owner` mọi branch, admin preview, `yourshop` preview |
| F5 | Bật bảo vệ nhánh `main` trên GitHub sau A4 |
| F6 | Thiết kế nhận diện nền tảng (logo, dấu trên thẻ) cho A16 |
| F7 | Ghi `story.md` / Obsidian về lịch sử hình thành |

**Tổng: 35 (A) + 7 (B) + 4 (C) + 9 (D) + 8 (E) + 7 (F) = 61 mục.** P0 gồm A1–A7 và B1–B4.

## Kiến trúc dữ liệu: vì sao không Cassandra → Hadoop/Hive/Pig → Spark

Tài hỏi 2026-09-20 có nên dựng Cassandra → Hadoop (Hive, Pig) → Apache Spark, và agent hay Astra code được không.

- **Code được**, nhưng **không nên dựng bộ này**. Đó là kiến trúc của những năm 2010, cho dữ liệu cỡ hàng trăm terabyte, và cần một đội vận hành cụm máy toàn thời gian. Chính các công ty lớn đã rời Hadoop/Pig: Netflix chuyển sang **Apache Iceberg** trên kho đối tượng (S3) và truy vấn bằng Spark/Trino; Hive và Pig gần như không còn dùng cho việc mới. Cassandra hợp cho ghi cực nhiều với truy vấn cố định; một nền tảng review ở quy mô vài nghìn shop vẫn nằm gọn trong PostgreSQL.
- **Con đường tương đương, hiện đại và rẻ**, làm dần theo thứ tự:
  1. **Bây giờ:** PostgreSQL (Neon) làm nguồn sự thật; sổ sự kiện không sửa (đã có) + bảng tổng hợp theo ngày (A9) + theo dõi lượt bấm (A8).
  2. **Khi dashboard bắt đầu chậm (D1):** mỗi đêm xuất sự kiện ra **Parquet/Iceberg trên R2** (R2 có sẵn Data Catalog cho Iceberg), truy vấn bằng **DuckDB** hay **ClickHouse**. Đây chính là phần "lưu trữ + xử lý hàng loạt" mà Hadoop/Hive từng làm, không cần cụm máy.
  3. **Khi cần luồng thời gian thực** (hàng triệu sự kiện mỗi ngày): hàng đợi (Kafka hoặc dịch vụ quản lý) → **Spark** hay Flink đọc cùng bảng Iceberg. Lúc đó mới cần kỹ sư dữ liệu.
- Nhờ vậy dữ liệu hôm nay thu đúng cách thì mai chuyển lên kho lớn không phải làm lại: **thứ quyết định là sự kiện được ghi sạch, có định nghĩa, không sửa**, không phải công cụ.
