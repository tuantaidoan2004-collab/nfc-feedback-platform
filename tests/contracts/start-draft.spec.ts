import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { qrMatrix, qrSvg } from '../../lib/qr';
import { DRAFT_DAYS, DraftError, readDraftInput, base64url, fromBase64url } from '../../lib/start/draft';
import { signDraft, verifyDraft } from '../../lib/start/draft-sign';
import { signContext } from '../../lib/publishing/proof';

/**
 * Lát D4: a page built before there is an account travels inside its own signed link, and the QR code that opens it is
 * drawn by the platform. Nothing is stored, so these rules are the whole of the draft's safety.
 */
const ring = { active: 'v1', keys: { v1: 'k'.repeat(32) } };
const draft = readDraftInput({ name: '  Cà  Phê Ban Mai ', template: 'glass', kind: 'cafe', hours: ['evening', 'noon'], goals: [] });
const code = (error: unknown) => error instanceof DraftError ? error.code : String(error);
const refused = (run: () => unknown) => { try { run(); return 'accepted'; } catch (error) { return code(error); } };

test('a draft is a name, a template and three answers, cleaned the way a page name is', () => {
  expect(draft).toEqual({ name: 'Cà Phê Ban Mai', template: 'glass', kind: 'cafe', hours: ['noon', 'evening'], goals: [] });
  expect(refused(() => readDraftInput({ name: '', template: 'glass' }))).toBe('INVALID_DRAFT');
  expect(refused(() => readDraftInput({ name: 'x'.repeat(61), template: 'glass' }))).toBe('INVALID_DRAFT');
  expect(refused(() => readDraftInput({ name: 'Quán <b>', template: 'glass' }))).toBe('INVALID_DRAFT');
  expect(refused(() => readDraftInput({ name: 'Quán', template: 'apple' }))).toBe('INVALID_DRAFT');
  expect(refused(() => readDraftInput({ name: 'Quán', template: 'glass', kind: 'bank' }))).toBe('INVALID_DRAFT');
  expect(refused(() => readDraftInput({ name: 'Quán', template: 'glass', hours: ['noon', 'noon', 'noon', 'noon', 'noon', 'noon'] }))).toBe('INVALID_DRAFT');
  // The Google trip-wire of google-policy.md mục 3b: a draft opens on this domain like a page does.
  expect(refused(() => readDraftInput({ name: 'Đánh giá 5 sao nhận quà', template: 'glass' }))).toBe('DRAFT_POLICY');
  expect(refused(() => readDraftInput({ name: 'Quán quan trọng', template: 'glass' }))).toBe('accepted');
});

test('the link opens for seven days, only with its own signature, and a render proof never passes for one', () => {
  const now = new Date('2026-09-27T10:00:00Z');
  const { token, expiresAt } = signDraft(draft, ring, now);
  expect(expiresAt.getTime() - now.getTime()).toBe(DRAFT_DAYS * 86_400_000);
  expect(verifyDraft(token, ring, now)).toEqual({ ...draft, expiresAt: new Date(Math.floor(expiresAt.getTime() / 1000) * 1000) });
  expect(refused(() => verifyDraft(token, ring, new Date(expiresAt.getTime() + 1000)))).toBe('DRAFT_EXPIRED');
  const [id, payload, mac] = token.split('.');
  // Another key, a changed draft, a changed signature, a key the ring does not hold: none opens.
  expect(refused(() => verifyDraft(token, { active: 'v1', keys: { v1: 'j'.repeat(32) } }, now))).toBe('INVALID_DRAFT');
  const other = readDraftInput({ name: 'Quán Khác', template: 'glass' });
  const swapped = signDraft(other, ring, now).token.split('.')[1];
  expect(refused(() => verifyDraft(`${id}.${swapped}.${mac}`, ring, now))).toBe('INVALID_DRAFT');
  expect(refused(() => verifyDraft(`${id}.${payload}.${mac.startsWith('A') ? 'B' : 'A'}${mac.slice(1)}`, ring, now))).toBe('INVALID_DRAFT');
  expect(refused(() => verifyDraft(`v9.${payload}.${mac}`, ring, now))).toBe('INVALID_DRAFT');
  expect(refused(() => verifyDraft('', ring, now))).toBe('INVALID_DRAFT');
  // The same render key signs guest pages' proofs; a proof is never a draft (its key is derived for drafts only).
  const proof = signContext({ v: 1, shopId: '00000000-0000-4000-8000-000000000001', releaseId: '00000000-0000-4000-8000-000000000002', tagId: null,
    previewId: null, scope: 'live', entryKey: 'direct:shop' }, ring);
  expect(refused(() => verifyDraft(proof, ring, now))).toBe('INVALID_DRAFT');
  // Signed drafts are re-checked: a name the trip-wire refuses today does not open even with a good signature.
  const signedBefore = signDraft({ name: 'Đánh giá nhận quà', template: 'glass', kind: null, hours: [], goals: [] }, ring, now).token;
  expect(refused(() => verifyDraft(signedBefore, ring, now))).toBe('DRAFT_POLICY');
});

