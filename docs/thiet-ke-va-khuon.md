# Thiết kế và khuôn — quyết định 22–23/09/2026

Tách khỏi [`decisions.md`](decisions.md) ngày 23/09 để tệp quyết định giữ được cỡ đọc-một-lần. Đây là toàn bộ
phần **giao diện trang khách và mô hình khuôn**. Luật hình thức ở [`../DESIGN.md`](../DESIGN.md); ai dùng sản
phẩm ở [`../PRODUCT.md`](../PRODUCT.md); luật Google ở [`google-policy.md`](google-policy.md) và nó thắng mọi
thứ ở đây.

Đọc tệp này khi làm giao diện hoặc khuôn. Việc khác thì không cần.

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
| 6 | Một nút Google khổng lồ giữa trang, hiệu ứng ấn, chuyển cảnh khi rời | **gói cho thuê rẻ nhất** — tiện, ít chức năng |

**Ba ranh giới đã chốt:**

1. **Khuôn 4 có ràng buộc.** Kéo thả tự do trong **vùng an toàn loại trừ dải chứa nút Google**; xoay −15°…+15°;
   toạ độ lưu theo phần trăm của khung tỉ lệ cố định nên sống sót trên màn 390px. Bốn sàn sống sót *theo cấu
   tạo*, không nhờ cửa duyệt. Bảng trắng đầy đủ chỉ làm khi có khách thật đòi.
2. **Khuôn 6 chấp nhận trả 300ms** để chạy hoạt ảnh trước khi rời trang. Nút phải mở **cùng tab** — `target=
   "_blank"` cộng điều hướng trì hoãn sẽ bị iOS/Android chặn như popup. Và vế *"mây tan rồi hiện ra trang đích"*
   **bất khả thi**: trang Google là tên miền khác, không render dưới lớp mây được. Mây phủ trang mình, rồi
   trình duyệt nhảy sang Google.
3. **Số link thay đổi thì bố cục vẫn phải đẹp** (Tài, 23/09). Không để flex tự xuống dòng. Mỗi số lượng 1–6 có
   một cách bày được thiết kế sẵn, chọn bằng **quantity query** trong CSS, không JS. Đã làm (`f1a071e`): 1 → một
   viên tràn ngang · 2 → hai nửa · 3 → hai nhãn + một nút tròn · 4 → hai nhãn + hai nút tròn · 5–6 → hàng nút
   tròn. Cỡ chạm 44px giữ nguyên ở mọi số lượng.

## 13. Hai luật dùng chung cho mọi khuôn (Tài chốt 23/09/2026)

Hai thứ này **không thuộc về khuôn nào**. Chúng nằm ở phạm vi `.guest[data-coat]` trong `components/coats.css`
mục A, và không khuôn nào được ghi đè.

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
