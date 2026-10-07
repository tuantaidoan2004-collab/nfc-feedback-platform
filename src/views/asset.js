// Link tới file tĩnh kèm mã phiên bản (?v=...): trình duyệt được giữ file 1 giờ, đổi nội dung thì mã đổi → tải bản mới ngay.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';

const DIR = new URL('../public/', import.meta.url);
const V = createHash('sha256')
  .update(readdirSync(DIR).sort().map((f) => readFileSync(new URL(f, DIR))).join('\n'))
  .digest('hex').slice(0, 10);

export const asset = (name) => `/static/${name}?v=${V}`;