test('base64url has one spelling per payload and round-trips UTF-8', () => {
  const bytes = new TextEncoder().encode('Nguyễn Đỗ Quỳnh · ẫ ộ ự');
  expect(fromBase64url(base64url(bytes))).toEqual(bytes);
  expect(base64url(bytes)).toBe(Buffer.from(bytes).toString('base64url'));
  expect(refused(() => fromBase64url('QR'))).toBe('INVALID_DRAFT');
  expect(refused(() => fromBase64url('QQ='))).toBe('INVALID_DRAFT');
});

/**
 * The QR encoder (lib/qr.ts). Chrome's own QR reader (BarcodeDetector, macOS) read these exact matrices on 27/09, and
 * every version 1–40 filled to its level-M byte capacity; CI's Linux Chrome has no reader, so the hashes pin them, and a
 * change to the encoder shows up here before it shows up as a code no phone reads.
 */
const bits = (text: string) => createHash('sha256').update(qrMatrix(text).map(row => row.map(dark => dark ? 1 : 0).join('')).join('\n')).digest('hex');
test('the QR code is the one a QR reader read', () => {
  expect(bits('HELLO')).toBe('c346c75add5698735afe3f7eb4f3e6c57ccefd9563f45f65c6d76aa518fb6f91');
  const link = 'https://quitesensational-review-bio.com/thu/v1.eyJ2IjoxLCJuIjoiQ8OgIFBow6ogQmFuIE1haSIsInQiOiJnbGFzcyIsImUiOjE3OTExMjE1NDV9.v5xeovvsZVRVHpjS9VPTnqjhtLehVLYSByn8cVMY6cg';
  expect(qrMatrix(link)).toHaveLength(53);
  expect(bits(link)).toBe('55baf14ec350bdc21d41c5cf7f811a6c7876dc3b6af56faf0389e2354a620cf5');
});

test('the QR code grows with the text, keeps its finder squares, and escapes its label', () => {
  // Level M byte capacity: 14 bytes fit version 1 (21 modules), 15 need version 2; 2331 fit version 40, 2332 do not.
  expect(qrMatrix('x'.repeat(14))).toHaveLength(21);
  expect(qrMatrix('x'.repeat(15))).toHaveLength(25);
  expect(qrMatrix('x'.repeat(2331))).toHaveLength(177);
  expect(() => qrMatrix('x'.repeat(2332))).toThrow('QR_TOO_LONG');
  const m = qrMatrix('x'.repeat(300)), n = m.length;
  for (const [x, y] of [[0, 0], [n - 7, 0], [0, n - 7]]) {
    expect(m[y].slice(x, x + 7)).toEqual([true, true, true, true, true, true, true]);
    expect(m[y + 1].slice(x, x + 7)).toEqual([true, false, false, false, false, false, true]);
    expect(m[y + 3].slice(x, x + 7)).toEqual([true, false, true, true, true, false, true]);
  }
  const svg = qrSvg('HELLO', 'a "b" <c>');
  expect(svg).toContain('aria-label="a &quot;b&quot; &lt;c&gt;"');
  expect(svg).toContain('viewBox="0 0 29 29"');
});
