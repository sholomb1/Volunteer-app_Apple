/**
 * Oct 11 client: kiosk mode for the drop-off tablet (plain website, no app).
 *
 * Started from the kiosk page (lock button, bottom-left → kiosk PIN). While it
 * is ON this device stays on the kiosk page:
 *   • KioskApp runs useKioskLockdown() (full screen, back trap, no zoom, …)
 *   • App.tsx sends every other /rescue/ address straight back to the kiosk
 * Only the kiosk PIN turns it OFF (lock button → PIN, or Admin Panel → Exit).
 *
 * Stored per device in localStorage: { on: 1, startedAt, secret, path }.
 * Oct 11 client: `path` is the full kiosk address (with its secret) the mode
 * was started on; the escape guard below sends the tablet back there.
 */
import { useEffect } from 'react';
import { kioskDevice } from '../api';

const KEY = 'zlz.kioskMode';
const TRIES_KEY = 'zlz.kioskMode.tries';

export type KioskModeState = { on: 1; startedAt: number; secret: string; path?: string };

// Oct 11 client: '/rescue/' on the web build ('./' in the native build).
const BASE = (import.meta.env.BASE_URL || '/');

/** Oct 11 client: is this address the kiosk page? */
export function isKioskPath(pathname: string): boolean {
  if (BASE.startsWith('/')) return pathname.startsWith(BASE.replace(/\/?$/, '/') + 'kiosk/');
  return pathname.includes('/kiosk/');
}

export const kioskMode = {
  get(): KioskModeState | null {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const v = JSON.parse(raw);
      return v && v.on === 1 && typeof v.secret === 'string' && v.secret ? v as KioskModeState : null;
    } catch { return null; }
  },
  isOn(): boolean { return kioskMode.get() !== null; },
  /** Oct 11 client: `path` = full kiosk address incl. the secret (location.pathname + search). */
  start(secret: string, path?: string) {
    try { localStorage.setItem(KEY, JSON.stringify({ on: 1, startedAt: Date.now(), secret, path })); } catch { /* storage blocked */ }
  },
  /** Oct 11 client: the kiosk address to send the tablet back to. */
  url(st: KioskModeState | null = kioskMode.get()): string | null {
    if (!st) return null;
    if (st.path && st.path.startsWith('/') && isKioskPath(st.path.split('?')[0])) return st.path;
    const b = BASE.startsWith('/') ? BASE.replace(/\/?$/, '/') : '/';
    return `${b}kiosk/${encodeURIComponent(st.secret)}`;
  },
  /** Oct 11 client: exiting with the PIN turns off BOTH kiosk settings —
   *  this one and the older permanent "this device is the kiosk" switch
   *  (Settings), so normal browsing really comes back. */
  stop() {
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
    try { kioskDevice.clear(); } catch { /* ignore */ }
  },
};

// Oct 11 client: 5 wrong PINs → 30-second wait. Kept in localStorage so a
// reload doesn't reset the count.
const MAX_TRIES = 5;
const WAIT_MS = 30 * 1000;
type Tries = { n: number; until: number };

function readTries(): Tries {
  try {
    const v = JSON.parse(localStorage.getItem(TRIES_KEY) || 'null');
    if (v && typeof v.n === 'number' && typeof v.until === 'number') return v;
  } catch { /* ignore */ }
  return { n: 0, until: 0 };
}
function writeTries(t: Tries) {
  try { localStorage.setItem(TRIES_KEY, JSON.stringify(t)); } catch { /* ignore */ }
}

export const pinTries = {
  /** ms left to wait (0 = may try now). */
  waitLeft(): number { return Math.max(0, readTries().until - Date.now()); },
  wrong() {
    const t = readTries();
    const n = t.n + 1;
    if (n >= MAX_TRIES) writeTries({ n: 0, until: Date.now() + WAIT_MS });
    else writeTries({ n, until: t.until });
  },
  reset() { writeTries({ n: 0, until: 0 }); },
};

/**
 * Oct 11 client: app-wide escape guard, mounted at the very top of App (outside
 * the router). While kiosk mode is ON, if the tablet ever shows a non-kiosk
 * address — browser Back into the office page, a page restored from the
 * back/forward cache (React effects don't re-run there), or coming back to the
 * tab — go straight back to the kiosk. location.replace so the old page can't
 * stay on screen and isn't added to history.
 */
export function useKioskModeEscapeGuard() {
  useEffect(() => {
    const check = () => {
      const st = kioskMode.get();
      if (!st || isKioskPath(location.pathname)) return;
      const url = kioskMode.url(st);
      if (url) location.replace(url);
    };
    const onPageShow = () => check();   // incl. event.persisted (bfcache restore)
    const onVis = () => { if (document.visibilityState === 'visible') check(); };
    window.addEventListener('popstate', check);
    window.addEventListener('pageshow', onPageShow);
    document.addEventListener('visibilitychange', onVis);
    check();
    return () => {
      window.removeEventListener('popstate', check);
      window.removeEventListener('pageshow', onPageShow);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);
}
