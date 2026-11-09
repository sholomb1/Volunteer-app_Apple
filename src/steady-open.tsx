/**
 * Nov 6 Yakov: "This is for him personally not to receive messages. I'm referring to pause his
 * steady pickup — it should be open for others." → on the steady pickup (Steady pickups → Edit):
 * "🚗 Usual driver off — open for others": From → To (+ a note), which usual driver(s), and
 * "Open for other drivers". For those days only, that driver is taken off THIS steady pickup and
 * it goes out to the group like any open pickup. His texts and his other steadies stay as they are.
 * ✕ (or shorter dates) puts him back on the days still open with no other driver.
 * Pickup cards / the pickup page show "Usual driver off — open for others" on those days.
 * API: apps/api/src/steady-away.ts (GET/POST/PUT/DELETE /api/steady-pickups/:id/open-windows,
 * GET /api/steady-pickups/open-windows). Works at once (no need to press Save).
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { api } from './api';
import { uiConfirm } from './ui-dialogs';
import { cx } from './design';

type Driver = { id: number; name: string; days: number[] | null };
type Win = { volunteerId: number; name: string; from: string; to: string; note?: string; by?: string };
type Data = { drivers: Driver[]; windows: Win[]; released?: number; putBack?: number };
type Group = { key: string; from: string; to: string; note?: string; by?: string; vids: number[]; names: string[] };

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const nyToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());

/** "Mon Nov 9" */
export function dayLabel(ymd: string): string {
  const d = new Date(`${ymd.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return ymd;
  return `${DOW[d.getDay()]} ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}
export const daysLabel = (from: string, to: string) => (from === to ? dayLabel(from) : `${dayLabel(from)} – ${dayLabel(to)}`);

function groupsOf(ws: Win[]): Group[] {
  const m = new Map<string, Group>();
  for (const w of ws) {
    const key = `${w.from}|${w.to}|${w.note ?? ''}|${w.by ?? ''}`;
    const g = m.get(key) ?? { key, from: w.from, to: w.to, note: w.note, by: w.by, vids: [], names: [] };
    g.vids.push(w.volunteerId); g.names.push(w.name);
    m.set(key, g);
  }
  return [...m.values()];
}

const dayCount = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`;

export function SteadyOpenBox({ steadyId }: { steadyId: number }) {
  const qc = useQueryClient();
  const key = ['steady-open-windows', steadyId];
  const q = useQuery({ queryKey: key, queryFn: () => api<{ data: Data }>(`/api/steady-pickups/${steadyId}/open-windows`), staleTime: 15_000 });
  const today = nyToday();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [note, setNote] = useState('');
  const [picked, setPicked] = useState<number[] | null>(null); // null = all usual drivers
  const [msg, setMsg] = useState<string | null>(null);
  const [edit, setEdit] = useState<{ key: string; from: string; to: string } | null>(null);
  const drivers = q.data?.data.drivers ?? [];
  const groups = useMemo(() => groupsOf(q.data?.data.windows ?? []), [q.data]);
  const chosen = picked ?? drivers.map((d) => d.id);

  const done = (d: Data, text: string) => {
    qc.setQueryData(key, { data: d });
    void qc.invalidateQueries({ queryKey: ['steady-open-all'] });
    setMsg(text);
  };
  const add = useMutation({
    mutationFn: () => api<{ data: Data }>(`/api/steady-pickups/${steadyId}/open-windows`, {
      method: 'POST', body: JSON.stringify({ from, to: to || from, note: note.trim() || undefined, volunteerIds: chosen }),
    }),
    onSuccess: (r) => {
      const n = r.data.released ?? 0;
      done(r.data, n > 0
        ? `Done. Taken off ${dayCount(n)} that were already on the schedule. They are open for other drivers now.`
        : 'Done. On those days this pickup will be open for other drivers.');
      setFrom(''); setTo(''); setNote(''); setPicked(null);
    },
  });
  const change = useMutation({
    mutationFn: (v: { g: Group; from: string; to: string }) => api<{ data: Data }>(`/api/steady-pickups/${steadyId}/open-windows`, {
      method: 'PUT', body: JSON.stringify({ volunteerIds: v.g.vids, from: v.g.from, to: v.g.to, newFrom: v.from, newTo: v.to }),
    }),
    onSuccess: (r) => {
      const b = r.data.putBack ?? 0;
      done(r.data, b > 0 ? `Dates changed. Put back on ${dayCount(b)}.` : 'Dates changed.');
      setEdit(null);
    },
  });
  const remove = useMutation({
    mutationFn: (g: Group) => api<{ data: Data }>(`/api/steady-pickups/${steadyId}/open-windows`, {
      method: 'DELETE', body: JSON.stringify({ volunteerIds: g.vids, from: g.from, to: g.to }),
    }),
    onSuccess: (r) => {
      const b = r.data.putBack ?? 0;
      done(r.data, b > 0 ? `Removed. Put back on ${dayCount(b)} (days still open with no other driver).` : 'Removed.');
    },
  });
  const err = (add.error || change.error || remove.error) as Error | null;
  const busy = add.isPending || change.isPending || remove.isPending;
  const canAdd = !!from && (!to || to >= from) && (to || from) >= today && chosen.length > 0 && !busy;
  const inputCls = 'rounded-[8px] border border-line bg-paper px-2 py-1.5 text-[13px]';

  return (
    <div className="rounded-[10px] border border-line bg-cream/30 px-3 py-2 space-y-2" data-testid="steady-open-box">
      <p className="text-[12px] text-muted">
        For these days the usual driver is off this pickup only, and it goes out to other drivers like any open pickup.
        He still gets his texts. His other steady pickups stay as they are.
      </p>
      {q.isLoading && <p className="text-[12px] text-muted">Loading…</p>}
      {q.data && drivers.length === 0 && <p className="text-[12px] text-muted italic">This steady pickup has no usual driver.</p>}
      {groups.length > 0 && (
        <ul className="space-y-1" data-testid="steady-open-list">
          {groups.map((g) => (
            <li key={g.key} className="rounded-[8px] border border-amber/50 bg-amber-soft/60 px-2 py-1.5 text-[12.5px]">
              {edit?.key === g.key ? (
                <div className="flex flex-wrap items-center gap-2">
                  <input type="date" value={edit.from} onChange={(e) => setEdit({ ...edit, from: e.target.value })} className={inputCls} aria-label="From" />
                  <span>→</span>
                  <input type="date" value={edit.to} min={edit.from} onChange={(e) => setEdit({ ...edit, to: e.target.value })} className={inputCls} aria-label="To" />
                  <button type="button" disabled={busy || !edit.from || !edit.to || edit.to < edit.from}
                          onClick={() => change.mutate({ g, from: edit.from, to: edit.to })}
                          className="haptic rounded-[8px] bg-forest px-2.5 py-1 text-[12px] font-bold text-paper disabled:opacity-40">Save dates</button>
                  <button type="button" onClick={() => setEdit(null)} className="text-[12px] font-bold text-muted underline">Cancel</button>
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <b>{daysLabel(g.from, g.to)}</b>
                    <span> · {g.names.join(', ')} off · open for others</span>
                    {g.by && <span className="text-muted"> · set by {g.by}</span>}
                    {g.note && <div className="text-[11.5px] text-muted">📝 {g.note}</div>}
                  </div>
                  <button type="button" onClick={() => setEdit({ key: g.key, from: g.from < today ? today : g.from, to: g.to })}
                          className="shrink-0 text-[11.5px] font-bold text-forest underline">Change dates</button>
                  <button type="button" title="Remove — put him back on those days" disabled={busy}
                          onClick={() => { void uiConfirm(`Remove ${daysLabel(g.from, g.to)}? ${g.names.join(', ')} will be put back on the days that are still open with no other driver.`).then((ok) => { if (ok) remove.mutate(g); }); }}
                          className="haptic grid h-7 w-7 shrink-0 place-items-center rounded-full bg-clay-soft text-clay hover:bg-clay/20">
                    <X size={13} />
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {drivers.length > 0 && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-end gap-2">
            <label className="block">
              <span className="text-[11.5px] font-bold text-muted">From</span>
              <input type="date" value={from} min={today} onChange={(e) => { setFrom(e.target.value); if (to && to < e.target.value) setTo(''); }}
                     className={cx(inputCls, 'mt-0.5 block')} />
            </label>
            <label className="block">
              <span className="text-[11.5px] font-bold text-muted">To</span>
              <input type="date" value={to} min={from || today} onChange={(e) => setTo(e.target.value)}
                     className={cx(inputCls, 'mt-0.5 block')} />
            </label>
            <label className="block flex-1 min-w-[140px]">
              <span className="text-[11.5px] font-bold text-muted">Note (optional)</span>
              <input type="text" value={note} maxLength={200} placeholder="e.g. away for a wedding" onChange={(e) => setNote(e.target.value)}
                     className={cx(inputCls, 'mt-0.5 block w-full')} />
            </label>
          </div>
          {drivers.length > 1 && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px]" data-testid="steady-open-drivers">
              <span className="text-[11.5px] font-bold text-muted">Which driver is off:</span>
              {drivers.map((d) => (
                <label key={d.id} className="inline-flex items-center gap-1.5">
                  <input type="checkbox" className="accent-forest h-4 w-4" checked={chosen.includes(d.id)}
                         onChange={(e) => setPicked(e.target.checked ? [...chosen, d.id] : chosen.filter((x) => x !== d.id))} />
                  <span>{d.name}{d.days ? <span className="text-muted"> ({d.days.map((n) => DOW[n]).join(', ')})</span> : null}</span>
                </label>
              ))}
            </div>
          )}
          <button type="button" disabled={!canAdd} onClick={() => add.mutate()}
                  className="haptic rounded-[10px] bg-forest px-3 py-1.5 text-[12.5px] font-bold text-paper disabled:opacity-40">
            {add.isPending ? 'Saving…' : 'Open for other drivers'}
          </button>
        </div>
      )}
      {msg && !err && <p className="text-[12px] font-semibold text-forest">✓ {msg}</p>}
      {err && <p className="text-[12px] text-clay">{err.message}</p>}
      <p className="text-[11px] text-muted italic">Works right away — no need to press Save. ✕ puts him back on the days still open with no other driver.</p>
    </div>
  );
}

// ---- the note on pickup cards / the pickup page ----
type AllWin = { steadyId: number; from: string; to: string };

/** Every window still ahead (one small list, shared by all cards). */
export function useSteadyOpenAll(enabled = true) {
  const q = useQuery({
    queryKey: ['steady-open-all'],
    queryFn: () => api<{ data: AllWin[] }>('/api/steady-pickups/open-windows'),
    staleTime: 60_000, retry: false, enabled,
  });
  return q.data?.data ?? [];
}

export function steadyOpenOn(list: AllWin[], steadyId: number | null | undefined, date: string | null | undefined): boolean {
  if (steadyId == null || !date) return false;
  const d = String(date).slice(0, 10);
  return list.some((w) => w.steadyId === Number(steadyId) && w.from <= d && d <= w.to);
}

export function SteadyOpenNote({ steadyId, date, big }: { steadyId: number | null | undefined; date: string | null | undefined; big?: boolean }) {
  const list = useSteadyOpenAll(steadyId != null);
  if (!steadyOpenOn(list, steadyId, date)) return null;
  return (
    <span data-testid="steady-open-note" title="Set on the steady pickup: the usual driver is off these days, so it is open for other drivers."
          className={cx('inline-flex items-center rounded-full border border-amber/60 bg-amber-soft font-bold text-[#9a7415]',
            big ? 'px-2.5 py-0.5 text-[11.5px]' : 'px-2 py-0.5 text-[11px]')}>
      🚗 Usual driver off — open for others
    </span>
  );
}
