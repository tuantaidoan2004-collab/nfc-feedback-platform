> Ghi chú 05/10/2026 (phiên 10, sửa phiên 11): tài liệu thiết kế cũ. Chỗ nào nói màn hình quầy, mã quầy, Wi-Fi quán là **đã bỏ**. Khách chứng minh đang ở quán bằng 1 trong 2 lối vào: vé từ trang quán QS (quán có QS), hoặc thẻ NFC riêng của Tiệm — chip NTAG21x thường, UID + bộ đếm chạm, không phải 424 DNA (quán chưa có QS). Xem `README.md`, `docs/CONTRACT.md`, `docs/phoi-hop-voi-QS.md`.

## Đường mail và bộ lọc mã (trả lời: "tempmail đẩy về hệ thống mình, hệ thống mình có bộ lọc riêng")

### Tóm lại: anh/chị nên làm gì, theo thứ tự

1. **Hôm nay, mất 2 phút:** làm "bài kiểm tra cửa sau" ở mục 2 với 1 địa chỉ tempmail đang có trong kho.
2. **Nếu trượt**, tức là người lạ chỉ cần gõ địa chỉ là đọc được hộp thư: chuyển kho sang tên miền riêng trong 1–2 tuần (mục 3). Trong lúc chờ, tạm ngừng cho dùng thử các tool đăng nhập bằng mã gửi qua mail.
3. **Nếu đạt:** giữ tempmail được, nhưng phải đủ các điều kiện trong bảng ở mục 3.
4. **Dù giữ hay chuyển,** bộ lọc phải làm đúng các việc ở mục 4. Quan trọng nhất là luật "mỗi tài khoản chỉ 1 người lấy mã tại một thời điểm".

Lưu ý một lần: chia sẻ tài khoản cá nhân (gói thường) cho người lạ vi phạm điều khoản của hầu hết các hãng. Càng nhiều người lạ dùng chung thì nguy cơ tài khoản bị khoá càng cao. Tool nào có gói Team/Business thì nên mời tài khoản của chính khách vào làm thành viên, hết ngày thì gỡ ra. Khi đó không có mật khẩu chung, không có mã, và tool đó không cần dùng tới bộ lọc này.

### 1. Hướng đi đúng, nhưng có một điều kiện quyết định tất cả

**Phần đúng:** cho toàn bộ mail đổ về hệ thống của mình rồi lọc là cách làm đúng. Làm vậy thì mình:
- phân loại được từng mail;
- biết mã nào thuộc về ai;
- báo động được khi có mã lạ;
- chỉ đưa con số mã cho khách, không đưa cả lá mail.

**Điều kiện quyết định:** hệ thống của mình phải là **cách duy nhất** để đọc hộp thư đó.

Ví dụ dễ hiểu: anh/chị lắp camera và đặt bảo vệ ở cửa trước (đó là bộ lọc). Nhưng nếu trang tempmail cho ai gõ địa chỉ cũng xem được hộp thư, thì đó là một cửa sau đang mở. Khách cũ nhớ email của tài khoản. Ở nhà, họ bấm "gửi mã" trên ChatGPT rồi mở trang tempmail đọc mã. Bộ lọc của mình vẫn nhận bản sao, vẫn nhận ra đây là mã "mồ côi" (không ai bấm Lấy mã) và vẫn báo Telegram. Nhưng khách đã đọc được mã rồi. Mình chỉ **biết sau** chứ không **chặn** được.

| Tình huống | Bộ lọc có thấy không? | Có chặn được khách cũ không? |
|---|---|---|
| Hộp thư chỉ hệ thống mình đọc được | Có | **Có.** Mã không hiện cho ai, khách không có cách nào xem |
| Hộp thư tempmail mà ai gõ địa chỉ cũng xem được | Có (vì bản sao được đẩy về) | **Không.** Khách đọc thẳng trên trang tempmail |
| Hộp thư riêng, nhưng máy của khách cũ vẫn còn đăng nhập | Không (vì không có mail nào được gửi) | Chỉ chặn được bằng cách cuối ngày đăng xuất mọi thiết bị và đổi mật khẩu |

Dòng cuối là điểm mù của mọi hệ thống dựa vào mail: bộ lọc chỉ thấy **lần đăng nhập mới**. Máy nào còn đăng nhập từ trước thì phải xử lý bằng checklist cuối ngày (đã nói ở phần trước).

### 2. Bài kiểm tra 2 phút: cửa sau có đang mở không?

Cần chuẩn bị: 1 điện thoại dùng 4G (tắt Wi-Fi của tiệm), 1 địa chỉ tempmail đang gắn với 1 tài khoản trong kho, 1 Gmail cá nhân.

