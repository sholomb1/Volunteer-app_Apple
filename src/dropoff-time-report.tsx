/**
 * Oct 28 client: Reports → "Time from taking a pickup to drop-off". A driver took a pickup and signed in
 * at the center hours later: the office should call. Tile = average · median · how many over 2 hours;
 * tap = each pickup, longest first (over 2 hours in red), with search, sort and CSV export.
 * A driver's name opens his profile; the store opens the pickup page.
 * Data: GET /api/reports/dropoff-time (same filters as the other tiles). Rule: API dropoff-time.ts.
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { cx } from './design';
import { fmtDateTimeEastern, fmtDay, fmtTime } from './time-format';
import { afterText } from './response-times';
import { tidyPlaceName } from './pickup-label';

export type DropoffRow = {
  pickupId: number; date: string; time: string | null;
  driverId: number | null; driver: string; store: string;
  tookAt: string | null; tookHow: 'accepted' | 'assigned' | 'signed up' | null; tookBy: string | null;
  kioskAt: string; minutes: number | null; fromPickupMin: number | null;
  problem?: 'no-start' | 'negative' | 'over-24h';
};
export type DropoffData = {
  summary: { mean: number | null; median: number | null; count: number; overCall: number; callAfterMin: number;
             pickupMean: number | null; pickupMedian: number | null };
  rows: DropoffRow[]; leftOut: DropoffRow[]; from: string; to: string;
};

/** Same filters as the tiles (status is ignored by the API). */
export function useDropoffTime(qs: URLSearchParams) {
  const params = new URLSearchParams(qs);
  params.delete('status');
  return useQuery({
    queryKey: ['reports-dropoff-time', params.toString()],
    queryFn: () => api<{ data: DropoffData }>(`/api/reports/dropoff-time?${params}`).then((r) => r.data),
    placeholderData: (prev) => prev,
  });
}

export const durText = (m: number | null | undefined) => (m == null ? '—' : afterText(m));
/** "2 hours" / "90 min" for the call line. */
const callText = (m: number) => (m % 60 === 0 ? `${m / 60} hour${m === 60 ? '' : 's'}` : `${m} min`);
/** Pickup time → kiosk can be before the pickup time (picked up early). */
const pickupGap = (m: number | null) => (m == null ? '—' : m < 0 ? `${durText(-m)} early` : durText(m));

const openDriver = (id: number | null) => {
  if (id) window.dispatchEvent(new CustomEvent('zlz:open-volunteer', { detail: { id, tab: 'overview' }, cancelable: true }));
};
const openPickup = (id: number) => window.dispatchEvent(new CustomEvent('zlz:open-pickup', { detail: { id } }));

/** Tile in the Reports tile row (same look as the wait tile). */
export function DropoffTimeTile({ data, loading, onClick }: { data?: DropoffData; loading?: boolean; onClick: () => void }) {
  const s = data?.summary;
  const over = s?.overCall ?? 0;
  return (
    <button type="button" onClick={onClick} data-qa="dropoff-time-tile"
            className="text-left rounded-[14px] border-2 px-4 py-3 haptic transition hover:-translate-y-0.5 hover:shadow-soft bg-sky-soft border-sky/30 text-[#1d4a6a]">
      <div className={cx('font-display font-bold leading-none whitespace-nowrap', durText(s?.mean).length > 7 ? 'text-[22px]' : 'text-[28px]')}>{loading && !data ? '…' : durText(s?.mean)}</div>
      <div className="text-[12.5px] font-bold mt-1.5">Time from taking a pickup to drop-off</div>
      <div className="text-[11px] font-semibold opacity-80 mt-0.5 tabular-nums">
        {s && s.count > 0
          ? <>avg {durText(s.mean)} · median {durText(s.median)} · <span className={over > 0 ? 'text-clay font-bold' : ''}>{over} over {callText(s.callAfterMin)}</span></>
          : 'no kiosk drop-offs'}
      </div>
    </button>
  );
}

type SortKey = 'longest' | 'shortest' | 'newest' | 'pickup';
const HOW: Record<string, string> = { accepted: 'took it', assigned: 'office assigned', 'signed up': 'signed up' };
const PROBLEM: Record<string, string> = {
  'over-24h': 'over 24 hours (usually a standing pickup set days ahead)',
  negative: 'drop-off before it was taken',
  'no-start': 'no time it was taken',
};

