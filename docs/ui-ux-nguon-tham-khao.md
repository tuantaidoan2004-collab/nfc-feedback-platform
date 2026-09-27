# Nguồn tham khảo UI/UX — cơ sở cho mọi thiết kế từ 27/09/2026

Tài chốt 27/09: *"Mọi câu chữ trong lời video trên doc tôi gửi đều rất quan trọng… Lấy doc đó làm cơ sở cho các thiết kế
sau này."* Tệp này là bản tóm tắt để làm việc. Nó đứng **sau** `google-policy.md` (luật Google thắng mọi thứ), và đọc
cùng `PRODUCT.md`, `DESIGN.md`, `thiet-ke-va-khuon.md`.

**Nguồn gốc:** tệp PDF của Tài *"nguồn tham khảo UI:UX"*, 66 trang: lời thoại kèm ảnh của bốn video uxpeak (sửa một trang
sản phẩm qua 15 lỗi; sáu nguyên lý tâm lý UX; ba cặp A/B về paywall, giá và trang đặt phòng; thanh điều hướng dưới trên
điện thoại), cộng 11 ảnh Tài chụp luồng uxpeak.com (trang chủ → đăng ký → Google → chào mừng + 3 câu hỏi → trang khoá học
→ bài học → paywall → thanh toán). **Tệp PDF không nằm trong repo**: repo đã công khai và nội dung là của uxpeak. Bản gốc
giữ ở máy Tài / Obsidian. Dưới đây là tóm tắt bằng lời của mình, không chép lời thoại.

Từ 27/09 gọi là **template**, không gọi "khuôn" (`decisions.md`).

## 1. Nguyên lý — rút từ bốn video

### 1a. Nền giao diện (video sửa trang sản phẩm)

- **Thiết kế cho hệ thống, không cho một ảnh.** Biểu tượng hay nút đặt đè lên ảnh phải có nền đỡ và viền mỏng, vì ảnh của
  mỗi shop sáng tối khác nhau. Ảnh trong cả danh mục phải cùng một lối chụp, cùng một nền.
- **Lưới và lề cố định**, mọi khối bắt đầu ở cùng một đường. Lệch vài pixel thì người xem không gọi tên được nhưng thấy
  trang kém tin cậy.
- **Màu phục vụ nội dung**, không tranh với nó. Ít màu, dịu, màu mạnh chỉ dành cho hành động chính.
- **Một họ chữ**, phân cấp bằng cỡ, độ đậm, màu, khoảng dòng. Tiêu đề nổi mà không gào. Đoạn văn khoảng dòng rộng,
  tương phản nhẹ hơn tiêu đề. Nhãn nhỏ in hoa thì giãn chữ; huy hiệu thì ngắn ("-20%", không cả câu kèm biểu tượng).
- **Đặt thông tin ở chỗ người ta cần nó**: tín hiệu tin cậy (sao, số đánh giá) nằm sát tên.
- **Chi tiết nhỏ làm nên cảm giác cao cấp**: biểu tượng cùng một kiểu, đường kẻ chia mảnh nhẹ, khoảng cách theo quan hệ
  giữa các khối (không phải càng nhiều khoảng trắng càng tốt), bỏ nhãn thừa ("Giá:" trước con số).
- **Hành động chính** không in hoa, không to quá cỡ. Đặt sát lựa chọn đi kèm, và ghi rõ kết quả trên nút (tổng tiền).
- **Làm dễ hơn, không chỉ đẹp hơn**: phần nội dung là một thẻ bo góc **trượt lên trên ảnh** khi cuộn, tên dính lên thanh
  trên. Vùng hành động dính ở đáy màn hình. Các lựa chọn phổ biến bấm một chạm là chọn xong.

### 1b. Tâm lý (video sáu nguyên lý)

- **Mặc định thông minh:** điền sẵn lựa chọn phổ biến nhất, vì phần lớn người dùng giữ nguyên mặc định. Nút ghi rõ kết
  quả ("12 kết quả").
