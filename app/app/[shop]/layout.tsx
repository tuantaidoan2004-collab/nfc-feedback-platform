import type { ReactNode } from 'react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { OwnerAuth, OwnerError } from '@/lib/owner/auth';
import { database } from '@/server/db';
import { ownerCredential, ownerEnabled } from '@/server/owner-v2';
import { cookies } from 'next/headers';
import { THEME_COOKIE } from '@/components/platform/theme-cookie';
import StudioFrame from '@/components/qs/studio-frame';
import '@/components/qs/qs.css';

export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false, follow: false } };

/** Giao diện chính của một quán (kịch bản mục 6–7). The frame only; each tab asks its own API with its own need. */
export default async function Layout({ children, params }: { children: ReactNode; params: Promise<{ shop: string }> }) {
  if (!ownerEnabled()) notFound();
  const slug = (await params).shop;
  let access;
  try { access = await new OwnerAuth(database()).access(await ownerCredential(), slug, 'shell'); }
  catch (error) {
    if (error instanceof OwnerError && error.status === 401) redirect(`/owner/login?next=${encodeURIComponent(`/app/${slug}`)}`);
    return <div className="qs" style={{ display: 'grid', placeItems: 'center', padding: 24 }}><div className="qs-card" style={{ padding: 28, maxWidth: 420, display: 'grid', gap: 12 }}>
      <h2>Không mở được</h2><p className="qs-muted">Tài khoản đang đăng nhập chưa có quyền với quán này, hoặc dịch vụ đang gián đoạn.</p>
      <Link className="qs-btn" href="/owner/login">Đăng nhập tài khoản khác</Link></div></div>;
  }
  // White by default (kịch bản mục 6); dark or "follow the phone" only when chosen.
  const chosen = (await cookies()).get(THEME_COOKIE)?.value;
  return <StudioFrame slug={access.slug} name={access.name} theme={chosen === 'dark' || chosen === 'system' ? chosen : 'light'}>{children}</StudioFrame>;
}
