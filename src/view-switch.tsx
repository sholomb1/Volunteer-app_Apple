/**
 * Oct 29 client (owner approved Yakov's idea): ONE login per person.
 * Nov 5 client: "everyone who has an admin login should have three options: switch to driver, to their admin,
 * and to dispatcher level. Dispatcher level only has two." — ONE switch in the office header, "View: Office ▾":
 *   admin / staff / coordinator: Office · Dispatcher · Driver      dispatcher login: Dispatcher · Driver
 *   Office     = the normal portal.
 *   Dispatcher = the dispatcher view (screen only, this browser tab — api.ts setDispatcherPreview); real access unchanged.
 *   Driver     = the driver app. A login that also drives (user.driverProfileId) gets its real driver app; a login
 *                with no driver profile gets a PREVIEW (empty lists, nothing saved — api.ts isDriverPreview).
 *   A yellow bar on top of the driver app: "You're seeing the driver app — Back".
 * The Driver choice is remembered on this device (localStorage); it starts as the office view.
 */
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, canPreviewDispatcher, getRealUser, getToken, isDispatcherPreview, setAuth, setDispatcherPreview, type AuthUser } from './api';

export type ViewMode = 'office' | 'driver';
const OFFICE_ROLES = ['admin', 'staff', 'coordinator', 'dispatcher'];
const KEY = 'zlz_view_mode'; // same key as api.ts isDriverPreview
const EVENT = 'zlz-view-mode';

/** Same rule as the API (driver-link.ts canSwitchViews): an office login that also drives. */
export function canSwitchViews(user: Pick<AuthUser, 'role' | 'driverProfileId'> | null | undefined): boolean {
  return !!user && OFFICE_ROLES.includes(String(user.role ?? '').toLowerCase()) && Number(user.driverProfileId ?? 0) > 0;
}
/** Nov 5 client: every office / dispatcher login can open the driver app (a preview if it has no driver profile). */
export function canOpenDriverView(user: Pick<AuthUser, 'role'> | null | undefined): boolean {
  return !!user && OFFICE_ROLES.includes(String(user.role ?? '').toLowerCase());
}

/** The chosen view on this device, for this login (default: office). */
export function getViewMode(userId?: number | null): ViewMode {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return 'office';
    const o = JSON.parse(raw) as { uid?: number; view?: string };
    return o.view === 'driver' && (userId == null || Number(o.uid) === Number(userId)) ? 'driver' : 'office';
  } catch { return 'office'; }
}
export function setViewMode(userId: number, view: ViewMode) {
  try { localStorage.setItem(KEY, JSON.stringify({ uid: userId, view })); } catch { /* private mode: this visit only */ }
  window.dispatchEvent(new Event(EVENT));
}

/** Re-renders when the view is switched. */
export function useViewMode(userId?: number | null): ViewMode {
  const [v, setV] = useState<ViewMode>(() => getViewMode(userId));
  useEffect(() => {
    const on = () => setV(getViewMode(userId));
    on();
    window.addEventListener(EVENT, on);
    window.addEventListener('storage', on);
    return () => { window.removeEventListener(EVENT, on); window.removeEventListener('storage', on); };
  }, [userId]);
  return v;
}

/**
 * Keeps user.driverProfileId fresh for an office login (a session from before this change has none,
 * and the office may link / unlink a driver). One small /auth/me call, cached 5 minutes.
 * Nov 5 client: no driver profile no longer sends the login back to the office view — Driver is then the preview.
 */
export function useDriverLink(user: AuthUser | null): number | null {
  const office = !!user && OFFICE_ROLES.includes(String(user.role ?? '').toLowerCase());
  const q = useQuery({
    queryKey: ['auth-me-driver-link', user?.id ?? null],
    queryFn: () => api<{ user: AuthUser }>('/api/auth/me'),
    enabled: office, staleTime: 5 * 60_000, retry: 0,
  });
  const fresh = q.data?.user ? (q.data.user.driverProfileId ?? null) : undefined;
  useEffect(() => {
    if (fresh === undefined) return;
    const cur = getRealUser(); // Nov 4: not the dispatcher preview (it must never be saved)
    if (cur && (cur.driverProfileId ?? null) !== fresh) setAuth(getToken(), { ...cur, driverProfileId: fresh });
  }, [fresh]);
  return fresh === undefined ? (user?.driverProfileId ?? null) : fresh;
}

const pill = 'haptic inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-[12.5px] font-bold shadow-ctag';

