/**
 * Tab Thanh toán, bản đầu (lát P5b-lite, migration 031): the shapes both sides share, with no database in them, so the
 * rules are tested on their own. No payment gateway: the shop transfers to the operator's account, sends the receipt on
 * Zalo, and the operator records it in /gov.
 */
export type PaymentSettings = { bank: string; holder: string; account: string; zalo: string; qr: string | null };
export type PaymentKind = 'trial' | 'payment';
export type PaymentInput = { shopId: string; kind: PaymentKind; amountVnd: number; coversUntil: string; note: string | null };

export class BillingError extends Error { constructor(public readonly code: string) { super(code); } }
const printable = (value: string) => ![...value].some(character => (character.codePointAt(0) ?? 0) < 32 || '<>'.includes(character));
const words = (value: unknown, max: number) => typeof value === 'string' && value.trim() && [...value.trim()].length <= max && printable(value) ? value.trim() : null;
/** A QR picture as the browser read it: PNG, JPEG or WebP, base64, and small (the whole row is capped in migration 031). */
export const QR_MAX_CHARS = 500_000;
const QR = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function readPaymentSettings(value: unknown): PaymentSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BillingError('INVALID_SETTINGS');
  const input = value as Record<string, unknown>;
  if (Object.keys(input).sort().join() !== 'account,bank,holder,qr,zalo') throw new BillingError('INVALID_SETTINGS');
  const bank = words(input.bank, 60), holder = words(input.holder, 60);
  const account = typeof input.account === 'string' ? input.account.replace(/[\s.-]/g, '') : '';
  const zalo = typeof input.zalo === 'string' ? input.zalo.replace(/[\s.()-]/g, '').replace(/^\+84/, '0') : '';
  const qr = input.qr === null ? null : typeof input.qr === 'string' && input.qr.length <= QR_MAX_CHARS && QR.test(input.qr) ? input.qr : undefined;
  if (!bank || !holder || !/^[0-9]{6,20}$/.test(account) || !/^[0-9]{8,15}$/.test(zalo) || qr === undefined) throw new BillingError('INVALID_SETTINGS');
  return { bank, holder, account, zalo, qr };
}

export function readPayment(value: unknown): PaymentInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BillingError('INVALID_PAYMENT');
  const input = value as Record<string, unknown>;
  const keys = Object.keys(input).filter(key => key !== 'note').sort().join();
  if (keys !== 'amountVnd,coversUntil,kind,shopId') throw new BillingError('INVALID_PAYMENT');
  const { shopId, kind, amountVnd, coversUntil } = input;
  if (typeof shopId !== 'string' || !UUID.test(shopId) || (kind !== 'trial' && kind !== 'payment')) throw new BillingError('INVALID_PAYMENT');
  if (!Number.isInteger(amountVnd) || Number(amountVnd) < 0 || Number(amountVnd) > 100_000_000 || (kind === 'trial' && amountVnd !== 0)) throw new BillingError('INVALID_PAYMENT');
  if (typeof coversUntil !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(coversUntil) || Number.isNaN(Date.parse(`${coversUntil}T00:00:00Z`))
    || new Date(`${coversUntil}T00:00:00Z`).toISOString().slice(0, 10) !== coversUntil) throw new BillingError('INVALID_PAYMENT');
  const note = input.note === undefined || input.note === null || input.note === '' ? null : words(input.note, 200);
  if (note === null && typeof input.note === 'string' && input.note.trim()) throw new BillingError('INVALID_PAYMENT');
  return { shopId, kind, amountVnd: Number(amountVnd), coversUntil, note };
}

/** What a shop reads first on its billing tab, from the newest record and today's date in Việt Nam. */
export type BillingStatus = { kind: 'none' } | { kind: PaymentKind; coversUntil: string; daysLeft: number };
/** The transfer's content: short, the shop's own code, so the operator matches a receipt to a shop at a glance. */
export const transferMemo = (slug: string) => `QS ${slug.toUpperCase()}`;
