/**
 * Oct 14 client: Reports → "Typical wait until taken" tile and its drill-down:
 * a weekly chart (median wait per Sun–Sat week, getting faster or slower?) and
 * each pickup with how long it waited, sortable, with CSV export.
 * Data: GET /api/reports/take-wait (same filters as the other tiles). The rule is
 * the same as the driver / store "usually takes…" lines (API take-wait.ts).
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { cx } from './design';
import { fmtDateTimeEastern, fmtDay } from './time-format';
import { afterText } from './response-times';

export type TakeWaitRow = {
  pickupId: number; ref: string | null; date: string; driverId: number; driver: string; store: string;
  offeredAt: string; offeredBy: 'text' | 'posted'; tookAt: string; minutes: number; gaveBack: boolean;
};
export type TakeWaitWeek = { weekStart: string; median: number | null; count: number };
export type TakeWaitData = {
  summary: { median: number | null; mean: number | null; count: number };
  weeks: TakeWaitWeek[]; rows: TakeWaitRow[]; from: string; to: string; chartFrom: string;
};

/** Same filters as the tiles (status is ignored by the API). */
export function useTakeWait(qs: URLSearchParams) {
  const params = new URLSearchParams(qs);
  params.delete('status');
  return useQuery({
    queryKey: ['reports-take-wait', params.toString()],
    queryFn: () => api<{ data: TakeWaitData }>(`/api/reports/take-wait?${params}`).then((r) => r.data),
    placeholderData: (prev) => prev,
  });
}

export const waitText = (m: number | null | undefined) => (m == null ? '—' : afterText(m));

/** Tile in the Reports tile row (same look as StatTile, with a subline). */
export function TakeWaitTile({ data, loading, onClick }: { data?: TakeWaitData; loading?: boolean; onClick: () => void }) {
  const s = data?.summary;
  return (
    <button type="button" onClick={onClick}
            className="text-left rounded-[14px] border-2 px-4 py-3 haptic transition hover:-translate-y-0.5 hover:shadow-soft bg-sky-soft border-sky/30 text-[#1d4a6a]">
      <div className="font-display font-bold text-[28px] leading-none">{loading && !data ? '…' : waitText(s?.median)}</div>
      <div className="text-[12.5px] font-bold mt-1.5">Typical wait until taken</div>
      <div className="text-[11px] font-semibold opacity-80 mt-0.5 tabular-nums">
        {s && s.count > 0 ? `avg ${waitText(s.mean)} · ${s.count} pickup${s.count === 1 ? '' : 's'}` : 'no pickups taken by drivers'}
      </div>
    </button>
  );
}

