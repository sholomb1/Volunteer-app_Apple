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
  | { kind: 'stores'; dropoffId: number; volunteerName: string; stores: KioskStore[]; lines: KioskLine[] }
  | { kind: 'entry';  dropoffId: number; volunteerName: string; stores: KioskStore[]; lines: KioskLine[]; store: KioskStore }
  | { kind: 'complete'; dropoffId: number; volunteerName: string; stores: KioskStore[]; lines: KioskLine[] }
  | { kind: 'labels';  labels: KioskLabel[]; volunteerName: string };

const CATEGORIES = ['Dairy', 'Produce', 'Bakery', 'Prepared', 'Frozen', 'Grocery / Dry', 'Meat / Fish', 'Other'];
const UNITS      = ['box', 'tray', 'container', 'bag'];

export function KioskApp() {
  const { secret = '' } = useParams<{ secret: string }>();
  const [screen, setScreen] = useState<Screen>({ kind: 'welcome' });
  const [showHelp, setShowHelp] = useState(false);

  // Kiosk-mode CSS on the root html: hide scroll, lock font, disable text-select
  useEffect(() => {
    const prev = document.documentElement.style.cssText;
    document.documentElement.style.cssText = 'font-size:18px; overflow:hidden; user-select:none;';
    document.body.style.cursor = 'default';
    return () => { document.documentElement.style.cssText = prev; };
  }, []);

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
      {screen.kind === 'welcome'  && <Welcome onStart={() => setScreen({ kind: 'signin' })} />}
      {screen.kind === 'signin'   && <Signin  secret={secret}
        onSigned={(d) => setScreen({ kind: 'stores', dropoffId: d.dropoffId, volunteerName: d.volunteerName, stores: d.stores, lines: [] })}
        onAdminPick={(p) => setScreen({ kind: 'picker', ...p })}
        onNamePick={(code, cs) => setScreen({ kind: 'namePicker', code, candidates: cs })}
        onWalkIn={(w) => setScreen({ kind: 'vendorPicker', ...w })} />}
      {screen.kind === 'namePicker' && <NamePicker secret={secret} screen={screen}
        onCancel={() => setScreen({ kind: 'signin' })}
        onSigned={(d) => setScreen({ kind: 'stores', dropoffId: d.dropoffId, volunteerName: d.volunteerName, stores: d.stores, lines: [] })}
        onWalkIn={(w) => setScreen({ kind: 'vendorPicker', ...w })} />}
      {screen.kind === 'picker'   && <DriverPicker secret={secret} screen={screen}
        onCancel={() => setScreen({ kind: 'signin' })}
        onSigned={(d) => setScreen({ kind: 'stores', dropoffId: d.dropoffId, volunteerName: d.volunteerName, stores: d.stores, lines: [] })} />}
      {screen.kind === 'vendorPicker' && <VendorPicker screen={screen}
        onPick={(store) => setScreen({ kind: 'stores', dropoffId: screen.dropoffId, volunteerName: screen.volunteerName, stores: [store], lines: [] })}
        onManualEntry={() => setScreen({ kind: 'manualVendor', dropoffId: screen.dropoffId, volunteerName: screen.volunteerName })}
        onCancel={() => setScreen({ kind: 'signin' })} />}
      {screen.kind === 'manualVendor' && <ManualVendor secret={secret} screen={screen}
        onCreated={(store) => setScreen({ kind: 'stores', dropoffId: screen.dropoffId, volunteerName: screen.volunteerName, stores: [store], lines: [] })}
        onCancel={() => setScreen({ kind: 'signin' })} />}
      {screen.kind === 'stores'   && <Stores  screen={screen}
        onPickStore={(s) => setScreen({ ...screen, kind: 'entry', store: s })}
        onDone={() => setScreen({ ...screen, kind: 'complete' })} />}
      {screen.kind === 'entry'    && <StoreEntry secret={secret} screen={screen}
        onDone={(newLines) => setScreen({ kind: 'stores', dropoffId: screen.dropoffId, volunteerName: screen.volunteerName, stores: screen.stores, lines: newLines })} />}
      {screen.kind === 'complete' && <Complete secret={secret} screen={screen}
        onLabels={(labels) => setScreen({ kind: 'labels', labels, volunteerName: screen.volunteerName })} />}
      {screen.kind === 'labels'   && <Labels  labels={screen.labels} volunteerName={screen.volunteerName}
        kioskSecret={secret}
        onFinish={() => setScreen({ kind: 'welcome' })} />}
      {/* Always-available help — a "?" in the top-right that pops up the 5-step guide. */}
      <button onClick={() => setShowHelp(true)}
              className="fixed top-3 right-3 z-40 h-11 w-11 rounded-full bg-forest text-paper text-[22px] font-extrabold shadow-lift active:scale-95"
              aria-label="How to use this kiosk">
        ?
      </button>
      {showHelp && <HelpOverlay onClose={() => setShowHelp(false)} />}
    </FullPage>
  );
}

