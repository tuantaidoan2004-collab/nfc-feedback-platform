# Chính sách Google về đánh giá — luật cứng của sản phẩm

Tài yêu cầu 2026-09-20: một tệp gom mọi thứ Google cấm, để **không một shop nào dùng nền tảng này bị Google phạt, ẩn hay khoá hồ sơ doanh nghiệp**. Mọi lát, mọi ý tưởng marketing, mọi câu chữ trên trang khách phải qua được tệp này trước khi làm. Khi mâu thuẫn với một yêu cầu khác, **tệp này thắng**.

**Nói thật về "100%":** không ai bảo đảm được 100%. Bộ lọc tự động của Google Maps đôi khi ẩn cả đánh giá thật (ví dụ đánh giá tăng đột ngột). Việc của nền tảng là **không bao giờ tạo ra vi phạm**, và **không để shop vô tình tạo ra vi phạm** qua công cụ của mình. Phần còn lại (shop tự làm ngoài nền tảng) chỉ giảm được bằng hướng dẫn.

## 1. Google cấm gì (nguyên văn tinh thần, nguồn ở cuối)

**Nội dung giả, chênh lệch lợi ích**
- Đánh giá không dựa trên trải nghiệm thật.
- Đánh giá **được trả tiền, trực tiếp hay bằng hiện vật**.
- Một người đăng từ **nhiều tài khoản**; đăng từ **thiết bị dùng chung** (máy tính bảng, điện thoại của quán đưa khách dùng).
- Đánh giá của **nhân viên, chủ, người có quan hệ hợp đồng, người nhà**.
- Đánh giá xấu vào **đối thủ**.

**Ưu đãi (incentive)**
- **Mọi** ưu đãi đổi lấy đánh giá hay số sao: tiền, giảm giá, món miễn phí, quà, điểm thưởng, lượt quay, lượt bốc thăm.
- Đề nghị ưu đãi để khách **sửa hay xoá** đánh giá xấu.

**Chọn lọc và cản trở (review gating)**
- **Chỉ mời khách được dự đoán sẽ khen**; hỏi trước "bạn hài lòng không" rồi mới dẫn người hài lòng sang Google.
- **Ngăn cản hay làm nản** khách chê.

**Áp lực và chỉ tiêu (cập nhật 04/2026)**
- **Ép hay gây áp lực** để khách đánh giá **ngay tại quán**.
- **Giao chỉ tiêu số đánh giá** cho nhân viên.
- Yêu cầu đánh giá có **nội dung định trước**, kể cả **nhắc tên nhân viên**.

**Hậu quả:** tạm khoá nhận đánh giá mới · xoá đánh giá · **biển cảnh báo công khai** "đã xoá đánh giá giả" trên hồ sơ · giảm hiển thị · **khoá hoặc vô hiệu hoá vĩnh viễn** hồ sơ doanh nghiệp khi lặp lại.

**Được phép:** mời **mọi** khách một cách **trung lập**, qua kênh của mình (thẻ NFC, mã QR, hoá đơn, tin nhắn), không kèm ưu đãi, không định nội dung.

## 2. Luật cứng của nền tảng (không lát nào được phá)

