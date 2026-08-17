/**
 * Office kiosk drop-off flow (3 Regina). Route: /kiosk/:secret
 *
 * Screen sequence:
 *   Welcome → Signin → Stores → StoreEntry → Complete → Labels (print) → back to Welcome
 *
 * Design targets a stationary tablet: 24px+ text, 72px+ tap targets, no
 * scrolling per screen when possible. All state lives in this component
 * (kiosk sessions are short-lived; a refresh legitimately resets you).
 */
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { kiosk, type KioskLine, type KioskStore, type KioskLabel } from './kiosk-api';
import { kioskDevice } from '../api';
import { printLabels, labelPrinter } from './label-print';
import { AddressAutocomplete } from '../address-autocomplete';

type PickerDriver = { volunteerId: number; name: string; pendingPickups: number };
type NameCandidate = { volunteerId: number; name: string };
type VendorOption = { supplierId: number; supplierName: string; city: string };
type Screen =
  | { kind: 'welcome' }
  | { kind: 'signin' }
  // Ambiguous 4-digit code — pick which "Sholom" (etc.).
  | { kind: 'namePicker'; code: string; candidates: NameCandidate[] }
  // Staff / admin: pick which driver to simulate.
  | { kind: 'picker'; adminName: string; adminUsername: string; adminPassword: string; drivers: PickerDriver[] }
  // Walk-in: driver has no assigned pickup — pick vendor from master list.
  | { kind: 'vendorPicker'; dropoffId: number; volunteerName: string; greeting: string; allSuppliers: VendorOption[] }
  // Manual entry — driver couldn't find the store in the list. Type name + address.
  | { kind: 'manualVendor'; dropoffId: number; volunteerName: string }
  | { kind: 'stores'; dropoffId: number; volunteerName: string; stores: KioskStore[]; lines: KioskLine[]; recentCompleted?: import('./kiosk-api').KioskRecentCompleted[] }
  | { kind: 'entry';  dropoffId: number; volunteerName: string; stores: KioskStore[]; lines: KioskLine[]; store: KioskStore }
  | { kind: 'labels';  labels: KioskLabel[]; volunteerName: string };

const CATEGORIES = ['Dairy', 'Produce', 'Bakery', 'Prepared', 'Frozen', 'Grocery / Dry', 'Meat / Fish', 'Other'];
const UNITS      = ['box', 'tray', 'container', 'bag'];

// Item 3: 2-minute idle → auto-return to welcome. Any pointer/key/touch resets.
const IDLE_MS = 2 * 60 * 1000;

