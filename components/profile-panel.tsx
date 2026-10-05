'use client';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { PORTRAIT, shrinkImage, shrinkNotice } from '@/lib/client/shrink-image';
import type { Profile } from '@/lib/owner/profile';
import styles from './owner-app.module.css';
import RoleBadge from './role-badge';
import GoogleForm from './google-button';
import { buttonClass } from './platform/ui';
import { googleMessage } from '@/lib/owner/google-messages';

/**
 * Hồ sơ (lát F2, Tài 2026-09-18): the signed-in person's own page, laid out like a YouTube channel — cover across
 * the top, round picture overlapping it, name, @handle, role and join date, a short bio. Pictures save as soon as
 * they are uploaded; the text fields save with "Lưu hồ sơ". The @handle is also what the person signs in with.
 */
const ROLES = { owner: 'Chủ shop', manager: 'Quản lý' } as const;
const ERRORS: Record<string, string> = {
  INVALID_HANDLE: '@handle cần 3–64 ký tự: chữ thường không dấu, số, dấu chấm, gạch dưới hoặc gạch ngang, bắt đầu bằng chữ hoặc số.',
  HANDLE_TAKEN: '@handle này đã có người dùng. Chọn tên khác.',
  INVALID_PROFILE: 'Tên tối đa 60 ký tự, giới thiệu tối đa 160 ký tự, không dùng dấu < >.',
  UNSUPPORTED_MEDIA: 'Chỉ nhận ảnh JPG, PNG hoặc WebP.',
  MEDIA_TOO_LARGE: 'Ảnh tối đa 5 MB.',
  UPLOADS_NOT_CONFIGURED: 'Kho lưu trữ ảnh chưa được bật.',
  LOGIN_REQUIRED: 'Phiên đăng nhập đã hết hạn.',
};
export const initials = (text: string) => text.trim().split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase() ?? '').join('') || '?';
const joined = (iso: string) => `Tham gia ${new Intl.DateTimeFormat('vi-VN', { month: 'long', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(iso))}`;
type Saved = Pick<Profile, 'handle' | 'displayName' | 'bio' | 'avatarUrl' | 'coverUrl'>;
const body = (p: Saved) => ({ handle: p.handle, displayName: p.displayName, bio: p.bio, avatarUrl: p.avatarUrl, coverUrl: p.coverUrl });

export function Avatar({ profile, size }: { profile: Pick<Profile, 'handle' | 'displayName' | 'avatarUrl'>; size: number }) {
  const name = profile.displayName ?? profile.handle;
  // eslint-disable-next-line @next/next/no-img-element -- a picture on the public media store, sized by CSS
  return profile.avatarUrl ? <img className={styles.personAvatar} src={profile.avatarUrl} alt="" width={size} height={size} />
    : <span className={styles.personAvatar} style={{ width: size, height: size, fontSize: size * 0.38 }} aria-hidden="true">{initials(name)}</span>;
}

/** Hook shared by the sidebar and the tab, so an edit shows in both at once. */
export function useProfile(enabled: boolean) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const load = useCallback(async () => {
    if (!enabled) return;
    try { const response = await fetch('/api/owner/v2/profile', { cache: 'no-store' }); if (response.ok) setProfile(await response.json()); } catch { /* the tab shows its own error */ }
  }, [enabled]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  return { profile, setProfile };
}

