import { OwnerTeam } from '@/lib/owner/team';
import { database } from '@/server/db';
import { ownerCredential, ownerGate, ownerOrigin, ownerInput, ownerJson, ownerFailure } from '@/server/owner-v2';
type Context = { params: Promise<{ shop: string }> };
// Roles, Discord-style (lát F3): the owner creates, edits and deletes them.
const handle = (method: 'POST' | 'PATCH' | 'DELETE') => async (request: Request, context: Context) => {
  try { ownerGate(); ownerOrigin(request);
    return ownerJson(await new OwnerTeam(database()).roles(await ownerCredential(), (await context.params).shop, method, await ownerInput(request))); }
  catch (error) { return ownerFailure(error); }
};
export const POST = handle('POST'), PATCH = handle('PATCH'), DELETE = handle('DELETE');
