# Mô hình thương mại và tầng admin — chốt 2026-09-16

Tài chốt trong phiên brainstorm 16/09. Đây là **quyết định đã duyệt**, không phải đề xuất. Phần còn để mở được ghi riêng ở cuối. Chưa có dòng code nào cho tài liệu này; toàn bộ là thiết kế.

Giá tính bằng VND, **chưa thuế**. Tài chưa đăng ký kinh doanh; nghĩa vụ thuế/hoá đơn xử lý sau, không nằm trong phạm vi tài liệu này.

## 1. Cấu trúc URL

Một shop có **một slug, hai đường**, không phải hai tên rời:

| Đường | Dùng cho |
|---|---|
| `/<slug>` | trang khách, link chia sẻ (bio Instagram, Zalo OA) |
| `/ZZZ/<slug>` | dashboard chủ shop |
| `/t/<mã>` | **in lên thẻ NFC và QR** |

Lý do dùng một slug suy ra hai đường thay vì hai tên lưu riêng: hai tên rời sẽ có ngày gắn lệch nhau và chủ shop A mở dashboard ra thấy dữ liệu shop B. Dashboard suy ra từ slug thì không có chỗ nào để nhập sai. Ngoài ra `slug` đã cấm `api`,`zzz`,`t`,`demo`,`_next`; nếu dashboard nằm phẳng cùng cấp thì phải giành chỗ cho mọi tên dashboard. Header bảo mật trong `next.config.ts` cũng đang áp theo tiền tố `/ZZZ/:path*` và `/api/owner/v2/:path*`.

Tiền tố `ZZZ` đổi được, nhưng **phải là một tiền tố cố định**.

### Thẻ in mã, không in tên

Slug là tên và tên sẽ đổi (rebrand, sang nhượng). Thẻ in `/<slug>` thì đổi tên là **toàn bộ thẻ đã in thành rác**. `tags.public_code` là mã vô nghĩa 8 ký tự, cố định vĩnh viễn, và còn cho biết khách quét từ vị trí nào (`location_label`) — đúng bảng "Nguồn thẻ" trong mockup.

**Đã kiểm chứng: đổi slug an toàn.** Không bảng nào ngoài `shops` lưu `slug`; mọi lịch sử (visit, rating, góp ý, receipt, release, tag) tham chiếu `shops.id` kiểu uuid. `slug` chỉ là khoá tra cứu tại `lib/publishing/repository.ts:94`.

Do đó: khi generate, slug là **mã ngẫu nhiên**; sau này shop muốn tên đẹp thì đổi bằng một nút trong admin, thẻ không bị ảnh hưởng.

### Tên miền

Tài chọn **`quitesensational`** (trùng tên Instagram cá nhân). Đuôi chưa chốt; `.app` là lựa chọn tốt vì nằm trong danh sách HSTS preload nên trình duyệt bắt buộc HTTPS ở tầng dưới.

Độ dài không phải vấn đề: `quitesensational.app/t/a1b2c3d4` ≈40 byte kể cả phần thừa NDEF, trên thẻ NTAG213 144 byte. URL này không ai gõ tay — khách chạm thẻ hoặc quét QR; chỗ duy nhất gõ là bookmark admin và bio shop (copy-paste).

Hai điểm đã nêu với Tài: tên gắn doanh nghiệp vào thương hiệu cá nhân (lợi thế giai đoạn đầu, cân nhắc khi sang nhượng), và nên mua thêm `.com` để chặn trùng tên. **Chưa kiểm tình trạng còn trống.**

## 2. Tách trạng thái vận hành khỏi trạng thái thương mại

Vấn đề gốc: `shops.publishing_state` hiện kiểm soát **ba** chỗ cùng lúc — trang khách (`repository.ts:97`), ghi visit (`visit-policy.ts:16`), dashboard (`owner/auth.ts:26`). Dùng `suspended` để khoá shop chưa trả tiền sẽ **giết luôn thẻ NFC trên quầy họ**: khách chạm vào thấy trang lỗi. Người bị phạt là khách, và hình ảnh xấu gắn với thương hiệu của Tài.

Một trường đang trộn hai nghĩa. Tách:

