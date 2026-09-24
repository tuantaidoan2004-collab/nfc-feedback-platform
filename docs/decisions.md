# Sổ quyết định — dự án NFC

Tệp này trả lời **vì sao** sản phẩm được xây như đang xây, và **cái gì phải có trước cái gì**. Lịch sử theo ngày ở
[`decisions-archive.md`](decisions-archive.md). Luật cứng về Google ở [`google-policy.md`](google-policy.md) và nó
**thắng mọi thứ trong tệp này**. Bẫy đã dính ở [`operations-gotchas.md`](operations-gotchas.md). Đường vào
production ở đầu [`production-launch.md`](production-launch.md).

## 1. Sản phẩm này là gì

Khách chạm thẻ NFC ở quán → mở một trang của quán đó → thấy **lời mời đánh giá Google giống hệt nhau với mọi
khách**, và **thêm** một đường góp ý riêng cho quán. Không bao giờ chọn lọc khách, không bao giờ đổi quà lấy đánh
giá. Đó là ranh giới sản phẩm, không phải lựa chọn kỹ thuật.

## 2. Dữ liệu để làm gì — thứ chưa từng được viết xuống

Tài nêu 21/09/2026, và đây là chỗ nhiều lát vừa qua đi lệch:

> Mục đích lưu dữ liệu là cho **engine** sau này: **behavioral data, QoE, content metadata**. Dữ liệu bề nổi chỉ
> để chủ shop xem lại.

Nói cách khác, dữ liệu có **hai người dùng, hai cấp độ**:

| Cấp | Dữ liệu | Cho ai | Hiện trạng |
|---|---|---|---|
| **1 · Bề nổi** | lượt chạm, sao, lời nhắn, số gọi lại | chủ shop xem lại | **Đã có** |
| **2 · Hành vi** | khách làm gì trên trang, theo thứ tự nào, mất bao lâu, bỏ cuộc ở đâu | engine cải tiến nền tảng | **Chưa có gì** |

**Hệ quả quan trọng nhất trong cả tệp này:** dữ liệu cấp 2 **không thể lấy lại được sau**. Một ngày production
chạy mà không ghi hành vi là một ngày lịch sử mù, vĩnh viễn. Mọi thứ khác trong sản phẩm đều sửa lại được; cái này
thì không.

## 3. Cách xây — luật Tài chốt 21/09/2026

**Tư duy từ gốc, nâng cấp tuyến tính.** Mọi thứ bắt đầu ở cấp cơ bản rồi nâng dần. **Được phép nhảy vọt, nhưng
phải đúng nhánh đã chọn.** Không làm lát rời rạc.

Sai lầm cụ thể đã xảy ra, ghi lại để không lặp: nền dữ liệu mới ở **cấp 1**, nhưng đã nhảy sang hỏi *"giữ dữ liệu
bao lâu rồi xoá"* — tức là mặc định coi nền dữ liệu đã xong. **Chưa xong.** Nên lát xoá dữ liệu quá hạn **bỏ**, để
lại tới khi cách thu thập lên được cấp có giá trị thật (Tài, 21/09).

**Đừng đánh đổi tốc độ lấy thêm lớp bảo mật** khi lớp đó không chặn thứ gì đang thật sự hở (Tài, 21/09). Bảo mật
đã làm: 2FA admin, cô lập shop, chặn bot trang khách, hàng rào chính sách Google. Đủ cho giai đoạn này.

## 4. Bốn nền móng, và cấp độ hiện tại

Mỗi nền móng chỉ được nâng lên cấp sau khi cấp dưới nó đứng vững. Đây là thứ thay cho danh sách 26 lát rời rạc.

