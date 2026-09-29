import { test, expect } from '@playwright/test';
import { presignObject, removeObject, uploadKey, type StorageSettings } from '../../lib/media/storage';

/**
 * Rà bảo mật 29/09, C3b-2: a refused upload is removed from the store (lib/admin/media-review.ts). Only an upload this app
 * handed out to a shop is ever named for removal, and removing it is one signed DELETE.
 */
const settings: StorageSettings = { endpoint: 'https://acct.r2.cloudflarestorage.com', region: 'auto', accessKeyId: 'AK', secretAccessKey: 'SK',
  bucket: 'nfc-media', publicOrigin: 'https://media.example.com' };
const shop = '0f8fad5b-d9cb-469f-a165-70867728950e', file = '7c9e6679-7425-40de-944b-e07fc1f90ae7', key = `shops/${shop}/${file}.jpg`;

test('only the key of an upload this app handed out to a shop is ever named for removal', () => {
  expect(uploadKey(settings, `https://media.example.com/${key}`)).toBe(key);
  for (const ext of ['png', 'webp', 'mp4']) expect(uploadKey(settings, `https://media.example.com/shops/${shop}/${file}.${ext}`)).toBe(`shops/${shop}/${file}.${ext}`);
  // A path-style store's public origin carries the bucket's path.
  expect(uploadKey({ ...settings, publicOrigin: 'https://s3.example.com/nfc-media' }, `https://s3.example.com/nfc-media/${key}`)).toBe(key);
  for (const url of [
    `https://old.r2.dev/${key}`, // an older store's address: this store holds nothing there
    `https://media.example.com.evil.example/${key}`, `http://media.example.com/${key}`,
    `https://media.example.com/users/${shop}/${file}.jpg`, // a profile picture, never reviewed
    `https://media.example.com/shops/${shop}/../${file}.jpg`, `https://media.example.com/shops/${shop}/${file}.jpg?x=1`,
    `https://media.example.com/shops/${shop}/${file}.gif`, `https://media.example.com/shops/${shop}/${file}.jpg/extra`,
    `https://media.example.com/shops/${shop.toUpperCase()}/${file}.jpg`, '/media/stem-background.jpg', '',
  ]) expect(uploadKey(settings, url), url).toBeNull();
});

test('removal is one signed DELETE to the store; gone, or never there, counts as removed; any other answer is an error', async () => {
  const seen: { url: string; method?: string }[] = [];
  const answer = (status: number) => (async (url: string | URL | Request, init?: RequestInit) => {
    seen.push({ url: String(url), method: init?.method }); return new Response(null, { status }); }) as typeof fetch;
  const date = new Date('2026-09-29T10:00:00Z');
  expect(await removeObject(settings, key, answer(204), date)).toBe(true);
  expect(seen).toEqual([{ method: 'DELETE', url: presignObject(settings, 'DELETE', key, { date, expiresSeconds: 60 }) }]);
  const signed = new URL(seen[0].url);
  expect([signed.host, signed.pathname, signed.searchParams.get('X-Amz-Expires')]).toEqual(['acct.r2.cloudflarestorage.com', `/nfc-media/${key}`, '60']);
  // Signed as a DELETE: the same key's GET signature is a different one, so no read link can remove a file.
  const read = new URL(presignObject(settings, 'GET', key, { date, expiresSeconds: 60 }));
  expect(signed.searchParams.get('X-Amz-Signature')).not.toBe(read.searchParams.get('X-Amz-Signature'));
  expect(await removeObject(settings, key, answer(404), date)).toBe(true);
  for (const status of [403, 500]) await expect(removeObject(settings, key, answer(status), date)).rejects.toThrow(`STORE_${status}`);
});
