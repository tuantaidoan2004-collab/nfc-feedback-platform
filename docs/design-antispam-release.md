> Ghi chú 05/10/2026 (phiên 10, sửa phiên 11): tài liệu thiết kế cũ. Chỗ nào nói màn hình quầy, mã quầy, Wi-Fi quán là **đã bỏ**. Khách chứng minh đang ở quán bằng 1 trong 2 lối vào: vé từ trang quán QS (quán có QS), hoặc thẻ NFC riêng của Tiệm — chip NTAG21x thường, UID + bộ đếm chạm, không phải 424 DNA (quán chưa có QS). Xem `README.md`, `docs/CONTRACT.md`, `docs/phoi-hop-voi-QS.md`.

## Trước tiên: "Tempmail đẩy về hệ thống, hệ thống tự lọc", vậy nên làm gì?

### Kết luận ngắn
- Hướng này đúng: thư về kho được đẩy vào hệ thống của bạn, hệ thống lọc rồi quyết định ai được xem mã.
- Nhưng bộ lọc **chỉ có tác dụng khi hệ thống của bạn là đường duy nhất để đọc hộp thư**.
- Nhiều trang tempmail cho bất kỳ ai gõ địa chỉ vào là xem được thư. Khi đó khách cũ chỉ cần nhớ email của tài khoản là ngồi nhà đọc mã. Hệ thống của bạn vẫn nhận bản sao và vẫn báo "mã mồ côi", nhưng **không chặn được**: khách đọc được mã trước khi bạn kịp làm gì.

Hình dung thế này: bộ lọc là bảo vệ đứng ở cửa chính. Trang tempmail công khai là cửa sau không khoá. Bảo vệ chỉ biết có người đi vào khi camera báo.

| Tình huống | Hộp thư chỉ hệ thống bạn đọc được | Tempmail ai gõ địa chỉ cũng đọc được |
|---|---|---|
| Khách cũ còn nhớ email + mật khẩu, đăng nhập lại ở nhà | Mã về mà không ai bấm "Lấy mã", hệ thống giấu mã và báo Telegram. Khách kẹt ở bước nhập mã. **Chặn được** | Khách mở trang tempmail, đọc mã rồi vào. Bạn chỉ nhận được cảnh báo. **Không chặn được** |
| Người đang giữ slot đăng nhập thêm máy thứ 2 mà không qua web của bạn | Chặn được | Không chặn được |
| Ai đó bấm "Quên mật khẩu" trên tài khoản kho | Bạn thấy thư trước, cách ly tài khoản | Họ đọc được link đặt lại mật khẩu và **chiếm luôn tài khoản** |

### Bài test "cửa sau" (10 phút, bạn tự làm được)
Dùng điện thoại chạy 4G, mở tab ẩn danh, không đăng nhập gì cả:
1. Chọn 1 địa chỉ kho đang dùng thật.
2. Từ Gmail cá nhân, gửi tới địa chỉ đó 1 thư có tiêu đề "TEST-4817" (số tự chọn).
3. Kiểm tra hệ thống của bạn: thư phải về trong vòng 1 phút.
4. Mở trang chủ của dịch vụ tempmail, tìm ô kiểu "Đổi email", "Nhập địa chỉ" hoặc "Check inbox", rồi gõ đúng địa chỉ đó. **Nếu thấy thư TEST-4817 thì cửa sau đang mở, bài test trượt.**
5. Thử tạo 1 địa chỉ bất kỳ trên cùng tên miền (ví dụ abc123@tên-miền-đó). **Nếu tạo được mà không cần tài khoản của bạn thì tên miền này là của chung, trượt.** Người lạ có thể nhận lại đúng địa chỉ của bạn.
6. Nhờ 1 người khác làm lại bước 4 trên máy của họ.
7. Hỏi nhà cung cấp 3 câu: Đọc thư qua API có cần khoá bí mật không? Địa chỉ có hết hạn rồi bị cấp cho người khác không? Thư được lưu bao lâu sau khi đã đẩy về cho bạn?

### Khi nào được giữ tempmail
Chỉ giữ khi đạt **đủ 5 điều**:

| # | Điều kiện | Nếu trượt |
|---|---|---|
| 1 | Không ai đọc được thư chỉ bằng địa chỉ. Muốn đọc phải có mật khẩu hoặc khoá mà chỉ hệ thống của bạn giữ | Bắt buộc chuyển |
| 2 | Tên miền là của riêng bạn (hoặc cấp riêng cho bạn). Người lạ không tạo được địa chỉ trên đó | Bắt buộc chuyển |
| 3 | Địa chỉ không hết hạn và không bị cấp lại cho người khác | Bắt buộc chuyển |
| 4 | Lệnh đẩy thư về hệ thống có kèm khoá bí mật, để kẻ xấu không bơm thư giả vào được. Nhà cung cấp xoá thư sau tối đa 24 giờ | Sửa cấu hình là đạt |
| 5 | Bạn tự khoá hoặc đổi được từng địa chỉ khi nghi bị lộ | Sửa được thì giữ |