| Nền móng | Cấp hiện tại | Cấp tiếp theo nghĩa là gì | Chặn cái gì phía sau |
|---|---|---|---|
| **Trang khách** | Chạy thật, đúng luật Google (có hàng rào CTA), chặn bot, nén ảnh, phát sự kiện hành vi | Tốc độ trang khách và nhiều cỡ ảnh. (Trang pháp lý + nút tự xoá: **xong ở A5**, 21/09) | Không còn P0 nào chặn việc ghi thẻ |
| **Dữ liệu** | **Cấp 2 — dòng sự kiện đã thu** (21/09, migration 020) | Đọc nó: bộ số liệu chuẩn, bảng tổng hợp, so sánh bản phát hành (A8/A9/A10 gộp làm một) | Chặn engine và mọi số liệu so sánh. **Chưa đáng đọc khi chưa có khách thật** |
| **Quản trị `/gov`** | Sơ sài: tạo shop, cấp link. Có 2FA bắt buộc | Điều hành thật: tìm, xem, số liệu nền tảng | Chờ **dữ liệu thật** chảy vào, không chỉ chờ bảng có sẵn |
| **Vận hành** | CI 7 bộ, production chạy từ `main` | Sao lưu thật, giám sát lỗi | Cần Tài mở tài khoản dịch vụ |

## 5. Luật cứng — không lát nào phá

1. `google-policy.md` **thắng mọi yêu cầu khác**.
2. Một bên tích hợp: Claude giữ nhánh và việc đẩy `main`; Astra rà trên nhánh riêng. Kênh chung là
   [`agents-board.md`](agents-board.md).
3. Cuối mỗi lát chạy **đủ 7 bộ test trên commit trong worktree tạm**, đưa Tài kết quả nguyên văn.
4. **Có migration thì không push** cho tới khi Tài chạy trên Neon production rồi preview.
5. Ghi **mọi lỗi, kể cả của agent**, vào `operations-gotchas.md`.
6. Tài tự làm mọi bước có credential.
7. Trước mỗi lát nói **effort**; Tài bảo "làm đi" thì làm.

## 6. Còn chưa quyết

- **Dòng sự kiện hành vi trông như thế nào** — bảng gì, ghi lúc nào, giữ bao lâu, ai đọc được. Đây là quyết định
  tiếp theo, mục 7 nói rõ.
- **Ai đọc dòng sự kiện, và đọc ra cái gì** — A8/A9/A10 gộp lại. Chưa đáng làm khi chưa có khách thật.
- **Số điện thoại có hai mục đích khác nhau** (gọi lại vì khiếu nại · sau này có thể là sự kiện/quay thưởng). Hai
  loại **không được** nằm chung một cột, nếu không nền tảng vĩnh viễn không tôn trọng được "tôi chỉ muốn được gọi
  lại". Cần một cột `purpose` ngay từ khi còn một loại. Chưa làm.
- **Xoá dữ liệu quá hạn** — hoãn có chủ ý, xem mục 3.

## 7. Quyết định tiếp theo — dòng sự kiện hành vi, trước khi ghi tấm thẻ đầu tiên

**Claude đề xuất 21/09/2026, chờ Tài chốt.**

Tài nêu `/gov` còn sơ sài, và đúng. Nhưng `/gov` sơ sài là **triệu chứng**, không phải bệnh: nó chẳng có gì để
hiện vì bên dưới chưa có gì. Làm giao diện `/gov` trước là dựng bảng điều khiển trên một cái giếng cạn.

Lý do đi từ gốc, và nó chỉ đúng **ngay lúc này**:

- Production **chưa có shop nào, chưa có thẻ nào, chưa có khách nào**. Tới giờ chưa mất một dòng dữ liệu nào.
- Tấm thẻ đầu tiên được ghi là lúc hành vi bắt đầu xảy ra — và **hành vi không ghi thì mất vĩnh viễn**. Không có
  migration nào lấy lại được.
- Vậy cửa sổ để làm việc này **không tốn gì** đang mở, và nó đóng vào ngày anh đưa tấm thẻ đầu tiên cho một quán.

Và nó gom ba lát đang rời rạc về một nền: **A8** (theo dõi lượt bấm), **A9** (bộ số liệu chuẩn), **A10** (so sánh
bản phát hành) đều chỉ là **ba cách đọc** cùng một dòng sự kiện. Làm nền trước thì ba lát kia thành ba truy vấn;
làm ngược lại thì thành ba hệ thống nhỏ không nói chuyện được với nhau — đúng kiểu rời rạc Tài vừa phê bình.

