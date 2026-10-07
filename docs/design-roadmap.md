> Ghi chú 05/10/2026 (phiên 10, sửa phiên 11): tài liệu thiết kế cũ. Chỗ nào nói màn hình quầy, mã quầy, Wi-Fi quán là **đã bỏ**. Khách chứng minh đang ở quán bằng 1 trong 2 lối vào: vé từ trang quán QS (quán có QS), hoặc thẻ NFC riêng của Tiệm — chip NTAG21x thường, UID + bộ đếm chạm, không phải 424 DNA (quán chưa có QS). Xem `README.md`, `docs/CONTRACT.md`, `docs/phoi-hop-voi-QS.md`.

## Bạn nên làm gì, theo thứ tự

### Trả lời nhanh: tempmail đẩy thư về hệ thống của mình có ổn không?

Đúng hướng. Thư đổ về hệ thống của bạn, hệ thống tự lọc rồi quyết định cho ai xem mã. Nên làm theo kiểu này.

Có 1 điều kiện bắt buộc: **hệ thống của bạn phải là nơi DUY NHẤT đọc được hộp thư.**

- Nếu trang tempmail vẫn cho người lạ gõ địa chỉ là xem được hộp thư: khách cũ đã biết email tài khoản, nên ngồi ở nhà mở trang tempmail là đọc được mã. Bộ lọc của bạn vẫn thấy "mã mồ côi" và báo động, nhưng **không chặn được**. Báo động mà không chặn được thì bạn chỉ biết là mình vừa mất slot.
- Nếu chỉ hệ thống của bạn đọc được thư: bộ lọc vừa phát hiện vừa chặn được. Khách cũ có bấm "gửi mã" ở nhà thì mã chỉ về hệ thống của bạn, không ai thấy, và Telegram báo đỏ.

*Mã mồ côi* là mã đăng nhập về hộp thư mà trong 3 phút trước đó không ai bấm "Lấy mã" trên web của bạn.

Vì vậy việc số 1 tuần này là **kiểm tra "cửa hậu" của tempmail** (hướng dẫn ở dưới). Kết quả kiểm tra quyết định bạn giữ tempmail hay chuyển đi.

Nói một lần cho rõ: đưa tài khoản cá nhân dùng chung cho người lạ là vi phạm điều khoản của đa số nhà cung cấp, và dễ bị khoá. Công cụ nào có gói Team/Business thì nên mời tài khoản của chính khách vào làm thành viên, hết hạn thì xoá ra.

---

### 1. Làm ngay tuần này

| # | Việc | Ai làm | Thế nào là xong |
|---|---|---|---|
| 1 | Kiểm tra cửa hậu tempmail | Bạn | Có kết luận GIỮ hoặc CHUYỂN, ghi ra giấy |
| 2 | Nhắn đồng nghiệp: dùng chip NTAG 424 DNA, và khoá do server của bạn giữ | Bạn gửi, đồng nghiệp xác nhận | Đồng nghiệp đồng ý đủ 7 điểm bằng tin nhắn, có ngày giao 5 thẻ thử |
| 3 | Chọn 2–3 công cụ pilot, kiểm kê kho | Bạn | Có bảng: công cụ, số tài khoản, đăng nhập bằng gì, có gói Team không, có đổi email được không |
| 4 | Chọn 1 quán pilot | Bạn + chủ quán | Chủ quán đồng ý, có ngày bắt đầu, có tên người trực ca đêm |
| 5 | Mua tên miền riêng cho kho, đưa lên Cloudflare | Bạn hoặc người làm kỹ thuật | Gửi thư thử tới test@tênmiền thì thấy hiện trên Telegram (nếu việc 1 ra GIỮ thì có thể làm sau) |
| 6 | Bắt đầu thủ tục xác minh số điện thoại | Bạn | Đã nộp hồ sơ xác thực Zalo OA (nếu chọn ZNS), hoặc đã có 2 báo giá SMS OTP |
| 7 | Tìm người viết phần mềm, gửi danh sách MVP ở mục 3 | Bạn | Có báo giá và ngày bắt đầu |