### Nếu trượt: chuyển trong khoảng 1 tuần
| Bước | Việc cần làm | Ai làm | Thời gian |
|---|---|---|---|
| 1 | Tạo tên miền phụ riêng, ví dụ kho.tiembanquyen.com | Lập trình viên | 1 buổi |
| 2 | Bật dịch vụ nhận thư **không có trang xem công khai**, đẩy thẳng về hệ thống. Cách rẻ nhất là Cloudflare Email Routing (miễn phí, yêu cầu tên miền dùng DNS của Cloudflare) cộng một Email Worker gửi thư về hệ thống kèm khoá bí mật. Hoặc chọn dịch vụ nhận thư trả phí có tên miền riêng và có lệnh đẩy (webhook: hệ thống của họ tự gửi thư sang hệ thống của bạn) | Lập trình viên | 1 buổi |
| 3 | Mỗi tài khoản kho có 1 địa chỉ ngẫu nhiên, khó đoán, ví dụ q7m2x9@kho.tiembanquyen.com | Hệ thống | Tự động |
| 4 | Đổi email của từng tài khoản sang địa chỉ mới, thao tác trên trang của hãng. Làm trước những tài khoản đã phát cho nhiều người nhất | Nhân viên (làm tay) | Khoảng 5 phút/tài khoản. 60 tài khoản mất khoảng 5 giờ, chia làm 2–3 ngày |
| 5 | Đổi xong email thì đổi luôn mật khẩu và đăng xuất mọi phiên, vì người dùng cũ có thể vẫn còn phiên đăng nhập | Nhân viên (làm tay) | Làm cùng lúc với bước 4 |
| 6 | Làm lại bài test cửa sau với địa chỉ mới. Đạt thì đánh dấu "Đã chuyển" trên trang quản trị | Bạn | 10 phút |

**Luật trong thời gian chuyển:**
- Chỉ phát cho khách những tài khoản đã "Đã chuyển", hoặc tool dùng cách mời thành viên Team/Business.
- Tài khoản nào còn nằm ở tempmail công khai: cứ có mã mồ côi là coi như đã lộ. Nhân viên đổi mật khẩu và đăng xuất các phiên ngay trong ngày, không chờ lượt dọn kho.

### Bộ lọc của bạn cần làm 8 việc, theo đúng thứ tự
1. Kiểm khoá bí mật của lệnh đẩy. Sai khoá thì bỏ thư.
2. Chỉ tin thư có DKIM hợp lệ (DKIM là "con dấu điện tử" chứng minh thư đúng là do hãng gửi). Người gửi phải nằm trong danh sách địa chỉ chính thức của hãng; nhân viên điền danh sách này khi thêm tool.
3. Từ địa chỉ nhận, tra ra tài khoản kho nào và ai đang giữ.
4. Phân loại thư: mã đăng nhập / thư bảo mật (đổi mật khẩu, đổi email, bật xác minh 2 lớp, link đặt lại mật khẩu) / báo "có đăng nhập mới" / thư khác.
5. Ghép mã với lượt bấm "Lấy mã" trong 3 phút trước đó.
6. Thư báo "có đăng nhập mới" mà không khớp với mã nào vừa phát: có người vào bằng mật khẩu, không qua mã. Xếp đỏ, nhân viên đổi mật khẩu ngay.
7. Áp luật phát mã xanh/vàng/đỏ (mục 4 bên dưới).
8. Xoá thư gốc sau 24 giờ. Chỉ giữ lại giờ nhận, loại thư và tài khoản.

Lưu ý: bộ lọc chỉ chặn được những lần đăng nhập cần mã. Lần đăng nhập chỉ cần mật khẩu thì không sinh mã nào. Vì vậy hết mỗi slot vẫn phải đổi mật khẩu và đăng xuất phiên (nhân viên làm tay).

---

## Bộ luật chống spam và phát mã (giao cho lập trình viên)

Nói rõ một lần: chia sẻ tài khoản cá nhân dùng chung là vi phạm điều khoản của hầu hết các hãng, và đưa tài khoản cho người lạ dùng thì nguy cơ bị khoá càng cao. Tool nào có gói Team/Business thì nên **mời chính tài khoản của khách làm thành viên** rồi gỡ ra khi hết hạn, thao tác trên trang quản trị chính thức. Với tool dạng này thì không có mã, không có mật khẩu chung; 3 cửa và hạn mức vẫn áp dụng, còn các luật về mã thì bỏ.

## 1. Ba cửa kiểm tra
Việc gì tạo ra giá trị mới (nhận slot, lấy mã, xin chuyển máy) đều phải qua đủ 3 cửa.

### Cửa 1: Ai đang xin (xác minh số điện thoại)
| Cách | Chi phí/lần | Có lấy được SĐT không | Điều kiện | Kết luận |
|---|---|---|---|---|
| Mã OTP gửi qua Zalo ("mẫu xác thực" ZBS, trước đây gọi là ZNS) | Khoảng 300đ, chưa VAT (qua đại lý có thể khoảng 440đ) | Có, vì mã gửi tới SĐT | Zalo OA doanh nghiệp đã xác thực bằng giấy phép kinh doanh, mẫu tin được Zalo duyệt (1–3 ngày) | **Chọn cách này** |
| Đăng nhập bằng Zalo | 0đ | **Không có.** Zalo chỉ trả tên, ảnh và mã người dùng | Tạo app Zalo | Không có SĐT để chốt đơn sau này |
| OTP qua SMS | 600–1.000đ (SMS brandname) | Có | Đăng ký brandname với nhà mạng | Dùng dự phòng cho số không cài Zalo |

