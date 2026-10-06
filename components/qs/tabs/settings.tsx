'use client';
/**
 * Tab Cài đặt (kịch bản mục 7): Hoạt động · Thanh toán · Hồ sơ — bố cục thường, tab bên trái, nội dung bên phải.
 * Thanh toán (kịch bản mục 3, 3b): gói đang dùng và hạn, ba gói, trả tháng hoặc năm; quán chưa tính phí thì mọi thứ mở.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { TabProps } from './index';
import styles from './tabs.module.css';
import ActivityPanel from '../../activity-panel';
import ProfilePanel, { useProfile } from '../../profile-panel';
import { PLANS, yearly, viDate, COLLAB_PRICE, type Billing } from '@/lib/billing/plans';
import { ZALO } from '@/lib/contact';
import PaymentPanel from '../payment-panel';

type View = 'activity' | 'billing' | 'profile';
const VIEWS: [View, string][] = [['activity', 'Hoạt động'], ['billing', 'Thanh toán'], ['profile', 'Hồ sơ']];

export default function SettingsTab({ slug, query, role, billing }: TabProps) {
  const [view, setView] = useState<View>(query.view === 'profile' ? 'profile' : query.view === 'billing' ? 'billing' : 'activity');
  const { profile, setProfile } = useProfile(view === 'profile');
  const router = useRouter(), [leaving, setLeaving] = useState(''), [busy, setBusy] = useState(false);
  // Signs this device out (the account's other devices stay signed in), then the sign-in page, back to this shop after.
  const signOut = async () => {
    setBusy(true); setLeaving('');
    try {
      const response = await fetch('/api/owner/v2/logout', { method: 'POST' });
      if (response.ok) { router.replace(`/owner/login?next=${encodeURIComponent(`/app/${slug}`)}`); return; }
      setLeaving('Chưa đăng xuất được. Thử lại.');
    } catch { setLeaving('Không thể kết nối. Thử lại.'); } finally { setBusy(false); }
  };
  return <div className={styles.split}>
    <nav className={styles.side} aria-label="Cài đặt">{VIEWS.map(([key, label]) =>
      <button key={key} type="button" aria-current={view === key ? 'page' : undefined} onClick={() => setView(key)}>{label}</button>)}
      {role !== 'support' && <button type="button" data-sign-out disabled={busy} onClick={() => void signOut()}>{busy ? 'Đang đăng xuất…' : 'Đăng xuất'}</button>}
      {leaving && <p className="qs-small qs-error" role="status">{leaving}</p>}</nav>
    <div>
      {view === 'activity' && <section className={styles.card}><h2>Hoạt động</h2><p>Ai đã làm gì trong quán, mới nhất trên cùng.</p>
        <div className={styles.legacy}><ActivityPanel endpoint={`/api/owner/v2/${slug}`} /></div></section>}
      {view === 'billing' && <BillingView slug={slug} billing={billing} />}
      {view === 'profile' && <section className={styles.card} style={{ display: 'grid', gap: 18 }}><h2>Hồ sơ</h2>
        {role === 'support' ? <p>Quản trị đang xem thay mặt quán: không xem được hồ sơ cá nhân.</p>
          : <div className={styles.legacy}><ProfilePanel slug={slug} profile={profile} setProfile={setProfile} password={<PasswordForm />} /></div>}
      </section>}
    </div>
  </div>;
}

/** What the shop is on now, in one sentence (kịch bản mục 3b). */
function current(billing: Billing) {
  const name = PLANS.find(plan => plan.key === billing.plan)?.name;
  if (billing.activateBy) return { title: `Đang dùng thử tới hết ngày ${viDate(billing.activateBy)}`,
    text: 'Kích hoạt bằng 10.000đ để mở ngay tháng đầu của gói bạn chọn; trong tháng đó chuyển nốt phần còn lại.' };
  if (billing.state === 'trial') return { title: 'Đang trong giai đoạn trải nghiệm — mọi thứ miễn phí',
    text: 'Mọi tính năng đều mở, mọi template đều Free. Khi bắt đầu tính phí cho quán, Admin Tài sẽ báo trước.' };
  if (billing.state === 'active') return { title: `Gói ${name} — dùng tới hết ngày ${viDate(billing.paidUntil!)}`,
    text: 'Gia hạn bằng chuyển khoản: chọn gói và kỳ bên dưới, quét mã bằng app ngân hàng.' };
  return { title: `Gói ${name} đã hết hạn ngày ${viDate(billing.paidUntil!)}`,
    text: `Trang của quán sẽ tắt từ ngày ${viDate(billing.offFrom!)} nếu chưa gia hạn. Khi đó thẻ vẫn đưa khách thẳng tới trang đánh giá Google của quán.` };
}

