# Thiết kế và khuôn — quyết định 22–23/09/2026

Tách khỏi [`decisions.md`](decisions.md) ngày 23/09 để tệp quyết định giữ được cỡ đọc-một-lần. Đây là toàn bộ
phần **giao diện trang khách và mô hình khuôn**. Luật hình thức ở [`../DESIGN.md`](../DESIGN.md); ai dùng sản
phẩm ở [`../PRODUCT.md`](../PRODUCT.md); luật Google ở [`google-policy.md`](google-policy.md) và nó thắng mọi
thứ ở đây.

Đọc tệp này khi làm giao diện hoặc khuôn. Việc khác thì không cần.

---

## 0. Sáu áo khoác dựng thử đã bị xoá (Tài, 23/09/2026)

Ba bản **không tranh** (Thẻ tối · Kính · Xếp lớp), bản **Áp phích**, và ba bản **có tranh** (Hero · Chia đôi ·
Nhập vai) đều là **bản thử để tìm hướng**. Tài chốt bỏ hết: chúng được thay bằng **lát sáu khuôn** ở mục 12.

Đã xoá khỏi mã: `components/coats.css`, `lib/publishing/coats.ts`, `components/coat-viewer.{tsx,css}`,
`app/xem/` và mọi móc `coat` trong `shop-feedback-v2.tsx`. Lấy lại được từ lịch sử git nếu cần tham khảo
(`git show 5f80321 -- components/coats.css`).

**Cái không bị xoá, vì nó là kiến thức chứ không phải kết quả:** mọi nguyên tắc ở `DESIGN.md`, mô hình
khuôn/tài khoản ở mục 11, phạm vi sáu khuôn ở mục 12, hai luật dùng chung ở mục 13, và ba chỗ suýt thủng ở
mục 14. Sáu khuôn mới kế thừa hết.

---

## 9. Thiết kế trang khách — hướng đi chốt 22/09/2026

### Thiết kế trước, tính năng sau

Claude đề xuất, Tài giao quyền quyết và đồng ý. Lý do không phải "đẹp thì tốt", mà là **phép tính chi phí**:

- Gần như toàn bộ tính năng chưa xây (A8–A26) là tính năng **cho nhiều shop**: số liệu tổng hợp, so sánh bản
  phát hành, `/gov` tìm kiếm, 2FA thành viên, gán người phụ trách, quy tắc tự động, lưu bộ lọc, PWA. Production
  đang có **0 shop thật**. Xây bây giờ là đoán, và một tính năng đoán sai đắt hơn một tính năng chưa có: nó phải
  nuôi, phải nằm trong 7 bộ test, phải migrate theo.
- Giao diện thì ngược: chủ quán quyết trong mười giây nhìn trang khách trên điện thoại. Trang khách **vừa là sản
  phẩm vừa là lời chào hàng**, không có bề mặt thứ hai làm được việc đó.
- Và hôm nay đổi giao diện **gần như miễn phí**: 2 shop, 0 thẻ đã in, 0 `PageConfig` của khách thật phải giữ. Sau
  50 shop và 5.000 thẻ đã in thì mỗi lần đổi diện mạo là một cuộc di cư.

Cổng chặn **không** nằm trước thiết kế; nó nằm trước **khách trả tiền**: C3 (cô lập dữ liệu) và sao lưu.

### Kiến trúc Tài mô tả: xương · thịt · da · áo khoác

| Lớp | Là gì | Được đổi không |
|---|---|---|
| **Xương** | DOM của trang khách: nút nào có, theo thứ tự nào, hiện lúc nào | **Không.** Đây là thứ `google-policy.spec.ts` khoá |
| **Thịt** | Hành vi: máy trạng thái lượt ghé, beacon, nút xoá, thẻ góp ý | **Không.** Một bản cài đặt duy nhất |
| **Da** | CSS nền: phần tử nào là cột, phần tử nào là CTA | Chung cho mọi áo |
| **Áo khoác** | Một bó token: màu, bộ chữ, cỡ, tỉ lệ, bo góc, nhịp thở, kiểu nền | **Có.** Đây là chỗ khác nhau |

**Hợp đồng của một áo khoác, một câu:** *áo khoác chỉ đặt token CSS; nó không được thêm, bớt, đổi thứ tự hay làm
chậm bất kỳ nút DOM nào.*

Vì sao câu đó là **toàn bộ cơ chế an toàn**: mọi test Google kiểm **cấu trúc**. Áo khoác không chạm được vào cấu
trúc thì theo cấu tạo, không áo nào phá được các test đó — không nhờ cẩn thận, mà nhờ nó không có đường.

