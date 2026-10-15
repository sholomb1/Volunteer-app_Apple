/**
 * Oct 14 client: Admin -> Settings -> "Store post form". The office adds,
 * removes, renames and reorders the store form's food chips (emoji + name),
 * units (with the car-size numbers) and kosher choices, and turns the photo
 * and kosher rows on or off. Backend: GET/PUT /api/admin/store-post-form
 * (zlz.portal_settings 'store_post_form'; reset = built-in list).
 */
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { STORE_POST_FORM_DEFAULTS, type StorePostFormCfg } from './store-post-config';

const inp = 'rounded-[8px] border border-line-2 bg-paper px-2 py-1.5 text-[13px] outline-none focus:border-forest';
const small = 'rounded-[8px] border border-line bg-paper px-2 py-1 text-[12px] font-bold hover:border-forest disabled:opacity-40';

function move<T>(list: T[], i: number, d: number): T[] {
  const j = i + d;
  if (j < 0 || j >= list.length) return list;
  const n = [...list];
  [n[i], n[j]] = [n[j]!, n[i]!];
  return n;
}

function RowTools({ i, n, onMove, onRemove }: { i: number; n: number; onMove: (d: number) => void; onRemove: () => void }) {
  return (
    <div className="flex shrink-0 gap-1">
      <button type="button" className={small} disabled={i === 0} onClick={() => onMove(-1)} aria-label="Move up">↑</button>
      <button type="button" className={small} disabled={i === n - 1} onClick={() => onMove(1)} aria-label="Move down">↓</button>
      <button type="button" className={small + ' text-clay'} onClick={onRemove}>Remove</button>
    </div>
  );
}