**Nội dung lát, mức cơ bản nhất chạy được:**

- Một bảng **chỉ ghi thêm**: shop · bản phát hành · thẻ · phiên · lượt ghé · tên sự kiện · thời điểm · một payload
  nhỏ có kiểu.
- Sự kiện cấp cơ bản: **mở trang · bấm Google · mở khung góp ý · chọn sao · gửi · bỏ giữa chừng**. Kèm khoảng thời
  gian giữa các bước — đó chính là QoE. Kèm bản phát hành đang chạy — đó chính là content metadata.
- **Không bao giờ** có nội dung cá nhân trong payload: không lời nhắn, không số điện thoại. Payload là hình dạng
  hành vi, không phải nội dung.
- Ghi theo kiểu **bắn rồi quên**, gộp lô, không chặn thao tác của khách. Pool production chỉ có 3 kết nối.
- Dùng lại cơ chế chặn bot của A1, không dựng cái mới.

**Cái lát này cố ý chưa làm:** không biểu đồ, không `/gov`, không engine. Chỉ là cái giếng. Đọc nó là lát sau.

**Rủi ro thật, nói trước:** thêm một lượt ghi cho mỗi thao tác của khách là thêm tải lên đúng đường nóng nhất của
sản phẩm. Nếu đo ra nó làm chậm trang khách thì phải lùi về ghi ít sự kiện hơn, chứ không phải bỏ chặn bot.

**Sau lát này thì `/gov` mới đáng làm** — lúc đó nó có số liệu nền tảng thật để hiện, chứ không phải một trang
tạo shop.

## 8. Kiến trúc dữ liệu — tính từ gốc, 21/09/2026

Tài nêu mục tiêu: **1000 trang bio đang chạy, dữ liệu trôi mượt, khách không thấy giao diện đơ, mọi thao tác dưới
ba chữ số mili giây** — và hỏi về Spark, Presto, ThingsBoard, hàng đợi tin nhắn, kho dữ liệu lớn.

### Làm phép tính trước, chọn công cụ sau

Rộng rãi: 1000 shop × 200 lượt khách/ngày × 6 sự kiện = **1,2 triệu sự kiện/ngày**.

| | Con số thật | Ngưỡng công cụ bắt đầu có lý |
|---|---|---|
| Ghi trung bình | **14/giây** | |
| Ghi lúc đỉnh (×10) | **139/giây** | Kafka/hàng đợi: **~20.000/giây** |
| Dung lượng | **240 MB/ngày · 88 GB/năm** | Spark: **vài TB** |
| Số kho dữ liệu | **một** (Neon) | Presto: **nhiều kho phải join** |

Cách hai tới ba bậc. Một PostgreSQL nuốt 139 ghi/giây mà không đổ mồ hôi. Thêm Kafka vào lúc này **làm tăng độ
trễ và chi phí vận hành**, không giảm. ThingsBoard là nền tảng IoT — sản phẩm khác, không phải lớp của mình.

**Chốt: chưa dùng Spark, Presto, Kafka, ThingsBoard.** Không phải vì chúng dở, mà vì chúng giải bài toán mình
chưa có. Mục "khi nào dùng" ở cuối.

### Độ trễ không phải bài toán throughput — và thủ phạm đã tìm ra

Đo production 21/09: `x-vercel-id: hkg1::iad1::…` — request vào edge **Hong Kong**, nhưng **hàm chạy ở `iad1`,
Washington DC**. Neon ở **`ap-southeast-1`, Singapore**.

Mỗi lần chạm database là một vòng **Washington → Singapore → Washington, khoảng 250ms**. Một lượt gửi góp ý có
vài truy vấn là mất nửa giây thuần đường truyền.

Điều này **đã đo rồi mà đọc nhầm**: `operations-gotchas.md` ghi login "0,41s nền, **0,25s database**, 1,9s scrypt"
rồi kết luận không phải lỗi hiệu năng. Cái 0,25s đó chính là vòng Thái Bình Dương.

