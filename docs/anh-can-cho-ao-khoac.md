# Ảnh cần cho áo khoác — bản kê cho Tài

Tài tạo ảnh bằng ChatGPT/Gemini và tự viết prompt. Tệp này chỉ nói **cần loại ảnh gì, để làm gì, đặt ở đâu,
cỡ bao nhiêu**. Claude nhận ảnh thô rồi tự nén, cắt, chuyển WebP/AVIF và ghim vào áo.

Bối cảnh: `DESIGN.md` mục 1 (hợp đồng áo khoác), `docs/decisions.md` mục 9. Sáu thiết kế Tài chốt 22/09 chia
thành **hai dòng**: dòng **không tranh** (02 Thẻ tối · 04 Kính · 05 Xếp lớp) và dòng **có tranh**
(01 Hero · 03 Chia đôi · 06 Nhập vai). Tệp này phục vụ dòng có tranh.

## Luật chung cho mọi ảnh

| | |
|---|---|
| **Nền tối** | Cả hai dòng đều nền tím than. Vật thể phải **đọc được trên nền tối**: viền sáng, cạnh phát sáng. Tránh viền đen — nó biến mất |
| **Cỡ** | Gấp **2–3 lần** cỡ hiển thị. Trang khách rộng tối đa 440px, nên vật thể **≥ 1200px cạnh dài**; cảnh tràn viền **≥ 1200 × 2000** |
| **Định dạng** | Vật thể: **PNG nền trong suốt thật** (không phải trắng). Cảnh: JPG hay PNG đều được |
| **Chừa lề** | Vật thể sẽ bị xoay, cắt, tràn mép. Chừa quanh chủ thể **khoảng 10%** khoảng trống |
| **Cùng một gia đình** | Cả bộ phải nhìn như một người vẽ: cùng nét, cùng độ bóng, cùng bảng màu tím–hồng–xanh neon |
| **Không nhãn hiệu** | Ly nước **không mang logo hãng nào**. Chỗ logo để trống hoặc là một hình trừu tượng. Đây là luật, xem `DESIGN.md` mục 8 |
| **Dọc, không ngang** | Điện thoại là khung dọc. Cảnh tràn viền vẽ theo chiều dọc, đừng vẽ ngang rồi cắt |

## A · Chặn việc — không có thì dòng có tranh không dựng được

| # | Loại | Dùng ở đâu | Tỉ lệ · cỡ | Ghi chú |
|---|---|---|---|---|
| **A1** | **Cụm ly nước**, nền trong suốt | 01 Hero: nằm trên, thẻ tối đè lên chân cụm | vuông hoặc 4:5 · ≥ 1400px | 2–4 ly cao thấp khác nhau. Đây là ảnh quan trọng nhất |
| **A2** | **Một ly đơn**, nền trong suốt, hơi nghiêng | 03 Chia đôi: nửa phải, cạnh khối chữ | 3:4 · ≥ 1200px | Cùng phong cách A1. Nghiêng ~10° |
| **A3** | **Cảnh quán đêm** dọc, vẽ tay, đèn neon | 06 Nhập vai: tràn viền phía trên | 3:4 hoặc 9:16 · ≥ 1200 × 1800 | Quầy bar, kệ chai, cây, một mảng neon. **Nửa dưới để trống/tối** vì khối chữ sẽ đè lên |

Ba tấm này mỗi tấm xin **3–4 biến thể** để chọn — tổng 10–12 ảnh, đúng như Tài nói.

## B · Vật thể nhỏ — rắc lên cho trang có hồn

Đều **nền trong suốt**, **≥ 600px**, dùng lại được ở cả sáu bản.

| # | Loại | Xuất hiện ở |
|---|---|---|
| **B1** | Mặt cười kiểu dán sticker | 05 Xếp lớp, trên thẻ hồng |
| **B2** | Trái tim nét vẽ tay | 03, 05 |
| **B3** | Vương miện nhỏ | 01, trên dòng chữ viết tay |
| **B4** | Tia lấp lánh · dấu cộng · ngôi sao bốn cánh (3–5 cái rời) | rắc nền cả sáu bản |
| **B5** | Lá cây · nhánh nhỏ | 06, viền cảnh |

## C · Nền không khí — tuỳ chọn, tôi vẽ bằng mã được

Nếu Tài tạo thì tôi dùng; không có thì tôi dựng bằng CSS, **0 KB**.

| # | Loại | Dùng ở đâu |
|---|---|---|
| **C1** | Hai quả cầu/bong bóng phát sáng, mềm, nền trong suốt | 04 Kính, nền sau thẻ |
| **C2** | Mây khói tím mờ | nền chung |
| **C3** | Hạt phim / vân giấy | phủ mỏng toàn trang |

## D · Chữ viết tay — Tài chốt 22/09: **cố định, không cho shop gõ**

Vì cố định nên không cần bộ chữ có dấu tiếng Việt: tôi biến thành SVG, **0 KB**, nét sắc ở mọi cỡ.
Tạo dạng **PNG nền trong suốt, chữ trắng hoặc hồng neon**, tôi tự vector hoá.

| # | Câu | Xuất hiện ở |
|---|---|---|
| **D1** | `Good Drinks Better Days` | 01, góc trên trái, nghiêng |
| **D2** | `SCAN · REVIEW · SUPPORT` | 01, góc phải, xoay dọc |
| **D3** | `GOOD FOOD HAPPIER PEOPLE` | 03, cạnh ly |
| **D4** | `SMALL REVIEW BIG SUPPORT` | 05, cạnh phải |
| **D5** | `THANKS FOR BEING HERE` | 06, trong cảnh, kiểu biển neon |

**Lưu ý:** năm câu này là **tiếng Anh và trang trí**, không phải nội dung quán tự đặt. Nếu sau này muốn shop
đổi được thì phải quay lại bài toán bộ chữ có dấu — lúc đó mới tính.

## Ngân sách — Tài chốt 22/09: **trần thấp thì nâng lên**

`DESIGN.md` sàn 4 ban đầu ghi "áo khoác ≤ 40 KB, không ảnh". Dòng có tranh phá sàn đó, nên sàn được sửa:

- **Tranh của áo ≤ 200 KB** sau khi nén (AVIF/WebP). Tranh là **tài sản nền tảng**, nằm trong repo, **không
  qua cửa duyệt** — cửa duyệt ở `decisions.md` mục 10 chỉ dành cho ảnh shop tự tải lên.
- Trang khách của một quán **chưa có ảnh riêng**: 133 KB mã + 38 KB bộ chữ + 200 KB tranh ≈ **371 KB**.
- Con số này **phải đo trên điện thoại thật qua 4G** trước khi đưa cho quán đầu tiên. Nâng trần là quyết định
  của Tài; giấu con số thì không. Mỗi 100 KB ≈ **0,27 giây** ở 3 Mbps.

## Claude làm gì trong lúc chờ ảnh

Dòng **không tranh** không cần tấm nào, nên dựng song song ngay: 02 Thẻ tối · 04 Kính · 05 Xếp lớp, cộng ba
việc sửa luật đã phát hiện khi soi sáu bản thiết kế:

1. **06** đặt nút Google ngang hàng với Instagram/Zalo/TikTok — phá sàn 3. Dựng lại thành nút chính.
2. **05** để Google là một dòng bằng ba dòng kia — làm nó cao hơn và đặc hơn.
3. **Cả sáu** thiếu nút **"Xoá dữ liệu của tôi"** ở chân trang. Đó là lời hứa trong chính sách A5, phải có.
