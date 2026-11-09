/**
 * Nov 5 client: "I still feel it's a little too messy, this dispatcher thing — from the office access. I need a
 * clear way: it should show somewhere the upcoming schedules. It should have an option to override the schedule.
 * It should be able to manually put in: dispatch should be from this time to this time [to this person], and then
 * it should be the regular schedule, with a checkbox that it should be on."
 * Nov 5 client: "put by the dispatch tab these things … this just has dispatcher calendars" — now on
 * Dispatch → 📅 Schedule (was Admin → Dispatch setup → Who gets calls).
 * Nov 5 client ("a very simple thing" + "make the calendar a drop more friendly … offer dispatchers on deck first"):
 *   1. Right now + "Put someone on right now" (a dispatcher, on deck first, or a typed number) until a time
 *      (default: until the next shift starts) — saved as an override that starts now; [Stop] ends it.
 *   2. ONE switch "Calendar: Active / Not active" (= the old "Follow the regular schedule").
 *   3. A friendly week calendar: one row per day, a 6 AM – 2 AM bar with the shifts as green blocks (they may
 *      overlap), hand picks blue, "no one scheduled" light orange; tap a block for details / Remove.
 *   "Plan a change for later…" (the from–to override form) is a small link under it.
 * API: GET /api/pbx/forward?week=1 (week for every office login — names + times only; roster with onDeck + phone
 * set-up for admins), POST / DELETE /api/admin/pbx/forward-override, PUT /api/admin/pbx/forward-auto,
 * POST /api/pbx/forward. Read-only (dispatchers' My Dispatch → 📅 Schedule, office non-admins): Right now +
 * I'm dispatching now + the calendar (no numbers, no buttons).
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, isDispatcherLogin } from './api';
import { useDispatchLine } from './dispatch-line';
import { DispatchingNowButton } from './dispatch-forward'; // Nov 5 client: read-only Schedule keeps "I'm dispatching now"
import { DispatcherPicker, niceName, type PickPerson } from './dispatcher-picker'; // Nov 6 client
import { callNumber } from './office-phone'; // Nov 6 Yakov: call a dispatcher who forgot to sign in
import { clipGap, noOneLabel } from './week-gaps'; // Nov 6 Yakov: each day shows only its own part of a gap
import { openOfficeText } from './office-texts';

// Nov 5 client: noCalls = the dispatcher's "Gets dispatch calls" is off
type Slot = { id?: number | null; name: string | null; hasPhone: boolean; steady?: boolean; noCalls?: boolean; startsAt: string; endsAt: string;
  signedInAt?: string | null; first?: string | null; phone?: string | null }; // Nov 6 Yakov: sign-in status; first + phone for office logins only
type Ovr = { id: string; name: string | null; number?: string; from: string; to: string; by: string | null };
type Person = { id: number; name: string; hasPhone: boolean; onDeck?: boolean; noCalls?: boolean; noLogin?: boolean; onShiftNow?: boolean };
type View = {
  state: { number: string | null; name: string | null; source: string | null; manualUntil: string | null; auto: boolean; backup: string | null; lastError: string | null };
  target: { source: string; until: number | null };
  overrides?: Ovr[]; week?: Slot[] | null; roster?: Person[];
  isAdmin: boolean; sandbox: boolean; connected?: boolean;
};

const TZ = 'America/New_York';
const H = 3600e3;
const pretty = (n: string | null | undefined) => (n && n.length === 10 ? `(${n.slice(0, 3)}) ${n.slice(3, 6)}-${n.slice(6)}` : '');
const tm = (iso: string | number) => new Date(iso).toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }).replace(':00', '');
const dayKey = (iso: string | number) => new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ });
const dayName = (iso: string | number) => new Date(iso).toLocaleDateString('en-US', { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric' });
/** "6 PM" today, "Fri 6 PM" another day. */
const when = (iso: string | number | null) => {
  if (iso == null) return '';
  const same = dayKey(iso) === dayKey(Date.now());
  return same ? tm(iso) : `${new Date(iso).toLocaleDateString('en-US', { timeZone: TZ, weekday: 'short' })} ${tm(iso)}`;
};
const wkd = (t: number) => new Date(t).toLocaleDateString('en-US', { timeZone: TZ, weekday: 'short' });
/** times on a day row: the weekday only when it is not that row's day */
const rowSpan = (a: number, b: number, k: string) => `${dayKey(a) === k ? tm(a) : `${wkd(a)} ${tm(a)}`} – ${dayKey(b) === dayKey(a) ? tm(b) : `${wkd(b)} ${tm(b)}`}`;
const span = (a: string | number, b: string | number) => (dayKey(a) === dayKey(b) ? `${tm(a)} – ${tm(b)}` : `${tm(a)} – ${when(b)}`);
const btn = 'px-3 py-1.5 rounded-full text-[13px] font-bold border haptic disabled:opacity-50';
const input = 'rounded-[10px] border border-line bg-paper px-3 py-2 text-[14px] text-ink';
const pad = (n: number) => String(n).padStart(2, '0');
const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const localTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const errText = (e: any, fb: string) => e?.body?.error || e?.message || fb;
/** ms of `hour`:00 New York time on the NY day `key` (YYYY-MM-DD). */
function nyAt(key: string, hour: number) {
  const [y, m, d] = key.split('-').map(Number);
  const guess = Date.UTC(y!, m! - 1, d!, hour);
  const off = (t: number) => Date.parse(new Date(t).toLocaleString('en-US', { timeZone: TZ })) - Date.parse(new Date(t).toLocaleString('en-US', { timeZone: 'UTC' }));
  return guess - off(guess - off(guess));
}
const DAY_START = 6, BAR_HOURS = 20; // the bar: 6 AM – 2 AM

