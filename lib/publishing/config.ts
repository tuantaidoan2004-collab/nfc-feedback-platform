export type Localized = { vi: string; en: string };
export type MediaRef = { kind: 'image' | 'video'; url: string };
export type LinkIcon = 'zalo' | 'instagram' | 'booking' | 'link' | 'facebook' | 'phone' | 'tiktok';
/** The floating private-feedback button. Only built-in icons until per-shop uploads exist. */
export type FeedbackButton = { icon: 'plane' | 'chat' | 'mail'; color: string; outline: string };
/**
 * schemaVersion 2 (lát B2–B3) adds the card layout, the Facebook, phone and TikTok buttons and the required
 * feedbackButton. Version 1 releases stay valid and render with the default feedback button; they cannot use the
 * additions. The phone button is the only one that takes a tel: link.
 */
export type PageConfig = {
  schemaVersion: 1 | 2; layout: 'full-bleed' | 'card'; name: string;
  poster: MediaRef | null; logo: { kind: 'image'; url: string } | null;
  background: { kind: 'solid'; color: string } | { kind: 'gradient'; colors: [string, string]; angle: number } | { kind: 'media'; media: MediaRef; loop: boolean };
  watermark: { text: 'YOUR LOGO'; enabled: boolean; motion: 'diagonal-linear' };
  text: { question: Localized }; googleUrl: string;
  links: { label: Localized; url: string; icon: LinkIcon }[];
  feedbackButton?: FeedbackButton;
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
/**
 * Media shipped inside the app, addressed by a fixed path rather than an https URL. Only these exact paths are
 * accepted, so a configuration can never point the page at an arbitrary path on the site. Uploaded media stays
 * https-only until per-shop storage exists.
 */
export const STEM_BACKGROUND = { video: '/media/stem-background.mp4', still: '/media/stem-background.jpg' } as const;
const BUILT_IN_MEDIA: Record<string, 'image' | 'video'> = { [STEM_BACKGROUND.video]: 'video', [STEM_BACKGROUND.still]: 'image' };
function media(value: unknown, logo = false) {
  keys(value, ['kind', 'url']); if (!(logo ? value.kind === 'image' : ['image', 'video'].includes(String(value.kind)))) fail();
  if (typeof value.url === 'string' && Object.hasOwn(BUILT_IN_MEDIA, value.url)) { if (BUILT_IN_MEDIA[value.url] !== value.kind) fail(); return; }
  url(value.url);
}
const color = (v: unknown) => { if (typeof v !== 'string' || !/^#[a-fA-F0-9]{6}$/.test(v)) fail(); };
export function validateConfig(value: unknown): PageConfig {
  const v2 = !!value && typeof value === 'object' && (value as Record<string, unknown>).schemaVersion === 2;
  keys(value, ['schemaVersion', 'layout', 'name', 'poster', 'logo', 'background', 'watermark', 'text', 'googleUrl', 'links', ...(v2 ? ['feedbackButton'] : [])]);
  if (!(v2 || value.schemaVersion === 1) || !(value.layout === 'full-bleed' || (v2 && value.layout === 'card'))) fail();
  text(value.name, 100);
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
  const icons = v2 ? ['zalo', 'instagram', 'booking', 'link', 'facebook', 'phone', 'tiktok'] : ['zalo', 'instagram', 'booking', 'link'];
  value.links.forEach(link => {
    keys(link, ['label', 'url', 'icon']); localized(link.label); if (!icons.includes(String(link.icon))) fail();
    if (link.icon === 'phone') { if (typeof link.url !== 'string' || !/^tel:\+?[0-9]{3,15}$/.test(link.url)) fail(); }
    else url(link.url);
  });
  if (v2) {
    const button = value.feedbackButton; keys(button, ['icon', 'color', 'outline']);
    if (!['plane', 'chat', 'mail'].includes(String(button.icon))) fail(); color(button.color); color(button.outline);
  }
  return structuredClone(value) as PageConfig;
}
export const DEFAULT_FEEDBACK_BUTTON: FeedbackButton = { icon: 'plane', color: '#229ED9', outline: '#FFFFFF' };
/** Buttons every new page starts with (Tài's accounts, 2026-09-18); shops replace them in the editor. */
const DEFAULT_LINKS: PageConfig['links'] = [
  { label: { vi: 'Instagram', en: 'Instagram' }, url: 'https://www.instagram.com/quitesensational/', icon: 'instagram' },
  { label: { vi: 'Zalo', en: 'Zalo' }, url: 'https://zalo.me/0961036265', icon: 'zalo' },
  { label: { vi: 'TikTok', en: 'TikTok' }, url: 'https://www.tiktok.com/@taidoan450', icon: 'tiktok' },
];
export const TEMPLATE_V1 = { schemaVersion: 1, rendererVersion: '1', capabilities: ['branding', 'background', 'links', 'google-invariant', 'vi-en'] } as const;
export function defaultConfig(name = 'YOUR BRAND'): PageConfig {
  return { schemaVersion: 2, layout: 'full-bleed', name, poster: null, logo: null,
    background: { kind: 'gradient', colors: ['#214034', '#EFF2E8'], angle: 135 },
    watermark: { text: 'YOUR LOGO', enabled: true, motion: 'diagonal-linear' },
    text: { question: { vi: 'Trải nghiệm hôm nay của bạn thế nào?', en: 'How was your experience today?' } },
    googleUrl: 'https://maps.google.com/', links: structuredClone(DEFAULT_LINKS), feedbackButton: { ...DEFAULT_FEEDBACK_BUTTON } };
}
/** What the template shop starts as: the default page with the moving background Tài chose on 2026-09-17. */
export function templateConfig(): PageConfig {
  return { ...defaultConfig('YOUR SHOP'), background: { kind: 'media', media: { kind: 'video', url: STEM_BACKGROUND.video }, loop: true } };
}
