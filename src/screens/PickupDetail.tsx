/**
 * Pickup detail — mockup pattern: store name + lede, three stat tiles (sage
 * cards), drop-off meta row, container chips, status timeline, sticky CTA
 * that morphs through the lifecycle.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Phone, Send, User2 } from 'lucide-react';
import { volunteer, admin, adminCRUD, getUser, API_BASE, getToken, api, type OpenPickup } from '../api';
import { Avatar, SlotAvatars, SlotLabel, StatusTimeline, StickyCTA, cx } from '../design';
import { fmtTimeEastern, nyToday } from '../time-format';
import { DROPOFF, DROPOFF_MAPS_URL } from '../dropoff';
import { uiConfirm, uiNotify } from '../ui-dialogs';
import { driverError, fmtWhenLine, storeName, useBack, useTakePickup } from './driver-card';
import { StorePhotoCard } from '../store-photo'; // Oct 14 client
import { readExtraContacts, telHref } from '../extra-contacts'; // Oct 12 client

// Oct 9 client: plain message when the proof photo can't be sent (weak signal).
const PHOTO_UPLOAD_ERR = "Couldn't upload the photo — weak signal? Tap to try again.";

// Oct 8: proof photos are shrunk on the phone before upload (no new packages).
const PHOTO_MAX_SIDE = 1600;
const PHOTO_MAX_BYTES = 700_000; // size of the data: URL we send

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad image')); };
    img.src = url;
  });
}

/** Resize to ≤1600px on the longest side, JPEG ~0.8, then step down until it fits. */
/** Oct 8: send a shrunk photo to /api/uploads and get back its short link. */
async function uploadPhoto(dataUrl: string): Promise<string> {
  const blob = await (await fetch(dataUrl)).blob();
  const form = new FormData();
  form.append('file', blob, 'proof.jpg');
  const r = await fetch(`${API_BASE}/api/uploads`, { method: 'POST', headers: { Authorization: `Bearer ${getToken() ?? ''}` }, body: form });
  if (!r.ok) throw new Error('photo upload failed');
  const j = await r.json();
  if (!j?.url) throw new Error('photo upload failed');
  return String(j.url);
}

