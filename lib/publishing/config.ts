export type Localized = { vi: string; en: string };
export type MediaRef = { kind: 'image' | 'video'; url: string };
export type PageConfig = {
  schemaVersion: 1; layout: 'full-bleed'; name: string;
  poster: MediaRef | null; logo: { kind: 'image'; url: string } | null;
  background: { kind: 'solid'; color: string } | { kind: 'gradient'; colors: [string, string]; angle: number } | { kind: 'media'; media: MediaRef; loop: boolean };
  watermark: { text: 'YOUR LOGO'; enabled: boolean; motion: 'diagonal-linear' };
  text: { question: Localized }; googleUrl: string;
  links: { label: Localized; url: string; icon: 'zalo' | 'instagram' | 'booking' | 'link' }[];
};
export class PublishingError extends Error { constructor(public readonly code: string) { super(code); } }
function fail(): never { throw new PublishingError('INVALID_CONFIG'); }
function keys(value: unknown, allowed: string[]): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join() !== [...allowed].sort().join()) fail();
}
function text(value: unknown, max: number): asserts value is string {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f<>]/.test(value)) fail();
}
function url(value: unknown) {
  text(value, 2048); let parsed: URL; try { parsed = new URL(value); } catch { return fail(); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) fail();
}
function localized(value: unknown) { keys(value, ['vi', 'en']); text(value.vi, 180); text(value.en, 180); }
function media(value: unknown, logo = false) {
  keys(value, ['kind', 'url']); if (!(logo ? value.kind === 'image' : ['image', 'video'].includes(String(value.kind)))) fail(); url(value.url);
}
const color = (v: unknown) => { if (typeof v !== 'string' || !/^#[a-fA-F0-9]{6}$/.test(v)) fail(); };
export function validateConfig(value: unknown): PageConfig {
  keys(value, ['schemaVersion', 'layout', 'name', 'poster', 'logo', 'background', 'watermark', 'text', 'googleUrl', 'links']);
  if (value.schemaVersion !== 1 || value.layout !== 'full-bleed') fail(); text(value.name, 100);
  if (value.poster !== null) media(value.poster); if (value.logo !== null) media(value.logo, true);
  const raw = value.background; if (!raw || typeof raw !== 'object' || !('kind' in raw)) fail();
  const b = raw as Record<string, unknown>;
  if (b.kind === 'solid') { keys(b, ['kind', 'color']); color(b.color); }
  else if (b.kind === 'gradient') { keys(b, ['kind', 'colors', 'angle']); if (!Array.isArray(b.colors) || b.colors.length !== 2) fail(); b.colors.forEach(color); if (!Number.isInteger(b.angle) || Number(b.angle) < 0 || Number(b.angle) > 359) fail(); }
  else if (b.kind === 'media') { keys(b, ['kind', 'media', 'loop']); media(b.media); if (typeof b.loop !== 'boolean') fail(); }
  else fail();
  keys(value.watermark, ['text', 'enabled', 'motion']);
  if (value.watermark.text !== 'YOUR LOGO' || typeof value.watermark.enabled !== 'boolean' || value.watermark.motion !== 'diagonal-linear') fail();
  keys(value.text, ['question']); localized(value.text.question); url(value.googleUrl);
  if (!Array.isArray(value.links) || value.links.length > 6) fail();
  value.links.forEach(link => { keys(link, ['label', 'url', 'icon']); localized(link.label); url(link.url); if (!['zalo', 'instagram', 'booking', 'link'].includes(String(link.icon))) fail(); });
  return structuredClone(value) as PageConfig;
}
export const TEMPLATE_V1 = { schemaVersion: 1, rendererVersion: '1', capabilities: ['branding', 'background', 'links', 'google-invariant', 'vi-en'] } as const;
export function defaultConfig(name = 'YOUR BRAND'): PageConfig {
  return { schemaVersion: 1, layout: 'full-bleed', name, poster: null, logo: null,
    background: { kind: 'gradient', colors: ['#214034', '#EFF2E8'], angle: 135 },
    watermark: { text: 'YOUR LOGO', enabled: true, motion: 'diagonal-linear' },
    text: { question: { vi: 'Trải nghiệm hôm nay của bạn thế nào?', en: 'How was your experience today?' } },
    googleUrl: 'https://maps.google.com/', links: [] };
}
