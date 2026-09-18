# Làm lại trang khách và dashboard — thiết kế — 2026-09-17

Tài chốt trong buổi brainstorm 17/09, dựa trên hai ảnh trang review (tràn màn hình và dạng thẻ), ba màn dashboard (Dữ liệu · Thiết kế giao diện · Sản phẩm & link) và một video nền. Tiến độ từng lát ghi ở cuối file.

## Quyết định

| Chủ đề | Chốt |
|---|---|
| Khuôn nhân bản | **Một shop khuôn riêng, tên trung tính "YOUR SHOP"**, chỉ dùng để nhân bản. Nút Tạo shop sao chép **cấu hình** của khuôn, không bao giờ sao chép dữ liệu. `caphe-demo` (thật ra là 4Rau Barbershop) là một shop bình thường, không phải khuôn |
| Thêm bàn | **Một trang, nhiều thẻ.** Mỗi bàn là một thẻ `/t/<mã>` có nhãn. Sửa nút một lần là áp cho mọi bàn; số liệu tách theo bàn ở mục "Nguồn thẻ" |
| Dashboard | **Theo mẫu, không tùy biến.** Ba tab và ô chuyển shop, giống nhau cho mọi shop. Phần tùy biến nằm ở trang khách |
| Bố cục trang khách | Hai lựa chọn: **tràn màn hình** (đang có) và **dạng thẻ** (gọn hơn) |
| Google | **Luôn là nút nổi bật nhất**, có chữ nhấn như bản cũ. Không điền sẵn số sao (chốt 17/09) |
| Phản hồi riêng | Nút **luôn hiện**, **gửi được khi chưa chấm sao**. API đã đổi ở lát B1 |
| Video nền | File mp4 Tài gửi (720×1280, 20 giây, H.264, 3 MB). Tạm đặt trong mã nguồn làm nền mặc định của khuôn cho tới khi có R2 |
| QR | Không làm |

## Hành vi trang khách v2

1. **Thứ tự:** poster (nhãn "POSTER SỰ KIỆN") → logo tròn đè lên mép poster → tên thương hiệu → câu hỏi → 5 sao → **nút Google** → nút phản hồi riêng → hàng nút mạng xã hội (Instagram, Facebook, Zalo, Liên hệ, link).
2. **Chấm 4–5 sao:** không có gì thay đổi. Nút Google vẫn là trọng tâm.
3. **Chấm 1–3 sao:** nút phản hồi riêng **mở rộng** thành một khung riêng gồm hai ô: "Điều bạn muốn chia sẻ" (chủ đề) và "Góp ý của bạn". Trang chỉ cuộn vừa đủ để thấy khung, và **nút Google vẫn phải nằm trong màn hình** (Tài chốt 17/09).
4. **Chạm ra ngoài khung:** khung thu gọn lại thành nút "Gửi góp ý riêng cho quản lý". Bấm nút lại thì khung mở ra.
5. **Gửi xong:** hiện popup cảm ơn kiểu 3D nảy (giống hiệu ứng trên Canva) kèm pháo giấy. Dự kiến dùng `canvas-confetti` (MIT, nhỏ); popup chỉ cần CSS. Người đã bật "giảm chuyển động" thì bỏ hiệu ứng, chỉ hiện chữ cảm ơn.
6. **Bấm Google:** khách rời sang Google như hiện tại.
7. **Về sau:** khi khách đã xong phần đánh giá **nội bộ**, trang chuyển sang một màn "Cảm ơn quý khách", rồi trở lại bình thường khi hết phiên 15 phút.
8. **Chuyển động:** video nền chạy lặp, không tiếng, phát trực tiếp trong trang (`playsinline`). Có ảnh tĩnh thay thế khi iPhone ở chế độ tiết kiệm pin; có chế độ tĩnh cho người đã bật "giảm chuyển động".

### Hai giới hạn đã nêu với Tài

