'use client';
/**
 * Tab Library — giống trang chủ Canva (kịch bản mục 8). Thanh bên: tạo mới, Home (project đã sửa và phát hành), Tải lên,
 * Template, Brand, My Card, Sự kiện, More. Bản khung: Home và Template chạy thật; Tải lên, Brand, Sự kiện dựng ở đợt ⑤;
 * canvas sửa trang ở đợt ②. Trong onboarding, đây là bước Template: chọn một mẫu, hoặc bỏ qua sang bước Dashboard.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { TabProps } from './index';
import type { TemplateCard } from '@/lib/publishing/templates';
import styles from './tabs.module.css';
import Icon, { type IconName } from '../icons';

type Section = 'home' | 'tai-len' | 'template' | 'brand' | 'su-kien' | 'more';
const SECTIONS: [Section, string, IconName][] = [['home', 'Home', 'home'], ['tai-len', 'Tải lên', 'upload'], ['template', 'Template', 'template'],
  ['brand', 'Brand', 'brand'], ['su-kien', 'Sự kiện', 'event'], ['more', 'More', 'more']];
// Nhóm template theo cách hoạt động (kịch bản mục 8); gán thật khi các template mới được dựng từ ảnh của Tài.
const GROUPS = ['Tất cả', 'Only Poster', 'Only Background', 'Interactive cards', 'Simple', 'Không gian thực', 'Tối giản', 'Trong suốt', 'Thuỷ tinh'];
type Page = { slug: string; label: string | null; state: string; template: { key: string } };
const STATES: Record<string, string> = { draft: 'Bản nháp', published: 'Đã phát hành', paused: 'Tạm dừng' };

export default function LibraryTab({ slug, onboarding, query, templates, origin }: TabProps) {
  const router = useRouter();
  const [section, setSection] = useState<Section>(onboarding ? 'template' : ((query.muc as Section) ?? 'home'));
  const [pages, setPages] = useState<Page[] | null>(null), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const response = await fetch(`/api/owner/v2/${slug}/pages`, { cache: 'no-store' }).catch(() => null);
    if (response?.ok) setPages((await response.json()).pages); else setPages([]);
  }, [slug]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  const go = (next: Section) => { setSection(next); setNotice(''); };
  const step = async (value: 'done' | 'skipped') => fetch(`/api/owner/v2/${slug}/onboarding`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ step: 'template', value }) });
  const useTemplate = async (card: TemplateCard) => {
    setBusy(true); setNotice('Đang tạo trang…');
    const response = await fetch(`/api/owner/v2/${slug}/pages`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ template: card.key, label: pages?.length ? `Trang ${pages.length + 1}` : 'Trang chính' }) }).catch(() => null);
    setBusy(false);
    if (!response?.ok) { setNotice('Chưa tạo được trang. Thử lại.'); return; }
    if (onboarding) { await step('done'); router.push('/bat-dau/tien-trinh'); return; }
    setNotice('Đã tạo trang mới. Trình sửa trang kiểu canvas đang được dựng (đợt ②).'); setSection('home'); void load();
  };
  return <div>
    {onboarding && <section className={styles.banner} data-onboarding-template>
      <div className={styles.row}>
        <div><span className="qs-pill">Bước Template</span><h2 style={{ marginTop: 8 }}>Chọn một mẫu để tạo trang của quán</h2>
          <p className="qs-muted qs-small">Mọi mẫu đều miễn phí trong giai đoạn trải nghiệm. Bạn sửa được hết sau này.</p></div>
        <div style={{ display: 'grid', justifyItems: 'center', gap: 4 }}>
          <button type="button" className="qs-btn" onClick={async () => { await step('skipped'); router.push('/bat-dau/tien-trinh'); }}>Bỏ qua, đến bước tạo Dashboard</button>
          <button type="button" className="qs-link" onClick={async () => { await step('skipped'); router.push('/bat-dau/tien-trinh'); }}>skip</button>
        </div>
      </div>
    </section>}
    <div className={styles.split}>
      <nav className={styles.side} aria-label="Library">
        <button type="button" className={styles.create} aria-label="Tạo mới" title="Tạo mới" onClick={() => go('template')}><Icon name="plus" /></button>
        {SECTIONS.map(([key, label, icon]) => <button key={key} type="button" aria-current={section === key ? 'page' : undefined} onClick={() => go(key)}>
          <Icon name={icon} size={20} />{label}</button>)}
        <Link href={`/app/${slug}/my-card`}><Icon name="card" size={20} />My Card</Link>
      </nav>
      <div className={styles.grid}>
        {notice && <p className="qs-small" role="status">{notice}</p>}
        {section === 'home' && <Home pages={pages} slug={slug} origin={origin} onCreate={() => go('template')} />}
        {section === 'template' && <Templates templates={templates} busy={busy} onUse={useTemplate} />}
        {section === 'tai-len' && <Placeholder title="Tải lên" text="Font chữ, ảnh nền, logo của quán — tải lên một lần, dùng lại trong mọi trang. Đang dựng ở đợt ⑤." />}
        {section === 'brand' && <Placeholder title="Brand" text="Các thư mục lưu màu, font, ảnh mặc định của quán; kéo từ Tải lên vào, áp cho template và vài chỗ của dashboard. Đang dựng ở đợt ⑤." />}
        {section === 'su-kien' && <Events />}
        {section === 'more' && <More slug={slug} />}
      </div>
    </div>
  </div>;
}

function Home({ pages, slug, origin, onCreate }: { pages: Page[] | null; slug: string; origin: string; onCreate: () => void }) {
  return <section className={styles.grid}>
    <div className={styles.row}><h2>Dự án của bạn</h2><button type="button" className="qs-btn small" onClick={onCreate}><Icon name="plus" size={16} /> Tạo trang</button></div>
    {pages === null ? <p className="qs-muted">Đang tải…</p> : <div className={styles.tiles}>
      <button type="button" className={styles.tile} onClick={onCreate}><div className={styles.newTile}><Icon name="plus" size={28} /><span className="qs-small">Tạo mới</span></div></button>
      {pages.map(page => <a key={page.slug} className={styles.tile} href={`${origin}/${page.slug}`} target="_blank" rel="noreferrer">
        <div className={styles.thumb}><Thumb shop={slug} page={page.slug} /><span className={`qs-pill ${styles.tag}`}>{STATES[page.state] ?? page.state}</span></div>
        <strong>{page.label || page.slug}</strong><span className={styles.meta}>/{page.slug}</span></a>)}
    </div>}
  </section>;
}

/** The page drawn small: the real guest page in a frame, scaled to the tile. */
function Thumb({ shop, page }: { shop: string; page: string }) {
  const [scale, setScale] = useState(0.45);
  return <div ref={el => { if (el) { const w = el.getBoundingClientRect().width; if (w && Math.abs(w / 390 - scale) > 0.01) setScale(w / 390); } }}
    style={{ position: 'absolute', inset: 0 }}>
    <iframe src={`/ZZZ/${shop}/thumb/${page}`} sandbox="allow-same-origin" loading="lazy" tabIndex={-1} title={`Ảnh trang ${page}`} style={{ transform: `scale(${scale})` }} />
  </div>;
}