/** Nov 6 Yakov ("he should be able to call him if they forget to sign in, or maybe they can see it on the Schedule"):
 *  a shift that started → "✓ Signed in 9:02 AM" (green) or "Not signed in yet — started 12 min ago" (orange) with
 *  📞 Call / 💬 Text (office logins only — dispatchers see the status only; the number is never shown);
 *  a shift starting within 30 min → "Starts at 2:30 PM". Nothing for other shifts. */
const SOON = 30 * 60e3;
type SignInShift = { name: string | null; first?: string | null; phone?: string | null; from: number; to: number; signedInAt?: string | null };
const shows = (x: SignInShift, now: number) => x.name != null && x.to > now && x.from <= now + SOON;
const agoText = (ms: number) => { const m = Math.max(0, Math.round(ms / 60e3)); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} hr${m % 60 ? ` ${m % 60} min` : ''}`; };
const fullTm = (t: string | number) => new Date(t).toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });
export function ShiftSignIn({ x, showName = false, next = false }: { x: SignInShift; showName?: boolean; next?: boolean }) {
  const now = Date.now();
  const who = showName && <b className="text-ink">{x.name}</b>;
  if (!shows(x, now)) {
    // Nov 6 Yakov: the next shift is always shown (dispatchers + office), even when it starts later
    if (!next || x.name == null || x.from <= now) return null;
    const at = `${dayKey(x.from) === dayKey(now) ? '' : `${wkd(x.from)} `}${fullTm(x.from)}`;
    return <div className="flex flex-wrap items-center gap-x-2 text-[13px]" data-signin="next">{who}<span className="text-muted font-semibold">Next shift · starts {at}</span></div>;
  }
  const canAct = !isDispatcherLogin() && !!x.phone;
  if (x.signedInAt) return <div className="flex flex-wrap items-center gap-x-2 text-[13px]" data-signin="in">{who}<span className="font-bold text-forest">✓ Signed in {fullTm(x.signedInAt)}</span></div>;
  if (x.from > now) return <div className="flex flex-wrap items-center gap-x-2 text-[13px]" data-signin="soon">{who}<span className="text-muted font-semibold">Starts at {fullTm(x.from)}</span></div>;
  const draft = `Hi ${x.first || (x.name ?? '').split(' ')[0]}, your dispatch shift started at ${fullTm(x.from)} — please sign in. Thank you!`;
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]" data-signin="late">
      {who}
      <span className="rounded-full bg-amber-soft border border-amber/60 px-2.5 py-0.5 font-bold text-[#9a5a12]">Not signed in yet — started {agoText(now - x.from)} ago</span>
      {canAct && <>
        <button type="button" onClick={(e) => { e.stopPropagation(); callNumber(x.phone); }} className={`${btn} border-forest/40 text-forest bg-paper py-1`} data-signin-call>📞 Call</button>
        <button type="button" onClick={(e) => { e.stopPropagation(); openOfficeText(x.phone, x.name, draft); }} className={`${btn} border-forest/40 text-forest bg-paper py-1`} data-signin-text>💬 Text</button>
      </>}
    </div>
  );
}
const toSignIn = (w: Slot): SignInShift => ({ name: w.name, first: w.first, phone: w.phone, from: Date.parse(w.startsAt), to: Date.parse(w.endsAt), signedInAt: w.signedInAt });

const KEY = ['pbx-forward', 'week'];

/** Nov 5 client: "offer dispatchers on deck first" — on deck (Roster's On Deck / Available) first, then the rest. */
export function onDeckFirst<T extends { onDeck?: boolean; name?: string }>(list: T[]): T[] {
  return [...list].sort((a, b) => Number(!!b.onDeck) - Number(!!a.onDeck));
}

/** Who: Nov 6 client ("a more neat thing for this") — the friendly dispatcher picker (dispatcher-picker.tsx):
 *  On deck, Other dispatchers, folded "No dispatcher login yet", + "Type a phone number…" (number + name inputs). */
function WhoPicker({ roster, who, setWho, num, setNum, name, setName }: { roster: Person[]; who: string; setWho: (v: string) => void;
  num: string; setNum: (v: string) => void; name: string; setName: (v: string) => void }) {
  const people = useMemo<PickPerson[]>(() => roster.map((r) => ({ id: r.id, name: niceName(r.name), onDeck: r.onDeck, onShiftNow: r.onShiftNow,
    noCalls: r.noCalls, noCell: !r.hasPhone, noLogin: r.noLogin })), [roster]);
  return (
    <div className="space-y-2">
      <DispatcherPicker people={people} value={who === '' ? null : who === 'other' ? 'other' : Number(who)} onChange={(v) => setWho(v == null ? '' : String(v))}
                        forCalls allowNumber testId="override-who" ariaLabel="Who" />
      {who === 'other' && (
        <div className="flex flex-wrap gap-2">
          <input className={`${input} flex-1 min-w-[150px]`} value={num} onChange={(e) => setNum(e.target.value)} placeholder="Phone number" inputMode="tel" aria-label="Phone number" autoFocus />
          <input className={`${input} w-[140px]`} value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (optional)" aria-label="Name" />
        </div>
      )}
    </div>
  );
}
export function WhoGetsCallsPanel({ readOnly = false }: { readOnly?: boolean } = {}) {
  const qc = useQueryClient();
  const dl = useDispatchLine();
  const q = useQuery({ queryKey: KEY, refetchInterval: 60_000, retry: false, queryFn: () => api<{ data: View }>('/api/pbx/forward?week=1') });
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ['pbx-forward'] });
  const say = (text: string, bad = false) => setMsg({ text, bad });
  const send = useMutation({
    mutationFn: (b: Record<string, unknown>) => api<{ data: { now: string; until: string | null } }>('/api/pbx/forward', { method: 'POST', body: JSON.stringify(b) }),
    onSuccess: (_r, b) => { say(b.off ? `Forwarding is off. Calls to ${dl.short} follow the rules set in the Reliable app.` : 'Stopped. Calls follow the calendar again.'); refresh(); },
    onError: (e) => say(errText(e, 'Something went wrong.'), true),
  });
  const auto = useMutation({
    mutationFn: (b: Record<string, unknown>) => api<{ data: { auto: boolean; warning?: string | null } }>('/api/admin/pbx/forward-auto', { method: 'PUT', body: JSON.stringify(b) }),
    onSuccess: (r, b) => {
      if (b.backup !== undefined) say('Saved.');
      else say(r.data.auto ? `Calendar is active. Calls go to whoever is on shift.${r.data.warning ? ` But the phone didn't switch yet: ${r.data.warning}` : ''}` : 'Calendar is not active. Calls stay where they are now.', !!r.data.warning);
      refresh();
    },
    onError: (e) => say(errText(e, 'Something went wrong.'), true),
  });
  const del = useMutation({
    mutationFn: async (ids: string[]) => {
      let warning: string | null = null;
      for (const id of ids) warning = (await api<{ data: { warning: string | null } }>(`/api/admin/pbx/forward-override/${encodeURIComponent(id)}`, { method: 'DELETE' })).data.warning ?? warning;
      return warning;
    },
    onSuccess: (w) => { say(w ? `Removed. But the phone didn't switch yet: ${w}` : 'Removed.', !!w); refresh(); },
    onError: (e) => say(errText(e, "Couldn't remove it."), true),
  });
  const [backup, setBackup] = useState<string | null>(null);
  const [plan, setPlan] = useState<{ from?: number; to?: number } | null>(null);

  const v0 = q.data?.data;
  const v = v0 && (readOnly || isDispatcherLogin()) ? { ...v0, isAdmin: false } : v0;
  if (q.isLoading) return <div className="text-[13px] text-muted">Loading…</div>;
  if (!v) return <div className="text-[13px] text-clay font-bold">Couldn't load who gets dispatch calls. {errText(q.error, '')}</div>;
  const s = v.state;
  const on = !!s.number;
  const overrides = (v.overrides ?? []).map((o) => (o.number && o.number === s.backup ? { ...o, number: undefined } : o));
  const nowOvr = overrides.filter((o) => Date.parse(o.from) <= Date.now() && Date.now() < Date.parse(o.to));
  const byHand = on && (s.source === 'override' || s.source === 'manual');
  const until = byHand && v.target.until && (v.target.source === 'override' || v.target.source === 'manual') ? v.target.until
    : byHand && s.manualUntil ? Date.parse(s.manualUntil) : null;
  const why = s.source === 'shift' ? 'by the calendar'
    : byHand ? `put on by hand${until && until - Date.now() < 13 * 86400e3 ? ` · until ${when(until)}` : ''}`
    : s.source === 'backup' ? 'backup — no one is on shift' : '';
  const offWhy = s.source === 'manual' && s.manualUntil && Date.parse(s.manualUntil) > Date.now() ? ` — turned off until ${when(s.manualUntil)}` : '';
  const stop = () => {
    if (s.source === 'override' && nowOvr.length) del.mutate(nowOvr.map((o) => o.id));
    else send.mutate({ schedule: true });
  };
  const nextShift = (v.week ?? []).find((w) => w.name != null && Date.parse(w.startsAt) > Date.now()) ?? null;
  // Nov 6 client: the picker's "on shift now" tag (the week has names + times only)
  const tNow = Date.now();
  const nowNames = new Set((v.week ?? []).filter((w) => w.name && Date.parse(w.startsAt) <= tNow && tNow < Date.parse(w.endsAt)).map((w) => w.name));
  const roster = (v.roster ?? []).map((r) => (nowNames.has(r.name) ? { ...r, onShiftNow: true } : r));
  const signIns = (v.week ?? []).map(toSignIn).filter((x) => shows(x, tNow)); // Nov 6 Yakov
  // Nov 6 Yakov: + the next shift (not already listed), so its status is always in view for the current AND the next shift
  const nextSI = nextShift && !signIns.some((x) => x.from === Date.parse(nextShift.startsAt) && x.name === nextShift.name) ? toSignIn(nextShift) : null;

  return (
    <section className="space-y-4" data-who-gets-calls>
      <div>
        <h2 className="font-display font-semibold text-[20px] text-ink">📞 Who gets dispatch calls</h2>
        <div className="text-[12.5px] text-muted">Calls to {dl.full}</div>
      </div>

      {/* 1. Right now */}
      <div className={`rounded-[16px] px-5 py-4 ${on ? 'bg-forest text-paper' : 'bg-cream text-ink border border-line'}`} data-right-now>
        <div className={`text-[11px] font-extrabold uppercase tracking-[.14em] ${on ? 'text-paper/70' : 'text-muted'}`}>Right now</div>
        {on ? (
          <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-[22px] leading-tight font-display font-semibold">{s.name || (s.source === 'backup' ? 'The backup cell' : 'A cell')}</span>
            {v.isAdmin && s.source !== 'backup' && s.number !== s.backup && <span className="text-[14px] font-bold text-paper/85">{pretty(s.number)}</span>}
            {why && <span className="text-[14px] font-semibold text-paper/85">— {why}</span>}
            {v.isAdmin && byHand && (
              <button type="button" disabled={send.isPending || del.isPending} onClick={stop} data-stop-hand
                      className={`${btn} ml-1 bg-paper text-forest border-paper`}>Stop</button>
            )}
          </div>
        ) : (
          <div className="mt-1 text-[19px] leading-tight font-display font-semibold">Nobody put on — calls to {dl.short} follow the rules set in the Reliable app{offWhy && <span className="text-[14px] font-sans text-muted">{offWhy}</span>}</div>
        )}
        {s.lastError && <div className="mt-2 rounded-[8px] bg-clay text-paper text-[13px] font-bold px-2.5 py-1.5">The last switch didn't work: {s.lastError}</div>}
        {(signIns.length > 0 || nextSI) && ( /* Nov 6 Yakov: did the dispatcher on shift sign in? + who is next */
          <div className="mt-3 rounded-[12px] bg-paper text-ink px-3 py-2 space-y-1.5" data-signin-now>
            <div className="text-[11px] font-extrabold uppercase tracking-[.12em] text-muted">Dispatcher shifts: now and next</div>
            {signIns.map((x, i) => <ShiftSignIn key={`${x.name}-${x.from}-${i}`} x={x} showName />)}
            {nextSI && <ShiftSignIn x={nextSI} showName next />}
          </div>
        )}
        {v.isAdmin && !on && s.source === 'manual' && (
          <button type="button" disabled={send.isPending} onClick={() => send.mutate({ schedule: true })} className={`${btn} mt-3 border-forest/40 text-forest bg-paper`}>Back to the calendar</button>
        )}
        {v.isAdmin && on && !byHand && (
          <button type="button" disabled={send.isPending}
                  onClick={() => { if (window.confirm(`Turn forwarding off? Until the next shift, no cell rings: dispatch calls (${dl.short}) will follow the rules set in the Reliable app.`)) send.mutate({ off: true }); }}
                  className="mt-2 block text-[12.5px] font-bold text-paper/85 underline">Turn forwarding off</button>
        )}
        {!v.isAdmin && (
          <div className="mt-3">{/* Nov 5 client: read-only Schedule still has "I'm dispatching now" */}
            <DispatchingNowButton className={`${btn} ${on ? 'bg-paper text-forest border-paper' : 'bg-forest text-paper border-forest'}`}
                                  msgClassName={`text-[12.5px] mt-1.5 ${on ? 'text-paper' : 'text-ink'}`} />
          </div>
        )}
      </div>
      {v.isAdmin && <PutOnNow roster={roster} nextShift={nextShift} auto={s.auto} onDone={(t, bad) => { say(t, bad); refresh(); }} />}
      {v.isAdmin && v.connected === false && (
        <div className="rounded-[12px] border border-amber/60 bg-amber-soft px-3 py-2 text-[13px] text-ink">
          ⚠️ The office phone system isn't set up for forwarding here (Admin → Dispatch settings → Phone system), so calls can't be moved yet.
        </div>
      )}
      {v.sandbox && <div className="text-[12px] text-muted">Test site: nothing is changed on the real phone system.</div>}

      {/* 2. Calendar: Active / Not active (= "Follow the regular schedule") */}
      <div className="rounded-[14px] border border-line bg-paper px-4 py-3 space-y-2" data-calendar-switch>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[15px] font-bold text-ink">Calendar</span>
          {v.isAdmin ? (
            <div className="inline-flex rounded-full border border-line bg-cream p-0.5" role="radiogroup" aria-label="Calendar">
              {([true, false] as const).map((a) => (
                <button key={String(a)} type="button" role="radio" aria-checked={s.auto === a} disabled={auto.isPending}
                        onClick={() => { if (s.auto !== a) auto.mutate({ auto: a }); }} data-testid={a ? 'calendar-active' : 'calendar-off'}
                        className={`haptic rounded-full px-3.5 py-1 text-[13px] font-bold ${s.auto === a ? (a ? 'bg-forest text-paper' : 'bg-ink text-paper') : 'text-muted'}`}>
                  {a ? 'Active' : 'Not active'}
                </button>
              ))}
            </div>
          ) : (
            <span className={`rounded-full px-3 py-0.5 text-[13px] font-bold ${s.auto ? 'bg-sage text-forest' : 'bg-cream text-muted'}`}>{s.auto ? 'Active' : 'Not active'}</span>
          )}
          <span className="text-[13px] text-muted">{s.auto ? 'Calls follow the calendar.' : 'The calendar is ignored.'}</span>
        </div>
        {v.isAdmin && (
          /* the backup cell is never shown — only that one is saved */
          <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
            <span className="text-muted">No one on shift: calls go to {s.backup ? <b className="text-ink">the backup cell</b> : <b className="text-ink">nobody</b>}.</span>
            {backup === null ? (
              <>
                <button type="button" onClick={() => setBackup('')} className="font-bold text-forest underline">{s.backup ? 'Change' : 'Add a backup cell'}</button>
                {s.backup && <button type="button" disabled={auto.isPending} onClick={() => { if (window.confirm('Remove the backup cell? When no one is on shift, only the dispatch line will ring.')) auto.mutate({ backup: '' }); }} className="font-bold text-clay underline">Remove</button>}
              </>
            ) : (
              <>
                <input className={`${input} w-[150px] py-1.5`} value={backup} onChange={(e) => setBackup(e.target.value)} placeholder="cell number" inputMode="tel" autoFocus />
                <button type="button" disabled={auto.isPending || !backup.trim()} onClick={() => { auto.mutate({ backup }); setBackup(null); }} className={`${btn} border-forest/40 text-forest bg-paper`}>Save</button>
                <button type="button" onClick={() => setBackup(null)} className="text-muted underline">Cancel</button>
              </>
            )}
          </div>
        )}
      </div>

      {msg && <div className={`text-[13px] font-bold ${msg.bad ? 'text-clay' : 'text-forest'}`} role="status">{msg.text}</div>}

      {/* 3. The week */}
      <WeekCalendar week={v.week ?? null} overrides={overrides} auto={s.auto} admin={v.isAdmin}
                    onRemove={v.isAdmin ? (o) => { if (window.confirm(`Remove this? ${o.name ?? pretty(o.number)}, ${dayName(o.from)} ${span(o.from, o.to)}`)) del.mutate([o.id]); } : undefined}
                    onPlan={v.isAdmin ? (from, to) => setPlan({ from, to }) : undefined} />

      {v.isAdmin && (plan ? (
        <OverrideForm key={`${plan.from ?? ''}-${plan.to ?? ''}`} roster={roster} from={plan.from} to={plan.to} onClose={() => setPlan(null)}
                      onDone={(t, bad) => { setPlan(null); say(t, bad); refresh(); }} />
      ) : (
        <button type="button" onClick={() => setPlan({})} className="text-[13px] font-bold text-forest underline" data-testid="add-override">Plan a change for later…</button>
      ))}
    </section>
  );
}

