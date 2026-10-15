import { useState, useEffect, Suspense } from 'react';
import { lazyNamed } from './lazy-load'; // Oct 11 client: speed — big screens load when opened
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { getUser, kioskDevice, appVersion, volunteer as volunteerApi, type AuthUser } from './api';
import { useLocation } from 'react-router-dom';
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
import { Chat } from './screens/Chat';
import { Activity } from './screens/Activity';
import { DriverSettings } from './screens/DriverSettings'; // Oct 14 client
import { kioskMode, isKioskPath, useKioskModeEscapeGuard } from './kiosk/kiosk-mode';
import { BottomNav } from './nav';
import { SandboxPill } from './sandbox-pill';
import { FilterBlockedBanner } from './filter-banner'; // Oct 11 client: internet-filter banner
import { fetchRemoteAppVersion, storeUpdateDue, noteNewerVersion, decideUpdatePopup, getLaterUntil, snoozeUpdatePopup } from './app-version-check'; // Oct 14 client
import { UpdatePopup } from './update-popup'; // Oct 14 client: update pop-up

// Oct 11 client: speed — loaded only when opened (was one 1.6 MB bundle).
const AcceptInvite              = lazyNamed(() => import('./staff-invite'), 'AcceptInvite');
const MapView                   = lazyNamed(() => import('./screens/MapView'), 'MapView');
const CoordinatorPortal         = lazyNamed(() => import('./screens/CoordinatorPortal'), 'CoordinatorPortal');
const AdminPickupDetail         = lazyNamed(() => import('./screens/AdminPickupDetail'), 'AdminPickupDetail');
const TestBroadcastsPage        = lazyNamed(() => import('./portal-sections'), 'TestBroadcastsPage');
const VolunteerRegistration     = lazyNamed(() => import('./screens/VolunteerRegistration'), 'VolunteerRegistration');
const SupplierRegistration      = lazyNamed(() => import('./screens/SupplierRegistration'), 'SupplierRegistration');
const OneTimePickupRegistration = lazyNamed(() => import('./screens/OneTimePickupRegistration'), 'OneTimePickupRegistration');
const SteadyPickupRegistration  = lazyNamed(() => import('./screens/SteadyPickupRegistration'), 'SteadyPickupRegistration');
const MyApplication             = lazyNamed(() => import('./screens/MyApplication'), 'MyApplication'); // Oct 14 client: uses the sign-up form
const KioskApp                  = lazyNamed(() => import('./kiosk/KioskApp'), 'KioskApp');
// Oct 11 client: speed — warm up the office portal file: right away for a
// signed-in office user, or while the login form shows on a wide (office) screen.
try {
  const u = getUser();
  const office = !!u && ['admin', 'coordinator', 'staff', 'dispatcher', 'viewer'].includes(String(u.role));
  const warm = () => { void CoordinatorPortal.preload(); };
  if (office) warm();
  else if (!u && window.matchMedia?.('(min-width: 1024px)').matches) {
    const ric = (window as any).requestIdleCallback as undefined | ((cb: () => void, o?: { timeout: number }) => void);
    if (ric) ric(warm, { timeout: 3000 }); else setTimeout(warm, 1500);
  }
} catch { /* no window */ }
// Plain page background while a screen's file loads (no text → no flash).
const ScreenLoading = () => <div className="min-h-screen bg-cream" aria-busy="true" />;

// Oct 11 client: speed — retry once only for network / server (5xx) errors; a
// 4xx (404, 403…) or a filter block won't change on retry (was +1s each).
// Polling already pauses in hidden tabs (react-query default); only the office
// alerts bell keeps polling there on purpose (beep while on another tab).
const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false,
  retry: (failureCount, err: any) => {
    if (err?.filterBlocked) return false;
    const s = Number(err?.status ?? 0);
    if (s >= 400 && s < 500) return false;
    return failureCount < 1;
  } } } });
// BASE_URL is '/rescue/' for the web build and './' for the Capacitor build.
// BrowserRouter wants a real path like '/rescue' or '/' — '.' from `./` blanks the screen.
const RAW_BASE = import.meta.env.BASE_URL.replace(/\/$/, '');
const BASENAME = RAW_BASE && RAW_BASE !== '.' ? RAW_BASE : '/';

