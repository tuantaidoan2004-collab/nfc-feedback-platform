'use client';
/**
 * Tab Dashboard (kịch bản mục 7) — theo ảnh YouTube Studio Tài gửi 05/10, đổi cho đúng bản chất nền tảng: "video mới nhất"
 * thành thẻ (trang) mới nhất, "người đăng ký" thành điểm Google, "người đăng ký gần đây" thành phản hồi gần đây, "bài đăng
 * đầu tiên" thành thẻ đầu tiên. Ba cột xếp kiểu gạch như Studio trên máy tính; một cột trên điện thoại, số của quán đứng sớm.
 * Từ tool Google Maps (Tài 05/10 tối: giữ nguyên Dashboard, ghép thêm cho khớp): dòng "Cần xử lý" trong "Số liệu của quán"
 * và ô "Đánh giá theo tháng" cùng phân bố số sao (components/qs/tabs/reviews-ui.tsx).
 * Số liệu: lib/owner/overview.ts, một lần gọi.
 */
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { TabProps } from './index';
import type { Overview } from '@/lib/owner/overview';
import { relativeTime } from '@/lib/relative-time';
import Icon from '../icons';
import TabActions from '../tab-actions';
import { FirstCardArt, NewTemplatesArt } from './dashboard-art';
import { ESTIMATE, momentOf } from './google-business';
import { LOW, MonthlyChart, StarBars } from './reviews-ui';
import styles from './dashboard.module.css';

const number = (n: number) => n.toLocaleString('vi-VN');
const percent = (part: number, whole: number) => whole ? `${(part / whole * 100).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%` : '—';
const clock = (ms: number | null) => ms === null ? '—' : `${Math.floor(ms / 60000)}:${String(Math.round(ms / 1000) % 60).padStart(2, '0')}`;
/** "17 ngày 12 giờ đầu tiên" as Studio writes it; under two days only the hours. */
function since(iso: string) {
  const hours = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 3600000));
  if (hours < 48) return `${hours} giờ đầu tiên`;
  const days = Math.floor(hours / 24), rest = hours % 24;
  return rest ? `${days} ngày ${rest} giờ đầu tiên` : `${days} ngày đầu tiên`;
}
function Trend({ now, before }: { now: number; before: number }) {
  if (!before && !now) return <span className={styles.flat} aria-label="Chưa đủ dữ liệu để so sánh">—</span>;
  if (!before) return <span className={styles.up} aria-label="Mới so với 28 ngày trước">↑</span>;
  const change = Math.round((now - before) / before * 100);
  if (change === 0) return <span className={styles.flat} aria-label="Bằng 28 ngày trước">—</span>;
  return <span className={change > 0 ? styles.up : styles.down} title={`${change > 0 ? '+' : ''}${change}% so với 28 ngày trước`}>{change > 0 ? '↑' : '↓'}</span>;
}
function Stars({ value }: { value: number }) {
  return <span className={styles.stars} aria-label={`${value} sao`}>{'★'.repeat(value)}<span>{'★'.repeat(5 - value)}</span></span>;
}

/** The page drawn still (no visit recorded), standing upright in the middle of a 16:9 frame like a short in Studio. */
function Still({ src }: { src: string }) {
  const box = useRef<HTMLDivElement>(null), [fit, setFit] = useState({ scale: 0.3, left: 0 });
  useEffect(() => {
    const el = box.current; if (!el) return;
    const measure = () => { const { width, height } = el.getBoundingClientRect(); const scale = height / 693; setFit({ scale, left: (width - 390 * scale) / 2 }); };
    const watch = new ResizeObserver(measure); watch.observe(el);
    return () => watch.disconnect();
  }, []);
  return <div ref={box} className={styles.still}>
    <iframe src={src} title="" tabIndex={-1} loading="lazy" sandbox="allow-same-origin" style={{ transform: `translateX(${fit.left}px) scale(${fit.scale})` }} />
  </div>;
}

