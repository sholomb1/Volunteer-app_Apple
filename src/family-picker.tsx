/**
 * Oct 8 client: Deliveries — pick the family a delivery goes to (from 3 Regina),
 * or add a new one. Families are saved (zlz.recipients via /api/recipients) so
 * next time the office just types the name.
 */
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { cx } from './design';

export type Family = { id: number; name: string; addressLine1: string | null; city: string | null; contactPhone: string | null; notes: string | null };

const input = 'w-full rounded-[10px] border-[1.4px] border-line-2 bg-paper px-3 py-2.5 text-[13.5px] focus:border-forest focus:ring-2 focus:ring-forest/15 outline-none';
const addr = (f: Family) => [f.addressLine1, f.city].filter(Boolean).join(', ');

export function FamilyPicker({ value, onChange }: { value: number | ''; onChange: (id: number | '') => void }) {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [nf, setNf] = useState({ name: '', address: '', phone: '', notes: '' });
  const [err, setErr] = useState<string | null>(null);
  const list = useQuery({
    queryKey: ['families', q.trim()],
    queryFn: () => api<{ data: Family[] }>(`/api/recipients${q.trim() ? `?search=${encodeURIComponent(q.trim())}` : ''}`),
    placeholderData: (prev) => prev,
  });
  const all = list.data?.data ?? [];
  // The chosen family may not be in the current search results — fetch the full list once to show it.
  const allQ = useQuery({ queryKey: ['families', ''], queryFn: () => api<{ data: Family[] }>('/api/recipients'), enabled: value !== '' });
  const chosen = typeof value === 'number' ? (all.find((f) => f.id === value) ?? (allQ.data?.data ?? []).find((f) => f.id === value)) : undefined;

  const create = useMutation({
    mutationFn: () => api<{ data: { id: number } }>('/api/recipients', {
      method: 'POST',
      body: JSON.stringify({ name: nf.name.trim(), addressLine1: nf.address.trim(), contactPhone: nf.phone.trim() || null, notes: nf.notes.trim() || null }),
    }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['families'] });
      onChange(Number(r.data.id));
      setAdding(false); setNf({ name: '', address: '', phone: '', notes: '' }); setErr(null);
    },
    onError: (e: any) => setErr(e?.message ?? 'Could not save the family'),
  });
  useEffect(() => { if (value === '') setAdding(false); }, [value]);

  if (chosen && !adding) {
    return (
      <div className="flex items-start justify-between gap-3 rounded-[12px] border border-forest/40 bg-sage/40 px-3 py-2.5">
        <div className="min-w-0 text-[13.5px]">
          <div className="font-bold text-ink">{chosen.name}</div>
          <div className="text-muted">{addr(chosen) || 'No address'}{chosen.contactPhone ? ` · ${chosen.contactPhone}` : ''}</div>
          {chosen.notes && <div className="text-[12px] text-muted italic mt-0.5">{chosen.notes}</div>}
        </div>
        <button type="button" onClick={() => onChange('')} className="haptic text-[12.5px] font-bold text-forest underline shrink-0">Change</button>
      </div>
    );
  }

  if (adding) {
    const ok = nf.name.trim().length > 0 && nf.address.trim().length > 2;
    return (
      <div className="rounded-[12px] border border-line bg-cream/60 p-3 space-y-2">
        <div className="text-[12.5px] font-extrabold text-ink">New family — where should it be delivered?</div>
        <input className={input} placeholder="Family name (e.g. Cohen family)" value={nf.name} onChange={(e) => setNf({ ...nf, name: e.target.value })} />
        <input className={input} placeholder="Delivery address (e.g. 10 Homestead Dr, Monsey)" value={nf.address} onChange={(e) => setNf({ ...nf, address: e.target.value })} />
        <input className={input} placeholder="Phone (optional)" value={nf.phone} onChange={(e) => setNf({ ...nf, phone: e.target.value })} />
        <input className={input} placeholder="Notes for the driver (optional, e.g. ring the side door)" value={nf.notes} onChange={(e) => setNf({ ...nf, notes: e.target.value })} />
        {err && <div className="text-clay text-[12.5px] font-bold">{err}</div>}
        <div className="flex gap-2">
          <button type="button" disabled={!ok || create.isPending} onClick={() => create.mutate()}
                  className="haptic rounded-[10px] bg-forest text-paper px-3 py-2 text-[13px] font-bold disabled:opacity-50">
            {create.isPending ? 'Saving…' : 'Save family'}
          </button>
          <button type="button" onClick={() => setAdding(false)} className="haptic rounded-[10px] border border-line px-3 py-2 text-[13px] font-bold">Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <input className={input} placeholder="Type a family name, address or phone…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="max-h-[180px] overflow-y-auto rounded-[12px] border border-line divide-y divide-line bg-paper">
        {all.length === 0 && (list.isLoading
          ? <div className="px-3 py-2.5 text-[13px] text-muted">Loading…</div>
          : (
            // Oct 14 client: the secretary didn't see where to type the delivery address — offer it right here.
            <div className="px-3 py-2.5 space-y-2">
              <div className="text-[13px] text-muted">{q.trim() ? `"${q.trim()}" isn't saved yet.` : 'No saved families match.'}</div>
              <button type="button" onClick={() => { setAdding(true); setNf((x) => ({ ...x, name: q.trim() })); }}
                      className="haptic w-full rounded-[10px] bg-forest text-paper px-3 py-2.5 text-[13.5px] font-bold">
                + Add {q.trim() ? `"${q.trim()}"` : 'a new family'} with the delivery address
              </button>
            </div>
          ))}
        {all.map((f) => (
          <button key={f.id} type="button" onClick={() => onChange(f.id)}
                  className={cx('haptic block w-full text-left px-3 py-2 hover:bg-sage/40')}>
            <div className="text-[13.5px] font-bold text-ink">{f.name}</div>
            <div className="text-[12px] text-muted">{addr(f) || 'No address'}{f.contactPhone ? ` · ${f.contactPhone}` : ''}</div>
          </button>
        ))}
      </div>
      <button type="button" onClick={() => { setAdding(true); setNf((x) => ({ ...x, name: q.trim() })); }}
              className="haptic text-[13px] font-bold text-forest">+ New family (name + delivery address)</button>
    </div>
  );
}
