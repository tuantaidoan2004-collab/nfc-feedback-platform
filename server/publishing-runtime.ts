import 'server-only';
import { createVisitV2Api } from './visit-v2-api';
import { database } from './db';
import { visitsV2Enabled } from './visit-v2-runtime';
import { verifyContext, signContext, type ProofKeyring } from '@/lib/publishing/proof';
import { PublishingResolver } from '@/lib/publishing/repository';
import { publishingVisitPolicy } from '@/lib/publishing/visit-policy';
import { VisitAccessDenied } from '@/lib/repositories/visit-ratings';
export const publishingEnabled = () => visitsV2Enabled() && process.env.NFC_PUBLISHING_ENABLED === 'true';
/** The render key: signs guest pages' render proofs, and (through a key derived from it) draft links (lát D4). */
export function keyring(): ProofKeyring {
  const secret = process.env.NFC_RENDER_SIGNING_KEY;
  if (!secret || Buffer.byteLength(secret) < 32) throw new Error('RENDER_KEY_UNAVAILABLE');
  return { active: 'v1', keys: { v1: secret } };
}
export function previewCookie(request: Request) { return /(?:^|;\s*)nfc_preview=([a-f0-9]{64})(?:;|$)/.exec(request.headers.get('cookie') ?? '')?.[1]; }
export async function publicPage(target: { slug: string } | { code: string } | { previewToken: string }) {
  if (!publishingEnabled()) throw Error('PUBLISHING_DISABLED');
  const resolver = new PublishingResolver(database());
  const page = 'previewToken' in target ? await resolver.preview(target.previewToken) : await resolver.live(target);
  return { ...page, proof: signContext(page.context, keyring()) };
}
export function publishingApi() {
  return createVisitV2Api({ enabled: publishingEnabled(), origin: process.env.APP_ORIGIN, pool: database,
    resolve: async request => {
      let context; try { context = verifyContext(request.headers.get('X-NFC-Render') ?? '', keyring()); }
      catch { throw new VisitAccessDenied('INVALID_RENDER_PROOF'); }
      return { context, policy: publishingVisitPolicy(context, previewCookie(request)) };
    },
  });
}