1. **Nút Google giống hệt nhau với mọi khách**, luôn nằm trong màn hình, **trước và độc lập** với câu hỏi sao. Đã có từ lát B; test bảo vệ trong `public-v2.spec.ts`, `publishing.spec.ts`.
2. **Không hỏi sao trước rồi mới hiện Google.** Không dẫn khách chấm thấp rời trang. Góp ý riêng là **thêm** kênh, không **thay** Google.
3. **Không điền sẵn số sao** sang Google (chốt 17/09).
4. **Không có tính năng nào nối ưu đãi với đánh giá Google**: không "đánh giá để nhận quà", không mã giảm giá sau khi bấm Google, không bốc thăm cho người đã đánh giá, không điểm thưởng theo đánh giá.
5. **Không có bảng xếp hạng hay chỉ tiêu đánh giá Google theo nhân viên**, không gắn tên nhân viên vào lời mời.
6. **Không có chế độ "máy của quán"** để khách đánh giá trên thiết bị dùng chung (kiosk, máy tính bảng trên quầy).
7. **Không gợi ý nội dung** cho đánh giá Google (không câu mẫu, không từ khoá, không "hãy nhắc tên…").
8. Nội dung marketing trên trang khách (sự kiện, trò chơi, ưu đãi — xem `ideas-curiosity.md`) **không được phụ thuộc** vào việc khách có bấm Google hay không, và **không đặt cạnh** nút Google theo kiểu gợi ý trao đổi. Kể cả popup cảm ơn trước khi sang Google và lúc khách quay lại tab cũ (27/09): chỉ lời cảm ơn, không ưu đãi, không nội dung chỉ dành cho người đã bấm.
9. Không tự động đăng, không đăng hộ, không "giúp khách viết" đánh giá bằng AI.
10. Không lấy chỉ số "số đánh giá Google tăng" làm mục tiêu hiển thị cho nhân viên. Số liệu Google (khi nối API) chỉ hiển thị cho chủ shop, ghi rõ là **ước đoán**. Cưỡng chế từ 05/10 (khi có số thật từ tool Google Maps): máy chủ trả điểm và tổng số đánh giá Google **chỉ cho vai chủ quán** (`lib/google/business.ts` `status`, `lib/owner/overview.ts`); thành viên có quyền góp ý vẫn đọc từng đánh giá ở Data. Test trong `repository-tests/onboarding.spec.ts`.

## 2b. Một sản phẩm thật đang bán đúng thứ mục 2 cấm (22/09/2026)

Tài gửi một quảng cáo của tài khoản `gmb.vault` bán thẻ NFC cho quán. Nội dung quảng cáo, nguyên văn ba gạch đầu
dòng: *"Branded page · **Filters bad reviews privately** · Owner sees every tap."* Ảnh chụp trang của một tiệm cắt
tóc ở Lublin: hỏi **"Bạn chấm mấy sao?"** trước, ai chấm một sao thì được đẩy sang ô **"Gửi riêng cho ông chủ"**.

Đây là **lọc đánh giá** — đúng nghĩa đen, và họ lấy nó làm câu bán hàng chính.

Ghi vào đây vì ba lý do:

1. **Nó phá luật 1 và luật 2 cùng lúc.** Hỏi sao trước, rồi dùng số sao để quyết định khách thấy gì tiếp theo.
2. **Nó chứng minh thị trường đang làm như vậy**, nên sẽ có lúc một người bán cạnh tranh, hoặc chính một chủ quán,
   hỏi Tài vì sao nền tảng mình không có tính năng đó. Câu trả lời đã có sẵn ở mục 1: Google cấm, và hình phạt rơi
   xuống **hồ sơ doanh nghiệp của quán**, không phải xuống người bán thẻ. Người bán biến mất, quán ở lại chịu.
3. **Nó là lợi thế bán hàng, không phải điểm yếu.** "Nền tảng của tôi không lọc đánh giá, vì lọc là thứ làm Google
   phạt quán anh" là một câu bán hàng mạnh hơn "nền tảng của tôi cũng lọc được".

Không lát nào được lấy sản phẩm này làm tham chiếu tính năng. Lấy làm tham chiếu **giao diện** thì được.

## 3. Việc shop phải làm và không làm (đưa vào hướng dẫn một trang khi bàn giao shop)

**Nên:** đặt thẻ ở chỗ khách tự thấy (bàn, quầy); câu mời trung lập kiểu "Cảm nhận của bạn giúp quán tốt hơn"; trả lời mọi đánh giá, kể cả đánh giá chê, lịch sự; dùng phần góp ý riêng để xử lý vấn đề thật.

**Không:** đứng chờ khách đánh giá, cầm điện thoại khách, đưa máy của quán; tặng món, giảm giá, bốc thăm cho người đánh giá; giao chỉ tiêu cho nhân viên; nhờ nhân viên, người nhà đánh giá; nhắn khách sửa đánh giá xấu để đổi quà; chạy chiến dịch làm số đánh giá tăng vọt trong vài ngày.

## 3b. Nền tảng cưỡng chế được cái gì, và không cưỡng chế được cái gì (lát F-013, 21/09)

Astra tìm ra 20/09: nhãn nút link vốn là **chữ tự do**, nên shop publish được *"Đánh giá Google 5 sao để nhận quà"* và *"Khi đánh giá Google hãy nhắc tên nhân viên An"*. Cả hai qua `validateConfig` và render thật. Vi phạm luật 4, 5, 7, 8.

