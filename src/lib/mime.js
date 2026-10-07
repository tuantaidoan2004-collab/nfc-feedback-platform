// Đọc thư gốc (RFC 822 / MIME) — tự viết, không thư viện ngoài. Cloudflare Email Worker đẩy nguyên thư gốc.
// Bên trong làm việc trên chuỗi "latin1" (1 ký tự = 1 byte) để giữ nguyên byte, chỉ giải mã chữ ở bước cuối.

const MAX_DEPTH = 8;
const MAX_PARTS = 200;

/** Byte (chuỗi latin1) → chữ theo bảng mã. Bảng mã lạ → UTF-8. */
function decodeBytes(bin, charset) {
  const buf = Buffer.from(bin, 'latin1');
  const cs = String(charset || 'utf-8').trim().toLowerCase();
  if (cs === 'us-ascii' || cs === 'ascii') return buf.toString('utf8');
  try { return new TextDecoder(cs).decode(buf); } catch { return buf.toString('utf8'); }
}

const b64bin = (s) => Buffer.from(String(s).replace(/[^A-Za-z0-9+/]/g, ''), 'base64').toString('latin1');
const hexbin = (s) => s.replace(/=([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(Number.parseInt(h, 16)));
const qpbin = (s) => hexbin(s.replace(/=\r?\n/g, ''));

function decodeTransfer(bin, cte) {
  const e = String(cte || '').trim().toLowerCase();
  if (e === 'base64') return b64bin(bin);
  if (e === 'quoted-printable') return qpbin(bin);
  return bin;
}

const EW = /=\?([^?\s]+)\?([BbQq])\?([^?\s]*)\?=/g;

/** Giải mã "encoded-word" (RFC 2047) trong tiêu đề: =?UTF-8?B?...?=. Các từ liền nhau được ghép byte trước khi giải mã. */
export function decodeWords(s) {
  const out = [];
  let last = 0;
  let pend = null;
  const flush = () => { if (pend) out.push(decodeBytes(pend.bin, pend.cs)); pend = null; };
  for (const m of s.matchAll(EW)) {
    const between = s.slice(last, m.index);
    if (!(pend && /^\s*$/.test(between))) { flush(); out.push(between); }
    const cs = m[1].split('*')[0].toLowerCase();
    const bin = m[2].toUpperCase() === 'B' ? b64bin(m[3]) : hexbin(m[3].replace(/_/g, ' '));
    if (pend && pend.cs === cs) pend.bin += bin;
    else { flush(); pend = { cs, bin }; }
    last = m.index + m[0].length;
  }
  flush();
  out.push(s.slice(last));
  return out.join('');
}

/** Khối tiêu đề → {tên-viết-thường: [giá trị, ...]} theo thứ tự xuất hiện (trên cùng trước). */
function parseHeaders(block) {
  const list = [];
  for (const line of block.split(/\r?\n/)) {
    if (/^[ \t]/.test(line)) {
      if (list.length) list[list.length - 1][1] += ` ${line.trim()}`;
      continue;
    }
    const i = line.indexOf(':');
    if (i > 0 && !/\s/.test(line.slice(0, i))) list.push([line.slice(0, i).toLowerCase(), line.slice(i + 1).trim()]);
  }
  const map = {};
  for (const [k, v] of list) (map[k] ||= []).push(decodeWords(decodeBytes(v, 'utf-8')));
  return map;
}

function splitSemis(s) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted && ch === '\\') { cur += ch + (s[++i] ?? ''); continue; }
    if (ch === '"') quoted = !quoted;
    if (ch === ';' && !quoted) { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out;
}

/** 'text/plain; charset="utf-8"' → {value:'text/plain', params:{charset:'utf-8'}} */
function parseParams(v) {
  const [value, ...rest] = splitSemis(String(v || ''));
  const params = {};
  for (const p of rest) {
    const i = p.indexOf('=');
    if (i < 0) continue;
    let val = p.slice(i + 1).trim();
    if (val.length >= 2 && val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1).replace(/\\(.)/g, '$1');
    params[p.slice(0, i).trim().toLowerCase()] = val;
  }
  return { value: value.trim().toLowerCase(), params };
}

function splitHeadBody(bin) {
  if (/^\r?\n/.test(bin)) return ['', bin.replace(/^\r?\n/, '')];
  const m = /\r?\n\r?\n/.exec(bin);
  return m ? [bin.slice(0, m.index), bin.slice(m.index + m[0].length)] : [bin, ''];
}

/** Tách các phần của 1 khối multipart theo ranh giới (ranh giới phải nằm ở đầu dòng). */
function splitMultipart(bin, boundary) {
  const delim = `--${boundary}`;
  const parts = [];
  let start = -1;
  let pos = 0;
  for (;;) {
    const i = bin.indexOf(delim, pos);
    if (i < 0) break;
    const after = i + delim.length;
    const next = bin[after];
    if ((i > 0 && bin[i - 1] !== '\n') || (next !== undefined && !'-\r\n \t'.includes(next))) { pos = after; continue; }
    if (start >= 0) {
      let end = i;
      if (bin[end - 1] === '\n') end--;
      if (bin[end - 1] === '\r') end--;
      parts.push(bin.slice(start, end));
      if (parts.length >= MAX_PARTS) return parts;
    }
    if (bin.startsWith('--', after)) return parts;
    const nl = bin.indexOf('\n', after);
    if (nl < 0) return parts;
    start = nl + 1;
    pos = start;
  }
  if (start >= 0) parts.push(bin.slice(start)); // thiếu ranh giới đóng
  return parts;
}

const first = (headers, k) => headers[k]?.[0] ?? null;

function walk(bin, headers, out, depth) {
  const ct = parseParams(first(headers, 'content-type') || 'text/plain');
  if (ct.value.startsWith('multipart/')) {
    if (depth >= MAX_DEPTH || !ct.params.boundary) return;
    for (const p of splitMultipart(bin, ct.params.boundary)) {
      if (++out.parts > MAX_PARTS) return;
      const [h, b] = splitHeadBody(p);
      walk(b, parseHeaders(h), out, depth + 1);
    }
    return;
  }
  // Tệp đính kèm và thư lồng (thư chuyển tiếp) bị bỏ qua: chỉ đọc nội dung chính của thư.
  if (parseParams(first(headers, 'content-disposition')).value === 'attachment') return;
  const key = ct.value === 'text/plain' ? 'text' : ct.value === 'text/html' ? 'html' : null;
  if (!key || out[key] != null) return;
  out[key] = decodeBytes(decodeTransfer(bin, first(headers, 'content-transfer-encoding')), ct.params.charset);
}

const toBinary = (input) => (Buffer.isBuffer(input) || input instanceof Uint8Array
  ? Buffer.from(input).toString('latin1')
  : Buffer.from(String(input ?? ''), 'utf8').toString('latin1'));

/**
 * Thư gốc (Buffer hoặc chuỗi) → {headers, from, subject, to:[To+Cc], text, html, messageId, date}.
 * headers: {tên-viết-thường: [giá trị...]} (trên cùng trước — tiêu đề do máy chủ nhận thêm vào nằm trên cùng).
 */
export function parseMime(input) {
  const [head, body] = splitHeadBody(toBinary(input));
  const headers = parseHeaders(head);
  const out = { text: null, html: null, parts: 0 };
  walk(body, headers, out, 0);
  return {
    headers,
    from: first(headers, 'from'),
    subject: first(headers, 'subject') ?? '',
    to: [...(headers.to || []), ...(headers.cc || [])],
    text: out.text,
    html: out.html,
    messageId: first(headers, 'message-id'),
    date: first(headers, 'date'),
  };
}

/** Trông giống 1 thư gốc (có dòng tiêu đề "Tên: giá trị" và dòng trống ngăn nội dung)? */
export function looksLikeMessage(v) {
  if (typeof v !== 'string' && !Buffer.isBuffer(v)) return false;
  const s = String(v).slice(0, 4000);
  return /^(From [^\r\n]*\r?\n)?[\w-]+:[^\r\n]*\r?\n/.test(s) && /\r?\n\r?\n/.test(s);
}

/** Khối tiêu đề dạng chữ ("Message-Id: ...\nDate: ...") → {tên-viết-thường: giá trị đầu tiên}. */
export function headerBlockToObject(block) {
  const map = parseHeaders(String(block || ''));
  return Object.fromEntries(Object.entries(map).map(([k, v]) => [k, v[0]]));
}
