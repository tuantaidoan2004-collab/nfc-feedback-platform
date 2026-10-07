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

**Quán không phải làm gì và Tiệm không xin quán quyền gì.** Kho tài khoản, máy chủ, code, hỗ trợ khách đều do Tiệm Bản Quyền lo.
Ở quán có trang QS, Tiệm không đặt thêm gì (không màn hình quầy, không mã quầy, không Wi-Fi, không thẻ riêng) — thẻ / QR trên bàn là của QS.
(Quán chưa dùng QS thì Tiệm tự đặt thẻ NFC riêng của Tiệm, dẫn thẳng về TBQ — không dính gì tới QS.) Chủ quán không phải bấm "Add" gì cả:
Tài mở sự kiện cho quán ở `/gov` là khối tự hiện trên mọi trang của quán.

> Nguồn duy nhất của chữ bên TBQ: `src/qs-event.js`. Bên QS: `lib/events/catalog.ts` (sự kiện `tbq-cong-cu`).
> Có test bắt buộc tài liệu này giống hệt chữ trong code.

## 0. Bản vá đã làm sẵn cho repo QS (khúc B, khung canvas — đợt ②)

Nhánh `tbq/khuc-b-canvas`, **dựng lại trên `feat/local-app-foundation` commit `78b8fbf`** (Tài đẩy tối 05/10: bỏ trình sửa canvas, chọn mẫu →
Phát hành luôn / Nhờ admin sửa; trước đó dựng trên `22b44b1`, đợt ② — trang quán là tài liệu canvas, PageConfig v4); bản vá ở `tbq-trial/docs/qs-patch/khuc-b-canvas.patch`. **Chưa commit, chưa đẩy** — Tài xem, sửa theo kịch bản
của Tài rồi gộp. Bản vá cũ cho khung v3 (`khuc-b-cong-cu.patch`, nhánh `tbq/khuc-b-cong-cu`) đã bỏ: khung đó không còn.

**Khúc B nằm đúng chỗ Tài chừa sẵn:** prop `afterFirst` của `CanvasPage` (`components/canvas/render.tsx`, "the shop's events (khúc B,
kịch bản mục 8)"). Mỗi sự kiện đang mở là **một khúc canvas thật**, vẽ bằng chính `SectionView`, đặt giữa khúc đầu và phần còn lại.
Khúc này không nằm trong tài liệu của quán (chủ quán không sửa, không phát hành lại); nó mượn nét của trang để mỗi quán một vẻ:
nền = màu trang chạy tiếp dưới khúc cuối (như dòng chân trang); chữ = màu + phông tiêu đề của template nếu đủ tương phản (≥ 4.5),
không thì trắng / gần đen; nút = kiểu nút của template (pill, gradient, ring, outline, soft, glow, note) với màu của nó, template
không có nút như vậy thì pill đảo màu. Có vạch ngăn trên cùng và dòng "Do Tiệm Bản Quyền tổ chức · dành cho mọi khách của quán".

| Phần | Tệp |
|---|---|
| Danh mục sự kiện (chữ, 2 nút, tên miền TBQ, `NFC_EVENT_TBQ_ORIGIN` cho máy thử, khoá vé `NFC_EVENT_TBQ_KEY`) | `lib/events/catalog.ts` (mới) |
| **Vé**: HMAC cho khách mở trang bằng thẻ / QR (`entryKey` `tag:…`); không cấp cho link thường, xem trước | `lib/events/ticket.ts` (mới) |
| Dựng khúc B từ tài liệu trang (màu, phông, nút của template) | `lib/events/section.ts` (mới), `components/canvas/event.tsx` (mới) |
| Chèn vào trang khách qua `afterFirst`; `SectionView` được `export`; đếm lượt bấm `event_tapped` `{ event, item }` | `components/published-page.tsx`, `components/canvas/render.tsx` (1 chữ `export`), `components/canvas/live.tsx` (`EventTaps`), `server/page-events.ts`, `lib/client/page-events.ts` |
| Bảng `shop_events` — thêm cuối `db/schema.sql` | `db/schema.sql` |
| Đọc sự kiện của quán khi vẽ trang (không thuộc bản phát hành → mở / đóng có hiệu lực ngay) | `lib/events/shop-events.ts` (mới), `lib/publishing/repository.ts` |
| `/gov` → bảng shop: cột **Sự kiện**, nút Mở / Đóng (ghi `admin_audit`) | `components/admin-shops.tsx`, `app/gov/api/shops/events/route.ts` (mới), `lib/admin/provisioning.ts` |
| Library → Sự kiện của chủ quán: đổi câu "Bấm Add…" thành "admin mở, khối tự hiện, bạn không phải làm gì" | `components/qs/tabs/library.tsx` |
| Test: chữ qua dây bẫy, link, vé, chỉ thẻ mới có vé, **khúc B trên cả 10 template** (tương phản, nằm trong khúc, không có gì của Google) — 7 ca; `shop_events`, `/gov`, **database chưa có bảng vẫn chạy** — 4 ca | `tests/contracts/events.spec.ts`, `repository-tests/events.spec.ts` (mới) |

