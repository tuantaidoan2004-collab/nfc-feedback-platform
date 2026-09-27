# Audit trước đợt cải tổ UI/UX — 27/09/2026

Tài hỏi: hệ thống đã sẵn sàng cho cuộc cải tổ UI/UX của trang khách, dashboard, `/gov` và các module template chưa?
Cơ sở đối chiếu: `docs/ui-ux-nguon-tham-khao.md` (nguồn UI/UX, ba ý và tám hướng của Tài, mười quyết định của Claude),
`PRODUCT.md`, `DESIGN.md`, `docs/kien-truc-nen-tang.md`, `docs/google-policy.md`.

**Cách audit (có bằng chứng, không suy đoán):** đọc mã của cả ba bề mặt; chụp dashboard (6 mục) và `/gov` ở 390px và
1280px bằng harness với tài khoản thử trên localhost; thu mọi lỗi console trên các màn chính; đối chiếu sáu template
bằng ảnh Tài chụp trên iPhone; tra điều khoản Vercel và Google tại nguồn (link ở cuối). Ảnh chụp nằm ngoài repo.

## 0. Kết luận

**Nền móng đúng nhánh, nhưng chưa sẵn sàng để cải tổ ngay.** Mảng template đã sẵn sàng (M1). Ba thứ còn thiếu, nếu
cải tổ trước thì phải làm lại:

1. **Hệ thiết kế chung cho dashboard, `/gov` và trang chính.** Hôm nay mỗi bề mặt một bảng màu gõ tay, không có
   component chung. Dashboard "VIP", onboarding kiểu uxpeak và trình chỉnh kiểu Canva đều dựng trên thứ này.
2. **M2 (module hiệu ứng) và M3 (section).** Popup 4 giây, lời cảm ơn, con trỏ màu, sự kiện, video… đều là hiệu ứng
   hoặc section. Trang khách hôm nay là một component 628 dòng, thứ tự khối cố định.
3. **Dọn nền:** đổi "khuôn" → "template" khắp nơi, tài liệu lỗi thời ở mặt tiền repo công khai, và test đang bám
   vào câu chữ (khoảng 300 chỗ) — đổi chữ hàng loạt là đỏ hàng loạt.

Thứ tự đề xuất ở mục 4. Việc hạ tầng gấp (Vercel 29/09) ở mục 1: **không có gì hỏng**, nhưng có một ranh giới luật.

## 1. Hạ tầng — Vercel hết dùng thử 29/09, và "tự chạy trên Mac"

**Tài chốt: xuống gói miễn phí (Hobby).** Tra tại nguồn:

| Điều | Kết quả | Việc phải làm |
|---|---|---|
| Hết dùng thử mà không thêm thẻ | Team **tự về Hobby**, không bị tính tiền, dự án và tên miền giữ nguyên | Không cần làm gì |
| Bị tạm dừng nếu tháng này vượt hạn mức Hobby? | Không: tháng 9 dùng khoảng **0,08 giờ CPU** (hạn 4), khoảng **1,4 GB-giờ** bộ nhớ (hạn 360), 1 triệu lượt gọi hàm | Không |
| Vùng chạy hàm `sin1` | Hobby được **một vùng** — đủ | Không |
| Deploy tự động từ GitHub | Repo thuộc **tài khoản cá nhân** và công khai — Hobby deploy được | Không |
| Log chạy (`vercel logs`) | Pro giữ 1 ngày, **Hobby giữ 1 giờ** | Đọc log lỗi **trong vòng một giờ** (ghi vào `operations-gotchas.md`) |
| Build | Hobby 2 vCPU: build chậm hơn | Không |
| **Luật dùng thương mại** | Hobby **chỉ cho dùng cá nhân, phi thương mại**. Thương mại gồm "quảng cáo bán một sản phẩm hay dịch vụ" và mọi cách thu tiền | **Trước khi trang chính giới thiệu dịch vụ lên production, hoặc trước quán thật đầu tiên — mốc nào tới trước** (đính chính S0: trang chính bán dịch vụ đã là "quảng cáo bán dịch vụ"): chuyển lên Pro (20 USD/tháng) hoặc sang tự chạy (I1). Hôm nay chỉ có shop thử và trang cửa → Hobby hợp lệ |

**Tự chạy trên MacBook Air M5 (16 GB, 500 GB):** chạy được về kỹ thuật — bộ Docker của I1 đã chạy thật trên máy Tài
27/09. **Không nên làm máy chủ production**, vì bốn lý do không liên quan tới sức mạnh máy:

- Máy phải **luôn bật, không ngủ, không gập nắp, không mang đi**; khách quét thẻ lúc 2 giờ sáng cũng phải mở được.
- Mạng nhà thường **không có IP cố định** và nhà mạng hay chặn cổng vào. Lách được bằng Cloudflare Tunnel (miễn phí,
  không mở cổng), nhưng mất điện hay mất mạng là mọi quán cùng tắt.
- Cơ sở dữ liệu nằm trên laptop thì sao lưu thành chuyện sống còn (`sao-luu.md`).
- Dùng làm **máy thử** thì rất hợp: chạy đúng bộ production trên máy mình trước khi đổi chỗ.

**Đề xuất:** ở Hobby tới trước khi trang chính bán dịch vụ lên production (hoặc quán thật đầu tiên). Khi đó chọn **Vercel Pro** (ít việc nhất) hoặc **một VPS nhỏ** chạy
đúng bộ I1 (khoảng 5 USD/tháng; `tu-chay.md`). **Tài chốt**, vì cả hai là dịch vụ trả phí (`AGENTS.md`).

## 2. Mức sẵn sàng từng tầng

| Tầng | Hôm nay | Sẵn sàng? |
|---|---|---|
| **Gói template** | `templates/<khoá>/` + manifest, registry sinh tự động, test kiểm gói (M1) | **Có** |
| **Hiệu ứng** | Kính, nghiêng, chuyển cảnh, video trễ, gợi ý đáy trang: 16 hàm trong `shop-feedback-v2.tsx` | **Chưa** — M2 |
| **Section** | Thứ tự cố định: ngôn ngữ → poster → logo → tên → Google → link → pháp lý | **Chưa** — M3 (migration) |
| **Hệ thiết kế nền tảng** | Trang khách có token (DESIGN.md mục 4). Dashboard: token nội bộ trong `.app` của `owner-app.module.css`. `/gov`: `admin.module.css` gõ tay mã màu, **Arial** | **Chưa** — cần trước mọi cải tổ dashboard/`/gov`/trang chính |
| **Dashboard** | Gọn, nhất quán; 6 mục; một component 429 dòng; mục đang xem **không nằm trên URL** | Một nửa |
| **Trình chỉnh** | Một biểu mẫu dài khoảng 2.800px, không xem trước bên cạnh; chọn template bằng ô thả xuống | **Chưa** — xa "như Canva" nhất |
| **`/gov`** | Chạy đủ việc, nhưng sơ sài nhất | **Chưa** |
| **Trang chính / đăng ký** | **D4a xong 27/09:** trang chính `/` (lập chỉ mục), dựng trang không cần tài khoản `/bat-dau`, QR, 3 câu hỏi; tài khoản vẫn do admin tạo từ link bản nháp | Một nửa — D4b |
| **Test** | 7 bộ xanh, CI xanh; nhưng integration bám câu chữ | Cần luật trước khi đổi chữ |
| **Tài liệu cho người mới** | `AGENTS.md`, `decisions.md` tốt; **mặt tiền repo lỗi thời** | Cần dọn |

## 3. Phát hiện

Mức: **Cao** = khách hay chủ quán thấy sai, hoặc chặn cải tổ · **Vừa** · **Thấp**.

**A1 · Cao · Tiêu đề tab của mọi trang là "NFC Feedback · Bản thử"** (`app/layout.tsx:3`), mô tả là *"bản thử local"*;
trang khách không tự đặt tiêu đề. Khách lưu hay chia sẻ trang quán sẽ thấy chữ "bản thử" thay vì tên quán. Toàn site
đang `noindex` — đúng cho trang khách và dashboard, nhưng **trang chính (D4) phải được lập chỉ mục**, và Tài định dùng
Search Console. Sửa: tiêu đề theo tên quán ở `app/[shop]/page.tsx` và `app/t/[code]/page.tsx`; bỏ chữ "bản thử";
`noindex` đặt theo từng route, không đặt chung.

**A2 · Cao · Mặt tiền repo công khai lỗi thời.** `README.md` còn ghi "chưa có database hoặc deployment", "Repo private",
và chỉ tới `/t/demo`, `/demo/dashboard` (đã gỡ ở A3). `docs/local-development.md` cũng vậy. `START-HERE-ANTIGRAVITY.md`
là bản bàn giao 15/09, kèm đường dẫn máy của Tài. Người đầu tiên đọc repo (coder thuê, người đánh giá) sẽ hiểu sai
toàn bộ. Sửa: viết lại README ngắn, trỏ về `AGENTS.md` và `decisions.md`; viết lại `local-development.md` theo harness
và bộ I1; gỡ tệp bàn giao cũ (lịch sử git vẫn giữ).

