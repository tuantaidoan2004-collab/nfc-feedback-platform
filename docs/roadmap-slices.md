# Việc còn lại — cập nhật 26/09/2026

Viết lại sau buổi duyệt toàn bộ ngày 26/09 (Tài: *"những gì mới ở đây là cần chỉnh sửa và xoá các ý cũ"*). Tệp này chỉ
liệt kê **việc chưa làm**; hướng kiến trúc và lý do ở [`kien-truc-nen-tang.md`](kien-truc-nen-tang.md). Mọi lát chạm trang
khách hay marketing phải qua [`google-policy.md`](google-policy.md). Làm xong lát nào thì chuyển nó xuống mục cuối, một dòng.

**Cỡ:** **L** lớn (nhiều lát hoặc migration lớn) · **V** vừa (một lát) · **N** nhỏ. **Mig** = có migration (Tài chạy trên Neon
trước khi đẩy `main`).

## 1. Kiến trúc module — hướng chính (Tài 26/09)

| # | Việc | Cỡ | Ghi chú |
|---|---|---|---|
| **I1** | **Tự chạy được, không cần Vercel:** biến `endpoint` cho kho S3 (hôm nay ghép cứng R2 ở 4 chỗ) · cấu hình proxy tin cậy cho IP khách · Dockerfile + `docker-compose` (app + Postgres + kho S3) · sổ tay tự chạy · job CI chạy ca "production gate" trên image | V | Không dịch vụ trả phí. `kien-truc-nen-tang.md` mục 4 |
| **M1** | **Gói khuôn:** gom định nghĩa mỗi khuôn (hôm nay rải `config.ts` · `versions.ts` · `pricing.ts` · `skins/*.css` · `guest-styles.ts`) về một thư mục + manifest; registry sinh từ đó | V | Không đổi hành vi, không mig. Mở cửa cho designer |
| **M2** | **Module hiệu ứng:** tách kính (khuôn 3), chuyển cảnh và ánh sáng theo nghiêng (khuôn 6) khỏi `shop-feedback-v2.tsx`; manifest khai hiệu ứng dùng | V | Không đổi hành vi, không mig |
| **M3** | **Section:** `PageConfig` v3 = khuôn@bản + cài đặt + danh sách section; poster và hàng link thành section đầu; lời mời Google, góp ý, chân pháp lý là lõi cố định | L | **Mig.** Bản phát hành cũ vẫn đọc được |
| **M4** | **Đợt cải tổ UI/UX:** section Sự kiện ("Hôm nay ở quán", A16), Video/YouTube xem trước; khung poster tự theo khổ ảnh/video, bo góc, tuỳ chỉnh kiểu Canva; nền có chiều sâu (ảnh hero, gradient chuyển động, mixed media, hạt/lưới tương tác) | L | Sau M3. Trò "săn", quà: qua luật Khuyến mại (C2) |
| **M5** | **Kho khuôn thử → mở:** gói mới vào kho ở trạng thái thử (admin thấy) rồi mở; giá từ manifest | V | Có thể mig |
| **M6** | **Lệnh kiểm gói khuôn** (bốn sàn, CSS chỉ đọc ô đã khai, không đụng nút lõi) + trang xem trước gói cho designer | V | Gom các test rời hôm nay |
| A35 | Lớp trang trí kéo thả **có ràng buộc** cho khuôn 4 (vùng an toàn loại trừ dải Google, toạ độ %) | L | Không làm bảng trắng đầy đủ |
| A34 | Ba khuôn có tranh (Hero · Chia đôi · Nhập vai) | V | Chờ ảnh của Tài (`anh-can-cho-ao-khoac.md`) |
| A22 | Khuôn theo ngành (cà phê, spa, quán ăn) | V | Sau M1 — là gói khuôn |
| A6b | Nhiều cỡ ảnh cho poster/logo (`srcset`) | V | Đi cùng M3/M4 |

## 2. Đội ngũ và quy trình

| # | Việc | Cỡ | Ghi chú |
|---|---|---|---|
| P6 | Số bản nền tảng `năm.tháng.lần` + nhật ký thay đổi | V | |
| A25 | ADR (mỗi quyết định một tệp), sổ tay vận hành, hướng dẫn người mới, README từng module | V | Để coder/designer tiếp quản |
| D8 | Staging dữ liệu giả, sổ tay sự cố, cảnh báo chi phí | V | Khi có người thứ hai trong đội |
| A19 | Hệ thiết kế dashboard: token, thành phần; gom CSS đời cũ (`app/globals.css`) | L | |
| — | Cập nhật `integration-tests/safari-local.mjs` theo đường trang khách duy nhất (A3b) | N | Chạy tay, ngoài 7 bộ |

## 3. Thương mại và vận hành nền tảng

| # | Việc | Cỡ | Ghi chú |
|---|---|---|---|
| P5b | Thu tiền: kỳ tháng, chuyển khoản QR, admin bấm "đã nhận", huỷ → hết kỳ → tạm ngừng 30 ngày → đóng, mốc "bắt đầu chạy" | L | **Mig.** Tài: chưa thu, cần cảm nhận khách trước. Tự động hoá (VietQR + bot) là B6 |
| P7 | App admin trên tên miền riêng | V | |
| A21 | `/gov`: tìm quán, số liệu nền tảng, dùng được trên điện thoại | V | Cần dữ liệu thật |
| A20 | Onboarding "3 bước bắt đầu" + màn trống có hướng dẫn | V | |
| A23 | Dọn tệp R2 mồ côi | V | |
| A31 | Trang giới thiệu nền tảng + nhận diện (thay trang `/` tĩnh hiện nay) | L | Cần F6. Không đụng trang khách |
| — | Chốt: đền bù khi tạm dừng khẩn cấp · thẻ chuyển giữa các trang · dữ liệu trang đã đóng | — | Tài quyết |

