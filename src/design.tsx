/**
 * Design primitives that match the rescue-kit mockups verbatim. Cards have
 * 18px radius; CTAs are full-bleed rounded-14 with chunky 14px font; status
 * uses color + check icons; the **sign-up slot avatars** (filled circles +
 * dashed empty ones with N-of-M label) are the signature pattern.
 */
import { uiConfirm } from './ui-dialogs';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { forwardRef, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Check, Circle, Mail, LogOut, Menu, X, Home, Calendar, Map as MapIcon, MessageSquare, User, Settings as SettingsIcon, FileText } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { getUser, setAuth } from './api';

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

// ---------------- Buttons / CTAs ----------------

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'forest' | 'clay' | 'sage' | 'plain';
  size?: 'sm' | 'md';
  loading?: boolean;
  icon?: ReactNode;
  full?: boolean;
};

const BTN_VARIANT: Record<NonNullable<ButtonProps['variant']>, string> = {
  forest: 'bg-forest text-paper shadow-ctag hover:brightness-105',
  clay:   'bg-clay text-paper shadow-cta hover:brightness-105',
  sage:   'bg-sage text-forest border border-sage-line hover:bg-sage-line/40',
  plain:  'bg-paper text-ink border border-line hover:bg-line/40',
};
const BTN_SIZE: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'h-9  px-3.5 text-xs rounded-[10px] gap-1.5',
  md: 'h-11 px-4   text-sm rounded-[12px] gap-2',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'forest', size = 'md', loading, icon, full, type, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button ref={ref} type={type ?? 'button'} disabled={loading || disabled} {...rest}
      className={cx(
        'inline-flex items-center justify-center font-bold haptic transition-all duration-150',
        'disabled:opacity-50 disabled:pointer-events-none',
        full && 'w-full',
        BTN_SIZE[size], BTN_VARIANT[variant], className,
      )}>
      {loading ? <Loader2 className="animate-spin" size={size === 'sm' ? 14 : 16} /> : icon}
      {children}
    </button>
  );
});

/** Full-width CTA at the bottom of a screen (mockup pattern: clay or forest). */
export function StickyCTA({ tone = 'forest', loading, disabled, children, onClick }: {
  tone?: 'forest' | 'clay';
  loading?: boolean; disabled?: boolean;
  children: ReactNode;
  onClick?: () => void;
}) {
  const cls = tone === 'clay' ? 'bg-clay shadow-cta' : 'bg-forest shadow-ctag';
  return (
    <div className="sticky bottom-0 left-0 right-0 px-4 pb-safe pt-3 bg-gradient-to-t from-cream via-cream to-cream/0 pointer-events-none">
      <button onClick={onClick} disabled={loading || disabled}
        className={cx('w-full text-paper font-bold text-[15px] py-4 rounded-[14px] haptic disabled:opacity-50 pointer-events-auto', cls)}>
        {loading ? 'Working…' : children}
      </button>
    </div>
  );
}

// ---------------- Card ----------------