**⚠ Database production (Neon) vừa dựng từ `db/schema.sql` bản `22b44b1`, chưa có bảng `shop_events`.**
Code đã chịu được: thiếu bảng thì mọi quán coi như không có sự kiện, **trang khách vẫn chạy bình thường**; `/gov` bấm Mở thì báo
"Database chưa có bảng shop_events" thay vì lỗi 500. Khi Tài muốn bật thật, chạy một lần trên Neon (cùng cách Tài đã chạy `apply-schema`):

```sql
CREATE TABLE shop_events (
    shop_id uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    event_key text NOT NULL CHECK (event_key ~ '^[a-z][a-z0-9-]{0,31}$'::text),
    opened_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    opened_by uuid REFERENCES platform_admins(id),
    PRIMARY KEY (shop_id, event_key)
);
```

Lưu ý: `scripts/apply-schema.mjs` (bản tự chạy Docker) so mã băm `db/schema.sql`; sau khi gộp, database dựng từ bản cũ sẽ báo
"built from another db/schema.sql" và dừng — việc dựng lại / ghi mã băm mới là Tài quyết như AGENTS.md nói. Vercel không chạy script này.

**Kết quả test trên `78b8fbf` + bản vá (tối 05/10):** tsc sạch; contracts **112/112** (105 + 7); repository **168 xanh + 1 đỏ có sẵn**
(`pages.spec.ts:133` "the page list…" đỏ y hệt trên `78b8fbf` gốc — Tài đã ghi "test chưa viết lại"). Bản vá áp được, chỉ 1 xung đột
dòng import ở `library.tsx` (gộp cả hai). Chạy thật: quán `chuquan` (seed mới) → trang từ mẫu "Hiện đại" → mở sự kiện → thẻ thử
`/t/banthu01` → khúc B → TBQ nhận vé → ô số điện thoại. Harness 4 bộ + client chưa chạy lại (Tài đang viết lại test).

**Kết quả test cũ (05/10, cây `22b44b1` + bản vá):** tsc sạch; eslint các tệp đổi không có lỗi (1 cảnh báo có sẵn ở `render.tsx:121`);
contracts **118/118** (111 + 7); repository **167/167** (163 + 4); client **84/84**; harness public 20/20 (+1 bỏ qua sẵn có), publishing 19/19, owner 13/13, admin 11/11 — mỗi bộ kèm 2 test cổng production xanh. **Đủ 7 bộ xanh.**.
Chạy thật trên máy (`scripts/local.mjs`): `/gov` bấm **Công cụ làm việc: Mở** → `/quan-mau` hiện khúc B ngay dưới khúc đầu, nút **không**
có vé; chạm thẻ thử `/t/banthu01` → nút có vé → TBQ nhận vé → ô số điện thoại; mở lại link đó trên máy khác → TBQ từ chối.
Đã chụp khúc B trên đủ 10 template ở bề ngang 390px.

**Biến môi trường mới bên QS — 1 biến, cần ở Production:** `NFC_EVENT_TBQ_KEY` (≥ 32 ký tự, giống hệt `QS_TICKET_KEY` bên TBQ;
Tiệm tạo bằng `openssl rand -hex 32` và gửi Tài qua kênh riêng). Thiếu biến thì nút vẫn hiện nhưng không mang vé → khách không nhận được gì.
Không bắt buộc cho test / harness.

## 1. Nội dung khối trên trang quán

