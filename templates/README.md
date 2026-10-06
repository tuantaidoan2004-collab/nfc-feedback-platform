# Template

Mỗi template của trang khách là **một thư mục ở đây, một tệp `template.json`** (đợt ②, 05/10/2026: template canvas, dựng
lại từ ảnh Tài gửi). Không chỗ nào khác trong mã liệt kê template. Làm template không cần đụng TypeScript.

Trước khi làm, đọc `rieng/kich-ban.md` mục 8–9 (chỉ có trên máy Tài) và `docs/google-policy.md`. Luật Google thắng mọi thứ.

## `template.json`

| Trường | Ý nghĩa |
|---|---|
| `key` | Trùng tên thư mục. Chữ thường, số, gạch nối. **Không bao giờ đổi**: trang tạo từ template ghi lại nó. Không mang tên thương hiệu. |
| `number` | Số thứ tự trong Library. |
| `name` | Tên ngắn chủ quán thấy. |
| `groups` | Nhóm trong Library (kịch bản mục 8): "Only Poster", "Only Background", "Interactive cards", "Simple", "Không gian thực", "Tối giản", "Trong suốt", "Thuỷ tinh"… hoặc nhóm mới. |
| `about` | Một câu: template này chạy thế nào. |
| `doc` | Tài liệu trang — đúng kiểu `PageDoc` trong `lib/canvas/doc.ts`: các **khúc** xếp dọc, mỗi khúc khổ điện thoại rộng 390 đơn vị; phần tử đặt tự do (x, y, w, h, xoay), riêng `stack` tự xếp con theo chiều dọc. |

Trang mới tạo từ template là **bản sao** của `doc`: sửa trang không đổi template, sửa template không đổi trang đã có.

## Chỗ của quán (`slot`) — bắt buộc cho mọi thứ thuộc về quán

Mẫu chỉ là bố cục; tên, link, @tên, giờ mở cửa, wifi là **của từng quán** (Tài 06/10). Phần tử nào chứa thứ của quán thì ghi
`"slot": "<khoá>"`; lúc trang hiện ra, hệ thống điền **thông tin quán** vào đó (`lib/canvas/slots.ts`), quán chưa có thì
**phần tử ẩn hẳn**. Chữ và link mẫu trong template chỉ để xem thử; trang lưu giữ nguyên chúng, không bao giờ ghi đè.

| `slot` | Đặt trên | Nhận |
|---|---|---|
| `name` · `initial` | chữ | tên quán (giữ chữ hoa nếu mẫu viết hoa, tự thu nhỏ cho vừa khung) · chữ cái đầu |
| `zalo` `facebook` `instagram` `tiktok` `youtube` `website` `menu` `booking` `phone` `maps` | nút, biểu tượng, ảnh, hình, chữ có link | link của quán; nhãn nút là địa chỉ mẫu (vd `tenquan.vn`) thì thành tên miền của quán |
| `handle` | chữ, hoặc nút có link | `@tên` của quán; nút dẫn tới trang mạng xã hội đầu tiên quán có |
| `hours` · `address` | chữ | giờ mở cửa · địa chỉ |
| `wifi` | nút wifi | tên và mật khẩu wifi của quán |

Thẻ trong bộ bài (mẫu Party) cũng nhận `slot` link. **Mọi link mẫu** (trang chủ trần của Zalo, Facebook, TikTok…, hoặc link về
Quite Sensational) phải nằm trong một `slot`: lõi phát hành từ chối trang còn link mẫu ở chỗ khách bấm được, và test
`tests/contracts/templates.spec.ts` kiểm điều đó cho từng mẫu (quán trống thông tin: không còn link mẫu; quán đủ thông tin: mọi
chỗ đều được điền). Chữ chủ đề của mẫu (vd "HAIR SALON", danh sách dịch vụ nha khoa) không phải chỗ của quán; admin sửa thẳng
khi quán muốn khác.

## Núm (`knobs`) — mọi mẫu mới

Những gì khách hay muốn đổi, để Bàn dựng đổi mà không vẽ lại (kịch bản 9b, `lib/canvas/knobs.ts`, sổ tay
`docs/khach-chinh-mau.md`):

| Trường | Ý nghĩa |
|---|---|
| `palettes` | 3–5 bảng màu có tên, cùng số màu (`#rrggbb`). Bảng đầu là màu tài liệu đang dùng; đổi bảng là thay từng màu theo vị trí ở mọi chỗ (giữ độ trong `#rrggbbaa`). Vì vậy mọi màu đổi theo bảng phải viết đúng bằng một màu của bảng đầu; màu không đổi (trắng, máy bay giấy) thì dùng màu ngoài bảng. |
| `photos` | `[{ id, name }]`: các phần tử ảnh nhận ảnh của quán. |
| `texts` | `[{ id, name }]`: chữ của quán ngoài tên (câu chào). |

Khách xem mọi bảng màu ở `/templates/<khoá>/mau?ten=<Tên quán>`, một mẫu với bảng thứ n ở `/templates/<khoá>?mau=n`.

## Luật mà mọi template phải qua

- **Nút Google** (`"t": "google"`): nhiều nhất một; nằm trọn trong khúc đầu, **trên vạch 560 đơn vị** (màn hình đầu của
  iPhone SE); không ô góp ý nào đứng trên nó. Chữ và link của nút là của nền tảng (link đánh giá của quán từ Place ID):
  template chỉ chọn kiểu (`look`), màu, bóng. Nút luôn nổi trên cùng, không gì che được.
- **Không chữ nào đổi quà lấy đánh giá**, không nhắc sao, không gợi nội dung đánh giá (bẫy chữ trong `lib/publishing/policy.ts`
  đọc mọi chữ, cả tiếng Anh).
- **Ảnh**: `art:<khoá>` (tranh vector vẽ sẵn, `components/canvas/art.tsx`), `/tpl/<tệp>` (tệp đi kèm app), hoặc ảnh quán
  tải lên (phải qua duyệt mới phát hành được). Không ảnh kho có bản quyền, không logo thật.
- Màu, phông, biểu tượng, hình, kiểu nút, hiệu ứng chỉ chọn từ danh sách trong `lib/canvas/doc.ts`; không CSS, không HTML.

## Sau mỗi lần thêm hay sửa

```bash
node scripts/templates.mjs
node node_modules/@playwright/test/cli.js test --config=playwright.contracts.config.ts tests/contracts/templates.spec.ts
```

Lệnh đầu sinh lại `lib/canvas/templates.generated.ts` (đừng sửa tay). Lệnh sau kiểm từng tài liệu và luật Google. Xem thử
trên máy: `node scripts/local.mjs` rồi mở `http://127.0.0.1:3321/templates/<khoá>`.