Cái áo khoác **phá được** là phần nhìn. Bốn sàn, đo được, mỗi áo phải qua trước khi vào tủ:

1. Nút Google trọn trong màn hình đầu (640px), không phải cuộn.
2. Tương phản ≥ 4,5:1 cho chữ trên nút · chữ thân · chữ mờ (dòng pháp lý).
3. Nút Google nổi hơn mọi thứ quanh nó — cụ thể là nổi hơn nút góp ý riêng.
4. Áo thêm ≤ 40 KB, không ảnh.

**Hệ quả lên schema, và nó tốt:** `PageConfig` v3 chỉ lưu **một chuỗi** `coat: '<tên-áo>'`, không phải 24 token.
Thêm áo mới **không migrate gì**. Sửa một áo thì mọi shop dùng áo đó đẹp lên cùng lúc. Đi kèm một luật: **sửa áo
chỉ được tinh chỉnh, không đổi căn tính** — muốn đổi hẳn thì đẻ áo mới, tên mới, để không sáng nào chủ quán mở
trang lên thấy quán mình khác hẳn mà không ai hỏi.

### Hình dạng bàn giao Tài cần (chỉnh lại 22/09)

Claude làm sai hai lượt: dựng **công cụ chỉnh** trong artifact. Tài không muốn tự chỉnh — tự chỉnh thì chậm hơn và
ra kém hơn. Tài muốn:

> **Một bản dựng hoàn chỉnh của một phong cách cụ thể, đầy đủ tính năng, nằm trong repo, xem trên preview.**

Nghĩa là: không artifact nữa; code vào dự án; Tài mở preview trên điện thoại và nhìn bản thật. Tài sẽ cấp cho
Claude **quyền truy cập web và quyền đọc repo GitHub** để làm việc này.

**Phong cách đầu tiên: dòng Sentry** (nền tím than, chanh điện, cá tính minh hoạ hơi nghịch). Kèm tập ảnh tham
chiếu Tài gửi: chữ tiêu đề **rất lớn**, có chân, màu nổi đặt đè lên ảnh nền điện ảnh — ngôn ngữ áp phích phim.
Hoạt ảnh nhẹ tính bằng KB, và **có thể thêm vật thể trang trí**.

### Ba căng thẳng thật, phải giải trước khi code

1. **Chữ tiêu đề rất lớn đẩy nút Google xuống.** Áp phích phim mở bằng một màn hình toàn chữ; trang khách thì nút
   Google phải nằm trong màn hình đầu. Không thoả hiệp luật được. Hướng giải: phần điện ảnh chiếm **nền và khối
   nhận diện quán**, còn chiều cao khối mở đầu tính bằng "màn hình trừ đi chỗ của CTA", không phải `100vh`.
2. **Bộ chữ tiêu đề có dấu tiếng Việt.** Các mẫu điện ảnh kia dùng bộ chữ display gần như chắc chắn **không có
   dấu tiếng Việt**, hoặc đặt dấu sai. Tên quán Việt in cỡ 60px mà dấu ngã lệch thì hỏng cả trang. Phải kiểm từng
   bộ chữ bằng chuỗi `Nguyễn Đỗ Quỳnh ẫ ộ ự ỡ ặ ề ố ỷ` trước khi chọn.
3. **"Clone toàn bộ giao diện" dễ đẻ ra nhánh song song.** Đúng cái bẫy A3: hai đường mã, hai chỗ sinh lỗi, không
   ai dám xoá. **Luật: không clone logic.** Máy trạng thái, beacon, xoá dữ liệu, thẻ góp ý giữ **một** bản cài
   đặt; chỉ lớp trình bày được thay. Và 7 bộ test phải chạy cho **mọi** áo, không chỉ áo mặc định.

### Chưa quyết

- Nền tảng dựng giao diện có dùng hay không (Tài nói xử lý sau).
- Tủ áo chốt mấy áo. Claude đề xuất 4–5, phủ cà phê · quán ăn · spa · bar. Nhiều hơn thì chủ quán lại mệt — đúng
  cái Tài vừa chỉ ra.
- Có thêm hoạt ảnh của Componentry vào trang khách không, hay để dành cho trang giới thiệu.

## 10. Ảnh và logo của shop phải qua duyệt trước khi lên trang (Tài, 22/09/2026)

**Tài phát hiện và chốt:** chủ quán có thể tải lên logo của hãng khác đã đăng ký nhãn hiệu, và trang đó nằm trên
tên miền của nền tảng. Nên **bỏ đường tự đăng thẳng**: chủ quán chỉnh poster, logo, vật thể xong thì **gửi admin
duyệt**, duyệt rồi mới lên trang.

