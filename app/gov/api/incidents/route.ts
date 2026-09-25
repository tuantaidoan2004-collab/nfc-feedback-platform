import { AdminAuth } from '@/lib/admin/auth';
import { PageIncidents } from '@/lib/admin/page-incidents';
import { database } from '@/server/db';
import { adminGate, adminJson, adminFailure, adminSessionToken } from '@/server/admin';

// Emergency stops owners have reported and nobody has handled yet (lát P4).
export async function GET() {
  try { adminGate(); await new AdminAuth(database()).access(await adminSessionToken()); return adminJson({ incidents: await new PageIncidents(database()).open() }); }
  catch (error) { return adminFailure(error); }
}
