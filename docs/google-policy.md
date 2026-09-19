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
8. Nội dung marketing trên trang khách (sự kiện, trò chơi, ưu đãi — xem `ideas-curiosity.md`) **không được phụ thuộc** vào việc khách có bấm Google hay không, và **không đặt cạnh** nút Google theo kiểu gợi ý trao đổi.
9. Không tự động đăng, không đăng hộ, không "giúp khách viết" đánh giá bằng AI.
10. Không lấy chỉ số "số đánh giá Google tăng" làm mục tiêu hiển thị cho nhân viên. Số liệu Google (khi nối API) chỉ hiển thị cho chủ shop, ghi rõ là **ước đoán**.

## 3. Việc shop phải làm và không làm (đưa vào hướng dẫn một trang khi bàn giao shop)

**Nên:** đặt thẻ ở chỗ khách tự thấy (bàn, quầy); câu mời trung lập kiểu "Cảm nhận của bạn giúp quán tốt hơn"; trả lời mọi đánh giá, kể cả đánh giá chê, lịch sự; dùng phần góp ý riêng để xử lý vấn đề thật.

**Không:** đứng chờ khách đánh giá, cầm điện thoại khách, đưa máy của quán; tặng món, giảm giá, bốc thăm cho người đánh giá; giao chỉ tiêu cho nhân viên; nhờ nhân viên, người nhà đánh giá; nhắn khách sửa đánh giá xấu để đổi quà; chạy chiến dịch làm số đánh giá tăng vọt trong vài ngày.

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