function Templates({ templates, busy, onUse }: { templates: TemplateCard[]; busy: boolean; onUse: (card: TemplateCard) => void }) {
  const [search, setSearch] = useState(''), [group, setGroup] = useState('Tất cả');
  const shown = useMemo(() => templates.filter(card => card.name.toLowerCase().includes(search.trim().toLowerCase())
    && (group === 'Tất cả' || (group === 'Thuỷ tinh' && card.glass) || (group === 'Trong suốt' && card.glass) || group === 'Simple')), [templates, search, group]);
  return <section className={styles.grid}>
    <div className={styles.search}><Icon name="search" size={18} /><input className={`qs-input ${styles.searchInput}`} placeholder="Tìm template" value={search} onChange={event => setSearch(event.target.value)} aria-label="Tìm template" /></div>
    <div className={styles.chips} role="group" aria-label="Nhóm template">{GROUPS.map(name => <button key={name} type="button" aria-pressed={group === name} onClick={() => setGroup(name)}>{name}</button>)}</div>
    <p className="qs-small qs-muted">Bộ template đang được làm lại theo mẫu mới. Các mẫu dưới đây dùng tạm để trang của quán chạy được ngay.</p>
    <div className={styles.tiles}>{shown.map(card => <button key={card.key} type="button" className={styles.tile} disabled={busy} onClick={() => onUse(card)} data-template={card.key}>
      <div className={styles.thumb} style={{ background: `linear-gradient(${card.angle}deg, ${card.colors.join(', ')})` }}>
        <span className={`qs-pill free ${styles.tag}`}>Free</span>
        <span style={{ width: '62%', height: 36, borderRadius: 999, background: 'rgba(255,255,255,.88)', boxShadow: '0 6px 18px rgba(0,0,0,.12)' }} aria-hidden="true" />
      </div>
      <strong>{card.number} · {card.name}</strong><span className={styles.meta}>Bấm để dùng mẫu này</span></button>)}
      {shown.length === 0 && <p className="qs-muted">Chưa có template nào trong nhóm này.</p>}
    </div>
  </section>;
}

