/**
 * Khúc "Vì sao có Quite Sensational" (G5, Tài 06/10, kịch bản mục 2): lời của Tài, ba phần — cho chủ quán · cho nhân viên ·
 * cho nhà đầu tư. Chữ đã lọc theo docs/google-policy.md: câu nhân viên nói là bản trung lập, không nhắc ghi công đánh giá cho
 * nhân viên, không đổi quà lấy đánh giá, không hứa số sao.
 */
import Link from 'next/link';
import styles from './why.module.css';
import { PLANS, YEAR_MONTHS } from '@/lib/billing/plans';

const money = (value: number) => `${value.toLocaleString('vi-VN')}đ`;
/** The plans in one line, from the same list Pricing reads, so a price changed there is never stale here. */
const plans = PLANS.map(plan => `${plan.name} ${money(plan.monthly)}${plan.key === 'vip' ? ' cho mọi địa chỉ của quán' : ''}`).join(', ');

const PARTS: [string, string][] = [['chu-quan', 'Cho chủ quán'], ['nhan-vien', 'Cho nhân viên'], ['nha-dau-tu', 'Cho nhà đầu tư']];

export default function Why() {
  return <section id="vi-sao" className={styles.why} aria-labelledby="vi-sao-title">
    <header className={styles.head}>
      <span className={styles.kicker}>Lời người làm</span>
      <h2 id="vi-sao-title">Vì sao có Quite Sensational</h2>
      <p className={styles.lead}>Lần đầu bước vào một quán, ai cũng ngó nghiêng một chút: quán này có gì hay không? Nhưng ngó xong thì thôi. Không có gì
        để xem thêm, không có lý do để ở lại với quán lâu hơn ly nước. Và lúc ra về, người ta về tay không.</p>
      <p className={styles.lead}>Tôi làm Quite Sensational để khách có <strong>một thứ mang về</strong>: một tấm thẻ để chạm, mở ra trang của quán — quán
        này là ai, có gì hay, hôm nay có gì vui. Xem lúc nào cũng được, ở bàn, ở ghế chờ, hay tối về nhà. Rồi nếu muốn, để lại một đánh giá.</p>
      <p className={styles.motto}>Trải nghiệm trước, đánh giá sau.</p>
      <nav className={styles.jump} aria-label="Ba phần">{PARTS.map(([id, label], index) =>
        <a key={id} href={`#${id}`}><span>{String(index + 1).padStart(2, '0')}</span>{label}</a>)}</nav>
    </header>

    <article id="chu-quan" className={styles.part}>
      <h3><span>01</span>Cho chủ quán</h3>
      <div className={styles.body}>
        <p>Tôi từng đi cắt tóc. Cắt xong, chưa kịp soi gương cho kỹ, anh thợ đã nói: &ldquo;anh cho em cái đánh giá Google nha&rdquo;. Tôi gượng chụp
          một tấm hình mái tóc mới, dù nó chưa đẹp, dù tôi chưa kịp thấy thích hay không. Tôi ghét cảm giác đó. Và từ hôm đó tôi không thích quán ấy
          thật. Một lời xin đánh giá sai lúc lấy đi đúng thứ quán cần nhất: cảm tình của khách. Google cũng không muốn kiểu này — chính sách đánh giá
          cập nhật tháng 4/2026 cấm gây áp lực để khách đánh giá ngay tại quán.</p>
        <p>Giờ thử nghĩ lại cảnh đó theo cách khác. Lúc tính tiền, trên quầy có một tấm thẻ. Nhân viên nói một câu:</p>
        <blockquote>&ldquo;Anh ơi lưu mã này giúp em, khi nào anh thấy quán em sao thì anh để lại đánh giá giúp em nhé, ở trong link đó luôn ạ.&rdquo;</blockquote>
        <p>Rồi nhân viên <strong>quay đi làm việc khác</strong>, không đứng nhìn để khách khỏi ngại. Khách chạm thẻ, ra ghế ngoài ngồi, thong thả xem.
          Thấy hay thì chụp một tấm, viết vài dòng. Không thì dắt xe về, chẳng sao cả. Quan trọng là khách vẫn thấy thoải mái — và khách thoải mái thì
          mới quay lại.</p>
        <p>Đó là điều Quite Sensational làm cho quán:</p>
        <ul>
          <li><strong>Một trang mang tên quán</strong>, mở bằng một chạm thẻ NFC hay một lần quét QR. Chữ trên trang không vội, không giục.</li>
          <li><strong>Lời mời đánh giá Google giống hệt nhau với mọi khách.</strong> Không hỏi &ldquo;bạn hài lòng không&rdquo; trước, không giấu nút Google
            với ai, không đổi quà lấy đánh giá. Khách chưa vui có thêm chỗ để <strong>góp ý riêng</strong> với quán, nhưng nút Google vẫn ở đó cho họ. Hồ
            sơ Google của quán là tài sản, tôi không để nó gặp rủi ro.</li>
          <li><strong>Mọi phản hồi về một chỗ</strong>, để quán biết khách nghĩ gì và trả lời kịp.</li>
          <li>Trang do <strong>Admin Tài dựng và sửa</strong> theo ý quán. Ảnh, logo, màu của quán, cứ gửi qua Zalo.</li>
        </ul>
      </div>
    </article>

    <article id="nhan-vien" className={styles.part}>
      <h3><span>02</span>Cho nhân viên</h3>
      <div className={styles.body}>
        <p>Nhân viên không phải người đứng xin đánh giá. Nhân viên là <strong>người tạo ra trải nghiệm</strong> — ly nước pha vừa ý, câu chào đúng lúc,
          cái gật đầu khi khách ra về. Những đánh giá tốt nhất đến từ đó, không đến từ việc nài nỉ.</p>
        <p>Vì vậy nhân viên có tài khoản riêng trong quán, ở mọi gói. Chủ quán duyệt cho vào và chia quyền. Nhân viên làm song song với chủ: chọn mẫu
          trang, nhờ Admin Tài dựng hay sửa, thêm sự kiện cho quán, xử lý góp ý của khách. Mọi việc đều được ghi lại, nên chủ quán thấy ai đang làm tốt —
          bằng những việc thật, chứ không phải bằng một con số đánh giá. Và chủ quán không phải tự tay nhắn từng việc cho admin nữa.</p>
        <p>Câu nhân viên nói với khách chỉ có một, và giống nhau với mọi khách. Không chỉ tiêu, không bảng xếp hạng, không ai phải nhờ khách nhắc tên mình.</p>
      </div>
    </article>

    <article id="nha-dau-tu" className={styles.part}>
      <h3><span>03</span>Cho nhà đầu tư</h3>
      <div className={styles.body}>
        <p>Ngắn hạn, quán cần nhiều đánh giá thật hơn — từ những khách đã có thời gian trải nghiệm, nên đánh giá có nội dung, có hình, có cảm xúc thật.
          Quite Sensational giúp được việc đó mà không lách luật Google: không lọc đánh giá, không đổi quà, không gây áp lực. Thị trường đang có những sản
          phẩm làm ngược lại; một ngày Google siết, quán dùng chúng sẽ trả giá. Đi đúng luật từ đầu là lợi thế.</p>
        <p>Dài hạn, thứ có giá trị là <strong>sự kiện và collab</strong>. Trang của quán có một khúc dành cho sự kiện: hôm nay quán có gì, và các đối tác
          collab mang tới gì cho khách — ví dụ một tài khoản công cụ làm việc bản Pro dùng thử cho người ngồi chạy deadline ở quán cà phê. Đối tác có thêm
          người dùng, quán có thêm lý do để khách ở lại, khách có thêm thứ để nghịch. Quà và sự kiện dành cho <strong>mọi khách</strong>, không bao giờ đổi
          lấy đánh giá.</p>
        <p>Mô hình đơn giản: quán trả theo tháng — {plans} — trả theo năm thì {YEAR_MONTHS} tháng. Mỗi collab quán mua một lần. Đối tác collab không phải trả tiền cho nền tảng. Thẻ NFC bán riêng.</p>
        <p>Hôm nay Quite Sensational phục vụ từng quán, từng địa chỉ. Bước tiếp theo là các chuỗi: chủ chuỗi, quản lý chi nhánh, nhân viên, mỗi người thấy
          đúng phần của mình. Tôi làm từng bước, bước nào chắc bước đó.</p>
        <p className={styles.sign}>— Admin Tài</p>
        <Link href="/bat-dau" className={styles.start}>Bắt đầu miễn phí</Link>
      </div>
    </article>
  </section>;
}
