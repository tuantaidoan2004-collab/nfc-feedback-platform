# Gói, trang và phiên bản — mô hình Tài chốt 25/09/2026

Buổi brainstorm 25/09 (Claude đề xuất, Tài chọn từng điểm). Tệp này là nguồn cho mọi lát về dashboard nhiều trang, kho
khuôn, tính tiền và phiên bản. Luật Google (`google-policy.md`) vẫn đứng trên tệp này.

## 1. Ba lớp, cập nhật độc lập

| Lớp | Gồm | Cập nhật |
|---|---|---|
| **Nền tảng** | dashboard của quán, app admin, API, database | Một bản cho mọi người, luôn mới nhất, không ai chọn ở lại bản cũ. Số bản `năm.tháng.lần` (vd `26.9.3`) + nhật ký thay đổi |
| **Khuôn** | diện mạo trang khách | Mỗi khuôn có bản riêng (1, 2, 3…); trang ghim bản; chủ quán tự chọn lên bản mới (`thiet-ke-va-khuon.md` mục 16) |
| **Nội dung** | tên, link Google, logo, nút link, poster, dữ liệu góp ý | Thuộc **trang**; đổi khuôn hay đổi bản không mất gì |

Tính năng dashboard ra riêng, không kéo theo khuôn. Sửa lỗi / bảo mật / luật Google ở khuôn thì sửa thẳng mọi bản, không
cho chọn.

## 2. Chỗ nối dashboard ↔ khuôn: bảng cài đặt

Mỗi bản khuôn mang một **bảng cài đặt**: danh sách ô chủ quán được chỉnh (màu, phông, poster, độ trong kính…), mỗi ô có
loại, giới hạn, mặc định. Trình chỉnh **không biết khuôn nào có gì**: nó đọc bảng và tự vẽ ô. Nên:

- Bản khuôn mới thêm ô → trình chỉnh tự hiện ô đó, không sửa dashboard.
- Chỉ khi khuôn cần **một loại ô chưa từng có** (vd kéo thả sticker) mới cần một bản nền tảng; loại ô đó dùng được cho
  mọi khuôn sau.
- Lên bản mới: một hàm chuyển cài đặt cũ sang mới, ô mới lấy mặc định; xem trước rồi mới phát hành.
- **Khuôn 6 có bảng cài đặt rỗng** (Tài: khuôn 6 không có tuỳ chọn chỉnh) — chủ quán chỉ điền nội dung.

Hiện trạng (25/09): trình chỉnh viết cứng một bộ ô chung cho cả 6 khuôn. Phải thay bằng bảng cài đặt **trước** khi có
bản 2 của bất kỳ khuôn nào.

## 3. Quán và trang

Một **quán** (tài khoản: thành viên, quyền, hồ sơ, thanh toán) có **nhiều trang**. Mỗi trang = một link, một khuôn + bản,
bản nháp và bản phát hành, các thẻ NFC của nó, trạng thái riêng, gói riêng.

Dashboard có **danh sách trang**: ảnh xem trước thu nhỏ, link, khuôn + bản, giá ("Miễn phí" / "10k/tháng"), nút Sửa ·
Nhân bản · Tạm dừng · Huỷ.

**Tạo trang mới, hai cách** (Tài):
1. **Nhân bản trang đang chọn** — bản sao đầy đủ (khuôn, cài đặt, nội dung), link mới. Dùng cho phòng VIP / bàn 1 /
   quầy bar đổi poster hay phông.
2. **Lấy pack nguyên bản từ kho** — khuôn trống, chưa có nội dung. Trong trình chỉnh có nút **"Nhập dữ liệu từ trang
   khác"** để chép tên, link Google, logo, nút link từ một trang có sẵn.

Nội dung nằm ở từng trang (không tự đồng bộ giữa các trang). Đổi link Google cho mọi trang một lúc là việc sau, nếu cần.

**Đổi sang khuôn khác** trong cùng trang: được. Giữ link, thẻ NFC, dữ liệu; đổi diện mạo và giá thuê. Xem trước rồi
mới phát hành.

**Thay đổi cấu trúc dữ liệu:** hôm nay một `shop` vừa là quán vừa là trang. Mô hình này tách thành quán → trang. Làm
bây giờ, khi chưa ghi thẻ NFC nào và chưa có khách thật.

## 4. Tính tiền

- **Kho khuôn**, mỗi khuôn một giá thuê/tháng. Hôm nay khuôn 1–5 = **10k/tháng**, **khuôn 6 = 0đ**.
- **Hai suất miễn phí** mỗi quán. Khuôn 6 **không chiếm** suất. Hai suất luôn áp cho **hai trang có phí đang chạy lâu
  nhất**: huỷ một trang được miễn thì trang có phí cũ nhất tiếp theo được miễn **từ kỳ sau**.