1. Trên điện thoại, mở trình duyệt ở **chế độ ẩn danh** (không đăng nhập gì, không còn dữ liệu cũ).
2. Từ Gmail, gửi 1 mail tới địa chỉ tempmail đó, tiêu đề `KIEMTRA-4821` (số nào cũng được).
3. Trên trình duyệt ẩn danh, vào trang chủ của nhà cung cấp tempmail. Tìm ô kiểu "nhập địa chỉ", "đổi địa chỉ" hay "xem hộp thư". Gõ địa chỉ đó vào (hoặc chỉ gõ phần trước dấu @).
4. Thử thêm vài kiểu link như `trang-tempmail/inbox/<phần-trước-@>` hoặc `?email=<địa-chỉ>`. Nhiều trang cho xem hộp thư qua link như vậy.
5. Chờ 1 phút rồi tải lại trang.

**Đọc kết quả:**
- Thấy mail `KIEMTRA-4821` mà **không phải nhập mật khẩu, mã hay đăng nhập** → **TRƯỢT**. Cửa sau đang mở.
- Thấy cả mail cũ (mã đăng nhập cũ của ChatGPT, Claude...) → trượt nặng. Ai từng biết địa chỉ đều đọc được toàn bộ thư cũ.
- Có nút "Xoá" mà ai cũng bấm được → trượt thêm. Người lạ xoá được cả mail cảnh báo bảo mật.
- Trang bắt đăng nhập bằng tài khoản của anh/chị, hoặc báo "không có quyền" → **ĐẠT** bước này.

Một ví dụ để dễ hình dung: Mailinator nói rõ hộp thư công khai (đuôi @mailinator.com) ai cũng đọc và xoá được. Chỉ "tên miền riêng" ở gói trả phí mới bắt đăng nhập, và webhook cũng chỉ có ở gói trả phí. Nhiều dịch vụ tempmail khác cũng chia 2 loại như vậy. Hãy kiểm tra đúng loại mà kho đang dùng.

**Các kiểm tra khác** (mất thêm khoảng 15 phút, xem trong mục câu hỏi thường gặp hoặc tài liệu của nhà cung cấp):

| Kiểm tra | Cách làm | Đạt khi | Nếu trượt thì sao |
|---|---|---|---|
| Địa chỉ có hết hạn không | Tìm câu trả lời cho: địa chỉ giữ bao lâu, mail giữ bao lâu, người khác có lấy lại được địa chỉ không | Địa chỉ thuộc về mình chừng nào còn trả phí, không ai khác lấy được | Mất địa chỉ là mất luôn chức năng "quên mật khẩu" của tài khoản. Tệ hơn: người khác lấy lại địa chỉ, bấm "quên mật khẩu" và chiếm luôn tài khoản |
| Mỗi hộp thư có khoá riêng không | Xem tài liệu API (cách phần mềm khác lấy mail): đọc mail có cần API key hay token không | Mọi cách đọc (trang web, API) đều cần khoá mà chỉ mình có | Có API cho "đọc mail theo địa chỉ" mà không cần khoá thì đó là cửa sau thứ hai |
| Webhook có chữ ký bí mật không | Tìm trong tài liệu các chữ "signature", "signing secret", "HMAC" | Mỗi lần đẩy mail đều kèm chữ ký để mình kiểm tra | Ai biết link webhook của mình cũng đẩy được mail giả vào: mã giả, cảnh báo giả |
| Tên miền có nằm trong danh sách tempmail công khai không | Mở file `disposable_email_blocklist.conf` trong kho GitHub "disposable-email-domains", bấm Ctrl+F tìm tên miền | Không có trong danh sách | Nhiều dịch vụ dùng danh sách này để từ chối đăng ký hoặc soi kỹ tài khoản. Tài khoản dễ bị hạn chế và khó lấy lại |
| Mail có về nhanh và đủ không | Gửi liền 10 mail thử, đếm xem hệ thống mình nhận được mấy cái và sau bao lâu | Nhận đủ 10/10, mỗi mail về dưới 30 giây | Mã về chậm thì khách chờ quá 3 phút, khó chịu và tưởng lỗi |
| Có xoá mail được không | Tìm tuỳ chọn xoá ngay sau khi đẩy, hoặc API xoá | Có | Mail chứa mã nằm lâu ở nhà cung cấp, thêm một chỗ có thể bị lộ |

### 3. Giữ tempmail hay chuyển sang tên miền riêng?

| Kết quả kiểm tra | Quyết định |
|---|---|
| Trượt bài kiểm tra cửa sau | **Chuyển ngay.** Trong lúc chuyển, tạm ngừng cho dùng thử các tool đăng nhập bằng mã qua mail |
| Trượt "địa chỉ hết hạn / người khác lấy lại được" | **Chuyển ngay.** Đây là rủi ro mất cả tài khoản, không chỉ lộ mã |
| Đạt 2 điều trên, nhưng webhook không có chữ ký | Giữ tạm tối đa 1 tháng. Thêm một chuỗi bí mật dài vào link webhook. Lên lịch chuyển |
| Đạt 2 điều trên, nhưng tên miền nằm trong danh sách tempmail | Giữ tạm được. Chuyển dần khi rảnh, làm tài khoản giá trị cao trước |
| Đạt tất cả (thường là gói trả phí, dùng tên miền riêng của nhà cung cấp) | **Giữ được.** Vẫn bật xoá mail sau khi đẩy |

