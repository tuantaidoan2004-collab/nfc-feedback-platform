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

### Ý 1 — Popup trước khi sang Google, đếm ngược khoảng 4 giây

Nội dung Tài đưa: *"Trang sẽ tự động chuyển, quý khách thân mến hãy quay lại trang này để khám phá thêm nhé, Merci
beaucoup!"*, có số đếm, thân thiện; dùng cho **đa số template shop "xào nấu" nhiều, có nhiều thông tin và sự kiện**.
Mục đích: khách thấy trang này có công dụng thật, không chỉ để đánh giá.

- **Luật Google: qua**, nếu giữ bốn điều: hiện cho **mọi** khách như nhau; không nhắc quà hay ưu đãi (luật 4, 8); không
  gợi nội dung hay số sao (luật 7); không có chữ nào đẩy khách phải đánh giá.
- **Vướng một quyết định cũ của nền tảng:** `thiet-ke-va-khuon.md` mục 12, ranh giới 2 cho phép tối đa **300ms** trước
  khi sang Google, và trình kiểm manifest (`lib/publishing/template-manifest.ts`) đang chặn `leaveTransitionMs` > 300.
  Làm ý này thì sửa cả hai chỗ trong cùng lát (mới thay cũ).
- **Kỹ thuật:** sang Google sau một lúc chờ thì phải đi **cùng tab**; một tab mới mở trễ sẽ bị điện thoại chặn như popup.
  Khách quay lại bằng nút Back, và trang đã có sẵn `pageshow` để gỡ lớp phủ khi quay về.
- **Đề xuất của Claude, chờ Tài chốt:** popup có nút **"Sang Google ngay"** (không bao giờ nhốt khách 4 giây) và nút
  đóng. Đếm 3–4 giây. Tôn trọng "giảm chuyển động". Template khai hiệu ứng này trong manifest, thành một mục `effects`
  mới (thuộc M2, module hiệu ứng).

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

### Ý 3 — Cảm xúc lúc bấm nút Google

Tài muốn: đúng lúc popup hiện, một biểu tượng kiểu 😍 (tim trên mắt to hơn, hồng nhạt hơn) bung ra rồi tan như pháo hoa.

- **Không phạm luật nào viết thành chữ**: hiện cho mọi khách, không phụ thuộc số sao, không kèm quà.
- **Nhưng Claude không dám nói "chắc chắn":** 😍 là cảm xúc **của người đánh giá** ("tôi mê quán này"), hiện ngay
  trước khi họ chấm sao, nên có thể bị coi là **gợi cảm xúc cho đánh giá** — gần với luật 7 (không định nội dung). Cách
  an toàn hơn mà vẫn có cảm xúc: biểu tượng nói **lời cảm ơn của quán** (tim, 🥰, "Cảm ơn bạn!"), không nói hộ khách
  cảm nhận gì. Không bao giờ dùng hình ngôi sao ở đây. **Tài chốt chọn nào.**
- Tôn trọng "giảm chuyển động" (khi đó chỉ hiện, không bung).

## 4. Việc này đổi gì trong thứ tự làm

Không thêm lát nào vượt hàng: buổi **audit** kế tiếp đặt các ý trên vào đúng chỗ. Ý 1 và ý 3 là hiệu ứng → **M2**. Thẻ
trượt lên ảnh, nền đứng yên → **M4**. Kho template dạng lưới → **M5**. Ý 2 → **D4 + P5b**, trước đây để sau, giờ Tài kéo
vào đợt cải tổ.