export function DropoffTimeModal({ data, loading, onClose }: { data?: DropoffData; loading?: boolean; onClose: () => void }) {
  const [sort, setSort] = useState<SortKey>('longest');
  const [q, setQ] = useState('');
  const [showLeftOut, setShowLeftOut] = useState(false);
  const s = data?.summary;
  const call = s?.callAfterMin ?? 120;
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    const r = (data?.rows ?? []).filter((x) => !t || `${x.driver} ${x.store} ${x.tookBy ?? ''} ${fmtDay(x.date)}`.toLowerCase().includes(t));
    const n = (m: number | null) => m ?? -Infinity;
    if (sort === 'longest') r.sort((a, b) => n(b.minutes) - n(a.minutes));
    else if (sort === 'shortest') r.sort((a, b) => n(a.minutes) - n(b.minutes));
    else if (sort === 'pickup') r.sort((a, b) => n(b.fromPickupMin) - n(a.fromPickupMin));
    else r.sort((a, b) => (a.kioskAt < b.kioskAt ? 1 : -1));
    return r;
  }, [data, sort, q]);

  function exportCsv() {
    const head = ['Date', 'Pickup time', 'Store / place', 'Driver', 'Accepted the pickup', 'How', 'Kiosk sign-in', 'Accepted to kiosk (min)', 'Total from pickup time (min)'];
    const csvAt = (x: string | null | undefined) => { const d = x ? new Date(x) : null; return d && !Number.isNaN(d.getTime()) ? d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/New_York' }) : ''; };
    const lines = rows.map((r) => [
      r.date, fmtTime(r.time), r.store, r.driver + (r.tookBy ? ` (taken by ${r.tookBy})` : ''),
      csvAt(r.tookAt), HOW[r.tookHow ?? ''] ?? '', csvAt(r.kioskAt), r.minutes ?? '', r.fromPickupMin ?? '',
    ].map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','));
    const blob = new Blob([[head.join(','), ...lines].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `zlz-time-to-dropoff-${data?.from ?? ''}_${data?.to ?? ''}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  const th = 'px-3 py-2 text-left text-[11px] font-extrabold uppercase tracking-[.05em] text-muted whitespace-nowrap';
  const sortBtn = (k: SortKey, label: string) => (
    <button key={k} onClick={() => setSort(k)} aria-pressed={sort === k}
            className={cx('haptic text-[12px] font-bold rounded-full px-3 py-1', sort === k ? 'bg-forest text-paper' : 'bg-sage/60 text-forest hover:bg-sage')}>{label}</button>
  );
  const link = 'haptic font-semibold text-left hover:underline underline-offset-2';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-paper rounded-[16px] border border-line max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col"
           role="dialog" aria-label="Time from taking a pickup to drop-off" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-line flex items-start justify-between gap-3">
          <div>
            <div className="font-display font-bold text-[18px] text-ink">
              Time from taking a pickup to drop-off: avg {durText(s?.mean)}
            </div>
            <div className="text-[12px] text-muted tabular-nums">
              {s && s.count > 0
                ? <>Median {durText(s.median)} · {s.count} pickup{s.count === 1 ? '' : 's'} · <b className={s.overCall > 0 ? 'text-clay' : ''}>{s.overCall} over {callText(call)}</b>
                    {s.pickupMean != null ? <> · pickup time to drop-off: avg {durText(s.pickupMean)}, median {durText(s.pickupMedian)}</> : null}</>
                : 'No kiosk drop-offs'}
              {data ? ` · ${fmtDay(data.from)} – ${fmtDay(data.to)}` : ''}
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="haptic text-muted hover:text-ink text-[22px] leading-none px-1">×</button>
        </div>
        <div className="overflow-y-auto p-4 space-y-4">
          {loading && !data ? <div className="text-[13.5px] text-muted py-6 text-center">Loading…</div> : data && (
            <>
              <div className="text-[12.5px] text-ink bg-cream/60 rounded-[10px] px-3 py-2">
                From when the driver took the pickup (or the office gave it to him) until he signed in at the center.
                Over {callText(call)} <span className="text-clay font-bold">(red)</span> = the office should call him.
                Pickups with no kiosk sign-in aren't counted.
              </div>
              <section className="rounded-[14px] border border-line overflow-hidden" data-qa="dropoff-time-table">
                <div className="px-3 py-2 border-b border-line flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {sortBtn('longest', 'Longest first')}{sortBtn('shortest', 'Shortest first')}{sortBtn('newest', 'Newest first')}{sortBtn('pickup', 'Longest total from pickup time')}
                  </div>
                  <div className="flex items-center gap-2">
                    <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search driver or store…"
                           className="text-[13px] rounded-[10px] border border-line bg-paper px-3 py-1.5 w-[200px]" aria-label="Search" />
                    <button onClick={exportCsv} disabled={rows.length === 0}
                            className="haptic bg-forest text-paper font-bold text-[13px] rounded-[10px] px-3 py-1.5 disabled:opacity-40">⬇ Export CSV</button>
                  </div>
                </div>
                {rows.length === 0 ? (
                  <div className="text-[13.5px] text-muted py-6 text-center">{q.trim() ? 'Nothing matches the search.' : 'No kiosk drop-offs in this range.'}</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-[13px]">
                      <thead className="border-b border-line bg-cream/40"><tr>
                        <th className={th}>Date</th><th className={th}>Store / place</th><th className={th}>Driver</th>
                        <th className={th}>Accepted the pickup</th><th className={th}>Kiosk sign-in</th>
                        <th className={th}>
                          <button onClick={() => setSort(sort === 'longest' ? 'shortest' : 'longest')} className="uppercase font-extrabold hover:text-ink">
                            Accepted → kiosk {sort === 'longest' ? '▼' : sort === 'shortest' ? '▲' : ''}
                          </button>
                        </th>
                        <th className={th}>Total from pickup time</th>{/* Oct 29 client: clearer column names */}
                      </tr></thead>
                      <tbody>
                        {rows.map((r) => {
                          const late = (r.minutes ?? 0) > call;
                          return (
                            <tr key={r.pickupId} className={cx('border-b border-line/70', late && 'bg-clay-soft/40')}>
                              <td className="px-3 py-2 whitespace-nowrap">{fmtDay(r.date) || r.date}{r.time ? <span className="text-muted text-[11.5px]"> {fmtTime(r.time)}</span> : null}</td>
                              <td className="px-3 py-2">
                                <button type="button" onClick={() => openPickup(r.pickupId)} className={cx(link, 'text-ink')} title="Open the pickup">
                                  <bdi dir="auto">{tidyPlaceName(r.store) || r.store}</bdi>
                                </button>
                              </td>
                              <td className="px-3 py-2 whitespace-nowrap">
                                {r.driverId
                                  ? <button type="button" onClick={() => openDriver(r.driverId)} className={cx(link, 'text-forest')} title="Open the driver"><bdi dir="auto">{r.driver}</bdi></button>
                                  : <bdi dir="auto">{r.driver}</bdi>}
                                {r.tookBy ? <div className="text-muted text-[11.5px]">covering — taken by <bdi dir="auto">{r.tookBy}</bdi></div> : null}
                              </td>
                              <td className="px-3 py-2 whitespace-nowrap tabular-nums">{fmtDateTimeEastern(r.tookAt)} <span className="text-muted text-[11.5px]">{HOW[r.tookHow ?? ''] ?? ''}</span></td>
                              <td className="px-3 py-2 whitespace-nowrap tabular-nums">{fmtDateTimeEastern(r.kioskAt)}</td>
                              <td className={cx('px-3 py-2 whitespace-nowrap font-bold tabular-nums', late ? 'text-clay' : 'text-ink')}>{durText(r.minutes)}</td>
                              <td className="px-3 py-2 whitespace-nowrap tabular-nums text-muted">{pickupGap(r.fromPickupMin)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
              {data.leftOut.length > 0 && (
                <section className="rounded-[14px] border border-line" data-qa="dropoff-time-leftout">
                  <button type="button" onClick={() => setShowLeftOut(!showLeftOut)} aria-expanded={showLeftOut}
                          className="haptic w-full text-left px-3 py-2 text-[12.5px] font-bold text-muted hover:text-ink">
                    {showLeftOut ? '▾' : '▸'} {data.leftOut.length} left out of the numbers — the times don't make sense
                  </button>
                  {showLeftOut && (
                    <ul className="px-3 pb-3 space-y-1 text-[12.5px]">
                      {data.leftOut.map((r) => (
                        <li key={r.pickupId} className="flex flex-wrap gap-x-2">
                          <span className="whitespace-nowrap">{fmtDay(r.date) || r.date}</span>
                          <button type="button" onClick={() => openPickup(r.pickupId)} className={cx(link, 'text-ink')}><bdi dir="auto">{tidyPlaceName(r.store) || r.store}</bdi></button>
                          {r.driverId
                            ? <button type="button" onClick={() => openDriver(r.driverId)} className={cx(link, 'text-forest')}><bdi dir="auto">{r.driver}</bdi></button>
                            : <bdi dir="auto">{r.driver}</bdi>}
                          <span className="text-muted">{PROBLEM[r.problem ?? ''] ?? ''}{r.tookAt ? ` · taken ${fmtDateTimeEastern(r.tookAt)}` : ''} · kiosk {fmtDateTimeEastern(r.kioskAt)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
