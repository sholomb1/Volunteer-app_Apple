/**
 * Client-side label rendering + printer transport for the kiosk.
 *
 * Two transports pick themselves:
 *   1. If running inside the Capacitor APK AND a printer host/port is
 *      configured → open a raw TCP socket via the native LabelPrint
 *      plugin. Silent, no dialogs. Printer must be reachable on the
 *      tablet's LAN.
 *   2. Otherwise (browser, or no host configured) → fall back to the
 *      existing HTML/window.print() path. User taps Print in the Android
 *      or desktop print dialog.
 *
 * Bitmap rendering mirrors what the PowerShell script produces so both
 * paths generate identical labels visually.
 */
import { Capacitor, registerPlugin } from '@capacitor/core';
import { DROPOFF } from '../dropoff';
import { kiosk, type KioskLabel } from './kiosk-api';

interface LabelPrintPlugin {
  printTspl(options: { host: string; port?: number; bytes: string }): Promise<{ sent: number }>;
}
const LabelPrint = registerPlugin<LabelPrintPlugin>('LabelPrint');

// Config stored on the kiosk device (Settings can populate this later).
const LS_HOST = 'zlz_label_printer_host';
const LS_PORT = 'zlz_label_printer_port';

// Build-time defaults so a fresh APK install prints without needing the
// `?printerHost=…&printerPort=…` bootstrap step. localStorage still wins so
// an admin can override per-tablet from the URL.
const DEFAULT_PRINTER_HOST = '192.168.1.2';
const DEFAULT_PRINTER_PORT = 9100;

export const labelPrinter = {
  getHost: () => localStorage.getItem(LS_HOST) || DEFAULT_PRINTER_HOST,
  getPort: () => Number(localStorage.getItem(LS_PORT) || DEFAULT_PRINTER_PORT),
  setHost: (h: string) => localStorage.setItem(LS_HOST, h),
  setPort: (p: number) => localStorage.setItem(LS_PORT, String(p)),
  clear: () => { localStorage.removeItem(LS_HOST); localStorage.removeItem(LS_PORT); },
};

/** Whether the direct-TCP native path is available on this device. */
export function canPrintDirect(): boolean {
  return Capacitor.getPlatform() === 'android' && !!labelPrinter.getHost();
}

/** Wrap a promise with a timeout so a hung TCP socket doesn't stick the UI. */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); },
           (e) => { clearTimeout(t); reject(e); });
  });
}

/**
 * Print an array of labels. Picks the transport automatically:
 *
 *   1. Relay path — POST TSPL to vp-api /print-tspl, which forwards via
 *      the Tailscale bridge to the printer on the LAN. Works from
 *      anywhere the internet reaches. This is the preferred path so
 *      kiosk labels print the same whether the tablet is at 3 Regina or
 *      on the road.
 *   2. Direct TCP — if the relay round-trip fails AND we're inside the
 *      Capacitor APK on the same LAN as the printer with a printer host
 *      configured, use the native LabelPrint plugin's raw socket.
 *   3. Browser fallback — window.print() via the existing print-only DOM.
 */
