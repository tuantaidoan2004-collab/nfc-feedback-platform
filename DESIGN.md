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
>
> Một ngoại lệ có rào, Tài chốt 23/09: thẻ `<svg>` vô hình chứa bộ lọc kính của khuôn 3 — `thiet-ke-va-khuon.md` mục 15.

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
| 4 | Áo thêm **≤ 40 KB** bộ chữ, **và ≤ 200 KB tranh** nếu là dòng có tranh | tổng woff2 + tranh sau khi nén |

Sàn 4 được nâng 22/09 theo quyết định của Tài: dòng áo **có tranh** cần tài sản riêng. Tranh là **của nền
tảng** — nằm trong repo, không qua cửa duyệt ở `docs/decisions.md` mục 10 (cửa đó chỉ dành cho ảnh shop tự tải).
Bản kê ảnh ở [`docs/anh-can-cho-ao-khoac.md`](docs/anh-can-cho-ao-khoac.md). Nâng trần thì **phải đo lại trên
điện thoại thật qua 4G** trước khi giao cho quán đầu tiên; mỗi 100 KB ≈ 0,27 giây ở 3 Mbps.

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

nút Google --c-btn-fill                     nền nút Google; mặc định pha từ --c-brand (khuôn 4)

sàn        --c-floor                        chỗ chừa cho nút góp ý (mục 6c)
           --c-overscroll                   quãng cuộn dư, luật A1 (thiet-ke-va-khuon.md mục 13)
```

**Đã nối vào mã (A36, 23/09):** tên và giá trị mặc định ở `components/skin.css`; `guest-page.css` đọc `--c-paper
--c-ink --c-ink-2 --c-muted --c-line --c-brand --c-on-brand --c-accent --c-font --c-display --c-h1 --c-h1-weight
--c-h1-track --c-h1-case --c-radius --c-btn-radius --c-btn-h --c-logo --c-poster --c-floor --c-overscroll`. Mặc định = diện
mạo trước A36. Nút Google pha bốn nấc màu từ `--c-brand` (khuôn 6); cỡ chữ và logo Google trong nút lớn theo
`--c-btn-h`. Khuôn 5 nối thêm `--c-btn-shadow --c-pill-bg --c-pill-ink`, và nút Gửi pha từ `--c-brand`. Khuôn 3 nối
`--c-c1 --c-c2 --c-angle` (trang đặt inline từ màu nền của shop). **Chưa nối:** `--c-fab`, `--c-body`, `--c-density`, `--c-sheet-shadow`,
`--c-pill-radius --c-pill-shadow`. Nối từng cái khi một khuôn cần tới.

Nút Google của khuôn gốc giờ **pha** từ `--c-brand` thay vì bốn mã màu cứng; sai khác mỗi nấc vài đơn vị RGB (tinh
chỉnh, không đổi căn tính). Trình duyệt không có `color-mix()` giữ bốn mã cũ nhờ `@supports`.

`tests/contracts/skin.spec.ts` giữ ba điều: không tên token nào ngoài danh sách này · mọi token được đọc đều có mặc
định · chữ trên nền đạt 4,5:1 (sàn 2) và `--c-btn-h` ≥ 56px cho mặc định **và mọi khối `[data-template]`**.

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

## 6b. Nét tay — ngôn ngữ hình của dòng “không tranh” (Tài chốt 22/09)

Mọi đường viền trang trí vẽ như **bút sáp**, không phải cạnh vector: viền khối, vòng logo, viền nút link, gạch
chân dưới tên quán, dấu cộng rắc nền, con tam giác. Làm bằng một bộ lọc SVG nội tuyến —
`feTurbulence` + `feDisplacementMap` làm lệch từng điểm của đường vẽ, nên cạnh run nhẹ như tay người. **0 KB tài
nguyên**, không tải ảnh nào.

Viết trong data URI thì `#` phải thành `%23`, và **tránh dấu `%`** — dùng `filterUnits="userSpaceOnUse"` thay cho
phần trăm, vì Safari khó tính với percent-escape trong data URI. Khung kéo giãn thì stroke giữ bề dày nhờ
`vector-effect="non-scaling-stroke"`.

