/**
 * Oct 30 client (owner approved the new kiosk design — mockup /root/qa-shots/kiosk-proposal):
 * the quick drop-off kiosk, the default at the kiosk URL (the old detailed flow stays at ?classic=1).
 *
 *   code pad → "Hi Moshe K. #20" [Yes, that's me] [Not me]   (two drivers on one code: "Tap your name")
 *   → Where is this food from? (today's pickups first, + a different store, + store not on the list)
 *   → What did you bring? Trays · Boxes · Bags · Cases · Containers: each tap adds a line
 *     "Trays [−] 3 [+]" + Fleishig · Milchig · Pareve · Mixed · Not sure (no kind = Not sure)
 *   → Labels: N will print (round preview) [Print N labels] [Don't need labels]
 *   → Printing labels… (2 of 6; "Don't need labels" stops the rest — the drop-off is already saved)
 *   → Thank you! Any feedback? [Yes, tell us] [No thanks], 8-second countdown back to the start
 *   → Tell us … [Send] → the office (text + bell + problem reports).
 * 60 s with no touch on any screen → back to the start (not while printing; typing feedback waits longer).
 *
 * Laid out on a fixed design stage — 800×1280 when the tablet stands upright (portrait, the normal
 * way) and 1280×800 in landscape — scaled to fit the real screen, like the mockup, so a 1200×1920
 * tablet gets the same layout, just bigger.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { kiosk, type KioskLabel, type QuickLookupData } from './kiosk-api';
import { printLabelsStepwise, buildLabelTspl, kioskLabelFace } from './label-print'; // Oct 31 client: + print log
import { NameTagScanner } from './name-tag-scan';
import { TapButton } from './tap-button';
import { LabelPage, LabelPreview } from './label-face';

// ---------------- design stage ----------------
type StageInfo = { portrait: boolean; W: number; H: number; k: number; x: number; y: number };
function measure(): StageInfo {
  const w = window.innerWidth || 800, h = window.innerHeight || 1280;
  const portrait = h >= w;
  const W = portrait ? 800 : 1280, H = portrait ? 1280 : 800;
  const k = Math.min(w / W, h / H);
  return { portrait, W, H, k, x: (w - W * k) / 2, y: (h - H * k) / 2 };
}
function useStage(): StageInfo {
  const [s, setS] = useState<StageInfo>(measure);
  useEffect(() => {
    const on = () => setS(measure());
    window.addEventListener('resize', on);
    window.addEventListener('orientationchange', on);
    return () => { window.removeEventListener('resize', on); window.removeEventListener('orientationchange', on); };
  }, []);
  return s;
}

// ---------------- food ----------------
export type Container = 'tray' | 'box' | 'bag' | 'case' | 'container';
export type Kind = 'fleishig' | 'milchig' | 'pareve' | 'mixed' | 'notsure';
const CONTAINERS: Container[] = ['tray', 'box', 'bag', 'case', 'container'];
const CNAME: Record<Container, [string, string, string]> = {
  tray: ['Trays', 'tray', 'trays'], box: ['Boxes', 'box', 'boxes'], bag: ['Bags', 'bag', 'bags'],
  case: ['Cases', 'case', 'cases'], container: ['Containers', 'container', 'containers'],
};
const KINDS: Kind[] = ['fleishig', 'milchig', 'pareve', 'mixed', 'notsure'];
const KNAME: Record<Kind, string> = { fleishig: 'Fleishig', milchig: 'Milchig', pareve: 'Pareve', mixed: 'Mixed', notsure: 'Not sure' };
// Chip colours from the mockup (clay / sky / sage / amber / plain).
const KSTYLE: Record<Kind, { bg: string; fg: string; bd: string }> = {
  fleishig: { bg: '#F7E4D6', fg: '#8A4523', bd: '#EBC7AE' },
  milchig:  { bg: '#DCE9F0', fg: '#2B5470', bd: '#BCD3E1' },
  pareve:   { bg: '#E5EEE2', fg: '#2C5A3B', bd: '#CFE0CC' },
  mixed:    { bg: '#FBEBC8', fg: '#7A5713', bd: '#F0D79C' },
  notsure:  { bg: '#FFFFFF', fg: '#6E7C70', bd: '#E0D8C6' },
};
const NOT_SURE_NOTE = "That's fine, our team will look into it.";

type Line = { id: number; place: string; container: Container; count: number; kind: Kind | null; open: boolean };
type Place = { key: string; pickupId: number | null; supplierId: number | null; otherName: string | null; label: string; sub: string; time: string };
type Who = { volunteerId: number | null; name: string; firstName: string; unitNumber: number | null; guestPhone?: string };
type VendorOption = { supplierId: number; supplierName: string; city: string };
type NameCandidate = { volunteerId: number; name: string };

const plural = (c: Container, n: number) => (n === 1 ? CNAME[c][1] : CNAME[c][2]);
const lineText = (l: Line) => `${l.count} ${plural(l.container, l.count)}${l.kind ? ` ${KNAME[l.kind].toLowerCase()}` : ''}`;
const shortName = (name: string) => {
  const p = name.trim().split(/\s+/).filter(Boolean);
  return p.length > 1 ? `${p[0]} ${p[p.length - 1][0].toUpperCase()}.` : (p[0] ?? '');
};
const whoText = (w: Who | null) => (w ? `${w.volunteerId ? shortName(w.name) : w.name}${w.unitNumber != null ? ` #${w.unitNumber}` : ''}` : '');

function quickTime(time: string | null): string {
  if (!time) return '';
  const [h, m] = time.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}
function quickDay(date: string): string {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  return date === today ? 'Today' : 'Yesterday';
}
/** Same date text the server prints on the label ("Fri, Oct 30"). */
const labelDate = () => new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric' });

const QUICK_IDLE_MS = 60 * 1000;
const FEEDBACK_IDLE_MS = 3 * 60 * 1000; // typing feedback: wait longer, but never stay stuck forever
const THANKS_SECONDS = 8;

type Step =
  | { kind: 'code' }
  | { kind: 'confirm'; data: QuickLookupData }
  | { kind: 'names'; code: string; candidates: NameCandidate[] }
  | { kind: 'guest' }
  | { kind: 'pick' }
  | { kind: 'food' }
  | { kind: 'labels' }
  | { kind: 'printing' }
  | { kind: 'thanks' }
  | { kind: 'feedback' }
  | { kind: 'sent' };