export async function printLabels(
  labels: KioskLabel[],
  opts?: { kioskSecret?: string },
): Promise<{ transport: 'relay' | 'tcp' | 'browser'; ok: boolean; error?: string }> {
  // Aug 24 client fix (kiosk speed): reorder transport preference. Direct
  // TCP is FIRST on Android when a printer host is configured, because the
  // tablet is on the LAN with the printer and a direct socket beats routing
  // through vp-api + Tailscale by 500ms-1s. Relay stays as the fallback so
  // an off-LAN tablet (rare, but possible) still prints. TEXT-mode labels
  // (see buildLabelTspl below) are ~500B each, so the whole 6-label batch
  // fits in a single TCP packet — first label emerges immediately.
  //
  // Path 1 — native TCP direct to the printer.
  if (canPrintDirect()) {
    const host = labelPrinter.getHost()!;
    const port = labelPrinter.getPort();
    try {
      const chunks: Uint8Array[] = labels.map(buildLabelTspl);
      const total = chunks.reduce((n, c) => n + c.length, 0);
      const combined = new Uint8Array(total);
      let off = 0;
      for (const c of chunks) { combined.set(c, off); off += c.length; }
      const b64 = arrayBufferToBase64(combined);
      const timeoutMs = 3000 + Math.ceil(total / 1024) * 20;
      await withTimeout(
        LabelPrint.printTspl({ host, port, bytes: b64 }),
        timeoutMs,
        `${labels.length}-label batch`,
      );
      return { transport: 'tcp', ok: true };
    } catch (e: any) {
      // Log and fall through to relay — off-LAN or printer-offline scenarios.
      console.warn('[label-print] direct TCP failed, falling back to relay:', e?.message || e);
    }
  }
  // Path 2 — relay via vp-api. Used when direct TCP is unavailable (browser,
  // no host configured) OR direct TCP just failed (off-LAN tablet).
  if (opts?.kioskSecret) {
    try {
      const chunks: Uint8Array[] = labels.map(buildLabelTspl);
      const total = chunks.reduce((n, c) => n + c.length, 0);
      const combined = new Uint8Array(total);
      let off = 0;
      for (const c of chunks) { combined.set(c, off); off += c.length; }
      const b64 = arrayBufferToBase64(combined);
      await kiosk.printTspl(opts.kioskSecret, b64);
      return { transport: 'relay', ok: true };
    } catch (e: any) {
      const relayErr = e?.message || String(e);
      if (typeof window === 'undefined') {
        return { transport: 'relay', ok: false, error: relayErr };
      }
      console.warn('[label-print] relay failed, trying browser fallback:', relayErr);
    }
  }
  // Path 3 — browser fallback (window.print via existing print-only DOM).
  try {
    window.print();
    return { transport: 'browser', ok: true };
  } catch (e: any) {
    return { transport: 'browser', ok: false, error: e?.message || String(e) };
  }
}

// ------------------------------------------------------------
// Bitmap render + TSPL packaging (browser Canvas)
// ------------------------------------------------------------

// 3.00 in wide x 2.94 in tall @ 203 DPI = 609 x 597 dots. Round width down
// to a multiple of 8 for tight TSPL byte packing.
const LABEL_W = 608;
const LABEL_H = 597;

/**
 * Aug 24 client fix (kiosk speed): switched from BITMAP (~45KB per label,
 * ~2s first-label latency on relay) to TSPL native TEXT commands (~500 B per
 * label, <200ms first label). Labels look plainer — printer's built-in
 * bitmap fonts (monospace-ish) instead of Segoe UI Canvas — but any 6-label
 * batch now fits in a single TCP packet, so the first label emerges as soon
 * as the printer receives it. Bitmap render helpers below are dead code kept
 * only as a rollback anchor; delete once the text-mode path is validated.
 *
 * Font sizing math (203 DPI printhead, 12x24-dot base font "3"):
 *   • x_mult × char_width_dots = ceil(chars_per_line × 12 × mult)
 *   • Label is 608 dots wide, ~597 dots tall.
 *   • Font "3", mult 3 → 36×72 dots per char (about 40px equivalent).
 *   • Font "3", mult 5 → 60×120 dots per char (huge "N of N").
 *   • Font "2" (8×12), mult 2 → 16×24 dots (small footer text).
 */

const FONT_CHAR_WIDTH: Record<string, number> = {
  '1': 8,   // 8×12 base
  '2': 8,   // 8×12 base (bold variant)
  '3': 12,  // 12×20 base
  '4': 12,  // 12×24
  '5': 16,  // 16×24 (varies by model — safe default)
};

/** Center a TEXT command horizontally on a 608-dot label. */
function textCenter(y: number, font: string, mult: number, s: string): string {
  const chW = (FONT_CHAR_WIDTH[font] ?? 12) * mult;
  const x = Math.max(4, Math.round((LABEL_W - s.length * chW) / 2));
  return `TEXT ${x},${y},"${font}",0,${mult},${mult},"${escapeTspl(s)}"`;
}

