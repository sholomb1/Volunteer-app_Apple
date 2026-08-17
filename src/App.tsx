import { useState, useEffect } from 'react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { getUser, kioskDevice, appVersion, type AuthUser } from './api';
import { useLocation, useNavigate } from 'react-router-dom';
import { ensureNativePushRegistered } from './native-push-client';
import { ensureWebPushSubscribed } from './web-push-client';
import { Login } from './screens/Login';
import { VolunteerHome } from './screens/VolunteerHome';
import { SupplierHome } from './screens/SupplierHome';
import { SupplierPost } from './screens/SupplierPost';
import { SupplierProfile } from './screens/SupplierProfile';
import { VolunteerProfile } from './screens/VolunteerProfile';
import { PickupsFeed } from './screens/PickupsFeed';
import { PickupDetail } from './screens/PickupDetail';
import { TripCapture } from './screens/TripCapture';
import { MapView } from './screens/MapView';
import { Chat } from './screens/Chat';
import { Activity } from './screens/Activity';
import { CoordinatorPortal } from './screens/CoordinatorPortal';
import { AdminPickupDetail } from './screens/AdminPickupDetail';
import { VolunteerRegistration } from './screens/VolunteerRegistration';
import { SupplierRegistration } from './screens/SupplierRegistration';
import { OneTimePickupRegistration } from './screens/OneTimePickupRegistration';
import { SteadyPickupRegistration } from './screens/SteadyPickupRegistration';
import { DropoffStandalone } from './screens/DropoffStandalone';
import { KioskApp } from './kiosk/KioskApp';
import { BottomNav } from './nav';

const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 } } });
// BASE_URL is '/rescue/' for the web build and './' for the Capacitor build.
// BrowserRouter wants a real path like '/rescue' or '/' — '.' from `./` blanks the screen.
const RAW_BASE = import.meta.env.BASE_URL.replace(/\/$/, '');
const BASENAME = RAW_BASE && RAW_BASE !== '.' ? RAW_BASE : '/';

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <BrowserRouter basename={BASENAME}>
        <UpdateGate>
          <Root />
        </UpdateGate>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

// C12 Aug 13 — installed-APK version check. Reads GET /api/app/version and:
//   • hard-gates the whole app when installed versionCode < minSupported
//   • shows a dismissible "Update Available" banner when < latest
// Web PWA doesn't hit this gate (it self-refreshes via portal_reload_epoch).
function UpdateGate({ children }: { children: React.ReactNode }) {
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try { return sessionStorage.getItem('zlz_update_banner_dismissed') === '1'; } catch { return false; }
  });
  const isNative = (() => {
    const cap = (window as any).Capacitor;
    return cap?.isNativePlatform?.() === true;
  })();
  const q = useQuery({
    queryKey: ['app-version'],
    queryFn: appVersion.get,
    enabled: isNative,
    staleTime: 5 * 60_000,
    retry: 0,
  });
  const installed = Number(__APP_VERSION_CODE__ || 0);
  const latest    = q.data?.data.android.latestVersionCode ?? null;
  const minSup    = q.data?.data.android.minSupportedVersionCode ?? null;
  const playUrl   = q.data?.data.android.playStoreUrl ?? 'https://play.google.com/store';

  const mustUpdate = isNative && minSup != null && installed > 0 && installed < minSup;
  const wantUpdate = isNative && latest != null && installed > 0 && installed < latest;

  if (mustUpdate) {
    return (
      <div className="min-h-screen bg-cream grid place-items-center px-6">
        <div className="max-w-[420px] w-full bg-paper border border-line rounded-[18px] shadow-lift p-6 text-center">
          <div className="text-[13px] uppercase tracking-[.15em] font-extrabold text-clay">Update required</div>
          <div className="mt-2 text-[24px] font-extrabold text-ink font-display">Please update Zeh L'Zeh</div>
          <p className="text-[14px] text-muted mt-3 leading-snug">
            Your app version ({__APP_VERSION_NAME__}) is no longer supported. Install the latest version to continue.
          </p>
          <a href={playUrl} target="_blank" rel="noopener noreferrer"
             className="mt-5 inline-flex justify-center w-full bg-forest text-paper font-extrabold text-[16px] py-3 rounded-full active:scale-95">
            Open Play Store to update
          </a>
        </div>
      </div>
    );
  }

  return (
    <>
      {wantUpdate && !dismissed && (
        <div className="fixed top-0 left-0 right-0 z-[8000] bg-forest text-paper text-[13.5px] font-bold px-3 py-2 flex items-center gap-2 shadow-lift">
          <span className="flex-1">🔄 Update available for Zeh L'Zeh — tap to get the latest.</span>
          <a href={playUrl} target="_blank" rel="noopener noreferrer"
             className="bg-paper text-forest font-extrabold px-3 py-1 rounded-full text-[12.5px]">Update</a>
          <button onClick={() => { setDismissed(true); try { sessionStorage.setItem('zlz_update_banner_dismissed', '1'); } catch { /* fine */ } }}
                  className="text-paper/80 px-2 text-[16px]" aria-label="Dismiss">×</button>
        </div>
      )}
      {children}
    </>
  );
}