export default function App() {
  // Oct 11 client: kiosk mode ON → Back / page restore / tab return to any
  // non-kiosk page goes straight back to the kiosk (outside the router).
  useKioskModeEscapeGuard();
  return (
    <QueryClientProvider client={qc}>
      <FilterBlockedBanner />
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
  const cap = (window as any).Capacitor;
  const isNative = cap?.isNativePlatform?.() === true;
  // abc868 (Aug 17): the C12 update-gate compares __APP_VERSION_CODE__
  // (baked from Android's build.gradle versionCode) against the Android
  // minSupportedVersionCode returned by /app-version. That mapping is
  // Android-only — an iOS build carries the same baked versionCode but
  // its own separate release track, so on iOS the compare is meaningless
  // AND the "Open Play Store" CTA is wrong. TestFlight / App Store
  // already prompt iOS users to update, so skip the gate on iOS entirely.
  const isIOS = cap?.getPlatform?.() === 'ios';
  const isAndroidNative = isNative && !isIOS;
  const q = useQuery({
    queryKey: ['app-version'],
    queryFn: appVersion.get,
    // Oct 14 client: iPhone too, for app_min_version_code / ios_app_store_url
    // (the android_* numbers below are still used on Android only).
    enabled: isNative,
    staleTime: 5 * 60_000,
    retry: 0,
  });
  const installed = Number(__APP_VERSION_CODE__ || 0);
  const latest    = q.data?.data.android.latestVersionCode ?? null;
  const minSup    = q.data?.data.android.minSupportedVersionCode ?? null;
  const playUrl   = q.data?.data.android.playStoreUrl ?? 'https://play.google.com/store';
  // Oct 14 client: the phone app (Android + iPhone) also reads the live site's
  // /rescue/version.json. Once it has been newer than this app for 3+ days (time
  // for the stores to approve the new build), the "update" banner shows.
  const remote = useQuery({
    queryKey: ['remote-version-json'],
    queryFn: fetchRemoteAppVersion,
    enabled: isNative,
    staleTime: 30 * 60_000,
    retry: 0,
  });
  const remoteDue = isNative && remote.isSuccess && storeUpdateDue(installed, remote.data?.versionCode ?? null);

  // Oct 14 client: "New version available" pop-up, checked on app start and each
  // time the app comes back to the front (not in the middle of using it).
  const [resumeTick, setResumeTick] = useState(0);
  const [closedTick, setClosedTick] = useState(-1);
  const [laterUntil, setLaterUntil] = useState<number | null>(() => getLaterUntil());
  useEffect(() => {
    if (!isNative) return;
    const onVis = () => {
      if (document.visibilityState !== 'visible') return;
      setResumeTick((t) => t + 1);
      void remote.refetch(); void q.refetch();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNative]);
  const remoteCode = remote.isSuccess ? (remote.data?.versionCode ?? null) : null;
  const popup = isNative ? decideUpdatePopup({
    installed,
    isAndroid: isAndroidNative,
    remoteCode,
    firstSeenAt: remote.isSuccess ? noteNewerVersion(installed, remoteCode) : null,
    latestAndroid: isAndroidNative ? latest : null,
    appMin: q.data?.data.app?.minVersionCode ?? null,
    laterUntil,
    now: Date.now(),
  }) : 'none';
  const showPopup = popup === 'force' || (popup === 'ask' && closedTick !== resumeTick);

  const mustUpdate = isAndroidNative && minSup != null && installed > 0 && installed < minSup;
  const wantUpdate = (isAndroidNative && latest != null && installed > 0 && installed < latest) || remoteDue;

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
      {showPopup && (
        <UpdatePopup state={popup} isIOS={isIOS} iosStoreUrl={q.data?.data.app?.iosAppStoreUrl ?? null}
                     onLater={() => setLaterUntil(snoozeUpdatePopup())}
                     onClose={() => setClosedTick(resumeTick)} />
      )}
      {wantUpdate && !dismissed && (
        <div className="fixed top-0 left-0 right-0 z-[8000] bg-forest text-paper text-[13.5px] font-bold px-3 py-2 flex items-center gap-2 shadow-lift"
             style={{ paddingTop: 'max(8px, env(safe-area-inset-top))' }}>{/* Oct 14 client: notch */}
          {/* Oct 14 client: iPhone has no Play link -- point to the App Store in words. */}
          <span className="flex-1">{isIOS ? '🔄 A new version of Zeh L\'Zeh is available — update it in the App Store.' : '🔄 Update available for Zeh L\'Zeh — tap to get the latest.'}</span>
          {!isIOS && <a href={playUrl} target="_blank" rel="noopener noreferrer"
             className="bg-paper text-forest font-extrabold px-3 py-1 rounded-full text-[12.5px]">Update</a>}
          <button onClick={() => { setDismissed(true); try { sessionStorage.setItem('zlz_update_banner_dismissed', '1'); } catch { /* fine */ } }}
                  className="text-paper/80 px-2 text-[16px]" aria-label="Dismiss">×</button>
        </div>
      )}
      {children}
    </>
  );
}

// Oct 11 client: ONE-TIME MIGRATION. Tablets that still have the old Settings
// switch ("Make this device a permanent kiosk", localStorage zlz_kiosk_secret)
// are moved to the new PIN kiosk mode: start kiosk mode with that secret, drop
// the old switch, and go to the kiosk. They keep booting to the kiosk; exit is
// now 🔒 + kiosk PIN. Runs once at app start (the old key is gone afterwards).
function migrateOldKioskSwitch() {
  try {
    const secret = kioskDevice.getSecret();
    if (!secret) return;
    if (!kioskMode.isOn()) {
      const url = kioskMode.url({ on: 1, startedAt: Date.now(), secret }) || `/kiosk/${encodeURIComponent(secret)}`;
      kioskMode.start(secret, url);
      kioskDevice.clear();
      if (!isKioskPath(window.location.pathname)) window.location.replace(url);
      return;
    }
    kioskDevice.clear();   // kiosk mode already on: the old switch is just leftover
  } catch { /* storage blocked: nothing to migrate */ }
}
migrateOldKioskSwitch();

function Root() {
  // Oct 11 client: the old device-scoped kiosk redirect is gone; tablets that
  // had the old switch are moved to kiosk mode by migrateOldKioskSwitch().
  const location = useLocation();

  // Oct 11 client: kiosk mode (started on the kiosk page with the PIN) — any
  // other address on the site (reload, typed URL, link) goes straight back to
  // the kiosk, before anything else renders. Only the kiosk PIN turns it off.
  const km = kioskMode.get();
  if (km && !location.pathname.startsWith('/kiosk/')) {
    return <Navigate to={`/kiosk/${km.secret}`} replace />;
  }

  return (
    <Suspense fallback={<ScreenLoading />}>{/* Oct 11 client: speed — lazy screens */}
    <Routes>
      {/* Public sign-up questionnaires — no login required. */}
      <Route path="/invite/:token" element={<AcceptInvite />} />
      <Route path="/welcome/:token" element={<AcceptInvite />} />
      <Route path="/vol-registration" element={<VolunteerRegistration />} />
      <Route path="/sup-registration" element={<SupplierRegistration />} />
      <Route path="/one-time-pickup"  element={<OneTimePickupRegistration />} />
      <Route path="/steady-pickup"    element={<SteadyPickupRegistration />} />
      {/* Unauthenticated kiosk at 3 Regina. Secret in URL gates the API.
          MUST be above AuthedApp so login doesn't wrap it. */}
      <Route path="/kiosk/:secret" element={<KioskApp />} />
      <Route path="*" element={<AuthedApp />} />
    </Routes>
    </Suspense>
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

  // Client Aug 18: mobile-app usage tracking. Ping on every foreground so
  // the office sees who is actually using the app (vs. only SMS). Best-effort.
  //
  // Aug 23 abc908 fix: on Capacitor (native Android/iOS) the DOM
  // `visibilitychange` event does NOT fire reliably when the app returns
  // from background — only web browsers dispatch it consistently. Every
  // real driver on the native APK was silently reporting "Never opened"
  // in the App Usage panel because their pings only fired once (at first
  // launch after login) and never again on subsequent foregrounds. Add a
  // parallel Capacitor `App.addListener('appStateChange', ...)` so native
  // resumes get counted too.
  useEffect(() => {
    if (!user) return;
    const cap = (window as any).Capacitor;
    const isNative = cap?.isNativePlatform?.() === true;
    const platform: string = cap?.getPlatform?.() ?? (typeof navigator !== 'undefined' ? 'web' : 'unknown');
    // Oct 14 client: Vite replaces the bare __APP_VERSION_NAME__ only — the globalThis form was always empty (App Usage showed no version).
    const version = typeof __APP_VERSION_NAME__ !== 'undefined' ? String(__APP_VERSION_NAME__) : '';
    const ping = () => { void volunteerApi.ping(platform, version).catch(() => {}); };
    ping();
    const onVis = () => { if (document.visibilityState === 'visible') ping(); };
    document.addEventListener('visibilitychange', onVis);
    let handle: any = null;
    if (isNative) {
      // Access via Capacitor.Plugins.App at runtime — avoids a hard type
      // dependency on @capacitor/app for the web-only build path.
      try {
        const AppPlugin = (window as any).Capacitor?.Plugins?.App;
        if (AppPlugin?.addListener) {
          handle = AppPlugin.addListener('appStateChange', (state: any) => {
            if (state?.isActive) ping();
          });
        }
      } catch {}
    }
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      try { handle?.remove?.(); } catch {}
    };
  }, [user]);

  if (!user) return <Login onAuthed={setUser} />;

  // Admins / coordinators land in the dispatch portal on desktop.
  // Oct 8: dispatchers + viewers too — they were falling through to the
  // volunteer phone screens (the portal already scopes their tabs).
  const isOffice = user.role === 'admin' || user.role === 'coordinator' || user.role === 'staff';
  if (isOffice || user.role === 'dispatcher' || user.role === 'viewer') {
    return (
      <>
        {isOffice && <SandboxPill />}
        <Routes>
          <Route path="/"                 element={<CoordinatorPortal />} />
          <Route path="/admin/pickup/:id" element={<AdminPickupDetail />} />
          {/* xyz122: read-only list of the last 20 simulated broadcasts */}
          <Route path="/admin/test-broadcasts" element={<TestBroadcastsPage />} />
          <Route path="/pickup/:mode/:id" element={<PickupDetail />} />
          <Route path="*"                 element={<Navigate to="/" replace />} />
        </Routes>
      </>
    );
  }

  // Suppliers
  if (user.role === 'supplier') {
    return (
      <PhoneFrame>
        <div className="flex-1 min-h-0 overflow-y-auto">
          <Routes>
            <Route path="/"     element={<SupplierHome user={user} />} />
            <Route path="/my-pickups" element={<SupplierHome user={user} listOnly />} />
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
          <Route path="/settings"         element={<DriverSettings />} />{/* Oct 14 client */}
          <Route path="/application"      element={<MyApplication />} />{/* Oct 14 client */}
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
  // Oct 14 client: h-app (index.css) = 100dvh minus the iPhone notch / home-bar padding.
  return (
    <div className="md:py-6 md:min-h-screen">
      <div className="md:max-w-[440px] md:mx-auto md:rounded-[28px] md:bg-paper md:shadow-lift md:border md:border-line md:h-[820px] h-app relative flex flex-col overflow-hidden">
        <OfflineBar />
        {children}
      </div>
    </div>
  );
}

// Oct 14 client: no signal → say so (the lists keep showing what was loaded last).
function OfflineBar() {
  const [off, setOff] = useState(() => typeof navigator !== 'undefined' && navigator.onLine === false);
  useEffect(() => {
    const on = () => setOff(false); const gone = () => setOff(true);
    window.addEventListener('online', on); window.addEventListener('offline', gone);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', gone); };
  }, []);
  if (!off) return null;
  return (
    <div role="status" className="shrink-0 bg-clay text-paper text-[14px] font-bold text-center px-3 py-2 leading-snug">
      No signal. You may be seeing old info. It updates by itself when you're back online.
    </div>
  );
}