**Việc Tài phải làm, một lần, miễn phí:** Vercel → Project → Settings → Functions → **Function Region → Singapore
(`sin1`)**. Rồi deploy lại. Dự kiến mỗi truy vấn từ ~250ms xuống **vài mili giây**. Đây là thứ đáng giá hơn cả
bốn công cụ trên cộng lại, và không viết một dòng mã nào.

### Hai loại thao tác, hai luật khác nhau

Gộp chung là sai lầm về phân loại:

- **Thao tác có ý nghĩa** (chấm sao, gửi góp ý): **phải chờ xác nhận**. Khách cần biết lời khiếu nại đã được ghi.
  Không được bắn rồi quên. Đường này nhanh lên bằng cách ở gần database, không bằng hàng đợi.
- **Đo đạc hành vi** (mục 7): **không bao giờ được chờ**. `sendBeacon`, gộp lô, mất cũng được. Một sự kiện đo đạc
  rơi mất không ảnh hưởng ai; một lời khiếu nại rơi mất thì có.

### Kiến trúc Kappa bằng đúng thứ đang trả tiền

Một dòng ghi thêm, mọi thứ khác dẫn xuất từ nó — đó **là** Kappa, không cần thêm nhà cung cấp nào:

| Tầng | Dùng gì | Có sẵn chưa |
|---|---|---|
| **Nóng** — ghi | `sendBeacon` gộp lô → một API → một INSERT vào Neon, bảng chia theo tháng | Có |
| **Ấm** — đọc | Bảng tổng hợp theo ngày trong Neon, dashboard đọc bảng này | Có |
| **Lạnh** — kho lớn | Mỗi tháng xuất sự kiện thô ra **R2** dạng nén; Neon chỉ giữ vài tháng gần | **R2 đã trả tiền rồi** |
| **Truy vấn lớn** | DuckDB đọc thẳng Parquet trên R2 khi cần — không cụm, không Spark | Khi cần |

"Lớp lưu trữ dữ liệu lớn" Tài thấy thiếu chính là **R2**, đã có. "Hàng đợi tin nhắn" ở quy mô này là
`sendBeacon` + gộp lô phía trình duyệt. "Công cụ đồng bộ" là một truy vấn tổng hợp chạy định kỳ.

### Khi nào bốn công cụ kia thật sự tới lượt

Ghi số để sau này không tranh cãi bằng cảm giác:

- **Hàng đợi thật (Kafka/Cloudflare Queues):** khi ghi đỉnh vượt **~5.000/giây**, tức khoảng **35.000 shop**.
- **Spark:** khi một truy vấn phân tích không chạy nổi trên một máy — khoảng **vài TB**, tức **20–30 năm** ở tốc
  độ hiện tại.
- **Presto:** khi có **nhiều kho dữ liệu khác nhau** phải join. Mình có một.
- **ThingsBoard:** nếu sản phẩm chuyển sang quản lý thiết bị IoT thật. Thẻ NFC không phải thiết bị — nó là một
  đường link.

**Không cần cài thêm skill nào.** Thứ thiếu không phải kiến thức công cụ mà là **số đo từ production thật**, và
production chưa có shop nào. Lát mục 7 sẽ tự mang theo phép đo đó.
## 9–14. Thiết kế và khuôn → tệp riêng

Toàn bộ quyết định về **giao diện trang khách và mô hình khuôn** (22–23/09) nằm ở
[`thiet-ke-va-khuon.md`](thiet-ke-va-khuon.md), để tệp này giữ được cỡ đọc-một-lần. Tóm tắt một dòng mỗi mục:

| | |
|---|---|
| **9** | Thiết kế trước tính năng; kiến trúc xương–thịt–da–áo khoác; hợp đồng áo khoác |
| **10** | Ảnh và logo shop tải lên **phải qua admin duyệt**, chặn ở lúc phát hành |
| **11** | **Khuôn là ổ cắm, tài khoản là phích** — nội dung ở tài khoản, diện mạo ở khuôn |
| **12** | Sáu khuôn Tài chốt, và ba ranh giới đi kèm |
| **13** | Hai luật dùng chung mọi khuôn: trang luôn dài hơn màn hình · nút máy bay giấy bất biến |
| **14** | Ba chỗ suýt thủng khi tách nội dung khỏi khuôn, và thứ tự triển khai bắt buộc |

