'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AuthCard, Button, fieldClass } from './platform/ui';

export default function OwnerSetup({ token, username }: { token: string; username: string }) {
  const router = useRouter();
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  return <AuthCard eyebrow="Quản lý shop">
    <h1>Đặt mật khẩu</h1>
    <p>Tài khoản <strong>{username}</strong>. Chỉ bạn biết mật khẩu này; người cấp tài khoản không xem được.</p>
    <form onSubmit={async event => {
      event.preventDefault(); setError('');
      const form = new FormData(event.currentTarget);
      const password = String(form.get('password') ?? '');
      // Checked here as well as on the server, so a mistyped repeat costs nothing and never spends the link.
      if (password !== String(form.get('repeat') ?? '')) { setError('Hai lần nhập chưa giống nhau.'); return; }
      if (password.length < 12) { setError('Mật khẩu cần ít nhất 12 ký tự.'); return; }
      setBusy(true);
      try {
        const response = await fetch('/api/owner/v2/setup', { method: 'POST', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, password }) });
        if (!response.ok) {
          setError(response.status === 400
            ? 'Liên kết không còn dùng được, hoặc mật khẩu chưa hợp lệ. Hãy xin liên kết mới.'
            : 'Dịch vụ đang gián đoạn. Vui lòng thử lại.');
          return;
        }
        const { next } = await response.json() as { next: string | null };
        router.replace(next ? `/owner/login?next=${encodeURIComponent(next)}` : '/owner/login'); router.refresh();
      } catch { setError('Không thể kết nối. Vui lòng thử lại.'); } finally { setBusy(false); }
    }}>
      <label className={fieldClass}>Mật khẩu mới<input name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={256}/></label>
      <label className={fieldClass}>Nhập lại<input name="repeat" type="password" autoComplete="new-password" required minLength={12} maxLength={256}/></label>
      <Button variant="primary" disabled={busy}>{busy ? 'Đang lưu…' : 'Đặt mật khẩu'}</Button>
      <p role="alert">{error}</p>
    </form>
  </AuthCard>;
}
