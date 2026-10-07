# Kịch bản vận hành sâu (`npm run van-hanh-sau`) — 00:53:18 7/10/2026

Chạy trên bộ diễn tập: TBQ **production** sau Caddy giả, OTP qua eSMS giả, thư qua code Cloudflare Worker, hãng giả kiểm đăng nhập thật, tua giờ bằng database.
Mỗi máy 1 địa chỉ riêng (cookie riêng). Không đụng dữ liệu diễn tập của bạn.

## Kết quả: ✅ — 104/104 bước đạt

### D1. Chủ tiệm dựng ngày đầu: 2 quán, thẻ NFC, nhập kho bằng trang quản trị
- ✔ đăng nhập quản trị (production)
- ✔ tạo quán có QS
- ✔ tạo 4 thẻ NFC cho quán chưa có QS
- ✔ nhập kho canva (1 dòng)
- ✔ nhập kho gemini (5 dòng)
- ✔ nhập kho capcut (10 dòng)
- ✔ nhập kho adobe (4 dòng)
- ✔ nhập kho claude (3 dòng)
- ✔ nhập kho chatgpt (3 dòng)
- ✔ dán lại tài khoản đã có → báo "đã có trong kho", không tạo trùng
- ✔ ChatGPT thiếu khoá 2FA → bị bỏ qua, có lý do
- ✔ tạo 200 mã phiếu (trang Mã phiếu)

### D2. ChatGPT: 9 khách cùng quán → 8 người chung 1 tài khoản (Slot 1…8), người thứ 9 sang tài khoản khác
- ✔ 8 khách đầu cùng 1 tài khoản
- ✔ Slot 1…8 không trùng
- ✔ khách thứ 9 sang tài khoản khác, Slot 1
- ✔ cả 9 khách ChatGPT hết đúng 06:00 sáng mai (giờ VN)
- ✔ trang khách ghi rõ "Dùng tới 06:00 …"
- ✔ cả 9 đăng nhập được ChatGPT giả bằng mật khẩu + mã 2FA trên trang Tiệm

### D3. Quán thẻ NFC đặt 8 suất/ngày: khách thứ 9 không nhận được, câu báo rõ
- ✔ 8 khách đầu nhận CapCut
- ✔ khách thứ 9: hết suất quán, có câu báo
- ✔ CapCut lấp đủ 2 người / tài khoản (8 khách → 4 tài khoản)
- ✔ khách CapCut đăng nhập CapCut giả

### D4. Adobe tối đa 4 lượt/ngày: người thứ 5 thấy công cụ bị khoá trên trang
- ✔ 4 khách đầu nhận Adobe
- ✔ khách thứ 5: Adobe bị khoá ngay trên trang chọn (không phải bấm rồi mới báo)

### D5. Adobe lấy mã email: bấm Lấy mã trước / đăng nhập trước đều được; người ngoài biết mật khẩu → mã mồ côi, báo động
- ✔ khách 1: bấm "Lấy mã" trước → đăng nhập Adobe được
- ✔ khách 2 (cùng tài khoản với khách 1): đăng nhập Adobe trước (Adobe tự gửi mã) rồi mới bấm "Lấy mã" → vẫn được
- ✔ người ngoài có mật khẩu Adobe (khách gửi cho) → kẹt ở bước mã email
- ✔ thư mã đó không giao cho ai (mồ côi / chờ)

### D6. Gemini 5 link: khách 6 thấy hết; link đã nhận đưa cho bạn → hãng báo đã dùng
- ✔ 5 khách đầu nhận link Gemini
- ✔ khách 6: Gemini bị khoá trên trang (hết link)
- ✔ khách nhận Gemini bằng link của mình
- ✔ bạn của khách dùng lại link → "đã được dùng"
- ✔ trang Gemini của khách không có đồng hồ đếm ngược

### D7. Cùng số điện thoại đăng nhập máy thứ 2 (laptop): không thấy mật khẩu, không lấy được mã
- ✔ máy 2 đăng nhập được bằng OTP
- ✔ máy 2 không thấy mật khẩu
- ✔ máy 2 xin mã 2FA → từ chối

### D8. Khách báo lỗi bằng nút "Báo Tiệm" → chủ thấy trên trang Theo dõi
- ✔ gửi báo lỗi
- ✔ trang Theo dõi có báo lỗi của khách

### D9. eSMS sập (hết tiền / treo): khách thấy câu dễ hiểu, chủ được báo
- ✔ eSMS báo lỗi → khách nhận câu báo, không treo
- ✔ chủ thấy cảnh báo gửi SMS lỗi trên Theo dõi
- ✔ eSMS treo → khách chờ tối đa ~10 giây rồi được báo
- ✔ eSMS chạy lại → khách đăng nhập được ngay (không bị khoá vì các lần lỗi)

