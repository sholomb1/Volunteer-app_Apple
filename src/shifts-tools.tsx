/**
 * Oct 14 client: two office tools on Admin → People → Shifts.
 *   "Weekly template" — "I want an easy way to edit the shifts template."
 *       A week grid (Sun–Sat) of the regular dispatcher shifts; each shows who
 *       covers it every week or "Open". Tap one to change times / dispatchers
 *       or remove it; "+ Add" per day. Save asks from which date to apply;
 *       past shifts never change. API: GET /api/shift-template, POST /apply.
 *   "Clean up…" — "some things there don't belong. Can we clean up all the
 *       existing shifts?" A review list grouped by problem, with a plain
 *       reason per row; only the sure ones are ticked. "Remove selected"
 *       cancels them the same way Cancel does. API: GET/POST /api/shifts/cleanup.
 */
import { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X, Plus, Trash2 } from 'lucide-react';
import { api, getUser } from './api';
import { cx, DateInput } from './design';
import { nyToday } from './time-format';
import { uiConfirm, uiNotify } from './ui-dialogs';

// ── API (kept here so the shared api.ts isn't touched) ────────────────────
type CleanupItem = {
  key: string; kind: 'shift' | 'series'; id: number; seriesId: number | null;
  who: string; when: string; reason: string; sure: boolean; upcoming?: number;
};
type CleanupGroup = { key: string; title: string; items: CleanupItem[] };
type TplSlot = { id: number; section: string; rosterDow: number; startDow: number; startTime: string; endTime: string; wrapsNextDay: boolean };
type TplSeries = { id: number; volunteerId: number; dow: number; startTime: string; endTime: string; name: string; unit: number | null; isDispatcher: boolean; deleted: boolean };
type TplDispatcher = { id: number; name: string; unit: number | null };
type ApplyRow = { slotId: number | null; onTemplate: boolean; remove: boolean; startDow: number; startTime: string; endTime: string; volunteerIds: number[]; seriesIds: number[] };

const shiftTools = {
  cleanup: () => api<{ data: CleanupGroup[]; checked: { shifts: number; series: number } }>('/api/shifts/cleanup'),
  removeSelected: (items: Array<{ kind: 'shift' | 'series'; id: number; scope: 'one' | 'future' }>) =>
    api<{ data: { shiftsCancelled: number; seriesStopped: number } }>('/api/shifts/cleanup', { method: 'POST', body: JSON.stringify({ items }) }),
  template: () => api<{ data: { slots: TplSlot[]; series: TplSeries[]; dispatchers: TplDispatcher[]; today: string } }>('/api/shift-template'),
  apply: (fromDate: string, rows: ApplyRow[]) =>
    api<{ data: Record<string, number> }>('/api/shift-template/apply', { method: 'POST', body: JSON.stringify({ fromDate, rows }) }),
};

// ── Oct 14 client: Cancel on a SERIES shift asks "just this one" or "this and
// all future ones"; a one-time shift keeps the simple yes/no. ──────────────
export function cancelShift(id: number, scope: 'one' | 'future') {
  return api(`/api/shifts/${id}${scope === 'future' ? '?scope=future' : ''}`, { method: 'DELETE' });
}
export function askCancelShift(sh: { starts_at: string; recurring_shift_id?: number | null }): Promise<'one' | 'future' | null> {
  if (sh.recurring_shift_id == null) return uiConfirm('Cancel this shift?').then((ok) => (ok ? 'one' : null));
  return new Promise((resolve) => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const root = createRoot(el);
    const done = (v: 'one' | 'future' | null) => { root.unmount(); el.remove(); resolve(v); };
    const day = new Date(sh.starts_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/New_York' });
    const b = 'haptic block w-full rounded-[10px] px-3 py-2.5 text-[13.5px] font-bold text-left';
    root.render(
      <div className="fixed inset-0 z-[3000] bg-ink/50 flex items-end md:items-center justify-center md:px-4"
           onKeyDown={(e) => { if (e.key === 'Escape') done(null); }}>
        <div role="dialog" aria-label="Cancel this shift?" className="bg-paper rounded-t-[18px] md:rounded-[16px] border border-line shadow-lift w-full md:max-w-sm p-4 space-y-2">
          <div className="font-display font-semibold text-[17px]">Cancel this shift?</div>
          <div className="text-[12.5px] text-muted">It repeats every week. Past shifts don't change.</div>
          <button autoFocus onClick={() => done('one')} className={cx(b, 'border border-clay/40 text-clay hover:bg-clay/10')}>Just this one ({day})</button>
          <button onClick={() => done('future')} className={cx(b, 'bg-clay text-paper')}>This and all future ones in the series</button>
          <button onClick={() => done(null)} className={cx(b, 'text-muted text-center hover:bg-cream')}>Go back</button>
        </div>
      </div>,
    );
  });
}

