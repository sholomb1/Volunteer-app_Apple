/**
 * Oct 16 client: "For the center help, can you make the calendar view as well?
 * Make it really the same as the dispatcher, everything the same way. We can
 * edit the schedules and create templates."
 *
 * Center Help → under "People willing to help in the center":
 *   - Calendar | List switch (remembered per device), like Shifts.
 *   - Week calendar: the same frame and cards as the Shifts calendar
 *     (shifts-calendar.tsx). Days that still need people are marked OPEN.
 *     Tap a card for Edit / Cancel; "+" per day or "New shift" adds one.
 *   - Edit one day: time, people needed, notes, who is on it (people from the
 *     center help list first, typed names too, or search all drivers), Cancel.
 *   - "Weekly template" (office only): the regular week, like the dispatcher
 *     Weekly template — tap a box to change it, "+ Add" per day, Save asks from
 *     which date. Past days never change.
 * API: /api/center-help/* (routes/center-help.ts + center-help-schedule.ts).
 * Shared with the dispatcher screens: WeekCalendarShell, CalendarCardFrame,
 * ShiftsViewToggle, Sheet, ApplyFromDateDialog, askCancelShift, isShiftsOffice.
 */
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, X, Trash2 } from 'lucide-react';
import {
  centerHelp, centerHelpPeople, canWrite, getUser, CENTER_HELP_TASK_LABELS,
  type CenterHelpInstance, type CenterHelpTaskType, type CenterHelpTplRow, type CenterHelpPersonRow, type CenterHelpApplyRow,
} from './api';
import { cx, DateInput } from './design';
import { nyToday } from './time-format';
import { uiConfirm, uiNotify } from './ui-dialogs';
import {
  ShiftsViewToggle, readShiftsView, WeekCalendarShell, CalendarCardFrame, groupByDay,
  dayKey, sundayOf, plusDays, fmtT, blockName, pad, type ShiftsView,
} from './shifts-calendar';
import { Sheet, ApplyFromDateDialog, askCancelShift, isShiftsOffice, DAYS, fmt12, toMin, btn } from './shifts-tools';

