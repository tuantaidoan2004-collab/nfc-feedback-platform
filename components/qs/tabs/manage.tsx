'use client';
/**
 * Tab Quản lý (kịch bản mục 7): lấy từ "Cài đặt" cũ và làm tốt hơn — thành viên và quyền, thẻ NFC, tạm dừng khẩn cấp, mức hỗ
 * trợ của nền tảng. Bản khung dùng lại các panel cũ đang chạy đúng (màu đã trỏ sang giao diện mới); dựng lại cho đẹp ở đợt ⑤.
 */
import { useCallback, useEffect, useState } from 'react';
import type { TabProps } from './index';
import styles from './tabs.module.css';
import TeamPanel from '../../team-panel';
import CardsPanel from '../../cards-panel';
import AdminBadge from '../../admin-badge';
import { SUPPORT_SCOPES, clock } from '../support-banner';
import type { AdminVisit } from '@/lib/owner/dashboard';

const LEVELS: [string, string, string][] = [
  ['off', 'Tắt', 'Quản trị nền tảng chỉ xem số liệu tổng quan.'],
  ['view', 'Khấc 1 · Xem', 'Xem số liệu và đọc nội dung góp ý.'],
  ['edit', 'Khấc 2 · Sửa', 'Sửa giao diện, nút và link. Không thấy dữ liệu nào.'],
  ['full', 'Khấc 3 · Toàn quyền', 'Xem số liệu, đọc góp ý và sửa giao diện.'],
];

type Support = { level: string; history: { level: string; by: string; at: string }[] };
const LEVEL_NAMES: Record<string, string> = Object.fromEntries(LEVELS.map(([value, label]) => [value, label]));
const ENDINGS: Record<string, string> = { ended: 'đã kết thúc', superseded: 'bị thay bằng phiên mới', expired: 'hết hạn' };

export default function ManageTab({ slug, origin, role }: TabProps) {
  const endpoint = `/api/owner/v2/${slug}`;
  const [support, setSupport] = useState<Support | null>(null), [visits, setVisits] = useState<AdminVisit[]>([]), [notice, setNotice] = useState('');
  const load = useCallback(async () => {
    const body = await fetch(`${endpoint}/summary`, { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null);
    if (body) { setSupport(body.support); setVisits(body.adminVisits ?? []); }
  }, [endpoint]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  // The chosen position shows at once; the saved one takes over when the server answers.
  const [chosen, setChosen] = useState<string | null>(null);
  const level = support?.level ?? null, shown = chosen ?? level;
  const choose = async (next: string) => {
    setChosen(next); setNotice('Đang lưu…');
    const response = await fetch(`${endpoint}/support`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ level: next }) }).catch(() => null);
    if (response?.ok) { setNotice('Đã đổi.'); await load(); } else setNotice('Chỉ chủ quán đổi được mức này.');
    setChosen(null);
  };
  return <div className={styles.grid}>
    <section className={styles.card}><h2>Thành viên và quyền</h2><p>Mời nhân viên, chia vai, cấp quyền sửa trang hay đọc góp ý.</p>
      <div className={styles.legacy}><TeamPanel endpoint={endpoint} /></div></section>
    <section className={styles.card}><h2>Thẻ NFC</h2><p>Mỗi thẻ mở một trang của quán. Nhân bản, đổi tên, bật hoặc tắt thẻ.</p>
      <div className={styles.legacy}><CardsPanel endpoint={endpoint} origin={origin} /></div></section>
    <EmergencyStop slug={slug} role={role} />
    <section className={styles.card} data-support={level ?? undefined}><h2>Hỗ trợ từ Quite Sensational</h2><p>Bạn quyết định đội ngũ nền tảng được làm gì khi hỗ trợ quán. Mọi lần xem đều được ghi lại.</p>
      <div className={styles.list} style={{ marginTop: 12 }} role="radiogroup" aria-label="Mức hỗ trợ">{LEVELS.map(([value, label, text]) =>
        <label key={value} className={styles.item} style={{ gridTemplateColumns: 'auto 1fr', cursor: role === 'owner' ? 'pointer' : 'default' }}>
          <input type="radio" name="support" checked={shown === value} disabled={role !== 'owner' || chosen !== null} onChange={() => void choose(value)} />
          <span><strong style={{ fontSize: 14 }}>{label}</strong><br /><span className="qs-small qs-muted">{text}</span></span></label>)}</div>
      <p className="qs-small qs-muted" role="status">{notice}</p>
      {!!support?.history.length && <p className="qs-small qs-muted" data-support-history>
        {support.history.map(h => `${LEVEL_NAMES[h.level] ?? h.level} bởi ${h.by} lúc ${clock(h.at)}`).join(' · ')}</p>}
      {/* Every visit of the platform's people, with the reason exactly as they typed it (lát F2): the shop sees who looked and why. */}
      <div data-admin-visits style={{ marginTop: 14 }}><h3>Lượt Quite Sensational vào quán</h3>
        {visits.length === 0 ? <p className="qs-small qs-muted">Chưa có lượt nào.</p> : <ul className={styles.list} style={{ marginTop: 8 }}>{visits.map(visit =>
          <li key={visit.id} className={styles.item} style={{ gridTemplateColumns: '1fr' }} data-admin-visit={visit.id}>
            <span className="qs-small"><AdminBadge handle={visit.admin} title={visit.admin_title} /> · {clock(visit.started_at)} · {SUPPORT_SCOPES[visit.scope as keyof typeof SUPPORT_SCOPES] ?? visit.scope}</span>
            <span data-reason>{visit.reason}</span>
            <span className="qs-small qs-muted">{visit.ended_at ? `${ENDINGS[visit.end_reason ?? 'ended'] ?? 'đã kết thúc'} lúc ${clock(visit.ended_at)}` : `hết hạn lúc ${clock(visit.expires_at)}`} · {visit.reads} lần xem</span>
          </li>)}</ul>}
      </div></section>
  </div>;
}

