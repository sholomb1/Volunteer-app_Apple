/**
 * Oct 29 client (Yakov, dispatcher): Reports → "Can't reach: N drivers (14 days)". A driver had texted
 * STOP, so the office couldn't text him, and he has no app: nobody noticed. Tile = how many active
 * drivers got no text, no WhatsApp and didn't open the app in the last 14 days; tap = the list, worst
 * first (never reached, then longest ago), with the reason in plain words, 📞 Call and his driver card.
 * Search, sort and CSV like the other report lists. Always the last 14 days (not the report's dates).
 * Data: GET /api/reports/cant-reach. Rule: API cant-reach.ts.
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { cx } from './design';
import { fmtDateTimeEastern } from './time-format';

export type CantReachRow = {
  id: number; name: string; status: string;
  phone: string | null; tel: string | null;
  lastAt: string | null; lastHow: 'text' | 'WhatsApp' | 'app' | null;
  code: string; reason: string;
};
export type CantReachData = { count: number; days: number; rows: CantReachRow[] };

export function useCantReach() {
  return useQuery({
    queryKey: ['reports-cant-reach'],
    queryFn: () => api<{ data: CantReachData }>('/api/reports/cant-reach').then((r) => r.data),
    staleTime: 5 * 60_000,
    placeholderData: (prev) => prev,
  });
}

const DAY = 86_400_000;
/** "23 days ago" / "never". */
function agoDays(iso: string | null): string {
  if (!iso) return 'never';
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / DAY);
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`;
}
const HOW: Record<string, string> = { text: '💬 text', WhatsApp: '🟢 WhatsApp', app: '📱 app' };
const openDriver = (id: number) =>
  window.dispatchEvent(new CustomEvent('zlz:open-volunteer', { detail: { id, tab: 'overview' }, cancelable: true }));

/** Tile in the Reports tile row. */
export function CantReachTile({ data, loading, onClick }: { data?: CantReachData; loading?: boolean; onClick: () => void }) {
  const n = data?.count ?? 0;
  const tone = n > 0 ? 'bg-clay-soft border-clay/30 text-clay' : 'bg-sage border-sage-line text-forest';
  return (
    <button type="button" onClick={onClick} data-qa="cant-reach-tile"
            className={cx('text-left rounded-[14px] border-2 px-4 py-3 haptic transition hover:-translate-y-0.5 hover:shadow-soft', tone)}>
      <div className="font-display font-bold text-[28px] leading-none">{loading && !data ? '…' : n}</div>
      <div className="text-[12.5px] font-bold mt-1.5">Can't reach: {n} driver{n === 1 ? '' : 's'} ({data?.days ?? 14} days)</div>
      <div className="text-[11px] font-semibold opacity-80 mt-0.5">no text, no WhatsApp, no app</div>
    </button>
  );
}

type SortKey = 'worst' | 'name' | 'reason';

export function CantReachModal({ data, loading, onClose }: { data?: CantReachData; loading?: boolean; onClose: () => void }) {
  const [sort, setSort] = useState<SortKey>('worst');
  const [q, setQ] = useState('');
  const days = data?.days ?? 14;
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    const digits = t.replace(/\D/g, '');
    const r = (data?.rows ?? []).filter((x) => !t
      || `${x.name} ${x.reason} ${x.phone ?? ''}`.toLowerCase().includes(t)
      || (digits.length >= 3 && (x.tel ?? '').includes(digits)));
    const at = (x: CantReachRow) => x.lastAt ?? '';
    if (sort === 'worst') r.sort((a, b) => (at(a) < at(b) ? -1 : at(a) > at(b) ? 1 : a.name.localeCompare(b.name)));
    else if (sort === 'name') r.sort((a, b) => a.name.localeCompare(b.name));
    else r.sort((a, b) => a.reason.localeCompare(b.reason) || (at(a) < at(b) ? -1 : 1));
    return r;
  }, [data, sort, q]);

  function exportCsv() {
    const head = ['Driver', 'Phone', 'Last reached', 'How', 'Reason'];
    const lines = rows.map((r) => [r.name, r.phone ?? '', r.lastAt ? fmtDateTimeEastern(r.lastAt) : 'never', r.lastHow ?? '', r.reason]
      .map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','));
    const blob = new Blob([[head.join(','), ...lines].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `zlz-cant-reach-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  const th = 'px-3 py-2 text-left text-[11px] font-extrabold uppercase tracking-[.05em] text-muted whitespace-nowrap';
  const sortBtn = (k: SortKey, label: string) => (
    <button key={k} onClick={() => setSort(k)} aria-pressed={sort === k}
            className={cx('haptic text-[12px] font-bold rounded-full px-3 py-1', sort === k ? 'bg-forest text-paper' : 'bg-sage/60 text-forest hover:bg-sage')}>{label}</button>
  );
  const n = data?.count ?? 0;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-paper rounded-[16px] border border-line max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col"
           role="dialog" aria-label="Drivers we can't reach" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-line flex items-start justify-between gap-3">
          <div>
            <div className="font-display font-bold text-[18px] text-ink">Can't reach: {n} driver{n === 1 ? '' : 's'} ({days} days)</div>
            <div className="text-[12px] text-muted">No text went out, no WhatsApp went out, and no app use in the last {days} days. Worst first.</div>
          </div>
          <button onClick={onClose} aria-label="Close" className="haptic text-muted hover:text-ink text-[22px] leading-none px-1">×</button>
        </div>
        <div className="overflow-y-auto p-4 space-y-4">
          {loading && !data ? <div className="text-[13.5px] text-muted py-6 text-center">Loading…</div> : data && (
            <>
              <div className="text-[12.5px] text-ink bg-cream/60 rounded-[10px] px-3 py-2">
                Active drivers only (not do-not-contact, alumni or archived). Call them, or open the driver card to fix the reason
                (texts off, phone, pause, away dates, quiet times, the pickup-text group).
              </div>
              <section className="rounded-[14px] border border-line overflow-hidden" data-qa="cant-reach-table">
                <div className="px-3 py-2 border-b border-line flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {sortBtn('worst', 'Worst first')}{sortBtn('reason', 'By reason')}{sortBtn('name', 'By name')}
                  </div>
                  <div className="flex items-center gap-2">
                    <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, phone or reason…"
                           className="text-[13px] rounded-[10px] border border-line bg-paper px-3 py-1.5 w-[220px]" aria-label="Search" />
                    <button onClick={exportCsv} disabled={rows.length === 0}
                            className="haptic bg-forest text-paper font-bold text-[13px] rounded-[10px] px-3 py-1.5 disabled:opacity-40">⬇ Export CSV</button>
                  </div>
                </div>
                {rows.length === 0 ? (
                  <div className="text-[13.5px] text-muted py-6 text-center">{q.trim() ? 'Nothing matches the search.' : `Every active driver was reached in the last ${days} days.`}</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-[13px]">
                      <thead className="border-b border-line bg-cream/40"><tr>
                        <th className={th}>Driver</th><th className={th}>Phone</th><th className={th}>Last reached</th>
                        <th className={th}>Why</th><th className={th}></th>
                      </tr></thead>
                      <tbody>
                        {rows.map((r) => (
                          <tr key={r.id} className={cx('border-b border-line/70', !r.lastAt && 'bg-clay-soft/40')}>
                            <td className="px-3 py-2 whitespace-nowrap">
                              <button type="button" onClick={() => openDriver(r.id)} className="haptic font-semibold text-forest text-left hover:underline underline-offset-2" title="Open the driver card">
                                <bdi dir="auto">{r.name}</bdi>
                              </button>
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap tabular-nums">{r.phone ?? <span className="text-muted">—</span>}</td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              {r.lastAt
                                ? <><span className="font-semibold">{agoDays(r.lastAt)}</span> <span className="text-muted text-[11.5px]">{HOW[r.lastHow ?? ''] ?? ''} · {fmtDateTimeEastern(r.lastAt)}</span></>
                                : <span className="font-bold text-clay">never</span>}
                            </td>
                            <td className="px-3 py-2 font-semibold text-ink">{r.reason}</td>
                            <td className="px-3 py-2 whitespace-nowrap text-right">
                              {r.tel && (
                                <a href={`tel:+1${r.tel}`} className="haptic inline-block bg-forest text-paper font-bold text-[12px] rounded-full px-3 py-1 mr-1.5">📞 Call</a>
                              )}
                              <button type="button" onClick={() => openDriver(r.id)}
                                      className="haptic bg-sage/60 text-forest hover:bg-sage font-bold text-[12px] rounded-full px-3 py-1">Driver card</button>
                            </td>
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
