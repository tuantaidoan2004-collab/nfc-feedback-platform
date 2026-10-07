# Diễn tập vận hành — kho giả, vận hành thật (05/10/2026)

Chạy: `npm run van-hanh` → bảng điều khiển http://localhost:3930/dien-tap (mật khẩu quản trị in ra màn hình).
`npm run van-hanh -- --reset` để làm lại từ đầu. Dữ liệu ở `~/.tbq-van-hanh`, không đụng database thật.

## Khác gì `npm run local` và `npm run sim`

| | `local` | `sim` | **`van-hanh`** |
|---|---|---|---|
| Chế độ máy chủ | thử (OTP hiện trên trang) | production | **production** (khoá thật, `/colap`, HTTPS giả qua Caddy giả) |
| OTP | hiện trên màn hình | máy eSMS giả | **đi đường eSMS thật** tới máy eSMS giả → xem ở "Điện thoại" |
| Thư mã | lệnh fake-mail | JSON có chữ ký | **đúng code Cloudflare Worker** trong `extras/` |
| Ai bấm | người | máy (600 khách giả) | **người thật trên trình duyệt** |
| Đồng hồ | thật | tua nhanh | thật + nút **tua giờ** (lùi mốc thời gian trong database) |
| Hãng | không có | giả trong code | **trang đăng nhập giả** — khách phải vào được bằng đúng thông tin Tiệm giao |

- Mỗi máy khách là 1 địa chỉ riêng: `may1.localhost:3930` … `may4` (cookie tách nhau như 4 điện thoại). Chủ tiệm: `chu.localhost:3930`.
- Chủ tiệm tự làm như ngày thật: tạo quán, tạo thẻ NFC, dán kho (bảng điều khiển sinh sẵn danh sách), làm Việc tay.
- Tự kiểm liên tục: khoá 2FA không bao giờ hiện ra; mật khẩu chỉ hiện cho máy đang giữ slot; ai đăng nhập hãng mà không giữ slot → ghi vi phạm.

## Đã diễn tập (8 ngày giả, 4 khách, 2 quán)

1. Chủ: đăng nhập quản trị → tạo quán có QS (Sáng Q1) + quán chưa có QS (Cộng Đêm, 3 thẻ NFC) → dán kho 6 ChatGPT, 10 CapCut, 4 Adobe, 5 Gemini.
2. Khách 1 (iPhone, Wi-Fi): chạm thẻ QS → SMS → ChatGPT Slot 1 → đăng nhập ChatGPT giả bằng mật khẩu + mã 2FA trên trang Tiệm ✔
3. Khách 2 (Android): chạm thẻ NFC → Adobe → vào Adobe trước, Adobe tự gửi mã, rồi mới bấm "Lấy mã" → mã vẫn tới đúng ✔
4. Link thẻ NFC chép sang máy ở nhà → "Chạm lại thẻ trên bàn nhé" ✔
5. Khách 3 (4G): CapCut 7 ngày → đăng nhập CapCut giả ✔
6. Tua 24 giờ: ChatGPT + Adobe hết hạn → 2 việc tay; khách thấy "Hết giờ dùng thử" + nút Zalo; phiên cũ ở hãng còn tới khi chủ đổi mật khẩu (đã biết).
7. Chủ đổi mật khẩu bên hãng → phiên cũ bị đá → dán mật khẩu mới ở Việc tay → giao lại. Khách cũ thử mật khẩu cũ → không vào được ✔
8. Hôm sau: khách 1 lấy Adobe (bấm "Lấy mã" trước rồi mới đăng nhập) ✔; khách 2 lấy Gemini → nhận link 1 lần ✔
9. Tua 7 ngày: CapCut hết hạn; chủ nạp 10 CapCut mới; ChatGPT xong việc bằng "Giữ mật khẩu cũ — chỉ đăng xuất"; khách mới nhận đúng CapCut mới nạp ✔

Kết quả: **0 vi phạm** · 5 tin SMS · 2 thư mã qua Worker · 5 lần vào hãng đúng người, 1 lần khách cũ bị chặn.

## Lỗi tìm ra và đã sửa