**Lý do Tài nêu là đúng, và có một lý do mạnh hơn cần ghi cạnh nó:** nhãn hiệu mới là rủi ro hẹp. Rủi ro rộng là
chủ quán tải lên **bất cứ thứ gì** — ảnh người khác, ảnh phản cảm, quảng cáo của bên thứ ba, nội dung chính trị —
và nó hiện trên một URL công khai dưới tên miền của Tài, cạnh dòng chữ "Đánh giá trên Google". Cửa duyệt đóng cả
hai rủi ro; chỉ nói nhãn hiệu thì sau này dễ nới.

**Chặn ở đâu — quan trọng:** chặn ở **lúc phát hành**, không phải lúc tải lên. Cùng chỗ với hàng rào F-013, vì
đó là nơi shop *ghi*: `validateConfig` chỉ nhận đường dẫn ảnh đã có trong bảng ảnh **đã duyệt**. Chặn ở lúc tải
lên thì gọi thẳng API là đi vòng được.

**Cái phải trả giá, nói trước:**

- **Tài thành nút cổ chai.** Mỗi shop mới phải chờ một người duyệt. Cần nghĩ: trang lên được **ngay** với áo
  khoác và chữ (chưa có ảnh), ảnh về sau — để shop không phải chờ mới có trang.
- Trong lúc chờ duyệt, bản đã phát hành trước đó **vẫn sống**. Không bao giờ để trang khách trống vì một ảnh đang
  chờ.
- `/gov` từ đây có việc thật hằng ngày. Đây cũng là câu trả lời cho "`/gov` sơ sài": nó sơ sài vì chưa có việc gì
  để làm; giờ có.
- Cần migration: bảng ảnh có trạng thái `chờ · duyệt · từ chối` kèm lý do, người duyệt, thời điểm.

### Đã làm — migration 023 (24/09/2026)

- **Bảng `media_assets`**: mỗi lần chủ quán (hoặc hỗ trợ trong phiên thiết kế) xin link tải lên là một hàng `pending`,
  ghi ai xin (`owner:<id>` / `admin:<id>`), loại, cỡ. Từ chối bắt buộc có lý do (`CHECK`), quyết định có thời điểm.
- **Chặn ở `PublishingAdmin.publish`** (`lib/publishing/media-gate.ts`): mọi URL ảnh/video trên trang (poster, ảnh tĩnh
  của poster, logo, nền, ảnh tĩnh của nền) phải là tài sản **đã duyệt của chính shop hoặc của shop khuôn**. Ba câu trả
  lời, vì mỗi câu đòi shop làm một việc khác: `MEDIA_REJECTED` (thay ảnh) · `MEDIA_UNKNOWN` (URL không tải qua nền
  tảng — đóng lỗ cũ: trước 023 bản nháp nhận **mọi** URL https) · `MEDIA_PENDING` (chờ). Trình chỉnh trang nói rõ từng
  trường hợp. Đường dẫn dựng sẵn (`/media/…`) là của nền tảng, không cần duyệt.
- **Trang đang chạy vẫn chạy**: cửa chỉ ở lúc phát hành; không đụng lớp đọc (cùng nguyên tắc F-013).
- **`/gov` → "Ảnh chờ duyệt"**: ảnh/video hiện nguyên hình, cũ nhất trước; Duyệt hoặc Từ chối kèm lý do; mỗi quyết định
  một dòng `admin_audit` (`media.approve` / `media.reject`) cùng transaction. Quyết định là cuối cùng cho lần tải đó —
  muốn đổi thì shop tải ảnh mới.
- **Ảnh đã nằm trên trang trước 023** được migration ghi là đã duyệt (`uploaded_by = 'backfill-023'`), quét bản nháp,
  mọi bản phát hành và hồ sơ tài khoản — không trang nào mất ảnh, không bản nháp nào bị chặn vì ảnh cũ của nó.
- `reviewed_by` **không** có khoá ngoại tới `platform_admins`, có chủ ý: mọi lần phát hành đọc bảng này, kể cả ở nơi
  chưa có bảng admin; người duyệt thật nằm trong `admin_audit` (có khoá ngoại).

**Chưa làm, nói thẳng:**
- **Gỡ ảnh đã lên trang.** Từ chối chỉ áp cho ảnh đang chờ. Một ảnh đã duyệt và đang sống mà sau này thấy sai thì chưa
  có nút gỡ; hiện phải tạm ngưng shop.
- **Tự phát hành khi được duyệt.** Chủ quán phải tự bấm phát hành lại sau khi ảnh được duyệt; chưa có thông báo cho họ.
- **Ảnh đại diện/ảnh bìa tài khoản** (migration 014, hiện trong dashboard, không lên trang khách) không qua cửa này.
- **Hàng chờ có thể bị nhồi**: mỗi lần xin link là một hàng, kể cả khi không tải gì lên. Chưa giới hạn tần suất.