**Vì sao chọn OTP Zalo:** rẻ hơn SMS khoảng 2–3 lần. Khách vốn đã dùng Zalo. Số điện thoại đã xác minh cũng chính là kênh shop chốt đơn sau này.
**Chi phí ước tính:** 10 quán × 15 lượt mỗi đêm = 150 OTP/đêm × khoảng 330đ ≈ 50.000đ/đêm ≈ 1,5 triệu/tháng.

**Luật OTP:**
- Mã 6 số, hết hạn sau 5 phút.
- Mỗi SĐT được gửi tối đa 3 lần/giờ. Mỗi máy được gửi tối đa 5 lần/ngày, để không bị đốt tiền OTP.
- Nhập sai 5 lần thì khoá ô nhập 30 phút.
- Xác minh xong thì web giữ đăng nhập cho khách tới hết slot, không bắt nhập OTP mỗi lần lấy mã. Chuyển sang máy khác thì phải nhập OTP lại.

### Cửa 2: Có đang ở quán không (chạm thẻ NTAG 424 DNA)
Mỗi lần chạm, thẻ sinh ra một link mới. Link này có **số đếm tăng dần** và **chữ ký** (CMAC: dấu xác thực chỉ thẻ thật mới tạo được và chỉ máy chủ của bạn mới kiểm được).

1. Mỗi thẻ có khoá riêng, sinh ra từ khoá gốc cộng mã thẻ. Lộ 1 thẻ không làm lộ cả hệ thống.
2. Bật chế độ mã hoá cả mã thẻ lẫn số đếm, không để hiện trần trên link.
3. Chữ ký sai thì từ chối (đỏ).
4. Số đếm phải **lớn hơn hẳn** số lớn nhất đã chấp nhận của thẻ đó. Bằng hoặc nhỏ hơn nghĩa là link cũ bị dùng lại, xếp đỏ.
5. **Mỗi link chỉ dùng 1 lần.** Lần mở đầu tiên tạo ra một "phiếu chạm" gắn với máy vừa mở. Phiếu có hạn **3 phút** và chỉ dùng cho đúng 1 việc: nhận slot, hoặc lấy 1 mã, hoặc xin chuyển máy.
6. Phiếu quá 3 phút hoặc đã dùng rồi thì hiện "Chạm lại thẻ tại quán nhé". Trường hợp này không trừ điểm.
7. Số đếm nhảy quá 15 so với lần chấp nhận trước nghĩa là có người chạm mà không mở link, tức đang "gom link" bằng app đọc thẻ. Đánh dấu thẻ "bất thường" và báo Telegram.
8. Mỗi thẻ gắn với 1 quán và 1 bàn. Quán tạm nghỉ (Tết, sửa chữa) thì tắt thẻ trên trang quản trị.

**Lỗ hổng lớn nhất còn lại là thẻ bị gỡ mang về nhà**, vì chạm ở nhà vẫn ra link thật.
- 1 máy chạm cùng 1 thẻ cho từ 3 SĐT khác nhau trở lên trong ngày: khoá thẻ, báo Telegram.
- Trong 2 giờ, mọi lần chạm vào 1 thẻ chỉ đến từ 1–2 máy và không máy nào dùng Wi-Fi quán: khoá thẻ chờ kiểm tra.
- Checklist đóng ca của quán có 1 dòng "thẻ còn trên bàn". Dán thẻ chắc, khó gỡ.

Gom link ngay tại quán (chạm 20 lần rồi mang link về) thì thiệt hại vẫn bị giới hạn: mỗi link chỉ làm được 1 việc, và các hạn mức 1 slot/ngày, 2 mã/slot vẫn áp dụng.

**Không dùng GPS.** Nghị định 356/2025 (Điều 4) xếp vị trí xác định qua dịch vụ định vị vào nhóm dữ liệu nhạy cảm, phải xin đồng ý riêng, và khách dễ bỏ ngang. Wi-Fi quán chỉ là tín hiệu phụ, vì dùng 4G hoặc VPN là né được.

### Cửa 3: Đã nhận bao nhiêu rồi (hạn mức mặc định)
| Hạn mức | Mặc định | Vì sao | Chỉnh được? |
|---|---|---|---|
| Slot đang mở cùng lúc / SĐT | 1 | Đúng cam kết "1 tool" | Cố định |
| Slot mới / SĐT / 24 giờ | 1 | | Cố định |
| Số lần thử mỗi tool / SĐT | 1 lần, tính trong 12 tháng lưu dữ liệu | Không nhận lại | Có. Sau này có thể mở lần 2 sau 180 ngày cho chiến dịch kéo khách cũ |
| Số tool khác nhau / SĐT / 30 ngày | 2 | Khách quen của quán không được "thử mãi mà không mua" | Có (1–4) |
| Khoảng nghỉ trước khi thử tool tiếp theo | 7 ngày kể từ khi lượt trước hết hạn | | Có |
| Số mã đăng nhập / slot | 2 (lần đầu + 1 lần dự phòng), mỗi mã cần 1 lần chạm mới | **Đây mới là cái giữ "1 máy" thật** | Có (1–3) |
| Số lần chuyển máy / slot | 1, phải được duyệt | | Có |
| Slot / quán / ngày | 20, tính chung mọi tool | Vừa sức kho, khớp với ước tính 15 lượt mỗi đêm | Có, theo hợp đồng từng quán |
| Slot / tool / ngày (cả hệ thống) | Bằng số tài khoản kho đang sẵn sàng | Mỗi tài khoản kho chỉ cho 1 người thử tại 1 thời điểm | Tự tính |
| Lần chạm hợp lệ / thẻ / giờ | 10. Quá 10: thẻ thành "vàng". Quá 20: khoá thẻ, báo Telegram | 1 bàn có 2–4 người, mỗi người chạm 1–3 lần | Có |
| Lần chạm / thẻ / ngày | 60 | | Có |
| SĐT / máy / 30 ngày | SĐT thứ 2: vàng. SĐT thứ 3: đỏ | Mượn máy bạn là chuyện bình thường, tới 3 số mới là bất thường | Có |