**Dữ kiện em đã kiểm tra:**
- tiembanquyen.com hiện dùng máy chủ tên miền của NS1 (nsone.net) và chưa có bản ghi nhận mail (MX).
- Cloudflare Email Routing chỉ chạy khi tên miền dùng DNS của Cloudflare.
- Chức năng "nhận mọi địa chỉ" (catch-all) chỉ có ở tên miền gốc, **không có ở tên miền con** như kho.tiembanquyen.com. Ở tên miền con, phải tạo từng địa chỉ một, tối đa 200 quy tắc cho mỗi tên miền.

Vì vậy em đề xuất 2 cách, cách dễ hơn đặt trước.

**Cách A (nên chọn): mua 1 tên miền riêng cho kho (ví dụ đuôi `.com`), đăng ký thẳng trên Cloudflare.**
- Chi phí khoảng 250–350 nghìn đồng/năm. Email Routing miễn phí.
- Không đụng tới DNS của website tiembanquyen.com đang chạy.
- Dùng được catch-all: có tài khoản mới thì tạo địa chỉ mới, không phải cài đặt thêm gì.
- Tên miền kho có gặp sự cố thì thương hiệu chính cũng không bị ảnh hưởng.

**Cách B: chuyển DNS của tiembanquyen.com sang Cloudflare, rồi dùng `kho.tiembanquyen.com`.**
- Phải chuyển toàn bộ bản ghi DNS của website sang. Làm sai thì web có thể sập vài giờ.
- Tên miền con không có catch-all, nên mỗi tài khoản phải thêm 1 quy tắc. Có thể thêm trên trang quản lý, hoặc ghi trong file cấu hình của Worker (Cloudflare cho làm vậy từ tháng 9/2026). Đủ dùng cho kho dưới 200 tài khoản.
- Hoặc bật kiểu "địa chỉ có dấu +" (Cloudflare hỗ trợ từ tháng 7/2025): chỉ cần 1 quy tắc cho `kho@` là nhận được cả `kho+cgpt07@`. Nhưng có thể có hãng không nhận email chứa dấu +, nên phải thử với từng hãng trước.

**Đường đi của mail khi dùng Cloudflare.** Giải thích vài từ:
- **MX:** bản ghi báo cho các máy chủ mail trên thế giới biết "mail gửi tới tên miền này thì giao cho ai". Ở đây là giao cho Cloudflare.
- **Email Worker:** một đoạn code nhỏ chạy trên Cloudflare, tự chạy mỗi khi có mail tới.
- **Webhook:** một đường link trên hệ thống của anh/chị. Worker gửi mail vào hệ thống qua đường link đó.

Worker chỉ làm 4 việc và nên viết thật gọn. Gói miễn phí của Cloudflare Workers cho 10 ms xử lý mỗi lần chạy và 100.000 lần chạy mỗi ngày. 10 quán, mỗi quán khoảng 30 mail mỗi đêm thì còn rất xa giới hạn.
1. Kiểm tra địa chỉ nhận có trong danh sách tài khoản không. Không có thì từ chối mail, không đẩy đi.
2. Ký chữ ký bí mật (HMAC, xem mục 4.5) lên mail.
3. Đẩy nguyên mail gốc tới webhook. Việc đọc và tách nội dung để hệ thống của mình làm, tránh Worker chạy quá 10 ms.
4. Nếu webhook lỗi: gửi 1 bản sao sang một hộp thư dự phòng chỉ chủ đọc được, và báo Telegram.

**Nếu không muốn viết code Worker, có các lựa chọn khác:**

| Dịch vụ | Cách đẩy về hệ thống | Chi phí (tham khảo) | Hợp khi |
|---|---|---|---|
| Cloudflare Email Routing + Worker | Worker gọi webhook, mình tự ký chữ ký | Miễn phí | Có người viết được khoảng 50 dòng code |
| ImprovMX | Điền link webhook vào ô chuyển tiếp, ImprovMX tự đẩy mail sang dưới dạng dữ liệu JSON | Phải từ gói Premium 9 USD/tháng mới có webhook | Muốn viết ít code. Em chưa thấy tài liệu nói có chữ ký; nếu không có thì thêm chuỗi bí mật dài vào link |
| Mailgun (Inbound Routes) | Đẩy mail đã tách sẵn từng phần, **kèm sẵn chữ ký HMAC, thời gian và token** | Theo các trang tổng hợp giá: gói miễn phí có 1 quy tắc nhận mail, gói Basic khoảng 15 USD/tháng | Muốn có sẵn chữ ký an toàn, không phải tự làm |
| Amazon SES (nhận mail) | Lưu mail vào kho lưu trữ rồi gọi hàm xử lý | Rẻ | Chỉ nên chọn nếu đã có người rành AWS |

**Mỗi tài khoản dùng 1 địa chỉ riêng,** ví dụ `cgpt07@<tên-miền-kho>`, `claude03@...`. Không dùng chung 1 địa chỉ cho nhiều tài khoản. Mail tới địa chỉ nào thì biết ngay của tài khoản nào, khớp mã không bị nhầm.