export function KioskApp() {
  const { secret = '' } = useParams<{ secret: string }>();
  const [screen, setScreen] = useState<Screen>({ kind: 'welcome' });
  const [showHelp, setShowHelp] = useState(false);
  // Aug 13 client redesign: Help popup → Admin button → PIN prompt → Admin Panel.
  // Two-stage modal: PIN prompt first, then panel on success. Both are also
  // dismissible via a Cancel/Close action so a curious driver can back out.
  const [showAdminPin, setShowAdminPin]     = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);

  // Kiosk-mode CSS on the root html: hide scroll, lock font, disable text-select
  useEffect(() => {
    const prev = document.documentElement.style.cssText;
    document.documentElement.style.cssText = 'font-size:18px; overflow:hidden; user-select:none;';
    document.body.style.cursor = 'default';
    return () => { document.documentElement.style.cssText = prev; };
  }, []);

  // Aug 14 client: kiosk tablet stays on 24/7. Two mechanisms — Android
  // MainActivity adds FLAG_KEEP_SCREEN_ON natively (primary), and this Wake
  // Lock request covers the PWA/web-only case as belt-and-suspenders. Re-
  // request when the tab regains visibility (OS may drop the lock on background).
  useEffect(() => {
    let wl: any = null;
    async function acquire() {
      try {
        const nav = navigator as any;
        if (nav.wakeLock?.request) {
          wl = await nav.wakeLock.request('screen');
        }
      } catch { /* user gesture may be required first — best-effort */ }
    }
    void acquire();
    function onVis() { if (document.visibilityState === 'visible') void acquire(); }
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      try { wl?.release?.(); } catch { /* ignore */ }
    };
  }, []);

  // Task #176 (Aug 14): true kiosk lockdown. Call the native KioskLock plugin
  // on Android to enter Lock Task Mode. If the tablet is device-owner
  // (provisioned via `adb dpm set-device-owner`) this is silent + unbreakable;
  // otherwise it falls back to Android's Screen Pinning UX which still needs
  // gesture-nav to exit. Exit is via the PIN-gated Admin Panel below.
  useEffect(() => {
    const cap = (window as any).Capacitor;
    if (cap?.isNativePlatform?.() !== true) return;
    const kl = (window as any).Capacitor?.Plugins?.KioskLock;
    if (!kl?.startLockTask) return;
    (async () => {
      try { await kl.startLockTask(); } catch { /* best-effort */ }
    })();
  }, []);

  // Item 3: idle auto-return to welcome. Any pointer/key/touch/scroll resets
  // the countdown. Skipped when already on welcome.
  useEffect(() => {
    if (screen.kind === 'welcome') return;
    let t: any = null;
    const reset = () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => {
        // Aug 15 audit: also close any admin surfaces so a coordinator who
        // walked away doesn't leave a PIN prompt / Admin Panel modal on top
        // of the fresh Welcome screen.
        setScreen({ kind: 'welcome' });
        setShowHelp(false);
        setShowAdminPin(false);
        setShowAdminPanel(false);
      }, IDLE_MS);
    };
    reset();
    const events = ['pointerdown', 'keydown', 'touchstart', 'wheel', 'mousemove'];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    return () => {
      if (t) clearTimeout(t);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [screen.kind]);

  // ?dropoffId=<N> — jump straight to the Labels/Print screen for an
  // existing drop-off. Skips the sign-in dance entirely; the URL is the
  // whole auth (kiosk secret) + the drop-off id. Useful for a "one URL,
  // one tap" print test from any browser on the LAN. Completes the
  // drop-off server-side (idempotent) so the labels manifest exists.
  const [dropoffJumpErr, setDropoffJumpErr] = useState<string | null>(null);
  useEffect(() => {
    if (!secret) return;
    const jumpId = Number(new URLSearchParams(window.location.search).get('dropoffId') || 0);
    if (!jumpId) return;
    if (screen.kind !== 'welcome') return;
    kiosk.complete(secret, jumpId, null, null)
      .then((r) => setScreen({ kind: 'labels', labels: r.data.labels, volunteerName: '6-Label Print Test' }))
      .catch((e: any) => setDropoffJumpErr(String(e?.message || e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secret]);

  // One-time printer config via URL params. Load once with
  // `?printerHost=192.168.1.2&printerPort=9100` and the tablet persists
  // the host+port to localStorage. Passing `?printerHost=clear` wipes it.
  useEffect(() => {
    const qs = new URLSearchParams(window.location.search);
    const h = qs.get('printerHost');
    const p = qs.get('printerPort');
    if (h === 'clear') { labelPrinter.clear(); }
    else if (h) {
      labelPrinter.setHost(h);
      if (p) labelPrinter.setPort(Number(p));
    }
  }, []);

  if (!secret) {
    return <FullPage><Center><Big>Missing kiosk secret in URL.</Big></Center></FullPage>;
  }

  return (
    <FullPage>
      {dropoffJumpErr && (
        <div className="fixed top-4 left-4 right-4 z-[9000] rounded-[10px] bg-clay text-paper px-4 py-2 text-[13px] font-bold text-center">
          ?dropoffId= jump failed: {dropoffJumpErr}
        </div>
      )}
      {screen.kind === 'welcome'  && <Welcome onStart={() => setScreen({ kind: 'signin' })} />}
      {screen.kind === 'signin'   && <Signin  secret={secret}
        onSigned={(d) => setScreen({ kind: 'stores', dropoffId: d.dropoffId, volunteerName: d.volunteerName, stores: d.stores, lines: [], recentCompleted: d.recentCompleted })}
        onAdminPick={(p) => setScreen({ kind: 'picker', ...p })}
        onNamePick={(code, cs) => setScreen({ kind: 'namePicker', code, candidates: cs })}
        onWalkIn={(w) => setScreen({ kind: 'vendorPicker', ...w })} />}
      {screen.kind === 'namePicker' && <NamePicker secret={secret} screen={screen}
        onCancel={() => setScreen({ kind: 'signin' })}
        onSigned={(d) => setScreen({ kind: 'stores', dropoffId: d.dropoffId, volunteerName: d.volunteerName, stores: d.stores, lines: [], recentCompleted: d.recentCompleted })}
        onWalkIn={(w) => setScreen({ kind: 'vendorPicker', ...w })} />}
      {screen.kind === 'picker'   && <DriverPicker secret={secret} screen={screen}
        onCancel={() => setScreen({ kind: 'signin' })}
        onSigned={(d) => setScreen({ kind: 'stores', dropoffId: d.dropoffId, volunteerName: d.volunteerName, stores: d.stores, lines: [], recentCompleted: d.recentCompleted })} />}
      {screen.kind === 'vendorPicker' && <VendorPicker screen={screen}
        onPick={(store) => setScreen({ kind: 'stores', dropoffId: screen.dropoffId, volunteerName: screen.volunteerName, stores: [store], lines: [] })}
        onManualEntry={() => setScreen({ kind: 'manualVendor', dropoffId: screen.dropoffId, volunteerName: screen.volunteerName })}
        onCancel={() => setScreen({ kind: 'signin' })} />}
      {screen.kind === 'manualVendor' && <ManualVendor secret={secret} screen={screen}
        onCreated={(store) => setScreen({ kind: 'stores', dropoffId: screen.dropoffId, volunteerName: screen.volunteerName, stores: [store], lines: [] })}
        onCancel={() => setScreen({ kind: 'signin' })} />}
      {screen.kind === 'stores'   && <Stores  secret={secret} screen={screen}
        onPickStore={(s) => setScreen({ ...screen, kind: 'entry', store: s })}
        onLabels={(labels) => setScreen({ kind: 'labels', labels, volunteerName: screen.volunteerName })}
        onBack={() => setScreen({ kind: 'signin' })} />}
      {screen.kind === 'entry'    && <StoreEntry secret={secret} screen={screen}
        onDone={(newLines) => setScreen({ kind: 'stores', dropoffId: screen.dropoffId, volunteerName: screen.volunteerName, stores: screen.stores, lines: newLines })} />}
      {screen.kind === 'labels'   && <Labels  labels={screen.labels} volunteerName={screen.volunteerName}
        kioskSecret={secret}
        onFinish={() => setScreen({ kind: 'welcome' })} />}
      {/* Aug 13 client redesign: top-left Start Over pill removed.
          Start Over lives inside the Help popup so the surface stays clean. */}
      {/* Always-available help — a "?" in the top-right that pops up the 5-step guide. */}
      <button onClick={() => setShowHelp(true)}
              className="fixed top-3 right-3 z-40 h-11 w-11 rounded-full bg-forest text-paper text-[22px] font-extrabold shadow-lift active:scale-95"
              aria-label="How to use this kiosk">
        ?
      </button>
      {showHelp && (
        <HelpOverlay
          onClose={() => setShowHelp(false)}
          onStartOver={() => { setShowHelp(false); setScreen({ kind: 'welcome' }); }}
          onAdmin={() => { setShowHelp(false); setShowAdminPin(true); }}
        />
      )}
      {showAdminPin && (
        <AdminPinPrompt
          secret={secret}
          onCancel={() => setShowAdminPin(false)}
          onOk={() => { setShowAdminPin(false); setShowAdminPanel(true); }}
        />
      )}
      {showAdminPanel && (
        <AdminPanel
          onClose={() => setShowAdminPanel(false)}
          onStartOver={() => { setShowAdminPanel(false); setScreen({ kind: 'welcome' }); }}
          onForceRefresh={async () => {
            // Nuke the SW + all caches, then hard-reload. Belt + suspenders so a
            // wedged bundle unwedges without the tech coming on-site.
            try {
              if ('serviceWorker' in navigator) {
                const regs = await navigator.serviceWorker.getRegistrations();
                await Promise.all(regs.map((r) => r.unregister()));
              }
              if ('caches' in self) {
                const keys = await caches.keys();
                await Promise.all(keys.map((k) => caches.delete(k)));
              }
            } catch { /* ignore — reload will still fetch fresh */ }
            window.location.reload();
          }}
          onExitKiosk={async () => {
            // Task #176: release Lock Task Mode BEFORE navigating out so the
            // OS lets the user leave the app. Best-effort — safe on non-native.
            try {
              const kl = (window as any).Capacitor?.Plugins?.KioskLock;
              if (kl?.stopLockTask) await kl.stopLockTask();
            } catch { /* ignore */ }
            kioskDevice.clear();
            window.location.href = window.location.origin + (import.meta.env.BASE_URL || '/');
          }}
        />
      )}
    </FullPage>
  );
}

/**
 * How-to overlay — mirrors the printed quick-card. Shows on top of every
 * kiosk screen so a volunteer or guest can pull it up mid-flow.
 * Aug 13 client redesign: three bottom buttons (Got It, Start Over, Admin).
 * Start Over used to live in a top-left pill; now it's here so the surface stays clean.
 * Admin used to be an underlined link that immediately exited kiosk mode after a
 * text prompt; now it opens a PIN prompt → Admin Panel.
 */
function HelpOverlay({ onClose, onStartOver, onAdmin }: {
  onClose: () => void;
  onStartOver: () => void;
  onAdmin: () => void;
}) {
  return (
    <div onClick={onClose}
         className="fixed inset-0 z-[100] bg-ink/60 flex items-center justify-center p-6">
      <div onClick={(e) => e.stopPropagation()}
           className="bg-paper rounded-[22px] shadow-lift max-w-[720px] w-full max-h-[92vh] overflow-y-auto p-8 relative">
        <button onClick={onClose}
                className="absolute top-3 right-3 h-11 w-11 rounded-full bg-cream text-ink text-[22px] font-extrabold active:scale-95"
                aria-label="Close help">×</button>
        <div className="text-[13px] uppercase tracking-[.15em] text-muted font-extrabold">How to drop off</div>
        <div className="text-[30px] font-extrabold text-forest mt-1 leading-tight">Zeh L'Zeh Kiosk — 5 quick steps</div>

        <ol className="mt-6 space-y-5">
          <HelpStep n="1" title="Tap Start sign-in" />
          <HelpStep n="2" title="Enter the last 4 digits of your phone">
            Recognized? Tap your name.<br />
            New? Tap <b>Continue as guest</b>, then your full name + phone number.
          </HelpStep>
          <HelpStep n="3" title="Pick the store">
            Scheduled pickup? It's already on-screen — just tap.<br />
            Walk-in? Search the list.<br />
            Not listed? Tap <b>Enter pickup location manually</b> — the address auto-completes as you type.
          </HelpStep>
          <HelpStep n="4" title="Add each item">
            Tap <b>+ Add item</b>, then choose Category · Quantity + unit (box, tray, bag, container) · Description (optional).
          </HelpStep>
          <HelpStep n="5" title="Complete → Print labels → Done">
            Tap <b>Complete drop-off</b>, add any notes, then <b>Print labels</b> and stick them on the matching boxes.
          </HelpStep>
        </ol>

        <div className="mt-8 text-[15px] text-muted">
          Something wrong? Just leave the food with a note and call the office — we'll fix it.
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-end gap-3">
          <button onClick={onAdmin}
                  className="bg-cream text-ink border-2 border-line font-extrabold text-[15px] px-5 py-3 rounded-full active:scale-95">
            Admin
          </button>
          <button onClick={onStartOver}
                  className="bg-paper text-forest border-2 border-forest font-extrabold text-[16px] px-6 py-3 rounded-full active:scale-95">
            ⌂ Start over
          </button>
          <button onClick={onClose}
                  className="bg-forest text-paper font-extrabold text-[17px] px-8 py-3 rounded-full shadow-lift active:scale-95">
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * PIN prompt shown when the volunteer taps Admin in the Help popup.
 * Verifies against portal_settings.kiosk_admin_pin on the server.
 * Configurable from the coordinator UI so the office can rotate the PIN.
 */
function AdminPinPrompt({ secret, onCancel, onOk }: {
  secret: string;
  onCancel: () => void;
  onOk: () => void;
}) {
  const [pin, setPin] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(final?: string) {
    const p = (final ?? pin).trim();
    if (p.length < 4) return;
    setBusy(true); setErr(null);
    try { await kiosk.verifyAdminPin(secret, p); onOk(); }
    catch (e: any) {
      setErr(e?.status === 401 ? 'Wrong PIN.' : (e?.message || 'Something went wrong.'));
      setPin('');
    } finally { setBusy(false); }
  }
  function addDigit(d: string) {
    if (busy) return;
    setErr(null);
    setPin((prev) => {
      const next = (prev + d).slice(0, 6);
      if (next.length >= 4) setTimeout(() => submit(next), 100);
      return next;
    });
  }
  function backspace() { setErr(null); setPin((p) => p.slice(0, -1)); }

  return (
    <div onClick={onCancel} className="fixed inset-0 z-[200] bg-ink/70 flex items-center justify-center p-6">
      <div onClick={(e) => e.stopPropagation()}
           className="bg-paper rounded-[22px] shadow-lift w-full max-w-[420px] p-8 relative">
        <div className="text-[13px] uppercase tracking-[.15em] text-muted font-extrabold text-center">Admin</div>
        <div className="text-[24px] font-extrabold text-ink text-center mt-1">Enter admin PIN</div>
        <div className="mt-6 flex justify-center gap-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i}
                 className={cxKiosk('h-14 w-11 rounded-[10px] border-2 flex items-center justify-center text-[26px] font-extrabold',
                                    pin.length > i ? 'border-forest bg-sage text-forest' : 'border-line bg-cream text-muted')}>
              {pin.length > i ? '•' : ''}
            </div>
          ))}
        </div>
        {err && <div className="mt-3 text-[14px] text-clay font-bold text-center">{err}</div>}
        <div className="mt-6 grid grid-cols-3 gap-2">
          {['1','2','3','4','5','6','7','8','9'].map((d) => (
            <button key={d} onClick={() => addDigit(d)}
                    className="h-14 rounded-[12px] bg-cream border-2 border-line text-[22px] font-extrabold text-ink active:scale-95">{d}</button>
          ))}
          <button onClick={backspace}
                  className="h-14 rounded-[12px] bg-cream border-2 border-line text-[16px] font-extrabold text-ink active:scale-95">⌫</button>
          <button onClick={() => addDigit('0')}
                  className="h-14 rounded-[12px] bg-cream border-2 border-line text-[22px] font-extrabold text-ink active:scale-95">0</button>
          <button onClick={onCancel}
                  className="h-14 rounded-[12px] bg-paper border-2 border-line text-[13px] font-bold text-muted active:scale-95">Cancel</button>
        </div>
      </div>
    </div>
  );
}

/**
 * Admin Panel — shown after the PIN check passes.
 * Read-only device status (battery / Wi-Fi / Bluetooth / device info) + three
 * admin actions (Start Over, Force Refresh, Exit Kiosk Mode). Everything the
 * office might need without leaving kiosk mode to check the tablet.
 */
function AdminPanel({ onClose, onStartOver, onForceRefresh, onExitKiosk }: {
  onClose: () => void;
  onStartOver: () => void;
  onForceRefresh: () => void | Promise<void>;
  onExitKiosk: () => void;
}) {
  const [battery, setBattery]   = useState<{ level: number | null; charging: boolean | null } | null>(null);
  const [online, setOnline]     = useState<boolean>(navigator.onLine);
  const [connKind, setConnKind] = useState<string>('unknown');
  const [btInfo, setBtInfo]     = useState<string>('checking…');
  const [hidList, setHidList]   = useState<string[]>([]);
  const [confirmExit, setConfirmExit] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const b: any = await (navigator as any).getBattery?.();
        if (b && live) {
          const read = () => setBattery({ level: b.level, charging: b.charging });
          read();
          b.addEventListener('levelchange', read);
          b.addEventListener('chargingchange', read);
        }
      } catch { /* Battery API not exposed — leave null. */ }
    })();
    const onNet = () => setOnline(navigator.onLine);
    window.addEventListener('online', onNet); window.addEventListener('offline', onNet);
    const conn = (navigator as any).connection;
    if (conn) setConnKind(String(conn.effectiveType || conn.type || 'unknown'));
    // Web Bluetooth availability. Full pairing needs a user gesture, but we can
    // at least tell the admin whether the browser supports it at all.
    (async () => {
      const bt: any = (navigator as any).bluetooth;
      if (!bt) { setBtInfo('Not supported on this browser'); return; }
      try {
        const avail = await bt.getAvailability?.();
        setBtInfo(avail === false ? 'Adapter off / unavailable' : 'Available');
      } catch { setBtInfo('Available'); }
    })();
    // HID (paired Bluetooth / USB keyboards, scanners). getDevices() returns
    // devices the user has previously granted the site access to.
    (async () => {
      try {
        const hid: any = (navigator as any).hid;
        if (!hid?.getDevices) return;
        const devs = await hid.getDevices();
        setHidList((devs || []).map((d: any) => d.productName || `HID ${d.vendorId}:${d.productId}`));
      } catch { /* ignore */ }
    })();
    return () => {
      live = false;
      window.removeEventListener('online', onNet); window.removeEventListener('offline', onNet);
    };
  }, []);

  const bLevel = battery?.level == null ? '—' : `${Math.round((battery.level || 0) * 100)}%`;
  const bCharge = battery?.charging == null ? '' : battery.charging ? ' · charging' : ' · on battery';

  return (
    <div onClick={onClose} className="fixed inset-0 z-[200] bg-ink/70 flex items-center justify-center p-6">
      <div onClick={(e) => e.stopPropagation()}
           className="bg-paper rounded-[22px] shadow-lift w-full max-w-[720px] max-h-[92vh] overflow-y-auto p-8 relative">
        <button onClick={onClose}
                className="absolute top-3 right-3 h-11 w-11 rounded-full bg-cream text-ink text-[22px] font-extrabold active:scale-95"
                aria-label="Close admin panel">×</button>
        <div className="text-[13px] uppercase tracking-[.15em] text-muted font-extrabold">Admin panel</div>
        <div className="text-[26px] font-extrabold text-forest mt-1 leading-tight">Tablet status &amp; actions</div>

        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <StatusTile label="Battery" value={`${bLevel}${bCharge}`} />
          <StatusTile label="Internet" value={online ? `Online (${connKind})` : 'Offline'} tone={online ? 'ok' : 'warn'} />
          <StatusTile label="Bluetooth" value={btInfo} />
          <StatusTile label="Paired input devices" value={hidList.length ? hidList.join(', ') : 'None granted'} />
          <StatusTile label="Screen" value={`${window.screen.width} × ${window.screen.height}`} />
          <StatusTile label="Kiosk build" value={(import.meta.env.VITE_APP_VERSION as string | undefined) || 'web'} />
        </div>

        <div className="mt-7 text-[13px] uppercase tracking-[.15em] text-muted font-extrabold">Actions</div>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button onClick={onStartOver}
                  className="h-14 rounded-[12px] bg-paper border-2 border-forest text-forest text-[16px] font-extrabold active:scale-95">
            ⌂ Start Over
          </button>
          <button onClick={onForceRefresh}
                  className="h-14 rounded-[12px] bg-cream border-2 border-line text-ink text-[16px] font-extrabold active:scale-95">
            ↻ Force Refresh
          </button>
          {!confirmExit ? (
            <button onClick={() => setConfirmExit(true)}
                    className="h-14 rounded-[12px] bg-clay text-paper text-[16px] font-extrabold active:scale-95">
              ⎋ Exit Kiosk Mode
            </button>
          ) : (
            <button onClick={onExitKiosk}
                    className="h-14 rounded-[12px] bg-clay text-paper text-[16px] font-extrabold active:scale-95 animate-pulse">
              Tap again to confirm
            </button>
          )}
        </div>

        <div className="mt-6 text-[13px] text-muted">
          Force Refresh clears the app cache and reloads. Use it if the kiosk feels stuck.
        </div>
      </div>
    </div>
  );
}