async function save(next: Saved): Promise<{ profile?: Profile; error?: string }> {
  try {
    const response = await fetch('/api/owner/v2/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body(next)) });
    const data = await response.json().catch(() => ({}));
    return response.ok ? { profile: data } : { error: ERRORS[data.error] ?? 'Chưa lưu được. Thử lại.' };
  } catch { return { error: 'Không thể kết nối. Vui lòng thử lại.' }; }
}

function Picture({ label, field, profile, onSaved }: { label: string; field: 'avatarUrl' | 'coverUrl'; profile: Profile; onSaved: (p: Profile, message: string) => void }) {
  const [state, setState] = useState('');
  if (!profile.uploads) return null;
  return <label className={styles.upload} data-profile-upload={field}>
    <input type="file" accept="image/jpeg,image/png,image/webp" onChange={async e => {
      const file = e.target.files?.[0]; e.target.value = '';
      if (!file) return;
      setState('Đang chuẩn bị ảnh…');
      try {
        // An avatar is shown small and often, so it is bounded harder than a page poster (lát A6).
        const shrunk = await shrinkImage(file, PORTRAIT);
        setState(shrinkNotice(shrunk) || 'Đang tải lên…');
        const signed = await fetch('/api/owner/v2/profile/media', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: shrunk.type, size: shrunk.blob.size }) });
        const data = await signed.json().catch(() => ({}));
        if (!signed.ok) { setState(ERRORS[data.error] ?? 'Chưa tải lên được.'); return; }
        const sent = await fetch(data.upload, { method: 'PUT', headers: data.headers, body: shrunk.blob });
        if (!sent.ok) { setState('Kho lưu trữ từ chối tệp. Thử lại.'); return; }
        const result = await save({ ...profile, [field]: data.url });
        if (result.error) { setState(result.error); return; }
        setState(''); onSaved(result.profile!, `Đã đổi ${label.toLowerCase()}.`);
      } catch { setState('Không thể kết nối tới kho lưu trữ.'); }
    }} />
    <span>Đổi {label.toLowerCase()}</span>{state && <small data-upload-state>{state}</small>}
  </label>;
}

const UNLINK_ERRORS: Record<string, string> = {
  WRONG_PASSWORD: 'Mật khẩu hiện tại chưa đúng.', INVALID_PASSWORD: 'Nhập mật khẩu hiện tại để ngắt kết nối.',
  TOO_MANY_ATTEMPTS: 'Thử sai quá nhiều lần. Đợi 15 phút rồi thử lại.', GOOGLE_NOT_LINKED: 'Tài khoản này không còn nối với Google.',
  LOGIN_REQUIRED: 'Phiên đăng nhập đã hết hạn. Đăng nhập lại rồi thử lại.',
};
/**
 * "Ngắt kết nối Google" (rà bảo mật 29/09, G1): with the account's password, and every other device signed in to the
 * account is signed out, since Google may have opened any of them. An account made with Google has no password, so it
 * cannot remove its only way in.
 */
function GoogleUnlink({ onDone }: { onDone: (message: string) => void }) {
  const [open, setOpen] = useState(false), [password, setPassword] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
  if (!open) return <button type="button" className={styles.textButton} data-google-unlink-open onClick={() => setOpen(true)}>Ngắt kết nối Google…</button>;
  return <form className={styles.googleForm} data-google-unlink onSubmit={async e => {
    e.preventDefault(); setBusy(true); setNotice('');
    try {
      const response = await fetch('/api/owner/v2/profile/google', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) { setNotice(UNLINK_ERRORS[data.error] ?? 'Chưa ngắt được. Thử lại.'); return; }
      onDone('Đã ngắt kết nối Google. Các máy khác đang đăng nhập tài khoản này đã bị đăng xuất.');
    } catch { setNotice('Không thể kết nối. Vui lòng thử lại.'); } finally { setBusy(false); }
  }}>
    <p className={styles.hint}>Tài khoản tạo bằng Google không có mật khẩu, nên không ngắt được: Google là đường vào duy nhất của nó.</p>
    <label>Mật khẩu hiện tại<input type="password" autoComplete="current-password" required maxLength={256} value={password} onChange={e => setPassword(e.target.value)} /></label>
    <div className={styles.actions}><button className={buttonClass('danger')} disabled={busy}>{busy ? 'Đang ngắt…' : 'Ngắt kết nối Google'}</button>
      <button type="button" className={styles.textButton} onClick={() => setOpen(false)}>Huỷ</button></div>
    <p role="status" className={styles.hint} data-google-unlink-notice>{notice}</p>
  </form>;
}