/**
 * How-to overlay — mirrors the printed quick-card. Shows on top of every
 * kiosk screen so a volunteer or guest can pull it up mid-flow.
 */
function HelpOverlay({ onClose }: { onClose: () => void }) {
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

        <div className="mt-8 flex justify-end">
          <button onClick={onClose}
                  className="bg-forest text-paper font-extrabold text-[17px] px-8 py-3 rounded-full shadow-lift active:scale-95">
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

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
  // 5-tap escape: five taps on the "Kiosk mode" footer within 3s clears the
  // device flag and reloads to the normal portal. Hidden from drivers on
  // purpose — it looks like a plain text label.
  const tapsRef = useRef<number[]>([]);
  function onEscapeTap() {
    const now = Date.now();
    tapsRef.current = tapsRef.current.filter((t) => now - t < 3000).concat(now);
    if (tapsRef.current.length >= 5) {
      kioskDevice.clear();
      // Reset to root — App.tsx will render the normal login/portal now
      // that localStorage is clear. Use hard reload to drop any in-flight
      // state (queries, session storage, sw registrations for the kiosk).
      window.location.href = window.location.origin + (import.meta.env.BASE_URL || '/');
    }
  }

  return (
    <Center>
      <div className="text-[64px] font-extrabold text-forest leading-tight text-center">Zeh L'Zeh</div>
      <div className="text-[26px] text-muted mt-2 text-center">Office drop-off kiosk</div>
      <div className="text-[19px] text-ink/70 mt-8 text-center max-w-[520px]">
        Welcome back. Tap Start to sign in your pickup.
      </div>
      <PrimaryButton onClick={onStart} className="mt-10">Start sign-in</PrimaryButton>
      <button onClick={onEscapeTap}
              className="fixed bottom-4 right-4 text-[11px] text-muted/50 tracking-wide select-none">
        Kiosk mode
      </button>
    </Center>
  );
}

