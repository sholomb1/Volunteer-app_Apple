import { useRef, useState } from 'react';

// Oct 19 client: "the buttons don't press" on the kiosk tablet. A normal click only fires when the
// finger lifts without moving; on the scrolling sign-in page a slightly moving, slow or heavy
// press turned into a scroll / long-press and was lost. TapButton reacts the moment the finger
// touches (pointerdown), ignores the follow-up click, blocks the long-press menu and double-tap
// zoom, and flashes + buzzes so people see the press landed.
// Oct 30 client: moved to its own file so the new quick kiosk (quick-kiosk.tsx) uses the same one.
export function TapButton({ onTap, disabled, className, children, ariaLabel, downClass, style }: {
  onTap: () => void; disabled?: boolean; className: string; children: React.ReactNode; ariaLabel?: string;
  downClass?: string; style?: React.CSSProperties;
}) {
  const last = useRef(0);
  const [down, setDown] = useState(false);
  const fire = () => {
    if (disabled) return;
    last.current = Date.now();
    try { navigator.vibrate?.(12); } catch { /* not supported */ }
    onTap();
  };
  return (
    <button type="button" disabled={disabled} aria-label={ariaLabel}
            onPointerDown={(e) => { if (e.pointerType === 'mouse' && e.button !== 0) return; e.preventDefault(); setDown(true); fire(); }}
            onPointerUp={() => setDown(false)} onPointerLeave={() => setDown(false)} onPointerCancel={() => setDown(false)}
            onClick={() => { if (Date.now() - last.current > 700) fire(); }} // keyboard Enter/Space still works
            onContextMenu={(e) => e.preventDefault()}
            style={{ touchAction: 'manipulation', WebkitTouchCallout: 'none', WebkitTapHighlightColor: 'transparent', userSelect: 'none', WebkitUserSelect: 'none', ...style } as React.CSSProperties}
            className={`${className} select-none ${down ? (downClass ?? '!bg-sage !border-forest scale-95') : ''}`}>
      {children}
    </button>
  );
}
