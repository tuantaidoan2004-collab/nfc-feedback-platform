# Thiết kế: mỗi quán 1 thẻ NFC cố định ở quầy POS (08/10/2026)

Chủ chọn: mỗi quán chưa dùng QS chỉ có **1 thẻ**, dán cố định ở quầy POS (không dán từng bàn).
Đã làm: `cardDailyClaims` 6 → 20 trên máy thật (08/10).

## 1. Nhìn từ khách (UX) — đường đi thật

```
Vào quán → gọi món ở quầy → THẤY standee "Chạm điện thoại" → chạm → trang Cọ Láp mở
→ nhập email → mã về hộp thư → chọn công cụ → về bàn ngồi làm việc
→ (ChatGPT / Claude) 40 phút sau cần mã đăng nhập → phải ra quầy chạm lại  ← điểm vấp
```

| Điểm vấp | Vì sao | Đề xuất |
|---|---|---|
| Lấy mã sau 30 phút phải ra quầy | `entryTtlMin` = 30 (thiết kế cho thẻ ở bàn) | Nâng `entryTtlMin` lên **120** cho cả hệ thống (ngồi quán làm việc thường 1–3 giờ). Trang khách ghi rõ "Lấy mã tới HH:MM — sau giờ đó chạm lại thẻ ở quầy" |
| Khách không biết phải quay lại quầy | Câu báo hiện tại nói chung chung "chạm lại thẻ" | Câu báo riêng cho quán 1 thẻ: "Chạm lại thẻ ở **quầy thu ngân** để lấy mã" (backend biết quán có 1 thẻ nhãn POS) |
| Đang xếp hàng, không muốn đứng nhập email ở quầy | Nhập email + chờ thư mất 1–2 phút | Chạm ở quầy chỉ cần MỞ trang; vé vào quán giữ 120 phút → khách về bàn rồi mới nhập email. Không cần sửa luồng, chỉ cần TTL dài hơn + câu "Về bàn rồi làm tiếp cũng được" |
| Máy Android không bật NFC / iPhone đời cũ | NFC tắt sẵn trên nhiều Android | Dòng nhỏ trên standee: "Không chạm được? Bật NFC trong Cài đặt". **Không** in QR (QR chụp mang về nhà dùng được → mất chống gian lận) |

## 2. Nhìn từ thiết kế nội thất — đặt thẻ ở quầy

- **Cách máy cà thẻ / POS ngân hàng ≥ 30 cm.** Máy cà thẻ cũng phát NFC: khách đặt điện thoại nhầm chỗ → mở ví / thanh toán, hoặc thẻ Tiệm làm máy cà thẻ báo lỗi.
- **Không dán thẳng lên mặt kim loại / inox** (quầy pha chế, viền máy) — chip NFC thường "chết" trên kim loại. Dùng chip **on-metal** hoặc standee mica/gỗ đứng riêng.
- **Standee đứng nghiêng ~60°, cao ngang tay**, mặt hướng về phía khách đứng gọi món, chip nằm ở **1/3 trên** của standee (iPhone đọc NFC ở cạnh trên máy).
- Khổ A6 (105 × 148 mm) đủ thấy từ 1–1,5 m mà không chiếm chỗ quầy. Vật liệu theo tông quán (gỗ / mica khói), chữ tông TBQ (giấy ấm, mực đậm, vàng đồng) — không lấn logo quán.
- Biểu tượng chạm (điện thoại + sóng) **in đúng chỗ có chip**, to ≥ 25 mm.

## 3. Nhìn từ phát triển thị trường — câu chữ standee

Quầy là chỗ **100% khách đi qua** → điểm chạm tốt nhất trong quán. Câu chữ (đúng `docs/google-policy.md` của QS: không nhắc đánh giá / Google, không "tặng nếu…"):

> **Ngồi quán làm việc? Dùng ChatGPT · Claude · Canva Pro miễn phí**
> Chạm điện thoại vào đây ▸
> *Tổ chức bởi Tiệm Bản Quyền*

- Tên công cụ cụ thể bán tốt hơn "công cụ A.I bản quyền".
- Không ghi số ngày / số suất trên standee (đổi theo kho) — trang Cọ Láp nói.
- Đo hiệu quả bằng số đã có: chạm / ngày (Theo dõi), nhận / chạm, khách nhắn Zalo sau khi hết hạn.

## 4. Nhìn từ dev — backend

| Việc | Thay đổi | Cỡ |
|---|---|---|
| A. Giữ vé vào quán lâu hơn | `entryTtlMin` 30 → 120 (Cài đặt, không sửa code) | nhỏ |
| B. Một quán một thẻ: hạn mức thẻ không thấp hơn suất quán | `quota.js`: hạn mức thẻ = max(`cardDailyClaims`, suất/ngày của quán) → không phải nhớ chỉnh 2 chỗ | nhỏ + test |
| C. Câu "chạm lại ở quầy thu ngân" | Thẻ nhãn bắt đầu bằng "POS" → câu báo / trang khách nói "quầy thu ngân" thay cho "thẻ trên bàn" | nhỏ |
| D. Tạo quán chưa có QS → tự tạo 1 thẻ "POS" | Form Thêm quán: bỏ trống mã QS → tạo luôn thẻ POS, hiện link ghi chip ngay | nhỏ |
| E. Trang quán trong quản trị: 1 ô "Thẻ ở quầy" thay bảng nhiều thẻ | Giữ bảng cũ cho quán có > 1 thẻ | vừa |
| F. Ngưỡng báo động thẻ | `cardTapsPerHourAlert` 30 / `Lock` 80 vẫn hợp (1 quầy hiếm khi 30 máy khác nhau / giờ) — giữ | — |

## 5. Phân tích rủi ro

- **Link bị chép** (chụp màn hình link, gửi nhóm chat): chặn bằng **UID + counter mirror** khi ghi chip — bắt buộc với thẻ ở quầy vì ai cũng thấy.
- **Nhân viên quán chạm hộ nhiều máy**: đã có giới hạn 1 công cụ / email / ngày, 1 email / máy, điểm rủi ro theo máy.
- **Vé 120 phút**: khách rời quán vẫn lấy mã thêm ≤ 2 giờ — chấp nhận được (mã chỉ mở tài khoản họ đã nhận, `codeMaxRequests` = 4).

## Thứ tự đề xuất
A (đổi cài đặt) → B + C (sửa nhỏ, có test) → D → E. In standee theo mục 2–3 song song.
