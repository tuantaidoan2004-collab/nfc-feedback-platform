import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { OwnerError } from '@/lib/owner/auth';
import { OwnerDesign } from '@/lib/owner/design';
import { onboardingOf } from '@/lib/account/workspace';
import { database } from '@/server/db';
import { ownerCredential } from '@/server/owner-v2';
import { shellAccess } from '@/server/app-access';
import CanvasEditor from '@/components/canvas/editor/editor';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Sửa trang', robots: { index: false, follow: false } };

/**
 * Trình sửa một trang của quán (kịch bản mục 9). Mở được trong lúc onboarding: bước Template tạo trang ở Library rồi sửa ở đây.
 * Ai không có quyền sửa giao diện của quán thì không vào được (lib/owner/design.ts).
 */
export default async function Page({ params }: { params: Promise<{ shop: string; page: string }> }) {
  const { shop, page } = await params;
  const pool = database(), credential = await ownerCredential();
  let state;
  try { state = await new OwnerDesign(pool).read(credential, shop, page); }
  catch (error) {
    if (error instanceof OwnerError && (error.status === 404 || error.status === 403)) notFound();
    // Signed out, or a support session that ended: the layout answers (sign-in, or the ended-session card).
    if (error instanceof OwnerError && error.status === 401) return null;
    throw error;
  }
  const access = await shellAccess(shop);
  if (!access) return null;
  const onboarding = await onboardingOf(pool, access.shopId), actor = access.actor;
  return <CanvasEditor shop={access.slug} page={state.page} revision={state.draft.revision} config={state.draft.config} live={!!state.live}
    googleUrl={state.googleUrl} uploads={state.uploads} onboarding={!onboarding.done && access.actor.kind === 'owner'} origin={process.env.APP_ORIGIN ?? ''}
    firstPublish={state.firstPublish} media={state.media}
    support={actor.kind === 'admin' ? { admin: actor.adminHandle ?? actor.adminUsername, adminTitle: actor.adminTitle, scope: actor.scope, reason: actor.reason, expiresAt: actor.expiresAt } : null} />;
}
