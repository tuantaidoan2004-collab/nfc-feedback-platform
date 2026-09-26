# C3 — rà cách ly dữ liệu giữa các quán (Claude, 26/09/2026)

Việc này chuyển từ Astra sang Claude ngày 22/09 (`agents-board.md`, "C3 mất chủ"). **Điểm yếu đã biết:** người rà là
người viết mã, không có bên độc lập. Cách bù theo bảng điều phối: mỗi đường nghi ngờ phải có test; đường nào thủng thì
**test đỏ trước, sửa sau**. Khi có bên rà độc lập (người thật hoặc agent khác), mặt trận 1 nên được làm lại.

## Đã làm

**1. Quét tĩnh mọi câu SQL** trong `lib/owner/`, `server/`, `lib/repositories/`: câu nào chạm bảng của quán mà không có
`shop_id` trong điều kiện thì đọc tay. 21 câu bị đánh dấu; 20 câu an toàn vì id đã được kiểm thuộc đúng quán ngay trước
đó trong cùng transaction (bình luận qua `comment()`, vai qua `role()`, ca góp ý sau khi kiểm phiên của quán, xoá dữ liệu
theo mã băm năng lực, chuông theo `user_id` và thành viên còn hoạt động, trang nguồn qua `pageOf`).

**2. Cổng của 59 route:** mọi route `/gov/api` qua `AdminAuth.access` (2FA) hoặc tự kiểm phiên bên trong (đăng nhập, bật
2FA, mở phiên hỗ trợ); mọi route ghi của chủ quán qua `ownerOrigin`; mọi route chủ quán qua `authorize` theo slug.

**3. Ma trận test** `repository-tests/tenant-isolation.spec.ts` — quán một tấn công quán hai, quán hai có đủ dữ liệu
thật (lời khách + số điện thoại, thẻ, bình luận, vai, thành viên, trang thứ hai, thông báo):
- **Gọi thẳng link quán hai** ở 30 cửa của dashboard (số liệu, ghi chú ca, mức hỗ trợ, thẻ, trình chỉnh, trang, tạm
  dừng, bình luận, nhóm, vai, lịch sử, tải ảnh, xuất dữ liệu): cửa nào cũng `403 ACCESS_DENIED`.
- **Đứng ở quán một, đưa id của quán hai** (thẻ, bình luận, phiên góp ý, vai, thành viên, trang, thông báo; lọc theo bản
  phát hành, theo thẻ; con trỏ phân trang mang id phiên quán hai): không tìm thấy, không đọc được, không đổi được gì.
- Mọi lần đọc của quán một — số liệu, tóm tắt, thẻ, trang, nhóm, lịch sử, **cả bốn loại xuất dữ liệu** — không chứa lời
  khách hay số điện thoại của quán hai.
- Nhắc `@` một người ngoài quán không báo cho người đó; không đánh dấu đã đọc được thông báo của người khác.
- Sau tất cả, ảnh chụp dữ liệu quán hai **y nguyên**.

## Phát hiện và đã sửa

**F-C3-1 · Thấp · Bộ đếm chống bot đếm theo id lượt ghé mà không kiểm quán** (`server/guest-limits.ts`, trước bản sửa
dòng 102). Request từ trang quán A mang id lượt ghé của quán B làm tăng bộ đếm `visit:<id>` của B. Đẩy qua trần thì
lần gửi tiếp theo của chính khách quán B bị từ chối (429). Cần biết id lượt ghé (UUID ngẫu nhiên, chỉ trình duyệt của
khách biết) nên khó khai thác, nhưng là ghi chéo quán. **Test đỏ trước**: `visit-v2-api.spec.ts` ca "a visit of another
shop, named from this shop's page, counts nothing" — đỏ với `attempts: 1`, xanh sau bản sửa. Sửa: chỉ đếm theo lượt ghé
khi lượt ghé thuộc đúng quán, phạm vi, lối vào của request. Việc **đánh dấu nghi bot** lên phiên người khác thì không
xảy ra được: chỉ đánh dấu sau một lần ghi thành công, mà ghi bằng lượt ghé người khác luôn bị từ chối.

## Chưa rà — nói thẳng

- **Mặt trận 2 (đường ghi trang khách)** chỉ rà phần bộ đếm ở trên; phát lại intent, đua tab, revision giả đã có test từ
  lát A1/B nhưng chưa rà lại dưới góc tấn công.
- **Mặt trận 3 (media/R2)**: chưa rà. Các điểm Astra nêu 20/09 vẫn mở — quota tổng, không kiểm byte thật sau khi tải,
  hạn và phát lại của link ký, thu hồi quyền sau khi đã ký.
- **Phiên hỗ trợ của admin** và **link đặt mật khẩu** chỉ dựa vào test sẵn có (F-007, F-008, impersonation), không viết
  thêm trong lượt này.
- Mã cũ (`app/api/owner/[shop]`, `app/api/shops/[shop]/experience`) dùng cơ chế đăng nhập đời đầu — gỡ ở lát dọn A3.
- Không có kiểm thử từ ngoài (HTTP thật, header giả, cookie của quán khác trên trình duyệt) ngoài những gì harness đang
  làm.
