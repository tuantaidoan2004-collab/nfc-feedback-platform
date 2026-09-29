import type { Metadata } from 'next';
import Link from 'next/link';
import { CONTACT } from '@/components/legal-page';

// Rendered per request: each page carries its own CSP nonce (lát H1, proxy.ts), which a page built ahead cannot have.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Mời đánh giá Google đúng luật' };

/**
 * The one page a shop gets at handover, and the one its staff can print (lát A7, 26/09/2026). It restates
 * `docs/google-policy.md` section 3 for the people behind the counter; it never adds a rule of its own. Plain words,
 * one page, because the shop that breaks Google's rules is almost always the shop that did not know them.
 */
export default function GoogleGuide() {
  return <main className="legal" lang="vi"><article>
    <h1>Mời khách đánh giá Google đúng luật</h1>
    <p className="legal-meta">Một trang cho chủ quán và nhân viên — nên in ra, dán ở quầy.</p>

    <p>Google phạt <strong>hồ sơ của quán</strong>, không phải người bán thẻ: khoá nhận đánh giá mới, xoá đánh giá đã
      có, gắn biển cảnh báo công khai trên hồ sơ, và nếu lặp lại thì khoá hẳn hồ sơ. Mọi điều dưới đây là để hồ sơ của
      quán không bao giờ rơi vào đó.</p>

    <h2>Nền tảng đã làm sẵn cho quán</h2>
    <ul>
      <li>Mọi khách thấy cùng một nút Google, trước khi chọn sao, dù chấm mấy sao.</li>
      <li>Không hỏi sao trước rồi mới cho sang Google, và không điền sẵn số sao hay câu chữ vào Google.</li>
      <li>Góp ý riêng cho quán là một đường <strong>thêm</strong>, không thay nút Google.</li>
      <li>Chữ trên các nút của trang chọn từ danh sách trung lập; link đánh giá phải là link của Google.</li>
    </ul>

    <h2>Nên</h2>
    <ul>
      <li>Đặt thẻ ở chỗ khách tự thấy: bàn, quầy thanh toán.</li>
      <li>Nếu mời bằng lời, mời <strong>mọi</strong> khách như nhau, một câu trung lập: “Cảm nhận của bạn giúp quán tốt
        hơn.”</li>
      <li>Trả lời mọi đánh giá trên Google, kể cả đánh giá chê, lịch sự.</li>
      <li>Đọc góp ý riêng trong dashboard và sửa vấn đề thật.</li>
    </ul>

    <h2>Không</h2>
    <ul>
      <li>Tặng món, giảm giá, quà, điểm, bốc thăm cho người đánh giá — kể cả “đánh giá rồi đưa màn hình để nhận quà”.</li>
      <li>Chỉ mời khách trông vui, hay hỏi “anh chị hài lòng không?” rồi mới mời người hài lòng.</li>
      <li>Đứng chờ khách viết, cầm điện thoại của khách, hay đưa máy của quán cho khách đánh giá.</li>
      <li>Nhờ khách nhắc tên nhân viên, hay gợi câu để khách chép vào đánh giá.</li>
      <li>Giao chỉ tiêu số đánh giá cho nhân viên, hay thưởng nhân viên theo số đánh giá.</li>
      <li>Nhờ nhân viên, người nhà, bạn bè đánh giá quán; đánh giá xấu quán khác.</li>
      <li>Nhắn khách đã chê để đổi quà lấy việc sửa hay xoá đánh giá.</li>
      <li>Chạy một đợt làm số đánh giá tăng vọt trong vài ngày.</li>
    </ul>

    <p>Nguồn: <a href="https://support.google.com/contributionpolicy/answer/7400114">chính sách nội dung của Google
      Maps</a>. Không ai bảo đảm được 100% — bộ lọc của Google đôi khi ẩn cả đánh giá thật — nhưng làm đúng trang này
      thì quán không tự tạo ra vi phạm.</p>

    <footer>
      Hỏi thêm: {CONTACT.operator} · <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a> · <a href={CONTACT.phoneHref}>{CONTACT.phone}</a>
      <br /><Link href="/quyen-rieng-tu" prefetch={false}>Quyền riêng tư</Link> · <Link href="/dieu-khoan" prefetch={false}>Điều khoản</Link>
    </footer>
  </article></main>;
}