**Việc 1: Kiểm tra cửa hậu tempmail (khoảng 30 phút)**

Lấy địa chỉ email thật của 1 tài khoản trong kho để thử.

- [ ] B1. Lấy 1 điện thoại khác, tắt Wi-Fi để dùng 4G, mở tab ẩn danh. Không đăng nhập gì cả.
- [ ] B2. Vào web hoặc app của dịch vụ tempmail, gõ đúng địa chỉ đó. Nếu thấy hộp thư → **TRƯỢT**.
- [ ] B3. Nếu dịch vụ có kiểu link mở thẳng hộp thư (ví dụ …/inbox/địa-chỉ), dán link đó vào. Nếu mở được → **TRƯỢT**.
- [ ] B4. Từ Gmail cá nhân, gửi thư "TEST 123" tới địa chỉ đó. Ghi lại: bao nhiêu giây thì hệ thống của bạn nhận được? Thư có hiện ra ở B2 không?
- [ ] B5. Đọc điều khoản hoặc hỏi nhà cung cấp 4 câu: Địa chỉ có bị hết hạn rồi cấp cho người khác không? Có tắt được chỗ xem thư trên web không? Thư đẩy về có kèm khoá bí mật không? Xử lý xong có xoá thư được không?
- [ ] B6. Ghi lại: tên miền của email là của bạn hay của dịch vụ tempmail?

**Chỉ giữ tempmail khi đạt CẢ 5 điều kiện sau:**

| # | Điều kiện | Nếu trượt thì |
|---|---|---|
| 1 | Gõ địa chỉ ở bất cứ đâu cũng không đọc được thư (B2, B3 không thấy gì) | Chuyển **ngay**. Chưa đưa tài khoản đó vào dùng thử |
| 2 | Địa chỉ không bao giờ bị thu hồi rồi cấp cho người khác | Chuyển trong 2–3 tuần |
| 3 | Thư đẩy về hệ thống trong vòng 30 giây, có khoá bí mật (để người ngoài không giả thư đẩy vào được) | Chuyển trong 2–3 tuần |
| 4 | Xoá được thư sau khi xử lý, hoặc thư tự xoá trong vòng 7 ngày | Chuyển trong 2–3 tuần |
| 5 | Tên miền là của bạn, hoặc là dịch vụ trả phí có cam kết | Chuyển trong 2–3 tuần |

Dù đạt hết vẫn để báo động mã mồ côi luôn bật. Nó giống chuông báo cháy, không bao giờ tắt.

**Nếu trượt thì chuyển như sau (khoảng 1 tuần, làm song song với việc khác):**

1. Mua 1 tên miền riêng cho kho, khoảng 300–400 nghìn/năm. Không dùng kho.tiembanquyen.com vì 2 lý do: (a) không đụng tới trang web đang chạy; (b) Cloudflare chỉ cho tạo quy tắc "nhận hết mọi địa chỉ" (catch-all) ở tên miền chính. Nếu dùng tên miền phụ thì phải tạo từng địa chỉ một, tối đa 200 cái.
2. Đưa tên miền lên Cloudflare (miễn phí), bật Email Routing. Tạo 1 quy tắc catch-all chuyển thư vào 1 Email Worker. *Worker là một đoạn code nhỏ chạy trên Cloudflare.*
3. Worker đẩy thư về hệ thống lọc của bạn **theo đúng định dạng tempmail đang đẩy**. Bộ lọc bạn đang làm vẫn dùng lại được, chỉ đổi nguồn thư.
4. Nhân viên đổi email cho từng tài khoản trong kho, làm tay, khoảng 5 phút mỗi tài khoản: đăng nhập → vào cài đặt tài khoản → đổi email sang địa chỉ mới (ví dụ a01@tênmiền) → mã xác nhận về hệ thống của bạn → xong → ghi vào bảng kho.
5. Tài khoản nào không cho đổi email thì rút khỏi kho dùng thử.
6. Chỉ chuyển tài khoản của các công cụ pilot trước. 20 tài khoản mất khoảng 2 giờ.
7. Làm lại B2 với địa chỉ mới để chắc chắn không ai đọc được.

