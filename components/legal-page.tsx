import Link from 'next/link';
import './legal-page.css';

/**
 * The frame both legal pages share (A5). A draft for a lawyer to read (roadmap C2), and it says so first, so nobody
 * mistakes it for reviewed text. Contact details are Tài's own, as he decided on 21/09/2026.
 */
export const CONTACT = { operator: 'Đoàn Tuấn Tài', email: 'tuantaidoan2004@gmail.com', phone: '0961 036 265', phoneHref: 'tel:+84961036265',
  /** The same number on Zalo, where owners send a draft page (lát D4). */
  zaloHref: 'https://zalo.me/0961036265' };
export const UPDATED = '21/09/2026';

export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return <main className="legal" lang="vi"><article>
    <p className="legal-draft" role="note">Bản nháp, đang chờ luật sư duyệt. Nội dung mô tả đúng cách hệ thống đang chạy.</p>
    <h1>{title}</h1>
    <p className="legal-meta">Cập nhật {UPDATED}</p>
    {children}
    <footer>
      Liên hệ: {CONTACT.operator} · <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a> · <a href={CONTACT.phoneHref}>{CONTACT.phone}</a>
      <br /><Link href="/quyen-rieng-tu">Quyền riêng tư</Link> · <Link href="/dieu-khoan">Điều khoản</Link>
    </footer>
  </article></main>;
}
