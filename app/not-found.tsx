import Link from 'next/link';
import { connection } from 'next/server';
import '@/components/legal-page.css';

/**
 * Any address that leads nowhere, and every page that is gone (a closed page, lát P4). Rendered per request, like every
 * page since lát H1: a page built ahead of time has no CSP nonce, and its own scripts would be refused.
 */
export default async function NotFound() {
  await connection();
  return <main className="legal" lang="vi"><article>
    <h1>Không tìm thấy trang này</h1>
    <p>Đường dẫn không đúng, hoặc trang đã đóng. Nếu bạn vừa chạm thẻ ở quán, hãy hỏi nhân viên đường dẫn trang của quán.</p>
    <p><Link href="/">Về trang chính</Link></p>
  </article></main>;
}
