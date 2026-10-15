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
import { Tip } from '../design';
import { ContactNoticeLine } from '../food-check'; // Oct 14 client
import { StorePhotoCard } from '../store-photo'; // Oct 14 client
import { uiConfirm, uiNotify } from '../ui-dialogs';
import { cancelledByText } from '../cancelled-by'; // Oct 14 client: who cancelled
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Pencil, UserPlus, Trash2 } from 'lucide-react';
import { adminCRUD, api, upcomingSms } from '../api';
import { sendPickupNowConfirmed } from '../pickup-send-now';
import { smsReasonText, textedText } from '../sms-reason';
import { fmtDateTimeEastern, repostedLabel } from '../time-format';
import { QuickPickupModal } from '../portal-sections';
import { DriverPickerModal } from './CoordinatorPortal';
import { SuggestedDriversCard } from '../profiles';
import { TextedDriversLink, PickupTextLines } from '../text-recipients'; // Oct 11 client: who got the pickup text; Oct 12: next text + times sent
import { submittedByLabel } from '../submitted-by'; // Oct 12 client
import { readExtraContacts, telHref } from '../extra-contacts'; // Oct 12 client

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
// Oct 13 client: "Submitted through the store app by <store> (<login>) · Oct 13, 3:05 PM · Ready now".
function storeAppLine(row: any): string {
  const store = String(row.suppliers ?? '').trim() || 'the store';
  const user = String(row.store_app_user ?? '').trim();
  const at = row.created_at ? fmtDateTimeEastern(row.created_at) : '';
  return [`Submitted through the store app by ${store}${user && !store.toLowerCase().includes(user.toLowerCase()) ? ` (${user})` : ''}`, at, storeAppKind(row)]
    .filter(Boolean).join(' · ');
}
/** What the store chose in its app (me.ts KIND_LABEL, kept at the start of notes). */
function storeAppKind(row: any): string {
  const n = String(row.notes ?? '');
  if (/^Food left behind/i.test(n)) return 'Left behind';
  if (/^Additional pickup/i.test(n)) return 'Additional pickup';
  if (!/^Food ready for pickup/i.test(n)) return '';
  // "Ready now" uses the time it was sent; "Later today" picks a later time.
  const sent = row.created_at ? new Date(row.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/New_York' }) : '';
  const m = /^(\d{1,2}):(\d{2})/.exec(String(row.scheduled_time ?? ''));
  const s = /^(\d{1,2}):(\d{2})/.exec(sent);
  if (!m || !s) return 'Ready';
  return Number(m[1]) * 60 + Number(m[2]) > Number(s[1]) * 60 + Number(s[2]) + 15 ? 'Later today' : 'Ready now';
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
  // Oct 2 client fix (UI plan §2 "pickup-not-found"): the list API returns
  // bigint ids as strings ("553957"). Number.isFinite("553957") is false, so
  // the single-fetch query below stayed disabled and the modal showed
  // "not found" without ever asking the server. Coerce to a number here.
  const pickupId = Number(pickupIdOverride != null ? pickupIdOverride : id);
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
    onSuccess: (r: any) => {
      // Oct 11 client: driver told + pickup re-sent as new (or why not).
      const n = r?.data?.driverRemoved?.notice; if (n) uiNotify(n, Number(r?.data?.driverRemoved?.resend?.sent ?? 0) > 0 ? 'ok' : 'info');
      qc.invalidateQueries({ queryKey: ['admin-pickups'] });
      qc.invalidateQueries({ queryKey: ['admin-pickup-detail', pickupId] });
    },
  });
  // upsms (Aug 20): per-pickup Send Now — same endpoint as the Live Board card.
  const sendNowMut = useMutation({
    // Oct 8: real sends go through sendPickupNowConfirmed (asks before re-sending).
    mutationFn: async (dryRun: boolean) => (dryRun
      ? (await upcomingSms.pickupSendNow(pickupId, true)).data
      : await sendPickupNowConfirmed(pickupId)),
    onSuccess: (d, dryRun) => {
      if (!d) return; // office chose not to re-send
      // Oct 9 client: in-page notices, not browser alert boxes.
      if (dryRun) {
        uiNotify(`Preview (dry run) — would go to ${d.wouldGoTo ?? 0} driver(s):\n\n${d.preview ?? '(no preview body)'}`, 'info');
      } else if (d.reason && !d.sent) {
        uiNotify(smsReasonText(d.reason), 'info');
      } else {
        uiNotify(`${textedText(d.sent, d.attempted)}${d.code ? ` (reply code: ${d.code})` : ''}`, 'ok');
      }
      qc.invalidateQueries({ queryKey: ['admin-pickups'] });
      qc.invalidateQueries({ queryKey: ['upcoming-drop'] });
    },
    onError: (e: Error) => uiNotify(`Send now failed: ${e.message}`, 'err'),
  });

  function onCancelClick() {
    if (!row) return;
    const label = row.suppliers || row.contact_name || `pickup #${(row as any).ref_number ?? row.id}`;
    void uiConfirm(`Cancel this pickup (${label})?\n\nThis marks it cancelled and removes it from the live board. Cannot be undone.`).then((ok) => { if (ok) {
      del.mutate();
    } });
  }

  if (listQ.isLoading || (!row && fallbackQ.isFetching)) {
    return (
      <div className="min-h-screen bg-cream px-4 py-6">
        <div className="max-w-[960px] mx-auto text-[13px] text-muted">Loading pickup…</div>
      </div>
    );
  }
  if (!row) {
    // Oct 2 client fix (UI plan §2 "pickup-not-found"): only a real 404 means
    // the pickup is gone. A network blip or server error used to show the same
    // "not found" text, so the office thought the pickup had been deleted.
    const loadFailed = fallbackQ.isError;
    return (
      <div className="min-h-screen bg-cream px-4 py-6">
        <div className="max-w-[960px] mx-auto">
          <button onClick={dismiss} className="haptic inline-flex items-center gap-1.5 text-forest font-bold text-[13px] mb-4">
            <ArrowLeft size={16} /> Back to Board
          </button>
          <div className="rounded-[14px] border border-line bg-paper p-6 text-[14px] text-muted">
            {loadFailed ? (
              <>
                Couldn't load pickup #{pickupId} — the connection or server had a problem. The pickup itself is fine.
                <button onClick={() => fallbackQ.refetch()} className="haptic ml-2 font-bold text-forest underline">Try again</button>
              </>
            ) : (
              <>Pickup #{pickupId} not found. It may have been cancelled or archived.</>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Oct 2 review items 1–2: the shared outcome label wins when present.
  const st = (row as any).outcome_label
    ? { label: (row as any).outcome_label as string,
        cls: String((row as any).outcome).startsWith('completed') ? 'bg-sage text-forest border-sage-line'
           : (row as any).outcome === 'cancelled' ? 'bg-line/50 text-muted border-line'
           : 'bg-clay-soft text-clay border-clay/40' }
    : statusLabel(row.status);
  const supplierName = row.suppliers?.trim() || row.steady_name?.trim() || '';
  // xyz126 (Aug 20): user's manually-picked pickup_address always wins over
  // the supplier's stored default. Fall back to supplier_address only when
  // pickup_address is empty.
  const address      = row.pickup_address?.trim() || row.supplier_address?.trim() || '';
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
  // Same remaining-slot rule as the cards and every SMS (server outcome.ts).
  const _remaining       = _resolved ? 0 : Math.max(0, Number((row as any).slots_remaining ?? (_slotsNeeded - _slotsFilled)));

  function onReleaseClick() {
    if (!row) return;
    const drivers = signups.filter((s) => s.role === 'primary').map((s) => `${s.first_name} ${s.last_name}`).join(', ') || 'the driver';
    void uiConfirm(`Mark ${drivers} unavailable for today?\n\nThey will be un-assigned from this instance only (the steady template stays put — future days still auto-assign the same driver). They get a text that they're off it. The pickup re-opens and is texted to the Default text group right away as a new pickup so someone else can take it.`).then((ok) => { if (ok) {
      release.mutate();
    } });
  }
  // Oct 7 client: fall back to the address before the generic label.
  const title        = supplierName || contactName || address.replace(/,?\s*(USA|United States)\.?\s*$/i, '') || 'One-time pickup';

  return (
    <div className="min-h-screen bg-cream">
      <div className="max-w-[960px] mx-auto px-4 py-5">
        {/* Top bar: back + title/status + primary actions */}
        <button onClick={dismiss} className="haptic inline-flex items-center gap-1.5 text-forest font-bold text-[13px] mb-3">
          <ArrowLeft size={16} /> Back to Board
        </button>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4 mb-4">
          <div className="min-w-0">
            <h1 className="font-display font-bold text-[24px] leading-tight text-ink sm:truncate">
              {title} <span className="text-muted font-normal text-[16px]">· #{(row as any).ref_number ?? row.id}</span>
              {(row as any).reply_code != null && (
                <span className="ml-2 align-middle inline-flex items-center rounded-full bg-sky-soft px-2.5 py-0.5 text-[12px] font-bold text-sky-deep">Text code {(row as any).reply_code}<Tip text="The number drivers see in their text. They reply with it to take the pickup." /></span>
              )}
              {/* Oct 11 client: who got the pickup text */}<TextedDriversLink pickupId={Number(row.id)} eager className="ml-2 align-middle text-[13px]" />
            </h1>
            {/* Oct 12 client: next text (drivers + time) and every time it was sent. */}
            <PickupTextLines pickupId={Number(row.id)} sig={`${(row as any).auto_broadcast_sent_at ?? ''}|${(row as any).status ?? ''}|${(row as any).reply_code ?? ''}`} className="mt-1 text-[12.5px]" />
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11.5px] font-bold border ${st.cls}`}>
                {(row as any).outcome === 'taken' ? 'Taken, no kiosk sign-in' : String((row as any).outcome ?? '').startsWith('completed') ? 'Completed' : st.label}
              </span>
              {/* Oct 5: kiosk verification is separate from the outcome. */}
              {String((row as any).outcome ?? '').startsWith('completed') && (
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11.5px] font-bold border ${(row as any).kiosk_verified ? 'bg-sage text-forest border-sage-line' : 'bg-line/50 text-muted border-line'}`}>
                  {(row as any).kiosk_verified ? '✓ Kiosk verified' : 'No kiosk verification'}
                </span>
              )}
              {!_resolved && (
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11.5px] font-bold border ${_remaining > 0 ? 'bg-clay-soft text-clay border-clay/40' : 'bg-sage text-forest border-sage-line'}`}>
                  {_remaining > 0 ? `Needs ${_remaining} more ${_remaining === 1 ? 'driver' : 'drivers'}` : 'Covered'}
                </span>
              )}
              {row.urgency_level === 'urgent' && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11.5px] font-bold border border-clay/40 bg-clay-soft text-clay">⚠️ URGENT</span>
              )}
              {row.steady_pickup_id != null && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10.5px] font-extrabold uppercase tracking-[.05em] bg-sage text-forest">Steady</span>
              )}
              {row.is_one_time && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10.5px] font-extrabold uppercase tracking-[.05em] bg-amber-soft text-amber-deep">One-time</span>
              )}
              {/* Oct 13 client: reposted → when, and the time it was for (drivers see "now"). */}
              {(row as any).requeued_at && !_resolved && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11.5px] font-bold border bg-sage text-forest border-sage-line">🔁 {repostedLabel((row as any).requeued_at, row.scheduled_date, row.scheduled_time)}</span>
              )}
              {/* Oct 12 client: who filled out the pickup form */}
              {(row as any).submitted_by && (
                <span className="text-[11.5px] text-muted">Form by: {submittedByLabel((row as any).submitted_by)}</span>
              )}
            </div>
            {/* Oct 13 client: food a store sent through its app — say so clearly. */}
            {(row as any).posted_via_supplier && (
              <div className="mt-1.5 inline-flex items-center rounded-[9px] bg-[#EFE4F6] text-[#6B3B8C] px-2.5 py-1 text-[12.5px] font-bold">📱 {storeAppLine(row)}</div>
            )}
            {/* Oct 14 client: the office ticked "Text the contact when a driver is on the way". */}
            <div className="mt-1"><ContactNoticeLine p={row} /></div>
          </div>
          <div className="flex items-center gap-2 sm:shrink-0 flex-wrap sm:justify-end">
            {showAssignBtn && (
              <button onClick={() => setAssigning(true)}
                      className="haptic inline-flex items-center gap-1.5 text-[12.5px] font-bold text-paper bg-forest px-3 py-2 rounded-[8px] shadow-ctag">
                <UserPlus size={14} /> Assign Driver
              </button>
            )}
            {/* upsms (Aug 20): "Send now" — Needs-a-Driver only. Fires this
                one pickup to the default group. Mirrors the Live Board card
                button so coordinators have the same control from either view. */}
            {_remaining > 0 && !(row as any).posted_via_supplier && (
              <button onClick={() => {
                        const ref = (row as any).ref_number ? `#${(row as any).ref_number}` : `id ${row.id}`;
                        void uiConfirm(`Text drivers about pickup ${ref} now?\n\nIt asks for ${_remaining} more ${_remaining === 1 ? 'driver' : 'drivers'}.`).then((ok) => { if (ok) sendNowMut.mutate(false); });
                      }}
                      disabled={sendNowMut.isPending}
                      title="Broadcast just this pickup to the default driver group"
                      className="haptic inline-flex items-center gap-1.5 text-[12.5px] font-bold text-sky bg-paper border border-sky/40 px-3 py-2 rounded-[8px] hover:bg-sky/10 disabled:opacity-50">
                {sendNowMut.isPending ? 'Sending…' : 'Send SMS'}
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
            {_statusLower !== 'cancelled' && ( /* Oct 14 review: no 'Cancel pickup' next to 'Un-cancel' */
            <button onClick={onCancelClick} disabled={del.isPending}
                    className="haptic inline-flex items-center gap-1.5 text-[12.5px] font-bold text-clay bg-paper border border-clay/40 px-3 py-2 rounded-[8px] hover:bg-clay/10 disabled:opacity-50">
              <Trash2 size={14} /> {del.isPending ? 'Cancelling…' : 'Cancel pickup'}
            </button>
            )}
          </div>
          {release.error && (
            <div className="text-clay text-[12px] mt-2">{(release.error as Error).message}</div>
          )}
          {/* Oct 9 client: say so when cancelling didn't work (was silent). */}
          {del.error && (
            <div role="alert" className="text-clay text-[12.5px] font-bold mt-2">Couldn't cancel this pickup — {(del.error as Error).message || 'please try again'}</div>
          )}
        </div>

        {/* Body — read-first, tight card spacing (no whitespace fluff). */}
        <div className="space-y-3">
          {/* Oct 5 client: expired with no driver → offer to put it back in the queue. */}
          {/* Oct 11 client: make a cancel obvious at the top, with a way back. */}
          {String((row as any).status ?? '').toLowerCase() === 'cancelled' && <CancelledBanner pickupId={pickupId} row={row} />}
          {(row as any).outcome === 'expired' && <RequeueBanner pickupId={pickupId} />}
          {/* Oct 6 client: taken but not checked in — the office settles it. */}
          {(row as any).outcome === 'taken' && <SettleTakenBanner pickupId={pickupId} />}
          {/* 1. Donor / supplier + contact */}
          <Card title="Donor / Supplier">
            <Row label="Name" value={supplierName || contactName || <em className="text-muted">(none)</em>} />
            {/* Oct 14 client: who filled out the form — clearly, in the donor box. */}
            <Row label="Form submitted by" value={(row as any).posted_via_supplier ? '📱 The store (app)'
              : (row as any).submitted_by ? `✍️ ${submittedByLabel((row as any).submitted_by)}` : <em className="text-muted">Not recorded</em>} />
            {contactName && supplierName && contactName !== supplierName && (
              <Row label="Contact name" value={contactName} />
            )}
            <Row label="Contact phone" value={contactPhone
              ? <a href={`tel:${contactPhone}`} className="text-forest font-bold hover:underline">{contactPhone}</a>
              : <em className="text-muted">(none)</em>} />
            {/* Oct 12 client: the pickup's other contacts. */}
            {readExtraContacts((row as any).extra_contacts).map((c, i) => (
              <Row key={`xc${i}`} label="Other contact" value={<span data-extra-contact>
                {c.name ? <>{c.name} — </> : null}
                <a href={telHref(c.phone)} className="text-forest font-bold hover:underline">{c.phone}</a>
              </span>} />
            ))}
            {contactEmail && <Row label="Email" value={<a href={`mailto:${contactEmail}`} className="text-forest hover:underline">{contactEmail}</a>} />}
            {/* Oct 5 client: a one-time donor who gives now and then can become a store. */}
            {!row.suppliers?.trim() && !row.steady_pickup_id && <SaveAsStore pickupId={pickupId} row={row} />}
          </Card>

          {/* 2. Pickup address + time window */}
          <Card title="Pickup Address & Time">
            <Row label="Address" value={address
              ? <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`}
                   target="_blank" rel="noreferrer"
                   className="text-forest hover:underline">{address}</a>
              : <em className="text-muted">(no address)</em>} />
            <Row label="Pickup time" value={`${fmtDate(row.scheduled_date)} · ${fmt12(row.scheduled_time?.slice(0, 5))}`} />
            {row.must_pickup_by && (
              <Row label="Must be picked up by" value={new Date(row.must_pickup_by).toLocaleString('en-US',
                { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })} />
            )}
            <OfferWindow pickupId={pickupId} />

            {instructions && <Row label="Access instructions" value={instructions} />}
          </Card>

          {/* 3. Food + quantity */}
          <Card title="Food">
            <Row label="Description" value={row.food_description || <em className="text-muted">(none)</em>} />
            {row.estimated_quantity && <Row label="Estimated quantity" value={row.estimated_quantity} />}
            {/* Oct 14 client: the photo the store added when posting. */}
            <StorePhotoCard url={(row as any).store_photo_url} className="max-w-[420px]" />
          </Card>

          {/* 4. Drivers */}
          <Card title={`Drivers (${Math.min(signups.length, _slotsNeeded)} of ${_slotsNeeded} needed)`}>
            {signups.length === 0 ? (
              <div className="text-[13px] text-muted italic">No driver assigned.{showAssignBtn && <> Tap <b>Assign Driver</b> above.</>}</div>
            ) : (
              <div className="space-y-1.5">
                {[...signups].sort((a: any, b: any) => (a.role === 'backup' ? 1 : 0) - (b.role === 'backup' ? 1 : 0)).map((s, i) => (
                  <div key={s.volunteer_id} className="flex items-center justify-between gap-2 py-1 border-b border-line/50 last:border-b-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="font-bold text-[13.5px] text-ink truncate">{s.first_name} {s.last_name}</span>
                      {s.unit_number != null && (
                        <span className="text-muted font-semibold text-[11px]">#{s.unit_number}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[11px] font-extrabold uppercase tracking-[.05em] text-muted">{i >= _slotsNeeded || s.role === 'backup' ? 'Backup' : 'Driver'}</span>
                      <span className="text-[11px] font-bold text-forest">
                        {({ assigned: 'On the schedule', accepted: 'Driver confirmed', completed: 'Completed', no_show: 'No-show' } as Record<string, string>)[String(s.assignment_status)] ?? String(s.assignment_status ?? '')}
                      </span>
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
                <Row label="Steady" value={`Made automatically from the steady schedule${row.steady_name ? ` "${row.steady_name}"` : ''} (#${row.steady_pickup_id})`} />
              )}
            </Card>
          )}

          {/* Sep 15 client #6 — every attempt to accept this pickup that was
              rejected (already covered / code not found / phone not
              recognized). Data is written by the SMS webhook. */}
          {/* Oct 5 client (idea 4): who covered this place before — ask or assign. */}
          {_remaining > 0 && <SuggestedDriversCard pickupId={pickupId} />}
          {/* Oct 5 client (declutter #4): history, past drivers and failed replies in one place. */}
          <ActivityCard pickupId={pickupId} />
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

