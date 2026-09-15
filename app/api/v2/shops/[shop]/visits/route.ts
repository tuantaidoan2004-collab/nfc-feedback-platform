import { visitV2Api } from '@/server/visit-v2-runtime';
export const runtime = 'nodejs';
export async function POST(request: Request, context: { params: Promise<{ shop: string }> }) {
  return visitV2Api()(request, await context.params, 'register');
}
