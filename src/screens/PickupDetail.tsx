/**
 * Pickup detail — mockup pattern: store name + lede, three stat tiles (sage
 * cards), drop-off meta row, container chips, status timeline, sticky CTA
 * that morphs through the lifecycle.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Send, User2 } from 'lucide-react';
import { volunteer, admin, adminCRUD, getUser } from '../api';
import { Avatar, SlotAvatars, SlotLabel, StatusTimeline, StickyCTA, cx } from '../design';
import { fmtTime } from '../time-format';
import { DROPOFF, DROPOFF_MAPS_URL } from '../dropoff';

export function PickupDetail() {
  const { mode: rawMode, id } = useParams<{ mode: 'open' | 'mine' | 'admin'; id: string }>();
  const nav = useNavigate();
  const qc = useQueryClient();
  const me = getUser();

  // Staff users typing /pickup/mine/:id (old links, bookmarks, copy-paste)
  // get auto-promoted to admin mode because they have no volunteer profile.
  const isStaffUser = me && (me.role === 'admin' || me.role === 'coordinator' || me.role === 'staff');
  const mode = (rawMode === 'mine' && isStaffUser) ? 'admin' : rawMode;

  const open   = useQuery({ queryKey: ['open'], queryFn: volunteer.open, enabled: mode === 'open' });
  const mine   = useQuery({ queryKey: ['mine'], queryFn: volunteer.mine, enabled: mode === 'mine' });
  const adminQ = useQuery({ queryKey: ['admin-pickup', id], queryFn: () => admin.pickup(Number(id)), enabled: mode === 'admin' });
  const pickup: any = useMemo(() => {
    const pid = Number(id);
    if (mode === 'open') return open.data?.data.find((p) => Number(p.pickup_instance_id) === pid);
    if (mode === 'mine') return mine.data?.data.find((p) => Number(p.pickup_instance_id) === pid);
    if (mode === 'admin' && adminQ.data) {
      const a: any = adminQ.data;
      // Normalize admin row shape to the same fields PickupDetail expects.
      return {
        pickup_instance_id: a.id,
        scheduled_date: a.scheduled_date, scheduled_time: a.scheduled_time,
        status: a.status, suppliers: a.suppliers, is_one_time: false,
        food_description: a.food_description, estimated_quantity: null,
        supplier_address: a.supplier_address, supplier_phone: a.supplier_contact_phone,
        supplier_contact_name: a.supplier_contact_name, supplier_instructions: null,
        notes: a.notes, must_pickup_by: null, urgency_level: 'normal',
        slots_capacity: a.slots_capacity ?? 1, signups: [],
        assignment_id: 0, assignment_status: 'assigned',
      };
    }
    return null;
  }, [mode, id, open.data, mine.data, adminQ.data]);

  const claim = useMutation({ mutationFn: () => volunteer.claim(Number(id)),
    onSuccess: () => { qc.invalidateQueries(); nav(`/pickup/mine/${id}`, { replace: true }); },
    onError:   (e: any) => { /* error rendered below the CTA — no silent failure */ void e; } });
  const accept = useMutation({ mutationFn: () => volunteer.accept(pickup.assignment_id), onSuccess: () => qc.invalidateQueries() });
  const start  = useMutation({ mutationFn: () => volunteer.start(pickup.assignment_id),  onSuccess: () => qc.invalidateQueries() });
  const [showQtyPrompt, setShowQtyPrompt] = useState(false);
  const [qtyText, setQtyText]           = useState<string>('');
  const [photoUrl, setPhotoUrl]         = useState<string | null>(null);
  const [photoErr, setPhotoErr]         = useState<string | null>(null);
  const complete = useMutation({
    mutationFn: (opts: { quantity?: string; photoUrl?: string } = {}) => volunteer.complete(pickup.assignment_id, opts),
    onSuccess:  () => { qc.invalidateQueries(); nav(`/trip/${id}`); },
  });
  function onPhotoFile(file: File | null) {
    setPhotoErr(null);
    if (!file) { setPhotoUrl(null); return; }
    if (!/^image\//.test(file.type)) { setPhotoErr('Please choose an image file.'); return; }
    if (file.size > 800_000) { setPhotoErr('Photo too big — keep it under 800 KB.'); return; }
    const r = new FileReader();
    r.onload = () => setPhotoUrl(typeof r.result === 'string' ? r.result : null);
    r.onerror = () => setPhotoErr('Could not read the photo.');
    r.readAsDataURL(file);
  }

  if (!pickup) {
    return (
      <div className="min-h-screen">
        <div className="flex items-center px-5 py-3">
          <button onClick={() => nav(-1)} className="haptic"><ArrowLeft size={20} /></button>
        </div>
        <p className="text-center text-muted mt-12">Loading…</p>
      </div>
    );
  }

  const isOpen  = mode === 'open';
  const isAdmin = mode === 'admin';
  const stage = inferStage(pickup);
  const time = fmtTime(pickup.scheduled_time?.slice(0, 5));
  const stages = [
    { key: 'posted',    label: 'Posted by supplier',  ts: time && `${time} · ${pickup.suppliers ?? 'Donor'}` },
    { key: 'claimed',   label: isOpen ? 'Claim it' : 'Claimed by you', ts: isOpen ? undefined : 'Just now' },
    { key: 'en_route',  label: 'En route to pickup',  ts: stage === 2 ? 'Now' : undefined },
    { key: 'picked_up', label: 'Picked up' },
    { key: 'delivered', label: 'Delivered' },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      {/* App bar with back */}
      <div className="px-5 pt-3 pb-2 flex items-center justify-between">
        <button onClick={() => nav(-1)} className="haptic grid h-9 w-9 place-items-center rounded-full bg-paper border border-line"><ArrowLeft size={18} /></button>
        <Avatar initials="DG" />
      </div>

      <main className="flex-1 px-5 pb-4">
        <div className="text-[13px] font-bold uppercase tracking-[.06em] text-muted">
          Pickups <span className="text-forest">›</span> Detail
        </div>
        <h1 className="font-display font-semibold text-[34px] leading-[1.05] tracking-[-0.02em] mt-1.5">{pickup.suppliers || 'One-time donor'}</h1>
        <p className="text-muted text-[16px] mt-2">{pickup.food_description || (pickup.is_one_time ? 'One-time pickup' : 'Pickup')}</p>

        {/* Stat tiles */}
        <div className="flex gap-2.5 mt-4">
          <Stat n={pickup.estimated_quantity ?? '~6'} l="crates" />
          <Stat n="120" l="est. lbs" />
          <Stat n="2.4" l="mi away" />
        </div>

        {/* Drop-off meta row — after picking up, driver taps the address to
            open native maps navigation to the Airmont center. */}
        <div className="flex items-center gap-3 py-4 border-b border-line">
          <span className="grid h-[40px] w-[40px] place-items-center rounded-[10px] bg-sage text-forest"><User2 size={20} /></span>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-extrabold uppercase tracking-[.06em] text-muted">Heading to drop-off</div>
            <div className="text-[17px] font-bold mt-0.5">{DROPOFF.name}</div>
            <a href={DROPOFF_MAPS_URL} target="_blank" rel="noopener noreferrer"
               className="text-[13.5px] font-bold text-forest underline underline-offset-2 mt-0.5 inline-block">
              {DROPOFF.address}  ·  Open in Maps →
            </a>
          </div>
        </div>

        {/* Container chips */}
        <ChipLabel>Container</ChipLabel>
        <div className="flex flex-wrap gap-2">
          <span className="chip on">Crates</span>
          <span className="chip">Boxes</span>
          <span className="chip">Bags</span>
          <span className="chip">Trays</span>
        </div>

        {/* Drivers needed — admin can adjust here directly. Volunteers see the
            slot avatars + "N of M needed" badge as before. */}
        {isAdmin ? (
          <AdminSlotsControl pickupId={Number(id)} initial={pickup.slots_capacity ?? 1}
                             filled={(pickup.signups ?? []).length}
                             onChanged={() => qc.invalidateQueries()} />
        ) : pickup.slots_capacity > 1 ? (
          <>
            <ChipLabel>Sign-up slots</ChipLabel>
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
          <div className="bg-clay-soft border border-clay/30 rounded-[14px] px-4 py-3 text-[14px] font-bold text-clay">
            No driver claimed yet
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
                  <div className="text-[12.5px] text-muted">
                    {s.role === 'backup' ? 'Backup' : 'Primary'}{s.assignment_status ? ` · ${s.assignment_status}` : ''}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Timeline */}
        <ChipLabel>Status</ChipLabel>
        <StatusTimeline stages={stages} current={stage} />

        {/* Chat */}
        <ChipLabel>Chat</ChipLabel>
        <ChatPanel pickupId={Number(id)} />
      </main>

      {isAdmin ? (
        // No volunteer-only CTAs for staff; they manage via the portal.
        <div className="sticky bottom-0 px-4 py-3 bg-cream border-t border-line text-[12px] text-muted text-center">
          Admin view · use the live board to assign or reassign drivers
        </div>
      ) : (
        <>
          {(claim.error || accept.error || start.error || complete.error) && (
            <div className="sticky bottom-[64px] px-4 py-2 bg-clay-soft border-t border-clay/30 text-[13px] font-bold text-clay text-center">
              {((claim.error || accept.error || start.error || complete.error) as Error).message}
            </div>
          )}
          <StickyCTA tone={isOpen ? 'clay' : (stage === 2 ? 'forest' : 'clay')}
                     loading={claim.isPending || accept.isPending || start.isPending || complete.isPending}
                     onClick={() => {
                       if (isOpen) return claim.mutate();
                       // Stage 0 = admin-assigned but driver hasn't accepted yet; ack with accept.
                       // Stage 1 = accepted (self-claim lands here); next is "I'm on my way" (start).
                       // Stage 2 = en route; next is "Mark picked up" (complete → wraps as delivered).
                       if (stage === 0) return accept.mutate();
                       if (stage === 1) return start.mutate();
                       if (stage === 2 || stage === 3) {
                         // Ask for actual quantity so stats aren't estimates.
                         // Pre-seed with the pickup's estimated_quantity if it
                         // was posted with one.
                         setQtyText(pickup.estimated_quantity || '');
                         setShowQtyPrompt(true);
                         return;
                       }
                     }}>
            {isOpen ? 'Claim this pickup'
              : stage === 0 ? "Accept pickup"
              : stage === 1 ? "I'm on my way"
              : stage === 2 ? "Mark picked up"
              : stage === 3 ? "Mark delivered"
              : 'Completed'}
          </StickyCTA>
        </>
      )}

      {showQtyPrompt && (
        <div onClick={() => setShowQtyPrompt(false)}
             className="fixed inset-0 z-[3000] bg-ink/50 grid place-items-center p-4">
          <div onClick={(e) => e.stopPropagation()}
               className="bg-paper rounded-[18px] shadow-lift w-full max-w-sm p-5">
            <div className="font-display font-semibold text-[18px]">How much did you collect?</div>
            <p className="text-[12.5px] text-muted mt-1">
              Enter a rough quantity so the office can track total meals rescued.
              Examples: <span className="font-semibold">"8 trays"</span>, <span className="font-semibold">"3 boxes"</span>, <span className="font-semibold">"50 lbs"</span>.
            </p>
            <input value={qtyText} onChange={(e) => setQtyText(e.target.value)} autoFocus
                   placeholder="Quantity"
                   className="mt-4 w-full rounded-[10px] border-[1.4px] border-line-2 bg-paper px-3.5 py-2.5 text-[15px] font-semibold outline-none focus:border-forest" />
            <div className="mt-3">
              <div className="text-[11.5px] font-bold text-muted uppercase tracking-[.05em]">Proof photo <span className="normal-case font-normal">(optional)</span></div>
              <div className="mt-1.5 flex items-center gap-3">
                {photoUrl
                  ? <img src={photoUrl} alt="Proof" className="h-16 w-16 rounded-[10px] object-cover border border-line" />
                  : <div className="h-16 w-16 rounded-[10px] border border-dashed border-line-2 grid place-items-center text-[10px] font-bold text-muted">No photo</div>}
                <label className="haptic cursor-pointer rounded-[10px] border-[1.4px] border-line-2 bg-paper px-3 py-2 text-[12.5px] font-bold text-forest">
                  {photoUrl ? 'Retake…' : 'Take photo…'}
                  <input type="file" accept="image/*" capture="environment"
                         onChange={(e) => onPhotoFile(e.target.files?.[0] ?? null)} className="hidden" />
                </label>
                {photoUrl && (
                  <button type="button" onClick={() => setPhotoUrl(null)}
                          className="text-[12px] font-bold text-clay">Remove</button>
                )}
              </div>
              {photoErr && <p className="text-[11.5px] text-clay mt-1">{photoErr}</p>}
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => { setShowQtyPrompt(false); complete.mutate({}); }}
                      className="haptic text-[12.5px] font-bold text-muted px-3 py-2">Skip</button>
              <button onClick={() => { setShowQtyPrompt(false); complete.mutate({ quantity: qtyText.trim() || undefined, photoUrl: photoUrl || undefined }); }}
                      disabled={complete.isPending}
                      className="haptic text-[12.5px] font-bold bg-forest text-paper px-4 py-2 rounded-[10px] shadow-ctag">
                {complete.isPending ? 'Saving…' : 'Save & complete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function inferStage(p: any) {
  if (!p) return 0;
  if (p.status === 'completed' || p.status === 'delivered') return 4;
  if (p.status === 'picked_up') return 3;
  if (p.status === 'in_progress' || p.status === 'en_route') return 2;
  if (p.assignment_status === 'accepted' || p.status === 'confirmed') return 1;
  return 0;
}

function Stat({ n, l }: { n: string | number; l: string }) {
  return (
    <div className={cx('flex-1 bg-sage border border-sage-line rounded-[14px] px-4 py-4')}>
      <div className="font-display font-bold text-[28px] text-forest leading-none">{n}</div>
      <div className="text-[13px] font-bold text-muted mt-1.5">{l}</div>
    </div>
  );
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
        {isLoading ? <div className="text-center text-muted text-[12px] py-4">Loading…</div> :
         (data?.data.length ?? 0) === 0 ? <div className="text-center text-muted text-[12px] py-4">No messages yet. Say hi 👋</div> :
         data?.data.map((m) => {
           const mine = m.author_user_id === me?.id;
           return (
             <div key={m.id} className={cx('flex', mine ? 'justify-end' : 'justify-start')}>
               <div className={cx('max-w-[78%] rounded-[14px] px-3 py-2 text-[13px]',
                                  mine ? 'bg-forest text-paper' : 'bg-sage text-ink')}>
                 {!mine && <div className="text-[10.5px] font-bold opacity-70">{m.first_name} {m.last_name}</div>}
                 <div>{m.body}</div>
               </div>
             </div>
           );
         })}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); if (text.trim()) send.mutate(text.trim()); }}
            className="flex items-center gap-2 px-3 py-2 border-t border-line bg-paper">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Message…"
               className="flex-1 bg-cream/50 rounded-[10px] px-3 py-2 text-[13px] outline-none focus:bg-paper border border-line focus:border-forest" />
        <button type="submit" disabled={!text.trim() || send.isPending}
                className="haptic grid h-9 w-9 place-items-center rounded-[10px] bg-forest text-paper disabled:opacity-40">
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
