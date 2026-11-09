// Nov 8 client: copy of the API's qr-encode.ts (no package) — draws the box QR code in the kiosk preview.
/**
 * Oct 30 client (name tags): a small, self-contained QR code encoder, so we don't add a package.
 * Byte mode, error correction level M, versions 1-6 (up to 106 bytes; a name-tag token is ~35).
 * Follows ISO/IEC 18004: Reed-Solomon over GF(256) (poly 0x11D), the 8 masks with the standard
 * penalty rules, BCH-coded format bits. Tested against a reference QR in test/qr-encode.test.mjs.
 *
 *   qrMatrix('ZLZ1:12:abc')  -> boolean[][] (true = dark), no quiet zone
 *   qrRows('ZLZ1:12:abc')    -> ['1111111010...', ...]  (compact, for the API reply)
 */

// [EC codewords per block, blocks, data codewords per block] for level M, versions 1-6.
const M_BLOCKS: Array<[number, number, number]> = [
  [10, 1, 16], [16, 1, 28], [26, 1, 44], [18, 2, 32], [24, 2, 43], [16, 4, 27],
];
const ALIGN: number[][] = [[], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34]];
export const QR_MAX_VERSION = 6;

// ---- GF(256) + Reed-Solomon ----
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]!;
})();
const gmul = (a: number, b: number) => (a === 0 || b === 0 ? 0 : EXP[LOG[a]! + LOG[b]!]!);

/** Generator polynomial coefficients (highest degree first, leading 1 dropped). */
function rsGenerator(degree: number): number[] {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j]!;
      next[j + 1] ^= gmul(poly[j]!, EXP[i]!);
    }
    poly = next;
  }
  return poly.slice(1);
}

/** The EC codewords for one block of data codewords. Exported for the test (known vector). */
export function rsEncode(data: number[], ecLen: number): number[] {
  const gen = rsGenerator(ecLen);
  const rem = new Array(ecLen).fill(0);
  for (const b of data) {
    const f = b ^ rem.shift()!;
    rem.push(0);
    for (let i = 0; i < ecLen; i++) rem[i] ^= gmul(gen[i]!, f);
  }
  return rem;
}

/** 15 format bits for level M + mask (BCH 0x537, XOR 0x5412). Exported for the test. */
export function formatBits(mask: number): number {
  const data = (0 << 3) | mask; // level M = 00
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}

// ---- data codewords ----
function dataCodewords(bytes: Uint8Array, version: number): number[] {
  const [, blocks, perBlock] = M_BLOCKS[version - 1]!;
  const capBits = blocks * perBlock * 8;
  const bits: number[] = [];
  const put = (v: number, n: number) => { for (let i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1); };
  put(0b0100, 4);               // byte mode
  put(bytes.length, 8);         // count (8 bits for versions 1-9)
  for (const b of bytes) put(b, 8);
  put(0, Math.min(4, capBits - bits.length)); // terminator
  while (bits.length % 8) bits.push(0);
  const out: number[] = [];
  for (let i = 0; i < bits.length; i += 8) out.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  for (let pad = 0xec; out.length < blocks * perBlock; pad ^= 0xec ^ 0x11) out.push(pad);
  return out;
}

function interleave(data: number[], version: number): number[] {
  const [ecLen, blocks, perBlock] = M_BLOCKS[version - 1]!;
  const dBlocks: number[][] = [];
  const eBlocks: number[][] = [];
  for (let b = 0; b < blocks; b++) {
    const d = data.slice(b * perBlock, (b + 1) * perBlock);
    dBlocks.push(d); eBlocks.push(rsEncode(d, ecLen));
  }
  const out: number[] = [];
  for (let i = 0; i < perBlock; i++) for (const d of dBlocks) out.push(d[i]!);
  for (let i = 0; i < ecLen; i++) for (const e of eBlocks) out.push(e[i]!);
  return out;
}

// ---- matrix ----
type Grid = { size: number; dark: boolean[][]; fn: boolean[][] };

function newGrid(version: number): Grid {
  const size = 17 + 4 * version;
  const g: Grid = { size, dark: [], fn: [] };
  for (let y = 0; y < size; y++) { g.dark.push(new Array(size).fill(false)); g.fn.push(new Array(size).fill(false)); }
  const set = (x: number, y: number, d: boolean) => { if (x >= 0 && y >= 0 && x < size && y < size) { g.dark[y]![x] = d; g.fn[y]![x] = true; } };
  // timing
  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  // finders + separators
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]] as const) {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const d = Math.max(Math.abs(dx), Math.abs(dy));
      set(cx + dx, cy + dy, d !== 2 && d !== 4);
    }
  }
  // alignment
  const pos = ALIGN[version - 1]!;
  const n = pos.length;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      set(pos[i]! + dx, pos[j]! + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  }
  // format areas reserved (drawn per mask) + the dark module
  drawFormat(g, 0);
  return g;
}

