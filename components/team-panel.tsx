'use client';
import { useCallback, useEffect, useState } from 'react';
import type { Member, Role } from '@/lib/owner/team';
import type { Permission } from '@/lib/owner/auth';
import { Avatar } from './profile-panel';
import RoleBadge from './role-badge';
import { PERMISSION_LABELS } from '@/lib/owner/permission-labels';
import styles from './owner-app.module.css';

/**
 * Thành viên & vai (lát F3, Tài 2026-09-18), in Settings. People: who is in the shop, their role, a fresh setup link
 * for someone who has not set a password yet, and — for the owner — opening customer feedback to one person. Roles,
 * like Discord's: name, icon, colour and a row of switches. The server enforces every rule; the page only hides
 * buttons that would be refused.
 */
const ALL = Object.keys(PERMISSION_LABELS) as Permission[];
const ERRORS: Record<string, string> = {
  HANDLE_TAKEN: '@handle này đã có người dùng.', EMAIL_TAKEN: 'Email này đã có tài khoản.', INVALID_HANDLE: '@handle cần 3–64 ký tự: chữ thường không dấu, số, . _ -',
  INVALID_EMAIL: 'Email chưa đúng.', ROLE_ABOVE_YOU: 'Bạn chỉ gán được vai có quyền không vượt quá quyền của mình.', PERMISSION_REQUIRED: 'Bạn chưa có quyền làm việc này.',
  OWNER_ROLE_REQUIRED: 'Chỉ chủ shop làm được việc này.', ROLE_IN_USE: 'Vai đang có người giữ. Đổi vai cho họ trước khi xoá.',
  ROLE_NAME_TAKEN: 'Đã có vai trùng tên.', INVALID_ROLE: 'Tên vai 1–30 ký tự; biểu tượng tối đa 8 ký tự, không khoảng trắng.',
  NOT_ON_YOURSELF: 'Không tự đổi vai của chính mình.', OWNER_UNTOUCHABLE: 'Không đổi được chủ shop.',
};
type Team = { roles: Role[]; members: Member[]; me: { userId: string; owner: boolean; permissions: Permission[] } };

function RoleEditor({ role, onSave, onDelete, onCancel }: { role: Partial<Role>; onSave: (r: { name: string; icon: string | null; color: string; permissions: Permission[] }) => void;
  onDelete?: () => void; onCancel: () => void }) {
  const [value, setValue] = useState({ name: role.name ?? '', icon: role.icon ?? '', color: role.color ?? '#5a6d62', permissions: role.permissions ?? [] });
  return <form className={styles.roleEditor} data-role-editor onSubmit={e => { e.preventDefault(); onSave({ ...value, icon: value.icon.trim() || null }); }}>
    <div className={styles.roleEditorRow}>
      <label>Tên vai<input value={value.name} maxLength={30} required onChange={e => setValue({ ...value, name: e.target.value })} /></label>
      <label>Biểu tượng<input value={value.icon} maxLength={8} placeholder="👑" onChange={e => setValue({ ...value, icon: e.target.value })} /></label>
      <label>Màu<input type="color" value={value.color} onChange={e => setValue({ ...value, color: e.target.value })} /></label>
    </div>
    <fieldset className={styles.switches}><legend>Quyền (ai cũng xem được số liệu tổng quan)</legend>
      {ALL.map(p => <label key={p} className={styles.switchRow}><span>{PERMISSION_LABELS[p]}</span>
        <input type="checkbox" role="switch" checked={value.permissions.includes(p)}
          onChange={e => setValue({ ...value, permissions: e.target.checked ? [...value.permissions, p] : value.permissions.filter(x => x !== p) })} /></label>)}
    </fieldset>
    <div className={styles.actions}><button>Lưu vai</button><button type="button" className={styles.textButton} onClick={onCancel}>Huỷ</button>
      {onDelete && <button type="button" className={styles.dangerText} onClick={onDelete}>Xoá vai</button>}</div>
  </form>;
}

