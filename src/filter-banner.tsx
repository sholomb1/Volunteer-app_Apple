/**
 * Oct 11 client: many screens just say "Couldn't load." — when an internet filter
 * blocked a reply, api() fires a window event (FILTER_BLOCKED_EVENT) and this
 * banner, mounted once in App.tsx, says so plainly at the top. Dismiss with ×;
 * hides itself after 30 seconds with no new block.
 */
import { useEffect, useState } from 'react';
import { FILTER_BLOCKED_EVENT, FILTER_BLOCKED_TEXT } from './api';

export function FilterBlockedBanner() {
  const [shownAt, setShownAt] = useState<number | null>(null);
  useEffect(() => {
    const on = () => setShownAt(Date.now());
    window.addEventListener(FILTER_BLOCKED_EVENT, on);
    return () => window.removeEventListener(FILTER_BLOCKED_EVENT, on);
  }, []);
  useEffect(() => {
    if (shownAt == null) return;
    const t = setTimeout(() => setShownAt(null), 30_000);
    return () => clearTimeout(t);
  }, [shownAt]);
  if (shownAt == null) return null;
  // sit under the dev-only testing bar (it pads the body) and above pop-ups
  const top = parseInt(getComputedStyle(document.body).paddingTop || '0', 10) || 0;
  return (
    <div role="alert" data-testid="filter-blocked-banner"
         className="fixed inset-x-0 z-[9998] flex items-start justify-center gap-2 border-b border-[#e3c98a] bg-[#fdf3dc] px-4 py-2 text-[13px] font-semibold text-[#6b4f0e] shadow-sm"
         style={{ top, paddingTop: top ? 8 : 'max(8px, env(safe-area-inset-top))' }}>
      <span className="max-w-[760px]">{FILTER_BLOCKED_TEXT}</span>
      <button onClick={() => setShownAt(null)} aria-label="Dismiss" className="haptic -mt-0.5 shrink-0 px-1 text-[18px] leading-none">×</button>
    </div>
  );
}