## 11. Khuôn là bộ xương rỗng; dữ liệu và thiết lập nằm ở tài khoản (Tài chốt 23/09/2026)

Tài nêu bằng một ví dụ, và ví dụ đó là toàn bộ mô hình:

> Tài khoản `4raushop` đã có sẵn link dẫn tới trang sao. Khi đăng nhập vào **bản nhân bản rỗng** của khuôn, nó
> **tự động đưa link đó vào xương**, vào nút Google mà trước đó đang rỗng.

Nói cách khác: **khuôn là ổ cắm, tài khoản là phích.** Khuôn chưa có não, chưa có chủ. Đổi khuôn thì chủ quán
không phải gõ lại gì cả.

### Hạ tầng đã có sẵn — không cần cách mạng

Kiểm mã 23/09: cấu trúc này **đã nằm trong database từ migration 002**.

```
template_versions (template_key, version, capabilities)   ← bộ xương, có khoá, có phiên bản
page_drafts  (shop_id, template_version_id, config)       ← tài khoản trỏ tới xương
page_releases(shop_id, template_version_id, config)
```

`lib/publishing/repository.ts:32` chèn `template_key` **bằng tham số**, không hardcode. Chỉ có người gọi
(`provisioning.ts:220`) đang truyền đúng một khoá `TEMPLATE_KEY`. Thêm khuôn thứ hai tới thứ sáu **không đổi một
dòng schema nào**.

### Chỗ lệch duy nhất, và nó là một chỗ trùng lặp

Google URL đang tồn tại **hai bản**:

| Ở đâu | Là gì |
|---|---|
| `shops.google_url` | cột trên bảng tài khoản — **đúng mô hình của Tài** |
| `PageConfig.googleUrl` | một **bản sao** nằm trong draft và trong mọi release |

Và `components/published-page.tsx:8` đọc **bản sao** (`c.googleUrl`), không đọc cột tài khoản. Nên hôm nay, đổi
khuôn = phải chép lại URL vào cấu hình mới. Đó chính là thứ ví dụ `4raushop` cấm.

Cùng bệnh với: `name`, `links`, `logo`, `poster`, `text.question` — tất cả đều là **của tài khoản** nhưng đang
nằm trong cấu hình của khuôn.

### Cách sửa — `schemaVersion 3`, một lát có migration

Cắt `PageConfig` làm đôi theo đúng quyền sở hữu:

| Của **tài khoản** (chủ quán sở hữu, đổi khuôn không mất) | Của **khuôn** (nền tảng sở hữu) |
|---|---|
| `name` · `googleUrl` · `links[]` · `logo` · `poster` · câu hỏi | bố cục · nền · hiệu ứng · màu · watermark · nút góp ý |

Trang khách **ghép hai thứ đó lúc render**, không lưu bản sao. Hệ quả:

- Đổi khuôn = đổi **một chuỗi** `template_key`. Không chép, không gõ lại, không mất dữ liệu.
- Sửa khuôn cho đẹp hơn thì **mọi tài khoản dùng khuôn đó đẹp lên cùng lúc**.
- Nội dung của shop không bao giờ bị khuôn đụng vào.

Chưa quyết: nội dung tài khoản nằm ở đâu — thêm cột vào `shops`, hay một bảng `shop_profile`, hay `shops.profile
jsonb`. Quyết khi làm lát đó.

## 12. Sáu khuôn — phạm vi Tài chốt 23/09/2026

| # | Khuôn | Chốt |
|---|---|---|
| 1 | Bản gốc, sửa vài điểm | — |
| 2 | Tối giản (nền + ảnh đại diện) | chờ ảnh gốc để đối chiếu |
| 3 | Kính lỏng kiểu Apple | CSS đạt ~70% cảm giác; **bắt buộc có bản rút gọn cho Android rẻ** |
| 4 | Thẻ + lớp trang trí | **bản có ràng buộc**, không phải bảng trắng Canva đầy đủ |
| 5 | Hữu hình — ánh sáng tụ vào ô Google, đồ hoạ nhoè dần khi ra xa | hợp luật vì nó làm CTA nổi hơn |
| 6 | Một nút Google khổng lồ giữa trang, hiệu ứng ấn, chuyển cảnh khi rời | **gói cho thuê rẻ nhất** — tiện, ít chức năng. **24/09 Tài chốt lại:** một hạt ngọc G bốn màu, chữ chạy vòng quanh, nền trắng sữa, vệt sáng gương, ánh sáng theo độ nghiêng máy — `DESIGN.md` mục 9 |

