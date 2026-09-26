import { publishingApi } from '@/server/publishing-runtime';
export const runtime = 'nodejs';
export async function POST(request: Request, context: {params:Promise<{visitId:string}>}) {
 return publishingApi()(request,{visitId:(await context.params).visitId},'rating');
}