**Chuyển từng tài khoản một.** Nhân viên làm tay trên trang của hãng, mỗi tài khoản khoảng 10 phút.

| Đợt | Tài khoản nào | Vì sao |
|---|---|---|
| 1 (tuần đầu) | 2 tài khoản ít dùng | Chạy thử cả đường mail: mã có về không, có khớp đúng người không, Telegram có báo không |
| 2 | Tài khoản đăng nhập bằng **mã gửi qua mail** | Với loại này, ai đọc được mail là vào được tài khoản. Rủi ro cao nhất |
| 3 | Các tài khoản giá trị cao còn lại | Mất là mất nhiều tiền |
| 4 | Phần còn lại | |
| Không chuyển | Tài khoản sắp hết hạn, hoặc hãng không cho đổi email | Cho nghỉ khỏi kho dùng thử |

Checklist cho mỗi tài khoản:
1. Trên hệ thống, chuyển tài khoản sang "Bảo trì" (ngừng cấp lượt mới). Chờ lượt đang chạy kết thúc.
2. Thêm địa chỉ mới vào danh sách tài khoản, để Worker chịu nhận mail gửi tới địa chỉ này.
3. Mở "cửa sổ nhân viên" 30 phút trên hệ thống, để mail đổi email hay đổi mật khẩu không bị báo đỏ.
4. Dùng máy của tiệm đăng nhập trang của hãng, vào Cài đặt và đổi email sang địa chỉ mới. Nếu hãng gửi mã xác nhận về email cũ thì đọc ở tempmail cũ (đây là lần cuối cần tới nó). Mã xác nhận gửi về email mới sẽ đi qua đường mail mới, coi như thử luôn.
5. Đổi mật khẩu. Bấm "Đăng xuất khỏi tất cả thiết bị" nếu hãng có nút này.
6. Vào phần cài đặt bảo mật, kiểm tra không còn email khôi phục hay số điện thoại lạ.
7. Thử "Lấy mã" một lần từ đầu đến cuối.
8. Chuyển tài khoản về "Sẵn sàng" và ghi lại ngày chuyển.

### 4. Bộ lọc phải làm gì

#### 4.1. Luật khoá: mỗi tài khoản chỉ 1 người lấy mã một lúc

Đây là luật quan trọng nhất. Không có luật này, 2 khách bấm "Lấy mã" trong cùng một phút thì 2 mã sẽ về, mình không biết mã nào của ai và có thể đưa nhầm.

- Mỗi tài khoản, tại một thời điểm, chỉ có **1 cửa sổ lấy mã đang mở**. Mỗi cửa sổ kéo dài **3 phút**.
- Cửa sổ ghi rõ: tài khoản nào, khách nào, máy nào, lần chạm thẻ nào.
- Người thứ hai bấm khi cửa sổ đang mở: nếu khách đó chưa đăng nhập lần nào, hệ thống thử giao tài khoản khác cùng tool. Hết tài khoản trống thì xếp hàng: "Có bạn đang lấy mã, chờ khoảng 2 phút nhé".
- Cùng một khách bấm lại khi cửa sổ còn mở: không mở cửa sổ mới, chỉ hiện "Mã đang về, còn 1:42".
- Cửa sổ đóng khi đã giao mã, khi hết 3 phút, hoặc khi khách bấm huỷ.
- Có **vùng chờ 2 phút** sau khi cửa sổ hết hạn. Mã về trễ trong khoảng này thì xếp loại **vàng** (chủ duyệt): không tự đưa cho khách, nhưng cũng không coi là mồ côi.
- Mỗi khách tối đa **3 cửa sổ mỗi ngày**. Quá 3 thì xếp vàng.
- Mỗi cửa sổ nhận tối đa 2 mã (trường hợp khách bấm "gửi lại mã" ở app của hãng), và chỉ hiện mã mới nhất. Từ mã thứ 3 trở đi thì xếp vàng.
- Khoá này nên đặt ngay trong cơ sở dữ liệu (ràng buộc "mỗi tài khoản chỉ có 1 dòng ở trạng thái Mở"), không chỉ trong code. Như vậy 2 yêu cầu tới cùng lúc cũng không lọt được.

Khách phải làm đúng thứ tự: **bấm "Lấy mã" trên web của mình trước,** rồi mới bấm "gửi mã" ở app của hãng. Màn hình phải hướng dẫn rõ điều này. Mã về trước khi mở cửa sổ thì bị coi là mồ côi.

#### 4.2. Khớp mã với đúng người