// ---------------- icons (from the mockup) ----------------
const S = '#2C5A3B', F = '#E5EEE2';
function CIcon({ c, size }: { c: Container; size: number }) {
  const p = { width: size, height: size, viewBox: '0 0 96 96', fill: 'none', stroke: S, strokeWidth: 4, strokeLinejoin: 'round' as const, 'aria-hidden': true };
  if (c === 'tray') return <svg {...p}><path d="M10 40h76l-8 26H18z" fill={F} /><path d="M6 40h84" /><path d="M24 32c4-6 10-6 14 0M44 30c4-6 10-6 14 0M62 32c3-5 8-5 11 0" strokeLinecap="round" /></svg>;
  if (c === 'box') return <svg {...p}><path d="M14 34l34-14 34 14v38L48 86 14 72z" fill={F} /><path d="M14 34l34 14 34-14M48 48v38" /></svg>;
  if (c === 'bag') return <svg {...p}><path d="M20 34h56l-5 50H25z" fill={F} /><path d="M36 34v-6a12 12 0 0124 0v6" strokeLinecap="round" /></svg>;
  if (c === 'case') return <svg {...p}><rect x="12" y="52" width="34" height="30" fill={F} /><rect x="50" y="52" width="34" height="30" fill={F} /><rect x="31" y="20" width="34" height="30" fill={F} /><path d="M12 62h34M50 62h34M31 30h34" /></svg>;
  // container: a round deli container with its lid
  return <svg {...p}><path d="M22 42h52l-6 40H28z" fill={F} /><rect x="16" y="30" width="64" height="12" rx="4" fill="#fff" /><path d="M32 56h32" strokeLinecap="round" /></svg>;
}
function StoreIcon({ size }: { size: number }) {
  return <svg width={size} height={size} viewBox="0 0 48 48" fill="none" stroke={S} strokeWidth={3} strokeLinejoin="round" aria-hidden><path d="M6 18l4-10h28l4 10z" fill="#fff" /><path d="M8 18v22h32V18" /><path d="M20 40V28h8v12" /></svg>;
}
function PrinterIcon() {
  return <svg width={120} height={120} viewBox="0 0 120 120" fill="none" stroke={S} strokeWidth={5} strokeLinejoin="round" aria-hidden><rect x="30" y="14" width="60" height="30" fill="#fff" /><rect x="12" y="44" width="96" height="44" rx="10" fill={F} /><rect x="30" y="72" width="60" height="38" fill="#fff" /><path d="M40 84h40M40 96h28" strokeLinecap="round" /></svg>;
}
function Ring({ left, of }: { left: number; of: number }) {
  const C = 2 * Math.PI * 20, f = Math.max(0, left) / of;
  return (
    <svg width={48} height={48} viewBox="0 0 48 48" aria-hidden>
      <circle cx="24" cy="24" r="20" stroke="#EAE3D4" strokeWidth="5" fill="none" />
      <circle cx="24" cy="24" r="20" stroke={S} strokeWidth="5" fill="none" strokeDasharray={C} strokeDashoffset={C * (1 - f)} transform="rotate(-90 24 24)" strokeLinecap="round" />
      <text x="24" y="30" textAnchor="middle" fontSize="17" fontWeight="800" fill="#1C2A21">{left}</text>
    </svg>
  );
}

// ---------------- shared bits (mockup classes → Tailwind) ----------------
const BTN_PRIMARY = 'rounded-[22px] bg-forest text-paper font-extrabold inline-flex items-center justify-center gap-3 shadow-[0_6px_0_#1E3F29] disabled:opacity-35 disabled:shadow-none active:translate-y-[2px]';
const BTN_OUTLINE = 'rounded-[22px] bg-paper text-forest border-[3px] border-forest font-extrabold inline-flex items-center justify-center';
const BTN_QUIET = 'rounded-[16px] bg-paper text-muted border-2 border-line-2 font-extrabold inline-flex items-center justify-center px-[26px]';
const LINK = 'text-[19px] font-extrabold text-muted underline underline-offset-4 py-[10px] px-1';
const H1 = 'font-extrabold text-forest leading-[1.08] tracking-[-.01em]';

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex items-center gap-[10px] bg-paper border-2 border-line rounded-full px-4 py-[9px] text-[18px] font-extrabold text-ink whitespace-nowrap max-w-[330px] overflow-hidden">{children}</span>;
}
function WhoChip({ who }: { who: Who | null }) {
  if (!who) return null;
  return <Chip><span className="w-3 h-3 rounded-full bg-forest flex-none" />{whoText(who)}</Chip>;
}

