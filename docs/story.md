# Câu chuyện của nền tảng

Tài muốn một nơi ghi **lịch sử hình thành**: không phải nhật ký kỹ thuật (đã có `decisions.md`), mà là **vì sao** nền tảng thành ra như vậy, những lần rẽ hướng, những nguyên tắc sinh ra từ đâu. Bản chính có thể nằm ở Obsidian; tệp này là bản gốc trong dự án để người mới vào đội đọc. Agent chỉ ghi điều có trong tài liệu và lịch sử commit; phần cảm xúc, lý do riêng là của Tài viết thêm.

## Ý tưởng gốc

Một tấm thẻ NFC đặt ở quán. Khách chạm, mở ra một trang mang thương hiệu của quán: mời đánh giá Google, và cho khách một lối **nói riêng với quản lý**. Chủ quán có một dashboard để thấy khách nói gì, và làm gì với điều đó.

## Các chặng (theo `decisions.md` và git)

- **09/09/2026** — Chốt quyết định sản phẩm và kiến trúc MVP; repo GitHub đầu tiên. Nguyên tắc có từ ngày đầu: **lời mời Google giống hệt nhau ở mọi mức sao**; điểm thấp được thêm kênh riêng nhưng không giấu Google.
- **10–14/09** — App local, rồi xây nền nghiêm túc theo từng lát nhỏ: hợp đồng chấm sao thuần, kho PostgreSQL, API, phía trình duyệt (phiên 15 phút, hàng đợi, Safari trên iPhone thật), góp ý riêng, publishing (nháp, xem trước, phát hành, chữ ký trang), dashboard chủ shop và tải dữ liệu.
- **15/09** — Antigravity tiếp nhận, Astra rà bảo mật; mở đường deploy.
- **16/09** — Preview chạy thật trên Vercel + Neon. Chốt **mô hình thương mại**: giá theo chi nhánh và theo thẻ đang hoạt động, "khoá giữa" khi quá hạn để khách của quán không bao giờ bị phạt. Tầng admin tách hẳn khỏi chủ shop; **mạo danh phải để lại dấu vết và cần chủ shop cho phép** ("khách hàng là thượng đế").
- **17/09** — Làm lại trang khách và dashboard từ ảnh mẫu của Tài: shop template "YOUR SHOP", video nền, góp ý không cần sao. Chốt **không điền sẵn sao sang Google**, **không làm QR** giai đoạn này.
- **18/09** — Nút máy bay và thẻ góp ý, số gọi lại, dashboard kiểu bảng điều khiển, trình chỉnh giao diện, công tắc hỗ trợ 4 vị trí, R2 cho ảnh và video, thẻ NFC mã 5 ký tự. Tối cùng ngày: hồ sơ kiểu kênh YouTube, **đội ngũ và vai kiểu Discord**, lịch sử hoạt động có ⌘K. Admin mang danh **@Quitesensational · Admin Tài** với tick tím — "chủ server Minecraft thỉnh thoảng ghé chơi".
- **19/09** — Góp ý thành **luồng bình luận kiểu YouTube**, bỏ trạng thái xử lý; chuông @; ảnh tĩnh cho video trên iPhone và Android. **Production mở** ở `quitesensational-review-bio.vercel.app`. Báo cáo tổng quan đầu tiên: nền tốt, chưa đủ điều kiện bán.
- **20/09** — Tài biến báo cáo thành danh sách lát (`roadmap-slices.md`), đặt **luật cứng Google** (`google-policy.md`), và nêu ý **nền tảng của sự tò mò** (`ideas-curiosity.md`): khách quét không chỉ để đánh giá, mà để xem quán hôm nay có gì.

## Những nguyên tắc và nơi chúng sinh ra

- **Không chọn lọc, không ưu đãi, không ép** — từ ngày đầu, củng cố bằng chính sách Google 04/2026.
- **Dữ liệu là của shop** — admin không bao giờ tải dữ liệu của shop, ở mọi khấc (16/09).
- **Mọi thứ để lại dấu vết** — sổ admin, lịch sử hoạt động, bản cũ của phản hồi đã sửa.
- **Không ai biết mật khẩu của người khác** — link đặt mật khẩu dùng một lần cho chủ shop, thành viên, cả tài khoản template trên production.
- **Tò mò là sức mạnh** — Tài, 20/09.

## Về tên

`quitesensational` — trùng tên Instagram cá nhân của Tài (chọn 16/09); tên miền đầu tiên `quitesensational-review-bio.vercel.app`, `.com` mua sau.