/** Escape a string for TSPL — backslash quote + trim control bytes. */
function escapeTspl(s: string): string {
  return String(s ?? '')
    .replace(/[\r\n\t\0]/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');
}

/** Wrap `text` to lines that fit `maxCharsPerLine` characters. */
function wrapChars(text: string, maxCharsPerLine: number): string[] {
  const words = String(text ?? '').split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if (!cur) { cur = w; continue; }
    if ((cur.length + 1 + w.length) <= maxCharsPerLine) {
      cur = cur + ' ' + w;
    } else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 3);  // hard cap — description is a few short words in practice
}

/**
 * Aug 24 client fix (abc923 v3): TEXT-mode kept for speed, but switched from
 * TEXT to BLOCK. BLOCK takes an explicit x/y/width/height rectangle plus an
 * alignment parameter (2 = center), so the printer's own firmware handles
 * centering + line-wrapping. No more guessing font widths per printer model.
 *
 * Safe centered box for a 3" round die on a 608×597 backing:
 *   x=40, width=528  (leaves 40dot margin each side)
 *   y=60 to y=537    (leaves 60dot margin top/bottom for the die crown/base)
 *
 * BLOCK syntax:
 *   BLOCK x, y, width, height, "font", rotation, xmul, ymul, [space,] [align,] "content"
 *   align: 1=left, 2=center, 3=right
 */
export function buildLabelTspl(lb: KioskLabel): Uint8Array {
  // Aug 31: long supplier names used to overrun the label edge.
  //   - ≤22 chars    → single big line, font 3 mult 2 (as before)
  //   - 23-60 chars  → two smaller lines, font 3 mult 1 (½ the height)
  //   - >60 chars    → hard-truncate at 60 with an ellipsis on the last line
  // Date / N-of-N / description / meta stay pinned to the same y regardless.
  const SUPPLIER_MAX_CHARS = 60;   // hard cap — anything past this gets '…'
  const BIG_FONT_MAX_CHARS = 22;   // >22 chars won't fit on one big (mult 2) line
  const SMALL_FONT_LINE_CHARS = 40; // per-line cap at mult 1 (label fits ~44 dots-wise; 40 keeps margin)
  const supplierRaw = String(lb.supplierName ?? '').slice(0, SUPPLIER_MAX_CHARS);
  // Decide font size FIRST from the raw length. Never render mult 2 for a
  // string that won't fit as one big line — otherwise it overruns the edge.
  const useBigFont = supplierRaw.length <= BIG_FONT_MAX_CHARS;
  const supplierLines = useBigFont
    ? [supplierRaw]
    : wrapForLabel(supplierRaw, SMALL_FONT_LINE_CHARS, 2);
  const date = String(lb.date ?? '').slice(0, 18);
  const nOf = `${lb.index} of ${lb.total}`;
  const description = String(lb.description ?? '').slice(0, 60);
  const meta = `${String(lb.category ?? '').toUpperCase()} - ${String(lb.unit ?? '').toUpperCase()}`.slice(0, 28);
  const address = String(DROPOFF.address ?? '').slice(0, 50);

  const esc = (s: string) => s.replace(/[\r\n\t\0]/g, ' ').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  // BOX_X + BOX_W define the horizontal safe area — 40dot margin each side.
  const BX = 40;
  const BW = 528;

  const supplierCmds = useBigFont
    // Short name — 1 big line, unchanged from the original layout.
    ? [`BLOCK ${BX},70,${BW},60,"3",0,2,2,0,2,"${esc(supplierLines[0])}"`]
    // Long name (must fit as small): render at mult 1 no matter what.
    // Wrapped to 2 lines when it needs to; still small even if 1 line wraps
    // gracefully so the choice of size is a function of length, not layout.
    : supplierLines.length === 1
      ? [`BLOCK ${BX},80,${BW},40,"3",0,1,1,0,2,"${esc(supplierLines[0])}"`]
      : [
          `BLOCK ${BX},60,${BW},30,"3",0,1,1,0,2,"${esc(supplierLines[0])}"`,
          `BLOCK ${BX},95,${BW},30,"3",0,1,1,0,2,"${esc(supplierLines[1])}"`,
        ];

  const cmds: string[] = [
    'SIZE 3.00,2.94',
    'GAP 0.19,0',
    'OFFSET 0.00',
    'DIRECTION 1',
    'REFERENCE 0,0',
    'DENSITY 8',
    'SPEED 6',
    'SET TEAR ON',
    'CLS',
    // Supplier — bold, medium. 1 or 2 lines depending on length.
    ...supplierCmds,
    // Date under supplier.
    `BLOCK ${BX},140,${BW},40,"3",0,1,1,0,2,"${esc(date)}"`,
    // Huge "N of N" — Font 4 (bigger base) mult 3.
    `BLOCK ${BX},200,${BW},100,"4",0,3,3,0,2,"${esc(nOf)}"`,
    // Description — wraps automatically inside the block.
    `BLOCK ${BX},330,${BW},80,"3",0,2,2,0,2,"${esc(description)}"`,
    // Category / unit strip.
    `BLOCK ${BX},430,${BW},40,"3",0,1,1,0,2,"${esc(meta)}"`,
    // Drop-off address at the bottom.
    `BLOCK ${BX},490,${BW},40,"2",0,1,1,0,2,"${esc(address)}"`,
    'PRINT 1,1',
  ];

  return new TextEncoder().encode(cmds.join('\r\n') + '\r\n');
}

