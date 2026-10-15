/**
 * Oct 7 client: lock the kiosk down when it runs as a plain website (no
 * native app). Everything here is browser-level; the OS-level lock (iPad
 * Guided Access / Android screen pinning or a kiosk browser) is set up on the
 * tablet itself.
 *
 * Oct 11 client: now OPT-IN — runs only while kiosk mode is ON (see
 * kiosk-mode.ts). A normal visit to the kiosk page is not locked. Exit is the
 * kiosk PIN (lock button or Admin Panel).
 *
 *   • full screen on the first tap, and again on the next tap if it drops out
 *   • back button / back swipe trapped (stays on the kiosk)
 *   • no pull-to-refresh, pinch / double-tap zoom, long-press menu,
 *     text selection or image drag
 *   • browser shortcuts blocked (reload, new tab, address bar, devtools…);
 *     plain typing still works for the Bluetooth keyboard PIN entry
 *   • links can't open other pages or new tabs; window.open blocked
 *   • the kiosk's own buttons, screens and label printing (window.print /
 *     printer relay) are not touched
 */
import { useEffect } from 'react';

const BLOCKED_KEYS = new Set(['F1', 'F3', 'F5', 'F6', 'F7', 'F11', 'F12', 'BrowserBack', 'BrowserForward', 'BrowserHome', 'BrowserRefresh', 'BrowserSearch', 'ContextMenu']);

function inEditable(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable;
}

/** Oct 11 client: try full screen now (call from a tap). Safe to call anytime. */
export function requestKioskFullscreen() {
  const doc = document.documentElement;
  if (document.fullscreenElement || !doc.requestFullscreen) return;
  doc.requestFullscreen({ navigationUI: 'hide' } as FullscreenOptions).catch(() => { /* not allowed yet */ });
}

/** Oct 11 client: add a guard history entry on the kiosk address. Keeps the
 *  router's own state (key/idx) so React Router is unaffected. `tap` = added
 *  during a tap/key press (Chrome won't skip it on Back). */
function pushKioskGuard(tap: boolean) {
  try { history.pushState({ ...(history.state || {}), kioskLock: true, kioskTap: tap }, '', location.href); } catch { /* ignore */ }
}

/** Oct 11 client: call right when kiosk mode starts (inside the PIN tap):
 *  re-mark the current entry and stack guard entries on top, so the way back
 *  to the page the tablet came from is buried. */
export function buryKioskHistory() {
  try {
    history.replaceState({ ...(history.state || {}), kioskLock: true, kioskTap: true }, '', location.href);
    pushKioskGuard(true);
    pushKioskGuard(true);
  } catch { /* ignore */ }
}

export function useKioskLockdown(active: boolean) {
  useEffect(() => {
    // Oct 11 client: opt-in — nothing happens unless kiosk mode is ON.
    if (!active) return;
    const cleanups: Array<() => void> = [];
    const on = (target: EventTarget, type: string, fn: (e: any) => void, opts: AddEventListenerOptions = { capture: true }) => {
      target.addEventListener(type, fn, opts);
      cleanups.push(() => target.removeEventListener(type, fn, opts));
    };

    // Full screen: browsers only allow it from a tap, so retry on every tap
    // until it sticks (also after the OS, the print dialog or Escape drops out).
    on(window, 'pointerdown', requestKioskFullscreen);

    // Back button / swipe: keep a spare history entry and re-push on pop.
    // Oct 11 client: Chrome (Android) lets Back SKIP entries that were added
    // without a tap, so a guard pushed on mount / on popstate alone isn't
    // enough. On every tap or key press, if the current entry isn't a guard
    // added during a tap, push one — Back then always has a real entry to use.
    const onGesture = () => {
      const st = history.state;
      if (st?.kioskLock !== true || st?.kioskTap !== true) pushKioskGuard(true);
    };
    on(window, 'pointerdown', onGesture);
    on(window, 'keydown', onGesture);
    if (history.state?.kioskLock !== true) pushKioskGuard(false);
    on(window, 'popstate', () => pushKioskGuard(false), {});

    // Zoom, long-press, selection, drag.
    on(window, 'contextmenu', (e) => e.preventDefault());
    on(window, 'dragstart', (e) => e.preventDefault());
    on(window, 'selectstart', (e) => { if (!inEditable(e.target)) e.preventDefault(); });
    on(document, 'gesturestart', (e) => e.preventDefault());               // iOS pinch
    on(window, 'touchmove', (e) => { if (e.touches?.length > 1) e.preventDefault(); }, { capture: true, passive: false });
    on(window, 'wheel', (e) => { if (e.ctrlKey) e.preventDefault(); }, { capture: true, passive: false });

    // Keyboard: no browser shortcuts; letters/digits/Shift/Enter/Backspace still work.
    on(window, 'keydown', (e: KeyboardEvent) => {
      if (BLOCKED_KEYS.has(e.key) || ((e.ctrlKey || e.metaKey || e.altKey) && e.key !== 'Shift')) {
        e.preventDefault(); e.stopPropagation();
      }
    });

    // Links: nothing leaves the kiosk page.
    on(document, 'click', (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a) return;
      const url = new URL(a.href, location.href);
      if (a.target === '_blank' || url.origin !== location.origin || !url.pathname.includes('/kiosk/')) {
        e.preventDefault(); e.stopPropagation();
      }
    });
    const origOpen = window.open;
    window.open = () => null;
    cleanups.push(() => { window.open = origOpen; });

    // CSS: no overscroll refresh/bounce, no callouts, no selection, no double-tap zoom.
    const style = document.createElement('style');
    style.textContent = `
      html, body { overscroll-behavior: none; touch-action: pan-x pan-y; }
      body { -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent; }
      input, textarea, [contenteditable] { -webkit-user-select: text; user-select: text; }
      img { -webkit-user-drag: none; }
    `;
    document.head.appendChild(style);
    cleanups.push(() => style.remove());

    // Viewport: no pinch zoom (Android Chrome honours this).
    const vp = document.querySelector('meta[name="viewport"]');
    const prevVp = vp?.getAttribute('content') ?? null;
    vp?.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover');
    cleanups.push(() => { if (vp && prevVp != null) vp.setAttribute('content', prevVp); });

    return () => {
      cleanups.forEach((fn) => fn());
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    };
  }, [active]);
}
