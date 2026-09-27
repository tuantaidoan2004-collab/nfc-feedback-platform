export type Localized = { vi: string; en: string };
/** A video may carry `still`: its first frame as an image, shown when the phone will not play video (lát F5). */
export type MediaRef = { kind: 'image' | 'video'; url: string; still?: string };
export type LinkIcon = 'zalo' | 'instagram' | 'booking' | 'link' | 'facebook' | 'phone' | 'tiktok';
/** The floating private-feedback button. Only built-in icons until per-shop uploads exist. */
export type FeedbackButton = { icon: 'plane' | 'chat' | 'mail'; color: string; outline: string };
/**
 * Sections (lát M3, 27/09): the page as blocks the owner arranges -- which blocks show, in what order. A section holds
 * the arrangement; the block's content stays where the page's content lives (`poster`, `links`, and the page profile of
 * migration 022/024), so switching template, the media review and the Google rules see content exactly as before.
 * The Google invitation, the private-feedback button and the legal footer are the page's fixed core, not sections.
 *
 * Zones keep the Google button in the first screen (floor 1): only the poster may stand above the invitation, and only
 * first; every other block stands below it. A later block (events, video, M4) is a new kind here, in the lower zone.
 */
export const SECTION_KINDS = ['poster', 'links'] as const;
export type SectionKind = typeof SECTION_KINDS[number];
export type Section = { kind: SectionKind; hidden?: boolean };
/** Every page before sections had exactly these, in this order. */
export const DEFAULT_SECTIONS: readonly Section[] = [{ kind: 'poster' }, { kind: 'links' }];
/**
 * schemaVersion 2 (lát B2–B3) adds the card layout, the Facebook, phone and TikTok buttons and the required
 * feedbackButton. Version 1 releases stay valid and render with the default feedback button; they cannot use the
 * additions. The phone button is the only one that takes a tel: link. schemaVersion 3 (lát M3) adds `sections`;
 * everything else is as in 2. Releases of every version stay readable; a draft becomes 3 when it is next written.
 */
export type PageConfig = {
  schemaVersion: 1 | 2 | 3; layout: 'full-bleed' | 'card'; name: string;
  poster: MediaRef | null; logo: { kind: 'image'; url: string } | null;
  background: { kind: 'solid'; color: string } | { kind: 'gradient'; colors: [string, string]; angle: number } | { kind: 'media'; media: MediaRef; loop: boolean };
  watermark: { text: 'YOUR LOGO'; enabled: boolean; motion: 'diagonal-linear' };
  text: { question: Localized }; googleUrl: string;
  links: { label: Localized; url: string; icon: LinkIcon }[];
  feedbackButton?: FeedbackButton;
  /** A template version's own fields (lib/publishing/settings.ts, lát P2). Absent means every field at its default. */
  settings?: Record<string, string | number | boolean>;
  /** schemaVersion 3 only: the blocks and their order (lát M3). */
  sections?: Section[];
  /**
   * schemaVersion 3 only, optional (lát M2b): the shop's own thank-you line in the card that shows before Google opens.
   * Absent means the platform's line (lib/publishing/thanks.ts). A page with one publishes only once an administrator
   * has approved those exact words (migration 030).
   */
  thanks?: Localized;
};
/** How long the shop's thank-you line may be, in each language: it sits above the platform's line in a small card. */
export const THANKS_MAX = 120;
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
 * https-only until per-shop storage exists. The video path is kept only so pages published before 26/09 still read;
 * the file itself is gone (a page background is never a video now -- `withoutVideoBackground`).
 */