## TIẾP TỤC TỪ ĐÂY — cập nhật 2026-09-25

Khối này luôn nằm cuối tệp và **luôn ngắn**. Phiên mới đọc mục 1–8 ở trên rồi khối này; chi tiết ở tệp được trỏ.

### Đang ở đâu

- **Production `https://quitesensational-review-bio.com`**, deploy từ `main`, hàm chạy `sin1`, Neon **001–023** (Tài báo 24/09).
  `main` có khuôn 6 hạt ngọc (24/09). Preview cùng nhánh `feat/local-app-foundation`, Neon cũng đã 022.
- **Chưa ghi thẻ NFC nào, chưa có khách thật.** Đừng suy ra khách thật từ bất cứ đâu.
- Preview có ba shop: `8irrsv53fiva` (*cà phê Dê*, active) · `caphe-demo` (draft) · `pripi01r8e9u` (khuôn).
  Production có `urr6ud`. **Hai branch Neon khác nhau — slug bên này không có bên kia.**
- **Astra dừng**: OpenAI không cho làm C3. C3 (cô lập dữ liệu giữa các shop) **chuyển sang Claude**, chưa làm.

### Sáu áo khoác dựng thử đã bị xoá (Tài, 23/09)

Ba bản không tranh, bản Áp phích và ba bản có tranh đều là bản thử tìm hướng; chúng được thay bằng **lát sáu
khuôn**. Đã gỡ `components/coats.css`, `lib/publishing/coats.ts`, `components/coat-viewer.*`, `app/xem/` và mọi
móc `coat` trong `shop-feedback-v2.tsx`. **Nguyên tắc thiết kế thì giữ nguyên** — `DESIGN.md` mục 1–8 và
`thiet-ke-va-khuon.md` mục 11–14 là thứ sáu khuôn mới kế thừa.

### Xong gần nhất — bản khuôn (25/09)

Mỗi khuôn một số bản; bản phát hành ghim bản; CSS mỗi bản là một tệp đóng băng (`components/skins/<khoá>.v<bản>.css`,
mã băm giữ trong test). Chủ quán thấy khung "Khuôn" trong trình chỉnh: bản nháp dùng bản nào, trang khách chạy bản nào,
nút "Dùng bản N" chỉ đổi bản nháp rồi Xem trước / Phát hành như thường. Sửa lỗi / bảo mật / luật Google sửa thẳng mọi
bản. Hôm nay mọi khuôn mới có bản 1, nên khách chưa thấy gì khác. **Không migration** (`template_versions` có từ 003).
Chi tiết `thiet-ke-va-khuon.md` mục 16. **Còn lại:** số bản nền tảng `năm.tháng.lần` + nhật ký thay đổi.

### Trước đó — khuôn 6 làm lại: nút hạt ngọc (24/09)

Tài chốt: một nút G bốn màu, chữ chạy vòng quanh, nền trắng sữa, vệt sáng gương, con quay hồi chuyển. Chi tiết
`DESIGN.md` mục 9. **Không migration.** Kèm hai test hàng rào: góp ý riêng gửi được ở **cả sáu khuôn**, và khách tải
lại trang sau khi shop phát hành lại vẫn gửi được.

**Lỗi Tài báo — thẻ góp ý mở được nhưng không bấm được gì, "Chưa kết nối được" (shop Googy, Chrome iPhone):** chưa tái
hiện. Đã loại: bố cục (WebKit + Chrome giả lập iPhone chạm trúng nút, mở thẻ, chọn sao, gõ chữ trên production
`/urr6ud`), riêng từng khuôn (test sáu khuôn), phát hành lại rồi tải lại (test). **Nghi phạm còn lại:** link "Xem trước"
đã quá 15 phút — trang vẫn hiện nhưng mọi thao tác bị từ chối với đúng câu đó. Chờ Tài thử trên trang thật.

