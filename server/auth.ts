import 'server-only';
import { createHash } from 'node:crypto';
import { cookies } from 'next/headers';
import { database } from './db';
import { HttpError } from './http';
export const hash = (token: string) => createHash('sha256').update(token).digest('hex');
export async function requireOwner(shopId: string) {
  const token = (await cookies()).get('nfc_owner')?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) throw new HttpError(401,'LOGIN_REQUIRED');
  const {rows} = await database().query('SELECT s.user_id FROM owner_sessions s JOIN memberships m ON m.user_id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND m.shop_id=$2',[hash(token),shopId]);
  if (!rows[0]) throw new HttpError(403,'ACCESS_DENIED');
  return rows[0].user_id as string;
}