| Mục | Nội dung | Giới hạn |
|---|---|---|
| Mã sự kiện | `tbq-cong-cu` | `^[a-z][a-z0-9-]{0,31}$` |
| Tiêu đề | Công cụ làm việc | ≤ 40 ký tự |
| Câu ngắn | ChatGPT, Canva, CapCut… bản Pro xịn xò cho bạn chạy deadline ngay tại quán. Ai ngồi quán cũng nhận được, chọn 1 món là xong. | ≤ 160 |
| Nút 1 | Nhận công cụ làm việc miễn phí → `/qs/{shop}` | ≤ 40 |
| Nút 2 | Về chúng tôi → `/ve-chung-toi?shop={shop}` | ≤ 40 |
| Dòng cuối | Do Tiệm Bản Quyền tổ chức · dành cho mọi khách của quán | |
| Địa chỉ gốc | `https://thu.tiembanquyen.site/colap` *(tên miền phụ của tiembanquyen.site, thư mục `/colap`)* — nút = địa chỉ gốc + đường dẫn, vd. `…/colap/qs/{shop}` | chỉ `https://` |
| Bên làm | Tiệm Bản Quyền | |

`{shop}` = slug của **quán** trên QS (chữ thường), không phải slug của từng trang: TBQ gắn quán theo mã này.
Tiếng Anh có sẵn trong `catalog.ts` cho nút đổi ngôn ngữ của trang.

## 2. Hình ảnh

- Khối **không có màu riêng**: 2 nút dùng đúng kiểu nút link của template quán đang dùng, nên mỗi quán một vẻ.
  Một vạch mảnh tách khối khỏi các nút của quán ở trên. Giao diện chi tiết cho từng quán làm sau.
- **Logo / banner** (nếu Tài muốn thêm vào khối sau này): PNG nền trong 512×512; banner 4:5 hoặc 1:1, ≥ 1080 px.
  Không chèn chữ nào về đánh giá/Google/sao (QS không đọc được chữ trong ảnh — `google-policy.md` mục 3b).

## 3. Thông tin cho khách

- **Điều kiện:** dành cho **mọi khách** của quán. Mỗi số điện thoại nhận 1 công cụ/ngày;
  khách chạm thẻ / quét mã QR trên bàn rồi bấm nút trong vòng 30 phút. Không liên quan gì tới việc đánh giá.
- **Chính sách riêng tư:** `https://thu.tiembanquyen.site/colap/privacy`
- **Hỗ trợ:** Zalo 0988 428 496

## 4. Luật Google — áp bên TBQ để khối trên trang quán không làm quán bị phạt

| Luật (`docs/google-policy.md` bên QS) | Bên TBQ / bản vá |
|---|---|
| Dành cho mọi khách, không phụ thuộc việc bấm/đánh giá Google | Khối hiện cho mọi khách; TBQ không hỏi và không biết khách có đánh giá hay không |
| Chữ không nối quà với đánh giá (luật 4) | Chữ khối không nhắc tới đánh giá; TBQ chạy **cùng "dây bẫy" `freeTextProblem` của QS** cho chữ khối và mọi chữ admin TBQ sửa được; có test |
| Không đặt cạnh nút Google kiểu gợi ý trao đổi (luật 8) | Khối chỉ ở vùng dưới, không bao giờ là khối đầu tiên ngay dưới lời mời Google; có vạch tách và dòng "dành cho mọi khách" |
| Không hỏi khách đã đánh giá chưa, không đòi chụp màn hình | Đúng |
| Link `https://`, không rút gọn; mở tab mới `rel="noopener noreferrer"` | Đúng; TBQ không cần Referer |
| Không chuyển dữ liệu khách sang bên kia | QS chỉ gắn mã quán + vé vào link. Vé không chứa gì về khách (chỉ mã quán, giờ, số ngẫu nhiên). Khách tự nhập số trên trang TBQ, có ô đồng ý riêng và trang `/privacy` |
| Vé không phụ thuộc Google | Mọi khách mở trang bằng thẻ / QR đều có vé, dù làm gì với nút Google |

## 5. Điều Tài nên biết (đọc repo QS)

**5a. Mã quán và vé trên link** — `/qs/{shop}?t=<vé>`. Vé = `1.<giây phát>.<số ngẫu nhiên>.<chữ ký>`,
chữ ký = HMAC-SHA256(`NFC_EVENT_TBQ_KEY`, `"tbq-ticket|1|<mã quán chữ thường>|<giây phát>|<số ngẫu nhiên>"`), base64url, 32 ký tự.
TBQ nhận vé khi: đúng chữ ký, đúng quán, phát chưa quá 30 phút, và chưa được máy khác dùng (mỗi vé 1 máy). Vé là cách **duy nhất**
TBQ biết khách đang ở quán, nên chỉ cấp khi khách vào bằng thẻ / QR (link trang thường lan trên mạng, không phải ở quán).
Kẽ hở đã biết: ai chụp mã QR trên bàn mang về nhà quét vẫn có vé → TBQ chặn tiếp bằng OTP / SĐT, 1 công cụ / ngày, suất / quán / ngày.
Vé và mã quán không phải dữ liệu cá nhân.