**Vercel preview đang dựng bình thường** (ảnh tab Deployments Tài gửi 24/09: mỗi commit trên nhánh có bản Preview
"Ready", link nhánh `quitesensational-review-bio-git-feat-local-app-ea8fd5-mount-pro.vercel.app`). Vấn đề "preview kẹt ở
build 6722" ghi ngày 23/09 **không còn**; không rõ nó tự hết lúc nào.

**Số phiên bản (Tài giao Claude quyết, 24/09):** nền tảng `năm.tháng.lần` (vd `26.9.3`); khuôn là số nguyên riêng mỗi
khuôn, ghim theo bản phát hành của shop, shop tự chọn cập nhật. Sửa lỗi / bảo mật / luật Google thì không cho chọn.

### Trước đó — cửa duyệt ảnh, migration 023 (24/09)

Mọi ảnh/video shop tải lên chờ admin duyệt ở `/gov` trước khi phát hành được; trang đang chạy vẫn chạy. Tài báo
24/09, nguyên văn: *"đã chạy xong cả hai"* (023 trên Neon production và preview) — Claude không có credential nên
không tự kiểm được. Sau đó mới đẩy `main`. Chi tiết `thiet-ke-va-khuon.md` mục 10.

### Trước đó — khuôn 1 · thẻ trôi (24/09) — đủ sáu khuôn

Tài chốt ý 1 + 2: thẻ trôi, mép trên mờ dần trên một dải làm nhoè nền; nền thở theo cuộn (phóng + tối dần trên toàn
quãng cuộn). Giữ màu bản gốc, đổi bố cục. **Mọi shop hiện có dùng khuôn 1** nên chúng đổi diện mạo theo. **Không
migration.** Sáu khuôn đều đã có diện mạo; **chưa khuôn nào thử trên iPhone/Android thật**.

### Trước đó — khuôn 2 · Tối giản (24/09)

Theo ảnh "Minimal Dark Card": thẻ tối, quầng tím mờ quanh thẻ (nhoè tĩnh, không backdrop-filter), nền vẽ bằng SVG,
link lưới ô đều theo số lượng. Không tạo ảnh (không có công cụ; RunComfy trả phí chưa mở). **Không migration.**
Khuôn 1 làm tiếp theo (ý 1 + 2).

### Trước đó — khuôn 4 · Chồng thẻ (24/09)

Theo ảnh Tài gửi: thẻ nghiêng trên thẻ poster (chưa có poster thì thẻ hồng mặt cười), link hàng dọc, nút Google trắng
(token mới `--c-btn-fill`, chữ nút đọc `--c-on-brand`). Bỏ câu "SMALL REVIEW BIG SUPPORT" vì luật Google. **Không
migration.** Tài cũng đã giao hướng cho khuôn 1 (thẻ trôi trên ảnh nền, mờ dần khi cuộn — ảnh "Hero Bold") và khuôn 2
(thẻ tối tối giản, quầng mờ quanh thẻ — ảnh "Minimal Dark Card"; cho phép tự tạo ảnh).

### Trước đó — khuôn 3 · Kính (23/09)

Kính khúc xạ thật, **cùng kết quả ở Chrome, Safari, Firefox**: tự vẽ cảnh sau kính, mỗi tấm kính mang bản sao đã
căn, bẻ bằng `filter` (không `backdrop-filter`), cảnh cuộn cùng trang nên bộ lọc chạy một lần. Đo: lệch 0px ở cả ba
lõi, vùng kính lệch ~4/255, cuộn không chậm đi khi CPU hãm 6 lần. Ngoại lệ `<svg>` vô hình Tài chốt. Chưa thử máy
thật. Chi tiết `thiet-ke-va-khuon.md` mục 15. **Không migration.**

### Trước đó — khuôn 5 · Ánh sáng tụ (23/09)

Khuôn tối đầu tiên: quầng sáng hổ phách là bóng của chính nút Google, lưới chấm nét gần nút và nhoè khi ra xa. Nó làm
lộ bốn chỗ CSS gốc viết cứng màu sáng (viên link, ô nhập, nút Gửi, bóng nút Google) — đã nối token. Chữ dòng mời góp ý
giờ cố định để A2 đứng được ở khuôn tối; có test so khuôn 5 với khuôn 6. **Không migration.**

