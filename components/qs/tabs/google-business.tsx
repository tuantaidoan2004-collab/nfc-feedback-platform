'use client';
/** Trạng thái Google Business của quán, dùng chung cho Dashboard, Data và bước kết nối trong onboarding. */
import { useCallback, useEffect, useState } from 'react';
import type { Connection, ReviewRow } from '@/lib/google/business';

export type BusinessStatus = { connection: Connection | null; reviews: ReviewRow[]; real: boolean; simulation: boolean; canManage: boolean };
export const GOOGLE_ERRORS: Record<string, string> = {
  GOOGLE_NOT_CONNECTED: 'Quán chưa kết nối Google Business.', GOOGLE_ACCESS_REVOKED: 'Google đã thu hồi quyền. Bấm "Kết nối" để cho phép lại.',
  GOOGLE_API_NOT_GRANTED: 'Google chưa cấp quyền API cho nền tảng (đang chờ duyệt).', GOOGLE_NO_LOCATION: 'Tài khoản Google này không quản lý hồ sơ doanh nghiệp nào.',
  OWNER_ROLE_REQUIRED: 'Chỉ chủ quán mới kết nối hoặc ngắt kết nối được.', PERMISSION_REQUIRED: 'Bạn chưa có quyền này.',
};

export function useGoogleBusiness(slug: string) {
  const [data, setData] = useState<BusinessStatus | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/owner/v2/${slug}/google-business`, { cache: 'no-store' });
      if (response.ok) setData(await response.json());
    } catch { /* The next action reloads. */ }
  }, [slug]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  const act = useCallback(async (action: 'simulate' | 'sync' | 'disconnect') => {
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/owner/v2/${slug}/google-business`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) setError(GOOGLE_ERRORS[body.error] ?? 'Chưa làm được. Thử lại sau.');
      await load();
      return response.ok;
    } catch { setError('Không thể kết nối. Thử lại sau.'); return false; }
    finally { setBusy(false); }
  }, [slug, load]);
  return { data, busy, error, act, reload: load };
}
