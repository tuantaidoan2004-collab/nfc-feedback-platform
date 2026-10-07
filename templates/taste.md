# Gu của Tài (taste.md)

Gốc của mọi trang dựng sau này (Tài 06/10): **một lần là ưng**, với mọi loại ảnh chụp Tài gửi. Claude Code và "Nhờ Claude"
(Bàn dựng, Claude API) đọc tệp này trước khi dựng. Mỗi lần Tài sửa là **một luật mới ở đây**, kèm lý do; luật nào sai thì
sửa hoặc xoá, không chồng. Số đo theo đơn vị trang (khổ 390).

## Cách dựng từ ảnh chụp

1. **Ảnh chụp là bản thiết kế, không phải gợi ý.** Đo vị trí, cỡ, màu từ ảnh (bỏ khung điện thoại, quy về 390 đơn vị), không ước
   chừng. Màu lấy mẫu điểm ảnh; ảnh nền tìm đúng khung cắt và độ phóng bằng cách so điểm ảnh, không đoán.
2. **Không thêm gì ngoài ảnh chụp** (chữ, dấu @, nút, khung). Chỉ thêm khi Tài dặn trong lời nhắn, và lấy đúng thông tin quán
   Tài đã điền trong tool.
3. **Tự so trước khi gửi.** Dựng → chụp bằng Chrome ở đúng khổ ảnh gốc → đặt cạnh nhau và chồng lên nhau → sửa chỗ lệch →
   lặp. Chỉ gửi Tài khi chồng lên nhau gần như trùng.
4. **Tệp thừa khách gửi** (ảnh không có trong bản thiết kế, ảnh xấu): không dùng, báo lại một dòng.
5. **Thứ không có sẵn** (font Tài chưa gửi, hình lạ): vẽ lại bằng vector theo ảnh, nét phải **đầy đặn như bản gốc**, không
   mảnh hơn; so ở độ phóng 8 lần. Font thật luôn thắng hàng vẽ tay: hỏi Tài file font trước khi vẽ.

## Luôn có trên mọi trang

- **Chọn ngôn ngữ ở trên cùng** (góc trên, không đè hình chính).
- **Dòng pháp lý nằm trong trang**, bố trí như một phần của thiết kế (cuối khúc A, màu hợp nền), không để nền tảng tự thêm ở
  ngoài rìa. Khúc A dài ra để chứa nó; ảnh nền ngắn hơn khúc thì nối bằng bản mờ của chính ảnh đó (`extend: "blur"`), cùng màu
  nền lấy từ đáy ảnh.
- **Máy bay giấy** luôn có; chọn góc màn hình (`side`) không đè hình, nút, và chừa chỗ cho khối sự kiện sau này ở khúc A.
- **Hiệu ứng vào cho mọi phần tử**, lần lượt từ trên xuống (khung → trang trí → chữ lớn → nút Google → chữ nhỏ → link), cách nhau
  ~100 ms; vuốt lên xuống là phần tử chạy lại hiệu ứng khi quay vào màn hình.
- **Nút Google nổi khỏi nền** (`shadow: "lift"` mặc định trên nền ảnh; `hard` + `shade` khi thiết kế có bóng khối màu). Cỡ nút
  theo ảnh chụp.

## Chất "premium"

- **Bóng đổ phải có hình**: bóng sàn dưới thẻ là một dải đậm ở giữa, mép trên sắc, nhạt dần xuống dưới và ra hai bên — không
  phải một thanh xám đều màu.
- **Viền thẻ kính**: gradient nhẹ (trắng → trong → xanh nhạt → trắng, 135°), không viền trắng phẳng.
- **Kính mờ** phải mờ thật phía sau (blur ~16); kiểm bằng ảnh chụp, vì một lỗi nhỏ là kính thành trong suốt.
- **Ruy băng, sticker, icon trang trí**: dùng tệp trong kho (`public/tpl/`) để giống hệt và đỡ công vẽ lại.
- **Kho chi tiết nhỏ** (`lib/canvas/stickers.json`, xem ở `/gov/kho`): sao lấp lánh, tim, mặt cười, dấu vẽ tay — mỗi cái đổi màu theo
  quán, xoay nhẹ (`r` ±8–15°) để không cái nào giống cái nào, `grain` cho chất sáp màu. Rải thưa: 3–5 cái mỗi màn hình, to nhỏ khác
  nhau, một màu nhấn và một màu phụ. Thiếu kiểu nào thì vẽ thêm vào kho, đừng vẽ riêng trong trang.
