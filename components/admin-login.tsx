'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AuthCard, Button, fieldClass } from './platform/ui';
export default function AdminLogin() {
  const router = useRouter();
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  return <AuthCard eyebrow="Quản trị nền tảng">
    <h1>Đăng nhập</h1>
    <p>Khu vực này tách riêng khỏi tài khoản chủ shop.</p>
    <form onSubmit={async event => {
      event.preventDefault(); setBusy(true); setError('');
      const form = new FormData(event.currentTarget);
      try {
        const response = await fetch('/gov/api/login', { method: 'POST', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: form.get('username'), password: form.get('password'), code: String(form.get('code') ?? '').trim() }) });
        // A wrong password, an unknown name and a throttled attempt share one message on purpose.
        if (!response.ok) { setError(response.status === 401 ? 'Không thể đăng nhập. Kiểm tra thông tin hoặc thử lại sau.' : 'Dịch vụ đang gián đoạn. Vui lòng thử lại.'); return; }
        router.replace('/gov'); router.refresh();
      } catch { setError('Không thể kết nối. Vui lòng thử lại.'); } finally { setBusy(false); }
    }}>
      <label className={fieldClass}>Tài khoản<input name="username" autoComplete="username" required maxLength={64}/></label>
      <label className={fieldClass}>Mật khẩu<input name="password" type="password" autoComplete="current-password" required maxLength={256}/></label>
      {/* Always shown, never told whether this account needs it: the reply must not say which half was wrong. */}
      <label className={fieldClass}>Mã xác thực<input name="code" inputMode="text" autoComplete="one-time-code" maxLength={64}
        placeholder="6 số, hoặc mã dự phòng" aria-describedby="code-hint"/></label>
      <p id="code-hint">Để trống nếu tài khoản chưa bật xác thực hai bước.</p>
      <Button variant="primary" disabled={busy}>{busy ? 'Đang đăng nhập…' : 'Đăng nhập'}</Button>
      <p role="alert">{error}</p>
    </form>
  </AuthCard>;
}