/** Nov 5 client: "Put someone on right now" — a dispatcher (on deck first) or a typed number, until a time. */
function PutOnNow({ roster, nextShift, auto, onDone }: { roster: Person[]; nextShift: Slot | null; auto: boolean; onDone: (text: string, bad?: boolean) => void }) {
  const list = useMemo(() => onDeckFirst(roster), [roster]);
  const dl = useDispatchLine();
  const [who, setWho] = useState('');
  const [num, setNum] = useState('');
  const [name, setName] = useState('');
  const canNext = !!nextShift && auto;
  const [until, setUntil] = useState<string>(canNext ? 'next' : 'stop');
  const [err, setErr] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (b: Record<string, unknown>) => api<{ data: { override: Ovr; switched: boolean; warning: string | null } }>('/api/admin/pbx/forward-override', { method: 'POST', body: JSON.stringify(b) }),
    onSuccess: (r) => {
      const o = r.data.override;
      setWho(''); setNum(''); setName('');
      onDone(`Done. Calls go to ${o.name ?? pretty(o.number)} now.${r.data.warning ? ` But the phone didn't switch yet: ${r.data.warning}` : ''}`, !!r.data.warning);
    },
    onError: (e) => setErr(errText(e, "Couldn't do it.")),
  });
  const submit = () => {
    setErr(null);
    if (!who) return setErr('Pick who gets the calls.');
    if (who === 'other' && num.replace(/\D/g, '').length < 10) return setErr('Type a 10-digit phone number.');
    const now = Date.now();
    const to = until === 'next' && nextShift ? Date.parse(nextShift.startsAt) : until === 'stop' ? now + 14 * 86400e3 - 10 * 60e3 : now + Number(until) * H;
    save.mutate({ ...(who === 'other' ? { number: num, name } : { volunteerId: Number(who) }), from: new Date(now).toISOString(), to: new Date(to).toISOString() });
  };
  return (
    <div className="rounded-[14px] border-2 border-forest/30 bg-paper px-4 py-3 space-y-2.5" data-put-on-now>
      <div className="font-display font-semibold text-[16px] text-ink">Put someone on right now</div>
      {/* Nov 6 client: say plainly how this and the Reliable phone app work together */}
      <div className="rounded-[10px] bg-cream border border-line px-3 py-2 text-[12.5px] text-ink" data-reliable-note>
        ℹ️ Putting someone on here overrides what is set for {dl.short} in the Reliable phone app.
        When nobody is put on (forwarding off), calls follow the rules set in the Reliable app.
      </div>
      <WhoPicker roster={list} who={who} setWho={setWho} num={num} setNum={setNum} name={name} setName={setName} />
      <div className="flex flex-wrap items-center gap-2">
        <select className={`${input} flex-1 min-w-[180px]`} value={until} onChange={(e) => setUntil(e.target.value)} aria-label="Until">
          {canNext && <option value="next">Until the next shift ({when(nextShift!.startsAt)})</option>}
          <option value="1">For 1 hour</option>
          <option value="2">For 2 hours</option>
          <option value="4">For 4 hours</option>
          <option value="stop">Until I stop it</option>
        </select>
        <button type="button" disabled={save.isPending} onClick={submit} className={`${btn} bg-forest text-paper border-forest text-[14px] px-4 py-2`} data-put-on>{save.isPending ? 'Saving…' : 'Put on now'}</button>
      </div>
      {err && <div className="text-[13px] font-bold text-clay">{err}</div>}
    </div>
  );
}