**Khuôn là bộ xương, không gắn tài khoản nào (Tài, 23/09, lúc giao A33).** Sáu khuôn chỉ là sáu hàng
`template_versions` với nội dung giữ chỗ (`YOUR SHOP`, link Google chung, không link, không logo, không ảnh). Không
tạo shop hay tài khoản test cho từng khuôn. Cần xem một khuôn có dữ liệu thì **admin đăng nhập vào, đăng xuất là
khuôn tự rỗng lại** — dữ liệu không bao giờ nằm trong khuôn. Mã A33: `templateConfig(key)` · `provisioning.ts`
(`templateKey`, khoá lạ trả `INVALID_INPUT`) · ô chọn khuôn ở `/gov`. Test: `shop-provisioning.spec.ts` (hai ca
A33), `google-policy.spec.ts` (luật Google cho từng khoá), `admin-http.spec.ts` (ô chọn).

**Ba ranh giới đã chốt:**

1. **Khuôn 4 có ràng buộc.** Kéo thả tự do trong **vùng an toàn loại trừ dải chứa nút Google**; xoay −15°…+15°;
   toạ độ lưu theo phần trăm của khung tỉ lệ cố định nên sống sót trên màn 390px. Bốn sàn sống sót *theo cấu
   tạo*, không nhờ cửa duyệt. Bảng trắng đầy đủ chỉ làm khi có khách thật đòi.
2. **Đã làm (23/09):** `effects.leaveTransitionMs` trong manifest của gói (trước M1: `LEAVE_TRANSITION_MS`) khai khuôn nào có chuyển cảnh; khuôn đó mất
   `target="_blank"`. Diện mạo ở `DESIGN.md` mục 9. **Khuôn 6 chấp nhận trả 300ms** để chạy hoạt ảnh trước khi rời trang. Nút phải mở **cùng tab** — `target=
   "_blank"` cộng điều hướng trì hoãn sẽ bị iOS/Android chặn như popup. Và vế *"mây tan rồi hiện ra trang đích"*
   **bất khả thi**: trang Google là tên miền khác, không render dưới lớp mây được. Mây phủ trang mình, rồi
   trình duyệt nhảy sang Google. **Sắp thay (Tài 27/09):** popup đếm ngược khoảng 4 giây trước khi sang Google cho
   template nhiều nội dung (`ui-ux-nguon-tham-khao.md` mục 3, ý 1). Lát làm nó sửa mức 300ms ở đây và trong
   `template-manifest.ts` cùng lúc.
3. **Số link thay đổi thì bố cục vẫn phải đẹp** (Tài, 23/09). Không để flex tự xuống dòng. Mỗi số lượng 1–6 có
   một cách bày được thiết kế sẵn, chọn bằng **quantity query** trong CSS, không JS. Đã làm (`f1a071e`): 1 → một
   viên tràn ngang · 2 → hai nửa · 3 → hai nhãn + một nút tròn · 4 → hai nhãn + hai nút tròn · 5–6 → hàng nút
   tròn. Cỡ chạm 44px giữ nguyên ở mọi số lượng. **Mất cùng `coats.css`, dựng lại ở A36** trong `skin.css`: vùng chạm
   46px, bỏ các độ lệch đường chân (đó là thẩm mỹ của áo thử), và nút tròn **cắt nhãn thay vì `display: none`** — bản
   cũ làm link mất tên với trình đọc màn hình.

## 13. Hai luật dùng chung cho mọi khuôn (Tài chốt 23/09/2026)

Hai thứ này **không thuộc về khuôn nào**. Chúng nằm ở phạm vi `.guest[data-coat]` trong `components/coats.css`
mục A, và không khuôn nào được ghi đè.

> **Dựng lại ở A36 (23/09)**, sau khi mất cùng `coats.css`. Phạm vi giờ là `.guest[data-template]` trong
> `components/skin.css`. A1: bản full-bleed kéo dài tờ giấy (`.guest-sheet`), bản thẻ kéo dài cả trang. A2: nút máy
> bay **giữ nguyên** như ở `guest-page.css` (không lấy lại bản tối góc phải của áo thử); `tests/contracts/skin.spec.ts`
> đỏ nếu bất kỳ khối khuôn nào chạm `.guest-float/.guest-plane/.guest-hint` hay khối Google. Đo lại tại 390×844:
> quãng cuộn ≥ 128px ở cả hai bố cục, dòng mời không hiện sau 2,6 giây đứng yên (`publishing.spec.ts`, ca A36).
> `overflow: clip` trong đoạn dưới **chưa** đặt lại: chưa khuôn nào có trang trí thò ra.

