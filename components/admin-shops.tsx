'use client';
import { useState } from 'react';
import styles from './admin.module.css';
import { buttonClass } from './platform/ui';

import { PLACE_ID_FINDER } from '@/lib/google/place-id';
import { PLANS, viDate, type Billing } from '@/lib/billing/plans';

export type ShopRow = {
  id: string; slug: string; name: string; publishing_state: string; is_template: boolean;
  tags: number; active_tags: number;
  owner_user_id: string | null; owner_username: string | null; owner_email: string | null; last_seen: string | null;
  support_level: 'off' | 'view' | 'edit' | 'full';
  pages: number;
  /** Gói và hạn (kịch bản mục 3b). */
  billing: Billing;
};
const PLAN_NAMES = Object.fromEntries(PLANS.map(plan => [plan.key, plan.name])) as Record<string, string>;
/** One line for the operator: which plan, until when, and what the shop's guests see now. */
const billingText = (b: Billing) => b.state === 'trial' ? `Chưa tính phí${b.plan ? ` · ${PLAN_NAMES[b.plan]}` : ''}`
  : `${PLAN_NAMES[b.plan!]} · ${b.state === 'active' ? 'tới' : 'hết hạn'} ${viDate(b.paidUntil!)}${b.state === 'grace' ? ` · tắt trang từ ${viDate(b.offFrom!)}` : b.state === 'off' ? ' · trang đã tắt' : ''}`;
/** The owner's four positions, as the operator sees them (migration 012). */
/** What each publishing state means to the operator (migration 003); the raw word stays on data-publishing-state. */
const STATES: Record<string, string> = { draft: 'nháp', active: 'đang chạy', suspended: 'bị treo' };
const LEVELS: Record<ShopRow['support_level'], string> = { off: 'Tắt', view: 'Khấc 1 · Xem', edit: 'Khấc 2 · Sửa', full: 'Khấc 3 · Toàn quyền' };
const allows = (row: ShopRow, scope: 'overview' | 'feedback' | 'design') =>
  scope === 'overview' ? row.support_level !== 'edit' : scope === 'feedback' ? ['view', 'full'].includes(row.support_level) : ['edit', 'full'].includes(row.support_level);

type Handover = { slug: string; name: string; tagCode: string; ownerUsername: string; ownerUserId: string; setupUrl: string | null; expiresAt: string };

const failed = (status: number) =>
  status === 409 ? 'Tài khoản hoặc email này đã được dùng cho shop khác.'
  : status === 400 ? 'Thông tin chưa hợp lệ. Kiểm tra lại tên, tài khoản, email và Place ID.'
  : status === 401 ? 'Phiên đã hết hạn. Hãy đăng nhập lại.'
  : 'Dịch vụ đang gián đoạn. Vui lòng thử lại.';

