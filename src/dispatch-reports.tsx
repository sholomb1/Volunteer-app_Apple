/**
 * Nov 3 client: Dispatchers → Reports (admins only). Per dispatcher for today / 7 / 31 days: calls answered,
 * missed and called back (how fast), calls from the app, texts sent, To do items handled, pickups assigned and
 * pickups that got a driver on their shift. Calls belong to whoever was on the dispatch shift then.
 * API: GET /api/dispatch/report?days= (routes/dispatch.ts).
 */
import { Fragment, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';

type Row = { name: string; shiftHours: number; answered: number; talkMin: number; missed: number; calledBack: number; callbackMin: number | null;
  outCalls: number; texts: number; handled: number; assigned: number; covered: number; notes: number; summary: string; none: boolean };

// ---- Nov 3 client: busiest hours — incoming calls (and missed) by hour of day and by day of week ----
type Bucket = { calls: number; missed: number };
type Busy = { days: number; calls: number; missed: number; sentence: string; byHour: Array<Bucket & { hour: number }>; byDay: Array<Bucket & { day: number; name: string }> };
const hourLabel = (h: number) => `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`;

/** Plain CSS bars: answered part (green) on top of the missed part (red), 2px gap; hover shows the numbers. */
function Bars({ items, label, tick, height = 120 }: { items: Bucket[]; label: (i: number) => string; tick: (i: number) => string | null; height?: number }) {
  const max = Math.max(1, ...items.map((b) => b.calls));
  return (
    <div>
      <div className="flex items-end gap-[3px] border-b border-line" style={{ height }}>
        {items.map((b, i) => {
          const ans = b.calls - b.missed;
          const tip = `${label(i)}: ${b.calls} call${b.calls === 1 ? '' : 's'} came in${b.missed ? `, ${b.missed} missed` : ''}`;
          return (
            <div key={i} title={tip} aria-label={tip} className="flex-1 h-full flex flex-col justify-end gap-[2px] hover:bg-cream/70 rounded-t-[4px]">
              {ans > 0 && <div className="bg-forest rounded-t-[4px]" style={{ height: `${(ans / max) * (height - 6)}px` }} />}
              {b.missed > 0 && <div className={`bg-clay ${ans > 0 ? '' : 'rounded-t-[4px]'}`} style={{ height: `${(b.missed / max) * (height - 6)}px` }} />}
            </div>
          );
        })}
      </div>
      <div className="flex gap-[3px] mt-1">
        {items.map((_, i) => <div key={i} className="flex-1 text-center text-[10.5px] text-muted whitespace-nowrap overflow-visible">{tick(i) ?? ''}</div>)}
      </div>
    </div>
  );
}

export function BusyHoursChart() {
  const [days, setDays] = useState<7 | 31 | 90>(31);
  const [table, setTable] = useState(false);
  const q = useQuery({ queryKey: ['busy-hours', days], staleTime: 5 * 60_000,
    queryFn: () => api<{ data: Busy }>(`/api/dispatch/busy-hours?days=${days}`) });
  const d = q.data?.data;
  return (
    <section className="rounded-[18px] border border-line bg-paper p-5 space-y-3" data-busy-hours>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-display font-semibold text-[17px] text-ink mr-auto">📈 Busiest times for calls</h3>
        {([7, 31, 90] as const).map((n) => (
          <button key={n} type="button" onClick={() => setDays(n)}
                  className={`px-3 py-1 rounded-full text-[12.5px] font-bold border ${days === n ? 'bg-forest text-paper border-forest' : 'bg-paper border-line'}`}>{n} days</button>
        ))}
      </div>
      {!d && <div className="text-[13px] text-muted">{q.isError ? "Couldn't load it." : 'Loading…'}</div>}
      {d && (<>
        <div className="text-[14px] font-bold text-ink" data-busy-sentence>{d.sentence}</div>
        <div className="flex flex-wrap items-center gap-4 text-[12px] text-muted">
          <span>{d.calls} call{d.calls === 1 ? '' : 's'} came in · {d.missed} missed</span>
          <span className="inline-flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-[3px] bg-forest" /> Answered</span>
          <span className="inline-flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-[3px] bg-clay" /> Missed</span>
        </div>
        <div className="grid gap-6 md:grid-cols-[2fr_1fr]">
          <div>
            <div className="text-[12px] font-bold text-ink mb-1.5">By time of day</div>
            <Bars items={d.byHour} label={(i) => hourLabel(i)} tick={(i) => (i % 3 === 0 ? hourLabel(i) : null)} />
          </div>
          <div>
            <div className="text-[12px] font-bold text-ink mb-1.5">By day of the week</div>
            <Bars items={d.byDay} label={(i) => d.byDay[i]!.name} tick={(i) => d.byDay[i]!.name.slice(0, 3)} />
          </div>
        </div>
        <button type="button" onClick={() => setTable((x) => !x)} className="text-[12px] font-bold text-forest underline">{table ? 'Hide the numbers' : 'See the numbers'}</button>
        {table && (
          <div className="grid gap-4 md:grid-cols-2 text-[12.5px]">
            <table className="w-full"><thead><tr className="text-muted text-left"><th>Time</th><th>Came in</th><th>Missed</th></tr></thead>
              <tbody>{d.byHour.filter((b) => b.calls).map((b) => <tr key={b.hour}><td>{hourLabel(b.hour)}</td><td>{b.calls}</td><td>{b.missed}</td></tr>)}</tbody></table>
            <table className="w-full"><thead><tr className="text-muted text-left"><th>Day</th><th>Came in</th><th>Missed</th></tr></thead>
              <tbody>{d.byDay.map((b) => <tr key={b.day}><td>{b.name}</td><td>{b.calls}</td><td>{b.missed}</td></tr>)}</tbody></table>
          </div>
        )}
      </>)}
    </section>
  );
}

export function DispatchReportsPanel() {
  const [days, setDays] = useState<1 | 7 | 31>(7);
  const q = useQuery({ queryKey: ['dispatch-report', days], staleTime: 60_000,
    queryFn: () => api<{ data: { days: number; rows: Row[] } }>(`/api/dispatch/report?days=${days}`) });
  const rows = q.data?.data.rows ?? [];
  const th = 'px-2 py-2 text-left text-[11px] font-extrabold uppercase tracking-[.05em] text-muted whitespace-nowrap';
  const td = 'px-2 py-2 text-[13px] text-ink whitespace-nowrap';
  return (<>
    <section className="rounded-[18px] border border-line bg-paper p-5 space-y-3" data-dispatch-reports>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-display font-semibold text-[17px] text-ink mr-auto">📊 Dispatcher reports</h3>
        {([1, 7, 31] as const).map((d) => (
          <button key={d} type="button" onClick={() => setDays(d)}
                  className={`px-3 py-1 rounded-full text-[12.5px] font-bold border ${days === d ? 'bg-forest text-paper border-forest' : 'bg-paper border-line'}`}>
            {d === 1 ? 'Today' : `${d} days`}
          </button>
        ))}
      </div>
      <div className="text-[12px] text-muted">Calls count for whoever was on the dispatch shift at that moment (a call answered on a dispatcher's own cell counts for that dispatcher). Texts, to-dos and assigned pickups count for the login that did them.</div>
      {!q.data && <div className="text-[13px] text-muted">{q.isError ? "Couldn't load the report." : 'Loading…'}</div>}
      {q.data && rows.length === 0 && <div className="text-[13px] text-muted">Nothing in this time.</div>}
      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse">
            <thead><tr className="border-b border-line">
              <th className={th}>Dispatcher</th><th className={th}>On shift</th><th className={th}>Answered</th><th className={th}>Missed</th>
              <th className={th}>Called back</th><th className={th}>Call-back time</th><th className={th}>Called out</th><th className={th}>Texts sent</th>
              <th className={th}>To-dos handled</th><th className={th}>Assigned</th><th className={th}>Got a driver on shift</th>
            </tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <Fragment key={i}>
                  <tr className={r.none ? 'text-muted' : ''}>
                    <td className={`${td} font-bold`}>{r.name}</td>
                    <td className={td}>{r.shiftHours ? `${r.shiftHours} h` : '—'}</td>
                    <td className={td}>{r.answered}{r.talkMin ? <span className="text-muted text-[11.5px]"> · {r.talkMin} min talk</span> : null}</td>
                    <td className={`${td} ${r.missed ? 'text-clay font-bold' : ''}`}>{r.missed}</td>
                    <td className={td}>{r.missed ? `${r.calledBack} of ${r.missed}` : '—'}</td>
                    <td className={td}>{r.callbackMin != null ? `${Math.max(1, r.callbackMin)} min` : '—'}</td>
                    <td className={td}>{r.outCalls}</td>
                    <td className={td}>{r.texts}</td>
                    <td className={td}>{r.handled}</td>
                    <td className={td}>{r.assigned}</td>
                    <td className={td}>{r.covered}</td>
                  </tr>
                  <tr className="border-b border-line/70"><td colSpan={11} className="px-2 pb-2 text-[12.5px] text-muted">{r.summary}</td></tr>
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="text-[11.5px] text-muted">How long a call rang before it was answered isn't in the phone system's call history (it gives talk time only), so it isn't shown yet.</div>
    </section>
    <BusyHoursChart />{/* Nov 3 client */}
    </>
  );
}