/** Office only (admin / coordinator / staff) — not dispatchers or viewers. */
export function isShiftsOffice(): boolean {
  return ['admin', 'coordinator', 'staff'].includes(String(getUser()?.role ?? ''));
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
function fmt12(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const ap = (h ?? 0) >= 12 ? 'PM' : 'AM';
  const h12 = (h ?? 0) % 12 === 0 ? 12 : (h ?? 0) % 12;
  return m ? `${h12}:${String(m).padStart(2, '0')} ${ap}` : `${h12} ${ap}`;
}
const toMin = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return (h ?? 0) * 60 + (m ?? 0); };
const btn = 'haptic inline-flex items-center gap-1.5 rounded-[10px] px-3 py-2 text-[12.5px] font-bold disabled:opacity-40';

/** Full-screen on a phone, a big centered panel on a computer. */
function Sheet({ title, onClose, children, footer }: { title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[2000] bg-ink/50 flex items-stretch md:items-start justify-center md:pt-10 md:px-4">
      <div role="dialog" aria-label={title}
           className="relative bg-paper md:rounded-[18px] shadow-lift border border-line w-full md:max-w-5xl flex flex-col max-h-[100dvh] md:max-h-[88vh]">
        <div className="bg-paper border-b border-line px-4 py-3 flex items-center justify-between md:rounded-t-[18px]">
          <div className="font-display font-semibold text-[18px]">{title}</div>
          <button onClick={onClose} aria-label="Close" className="haptic grid h-9 w-9 place-items-center rounded-full hover:bg-cream"><X size={18} /></button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-4">{children}</div>
        {footer && <div className="border-t border-line bg-paper px-4 py-3 md:rounded-b-[18px]">{footer}</div>}
      </div>
    </div>
  );
}

// ── The two buttons on the Shifts page ────────────────────────────────────
export function ShiftsOfficeTools() {
  const [open, setOpen] = useState<null | 'template' | 'cleanup'>(null);
  if (!isShiftsOffice()) return null;
  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => setOpen('template')} className={cx(btn, 'border border-forest/40 bg-sage/40 text-forest hover:bg-sage')}>
          Weekly template
        </button>
        <button onClick={() => setOpen('cleanup')} className={cx(btn, 'border border-line bg-paper text-ink hover:bg-cream')}>
          Clean up…
        </button>
      </div>
      {open === 'template' && <WeeklyTemplateEditor onClose={() => setOpen(null)} />}
      {open === 'cleanup' && <ShiftsCleanup onClose={() => setOpen(null)} />}
    </>
  );
}

