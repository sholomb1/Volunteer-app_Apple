/**
 * Oct 21 client (ops review #5 + #6): office screens for the no-driver escalation and
 * the end-of-day close-out. Server: routes/closeout.ts, escalation.ts (API).
 *
 *   CloseOutPanel          Pickups → Close out: today's pickups not closed yet, ✓ Done (amount / lbs),
 *                          ✗ Missed (reason), Driver didn't show, and "All taken ones were done".
 *   CloseOutNumbers        food rescued by size, missed by reason, no-shows per driver (also in Reports).
 *   NoDriverHelp           pickup page: "Call drivers who usually do this store", and 1h late →
 *                          Put back in queue / Cancel / Mark missed.
 *   NoDriverLateBadge      Live Board card: red "No driver 1h late".
 *   EscalationAlertExtra   the alert pop-up: 📞 usual drivers (T−30) / what to do (T+60).
 *   EscalationSettingsCard Settings (admins): on/off + minutes of each step, Escalation contacts.
 */
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, canWrite, getUser } from './api';
import { cx } from './design';
import { uiConfirm, uiNotify } from './ui-dialogs';
import { DriverCallButtons } from './call-driver';
import type { PickupLabelInput } from './pickup-label'; // Oct 22 client: the Text box names the pickup
import { fmtTime, nyToday } from './time-format';
import { dayText, displayPhone, stripUnit, type StatusKey } from './display'; // Oct 23 client: same style everywhere
import { Name, StatusPill } from './display-ui';
import { tidyPlaceName } from './pickup-label';

/** Close-out reasons → the one status word + color (the reason itself shows in the pill's tooltip). */
const BUCKET_STATUS: Record<string, StatusKey> = {
  taken: 'nokiosk', on_it: 'covered', no_driver: 'needs_driver', needs_review: 'review', expired: 'expired', missed: 'missed',
};

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------
type Step = { on: boolean; min: number };
type Contact = { userId: number | null; name: string | null; phone: string | null };
export type EscSettings = { t30: Step; t0: Step; t60: Step; leaving?: { on: boolean }; contacts: Contact[] }; // Oct 28 client: leaving = 30 min before it leaves the drivers' list
const DEFAULTS: EscSettings = { t30: { on: true, min: 30 }, t0: { on: true, min: 0 }, t60: { on: true, min: 60 }, contacts: [] };

export function useEscSettings() {
  return useQuery({
    queryKey: ['escalation-settings'],
    queryFn: () => api<{ data: EscSettings }>('/api/escalation/settings'),
    staleTime: 5 * 60_000,
  });
}

/** Minutes the pickup is past its time, on the New York clock (negative = still to come). */
export function minutesLate(date: string | null | undefined, time: string | null | undefined, now = new Date()): number | null {
  const d = String(date ?? '').slice(0, 10);
  const t = String(time ?? '').slice(0, 5);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !/^\d{2}:\d{2}$/.test(t)) return null;
  const nowWall = Date.parse(now.toLocaleString('sv-SE', { timeZone: 'America/New_York' }).replace(' ', 'T') + 'Z');
  const at = Date.parse(`${d}T${t}:00Z`);
  return Number.isFinite(nowWall) && Number.isFinite(at) ? Math.round((nowWall - at) / 60_000) : null;
}

const late1h = (lateMin: number) => {
  const h = Math.floor(lateMin / 60);
  return h >= 1 ? `${h}h` : `${lateMin} min`;
};

const chip = (on: boolean) => cx('haptic rounded-full border px-3 py-1 text-[12.5px] font-bold',
  on ? 'border-forest bg-forest text-paper' : 'border-line bg-paper text-ink hover:border-forest');

const REASONS: Array<[string, string]> = [
  ['driver_no_show', 'Driver no-show'], ['store_no_food', 'Store had no food'], ['store_closed', 'Store closed'],
  ['cancelled_late', 'Cancelled late'], ['other', 'Other'],
];
const AMOUNTS: Array<[string, string]> = [['small', 'Small'], ['medium', 'Medium'], ['large', 'Large']];