- Tiền = tổng giá các trang có phí đang chạy, trừ hai suất miễn phí. Mỗi dòng trong dashboard ghi rõ trang đó miễn phí
  hay bao nhiêu.
- **Huỷ giữa kỳ:** trang chạy tới hết kỳ đã trả → tạm ngừng 30 ngày → đóng. Không hoàn tiền lẻ.
- **Thanh toán giai đoạn đầu:** không dịch vụ trả phí. Khách chuyển khoản theo mã QR ngân hàng; admin bấm "đã nhận" trong
  app admin. Tự động hoá để sau.

## 5. Vòng đời trang và link

**Đang chạy → Tạm ngừng → Đã đóng.**

- *Tạm ngừng* (hết kỳ sau khi huỷ, hoặc chưa thanh toán): khách quét thấy "Trang tạm ngừng"; dữ liệu giữ; gia hạn là
  chạy lại ngay. Kéo dài 30 ngày.
- *Đã đóng*: link trả "không tồn tại"; dữ liệu xoá theo chính sách quyền riêng tư. **Tên link giữ vĩnh viễn, không bao
  giờ cấp lại** — link nằm trong thẻ NFC đã dán; cấp lại thì khách quét thẻ cũ của quán A sẽ vào trang Google của quán B.
- **Nút tạm dừng khẩn cấp** (Tài): chủ quán dừng trang **ngay lập tức** khi có lỗi. Việc này tạm dừng gói của trang đó
  và gửi một báo cáo về app admin; admin quyết định cách xử lý (đền bù bằng gói khác khách chọn — **cách xử lý bàn sau**).

## 6. App admin

Cùng mã nguồn, **tên miền riêng** (vd `admin.<tên miền>`), chặn ở cửa theo tên miền, đăng nhập riêng có 2FA như `/gov`
bây giờ. Quản lý quán, trang, kho khuôn (bản "thử" chỉ admin thấy → "mở" cho khách), xác nhận thanh toán, báo cáo tạm
dừng khẩn cấp, duyệt ảnh.

## 7. Phát hành

- Preview (Neon preview) là bản thử; `main` là production.
- Mỗi lần đẩy `main` = một số bản nền tảng + một dòng nhật ký.
- Khuôn mới / bản khuôn mới vào kho ở trạng thái **thử** (chỉ admin), rồi **mở**.

## 8. Thứ tự lát (Claude đề xuất)

| # | Lát | Migration |
|---|---|---|
| P1 | **Tách quán / trang**: bảng trang dưới quán; link, khuôn + bản, bản nháp/phát hành, thẻ, trạng thái chuyển sang trang — **xong 25/09** (mục 10) | Có, lớn (024) |
| P2 | **Bảng cài đặt theo bản khuôn**; trình chỉnh đọc bảng; khuôn 6 rỗng — **xong 25/09** (mục 11) | Không |
| P3 | **Danh sách trang** trong dashboard: xem trước thu nhỏ, nhân bản hai cách, nhập dữ liệu từ trang khác, đổi khuôn — **xong 25/09** (mục 12) | Nhỏ (025) |
| P4 | **Vòng đời trang**: chạy / tạm ngừng / đóng, link không cấp lại, nút tạm dừng khẩn cấp + báo cáo về admin — **xong 25/09** (mục 13) | Có (026) |
| P5 | **Kho khuôn + tính tiền**: giá từng khuôn, hai suất miễn phí, kỳ tháng, admin xác nhận chuyển khoản | Có |
| P6 | **Số bản nền tảng + nhật ký thay đổi** | Không |
| P7 | **App admin trên tên miền riêng** | Không |

## 9. Chưa chốt

- Cách xử lý báo cáo tạm dừng khẩn cấp (đền bù thế nào) — Tài: bàn sau.
- Đổi từ khuôn 0đ sang khuôn có phí giữa kỳ: tính tiền từ lúc nào.
- Một thẻ NFC có chuyển được từ trang này sang trang khác của cùng quán không.
- Dữ liệu góp ý của trang đã đóng: xoá ngay hay giữ bao lâu (phải khớp trang chính sách quyền riêng tư).
- **Khung "Thẻ NFC" còn ghi cách tính tiền cũ** (5 thẻ gồm trong gói, 8k/thẻ thêm — `lib/owner/cards.ts`
  `cardMonthlyFee`, `commercial-model.md` §3), trái với mục 4. Sửa ở P5 (Tài chỉ ra qua ảnh 25/09).