export default function TeamPanel({ endpoint }: { endpoint: string }) {
  const [team, setTeam] = useState<Team | null>(null), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
  const [invite, setInvite] = useState({ handle: '', email: '', roleId: '' }), [link, setLink] = useState<{ who: string; url: string } | null>(null);
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const load = useCallback(async () => {
    try {
      const response = await fetch(`${endpoint}/team`, { cache: 'no-store' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) { setNotice(ERRORS[body.error] ?? 'Chưa tải được danh sách thành viên.'); return; }
      setTeam(body);
    } catch { setNotice('Không thể kết nối. Vui lòng thử lại.'); }
  }, [endpoint]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  const send = async (path: string, method: string, body: unknown, done: string) => {
    setBusy(true); setNotice('');
    try {
      const response = await fetch(`${endpoint}/${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) { setNotice(ERRORS[data.error] ?? 'Chưa lưu được. Thử lại.'); return null; }
      setNotice(done); await load(); return data;
    } catch { setNotice('Không thể kết nối. Vui lòng thử lại.'); return null; }
    finally { setBusy(false); }
  };
  if (!team) return <section className={styles.panel} aria-label="Thành viên"><h2>Thành viên</h2><p className={styles.hint}>{notice || 'Đang tải…'}</p></section>;
  const { me, roles } = team, canManage = me.permissions.includes('members');
  const within = (permissions: Permission[]) => me.owner || permissions.every(p => me.permissions.includes(p));
  const assignable = roles.filter(r => within(r.permissions));
  // A new person starts with the least: the assignable role with the fewest switches.
  const least = [...assignable].sort((a, b) => a.permissions.length - b.permissions.length)[0]?.id;
  const roleOf = (m: Member) => roles.find(r => r.id === m.roleId);
  const copy = async (url: string) => { try { await navigator.clipboard.writeText(url); setNotice('Đã sao chép link.'); } catch { setNotice('Giữ lâu vào link để sao chép.'); } };

  return <>
    <section className={styles.panel} aria-label="Thành viên" data-team>
      <h2>Thành viên</h2>
      <p className={styles.hint}>Mỗi người một tài khoản riêng; mọi thao tác của họ hiện trong Hoạt động. Người mới tự đặt mật khẩu bằng link dùng một lần (48 giờ), nên không ai khác biết mật khẩu của họ.</p>
      <ul className={styles.members}>{team.members.map(m => {
        const role = roleOf(m), editable = !m.owner && m.userId !== me.userId && canManage && within(m.permissions);
        return <li key={m.userId} data-member={m.handle}>
          <Avatar profile={m} size={40} />
          <div className={styles.memberText}>
            <strong>{m.displayName ?? m.handle}</strong>
            <span>@{m.handle}{m.userId === me.userId && ' · bạn'}{m.pending && <em className={styles.pending}> · chưa đặt mật khẩu</em>}</span>
          </div>
          <div className={styles.memberControls}>
            {m.owner ? <span className={styles.ownerPill}>Chủ shop</span>
              : editable ? <select aria-label={`Vai của @${m.handle}`} value={m.roleId ?? ''} disabled={busy}
                  onChange={e => void send('team', 'PATCH', { op: 'role', userId: m.userId, value: e.target.value }, `Đã đổi vai của @${m.handle}.`)}>
                  {!m.roleId && <option value="">Quản lý (cũ)</option>}
                  {assignable.map(r => <option key={r.id} value={r.id}>{r.icon ? `${r.icon} ` : ''}{r.name}</option>)}</select>
              : role ? <RoleBadge role={role} /> : <span className={styles.rolePill}>Quản lý</span>}
            {me.owner && !m.owner && <select aria-label={`Góp ý của khách với @${m.handle}`} data-feedback-override={m.handle}
              value={m.feedbackOverride === null ? 'role' : m.feedbackOverride ? 'yes' : 'no'} disabled={busy}
              onChange={e => void send('team', 'PATCH', { op: 'feedback', userId: m.userId, value: e.target.value === 'role' ? null : e.target.value === 'yes' }, `Đã đổi quyền đọc góp ý của @${m.handle}.`)}>
              <option value="role">Góp ý: theo vai</option><option value="yes">Góp ý: cho đọc</option><option value="no">Góp ý: không cho đọc</option></select>}
            {editable && m.pending && <button type="button" className={styles.textButton} disabled={busy} onClick={async () => {
              const data = await send('team', 'PATCH', { op: 'link', userId: m.userId }, `Đã tạo link mới cho @${m.handle}. Link cũ không dùng được nữa.`);
              if (data?.setupUrl) setLink({ who: m.handle, url: data.setupUrl }); }}>Tạo lại link</button>}
            {editable && <button type="button" className={styles.dangerText} disabled={busy} onClick={() => {
              if (window.confirm(`Gỡ @${m.handle} khỏi shop? Họ không vào dashboard này được nữa; lịch sử của họ vẫn giữ nguyên.`))
                void send('team', 'PATCH', { op: 'remove', userId: m.userId }, `Đã gỡ @${m.handle}.`); }}>Gỡ</button>}
          </div>
        </li>;
      })}</ul>
      {canManage && <form className={styles.inviteForm} data-invite onSubmit={async e => {
        e.preventDefault();
        const roleId = invite.roleId || least;
        const data = await send('team', 'POST', { handle: invite.handle, roleId, ...(invite.email.trim() ? { email: invite.email.trim() } : {}) }, `Đã tạo tài khoản @${invite.handle.replace(/^@/, '').toLowerCase()}. Gửi link bên dưới cho họ qua Zalo.`);
        if (data?.setupUrl) { setLink({ who: data.handle, url: data.setupUrl }); setInvite({ handle: '', email: '', roleId: '' }); }
      }}>
        <h3>Mời người mới</h3>
        <label>@handle<input value={invite.handle} required maxLength={65} autoCapitalize="none" spellCheck={false} placeholder="@nhanvien.an"
          onChange={e => setInvite({ ...invite, handle: e.target.value.toLowerCase() })} /></label>
        <label>Email (không bắt buộc)<input type="email" value={invite.email} maxLength={254} onChange={e => setInvite({ ...invite, email: e.target.value })} /></label>
        <label>Vai<select value={invite.roleId || least || ''} onChange={e => setInvite({ ...invite, roleId: e.target.value })}>
          {assignable.map(r => <option key={r.id} value={r.id}>{r.icon ? `${r.icon} ` : ''}{r.name}</option>)}</select></label>
        <button disabled={busy || assignable.length === 0}>Tạo tài khoản</button>
      </form>}
      {link && <div className={styles.setupLink} data-setup-link>
        <p>Link đặt mật khẩu cho <strong>@{link.who}</strong> (dùng một lần, hết hạn sau 48 giờ):</p>
        <code>{link.url}</code><button type="button" onClick={() => void copy(link.url)}>Sao chép</button>
      </div>}
      <p role="status" className={styles.hint} data-team-notice>{notice}</p>
    </section>

    <section className={styles.panel} aria-label="Vai" data-roles>
      <h2>Vai</h2>
      <p className={styles.hint}>Như Discord: mỗi vai có tên, biểu tượng, màu và bộ quyền. Chủ shop luôn có mọi quyền; chỉ chủ shop kích hoạt thẻ, gạt công tắc hỗ trợ và sửa vai.</p>
      <ul className={styles.roles}>{roles.map(r => <li key={r.id} data-role={r.name}>
        {editing === r.id ? <RoleEditor role={r} onCancel={() => setEditing(null)}
          onSave={async value => { if (await send('roles', 'PATCH', { id: r.id, ...value }, `Đã lưu vai ${value.name}.`)) setEditing(null); }}
          onDelete={async () => { if (window.confirm(`Xoá vai ${r.name}?`) && await send('roles', 'DELETE', { id: r.id }, `Đã xoá vai ${r.name}.`)) setEditing(null); }} />
          : <div className={styles.roleLine}><RoleBadge role={r} /><span className={styles.hint}>{r.members} người · {r.permissions.length ? r.permissions.map(p => PERMISSION_LABELS[p]).join(', ') : 'chỉ xem số liệu'}</span>
            {me.owner && <button type="button" className={styles.textButton} onClick={() => setEditing(r.id)}>Sửa</button>}</div>}
      </li>)}</ul>
      {me.owner && (editing === 'new' ? <RoleEditor role={{}} onCancel={() => setEditing(null)}
        onSave={async value => { if (await send('roles', 'POST', value, `Đã tạo vai ${value.name}.`)) setEditing(null); }} />
        : <button type="button" className={styles.addRole} onClick={() => setEditing('new')}>+ Tạo vai</button>)}
    </section>
  </>;
}
