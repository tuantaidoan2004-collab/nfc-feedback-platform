import { cookies } from 'next/headers';
import { AdminImpersonation } from '@/lib/admin/impersonation';
import { database } from '@/server/db';
import { impersonationCookie, setImpersonationCookies, ownerGate, ownerOrigin, ownerJson, ownerFailure } from '@/server/owner-v2';

// The banner's "end session" button. The cookies are cleared for the paths of the shop in the URL, which are the
// only paths this request could have carried them on.
export async function DELETE(request: Request, context: { params: Promise<{ shop: string }> }) {
  try {
    ownerGate(); ownerOrigin(request);
    const ended = await new AdminImpersonation(database()).endByToken((await cookies()).get(impersonationCookie)?.value);
    const response = ownerJson({ ended: !!ended });
    const slug = (await context.params).shop;
    // The URL segment becomes a cookie attribute, so only a well-formed slug is used; anything else could inject one.
    const slugs = new Set([...(/^[A-Za-z0-9][A-Za-z0-9-]{0,62}$/.test(slug) ? [slug] : []), ...(ended ? [ended.slug] : [])]);
    for (const each of slugs) setImpersonationCookies(response, request, each, null);
    return response;
  } catch (error) { return ownerFailure(error); }
}