**Một ngoại lệ có chủ ý: nút Google giữ cạnh sắc, trắng đặc.** Nó là thứ duy nhất trên trang trông như một cái
nút thật, vì nó là thứ duy nhất khách cần bấm. Mọi thứ quanh nó vẽ tay để nó nổi lên.

## 6c. Đáy trang có hai hình dạng, cả hai đều phải tử tế

`useBottomHint` chỉ hiện dòng mời góp ý **sau khi khách cuộn hết trang rồi đợi 2 giây** — cố ý, để không nài nỉ
khi khách chưa xem xong. Nên áo phải vẽ cả hai trạng thái:

| Trạng thái | Hình dạng |
|---|---|
| Chưa cuộn hết | một **nút tròn** góc dưới trái; con tam giác nhô lên từ mép dưới màn hình |
| Đã cuộn hết | nút tròn **thu vào** trong dải ngang; con tam giác leo lên **bám mép dải** |

Và một token bắt buộc: **`--c-floor`** là khoảng trống dưới cùng dành riêng cho dải và con tam giác. Khối nội
dung không bao giờ được chạm vào nó. Thiếu nó thì thẻ và dải dính nhau ngay lúc trang vừa mở (Tài chỉ ra 22/09).

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

## 9. Tủ khuôn

**Sáu áo khoác dựng thử ngày 22–23/09 đã bị xoá** (Tài, 23/09): ba bản không tranh và ba bản có tranh chỉ là
bản thử để tìm hướng, và chúng được thay bằng **lát sáu khuôn** — xem `docs/thiet-ke-va-khuon.md` mục 12.

Cái **còn lại và vẫn có hiệu lực** là phần nguyên tắc ở mục 1–8 của tệp này: hợp đồng lớp trình bày, bốn sàn,
bố cục neo, luật dấu tiếng Việt, luật nhãn hiệu, hai luật dùng chung (trang luôn dài hơn màn hình · nút máy bay
giấy bất biến), và kỹ thuật nét tay bằng bộ lọc SVG. Sáu khuôn mới kế thừa toàn bộ những thứ đó.

Mỗi khuôn khi vào mã ghi một mục ở đây: id · tên · dùng cho ngành nào · bộ chữ và số KB · kết quả bốn sàn.

**Sáu khoá đã vào mã (A33, 23/09)** — mới là bộ xương, **chưa có diện mạo riêng**. Mỗi khoá có một cấu hình
(`templateConfig(key)` trong `lib/publishing/config.ts`), một hàng `template_versions`, và tới trang khách dưới
dạng `data-template="<key>"` trên `main.guest`. Chưa có dòng CSS nào đọc thuộc tính đó.

| # | id | Tên | Cấu hình hiện có |
|---|---|---|---|
| 1 | `standard` | Bản gốc | nền video, nhân bản từ shop khuôn — **có diện mạo** (thẻ trôi), xem dưới |
| 2 | `minimal` | Tối giản | `full-bleed`, nền đặc `#140F22` — **có diện mạo**, xem dưới |
| 3 | `glass` | Kính | `full-bleed`, chuyển sắc `#1B2B4A → #8FB3D9` — **có diện mạo**, xem dưới |
| 4 | `deco` | Thẻ trang trí | `full-bleed`, nền đặc `#1A1326` — **có diện mạo** (chồng thẻ), xem dưới |
| 5 | `spotlight` | Ánh sáng tụ | `full-bleed`, nền đặc `#0E0F13` — **có diện mạo**, xem dưới |
| 6 | `big-button` | Nút lớn | `full-bleed`, nền trắng sữa `#F6F3EE` — **nút hạt ngọc** (24/09), xem dưới |

Bộ chữ, số KB và kết quả bốn sàn ghi vào đây khi từng khuôn có diện mạo.

