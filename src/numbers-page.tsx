/**
 * Oct 21 client (ops review item 9): Reports → Numbers (admin / staff / coordinator).
 * Today, yesterday, this week and last week: pickups, covered on time, time to get a
 * driver, done / missed / cancelled, food, drivers, stores, texts, app opens; plus an
 * 8-week trend (covered on time %, missed). GET /api/numbers (one call, cached 60 s).
 * The box at the bottom: the 9:15 PM daily summary + Sunday weekly summary (bell alert
 * + text to the "Daily summary to" phones) — GET/PUT /api/numbers/settings.
 */
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { uiNotify } from './ui-dialogs';

type CancelRole = 'store' | 'office' | 'auto' | 'driver' | 'other';
export type PeriodNumbers = {
  key: string; label: string; from: string; to: string;
  pickups: number; oneTime: number; steady: number; delivery: number;
  coveredOf: number; covered: number; coveredPct: number | null;
  uncoveredAtStart: number; uncovered90: number;
  medianWaitMin: number | null; waitCount: number;
  done: number; missed: number; cancelled: number; open: number;
  cancelledBy: Record<CancelRole, number>;
  food: { small: number; large: number; weighed: number; lbs: number };
  activeDrivers: number; newDrivers: number; lapsedDrivers: number;
  top5Share: number | null; storesGave: number;
  textsSent: number; textsFailed: number; textsFailedPct: number | null;
  appOpens: number;
};
type WeekPoint = { weekStart: string; pickups: number; coveredPct: number | null; covered: number; coveredOf: number; missed: number; done: number; cancelled: number };
export type NumbersResult = {
  today: string; ms: number;
  periods: { today: PeriodNumbers; yesterday: PeriodNumbers; thisWeek: PeriodNumbers; lastWeek: PeriodNumbers; lastWeekSoFar: PeriodNumbers };
  trend: WeekPoint[]; appOpenersLast7: number;
};
type Settings = { daily: boolean; weekly: boolean; phones: string[] | null; defaultPhones: string[]; phonesInUse: string[]; preview?: { daily: string; weekly: string } };