/**
 * Wrap `text` into at most `maxLines` lines of at most `maxChars` characters
 * each. Prefers whole-word breaks. Falls back to hard-breaking a single word
 * that's longer than `maxChars` so we never emit an over-wide line. The last
 * kept line is truncated with an ellipsis if content overflows `maxLines`.
 */
function wrapForLabel(text: string, maxChars: number, maxLines: number): string[] {
  const words = String(text ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];
  const lines: string[] = [];
  let cur = '';
  const push = (s: string) => { if (lines.length < maxLines) lines.push(s); };
  for (const w of words) {
    // Hard-break a single word that's on its own longer than maxChars.
    if (w.length > maxChars) {
      if (cur) { push(cur); cur = ''; }
      let rest = w;
      while (rest.length > maxChars && lines.length < maxLines) {
        push(rest.slice(0, maxChars));
        rest = rest.slice(maxChars);
      }
      cur = rest;
      continue;
    }
    const test = cur ? cur + ' ' + w : w;
    if (test.length <= maxChars) { cur = test; }
    else { push(cur); cur = w; }
  }
  if (cur) push(cur);
  // If the text needed more than maxLines lines, ellipsize the last one.
  if (words.join(' ').length > lines.join(' ').length + (lines.length - 1)) {
    const last = lines[lines.length - 1] ?? '';
    lines[lines.length - 1] = last.length > maxChars - 1
      ? last.slice(0, maxChars - 1) + '…'
      : last + '…';
  }
  return lines;
}

/** Rollback anchor — pixel-exact Canvas bitmap render. Slow but layout-safe. */
export function buildLabelTsplText(lb: KioskLabel): Uint8Array {
  const supplier = String(lb.supplierName ?? '');
  const date = String(lb.date ?? '');
  const nOf = `${lb.index} of ${lb.total}`;
  const descLines = wrapChars(lb.description ?? '', 18);
  const meta = `${String(lb.category ?? '').toUpperCase()} - ${String(lb.unit ?? '').toUpperCase()}`;
  const address = String(DROPOFF.address ?? '');
  const cmds: string[] = [
    'SIZE 3.00,2.94', 'GAP 0.19,0', 'OFFSET 0.00', 'DIRECTION 1',
    'REFERENCE 0,0', 'DENSITY 8', 'SPEED 6', 'SET TEAR ON', 'CLS',
    textCenter(90, '3', 2, supplier.slice(0, 18)),
    textCenter(150, '3', 2, date.slice(0, 14)),
    textCenter(225, '3', 4, nOf),
    ...descLines.slice(0, 2).map((line, i) => textCenter(345 + i * 40, '3', 2, line)),
    textCenter(430, '3', 2, meta.slice(0, 22)),
    textCenter(490, '2', 1, address.slice(0, 40)),
    'PRINT 1,1',
  ];
  return new TextEncoder().encode(cmds.join('\r\n') + '\r\n');
}

