#!/usr/bin/env node
/**
 * Sinh danh sách template từ các thư mục `templates/<khoá>/template.json` (đợt ②, 05/10: template canvas). Không nơi nào
 * khác trong mã liệt kê template.
 *
 *   node scripts/templates.mjs          ghi lib/canvas/templates.generated.ts
 *   node scripts/templates.mjs --check  chỉ so; thoát 1 nếu tệp đó cũ hơn các thư mục (test hợp đồng gọi lệnh này)
 *
 * Ở đây chỉ kiểm những gì cần để sinh được (thư mục, JSON đọc được, khoá và số không trùng). Kiểm đầy đủ từng tài liệu
 * (lib/canvas/validate.ts) và luật Google (lib/publishing/policy.ts) chạy trong tests/contracts/templates.spec.ts.
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dir = join(root, 'templates');
const fail = message => { console.error(`templates: ${message}`); process.exit(1); };

const templates = readdirSync(dir, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => {
  const file = join(dir, entry.name, 'template.json');
  if (!existsSync(file)) fail(`${entry.name}/ thiếu template.json`);
  let template; try { template = JSON.parse(readFileSync(file, 'utf8')); } catch (error) { fail(`${entry.name}/template.json không đọc được: ${error.message}`); }
  if (template.key !== entry.name) fail(`${entry.name}/template.json: "key" phải là "${entry.name}"`);
  return template;
}).sort((a, b) => a.number - b.number);
for (const [i, template] of templates.entries())
  if (templates.findIndex(other => other.number === template.number) !== i) fail(`hai template cùng "number" ${template.number}`);

const text = `// Sinh bởi \`node scripts/templates.mjs\` từ templates/*/template.json — đừng sửa tay.
import type { CanvasTemplate } from './templates';

export const CANVAS_TEMPLATES: readonly CanvasTemplate[] = ${JSON.stringify(templates, null, 1)};
`;
const output = join(root, 'lib/canvas/templates.generated.ts');
if (process.argv.includes('--check')) {
  if (!existsSync(output) || readFileSync(output, 'utf8') !== text) fail('lib/canvas/templates.generated.ts cũ hơn các thư mục, chạy `node scripts/templates.mjs`');
} else writeFileSync(output, text);