export const STEM_BACKGROUND = { video: '/media/stem-background.mp4', still: '/media/stem-background.jpg' } as const;
const BUILT_IN_MEDIA: Record<string, 'image' | 'video'> = { [STEM_BACKGROUND.video]: 'video', [STEM_BACKGROUND.still]: 'image' };
function media(value: unknown, logo = false) {
  const withStill = !logo && !!value && typeof value === 'object' && 'still' in value;
  keys(value, withStill ? ['kind', 'url', 'still'] : ['kind', 'url']); if (!(logo ? value.kind === 'image' : ['image', 'video'].includes(String(value.kind)))) fail();
  // Only a video has a still, and the still is an https image or the built-in one.
  if (withStill) { if (value.kind !== 'video') fail(); if (value.still !== STEM_BACKGROUND.still) url(value.still); }
  if (typeof value.url === 'string' && Object.hasOwn(BUILT_IN_MEDIA, value.url)) { if (BUILT_IN_MEDIA[value.url] !== value.kind) fail(); return; }
  url(value.url);
}
const color = (v: unknown) => { if (typeof v !== 'string' || !/^#[a-fA-F0-9]{6}$/.test(v)) fail(); };
export function validateConfig(value: unknown): PageConfig {
  const version = !!value && typeof value === 'object' ? (value as Record<string, unknown>).schemaVersion : undefined;
  // `v2` below reads "version 2 or later": 3 keeps every rule of 2 and adds the sections.
  const v2 = version === 2 || version === 3, v3 = version === 3;
  const settings = v2 && Object.hasOwn(value as object, 'settings');
  const thanks = v3 && Object.hasOwn(value as object, 'thanks');
  keys(value, ['schemaVersion', 'layout', 'name', 'poster', 'logo', 'background', 'watermark', 'text', 'googleUrl', 'links', ...(v2 ? ['feedbackButton'] : []),
    ...(v3 ? ['sections'] : []), ...(settings ? ['settings'] : []), ...(thanks ? ['thanks'] : [])]);
  if (thanks) { const line = value.thanks; keys(line, ['vi', 'en']); text(line.vi, THANKS_MAX); text(line.en, THANKS_MAX); }
  if (v3) {
    const list = value.sections;
    if (!Array.isArray(list) || list.length < 1 || list.length > SECTION_KINDS.length) fail();
    const seen = new Set<string>();
    list.forEach((item, index) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) fail();
      keys(item, Object.hasOwn(item, 'hidden') ? ['kind', 'hidden'] : ['kind']);
      if (!(SECTION_KINDS as readonly string[]).includes(String(item.kind)) || seen.has(String(item.kind))) fail();
      if ('hidden' in item && typeof item.hidden !== 'boolean') fail();
      // Only the poster may stand above the Google invitation, and only first (floor 1).
      if (item.kind === 'poster' && index !== 0) fail();
      seen.add(String(item.kind));
    });
  }
  // Only the shape here, so the guest page can put these on the page as they are: which keys a template version takes
  // and what each one accepts is checked where a page is written (settings.ts).
  if (settings) {
    const raw = value.settings;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).length > 16) fail();
    for (const [key, item] of Object.entries(raw)) {
      if (!/^[a-z][a-z0-9-]{0,31}$/.test(key)) fail();
      if (!(typeof item === 'boolean' || (typeof item === 'number' && Number.isFinite(item) && Math.abs(item) <= 10000)
        || (typeof item === 'string' && /^(#[0-9a-fA-F]{6}|[a-z0-9-]{1,32})$/.test(item)))) fail();
    }
  }
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
  return { schemaVersion: 3, layout: 'full-bleed', name, poster: null, logo: null,
    background: { kind: 'gradient', colors: ['#214034', '#EFF2E8'], angle: 135 },
    watermark: { text: 'YOUR LOGO', enabled: true, motion: 'diagonal-linear' },
    text: { question: { vi: 'Trải nghiệm hôm nay của bạn thế nào?', en: 'How was your experience today?' } },
    googleUrl: 'https://maps.google.com/', links: structuredClone(DEFAULT_LINKS), feedbackButton: { ...DEFAULT_FEEDBACK_BUTTON },
    sections: structuredClone([...DEFAULT_SECTIONS]) };
}
/** The blocks of any page, whatever version it was written in: pages before lát M3 had the poster and the links. */
export const sectionsOf = (config: PageConfig): readonly Section[] => config.sections ?? DEFAULT_SECTIONS;
/** Whether a block of this kind shows on the page. */
export const shows = (config: PageConfig, kind: SectionKind) => sectionsOf(config).some(section => section.kind === kind && !section.hidden);
/**
 * A page written in any earlier version, brought to the current one (3): the default feedback button for a version 1
 * page, the blocks every page had before sections. Nothing the page shows changes. Used where a draft is read to be
 * edited and where it is written.
 */
export function currentConfig(config: PageConfig): PageConfig {
  if (config.schemaVersion === 3) return config;
  return { ...config, schemaVersion: 3, feedbackButton: config.feedbackButton ?? { ...DEFAULT_FEEDBACK_BUTTON },
    sections: structuredClone([...DEFAULT_SECTIONS]) };
}
/**
 * A page background is never a video (Tài 26/09/2026): a clip cropped into a phone screen is heavy and loses its
 * quality, and video belongs in the poster, like an advert. Applied wherever a page is written -- created, copied,
 * saved, published -- so a page from before keeps working: its background becomes the video's own first frame, or
 * the default gradient when it has none. Never applied on read; the guest page simply shows the still.
 */
export function withoutVideoBackground(config: PageConfig): PageConfig {
  const b = config.background;
  if (b.kind !== 'media' || b.media.kind !== 'video') return config;
  const still = b.media.still ?? (b.media.url === STEM_BACKGROUND.video ? STEM_BACKGROUND.still : undefined);
  return { ...config, background: still ? { kind: 'media', media: { kind: 'image', url: still }, loop: b.loop } : defaultConfig().background };
}