function Signin({ secret, onSigned, onAdminPick, onNamePick, onWalkIn }: {
  secret: string;
  onSigned: (d: { dropoffId: number; volunteerName: string; stores: KioskStore[] }) => void;
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

  return (
    <Center>
      <Big>Enter your 4-digit code</Big>
      <div className="text-[19px] text-muted mt-3 text-center max-w-[540px]">
        The last 4 digits of the phone number we have on file.
      </div>
      {/* Code display */}
      <div className="mt-8 flex gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i}
               className={`w-16 h-20 rounded-[14px] border-[2px] flex items-center justify-center text-[38px] font-extrabold ${code[i] ? 'bg-sage/50 border-forest text-forest' : 'bg-paper border-line text-muted'}`}>
            {code[i] ? '•' : ''}
          </div>
        ))}
      </div>
      {err && <div className="text-clay text-[18px] font-bold text-center bg-clay/10 rounded-[16px] py-3 px-4 mt-6 max-w-[540px]">{err}</div>}

      {/* Number pad */}
      <div className="mt-8 grid grid-cols-3 gap-3 w-full max-w-[400px]">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
          <KeyBtn key={n} onClick={() => addDigit(String(n))}>{n}</KeyBtn>
        ))}
        <KeyBtn onClick={backspace} muted>←</KeyBtn>
        <KeyBtn onClick={() => addDigit('0')}>0</KeyBtn>
        <KeyBtn onClick={() => setCode('')} muted>clear</KeyBtn>
      </div>

      <div className="mt-10 flex flex-col items-center gap-2">
        <button onClick={() => { setGuestMode(true); setErr(null); }}
                className="text-[16px] font-extrabold text-forest underline underline-offset-2 py-2">
          Continue as guest →
        </button>
        <button onClick={() => { setPwMode(true); setErr(null); }}
                className="text-[14px] font-bold text-muted underline underline-offset-2 py-2">
          Sign in with email &amp; password instead
        </button>
      </div>
    </Center>
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
  onSigned: (d: { dropoffId: number; volunteerName: string; stores: KioskStore[] }) => void;
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
  const [name, setName]       = useState('');
  const [address, setAddress] = useState('');
  const [busy, setBusy]       = useState(false);
  const [err, setErr]         = useState<string | null>(null);

  async function submit() {
    if (!name.trim()) { setErr('Please enter the store or supplier name.'); return; }
    setBusy(true); setErr(null);
    try {
      const r = await kiosk.manualVendor(secret, { name: name.trim(), address: address.trim() });
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
    <div className="h-full w-full grid grid-rows-[auto_1fr_auto] gap-4 p-8">
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
                 placeholder='e.g. "Costco Monsey"'
                 className="w-full rounded-[16px] border-[2px] border-line bg-paper px-5 py-4 text-[22px] outline-none focus:border-forest" />
        </div>
        <div>
          <div className="text-[15px] font-extrabold uppercase tracking-[.08em] text-muted mb-2">Full pickup address</div>
          <AddressAutocomplete
            value={address}
            onChange={setAddress}
            placeholder="Start typing an address…"
          />
          <div className="text-[13px] text-muted mt-1">Suggestions from Google Maps.</div>
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
  onSigned: (d: { dropoffId: number; volunteerName: string; stores: KioskStore[] }) => void;
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

function Stores({ screen, onPickStore, onDone }:
  { screen: Extract<Screen, { kind: 'stores' }>; onPickStore: (s: KioskStore) => void; onDone: () => void }) {
  const linesByStore = groupLinesBySupplier(screen.lines);
  const allStoresHaveLines = screen.stores.every((s) => (linesByStore.get(s.supplierId)?.length ?? 0) > 0);
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
      <PrimaryButton onClick={onDone} disabled={!allStoresHaveLines} className="mt-10">
        {allStoresHaveLines ? 'Done — finish drop-off' : `Enter items for ${screen.stores.length - Array.from(linesByStore.keys()).length} more store(s)`}
      </PrimaryButton>
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

function Complete({ secret, screen, onLabels }:
  { secret: string; screen: Extract<Screen, { kind: 'complete' }>; onLabels: (labels: KioskLabel[]) => void }) {
  const [notes, setNotes] = useState('');
  const [timeIssues, setTimeIssues] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setBusy(true); setErr(null);
    try {
      const r = await kiosk.complete(secret, screen.dropoffId, notes.trim() || null, timeIssues.trim() || null);
      onLabels(r.data.labels);
    } catch (e: any) { setErr(e?.message || 'Could not complete — please try again.'); }
    finally { setBusy(false); }
  }

  const totalContainers = screen.lines.reduce((n, l) => n + Number(l.quantity), 0);

  return (
    <Center>
      <Big>Almost done — anything to tell the office?</Big>
      <div className="mt-8 w-full max-w-[720px] space-y-4">
        <div>
          <FieldLabel>Time delays or issues (optional)</FieldLabel>
          <KioskTextarea placeholder="e.g. Store was 30 min late opening; asked me to come back tomorrow"
                         value={timeIssues} onChange={setTimeIssues} />
        </div>
        <div>
          <FieldLabel>Notes or feedback (optional)</FieldLabel>
          <KioskTextarea placeholder="Anything the office should know"
                         value={notes} onChange={setNotes} />
        </div>
        <div className="rounded-[16px] bg-sage/40 border border-sage-line px-5 py-4">
          <div className="text-[18px] text-ink">
            We'll print <span className="font-extrabold text-forest">{totalContainers}</span> label{totalContainers === 1 ? '' : 's'} across <span className="font-extrabold text-forest">{new Set(screen.lines.map((l) => l.supplierId)).size}</span> store{new Set(screen.lines.map((l) => l.supplierId)).size === 1 ? '' : 's'}.
          </div>
        </div>
        {err && <div className="text-clay text-[19px] font-bold text-center bg-clay/10 rounded-[16px] py-3 px-4">{err}</div>}
        <PrimaryButton onClick={submit} disabled={busy}>
          {busy ? 'Finishing…' : 'Finish + print labels'}
        </PrimaryButton>
      </div>
    </Center>
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
function KioskTextarea({ value, onChange, placeholder }: {
  value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={3}
              className="w-full rounded-[16px] border-[2px] border-line bg-paper px-5 py-3 text-[20px] outline-none focus:border-forest resize-none" />
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