**Việc 2: Tin nhắn mẫu gửi đồng nghiệp làm thẻ (copy và gửi)**

Vì sao phải nói chuyện khoá: ai giữ khoá thì người đó làm giả được lượt chạm. Server nào kiểm tra lượt chạm thì server đó phải giữ khoá, ở đây là server của bạn.

> Chào anh/chị, về thẻ NFC cho dự án quán cà phê, em cần thống nhất 7 điểm:
> 1. Chip **NTAG 424 DNA**, hàng NXP chính hãng. Phần dùng thử không dùng NTAG213/215/216, vì loại đó có link cố định: khách chụp link lại là về nhà dùng mãi được.
> 2. Bật **SUN/SDM**: mỗi lần chạm, link có số định danh thẻ (UID), bộ đếm tăng dần và chữ ký CMAC.
> 3. Link trên thẻ trỏ về tên miền của em, ví dụ `https://t.<tên-miền>/c?...`. Server của em kiểm tra chữ ký trước. Nếu phần việc của anh/chị cũng cần dùng thẻ này thì sau bước kiểm tra, server em chuyển tiếp sang trang của anh/chị. Mình bàn thêm cách nối.
> 4. Đổi hết 5 khoá mặc định (lúc xuất xưởng toàn số 0). Khoá của từng thẻ được tạo từ 1 khoá gốc **do em giữ** cộng với UID của thẻ. Khoá quản trị (Key 0) và khoá ký SUN phải nằm ở server của em. Nếu anh/chị cần khoá để ghi thẻ thì ghi xong không giữ lại bản sao, hoặc em sẽ đổi Key 0 sau khi nhận thẻ.
> 5. Gửi em danh sách UID thẻ, kèm quán và số bàn tương ứng.
> 6. Đợt 1 gồm 5 thẻ thử. Đợt 2 là thẻ cho quán pilot (bằng số bàn, cộng 5 thẻ dự phòng). Anh/chị cho em ngày giao dự kiến.
> 7. Nghiệm thu: chạm 3 lần thì bộ đếm tăng đều; copy link mở lại thì server từ chối.

**Việc 4: Tiêu chí chọn quán pilot**

- Mở 24h, có 15–30 bàn, khách chủ yếu là sinh viên và người làm tự do (hay cần AI, CapCut, Canva).
- Chủ quán quen biết. Có 1 nhân viên trực đêm chỉ được cho khách cách "chạm thẻ".
- Gần chỗ bạn để tiện ghé.
- Có thoả thuận 1 trang: chạy 2 tuần; quán chỉ đặt thẻ và hướng dẫn khách, **không** đụng vào tài khoản hay mã; quán được gì; bên nào muốn dừng thì dừng ngay được.

---

### 2. Những việc chỉ bạn quyết được

| Quyết định | Các lựa chọn | Đề xuất |
|---|---|---|
| Công cụ pilot | 2–3 công cụ | 1 công cụ có gói Team/Business để mời tài khoản của khách vào (ví dụ ChatGPT Business, Claude Team, Canva Teams, nếu bạn có gói). Thêm 1–2 công cụ đăng nhập bằng mã gửi về email. Pilot nên tránh công cụ chỉ đăng nhập bằng mật khẩu và giới hạn thiết bị chặt. |
| Số slot mỗi ngày | 5 / 10 / 15 | 3 ngày đầu 5 slot/ngày, sau đó 10. Kho cần **gấp đôi** số slot mỗi ngày, vì 1 tài khoản bận 24h rồi còn chờ dọn. 10 slot/ngày cần khoảng 20 tài khoản hoặc chỗ ngồi Team. |
| "1 ngày" tính thế nào | A. 24 tiếng kể từ lúc nhận. B. Đến 12:00 trưa hôm sau. | **Chọn A.** Quán mở 24h: khách nhận lúc 2h sáng mà theo B thì chỉ còn 10 tiếng, dễ bị chê. Hệ thống ngừng phát mã đúng giờ, nhân viên dọn theo 2 đợt cố định mỗi ngày. Trang của khách luôn hiện chính xác giờ kết thúc. |
| Xác minh số điện thoại | ZNS OTP / SMS OTP / pilot chưa cần OTP | Chọn ZNS nếu bạn có giấy đăng ký kinh doanh (hộ kinh doanh cũng được) và Zalo OA đã xác thực. Cách này vừa xác minh vừa kéo khách vào Zalo. Nếu chưa có: 2 tuần pilot chạy không OTP nhưng giới hạn chặt, và **bắt buộc có OTP trước khi mở quán thứ 2**. |
| Thế nào là "1 khách" | Theo số ĐT / theo máy / cả hai | Cả hai. 1 số ĐT chỉ được thử 1 lần (mãi mãi, hoặc sau 6 tháng mới được thử lại). 1 máy cũng chỉ 1 lần. |
| Quán được gì | Hoa hồng / tài khoản cho nhân viên quán / không có gì | Ví dụ: hoa hồng cho mỗi đơn trả phí có mã của quán |
| Ai dọn tài khoản, mấy giờ | — | 1 người cố định, dọn 2 đợt: 10:00 và 22:00 |