// ── Clean up… ─────────────────────────────────────────────────────────────
export function ShiftsCleanup({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['shifts', 'cleanup'], queryFn: shiftTools.cleanup });
  const groups = q.data?.data ?? [];
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [scope, setScope] = useState<Record<string, 'one' | 'future'>>({});
  const isOn = (it: CleanupItem) => picked[it.key] ?? it.sure;
  const all = groups.flatMap((g) => g.items);
  const chosen = all.filter(isOn);
  const remove = useMutation({
    mutationFn: () => shiftTools.removeSelected(chosen.map((it) => ({ kind: it.kind, id: it.id, scope: scope[it.key] ?? 'one' }))),
    onSuccess: (r) => {
      const d = r.data;
      uiNotify(`Removed ${d.shiftsCancelled} shift${d.shiftsCancelled === 1 ? '' : 's'}${d.seriesStopped ? ` and stopped ${d.seriesStopped} weekly shift${d.seriesStopped === 1 ? '' : 's'}` : ''}.`, 'ok');
      setPicked({}); setScope({});
      qc.invalidateQueries({ queryKey: ['shifts'] });
    },
    onError: (e: any) => uiNotify(`Couldn't remove: ${e?.message ?? 'error'}`, 'err'),
  });
  async function go() {
    if (!chosen.length) return;
    const weekly = chosen.filter((it) => it.kind === 'series' || scope[it.key] === 'future').length;
    const ok = await uiConfirm(
      `Remove ${chosen.length} selected?${weekly ? ` ${weekly} weekly shift${weekly === 1 ? '' : 's'} will stop repeating.` : ''} Past shifts stay in the history.`,
      { okLabel: `Remove ${chosen.length}`, cancelLabel: 'Go back' });
    if (ok) remove.mutate();
  }
  const setGroup = (g: CleanupGroup, on: boolean) => setPicked((p) => { const n = { ...p }; for (const it of g.items) n[it.key] = on; return n; });

  return (
    <Sheet title="Clean up shifts" onClose={onClose}
           footer={groups.length > 0 ? (
             <div className="flex items-center justify-between gap-2">
               <div className="text-[12.5px] text-muted">{chosen.length} of {all.length} selected</div>
               <div className="flex gap-2">
                 <button onClick={onClose} className={cx(btn, 'text-muted')}>Close</button>
                 <button onClick={() => { void go(); }} disabled={!chosen.length || remove.isPending}
                         className={cx(btn, 'bg-clay text-paper')}>
                   <Trash2 size={14} /> {remove.isPending ? 'Removing…' : `Remove selected (${chosen.length})`}
                 </button>
               </div>
             </div>
           ) : undefined}>
      <div className="rounded-[12px] border border-sage-line bg-sage/40 p-3 text-[12.5px] text-forest mb-3">
        These upcoming shifts don't look right. <b>Ticked = sure</b>; the others are for you to check.
        Removing works like <b>Cancel</b> — nothing in the past changes.
      </div>
      {q.isLoading && <div className="text-[13px] text-muted">Checking…</div>}
      {q.isError && <div className="text-[13px] text-clay">Couldn't check: {(q.error as any)?.message}</div>}
      {!q.isLoading && !q.isError && groups.length === 0 && (
        <div className="text-center py-10 text-[14px] text-forest font-bold">Nothing to clean up — the list looks right.</div>
      )}
      <div className="space-y-4">
        {groups.map((g) => {
          const on = g.items.filter(isOn).length;
          return (
            <section key={g.key} data-group={g.key} className="rounded-[14px] border border-line overflow-hidden">
              <div className="px-3 py-2 bg-cream/50 border-b border-line flex items-center justify-between gap-2">
                <div className="font-display font-bold text-[15px] text-ink">{g.title} <span className="text-muted text-[12px] font-sans">· {g.items.length}</span></div>
                <button onClick={() => setGroup(g, on < g.items.length)} className="haptic text-[11.5px] font-bold text-forest hover:underline">
                  {on < g.items.length ? 'Tick all' : 'Untick all'}
                </button>
              </div>
              <ul className="divide-y divide-line/70">
                {g.items.map((it) => (
                  <li key={it.key} className="px-3 py-2.5 flex items-start gap-3">
                    <label className="tap40-box shrink-0">{/* Oct 14 client: 40px tap area on phones */}
                      <input type="checkbox" className="mt-1 h-5 w-5 accent-[#2f5d3a]" checked={isOn(it)} aria-label={`Remove ${it.who} ${it.when}`}
                             onChange={(e) => setPicked((p) => ({ ...p, [it.key]: e.target.checked }))} />
                    </label>
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-[13.5px] text-ink break-words">
                        {it.who}
                        {it.kind === 'series' && (
                          <span className="ml-1.5 align-middle text-[10px] font-extrabold uppercase tracking-[.05em] bg-sage text-forest px-1.5 py-[1px] rounded-full">
                            Weekly{it.upcoming ? ` · ${it.upcoming} upcoming` : ''}
                          </span>
                        )}
                      </div>
                      <div className="text-[12px] text-muted">{it.when}</div>
                      <div className="text-[12.5px] text-clay font-semibold mt-0.5">{it.reason}</div>
                      {it.kind === 'series' && <div className="text-[11.5px] text-muted mt-0.5">Removing stops it repeating and removes its upcoming shifts.</div>}
                      {it.kind === 'shift' && it.seriesId != null && (
                        <select value={scope[it.key] ?? 'one'} onChange={(e) => setScope((s) => ({ ...s, [it.key]: e.target.value as 'one' | 'future' }))}
                                className="mt-1 border border-line rounded-[8px] px-2 py-1 text-[12px] bg-paper">
                          <option value="one">Just this one</option>
                          <option value="future">This and future (stop the weekly shift)</option>
                        </select>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </Sheet>
  );
}

// ── Weekly template ───────────────────────────────────────────────────────
type Row = {
  key: string; slotId: number | null; onTemplate: boolean; startDow: number;
  startTime: string; endTime: string; volunteerIds: number[]; seriesIds: number[];
  orig: { startTime: string; endTime: string; volunteerIds: number[] } | null; // null = new
  remove: boolean;
};
const sameSet = (a: number[], b: number[]) => a.length === b.length && [...a].sort().join(',') === [...b].sort().join(',');
const isChanged = (r: Row) => r.remove || !r.orig || r.startTime !== r.orig.startTime || r.endTime !== r.orig.endTime || !sameSet(r.volunteerIds, r.orig.volunteerIds);

function buildRows(slots: TplSlot[], series: TplSeries[]): Row[] {
  const rows: Row[] = [];
  const used = new Set<number>();
  for (const s of slots) {
    const on = series.filter((x) => x.dow === s.startDow && x.startTime === s.startTime && x.endTime === s.endTime);
    on.forEach((x) => used.add(x.id));
    const vids = [...new Set(on.map((x) => Number(x.volunteerId)))];
    rows.push({ key: `slot:${s.id}`, slotId: s.id, onTemplate: true, startDow: s.startDow, startTime: s.startTime, endTime: s.endTime,
                volunteerIds: vids, seriesIds: on.map((x) => x.id), orig: { startTime: s.startTime, endTime: s.endTime, volunteerIds: vids }, remove: false });
  }
  // Weekly shifts that don't sit on a template slot (e.g. 8 AM–12 PM).
  const extra = new Map<string, TplSeries[]>();
  for (const x of series) {
    if (used.has(x.id)) continue;
    const k = `${x.dow}|${x.startTime}|${x.endTime}`;
    if (!extra.has(k)) extra.set(k, []);
    extra.get(k)!.push(x);
  }
  for (const [k, on] of extra) {
    const f = on[0]!;
    const vids = [...new Set(on.map((x) => Number(x.volunteerId)))];
    rows.push({ key: `extra:${k}`, slotId: null, onTemplate: false, startDow: f.dow, startTime: f.startTime, endTime: f.endTime,
                volunteerIds: vids, seriesIds: on.map((x) => x.id), orig: { startTime: f.startTime, endTime: f.endTime, volunteerIds: vids }, remove: false });
  }
  return rows;
}

export function WeeklyTemplateEditor({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['shift-template'], queryFn: shiftTools.template, staleTime: 0 });
  const [rows, setRows] = useState<Row[] | null>(null);
  const [editKey, setEditKey] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [fromDate, setFromDate] = useState<string>(() => nyToday());
  const data = q.data?.data;
  const list = rows ?? (data ? buildRows(data.slots, data.series) : []);
  const people = useMemo(() => {
    const m = new Map<number, { name: string; unit: number | null; ok: boolean }>();
    for (const s of data?.series ?? []) m.set(Number(s.volunteerId), { name: s.name, unit: s.unit, ok: s.isDispatcher && !s.deleted });
    for (const d of data?.dispatchers ?? []) m.set(Number(d.id), { name: d.name, unit: d.unit, ok: true });
    return m;
  }, [data]);
  const changed = list.filter(isChanged);
  const update = (key: string, patch: Partial<Row>) => setRows(list.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const addSlot = (dow: number) => {
    const key = `new:${dow}:${Date.now()}`;
    setRows([...list, { key, slotId: null, onTemplate: true, startDow: dow, startTime: '09:30', endTime: '13:30', volunteerIds: [], seriesIds: [], orig: null, remove: false }]);
    setEditKey(key);
  };
  const save = useMutation({
    mutationFn: () => shiftTools.apply(fromDate, changed
      .filter((r) => !(r.remove && !r.orig)) // added then removed again = nothing
      .map((r) => ({ slotId: r.slotId, onTemplate: r.onTemplate, remove: r.remove, startDow: r.startDow,
                     startTime: r.startTime, endTime: r.endTime, volunteerIds: r.volunteerIds, seriesIds: r.seriesIds }))),
    onSuccess: (r) => {
      const d = r.data;
      const bits = [
        d.seriesStarted ? `${d.seriesStarted} weekly shift${d.seriesStarted === 1 ? '' : 's'} added` : '',
        d.seriesStopped ? `${d.seriesStopped} stopped` : '',
        (d.slotsAdded || d.slotsChanged || d.slotsRemoved) ? 'template updated' : '',
      ].filter(Boolean);
      uiNotify(`Saved${bits.length ? ` — ${bits.join(', ')}` : ''}.`, 'ok');
      setAsking(false); setRows(null);
      qc.invalidateQueries({ queryKey: ['shift-template'] });
      qc.invalidateQueries({ queryKey: ['shifts'] });
      qc.invalidateQueries({ queryKey: ['disp-weekly'] });
      qc.invalidateQueries({ queryKey: ['disp-slots'] });
    },
    onError: (e: any) => uiNotify(`Couldn't save: ${e?.message ?? 'error'}`, 'err'),
  });
  async function close() {
    if (changed.length && !(await uiConfirm('Close without saving your changes?', { okLabel: 'Discard changes', cancelLabel: 'Keep editing' }))) return;
    onClose();
  }
  const editing = list.find((r) => r.key === editKey) ?? null;
  const byDay = (d: number) => list.filter((r) => r.startDow === d && !r.remove).sort((a, b) => toMin(a.startTime) - toMin(b.startTime));

  return (
    <Sheet title="Weekly template" onClose={() => { void close(); }}
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
        The regular week. Each box is a shift that repeats every week, with who covers it — or <b className="text-clay">Open</b>.
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
                <button onClick={() => addSlot(d)} aria-label={`Add a shift on ${label}`}
                        className="haptic inline-flex items-center gap-0.5 text-[11px] font-bold text-forest border border-line rounded-[7px] px-1.5 py-0.5 hover:bg-cream">
                  <Plus size={12} /> Add
                </button>
              </div>
              <div className="p-1.5 space-y-1.5 flex-1">
                {byDay(d).length === 0 && <div className="text-[11px] text-muted italic text-center py-2">No shifts</div>}
                {byDay(d).map((r) => {
                  const ch = isChanged(r);
                  return (
                    <button key={r.key} data-row={r.key} onClick={() => setEditKey(r.key)}
                            className={cx('haptic block w-full text-left rounded-[9px] border border-l-4 px-2 py-1.5 hover:bg-cream/60',
                                          r.volunteerIds.length ? 'border-line border-l-forest' : 'border-line border-l-clay',
                                          ch && 'ring-2 ring-amber/60')}>
                      <div className="text-[11.5px] font-bold text-forest-deep">{fmt12(r.startTime)}–{fmt12(r.endTime)}</div>
                      {r.volunteerIds.length === 0
                        ? <div className="text-[12px] font-extrabold text-clay">Open</div>
                        : r.volunteerIds.map((v) => {
                            const p = people.get(v);
                            return <div key={v} className={cx('text-[12px] font-bold leading-tight break-words', p?.ok === false ? 'text-clay line-through' : 'text-ink')}>{p?.name ?? `#${v}`}</div>;
                          })}
                      {!r.onTemplate && <div className="text-[10px] font-bold uppercase tracking-[.05em] text-muted mt-0.5">Extra weekly shift</div>}
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
          To be removed: {list.filter((r) => r.remove && r.orig).map((r) => `${DAYS[r.startDow]!.slice(0, 3)} ${fmt12(r.startTime)}–${fmt12(r.endTime)}`).join(', ')}
          {' '}<button className="font-bold text-forest hover:underline" onClick={() => setRows(list.map((r) => (r.remove && r.orig ? { ...r, remove: false } : r)))}>Undo</button>
        </div>
      )}

      {editing && data && (
        <SlotDialog row={editing} people={people} dispatchers={data.dispatchers}
                    onChange={(patch) => update(editing.key, patch)}
                    onRemove={() => { if (!editing.orig) setRows(list.filter((r) => r.key !== editing.key)); else update(editing.key, { remove: true }); setEditKey(null); }}
                    onClose={() => setEditKey(null)} />
      )}

      {asking && (
        <div className="fixed inset-0 z-[2100] bg-ink/50 flex items-center justify-center px-4">
          <div role="dialog" aria-label="Apply template" className="bg-paper rounded-[16px] border border-line shadow-lift w-full max-w-sm p-4 space-y-3">
            <div className="font-display font-semibold text-[17px]">Apply to upcoming weeks?</div>
            <div className="text-[13px] text-ink">
              Shifts from this date on will be changed to match ({changed.length} change{changed.length === 1 ? '' : 's'}).
              Past shifts don't change.
            </div>
            <label className="block">
              <span className="block text-[11px] font-extrabold uppercase tracking-[.05em] text-muted mb-1">Starting</span>
              <DateInput value={fromDate} onChange={setFromDate} min={nyToday()} className="w-full border border-line rounded-[8px] px-2 py-2 bg-paper text-[14px]" />
            </label>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setAsking(false)} className={cx(btn, 'text-muted')}>Go back</button>
              <button onClick={() => save.mutate()} disabled={save.isPending || !fromDate} className={cx(btn, 'bg-forest text-paper')}>
                {save.isPending ? 'Saving…' : 'Save and apply'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Sheet>
  );
}

function SlotDialog({ row, people, dispatchers, onChange, onRemove, onClose }: {
  row: Row; people: Map<number, { name: string; unit: number | null; ok: boolean }>; dispatchers: TplDispatcher[];
  onChange: (patch: Partial<Row>) => void; onRemove: () => void; onClose: () => void;
}) {
  const free = dispatchers.filter((d) => !row.volunteerIds.includes(Number(d.id)));
  const timeCls = 'w-full border border-line rounded-[8px] px-2 py-2 bg-paper text-[14px] tabular-nums';
  return (
    <div className="fixed inset-0 z-[2050] bg-ink/50 flex items-end md:items-center justify-center md:px-4">
      <div role="dialog" aria-label="Edit shift" className="bg-paper rounded-t-[18px] md:rounded-[16px] border border-line shadow-lift w-full md:max-w-sm p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="font-display font-semibold text-[17px]">{DAYS[row.startDow]} shift</div>
          <button onClick={onClose} aria-label="Close" className="haptic grid h-8 w-8 place-items-center rounded-full hover:bg-cream"><X size={17} /></button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label><span className="block text-[11px] font-extrabold uppercase tracking-[.05em] text-muted mb-1">Starts</span>
            <input type="time" value={row.startTime} onChange={(e) => e.target.value && onChange({ startTime: e.target.value })} className={timeCls} /></label>
          <label><span className="block text-[11px] font-extrabold uppercase tracking-[.05em] text-muted mb-1">Ends</span>
            <input type="time" value={row.endTime} onChange={(e) => e.target.value && onChange({ endTime: e.target.value })} className={timeCls} /></label>
        </div>
        {toMin(row.endTime) <= toMin(row.startTime) && row.endTime !== row.startTime && (
          <div className="text-[11.5px] text-muted">Ends the next morning.</div>
        )}
        {row.endTime === row.startTime && <div className="text-[11.5px] text-clay font-bold">Start and end can't be the same.</div>}
        <div>
          <div className="text-[11px] font-extrabold uppercase tracking-[.05em] text-muted mb-1">Dispatcher{row.volunteerIds.length === 1 ? '' : 's'} every week</div>
          {row.volunteerIds.length === 0 && <div className="text-[13px] font-bold text-clay mb-1">Open — nobody yet</div>}
          <div className="flex flex-wrap gap-1.5 mb-2">
            {row.volunteerIds.map((v) => {
              const p = people.get(v);
              return (
                <span key={v} className={cx('inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12.5px] font-bold',
                                            p?.ok === false ? 'border-clay/50 bg-clay/10 text-clay' : 'border-forest/30 bg-sage/50 text-forest-deep')}>
                  {p?.name ?? `#${v}`}{p?.unit != null ? ` #${p.unit}` : ''}{p?.ok === false ? ' (not a dispatcher)' : ''}
                  <button onClick={() => onChange({ volunteerIds: row.volunteerIds.filter((x) => x !== v) })} aria-label={`Take ${p?.name ?? v} off`}
                          className="haptic grid h-5 w-5 place-items-center rounded-full hover:bg-paper"><X size={12} /></button>
                </span>
              );
            })}
          </div>
          <select value="" onChange={(e) => { const v = Number(e.target.value); if (v) onChange({ volunteerIds: [...row.volunteerIds, v] }); }}
                  aria-label="Add a dispatcher" className="w-full border border-line rounded-[8px] px-2 py-2 bg-paper text-[14px]">
            <option value="">+ Add a dispatcher…</option>
            {free.map((d) => <option key={d.id} value={d.id}>{d.name}{d.unit != null ? ` #${d.unit}` : ''}</option>)}
          </select>
        </div>
        <div className="flex items-center justify-between pt-1">
          <button onClick={onRemove} className={cx(btn, 'text-clay border border-clay/40 hover:bg-clay/10')}>
            <Trash2 size={14} /> {row.onTemplate ? 'Remove this shift' : 'Stop this weekly shift'}
          </button>
          <button onClick={onClose} disabled={row.endTime === row.startTime} className={cx(btn, 'bg-forest text-paper')}>Done</button>
        </div>
      </div>
    </div>
  );
}