Mỗi khi có mail tới:
1. Dựa vào địa chỉ nhận để biết là tài khoản nào. Địa chỉ không có trong danh sách thì bỏ qua và ghi lại.
2. Kiểm tra mail có thật sự từ hãng gửi không. Cần 2 điều: chữ ký DKIM hợp lệ (DKIM là chữ ký điện tử hãng gắn vào mail, chứng minh mail không bị làm giả), và tên miền gửi nằm trong danh sách của tool đó (lập danh sách này từ mail thật). Không đạt thì xếp **vàng**, ghi "nghi mail giả", và không tự cách ly tài khoản.
3. Tài khoản đang có cửa sổ mở thì mã chỉ hiện cho **đúng khách đó, trên đúng máy đó, đúng 1 lần**. Mã hiện tối đa 3 phút hoặc tới khi khách bấm "Đã nhập xong", sau đó bị che thành `••••••` và xoá khỏi máy chủ.
4. Tài khoản **không có cửa sổ nào** (không có cửa sổ của khách, không trong vùng chờ, không có cửa sổ nhân viên) thì đó là **mã mồ côi**:
   - Không hiện cho ai, kể cả khách đang giữ lượt.
   - Gửi Telegram cho chủ.
   - Cộng điểm rủi ro cho những người giữ tài khoản này gần đây (xem mục 6).
   - Đánh dấu tài khoản là "đang theo dõi".

#### 4.3. Phân loại mọi mail

Quy tắc chung: **không bao giờ chuyển nguyên lá mail, không bao giờ chuyển đường link, không chuyển tệp đính kèm.** Khách chỉ được thấy con số mã.

| Loại mail | Cách nhận biết | Hệ thống làm gì | Khách thấy gì |
|---|---|---|---|
| Mã đăng nhập, mã xác minh | Tiêu đề có "code", "mã", "verification"; trong thư có 1 dãy 4–8 ký tự | Khớp với cửa sổ, ra màu xanh, vàng hoặc đỏ (mục 4.2) | Chỉ con số mã, khi được xếp xanh hoặc được chủ duyệt |
| Link đăng nhập 1 chạm (magic link) | Có nút hoặc link "Đăng nhập", "Sign in" thay cho mã | **Không bao giờ chuyển link.** Ghi lại, báo chủ nếu không có cửa sổ | Không thấy gì |
| Đặt lại mật khẩu | "Reset password", "đặt lại mật khẩu" | Có cửa sổ nhân viên thì chỉ ghi lại. Không có thì xếp **đỏ**: có người đang thử chiếm tài khoản. Cách ly tài khoản, báo Telegram khẩn | Không thấy gì |
| Cảnh báo bảo mật: đã đổi mật khẩu, đã bật xác thực 2 lớp, đã đổi email | Tiêu đề kiểu "Your password was changed", "Email changed" | Có cửa sổ nhân viên thì chỉ ghi lại. Không có thì xếp **đỏ**: cách ly, thu hồi lượt đang chạy, khoá người đang giữ, báo Telegram khẩn | Khách đang giữ lượt nhận thông báo "Tài khoản đang bảo trì" và được chuyển sang tài khoản khác |
| Cảnh báo có đăng nhập mới, thiết bị mới | "New sign-in", "đăng nhập từ thiết bị mới" | Khớp với cửa sổ hoặc lượt đang chạy thì chỉ ghi lại. Không khớp thì xếp **đỏ**: có người vào bằng mật khẩu mà không cần mã, tức là **mật khẩu đã lộ**. Làm checklist đổi mật khẩu và đăng xuất ngay | Không thấy gì |
| Thanh toán, hoá đơn, gia hạn lỗi | "Receipt", "payment failed" | Chỉ báo chủ, mức ưu tiên thấp. Gia hạn lỗi thì ngừng cấp lượt mới cho tài khoản đó | Không thấy gì |
| Quảng cáo, bản tin | Gửi từ tên miền quảng cáo, có link "unsubscribe" | Bỏ qua, chỉ giữ thông tin cơ bản 7 ngày | Không thấy gì |
| Không nhận ra | Không khớp mẫu nào | Xếp **vàng**: hiện trên trang quản lý cho chủ xem, không tự làm gì | Không thấy gì |

**Vì sao không bao giờ chuyển link, nhất là link đặt lại mật khẩu và link đăng nhập 1 chạm:** link chính là chìa khoá. Ai có link là vào được, trên bất kỳ máy nào. Khách có thể gửi link cho bạn bè. Riêng link đặt lại mật khẩu còn cho người nhận đổi mật khẩu và chiếm luôn tài khoản.

**Tool chỉ cho đăng nhập bằng link 1 chạm, không có mã:**
1. Kiểm tra trước: nhiều hãng có lựa chọn "dùng mã thay cho link" ở màn hình đăng nhập. Có thì dùng mã.
2. Tool có gói Team/Business: mời tài khoản của chính khách vào làm thành viên, không cần mail của kho.
3. Không làm được cả 2 cách trên thì **không đưa tool đó vào kho dùng thử tự động.**

#### 4.4. Tách lấy mã