**Vòng đời slot:**
- **Giữ chỗ 30 phút.** Nhận slot mà 30 phút chưa lấy mã đầu tiên thì slot tự huỷ, trả suất lại, và không tính là đã thử tool đó.
- Slot kéo dài **24 giờ, tính từ lúc phát mã đầu tiên**.
- Hết slot thì tài khoản chuyển sang "chờ dọn". Nhân viên bấm "Bắt đầu dọn", đăng xuất mọi phiên và đổi mật khẩu (làm tay trên trang của hãng hoặc trang quản trị Team), rồi bấm "Xong". Trong lúc đang dọn, thư "mật khẩu đã đổi" là chuyện bình thường, không báo đỏ.

## 2. "1 máy" nghĩa là gì trên web của bạn
- **Mã thiết bị:** chuỗi ngẫu nhiên máy chủ cấp cho khách ở lần đầu vào web, lưu ở 2 nơi: cookie của chính web bạn (hạn 400 ngày) và bộ nhớ trình duyệt (localStorage). Mất 1 nơi thì khôi phục từ nơi còn lại.
- **Dấu hiệu máy (chỉ đo trên web của bạn):** hệ điều hành + trình duyệt, kích thước màn hình, múi giờ, ngôn ngữ. Lưu ở dạng mã băm (chuỗi đã mã hoá một chiều, không đọc ngược ra được). Không dùng các kỹ thuật lấy "vân tay máy" nặng.
- **Vì sao chỉ là tín hiệu mềm:**
  - Mở tab ẩn danh, xoá dữ liệu hoặc đổi trình duyệt là ra mã mới.
  - Các iPhone cùng đời có dấu hiệu gần như giống hệt nhau.
  - Web của bạn không nhìn thấy máy khách thật sự dùng ChatGPT/Claude. Khách có thể lấy mã trên điện thoại rồi đăng nhập trên laptop.
- Vì vậy **không bao giờ khoá ai chỉ vì lệch máy**, chỉ cộng điểm. Cái giữ "1 máy" thật là **tối đa 2 mã mỗi slot, mỗi mã cần chạm thẻ mới**, vì mỗi mã là 1 lần đăng nhập ở đâu đó.
- Khi nhận slot, slot được gắn với SĐT + mã thiết bị. Dặn khách: "Mở trang này trên chính máy bạn sẽ dùng tool."
- **Xin mã từ máy khác:** bắt nhập OTP lại, hiện màn hình "Slot đang gắn với máy khác" kèm nút "Xin chuyển máy", và xếp vàng. Được duyệt thì slot chuyển sang máy mới, máy cũ hết quyền lấy mã. Mỗi slot chỉ được chuyển 1 lần, xin lần thứ 2 thì đỏ.

## 3. Điểm rủi ro

### Luật cứng: đỏ ngay, không cần tính điểm
- Chữ ký thẻ sai. Sai từ 3 lần/giờ trở lên trên cùng 1 thẻ thì khoá thẻ.
- Link chạm bị dùng lại hoặc số đếm không tăng.
- Thư bảo mật đến bất ngờ (đổi mật khẩu, đổi email, bật xác minh 2 lớp, đặt lại mật khẩu) trong khi tài khoản không ở trạng thái "đang dọn": cách ly tài khoản, thu hồi slot, khoá tạm người đang giữ chờ xem xét.
- Mã về mà không ai bấm "Lấy mã" (mã mồ côi): không hiện cho ai, báo Telegram.
- Xin mã sau khi slot đã hết hạn. Xin mã thứ 3 trong 1 slot.
- SĐT, máy hoặc thẻ đang bị khoá.

**Từ chối mềm (không trừ điểm):** hết phiếu chạm, quán hết suất, OTP hết hạn, chờ duyệt quá giờ.

### Điểm tức thời (chỉ tính cho lần xin này)
| Tín hiệu | Điểm |
|---|---|
| Đang dùng Wi-Fi của quán | −5 |
| Khách quen đã từng mua (chủ tiệm đánh dấu) | −20 |
| Không dùng Wi-Fi quán (4G/VPN) | +5 |
| Xin mã từ máy khác máy đã gắn slot (lần đầu) | +35 |
| Máy này đã dùng với 1 SĐT khác trong 30 ngày | +25 |
| Máy này đã dùng với từ 2 SĐT khác trở lên trong 30 ngày | +60 |
| Mã thiết bị mới nhưng dấu hiệu máy giống máy đang bị khoá | +40 |
| Thẻ đang ở trạng thái "bất thường" | +20 |
| Cùng ngày vừa đổi máy vừa đổi quán | +15 |
| Nhập sai OTP từ 3 lần trở lên rồi mới đúng | +10 |