function StatusTile({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'warn' }) {
  const bar = tone === 'warn' ? 'bg-clay' : tone === 'ok' ? 'bg-forest' : 'bg-muted';
  return (
    <div className="rounded-[14px] border-2 border-line bg-cream/60 p-3 flex flex-col">
      <div className="flex items-center gap-2">
        <span className={cxKiosk('inline-block h-2 w-2 rounded-full', bar)} />
        <span className="text-[12px] uppercase tracking-[.1em] text-muted font-extrabold">{label}</span>
      </div>
      <div className="text-[16px] font-bold text-ink mt-1 break-words">{value}</div>
    </div>
  );
}

function cxKiosk(...cls: (string | false | null | undefined)[]) { return cls.filter(Boolean).join(' '); }

function HelpStep({ n, title, children }: { n: string; title: string; children?: React.ReactNode }) {
  return (
    <li className="flex gap-4">
      <div className="shrink-0 h-11 w-11 rounded-full bg-forest text-paper grid place-items-center text-[19px] font-extrabold">{n}</div>
      <div className="pt-1">
        <div className="text-[20px] font-extrabold text-ink leading-tight">{title}</div>
        {children && <div className="text-[16px] text-ink/80 mt-1.5 leading-snug">{children}</div>}
      </div>
    </li>
  );
}