- Mỗi hãng có 1 mẫu nhận dạng gồm: tên miền gửi, kiểu tiêu đề và quy tắc tìm mã (ví dụ "đúng 6 chữ số"). Lưu các mẫu thành bảng để sửa được mà không phải sửa code.
- Lập mẫu từ mail thật: với mỗi hãng, lưu 3 mail mẫu khi chủ tự đăng nhập thử.
- Tìm được **đúng 1** mã thì dùng.
- Không tìm thấy mã, thấy 2 mã khác nhau, hoặc mail không khớp mẫu nào (có thể hãng đã đổi giao diện mail) thì xếp **vàng**. Chủ mở trang quản lý, đọc phần chữ của mail (đã bỏ hết link), rồi bấm "Gửi mã này" hoặc "Huỷ" khi cửa sổ còn mở.
- Một hãng bị lỗi tách mã quá 2 lần trong ngày thì báo Telegram: "Mẫu mail của hãng X có thể đã đổi".

#### 4.5. Bảo vệ webhook

Webhook là cửa vào của hệ thống. Không bảo vệ thì ai biết link cũng đẩy được mail giả vào: mã giả, hoặc cảnh báo giả để khiến tài khoản bị cách ly.

| Việc cần làm | Cách làm |
|---|---|
| Chữ ký bí mật (HMAC) | Bên gửi (Worker hoặc nhà cung cấp) và hệ thống mình cùng giữ 1 chuỗi bí mật. Mỗi lần đẩy mail, bên gửi dùng chuỗi đó tính ra chữ ký từ "thời gian + nội dung" và gửi kèm. Hệ thống mình tính lại, khớp thì mới nhận. Mailgun có sẵn cách này (thời gian + token + chữ ký) |
| Không có chữ ký hoặc sai chữ ký | Từ chối ngay. Quá 5 lần trong 1 giờ thì báo Telegram "có người dò webhook" |
| Lệch giờ | Chỉ nhận khi thời gian trong chữ ký lệch không quá 5 phút so với giờ máy chủ. Lệch hơn thì từ chối. Cách này chặn kiểu lưu lại mail cũ rồi gửi lại sau |
| Một mail bị đẩy 2 lần | Dùng mã định danh của mail (Message-ID) làm khoá. Mã nào đã gặp thì trả lời "đã nhận" và không xử lý lại. Bắt buộc phải có, vì nhà cung cấp hay gửi lại khi mạng chập chờn |
| Trả lời nhanh | Nhận, lưu, trả lời "OK" trong vòng 2 giây, phần xử lý làm sau |
| Chỉ dùng HTTPS | Link webhook phải bắt đầu bằng https |
| Đổi chuỗi bí mật | 6 tháng một lần, hoặc ngay khi có người nghỉ việc. Lúc đổi, cho chuỗi cũ và chuỗi mới cùng chạy 1 ngày |
| Nhà cung cấp không có chữ ký | Thêm 1 chuỗi ngẫu nhiên dài (từ 32 ký tự trở lên) vào link. Đây chỉ là giải pháp tạm, yếu hơn chữ ký thật |

#### 4.6. Giữ dữ liệu bao lâu

| Dữ liệu | Giữ bao lâu |
|---|---|
| Con số mã | Không lưu. Xoá ngay khi đã giao hoặc khi cửa sổ đóng |
| Nội dung gốc của mail | Lưu ở dạng mã hoá. Mail có mã: xoá sau 1 giờ. Mail khác: xoá sau 24 giờ. Mail cảnh báo bảo mật: giữ 7 ngày để xử lý sự cố |
| Thông tin cơ bản (giờ nhận, tài khoản, loại mail, tên miền gửi, màu, đã xử lý thế nào, ứng với yêu cầu nào) | 90 ngày |
| Thông tin khách (số điện thoại, mã thiết bị, IP) | 90 ngày, chỉ dùng để chống spam. Phải xin đồng ý khi khách nhận lượt (theo Luật Bảo vệ dữ liệu cá nhân 91/2025/QH15) |

### 5. Dữ liệu tối thiểu và luồng "Lấy mã"

#### Các bảng cần có

| Bảng | Các trường chính |
|---|---|
| `tai_khoan` (kho) | id, tool, dia_chi_mail (không trùng), kieu_dang_nhap (mã qua mail / link / mật khẩu / mời Team), nguon_mail (tempmail / tên miền riêng), trang_thai (sẵn sàng / đang dùng / theo dõi / bảo trì / cách ly / nghỉ), lan_doi_mat_khau_cuoi |
| `luot_dung` (lượt dùng thử) | id, tai_khoan_id, khach_id, thiet_bi_id, cham_the_id, bat_dau, ket_thuc, trang_thai |
| `cua_so` | id, tai_khoan_id, loai (khách / nhân viên), luot_dung_id, khach_id, thiet_bi_id, cham_the_id, mo_luc, het_han_luc, trang_thai (mở / đã giao / hết hạn / huỷ), so_ma_da_giao. **Ràng buộc: mỗi tai_khoan_id chỉ có 1 dòng ở trạng thái "mở"** |
| `mail_vao` | id, message_id (không trùng, để chống xử lý 2 lần), tai_khoan_id, nhan_luc, ten_mien_gui, dkim_dat, loai_mail, cua_so_id (có thể để trống), mau (xanh / vàng / đỏ), hanh_dong, noi_dung_ma_hoa, xoa_luc |
| `mau_mail_hang` | tool, ten_mien_gui, mau_tieu_de, quy_tac_tim_ma, loai_mail, dang_dung |
| `diem_rui_ro` | id, khach_id, thiet_bi_id, tai_khoan_id, mail_vao_id, diem, ly_do, luc |
| `duyet` (cho mã vàng) | id, mail_vao_id, cua_so_id, telegram_msg_id, quyet_dinh (duyệt / từ chối / khoá), quyet_luc, mac_dinh_khi_het_gio |

