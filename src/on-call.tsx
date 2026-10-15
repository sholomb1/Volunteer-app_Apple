/**
 * Oct 8 client: "On call" — the hours a driver is happy to be CALLED when a
 * pickup needs a driver. Drivers set their own (app profile); the office can
 * set them in the driver's profile. The Live Board shows who's on call now.
 * API: routes/on-call.ts (zlz.volunteer_availability).
 * Oct 11 client: the office logs the calls it makes to on-call drivers (Log call).
 */
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Phone } from 'lucide-react';
import { api } from './api';
import { fmtDay, fmtTime, fmtTimeEastern, nyToday } from './time-format';

type Slot = { day: string; start: string; end: string; note?: string | null };
const DAYS: Array<[string, string]> = [
  ['sunday', 'Sunday'], ['monday', 'Monday'], ['tuesday', 'Tuesday'], ['wednesday', 'Wednesday'],
  ['thursday', 'Thursday'], ['friday', 'Friday'], ['saturday', 'Saturday'],
];
const dayName = (d: string) => DAYS.find(([k]) => k === d)?.[1] ?? d;
// Oct 14 client: "Weekdays" (= Mon–Thu) and "Every day" in the day picker. Still stored as
// one row per day (no API change): Save expands the choice into one row per day with the
// same hours + note; on load, identical Mon–Thu / Sun–Sat rows show again as one line.
export const ON_CALL_GROUPS: Record<string, { label: string; short: string; days: string[] }> = {
  weekdays: { label: 'Weekdays (Mon–Thu)', short: 'Mon–Thu', days: ['monday', 'tuesday', 'wednesday', 'thursday'] },
  everyday: { label: 'Every day', short: 'Every day', days: DAYS.map(([k]) => k) },
};
type Row = Slot & { view?: boolean };
/** Oct 14 client: one row per day → "weekdays"/"everyday" rows (display grouping only). */
export function groupSlots(slots: Slot[]): Row[] { // Oct 14 client: also My application
  const used = new Set<number>();
  const out: Row[] = [];
  const nt = (n?: string | null) => (n ?? '').trim();
  slots.forEach((s, i) => {
    if (used.has(i)) return;
    for (const g of ['everyday', 'weekdays']) {
      const days = ON_CALL_GROUPS[g].days;
      if (!days.includes(s.day)) continue;
      const picks: number[] = [];
      for (const d of days) {
        const j = d === s.day ? i : slots.findIndex((x, k) => !used.has(k) && k !== i && !picks.includes(k)
          && x.day === d && x.start === s.start && x.end === s.end && nt(x.note) === nt(s.note));
        if (j < 0) break;
        picks.push(j);
      }
      if (picks.length === days.length) { picks.forEach((k) => used.add(k)); out.push({ ...s, day: g, view: true }); return; }
    }
    used.add(i);
    out.push(s);
  });
  return out;
}
/** Oct 14 client: "weekdays"/"everyday" rows → one row per day, for saving. */
export function expandOnCall<T extends { day: string }>(rows: T[]): T[] {
  return rows.flatMap((r) => (ON_CALL_GROUPS[r.day] ? ON_CALL_GROUPS[r.day].days.map((day) => ({ ...r, day })) : [r]));
}
// ---- Oct 14 client: "When can we call you if a pickup needs a driver?"
// (Anytime) / (Only at these times) / (Please don't call). One source of truth: the
// on-call rows above (no new column): Anytime = every day 00:00–24:00, Please don't
// call = no rows. Used by the sign-up form, "Update my answers", Settings and the
// office driver profile (API: apps/api/src/call-choice.ts).
export type CallWhen = 'anytime' | 'times' | 'never';
export const CALL_QUESTION = 'When can we call you if a pickup needs a driver?';
export const CALL_CHOICES: Array<{ value: CallWhen; icon: string; label: string; help: string }> = [
  { value: 'anytime', icon: '📞', label: 'Anytime',             help: 'Any day, any hour.' },
  { value: 'times',   icon: '🕘', label: 'Only at these times', help: 'You pick the days and hours.' },
  { value: 'never',   icon: '🚫', label: "Please don't call",   help: 'No phone calls about pickups.' },
];
export const isAllDaySlot = (s: { start: string; end: string }) => String(s.start).slice(0, 5) === '00:00' && String(s.end).slice(0, 5) === '24:00';
export const ANYTIME_SLOTS: Slot[] = DAYS.map(([day]) => ({ day, start: '00:00', end: '24:00' }));
/** Which answer the saved rows mean (rows one per day; "weekdays"/"everyday" groups are expanded first). */
export function callWhenOf(slots: Array<{ day: string; start: string; end: string }>): CallWhen {
  const rows = expandOnCall(slots ?? []);
  if (rows.length === 0) return 'never';
  return DAYS.every(([d]) => rows.some((s) => s.day === d && isAllDaySlot(s))) ? 'anytime' : 'times';
}
// Oct 14 client: "Not answered" — no hours used to read as "Please don't call" for everyone
// who never answered. The API sends the answer with the hours (callWhen: 'unanswered' unless
// the person picked one); the sign-up payload keeps it as callChoice ('dont_call').
export type CallAnswer = CallWhen | 'unanswered';
/** Hours → Anytime / the times; no hours → "Please don't call" only if they chose it. */
export function callAnswerOf(choice: unknown, slots: Array<{ day: string; start: string; end: string }>): CallAnswer {
  if (expandOnCall(slots ?? []).length > 0) return callWhenOf(slots);
  return choice === 'never' || choice === 'dont_call' ? 'never' : 'unanswered';
}
/** "12:00 AM" for the end of the day (24:00), else fmtTime. */
export const fmtCallTime = (t: string) => (String(t).slice(0, 5) === '24:00' ? '12:00 AM' : fmtTime(String(t).slice(0, 5)));
/** "Anytime" / "Please don't call" / "Not answered" / "Mon–Thu 9:00 AM – 1:00 PM, Sunday 9:00 PM – 1:00 AM".
 *  Oct 14 client: `choice` = the person's answer (callWhen from the API or callChoice from the sign-up). */