| Trường | Ai đổi | Nghĩa |
|---|---|---|
| `publishing_state` (đã có) | Admin, thủ công | Vận hành: `draft`/`active`/`suspended`. Dùng khi vi phạm, ngừng hợp đồng, shop đóng cửa |
| `paid_until` (mới) | Hệ thống thanh toán | **Chỉ là một ngày.** Không mang logic quyền |

Ba cổng đọc khác nhau — **khoá giữa**:

| Cổng | Điều kiện | Khi quá hạn |
|---|---|---|
| Trang khách | **chỉ** `publishing_state='active'` | **vẫn chạy**, khách không bị ảnh hưởng |
| Ghi visit | `active` **và** còn hạn | **ngừng ghi**, dữ liệu đứng lại |
| Dashboard | `active` **và** còn hạn | vào được, **chỉ xem lịch sử**, không sửa |

Kỷ luật bắt buộc: `paid_until` chỉ được là một ngày. Mọi cám dỗ thêm cột `is_locked` sẽ dẫn về đúng mớ một-trường-hai-nghĩa hiện tại. **Tiền quyết định ngày, cổng quyết định quyền.**

## 3. Bảng giá

Đơn vị tính là **chi nhánh**, không phải dashboard.

| Gói | Giá |
|---|---|
| Tháng dùng thử | **miễn phí**, tháng đầu |
| 1 tháng | **100k**/chi nhánh, gồm **5 thẻ active** |
| 1 năm | **1.000k**/chi nhánh (~83k/tháng, tiết kiệm 17%) |
| Thẻ active thứ 6–20 | **8k**/thẻ/tháng |
| Thẻ active thứ 21 trở đi | **5k**/thẻ/tháng |
| Chi nhánh thứ 2 trở đi | **giảm 20% phí nền** |

**Gói 3 tháng đã bỏ.** Ở mức 300k nó bằng đúng 3×100k: không tiết kiệm đồng nào mà khách mất quyền dừng, nên không ai chọn, chỉ làm bảng giá rối.

**Chỉ tính thẻ trạng thái `active`.** Bảng `tags` đã có `prepared`/`tested`/`active`/`disabled`; shop cất thẻ thì chuyển `disabled`, tháng sau không bị tính. Shop tự quản lý, admin đỡ việc.

Bậc giảm dần theo số thẻ phản ánh đúng kinh tế: thẻ thứ 20 trong cùng quán mang lại ít giá trị tăng thêm hơn thẻ thứ 2. Tính tuyến tính 10k/thẻ khiến 20 thẻ thành 200k, nghe quá đắt so với giá trị.

Thử trên bốn hồ sơ khách:

| Khách | Tuyến tính 10k/thẻ | **Bảng giá chốt** |
|---|---|---|
| Quán nhỏ 3 bàn | 130k | **100k** |
| Quán vừa 10 bàn | 200k | **140k** |
| Nhà hàng 25 bàn | 350k | **245k** |
| Chuỗi 3CN ×8 bàn | 540k | **332k** |

### Hỗ trợ shop nhỏ đã nằm sẵn trong cấu trúc giá

Tài hỏi có nên generate mã % để hỗ trợ doanh nghiệp nhỏ. **Không cần**: tính theo thẻ thì quán nhỏ tự động trả ít hơn (100k so với 245k). Phân biệt giữ kỷ luật:

- **Mã giảm giá** = một lần, có hạn, cho sự kiện
- **Bậc giá** = khác biệt lâu dài giữa nhóm khách

Nếu một nhóm khách **luôn luôn** cần giá thấp hơn thì đó là bậc giá, không phải mã. Dùng mã cho việc lâu dài sẽ phải phát lại mãi, doanh thu không dự báo được, và khách học được rằng cứ xin là có.

## 4. Chuỗi là nhiều shop, không phải một dashboard

**Ràng buộc sản phẩm, không phải lựa chọn giá:** mỗi chi nhánh có **địa điểm Google Maps riêng**, tức `googleUrl` riêng, mà `googleUrl` nằm trong `PageConfig` của từng shop. Gộp một dashboard thì khách ở chi nhánh này bị dẫn đi review chi nhánh khác — sai sản phẩm.

Kiến trúc đã sẵn sàng: `owner_memberships_v2` là bảng nối một tài khoản ↔ nhiều shop, nên chủ chuỗi đăng nhập một lần thấy mọi chi nhánh. Mockup đã có sẵn ô chuyển shop ở góc trên.