type Item = { key: string; kind: 'shift' | 'gap' | 'ovr'; from: number; to: number; name: string | null; hasPhone?: boolean; steady?: boolean; noCalls?: boolean; o?: Ovr; lane?: number; bf?: number; bt?: number;
  signedInAt?: string | null; first?: string | null; phone?: string | null }; // Nov 6 Yakov
/** Nov 5 client: "make the calendar a drop more friendly" — one row per day (today first), a 6 AM – 2 AM bar:
 *  shifts green (overlaps stack), hand picks blue, no one scheduled light orange. Tap a block for details. */
function WeekCalendar({ week, overrides, auto, admin, onRemove, onPlan }: { week: Slot[] | null; overrides: Ovr[]; auto: boolean; admin: boolean;
  onRemove?: (o: Ovr) => void; onPlan?: (from: number, to: number) => void }) {
  const [sel, setSel] = useState<string | null>(null);
  const days = useMemo(() => {
    const now = Date.now();
    const all: Item[] = [
      ...(week ?? []).map((w, i): Item => ({ key: `${w.name == null ? 'g' : 's'}${w.id ?? i}-${w.startsAt}`, kind: w.name == null ? 'gap' : 'shift', from: Date.parse(w.startsAt), to: Date.parse(w.endsAt), name: w.name, hasPhone: w.hasPhone, steady: w.steady, noCalls: w.noCalls,
        signedInAt: w.signedInAt, first: w.first, phone: w.phone })),
      ...overrides.map((o): Item => ({ key: `o${o.id}`, kind: 'ovr', from: Date.parse(o.from), to: Date.parse(o.to), name: o.name, o })),
    ];
    const out: Array<{ key: string; label: string; today: boolean; start: number; end: number; items: Item[]; lanes: number; noOne: string | null }> = [];
    for (let i = 0; i < 7; i++) {
      const k = dayKey(now + i * 86400e3);
      const start = nyAt(k, DAY_START);
      const barEnd = start + BAR_HOURS * H, dayEnd = start + 24 * H;
      const lo = i === 0 ? Math.min(start, now) : start;
      // shifts / hand picks keep their real times (chips + details); bf / bt = the part on this day's bar.
      // Nov 6 Yakov: a gap is cut to this day's row (6 AM – 2 AM): one long gap no longer prints "Sat 9:30 PM – Fri 1:16 AM" on every day.
      const items = all
        .flatMap((x): Item[] => {
          if (x.kind === 'gap') { const c = clipGap(x, start, barEnd); return c ? [{ ...x, from: c.from, to: c.to }] : []; }
          return x.from < dayEnd && x.to > lo ? [x] : [];
        })
        .map((x) => ({ ...x, bf: Math.max(x.from, start), bt: Math.min(x.to, barEnd) }))
        .sort((a, b) => a.from - b.from || (a.kind === 'ovr' ? -1 : 1));
      const noOne = noOneLabel(items.filter((x) => x.kind === 'gap'), items.some((x) => x.kind !== 'gap' && x.from < barEnd && x.to > start), start, barEnd, now);
      // stack overlapping shifts / hand picks in lanes
      const laneEnds: number[] = [];
      for (const x of items) {
        if (x.kind === 'gap') continue;
        let l = laneEnds.findIndex((e) => e <= x.from);
        if (l < 0) { l = laneEnds.length; laneEnds.push(0); }
        laneEnds[l] = x.to; x.lane = l;
      }
      out.push({ key: k, label: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : new Date(start).toLocaleDateString('en-US', { timeZone: TZ, weekday: 'long' }),
                 today: i === 0, start, end: barEnd, items, lanes: Math.max(1, laneEnds.length), noOne });
    }
    return out;
  }, [week, overrides]);
  const pct = (t: number, d: { start: number }) => Math.max(0, Math.min(100, ((t - d.start) / (BAR_HOURS * H)) * 100));
  const LANE = 24;
  const tone = (x: Item) => (x.kind === 'gap' ? 'bg-amber-soft border-amber/60 text-[#9a5a12]' : x.kind === 'ovr' ? 'bg-sky-soft border-sky/50 text-sky' : 'bg-sage border-sage-line text-forest');
  const barTone = (x: Item) => (x.kind === 'ovr' ? 'bg-[#A7CBE2] border-[#5C93B8] text-ink' : 'bg-[#A9D3A5] border-[#5E9A5A] text-ink');
  const label = (x: Item) => (x.kind === 'gap' ? 'No one' : x.name ?? 'Cell');
  // Nov 6 Yakov: today's started shifts show ✓ (signed in) / ⚠ (not yet) on the bar
  const barLabel = (x: Item) => (x.kind === 'shift' && x.from <= Date.now() && x.to > Date.now() ? `${x.signedInAt ? '✓' : '⚠'} ${label(x)}` : label(x));
  const coveredByOvr = (x: Item) => x.kind === 'shift' && overrides.some((o) => Date.parse(o.from) < x.to && x.from < Date.parse(o.to));
  return (
    <div className="rounded-[14px] border border-line bg-paper overflow-hidden" data-coming-up data-week-calendar>
      <div className="px-4 py-3 border-b border-line flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="font-display font-semibold text-[16px] text-ink">📅 This week</h3>
        <span className="text-[12px] text-muted flex flex-wrap gap-x-2.5">
          <span><span className="inline-block w-2.5 h-2.5 rounded-sm bg-sage border border-sage-line align-middle" /> on shift</span>
          <span><span className="inline-block w-2.5 h-2.5 rounded-sm bg-sky-soft border border-sky/50 align-middle" /> put on by hand</span>
          <span><span className="inline-block w-2.5 h-2.5 rounded-sm bg-amber-soft border border-amber/60 align-middle" /> no one scheduled</span>
        </span>
      </div>
      {!auto && <div className="px-4 py-2 text-[12.5px] bg-cream text-ink border-b border-line">Calendar is not active: shifts don't move the calls now. Hand picks still do.</div>}
      {week == null && <div className="px-4 py-2 text-[12.5px] text-clay font-bold">Couldn't load the schedule.</div>}
      <div className="divide-y divide-line">
        {days.map((d) => {
          const picked = d.items.find((x) => `${d.key}:${x.key}` === sel) ?? null;
          return (
            <div key={d.key} className={`px-3 sm:px-4 py-2.5 ${d.today ? 'bg-sage/25 border-l-4 border-forest' : ''}`} data-day={d.key} data-today={d.today || undefined}>
              <div className="flex items-baseline gap-2 mb-1.5">
                <span className={`text-[14px] font-bold ${d.today ? 'text-forest' : 'text-ink'}`}>{d.label}</span>
                <span className="text-[12px] text-muted">{dayName(d.start)}</span>
              </div>
              {/* the bar: 6 AM – 2 AM */}
              <div className="relative rounded-[8px] bg-cream/70 border border-line overflow-hidden" style={{ height: d.lanes * LANE + 4 }}>
                {d.items.filter((x) => x.kind === 'gap').map((x) => (
                  <button key={x.key} type="button" onClick={() => setSel(sel === `${d.key}:${x.key}` ? null : `${d.key}:${x.key}`)} title={`No one scheduled ${span(x.from, x.to)}`}
                          className="absolute top-0 bottom-0 bg-amber-soft/90 border-x border-amber/40" style={{ left: `${pct(x.bf!, d)}%`, width: `${pct(x.bt!, d) - pct(x.bf!, d)}%` }} />
                ))}
                {d.items.filter((x) => x.kind !== 'gap' && x.bf! < x.bt!).map((x) => (
                  <button key={x.key} type="button" onClick={() => setSel(sel === `${d.key}:${x.key}` ? null : `${d.key}:${x.key}`)} title={`${label(x)} ${span(x.from, x.to)}`}
                          className={`absolute rounded-[6px] border px-1.5 text-left text-[11.5px] font-bold truncate haptic ${barTone(x)} ${coveredByOvr(x) ? 'opacity-60' : ''} ${sel === `${d.key}:${x.key}` ? 'ring-2 ring-ink' : ''}`}
                          style={{ left: `${pct(x.bf!, d)}%`, width: `max(${pct(x.bt!, d) - pct(x.bf!, d)}%, 6px)`, top: 2 + (x.lane ?? 0) * LANE, height: LANE - 3 }}>
                    {barLabel(x)}
                  </button>
                ))}
                {d.today && Date.now() > d.start && Date.now() < d.end && <div className="absolute top-0 bottom-0 w-[2px] bg-clay" style={{ left: `${pct(Date.now(), d)}%` }} title="Now" />}
              </div>
              <div className="flex justify-between text-[10px] text-muted mt-0.5 px-0.5 select-none" aria-hidden>
                <span>6a</span><span>10a</span><span>2p</span><span>6p</span><span>10p</span><span>2a</span>
              </div>
              {/* the same, as short lines (easy to read on a phone) */}
              <div className="mt-1 flex flex-wrap gap-1.5">
                {d.items.length === 0 && <span className="text-[12.5px] text-muted">Nothing planned</span>}
                {d.noOne && ( /* Nov 6 Yakov: a day with nobody on it = one short line */
                  <button type="button" onClick={() => { const g = d.items.find((x) => x.kind === 'gap')!; setSel(sel === `${d.key}:${g.key}` ? null : `${d.key}:${g.key}`); }}
                          className={`rounded-full border px-2.5 py-0.5 text-[12.5px] haptic ${tone(d.items.find((x) => x.kind === 'gap')!)}`} data-chip="gap" data-all-day>
                    <b>{d.noOne}</b>
                  </button>
                )}
                {d.items.filter((x) => !(d.noOne && x.kind === 'gap')).map((x) => (
                  <button key={x.key} type="button" onClick={() => setSel(sel === `${d.key}:${x.key}` ? null : `${d.key}:${x.key}`)}
                          className={`rounded-full border px-2.5 py-0.5 text-[12.5px] haptic ${tone(x)} ${sel === `${d.key}:${x.key}` ? 'ring-2 ring-ink' : ''}`} data-chip={x.kind}>
                    <span className="tabular-nums text-ink">{rowSpan(x.from, x.to, d.key)}</span> <b>{label(x)}</b>{x.noCalls && <span className="text-clay font-bold"> · no calls</span>}
                  </button>
                ))}
              </div>
              {d.today && d.items.some((x) => x.kind === 'shift' && shows(x, Date.now())) && ( /* Nov 6 Yakov: signed in or not */
                <div className="mt-1.5 space-y-1" data-signin-today>
                  {d.items.filter((x) => x.kind === 'shift' && shows(x, Date.now())).map((x) => <ShiftSignIn key={x.key} x={x} showName />)}
                </div>
              )}
              {picked && (
                <div className="mt-2 rounded-[10px] border border-line bg-paper px-3 py-2 text-[13px] text-ink space-y-1.5" data-detail>
                  {picked.kind === 'gap' ? (<>
                    <div><b className="text-[#9a5a12]">No one scheduled</b> · {dayName(picked.from)}, {span(picked.from, picked.to)}</div>
                    <div className="text-muted text-[12.5px]">{auto ? 'Calls go to the backup cell, or only the dispatch line rings.' : 'The calendar is not active.'}</div>
                    {onPlan && <button type="button" onClick={() => onPlan(picked.from, picked.to)} className={`${btn} border-forest/40 text-forest bg-paper`}>Put someone on for this time</button>}
                  </>) : picked.kind === 'ovr' ? (<>
                    <div><b className="text-sky">Put on by hand:</b> <b>{picked.name ?? 'Cell'}</b> {admin && picked.o?.number && <span className="text-muted">{pretty(picked.o.number)}</span>}</div>
                    <div>{dayName(picked.o!.from)}, {span(picked.o!.from, picked.o!.to)}{picked.o!.by && <span className="text-muted"> · by {picked.o!.by}</span>}</div>
                    {onRemove && <button type="button" onClick={() => onRemove(picked.o!)} className={`${btn} border-clay/40 text-clay bg-paper`}>Remove</button>}
                  </>) : (<>
                    <div><b>{picked.name}</b> · on shift {dayName(picked.from)}, {span(picked.from, picked.to)}{picked.steady && <span className="text-muted"> · every week</span>}</div>
                    {picked.noCalls && <div className="text-clay font-bold text-[12.5px]">Gets dispatch calls is off for him, so calls go to the next one on shift or the backup.</div>}
                    {coveredByOvr(picked) && <div className="text-muted text-[12.5px]">Someone is put on by hand at this time, so the calls go to him instead.</div>}
                    {admin && !picked.hasPhone && <div className="text-clay font-bold text-[12.5px]">No cell on file — calls can't go to him. Add it on the Roster.</div>}
                    {admin && <div className="text-muted text-[12.5px]">To change shifts: Dispatcher shifts, below.</div>}
                  </>)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** "Plan a change for later…": from – to, then back to the calendar. */
function OverrideForm({ roster, from: from0, to: to0, onDone, onClose }: { roster: Person[]; from?: number; to?: number; onDone: (text: string, bad?: boolean) => void; onClose: () => void }) {
  const list = useMemo(() => onDeckFirst(roster), [roster]);
  const start = () => { if (from0) return new Date(Math.max(from0, Date.now())); const d = new Date(); d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0); return d; };
  const end = () => (to0 ? new Date(to0) : new Date(start().getTime() + 4 * H));
  const [who, setWho] = useState('');
  const [num, setNum] = useState('');
  const [name, setName] = useState('');
  const [fd, setFd] = useState(() => localDate(start()));
  const [ft, setFt] = useState(() => localTime(start()));
  const [td, setTd] = useState(() => localDate(end()));
  const [tt, setTt] = useState(() => localTime(end()));
  const [err, setErr] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (b: Record<string, unknown>) => api<{ data: { override: Ovr; switched: boolean; warning: string | null } }>('/api/admin/pbx/forward-override', { method: 'POST', body: JSON.stringify(b) }),
    onSuccess: (r) => {
      const o = r.data.override;
      onDone(`Saved. ${dayName(o.from)} ${span(o.from, o.to)}: calls go to ${o.name ?? pretty(o.number)}, then back to the calendar.${r.data.warning ? ` But the phone didn't switch yet: ${r.data.warning}` : ''}`, !!r.data.warning);
    },
    onError: (e) => setErr(errText(e, "Couldn't save.")),
  });
  const submit = () => {
    setErr(null);
    const from = new Date(`${fd}T${ft}`), to = new Date(`${td}T${tt}`);
    if (!who) return setErr('Pick who gets the calls.');
    if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime())) return setErr('Pick the From and To day and time.');
    if (to <= from) return setErr('The To time must be after the From time.');
    save.mutate({ ...(who === 'other' ? { number: num, name } : { volunteerId: Number(who) }), from: from.toISOString(), to: to.toISOString() });
  };
  return (
    <div className="rounded-[14px] border-2 border-sky/50 bg-sky-soft/50 px-4 py-3 space-y-3" data-override-form>
      <div className="font-display font-semibold text-[16px] text-ink">Plan a change for later</div>
      <WhoPicker roster={list} who={who} setWho={setWho} num={num} setNum={setNum} name={name} setName={setName} />
      <div className="grid sm:grid-cols-2 gap-3">
        <div><span className="text-[12px] font-bold text-muted">From</span>
          <div className="flex gap-2"><input type="date" className={input} value={fd} onChange={(e) => { setFd(e.target.value); if (td < e.target.value) setTd(e.target.value); }} aria-label="From day" />
            <input type="time" className={input} value={ft} onChange={(e) => setFt(e.target.value)} aria-label="From time" /></div></div>
        <div><span className="text-[12px] font-bold text-muted">To</span>
          <div className="flex gap-2"><input type="date" className={input} value={td} onChange={(e) => setTd(e.target.value)} aria-label="To day" />
            <input type="time" className={input} value={tt} onChange={(e) => setTt(e.target.value)} aria-label="To time" /></div></div>
      </div>
      {err && <div className="text-[13px] font-bold text-clay">{err}</div>}
      <div className="flex gap-2">
        <button type="button" disabled={save.isPending} onClick={submit} className={`${btn} bg-forest text-paper border-forest`}>{save.isPending ? 'Saving…' : 'Save'}</button>
        <button type="button" onClick={onClose} className={`${btn} border-line text-ink bg-paper`}>Cancel</button>
      </div>
    </div>
  );
}
