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

## 4. Bốn nền móng, và cấp độ hiện tại (cập nhật 26/09)

Mỗi nền móng chỉ được nâng lên cấp sau khi cấp dưới nó đứng vững. Hướng nâng của cả hệ thống: **tổ hợp module** —
[`kien-truc-nen-tang.md`](kien-truc-nen-tang.md).

| Nền móng | Cấp hiện tại | Cấp tiếp theo |
|---|---|---|
| **Trang khách** | Chạy thật, một đường duy nhất (trang đã phát hành), đúng luật Google, chặn bot, "tốt" trên 4G, video chỉ ở poster | Section và gói template (M1–M4) |
| **Dữ liệu** | Bề nổi cho chủ quán; dòng sự kiện hành vi đang thu (020) | **Dời** — đọc dòng sự kiện khi đã có khách thật (Tài 26/09) |
| **Quản trị `/gov`** | Tạo quán, cấp link, duyệt ảnh, báo cáo tạm dừng, 2FA | Điều hành thật khi có dữ liệu (A21); tên miền riêng (P7) |
| **Vận hành** | CI 7 bộ, production từ `main`, mã sao lưu xong | Tự chạy được không cần Vercel (I1); sao lưu chạy thật (Tài) |

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

Bảng đầy đủ các quyết định lớn chưa thực hiện ở [`kien-truc-nen-tang.md`](kien-truc-nen-tang.md) mục 6. Những điểm
Tài phải chốt: đền bù khi tạm dừng khẩn cấp · thẻ chuyển giữa các trang · dữ liệu trang đã đóng giữ bao lâu · khi nào
bắt đầu thu tiền. Đã quyết mà chưa làm: **cột `purpose` cho số điện thoại** (21/09 — phải có trước section nào xin số)
và **hạn giữ dữ liệu** (hạn chót 9/2027).

## 7. Dòng sự kiện hành vi — đã làm 21/09 (migration 020)

Lát "cái giếng" đề xuất ở đây đã xong: bảng chỉ ghi thêm, sự kiện mở trang · bấm Google · mở khung góp ý · chọn sao ·
gửi · bỏ giữa chừng, không bao giờ mang nội dung cá nhân, gửi kiểu bắn rồi quên. **Đọc nó** (A8–A10) dời lại tới khi
có khách thật (Tài 26/09).

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
## 9–14. Thiết kế và template → tệp riêng

Toàn bộ quyết định về **giao diện trang khách và mô hình template** (22–23/09) nằm ở
[`thiet-ke-va-template.md`](thiet-ke-va-template.md), để tệp này giữ được cỡ đọc-một-lần. Tóm tắt một dòng mỗi mục:

| | |
|---|---|
| **9** | Thiết kế trước tính năng; kiến trúc xương–thịt–da–áo khoác; hợp đồng áo khoác |
| **10** | Ảnh và logo shop tải lên **phải qua admin duyệt**, chặn ở lúc phát hành |
| **11** | **Template là ổ cắm, tài khoản là phích** — nội dung ở tài khoản, diện mạo ở template |
| **12** | Sáu template Tài chốt, và ba ranh giới đi kèm |
| **13** | Hai luật dùng chung mọi template: trang luôn dài hơn màn hình · nút máy bay giấy bất biến |
| **14** | Ba chỗ suýt thủng khi tách nội dung khỏi template, và thứ tự triển khai bắt buộc |

## TIẾP TỤC TỪ ĐÂY — cập nhật 2026-09-27

Khối này luôn nằm cuối tệp và **luôn ngắn**. Phiên mới đọc mục 1–8 ở trên, rồi [`kien-truc-nen-tang.md`](kien-truc-nen-tang.md)
(logic gốc, đích kiến trúc module, tự chạy được, đội ngũ), rồi khối này. Việc còn lại: [`roadmap-slices.md`](roadmap-slices.md).
Khối cũ 23–26/09 đã chuyển sang [`decisions-archive.md`](decisions-archive.md).