Hệ quả: chuỗi 3 chi nhánh = **3 gói**, không phải 1. Cảm giác "thu 1 gói cho cả chuỗi là quá thọt" xuất phát từ việc hình dung chuỗi là một dashboard, vốn không đúng ngay từ đầu.

## 5. Mã giảm giá

**Mã khai trương:** 50%, **chỉ áp cho gói 1 tháng**, **2 mã mỗi shop** — tương đương cho khách thử thêm 2 tháng nửa giá.

Luồng khách mới: tháng1 miễn phí → tháng2 50k → tháng3 50k → tháng4 trở đi 100k. Tài đã được nêu hai rủi ro và **chấp nhận giữ nguyên**:
- **Neo giá**: khách trải nghiệm 2 tháng ở 50k, tháng4 cảm thấy như tăng giá
- **Đường băng 3 tháng**: mỗi khách mới mất 3 tháng mới trả đủ, trong khi mô hình cần số lượng

Tài **từ chối** phương án đổi sang một mã 50% cho gói năm, lý do: mã gói năm mở cửa cho khách trả giá và năn nỉ.

**Mã sự kiện về sau:** có tính năng generate hàng loạt, chọn theo nhóm khách thân thiết. Tài cam kết giữ kỷ luật.

**Nguyên tắc bắt buộc — mã sự kiện chỉ dùng để lấy khách mới, không dùng cho gia hạn.** Lý do: khách biết dịp lễ có mã sẽ **để gói hết hạn rồi chờ sale mới gia hạn**. Tài mất doanh thu những ngày đó, phải xử lý một đống shop quá hạn, và làm khách của shop mất trải nghiệm. Giữ khách dùng **khoá giá**, không dùng mã lặp lại.

### Khoá giá

Khách **gia hạn năm liên tục** được giữ mức **giảm 17%** vĩnh viễn, kể cả khi Tài tăng giá với khách mới. Đây là cách hiện thực ý "mua năm quài thì giảm giá quài" mà không bóp méo thời điểm trả tiền. Thông điệp: *giá của anh không tăng chừng nào còn gia hạn liên tục* — vừa là ưu đãi, vừa là lý do đừng để đứt quãng.

## 6. Chu kỳ, ân hạn, vòng đời dữ liệu

- Tháng đầu **miễn phí**; từ tháng sau **trả trước mới dùng**, mọi gói.
- **Ân hạn 7 ngày**, áp cả cho tháng dùng thử. Quyền khoá có hiệu lực từ **đúng thời điểm hết hạn gói**; 7 ngày là chính sách vận hành, không phải quyền của khách.
- `grace_days` **để trong bảng, không hardcode**. Shop hay trễ hạ về 0, khách lâu năm nới thêm. Chính sách thành dữ liệu, đổi không cần deploy.
- Quá ân hạn: **đóng băng dữ liệu** (khoá giữa ở mục 2).
- **3 tháng không hoạt động** → hệ thống báo admin → Tài xoá dữ liệu theo chính sách an toàn thông tin.
- **Bản ghi gửi về email chủ shop** trước khi xoá, kèm nhật ký truy cập. Tài **chấp nhận** việc audit ghi lại cả lần chính mình vào xem cuối cùng, kể cả khi khách dùng nó để khiếu nại.

### Thẻ bán đứt, thuê bao riêng

Thẻ là **hàng hoá bán một lần**; thuê bao là **dịch vụ tháng**. Không trả tiếp thì mất dashboard, **không mất thẻ** — thẻ vẫn dẫn khách tới Google review. Khách có sẵn thẻ từ nguồn khác vẫn mua được dịch vụ. Tách bạch này phải nằm trong điều khoản để việc bán thẻ không bị kéo vào tranh chấp thuê bao.

## 7. Thanh toán

Giai đoạn đầu: **chuyển khoản + VietQR**. Không dùng cổng thẻ — phí ~2–3% trên 100k không đáng, thường yêu cầu đăng ký kinh doanh mà Tài chưa có, và thêm một bề mặt bảo mật. Tính lại khi đã đăng ký kinh doanh và đủ lượng khách.

**Kiến trúc bắt buộc — nguồn thanh toán phải cắm rời:**

```
Nguồn (bot | tay | sau này là thẻ)  →  BẢN GHI THANH TOÁN  →  paid_until
                                        (chuẩn duy nhất)
```