- **Không thể biết khách đã đăng review Google hay chưa.** Google không gửi tín hiệu nào về. "Đánh giá xong" chỉ có thể là đánh giá **nội bộ** (sao và góp ý). `AGENTS.md` cấm suy ra việc khách đã review Google.
- **Nguyên tắc gốc:** điểm thấp được mở phản hồi riêng **nhưng không được giấu Google**. Nếu tự cuộn làm nút Google trôi khỏi màn hình ngay lúc khách chấm 1–3 sao, thì đó chính là dẫn khách chê ra khỏi Google, tức "review gating" mà Google cấm (hình phạt là xoá review của quán). Tài chốt giữ nút Google trong màn hình (mục 3 ở trên).

## Dashboard mới

Theo ảnh mockup. Khung chung gồm logo NFC Feedback, ô "Shop đang xem" (một tài khoản quản nhiều shop) và ba tab.

- **Dữ liệu:** thẻ số lớn (lượt mở, phiên, đã chấm sao), biểu đồ 7 ngày vẽ bằng CSS (không thêm thư viện), Nguồn thẻ theo nhãn. Danh sách góp ý và xử lý giữ như hiện tại. Nút tải JSON/CSV **chỉ dành cho chủ shop**.
- **Thiết kế giao diện:** bố cục (tràn/thẻ), poster, logo, nền (màu, gradient, video), watermark, âm thanh popup (sau), nút và đường dẫn. Có Lưu nháp · xem trước đúng bản sẽ phát hành · Phát hành. Tầng thư viện (`PublishingAdmin`: nháp, xem trước, phát hành) đã có sẵn.
- **Sản phẩm & link:** sửa nút và link; tự tạo thẻ cho bàn mới (có nhãn), lấy link `/t/<mã>` để ghi vào NFC; kích hoạt thẻ (`prepared → tested → active`). **Giá tính theo thẻ active**, nên giao diện phải báo trước chi phí khi kích hoạt.
- **Công tắc hỗ trợ 4 vị trí** (xem `commercial-model.md` mục 8) nằm trong dashboard; chỉ vai `owner` gạt được.

## Cần đổi schema (có version)

- `layout`: thêm `card`.
- Icon: thêm `facebook`, `phone`. Link `tel:` cho nút Liên hệ; hiện `url()` chỉ nhận `https:`.
- ~~Phản hồi riêng không cần sao trước~~: xong ở lát B1 (migration 010).
- ~~Shop khuôn~~: xong ở lát A (migration 009).
- Công tắc 4 vị trí: migration mới, chỉ thêm, giữ nguyên lịch sử của migration 008.

## Thứ tự lát

| Lát | Nội dung |
|---|---|
| A | Shop khuôn "YOUR SHOP", Tạo shop sao chép từ khuôn, video nền mặc định |
| B | Trang khách v2: hai bố cục, nút mới, phản hồi riêng không cần sao, khung mở/thu gọn, popup cảm ơn — **xong 17/09** (B1 + B2) |
| C | Dashboard mới: khung, ô chuyển shop, tab Dữ liệu |
| D | Tab Thiết kế giao diện và công tắc 4 vị trí |
| E | Tab Sản phẩm & link: nút, thẻ theo bàn, kích hoạt thẻ |

Tải ảnh và video riêng cho từng shop cần **Cloudflare R2**; đó là việc Tài còn treo.

## Lát A — shop khuôn — xong 2026-09-17