*OTP là mã dùng 1 lần gửi về điện thoại. ZNS là tin nhắn mẫu Zalo gửi tới số điện thoại.*

---

### 3. MVP: bản nhỏ nhất mà vẫn an toàn để pilot

*MVP là phiên bản tối thiểu nhưng chạy thật được.*

**Phải xong trước khi lắp thẻ ở quán:**

- [ ] 1. **Kiểm tra lượt chạm:** chữ ký đúng, bộ đếm tăng, mỗi link chỉ dùng 1 lần và hết hạn sau 3 phút. Có nút khoá thẻ.
- [ ] 2. **Trang nhận slot:** khách chọn 1 công cụ, nhập số ĐT, tick đồng ý cho xử lý dữ liệu, máy được gắn cookie. Chặn khi: số ĐT đã nhận rồi, máy đã nhận rồi, hoặc hết slot trong ngày.
- [ ] 3. **Bảng kho:** mỗi tài khoản có 1 trong 4 trạng thái: Sẵn sàng / Đang dùng / Chờ dọn / Cách ly.
- [ ] 4. **Nhận và lọc thư:** Cloudflare → Worker → hệ thống. Mã nào khớp với một lần bấm "Lấy mã" trong 3 phút, từ đúng máy, thì hiện cho khách. Không khớp thì giấu mã và Telegram báo đỏ. Thư bảo mật (đổi mật khẩu, bật 2FA, đổi email, thêm cách đăng nhập) thì cách ly tài khoản và thu lại slot.
- [ ] 5. **Bot Telegram:** báo các ca đỏ. Ca vàng có 3 nút Duyệt / Từ chối / Khoá. Sau 10 phút không ai bấm thì tự từ chối.
- [ ] 6. **Hết hạn:** đúng giờ thì ngừng phát mã. Trang của khách hiện "Hết hạn", nút Zalo và **mã ưu đãi riêng** cho từng lượt (để đếm được bao nhiêu khách mua).
- [ ] 7. **Danh sách dọn cho nhân viên:** có nút "Lấy mã nhân viên" (để lúc nhân viên đăng nhập dọn không bị báo đỏ) và nút "Đã dọn". Tài khoản chưa bấm "Đã dọn" thì không giao cho ai.
- [ ] 8. **Dữ liệu cá nhân:** IP và cookie xoá sau 30 ngày. Số ĐT lưu dạng băm (mã hoá một chiều, không đọc ngược ra số được) để chặn nhận lại.

Phân loại xanh, vàng, đỏ dùng luật cố định, chưa cần chấm điểm rủi ro. Phần mềm chạy trên gói miễn phí của Cloudflare (Workers và cơ sở dữ liệu D1) là đủ cho pilot.

**Để sau, chỉ làm khi pilot đạt:**