- **Hiệu ứng gần đích:** đừng bao giờ bắt đầu từ 0%. Coi bước đầu (tạo tài khoản) là bước 1 đã xong.
- **Cho trước, hỏi sau:** đưa giá trị thật trước khi đòi đăng ký. Đừng khoá kết quả sau bức tường tài khoản.
- **Hiệu ứng IKEA / sở hữu:** cho người dùng tự dựng (tên, màu, kiểu thẻ) trước khi đăng ký. Nút ghi "Tiếp tục", không
  ghi "Đăng ký".
- **Sợ mất hơn ham được** và **so sánh tương đối:** đóng khung theo cái sắp mất; đừng đưa một con số đứng một mình, vì
  thứ người ta thấy trước sẽ thành cây thước.

### 1c. A/B (video ba cặp màn hình)

- **Đổi câu hỏi khó thành câu hỏi dễ:** "dùng thử hoạt động thế nào" thay cho "có đáng tiền không". Kèm một dòng thời
  gian (hôm nay / ngày 5 nhắc / ngày 7 thu), vì **hứa nhắc trước khi thu** làm người dùng tin hơn.
- **Chữ trên nút:** "Bắt đầu" nhẹ hơn "Đăng ký"; "của tôi" tạo cảm giác sở hữu; một con số cụ thể ("2 chạm") dập tắt
  nỗi lo. **Cụ thể là tin cậy.**
- **Hình thật hơn hình trang trí:** cho thấy thứ người ta sẽ nhận.
- **Một con số thay cho một khoảng.** Một từ xanh ("rẻ hơn") làm hộ việc so sánh.
- **Cảm xúc:** ảnh lớn chiếm nửa màn hình, câu chữ gợi cảm giác, thứ ngày thay cho ô ngày, tổng tiền ngay trên nút, câu
  trấn an ("huỷ miễn phí trước…") ngay dưới nút.
- Kết luận của video: **mỗi phần tử trên màn hình đang hỏi người dùng một câu**, và câu hỏi đó quyết định họ làm hay do dự.

### 1d. Thanh điều hướng dưới (video bottom nav)

3–5 mục (tối đa 6), chỉ những đích dùng nhiều nhất. Trợ giúp, đăng xuất, trang pháp lý **không** nằm ở đó. Có nhãn dưới
biểu tượng nếu người dùng không rành công nghệ. Biểu tượng 24px, nhãn 10–12px, **vùng chạm tối thiểu 44×44px**, nằm trên
vạch Home, tôn trọng vùng an toàn. Mục đang chọn phải khác ít nhất **hai thứ** (màu + nét đậm, hoặc viền → đặc).
Biểu tượng quen và cùng một kiểu. Ít màu, nền trung tính. Huy hiệu chỉ cho việc thật sự cần. Tách thanh khỏi nội dung
(viền 1px, nền khác, bóng nhẹ). Mục chưa chọn vẫn đạt tương phản 3:1. Có phản hồi khi chạm (vi tương tác).

### 1e. Ghi chú của Tài trong PDF

Trang 40, ảnh lưới thiết kế kiểu Dribbble: *"hình ảnh chỗ này đẹp nè, lấy giao diện như này làm library template được
đấy"* → **kho template** (M5) trình bày dạng lưới ảnh xem trước lớn như vậy.

## 2. Áp vào ba bề mặt

