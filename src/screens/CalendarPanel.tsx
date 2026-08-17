/**
 * CalendarPanel — unified ops calendar for the coordinator portal.
 *
 * Client Aug 12. One place to see every scheduled thing:
 *   - Pickup instances (one-time + steady-materialized)
 *   - Dispatcher shifts
 *   - Center Help instances
 *
 * Reads /api/admin/schedule-events?from=&to= and renders Day / Week / Month
 * views with chip filters. Colour language matches the client spec so the
 * calendar reads at a glance ("green = covered · amber = needs a driver").
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { admin, api } from '../api';
import { cx } from '../design';
import { ChevronLeft, ChevronRight, Download } from 'lucide-react';

const NY_TZ = 'America/New_York';

export type ScheduleEvent = {
  id: string;
  kind: 'pickup' | 'shift' | 'center_help';
  date: string;
  time: string | null;      // HH:MM 24h NY
  endTime: string | null;   // HH:MM 24h NY
  title: string;
  subtitle: string | null;
  status:
    | 'available' | 'needs_driver' | 'assigned' | 'covered'
    | 'missed' | 'completed' | 'empty' | 'taken';
  assignedNames: string[];
  driversNeeded: number | null;
  driversAssigned: number | null;
  detailId: number;
  isSteady: boolean;
};

// ── date helpers (NY-local wall clock) ─────────────────────────────────
function todayISO_NY(): string {
  return new Date().toLocaleDateString('en-CA', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: NY_TZ,
  });
}
function parseISO(iso: string): Date {
  // Interpret as midday-UTC to sidestep DST edge cases when we only care
  // about the calendar date.
  return new Date(iso + 'T12:00:00Z');
}
function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function addDays(iso: string, days: number): string {
  const d = parseISO(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toISO(d);
}
// Sunday (0) start of week for a given YYYY-MM-DD.
function weekStart(iso: string): string {
  const d = parseISO(iso);
  const dow = d.getUTCDay(); // 0=Sun
  d.setUTCDate(d.getUTCDate() - dow);
  return toISO(d);
}
// Enclosing 6-week grid for a month view: back to the Sunday on/before
// the 1st of the month, forward 42 days total.
function monthGridStart(iso: string): string {
  const d = parseISO(iso);
  const first = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 12));
  const dow = first.getUTCDay();
  first.setUTCDate(first.getUTCDate() - dow);
  return toISO(first);
}
function monthISO(iso: string): { start: string; end: string } {
  const s = monthGridStart(iso);
  return { start: s, end: addDays(s, 41) };
}
function fmtMonthLong(iso: string): string {
  return parseISO(iso).toLocaleDateString('en-US', {
    month: 'long', year: 'numeric', timeZone: 'UTC',
  });
}
function fmtRangeLabel(view: ViewKind, cursor: string): string {
  if (view === 'day') {
    return parseISO(cursor).toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
    });
  }
  if (view === 'week') {
    const s = weekStart(cursor);
    const e = addDays(s, 6);
    const sD = parseISO(s), eD = parseISO(e);
    const sameMonth = sD.getUTCMonth() === eD.getUTCMonth();
    const left = sD.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
    const right = sameMonth
      ? eD.toLocaleDateString('en-US', { day: 'numeric', year: 'numeric', timeZone: 'UTC' })
      : eD.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
    return `${left}–${right}`;
  }
  return fmtMonthLong(cursor);
}
// Human-friendly "10:00 AM" from HH:MM.
function fmtTime12(hhmm: string | null): string {
  if (!hhmm) return '';
  const m = hhmm.match(/^(\d{2}):(\d{2})/);
  if (!m) return hhmm;
  const h = Number(m[1]); const mi = m[2];
  const ap = h >= 12 ? 'PM' : 'AM';
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${mi} ${ap}`;
}
function isTodayISO(iso: string): boolean {
  return iso === todayISO_NY();
}

// ── filter model ───────────────────────────────────────────────────────
type ViewKind = 'day' | 'week' | 'month';

type KindChip =
  | 'all' | 'pickups' | 'steady' | 'onetime'
  | 'shifts' | 'center' | 'available_shifts' | 'taken_shifts';
type StatusChip = 'needs_driver' | 'covered' | 'missed';

// ── colour language (must be consistent everywhere) ─────────────────────
function statusColors(s: ScheduleEvent['status']) {
  switch (s) {
    case 'covered':
    case 'taken':
      return { pill: 'bg-sage/40 text-forest-deep border border-forest/30', bar: 'border-forest' };
    case 'assigned':
      return { pill: 'bg-sage/40 text-forest-deep border border-forest/30', bar: 'border-forest' };
    case 'needs_driver':
    case 'empty':
      return { pill: 'bg-amber/15 text-forest-deep border border-amber/50', bar: 'border-amber' };
    case 'missed':
      return { pill: 'bg-clay/10 text-clay border border-clay/40', bar: 'border-clay' };
    case 'completed':
      return { pill: 'bg-forest/15 text-forest-deep border border-forest/40', bar: 'border-forest-deep' };
    case 'available':
    default:
      return { pill: 'bg-cream text-muted border border-line', bar: 'border-line' };
  }
}
function statusLabel(s: ScheduleEvent['status']): string {
  switch (s) {
    case 'covered':      return 'Covered';
    case 'taken':        return 'Assigned';
    case 'assigned':     return 'Assigned';
    case 'needs_driver': return 'Needs driver';
    case 'empty':        return 'Needs coverage';
    case 'missed':       return 'Missed';
    case 'completed':    return '✓ Completed';
    case 'available':    return 'Available';
    default:             return String(s);
  }
}

type Props = {
  onOpenScheduleDownload: () => void;
  onNavigateTab?: (tabKey: string, openId?: number) => void;
};

export function CalendarPanel({ onOpenScheduleDownload, onNavigateTab }: Props) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [view, setView] = useState<ViewKind>('week');
  const [cursor, setCursor] = useState<string>(todayISO_NY());
  const [kindChips, setKindChips] = useState<Set<KindChip>>(new Set(['all']));
  const [statusChips, setStatusChips] = useState<Set<StatusChip>>(new Set());
  const [personFilter, setPersonFilter] = useState<string>('');
  const [locFilter, setLocFilter] = useState<string>('');
  // C7 Aug 13: drag-drop reschedule state. Only pickups are draggable — shifts
  // and center-help have their own scheduling flows. `pendingDrop` opens the
  // confirm modal; nothing hits the DB until the user clicks Confirm.
  const [pendingDrop, setPendingDrop] = useState<{ event: ScheduleEvent; newDate: string; newTime: string } | null>(null);

  // Range needed by the visible view.
  const { fetchFrom, fetchTo } = useMemo(() => {
    if (view === 'day')   return { fetchFrom: cursor, fetchTo: cursor };
    if (view === 'week')  { const s = weekStart(cursor); return { fetchFrom: s, fetchTo: addDays(s, 6) }; }
    const m = monthISO(cursor);
    return { fetchFrom: m.start, fetchTo: m.end };
  }, [view, cursor]);

  const q = useQuery({
    queryKey: ['schedule-events', fetchFrom, fetchTo],
    queryFn: () => api<{ events: ScheduleEvent[] }>(
      `/api/admin/schedule-events?from=${fetchFrom}&to=${fetchTo}`,
    ),
    staleTime: 60_000,
  });

  const events = q.data?.events ?? [];

  // Apply client-side filters.
  const filtered = useMemo(() => {
    return events.filter((e) => {
      // Kind chips (multi-select; 'all' bypasses).
      if (!kindChips.has('all')) {
        let ok = false;
        if (kindChips.has('pickups')  && e.kind === 'pickup')      ok = true;
        if (kindChips.has('steady')   && e.kind === 'pickup' && e.isSteady)  ok = true;
        if (kindChips.has('onetime')  && e.kind === 'pickup' && !e.isSteady) ok = true;
        if (kindChips.has('shifts')   && e.kind === 'shift')       ok = true;
        if (kindChips.has('center')   && e.kind === 'center_help') ok = true;
        if (kindChips.has('available_shifts')
            && (e.kind === 'shift' || e.kind === 'center_help')
            && (e.status === 'empty' || e.status === 'available' || e.status === 'needs_driver')) ok = true;
        if (kindChips.has('taken_shifts')
            && (e.kind === 'shift' || e.kind === 'center_help')
            && (e.status === 'taken' || e.status === 'covered' || e.status === 'assigned')) ok = true;
        if (!ok) return false;
      }
      // Status chips (multi-select; empty = no filter).
      if (statusChips.size > 0) {
        let ok = false;
        if (statusChips.has('needs_driver') && (e.status === 'needs_driver' || e.status === 'empty')) ok = true;
        if (statusChips.has('covered')      && (e.status === 'covered' || e.status === 'assigned' || e.status === 'taken')) ok = true;
        if (statusChips.has('missed')       &&  e.status === 'missed') ok = true;
        if (!ok) return false;
      }
      // Person filter (substring on any assigned name).
      if (personFilter.trim()) {
        const needle = personFilter.trim().toLowerCase();
        const hit = e.assignedNames.some((n) => n.toLowerCase().includes(needle));
        if (!hit) return false;
      }
      // Location filter (substring on title + subtitle).
      if (locFilter.trim()) {
        const needle = locFilter.trim().toLowerCase();
        const hay = `${e.title} ${e.subtitle ?? ''}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [events, kindChips, statusChips, personFilter, locFilter]);

  // Group filtered events by date for the various view renderers.
  const byDate = useMemo(() => {
    const m: Record<string, ScheduleEvent[]> = {};
    for (const e of filtered) {
      (m[e.date] ??= []).push(e);
    }
    for (const k of Object.keys(m)) {
      m[k]!.sort((a, b) => {
        const at = a.time ?? '99:99';
        const bt = b.time ?? '99:99';
        return at < bt ? -1 : at > bt ? 1 : 0;
      });
    }
    return m;
  }, [filtered]);

  function step(direction: -1 | 1) {
    if (view === 'day')  setCursor(addDays(cursor, direction));
    if (view === 'week') setCursor(addDays(cursor, direction * 7));
    if (view === 'month') {
      const d = parseISO(cursor);
      d.setUTCMonth(d.getUTCMonth() + direction);
      setCursor(toISO(d));
    }
  }
  function goToday() { setCursor(todayISO_NY()); }

  function toggleKind(k: KindChip) {
    setKindChips((prev) => {
      const next = new Set(prev);
      if (k === 'all') return new Set<KindChip>(['all']);
      next.delete('all');
      if (next.has(k)) next.delete(k); else next.add(k);
      if (next.size === 0) next.add('all');
      return next;
    });
  }
  function toggleStatus(s: StatusChip) {
    setStatusChips((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s); else next.add(s);
      return next;
    });
  }

  // C7 Aug 13: called from Week/Day drop targets. Preserves the pickup's
  // original HH:MM if the drop happened on a day cell (no hour), otherwise
  // uses the hour bucket from the Day view.
  function onDrop(event: ScheduleEvent, newDate: string, newTime: string | null) {
    if (event.kind !== 'pickup') return;
    const time = newTime ?? event.time ?? '00:00';
    if (event.date === newDate && event.time === time) return; // no-op
    setPendingDrop({ event, newDate, newTime: time });
  }

  // Click-through routing per kind.
  function openEvent(e: ScheduleEvent) {
    if (e.kind === 'pickup') {
      nav(`/admin/pickup/${e.detailId}`);
      return;
    }
    if (e.kind === 'shift') {
      // No dedicated modal wiring — jump to the Dispatching Shifts tab.
      onNavigateTab?.('shifts', e.detailId);
      return;
    }
    if (e.kind === 'center_help') {
      onNavigateTab?.('center-help', e.detailId);
      return;
    }
  }

  return (
    <div className="min-h-full">
      {/* HEADER ROW ------------------------------------------------------ */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-3">
          <ViewSegmented value={view} onChange={setView} />
          <div className="flex items-center gap-1">
            <button onClick={() => step(-1)} title="Previous"
                    className="haptic h-8 w-8 grid place-items-center rounded-[8px] border border-line bg-paper hover:bg-cream">
              <ChevronLeft size={16} />
            </button>
            <button onClick={goToday}
                    className="haptic h-8 px-3 text-[12.5px] font-bold rounded-[8px] border border-line bg-paper hover:bg-cream">
              Today
            </button>
            <button onClick={() => step(1)} title="Next"
                    className="haptic h-8 w-8 grid place-items-center rounded-[8px] border border-line bg-paper hover:bg-cream">
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="font-display font-bold text-[16px] text-ink">
            {fmtRangeLabel(view, cursor)}
          </div>
        </div>
        <button onClick={onOpenScheduleDownload}
                title="Download the schedule as an Excel file"
                className="haptic flex items-center gap-1.5 text-[12px] font-bold bg-paper border border-line text-forest-deep rounded-[10px] px-3 py-2 hover:bg-cream">
          <Download size={14} /> Download schedule
        </button>
      </div>

      {/* FILTER ROW ------------------------------------------------------ */}
      <div className="mb-4 space-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10.5px] font-extrabold uppercase tracking-[.05em] text-muted mr-1">Show</span>
          <Chip label="All"                 active={kindChips.has('all')}     onClick={() => toggleKind('all')} />
          <Chip label="Pickups"             active={kindChips.has('pickups')} onClick={() => toggleKind('pickups')} />
          <Chip label="Steady"              active={kindChips.has('steady')}  onClick={() => toggleKind('steady')} />
          <Chip label="One-time"            active={kindChips.has('onetime')} onClick={() => toggleKind('onetime')} />
          <Chip label="Dispatcher shifts"   active={kindChips.has('shifts')}  onClick={() => toggleKind('shifts')} />
          <Chip label="Center Help"         active={kindChips.has('center')}  onClick={() => toggleKind('center')} />
          <Chip label="Available shifts"    active={kindChips.has('available_shifts')} onClick={() => toggleKind('available_shifts')} />
          <Chip label="Taken shifts"        active={kindChips.has('taken_shifts')}     onClick={() => toggleKind('taken_shifts')} />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10.5px] font-extrabold uppercase tracking-[.05em] text-muted mr-1">Status</span>
          <Chip label="Needs Driver"      active={statusChips.has('needs_driver')} onClick={() => toggleStatus('needs_driver')} tone="amber" />
          <Chip label="Covered/Assigned"  active={statusChips.has('covered')}      onClick={() => toggleStatus('covered')}      tone="sage" />
          <Chip label="Missed"            active={statusChips.has('missed')}       onClick={() => toggleStatus('missed')}       tone="clay" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[.05em] text-muted">
            Driver / Dispatcher
            <input value={personFilter} onChange={(e) => setPersonFilter(e.target.value)}
                   placeholder="e.g. Yosef"
                   className="ml-1 h-8 w-[180px] rounded-[8px] border border-line bg-paper px-2 text-[12.5px] normal-case tracking-normal font-normal text-ink placeholder:text-muted focus:outline-none focus:border-forest" />
          </label>
          <label className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[.05em] text-muted">
            Location
            <input value={locFilter} onChange={(e) => setLocFilter(e.target.value)}
                   placeholder="e.g. Monsey"
                   className="ml-1 h-8 w-[180px] rounded-[8px] border border-line bg-paper px-2 text-[12.5px] normal-case tracking-normal font-normal text-ink placeholder:text-muted focus:outline-none focus:border-forest" />
          </label>
          {(personFilter || locFilter || !kindChips.has('all') || statusChips.size > 0) && (
            <button onClick={() => { setPersonFilter(''); setLocFilter(''); setKindChips(new Set(['all'])); setStatusChips(new Set()); }}
                    className="haptic text-[11.5px] font-bold text-clay hover:underline">Clear filters</button>
          )}
          <div className="ml-auto text-[11.5px] text-muted">
            {q.isLoading ? 'Loading…' : `${filtered.length} event${filtered.length === 1 ? '' : 's'}`}
          </div>
        </div>
      </div>

      {/* MAIN GRID ------------------------------------------------------- */}
      {q.isError && (
        <div className="rounded-[12px] border border-clay/40 bg-clay/10 px-4 py-3 text-[13px] text-clay">
          Couldn't load the calendar. {(q.error as any)?.message ?? ''}
        </div>
      )}
      {!q.isError && view === 'week'  && <WeekView  cursor={cursor} byDate={byDate} onOpen={openEvent} onDrop={onDrop} />}
      {!q.isError && view === 'day'   && <DayView   cursor={cursor} events={byDate[cursor] ?? []} onOpen={openEvent} onDrop={onDrop} />}
      {!q.isError && view === 'month' && <MonthView cursor={cursor} byDate={byDate} onPickDay={(iso) => { setCursor(iso); setView('day'); }} />}

      {pendingDrop && (
        <RescheduleConfirm pending={pendingDrop}
                           onCancel={() => setPendingDrop(null)}
                           onDone={() => { setPendingDrop(null); qc.invalidateQueries({ queryKey: ['schedule-events'] }); qc.invalidateQueries({ queryKey: ['admin-pickups'] }); }} />
      )}
    </div>
  );
}