| # | Lỗi | Ảnh hưởng thật | Sửa |
|---|---|---|---|
| 1 | Mã 2FA trên trang khách **đứng lại khi khách chuyển sang app ChatGPT** (trình duyệt ngừng chạy trang nền). Quay lại vẫn thấy mã cũ, "đổi sau 20 giây" | Khách nhập sai mã 2FA, tưởng hệ thống hỏng | Giây còn lại tính theo đồng hồ; quay lại trang là lấy mã mới ngay (`src/public/app.js`) |
| 2 | Việc tay "Đổi mật khẩu": ô mật khẩu mới **không bắt buộc**. Chủ quên dán → kho giữ mật khẩu cũ, tài khoản vẫn "Sẵn sàng" | Vài hôm sau khách nhận mật khẩu sai, không đăng nhập được | Bắt buộc dán mật khẩu mới; ChatGPT (có 2FA) được tick "Giữ mật khẩu cũ — chỉ đăng xuất" (`completeTask`, Việc tay, Theo dõi) |
| 3 | Trang Theo dõi tự làm mới 10 giây/lần và **xoá chữ đang gõ** trong ô mật khẩu | Chủ gõ mật khẩu trên điện thoại bị mất giữa chừng | Chỉ vẽ lại khi danh sách việc thay đổi (`src/public/admin.js`) |
| 4 | CapCut: người đầu hết 7 ngày mà tài khoản chưa đủ 2 người → vẫn "Sẵn sàng", **người sau nhận tài khoản đã hết Pro** | Khách nhận CapCut không có Pro | Người cuối hết hạn → bỏ tài khoản; tài khoản nhập kho quá 7 ngày không giao; trang Công cụ ghi rõ "(x nhập quá 7 ngày, hết Pro — không giao)" |
| 5 | Kho: form nhập luôn chọn sẵn ChatGPT kể cả khi đang xem CapCut; còn liệt kê công cụ đã tắt và dòng gợi ý Canva đã bỏ | Dễ dán nhầm Adobe vào CapCut (không báo lỗi) | Chọn sẵn công cụ đang xem, chỉ công cụ đang bật, bỏ dòng Canva |
| 6 | "Còn 4 lần lấy mã" không giảm sau khi bấm | Khách tưởng lấy mã không tính lượt | Cập nhật ngay sau khi bấm |
| 7 | Hết phiên quản trị → đăng nhập lại về Tổng quan thay vì trang đang mở | Chủ mở Theo dõi trên điện thoại phải bấm lại | Quay về đúng trang (chỉ trang nội bộ `/admin…`) |
| 8 | Việc tay ghi lý do bằng mã máy `slot_expired` | Khó hiểu | "khách cuối vừa hết hạn" / "slot bị thu hồi" / "thư lạ từ hãng" |
| 9 | Trang quán **chưa có QS** vẫn hiện khối "Nối với trang quán (Quite Sensational)" | Rối | Quán chưa có QS chỉ hiện 1 dòng "khách vào bằng thẻ NFC riêng" + lượt vào |
| 10 | Trang Gemini của khách hiện đồng hồ "Còn 23:59:58" và "Chỉ dùng 1 máy…" | Link nhận quà dùng 1 lần không có hạn dùng | Bỏ đồng hồ với loại mã / link nhận quà |
| 11 | Lý do kết thúc slot ghi `expired`, `revoked`… | Khó hiểu | "hết hạn", "thu hồi", "tài khoản bị cách ly"… |