### Đang ở đâu

**Phiên mới bắt đầu từ đây (27/09 khuya):** đợt cải tổ đã xong S0 → S1 → M2 → M3 → D4a → D4b → **M2b** (audit
`docs/audit-ui-ux-20260927.md` mục 4). D4 đã lên production (`main` = `66b8c4c`, Neon 001–029). **M2b nằm trên nhánh, có
migration 030**: Tài chạy 030 trên Neon production và preview → đẩy nhánh, CI xanh → đẩy đúng commit đó lên `main`. **Vercel (Tài
chốt 27/09): Pro tới 29/09, rồi chuyển VPS** (bộ I1, `tu-chay.md`) — từ 29/09 trang chính chỉ được chạy trên VPS hoặc Pro trả tiền,
không bao giờ trên Hobby. Lát kế theo audit: **P5b-lite** (tab Thanh toán, cần mã QR ngân hàng + Zalo của Tài), hoặc D4c (đăng
nhập bằng Google, cần OAuth client).

**M2b (27/09, migration 030):** lời cảm ơn trước Google do shop tự viết (`PageConfig.thanks`, tiếng Việt + tiếng Anh, ≤ 120 ký tự;
chỉ dòng đầu của thẻ — câu "trang sẽ chuyển sang Google" vẫn là của nền tảng), chỉ ở template có thẻ cảm ơn (1–5). Không được
nhắc sao/chấm điểm/hình ngôi sao (`thanksProblem`, luật 3 và 7) và qua dây bẫy quà/tên nhân viên. **Cửa duyệt chữ** giống cửa duyệt
ảnh: lưu nháp thì câu vào `text_reviews`; phát hành bị chặn (`THANKS_PENDING/REJECTED/UNKNOWN`) tới khi Tài duyệt ở khung "Lời cảm
ơn chờ duyệt" của `/gov`; trang đang chạy giữ câu cũ; câu đã duyệt dùng lại ở mọi trang của shop, và câu duyệt trên shop template
đi theo shop nhân bản từ nó; đổi template giữ câu. Chờ Tài: thử lời
cảm ơn trước Google trên Safari và Chrome iPhone; quét QR ở `/bat-dau` bằng camera iPhone và Android (mã QR tự vẽ, mới chỉ được
bộ đọc QR của Chrome kiểm); Tài sẽ in link lên danh thiếp.

**D4a (27/09):** `/` là trang chính (lập chỉ mục; `public/robots.txt` chặn cả site từ 10/09 đã gỡ, thay bằng `app/robots.ts` +
`app/sitemap.ts`). `/bat-dau` dựng trang không cần tài khoản: tên → lưới 6 template là **trang khách thật** thu nhỏ → **QR** mở
bản nháp trên điện thoại → 3 câu hỏi (bỏ qua được) → "Lưu trang của tôi". Bản nháp **không lưu trên máy chủ** cho tới lúc lưu:
nằm trong link `/thu/<mã>`, ký bằng khoá dẫn xuất từ `NFC_RENDER_SIGNING_KEY`, sống 7 ngày, không ghi lượt ghé, qua dây bẫy chữ
như tên trang. Mã QR do nền tảng tự vẽ (`lib/qr.ts`, không thêm gói).

**D4b (27/09, migration 029, Tài chốt "chờ duyệt"):** "Lưu trang của tôi" tạo **tài khoản ngay** (@handle, email, mật khẩu tự
chọn, số Zalo tuỳ chọn) và một hồ sơ trong `shop_signups`; **chưa có shop** cho tới khi Tài bấm **Duyệt** ở khung "Trang chờ
duyệt" của `/gov` — lúc đó tạo shop, trang, mã thẻ (prepared) và phát hành đúng như "Tạo shop mới"; **Từ chối** thì khoá tài
khoản. Đăng nhập từ trang chính (`/owner/login` không `next`) về dashboard của tài khoản, hoặc `/owner/cho-duyet`. Chống tạo hàng
loạt: chung khe băm mật khẩu với đăng nhập, 20 lượt/giờ toàn nền tảng, 3 lượt/giờ mỗi địa chỉ (khi biết địa chỉ), tối đa 50 hồ sơ
chờ. Báo chủ quán khi duyệt: Tài nhắn tay (Zalo/email hiện ở `/gov`). Bậc "gửi link bản nháp cho Tài" của D4a đã gỡ.