| Để sau | Vì sao chưa cần |
|---|---|
| Chấm điểm rủi ro gộp nhiều tín hiệu | 1 quán thì luật cố định xanh/vàng/đỏ là đủ |
| Chế độ ban đêm, thời gian chờ theo ca | Tự từ chối sau 10 phút là đủ |
| Tự khoá thẻ khi có dấu hiệu lạ | Pilot: thẻ nào quá 10 lượt/giờ thì Telegram báo, bạn khoá tay |
| Báo cáo cho chủ quán | Mỗi tuần chụp màn hình số liệu gửi |
| Cách nhận slot cho máy không có NFC | Đếm xem có bao nhiêu khách gặp trường hợp này đã |
| Kiểm tra Wi-Fi của quán | Tín hiệu yếu, khách bật 4G là né được |
| Nhiều quán, phân quyền | Pilot chỉ có 1 quán |

**Không bao giờ làm:** phần mềm tự thao tác trên web nhà cung cấp (tự đăng xuất, tự đổi mật khẩu, tự đọc bảng điều khiển); bất cứ thứ gì nhằm né cơ chế phát hiện chia sẻ tài khoản hay thiết bị của nhà cung cấp; bắt khách đánh giá Google mới cho nhận slot.

---

### 4. Lịch theo tuần

| Tuần | Làm gì | Ai | Thế nào là xong |
|---|---|---|---|
| 0 (tuần này) | 7 việc ở mục 1. Đặt thẻ ngay, vì hàng ngoại có thể mất 1–3 tuần mới về | Bạn, đồng nghiệp | Có kết luận về tempmail, đã đặt thẻ, quán đồng ý, có người viết phần mềm |
| 1 | Tên miền, Cloudflare, Worker đẩy thư về hệ thống, Telegram. Đổi email các tài khoản pilot. Bắt đầu làm phần kiểm tra lượt chạm | Người viết phần mềm, nhân viên | Mọi mã của tài khoản pilot đều hiện trên Telegram. Trang tempmail cũ không còn nhận thư mới |
| 2 | Hoàn thành 8 phần MVP. Ghi 5 thẻ thử. 3–5 người quen "thử phá" trong 2 ngày. Chạy thử 1 đợt dọn | Người viết phần mềm, bạn | Qua đủ 9/9 bài thử phá bên dưới |
| 3 | Lắp thẻ ở quán. 3 ngày đầu 5 slot/ngày, sau đó 10. Mỗi sáng xem số liệu 10 phút | Bạn, quán | Chạy đủ 7 ngày, ca đỏ nào cũng đã xử lý |
| 4 | Pilot tuần thứ 2, 10–15 slot/ngày. Cuối tuần ngồi với chủ quán 15 phút | Bạn | Đủ số liệu 14 ngày |
| 5 | Chấm theo bảng ở mục 6, rồi quyết: làm tiếp / sửa / dừng. Nếu làm tiếp: thêm OTP (nếu chưa có), thêm 2 quán | Bạn | Quyết định ghi ra giấy |
| 6 trở đi | Mỗi tuần thêm 1–2 quán, tối đa 10 quán. Làm dần các mục "Để sau" | Bạn | — |

Nếu thẻ về trễ thì lùi pilot. **Không** thay bằng NTAG213.

**9 bài thử phá (tuần 2, bài nào cũng phải đạt):**

- [ ] 1. Chạm thẻ, copy link, 5 phút sau mở lại → bị từ chối.
- [ ] 2. Mở link đó lần thứ 2 ngay lập tức → bị từ chối.
- [ ] 3. Chạm ở quán, về nhà mới bấm "Lấy mã" (quá 3 phút) → hiện "Chạm lại thẻ tại quán nhé".
- [ ] 4. Cùng máy, nhận lần 2 bằng số ĐT khác → bị chặn.
- [ ] 5. Cùng số ĐT, dùng máy khác → bị chặn.
- [ ] 6. Đăng nhập tài khoản mà không bấm "Lấy mã" → trong 1 phút Telegram báo đỏ, không ai thấy mã.
- [ ] 7. Đổi mật khẩu hoặc bật 2FA trên tài khoản thử → tài khoản bị cách ly, slot bị thu lại.
- [ ] 8. Sau giờ hết hạn bấm "Lấy mã" → bị từ chối, hiện nút Zalo và mã ưu đãi.
- [ ] 9. Cùng khách xin mã từ máy thứ 2 → thành ca vàng, Telegram gửi kèm 3 nút.