const shortDay = (ymd: string) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const nyTodayStr = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
const weekOf = (ymd: string) => { const d = new Date(`${ymd}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - d.getUTCDay()); return d.toISOString().slice(0, 10); };

/** "↓ 12 min faster than the week before" for the latest week with pickups. */
function trend(weeks: TakeWaitWeek[]) {
  const withData = weeks.filter((w) => w.median != null && w.count > 0);
  if (withData.length < 2) return null;
  const a = withData[withData.length - 1]!, b = withData[withData.length - 2]!;
  const diff = Math.round(a.median! - b.median!);
  const thisWeek = weekOf(nyTodayStr());
  const name = (w: TakeWaitWeek) => (w.weekStart === thisWeek ? 'this week (so far)' : `the week of ${shortDay(w.weekStart)}`);
  return { diff, a, b, label: `${name(a).replace(/^./, (c) => c.toUpperCase())} vs ${name(b)}` };
}

function WeeklyChart({ weeks }: { weeks: TakeWaitWeek[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 680, H = 210, L = 52, R = 10, T = 22, B = 40;
  const max = Math.max(10, ...weeks.map((w) => w.median ?? 0));
  // nice top value for the axis
  const steps = [10, 15, 20, 30, 45, 60, 90, 120, 180, 240, 360, 480, 720, 1440, 2880, 4320, 10080];
  const top = steps.find((s) => s >= max) ?? max;
  const n = Math.max(1, weeks.length);
  const slot = (W - L - R) / n;
  const bw = Math.max(4, Math.min(36, slot - 6));
  const y = (m: number) => T + (H - T - B) * (1 - m / top);
  const every = n > 26 ? 4 : n > 14 ? 2 : 1;
  const lastIdx = (() => { for (let i = weeks.length - 1; i >= 0; i--) if (weeks[i]!.count > 0) return i; return -1; })();
  const show = hover ?? lastIdx;
  const sw = show >= 0 ? weeks[show] : null;
  return (
    <div>
      <div className="text-[12.5px] text-muted min-h-[18px] tabular-nums" aria-live="polite">
        {sw ? <>Week of <b className="text-ink">{shortDay(sw.weekStart)}</b>: {sw.count > 0
          ? <>typical wait <b className="text-ink">{waitText(sw.median)}</b> · {sw.count} pickup{sw.count === 1 ? '' : 's'}</>
          : 'no pickups taken by drivers'}</> : 'No pickups taken by drivers in these weeks.'}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img"
           aria-label={`Typical wait until taken, per week: ${weeks.map((w) => `${shortDay(w.weekStart)} ${w.count ? waitText(w.median) : 'none'}`).join('; ')}`}
           onMouseLeave={() => setHover(null)}>
        {[0, top / 2, top].map((g) => (
          <g key={g}>
            <line x1={L} x2={W - R} y1={y(g)} y2={y(g)} className="stroke-line" strokeWidth={1} />
            <text x={L - 6} y={y(g) + 4} textAnchor="end" className="fill-muted" fontSize={11}>{g === 0 ? '0' : waitText(g)}</text>
          </g>
        ))}
        {weeks.map((w, i) => {
          const cx0 = L + slot * i + slot / 2;
          const has = w.median != null && w.count > 0;
          const h = has ? Math.max(2, y(0) - y(w.median!)) : 0;
          const active = i === show;
          return (
            <g key={w.weekStart} onMouseEnter={() => setHover(i)} onClick={() => setHover(i)} style={{ cursor: 'default' }}>
              <rect x={L + slot * i} y={T} width={slot} height={H - T - B + 30} fill="transparent" />
              {has ? (
                <path d={`M${cx0 - bw / 2},${y(0)} V${y(0) - h + Math.min(4, h)} q0,-${Math.min(4, h)} ${Math.min(4, bw / 2)},-${Math.min(4, h)} H${cx0 + bw / 2 - Math.min(4, bw / 2)} q${Math.min(4, bw / 2)},0 ${Math.min(4, bw / 2)},${Math.min(4, h)} V${y(0)} Z`}
                      className={active ? 'fill-forest' : 'fill-forest/60'} />
              ) : (
                <line x1={cx0 - 4} x2={cx0 + 4} y1={y(0) - 1} y2={y(0) - 1} className="stroke-muted" strokeWidth={2} />
              )}
              {has && active && (
                <text x={cx0} y={y(0) - h - 6} textAnchor="middle" className="fill-ink" fontSize={11.5} fontWeight={700}>{waitText(w.median)}</text>
              )}
              {i % every === 0 && (
                <text x={cx0} y={H - B + 15} textAnchor="middle" className={active ? 'fill-ink' : 'fill-muted'} fontSize={10.5}>{shortDay(w.weekStart)}</text>
              )}
              {i % every === 0 && (
                <text x={cx0} y={H - B + 29} textAnchor="middle" className="fill-muted" fontSize={9.5}>{w.count ? `${w.count}` : ''}</text>
              )}
              <title>{`Week of ${shortDay(w.weekStart)}: ${w.count ? `typical ${waitText(w.median)} · ${w.count} pickups` : 'none'}`}</title>
            </g>
          );
        })}
        <text x={L - 6} y={H - B + 29} textAnchor="end" className="fill-muted" fontSize={9.5}>pickups</text>
      </svg>
    </div>
  );
}

type SortKey = 'newest' | 'slowest' | 'fastest';

export function TakeWaitModal({ data, loading, onClose }: { data?: TakeWaitData; loading?: boolean; onClose: () => void }) {
  const [sort, setSort] = useState<SortKey>('slowest');
  const rows = useMemo(() => {
    const r = [...(data?.rows ?? [])];
    if (sort === 'slowest') r.sort((a, b) => b.minutes - a.minutes);
    else if (sort === 'fastest') r.sort((a, b) => a.minutes - b.minutes);
    else r.sort((a, b) => (a.tookAt < b.tookAt ? 1 : -1));
    return r;
  }, [data, sort]);
  const t = data ? trend(data.weeks) : null;
  const s = data?.summary;

  function exportCsv() {
    const head = ['Pickup #', 'Date', 'Store / donor', 'Texted or posted', 'How', 'Taken at', 'Taken by', 'Wait (min)', 'Wait'];
    const lines = rows.map((r) => [
      r.ref ?? r.pickupId, r.date, r.store, fmtDateTimeEastern(r.offeredAt), r.offeredBy === 'text' ? 'texted' : 'posted',
      fmtDateTimeEastern(r.tookAt), r.driver, Math.round(r.minutes), waitText(r.minutes),
    ].map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','));
    const blob = new Blob([[head.join(','), ...lines].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `zlz-wait-until-taken-${data?.from ?? ''}_${data?.to ?? ''}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  const th = 'px-3 py-2 text-left text-[11px] font-extrabold uppercase tracking-[.05em] text-muted whitespace-nowrap';
  const sortBtn = (k: SortKey, label: string) => (
    <button key={k} onClick={() => setSort(k)} aria-pressed={sort === k}
            className={cx('haptic text-[12px] font-bold rounded-full px-3 py-1', sort === k ? 'bg-forest text-paper' : 'bg-sage/60 text-forest hover:bg-sage')}>{label}</button>
  );
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-paper rounded-[16px] border border-line max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col"
           role="dialog" aria-label="Typical wait until taken" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-line flex items-start justify-between gap-3">
          <div>
            <div className="font-display font-bold text-[18px] text-ink">
              Typical wait until taken: {waitText(s?.median)}
            </div>
            <div className="text-[12px] text-muted tabular-nums">
              {s && s.count > 0 ? `Average ${waitText(s.mean)} · ${s.count} pickup${s.count === 1 ? '' : 's'}` : 'No pickups taken by drivers'}
              {data ? ` · ${fmtDay(data.from)} – ${fmtDay(data.to)}` : ''}
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="haptic text-muted hover:text-ink text-[22px] leading-none px-1">×</button>
        </div>
        <div className="overflow-y-auto p-4 space-y-4">
          {loading && !data ? <div className="text-[13.5px] text-muted py-6 text-center">Loading…</div> : data && (
            <>
              <section className="rounded-[14px] border border-line p-3 space-y-2" data-qa="take-wait-chart">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-[13px] font-extrabold uppercase tracking-[.06em] text-muted">Each week — getting faster or slower?</div>
                  {t && (
                    <div className={cx('text-[12.5px] font-bold rounded-full px-3 py-1',
                                       t.diff < 0 ? 'bg-sage text-forest' : t.diff > 0 ? 'bg-clay-soft text-clay' : 'bg-cream text-muted')}
                         title={t.label}>
                      {t.diff < 0 ? `↓ ${waitText(-t.diff)} faster than the week before` : t.diff > 0 ? `↑ ${waitText(t.diff)} slower than the week before` : 'Same as the week before'}
                    </div>
                  )}
                </div>
                {t && <div className="text-[11.5px] text-muted">{t.label}: {waitText(t.a.median)} vs {waitText(t.b.median)} (typical wait)</div>}
                <WeeklyChart weeks={data.weeks} />
                <div className="text-[11.5px] text-muted">Bars = typical (middle) wait that week, Sun–Sat. Number under each week = pickups counted.</div>
              </section>
              <div className="text-[12.5px] text-ink bg-cream/60 rounded-[10px] px-3 py-2">
                Wait = from when drivers were first texted (or the pickup was posted) until a driver took it. Office-assigned pickups aren't counted.
              </div>
              <section className="rounded-[14px] border border-line overflow-hidden" data-qa="take-wait-table">
                <div className="px-3 py-2 border-b border-line flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-1.5">
                    {sortBtn('slowest', 'Slowest first')}{sortBtn('fastest', 'Fastest first')}{sortBtn('newest', 'Newest first')}
                  </div>
                  <button onClick={exportCsv} disabled={rows.length === 0}
                          className="haptic bg-forest text-paper font-bold text-[13px] rounded-[10px] px-3 py-1.5 disabled:opacity-40">⬇ Export CSV</button>
                </div>
                {rows.length === 0 ? (
                  <div className="text-[13.5px] text-muted py-6 text-center">No pickups taken by drivers in this range.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-[13px]">
                      <thead className="border-b border-line bg-cream/40"><tr>
                        <th className={th}>Date</th><th className={th}>Store / donor</th><th className={th}>Texted / posted</th>
                        <th className={th}>Taken at</th><th className={th}>By</th>
                        <th className={th}>
                          <button onClick={() => setSort(sort === 'slowest' ? 'fastest' : 'slowest')} className="uppercase font-extrabold hover:text-ink">
                            Wait {sort === 'slowest' ? '▼' : sort === 'fastest' ? '▲' : ''}
                          </button>
                        </th>
                      </tr></thead>
                      <tbody>
                        {rows.map((r) => (
                          <tr key={r.pickupId} className="border-b border-line/70">
                            <td className="px-3 py-2 whitespace-nowrap">{fmtDay(r.date) || r.date}</td>
                            <td className="px-3 py-2 font-semibold">{r.store}{r.ref ? <span className="text-muted font-normal"> · #{r.ref}</span> : null}</td>
                            <td className="px-3 py-2 whitespace-nowrap tabular-nums">{fmtDateTimeEastern(r.offeredAt)} <span className="text-muted text-[11.5px]">{r.offeredBy === 'text' ? 'texted' : 'posted'}</span></td>
                            <td className="px-3 py-2 whitespace-nowrap tabular-nums">{fmtDateTimeEastern(r.tookAt)}</td>
                            <td className="px-3 py-2 whitespace-nowrap">{r.driver}{r.gaveBack ? <span className="text-muted text-[11.5px]"> (gave it back)</span> : null}</td>
                            <td className="px-3 py-2 whitespace-nowrap font-bold tabular-nums">{waitText(r.minutes)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