### Điểm tích luỹ (gắn với SĐT và máy, giảm dần theo thời gian)
| Sự kiện | Điểm |
|---|---|
| Mỗi lần bị cảnh cáo | +15 |
| Từng bị khoá tạm (đã được mở) | +30 |
| Từ 2 mã mồ côi trở lên rơi vào slot người này đang giữ | +20 |

**Giảm dần:** điểm tích luỹ giảm một nửa sau mỗi 14 ngày không vi phạm và về 0 sau 60 ngày sạch. Khoá vĩnh viễn thì không giảm. Tổng điểm thấp nhất là 0.

### Ngưỡng màu
| Tổng điểm | Màu |
|---|---|
| 0–29 | Xanh: phát tự động |
| 30–44 | Vàng nhạt: chủ tiệm duyệt, quá giờ thì tự duyệt |
| 45–59 | Vàng đậm: chủ tiệm duyệt, quá giờ thì từ chối mềm |
| Từ 60 trở lên | Đỏ: tự từ chối |

### Ví dụ
| Tình huống | Cách tính | Tổng | Màu |
|---|---|---|---|
| Khách mới, Wi-Fi quán, cùng máy | −5 | 0 | Xanh |
| Khách mới, 4G, cùng máy | +5 | 5 | Xanh |
| Lấy mã lần 2 trên laptop, Wi-Fi quán | +35 −5 | 30 | Vàng nhạt |
| Như trên nhưng dùng 4G và đã có 1 cảnh cáo | +35 +5 +15 | 55 | Vàng đậm |
| Máy đã dùng với 1 SĐT khác, 4G | +25 +5 | 30 | Vàng nhạt |
| Máy đã dùng với 2 SĐT khác | +60 | 60 | Đỏ |
| Khách quen đã mua, đổi máy, 4G | +35 +5 −20 | 20 | Xanh |

Mọi con số ở trên đều nằm trong mục "Cài đặt luật" trên trang quản trị. Tháng đầu xem lại mỗi tuần: nếu số lượt vàng vượt 15% thì nới luật; nếu bản tổng hợp buổi sáng có nhiều ca gian lận thì siết lại.

## 4. Phát mã: xanh, vàng, đỏ

### Luồng chạy
1. Khách bấm "Lấy mã" (đã có phiếu chạm còn hạn).
2. Hệ thống tính điểm **trước khi** khách bấm gửi mã bên trang của hãng. Mã của hãng thường hết hạn sau vài phút, duyệt trước thì không phí mã.
3. Xanh, hoặc vàng đã được duyệt: báo "Giờ bạn bấm gửi mã trên trang [tool]". Khách có 3 phút.
4. Mã về hộp thư kho và khớp với lượt xin: chỉ hiện trên máy đang giữ phiếu, hiện trong 5 phút rồi ẩn. Không gửi mã qua Zalo hay SMS.

| Màu | Hệ thống làm gì | Ví dụ |
|---|---|---|
| Xanh | Phát mã tự động | Khách mới, đúng máy, chạm thẻ còn mới |
| Vàng | Gửi Telegram, khách chờ | Xin mã từ máy khác; máy từng dùng với 1 SĐT khác |
| Đỏ | Tự từ chối; chỉ báo ngay những ca nghiêm trọng | Link chạm dùng lại; máy có 3 SĐT; thư đổi mật khẩu bất ngờ; mã mồ côi |

### Tin Telegram mẫu
```
[VÀNG NHẠT - 40 điểm]  Quán Mộc - Bàn 05
Tool: ChatGPT (kho #07)   Khách: ***496
Lý do: máy khác máy đã gắn slot (+35), 4G (+5)
Mã hồ sơ: Y-1005-0213
Không ai bấm thì 01:17 tự DUYỆT
[Duyệt]  [Từ chối]  [Khoá]
```
- Bấm **Khoá** thì bot hỏi lại "Khoá SĐT và máy này 30 ngày?" với 2 nút [Xác nhận] [Huỷ], tránh bấm nhầm.
- Bấm xong, bot sửa lại tin thành "Đã duyệt bởi Long lúc 01:12" và gỡ các nút. Cả nhóm cùng thấy, không ai duyệt trùng.
- Trên Telegram chỉ hiện SĐT đã che và không có IP đầy đủ. Muốn xem chi tiết thì mở trang quản trị (có đăng nhập).

### Quá giờ duyệt và chế độ đêm
- **Thời gian chờ duyệt: 5 phút.** Vàng nhạt thì tự duyệt, vàng đậm thì từ chối mềm (không trừ điểm, mời khách chạm lại thẻ hoặc nhắn Zalo).
- **Chế độ đêm:** mặc định 01:00–07:00, hoặc gõ /dem trong bot để bật. Vàng nhạt được duyệt ngay và ghi vào danh sách xem lại. Vàng đậm bị từ chối mềm ngay. Đỏ vẫn như cũ.
- **08:00 mỗi sáng** bot gửi bản tổng hợp đêm qua. Thấy ca nào lạ thì khoá lại sau cũng được.
- **Báo đỏ ngay lập tức chỉ cho 4 loại:** thư bảo mật bất ngờ, mã mồ côi, chữ ký sai hoặc link dùng lại, thẻ bất thường. Các ca đỏ còn lại gom thành 1 tin mỗi giờ.