// Sep 15 client #6 — attempts to accept THIS pickup that did not create
// coverage (already covered, unknown driver, expired). Sourced from
// zlz.pickup_attempt_log (written by the SMS webhook's reject branches).
type PickupAttempt = {
  id: number;
  volunteer_name: string | null;
  unit_number: number | null;
  phone_last10: string;
  method: string;
  reason: string;
  reason_label: string;
  created_at: string;
};
function PickupAttemptsCard({ pickupId, bare }: { pickupId: number; bare?: boolean }) {
  const q = useQuery({
    queryKey: ['pickup-attempts', pickupId],
    queryFn:  () => api<{ data: PickupAttempt[] }>(`/api/pickup-attempts?pickup_id=${pickupId}&limit=30`),
    refetchInterval: 30_000,
  });
  const rows = q.data?.data ?? [];
  return (
    <MaybeCard bare={bare} title={`Acceptance attempts${rows.length ? ` · ${rows.length}` : ''}`}>
      {q.isLoading ? (
        <div className="text-[12.5px] text-muted italic">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="text-[13px] text-ink">No failed text replies — nobody tried to take this pickup after it was covered.</div>
      ) : (
        <div className="space-y-1">
          {rows.map((r) => (
            <div key={r.id} className="flex items-start justify-between gap-3 text-[12.5px] py-1 border-b border-line/50 last:border-b-0">
              <div className="min-w-0 flex-1">
                <div className="font-bold text-ink truncate">
                  {r.volunteer_name ?? `Unknown (${r.phone_last10})`}
                  {r.unit_number != null && <span className="text-muted font-semibold text-[11px] ml-1">#{r.unit_number}</span>}
                </div>
                <div className="text-[11.5px] text-muted truncate">{r.reason_label} · via {r.method}</div>
              </div>
              <div className="text-[11px] text-muted shrink-0">{fmtDateTimeEastern(r.created_at)}</div>
            </div>
          ))}
        </div>
      )}
    </MaybeCard>
  );
}


// Oct 5 (UI pass item 1): what happened to this pickup, oldest first.
function PickupHistoryCard({ pickupId, bare }: { pickupId: number; bare?: boolean }) {
  const q = useQuery({
    queryKey: ['pickup-history', pickupId],
    enabled: Number.isFinite(pickupId),
    queryFn: () => api<{ data: { at: string; kind: string; text: string; detail: string | null }[] }>(`/api/pickup-instances/${pickupId}/history`),
  });
  const rows = q.data?.data ?? [];
  const dot: Record<string, string> = {
    created: 'bg-line', texted: 'bg-sky', assigned: 'bg-forest', accepted: 'bg-forest', claimed: 'bg-forest',
    driver_cancel: 'bg-clay', released: 'bg-amber', kiosk: 'bg-forest', completed: 'bg-forest', closed: 'bg-clay',
  };
  return (
    <section className={bare ? '' : 'rounded-[14px] border border-line bg-paper px-4 py-3'}>
      {!bare && <h2 className="text-[11px] font-extrabold uppercase tracking-[.05em] text-muted mb-2">History</h2>}
      {q.isLoading ? <div className="text-[13px] text-muted">Loading…</div> :
       q.isError ? <div className="text-[13px] text-clay">Couldn't load the history. <button onClick={() => q.refetch()} className="underline font-bold">Try again</button></div> :
       rows.length === 0 ? <div className="text-[13px] text-muted">Nothing recorded yet.</div> : (
        <ol className="space-y-2">
          {rows.map((h, i) => (
            <li key={i} className="flex gap-3">
              <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${dot[h.kind] ?? 'bg-line'}`} />
              <div className="min-w-0">
                <div className="text-[13px] text-ink">{h.text}</div>
                <div className="text-[11.5px] text-muted">
                  {new Date(h.at).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/New_York' })}
                  {h.detail ? ` · ${h.detail}` : ''}
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}


// Oct 5 client: who covered this pickup before (same recurring schedule or supplier).
function PastCoverageCard({ pickupId, bare }: { pickupId: number; bare?: boolean }) {
  const q = useQuery({
    queryKey: ['pickup-past-coverage', pickupId],
    enabled: Number.isFinite(pickupId),
    queryFn: () => api<{ data: { id: number; ref_number: string | null; date: string; time: string | null; outcome_label: string | null; kiosk_verified: boolean; drivers: string }[] }>(`/api/pickup-instances/${pickupId}/past-coverage`),
  });
  const all = q.data?.data ?? [];
  // Oct 5 client: short by default — click to see all.
  const [open, setOpen] = useState(false);
  const rows = open ? all : all.slice(0, 3);
  const lastCovered = all.find((r) => r.drivers);
  const fmt = (d: string, t: string | null) => {
    const dt = new Date(`${d}T${(t ?? '12:00').slice(0, 5)}:00`);
    const day = dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    return t ? `${day} · ${dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}` : day;
  };
  return (
    <section className={bare ? '' : 'rounded-[14px] border border-line bg-paper px-4 py-3'}>
      {!bare && <h2 className="text-[11px] font-extrabold uppercase tracking-[.05em] text-muted mb-2">Who covered it before</h2>}
      {q.isLoading ? <div className="text-[13px] text-muted">Loading…</div> :
       q.isError ? <div className="text-[13px] text-clay">Couldn't load past pickups. <button onClick={() => q.refetch()} className="underline font-bold">Try again</button></div> :
       rows.length === 0 ? <div className="text-[13px] text-muted">No earlier pickups from this place yet.</div> : (<>
        <div className="text-[12.5px] text-muted mb-1">{lastCovered ? <>Last covered by <b className="text-ink">{lastCovered.drivers}</b> on {fmt(lastCovered.date, lastCovered.time)}</> : 'No driver covered it in the recent past.'}</div>
        <ul className="divide-y divide-line">
          {rows.map((r) => (
            <li key={r.id} className="flex items-start justify-between gap-3 py-2">
              <div className="min-w-0">
                <div className="text-[13.5px] font-semibold text-ink">{r.drivers || <span className="italic font-normal text-muted">No driver</span>}</div>
                <div className="text-[11.5px] text-muted">{fmt(r.date, r.time)} · #{r.ref_number ?? r.id}</div>
              </div>
              <div className="shrink-0 text-right text-[11.5px]">
                <div className="font-bold text-ink">{r.outcome_label ?? 'Still open'}</div>
                {String(r.outcome_label ?? '').startsWith('Completed') && (
                  <div className={r.kiosk_verified ? 'text-forest font-bold' : 'text-muted'}>{r.kiosk_verified ? '✓ Kiosk' : 'No kiosk'}</div>
                )}
              </div>
            </li>
          ))}
        </ul>
        {all.length > 3 && (
          <button onClick={() => setOpen(!open)} className="haptic mt-1 text-[12.5px] font-bold text-forest hover:underline">
            {open ? 'Show less' : `View all ${all.length}`}
          </button>
        )}
      </>)}
    </section>
  );
}


function MaybeCard({ bare, title, children }: { bare?: boolean; title: string; children: any }) {
  return bare ? <>{children}</> : <Card title={title}>{children}</Card>;
}

// Oct 5 client (declutter #4): one Activity box with tabs.
function ActivityCard({ pickupId }: { pickupId: number }) {
  const [t, setT] = useState<'history' | 'before' | 'failed'>('history');
  const tabs: [typeof t, string][] = [['history', 'History'], ['before', 'Who covered it before'], ['failed', 'Failed replies']];
  return (
    <section className="rounded-[14px] border border-line bg-paper px-4 py-3">
      <div className="mb-3 flex items-center gap-1 border-b border-line overflow-x-auto">
        {tabs.map(([k, label]) => (
          <button key={k} onClick={() => setT(k)}
                  className={`haptic -mb-px whitespace-nowrap border-b-2 px-2.5 py-1.5 text-[12.5px] font-bold ${t === k ? 'border-forest text-forest' : 'border-transparent text-muted hover:text-ink'}`}>
            {label}
          </button>
        ))}
      </div>
      {t === 'history' ? <PickupHistoryCard pickupId={pickupId} bare />
        : t === 'before' ? <PastCoverageCard pickupId={pickupId} bare />
        : <PickupAttemptsCard pickupId={pickupId} bare />}
    </section>
  );
}


function SaveAsStore({ pickupId, row }: { pickupId: number; row: any }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(String(row.donor_name ?? row.contact_name ?? '').trim());
  const [address, setAddress] = useState(String(row.pickup_address ?? '').trim());
  const [done, setDone] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => api<{ data: { supplierId: number; name: string; linked: number } }>(`/api/pickup-instances/${pickupId}/save-as-store`, {
      method: 'POST', body: JSON.stringify({ name, address, contactName: row.contact_name ?? null, contactPhone: row.contact_phone ?? null }) }),
    onSuccess: (r) => {
      setDone(`Saved "${r.data.name}" as a store and linked ${r.data.linked} ${r.data.linked === 1 ? 'pickup' : 'pickups'} to it.`);
      for (const k of ['admin-pickup-single', 'admin-pickup-detail', 'pickup-past-coverage', 'suggested-drivers', 'admin-suppliers']) qc.invalidateQueries({ queryKey: [k] });
    },
    onError: (e: any) => setErr(e?.message || 'Could not save the store'),
  });
  if (done) return <div className="mt-2 text-[12.5px] font-semibold text-forest">✅ {done}</div>;
  if (!open) return (
    <div className="mt-2 flex items-center justify-between gap-2">
      <span className="text-[12px] text-muted">Gives now and then? Save them as a store to keep their history together.</span>
      <button onClick={() => setOpen(true)} className="haptic shrink-0 rounded-[10px] border border-forest/40 px-3 py-1.5 text-[12.5px] font-bold text-forest hover:bg-sage/60">Save as a store</button>
    </div>
  );
  const inp = 'mt-1 w-full rounded-[10px] border border-line bg-paper px-3 py-2 text-[13px] font-normal';
  return (
    <div className="mt-3 space-y-2 rounded-[12px] border border-line bg-cream/40 p-3">
      <label className="block text-[12px] font-bold">Store name<input value={name} onChange={(e) => setName(e.target.value)} className={inp} /></label>
      <label className="block text-[12px] font-bold">Address<input value={address} onChange={(e) => setAddress(e.target.value)} className={inp} /></label>
      <div className="text-[11.5px] text-muted">Earlier one-time pickups at this address or from this donor are linked to the new store too.</div>
      {err && <div className="text-[12px] text-clay">{err}</div>}
      <div className="flex justify-end gap-2">
        <button onClick={() => setOpen(false)} className="haptic rounded-[10px] border border-line px-3 py-1.5 text-[12.5px] font-bold text-muted">Cancel</button>
        <button disabled={!name.trim() || save.isPending} onClick={() => { setErr(null); save.mutate(); }}
                className="haptic rounded-[10px] bg-forest px-3 py-1.5 text-[12.5px] font-bold text-paper disabled:opacity-50">{save.isPending ? 'Saving…' : 'Save store'}</button>
      </div>
    </div>
  );
}


/** Oct 9 client: how much longer drivers are offered this pickup, with
 *  buttons to make that longer or shorter. Hidden once it's not waiting for a driver. */
function OfferWindow({ pickupId }: { pickupId: number }) {
  const qc = useQueryClient();
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 30_000); return () => clearInterval(t); }, []);
  const q = useQuery({
    queryKey: ['offer-window', pickupId],
    queryFn: () => api<{ data: { offeredUntil: string | null; open: boolean } }>(`/api/pickup-instances/${pickupId}/offer-window`),
    refetchInterval: 60_000,
  });
  const m = useMutation({
    mutationFn: (addMinutes: number) => api(`/api/pickup-instances/${pickupId}/offer-window`, { method: 'POST', body: JSON.stringify({ addMinutes }) }),
    onSuccess: () => {
      for (const k of ['offer-window', 'admin-pickup-single', 'admin-pickups', 'admin-pickups-range']) qc.invalidateQueries({ queryKey: [k] });
    },
  });
  const d = q.data?.data;
  if (!d?.open || !d.offeredUntil) return null;
  const until = new Date(d.offeredUntil);
  const mins = Math.max(0, Math.round((until.getTime() - Date.now()) / 60_000));
  // Oct 12 client: plain English for people less comfortable with English —
  // "8 more days" instead of "192 hrs 21 min more".
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const days = Math.floor(mins / 1440), hrs = Math.floor((mins % 1440) / 60), mm = mins % 60;
  const left = days >= 2 ? (hrs >= 12 ? `${days} and a half days` : plural(days, 'day'))
    : days === 1 ? `1 day${hrs ? `, ${plural(hrs, 'hour')}` : ''}`
    : hrs > 0 ? `${plural(hrs, 'hour')}${mm ? `, ${plural(mm, 'minute')}` : ''}`
    : plural(mm, 'minute');
  const at = until.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/New_York' });
  const btn = 'haptic rounded-[8px] border border-line bg-paper px-2.5 py-1 text-[12px] font-bold text-ink hover:bg-cream disabled:opacity-50';
  return (
    <Row label="Drivers can take it for" value={
      <div>
        <div><b>{left} more</b> <span className="text-muted">(until {at})</span></div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span className="text-[12px] text-muted">Change:</span>
          <button className={btn} disabled={m.isPending || mins <= 60} onClick={() => m.mutate(-60)}>1 hour less</button>
          <button className={btn} disabled={m.isPending} onClick={() => m.mutate(60)}>1 hour more</button>
          <button className={btn} disabled={m.isPending} onClick={() => m.mutate(180)}>3 hours more</button>
          <button className={btn} disabled={m.isPending} onClick={() => m.mutate(360)}>6 hours more</button>
        </div>
        {m.isError && <div className="mt-1 text-[12px] text-clay">{(m.error as Error).message}</div>}
      </div>
    } />
  );
}


/** Oct 9 client: repost an expired pickup (used by the banner here and the
 *  small Repost button on the pickup cards). */
function useRequeue(pickupId: number) {
  const qc = useQueryClient();
  const [msg, setMsg] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: (textNow: boolean) => api<{ data: { sent: number; skipped: string | null } }>(`/api/pickup-instances/${pickupId}/requeue`, { method: 'POST', body: JSON.stringify({ textNow }) }),
    onSuccess: (r) => {
      setMsg(r.data.skipped === 'not-texted' ? 'Back in the queue for 6 more hours — no text sent. Drivers see it in the app and in PICKUPS.'
        : r.data.sent > 0 ? 'Reposted for 6 more hours — texted to drivers now.'
        : r.data.skipped === 'dry-run' ? 'Reposted for 6 more hours — texted to drivers now (test site — not really sent).'
        : String(r.data.skipped ?? '').startsWith('quiet-hours') ? 'Reposted for 6 more hours — it goes out in the morning text (quiet hours now).' /* Oct 12 client: was 9 AM */ /* Oct 14 client: 9 AM, or 8 AM if before 9 */
        : 'Reposted for 6 more hours.');
      for (const k of ['admin-pickup-single', 'admin-pickup-detail', 'pickup-history', 'admin-pickups', 'admin-pickups-range']) qc.invalidateQueries({ queryKey: [k] });
    },
    onError: (e: any) => setMsg(`⚠️ ${e?.message || 'Could not put it back in the queue'}`),
  });
  return { m, msg };
}

/** Oct 9 client: small "Repost" for an expired pickup's card — same "Text drivers now?" choice as the banner. */
export function RepostButton({ pickupId, className }: { pickupId: number; className?: string }) {
  const { m, msg } = useRequeue(pickupId);
  const [asking, setAsking] = useState(false);
  if (msg) return <div className="col-span-2 sm:col-span-1 text-[11.5px] font-semibold text-forest">{msg}</div>;
  if (!asking) return <button onClick={() => setAsking(true)} className={className} title="Food's still there — offer it to drivers again">Repost</button>;
  const b = 'haptic w-full rounded-[9px] px-2.5 py-1.5 text-[12px] font-bold disabled:opacity-50';
  return (
    <div className="col-span-2 sm:col-span-1 space-y-1">
      <div className="text-[11.5px] font-bold text-ink">Text drivers now?</div>
      <button disabled={m.isPending} onClick={() => m.mutate(true)} className={b + ' bg-forest text-paper'}>
        {m.isPending && m.variables ? 'Reposting…' : 'Yes, text now'}
      </button>
      <button disabled={m.isPending} onClick={() => m.mutate(false)} className={b + ' border border-forest/50 text-forest'}>
        {m.isPending && !m.variables ? 'Reposting…' : 'No, just the queue'}
      </button>
      <button disabled={m.isPending} onClick={() => setAsking(false)} className="haptic w-full text-[11.5px] font-bold text-muted">Back</button>
    </div>
  );
}

/** Oct 11 client: "Cancelled <when> — <why>" + Un-cancel (text drivers now, or just put it back). */
function CancelledBanner({ pickupId, row }: { pickupId: number; row: any }) {
  const qc = useQueryClient();
  const [msg, setMsg] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const m = useMutation({
    mutationFn: (textNow: boolean) => api<{ data: { sent: number; skipped: string | null } }>(`/api/pickup-instances/${pickupId}/uncancel`, { method: 'POST', body: JSON.stringify({ textNow }) }),
    onSuccess: (r) => {
      setMsg(r.data.skipped === 'not-texted' ? 'Un-cancelled — back as an open pickup. No text sent.'
        : r.data.sent > 0 ? 'Un-cancelled — texted to drivers now.'
        : r.data.skipped === 'dry-run' ? 'Un-cancelled — texted to drivers (test site — not really sent).'
        : 'Un-cancelled.');
      for (const k of ['admin-pickup-single', 'admin-pickup-detail', 'pickup-history', 'admin-pickups', 'admin-pickups-range']) qc.invalidateQueries({ queryKey: [k] });
    },
    onError: (e: any) => setMsg(`⚠️ ${e?.message || 'Could not un-cancel'}`),
  });
  const when = row?.cancelled_at ? new Date(row.cancelled_at).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/New_York' }) : null;
  const why = String(row?.cancellation_reason ?? '').replace(/^dismissed:\s*/i, '').trim();
  const by = cancelledByText(row?.cancelled_by); // Oct 14 client
  return (
    <section className="rounded-[14px] border border-clay/40 bg-clay/10 px-4 py-3 flex flex-wrap items-center gap-3">
      <div className="flex-1 min-w-[220px] text-[13px] text-ink">
        {msg ?? (asking ? 'Text the drivers about it now?' : (
          <><b>Cancelled{by ? ` ${by}` : ''}{when ? ` · ${when}` : ''}.</b>{why ? ` ${why}` : ''}</>
        ))}
      </div>
      {!msg && !asking && (
        <button onClick={() => setAsking(true)} className="haptic rounded-[10px] bg-forest px-3.5 py-2 text-[13px] font-bold text-paper">Un-cancel</button>
      )}
      {!msg && asking && (
        <div className="flex flex-wrap gap-2">
          <button disabled={m.isPending} onClick={() => m.mutate(true)}
                  className="haptic rounded-[10px] bg-forest px-3.5 py-2 text-[13px] font-bold text-paper disabled:opacity-50">Yes, text them now</button>
          <button disabled={m.isPending} onClick={() => m.mutate(false)}
                  className="haptic rounded-[10px] border border-forest/50 bg-paper px-3.5 py-2 text-[13px] font-bold text-forest disabled:opacity-50">No, just put it back</button>
          <button disabled={m.isPending} onClick={() => setAsking(false)} className="haptic px-2 text-[12.5px] font-bold text-muted">Back</button>
        </div>
      )}
    </section>
  );
}


function RequeueBanner({ pickupId }: { pickupId: number }) {
  const { m, msg } = useRequeue(pickupId);
  // Oct 9 client: ask whether to text drivers now or just put it back in the queue.
  const [asking, setAsking] = useState(false);
  return (
    <section className="rounded-[14px] border border-clay/40 bg-clay/10 px-4 py-3 flex flex-wrap items-center gap-3">
      <div className="flex-1 min-w-[220px] text-[13px] text-ink">
        {msg ?? (asking ? 'Text the drivers about it now?' : 'No driver took this pickup in 6 hours, so it closed. Food still there?')}
      </div>
      {!msg && !asking && (
        <button onClick={() => setAsking(true)}
                className="haptic rounded-[10px] bg-forest px-3.5 py-2 text-[13px] font-bold text-paper">
          Food's still there — repost
        </button>
      )}
      {!msg && asking && (
        <div className="flex flex-wrap gap-2">
          <button disabled={m.isPending} onClick={() => m.mutate(true)}
                  className="haptic rounded-[10px] bg-forest px-3.5 py-2 text-[13px] font-bold text-paper disabled:opacity-50">
            {m.isPending && m.variables ? 'Reposting…' : 'Yes, text them now'}
          </button>
          <button disabled={m.isPending} onClick={() => m.mutate(false)}
                  className="haptic rounded-[10px] border border-forest/50 bg-paper px-3.5 py-2 text-[13px] font-bold text-forest disabled:opacity-50">
            {m.isPending && !m.variables ? 'Reposting…' : 'No, just put it in the queue'}
          </button>
          <button disabled={m.isPending} onClick={() => setAsking(false)} className="haptic px-2 text-[12.5px] font-bold text-muted">Back</button>
        </div>
      )}
    </section>
  );
}


function SettleTakenBanner({ pickupId }: { pickupId: number }) {
  const qc = useQueryClient();
  const [msg, setMsg] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: (done: boolean) => api(`/api/pickup-instances/${pickupId}/${done ? 'mark-done' : 'mark-missed'}`, { method: 'POST' }),
    onSuccess: (_r, done) => {
      setMsg(done ? 'Marked done.' : 'Marked missed.');
      for (const k of ['admin-pickup-single', 'admin-pickup-detail', 'pickup-history', 'admin-pickups', 'admin-pickups-range', 'not-checked-in']) qc.invalidateQueries({ queryKey: [k] });
    },
    onError: (e: any) => setMsg(`⚠️ ${e?.message || 'Could not save'}`),
  });
  return (
    <section className="rounded-[14px] border border-amber/50 bg-amber-soft/50 px-4 py-3 flex flex-wrap items-center gap-3">
      <div className="flex-1 min-w-[220px] text-[13px] text-ink">
        {msg ?? 'A driver took this pickup but never checked in at the kiosk. Do you know if it was done?'}
      </div>
      {!msg && (
        <div className="flex gap-1.5">
          <button disabled={m.isPending} onClick={() => m.mutate(true)}
                  className="haptic rounded-[10px] bg-forest px-3.5 py-2 text-[13px] font-bold text-paper disabled:opacity-50">Mark done</button>
          <button disabled={m.isPending} onClick={() => { void uiConfirm('Mark this pickup as missed?\n\nIt will count as not done.', { okLabel: 'Yes, mark missed' }).then((ok) => { if (ok) m.mutate(false); }); }}
                  className="haptic rounded-[10px] border border-clay px-3.5 py-2 text-[13px] font-bold text-clay disabled:opacity-50">Mark missed</button>
        </div>
      )}
    </section>
  );
}
