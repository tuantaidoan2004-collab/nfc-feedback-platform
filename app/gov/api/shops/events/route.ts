import { AdminAuth } from '@/lib/admin/auth';
import { tellOrganizer } from '@/lib/events/organizer';
import { ShopEvents } from '@/lib/events/shop-events';
import { database } from '@/server/db';
import { adminFailure, adminGate, adminInput, adminJson, adminOrigin, adminSessionToken } from '@/server/admin';

// Khúc B: open or close an organizer's event for one shop (`{ shopId, event, open }`). Opening shows the block on every live
// page of the shop at once (between the first section and the rest); closing takes it off. The shop's owner does nothing.
// The organizer is told after (lib/events/organizer.ts); its answer only goes back to /gov as a note.
export async function POST(request: Request) {
  try {
    adminGate(); adminOrigin(request);
    const principal = await new AdminAuth(database()).access(await adminSessionToken());
    const { slug, name, ...done } = await new ShopEvents(database()).set(principal.adminId, await adminInput(request));
    // Then the organizer, when it has an API for it (TBQ: creates or pauses the shop on its side). QS is already switched.
    return adminJson({ ...done, organizer: await tellOrganizer(done.event, done.open ? 'open' : 'close', { slug, name }) });
  } catch (error) { return adminFailure(error); }
}
