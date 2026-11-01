/**
 * Oct 16 client (idea 5): Suppliers → "😴 Sleeping stores". Stores that gave
 * before (2+ finished or store-posted pickups in the last 6 months) but not in
 * the last 30 / 60 / 90 days, plus stores whose steady pickup is paused — so
 * someone can call them. Longest asleep and most pickups first.
 * "📞 Called" logs the call in the store's CRM history (No answer / Will donate
 * again / Closed / Not now + a note) and shows "Called Oct 16 — No answer (Moshe)".
 * "Hide for 30 days" takes a store off the list for a month.
 * API: routes/sleeping-stores.ts (GET /api/sleeping-stores, POST …/:id/call, POST/DELETE …/:id/hide).
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { api, canWrite, getUser } from './api';
import { displayPhone } from './display'; // Oct 23 client: same style everywhere

type LastCall = { id: number; at: string; byName: string | null; outcome: string; note: string | null };
type Row = {
  id: number; name: string; contactName: string | null; contactPhone: string | null;
  lastDate: string | null; daysAsleep: number | null; pickups6m: number; usualDays: string;
  steadyPaused: boolean; hiddenUntil: string | null; lastCall: LastCall | null;
};
type Reply = { days: number; hiddenCount: number; data: Row[] };
const OUTCOMES: Array<[string, string]> = [['no_answer', 'No answer'], ['will_donate', 'Will donate again'], ['closed', 'Closed'], ['not_now', 'Not now']];

const shortDate = (d: string | Date) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' });
const ymdShort = (ymd: string) => new Date(`${ymd}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const daysAgo = (n: number | null) => (n == null ? 'no pickups yet' : n <= 0 ? 'today' : n === 1 ? '1 day ago' : `${n} days ago`);
const telOf = (p: string) => p.replace(/[^\d+]/g, '');

export function SleepingStoresModal({ onClose }: { onClose: () => void }) {
  const [days, setDays] = useState(30);
  const [showHidden, setShowHidden] = useState(false);
  const q = useQuery({
    queryKey: ['sleeping-stores', days, showHidden],
    queryFn: () => api<Reply>(`/api/sleeping-stores?days=${days}${showHidden ? '&hidden=1' : ''}`),
    staleTime: 60_000,
  });
  const rows = q.data?.data ?? [];
  return (
    <div className="fixed inset-0 z-[2000] bg-ink/50 flex items-start justify-center pt-10 px-4" onClick={onClose}>
      <div data-sleeping-stores onClick={(e) => e.stopPropagation()}
           className="relative z-[2001] bg-paper rounded-[18px] shadow-lift border border-line w-full max-w-5xl max-h-[85vh] overflow-y-auto">
        <div className="sticky top-0 z-10 bg-paper border-b border-line px-5 py-3 flex items-center justify-between gap-3">
          <div className="font-display font-semibold text-[18px]">😴 Sleeping stores</div>
          <button onClick={onClose} className="haptic grid h-8 w-8 place-items-center rounded-full hover:bg-cream"><X size={17} /></button>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-[12.5px] text-muted">
            Stores that gave before (2 or more pickups in the last 6 months) but no pickup lately, and stores whose steady pickup is paused.
            Give them a call. Longest asleep first.
          </p>
          <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
            <span className="font-bold text-ink">No pickup for more than</span>
            {[30, 60, 90].map((d) => (
              <button key={d} type="button" onClick={() => setDays(d)} data-days={d}
                      className={`haptic rounded-full border px-3 py-1 font-bold ${days === d ? 'border-forest bg-forest text-paper' : 'border-line bg-paper text-ink hover:border-forest'}`}>{d} days</button>
            ))}
            {!!q.data?.hiddenCount && (
              <button type="button" onClick={() => setShowHidden((x) => !x)} className="haptic ml-auto font-bold text-muted hover:underline">
                {showHidden ? 'Hide the hidden ones' : `Show hidden (${q.data.hiddenCount})`}
              </button>
            )}
          </div>
          {q.isLoading && <div className="text-[13px] text-muted">Loading…</div>}
          {q.isError && <div className="text-[12.5px] font-bold text-clay">{(q.error as Error).message}</div>}
          {q.data && (
            <div className="border border-line rounded-[12px] divide-y divide-line/70">
              <div className="hidden md:grid grid-cols-[1.5fr_1fr_.6fr_.8fr_1.3fr] gap-3 px-3 py-2 text-[11px] font-extrabold uppercase tracking-[.05em] text-muted">
                <div>Store</div><div>Last pickup</div><div>6 months</div><div>Usual days</div><div>Contact</div>
              </div>
              {rows.map((r) => <SleepRow key={r.id} r={r} />)}
              {!rows.length && <div className="px-3 py-3 text-[12.5px] text-muted">No sleeping stores right now. 🎉</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SleepRow({ r }: { r: Row }) {
  const qc = useQueryClient();
  const edit = canWrite(getUser()?.role);
  const [logging, setLogging] = useState(false);
  const [outcome, setOutcome] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const done = () => qc.invalidateQueries({ queryKey: ['sleeping-stores'] });
  const call = useMutation({
    mutationFn: () => api(`/api/sleeping-stores/${r.id}/call`, { method: 'POST', body: JSON.stringify({ outcome, note: note.trim() || null }) }),
    onSuccess: () => { setLogging(false); setOutcome(null); setNote(''); done(); qc.invalidateQueries({ queryKey: ['crm-history', 'supplier', r.id] }); },
  });
  const hide = useMutation({
    mutationFn: (on: boolean) => api(`/api/sleeping-stores/${r.id}/hide`, { method: on ? 'POST' : 'DELETE' }),
    onSuccess: done,
  });
  return (
    <div data-sleep-row={r.id} className={`px-3 py-2.5 text-[12.5px] ${r.hiddenUntil ? 'opacity-60' : ''}`}>
      <div className="grid md:grid-cols-[1.5fr_1fr_.6fr_.8fr_1.3fr] gap-x-3 gap-y-0.5 items-start">
        <div className="min-w-0">
          <div className="font-bold text-[13.5px] text-ink break-words">
            {r.name}
            {r.steadyPaused && <span className="ml-1.5 align-middle rounded-full bg-amber-soft px-1.5 py-0.5 text-[10.5px] font-bold text-[#9a7415]">steady paused</span>}
          </div>
          {r.lastCall && (
            <div data-last-call className="font-bold text-forest">
              Called {shortDate(r.lastCall.at)} — {r.lastCall.outcome}{r.lastCall.byName ? ` (${r.lastCall.byName})` : ''}
              {r.lastCall.note && <span className="font-normal text-muted"> · {r.lastCall.note}</span>}
            </div>
          )}
          {r.hiddenUntil && <div className="text-muted">Hidden until {ymdShort(r.hiddenUntil)}</div>}
        </div>
        <div><span className="font-bold text-ink">{daysAgo(r.daysAsleep)}</span>{r.lastDate && <span className="text-muted"> · {ymdShort(r.lastDate)}</span>}</div>
        <div><span className="md:hidden text-muted">Pickups in 6 months: </span><b>{r.pickups6m}</b></div>
        <div className="text-ink">{r.usualDays ? <><span className="md:hidden text-muted">Usually </span>{r.usualDays}</> : <span className="text-muted">—</span>}</div>
        <div className="min-w-0">
          {r.contactName && <div className="text-ink truncate"><bdi dir="auto">{r.contactName}</bdi></div>}
          {r.contactPhone
            ? <a href={`tel:${telOf(r.contactPhone)}`} className="font-bold text-forest hover:underline">{displayPhone(r.contactPhone)}</a>
            : <span className="text-muted">No phone on file</span>}
        </div>
      </div>
      {edit && (
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <button type="button" data-called-btn onClick={() => setLogging((x) => !x)}
                  className="haptic rounded-[9px] border border-forest/40 px-2.5 py-1 font-bold text-forest hover:bg-sage/60">📞 Called</button>
          {r.hiddenUntil
            ? <button type="button" disabled={hide.isPending} onClick={() => hide.mutate(false)} className="haptic rounded-[9px] border border-line px-2.5 py-1 font-bold text-muted hover:bg-cream">Show again</button>
            : <button type="button" data-hide-btn disabled={hide.isPending} onClick={() => hide.mutate(true)} className="haptic rounded-[9px] border border-line px-2.5 py-1 font-bold text-muted hover:bg-cream">Hide for 30 days</button>}
        </div>
      )}
      {logging && (
        <div data-call-form className="mt-2 space-y-2 rounded-[12px] border border-line bg-cream/40 px-3 py-2.5">
          <div className="font-bold text-ink">How did the call to {r.name} go?</div>
          <div className="flex flex-wrap gap-2">
            {OUTCOMES.map(([k, l]) => (
              <button key={k} type="button" onClick={() => setOutcome(k)}
                      className={`haptic min-h-[36px] rounded-[10px] border px-3 py-1.5 font-bold ${outcome === k ? 'border-forest bg-forest text-paper' : 'border-line bg-paper text-ink hover:bg-cream'}`}>{l}</button>
            ))}
          </div>
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Note (optional)"
                 className="w-full rounded-[10px] border border-line bg-paper px-3 py-2 text-[13px] outline-none focus:border-forest" />
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={!outcome || call.isPending} onClick={() => call.mutate()}
                    className="haptic rounded-[10px] bg-forest px-4 py-2 font-bold text-paper disabled:opacity-50">{call.isPending ? 'Saving…' : 'Save'}</button>
            <button type="button" onClick={() => setLogging(false)} className="haptic px-2 py-2 font-bold text-muted hover:underline">Cancel</button>
            {!outcome && <span className="text-[12px] text-muted">Pick what happened first.</span>}
            {call.isError && <span className="font-bold text-clay">{(call.error as Error).message}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