---

### 5. Chi phí ước tính

Giá tham khảo tháng 10/2026, có thể thay đổi. Quy đổi khoảng 26.000đ/USD, 30.000đ/EUR.

| Hạng mục | Pilot (1 quán, 1 tháng) | 10 quán (mỗi tháng) | Ghi chú |
|---|---|---|---|
| Thẻ NTAG 424 DNA | 25 thẻ × 38–48 nghìn ≈ 1–1,2 triệu (mua lẻ từ châu Âu), chưa tính ship | Mua sỉ 1.000 thẻ × 8–11 nghìn ≈ 8–11 triệu, trả 1 lần (Trung Quốc, đặt tối thiểu 1.000) | Hỏi thêm các công ty RFID trong nước để có giá bằng VND |
| So sánh: NTAG213 | 25 × 5–12 nghìn ≈ 125–300 nghìn | — | Rẻ hơn khoảng 1 triệu cho 1 quán, nhưng không chặn được spam ở nhà. Không dùng cho phần dùng thử |
| Tên miền riêng | 300–400 nghìn/năm (giá gia hạn); năm đầu hay có khuyến mãi | Như pilot | — |
| Cloudflare Email Routing, Worker, cơ sở dữ liệu | 0đ | 0đ | Gói miễn phí: nhận thư không giới hạn, 100.000 lượt gọi/ngày. Cần thêm thì gói trả phí từ khoảng 5 USD/tháng |
| VPS (nếu người làm không dùng Cloudflare) | 60–150 nghìn/tháng | 100–250 nghìn/tháng | — |
| Bot Telegram | 0đ | 0đ | — |
| ZNS OTP | 300đ + VAT ≈ 330đ/tin gửi thành công. Khoảng 300 tin ≈ 100 nghìn | Khoảng 4.500 tin ≈ 1,5 triệu | Cần OA doanh nghiệp đã xác thực. Gửi qua API cần gói OA "Tăng trưởng": 1,4 triệu/6 tháng hoặc 2,5 triệu/năm (bảng giá Zalo từ 1/6/2026). Hỏi lại đối tác ZNS cho chắc |
| SMS OTP (nếu không dùng ZNS) | 500–850đ/tin, cộng phí brandname khoảng 50 nghìn/nhà mạng/tháng | — | Đăng ký brandname mất thời gian |
| Người viết phần mềm | Theo báo giá | — | Gửi đúng danh sách MVP ở mục 3 để báo giá sát |
| Giá vốn slot trong kho, hoa hồng cho quán | Bạn tự điền | — | — |

**Tổng chi phí chạy (chưa tính phần mềm, giá vốn kho và hoa hồng):**
- Pilot: khoảng 0,3–0,5 triệu/tháng, cộng thẻ khoảng 1–1,5 triệu trả 1 lần.
- 10 quán: khoảng 1,8–2 triệu/tháng, cộng thẻ khoảng 8–11 triệu trả 1 lần.

---

### 6. Chỉ số pilot và ngưỡng quyết định

Các ngưỡng dưới đây là điểm xuất phát. Hết tuần đầu có thể chỉnh.

| Chỉ số | Đạt | Xem lại | Dừng |
|---|---|---|---|
| Lượt chạm hợp lệ mỗi ngày | ≥ 8 | 3–7 | < 3 (quán vắng hoặc khách không hiểu cách dùng) |
| Tỷ lệ chạm → nhận slot thành công | ≥ 40% | 20–40% | < 20% (các bước quá rườm rà) |
| Thời gian từ lúc chạm đến lúc dùng được (lấy mức giữa) | ≤ 3 phút | 3–6 phút | > 6 phút |
| Mã mồ côi trên 100 slot | ≤ 5, và giải thích được hết | 6–10 | > 10 |
| Có lần đăng nhập thành công mà mình không phát mã | 0 | — | **Chỉ cần 1 lần là dừng ngay** (vẫn còn cửa hậu) |
| Ca đỏ trên tổng số yêu cầu | ≤ 10% | 10–20% | > 20% |
| Ca vàng bạn phải tự duyệt mỗi ngày | ≤ 5 | 6–10 | > 10 (luật đang quá chặt) |
| Tài khoản bị nhà cung cấp khoá hoặc cảnh báo | 0 | 1 | ≥ 2 thì dừng công cụ đó |
| Khách nhắn Zalo trong 7 ngày (tính bằng mã ưu đãi) | ≥ 15% | 8–15% | < 8% |
| Khách mua gói trả phí trong 14 ngày | ≥ 5% | 2–5% | < 2% |
| Chi phí cho mỗi khách mua | ≤ 50% lãi gộp đơn đầu tiên | 50–100% | > 100% |
| Thời gian dọn mỗi ngày | ≤ 45 phút | 45–90 phút | > 90 phút |
| Phàn nàn từ quán hoặc khách | 0–1 | 2–3 | Quán muốn dừng |