// ---------------- Screens ----------------

function Welcome({ onStart }: { onStart: () => void }) {
  // Aug 13 client redesign: the hidden 5-tap "Kiosk mode" escape is GONE.
  // Admin access is now the single Admin button inside the Help (?) popup
  // — one entry point, PIN-gated, opens the Admin Panel (not an immediate exit).
  return (
    <Center>
      <div className="text-[64px] font-extrabold text-forest leading-tight text-center">Zeh L'Zeh</div>
      <div className="text-[26px] text-muted mt-2 text-center">Office drop-off kiosk</div>
      <div className="text-[19px] text-ink/70 mt-8 text-center max-w-[520px]">
        Welcome back. Tap Start to sign in your pickup.
      </div>
      <PrimaryButton onClick={onStart} className="mt-10">Start sign-in</PrimaryButton>
    </Center>
  );
}

function Signin({ secret, onSigned, onAdminPick, onNamePick, onWalkIn }: {
  secret: string;
  onSigned: (d: { dropoffId: number; volunteerName: string; stores: KioskStore[]; recentCompleted?: import('./kiosk-api').KioskRecentCompleted[] }) => void;
  onAdminPick: (p: { adminName: string; adminUsername: string; adminPassword: string; drivers: PickerDriver[] }) => void;
  onNamePick: (code: string, candidates: NameCandidate[]) => void;
  onWalkIn: (w: { dropoffId: number; volunteerName: string; greeting: string; allSuppliers: VendorOption[] }) => void;
}) {
  const [code, setCode]     = useState('');
  const [busy, setBusy]     = useState(false);
  const [err, setErr]       = useState<string | null>(null);
  const [pwMode, setPwMode] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const [guestMode, setGuestMode]   = useState(false);
  const [guestName, setGuestName]   = useState('');
  const [guestPhone, setGuestPhone] = useState('');

  async function submitCode(finalCode?: string) {
    const c = (finalCode ?? code).slice(0, 4);
    if (c.length !== 4) return;
    setBusy(true); setErr(null);
    try {
      const r = await kiosk.signin(secret, { code: c });
      const d = r.data as any;
      if (d.needsVolunteerPick) { onNamePick(d.code, d.candidates); return; }
      if (d.needsVendorPick)    { onWalkIn({ dropoffId: d.dropoffId, volunteerName: d.volunteerName, greeting: d.greeting, allSuppliers: d.allSuppliers }); return; }
      onSigned(d as { dropoffId: number; volunteerName: string; stores: KioskStore[] });
    } catch (e: any) {
      // Unknown code = offer guest sign-in instead of erroring out.
      const msg = String(e?.message || '');
      if (/no driver found|unknown_code/i.test(msg)) {
        setErr(null); setCode(''); setGuestMode(true); return;
      }
      setErr(msg || 'Something went wrong. Please try again.');
      setCode('');
    } finally { setBusy(false); }
  }

  async function submitGuest() {
    if (!guestName.trim()) { setErr('Please enter your full name.'); return; }
    if (!guestPhone.trim() || guestPhone.replace(/\D/g, '').length < 7) {
      setErr('Please enter your full phone number.'); return;
    }
    setBusy(true); setErr(null);
    try {
      const r = await kiosk.signin(secret, { guestName: guestName.trim(), guestPhone: guestPhone.trim() });
      const d = r.data as any;
      onWalkIn({ dropoffId: d.dropoffId, volunteerName: d.volunteerName, greeting: d.greeting, allSuppliers: d.allSuppliers });
    } catch (e: any) {
      setErr(e?.message || 'Something went wrong. Please try again.');
    } finally { setBusy(false); }
  }

  async function submitPw() {
    if (!username.trim() || !password) { setErr('Please enter your email or phone and password.'); return; }
    setBusy(true); setErr(null);
    try {
      const r = await kiosk.signin(secret, { username: username.trim(), password });
      const d = r.data as any;
      if (d.needsDriverPick) {
        onAdminPick({ adminName: d.adminName, adminUsername: username.trim(), adminPassword: password, drivers: d.drivers });
        return;
      }
      if (d.needsVendorPick) { onWalkIn({ dropoffId: d.dropoffId, volunteerName: d.volunteerName, greeting: d.greeting, allSuppliers: d.allSuppliers }); return; }
      onSigned(d as { dropoffId: number; volunteerName: string; stores: KioskStore[] });
    } catch (e: any) {
      setErr(e?.message || 'Something went wrong. Please try again.');
    } finally { setBusy(false); }
  }

  function addDigit(d: string) {
    if (busy) return;
    setErr(null);
    setCode((prev) => {
      const next = (prev + d).slice(0, 4);
      if (next.length === 4) setTimeout(() => submitCode(next), 100);
      return next;
    });
  }
  function backspace() { setErr(null); setCode((p) => p.slice(0, -1)); }

  // Item 1: Bluetooth keyboard support on the 4-digit PIN screen. Number keys 0-9,
  // Backspace, and Enter (submits current code if 4 digits). Active only on the
  // numeric-pad screen — not guestMode / pwMode which have their own inputs.
  useEffect(() => {
    if (guestMode || pwMode) return;
    function onKey(e: KeyboardEvent) {
      if (busy) return;
      if ((e as any).isComposing) return;
      // Skip if the user is typing in an input (shouldn't happen on the PIN screen
      // — no <input> is rendered — but future-proof).
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || (t as any).isContentEditable)) return;
      if (/^[0-9]$/.test(e.key)) { e.preventDefault(); addDigit(e.key); return; }
      if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); backspace(); return; }
      if (e.key === 'Enter') {
        if (code.length === 4) { e.preventDefault(); void submitCode(code); }
        return;
      }
      if (e.key === 'Escape') { e.preventDefault(); setCode(''); setErr(null); return; }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guestMode, pwMode, busy, code]);

  if (guestMode) {
    return (
      <Center>
        <Big>Sign in as guest</Big>
        <div className="text-[19px] text-muted mt-3 text-center max-w-[540px]">
          Please give us your full name and phone number so we can reach out if we have any questions.
        </div>
        <div className="mt-8 w-full max-w-[560px] space-y-4">
          <KioskInput placeholder="Full name" value={guestName} onChange={setGuestName} autoFocus />
          <input value={guestPhone} onChange={(e) => setGuestPhone(e.target.value)}
                 placeholder="Phone number (e.g. 845-555-1234)" inputMode="tel"
                 className="w-full rounded-[16px] border-[2px] border-line bg-paper px-5 py-4 text-[24px] outline-none focus:border-forest" />
          {err && <div className="text-clay text-[19px] font-bold text-center bg-clay/10 rounded-[16px] py-3 px-4">{err}</div>}
          <PrimaryButton onClick={submitGuest} disabled={busy || !guestName.trim() || !guestPhone.trim()}>
            {busy ? 'Signing in…' : 'Continue as guest →'}
          </PrimaryButton>
          <button onClick={() => { setGuestMode(false); setGuestName(''); setGuestPhone(''); setErr(null); }}
                  className="w-full text-[16px] font-bold text-forest underline underline-offset-2 py-2">
            ← Back to 4-digit sign-in
          </button>
        </div>
      </Center>
    );
  }

  if (pwMode) {
    return (
      <Center>
        <Big>Sign in with password</Big>
        <div className="text-[18px] text-muted mt-3 text-center">Admin / driver full login.</div>
        <div className="mt-8 w-full max-w-[560px] space-y-4">
          <KioskInput placeholder="Email or phone" value={username} onChange={setUsername} autoFocus />
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                 placeholder="Password"
                 onKeyDown={(e) => { if (e.key === 'Enter') submitPw(); }}
                 className="w-full rounded-[16px] border-[2px] border-line bg-paper px-5 py-4 text-[24px] outline-none focus:border-forest" />
          {err && <div className="text-clay text-[19px] font-bold text-center bg-clay/10 rounded-[16px] py-3 px-4">{err}</div>}
          <PrimaryButton onClick={submitPw} disabled={busy || !username.trim() || !password}>
            {busy ? 'Signing in…' : 'Continue →'}
          </PrimaryButton>
          <button onClick={() => { setPwMode(false); setErr(null); }}
                  className="w-full text-[16px] font-bold text-forest underline underline-offset-2 py-2">
            ← Back to 4-digit sign-in
          </button>
        </div>
      </Center>
    );
  }

  // Item 2: PIN screen laid out top-anchored (justify-start + pt-16) instead of
  // vertically centered — on ~1024x768 landscape tablets the heading was clipped
  // under the top-right "?" pill when centered. This guarantees the heading is
  // always visible below the top pills. Whole column also scrolls if needed.
  return (
    <div className="h-full w-full flex flex-col items-center pt-16 pb-6 px-6 overflow-y-auto">
      <Big>Enter your 4-digit code</Big>
      <div className="text-[19px] text-muted mt-3 text-center max-w-[540px]">
        The last 4 digits of the phone number we have on file.
        <span className="hidden sm:inline"> Bluetooth keyboards work — just start typing.</span>
      </div>
      {/* Code display */}
      <div className="mt-6 flex gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i}
               className={`w-16 h-20 rounded-[14px] border-[2px] flex items-center justify-center text-[38px] font-extrabold ${code[i] ? 'bg-sage/50 border-forest text-forest' : 'bg-paper border-line text-muted'}`}>
            {code[i] ? '•' : ''}
          </div>
        ))}
      </div>
      {err && <div className="text-clay text-[18px] font-bold text-center bg-clay/10 rounded-[16px] py-3 px-4 mt-4 max-w-[540px]">{err}</div>}

      {/* Number pad */}
      <div className="mt-6 grid grid-cols-3 gap-3 w-full max-w-[400px]">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
          <KeyBtn key={n} onClick={() => addDigit(String(n))}>{n}</KeyBtn>
        ))}
        <KeyBtn onClick={backspace} muted>←</KeyBtn>
        <KeyBtn onClick={() => addDigit('0')}>0</KeyBtn>
        <KeyBtn onClick={() => setCode('')} muted>clear</KeyBtn>
      </div>

      <div className="mt-6 flex flex-col items-center gap-2">
        <button onClick={() => { setGuestMode(true); setErr(null); }}
                className="text-[16px] font-extrabold text-forest underline underline-offset-2 py-2">
          Continue as guest →
        </button>
        <button onClick={() => { setPwMode(true); setErr(null); }}
                className="text-[14px] font-bold text-muted underline underline-offset-2 py-2">
          Sign in with email &amp; password instead
        </button>
      </div>
    </div>
  );
}

