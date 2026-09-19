# Ý tưởng: nền tảng của sự tò mò — Tài nêu 2026-09-20

**Chưa phải thiết kế đã chốt.** Đây là ý gốc của Tài, cộng nhận xét của agent, để các lát sau bám theo. Mọi phần ở đây phải qua `google-policy.md`.

## Ý của Tài

> "Không nên coi thường sự tò mò của con người." Bình thường không ai mở landing page của một chuỗi cà phê — để làm gì chứ? Tôi muốn khách **thấy thẻ hay mã QR ở đâu cũng muốn quét**: để đánh giá Google, để xem bio của quán, hay chỉ để biết **quán đang có gì mới**. Một platform mini: khách quét là biết quán này thú vị ra sao, dựa trên chính chủ quán đăng.
>
> Ví dụ: trang hiện "Trong quán đang có một bé thú nhồi bông đang trốn. Tìm được bé thì bạn sở hữu bé — bé là độc nhất." Bé nhồi bông là chiến lược marketing: khách có thêm trải nghiệm, thêm câu chuyện để kể.
>
> Và platform có thể thành **thương hiệu**: khách đi đâu thấy dấu hiệu của tôi là muốn quét.

## Nhận xét của agent

**Hướng đúng, và mạnh hơn "thẻ review".** Đổi câu hỏi của khách từ "quét để làm gì?" sang "quét xem hôm nay có gì?". Thẻ review chỉ được quét khi khách đã muốn đánh giá; thẻ "có gì mới" được quét **mỗi lần ghé**. Lượt quét nhiều hơn thì lời mời Google (vẫn trung lập, vẫn giống nhau với mọi khách) được nhìn thấy nhiều hơn một cách **tự nhiên**, không cần ép, không cần thưởng. Đây là cách duy nhất tăng đánh giá mà vẫn sạch với Google.

**Giữ sạch với Google — ranh giới bắt buộc:**
- Trò chơi, quà, sự kiện **không bao giờ** yêu cầu, gợi ý hay thưởng cho việc đánh giá Google. "Tìm bé nhồi bông" là trò của quán; ai tìm được thì nhận, **dù có đánh giá hay không**.
- Không đặt câu kiểu "đánh giá xong hãy tìm bé", không gom người đánh giá vào danh sách nhận quà.
- Nút Google giữ nguyên vị trí, nguyên câu chữ, độc lập với phần sự kiện.

**Luật khác cần xem khi làm:** quà có giá trị, bốc thăm, "có thưởng" có thể là **khuyến mại** theo Luật Thương mại (có khi phải thông báo hay đăng ký với Sở Công Thương tuỳ hình thức và giá trị). Trò "ai tìm thấy trước thì được" đơn giản thường nhẹ nhất; bốc thăm may rủi thì cần hỏi luật sư. Nội dung shop đăng cần kiểm duyệt nhẹ (luật quảng cáo, hình ảnh).

## Hình dung sản phẩm (để các lát sau chia nhỏ)

1. **"Hôm nay ở quán"** trên trang khách: một thẻ nội dung ngắn chủ shop đăng (ảnh, 1–2 câu, hạn hiển thị). Đã có sẵn nền: poster, trình chỉnh, nháp, phát hành, R2.
2. **Nhiều loại thẻ nội dung:** sự kiện, món mới, câu chuyện, trò chơi "săn" (vật được giấu, gợi ý theo ngày), bình chọn vui (không liên quan Google).
3. **Lịch nội dung:** chủ shop hẹn giờ bật/tắt; hết hạn thì tự ẩn.
4. **Số liệu:** bao nhiêu người mở thẻ nội dung, bấm gì tiếp (Instagram, Zalo, Google…). Đây là dữ liệu "khách thích gì" Tài muốn, gộp ở cấp shop, không định danh.
5. **Dấu thương hiệu của nền tảng** trên mọi thẻ, mã và trang: một biểu tượng nhỏ, nhất quán, để khách nhận ra "chỗ này có trò". Cần thiết kế nhận diện trước.
6. **Về sau:** một trang tổng hợp "quanh đây có gì" (các quán dùng nền tảng đang có sự kiện) — hiệu ứng mạng lưới; chỉ làm khi đủ nhiều shop và có chính sách nội dung.

## Thương hiệu và bảo hộ

- **"Bản quyền" và "nhãn hiệu" khác nhau.** Mã nguồn, thiết kế trang, văn bản **tự có quyền tác giả** khi tạo ra (đăng ký với Cục Bản quyền tác giả là tuỳ chọn, giúp làm bằng chứng). **Tên và logo** của nền tảng được bảo vệ bằng **nhãn hiệu**, phải **đăng ký** với **Cục Sở hữu trí tuệ**; Việt Nam theo nguyên tắc **ai nộp trước được trước**.
- Nên nộp **sớm**, trước khi đi bán rộng, ít nhất các nhóm: **9** (phần mềm), **35** (quảng cáo, marketing), **42** (dịch vụ phần mềm/SaaS). Hiệu lực 10 năm, gia hạn được. Thời gian xét thường kéo dài hơn một năm, nhưng quyền tính từ ngày nộp.
- Trước khi nộp: tra trùng trên thư viện số của Cục Sở hữu trí tuệ và WIPO Global Brand Database; cân nhắc tên cụm từ tiếng Anh thông dụng ("quite sensational") có thể bị coi là thiếu phân biệt — **nhờ luật sư sở hữu trí tuệ** chọn dạng nộp (chữ, logo, hay kết hợp).
