/**
 * A QR code, drawn by the platform itself (lát D4): the owner scans it to open the page they are building on their own
 * phone. No package and no service -- a link is sent nowhere to be drawn. Byte mode, error correction level M, the
 * smallest version that fits, the mask with the lowest penalty: the procedure of ISO/IEC 18004, in the shape of Project
 * Nayuki's reference encoder (MIT). tests/contracts/start-draft.spec.ts pins the output to matrices Chrome's QR reader read.
 */
export type QrMatrix = readonly (readonly boolean[])[];

// Level M, versions 1–40 (index 0 unused): error-correction codewords per block, and the number of blocks.
const ECC_PER_BLOCK = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28];
const BLOCKS = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49];
const LEVEL_M_FORMAT = 0;

function rawDataModules(version: number) {
  let result = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const align = Math.floor(version / 7) + 2;
    result -= (25 * align - 10) * align - 55;
    if (version >= 7) result -= 36;
  }
  return result;
}
const dataCodewords = (version: number) => Math.floor(rawDataModules(version) / 8) - ECC_PER_BLOCK[version] * BLOCKS[version];

function multiply(x: number, y: number) {
  let z = 0;
  for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11d); z ^= ((y >>> i) & 1) * x; }
  return z;
}
function divisor(degree: number) {
  const result = new Array<number>(degree).fill(0); result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) { result[j] = multiply(result[j], root); if (j + 1 < result.length) result[j] ^= result[j + 1]; }
    root = multiply(root, 0x02);
  }
  return result;
}
function remainder(data: readonly number[], by: readonly number[]) {
  const result = by.map(() => 0);
  for (const byte of data) {
    const factor = byte ^ (result.shift() as number); result.push(0);
    by.forEach((coefficient, i) => { result[i] ^= multiply(coefficient, factor); });
  }
  return result;
}

/** Splits the data into blocks, adds each block's error correction, and interleaves them (ISO/IEC 18004, 7.6). */
function withErrorCorrection(data: readonly number[], version: number) {
  const blocks = BLOCKS[version], eccLength = ECC_PER_BLOCK[version], raw = Math.floor(rawDataModules(version) / 8);
  const short = blocks - raw % blocks, shortLength = Math.floor(raw / blocks), by = divisor(eccLength);
  const all: number[][] = [];
  for (let i = 0, k = 0; i < blocks; i++) {
    const block = data.slice(k, k + shortLength - eccLength + (i < short ? 0 : 1)); k += block.length;
    const ecc = remainder(block, by);
    if (i < short) block.push(0);
    all.push([...block, ...ecc]);
  }
  const result: number[] = [];
  for (let i = 0; i < all[0].length; i++) all.forEach((block, j) => { if (i !== shortLength - eccLength || j >= short) result.push(block[i]); });
  return result;
}

function alignmentPositions(version: number) {
  if (version === 1) return [];
  const count = Math.floor(version / 7) + 2, size = version * 4 + 17;
  const step = version === 32 ? 26 : Math.ceil((version * 4 + 4) / (count * 2 - 2)) * 2;
  const result = [6];
  for (let position = size - 7; result.length < count; position -= step) result.splice(1, 0, position);
  return result;
}

const MASKS: ((x: number, y: number) => boolean)[] = [
  (x, y) => (x + y) % 2 === 0, (_, y) => y % 2 === 0, x => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => x * y % 2 + x * y % 3 === 0,
  (x, y) => (x * y % 2 + x * y % 3) % 2 === 0, (x, y) => ((x + y) % 2 + x * y % 3) % 2 === 0,
];

class Grid {
  readonly size: number;
  readonly dark: boolean[][];
  readonly fixed: boolean[][];
  readonly version: number;
  constructor(version: number) {
    this.version = version;
    this.size = version * 4 + 17;
    this.dark = Array.from({ length: this.size }, () => new Array<boolean>(this.size).fill(false));
    this.fixed = Array.from({ length: this.size }, () => new Array<boolean>(this.size).fill(false));
  }
  set(x: number, y: number, dark: boolean) { this.dark[y][x] = dark; this.fixed[y][x] = true; }