function KeyBtn({ onClick, children, muted }: { onClick: () => void; children: React.ReactNode; muted?: boolean }) {
  return (
    <button onClick={onClick}
            className={`h-20 rounded-[16px] text-[32px] font-extrabold border-[2px] transition ${muted ? 'bg-paper border-line text-muted' : 'bg-paper border-line text-ink hover:bg-sage/40 hover:border-forest'}`}>
      {children}
    </button>
  );
}

function NamePicker({ secret, screen, onCancel, onSigned, onWalkIn }: {
  secret: string;
  screen: Extract<Screen, { kind: 'namePicker' }>;
  onCancel: () => void;
  onSigned: (d: { dropoffId: number; volunteerName: string; stores: KioskStore[]; recentCompleted?: import('./kiosk-api').KioskRecentCompleted[] }) => void;
  onWalkIn: (w: { dropoffId: number; volunteerName: string; greeting: string; allSuppliers: VendorOption[] }) => void;
}) {
  const [busyId, setBusyId] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  async function pick(c: NameCandidate) {
    setBusyId(c.volunteerId); setErr(null);
    try {
      const r = await kiosk.signin(secret, { code: screen.code, resolveVolunteerId: c.volunteerId });
      const d = r.data as any;
      if (d.needsVendorPick) { onWalkIn({ dropoffId: d.dropoffId, volunteerName: d.volunteerName, greeting: d.greeting, allSuppliers: d.allSuppliers }); return; }
      onSigned(d as { dropoffId: number; volunteerName: string; stores: KioskStore[] });
    } catch (e: any) { setErr(e?.message || 'Could not continue.'); }
    finally { setBusyId(null); }
  }
  return (
    <Center>
      <Big>Which one are you?</Big>
      <div className="text-[19px] text-muted mt-3 text-center">
        More than one driver has code <b className="text-ink">{screen.code}</b>. Tap your name.
      </div>
      <div className="mt-8 w-full max-w-[560px] space-y-3">
        {screen.candidates.map((c) => (
          <button key={c.volunteerId} onClick={() => pick(c)} disabled={busyId !== null}
                  className="w-full text-left rounded-[16px] border-[2px] border-line bg-paper px-6 py-5 text-[22px] font-extrabold hover:border-forest disabled:opacity-40">
            {busyId === c.volunteerId ? 'Loading…' : c.name}
          </button>
        ))}
        {err && <div className="text-clay text-[17px] font-bold bg-clay/10 rounded-[12px] py-2 px-3">{err}</div>}
        <button onClick={onCancel}
                className="w-full py-4 rounded-[16px] border-2 border-line bg-paper text-ink text-[18px] font-extrabold hover:border-forest mt-4">
          ← Back
        </button>
      </div>
    </Center>
  );
}