### Trước đó — khuôn 6 · Nút lớn (23/09)

Khuôn đầu tiên có diện mạo: nút Google 112px giữa màn hình, chuyển cảnh 300ms rồi **cùng tab** sang Google
(`LEAVE_TRANSITION_MS`). Nút Google mọi khuôn giờ pha màu từ `--c-brand`. Chi tiết `DESIGN.md` mục 9.
**Không migration.** Shop tạo trước lát này với khoá `big-button` giữ bản chụp cũ (nền trắng full-bleed) tới lần phát hành sau.

### Trước đó — A36 lớp da (23/09)

`components/skin.css`: tên + mặc định mọi token `--c-*` (mặc định = diện mạo cũ, trang không đổi màu), quãng cuộn
dư A1, `--c-floor`, cách bày link 1–6. Nút máy bay giữ ở `guest-page.css` và được test khoá. `coats.css` còn mang
theo cả cách bày link (`f1a071e`) — mất cùng nó, giờ đã dựng lại. **Không migration.** Chi tiết `DESIGN.md` mục 4, 9.

### Trước đó — A33 sáu khoá khuôn (23/09)

Sáu khoá `standard · minimal · glass · deco · spotlight · big-button`, mỗi khoá một cấu hình và một hàng
`template_versions` (tạo lúc cần), ô chọn khuôn ở `/gov`, trang khách mang `data-template`. **Không migration.**
Khuôn là bộ xương, không gắn tài khoản (Tài, 23/09). **Chưa khuôn nào có diện mạo riêng** — và lớp da (token
`--c-*`, hai luật dùng chung) đã mất cùng `coats.css`; xem `DESIGN.md` mục 9.

### Trước đó — lát khuôn/tài khoản (23/09, `5375358`)

`shop_profile` (migration 022) + lớp ghép lúc đọc. **Nội dung thuộc tài khoản, diện mạo thuộc khuôn.** Đổi khuôn
không mất tên, link Google, danh sách link, logo, ảnh. `publish()` ghi nội dung xuống hồ sơ trong cùng
transaction; `live()` ghép hồ sơ, `preview()` thì không. Bảy bộ test xanh có output.

Trước đó: `PRODUCT.md`, `DESIGN.md`, hệ áo khoác trang khách (`components/coats.css`), bàn xem `/xem` (chỉ ngoài
production). Chi tiết ở [`thiet-ke-va-khuon.md`](thiet-ke-va-khuon.md).

### Việc kế, theo thứ tự

1. **Thử sáu khuôn trên iPhone và Android thật** (Tài) — trước khi giao quán đầu tiên. Khuôn 4 phần kéo thả trang trí
   là A35.
2. **Ba khuôn có tranh** — chờ ảnh của Tài; bản kê ở [`anh-can-cho-ao-khoac.md`](anh-can-cho-ao-khoac.md).
3. ~~Cửa duyệt ảnh~~ — xong 24/09 (023).
4. **C3 + sao lưu** — trước khách trả tiền.
5. `/gov` đúng nghĩa; tính năng theo lời shop thật.

### Luật triển khai — Tài nới 23/09

**Không bắt buộc xem preview trước mỗi lần.** Các phiên trước đẩy thẳng `main` và hiệu quả token tốt hơn nhiều.
Mặc định từ giờ: làm xong → 7 bộ test xanh → đẩy `main`. Preview chỉ dùng khi Tài yêu cầu, hoặc khi lát đụng vào
thứ khó hoàn tác.

**Hai luật không nới:**
- **Có migration thì Tài chạy Neon trước, rồi mới đẩy `main`.** Lát 022 cho thấy vì sao: mã mới
  `LEFT JOIN shop_profile`, database chưa migrate là trang khách sập.
- **Không báo test xanh khi chưa có output.** Lệnh 7 bộ ở `operations-gotchas.md`.

**Vercel không dựng nhánh preview — chưa tìm ra nguyên nhân (23/09).** Preview kẹt ở build
`6722-8da949b4…` từ 22/09; production dựng lại bình thường mỗi lần đẩy `main`.

