# Phối hợp giữa 2 tính năng: Công cụ làm việc (TBQ) và trang quán (Quite Sensational) — gửi Tài

Hai đồng nghiệp, hai tính năng riêng:

| | **Quite Sensational (QS)** — Tài | **Công cụ làm việc miễn phí (TBQ)** — Tiệm Bản Quyền |
|---|---|---|
| Làm gì | Thẻ NFC/QR → trang của quán, lời mời đánh giá Google, góp ý riêng, dashboard chủ quán | Khách nhận 1 công cụ làm việc bản quyền dùng miễn phí: SĐT + OTP, chống lạm dụng, kho tài khoản, lấy mã đăng nhập |
| Mã nguồn, máy chủ, dữ liệu | Repo `nfc-feedback-platform` (Next.js + PostgreSQL) | Thư mục `tbq-trial` (Node + SQLite), máy chủ và tên miền riêng |
| Giao diện | Thiết kế của QS (template của từng quán) | Thiết kế riêng của Tiệm Bản Quyền |

**Hai tính năng nối nhau ở đúng một điểm:** khúc B của trang quán (vùng dưới nút Google và các nút của quán) có khối
**"Công cụ làm việc"** với 2 nút; khách bấm → mở trang của TBQ ở tab mới. Ngoài 2 link đó, hai bên không gọi nhau,
không chia sẻ dữ liệu khách.

> Nguồn duy nhất của chữ bên TBQ: `src/qs-event.js`. Bên QS: `lib/events/catalog.ts` (sự kiện `tbq-cong-cu`).
> Có test bắt buộc tài liệu này giống hệt chữ trong code.

## 0. Bản vá đã làm sẵn cho repo QS (khúc B)

Tiệm đã viết sẵn phần QS theo đúng khung Tài để lại (`SECTION_KINDS` "khối sau là loại mới ở vùng dưới", tab Library →
Sự kiện, "mở cho quán đã đăng ký gói sự kiện"). Nhánh `tbq/khuc-b-cong-cu`, tách từ `feat/local-app-foundation` commit `3571676`;
bản vá ở `tbq-trial/docs/qs-patch/`. Tài xem, sửa theo kịch bản của Tài rồi gộp — Tiệm không đẩy gì lên repo.

| Phần | Tệp |
|---|---|
| Danh mục sự kiện (chữ, 2 nút, tên miền TBQ, biến `NFC_EVENT_TBQ_ORIGIN` cho máy thử) | `lib/events/catalog.ts` |
| Bảng `shop_events` (quán nào được mở sự kiện nào) — thêm cuối `db/schema.sql`, không migration | `db/schema.sql` |
| Khối loại `event` trong `PageConfig` v3: chỉ ở vùng dưới, không bao giờ là khối đầu tiên ngay dưới nút Google, mỗi sự kiện 1 lần | `lib/publishing/config.ts` |
| Lưu nháp / phát hành từ chối sự kiện chưa mở (`EVENT_NOT_OPEN`); trang khách tự ẩn sự kiện Tài đã đóng, không cần phát hành lại | `lib/events/shop-events.ts`, `lib/publishing/repository.ts` |
| `/gov` → bảng shop: cột **Sự kiện**, nút Mở / Đóng (ghi `admin_audit`) | `components/admin-shops.tsx`, `app/gov/api/shops/events/route.ts` |
| Library → **Sự kiện**: thẻ sự kiện, Add / Gỡ cho từng trang (trang đang khớp bản nháp thì lên ngay; có sửa dở thì chỉ vào bản nháp) | `components/qs/tabs/library.tsx`, `lib/owner/events.ts`, `app/api/owner/v2/[shop]/events/route.ts` |
| Trang khách vẽ khối: tiêu đề, 1 câu, 2 nút kiểu nút link của template (`guest-links`), dòng "dành cho mọi khách của quán"; đo lượt bấm `event_tapped` `{ event, item }` | `components/shop-feedback-v2.tsx`, `components/published-page.tsx`, `components/guest-page.css`, `server/page-events.ts` |

