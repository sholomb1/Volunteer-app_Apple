/**
 * Oct 13 client: Shifts as a week calendar (Yakov: "set up the shifts to be
 * seen as a calendar like the pickups"). Same look as Pickups -> Calendar
 * week view: 7 day columns, today highlighted, cards with time / name /
 * status pill. Real shifts come from /api/shifts?from&to; open template
 * slots (Dispatchers -> Shift template, nobody on them this week) come from
 * /api/dispatcher-shifts/weekly and show as "OPEN — needs a dispatcher".
 * Editing / creating reuses the Shifts panel's own dialogs via callbacks.
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { shifts as shiftsApi, dispatcherShifts, type DispWeeklyRow } from './api';
import { cx } from './design';

export type ShiftsView = 'calendar' | 'list';
const VIEW_KEY = 'zlz.shifts.view';

// Oct 13 client: remember Calendar | List per device (Calendar default).
export function readShiftsView(): ShiftsView {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    return v === 'list' ? 'list' : 'calendar';
  } catch { return 'calendar'; }
}
export function writeShiftsView(v: ShiftsView) {
  try { localStorage.setItem(VIEW_KEY, v); } catch { /* private mode etc. */ }
}

export function ShiftsViewToggle({ value, onChange }: { value: ShiftsView; onChange: (v: ShiftsView) => void }) {
  const opts: Array<{ k: ShiftsView; label: string }> = [{ k: 'calendar', label: 'Calendar' }, { k: 'list', label: 'List' }];
  return (
    <div className="inline-flex rounded-[10px] border border-line bg-paper overflow-hidden" role="tablist" aria-label="Shifts view">
      {opts.map((o) => (
        <button key={o.k} role="tab" aria-selected={value === o.k}
                onClick={() => { writeShiftsView(o.k); onChange(o.k); }}
                className={cx('haptic px-3 py-1.5 text-[12.5px] font-bold',
                              value === o.k ? 'bg-forest text-paper' : 'text-ink hover:bg-cream')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ── local-date helpers (same convention as the Shifts panel: LOCAL day) ──
const pad = (n: number) => String(n).padStart(2, '0');
function dayKey(d: Date): string { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function sundayOf(d: Date): Date { const o = new Date(d); o.setHours(0, 0, 0, 0); o.setDate(o.getDate() - o.getDay()); return o; }
function plusDays(d: Date, n: number): Date { const o = new Date(d); o.setDate(o.getDate() + n); return o; }
function fmtT(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}
function blockName(iso: string, section?: string | null): string {
  if (section === 'motzei_shabbos') return 'Motzei Shabbos';
  const h = new Date(iso).getHours();
  if (h < 5) return 'Overnight';
  if (h < 9) return 'Early morning';
  if (h < 12) return 'Morning';
  if (h < 17) return 'Afternoon';
  if (h < 21) return 'Evening';
  return 'Night';
}
function weekLabel(start: Date): string {
  const end = plusDays(start, 6);
  const sm = start.toLocaleDateString('en-US', { month: 'long' });
  const em = end.toLocaleDateString('en-US', { month: 'long' });
  return sm === em && start.getFullYear() === end.getFullYear()
    ? `${sm} ${start.getDate()}–${end.getDate()}, ${end.getFullYear()}`
    : `${sm} ${start.getDate()} – ${em} ${end.getDate()}, ${end.getFullYear()}`;
}

type Card = {
  key: string;
  startsAt: string;
  endsAt: string;
  name: string;
  shifts: any[];            // empty = open template slot
  status: 'open' | 'assigned' | 'on' | 'done';
  past: boolean;
};

const PILL: Record<Card['status'], { pill: string; bar: string; label: string }> = {
  open:     { pill: 'bg-clay/10 text-clay border border-clay/40',               bar: 'border-clay',        label: 'Open' },
  assigned: { pill: 'bg-sage/40 text-forest-deep border border-forest/30',      bar: 'border-forest',      label: 'Assigned' },
  on:       { pill: 'bg-amber/15 text-forest-deep border border-amber/50',      bar: 'border-amber',       label: 'On shift' },
  done:     { pill: 'bg-forest/15 text-forest-deep border border-forest/40',    bar: 'border-forest-deep', label: '✓ Done' },
};

export type ShiftActions = {
  onEdit: (shift: any) => void;
  onSignIn: (shift: any) => void;
  onSignOut: (shift: any) => void;
  onCancel: (shift: any) => void;   // panel shows the same confirm as the list
};

export function ShiftsWeekCalendar({ search, canEdit, onNew, actions }: {
  search: string;
  canEdit: boolean;
  onNew: (prefillLocal: string) => void;   // yyyy-mm-ddTHH:mm (local)
  actions: ShiftActions;
}) {
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<Date>(() => sundayOf(new Date()));
  const from = dayKey(anchor);
  const to = dayKey(plusDays(anchor, 6));
  // queryKey starts with 'shifts' so the panel's invalidateQueries(['shifts']) refreshes it.
  const list = useQuery({ queryKey: ['shifts', 'week', from], queryFn: () => shiftsApi.list(from, to), refetchInterval: 30_000 });
  const slots = useQuery({ queryKey: ['shifts', 'slots', from], queryFn: () => dispatcherShifts.weekly(from), staleTime: 30_000 });

  const days = Array.from({ length: 7 }, (_, i) => plusDays(anchor, i));
  const todayKey = dayKey(new Date());

  const byDay = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const nowMs = Date.now();
    const sectionByStart = new Map<string, string>();
    for (const r of (slots.data?.data ?? []) as DispWeeklyRow[]) sectionByStart.set(new Date(r.startAt).toISOString(), r.section);
    // One card per shift (one dispatcher per shift, like the list); overlapping
    // shifts on a day simply stack, sorted by start time.
    const cards: Card[] = [];
    for (const s of (list.data?.data ?? [])) {
      if (needle && !JSON.stringify(s).toLowerCase().includes(needle)) continue;
      const st: Card['status'] = s.signed_out_at ? 'done' : s.signed_in_at ? 'on' : 'assigned';
      cards.push({
        key: `s:${s.id}`, startsAt: s.starts_at, endsAt: s.ends_at,
        name: blockName(s.starts_at, sectionByStart.get(new Date(s.starts_at).toISOString())),
        shifts: [s], status: st, past: new Date(s.ends_at).getTime() < nowMs,
      });
    }
    if (!needle || 'open'.includes(needle) || 'needs a dispatcher'.includes(needle)) {
      for (const r of (slots.data?.data ?? []) as DispWeeklyRow[]) {
        if (r.shiftId != null) continue;
        cards.push({
          key: `o:${r.slotId}`, startsAt: r.startAt, endsAt: r.endAt,
          name: blockName(r.startAt, r.section), shifts: [], status: 'open',
          past: new Date(r.endAt).getTime() < nowMs,
        });
      }
    }
    const m: Record<string, Card[]> = {};
    for (const c of cards) (m[dayKey(new Date(c.startsAt))] ??= []).push(c);
    for (const k of Object.keys(m)) m[k]!.sort((a, b) =>
      (new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
      || (new Date(a.endsAt).getTime() - new Date(b.endsAt).getTime())
      || a.key.localeCompare(b.key));
    return m;
  }, [list.data, slots.data, search]);

  const all = Object.values(byDay).flat();
  const openCount = all.filter((c) => c.status === 'open' && !c.past).length;

  function newOn(d: Date, hhmm = '09:30') {
    if (!canEdit) return;
    onNew(`${dayKey(d)}T${hhmm}`);
  }
  function openCard(c: Card) {
    // Real shift: toggle the small Sign in / Edit / Cancel menu on the card.
    if (c.shifts.length > 0) { setMenuFor((k) => (k === c.key ? null : c.key)); return; }
    // Open slot: start a New shift prefilled at that slot's date + time.
    const d = new Date(c.startsAt);
    if (canEdit) onNew(`${dayKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`);
  }

  const header = (d: Date, compact?: boolean) => {
    const today = dayKey(d) === todayKey;
    return (
      <div className={cx('px-2 py-1.5 border-b border-line flex items-start justify-between gap-1', today && 'bg-sage/40')}>
        <div className={cx(compact && 'flex items-baseline gap-2')}>
          <div className="text-[10.5px] font-extrabold uppercase tracking-[.05em] text-muted">
            {d.toLocaleDateString('en-US', { weekday: 'short' })}
          </div>
          <div className={cx('font-display font-bold text-[16px] leading-none mt-0.5', today ? 'text-forest-deep' : 'text-ink')}>
            {d.getDate()}
            {today && <span className="ml-1 inline-block h-[3px] w-[16px] rounded-full bg-forest align-middle" />}
          </div>
        </div>
        {canEdit && (
          <button onClick={() => newOn(d)} title="New shift on this day" aria-label="New shift on this day"
                  className="haptic h-6 w-6 grid place-items-center rounded-[7px] border border-line bg-paper text-forest hover:bg-cream">
            <Plus size={13} />
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="rounded-[14px] border border-line bg-paper p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1">
            <button onClick={() => setAnchor(plusDays(anchor, -7))} title="Previous week"
                    className="haptic h-8 w-8 grid place-items-center rounded-[8px] border border-line bg-paper hover:bg-cream">
              <ChevronLeft size={16} />
            </button>
            <button onClick={() => setAnchor(sundayOf(new Date()))}
                    className="haptic h-8 px-3 text-[12.5px] font-bold rounded-[8px] border border-line bg-paper hover:bg-cream">
              Today
            </button>
            <button onClick={() => setAnchor(plusDays(anchor, 7))} title="Next week"
                    className="haptic h-8 w-8 grid place-items-center rounded-[8px] border border-line bg-paper hover:bg-cream">
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="font-display font-bold text-[16px] text-ink">
            {dayKey(anchor) === dayKey(sundayOf(new Date())) ? 'This week · ' : ''}{weekLabel(anchor)}
          </div>
        </div>
        <div className="text-[11.5px] text-muted">
          {list.isLoading ? 'Loading…' : (
            <>
              {all.filter((c) => c.status !== 'open').length} shift{all.filter((c) => c.status !== 'open').length === 1 ? '' : 's'}
              {openCount > 0 && <> · <span className="font-bold text-clay">{openCount} open</span></>}
            </>
          )}
        </div>
      </div>
      {list.isError && (
        <div className="mb-2 rounded-[10px] border border-clay/40 bg-clay/10 px-3 py-2 text-[12.5px] text-clay">
          Couldn't load shifts. {(list.error as any)?.message ?? ''}
        </div>
      )}

      {/* Desktop / tablet: 7 columns like Pickups -> Calendar (scrolls sideways if narrow). */}
      <div className="hidden md:block overflow-x-auto">
        <div className="grid grid-cols-7 gap-2 min-w-[770px]">
          {days.map((d) => {
            const cards = byDay[dayKey(d)] ?? [];
            return (
              <div key={dayKey(d)} className="rounded-[14px] border border-line bg-paper overflow-hidden flex flex-col min-h-[360px]">
                {header(d)}
                <div onClick={(e) => { if (e.target === e.currentTarget) newOn(d); }}
                     title={canEdit ? 'Click empty space to add a shift on this day' : undefined}
                     className={cx('flex-1 min-h-0 p-1.5 space-y-1.5', canEdit && 'cursor-copy')}>
                  {cards.length === 0 ? (
                    <div onClick={() => newOn(d)} className="text-[11px] text-muted text-center py-4 italic">No shifts</div>
                  ) : cards.map((c) => <ShiftCard key={c.key} c={c} compact open={menuFor === c.key} canEdit={canEdit} actions={actions} onOpen={() => openCard(c)} onClose={() => setMenuFor(null)} />)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Phone: one day under the other. */}
      <div className="md:hidden space-y-2">
        {days.map((d) => {
          const cards = byDay[dayKey(d)] ?? [];
          return (
            <div key={dayKey(d)} className="rounded-[14px] border border-line bg-paper overflow-hidden">
              {header(d, true)}
              <div className="p-1.5 space-y-1.5">
                {cards.length === 0 ? (
                  <button onClick={() => newOn(d)} disabled={!canEdit}
                          className="haptic block w-full text-[11.5px] text-muted text-center py-2 italic">
                    No shifts{canEdit ? ' · tap to add' : ''}
                  </button>
                ) : cards.map((c) => <ShiftCard key={c.key} c={c} open={menuFor === c.key} canEdit={canEdit} actions={actions} onOpen={() => openCard(c)} onClose={() => setMenuFor(null)} />)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ShiftCard({ c, compact, open, canEdit, actions, onOpen, onClose }: {
  c: Card; compact?: boolean; open: boolean; canEdit: boolean; actions: ShiftActions;
  onOpen: () => void; onClose: () => void;
}) {
  const p = PILL[c.status];
  const isOpen = c.status === 'open';
  const sh = c.shifts[0];
  const who = sh ? ([sh.first_name, sh.last_name].filter(Boolean).join(' ') || 'Dispatcher') : '';
  const btn = 'haptic text-[11px] font-bold px-2 py-1 rounded-[8px]';
  return (
    <div className={cx('rounded-[10px] bg-paper border border-line border-l-4', p.bar, c.past && !open && 'opacity-60',
                       open && 'ring-2 ring-forest/40')}>
      <div role="button" tabIndex={0} onClick={onOpen}
           onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
           title={isOpen ? 'Open shift — click to add a dispatcher' : 'Click for Sign in / Edit / Cancel'}
           className={cx('haptic block w-full text-left rounded-[10px] hover:bg-cream/60 cursor-pointer',
                         compact ? 'px-2 py-1.5' : 'px-3 py-2')}>
        <div className="flex items-center justify-between gap-1">
          <span className={cx('font-bold text-forest-deep', compact ? 'text-[11px]' : 'text-[12.5px]')}>
            {fmtT(c.startsAt)}–{fmtT(c.endsAt)}
          </span>
          {sh?.recurring_shift_id != null && (
            <span className="text-[9px] font-extrabold uppercase tracking-[.05em] bg-sage text-forest px-1.5 py-[1px] rounded-full">Series</span>
          )}
        </div>
        {isOpen ? (
          <div className={cx('font-extrabold text-clay mt-0.5 leading-tight', compact ? 'text-[11px]' : 'text-[12.5px]')}>
            OPEN — needs a dispatcher
          </div>
        ) : (
          <div className={cx('font-bold text-ink leading-tight mt-0.5 break-words', compact ? 'text-[12px]' : 'text-[13.5px]')}>
            {who}{sh.unit_number != null && <span className="text-muted font-semibold text-[11px]"> #{sh.unit_number}</span>}
          </div>
        )}
        <div className={cx('text-muted leading-tight mt-0.5', compact ? 'text-[10.5px]' : 'text-[11.5px]')}>
          Shift · {c.name}
        </div>
        <div className="flex items-center justify-between gap-1 mt-1">
          <span className={cx('inline-block rounded-full px-1.5 py-0.5 font-extrabold uppercase tracking-[.05em]', p.pill,
                              compact ? 'text-[9.5px]' : 'text-[10.5px]')}>
            {p.label}
          </span>
          <span className={cx('text-muted', compact ? 'text-[10.5px]' : 'text-[11.5px]')}>
            {c.shifts.length} of 1
          </span>
        </div>
      </div>
      {/* Oct 13 client: same Sign in / Edit / Cancel as the list row. */}
      {open && sh && (
        <div className="border-t border-line px-1.5 py-1.5 flex flex-wrap items-center gap-1">
          {!sh.signed_in_at && !sh.signed_out_at && (
            <button onClick={() => { actions.onSignIn(sh); onClose(); }}
                    className={cx(btn, 'text-forest border border-forest/40 bg-sage/40')}>Sign in</button>
          )}
          {sh.signed_in_at && !sh.signed_out_at && (
            <button onClick={() => { actions.onSignOut(sh); onClose(); }}
                    className={cx(btn, 'text-clay border border-clay/40 bg-clay-soft/60')}>Sign out</button>
          )}
          <button onClick={() => { actions.onEdit(sh); onClose(); }}
                  className={cx(btn, 'text-forest border border-line hover:bg-cream')}>Edit</button>
          {canEdit && (
            <button onClick={() => { actions.onCancel(sh); onClose(); }}
                    className={cx(btn, 'text-clay hover:bg-clay/10')}>Cancel</button>
          )}
        </div>
      )}
    </div>
  );
}