type Choice = 'office' | 'dispatcher' | 'driver';
const CHOICES: Record<Choice, { icon: string; label: string; hint: string }> = {
  office:     { icon: '🏢', label: 'Office',     hint: 'Everything, with your own access' },
  dispatcher: { icon: '🎧', label: 'Dispatcher', hint: 'What a dispatcher sees' },
  driver:     { icon: '🚗', label: 'Driver',     hint: 'The driver app' },
};

/** Nov 5 client: office header — ONE "View: Office ▾" switch (was "🚗 Driver view" + "🎧 Dispatcher view"). */
export function ViewSwitch() {
  const real = getRealUser();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close); };
  }, [open]);
  if (!real || !canOpenDriverView(real)) return null;
  const office = canPreviewDispatcher(real); // admin / staff / coordinator
  const current: Choice = office && !isDispatcherPreview(real) ? 'office' : 'dispatcher';
  const choices: Choice[] = office ? ['office', 'dispatcher', 'driver'] : ['dispatcher', 'driver'];
  const pick = (c: Choice) => {
    setOpen(false);
    if (c === current) return;
    if (c === 'driver') { setViewMode(real.id, 'driver'); window.scrollTo(0, 0); return; }
    setDispatcherPreview(c === 'dispatcher'); // reloads the page
  };
  return (
    <div ref={box} className="relative">
      <button type="button" data-testid="view-switch" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}
              title="Switch between the office, dispatcher and driver views"
              className={`${pill} border-forest/40 bg-paper text-forest hover:bg-sage/60`}>
        <span aria-hidden>{CHOICES[current].icon}</span> View: {CHOICES[current].label} <span aria-hidden className="text-[10px]">▾</span>
      </button>
      {open && (
        <div role="menu" data-testid="view-switch-menu"
             className="absolute right-0 top-[calc(100%+6px)] z-50 w-[240px] rounded-[14px] border border-line bg-paper p-1.5 shadow-lift">
          {choices.map((c) => (
            <button key={c} type="button" role="menuitemradio" aria-checked={c === current} data-testid={`view-${c}`} onClick={() => pick(c)}
                    className={`w-full flex items-start gap-2.5 rounded-[10px] px-3 py-2 text-left hover:bg-cream ${c === current ? 'bg-sage/60' : ''}`}>
              <span aria-hidden className="text-[16px] leading-5">{CHOICES[c].icon}</span>
              <span className="flex-1">
                <span className="block text-[13.5px] font-bold text-ink">{CHOICES[c].label}{c === current ? ' ✓' : ''}</span>
                <span className="block text-[11.5px] text-muted">{CHOICES[c].hint}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Nov 4 Yakov: the banner at the top while the dispatcher view is on. */
export function DispatcherPreviewBanner() {
  if (!isDispatcherPreview()) return null;
  return (
    <div data-dispatcher-preview className="shrink-0 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-amber/50 bg-amber-soft px-3 py-2 text-center">
      <span className="text-[13px] font-bold text-ink">🎧 You're seeing the dispatcher view</span>
      <span className="text-[12px] text-muted">(what a dispatcher sees; your own access is unchanged)</span>
      <button type="button" data-testid="leave-dispatcher-preview" onClick={() => setDispatcherPreview(false)}
              className={`${pill} border-forest bg-forest text-paper`}>
        Back to office view
      </button>
    </div>
  );
}

/** Nov 5 client: the yellow bar on top of the driver app — "You're seeing the driver app — Back".
 *  `preview` = this login has no driver profile (empty lists, nothing saved). */
export function DriverViewBar({ user, preview }: { user: AuthUser; preview: boolean }) {
  const back = String(user.role).toLowerCase() === 'dispatcher' ? 'Back to dispatcher view' : 'Back to office view';
  return (
    <div data-driver-view-bar className="shrink-0 border-b border-amber/50 bg-amber-soft px-3 py-1.5"
         style={{ paddingTop: 'max(6px, env(safe-area-inset-top))' }}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-bold text-ink">🚗 You're seeing the driver app</span>
        <button type="button" data-testid="switch-to-office" onClick={() => setViewMode(user.id, 'office')}
                className={`${pill} border-forest bg-forest text-paper`}>
          {back}
        </button>
      </div>
      {preview && (
        <div className="mt-1 text-[12px] leading-snug text-ink/80" data-driver-preview>
          You don't have a driver profile — this is how the driver app looks. Lists are empty and nothing you tap is saved.
        </div>
      )}
    </div>
  );
}
