// Fork S · client Aug 7 — two disjoint features:
//   1) Prospects (potential stores) — pipeline w/ notes + convert-to-supplier.
//   2) Needs-Confirmation section — pinned block on the Live Board that shows
//      today's occasional pickups awaiting a Confirm / Decline call from
//      dispatch. Steadys flagged needs_confirmation materialize as
//      status='pending_confirmation'; a dispatcher decides each morning.

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Check, X, Store, Phone, Trash2, PhoneCall } from 'lucide-react';
import { api } from './api';
import { Button, cx } from './design';
import { fmtTime } from './time-format';

// ─────────────────────────────── API clients ──────────────────────────────────

export type Prospect = {
  id: number;
  name: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  status: 'new' | 'contacted' | 'visited' | 'signed' | 'declined';
  lastContactedAt: string | null;
  createdAt: string;
  updatedAt: string;
  convertedSupplierId: number | null;
};

export const prospects = {
  list: (status?: string) =>
    api<{ data: Prospect[] }>(`/api/prospects${status ? `?status=${encodeURIComponent(status)}` : ''}`),
  get:  (id: number) => api<{ data: Prospect }>(`/api/prospects/${id}`),
  create: (body: Partial<Prospect>) =>
    api<{ data: Prospect }>('/api/prospects', { method: 'POST', body: JSON.stringify(body) }),
  patch: (id: number, body: Partial<Prospect>) =>
    api<{ data: Prospect }>(`/api/prospects/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  remove: (id: number) => api<{ data: { deleted: number } }>(`/api/prospects/${id}`, { method: 'DELETE' }),
  convert: (id: number) =>
    api<{ data: { prospectId: number; supplier: { id: number; name: string } } }>(
      `/api/prospects/${id}/convert`, { method: 'POST' }),
};

export type NeedsConfirmationItem = {
  id: number | string;
  scheduled_date: string;
  scheduled_time: string;
  donorName?: string | null;
  pickupAddress?: string | null;
  contactPhone?: string | null;
  steadyName?: string | null;
  supplierName?: string | null;
  supplierAddress?: string | null;
};

export const pickupConfirmation = {
  list: () => api<{ data: NeedsConfirmationItem[] }>('/api/pickup-instances/needs-confirmation'),
  confirm: (id: number | string) =>
    api<{ data: any }>(`/api/pickup-instances/${id}/confirm`, { method: 'POST', body: '{}' }),
  decline: (id: number | string, note?: string) =>
    api<{ data: any }>(`/api/pickup-instances/${id}/decline`, {
      method: 'POST', body: JSON.stringify(note ? { note } : {}),
    }),
};

// ─────────────────────────── ProspectsPanel (page) ────────────────────────────

const STATUSES = ['new', 'contacted', 'visited', 'signed', 'declined'] as const;
const STATUS_LABELS: Record<typeof STATUSES[number], string> = {
  new: 'New', contacted: 'Contacted', visited: 'Visited', signed: 'Signed', declined: 'Declined',
};
const STATUS_TONE: Record<typeof STATUSES[number], string> = {
  new:       'bg-sky/15 text-[#2d5c73] border-sky/40',
  contacted: 'bg-amber-soft text-[#9a7415] border-amber/40',
  visited:   'bg-cream text-ink border-line',
  signed:    'bg-sage text-forest border-sage-line',
  declined:  'bg-clay-soft text-clay border-clay/40',
};

const inp = 'w-full rounded-[10px] border border-line bg-paper px-3 py-2 text-[13px] focus:outline-none focus:border-forest';

export function ProspectsPanel() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<'all' | typeof STATUSES[number]>('all');
  const q = useQuery({
    queryKey: ['prospects', filter],
    queryFn: () => prospects.list(filter === 'all' ? undefined : filter),
  });
  const rows = q.data?.data ?? [];
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);

  const selected = rows.find((r) => r.id === selectedId) ?? null;
  const countsByStatus: Record<string, number> = {};
  (q.data?.data ?? []).forEach((r) => { countsByStatus[r.status] = (countsByStatus[r.status] ?? 0) + 1; });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-extrabold uppercase tracking-[.05em] text-muted">
          {rows.length} {rows.length === 1 ? 'prospect' : 'prospects'}
        </div>
        <Button size="sm" variant="forest" icon={<Plus size={14} />} onClick={() => { setCreating(true); setSelectedId(null); }}>
          New prospect
        </Button>
      </div>

      {/* Status filter chips */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <button onClick={() => setFilter('all')}
                className={cx('haptic text-[11.5px] font-bold px-3 py-1.5 rounded-full border',
                              filter === 'all' ? 'bg-forest text-paper border-forest' : 'bg-paper text-ink border-line hover:bg-cream')}>
          All
        </button>
        {STATUSES.map((s) => (
          <button key={s} onClick={() => setFilter(s)}
                  className={cx('haptic text-[11.5px] font-bold px-3 py-1.5 rounded-full border',
                                filter === s ? 'bg-forest text-paper border-forest' : STATUS_TONE[s])}>
            {STATUS_LABELS[s]}{countsByStatus[s] ? ` · ${countsByStatus[s]}` : ''}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] gap-4">
        {/* List */}
        <div className="rounded-[14px] border border-line bg-paper overflow-hidden">
          {q.isLoading ? (
            <div className="text-[13px] text-muted px-4 py-6 text-center">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="text-[13px] text-muted px-4 py-8 text-center">
              No prospects{filter !== 'all' ? ` in "${STATUS_LABELS[filter as typeof STATUSES[number]]}"` : ''} yet.
            </div>
          ) : rows.map((r) => (
            <button key={r.id} onClick={() => { setSelectedId(r.id); setCreating(false); }}
                    className={cx('w-full text-left px-4 py-3 border-b border-line last:border-b-0 hover:bg-cream/60 transition-colors',
                                  selectedId === r.id && !creating && 'bg-cream/60')}>
              <div className="flex items-center gap-2">
                <span className={cx('inline-block text-[10.5px] font-extrabold uppercase tracking-[.04em] px-2 py-0.5 rounded-full border', STATUS_TONE[r.status])}>
                  {STATUS_LABELS[r.status]}
                </span>
                {r.convertedSupplierId && (
                  <span className="text-[10.5px] font-extrabold uppercase tracking-[.04em] text-forest">✓ Supplier #{r.convertedSupplierId}</span>
                )}
              </div>
              <div className="mt-1 font-display font-semibold text-[15px] text-ink truncate">{r.name}</div>
              <div className="mt-0.5 text-[12px] text-muted flex flex-wrap gap-x-3 gap-y-0.5">
                {r.contactName && <span>{r.contactName}</span>}
                {r.phone && <span className="flex items-center gap-1"><Phone size={10.5} />{r.phone}</span>}
                {r.address && <span className="truncate">{r.address}</span>}
              </div>
            </button>
          ))}
        </div>

        {/* Detail / editor */}
        <div className="min-w-0">
          {creating ? (
            <ProspectEditor key="new" prospect={null}
                            onSaved={(id) => { setCreating(false); setSelectedId(id);
                              qc.invalidateQueries({ queryKey: ['prospects'] }); }}
                            onCancel={() => setCreating(false)} />
          ) : selected ? (
            <ProspectEditor key={selected.id} prospect={selected}
                            onSaved={() => qc.invalidateQueries({ queryKey: ['prospects'] })}
                            onDeleted={() => { setSelectedId(null); qc.invalidateQueries({ queryKey: ['prospects'] }); }} />
          ) : (
            <div className="rounded-[14px] border border-dashed border-line bg-paper/50 px-4 py-12 text-center">
              <Store size={32} className="mx-auto text-muted mb-3" />
              <div className="text-[13px] text-muted">Select a prospect on the left, or add a new one.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ProspectEditor({
  prospect, onSaved, onDeleted, onCancel,
}: {
  prospect: Prospect | null;
  onSaved: (id: number) => void;
  onDeleted?: () => void;
  onCancel?: () => void;
}) {
  const isNew = !prospect;
  const [name, setName] = useState(prospect?.name ?? '');
  const [contactName, setContactName] = useState(prospect?.contactName ?? '');
  const [phone, setPhone] = useState(prospect?.phone ?? '');
  const [email, setEmail] = useState(prospect?.email ?? '');
  const [address, setAddress] = useState(prospect?.address ?? '');
  const [notes, setNotes] = useState(prospect?.notes ?? '');
  const [status, setStatus] = useState<Prospect['status']>(prospect?.status ?? 'new');

  const save = useMutation({
    mutationFn: async () => {
      const body: any = {
        name: name.trim(),
        contactName: contactName.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        address: address.trim() || null,
        notes: notes.trim() || null,
        status,
      };
      if (isNew) {
        const res = await prospects.create(body);
        return res.data;
      }
      const res = await prospects.patch(prospect!.id, body);
      return res.data;
    },
    onSuccess: (row) => { onSaved(row.id); },
  });

  const markContacted = useMutation({
    mutationFn: () => prospects.patch(prospect!.id, {
      status: status === 'new' ? 'contacted' : status,
      lastContactedAt: new Date().toISOString() as any,
    }),
    onSuccess: (r) => { if (r.data.status) setStatus(r.data.status); onSaved(prospect!.id); },
  });

  const convert = useMutation({
    mutationFn: () => prospects.convert(prospect!.id),
    onSuccess: (r) => {
      setStatus('signed');
      onSaved(prospect!.id);
      alert(`Converted to supplier #${r.data.supplier.id}. It now appears on the Suppliers tab.`);
    },
    onError: (e: any) => {
      const msg = String(e?.message ?? e);
      if (msg.includes('already-converted')) alert('This prospect was already converted to a supplier.');
      else alert(`Convert failed: ${msg}`);
    },
  });

  const remove = useMutation({
    mutationFn: () => prospects.remove(prospect!.id),
    onSuccess: () => { onDeleted?.(); },
  });

  const canSave = name.trim().length > 0 && !save.isPending;
  const alreadyConverted = !!prospect?.convertedSupplierId;

  return (
    <div className="rounded-[14px] border border-line bg-paper p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="font-display font-semibold text-[16px] text-ink">
          {isNew ? 'New prospect' : prospect!.name}
        </div>
        <div className="flex items-center gap-2">
          {!isNew && !alreadyConverted && (
            <Button size="sm" variant="forest" icon={<Check size={14} />}
                    loading={convert.isPending}
                    onClick={() => { if (confirm(`Convert "${prospect!.name}" to a real supplier? A supplier row will be created and this prospect will be marked signed.`)) convert.mutate(); }}>
              Convert to supplier
            </Button>
          )}
          {!isNew && (
            <button onClick={() => { if (confirm(`Delete prospect "${prospect!.name}"?`)) remove.mutate(); }}
                    className="haptic text-clay grid h-8 w-8 place-items-center rounded-full hover:bg-clay-soft" title="Delete">
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      {alreadyConverted && (
        <div className="rounded-[10px] bg-sage border border-sage-line px-3 py-2 text-[12.5px] text-forest">
          ✓ Signed &amp; converted to supplier #{prospect!.convertedSupplierId}. Further edits are for record-keeping.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Business name *">
          <input className={inp} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Corner Bakery" />
        </Field>
        <Field label="Status">
          <select className={inp} value={status} onChange={(e) => setStatus(e.target.value as any)}>
            {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
          </select>
        </Field>
        <Field label="Contact name">
          <input className={inp} value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Owner / manager" />
        </Field>
        <Field label="Phone">
          <input className={inp} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 555-1234" />
        </Field>
        <Field label="Email">
          <input className={inp} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="hello@example.com" />
        </Field>
        <Field label="Address">
          <input className={inp} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, city" />
        </Field>
      </div>
      <Field label="Notes">
        <textarea className={cx(inp, 'min-h-[110px]')} value={notes} onChange={(e) => setNotes(e.target.value)}
                  placeholder="What did they say? When to circle back? Product they can donate?" />
      </Field>

      {!isNew && prospect?.lastContactedAt && (
        <div className="text-[11.5px] text-muted">
          Last contacted: {new Date(prospect.lastContactedAt).toLocaleString()}
        </div>
      )}

      <div className="flex items-center gap-2 pt-2 border-t border-line">
        <Button variant="forest" size="sm" icon={<Check size={14} />}
                loading={save.isPending} disabled={!canSave} onClick={() => save.mutate()}>
          {isNew ? 'Add prospect' : 'Save changes'}
        </Button>
        {!isNew && (
          <Button variant="plain" size="sm" icon={<PhoneCall size={14} />}
                  loading={markContacted.isPending} onClick={() => markContacted.mutate()}>
            Log outreach now
          </Button>
        )}
        {isNew && onCancel && (
          <Button variant="plain" size="sm" icon={<X size={14} />} onClick={onCancel}>Cancel</Button>
        )}
        {save.error && <span className="text-[12px] text-clay">{(save.error as Error).message}</span>}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-[11px] font-extrabold uppercase tracking-[.05em] text-muted mb-1">{label}</div>
      {children}
    </label>
  );
}

// ─────────────────────── NeedsConfirmationSection (Live Board) ────────────────
// Rendered pinned above the pickup groups on the Live Board when there is at
// least one occasional pickup awaiting confirmation today. Compact by design —
// each row exposes Confirm / Decline inline.

export function NeedsConfirmationSection() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['needs-confirmation'],
    queryFn: pickupConfirmation.list,
    refetchInterval: 60_000,
  });
  const rows = q.data?.data ?? [];
  if (rows.length === 0) return null;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['needs-confirmation'] });
    qc.invalidateQueries({ queryKey: ['admin-pickups'] });
  };

  return (
    <div className="rounded-[14px] border border-amber/50 bg-amber-soft/60 mb-4">
      <div className="px-4 py-2.5 border-b border-amber/40 flex items-center justify-between">
        <div className="text-[12px] font-extrabold uppercase tracking-[.05em] text-[#9a7415]">
          Needs confirmation · {rows.length} {rows.length === 1 ? 'pickup' : 'pickups'} today
        </div>
        <div className="text-[11px] text-[#9a7415]/80">Occasional pickups awaiting a Confirm or Decline call.</div>
      </div>
      <div>
        {rows.map((r) => <NeedsConfirmationRow key={r.id} row={r} onDone={invalidate} />)}
      </div>
    </div>
  );
}

