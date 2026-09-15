import { publishingApi } from '@/server/publishing-runtime';
export const runtime = 'nodejs';
export async function POST(request: Request) { return publishingApi()(request, { shop: 'page' }, 'register'); }