type Page = { slug: string; label: string | null; state: string; pauseReason: string | null };
const STOP_ERRORS: Record<string, string> = {
  OWNER_ROLE_REQUIRED: 'Chỉ chủ quán tạm dừng hoặc mở lại được trang.', REASON_REQUIRED: 'Cần ghi lý do (tối đa 1000 ký tự) để đội ngũ hỗ trợ đúng việc.',
  PAGE_NOT_LIVE: 'Trang này không còn đang chạy.', PAGE_NOT_PAUSED: 'Trang này không còn tạm dừng.', PAUSE_NOT_YOURS: 'Trang do Quite Sensational tạm dừng: liên hệ đội ngũ để mở lại.',
  PAGE_CLOSED: 'Trang đã đóng.',
};
/**
 * Tạm dừng khẩn cấp (lát P4, kịch bản mục 7): the owner stops a page at once when something on it is wrong -- guests who tap
 * a card see "Trang tạm ngừng", nothing is lost -- and a report goes to Quite Sensational. The owner starts it again here; a
 * page the platform paused is the platform's to start.
 */
function EmergencyStop({ slug, role }: { slug: string; role: string }) {
  const [pages, setPages] = useState<Page[] | null>(null), [notice, setNotice] = useState(''), [busy, setBusy] = useState('');
  const load = useCallback(async () => {
    const response = await fetch(`/api/owner/v2/${slug}/pages`, { cache: 'no-store' }).catch(() => null);
    setPages(response?.ok ? (await response.json()).pages : []);
  }, [slug]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  const act = async (page: Page, action: 'pause' | 'resume') => {
    let reason = '';
    if (action === 'pause') {
      reason = window.prompt(`Tạm dừng trang /${page.slug} ngay? Khách chạm thẻ sẽ thấy "Trang tạm ngừng" cho tới khi bạn mở lại.\nGhi ngắn chuyện gì xảy ra để Quite Sensational hỗ trợ:`)?.trim() ?? '';
      if (!reason) return;
    }
    setBusy(page.slug); setNotice('');
    try {
      const response = await fetch(`/api/owner/v2/${slug}/pages`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action === 'pause' ? { action, page: page.slug, reason } : { action, page: page.slug }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) { setNotice(STOP_ERRORS[body.error] ?? 'Chưa làm được. Thử lại.'); return; }
      setNotice(action === 'pause' ? `Đã tạm dừng /${page.slug}. Quite Sensational đã nhận báo cáo.` : `Đã mở lại /${page.slug}.`); await load();
    } catch { setNotice('Không thể kết nối. Thử lại.'); } finally { setBusy(''); }
  };
  const shown = (pages ?? []).filter(page => page.state === 'active' || page.state === 'paused');
  return <section className={styles.card} data-emergency><h2>Tạm dừng khẩn cấp</h2>
    <p>Trang có lỗi (link sai, chữ sai)? Dừng ngay: khách chạm thẻ thấy &quot;Trang tạm ngừng&quot;, dữ liệu giữ nguyên, và đội ngũ Quite Sensational được báo.</p>
    {pages === null ? <p className="qs-small qs-muted">Đang tải…</p> : shown.length === 0 ? <p className="qs-small qs-muted">Chưa có trang nào đang chạy.</p>
      : <ul className={styles.list} style={{ marginTop: 12 }}>{shown.map(page => <li key={page.slug} className={styles.item} style={{ gridTemplateColumns: '1fr auto', alignItems: 'center' }}
        data-stop-page={page.slug}>
        <span><strong style={{ fontSize: 14 }}>{page.label || 'Trang chưa đặt tên'}</strong> <span className="qs-small qs-muted">/{page.slug}</span><br />
          <span className={styles.dot} data-state={page.state}>{page.state === 'active' ? 'Đang chạy' : page.pauseReason === 'emergency' ? 'Bạn đã tạm dừng' : 'Quite Sensational đang tạm dừng'}</span></span>
        {role === 'owner' && (page.state === 'active'
          ? <button type="button" className="qs-btn ghost small" disabled={busy === page.slug} onClick={() => void act(page, 'pause')}>Tạm dừng ngay</button>
          : page.pauseReason === 'emergency' && <button type="button" className="qs-btn small" disabled={busy === page.slug} onClick={() => void act(page, 'resume')}>Mở lại</button>)}
      </li>)}</ul>}
    {role !== 'owner' && <p className="qs-small qs-muted">Chỉ chủ quán tạm dừng hoặc mở lại được trang.</p>}
    <p className="qs-small qs-muted" role="status">{notice}</p>
  </section>;
}