function NeedsConfirmationRow({ row, onDone }: { row: NeedsConfirmationItem; onDone: () => void }) {
  const confirmM = useMutation({ mutationFn: () => pickupConfirmation.confirm(row.id), onSuccess: onDone });
  const declineM = useMutation({ mutationFn: () => pickupConfirmation.decline(row.id), onSuccess: onDone });
  const label   = row.steadyName || row.supplierName || row.donorName || 'Pickup';
  const address = row.supplierAddress || row.pickupAddress || '';

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-amber/30 last:border-b-0">
      <div className="min-w-0">
        <div className="font-display font-semibold text-[14px] text-ink truncate">{label}</div>
        <div className="text-[11.5px] text-muted flex flex-wrap gap-x-3">
          <span className="font-bold text-ink">{fmtTime(row.scheduled_time)}</span>
          {address && <span className="truncate">{address}</span>}
          {row.contactPhone && <span>{row.contactPhone}</span>}
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <button onClick={() => confirmM.mutate()} disabled={confirmM.isPending || declineM.isPending}
                className="haptic text-[11.5px] font-extrabold px-3 py-1.5 rounded-[10px] bg-forest text-paper hover:brightness-110 disabled:opacity-50">
          {confirmM.isPending ? '…' : 'Confirm'}
        </button>
        <button onClick={() => { if (window.confirm('Decline this pickup for today? It will be cancelled and drivers will not be notified.')) declineM.mutate(); }}
                disabled={confirmM.isPending || declineM.isPending}
                className="haptic text-[11.5px] font-extrabold px-3 py-1.5 rounded-[10px] border border-clay text-clay hover:bg-clay-soft disabled:opacity-50">
          {declineM.isPending ? '…' : 'Decline'}
        </button>
      </div>
    </div>
  );
}