- **Migration 009:** cột `shops.is_template` và unique index cho tối đa một khuôn. Rollback từ chối khi khuôn đang tồn tại.
- `ShopProvisioning.ensureTemplate()` tạo khuôn "YOUR SHOP" với `templateConfig()`: cấu hình mặc định cộng nền là video Tài gửi. Nút Tạo shop sao chép **bản phát hành đang chạy** của khuôn, rồi thay tên và link Google của shop mới. Khuôn được đọc **trước** khi ghi bất cứ thứ gì cho shop mới.
- Sửa khuôn thì các shop tạo **sau đó** theo cấu hình mới; shop tạo trước giữ nguyên. Không sao chép lượt ghé, thẻ hay chủ shop.
- Video nằm ở `public/media/stem-background.mp4` (3 MB), kèm ảnh tĩnh `stem-background.jpg`. Validator nhận đúng **hai đường dẫn nội bộ này**, và mỗi đường dẫn chỉ với loại media của nó; mọi media khác vẫn phải là `https`.
- `/gov`: nút **Tạo shop khuôn** (hiện khi chưa có khuôn); dòng khuôn ghi **KHUÔN**, không có chủ, không có nút; số "Shop đang có" không đếm khuôn.
- **Chưa thấy video trên trang khách.** Renderer hiện tại chưa vẽ nền, watermark, logo hay nút từ cấu hình; lát B làm việc này. Ngoài ra preview đang tắt `NFC_PUBLISHING_ENABLED`, nên trang khách vẫn chạy đường cũ, không đọc cấu hình.
- Chưa có: sửa khuôn trong giao diện (lát D). Hiện khuôn chỉ sửa được qua thư viện.
- **Tài khoản test của khuôn** (Tài yêu cầu 17/09): `yourshop` / `1`, tạo bằng nút ở `/gov`, dùng để vào dashboard của khuôn. Mật khẩu yếu **có chủ ý**, bỏ qua mức tối thiểu 12 ký tự, nên **production từ chối cấp** (`TEST_ACCOUNT_FORBIDDEN`). Gọi lại chỉ gắn lại tài khoản vào khuôn, không đặt lại mật khẩu. Shop nhân bản từ khuôn không mang theo tài khoản này. **Phải đổi khi siết mật khẩu hàng loạt.**
- **`caphe-demo` (4Rau) bỏ, Tài chốt 17/09.** Không làm nút "Phát hành từ khuôn". Khi bật publishing, trang đó hiện "Trang chưa sẵn sàng"; dữ liệu cũ giữ nguyên. Mọi chỉnh sửa làm trên khuôn.
- **Việc tiếp theo trước lát B:** bật `NFC_PUBLISHING_ENABLED=true` cho môi trường Preview trên Vercel, rồi push một commit để deploy lại.
- Chỗ trải nghiệm còn thiếu, để lát C xử lý: chủ shop A đang đăng nhập mà mở dashboard shop B thì thấy "Không thể mở dashboard", không có lối đăng nhập bằng tài khoản khác.

## Lát B1 — góp ý không cần sao — xong 2026-09-17

Tài duyệt phạm vi 17/09, chia lát B làm hai: B1 (máy chủ) và B2 (giao diện). Tài cũng chốt: **tự viết pháo giấy**, không thêm `canvas-confetti`; **giữ khung "POSTER SỰ KIỆN"** khi shop chưa có poster.

- **Migration 010** (`010_feedback_without_rating.sql`): `rating_experiences.rating` và `rating_intent_receipts.score` được để trống. Hai ràng buộc mới: experience phải có sao **hoặc** góp ý; receipt loại `rating` **luôn** có sao. Rollback từ chối (`UNRATED_FEEDBACK_PRESENT`) khi đã có góp ý không sao.
- **Luật ghi:** góp ý đầu tiên gửi `expectedRevision: 0`, tạo experience `rating: null`, revision 1, `firstInteractionAt` là lúc gửi góp ý. Chấm sao sau đó dùng revision 2, giữ nguyên góp ý. Receipt của góp ý ghi số sao **tại thời điểm đó**, có thể trống. `RATING_REQUIRED` bị bỏ ở mọi tầng.
- **Nguồn release** (`experience_origin_contexts`) ghi ở **lượt ghi đầu tiên**, dù là sao hay góp ý. Trước đây chỉ ghi ở lượt chấm sao đầu, nên phiên góp ý trước sẽ mất nguồn.
- **API công khai:** `experience.rating` có thể là `null` ở response mở trang và gửi góp ý. Response chấm sao vẫn bắt buộc có sao; client từ chối response chấm sao không có sao. Không echo nội dung góp ý, như cũ.
- **Số liệu:** "Trải nghiệm chấm sao" chỉ đếm phiên có sao; điểm trung bình bỏ qua phiên không sao. Phiên chỉ có góp ý vẫn tính vào "Có góp ý riêng" và "chưa xử lý", xử lý được như thường. Dashboard hiện "Chưa chấm sao". Export: `rating` là `null` và được khai `nullable`.
- **Giao diện hiện tại** chỉ sửa đủ để gửi góp ý khi chưa chấm sao; B2 vẽ lại toàn bộ.
- **Triển khai:** Tài phải **migrate Neon (production và preview) trước khi push**. Mã cũ đọc được schema mới vì chưa có dòng nào không sao; mã mới ghi dòng không sao nên cần schema mới trước.

