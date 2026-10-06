import type { ReactNode } from 'react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { OwnerAuth, OwnerError } from '@/lib/owner/auth';
import { database } from '@/server/db';
import { ownerCredential, ownerEnabled } from '@/server/owner-v2';
import { cookies } from 'next/headers';
import { THEME_COOKIE } from '@/components/platform/theme-cookie';
import StudioFrame from '@/components/qs/studio-frame';
import { BillingOff } from '@/components/qs/billing-notice';
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
    // A finished support session must not fall through to the owner's sign-in form: the administrator is not the owner.
    if (error instanceof OwnerError && error.code === 'IMPERSONATION_ENDED') return <div className="qs" style={{ display: 'grid', placeItems: 'center', padding: 24 }}>
      <div className="qs-card" style={{ padding: 28, maxWidth: 420, display: 'grid', gap: 12 }}><h2>Phiên xem thay mặt đã kết thúc</h2>
        <p className="qs-muted">Mở phiên mới từ trang quản trị nếu vẫn cần hỗ trợ quán này.</p><Link className="qs-btn" href="/gov">Về trang quản trị</Link></div></div>;
    if (error instanceof OwnerError && error.status === 401) redirect(`/owner/login?next=${encodeURIComponent(`/app/${slug}`)}`);
    // Staff accounts are the Đội ngũ plan's (kịch bản mục 3): the member is told why, not that they have no access.
    if (error instanceof OwnerError && error.code === 'TEAM_PLAN_REQUIRED') return <div className="qs" style={{ display: 'grid', placeItems: 'center', padding: 24 }}>
      <div className="qs-card" data-team-plan-required style={{ padding: 28, maxWidth: 420, display: 'grid', gap: 12 }}><h2>Quán chưa đăng ký gói Đội ngũ</h2>
        <p className="qs-muted">Tài khoản nhân viên chỉ dùng được khi quán dùng gói Đội ngũ (phân quyền). Nhờ chủ quán nâng gói rồi mở lại trang này.</p>
        <Link className="qs-btn ghost" href="/owner/login">Đăng nhập tài khoản khác</Link></div></div>;
    return <div className="qs" style={{ display: 'grid', placeItems: 'center', padding: 24 }}><div className="qs-card" style={{ padding: 28, maxWidth: 420, display: 'grid', gap: 12 }}>
      <h2>Không mở được</h2><p className="qs-muted">Tài khoản đang đăng nhập chưa có quyền với quán này, hoặc dịch vụ đang gián đoạn.</p>
      <Link className="qs-btn" href="/owner/login">Đăng nhập tài khoản khác</Link></div></div>;
  }
  // White by default (kịch bản mục 6); dark or "follow the phone" only when chosen.
  // Past 14 days unpaid (kịch bản mục 3b) the dashboard is only the way to point the cards back at the shop's Google page.
  if (access.billing.state === 'off') {
    const google = (await database().query('SELECT google_url FROM shops WHERE id=$1', [access.shopId])).rows[0]?.google_url ?? null;
    return <BillingOff name={access.name} billing={access.billing} googleUrl={google} />;
  }
  const chosen = (await cookies()).get(THEME_COOKIE)?.value;
  const actor = access.actor;
  const support = actor.kind === 'admin' ? { admin: actor.adminHandle ?? actor.adminUsername, adminTitle: actor.adminTitle, scope: actor.scope, reason: actor.reason, expiresAt: actor.expiresAt } : null;
  return <StudioFrame slug={access.slug} name={access.name} theme={chosen === 'dark' || chosen === 'system' ? chosen : 'light'} support={support} billing={access.billing}>{children}</StudioFrame>;
}