**Luật quyết định:** làm tiếp khi không có ô nào rơi vào cột Dừng và ít nhất 2/3 số chỉ số ở cột Đạt.

**Cách tính chi phí cho mỗi khách mua:**
(giá vốn các slot đã phát + OTP + tiền thẻ chia đều 12 tháng + gói OA + giờ công dọn + hoa hồng quán) ÷ số khách mua.

Ví dụ giả định cho 2 tuần pilot:
- 140 lượt × 15 nghìn giá vốn = 2,1 triệu
- OTP: 0,1 triệu
- Thẻ (phần chia cho 2 tuần): 0,05 triệu
- Gói OA: 0,12 triệu
- Dọn: 10 giờ × 30 nghìn = 0,3 triệu
- Cộng lại khoảng 2,7 triệu. Có 7 khách mua (5%) thì mỗi khách tốn khoảng 380–400 nghìn. Đem so với lãi gộp đơn đầu tiên của bạn.

---

### 7. Quy trình dọn tài khoản khi hết hạn (in ra để tick)

**Mỗi đợt dọn (10:00 và 22:00):**

- [ ] Mở "Danh sách dọn" trên hệ thống. Hệ thống tự gom các tài khoản đã hết hạn và xếp theo công cụ.
- [ ] Dùng máy làm việc cố định. Mở trình quản lý mật khẩu (ví dụ Bitwarden).
- [ ] Dọn xong hết 1 công cụ rồi mới sang công cụ khác, cho đỡ phải đổi trang và đỡ nhầm.
- [ ] Trước khi đăng nhập tài khoản nào, bấm "Lấy mã nhân viên" để mã hiện cho mình và không bị báo đỏ.
- [ ] Mỗi tài khoản làm theo loại A, B hoặc C ở bảng dưới, tick xong thì bấm "Đã dọn".
- [ ] Gặp gì bất thường thì làm theo loại D.
- [ ] Cuối đợt, số tài khoản "Chờ dọn" phải về 0. Chụp màn hình gửi vào nhóm.
- [ ] Không bao giờ gửi mật khẩu hay mã qua tin nhắn Zalo hoặc Telegram.

| Loại | Các bước | Thời gian mỗi tài khoản |
|---|---|---|
| **A. Mời thành viên Team/Business** | Vào trang quản trị của gói → Thành viên → xoá khách đã hết hạn → kiểm tra ghế đã trống. Không để tài liệu chung trong khu dùng thử. | Khoảng 1 phút |
| **B. Đăng nhập bằng mã email** (khách không biết mật khẩu) | Đăng nhập → bấm "Đăng xuất khỏi mọi thiết bị" (nếu dịch vụ có) → xoá lịch sử chat, tệp, dự án của khách trước (khách sau không được thấy) → kiểm tra email, số ĐT, 2FA, cách đăng nhập liên kết (Google/Apple), passkey không bị thêm hay đổi → bấm "Đã dọn" | 3–4 phút |
| **C. Đăng nhập bằng mật khẩu** | Làm như B, cộng thêm: đổi mật khẩu mới (tạo ngẫu nhiên trong trình quản lý mật khẩu), chọn đăng xuất các thiết bị khác khi đổi, lưu mật khẩu mới vào kho | 4–5 phút |
| **D. Có bất thường** (email, 2FA, số ĐT bị đổi, có đăng nhập lạ) | Dừng lại, không dọn tiếp. Bấm "Cách ly" và báo bạn. Tài khoản đó không giao cho ai nữa cho đến khi bạn kiểm tra xong | — |