## Lát B2 — giao diện trang khách v2 — xong 2026-09-17

Tài chốt trước khi làm: **ưu tiên xong nhanh, test nhanh, sửa nhanh**; lỗ hổng bảo mật và back-end sẽ do Astra rà và vá sau. Nguyên tắc sản phẩm vẫn giữ.

- **Schema cấu hình v2** (`lib/publishing/config.ts`): thêm bố cục `card`, nút `facebook` và `phone`. Chỉ nút `phone` nhận link `tel:` (chữ số, có thể có `+`, 3–15 số); mọi nút khác vẫn phải `https`. `defaultConfig()` giờ tạo v2. Bản phát hành v1 vẫn hợp lệ và hiển thị như thường, nhưng không dùng được các phần mới. `template_versions.schema_version` vẫn là 1: đó là phiên bản khuôn trong database, không phải phiên bản cấu hình, và đổi nó thì cần migration.
- **Khuôn trên preview vẫn là v1** (tạo ở lát A). Shop nhân bản từ khuôn cũng mang cấu hình v1 cho tới khi khuôn được lưu lại bằng editor (lát D).
- **Trang khách** (`components/shop-feedback-v2.tsx`, `guest-page.css`, `confetti.ts`):
  - nền màu, gradient hoặc video (chạy lặp, không tiếng, `playsinline`, có ảnh tĩnh). Máy bật giảm chuyển động thì không render video, chỉ hiện ảnh tĩnh. Chỉ video có sẵn trong app mới có ảnh tĩnh; video tải lên khác rơi về nền màu;
  - watermark "YOUR LOGO" trôi chéo, đứng yên khi giảm chuyển động;
  - khung "POSTER SỰ KIỆN" khi chưa có poster; logo tròn đè mép poster, chưa có logo thì hiện chữ cái đầu của tên shop;
  - nút Google là điểm nhấn duy nhất, **giống hệt nhau ở mọi mức sao**, link đúng như cấu hình (không kèm số sao);
  - chấm 1–3 sao: khung góp ý mở ra, trang cuộn vừa đủ để thấy khung nhưng **không bao giờ để nút Google ra khỏi màn hình**; nếu nút Google đang ở dưới mép thì cuộn cho thấy nó;
  - chạm ra ngoài thì khung thu lại, chữ đang gõ vẫn giữ. Chạm vào sao, nút mở khung, hoặc vùng trạng thái / nút thử lại **không** tính là ra ngoài;
  - gửi góp ý xong: popup cảm ơn nảy kiểu 3D kèm pháo giấy tự viết (không thêm thư viện); tự đóng sau 2,8 giây hoặc khi chạm bất kỳ đâu; giảm chuyển động thì chỉ hiện chữ;
  - hàng nút mạng xã hội lấy từ cấu hình; link `https` mở tab mới, `tel:` gọi thẳng.
- **Test** (`integration-tests/publishing.spec.ts`): Google trong màn hình ở cả hai bố cục, với 375×548 và 320×460 (vùng nhìn thấy của Safari trên iPhone SE sau khi trừ thanh công cụ); khung thu/mở giữ nháp; popup và pháo giấy, bản giảm chuyển động; media, watermark, poster, logo, nút; bản v1 vẫn hiển thị.
- **Chưa làm:** màn "Cảm ơn quý khách" sau khi xong đánh giá nội bộ (mục 7), âm thanh popup, sửa cấu hình trong giao diện (lát D). Danh sách chủ đề góp ý vẫn là của tiệm cắt tóc (`lib/copy.ts`).

## Lát B3 — nút máy bay và thẻ góp ý — 2026-09-18