function Events() {
  return <section className={styles.grid}>
    <h2>Sự kiện</h2>
    <p className="qs-muted qs-small">Sự kiện mở cho quán đã đăng ký gói sự kiện đó. Bấm Add để đưa sự kiện vào khúc B của một trang. Mọi khách đều thấy và nhận được — không bao giờ gắn với việc đánh giá Google.</p>
    <article className={styles.card} style={{ display: 'grid', gap: 10 }}>
      <div className={styles.row}><h3>Trải nghiệm A.I free 1 ngày</h3><span className="qs-pill free">Free</span></div>
      <p className="qs-muted qs-small">Khách nhận một tài khoản dùng A.I miễn phí trong 1 ngày; phần còn lại do bên tổ chức sự kiện lo.</p>
      <button type="button" className="qs-btn small" disabled>Add — chờ link của nhà tổ chức</button>
    </article>
  </section>;
}

function More({ slug }: { slug: string }) {
  const [state, setState] = useState<'' | 'sending' | 'sent' | 'already' | 'error'>('');
  return <section className={styles.grid}>
    <h2>More</h2>
    <article className={styles.card} style={{ display: 'grid', gap: 10 }}>
      <h3>Nhờ admin tạo giúp</h3>
      <p className="qs-muted qs-small">Thấy ngộp hoặc bận? Gửi yêu cầu, đội ngũ Quite Sensational sẽ dựng trang giúp bạn và báo lại.</p>
      <button type="button" className="qs-btn small" disabled={state === 'sending' || state === 'sent' || state === 'already'} onClick={async () => {
        setState('sending');
        const response = await fetch(`/api/owner/v2/${slug}/help`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) }).catch(() => null);
        const body = await response?.json().catch(() => ({}));
        setState(!response?.ok ? 'error' : body.already ? 'already' : 'sent');
      }}>{state === 'sent' ? 'Đã gửi — admin sẽ liên hệ' : state === 'already' ? 'Yêu cầu đã được gửi trước đó' : state === 'sending' ? 'Đang gửi…' : 'Gửi yêu cầu'}</button>
      {state === 'error' && <p className="qs-error">Chưa gửi được. Thử lại.</p>}
    </article>
    <article className={styles.card}><h3>Kết nối MCP</h3><p>Làm sau cùng, khi mọi phần khác đã xong.</p></article>
  </section>;
}

function Placeholder({ title, text }: { title: string; text: string }) {
  return <section className={`${styles.card} ${styles.empty}`}><strong>{title}</strong><span>{text}</span></section>;
}