export function callSummary(slots: Array<{ day: string; start: string; end: string; note?: string | null }>, opts: { saturday?: string; choice?: unknown } = {}): string {
  const when = callAnswerOf(opts.choice, slots);
  if (when === 'anytime') return 'Anytime';
  if (when === 'never') return "Please don't call";
  if (when === 'unanswered') return 'Not answered';
  return groupSlots(slots).map((r) => {
    const day = ON_CALL_GROUPS[r.day]?.short ?? (r.day === 'saturday' && opts.saturday ? opts.saturday : dayName(r.day));
    return isAllDaySlot(r) ? `${day} all day` : `${day} ${fmtCallTime(r.start)} – ${fmtCallTime(r.end)}`;
  }).join(', ');
}

/** The three answers as big radio cards (driver app + sign-up form). */
export function CallWhenPicker({ value, onChange, disabled, name = 'call-when' }: { value: CallWhen | undefined; onChange: (v: CallWhen) => void; disabled?: boolean; name?: string }) {
  return (
    <div className="space-y-2" role="radiogroup" aria-label={CALL_QUESTION} data-call-when={name}>
      {CALL_CHOICES.map((o) => {
        const on = value === o.value;
        return (
          <button key={o.value} type="button" role="radio" aria-checked={on} disabled={disabled} onClick={() => onChange(o.value)}
                  className={`haptic w-full text-left flex items-center gap-3 rounded-[14px] border-[1.5px] px-3.5 py-3 min-h-[56px] transition disabled:opacity-60 ${on ? 'border-forest bg-sage/50' : 'border-line bg-paper'}`}>
            <span className="text-[22px] w-7 text-center shrink-0" aria-hidden>{o.icon}</span>
            <span className="flex-1 min-w-0">
              <span className={`block text-[17px] font-bold ${on ? 'text-forest' : 'text-ink'}`}>{o.label}</span>
              <span className="block text-[14px] text-muted leading-snug">{o.help}</span>
            </span>
            <span className={`grid h-6 w-6 place-items-center rounded-full border-2 shrink-0 ${on ? 'border-forest' : 'border-line'}`}>
              {on && <span className="h-3 w-3 rounded-full bg-forest" />}
            </span>
          </button>
        );
      })}
    </div>
  );
}