### Mỗi đêm bạn phải bấm duyệt bao nhiêu lần
Giả định: mỗi quán 15 lượt nhận/đêm, mỗi lượt xin mã trung bình 1,3 lần, khoảng 10% là vàng (hai tuần đầu có thể lên 20% trong lúc chỉnh luật).

| Số quán | Lượt xin mã/đêm | Ca vàng | Bạn thật sự phải bấm (sau chế độ đêm) | Nếu duyệt tay 100% |
|---|---|---|---|---|
| 1 | ~20 | ~2 | ~1 | 20 |
| 5 | ~100 | ~10 | ~5 | 100 |
| 10 | ~200 | ~20 | ~10 | 200 |

## 5. Thang xử lý vi phạm
| Mức | Khi nào | Hậu quả | Cách gỡ |
|---|---|---|---|
| 0. Nhắc nhẹ | Lỗi thật thà: phiếu chạm hết hạn, chọn nhầm tool, xoá cookie, đổi máy lần đầu | Thông báo thân thiện, không trừ điểm | Không cần |
| 1. Cảnh cáo | Bị từ chối xin chuyển máy; SĐT thứ 2 trên 1 máy; dùng lại link chạm 1 lần | +15 điểm tích luỹ | Tự hết khi điểm giảm dần |
| 2. Khoá tạm 30 ngày (SĐT + máy) | 2 cảnh cáo trong 30 ngày; SĐT thứ 3 trên 1 máy; gom link; từ 2 mã mồ côi trong slot của mình | Thu hồi slot đang mở, không được nhận mới | Nhắn Zalo kèm mã hồ sơ |
| 3. Khoá vĩnh viễn | Rõ ràng cố chiếm tài khoản kho (đổi mật khẩu, đổi email, bật 2 lớp); gỡ thẻ mang đi; đã bị khoá tạm 2 lần | Khoá SĐT + máy | Chỉ chủ tiệm mở, sau khi nói chuyện qua Zalo |

**Kháng nghị:** màn hình khoá hiện mã hồ sơ (ví dụ K-1005-0457) và nút "Nhắn Zalo shop". Bạn xem trong vòng 24 giờ và mở khoá bằng 1 nút trên trang quản trị.

**Đối xử tử tế, vì đây là phễu bán hàng:**
- Cảnh cáo mức 1 lần đầu: khách nhắn Zalo là xoá luôn. Đổi lại bạn có thêm 1 khách trên Zalo, đúng mục tiêu của phễu.
- Câu chữ không buộc tội. Viết "hệ thống thấy…", không bao giờ viết "bạn gian lận".
- Từ chối mềm không bao giờ trừ điểm.
- Lỡ khoá nhầm thì tặng khách thêm 1 lượt thử để bù.

## 6. Khách nhìn thấy gì
| Màn hình | Câu chữ |
|---|---|
| Vừa chạm thẻ | "Chào bạn ở [Quán Mộc] – Bàn 5! Chọn 1 công cụ để dùng thử miễn phí 1 ngày." |
| Nhập số | "Nhập số Zalo của bạn để nhận mã xác nhận." |
| OTP | "Mã 6 số đã gửi qua Zalo tới 09xx xxx 496. Mã hết hạn sau 5 phút." |
| Nhận slot thành công | "Xong! Bạn dùng [ChatGPT Plus] đến [23:40 ngày 06/10]. Bạn chỉ dùng 1 máy để nhường slot cho bạn sau nha." |
| Hướng dẫn lấy mã | "Mở trang đăng nhập [tool], nhập email bên dưới, rồi bấm 'Lấy mã' ở đây trong 3 phút." |
| Hiện mã | "Mã của bạn: 482 913. Mã sẽ ẩn sau 5 phút." |
| Cần chạm lại | "Chạm lại thẻ tại quán nhé. Mỗi lần lấy mã cần chạm thẻ trên bàn 1 lần." |
| Máy khác | "Slot này đang gắn với máy khác. Mình chỉ phát mã cho 1 máy để nhường slot cho bạn sau. Bạn muốn chuyển sang máy này? [Xin chuyển máy]" |
| Chờ duyệt | "Đang chờ chủ tiệm duyệt, thường dưới 3 phút. Bạn giữ nguyên trang này nhé." |
| Quá giờ duyệt | "Chưa duyệt kịp. Bạn chạm lại thẻ để thử lại nhé, không ảnh hưởng gì đâu." |
| Đã thử tool này | "Bạn đã thử [ChatGPT] rồi. Chọn tool khác nhé, hoặc nhắn Zalo shop để nhận giá ưu đãi cho khách đã dùng thử." |
| Hết suất | "Hôm nay quán đã hết suất [tool]. Bạn thử tool khác hoặc quay lại vào ngày mai nhé." |
| Hết slot | "Lượt dùng thử đã hết lúc [23:40]. Cảm ơn bạn đã thử!" |
| Bị khoá | "Lượt dùng thử đang tạm khoá đến [05/11] vì hệ thống thấy [máy này đã dùng nhiều số điện thoại]. Nếu nhầm, bạn nhắn Zalo 0988 428 496 kèm mã K-1005-0457, shop xem trong 24 giờ." |
| **Kết thúc, mời mua** | "Hết 1 ngày dùng thử [ChatGPT Plus] rồi! Thấy hợp thì nhắn Zalo shop để dùng tiếp nhé: 0988 428 496. Gửi mã **MOC-7F2K** để nhận ưu đãi dành cho khách dùng thử tại quán (áp dụng 7 ngày). Muốn dùng trên tài khoản của chính bạn thì có gói chính chủ. [Nhắn Zalo ngay]" (nút mở zalo.me/0988428496) |