export default function DashboardTab({ slug, origin }: TabProps) {
  const [data, setData] = useState<Overview | null>(null), [error, setError] = useState(''), [open, setOpen] = useState(true), [brief, setBrief] = useState(false);
  useEffect(() => {
    fetch(`/api/owner/v2/${slug}/overview`, { cache: 'no-store' }).then(async response => {
      if (!response.ok) { setError('Chưa tải được số liệu.'); return; }
      setData(await response.json());
    }).catch(() => setError('Không thể kết nối. Thử lại sau.'));
  }, [slug]);
  const latest = data?.latest, s = data?.summary;
  const library = `/app/${slug}/library`;

  const actions = <TabActions>
    <Link className={styles.round} href={`${library}?muc=template`} title="Tạo thẻ mới" aria-label="Tạo thẻ mới"><Icon name="create" /></Link>
    {latest && <a className={styles.round} href={`${origin}/${latest.slug}`} target="_blank" rel="noreferrer" title="Mở trang khách" aria-label="Mở trang khách"><Icon name="external" /></a>}
    <Link className={styles.round} href={library} title="Sửa trang" aria-label="Sửa trang"><Icon name="pencil" /></Link>
  </TabActions>;
  if (error) return <>{actions}<p className="qs-error">{error}</p></>;
  if (!data || !s) return <>{actions}<div className={styles.board} aria-busy="true">{[0, 1, 2].map(i => <div key={i} className={`${styles.card} ${styles.skeleton}`} />)}</div></>;

  const firstStep = data.pages.published === 0
    ? { text: 'Tạo thẻ đầu tiên: khách chạm là mở trang của quán, đánh giá Google ngay trên đó.', label: 'Tạo thẻ', href: `${library}?muc=template` }
    : data.pages.activeCards === 0
      ? { text: 'Gắn thẻ NFC đầu tiên lên bàn: mỗi lần chạm là một khách tới trang của quán.', label: 'Xem My Card', href: `/app/${slug}/my-card` }
      : { text: 'Thêm một sự kiện vào trang để khách quay lại: ưu đãi, đêm nhạc, món mới.', label: 'Mở Sự kiện', href: `${library}?muc=su-kien` };

  return <>{actions}<div className={styles.board}>
    <div className={styles.column}>
      {latest ? <section className={styles.card} data-order="1" aria-labelledby="latest-title">
        <h2 id="latest-title">Hiệu suất của thẻ mới nhất</h2>
        <a className={styles.thumb} href={`${origin}/${latest.slug}`} target="_blank" rel="noreferrer">
          <Still src={`/ZZZ/${slug}/thumb/${latest.slug}`} />
          <span>{latest.label}</span>
        </a>
        <div className={styles.quick}>
          <span title="Lượt mở trang"><Icon name="dashboard" size={20} /> {number(latest.opens)}</span>
          <span title="Lượt bấm Google"><Icon name="google" size={20} /> {number(latest.google)}</span>
          <span title="Góp ý riêng"><Icon name="data" size={20} /> {number(latest.feedback)}</span>
          <button type="button" className={styles.toggle} aria-expanded={open} aria-label={open ? 'Thu gọn' : 'Mở rộng'} onClick={() => setOpen(v => !v)}><Icon name="chevron" size={20} /></button>
        </div>
        {open && <>
          <p className={styles.caption}>{since(latest.publishedAt)}</p>
          <dl className={styles.rows}>
            <div><dt>Lượt mở trang</dt><dd>{number(latest.opens)}</dd></div>
            <div><dt>Tỷ lệ bấm Google</dt><dd>{percent(latest.google, latest.opens)}</dd></div>
            <div><dt>Bấm Google sau trung bình</dt><dd>{clock(latest.googleAfterMs)}</dd></div>
          </dl>
          <button type="button" className={styles.sparkle} aria-expanded={brief} onClick={() => setBrief(v => !v)}><Icon name="sparkle" size={18} /> Tóm tắt nhanh thẻ này</button>
          {brief && <p className={styles.brief}>
            {latest.opens ? <>“{latest.label}” đã được mở {number(latest.opens)} lần. Cứ 100 lượt mở thì khoảng {Math.round(latest.google / latest.opens * 100)} lượt bấm
              sang Google{latest.googleAfterMs !== null && <>, trung bình sau {Math.round(latest.googleAfterMs / 1000)} giây</>}; {number(latest.feedback)} khách gửi góp ý riêng
              cho quán.</> : <>“{latest.label}” chưa có lượt mở nào. Gắn thẻ lên bàn hoặc in mã QR để khách bắt đầu ghé.</>}
          </p>}
          <div className={styles.iconRow}>
            <Link className={styles.roundSoft} href={`/app/${slug}/data`} title="Tới Data" aria-label="Tới Data"><Icon name="data" size={20} /></Link>
            <Link className={styles.roundSoft} href={`/app/${slug}/my-card`} title="Tới My Card" aria-label="Tới My Card"><Icon name="card" size={20} /></Link>
          </div>
        </>}
      </section> : null}
      <section className={`${styles.card} ${styles.prompt}`} data-order="5">
        <div className={styles.promptBox}>
          <FirstCardArt />
          <p>{firstStep.text}</p>
          <Link className={styles.pill} href={firstStep.href}>{firstStep.label}</Link>
        </div>
      </section>
    </div>

    <div className={styles.column}>
      <section className={styles.card} data-order="2" aria-labelledby="shop-title">
        <h2 id="shop-title">Số liệu của quán</h2>
        <p className={styles.label}>Đánh giá Google hiện tại</p>
        {!data.google ? <><p className={styles.big}>—</p><Link className={styles.inline} href={`/app/${slug}/data`}>Dán link Google Maps của quán →</Link></>
          // Google's figures are the owner's alone (google-policy.md rule 10).
          : !data.google.figures ? <><p className={styles.big}>—</p><p className={styles.quiet}>Chỉ chủ quán xem điểm Google.</p></>
          : <><p className={styles.big}>{data.google.rating?.toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) ?? '—'}
            <small><b>★</b> {number(data.google.total ?? 0)} đánh giá <em className="qs-pill">{ESTIMATE}</em></small></p>
            {data.google.source === 'maps' && data.google.syncedAt && <p className={styles.caption}>Google Maps · {momentOf(data.google.syncedAt)}</p>}</>}
        {data.needs && <Needs slug={slug} google={data.needs.google} own={data.needs.private} />}
        <hr />
        <h3>Tóm tắt</h3>
        <p className={styles.caption}>28 ngày qua</p>
        <dl className={styles.rows}>
          <div><dt>Lượt mở trang</dt><dd>{number(s.opens)} <Trend now={s.opens} before={s.opensBefore} /></dd></div>
          <div><dt>Lượt bấm Google</dt><dd>{number(s.google)} <Trend now={s.google} before={s.googleBefore} /></dd></div>
          <div><dt>Góp ý riêng</dt><dd>{number(s.feedback)} <Trend now={s.feedback} before={s.feedbackBefore} /></dd></div>
        </dl>
        <hr />
        <h3>Thẻ hàng đầu</h3>
        <p className={styles.caption}>48 giờ qua · Lượt mở trang</p>
        {data.top.length ? <ol className={styles.top}>{data.top.map(page => <li key={page.slug}><span>{page.label}</span><strong>{number(page.opens)}</strong></li>)}</ol>
          : <p className={styles.quiet}>Chưa có lượt mở nào trong 48 giờ qua.</p>}
        <Link className={styles.pill} href={`/app/${slug}/data`}>Chuyển đến Data</Link>
      </section>
      <section className={styles.card} data-order="4" aria-labelledby="recent-title">
        <h2 id="recent-title">Phản hồi gần đây</h2>
        <p className={styles.caption}>Toàn thời gian</p>
        {data.recent === null ? <p className={styles.quiet}><Icon name="lock" size={16} /> Bạn chưa có quyền đọc góp ý của quán.</p>
          : data.recent.length === 0 ? <p className={styles.quiet}>Chưa có phản hồi nào. Khi khách gửi góp ý hay đánh giá Google, chúng hiện ở đây.</p>
          : <ul className={styles.people}>{data.recent.map((item, i) => <li key={i}>
            <span className={styles.face} data-kind={item.kind}>{item.kind === 'google' ? (item.name?.[0] ?? 'G') : <Icon name="lock" size={18} />}</span>
            <div>
              <strong>{item.kind === 'google' ? item.name ?? 'Người dùng Google' : 'Góp ý riêng'}{item.stars ? <> <Stars value={item.stars} /></> : null}</strong>
              {item.text && <p>{item.text}</p>}
              <small>{item.kind === 'google' ? 'Google' : 'Chỉ quán thấy'} · {relativeTime(item.at)}</small>
            </div>
          </li>)}</ul>}
        <Link className={styles.pill} href={`/app/${slug}/data`}>Xem tất cả</Link>
      </section>
    </div>

    <div className={styles.column}>
      {data.googleMonths && data.googleStars && <section className={styles.card} data-order="3" aria-labelledby="monthly-title">
        <h2 id="monthly-title">Đánh giá theo tháng</h2>
        <p className={styles.caption}>{data.google?.source === 'maps' ? 'Theo ngày đăng ước đoán từ “x tháng trước” trên Google Maps' : 'Theo ngày đăng trên Google'} · 12 tháng gần nhất</p>
        {data.googleStars.counts.some(Boolean) ? <MonthlyChart data={data.googleMonths} /> : <p className={styles.quiet}>Chưa có đánh giá Google nào. Đánh giá về sau lần đọc đầu tiên.</p>}
        <hr />
        <h3>Phân bố số sao</h3>
        <p className={styles.caption}>{number(data.googleStars.withText)} đánh giá có nội dung</p>
        <StarBars counts={data.googleStars.counts} />
      </section>}
      <section className={styles.card} data-order="6" aria-labelledby="news-title">
        <h2 id="news-title">Tin tức</h2>
        <div className={styles.newsArt}><NewTemplatesArt /></div>
        <h3 className={styles.newsTitle}>Template mới trong Library</h3>
        <p className={styles.quiet}>Các mẫu dựng lại từ đầu, mỗi mẫu một kiểu chơi: thẻ bấm được kiểu party, nha khoa, khách sạn, cà phê, salon… Chọn một mẫu rồi
          phát hành luôn, hoặc nhờ admin sửa theo ý bạn.</p>
        <Link className={styles.pill} href={`${library}?muc=template`}>Khám phá</Link>
      </section>
    </div>
  </div></>;
}

/**
 * "Cần xử lý" (the tool's red figure): Google reviews of 1–3★ still unanswered and not handled, and private feedback not yet
 * handled. One line in "Số liệu của quán", opening Data on that tab.
 */
function Needs({ slug, google, own }: { slug: string; google: number; own: number }) {
  const total = google + own;
  return <Link className={styles.needs} href={`/app/${slug}/data?xem=can-xu-ly`} data-alert={total > 0} data-needs>
    <span className={styles.needsIcon}><Icon name={total ? 'alert' : 'check'} size={18} /></span>
    <span className={styles.needsText}><b>Cần xử lý</b>
      <small>{!total ? 'Không còn gì cần xử lý' : [google && `${number(google)} đánh giá ≤ ${LOW}★ chưa trả lời`, own && `${number(own)} góp ý riêng`].filter(Boolean).join(' · ')}</small></span>
    <strong>{number(total)}</strong>
    <Icon name="arrow" size={18} />
  </Link>;
}