async function shrinkPhoto(file: File): Promise<string> {
  const img = await loadImage(file);
  let side = PHOTO_MAX_SIDE;
  let quality = 0.8;
  for (let i = 0; i < 8; i++) {
    const scale = Math.min(1, side / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
    const w = Math.max(1, Math.round((img.naturalWidth || 1) * scale));
    const h = Math.max(1, Math.round((img.naturalHeight || 1) * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no canvas');
    ctx.drawImage(img, 0, 0, w, h);
    const out = canvas.toDataURL('image/jpeg', quality);
    if (out.length <= PHOTO_MAX_BYTES) return out;
    if (quality > 0.55) quality -= 0.1; else side = Math.round(side * 0.75);
  }
  throw new Error('too big');
}

export function PickupDetail() {
  const { mode: rawMode, id } = useParams<{ mode: 'open' | 'mine' | 'admin'; id: string }>();
  const nav = useNavigate();
  const back = useBack(); // Oct 9 client: opened from a notification → Back goes home
  const qc = useQueryClient();
  const me = getUser();

  // Staff users typing /pickup/mine/:id (old links, bookmarks, copy-paste)
  // get auto-promoted to admin mode because they have no volunteer profile.
  // Oct 5: dispatchers too — they have no volunteer list, so /pickup/mine|open/:id showed "no longer available".
  const isStaffUser = me && (me.role === 'admin' || me.role === 'coordinator' || me.role === 'staff' || me.role === 'dispatcher');
  const mode = ((rawMode === 'mine' || rawMode === 'open') && isStaffUser) ? 'admin' : rawMode;

  // fgh103 (Aug 17): live-poll + focus-refetch on the detail screen too so
  // if a driver sits on the detail after another driver claims, they see the
  // "no longer available" state within seconds instead of a stale claim CTA.
  const open   = useQuery({ queryKey: ['open'], queryFn: volunteer.open, enabled: mode === 'open', refetchInterval: 15_000, refetchOnWindowFocus: true, staleTime: 5_000 });
  const mine   = useQuery({ queryKey: ['mine'], queryFn: volunteer.mine, enabled: mode === 'mine', refetchOnWindowFocus: true, staleTime: 5_000 });
  const adminQ = useQuery({ queryKey: ['admin-pickup', id], queryFn: () => admin.pickup(Number(id)), enabled: mode === 'admin' });
  // Oct 14 client: a link to a pickup that isn't open to drivers yet (it opens 2 hours before
  // its time) shows the pickup with "Opens at 3:00 PM" instead of Take.
  const inOpen = !!open.data?.data.some((p) => Number(p.pickup_instance_id) === Number(id));
  const upcoming = useQuery({
    queryKey: ['open-upcoming'],
    queryFn: () => api<{ data: Array<OpenPickup & { opens_at?: string | null; not_open_yet?: boolean }> }>('/api/me/open-pickups?upcoming=1'),
    enabled: mode === 'open' && !!open.data && !inOpen, refetchInterval: 60_000, staleTime: 30_000,
  });
  const pickup: any = useMemo(() => {
    const pid = Number(id);
    if (mode === 'open') return open.data?.data.find((p) => Number(p.pickup_instance_id) === pid)
      ?? upcoming.data?.data.find((p) => Number(p.pickup_instance_id) === pid && p.not_open_yet);
    if (mode === 'mine') return mine.data?.data.find((p) => Number(p.pickup_instance_id) === pid);
    if (mode === 'admin' && adminQ.data) {
      const a: any = adminQ.data;
      // Normalize admin row shape to the same fields PickupDetail expects.
      return {
        pickup_instance_id: a.id,
        scheduled_date: a.scheduled_date, scheduled_time: a.scheduled_time,
        status: a.status, suppliers: a.suppliers, is_one_time: false,
        food_description: a.food_description, estimated_quantity: null,
        store_photo_url: a.store_photo_url ?? null, // Oct 14 client
        supplier_address: a.supplier_address, supplier_phone: a.supplier_contact_phone,
        supplier_contact_name: a.supplier_contact_name, supplier_instructions: null,
        notes: a.notes, must_pickup_by: null, urgency_level: 'normal',
        slots_capacity: a.slots_capacity ?? 1, signups: [],
        assignment_id: 0, assignment_status: 'assigned',
      };
    }
    return null;
  }, [mode, id, open.data, mine.data, adminQ.data, upcoming.data]);

  // C4 Aug 13 — pick-up is the new intermediate transition. Advances status to
  // 'picked_up' (driver has the food but hasn't dropped off yet). complete is
  // now reserved for the final "Mark delivered" tap.
  const pickUp = useMutation({ mutationFn: () => volunteer.pickUp(pickup?.assignment_id), onSuccess: () => qc.invalidateQueries() });
  // Oct 8: same "take" as the cards (claim for 1 driver, sign up for 2+).
  const { take, busy: taking } = useTakePickup(() => nav(`/pickup/mine/${id}`, { replace: true }));
  const accept = useMutation({ mutationFn: () => volunteer.accept(pickup.assignment_id), onSuccess: () => qc.invalidateQueries() });
  const start  = useMutation({ mutationFn: () => volunteer.start(pickup.assignment_id),  onSuccess: () => qc.invalidateQueries() });
  const [showQtyPrompt, setShowQtyPrompt] = useState(false);
  const [qtyText, setQtyText]           = useState<string>('');
  const [photoUrl, setPhotoUrl]         = useState<string | null>(null);
  const [photoErr, setPhotoErr]         = useState<string | null>(null);
  const [photoBusy, setPhotoBusy]       = useState(false);
  // Oct 9 client: the uploaded link, kept so "try again" doesn't re-send a photo that already went up.
  const [photoLink, setPhotoLink]       = useState<string | null>(null);
  const [photoFailed, setPhotoFailed]   = useState(false);
  const complete = useMutation({
    mutationFn: async (opts: { quantity?: string; photoUrl?: string } = {}) => {
      try {
        await volunteer.complete(pickup.assignment_id, opts);
        return { photoDropped: false };
      } catch (e: any) {
        // If the server will not take the photo, still save the delivery (never on a lost signal).
        if (!opts.photoUrl || !e?.status || !/format|invalid|too big|missing|upload/i.test(String(e?.message ?? ''))) throw e;
        await volunteer.complete(pickup.assignment_id, { quantity: opts.quantity });
        return { photoDropped: true };
      }
    },
    onSuccess:  (r) => {
      qc.invalidateQueries();
      setShowQtyPrompt(false);
      uiNotify(r?.photoDropped ? 'Thank you! Delivery saved. (The photo could not be saved.)' : 'Thank you! Delivery saved.', 'ok');
      nav(`/trip/${id}`, { replace: true });
    },
  });
  // Oct 9 client: send the photo first; if it fails, keep the box open (amount kept)
  // with "Try again" and "Finish without photo" — the delivery is never lost.
  async function finishDelivery(withPhoto: boolean) {
    setPhotoErr(null);
    const quantity = qtyText.trim() || undefined;
    let link: string | undefined;
    if (withPhoto && photoUrl) {
      link = photoLink ?? undefined;
      if (!link) {
        setPhotoBusy(true);
        try {
          // Oct 8: the delivered call only takes a short link, so upload the file first.
          link = photoUrl.startsWith('data:') ? await uploadPhoto(photoUrl) : photoUrl;
          setPhotoLink(link);
        } catch {
          setPhotoErr(PHOTO_UPLOAD_ERR); setPhotoFailed(true); return;
        } finally { setPhotoBusy(false); }
      }
    }
    setPhotoFailed(false);
    complete.mutate({ quantity, photoUrl: link });
  }
  function openDeliveredPrompt() {
    complete.reset();
    if (!showQtyPrompt && !qtyText) setQtyText(pickup.estimated_quantity || '');
    setShowQtyPrompt(true);
  }
  // Oct 9 client: "I can't make it" (gives a taken pickup back) / "Decline" (office-assigned, not yet accepted).
  // Same routes as before — they tell the office; no new texts to drivers.
  const giveBack = useMutation({
    mutationFn: (kind: 'release' | 'decline') => kind === 'decline'
      ? volunteer.decline(pickup.assignment_id)
      : volunteer.release(Number(pickup.pickup_instance_id)),
    onSuccess: (_r, kind) => {
      qc.invalidateQueries();
      uiNotify(kind === 'decline' ? 'OK, you said no. The office has been told.' : 'OK, you gave it back. The office has been told.', 'ok');
      nav('/', { replace: true });
    },
    onError: (e: any) => uiNotify(driverError(e), 'err'),
  });
  async function onGiveBack(kind: 'release' | 'decline') {
    const ok = kind === 'decline'
      ? await uiConfirm('Say no to this pickup? The office will be told.', { okLabel: 'Yes, decline', cancelLabel: 'No' })
      : await uiConfirm('Give this pickup back? The office will be told and it goes back to other drivers.', { okLabel: 'Yes, give it back', cancelLabel: 'No, keep it' });
    if (ok) giveBack.mutate(kind);
  }
  async function onPhotoFile(file: File | null) {
    setPhotoErr(null); setPhotoLink(null); setPhotoFailed(false);
    if (!file) { setPhotoUrl(null); return; }
    if (!/^image\//.test(file.type)) { setPhotoErr('Please choose a photo.'); return; }
    setPhotoBusy(true);
    try { setPhotoUrl(await shrinkPhoto(file)); }
    catch { setPhotoErr('Could not use this photo. Try again, or skip it.'); }
    finally { setPhotoBusy(false); }
  }

  if (!pickup) {
    // Aug 15 audit: distinguish "still loading" from "loaded but null" so
    // an admin viewing an unknown/gone pickup doesn't sit on a Loading…
    // spinner forever (adminQ resolves to null → old code kept spinning).
    const isAdminMode = mode === 'admin';
    const adminDone = isAdminMode && !adminQ.isLoading && adminQ.data === null;
    const upcomingDone = mode !== 'open' || !open.data || inOpen || upcoming.isFetched || upcoming.isError; // Oct 14 client
    const otherDone = !isAdminMode && !open.isLoading && !mine.isLoading && upcomingDone;
    const shouldShowNotFound = adminDone || otherDone;
    return (
      <div className="min-h-screen">
        <div className="flex items-center px-5 py-3">
          {/* Oct 9 client: ≥44px tap target. */}
          <button onClick={back} aria-label="Back" className="haptic grid h-[44px] w-[44px] place-items-center rounded-full bg-paper border border-line"><ArrowLeft size={20} /></button>
        </div>
        {shouldShowNotFound ? (
          <div className="mx-4 mt-6 rounded-[14px] border border-line bg-paper p-6 text-center text-muted text-[14px]">
            This pickup is no longer available. It may have been cancelled, delivered, or reassigned.
          </div>
        ) : (
          <p className="text-center text-muted mt-12">Loading…</p>
        )}
      </div>
    );
  }

  const isOpen  = mode === 'open';
  const isAdmin = mode === 'admin';
  // Oct 14 client: not open to drivers yet → "Opens at 3:00 PM" (no Take).
  const opensAt: string | null = isOpen && pickup.not_open_yet && pickup.opens_at ? String(pickup.opens_at) : null;
  const opensLabel = opensAt ? fmtOpensAt(opensAt) : '';
  const stage = inferStage(pickup);
  const isDelivery = !!pickup.delivery_to_name;
  // Oct 13 client: drivers see "Now" for a reposted / late pickup; the office view keeps the time.
  const whenLine = fmtWhenLine(pickup.scheduled_date, pickup.scheduled_time, pickup.status, isAdmin);
  const storePhone = String(pickup.supplier_phone || '').split(',')[0].trim();
  const storeTel = storePhone.replace(/[^\d+]/g, '');
  const storeNote = String(pickup.supplier_instructions || '').trim();
  // Oct 12 client: the pickup's other contacts — a call button for each.
  const extraContacts = isDelivery ? [] : readExtraContacts(pickup.extra_contacts);
  const pickedAt = pickup.picked_up_at ? fmtTimeEastern(pickup.picked_up_at) : '';
  // Oct 8: plain steps; real times only (no made-up "Just now").
  const stages = [
    { key: 'posted',    label: isDelivery ? 'Delivery set up' : 'Store posted it' },
    { key: 'claimed',   label: isOpen ? 'A driver takes it' : stage === 0 ? 'Say yes to this pickup' : 'You took it' },
    { key: 'en_route',  label: 'On the way' },
    { key: 'picked_up', label: 'Picked up', ts: pickedAt || undefined },
    { key: 'delivered', label: 'Delivered' },
  ];
  const timelineNow = isOpen || stage === 0 ? 1 : stage + 1;

  return (
    <div className="min-h-screen flex flex-col">
      {/* App bar with back */}
      <div className="px-5 pt-3 pb-2 flex items-center justify-between gap-3">
        <button onClick={back} aria-label="Back" className="haptic grid h-[44px] w-[44px] place-items-center rounded-full bg-paper border border-line"><ArrowLeft size={20} /></button>
        {/* C3 Aug 13 — reference so drivers can quote it on the phone.
            Oct 9 client: drivers go by the text code (below); the portal # stays small for them. */}
        {pickup.ref_number && (
          isAdmin ? (
            <span className="ml-auto inline-flex items-center rounded-full bg-cream border border-line px-3 py-1 text-[14px] text-forest font-extrabold tracking-wider">
              #{pickup.ref_number}
            </span>
          ) : (
            <span className="ml-auto text-[12px] text-muted">#{pickup.ref_number}</span>
          )
        )}
        <Avatar initials={((me?.firstName?.[0] ?? '') + (me?.lastName?.[0] ?? '')) || '·'} />
      </div>

      <main className="flex-1 px-5 pb-4">
        <h1 className="font-display font-semibold text-[32px] leading-[1.08] tracking-[-0.02em] mt-1">{storeName(pickup)}</h1>
        {whenLine && <div className="font-display font-bold text-[22px] text-forest mt-2">{whenLine}</div>}
        {/* Oct 9 client: the same number the texts use. Hidden when this pickup was never texted. */}
        {!isAdmin && pickup.text_code && (
          <div className="mt-3 rounded-[14px] bg-sage border border-sage-line px-4 py-3">
            <div className="font-display font-bold text-[24px] text-forest leading-tight">Text code: {pickup.text_code}</div>
            {/* Oct 11 client: DONE works by text but is not advertised. */}
          </div>
        )}
        {/* Oct 14 client: no food text → no bare "Pickup" line. */}
        {(pickup.food_description || pickup.is_one_time) && <p className="text-ink/80 text-[16px] mt-2">{pickup.food_description || 'One-time pickup'}</p>}
        {pickup.estimated_quantity && pickup.estimated_quantity !== pickup.food_description && (
          <p className="text-muted text-[15px] mt-1">About: <b className="text-ink">{pickup.estimated_quantity}</b></p>
        )}
        {/* Oct 14 client: the photo the store added when posting (tap = full screen). */}
        <StorePhotoCard url={(pickup as any).store_photo_url} />

        {/* Call the store (not for deliveries — those show "Call family" below). */}
        {!isAdmin && !isDelivery && storeTel && stage < 3 && (
          <a href={`tel:${storeTel}`}
             className="haptic mt-4 flex items-center justify-center gap-2 min-h-[52px] rounded-[14px] bg-sage border border-sage-line text-forest font-bold text-[17px]">
            <Phone size={19} /> Call store
          </a>
        )}
        {!isAdmin && stage < 3 && extraContacts.map((c, i) => (
          <a key={i} href={telHref(c.phone)} data-extra-call
             className="haptic mt-2 flex items-center justify-center gap-2 min-h-[48px] rounded-[14px] bg-paper border border-sage-line text-forest font-bold text-[16px]">
            <Phone size={18} /> Call {c.name || 'other contact'} · {c.phone}
          </a>
        ))}

        {storeNote && (
          <div className="mt-4 rounded-[14px] border border-amber/40 bg-amber-soft px-4 py-3">
            <div className="text-[13px] font-extrabold uppercase tracking-[.05em] text-[#9a7415]">{isDelivery ? 'Note' : 'Note from the store'}</div>
            <div className="text-[16px] text-ink mt-1 whitespace-pre-wrap">{storeNote}</div>
          </div>
        )}
        {/* Oct 14 client: delivery privacy — before taking it, only the street; the rest comes after. */}
        {isOpen && isDelivery && (
          <div data-details-after-take className="mt-4 rounded-[14px] border border-line bg-cream px-4 py-3 text-[15px] text-ink">
            Details sent after you take it — the family's address, phone and notes.
          </div>
        )}

        {/* C2 Aug 13 — Maps address flips based on stage. Before Picked Up
            the driver navigates to the supplier; after Picked Up, to the
            Zeh L'Zeh drop-off. Prior build always showed the drop-off. */}
        {(() => {
          const isPickedUpOrLater = pickup.status === 'picked_up' || pickup.status === 'completed' || pickup.status === 'delivered';
          const supplierAddr = pickup.supplier_address || '';
          const supplierMapsUrl = supplierAddr
            ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(supplierAddr)}`
            : '';
          const showSupplier = !isPickedUpOrLater && !!supplierAddr;
          // Oct 8 client: a delivery starts at the office (3 Regina) and ends at the family.
          const dlvName = pickup.delivery_to_name as string | null | undefined;
          const dlvAddr = (pickup.delivery_to_address as string | null | undefined) || '';
          const label = dlvName
            ? (isPickedUpOrLater ? 'Deliver to' : 'Pick up at the office')
            : showSupplier ? 'Heading to pickup' : 'Heading to drop-off';
          const name  = dlvName
            ? (isPickedUpOrLater ? dlvName : DROPOFF.name)
            : showSupplier ? (pickup.suppliers || 'Supplier') : DROPOFF.name;
          const addr  = dlvName
            ? (isPickedUpOrLater ? dlvAddr : (supplierAddr || DROPOFF.address))
            : showSupplier ? supplierAddr : DROPOFF.address;
          const href  = dlvName
            ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addr)}`
            : showSupplier ? supplierMapsUrl : DROPOFF_MAPS_URL;
          return (
            <div className="flex items-center gap-3 py-4 border-b border-line">
              <span className="grid h-[40px] w-[40px] place-items-center rounded-[10px] bg-sage text-forest"><User2 size={20} /></span>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-extrabold uppercase tracking-[.06em] text-muted">{label}</div>
                <div className="text-[17px] font-bold mt-0.5">{name}</div>
                {addr ? (
                  <a href={href} target="_blank" rel="noopener noreferrer"
                     className="text-[15px] font-bold text-forest underline underline-offset-2 mt-0.5 inline-flex items-center min-h-[44px]">{/* Oct 14 client: 44px tap */}
                    {addr}  ·  Open in Maps →
                  </a>
                ) : dlvName ? (
                  <div className="text-[14px] text-muted mt-0.5">No address yet. Call the office if you need it.</div>
                ) : null}
                {dlvName && (
                  <div className="text-[14px] text-muted mt-1">
                    {isPickedUpOrLater ? '' : <>Then deliver to <b className="text-ink">{dlvName}</b>{dlvAddr ? `, ${dlvAddr}` : ''}. </>}
                    {pickup.delivery_to_phone && (
                      <a href={`tel:${String(pickup.delivery_to_phone).replace(/[^\d+]/g, '')}`}
                         className="haptic mt-2 flex items-center justify-center gap-2 min-h-[48px] rounded-[12px] bg-sage border border-sage-line text-forest font-bold text-[16px]">
                        <Phone size={18} /> Call family
                      </a>
                    )}
                    {/* Oct 14 client: the family's notes, for the driver who took it. */}
                    {!isOpen && pickup.delivery_to_notes && (
                      <div className="mt-2 text-[15px] text-ink whitespace-pre-wrap"><b>Family notes:</b> {String(pickup.delivery_to_notes)}</div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* Container chips — Tier-2 fix: was hardcoded to always show
            "Crates" selected regardless of what the supplier actually
            posted. Parse the "containers: …" marker the supplier post form
            bakes into notes; if nothing matches, no chip lights up. */}
        {(() => {
          const CONTAINERS = ['Crates', 'Boxes', 'Bags', 'Trays'] as const;
          const source = ((pickup.notes ?? '') + ' ' + (pickup.food_description ?? '')).toLowerCase();
          const m = source.match(/containers?:\s*([^·|;\n]*)/);
          const scope = m ? m[1] : '';
          const active = new Set<string>();
          for (const c of CONTAINERS) if (scope.includes(c.toLowerCase())) active.add(c);
          // Oct 8: only show the containers that apply (none → no section).
          if (active.size === 0) return null;
          return (
            <>
              <ChipLabel>Comes in</ChipLabel>
              <div className="flex flex-wrap gap-2">
                {CONTAINERS.filter((c) => active.has(c)).map((c) => (
                  <span key={c} className="chip on text-[14px]">{c}</span>
                ))}
              </div>
            </>
          );
        })()}

        {/* Drivers needed — admin can adjust here directly. Volunteers see the
            slot avatars + "N of M needed" badge as before. */}
        {isAdmin ? (
          <AdminSlotsControl pickupId={Number(id)} initial={pickup.slots_capacity ?? 1}
                             filled={(pickup.signups ?? []).length}
                             onChanged={() => qc.invalidateQueries()} />
        ) : pickup.slots_capacity > 1 ? (
          <>
            <ChipLabel>Drivers going</ChipLabel>
            <div className="flex items-center bg-sage border border-sage-line rounded-[14px] px-4 py-3">
              <SlotAvatars filled={(pickup.signups ?? []).map((s: any) => ({ initials: (s.first_name?.[0] ?? '') + (s.last_name?.[0] ?? '') }))}
                           capacity={pickup.slots_capacity} size={26} />
              <SlotLabel filled={(pickup.signups ?? []).length} capacity={pickup.slots_capacity} />
            </div>
          </>
        ) : null}

        {/* Drivers — explicit name list. Always rendered so volunteers/admins
            see WHO is on the pickup, not just initials. Helpful even with one
            slot because the volunteer might be co-driving with the supplier
            contact and needs to know the other driver. */}
        <ChipLabel>Drivers</ChipLabel>
        {(pickup.signups ?? []).length === 0 ? (
          <div className="bg-clay-soft border border-clay/30 rounded-[14px] px-4 py-3 text-[15px] font-bold text-clay">
            No driver yet
          </div>
        ) : (
          <div className="space-y-2">
            {(pickup.signups ?? []).map((s: any, i: number) => (
              <div key={s.volunteer_id ?? i} className="bg-sage border border-sage-line rounded-[14px] px-4 py-3 flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-forest text-paper font-bold text-[14px]">
                  {(s.first_name?.[0] ?? '') + (s.last_name?.[0] ?? '')}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-[15.5px] text-ink truncate">{s.first_name} {s.last_name}</div>
                  <div className="text-[13px] text-muted">
                    {s.role === 'backup' ? 'Backup driver' : 'Driver'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Timeline */}
        <ChipLabel>Steps</ChipLabel>
        <StatusTimeline stages={stages} current={timelineNow} />

        {/* Oct 9 client: fewer taps — "Done — dropped off" works from any step, and a clear way out. */}
        {mode === 'mine' && (pickup.assignment_status === 'assigned' || pickup.assignment_status === 'accepted') && stage < 4 && (
          <div className="mt-5 space-y-2">
            {/* Oct 14 client: not for a pickup on a later day (the card already hides it). */}
            {stage >= 1 && stage <= 2 && String(pickup.scheduled_date ?? '').slice(0, 10) <= nyToday() && (
              <button onClick={openDeliveredPrompt} disabled={complete.isPending}
                      className="haptic w-full min-h-[52px] rounded-[14px] border-[1.5px] border-forest bg-paper text-forest font-bold text-[17px] disabled:opacity-50">
                Done — dropped off
              </button>
            )}
            {pickup.assignment_status === 'assigned' && stage === 0 ? (
              <button onClick={() => void onGiveBack('decline')} disabled={giveBack.isPending}
                      className="haptic w-full min-h-[48px] rounded-[14px] border border-clay/40 bg-paper text-clay font-bold text-[16px] disabled:opacity-50">
                {giveBack.isPending ? 'Working…' : 'Decline'}
              </button>
            ) : stage <= 2 ? (
              <button onClick={() => void onGiveBack('release')} disabled={giveBack.isPending}
                      className="haptic w-full min-h-[48px] rounded-[14px] border border-clay/40 bg-paper text-clay font-bold text-[16px] disabled:opacity-50">
                {giveBack.isPending ? 'Working…' : "I can't make it"}
              </button>
            ) : null}
          </div>
        )}

        {/* Aug 13 (abc844): chat is participants-only. Volunteers browsing an
            unclaimed pickup no longer see the chat section — they haven't opted
            in, and previously they saw messages typed by unrelated users. Once
            claimed (mode='mine') or on staff/admin view, chat is visible. */}
        {(mode === 'mine' || isAdmin) && (
          <>
            <ChipLabel>Chat</ChipLabel>
            <ChatPanel pickupId={Number(id)} />
          </>
        )}
      </main>

      {isAdmin ? (
        // No volunteer-only CTAs for staff; they manage via the portal.
        <div className="sticky bottom-0 px-4 py-3 bg-cream border-t border-line text-[12px] text-muted text-center">
          Admin view · use the live board to assign or reassign drivers
        </div>
      ) : (
        <>
          {(accept.error || start.error || pickUp.error || complete.error) && (
            <div className="sticky bottom-[64px] px-4 py-2 bg-clay-soft border-t border-clay/30 text-[14px] font-bold text-clay text-center">
              {driverError(accept.error || start.error || pickUp.error || complete.error)}
            </div>
          )}
          {opensAt && (
            <div className="sticky bottom-[64px] px-4 py-2 bg-amber-soft border-t border-amber/40 text-[14px] font-bold text-[#9a7415] text-center">
              Not open to drivers yet. You can take it from {opensLabel}.
            </div>
          )}
          <StickyCTA tone={isOpen ? 'clay' : (stage === 2 ? 'forest' : 'clay')}
                     loading={taking || accept.isPending || start.isPending || pickUp.isPending || complete.isPending}
                     disabled={(!isOpen && stage >= 4) || !!opensAt}
                     onClick={() => {
                       if (opensAt) return;
                       if (isOpen) return take(pickup);
                       // C4 Aug 13 — stage 2 (en route) now advances to
                       // picked_up via the dedicated /pick-up endpoint (no
                       // dialog). Stage 3 (picked_up) shows the delivery
                       // capture dialog and hits /complete to finalize.
                       if (stage === 0) return accept.mutate();
                       if (stage === 1) return start.mutate();
                       if (stage === 2) return pickUp.mutate();
                       if (stage === 3) return openDeliveredPrompt();
                     }}>
            {opensAt ? `Opens at ${opensLabel}`
              : isOpen ? 'Take this pickup'
              // Only office-assigned pickups (assignment_status 'assigned') stop here;
              // a pickup the driver took is already 'accepted' and starts at stage 1.
              : stage === 0 ? "Accept pickup"
              : stage === 1 ? "I'm on my way"
              : stage === 2 ? "I picked it up"
              : stage === 3 ? "Delivered"
              : 'Done ✓'}
          </StickyCTA>
        </>
      )}

      {showQtyPrompt && (
        <div onClick={() => { if (!complete.isPending && !photoBusy) setShowQtyPrompt(false); }}
             className="fixed inset-0 z-[3000] bg-ink/50 grid place-items-center p-4">
          <div onClick={(e) => e.stopPropagation()}
               className="bg-paper rounded-[18px] shadow-lift w-full max-w-sm p-5">
            <div className="font-display font-semibold text-[20px]">How much did you bring?</div>
            <p className="text-[14px] text-muted mt-1">
              A rough guess is fine, like <span className="font-semibold">"8 trays"</span> or <span className="font-semibold">"3 boxes"</span>. You can skip this.
            </p>
            <input value={qtyText} onChange={(e) => setQtyText(e.target.value)} autoFocus
                   placeholder="How much (optional)"
                   className="mt-4 w-full rounded-[10px] border-[1.4px] border-line-2 bg-paper px-3.5 py-3 text-[16px] font-semibold outline-none focus:border-forest" />
            <div className="mt-4">
              <div className="text-[14px] font-bold text-muted">Photo <span className="font-normal">(optional)</span></div>
              <div className="mt-1.5 flex items-center gap-3">
                {photoUrl
                  ? <img src={photoUrl} alt="Proof" className="h-16 w-16 rounded-[10px] object-cover border border-line" />
                  : <div className="h-16 w-16 rounded-[10px] border border-dashed border-line-2 grid place-items-center text-[13px] font-bold text-muted text-center">{photoBusy ? '…' : 'No photo'}</div>}
                <label className="haptic cursor-pointer rounded-[10px] border-[1.4px] border-line-2 bg-paper px-4 min-h-[44px] flex items-center text-[15px] font-bold text-forest">
                  {photoBusy ? 'Getting photo…' : photoUrl ? 'Take again' : 'Take photo'}
                  <input type="file" accept="image/*" capture="environment"
                         onChange={(e) => { void onPhotoFile(e.target.files?.[0] ?? null); e.target.value = ''; }} className="hidden" />
                </label>
                {photoUrl && (
                  <button type="button" onClick={() => { setPhotoUrl(null); setPhotoLink(null); setPhotoFailed(false); setPhotoErr(null); }}
                          className="haptic min-h-[44px] px-2 text-[15px] font-bold text-clay">Remove</button>
                )}
              </div>
              {photoErr && (photoFailed
                ? <button type="button" onClick={() => void finishDelivery(true)} disabled={photoBusy || complete.isPending}
                          className="haptic mt-1 text-left text-[14px] font-bold text-clay underline underline-offset-2 min-h-[44px]">{photoErr}</button>
                : <p className="text-[14px] text-clay mt-1">{photoErr}</p>)}
            </div>
            {complete.error && <p className="text-[14px] font-bold text-clay mt-3">{driverError(complete.error)}</p>}
            {photoFailed ? (
              // Oct 9 client: photo didn't go — try again, or save the delivery without it.
              <div className="flex gap-2 mt-5">
                <button onClick={() => void finishDelivery(false)}
                        disabled={complete.isPending || photoBusy}
                        className="haptic flex-1 min-h-[48px] rounded-[10px] border border-line text-[15px] font-bold text-ink disabled:opacity-50">Finish without photo</button>
                <button onClick={() => void finishDelivery(true)}
                        disabled={complete.isPending || photoBusy}
                        className="haptic flex-1 min-h-[48px] text-[16px] font-bold bg-forest text-paper rounded-[10px] shadow-ctag disabled:opacity-50">
                  {photoBusy ? 'Sending…' : complete.isPending ? 'Saving…' : 'Try again'}
                </button>
              </div>
            ) : (
              <div className="flex gap-2 mt-5">
                <button onClick={() => complete.mutate({})}
                        disabled={complete.isPending || photoBusy}
                        className="haptic flex-1 min-h-[48px] rounded-[10px] border border-line text-[16px] font-bold text-muted disabled:opacity-50">Skip</button>
                <button onClick={() => void finishDelivery(true)}
                        disabled={complete.isPending || photoBusy}
                        className="haptic flex-1 min-h-[48px] text-[16px] font-bold bg-forest text-paper rounded-[10px] shadow-ctag disabled:opacity-50">
                  {photoBusy && photoUrl ? 'Sending…' : complete.isPending ? 'Saving…' : 'Save'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Oct 14 client: "3:00 PM" today, "tomorrow 3:00 PM", "Wed 3:00 PM" (New York time). */
function fmtOpensAt(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const t = d.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' });
  const day = d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const today = nyToday();
  const tomorrow = new Date(Date.parse(today + 'T12:00:00Z') + 86400e3).toISOString().slice(0, 10);
  if (day <= today) return t;
  if (day === tomorrow) return `tomorrow ${t}`;
  return `${d.toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'short' })} ${t}`;
}

function inferStage(p: any) {
  if (!p) return 0;
  if (p.status === 'completed' || p.status === 'delivered') return 4;
  if (p.status === 'picked_up') return 3;
  if (p.status === 'in_progress' || p.status === 'en_route') return 2;
  if (p.assignment_status === 'accepted' || p.status === 'confirmed') return 1;
  return 0;
}

function ChipLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-[14px] font-extrabold uppercase tracking-[.06em] text-forest mt-6 mb-3">{children}</div>;
}

function ChatPanel({ pickupId }: { pickupId: number }) {
  const me = getUser();
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ['chat', pickupId],
    queryFn:  () => volunteer.messages(pickupId),
    refetchInterval: 5000,
  });
  const send = useMutation({
    mutationFn: (body: string) => volunteer.sendMessage(pickupId, body),
    onSuccess: () => { setText(''); qc.invalidateQueries({ queryKey: ['chat', pickupId] }); },
  });

  useEffect(() => { scrollRef.current?.scrollTo({ top: 1e6 }); }, [data]);

  return (
    <div className="surface !p-0 overflow-hidden">
      <div ref={scrollRef} className="max-h-[260px] overflow-y-auto px-3 py-3 space-y-2">
        {isLoading ? <div className="text-center text-muted text-[14px] py-4">Loading…</div> :
         (data?.data.length ?? 0) === 0 ? <div className="text-center text-muted text-[14px] py-4">No messages yet.</div> :
         data?.data.map((m) => {
           const mine = m.author_user_id === me?.id;
           return (
             <div key={m.id} className={cx('flex', mine ? 'justify-end' : 'justify-start')}>
               <div className={cx('max-w-[78%] rounded-[14px] px-3 py-2 text-[15px]',
                                  mine ? 'bg-forest text-paper' : 'bg-sage text-ink')}>
                 {!mine && <div className="text-[13px] font-bold opacity-70">{m.first_name} {m.last_name}</div>}
                 <div>{m.body}</div>
               </div>
             </div>
           );
         })}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); if (text.trim()) send.mutate(text.trim()); }}
            className="flex items-center gap-2 px-3 py-2 border-t border-line bg-paper">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Message…"
               className="flex-1 bg-cream/50 rounded-[10px] px-3 py-2.5 text-[16px] outline-none focus:bg-paper border border-line focus:border-forest" />
        <button type="submit" disabled={!text.trim() || send.isPending} aria-label="Send"
                className="haptic grid h-[44px] w-[44px] place-items-center rounded-[10px] bg-forest text-paper disabled:opacity-40">
          <Send size={15} />
        </button>
      </form>
    </div>
  );
}

/**
 * Admin "Drivers needed" stepper rendered on the pickup detail screen.
 * Optimistic local state so the stepper feels instant; the PATCH runs in the
 * background and the query invalidation pulls the canonical value.
 */
function AdminSlotsControl({ pickupId, initial, filled, onChanged }: {
  pickupId: number; initial: number; filled: number; onChanged: () => void;
}) {
  const [n, setN] = useState<number>(initial);
  useEffect(() => { setN(initial); }, [initial]);
  const patch = useMutation({
    mutationFn: (next: number) => adminCRUD.patchPickup(pickupId, { slotsCapacity: next }),
    onSuccess: onChanged,
  });
  const set = (next: number) => { const v = Math.max(1, Math.min(20, next)); setN(v); patch.mutate(v); };

  return (
    <>
      <div className="text-[14px] font-extrabold uppercase tracking-[.06em] text-forest mt-6 mb-3">Drivers needed</div>
      <div className="flex items-center gap-4 bg-sage border border-sage-line rounded-[14px] px-5 py-4">
        <button onClick={() => set(n - 1)} disabled={n <= 1 || patch.isPending}
                className="haptic grid h-12 w-12 place-items-center rounded-full bg-paper border border-line text-muted text-[24px] font-bold disabled:opacity-40">−</button>
        <span className="font-display font-bold text-[36px] text-forest w-12 text-center leading-none">{n}</span>
        <button onClick={() => set(n + 1)} disabled={n >= 20 || patch.isPending}
                className="haptic grid h-12 w-12 place-items-center rounded-full bg-paper border border-line text-forest text-[24px] font-bold disabled:opacity-40">+</button>
        <div className="flex-1 text-[15px] text-muted font-bold">
          {n === 1 ? 'Single-driver pickup' : `${n}-driver pickup`}
          {filled > 0 && <span className="ml-1">· {filled} assigned</span>}
        </div>
        {patch.isPending && <span className="text-[13px] text-muted">saving…</span>}
      </div>
    </>
  );
}