Bot chỉ là **một nguồn tạo bản ghi**; admin bấm tay tạo đúng loại bản ghi đó. Bot hỏng thì gõ tay, đổi nhà cung cấp không đụng phần quyền, thêm cổng thẻ sau chỉ là thêm một nguồn.

Bốn điều về bot biến động số dư:
1. Khoá khớp lệnh là **nội dung chuyển khoản**, và khách sẽ gõ sai hoặc chuyển từ tài khoản người khác. **Luôn phải có đường đối soát tay.**
2. Đó là bên thứ ba **đọc được giao dịch ngân hàng**. Cân nhắc thật.
3. Loại không chính thức hay hỏng khi ngân hàng đổi giao diện. Đừng để việc khoá/mở shop phụ thuộc hoàn toàn vào nó.
4. **Không bao giờ tự động gia hạn chỉ dựa trên số tiền.** Phải khớp mã + số tiền, ghi sổ cả lần khớp lẫn không khớp.

Agent không thiết lập cổng thanh toán và không nhập bất kỳ thông tin thanh toán nào.

## 8. Tầng admin

### Danh tính admin là bảng riêng, không phải cột role

Thêm `role='admin'` vào `owner_identities_v2` nghĩa là chủ shop và admin dùng **chung bảng, chung cookie, chung route** — một lỗi logic ở chỗ kiểm role là chủ shop thành admin, phơi toàn bộ shop. Bảng riêng, phiên riêng, cookie riêng, route riêng: chủ shop **không có đường nào** trở thành admin vì danh tính họ không tồn tại trong bảng admin.

**Mọi hành động admin phải ghi sổ bất biến** (tạo shop, khoá, nhân bản, phát thẻ, ghi nhận thanh toán). Dự án đã có tiền lệ `owner_feedback_audit` ghi actor/time không sửa được. Khi shop tranh chấp "tôi có trả tiền" hay "ai xoá trang tôi", sổ đó là thứ duy nhất trả lời được.

### Mạo danh — tách làm hai quyền

Tài chọn **ưu tiên bảo đảm quyền lợi cho khách**:

| Quyền | Dùng để | Độ nhạy |
|---|---|---|
| **Sửa cấu hình hộ** | poster, màu, link, câu hỏi | Thấp, dùng thường xuyên |
| **Đọc dữ liệu dashboard** | cohort **và góp ý riêng tư** | **Cao**, quyền riêng |

Góp ý riêng tư là dữ liệu nhạy cảm nhất hệ thống: khách viết cho **shop**, không cho Tài. Hầu hết việc hỗ trợ chỉ cần chỉnh giao diện.

Ba luật kèm theo:
1. Phiên mạo danh **có hạn giờ** (~30 phút), không phải quyền thường trực.
2. Audit phải ghi *"admin **thay mặt** chủ shop làm X"*, không được ghi thành *"chủ shop làm X"* — nếu không, sổ của chính chủ shop bị nhiễm và tranh chấp sau không gỡ được.
3. **Chủ shop nhìn thấy** dòng ghi đó. Nó bảo vệ Tài: khi shop nghi ngờ bị xem trộm, có bản ghi công khai để đối chiếu.

**Trạng thái:** quyền **đọc** đã làm, chỉ đọc, hai phạm vi `overview`/`feedback` — xem [admin-impersonation.md](admin-impersonation.md). Quyền **sửa cấu hình hộ** chờ lát editor.

### Chủ shop cấp quyền — Tài chốt 2026-09-16 (sau lát mạo danh)

Hướng "khách hàng là thượng đế": sau khi bàn giao, admin chỉ hỗ trợ **trong phạm vi chủ shop cho phép**.

| Việc của admin | Điều kiện |
|---|---|
| Xem tổng quan | **luôn được**, không cần xin phép. Mỗi lượt để lại dấu vết cho shop thấy; Tài mail báo khách trước khi vào. Lý do: cần xem tiến trình thật để cải tiến sản phẩm |
| Đọc nội dung góp ý | **chỉ khi chủ shop bật công tắc** |
| Sửa cấu hình hộ | cũng qua công tắc, làm cùng lát editor |
| Tải CSV/JSONL | **không bao giờ**, ở mọi phạm vi. Ẩn nút **và** server từ chối. Dữ liệu là của khách |

