import { freeTextProblem } from '../publishing/policy';
import { isTemplateKey, type TemplateKey } from '../publishing/templates';

/**
 * A page built before there is an account (lát D4; docs/ui-ux-nguon-tham-khao.md mục 5A–B). Nothing is stored on the
 * server: the draft travels inside its own link, signed so nobody can forge one on this domain, and it lives
 * DRAFT_DAYS days. It cannot be published -- it holds a name, a template and three answers, nothing a guest acts on.
 *
 * This file is the draft's shape and nothing secret, so /gov's form can read a link the owner sent (`peekDraft`). The
 * signature is checked on the server, in draft-sign.ts.
 */
export const DRAFT_DAYS = 7;
export const DRAFT_NAME_MAX = 60;

/** The three quick questions (mục 5B). Each answer becomes a default later: a template per trade, the day's hours. */
export const SHOP_KINDS = { cafe: 'Quán cà phê', food: 'Quán ăn', spa: 'Spa · salon', bar: 'Bar · pub', other: 'Loại khác' } as const;
export const BUSY_HOURS = { morning: 'Sáng', noon: 'Trưa', afternoon: 'Chiều', evening: 'Tối', late: 'Khuya' } as const;
export const GOALS = { google: 'Thêm đánh giá Google', complaints: 'Biết khách chưa vui điều gì', page: 'Một trang đẹp cho quán', cards: 'Thẻ NFC đặt trên bàn' } as const;
export type ShopKind = keyof typeof SHOP_KINDS;
export type BusyHour = keyof typeof BUSY_HOURS;
export type Goal = keyof typeof GOALS;

export type Draft = { name: string; template: TemplateKey; kind: ShopKind | null; hours: BusyHour[]; goals: Goal[] };
/** A draft as it travels: short keys keep the link, and so the QR code, small. `e` is when it stops opening, in seconds. */
type Wire = { v: 1; n: string; t: string; k?: string; h?: string[]; g?: string[]; e: number };

export class DraftError extends Error { constructor(public readonly code: 'INVALID_DRAFT' | 'DRAFT_POLICY' | 'DRAFT_EXPIRED') { super(code); } }

const printable = (value: string) => ![...value].some(character => (character.codePointAt(0) ?? 0) < 32 || '<>'.includes(character));
/** Only choices from the list, each once, in the list's order: two drafts with the same answers read the same. */
function choices<T extends string>(value: unknown, allowed: Record<T, string>): T[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > Object.keys(allowed).length || !value.every(item => typeof item === 'string' && Object.hasOwn(allowed, item))) throw new DraftError('INVALID_DRAFT');
  return (Object.keys(allowed) as T[]).filter(key => value.includes(key));
}

/**
 * What the builder sent, checked the way a page's own name is: printable, short, and never tying a review to a gift
 * or asking to name someone (google-policy.md mục 3b) -- a draft link opens on this domain.
 */
export function readDraftInput(value: unknown): Draft {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new DraftError('INVALID_DRAFT');
  const input = value as Record<string, unknown>;
  const name = typeof input.name === 'string' ? input.name.trim().replace(/\s+/g, ' ') : '';
  if (!name || [...name].length > DRAFT_NAME_MAX || !printable(name)) throw new DraftError('INVALID_DRAFT');
  if (freeTextProblem(name)) throw new DraftError('DRAFT_POLICY');
  if (!isTemplateKey(input.template)) throw new DraftError('INVALID_DRAFT');
  const kind = input.kind === undefined || input.kind === null ? null : typeof input.kind === 'string' && Object.hasOwn(SHOP_KINDS, input.kind) ? input.kind as ShopKind : undefined;
  if (kind === undefined) throw new DraftError('INVALID_DRAFT');
  return { name, template: input.template, kind, hours: choices(input.hours, BUSY_HOURS), goals: choices(input.goals, GOALS) };
}

export function draftPayload(draft: Draft, expiresAt: Date): string {
  const wire: Wire = { v: 1, n: draft.name, t: draft.template, e: Math.floor(expiresAt.getTime() / 1000),
    ...(draft.kind ? { k: draft.kind } : {}), ...(draft.hours.length ? { h: draft.hours } : {}), ...(draft.goals.length ? { g: draft.goals } : {}) };
  return base64url(new TextEncoder().encode(JSON.stringify(wire)));
}

/** The draft inside a payload, with when it expires. Throws on anything but a well-formed draft; says nothing of the signature. */
export function draftFromPayload(payload: string): Draft & { expiresAt: Date } {
  let wire: Wire;
  try { wire = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(fromBase64url(payload))); } catch { throw new DraftError('INVALID_DRAFT'); }
  if (!wire || typeof wire !== 'object' || wire.v !== 1 || !Number.isInteger(wire.e)) throw new DraftError('INVALID_DRAFT');
  const draft = readDraftInput({ name: wire.n, template: wire.t, kind: wire.k, hours: wire.h, goals: wire.g });
  return { ...draft, expiresAt: new Date(wire.e * 1000) };
}

/**
 * The draft inside a link the owner sent, unverified: for /gov's form, which only fills its own fields from it (the
 * shop is created from what the operator then submits, checked as always). Null when it is not a draft link.
 */
export function peekDraft(link: string): (Draft & { expiresAt: Date }) | null {
  const token = /\/thu\/([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/.exec(link.trim())?.[1] ?? link.trim();
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try { return draftFromPayload(parts[1]); } catch { return null; }
}

// Base64url without Buffer, so the same code runs in the browser (/gov's form) and on the server.
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
export function base64url(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += ALPHABET[n >> 18 & 63] + ALPHABET[n >> 12 & 63] + (i + 1 < bytes.length ? ALPHABET[n >> 6 & 63] : '') + (i + 2 < bytes.length ? ALPHABET[n & 63] : '');
  }
  return out;
}
export function fromBase64url(text: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) throw new DraftError('INVALID_DRAFT');
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i += 4) {
    const chunk = text.slice(i, i + 4), n = [...chunk].reduce((sum, c, k) => sum | ALPHABET.indexOf(c) << (18 - 6 * k), 0);
    bytes.push(n >> 16 & 255); if (chunk.length > 2) bytes.push(n >> 8 & 255); if (chunk.length > 3) bytes.push(n & 255);
  }
  // Only one spelling of each payload: stray low bits would give a second link for the same draft.
  if (base64url(Uint8Array.from(bytes)) !== text) throw new DraftError('INVALID_DRAFT');
  return Uint8Array.from(bytes);
}