### D10. Vé hết hạn (khách ngồi lâu > 30 phút): phiếu tự động của lần chạm thẻ / phiếu giấy vẫn lấy được mã
- ✔ vé cũ 36 phút, phiếu tự động (chạm thẻ) còn hạn → lấy mã 2FA không phải gõ
- ✔ đang trong lượt xem → vẫn thấy mã

### D11. Có người ngoài đổi mật khẩu tài khoản ChatGPT đang có 8 người → cách ly, thu hồi, khách nhận lại ngay
- ✔ tài khoản bị cách ly
- ✔ 8 slot trên tài khoản đó bị thu hồi
- ✔ khách thấy lời xin lỗi, không còn mật khẩu
- ✔ khách bị ảnh hưởng nhận lại ChatGPT ngay (tài khoản khác)
- ✔ chủ có việc tay cho tài khoản bị cách ly, lý do dễ hiểu
- ✔ tài khoản bị cách ly (mật khẩu đã bị người ngoài đổi): KHÔNG cho "Giữ mật khẩu cũ"
- ✔ chủ lấy lại tài khoản, dán mật khẩu mới → xong

### D12. Chủ thu hồi slot / khoá khách / mở khoá
- ✔ thu hồi slot
- ✔ khách bị khoá không nhận được
- ✔ mở khoá → nhận được

### D13. Claude Pro: 3 khách / tài khoản, mã đăng nhập về hộp thư Tiệm → đúng người; người ngoài kẹt ở bước mã
- ✔ 4 khách nhận Claude
- ✔ 3 khách đầu chung 1 tài khoản (Slot 1…3), khách 4 sang tài khoản khác
- ✔ khách Claude hết đúng 06:00 sáng mai (giờ VN)
- ✔ trang khách Claude: không có mật khẩu, có nút "Lấy mã"
- ✔ khách 1: bấm "Lấy mã" rồi đăng nhập Claude → mã về đúng khách
- ✔ khách 2 (cùng tài khoản): đăng nhập trước, bấm "Lấy mã" sau → vẫn được
- ✔ người ngoài biết email Claude → kẹt ở bước mã
- ✔ mã do người ngoài làm Claude gửi → không giao cho ai
- ✔ khách 4 (tài khoản 2) đăng nhập Claude được
- ✔ 3 tài khoản Claude: 1 tài khoản được giữ dự phòng cho 6h sáng (trong ngày không giao)

### D14. Canva Pro: khách nhập email Canva → bot mời → bắt đầu tính 7 ngày; máy Mac tắt quá 10 phút → báo đỏ
- ✔ không nhập email Canva → nhắc nhập email, chưa giữ ghế
- ✔ nhập email → chờ Tiệm mời (chưa tính giờ)
- ✔ trang khách: đang chờ mời, đúng email
- ✔ bot (máy Mac) tắt quá 10 phút → Theo dõi báo đỏ để chủ mời tay
- ✔ bật bot → bot mời đúng email
- ✔ mời xong mới tính giờ: 7 ngày từ lúc mời
- ✔ khách 2 (email viết hoa) được mời bằng email chữ thường; nhóm có đủ 2 khách
- ✔ trang quản trị Canva thấy 2 khách

### D15. Sửa phiên 20: bạn mượn máy đăng nhập không làm chủ máy bị từ chối; chạm thẻ lại thì tính lại 30 phút
- ✔ chủ máy nhận được bình thường (trước đây: +30 điểm → mức vàng → bị từ chối mãi)
- ✔ chạm lại thẻ ở phút 24, bấm nhận ở phút 33 → vẫn nhận được

### D17. 6h sáng: ChatGPT + Claude hết cùng lúc → chủ "Đăng xuất mọi thiết bị" (giữ mật khẩu) → giao lại
- ✔ 4 khách mới nhận ChatGPT / Claude
- ✔ cả 4 hết đúng 06:00 sáng (giờ VN)
- ✔ cả 4 đăng nhập được hãng
- ✔ 6h: không còn ai dùng; mỗi tài khoản đã có người → đúng 1 việc "Đăng xuất mọi thiết bị"
- ✔ khách tới lúc 6h05 (chủ chưa làm): Claude vẫn nhận được nhờ tài khoản dự phòng
- ✔ ChatGPT chỉ hiện "còn" khi có tài khoản không phải chờ đăng xuất
- ✔ chủ "Đăng xuất mọi thiết bị" (giữ mật khẩu) + bấm Đã xong → tài khoản sẵn sàng
- ✔ sau khi chủ làm: không còn ai đăng nhập các tài khoản đó ở hãng
- ✔ khách ChatGPT hôm qua: mật khẩu cũ vẫn đúng nhưng không lấy được mã 2FA → không vào lại
- ✔ khách Claude hôm qua: không lấy được mã → không vào lại
- ✔ khách sáng sớm nhận được Claude

