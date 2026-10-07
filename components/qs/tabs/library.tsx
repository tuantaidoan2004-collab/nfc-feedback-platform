'use client';
/**
 * Tab Library (kịch bản mục 8–9, Tài 06/10). Thanh bên: tạo mới, Home (các trang của quán), Template, Sự kiện, My Card. Chọn một
 * mẫu → xem mẫu mang tên quán → để lại số Zalo, nhờ Admin Tài dựng (components/qs/tabs/pages-ui.tsx); trang lên mạng khi Admin
 * Tài đã khớp nó với quán. Trong onboarding, đây là bước Template: chọn một mẫu, hoặc bỏ qua sang bước Dashboard.
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { TabProps } from './index';
import type { TemplateCard } from '@/lib/canvas/templates';
import type { PageSummary } from '@/lib/owner/pages';
import PageThumb from '@/components/canvas/thumb';
import styles from './tabs.module.css';
import Icon, { type IconName } from '../icons';
import { HowItWorks, PageSheet, StateTag, TemplateSheet, usePages } from './pages-ui';
import { EVENTS, EVENT_KEYS } from '@/lib/events/catalog';

type Section = 'home' | 'template' | 'su-kien';
const SECTIONS: [Section, string, IconName][] = [['home', 'Home', 'home'], ['template', 'Template', 'template'], ['su-kien', 'Sự kiện', 'event']];
// Nhóm template theo cách hoạt động (kịch bản mục 8), theo thứ tự Tài liệt kê; nhóm chưa có mẫu nào thì không hiện.
const ALL = 'Tất cả';

export default function LibraryTab({ slug, name, onboarding, query, templates, groups, origin }: TabProps) {
  const router = useRouter();
  const [section, setSection] = useState<Section>(onboarding ? 'template' : (['home', 'template', 'su-kien'].includes(query.muc ?? '') ? query.muc as Section : 'home'));
  const { pages, contact, reload } = usePages(slug);
  const [card, setCard] = useState<TemplateCard | null>(null), [open, setOpen] = useState<string | null>(null);
  // "Đổi sang mẫu khác" from a page (here or in My Card, ?trang=<page>): the template the owner picks next is for that page.
  const [restyle, setRestyle] = useState<string | null>(query.trang ?? null);
  const opened = pages?.find(page => page.slug === open) ?? null;
  const skip = async () => {
    await fetch(`/api/owner/v2/${slug}/onboarding`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ step: 'template', value: 'skipped' }) });
    router.push('/bat-dau/tien-trinh');
  };
  return <div>
    {onboarding && <section className={styles.banner} data-onboarding-template>
      <div className={styles.row}>
        <div><span className="qs-pill">Bước Template</span><h2 style={{ marginTop: 8 }}>Chọn một mẫu bạn thích</h2>
          <p className="qs-muted qs-small">Admin Tài sẽ nhắn Zalo để khớp mẫu với quán của bạn rồi phát hành. Mọi mẫu đều miễn phí trong giai đoạn trải nghiệm.</p></div>
        <div style={{ display: 'grid', justifyItems: 'center', gap: 4 }}>
          <button type="button" className="qs-btn" onClick={() => void skip()}>Bỏ qua, đến bước tạo Dashboard</button>
          <button type="button" className="qs-link" onClick={() => void skip()}>skip</button>
        </div>
      </div>
    </section>}
    <div className={styles.split}>
      <nav className={styles.side} aria-label="Library">
        <button type="button" className={styles.create} aria-label="Tạo mới" title="Tạo mới" onClick={() => setSection('template')}><Icon name="plus" /></button>
        {SECTIONS.map(([key, label, icon]) => <button key={key} type="button" aria-current={section === key ? 'page' : undefined} onClick={() => setSection(key)}>
          <Icon name={icon} size={20} />{label}</button>)}
        <Link href={`/app/${slug}/my-card`}><Icon name="card" size={20} />My Card</Link>
      </nav>
      <div className={styles.grid}>
        {section === 'home' && <Home pages={pages} slug={slug} onCreate={() => setSection('template')} onOpen={setOpen} />}
        {section === 'template' && <Templates templates={templates} groups={groups} name={name} onPick={setCard} />}
        {section === 'su-kien' && <Events />}
      </div>
    </div>
    {card && <TemplateSheet slug={slug} name={name} card={card} pages={pages ?? []} contact={contact} onboarding={onboarding} preferred={restyle}
      onClose={() => setCard(null)} onMade={() => { setRestyle(null); void reload(); }} />}
    {opened && <PageSheet slug={slug} page={opened} contact={contact} origin={origin} onClose={() => setOpen(null)} onChanged={() => void reload()}
      onPickTemplate={() => { setRestyle(opened.slug); setOpen(null); setSection('template'); }} />}
  </div>;
}

function Home({ pages, slug, onCreate, onOpen }: { pages: PageSummary[] | null; slug: string; onCreate: () => void; onOpen: (page: string) => void }) {
  return <section className={styles.grid}>
    <div className={styles.row}><h2>Trang của quán</h2><button type="button" className="qs-btn small" onClick={onCreate}><Icon name="plus" size={16} /> Chọn mẫu</button></div>
    {pages === null ? <p className="qs-muted">Đang tải…</p> : <div className={styles.tiles}>
      <button type="button" className={styles.tile} onClick={onCreate}><div className={styles.newTile}><Icon name="plus" size={28} /><span className="qs-small">Chọn mẫu</span></div></button>
      {pages.map(page => <article key={page.slug} className={styles.tile} data-page={page.slug}>
        <button type="button" className={styles.thumb} onClick={() => onOpen(page.slug)} aria-label={`Mở ${page.label || page.slug}`}>
          <PageThumb src={`/ZZZ/${slug}/thumb/${page.slug}`} title={`Ảnh trang ${page.slug}`} />
          <span className={styles.tag}><StateTag page={page} /></span><span className={styles.use}>Xem trang</span></button>
        <strong>{page.label || page.slug}</strong>
        <span className={styles.meta}>/{page.slug}</span></article>)}
    </div>}
  </section>;
}

/** Folded for search: "ca phe" finds "Cà phê". */
const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

