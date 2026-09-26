import { publishingApi } from '@/server/publishing-runtime';
export const runtime = 'nodejs';
/**
 * Behaviour from a published page, bound to it by the render proof like every other guest write. (Until lát A3b a
 * second set of routes under `/api/v2/shops/<slug>/…` trusted the slug instead; a beacon that only existed there
 * answered 404 to every real customer, found by probing production 21/09.)
 */
export async function POST(request: Request, context: { params: Promise<{ visitId: string }> }) {
  return publishingApi()(request, await context.params, 'events');
}