export function Card({ children, className, onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  return (
    <div onClick={onClick}
      className={cx('surface p-5', onClick && 'haptic cursor-pointer hover:-translate-y-0.5 hover:shadow-card transition', className)}>
      {children}
    </div>
  );
}

// ---------------- Slot avatars (signature) ----------------

const SLOT_TONES = ['bg-[#3a7350]', 'bg-clay', 'bg-amber', 'bg-sky'];

export function SlotAvatars({ filled, capacity, size = 24 }: {
  filled: { initials: string }[]; capacity: number; size?: number;
}) {
  const empty = Math.max(0, capacity - filled.length);
  const fontSize = size <= 22 ? 9.5 : 10.5;
  return (
    <div className="flex items-center" style={{ gap: -6 }}>
      {filled.map((f, i) => (
        <span key={`f${i}`}
              className={cx('inline-grid place-items-center font-bold text-paper rounded-full border-[2px] border-paper', SLOT_TONES[i % SLOT_TONES.length])}
              style={{ width: size, height: size, marginLeft: i === 0 ? 0 : -6, fontSize }}>
          {f.initials.slice(0, 2).toUpperCase()}
        </span>
      ))}
      {Array.from({ length: empty }).map((_, i) => (
        <span key={`e${i}`}
              className="inline-block rounded-full bg-paper"
              style={{ width: size, height: size, border: '1.6px dashed #C7CEC2', marginLeft: -6 }} />
      ))}
    </div>
  );
}

export function SlotLabel({ filled, capacity }: { filled: number; capacity: number }) {
  const ok = filled >= capacity && capacity > 0;
  const text = ok ? 'All drivers set'
    : `${filled} of ${capacity} drivers going`;
  return <span className={cx('text-[14px] font-bold ml-2', ok ? 'text-forest' : 'text-clay')}>{text}</span>;
}

// ---------------- Status timeline ----------------

export type TLStage = { key: string; label: string; ts?: string };
export function StatusTimeline({ stages, current }: { stages: TLStage[]; current: number }) {
  return (
    <div className="relative pl-1.5 mt-3">
      {stages.map((s, i) => {
        const state = i < current ? 'done' : i === current ? 'now' : 'todo';
        return (
          <div key={s.key} className="flex gap-3 pb-3.5 relative">
            {i !== stages.length - 1 && (
              <span className="absolute top-5 bottom-[-2px] w-[2px] bg-sage-line" style={{ left: 9 }} />
            )}
            <span className={cx('relative z-10 grid h-5 w-5 place-items-center rounded-full shrink-0',
              state === 'done' && 'bg-forest text-paper',
              state === 'now'  && 'bg-clay text-paper ring-4 ring-clay-soft',
              state === 'todo' && 'bg-paper border-2 border-line-2',
            )}>
              {state === 'done' && <Check size={11} strokeWidth={3.4} />}
              {state === 'now'  && <Circle size={9} fill="currentColor" />}
            </span>
            <div>
              <div className={cx('text-[15px] font-bold', state === 'todo' && 'text-muted font-semibold')}>{s.label}</div>
              {s.ts && state !== 'todo' && <div className="text-[13px] text-muted">{s.ts}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------- Status pill ----------------

export function StatusPill({ status }: { status: string }) {
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    pending:     { bg: 'bg-amber-soft', fg: 'text-[#9a7415]', label: 'Waiting for a driver' },
    scheduled:   { bg: 'bg-amber-soft', fg: 'text-[#9a7415]', label: 'Coming up' }, // Oct 8: also shows on a driver's own card
    confirmed:   { bg: 'bg-sage',       fg: 'text-forest',    label: 'Ready to go' },
    in_progress: { bg: 'bg-clay-soft',  fg: 'text-clay',      label: 'On the way' },
    en_route:    { bg: 'bg-clay-soft',  fg: 'text-clay',      label: 'On the way' },
    picked_up:   { bg: 'bg-clay-soft',  fg: 'text-clay',      label: 'Picked up' },
    delivered:   { bg: 'bg-sage',       fg: 'text-forest',    label: 'Delivered' },
    completed:   { bg: 'bg-sage',       fg: 'text-forest',    label: 'Delivered' },
    cancelled:   { bg: 'bg-line',       fg: 'text-muted',     label: 'Cancelled' },
    missed:      { bg: 'bg-clay-soft',  fg: 'text-clay',      label: 'Missed' },
  };
  // Oct 8: never show a raw code like "in_progress" to a driver.
  const m = map[status] ?? { bg: 'bg-line', fg: 'text-muted', label: String(status || '').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()) };
  return <span className={cx('inline-flex items-center text-[13px] font-bold rounded-full px-2.5 py-1', m.bg, m.fg)}>{m.label}</span>;
}

// ---------------- App bar + screen scaffold ----------------

export function AppBar({ title, right, leftMark = 'ז', altMark = false }: {
  title: string; right?: ReactNode; leftMark?: string; altMark?: boolean;
}) {
  // One menu trigger on the right — the hamburger holds the user identity and
  // every nav + sign-out action. No redundant avatar dropdown.
  return (
    <div className="flex items-center justify-between gap-2 px-5 pt-3 pb-2.5">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className={cx('grid h-7 w-7 place-items-center rounded-lg font-display font-extrabold text-[13px] text-paper shrink-0', altMark ? 'bg-clay' : 'bg-forest')}>
          {leftMark}
        </div>
        <span className="font-display font-semibold text-[14px] truncate">{title}</span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {right}
        <HamburgerMenu />
      </div>
    </div>
  );
}

// Oct 9 client: "unsaved changes" guard. A screen with edits (driver Profile)
// calls setUnsavedGuard(true); the bottom tabs and this menu then ask
// "Leave without saving?" before moving away, and the browser asks on reload/close.
let unsavedGuard = false;
const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
export function setUnsavedGuard(on: boolean) {
  if (on === unsavedGuard) return;
  unsavedGuard = on;
  if (on) window.addEventListener('beforeunload', onBeforeUnload);
  else window.removeEventListener('beforeunload', onBeforeUnload);
}
/** Resolves true when it's OK to leave (nothing unsaved, or the user said leave). */
export async function confirmLeaveIfUnsaved(): Promise<boolean> {
  if (!unsavedGuard) return true;
  const ok = await uiConfirm('Leave without saving? Your changes will be lost.', { okLabel: 'Leave', cancelLabel: 'Stay' });
  if (ok) setUnsavedGuard(false);
  return ok;
}

/**
 * Slide-in drawer from the right with nav links + sign out. Lives in every
 * AppBar so the menu is always reachable.
 */
export function HamburgerMenu() {
  const [open, setOpen] = useState(false);
  const me = getUser();
  const nav = useNavigate();

  async function signOut() {
    if (!(await uiConfirm('Sign out?'))) return;
    setAuth(null, null);
    const target = import.meta.env.BASE_URL.startsWith('.') ? window.location.pathname : import.meta.env.BASE_URL;
    window.location.href = target;
  }

  const isStaff = me && (me.role === 'admin' || me.role === 'coordinator' || me.role === 'staff');
  const isSupplier = me?.role === 'supplier';

  const VOLUNTEER_LINKS = [
    { to: '/',         label: 'Home',     icon: Home },
    { to: '/pickups',  label: 'Pickups',  icon: Calendar },
    { to: '/map',      label: 'Map',      icon: MapIcon },
    { to: '/chat',     label: 'Chat',     icon: MessageSquare },
    { to: '/you',      label: 'My Activity', icon: User },
    { to: '/profile',  label: 'My Profile',  icon: User },
    { to: '/settings', label: 'Settings',    icon: SettingsIcon },   // Oct 14 client: how we reach you, pause, quiet times
    { to: '/application', label: 'My application', icon: FileText }, // Oct 14 client: sign-up answers
  ];
  const SUPPLIER_LINKS = [
    // Oct 8 client: My Pickups is its own page (it used to be the home screen,
    // so tapping it looked like nothing happened).
    { to: '/',        label: 'Home',       icon: Home },
    { to: '/my-pickups', label: 'My Pickups', icon: Calendar },
    { to: '/post',    label: 'Post a Pickup', icon: Home },
    { to: '/profile', label: 'Edit Store Info', icon: User },
  ];
  const links = isSupplier ? SUPPLIER_LINKS : VOLUNTEER_LINKS;

  return (
    <>
      <button onClick={() => setOpen(true)}
              // Oct 9 client: 44px tap target for older drivers.
              className="haptic grid h-[44px] w-[44px] place-items-center rounded-full border border-line bg-paper hover:bg-cream" /* Oct 14 client: real 44px */
              aria-label="Menu">
        <Menu size={20} />
      </button>

      <AnimatePresence>
        {open && (
          <>
            {/* z-index high enough to sit above Leaflet's panes (200-700) and
                control container (~800). Without this, the map and its zoom
                buttons would render on top of the drawer. */}
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-[2000] bg-ink/50" />
            <motion.aside
              initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 320 }}
              className="fixed top-0 bottom-0 right-0 z-[2001] w-[88vw] max-w-[320px] bg-paper shadow-lift flex flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">{/* Oct 14 client: notch padding */}
              {/* Top bar */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-line">
                <div className="flex items-center gap-2">
                  <div className="grid h-8 w-8 place-items-center rounded-lg bg-forest text-paper font-display font-extrabold text-[13px]">ז</div>
                  <span className="font-display font-semibold">Menu</span>
                </div>
                <button onClick={() => setOpen(false)} aria-label="Close menu" className="haptic grid h-11 w-11 place-items-center rounded-full hover:bg-cream">
                  <X size={20} />
                </button>
              </div>

              {/* User card */}
              {me && (
                <div className="px-4 py-3 flex items-center gap-3 border-b border-line bg-cream/40">
                  <div className="grid h-10 w-10 place-items-center rounded-full text-paper font-bold text-[13px]"
                       style={{ background: 'linear-gradient(135deg,#3a7350,#2C5A3B)' }}>
                    {(me.firstName?.[0] ?? '') + (me.lastName?.[0] ?? '')}
                  </div>
                  <div className="min-w-0">
                    <div className="font-bold text-[14px] truncate">{me.firstName} {me.lastName}</div>
                    <div className="text-[11.5px] text-muted capitalize">{me.role}</div>
                  </div>
                </div>
              )}

              {/* Links */}
              <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
                {/* Oct 9 client: 16px text, 48px rows; asks before leaving unsaved edits. */}
                {!isStaff && links.map((l) => (
                  <Link key={l.to} to={l.to}
                        onClick={async (e) => {
                          e.preventDefault();
                          if (!(await confirmLeaveIfUnsaved())) return;
                          setOpen(false); nav(l.to);
                        }}
                        className="flex items-center gap-3 px-3 min-h-[48px] rounded-[10px] text-[16px] font-bold text-ink hover:bg-cream haptic">
                    <l.icon size={20} className="text-forest" />
                    {l.label}
                  </Link>
                ))}
                {isStaff && (
                  <button onClick={() => { setOpen(false); nav('/'); }}
                          className="w-full flex items-center gap-3 px-3 min-h-[48px] rounded-[10px] text-[16px] font-bold text-ink hover:bg-cream haptic">
                    <Home size={20} className="text-forest" /> Live Board
                  </button>
                )}

                <div className="border-t border-line my-2" />

                <a href="mailto:office@zehlzeh.org?subject=Feedback"
                   className="flex items-center gap-3 px-3 min-h-[48px] rounded-[10px] text-[16px] font-bold text-ink hover:bg-cream haptic">
                  <Mail size={20} className="text-muted" /> Send feedback
                </a>
              </nav>

              {/* Sign out */}
              <button onClick={signOut}
                      className="flex items-center gap-3 px-4 min-h-[52px] border-t border-line text-[16px] font-bold text-clay hover:bg-cream haptic">
                <LogOut size={20} /> Sign out
              </button>
              <div className="px-4 pb-3 text-[10.5px] text-muted">Zeh L'Zeh Rescue v1.0</div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

/**
 * Tappable avatar — opens a small popover with the user's name/role and a
 * Sign out action. Lives in every AppBar so logout is one tap away from any
 * screen. Pass `initials` to override; otherwise defaults to logged-in user.
 */
export function Avatar({ initials, size = 30 }: { initials?: string; size?: number }) {
  const me = getUser();
  const fallback = initials ?? (((me?.firstName?.[0] ?? '') + (me?.lastName?.[0] ?? '')) || '?');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: Event) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener('pointerdown', onDoc, true);
    document.addEventListener('mousedown', onDoc, true);
    document.addEventListener('touchstart', onDoc, true);
    return () => {
      document.removeEventListener('pointerdown', onDoc, true);
      document.removeEventListener('mousedown', onDoc, true);
      document.removeEventListener('touchstart', onDoc, true);
    };
  }, [open]);

  async function signOut() {
    if (!(await uiConfirm('Sign out?'))) return;
    setAuth(null, null);
    // After clearing, hard-reload so the React tree resets to the Login screen.
    // BASE_URL is '/rescue/' on web and './' inside Capacitor — for cap we
    // just reload the same URL, which is index.html in the WebView.
    const target = import.meta.env.BASE_URL.startsWith('.') ? window.location.pathname : import.meta.env.BASE_URL;
    window.location.href = target;
  }

  return (
    <div ref={ref} className="relative inline-block">
      <button onClick={() => setOpen((v) => !v)}
              // Oct 14 client: bigger invisible tap area (the circle stays small).
              className="haptic relative inline-grid place-items-center rounded-full text-paper font-bold ring-2 ring-paper shadow-[0_0_0_1px_#EAE3D4] before:content-[''] before:absolute before:-inset-[7px]"
              style={{ width: size, height: size, fontSize: size * 0.4, background: 'linear-gradient(135deg,#3a7350,#2C5A3B)' }}
              aria-label="Account menu">
        {fallback.slice(0, 2).toUpperCase()}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.96 }}
            transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
            className="absolute right-0 mt-2 w-[200px] z-50 surface !p-0 overflow-hidden">
            <div className="px-4 py-3 border-b border-line">
              <div className="font-bold text-[14px] truncate">{me?.firstName} {me?.lastName}</div>
              <div className="text-[11.5px] text-muted capitalize">{me?.role ?? 'guest'}</div>
            </div>
            <button onClick={signOut} className="w-full flex items-center gap-2 px-4 py-3 text-[13px] font-bold text-clay hover:bg-cream haptic">
              <LogOut size={15} /> Sign out
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function ChatButton({ onClick }: { onClick?: () => void }) {
  return (
    <button onClick={onClick} className="grid place-items-center h-[30px] w-[30px] rounded-[9px] border border-line text-muted haptic">
      <Mail size={15} />
    </button>
  );
}

// ---------------- FadeUp / Toast / Skeleton ----------------

export function FadeUp({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: [0.2, 0.7, 0.2, 1] }}
      className={className}>
      {children}
    </motion.div>
  );
}

export function Toast({ kind, msg }: { kind: 'ok' | 'err'; msg: string }) {
  return (
    <motion.div
      initial={{ y: -60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -60, opacity: 0 }}
      className={cx(
        'fixed top-3 inset-x-3 z-50 rounded-2xl px-4 py-3 text-sm font-bold shadow-card border',
        kind === 'ok' ? 'bg-sage text-forest border-sage-line' : 'bg-clay-soft text-clay border-[#EED2BF]',
      )}>{msg}</motion.div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('relative overflow-hidden rounded-2xl bg-line/60', className)}>
    <div className="absolute inset-0 -translate-x-full animate-pulse bg-gradient-to-r from-transparent via-paper/70 to-transparent" />
  </div>;
}

/** Oct 5 client: one search bar look on every page. */
export function SearchBar({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative">
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder ?? 'Search…'}
             className="w-full rounded-[12px] border border-line bg-paper pl-9 pr-9 py-2.5 text-[14px] outline-none focus:border-forest" />
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none">🔍</span>
      {value && (
        <button onClick={() => onChange('')} title="Clear search" type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 grid h-6 w-6 place-items-center rounded-full text-muted hover:bg-cream">✕</button>
      )}
    </div>
  );
}

/** Oct 5 client: every pick-from-a-list dropdown can be searched by typing.
 *  Click → type → pick. Arrow keys + Enter work too. */
export function SearchSelect<T>({ items, getKey, getLabel, getHint, onPick, placeholder, emptyText }: {
  items: T[]; getKey: (x: T) => string | number; getLabel: (x: T) => string; getHint?: (x: T) => string;
  onPick: (x: T) => void; placeholder?: string; emptyText?: string;
}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const s = q.trim().toLowerCase();
  const shown = (s ? items.filter((x) => (getLabel(x) + ' ' + (getHint?.(x) ?? '')).toLowerCase().includes(s)) : items).slice(0, 80);
  const pick = (x: T) => { onPick(x); setQ(getLabel(x)); setOpen(false); };
  return (
    <div className="relative">
      <input value={q} placeholder={placeholder ?? 'Type to search…'}
             onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
             onChange={(e) => { setQ(e.target.value); setOpen(true); setHi(0); }}
             onKeyDown={(e) => {
               if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setHi((h) => Math.min(h + 1, shown.length - 1)); }
               else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
               else if (e.key === 'Enter' && open && shown[hi]) { e.preventDefault(); pick(shown[hi]!); }
               else if (e.key === 'Escape') setOpen(false);
             }}
             className="w-full rounded-[10px] border border-line bg-paper pl-9 pr-9 py-2 text-[13px] font-normal outline-none focus:border-forest" />
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none text-[13px]">🔍</span>
      {q && <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { setQ(''); setOpen(true); }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 grid h-6 w-6 place-items-center rounded-full text-muted hover:bg-cream">✕</button>}
      {open && (
        <div className="absolute z-[2200] mt-1 w-full max-h-[260px] overflow-y-auto rounded-[12px] border border-line bg-paper shadow-lift">
          {shown.length === 0 ? <div className="px-3 py-2 text-[12.5px] text-muted">{emptyText ?? 'No matches'}</div> :
            shown.map((x, i) => (
              <button key={getKey(x)} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(x)}
                      onMouseEnter={() => setHi(i)}
                      className={`block w-full text-left px-3 py-2 ${i === hi ? 'bg-sage/50' : ''}`}>
                <div className="text-[13px] font-semibold text-ink">{getLabel(x)}</div>
                {getHint && <div className="text-[11.5px] text-muted">{getHint(x)}</div>}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

/** Oct 5: date box that doesn't scramble while typing. A controlled
 *  <input type="date"> re-rendered on every keystroke turned 2026 into
 *  272026 and broke report ranges. Only complete dates are passed up;
 *  a new value from outside (a preset button) refreshes the box. */
export function DateInput({ value, onChange, className, min, max, disabled }: {
  value: string; onChange: (v: string) => void; className?: string; min?: string; max?: string; disabled?: boolean;
}) {
  const committed = useRef(value);
  const [k, setK] = useState(0);
  useEffect(() => { if (value !== committed.current) { committed.current = value; setK((x) => x + 1); } }, [value]);
  const push = (v: string) => {
    if (v === '' || /^(19|20)\d\d-\d\d-\d\d$/.test(v)) { committed.current = v; onChange(v); }
  };
  return <input key={k} type="date" defaultValue={value} min={min} max={max} disabled={disabled} className={className}
                onChange={(e) => push(e.target.value)} onBlur={(e) => push(e.target.value)} />;
}

/** Oct 5 client: dark mode + bigger text, each person chooses (this browser). */
export function applyDisplayPrefs() {
  try {
    const el = document.documentElement;
    el.classList.toggle('dark', localStorage.getItem('zlz_dark') === '1');
    el.classList.toggle('big-text', localStorage.getItem('zlz_big_text') === '1');
  } catch { /* storage blocked — keep defaults */ }
}
export function DisplayToggles() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  const [big, setBig] = useState(() => document.documentElement.classList.contains('big-text'));
  const set = (key: string, cls: string, on: boolean) => {
    document.documentElement.classList.toggle(cls, on);
    try { localStorage.setItem(key, on ? '1' : '0'); } catch { /* fine */ }
  };
  const btn = 'haptic grid h-9 min-w-9 px-2 place-items-center rounded-full border text-[13px] font-extrabold';
  return (
    <div className="flex items-center gap-1.5">
      <button title={dark ? 'Switch to light mode' : 'Switch to dark mode'} aria-pressed={dark}
              onClick={() => { set('zlz_dark', 'dark', !dark); setDark(!dark); }}
              className={`${btn} ${dark ? 'bg-forest text-paper border-forest' : 'bg-paper text-ink border-line hover:bg-cream'}`}>
        {dark ? '☀' : '☾'}
      </button>
      <button title={big ? 'Normal text size' : 'Bigger text'} aria-pressed={big}
              onClick={() => { set('zlz_big_text', 'big-text', !big); setBig(!big); }}
              className={`${btn} ${big ? 'bg-forest text-paper border-forest' : 'bg-paper text-ink border-line hover:bg-cream'}`}>
        {big ? 'A−' : 'A+'}
      </button>
    </div>
  );
}

/** Oct 5 client: a small (i) that explains a term in one line — hover or tap. */
export function Tip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-block align-middle">
      <button type="button" aria-label="What's this?" aria-expanded={open}
              onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
              onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onBlur={() => setOpen(false)}
              className="hit40 ml-1 inline-grid h-[15px] w-[15px] place-items-center rounded-full border border-current text-[9.5px] font-bold leading-none opacity-60 hover:opacity-100">i</button>
      {open && (
        <span role="tooltip"
              className="absolute left-1/2 top-[19px] z-[2300] w-[230px] -translate-x-1/2 rounded-[10px] border border-line bg-paper px-3 py-2 text-left text-[12px] font-normal normal-case tracking-normal leading-snug text-ink shadow-lift">
          {text}
        </span>
      )}
    </span>
  );
}

/** Oct 6 client rule: every time people see is 12-hour. Turns "17:00" or
 *  "17:00:00" into "5:00 PM"; any other text is returned unchanged. */
export function to12h(v: unknown): string {
  const t = String(v ?? '');
  const m = t.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!m) return t;
  const h = Number(m[1]); if (h > 23) return t;
  return `${((h + 11) % 12) + 1}:${m[2]} ${h >= 12 ? 'PM' : 'AM'}`;
}
