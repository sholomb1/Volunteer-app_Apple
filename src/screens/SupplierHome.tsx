/**
 * Supplier home — single "Post a Pickup" CTA up top, plus a list of recent
 * posts with their live status. The big create button uses the mockup's
 * clay tone since this is the supplier's primary "do it" action.
 *
 * Oct 8 client:
 *   • `listOnly` = the My Pickups page (menu → My Pickups); home shows a
 *     "My pickups" button with the active count instead of the lists.
 *   • "Same as last time" — one tap opens the post form already filled in.
 *   • Plain status words ("Shmueli is on the way"), big Edit / Cancel buttons.
 *   • Data from GET /api/store/pickups (only drivers still on it, first names).
 *
 * Oct 9 client:
 *   • My Pickups: "Today & tomorrow" first; the rest of the steady schedule
 *     folds into one collapsed "Steady schedule (N)" section (no Edit/Cancel
 *     on those). Home count = today + tomorrow only.
 *   • Past pickups say what happened ("No driver came" / "Done" / "Cancelled").
 *   • Cancel → 5-second "Pickup cancelled — Undo" bar. The cancel is only sent
 *     after the 5 seconds (or when leaving the page), so Undo is clean and
 *     drivers are only texted once it's final. Failures show a plain error.
 *   • Office chat unavailable → says so, with the office phone number.
 *   • Bigger tap targets (44px) and text (≥14px).
 */
import { uiConfirm } from '../ui-dialogs';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, MessageSquare, ArrowLeft, Edit3, RotateCcw, Phone, ChevronDown, ChevronUp } from 'lucide-react';
import { api, supplier, dm, type AuthUser } from '../api';
import { AppBar, Avatar, Card, FadeUp, Skeleton, cx } from '../design';
import { ChatThread } from '../chat-thread';
import { fmtTime, fmtDay } from '../time-format';
import { StorePhotoThumb } from '../store-photo'; // Oct 14 client

// Oct 9 client: same office number the driver screens use (Chat.tsx / Login.tsx).
const OFFICE_PHONE = '(845) 363-5323';
const OFFICE_TEL = 'tel:+18453635323';

export type StorePickup = {
  id: number; ref: string | null; date: string; time: string | null; status: string;
  food: string | null; amount: string | null; note: string | null; pickedUpAt: string | null; drivers: string | null;
  steady?: boolean;
  photoUrl?: string | null; // Oct 14 client: the photo the store added
};
type StorePickups = {
  profile: { name: string; address: string; instructions: string | null };
  active: StorePickup[]; past: StorePickup[];
  last: { food: string; amount: string; note: string } | null;
  today?: string;
};
export const storePickupsQuery = { queryKey: ['store-pickups'], queryFn: () => api<StorePickups>('/api/store/pickups') };

export function storeInitials(name: string | undefined | null): string {
  const w = String(name ?? '').replace(/[^\p{L}\p{N} ]/gu, ' ').trim().split(/\s+/).filter(Boolean);
  return ((w[0]?.[0] ?? 'Z') + (w[1]?.[0] ?? '')).toUpperCase();
}

