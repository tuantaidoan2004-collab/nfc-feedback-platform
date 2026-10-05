/**
 * Màn tiến trình (kịch bản mục 4), bố cục như "Where would you like to start?" của Jitter: hai thẻ lớn Template (tím) và
 * Dashboard (xanh). Ô xong có dấu tích, mờ, khoá; ô Dashboard xong thì hiện "Tới trang dashboard của bạn →".
 */
import Link from 'next/link';
import styles from './gray.module.css';
import Icon from '../icons';

export default function Progress({ slug, template, dashboard }: { slug: string; template: 'done' | 'skipped' | null; dashboard: boolean }) {
  const templateDone = template !== null;
  const Template = templateDone ? 'div' : Link, Dashboard = dashboard ? 'div' : Link;
  return <section className={`${styles.body} ${styles.center}`} style={{ padding: 0 }}>
    <div style={{ display: 'grid', gap: 12, justifyItems: 'center' }}>
      <h1 className={styles.headline}>Chỉ cần vài bước là bạn có thể sử dụng được rồi</h1>
      <p className={styles.lead}>Làm theo thứ tự nào cũng được. Mọi thứ sửa lại được sau.</p>
    </div>
    <div className={styles.cards}>
      <Template href={`/app/${slug}/library`} className={styles.card} data-kind="template" data-done={templateDone} aria-disabled={templateDone || undefined} data-choice="template">
        {templateDone && <span className={styles.tick} aria-label="Đã xong"><Icon name="check" size={22} /></span>}
        <span className={styles.mark}><Icon name="plus" size={56} /></span>
        <h2>Template</h2>
        <p>{templateDone ? (template === 'done' ? 'Đã tạo trang đầu tiên.' : 'Đã bỏ qua — tạo sau trong Library.')
          : 'Bạn sẽ được tạo trang web của mình ngay trong dashboard sau khi hoàn tất. Hoặc bạn có thể tạo ngay luôn →'}</p>
      </Template>
      <Dashboard href="/bat-dau/google" className={styles.card} data-kind="dashboard" data-done={dashboard} aria-disabled={dashboard || undefined} data-choice="dashboard">
        {dashboard && <span className={styles.tick} aria-label="Đã xong"><Icon name="check" size={22} /></span>}
        <span className={styles.mark}><Icon name="dashboard" size={56} /></span>
        <h2>Dashboard</h2>
        <p>{dashboard ? 'Đã nối quán với Google.' : 'Bạn sẽ tạo nơi làm việc cho mình tại đây. Nó sẽ khá thú vị đấy!'}</p>
      </Dashboard>
    </div>
    {dashboard && <Link href="/bat-dau/xong" className={styles.pill} data-to-dashboard>Tới trang dashboard của bạn <Icon name="arrow" size={18} /></Link>}
  </section>;
}
