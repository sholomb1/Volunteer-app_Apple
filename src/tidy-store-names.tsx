/**
 * Oct 16 client: "Professional supplier names." Suppliers → "✨ Tidy store names" (admin/staff/coordinator).
 * Each store gets a suggested name: a careful clean-up (spacing, capitals, an address moved out of
 * the name) or the business name Google lists for the same place (address / phone match). The office
 * checks each row, can edit the text, untick, or tick "Keep as is" (not suggested again). Save renames
 * only the ticked rows — nothing else on the store changes (an empty address is filled when the
 * address was taken out of the name). Served by POST /api/geocode/office/tidy-names(/save).
 */
import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { api } from './api';
import { displayPhone, shortAddress } from './display'; // Oct 23 client

type Row = {
  id: number; name: string; status: string | null; address: string | null; phone: string | null;
  suggested: string; source: 'google' | 'cleanup'; confident: boolean; why: string; movedAddress: string | null;
  google: { name: string; address: string; phone: string | null } | null;
};
type Review = { rows: Row[]; junk: { id: number; name: string; address: string | null }[]; alreadyTidy: number; kept: number;
  googleCalls: number; failed: number; ms: number; google: boolean };
type Choice = { text: string; tick: boolean; keep: boolean };

export function TidyNamesModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [data, setData] = useState<Review | null>(null);
  const [pick, setPick] = useState<Record<number, Choice>>({});
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [showJunk, setShowJunk] = useState(false);

  useEffect(() => {
    let live = true;
    api<{ data: Review }>('/api/geocode/office/tidy-names', { method: 'POST', body: '{}' })
      .then((d) => {
        if (!live) return;
        setData(d.data);
        setPick(Object.fromEntries(d.data.rows.map((r) => [r.id, { text: r.suggested, tick: r.confident, keep: false }])));
        if (d.data.failed) setErr(`${d.data.failed} Google lookups failed — those rows show the clean-up only. Try again later.`);
      })
      .catch((e) => { if (live) setErr(e?.message ?? 'Lookup failed'); });
    return () => { live = false; };
  }, []);

  const set = (id: number, c: Partial<Choice>) => setPick((p) => ({ ...p, [id]: { ...p[id]!, ...c } }));
  const renames = useMemo(() => (data?.rows ?? []).filter((r) => {
    const c = pick[r.id];
    return c && c.tick && !c.keep && c.text.trim() && c.text.trim() !== r.name;
  }), [data, pick]);
  const keeps = useMemo(() => (data?.rows ?? []).filter((r) => pick[r.id]?.keep), [data, pick]);

  async function save() {
    setBusy(true); setErr(null);
    try {
      const d = await api<{ data: { renamed: number; kept: number; skipped: { id: number; why: string }[] } }>('/api/geocode/office/tidy-names/save', {
        method: 'POST',
        body: JSON.stringify({
          rename: renames.map((r) => ({ id: r.id, from: r.name, to: pick[r.id]!.text.trim(), fillAddress: !!r.movedAddress })),
          keep: keeps.map((r) => ({ id: r.id, name: r.name })),
        }),
      });
      const s = d.data;
      setDone(`Renamed ${s.renamed} ${s.renamed === 1 ? 'store' : 'stores'}${s.kept ? ` · ${s.kept} kept as is` : ''}${s.skipped.length ? ` · ${s.skipped.length} skipped (${s.skipped[0]!.why})` : ''}.`);
      onSaved();
    } catch (e: any) { setErr(e?.message ?? 'Save failed'); }
    finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-[2000] bg-ink/50 flex items-start justify-center pt-10 px-4">
      <div data-tidy-names className="relative z-[2001] bg-paper rounded-[18px] shadow-lift border border-line w-full max-w-5xl max-h-[85vh] overflow-y-auto">
        <div className="sticky top-0 z-10 bg-paper border-b border-line px-5 py-3 flex items-center justify-between gap-3">
          <div className="font-display font-semibold text-[18px]">✨ Tidy store names</div>
          <button onClick={onClose} className="haptic grid h-8 w-8 place-items-center rounded-full hover:bg-cream"><X size={17} /></button>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-[12.5px] text-muted">
            A full, professional name for each store: the name Google lists for the same place (address or phone match), or a clean-up
            (spacing, capitals, an address taken out of the name). Ticked = we're confident. You can change any name. Saving renames only
            the ticked stores — pickups, texts and history stay linked. "Keep as is" = don't suggest this one again.
          </p>
          {!data && !err && <div className="text-[13px] text-muted">Looking up stores… (usually under 15 seconds)</div>}
          {err && <div className="text-[12.5px] text-clay font-bold">{err}</div>}
          {done && <div className="text-[13px] text-forest font-bold">{done}</div>}
          {data && (
            <>
              <div className="text-[12px]">
                <b>{data.rows.length}</b> suggestions · <b>{renames.length}</b> to rename · {data.alreadyTidy} already tidy
                {data.kept ? ` · ${data.kept} kept as is earlier` : ''} · {data.googleCalls ? `${data.googleCalls} Google lookups, ` : ''}{(data.ms / 1000).toFixed(1)} s
                {!data.google && ' · Google lookup is off (clean-up only)'}
              </div>
              <div className="border border-line rounded-[12px] divide-y divide-line/70">
                {data.rows.map((r) => {
                  const c = pick[r.id] ?? { text: r.suggested, tick: false, keep: false };
                  return (
                    <div key={r.id} data-tidy-row={r.id} className={`grid sm:grid-cols-[1fr_1.3fr_auto] gap-x-4 gap-y-1 px-3 py-2 text-[12.5px] ${c.keep ? 'opacity-60' : ''}`}>
                      <div className="min-w-0">
                        <div className="font-bold text-ink break-words">{r.name}</div>
                        <div className="text-muted truncate">{shortAddress(r.address) || 'No address'}{r.phone ? ` · ${displayPhone(r.phone)}` : ''}</div>
                      </div>
                      <div className="min-w-0">
                        <input value={c.text} disabled={!!done || c.keep} maxLength={120}
                               onChange={(e) => set(r.id, { text: e.target.value, tick: e.target.value.trim() !== r.name })}
                               className="w-full rounded-[8px] border border-line bg-paper px-2 py-1 text-[13px] font-semibold outline-none focus:border-forest" />
                        <div className="mt-0.5">
                          <span className={`inline-block rounded-full px-1.5 text-[10.5px] font-bold mr-1 ${r.source === 'google' ? 'bg-forest/10 text-forest' : 'bg-cream text-ink'}`}>
                            {r.source === 'google' ? 'Google listing' : 'Clean-up'}
                          </span>
                          {r.google && <span className="text-muted">{r.google.name} · {shortAddress(r.google.address)}{r.google.phone ? ` · ${displayPhone(r.google.phone)}` : ''}</span>}
                        </div>
                        <div className={r.confident ? 'text-forest' : 'text-[#9a7415]'}>
                          {r.why}{r.movedAddress ? ` · address box gets "${r.movedAddress}"` : ''}
                        </div>
                      </div>
                      <div className="flex sm:flex-col gap-3 sm:gap-1 text-[12px] whitespace-nowrap">
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input type="checkbox" disabled={!!done || c.keep} checked={c.tick && !c.keep} onChange={(e) => set(r.id, { tick: e.target.checked })} /> Rename
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer text-muted">
                          <input type="checkbox" disabled={!!done} checked={c.keep} onChange={(e) => set(r.id, { keep: e.target.checked })} /> Keep as is
                        </label>
                      </div>
                    </div>
                  );
                })}
                {!data.rows.length && <div className="px-3 py-3 text-[12.5px] text-muted">All store names look tidy.</div>}
              </div>
              {data.junk.length > 0 && (
                <div className="rounded-[12px] border border-line bg-cream/40 px-3 py-2 text-[12.5px]">
                  <button onClick={() => setShowJunk((x) => !x)} className="font-bold text-ink">
                    {showJunk ? '▾' : '▸'} Looks like a test or junk name ({data.junk.length})
                  </button>
                  {showJunk && (
                    <>
                      <div className="text-muted mt-1">Not renamed. Fix or remove these by hand if they are not real stores.</div>
                      <ul className="mt-1 space-y-0.5">
                        {data.junk.map((j) => <li key={j.id}><b>{j.name}</b>{j.address ? <span className="text-muted"> · {j.address}</span> : null}</li>)}
                      </ul>
                    </>
                  )}
                </div>
              )}
              <div className="flex justify-end gap-2">
                <button onClick={onClose} className="haptic rounded-[10px] border border-line px-3 py-2 text-[12.5px] font-bold">Close</button>
                <button onClick={() => void save()} disabled={busy || (!renames.length && !keeps.length) || !!done}
                        className="haptic rounded-[10px] bg-forest px-3 py-2 text-[12.5px] font-bold text-paper disabled:opacity-50">
                  {busy ? 'Saving…' : `Save (${renames.length} rename${renames.length === 1 ? '' : 's'}${keeps.length ? `, ${keeps.length} keep as is` : ''})`}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