Tài thử B2 trên iPhone ngày 17/09 rồi đổi hướng. Agent nêu trước: không được thiết kế để khách chấm 1–3 sao rời trang thay vì vào Google (review gating). Bố cục mới **tuân thủ tốt hơn**, vì trang chính không hỏi sao trước nút Google nữa.

**Tài chốt:**
- **Trang chính bỏ 5 sao.** Còn: poster → logo → tên → nút Google → các nút của shop.
- **Nút máy bay** kiểu Telegram, **không có nền tròn**: chỉ hình máy bay tô màu, có viền, nổi nhẹ ở góc dưới trái. Nó không gửi qua Telegram, góp ý vẫn vào dashboard. Chủ shop đổi được kiểu icon (máy bay, bong bóng chat, phong bì), màu và màu viền (`feedbackButton` trong schema v2); giao diện chỉnh làm ở lát D. Sau khi gửi, icon không đổi.
- **Chú thích** "Có điều gì muốn nhắn riêng cho quán?" / "Anything to tell us privately?" hiện **2 giây sau khi khách cuộn chạm đáy trang**, một lần rồi ở lại. Trang ngắn hơn màn hình thì tính là đã ở đáy ngay từ đầu. Chú thích hiện như nhau cho mọi khách; không nhắm vào khách chấm thấp.
- **Thẻ góp ý** kiểu spotlight: nền phía sau tối và mờ, trang không cuộn, Esc hoặc chạm nền để đóng; chữ và sao chưa gửi vẫn giữ.
  - Thẻ gồm: "Gửi góp ý riêng cho quản lý", "Bạn cảm thấy thế nào?" kèm 5 sao, chủ đề, ô góp ý, nút Gửi.
  - Chạm sao thứ *n*: *n* ô đầu cùng thành emoji của mức *n* (😡 😤 😕 😊 🤩), các ô sau là sao trống. Hiệu ứng lò xo dùng `linear()`, ô sau trễ 40ms so với ô trước.
- **Sao chỉ lưu khi bấm Gửi.** Đã bỏ việc lưu ngay mỗi lần chạm. API chấm sao vẫn giữ, vì nút Gửi dùng nó: gửi sao trước, rồi gửi chữ. Gửi được khi **có ít nhất sao hoặc chữ**.
- **Gửi xong:** thẻ chuyển sang "Cảm ơn bạn nhé, chúng tôi biết ơn vì đóng góp từ phản hồi của bạn" kèm pháo giấy, và **chỉ đóng khi khách bấm Đóng** (bản B2 tự đóng sau khoảng 1 giây trên iPhone, vì chạm để cuộn cũng làm popup đóng).
- **Nhấn nút:** mọi nút và link lún còn 96%; nút máy bay lún còn 70% rồi nảy lại khi thả. Nút Google, nút gửi và các nút mạng xã hội có lớp sáng và bóng kiểu Apple.
- **Nút mặc định** của mọi trang mới: Instagram `https://www.instagram.com/quitesensational/`, Zalo `https://zalo.me/0961036265`, TikTok `https://www.tiktok.com/@taidoan450`. Link TikTok bỏ phần theo dõi `?_r=1&_t=…` trong link Tài gửi. Logo vẽ lại đơn giản bằng SVG.
- **`/gov` có nút "Đưa khuôn về mặc định mới":** phát hành `templateConfig()` hiện tại thành release mới cho khuôn, có ghi sổ `template.reset`. Shop đã tạo trước đó giữ nguyên trang của mình.
- Số điện thoại gọi lại (C) làm ở **lát B4** vì cần migration.

**Còn lại:** câu hỏi cấu hình `text.question` không còn hiện trên trang; thẻ dùng câu cố định "Bạn cảm thấy thế nào?". Script Safari chạy tay (`integration-tests/safari-local.mjs`) vẫn giả định sao trên trang chính, nên đã lỗi thời.

## Lát B4 — số điện thoại gọi lại — 2026-09-18

