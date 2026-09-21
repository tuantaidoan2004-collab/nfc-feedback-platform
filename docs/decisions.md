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

## TIẾP TỤC TỪ ĐÂY — cập nhật 2026-09-21

Khối này luôn nằm cuối tệp. Phiên mới đọc mục 1–8 ở trên trước, rồi khối này.

### Đang ở đâu (21/09/2026, cuối phiên A5)

- **Production: `https://quitesensational-review-bio.com`**. Tên miền cũ `.vercel.app` **308 về đây**.
  Hàm chạy ở **Singapore**, cùng vùng Neon. Bản đồ đầy đủ ở đầu `production-launch.md`.
- **Neon 001–021** trên cả production lẫn preview. **A5 không có migration.**
- **Có shop khuôn `urr6ud`** và một shop nháp `caphe-demo`. **Chưa ghi thẻ NFC nào.**
- Admin `tai` **đã bật 2FA**; 10 mã dự phòng Tài giữ.
- **`main` đã đẩy tới A5** (21/09, sau khi Tài thấy CI xanh).

### Xong trong phiên 20–21/09

A1 chặn bot trang khách (018) · A2 2FA admin (019) · A4 CI đủ 7 bộ · A6 nén ảnh trình duyệt ·
F-010, F-011, F-012, F-013 (hàng rào CTA theo `google-policy.md`) · A3 phần xoá được (`prototypes/`) ·
**mục 7 dòng sự kiện hành vi** (020) · **lát B cho khách tự xoá dữ liệu** (021) · chuyển `.com` + Singapore ·
**A5 trang pháp lý**.

### A5 — đã làm gì (21/09)

- Chân trang khách một dòng nhỏ: `Quyền riêng tư · Điều khoản · Xoá dữ liệu của tôi`. Bấm xoá thì hỏi lại **ngay trên
  dòng đó** (không popup), rồi báo "Đã xoá." / "Không có gì để xoá." / lỗi. Nút Google **không dịch một điểm ảnh**, có
  test đo vị trí trước và sau.
- Dưới ô số điện thoại: link `Cách số này được giữ và xoá` → `/quyen-rieng-tu#so-dien-thoai`. Câu giữ chỗ trong ô
  giữ nguyên (Tài chốt, E8).
- `/quyen-rieng-tu` và `/dieu-khoan` (`components/legal-page.tsx`), tiếng Việt, ghi **"Bản nháp, đang chờ luật sư
  duyệt"** ở đầu. Liên hệ: `tuantaidoan2004@gmail.com` · `0961 036 265`. Mỗi câu khớp một chỗ trong mã (chú thích đầu
  `app/quyen-rieng-tu/page.tsx` chỉ chỗ).
- **Sửa một lời hứa sai của lát B:** xoá trước đây chỉ phủ phiên hiện tại, mà phiên đóng sau 15 phút rảnh. Giờ phủ
  mọi phiên của cùng trình duyệt trên cùng thẻ (`server/erase.ts`). Chi tiết ở `operations-gotchas.md`.
- Sau khi xoá, trang **ngừng ghi hành vi** và bỏ lô chưa gửi, để nhật ký không tự đầy lại (`EventSink.drop`).

Người vận hành đứng tên trên hai trang: **Đoàn Tuấn Tài** (Tài xác nhận 21/09), sửa ở `CONTACT.operator` trong
`components/legal-page.tsx`.

**Nợ phải trả trước 09/2027:** chính sách hứa **giữ tối đa 12 tháng**, nhưng lát xoá tự động theo mốc đang **hoãn
có chủ ý** (mục 3). Nó phải chạy trước khi dữ liệu đầu tiên đủ 12 tháng tuổi, tức 12 tháng sau tấm thẻ đầu tiên.
Chưa có bản tiếng Anh cho hai trang; làm sau khi luật sư duyệt bản tiếng Việt.

### Việc tiếp theo

Không còn P0 nào chặn việc ghi thẻ. Việc kế là của Tài: **tạo shop thật đầu tiên và ghi thẻ**. Sau đó mới **đọc dòng
sự kiện** (A8/A9/A10 gộp một) — chỉ khi đã có khách thật. Rồi `/gov` đúng nghĩa.

### Astra

Đang làm **C3 mặt trận 1** — cô lập dữ liệu giữa các shop — trên `astra/c3-pentest`, baseline `deba8c1`. Đã giao
xong A3 (`f819c0c`) và A7 (`4c47be8`); A7 là nơi tìm ra F-013. Chi tiết và đầu bài ở `agents-board.md`.

**Lưu ý khi viết prompt cho Astra:** mô tả kiểu "tấn công" làm ChatGPT chặn vì chính sách an ninh mạng. Viết rõ
**đây là rà soát phòng thủ trên hệ thống của chính chủ sở hữu, có cho phép, chạy local với dữ liệu giả**.

### Việc còn treo của Tài

- **Tạo shop thật đầu tiên và ghi thẻ NFC** — kiểm đường dẫn trong dashboard là `.com` **trước khi** ghi.
- Thử tải một ảnh lên (kiểm CORS R2); cân nhắc `media.<tên-miền>` thay `r2.dev` — **làm sớm**, đường dẫn ảnh lưu
  tuyệt đối nên đổi sau thì ảnh cũ trỏ `r2.dev` vĩnh viễn.
- Bảo vệ nhánh `main`: ruleset đã tạo nhưng **Free không thi hành trên repo riêng tư**, cần GitHub Team. Chưa trả tiền.
- Nâng Neon trả phí (B1), tài khoản giám sát lỗi (B3), Zalo OA (B7).
- Luật sư duyệt bản nháp A5 (C2).

### Thứ tự đọc cho phiên mới

1. `AGENTS.md`
2. **`docs/agents-board.md`** — ba bên, phát hiện đang mở
3. **`docs/operations-gotchas.md`** — mọi bẫy đã dính, lệnh **7 bộ test**
4. **`decisions.md` mục 1–8** rồi khối này
5. `docs/google-policy.md` (luật cứng) · `docs/roadmap-slices.md`
6. `docs/production-launch.md` mục **"Đường vào"**
7. Bảng chọn skill ở đầu `docs/agent-skills.md`; chỉ nạp skill cần tới

Lịch sử theo ngày: [`decisions-archive.md`](decisions-archive.md).

### Dựng môi trường

Node 24 qua nvm. PostgreSQL: binary Postgres.app, **cluster riêng cổng 55439** trong thư mục scratchpad, **bắt
buộc** `initdb -U nfc_test --auth=trust -E UTF8 --locale=en_US.UTF-8`; `createdb … nfc_repo_test`; tắt khi xong.
**Không dùng `pnpm <script>`**, gọi thẳng `node node_modules/…`. Harness dùng cổng 3317–3319: không chạy hai bộ
cùng lúc. Astra dùng 55449 và không chạy harness. Chạy 7 bộ bằng `env -u NFC_TOTP_KEY` để giống CI.
