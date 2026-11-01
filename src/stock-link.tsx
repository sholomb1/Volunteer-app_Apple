/**
 * Oct 30 client: what the center added to the ordering portal (InvenTree) from each pickup.
 * Server: apps/api/src/stock-link.ts (read-only copy of InvenTree's "added to stock" rows every
 * 15 min; credit rule: everything packed from store X goes to the latest pickup / kiosk drop-off
 * from X, until the next one). Off until the server is connected ("Not connected yet").
 *
 *   StockAddedLine        pickup page: "→ added to stock: 14 products · 162 units (Fridge 1, Top Shelf)", tap = list
 *   DropoffStockLine      Food to handle drop-off card: the same line for that drop-off
 *   StockByStoreReport    Reports: store · pickups · units added (+ not credited counts)
 *   StockStoreNamesPanel  Admin → Settings → "Ordering portal store names" (match InvenTree names to our stores)
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { cx } from './design';
import { whenAt } from './display';

type Line = { part: string; units: number; locations: string[]; first: string; last: string; store: string | null };
type Summary = { products: number; units: number; locations: string[]; lines: Line[]; line: string };
type Short = { products: number; units: number; locations: string[]; line: string };
type Status = { on: boolean; why: string | null; lastSync: string | null; problem: string | null; adds?: number; keepDays?: number };
type ByStoreRow = { store: string; ids: number[]; pickups: number; products: number; units: number };
type ByStore = { rows: ByStoreRow[]; noPickup: { adds: number; units: number }; notFromPickup: { adds: number; units: number } };
type NameRow = { name: string; adds: number; units: number; how: string[]; ids: number[]; auto: boolean; suggested: number[]; matched: boolean };
type Names = { rows: NameRow[]; suppliers: { id: number; name: string }[]; unknown: { adds: number; units: number } };

const n0 = (n: number) => (Math.round(n * 100) / 100).toLocaleString('en-US');
const NOT_CONNECTED = 'Not connected yet';

function ProductList({ lines }: { lines: Line[] }) {
  return (
    <div data-stock-list className="mt-1.5 rounded-[10px] border border-line bg-paper divide-y divide-line text-[13px]">
      {lines.map((l, i) => (
        <div key={i} className="grid grid-cols-[40px_1fr] gap-x-2 px-3 py-1.5">
          <span className="font-bold text-ink tabular-nums text-right">{n0(l.units)}</span>
          <span className="min-w-0">
            <span className="block text-ink leading-snug">{l.part}</span>
            <span className="block text-muted text-[12px]">{[l.locations.join(', '), whenAt(l.last)].filter(Boolean).join(' · ')}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

function Toggle({ open, onClick, line }: { open: boolean; onClick: () => void; line: string }) {
  return (
    <button type="button" onClick={onClick} aria-expanded={open}
            className="haptic text-left text-[13.5px] leading-snug">
      <span className="font-bold text-forest">→ added to stock: </span>
      <span className="text-ink">{line}</span>
      <span className="ml-1.5 text-[12px] font-bold text-forest underline">{open ? 'hide' : 'see list'}</span>
    </button>
  );
}

/** Pickup page. Nothing when not connected or nothing was credited to this pickup. */
export function StockAddedLine({ pickupId, className }: { pickupId: number; className?: string }) {
  const [open, setOpen] = useState(false);
  const q = useQuery({
    queryKey: ['stock-link-pickup', pickupId], enabled: pickupId > 0, staleTime: 60_000, retry: false,
    queryFn: () => api<Status & { data: Summary | null }>(`/api/stock-link/pickup/${pickupId}`),
  });
  const s = q.data?.on ? q.data.data : null;
  if (!s) return null;
  return (
    <div data-stock-added className={cx('rounded-[12px] border border-sage-line bg-sage/30 px-3 py-2', className)}>
      <Toggle open={open} onClick={() => setOpen(!open)} line={s.line} />
      {open && <ProductList lines={s.lines} />}
    </div>
  );
}

/** Food to handle drop-off card. One shared request for all cards. */
export function DropoffStockLine({ dropoffId }: { dropoffId: number }) {
  const [open, setOpen] = useState(false);
  const all = useQuery({
    queryKey: ['stock-link-dropoffs'], staleTime: 60_000, retry: false,
    queryFn: () => api<Status & { data: Record<string, Short> | null }>('/api/stock-link/dropoffs'),
  });
  const short = all.data?.on ? all.data.data?.[String(dropoffId)] : undefined;
  const list = useQuery({
    queryKey: ['stock-link-dropoff', dropoffId], enabled: open && !!short, staleTime: 60_000, retry: false,
    queryFn: () => api<Status & { data: Summary | null }>(`/api/stock-link/dropoff/${dropoffId}`),
  });
  if (!short) return null;
  return (
    <div data-stock-dropoff={dropoffId}>
      <Toggle open={open} onClick={() => setOpen(!open)} line={short.line} />
      {open && (list.data?.data ? <ProductList lines={list.data.data.lines} /> : <div className="text-[12.5px] text-muted">Loading…</div>)}
    </div>
  );
}

