import type { Metadata } from 'next';
import Link from 'next/link';
import PlatformShell, { themeFromCookie } from '@/components/platform/shell';
import ThemeToggle from '@/components/platform/theme';
import { BrandLine, Eyebrow, buttonClass } from '@/components/platform/ui';
import { CONTACT } from '@/components/legal-page';
import { PLATFORM_NAME } from '@/lib/brand';
import styles from '@/components/start/landing.module.css';

// Rendered per request: each page carries its own CSP nonce (lát H1, proxy.ts), which a page built ahead cannot have.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: { absolute: `${PLATFORM_NAME} · Trang của quán, mở bằng một lần chạm thẻ` },
  description: 'Thẻ NFC đặt trên bàn mở trang riêng của quán: mọi khách thấy cùng một lời mời đánh giá Google, và có thêm một đường góp ý riêng cho chủ quán. Dựng thử miễn phí, chưa cần tài khoản.',
};

/**
 * The platform's front page (lát D4; docs/ui-ux-nguon-tham-khao.md mục 1f): indexed, the website of the platform's
 * own Google Business Profile, and the way in for an owner -- "Dựng trang của quán" opens the builder before any
 * account. It says only what the product does today, and it sells the rule the product keeps: no review gating
 * (google-policy.md mục 2b). Guests never come here; a card opens its shop's page.
 */
export default async function Home() {
  return <PlatformShell><div className={styles.page}>
    <header className={styles.nav}>
      <Link href="/" className={styles.brand} aria-label={PLATFORM_NAME}><BrandLine /></Link>
      <nav aria-label="Trang chính" className={styles.links}>
        <a href="#cach-hoat-dong">Cách hoạt động</a><a href="#khong-loc">Không lọc đánh giá</a>
      </nav>
      <span className={styles.navEnd}><Link href="/owner/login" className={styles.signIn}>Đăng nhập</Link>
        <Link href="/bat-dau" className={buttonClass('primary')} data-landing-start-top>Bắt đầu</Link></span>
    </header>

    <main>
      <section className={styles.hero}>
        <Eyebrow>Thẻ NFC cho quán</Eyebrow>
        <h1>Khách chạm thẻ trên bàn.<span>Quán nghe được điều khách nghĩ.</span></h1>
        <p className={styles.lead}>Mỗi quán một trang mang tên quán. Mọi khách thấy cùng một lời mời đánh giá Google, và có thêm một
          đường nhắn riêng cho chủ quán — trước khi điều chưa vui thành một bài đăng.</p>
        <div className={styles.cta}>
          <Link href="/bat-dau" className={buttonClass('primary')} data-landing-start>Dựng trang của quán →</Link>
          <a href="#cach-hoat-dong" className={buttonClass('secondary')}>Xem cách hoạt động</a>
        </div>
        <ul className={styles.ticks}>
          <li>Dựng thử không cần tài khoản</li><li>Không cần trả tiền để bắt đầu</li><li>Theo đúng chính sách đánh giá của Google</li>
        </ul>
      </section>

      <section id="cach-hoat-dong" className={styles.section}>
        <Eyebrow>Cách hoạt động</Eyebrow>
        <h2>Ba bước, không ai phải cài gì.</h2>
        <ol className={styles.steps}>
          <li><span>1</span><strong>Khách chạm thẻ hoặc quét mã</strong><p>Trang của quán mở ngay trên điện thoại khách, trên 4G, không tải ứng dụng.</p></li>
          <li><span>2</span><strong>Một nút Google, như nhau với mọi người</strong><p>Không hỏi sao trước, không chọn ai được mời. Khách tự quyết có viết hay không.</p></li>
          <li><span>3</span><strong>Góp ý riêng tới thẳng chủ quán</strong><p>Khách muốn nhắn riêng thì gửi, kèm số điện thoại nếu muốn được gọi lại. Chủ quán đọc trên dashboard.</p></li>
        </ol>
      </section>

      <section id="khong-loc" className={`${styles.section} ${styles.rule}`}>
        <Eyebrow>Không lọc đánh giá</Eyebrow>
        <h2>Không lọc đánh giá.<span>Vì chính quán là người bị phạt.</span></h2>
        <p className={styles.lead}>Có dịch vụ hỏi khách chấm mấy sao trước, rồi chỉ đưa người khen sang Google. Google gọi đó là lọc đánh giá,
          và hình phạt rơi vào hồ sơ của quán: đánh giá bị gỡ, cảnh báo công khai, có khi hồ sơ bị khoá. Ở đây mọi khách thấy cùng một
          nút Google; góp ý riêng là kênh <em>thêm</em>, không bao giờ là kênh <em>thay</em>. Không quà, không bốc thăm đổi lấy đánh giá.</p>
        <p><Link href="/huong-dan-google">Đọc hướng dẫn mời đánh giá đúng luật</Link></p>
      </section>

      <section className={styles.section}>
        <Eyebrow>Chủ quán có gì</Eyebrow>
        <h2>Trang đẹp sẵn. Dashboard trên điện thoại.</h2>
        <div className={styles.features}>
          <div><strong>Sáu template</strong><p>Chọn, không phải thiết kế. Đổi template không mất nội dung.</p></div>
          <div><strong>Góp ý riêng</strong><p>Đọc, trả lời nội bộ, gọi lại khách đã để số.</p></div>
          <div><strong>Lượt chạm theo ngày</strong><p>Biết thẻ nào đang được dùng, trang nào được mở.</p></div>
          <div><strong>Cả đội cùng xem</strong><p>Mời nhân viên, chia quyền theo việc.</p></div>
        </div>
      </section>

      <section className={styles.final}>
        <h2>Xem trang của quán bạn trên điện thoại, ngay bây giờ.</h2>
        <p>Nhập tên quán, chọn template, quét mã. Chưa tới một phút.</p>
        <Link href="/bat-dau" className={buttonClass('primary')}>Dựng trang của quán →</Link>
      </section>
    </main>

    <footer className={styles.footer}>
      <div><BrandLine /><p>Vận hành bởi {CONTACT.operator} · <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a> · <a href={CONTACT.phoneHref}>{CONTACT.phone}</a></p>
        <p>Bạn vừa chạm thẻ ở quán mà tới đây? Hãy chạm lại, hoặc hỏi nhân viên đường dẫn trang của quán.</p></div>
      <div className={styles.footerEnd}><p><Link href="/owner/login">Đăng nhập cho chủ quán</Link> · <Link href="/quyen-rieng-tu">Quyền riêng tư</Link> · <Link href="/dieu-khoan">Điều khoản</Link></p>
        <ThemeToggle initial={await themeFromCookie()} /></div>
    </footer>
  </div></PlatformShell>;
}
