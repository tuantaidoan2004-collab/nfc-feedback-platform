import { OwnerAuth } from '@/lib/owner/auth';
import { database } from '@/server/db';
import { ownerCookie,ownerToken,ownerGate,ownerOrigin,ownerJson,ownerFailure } from '@/server/owner-v2';
export async function POST(request:Request){try{ownerGate();ownerOrigin(request);await new OwnerAuth(database()).logout(await ownerToken());const response=ownerJson({signedOut:true});
 response.cookies.set(ownerCookie,'',{httpOnly:true,sameSite:'strict',secure:new URL(request.url).protocol==='https:',path:'/',maxAge:0});return response;
}catch(error){return ownerFailure(error);}}