- **Nền bột phấn = cọ** (kiểu Sentry, vẽ như app trên iPad, không như code): kho chỉ lưu **thông số cọ** (`lib/canvas/brushes.json`:
  độ dày hạt, cỡ hạt, độ toả, độ cụm, lớp mờ); **màu luôn suy từ quán**. Chấm 3–5 lần to nhỏ chồng nhau như phấn trang điểm
  (`bot-xit` phủ rộng → `bot-may` → `bot-vet` → `bot-cham`, `bot-hat` rắc trên cùng), `o` 0,4–0,75, đặt lệch ra ngoài mép màn hình.
  `bot-hat` màu kem, `blend: "screen"`, `o` ~0,15 phủ cả trang là hạt phim cho chất retro.
- **Ánh sáng làm trang dễ chịu, thân thuộc** — trang nào cũng có nguồn sáng:
  - **Đèn ấm**: `glow` màu ấm của quán, `blend: "screen"`, đặt ở một góc (thường trên trái) và sau vật chính (biển hiệu, logo).
  - **Cầu vồng** (`cau-vong`, `cau-vong-xoan`): dải phổ **mảnh, mép sắc**, ít thôi (1–2 dải), quanh vật chính; dải ở xa thì `blur`
    nhẹ cho như lệch tiêu cự. Mắt không nhận ra ngay, chỉ thấy "premium" và tự nhiên.
  - **Vệt sáng** (`vet-sang`) mảnh, chéo nhẹ. Không vẽ chấm halftone làm ánh sáng — đó là hoạ tiết riêng, chỉ dùng khi ảnh mẫu có.

## Hiệu ứng động

- Nguồn tìm hiệu ứng: **uiverse.io** (MIT), cách tìm và luật lấy ở `docs/nguon-hieu-ung.md`. Chỉ hiệu ứng tự chạy / chạm được.
- Mỗi trang: nút Google có `shine` (vệt sáng quét thưa, màu nhạt của quán), logo tròn có thể `xu`, `hat-bay` nhẹ quanh thẻ chính.
  Thưa và chậm — hiệu ứng gây chú ý, không gây rối.
- Đồng xu (`xu`): mặt sau **để trống** (đĩa trơn), không lộ chữ ngược (Tài 07/10, "rất thích").
- Quán có nhiều ảnh khách/không gian: dùng **ảnh lật** (`image.flip`, 3–6 ảnh) trong khung polaroid — mỗi ~4,6 giây lật mép, ảnh sau
  thế chỗ, vệt sáng lướt qua; sau lưng đặt **đèn ấm thở** (`glow` + `loop: "pulse"`, `blend: "screen"`), một dải cầu vồng nhỏ trôi nhẹ
  và một sao lấp lánh, cho khu vực ảnh nổi nhẹ mà không lấn nút Google.

## Khi lời nhắn không nói đủ (mặc định của mình)

- **Màu ánh sáng theo thương hiệu của quán**, không theo ảnh mẫu: ảnh mẫu cho khung và *cảm giác* (mạnh, sang, ấm), quán cho màu.
  Mẫu xe RIMBERIO dùng cam đỏ cho cảm giác mạnh; quán 21 Detailing logo xanh → đèn xanh, giữ độ tương phản cao và đèn đỏ có sẵn trong
  ảnh (đèn hậu) làm điểm nhấn. Cam đỏ là một lựa chọn trong "Chọn nhanh", không tự áp.
- Tên quán dạng chữ: thay logo ảnh "phèn" bằng **chữ mảnh, giãn rộng** (Montserrat 200, giãn ~34) + một nét vẽ nhỏ phía trên.
- **Khúc B có nội dung thì khúc A phải mời xuống**: dòng "Các dịch vụ của chúng tôi", ô "Bảng giá", mũi tên nhảy nhẹ, và gợi ý
  "Kéo xuống để khám phá thêm" (`fx.hint`). Bảng giá: thẻ 2 cột, đầu thẻ chữ đậm nghiêng, giá căn phải, viền màu thương hiệu,
  ghi "giá tham khảo".