## 10. P1 đã làm (25/09) — migration 024

- **`shops` là quán** (thành viên, quyền, góp ý, lượt ghé, hỗ trợ, ảnh đã duyệt — cách ly dữ liệu vẫn đứng trên
  `shop_id`, không đổi). **`pages` là trang**: link (`slug`), trạng thái `draft`/`active`, bản phát hành đang chạy,
  khoá lượt ghé. `page_drafts`, `page_releases`, `preview_sessions`, `tags`, `shop_profile` có thêm `page_id`.
- **Nội dung theo trang:** `shop_profile` từ nay một hàng mỗi trang (tên bảng giữ nguyên, xem dưới).
- **Link vĩnh viễn:** trigger cấm xoá trang và cấm đổi link, quán, khoá lượt ghé. Link trùng (không phân biệt hoa
  thường) bị từ chối; tạo quán mới bỏ qua mã đã có trang dùng.
- **Trang cũ giữ nguyên:** mỗi quán có sẵn đúng một trang, cùng link với quán, khoá lượt ghé `direct:shop` — lượt ghé cũ
  và nút "Xoá dữ liệu của tôi" của khách cũ vẫn khớp. Trang tạo sau 024 dùng `direct:page:<id>`; dashboard gọi cả hai là
  "Trực tiếp".
- **Góp ý mọi trang về một dashboard** của quán. Trình chỉnh và thẻ nhận `?page=<link>`; không có thì là trang đầu tiên
  (mọi quán hôm nay chỉ có một trang; danh sách trang là lát P3).
- **Migration chỉ thêm:** mã cũ vẫn đọc được trang khách trong lúc chờ deploy. `shops.active_release_id` thôi được dùng
  (bỏ ràng buộc của nó) và tên bảng `shop_profile` giữ nguyên vì mã cũ còn đọc; cả hai dọn ở một migration sau, khi không
  còn mã cũ nào chạy.
- **Chưa làm (P3):** giao diện danh sách trang, nhân bản, nhập dữ liệu. Hôm nay chỉ có đường trong mã
  (`PublishingAdmin.createPage`) và test.

## 11. P2 đã làm (25/09) — bảng cài đặt, không migration

- **Bảng nằm cùng bản khuôn** (`TemplateRelease.settings` trong `lib/publishing/versions.ts`; loại ô ở
  `lib/publishing/settings.ts`). Hai loại: **ô có sẵn** (bố cục · nền kèm kiểu nền nhận · watermark · nút góp ý) và **ô
  chung** khuôn tự khai (màu · thanh kéo · lựa chọn · bật/tắt), lưu ở `config.settings`.
- **Bản 1 của sáu khuôn mở** (Claude chọn theo những gì CSS của từng khuôn thật sự dùng — Tài đổi được, chỉ là dữ liệu):

  | Khuôn | Ô mở |
  |---|---|
  | 1 · Bản gốc | nền (một màu, chuyển màu, ảnh/video) · watermark · nút góp ý |
  | 2 · Tối giản | nút góp ý |
  | 3 · Kính | nền (một màu, chuyển màu — cảnh kính vẽ từ hai màu này) · nút góp ý |
  | 4 · Chồng thẻ | nút góp ý |
  | 5 · Ánh sáng tụ | nút góp ý |
  | 6 · Nút lớn | không ô nào (Tài) |

  Không khuôn nào mở **bố cục**: cả sáu được thiết kế cho trang tràn màn hình.
- **Trình chỉnh chỉ vẽ ô khuôn mở**; khuôn không mở ô nào thì hiện một dòng "chỉ cần điền nội dung". Nội dung (tên, link
  Google, poster, logo, nút link) luôn mở.
- **Server là cửa:** đổi một ô khuôn không mở → `SETTING_LOCKED`; giá trị ô chung sai (không có trong bảng, sai kiểu,
  ngoài khoảng, lệch bước) → `INVALID_SETTING`, cả lúc lưu lẫn lúc phát hành. Giá trị cũ có từ trước bảng thì **giữ
  nguyên**, để trang vẫn lưu được nội dung.
- **Đổi bản:** giá trị ô chung còn hợp thì giữ, ô mới lấy mặc định, ô không còn thì bỏ.
- **Trang khách:** màu và số thành biến CSS `--s-<khoá>`, lựa chọn và bật/tắt thành `data-s-<khoá>` trên `main`.
  `validateConfig` chỉ nhận khoá ngắn và giá trị an toàn (màu `#RRGGBB`, số, true/false, chữ thường-số-gạch), tối đa 16.
