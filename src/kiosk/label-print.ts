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

export const labelPrinter = {
  getHost: () => localStorage.getItem(LS_HOST),
  getPort: () => Number(localStorage.getItem(LS_PORT) || '9100'),
  setHost: (h: string) => localStorage.setItem(LS_HOST, h),
  setPort: (p: number) => localStorage.setItem(LS_PORT, String(p)),
  clear: () => { localStorage.removeItem(LS_HOST); localStorage.removeItem(LS_PORT); },
};

/** Whether the direct-TCP native path is available on this device. */
export function canPrintDirect(): boolean {
  return Capacitor.getPlatform() === 'android' && !!labelPrinter.getHost();
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
  // Path 1 — relay via vp-api.
  if (opts?.kioskSecret) {
    try {
      for (const lb of labels) {
        const bytes = buildLabelTspl(lb);
        const b64   = arrayBufferToBase64(bytes);
        await kiosk.printTspl(opts.kioskSecret, b64);
      }
      return { transport: 'relay', ok: true };
    } catch (e: any) {
      // Fall through to direct/browser paths so we don't leave the driver
      // stuck if the relay bridge is briefly offline.
      const relayErr = e?.message || String(e);
      if (!canPrintDirect() && typeof window === 'undefined') {
        return { transport: 'relay', ok: false, error: relayErr };
      }
      // Otherwise attempt the next transport. Log why relay failed so it
      // shows up in the browser console (helps diagnose printer offline).
      console.warn('[label-print] relay failed, trying fallbacks:', relayErr);
    }
  }
  // Path 2 — native TCP (Capacitor APK on Android, host configured).
  if (canPrintDirect()) {
    const host = labelPrinter.getHost()!;
    const port = labelPrinter.getPort();
    try {
      for (const lb of labels) {
        const bytes = buildLabelTspl(lb);
        const b64 = arrayBufferToBase64(bytes);
        await LabelPrint.printTspl({ host, port, bytes: b64 });
      }
      return { transport: 'tcp', ok: true };
    } catch (e: any) {
      return { transport: 'tcp', ok: false, error: e?.message || String(e) };
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

/** Build a complete TSPL BITMAP-command byte payload for one label. */
export function buildLabelTspl(lb: KioskLabel): Uint8Array {
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
    'SPEED 4',
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