**Về vị trí khối (luật 8):** khúc B là một khúc riêng **sau khúc đầu** (khúc đầu chứa nút Google và luôn cao hết màn hình đầu),
có vạch tách và dòng "dành cho mọi khách của quán"; với trang nhiều khúc, các khúc sau của quán nằm dưới khúc B. Tài xem có muốn
đặt khúc B xuống cuối trang (sau mọi khúc của quán) không — chỉ cần đổi chỗ chèn trong `render.tsx`.

**5b. (Lỗi nhỏ) Dây bẫy chữ để lọt chính câu ví dụ trong HANDOFF mục 2.3.**
`freeTextProblem('Đánh giá 5 sao để nhận tài khoản')` vẫn trả `null` trên commit `22b44b1`, vì danh sách `REWARD` chưa có
"tài khoản". TBQ đã thêm `'tai khoan', 'account', 'dung thu', 'trial'`. Đề nghị QS thêm giống vậy.
Ghi chú thêm: câu "Sao chép mã miễn phí" bị chặn nhầm (từ "sao") — chấp nhận được, chỉ cần biết.

**5c. `event_tapped`** — bản vá ghi `detail: { event: 'tbq-cong-cu', item: 'nhan' | 've-chung-toi' }`, đúng bộ kiểm
`detail()` của `server/page-events.ts` (khoá ngắn, không dùng uuid).

**5d. Số liệu đối chiếu.** QS đếm lượt bấm khối (`event_tapped`) theo quán; TBQ đếm lượt vào, lượt dùng, khách quay lại,
lượt bấm "Mua qua Zalo" theo quán (trang Thống kê quán của TBQ — nội bộ, chỉ số đếm). Hai bên đối chiếu được nếu cần.

## 6. Thêm một quán — việc của mỗi bên

1. **QS (Tài):** `/gov` → dòng của quán → cột Sự kiện → **Công cụ làm việc: Mở**. Chủ quán không phải làm gì.
2. **TBQ:** `/admin` → Quán → **Thêm quán** với **Mã quán trên QS** (phần cuối link trang quán, vd. `k3x9q`) và số suất / ngày.
3. **Thử:** điện thoại chạm thẻ (hoặc quét QR) trên bàn → trang quán → bấm **Nhận công cụ làm việc miễn phí** → phải thấy ô số điện thoại.
   Mở link trang quán thường (không qua thẻ) → bấm nút → phải thấy "Nhận tại quán nhé" (không có ô số điện thoại).

## 7. Khi đổi hoặc dừng

- Đổi chữ khối: đổi **cùng lúc** hai bên (TBQ: `src/qs-event.js`; QS: `lib/events/catalog.ts`).
- Dừng ở một quán: Tài → `/gov` → **Sự kiện: Đóng** (khối biến mất khỏi mọi trang của quán ngay). TBQ → trang quán → **Tạm dừng**
  (khách vào bằng link cũ thấy "Quán đang tạm dừng chương trình").
- Đổi tên miền / thư mục TBQ: đổi `origin` trong `catalog.ts` (một chỗ, hiện là `https://thu.tiembanquyen.site/colap`), mọi quán nhận link mới.
  `NFC_EVENT_TBQ_ORIGIN` cũng nhận kèm thư mục (vd. `https://thu.tiembanquyen.site/colap`); có `?` / `#` hoặc ký tự lạ thì bỏ qua, dùng mặc định.

## 8. Kỹ thuật

- TBQ chỉ cần một `GET` tới link; không cần header hay cookie gì từ QS. QS chỉ gọi TBQ nếu muốn hiện mã phiếu trên trang quán (mục 9, không bắt buộc).
- TBQ ghi lượt vào rồi chuyển khách sang link sạch `/qs/<mã quán>` (bỏ vé khỏi thanh địa chỉ, khỏi chép gửi người khác).
- Máy xem trước link (Zalo/Facebook/Telegram) không bị tính lượt và không "giữ" vé của khách; trình duyệt **trong** app Zalo (khách quét QR bằng Zalo) vẫn được tính.
- Đồng hồ hai máy chủ lệch tối đa 2 phút vẫn nhận vé.
- TBQ chạy bằng Node + Caddy trên máy chủ riêng (không Docker). Caddy ghi đè `X-Real-IP`; TBQ chỉ dùng IP cho giới hạn chống spam OTP.
- Máy thử của QS: `NFC_EVENT_TBQ_ORIGIN=http://localhost:3917` (chỉ nhận `http://localhost` / `127.0.0.1` khi `NFC_ENV=local`),
  `NFC_EVENT_TBQ_KEY=dev-qs-ticket-key-change-me-0123456789` (khoá chạy thử mặc định của TBQ khi không phải production).

