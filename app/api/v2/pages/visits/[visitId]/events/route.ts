import { publishingApi } from '@/server/publishing-runtime';
export const runtime = 'nodejs';
/**
 * Behaviour from a published page. This is the path a real card leads to: the `/api/v2/shops/<slug>/…` routes are
 * switched off whenever publishing is on, so a route that only exists there would answer 404 to every real
 * customer (found by probing production, 21/09).
 */
export async function POST(request: Request, context: { params: Promise<{ visitId: string }> }) {
  return publishingApi()(request, { shop: 'page', ...await context.params }, 'events');
}
