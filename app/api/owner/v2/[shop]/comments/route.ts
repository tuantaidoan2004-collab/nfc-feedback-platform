import { OwnerComments } from '@/lib/owner/comments';
import { OwnerError } from '@/lib/owner/auth';
import { database } from '@/server/db';
import { ownerCredential, ownerGate, ownerOrigin, ownerInput, ownerJson, ownerFailure } from '@/server/owner-v2';
type Context = { params: Promise<{ shop: string }> };
// Replies under one customer's feedback (lát F4): read a thread, write, change (edit, pin, like) and delete.
export async function GET(request: Request, context: Context) {
  try { ownerGate();
    const params = new URL(request.url).searchParams;
    if ([...params.keys()].join() !== 'session') throw new OwnerError(400, 'INVALID_COMMENT');
    return ownerJson(await new OwnerComments(database()).list(await ownerCredential(), (await context.params).shop, params.get('session'))); }
  catch (error) { return ownerFailure(error); }
}
const write = (method: 'create' | 'change' | 'remove') => async (request: Request, context: Context) => {
  try { ownerGate(); ownerOrigin(request);
    return ownerJson(await new OwnerComments(database())[method](await ownerCredential(), (await context.params).shop, await ownerInput(request))); }
  catch (error) { return ownerFailure(error); }
};
export const POST = write('create'), PATCH = write('change'), DELETE = write('remove');