| Bề mặt | Áp gì | Không áp gì |
|---|---|---|
| **Trang khách** | Nút và biểu tượng trên poster có nền đỡ (1a). Thẻ nội dung trượt lên trên ảnh, nền đứng yên — trả lời đúng lời Tài chê 27/09 (nền bị kéo theo thẻ, → M4). Chữ, màu, khoảng cách theo 1a. Vi tương tác. | **Không một kỹ thuật tâm lý nào nhắm vào quyết định đánh giá Google**: không mỏ neo sao, không khung "sợ mất", không đếm ngược gây áp lực đánh giá, không mặc định sao (luật 1–3, 7). Nút Google vẫn giống hệt với mọi khách. |
| **Dashboard chủ quán** | Điện thoại: thanh dưới 3–5 mục có nhãn (1d). Mặc định thông minh ở trình chỉnh (1b). Tiến độ thiết lập không bắt đầu từ 0. Tổng tiền và câu trấn an ở chỗ trả tiền (1c). | Khung "sợ mất" để doạ chủ quán trả tiền — chỉ dùng khi nói thật (ví dụ trang sắp tạm ngừng vì chưa thanh toán). |
| **`/gov` (admin)** | Cùng hệ thiết kế với dashboard, nền trung tính, chữ phân cấp rõ. | — |

## 3. Ba ý của Tài (27/09) và đối chiếu luật

### Ý 1 — Popup trước khi sang Google: 4 giây rồi sang tab mới (Tài chốt 27/09)

Tài chốt: **không có nút "Sang Google ngay"**. Đếm đủ 4 giây rồi Google mở ở **tab mới**; **trang cũ trở lại bình
thường** (khách đóng tab Google là thấy lại trang quán). Câu chữ theo tinh thần Tài đưa: *"Trang sẽ tự động chuyển, quý
khách thân mến hãy quay lại trang này để khám phá thêm nhé, Merci beaucoup!"*, có số đếm, thân thiện. Dùng cho template
nhiều nội dung, khai trong manifest (`effects`, lát M2).

- **Luật Google: qua**, với bốn điều: như nhau cho mọi khách; không quà, không ưu đãi (luật 4, 8); không gợi sao hay nội
  dung (luật 7); không chữ nào đẩy khách phải đánh giá.
- **Điểm kỹ thuật phải thử thật, Claude quyết cách làm:** trình duyệt chỉ cho mở tab mới khi còn "hơi" của cú chạm.
  Chrome/Android giữ khoảng **5 giây** theo hiểu biết của Claude về Chromium — chưa đo (nên 4 giây vừa đủ, và **không bao giờ nâng quá 4**). iPhone (Safari và Chrome
  iOS cùng dùng WebKit) **chưa chắc** giữ lâu như vậy. Cách làm: đếm trên trang cũ, hết 4 giây thì mở tab mới. Nếu trình
  duyệt chặn (mở ra `null`), **ngay lúc đó** popup đổi thành một nút "Mở Google" — một chạm của khách, không phải nút bỏ
  qua đếm ngược. Thử trên iPhone thật trước khi phát hành.
- Thay ranh giới 300ms cũ (`thiet-ke-va-khuon.md` mục 12) và mức chặn 300 trong `template-manifest.ts` trong cùng lát.
- Đi kèm ý 3 (lời cảm ơn và tim bung ra) trong cùng popup.

### Ý 2 — Đăng ký cuốn như uxpeak, không đòi tiền lúc đầu

Luồng Tài thích (11 ảnh): một nút "Bắt đầu miễn phí" → đăng ký một khung (Google hoặc email) → màn chào mừng nói trước
"ba câu hỏi nhanh" → từng câu một, thanh tiến độ, có "Bỏ qua" → vào thẳng sản phẩm với một thứ dùng được ngay. Khác
uxpeak: **không bắt trả tiền ở cuối**. Mã chuyển khoản luôn có sẵn ở **tab Thanh toán (Billing)**; khi tới hạn mà quán
muốn dùng tiếp thì vào đó trả.

- Chạm hai việc đã có trong roadmap: **D4** (tự đăng ký + dùng thử, hôm nay vẫn do admin tạo shop ở `/gov`) và **P5b**
  (thu tiền: kỳ tháng, chuyển khoản QR, admin bấm "đã nhận"). Không cần dịch vụ trả phí nào.