**A1 · Mọi khuôn luôn cao hơn màn hình điện thoại.** `useBottomHint` chỉ hiện dòng mời góp ý sau khi khách
**cuộn hết trang**. Khuôn nào vừa khít màn hình thì "đã cuộn hết" đúng ngay giây đầu, và thanh góp ý bật ra lúc
khách còn chưa đọc xong tên quán. Nên mỗi khuôn chừa sẵn một quãng cuộn: `min-height: calc(100dvh +
var(--c-overscroll, 128px))` trên `.guest-sheet`. Đo tại 390×844: dư quãng cuộn **156px**, khoảng trống dưới chân
trang **128px**, và dòng mời **không hiện lúc mở trang**.

**A2 · Nút máy bay giấy giống hệt nhau ở mọi khuôn.** Khuôn đổi màu, đổi bố cục, đổi hiệu ứng — đường vào góp ý
riêng thì không. Khách quen nó ở quán này phải nhận ra nó ở quán khác. Màu, vị trí, kích thước, con tam giác và
hoạt ảnh đều cố định.

**Một bẫy đã dính khi làm A1:** vòng cung trang trí của khuôn Áp phích thò xuống dưới thân trang **374px**, kéo
trang dài thêm chừng ấy khoảng trống vô nghĩa — đúng thứ A1 muốn tránh lại thành ra thừa. Sửa bằng
`overflow: clip` (không phải `hidden`) trên `.guest[data-coat]`: nó cắt phần thò ra mà **không** biến phần tử
thành khung cuộn và **không** tạo containing block, nên nút góp ý `position: fixed` vẫn neo vào màn hình — đã đo
lại sau khi sửa: nút vẫn cách đáy đúng 18px.

## 14. Ba chỗ suýt thủng khi tách nội dung khỏi khuôn (23/09/2026)

Bảy bộ test bắt được ba lỗi mà đọc mã không thấy. Ghi lại vì chúng là **ranh giới của mô hình**, không phải lỗi vặt.

**① Hồ sơ tài khoản suýt đi vòng qua luật Google.** Tên quán và câu hỏi nằm trong hàng rào `google-policy.md`
(lát F-013: *"tên quán và câu hỏi đi qua cùng một phép kiểm với nhãn link"*). Ghép hồ sơ vào lúc đọc mà không
kiểm lại thì một quán đặt tên *"Đánh giá 5 sao nhận quà"* sẽ lên thẳng trang khách, **không qua cửa phát hành**.
Sửa: `withProfile()` chạy cả `validateConfig` **và** `assertPublishable`; không qua thì bản đã phát hành giữ
nguyên trên trang. `publishing.spec.ts:112` giữ tính chất này.

**② Hồ sơ rỗng suýt xoá sạch link đã phát hành.** Trigger seed hàng hồ sơ với `links = '[]'`. Lớp ghép ban đầu
để cái rỗng đó thắng, nên một quán đã phát hành ba link sẽ **mất hết link trên trang**. Luật đúng: **hồ sơ điền
vào ổ nó có, không bịt ổ nó không có** — trống nghĩa là "chưa cấp", không phải "muốn xoá".

**③ Trình chỉnh trang đứt mạch.** Trình chỉnh ghi tên vào bản nháp; trang khách đọc tên từ hồ sơ. Chủ quán sửa
tên, bấm phát hành, trang khách **vẫn tên cũ**. Sửa: `publish()` ghi phần nội dung xuống `shop_profile` trong
**cùng transaction** với bản phát hành, nên hai bên không bao giờ lệch.

### Hai luật đi kèm, đừng đảo lại

- **`live()` ghép hồ sơ; `preview()` thì không.** Xem trước tồn tại để chủ quán thấy **đúng bản nháp sắp phát
  hành**. Ghép hồ sơ vào đó thì sửa tên xong xem trước vẫn ra tên cũ, và nút xem trước mất nghĩa.
- **Rollback không đổi nội dung.** Nó đổi bản phát hành đang sống, mà nội dung thuộc tài khoản — nên tên quán
  không quay ngược theo. Vì vậy test nào cần bằng chứng *"bản nào đang sống"* phải soi một trường **thuộc bản
  phát hành** (`layout`, `data-schema`), không soi tên quán. Đã sửa ở `publishing.spec.ts` và
  `impersonation.spec.ts`.

### Thứ tự triển khai — bắt buộc

Mã mới `LEFT JOIN shop_profile`, nên **database chưa chạy 022 thì trang khách sập**. Luật 4 trong mục 5 vốn đã
bắt migrate trước khi đẩy `main`; với lát này nó không còn là kỷ luật mà là điều kiện sống.

