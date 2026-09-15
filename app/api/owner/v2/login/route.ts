import { OwnerAuth, OwnerError } from '@/lib/owner/auth';
import { database } from '@/server/db';
import { ownerCookie,ownerToken,ownerGate,ownerOrigin,ownerInput,ownerJson,ownerFailure,safeDestination } from '@/server/owner-v2';
export async function POST(request:Request){try{
 ownerGate();ownerOrigin(request);const data=await ownerInput(request);
 if(Object.keys(data).sort().join()!=='next,password,username'||!safeDestination(data.next))throw new OwnerError(400,'INVALID_INPUT');
 const session=await new OwnerAuth(database()).login(data.username,data.password,await ownerToken());
 const response=ownerJson({next:safeDestination(data.next)});
 response.cookies.set(ownerCookie,session.token,{httpOnly:true,sameSite:'strict',secure:new URL(request.url).protocol==='https:',path:'/',expires:session.expiresAt});return response;
}catch(error){return ownerFailure(error);}}
