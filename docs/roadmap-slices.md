# Việc còn lại — cập nhật 06/10/2026

Viết lại sau buổi duyệt toàn bộ ngày 26/09 (Tài: *"những gì mới ở đây là cần chỉnh sửa và xoá các ý cũ"*). Tệp này chỉ
liệt kê **việc chưa làm**; hướng kiến trúc và lý do ở [`kien-truc-nen-tang.md`](kien-truc-nen-tang.md). Mọi lát chạm trang
khách hay marketing phải qua [`google-policy.md`](google-policy.md). Làm xong lát nào thì chuyển nó xuống mục cuối, một dòng.

**Cỡ:** **L** lớn (nhiều lát hoặc migration lớn) · **V** vừa (một lát) · **N** nhỏ. **Mig** = có migration (Tài chạy trên Neon
trước khi đẩy `main`).

## 00. Đang làm — gói, kích hoạt, nhân viên, collab (Tài 06/10, trước loạt template đẹp)

Nguồn: `rieng/kich-ban.md` mục 3, 3b, 7, 8, 10 (2b), 13. Làm lần lượt (lát 1–3 cùng sửa `db/schema.sql` và lớp quyền).

| # | Việc | Effort |
|---|---|---|
| G1 ✅ 06/10 `5792e71` | Gói Cơ bản 50k / Sự kiện 70k / VIP 120k (sửa cuối ngày: nhân viên ở mọi gói, VIP = mọi địa chỉ quán) thay 100k/120k (`lib/billing/plans.ts`), quyền mở khoá theo gói, "tặng đến ngày…" ở `/gov`, quá hạn 14 ngày → tắt trang, thẻ và link chuyển tới Google của quán, dashboard chỉ còn popup ghi lại thẻ | Extra |
| G2 ✅ 06/10 | Onboarding "Bạn là…" ba lối (chủ mới / Admin Tài tạo sẵn → Zalo → link đặt mật khẩu một lần / nhân viên); khách tự đến quét VietQR 10k, trừ tháng đầu; Tài bấm "Đã nhận" | Extra |
| G3 ✅ 06/10 | Nhân viên xin vào quán bằng @chủ quán / link trang / link thẻ / mã quán, chủ hoặc người có quyền Thành viên duyệt và chọn vai; nhật ký `member.join`/`member.decline` (nhờ sửa đã có `edit.request`); `/gov` đếm số lần Admin Tài dựng/sửa | Extra |
| G3b | VIP: thêm địa chỉ quán (tên, Place ID), chuyển qua lại giữa các quán; mọi địa chỉ dùng chung gói VIP của tài khoản (`kich-ban.md` mục 13) | Extra |
| G4 | Collab: chỗ báo hiệu ở khúc A + khối khúc B theo `slot`, danh mục `/gov`, quán mua 100k một lần; dựng lại "Công cụ làm việc" (Tiệm Bản Quyền) trên canvas | Max |
| G5 | Khúc "Vì sao có Quite Sensational" trên landing — nháp trong `rieng/`, Tài duyệt | High |

## 0. Thứ tự của đợt cải tổ UI/UX (audit 27/09)

Theo `docs/audit-ui-ux-20260927.md` mục 4 (**S0, S1, M2, M3, D4a, D4b, M2b xong 27/09; P5b-lite, D4c 28/09**): **S0** dọn nền (đổi "khuôn" → "template", tiêu đề theo tên quán, README) → **S1** hệ thiết kế nền tảng (token + component chung, `/gov` trước, rồi thanh dưới và URL
cho dashboard) → **M2** → **M3** → **D4a** → **D4b** → tab Thanh toán → dashboard "thời tiết của quán" → trình chỉnh như Canva +
kho template (M5) → **M4**. C1 song song khi Tài đủ điều kiện.

## 1. Kiến trúc module — hướng chính (Tài 26/09)

