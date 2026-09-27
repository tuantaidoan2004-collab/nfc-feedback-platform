'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { buttonClass } from './platform/ui';
export default function AdminSignOut() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return <button className={buttonClass('secondary')} disabled={busy} onClick={async () => {
    setBusy(true);
    try { await fetch('/gov/api/logout', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}' }); }
    finally { router.replace('/gov/login'); router.refresh(); }
  }}>{busy ? 'Đang thoát…' : 'Đăng xuất'}</button>;
}
