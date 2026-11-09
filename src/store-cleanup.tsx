/**
 * Nov 8 client: Suppliers → 🧹 Clean up stores (admins). Server: routes/store-cleanup.ts.
 * Groups: looks like junk · same place twice · never used · not used in 3+ months · every store.
 * Hide = gone from every list (history kept). Merge = everything moves to the right name; the other is hidden.
 */
import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, getUser } from './api';

type S = { id: number; name: string; lastUsed: string | null; pickups: number; dropoffs: number; steady: boolean; reason?: string };
type Data = { total: number; junk: S[]; doubles: { a: S; b: S }[]; neverUsed: S[]; notLately: S[]; all: S[] };

const when = (d: string | null) => (d ? new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'never');
const pl = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
const used = (s: S) => `${pl(s.pickups, 'pickup')} · ${pl(s.dropoffs, 'drop-off')} · last used ${when(s.lastUsed)}${s.steady ? ' · steady pickup' : ''}`;

export function StoreCleanupButton({ onChanged }: { onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const role = String(getUser()?.role ?? '');
  if (!['admin', 'staff', 'coordinator'].includes(role)) return null;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
              className="mb-3 rounded-full border border-forest/40 bg-paper px-4 py-2 text-[13px] font-bold text-forest hover:bg-sage">
        🧹 Clean up stores
      </button>
      {open && createPortal(<StoreCleanup onClose={() => { setOpen(false); onChanged(); }} />, document.body)}
    </>
  );
}