const box = 'rounded-[10px] border-[1.4px] border-line-2 bg-paper px-2.5 py-2 text-[14px] outline-none focus:border-forest';
const fmtPhone = (p: string) => { const d = p.replace(/\D/g, '').slice(-10); return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : p; };

/** Edit a driver's on-call hours. `endpoint` = /api/volunteers/:id/on-call (office) or /api/me/on-call (driver). */
// Oct 9 client: `big` = driver Profile (16px inputs so iPhones don't zoom, 44px buttons).
// `onDirty` tells the Profile screen there are unsaved hour edits. Office look is unchanged.
// Oct 14 client: `startRows` = start from these (unsaved) rows — Settings, when the driver
// switches from Anytime / Don't call to "Only at these times". `onSaved` after a save.
export function OnCallHoursEditor({ endpoint, title = 'Happy to be called', who = 'they are', big = false, onDirty, startRows, onSaved }: { endpoint: string; title?: string; who?: string; big?: boolean; onDirty?: (dirty: boolean) => void; startRows?: Slot[]; onSaved?: (slots: Slot[]) => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['on-call', endpoint], queryFn: () => api<{ data: Slot[]; callWhen?: CallAnswer }>(endpoint) });
  const [rows, setRows] = useState<Row[] | null>(null);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirtyState] = useState(false);
  const setDirty = (d: boolean) => { setDirtyState(d); onDirty?.(d); };
  useEffect(() => () => onDirty?.(false), []);
  useEffect(() => {
    if (!q.data || rows !== null) return;
    if (startRows) { setRows(startRows.map((r) => ({ ...r }))); setDirty(true); } else setRows(groupSlots(q.data.data));
  }, [q.data]);
  const save = useMutation({
    mutationFn: () => api<{ data: Slot[]; callWhen?: CallAnswer }>(endpoint, { method: 'PUT', body: JSON.stringify({ slots: expandOnCall(rows ?? []).map(({ view: _v, ...r }) => ({ ...r, note: r.note?.trim() || null })) }) }),
    onSuccess: (r) => {
      setRows(groupSlots(r.data)); setSaved(true); setDirty(false);
      qc.setQueryData(['on-call', endpoint], r); // Oct 14 client: Settings / office summary read the same list
      qc.invalidateQueries({ queryKey: ['on-call-now'] });
      qc.invalidateQueries({ queryKey: ['me-application'] });
      onSaved?.(r.data);
      setTimeout(() => setSaved(false), 2500);
    },
  });
  if (q.isLoading || rows === null) return <div className="text-[13px] text-muted">Loading…</div>;
  const edit = (next: Row[]) => { setRows(next); if (!dirty) setDirty(true); };
  const set = (i: number, patch: Partial<Row>) => edit(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const bx = big ? box.replace('text-[14px]', 'text-[16px] min-h-[44px]') : box;
  const btn = big ? 'min-h-[44px] text-[15px]' : 'text-[13px]';
  // Oct 9: overnight is fine (9 PM – 1 AM); only an empty or zero-length range is wrong.
  const bad = rows.some((r) => !r.start || !r.end || r.start === r.end);
  return (
    <div className="space-y-2">
      {title && <div className="text-[14px] font-extrabold text-ink">{title}</div>}
      {/* Oct 14 client: office driver profile — the driver's answer in one line. */}
      {/* Oct 14 client: no hours + never answered = "not answered" (was "Don't call"). */}
      {!big && q.data && (() => {
        const w = callAnswerOf(q.data.callWhen, q.data.data);
        return (
          <div data-call-summary className="text-[14px] font-bold text-ink">
            Call: <span className={w === 'never' ? 'text-clay' : w === 'unanswered' ? 'text-muted' : 'text-forest'}>
              {w === 'anytime' ? 'anytime' : w === 'never' ? "Don't call" : w === 'unanswered' ? 'not answered' : callSummary(q.data.data)}
            </span>
          </div>
        );
      })()}
      <div className="text-[12.5px] text-muted">The hours {who} OK with a phone call when a pickup needs a driver. Hours can run past midnight (e.g. 9 PM – 1 AM).</div>
      {rows.length === 0 && <div className="text-[13px] text-muted italic">No hours yet.</div>}
      {rows.map((r, i) => {
        const g = ON_CALL_GROUPS[r.day];
        // Oct 14 client: a group (Mon–Thu / every day) is removed as a whole, after asking.
        const remove = () => { if (g && !window.confirm(`Remove ${g.short}?`)) return; edit(rows.filter((_, j) => j !== i)); };
        const removeBtn = (
          <button type="button" onClick={remove}
                  className={`haptic px-2 py-2 font-bold text-clay hover:underline ${big ? 'min-h-[44px] text-[15px]' : 'text-[12.5px]'}`}>Remove</button>
        );
        // Oct 14 client: saved Mon–Thu (or every-day) hours read as one line: "Mon–Thu 9:00 AM – 1:00 PM".
        if (g && r.view) return (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <span className={`font-bold text-ink ${big ? 'text-[16px]' : 'text-[14px]'}`}>{g.short} {isAllDaySlot(r) ? 'all day' : `${fmtCallTime(r.start)} – ${fmtCallTime(r.end)}`}</span>
            {r.note && <span className="text-[13px] text-muted">· {r.note}</span>}
            {/* Oct 14 client: an all-day row (Anytime) opens as 12:00 AM – 11:59 PM (a time box can't show 24:00). */}
            <button type="button" onClick={() => setRows(rows.map((x, j) => (j === i ? { ...x, view: false, end: x.end === '24:00' ? '23:59' : x.end } : x)))}
                    className={`haptic px-2 py-2 font-bold text-forest hover:underline ${big ? 'min-h-[44px] text-[15px]' : 'text-[12.5px]'}`}>Change</button>
            {removeBtn}
          </div>
        );
        return (
        <div key={i} className="flex flex-wrap items-center gap-2">
          <select className={bx} value={r.day} onChange={(e) => set(i, { day: e.target.value })}>
            {Object.entries(ON_CALL_GROUPS).map(([k, x]) => <option key={k} value={k}>{x.label}</option>)}
            {DAYS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <input type="time" className={bx} value={r.start} onChange={(e) => set(i, { start: e.target.value })} />
          <span className="text-[13px] text-muted">to</span>
          <input type="time" className={bx} value={r.end === '24:00' ? '23:59' : r.end} onChange={(e) => set(i, { end: e.target.value })} />
          <input className={bx + ' flex-1 min-w-[140px]'} placeholder="Note (optional)" value={r.note ?? ''} onChange={(e) => set(i, { note: e.target.value })} />
          {removeBtn}
        </div>
        );
      })}
      {bad && <div className="text-[12.5px] text-clay font-bold">Pick a start and an end time (they can't be the same).</div>}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button type="button" onClick={() => edit([...rows, { day: rows[rows.length - 1]?.day ?? 'sunday', start: '09:00', end: '13:00', note: '' }])}
                className={`haptic rounded-[10px] border border-forest/40 px-3 py-2 font-bold text-forest ${btn}`}>+ Add hours</button>
        <button type="button" disabled={bad || save.isPending} onClick={() => save.mutate()}
                className={`haptic rounded-[10px] bg-forest text-paper px-4 py-2 font-bold disabled:opacity-50 ${btn}`}>
          {/* Oct 9 client: clear label so it isn't mixed up with the Profile "Save changes". */}
          {save.isPending ? 'Saving…' : big ? 'Save call hours' : 'Save'}
        </button>
        {saved && <span className="text-[13px] font-bold text-forest">✓ Saved</span>}
        {big && dirty && !save.isPending && <span className="text-[14px] font-bold text-clay">Not saved yet</span>}
        {save.isError && <span className="text-[13px] font-bold text-clay">{(save.error as Error).message}</span>}
      </div>
    </div>
  );
}

/** Live Board: drivers who said they're happy to be called right now. */
export function OnCallNowCard({ onOpenPerson }: { onOpenPerson?: (id: number) => void }) {
  const q = useQuery({
    queryKey: ['on-call-now'],
    queryFn: () => api<{ data: Array<{ volunteerId: string; name: string; unitNumber: number | null; phone: string | null; until: string; note: string | null }> }>('/api/on-call/now'),
    refetchInterval: 60_000,
  });
  const list = q.data?.data ?? [];
  // Oct 11 client: calls logged today → "Called 2:14 PM — No answer" on the row; one Log call form open at a time.
  const calls = useQuery({ queryKey: ['on-call-calls-today'], queryFn: () => api<{ data: CallRow[] }>('/api/on-call/calls/today'), refetchInterval: 60_000 });
  const lastCall = new Map<number, CallRow>();
  for (const c of calls.data?.data ?? []) if (!lastCall.has(c.volunteerId)) lastCall.set(c.volunteerId, c);
  const [logFor, setLogFor] = useState<number | null>(null);
  return (
    <div className="rounded-[14px] border border-line bg-paper px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[14px] font-extrabold text-ink">📞 On call now <span className="text-muted font-bold">({list.length})</span></div>
        <div className="text-[12px] text-muted">Drivers happy to be called at this hour</div>
      </div>
      {q.isLoading ? <div className="text-[13px] text-muted mt-1">Loading…</div>
        : list.length === 0 ? <div className="text-[13px] text-muted mt-1">Nobody has said they're on call right now. Drivers add their hours in the app (Profile), or the office adds them in the driver's profile.</div>
        : (
          <ul className="mt-2 divide-y divide-line">
            {list.map((v) => {
              const vid = Number(v.volunteerId);
              const last = lastCall.get(vid);
              return (
              <li key={v.volunteerId} className="py-2">
                <div className="flex items-center justify-between gap-3">
                  <button type="button" onClick={() => onOpenPerson?.(vid)} className="text-left min-w-0">
                    <div className="text-[14px] font-bold text-ink">{v.name}{v.unitNumber != null ? <span className="text-muted font-normal"> · #{v.unitNumber}</span> : null}</div>
                    <div className="text-[12.5px] text-muted">until {fmtTime(v.until)}{v.note ? ` · ${v.note}` : ''}</div>
                    {last && <div className="text-[12.5px] font-bold text-forest">Called {fmtTimeEastern(last.occurredAt)} — {last.outcome}{last.byName ? ` (${last.byName})` : ''}</div>}
                  </button>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                    {v.phone && (
                      // Oct 11 client: tapping the number also opens Log call, so they remember to log it.
                      <a href={`tel:${v.phone}`} onClick={() => setLogFor(vid)} className="haptic inline-flex items-center gap-1.5 rounded-[10px] border border-forest/40 px-3 py-2 text-[13px] font-bold text-forest">
                        <Phone size={14} /> {fmtPhone(v.phone)}
                      </a>
                    )}
                    <button type="button" onClick={() => setLogFor(logFor === vid ? null : vid)}
                            className="haptic rounded-[10px] border border-line px-3 py-2 text-[13px] font-bold text-ink hover:bg-cream" title="Write down how the call went">📞 I called</button>
                  </div>
                </div>
                {logFor === vid && <CallLogForm key={vid} volunteerId={vid} name={v.name.split(' ')[0] || v.name} onClose={() => setLogFor(null)} />}
              </li>
              );
            })}
          </ul>
        )}
    </div>
  );
}

// ---- Oct 11 client: log the phone calls the office makes to on-call drivers.
// API: POST/GET /api/volunteers/:id/call-log, GET /api/on-call/calls/today
// (stored in the CRM log, so they also show in the driver's Recruiting history).
export type CallRow = { id: number; volunteerId: number; occurredAt: string; byName: string | null; outcome: string; pickup: string | null; note: string | null };
type Outcome = 'will_take' | 'cant' | 'no_answer' | 'voicemail' | 'other';
const OUTCOMES: Array<[Outcome, string]> = [
  ['will_take', 'Will take it'], ['cant', "Can't"], ['no_answer', 'No answer'], ['voicemail', 'Left a message'], ['other', 'Other'],
];
type OpenPk = { id: number; ref_number?: string | null; scheduled_time: string | null; status: string; slots_capacity: number;
                suppliers: string | null; steady_name?: string | null; contact_name: string | null; signups?: unknown[] };

/** Oct 11 client: "Sun, Oct 11 · 2:14 PM — No answer — by Chaya · pickup #1089376 · note" */
export function callLine(c: CallRow, withDay = true) {
  return `${withDay ? `${fmtDay(c.occurredAt)} · ` : ''}${fmtTimeEastern(c.occurredAt)} — ${c.outcome}${c.byName ? ` — by ${c.byName}` : ''}${c.pickup ? ` · pickup ${c.pickup}` : ''}${c.note ? ` · ${c.note}` : ''}`;
}

/** Oct 11 client: small form — what happened on the call, which pickup (optional), a note. */
export function CallLogForm({ volunteerId, name, onClose }: { volunteerId: number; name: string; onClose?: () => void }) {
  const qc = useQueryClient();
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [pickupId, setPickupId] = useState('');
  const [note, setNote] = useState('');
  const [hint, setHint] = useState<{ ref: string | null; label: string; driverName: string | null } | null>(null);
  const [saved, setSaved] = useState(false);
  const today = nyToday();
  // Oct 14 client: was today + status 'scheduled' only, so store posts ('pending'),
  // reposted/late pickups from earlier days and tomorrow's were missing
  // ("none need a driver today" while the board showed one waiting).
  const shiftDay = (ymd: string, n: number) => { const d = new Date(`${ymd}T12:00:00`); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  const from = shiftDay(today, -3), to = shiftDay(today, 1);
  const pk = useQuery({
    queryKey: ['call-log-open-pickups', from, to],
    queryFn: () => api<{ data: OpenPk[] }>(`/api/pickup-instances?from=${from}&to=${to}`),
    staleTime: 60_000,
  });
  // Oct 14 client: say the day when it isn't today (late / reposted / tomorrow).
  const dayWord = (d?: string | null) => { const s = String(d ?? '').slice(0, 10); if (!s || s === today) return '';
    return s === to ? ' · tomorrow' : ` · ${new Date(`${s}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} (late)`; };
  const CLOSED = new Set(['completed', 'delivered', 'picked_up', 'cancelled', 'missed', 'expired', 'pending_confirmation']);
  const open = (pk.data?.data ?? []).filter((p: any) => !CLOSED.has(String(p.status).toLowerCase())
    && !p.is_test && !p.cancelled_at
    && (p.signups?.length ?? 0) < (Number(p.slots_capacity) || 1));
  const save = useMutation({
    mutationFn: () => api<{ data: CallRow; assignHint: { pickupId: number; ref: string | null; label: string; driverName: string | null } | null }>(
      `/api/volunteers/${volunteerId}/call-log`,
      { method: 'POST', body: JSON.stringify({ outcome, pickupId: pickupId ? Number(pickupId) : null, note: note.trim() || null }) }),
    onSuccess: (r) => {
      setSaved(true); setHint(r.assignHint);
      qc.invalidateQueries({ queryKey: ['on-call-calls-today'] });
      qc.invalidateQueries({ queryKey: ['call-log', volunteerId] });
      qc.invalidateQueries({ queryKey: ['crm-history', 'volunteer', volunteerId] });
      if (!r.assignHint) setTimeout(() => onClose?.(), 1500);
    },
  });
  if (saved) {
    return (
      <div className="mt-2 rounded-[12px] border border-forest/30 bg-sage/40 px-3 py-2 text-[13.5px]">
        <b className="text-forest">Logged ✓</b>
        {hint && <div className="mt-1 text-ink">Now assign {hint.driverName ?? name} on the pickup: <b>#{hint.ref ?? ''} {hint.label}</b> (Live Board → open the pickup → assign).</div>}
        {hint && onClose && <button type="button" onClick={onClose} className="haptic mt-1 text-[12.5px] font-bold text-forest hover:underline">Close</button>}
      </div>
    );
  }
  return (
    <div className="mt-2 space-y-2 rounded-[12px] border border-line bg-cream/40 px-3 py-2.5">
      <div className="text-[13px] font-bold text-ink">How did the call to {name} go?</div>
      <div className="flex flex-wrap gap-2">
        {OUTCOMES.map(([k, l]) => (
          <button key={k} type="button" onClick={() => setOutcome(k)}
                  className={`haptic min-h-[40px] rounded-[10px] border px-3 py-2 text-[13.5px] font-bold ${outcome === k ? 'border-forest bg-forest text-paper' : 'border-line bg-paper text-ink hover:bg-cream'}`}>
            {l}
          </button>
        ))}
      </div>
      <select className={box + ' w-full'} value={pickupId} onChange={(e) => setPickupId(e.target.value)}>
        <option value="">{pk.isLoading ? 'Loading pickups…' : open.length ? 'About which pickup? (optional)' : 'About which pickup? (none need a driver right now)'}</option>
        {open.map((p) => (
          <option key={p.id} value={p.id}>
            #{p.ref_number ?? p.id} · {p.suppliers || p.steady_name || p.contact_name || 'Pickup'}{dayWord((p as any).scheduled_date)}{p.scheduled_time ? ` · ${fmtTime(p.scheduled_time)}` : ''}
          </option>
        ))}
      </select>
      <input className={box + ' w-full'} maxLength={500} placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={!outcome || save.isPending} onClick={() => save.mutate()}
                className="haptic rounded-[10px] bg-forest px-4 py-2 text-[13px] font-bold text-paper disabled:opacity-50">
          {save.isPending ? 'Saving…' : 'Save'}
        </button>
        {onClose && <button type="button" onClick={onClose} className="haptic px-2 py-2 text-[13px] font-bold text-muted hover:underline">Cancel</button>}
        {!outcome && <span className="text-[12px] text-muted">Pick what happened first.</span>}
        {save.isError && <span className="text-[13px] font-bold text-clay">{(save.error as Error).message}</span>}
      </div>
    </div>
  );
}

/** Oct 11 client: driver profile → "Recent calls" (last 10) + "Log a call". */
export function RecentCalls({ volunteerId, name }: { volunteerId: number; name: string }) {
  const [adding, setAdding] = useState(false);
  const q = useQuery({ queryKey: ['call-log', volunteerId], queryFn: () => api<{ data: CallRow[] }>(`/api/volunteers/${volunteerId}/call-log?limit=10`) });
  const rows = q.data?.data ?? [];
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <div className="text-[14px] font-extrabold text-ink">Recent calls</div>
        {!adding && <button type="button" onClick={() => setAdding(true)}
                            className="haptic rounded-[10px] border border-forest/40 px-3 py-1.5 text-[12.5px] font-bold text-forest">📞 I called</button>}
      </div>
      {adding && <CallLogForm volunteerId={volunteerId} name={name} onClose={() => setAdding(false)} />}
      {q.isLoading ? <div className="mt-1 text-[13px] text-muted">Loading…</div>
        : rows.length === 0 ? <div className="mt-1 text-[13px] italic text-muted">No calls logged yet.</div>
        : (
          <ul className="mt-1 divide-y divide-line">
            {rows.map((c) => <li key={c.id} className="py-1.5 text-[13px] text-ink">{callLine(c)}</li>)}
          </ul>
        )}
    </div>
  );
}

export { dayName };
