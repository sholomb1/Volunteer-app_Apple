/**
 * Reports panel — filterable pickup history with CSV export and quick stats.
 * Hits the existing /api/reports/pickups endpoint (staff-only, already wired
 * on the backend). Lives in the Coordinator Portal under the Reports tab.
 *
 * Tier-2 fixes (2026-08-21):
 *  1. `delivered` now counts toward Completed (was silently in Scheduled)
 *  2. Total-pickups tile shows only completed/delivered/picked_up (grant reality)
 *  3. Distinct stores/drivers come from server-side DISTINCT on join tables
 *     (no more "Chai Lifeline, Inc." splitting into two on the comma)
 *  4. New tiles: total miles + total hours (SUM from activity_logs)
 *  5. Date-range preset buttons (this week / this month / last month / YTD / all)
 *  6. Filter dropdowns include inactive suppliers + soft-deleted volunteers,
 *     tagged "(inactive)" so historical rows stay filterable
 *  7. CSV first column = pickup ID
 *  8. CSV column order matches the on-screen table
 *  9. CSV export fetches uncapped dataset; banner appears when the on-screen
 *     table is truncated
 */
import { useEffect, useState } from 'react';
import { submittedByLabel } from './submitted-by'; // Oct 12 client
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { uiConfirm } from './ui-dialogs'; // Oct 14 client: Resend to failed asks first
import { cx, DateInput } from './design';
import { fmtTime, fmtDateTimeEastern, fmtDay } from './time-format';
import { patchCoordNav } from './nav-state';
import { GasRewardsReport } from './gas-rewards-panel';
import { TakeWaitTile, TakeWaitModal, useTakeWait } from './take-wait-report'; // Oct 14 client: typical wait until taken

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

type ReportTotals = {
  allRows: number;
  totalPickups: number;
  completed: number;
  missedCancelled: number;
  cancelled?: number; completedNoKiosk?: number; needsReview?: number; expired?: number; missedConfirmed?: number;
  outsideHelper?: number;  // Oct 13 client: covered by outside helpers
  scheduled: number;
  assigned: number;
  distinctSuppliers: number;
  distinctVolunteers: number;
  miles: number;
  hours: number;
};

type SupplierPick   = { id: number; name: string; isActive: boolean };
type VolunteerPick  = { id: number; firstName: string; lastName: string; unitNumber: number | null; inactive: boolean };

function fmtQty(items: any) {
  if (!items || typeof items !== 'object') return '';
  return items.quantity ? String(items.quantity) : '';
}