| # | Việc | Cỡ | Ghi chú |
|---|---|---|---|
| **M4** | **Đợt cải tổ UI/UX:** section Sự kiện ("Hôm nay ở quán", A16), Video/YouTube xem trước; khung poster tự theo khổ ảnh/video, bo góc, tuỳ chỉnh kiểu Canva; nền có chiều sâu (ảnh hero, gradient chuyển động, mixed media, hạt/lưới tương tác); **cuộn trên điện thoại:** nền đứng yên (hoặc có hiệu ứng riêng khi cuộn) thay vì bị kéo theo thẻ nổi ở cả sáu template, và kéo quá đầu trang trên Chrome iPhone không "dính" rồi bắt tải lại (Safari ổn) — Tài 27/09 | L | Sau M3. Trò "săn", quà: qua luật Khuyến mại (C2) |
| **M5** | **Kho template thử → mở:** gói mới vào kho ở trạng thái thử (admin thấy) rồi mở; giá từ manifest | V | Có thể mig |
| **M6** | **Lệnh kiểm gói template** (bốn sàn, CSS chỉ đọc ô đã khai, không đụng nút lõi) + trang xem trước gói cho designer | V | Gom các test rời hôm nay |
| A35 | Lớp trang trí kéo thả **có ràng buộc** cho template 4 (vùng an toàn loại trừ dải Google, toạ độ %) | L | Không làm bảng trắng đầy đủ |
| A34 | Ba template có tranh (Hero · Chia đôi · Nhập vai) | V | Chờ ảnh của Tài (`anh-can-cho-ao-khoac.md`) |
| A22 | Template theo ngành (cà phê, spa, quán ăn) | V | Là một gói template (`templates/README.md`) |
| A6b | Nhiều cỡ ảnh cho poster/logo (`srcset`) | V | Đi cùng M3/M4 |

## 2. Đội ngũ và quy trình

| # | Việc | Cỡ | Ghi chú |
|---|---|---|---|
| P6 | Số bản nền tảng `năm.tháng.lần` + nhật ký thay đổi | V | |
| A25 | ADR (mỗi quyết định một tệp), sổ tay vận hành, hướng dẫn người mới, README từng module | V | Để coder/designer tiếp quản |
| D8 | Staging dữ liệu giả, sổ tay sự cố, cảnh báo chi phí | V | Khi có người thứ hai trong đội |
| A19 | Hệ thiết kế dashboard: token, thành phần; gom CSS đời cũ (`app/globals.css`) | L | |
| — | Cập nhật `integration-tests/safari-local.mjs` theo đường trang khách duy nhất (A3b) | N | Chạy tay, ngoài 7 bộ |
| — | Sao lưu bằng cron trên máy tự chạy (script đã nhận mọi PostgreSQL và kho S3) | N | `tu-chay.md` mục Giới hạn |

## 3. Thương mại và vận hành nền tảng

| # | Việc | Cỡ | Ghi chú |
|---|---|---|---|
| B6 | Nối dịch vụ báo biến động số dư để "Đã nhận" tự động (Tài 06/10: chưa, Tài bấm tay — G2) | V | Khớp mã + số tiền, luôn có đường đối soát tay (`commercial-model.md` mục 7) |
| P7 | App admin trên tên miền riêng | V | |
| A21 | `/gov`: tìm quán, số liệu nền tảng, dùng được trên điện thoại | V | Cần dữ liệu thật |
| A20 | Onboarding "3 bước bắt đầu" + màn trống có hướng dẫn | V | |
| A23 | Dọn tệp R2 mồ côi | V | |
| — | Báo chủ quán tự động khi trang được duyệt (hôm nay Tài nhắn tay qua Zalo/email ở `/gov`) | N | Chờ kênh email/Zalo (B5, B7) |
| — | Video 3 phút trên trang chính, màn chào mừng của `/bat-dau` và trạng thái trống dashboard | N | Chờ video (`video-3-phut.md`) |
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
| A18 | Mã hoá cột số điện thoại | V | Cần khoá môi trường mới |
| C2 | Pháp lý đầy đủ (bên xử lý dữ liệu, chuyển dữ liệu sang Singapore, duyệt trang pháp lý nháp, khuyến mại cho A16) | — | Luật sư |
| C4 | Lưu dữ liệu trong nước, nếu C2 kết luận cần | — | |

## 6. Hạ tầng cần tài khoản của Tài

| # | Việc | Ghi chú |
|---|---|---|
| **V1** | **VPS cho tool Google Maps** (Tài 06/10: app giữ Vercel Pro): Linux ≥ 2 GB, Tài thuê và tự đăng nhập Google; không né phát hiện | `rieng/kich-ban.md` mục 5.3. Bộ `deploy/hosted/` giữ làm đường thoát khỏi Vercel |
| B2 | Sao lưu mỗi đêm: **mã xong**, Tài tạo người dùng chỉ-đọc, bucket, khoá, mật khẩu, 6 secret, rồi diễn tập khôi phục | `sao-luu.md` |
| B1 | Neon gói trả phí (quay ngược thời điểm) | Chưa chọn — không dịch vụ trả phí |
| B3 | Giám sát lỗi + kiểm tra sống + cảnh báo | **Kiểm tra sống có rồi: `/api/health`** (29/09). Còn: Tài chọn dịch vụ gọi nó và báo (ưu tiên miễn phí), và giám sát lỗi (qua adapter) |
| B5 | Email giao dịch: tự đặt lại mật khẩu, lời mời, báo cáo tuần | Qua adapter |
| B7 | Zalo OA thông báo cho chủ quán | |

