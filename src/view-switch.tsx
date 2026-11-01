/**
 * Oct 29 client (owner approved Yakov's idea): ONE login per person.
 * A login with an office role (dispatcher, admin, staff, coordinator) that is also a driver
 * (the API says so: user.driverProfileId) can switch between the office portal and the driver app:
 *   office portal header: "🚗 Driver view"     driver app top: "🧭 Dispatcher view"
 * The choice is remembered on this device (localStorage) and starts as the office view.
 * Nothing else changes: the office view keeps the login's dispatcher rules / page access.
 */
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, getToken, getUser, setAuth, type AuthUser } from './api';

export type ViewMode = 'office' | 'driver';
const OFFICE_ROLES = ['admin', 'staff', 'coordinator', 'dispatcher'];
const KEY = 'zlz_view_mode';
const EVENT = 'zlz-view-mode';

/** Same rule as the API (driver-link.ts canSwitchViews). */
export function canSwitchViews(user: Pick<AuthUser, 'role' | 'driverProfileId'> | null | undefined): boolean {
  return !!user && OFFICE_ROLES.includes(String(user.role ?? '').toLowerCase()) && Number(user.driverProfileId ?? 0) > 0;
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
    const cur = getUser();
    if (cur && (cur.driverProfileId ?? null) !== fresh) setAuth(getToken(), { ...cur, driverProfileId: fresh });
    if (fresh == null && cur && getViewMode(cur.id) === 'driver') setViewMode(cur.id, 'office');
  }, [fresh]);
  return fresh === undefined ? (user?.driverProfileId ?? null) : fresh;
}

const pill = 'haptic inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-[12.5px] font-bold shadow-ctag';

/** Office portal header: "🚗 Driver view" (only for a login that also drives). */
export function DriverViewSwitch() {
  const user = getUser();
  const driverId = useDriverLink(user);
  if (!user || !canSwitchViews({ role: user.role, driverProfileId: driverId })) return null;
  return (
    <button type="button" data-testid="switch-to-driver" title="Open the driver app with this same login"
            onClick={() => { setViewMode(user.id, 'driver'); window.scrollTo(0, 0); }}
            className={`${pill} border-forest/40 bg-paper text-forest hover:bg-sage/60`}>
      <span aria-hidden>🚗</span> Driver view
    </button>
  );
}

/** Driver app, top: "🧭 Dispatcher view" (back to the office portal). */
export function DispatcherViewBar({ user }: { user: AuthUser }) {
  const label = String(user.role).toLowerCase() === 'dispatcher' ? 'Dispatcher view' : 'Office view';
  return (
    <div className="shrink-0 flex items-center justify-between gap-2 border-b border-line bg-sage-soft/60 px-3 py-1.5"
         style={{ paddingTop: 'max(6px, env(safe-area-inset-top))' }}>
      <span className="text-[12px] font-semibold text-forest-deep">Driver app · same login</span>
      <button type="button" data-testid="switch-to-office" onClick={() => setViewMode(user.id, 'office')}
              className={`${pill} border-forest bg-forest text-paper`}>
        <span aria-hidden>🧭</span> {label}
      </button>
    </div>
  );
}
