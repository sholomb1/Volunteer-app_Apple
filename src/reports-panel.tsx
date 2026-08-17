/**
 * Reports panel — filterable pickup history with CSV export and quick stats.
 * Hits the existing /api/reports/pickups endpoint (staff-only, already wired
 * on the backend). Lives in the Coordinator Portal under the Reports tab.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { cx } from './design';
import { fmtTime } from './time-format';

type ReportRow = {
  id: string;
  scheduled_date: string;
  scheduled_time: string;
  status: string;
  pickup_type: string | null;
  supplier: string | null;
  volunteer: string | null;
  items_collected: any;
};

function fmtQty(items: any) {
  if (!items || typeof items !== 'object') return '';
  return items.quantity ? String(items.quantity) : '';
}

export function ReportsPanel() {
  const today = new Date();
  const lastMonth = new Date(); lastMonth.setMonth(lastMonth.getMonth() - 1);
  const [from, setFrom] = useState<string>(lastMonth.toISOString().slice(0, 10));
  const [to,   setTo]   = useState<string>(today.toISOString().slice(0, 10));
  const [status, setStatus]           = useState<string>('');
  const [supplierId, setSupplierId]   = useState<string>('');
  const [volunteerId, setVolunteerId] = useState<string>('');

  const suppliers  = useQuery({ queryKey: ['admin-suppliers'],  queryFn: () => api<{ data: any[] }>('/api/suppliers?limit=500') });
  const volunteers = useQuery({ queryKey: ['admin-volunteers'], queryFn: () => api<{ data: any[] }>('/api/volunteers?limit=500') });

  const qs = new URLSearchParams();
  if (from)        qs.set('from', from);
  if (to)          qs.set('to', to);
  if (status)      qs.set('status', status);
  if (supplierId)  qs.set('supplierId', supplierId);
  if (volunteerId) qs.set('volunteerId', volunteerId);
  const report = useQuery({
    queryKey: ['reports-pickups', qs.toString()],
    queryFn:  () => api<{ data: ReportRow[] }>(`/api/reports/pickups${qs.toString() ? `?${qs}` : ''}`),
  });
  const rows = report.data?.data ?? [];

  const stats = (() => {
    const total = rows.length;
    let completed = 0, missed = 0, scheduled = 0;
    const stores = new Set<string>();
    const drivers = new Set<string>();
    rows.forEach((r) => {
      if (r.status === 'completed') completed++;
      else if (r.status === 'missed' || r.status === 'cancelled') missed++;
      else scheduled++;
      if (r.supplier)  r.supplier.split(',').forEach((s) => stores.add(s.trim()));
      if (r.volunteer) r.volunteer.split(',').forEach((v) => drivers.add(v.trim()));
    });
    return { total, completed, missed, scheduled, stores: stores.size, drivers: drivers.size };
  })();

  function exportCsv() {
    const head = ['Date', 'Time', 'Supplier / Donor', 'Volunteer(s)', 'Type', 'Status', 'Quantity'];
    const lines = rows.map((r) => [
      String(r.scheduled_date ?? '').slice(0, 10),
      String(r.scheduled_time ?? '').slice(0, 5),
      r.supplier ?? '',
      r.volunteer ?? '',
      r.pickup_type ?? '',
      r.status ?? '',
      fmtQty(r.items_collected),
    ].map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','));
    const csv = [head.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `zlz-pickups-${from}_${to}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  function clearFilters() {
    setStatus(''); setSupplierId(''); setVolunteerId('');
    setFrom(lastMonth.toISOString().slice(0, 10));
    setTo(today.toISOString().slice(0, 10));
  }

  const filterInput = 'rounded-[10px] border-[1.4px] border-line bg-paper px-3 py-2 text-[14px] outline-none focus:border-forest';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
        <StatTile label="Total pickups"      value={stats.total}      tone="forest" />
        <StatTile label="Completed"          value={stats.completed}  tone="forest" />
        <StatTile label="Scheduled"          value={stats.scheduled}  tone="amber" />
        <StatTile label="Missed / cancelled" value={stats.missed}     tone="clay" />
        <StatTile label="Distinct stores"    value={stats.stores}     tone="sky" />
        <StatTile label="Distinct drivers"   value={stats.drivers}    tone="sky" />
      </div>

      <div className="bg-paper border border-line rounded-[14px] p-4">
        <div className="text-[13px] font-extrabold uppercase tracking-[.06em] text-muted mb-3">Filters</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          <label className="block">
            <span className="text-[11.5px] font-extrabold uppercase tracking-[.06em] text-muted">From</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={cx(filterInput, 'mt-1 w-full')} />
          </label>
          <label className="block">
            <span className="text-[11.5px] font-extrabold uppercase tracking-[.06em] text-muted">To</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={cx(filterInput, 'mt-1 w-full')} />
          </label>
          <label className="block">
            <span className="text-[11.5px] font-extrabold uppercase tracking-[.06em] text-muted">Status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className={cx(filterInput, 'mt-1 w-full')}>
              <option value="">All</option>
              <option value="scheduled">Scheduled</option>
              <option value="confirmed">Confirmed</option>
              <option value="in_progress">In progress</option>
              <option value="picked_up">Picked up</option>
              <option value="completed">Completed</option>
              <option value="missed">Missed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </label>
          <label className="block">
            <span className="text-[11.5px] font-extrabold uppercase tracking-[.06em] text-muted">Supplier</span>
            <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={cx(filterInput, 'mt-1 w-full')}>
              <option value="">All</option>
              {(suppliers.data?.data ?? []).map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-[11.5px] font-extrabold uppercase tracking-[.06em] text-muted">Volunteer</span>
            <select value={volunteerId} onChange={(e) => setVolunteerId(e.target.value)} className={cx(filterInput, 'mt-1 w-full')}>
              <option value="">All</option>
              {(volunteers.data?.data ?? []).map((v: any) => <option key={v.id} value={v.id}>{v.firstName} {v.lastName}{v.unitNumber != null ? ` · #${v.unitNumber}` : ''}</option>)}
            </select>
          </label>
          <div className="flex items-end gap-2">
            <button onClick={clearFilters} className="haptic text-[13px] font-bold text-muted px-3 py-2 rounded-[10px] hover:bg-cream">Clear</button>
            <button onClick={exportCsv} disabled={rows.length === 0}
                    className="haptic flex-1 bg-forest text-paper font-bold text-[13px] rounded-[10px] px-3 py-2 disabled:opacity-40">
              ⬇ Export CSV
            </button>
          </div>
        </div>
      </div>

      <div className="bg-paper border border-line rounded-[14px] overflow-hidden">
        <div className="px-4 py-2.5 border-b border-line flex items-center justify-between">
          <div className="text-[13px] font-extrabold uppercase tracking-[.06em] text-muted">
            {report.isLoading ? 'Loading…' : `${rows.length} pickup${rows.length === 1 ? '' : 's'}`}
          </div>
          {report.error && <div className="text-[12.5px] text-clay">{(report.error as Error).message}</div>}
        </div>
        {report.isLoading ? (
          <div className="text-[13.5px] text-muted py-8 text-center">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="text-[13.5px] text-muted py-8 text-center">No pickups match these filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13.5px]">
              <thead>
                <tr className="text-left border-b border-line bg-cream/40">
                  <th className="px-3 py-2.5 font-extrabold uppercase text-[11.5px] tracking-[.06em] text-muted">Date</th>
                  <th className="px-3 py-2.5 font-extrabold uppercase text-[11.5px] tracking-[.06em] text-muted">Time</th>
                  <th className="px-3 py-2.5 font-extrabold uppercase text-[11.5px] tracking-[.06em] text-muted">Supplier</th>
                  <th className="px-3 py-2.5 font-extrabold uppercase text-[11.5px] tracking-[.06em] text-muted">Volunteer(s)</th>
                  <th className="px-3 py-2.5 font-extrabold uppercase text-[11.5px] tracking-[.06em] text-muted">Type</th>
                  <th className="px-3 py-2.5 font-extrabold uppercase text-[11.5px] tracking-[.06em] text-muted">Qty</th>
                  <th className="px-3 py-2.5 font-extrabold uppercase text-[11.5px] tracking-[.06em] text-muted">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-line/70 hover:bg-cream/40">
                    <td className="px-3 py-2 text-ink">{new Date(String(r.scheduled_date).slice(0, 10) + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                    <td className="px-3 py-2 text-ink tabular-nums">{fmtTime(String(r.scheduled_time ?? '').slice(0, 5)) || '—'}</td>
                    <td className="px-3 py-2 font-bold text-ink">{r.supplier || '—'}</td>
                    <td className="px-3 py-2 text-ink">{r.volunteer || <span className="text-clay">unassigned</span>}</td>
                    <td className="px-3 py-2 text-muted capitalize">{(r.pickup_type || '').replace(/_/g, ' ')}</td>
                    <td className="px-3 py-2 text-ink">{fmtQty(r.items_collected)}</td>
                    <td className="px-3 py-2">
                      <span className={cx('inline-block text-[11.5px] font-bold py-1 px-2.5 rounded-full',
                        r.status === 'completed' ? 'bg-sage text-forest' :
                        r.status === 'missed' || r.status === 'cancelled' ? 'bg-clay-soft text-clay' :
                        r.status === 'in_progress' || r.status === 'picked_up' ? 'bg-amber-soft text-[#8a6011]' :
                        'bg-line text-muted')}>
                        {r.status?.replace(/_/g, ' ')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StatTile({ label, value, tone }: { label: string; value: number; tone: 'forest' | 'clay' | 'amber' | 'sky' }) {
  const bg =
    tone === 'forest' ? 'bg-sage border-sage-line text-forest' :
    tone === 'clay'   ? 'bg-clay-soft border-clay/30 text-clay' :
    tone === 'amber'  ? 'bg-amber-soft border-amber/30 text-[#8a6011]' :
                        'bg-sky-soft border-sky/30 text-[#1d4a6a]';
  return (
    <div className={cx('rounded-[14px] border-2 px-4 py-3', bg)}>
      <div className="font-display font-bold text-[28px] leading-none">{value}</div>
      <div className="text-[12.5px] font-bold mt-1.5">{label}</div>
    </div>
  );
}