Đã chạy thật trên máy (Postgres + `scripts/local.mjs`): Tài mở sự kiện ở `/gov` → chủ quán Add trong Library → trang
`/quan-mau` hiện khối dưới các nút của quán → bấm nút mở đúng trang TBQ của quán.

## 1. Nội dung khối trên trang quán

| Mục | Nội dung | Giới hạn |
|---|---|---|
| Mã sự kiện | `tbq-cong-cu` | `^[a-z][a-z0-9-]{0,31}$` |
| Tiêu đề | Công cụ làm việc | ≤ 40 ký tự |
| Câu ngắn | ChatGPT, Canva, CapCut… bản Pro xịn xò cho bạn chạy deadline ngay tại quán. Ai ngồi quán cũng nhận được, chọn 1 món là xong. | ≤ 160 |
| Nút | Nhận công cụ Pro miễn phí → `/qs/{shop}` (Tài 08/10; bỏ nút "Về chúng tôi") | ≤ 40 |
| Dòng cuối | Do Tiệm Bản Quyền tổ chức · dành cho mọi khách của quán | |
| Tên miền | `https://thu.tiembanquyen.com` *(đổi theo tên miền thật của TBQ khi có HTTPS)* | chỉ `https://` |
| Bên làm | Tiệm Bản Quyền | |

`{shop}` = slug của **quán** trên QS (chữ thường), không phải slug của từng trang: TBQ gắn quán theo mã này.
Tiếng Anh có sẵn trong `catalog.ts` cho nút đổi ngôn ngữ của trang.

## 2. Hình ảnh

- Khối **không có màu riêng**: 2 nút dùng đúng kiểu nút link của template quán đang dùng, nên mỗi quán một vẻ.
  Một vạch mảnh tách khối khỏi các nút của quán ở trên. Giao diện chi tiết cho từng quán làm sau.
- **Logo / banner** (nếu Tài muốn thêm vào thẻ sự kiện trong Library): PNG nền trong 512×512; banner 4:5 hoặc 1:1, ≥ 1080 px.
  Không chèn chữ nào về đánh giá/Google/sao (QS không đọc được chữ trong ảnh — `google-policy.md` mục 3b).

## 3. Thông tin cho khách

- **Điều kiện:** dành cho **mọi khách** của quán. Mỗi số điện thoại nhận 1 công cụ/ngày;
  khách phải đang ngồi ở quán (nối Wi-Fi của quán, hoặc nhập mã 4 số hiện ở quầy). Không liên quan gì tới việc đánh giá.
- **Chính sách riêng tư:** `https://thu.tiembanquyen.com/privacy`
- **Hỗ trợ:** Zalo 0988 428 496

## 4. Luật Google — áp bên TBQ để khối trên trang quán không làm quán bị phạt

| Luật (`docs/google-policy.md` bên QS) | Bên TBQ / bản vá |
|---|---|
| Dành cho mọi khách, không phụ thuộc việc bấm/đánh giá Google | Khối hiện cho mọi khách; TBQ không hỏi và không biết khách có đánh giá hay không |
| Chữ không nối quà với đánh giá (luật 4) | Chữ khối không nhắc tới đánh giá; TBQ chạy **cùng "dây bẫy" `freeTextProblem` của QS** cho chữ khối và mọi chữ admin TBQ sửa được; có test |
| Không đặt cạnh nút Google kiểu gợi ý trao đổi (luật 8) | Khối chỉ ở vùng dưới, không bao giờ là khối đầu tiên ngay dưới lời mời Google; có vạch tách và dòng "dành cho mọi khách" |
| Không hỏi khách đã đánh giá chưa, không đòi chụp màn hình | Đúng |
| Link `https://`, không rút gọn; mở tab mới `rel="noopener noreferrer"` | Đúng; TBQ không cần Referer |
| Không chuyển dữ liệu khách sang bên kia | QS chỉ gắn mã quán vào link. Khách tự nhập số trên trang TBQ, có ô đồng ý riêng và trang `/privacy` |