> **Địa chỉ thật hiện tại (07/10/2026): `https://thu.tiembanquyen.site/colap`** (TBQ chạy trên máy Mac của Tiệm qua Cloudflare Tunnel).
> `origin` trong bản vá khúc B và `NFC_EVENT_TBQ_ORIGIN` phải đổi sang địa chỉ này.

## 9. Mã phiếu (TBQ bản 1.2, 07/10/2026)

Khách dùng ChatGPT / Claude phải có **mã phiếu** mới lấy được mã đăng nhập. Có 2 cách nối với QS — cách (a) không cần Tài làm gì:

**(a) Tự động, không đổi gì bên QS.** Khách mở trang quán bằng thẻ / mã QR → bấm "Nhận công cụ" → TBQ nhận vé `?t=` như hiện nay
và **tự cấp 1 phiếu gắn với máy khách** (tối đa 2 phiếu / máy / ngày, hết hạn sau 60 phút). Khách bấm "Lấy mã" không phải gõ gì.

**(b) Tuỳ chọn — QS hiện mã phiếu ngay trên trang quán.** Chỉ làm khi khách vào bằng thẻ / mã QR (đúng lúc QS gắn vé `?t=`).
Gọi từ **máy chủ** QS (không gọi từ trình duyệt — khoá không được lộ ra trang):

```
POST {TBQ_ORIGIN}/hooks/qs/phieu
Content-Type: application/json
X-TBQ-Signature: sha256=<hex HMAC-SHA256(NFC_EVENT_TBQ_KEY, nguyên body)>

{"shop":"<mã quán QS>","ts":<giây unix>,"nonce":"<8–64 ký tự A-Za-z0-9_->"}
```

| Kết quả | Ý nghĩa |
|---|---|
| `200 {ok:true, code:"ABCD-EFGH", expiresAt:<ms>, tools:["chatgpt","claude"], text:"…"}` | Hiện `code` trong khối "Công cụ làm việc" kèm `text` |
| `401` | Sai chữ ký, `ts` lệch quá 2 phút, hoặc `nonce` đã dùng (mỗi lần gọi 1 nonce mới) |
| `404 {code:"shop_unknown"}` · `409 {code:"cafe_paused"}` | Quán chưa có / đang dừng bên TBQ → không hiện gì |
| `429 {code:"cafe_limit"}` | Quán hết phiếu hôm nay (mặc định 60 / quán / ngày) → không hiện gì |

- Khoá = cùng khoá vé (`NFC_EVENT_TBQ_KEY` bên QS = `QS_TICKET_KEY` bên TBQ). Không cần khoá mới.
- Lỗi mạng / quá 3 giây → bỏ qua, trang quán vẫn hiện bình thường (phiếu tự động ở cách (a) vẫn chạy).
- Không lưu mã vào cache dùng chung giữa các khách: mỗi lượt mở trang bằng thẻ / QR gọi 1 lần.
- Chữ hiện cho khách đi qua luật Google như mục 4: chỉ ghi "Mã phiếu lấy mã đăng nhập", không nối với đánh giá.

Mẫu TypeScript cho máy chủ QS (Node 18+, không thư viện ngoài):

```ts
import { createHmac, randomBytes } from 'node:crypto';

export async function fetchTbqVoucher(origin: string, key: string, shop: string) {
  const body = JSON.stringify({ shop, ts: Math.floor(Date.now() / 1000), nonce: randomBytes(12).toString('base64url') });
  const sig = createHmac('sha256', key).update(body).digest('hex');
  try {
    const r = await fetch(`${origin}/hooks/qs/phieu`, {
      method: 'POST', body, signal: AbortSignal.timeout(3000),
      headers: { 'content-type': 'application/json', 'x-tbq-signature': `sha256=${sig}` },
    });
    if (!r.ok) return null;
    const j = await r.json();
    return j.ok ? { code: String(j.code), text: String(j.text), expiresAt: Number(j.expiresAt) } : null;
  } catch { return null; }
}
```

Thử nhanh khi chạy TBQ ở máy (khoá chạy thử mặc định `dev-qs-ticket-key-change-me-0123456789`, quán có mã QS `chuquan`):
`node scripts/thu-api-qs.js chuquan` (in ra mã phiếu nếu nối đúng).
