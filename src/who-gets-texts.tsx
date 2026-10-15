/**
 * Oct 11 client: Messaging → "Who gets texts". Every driver, texts ON / OFF
 * right now and why — the same rule the pickup text uses (server:
 * GET /api/texting/who-gets-texts), with one-tap "Turn texts back on" /
 * "Add to Default group" (with a check first).
 *
 * Oct 12 client: counts split "would get a text now" vs "quiet right now";
 * a day chart (GET /api/texting/who-gets-texts/by-time) — tap a half hour to see
 * who gets it and who doesn't, and why; a Quiet hours view (every quiet time,
 * quiet day, away date; "covers most of the day — check?"); an Inactive view
 * (who made them inactive and when, last pickup, "Make active again").
 * The "turned off since Oct 9" part is gone.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { uiConfirm, uiNotify } from './ui-dialogs';

type Quiet = { windows: string[]; days: string[]; away: string | null; minutes: number; mostOfDay: boolean;
  textingLine?: string; quietLine?: string | null; daysLine?: string | null; awayLine?: string | null };  // Oct 12 client
type Inactive = { how: 'declined' | 'status_change' | 'edit' | 'none'; at: string | null; by: string | null; reason: string | null; line: string; lastPickup: string | null; pickups: number; pickupLine: string };
type Row = {
  id: number; name: string; unit: string | null; phoneLast4: string | null; inGroup: boolean;
  multiPhone?: boolean; textPhoneSeparate?: boolean; // Oct 14 client: more than one number → phoneLast4 = where texts go
  state: 'on' | 'off' | 'not_in_group' | 'outside_helper'; code: string; line: string; quietNow: boolean;  // Oct 13 client: + outside helpers
  quiet: Quiet | null; textsOff: boolean; status: string | null; inactive: Inactive | null;
  // Oct 14 client: real WhatsApp status (messaged us / our WhatsApp went through / failed / not confirmed) + what they chose
  wa?: { state: 'inbound' | 'sent' | 'failed' | 'unknown'; confirmed: boolean; label: string; at: string | null } | null;
  contact?: string | null;
};
type Data = {
  at: string; today: string; group: { id: number; name: string } | null;
  counts: { getsNow: number; quietNow: number; on: number; off: number; notInGroup: number; hasQuiet: number; mostOfDay: number; inactive: number; outsideHelpers?: number; waConfirmed?: number };
  rows: Row[]; backOnText: string;
  waBridge?: { ok: boolean; reason: string | null };  // Oct 14 client
};
type Slot = { time: string; label: string; at: string; shabbos: boolean; hourly: boolean; earlyOnly?: boolean; gets: number[]; skipped: Array<{ id: number; code: string; reason: string }> }; // Oct 14 client: earlyOnly = 8 AM, only for pickups before 9
type ByTime = {
  date: string; dateLabel: string; days: Array<{ ymd: string; label: string }>; group: { id: number; name: string } | null;
  hourly: { hours: number[]; from: string; to: string; early?: string | null }; slots: Slot[]; // Oct 14 client: early = "8:00 AM" (pickups before 9 only)
  people: Array<{ id: number; name: string; unit: string | null; inactive: boolean; mostOfDay: boolean }>;
};
type Filter = 'all' | 'now' | 'quiet' | 'off' | 'notin' | 'quiethours' | 'inactive' | 'outside' | 'waok';

const fmtWhen = (iso: string) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
const hrs = (min: number) => { const h = Math.floor(min / 60), m = min % 60; return m ? `${h}h ${m}m` : `${h}h`; };
const shortHour = (time: string) => { const h = Number(time.slice(0, 2)); return `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? 'a' : 'p'}`; };

// Plain group headings for "Doesn't get it" in the day chart.
const REASON_LABEL: Record<string, string> = {
  quiet_hours: 'Quiet time', quiet_day: 'Quiet day', away: 'Away', app_only: 'App only (no texts)',
  opted_out: 'Texts turned off', no_notifications: 'No notifications', paused: 'Paused by the office',
  no_phone: 'No phone number', status: 'Status (do not contact / alumni / archived)', shabbos: 'Shabbos / Yom Tov',
  outside_helper: 'Outside helper (never texted)', // Oct 13 client
  whatsapp_only: 'WhatsApp only (no texts)', // Oct 14 client
};

const nyNowSlot = () => {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hourCycle: 'h23', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date());
  const h = Number(p.find((x) => x.type === 'hour')?.value ?? 0) % 24, m = Number(p.find((x) => x.type === 'minute')?.value ?? 0);
  return h * 2 + (m >= 30 ? 1 : 0);
};

function DayChart({ onOpenPerson }: { onOpenPerson?: (id: number) => void }) {
  const [date, setDate] = useState<string | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  const [showGets, setShowGets] = useState(false);
  const q = useQuery({
    queryKey: ['who-gets-texts-by-time', date ?? 'today'],
    queryFn: () => api<{ data: ByTime }>(`/api/texting/who-gets-texts/by-time${date ? `?date=${date}` : ''}`).then((r) => r.data),
    staleTime: 60_000,
  });
  const d = q.data;
  const isToday = !!d && d.date === d.days[0]?.ymd;
  const scroller = useRef<HTMLDivElement>(null);
  const nowSlot = nyNowSlot();
  useEffect(() => {
    // Today: start scrolled to "now".
    if (!d || !scroller.current) return;
    const target = isToday ? nowSlot : 14; // 7 AM
    scroller.current.scrollLeft = Math.max(0, target * 22 - 60);
  }, [d?.date]); // eslint-disable-line react-hooks/exhaustive-deps

  const byId = useMemo(() => new Map((d?.people ?? []).map((p) => [p.id, p])), [d]);
  if (q.isLoading) return <div className="text-[12.5px] text-muted">Loading the day…</div>;
  if (q.isError || !d) return <div className="text-[12.5px] font-bold text-clay">Couldn't load the day chart.</div>;

  const total = d.people.length || 1;
  const slot = sel != null ? d.slots[sel] : null;
  const name = (id: number) => byId.get(id)?.name ?? `Driver ${id}`;
  const person = (id: number, extra?: string) => (
    <button key={id} type="button" onClick={() => onOpenPerson?.(id)} className="haptic text-left font-bold text-ink hover:underline">
      {name(id)}{extra ? <span className="font-normal text-muted"> ({extra})</span> : null}
      {byId.get(id)?.mostOfDay && <span className="font-normal text-[#9a7415]"> · covers most of the day</span>}
    </button>
  );
  const groups = slot ? (() => {
    const m = new Map<string, Array<{ id: number; reason: string }>>();
    for (const s of slot.skipped) { if (!m.has(s.code)) m.set(s.code, []); m.get(s.code)!.push({ id: s.id, reason: s.reason }); }
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  })() : [];
  const detail = (code: string, reason: string) =>
    code === 'quiet_hours' ? reason.replace(/^Quiet hours /, '') : code === 'away' || code === 'paused' || code === 'quiet_day' || code === 'status' ? reason : '';

  return (
    <div className="rounded-[14px] border border-line bg-paper p-3.5 space-y-2.5">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <div className="text-[14px] font-bold text-ink">By time of day</div>
        <div className="text-[12px] text-muted">How many of the {d.people.length} in the {d.group?.name ?? 'Default text group'} would get a pickup text at each half hour.</div>
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-0.5">
        {d.days.map((x) => (
          <button key={x.ymd} type="button" onClick={() => { setDate(x.ymd); setSel(null); }}
                  className={`haptic shrink-0 rounded-full border px-2.5 py-0.5 text-[12px] font-bold ${x.ymd === d.date ? 'border-forest bg-sage/50 text-forest' : 'border-line bg-paper text-ink'}`}>
            {x.label}
          </button>
        ))}
      </div>
      <div ref={scroller} className="overflow-x-auto">
        <div className="flex items-end" style={{ width: d.slots.length * 22 }} role="list" aria-label={`Drivers who would get a pickup text, ${d.dateLabel}`}>
          {d.slots.map((s, i) => {
            const n = s.gets.length;
            const h = Math.round((n / total) * 72);
            const bg = s.shabbos ? 'bg-line' : s.earlyOnly ? 'bg-sage/25' : s.hourly ? 'bg-sage/60' : ''; // Oct 14 client: 8 AM lighter
            return (
              <button key={s.time} type="button" role="listitem" onClick={() => { setSel(sel === i ? null : i); setShowGets(false); }}
                      title={`${s.label}: ${n} get it${s.shabbos ? ' (Shabbos)' : ''}`}
                      className={`haptic relative flex h-[104px] w-[22px] shrink-0 flex-col items-center justify-end ${bg} ${sel === i ? 'ring-2 ring-inset ring-ink/60' : ''}`}>
                <span className="mb-0.5 text-[9.5px] font-bold leading-none text-ink">{n}</span>
                <span className={`w-[18px] rounded-t-[4px] ${s.shabbos ? 'bg-muted/40' : 'bg-forest'}`} style={{ height: Math.max(n ? 2 : 0, h) }} />
                {isToday && i === nowSlot && <span className="absolute top-0 h-1.5 w-1.5 rounded-full bg-clay" aria-label="now" />}
              </button>
            );
          })}
        </div>
        <div className="flex" style={{ width: d.slots.length * 22 }}>
          {d.slots.map((s, i) => (
            <div key={s.time} className="w-[22px] shrink-0 border-t border-line pt-0.5 text-center text-[9.5px] text-muted">{i % 2 === 0 ? shortHour(s.time) : ''}</div>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11.5px] text-muted">
        <span><span className="mr-1 inline-block h-2.5 w-2.5 bg-sage align-middle" />Hourly list hours ({d.hourly.from}–{d.hourly.to})</span>
        {d.hourly.early && <span><span className="mr-1 inline-block h-2.5 w-2.5 bg-sage/25 align-middle" />{d.hourly.early}: only when a pickup is before 9</span>}{/* Oct 14 client */}
        {d.slots.some((s) => s.shabbos) && <span><span className="mr-1 inline-block h-2.5 w-2.5 bg-line align-middle" />Shabbos / Yom Tov (no texts)</span>}
        {isToday && <span><span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-clay align-middle" />now</span>}
      </div>
      <div className="text-[11.5px] text-muted">The new-pickup text and the hourly list follow the same rule: the hourly list only goes out {d.hourly.from}–{d.hourly.to}{d.hourly.early ? ` (and at ${d.hourly.early} only for pickups before 9)` : ''}; a new pickup is texted at the top of the hour before its time (or right away if that has passed), at any hour except Shabbos.</div>

      {slot && (
        <div className="rounded-[10px] border border-line bg-sage/10 p-2.5 text-[12.5px] space-y-2">
          <div className="font-bold text-ink">{slot.label}, {d.dateLabel}{slot.shabbos ? ' — Shabbos / Yom Tov' : ''}</div>
          <div>
            <button type="button" onClick={() => setShowGets(!showGets)} className="haptic font-bold text-forest">
              Gets it ({slot.gets.length}) {slot.gets.length > 0 ? (showGets ? '▴' : '▾') : ''}
            </button>
            {showGets && slot.gets.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">{slot.gets.slice().sort((a, b) => name(a).localeCompare(name(b))).map((id) => person(id))}</div>
            )}
          </div>
          <div>
            <div className="font-bold text-clay">Doesn't get it ({slot.skipped.length})</div>
            {groups.map(([code, list]) => (
              <div key={code} className="mt-1">
                <div className="text-[11.5px] font-bold uppercase tracking-wide text-muted">{REASON_LABEL[code] ?? code} ({list.length})</div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                  {list.slice().sort((a, b) => name(a.id).localeCompare(name(b.id))).map((x) => person(x.id, detail(code, x.reason)))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {!slot && <div className="text-[11.5px] text-muted">Tap any time to see who gets it and who doesn't, and why.</div>}
    </div>
  );
}

export function WhoGetsTextsPanel({ onOpenPerson }: { onOpenPerson?: (id: number) => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['who-gets-texts'], queryFn: () => api<{ data: Data }>('/api/texting/who-gets-texts').then((r) => r.data), staleTime: 20_000 });
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [confirmOn, setConfirmOn] = useState<number | null>(null);
  const [sendText, setSendText] = useState(true);

  const refresh = () => { qc.invalidateQueries({ queryKey: ['who-gets-texts'] }); qc.invalidateQueries({ queryKey: ['who-gets-texts-by-time'] }); };
  const turnOn = useMutation({
    mutationFn: (v: { id: number; sendText: boolean }) =>
      api<{ data: { ok: boolean; texted: boolean } }>(`/api/texting/drivers/${v.id}/texts-on`, { method: 'POST', body: JSON.stringify({ sendText: v.sendText }) }),
    onSuccess: (r, v) => {
      setConfirmOn(null);
      uiNotify(v.sendText ? (r.data.texted ? 'Texts are back on. We texted them.' : 'Texts are back on. (The text did not go out.)') : 'Texts are back on.', 'ok');
      refresh();
    },
    onError: () => uiNotify("Couldn't turn texts back on. Try again.", 'err'),
  });
  const addToGroup = useMutation({
    mutationFn: (v: { id: number; groupId: number }) =>
      api(`/api/volunteers/${v.id}/alerts/groups/${v.groupId}`, { method: 'PUT', body: JSON.stringify({ member: true }) }),
    onSuccess: () => { uiNotify('Added to the Default text group.', 'ok'); refresh(); },
    onError: () => uiNotify("Couldn't add them. Try again.", 'err'),
  });
  const makeActive = useMutation({
    mutationFn: (id: number) => api(`/api/texting/drivers/${id}/make-active`, { method: 'POST', body: '{}' }),
    onSuccess: () => { uiNotify('Marked active.', 'ok'); refresh(); },
    onError: () => uiNotify("Couldn't change the status. Try again.", 'err'),
  });

  const d = q.data;
  const rows = useMemo(() => {
    if (!d) return [];
    const s = search.trim().toLowerCase();
    const list = d.rows.filter((r) => {
      if (filter === 'now' && !(r.state === 'on' && !r.quietNow)) return false;
      if (filter === 'quiet' && !r.quietNow) return false;
      if (filter === 'off' && r.state !== 'off') return false;
      if (filter === 'notin' && r.state !== 'not_in_group') return false;
      if (filter === 'quiethours' && !r.quiet) return false;
      if (filter === 'inactive' && !r.inactive) return false;
      if (filter === 'outside' && r.state !== 'outside_helper') return false; // Oct 13 client
      if (filter === 'waok' && !r.wa?.confirmed) return false; // Oct 14 client
      if (!s) return true;
      return r.name.toLowerCase().includes(s) || (r.unit ?? '').includes(s) || (r.phoneLast4 ?? '').includes(s) || r.line.toLowerCase().includes(s);
    });
    // Quiet hours view: the most quiet first (time covered, then quiet days).
    if (filter === 'quiethours') list.sort((a, b) => ((b.quiet?.minutes ?? 0) + (b.quiet?.days.length ?? 0) * 1440 / 7) - ((a.quiet?.minutes ?? 0) + (a.quiet?.days.length ?? 0) * 1440 / 7));
    return list;
  }, [d, filter, search]);

  if (q.isLoading) return <div className="text-[13px] text-muted">Loading…</div>;
  if (q.isError || !d) return <div className="text-[13px] font-bold text-clay">Couldn't load the list. Try again.</div>;

  const chip = (k: Filter, label: string) => (
    <button key={k} type="button" onClick={() => setFilter(k)}
            className={`haptic rounded-full border px-3 py-1 text-[12.5px] font-bold ${filter === k ? 'border-forest bg-sage/50 text-forest' : 'border-line bg-paper text-ink'}`}>
      {label}
    </button>
  );

  return (
    <div className="space-y-3 max-w-[900px]">
      <div className="rounded-[14px] border border-line bg-paper p-3.5">
        <div className="text-[15px] font-bold text-ink">
          Would get a text now: <span className="text-forest">{d.counts.getsNow}</span>
          <span className="text-muted font-normal"> · </span>Quiet right now: <span className="text-[#9a7415]">{d.counts.quietNow}</span>
          <span className="text-muted font-normal"> · </span>Off: <span className="text-clay">{d.counts.off}</span>
          <span className="text-muted font-normal"> · </span>Not in group: {d.counts.notInGroup}
        </div>
        <div className="text-[12.5px] text-muted mt-0.5">
          Same rule as the pickup text{d.group ? ` to the ${d.group.name}` : ''}. As of {fmtWhen(d.at)}.
        </div>
      </div>

      <DayChart onOpenPerson={onOpenPerson} />

      <div className="flex flex-wrap items-center gap-2">
        {chip('all', `All (${d.rows.length})`)}
        {chip('now', `Gets it now (${d.counts.getsNow})`)}
        {chip('quiet', `Quiet now (${d.counts.quietNow})`)}
        {chip('off', `Off (${d.counts.off})`)}
        {chip('notin', `Not in group (${d.counts.notInGroup})`)}
        {chip('quiethours', `Quiet hours (${d.counts.hasQuiet})`)}
        {chip('inactive', `Inactive (${d.counts.inactive})`)}
        {chip('outside', `Outside helpers (${d.counts.outsideHelpers ?? 0})`)}
        {chip('waok', `WhatsApp confirmed (${d.counts.waConfirmed ?? 0})`)}
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, unit, phone…"
               className="ml-auto min-w-[180px] flex-1 sm:flex-none rounded-[10px] border border-line bg-paper px-3 py-1.5 text-[13px]" />
      </div>
      {filter === 'quiethours' && (
        <div className="text-[12px] text-muted">Everyone in the group with a quiet time, quiet day or away date — most quiet first.{d.counts.mostOfDay > 0 ? ` ${d.counts.mostOfDay} have quiet times that cover most of the day (maybe set backwards).` : ''}</div>
      )}
      {filter === 'waok' && (
        <div className="text-[12px] text-muted">Drivers we KNOW have WhatsApp — they messaged us on WhatsApp, or our WhatsApp to them went through. Not based on what they chose in the app.</div>
      )}
      {d.waBridge && !d.waBridge.ok && (
        <div className="text-[12px] font-bold text-[#9a7415]">⚠ WhatsApp: {d.waBridge.reason}. WhatsApp-only drivers get texts instead until it works.</div>
      )}
      {filter === 'outside' && (
        <div className="text-[12px] text-muted">People who covered a pickup but aren't our volunteers (added in "Drivers on this pickup"). They never get our texts and are never in a text group. Open one and press "Make a volunteer" to change that.</div>
      )}
      {filter === 'inactive' && (
        <div className="text-[12px] text-muted">"Inactive" is only a label for the office: inactive drivers in the Default group still get pickup texts. Nobody's status changes by itself.</div>
      )}

      <div className="rounded-[14px] border border-line bg-paper divide-y divide-line">
        {rows.length === 0 && <div className="p-3 text-[13px] text-muted">Nobody here.</div>}
        {rows.map((r) => {
          const dot = r.state === 'on' ? (r.quietNow ? 'bg-amber' : 'bg-forest') : r.state === 'off' ? 'bg-clay' : 'bg-line';
          return (
            <div key={r.id} className="px-3 py-2">
              <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
                <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${dot}`} aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px]">
                    <button type="button" onClick={() => onOpenPerson?.(r.id)} className="haptic font-bold text-ink hover:underline text-left">{r.name}</button>
                    {r.unit && <span className="text-muted"> #{r.unit}</span>}
                    {r.phoneLast4 && <span className="text-muted"> · {r.multiPhone || r.textPhoneSeparate ? '💬 texts to ' : ''}…{r.phoneLast4}</span>}
                    {r.inactive && <span className="ml-1.5 rounded-full bg-line/70 px-1.5 py-0.5 text-[10.5px] font-bold text-muted">inactive</span>}
                    {r.state === 'outside_helper' && <span className="ml-1.5 rounded-full bg-amber-soft px-1.5 py-0.5 text-[10.5px] font-bold text-[#8a6011]">Outside helper</span>}
                  </div>
                  <div className={`text-[12.5px] leading-snug ${r.state === 'off' ? 'text-clay' : r.state === 'on' ? 'text-ink' : 'text-muted'}`}>{r.line}</div>
                  {/* Oct 12 client: texting hours first, quiet hours under them in grey. */}
                  {r.quiet && (filter === 'quiethours' || r.state === 'on') && (
                    <div className="text-[11.5px] leading-snug">
                      {(r.quiet.windows.length > 0 || filter === 'quiethours') && (
                        <div className={r.quiet.mostOfDay ? 'font-bold text-[#9a7415]' : 'font-semibold text-ink'}>{r.quiet.textingLine}</div>
                      )}
                      {r.quiet.quietLine && (
                        <div className="text-muted">{r.quiet.quietLine}{filter === 'quiethours' && <> · {hrs(r.quiet.minutes)} a day</>}</div>
                      )}
                      {(r.quiet.daysLine || r.quiet.awayLine) && (
                        <div className="text-muted">{[r.quiet.daysLine, r.quiet.awayLine].filter(Boolean).join(' · ')}</div>
                      )}
                    </div>
                  )}
                  {r.inactive && (
                    <div className="text-[11.5px] text-muted">{r.inactive.line} · {r.inactive.pickupLine}</div>
                  )}
                  {/* Oct 14 client: real WhatsApp status — shown for WhatsApp / Both drivers and anyone with WhatsApp evidence. */}
                  {r.wa && (r.wa.state !== 'unknown' || r.contact === 'whatsapp' || r.contact === 'both' || filter === 'waok') && (
                    <div data-wa-status className={`text-[11.5px] leading-snug ${r.wa.state === 'failed' ? 'text-clay' : r.wa.confirmed ? 'text-forest' : 'text-muted'}`}>
                      {r.contact === 'whatsapp' ? 'Chose WhatsApp · ' : r.contact === 'both' ? 'Chose Text + WhatsApp · ' : ''}{r.wa.label}
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {r.textsOff && r.state !== 'outside_helper' && confirmOn !== r.id && (
                    <button type="button" onClick={() => { setSendText(true); setConfirmOn(r.id); }}
                            className="haptic rounded-[9px] border border-forest/50 px-2.5 py-1 text-[12px] font-bold text-forest">Turn texts back on</button>
                  )}
                  {r.inactive && filter === 'inactive' && (
                    <button type="button" disabled={makeActive.isPending}
                            onClick={async () => { if (await uiConfirm(`Make ${r.name} active again? Their status changes from "inactive" to "active".`, { okLabel: 'Make active' })) makeActive.mutate(r.id); }}
                            className="haptic rounded-[9px] border border-forest/50 px-2.5 py-1 text-[12px] font-bold text-forest disabled:opacity-50">Make active again</button>
                  )}
                  {!r.inGroup && d.group && r.state !== 'outside_helper' && (
                    <button type="button" disabled={addToGroup.isPending}
                            onClick={async () => { if (await uiConfirm(`Add ${r.name} to the ${d.group!.name}? They will start getting pickup texts.`, { okLabel: 'Add' })) addToGroup.mutate({ id: r.id, groupId: d.group!.id }); }}
                            className="haptic rounded-[9px] border border-line px-2.5 py-1 text-[12px] font-bold text-ink disabled:opacity-50">Add to Default group</button>
                  )}
                </div>
              </div>
              {confirmOn === r.id && (
                <div className="mt-2 ml-4 rounded-[10px] border border-forest/40 bg-sage/20 p-2.5 text-[12.5px]">
                  <div className="font-bold">Turn pickup texts back on for {r.name}?</div>
                  <label className="mt-1.5 flex items-start gap-2">
                    <input type="checkbox" checked={sendText} onChange={(e) => setSendText(e.target.checked)} className="mt-0.5 h-4 w-4 accent-forest" />
                    <span>Send them a short text: "{d.backOnText}"</span>
                  </label>
                  <div className="mt-2 flex gap-2">
                    <button type="button" disabled={turnOn.isPending} onClick={() => turnOn.mutate({ id: r.id, sendText })}
                            className="haptic rounded-[9px] bg-forest px-3 py-1 text-[12.5px] font-bold text-paper disabled:opacity-50">Yes, turn on</button>
                    <button type="button" onClick={() => setConfirmOn(null)} className="haptic rounded-[9px] border border-line px-3 py-1 text-[12.5px] font-bold">Cancel</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