// C7 Aug 13: confirmation modal for a drag-drop reschedule.
// Shows original vs proposed. If a driver is on the pickup, offers keep vs
// release; on Confirm hits POST /pickup-instances/:id/reschedule.
function RescheduleConfirm({ pending, onCancel, onDone }: {
  pending: { event: ScheduleEvent; newDate: string; newTime: string };
  onCancel: () => void;
  onDone: () => void;
}) {
  const { event, newDate, newTime } = pending;
  const hasDriver = event.assignedNames.length > 0;
  const [releaseDriver, setReleaseDriver] = useState<boolean>(false);
  const [err, setErr] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: () => admin.reschedulePickup(event.detailId, { newDate, newTime, releaseDriver }),
    onSuccess: () => onDone(),
    onError:   (e: any) => setErr(e?.message ?? 'reschedule failed'),
  });
  function fmt(iso: string, hhmm: string | null): string {
    const d = parseISO(iso);
    const dayLabel = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
    return `${dayLabel}${hhmm ? ' · ' + fmtTime12(hhmm) : ''}`;
  }
  return (
    <div onClick={onCancel}
         className="fixed inset-0 z-[3000] bg-ink/50 flex items-center justify-center p-4">
      <div onClick={(e) => e.stopPropagation()}
           className="bg-paper rounded-[18px] shadow-lift w-full max-w-md p-5">
        <div className="text-[13px] font-extrabold uppercase tracking-[.05em] text-muted">Reschedule pickup</div>
        <div className="mt-1 text-[18px] font-bold text-ink">{event.title}</div>
        {event.subtitle && <div className="text-[12.5px] text-muted mt-0.5">{event.subtitle}</div>}

        <div className="mt-4 grid grid-cols-[80px_1fr] gap-y-2 items-baseline text-[13.5px]">
          <div className="text-muted font-bold">From</div>
          <div className="font-bold">{fmt(event.date, event.time)}</div>
          <div className="text-muted font-bold">To</div>
          <div className="font-extrabold text-forest-deep">{fmt(newDate, newTime)}</div>
        </div>

        {hasDriver && (
          <div className="mt-4 rounded-[12px] border border-line bg-cream/60 p-3">
            <div className="text-[12.5px] font-bold text-ink mb-2">
              Currently assigned: <span className="text-forest-deep">{event.assignedNames.join(', ')}</span>
            </div>
            <label className="flex items-start gap-2 py-1 cursor-pointer">
              <input type="radio" name="driver" checked={!releaseDriver} onChange={() => setReleaseDriver(false)}
                     className="mt-1" />
              <span className="text-[13px] leading-snug">Keep the assigned driver</span>
            </label>
            <label className="flex items-start gap-2 py-1 cursor-pointer">
              <input type="radio" name="driver" checked={releaseDriver} onChange={() => setReleaseDriver(true)}
                     className="mt-1" />
              <span className="text-[13px] leading-snug">Remove driver &amp; return the pickup to <b>Needs Driver</b></span>
            </label>
          </div>
        )}

        {err && <div className="mt-3 text-[12px] text-clay font-bold bg-clay/10 rounded-[8px] px-2 py-1.5">{err}</div>}

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onCancel} disabled={m.isPending}
                  className="haptic text-[13px] font-bold text-muted px-3 py-2">Cancel</button>
          <button onClick={() => m.mutate()} disabled={m.isPending}
                  className="haptic text-[13.5px] font-extrabold bg-forest text-paper px-4 py-2 rounded-[10px] shadow-ctag">
            {m.isPending ? 'Rescheduling…' : 'Confirm reschedule'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── segmented view toggle ───────────────────────────────────────────────
function ViewSegmented({ value, onChange }: { value: ViewKind; onChange: (v: ViewKind) => void }) {
  const opts: { k: ViewKind; label: string }[] = [
    { k: 'day', label: 'Day' }, { k: 'week', label: 'Week' }, { k: 'month', label: 'Month' },
  ];
  return (
    <div className="inline-flex rounded-[10px] border border-line bg-paper overflow-hidden">
      {opts.map((o) => (
        <button key={o.k} onClick={() => onChange(o.k)}
                className={cx('haptic px-3 py-1.5 text-[12.5px] font-bold',
                              value === o.k ? 'bg-forest text-paper' : 'text-ink hover:bg-cream')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Chip({ label, active, onClick, tone }: {
  label: string; active: boolean; onClick: () => void; tone?: 'sage' | 'amber' | 'clay';
}) {
  const activeCls =
    tone === 'sage'  ? 'bg-sage/40 border-forest/30 text-forest-deep'
    : tone === 'amber' ? 'bg-amber/15 border-amber/50 text-forest-deep'
    : tone === 'clay'  ? 'bg-clay/10 border-clay/40 text-clay'
    : 'bg-forest text-paper border-forest';
  return (
    <button onClick={onClick}
            className={cx('haptic text-[11.5px] font-bold rounded-full px-2.5 py-1 border',
                          active ? activeCls : 'bg-paper border-line text-ink hover:bg-cream')}>
      {label}
    </button>
  );
}

// ── WEEK VIEW ───────────────────────────────────────────────────────────
function WeekView({ cursor, byDate, onOpen, onDrop }: {
  cursor: string;
  byDate: Record<string, ScheduleEvent[]>;
  onOpen: (e: ScheduleEvent) => void;
  onDrop: (e: ScheduleEvent, newDate: string, newTime: string | null) => void;
}) {
  const start = weekStart(cursor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const [hoverIso, setHoverIso] = useState<string | null>(null);
  return (
    <div className="grid grid-cols-7 gap-2">
      {days.map((iso) => {
        const d = parseISO(iso);
        const dow = d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
        const dayN = d.toLocaleDateString('en-US', { day: 'numeric', timeZone: 'UTC' });
        const today = isTodayISO(iso);
        const list = byDate[iso] ?? [];
        return (
          <div key={iso}
               onDragOver={(ev) => { if (ev.dataTransfer.types.includes('application/x-zlz-pickup')) { ev.preventDefault(); setHoverIso(iso); ev.dataTransfer.dropEffect = 'move'; } }}
               onDragLeave={() => setHoverIso((h) => (h === iso ? null : h))}
               onDrop={(ev) => {
                 ev.preventDefault();
                 setHoverIso(null);
                 const raw = ev.dataTransfer.getData('application/x-zlz-pickup');
                 if (!raw) return;
                 try {
                   const dragged: ScheduleEvent = JSON.parse(raw);
                   onDrop(dragged, iso, null); // preserve original time on day-cell drop
                 } catch { /* ignore malformed drag payload */ }
               }}
               className={cx('rounded-[14px] border overflow-hidden flex flex-col min-h-[360px] transition',
                             hoverIso === iso ? 'border-forest ring-2 ring-forest/40 bg-sage/10' : 'border-line bg-paper')}>
            <div className={cx('px-2 py-1.5 border-b border-line', today && 'bg-sage/40')}>
              <div className="text-[10.5px] font-extrabold uppercase tracking-[.05em] text-muted">{dow}</div>
              <div className={cx('font-display font-bold text-[16px] leading-none mt-0.5',
                                 today ? 'text-forest-deep' : 'text-ink')}>
                {dayN}
                {today && <span className="ml-1 inline-block h-[3px] w-[16px] rounded-full bg-forest align-middle" />}
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-1.5 space-y-1.5">
              {list.length === 0 ? (
                <div className="text-[11px] text-muted text-center py-4 italic">No pickups or shifts</div>
              ) : list.map((e) => (
                <EventTile key={e.id} e={e} compact onOpen={() => onOpen(e)} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── DAY VIEW ────────────────────────────────────────────────────────────
function DayView({ cursor, events, onOpen, onDrop }: {
  cursor: string;
  events: ScheduleEvent[];
  onOpen: (e: ScheduleEvent) => void;
  onDrop: (e: ScheduleEvent, newDate: string, newTime: string | null) => void;
}) {
  // Bucket by rounded hour for the left rail; keep events themselves in
  // chronological order underneath.
  const buckets: Record<string, ScheduleEvent[]> = {};
  const timedHours = new Set<number>();
  for (const e of events) {
    if (e.time) {
      const h = Number(e.time.slice(0, 2));
      timedHours.add(h);
      (buckets[String(h)] ??= []).push(e);
    } else {
      (buckets['all-day'] ??= []).push(e);
    }
  }
  const hours = Array.from(timedHours).sort((a, b) => a - b);
  if (hours.length === 0 && !buckets['all-day']) {
    // Show a nominal 7am–8pm rail when the day is empty so the layout
    // doesn't collapse.
    for (let h = 7; h <= 20; h++) hours.push(h);
  }

  return (
    <div className="rounded-[14px] border border-line bg-paper p-3">
      <div className="text-[11px] font-extrabold uppercase tracking-[.05em] text-muted mb-2">
        {parseISO(cursor).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}
        {isTodayISO(cursor) && <span className="ml-2 text-forest">· Today</span>}
      </div>
      {events.length === 0 ? (
        <div className="text-[13px] text-muted italic py-10 text-center">No pickups or shifts scheduled for this day.</div>
      ) : (
        <div className="space-y-3">
          {buckets['all-day'] && buckets['all-day'].length > 0 && (
            <HourRow label="All day">
              {buckets['all-day'].map((e) => <EventTile key={e.id} e={e} onOpen={() => onOpen(e)} />)}
            </HourRow>
          )}
          {hours.map((h) => {
            const items = buckets[String(h)] ?? [];
            const label = fmtTime12(`${String(h).padStart(2, '0')}:00`);
            const hourTime = `${String(h).padStart(2, '0')}:00`;
            return (
              <HourRow key={h} label={label}
                       onDropPickup={(dragged) => onDrop(dragged, cursor, hourTime)}>
                {items.length === 0 ? (
                  <div className="text-[11.5px] text-muted italic">—</div>
                ) : items.map((e) => <EventTile key={e.id} e={e} onOpen={() => onOpen(e)} />)}
              </HourRow>
            );
          })}
        </div>
      )}
    </div>
  );
}
function HourRow({ label, children, onDropPickup }: {
  label: string;
  children: any;
  onDropPickup?: (dragged: ScheduleEvent) => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div className="grid grid-cols-[72px_1fr] gap-3 items-start">
      <div className="text-[11.5px] font-bold text-muted pt-1.5 text-right">{label}</div>
      <div onDragOver={(ev) => {
             if (!onDropPickup) return;
             if (ev.dataTransfer.types.includes('application/x-zlz-pickup')) {
               ev.preventDefault(); setHover(true); ev.dataTransfer.dropEffect = 'move';
             }
           }}
           onDragLeave={() => setHover(false)}
           onDrop={(ev) => {
             if (!onDropPickup) return;
             ev.preventDefault(); setHover(false);
             const raw = ev.dataTransfer.getData('application/x-zlz-pickup');
             if (!raw) return;
             try { onDropPickup(JSON.parse(raw)); } catch { /* ignore */ }
           }}
           className={cx('space-y-1.5 border-l-2 pl-3 min-h-[28px] transition',
                         hover ? 'border-forest bg-sage/10 rounded-r-[8px]' : 'border-line')}>
        {children}
      </div>
    </div>
  );
}

// ── MONTH VIEW ──────────────────────────────────────────────────────────
function MonthView({ cursor, byDate, onPickDay }: {
  cursor: string;
  byDate: Record<string, ScheduleEvent[]>;
  onPickDay: (iso: string) => void;
}) {
  const gridStart = monthGridStart(cursor);
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const currentMonth = parseISO(cursor).getUTCMonth();
  const dowHead = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  return (
    <div>
      <div className="grid grid-cols-7 text-center mb-1">
        {dowHead.map((d) => (
          <div key={d} className="text-[10.5px] font-extrabold uppercase tracking-[.05em] text-muted py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {days.map((iso) => {
          const d = parseISO(iso);
          const isInMonth = d.getUTCMonth() === currentMonth;
          const list = byDate[iso] ?? [];
          const pickupCount = list.filter((e) => e.kind === 'pickup').length;
          const shiftCount  = list.filter((e) => e.kind === 'shift').length;
          const chCount     = list.filter((e) => e.kind === 'center_help').length;
          const anyNeedsDriver = list.some((e) => e.status === 'needs_driver' || e.status === 'empty');
          const allCovered = list.length > 0 && !anyNeedsDriver && list.every((e) => e.status !== 'missed');
          const dot = anyNeedsDriver ? 'bg-amber' : (allCovered ? 'bg-forest' : (list.length ? 'bg-line' : ''));
          const today = isTodayISO(iso);
          return (
            <button key={iso} onClick={() => onPickDay(iso)}
                    className={cx('haptic text-left rounded-[10px] border p-2 min-h-[92px] flex flex-col hover:bg-cream/60',
                                  isInMonth ? 'bg-paper border-line' : 'bg-cream/40 border-line opacity-60',
                                  today && 'ring-2 ring-forest')}>
              <div className="flex items-center justify-between mb-1">
                <span className={cx('text-[13px] font-bold', today ? 'text-forest-deep' : 'text-ink')}>
                  {d.getUTCDate()}
                </span>
                {dot && <span className={cx('h-2 w-2 rounded-full', dot)} />}
              </div>
              <div className="text-[11px] text-muted leading-tight space-y-0.5">
                {pickupCount > 0 && <div>{pickupCount} pickup{pickupCount === 1 ? '' : 's'}</div>}
                {shiftCount  > 0 && <div>{shiftCount} shift{shiftCount === 1 ? '' : 's'}</div>}
                {chCount     > 0 && <div>{chCount} center help</div>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── EVENT TILE (shared) ────────────────────────────────────────────────
function EventTile({ e, compact, onOpen }: {
  e: ScheduleEvent; compact?: boolean; onOpen: () => void;
}) {
  const c = statusColors(e.status);
  const time = e.time ? fmtTime12(e.time) : 'All day';
  const showCounts = e.driversNeeded != null && e.driversAssigned != null && e.kind !== 'shift';
  const kindLabel = e.kind === 'pickup' ? 'Pickup' : e.kind === 'shift' ? 'Shift' : 'Center';
  // C7 Aug 13: only pickups are drag-source for reschedule; shifts + center
  // help are managed in their own screens.
  const draggable = e.kind === 'pickup';

  return (
    <button onClick={onOpen}
            draggable={draggable}
            onDragStart={(ev) => {
              if (!draggable) { ev.preventDefault(); return; }
              ev.dataTransfer.effectAllowed = 'move';
              ev.dataTransfer.setData('application/x-zlz-pickup', JSON.stringify(e));
            }}
            title={draggable
              ? `${e.title} · ${statusLabel(e.status)} · Drag to a new day or hour to reschedule`
              : `${e.title} · ${statusLabel(e.status)}`}
            className={cx('haptic block w-full text-left rounded-[10px] bg-paper hover:bg-cream/60',
                          'border border-line border-l-4', c.bar,
                          draggable ? 'cursor-grab active:cursor-grabbing' : '',
                          compact ? 'px-2 py-1.5' : 'px-3 py-2')}>
      <div className="flex items-center justify-between gap-1">
        <span className={cx('font-bold text-forest-deep', compact ? 'text-[11.5px]' : 'text-[12.5px]')}>
          {time}
        </span>
        <span className="text-[9.5px] font-extrabold uppercase tracking-[.05em] text-muted">
          {kindLabel}{e.isSteady ? ' · Steady' : ''}
        </span>
      </div>
      <div className={cx('font-bold text-ink leading-tight mt-0.5',
                         compact ? 'text-[12px]' : 'text-[13.5px]')}>
        {e.title}
      </div>
      {!compact && e.subtitle && (
        <div className="text-[11.5px] text-muted mt-0.5 truncate">{e.subtitle}</div>
      )}
      <div className="flex items-center justify-between gap-1 mt-1">
        <span className={cx('inline-block rounded-full px-1.5 py-0.5', c.pill,
                            compact ? 'text-[9.5px] font-extrabold uppercase tracking-[.05em]'
                                    : 'text-[10.5px] font-extrabold uppercase tracking-[.05em]')}>
          {statusLabel(e.status)}
        </span>
        {showCounts && (
          <span className={cx('text-muted', compact ? 'text-[10.5px]' : 'text-[11.5px]')}>
            {e.driversAssigned} of {e.driversNeeded}
          </span>
        )}
      </div>
      {!compact && e.assignedNames.length > 0 && (
        <div className="text-[11.5px] text-forest-deep mt-1 truncate">
          {e.assignedNames.join(', ')}
        </div>
      )}
    </button>
  );
}
