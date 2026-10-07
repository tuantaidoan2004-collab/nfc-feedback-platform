# Bàn giao: sửa giao diện khách (Cọ Láp / TBQ) — cập nhật 07/10/2026, bản 1.4.2 đang chạy

Tài liệu này dành cho người (hoặc phiên Claude) tiếp tục sửa giao diện **phía khách**. Đọc hết trước khi đụng code.

## 1. Chủ muốn gì (yêu cầu gốc)

- "UI quá nhiều chữ, chưa thân thiện" → làm dạng **flow / tiến trình** (tham khảo kiểu checklist của https://jitter.video/), nhưng **giữ phong cách Tiệm**.
- "Đừng như điền Google Sheet" → không dùng danh sách dòng + nút radio. Dùng ô / thẻ để bấm.
- Gia hạn và báo lỗi → **chỉ là link Zalo** của Tiệm (không có form).
- **Làm nổi bật web tiembanquyen.com** trên trang khách.
- Chủ không phải dân lập trình: báo cáo bằng tiếng Việt, câu ngắn, không dán code.

## 2. Phong cách Tiệm (bắt buộc giữ)

Theo nhận diện tiembanquyen.com: giấy ấm, mực, vàng đồng, chữ có chân, góc bo 4px. Biến màu ở đầu `src/public/style.css`:

| Biến | Dùng cho |
|---|---|
| `--paper` `#f4f1ea`, `--surface` `#faf8f3`, `--wash` | nền trang / thẻ / nền phụ |
| `--ink` `#1c1b19` | chữ, nút chính, khối nền đen |
| `--gold` `#b38b45`, `--gold-light`, `--gold-700`, `--gold-50` | vạch, viền chọn, nhãn, nền chip |
| `--green` / `--green-50`, `--red` / `--red-50` | trạng thái ok / lỗi |
| `--font-head` (Cormorant Garamond → Times), `--font-body` (Lora → Georgia), `--font-mono` | tiêu đề / chữ thường / mã, mật khẩu |

Không tải font hay ảnh từ ngoài: CSP là `default-src 'self'`, nên **không có inline `<script>`, không có thuộc tính `style="..."`** trong HTML. Muốn đổi độ rộng, màu… lúc chạy thì dùng JS gán `el.style.x` (được phép), hoặc thêm class.

## 3. File cần biết

| File | Nội dung |
|---|---|
| `src/views/public.js` | Toàn bộ HTML trang khách (hàm trả về chuỗi `html\`...\``, tự escape). |
| `src/views/layout.js` | Khung trang: đầu "TBQ Tiệm Bản Quyền", chân trang (link tiembanquyen.com + Chính sách + Zalo). |
| `src/public/style.css` | CSS khách. Phần mới phiên 30 nằm **cuối file** (từ comment "Trang slot dạng tiến trình"). |
| `src/public/app.js` | JS khách (không framework). Các khối: Sao chép, Nhận slot (`#claim-form`), Đếm ngược, Lấy mã (`#code-box`), Tiến trình đăng nhập (`[data-flow]`). |
| `src/views/admin.js`, `src/public/admin.css` | Trang quản trị — **không thuộc phạm vi** đợt sửa UI khách. |

## 4. Các trang khách và tình trạng

| Trang | Đường dẫn | Hàm | Tình trạng |
|---|---|---|---|
| Chọn món ở quán | `/qs/<mã quán>` | `cardPage` | **ĐÃ làm flow** (phiên 30) |
| Slot của tôi (đang dùng) | `/me` | `mePage` → `slotBody` | **ĐÃ làm flow** (phiên 30) |
| Xác nhận email (OTP) | trong `/qs/<mã>` khi chưa đăng nhập | `otpForm` | CHƯA — vẫn form dài (ô email + ô tích đồng ý + ô mã) |
| Chưa chạm thẻ | trong `/qs/<mã>` | nhánh `!atCafe` của `cardPage` | CHƯA (thẻ ☕ + chữ) |
| Đang mời Canva | `/me` khi `pending_invite` | `slotBody` | CHƯA (spinner + 3 đoạn chữ) |
| Hết giờ / bị dừng | `/me` khi `expired` / `revoked` / `rejected` | `slotBody` | CHƯA |
| Trang chủ | `/` | `homePage` | CHƯA (danh sách 5 bước dạng `<ol>`) |
| Về chúng tôi | `/ve-chung-toi` | `aboutPage` | CHƯA |
| Chính sách dữ liệu | `/privacy` | `privacyPage` | Giữ dạng văn bản (nội dung pháp lý — đừng rút gọn ý) |

**Gợi ý làm tiếp (chưa được chủ duyệt, hỏi trước khi làm):** ghép `otpForm` thành bước 1 của tiến trình chọn món (Nhập email → Nhập mã → Chọn món → Nhận), để khách thấy một mạch từ đầu tới cuối; trang chờ Canva thành tiến trình 3 bước (Tiệm đang mời → Mở thư, bấm Chấp nhận → Xong) tự chuyển khi bot mời xong.

## 5. Thành phần đã có (dùng lại, đừng viết mới)

### 5.1 Tiến trình (`.flow`)
HTML (xem `flow()` trong `public.js`):
```
section.card.flow[data-flow=<slotId>]
  .flow-head > h2 + .flow-count > b[data-flow-n] "/N"
  .flow-bar > i[data-flow-bar]            ← thanh vàng, JS gán width
  ol.fsteps > li.fstep[data-step=i]
     button.fhead[data-step-go=i] > span.fdot > span(số) + span.ftitle
     div.fbody  ← nội dung bước; nút [data-next] / [data-copy] / [data-act=copy-code] → xong bước
  p.fdone[data-flow-finish][hidden]       ← "🎉 Xong rồi!"
```
- Không có JS: mọi bước đều mở (vẫn dùng được). JS thêm class `js` vào `.flow` rồi gán `done` / `now` / `later` cho từng bước; CSS `.flow.js .fstep:not(.now) .fbody { display:none }`.
- Bước đang làm của trang slot được nhớ trong `localStorage` khoá `tbq-flow-<slotId>`.
- Mỗi bước là object `{ title, body, manual }`. `manual` = chữ trên nút "Xong ✓" cho bước không có thao tác chép / mở. Bước `null` bị bỏ qua.

### 5.2 Chọn món (`#claim-form.flow.pick`)
- Bước: ✓ Đã thấy bạn đang ở quán → Hôm nay bạn cần món nào? (ô `.tile`) → (chỉ Canva: Email Canva của bạn) → Nhận.
- Món còn suất: `.tiles` (2 cột, ô to). Món hết / bị chặn: `.tiles.mini` (ô nhỏ, viền đứt, mờ) — **vẫn là `<input type=radio disabled>`** (xem mục 7).
- JS: `show('tool' | 'invite' | 'go')` trong khối "Nhận slot" của `app.js`. Mỗi radio có `data-name`, `data-login`, `data-sub` để JS ghi tóm tắt.

### 5.3 Khác
- `copyable(value)` → `span.copy-row > code + button.btn-mini[data-copy]` (trong bước flow thì nút sao chép tô đen).
- Chip luật: `section.card.rules > ul.chips > li` + `details.more` "Lưu ý thêm" (chữ `instructions` của công cụ do chủ nhập ở quản trị).
- Hai nút Zalo: `.zalo-row > a.zbtn` (⏳ Gia hạn chỉ hiện khi `v.canExtend`; 🛟 Báo lỗi luôn hiện). Đều trỏ `settings.zaloUrl`.
- Khối web Tiệm: `tiemPromo()` → `a.card.tiem-web` nền mực, nút vàng "tiembanquyen.com ↗". Chân trang có `a.foot-web`.
- Ô lấy mã: `codeBox(ctx, v, 'mail' | 'totp')` — logic phiếu / đếm giờ / 2FA nằm trong `app.js`, **đừng đổi id / data-act**.

## 6. Những câu chữ / luật KHÔNG được bỏ

- "**Chỉ dùng 1 máy để nhường slot cho bạn sau nhé**" — câu nhận diện của chương trình (có test kiểm).
- Cảnh báo không đổi mật khẩu / email / 2FA (giờ là chip 🔒).
- Workspace dùng chung: "Workspace của bạn: <b>Slot N</b>" và "Chỉ dùng Slot N".
- Không câu nào nối việc nhận công cụ với **đánh giá quán / Google review** (luật Google của QS; `src/lib/policy.js` có bộ lọc từ).
- Ô đồng ý lưu dữ liệu ở bước email (PDPL) — phải còn, không tích sẵn.

## 7. Test đang bám vào HTML — sửa UI phải giữ

| Chỗ kiểm | Bám vào |
|---|---|
| `test/http.test.js`, `scripts/e2e.js` | chữ "Hôm nay bạn cần món nào", "Chỉ dùng 1 máy để nhường slot cho bạn sau nhé", "Lấy mã", "Lấy mã 2FA", "Liên hệ Tiệm", "Gửi mã qua SMS" (kênh SMS) |
| `test/qs.test.js` | "Đã thấy bạn đang ở quán" |
| `scripts/e2e.js`, `scripts/van-hanh-sau.js` | thẻ `<input type="radio" name="toolId" ...>` có `value`, `data-name`, và chữ `disabled` cho món hết — **đúng thứ tự thuộc tính `type` rồi `name`** |
| `scripts/van-hanh-sau.js` | `<span class="copy-row"><code>EMAIL</code>` rồi `<code>MẬT KHẨU</code>` — email đứng **trước** mật khẩu; `Workspace của bạn: <b>Slot N</b>`; `data-countdown`; link Gemini `class="btn" href="https://one.google.com…"` |
| `test/ma-phieu.test.js` | `Workspace của bạn: <b>Slot 2</b>`, nút `<b>Gia hạn</b><small>nhắn Zalo</small>`; "đã có phiếu" |

Đổi chữ nào trong bảng thì sửa test cùng lúc và nói rõ với chủ.

## 8. Cách xem thử, kiểm tra, đưa lên

1. **Xem nhanh không cần đăng nhập:** `node /tmp/tbq-xem/ve.mjs` dựng `capcut.html`, `chatgpt.html`, `chon.html` từ code thật với dữ liệu giả → chép `src/public/style.css` + `app.js` vào `/tmp/tbq-xem/static/` → mở launch **`tbq-xem-slot`** (cổng 3960) trong khung trình duyệt, chỉnh khung **mobile 375×812**. (`/tmp` có thể bị xoá khi khởi động lại máy — khi đó viết lại script: import `mePage` / `cardPage` từ `src/views/public.js`, ctx giả `{ now, config:{otp:{loginBy:'email'}}, settings:()=>({zaloUrl, timezoneOffsetMin:420, eventTitle, entryTtlMin}) }`.)
2. **Chạy đầy đủ:** launch `tbq-colap` (`scripts/local.js`, cổng 3919, đường dẫn /colap).
3. **Kiểm:** trong `tbq-trial/` chạy `npm test` (122/122), `npm run e2e` (146/146) và `E2E_BASE_PATH=/colap npm run e2e`.
4. **Đóng gói:** tăng `version` trong `package.json` → `npm run dong-goi` → `ban-phat-hanh/tbq-<bản>.tar.gz`.
5. **Đưa lên máy thật** (`~/tbq-chay`, MacBook, Cloudflare Tunnel → https://thu.tiembanquyen.site/colap): chép `Cọ Láp/nang-cap-1.4.2.sh` thành bản mới, đổi số bản. Script tự sao lưu, giữ `.env` + `data/`, khởi động lại, chạy kiem-tra. **Chỉ chạy khi chủ đồng ý**; thường chủ tự chạy lệnh. Lệnh quay về bản cũ in ở cuối script.
6. Sao lưu code trước khi sửa vào `Cọ Láp/sao-luu/truoc-phien-<số>-<việc>/` (phiên 30: `sao-luu/truoc-phien-30-flow/`).

## 9. Lưu ý kỹ thuật

- `html\`\`` tự escape giá trị; mảng trong `${}` được nối sẵn. Chuỗi đã là `html\`\`` thì không bị escape lần 2.
- Trong `app.js` đừng dùng `innerHTML` với tên công cụ / email (tên công cụ do chủ nhập) — dùng `textContent` như khối tóm tắt chọn món.
- `BASE` (đường dẫn `/colap`) được JS tự thêm khi gọi API; link trong HTML dạng `/me`, `/privacy` được máy chủ tự thêm tiền tố.
- Màn hình nhỏ: kiểm ở 375px; ô `.tiles` 2 cột, tên dài (Adobe Creative Cloud) xuống dòng — vẫn ổn.
- `prefers-reduced-motion` đã tắt hiệu ứng; hiệu ứng mới nhớ giữ ngắn (≤ .4s).
- Đã bỏ khỏi trang khách (backend vẫn còn): form gia hạn (`/api/extend`, `/api/extend/request`), form báo lỗi (`/api/report`). Mã gia hạn loại "extend" ở trang Mã phiếu hiện **khách không có chỗ nhập** — chủ gia hạn trực tiếp ở Quản trị › Gia hạn. Muốn bật lại ô nhập mã thì hỏi chủ.

## 10. Việc còn lại ngoài UI (để biết, không thuộc đợt này)

Kho ChatGPT / Claude / Gemini / Adobe trống; 8 việc tay chờ; bot Canva chưa tự bật (server = MacBook; đề xuất launchd agent tự chạy bot, chưa làm); quán Bamos đang Tạm dừng do chủ. Chi tiết ở đầu `Cọ Láp/BAN-GIAO-TIEP.md`.