**Tính thời gian:** 10 slot/ngày nghĩa là khoảng 10 tài khoản cần dọn mỗi ngày, chia 2 đợt, mỗi đợt khoảng 15 phút, tổng khoảng 30 phút/ngày.

**Cần biết:** từ lúc hết hạn đến đợt dọn kế tiếp, khách cũ vẫn có thể còn đăng nhập, lâu nhất khoảng 12 tiếng, nhưng không lấy được mã mới. Muốn rút ngắn khoảng này thì thêm đợt dọn.

### Câu hỏi mở
- Bạn đang dùng dịch vụ tempmail nào? Sau khi làm bài kiểm tra cửa hậu (B1–B6), kết quả là GIỮ hay CHUYỂN?
- Pilot dùng 2–3 công cụ nào? Trong đó công cụ nào bạn đang có gói Team/Business để mời tài khoản của khách? Tài khoản trong kho có đổi được email đăng nhập không?
- "1 ngày" tính theo cách A (24 tiếng kể từ lúc nhận) hay cách B (đến 12:00 trưa hôm sau)? Dọn mấy đợt mỗi ngày, vào giờ nào?
- Bạn đã có giấy đăng ký kinh doanh hoặc hộ kinh doanh và Zalo OA đã xác thực chưa? Nếu có thì dùng ZNS OTP (và có chịu trả gói OA Tăng trưởng không?). Nếu chưa thì chạy pilot không OTP, hay dùng SMS OTP?
- Một số điện thoại được thử 1 lần mãi mãi, hay sau 6 tháng được thử lại?
- Quán đối tác được gì (hoa hồng mỗi đơn, tài khoản cho nhân viên, hay không có gì)? Chọn quán nào làm pilot?
- Đồng nghiệp có đồng ý để link trên thẻ trỏ về tên miền của bạn và để server của bạn giữ khoá gốc (Key 0 và khoá SUN) không? Phần việc của đồng nghiệp nối vào sau bước kiểm tra theo cách nào?
- Ai viết phần mềm MVP? Nhân viên nào phụ trách dọn tài khoản mỗi ngày?
- Giá vốn của 1 slot dùng thử mỗi ngày là bao nhiêu, và lãi gộp trung bình của đơn đầu tiên là bao nhiêu? Cần 2 con số này để tính ngưỡng chi phí cho mỗi khách mua.

### Nguồn
- https://shopnfc.com/en/70-ntag-dna
- https://nfc.cards/en/white-cards/46-nfc-card-ntag424-dna.html
- https://www.alibaba.com/premium/ntag_424_dna.html
- https://trackify.vn/the-rfid/the-nfc/
- https://linhkienthuduc.com/san-pham/the-tu-nfc-ntag213-tan-so-13-56mhz/
- https://www.nxp.com/docs/en/application-note/AN12196.pdf
- https://community.nxp.com/t5/NFC/Change-NTAG-424-DNA-Encryption-Key-for-Production/td-p/1915923
- https://developers.cloudflare.com/email-routing/limits/
- https://developers.cloudflare.com/email-service/configuration/subdomains/
- https://developers.cloudflare.com/email-service/platform/pricing/
- https://blog.cloudflare.com/email-routing-subdomains/
- https://zalo.solutions/zns/pricing
- https://zalo.solutions/oa/pricing
- https://worldfone.cloud/vi/blog/bang-gia-zalo-zns-tin-cskh-va-quang-cao
- https://miccreative.vn/dieu-kien-gui-thong-bao-zns/
- https://www.mobifone.vn/doanh-nghiep/cong-nghe-thong-tin/chi-tiet/24
- https://interdata.vn/thue-vps/
- https://azdigi.com/pro-vps
- https://www.bkns.vn/ten-mien/bang-gia-ten-mien.html
- https://hvn.vn/domain/bang-gia-ten-mien/