function drawFormat(g: Grid, mask: number): void {
  const bits = formatBits(mask);
  const size = g.size;
  const bit = (i: number) => ((bits >>> i) & 1) === 1;
  const set = (x: number, y: number, d: boolean) => { g.dark[y]![x] = d; g.fn[y]![x] = true; };
  for (let i = 0; i <= 5; i++) set(8, i, bit(i));
  set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
  for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
  for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
  for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
  set(8, size - 8, true);
}

function placeData(g: Grid, cw: number[]): void {
  const size = g.size;
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (g.fn[y]![x]) continue;
        g.dark[y]![x] = i < cw.length * 8 ? ((cw[i >>> 3]! >>> (7 - (i & 7))) & 1) === 1 : false;
        i++;
      }
    }
  }
}

function maskHit(mask: number, x: number, y: number): boolean {
  switch (mask) {
    case 0: return (x + y) % 2 === 0;
    case 1: return y % 2 === 0;
    case 2: return x % 3 === 0;
    case 3: return (x + y) % 3 === 0;
    case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
    case 5: return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6: return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    default: return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
  }
}

function applyMask(g: Grid, mask: number): void {
  for (let y = 0; y < g.size; y++) for (let x = 0; x < g.size; x++) {
    if (!g.fn[y]![x] && maskHit(mask, x, y)) g.dark[y]![x] = !g.dark[y]![x];
  }
}

/** Standard penalty score (rules 1-4). Lower is better. */
export function penalty(m: boolean[][]): number {
  const size = m.length;
  let score = 0;
  const line = (get: (i: number) => boolean) => {
    let s = 0, run = 1;
    for (let i = 1; i <= size; i++) {
      if (i < size && get(i) === get(i - 1)) run++;
      else { if (run >= 5) s += 3 + (run - 5); run = 1; }
    }
    // finder-like 1:1:3:1:1 with 4 light on either side
    for (let i = 0; i + 11 <= size; i++) {
      const p = [1, 0, 1, 1, 1, 0, 1];
      const isP = (o: number) => p.every((v, k) => get(o + k) === (v === 1));
      const light = (a: number, b: number) => { for (let k = a; k < b; k++) if (get(k)) return false; return true; };
      if (isP(i) && light(i + 7, i + 11)) s += 40;
      if (isP(i + 4) && light(i, i + 4)) s += 40;
    }
    return s;
  };
  for (let y = 0; y < size; y++) score += line((x) => m[y]![x]!);
  for (let x = 0; x < size; x++) score += line((y) => m[y]![x]!);
  for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) {
    const c = m[y]![x];
    if (c === m[y]![x + 1] && c === m[y + 1]![x] && c === m[y + 1]![x + 1]) score += 3;
  }
  let dark = 0;
  for (const row of m) for (const v of row) if (v) dark++;
  score += Math.floor(Math.abs((dark * 100) / (size * size) - 50) / 5) * 10;
  return score;
}

export function qrVersionFor(byteLength: number): number | null {
  for (let v = 1; v <= QR_MAX_VERSION; v++) {
    const [, blocks, perBlock] = M_BLOCKS[v - 1]!;
    if (4 + 8 + byteLength * 8 <= blocks * perBlock * 8) return v;
  }
  return null;
}

/** QR code for `text` (UTF-8, byte mode, level M). `opts.mask` forces a mask (tests); `opts.version` a minimum version. */
export function qrMatrix(text: string, opts: { mask?: number; version?: number } = {}): boolean[][] {
  const bytes = new TextEncoder().encode(text);
  let version = qrVersionFor(bytes.length);
  if (version == null) throw new Error('text too long for a QR code here');
  if (opts.version && opts.version > version) version = Math.min(QR_MAX_VERSION, opts.version);
  const cw = interleave(dataCodewords(bytes, version), version);
  const build = (mask: number) => {
    const g = newGrid(version!);
    placeData(g, cw);
    applyMask(g, mask);
    drawFormat(g, mask);
    return g.dark;
  };
  if (opts.mask != null) return build(opts.mask);
  let best: boolean[][] | null = null;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    const m = build(mask);
    const s = penalty(m);
    if (s < bestScore) { best = m; bestScore = s; }
  }
  return best!;
}

/** Rows of '1' (dark) / '0' (light): compact for the API reply; the page draws them as squares. */
export function qrRows(text: string): string[] {
  return qrMatrix(text).map((r) => r.map((d) => (d ? '1' : '0')).join(''));
}