- **Safari và Chrome** khác chiều cao màn hình đầu (Safari iPhone có thanh địa chỉ ở dưới, Chrome có hai thanh): giữ mọi thứ quan
  trọng trên vạch 560 đơn vị, khúc đầu tự dài theo màn hình, không đặt gì sát đáy khúc A.
- Ô **Ghi chú** ở Bàn dựng có "Chọn nhanh" (`lib/canvas/prompt-choices.json`): mức sát mẫu, màu và mức ánh sáng, cầu vồng, nền,
  vật chính, chữ, nút, icon, hiệu ứng, khúc B, giọng chữ. Học thêm điều gì hay hỏi thì thêm vào đó.

## Chữ premium (21 Detailing, 07/10)

- Tên quán sang: `geo` (Josefin Sans) mảnh 300, **giãn rộng tới gần sát hai mép**; dòng phụ phía trên khác hẳn kiểu chữ — `elegant`
  (Cormorant) mảnh, giãn rộng, **không đậm** (vd "PREMIUM CARE"). Hai dòng không bao giờ cùng một font.
- Nút Google trên nền tối: `shadow: "halo"` (phát sáng trắng) thay vì làm nổi vật chính.
- Nút phụ phải "nghiêng ngả, sắc nét": `tag` nghiêng có con trỏ, TikTok `glitch` (hai mép lệch xanh/đỏ), Zalo `card` gần vuông với
  icon `zalo-oa`. Bảng giá dạng **vé** (`ve`, uiverse zeeshan_2112) — một cột, số thứ tự, tên dịch vụ chữ chuyển màu, giá bên cuống vé.
- Logo phụ dáng xe trong kho (`xe-*`, `canh-cua`, `ngua-hi`), không vẽ lại mỗi lần.

## Nút của quán và tệp của quán (07/10)

- **Nút mạng xã hội luôn sinh từ thông tin quán** (`t: "links"`): điền bao nhiêu link thì hiện bấy nhiêu nút, chưa điền thì không có,
  không có link nào thì cả cụm ẩn. Không vẽ tay từng nút mạng xã hội nữa. Kiểu: `icons` (hàng dấu), `pills`, `rows`; `style` mau/net/dac.
- Bàn dựng có ô thả theo vai: Poster · Nền · Logo · Logo phụ · Ảnh quán · Ảnh phụ (lật) · Font chính · Font đặc biệt · Âm thanh nền.
  Đặt tệp theo đúng vai: poster/video lên đầu trang, ảnh phụ vào khung lật, font đặc biệt cho tên/tiêu đề (`rieng-dac-biet`), font chính
  cho chữ thường (`rieng-chinh`, không có thì tự chọn), âm thanh thành nút loa (mặc định tắt).
- Logo trên nền trắng: tách nền bằng cách xoá phần nền **nối với mép ảnh** (giữ chữ trắng bên trong); ảnh PNG trong suốt thì **không**
  đặt `shadow` (bóng sẽ thành hình chữ nhật).
- Mây: `may-troi` (ba lớp trôi, màu từ các điểm của gradient); bầu trời đêm: `sao-troi`.

## Icon

- Mỗi dấu thương hiệu có biến thể (`/gov/kho`): màu thật · nét `-net` (theo màu chữ, hợp trang tối giản) · đặc · tròn/vuông. Chọn
  theo chất trang; nút Google chọn dấu bằng `mark`. Ghim `maps-giay` (mảnh ghép) chỉ cho kiểu giấy/collage; mặc định dùng `maps` sạch.
- **Link website luôn gạch chân** (nền tảng tự làm, ở mọi kiểu nút và chữ có `slot: "website"`).

## Tâm lý khách theo ngành

- Mỗi ngành trong `lib/canvas/loi-moi.json` có `moment` (khách chạm thẻ lúc nào) và, khi đã dựng quán thật, `tamLy` + `trinhBay`
  (khách đang nghĩ gì, trang nên nói gì). Đọc trước khi viết chữ phụ. Ví dụ cà phê: khách vừa gọi món, đang **chờ nước** — đừng
  "cảm ơn đã ghé"; chào đúng lúc chờ, rủ **tạo dáng chụp ở góc đẹp hôm nay**, lời mời viết cảm nhận nhẹ cho lúc đã uống.