## 4. Dashboard của chủ quán

| # | Việc | Cỡ |
|---|---|---|
| A11 | Danh sách phiên đăng nhập + đăng xuất máy khác | V |
| A12 | 2FA cho chủ quán và thành viên | V |
| A13 | Gán người phụ trách + cờ "đã liên hệ khách" (Mig) | V |
| A14 | Quy tắc tự động: 1–2 sao hay có số gọi lại → chuông ngay (sau A13) | V |
| A15 | Lưu bộ lọc trong Dữ liệu | V |
| A24 | Dashboard tiếng Anh ("Review Landing Pages") | V |
| A26 | PWA + thông báo đẩy | V |
| E1–E5, E7 | Menu điện thoại chật · skeleton thay "Đang tải…" · tương phản WCAG AA · bàn phím trong popup · chế độ tối · nút ⓘ đủ 44px | N |

## 5. An toàn, quyền riêng tư, pháp lý

| # | Việc | Cỡ | Ghi chú |
|---|---|---|---|
| **PH** | **Cột `purpose` cho số điện thoại** (gọi lại vì khiếu nại · sự kiện) — quyết định 21/09 chưa làm | N | **Mig.** Phải có trước section nào xin số |
| RT | **Hạn giữ dữ liệu**: xoá tự động theo lời hứa "tối đa 12 tháng" | V | Dời; **hạn chót 9/2027** |
| A17 | CSP đầy đủ, cả trang khách | V | |
| A18 | Mã hoá cột số điện thoại | V | Cần khoá môi trường mới |
| C3b | Rà cách ly mặt trận 3 (media/R2) | V | Mặt trận 1 xong 26/09 |
| C2 | Pháp lý đầy đủ (bên xử lý dữ liệu, chuyển dữ liệu sang Singapore, duyệt trang pháp lý nháp, khuyến mại cho A16) | — | Luật sư |
| C4 | Lưu dữ liệu trong nước, nếu C2 kết luận cần | — | |

## 6. Hạ tầng cần tài khoản của Tài

| # | Việc | Ghi chú |
|---|---|---|
| B2 | Sao lưu mỗi đêm: **mã xong**, Tài tạo người dùng chỉ-đọc, bucket, khoá, mật khẩu, 6 secret, rồi diễn tập khôi phục | `sao-luu.md` |
| B1 | Neon gói trả phí (quay ngược thời điểm) | Chưa chọn — không dịch vụ trả phí |
| B3 | Giám sát lỗi + kiểm tra sống + cảnh báo | Cần chọn dịch vụ (ưu tiên miễn phí, qua adapter) |
| B5 | Email giao dịch: tự đặt lại mật khẩu, lời mời, báo cáo tuần | Qua adapter |
| B7 | Zalo OA thông báo cho chủ quán | |

## 7. Dời lại — dữ liệu và quy mô (Tài 26/09: làm sau khi mọi thứ khác ổn, brainstorm lại)

A8–A10 đọc dòng sự kiện (số liệu chuẩn, bảng theo ngày, so sánh bản phát hành) · D1 kho phân tích / tầng lạnh R2 · D2
chuẩn ngành ẩn danh · D3 AI tóm tắt góp ý · C1 Google Business Profile API · D4 tự đăng ký + dùng thử · D5 API/webhook đối
tác · D6 chuỗi, SSO · D7 "quanh đây có gì" · D9 passkey.

## 8. Việc của Tài

F1 luật sư dữ liệu và sở hữu trí tuệ · F2 nộp đơn nhãn hiệu · F4 xoay mật khẩu đã lộ · F5 bật bảo vệ nhánh `main` · F6
nhận diện nền tảng (logo, dấu trên thẻ) · F7 `story.md`/Obsidian · thử sáu khuôn trên iPhone/Android thật (kèm lỗi Googy
"Chưa kết nối được") · tạo quán thật đầu tiên và ghi thẻ.

---

## Đã xong (một dòng mỗi việc; chi tiết trong `decisions.md`, các tệp được trỏ và lịch sử git)

A1 chặn bot · A2 2FA admin · A3 dọn mã cũ (028) · A3b một đường trang khách · A4 CI 7 bộ · A5 trang pháp lý + tự xoá dữ
liệu · A6 nén ảnh · A7 tuân thủ Google (nút Google chỉ tới Google, `/huong-dan-google`) · A27 `DESIGN.md`/`PRODUCT.md` ·
A30/M23 cửa duyệt ảnh (023) · A32 tách nội dung khỏi khuôn (022) · A33 sáu khoá khuôn · A36 lớp da · K1–K6 sáu khuôn · K7
bản khuôn · P1 quán/trang (024) · P2 bảng cài đặt · P3 danh sách trang (025) · P4 vòng đời trang (026) · P5a hiện giá · P1d
dọn nợ P1 (027) · C3 mặt trận 1 cách ly dữ liệu · B2 mã sao lưu · B4 tên miền `.com` + R2 tên miền riêng · E6 tốc độ trang
khách · E9 video chỉ ở poster, nén 720p · dòng sự kiện hành vi (020).