**A3 · Cao · Dashboard trên điện thoại** (ảnh 390px): phần đầu chiếm khoảng 180px (tên quán, tài khoản, chuông, dải
menu, nút **Đăng xuất**). 6 mục xếp thành một dải **cuộn ngang ở đỉnh**, bị cắt chữ ("Thiết kế & Li"), vùng chạm
40px. Trái với mục 1d của nguồn UI/UX: điều hướng chính nằm **dưới**, 3–5 mục có nhãn, ≥ 44px; đăng xuất không nằm ở
đó. Đề xuất: thanh dưới 4 mục **Tổng quan · Góp ý · Trang · Thêm** (Hoạt động, Cài đặt, Hồ sơ, Thanh toán, Đăng xuất
nằm trong "Thêm").

**A4 · Cao · Mục của dashboard không nằm trên URL** (`owner-dashboard-v2.tsx:223`, `useState<View>`). Nút Back của
điện thoại thoát khỏi dashboard thay vì về mục trước, và không gửi được link tới "mục Dữ liệu". Chỉ có `?thread=` mở
đúng một góp ý (dòng 304) — đó là nền cho ý "tóm tắt hôm nay có link thẳng tới góp ý". Sửa: mỗi mục một đường dẫn.

**A5 · Cao · Hai hệ kiểu dáng, không component chung.** `owner-app.module.css` (392 dòng) đặt token trong `.app`;
`admin.module.css` gõ tay cùng các mã màu, font **Arial** (dashboard là `system-ui`). Mọi nút ở `/gov` cùng một kiểu
đậm — kể cả **"Mạo danh"**, một thao tác nhạy cảm — nên mắt không phân biệt được việc thường với việc nguy hiểm. Form
"Tạo shop mới" để nhãn **dính sát ô nhập** ("Tên shopCà Phê Ban Mai"); bảng shop trên điện thoại bị ép cột, cột thao
tác trôi ra ngoài màn hình. Sửa: một bộ token nền tảng + khoảng 12 component chung (mục 4, S1).

**A6 · Cao · Trình chỉnh là một biểu mẫu dài**, không có bản xem trước bên cạnh; chọn template bằng ô thả xuống; tên
nội bộ của template hiện thẳng ra cho chủ quán. Đây là chỗ xa đích "kho template như Canva" nhất, và là nơi chủ quán
"quyết định mua trong mười giây" (`PRODUCT.md`).

**A7 · Vừa · Trạng thái trống hiện số 0:** biểu đồ "0 0 0 0 0 0", ô "Đánh giá Google —". Trái với quyết định G
(`ui-ux-nguon-tham-khao.md` mục 5): trạng thái trống là bước đầu tiên.

**A8 · Thấp · Ảnh thu nhỏ của trang** (mục Thiết kế & Link): mỗi khung là một iframe sandbox không cho chạy script, nên
mỗi lần mở mục bắn **7 lỗi console** "Blocked script execution" — lỗi rác che lỗi thật. **Đính chính (S0, 27/09):** bản
đầu của audit viết mỗi khung "tải cả JS"; sai — script bị tắt thì trình duyệt không tải tệp JS ngoài; thứ bị chặn là
các đoạn script **nội tuyến** Next nhúng trong HTML. Sửa cùng lát trình chỉnh (khung thu nhỏ được thay bằng xem trước
sống), không ở S0.

**A9 · Vừa · Nền "bị kéo theo" khi cuộn (Tài 27/09) — nguyên nhân khả dĩ, chưa đo trên máy thật.** Nền khai
`position: fixed` (`guest-page.css:10`), **nhưng template 3 (Kính) đổi nó thành `absolute`** (`templates/glass/v1.css:41`)
nên nền trôi theo trang. Ở các template khác, iPhone kéo giãn cả trang khi cuộn quá đầu/đáy (hiệu ứng nảy), và quãng
cuộn dư `--c-overscroll: 128px` làm nó lộ rõ. Hiệu ứng nảy cũng có thể là thứ làm Chrome iPhone "dính rồi bắt tải lại".
Một hướng sửa có thể giải cả hai lời chê: chặn nảy ở gốc trang khách (`overscroll-behavior`) và cho nền một hiệu ứng
riêng khi cuộn — M4, **thử trên iPhone thật trước**.

**A10 · Vừa · Test bám câu chữ.** Integration dùng `getByRole/getByText/getByLabel` khoảng 300 lần (admin 126,
owner 120, public 31, publishing 21), bên cạnh khoảng 320 móc `data-*`. Cải tổ đổi chữ → đỏ hàng loạt, dễ khiến người
sửa "nới test cho xanh". Luật đề xuất: **giữ tên theo vai trò khi chữ là luật sản phẩm** (nút Google, lời hứa riêng tư,
trang pháp lý); mọi thứ khác bám `data-*`. Mỗi lát cải tổ viết lại test của đúng bề mặt nó chạm.

