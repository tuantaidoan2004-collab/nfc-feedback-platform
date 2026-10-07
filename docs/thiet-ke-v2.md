# Thiết kế lại trang khách — v2 "Vé vào ca"

> ĐÃ CODE (07/10/2026 đêm, chưa đóng gói). Chủ chọn: "tự làm" → lấy các đề xuất ở §9; rồi đổi phong cách thành **Bamos × TBQ × Apple, chỉ cho điện thoại** (xem §5b).
> Mockup cũ (nền sáng, cam): `docs/thiet-ke-v2-mockup.html` — bố cục vẫn đúng, màu đã thay bằng §5b.
> Phạm vi: chỉ phía khách (trang quán, trang slot, trang chủ, các trạng thái). Máy chủ, API, luật chia suất, trang Quản trị — **giữ nguyên**.

---

## 1. Bài toán (1 câu)

Khách ngồi quán, cầm điện thoại, vừa chạm thẻ — **họ đã muốn rồi**. Việc của giao diện: đưa họ tới tài khoản Pro **nhanh nhất, ít nghĩ nhất**,
rồi để lại ấn tượng tốt đủ để lần sau họ nhắn Zalo mua.

## 2. Vì sao đập đi

| Hiện tại | Vấn đề | Nguyên lý bị vi phạm |
|---|---|---|
| Khối đầu icon bay chiếm gần hết màn điện thoại | Nút chính bị đẩy xuống dưới, phải cuộn | Fitts, "nội dung chính trên màn đầu" |
| Các bước tự chạy như story | Khách đọc chưa xong đã chuyển; không nhìn được cả lộ trình | Nielsen #3 (người dùng làm chủ), Nielsen #6 (nhận ra hơn nhớ) |
| Bắt nhập email **trước** khi thấy được nhận gì | Hỏi trước, cho sau → rơi khách ở bước khó nhất | Có qua có lại (Cialdini), Fogg B=MAP |
| Viền đen + bóng cứng ở **mọi** khối | Mắt không biết cái gì bấm được | Tín hiệu bấm (signifier), Von Restorff |
| "Miễn phí", "Về chúng tôi" lặp 2 lần; 5–6 màu nhấn | Nhiễu, tốn sức đọc | Tải nhận thức (Sweller), quy tắc 60-30-10 |

## 3. Nguyên lý dẫn đường (mỗi cái → 1 quyết định cụ thể)

| Lý thuyết | Quyết định trong v2 |
|---|---|
| **Fogg B = M·A·P** — hành vi xảy ra khi đủ động lực, đủ dễ, có lời nhắc | Động lực đã cao (miễn phí, đang ngồi quán) → dồn sức vào **Dễ**: 3 bước, 1 nút chính mỗi màn |
| **Hick** — càng nhiều lựa chọn càng chậm quyết | Tối đa 6 ô; món hết suất gom thành 1 dòng chip mờ, không chiếm chỗ |
| **Fitts + vùng ngón cái (Hoober)** | Nút chính dính đáy màn, cao 56px, rộng hết; link phụ ở trên |
| **Có qua có lại + cam kết nhất quán** | Chọn món **trước**, email **sau** — khách đã "chọn của mình" thì ít bỏ ngang |
| **Hiệu ứng đích gần (goal-gradient) + tiến độ được tặng** | Thanh "Bước 1/3" — bước "Ở quán ✓" đã tự xong khi chạm thẻ |
| **Zeigarnik** — việc dở dang thì muốn làm cho xong | Hướng dẫn đăng nhập là checklist, tick dần, nhớ chỗ đang làm |
| **Đỉnh – kết (Kahneman)** — người ta nhớ lúc vui nhất và lúc kết thúc | Đỉnh: màn "Vé của bạn" có 1 nhịp ăn mừng. Kết: trang hết giờ ấm áp, cảm ơn, gợi Zalo nhẹ — **không** trách |
| **Von Restorff** — cái khác biệt được nhớ | Chỉ 1 màu cam cho hành động chính. Không gì khác được cam |
| **Jakob** — người dùng quen cách web khác làm | Ô mã 6 số kiểu ngân hàng (tự điền từ thư, tự gửi khi đủ 6 số), bảng trượt từ đáy kiểu app |
| **Chia cụm (Miller)** | Email / Mật khẩu / Mã nằm trong 1 "vé", mỗi dòng 1 nút Chép |
| **Hé dần (progressive disclosure)** | Luật chơi gập lại "3 điều cần biết ▾"; chỉ mở khi khách muốn |
| **Ngưỡng Doherty (<400ms)** | Bấm là có phản hồi ngay (nút đổi trạng thái, rung nhẹ trên Android) |
| **Thẩm mỹ – dễ dùng** | Gọn, sạch, có 1–2 điểm vui (logo màu, nhịp ăn mừng) — vui nằm ở chi tiết, không nằm ở hiệu ứng khắp nơi |