/** Original bitmap builder — same as `buildLabelTspl` above; kept as alias for callers. */
export function buildLabelTsplBitmap(lb: KioskLabel): Uint8Array {
  const bmp = renderLabelBitmap(lb);
  const packed = packToTspl1bpp(bmp);
  const bytesPerRow = LABEL_W / 8;
  const header = [
    'SIZE 3.00,2.94',
    'GAP 0.19,0',
    'OFFSET 0.00',
    'DIRECTION 1',
    'REFERENCE 0,0',
    'DENSITY 8',
    'SPEED 6',
    'SET TEAR ON',
    'CLS',
    `BITMAP 0,0,${bytesPerRow},${LABEL_H},0,`,
  ].join('\n') + '\n';
  const footer = '\nPRINT 1,1\n';
  const hdr = new TextEncoder().encode(header);
  const ftr = new TextEncoder().encode(footer);
  const out = new Uint8Array(hdr.length + packed.length + ftr.length);
  out.set(hdr, 0);
  out.set(packed, hdr.length);
  out.set(ftr, hdr.length + packed.length);
  return out;
}

/** Render one label to a monochrome ImageData using HTML canvas. */
function renderLabelBitmap(lb: KioskLabel): ImageData {
  const cv = document.createElement('canvas');
  cv.width = LABEL_W;
  cv.height = LABEL_H;
  const ctx = cv.getContext('2d', { willReadFrequently: true })!;
  // White background — printer stays paper-color anywhere we don't heat.
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, LABEL_W, LABEL_H);
  ctx.fillStyle = '#000000';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.imageSmoothingEnabled = false;

  // Layout matches the PowerShell mockup — store bold at top, huge N-of-N
  // anchor, description, meta strip. Font sizes tuned for a 3" round die.
  const cx = LABEL_W / 2;

  ctx.font = 'bold 40px "Segoe UI", "Helvetica Neue", Arial, sans-serif';
  ctx.fillText(lb.supplierName, cx, 60);

  ctx.font = 'bold 24px "Segoe UI", "Helvetica Neue", Arial, sans-serif';
  ctx.fillText(lb.date, cx, 140);

  ctx.font = 'bold 76px "Segoe UI", "Helvetica Neue", Arial, sans-serif';
  ctx.fillText(`${lb.index} of ${lb.total}`, cx, 250);

  ctx.font = 'bold 28px "Segoe UI", "Helvetica Neue", Arial, sans-serif';
  wrapText(ctx, lb.description || '', cx, 375, LABEL_W - 60, 34);

  ctx.font = 'bold 22px "Segoe UI", "Helvetica Neue", Arial, sans-serif';
  ctx.fillText(`${lb.category.toUpperCase()} — ${lb.unit.toUpperCase()}`, cx, 445);

  // Drop-off address (small, at the very bottom edge of the printable area).
  ctx.font = '18px "Segoe UI", "Helvetica Neue", Arial, sans-serif';
  ctx.fillText(DROPOFF.address, cx, 495);

  return ctx.getImageData(0, 0, LABEL_W, LABEL_H);
}

/** Pack a Format24bpp-like ImageData into TSC BITMAP MODE 0 bytes.
 *  MODE 0: 0 bit = printed (black), 1 bit = paper (white). */
function packToTspl1bpp(img: ImageData): Uint8Array {
  const w = img.width, h = img.height;
  const bytesPerRow = Math.ceil(w / 8);
  const out = new Uint8Array(bytesPerRow * h).fill(0xFF);
  const px = img.data;
  for (let y = 0; y < h; y++) {
    const rowBase = y * bytesPerRow;
    for (let x = 0; x < w; x++) {
      const p = (y * w + x) * 4;
      const luma = (px[p] + px[p + 1] + px[p + 2]) / 3;
      if (luma < 128) {                                // dark → CLEAR bit
        const byte = rowBase + (x >>> 3);
        const bit  = 7 - (x & 7);
        out[byte] &= ~(1 << bit) & 0xFF;
      }
    }
  }
  return out;
}

function arrayBufferToBase64(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(bin);
}

/** Draw text broken to fit within maxWidth. */
function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  // Vertically center the block on the given y.
  const total = lines.length * lineHeight;
  const startY = y - total / 2 + lineHeight / 2;
  lines.forEach((l, i) => ctx.fillText(l, x, startY + i * lineHeight));
}