#### Các bước từ lúc chạm thẻ tới lúc thấy mã

1. Khách chạm thẻ NFC trên bàn. Điện thoại mở một link có chữ ký SUN và bộ đếm.
2. Máy chủ kiểm tra: chữ ký đúng, bộ đếm lớn hơn lần trước, link chưa dùng, chưa quá 3 phút. Đạt thì tạo một "lần chạm" chỉ dùng được 1 lần.
3. Trang hiện lượt dùng thử của khách và nút **"Lấy mã"**.
4. Khách bấm "Lấy mã". Máy chủ kiểm tra: lần chạm còn hạn, lượt dùng còn hạn, đúng máy đã nhận lượt (máy khác thì xếp vàng), chưa quá 3 cửa sổ trong ngày. Lượt đã hết hạn thì xếp đỏ.
5. Máy chủ thử mở cửa sổ cho tài khoản (theo ràng buộc chỉ 1 cửa sổ mở). Không mở được thì giao tài khoản khác hoặc cho khách xếp hàng.
6. Mở được thì màn hình hiện: "Mở ChatGPT, nhập email `cgpt07@...`, bấm Gửi mã. Mã sẽ hiện ở đây trong 1–2 phút. Còn 2:59."
7. Khách làm theo trên app của hãng, hãng gửi mail.
8. Mail tới Cloudflare (hoặc nhà cung cấp mail). Worker kiểm tra địa chỉ, ký chữ ký, rồi đẩy về webhook.
9. Webhook kiểm tra chữ ký, giờ gửi, mail có bị trùng không, rồi lưu lại và trả lời OK.
10. Bộ lọc xác định tài khoản, kiểm tra DKIM và tên miền gửi, phân loại mail, tách lấy mã.
11. Bộ lọc tìm cửa sổ đang mở của tài khoản, tính điểm rủi ro và ra màu.
12. **Xanh:** gửi mã tới đúng trang của khách (trang tự hỏi máy chủ mỗi 3 giây). Mã hiện 1 lần, sau 3 phút thì bị che. **Vàng:** gửi Telegram cho chủ kèm 3 nút Duyệt / Từ chối / Khoá. Khách thấy "Đang xác nhận, tối đa 2 phút". Hết 2 phút mà chủ chưa bấm thì làm theo mặc định đã cài sẵn. **Đỏ:** không hiện mã. Khách thấy "Chưa lấy được mã. Chạm lại thẻ tại quán, hoặc nhắn Zalo 0988 428 496".
13. Đóng cửa sổ, ghi lại, xoá mã.

### 6. Phát hiện khách cũ đăng nhập ở nhà và cách xử lý

Phần này giả sử hộp thư đã là của riêng mình (đã qua bài kiểm tra, hoặc đã chuyển sang tên miền riêng).

| Khách cũ làm gì ở nhà | Hệ thống thấy gì | Kết quả |
|---|---|---|
| Vào ChatGPT, nhập email tài khoản, bấm "gửi mã" | Có mã về nhưng không có cửa sổ, tức là **mã mồ côi** | Khách không đọc được mã vì không có cửa sau. Chủ nhận Telegram |
| Bấm "Lấy mã" trên web của mình | Không có lần chạm thẻ mới | Bị từ chối: "Chạm lại thẻ tại quán nhé". Bị cộng điểm rủi ro |
| Đăng nhập bằng mật khẩu cũ (nếu cuối ngày chưa đổi) | Có mail "đăng nhập mới" nhưng không có cửa sổ: xếp **đỏ** | Biết mật khẩu đã lộ. Làm checklist đổi mật khẩu và đăng xuất ngay |
| Bấm "quên mật khẩu" | Có mail đặt lại mật khẩu nhưng không có cửa sổ nhân viên: xếp **đỏ** | Link không tới tay ai. Tài khoản bị cách ly để kiểm tra |
| Máy vẫn còn đăng nhập từ trước (chưa bị đăng xuất) | **Không thấy gì,** vì không có mail nào được gửi | Đây là điểm mù. Chỉ chặn được bằng checklist cuối lượt: đăng xuất mọi thiết bị và đổi mật khẩu, hoặc gỡ thành viên khỏi gói Team |

**Tìm ra ai:** chỉ 1 mã mồ côi thì chưa biết được là ai. Hệ thống cộng điểm cho tất cả những người đã giữ tài khoản đó trong 7 ngày gần nhất. Nếu mã mồ côi xuất hiện ở **nhiều tài khoản khác nhau** mà chỉ có 1 người từng giữ tất cả các tài khoản đó, thì gần như chắc chắn là người đó.