  drawFunctionPatterns() {
    const { size } = this;
    for (let i = 0; i < size; i++) { this.set(6, i, i % 2 === 0); this.set(i, 6, i % 2 === 0); }
    for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]])
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx, y = cy + dy, distance = Math.max(Math.abs(dx), Math.abs(dy));
        if (x >= 0 && x < size && y >= 0 && y < size) this.set(x, y, distance !== 2 && distance !== 4);
      }
    const positions = alignmentPositions(this.version), last = positions.length - 1;
    positions.forEach((cx, i) => positions.forEach((cy, j) => {
      if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) this.set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }));
    this.drawFormat(0);
    if (this.version >= 7) {
      let rest = this.version;
      for (let i = 0; i < 12; i++) rest = (rest << 1) ^ ((rest >>> 11) * 0x1f25);
      const bits = this.version << 12 | rest;
      for (let i = 0; i < 18; i++) {
        const bit = ((bits >>> i) & 1) !== 0, a = size - 11 + i % 3, b = Math.floor(i / 3);
        this.set(a, b, bit); this.set(b, a, bit);
      }
    }
  }

  drawFormat(mask: number) {
    const data = LEVEL_M_FORMAT << 3 | mask;
    let rest = data;
    for (let i = 0; i < 10; i++) rest = (rest << 1) ^ ((rest >>> 9) * 0x537);
    const bits = (data << 10 | rest) ^ 0x5412, bit = (i: number) => ((bits >>> i) & 1) !== 0, { size } = this;
    for (let i = 0; i <= 5; i++) this.set(8, i, bit(i));
    this.set(8, 7, bit(6)); this.set(8, 8, bit(7)); this.set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) this.set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) this.set(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) this.set(8, size - 15 + i, bit(i));
    this.set(8, size - 8, true);
  }

  drawCodewords(codewords: readonly number[]) {
    const { size } = this;
    let i = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vertical = 0; vertical < size; vertical++) for (let j = 0; j < 2; j++) {
        const x = right - j, upward = ((right + 1) & 2) === 0, y = upward ? size - 1 - vertical : vertical;
        if (!this.fixed[y][x] && i < codewords.length * 8) { this.dark[y][x] = ((codewords[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0; i++; }
      }
    }
  }

  applyMask(mask: number) {
    for (let y = 0; y < this.size; y++) for (let x = 0; x < this.size; x++) if (!this.fixed[y][x] && MASKS[mask](x, y)) this.dark[y][x] = !this.dark[y][x];
  }

  /** The standard's four penalties: runs, 2×2 blocks, finder-like patterns, and the balance of dark and light. */
  penalty() {
    const { size, dark } = this;
    let score = 0;
    const line = (read: (i: number) => boolean) => {
      let run = 1;
      for (let i = 1; i <= size; i++) {
        if (i < size && read(i) === read(i - 1)) run++;
        else { if (run >= 5) score += run - 2; run = 1; }
      }
      const cells = Array.from({ length: size }, (_, i) => read(i));
      const finder = [true, false, true, true, true, false, true];
      for (let i = 0; i + 7 <= size; i++) {
        if (!finder.every((value, k) => cells[i + k] === value)) continue;
        const lightBefore = i >= 4 && [1, 2, 3, 4].every(k => !cells[i - k]);
        const lightAfter = i + 11 <= size && [7, 8, 9, 10].every(k => !cells[i + k]);
        if (lightBefore || lightAfter) score += 40;
      }
    };
    for (let y = 0; y < size; y++) line(x => dark[y][x]);
    for (let x = 0; x < size; x++) line(y => dark[y][x]);
    for (let y = 0; y + 1 < size; y++) for (let x = 0; x + 1 < size; x++) {
      const c = dark[y][x];
      if (c === dark[y][x + 1] && c === dark[y + 1][x] && c === dark[y + 1][x + 1]) score += 3;
    }
    const total = size * size, darkCount = dark.reduce((sum, row) => sum + row.filter(Boolean).length, 0);
    score += (Math.ceil(Math.abs(darkCount * 20 - total * 10) / total) - 1) * 10;
    return score;
  }
}

/** The modules of a QR code for this text, dark is true. Throws when the text is too long for any version. */
export function qrMatrix(text: string): QrMatrix {
  const bytes = [...new TextEncoder().encode(text)];
  let version = 1;
  for (; version <= 40; version++) {
    const countBits = version <= 9 ? 8 : 16;
    if (4 + countBits + bytes.length * 8 <= dataCodewords(version) * 8) break;
  }
  if (version > 40) throw new Error('QR_TOO_LONG');
  const bits: number[] = [];
  const push = (value: number, length: number) => { for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1); };
  push(0b0100, 4); push(bytes.length, version <= 9 ? 8 : 16); bytes.forEach(byte => push(byte, 8));
  const capacity = dataCodewords(version) * 8;
  push(0, Math.min(4, capacity - bits.length)); push(0, (8 - bits.length % 8) % 8);
  for (let pad = 0xec; bits.length < capacity; pad ^= 0xec ^ 0x11) push(pad, 8);
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((byte, bit) => byte << 1 | bit, 0));

  const grid = new Grid(version);
  grid.drawFunctionPatterns();
  grid.drawCodewords(withErrorCorrection(data, version));
  let best = 0, lowest = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    grid.applyMask(mask); grid.drawFormat(mask);
    const score = grid.penalty();
    if (score < lowest) { best = mask; lowest = score; }
    grid.applyMask(mask);
  }
  grid.applyMask(best); grid.drawFormat(best);
  return grid.dark;
}

/** The code as an SVG: one path of dark squares on a white ground with the four-module quiet zone the standard asks. */
export function qrSvg(text: string, label: string) {
  const matrix = qrMatrix(text), size = matrix.length + 8;
  let path = '';
  matrix.forEach((row, y) => row.forEach((dark, x) => { if (dark) path += `M${x + 4} ${y + 4}h1v1h-1z`; }));
  const escaped = label.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" role="img" aria-label="${escaped}"><rect width="${size}" height="${size}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
}
