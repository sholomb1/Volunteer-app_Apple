// Oct 11 client: speed — big screens (office portal, kiosk, sign-up forms, map,
// reports) load only when opened. After a deploy, an open tab may ask for a
// chunk file name that no longer exists: reload the page once (at most once a
// minute) so it picks up the new files instead of showing an error.
import { createElement, lazy, useState, type ComponentType } from 'react';

const RELOAD_KEY = 'zlz_chunk_reload_at';

/** Reload once for a missing chunk. Returns true when a reload was started. */
export function reloadOnceForNewVersion(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) || '0');
    if (Date.now() - last < 60_000) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch { return false; }
  window.location.reload();
  return true;
}

// Vite fires this when a preloaded chunk/CSS fails to load.
if (typeof window !== 'undefined') {
  window.addEventListener('vite:preloadError', (e) => {
    if (reloadOnceForNewVersion()) e.preventDefault();
  });
}

/**
 * React.lazy for a named export, with the reload-once fallback, plus
 * `.preload()`. Once the file is in, the screen renders straight away instead
 * of going through Suspense (React holds a Suspense fallback ~300 ms).
 */
export function lazyNamed<M extends Record<string, any>, K extends keyof M & string>(
  load: () => Promise<M>, name: K,
): ComponentType<M[K] extends ComponentType<infer P> ? P : never> & { preload: () => Promise<unknown> } {
  type P = M[K] extends ComponentType<infer Q> ? Q : never;
  let loaded: ComponentType<P> | null = null;
  let pending: Promise<ComponentType<P>> | null = null;
  const start = () => (pending ??= load().then((m) => { loaded = m[name] as ComponentType<P>; return loaded; }));
  const Lazy = lazy(() => start()
    .then((c) => ({ default: c }))
    .catch((err) => {
      pending = null;
      if (reloadOnceForNewVersion()) return new Promise<{ default: ComponentType<P> }>(() => { /* page is reloading */ });
      throw err;
    }));
  function Screen(props: P) {
    // Decided once per mount, so a screen never swaps (and loses its state).
    const [direct] = useState(() => loaded);
    return direct ? createElement(direct as ComponentType<any>, props as any) : createElement(Lazy as ComponentType<any>, props as any);
  }
  (Screen as any).preload = () => start().catch(() => { /* loads (or reloads) when opened */ });
  return Screen as any;
}
