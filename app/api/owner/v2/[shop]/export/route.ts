import { OwnerAuth,OwnerError } from '@/lib/owner/auth';
import { dictionary,exportHeaders,exportStream,type Dataset } from '@/lib/owner/export';
import { parseFilters } from '@/lib/owner/filters';
import { database,ownerExportDatabase } from '@/server/db';
import { ownerCredential,ownerGate,ownerFailure } from '@/server/owner-v2';
export async function GET(request:Request,context:{params:Promise<{shop:string}>}){try{
 ownerGate();const params=new URL(request.url).searchParams,format=params.get('format')??'csv',dataset=params.get('dataset')??'experiences';
 if(!['csv','jsonl','dictionary'].includes(format)||!['experiences','page_visits','receipts'].includes(dataset)||params.has('cursor'))throw new OwnerError(400,'INVALID_EXPORT');
 const filters=parseFilters(params),credential=await ownerCredential(),slug=(await context.params).shop,pool=database();
 // Asked for every format, dictionary included: an overview session is refused the export route as a whole.
 await new OwnerAuth(pool).access(credential,slug,'export');
 if(format==='dictionary')return Response.json(dictionary(dataset as Dataset),{headers:exportHeaders('dictionary',dataset as Dataset)});
 return new Response(await exportStream(pool,credential,slug,filters,dataset as Dataset,format as 'csv'|'jsonl',request.signal,ownerExportDatabase()),{headers:exportHeaders(format as 'csv'|'jsonl',dataset as Dataset)});
}catch(error){return ownerFailure(error);}}