**Khuôn 6 · `big-button` · Nút lớn** (làm lại 24/09 theo Tài) — gói rẻ nhất: trắng sữa và **một nút Google hạt ngọc**.
Hạt tròn phồng như nổi lên khỏi mặt giấy (sáng đỉnh, bóng mềm ở chân, quầng ấm quanh chân), chứa chữ **G bốn màu của
Google, không đổi màu** (vẽ bằng dải màu xoay tròn cắt theo hình chữ G). Quanh hạt là **chính chữ của nút**, in hoa,
giãn rộng; chữ gốc vẫn nằm trong nút (chỉ ẩn khỏi mắt) nên trình đọc màn hình nghe đúng câu mọi khuôn khác nói. Mặt
hạt như gương: một vệt sáng lướt ngang; trên Android ánh sáng theo độ nghiêng của máy — trang chỉ **lắng nghe**, không
bao giờ xin quyền cảm biến, nên iPhone (không có quyền thì không có sự kiện) giữ vệt sáng tự lướt. Chạm nút: lớp sương
300ms rồi cùng tab sang Google (như trước). Hình dạng nút là **quyết định của nền tảng** (`BUTTON_FORMS`, `data-button=
"orb"`), không phải luật của khuôn, nên hàng rào "khuôn không đụng nút Google" vẫn đứng. Chrome và WebKit ra y hệt;
Firefox bỏ qua `textLength` nên chữ vòng dồn về một phía. 0 KB tài nguyên.

**Khuôn 5 · `spotlight` · Ánh sáng tụ** (23/09) — quán tối, bar, cà phê đêm. Nền than, chữ kem; nút Google màu hổ
phách với **quầng sáng của chính nó** (`--c-btn-shadow`), nên ánh sáng đi theo nút dù tên quán dài bao nhiêu. Quanh
nút là lưới chấm sắc và một vũng sáng thở chậm (7 giây); ra xa thì cùng lưới chấm đó **nhoè** (`blur 2.5px`) và mờ đi.
Chỉ lớp trang trí nhoè, chữ không bao giờ. Lớp trang trí là pseudo-element của `.guest-body` và `.guest-bg`, không thêm
nút DOM. Tâm vũng sáng ước ở ~180px dưới mép thân trang; tên quán hai dòng thì lệch vài chục px — ánh sáng mềm nên
chấp nhận. `system-ui`, **0 KB**. Bốn sàn: (1) nút trong màn đầu · (2) test `skin.spec.ts` + đo thật viên link và ô
nhập trong thẻ góp ý · (3) nút là thứ duy nhất phát sáng · (4) 0 KB. Test: `publishing.spec.ts`, ca "khuôn 5".

**Khuôn 1 · `standard` · Bản gốc — thẻ trôi** (24/09, Tài chốt ý 1 + 2; bố cục ảnh "Hero Bold") — giữ **màu** bản gốc
(giấy sáng, xanh rừng), đổi **bố cục**: nền (video của shop) đứng yên, chỉ thẻ cuộn. Mép trên thẻ **mờ dần** từ trong
suốt tới giấy đặc, trên một dải làm nhoè nền — cuộn lên thì thẻ che dần nền không có đường cắt. Chữ luôn bắt đầu dưới
dải mờ (test giữ). Nền **thở** theo cuộn: phóng 1 → 1,08 và tối 0 → 35% trên toàn quãng cuộn (scroll-driven animation,
chỉ `transform`/`opacity`; trình duyệt chưa có thì nền đứng yên). Link lưới ô như khuôn 2. **Khuôn 1 là khuôn mọi shop
hiện có đang dùng** (production `urr6ud`, ba shop preview) — đẩy `main` là chúng đổi diện mạo. Ý 3 (tự lấy màu từ ảnh
nền để thẻ và nền cùng tông) đi với lát cửa duyệt ảnh.

**Khuôn 2 · `minimal` · Tối giản** (24/09, theo ảnh "Minimal Dark Card" Tài gửi) — ngành nào cũng hợp. Một thẻ tối
trên nền tím than, **quầng tím mờ quanh thẻ** (lớp `::before` làm nhoè một lần — filter tĩnh, không backdrop-filter, nên
cuộn không tốn thêm), hai mảng màu uốn, dấu cộng, lớp hạt nhiễu — tất cả SVG/CSS, **0 KB**, không cần tạo ảnh (máy này
không có công cụ tạo ảnh; RunComfy là dịch vụ trả phí chưa mở). Link là lưới ô đều: 1 · 2 · 3 · 2×2 · 3+2 · 3+3. Nút
Google trắng. Ô poster trống thì ẩn; shop có poster thì poster vẫn hiện. **Khác ảnh:** tên quán nằm trong thẻ (đặt ngoài
thì phải đoán tên dài mấy dòng, tên dài sẽ đè logo); không có dòng khẩu hiệu dưới tên (không có chỗ trong xương).