### D18. Hết 7 ngày CapCut: tài khoản tự bỏ; kho cũ không giao; nạp mới giao được
- ✔ 4 tài khoản CapCut đã dùng tự "Ngừng dùng"
- ✔ trang Công cụ báo CapCut nhập quá 7 ngày, không giao
- ✔ khách mới: CapCut bị khoá trên trang (kho cũ)
- ✔ nạp 10 CapCut mới → khách nhận tài khoản mới
- ✔ đăng nhập CapCut giả: còn Pro

### D19. Hết 7 ngày: bot gỡ khách Canva khỏi nhóm; Adobe tự bỏ; Claude nhập quá 7 ngày không giao
- ✔ 2 khách Canva hết hạn
- ✔ bot gỡ đúng 2 email khỏi nhóm
- ✔ nhóm Canva giả không còn khách
- ✔ trang quản trị Canva: "Đã gỡ"
- ✔ tài khoản Adobe đã giao tự "Ngừng dùng" sau 7 ngày
- ✔ Claude nhập kho quá 7 ngày → không giao (khoá trên trang)
- ✔ nạp Claude mới → giao được

### D20. Xoá dữ liệu khách: không thành cách nhận lại lượt
- ✔ xoá dữ liệu cá nhân
- ✔ cùng số điện thoại đăng ký lại → vẫn không nhận lại CapCut (1 lần / khách)

### D21. Sao lưu database đang chạy
- ✔ npm run backup ra tệp đọc được, đủ dữ liệu

### D22. Dò mật khẩu quản trị: khoá theo IP kẻ dò, chủ vẫn vào được
- ✔ sau 10 lần sai → "thử lại sau 15 phút"
- ✔ chủ (IP khác) vẫn đăng nhập được
- ✔ Theo dõi có cảnh báo đăng nhập sai

### D23. Tổng kết bộ diễn tập
- ✔ không vi phạm nào (lộ khoá 2FA / mật khẩu cho máy không giữ slot / vào hãng không giữ slot / còn trong nhóm Canva khi hết slot / lỗi 5xx)

## Ghi nhận
- D3. Quán thẻ NFC đặt 8 suất/ngày: khách thứ 9 không nhận được, câu báo rõ: câu khách thứ 9 thấy: "Hôm nay quán đã hết suất trải nghiệm. Quay lại ngày mai nhé!"
- D9. eSMS sập (hết tiền / treo): khách thấy câu dễ hiểu, chủ được báo: câu khách thấy khi eSMS lỗi: "Chưa gửi được mã. Thử lại sau ít phút."
- D9. eSMS sập (hết tiền / treo): khách thấy câu dễ hiểu, chủ được báo: eSMS treo: khách chờ 8.0 giây
- D12. Chủ thu hồi slot / khoá khách / mở khoá: khoá khách = đăng xuất khách; mở khoá xong khách phải nhận SMS đăng nhập lại
- D16. Lượt / ngày tính theo giờ Việt Nam (không theo giờ UTC): chạy lúc vừa qua nửa đêm VN — bỏ qua kiểm ranh giới ngày
- D17. 6h sáng: ChatGPT + Claude hết cùng lúc → chủ "Đăng xuất mọi thiết bị" (giữ mật khẩu) → giao lại: 10 khách ChatGPT / Claude đang dùng trên 3 tài khoản — tua tới 6h sáng
- D17. 6h sáng: ChatGPT + Claude hết cùng lúc → chủ "Đăng xuất mọi thiết bị" (giữ mật khẩu) → giao lại: 6h, trước khi chủ làm: 3/3 tài khoản vẫn còn khách hôm qua đăng nhập ở hãng (hết khi chủ bấm Đăng xuất mọi thiết bị)
- D17. 6h sáng: ChatGPT + Claude hết cùng lúc → chủ "Đăng xuất mọi thiết bị" (giữ mật khẩu) → giao lại: khách tới lúc 6h05 trước khi chủ làm: Claude còn (1 tài khoản không phải chờ), ChatGPT còn (2 tài khoản không phải chờ)
- D17. 6h sáng: ChatGPT + Claude hết cùng lúc → chủ "Đăng xuất mọi thiết bị" (giữ mật khẩu) → giao lại: sau khi chủ làm xong: 2 tài khoản Claude rảnh (1 cái lại được giữ dự phòng cho sáng mai) · trang chọn Claude: còn
- D23. Tổng kết bộ diễn tập: 50 tin SMS · 11 thư qua Worker · 21 lần vào hãng · tua 174.6 giờ