// Oct 9 client: NY "today" / "tomorrow" as YYYY-MM-DD.
function nyToday(): string { return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); }
function nextDay(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

const UNDO_MS = 5000;

export function SupplierHome({ user, listOnly }: { user: AuthUser; listOnly?: boolean }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const q = useQuery({ ...storePickupsQuery, refetchInterval: 30_000 });
  const office = useQuery({ queryKey: ['dm-office'], queryFn: dm.office });
  const [cancelErr, setCancelErr] = useState<string | null>(null);
  // Ids hidden from the lists: waiting out the Undo window, or cancel sent.
  const [hidden, setHidden] = useState<Set<number>>(new Set());
  const unhide = (id: number) => setHidden((s) => { const n = new Set(s); n.delete(id); return n; });
  // Plain call (not useMutation) so it still finishes if the page is closing.
  const doCancel = (id: number) => {
    supplier.cancel(id)
      .then(() => { qc.invalidateQueries({ queryKey: ['store-pickups'] }); qc.invalidateQueries({ queryKey: ['supplier-pickups'] }); })
      // Oct 9 client: was silent on failure.
      .catch((e: any) => {
        unhide(id);
        setCancelErr(`Couldn't cancel this pickup. ${e?.message ? `${e.message} ` : ''}Please try again or call the office: ${OFFICE_PHONE}.`);
        qc.invalidateQueries({ queryKey: ['store-pickups'] });
      });
  };

  // Oct 9 client: Undo window. The pickup is hidden right away; the real
  // cancel goes out after 5 seconds, or immediately if the page closes.
  const [undoId, setUndoId] = useState<number | null>(null);
  const pendingRef = useRef<{ id: number; timer: number } | null>(null);
  const cancelRef = useRef(doCancel);
  cancelRef.current = doCancel;
  const flush = () => {
    const p = pendingRef.current;
    if (!p) return;
    window.clearTimeout(p.timer);
    pendingRef.current = null;
    setUndoId(null);
    cancelRef.current(p.id);
  };
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') flush(); };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flush);
    return () => { document.removeEventListener('visibilitychange', onHide); window.removeEventListener('pagehide', flush); flush(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const startCancel = (id: number) => {
    flush(); // only one pending at a time
    setCancelErr(null);
    const timer = window.setTimeout(() => flush(), UNDO_MS);
    pendingRef.current = { id, timer };
    setHidden((s) => new Set(s).add(id));
    setUndoId(id);
  };
  const undo = () => {
    const p = pendingRef.current;
    if (p) { window.clearTimeout(p.timer); unhide(p.id); }
    pendingRef.current = null;
    setUndoId(null);
  };

  const [chatWithOffice, setChatWithOffice] = useState(false);
  const [showSteady, setShowSteady] = useState(false);
  const officeUser = office.data?.data?.[0];

  if (chatWithOffice && officeUser) {
    return (
      <div className="min-h-screen flex flex-col px-4 pt-3 pb-[88px]">
        <button onClick={() => setChatWithOffice(false)}
                className="haptic self-start flex items-center gap-1.5 min-h-[44px] pr-3 text-[15px] font-bold text-forest mb-2">
          <ArrowLeft size={18} /> Back
        </button>
        <div className="flex-1 min-h-0">
          <ChatThread userId={officeUser.user_id}
                      title="Zeh L'Zeh Office"
                      subtitle="Coordinator team" color="#2C5A3B" />
        </div>
      </div>
    );
  }

  const storeName = q.data?.profile.name || user.firstName || 'Your store';
  const initials = storeInitials(storeName);
  const today = q.data?.today || nyToday();
  const tomorrow = nextDay(today);
  const active = (q.data?.active ?? []).filter((p) => !hidden.has(p.id));
  const past = q.data?.past ?? [];
  const last = q.data?.last ?? null;
  const day10 = (p: StorePickup) => String(p.date).slice(0, 10);
  const soon = active.filter((p) => day10(p) <= tomorrow);
  const laterOneTime = active.filter((p) => day10(p) > tomorrow && !p.steady);
  const laterSteady = active.filter((p) => day10(p) > tomorrow && p.steady);
  const askCancel = (p: StorePickup) => {
    void uiConfirm(`Cancel this pickup${p.food ? ` (${p.food})` : ''}?\n\nDrivers will be told it's no longer needed.`)
      .then((ok) => { if (ok) startCancel(p.id); });
  };
  const dayWord = (p: StorePickup) => day10(p) === today ? 'Today' : day10(p) === tomorrow ? 'Tomorrow' : fmtDay(day10(p));

  const undoBar = undoId != null && (
    <div className="fixed left-0 right-0 bottom-[84px] z-[2000] px-4">
      <div className="mx-auto max-w-[480px] rounded-[14px] bg-ink text-paper shadow-lift flex items-center gap-3 pl-4 pr-2 py-2">
        <div className="flex-1 text-[15px] font-bold">Pickup cancelled</div>
        <button onClick={undo} className="haptic min-h-[44px] px-4 rounded-[10px] bg-paper text-ink text-[15px] font-extrabold">Undo</button>
      </div>
    </div>
  );
  const errBox = cancelErr && (
    <div className="mb-3 rounded-[12px] border border-clay/40 bg-clay/10 px-3.5 py-3 text-[14px] font-bold text-clay">
      {cancelErr}
      <button onClick={() => setCancelErr(null)} className="block mt-1 min-h-[44px] text-[14px] underline">OK</button>
    </div>
  );
  const sectionHead = 'mt-2 mb-2 text-[14px] font-extrabold uppercase tracking-[.06em] text-muted';

  if (listOnly) {
    return (
      <div className="min-h-screen pb-[90px]">
        <AppBar title="My Pickups" leftMark="ז" altMark right={<Avatar initials={initials} />} />
        <main className="px-5">
          <button onClick={() => nav('/')} className="haptic flex items-center gap-1.5 min-h-[44px] pr-3 text-[15px] font-bold text-forest mb-2">
            <ArrowLeft size={18} /> Home
          </button>
          {errBox}
          <div className={sectionHead}>Today &amp; tomorrow</div>
          {q.isLoading ? <Skeleton className="h-20 rounded-[16px]" /> :
            soon.length === 0 ? <div className="text-[14px] text-muted py-3">No pickups today or tomorrow.</div> :
            <div className="space-y-2.5">
              {soon.map((p) => <SupplierRow key={p.id} p={p} day={dayWord(p)}
                                  onEdit={() => nav(`/pickups/${p.id}/edit`)}
                                  onCancel={() => askCancel(p)} />)}
            </div>}
          {laterOneTime.length > 0 && <>
            <div className={cx(sectionHead, 'mt-6')}>Coming up</div>
            <div className="space-y-2.5">
              {laterOneTime.map((p) => <SupplierRow key={p.id} p={p} day={dayWord(p)}
                                          onEdit={() => nav(`/pickups/${p.id}/edit`)}
                                          onCancel={() => askCancel(p)} />)}
            </div>
          </>}
          {laterSteady.length > 0 && <>
            <button onClick={() => setShowSteady((v) => !v)}
                    className="haptic mt-6 w-full min-h-[48px] flex items-center justify-between rounded-[12px] border border-line bg-paper px-4 text-[15px] font-bold text-ink">
              <span>Steady schedule ({laterSteady.length})</span>
              {showSteady ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
            </button>
            {showSteady && (
              <div className="mt-2.5 space-y-2.5">
                <div className="text-[14px] text-muted">Your regular pickups. To change these, call the office: <a href={OFFICE_TEL} className="font-bold text-forest">{OFFICE_PHONE}</a></div>
                {laterSteady.map((p) => <SupplierRow key={p.id} p={p} day={dayWord(p)} />)}
              </div>
            )}
          </>}
          {past.length > 0 && <>
            <div className={cx(sectionHead, 'mt-6')}>Past 30 days</div>
            <div className="space-y-2.5">
              {past.map((p) => <SupplierRow key={p.id} p={p} day={dayWord(p)} muted isPast={day10(p) < today || ['completed', 'delivered', 'cancelled', 'missed'].includes(String(p.status))} />)}
            </div>
          </>}
          <button onClick={() => nav('/post')}
                  className="haptic mt-6 w-full rounded-[14px] bg-clay py-3.5 text-[16px] font-bold text-paper">+ Food ready now</button>
        </main>
        {undoBar}
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-[90px]">
      <AppBar title="Zeh L'Zeh" leftMark="ז" altMark right={<Avatar initials={initials} />} />

      <main className="px-5">
        <FadeUp>
          <div className="text-[14px] font-bold text-muted">Donor</div>
          <h1 className="font-display font-semibold text-[24px] leading-tight">{storeName}</h1>
        </FadeUp>

        {/* Big CTA */}
        <FadeUp delay={0.05} className="mt-5">
          <button onClick={() => nav('/post')}
            className="haptic w-full relative overflow-hidden bg-clay text-paper rounded-[20px] p-6 text-left shadow-cta">
            <div className="absolute -top-10 -right-6 h-32 w-32 rounded-full bg-paper/15" />
            <div className="relative flex items-center gap-4">
              <span className="grid h-14 w-14 place-items-center rounded-[16px] bg-paper/20"><Plus size={28} /></span>
              <div className="flex-1">
                <div className="font-display font-semibold text-[22px] leading-tight">Food ready now</div>
                <div className="text-[14px] text-paper/80 mt-0.5">Post a pickup — drivers nearby get notified.</div>
              </div>
            </div>
          </button>
        </FadeUp>

        {/* Oct 8 client: one tap to repeat what they posted last time. */}
        {last && (
          <FadeUp delay={0.07}>
            <button onClick={() => nav('/post', { state: { repeat: last } })}
                    className="haptic mt-3 w-full bg-clay-soft border border-clay/30 rounded-[16px] p-4 text-left flex items-center gap-3">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-clay text-paper"><RotateCcw size={20} /></span>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-[16px] truncate">Same as last time</div>
                <div className="text-[14px] text-muted truncate">{[last.food, last.amount].filter(Boolean).join(' · ')}</div>
                {/* Oct 11 client: make clear it's a filled-in form they can check and change — not "that or nothing". */}
                <div className="text-[13.5px] text-ink">Opens the form filled in — check and change anything before you post.</div>
              </div>
            </button>
          </FadeUp>
        )}

        {/* Oct 8 client: My pickups — its own page now.
            Oct 9 client: the count is today + tomorrow only (not the whole steady schedule). */}
        <FadeUp delay={0.09}>
          <button onClick={() => nav('/my-pickups')}
                  className="haptic mt-3 w-full bg-paper border border-line rounded-[16px] p-4 text-left flex items-center gap-3 hover:border-forest/40">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-sage text-forest font-display font-bold text-[18px]">{soon.length}</span>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-[16px] truncate">My pickups</div>
              <div className="text-[14px] text-muted truncate">
                {soon.length === 0 ? 'None today or tomorrow · see all'
                  : soon.some((p) => p.drivers) ? `${soon.length} today & tomorrow · a driver is on the way` : `${soon.length} today & tomorrow · looking for a driver`}
              </div>
            </div>
          </button>
        </FadeUp>

        {/* Chat with office — single contact per the chat-permission matrix:
            suppliers may DM only the Zeh L'Zeh office.
            Oct 9 client: if chat isn't available, say so and give the phone number. */}
        <FadeUp delay={0.11}>
          {officeUser || office.isLoading ? (
            <button onClick={() => officeUser && setChatWithOffice(true)} disabled={!officeUser}
                    className="haptic mt-3 w-full bg-paper border border-sage-line rounded-[16px] p-4 text-left flex items-center gap-3 disabled:opacity-60">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-forest text-paper font-display font-bold text-[15px]">ZL</span>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-[16px] truncate">Chat with Zeh L'Zeh Office</div>
                <div className="text-[14px] text-muted truncate">{officeUser ? 'Coordinator team · any time' : 'Loading…'}</div>
              </div>
              <MessageSquare size={20} className="text-forest" />
            </button>
          ) : (
            <a href={OFFICE_TEL}
               className="haptic mt-3 w-full bg-paper border border-sage-line rounded-[16px] p-4 text-left flex items-center gap-3">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-forest text-paper"><Phone size={20} /></span>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-[16px]">Chat unavailable</div>
                <div className="text-[14px] text-muted">Call the office: <b className="text-forest">{OFFICE_PHONE}</b></div>
              </div>
            </a>
          )}
        </FadeUp>

        {/* Self-edit profile shortcut. */}
        <FadeUp delay={0.13}>
          <button onClick={() => nav('/profile')}
                  className="haptic mt-3 w-full bg-paper border border-line rounded-[16px] p-4 text-left flex items-center gap-3 hover:border-forest/40">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-sage text-forest"><Edit3 size={18} /></span>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-[16px] truncate">Edit store info</div>
              <div className="text-[14px] text-muted truncate">Address, contact, pickup times, where to go in</div>
            </div>
          </button>
        </FadeUp>
      </main>
      {undoBar}
    </div>
  );
}

// Plain words for where the pickup stands.
// Oct 9 client: past pickups say what happened — never "Looking for a driver…".
function statusLine(p: StorePickup, isPast?: boolean): { text: string; tone: string } {
  const s = String(p.status);
  if (s === 'cancelled') return { text: 'Cancelled', tone: 'text-muted' };
  if (s === 'missed') return { text: 'No driver came', tone: 'text-clay' };
  if (s === 'completed' || s === 'delivered') return { text: 'Done — picked up. Thank you!', tone: 'text-forest' };
  if (s === 'picked_up' || p.pickedUpAt) return { text: `Picked up${p.drivers ? ` by ${p.drivers}` : ''}`, tone: 'text-forest' };
  // Oct 14 client: a steady pickup waiting for the store's YES / NO said "Looking for a driver".
  if (s === 'pending_confirmation') return { text: 'Waiting for you: is there food today? Answer our text YES or NO.', tone: 'text-[#8a6011]' };
  if (isPast) return p.drivers ? { text: `Done — ${p.drivers}`, tone: 'text-forest' } : { text: 'No driver came', tone: 'text-clay' };
  if (p.drivers) return { text: `✓ ${p.drivers} ${p.drivers.includes(',') ? 'are' : 'is'} on the way`, tone: 'text-forest' };
  return { text: 'Looking for a driver…', tone: 'text-[#8a6011]' };
}

function SupplierRow({ p, day, muted, isPast, onCancel, onEdit }: { p: StorePickup; day: string; muted?: boolean; isPast?: boolean; onCancel?: () => void; onEdit?: () => void }) {
  // p.time is a wall-clock time (already Eastern) — format as-is.
  const dt = `${day}${p.time ? ` · ${fmtTime(p.time)}` : ''}${p.steady ? ' · steady' : ''}`;
  const st = statusLine(p, isPast);
  const editable = !isPast && ['pending', 'scheduled', 'confirmed'].includes(String(p.status));
  return (
    <Card className={cx('!p-3.5', muted && 'bg-cream/60 border-line/60')}>
      <div className={cx('text-[15px] font-bold', st.tone)}>{st.text}</div>
      <div className="text-[14px] text-muted font-semibold mt-0.5">{dt}</div>
      {/* Oct 14 client: small thumbnail of the photo the store added. */}
      {p.photoUrl ? (
        <div className="flex items-center gap-2 mt-1.5 min-w-0">
          <StorePhotoThumb url={p.photoUrl} size={40} />
          {(p.food || p.amount) && <div className="text-[14px] text-ink min-w-0">{[p.food, p.amount].filter(Boolean).join(' · ')}</div>}
        </div>
      ) : (p.food || p.amount) && <div className="text-[14px] text-ink mt-1.5">{[p.food, p.amount].filter(Boolean).join(' · ')}</div>}
      {editable && (onEdit || onCancel) && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {onEdit && <button onClick={onEdit} className="haptic min-h-[44px] rounded-[10px] border border-line bg-paper py-2.5 text-[15px] font-bold text-forest">Edit</button>}
          {onCancel && <button onClick={onCancel} className="haptic min-h-[44px] rounded-[10px] border border-clay/40 bg-paper py-2.5 text-[15px] font-bold text-clay">Cancel pickup</button>}
        </div>
      )}
    </Card>
  );
}
