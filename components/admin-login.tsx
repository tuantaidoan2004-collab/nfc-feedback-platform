'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import styles from './admin.module.css';
export default function AdminLogin() {
  const router = useRouter();
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  return <main className={styles.login}>
    <p>QUẢN TRỊ NỀN TẢNG</p><h1>Đăng nhập</h1>
    <p>Khu vực này tách riêng khỏi tài khoản chủ shop.</p>
    <form onSubmit={async event => {
      event.preventDefault(); setBusy(true); setError('');
      const form = new FormData(event.currentTarget);
      try {
        const response = await fetch('/gov/api/login', { method: 'POST', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: form.get('username'), password: form.get('password') }) });
        // A wrong password, an unknown name and a throttled attempt share one message on purpose.
        if (!response.ok) { setError(response.status === 401 ? 'Không thể đăng nhập. Kiểm tra thông tin hoặc thử lại sau.' : 'Dịch vụ đang gián đoạn. Vui lòng thử lại.'); return; }
        router.replace('/gov'); router.refresh();
      } catch { setError('Không thể kết nối. Vui lòng thử lại.'); } finally { setBusy(false); }
    }}>
      <label>Tài khoản<input name="username" autoComplete="username" required maxLength={64}/></label>
      <label>Mật khẩu<input name="password" type="password" autoComplete="current-password" required maxLength={256}/></label>
      <button disabled={busy}>{busy ? 'Đang đăng nhập…' : 'Đăng nhập'}</button>
      <p role="alert">{error}</p>
    </form>
  </main>;
}