- Áp 1b, 1c: cho chủ quán **dựng trang của mình trước** (tên, template, màu, xem trước ngay), rồi mới tạo tài khoản
  ("Tiếp tục"). Tiến độ không bắt đầu từ 0. Dòng thời gian dùng thử có câu "sẽ nhắc trước khi tới hạn".
- **Đăng nhập bằng Google cho chủ quán** là việc mới (hôm nay chỉ @handle + mật khẩu), phải cân nhắc riêng về bảo mật.
- Luật Google không liên quan tới luồng của chủ quán, trừ một điều: trong lúc hướng dẫn, không dạy chủ quán cách mời
  đánh giá trái mục 3 của `google-policy.md`.

### Ý 3 — Cảm xúc lúc bấm nút Google: lời cảm ơn của quán (Tài chốt 27/09)

Tài chốt: không dùng 😍 nói hộ cảm xúc của khách. Dùng chữ **"Cảm ơn quý khách đã ghé…"** — lời của quán — bung ra cùng
hiệu ứng tim nhẹ như pháo hoa khi popup hiện, rồi tan. **Shop sửa được câu này trong trình chỉnh template**, và câu mới
**phải qua admin duyệt** trước khi phát hành (như cửa duyệt ảnh, `thiet-ke-va-khuon.md` mục 10), để Tài yên tâm.

- Chữ tự do đặt sát lời mời Google → qua cả dây bẫy chữ (`google-policy.md` mục 3b: từ "đánh giá" cạnh "quà", "nhắc tên")
  **và** cửa duyệt. Không bao giờ hình ngôi sao. Tôn trọng "giảm chuyển động" (chỉ hiện, không bung).
- Cửa duyệt chữ là việc mới (hôm nay chỉ duyệt ảnh) → nhiều khả năng cần migration.
- **Về Google Search Console:** Tài định dùng để xem và sửa tiếp. Nó cho biết Google **Tìm kiếm** thấy trang thế nào
  (lập chỉ mục, lỗi, tốc độ) — rất nên có, cần xác minh tên miền bằng bản ghi DNS. Nó **không** báo vi phạm luật đánh
  giá; phần đó hiện ở **Hồ sơ doanh nghiệp Google** của từng quán.

## 4. Hướng sản phẩm Tài đưa thêm (27/09) — tất cả đều làm, liên quan chặt với nhau

1. **Vào trang chính trước, đăng nhập mới mở giao diện.** Chủ shop tới trang chính của nền tảng như mọi người; mở trình
   chỉnh và dashboard mới cần đăng nhập.
2. **Dựng trang trước, tạo tài khoản sau** (hiệu ứng IKEA, mục 1b).
3. **Trợ lý nhận xét cho chủ shop** (Tài viết "jev" — hiểu là trợ lý tự động trong dashboard; sai thì Tài sửa): "dữ liệu
   quá dày, nên tải về"; **tóm tắt hôm nay** bằng một mặt cười khi ổn, kèm một dòng "tốt, trừ vài khách ở các khung giờ
   sau" mà mỗi khung giờ là **link thẳng tới góp ý đó**.
4. **Con trỏ chờ gõ đổi nhiều màu** khi khách gõ, kiểu Gemini. Tài: "vẫn phải có".
5. **Dashboard "VIP":** video poster của chính quán chạy trên dashboard (cảm giác timelapse khách ra vào, thật); giao diện
   sinh động, có chuyển động; **một tông màu chủ đạo năng động** kiểu Higgsfield; cảm giác "như ứng dụng thời tiết".
6. **Chuẩn Dropbox:** chạy mượt như nhau trên mọi hệ điều hành; từng chi tiết làm ở tầng sâu của hệ thống.
7. **Video 3 phút** kể công nghệ của sản phẩm — chính video là MVP để khách hiểu (họ không biết mình cần tới khi đã dùng
   nhiều); video hiện ở vài bước trong luồng mới.