Mã ưu đãi gắn với từng quán. Nhờ vậy bạn biết quán nào mang về đơn, và có cơ sở chia hoa hồng nếu muốn.

## 7. Dữ liệu cá nhân (Luật 91/2025/QH15, hiệu lực từ 01/01/2026, và Nghị định 356/2025)

**Thu:** SĐT; mã thiết bị và dấu hiệu máy (dạng mã băm); địa chỉ IP; nhật ký chạm thẻ (thẻ nào, giờ, số đếm); lịch sử nhận slot và lấy mã; điểm rủi ro và cảnh cáo.
**Không thu:** họ tên, CCCD, GPS, danh bạ, nội dung khách làm trong tool.
**Bên thứ ba:** Zalo (để gửi OTP, nhận SĐT). Telegram (chỉ nhận SĐT đã che).

**Ô đồng ý (không tick sẵn):**
- [ ] (Bắt buộc) "Tôi đồng ý để Tiệm Bản Quyền dùng số điện thoại, mã thiết bị, địa chỉ IP và lịch sử nhận dùng thử trên trang này để xác minh, chống lạm dụng và phát mã dùng thử. Lưu tối đa 12 tháng, không bán cho ai. Muốn xem, rút đồng ý hoặc xoá dữ liệu: nhắn Zalo 0988 428 496. [Chi tiết]"
- [ ] (Không bắt buộc) "Nhắn cho tôi qua Zalo khi hết hạn dùng thử và khi có ưu đãi."

**Thời gian lưu:**
| Dữ liệu | Để làm gì | Giữ bao lâu |
|---|---|---|
| SĐT + danh sách tool đã thử | Chặn nhận lại, tính hạn mức | 12 tháng kể từ lần nhận cuối |
| Mã thiết bị + dấu hiệu máy | "1 máy", chống dùng nhiều SĐT | 12 tháng kể từ lần thấy cuối |
| Địa chỉ IP | So với Wi-Fi quán, điều tra sự cố | 30 ngày |
| Nhật ký chạm thẻ | Chống gom link, phát hiện thẻ bị lấy | 90 ngày. Số đếm của thẻ thì giữ mãi (không phải dữ liệu cá nhân) |
| Nhật ký OTP | Chống đốt tiền OTP | 30 ngày |
| Mã đăng nhập + thư gốc từ kho | Phát mã | Mã ẩn sau 5 phút, xoá sau 24 giờ. Thư gốc xoá sau 24 giờ |
| Điểm rủi ro, cảnh cáo | Thang xử lý | Giảm dần như mục 3, xoá hẳn sau 12 tháng |
| Hồ sơ khoá vĩnh viễn | Chống quay lại | 24 tháng (cần hỏi luật sư) |
| Đồng ý nhận tin Zalo | Gửi ưu đãi | Tới khi khách rút đồng ý |
| Bản ghi đồng ý (giờ, phiên bản câu chữ) | Chứng minh đã xin đồng ý | Bằng thời gian giữ dữ liệu liên quan |

**Xoá theo yêu cầu:** khách nhắn Zalo, xác minh bằng OTP gửi tới đúng SĐT đó. Luật yêu cầu phản hồi trong 2 ngày làm việc, xoá trong 20 ngày và rút đồng ý trong 15 ngày. Nội bộ nên đặt mục tiêu 72 giờ. Xoá xong thì slot đang mở cũng kết thúc. Sau khi xoá, hệ thống không còn nhớ người đó đã thử tool nào; chấp nhận rủi ro nhỏ này.

**Lưu ý pháp lý:** Nghị định 356 xếp dữ liệu theo dõi hành vi và lịch sử hoạt động trên mạng vào nhóm nhạy cảm. Nhật ký chống lạm dụng có thể bị coi thuộc nhóm này. Cách an toàn: coi như dữ liệu nhạy cảm, ghi rõ trong ô đồng ý, chỉ ghi sự kiện trên trang dùng thử, giữ ngắn. Hộ kinh doanh và doanh nghiệp siêu nhỏ được miễn lập hồ sơ đánh giá tác động, **trừ khi** xử lý dữ liệu nhạy cảm. Vì vậy nên hỏi luật sư một lần.

