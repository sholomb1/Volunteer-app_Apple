/**
 * AdminPickupDetail — dedicated admin/coordinator view for a single pickup.
 *
 * Client feedback (Aug 6): the old flow routed the live-board card click to
 * `/pickup/mine/:id` which is the DRIVER page. Wrong context for an admin
 * (says "No driver claimed" while showing "Claimed by you", hides the admin
 * actions, exposes driver-only workflow buttons and empty chat).
 *
 * This page is read-first, admin-only, and reuses the same modals the live
 * board's cards use for Edit (QuickPickupModal) and Assign Driver
 * (DriverPickerModal) — no duplicate write path.
 */
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Pencil, UserPlus, Trash2 } from 'lucide-react';
import { adminCRUD, api } from '../api';
import { QuickPickupModal } from '../portal-sections';
import { DriverPickerModal } from './CoordinatorPortal';

type Signup = {
  volunteer_id: number;
  first_name: string;
  last_name: string;
  unit_number?: number | null;
  role: string;
  assignment_status: string;
};
type PickupRow = {
  id: number;
  scheduled_date: string;
  scheduled_time: string;
  status: string;
  urgency_level?: string | null;
  pickup_type?: string | null;
  steady_pickup_id?: number | null;
  steady_name?: string | null;
  notes: string | null;
  is_one_time?: boolean;
  must_pickup_by?: string | null;
  actual_end_at?: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email?: string | null;
  pickup_address: string | null;
  food_description: string | null;
  estimated_quantity?: string | null;
  special_instructions?: string | null;
  suppliers: string | null;
  supplier_address: string | null;
  supplier_contact_name?: string | null;
  supplier_contact_phone?: string | null;
  supplier_instructions?: string | null;
  signups?: Signup[];
  slots_capacity: number;
  slots_filled?: number;
};

