/**
 * Oct 16 client (idea 7): tell the server when an office screen was slow to show.
 *
 * "Showing" = from the tab switch until the app's server calls are done (no call to
 * /api/ in flight for 250 ms). Over 3 s → POST /api/speed/slow-screen { screen, ms }.
 * Light: one counter around fetch, a 100 ms check while a screen loads (stops when it's
 * done, after 30 s, or when another screen starts). Hidden tabs don't count.
 * Rate-limited: at most one report per 30 s and 10 per hour from this browser.
 */
import { api } from './api';

export const SLOW_MS = 3000;
const SETTLE_MS = 250;
const GIVE_UP_MS = 30_000;
let inflight = 0;
let lastZeroAt = 0;
let installed = false;

function install() {
  if (installed || typeof window === 'undefined' || typeof window.fetch !== 'function') return;
  installed = true;
  const orig = window.fetch.bind(window);
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
    if (!/\/api\//.test(url) || /\/(stream|speed\/slow-screen)\b/.test(url)) return orig(input as any, init);
    inflight++;
    return orig(input as any, init).finally(() => {
      inflight = Math.max(0, inflight - 1);
      if (inflight === 0) lastZeroAt = performance.now();
    });
  }) as typeof window.fetch;
}

install(); // at import, so the first screen's calls are counted too

const sent: number[] = [];
function report(screen: string, ms: number) {
  const now = Date.now();
  while (sent.length && sent[0]! < now - 3_600_000) sent.shift();
  if (sent.length >= 10 || (sent.length && now - sent[sent.length - 1]! < 30_000)) return;
  sent.push(now);
  void api('/api/speed/slow-screen', { method: 'POST', body: JSON.stringify({ screen, ms }) }).catch(() => {});
}

let current = 0;
/** Start timing a screen (call when the office switches to it). */
export function startScreenTimer(screen: string): void {
  install();
  const id = ++current;
  const t0 = performance.now();
  let hidden = document.hidden;
  const tick = () => {
    if (id !== current) return;                    // another screen started
    const now = performance.now();
    if (document.hidden) hidden = true;
    if (now - t0 > GIVE_UP_MS) return;
    if (inflight === 0 && now - Math.max(lastZeroAt, t0) >= SETTLE_MS) {
      const ms = Math.round(Math.max(0, lastZeroAt - t0));
      if (ms > SLOW_MS && !hidden) report(screen, ms);
      return;
    }
    setTimeout(tick, 100);
  };
  setTimeout(tick, 100);
}