export default function ProfilePanel({ slug, profile, setProfile, password }: { slug: string; profile: Profile | null; setProfile: (p: Profile) => void; password: ReactNode }) {
  // What came back from "Kết nối Google" (`?google=`), said once and taken off the address so a reload does not repeat it.
  const [googleNotice, setGoogleNotice] = useState<string | null>(null);
  useEffect(() => {
    const url = new URL(window.location.href), code = url.searchParams.get('google');
    if (!code) return;
    queueMicrotask(() => setGoogleNotice(googleMessage(code)));
    url.searchParams.delete('google'); window.history.replaceState(null, '', url);
  }, []);
  const [editing, setEditing] = useState(false), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ displayName: '', handle: '', bio: '' });
  if (!profile) return <p className={styles.hint}>Đang tải hồ sơ…</p>;
  const name = profile.displayName ?? profile.handle;
  const saved = (next: Profile, message: string) => { setProfile(next); setNotice(message); };
  const here = profile.shops.find(shop => shop.slug.toLowerCase() === slug.toLowerCase());
  const badge = (shop: Profile['shops'][number]) => shop.role === 'owner' ? <span className={styles.ownerPill}>{ROLES.owner}</span>
    : <RoleBadge role={{ name: shop.roleName ?? ROLES.manager, icon: shop.roleIcon, color: shop.roleColor ?? '#7a5410' }} />;
  return <section aria-label="Hồ sơ" data-profile={profile.handle}>
    <div className={`${styles.panel} ${styles.channel}`}>
      <div className={styles.cover} data-cover style={profile.coverUrl ? { backgroundImage: `url("${profile.coverUrl}")` } : undefined} />
      <div className={styles.channelHead}>
        <div className={styles.channelAvatar}><Avatar profile={profile} size={112} /></div>
        <div className={styles.channelText}>
          <h2 data-profile-name>{name}</h2>
          <p className={styles.channelMeta}><span data-profile-handle>@{profile.handle}</span>
            {here && badge(here)}
            <span>{joined(profile.joinedAt)}</span></p>
          {profile.bio && <p className={styles.channelBio} data-profile-bio>{profile.bio}</p>}
        </div>
        {!editing && <button type="button" className={styles.editProfile} onClick={() => {
          setForm({ displayName: profile.displayName ?? '', handle: profile.handle, bio: profile.bio ?? '' }); setEditing(true); setNotice(''); }}>Chỉnh sửa hồ sơ</button>}
      </div>
      <div className={styles.uploads}>
        <Picture label="Ảnh đại diện" field="avatarUrl" profile={profile} onSaved={saved} />
        <Picture label="Ảnh bìa" field="coverUrl" profile={profile} onSaved={saved} />
        {profile.avatarUrl && <button type="button" className={styles.textButton} onClick={async () => { const r = await save({ ...profile, avatarUrl: null }); if (r.profile) saved(r.profile, 'Đã bỏ ảnh đại diện.'); else setNotice(r.error!); }}>Bỏ ảnh đại diện</button>}
        {profile.coverUrl && <button type="button" className={styles.textButton} onClick={async () => { const r = await save({ ...profile, coverUrl: null }); if (r.profile) saved(r.profile, 'Đã bỏ ảnh bìa.'); else setNotice(r.error!); }}>Bỏ ảnh bìa</button>}
      </div>
      {editing && <form className={styles.profileForm} data-profile-form onSubmit={async e => {
        e.preventDefault(); setBusy(true);
        const result = await save({ ...profile, displayName: form.displayName.trim() || null, handle: form.handle, bio: form.bio.trim() || null });
        setBusy(false);
        if (result.error) { setNotice(result.error); return; }
        const changedHandle = result.profile!.handle !== profile.handle;
        saved(result.profile!, changedHandle ? `Đã lưu hồ sơ. Từ giờ đăng nhập bằng @${result.profile!.handle}.` : 'Đã lưu hồ sơ.'); setEditing(false);
      }}>
        <label>Tên hiển thị<input value={form.displayName} maxLength={60} onChange={e => setForm({ ...form, displayName: e.target.value })} placeholder={profile.handle} /></label>
        <label>@handle (dùng để đăng nhập)<input value={form.handle} maxLength={65} autoCapitalize="none" spellCheck={false}
          onChange={e => setForm({ ...form, handle: e.target.value.toLowerCase() })} /></label>
        <label>Giới thiệu<textarea value={form.bio} maxLength={160} rows={2} onChange={e => setForm({ ...form, bio: e.target.value })} placeholder="Một câu về bạn" /></label>
        <div className={styles.actions}><button disabled={busy}>{busy ? 'Đang lưu…' : 'Lưu hồ sơ'}</button>
          <button type="button" className={styles.textButton} onClick={() => setEditing(false)}>Huỷ</button></div>
      </form>}
      <p role="status" className={styles.hint} data-profile-notice>{notice}</p>
    </div>
    <section className={styles.panel} aria-label="Đăng nhập"><h2>Đăng nhập</h2>
      <p className={styles.hint}>Đăng nhập bằng <strong>@{profile.handle}</strong>{profile.email ? <> hoặc email <strong>{profile.email}</strong></> : null}. Quên mật khẩu thì liên hệ quản trị NFC để đặt lại.</p>
      {password}
    </section>
    {/* Google as a way in (lát D4c): linked only from here, while signed in and with the password (G1) -- never by matching an email. */}
    {profile.google.available && <section className={styles.panel} aria-label="Google" data-google-link={profile.google.linked ? 'linked' : 'none'}><h2>Google</h2>
      {googleNotice && <p role="status" className={styles.hint} data-google-notice>{googleNotice}</p>}
      {profile.google.linked
        ? <><p className={styles.hint}>Đã kết nối Google: bấm <strong>Đăng nhập bằng Google</strong> ở trang đăng nhập là vào thẳng.</p>
          <GoogleUnlink onDone={message => { setProfile({ ...profile, google: { ...profile.google, linked: false } }); setGoogleNotice(message); }} /></>
        : <><p className={styles.hint}>Kết nối tài khoản Google để lần sau đăng nhập một chạm, không cần mật khẩu.</p>
          <GoogleForm fields={{ intent: 'link', next: `/app/${slug}/cai-dat` }} className={styles.googleForm} data-google-connect=""
            extra={<label>Mật khẩu hiện tại (để chắc đây là bạn)<input type="password" name="password" autoComplete="current-password" required maxLength={256} /></label>}>
            Kết nối Google</GoogleForm></>}
    </section>}
    <section className={styles.panel} aria-label="Shop của bạn"><h2>Shop của bạn</h2>
      <ul className={styles.list}>{profile.shops.map(shop => <li key={shop.slug} className={styles.shopLine}><strong>{shop.name}</strong> {badge(shop)}
        {shop.role !== 'owner' && shop.roleIcon && <label className={styles.switchRow} data-badge-toggle={shop.slug}><span>Hiện {shop.roleIcon} cạnh tên tôi</span>
          <input type="checkbox" role="switch" checked={shop.showBadge} onChange={async e => {
            const value = e.target.checked;
            const response = await fetch(`/api/owner/v2/${encodeURIComponent(shop.slug)}/team`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'badge', value }) }).catch(() => null);
            if (response?.ok) setProfile({ ...profile, shops: profile.shops.map(x => x.slug === shop.slug ? { ...x, showBadge: value } : x) });
            else setNotice('Chưa đổi được. Thử lại.');
          }} /></label>}</li>)}</ul>
    </section>
  </section>;
}