- Công tắc **chỉ bật/tắt, không hạn giờ**. Xong việc thì Tài nhắn khách tắt.
- **Chỉ tài khoản chủ shop (`owner`) được bật/tắt.**
- Giai đoạn setup, trước khi shop đặt mật khẩu: admin tạo trang khách + dashboard, nhập email cho tài khoản, và (khi có editor) chỉnh cấu hình đợt đầu. Không cần xin phép.
- Khi khách khiếu nại dữ liệu sai: chính **chủ shop tự export** rồi đối chiếu với lịch sử không sửa được (`rating_intent_receipts`). Admin không cần giữ dữ liệu. Đây cũng là cách Shopify (đối tác phải được chủ cửa hàng duyệt) và Google Cloud (Access Approval, Access Transparency) làm.

### Chốt thêm 2026-09-17

- **Không điền sẵn số sao sang Google.** Tài giữ nguyên nguyên tắc "lời mời Google giống hệt nhau ở mọi mức sao". Lý do: Google không có tham số chính thức cho việc này; chính sách Google cấm chủ động chỉ xin đánh giá tốt, nên dễ bị xem là dẫn dắt khách, và hình phạt là xoá review của quán.
- **Không làm mã QR** ở giai đoạn này. Dashboard chỉ hiện link trang khách, kèm nút Sao chép và Chia sẻ.

### Cần brainstorm trước khi xây (Tài nêu 2026-09-17)

Tài gửi ba màn mockup: Dữ liệu · Thiết kế giao diện · Sản phẩm & link, cùng ô chuyển shop.
- **Sản phẩm & link là của chủ shop:** tuỳ chỉnh nút (Instagram, Zalo…) và gắn link vào nút; **tự nhân bản trang review** khi thêm bàn, rồi tự làm thẻ NFC hoặc QR cho bàn đó.
- **Công tắc hỗ trợ 4 vị trí (Tắt + 3 khấc), chốt 2026-09-17.** Thay cho công tắc bật/tắt "đọc góp ý". Chỉ vai `owner` gạt được; không hạn giờ; mọi lượt admin vào đều để lại dấu vết cho shop thấy; **không khấc nào cho tải dữ liệu**.

| Vị trí | Admin xem số liệu tổng quan | Admin đọc nội dung góp ý | Admin sửa giao diện, nút & link |
|---|---|---|---|
| **Tắt** (mặc định) | có | không | không |
| **Khấc 1 · Xem** | có | **có** | không |
| **Khấc 2 · Sửa** | **không, ẩn hết dữ liệu** | không | **có** |
| **Khấc 3 · Toàn quyền** | có | có | có |

  - Hệ quả Tài đã chọn: ở khấc 2, admin thấy **ít dữ liệu hơn** cả khi công tắc Tắt. Luật "admin luôn xem được tổng quan" (16/09) có một ngoại lệ là khấc 2.
  - Quyền sửa của khấc 2 và 3 chỉ có tác dụng khi đã có editor. Trước đó, khấc 2 nghĩa là admin không xem được gì, còn khấc 3 tương đương khấc 1.
  - **Đã làm ở lát D (migration 012, 18/09):** 4 vị trí chạy thật, lịch sử bật/tắt cũ giữ nguyên (bật = khấc 1). Quyền sửa hộ đi qua phiên "Sửa giao diện"; xem [redesign-v2.md](redesign-v2.md) mục Lát D.

### Tài khoản phụ — hướng đã chốt, chưa làm

Một shop có thể có nhiều tài khoản vào cùng dashboard. Chủ shop có nút tạo tài khoản phụ với một trong hai vai:
- **Quản lý:** quản lý và điều hành.
- **Nhân viên:** chỉ xem và bình luận. Chỉ thấy nội dung góp ý của khách **nếu chủ shop cho phép** nhân viên đó.

Bảng `owner_memberships_v2` đã có `role` (`owner`/`manager`); vai nhân viên và quyền xem góp ý theo từng người là thay đổi schema của lát đó.