- **Production `https://quitesensational-review-bio.com`**, deploy từ `main`, hàm chạy `sin1`, Neon **001–028 cả hai
  branch** + 029 (Tài chạy 27/09); 030 chờ Tài. `main` = `66b8c4c` (D4, đã đẩy 27/09). Vercel Pro dùng thử tới **29/09**.
- **Vercel → VPS (Tài chốt 27/09, thay quyết định "xuống Hobby" cùng ngày):** Pro tới 29/09, rồi chuyển sang VPS chạy bộ I1.
  Hobby **cấm dùng thương mại** và trang chính là quảng cáo bán dịch vụ, nên sau 29/09 production không được ở Hobby (audit
  mục 1). Log Hobby chỉ giữ **1 giờ**. MacBook của Tài chỉ làm máy thử, không làm máy chủ.
- **I1 xong 27/09:** compose chạy thật trên Docker Desktop của Tài, `selfhost-smoke.mjs` qua đủ (`tu-chay.md`). Tầng đếm
  theo địa chỉ vẫn chạy trên Vercel (Tài kiểm SQL = 1).
- **CI xanh lần đầu 27/09:** repo đã công khai, lượt #213 trên `4b9a5c4` qua đủ 8 job, gồm `self-host` (ảnh Tài gửi).
- **Lỗi "Chưa kết nối được" — đã sửa 27/09.** Log `GUEST_REFUSED` trên production: Chrome iPhone gửi
  `Sec-Fetch-Site: same-origin` nhưng `Origin` **khác** địa chỉ trang; server đòi cả hai nên từ chối mọi lượt ghé (403).
  Luật mới, dùng chung cho khách/chủ shop/admin (`server/same-origin.ts`): có `Sec-Fetch-Site` thì nó quyết (trình duyệt
  tự đặt, trang không giả được); không có thì `Origin` phải khớp. Giá trị `Origin` thật của Chrome iPhone ghi ở dòng log
  `ORIGIN_DIFFERS_SAME_SITE`: đó là **`Origin: null`**. Sau deploy `7762d31`, các lượt ghé Chrome iPhone trả **200** (log production).
- **Đẩy `main` do Tài chạy** (chế độ tự động của Claude Code chặn `git push`): Claude đưa lệnh đẩy có kiểm, Tài chạy, rồi
  Claude kiểm production (`vercel ls` / `vercel inspect`, rồi Chrome không giao diện mở một trang khách).
- **`/urr6ud` là shop TEMPLATE** ("YOUR SHOP", template 1), không phải Googy. Tài bấm "Đưa template về mặc định mới" 26/09:
  template giờ dùng ảnh nền mặc định, không poster. Mỗi lần kiểm production ghi một lượt ghé vào shop này.
- **Chưa ghi thẻ NFC nào, chưa có khách thật.** Hai branch Neon khác nhau — slug bên này không có bên kia.

### Hướng đi — Tài 26/09

1. **Tạm dừng lát mới; đã duyệt lại toàn bộ** → `kien-truc-nen-tang.md`. Web là **tổ hợp module** (section · loại ô ·
   hiệu ứng · gói template), kho template như Canva; **tự chạy được không cần Vercel**; sẵn sàng cho coder và designer.
2. **Phần dữ liệu dời lại** (đọc dòng sự kiện, kho phân tích, AI…) — brainstorm lại khi mọi thứ khác ổn. Không dời: sao
   lưu, và **hạn giữ dữ liệu — hạn chót 9/2027**.