/** `templates`: the canvas templates a new shop may start from (lib/canvas/templates.ts), the first being the default. */
export default function AdminShops({ initial, origin, templates }: { initial: ShopRow[]; origin: string | null; templates: { key: string; name: string }[] }) {
  const [shops, setShops] = useState(initial);
  const [handover, setHandover] = useState<Handover | null>(null);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [standIn, setStandIn] = useState<ShopRow | null>(null);
  const [templateLink, setTemplateLink] = useState<string | null>(null);
  const [planFor, setPlanFor] = useState<ShopRow | null>(null);

  const savePlan = async (row: ShopRow, form: FormData) => {
    setBusy(true); setError('');
    const plan = String(form.get('plan') ?? ''), until = String(form.get('paidUntil') ?? '');
    try {
      const response = await fetch('/gov/api/shops/plan', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shopId: row.id, plan: plan || null, paidUntil: plan ? until || null : null }) });
      if (!response.ok) { setError(response.status === 400 ? 'Chọn gói và một ngày hợp lệ (bỏ gói thì để trống ngày).' : failed(response.status)); return; }
      setPlanFor(null); setError(`Đã lưu gói cho ${row.name}.`); await refresh();
    } catch { setError('Không thể kết nối. Vui lòng thử lại.'); } finally { setBusy(false); }
  };

  const refresh = async () => {
    const response = await fetch('/gov/api/shops', { credentials: 'same-origin' });
    if (response.ok) setShops((await response.json()).shops);
  };

  const reissue = async (row: ShopRow) => {
    if (!row.owner_user_id) return;
    setBusy(true); setError('');
    try {
      const response = await fetch('/gov/api/setup-links', { method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ownerUserId: row.owner_user_id, shopId: row.id }) });
      if (!response.ok) { setError(failed(response.status)); return; }
      const body = await response.json();
      setHandover({ slug: row.slug, name: row.name, tagCode: '', ownerUsername: row.owner_username ?? '', ownerUserId: row.owner_user_id,
        setupUrl: body.setupUrl, expiresAt: body.expiresAt });
    } catch { setError('Không thể kết nối. Vui lòng thử lại.'); } finally { setBusy(false); }
  };

  const impersonate = async (row: ShopRow, form: FormData) => {
    if (!row.owner_user_id) return;
    setBusy(true); setError('');
    try {
      const response = await fetch('/gov/api/impersonations', { method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shopId: row.id, ownerUserId: row.owner_user_id, scope: form.get('scope'), reason: form.get('reason') }) });
      if (!response.ok) {
        setError(response.status === 400 ? 'Lý do cần từ 10 đến 200 ký tự, không xuống dòng.'
          : response.status === 403 ? ((await response.json()).error === 'SUPPORT_NOT_GRANTED'
            ? 'Chủ shop chưa bật quyền đọc góp ý. Mở phạm vi tổng quan, hoặc nhờ chủ shop bật công tắc.'
            : 'Shop hoặc chủ shop đang không hoạt động nên không xem thay mặt được.') : failed(response.status));
        return;
      }
      window.location.assign((await response.json()).url);
    } catch { setError('Không thể kết nối. Vui lòng thử lại.'); } finally { setBusy(false); }
  };

  const makeTemplate = async () => {
    setBusy(true); setError('');
    try {
      const response = await fetch('/gov/api/template', { method: 'POST', credentials: 'same-origin' });
      if (!response.ok) { setError(failed(response.status)); return; }
      await refresh();
    } catch { setError('Không thể kết nối. Vui lòng thử lại.'); } finally { setBusy(false); }
  };

  const resetTemplate = async () => {
    if (!window.confirm('Phát hành cấu hình mặc định mới cho template? Shop đã tạo trước đó giữ nguyên trang của mình.')) return;
    setBusy(true); setError('');
    try {
      const response = await fetch('/gov/api/template/reset', { method: 'POST', credentials: 'same-origin' });
      setError(response.ok ? 'Template đã dùng cấu hình mặc định mới. Shop tạo từ giờ sẽ theo template này.' : failed(response.status));
    } catch { setError('Không thể kết nối. Vui lòng thử lại.'); } finally { setBusy(false); }
  };

  const makeTemplateAccount = async () => {
    setBusy(true); setError('');
    try {
      const response = await fetch('/gov/api/template/account', { method: 'POST', credentials: 'same-origin' });
      if (!response.ok) { setError(failed(response.status)); return; }
      const body = await response.json().catch(() => ({}));
      // A single-use link to choose a strong password, in every environment (lát F6; no fixed test password since 27/09).
      if (body.account?.setupUrl) { setTemplateLink(body.account.setupUrl); setError('Mở link bên dưới để đặt mật khẩu cho yourshop (dùng một lần, 48 giờ), rồi đăng nhập dashboard của dòng TEMPLATE bằng @yourshop.'); }
      else setError('Máy chủ thiếu APP_ORIGIN nên không dựng được link đặt mật khẩu.');
      await refresh();
    } catch { setError('Không thể kết nối. Vui lòng thử lại.'); } finally { setBusy(false); }
  };

  const endStandIn = async () => {
    setBusy(true); setError('');
    try {
      const response = await fetch('/gov/api/impersonations', { method: 'DELETE', credentials: 'same-origin' });
      setError(response.ok ? ((await response.json()).ended ? 'Đã kết thúc phiên xem thay mặt.' : 'Không có phiên nào đang mở.') : failed(response.status));
    } catch { setError('Không thể kết nối. Vui lòng thử lại.'); } finally { setBusy(false); }
  };

  return <>
    {standIn && <section className={styles.panel} data-impersonate-form>
      <h2>Xem thay mặt {standIn.name}</h2>
      <p className={styles.muted}>
        Phiên chỉ xem, tối đa 30 phút, mỗi lúc một phiên, không tải được dữ liệu. Chủ shop <strong>{standIn.owner_username}</strong> sẽ
        thấy phiên này cùng lý do nguyên văn. Mức hỗ trợ chủ shop đang đặt: <strong>{LEVELS[standIn.support_level]}</strong>.
      </p>
      <form className={styles.form} onSubmit={event => { event.preventDefault(); void impersonate(standIn, new FormData(event.currentTarget)); }}>
        <label>Phạm vi<select name="scope" defaultValue={allows(standIn, 'overview') ? 'overview' : 'design'}>
          <option value="overview" disabled={!allows(standIn, 'overview')}>Chỉ số liệu tổng quan{allows(standIn, 'overview') ? '' : ' (khấc 2 ẩn dữ liệu)'}</option>
          <option value="feedback" disabled={!allows(standIn, 'feedback')}>Kèm góp ý riêng tư{allows(standIn, 'feedback') ? '' : ' (cần khấc 1 hoặc 3)'}</option>
          <option value="design" disabled={!allows(standIn, 'design')}>Sửa giao diện{allows(standIn, 'design') ? '' : ' (cần khấc 2 hoặc 3)'}</option>
        </select></label>
        <label>Lý do (chủ shop sẽ đọc)<input name="reason" required minLength={10} maxLength={200} placeholder="Shop nhờ kiểm vì sao số lượt mở giảm"/></label>
        <button className={buttonClass('primary')} disabled={busy}>Mở dashboard</button>
        <button type="button" className={buttonClass('quiet')} disabled={busy} onClick={() => setStandIn(null)}>Huỷ</button>
      </form>
      {error && <p className={styles.muted} data-impersonate-error>{error}</p>}
    </section>}

    {planFor && <section className={styles.panel} data-plan-form>
      <h2>Gói của {planFor.name}</h2>
      <p className={styles.muted}>Quán bạn đi chào: chọn gói và ngày <strong>tặng tới</strong>. Tính hết ngày đó; quá hạn 14 ngày thì trang tắt và thẻ đưa
        khách thẳng tới Google của quán. Bỏ gói = chưa tính phí, mọi thứ mở như giai đoạn trải nghiệm.</p>
      <form className={styles.form} onSubmit={event => { event.preventDefault(); void savePlan(planFor, new FormData(event.currentTarget)); }}>
        <label>Gói<select name="plan" defaultValue={planFor.billing.plan ?? 'basic'}>
          {PLANS.map(plan => <option key={plan.key} value={plan.key}>{plan.name} · {plan.monthly.toLocaleString('vi-VN')}đ/tháng</option>)}
          <option value="">Chưa tính phí (bỏ gói)</option></select></label>
        <label>Trả / tặng tới ngày<input name="paidUntil" type="date" defaultValue={planFor.billing.paidUntil ?? ''} /></label>
        <button className={buttonClass('primary')} disabled={busy}>Lưu gói</button>
        <button type="button" className={buttonClass('quiet')} disabled={busy} onClick={() => setPlanFor(null)}>Huỷ</button>
      </form>
      {error && <p role="alert" className={styles.muted}>{error}</p>}
    </section>}

    <section className={styles.panel}>
      <h2>Tạo shop mới</h2>
      <p className={styles.muted}>Một lần bấm tạo trang khách từ template đã chọn (mang sẵn tên shop), bản phát hành đầu tiên, một mã thẻ và tài khoản chủ shop chưa có mật khẩu.</p>
      <form className={styles.form} onSubmit={async event => {
        event.preventDefault(); setBusy(true); setError(''); setHandover(null);
        const form = new FormData(event.currentTarget), element = event.currentTarget;
        try {
          const response = await fetch('/gov/api/shops', { method: 'POST', credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: form.get('name'), ownerUsername: form.get('ownerUsername'),
              ownerEmail: form.get('ownerEmail'), placeId: form.get('placeId'), templateKey: form.get('templateKey') }) });
          if (!response.ok) { setError(failed(response.status)); return; }
          const { shop } = await response.json();
          setHandover({ ...shop, expiresAt: shop.setupExpiresAt });
          element.reset();
          await refresh();
        } catch { setError('Không thể kết nối. Vui lòng thử lại.'); } finally { setBusy(false); }
      }}>
        <label>Tên shop<input name="name" required maxLength={100} placeholder="Cà Phê Ban Mai"/></label>
        <label>Tài khoản chủ shop<input name="ownerUsername" required maxLength={64} placeholder="caphe-banmai" pattern="[a-z0-9][a-z0-9_.\-]{2,63}"/></label>
        <label>Email chủ shop<input name="ownerEmail" type="email" required maxLength={254} placeholder="chu@example.com"/></label>
        <div className={styles.fieldWithHelp}><label>Place ID (bỏ trống nếu chưa có)<input name="placeId" maxLength={2048} placeholder="ChIJ…" autoComplete="off" spellCheck={false}/></label>
          <a href={PLACE_ID_FINDER} target="_blank" rel="noreferrer">Mở trang tìm Place ID của Google ↗</a></div>
        <label>Template<select name="templateKey" defaultValue={templates[0]?.key} data-template-choice>
          {templates.map(t => <option key={t.key} value={t.key}>{t.name}</option>)}</select></label>
        <button className={buttonClass('primary')} disabled={busy}>{busy ? 'Đang tạo…' : 'Tạo shop'}</button>
      </form>
      {error && <p role="alert" className={styles.muted}>{error}</p>}

      {handover && <div className={styles.handover} data-handover>
        <h2>Gửi liên kết này cho chủ shop</h2>
        <p className={styles.muted}>
          Chỉ hiện một lần: hệ thống chỉ lưu bản băm, không tra lại được. Liên kết dùng một lần và hết hạn
          lúc {new Date(handover.expiresAt).toLocaleString('vi-VN')}. Mất thì phát liên kết mới.
        </p>
        <code>{handover.setupUrl ?? 'Chưa cấu hình APP_ORIGIN nên không dựng được đường dẫn.'}</code>
        <p className={styles.muted}>
          Tài khoản <strong>{handover.ownerUsername}</strong>
          {handover.tagCode && <> · mã thẻ <strong>{handover.tagCode}</strong> (trạng thái <em>prepared</em>, chưa quét được cho tới khi kích hoạt)</>}
        </p>
        {/* A7: every shop gets the Google rules at handover, not after its first mistake. */}
        <p className={styles.muted} data-handover-guide>Gửi kèm hướng dẫn mời đánh giá đúng luật Google:{' '}
          <a href="/huong-dan-google" target="_blank" rel="noreferrer">/huong-dan-google</a> (in được, một trang).</p>
      </div>}
    </section>

    <section className={styles.panel}>
      <div className={styles.head}><h2>Shop đang có ({shops.filter(row => !row.is_template).length})</h2>
        {!shops.some(row => row.is_template) && <button className={buttonClass('secondary')} disabled={busy} onClick={makeTemplate}>Tạo shop template</button>}
        {shops.some(row => row.is_template) && <button className={buttonClass('secondary')} disabled={busy} onClick={resetTemplate}>Đưa template về mặc định mới</button>}
        {shops.some(row => row.is_template && !row.owner_username) &&
          <button className={buttonClass('secondary')} disabled={busy} onClick={() => void makeTemplateAccount()}>Tạo tài khoản cho template (link đặt mật khẩu)</button>}
        {shops.some(row => row.is_template && row.owner_username) &&
          <button className={buttonClass('secondary')} disabled={busy} onClick={() => void makeTemplateAccount()}>Tạo lại link đặt mật khẩu cho yourshop</button>}
        <button className={buttonClass('quiet')} disabled={busy} onClick={endStandIn}>Kết thúc phiên xem thay mặt</button></div>
      {templateLink && <p data-template-link>Link đặt mật khẩu cho <strong>yourshop</strong>: <code>{templateLink}</code>{' '}
        <button type="button" className={buttonClass('secondary')} onClick={() => { void navigator.clipboard.writeText(templateLink).then(() => setError('Đã sao chép link.'), () => setError('Giữ lâu vào link để sao chép.')); }}>Sao chép</button></p>}
      <div className={styles.wide}>
        <table className={styles.table}>
          <thead><tr><th>Shop</th><th>Trang khách</th><th>Dashboard</th><th>Chủ shop</th><th>Thẻ</th><th>Trang</th><th>Trạng thái</th><th>Gói</th><th>Hỗ trợ</th><th>Hoạt động</th><th/></tr></thead>
          <tbody>
            {shops.map(row => <tr key={row.id} data-template={row.is_template || undefined}>
              <td data-label="Shop" className={styles.shopCell}>{row.is_template && <><strong>TEMPLATE</strong> · </>}{row.name}<br/><code>{row.slug}</code></td>
              <td data-label="Trang khách">{origin ? <a href={`${origin}/${row.slug}`} target="_blank" rel="noreferrer">mở</a> : '—'}</td>
              <td data-label="Dashboard">{origin ? <a href={`${origin}/app/${row.slug}`} target="_blank" rel="noreferrer">mở</a> : '—'}</td>
              <td data-label="Chủ shop">{row.is_template
                ? row.owner_username ? <>{row.owner_username} <em>(tài khoản test)</em></> : <em>chưa có tài khoản, dùng để nhân bản</em>
                : row.owner_username ?? <em>chưa có</em>}<br/><span className={styles.muted}>{row.owner_email ?? ''}</span></td>
              <td data-label="Thẻ">{row.active_tags}/{row.tags} hoạt động</td>
              <td data-label="Trang">{row.pages} trang</td>
              <td data-label="Trạng thái" data-publishing-state={row.publishing_state}>{STATES[row.publishing_state] ?? row.publishing_state}</td>
              <td data-label="Gói" data-billing-state={row.billing.state}>{row.is_template ? '—' : billingText(row.billing)}</td>
              <td data-label="Hỗ trợ" data-support-level={row.support_level}>{row.is_template ? '—' : LEVELS[row.support_level]}</td>
              <td data-label="Hoạt động">{row.last_seen ? new Date(row.last_seen).toLocaleDateString('vi-VN') : 'chưa có lượt nào'}</td>
              <td className={styles.rowActions}><div>{!row.is_template &&
                <button className={buttonClass('secondary')} disabled={busy} onClick={() => { setError(''); setPlanFor(row); setTimeout(() => document.querySelector('[data-plan-form]')?.scrollIntoView({ block: 'start' }), 0); }}>Đặt gói</button>}
                {row.owner_user_id && !row.is_template && <>
                <button className={buttonClass('secondary')} disabled={busy} onClick={() => reissue(row)}>Phát lại liên kết</button>
                <button className={buttonClass('caution')} disabled={busy || row.publishing_state !== 'active'} onClick={() => { setError(''); setStandIn(row); window.scrollTo(0, 0); }}>Mạo danh</button>
              </>}</div></td>
            </tr>)}
            {!shops.length && <tr><td colSpan={11} className={styles.muted}>Chưa có shop nào.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  </>;
}
