'use client';
/** Trạng thái Google Business của quán, dùng chung cho Dashboard, Data và bước kết nối trong onboarding. */
import { useCallback, useEffect, useState } from 'react';
import type { Connection, ReviewRow } from '@/lib/google/business';

/** `maps`: the Google Maps review tool is set up, so the shop may paste its Google Maps link (lib/google/business.ts). */
export type BusinessStatus = { connection: Connection | null; reviews: ReviewRow[]; real: boolean; maps: boolean; canManage: boolean };
export const GOOGLE_ERRORS: Record<string, string> = {
  GOOGLE_NOT_CONNECTED: 'Quán chưa kết nối Google Business.', GOOGLE_ACCESS_REVOKED: 'Google đã thu hồi quyền. Bấm "Kết nối" để cho phép lại.',
  GOOGLE_API_NOT_GRANTED: 'Google chưa cấp quyền API cho nền tảng (đang chờ duyệt).', GOOGLE_NO_LOCATION: 'Tài khoản Google này không quản lý hồ sơ doanh nghiệp nào.',
  OWNER_ROLE_REQUIRED: 'Chỉ chủ quán mới kết nối hoặc ngắt kết nối được.', PERMISSION_REQUIRED: 'Bạn chưa có quyền này.',
  INVALID_MAPS_LINK: 'Chưa phải link Google Maps của một quán. Mở Google Maps → quán của bạn → Chia sẻ → Sao chép đường liên kết.',
  GOOGLE_CONNECTED: 'Quán đang nối thẳng Google Business, không cần link Google Maps.',
  MAPS_NOT_SET_UP: 'Máy chủ chưa bật lấy đánh giá từ Google Maps.', MAPS_RUN_FAILED: 'Lần lấy đánh giá gần nhất chưa được. Kiểm tra lại link hoặc bấm Cập nhật ngay.',
};
/** Google's figures are estimates (google-policy.md rule 10); a day from Google Maps is the tool's guess from "2 tháng trước". */
export const ESTIMATE = 'ước đoán';
export const dayOf = (value: string) => new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'medium' }).format(new Date(value));
export const momentOf = (value: string) => new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));

/** A `maps` connection with a reading asked for and not yet arrived. */
export const waitingForTool = (connection: Connection | null) => connection?.mode === 'maps'
  && (!connection.lastSyncedAt || (!!connection.requestedAt && connection.requestedAt > connection.lastSyncedAt)) && connection.lastError !== 'MAPS_RUN_FAILED';

export function useGoogleBusiness(slug: string) {
  const [data, setData] = useState<BusinessStatus | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/owner/v2/${slug}/google-business`, { cache: 'no-store' });
      if (response.ok) setData(await response.json());
    } catch { /* The next action reloads. */ }
  }, [slug]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  // While the tool has a reading to do for this shop (a new link, "Cập nhật ngay"), look again every 20 seconds.
  const waiting = waitingForTool(data?.connection ?? null);
  useEffect(() => { if (!waiting) return; const timer = setInterval(() => void load(), 20000); return () => clearInterval(timer); }, [waiting, load]);
  const act = useCallback(async (action: 'maps-link' | 'sync' | 'disconnect', url?: string) => {
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/owner/v2/${slug}/google-business`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(url === undefined ? { action } : { action, url }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) setError(GOOGLE_ERRORS[body.error] ?? 'Chưa làm được. Thử lại sau.');
      await load();
      return response.ok;
    } catch { setError('Không thể kết nối. Thử lại sau.'); return false; }
    finally { setBusy(false); }
  }, [slug, load]);
  return { data, busy, error, act, reload: load };
}
