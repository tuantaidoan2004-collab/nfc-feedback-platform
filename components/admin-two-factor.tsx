'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import styles from './admin.module.css';
import { PLATFORM_NAME } from '@/lib/brand';

type Started = { secret: string; uri: string };
/**
 * Turning on the second factor, in three steps that cannot be skipped: take the secret, prove a code from it
 * works, then keep the backup codes. The middle step is the point -- nothing is switched on until the app has
 * demonstrably produced a correct code, so it is not possible to lock yourself out by mistyping a secret (lát A2).
 */
export default function AdminTwoFactor() {
  const router = useRouter();
  const [started, setStarted] = useState<Started | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [kept, setKept] = useState(false);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);

  const send = async (body: Record<string, string>) => {
    setBusy(true); setError('');
    try {
      const response = await fetch('/gov/api/two-factor', { method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error === 'TWO_FACTOR_CODE_WRONG' ? 'Mã không đúng. Kiểm tra đồng hồ điện thoại rồi thử mã mới.'
          : data.error === 'TOTP_KEY_MISSING' ? 'Máy chủ thiếu khoá mã hoá. Báo người vận hành.'
          : 'Không thực hiện được. Vui lòng thử lại.');
        return null;
      }
      return data as Record<string, never>;
    } catch { setError('Không thể kết nối. Vui lòng thử lại.'); return null; }
    finally { setBusy(false); }
  };

  if (codes) return <main className={styles.login} data-two-factor="codes">
    <p>QUẢN TRỊ NỀN TẢNG</p><h1>Mã dự phòng</h1>
    <p>Mười mã, <strong>mỗi mã dùng được một lần</strong>, để đăng nhập khi mất điện thoại. Chép ra giấy hoặc lưu vào
      trình quản lý mật khẩu <strong>ngay bây giờ</strong>: hệ thống chỉ giữ bản băm, nên không có cách nào hiện lại.</p>
    <ul className={styles.table} data-backup-codes>{codes.map(code => <li key={code}><code>{code}</code></li>)}</ul>
    <label><input type="checkbox" checked={kept} onChange={event => setKept(event.target.checked)}/> Tôi đã lưu mười mã này</label>
    <button disabled={!kept} onClick={() => { router.replace('/gov'); router.refresh(); }}>Vào quản trị</button>
  </main>;

  if (started) return <main className={styles.login} data-two-factor="confirm">
    <p>QUẢN TRỊ NỀN TẢNG</p><h1>Nhập mã để bật</h1>
    <p>Mở ứng dụng xác thực (Google Authenticator, 1Password, Aegis…), chọn thêm tài khoản bằng cách nhập khoá, rồi dán khoá dưới đây.</p>
    <p className={styles.muted}>Tên tài khoản: <strong>{PLATFORM_NAME}</strong></p>
    <p><code data-totp-secret>{started.secret}</code></p>
    <p className={styles.muted}>Hoặc mở đường dẫn này trên chính điện thoại đó: <a href={started.uri}>thêm vào ứng dụng xác thực</a></p>
    <form onSubmit={async event => {
      event.preventDefault();
      const code = String(new FormData(event.currentTarget).get('code') ?? '');
      const result = await send({ action: 'confirm', code });
      if (result) setCodes((result as unknown as { codes: string[] }).codes);
    }}>
      <label>Mã 6 số đang hiện trong ứng dụng<input name="code" inputMode="numeric" required maxLength={16} autoComplete="one-time-code"/></label>
      <button disabled={busy}>{busy ? 'Đang kiểm…' : 'Bật xác thực hai bước'}</button>
      <p role="alert">{error}</p>
    </form>
  </main>;

  return <main className={styles.login} data-two-factor="start">
    <p>QUẢN TRỊ NỀN TẢNG</p><h1>Bật xác thực hai bước</h1>
    <p>Một tài khoản quản trị chạm tới <strong>mọi shop</strong> trên nền tảng, nên chỉ mật khẩu là không đủ.
      Phải bật trước khi làm việc khác.</p>
    <button disabled={busy} onClick={async () => { const result = await send({ action: 'begin' }); if (result) setStarted(result as unknown as Started); }}>
      {busy ? 'Đang tạo khoá…' : 'Bắt đầu'}</button>
    <p role="alert">{error}</p>
  </main>;
}