**A11 · Vừa · Đổi "khuôn" → "template"** (Tài 27/09): khoảng 42 chỗ trong `components` (có chữ trên dashboard và
`/gov`), 31 `lib`, 23 `templates`, 51 trong ba bộ test, khoảng 274 trong `docs`, 29 trong `DESIGN.md`. `DESIGN.md` còn
nói "áo khoác" và `coat: '<id>'` — không còn đúng từ khi template có phiên bản. Làm trọn trong một lát, theo luật "mới
thay cũ".

**A12 · Thấp · Shop thử "Fluty" dùng logo và ảnh Starbucks.** Được với shop thử; **không bao giờ** được xuất hiện
trong ảnh demo, video 3 phút hay trang chính (`DESIGN.md` mục 8).

**A13 · Vừa · `app/globals.css` còn CSS của bản demo đời cũ** (thêm ở S1): `.customer-wrap`, `.phone`, `.stars`, `.metrics`…
áp lên **mọi** trang; `body` dùng Arial và ở chế độ tối nền `body` chuyển xanh rêu. Có quy tắc toàn cục như `.google-button`
nên có thể đang chạm trang khách — dọn cùng M4, có đo trước/sau. Trang nền tảng đã tự phủ nền (`.platform`) nên không dính.

**Tình trạng sau S0–S1 (27/09):** đã xử lý A1, A2, A3, A4, A5, A10, A11 (A1 còn sót một chỗ, sửa ở D4a: `public/robots.txt` vẫn chặn cả site); A8 dời sang lát trình chỉnh; A6, A7, A9, A12, A13
còn theo thứ tự mục 4.

**Đã kiểm, không phải lỗi:** huy hiệu "1 Issue" trên trang đăng nhập khi chụp là của chế độ dev; thu console không
tái hiện, production không có. Cảnh báo "preloaded but not used" chỉ có ở `next dev`.

## 4. Thứ tự đề xuất — một đường thẳng, mỗi bậc đứng trên bậc trước

| # | Lát | Làm gì | Vì sao ở đây |
|---|---|---|---|
| **S0** | **Dọn nền** (V) | Đổi "khuôn" → "template" khắp nơi (A11); tiêu đề theo tên quán, bỏ "bản thử", `noindex` theo route (A1); README, `local-development.md`, gỡ tệp bàn giao cũ (A2); luật test (A10) ghi vào `operations-gotchas.md` | Rẻ, không migration; mọi lát sau viết bằng từ mới |
| **S1** | **Hệ thiết kế nền tảng** (V–L) | Token + component chung: nút (chính · phụ · nguy hiểm), thẻ, ô nhập, chọn, chip, thanh tiến độ, thanh dưới, bảng thành danh sách thẻ trên điện thoại, hộp thoại, thông báo, trạng thái trống. Áp vào `/gov` trước (ít người thấy, sửa A5), rồi dashboard: thanh dưới, mục có URL (A3, A4) | Dashboard VIP, onboarding, trình chỉnh đều dựng trên nó |
| **M2** | Module hiệu ứng | Tách kính, nghiêng, chuyển cảnh; thêm **popup cảm ơn 4 giây → Google tab mới**, tim bung, con trỏ màu của template | Ý 1, ý 3 của Tài đi vào đúng chỗ |
| **M3** | Section (mig) | `PageConfig` v3: danh sách section; poster, link thành section | Mở đường cho sự kiện, video |
| **D4** | Trang chính + dựng trang trước tài khoản | Trang chính (video 3 phút, được lập chỉ mục) → dựng trang không cần tài khoản → **QR thấy trang trên điện thoại mình** → 3 câu hỏi → "Lưu trang của tôi" | Onboarding kiểu uxpeak (mục 1f của nguồn) |
| **P5b-lite** | Tab Thanh toán | Mã QR của Tài + "chụp biên lai gửi Zalo" + dòng thời gian dùng thử; admin bấm "đã nhận" | Tài chốt 27/09: không cổng thanh toán |
| **Dash** | Dashboard "thời tiết của quán" | Tóm tắt hôm nay (mặt cười + link tới góp ý), trạng thái trống thành bước đầu, poster video, cài lên màn hình + thông báo đẩy | Cần S1, A4 |
| **Editor** | Trình chỉnh như Canva + kho template dạng lưới (M5) | Xem trước sống bên cạnh; kho template lưới ảnh lớn (ghi chú trang 40 của Tài) | Cần S1, M3 |
| **M4** | Trang khách cải tổ | Thẻ trượt lên nền đứng yên, bỏ nảy (A9), section Sự kiện (A16) | Cần M2, M3 |
| **C1** | Sao Google của quán | Bậc 1 và 2, mục 5 | Chạy song song khi Tài có đủ điều kiện |