3. **Video chỉ ở poster**, nền không bao giờ là video (E9).
4. **Quyết định mới sửa hoặc xoá ý cũ** ở mọi tài liệu, không để chồng lên (cách làm của Tài).

**I1 tự chạy được: xong 27/09** (`tu-chay.md`). **M1 gói template: xong 27/09** — mỗi template là `templates/<khoá>/`
(`manifest.json` + `v<bản>.css`), `node scripts/templates.mjs` sinh registry; giá trị sáu template so trước/sau giống hệt;
hướng dẫn designer `templates/README.md`. Nền bị kéo theo thẻ khi cuộn và kéo-để-tải-lại dính trên Chrome iPhone → **M4**.
Tiếp: **M2** module hiệu ứng → cột `purpose` cho số điện
thoại → **M3** section → **M4** đợt cải tổ UI/UX cùng A16.

**Nguồn UI/UX (Tài 27/09):** mọi thiết kế từ giờ lấy `docs/ui-ux-nguon-tham-khao.md` làm cơ sở (tóm tắt PDF bốn video
uxpeak + luồng uxpeak.com Tài chụp, kèm ba ý của Tài: popup đếm ngược trước Google, đăng ký cuốn không đòi tiền đầu +
tab Thanh toán, cảm xúc lúc bấm Google — đã đối chiếu `google-policy.md`; Tài chốt: đếm đủ 4 giây rồi Google ở tab mới, lời cảm ơn của quán shop sửa được và
admin duyệt). Tài thêm tám hướng (trang chính trước đăng nhập, dựng trang trước tài khoản, trợ lý tóm tắt hôm nay, con
trỏ nhiều màu, dashboard VIP, chuẩn Dropbox, video 3 phút, sao Google của quán) — **tất cả đều làm**; Claude suy ra và
quyết thêm mười điều (mục 5 của tệp đó). Hành trình chung ở mục 6.
**Audit xong 27/09** (`docs/audit-ui-ux-20260927.md`): chưa sẵn sàng cải tổ ngay; thiếu hệ thiết kế chung, M2, M3, và
phải dọn nền trước. **S0 dọn nền xong 27/09** (đổi "khuôn" → "template" khắp nơi, tiêu đề tab theo tên quán và
`noindex` theo route, README/`local-development.md` viết lại, gỡ bộ bàn giao Antigravity 15/09, luật test A10). **S1 hệ thiết kế nền tảng xong 27/09**: tên **Quite Sensational** (`lib/brand.ts`); token tối tím / sáng trắng–cam–sữa,
chọn Tối · Sáng · Theo máy; `/gov` và các trang đăng nhập dựng lại (nút theo loại việc, nhãn trên ô, bảng thành thẻ trên
điện thoại); dashboard: thanh đáy trên điện thoại + "Thêm", mỗi mục một URL (`?view=`), nút Back đúng. **M2 module hiệu ứng xong 27/09**: `components/effects/` (kính, hạt ngọc,
lớp sương, lời cảm ơn trước Google) qua một sổ đăng ký; template 1–5 bật lời cảm ơn + tim bung + đếm 4 giây rồi Google mở
tab mới (chặn thì có nút "Mở Google"); con trỏ góp ý đổi 4 màu của template. Lời cảm ơn shop tự sửa + admin duyệt: **M2b xong 27/09**
(migration 030). **M3 section xong 27/09, không cần migration**: `PageConfig` v3 có `sections` (khối nào hiện, thứ
tự nào); dữ liệu khối ở chỗ cũ; chỉ poster được đứng trên nút Google; trình chỉnh có khung "Các khối trên trang". Lát kế
theo audit: **D4a, D4b, M2b xong 27/09**; kế là P5b-lite hoặc D4c. **Màu nền tảng (Tài 27/09):** tím như uxpeak; chế độ sáng trắng–cam–sữa
(`DESIGN.md` mục 7). Nháp video 3 phút: `docs/video-3-phut.md`.