- **Migration 011** (`011_feedback_phone.sql`): cột `feedback_phone` ở `rating_experiences` và `rating_intent_receipts`. Số phải là 8–15 chữ số, có thể có `+` ở đầu, và chỉ có khi có góp ý. Rollback từ chối (`FEEDBACK_PHONE_PRESENT`) khi đã lưu số nào.
- **Thẻ góp ý:** ô "Số điện thoại, nếu muốn quản lý gọi lại", **không bắt buộc**, chữ mờ trong ô "Chỉ quản lý của quán thấy số này". Dấu cách, chấm, gạch và ngoặc khách gõ được bỏ đi. Có số mà chưa viết chữ thì thẻ nhắc viết vài dòng, vì góp ý (chữ) là bắt buộc khi để lại số.
- **Lưu:** số đi cùng góp ý. Chấm sao sau đó giữ nguyên số; sửa góp ý mà không nhập số thì số bị xoá khỏi trạng thái hiện tại, còn biên nhận cũ vẫn giữ. Số là một phần nội dung khi so lần gửi lại (idempotency). API không bao giờ trả số về.
- **Ai thấy:** chủ shop và quản lý (dashboard hiện "Số gọi lại", bấm để gọi); admin chỉ thấy khi chủ shop cho phép đọc góp ý, vì ở phạm vi tổng quan server xoá số cùng nội dung góp ý. File export của chủ shop có cột `phone` (có thể trống); admin vẫn không bao giờ export được.
- **Triển khai:** Tài phải migrate Neon (production và preview) **trước khi push** B4.

## Lát C — khung dashboard mới — 2026-09-18

- **Khung:** tên NFC Feedback, **ô "Shop đang xem"** (chỉ hiện khi tài khoản có từ hai shop; đổi shop là chuyển sang `/ZZZ/<slug>` của shop đó) và **ba tab**: Dữ liệu · Thiết kế giao diện · Sản phẩm & link. Hai tab sau nói rõ đang được làm (lát D và E) và ẩn hẳn phần dữ liệu khi đang mở.
- **Tab Dữ liệu** giữ nguyên bộ lọc, thẻ số, danh sách góp ý, xử lý và tải dữ liệu, thêm:
  - **Bảy ngày gần nhất:** cột vẽ bằng CSS, mỗi cột là số lượt mở theo ngày giờ Việt Nam; ngày không có gì vẫn hiện. Phần này **không theo bộ lọc**, vì nó trả lời "tuần này thế nào". Chạm vào cột để xem số phiên và số lượt chấm sao.
  - **Nguồn thẻ:** số phiên theo nhãn thẻ trong đúng bộ lọc đang áp, kèm phần trăm.
- **Ai thấy gì:** danh sách shop để chuyển chỉ gồm shop tài khoản còn quyền (`active`). Quản trị viên đang xem thay mặt **chỉ thấy đúng shop được phép**, không thấy các shop khác của chủ shop đó.
- Trang "Không thể mở dashboard" giờ có lối **đăng nhập bằng tài khoản khác** (chỗ thiếu đã ghi ở lát A).
- Chưa làm: nội dung thật của hai tab kia; biểu đồ chưa có lựa chọn khoảng thời gian khác.

## Tài khoản test của khuôn — sửa 2026-09-18

Tài không đăng nhập được `yourshop` / `1` trên preview. Không đọc được database của Tài nên không xác định được nguyên nhân trong ba khả năng: tài khoản chưa có, mật khẩu không phải `1`, hoặc bị khoá vì thử quá 8 lần trong 15 phút. Vì vậy `/gov` có thêm nút **"Đặt lại tài khoản test (yourshop / 1)"**, xử lý cả ba: đặt lại mật khẩu, bật lại tài khoản và quyền chủ shop trên khuôn, xoá luôn bản đếm chặn đăng nhập của tên đó. Ghi sổ `template.account.reset`. Vẫn bị từ chối trên production (`TEST_ACCOUNT_FORBIDDEN`) vì mật khẩu cố tình yếu.

Điều này thay quy tắc cũ "gọi lại không bao giờ đặt lại mật khẩu": nút **Tạo** vẫn không đặt lại, nút **Đặt lại** thì có, và chỉ hiện khi khuôn đã có tài khoản.