8. **Hoạt động sao Google của chính quán** trên dashboard (chỉ chủ shop xem), nối bằng mã trên Hồ sơ doanh nghiệp Google
   của quán, có hướng dẫn. Tài: "dashboard sẽ có giá trị x10". Tài chưa quen ai có hồ sơ để thử.

## 5. Claude suy ra và quyết (27/09)

Tài giao: đọc cùng tài liệu, tự suy ra thêm và quyết. Mỗi mục dưới đây là **quyết định**, trừ chỗ ghi "Tài chốt".

**A. Khoảnh khắc "à ra thế" trong 2 phút đầu — thấy trang của mình trên điện thoại của mình.** Trong luồng dựng trang
(ý 2 của Tài), ngay khi chủ quán chọn xong tên và template, màn hình hiện một **mã QR "Quét bằng điện thoại của bạn"**
mở bản nháp đó trên máy họ. Cho trước, hỏi sau (1b): họ cầm trên tay đúng thứ khách của họ sẽ thấy, **trước khi có tài
khoản**. Nút lưu ghi **"Lưu trang của tôi"**, không ghi "Đăng ký" (1b, 1c). Bản nháp chưa có tài khoản sống ngắn và
không phát hành được.

**B. Ba câu hỏi nhanh cho chủ quán, như uxpeak** (ảnh Tài chụp): loại quán (cà phê · spa · quán ăn…), giờ đông khách,
điều muốn cải thiện. Mỗi câu trả lời thành **mặc định thông minh** (1b): template theo ngành (A22), khung giờ cho bản
tóm tắt hôm nay (ý 3), thứ dashboard đặt lên đầu. Có "Bỏ qua". Tiến độ tính bước dựng trang là bước 1 **đã xong** —
không bao giờ bắt đầu từ 0.

**C. "Thời tiết của quán hôm nay"** — gộp ý 3, ý 5 của Tài. Không khí của dashboard (nền chuyển động, màu, mặt cười)
**phản ánh ngày thật của quán**: nắng khi góp ý hôm nay ổn, mây khi có vài khách chưa vui (kèm link tới đúng góp ý).
Cảm xúc sinh động nhưng **luôn là dữ liệu thật**, không trang trí suông. Tính bằng luật đơn giản trước (lượt quét, góp ý
riêng, sao nội bộ); trợ lý AI là bậc nâng sau (D3), đúng luật "từ gốc, nâng theo tuyến". **Luật 5, 10:** thời tiết không
bao giờ tính theo số đánh giá Google, và nhân viên không thấy số Google.

**D. Con trỏ nhiều màu — dùng bảng màu của template/quán, không dùng bốn màu Google.** Ô góp ý riêng phải trông **khác
Google**, vì trang đã hứa "Góp ý này không đăng lên Google"; khoác màu Google lên chính ô đó làm khách lẫn và làm yếu lời
hứa minh bạch (1c). Bốn màu nhảy theo nhịp gõ, lấy từ template; tôn trọng "giảm chuyển động".

**E. Chuẩn Dropbox cho một web app:** dashboard **cài được lên màn hình chính** (PWA) và **thông báo đẩy** khi có góp ý
riêng mới — không cần dịch vụ trả phí (web push chuẩn; iPhone cần iOS 16.4+ và thêm vào màn hình chính). Mọi lát giao
diện kiểm trên **Safari iPhone, Chrome iPhone, Chrome Android, máy tính**: lỗi 403 của Chrome iPhone ngày 27/09 là bằng
chứng một trình duyệt có thể hỏng riêng.

**F. Video 3 phút đặt ở ba chỗ:** trang chính (trước khi làm gì), màn chào mừng của luồng dựng trang, và **trạng thái
trống** của dashboard (chưa có lượt quét nào). Dựng được bằng HyperFrames (đã có trong bộ skill). Kịch bản là việc của
Tài; Claude viết nháp khi Tài muốn.