Ví dụ: có mã mồ côi ở `cgpt07` lúc 23:40 và ở `claude03` lúc 0:15. Người giữ `cgpt07` gần đây là A và B. Người giữ `claude03` là B và C. Vậy B có điểm cao nhất.

Mẫu tin Telegram: `[ĐỎ] Mã mồ côi - cgpt07 - 23:41. Người giữ gần nhất: 09xx...123 (hết lượt 2 ngày trước), 09xx...456 (hết lượt 5 ngày trước). [Khoá tài khoản] [Bỏ qua]`

**Cách xử lý** (đây là số điểm để bắt đầu, chỉnh dần theo thực tế):

| Mức | Khi nào | Hệ thống tự làm | Người phải làm |
|---|---|---|---|
| 1 | Có 1 mã mồ côi | Báo Telegram. Cộng 10 điểm cho mỗi người đã giữ tài khoản trong 7 ngày. Chuyển tài khoản sang "đang theo dõi" | Chưa cần làm gì |
| 2 | Có 2 mã mồ côi trên cùng tài khoản trong 24 giờ | Chuyển tài khoản sang "bảo trì", ngừng cấp lượt mới | Đổi mật khẩu, đăng xuất mọi thiết bị (làm tay), rồi mở lại tài khoản |
| 3 | Có mail đổi mật khẩu, đổi email, bật xác thực 2 lớp hoặc đặt lại mật khẩu mà không có cửa sổ nhân viên | Cách ly ngay. Thu hồi lượt đang chạy, chuyển khách đang dùng sang tài khoản khác. Báo Telegram khẩn | Vào lấy lại tài khoản ngay |
| Khoá khách | Tổng điểm từ 30 trở lên | Khoá số điện thoại và thiết bị khỏi chương trình dùng thử | Xem lại nếu khách khiếu nại |

Tin nhắn cho khách bị khoá nên giữ lịch sự và biến thành cơ hội bán hàng: "Bạn đã dùng thử rồi nè. Nhắn Zalo 0988 428 496 để nhận ưu đãi gói chính chủ nhé."

### Câu hỏi mở
- Kho đang dùng nhà cung cấp tempmail nào, gói miễn phí hay trả phí, có dùng tên miền riêng của họ không? Kết quả bài kiểm tra 2 phút ra sao? Kết quả này quyết định giữ hay chuyển.
- Chọn mua 1 tên miền riêng cho kho trên Cloudflare (khoảng 250–350 nghìn đồng/năm, không đụng tới website) hay chuyển DNS của tiembanquyen.com (hiện đang ở NS1/nsone.net) sang Cloudflare để dùng kho.tiembanquyen.com?
- Hệ thống của anh/chị chạy trên máy chủ hay hosting nào, và ai viết code? Việc này quyết định dùng Cloudflare Worker (tự viết khoảng 50 dòng code) hay ImprovMX/Mailgun (ít code hơn, mất phí hằng tháng).
- Lập danh sách tool trong kho kèm cách đăng nhập của từng tool: mã qua mail, link 1 chạm, mật khẩu hay mời thành viên Team. Tool chỉ có link 1 chạm sẽ bị loại khỏi kho tự động.
- Mã xếp vàng mà chủ không bấm trong 2 phút (nhất là ban đêm) thì mặc định Duyệt hay Từ chối?
- Ngưỡng điểm khoá khách (đề xuất 30 điểm, mỗi mã mồ côi cộng 10 điểm) và thời gian giữ mail gốc (đề xuất 1 giờ với mail có mã, 24 giờ với mail khác, 7 ngày với mail cảnh báo bảo mật): anh/chị có muốn chỉnh không?
- Ai làm checklist đổi email, mật khẩu và đăng xuất thủ công trên trang của hãng (khoảng 10 phút mỗi tài khoản): chủ hay nhân viên? Có cần cấp quyền mở 'cửa sổ nhân viên' cho người đó không?

### Nguồn
- https://developers.cloudflare.com/email-routing/email-workers/
- https://developers.cloudflare.com/email-routing/limits/
- https://developers.cloudflare.com/email-service/configuration/subdomains/
- https://developers.cloudflare.com/changelog/post/2026-09-04-email-routing-rules-wrangler/
- https://developers.cloudflare.com/changelog/post/2025-07-21-subaddressing/
- https://developers.cloudflare.com/email-routing/
- https://developers.cloudflare.com/email-service/get-started/route-emails/
- https://developers.cloudflare.com/workers/platform/limits/
- https://www.mailinator.com/v4/faq.html
- https://documentation.mailgun.com/docs/mailgun/user-manual/receive-forward-store/receive-http
- https://costbench.com/software/email-api/mailgun/
- https://help.improvmx.com/getting-started/how-to-use-webhooks-to-receive-emails-in-your-apps
- https://improvmx.com/pricing/
- https://github.com/disposable-email-domains/disposable-email-domains