function BillingView({ slug, billing }: { slug: string; billing: Billing }) {
  const [cycle, setCycle] = useState<'month' | 'year'>('month');
  const now = current(billing);
  return <section className={styles.grid}>
    <div className={styles.banner} data-billing-state={billing.state}><h2 style={{ fontSize: 17 }}>{now.title}</h2>
      <p className="qs-small qs-muted">{now.text}</p>
      <a className="qs-small" href={ZALO.url} target="_blank" rel="noopener noreferrer" style={{ justifySelf: 'start' }}>Cần hỏi? Zalo Admin Tài {ZALO.number}</a></div>
    {(billing.state !== 'trial' || billing.activateBy) && <PaymentPanel slug={slug} />}
    <div className={styles.row}><h2>Gói dịch vụ</h2>
      <div className={styles.segmented} role="group" aria-label="Chu kỳ trả">
        <button type="button" aria-pressed={cycle === 'month'} onClick={() => setCycle('month')}>Theo tháng</button>
        <button type="button" aria-pressed={cycle === 'year'} onClick={() => setCycle('year')}>Theo năm · tặng 2 tháng</button>
      </div></div>
    <div className={styles.plans}>{PLANS.map(plan => <article key={plan.key} className={`${styles.card} ${styles.plan}`} data-current-plan={billing.plan === plan.key && billing.state !== 'trial' ? '' : undefined}>
      <h3>{plan.name}{billing.plan === plan.key && billing.state !== 'trial' && <small className="qs-muted"> · đang dùng</small>}</h3>
      <div className={styles.price}>{(cycle === 'month' ? plan.monthly : yearly(plan)).toLocaleString('vi-VN')}đ<small>/{cycle === 'month' ? 'tháng' : 'năm'}</small></div>
      <ul>{plan.features.map(feature => <li key={feature}>{feature}</li>)}</ul>
    </article>)}</div>
    <p className="qs-small qs-muted">Không giới hạn số trang. Collab {COLLAB_PRICE.toLocaleString('vi-VN')}đ trả một lần cho mỗi collab, cần gói Sự kiện. Thẻ NFC vật lý bán riêng, ngoài gói. Chuỗi lớn: nhắn Admin Tài.</p>
  </section>;
}

const PASSWORD_ERRORS: Record<string, string> = {
  WRONG_PASSWORD: 'Mật khẩu hiện tại chưa đúng.', WEAK_PASSWORD: 'Mật khẩu mới cần ít nhất 12 ký tự.', SAME_PASSWORD: 'Mật khẩu mới phải khác mật khẩu hiện tại.',
  TOO_MANY_ATTEMPTS: 'Thử sai quá nhiều lần. Đợi 15 phút rồi thử lại.', LOGIN_REQUIRED: 'Phiên đăng nhập đã hết hạn. Đăng nhập lại rồi đổi mật khẩu.',
};
/** The owner's own password. Other devices signed in to this account are signed out; this one stays. */
function PasswordForm() {
  const [values, setValues] = useState({ current: '', next: '', confirm: '' }), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
  const set = (key: keyof typeof values) => (event: React.ChangeEvent<HTMLInputElement>) => { setValues({ ...values, [key]: event.target.value }); setNotice(''); };
  return <form style={{ display: 'grid', gap: 10, maxWidth: 420 }} onSubmit={async event => {
    event.preventDefault();
    if (values.next.length < 12) { setNotice(PASSWORD_ERRORS.WEAK_PASSWORD); return; }
    if (values.next !== values.confirm) { setNotice('Hai lần nhập mật khẩu mới chưa giống nhau.'); return; }
    setBusy(true);
    try {
      const response = await fetch('/api/owner/v2/password', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ current: values.current, next: values.next }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) { setNotice(PASSWORD_ERRORS[body.error] ?? 'Chưa đổi được mật khẩu. Thử lại.'); return; }
      setValues({ current: '', next: '', confirm: '' }); setNotice('Đã đổi mật khẩu. Các máy khác đang đăng nhập đã bị đăng xuất.');
    } catch { setNotice('Không thể kết nối. Vui lòng thử lại.'); } finally { setBusy(false); }
  }}>
    <h3>Đổi mật khẩu</h3>
    <label className="qs-field">Mật khẩu hiện tại<input className="qs-input" type="password" autoComplete="current-password" required value={values.current} onChange={set('current')} /></label>
    <label className="qs-field">Mật khẩu mới <small>(ít nhất 12 ký tự)</small><input className="qs-input" type="password" autoComplete="new-password" required minLength={12} value={values.next} onChange={set('next')} /></label>
    <label className="qs-field">Nhập lại mật khẩu mới<input className="qs-input" type="password" autoComplete="new-password" required value={values.confirm} onChange={set('confirm')} /></label>
    <button className="qs-btn" disabled={busy}>{busy ? 'Đang đổi…' : 'Đổi mật khẩu'}</button>
    <p role="status" className="qs-small qs-muted">{notice}</p>
  </form>;
}