// ---------------------------------------------------------------------------
// Live Board badge
// ---------------------------------------------------------------------------
export function NoDriverLateBadge({ date, time, need, open }: { date: string; time: string | null; need: number; open: boolean }) {
  const s = useEscSettings();
  if (!open || !(need > 0)) return null;
  const late = minutesLate(date, time);
  const limit = s.data?.data?.t60?.min ?? DEFAULTS.t60.min;
  if (late == null || late < limit) return null;
  return (
    <span data-no-driver-late className="inline-flex items-center font-extrabold text-paper bg-red-600 rounded-full px-2 py-0.5"
          title="Still no driver. Put it back in the queue, cancel it, or mark it missed (open the pickup).">
      No driver {late1h(late)} late
    </span>
  );
}

// ---------------------------------------------------------------------------
// Drivers who usually do this store
// ---------------------------------------------------------------------------
type Usual = { volunteer_id: number; first_name: string; last_name: string; unit_number: number | null; phone: string | null; count: number; last: string };
function useUsualDrivers(pickupId: number, enabled = true) {
  return useQuery({
    queryKey: ['usual-drivers', pickupId],
    queryFn: () => api<{ data: Usual[] }>(`/api/pickup-instances/${pickupId}/usual-drivers`),
    enabled, staleTime: 5 * 60_000,
  });
}

