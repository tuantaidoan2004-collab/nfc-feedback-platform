# DESIGN.md — nền tảng trông và cư xử như thế nào

Đọc `PRODUCT.md` trước (ai dùng, để làm gì). Tệp này nói **hình thức**. Agent và công cụ thiết kế đọc tệp này
trước khi viết một dòng CSS nào. Luật Google ở `docs/google-policy.md` **thắng mọi thứ ở đây**.

Ghi lần đầu 22/09/2026. Ba bề mặt, ba luật khác nhau — đừng trộn.

---

## 0. Ba bề mặt

| Bề mặt | Ai xem | Luật của nó | Được phép nặng bao nhiêu |
|---|---|---|---|
| **Trang khách** `/<slug>`, `/t/<mã>` | khách lạ, 4G, 30 giây | luật Google · tốc độ · tương phản | **≤ 600 KB** cả trang |
| **Dashboard** `/ZZZ/<slug>` | chủ quán, đã đăng nhập, wifi | nhất quán · dùng được một tay | rộng rãi |
| **Trang giới thiệu** (chưa có) | người chưa biết mình là ai | thuyết phục | rộng rãi, hiệu ứng nặng ở đây |

Phần còn lại của tệp này nói về **trang khách**, trừ mục 7.

---

## 1. Xương · thịt · da · áo khoác

| Lớp | Là gì | Đổi được không |
|---|---|---|
| **Xương** | DOM trang khách: nút nào có, thứ tự nào, hiện lúc nào | **Không** |
| **Thịt** | Hành vi: máy trạng thái lượt ghé, beacon, xoá dữ liệu, thẻ góp ý | **Không** |
| **Da** | CSS nền: phần tử nào là cột, đâu là CTA, bố cục neo | Chung cho mọi áo |
| **Áo khoác** | Một bó token: màu, bộ chữ, cỡ, tỉ lệ, bo góc, nhịp thở, nền | **Đây là chỗ khác nhau** |

### Hợp đồng của một áo khoác

> **Áo khoác chỉ đặt token CSS. Nó không được thêm, bớt, đổi thứ tự hay làm chậm bất kỳ nút DOM nào.**

Đây là toàn bộ cơ chế an toàn. Mọi test trong `tests/contracts/google-policy.spec.ts` kiểm **cấu trúc**; áo khoác
không chạm được vào cấu trúc, nên không áo nào phá được các test đó — theo cấu tạo, không nhờ cẩn thận.

`PageConfig` lưu **một chuỗi**: `coat: '<id>'`. Không lưu token. Thêm áo mới không migrate gì.

**Luật sửa áo:** chỉ được tinh chỉnh, **không đổi căn tính**. Muốn đổi hẳn thì đẻ áo mới, id mới. Nếu không, một
sáng chủ quán mở trang lên thấy quán mình khác hẳn mà không ai hỏi họ.

---

## 2. Bốn sàn — áo nào không qua thì không vào tủ

Mỗi sàn có một test. Test chạy cho **từng áo**, không chỉ áo mặc định.

| # | Sàn | Đo bằng |
|---|---|---|
| 1 | Nút Google trọn trong màn hình đầu, không cuộn | bố cục neo (mục 3) — bất biến, không phải kiểm sau |
| 2 | Tương phản ≥ **4,5:1** cho: chữ trên nút Google · chữ thân trên nền khối · **chữ mờ** (ghi chú, dòng pháp lý) | tính từ token |
| 3 | Nút Google nổi hơn mọi thứ quanh nó, đặc biệt là nút góp ý riêng | cỡ chữ · chiều cao · bề rộng |
| 4 | Áo thêm **≤ 40 KB**, **không ảnh** | tổng woff2 của bộ chữ |

Sàn 2 hay gãy nhất ở **chữ mờ trên áo tối**. Đó cũng là chỗ đặt dòng pháp lý — thứ bắt buộc phải đọc được.

---

## 3. Bố cục neo — cách làm sàn 1 thành bất biến

Trang khách là **một cột `100dvh`**, phần tử cuối cùng là khối CTA, phần trên là `flex: 1`.

```
[ 100dvh ]
  hero        flex: 1     ← ảnh, tên quán, câu hỏi. Ăn hết chỗ còn lại
  khối CTA    flex: none  ← "Thật tuyệt nếu…" + nút Google + ghi chú
```

Hệ quả: nút Google **không có đường nào trôi xuống dưới màn hình**. Máy cao thì hero được nhiều chỗ hơn, máy nhỏ
thì ít hơn, CTA đứng yên. Đây là cách duy nhất cho phép làm giao diện điện ảnh (chữ tiêu đề rất lớn, ảnh tràn
viền) mà không phá luật Google.

Mọi thứ khác — link mạng xã hội, dòng pháp lý, thẻ góp ý — nằm **dưới** màn hình đầu và được cuộn tới.

Dùng `100dvh`, không `100vh`: thanh địa chỉ Safari di động làm `100vh` cao hơn màn hình thật.

---

## 4. Token — lớp "da", chung cho mọi áo

Áo khoác đặt lại giá trị; **không áo nào được thêm tên token mới**.