## 5. Sao Google của quán — nói thật cái gì làm được

Tài muốn chủ quán thấy **"hôm nay có 4 người đánh giá mới, 1 người đã xoá bài"**, **miễn phí cho quán**, và chủ quán
không phải biết gì về Google Cloud.

- **Chủ quán không cần Google Cloud.** Họ chỉ bấm "Kết nối Google" → màn hình của Google → chọn hồ sơ quán → xong.
  Phần kỹ thuật là của **nền tảng** (tài khoản Google Cloud của Tài), không phải của quán.
- **Đúng câu "4 mới, 1 xoá" chỉ có ở bậc 2** (Business Profile API, chủ quán cho phép): đọc được toàn bộ đánh giá, so
  với lần trước để biết bài mới, bài sửa, bài biến mất; trả lời ngay từ dashboard. API **miễn phí**. Điều kiện để Google
  cấp quyền cho nền tảng: Tài quản lý **một hồ sơ doanh nghiệp đã xác minh và hoạt động từ 60 ngày trở lên**, có website
  đại diện, rồi nộp đơn. Quyền `business.manage` còn cần Google **xét duyệt ứng dụng** (trang quyền riêng tư đã có;
  **video 3 phút có thể dùng làm video trình diễn**).
- **Bậc 1 (Place ID, Places API)** chỉ cho **điểm trung bình và tổng số đánh giá lúc đang xem**, tối đa 5 bài. **Không**
  biết ai xoá. Điều khoản Google Maps **cấm lưu** dữ liệu này (chỉ Place ID được lưu), nên không được giữ số hôm qua để
  tính "hôm nay +3". Miễn phí tới 1.000 lượt/tháng nhưng đòi thẻ thanh toán trên Google Cloud.
- **Quyết định của Claude:** không làm bậc 1 làm đích; đi thẳng bậc 2. **Việc của Tài, nên bắt đầu ngay vì đồng hồ 60
  ngày là việc lâu nhất:** tạo Hồ sơ doanh nghiệp Google cho chính dịch vụ NFC của mình (dạng doanh nghiệp phục vụ tại
  khu vực, không cần mặt bằng), xác minh, rồi chờ đủ 60 ngày. Trang chính (D4) là website đại diện. Luật 10 giữ nguyên:
  chỉ chủ shop xem, ghi "ước đoán", nhân viên không thấy số Google.

## 6. Việc của Tài

1. **Hồ sơ doanh nghiệp Google** cho dịch vụ NFC — bắt đầu ngay (đồng hồ 60 ngày cho C1).
2. **Màu chủ đạo và nhận diện nền tảng** (F6) — trước S1. Gợi ý: một màu năng động như Tài muốn (kiểu Higgsfield) cho
   dashboard và trang chính; trang khách giữ màu của từng quán.
3. **Mã QR ngân hàng và số Zalo** cho tab Thanh toán — lưu trong cài đặt admin, **không** đưa vào GitHub (`AGENTS.md`).
4. **Kịch bản video 3 phút** (Claude viết nháp khi Tài muốn; dựng bằng HyperFrames).
5. **Search Console:** xác minh tên miền bằng bản ghi DNS, sau khi trang chính được mở lập chỉ mục (A1).
6. **Trước khi trang chính bán dịch vụ lên production:** chọn Vercel Pro hay VPS (mục 1).

## Nguồn

- Vercel: [Hobby plan](https://vercel.com/docs/plans/hobby) · [Pro trial](https://vercel.com/docs/plans/pro-plan/trials) ·
  [Fair use — commercial usage](https://vercel.com/docs/limits/fair-use-guidelines) ·
  [Function regions](https://vercel.com/docs/functions/configuring-functions/region); mức dùng tháng 9 đọc bằng `vercel usage`.
- Google: [Business Profile API prerequisites](https://developers.google.com/my-business/content/prereqs) ·
  [Places data fields and SKUs](https://developers.google.com/maps/documentation/places/web-service/data-fields) ·
  [Places policies (caching)](https://developers.google.com/maps/documentation/places/web-service/policies) ·
  [Maps Platform pricing](https://developers.google.com/maps/billing-and-pricing/pricing).