const shortDay = (ymd: string) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' });
const pctT = (p: number | null) => (p == null ? '–' : `${p}%`);
const waitT = (m: number | null) => (m == null ? '–' : m < 60 ? `${m} min` : m < 1440 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}` : `${(m / 1440).toFixed(1)} days`);
const phoneT = (p: string) => { const d = p.replace(/\D/g, '').slice(-10); return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : p; };

type Row = {
  label: string; hint?: string;
  value: (p: PeriodNumbers) => string;
  num?: (p: PeriodNumbers) => number | null; // for the this-week vs last-week arrow
  good?: 'up' | 'down';
  sub?: boolean;
};
type Group = { title: string; rows: Row[] };

const GROUPS: Group[] = [
  { title: 'Pickups', rows: [
    { label: 'Pickups', value: (p) => `${p.pickups}`, num: (p) => p.pickups },
    { label: 'One-time', value: (p) => `${p.oneTime}`, sub: true },
    { label: 'Steady', value: (p) => `${p.steady}`, sub: true },
    { label: 'Deliveries', value: (p) => `${p.delivery}`, sub: true },
  ] },
  { title: 'Drivers on time', rows: [
    { label: 'Covered on time', hint: 'A driver was on it at its start time (of the pickups whose time has come and that weren\'t cancelled before it).', value: (p) => (p.coveredOf ? `${pctT(p.coveredPct)} (${p.covered} of ${p.coveredOf})` : '–'), num: (p) => p.coveredPct, good: 'up' },
    { label: 'Time to get a driver', hint: 'Typical (middle) wait from the first text (or posting) until a driver took it. Same rule as "Typical wait until taken" in Reports.', value: (p) => waitT(p.medianWaitMin), num: (p) => p.medianWaitMin, good: 'down' },
    { label: 'No driver at start time', value: (p) => `${p.uncoveredAtStart}`, num: (p) => p.uncoveredAtStart, good: 'down' },
    { label: 'Still no driver 90 min late', value: (p) => `${p.uncovered90}`, num: (p) => p.uncovered90, good: 'down' },
  ] },
  { title: 'How it ended', rows: [
    { label: 'Done', value: (p) => `${p.done}`, num: (p) => p.done, good: 'up' },
    { label: 'Missed', value: (p) => `${p.missed}`, num: (p) => p.missed, good: 'down' },
    { label: 'Cancelled', value: (p) => `${p.cancelled}`, num: (p) => p.cancelled, good: 'down' },
    { label: 'by the store', value: (p) => `${p.cancelledBy.store}`, sub: true },
    { label: 'by the office', value: (p) => `${p.cancelledBy.office}`, sub: true },
    { label: 'automatic (no driver)', value: (p) => `${p.cancelledBy.auto}`, sub: true },
    { label: 'by a driver / not known', value: (p) => `${p.cancelledBy.driver + p.cancelledBy.other}`, sub: true },
    { label: 'Not closed yet', value: (p) => `${p.open}` },
  ] },
  { title: 'Food rescued', rows: [
    { label: 'Size (small / large)', hint: 'From the close-out size. Empty until drivers / the office record it.', value: (p) => (p.food.small + p.food.large ? `${p.food.small} / ${p.food.large}` : '–') },
    { label: 'Weight', value: (p) => (p.food.weighed ? `${p.food.lbs} lbs (${p.food.weighed} weighed)` : '–') },
  ] },
  { title: 'Drivers and stores', rows: [
    { label: 'Active drivers', hint: 'Did 1 or more pickups.', value: (p) => `${p.activeDrivers}`, num: (p) => p.activeDrivers, good: 'up' },
    { label: 'New drivers', hint: 'Added in this period.', value: (p) => `${p.newDrivers}`, num: (p) => p.newDrivers, good: 'up' },
    { label: 'Lapsed 30+ days', hint: 'Did a pickup in the 60 days before, but none in the last 30 days (as of the last day of the period).', value: (p) => `${p.lapsedDrivers}`, num: (p) => p.lapsedDrivers, good: 'down' },
    { label: 'Top 5 drivers\' share', hint: 'Share of the pickups done by the 5 busiest drivers. High = a few people carry the load.', value: (p) => pctT(p.top5Share) },
    { label: 'Stores that gave', value: (p) => `${p.storesGave}`, num: (p) => p.storesGave, good: 'up' },
  ] },
  { title: 'Texts and app', rows: [
    { label: 'Texts sent', value: (p) => `${p.textsSent}` },
    { label: 'Texts failed', value: (p) => (p.textsSent + p.textsFailed ? `${pctT(p.textsFailedPct)} (${p.textsFailed})` : '–'), num: (p) => p.textsFailedPct, good: 'down' },
    { label: 'App opens', hint: 'Driver-days: each driver counted once per day they opened the driver app.', value: (p) => `${p.appOpens}`, num: (p) => p.appOpens, good: 'up' },
  ] },
];

function Arrow({ a, b, good }: { a: number | null; b: number | null; good?: 'up' | 'down' }) {
  if (a == null || b == null || a === b) return null;
  const up = a > b;
  const ok = good ? (good === 'up') === up : null;
  return <span className={`ml-1 text-[11px] ${ok == null ? 'text-muted' : ok ? 'text-forest' : 'text-clay'}`} title={`Last week, same days: ${b}`}>{up ? '▲' : '▼'}</span>;
}

function Bars({ title, weeks, val, fmt, bad }: { title: string; weeks: WeekPoint[]; val: (w: WeekPoint) => number | null; fmt: (n: number) => string; bad?: (n: number) => boolean }) {
  const vals = weeks.map(val);
  const max = Math.max(1, ...vals.map((v) => v ?? 0));
  return (
    <div className="flex-1 min-w-[260px]">
      <div className="text-[12.5px] font-bold text-ink mb-1">{title}</div>
      <div className="flex items-end gap-1.5 h-[110px]" role="img" aria-label={`${title}: ${weeks.map((w, i) => `${shortDay(w.weekStart)} ${vals[i] == null ? 'none' : fmt(vals[i]!)}`).join('; ')}`}>
        {weeks.map((w, i) => {
          const v = vals[i];
          const h = v == null ? 0 : Math.max(3, Math.round((v / max) * 88));
          return (
            <div key={w.weekStart} className="flex-1 flex flex-col items-center justify-end h-full" title={`Week of ${shortDay(w.weekStart)}: ${v == null ? 'none' : fmt(v)} · ${w.pickups} pickups`}>
              <div className="text-[10.5px] text-ink tabular-nums mb-0.5">{v == null ? '' : fmt(v)}</div>
              <div className={`w-full max-w-[28px] rounded-t-[4px] ${v != null && bad?.(v) ? 'bg-clay/80' : i === weeks.length - 1 ? 'bg-forest/50' : 'bg-forest'}`} style={{ height: h }} />
            </div>
          );
        })}
      </div>
      <div className="flex gap-1.5 mt-1">
        {weeks.map((w, i) => <div key={w.weekStart} className="flex-1 text-center text-[10px] text-muted">{i === weeks.length - 1 ? 'now' : shortDay(w.weekStart)}</div>)}
      </div>
    </div>
  );
}

export function NumbersPage({ canEditSettings = true }: { canEditSettings?: boolean }) {
  const q = useQuery({ queryKey: ['numbers'], queryFn: () => api<{ data: NumbersResult }>('/api/numbers').then((r) => r.data), staleTime: 60_000 });
  const d = q.data;
  const cols = d ? [d.periods.today, d.periods.yesterday, d.periods.thisWeek, d.periods.lastWeek] : [];
  const lw = d?.periods.lastWeekSoFar;
  return (
    <div className="space-y-3 max-w-[980px]" data-numbers-page>
      <div className="rounded-[14px] border border-line bg-paper p-3.5">
        <div className="text-[15px] font-bold text-ink">📊 Numbers</div>
        <div className="text-[12.5px] text-muted mt-0.5">
          Counts only, New York days, weeks start Sunday. ▲▼ = this week vs last week on the same days{lw ? ` (${shortDay(lw.from)}–${shortDay(lw.to)})` : ''}: green is better, red is worse.
          {d?.appOpenersLast7 != null ? ` ${d.appOpenersLast7} drivers opened the app in the last 7 days.` : ''}
        </div>
      </div>
      {q.isLoading && <div className="text-[13px] text-muted">Loading…</div>}
      {q.isError && <div className="text-[13px] text-clay">Couldn't load the numbers.</div>}
      {d && (
        <div className="rounded-[14px] border border-line bg-paper overflow-x-auto">
          <table className="w-full text-[13px] tabular-nums">
            <thead>
              <tr className="text-left text-[12px] text-muted border-b border-line">
                <th className="py-2 px-3 font-semibold">&nbsp;</th>
                {cols.map((c) => (
                  <th key={c.key} className="py-2 px-3 font-semibold text-right whitespace-nowrap">
                    <div className="text-ink">{c.label}</div>
                    <div className="font-normal text-[11px]">{c.from === c.to ? shortDay(c.from) : `${shortDay(c.from)}–${shortDay(c.to)}`}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {GROUPS.map((g) => (
                <GroupRows key={g.title} g={g} cols={cols} lw={lw!} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {d && (
        <div className="rounded-[14px] border border-line bg-paper p-3.5">
          <div className="text-[14px] font-bold text-ink mb-2">Last 8 weeks</div>
          <div className="flex flex-wrap gap-6">
            <Bars title="Covered on time" weeks={d.trend} val={(w) => w.coveredPct} fmt={(n) => `${n}%`} bad={(n) => n < 60} />
            <Bars title="Missed" weeks={d.trend} val={(w) => (w.pickups ? w.missed : null)} fmt={(n) => `${n}`} bad={(n) => n >= 10} />
          </div>
          <div className="text-[11.5px] text-muted mt-2">The last bar is this week so far. Red: under 60% covered, or 10+ missed in a week.</div>
        </div>
      )}
      {canEditSettings && <SummarySettingsBox />}
    </div>
  );
}

function GroupRows({ g, cols, lw }: { g: Group; cols: PeriodNumbers[]; lw: PeriodNumbers }) {
  return (
    <>
      <tr><td colSpan={cols.length + 1} className="pt-3 pb-1 px-3 text-[11.5px] font-bold uppercase tracking-wide text-muted">{g.title}</td></tr>
      {g.rows.map((r) => (
        <tr key={r.label} className="border-t border-line/60">
          <td className={`py-1.5 px-3 ${r.sub ? 'pl-7 text-muted' : 'text-ink'}`} title={r.hint}>
            {r.label}{r.hint && <span className="text-muted text-[11px]"> ⓘ</span>}
          </td>
          {cols.map((c) => (
            <td key={c.key} className={`py-1.5 px-3 text-right whitespace-nowrap ${r.sub ? 'text-muted' : 'text-ink'}`}>
              {r.value(c)}
              {c.key === 'thisWeek' && r.num && <Arrow a={r.num(c)} b={r.num(lw)} good={r.good} />}
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

function SummarySettingsBox() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['numbers-settings'], queryFn: () => api<{ data: Settings }>('/api/numbers/settings').then((r) => r.data), staleTime: 60_000 });
  const [daily, setDaily] = useState(true);
  const [weekly, setWeekly] = useState(true);
  const [phones, setPhones] = useState('');
  useEffect(() => {
    if (!q.data) return;
    setDaily(q.data.daily); setWeekly(q.data.weekly);
    setPhones((q.data.phones ?? []).map(phoneT).join('\n'));
  }, [q.data]);
  const save = useMutation({
    mutationFn: () => api<{ data: Settings }>('/api/numbers/settings', {
      method: 'PUT',
      body: JSON.stringify({ daily, weekly, phones: phones.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean) }),
    }).then((r) => r.data),
    onSuccess: (s) => { qc.setQueryData(['numbers-settings'], (old: Settings | undefined) => ({ ...old, ...s })); uiNotify('Saved.', 'ok'); },
    onError: (e: any) => uiNotify(e?.message || "Couldn't save. Try again.", 'err'),
  });
  const s = q.data;
  return (
    <div className="rounded-[14px] border border-line bg-paper p-3.5 space-y-2.5" data-numbers-settings>
      <div className="text-[14px] font-bold text-ink">Daily summary</div>
      <div className="text-[12.5px] text-muted">
        Every evening at 9:15 PM: one bell alert for admins and one short text. Never on Shabbos or Yom Tov: Friday's goes out Motzei Shabbos at about 9 PM. Every Sunday at 9 AM: last week vs the week before.
      </div>
      <label className="flex items-center gap-2 text-[13px] text-ink">
        <input type="checkbox" checked={daily} onChange={(e) => setDaily(e.target.checked)} /> Daily summary (9:15 PM)
      </label>
      <label className="flex items-center gap-2 text-[13px] text-ink">
        <input type="checkbox" checked={weekly} onChange={(e) => setWeekly(e.target.checked)} /> Sunday weekly summary (9 AM)
      </label>
      <div>
        <div className="text-[13px] font-semibold text-ink">Daily summary to</div>
        <textarea value={phones} onChange={(e) => setPhones(e.target.value)} rows={3}
                  placeholder={s ? `Empty = the office numbers: ${s.defaultPhones.map(phoneT).join(', ')}` : 'One phone per line'}
                  className="mt-1 w-full max-w-[420px] rounded-[10px] border border-line bg-paper px-3 py-2 text-[13px]" />
        <div className="text-[11.5px] text-muted">One phone per line. Empty = the office numbers{s ? `: ${s.defaultPhones.map(phoneT).join(', ')}` : ''}.{s ? ` Now goes to: ${s.phonesInUse.map(phoneT).join(', ') || 'nobody'}.` : ''}</div>
      </div>
      <button type="button" onClick={() => save.mutate()} disabled={save.isPending || !s}
              className="haptic rounded-[10px] bg-forest px-3.5 py-2 text-[13px] font-bold text-white disabled:opacity-60">
        {save.isPending ? 'Saving…' : 'Save'}
      </button>
      {s?.preview && (
        <div className="text-[12.5px] text-muted space-y-1 pt-1 border-t border-line">
          <div><b className="text-ink">Tonight's text would say:</b> {s.preview.daily}</div>
          <div><b className="text-ink">Sunday's text would say:</b> {s.preview.weekly}</div>
        </div>
      )}
    </div>
  );
}