function fmt12(hhmm?: string | null): string {
  if (!hhmm) return '';
  const m = String(hhmm).match(/^(\d{1,2}):(\d{2})/);
  if (!m) return String(hhmm);
  const h = Number(m[1]); const mi = m[2];
  const ap = h >= 12 ? 'PM' : 'AM';
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${mi} ${ap}`;
}
function fmtDate(d: string): string {
  const dt = new Date(d + 'T12:00:00');
  return dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}
function statusLabel(s: string): { label: string; cls: string } {
  const st = (s || '').toLowerCase();
  if (st === 'completed' || st === 'delivered') return { label: 'Completed', cls: 'bg-sage text-forest border-sage-line' };
  if (st === 'cancelled') return { label: 'Cancelled', cls: 'bg-line/50 text-muted border-line' };
  if (st === 'en_route' || st === 'on_the_way') return { label: 'On the Way', cls: 'bg-amber-soft text-amber-deep border-amber/40' };
  if (st === 'assigned' || st === 'accepted' || st === 'claimed') return { label: 'Assigned', cls: 'bg-sky-soft text-sky-deep border-sky/40' };
  if (st === 'pending') return { label: 'Pending', cls: 'bg-clay-soft text-clay border-clay/40' };
  return { label: 'Volunteer Needed', cls: 'bg-clay-soft text-clay border-clay/40' };
}

// C1 Aug 13 — dual-mode: default route uses useParams (deep-link stays live),
// but the Live Board opens this inside a modal and passes pickupIdOverride +
// onClose so back-button / delete-success dismisses the modal instead of
// hard-navigating to `/`.
export function AdminPickupDetail({ pickupIdOverride, onClose }: { pickupIdOverride?: number; onClose?: () => void } = {}) {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const qc = useQueryClient();
  const pickupId = pickupIdOverride != null ? pickupIdOverride : Number(id);
  const dismiss = onClose ?? (() => nav('/'));

  // abc862 (Aug 15): stop depending on the Live Board list cache. Previously
  // we fetched today->+7d and searched client-side; if that list query failed
  // or was slow, the fallback below never fired (it was gated on
  // `!!listQ.data`) and the modal read "Pickup #NNN not found" for every
  // pickup. Now we hit the single-fetch endpoint directly, always.
  const listQ = { data: undefined as { data: PickupRow[] } | undefined, isLoading: false } as const;

  // Volunteer list — needed for the DriverPickerModal we reuse.
  const volunteersQ = useQuery({
    queryKey: ['admin-volunteers'],
    queryFn:  () => api<{ data: any[] }>('/api/volunteers?limit=500'),
  });

  const pickup: PickupRow | undefined = useMemo(() => {
    const rows = listQ.data?.data ?? [];
    return rows.find((r) => Number(r.id) === pickupId);
  }, [listQ.data, pickupId]);

  // Fallback: if not in the recent-week list (e.g. a past pickup), pull it
  // via a wider single-fetch. We only trigger this once the list has loaded
  // and confirmed the id isn't there.
  const fallbackQ = useQuery({
    queryKey: ['admin-pickup-single', pickupId],
    enabled: Number.isFinite(pickupId),
    queryFn:  async () => {
      // abc859 + abc862: single-fetch endpoint. Direct hit, no list dependency.
      try {
        const r = await api<{ data: PickupRow }>(`/api/pickup-instances/${pickupId}`);
        return r.data ?? null;
      } catch (e: any) {
        if (e?.status === 404) return null;
        throw e;
      }
    },
  });
  const row = pickup ?? fallbackQ.data ?? null;

  const [editing, setEditing] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const del = useMutation({
    mutationFn: () => adminCRUD.deletePickup(pickupId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-pickups'] });
      dismiss();
    },
  });
  // batch abc812 Aug 10 — release a pre-assigned steady driver from THIS
  // day's instance only. Steady template is not touched.
  const release = useMutation({
    mutationFn: () => api<{ data: any }>(`/api/pickup-instances/${pickupId}/release?reason=unavailable_today`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-pickups'] });
      qc.invalidateQueries({ queryKey: ['admin-pickup-detail', pickupId] });
    },
  });

  function onCancelClick() {
    if (!row) return;
    const label = row.suppliers || row.contact_name || `pickup #${row.id}`;
    if (confirm(`Cancel this pickup (${label})?\n\nThis marks it cancelled and removes it from the live board. Cannot be undone.`)) {
      del.mutate();
    }
  }

  if (listQ.isLoading || (!row && fallbackQ.isFetching)) {
    return (
      <div className="min-h-screen bg-cream px-4 py-6">
        <div className="max-w-[960px] mx-auto text-[13px] text-muted">Loading pickup…</div>
      </div>
    );
  }
  if (!row) {
    return (
      <div className="min-h-screen bg-cream px-4 py-6">
        <div className="max-w-[960px] mx-auto">
          <button onClick={dismiss} className="haptic inline-flex items-center gap-1.5 text-forest font-bold text-[13px] mb-4">
            <ArrowLeft size={16} /> Back to Board
          </button>
          <div className="rounded-[14px] border border-line bg-paper p-6 text-[14px] text-muted">
            Pickup #{pickupId} not found. It may have been cancelled or archived.
          </div>
        </div>
      </div>
    );
  }

  const st = statusLabel(row.status);
  const supplierName = row.suppliers?.trim() || row.steady_name?.trim() || '';
  const address      = row.supplier_address?.trim() || row.pickup_address?.trim() || '';
  const contactName  = row.supplier_contact_name?.trim() || row.contact_name?.trim() || '';
  const contactPhone = row.supplier_contact_phone?.trim() || row.contact_phone?.trim() || '';
  const contactEmail = row.contact_email?.trim() || '';
  const instructions = row.supplier_instructions?.trim() || row.special_instructions?.trim() || '';
  const signups      = row.signups ?? [];
  // batch abc812 Aug 10 — surface "Mark driver unavailable today" only on
  // steady-materialized instances that currently have a primary driver
  // assigned. Uses steady_pickup_id (canonical) or steady_name as fallback.
  const isSteadyPickup   = row.steady_pickup_id != null || !!row.steady_name;
  const hasPrimaryDriver = signups.some((s) => s.role === 'primary');
  const showReleaseBtn   = isSteadyPickup && hasPrimaryDriver;
  // batch abc820 · nav consolidation — Hide the "Assign Driver" button when
  // the pickup is either fully covered or completed / delivered / cancelled.
  const _statusLower     = String(row.status || '').toLowerCase();
  const _resolved        = ['completed', 'delivered', 'cancelled'].includes(_statusLower);
  const _slotsNeeded     = Number(row.slots_capacity ?? 1) || 1;
  const _slotsFilled     = signups.length;
  const _isFullyCovered  = _slotsFilled >= _slotsNeeded;
  const showAssignBtn    = !_resolved && !_isFullyCovered;

  function onReleaseClick() {
    if (!row) return;
    const drivers = signups.filter((s) => s.role === 'primary').map((s) => `${s.first_name} ${s.last_name}`).join(', ') || 'the driver';
    if (confirm(`Mark ${drivers} unavailable for today?\n\nThey will be un-assigned from this instance only (the steady template stays put — future days still auto-assign the same driver). The pickup will re-open and auto-broadcast to the volunteer group so someone else can claim.`)) {
      release.mutate();
    }
  }
  const title        = supplierName || contactName || 'One-time pickup';

  return (
    <div className="min-h-screen bg-cream">
      <div className="max-w-[960px] mx-auto px-4 py-5">
        {/* Top bar: back + title/status + primary actions */}
        <button onClick={dismiss} className="haptic inline-flex items-center gap-1.5 text-forest font-bold text-[13px] mb-3">
          <ArrowLeft size={16} /> Back to Board
        </button>
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="min-w-0">
            <h1 className="font-display font-bold text-[24px] leading-tight text-ink truncate">
              {title} <span className="text-muted font-normal text-[16px]">· #{row.id}</span>
            </h1>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11.5px] font-bold border ${st.cls}`}>{st.label}</span>
              {row.urgency_level === 'urgent' && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11.5px] font-bold border border-clay/40 bg-clay-soft text-clay">⚠️ URGENT</span>
              )}
              {row.steady_pickup_id != null && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10.5px] font-extrabold uppercase tracking-[.05em] bg-sage text-forest">Recurring</span>
              )}
              {row.is_one_time && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10.5px] font-extrabold uppercase tracking-[.05em] bg-amber-soft text-amber-deep">One-time</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
            {showAssignBtn && (
              <button onClick={() => setAssigning(true)}
                      className="haptic inline-flex items-center gap-1.5 text-[12.5px] font-bold text-paper bg-forest px-3 py-2 rounded-[8px] shadow-ctag">
                <UserPlus size={14} /> Assign Driver
              </button>
            )}
            {showReleaseBtn && (
              <button onClick={onReleaseClick} disabled={release.isPending}
                      title="Un-assign the steady driver from THIS day's instance only. Auto-broadcasts to the group."
                      className="haptic inline-flex items-center gap-1.5 text-[12.5px] font-bold text-clay bg-paper border border-clay/40 px-3 py-2 rounded-[8px] hover:bg-clay/10 disabled:opacity-50">
                {release.isPending ? 'Releasing…' : 'Mark driver unavailable today'}
              </button>
            )}
            <button onClick={() => setEditing(true)}
                    className="haptic inline-flex items-center gap-1.5 text-[12.5px] font-bold text-ink bg-paper border border-line px-3 py-2 rounded-[8px] hover:bg-cream">
              <Pencil size={14} /> Edit
            </button>
            <button onClick={onCancelClick} disabled={del.isPending}
                    className="haptic inline-flex items-center gap-1.5 text-[12.5px] font-bold text-clay bg-paper border border-clay/40 px-3 py-2 rounded-[8px] hover:bg-clay/10 disabled:opacity-50">
              <Trash2 size={14} /> {del.isPending ? 'Cancelling…' : 'Cancel'}
            </button>
          </div>
          {release.error && (
            <div className="text-clay text-[12px] mt-2">{(release.error as Error).message}</div>
          )}
        </div>

        {/* Body — read-first, tight card spacing (no whitespace fluff). */}
        <div className="space-y-3">
          {/* 1. Donor / supplier + contact */}
          <Card title="Donor / Supplier">
            <Row label="Name" value={supplierName || contactName || <em className="text-muted">(none)</em>} />
            {contactName && supplierName && contactName !== supplierName && (
              <Row label="Contact name" value={contactName} />
            )}
            <Row label="Contact phone" value={contactPhone
              ? <a href={`tel:${contactPhone}`} className="text-forest font-bold hover:underline">{contactPhone}</a>
              : <em className="text-muted">(none)</em>} />
            {contactEmail && <Row label="Email" value={<a href={`mailto:${contactEmail}`} className="text-forest hover:underline">{contactEmail}</a>} />}
          </Card>

          {/* 2. Pickup address + time window */}
          <Card title="Pickup Address & Time">
            <Row label="Address" value={address
              ? <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`}
                   target="_blank" rel="noreferrer"
                   className="text-forest hover:underline">{address}</a>
              : <em className="text-muted">(no address)</em>} />
            <Row label="Scheduled" value={`${fmtDate(row.scheduled_date)} · ${fmt12(row.scheduled_time?.slice(0, 5))}`} />
            {row.must_pickup_by && (
              <Row label="Latest by" value={new Date(row.must_pickup_by).toLocaleString('en-US',
                { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })} />
            )}
            {instructions && <Row label="Access instructions" value={instructions} />}
          </Card>

          {/* 3. Food + quantity */}
          <Card title="Food">
            <Row label="Description" value={row.food_description || <em className="text-muted">(none)</em>} />
            {row.estimated_quantity && <Row label="Estimated quantity" value={row.estimated_quantity} />}
          </Card>

          {/* 4. Drivers */}
          <Card title={`Drivers (${signups.length}${row.slots_capacity ? ` of ${row.slots_capacity} needed` : ''})`}>
            {signups.length === 0 ? (
              <div className="text-[13px] text-muted italic">No driver assigned. Tap <b>Assign Driver</b> above.</div>
            ) : (
              <div className="space-y-1.5">
                {signups.map((s) => (
                  <div key={s.volunteer_id} className="flex items-center justify-between gap-2 py-1 border-b border-line/50 last:border-b-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="font-bold text-[13.5px] text-ink truncate">{s.first_name} {s.last_name}</span>
                      {s.unit_number != null && (
                        <span className="text-muted font-semibold text-[11px]">#{s.unit_number}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[11px] font-extrabold uppercase tracking-[.05em] text-muted">{s.role}</span>
                      <span className="text-[11px] font-bold text-forest">{s.assignment_status}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* 5. Notes + recurrence */}
          {(row.notes || row.steady_pickup_id != null) && (
            <Card title="Notes & Recurrence">
              {row.notes && <Row label="Notes" value={<span className="whitespace-pre-wrap">{row.notes}</span>} />}
              {row.steady_pickup_id != null && (
                <Row label="Recurring" value={`Materialized from steady schedule${row.steady_name ? ` "${row.steady_name}"` : ''} (#${row.steady_pickup_id})`} />
              )}
            </Card>
          )}
        </div>
      </div>

      {/* Reused modals from the live board — same write paths, no duplication. */}
      {editing && (
        <QuickPickupModal
          pickup={row as any}
          onClose={() => setEditing(false)}
          onDone={() => {
            setEditing(false);
            qc.invalidateQueries({ queryKey: ['admin-pickups'] });
            qc.invalidateQueries({ queryKey: ['admin-pickup-single', pickupId] });
          }}
        />
      )}
      {assigning && (
        <DriverPickerModal
          pickup={row as any}
          volunteers={volunteersQ.data?.data ?? []}
          onClose={() => setAssigning(false)}
          onChanged={() => {
            qc.invalidateQueries({ queryKey: ['admin-pickups'] });
            qc.invalidateQueries({ queryKey: ['admin-pickup-single', pickupId] });
          }}
        />
      )}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[14px] border border-line bg-paper px-4 py-3">
      <h2 className="text-[11px] font-extrabold uppercase tracking-[.05em] text-muted mb-2">{title}</h2>
      <div className="space-y-1.5">{children}</div>
    </section>
  );
}
function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[13.5px]">
      <div className="text-muted font-semibold shrink-0">{label}</div>
      <div className="text-ink text-right min-w-0 break-words">{value}</div>
    </div>
  );
}