// Local ISO date (YYYY-MM-DD) — using toISOString() would shift into UTC and
// hide same-day rows near midnight local time (per zlz_ny_date_defaults rule).
function isoLocal(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function ReportsPanel({ onNavigateTab }: { onNavigateTab?: (tab: string) => void } = {}) {
  const today = new Date();
  const lastMonth = new Date(); lastMonth.setMonth(lastMonth.getMonth() - 1);
  const [from, setFrom] = useState<string>(isoLocal(lastMonth));
  const [to,   setTo]   = useState<string>(isoLocal(today));
  const [status, setStatus]           = useState<string>('');
  const [supplierId, setSupplierId]   = useState<string>('');
  const [volunteerId, setVolunteerId] = useState<string>('');
  const [submittedBy, setSubmittedBy] = useState<string>(''); // Oct 12 client: "Form submitted by" filter
  const [exportBusy, setExportBusy]   = useState(false);
  // Feature 4: which report is showing — pickup history or the Recently
  // Active Drivers roster.
  // Sep 8 client (#B3/#B4): 'activity' tab exposes the new
  // Driver Activity report — auto-calculated activity_status per
  // volunteer, using verified events only (completed pickup or matched
  // kiosk sign-in). Accepting alone doesn't count as verified.
  const [view, setView] = useState<ReportView>('pickups');
  const [breakdown, setBreakdown] = useState<'supplier' | 'volunteer' | null>(null);
  const [waitOpen, setWaitOpen] = useState(false); // Oct 14 client: typical wait until taken

  // Reports-specific picklists — include inactive/soft-deleted parties so
  // historical rows tied to since-removed stores/drivers are filterable.
  const suppliers  = useQuery({ queryKey: ['reports-suppliers-picklist'],
    queryFn: () => api<{ data: SupplierPick[] }>('/api/reports/suppliers-picklist') });
  const volunteers = useQuery({ queryKey: ['reports-volunteers-picklist'],
    queryFn: () => api<{ data: VolunteerPick[] }>('/api/reports/volunteers-picklist') });

  const qs = new URLSearchParams();
  if (from)        qs.set('from', from);
  if (to)          qs.set('to', to);
  if (status)      qs.set('status', status);
  if (supplierId)  qs.set('supplierId', supplierId);
  if (volunteerId) qs.set('volunteerId', volunteerId);
  if (submittedBy) qs.set('submittedBy', submittedBy);
  const report = useQuery({
    queryKey: ['reports-pickups', qs.toString()],
    queryFn:  () => api<{ data: ReportRow[]; totals: ReportTotals; truncated: boolean; limit: number; formBy?: { key: string; count: number }[] }>(
      `/api/reports/pickups${qs.toString() ? `?${qs}` : ''}`),
    // Oct 8 client: keep the current numbers on screen while a tile's filter loads
    // (tiles used to drop to 0 for a moment = every tile blinked).
    placeholderData: (prev) => prev,
  });
  const rows = report.data?.data ?? [];
  // Oct 14 client: "Typical wait until taken" tile — same filters as the other tiles.
  const takeWait = useTakeWait(qs);
  // Oct 2 client fix: text search over the loaded report rows.
  const [rq, setRq] = useState('');
  const shownRows = rq.trim() ? rows.filter((r) => JSON.stringify(r).toLowerCase().includes(rq.trim().toLowerCase())) : rows;
  const totals: ReportTotals = report.data?.totals ?? {
    allRows: 0, totalPickups: 0, completed: 0, missedCancelled: 0, scheduled: 0, assigned: 0,
    distinctSuppliers: 0, distinctVolunteers: 0, miles: 0, hours: 0,
  };
  const truncated = !!report.data?.truncated;
  // Oct 14 client: "Forms filled by" counts (same filters; ignores the Form by filter).
  const formBy = report.data?.formBy ?? [];

  async function exportCsv() {
    setExportBusy(true);
    try {
      // Always pull the uncapped dataset for CSV so the office file is complete
      // even when the on-screen table shows only the first 1000 rows.
      const exportQs = new URLSearchParams(qs);
      exportQs.set('limit', '0');
      const full = await api<{ data: ReportRow[] }>(`/api/reports/pickups?${exportQs}`);
      const allRows = full.data ?? [];

      // Column order MATCHES the on-screen table (ID injected first).
      const head = ['Pickup #', 'Date', 'Time', 'Supplier', 'Volunteer(s)', 'Type', 'Qty', 'Status', 'Source', 'Form submitted by']; // Oct 13 client: + Source; Oct 14 client: + Form submitted by
      const lines = allRows.map((r) => [
        (r as any).ref_number ?? r.id ?? '',
        String(r.scheduled_date ?? '').slice(0, 10),
        fmtTime(String(r.scheduled_time ?? '').slice(0, 5)),
        r.supplier ?? '',
        r.volunteer ?? '',
        r.pickup_type ?? '',
        fmtQty(r.items_collected),
        r.status ?? '',
        (r as any).source ?? '', // Oct 13 client: Store app / Text / Steady schedule / Office / public form
        submittedByLabel((r as any).submitted_by), // Oct 12 client
      ].map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','));
      const csv = [head.join(','), ...lines].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `zlz-pickups-${from}_${to}.csv`; a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExportBusy(false);
    }
  }

  function clearFilters() {
    setStatus(''); setSupplierId(''); setVolunteerId(''); setSubmittedBy('');
    setFrom(isoLocal(lastMonth));
    setTo(isoLocal(today));
  }

  // Date-range presets (fix #5). All resolve to local NY-style ISO strings.
  function applyPreset(kind: 'week' | 'month' | 'last-month' | 'ytd' | 'all') {
    const now = new Date();
    if (kind === 'week') {
      const day = now.getDay(); // 0 = Sun; grant reporters generally mean Sun→today
      const start = new Date(now); start.setDate(now.getDate() - day);
      setFrom(isoLocal(start)); setTo(isoLocal(now));
    } else if (kind === 'month') {
      setFrom(isoLocal(new Date(now.getFullYear(), now.getMonth(), 1)));
      setTo(isoLocal(now));
    } else if (kind === 'last-month') {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const last  = new Date(now.getFullYear(), now.getMonth(), 0);
      setFrom(isoLocal(first)); setTo(isoLocal(last));
    } else if (kind === 'ytd') {
      setFrom(isoLocal(new Date(now.getFullYear(), 0, 1)));
      setTo(isoLocal(now));
    } else if (kind === 'all') {
      setFrom('2020-01-01'); setTo(isoLocal(now));
    }
  }

  const filterInput = 'rounded-[10px] border-[1.4px] border-line bg-paper px-3 py-2 text-[14px] outline-none focus:border-forest';
  const presetBtn   = 'haptic text-[12.5px] font-bold text-forest bg-sage/60 hover:bg-sage rounded-full px-3 py-1';

  if (view === 'gas') {
    return (
      <div className="space-y-4">
        <ReportTabs view={view} setView={setView} />
        <GasRewardsReport />
      </div>
    );
  }
  if (view === 'drivers') {
    return (
      <div className="space-y-4">
        <ReportTabs view={view} setView={setView} />
        <ActiveDriversReport />
      </div>
    );
  }
  if (view === 'activity') {
    return (
      <div className="space-y-4">
        <ReportTabs view={view} setView={setView} />
        <DriverActivityReport />
      </div>
    );
  }
  if (view === 'steady' || view === 'reconciliation') {
    return (
      <div className="space-y-4">
        <ReportTabs view={view} setView={setView} />
        {view === 'steady' ? <SteadyPerformanceReport /> : <ReconciliationReport />}
      </div>
    );
  }
  if (view === 'sms-delivery') {
    return (
      <div className="space-y-4">
        <ReportTabs view={view} setView={setView} />
        <SmsDeliveryReport />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ReportTabs view={view} setView={setView} />
      {/* Sep 8/9 client (#B1, #C3.1, #C3.2): every summary card is a
          filter. Clicking the same tile again clears it. Completed and
          Missed/Cancelled each map to a CSV of statuses matching what
          the tile counts, so tile count == table row count exactly.
          Total miles and Total hours removed per client — not reliable.
          Distinct stores/drivers clickable — sets a supplier/volunteer
          filter placeholder (actual value clears the specific filter,
          shows all rows so the count matches the distinct list). */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
        {/* Oct 8 client: plain words on the tiles. */}
        <StatTile label="Total pickups"       value={totals.totalPickups}
                  tone="forest"
                  active={status === '' && !supplierId && !volunteerId}
                  onClick={() => { setStatus(''); setSupplierId(''); setVolunteerId(''); }} />
        {/* Oct 7 client: each tile filters by the same rule the API counts
            with (outcome tokens), and the API keeps tile counts fixed while
            a tile is selected. */}
        <StatTile label="Done"                value={totals.completed}
                  tone="forest"
                  active={status === 'completed_verified'}
                  onClick={() => setStatus(status === 'completed_verified' ? '' : 'completed_verified')} />
        <StatTile label="Needs a driver"      value={totals.scheduled}
                  tone="clay"
                  active={status === 'awaiting_driver'}
                  onClick={() => setStatus(status === 'awaiting_driver' ? '' : 'awaiting_driver')} />
        <StatTile label="Has a driver"        value={totals.assigned}
                  tone="amber"
                  active={status === 'assigned_open'}
                  onClick={() => setStatus(status === 'assigned_open' ? '' : 'assigned_open')} />
        {/* Oct 2 client fix (UI plan §7): missed and cancelled are separate;
            no kiosk sign-in means unverified, not missed. Each card filters
            the table to exactly the rows it counts. */}
        <StatTile label="Taken, not checked in" value={totals.completedNoKiosk ?? 0}
                  tone="amber"
                  active={status === 'completed_nokiosk'}
                  onClick={() => setStatus(status === 'completed_nokiosk' ? '' : 'completed_nokiosk')} />
        <StatTile label="Cancelled"           value={totals.cancelled ?? 0}
                  tone="clay"
                  active={status === 'cancelled'}
                  onClick={() => setStatus(status === 'cancelled' ? '' : 'cancelled')} />
        <StatTile label="Missed"              value={totals.missedConfirmed ?? 0}
                  tone="clay"
                  active={status === 'missed_confirmed'}
                  onClick={() => setStatus(status === 'missed_confirmed' ? '' : 'missed_confirmed')} />
        {(totals.needsReview ?? 0) > 0 && <StatTile label="Needs review"        value={totals.needsReview ?? 0}
                  tone="amber"
                  active={status === 'needs_review'}
                  onClick={() => setStatus(status === 'needs_review' ? '' : 'needs_review')} />}
        <StatTile label="Nobody took it"      value={totals.expired ?? 0}
                  tone="clay"
                  active={status === 'expired'}
                  onClick={() => setStatus(status === 'expired' ? '' : 'expired')} />
        {/* Oct 13 client: pickups an outside helper (not one of our volunteers) covered. */}
        {((totals.outsideHelper ?? 0) > 0 || status === 'outside_helper') && <StatTile label="Covered by outside helpers" value={totals.outsideHelper ?? 0}
                  tone="amber"
                  active={status === 'outside_helper'}
                  onClick={() => setStatus(status === 'outside_helper' ? '' : 'outside_helper')} />}
        {/* Oct 7 client: Distinct Stores / Drivers open the list they count
            (this date range + filters); picking one filters the report. */}
        <StatTile label="Stores"              value={totals.distinctSuppliers}
                  tone="sky"
                  active={!!supplierId}
                  onClick={() => setBreakdown('supplier')} />
        <StatTile label="Drivers"             value={totals.distinctVolunteers}
                  tone="sky"
                  active={!!volunteerId}
                  onClick={() => setBreakdown('volunteer')} />
        {/* Oct 14 client: typical (median) wait until a driver took the pickup; tap = each pickup + weekly chart. */}
        <TakeWaitTile data={takeWait.data} loading={takeWait.isLoading} onClick={() => setWaitOpen(true)} />
      </div>
      {/* Oct 14 client: who filled out the forms; tap a name = the "Form by" filter (tap again = all). */}
      {formBy.length > 0 && (
        <div data-testid="form-by-summary" className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 rounded-[12px] border border-line bg-paper px-3 py-2 text-[12.5px]">
          <span className="font-extrabold text-muted">✍️ Forms filled by:</span>
          {formBy.map((f, i) => (
            <span key={f.key} className="inline-flex items-center">
              {i > 0 && <span className="text-muted mr-1.5">·</span>}
              <button type="button" aria-pressed={submittedBy === f.key}
                      title={submittedBy === f.key ? 'Show all' : 'Show only these'}
                      onClick={() => setSubmittedBy(submittedBy === f.key ? '' : f.key)}
                      className={cx('font-bold rounded-full px-1.5 py-0.5 hover:underline underline-offset-2',
                        submittedBy === f.key ? 'bg-forest text-paper' : 'text-forest')}>
                {f.key === 'none' ? 'Not recorded' : f.key === 'Text' ? 'Text' : submittedByLabel(f.key)} {f.count}
              </button>
            </span>
          ))}
        </div>
      )}
      {waitOpen && <TakeWaitModal data={takeWait.data} loading={takeWait.isLoading} onClose={() => setWaitOpen(false)} />}
      {breakdown && (
        <BreakdownModal by={breakdown} qs={qs}
                        onClose={() => setBreakdown(null)}
                        onOpenRoster={() => {
                          const tab = breakdown === 'supplier' ? 'suppliers' : 'volunteers';
                          patchCoordNav({ tab }); onNavigateTab?.(tab);
                        }}
                        onPick={(id) => {
                          if (breakdown === 'supplier') setSupplierId(String(id)); else setVolunteerId(String(id));
                          setStatus('');
                          setBreakdown(null);
                        }} />
      )}

      <div className="bg-paper border border-line rounded-[14px] p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[13px] font-extrabold uppercase tracking-[.06em] text-muted">Filters</div>
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => applyPreset('week')}       className={presetBtn}>This week</button>
            <button onClick={() => applyPreset('month')}      className={presetBtn}>This month</button>
            <button onClick={() => applyPreset('last-month')} className={presetBtn}>Last month</button>
            <button onClick={() => applyPreset('ytd')}        className={presetBtn}>This year</button>
            <button onClick={() => applyPreset('all')}        className={presetBtn}>All time</button>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          <label className="block">
            <span className="text-[11.5px] font-extrabold uppercase tracking-[.06em] text-muted">From</span>
            <DateInput value={from} onChange={setFrom} className={cx(filterInput, 'mt-1 w-full')} />
          </label>
          <label className="block">
            <span className="text-[11.5px] font-extrabold uppercase tracking-[.06em] text-muted">To</span>
            <DateInput value={to} onChange={setTo} className={cx(filterInput, 'mt-1 w-full')} />
          </label>
          <label className="block">
            <span className="text-[11.5px] font-extrabold uppercase tracking-[.06em] text-muted">Status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className={cx(filterInput, 'mt-1 w-full')}>
              <option value="">All</option>
              <option value="scheduled">Scheduled</option>
              <option value="confirmed">Confirmed</option>
              <option value="in_progress">In progress</option>
              <option value="picked_up">Picked up</option>
              <option value="delivered">Delivered</option>
              <option value="completed">Completed — all</option>
              <option value="completed_nokiosk">Taken, not checked in</option>
              <option value="completed_verified">Completed – verified</option>
              <option value="missed_confirmed">Missed</option>
              <option value="needs_review">Needs review</option>
              <option value="expired">Nobody took it</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </label>
          <label className="block">
            <span className="text-[11.5px] font-extrabold uppercase tracking-[.06em] text-muted">Form by</span>
            <select value={submittedBy} onChange={(e) => setSubmittedBy(e.target.value)} className={cx(filterInput, 'mt-1 w-full')}>
              <option value="">All</option>
              {['Secretary', 'Swift Dial', 'SR', 'YT', 'Other', 'Store app', 'Text'].map((o) => <option key={o} value={o}>{o}</option>)}
              {/* Oct 14 client: a typed name picked from "Forms filled by" */}
              {submittedBy && submittedBy !== 'none' && !['Secretary', 'Swift Dial', 'SR', 'YT', 'Other', 'Store app', 'Text'].includes(submittedBy)
                && <option value={submittedBy}>{submittedByLabel(submittedBy)}</option>}
              <option value="none">Not recorded</option>
            </select>
          </label>
          <label className="block">
            <span className="text-[11.5px] font-extrabold uppercase tracking-[.06em] text-muted">Search</span>
            <input value={rq} onChange={(e) => setRq(e.target.value)} placeholder="Store, driver, status…"
                   className={cx(filterInput, 'mt-1 w-full')} />
          </label>
          <label className="block">
            <span className="text-[11.5px] font-extrabold uppercase tracking-[.06em] text-muted">Supplier</span>
            <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={cx(filterInput, 'mt-1 w-full')}>
              <option value="">All</option>
              {(suppliers.data?.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>{s.name}{s.isActive === false ? ' (inactive)' : ''}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-[11.5px] font-extrabold uppercase tracking-[.06em] text-muted">Volunteer</span>
            <select value={volunteerId} onChange={(e) => setVolunteerId(e.target.value)} className={cx(filterInput, 'mt-1 w-full')}>
              <option value="">All</option>
              {(volunteers.data?.data ?? []).map((v) => (
                <option key={v.id} value={v.id}>
                  {v.firstName} {v.lastName}
                  {v.unitNumber != null ? ` · #${v.unitNumber}` : ''}
                  {v.inactive ? ' (inactive)' : ''}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end gap-2">
            <button onClick={clearFilters} className="haptic text-[13px] font-bold text-muted px-3 py-2 rounded-[10px] hover:bg-cream">Clear</button>
            <button onClick={exportCsv} disabled={rows.length === 0 || exportBusy}
                    className="haptic flex-1 bg-forest text-paper font-bold text-[13px] rounded-[10px] px-3 py-2 disabled:opacity-40">
              {exportBusy ? 'Exporting…' : '⬇ Export CSV'}
            </button>
          </div>
        </div>
      </div>

      {truncated && (
        <div className="bg-amber-soft border border-amber/40 text-[#8a6011] text-[13px] font-semibold rounded-[10px] px-3 py-2">
          Showing first {rows.length} of {totals.allRows} rows.
          The <b>Export CSV</b> button downloads the complete dataset.
        </div>
      )}

      <div className="bg-paper border border-line rounded-[14px] overflow-hidden">
        <div className="px-4 py-2.5 border-b border-line flex items-center justify-between">
          <div className="text-[13px] font-extrabold uppercase tracking-[.06em] text-muted">
            {report.isLoading || report.isPlaceholderData ? 'Loading…' : `${totals.allRows} pickup${totals.allRows === 1 ? '' : 's'}`}
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
                {shownRows.map((r) => (
                  <tr key={r.id} className="border-b border-line/70 hover:bg-cream/40">
                    <td className="px-3 py-2 text-ink">{new Date(String(r.scheduled_date).slice(0, 10) + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                    <td className="px-3 py-2 text-ink tabular-nums">{fmtTime(String(r.scheduled_time ?? '').slice(0, 5)) || '—'}</td>
                    <td className="px-3 py-2 font-bold text-ink">{r.supplier || '—'}</td>
                    <td className="px-3 py-2 text-ink">{r.volunteer || <span className="text-clay">unassigned</span>}</td>
                    <td className="px-3 py-2 text-muted capitalize">{(r.pickup_type || '').replace(/_/g, ' ')}</td>
                    <td className="px-3 py-2 text-ink">{fmtQty(r.items_collected)}</td>
                    <td className="px-3 py-2">
                      <span className={cx('inline-block text-[11.5px] font-bold py-1 px-2.5 rounded-full',
                        r.status === 'completed' || r.status === 'delivered' ? 'bg-sage text-forest' :
                        r.status === 'missed' || r.status === 'cancelled' ? 'bg-clay-soft text-clay' :
                        r.status === 'in_progress' || r.status === 'picked_up' ? 'bg-amber-soft text-[#8a6011]' :
                        'bg-line text-muted')}>
                        {(r as any).outcome ?? r.status?.replace(/_/g, ' ')}
                      </span>
                      {String((r as any).outcome ?? '').startsWith('Completed') && (
                        <span className={cx('ml-1 inline-block text-[11px] font-bold py-0.5 px-2 rounded-full',
                          (r as any).kiosk_verified ? 'bg-sage text-forest' : 'bg-line/70 text-muted')}>
                          {(r as any).kiosk_verified ? '✓ Kiosk' : 'No kiosk'}
                        </span>
                      )}
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

// ─── Feature 4 — Recently Active Drivers ────────────────────────────────────
type ActiveDriverRow = {
  volunteerId: number;
  firstName: string;
  lastName: string;
  unitNumber: number | null;
  lastActivityAt: string | null;
  lastActivityType: string | null;
  lastActivityLabel: string | null;
  totalCompleted: number;
  totalTaken?: number;   // Oct 9 client: took it, not checked in
  totalAccepted: number;
  totalKiosk: number;
};

type ActivityEntry = {
  type: string;          // 'Completed' | 'Taken' | 'Accepted' | 'Kiosk Signed In'
  at: string | null;
  label: string | null;
  pickupId: number | null;
};

function typeBadge(type: string | null) {
  const t = type ?? '';
  const cls = t === 'Completed'       ? 'bg-sage text-forest'
            : t === 'Taken'           ? 'bg-amber-soft text-[#9a7415]'
            : t === 'Accepted'        ? 'bg-amber-soft text-[#8a6011]'
            : t === 'Kiosk Signed In' ? 'bg-sky-soft text-[#1d4a6a]'
            :                           'bg-line text-muted';
  // Oct 9 client: same words as Rewards — Done vs Took it, not checked in.
  const label = t === 'Completed' ? 'Done' : t === 'Taken' ? 'Took it, not checked in' : t;
  return <span className={cx('inline-block text-[11px] font-bold py-0.5 px-2 rounded-full', cls)}>{label || '—'}</span>;
}

type ReportView = 'pickups' | 'drivers' | 'activity' | 'sms-delivery' | 'steady' | 'reconciliation' | 'gas';
// Oct 2 client fix (UI plan §7): shared date range for the two reports below.
function useRange(days: number) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
  const start = new Date(today + 'T12:00:00'); start.setDate(start.getDate() - days);
  const [from, setFrom] = useState(start.toISOString().slice(0, 10));
  const [to, setTo] = useState(today);
  const picker = (
    <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
      <label className="flex items-center gap-1.5">From <DateInput value={from} onChange={setFrom} className="rounded-[8px] border border-line bg-paper px-2 py-1" /></label>
      <label className="flex items-center gap-1.5">To <DateInput value={to} onChange={setTo} className="rounded-[8px] border border-line bg-paper px-2 py-1" /></label>
    </div>
  );
  return { from, to, picker };
}

type SteadyPerfRow = { id: number; name: string; templateStatus: string; pickupTime: string | null; expected: number;
  completedVerified: number; completedNoKiosk: number; cancelled: number; missedConfirmed: number; needsReview: number; expired: number; stillOpen: number };
function SteadyPerformanceReport() {
  const { from, to, picker } = useRange(30);
  const q = useQuery({
    queryKey: ['report-steady-perf', from, to],
    queryFn: () => api<{ data: SteadyPerfRow[] }>(`/api/reports/steady-performance?from=${from}&to=${to}`),
  });
  const rows = q.data?.data ?? [];
  const th = 'px-3 py-2 text-left text-[11px] font-extrabold uppercase tracking-[.05em] text-muted whitespace-nowrap';
  const td = 'px-3 py-2 tabular-nums';
  return (
    <div className="space-y-3">
      <div className="rounded-[14px] border border-line bg-paper p-4 space-y-2">
        <div className="text-[12.5px] text-muted">
          Each steady pickup: how many occurrences were scheduled in the range and how each one ended.
          "No kiosk" counts as completed — it means unverified, not missed.
        </div>
        {picker}
      </div>
      {q.isLoading ? <div className="text-[13px] text-muted">Loading…</div> :
       q.isError ? <div className="text-[13px] text-clay">Couldn't load this report.</div> : (
        <div className="rounded-[14px] border border-line bg-paper overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="border-b border-line"><tr>
              <th className={th}>Steady pickup</th><th className={th}>Expected</th><th className={th}>Completed</th>
              <th className={th}>No kiosk</th><th className={th}>Cancelled</th><th className={th}>Confirmed missed</th>
              <th className={th}>Needs review</th><th className={th}>Expired</th><th className={th}>Still open</th>
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-line/70">
                  <td className="px-3 py-2 font-bold">{r.name}{r.pickupTime ? <span className="text-muted font-normal"> · {fmtTime(r.pickupTime)}</span> : null}
                    {r.templateStatus !== 'active' && <span className="ml-1.5 text-[10.5px] uppercase text-muted">({r.templateStatus === 'inactive' ? 'archived' : r.templateStatus})</span>}</td>
                  <td className={td}>{r.expected}</td>
                  <td className={cx(td, 'text-forest font-bold')}>{r.completedVerified}</td>
                  <td className={td}>{r.completedNoKiosk}</td>
                  <td className={td}>{r.cancelled}</td>
                  <td className={cx(td, r.missedConfirmed > 0 && 'text-clay font-bold')}>{r.missedConfirmed}</td>
                  <td className={td}>{r.needsReview}</td>
                  <td className={td}>{r.expired}</td>
                  <td className={td}>{r.stillOpen}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

type ReconRow = { issue: string; pickupId: number | null; ref: string | null; date: string; label: string; detail: string };
const RECON_LABEL: Record<string, string> = {
  completed_no_driver: 'Completed, no driver',
  cancelled_with_driver: 'Cancelled, driver still on it',
  past_still_open: 'Past date, still open',
  driver_count_mismatch: 'Driver count mismatch',
  kiosk_unlinked: 'Kiosk sign-in not linked',
};
function ReconciliationReport() {
  const { from, to, picker } = useRange(30);
  const [issue, setIssue] = useState('');
  const q = useQuery({
    queryKey: ['report-recon', from, to],
    queryFn: () => api<{ data: ReconRow[] }>(`/api/reports/reconciliation?from=${from}&to=${to}`),
  });
  const all = q.data?.data ?? [];
  const counts = all.reduce<Record<string, number>>((m, r) => { m[r.issue] = (m[r.issue] ?? 0) + 1; return m; }, {});
  const rows = issue ? all.filter((r) => r.issue === issue) : all;
  return (
    <div className="space-y-3">
      <div className="rounded-[14px] border border-line bg-paper p-4 space-y-2">
        <div className="text-[12.5px] text-muted">Records that don't add up and may need a fix. Click a card to filter.</div>
        {picker}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2">
        {Object.keys(RECON_LABEL).map((k) => (
          <StatTile key={k} label={RECON_LABEL[k]!} value={counts[k] ?? 0} tone={(counts[k] ?? 0) > 0 ? 'clay' : 'forest'}
                    active={issue === k} onClick={() => setIssue(issue === k ? '' : k)} />
        ))}
      </div>
      {q.isLoading ? <div className="text-[13px] text-muted">Loading…</div> :
       q.isError ? <div className="text-[13px] text-clay">Couldn't load this report.</div> :
       rows.length === 0 ? <div className="rounded-[14px] border border-line bg-paper px-4 py-3 text-[13px] text-muted">Nothing to reconcile in this range.</div> : (
        <div className="rounded-[14px] border border-line bg-paper overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="border-b border-line"><tr>
              {['Date', 'Issue', 'Pickup', 'Ref #', 'Details'].map((h) => <th key={h} className="px-3 py-2 text-left text-[11px] font-extrabold uppercase tracking-[.05em] text-muted">{h}</th>)}
            </tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.issue}-${r.pickupId ?? 'k'}-${i}`} className="border-b border-line/70">
                  <td className="px-3 py-2 whitespace-nowrap">{fmtDay(r.date) || r.date}</td>
                  <td className="px-3 py-2 font-bold text-clay whitespace-nowrap">{RECON_LABEL[r.issue] ?? r.issue}</td>
                  <td className="px-3 py-2">{r.label}</td>
                  <td className="px-3 py-2 text-muted">{r.ref ?? (r.pickupId ? `id ${r.pickupId}` : '—')}</td>
                  <td className="px-3 py-2 text-muted">{r.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ReportTabs({ view, setView }: { view: ReportView; setView: (v: ReportView) => void }) {
  const tab = (key: ReportView, label: string) => (
    <button onClick={() => setView(key)}
            className={cx('haptic text-[13px] font-bold rounded-full px-4 py-1.5 border-2 transition',
              view === key ? 'bg-forest text-paper border-forest' : 'bg-paper text-forest border-line hover:border-forest')}>
      {label}
    </button>
  );
  return (
    <div className="flex gap-2 flex-wrap">
      {tab('pickups', 'Pickup history')}
      {tab('drivers', 'Recently active drivers')}
      {tab('activity', 'Driver activity')}
      {tab('sms-delivery', 'SMS delivery')}
      {tab('steady', 'Steady pickup performance')}
      {tab('reconciliation', 'Reconciliation')}
      {tab('gas', 'Rewards')}
    </div>
  );
}

// Sep 15 client #5 — Per-recipient SMS delivery report. Reads
// zlz.sms_send_log (populated by logSmsSendAttempt in the sweeper
// call-sites). Delivery-webhook confirmation from TextMagic is a
// follow-up; today's status transitions are 'requested' → 'sent' or
// 'failed' based on the TextMagic API response.
type SmsDeliveryRow = {
  id: number; phone: string; phoneFormatted: string;
  volunteer_id: number | null; volunteer_name: string | null; unit_number: number | null;
  body_preview: string; source: string; broadcast_id: number | null;
  external_id: string | null;
  status: string; status_label: string;
  reason: string | null; reason_label: string | null;
  requested_at: string; sent_at: string | null; delivered_at: string | null; failed_at: string | null;
};
type SmsDeliveryRes = { data: SmsDeliveryRow[]; totals: Record<string, number>; range: string };
// Oct 14 client: texts that failed, by send, each person with the reason (TextDrip's own error),
// + "Resend to failed" — goes ONLY to the people whose text failed, asks first; the server allows
// it for the office only (not view-only) and resends each failed text at most once.
type FailedPerson = { id: number; name: string | null; unit: number | null; phone: string; reason: string | null; reasonLabel: string | null; canResend: boolean; resentAt: string | null; resentOk: boolean | null };
type FailedSend = { source: string; at: string; body: string; people: FailedPerson[] };
type ResendRes = { data: { background?: boolean; resent: number | null; failed: number | null; skipped: Array<{ id: number; why: string }> } };
function FailedSends({ range }: { range: string }) {
  const qc = useQueryClient();
  const [msg, setMsg] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ['sms-failed-sends', range],
    queryFn: () => api<{ data: { sends: FailedSend[] } }>(`/api/reports/sms-failed-sends?range=${range === 'all' ? 'month' : range}`),
    refetchInterval: 30_000,
  });
  const resend = useMutation({
    mutationFn: (ids: number[]) => api<ResendRes>('/api/reports/sms-failed-sends/resend', { method: 'POST', body: JSON.stringify({ ids }) }),
    onSuccess: (r) => {
      const d = r.data;
      const why = [...new Set((d.skipped ?? []).map((x) => x.why))].join(', ');
      setMsg(d.background ? 'Resending in the background — this list updates in a minute.'
        : `Resent ${d.resent ?? 0}${d.failed ? ` · ${d.failed} failed again` : ''}${d.skipped?.length ? ` · ${d.skipped.length} skipped (${why})` : ''}.`);
      qc.invalidateQueries({ queryKey: ['sms-failed-sends'] });
      qc.invalidateQueries({ queryKey: ['sms-delivery'] });
    },
    onError: (e: Error) => setMsg(e.message),
  });
  const sends = q.data?.data.sends ?? [];
  if (sends.length === 0) return null;
  return (
    <div className="rounded-[14px] border border-line bg-paper p-3 space-y-2" data-testid="failed-sends">
      <div className="text-[11.5px] font-extrabold uppercase tracking-wider text-muted">Texts that failed</div>
      {msg && <div className="text-[12px] font-semibold text-ink">{msg}</div>}
      {sends.map((s) => {
        const ids = s.people.filter((p) => p.canResend).map((p) => p.id);
        return (
          <div key={`${s.source}-${s.at}`} className="rounded-[10px] border border-line px-2.5 py-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[12.5px] font-bold text-ink">
                {fmtDateTimeEastern(s.at)} · {s.source} · <span className="text-clay">{s.people.length} failed</span>
              </div>
              {ids.length > 0 && (
                <button type="button" disabled={resend.isPending}
                        onClick={async () => {
                          const ok = await uiConfirm(`Resend this text to the ${ids.length} ${ids.length === 1 ? 'person' : 'people'} whose text failed?\n\nOnly they get it — nobody who already got it.`);
                          if (ok) resend.mutate(ids);
                        }}
                        className="haptic shrink-0 text-[12px] font-bold rounded-full px-3 py-1 border border-clay text-clay bg-paper disabled:opacity-50">
                  {resend.isPending ? 'Sending…' : `Resend to failed (${ids.length})`}
                </button>
              )}
            </div>
            <div className="text-[11.5px] text-muted truncate" title={s.body}>{s.body}</div>
            <ul className="mt-1 space-y-0.5">
              {s.people.map((p) => (
                <li key={p.id} className="text-[12px] leading-snug">
                  <span className="font-semibold">{p.name ?? `…${p.phone.slice(-4)}`}{p.unit != null ? ` #${p.unit}` : ''}</span>
                  <span className="text-muted" title={p.reason ?? undefined}> — {p.reasonLabel ?? 'failed'}</span>
                  {p.resentAt && (
                    <span className={cx('ml-1 font-bold', p.resentOk === false ? 'text-clay' : 'text-forest')}>
                      {p.resentOk === false ? '· resend failed' : p.resentOk ? '· resent ✓' : '· resending…'}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function SmsDeliveryReport() {
  const [range, setRange] = useState<'day' | 'week' | 'month' | 'all'>('day');
  const [status, setStatus] = useState<string>('');
  const [source, setSource] = useState<string>('');
  const q = useQuery<SmsDeliveryRes>({
    queryKey: ['sms-delivery', range, status, source],
    queryFn: () => {
      const qs = new URLSearchParams({ range });
      if (status) qs.set('status', status);
      if (source) qs.set('source', source);
      return api<SmsDeliveryRes>(`/api/reports/sms-delivery?${qs}`);
    },
    refetchInterval: 30_000,
    placeholderData: (prev) => prev, // Oct 8: no tile blink while a filter loads
  });
  const rows = q.data?.data ?? [];
  const totals = q.data?.totals ?? { requested: 0, sent: 0, failed: 0, suppressed: 0, delivered: 0, all: 0 };
  const sourceOptions = Array.from(new Set(rows.map((r) => r.source))).sort();
  return (
    <div className="space-y-3">
      <div className="rounded-[14px] border border-line bg-paper p-3 space-y-2">
        <div className="text-[11.5px] font-extrabold uppercase tracking-wider text-muted">Range</div>
        <div className="flex gap-1.5 flex-wrap">
          {(['day', 'week', 'month', 'all'] as const).map((r) => (
            <button key={r} onClick={() => setRange(r)}
                    className={cx('haptic text-[12px] font-bold rounded-full px-3 py-1 border',
                      range === r ? 'bg-forest text-paper border-forest' : 'bg-paper text-forest border-line')}>
              {r === 'day' ? 'Today (NY)' : r === 'week' ? '7 days' : r === 'month' ? '30 days' : 'All time'}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
        <StatTile label="Total in log" value={totals.all ?? 0} tone="forest"
                  active={!status} onClick={() => setStatus('')} />
        <StatTile label="Sent"         value={totals.sent ?? 0}      tone="forest"
                  active={status === 'sent'}      onClick={() => setStatus(status === 'sent' ? '' : 'sent')} />
        <StatTile label="Delivered"    value={totals.delivered ?? 0} tone="forest"
                  active={status === 'delivered'} onClick={() => setStatus(status === 'delivered' ? '' : 'delivered')} />
        <StatTile label="Requested"    value={totals.requested ?? 0} tone="amber"
                  active={status === 'requested'} onClick={() => setStatus(status === 'requested' ? '' : 'requested')} />
        <StatTile label="Failed"       value={totals.failed ?? 0}    tone="clay"
                  active={status === 'failed'}    onClick={() => setStatus(status === 'failed' ? '' : 'failed')} />
        <StatTile label="Suppressed"   value={totals.suppressed ?? 0} tone="sky"
                  active={status === 'suppressed'} onClick={() => setStatus(status === 'suppressed' ? '' : 'suppressed')} />
      </div>
      {sourceOptions.length > 1 && (
        <div className="rounded-[14px] border border-line bg-paper p-3">
          <div className="text-[11.5px] font-extrabold uppercase tracking-wider text-muted mb-1">Source</div>
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => setSource('')}
                    className={cx('haptic text-[11.5px] font-bold rounded-full px-2.5 py-0.5 border',
                      !source ? 'bg-forest text-paper border-forest' : 'bg-paper text-forest border-line')}>
              All
            </button>
            {sourceOptions.map((s) => (
              <button key={s} onClick={() => setSource(source === s ? '' : s)}
                      className={cx('haptic text-[11.5px] font-bold rounded-full px-2.5 py-0.5 border',
                        source === s ? 'bg-forest text-paper border-forest' : 'bg-paper text-forest border-line')}>
                {s}
              </button>
            ))}
          </div>
        </div>
      )}
      <FailedSends range={range} />
      <div className="rounded-[14px] border border-line bg-paper overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead className="bg-cream/60 text-muted uppercase tracking-wider text-[10.5px] font-extrabold">
            <tr>
              <th className="text-left px-3 py-1.5">When</th>
              <th className="text-left px-3 py-1.5">Recipient</th>
              <th className="text-left px-3 py-1.5">Source</th>
              <th className="text-left px-3 py-1.5">Status</th>
              <th className="text-left px-3 py-1.5">Message</th>
            </tr>
          </thead>
          <tbody>
            {q.isLoading && <tr><td colSpan={5} className="text-center py-6 text-muted italic">Loading…</td></tr>}
            {!q.isLoading && rows.length === 0 && (
              <tr><td colSpan={5} className="text-center py-6 text-muted italic">
                No SMS send-log rows for this range. The log fills automatically as broadcasts fire.
              </td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-line/50 align-top">
                <td className="px-3 py-1.5 whitespace-nowrap text-muted">{fmtDateTimeEastern(r.requested_at)}</td>
                <td className="px-3 py-1.5">
                  <div className="font-bold text-ink">{r.volunteer_name ?? 'Unknown'} {r.unit_number != null && <span className="text-muted font-semibold text-[11px]">#{r.unit_number}</span>}</div>
                  <div className="text-[11px] text-muted">{r.phoneFormatted}</div>
                </td>
                <td className="px-3 py-1.5 text-muted">{r.source}</td>
                <td className="px-3 py-1.5">
                  <div className={cx('font-bold',
                    r.status === 'sent' || r.status === 'delivered' ? 'text-forest' :
                    r.status === 'failed'                            ? 'text-clay'   :
                    r.status === 'suppressed'                        ? 'text-sky-deep' :
                                                                       'text-amber-700')}>
                    {r.status_label}
                  </div>
                  {r.reason_label && <div className="text-[11px] text-muted">{r.reason_label}</div>}
                </td>
                <td className="px-3 py-1.5 max-w-[360px]">
                  <div className="text-ink truncate" title={r.body_preview}>{r.body_preview}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="text-[11px] text-muted italic">
        Delivery-webhook confirmation from TextMagic is not yet wired. Rows go
        from "Requested" → "Sent" (TextMagic accepted) or "Failed" today.
        A future integration will move sent rows to "Delivered" or "Failed"
        based on the carrier's callback.
      </div>
    </div>
  );
}

function fmtDateTime(ts: string | null): string {
  if (!ts) return '—';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// Sep 2 client ask: date-range filter on Recently Active Drivers.
// Values are NY-local YYYY-MM-DD; empty string means unbounded.
type DatePreset = 'all' | 'today' | 'week' | 'month' | 'custom';

function nyDate(offsetDays = 0): string {
  const now = new Date();
  const ny = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  ny.setDate(ny.getDate() + offsetDays);
  const y = ny.getFullYear();
  const m = String(ny.getMonth() + 1).padStart(2, '0');
  const d = String(ny.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function startOfWeekNY(): string {
  // Sunday-based week (matches US convention + the existing report presets).
  const now = new Date();
  const ny = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  ny.setDate(ny.getDate() - ny.getDay());
  const y = ny.getFullYear();
  const m = String(ny.getMonth() + 1).padStart(2, '0');
  const d = String(ny.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function startOfMonthNY(): string {
  const now = new Date();
  const ny = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const y = ny.getFullYear();
  const m = String(ny.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

function ActiveDriversReport() {
  const [sort, setSort] = useState<'desc' | 'asc'>('desc');
  const [preset, setPreset] = useState<DatePreset>('all');
  const [customFrom, setCustomFrom] = useState<string>('');
  const [customTo, setCustomTo] = useState<string>('');
  const [exportBusy, setExportBusy] = useState(false);
  const [openVol, setOpenVol] = useState<ActiveDriverRow | null>(null);

  // Resolve the preset (or the two custom pickers) into concrete YYYY-MM-DD
  // dates. Empty string = unbounded on that side. "all" leaves both empty.
  const today = nyDate(0);
  const dateFrom = preset === 'today' ? today
                 : preset === 'week'  ? startOfWeekNY()
                 : preset === 'month' ? startOfMonthNY()
                 : preset === 'custom' ? customFrom
                 : '';
  const dateTo   = preset === 'today' ? today
                 : preset === 'week'  ? today
                 : preset === 'month' ? today
                 : preset === 'custom' ? customTo
                 : '';

  const params = new URLSearchParams({ sort });
  if (dateFrom) params.set('date_from', dateFrom);
  if (dateTo)   params.set('date_to',   dateTo);
  const q = useQuery({
    queryKey: ['reports-active-drivers', sort, dateFrom, dateTo],
    queryFn: () => api<{ data: ActiveDriverRow[]; sort: string }>(`/api/reports/active-drivers?${params.toString()}`),
  });
  const rows = q.data?.data ?? [];

  const rangeLabel = preset === 'all'    ? 'all time'
                   : preset === 'today'  ? `today (${today})`
                   : preset === 'week'   ? `this week (${dateFrom} → ${today})`
                   : preset === 'month'  ? `this month (${dateFrom} → ${today})`
                   : preset === 'custom' && dateFrom && dateTo ? `${dateFrom} → ${dateTo}`
                   : preset === 'custom' && dateFrom            ? `from ${dateFrom}`
                   : preset === 'custom' && dateTo              ? `until ${dateTo}`
                   :                                              'custom range (pick dates)';

  function exportCsv() {
    setExportBusy(true);
    try {
      const head = ['Volunteer', 'Unit', 'Last activity', 'Last activity type', 'Last activity detail', 'Done (checked in / marked done)', 'Took it, not checked in', 'Accepted', 'Kiosk sign-ins'];
      const lines = rows.map((r) => [
        `${r.firstName} ${r.lastName}`.trim(),
        r.unitNumber != null ? `#${r.unitNumber}` : '',
        fmtDateTime(r.lastActivityAt),
        r.lastActivityType ?? '',
        r.lastActivityLabel ?? '',
        String(r.totalCompleted ?? 0),
        String(r.totalTaken ?? 0),
        String(r.totalAccepted ?? 0),
        String(r.totalKiosk ?? 0),
      ].map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','));
      const csv = [head.join(','), ...lines].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const rangeSlug = preset === 'all' ? 'all-time'
                     : preset === 'custom' ? `${dateFrom || 'start'}_${dateTo || 'today'}`
                     : `${dateFrom}_${dateTo}`;
      a.href = url; a.download = `zlz-active-drivers-${sort}-${rangeSlug}.csv`; a.click();
      URL.revokeObjectURL(url);
    } finally { setExportBusy(false); }
  }

  const presetBtn = 'haptic text-[12.5px] font-bold text-forest bg-sage/60 hover:bg-sage rounded-full px-3 py-1';
  const rangeBtn = (key: DatePreset, label: string) => (
    <button key={key} onClick={() => setPreset(key)} className={cx(presetBtn, preset === key ? 'bg-sage ring-2 ring-forest/30' : '')}>
      {label}
    </button>
  );
  const th = 'px-3 py-2.5 font-extrabold uppercase text-[11.5px] tracking-[.06em] text-muted';
  return (
    <div className="space-y-4">
      <div className="bg-paper border border-line rounded-[14px] p-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[12.5px] font-bold text-muted">Date range:</span>
          {rangeBtn('all',    'All time')}
          {rangeBtn('today',  'Today')}
          {rangeBtn('week',   'This week')}
          {rangeBtn('month',  'This month')}
          {rangeBtn('custom', 'Custom')}
          {preset === 'custom' && (
            <span className="flex items-center gap-1 ml-1">
              <DateInput value={customFrom} onChange={setCustomFrom}
                     className="border border-line rounded-[8px] px-2 py-1 text-[12.5px] bg-paper" />
              <span className="text-[12.5px] text-muted">→</span>
              <DateInput value={customTo} onChange={setCustomTo}
                     className="border border-line rounded-[8px] px-2 py-1 text-[12.5px] bg-paper" />
            </span>
          )}
        </div>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[12.5px] font-bold text-muted">Sort:</span>
            <button onClick={() => setSort('desc')} className={cx(presetBtn, sort === 'desc' ? 'bg-sage ring-2 ring-forest/30' : '')}>Most recently active</button>
            <button onClick={() => setSort('asc')}  className={cx(presetBtn, sort === 'asc'  ? 'bg-sage ring-2 ring-forest/30' : '')}>Least recently active</button>
          </div>
          <button onClick={exportCsv} disabled={rows.length === 0 || exportBusy}
                  className="haptic bg-forest text-paper font-bold text-[13px] rounded-[10px] px-3 py-2 disabled:opacity-40">
            {exportBusy ? 'Exporting…' : '⬇ Export CSV'}
          </button>
        </div>
      </div>

      <div className="bg-paper border border-line rounded-[14px] overflow-hidden">
        <div className="px-4 py-2.5 border-b border-line flex items-center justify-between gap-3 flex-wrap">
          <div className="text-[13px] font-extrabold uppercase tracking-[.06em] text-muted">
            {q.isLoading ? 'Loading…' : `${rows.length} volunteer${rows.length === 1 ? '' : 's'} · ${rangeLabel}`}
          </div>
          <div className="text-[11.5px] text-muted">Activity = done · took it (not checked in) · accepted · kiosk sign-ins. Click a name for the full timeline.</div>
          {q.error && <div className="text-[12.5px] text-clay">{(q.error as Error).message}</div>}
        </div>
        {q.isLoading ? (
          <div className="text-[13.5px] text-muted py-8 text-center">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="text-[13.5px] text-muted py-8 text-center">No volunteers found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13.5px]">
              <thead>
                <tr className="text-left border-b border-line bg-cream/40">
                  <th className={th}>Volunteer</th>
                  <th className={th}>Unit</th>
                  <th className={th}>Most recent activity</th>
                  <th className={th}>Detail</th>
                  <th className={cx(th, 'text-right')} title="Checked in at the kiosk, replied DONE, or marked done by the office">Done</th>
                  <th className={cx(th, 'text-right')} title="Took the pickup but no kiosk sign-in or DONE reply yet">Took it, not checked in</th>
                  <th className={cx(th, 'text-right')}>Accepted</th>
                  <th className={cx(th, 'text-right')}>Kiosk</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.volunteerId} className="border-b border-line/70 hover:bg-cream/40">
                    <td className="px-3 py-2">
                      <button onClick={() => setOpenVol(r)}
                              className="haptic font-bold text-forest hover:underline text-left">
                        {r.firstName} {r.lastName}
                      </button>
                    </td>
                    <td className="px-3 py-2 text-muted tabular-nums">{r.unitNumber != null ? `#${r.unitNumber}` : '—'}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        {typeBadge(r.lastActivityType)}
                        <span className="text-ink tabular-nums">{fmtDateTime(r.lastActivityAt)}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-ink">{r.lastActivityLabel || (r.lastActivityAt ? '—' : (preset === 'all' ? 'No activity yet' : 'No activity in this range'))}</td>
                    <td className="px-3 py-2 text-ink tabular-nums font-bold text-right">{r.totalCompleted}</td>
                    <td className={cx('px-3 py-2 tabular-nums text-right', (r.totalTaken ?? 0) > 0 ? 'text-[#9a7415] font-bold' : 'text-ink')}>{r.totalTaken ?? 0}</td>
                    <td className="px-3 py-2 text-ink tabular-nums text-right">{r.totalAccepted}</td>
                    <td className="px-3 py-2 text-ink tabular-nums text-right">{r.totalKiosk}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {openVol && <VolunteerActivityModal vol={openVol} dateFrom={dateFrom} dateTo={dateTo} rangeLabel={rangeLabel} onClose={() => setOpenVol(null)} />}
    </div>
  );
}

// Oct 7 client: list behind the Distinct stores / Distinct drivers tiles.
type BreakdownRow = { id: number; name: string; unitNumber?: number | null; isActive: boolean; pickups: number; completed: number; taken?: number };
function BreakdownModal({ by, qs, onClose, onPick, onOpenRoster }: {
  by: 'supplier' | 'volunteer'; qs: URLSearchParams;
  onClose: () => void; onPick: (id: number) => void; onOpenRoster: () => void;
}) {
  const params = new URLSearchParams(qs);
  params.delete('status');
  params.set('by', by);
  const q = useQuery({
    queryKey: ['reports-breakdown', params.toString()],
    queryFn: () => api<{ data: BreakdownRow[] }>(`/api/reports/pickups/breakdown?${params}`),
  });
  const items = q.data?.data ?? [];
  const noun = by === 'supplier' ? 'stores' : 'drivers';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-paper rounded-[16px] border border-line max-w-lg w-full max-h-[80vh] overflow-hidden flex flex-col"
           onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-line flex items-start justify-between gap-3">
          <div>
            <div className="font-display font-bold text-[18px] text-ink">{items.length} {noun} in this report</div>
            <div className="text-[12px] text-muted">Tap one to filter the report to it.</div>
          </div>
          <button onClick={onClose} aria-label="Close" className="haptic text-muted hover:text-ink text-[22px] leading-none px-1">×</button>
        </div>
        <div className="overflow-y-auto p-2">
          {q.isLoading ? (
            <div className="text-[13.5px] text-muted py-6 text-center">Loading…</div>
          ) : items.length === 0 ? (
            <div className="text-[13.5px] text-muted py-6 text-center">No {noun} in this range.</div>
          ) : items.map((it) => (
            <button key={it.id} onClick={() => onPick(it.id)}
                    className="haptic w-full flex items-center justify-between gap-3 px-3 py-2 rounded-[10px] hover:bg-cream text-left">
              <span className="text-[14px] font-semibold text-ink truncate">
                {it.name}{it.unitNumber != null ? ` #${it.unitNumber}` : ''}
                {!it.isActive && <span className="ml-1.5 text-[11px] text-muted">(inactive)</span>}
              </span>
              <span className="shrink-0 text-[12.5px] text-muted tabular-nums">
                <b className="text-ink">{it.pickups}</b> pickups · {it.completed} done{it.taken ? ` · ${it.taken} not checked in` : ''}
              </span>
            </button>
          ))}
        </div>
        <div className="px-4 py-2.5 border-t border-line text-right">
          <button onClick={onOpenRoster} className="text-[12.5px] font-bold text-forest hover:underline">
            Open the full {by === 'supplier' ? 'Stores' : 'Volunteers'} tab →
          </button>
        </div>
      </div>
    </div>
  );
}

function VolunteerActivityModal({ vol, dateFrom, dateTo, rangeLabel, onClose }: {
  vol: ActiveDriverRow; dateFrom: string; dateTo: string; rangeLabel: string; onClose: () => void;
}) {
  const params = new URLSearchParams();
  if (dateFrom) params.set('date_from', dateFrom);
  if (dateTo)   params.set('date_to',   dateTo);
  const qs = params.toString();
  const q = useQuery({
    queryKey: ['volunteer-activity', vol.volunteerId, dateFrom, dateTo],
    queryFn: () => api<{ volunteer: any; data: ActivityEntry[] }>(
      `/api/reports/volunteers/${vol.volunteerId}/history${qs ? '?' + qs : ''}`),
  });
  const items = q.data?.data ?? [];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-paper rounded-[16px] border border-line max-w-lg w-full max-h-[80vh] overflow-hidden flex flex-col"
           onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-line flex items-start justify-between gap-3">
          <div>
            <div className="font-display font-bold text-[18px] text-ink">{vol.firstName} {vol.lastName}</div>
            <div className="text-[12px] text-muted">
              {vol.unitNumber != null ? `Unit #${vol.unitNumber} · ` : ''}
              {vol.totalCompleted} done · {vol.totalTaken ?? 0} took it, not checked in · {vol.totalAccepted} accepted · {vol.totalKiosk} kiosk
            </div>
            <div className="text-[11px] text-muted mt-0.5">{rangeLabel}</div>
          </div>
          <button onClick={onClose} aria-label="Close" className="haptic text-muted hover:text-ink text-[22px] leading-none px-1">×</button>
        </div>
        <div className="overflow-y-auto p-4 space-y-2">
          {q.isLoading ? (
            <div className="text-[13.5px] text-muted py-6 text-center">Loading…</div>
          ) : items.length === 0 ? (
            <div className="text-[13.5px] text-muted py-6 text-center">{dateFrom || dateTo ? 'No activity in this range.' : 'No activity recorded yet.'}</div>
          ) : items.map((it, i) => (
            <div key={i} className="flex items-start gap-3 border-b border-line/60 pb-2 last:border-0">
              <div className="shrink-0 w-[122px]">{typeBadge(it.type)}</div>
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] text-ink font-semibold">{it.label || '—'}</div>
                <div className="text-[12px] text-muted tabular-nums">{fmtDateTime(it.at)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatTile({ label, value, tone, active, onClick }: {
  label: string;
  value: number;
  tone: 'forest' | 'clay' | 'amber' | 'sky';
  active?: boolean;
  onClick?: () => void;
}) {
  const bg =
    tone === 'forest' ? 'bg-sage border-sage-line text-forest' :
    tone === 'clay'   ? 'bg-clay-soft border-clay/30 text-clay' :
    tone === 'amber'  ? 'bg-amber-soft border-amber/30 text-[#8a6011]' :
                        'bg-sky-soft border-sky/30 text-[#1d4a6a]';
  // Sep 8 client (#B1): make summary cards clickable filters. Active state
  // shows a thick ring so the operator can see which filter is applied at
  // a glance. Non-clickable tiles (miles/hours/distinct-x) keep their
  // original div for now.
  const activeRing = active ? 'ring-4 ring-forest-deep/40 shadow-inner' : '';
  const clickable = !!onClick;
  if (!clickable) {
    return (
      <div className={cx('rounded-[14px] border-2 px-4 py-3', bg)}>
        <div className="font-display font-bold text-[28px] leading-none">{value}</div>
        <div className="text-[12.5px] font-bold mt-1.5">{label}</div>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx('text-left rounded-[14px] border-2 px-4 py-3 haptic transition hover:-translate-y-0.5 hover:shadow-soft', bg, activeRing)}
      aria-pressed={active}
    >
      <div className="font-display font-bold text-[28px] leading-none">{value}</div>
      <div className="text-[12.5px] font-bold mt-1.5">{label}{active && ' ·'}</div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Sep 8 client (#B3/#B4) — Driver Activity report.
//
// Two axes:
//   • Volunteer status — the label configured in Settings (v.status column).
//   • Activity status — auto-calculated from VERIFIED events only:
//       - completed pickup (piv.completed_at)  OR
//       - matched kiosk sign-in (dropoff line linked to a piv row for this driver).
//   Accepting a pickup does NOT count as verified.
//
// Buckets:
//   active                 → verified activity within activeDays (default 30)
//   needs_followup         → last verified 31..followupDays (default 60)
//   inactive               → no verified for > followupDays
//   never_started          → zero verified + zero accepted
//   accepted_not_verified  → accepted but never completed / matched kiosk
//   data_mismatch          → has kiosk sign-ins but none match an assigned pickup
// ---------------------------------------------------------------------------
const ACTIVITY_LABELS: Record<string, string> = {
  active:                 'Active',
  needs_followup:         'Needs follow-up',
  inactive:               'Inactive',
  never_started:          'Never started',
  accepted_not_verified:  'Accepted — not verified',
  data_mismatch:          'Data mismatch',
};
const ACTIVITY_TONES: Record<string, string> = {
  active:                 'bg-sage text-forest border-sage-line',
  needs_followup:         'bg-amber-soft text-[#8a6011] border-amber/30',
  inactive:               'bg-neutral-100 text-neutral-600 border-neutral-300',
  never_started:          'bg-neutral-100 text-neutral-600 border-neutral-300',
  accepted_not_verified:  'bg-clay-soft text-clay border-clay/30',
  data_mismatch:          'bg-red-100 text-red-700 border-red-300',
};

function DriverActivityReport() {
  const qc = useQueryClient();
  type DriverActivityRow = {
    id: number; firstName: string; lastName: string; unitNumber: number | null;
    volunteerStatus: string | null; volunteerActive: boolean;
    activityStatus: 'active' | 'needs_followup' | 'inactive' | 'never_started' | 'accepted_not_verified' | 'data_mismatch';
    smsOptIn: boolean; wantsSteady: boolean;
    acceptedCount: number; completedCount: number; assignedPendingCount: number;
    kioskCount: number; matchedKioskCount: number;
    lastAcceptedAt: string | null; lastCompletedAt: string | null;
    lastMatchedKioskAt: string | null; lastVerifiedAt: string | null;
  };
  type DriverActivityRes = { data: DriverActivityRow[]; summary: Record<string, number>; thresholds: { active: number; followup: number } };
  const q = useQuery<DriverActivityRes>({ queryKey: ['driver-activity'], queryFn: () => api<DriverActivityRes>('/api/reports/driver-stats'), refetchInterval: 30_000 });
  const rows    = q.data?.data ?? [];
  const summary = q.data?.summary ?? {};
  const thr     = q.data?.thresholds ?? { active: 30, followup: 60 };
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [q_search, setSearch] = useState('');

  // Live-editable thresholds (persisted server-side).
  const [editThr, setEditThr] = useState(false);
  const [tActive, setTActive]   = useState<number>(thr.active);
  const [tFollow, setTFollow]   = useState<number>(thr.followup);
  useEffect(() => { setTActive(thr.active); setTFollow(thr.followup); }, [thr.active, thr.followup]);
  const saveThr = useMutation({
    mutationFn: () => api<{ data: { active: number; followup: number } }>('/api/settings/driver-thresholds', {
      method: 'POST', body: JSON.stringify({ active: tActive, followup: tFollow }),
    }),
    onSuccess:  () => { setEditThr(false); qc.invalidateQueries({ queryKey: ['driver-activity'] }); },
  });

  const filtered = rows
    .filter((r) => statusFilter === 'all' || r.activityStatus === statusFilter)
    .filter((r) => {
      const s = q_search.trim().toLowerCase();
      if (!s) return true;
      const name = `${r.firstName ?? ''} ${r.lastName ?? ''}`.trim();
      const unit = String(r.unitNumber ?? '');
      return name.toLowerCase().includes(s) || unit.includes(s);
    });

  const ORDER: Array<keyof typeof ACTIVITY_LABELS> = ['active','needs_followup','inactive','accepted_not_verified','never_started','data_mismatch'];

  return (
    <div className="space-y-3">
      {/* Summary cards — click to filter. */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
        <StatTile label="All drivers" value={rows.length} tone="forest"
                  active={statusFilter === 'all'}
                  onClick={() => setStatusFilter('all')} />
        {ORDER.map((k) => (
          <StatTile key={k} label={ACTIVITY_LABELS[k]} value={summary[k] ?? 0}
                    tone={
                      k === 'active' ? 'forest' :
                      k === 'needs_followup' ? 'amber' :
                      k === 'data_mismatch' || k === 'accepted_not_verified' ? 'clay' :
                                     'sky'
                    }
                    active={statusFilter === k}
                    onClick={() => setStatusFilter(statusFilter === k ? 'all' : k)} />
        ))}
      </div>

      {/* Threshold config — inline. */}
      <div className="bg-paper border border-line rounded-[12px] p-3 flex items-center gap-3 flex-wrap text-[13px]">
        <span className="font-bold">Activity thresholds (NY days):</span>
        {editThr ? (
          <>
            <label className="flex items-center gap-1">Active ≤
              <input type="number" min={1} max={365} value={tActive}
                     onChange={(e) => setTActive(Math.max(1, Number(e.target.value)))}
                     className="border border-line rounded px-2 py-1 w-16" />
            </label>
            <label className="flex items-center gap-1">Follow-up ≤
              <input type="number" min={2} max={730} value={tFollow}
                     onChange={(e) => setTFollow(Math.max(tActive + 1, Number(e.target.value)))}
                     className="border border-line rounded px-2 py-1 w-16" />
            </label>
            <button onClick={() => saveThr.mutate()} disabled={saveThr.isPending}
                    className="haptic bg-forest text-paper font-bold px-3 py-1 rounded-[8px]">Save</button>
            <button onClick={() => setEditThr(false)}
                    className="text-muted font-bold px-2">Cancel</button>
          </>
        ) : (
          <>
            <span>Active ≤ <b>{thr.active}d</b> · Needs follow-up ≤ <b>{thr.followup}d</b> · Inactive &gt; <b>{thr.followup}d</b></span>
            <button onClick={() => setEditThr(true)}
                    className="text-forest font-bold underline text-[12px]">Change</button>
          </>
        )}
      </div>

      {/* Search. */}
      <div className="flex items-center gap-2 flex-wrap">
        <input value={q_search} onChange={(e) => setSearch(e.target.value)}
               placeholder="Search name or unit #…"
               className="border border-line rounded-[10px] px-3 py-2 text-[13px] w-full max-w-[340px]" />
        <button onClick={() => q.refetch()} className="text-[12px] font-bold text-forest hover:underline">Refresh</button>
        <div className="flex-1" />
        <span className="text-[12px] text-muted">{filtered.length} of {rows.length}</span>
      </div>

      {q.isLoading ? <div className="text-[13px] text-muted">Loading…</div> :
       filtered.length === 0 ? <div className="text-[13px] text-muted">No drivers match.</div> :
       <div className="overflow-x-auto border border-line rounded-[12px]">
         <table className="w-full text-[13px]">
           <thead className="bg-cream text-muted uppercase tracking-wide text-[11px]">
             <tr>
               <th className="text-left px-3 py-2">Driver</th>
               <th className="text-left px-3 py-2">Unit</th>
               <th className="text-left px-3 py-2">Activity</th>
               <th className="text-left px-3 py-2">Volunteer status</th>
               <th className="text-right px-3 py-2">Accepted</th>
               <th className="text-right px-3 py-2">Completed</th>
               <th className="text-right px-3 py-2">Kiosk (matched)</th>
               <th className="text-right px-3 py-2">Accept-not-verified</th>
               <th className="text-left px-3 py-2">Last verified</th>
               <th className="text-left px-3 py-2">SMS</th>
             </tr>
           </thead>
           <tbody className="divide-y divide-line">
             {filtered.map((r) => {
               const unverifiedAccepts = Math.max(0, r.acceptedCount - r.completedCount - r.matchedKioskCount);
               return (
                 <tr key={r.id} className="hover:bg-cream/40">
                   <td className="px-3 py-2 font-bold">{r.firstName} {r.lastName}</td>
                   <td className="px-3 py-2">{r.unitNumber ?? '—'}</td>
                   <td className="px-3 py-2">
                     <span className={cx('px-2 py-0.5 rounded-full text-[11px] font-extrabold border', ACTIVITY_TONES[r.activityStatus] ?? 'bg-neutral-100 text-neutral-600 border-neutral-300')}>
                       {ACTIVITY_LABELS[r.activityStatus] ?? r.activityStatus}
                     </span>
                   </td>
                   <td className="px-3 py-2 text-muted">
                     {r.volunteerStatus ?? (r.volunteerActive ? 'Active' : 'Inactive')}
                   </td>
                   <td className="px-3 py-2 text-right">{r.acceptedCount}</td>
                   <td className="px-3 py-2 text-right">{r.completedCount}</td>
                   <td className="px-3 py-2 text-right">{r.matchedKioskCount} / {r.kioskCount}</td>
                   <td className={cx('px-3 py-2 text-right', unverifiedAccepts > 0 && 'text-clay font-bold')}>{unverifiedAccepts}</td>
                   <td className="px-3 py-2 text-muted">{fmtDateTime(r.lastVerifiedAt)}</td>
                   <td className="px-3 py-2 text-muted">{r.smsOptIn ? 'On' : 'Off'}</td>
                 </tr>
               );
             })}
           </tbody>
         </table>
       </div>
      }
    </div>
  );
}