export function StorePostFormCard() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['admin-store-post-form'],
    queryFn: () => api<{ data: StorePostFormCfg; isCustom: boolean }>('/api/admin/store-post-form'),
  });
  const [f, setF] = useState<StorePostFormCfg | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { if (q.data?.data && !f) setF(q.data.data); }, [q.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useMutation({
    mutationFn: (body: StorePostFormCfg | { reset: true }) => api<{ data: StorePostFormCfg; isCustom: boolean }>('/api/admin/store-post-form', { method: 'PUT', body: JSON.stringify(body) }),
    onSuccess: (r, body) => {
      setF(r.data); setMsg('reset' in body ? 'Back to the standard list.' : 'Saved. Stores see it next time they open the form.');
      qc.invalidateQueries({ queryKey: ['admin-store-post-form'] });
      qc.invalidateQueries({ queryKey: ['store-post-form'] });
    },
    onError: (e: any) => setMsg(e?.message || 'Could not save.'),
  });

  if (q.isLoading || !f) return <div className="text-[13px] text-muted">Loading…</div>;
  const set = (p: Partial<StorePostFormCfg>) => { setMsg(null); setF({ ...f, ...p }); };

  return (
    <div data-store-post-form-card className="rounded-[12px] border border-line bg-paper p-3 space-y-4">
      <div>
        <div className="font-display font-semibold text-[16px]">Store post form</div>
        <div className="text-[12px] text-muted">The choices stores tap on "Food ready". "Other" is always there. {q.data?.isCustom ? 'You changed this list.' : 'Standard list.'}</div>
      </div>

      <section>
        <div className="text-[11px] font-extrabold uppercase tracking-[.05em] text-muted mb-1">Food types</div>
        <div className="space-y-1.5">
          {f.foods.map((x, i) => (
            <div key={i} className="flex flex-wrap items-center gap-1.5">
              <input className={inp + ' w-[52px] text-center'} value={x.emoji} maxLength={8} aria-label="Emoji"
                     onChange={(e) => set({ foods: f.foods.map((y, k) => k === i ? { ...y, emoji: e.target.value } : y) })} />
              <input className={inp + ' min-w-0 flex-1'} value={x.label} maxLength={30} aria-label="Name"
                     onChange={(e) => set({ foods: f.foods.map((y, k) => k === i ? { ...y, label: e.target.value } : y) })} />
              <RowTools i={i} n={f.foods.length} onMove={(d) => set({ foods: move(f.foods, i, d) })} onRemove={() => set({ foods: f.foods.filter((_, k) => k !== i) })} />
            </div>
          ))}
        </div>
        <button type="button" className={small + ' mt-1.5'} onClick={() => set({ foods: [...f.foods, { emoji: '', label: '' }] })}>+ Add food type</button>
      </section>

      <section>
        <div className="text-[11px] font-extrabold uppercase tracking-[.05em] text-muted mb-1">Units</div>
        <div className="text-[12px] text-muted mb-1">Car size: up to the first number = "Fits in one car", up to the second = "Car trunk full", more = "Needs a van or 2 cars" (and 2 drivers).</div>
        <div className="space-y-1.5">
          {f.units.map((u, i) => (
            <div key={i} className="flex flex-wrap items-center gap-1.5">
              <input className={inp + ' min-w-0 flex-1'} value={u.label} maxLength={20} aria-label="Unit name"
                     onChange={(e) => set({ units: f.units.map((y, k) => k === i ? { ...y, label: e.target.value } : y) })} />
              <label className="text-[12px] text-muted">one car ≤ <input type="number" min={1} max={999} className={inp + ' w-[58px]'} value={u.oneCar}
                     onChange={(e) => set({ units: f.units.map((y, k) => k === i ? { ...y, oneCar: Math.max(1, Number(e.target.value) || 1) } : y) })} /></label>
              <label className="text-[12px] text-muted">trunk ≤ <input type="number" min={1} max={999} className={inp + ' w-[58px]'} value={u.trunk}
                     onChange={(e) => set({ units: f.units.map((y, k) => k === i ? { ...y, trunk: Math.max(1, Number(e.target.value) || 1) } : y) })} /></label>
              <RowTools i={i} n={f.units.length} onMove={(d) => set({ units: move(f.units, i, d) })} onRemove={() => set({ units: f.units.filter((_, k) => k !== i) })} />
            </div>
          ))}
        </div>
        <button type="button" className={small + ' mt-1.5'} onClick={() => set({ units: [...f.units, { label: '', oneCar: 6, trunk: 15 }] })}>+ Add unit</button>
      </section>

      <section>
        <div className="flex items-center justify-between">
          <div className="text-[11px] font-extrabold uppercase tracking-[.05em] text-muted">Kosher choices</div>
          <label className="flex items-center gap-1.5 text-[12px] font-bold"><input type="checkbox" checked={f.showKosher} onChange={(e) => set({ showKosher: e.target.checked })} /> Show on the form</label>
        </div>
        <div className="mt-1 space-y-1.5">
          {f.kosher.map((k, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <input className={inp + ' min-w-0 flex-1'} value={k} maxLength={20} aria-label="Kosher choice"
                     onChange={(e) => set({ kosher: f.kosher.map((y, j) => j === i ? e.target.value : y) })} />
              <RowTools i={i} n={f.kosher.length} onMove={(d) => set({ kosher: move(f.kosher, i, d) })} onRemove={() => set({ kosher: f.kosher.filter((_, j) => j !== i) })} />
            </div>
          ))}
        </div>
        {f.kosher.length < 6 && <button type="button" className={small + ' mt-1.5'} onClick={() => set({ kosher: [...f.kosher, ''] })}>+ Add kosher choice</button>}
      </section>

      <label className="flex items-center gap-1.5 text-[13px] font-bold"><input type="checkbox" checked={f.showPhoto} onChange={(e) => set({ showPhoto: e.target.checked })} /> Show "Add a photo"</label>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={save.isPending}
                onClick={() => {
                  const clean: StorePostFormCfg = {
                    ...f,
                    foods: f.foods.map((x) => ({ emoji: x.emoji.trim(), label: x.label.trim() })).filter((x) => x.label),
                    units: f.units.map((u) => ({ ...u, label: u.label.trim() })).filter((u) => u.label),
                    kosher: f.kosher.map((k) => k.trim()).filter(Boolean),
                  };
                  if (clean.units.length === 0) { setMsg('Keep at least one unit.'); return; }
                  save.mutate(clean);
                }}
                className="rounded-[10px] bg-forest px-3 py-2 text-[13px] font-bold text-paper disabled:opacity-50">Save</button>
        <button type="button" disabled={save.isPending}
                onClick={() => { if (window.confirm('Go back to the standard list?')) save.mutate({ reset: true }); }}
                className="rounded-[10px] border border-line px-3 py-2 text-[13px] font-bold">Reset to standard</button>
        <button type="button" onClick={() => { setMsg(null); setF(q.data?.data ?? STORE_POST_FORM_DEFAULTS); }} className="text-[13px] font-bold text-forest underline">Undo my edits</button>
        {msg && <span className="text-[13px] font-bold text-forest">{msg}</span>}
      </div>
    </div>
  );
}
