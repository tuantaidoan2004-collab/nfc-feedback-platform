'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
export default function AdminSignOut() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return <button disabled={busy} onClick={async () => {
    setBusy(true);
    try { await fetch('/gov/api/logout', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}' }); }
    finally { router.replace('/gov/login'); router.refresh(); }
  }}>{busy ? 'Đang thoát…' : 'Đăng xuất'}</button>;
}
