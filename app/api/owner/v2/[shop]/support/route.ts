import { OwnerDashboard } from '@/lib/owner/dashboard';
import { database } from '@/server/db';
import { ownerCredential,ownerGate,ownerOrigin,ownerInput,ownerJson,ownerFailure } from '@/server/owner-v2';
// The owner's switch that lets platform support read private feedback. The library refuses impersonation and any
// role other than owner; this route only carries the request there.
export async function PUT(request:Request,context:{params:Promise<{shop:string}>}){try{ownerGate();ownerOrigin(request);
 return ownerJson(await new OwnerDashboard(database()).setSupport(await ownerCredential(),(await context.params).shop,await ownerInput(request)));
}catch(error){return ownerFailure(error);}}