**Khuôn 4 · `deco` · Chồng thẻ** (24/09, theo ảnh Tài gửi) — quán trẻ, trà sữa, đồ uống. Nền tím than, thẻ nội dung
nghiêng −2°, phía sau là thẻ thứ hai nghiêng −9° — **chính là ô poster**: shop có poster thì poster nằm đó, chưa có thì
thẻ hồng mặt cười. Hình vẽ tay (dấu cộng, tim, mũi tên cong) bằng SVG nội tuyến có bộ lọc bút sáp. Link là hàng dọc có
mũi tên. Nút Google **trắng đặc** — nối token mới `--c-btn-fill`, và chữ nút đọc `--c-on-brand`. `system-ui`, **0 KB**.
**Cố ý khác ảnh:** không có câu "SMALL REVIEW BIG SUPPORT" (câu xin đánh giá sát nút Google — google-policy.md rào áp
lực và gợi ý; chữ viết tay có dấu tiếng Việt chưa có bộ chữ); thanh "nhắn riêng" giữ nút máy bay bất biến (A2); tên quán
nằm dưới logo chứ không cạnh. Phần kéo thả trang trí vẫn là A35.

**Khuôn 3 · `glass` · Kính** (23/09) — quán hiện đại, spa, cà phê sáng. Thân trang và viên link là kính khúc xạ
thật trên một cảnh màu do khuôn vẽ; nút Google đặc, xanh lam. **Cùng một kết quả ở Chrome, Safari, Firefox** — cách
làm, số đo và giới hạn ở `docs/thiet-ke-va-khuon.md` mục 15. `system-ui`, **0 KB** tài nguyên (bộ lọc là SVG nội tuyến,
~1,5 KB HTML). Bốn sàn: (1) nút trong màn đầu · (2) chữ trên lớp sương qua 4,5:1 kể cả khi sau lưng đen hay trắng tuyền ·
(3) nút Google là thứ duy nhất đặc giữa đám kính · (4) 0 KB. Nối thêm `--c-c1 --c-c2 --c-angle`.

**Khuôn tối đầu tiên làm lộ bốn chỗ viết cứng màu sáng**, đã nối vào token: viên link (`--c-pill-bg`, `--c-pill-ink`),
ô nhập trong thẻ góp ý (`--c-paper`, `--c-line`), nút Gửi (pha từ `--c-brand`), bóng nút Google (`--c-btn-shadow`). Và
hai chỗ **tách khỏi token** có chủ ý: chữ của dòng mời góp ý (A2 — phải giống hệt ở mọi khuôn) và chữ trong danh sách
ngôn ngữ (điện thoại tự vẽ nó trên nền trắng). Test mới giữ A2: nút máy bay và dòng mời đo ra giống hệt nhau giữa khuôn
5 và khuôn 6.

**Diện mạo từng khuôn nằm ở `components/skins/<khoá>.v<bản>.css` (25/09)**: mỗi bản khuôn một tệp đóng băng, selector
`.guest[data-template="…"]:where([data-template-version="…"])`. `skin.css` chỉ giữ phần của nền tảng. Luật đổi
bản ở `thiet-ke-va-khuon.md` mục 16.

**Lớp da đã dựng lại (A36, 23/09)** ở `components/skin.css`, sau khi mất cùng `coats.css`: token (mục 4), `--c-floor`,
quãng cuộn dư, cách bày link theo số lượng. Nút máy bay giấy **không** nằm ở đó mà ở `guest-page.css`, và test cấm
mọi khối `[data-template="…"]` chạm vào nó. **Con tam giác** (mục 6c) chưa dựng lại — nó thuộc diện mạo, chưa được
chốt cho sáu khuôn mới.