function Templates({ templates, groups, name, onPick }: { templates: TemplateCard[]; groups: string[]; name: string; onPick: (card: TemplateCard) => void }) {
  const [search, setSearch] = useState(''), [group, setGroup] = useState(ALL);
  const chips = useMemo(() => [ALL, ...groups.filter(name => templates.some(card => card.groups.includes(name)))], [templates, groups]);
  const shown = useMemo(() => templates.filter(card => fold(`${card.name} ${card.about} ${card.groups.join(' ')}`).includes(fold(search.trim()))
    && (group === ALL || card.groups.includes(group))), [templates, search, group]);
  // Tài 06/10: every old template deleted while the new set is made.
  if (templates.length === 0) return <section className={styles.grid}>
    <HowItWorks />
    <p className="qs-muted" data-no-templates>Loạt mẫu mới đang được làm, sắp có. Cần trang ngay thì nhắn Admin Tài.</p>
  </section>;
  return <section className={styles.grid}>
    <HowItWorks />
    <div className={styles.search}><Icon name="search" size={18} /><input className={`qs-input ${styles.searchInput}`} placeholder="Tìm template" value={search} onChange={event => setSearch(event.target.value)} aria-label="Tìm template" /></div>
    <div className={styles.chips} role="group" aria-label="Nhóm template">{chips.map(name => <button key={name} type="button" aria-pressed={group === name} onClick={() => setGroup(name)}>{name}</button>)}</div>
    <div className={styles.tiles}>{shown.map(card => <article key={card.key} className={styles.tile} data-template={card.key}>
      <button type="button" className={styles.thumb} onClick={() => onPick(card)} aria-label={`Xem mẫu ${card.name}`}>
        {/* Every template already wears the shop's name: the shop sees its own page, not someone else's. */}
        <PageThumb src={`/templates/${card.key}?anh=1&ten=${encodeURIComponent(name)}`} title={`Mẫu ${card.name}`} />
        <span className={`qs-pill free ${styles.tag}`}>Free</span>
        <span className={styles.use}>Xem mẫu</span>
      </button>
      <strong>{card.name}</strong>
      <span className={styles.meta}>{card.groups.join(' · ')}</span>
    </article>)}
      {shown.length === 0 && <p className="qs-muted">Chưa có template nào khớp.</p>}
    </div>
  </section>;
}

function Events() {
  // Khúc B: sự kiện do admin mở cho quán ở /gov (lib/events/shop-events.ts); khối tự hiện dưới khúc đầu của mọi trang.
  return <section className={styles.grid}>
    <h2>Sự kiện</h2>
    <p className="qs-muted qs-small">Sự kiện do admin mở cho quán đã đồng ý tham gia. Khi mở, khối sự kiện tự hiện ngay dưới khúc đầu của mọi trang — bạn không phải thêm hay phát hành lại gì. Mọi khách đều thấy và nhận được — không bao giờ gắn với việc đánh giá Google.</p>
    {EVENT_KEYS.map(key => <article key={key} className={styles.card} style={{ display: 'grid', gap: 10 }}>
      <div className={styles.row}><h3>{EVENTS[key].title.vi}</h3><span className="qs-pill free">Free</span></div>
      <p className="qs-muted qs-small">{EVENTS[key].summary.vi}</p>
      <p className="qs-muted qs-small">Do {EVENTS[key].organizer} tổ chức. Muốn tham gia hoặc tạm dừng: nhắn admin.</p>
    </article>)}
  </section>;
}
