import { publishingApi } from '@/server/publishing-runtime';
export const runtime = 'nodejs';
/** A customer erasing what they wrote, proven by the secret their own browser holds (lát B). */
export async function POST(request: Request, context: { params: Promise<{ visitId: string }> }) {
  return publishingApi()(request, await context.params, 'erase');
}
