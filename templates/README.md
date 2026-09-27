# Gói template

Mỗi template của trang khách là **một thư mục ở đây** (lát M1, 27/09/2026). Không chỗ nào khác trong mã liệt kê template: danh
sách template, tên, giá, các bản, khung trắng, hiệu ứng và tệp CSS đều đọc từ các thư mục này. Làm template không cần đụng
TypeScript.

Trước khi làm, đọc `PRODUCT.md`, `DESIGN.md` (bốn sàn, token) và `docs/thiet-ke-va-template.md`. Luật Google
(`docs/google-policy.md`) thắng mọi thứ: template **không bao giờ** đụng nút Google, lời mời Google hay nút máy bay góp ý.

## Một gói gồm gì

```
templates/<khoá>/
  manifest.json   template này là gì
  v1.css          diện mạo bản 1 (đóng băng khi đã phát hành)
  v2.css          bản 2, nếu có …
```

`manifest.json`:

| Trường | Ý nghĩa |
|---|---|
| `key` | Trùng tên thư mục. Chữ thường, số, gạch nối. **Không bao giờ đổi**: bản phát hành của shop ghim theo nó. Không mang tên thương hiệu. |
| `number` | Số thứ tự; chủ quán thấy "`number` · `name`". |
| `name` | Tên ngắn, tiếng Việt. |
| `pricePerMonth` | Giá mỗi trang mỗi tháng, đồng. `0` = miễn phí, không chiếm suất miễn phí (`docs/goi-va-trang.md` mục 4). |
| `page` | Khung trắng mà trang mới bắt đầu: chỉ `layout`, `background`, `watermark`, và `links: []`. Không bao giờ là nội dung của ai (tên, link, logo, ảnh). |
| `effects` | Hiệu ứng nền tảng template dùng, `{}` nếu không: `leaveTransitionMs` (1–300, lớp sương trước khi sang Google, Google mở cùng tab), `glass: true` (kính khúc xạ), `googleButton: "orb"` (nút hạt ngọc). Hiệu ứng mới cần coder (lát M2). |
| `versions` | Các bản, cũ nhất trước: `version` (1, 2, 3… liền nhau), `date` (YYYY-MM-DD), `notes` (một câu cho chủ quán: bản này khác bản trước ở chỗ nào họ nhìn thấy), `settings` (ô chủ quán được chỉnh, xem `lib/publishing/settings.ts`). |

Bảng ô của bản 1 hôm nay mở đúng những ô mà thiết kế thật sự dùng (P2, 25/09): template 1 vẽ thẻ trôi trên nền của shop
nên nhận mọi kiểu nền và watermark; template 3 tự vẽ cảnh kính từ hai màu nền nên chỉ nhận nền một màu hoặc chuyển màu;
template 2, 4, 5 tự vẽ nền nên chỉ mở nút góp ý; template 6 không mở ô nào. Không template nào mở "bố cục".

## Tệp CSS của một bản

Mọi selector bắt đầu bằng `.guest[data-template="<khoá>"]:where([data-template-version="<bản>"])`. Chỉ dùng token trong
`DESIGN.md` mục 4 và ô mà chính bản đó khai (`--s-<ô>` luôn có giá trị dự phòng, `data-s-<ô>`). Tên `@keyframes` không
trùng template khác.

**Đã phát hành thì đóng băng.** Đổi diện mạo = thêm bản mới (một mục trong `versions` + tệp `v<n>.css` mới); shop đang
chạy không đổi cho tới khi chủ quán tự chọn bản mới. Chỉ sửa lỗi, bảo mật hay luật Google mới được sửa tệp đã phát hành,
và khi đó ghi lại mã băm trong `tests/contracts/skin.spec.ts` cùng commit, nói rõ lý do.

## Sau mỗi lần thêm hay sửa gói

```bash
node scripts/templates.mjs
node node_modules/@playwright/test/cli.js test --config=playwright.contracts.config.ts
```

Lệnh đầu sinh lại `lib/publishing/templates.generated.ts` và `components/guest-styles.ts` (đừng sửa tay hai tệp đó).
Bộ contracts kiểm manifest (`tests/contracts/templates.spec.ts`, lỗi viết bằng lời để sửa được), bốn sàn và độ tương
phản (`skin.spec.ts`), ô chỉnh (`settings.spec.ts`) và luật Google (`google-policy.spec.ts`). Template mới chưa mở cho chủ
quán tự động theo kiểu "thử → mở" — đó là lát M5.