**Mỗi người một tài khoản, không phải một két nhiều chìa (Tài hỏi 2026-09-18).** Tài hỏi dashboard có nên như két sắt với nhiều cách mở khoá không. Không: nhiều chìa mở cùng một két thì không biết ai đã làm gì. Hướng chọn là **mỗi quản lý, nhân viên có ID và mật khẩu riêng**, cùng vào dashboard của shop, quyền theo vai. Hệ quả:
- **Lịch sử hoạt động:** mọi thao tác của người trong shop (ghi chú, đổi giao diện, phát hành, thêm/tắt thẻ, gạt công tắc, tạo tài khoản phụ) ghi một dòng **không sửa được**: ai (ID + tên tài khoản lúc đó), làm gì, trên cái gì, lúc nào. Cùng kiểu với `admin_audit` và lượt truy cập của quản trị đã có.
- **Tìm và lọc:** lọc theo người, loại thao tác, khoảng ngày; ô tìm kiểu Spotlight (⌘K, gõ tới đâu ra tới đó, tìm được cả chữ không dấu). **Không cần skill hay dịch vụ riêng**: phía server là PostgreSQL (`unaccent` + `pg_trgm`), phía giao diện là một bảng lệnh có phím tắt.
- **Ghi chú mang tác giả:** mỗi ghi chú lưu **ID và tên tài khoản** của người viết (xem `redesign-v2.md`, mục "Dữ liệu dạng luồng bình luận").

### Hệ thống tài khoản — brainstorm 2026-09-18, chưa làm

Tài chốt: làm xong **hệ thống tài khoản** trước, tài khoản phụ chỉ là một phần của nó. Tài khoản phải **đàng hoàng như mạng xã hội** (kiểu kênh YouTube), có **tab Hồ sơ** (quan trọng), quản lý có **vương miện** hiện cạnh tên, chỉnh được trong hồ sơ.

Đã chốt:
- Mỗi người **một danh tính** (`owner_identities_v2`), dùng cho mọi shop người đó thuộc về; vai nằm ở membership từng shop.
- Hành động nào cũng ghi đúng tài khoản đã làm. Admin vào qua mạo danh thì là **admin**, không phải chủ shop.

Đề xuất của agent, chờ Tài duyệt:
- **Hồ sơ:** tên hiển thị, `@handle` duy nhất, ảnh đại diện (tải lên R2, chưa có thì chữ cái đầu trên nền màu), giới thiệu ngắn, ngày tham gia. Đăng nhập vẫn bằng tên đăng nhập + mật khẩu; `@handle` là tên công khai trong shop, đổi được.
- **Tab Hồ sơ:** sửa hồ sơ, đổi mật khẩu (chuyển từ Cài đặt sang), xem hoạt động của chính mình. Bấm tên ai trong bình luận thì mở thẻ hồ sơ của người đó và hoạt động của họ trong shop.
- **Huy hiệu theo vai:** chủ shop có tên nằm trong viên nhạt như chủ kênh trên YouTube; quản lý có 👑; nhân viên không có huy hiệu; admin NFC có dấu ✓ và nhãn "Hỗ trợ NFC".
- **Tạo tài khoản phụ** bằng link thiết lập dùng một lần, như khách tự đặt mật khẩu (mục "Mật khẩu đầu tiên"): chủ shop cũng không bao giờ biết mật khẩu nhân viên.
- Người rời shop thì tắt membership; bình luận cũ giữ tên họ.

Chia lát dự kiến:
1. **Danh sách Review Landing Page** — nhỏ, effort medium, không migration, làm được ngay.
2. **Hồ sơ tài khoản + tab Hồ sơ** — effort high, có migration.
3. **Tài khoản phụ + lịch sử hoạt động + tìm kiếm** — effort high, có migration.
4. **Luồng bình luận** (like, ghim, sửa, xoá, bỏ trạng thái) — effort high, có migration.

### Mật khẩu đầu tiên — Tài không bao giờ biết

Không sinh mật khẩu rồi đưa khách: như vậy Tài **từng biết** mật khẩu của khách, và ngày shop khiếu nại sẽ không chứng minh được. Thay bằng **link thiết lập dùng một lần, hết hạn 24–48 giờ**, gửi qua Zalo, khách tự đặt mật khẩu. Cần vào hộ thì dùng đường mạo danh — có sổ, có hạn giờ, minh bạch.

### Nút "Generate" làm gì

**Không đụng Vercel, không đụng bên nào.** Một transaction trong Neon:

```
INSERT shops                      → slug (mã ngẫu nhiên)
template → draft → publish        → release
INSERT tags                       → mã /t/<code>
đặt paid_until                    → trạng thái thương mại
```