// ======================================================================
export function QuickKiosk({ secret }: { secret: string }) {
  const stage = useStage();
  const P = stage.portrait;
  const [step, setStep] = useState<Step>({ kind: 'code' });
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [who, setWho] = useState<Who | null>(null);
  const [rows, setRows] = useState<Place[]>([]);            // the driver's pickups (today / yesterday)
  const [stores, setStores] = useState<VendorOption[]>([]);
  const [search, setSearch] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [newStore, setNewStore] = useState<string | null>(null);
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [places, setPlaces] = useState<Place[]>([]);        // stores food came from, in order
  const [cur, setCur] = useState<string | null>(null);      // the store on the food screen
  const [lines, setLines] = useState<Line[]>([]);
  const [labels, setLabels] = useState<KioskLabel[]>([]);
  const [dropoffId, setDropoffId] = useState<number | null>(null);
  const dropoffRef = useRef<number | null>(null); // Oct 31 client: print log (state is one render late)
  const [printed, setPrinted] = useState(0);
  const [printState, setPrintState] = useState<'printing' | 'err' | 'browser'>('printing');
  const [left, setLeft] = useState(THANKS_SECONDS);
  const [fb, setFb] = useState('');
  const [scanning, setScanning] = useState(false);
  const [savedText, setSavedText] = useState('');

  const requestId = useRef<string | null>(null); // Oct 9 client: one id per drop-off → saved once
  const saving = useRef(false);
  const stopPrint = useRef(false);
  const lineSeq = useRef(1);
  const linesBox = useRef<HTMLDivElement>(null);

  function resetAll() {
    requestId.current = null; saving.current = false; stopPrint.current = true;
    setStep({ kind: 'code' }); setCode(''); setBusy(false); setErr(null); setWho(null);
    setRows([]); setStores([]); setSearch(''); setShowAll(false); setNewStore(null);
    setGuestName(''); setGuestPhone(''); setPlaces([]); setCur(null); setLines([]);
    setLabels([]); setDropoffId(null); dropoffRef.current = null; setPrinted(0); setPrintState('printing'); setFb(''); setSavedText('');
    setScanning(false);
  }

  // 60 s with no touch → back to the start. Not while printing (the thank-you follows by itself);
  // typing feedback waits 3 minutes. Thank-you / sent have their own short timers.
  useEffect(() => {
    if (step.kind === 'code' && !code && !err) return;
    if (step.kind === 'printing' || step.kind === 'thanks' || step.kind === 'sent') return;
    const ms = step.kind === 'feedback' && fb.trim() ? FEEDBACK_IDLE_MS : QUICK_IDLE_MS;
    let t: ReturnType<typeof setTimeout> | null = null;
    const reset = () => { if (t) clearTimeout(t); t = setTimeout(resetAll, ms); };
    reset();
    const events = ['pointerdown', 'keydown', 'touchstart', 'wheel', 'input'];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    return () => { if (t) clearTimeout(t); events.forEach((e) => window.removeEventListener(e, reset)); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.kind, code, err, step.kind === 'feedback' && !!fb.trim()]);

  // Thank-you: visible 8-second countdown back to the start.
  useEffect(() => {
    if (step.kind !== 'thanks') return;
    setLeft(THANKS_SECONDS);
    const t = setInterval(() => setLeft((n) => n - 1), 1000);
    return () => clearInterval(t);
  }, [step.kind]);
  useEffect(() => { if (step.kind === 'thanks' && left <= 0) resetAll(); }, [left, step.kind]);
  // "Thanks, we got it." → start after 3 seconds.
  useEffect(() => {
    if (step.kind !== 'sent') return;
    const t = setTimeout(resetAll, 3000);
    return () => clearTimeout(t);
  }, [step.kind]);

  // ---------- sign in ----------
  function loadPicks(d: QuickLookupData) {
    // Hide pickups more than 2 hours away; newest first.
    const nowNY = new Date().toLocaleString('sv-SE', { timeZone: 'America/New_York' }).slice(0, 16).replace(' ', 'T');
    const soon = new Date(Date.parse(nowNY + ':00Z') + 2 * 3600e3).toISOString().slice(0, 16);
    const ps = (d.pickups ?? [])
      .map((p) => ({ ...p, at: `${p.date}T${p.time ?? '00:00'}` }))
      .filter((p) => p.at <= soon)
      .sort((a, b) => (a.at < b.at ? 1 : -1));
    setRows(ps.map((p) => ({
      key: `p:${p.pickupId}`, pickupId: p.pickupId, supplierId: p.supplierId, otherName: null, label: p.label,
      sub: [quickDay(p.date), quickTime(p.time)].filter(Boolean).join(' '), time: quickTime(p.time),
    })));
    setStores(d.allSuppliers ?? []);
    setShowAll(false); setSearch(''); setNewStore(null);
    setWho({ volunteerId: d.volunteerId, name: d.name, firstName: d.firstName || d.name.split(' ')[0], unitNumber: d.unitNumber ?? null });
    setStep({ kind: 'pick' });
  }

  async function lookup(c: string, resolveVolunteerId?: number) {
    setBusy(true); setErr(null);
    try {
      const r = await kiosk.quickLookup(secret, { code: c, resolveVolunteerId });
      if (r.data.needsPick) { setStep({ kind: 'names', code: c, candidates: r.data.candidates ?? [] }); return; }
      // Two drivers on one code: tapping the name is the confirmation.
      if (resolveVolunteerId) loadPicks(r.data);
      else setStep({ kind: 'confirm', data: r.data });
    } catch (e: any) {
      setErr(e?.status === 404 ? "We don't know that code. Try again." : (e?.message || 'Something went wrong. Please try again.'));
      setCode('');
    } finally { setBusy(false); }
  }
  // Oct 30 client: a scanned name tag = the same as typing the 4 digits (the tag already says who).
  async function lookupTag(token: string) {
    setScanning(false); setBusy(true); setErr(null);
    try { loadPicks((await kiosk.quickLookupQr(secret, token)).data); }
    catch (e: any) { setErr(e?.message || "This name tag wasn't recognized. Please type your 4-digit code."); }
    finally { setBusy(false); }
  }
  function addDigit(d: string) {
    if (busy || step.kind !== 'code') return;
    setErr(null);
    setCode((prev) => {
      const next = (prev + d).slice(0, 4);
      if (next.length === 4 && prev.length < 4) setTimeout(() => lookup(next), 80);
      return next;
    });
  }
  function backspace() { if (step.kind !== 'code') return; setErr(null); setCode((p) => p.slice(0, -1)); }
  function clearCode() { setErr(null); setCode(''); setStep({ kind: 'code' }); }

  useEffect(() => {
    if (step.kind !== 'code' && step.kind !== 'confirm') return;
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (/^[0-9]$/.test(e.key)) { e.preventDefault(); addDigit(e.key); }
      else if (e.key === 'Backspace') { e.preventDefault(); backspace(); }
      else if (e.key === 'Escape') { e.preventDefault(); clearCode(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.kind, busy]);

  async function startGuest() {
    if (!guestName.trim()) { setErr('Please enter your name.'); return; }
    setBusy(true); setErr(null);
    try {
      const r = await kiosk.quickStores(secret);
      setWho({ volunteerId: null, name: guestName.trim(), firstName: guestName.trim().split(/\s+/)[0], unitNumber: null, guestPhone: guestPhone.trim() });
      setRows([]); setStores(r.data); setShowAll(true); setSearch(''); setNewStore(null);
      setStep({ kind: 'pick' });
    } catch (e: any) { setErr(e?.message || 'Something went wrong. Please try again.'); }
    finally { setBusy(false); }
  }

  // ---------- stores + food ----------
  const usedPlaces = useMemo(() => new Set(lines.map((l) => l.place)), [lines]);
  function choose(p: Place) {
    setPlaces((ps) => (ps.some((x) => x.key === p.key) ? ps : [...ps, p]));
    setCur(p.key);
    setSearch(''); setShowAll(false); setNewStore(null); setErr(null);
    setStep({ kind: 'food' });
  }
  function leaveFood() {
    // A store with no food lines is dropped again.
    setPlaces((ps) => ps.filter((p) => p.key !== cur || usedPlaces.has(p.key)));
    setShowAll(false); setErr(null);
    setStep({ kind: 'pick' });
  }
  function addLine(c: Container) {
    if (!cur) return;
    const id = lineSeq.current++;
    setLines((ls) => [...ls.map((l) => (l.kind ? { ...l, open: false } : l)), { id, place: cur, container: c, count: 1, kind: null, open: true }]);
    setTimeout(() => { const b = linesBox.current; if (b) b.scrollTop = b.scrollHeight; }, 0);
  }
  function bump(id: number, d: number) {
    setLines((ls) => ls.flatMap((l) => (l.id !== id ? [l] : l.count + d <= 0 ? [] : [{ ...l, count: Math.min(300, l.count + d) }])));
  }
  function setKind(id: number, k: Kind) { setLines((ls) => ls.map((l) => (l.id === id ? { ...l, kind: k, open: false } : l))); }
  function reopen(id: number) { setLines((ls) => ls.map((l) => (l.id === id ? { ...l, open: true } : { ...l, open: l.kind ? false : l.open }))); }

  const live = lines.filter((l) => l.count > 0);
  const total = live.reduce((n, l) => n + l.count, 0);
  const curPlace = places.find((p) => p.key === cur) ?? null;
  const placeOrder = (k: string) => places.findIndex((p) => p.key === k);
  const ordered = [...live].sort((a, b) => placeOrder(a.place) - placeOrder(b.place) || a.id - b.id);
  const summaryOf = (ls: Line[]) => {
    const multi = new Set(ls.map((l) => l.place)).size > 1;
    const out: string[] = [];
    let last = '';
    for (const l of ls) {
      if (multi && l.place !== last) { out.push(places.find((p) => p.key === l.place)?.label ?? ''); last = l.place; }
      out.push(lineText(l));
    }
    return out.filter(Boolean).join(' · ');
  };

  // ---------- save + print ----------
  async function finish(print: boolean) {
    if (!who || ordered.length === 0 || saving.current) return;
    saving.current = true;
    if (!requestId.current) requestId.current = (globalThis.crypto as any)?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setBusy(true); setErr(null);
    try {
      const r = await kiosk.quickFinish(secret, {
        clientRequestId: requestId.current ?? undefined,
        volunteerId: who.volunteerId, guestName: who.volunteerId ? undefined : who.name, guestPhone: who.guestPhone || undefined,
        printLabels: print,
        items: ordered.map((l) => {
          const p = places.find((x) => x.key === l.place)!;
          return { pickupId: p.pickupId, supplierId: p.supplierId, otherName: p.otherName, count: l.count,
                   container: l.container, kind: l.kind ? KNAME[l.kind].toLowerCase() : null };
        }),
      });
      setDropoffId(r.data.dropoffId); dropoffRef.current = r.data.dropoffId;
      setSavedText(summaryOf(ordered.map((l) => ({ ...l, kind: l.kind ?? 'notsure' }))));
      if (print && r.data.labels.length) {
        setLabels(r.data.labels);
        void runPrint(r.data.labels, 0);
      } else {
        setStep({ kind: 'thanks' });
      }
    } catch (e: any) {
      setErr(e?.message || 'Something went wrong. Please try again.');
    } finally { setBusy(false); saving.current = false; }
  }
  async function runPrint(all: KioskLabel[], from: number) {
    stopPrint.current = false;
    setPrinted(from); setPrintState('printing'); setStep({ kind: 'printing' });
    const res = await printLabelsStepwise(all.slice(from), {
      kioskSecret: secret,
      onProgress: (n) => { if (!stopPrint.current) setPrinted(from + n); },
      stopped: () => stopPrint.current,
    });
    logPrint(all.slice(from), res); // Oct 31 client: print log (never blocks the kiosk)
    if (stopPrint.current) return; // "Don't need labels" / start over already moved on
    if (!res.ok) { console.warn('[kiosk] label print failed:', res.error ?? 'unknown'); setPrinted(from + res.printed); setPrintState('err'); return; }
    if (res.transport === 'browser') { setPrintState('browser'); return; }
    setStep({ kind: 'thanks' });
  }
  /** Oct 31 client: tell the office what was sent to the printer and what happened (Kiosk Activity → Printed labels). */
  function logPrint(sent: KioskLabel[], res: { transport: 'relay' | 'tcp' | 'browser'; ok: boolean; printed: number; stopped?: boolean; error?: string }) {
    try {
      const faces = sent.slice(0, 60).map((lb) => {
        const f = kioskLabelFace(lb);
        return { store: f.store, date: f.date, kind: f.kind, container: f.container, count: f.count };
      });
      const commands = sent[0] ? new TextDecoder().decode(buildLabelTspl(sent[0])).slice(0, 4000) : null;
      void kiosk.printLog(secret, {
        dropoffId: dropoffRef.current, transport: res.transport, ok: res.ok, printed: res.printed, total: sent.length,
        stopped: !!res.stopped || stopPrint.current, error: res.error ?? null,
        layout: sent[0] && kioskLabelFace(sent[0]).isKind ? 'round' : 'classic', faces, commands,
      }).catch(() => undefined);
    } catch { /* logging must never stop a drop-off */ }
  }
  function skipLabels() { stopPrint.current = true; setStep({ kind: 'thanks' }); }

  async function sendFeedback() {
    const text = fb.trim();
    if (!text || busy) return;
    setBusy(true); setErr(null);
    try {
      await kiosk.feedback(secret, { dropoffId, volunteerId: who?.volunteerId ?? null, name: who?.name ?? null, text });
      setStep({ kind: 'sent' });
    } catch (e: any) { setErr(e?.message || 'Could not send. Please try again.'); }
    finally { setBusy(false); }
  }

  // ======================================================================
  // Screens
  const topbar = (leftEl: React.ReactNode, right: React.ReactNode) => (
    <div className={`flex-none flex items-center justify-between ${P ? 'h-[88px] pl-[28px]' : 'h-[84px] pl-[36px]'} pr-[76px]`}>
      <div>{leftEl ?? <span className="text-[22px] font-extrabold text-forest tracking-[.01em]">Zeh L'Zeh drop-off</span>}</div>
      <div className="flex items-center gap-[14px]">{right}</div>
    </div>
  );
  const startOver = <button type="button" onClick={resetAll} className={LINK}>Start over</button>;
  const errBox = (cls = '') => err && <div className={`text-clay text-[22px] font-bold text-center bg-clay/10 rounded-[16px] py-3 px-5 ${cls}`}>{err}</div>;

  let body: React.ReactNode;

  if (step.kind === 'code' || step.kind === 'confirm') {
    const confirm = step.kind === 'confirm' ? step.data : null;
    const keyCls = `rounded-[24px] bg-paper border-[3px] border-line shadow-[0_4px_0_#E0D8C6] font-extrabold text-ink transition-transform ${P ? (confirm ? 'h-[112px] text-[58px]' : 'h-[142px] text-[58px]') : 'h-[128px] text-[50px]'}`;
    const wordCls = `${keyCls} !text-muted ${P ? '!text-[28px]' : '!text-[26px]'}`;
    const keypad = (
      <div className={`grid grid-cols-3 ${P ? 'gap-[18px] self-end' : 'gap-4'} ${confirm ? 'opacity-35 pointer-events-none' : ''}`}>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => <TapButton key={n} onTap={() => addDigit(String(n))} disabled={!!confirm} className={keyCls}>{n}</TapButton>)}
        <TapButton onTap={backspace} disabled={!!confirm} className={wordCls}>Delete</TapButton>
        <TapButton onTap={() => addDigit('0')} disabled={!!confirm} className={keyCls}>0</TapButton>
        <TapButton onTap={() => { setCode(''); setErr(null); }} disabled={!!confirm} className={wordCls}>Clear</TapButton>
      </div>
    );
    const head = (
      <div className={P ? 'text-center flex flex-col items-center' : ''}>
        <div className={`${H1} ${P ? 'text-[50px]' : 'text-[52px]'}`}>Drop off food</div>
        <div className="text-[24px] text-muted mt-[10px]">Type the last 4 digits of your phone</div>
        <div className={`flex ${P ? 'gap-5 mt-7' : 'gap-[18px] mt-[34px]'}`}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={`grid place-items-center rounded-[20px] border-[3px] font-extrabold text-forest ${P ? 'w-[120px] h-[132px] text-[64px]' : 'w-[96px] h-[116px] text-[58px]'} ${code[i] ? 'border-forest bg-sage' : 'border-line-2 bg-paper'}`}>
              {code[i] ?? ''}
            </div>
          ))}
        </div>
        {confirm ? (
          <div className={`bg-paper border-[3px] border-forest rounded-[26px] px-[30px] py-[26px] shadow-[0_10px_30px_rgba(28,42,33,.08)] text-left ${P ? 'w-full mt-7' : 'w-[560px] mt-[34px]'}`}>
            <div className="flex items-center gap-[18px] text-[40px] font-extrabold text-ink">
              <span className="w-[58px] h-[58px] rounded-full bg-forest text-paper grid place-items-center text-[34px] font-black flex-none">✓</span>
              <span className="truncate">Hi {shortName(confirm.name)}{confirm.unitNumber != null ? ` #${confirm.unitNumber}` : ''}</span>
            </div>
            <div className="flex gap-4 mt-[22px]">
              <TapButton onTap={() => loadPicks(confirm)} className={`${BTN_PRIMARY} flex-1 h-[96px] text-[30px]`} downClass="scale-[.98]">Yes, that's me</TapButton>
              <TapButton onTap={clearCode} className={`${BTN_QUIET} h-[96px] text-[22px]`} downClass="!bg-sage">Not me</TapButton>
            </div>
          </div>
        ) : (
          <div className={`flex flex-col ${P ? 'items-center mt-7' : 'items-start mt-[30px]'} gap-3`}>
            {err ? errBox('max-w-[620px]') : busy ? <div className="text-[22px] text-muted font-bold py-3">Checking…</div> : null}
            {/* Oct 30 client: sign in with the QR code on the driver's name tag */}
            <TapButton onTap={() => { setErr(null); setScanning(true); }} disabled={busy} ariaLabel="Scan my name tag"
                       className={`h-[72px] ${P ? 'w-[420px]' : 'w-[440px]'} rounded-[20px] border-[3px] border-forest bg-sage text-forest text-[24px] font-extrabold transition-transform`}>
              📷 Scan my name tag
            </TapButton>
            <button type="button" onClick={() => { setErr(null); setStep({ kind: 'guest' }); }}
                    className="text-[22px] font-extrabold text-forest underline underline-offset-4 py-[10px]">
              I'm new / I have no code
            </button>
          </div>
        )}
      </div>
    );
    body = (
      <>
        {topbar(null, null)}
        {P ? (
          <div className="flex-1 grid grid-rows-[auto_1fr] gap-[30px] px-10 pt-5 pb-[84px] min-h-0">{head}{keypad}</div>
        ) : (
          <div className="flex-1 grid grid-cols-[1fr_520px] gap-10 px-[60px] pt-[10px] pb-10 items-center min-h-0">{head}{keypad}</div>
        )}
      </>
    );
  } else if (step.kind === 'names') {
    body = (
      <>
        {topbar(startOver, null)}
        <div className={`flex-1 min-h-0 overflow-y-auto ${P ? 'px-10 pt-6' : 'w-[940px] mx-auto pt-2'}`}>
          <div className={`${H1} text-[48px]`}>Tap your name</div>
          <div className="text-[24px] text-muted mt-[10px]">Two drivers have this code.</div>
          {step.candidates.map((c) => (
            <TapButton key={c.volunteerId} onTap={() => lookup(step.code, c.volunteerId)} disabled={busy}
                       className="w-full mt-5 flex items-center gap-[26px] bg-paper border-[3px] border-line rounded-[26px] px-8 py-[26px] text-left shadow-[0_4px_0_#E0D8C6] text-[36px] font-extrabold text-ink">
              {c.name}<span className="ml-auto text-[46px] text-forest">›</span>
            </TapButton>
          ))}
          {errBox('mt-5')}
        </div>
      </>
    );
  } else if (step.kind === 'guest') {
    const inp = 'w-full rounded-[20px] border-[3px] border-line-2 bg-paper px-6 py-5 text-[28px] outline-none focus:border-forest';
    body = (
      <>
        {topbar(startOver, null)}
        <div className={`flex-1 min-h-0 overflow-y-auto ${P ? 'px-10 pt-6' : 'w-[760px] mx-auto pt-2'}`}>
          <div className={`${H1} text-[48px]`}>What's your name?</div>
          <div className="text-[24px] text-muted mt-[10px]">So the office knows who brought the food.</div>
          <div className="mt-7 space-y-4">
            <input className={inp} placeholder="Full name" value={guestName} onChange={(e) => setGuestName(e.target.value)} autoFocus />
            <input className={inp} placeholder="Phone (optional)" inputMode="tel" value={guestPhone} onChange={(e) => setGuestPhone(e.target.value)} />
            {errBox()}
            <button type="button" onClick={startGuest} disabled={busy || !guestName.trim()} className={`${BTN_PRIMARY} w-full h-[96px] text-[30px]`}>
              {busy ? 'One moment…' : 'Next'}
            </button>
          </div>
        </div>
      </>
    );
  } else if (step.kind === 'pick') {
    const q = search.trim().toLowerCase();
    const matches = stores.filter((s) => !q || s.supplierName.toLowerCase().includes(q) || s.city.toLowerCase().includes(q)).slice(0, 40);
    const mine = rows.filter((r) => !usedPlaces.has(r.key));
    const listOpen = showAll || mine.length === 0;
    const hasFood = live.length > 0;
    body = (
      <>
        {topbar(hasFood
          ? <button type="button" onClick={() => { setStep({ kind: 'food' }); setCur(cur && places.some((p) => p.key === cur) ? cur : places[places.length - 1]?.key ?? null); }} className={LINK}>‹ Back</button>
          : startOver, <WhoChip who={who} />)}
        <div className={`flex-1 min-h-0 overflow-y-auto pb-8 ${P ? 'px-10 pt-6' : 'w-[940px] mx-auto pt-1'}`}>
          <div className={`${H1} text-[48px]`}>{hasFood ? 'Which other store?' : 'Where is this food from?'}</div>
          <div className="text-[24px] text-muted mt-[10px]">{mine.length ? 'Your pickups for today are first. Tap one.' : 'Find the store.'}</div>
          {mine.map((r) => (
            <button type="button" key={r.key} onClick={() => choose(r)}
                    className={`w-full flex items-center gap-[26px] bg-paper border-[3px] border-sage-line rounded-[26px] ${P ? 'px-7 py-7 mt-5' : 'px-8 py-[26px] mt-[18px]'} text-left shadow-[0_4px_0_#E0D8C6] active:bg-sage`}>
              <span className="w-[78px] h-[78px] rounded-[20px] bg-sage grid place-items-center flex-none"><StoreIcon size={44} /></span>
              <span className="min-w-0">
                <span className={`block font-extrabold text-ink truncate ${P ? 'text-[36px]' : 'text-[38px]'}`}>{r.label}</span>
                <span className="block text-[21px] text-muted mt-1"><b className="text-forest">Your pickup</b>{r.sub ? ` · ${r.sub}` : ''}</span>
              </span>
              <span className="ml-auto text-[46px] font-extrabold text-forest">›</span>
            </button>
          ))}
          {!listOpen && (
            <button type="button" onClick={() => setShowAll(true)}
                    className={`w-full mt-5 rounded-[26px] border-[3px] border-dashed border-line-2 ${P ? 'py-[26px]' : 'py-5'} text-[26px] font-extrabold text-forest text-center`}>
              + A different store
            </button>
          )}
          {listOpen && newStore === null && (
            <div className="mt-5 rounded-[26px] border-[3px] border-line bg-paper p-4">
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Type the store name" autoFocus={mine.length > 0}
                     className="w-full rounded-[16px] border-[3px] border-line-2 bg-paper px-5 py-4 text-[26px] outline-none focus:border-forest" />
              <div className={`mt-2 overflow-y-auto ${P ? 'max-h-[560px]' : 'max-h-[300px]'}`}>
                {matches.map((s) => (
                  <button type="button" key={s.supplierId}
                          onClick={() => choose({ key: `s:${s.supplierId}`, pickupId: null, supplierId: s.supplierId, otherName: null, label: s.supplierName, sub: s.city, time: '' })}
                          className="w-full text-left px-4 py-4 rounded-[12px] text-[24px] font-bold text-ink active:bg-sage">
                    {s.supplierName}{s.city && <span className="text-muted font-normal text-[19px]"> · {s.city}</span>}
                  </button>
                ))}
                {q && matches.length === 0 && <div className="px-4 py-3 text-[21px] text-muted">No store by that name.</div>}
              </div>
            </div>
          )}
          {listOpen && newStore === null && (
            <button type="button" onClick={() => setNewStore(search.trim())}
                    className="w-full mt-4 rounded-[26px] border-[3px] border-dashed border-forest py-5 text-[24px] font-extrabold text-forest">
              + Store not on the list
            </button>
          )}
          {newStore !== null && (
            <div className="mt-5 rounded-[26px] border-[3px] border-forest bg-paper p-6 space-y-4">
              <div className="text-[26px] font-extrabold text-ink">Store name</div>
              <input value={newStore} onChange={(e) => setNewStore(e.target.value)} autoFocus placeholder="e.g. Corner Bakery"
                     className="w-full rounded-[16px] border-[3px] border-line-2 bg-paper px-5 py-4 text-[26px] outline-none focus:border-forest" />
              <button type="button" disabled={!newStore.trim()} className={`${BTN_PRIMARY} w-full h-[88px] text-[28px]`}
                      onClick={() => choose({ key: `o:${newStore.trim().toLowerCase()}`, pickupId: null, supplierId: null, otherName: newStore.trim(), label: newStore.trim(), sub: '', time: '' })}>
                Next
              </button>
              <button type="button" onClick={() => setNewStore(null)} className={`${LINK} w-full`}>Cancel</button>
            </div>
          )}
          {errBox('mt-5')}
        </div>
      </>
    );
  } else if (step.kind === 'food') {
    const here = lines.filter((l) => l.place === cur);
    const others = ordered.filter((l) => l.place !== cur);
    const otherPlaces = places.filter((p) => p.key !== cur && others.some((l) => l.place === p.key));
    const tiles = (
      <div className={P ? 'grid grid-cols-6 gap-4' : 'grid grid-cols-2 gap-4'}>
        {CONTAINERS.map((c, i) => {
          const span = P ? (i < 3 ? 'col-span-2' : 'col-span-3') : (i === 4 ? 'col-span-2' : '');
          const rowLayout = P || i === 4;
          return (
            <TapButton key={c} onTap={() => addLine(c)} ariaLabel={CNAME[c][0]}
                       className={`${span} bg-paper border-[3px] border-line rounded-[24px] shadow-[0_5px_0_#E0D8C6] flex items-center justify-center transition-transform ${rowLayout ? `flex-row gap-[14px] ${P ? 'h-[128px]' : 'h-[118px]'}` : 'flex-col gap-2 h-[200px]'}`}
                       downClass="!bg-sage !border-forest scale-[.97]">
              <CIcon c={c} size={rowLayout ? 64 : 76} />
              <span className={`font-extrabold text-ink ${P ? (i < 3 ? 'text-[32px]' : 'text-[34px]') : 'text-[32px]'}`}>{CNAME[c][0]}</span>
            </TapButton>
          );
        })}
      </div>
    );
    const lineCards = (
      <div ref={linesBox} className={`flex-1 min-h-0 overflow-y-auto flex flex-col gap-[14px] px-[2px] pt-1 pb-[6px] ${P ? 'mt-[22px]' : ''}`}>
        {otherPlaces.map((p) => (
          <button type="button" key={p.key} onClick={() => setCur(p.key)}
                  className="w-full text-left rounded-[18px] border-2 border-line bg-cream px-4 py-3 text-[20px] text-muted">
            <b className="text-ink">{p.label}:</b> {others.filter((l) => l.place === p.key).map(lineText).join(' · ')} <span className="underline underline-offset-2 font-bold text-forest">Change</span>
          </button>
        ))}
        {here.length === 0 && <div className="text-[24px] text-muted text-center my-auto">Tap what you brought.</div>}
        {here.map((l) => {
          const open = !l.kind || l.open;
          const ks = l.kind ? KSTYLE[l.kind] : null;
          return (
            <div key={l.id} className={`bg-paper border-[3px] rounded-[22px] px-4 py-3 ${open ? 'border-forest shadow-[0_4px_0_#CFE0CC]' : 'border-sage-line'}`}>
              <div className="flex items-center gap-[14px] min-h-[64px]">
                <CIcon c={l.container} size={48} />
                <span className="text-[30px] font-extrabold text-ink">{CNAME[l.container][0]}</span>
                {!open && l.kind && ks && (
                  <button type="button" onClick={() => reopen(l.id)} aria-label={`Kind: ${KNAME[l.kind]} (tap to change)`}
                          className="h-[52px] px-5 rounded-full border-2 text-[22px] font-extrabold whitespace-nowrap"
                          style={{ background: ks.bg, color: ks.fg, borderColor: ks.bd }}>
                    {KNAME[l.kind]}
                  </button>
                )}
                <div className="ml-auto flex items-center gap-[10px]">
                  <button type="button" onClick={() => bump(l.id, -1)} aria-label="Less"
                          className="w-[64px] h-[62px] rounded-[18px] border-[3px] border-line-2 bg-paper text-[42px] font-extrabold text-forest shadow-[0_3px_0_#E0D8C6] leading-none">−</button>
                  <span className="text-[44px] font-extrabold min-w-[56px] text-center text-ink">{l.count}</span>
                  <button type="button" onClick={() => bump(l.id, 1)} aria-label="More"
                          className="w-[64px] h-[62px] rounded-[18px] border-[3px] border-forest bg-forest text-[42px] font-extrabold text-paper shadow-[0_3px_0_#1E3F29] leading-none">+</button>
                </div>
              </div>
              {open && (
                <div className="grid grid-cols-5 gap-2 mt-3">
                  {KINDS.map((k) => {
                    const st = KSTYLE[k];
                    const sel = l.kind === k;
                    return (
                      <button type="button" key={k} onClick={() => setKind(l.id, k)}
                              className="h-[62px] rounded-[16px] border-2 font-extrabold whitespace-nowrap px-1 leading-tight flex flex-col items-center justify-center"
                              style={{ background: sel ? st.bg : '#fff', color: k === 'notsure' ? '#6E7C70' : st.fg, borderColor: k === 'notsure' ? '#6E7C70' : st.fg }}>
                        <span className="text-[20px]">{KNAME[k]}</span>
                        {k === 'mixed' && <span className="text-[13px] font-bold opacity-80">some of each</span>}
                      </button>
                    );
                  })}
                </div>
              )}
              {!open && l.kind === 'notsure' && <div className="text-[19px] text-muted mt-[6px] mb-[2px] ml-[62px]">{NOT_SURE_NOTE}</div>}
            </div>
          );
        })}
      </div>
    );
    const foot = (
      <div className="flex flex-col gap-3 mt-[14px] flex-none">
        {total > 0 && <div className="text-[22px] font-extrabold text-forest text-center leading-[1.3]">{summaryOf(ordered)}</div>}
        {errBox()}
        <TapButton onTap={() => { setErr(null); setStep({ kind: 'labels' }); }} disabled={total === 0}
                   className={`${BTN_PRIMARY} w-full h-[100px] text-[30px] whitespace-nowrap px-4`} downClass="scale-[.99]">
          ✓ Done — print {total ? `${total} ` : ''}label{total === 1 ? '' : 's'}
        </TapButton>
        <div className="text-center">
          <button type="button" onClick={() => { setShowAll(false); leaveFood(); }} className={`${LINK} !text-[20px]`}>+ Food from another store</button>
        </div>
      </div>
    );
    body = (
      <>
        {topbar(<button type="button" onClick={leaveFood} className={LINK}>‹ Back</button>,
          <>
            {curPlace && <Chip><StoreIcon size={26} /><span className="truncate">{curPlace.label}{curPlace.time ? ` · ${curPlace.time}` : ''}</span></Chip>}
            <WhoChip who={who} />
          </>)}
        {P ? (
          <div className="flex-1 min-h-0 flex flex-col px-8 pb-[22px]">
            <div className="text-[38px] font-extrabold text-ink mt-1 mb-[18px]">What did you bring?</div>
            {tiles}
            <div className="flex-1 min-h-0 flex flex-col">{lineCards}{foot}</div>
          </div>
        ) : (
          <div className="flex-1 min-h-0 grid grid-cols-[500px_1fr] gap-x-8 px-9 pb-[22px]">
            <div className="flex flex-col min-h-0">
              <div className="text-[34px] font-extrabold text-ink mb-4">What did you bring?</div>
              {tiles}
            </div>
            <div className="flex flex-col min-h-0">{lineCards}{foot}</div>
          </div>
        )}
      </>
    );
  } else if (step.kind === 'labels') {
    const first = ordered[0];
    const fp = first ? places.find((p) => p.key === first.place) : null;
    body = (
      <>
        {topbar(<button type="button" onClick={() => { setErr(null); setStep({ kind: 'food' }); }} className={LINK} disabled={busy}>‹ Back</button>, <WhoChip who={who} />)}
        <div className={`flex-1 min-h-0 flex flex-col items-center justify-center text-center ${P ? 'px-10 pb-20' : 'px-20 pb-[30px]'}`}>
          <div className={`${H1} ${P ? 'text-[54px]' : 'text-[52px]'}`}>Labels: {total} will print</div>
          <div className="mt-[18px] text-[17px] uppercase tracking-[.14em] font-extrabold text-muted">One label</div>
          <div className={P ? 'mt-4' : 'mt-3'}>
            {first && fp && (
              <LabelPreview size={P ? 470 : 330} label={{ supplierName: fp.label, date: labelDate(), category: KNAME[first.kind ?? 'notsure'], unit: first.container, index: 1, total }} />
            )}
          </div>
          {errBox(P ? 'mt-6' : 'mt-4')}
          <TapButton onTap={() => void finish(true)} disabled={busy}
                     className={`${BTN_PRIMARY} w-full max-w-[560px] h-[96px] text-[30px] ${P ? 'mt-10' : 'mt-[26px]'}`} downClass="scale-[.99]">
            {busy ? 'Saving…' : `Print ${total} label${total === 1 ? '' : 's'}`}
          </TapButton>
          <div className="mt-[22px]">
            <button type="button" onClick={() => void finish(false)} disabled={busy} className={`${BTN_QUIET} h-[60px] text-[20px]`}>Don't need labels</button>
          </div>
        </div>
      </>
    );
  } else if (step.kind === 'printing') {
    const used = CONTAINERS.filter((c) => ordered.some((l) => l.container === c)).map((c) => CNAME[c][1]);
    const each = used.length <= 1 ? (used[0] ?? 'item') : `${used.slice(0, -1).join(', ')} or ${used[used.length - 1]}`;
    const n = labels.length;
    body = (
      <>
        {topbar(null, <WhoChip who={who} />)}
        <div className={`flex-1 min-h-0 flex flex-col items-center justify-center text-center ${P ? 'px-10 pb-20' : 'px-20 pb-10'}`}>
          <PrinterIcon />
          {printState === 'err' ? (
            <>
              <div className={`${H1} text-[46px] mt-[18px]`}>Labels didn't print</div>
              <div className="text-[24px] text-muted mt-[10px]">Your drop-off is already saved. Try again, or write the store name on the box.</div>
              <div className="flex gap-4 mt-10">
                <button type="button" onClick={() => void runPrint(labels, printed)} className={`${BTN_OUTLINE} h-[84px] px-8 text-[26px]`}>Try again</button>
                <button type="button" onClick={skipLabels} className={`${BTN_PRIMARY} h-[84px] px-10 text-[26px]`}>Done</button>
              </div>
            </>
          ) : printState === 'browser' ? (
            <>
              <div className={`${H1} text-[46px] mt-[18px]`}>Print the labels, then tap Done</div>
              <div className="text-[22px] text-muted mt-3">Your drop-off is already saved.</div>
              <button type="button" onClick={skipLabels} className={`${BTN_PRIMARY} h-[96px] px-12 text-[30px] mt-10`}>Done</button>
            </>
          ) : (
            <>
              <div className={`${H1} ${P ? 'text-[50px]' : 'text-[52px]'} mt-[18px]`}>Printing labels…</div>
              <div className="text-[24px] text-muted mt-[10px]">{Math.min(n, printed + 1)} of {n} · one label for each {each}</div>
              <div className={`h-[22px] rounded-full bg-paper border-2 border-line mt-7 overflow-hidden ${P ? 'w-full max-w-[620px]' : 'w-[560px]'}`}>
                <div className="h-full bg-forest rounded-full transition-[width] duration-300" style={{ width: `${n ? Math.max(4, Math.round((printed / n) * 100)) : 0}%` }} />
              </div>
              <div className="text-[22px] text-muted mt-3">Your drop-off is already saved.</div>
              <div className="mt-[46px]"><button type="button" onClick={skipLabels} className={`${BTN_QUIET} h-[60px] text-[20px]`}>Don't need labels</button></div>
              <div className="text-[16px] text-muted mt-2">For big drops (like 100 cases): stops the printing. Nothing is lost.</div>
            </>
          )}
        </div>
      </>
    );
  } else if (step.kind === 'thanks') {
    body = (
      <>
        {topbar(null, null)}
        <div className={`flex-1 min-h-0 flex flex-col items-center justify-center text-center ${P ? 'px-10 pb-20' : 'px-20 pb-10'}`}>
          <div className="w-[132px] h-[132px] rounded-full bg-forest text-paper grid place-items-center text-[78px] font-black shadow-[0_0_0_16px_#E5EEE2]">✓</div>
          <div className={`${H1} ${P ? 'text-[50px]' : 'text-[52px]'} mt-[34px]`}>Thank you, {who?.firstName ?? ''}!</div>
          {savedText && <div className="text-[24px] text-ink mt-3">Saved: {places.length === 1 ? `${places[0].label} · ` : ''}{savedText}</div>}
          <div className={`mt-9 bg-paper border-[3px] border-line rounded-[28px] ${P ? 'w-full px-[30px] py-8' : 'w-[980px] px-10 py-7'}`}>
            <div className="text-[32px] font-extrabold text-ink">Any feedback, or any problem we should know about?</div>
            <div className={`flex gap-[18px] justify-center mt-[22px] ${P ? 'flex-col items-stretch' : ''}`}>
              <TapButton onTap={() => { setErr(null); setStep({ kind: 'feedback' }); }} className={`${BTN_PRIMARY} ${P ? 'h-[104px]' : 'w-[330px] h-[96px]'} text-[30px]`} downClass="scale-[.99]">Yes, tell us</TapButton>
              <TapButton onTap={resetAll} className={`${BTN_OUTLINE} ${P ? 'h-[104px]' : 'w-[240px] h-[96px]'} text-[26px]`} downClass="!bg-sage">No thanks</TapButton>
            </div>
          </div>
        </div>
        <div className={`absolute flex items-center gap-3 text-[18px] text-muted font-bold ${P ? 'left-0 right-0 justify-center bottom-[34px] text-[20px]' : 'bottom-[26px] right-[36px]'}`}>
          Back to start in {Math.max(0, left)}s <Ring left={Math.max(0, left)} of={THANKS_SECONDS} />
        </div>
      </>
    );
  } else if (step.kind === 'feedback') {
    body = (
      <>
        {topbar(null, <WhoChip who={who} />)}
        <div className={`flex-1 min-h-0 flex flex-col items-center text-center pt-[10px] ${P ? 'px-10' : 'px-20'}`}>
          <div className={`${H1} text-[46px]`}>Tell us</div>
          <div className="text-[24px] text-muted mt-[10px]">Anything at all. It goes straight to the office.</div>
          <textarea value={fb} onChange={(e) => setFb(e.target.value.slice(0, 1000))} placeholder="Type here…" autoFocus
                    className={`mt-[22px] rounded-[22px] border-[3px] border-forest bg-paper px-6 py-5 text-[28px] text-ink resize-none outline-none text-left ${P ? 'w-full h-[300px]' : 'w-[860px] h-[190px]'}`}
                    style={{ userSelect: 'text', WebkitUserSelect: 'text', outline: 'none', boxShadow: 'none' } as React.CSSProperties} />
          {errBox('mt-4')}
          <div className="flex gap-[18px] mt-[22px]">
            <button type="button" onClick={() => void sendFeedback()} disabled={busy || !fb.trim()} className={`${BTN_PRIMARY} w-[420px] h-[96px] text-[30px]`}>
              {busy ? 'Sending…' : 'Send'}
            </button>
            <button type="button" onClick={resetAll} className={`${BTN_QUIET} h-[96px] text-[20px]`}>Cancel</button>
          </div>
        </div>
      </>
    );
  } else {
    body = (
      <>
        {topbar(null, null)}
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center text-center px-10 pb-20">
          <div className="w-[132px] h-[132px] rounded-full bg-forest text-paper grid place-items-center text-[78px] font-black shadow-[0_0_0_16px_#E5EEE2]">✓</div>
          <div className={`${H1} text-[50px] mt-[34px]`}>Thanks, we got it.</div>
          <div className="text-[24px] text-muted mt-[10px]">The office will see it right away.</div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="no-print absolute left-0 top-0 overflow-hidden flex flex-col bg-cream text-ink font-sans select-none"
           data-kiosk-step={step.kind} data-kiosk-orientation={P ? 'portrait' : 'landscape'}
           style={{ width: stage.W, height: stage.H, transformOrigin: '0 0', transform: `translate(${stage.x}px, ${stage.y}px) scale(${stage.k})` }}>
        {body}
      </div>
      {/* Outside the scaled stage: a fixed overlay inside a transform would be placed wrong. */}
      {scanning && <NameTagScanner onToken={(t) => void lookupTag(t)} onClose={() => setScanning(false)} />}
      {/* Browser print fallback only. */}
      {labels.length > 0 && (
        <div className="print-only">
          {labels.map((lb, i) => <LabelPage key={i} label={lb} />)}
        </div>
      )}
    </>
  );
}
