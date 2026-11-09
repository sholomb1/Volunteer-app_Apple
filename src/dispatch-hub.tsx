/**
 * Nov 2 client: "one tab — Dispatchers — all the settings and reports and activity in one place".
 * Admin → Dispatchers: Now (who's dispatching, where calls go, today's calls), Calls (every call in / out),
 * Phone settings (the Reliable connection, forwarding options) + the old Roster / Shifts / Logins tabs.
 * API: GET /api/pbx/calls, /api/pbx/forward (routes/pbx.ts).
 */
import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, search, type SearchResults } from './api';
import { DispatchingNowButton, useForward, ForwardOffButton } from './dispatch-forward'; // Nov 5 client: the top strip
import { useDispatchLine } from './dispatch-line';
import { callNumber } from './office-phone';
import { HandoverNote } from './handover-note'; // Nov 5 client: end-of-shift handover note
import { NextDispatcherBanner } from './next-dispatcher'; // Nov 6 client: the next dispatcher hasn't signed in
import { OfficeTextsPanel, openOfficeText } from './office-texts';
import { isDispatcherLogin } from './api'; // Nov 4: isDispatcherLogin = also the admins' Dispatcher view (no recordings)
import { TodoPanel, CallerPickupLine, type CallerPickups } from './dispatch-todo'; // Nov 3 client: one dispatcher inbox + caller's pickup
import { CallNoteBar } from './call-note'; // Nov 3 client: one-tap call notes
import { onlyThisAudio } from './one-audio'; // Nov 5 client: one recording at a time

type Call = { id: number; at: string; dir: 'in' | 'out'; status: string; who: string; phone: string | null; matchType: string | null; matchId: number | null;
  ext: string | null; answeredExt: string | null; seconds: number | null; recording: string | null; by: string | null; onShift: string | null;
  answeredBy?: string | null; calledBackAt?: string | null; // Nov 2 client: from Reliable's call history
  note?: { outcome: string; note: string | null; by: string | null } | null; // Nov 3 client: one-tap call note
  pickups?: CallerPickups | null }; // Nov 3 client: the caller's pickup today
type CallsData = { rows: Call[]; lastHitAt: string | null; lastHitOk: boolean | null; lastRefusedReason: string | null };