function StoreCleanup({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['store-cleanup'], queryFn: () => api<{ data: Data }>('/api/admin/store-cleanup') });
  const d = q.data?.data;
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mergeFrom, setMergeFrom] = useState<S | null>(null);
  const [search, setSearch] = useState('');
  const toggle = (id: number) => setPicked((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const reload = () => qc.invalidateQueries({ queryKey: ['store-cleanup'] });

  async function hide(ids: number[]) {
    if (!ids.length || busy) return;
    if (!window.confirm(`Hide ${ids.length} store${ids.length > 1 ? 's' : ''}? They leave every list (kiosk, forms, office). Their history stays.`)) return;
    setBusy(true); setMsg(null);
    try {
      const r = await api<{ data: { hidden: number; skipped: string[] } }>('/api/admin/store-cleanup/hide', { method: 'POST', body: JSON.stringify({ ids }) });
      setMsg(`Hidden: ${r.data.hidden}.${r.data.skipped.length ? ` Not hidden (they have a steady pickup — change the steady first): ${r.data.skipped.join(', ')}.` : ''}`);
      setPicked(new Set()); reload();
    } catch (e: any) { setMsg(e?.message || 'Something went wrong.'); } finally { setBusy(false); }
  }
  async function merge(from: S, into: S) {
    if (busy) return;
    if (!window.confirm(`Move everything from "${from.name}" into "${into.name}"?\n\nAll pickups, drop-offs and steady pickups move to "${into.name}", and "${from.name}" is hidden.`)) return;
    setBusy(true); setMsg(null);
    try {
      const r = await api<{ data: { moved: Record<string, number> } }>('/api/admin/store-cleanup/merge', { method: 'POST', body: JSON.stringify({ fromId: from.id, intoId: into.id }) });
      const m = r.data.moved;
      setMsg(`Merged into "${into.name}": ${m.pickups ?? 0} pickups, ${m.dropoffs ?? 0} drop-off lines, ${m.steady ?? 0} steady pickups moved.`);
      setMergeFrom(null); reload();
    } catch (e: any) { setMsg(e?.message || 'Something went wrong.'); } finally { setBusy(false); }
  }

  const row = (s: S, extra?: React.ReactNode) => (
    <div key={s.id} className="flex items-center gap-3 border-b border-line py-2">
      <input type="checkbox" checked={picked.has(s.id)} onChange={() => toggle(s.id)} className="accent-forest h-4 w-4 flex-none" disabled={s.steady} title={s.steady ? 'Has a steady pickup' : ''} />
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-bold text-ink truncate">{s.name || '(no name)'}{s.reason && <span className="ml-2 rounded-full bg-clay/10 px-2 py-0.5 text-[11px] font-bold text-clay">{s.reason}</span>}</div>
        <div className="text-[12px] text-muted">{used(s)}</div>
      </div>
      {extra}
      <button type="button" onClick={() => setMergeFrom(s)} className="text-[12px] font-bold text-forest underline underline-offset-2 flex-none">Merge into…</button>
    </div>
  );
  const section = (title: string, hint: string, list: S[]) => (
    <section className="mt-5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[16px] font-extrabold text-ink">{title} <span className="text-muted font-bold">({list.length})</span></h3>
        {list.length > 0 && <button type="button" onClick={() => setPicked((p) => { const n = new Set(p); list.filter((s) => !s.steady).forEach((s) => n.add(s.id)); return n; })} className="text-[12px] font-bold text-forest underline underline-offset-2">Tick all</button>}
      </div>
      <p className="text-[12px] text-muted">{hint}</p>
      {list.length === 0 ? <p className="text-[13px] text-muted mt-2">Nothing here. 👍</p> : list.map((s) => row(s))}
    </section>
  );
  const others = useMemo(() => (d?.all ?? []).filter((s) => !search.trim() || s.name.toLowerCase().includes(search.trim().toLowerCase())), [d, search]);

  return (
    <div className="fixed inset-0 z-[80] bg-ink/40 flex items-start justify-center overflow-y-auto p-3 sm:p-8" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-[16px] bg-paper p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[20px] font-extrabold text-ink">🧹 Clean up stores</h2>
          <button type="button" onClick={onClose} className="text-[14px] font-bold text-muted">Close ✕</button>
        </div>
        <p className="text-[13px] text-muted mt-1">Tick stores and press <b>Hide</b> to take them off every list (their history stays). Use <b>Merge into…</b> when the same place is in the list twice. Names typed at the kiosk now wait for your OK under Suppliers before anyone sees them.</p>
        {q.isLoading && <p className="mt-4 text-[14px] text-muted">Loading…</p>}
        {q.isError && <p className="mt-4 text-[14px] text-clay">Couldn’t load the stores. Try again.</p>}
        {msg && <p className="mt-3 rounded-[10px] bg-sage px-3 py-2 text-[13px] font-bold text-forest">{msg}</p>}
        {d && (
          <>
            <p className="mt-3 text-[13px] text-ink"><b>{d.total}</b> stores on the list now.</p>
            {section('Looks like junk', 'Just numbers, an address, a test, or too vague.', d.junk)}
            <section className="mt-5">
              <h3 className="text-[16px] font-extrabold text-ink">Same place twice? <span className="text-muted font-bold">({d.doubles.length})</span></h3>
              <p className="text-[12px] text-muted">Pick which name is right. Everything moves to it and the other one is hidden. Not the same place? Just leave it.</p>
              {d.doubles.length === 0 ? <p className="text-[13px] text-muted mt-2">Nothing here. 👍</p> : d.doubles.map(({ a, b }) => (
                <div key={`${a.id}-${b.id}`} className="border-b border-line py-2">
                  <div className="text-[13px] text-ink"><b>{a.name}</b> <span className="text-muted">({used(a)})</span></div>
                  <div className="text-[13px] text-ink"><b>{b.name}</b> <span className="text-muted">({used(b)})</span></div>
                  <div className="mt-1 flex flex-wrap gap-2">
                    <button type="button" disabled={busy} onClick={() => merge(b, a)} className="rounded-full bg-forest px-3 py-1 text-[12px] font-bold text-paper">Keep “{a.name}”</button>
                    <button type="button" disabled={busy} onClick={() => merge(a, b)} className="rounded-full bg-forest px-3 py-1 text-[12px] font-bold text-paper">Keep “{b.name}”</button>
                  </div>
                </div>
              ))}
            </section>
            {section('Never used', 'No pickup and no drop-off since our records start (May 2026).', d.neverUsed)}
            {section('Not used in 3+ months', 'Last pickup or drop-off more than 3 months ago.', d.notLately)}
            <section className="mt-5">
              <h3 className="text-[16px] font-extrabold text-ink">Every store <span className="text-muted font-bold">({d.all.length})</span></h3>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find a store…" className="mt-2 w-full rounded-[10px] border border-line px-3 py-2 text-[14px]" />
              <div className="max-h-[360px] overflow-y-auto mt-1">{others.map((s) => row(s))}</div>
            </section>
          </>
        )}
        <div className="sticky bottom-0 mt-5 flex items-center justify-between gap-3 bg-paper pt-3 border-t border-line">
          <span className="text-[13px] text-muted">{picked.size} ticked</span>
          <button type="button" disabled={!picked.size || busy} onClick={() => hide([...picked])}
                  className="rounded-full bg-clay px-5 py-2 text-[14px] font-bold text-paper disabled:opacity-40">Hide {picked.size || ''} store{picked.size === 1 ? '' : 's'}</button>
        </div>
      </div>
      {mergeFrom && d && (
        <div className="fixed inset-0 z-[90] bg-ink/40 flex items-center justify-center p-4" onClick={(e) => { e.stopPropagation(); setMergeFrom(null); }}>
          <div className="w-full max-w-md rounded-[14px] bg-paper p-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-[16px] font-extrabold text-ink">Merge “{mergeFrom.name}” into…</h3>
            <p className="text-[12px] text-muted">Pick the right name. Everything moves there and “{mergeFrom.name}” is hidden.</p>
            <MergePicker all={d.all.filter((s) => s.id !== mergeFrom.id)} onPick={(into) => merge(mergeFrom, into)} />
            <button type="button" onClick={() => setMergeFrom(null)} className="mt-3 text-[13px] font-bold text-muted">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

function MergePicker({ all, onPick }: { all: S[]; onPick: (s: S) => void }) {
  const [q, setQ] = useState('');
  const list = all.filter((s) => !q.trim() || s.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 60);
  return (
    <>
      <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus placeholder="Type the right store name…" className="mt-2 w-full rounded-[10px] border border-line px-3 py-2 text-[14px]" />
      <div className="max-h-[300px] overflow-y-auto mt-1">
        {list.map((s) => (
          <button type="button" key={s.id} onClick={() => onPick(s)} className="block w-full text-left px-2 py-2 rounded-[8px] hover:bg-sage text-[14px] text-ink">
            {s.name} <span className="text-[12px] text-muted">· {s.pickups} pickups</span>
          </button>
        ))}
      </div>
    </>
  );
}