```
màu        --c-c1 --c-c2 --c-angle          nền trang
           --c-paper                        nền khối nội dung
           --c-ink --c-ink-2 --c-muted      chữ chính · phụ · mờ
           --c-line                         đường kẻ
           --c-brand --c-on-brand           màu thương hiệu và chữ đặt trên nó
           --c-accent                       màu nhấn, dùng ít
           --c-fab                          nút góp ý riêng

chữ        --c-font                         bộ chữ thân
           --c-display                      bộ chữ tiêu đề
           --c-h1 --c-h1-weight --c-h1-track --c-h1-case
           --c-body

tỉ lệ      --c-radius --c-btn-radius        bo góc khối · nút
           --c-btn-h                        chiều cao nút Google
           --c-logo --c-poster              cỡ logo · tỉ lệ khung poster
           --c-density                      nhịp thở, nhân vào mọi khoảng cách

bề mặt     --c-sheet-shadow --c-btn-shadow
           --c-pill-bg --c-pill-ink --c-pill-radius --c-pill-shadow
```

`--c-density` là thứ làm hai áo **khác nhau về tỉ lệ** chứ không chỉ khác màu. Mọi khoảng cách viết bằng
`calc(<số> * var(--u))` với `--u: calc(1px * var(--c-density))`.

---

## 5. Chữ

**Luật đầu tiên, trước cả thẩm mỹ: dấu tiếng Việt.** Tên quán in cỡ lớn mà dấu ngã trên `ê` lệch hoặc dấu nặng
dưới `ô` đặt sai thì hỏng cả trang, và lỗi này **chỉ lộ khi in to**.

Trước khi nhận một bộ chữ vào bất kỳ áo nào, render chuỗi này ở cỡ tiêu đề và nhìn:

```
Nguyễn Đỗ Quỳnh · ẫ ộ ự ỡ ặ ề ố ỷ ẳ ữ ợ
```

Bộ chữ đã kiểm và dùng được: `system-ui` (là **SF trên iPhone**, Roboto trên Android — 0 KB, và là cách hợp pháp
duy nhất để có SF trên web), **Be Vietnam Pro** (người Việt vẽ), **Playfair Display**, **Lora**,
**Montserrat**, **Inter**. Bộ chữ display kiểu didone hay script phần lớn **không có dấu tiếng Việt** — không
nhận trước khi nhìn tận mắt.

Thang cỡ: tên quán `--c-h1` trong khoảng **27–40px**; chữ thân **14–16px** (dưới 14 là không đọc nổi ngoài nắng);
ghi chú và dòng pháp lý không nhỏ hơn **0,74 × chữ thân**, và phải qua sàn 2.

Chữ nút Google luôn **lớn hơn** chữ thân ít nhất 1px và đậm hơn.

---

## 6. Chuyển động

- **Không hiệu ứng nào làm nút Google xuất hiện muộn.** Không fade-in, không stagger, không reveal khi cuộn ở
  vùng CTA. Đây là luật, có test.
- Nền được phép chuyển động chậm (khối màu trôi, quét sáng), bằng **CSS, không video, không WebGL** trên trang
  khách. Ngân sách: vài KB mã, 0 KB tài nguyên.
- Mọi chuyển động tôn trọng `prefers-reduced-motion: reduce`.
- Nút bấm lún nhẹ rồi bật lại — đường cong `--spring` đã có trong `guest-page.css`, giữ nguyên.
- Máy Android rẻ là máy chuẩn để thử, không phải MacBook.

---

## 7. Trang giới thiệu nền tảng (chưa dựng)

Đây là chỗ **duy nhất** hiệu ứng nặng đáng tiền: WebGL, thư viện chuyển động, ảnh lớn. Nó chạy trên wifi, không
có luật Google, và mỗi hiệu ứng là một câu "bọn tôi làm giao diện tử tế". Không lấy ngân sách 600 KB của trang
khách áp vào đây, và **không lấy hiệu ứng của trang này đem sang trang khách**.

---

## 8. Nhãn hiệu — luật cứng của thiết kế

1. **Không áo nào mang tên một hãng.** Không có áo tên "Apple", "Sentry", "Starbucks". Mượn hình học bảng màu thì
   được; mượn tên thì không. Chính kho `awesome-design-md` cũng viết "Sentri-Inspired" — họ né có chủ ý.
2. **Không dùng logo, ảnh sản phẩm, bộ chữ độc quyền của hãng khác** trong áo, trong demo, trong ảnh chụp đưa cho
   shop xem. SF Pro không có giấy phép web; `system-ui` trên iPhone thì có.
3. **Ảnh và logo shop tải lên phải qua duyệt** trước khi lên trang (`docs/decisions.md` mục 10).

---

## 9. Tủ áo

Mỗi áo có một mục ở đây khi nó vào `lib/publishing/coats.ts`. Ghi: id · tên · dòng · dùng cho ngành nào · bộ chữ
và số KB · kết quả bốn sàn.

*(chưa có áo nào được chốt vào mã — áo đầu tiên đang dựng, xem `docs/decisions.md` mục 9)*