function UsualDriversList({ pickupId, pickupRef, pickup, big, compact }: { pickupId: number; pickupRef?: string | null; pickup?: PickupLabelInput | null; big?: boolean; compact?: boolean }) {
  const q = useUsualDrivers(pickupId);
  const rows = q.data?.data ?? [];
  if (q.isLoading) return <div className="text-[12.5px] text-muted">Looking up drivers…</div>;
  if (!rows.length) return <div className="text-[12.5px] text-muted">Nobody did this store in the last 6 months — try On call now.</div>;
  if (compact) {
    return <DriverCallButtons pickupId={pickupId} pickupRef={pickupRef} pickup={pickup}
                              drivers={rows.map((u) => ({ volunteer_id: u.volunteer_id, first_name: u.first_name, last_name: u.last_name, phone: u.phone }))} />;
  }
  return (
    <div className="space-y-1.5">
      {rows.map((u) => (
        <div key={u.volunteer_id} className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <DriverCallButtons pickupId={pickupId} pickupRef={pickupRef} pickup={pickup} big={big}
                             drivers={[{ volunteer_id: u.volunteer_id, first_name: u.first_name, last_name: u.last_name, phone: u.phone }]} />
          <span className="text-[12px] text-muted"><Name first={u.first_name} last={u.last_name} /> · did it {u.count}× · last {u.last}{u.phone ? ` · ${displayPhone(u.phone)}` : ''}</span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pickup page
// ---------------------------------------------------------------------------
export function NoDriverHelp({ pickupId, pickupRef, pickup, date, time, remaining, resolved, onTextAgain, onCancel }: {
  pickupId: number; pickupRef?: string | null; date: string; time: string | null; remaining: number; resolved: boolean;
  pickup?: PickupLabelInput | null; // Oct 22 client
  onTextAgain?: () => void; onCancel?: () => void;
}) {
  const s = useEscSettings();
  const qc = useQueryClient();
  const [missing, setMissing] = useState(false);
  const late = minutesLate(date, time);
  const writeOk = canWrite(getUser()?.role);
  const miss = useMutation({
    mutationFn: (reason: string) => api(`/api/closeout/${pickupId}`, { method: 'POST', body: JSON.stringify({ result: 'missed', reason }) }),
    onSuccess: () => {
      uiNotify('Marked missed.', 'ok'); setMissing(false);
      for (const k of ['admin-pickup-single', 'admin-pickup-detail', 'pickup-history', 'admin-pickups', 'admin-pickups-range', 'closeout']) qc.invalidateQueries({ queryKey: [k] });
    },
    onError: (e: Error) => uiNotify(e.message, 'err'),
  });
  if (resolved || !(remaining > 0) || late == null || late < -60) return null;
  const limit = s.data?.data?.t60?.min ?? DEFAULTS.t60.min;
  const veryLate = late >= limit;
  return (
    <section data-no-driver-help className={cx('rounded-[14px] border px-4 py-3 space-y-2', veryLate ? 'border-red-300 bg-red-50' : 'border-amber/60 bg-amber-soft/40')}>
      {veryLate && (
        <div className="space-y-2">
          <div className="text-[14px] font-extrabold text-red-700">🚨 No driver {late1h(late)} late. Choose:</div>
          {writeOk && (
            <div className="flex flex-wrap gap-2">
              {onTextAgain && <button onClick={onTextAgain} className="haptic rounded-[9px] bg-forest px-3 py-1.5 text-[12.5px] font-bold text-paper">🔁 Put back in queue (text drivers again)</button>}
              {onCancel && <button onClick={onCancel} className="haptic rounded-[9px] border border-clay/40 bg-paper px-3 py-1.5 text-[12.5px] font-bold text-clay">Cancel pickup</button>}
              <button onClick={() => setMissing((v) => !v)} className="haptic rounded-[9px] border border-line bg-paper px-3 py-1.5 text-[12.5px] font-bold text-ink">✗ Mark missed</button>
            </div>
          )}
          {missing && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[12.5px] font-bold">Why?</span>
              {REASONS.filter(([k]) => k !== 'driver_no_show' && k !== 'other').map(([k, l]) => (
                <button key={k} disabled={miss.isPending} onClick={() => miss.mutate(k)} className={chip(false)}>{l}</button>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="text-[11px] font-extrabold uppercase tracking-[.05em] text-forest-deep">📞 Call drivers who usually do this store</div>
      <UsualDriversList pickupId={pickupId} pickupRef={pickupRef} pickup={pickup} big />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Alert pop-up extra
// ---------------------------------------------------------------------------
export const ESCALATION_KINDS = ['no_driver_soon', 'no_driver_now', 'no_driver_late', 'no_driver_leaving']; // Oct 28 client: + leaves the drivers' list
export function EscalationAlertExtra({ kind, pickupId }: { kind: string; pickupId: number | null }) {
  if (!pickupId || !ESCALATION_KINDS.includes(kind)) return null;
  if (kind === 'no_driver_leaving') {
    return <div className="mt-2 text-[12.5px] font-bold text-red-700">Open the pickup: Keep offering longer · Cancel. Or text its number + AGAIN / CLOSE.</div>;
  }
  if (kind === 'no_driver_late') {
    return <div className="mt-2 text-[12.5px] font-bold text-red-700">Open the pickup: Put back in queue · Cancel · Mark missed.</div>;
  }
  if (kind !== 'no_driver_soon') return null;
  return (
    <div className="mt-2 space-y-1">
      <div className="text-[11px] font-extrabold uppercase tracking-[.05em] text-forest-deep">Call drivers who usually do this store</div>
      <UsualDriversList pickupId={pickupId} compact />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pickups → Close out
// ---------------------------------------------------------------------------
type Row = {
  id: number; ref: string; date: string; time: string | null; place: string; bucket: string; bucketLabel: string;
  kiosk: boolean; driversOn: number; needed: number; plannedSize: string | null; estimatedQuantity: string | null;
  drivers: Array<{ volunteer_id: number; first_name: string; last_name: string; phone: string | null }>;
};
type ListRes = { data: Row[]; meta: { date: string; today: string; closedOut: number; total: number } };

function shiftYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function CloseOutPanel({ onOpenPickup }: { onOpenPickup?: (id: number) => void }) {
  const today = nyToday();
  const [date, setDate] = useState(today);
  const qc = useQueryClient();
  const writeOk = canWrite(getUser()?.role);
  const q = useQuery({ queryKey: ['closeout', date], queryFn: () => api<ListRes>(`/api/closeout?date=${date}`), refetchInterval: 60_000 });
  const rows = q.data?.data ?? [];
  const takenIds = rows.filter((r) => r.bucket === 'taken' || r.bucket === 'on_it').map((r) => r.id);
  const refresh = () => { for (const k of ['closeout', 'closeout-summary', 'admin-pickups', 'admin-pickups-range', 'not-checked-in']) qc.invalidateQueries({ queryKey: [k] }); };
  const bulk = useMutation({
    mutationFn: () => api<{ data: { done: number } }>('/api/closeout/bulk-done', { method: 'POST', body: JSON.stringify({ ids: takenIds }) }),
    onSuccess: (r) => { uiNotify(`${r.data.done} marked done.`, 'ok'); refresh(); },
    onError: (e: Error) => uiNotify(e.message, 'err'),
  });
  const dayWord = date === today ? 'today' : date === shiftYmd(today, -1) ? 'yesterday' : dayText(date, today);
  return (
    <div className="space-y-3" data-closeout>
      <div className="rounded-[14px] border border-line bg-paper px-4 py-3 flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[200px]">
          <div className="font-display font-semibold text-[17px]">Close out {dayWord}</div>
          <div className="text-[12.5px] text-muted">
            {q.isLoading ? 'Loading…' : `${rows.length} not closed · ${q.data?.meta.closedOut ?? 0} closed out`}
            {' '}· Say what happened to each pickup: done (and how much food), missed (why), or the driver didn't show.
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => setDate(shiftYmd(date, -1))} className="haptic rounded-[9px] border border-line bg-paper px-2.5 py-1.5 text-[12.5px] font-bold">‹ Day before</button>
          {date !== today && <button onClick={() => setDate(today)} className="haptic rounded-[9px] border border-line bg-paper px-2.5 py-1.5 text-[12.5px] font-bold">Today</button>}
        </div>
        {writeOk && takenIds.length > 0 && (
          <button disabled={bulk.isPending}
                  onClick={() => void uiConfirm(`Mark all ${takenIds.length} taken pickups as done?\n\nUse this when every driver who took a pickup did it. Set the missed ones first.`).then((ok) => { if (ok) bulk.mutate(); })}
                  className="haptic rounded-[10px] bg-forest px-3.5 py-2 text-[13px] font-bold text-paper disabled:opacity-50">
            ✓ All taken ones were done ({takenIds.length})
          </button>
        )}
      </div>
      {!q.isLoading && rows.length === 0 && (
        <div className="rounded-[14px] border border-sage-line bg-sage/40 px-4 py-3 text-[13.5px] font-bold text-forest">✓ Everything for {dayWord} is closed.</div>
      )}
      {rows.map((r) => <CloseOutRow key={r.id} r={r} writeOk={writeOk} onDone={refresh} onOpen={onOpenPickup} />)}
      <CloseOutNumbers days={30} />
    </div>
  );
}

function CloseOutRow({ r, writeOk, onDone, onOpen }: { r: Row; writeOk: boolean; onDone: () => void; onOpen?: (id: number) => void }) {
  const [mode, setMode] = useState<'' | 'done' | 'missed' | 'no_show'>('');
  const [amount, setAmount] = useState<string>('');
  const [lbs, setLbs] = useState('');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [noShow, setNoShow] = useState<number[]>([]);
  const save = useMutation({
    mutationFn: (body: any) => api(`/api/closeout/${r.id}`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => { uiNotify(`${r.place} closed out.`, 'ok'); onDone(); },
    onError: (e: Error) => uiNotify(e.message, 'err'),
  });
  // Oct 23 client ("same style everywhere"): the one status word + color; the close-out reason in the tooltip.
  const stKey = BUCKET_STATUS[r.bucket] ?? 'needs_driver';
  const submit = () => {
    if (mode === 'done') save.mutate({ result: 'done', amount: amount || null, lbs: lbs ? Number(lbs) : null, noShowIds: noShow });
    else if (mode === 'missed') save.mutate({ result: 'missed', reason, note: note || null, noShowIds: reason === 'driver_no_show' ? noShow : [] });
    else if (mode === 'no_show') save.mutate({ result: 'no_show', noShowIds: noShow });
  };
  const canSave = mode === 'done' || (mode === 'missed' && reason && (reason !== 'other' || note.trim())) || mode === 'no_show';
  return (
    <div data-closeout-row={r.id} className="rounded-[14px] border border-line bg-paper px-4 py-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-display font-bold text-[14px] text-forest">{r.time ? fmtTime(r.time) : '—'}</span>
        <button onClick={() => onOpen?.(r.id)} className="font-bold text-[14px] text-ink hover:underline text-left"><Name>{tidyPlaceName(r.place) || r.place}</Name></button>
        <StatusPill k={stKey} title={r.bucketLabel} />
        {r.plannedSize && <span className="text-[11px] text-muted">posted as {r.plannedSize}</span>}
      </div>
      <div className="text-[12.5px] text-muted">{r.drivers.length ? <>Driver{r.drivers.length > 1 ? 's' : ''}: {r.drivers.map((d, i) => <span key={d.volunteer_id}>{i > 0 ? ', ' : ''}<Name first={d.first_name} last={d.last_name} /></span>)}</> : 'No driver on it'}</div>
      {writeOk && (
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => { setMode(mode === 'done' ? '' : 'done'); setNoShow([]); }} className={chip(mode === 'done')}>✓ Done</button>
          <button onClick={() => { setMode(mode === 'missed' ? '' : 'missed'); setNoShow([]); }} className={chip(mode === 'missed')}>✗ Missed</button>
          {r.drivers.length > 0 && <button onClick={() => { setMode(mode === 'no_show' ? '' : 'no_show'); setNoShow(r.drivers.length === 1 ? [r.drivers[0]!.volunteer_id] : []); }} className={chip(mode === 'no_show')}>Driver didn't show</button>}
        </div>
      )}
      {mode === 'done' && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[12.5px] font-bold">How much food? (optional)</span>
          {AMOUNTS.map(([k, l]) => <button key={k} onClick={() => setAmount(amount === k ? '' : k)} className={chip(amount === k)}>{l}</button>)}
          <input inputMode="decimal" value={lbs} onChange={(e) => setLbs(e.target.value.replace(/[^\d.]/g, ''))} placeholder="lbs"
                 className="w-[70px] rounded-[8px] border border-line bg-cream/60 px-2 py-1 text-[13px]" />
          <span className="text-[12px] text-muted">lbs</span>
        </div>
      )}
      {mode === 'missed' && (
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[12.5px] font-bold">Why?</span>
            {REASONS.filter(([k]) => k !== 'driver_no_show' || r.drivers.length > 0).map(([k, l]) => <button key={k} onClick={() => setReason(k)} className={chip(reason === k)}>{l}</button>)}
          </div>
          {(reason === 'other' || reason) && (
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder={reason === 'other' ? 'What happened? (needed)' : 'Note (optional)'}
                   className="w-full max-w-[420px] rounded-[8px] border border-line bg-cream/60 px-2 py-1 text-[13px]" />
          )}
        </div>
      )}
      {((mode === 'no_show' || (mode === 'missed' && reason === 'driver_no_show') || mode === 'done') && r.drivers.length > 1) && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[12.5px] font-bold">{mode === 'done' ? "Anyone who didn't show? (optional)" : "Who didn't show? (none ticked = all)"}</span>
          {r.drivers.map((d) => (
            <button key={d.volunteer_id} onClick={() => setNoShow((x) => x.includes(d.volunteer_id) ? x.filter((y) => y !== d.volunteer_id) : [...x, d.volunteer_id])}
                    className={chip(noShow.includes(d.volunteer_id))}><Name first={d.first_name} last={d.last_name} /></button>
          ))}
        </div>
      )}
      {mode && (
        <button disabled={!canSave || save.isPending} onClick={submit}
                className="haptic rounded-[10px] bg-forest px-3.5 py-1.5 text-[13px] font-bold text-paper disabled:opacity-40">
          {save.isPending ? 'Saving…' : mode === 'done' ? 'Save — done' : mode === 'no_show' ? "Save — driver didn't show" : 'Save — missed'}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Numbers (Close out page + Reports)
// ---------------------------------------------------------------------------
type Summary = { days: number; closedOut: number; done: number; missed: number; food: Record<string, number>; lbs: number;
  missedBy: Record<string, number>; noShows: Array<{ id: number; name: string; n: number; last: string }>; reasons: Record<string, string> };

export function CloseOutNumbers({ days: initial = 30, pickDays = false }: { days?: number; pickDays?: boolean }) {
  const [days, setDays] = useState(initial);
  const q = useQuery({ queryKey: ['closeout-summary', days], queryFn: () => api<{ data: Summary }>(`/api/closeout/summary?days=${days}`), staleTime: 60_000 });
  const s = q.data?.data;
  const tile = (label: string, value: string | number, hint?: string) => (
    <div className="rounded-[12px] border border-line bg-cream/40 px-3 py-2 min-w-[110px]">
      <div className="text-[20px] font-display font-bold text-ink leading-tight">{value}</div>
      <div className="text-[11.5px] font-bold text-muted">{label}</div>
      {hint && <div className="text-[11px] text-muted">{hint}</div>}
    </div>
  );
  return (
    <div data-closeout-numbers className="rounded-[14px] border border-line bg-paper px-4 py-3 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="font-display font-semibold text-[16px] flex-1">Close-out numbers · last {days} days</div>
        {pickDays && [7, 30, 90].map((d) => <button key={d} onClick={() => setDays(d)} className={chip(days === d)}>{d} days</button>)}
      </div>
      {!s ? <div className="text-[12.5px] text-muted">Loading…</div> : (
        <>
          <div className="flex flex-wrap gap-2">
            {tile('Closed out', s.closedOut)}
            {tile('Done', s.done)}
            {tile('Missed', s.missed)}
            {tile('Food: small', s.food.small ?? 0)}
            {tile('Food: medium', s.food.medium ?? 0)}
            {tile('Food: large', s.food.large ?? 0)}
            {tile('Pounds', s.lbs, s.food.notSaid ? `${s.food.notSaid} done with no amount` : undefined)}
          </div>
          {Object.keys(s.missedBy).length > 0 && (
            <div className="text-[12.5px] text-ink"><span className="font-bold">Missed because:</span>{' '}
              {Object.entries(s.missedBy).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${s.reasons[k] ?? k} ${n}`).join(' · ')}</div>
          )}
          <div>
            <div className="text-[12.5px] font-bold text-ink">No-shows per driver</div>
            {s.noShows.length === 0 ? <div className="text-[12.5px] text-muted">None recorded.</div> : (
              <ul className="mt-1 grid gap-x-6 gap-y-0.5 sm:grid-cols-2 text-[12.5px]">
                {s.noShows.map((d) => <li key={d.id}><Name className="font-bold">{stripUnit(d.name)}</Name> — {d.n} · last {d.last}</li>)}
              </ul>
            )}
          </div>
          <div className="text-[11.5px] text-muted">Counts start with the first close-out. No-shows also include ones the office set before.</div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Settings (admins)
// ---------------------------------------------------------------------------
type Opt = { id: number; name: string; role: string; phone: string | null };
export function EscalationSettingsCard() {
  const role = String(getUser()?.role ?? '');
  const isAdmin = ['admin', 'staff', 'coordinator'].includes(role);
  const qc = useQueryClient();
  const q = useEscSettings();
  const opts = useQuery({ queryKey: ['escalation-contact-options'], queryFn: () => api<{ data: Opt[] }>('/api/escalation/contact-options'), enabled: isAdmin, staleTime: 5 * 60_000 });
  const [d, setD] = useState<EscSettings | null>(null);
  const [phone, setPhone] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { if (q.data?.data) setD(q.data.data); }, [q.data]);
  const save = useMutation({
    mutationFn: (s: EscSettings) => api<{ data: EscSettings }>('/api/escalation/settings', { method: 'PUT', body: JSON.stringify(s) }),
    onSuccess: (r) => { setD(r.data); setMsg({ ok: true, text: 'Saved.' }); qc.invalidateQueries({ queryKey: ['escalation-settings'] }); },
    onError: (e: Error) => setMsg({ ok: false, text: e.message }),
  });
  const changed = useMemo(() => JSON.stringify(d) !== JSON.stringify(q.data?.data ?? null), [d, q.data]);
  if (!isAdmin || !d) return null;
  const setStep = (k: 't30' | 't0' | 't60', patch: Partial<Step>) => { setD({ ...d, [k]: { ...d[k], ...patch } }); setMsg(null); };
  const row = (k: 't30' | 't0' | 't60', label: string, unit: string, who: string) => (
    <label className="flex flex-wrap items-center gap-2 text-[13.5px]">
      <input type="checkbox" checked={d[k].on} onChange={(e) => setStep(k, { on: e.target.checked })} />
      <span className="font-bold w-[70px]">{label}</span>
      <input type="number" min={0} max={360} value={d[k].min} onChange={(e) => setStep(k, { min: Number(e.target.value) })}
             className="w-[64px] rounded-[8px] border border-line bg-cream/60 px-2 py-1 text-right" />
      <span>{unit}</span>
      <span className="text-muted text-[12.5px]">→ {who}</span>
    </label>
  );
  const optName = (id: number | null) => (opts.data?.data ?? []).find((o) => o.id === id)?.name ?? `Login #${id}`;
  const addUser = (id: number) => {
    const o = (opts.data?.data ?? []).find((x) => x.id === id);
    if (!o || d.contacts.some((c) => c.userId === id)) return;
    setD({ ...d, contacts: [...d.contacts, { userId: id, name: o.name, phone: o.phone ? o.phone.replace(/\D/g, '').slice(-10) : null }] }); setMsg(null);
  };
  const addPhone = () => {
    const p = phone.replace(/\D/g, '').slice(-10);
    if (p.length !== 10) { setMsg({ ok: false, text: 'Type a 10-digit phone number.' }); return; }
    setD({ ...d, contacts: [...d.contacts, { userId: null, name: null, phone: p }] }); setPhone(''); setMsg(null);
  };
  return (
    <div data-escalation-settings className="rounded-[14px] border border-line bg-paper p-4 space-y-3">
      <div>
        <div className="font-display font-semibold text-[16px]">🚨 No-driver escalation</div>
        <div className="text-[12.5px] text-muted">For a pickup drivers can see that still has no driver. Each step once per pickup, 8 AM–9 PM, never on Shabbos / Yom Tov. The 60-minute alert to the dispatcher on duty stays as it is.</div>
      </div>
      <div className="space-y-1.5">
        {row('t30', 'Step 1', 'min before', 'dispatcher on duty + every office phone with alerts on, with "Call drivers who usually do this store"')}
        {row('t0', 'Step 2', 'min after the time', 'managers: bell + phone alert + one text')}
        {row('t60', 'Step 3', 'min after the time', 'managers again; Live Board "No driver 1h late"')}
        {/* Oct 28 client: warn the managers before an untaken pickup falls off the drivers' list */}
        <label className="flex flex-wrap items-center gap-2 text-[13.5px]">
          <input type="checkbox" checked={d.leaving?.on !== false} onChange={(e) => { setD({ ...d, leaving: { on: e.target.checked } }); setMsg(null); }} />
          <span className="font-bold">Before it leaves the drivers' list (30 min)</span>
          <span className="text-muted text-[12.5px]">→ managers: bell + phone alert + one text (8 AM–9 PM). They can reply "520 AGAIN" (6 more hours, texts drivers again) or "520 CLOSE".</span>
        </label>
      </div>
      <div className="space-y-1.5">
        <div className="text-[13.5px] font-bold">Escalation contacts (managers)</div>
        <div className="text-[12.5px] text-muted">{d.contacts.length ? 'Steps 2 and 3 and the "leaves the drivers\' list" warning go to these people. Logins get the bell + phone alert; phone numbers get the text.' : 'None set: steps 2 and 3 and the "leaves the drivers\' list" warning go to every admin login (and a text to the phone on their login, if any).'}</div>
        {d.contacts.map((c, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2 text-[13px]">
            <span className="font-bold">{c.userId ? optName(c.userId) : (c.name || 'Phone')}</span>
            <input value={c.phone ?? ''} placeholder="phone for the text" onChange={(e) => { const cs = [...d.contacts]; cs[i] = { ...c, phone: e.target.value.replace(/\D/g, '').slice(-10) || null }; setD({ ...d, contacts: cs }); setMsg(null); }}
                   className="w-[130px] rounded-[8px] border border-line bg-cream/60 px-2 py-1" />
            <button onClick={() => { setD({ ...d, contacts: d.contacts.filter((_, j) => j !== i) }); setMsg(null); }} className="haptic text-[12px] font-bold text-clay">Remove</button>
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-2">
          <select value="" onChange={(e) => addUser(Number(e.target.value))} className="rounded-[8px] border border-line bg-paper px-2 py-1 text-[13px]">
            <option value="">+ Add an office login…</option>
            {(opts.data?.data ?? []).filter((o) => !d.contacts.some((c) => c.userId === o.id)).map((o) => <option key={o.id} value={o.id}>{o.name} ({o.role})</option>)}
          </select>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="or a phone number" className="w-[150px] rounded-[8px] border border-line bg-cream/60 px-2 py-1 text-[13px]" />
          <button onClick={addPhone} className="haptic rounded-[8px] border border-line bg-paper px-2.5 py-1 text-[12.5px] font-bold">Add phone</button>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button disabled={!changed || save.isPending} onClick={() => save.mutate(d)}
                className="haptic rounded-[10px] bg-forest px-3.5 py-1.5 text-[13px] font-bold text-paper disabled:opacity-40">{save.isPending ? 'Saving…' : 'Save'}</button>
        {msg && <span className={cx('text-[12.5px] font-bold', msg.ok ? 'text-forest' : 'text-clay')}>{msg.text}</span>}
      </div>
    </div>
  );
}
