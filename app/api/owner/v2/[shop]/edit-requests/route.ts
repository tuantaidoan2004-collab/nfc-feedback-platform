import { requestEdit } from '@/lib/owner/edit-requests';
import { database } from '@/server/db';
import { ownerCredential, ownerFailure, ownerGate, ownerInput, ownerJson, ownerOrigin } from '@/server/owner-v2';

// "Nhờ Admin Tài dựng": a template and the Zalo Tài messages, or changes to a page; it then waits in /gov (lib/owner/edit-requests.ts).
export async function POST(request: Request, context: { params: Promise<{ shop: string }> }) {
  try { ownerGate(); ownerOrigin(request); return ownerJson(await requestEdit(database(), await ownerCredential(), (await context.params).shop, await ownerInput(request))); }
  catch (error) { return ownerFailure(error); }
}
