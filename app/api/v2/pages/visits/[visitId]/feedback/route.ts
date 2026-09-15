import { publishingApi } from '@/server/publishing-runtime';
export const runtime = 'nodejs';
export async function POST(request: Request, context: {params:Promise<{visitId:string}>}) {
 return publishingApi()(request,{shop:'page',visitId:(await context.params).visitId},'feedback');
}
