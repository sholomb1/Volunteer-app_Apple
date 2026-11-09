import { useRef, useState } from 'react';

// Oct 19 client: "the buttons don't press" on the kiosk tablet. A normal click only fires when the
// finger lifts without moving; on the scrolling sign-in page a slightly moving, slow or heavy
// press turned into a scroll / long-press and was lost. TapButton reacts the moment the finger
// touches (pointerdown), ignores the follow-up click, blocks the long-press menu and double-tap
// zoom, and flashes + buzzes so people see the press landed.
// Oct 30 client: moved to its own file so the new quick kiosk (quick-kiosk.tsx) uses the same one.
// Nov 8 client: when the last big button fired — the next screen ignores taps for a moment after it,
// so the same finger can't also press something on the new screen (the kiosk "picked a store by itself").
export const lastTap = { at: 0 };
// Nov 8 client: "the buttons are a drop too fast" — firing the moment the finger touched also fired when
// someone only meant to scroll, and the lifting finger then landed on the next screen. Now: it lights up on
// touch, and fires when the finger lifts (moved less than ~40 px, any press length; the button never turns into a scroll). A scroll cancels it.
export function TapButton({ onTap, disabled, className, children, ariaLabel, downClass, style }: {
  onTap: () => void; disabled?: boolean; className: string; children: React.ReactNode; ariaLabel?: string;
  downClass?: string; style?: React.CSSProperties;
}) {
  const last = useRef(0);
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const [down, setDown] = useState(false);
  const fire = () => {
    if (disabled) return;
    last.current = Date.now(); lastTap.at = last.current;
    try { navigator.vibrate?.(12); } catch { /* not supported */ }
    onTap();
  };
  const cancel = () => { start.current = null; setDown(false); };
  return (
    <button type="button" disabled={disabled} aria-label={ariaLabel}
            onPointerDown={(e) => {
              if (e.pointerType === 'mouse' && e.button !== 0) return;
              e.preventDefault();
              start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
              try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* old webview */ }
              setDown(true);
            }}
            onPointerMove={(e) => { const s0 = start.current; if (s0 && s0.id === e.pointerId && Math.hypot(e.clientX - s0.x, e.clientY - s0.y) > 40) cancel(); }}
            onPointerUp={(e) => { const s0 = start.current; cancel(); if (s0 && s0.id === e.pointerId) fire(); }}
            onPointerCancel={cancel}
            onClick={() => { if (Date.now() - last.current > 700) fire(); }} // keyboard Enter/Space still works
            onContextMenu={(e) => e.preventDefault()}
            style={{ touchAction: 'none', /* Nov 8 client: the browser never takes a press for a scroll (Oct 19 "buttons don't press") */ WebkitTouchCallout: 'none', WebkitTapHighlightColor: 'transparent', userSelect: 'none', WebkitUserSelect: 'none', ...style } as React.CSSProperties}
            className={`${className} select-none ${down ? (downClass ?? '!bg-sage !border-forest scale-95') : ''}`}>
      {children}
    </button>
  );
}
