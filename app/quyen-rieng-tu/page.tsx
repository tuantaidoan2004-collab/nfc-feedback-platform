import type { Metadata } from 'next';
import Link from 'next/link';
import { CONTACT, LegalPage } from '@/components/legal-page';

export const metadata: Metadata = { title: 'Quyền riêng tư' };

/**
 * Says exactly what the code does, and nothing it does not (A5). If a sentence here stops being true, the code or
 * this page is wrong: erasure is server/erase.ts, the address counting is server/guest-limits.ts, the behaviour log
 * is lib/client/page-events.ts, the browser secret is lib/client/browser-identity.ts.
 */
export default function Privacy() {
  return <LegalPage title="Quyền riêng tư">
    <p>Trang này nói về dữ liệu khi bạn mở trang của một quán qua thẻ NFC hoặc đường dẫn của quán, trên
      nền tảng quitesensational-review-bio.com.</p>

    <h2>Ai chịu trách nhiệm</h2>
    <p>Quán bạn ghé là người đọc góp ý của bạn. Nền tảng do {CONTACT.operator} vận hành, lưu và xử lý dữ liệu thay
      cho quán. Mọi câu hỏi về dữ liệu, gửi tới <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a> hoặc
      gọi <a href={CONTACT.phoneHref}>{CONTACT.phone}</a>.</p>

    <h2>Chúng tôi lưu gì</h2>
    <ul>
      <li><b>Một mã ngẫu nhiên trong trình duyệt của bạn</b> (bộ nhớ trang, không phải cookie), để nhận ra lần ghé
        sau của cùng trình duyệt với cùng quán. Mã này không chứa tên hay thông tin nào về bạn.</li>
      <li><b>Lượt ghé</b>: thời điểm bạn mở trang.</li>
      <li><b>Số sao</b>, nếu bạn chọn.</li>
      <li><b>Góp ý riêng</b>, nếu bạn gửi: chủ đề, lời nhắn, và số điện thoại nếu bạn tự nhập để được gọi lại.</li>
      <li><b>Thao tác trên trang</b>: mở trang, bấm nút Google, mở khung góp ý, chọn sao, gửi, hay đóng khung mà không
        gửi, kèm khoảng thời gian giữa các bước. Phần này <b>không bao giờ</b> chứa lời nhắn hay số điện thoại.</li>
      <li><b>Địa chỉ mạng (IP)</b>: chỉ dùng để chặn máy tự động gửi hàng loạt. Chúng tôi lưu một bản băm, không lưu
        địa chỉ, và xoá sau khoảng một giờ.</li>
    </ul>
    <p>Không cookie, không quảng cáo, không theo dõi bạn sang trang khác. Khi bạn bấm nút đánh giá trên Google, bạn
      rời sang Google và áp dụng chính sách của Google; chúng tôi không biết bạn có viết đánh giá hay không.</p>

    <h2>Để làm gì</h2>
    <ul>
      <li>Để quán đọc góp ý của bạn, và gọi lại nếu bạn để số.</li>
      <li>Để cải tiến trang, dựa trên thao tác không kèm nội dung: ví dụ bao nhiêu người mở khung góp ý rồi bỏ dở.</li>
      <li>Để chặn lạm dụng và giữ số liệu của quán không bị máy tự động làm sai.</li>
    </ul>

    <h2 id="so-dien-thoai">Ai thấy lời nhắn và số điện thoại</h2>
    <p>Chỉ người của quán được cấp quyền mới thấy số điện thoại bạn nhập. Người quản trị nền tảng không thấy số này
      trên màn hình quản trị. Số chỉ dùng để quán gọi lại cho bạn về góp ý đó.</p>
    <p>Lưu ý: nếu bạn gõ số điện thoại hay thông tin cá nhân <b>vào trong lời nhắn</b>, nó là một phần của lời nhắn,
      và ai đọc được lời nhắn cũng thấy.</p>
    <p>Chúng tôi không bán và không chia sẻ dữ liệu của bạn cho ai ngoài quán và các nhà cung cấp hạ tầng nêu dưới.</p>

    <h2>Lưu ở đâu</h2>
    <p>Máy chủ và cơ sở dữ liệu đặt tại Singapore (Vercel và Neon). Ảnh của quán lưu trên Cloudflare R2; góp ý của bạn
      không nằm ở đó.</p>

    <h2>Giữ bao lâu</h2>
    <p>Tối đa 12 tháng kể từ lần ghé.</p>

    <h2 id="xoa">Tự xoá dữ liệu của bạn</h2>
    <p>Ở chân trang của quán có dòng <b>Xoá dữ liệu của tôi</b>. Bấm nó trên chính trình duyệt bạn đã dùng để gửi,
      không cần tài khoản hay cho biết bạn là ai.</p>
    <ul>
      <li><b>Bị xoá</b>: lời nhắn, số điện thoại, và nhật ký thao tác của bạn với quán đó, qua cùng thẻ hoặc đường dẫn,
        kể cả những lần ghé trước. Quán sẽ chỉ còn thấy dòng “(đã xoá theo yêu cầu)”.</li>
      <li><b>Còn lại</b>: việc đã có một lượt ghé và số sao bạn chọn, không kèm tên hay cách liên lạc, để số liệu của
        quán không bị thay đổi âm thầm.</li>
    </ul>
    <p>Nếu bạn đã xoá dữ liệu trình duyệt, dùng máy khác, hoặc muốn xoá cả số sao, hãy liên hệ
      {' '}<a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a> hoặc <a href={CONTACT.phoneHref}>{CONTACT.phone}</a>,
      kèm tên quán và khoảng thời gian bạn ghé.</p>

    <h2 id="dung-thu">Khi chủ quán dựng thử trang</h2>
    <p>Trang dựng thử ở <Link href="/bat-dau">/bat-dau</Link> không lưu gì trên máy chủ: tên quán, template và ba câu trả lời nằm
      ngay trong đường link bản xem thử, có chữ ký để không ai làm giả, và link hết hạn sau 7 ngày. Trình duyệt của bạn
      giữ bản đang dựng dở trong bộ nhớ trang để bạn quay lại làm tiếp; xoá dữ liệu trang web là mất. Mở link bản xem thử
      không ghi lại lượt ghé nào. Chỉ khi bạn gửi link cho chúng tôi, chúng tôi mới đọc nó để tạo tài khoản cho quán.</p>

    <h2>Quyền của bạn</h2>
    <p>Bạn có quyền biết, xem, sửa, xoá dữ liệu của mình, và rút lại đồng ý. Liên hệ qua email hoặc số điện thoại
      trên; chúng tôi trả lời trong thời hạn pháp luật Việt Nam quy định.</p>
  </LegalPage>;
}