/** Reports: a small "By store" table for the date range. */
export function StockByStoreReport({ from, to }: { from: string; to: string }) {
  const ok = /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to);
  const q = useQuery({
    queryKey: ['stock-link-by-store', from, to], enabled: ok, staleTime: 60_000, retry: false, placeholderData: (p) => p,
    queryFn: () => api<Status & { data: ByStore | null }>(`/api/stock-link/by-store?from=${from}&to=${to}`),
  });
  const d = q.data?.on ? q.data.data : null;
  const total = d?.rows.reduce((a, r) => a + r.units, 0) ?? 0;
  return (
    <div data-stock-by-store className="rounded-[14px] border border-line bg-paper p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="font-display font-semibold text-[16px]">Added to the ordering portal, by store</div>
        {d && <div className="text-[12.5px] text-muted">{n0(total)} units from pickups{q.data?.lastSync ? ` · updated ${whenAt(q.data.lastSync)}` : ''}</div>}
      </div>
      {q.isLoading ? <div className="mt-2 text-[13px] text-muted">Loading…</div>
        : q.isError ? <div className="mt-2 text-[13px] text-clay">Couldn’t load this.</div>
        : !q.data?.on ? <div className="mt-2 text-[13px] text-muted">{q.data?.why ?? NOT_CONNECTED}</div>
        : !d?.rows.length ? <div className="mt-2 text-[13px] text-muted">Nothing added from pickups in these dates.</div>
        : (
          <table className="mt-2 w-full text-[13.5px]">
            <thead><tr className="text-left text-[11.5px] uppercase tracking-[.04em] text-muted">
              <th className="py-1 font-bold">Store</th><th className="py-1 font-bold text-right">Pickups</th>
              <th className="py-1 font-bold text-right">Products</th><th className="py-1 font-bold text-right">Units added</th>
            </tr></thead>
            <tbody className="divide-y divide-line">
              {d.rows.map((r) => (
                <tr key={r.ids.join(',')}>
                  <td className="py-1.5 pr-2 text-ink">{r.store}</td>
                  <td className="py-1.5 text-right tabular-nums">{r.pickups}</td>
                  <td className="py-1.5 text-right tabular-nums">{r.products}</td>
                  <td className="py-1.5 text-right tabular-nums font-bold">{n0(r.units)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      {d && (d.noPickup.units > 0 || d.notFromPickup.units > 0) && (
        <div className="mt-2 text-[12.5px] text-muted leading-snug">
          Not counted above: {n0(d.noPickup.units)} units from our stores with no pickup before they were packed;{' '}
          {n0(d.notFromPickup.units)} units not from a pickup / unknown store.
        </div>
      )}
      {q.data?.on && q.data.problem && <div className="mt-1.5 text-[12.5px] font-bold text-clay">Can’t reach the ordering portal right now (showing the last copy). Tell Sholo if this stays.</div>}
    </div>
  );
}

const HOW: Record<string, string> = { supplier: 'supplier', barcode: 'barcode', name: 'name' };

/** Admin → Settings → "Ordering portal store names". */
export function StockStoreNamesPanel() {
  const qc = useQueryClient();
  const [all, setAll] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const q = useQuery({
    queryKey: ['stock-link-names'], staleTime: 30_000, retry: false,
    queryFn: () => api<Status & { data: Names }>('/api/stock-link/store-names'),
  });
  const save = useMutation({
    mutationFn: (b: { name: string; ids: number[] | null }) => api('/api/stock-link/store-names', { method: 'PUT', body: JSON.stringify(b) }),
    onSuccess: (_r, b) => {
      setMsg({ ok: true, text: `Saved: ${b.name}` });
      qc.invalidateQueries({ queryKey: ['stock-link-names'] });
      qc.invalidateQueries({ queryKey: ['stock-link-by-store'] });
      qc.invalidateQueries({ queryKey: ['stock-link-dropoffs'] });
    },
    onError: (e: any) => setMsg({ ok: false, text: String(e?.message ?? 'Could not save') }),
  });
  const d = q.data?.data;
  const nameOf = useMemo(() => new Map((d?.suppliers ?? []).map((s) => [s.id, s.name])), [d?.suppliers]);
  const rows = d?.rows ?? [];
  const unmatched = rows.filter((r) => !r.matched);
  const shown = all ? rows : unmatched;
  const set = (r: NameRow, ids: number[] | null) => { setMsg(null); save.mutate({ name: r.name, ids }); };
  return (
    <div data-stock-names className="rounded-[14px] border border-line bg-paper p-4 space-y-3">
      <div>
        <div className="font-display font-semibold text-[16px]">Ordering portal store names</div>
        <div className="mt-0.5 text-[12.5px] text-muted leading-snug">
          The ordering portal names stores its own way (“The Hive”, “paprika”). Match each name to our stores, so food added
          to stock is credited to the pickup it came from. Names with no match count as “not from a pickup”.
          Suggestions are by name: check them.
        </div>
      </div>
      {q.isLoading ? <div className="text-[13px] text-muted">Loading…</div>
        : q.isError ? <div className="text-[13px] text-clay">Couldn’t load this.</div>
        : (
          <>
            <div className="text-[13px]">
              {q.data?.on
                ? <span className="text-ink">Connected{q.data.lastSync ? ` · last copy ${whenAt(q.data.lastSync)}` : ' · first copy in a few minutes'} · last {q.data.keepDays ?? 90} days</span>
                : <span className="font-bold text-muted">{q.data?.why ?? NOT_CONNECTED}</span>}
              {q.data?.on && q.data.problem && <span className="ml-2 font-bold text-clay">Can’t reach it right now.</span>}
            </div>
            {d && d.unknown.adds > 0 && (
              <div className="text-[12.5px] text-muted">{n0(d.unknown.adds)} adds · {n0(d.unknown.units)} units had no store at all (generic supplier, no store label): not from a pickup.</div>
            )}
            <div className="flex flex-wrap gap-1.5">
              <button onClick={() => setAll(false)} className={cx('chip', !all && 'on')}>Unmatched ({unmatched.length})</button>
              <button onClick={() => setAll(true)} className={cx('chip', all && 'on')}>All names ({rows.length})</button>
            </div>
            {!shown.length ? <div className="text-[13px] text-muted">{all ? 'No store names yet.' : 'Every name is matched.'}</div> : (
              <div className="divide-y divide-line rounded-[12px] border border-line">
                {shown.map((r) => (
                  <div key={r.name} data-stock-name={r.name} className="px-3 py-2.5 space-y-1.5">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-bold text-[15px] text-ink">{r.name}</span>
                      <span className="text-[12.5px] text-muted">{n0(r.adds)} adds · {n0(r.units)} units{r.how.length ? ` · found by ${r.how.map((h) => HOW[h] ?? h).join(' + ')}` : ''}</span>
                      <span className={cx('ml-auto rounded-full px-2 py-0.5 text-[11.5px] font-bold border',
                        r.matched ? (r.auto ? 'bg-sky-soft text-sky-deep border-sky-soft' : 'bg-sage text-forest border-sage-line')
                          : r.auto ? 'bg-clay-soft text-clay border-clay/40' : 'bg-line/50 text-muted border-line')}>
                        {r.matched ? (r.auto ? 'Suggested' : 'Matched') : r.auto ? 'No match' : 'Not a pickup store'}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {r.ids.map((id) => (
                        <span key={id} className="inline-flex items-center gap-1 rounded-full border border-forest/40 bg-sage/50 px-2.5 py-0.5 text-[13px] text-forest">
                          {nameOf.get(id) ?? `Store ${id}`}
                          <button aria-label={`Remove ${nameOf.get(id) ?? id}`} disabled={save.isPending}
                                  onClick={() => set(r, r.ids.filter((x) => x !== id))} className="haptic font-bold">×</button>
                        </span>
                      ))}
                      <select value="" disabled={save.isPending || !d}
                              onChange={(e) => { const id = Number(e.target.value); if (id) set(r, [...new Set([...r.ids, id])]); }}
                              className="rounded-[10px] border border-line bg-paper px-2 py-1 text-[13px]">
                        <option value="">+ our store…</option>
                        {(d?.suppliers ?? []).filter((s) => !r.ids.includes(s.id)).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                      {r.matched && r.auto && (
                        <button disabled={save.isPending} onClick={() => set(r, r.ids)} className="haptic rounded-[10px] border border-forest/40 px-2.5 py-1 text-[12.5px] font-bold text-forest">✓ Right</button>
                      )}
                      {(r.matched || r.auto) && (
                        <button disabled={save.isPending} onClick={() => set(r, [])} className="haptic rounded-[10px] border border-line px-2.5 py-1 text-[12.5px] font-bold text-muted">Not one of our pickup stores</button>
                      )}
                      {!r.auto && (
                        <button disabled={save.isPending} onClick={() => set(r, null)} className="haptic px-1.5 py-1 text-[12.5px] font-bold text-muted underline">Use the suggestion</button>
                      )}
                    </div>
                    {!r.auto && r.suggested.length > 0 && r.suggested.join(',') !== r.ids.join(',') && (
                      <div className="text-[12px] text-muted">Suggested: {r.suggested.map((id) => nameOf.get(id) ?? id).join(', ')}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      {msg && <div className={cx('text-[12.5px] font-bold', msg.ok ? 'text-forest' : 'text-clay')}>{msg.text}</div>}
    </div>
  );
}