Sau sửa: `npm test` 77/77 (thêm kiểm cho #2, #4, #7), `npm run e2e` 134/134, `npm run sim` 0 vi phạm (số giao CapCut không đổi so với trước).

## Còn ghi nhận (đã biết từ trước)

- Khách hết hạn vẫn dùng tiếp phiên cũ ở hãng tới khi chủ làm Việc tay (mô phỏng: ~7 giờ). Làm Việc tay càng sớm càng tốt — mở trang **Theo dõi** trên điện thoại.
- Kho CapCut phải nạp mới mỗi ngày: tài khoản nhập quá 7 ngày tự không giao nữa (trang Công cụ ghi rõ số tài khoản quá hạn).

## Lần 2 — kịch bản vận hành sâu tự động (`npm run van-hanh-sau`, ~1 phút)

Chạy 1 bản diễn tập riêng (cổng 3940, thư mục tạm — không đụng dữ liệu diễn tập của bạn) và đóng vai chủ + ~45 máy khách
(địa chỉ `wifiN` / `g4N` / `nhaN`, cookie riêng). 19 tình huống, **68/68 bước đạt** sau khi sửa. Báo cáo chi tiết: `docs/bao-cao-van-hanh-sau.md`.

D1 dựng ngày đầu + nhập kho (trùng, thiếu 2FA) · D2 6 khách ChatGPT (5 người / tài khoản, Slot 1…5, đăng nhập hãng bằng mã 2FA) ·
D3 quán 8 suất: người 9 bị báo hết suất · D4 Adobe 4 lượt/ngày: người 5 thấy khoá trên trang · D5 Adobe dùng chung: 2 thứ tự lấy mã + người ngoài có mật khẩu ·
D6 Gemini hết link, link đưa cho bạn bị hãng từ chối · D7 cùng SĐT trên laptop: không thấy mật khẩu, không lấy được mã · D8 "Báo Tiệm" hiện ở Theo dõi ·
D9 eSMS báo lỗi / treo: khách được báo trong ≤ 8 giây, chủ thấy cảnh báo, eSMS chạy lại là đăng nhập được ngay · D10 ngồi quá 30 phút: lấy mã phải chạm thẻ lại ·
D11 người ngoài đổi mật khẩu ChatGPT đang có 5 người: cách ly, thu hồi, khách nhận lại ngay tài khoản khác · D12 chủ thu hồi / khoá / mở khoá ·
D13 lượt/ngày tính theo **giờ VN** (00:15 VN = 17:15 UTC hôm trước vẫn là hôm nay) · D14 hết hạn lệch giờ: chỉ đổi mật khẩu khi người cuối hết hạn ·
D15 CapCut 7 ngày: tự bỏ, kho cũ không giao, nạp mới giao được · D16 xoá dữ liệu khách không thành cách nhận lại lượt · D17 sao lưu khi đang chạy ·
D18 dò mật khẩu quản trị: khoá IP kẻ dò, chủ vẫn vào · D19 0 vi phạm.

### Lỗi tìm ra lần 2 (đã sửa)

| # | Lỗi | Ảnh hưởng thật | Sửa |
|---|---|---|---|
| 12 | **Adobe dùng chung 2 người**: người 1 vừa lấy mã xong (lượt của họ còn "nghe" mã gửi lại ~3 phút); người 2 đăng nhập ngay sau → mã của người 2 bị **gán cho người 1** (hoặc coi là "mã về trễ" của người 1). Người 2 bấm "Lấy mã" thì chờ mãi | Khách thứ 2 không đăng nhập được Adobe; mã do **người ngoài** gây ra cũng bị nuốt → **mất báo động mã mồ côi** | Chỉ thay / tính "về trễ" khi tài khoản không còn ai khác dùng; còn người khác thì để chờ 90 giây, ai bấm "Lấy mã" sẽ nhận, không ai nhận thì báo đỏ (`src/domain/codes.js`, có test) |
| 13 | Tài khoản bị **cách ly** (hãng báo mật khẩu / 2FA bị đổi) mà Việc tay vẫn cho tick "Giữ mật khẩu cũ" | Kho giữ mật khẩu sai, giao lại cho khách | Cách ly thì bắt buộc mật khẩu mới; thêm ô **khoá 2FA mới** ngay trong Việc tay / Theo dõi (có test) |
| 14 | Ô nhập ở Việc tay trên điện thoại hẹp, chữ gợi ý bị cắt | Khó dùng trên điện thoại | Ô giãn hết chiều ngang |

Ghi nhận (không phải lỗi): khoá khách = đăng xuất khách, mở khoá xong khách nhận SMS đăng nhập lại. eSMS treo thì khách chờ 8 giây mới được báo.
Mọi trang quản trị đã đo ở khổ 375px: không trang nào tràn ngang.