**G. Trạng thái trống là bước đầu tiên, không phải số 0.** Dashboard mới không hiện "0 lượt quét"; nó hiện việc kế tiếp
("Dán thẻ lên bàn và quét thử") và coi mỗi việc làm xong là một nấc tiến độ (1b).

**H. Thanh toán minh bạch như màn B của uxpeak (1c):** tab Thanh toán có **dòng thời gian** — hôm nay dùng thử · ngày X
nhắc · ngày Y tới hạn — kèm câu **"Chúng tôi sẽ nhắc trước khi tới hạn"**, mã chuyển khoản luôn sẵn. Hết hạn mà chưa trả
thì nói thật điều sẽ xảy ra ("khách quét thẻ sẽ thấy Trang tạm ngừng") — khung "sợ mất" chỉ dùng khi là sự thật (mục 2).

**I. Khi khách quay lại tab cũ sau Google:** trang chỉ được **cảm ơn**, không bật ưu đãi hay nội dung chỉ dành cho người đã
bấm Google (luật 8). Sự kiện của quán phải luôn hiện cho **mọi** khách, có bấm Google hay không.

**J. Sao Google của quán (ý 8) — nói thật đường đi.** "Mã" trên hồ sơ có hai loại, cho hai mức:
- **Place ID** (công khai, ai cũng lấy được): đủ để lấy **điểm trung bình và tổng số đánh giá** qua Places API. Thử được
  **với bất kỳ quán nào trên Maps**, không cần quen chủ hồ sơ. Nhưng Places API đòi một **tài khoản thanh toán Google
  Cloud** (có hạn mức miễn phí) — là dịch vụ trả phí theo `AGENTS.md`, **Tài chốt** trước khi bật.
- **Kết nối chủ hồ sơ** (OAuth, Business Profile API): đủ để đọc **từng đánh giá** và **trả lời** từ dashboard. Miễn phí
  nhưng Google phải **duyệt cấp quyền API** cho nền tảng, và chủ quán tự bấm cho phép. Làm sau bậc Place ID.
- Hiển thị: chỉ chủ shop, ghi rõ **"ước đoán"** (luật 10). Đây là C1 trong roadmap, giờ Tài kéo lên.

## 6. Một hành trình, không phải tám tính năng

```
Video 3 phút → trang chính → "Bắt đầu" → dựng trang (template dạng lưới, ảnh lớn — ghi chú trang 40)
  → QR: thấy trang trên điện thoại của mình (A) → 3 câu hỏi (B) → "Lưu trang của tôi" = tạo tài khoản
  → dashboard: thời tiết của quán (C), trạng thái trống thành bước đầu (G), sao Google của quán (J), cài lên màn hình + thông báo (E)
  → tab Thanh toán: dòng thời gian, mã chuyển khoản (H)
Phía khách: chạm thẻ → trang quán → nút Google → popup cảm ơn + tim + đếm 4 giây (ý 1, ý 3) → tab mới Google
  → quay lại tab cũ: lời cảm ơn, sự kiện vẫn như mọi khách (I) · ô góp ý riêng: con trỏ màu của quán (D)
```

## 7. Việc này đổi gì trong thứ tự làm

Không thêm lát nào vượt hàng: buổi **audit** kế tiếp xếp mọi thứ ở mục 3–6 vào đúng chỗ. Theo luồng module: ý 1, ý 3,
con trỏ màu, không khí dashboard là **hiệu ứng → M2**. Thẻ trượt lên ảnh, nền đứng yên → **M4**. Kho template dạng lưới
→ **M5**. Trang chính + dựng trang trước tài khoản + ba câu hỏi → **D4**. Tab Thanh toán → **P5b**. Sao Google → **C1**.
Cửa duyệt chữ cảm ơn → mở rộng cửa duyệt ảnh. Video 3 phút → việc của Tài, không chặn lát nào.