- **Cách thêm một ô vào khuôn:** làm bản mới (mục 16 của `thiet-ke-va-khuon.md`), khai ô trong `settings` của bản đó, và
  tệp CSS của bản đó đọc `var(--s-<khoá>, <mặc định>)` hoặc `[data-s-<khoá>="…"]`. Test hợp đồng bắt CSS đọc ô không khai
  hoặc thiếu giá trị dự phòng. **Chưa khuôn nào có ô chung**; đường này mới được thử bằng bản 2 giả trong test.

## 12. P3 đã làm (25/09) — migration 025

- **Khung "Trang"** đầu mục Thiết kế & Link: mỗi trang một dòng — ảnh thu nhỏ, tên (chỉ chủ quán thấy; cột `pages.label`,
  migration 025), link, khuôn + bản, "Đang chạy"/"Chưa phát hành". "Sửa trang này" đưa trình chỉnh **và** thẻ NFC sang
  trang đó; thẻ mới thuộc trang đang chọn, bảng thẻ có cột Trang.
- **Tạo trang** (chỉ chủ quán, vì mỗi trang là một gói): **Nhân bản** một trang (chép khuôn + bản, diện mạo, nội dung;
  không chép thẻ) hoặc **Trang mới từ kho khuôn** (bộ xương trống, bản mới nhất). Trang mới là bản nháp ở một link mới
  vĩnh viễn; lên trang khách khi bấm Phát hành như mọi thay đổi. Đổi tên trang: ai có quyền thiết kế.
- **Trình chỉnh:** "Đổi sang khuôn khác" (chỉ chủ quán) giữ nội dung, lấy diện mạo bộ xương của khuôn mới và ô chung ở
  mặc định; "Nhập dữ liệu từ trang khác" chép tên, link Google, câu hỏi, nút link, logo, poster vào bản nháp — chưa lưu,
  chủ quán xem rồi bấm Lưu nháp.
- **Ảnh thu nhỏ** là chính trang đó vẽ tĩnh trong một iframe (`/ZZZ/<quán>/thumb/<trang>`, `sandbox` không cho chạy
  script): bản nháp, chỉ người có quyền thiết kế xem được, **không ghi lượt ghé**, không chạy video. Kính của khuôn 3
  cần JavaScript để căn nên trong ảnh chỉ hiện lớp sương. Chỉ app này được nhúng nó (`frame-ancestors 'self'`); mọi
  trang dashboard khác vẫn cấm nhúng.
- **Ghi của dashboard mang trang trong thân JSON** (`page`), đọc thì `?page=` — xem gotcha "lỗi `?page=` của P1".
- Khung "Khuôn" không còn bị bóp hẹp (mỗi bản một dòng).

## 13. P4 đã làm (25/09) — migration 026

- **Bốn trạng thái**, chỉ đi theo đường vẽ sẵn (trigger): nháp → đang chạy ⇄ tạm ngừng; mọi trạng thái → đóng; đã đóng
  thì không đổi gì nữa (kể cả tên, bản phát hành, thẻ mới).
- **Tạm ngừng:** link và mọi thẻ của trang hiện "Trang tạm ngừng" (không có nút Google, vì không có trang); khách đang mở
  trang không ghi thêm được gì; dữ liệu giữ nguyên. Chủ quán vẫn sửa, xem trước và phát hành được — bản mới chờ tới lúc
  mở lại. Ba lý do: chủ quán dừng khẩn cấp · admin dừng · gói hết hạn (để P5 dùng).
- **Tạm dừng khẩn cấp** (chỉ chủ quán): nút ở dòng trang, bắt ghi ngắn lỗi gì → trang dừng ngay và một báo cáo vào
  `/gov` ("Báo cáo tạm dừng"). Chủ quán **tự mở lại** được lần dừng của mình; lần dừng do admin hay do gói thì không.
- **Admin ở `/gov`:** thấy báo cáo (quán, trang, lỗi chủ quán ghi, trạng thái trang); "Mở lại trang"; "Đóng trang" (gõ
  đúng mã trang để xác nhận); "Đã xử lý" kèm ghi chú đã làm gì. Xử lý báo cáo **không** tự mở trang. Mọi việc vào
  `admin_audit`. **Cách đền bù vẫn chưa chốt** — ghi chú là chỗ ghi lại.
- **Đóng:** link và thẻ trả **404**; không mở lại được; link không bao giờ cấp lại. **Dữ liệu chưa xoá** — bao lâu thì xoá
  vẫn ở mục 9. Hôm nay chỉ admin đóng được; "Huỷ gói → hết kỳ → tạm ngừng 30 ngày → đóng" là P5.
- Dashboard mở mặc định trang đầu tiên **chưa đóng**.