## 15. Khuôn 3 · Kính — cùng một kết quả ở mọi trình duyệt (Tài chốt 23/09/2026)

**Câu hỏi của Tài:** làm kính lỏng kiểu Apple (bài kube.io) sao cho tốc độ và hiển thị tương đương ở mọi trình
duyệt; không lùi.

**Vì sao không dùng cách của bài kube.io nguyên trạng.** Bài dùng `backdrop-filter: url(#svg)`: **chỉ Chrome chạy**.
Mọi trình duyệt trên iPhone là WebKit; bản vá WebKit (PR #68614) còn mở, và kể cả khi nhận thì nó vẽ bằng CPU.
Nó còn bắt tính lại bộ lọc mỗi khung hình khi cuộn.

**Cách đã làm — bốn quyết định:**

1. **Tự vẽ thứ nằm sau kính.** Nền khuôn 3 là một *cảnh* do khuôn vẽ từ màu của shop (`--c-c1 --c-c2 --c-angle`,
   trang đặt inline từ `PageConfig`), gồm ba vùng màu và một lớp sọc — kính chỉ trông như kính khi phía sau có chi
   tiết. Mỗi tấm kính (thân trang, từng viên link) mang **bản sao** của cảnh trong `::before`, dịch đúng bằng vị trí
   của nó (`--gx --gy`), rồi áp `filter: url(#nfc-glass-*)` — dạng `filter` thì Chrome, Safari, Firefox đều chạy.
2. **Cảnh cuộn cùng trang** (`position: absolute`, không `fixed`), nên kính và cảnh không trượt qua nhau: bộ lọc chạy
   **một lần**, lúc cuộn trình duyệt chỉ dịch ảnh. `useGlassPlacement` đo lại chỉ khi có thứ đổi cỡ.
3. **Bộ lọc tự dựng bản đồ khúc xạ từ hình dạng tấm kính** (alpha làm mờ = chiều cao kính, độ dốc = độ bẻ), nên một
   bộ lọc hợp mọi cỡ, không ảnh, không script. Hai bộ: `nfc-glass-lg` (thân trang) và `nfc-glass-sm` (viên link).
4. **Một thẻ `<svg>` vô hình** chứa bộ lọc — ngoại lệ duy nhất của luật "áo khoác không thêm nút DOM", Tài chốt
   23/09. Rào: chỉ render cho khuôn khai `effects.glass` trong manifest, luôn là nút cuối của trang, `aria-hidden`,
   `focusable=false`, ẩn bằng cỡ 0 (không `display: none` — Safari bỏ qua bộ lọc trong phần tử đó). Test
   `google-policy.spec.ts` giữ: khối lời mời Google giống từng byte với khuôn khác.

**Nút Google không phải kính** (DESIGN.md mục 6b): nút đặc, xanh lam `--c-brand`. Mọi thứ quanh nó trong suốt nên nó
càng nổi.

**Chữ đọc được trên mọi màu shop chọn:** lớp sương `::after` (màu giấy, độ đục `.82`) nằm giữa tấm kính; viền 14px để
lộ phần khúc xạ. `skin.spec.ts` tính tương phản của chữ trên lớp sương khi phía sau là **đen tuyền** và **trắng tuyền**;
hạ độ đục xuống `.6` thì test đỏ (đã phá thử).

**Đo, 23/09:**

| Phép đo | Kết quả |
|---|---|
| Lệch vị trí bản sao, đo bằng JS trong chính từng lõi, trên trang thật | Chrome **0px** · WebKit **0px** · Firefox **0px** |
| Vùng kính, lệch điểm ảnh so với Chrome (0–255, sau khi bù phần trang dịch 42px vì WebKit vẽ ô chọn ngôn ngữ thấp hơn) | WebKit **3,96** · Firefox **4,41** |
| Cuộn, CPU hãm chậm 6 lần (Chrome), 90 khung | kính p95 **17,6ms** · không kính p95 **17,6–17,8ms** |
| Thời gian tới trang sẵn sàng, cùng điều kiện | kính **1,24s** · không kính **1,11–1,19s** |

Nghĩa là: ba lõi cho cùng một tấm kính, và kính không làm cuộn chậm đi khi CPU bị hãm chậm 6 lần. **Chưa đo trên
iPhone và Android thật** — hãm CPU trên máy Mac không thay được card đồ hoạ của máy rẻ.

**Còn khác, nói thẳng:** Firefox vẽ vệt sáng viền rõ hơn một chút. Chấp nhận — hiếm trên điện thoại.

**Rút gọn:** `prefers-reduced-transparency: reduce` → tấm đặc màu giấy, không bộ lọc, không bản sao. Trước khi JS chạy
(hoặc nếu JS không chạy), tấm kính chỉ là lớp sương — bản sao hiện dần khi đã căn xong (`data-glass`).

**Giới hạn:** kính chỉ bẻ được cảnh của khuôn, không bẻ ảnh hay video của shop. Nền `media` bị bỏ qua ở khuôn 3 (không
tải video). Chủ quán muốn ảnh làm nền thì đó là khuôn khác.

## 16. Bản khuôn — shop giữ diện mạo đã phát hành cho tới khi tự chọn bản mới (Tài giao Claude quyết, 24/09/2026)

**Câu hỏi của Tài:** bản hoàn chỉnh tách khỏi bản thử; khi khuôn có diện mạo mới, khách **được chọn** cập nhật hay
không. Số phiên bản Tài giao Claude quyết.

**Quyết định:**

- **Khuôn có số bản riêng**, số nguyên từ 1 (`versions` trong `templates/<khoá>/manifest.json` từ lát M1, kèm ngày và một câu ghi chú cho chủ quán).
  Số bản nền tảng kiểu `năm.tháng.lần` (vd `26.9.3`) là việc riêng, **chưa làm**.
- **Bản phát hành của shop ghim một bản khuôn.** Bảng `template_versions` (migration 003) và cột
  `page_releases.template_version_id` có sẵn từ đầu, nên lát này **không cần migration**. Trang khách mang
  `data-template` và `data-template-version`.
- **Mỗi bản một tệp CSS đóng băng**: `templates/<khoá>/v<bản>.css` (từ lát M1; trước đó `components/skins/`). Mọi selector trong tệp có dạng
  `.guest[data-template="<khoá>"]:where([data-template-version="<bản>"])`. `:where` không cộng độ ưu tiên, nên trang
  vẽ y như trước khi tách. `skin.css` chỉ còn phần của nền tảng: token mặc định, hai luật dùng chung, cách bày link
  1–6, nút hạt ngọc, thẻ `<svg>` bộ lọc kính.
- **Đổi diện mạo = thêm bản mới**: một mục trong `versions` của manifest và một tệp mới, rồi `node scripts/templates.mjs`. Shop đang chạy không đổi gì.
- **Sửa lỗi, bảo mật, luật Google không phải bản mới**: sửa thẳng tệp của mọi bản đang chạy, vì không shop nào được
  chọn ở lại với trang lỗi hay trái luật Google. Sửa như vậy thì ghi lại mã băm trong `skin.spec.ts` cùng commit, và
  nói rõ lý do.
- **Chủ quán chọn trong trình chỉnh** (khung "Khuôn"). Khung ghi bản nháp đang dùng bản nào và trang khách đang chạy bản
  nào. Mỗi bản có ghi chú và nút "Dùng bản N": nút này chỉ đổi **bản nháp**, sau đó Xem trước và Phát hành như mọi
  thay đổi khác. Muốn quay lại thì bấm bản cũ. Chỉ đổi bản **trong cùng khuôn**; đổi sang khuôn khác là việc khác.
- **Shop mới dùng bản mới nhất** của khuôn được chọn.

**Test giữ:**

- `skin.spec.ts`: mỗi bản có đúng một tệp và mọi tệp đều được trang khách import; selector chỉ nhắm khuôn và bản của
  chính tệp đó; `skin.css` không mặc áo cho khuôn nào; tên `@keyframes` không trùng; **mã băm từng tệp không đổi**
  (bỏ qua chú thích và khoảng trắng).
- `template-versions.spec.ts` (repository): shop chưa đổi bản thì trang khách vẫn chạy bản cũ; xem trước thấy bản
  mới; phát hành xong mới đổi; quay lại được. Từ chối bản không có, bản của khuôn khác, bản nháp đã cũ, và thân
  request sai. Shop mới dùng bản mới nhất.
- `publishing.spec.ts`: cùng shop, cùng cấu hình, chỉ khác bản ghim. Sang bản 2 thì diện mạo của bản 1 không đi theo.

**Chưa đóng băng, nói thẳng:** hiệu ứng nền tảng (`effects` trong manifest: chuyển cảnh, kính, nút hạt ngọc) và khung
trắng (`page`) vẫn theo **khoá**, chưa theo bản. Bản mới nào cần đổi một trong
chúng thì chuyển trường đó vào từng mục của `versions`, ngay trong lát làm bản mới. Nút hạt ngọc là phần của nền tảng,
không thuộc bản của khuôn 6, vì luật Google của nút Google phải giống nhau ở mọi nơi.