const VIEW_KEY = 'zlz.centerhelp.view';
const NOUN = 'center help shift';
const canEditNow = () => canWrite(getUser()?.role);
const taskLabel = (t: string) => (CENTER_HELP_TASK_LABELS as Record<string, string>)[t] ?? t;
const TASKS = Object.entries(CENTER_HELP_TASK_LABELS) as Array<[CenterHelpTaskType, string]>;
const hhmmOf = (iso: string) => { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const lbl = 'block text-[11px] font-extrabold uppercase tracking-[.05em] text-muted mb-1';
const inp = 'w-full border border-line rounded-[8px] px-2 py-2 bg-paper text-[14px]';

/** A person on a day or a weekly row: a driver (kind 'v', volunteer id) or a typed name (kind 't', list id). */
export type Who = { kind: 'v' | 't'; id: number; name: string; gone?: boolean };
const whoKey = (w: Who) => `${w.kind}:${w.id}`;
function whoFromSignups(inst: CenterHelpInstance): Who[] {
  return (inst.signups ?? []).map((s) => (s.typed
    ? { kind: 't' as const, id: Number(s.typed_id), name: s.first_name, gone: !!s.removed_from_list }
    : { kind: 'v' as const, id: Number(s.id), name: `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim() })); // Oct 23 client: no unit # outside the Drivers list
}
const shortName = (s: { first_name: string; last_name: string; typed?: boolean }) => {
  if (s.typed) return s.first_name;
  const last = String(s.last_name || '').trim();
  return `${String(s.first_name || '').trim()}${last ? ` ${last.charAt(0)}.` : ''}`;
};
function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['center-help'] });
  qc.invalidateQueries({ queryKey: ['center-help-template'] });
  qc.invalidateQueries({ queryKey: ['center-help-instances'] });
}

// ════════════════════════════════════════════════════════════════════════════
// The page section
// ════════════════════════════════════════════════════════════════════════════
export function CenterHelpSchedule({ search }: { search: string }) {
  const [view, setView] = useState<ShiftsView>(() => readShiftsView(VIEW_KEY));
  const [newAt, setNewAt] = useState<string | null | undefined>(undefined); // undefined = closed, null = no prefill
  const [editInst, setEditInst] = useState<CenterHelpInstance | null>(null);
  const [tplOpen, setTplOpen] = useState(false);
  const canEdit = canEditNow();
  const qc = useQueryClient();
  const cancelMut = useMutation({
    mutationFn: ({ id, scope }: { id: number; scope: 'one' | 'future' }) => centerHelp.cancelDay(id, scope),
    onSuccess: () => invalidateAll(qc),
    onError: (e: any) => uiNotify(`Couldn't cancel: ${e?.message ?? 'error'}`, 'err'),
  });
  const askCancel = (inst: CenterHelpInstance) => {
    // "This and all future ones" changes the weekly template = office only (like the dispatcher one).
    const series = isShiftsOffice() ? inst.template_id : null;
    void askCancelShift({ starts_at: inst.starts_at, recurring_shift_id: series }, NOUN)
      .then((scope) => { if (scope) cancelMut.mutate({ id: inst.id, scope }); });
  };

  return (
    <div className="space-y-3">
      <div className="rounded-[14px] border border-sage-line bg-sage/40 p-3 text-[12.5px] text-forest">
        <b>Center help schedule.</b> Add shifts at the center and put people on them — volunteers can also sign up in the app.
        Shifts that still need people are marked <b className="text-clay">Open</b>.
      </div>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <ShiftsViewToggle value={view} onChange={setView} storageKey={VIEW_KEY} label="Center help view" />
          {isShiftsOffice() && (
            <button onClick={() => setTplOpen(true)} className={cx(btn, 'border border-forest/40 bg-sage/40 text-forest hover:bg-sage')}>
              Weekly template
            </button>
          )}
        </div>
        {canEdit && (
          <button onClick={() => setNewAt(null)} className={cx(btn, 'bg-forest text-paper')}>
            <Plus size={14} /> New shift
          </button>
        )}
      </div>
      {view === 'calendar' && (
        <CenterHelpWeekCalendar search={search} canEdit={canEdit} onNew={(pre) => setNewAt(pre)}
                                onEdit={setEditInst} onCancel={askCancel} />
      )}
      {view === 'list' && (
        <CenterHelpList search={search} canEdit={canEdit} onNew={(pre) => setNewAt(pre)} onEdit={setEditInst} onCancel={askCancel} />
      )}
      {newAt !== undefined && <NewCenterHelpDialog prefill={newAt} onClose={() => setNewAt(undefined)} />}
      {editInst && <EditDayDialog inst={editInst} onClose={() => setEditInst(null)} onCancelDay={() => { const i = editInst; setEditInst(null); askCancel(i); }} />}
      {tplOpen && <CenterHelpTemplateEditor onClose={() => setTplOpen(false)} />}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Week calendar (same frame + cards as Shifts → Calendar)
// ════════════════════════════════════════════════════════════════════════════
type ChCard = { key: string; startsAt: string; endsAt: string; inst: CenterHelpInstance; status: 'open' | 'assigned' | 'done'; past: boolean };

function matches(inst: CenterHelpInstance, needle: string): boolean {
  if (!needle) return true;
  const open = inst.signup_count < inst.volunteers_needed ? ' open needs center help' : '';
  return `${taskLabel(inst.task_type)} ${JSON.stringify(inst)}${open}`.toLowerCase().includes(needle);
}
function cardOf(inst: CenterHelpInstance, nowMs: number): ChCard {
  const past = new Date(inst.ends_at).getTime() < nowMs;
  const short = inst.signup_count < inst.volunteers_needed;
  return { key: `c:${inst.id}`, startsAt: inst.starts_at, endsAt: inst.ends_at, inst, past,
           status: past ? (inst.signup_count > 0 ? 'done' : 'open') : short ? 'open' : 'assigned' };
}

function CenterHelpWeekCalendar({ search, canEdit, onNew, onEdit, onCancel }: {
  search: string; canEdit: boolean; onNew: (prefillLocal: string) => void;
  onEdit: (i: CenterHelpInstance) => void; onCancel: (i: CenterHelpInstance) => void;
}) {
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<Date>(() => sundayOf(new Date()));
  const from = dayKey(anchor);
  const to = dayKey(plusDays(anchor, 6));
  const q = useQuery({ queryKey: ['center-help', 'week', from], queryFn: () => centerHelp.instances(from, to), refetchInterval: 30_000 });
  const byDay = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const now = Date.now();
    return groupByDay((q.data?.data ?? []).filter((i) => matches(i, needle)).map((i) => cardOf(i, now)));
  }, [q.data, search]);
  const all = Object.values(byDay).flat();
  const openCount = all.filter((c) => c.status === 'open' && !c.past).length;
  return (
    <WeekCalendarShell<ChCard>
      anchor={anchor} setAnchor={setAnchor} byDay={byDay} canEdit={canEdit}
      onNewDay={(d) => onNew(`${dayKey(d)}T09:00`)}
      emptyText="No center help" addTitle="New center help shift on this day"
      summary={q.isLoading ? 'Loading…' : (
        <>
          {all.length} shift{all.length === 1 ? '' : 's'}
          {openCount > 0 && <> · <span className="font-bold text-clay">{openCount} open</span></>}
        </>
      )}
      error={q.isError ? <>Couldn't load center help. {(q.error as any)?.message ?? ''}</> : undefined}
      renderCard={(c, compact) => (
        <CenterHelpCard c={c} compact={compact} open={menuFor === c.key} canEdit={canEdit}
                        onOpen={() => setMenuFor((k) => (k === c.key ? null : c.key))} onClose={() => setMenuFor(null)}
                        onEdit={onEdit} onCancel={onCancel} />
      )} />
  );
}

function CenterHelpCard({ c, compact, open, canEdit, onOpen, onClose, onEdit, onCancel }: {
  c: ChCard; compact?: boolean; open: boolean; canEdit: boolean; onOpen: () => void; onClose: () => void;
  onEdit: (i: CenterHelpInstance) => void; onCancel: (i: CenterHelpInstance) => void;
}) {
  const i = c.inst;
  const need = Math.max(0, i.volunteers_needed - i.signup_count);
  const b = 'haptic text-[11px] font-bold px-2 py-1 rounded-[8px]';
  const nameCls = cx('font-bold text-ink leading-tight mt-0.5 break-words', compact ? 'text-[12px]' : 'text-[13.5px]');
  const openCls = cx('font-extrabold text-clay mt-0.5 leading-tight', compact ? 'text-[11px]' : 'text-[12.5px]');
  return (
    <CalendarCardFrame
      status={c.status} past={c.past} open={open} compact={compact}
      onOpen={() => { if (canEdit) onOpen(); }}
      title={canEdit ? (need > 0 ? 'Needs people — click to add someone' : 'Click for Edit / Cancel') : ''}
      time={`${fmtT(c.startsAt)}–${fmtT(c.endsAt)}`}
      badge={i.template_id != null && (
        <span className="text-[9px] font-extrabold uppercase tracking-[.05em] bg-sage text-forest px-1.5 py-[1px] rounded-full">Weekly</span>
      )}
      main={<>
        {i.signups.length > 0 && <div className={nameCls}>{i.signups.map(shortName).join(', ')}</div>}
        {need > 0 && !c.past && (
          <div className={openCls}>{i.signups.length === 0 ? 'OPEN — needs center help' : `+ needs ${need} more`}</div>
        )}
      </>}
      sub={<>{taskLabel(i.task_type)} · {blockName(c.startsAt)}</>}
      count={`${i.signup_count} of ${i.volunteers_needed}`}>
      {open && canEdit && (
        <div className="border-t border-line px-1.5 py-1.5 flex flex-wrap items-center gap-1">
          <button onClick={() => { onEdit(i); onClose(); }} className={cx(b, 'text-forest border border-forest/40 bg-sage/40')}>
            {need > 0 ? 'Assign / Edit' : 'Edit'}
          </button>
          <button onClick={() => { onCancel(i); onClose(); }} className={cx(b, 'text-clay hover:bg-clay/10')}>Cancel</button>
        </div>
      )}
    </CalendarCardFrame>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// List view (like Shifts → List: week grid of 3 slots + upcoming list by day)
// ════════════════════════════════════════════════════════════════════════════
const SLOTS: Array<{ key: string; label: string; from: number; to: number; hour: number }> = [
  { key: 'morning', label: 'Morning', from: 0, to: 12, hour: 9 },
  { key: 'afternoon', label: 'Afternoon', from: 12, to: 17, hour: 13 },
  { key: 'evening', label: 'Evening', from: 17, to: 24, hour: 17 },
];
function CenterHelpList({ search, canEdit, onNew, onEdit, onCancel }: {
  search: string; canEdit: boolean; onNew: (prefillLocal: string | null) => void;
  onEdit: (i: CenterHelpInstance) => void; onCancel: (i: CenterHelpInstance) => void;
}) {
  const [anchor, setAnchor] = useState<Date>(() => sundayOf(new Date()));
  const wFrom = dayKey(anchor), wTo = dayKey(plusDays(anchor, 6));
  const week = useQuery({ queryKey: ['center-help', 'week', wFrom], queryFn: () => centerHelp.instances(wFrom, wTo), refetchInterval: 30_000 });
  const up = useQuery({ queryKey: ['center-help', 'upcoming'], queryFn: () => centerHelp.instances(), refetchInterval: 30_000 });
  const needle = search.trim().toLowerCase();
  const days = Array.from({ length: 7 }, (_, i) => plusDays(anchor, i));
  const cell = useMemo(() => {
    const m = new Map<string, CenterHelpInstance[]>();
    for (const i of week.data?.data ?? []) {
      const h = new Date(i.starts_at).getHours();
      const s = SLOTS.find((x) => h >= x.from && h < x.to)!;
      const k = `${dayKey(new Date(i.starts_at))}|${s.key}`;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(i);
    }
    return m;
  }, [week.data]);
  const covered = Array.from(cell.values()).filter((a) => a.length && a.every((i) => i.signup_count >= i.volunteers_needed)).length;
  const pct = Math.round((covered / 21) * 100);
  const tone = pct >= 75 ? 'bg-sage text-forest' : pct >= 40 ? 'bg-amber-soft text-[#9a7415]' : 'bg-clay-soft text-clay';
  const groups = useMemo(() => {
    const out = new Map<string, CenterHelpInstance[]>();
    for (const i of (up.data?.data ?? []).filter((x) => matches(x, needle) && new Date(x.ends_at).getTime() > Date.now())) {
      const d = new Date(i.starts_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      if (!out.has(d)) out.set(d, []);
      out.get(d)!.push(i);
    }
    return Array.from(out.entries());
  }, [up.data, needle]);
  const nav = 'haptic text-[12.5px] font-bold border border-line rounded-[8px] px-2 py-1 hover:bg-cream/60';
  return (
    <>
      <div className="rounded-[14px] border border-line bg-paper p-3">
        <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            <button onClick={() => setAnchor(plusDays(anchor, -7))} className={nav}>◀</button>
            <button onClick={() => setAnchor(sundayOf(new Date()))} className={nav}>This week</button>
            <button onClick={() => setAnchor(plusDays(anchor, 7))} className={nav}>▶</button>
            <span className="text-[12.5px] text-muted ml-1">
              {anchor.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} — {plusDays(anchor, 6).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
          </div>
          <div className={cx('text-[11.5px] font-extrabold px-2.5 py-1 rounded-full', tone)}>{covered} / 21 slots covered · {pct}%</div>
        </div>
        <div className="grid grid-cols-[64px_repeat(7,1fr)] gap-1 text-[11.5px]">
          <div />
          {days.map((d) => (
            <div key={dayKey(d)} className="font-extrabold uppercase tracking-[.05em] text-muted text-center py-1">
              {d.toLocaleDateString('en-US', { weekday: 'short' })}<br /><span className="text-ink text-[12px] font-bold">{d.getDate()}</span>
            </div>
          ))}
          {SLOTS.map((s) => (
            <Fragment key={s.key}>
              <div className="font-bold text-muted py-1.5 text-right pr-1 text-[11px]">{s.label}</div>
              {days.map((d) => {
                const list = cell.get(`${dayKey(d)}|${s.key}`) ?? [];
                if (!list.length) {
                  return (
                    <button key={dayKey(d) + s.key} disabled={!canEdit} onClick={() => onNew(`${dayKey(d)}T${pad(s.hour)}:00`)}
                            className="haptic border border-dashed border-line/70 rounded-[8px] py-2 text-muted text-[10.5px] hover:bg-cream/50 hover:text-forest">
                      {canEdit ? '+ Fill' : '—'}
                    </button>
                  );
                }
                return (
                  <div key={dayKey(d) + s.key} className="space-y-0.5">
                    {list.map((i) => {
                      const short = i.signup_count < i.volunteers_needed;
                      return (
                        <button key={i.id} onClick={() => canEdit && onEdit(i)} title="Click to edit or cancel"
                                className={cx('haptic w-full text-left rounded-[8px] border px-1.5 py-1 text-[11px] font-bold truncate hover:underline',
                                              short ? 'bg-clay/10 border-clay/40 text-clay' : 'bg-sage/40 border-sage-line text-forest-deep')}>
                          {taskLabel(i.task_type)} · {i.signup_count}/{i.volunteers_needed}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-[11px] font-extrabold uppercase tracking-[.05em] text-muted">
          {groups.reduce((n, [, r]) => n + r.length, 0)} upcoming (next 30 days)
        </div>
      </div>
      {up.isLoading && <div className="text-[13px] text-muted">Loading…</div>}
      {!up.isLoading && groups.length === 0 && <div className="text-[13px] text-muted italic">No center help on the calendar yet.</div>}
      {groups.map(([day, rows]) => (
        <div key={day}>
          <div className="text-[11px] font-extrabold uppercase tracking-[.05em] text-muted mb-1.5">{day}</div>
          <div className="space-y-1.5">
            {rows.map((i) => {
              const need = Math.max(0, i.volunteers_needed - i.signup_count);
              return (
                <div key={i.id} className="rounded-[10px] border border-line bg-paper px-3 py-2 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-[13.5px] flex items-center gap-1.5 flex-wrap">
                      <span>{taskLabel(i.task_type)}</span>
                      {i.template_id != null && <span className="text-[10px] font-extrabold uppercase tracking-[.05em] bg-sage text-forest px-1.5 py-[1px] rounded-full">Weekly</span>}
                      <span className={cx('text-[11.5px] font-extrabold', need > 0 ? 'text-clay' : 'text-forest')}>
                        {need > 0 ? (i.signup_count === 0 ? 'Open' : `needs ${need} more`) : 'Full'} · {i.signup_count} of {i.volunteers_needed}
                      </span>
                    </div>
                    <div className="text-[11.5px] text-muted">
                      {fmtT(i.starts_at)} — {fmtT(i.ends_at)}
                      {i.signups.length > 0 && ` · ${i.signups.map((s) => (s.typed ? s.first_name : `${s.first_name} ${s.last_name}`.trim())).join(', ')}`}
                      {i.notes ? ` · ${i.notes}` : ''}
                    </div>
                  </div>
                  {canEdit && (
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => onEdit(i)} className="haptic text-forest text-[10.5px] font-bold border border-line px-2 py-1 rounded-[8px] hover:bg-cream">
                        {need > 0 ? 'Assign / Edit' : 'Edit'}
                      </button>
                      <button onClick={() => onCancel(i)} className="haptic text-clay text-[10.5px] font-bold px-2 py-1 rounded-[8px] hover:bg-clay/10">Cancel</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Pick a person: the center help list first (drivers + typed names), then search all drivers
// ════════════════════════════════════════════════════════════════════════════
export function PersonPicker({ taken, onPick, placeholder = '+ Add a person…' }: {
  taken: Who[]; onPick: (w: Who) => void; placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const wrap = useRef<HTMLDivElement>(null);
  const people = useQuery({ queryKey: ['center-help-people'], queryFn: () => centerHelpPeople.list(), staleTime: 30_000 });
  const cand = useQuery({ queryKey: ['center-help-people-candidates', q], queryFn: () => centerHelpPeople.candidates(q.trim()), enabled: open && q.trim().length > 0 });
  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);
  const takenKeys = new Set(taken.map(whoKey));
  const needle = q.trim().toLowerCase();
  const listed = (people.data?.data ?? [])
    .map((p: CenterHelpPersonRow): Who & { sub: string } => (p.volunteerId != null
      ? { kind: 'v', id: Number(p.volunteerId), name: `${p.name}${p.unitNumber != null ? ` #${p.unitNumber}` : ''}`, sub: p.driverRemoved ? 'driver removed' : 'driver', gone: p.driverRemoved }
      : { kind: 't', id: p.id, name: p.name, sub: 'typed name' }))
    .filter((w) => !takenKeys.has(whoKey(w)) && !w.gone && (!needle || `${w.name} ${w.sub}`.toLowerCase().includes(needle)));
  const listedV = new Set(listed.filter((w) => w.kind === 'v').map((w) => w.id));
  const others = (cand.data?.data ?? [])
    .map((r): Who => ({ kind: 'v', id: Number(r.id), name: `${r.firstName} ${r.lastName}`.trim() + (r.unitNumber != null ? ` #${r.unitNumber}` : '') }))
    .filter((w) => !takenKeys.has(whoKey(w)) && !listedV.has(w.id));
  const pick = (w: Who) => { onPick({ kind: w.kind, id: w.id, name: w.name }); setQ(''); setOpen(false); };
  const row = 'w-full text-left px-3 py-2 text-[13px] hover:bg-cream/70 flex items-center justify-between gap-2';
  return (
    <div className="relative" ref={wrap}>
      <input value={q} placeholder={placeholder} aria-label="Add a person"
             onFocus={() => setOpen(true)} onChange={(e) => { setQ(e.target.value); setOpen(true); }}
             className={inp} />
      {open && (
        <div className="mt-1 max-h-72 overflow-auto bg-paper border border-line rounded-[10px] shadow-lg">
          <div className="px-3 pt-2 pb-1 text-[10.5px] font-extrabold uppercase tracking-[.05em] text-forest">Willing to help in the center</div>
          {people.isLoading && <div className="px-3 py-2 text-[12.5px] text-muted">Loading…</div>}
          {!people.isLoading && listed.length === 0 && (
            <div className="px-3 py-2 text-[12px] text-muted italic">{needle ? 'No one on the list matches.' : 'Everyone on the list is already on.'}</div>
          )}
          {listed.map((w) => (
            <button key={whoKey(w)} type="button" onMouseDown={(e) => { e.preventDefault(); pick(w); }} className={row}>
              <span className="font-bold">{w.name}</span>
              <span className="text-[10.5px] text-muted">{w.sub}</span>
            </button>
          ))}
          <div className="px-3 pt-2 pb-1 border-t border-line text-[10.5px] font-extrabold uppercase tracking-[.05em] text-muted">Other drivers</div>
          {!needle && <div className="px-3 py-2 text-[12px] text-muted italic">Type a name, phone or unit # to search all drivers.</div>}
          {needle && cand.isLoading && <div className="px-3 py-2 text-[12.5px] text-muted">Searching…</div>}
          {needle && !cand.isLoading && others.length === 0 && <div className="px-3 py-2 text-[12px] text-muted italic">No other drivers match.</div>}
          {others.map((w) => (
            <button key={whoKey(w)} type="button" onMouseDown={(e) => { e.preventDefault(); pick(w); }} className={row}>
              <span>{w.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PeopleChips({ who, onRemove }: { who: Who[]; onRemove: (w: Who) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5 mb-2">
      {who.map((w) => (
        <span key={whoKey(w)} className={cx('inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12.5px] font-bold',
                                             w.gone ? 'border-clay/50 bg-clay/10 text-clay' : 'border-forest/30 bg-sage/50 text-forest-deep')}>
          {w.name}{w.kind === 't' ? <span className="font-semibold text-muted text-[11px]"> (typed)</span> : null}{w.gone ? ' (removed)' : ''}
          <button onClick={() => onRemove(w)} aria-label={`Take ${w.name} off`} className="haptic grid h-5 w-5 place-items-center rounded-full hover:bg-paper"><X size={12} /></button>
        </span>
      ))}
    </div>
  );
}

function PeopleField({ who, setWho, needed, title }: { who: Who[]; setWho: (w: Who[]) => void; needed: number; title: string }) {
  const short = Math.max(0, needed - who.length);
  return (
    <div>
      <div className={lbl}>{title}</div>
      {who.length === 0 && <div className="text-[13px] font-bold text-clay mb-1">Open — nobody yet</div>}
      <PeopleChips who={who} onRemove={(w) => setWho(who.filter((x) => whoKey(x) !== whoKey(w)))} />
      {who.length > 0 && short > 0 && <div className="text-[12px] font-bold text-clay mb-1">Needs {short} more</div>}
      <PersonPicker taken={who} onPick={(w) => setWho([...who, w])} />
    </div>
  );
}

const split = (who: Who[]) => ({
  volunteerIds: who.filter((w) => w.kind === 'v').map((w) => w.id),
  typedIds: who.filter((w) => w.kind === 't').map((w) => w.id),
});

function Dialog({ title, onClose, children, footer }: { title: string; onClose: () => void; children: React.ReactNode; footer: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[2050] bg-ink/50 flex items-end md:items-center justify-center md:px-4">
      <div role="dialog" aria-label={title} className="bg-paper rounded-t-[18px] md:rounded-[16px] border border-line shadow-lift w-full md:max-w-md max-h-[92dvh] flex flex-col">
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <div className="font-display font-semibold text-[17px]">{title}</div>
          <button onClick={onClose} aria-label="Close" className="haptic grid h-8 w-8 place-items-center rounded-full hover:bg-cream"><X size={17} /></button>
        </div>
        <div className="px-4 pb-2 space-y-3 overflow-y-auto">{children}</div>
        <div className="px-4 py-3 border-t border-line">{footer}</div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Edit one day (like Edit shift): time, people needed, notes, who, cancel
// ════════════════════════════════════════════════════════════════════════════
function EditDayDialog({ inst, onClose, onCancelDay }: { inst: CenterHelpInstance; onClose: () => void; onCancelDay: () => void }) {
  const qc = useQueryClient();
  const date = dayKey(new Date(inst.starts_at));
  const orig = useMemo(() => whoFromSignups(inst), [inst]);
  const [start, setStart] = useState(hhmmOf(inst.starts_at));
  const [end, setEnd] = useState(hhmmOf(inst.ends_at));
  const [needed, setNeeded] = useState<number>(inst.volunteers_needed);
  const [notes, setNotes] = useState<string>(inst.notes ?? '');
  const [who, setWho] = useState<Who[]>(orig);
  const [err, setErr] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: async () => {
      await centerHelp.patchInstance(inst.id, {
        startsAt: new Date(`${date}T${start}`).toISOString(), endsAt: new Date(`${date}T${end}`).toISOString(),
        volunteersNeeded: needed, notes: notes.trim() || null,
      });
      const before = new Set(orig.map(whoKey)), after = new Set(who.map(whoKey));
      const add = who.filter((w) => !before.has(whoKey(w)));
      const off = orig.filter((w) => !after.has(whoKey(w)));
      if (add.length) { const s = split(add); await centerHelp.assign(inst.id, s.volunteerIds, s.typedIds); }
      await Promise.all(off.map((w) => centerHelp.unassign(inst.id, w.kind === 'v' ? { volunteerId: w.id } : { typedId: w.id }))); // Oct 20 client (speed): together
    },
    onSuccess: () => { invalidateAll(qc); onClose(); },
    onError: (e: any) => setErr(e?.message || 'Could not save'),
  });
  const timeBad = toMin(end) <= toMin(start);
  const dayLabel = new Date(inst.starts_at).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  return (
    <Dialog title="Edit center help shift" onClose={onClose}
            footer={(
              <div className="flex items-center justify-between gap-2">
                <button onClick={onCancelDay} disabled={save.isPending}
                        className="haptic text-clay text-[12px] font-bold px-3 py-1.5 rounded-[8px] border border-clay/40 hover:bg-clay/10 disabled:opacity-40">
                  Cancel shift
                </button>
                <div className="flex items-center gap-2">
                  <button onClick={onClose} className="haptic text-[12px] font-bold text-muted px-3 py-1.5">Close</button>
                  <button onClick={() => { setErr(null); save.mutate(); }} disabled={save.isPending || timeBad}
                          className="haptic text-[12px] font-bold bg-forest text-paper px-3 py-1.5 rounded-[8px] shadow-ctag disabled:opacity-50">
                    {save.isPending ? 'Saving…' : 'Save changes'}
                  </button>
                </div>
              </div>
            )}>
      <div className="text-[13px] font-bold text-ink">{taskLabel(inst.task_type)} · {dayLabel}</div>
      {inst.template_id != null && (
        <div className="text-[11.5px] text-muted italic border-l-2 border-line pl-2">
          This shift is part of the weekly schedule. Editing here changes only THIS day.
          To change every week, use <b>Weekly template</b>; <b>Cancel shift</b> can also stop this and all future ones.
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <label><span className={lbl}>Starts</span><input type="time" value={start} onChange={(e) => e.target.value && setStart(e.target.value)} className={inp} /></label>
        <label><span className={lbl}>Ends</span><input type="time" value={end} onChange={(e) => e.target.value && setEnd(e.target.value)} className={inp} /></label>
      </div>
      {timeBad && <div className="text-[11.5px] text-clay font-bold">The end time must be after the start time.</div>}
      <div className="grid grid-cols-2 gap-2">
        <label><span className={lbl}>People needed</span>
          <input type="number" min={1} max={50} value={needed} onChange={(e) => setNeeded(Math.max(1, Math.min(50, Number(e.target.value) || 1)))} className={inp} /></label>
        <label><span className={lbl}>Notes</span>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" className={inp} /></label>
      </div>
      <PeopleField who={who} setWho={setWho} needed={needed} title="Who is on this day" />
      {err && <div className="text-[12px] text-clay font-bold">{err}</div>}
    </Dialog>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// New shift (like New shift for dispatchers): Steady (weekly) or One-time
// ════════════════════════════════════════════════════════════════════════════
function NewCenterHelpDialog({ prefill, onClose }: { prefill: string | null; onClose: () => void }) {
  const qc = useQueryClient();
  const pre = prefill ? new Date(prefill) : null;
  const [mode, setMode] = useState<'steady' | 'once'>('steady');
  const [taskType, setTaskType] = useState<CenterHelpTaskType>('packing_orders');
  const [dow, setDow] = useState<number>(pre ? pre.getDay() : new Date().getDay());
  const [date, setDate] = useState<string>(pre ? dayKey(pre) : nyToday());
  const [start, setStart] = useState<string>(pre ? `${pad(pre.getHours())}:${pad(pre.getMinutes())}` : '09:00');
  const [end, setEnd] = useState<string>(() => { const h = pre ? pre.getHours() + 2 : 11; return `${pad(Math.min(23, h))}:${pre ? pad(pre.getMinutes()) : '00'}`; });
  const [needed, setNeeded] = useState(1);
  const [notes, setNotes] = useState('');
  const [who, setWho] = useState<Who[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => {
      const s = split(who);
      if (mode === 'steady') {
        return centerHelp.applyTemplate(nyToday(), [{ templateId: null, remove: false, taskType, dow, startTime: start, endTime: end, needed, notes: notes.trim() || null, ...s }]);
      }
      return centerHelp.createOne({ taskType, date, startTime: start, endTime: end, needed, notes: notes.trim() || null, ...s });
    },
    onSuccess: () => { invalidateAll(qc); uiNotify(mode === 'steady' ? 'Weekly center help shift added.' : 'Center help shift added.', 'ok'); onClose(); },
    onError: (e: any) => setErr(e?.message || 'Could not save'),
  });
  const timeBad = toMin(end) <= toMin(start);
  const tab = (on: boolean) => cx('haptic text-[12.5px] font-bold px-3 py-1.5 rounded-[8px]', on ? 'bg-forest text-paper' : 'text-muted hover:text-forest');
  // Steady = weekly template (office); a dispatcher login can add one-time days only, like the API.
  const office = isShiftsOffice();
  useEffect(() => { if (!office) setMode('once'); }, [office]);
  return (
    <Dialog title="New center help shift" onClose={onClose}
            footer={(
              <div className="flex justify-end gap-2">
                <button onClick={onClose} className="haptic text-[12px] font-bold text-muted px-3 py-1.5">Cancel</button>
                <button onClick={() => { setErr(null); save.mutate(); }} disabled={save.isPending || timeBad || !date}
                        className="haptic text-[12px] font-bold bg-forest text-paper px-3 py-1.5 rounded-[8px] shadow-ctag disabled:opacity-50">
                  {save.isPending ? 'Saving…' : 'Create shift'}
                </button>
              </div>
            )}>
      {office && (
        <div className="flex items-center gap-1 bg-cream/60 border border-line rounded-[10px] p-1 w-fit">
          <button type="button" onClick={() => setMode('steady')} className={tab(mode === 'steady')}>Steady (weekly)</button>
          <button type="button" onClick={() => setMode('once')} className={tab(mode === 'once')}>One-time</button>
        </div>
      )}
      <label className="block"><span className={lbl}>Task</span>
        <select value={taskType} onChange={(e) => setTaskType(e.target.value as CenterHelpTaskType)} className={inp}>
          {TASKS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </label>
      {mode === 'steady' ? (
        <label className="block"><span className={lbl}>Day of week</span>
          <select value={dow} onChange={(e) => setDow(Number(e.target.value))} className={inp}>
            {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
          </select>
        </label>
      ) : (
        <label className="block"><span className={lbl}>Date</span>
          <DateInput value={date} onChange={setDate} min={nyToday()} className={inp} />
        </label>
      )}
      <div className="grid grid-cols-2 gap-2">
        <label><span className={lbl}>Start time</span><input type="time" value={start} onChange={(e) => e.target.value && setStart(e.target.value)} className={inp} /></label>
        <label><span className={lbl}>End time</span><input type="time" value={end} onChange={(e) => e.target.value && setEnd(e.target.value)} className={inp} /></label>
      </div>
      {timeBad && <div className="text-[11.5px] text-clay font-bold">The end time must be after the start time.</div>}
      <div className="grid grid-cols-2 gap-2">
        <label><span className={lbl}>People needed</span>
          <input type="number" min={1} max={50} value={needed} onChange={(e) => setNeeded(Math.max(1, Math.min(50, Number(e.target.value) || 1)))} className={inp} /></label>
        <label><span className={lbl}>Notes (optional)</span>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. back room" className={inp} /></label>
      </div>
      <PeopleField who={who} setWho={setWho} needed={needed} title={mode === 'steady' ? 'People every week' : 'People'} />
      {mode === 'steady' && !timeBad && (
        <p className="text-[11.5px] text-muted">Repeats every {DAYS[dow]} at {fmt12(start)}–{fmt12(end)} until removed in the Weekly template.</p>
      )}
      {err && <div className="text-[12px] text-clay font-bold">{err}</div>}
    </Dialog>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Weekly template (office) — same layout as the dispatcher Weekly template
// ════════════════════════════════════════════════════════════════════════════
type Row = {
  key: string; templateId: number | null; dow: number; taskType: CenterHelpTaskType;
  startTime: string; endTime: string; needed: number; notes: string; who: Who[];
  orig: { taskType: string; startTime: string; endTime: string; needed: number; notes: string; who: string } | null; // null = new
  remove: boolean;
};
const whoSig = (w: Who[]) => w.map(whoKey).sort().join(',');
const isChanged = (r: Row) => r.remove || !r.orig || r.taskType !== r.orig.taskType || r.startTime !== r.orig.startTime
  || r.endTime !== r.orig.endTime || r.needed !== r.orig.needed || r.notes.trim() !== r.orig.notes || whoSig(r.who) !== r.orig.who;

function buildRows(t: CenterHelpTplRow[], drivers: Map<number, { name: string; unit: number | null; deleted: boolean }>): Row[] {
  return t.map((x) => {
    const who: Who[] = [
      ...x.volunteerIds.map((v): Who => { const d = drivers.get(v); return { kind: 'v', id: v, name: d ? d.name : `Driver ${v}`, gone: d?.deleted }; }),
      ...x.typed.map((r): Who => ({ kind: 't', id: r.pid, name: r.name })),
    ];
    const notes = x.notes ?? '';
    return { key: `t:${x.id}`, templateId: x.id, dow: x.dow, taskType: x.taskType, startTime: x.startTime, endTime: x.endTime,
             needed: x.needed, notes, who, remove: false,
             orig: { taskType: x.taskType, startTime: x.startTime, endTime: x.endTime, needed: x.needed, notes, who: whoSig(who) } };
  });
}

export function CenterHelpTemplateEditor({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['center-help-template'], queryFn: () => centerHelp.template(), staleTime: 0 });
  const [rows, setRows] = useState<Row[] | null>(null);
  const [editKey, setEditKey] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [fromDate, setFromDate] = useState<string>(() => nyToday());
  const data = q.data?.data;
  const drivers = useMemo(() => new Map((data?.drivers ?? []).map((d) => [d.id, d])), [data]);
  const list = rows ?? (data ? buildRows(data.templates, drivers) : []);
  // Typed names removed from the center help list since: show them crossed out.
  const typedOnList = useMemo(() => new Set((data?.people ?? []).filter((p) => p.volunteerId == null).map((p) => p.id)), [data]);
  const changed = list.filter(isChanged);
  const update = (key: string, patch: Partial<Row>) => setRows(list.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const addRow = (dow: number) => {
    const key = `new:${dow}:${Date.now()}`;
    setRows([...list, { key, templateId: null, dow, taskType: 'packing_orders', startTime: '09:00', endTime: '11:00', needed: 1, notes: '', who: [], orig: null, remove: false }]);
    setEditKey(key);
  };
  const save = useMutation({
    mutationFn: () => centerHelp.applyTemplate(fromDate, changed
      .filter((r) => !(r.remove && !r.orig))
      .map((r): CenterHelpApplyRow => ({ templateId: r.templateId, remove: r.remove, taskType: r.taskType, dow: r.dow,
        startTime: r.startTime, endTime: r.endTime, needed: r.needed, notes: r.notes.trim() || null,
        ...split(r.who.filter((w) => !(w.kind === 't' && !typedOnList.has(w.id)))) }))),
    onSuccess: (r) => {
      const d = r.data;
      const bits = [
        d.templatesAdded ? `${d.templatesAdded} weekly shift${d.templatesAdded === 1 ? '' : 's'} added` : '',
        d.templatesChanged ? `${d.templatesChanged} changed` : '',
        d.templatesRemoved ? `${d.templatesRemoved} removed` : '',
      ].filter(Boolean);
      uiNotify(`Saved${bits.length ? ` — ${bits.join(', ')}` : ''}.`, 'ok');
      setAsking(false); setRows(null);
      invalidateAll(qc);
    },
    onError: (e: any) => uiNotify(`Couldn't save: ${e?.message ?? 'error'}`, 'err'),
  });
  async function close() {
    if (changed.length && !(await uiConfirm('Close without saving your changes?', { okLabel: 'Discard changes', cancelLabel: 'Keep editing' }))) return;
    onClose();
  }
  const editing = list.find((r) => r.key === editKey) ?? null;
  const byDay = (d: number) => list.filter((r) => r.dow === d && !r.remove).sort((a, b) => toMin(a.startTime) - toMin(b.startTime));

  return (
    <Sheet title="Weekly template — center help" onClose={() => { void close(); }}
           footer={(
             <div className="flex items-center justify-between gap-2">
               <div className="text-[12.5px] text-muted">{changed.length ? `${changed.length} change${changed.length === 1 ? '' : 's'} not saved` : 'No changes'}</div>
               <div className="flex gap-2">
                 {changed.length > 0 && <button onClick={() => setRows(null)} className={cx(btn, 'text-muted')}>Undo all</button>}
                 <button onClick={() => setAsking(true)} disabled={!changed.length} className={cx(btn, 'bg-forest text-paper')}>Save…</button>
               </div>
             </div>
           )}>
      <div className="rounded-[12px] border border-sage-line bg-sage/40 p-3 text-[12.5px] text-forest mb-3">
        The regular week at the center. Each box is a shift that repeats every week, with who is on it — or <b className="text-clay">Open</b>.
        Tap a box to change it; <b>+ Add</b> adds a shift to that day.
      </div>
      {q.isLoading && <div className="text-[13px] text-muted">Loading…</div>}
      {q.isError && <div className="text-[13px] text-clay">Couldn't load: {(q.error as any)?.message}</div>}
      {data && (
        <div className="grid grid-cols-1 md:grid-cols-7 gap-2">
          {DAYS.map((label, d) => (
            <div key={d} data-day={d} className="rounded-[12px] border border-line bg-paper overflow-hidden flex flex-col">
              <div className="px-2 py-1.5 border-b border-line flex items-center justify-between bg-cream/40">
                <div className="text-[11px] font-extrabold uppercase tracking-[.05em] text-muted">
                  <span className="md:hidden">{label}</span><span className="hidden md:inline">{label.slice(0, 3)}</span>
                </div>
                <button onClick={() => addRow(d)} aria-label={`Add a center help shift on ${label}`}
                        className="haptic inline-flex items-center gap-0.5 text-[11px] font-bold text-forest border border-line rounded-[7px] px-1.5 py-0.5 hover:bg-cream">
                  <Plus size={12} /> Add
                </button>
              </div>
              <div className="p-1.5 space-y-1.5 flex-1">
                {byDay(d).length === 0 && <div className="text-[11px] text-muted italic text-center py-2">No shifts</div>}
                {byDay(d).map((r) => {
                  const ch = isChanged(r);
                  const short = Math.max(0, r.needed - r.who.length);
                  return (
                    <button key={r.key} data-row={r.key} onClick={() => setEditKey(r.key)}
                            className={cx('haptic block w-full text-left rounded-[9px] border border-l-4 px-2 py-1.5 hover:bg-cream/60',
                                          short ? 'border-line border-l-clay' : 'border-line border-l-forest', ch && 'ring-2 ring-amber/60')}>
                      <div className="text-[11.5px] font-bold text-forest-deep">{fmt12(r.startTime)}–{fmt12(r.endTime)}</div>
                      <div className="text-[11px] text-muted leading-tight">{taskLabel(r.taskType)}</div>
                      {r.who.length === 0
                        ? <div className="text-[12px] font-extrabold text-clay">Open</div>
                        : r.who.map((w) => {
                            const gone = w.gone || (w.kind === 't' && !typedOnList.has(w.id));
                            return <div key={whoKey(w)} className={cx('text-[12px] font-bold leading-tight break-words', gone ? 'text-clay line-through' : 'text-ink')}>{w.name}</div>;
                          })}
                      {r.who.length > 0 && short > 0 && <div className="text-[11px] font-extrabold text-clay">needs {short} more</div>}
                      {ch && <div className="text-[10px] font-bold uppercase tracking-[.05em] text-[#9a7415] mt-0.5">{r.orig ? 'Changed' : 'New'}</div>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
      {list.some((r) => r.remove && r.orig) && (
        <div className="mt-3 text-[12px] text-muted">
          To be removed: {list.filter((r) => r.remove && r.orig).map((r) => `${DAYS[r.dow]!.slice(0, 3)} ${fmt12(r.startTime)}–${fmt12(r.endTime)} ${taskLabel(r.taskType)}`).join(', ')}
          {' '}<button className="font-bold text-forest hover:underline" onClick={() => setRows(list.map((r) => (r.remove && r.orig ? { ...r, remove: false } : r)))}>Undo</button>
        </div>
      )}

      {editing && (
        <TemplateRowDialog row={editing} onChange={(patch) => update(editing.key, patch)}
                           onRemove={() => { if (!editing.orig) setRows(list.filter((r) => r.key !== editing.key)); else update(editing.key, { remove: true }); setEditKey(null); }}
                           onClose={() => setEditKey(null)} />
      )}
      {asking && (
        <ApplyFromDateDialog count={changed.length} fromDate={fromDate} setFromDate={setFromDate} max={data?.maxDay}
                             what="Center help shifts" saving={save.isPending} onBack={() => setAsking(false)} onSave={() => save.mutate()} />
      )}
    </Sheet>
  );
}

function TemplateRowDialog({ row, onChange, onRemove, onClose }: {
  row: Row; onChange: (patch: Partial<Row>) => void; onRemove: () => void; onClose: () => void;
}) {
  const timeBad = toMin(row.endTime) <= toMin(row.startTime);
  return (
    <Dialog title={`${DAYS[row.dow]} center help shift`} onClose={onClose}
            footer={(
              <div className="flex items-center justify-between">
                <button onClick={onRemove} className={cx(btn, 'text-clay border border-clay/40 hover:bg-clay/10')}>
                  <Trash2 size={14} /> Remove this shift
                </button>
                <button onClick={onClose} disabled={timeBad} className={cx(btn, 'bg-forest text-paper')}>Done</button>
              </div>
            )}>
      <label className="block"><span className={lbl}>Task</span>
        <select value={row.taskType} onChange={(e) => onChange({ taskType: e.target.value as CenterHelpTaskType })} className={inp}>
          {TASKS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label><span className={lbl}>Starts</span>
          <input type="time" value={row.startTime} onChange={(e) => e.target.value && onChange({ startTime: e.target.value })} className={cx(inp, 'tabular-nums')} /></label>
        <label><span className={lbl}>Ends</span>
          <input type="time" value={row.endTime} onChange={(e) => e.target.value && onChange({ endTime: e.target.value })} className={cx(inp, 'tabular-nums')} /></label>
      </div>
      {timeBad && <div className="text-[11.5px] text-clay font-bold">The end time must be after the start time.</div>}
      <div className="grid grid-cols-2 gap-2">
        <label><span className={lbl}>People needed</span>
          <input type="number" min={1} max={50} value={row.needed} onChange={(e) => onChange({ needed: Math.max(1, Math.min(50, Number(e.target.value) || 1)) })} className={inp} /></label>
        <label><span className={lbl}>Notes</span>
          <input value={row.notes} onChange={(e) => onChange({ notes: e.target.value })} placeholder="Optional" className={inp} /></label>
      </div>
      <PeopleField who={row.who} setWho={(who) => onChange({ who })} needed={row.needed} title="People every week" />
    </Dialog>
  );
}