## 8. 13 ca kiểm thử nghiệm thu
1. Mở lại một link chạm đã dùng → đỏ, hiện "Chạm lại thẻ".
2. Sửa 1 ký tự trong chữ ký của link → đỏ.
3. Mở link chạm sau 4 phút → "Chạm lại thẻ", không trừ điểm.
4. Mã về mà không ai bấm "Lấy mã" → không hiện cho ai, Telegram báo ngay.
5. Thư "mật khẩu đã đổi" khi tài khoản đang "đang dọn" → bình thường. Khi không đang dọn → cách ly tài khoản.
6. Thư "có đăng nhập mới" không khớp mã nào → đỏ, báo đổi mật khẩu.
7. Xin mã thứ 3 trong 1 slot → từ chối.
8. Xin mã từ máy khác → bắt OTP lại, xếp vàng.
9. SĐT thứ 3 trên cùng máy trong 30 ngày → đỏ.
10. Nhận lại tool đã thử → từ chối mềm, gợi ý tool khác.
11. Vàng nhạt không ai bấm trong 5 phút → tự duyệt. Vàng đậm → từ chối mềm.
12. Thư giả (DKIM hỏng) có chứa "mã", hoặc lệnh đẩy thư sai khoá bí mật → bỏ.
13. Slot hết hạn → lấy mã bị từ chối, hiện màn hình mời mua qua Zalo.

### Câu hỏi mở
- Kết quả bài test cửa sau với dịch vụ tempmail đang dùng (dịch vụ tên gì, gõ địa chỉ có xem được thư không, người lạ có tạo được địa chỉ trên tên miền đó không)? Kết quả này quyết định giữ hay phải chuyển sang kho.tiembanquyen.com.
- DNS của tiembanquyen.com đang quản lý ở đâu? Nếu đã ở Cloudflare thì dùng Email Routing miễn phí được ngay; nếu không thì phải chuyển DNS hoặc chọn dịch vụ nhận thư khác.
- '1 tool/khách' nghĩa là trọn đời mỗi người chỉ được 1 tool, hay mỗi tool chỉ được thử 1 lần? Bộ luật đang mặc định: mỗi tool 1 lần, tối đa 2 tool trong 30 ngày, cách nhau ít nhất 7 ngày.
- Anh/chị có giấy phép kinh doanh để xác thực Zalo OA không (bắt buộc để gửi OTP qua Zalo)? Nếu chỉ có giấy hộ kinh doanh thì cần hỏi Zalo có chấp nhận không; nếu không thì tạm dùng OTP SMS (600–1.000đ/tin).
- Ưu đãi cho khách sau khi dùng thử là bao nhiêu (giảm % hay tặng thêm ngày, hạn 7 ngày có ổn không)? Có chia hoa hồng cho quán theo mã ưu đãi của từng quán không?
- Giờ chế độ đêm (mặc định 01:00–07:00) và ai trực duyệt trên Telegram: chỉ anh/chị hay thêm nhân viên vào nhóm?
- Mỗi quán được bao nhiêu suất/ngày theo hợp đồng (mặc định 20), và mỗi tool có bao nhiêu tài khoản kho sẵn sàng?
- Tool nào có gói Team/Business để chuyển sang cách mời thành viên (không cần mã, không chung mật khẩu)?
- Máy chủ đặt ở Việt Nam hay nước ngoài (đặt ở nước ngoài có thể phát sinh thủ tục chuyển dữ liệu ra nước ngoài)? Có thuê luật sư rà soát 1 lần không: nhật ký chống lạm dụng có bị coi là dữ liệu nhạy cảm không, và có được giữ hồ sơ khoá vĩnh viễn 24 tháng kể cả khi người bị khoá yêu cầu xoá không?

### Nguồn
- https://www.oazns.vn/bang-gia-zns/
- https://v9.com.vn/giai-phap-xac-thuc-zalo-otp-2026/
- https://zalo.cloud/blog/cach-su-dung-va-ung-dung-cua-mau-tin-zns-xac-thuc-/g8yv8lcpvmj0c0wonqbpibgj
- https://docs.zaloplatforms.com/docs/Social
- https://miniapp.zaloplatforms.com/docs/api/getPhoneNumber/
- https://www.nxp.com/docs/en/application-note/AN12196.pdf
- https://mailinator.com/documentation/docs/core/publicmailbox/
- https://www.mailinator.com/mailinator-private-domains/
- https://developers.cloudflare.com/email-routing/
- https://developers.cloudflare.com/email-routing/email-workers/
- https://core.telegram.org/bots/api
- https://thuvienphapluat.vn/van-ban/Bo-may-hanh-chinh/Luat-Bao-ve-du-lieu-ca-nhan-2025-so-91-2025-QH15-625628.aspx
- https://vanban.chinhphu.vn/?pageid=27160&docid=216387
- https://thuvienphapluat.vn/phap-luat-nha-dat/toan-van-nghi-dinh-3562025ndcp-huong-dan-luat-bao-ve-du-lieu-ca-nhan-13670.html
- https://luatvietan.vn/diem-moi-cua-nghi-dinh-356-2025-so-voi-nghi-dinh-13-2023-ve-huong-dan-bao-ve-du-lieu-ca-nhan.html
- https://luatvietnam.vn/doanh-nghiep/doanh-nghiep-can-biet-gi-ve-bao-ve-du-lieu-ca-nhan-tai-nghi-dinh-356-2025-nd-cp-561-109567-article.html