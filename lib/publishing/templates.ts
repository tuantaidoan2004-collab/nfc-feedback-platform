import { PublishingError, type PageConfig } from './config';
import { startingPage, type TemplateEffects, type TemplateManifest } from './template-manifest';
import { TEMPLATE_KEYS, TEMPLATE_MANIFESTS } from './templates.generated';
import type { TemplateRelease } from './versions';

/**
 * Template nền tảng đang phát hành (lát M1): mọi thứ ở đây đọc từ gói `templates/<khoá>/manifest.json`, qua
 * `templates.generated.ts`. Sáu template Tài chọn 23/09 (`docs/thiet-ke-va-template.md` mục 12). Template là khung trắng: nó giữ
 * bố cục, nền và hiệu ứng, không bao giờ giữ nội dung của một tài khoản; nội dung đến từ tài khoản lúc vẽ trang
 * (`page_profile`, migration 022/024/027). `standard` là template 1 và giữ khoá cũ vì hàng `template_versions` của nó
 * đã có và bất biến. Không khoá nào mang tên thương hiệu (DESIGN.md mục 8).
 */
export { TEMPLATE_KEYS };
export type TemplateKey = typeof TEMPLATE_KEYS[number];
export const isTemplateKey = (value: unknown): value is TemplateKey =>
  typeof value === 'string' && (TEMPLATE_KEYS as readonly string[]).includes(value);

const byKey = new Map<string, TemplateManifest>(TEMPLATE_MANIFESTS.map(manifest => [manifest.key, manifest]));
function table<T>(pick: (manifest: TemplateManifest) => T) {
  return Object.fromEntries(TEMPLATE_MANIFESTS.map(manifest => [manifest.key, pick(manifest)])) as Record<TemplateKey, T>;
}

/** How a template is named to an owner: "<số> · <tên>". */
export const TEMPLATE_NAMES = table(manifest => `${manifest.number} · ${manifest.name}`);
/** Price per page per month, in đồng (pricing.ts). */
export const TEMPLATE_PRICES = table(manifest => manifest.pricePerMonth);
/** Every version of each template, oldest first (versions.ts). */
export const TEMPLATE_RELEASES = table<readonly TemplateRelease[]>(manifest => manifest.versions);
export const latestVersion = (key: TemplateKey) => TEMPLATE_RELEASES[key][TEMPLATE_RELEASES[key].length - 1].version;

/** A fresh copy of the page a new page of this template starts from. */
export function templateConfig(key: TemplateKey = 'standard'): PageConfig {
  const manifest = byKey.get(key); if (!manifest) throw new PublishingError('INVALID_TEMPLATE'); return startingPage(manifest);
}

/**
 * The platform effects a template declares; none for a key the platform does not ship. What each one means, and the
 * rules it keeps (the Google button's words, its place in the first screen), is in template-manifest.ts.
 */
export const effectsOf = (key: string | undefined): TemplateEffects => (key && byKey.get(key)?.effects) || {};

/**
 * How each template appears as a card in the Library (kịch bản mục 8). Temporary: the templates themselves are being
 * rebuilt from Tài's PNG/PDF (05/10), and the Library will then read the new packages.
 */
export const templateCards = () => TEMPLATE_MANIFESTS.map(manifest => {
  const background = manifest.page.background as { kind: string; colors?: string[]; color?: string; angle?: number };
  const colors = background.colors ?? (background.color ? [background.color, background.color] : ['#f3f4f6', '#e5e7eb']);
  return { key: manifest.key, name: manifest.name, number: manifest.number, colors, angle: background.angle ?? 160, glass: !!manifest.effects?.glass };
});
export type TemplateCard = ReturnType<typeof templateCards>[number];