function VendorPicker({ screen, onPick, onManualEntry, onCancel }: {
  screen: Extract<Screen, { kind: 'vendorPicker' }>;
  onPick: (store: KioskStore) => void;
  onManualEntry: () => void;
  onCancel: () => void;
}) {
  const [q, setQ] = useState('');
  const filtered = screen.allSuppliers.filter((s) => {
    if (!q.trim()) return true;
    const hay = `${s.supplierName} ${s.city}`.toLowerCase();
    return hay.includes(q.trim().toLowerCase());
  }).slice(0, 60);

  return (
    <div className="h-full w-full grid grid-rows-[auto_auto_1fr_auto] gap-4 p-8">
      <div>
        <div className="text-[32px] font-extrabold text-forest">{screen.greeting}</div>
        <div className="text-[18px] text-muted mt-2">
          No pickup was assigned to you. Search for the store you picked up from — or add a new one manually.
        </div>
      </div>
      <div className="flex flex-col sm:flex-row gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus
               placeholder="Type a store name — e.g. Costco"
               className="flex-1 rounded-[16px] border-[2px] border-line bg-paper px-5 py-4 text-[22px] outline-none focus:border-forest" />
        <button onClick={onManualEntry}
                className="rounded-[16px] border-[2px] border-forest bg-sage/40 text-forest text-[18px] font-extrabold px-5 py-4 hover:bg-sage/60 whitespace-nowrap">
          + Enter location manually
        </button>
      </div>
      <div className="overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="text-[19px] text-muted p-6 text-center">
            No stores match "{q}". Try fewer letters — or tap "+ Enter location manually" above.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {filtered.map((s) => (
              <button key={s.supplierId}
                      onClick={() => onPick({ supplierId: s.supplierId, supplierName: s.supplierName, pickupIds: [], scheduledDate: '' })}
                      className="w-full text-left rounded-[14px] border-[2px] border-line bg-paper px-5 py-4 hover:border-forest">
                <div className="text-[20px] font-extrabold text-ink truncate">{s.supplierName}</div>
                {s.city && <div className="text-[14px] text-muted mt-0.5">{s.city}</div>}
              </button>
            ))}
          </div>
        )}
      </div>
      <button onClick={onCancel}
              className="w-full py-4 rounded-[16px] border-2 border-line bg-paper text-ink text-[19px] font-extrabold hover:border-forest">
        ← Back to sign-in
      </button>
    </div>
  );
}

