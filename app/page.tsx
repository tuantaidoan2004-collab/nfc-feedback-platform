import Link from 'next/link';
import { CONTACT } from '@/components/legal-page';

/**
 * The domain's front door. Guests arrive through a card or a shop's own link, never here, so this only says what the
 * place is and who runs it. It replaces the browser-only demo shop that used to answer at `/` (lát A3); the platform's
 * real front page is roadmap A31.
 */
export default function Home() {
  return <main className="legal" lang="vi"><article>
    <h1>Trang của quán, mở từ thẻ NFC</h1>
    <p>Khách chạm thẻ ở quán để mở trang của chính quán đó: đánh giá quán trên Google, và gửi góp ý riêng cho quán nếu
      muốn.</p>
    <p>Bạn vừa chạm thẻ mà tới đây? Hãy chạm lại, hoặc hỏi nhân viên quán đường dẫn trang của quán.</p>
    <footer>
      Vận hành bởi {CONTACT.operator} · <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a> · <a href={CONTACT.phoneHref}>{CONTACT.phone}</a>
      <br /><Link href="/quyen-rieng-tu">Quyền riêng tư</Link> · <Link href="/dieu-khoan">Điều khoản</Link>
    </footer>
  </article></main>;
}
