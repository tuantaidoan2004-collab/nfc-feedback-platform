import { OwnerAuth, OwnerError } from '@/lib/owner/auth';
import { OwnerSetupLinks } from '@/lib/owner/setup-link';
import { database } from '@/server/db';
import { ownerCookie,ownerToken,ownerGate,ownerOrigin,ownerInput,ownerJson,ownerFailure,safeDestination } from '@/server/owner-v2';
export async function POST(request:Request){try{
 ownerGate();ownerOrigin(request);const data=await ownerInput(request);
 // `next: null` is the sign-in reached from the front page (lát D4b): it leads to the account's own dashboard, or, for an
 // account whose saved page still waits for approval, to the page that says so.
 if(Object.keys(data).sort().join()!=='next,password,username'||(data.next!==null&&!safeDestination(data.next)))throw new OwnerError(400,'INVALID_INPUT');
 const session=await new OwnerAuth(database()).login(data.username,data.password,await ownerToken());
 const home=data.next===null?await new OwnerSetupLinks(database()).dashboardSlug(session.userId):null;
 const response=ownerJson({next:safeDestination(data.next)??(home?`/ZZZ/${home}`:'/owner/cho-duyet')});
 response.cookies.set(ownerCookie,session.token,{httpOnly:true,sameSite:'strict',secure:new URL(request.url).protocol==='https:',path:'/',expires:session.expiresAt});return response;
}catch(error){return ownerFailure(error);}}