Hai URL tồn tại ngay vì chúng chỉ là đường dẫn trên cùng một app. Hệ quả: 1 shop hay 1000 shop chi phí hạ tầng gần như không đổi; không bao giờ chạm trần project của Vercel; tạo shop không bao giờ "deploy lỗi" vì không có bước deploy.

Cấu hình mặc định Tài mô tả (gradient + watermark chạy) **đã có sẵn** trong `defaultConfig()`: gradient `#214034 → #EFF2E8` góc135°, watermark `YOUR LOGO` bật, câu hỏi tiếng Việt.

### Bảng admin cần gì

Tên shop nội bộ · mã shop · link khách · link dashboard · thẻ đã phát kèm vị trí và trạng thái · tài khoản chủ shop · `publishing_state` · `paid_until` · hoạt động gần nhất. Nút: Khoá giữa · Mạo danh · Phát thẻ mới · Đổi tên · Sửa cấu hình.

## 9. Mô hình dữ liệu cần thêm

```
shop_billing     shop_id · paid_until · plan · grace_days · locked_price
payments         shop_id · amount · kỳ từ–đến · nguồn(tay|bot) · mã tham chiếu
                 · ai ghi · lúc nào · bằng chứng          ← sổ bất biến
discount_codes   mã · % · số lần dùng tối đa · hiệu lực · áp cho gói nào
                 · chỉ-khách-mới (cờ)
redemptions      mã · shop · payment · lúc nào            ← chặn dùng lại
platform_admins  bảng danh tính riêng, tách hẳn owner
admin_audit      hành động · actor · thay-mặt-ai · lúc nào  ← bất biến
```

Trạng thái **suy ra, không lưu**: còn hạn → đang dùng; quá hạn trong `grace_days` → ân hạn; quá → khoá giữa.

## 10. Thiếu sót đã phát hiện, cần xử lý

### `owner_identities_v2` không có trường email

Chỉ có `username`, `password_salt`, `password_key`, `active`. **Không có cách nào liên hệ chủ shop từ trong hệ thống**, trong khi mục 6 yêu cầu gửi bản ghi trước khi xoá dữ liệu. Cần thêm email + **xác minh email** (gõ sai là mất liên lạc vĩnh viễn) + một dịch vụ gửi mail. Email cũng là đường tự đặt lại mật khẩu, gỡ luôn việc admin làm thủ công.

### Mockup có, schema chưa có

| Mockup | Schema |
|---|---|
| Âm thanh popup | không có field |
| Nút Facebook | ~~icon chỉ `zalo\|instagram\|booking\|link`~~ — xong ở lát B2 (schema v2) |
| Nút Liên hệ (gọi điện) | ~~`tel:` bị từ chối~~ — xong ở lát B2: nút `phone` nhận `tel:` |
| Bố cục card | ~~chỉ `'full-bleed'`~~ — xong ở lát B2 |
| Gradient chuyển động | gradient hiện tĩnh (2 màu + góc) |
| Nút "Gửi phản hồi riêng tư" hiện sẵn | ~~API trả `RATING_REQUIRED`~~ — xong ở lát B1 (migration 010) |

Đều là **thay đổi schema có version**, không phải sửa CSS.

### Cookie owner đang `path:'/'`

`app/api/owner/v2/login/route.ts:9` đặt cookie owner ở `path:'/'`, nên nó được gửi kèm cả request vào trang khách. Không phải lỗ hổng (`HttpOnly` + `SameSite=Strict` + kiểm origin) nhưng là phơi bày không cần thiết. Tách dashboard sang tên miền con sẽ xoá hẳn, đổi lại phải sửa phần kiểm origin vốn chỉ nhận **một** `APP_ORIGIN`. Chưa cần làm ngay.

## Còn để mở

- Đuôi tên miền chưa chốt; **chưa kiểm tình trạng còn trống** của `quitesensational`.
- Dịch vụ gửi email chưa chọn.
- Nhà cung cấp bot biến động số dư chưa chọn.
- Thuế, hoá đơn, đăng ký kinh doanh: Tài hoãn có chủ ý.
- Thời hạn chính xác từ lúc đóng băng tới lúc xoá, ngoài mốc "3 tháng không hoạt động thì báo admin".
- Giá bán thẻ (phần cứng) chưa định.