**Không dùng thủ thuật tối (dark pattern):** không đếm ngược giả, không "sắp hết" giả, không ô đồng ý tích sẵn,
không câu bắt lỗi kiểu "Thôi, tôi không cần đồ xịn". Số suất còn lại chỉ hiện **nếu là số thật**.
Không nhắc gì tới đánh giá Google (luật QS).

## 4. Giọng nói (voice & tone)

- **Ngắn gọn, chuyên nghiệp, trẻ, vui.** Xưng "Tiệm" – gọi "bạn".
- Câu ≤ 12 chữ. Nút bắt đầu bằng động từ + tên món: "Nhận ChatGPT Plus", "Chép", "Lấy mã".
- Vui ở lúc thành công và lúc trống; nghiêm túc ở luật, lỗi, dữ liệu cá nhân.
- Tối đa 1 emoji mỗi màn, không emoji trong nút.

| Tránh | Dùng |
|---|---|
| "Vui lòng nhập địa chỉ email của bạn để tiếp tục" | "Email của bạn?" |
| "Đã xảy ra lỗi" | "Mã chưa đúng. Thử lại nhé." |
| "Phiên của bạn đã hết hạn" | "Hết ca rồi! Cảm ơn bạn đã ghé." |

## 5. Hệ thiết kế mới

**Màu (60 · 30 · 10)**

| Tên | Mã | Dùng |
|---|---|---|
| Giấy | `#F6F4EF` | nền trang (60%) |
| Trắng | `#FFFFFF` | thẻ, bảng (30%) |
| Mực | `#16151A` | chữ, vé tối |
| Mực nhạt | `#6B6875` | chữ phụ (đạt AA trên giấy) |
| Viền | `#E6E2D9` | đường kẻ |
| **Cam Tiệm** | `#FF5B2E` | **chỉ** nút chính + món đang chọn (10%) |
| Nắng | `#FFD23F` | nhãn "Miễn phí", điểm nhấn vui |
| Bạc hà | `#12B886` | xong / thành công |
| Đỏ | `#E5484D` | lỗi |
| Màu thương hiệu từng món | nhạt 10% | nền logo trong ô (ChatGPT xanh, Claude cam đất, Canva tím…) |

**Chữ:** phông hệ thống (iPhone: SF Pro; Android: Roboto) — tiếng Việt chuẩn dấu, không tải ngoài.
Cỡ: 13 · 15 · 17 · 22 · 28 · 34. Tiêu đề đậm 800, dãn chữ −2%. Số đếm ngược dùng số đều nhau (tabular).

**Khối:** lưới 8px · bo góc 12 (ô nhập, nút) / 20 (thẻ) / tròn hẳn (chip) · 2 mức bóng mềm.
Quy ước: **cái gì bấm được mới có bóng/viền đậm** — thẻ thông tin thì phẳng.

**Chuyển động:** 150–250ms, mượt ra. Chỉ 2 chỗ có "nảy": chọn món và lúc vé hiện ra. Máy bật giảm chuyển động → đứng yên.

**Truy cập:** chữ đạt WCAG AA, vùng bấm ≥ 44px, chạy được không cần JS (mọi bước hiện hết), đọc màn hình được.

## 5b. Phong cách đã chốt: Bamos × TBQ × Apple (thay màu ở §5)

- **Chỉ thiết kế cho điện thoại** (khách chạm NFC bằng điện thoại). Máy tính chỉ thấy 1 cột giữa 480px.
- **Nền đêm của trang quán Bamos** (đen ô-liu `#191914` + bụi vàng) → khách bấm từ trang quán sang thấy liền mạch.
- **Nút viên thuốc màu kem `#f0ebe0`** giống nút "Nhận công cụ làm việc miễn phí" trên khối QS — đúng cái khách vừa bấm (Jakob).
- **Kiểu Apple:** tiêu đề to đậm căn giữa, câu ngắn, nhiều khoảng thở, 1 nút chính + nút viền.
- **Vàng đồng TBQ `#d4b06a`** chỉ làm điểm nhấn: món đang chọn, vòng thời gian, nhãn Miễn phí, bước đang làm.
- **Chọn món = hàng danh sách** (logo · tên · làm gì · thời hạn · ô tích), giống hàng Instagram/Facebook trên trang quán.
- **Vé = giấy kem nghiêng nhẹ** nổi trên nền tối.
- CSS: `src/public/ui.css` (riêng khách). `style.css` để nguyên cho trang Quản trị.

## 5c. Logo + thẻ Tiệm + chuyển động (đã code)

- **Logo thẻ treo** (viền vàng đồng, chữ T có chân) vẽ lại vector: `TBQ_TAG` trong `src/views/logos.js`, favicon `src/public/logo.svg`.
  Đầu trang: logo + chữ "TBQ Space / TIỆM BẢN QUYỀN" (chữ có chân, như web chính).
