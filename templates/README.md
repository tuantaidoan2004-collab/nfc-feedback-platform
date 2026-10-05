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

Hai id có nghĩa riêng: chữ có id `ten-quan` nhận tên quán, chữ có id `chu-dau` nhận chữ cái đầu của tên quán (ảnh đại diện
kiểu chữ) ngay lúc trang được tạo.

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