function Root() {
  // Device-scoped kiosk mode: if this device has been flipped into kiosk
  // mode (via Settings → Kiosk mode on this device), every path except the
  // kiosk itself redirects to /kiosk/<secret>. Cleared via the 5-tap
  // escape gesture in KioskApp or the "Turn off" button in Settings.
  const location = useLocation();
  const nav = useNavigate();
  useEffect(() => {
    const secret = kioskDevice.getSecret();
    if (!secret) return;
    if (location.pathname.startsWith('/kiosk/')) return;
    nav(`/kiosk/${secret}`, { replace: true });
  }, [location.pathname, nav]);

  return (
    <Routes>
      {/* Public sign-up questionnaires — no login required. */}
      <Route path="/vol-registration" element={<VolunteerRegistration />} />
      <Route path="/sup-registration" element={<SupplierRegistration />} />
      <Route path="/one-time-pickup"  element={<OneTimePickupRegistration />} />
      <Route path="/steady-pickup"    element={<SteadyPickupRegistration />} />
      {/* Standalone driver drop-off + label print. Login-required but
          deliberately bypasses the regular volunteer app shell — drivers see
          only this form, no bottom nav, no other screens. */}
      <Route path="/dropoff/*" element={<DropoffStandalone />} />
      {/* Unauthenticated kiosk at 3 Regina. Secret in URL gates the API.
          MUST be above AuthedApp so login doesn't wrap it. */}
      <Route path="/kiosk/:secret" element={<KioskApp />} />
      <Route path="*" element={<AuthedApp />} />
    </Routes>
  );
}

function AuthedApp() {
  const [user, setUser] = useState<AuthUser | null>(() => getUser());

  // Register for push whenever we have an authenticated user — on a fresh login
  // AND on app startup with a persisted session. This is what actually triggers
  // the Android notification-permission prompt (requestPermissions) and posts
  // the FCM token to /me/device; without it, a returning user is never asked
  // and never registers. Idempotent + best-effort.
  useEffect(() => {
    if (!user) return;
    void (async () => {
      try {
        const cap = (window as any).Capacitor;
        if (cap?.isNativePlatform?.() === true) {
          await ensureNativePushRegistered();
        } else {
          await ensureWebPushSubscribed();
        }
      } catch { /* best-effort */ }
    })();
  }, [user]);

  if (!user) return <Login onAuthed={setUser} />;

  // Admins / coordinators land in the dispatch portal on desktop.
  if (user.role === 'admin' || user.role === 'coordinator' || user.role === 'staff') {
    return (
      <Routes>
        <Route path="/"                 element={<CoordinatorPortal />} />
        <Route path="/admin/pickup/:id" element={<AdminPickupDetail />} />
        <Route path="/pickup/:mode/:id" element={<PickupDetail />} />
        <Route path="*"                 element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  // Suppliers
  if (user.role === 'supplier') {
    return (
      <PhoneFrame>
        <div className="flex-1 min-h-0 overflow-y-auto">
          <Routes>
            <Route path="/"     element={<SupplierHome user={user} />} />
            <Route path="/post" element={<SupplierPost user={user} />} />
            <Route path="/pickups/:id/edit" element={<SupplierPost user={user} />} />
            <Route path="/profile" element={<SupplierProfile />} />
            <Route path="*"     element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </PhoneFrame>
    );
  }

  // Volunteer
  return (
    <PhoneFrame>
      <div className="flex-1 min-h-0 overflow-y-auto">
        <Routes>
          <Route path="/"                 element={<VolunteerHome user={user} />} />
          <Route path="/pickups"          element={<PickupsFeed />} />
          <Route path="/map"              element={<MapView />} />
          <Route path="/chat"             element={<Chat />} />
          <Route path="/you"              element={<Activity user={user} />} />
          <Route path="/profile"          element={<VolunteerProfile />} />
          <Route path="/pickup/:mode/:id" element={<PickupDetail />} />
          <Route path="/trip/:id"         element={<TripCapture />} />
          <Route path="*"                 element={<Navigate to="/" replace />} />
        </Routes>
      </div>
      <BottomNav />
    </PhoneFrame>
  );
}

/**
 * Constrain the volunteer/supplier mobile UI to a phone-width column when
 * viewed on a wider screen. On narrow viewports it's edge-to-edge as before;
 * on desktop it sits centered inside a soft "phone" so the layout stays
 * mobile-first rather than stretching into a malformed wide layout.
 */
function PhoneFrame({ children }: { children: React.ReactNode }) {
  // Fixed-height column on mobile (full viewport) and on desktop (820px
  // phone-shaped card). Internal overflow is hidden so the AppBar + Routes
  // (scrollable middle) + BottomNav layout works deterministically — the
  // bottom nav is always pinned to the bottom of this frame, never pushed
  // off-screen by tall content.
  return (
    <div className="md:py-6 md:min-h-screen">
      <div className="md:max-w-[440px] md:mx-auto md:rounded-[28px] md:bg-paper md:shadow-lift md:border md:border-line md:h-[820px] h-[100dvh] relative flex flex-col overflow-hidden">
        {children}
      </div>
    </div>
  );
}
