#!/usr/bin/env node
/**
 * Sinh registry template từ các gói `templates/<khoá>/` (lát M1, 27/09). Không nơi nào khác trong mã liệt kê template.
 *
 *   node scripts/templates.mjs          ghi lib/publishing/templates.generated.ts và components/guest-styles.ts
 *   node scripts/templates.mjs --check  chỉ so; thoát 1 nếu hai tệp đó cũ hơn các gói (test hợp đồng gọi lệnh này)
 *
 * Ở đây chỉ kiểm những gì cần để sinh được (thư mục, JSON đọc được, khoá và số không trùng). Kiểm đầy đủ từng manifest
 * là `manifestProblems` trong lib/publishing/template-manifest.ts, chạy trong tests/contracts/templates.spec.ts.
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dir = join(root, 'templates');
const fail = message => { console.error(`templates: ${message}`); process.exit(1); };

const packages = readdirSync(dir, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => {
  const file = join(dir, entry.name, 'manifest.json');
  if (!existsSync(file)) fail(`${entry.name}/ thiếu manifest.json`);
  let manifest; try { manifest = JSON.parse(readFileSync(file, 'utf8')); } catch (error) { fail(`${entry.name}/manifest.json không đọc được: ${error.message}`); }
  if (manifest.key !== entry.name) fail(`${entry.name}/manifest.json: "key" phải là "${entry.name}"`);
  if (!Array.isArray(manifest.versions) || !manifest.versions.length) fail(`${entry.name}: cần ít nhất một bản`);
  return manifest;
}).sort((a, b) => a.number - b.number);
for (const [i, manifest] of packages.entries())
  if (packages.findIndex(other => other.number === manifest.number) !== i) fail(`hai template cùng "number" ${manifest.number}`);

const banner = '// Sinh bởi `node scripts/templates.mjs` từ templates/*/ — đừng sửa tay (lát M1).\n';
const registry = `${banner}import type { TemplateManifest } from './template-manifest';

export const TEMPLATE_KEYS = [${packages.map(p => `'${p.key}'`).join(', ')}] as const;
export const TEMPLATE_MANIFESTS: readonly TemplateManifest[] = ${JSON.stringify(packages, null, 2)};
`;
const styles = `${banner}// Mọi tệp CSS trang khách mặc, theo thứ tự: trang, lớp da chung, rồi từng bản template đóng băng (sau skin.css để token
// của bản template đè mặc định). Mọi selector gói trong \`.guest\` (tests/contracts/skin.spec.ts), nên dashboard nạp chúng
// (pages-panel.tsx khung trang khách) cũng không bị đổi kiểu. Dưới \`next dev\`, route mang CSS toàn cục mới tải lại mọi
// trang đang mở -- kể cả dashboard -- lần đầu nó được khung.
import './guest-page.css';
import './skin.css';
${packages.flatMap(p => p.versions.map(v => `import '../templates/${p.key}/v${v.version}.css';`)).join('\n')}
`;

const outputs = [[join(root, 'lib/publishing/templates.generated.ts'), registry], [join(root, 'components/guest-styles.ts'), styles]];
if (process.argv.includes('--check')) {
  const stale = outputs.filter(([file, text]) => !existsSync(file) || readFileSync(file, 'utf8') !== text).map(([file]) => file.slice(root.length));
  if (stale.length) fail(`cũ hơn các gói, chạy \`node scripts/templates.mjs\`: ${stale.join(', ')}`);
} else for (const [file, text] of outputs) writeFileSync(file, text);