function ManualVendor({ secret, screen: _screen, onCreated, onCancel }: {
  secret: string;
  screen: Extract<Screen, { kind: 'manualVendor' }>;
  onCreated: (store: KioskStore) => void;
  onCancel: () => void;
}) {
  const [name, setName]         = useState('');
  const [address, setAddress]   = useState('');
  const [hashgacha, setHashgacha] = useState('');
  const [catering, setCatering]   = useState('');
  const [busy, setBusy]         = useState(false);
  const [err, setErr]           = useState<string | null>(null);

  async function submit() {
    if (!name.trim()) { setErr('Please enter the store or supplier name.'); return; }
    setBusy(true); setErr(null);
    try {
      const r = await kiosk.manualVendor(secret, {
        name: name.trim(),
        address: address.trim(),
        hashgacha: hashgacha.trim(),
        catering_company: catering.trim(),
      });
      onCreated({
        supplierId:    r.data.supplierId,
        supplierName:  r.data.supplierName,
        pickupIds:     [],
        scheduledDate: '',
      });
    } catch (e: any) {
      setErr(e?.message || 'Could not save. Please try again.');
    } finally { setBusy(false); }
  }

  return (
    <div className="h-full w-full grid grid-rows-[auto_1fr_auto] gap-4 p-8 pt-16 overflow-y-auto">
      <div>
        <div className="text-[32px] font-extrabold text-forest">Add a new pickup location</div>
        <div className="text-[18px] text-muted mt-2">
          Enter the store or supplier name, then start typing the address — Google will suggest matches.
        </div>
      </div>
      <div className="space-y-5">
        <div>
          <div className="text-[15px] font-extrabold uppercase tracking-[.08em] text-muted mb-2">Store / supplier name</div>
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus
                 placeholder='e.g. "Costco Monsey" or hall / venue name'
                 className="w-full rounded-[16px] border-[2px] border-line bg-paper px-5 py-4 text-[22px] outline-none focus:border-forest" />
        </div>
        <div>
          <div className="text-[15px] font-extrabold uppercase tracking-[.08em] text-muted mb-2">Full pickup address</div>
          <AddressAutocomplete
            value={address}
            onChange={setAddress}
            placeholder="Start typing an address…"
            className="w-full rounded-[16px] border-[2px] border-line bg-paper px-5 py-4 text-[22px] outline-none focus:border-forest"
          />
          <div className="text-[13px] text-muted mt-1">Suggestions from Google Maps.</div>
        </div>
        {/* Item 5: optional event-pickup fields. Hashgacha helps us tag kashrus;
            Catering, if filled, overrides the label supplier name to the catering company. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <div className="text-[15px] font-extrabold uppercase tracking-[.08em] text-muted mb-2">Hashgacha (optional)</div>
            <input value={hashgacha} onChange={(e) => setHashgacha(e.target.value)}
                   placeholder='e.g. "OU", "Vaad Monsey"'
                   className="w-full rounded-[16px] border-[2px] border-line bg-paper px-5 py-3 text-[19px] outline-none focus:border-forest" />
          </div>
          <div>
            <div className="text-[15px] font-extrabold uppercase tracking-[.08em] text-muted mb-2">Catering company (optional)</div>
            <input value={catering} onChange={(e) => setCatering(e.target.value)}
                   placeholder='e.g. "Prestige Caterers"'
                   className="w-full rounded-[16px] border-[2px] border-line bg-paper px-5 py-3 text-[19px] outline-none focus:border-forest" />
            {catering.trim() && (
              <div className="text-[12px] text-forest font-bold mt-1">↑ Labels will print with this as the supplier.</div>
            )}
          </div>
        </div>
        {err && <div className="text-clay text-[17px] font-bold bg-clay/10 rounded-[12px] py-2 px-3">{err}</div>}
      </div>
      <div className="flex gap-3">
        <button onClick={onCancel}
                className="flex-1 py-4 rounded-[16px] border-2 border-line bg-paper text-ink text-[19px] font-extrabold hover:border-forest">
          ← Back
        </button>
        <button onClick={submit} disabled={busy || !name.trim()}
                className="flex-[2] py-4 rounded-[16px] bg-forest text-paper text-[20px] font-extrabold disabled:opacity-40">
          {busy ? 'Saving…' : 'Continue →'}
        </button>
      </div>
    </div>
  );
}

function DriverPicker({ secret, screen, onSigned, onCancel }: {
  secret: string;
  screen: Extract<Screen, { kind: 'picker' }>;
  onSigned: (d: { dropoffId: number; volunteerName: string; stores: KioskStore[]; recentCompleted?: import('./kiosk-api').KioskRecentCompleted[] }) => void;
  onCancel: () => void;
}) {
  const [busyId, setBusyId] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function pick(driver: PickerDriver) {
    setBusyId(driver.volunteerId); setErr(null);
    try {
      const r = await kiosk.signin(secret, { username: screen.adminUsername, password: screen.adminPassword, simulateAsVolunteerId: driver.volunteerId });
      if ('needsDriverPick' in r.data && r.data.needsDriverPick) {
        setErr('Server bounced back to picker unexpectedly.'); return;
      }
      onSigned(r.data as { dropoffId: number; volunteerName: string; stores: KioskStore[] });
    } catch (e: any) {
      setErr(e?.message || 'Could not start drop-off for that driver.');
    } finally { setBusyId(null); }
  }

  return (
    <div className="h-full w-full grid grid-rows-[auto_1fr_auto] gap-4 p-8">
      <div>
        <div className="text-[16px] text-muted uppercase tracking-[.08em] font-extrabold">Admin simulation</div>
        <div className="text-[30px] font-extrabold text-forest">Signed in as {screen.adminName} — pick a driver to simulate</div>
        <div className="text-[16px] text-muted mt-1">
          Only drivers with a pending pickup in the last 24 hours are shown. Tap one to start their drop-off.
        </div>
      </div>

      <div className="overflow-y-auto pr-2">
        {screen.drivers.length === 0 ? (
          <div className="text-[19px] text-muted p-6 text-center border border-dashed border-line rounded-[18px]">
            No drivers have a pending assigned pickup right now. Assign a pickup to a driver from the portal first, then reload the kiosk.
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {screen.drivers.map((d) => (
              <button key={d.volunteerId} onClick={() => pick(d)} disabled={busyId !== null}
                      className="rounded-[16px] border-[2px] border-line bg-paper p-5 text-left hover:border-forest transition disabled:opacity-50">
                <div className="text-[22px] font-extrabold text-ink">{d.name}</div>
                <div className="text-[15px] text-muted mt-1">
                  {d.pendingPickups} pending pickup{d.pendingPickups === 1 ? '' : 's'}
                </div>
                <div className="text-[13px] text-forest font-bold mt-3">
                  {busyId === d.volunteerId ? 'Starting…' : 'Tap to simulate →'}
                </div>
              </button>
            ))}
          </div>
        )}
        {err && <div className="text-clay text-[17px] font-bold bg-clay/10 rounded-[12px] py-2 px-3 mt-4">{err}</div>}
      </div>

      <div>
        <button onClick={onCancel}
                className="w-full py-4 rounded-[16px] border-2 border-line bg-paper text-ink text-[19px] font-extrabold hover:border-forest">
          ← Back to sign-in
        </button>
      </div>
    </div>
  );
}

function Stores({ secret, screen, onPickStore, onLabels, onBack }:
  { secret: string; screen: Extract<Screen, { kind: 'stores' }>; onPickStore: (s: KioskStore) => void;
    onLabels: (labels: KioskLabel[]) => void; onBack: () => void }) {
  const linesByStore = groupLinesBySupplier(screen.lines);
  const allStoresHaveLines = screen.stores.every((s) => (linesByStore.get(s.supplierId)?.length ?? 0) > 0);
  const [finishing, setFinishing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // §4.2/§4.3: One-tap finish. No intermediate "Almost done" screen; POST
  // completion and hand the returned label manifest straight to <Labels/>,
  // which auto-fires the printer on mount. Notes/timeIssues are passed null
  // (they were optional textareas today; drivers left them blank ~always).
  async function finish() {
    if (!allStoresHaveLines || finishing) return;
    setFinishing(true); setErr(null);
    try {
      const r = await kiosk.complete(secret, screen.dropoffId, null, null);
      onLabels(r.data.labels);
    } catch (e: any) {
      setErr(e?.message || 'Could not finish — please try again.');
      setFinishing(false);
    }
  }

  return (
    <Center>
      <div className="text-[36px] font-extrabold text-forest text-center">Hi {screen.volunteerName.split(' ')[0]}!</div>
      <div className="text-[22px] text-muted mt-2 text-center">
        Here are the stores you picked up from today. Tap each one and enter what you brought.
      </div>
      <div className="mt-8 w-full max-w-[720px] space-y-3">
        {screen.stores.map((s) => {
          const done = (linesByStore.get(s.supplierId)?.length ?? 0) > 0;
          return (
            <button key={s.supplierId}
                    onClick={() => onPickStore(s)}
                    className="w-full flex items-center gap-4 rounded-[18px] border-[2px] border-line bg-paper px-6 py-5 text-left hover:border-forest transition">
              <div className={`w-14 h-14 rounded-full flex items-center justify-center text-[22px] font-extrabold shrink-0 ${done ? 'bg-forest text-paper' : 'bg-sage text-forest border-2 border-sage-line'}`}>
                {done ? '✓' : (linesByStore.get(s.supplierId)?.length ?? 0)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[26px] font-extrabold text-ink truncate">{s.supplierName}</div>
                <div className="text-[16px] text-muted mt-0.5">
                  {done
                    ? `${linesByStore.get(s.supplierId)!.length} item${linesByStore.get(s.supplierId)!.length === 1 ? '' : 's'} entered · tap to edit`
                    : 'Not yet entered — tap to add items'}
                </div>
              </div>
              <div className="text-[26px] text-forest">→</div>
            </button>
          );
        })}
      </div>
      {/* C5 Aug 13 — recently-completed drop-offs from the last 14 days
          so a driver can identify a pickup they need reprinted labels for.
          Reprint action lives at the office for now (they can look up ref#). */}
      {screen.recentCompleted && screen.recentCompleted.length > 0 && (
        <div className="mt-10 w-full max-w-[720px]">
          <div className="text-[15px] uppercase tracking-[.15em] font-extrabold text-muted mb-2">Recently completed</div>
          <div className="space-y-2">
            {screen.recentCompleted.map((rc) => (
              <div key={rc.pickupId}
                   className="w-full flex items-center gap-4 rounded-[16px] border border-line bg-cream/60 px-5 py-3 text-left">
                <span className="text-[15px] font-extrabold tracking-widest bg-paper border border-line text-forest px-2.5 py-0.5 rounded-full">
                  #{rc.refNumber ?? rc.pickupId}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-[19px] font-extrabold text-ink truncate">{rc.supplierName}</div>
                  <div className="text-[14px] text-muted mt-0.5">
                    {rc.completedAt
                      ? new Date(rc.completedAt).toLocaleString('en-US', { month:'short', day:'numeric', hour:'numeric', minute:'2-digit', hour12:true })
                      : String(rc.scheduledDate).slice(0, 10)}
                    {' · '}
                    {rc.labelsPrinted ? <span className="text-forest font-bold">Labels printed</span> : <span className="text-clay font-bold">No labels yet</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {err && <div className="text-clay text-[19px] font-bold text-center bg-clay/10 rounded-[16px] py-3 px-4 mt-6 max-w-[560px]">{err}</div>}
      <PrimaryButton onClick={finish} disabled={!allStoresHaveLines || finishing} className="mt-10">
        {finishing
          ? 'Finishing + printing labels…'
          : allStoresHaveLines
            ? 'Done — finish + print labels'
            : `Enter items for ${screen.stores.length - Array.from(linesByStore.keys()).length} more store(s)`}
      </PrimaryButton>
      <button onClick={onBack} disabled={finishing}
              className="mt-4 text-[16px] font-bold text-muted underline underline-offset-2 py-2 disabled:opacity-40">
        ← Back to sign-in
      </button>
    </Center>
  );
}

function StoreEntry({ secret, screen, onDone }:
  { secret: string; screen: Extract<Screen, { kind: 'entry' }>; onDone: (lines: KioskLine[]) => void }) {
  const [lines, setLines] = useState<KioskLine[]>(() => screen.lines.filter((l) => l.supplierId === screen.store.supplierId));
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [unit, setUnit] = useState<string>('box');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const canAdd = !!category && quantity >= 1;

  async function addLine() {
    if (!canAdd) return;
    setBusy(true); setErr(null);
    try {
      const r = await kiosk.addLine(secret, {
        dropoffId: screen.dropoffId,
        supplierId: screen.store.supplierId,
        pickupInstanceId: screen.store.pickupIds[0] ?? null,
        category, description: description.trim() || null, quantity, unit,
      });
      setLines((L) => [...L, r.data]);
      setCategory(''); setDescription(''); setQuantity(1); setUnit('box');
    } catch (e: any) { setErr(e?.message || 'Could not add — please try again.'); }
    finally { setBusy(false); }
  }
  async function removeLine(id: number) {
    setBusy(true); setErr(null);
    try {
      await kiosk.deleteLine(secret, id);
      setLines((L) => L.filter((l) => l.id !== id));
    } catch (e: any) { setErr(e?.message || 'Could not delete.'); }
    finally { setBusy(false); }
  }

  function finish() {
    const kept = screen.lines.filter((l) => l.supplierId !== screen.store.supplierId).concat(lines);
    onDone(kept);
  }

  return (
    <div className="h-full w-full grid grid-rows-[auto_1fr_auto] gap-4 p-8">
      <div>
        <div className="text-[16px] text-muted uppercase tracking-[.08em] font-extrabold">Store</div>
        <div className="text-[36px] font-extrabold text-forest">{screen.store.supplierName}</div>
      </div>

      <div className="grid grid-cols-2 gap-6 overflow-hidden">
        {/* Left: entry form */}
        <div className="space-y-4 overflow-y-auto pr-2">
          <div>
            <FieldLabel>Category</FieldLabel>
            <div className="flex flex-wrap gap-2 mt-2">
              {CATEGORIES.map((c) => (
                <ChipButton key={c} on={category === c} onClick={() => setCategory(c)}>{c}</ChipButton>
              ))}
            </div>
          </div>
          <div>
            <FieldLabel>Description (optional)</FieldLabel>
            <KioskInput placeholder="e.g. Whole wheat challah rolls (skip if it's just plain category)" value={description} onChange={setDescription} />
          </div>
          <div>
            <FieldLabel>Container type</FieldLabel>
            <div className="flex flex-wrap gap-2 mt-2">
              {UNITS.map((u) => (
                <ChipButton key={u} on={unit === u} onClick={() => setUnit(u)}>{u}</ChipButton>
              ))}
            </div>
          </div>
          <div>
            <FieldLabel>How many {unit}{quantity === 1 ? '' : 's'}?</FieldLabel>
            <QtyStepper value={quantity} onChange={setQuantity} />
          </div>
          {err && <div className="text-clay text-[17px] font-bold bg-clay/10 rounded-[12px] py-2 px-3">{err}</div>}
          <button onClick={addLine} disabled={!canAdd || busy}
                  className="w-full py-5 rounded-[18px] bg-forest text-paper text-[22px] font-extrabold disabled:opacity-40">
            {busy ? 'Adding…' : `Add ${quantity} ${unit}${quantity === 1 ? '' : 's'} of ${category || 'item'}`}
          </button>
        </div>

        {/* Right: entered so far */}
        <div className="rounded-[18px] border-[2px] border-line bg-cream/40 p-4 overflow-y-auto">
          <div className="text-[15px] font-extrabold uppercase tracking-[.08em] text-muted mb-2">Entered so far</div>
          {lines.length === 0
            ? <div className="text-[18px] text-muted">Nothing yet. Add your first line on the left.</div>
            : (
              <div className="space-y-2">
                {lines.map((l) => (
                  <div key={l.id} className="flex items-start gap-3 rounded-[14px] bg-paper border border-line px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-[20px] font-extrabold text-ink">{l.quantity} × {l.unit}{l.quantity === 1 ? '' : 's'}</div>
                      <div className="text-[16px] text-forest font-bold mt-0.5">{l.category}</div>
                      <div className="text-[16px] text-ink/80 mt-0.5">{l.description}</div>
                    </div>
                    <button onClick={() => removeLine(l.id)} className="text-clay text-[15px] font-extrabold px-3 py-1 rounded-[10px] hover:bg-clay/10">
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
        </div>
      </div>

      <div className="flex gap-4">
        <button onClick={() => onDone(screen.lines)}
                className="flex-1 py-5 rounded-[18px] border-2 border-line bg-paper text-ink text-[20px] font-extrabold hover:border-forest">
          ← Back to stores
        </button>
        <button onClick={finish} disabled={lines.length === 0}
                className="flex-[2] py-5 rounded-[18px] bg-forest text-paper text-[22px] font-extrabold disabled:opacity-40">
          Store complete — {lines.length} line{lines.length === 1 ? '' : 's'}
        </button>
      </div>
    </div>
  );
}

function Labels({ labels, volunteerName, kioskSecret, onFinish }:
  { labels: KioskLabel[]; volunteerName: string; kioskSecret: string; onFinish: () => void }) {
  const [status, setStatus] = useState<'printing' | 'ok' | 'err'>('printing');
  const [transport, setTransport] = useState<'relay' | 'tcp' | 'browser' | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const started = useRef(false);

  async function doPrint() {
    setStatus('printing'); setErr(null);
    await new Promise((r) => setTimeout(r, 200));
    const res = await printLabels(labels, { kioskSecret });
    setTransport(res.transport);
    if (res.ok) setStatus('ok');
    else { setStatus('err'); setErr(res.error ?? 'unknown error'); }
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void doPrint();
  }, []);

  return (
    <>
      {/* On-screen confirmation (hidden when the browser print dialog is used). */}
      <div className="no-print h-full w-full flex flex-col items-center justify-center p-8">
        <div className="text-[80px]">{status === 'err' ? '⚠️' : '✅'}</div>
        <div className="text-[42px] font-extrabold text-forest text-center mt-2">
          {status === 'err' ? 'Print failed' : `Thank you, ${volunteerName.split(' ')[0]}!`}
        </div>
        <div className="text-[22px] text-muted text-center mt-2">
          {status === 'printing' && `Printing ${labels.length} label${labels.length === 1 ? '' : 's'}…`}
          {status === 'ok' && (transport === 'browser'
            ? 'Follow the print dialog to release the labels.'
            : `${labels.length} label${labels.length === 1 ? '' : 's'} sent to the printer${transport === 'relay' ? ' (via relay).' : '.'}`)}
          {status === 'err' && (err || 'Printer not reachable.')}
        </div>
        <div className="mt-8 flex gap-4">
          <button onClick={doPrint}
                  className="py-4 px-6 rounded-[16px] border-2 border-forest text-forest text-[19px] font-extrabold hover:bg-sage/40">
            {status === 'err' ? 'Try again' : 'Reprint labels'}
          </button>
          <button onClick={onFinish}
                  className="py-4 px-8 rounded-[16px] bg-forest text-paper text-[19px] font-extrabold">
            Done
          </button>
        </div>
      </div>

      {/* Print-only label sheet — only used by the browser fallback. */}
      <div className="print-only">
        {labels.map((lb, i) => <LabelPage key={i} label={lb} />)}
      </div>
    </>
  );
}

function LabelPage({ label }: { label: KioskLabel }) {
  // Each label is a full page (3-inch square) with a 3-inch circle centered.
  // Round-die thermal labels: printer only sees the paper as square; the die
  // hides everything outside the circle. Content clips inside the circle.
  return (
    <div className="label-page">
      <div className="label-circle">
        <div className="label-store">{label.supplierName}</div>
        <div className="label-date">{label.date}</div>
        <div className="label-idx">{label.index} of {label.total}</div>
        <div className="label-desc">{label.description}</div>
        <div className="label-meta">{label.category} · {label.unit}</div>
      </div>
    </div>
  );
}

// ---------------- Primitives ----------------

function FullPage({ children }: { children: React.ReactNode }) {
  return <div className="fixed inset-0 bg-cream text-ink overflow-hidden">{children}</div>;
}
function Center({ children }: { children: React.ReactNode }) {
  return <div className="h-full w-full flex flex-col items-center justify-center p-10">{children}</div>;
}
function Big({ children }: { children: React.ReactNode }) {
  return <div className="text-[42px] font-extrabold text-forest text-center leading-tight">{children}</div>;
}
function FieldLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-[15px] font-extrabold uppercase tracking-[.08em] text-muted">{children}</div>;
}
function KioskInput({ value, onChange, placeholder, autoFocus }: {
  value: string; onChange: (v: string) => void; placeholder?: string; autoFocus?: boolean;
}) {
  return (
    <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoFocus={autoFocus}
           className="w-full rounded-[16px] border-[2px] border-line bg-paper px-5 py-4 text-[24px] outline-none focus:border-forest" />
  );
}
function PrimaryButton({ onClick, disabled, children, className = '' }: {
  onClick: () => void; disabled?: boolean; children: React.ReactNode; className?: string;
}) {
  return (
    <button onClick={onClick} disabled={disabled}
            className={`w-full max-w-[560px] py-6 rounded-[20px] bg-forest text-paper text-[24px] font-extrabold disabled:opacity-40 ${className}`}>
      {children}
    </button>
  );
}
function ChipButton({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
            className={`px-5 py-3 rounded-full text-[19px] font-bold border-2 ${on ? 'bg-forest text-paper border-forest' : 'bg-paper text-ink border-line hover:border-forest'}`}>
      {children}
    </button>
  );
}
function QtyStepper({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center gap-3 mt-2">
      <button onClick={() => onChange(Math.max(1, value - 1))}
              className="w-16 h-16 rounded-full bg-paper border-2 border-line text-[32px] font-extrabold text-forest hover:border-forest">–</button>
      <div className="min-w-[120px] text-center text-[42px] font-extrabold text-ink">{value}</div>
      <button onClick={() => onChange(Math.min(200, value + 1))}
              className="w-16 h-16 rounded-full bg-paper border-2 border-line text-[32px] font-extrabold text-forest hover:border-forest">+</button>
    </div>
  );
}

// ---------------- Helpers ----------------
function groupLinesBySupplier(lines: KioskLine[]): Map<number, KioskLine[]> {
  const m = new Map<number, KioskLine[]>();
  for (const l of lines) {
    const arr = m.get(l.supplierId) ?? [];
    arr.push(l); m.set(l.supplierId, arr);
  }
  return m;
}