**Đã đóng được (hàng rào):** nhãn nút link giờ **chọn từ danh sách trung lập** trong `lib/publishing/policy.ts`. Không chữ nào khác publish được, ở bất kỳ ngôn ngữ nào. Danh sách **được phép nới** khi shop cần một nút chính đáng — điều kiện duy nhất là nhãn mới phải tự nó trung lập, và có test kiểm đúng điều đó.

**Chỉ chặn được một phần (dây bẫy):** tên quán và câu hỏi là chữ tự do thật. Nền tảng từ chối khi một từ về *đánh giá* đứng cùng một từ về *quà/ưu đãi* hoặc lời nhờ *nhắc tên*. Khớp theo **từ**, không theo chuỗi con, và bỏ dấu.

**Nói thẳng giới hạn:** dây bẫy này **không** bắt được shop cố tình viết vòng, không đọc được chữ trong **ảnh hay video**, không theo được link rút gọn, và không biết shop nói gì **ngoài** nền tảng. Đừng hứa ngược lại với shop hay với luật sư. Phần còn lại dựa vào hướng dẫn ở mục 3 và rà thủ công.

**Chỗ kiểm:** biên **ghi** (`saveDraft`, `createDraft`, `publish`), **không** ở biên đọc. Trang đã phát hành vẫn chạy; luật thêm hôm nay không làm sập trang phát hành hôm qua. Có test riêng cho đúng điều này.

## 3c. Nút Google chỉ dẫn tới Google (lát A7, 26/09)

Trước A7, link của nút Google chỉ cần `https://`. Một shop trỏ được nút "Đánh giá trên Google" sang **trang riêng của
mình** hỏi sao trước rồi chỉ cho người khen sang Google — tức lọc đánh giá (luật 1, 2) đi qua chính nút của nền tảng.
Giờ `googleUrlProblem` (`lib/publishing/policy.ts`) chỉ nhận **host của Google** theo danh sách (Maps, `g.page`,
`maps.app.goo.gl`, `search.google.com/local/…`, đường `/maps` và `/search` của `google.com(.vn)`…), và từ chối tham số
điền sẵn sao hay câu chữ (`rating`, `stars`, `text`…; luật 3, 7). Cố ý **không** nhận mọi tên miền con của `google.com`:
`sites.google.com` là trang ai cũng dựng được, `google.com/url?q=` chuyển hướng đi bất cứ đâu. Kiểm ở biên ghi (trình
chỉnh, tạo trang, phát hành, tạo shop ở `/gov`), không ở biên đọc. Danh sách được nới khi shop có link Google chính
đáng bị chặn — một dòng.

**Hướng dẫn cho shop (mục 3) giờ có ba chỗ:** trang in được `/huong-dan-google` (gửi kèm link đặt mật khẩu lúc bàn
giao — khung bàn giao ở `/gov` nhắc), khung "Mời đánh giá Google đúng luật" ở trang chủ dashboard, và dòng chỉ chỗ lấy
link Google trong trình chỉnh.

## 4. Kiểm trước mỗi lát (checklist)

- [ ] Lát này có chạm trang khách hay nút Google không? Nếu có: nút Google vẫn giống nhau với mọi khách, vẫn trong màn hình, vẫn độc lập với sao?
- [ ] Có ưu đãi, quà, điểm, trò chơi nào không? Nếu có: **không** điều kiện nào liên quan tới Google.
- [ ] Có số liệu, bảng xếp hạng nào theo nhân viên không? Nếu có: **không** có đánh giá Google trong đó.
- [ ] Có câu chữ nào gợi nội dung đánh giá hay tạo áp lực không?
- [ ] Test bảo vệ luật cứng liên quan đã có hoặc đã thêm?

## Nguồn

- [Google Maps User-contributed Content Policy — Prohibited & restricted content](https://support.google.com/contributionpolicy/answer/7400114)
- [Tóm tắt cập nhật chính sách đánh giá 04/2026 (Launchcodex)](https://launchcodex.com/blog/seo-geo-ai/google-business-profile-review-policy-update/)
- [Review gating theo Google và FTC (SOCi)](https://www.soci.ai/knowledge-articles/review-gating/)