## 5. Điều Tài nên biết (đọc repo QS)

**5a. Mã quán trên link** — bản vá đã gắn sẵn (`{shop}`). TBQ dùng nó để biết khách đang ở quán nào khi khách dùng 4G.
Mã quán trên link **không** dùng để chứng minh khách đang ở quán (vẫn phải Wi-Fi hoặc mã quầy), và không phải dữ liệu cá nhân.

**5b. (Lỗi nhỏ) Dây bẫy chữ để lọt chính câu ví dụ trong HANDOFF mục 2.3.**
`freeTextProblem('Đánh giá 5 sao để nhận tài khoản')` trả `null` trên commit `3571676`, vì danh sách `REWARD` chưa có
"tài khoản". TBQ đã thêm `'tai khoan', 'account', 'dung thu', 'trial'`. Đề nghị QS thêm giống vậy.
Ghi chú thêm: câu "Sao chép mã miễn phí" bị chặn nhầm (từ "sao") — chấp nhận được, chỉ cần biết.

**5c. `event_tapped`** — bản vá ghi `detail: { event: 'tbq-cong-cu', item: 'nhan' }` (08/10: chỉ còn một nút), đúng bộ kiểm
`detail()` của `server/page-events.ts` (khoá ngắn, không dùng uuid).

**5d. Số liệu đối chiếu.** QS đếm lượt bấm khối (`event_tapped`) theo quán; TBQ đếm lượt vào, lượt dùng, khách quay lại,
lượt bấm "Mua qua Zalo" theo quán (trang Báo cáo quán của TBQ, chỉ số đếm). Hai bên đối chiếu được nếu cần.

## 6. Thêm một quán — việc của mỗi bên

1. **QS (Tài):** `/gov` → dòng của quán → **Sự kiện: Mở**; chủ quán vào Library → Sự kiện → **Add** vào trang.
2. **TBQ:** tạo quán trong `/admin`, điền **Mã quán trên QS** (phần cuối link trang quán, vd. `k3x9q`),
   đặt **màn hình quầy** (điện thoại cũ nối Wi-Fi quán, mở link màn hình quầy).
3. **Thử:** điện thoại nối Wi-Fi quán → mở trang quán trên QS → bấm **Nhận công cụ làm việc miễn phí** → phải thấy "Đã thấy bạn đang ở quán".

## 7. Khi đổi hoặc dừng

- Đổi chữ khối: đổi **cùng lúc** hai bên (TBQ: `src/qs-event.js`; QS: `lib/events/catalog.ts`).
- Dừng ở một quán: Tài → `/gov` → **Sự kiện: Đóng** (khối biến mất khỏi mọi trang của quán ngay). TBQ → trang quán → **Tạm dừng**
  (khách vào bằng link cũ thấy "Quán đang tạm dừng chương trình").
- Đổi tên miền TBQ: đổi `origin` trong `catalog.ts` (một chỗ), mọi quán nhận link mới.

## 8. Kỹ thuật

- TBQ chỉ cần một `GET` tới link; không cần header, cookie hay chữ ký gì từ QS.
- Máy xem trước link (Zalo/Facebook/Telegram) không bị tính lượt; trình duyệt **trong** app Zalo (khách quét QR bằng Zalo) vẫn được tính.
- TBQ chạy bằng Node + Caddy trên máy chủ riêng (không Docker). Caddy ghi đè `X-Real-IP`, TBQ chỉ tin header đó để nhận diện Wi-Fi quán.
- Máy thử của QS: `NFC_EVENT_TBQ_ORIGIN=http://localhost:3917` (chỉ nhận `http://localhost` / `127.0.0.1` khi `NFC_ENV=local`).