## Trang không được trống trải

- Chỗ trống thì lấp bằng: icon/sticker trong kho, lớp bột phấn, ảnh poster hoặc ảnh quán (khung polaroid nghiêng), ánh sáng, hoạ tiết phụ.
- **Dòng pháp lý to hơn** (cỡ 12–13) và **xuống dòng** cho cân, như một phần của thiết kế.
- **Quanh nút Google có câu mời hợp ngành** (`lib/canvas/loi-moi.json`, 20 ngành + dùng chung): câu "trên:" phía trên nút, câu nhẹ phía
  dưới. Luôn trung lập: không hỏi hài lòng trước, không nhắc sao, không gợi nội dung, không ép "ngay" — test `tests/contracts/loi-moi.spec.ts`
  kiểm mọi câu.

## Khung và màu (bộ 6 mẫu, 06/10)

- **Lấy khung, không lấy màu.** Ảnh mẫu Tài gửi cho biết bố cục, nhịp, kiểu chi tiết; màu luôn lấy từ **ảnh tham chiếu của quán**
  (mặt tiền, biển hiệu, logo): rút 6–8 màu chủ đạo, chọn một màu nền, một màu thẻ, **một màu nhấn** (ở Bamos: xanh của logo) cho
  thẻ ló, chữ viết tay, tim, dấu cộng.
- **Phần khung chung của cả 6 mẫu:** chọn ngôn ngữ góc trên phải; logo tròn + tên quán in đậm; một câu mời/cảm ơn nhỏ; nút Google
  trắng, chữ G, mũi tên bên phải; các mạng xã hội cùng một kiểu (dòng có mũi tên hoặc ô vuông có icon); pháp lý gạch chân ngay dưới;
  ô nhắn riêng ở đáy (ở mình là máy bay giấy + lời mời).
- **Chi tiết tạo "hồn":** chữ viết tay nghiêng (tiếng Anh ngắn, 3–4 dòng) cạnh khung chính, tim/dấu cộng lấp lánh rải thưa, một quầng
  sáng mờ góc trên và góc dưới đối nhau, bóng đổ sâu dưới thẻ.
- **Logo quán:** có ảnh biển hiệu mà mờ thì vẽ lại logo bằng vector (chữ + biểu tượng), đặt trong vòng tròn sáng có viền tối.

## Đã học từ các lần sửa

| Ngày | Tài nói | Luật |
|---|---|---|
| 06/10 | Nút Google "chưa nổi bóng để nổi bật khỏi nền" | Nút Google luôn có bóng, mặc định `lift`; núm "Bóng nút Google" ở Bàn dựng |
| 06/10 | "Mặc định không đưa thêm gì ngoài mẫu screenshot" | Luật 2 ở trên; @tên chỉ có dấu @ khi ảnh có |
| 06/10 | Pháp lý "đừng bỏ ngoài rìa" | Dòng pháp lý trong khúc A, nền nối mờ |
| 06/10 | Viền thẻ mờ "gradient một chút, sinh động hơn" | Viền gradient cho thẻ kính |
| 06/10 | "Hiệu ứng luôn phải có khi vuốt lên xuống" | Mọi phần tử có hiệu ứng vào, chạy lại khi vuốt |
| 06/10 | Bóng đổ chưa "premium", chữ vẽ tay chưa đầy đặn | Mục "Chất premium"; luật 5 |
| 07/10 | "Học cách và lưu lại các chi tiết nhỏ"; nền "crayon, khói mờ" của Sentry | Kho chi tiết + cọ bột phấn (mục Chất premium) |
| 07/10 | Bột phấn "giống dựng bằng code"; lưu thông số chứ không lưu màu | Cọ vẽ vảy hạt bằng canvas, chỉ lưu thông số cọ |
| 07/10 | Ánh cam + cầu vồng kiểu 4RAU; chấm chấm là hoạ tiết ghép, cầu vồng phải mảnh sắc, mờ được | Mục "Ánh sáng" |
| 07/10 | Trang trống thì phải lấp; pháp lý to, xuống dòng; câu mời theo bối cảnh quán | Mục "Trang không được trống trải" |
