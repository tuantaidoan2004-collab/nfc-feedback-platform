import 'server-only';
import { OwnerAuth, OwnerError } from '@/lib/owner/auth';
import { database } from './db';
import { ownerCredential } from './owner-v2';

/**
 * The giao diện chính's check, for the pages under /app/<shop>. The layout answers a visit it cannot open -- sign in, a
 * support session that ended, an account without this shop -- and Next renders its pages alongside it, so a page steps aside
 * quietly (null) rather than throwing what the layout already answered: an uncaught 401 there is logged as a server error.
 */
export async function shellAccess(slug: string) {
  try { return await new OwnerAuth(database()).access(await ownerCredential(), slug, 'shell'); }
  catch (error) { if (error instanceof OwnerError) return null; throw error; }
}