Đã loại trừ, có bằng chứng:

| Nghi ngờ | Kết quả |
|---|---|
| Lỗi mã / `next/font` trong `app/xem` | **Không.** Route đã xoá, preview vẫn kẹt |
| Ignored Build Step | **Không.** Behavior = `Automatic` |
| Preview không theo dõi nhánh | **Không.** Preview theo `All unassigned git branches` |
| Deployment Checks (`Lint`, `TypeCheck`) đỏ | **Không.** `eslint .` và `next typegen && tsc --noEmit` đều exit 0 trên toàn repo |
| Nhánh chưa lên GitHub | **Không.** `git ls-remote` xác nhận nhánh đi trước `main` |

**Hai phép thử đầu của Claude vô giá trị vì thiết kế sai**: chúng đẩy cùng một commit lên cả hai nhánh, mà
Vercel dựng mỗi SHA một lần — chính ô Ignored Build Step ghi rõ *"Vercel skips builds for commits with a
previously deployed SHA"*. Phép thử đúng (commit chỉ trên nhánh, SHA riêng) cho kết quả: preview vẫn không dựng.

**Chỗ duy nhất chưa nhìn:** tab **Deployments** (thanh trên cùng, không phải Settings), lọc nhánh
`feat/local-app-foundation`. Không có dòng nào ⇒ webhook không tới Vercel ⇒ sửa bằng **Disconnect rồi Connect
lại** repo ở Settings → Git.

**Không chặn việc gì.** Luật triển khai đã nới: xong → 7 bộ xanh → đẩy `main`.

Việc nhỏ đi kèm: **Settings → Functions → Function Region** đặt **Singapore (`sin1`)** cho cả **Preview**; hiện
nó vẫn chạy `iad1`, nên mọi phép đo tốc độ trên preview chậm giả tạo ~250ms mỗi truy vấn.

### Việc còn treo của Tài

- **Tạo shop thật đầu tiên và ghi thẻ NFC** — kiểm đường dẫn trong dashboard là `.com` trước khi ghi.
- Bảo vệ nhánh `main` (cần GitHub Team) · Neon trả phí (B1) · giám sát lỗi (B3) · Zalo OA (B7).
- Luật sư duyệt bản nháp pháp lý (C2).

### Thứ tự đọc cho phiên mới

1. `AGENTS.md`
2. **`decisions.md` mục 1–8 rồi khối này** ← bạn đang ở đây
3. `docs/operations-gotchas.md` — mọi bẫy đã dính, **lệnh 7 bộ test**
4. `docs/google-policy.md` — luật cứng, thắng mọi thứ
5. Chỉ khi làm giao diện/khuôn: `PRODUCT.md`, `DESIGN.md`, `docs/thiet-ke-va-khuon.md`
6. Chỉ khi cần: `docs/roadmap-slices.md`, `docs/production-launch.md` mục "Đường vào", `docs/agents-board.md`

### Dựng môi trường

Node 24 qua nvm. **Không dùng `pnpm <script>`**, gọi thẳng `node node_modules/…`.

PostgreSQL: binary ở `/Applications/Postgres.app/Contents/Versions/latest/bin` (không có trong `PATH`).
Cluster test cổng **55439**, `initdb -U nfc_test --auth=trust -E UTF8 --locale=en_US.UTF-8`, `createdb nfc_repo_test`.
**Đường dẫn scratchpad dài hơn 103 byte nên socket Unix không tạo được** — dựng ở `/tmp/<tên ngắn>` hoặc chạy TCP
thuần bằng `-c unix_socket_directories=`. Tắt cluster khi xong.

`next dev` trong worktree **phải có `--webpack`**: `node_modules` là symlink trỏ ra ngoài và Turbopack chết vì nó.
Harness dùng cổng 3317–3319; không chạy hai bộ cùng lúc. Chạy 7 bộ bằng `env -u NFC_TOTP_KEY` cho giống CI.

Lịch sử theo ngày: [`decisions-archive.md`](decisions-archive.md).