## 7. Dời lại — dữ liệu và quy mô (Tài 26/09: làm sau khi mọi thứ khác ổn, brainstorm lại)

A8–A10 đọc dòng sự kiện (số liệu chuẩn, bảng theo ngày, so sánh bản phát hành) · D1 kho phân tích / tầng lạnh R2 · D2
chuẩn ngành ẩn danh · D3 AI tóm tắt góp ý · C1 sao Google của quán (**Tài 27/09 kéo lên**; đi thẳng Business Profile API, cần Tài có hồ sơ doanh nghiệp xác minh 60 ngày — `audit-ui-ux-20260927.md` mục 5) · D5 API/webhook đối
tác · D6 chuỗi, SSO (hướng: `rieng/kich-ban.md` mục 13 — làm khi có chuỗi thật hỏi mua) · D7 "quanh đây có gì" · D9 passkey.

## 8. Việc của Tài

F1 luật sư dữ liệu và sở hữu trí tuệ · tạo và xác minh hồ sơ Google Business cho Quite Sensational (đồng hồ 60 ngày xin quyền API; Tài 06/10: "sẽ") · F2 nộp đơn nhãn hiệu · F4 xoay mật khẩu đã lộ · F6 phần in: logo, dấu trên thẻ (màu và tên đã
chốt ở S1) · Google OAuth: Publish app trước khi chủ quán thật dùng nút Google · F7 `story.md`/Obsidian · thử lại sáu template trên Chrome iPhone sau bản sửa
luật cùng trang (27/09: 403 vì Origin lạ, `server/same-origin.ts`) · tạo quán thật đầu tiên và ghi thẻ.

---

## Đã xong (một dòng mỗi việc; chi tiết trong `decisions.md`, các tệp được trỏ và lịch sử git)

G1 nối/ngắt Google đòi mật khẩu, ngắt thì đăng xuất phiên khác (29/09) · L1 hạn mức đăng nhập theo địa chỉ (29/09) · T1 băng bản nháp chỉ mất trong khung (29/09) · C3b rà media/R2: duyệt sau khi link tải lên hết hạn, xoá tệp bị từ chối, tối đa 20 tệp chờ mỗi quán (29/09) · H1 CSP có nonce
cho mọi trang + header bảo vệ, thay A17 (29/09) · D4c đăng nhập bằng Google cho chủ quán (032, 28/09) · P5b-lite tab Thanh toán: QR + chuyển khoản + Zalo, Tài ghi nhận ở `/gov` (031, 28/09) · M2b lời cảm ơn shop tự viết + cửa duyệt chữ (030, 27/09) · D4a trang chính + dựng trang trước tài khoản (`/`, `/bat-dau`, `/thu/<mã>`, QR tự vẽ, 27/09) · D4b "Lưu trang của tôi" tạo tài khoản, trang chờ duyệt ở `/gov` (029, 27/09) · M1 gói template (`templates/`, 27/09) · M2 module hiệu ứng (`components/effects/`, lời cảm ơn trước Google, con trỏ nhiều màu, 27/09) · M3 section (`PageConfig` v3, bật/tắt khối, không migration, 27/09) · A1 chặn bot · A2 2FA admin · A3 dọn mã cũ (028) · A3b một đường trang khách · A4 CI 7 bộ · A5 trang pháp lý + tự xoá dữ
liệu · A6 nén ảnh · A7 tuân thủ Google (nút Google chỉ tới Google, `/huong-dan-google`) · A27 `DESIGN.md`/`PRODUCT.md` ·
A30/M23 cửa duyệt ảnh (023) · A32 tách nội dung khỏi template (022) · A33 sáu khoá template · A36 lớp da · K1–K6 sáu template · K7
bản template · P1 quán/trang (024) · P2 bảng cài đặt · P3 danh sách trang (025) · P4 vòng đời trang (026) · P5a hiện giá · P1d
dọn nợ P1 (027) · C3 mặt trận 1 cách ly dữ liệu · B2 mã sao lưu · B4 tên miền `.com` + R2 tên miền riêng · E6 tốc độ trang
khách · E9 video chỉ ở poster, nén 720p · dòng sự kiện hành vi (020) · I1 tự chạy được không cần Vercel (`tu-chay.md`).
