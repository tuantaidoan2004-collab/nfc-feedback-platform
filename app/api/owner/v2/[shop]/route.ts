import { OwnerDashboard } from '@/lib/owner/dashboard';
import { parseFilters } from '@/lib/owner/filters';
import { database } from '@/server/db';
import { ownerToken,ownerGate,ownerOrigin,ownerInput,ownerJson,ownerFailure } from '@/server/owner-v2';
type Context={params:Promise<{shop:string}>};
export async function GET(request:Request,context:Context){try{ownerGate();return ownerJson(await new OwnerDashboard(database()).read(await ownerToken(),(await context.params).shop,parseFilters(new URL(request.url).searchParams)));}catch(error){return ownerFailure(error);}}
export async function PATCH(request:Request,context:Context){try{ownerGate();ownerOrigin(request);return ownerJson(await new OwnerDashboard(database()).update(await ownerToken(),(await context.params).shop,await ownerInput(request)));}catch(error){return ownerFailure(error);}}
