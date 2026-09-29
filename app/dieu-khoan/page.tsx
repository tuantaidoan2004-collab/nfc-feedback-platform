import type { Metadata } from 'next';
import Link from 'next/link';
import { CONTACT, LegalPage } from '@/components/legal-page';

// Rendered per request: each page carries its own CSP nonce (lát H1, proxy.ts), which a page built ahead cannot have.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Điều khoản' };

/** The rules a customer meets on a shop's page (A5). The Google part restates docs/google-policy.md, it never adds. */
export default function Terms() {
  return <LegalPage title="Điều khoản sử dụng">
    <p>Áp dụng khi bạn dùng trang của một quán trên nền tảng quitesensational-review-bio.com, do {CONTACT.operator}
      {' '}vận hành.</p>

    <h2>Trang của quán</h2>
    <p>Mỗi quán tự soạn nội dung trên trang của mình (tên, ảnh, lời mời, đường dẫn) và chịu trách nhiệm về nội dung
      đó. Nền tảng cung cấp công cụ và nơi lưu trữ.</p>

    <h2>Đánh giá trên Google</h2>
    <p>Mọi khách đều thấy cùng một lời mời đánh giá trên Google, dù bạn chọn bao nhiêu sao hay không chọn. Nền tảng
      không có tính năng nào gắn quà, giảm giá hay bốc thăm với việc đánh giá, và quán dùng nền tảng cam kết không làm
      việc đó. Việc viết đánh giá diễn ra trên Google, theo điều khoản của Google.</p>

    <h2>Góp ý riêng cho quán</h2>
    <p>Góp ý riêng chỉ gửi tới quán, không đăng công khai. Xin viết trung thực và lịch sự; không đe doạ, không đăng
      thông tin cá nhân của người khác. Quán có thể trả lời hoặc không.</p>

    <h2>Dữ liệu của bạn</h2>
    <p>Cách chúng tôi lưu, dùng và xoá dữ liệu nằm ở trang <Link href="/quyen-rieng-tu">Quyền riêng tư</Link>. Bạn tự xoá
      được lời nhắn và số điện thoại của mình bất cứ lúc nào, bằng dòng “Xoá dữ liệu của tôi” ở chân trang của quán.</p>

    <h2>Giới hạn</h2>
    <p>Chúng tôi cố gắng giữ trang chạy liên tục nhưng không bảo đảm trang không bao giờ gián đoạn. Nền tảng có thể tạm
      chặn các yêu cầu có dấu hiệu tự động để bảo vệ quán và khách.</p>

    <h2>Thay đổi</h2>
    <p>Khi điều khoản thay đổi, ngày cập nhật ở đầu trang thay đổi theo. Luật áp dụng là pháp luật Việt Nam.</p>
  </LegalPage>;
}