**Tên gọi (Tài 27/09):** không gọi "khuôn" nữa, gọi **template**. Đã đổi ở mọi nơi trong lát S0 (chữ trên dashboard và
`/gov`, mã, test, tài liệu, `DESIGN.md`, tên tệp `thiet-ke-va-template.md`); chỉ hồ sơ lịch sử giữ chữ cũ
(`decisions-archive.md`, bản rà bảo mật 20/09, các migration đã chạy).

### Luật triển khai (Tài nới 23/09)

Xong → 7 bộ test xanh có output nguyên văn → đẩy `main`; không cần xem preview trước. **Không nới:** có migration thì
Tài chạy Neon trước rồi mới đẩy; không báo test xanh khi chưa có output. Lệnh 7 bộ ở `operations-gotchas.md`.

### Việc còn treo của Tài

Đã xong 27/09: bảo vệ `main` (F5, đẩy thẳng bị luật chặn) · cấp lại link `yourshop` trên preview · gửi góp ý trên Chrome
iPhone. **Còn:** tạo **Hồ sơ doanh nghiệp Google** cho dịch vụ NFC ngay (đồng hồ 60 ngày cho C1) · chọn **màu chủ đạo và
nhận diện nền tảng** (F6, trước S1) · mã QR ngân hàng + số Zalo cho tab Thanh toán (cài đặt admin, không vào GitHub) ·
kịch bản video 3 phút · Search Console sau khi trang chính mở lập chỉ mục · **chạy migration 029** trên Neon production và preview (trước khi đẩy D4
lên `main`) · **dựng VPS trước 29/09** (hoặc trả Pro thêm) · sao lưu (`sao-luu.md`) · F4 xoay mật khẩu đã lộ · quán thật đầu tiên + ghi thẻ · luật sư (C2). Việc tách
riêng đang chờ: ca impersonation không đứng một mình
(`admin-http.spec.ts` ~240). Ca 2FA chập chờn (`admin-auth.spec.ts`) đã sửa 27/09 (`operations-gotchas.md`).

### Thứ tự đọc cho phiên mới

1. `AGENTS.md`
2. **`decisions.md` mục 1–8**, rồi `docs/kien-truc-nen-tang.md`, rồi khối này ← bạn đang ở đây
3. `docs/operations-gotchas.md` — mọi bẫy đã dính, **lệnh 7 bộ test**
4. `docs/google-policy.md` — luật cứng, thắng mọi thứ
5. Chỉ khi làm giao diện/template: `PRODUCT.md`, `DESIGN.md`, `docs/thiet-ke-va-template.md`
6. Chỉ khi cần: `docs/roadmap-slices.md` (việc còn lại), `docs/production-launch.md` mục "Đường vào", `docs/agents-board.md`

### Dựng môi trường

Node 24 qua nvm. **Không dùng `pnpm <script>`**, gọi thẳng `node node_modules/…`.

PostgreSQL: binary ở `/Applications/Postgres.app/Contents/Versions/latest/bin` (không có trong `PATH`).
Cluster test cổng **55439**, `initdb -U nfc_test --auth=trust -E UTF8 --locale=en_US.UTF-8`, `createdb nfc_repo_test`.
**Đường dẫn scratchpad dài hơn 103 byte nên socket Unix không tạo được** — dựng ở `/tmp/<tên ngắn>` hoặc chạy TCP
thuần bằng `-c unix_socket_directories=`. Tắt cluster khi xong.

`next dev` trong worktree **phải có `--webpack`**: `node_modules` là symlink trỏ ra ngoài và Turbopack chết vì nó.
Harness dùng cổng 3317–3319; không chạy hai bộ cùng lúc. Chạy 7 bộ bằng `env -u NFC_TOTP_KEY` cho giống CI.

Lịch sử theo ngày: [`decisions-archive.md`](decisions-archive.md).