- **Thẻ Tiệm** (`tiemCard()` trong public.js) thay nút "Tiệm Bản Quyền là ai?": câu chữ ký của web, trích bảng giá (`PRICE_PEEK` — **giá đổi ở web thì sửa ở đây**),
  nút vàng "Xem bảng giá" + "Nhắn Zalo". Có ở trang chủ, trang chưa ở quán, cuối trang vé. Lý do: cho thấy giá trị thay vì hỏi (tò mò + mỏ neo giá).
- **Chuyển động có mục đích** (nguồn: Apple HIG Motion; NN/g "The Role of Animation and Motion in UX"; Chrome "Cross-document view transitions"):
  chuyển trang mượt (`@view-transition`), khối hiện dần khi cuộn tới, tiêu đề trồi lên từng chữ, bụi vàng trôi chậm, logo lơ lửng,
  ánh sáng quét qua nút chính (gợi chỗ bấm), viền vàng chạy quanh thẻ Tiệm, vé nghiêng 3D + ánh bóng theo ngón tay, chọn món nảy + rung khẽ.
  Máy bật "Giảm chuyển động" → chỉ còn mờ dần (Apple: thay bằng hiệu ứng nhẹ, không bỏ hẳn phản hồi).

## 6. Luồng mới

```
Chạm thẻ ──► [1 Chọn món] ──► [2 Giữ chỗ: email → mã 6 số] ──► [3 Vé của bạn] ──► … ──► [Hết ca]
               (khách cũ: bỏ qua bước 2)                       checklist đăng nhập
```

| Màn | Nội dung chính | Thay đổi so với hiện tại |
|---|---|---|
| **1 · Chọn món** | Tên quán + "Miễn phí hôm nay" · "Hôm nay cần món nào?" · lưới ô món (logo, tên, việc làm được, thời hạn) · chip món hết suất · nút dính đáy "Nhận …" | Bỏ khối icon bay to. Món hiện ngay màn đầu |
| **2 · Giữ chỗ** | Bảng trượt từ đáy: email + ô đồng ý (không tích sẵn) → 6 ô mã, tự gửi khi đủ | Trước: 2 màn story. Giờ: 1 bảng, chọn món vẫn thấy phía sau |
| **3 · Vé của bạn** | Vé tối: tên món, Slot, vòng đếm ngược · checklist 3 bước có nút Chép / Lấy mã · "3 điều cần biết ▾" · "Kẹt? Nhắn Tiệm" | Trước: mỗi bước 1 màn. Giờ: 1 trang, thấy hết lộ trình |
| **Canva chờ mời** | Cùng khung vé, trạng thái "Tiệm đang mời…" → tự đổi khi xong | |
| **Hết ca** | "Hết ca rồi!" · đã dùng bao lâu · thẻ mềm "Dùng tiếp ở nhà? Nhắn Tiệm" · "Mai ghé, nhận lượt mới" | Nơi chuyển đổi bán hàng (đỉnh–kết) |
| **Chưa chạm thẻ** | Hình điện thoại chạm thẻ có sóng · 1 dòng hướng dẫn · QR dự phòng | |
| **Trang chủ /** | 1 câu giới thiệu · dải logo · 3 bước tĩnh · nút Zalo + tiembanquyen.com | Bỏ story tự chạy |

Máy tính (≥960px): 2 cột — trái tên quán + vé/lưới, phải phần bước; nút chính không dính đáy.

## 7. Đo xem có tốt hơn không

- Thời gian từ chạm thẻ → thấy mật khẩu: mục tiêu **< 60 giây** (khách cũ < 15 giây).
- Tỷ lệ rơi ở từng bước: mở trang → chọn món → gửi mã → nhập mã → có vé.
- Tỷ lệ bấm Zalo ở trang Hết ca.
(Ghi sự kiện ở máy chủ, chỉ đếm, không thêm dữ liệu cá nhân.)

## 8. Làm thế nào (sau khi duyệt)

1. Sao lưu `sao-luu/truoc-v2/`.
2. Viết lại mới `src/public/style.css` + phần khách trong `src/views/public.js` + `src/public/app.js`. Bỏ: icon bay, story, tem phiếu.
3. Giữ nguyên: đường dẫn, API, luật suất, tên trường form, CSP (không style/script nội tuyến), chữ đồng ý về dữ liệu (pháp lý).
4. Sửa e2e theo chữ mới → `npm test`, `npm run e2e`, xem trên 375px + 1280px.
5. Đóng gói bản 2.0.0 → **hỏi chủ** trước khi nâng cấp máy thật.

## 9. Cần chủ quyết

1. **Chọn món trước, email sau?** (đề xuất: Có)
2. **Hiện số suất còn lại thật** ("còn 3 suất") trên ô món? (đề xuất: Có, chỉ khi ≤ 5)
3. **Màu chính cam `#FF5B2E`** hay giữ vàng đồng cũ của tiembanquyen.com?
4. **Bỏ hẳn icon bay** (đề xuất: bỏ ở trang quán; trang chủ giữ dải logo nhỏ chạy ngang)?
