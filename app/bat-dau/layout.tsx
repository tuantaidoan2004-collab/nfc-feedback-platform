import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { ownerEnabled } from '@/server/owner-v2';
import { qsTheme } from '@/server/onboarding';
import '@/components/qs/qs.css';

export const metadata = { title: 'Bắt đầu miễn phí', description: 'Tạo tài khoản, chọn template và nối quán với Google — chỉ vài bước.' };
export default async function Layout({ children }: { children: ReactNode }) {
  if (!ownerEnabled()) notFound();
  return <div className="qs" data-theme={await qsTheme()}>{children}</div>;
}
