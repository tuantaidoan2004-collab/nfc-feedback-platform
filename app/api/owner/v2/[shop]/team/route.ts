import { OwnerTeam } from '@/lib/owner/team';
import { database } from '@/server/db';
import { ownerCredential, ownerGate, ownerOrigin, ownerInput, ownerJson, ownerFailure } from '@/server/owner-v2';
type Context = { params: Promise<{ shop: string }> };
const setupUrl = (token: string) => `${process.env.APP_ORIGIN ?? ''}/owner/setup/${token}`;
// The shop's people and roles (lát F3): list, invite with a single-use link, and one change to one person.
export async function GET(_: Request, context: Context) {
  try { ownerGate(); return ownerJson(await new OwnerTeam(database()).list(await ownerCredential(), (await context.params).shop)); }
  catch (error) { return ownerFailure(error); }
}
export async function POST(request: Request, context: Context) {
  try { ownerGate(); ownerOrigin(request);
    const invited = await new OwnerTeam(database()).invite(await ownerCredential(), (await context.params).shop, await ownerInput(request));
    return ownerJson({ userId: invited.userId, handle: invited.handle, expiresAt: invited.expiresAt, setupUrl: setupUrl(invited.token) }); }
  catch (error) { return ownerFailure(error); }
}
export async function PATCH(request: Request, context: Context) {
  try { ownerGate(); ownerOrigin(request);
    const result = await new OwnerTeam(database()).change(await ownerCredential(), (await context.params).shop, await ownerInput(request));
    return ownerJson('token' in result ? { expiresAt: result.expiresAt, setupUrl: setupUrl(result.token as string) } : result); }
  catch (error) { return ownerFailure(error); }
}
