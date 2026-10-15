import { applyDisplayPrefs } from './design';
import { Component, StrictMode, type ErrorInfo, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { DialogHost, uiNotify } from './ui-dialogs';
// Oct 5 client: every alert() becomes an in-page notice.
window.alert = (m?: unknown) => uiNotify(String(m ?? ''));
import './index.css';
applyDisplayPrefs(); // Oct 5: dark mode / bigger text before first paint

// Oct 14 client: the phone app (Capacitor) has no service worker -- its files are
// inside the app (the cap build no longer makes one, see vite.config.ts). Remove any
// left by older app versions, and their caches, so they can't serve stale files.
try {
  const cap = (window as any).Capacitor;
  if (cap?.isNativePlatform?.() === true && 'serviceWorker' in navigator) {
    void navigator.serviceWorker.getRegistrations()
      .then((regs) => regs.forEach((r) => { void r.unregister(); }))
      .catch(() => {});
    if ('caches' in window) {
      void caches.keys()
        .then((ks) => ks.filter((k) => k.startsWith('workbox')).forEach((k) => { void caches.delete(k); }))
        .catch(() => {});
    }
  }
} catch { /* fine */ }

// Note: vite-plugin-pwa's `registerType: 'autoUpdate'` already wires up SW
// registration + update-on-next-navigation. We previously added a manual
// `registerSW({immediate, onNeedRefresh: reload})` block on top of that, but
// the explicit reload caused a reload-loop on slow networks. Let the plugin
// handle it; the user's next navigation picks up the new bundle naturally.

// Oct 9 client: same office number as Login.tsx "Call the office" (kept in sync by hand;
// Login.tsx doesn't export it and importing Login here would pull it into the crash path).
const OFFICE_PHONE = '(845) 363-5323';
const OFFICE_TEL = 'tel:+18453635323';

class RootBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  override componentDidCatch(error: Error, info: ErrorInfo) { console.error('[boundary]', error, info?.componentStack); }
  override render() {
    if (!this.state.error) return this.props.children;
    // Oct 9 client: friendly crash screen. One big "reload" button (keeps the
    // driver signed in, no localStorage wipe), the office phone, and the
    // technical error tucked in a collapsed "Details" for support.
    return (
      <div className="min-h-screen p-6 flex flex-col items-center justify-center text-center bg-cream">
        <h1 className="font-display font-semibold text-[22px] text-ink">Something went wrong.</h1>
        <button className="mt-5 w-full max-w-sm rounded-[14px] bg-forest text-paper px-5 py-4 font-bold text-[18px] min-h-[56px]"
                onClick={() => window.location.reload()}>
          Tap to reload
        </button>
        <a href={OFFICE_TEL} className="mt-5 text-[16px] font-bold text-forest underline">
          Still stuck? Call the office: {OFFICE_PHONE}
        </a>
        <details className="mt-8 w-full max-w-sm text-left">
          <summary className="text-[14px] text-muted cursor-pointer py-2">Details</summary>
          <pre className="mt-2 whitespace-pre-wrap break-words bg-line rounded-xl p-3 text-xs">
            {String(this.state.error?.message ?? this.state.error)}
            {this.state.error?.stack ? '\n\n' + this.state.error.stack : ''}
          </pre>
        </details>
      </div>
    );
  }
}

window.addEventListener('unhandledrejection', (e) => console.error('[unhandled]', e.reason));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RootBoundary>
      <DialogHost />
      <App />
    </RootBoundary>
  </StrictMode>,
);