const t12 = (iso: string) => new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const dayOf = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const todayNY = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const STATUS: Record<string, [string, string]> = {
  answered: ['✓ Answered', 'text-forest'], missed: ['✗ Missed', 'text-clay'], voicemail: ['🎙 Voicemail', 'text-clay'], ringing: ['… Rang', 'text-muted'],
  placed: ['📞 Called out', 'text-forest'], failed: ['⚠️ Call didn’t go through', 'text-clay'],
  noanswer: ['No answer', 'text-muted'], busy: ['Busy', 'text-muted'],
};
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
// Nov 2 client: an hour or more reads "2h 13m".
const total = (s: number) => (s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.round((s % 3600) / 60)}m` : mmss(s));
const fire = (name: string, detail: Record<string, unknown>) => window.dispatchEvent(new CustomEvent(name, { detail, cancelable: true }));

function useCalls(days: number) {
  return useQuery({ queryKey: ['pbx-calls', days], refetchInterval: 30_000, queryFn: () => api<{ data: CallsData }>(`/api/pbx/calls?days=${days}`) });
}

function CallRow({ c }: { c: Call }) {
  const [label, cls] = STATUS[c.status] ?? [c.status, 'text-muted'];
  const [rec, setRec] = useState<string | null>(null);
  const [recErr, setRecErr] = useState<string | null>(null);
  const open = () => { if (c.matchType === 'volunteer' && c.matchId) fire('zlz:open-volunteer', { id: c.matchId, tab: 'overview' }); else if (c.matchType === 'supplier' && c.matchId) fire('zlz:open-store', { id: c.matchId }); };
  const listen = async () => {
    if (!c.recording) return;
    if (!c.recording.startsWith('uid:')) { window.open(c.recording, '_blank'); return; }
    try { const r = await api<{ data: { url: string } }>(`/api/pbx/recording/${encodeURIComponent(c.recording.slice(4))}`); setRec(r.data.url); }
    catch (e: any) { setRecErr(e?.body?.error || 'No recording.'); }
  };
  const missedIn = c.dir === 'in' && (c.status === 'missed' || c.status === 'voicemail');
  // Nov 3 client: one-tap call notes — open on today's outgoing calls with no note yet; a 📝 button on the others.
  const [noting, setNoting] = useState(false);
  const fresh = c.dir === 'out' && Date.now() - Date.parse(c.at) < 3 * 3600e3;
  return (
    <div className="py-2.5 border-b border-line/70 text-[13px]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="w-[150px] text-muted">{t12(c.at)}</span>
        <span className="w-[22px]" title={c.dir === 'in' ? 'Incoming' : 'Outgoing'}>{c.dir === 'in' ? '⬅️' : '➡️'}</span>
        <button type="button" onClick={open} className={`font-bold text-ink text-left ${c.matchId ? 'hover:underline' : ''}`}>{c.who}</button>
        <span className={`font-bold ${cls}`}>{label}</span>
        {c.seconds != null && c.status === 'answered' && <span className="rounded-full bg-sage px-2 py-0.5 text-[12px] font-bold text-forest">⏱ {mmss(c.seconds)}</span>}
        {c.answeredBy && <span className="text-muted">by {c.answeredBy}</span>}
        {c.dir === 'out' && c.by && <span className="text-muted">pressed by {c.by}</span>}
        {missedIn && (c.calledBackAt ? <span className="text-forest font-bold">✓ called back {t12(c.calledBackAt)}</span> : <span className="text-clay font-bold">not called back</span>)}
        {c.dir === 'in' && c.onShift && <span className="text-muted">on shift: {c.onShift}</span>}
        <span className="ml-auto flex gap-2">
          {c.recording && !rec && !isDispatcherLogin() && <button type="button" onClick={() => void listen()} className="text-[12px] font-bold text-forest underline">▶ Listen</button>}
          {missedIn && c.phone && <button type="button" onClick={() => callNumber(c.phone)} className="text-[12px] font-bold text-forest underline">📞 Call back</button>}
          {c.phone && <button type="button" onClick={() => openOfficeText(c.phone)} className="text-[12px] font-bold text-forest underline">💬 Text</button>}
          {c.phone && !c.note && !fresh && <button type="button" onClick={() => setNoting((v) => !v)} className="text-[12px] font-bold text-muted underline">📝 Note</button>}
        </span>
      </div>
      {c.pickups && <div className="mt-1 ml-[175px] max-sm:ml-0"><CallerPickupLine p={c.pickups} /></div>}{/* Nov 3 client: who's calling + their pickup */}
      {c.note && <div className="text-[12.5px] mt-1 ml-[175px] max-sm:ml-0" data-call-note-shown><span className="font-bold text-forest">📝 {c.note.outcome}</span>
        {c.note.note && <span className="text-ink"> — {c.note.note}</span>}{c.note.by && <span className="text-muted"> · {c.note.by}</span>}</div>}
      {c.phone && !c.note && (fresh || noting) && <div className="mt-1.5 ml-[175px] max-sm:ml-0"><CallNoteBar phone={c.phone} scId={c.id} /></div>}
      {rec && <audio onPlay={onlyThisAudio} src={rec} controls autoPlay className="mt-2 w-full max-w-[420px]" />}
      {recErr && <div className="text-[12px] text-muted mt-1">{recErr}</div>}
    </div>
  );
}

function Health({ d }: { d: CallsData }) {
  if (!d.lastHitAt) return <div className="text-[12px] text-clay font-bold">The phone system hasn't reported any call to the app yet.</div>;
  return d.lastHitOk === false
    ? <div className="text-[12px] text-clay font-bold">Last call report from the phone system was refused ({d.lastRefusedReason || 'security check'}) at {t12(d.lastHitAt)}.</div>
    : <div className="text-[12px] text-muted">Calls from the phone system's history, checked {t12(d.lastHitAt)} ✓ (every 30 seconds)</div>;
}

/** Nov 2 client: "📞 Call someone" — type any number; it rings my phone first, then dials. */
function CallSomeone() {
  // Nov 6 Yakov: "should be able to type a unit number — and the name should come up". Type a unit number,
  // a name or a phone number; pick the person (drivers and stores) and press Call.
  const [n, setN] = useState('');
  const [picked, setPicked] = useState<{ label: string; phone: string } | null>(null);
  const digits = (picked?.phone ?? n).replace(/\D/g, '');
  const term = n.trim();
  const isPhone = term.replace(/\D/g, '').length >= 7;
  const q = useQuery({
    queryKey: ['call-someone-search', term], enabled: !picked && !isPhone && (term.length >= 2 || /^#?\d{1,4}$/.test(term)),
    staleTime: 30_000, queryFn: () => search.all(term).then((r) => r.data as SearchResults),
  });
  const people = [
    ...(q.data?.volunteers ?? []).filter((v) => v.phone).map((v) => ({
      key: `v${v.id}`, phone: String(v.phone),
      label: `${String(v.firstName ?? '').trim()} ${String(v.lastName ?? '').trim().slice(0, 1).toUpperCase()}.${v.unitNumber != null ? ` #${v.unitNumber}` : ''}`,
      sub: 'Driver',
    })),
  ].slice(0, 6);
  const go = () => { if (digits.length >= 10) { callNumber(digits); setN(''); setPicked(null); } };
  return (
    <div className="space-y-1.5">
      <form onSubmit={(e) => { e.preventDefault(); go(); }} className="flex flex-wrap items-center gap-2">
        <input value={picked ? picked.label : n} onChange={(e) => { setPicked(null); setN(e.target.value); }}
               placeholder="Type a unit number, a name or a phone number"
               className="flex-1 min-w-[200px] rounded-[12px] border border-line bg-paper px-3 py-2.5 text-[15px]" />
        <button type="submit" disabled={digits.length < 10} className="haptic rounded-[12px] bg-forest text-paper px-4 py-2.5 text-[14px] font-bold disabled:opacity-40">📞 Call</button>
      </form>
      {!picked && !isPhone && term.length > 0 && people.length > 0 && (
        <div className="rounded-[12px] border border-line bg-paper divide-y divide-line overflow-hidden">
          {people.map((p) => (
            <button key={p.key} type="button" onClick={() => setPicked({ label: p.label, phone: p.phone })}
                    className="haptic w-full text-left px-3 py-2 hover:bg-cream/60 flex items-center gap-2">
              <span className="font-bold text-ink text-[14px]">{p.label}</span>
              <span className="text-[12px] text-muted">{p.sub}</span>
            </button>
          ))}
        </div>
      )}
      {!picked && !isPhone && term.length > 0 && q.isFetched && people.length === 0 && (
        <div className="text-[12px] text-muted">No one found. You can also type the phone number.</div>
      )}
    </div>
  );
}

function Tile({ n, label, tone, onClick, active }: { n: number; label: string; tone: 'green' | 'red' | 'plain'; onClick?: () => void; active?: boolean }) {
  const cls = tone === 'green' ? 'bg-sage text-forest' : tone === 'red' ? (n ? 'bg-clay/10 text-clay' : 'bg-cream text-muted') : 'bg-cream text-ink';
  return (
    <button type="button" onClick={onClick} className={`haptic text-left rounded-[14px] px-3 py-2.5 min-w-[92px] ${cls} ${active ? 'ring-2 ring-forest' : ''}`}>
      <div className="font-display text-[26px] leading-none font-semibold">{n}</div>
      <div className="text-[11.5px] font-bold mt-1 uppercase tracking-[.06em]">{label}</div>
    </button>
  );
}

/** Today's calls with the clickable tiles (Nov 2 client). Nov 5 client: now at the top of "Calls history". */
function TodayCallsTiles() {
  const q = useCalls(2);
  const d = q.data?.data;
  const [yest, setYest] = useState(false); // Nov 3 client: see yesterday too
  const ydayStr = new Date(Date.now() - 86400e3).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const today = (d?.rows ?? []).filter((c) => dayOf(c.at) === (yest ? ydayStr : todayNY()));
  // Nov 2 client: "make the tiles clickable" — a tile filters the list under it (tap again for all).
  type F = 'all' | 'in' | 'answered' | 'missed' | 'voicemail' | 'out' | 'notback';
  const [f, setF] = useState<F>('all');
  const pick = (x: F) => setF((cur) => (cur === x ? 'all' : x));
  const listed = today.filter((c) => f === 'all' || (f === 'in' ? c.dir === 'in' : f === 'out' ? c.dir === 'out'
    : f === 'answered' ? c.dir === 'in' && c.status === 'answered' : f === 'missed' ? c.dir === 'in' && c.status === 'missed'
    : f === 'voicemail' ? c.status === 'voicemail' : c.dir === 'in' && (c.status === 'missed' || c.status === 'voicemail') && !c.calledBackAt));
  return (
      <section className="rounded-[18px] border border-line bg-paper p-5 space-y-3">
        <div className="flex items-center gap-2">
          <h3 className="font-display font-semibold text-[17px] text-ink mr-auto">{yest ? "Yesterday's calls" : "Today's calls"}</h3>
          <button type="button" onClick={() => setYest((v) => !v)} className="text-[12.5px] font-bold text-forest underline">{yest ? 'Back to today' : 'Yesterday'}</button>
        </div>
        {!d ? <div className="text-[13px] text-muted">{q.isError ? "Couldn't load the calls." : 'Loading…'}</div> : (<>
          <div className="flex flex-wrap gap-2">
            <Tile n={today.filter((c) => c.dir === 'in').length} label="Came in" tone="plain" onClick={() => pick('in')} active={f === 'in'} />
            <Tile n={today.filter((c) => c.dir === 'in' && c.status === 'answered').length} label="Answered" tone="green" onClick={() => pick('answered')} active={f === 'answered'} />
            <Tile n={today.filter((c) => c.dir === 'in' && c.status === 'missed').length} label="Missed" tone="red" onClick={() => pick('missed')} active={f === 'missed'} />
            <Tile n={today.filter((c) => c.dir === 'out').length} label="Called out" tone="plain" onClick={() => pick('out')} active={f === 'out'} />
            <Tile n={today.filter((c) => c.dir === 'in' && (c.status === 'missed' || c.status === 'voicemail') && !c.calledBackAt).length} label="Not called back" tone="red" onClick={() => pick('notback')} active={f === 'notback'} />
            <div className="rounded-[14px] px-3 py-2.5 min-w-[92px] bg-cream text-ink">
              <div className="font-display text-[26px] leading-none font-semibold">{total(today.reduce((s2, c) => s2 + (c.status === 'answered' ? (c.seconds ?? 0) : 0), 0))}</div>
              <div className="text-[11.5px] font-bold mt-1 uppercase tracking-[.06em]">Talk time</div>
            </div>
          </div>
          <Health d={d} />
          {f !== 'all' && <button type="button" onClick={() => setF('all')} className="text-[12.5px] font-bold text-forest underline">Showing one kind — show all</button>}
          <div>{listed.slice(0, f === 'all' ? 15 : 200).map((c) => <CallRow key={c.id} c={c} />)}</div>
          {listed.length === 0 && <div className="text-[13px] text-muted">{f === 'all' ? 'No calls yet today.' : 'None.'}</div>}
          {f === 'all' && today.length > 15 && <div className="text-[12px] text-muted">Showing the last 15 — tap a tile, or see all calls below.</div>}
        </>)}
      </section>
  );
}

export function DispatchCallsPanel() {
  // Nov 3 client: "I want to see more history" — Yesterday / 90 days / 6 months + search.
  const [range, setRange] = useState<'1' | 'y' | '7' | '31' | '90' | '183'>('7');
  const days = range === 'y' ? 2 : Number(range);
  const [filter, setFilter] = useState<'all' | 'in' | 'out' | 'missed'>('all');
  const [search, setSearch] = useState('');
  const q = useCalls(days);
  const d = q.data?.data;
  const yday = (() => { const x = new Date(Date.now() - 86400e3); return x.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); })();
  const s = search.trim().toLowerCase(), sd = s.replace(/\D/g, '');
  const rows = (d?.rows ?? [])
    .filter((c) => range !== 'y' || dayOf(c.at) === yday)
    .filter((c) => filter === 'all' || (filter === 'missed' ? (c.status === 'missed' || c.status === 'voicemail') : c.dir === filter))
    .filter((c) => !s || c.who.toLowerCase().includes(s) || (sd.length >= 3 && String(c.phone ?? '').includes(sd)));
  return (
    <section className="rounded-[14px] border border-line bg-paper p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-display font-semibold text-[16px] text-ink mr-auto">All calls</h3>
        {(['all', 'in', 'out', 'missed'] as const).map((f) => (
          <button key={f} type="button" onClick={() => setFilter(f)}
                  className={`px-3 py-1 rounded-full text-[12.5px] font-bold border ${filter === f ? 'bg-forest text-paper border-forest' : 'bg-paper border-line'}`}>
            {f === 'all' ? 'All' : f === 'in' ? 'Incoming' : f === 'out' ? 'Called out' : 'Missed & voicemail'}
          </button>
        ))}
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or number" className="rounded-[8px] border border-line bg-paper px-2 py-1 text-[13px] w-[170px]" />
        <select value={range} onChange={(e) => setRange(e.target.value as any)} className="rounded-[8px] border border-line bg-paper px-2 py-1 text-[13px]">
          <option value="1">Today</option><option value="y">Yesterday</option><option value="7">7 days</option><option value="31">31 days</option>
          <option value="90">90 days</option><option value="183">6 months</option>
        </select>
      </div>
      {!d ? <div className="text-[13px] text-muted">{q.isError ? "Couldn't load the calls." : 'Loading…'}</div> : (<>
        <Health d={d} />
        <div className="text-[12px] text-muted">{rows.length} call{rows.length === 1 ? '' : 's'}</div>
        <div>{rows.slice(0, 500).map((c) => <CallRow key={c.id} c={c} />)}</div>
        {rows.length > 500 && <div className="text-[12px] text-muted">Showing the newest 500 — use search or a shorter range.</div>}
        {rows.length === 0 && <div className="text-[13px] text-muted">No calls.</div>}
      </>)}
    </section>
  );
}

/** Nov 5 client: the thin green strip on top — who gets dispatch calls now · I'm dispatching now · Call someone
 *  · Turn forwarding off · Write handover note. Schedule / overrides: right below it on the same Dispatch page. */
function DispatchStrip({ onWrite }: { onWrite: () => void }) {
  const q = useForward();
  const dl = useDispatchLine();
  const [calling, setCalling] = useState(false);
  const v = q.data?.data;
  const s = v?.state;
  const on = !!s?.number;
  const name = !v ? (q.isError ? '?' : '…') : on ? (s!.name || (s!.source === 'backup' ? 'Backup' : 'Cell')) : 'Nobody (the Reliable app rules)';
  const pillB = 'haptic rounded-full px-3 py-1.5 text-[12.5px] font-bold';
  return (
    <section className="rounded-[14px] bg-forest text-paper px-4 py-2.5" data-dispatch-strip>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-[15px] font-bold">📞 Dispatch calls → {name}</span>
        <span className="text-[12.5px] text-paper/75">{dl.full}</span>
        <span className="ml-auto flex flex-wrap items-center gap-2">
          <DispatchingNowButton className={`${pillB} bg-paper text-forest`} msgClassName="text-[12px] text-paper" />
          <ForwardOffButton className={`${pillB} border border-paper/60 text-paper`} msgClassName="text-[12px] text-paper" />{/* Nov 5 client */}
          <button type="button" onClick={() => setCalling((x) => !x)} aria-expanded={calling} className={`${pillB} border border-paper/60 text-paper`}>📞 Call someone</button>
          <button type="button" onClick={onWrite} data-write-handover className="text-[12.5px] font-bold text-paper/90 underline">📝 Write handover note</button>
        </span>
      </div>
      {s?.lastError && <div className="mt-2 rounded-[8px] bg-clay/90 px-2.5 py-1.5 text-[12.5px] font-bold">Last switch failed: {s.lastError}</div>}
      {calling && (
        <div className="mt-2.5 rounded-[12px] bg-paper p-3 text-ink space-y-1.5">
          <CallSomeone />
          <div className="text-[11.5px] text-muted">Your phone rings first; pick it up and it dials them from the office number. Changed your mind? Just don't pick up.</div>
        </div>
      )}
    </section>
  );
}

/** Nov 5 client: today's calls folded to one line ("12 calls today · 1 missed"); tap to open the list. */
function TodayCallsLine({ onHistory }: { onHistory: () => void }) {
  const q = useCalls(2);
  const d = q.data?.data;
  const [open, setOpen] = useState(false);
  const today = (d?.rows ?? []).filter((c) => dayOf(c.at) === todayNY());
  const missedIn = today.filter((c) => c.dir === 'in' && (c.status === 'missed' || c.status === 'voicemail'));
  const notBack = missedIn.filter((c) => !c.calledBackAt).length;
  return (
    <section className="rounded-[14px] border border-line bg-paper" data-today-calls>
      <button type="button" onClick={() => setOpen((x) => !x)} aria-expanded={open} className="w-full flex flex-wrap items-center gap-x-2 px-4 py-2.5 text-left">
        {!d ? <span className="text-[14px] text-muted">📞 Today's calls: {q.isError ? "couldn't load" : 'loading…'}</span> : (<>
          <span className="text-[14px] font-bold text-ink">📞 {today.length} call{today.length === 1 ? '' : 's'} today</span>
          <span className={`text-[14px] font-bold ${missedIn.length ? 'text-clay' : 'text-muted'}`}>· {missedIn.length} missed</span>
          {notBack > 0 && <span className="text-[12.5px] font-bold text-clay">({notBack} not called back)</span>}
        </>)}
        <span className="ml-auto text-[12px] text-muted">{open ? '▲ Hide' : '▼ Show'}</span>
      </button>
      {open && d && (
        <div className="px-4 pb-3">
          {today.slice(0, 15).map((c) => <CallRow key={c.id} c={c} />)}
          {today.length === 0 && <div className="text-[13px] text-muted">No calls yet today.</div>}
          <button type="button" onClick={onHistory} className="mt-2 text-[12.5px] font-bold text-forest underline">All calls →</button>
        </div>
      )}
    </section>
  );
}

export type DispatchPanel = 'calls' | 'texts' | null;

/** Nov 5 client: "ONE SIMPLE SCREEN, NO TABS" — Dispatch for office logins and My Dispatch for dispatchers.
 *  Strip on top · handover note only when unread · To do (hidden for now: SHOW_DISPATCH_TODO in dispatch-todo.tsx)
 *  · today's calls in one line.
 *  Top-right links: Calls history (tiles + all calls) and Texts. The Dispatcher guide is in the ? help menu. */
// Nov 5 client: `lead` = something at the left of the top row.
// Nov 6 client: ONE Dispatch page, no Today / Schedule switch — `below` (the schedule part) comes right under Today.
export function DispatchScreen({ initialPanel = null, onPanel, lead, below }: { initialPanel?: DispatchPanel; onPanel?: (p: DispatchPanel) => void; lead?: ReactNode; below?: ReactNode }) {
  const [panel, setPanelState] = useState<DispatchPanel>(initialPanel);
  const [writeSig, setWriteSig] = useState(0);
  const setPanel = (p: DispatchPanel) => { setPanelState(p); onPanel?.(p); window.scrollTo(0, 0); };
  const link = (p: Exclude<DispatchPanel, null>, label: string) => (
    <button type="button" data-dispatch-link={p} onClick={() => setPanel(panel === p ? null : p)}
            className={`text-[13px] font-bold underline ${panel === p ? 'text-ink' : 'text-forest'}`}>{label}</button>
  );
  return (
    <div className="space-y-3" data-dispatch-screen>
      <div className="flex items-center gap-4">
        {panel ? <button type="button" onClick={() => setPanel(null)} className="text-[13px] font-bold text-forest underline">← Back to Dispatch</button> : lead}
        <span className="ml-auto flex items-center gap-4">{link('calls', 'Calls history')}{link('texts', 'Texts')}</span>
      </div>
      {panel === 'calls' ? (
        <div className="space-y-4"><TodayCallsTiles /><DispatchCallsPanel /></div>
      ) : panel === 'texts' ? (
        <OfficeTextsPanel />
      ) : (<>
        <NextDispatcherBanner />
        <DispatchStrip onWrite={() => setWriteSig((n) => n + 1)} />
        <HandoverNote compact writeSignal={writeSig} />
        <TodoPanel />
        <TodayCallsLine onHistory={() => setPanel('calls')} />
        {below && <div className="pt-3" data-dispatch-below>{below}</div>}
      </>)}
    </div>
  );
}