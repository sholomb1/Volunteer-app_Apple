/**
 * Supplier "Post a Pickup" — chip selectors (multi-select for food type and
 * container, each with an "Other" free-text), quantity slider up to 100,
 * ready-from/ready-till window, refrigerated toggle, custom notes, optional
 * photo, clay CTA at the bottom.
 *
 * Also serves as the EDIT form (client Aug 7 abc783): when the route matches
 * /supplier/pickups/:id/edit, we prefill from GET /me/supplier-pickups/:id and
 * PATCH on save instead of POST /supplier/notify. The edit UI hides the
 * chip-quantity-container synthesizer (those don't round-trip from a stored
 * notes string) and shows the actual editable columns directly.
 */
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Camera } from 'lucide-react';
import { supplier, type AuthUser } from '../api';
import { AppBar, Avatar, StickyCTA, cx } from '../design';

const FOOD_TYPES = ['Produce', 'Bakery', 'Dairy', 'Prepared', 'Dry goods', 'Other'];
const CONTAINERS = ['Boxes', 'Bags', 'Trays', 'Crates', 'Other'];

export function SupplierPost({ user }: { user: AuthUser }) {
  const params = useParams<{ id?: string }>();
  const editingId = params.id ? Number(params.id) : null;
  const isEditing = editingId != null && Number.isFinite(editingId);
  if (isEditing) return <SupplierEdit id={editingId!} user={user} />;
  return <SupplierCreate user={user} />;
}

function SupplierCreate({ user }: { user: AuthUser }) {
  const nav = useNavigate();
  const qc = useQueryClient();

  // Both as Sets so users can pick more than one.
  const [foodTypes, setFoodTypes] = useState<Set<string>>(new Set(['Prepared']));
  const [containers, setContainers] = useState<Set<string>>(new Set(['Trays']));
  const [foodOther, setFoodOther] = useState<string>('');
  const [containerOther, setContainerOther] = useState<string>('');
  const [qty, setQty] = useState<number>(4);
  const [readyFrom, setReadyFrom] = useState<string>(() => defaultTime(0));
  const [readyTill, setReadyTill] = useState<string>(() => defaultTime(120));
  const [notes, setNotes] = useState<string>('');
  // C11 Aug 13 — photo upload was a decorative box before this. State is a
  // data URL; server accepts up to ~2 MB after our schema bump.
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoErr, setPhotoErr] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  async function handleFile(f: File | null | undefined) {
    setPhotoErr(null);
    if (!f) return;
    if (!f.type.startsWith('image/')) { setPhotoErr('Please choose an image file.'); return; }
    if (f.size > 4 * 1024 * 1024) { setPhotoErr('Photo is too large (max 4 MB).'); return; }
    const reader = new FileReader();
    reader.onload = () => setPhotoUrl(typeof reader.result === 'string' ? reader.result : null);
    reader.onerror = () => setPhotoErr('Could not read that photo — try another.');
    reader.readAsDataURL(f);
  }

  const toggle = (set: Set<string>, value: string, write: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value); else next.add(value);
    if (next.size === 0) next.add(value);   // keep at least one selected
    write(next);
  };

  const foodLabel = (() => {
    const xs = [...foodTypes].map((f) => f === 'Other' ? (foodOther.trim() || 'other') : f.toLowerCase());
    return xs.join(' + ');
  })();
  const containerLabel = (() => {
    const xs = [...containers].map((c) => c === 'Other' ? (containerOther.trim() || 'other') : c.toLowerCase());
    return xs.join(' + ');
  })();
  // Used to pluralize the slider unit. If "Other" is the only container, fall
  // back to a neutral "items" word; otherwise grab the first concrete name.
  const unit = (() => {
    const concrete = [...containers].find((c) => c !== 'Other');
    if (concrete) return concrete.toLowerCase();
    return (containerOther.trim() || 'items').toLowerCase();
  })();

  const noteText = (() => {
    const parts: string[] = [
      `${qty} ${unit} · ${foodLabel}`,
      `containers: ${containerLabel}`,
    ];
    if (notes.trim())  parts.push(notes.trim());
    return parts.join(' · ');
  })();

  const notify = useMutation({
    mutationFn: () => supplier.notify({
      kind: 'ready',
      time: readyFrom,
      readyTill: readyTill && readyTill > readyFrom ? readyTill : undefined,
      notes: noteText,
      photoUrl: photoUrl || undefined,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['supplier-pickups'] }); nav('/', { replace: true }); },
  });

  return (
    <div className="min-h-screen flex flex-col">
      <div className="px-5 pt-3 pb-2 flex items-center justify-between">
        <button onClick={() => nav(-1)} className="haptic grid h-9 w-9 place-items-center rounded-full bg-paper border border-line"><ArrowLeft size={18} /></button>
        <Avatar initials={(user.firstName?.[0] ?? 'R') + (user.lastName?.[0] ?? 'K')} />
      </div>
      <AppBar title="New Pickup" leftMark="ז" altMark right={null} />

      <main className="px-5 flex-1 pb-2">
        <div className="text-[11px] font-bold text-muted">Rockland Kosher Market</div>
        <h1 className="font-display font-semibold text-[25px] leading-[1.05] mt-0.5">What's ready?</h1>

        {/* Food type chips (multi-select) */}
        <Field label="Food type · pick all that apply">
          <div className="flex flex-wrap gap-2">
            {FOOD_TYPES.map((f) => (
              <button key={f} type="button" onClick={() => toggle(foodTypes, f, setFoodTypes)}
                      className={cx('chip', foodTypes.has(f) && 'clay-on')}>{f}</button>
            ))}
          </div>
          {foodTypes.has('Other') && (
            <input value={foodOther} onChange={(e) => setFoodOther(e.target.value)}
                   placeholder="Describe (e.g. cooked rice, deli meats)"
                   className="mt-2 w-full rounded-[12px] border-[1.4px] border-line-2 bg-paper px-3.5 py-2.5 text-[14px] outline-none focus:border-forest" />
          )}
        </Field>

        {/* Quantity — plain number input. Donors type the actual count rather
            than dragging a slider; no upper bound. */}
        <Field label={<>Quantity · <span className="font-display font-bold text-[18px] text-forest">{qty} {unit}</span></>}>
          <div className="flex items-center gap-2 mt-1">
            <input type="number" inputMode="numeric" min={0} value={qty}
                   onChange={(e) => setQty(Math.max(0, Number(e.target.value) || 0))}
                   className="w-32 rounded-[12px] border-[1.4px] border-line-2 bg-paper px-3.5 py-2.5 text-[18px] font-display font-bold text-forest outline-none focus:border-forest" />
            <span className="text-[13px] font-bold text-muted">{unit}</span>
          </div>
        </Field>

        {/* Container chips (multi-select) */}
        <Field label="Container · pick all that apply">
          <div className="flex flex-wrap gap-2">
            {CONTAINERS.map((c) => (
              <button key={c} type="button" onClick={() => toggle(containers, c, setContainers)}
                      className={cx('chip', containers.has(c) && 'clay-on')}>{c}</button>
            ))}
          </div>
          {containers.has('Other') && (
            <input value={containerOther} onChange={(e) => setContainerOther(e.target.value)}
                   placeholder="Describe (e.g. catering pans, vacuum bags)"
                   className="mt-2 w-full rounded-[12px] border-[1.4px] border-line-2 bg-paper px-3.5 py-2.5 text-[14px] outline-none focus:border-forest" />
          )}
        </Field>

        {/* Pickup window — from + till */}
        <Field label="Pickup window">
          <div className="grid grid-cols-2 gap-2">
            <label className="rounded-[12px] border-[1.4px] border-line-2 px-3.5 py-3 text-[13px] font-semibold">
              <div className="text-[10.5px] font-extrabold uppercase tracking-[.05em] text-muted">Ready from</div>
              <input type="time" value={readyFrom} onChange={(e) => setReadyFrom(e.target.value)}
                     className="w-full bg-transparent outline-none text-[14px] font-semibold mt-0.5" />
            </label>
            <label className="rounded-[12px] border-[1.4px] border-line-2 px-3.5 py-3 text-[13px] font-semibold">
              <div className="text-[10.5px] font-extrabold uppercase tracking-[.05em] text-muted">Available till</div>
              <input type="time" value={readyTill} onChange={(e) => setReadyTill(e.target.value)}
                     className="w-full bg-transparent outline-none text-[14px] font-semibold mt-0.5" />
            </label>
          </div>
          {readyTill && readyTill <= readyFrom && (
            <div className="text-[11.5px] font-bold text-clay mt-1.5">End time must be after start time.</div>
          )}
        </Field>

        {/* Custom notes */}
        <Field label="Notes for the driver (optional)">
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
                    placeholder="Loading dock around back, ring bell, please bring crates back…"
                    className="w-full rounded-[12px] border-[1.4px] border-line-2 bg-paper px-3.5 py-2.5 text-[14px] outline-none focus:border-forest resize-none" />
        </Field>

        {/* Photo — C11 Aug 13. Wraps a hidden <input type=file> so clicking
            anywhere on the box opens the picker (or the camera on mobile via
            capture=environment). Also accepts a drop. Data URL is inlined so
            the office sees the photo without an upload roundtrip. */}
        <label htmlFor="supplier-post-photo"
               onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
               onDragLeave={() => setDragActive(false)}
               onDrop={(e) => { e.preventDefault(); setDragActive(false); handleFile(e.dataTransfer.files?.[0]); }}
               className={cx('mt-3 w-full block cursor-pointer border-[1.6px] border-dashed rounded-[14px] transition',
                             photoUrl ? 'p-2 bg-sage/30 border-forest'
                                      : (dragActive ? 'border-forest bg-sage/40 text-forest' : 'border-line-2 text-muted'),
                             !photoUrl && 'h-[74px] grid place-items-center text-[12px] font-semibold gap-1.5')}>
          {photoUrl ? (
            <div className="flex items-center gap-3">
              <img src={photoUrl} alt="Selected photo" className="h-[70px] w-[70px] rounded-[10px] object-cover border border-line" />
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-bold text-ink">Photo attached</div>
                <div className="text-[11.5px] text-muted mt-0.5">Tap the image to replace it.</div>
              </div>
              <button type="button"
                      onClick={(e) => { e.preventDefault(); setPhotoUrl(null); setPhotoErr(null); }}
                      className="text-[12px] font-bold text-clay px-2 py-1">Remove</button>
            </div>
          ) : (
            <span className="inline-flex items-center gap-1.5"><Camera size={20} /> Add a photo (optional)</span>
          )}
          <input id="supplier-post-photo" type="file" accept="image/*" capture="environment"
                 className="hidden"
                 onChange={(e) => handleFile(e.target.files?.[0])} />
        </label>
        {photoErr && <div className="mt-1.5 text-[11.5px] text-clay font-semibold">{photoErr}</div>}
      </main>

      <StickyCTA tone="forest" loading={notify.isPending} onClick={() => notify.mutate()}>
        Post pickup → notify drivers
      </StickyCTA>
    </div>
  );
}

// ==========================================================================
// Edit mode — supplier can revise their existing pickup (client Aug 7 abc783).
// Simpler UI than the create flow because the create flow synthesizes notes
// from chip choices that don't round-trip cleanly; here we show the actual
// stored columns as plain inputs so the supplier can adjust exactly what
// they need to and Save.
// ==========================================================================
function SupplierEdit({ id, user }: { id: number; user: AuthUser }) {
  const nav = useNavigate();
  const qc = useQueryClient();

  const q = useQuery({ queryKey: ['supplier-pickup', id], queryFn: () => supplier.get(id) });

  const [donorName, setDonorName] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [pickupAddress, setPickupAddress] = useState('');
  const [pickupInstructions, setPickupInstructions] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [foodDescription, setFoodDescription] = useState('');
  const [estimatedQuantity, setEstimatedQuantity] = useState('');
  const [notes, setNotes] = useState('');
  const [statusGuard, setStatusGuard] = useState<string>('');
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const p = q.data?.data;
    if (!p) return;
    setDonorName(p.donor_name ?? '');
    setContactName(p.contact_name ?? '');
    setContactPhone(p.contact_phone ?? '');
    setPickupAddress(p.pickup_address ?? '');
    setPickupInstructions(p.pickup_instructions ?? '');
    setScheduledDate(String(p.scheduled_date ?? '').slice(0, 10));
    setScheduledTime(String(p.scheduled_time ?? '').slice(0, 5));
    setFoodDescription(p.food_description ?? '');
    setEstimatedQuantity(p.estimated_quantity ?? '');
    setNotes(p.notes ?? '');
    setStatusGuard(String(p.status ?? ''));
  }, [q.data]);

  const save = useMutation({
    mutationFn: () => supplier.edit(id, {
      donorName: donorName || null,
      contactName: contactName || null,
      contactPhone: contactPhone || null,
      pickupAddress: pickupAddress || null,
      pickupInstructions: pickupInstructions || null,
      scheduledDate: scheduledDate || undefined,
      scheduledTime: scheduledTime || undefined,
      foodDescription: foodDescription || null,
      estimatedQuantity: estimatedQuantity || null,
      notes: notes || null,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['supplier-pickups'] });
      qc.invalidateQueries({ queryKey: ['supplier-pickup', id] });
      nav('/', { replace: true });
    },
    onError: (e: any) => setErr(e?.message || 'Save failed'),
  });

  const readOnlyReason = (() => {
    if (!statusGuard) return null;
    if (['pending', 'scheduled', 'confirmed'].includes(statusGuard)) return null;
    return `This pickup is ${statusGuard}. You can only edit while it's pending, scheduled, or confirmed.`;
  })();

  return (
    <div className="min-h-screen flex flex-col">
      <div className="px-5 pt-3 pb-2 flex items-center justify-between">
        <button onClick={() => nav(-1)} className="haptic grid h-9 w-9 place-items-center rounded-full bg-paper border border-line"><ArrowLeft size={18} /></button>
        <Avatar initials={(user.firstName?.[0] ?? 'R') + (user.lastName?.[0] ?? 'K')} />
      </div>
      <AppBar title="Edit Pickup" leftMark="ז" altMark right={null} />

      <main className="px-5 flex-1 pb-2">
        <h1 className="font-display font-semibold text-[22px] leading-[1.05] mt-0.5">Edit this pickup</h1>
        {q.isLoading && <div className="mt-4 text-[13px] text-muted">Loading…</div>}
        {q.isError && <div className="mt-4 text-[13px] text-clay font-bold">Couldn't load: {(q.error as any)?.message || 'unknown'}</div>}
        {readOnlyReason && <div className="mt-4 text-[13px] text-clay font-bold">{readOnlyReason}</div>}

        {q.data && (
          <>
            <Field label="Store / Hall name (shows on driver text)">
              <TextInput value={donorName} onChange={setDonorName} placeholder="e.g. Kroger Airmont" />
            </Field>
            <Field label="Contact name (goes to driver on accept)">
              <TextInput value={contactName} onChange={setContactName} placeholder="Person we can reach if the driver has trouble" />
            </Field>
            <Field label="Contact phone (goes to driver on accept)">
              <TextInput value={contactPhone} onChange={setContactPhone} placeholder="(845) 555-1234" />
            </Field>
            <Field label="Pickup address">
              <TextInput value={pickupAddress} onChange={setPickupAddress} placeholder="Street, city, state" />
            </Field>
            <Field label="Access / pickup instructions">
              <textarea value={pickupInstructions} onChange={(e) => setPickupInstructions(e.target.value)} rows={2}
                        placeholder="Loading dock on the side, ring bell twice…"
                        className="w-full rounded-[12px] border-[1.4px] border-line-2 bg-paper px-3.5 py-2.5 text-[14px] outline-none focus:border-forest resize-none" />
            </Field>
            <Field label="Pickup date + time">
              <div className="grid grid-cols-2 gap-2">
                <input type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)}
                       className="rounded-[12px] border-[1.4px] border-line-2 bg-paper px-3.5 py-2.5 text-[14px] outline-none focus:border-forest" />
                <input type="time" value={scheduledTime} onChange={(e) => setScheduledTime(e.target.value)}
                       className="rounded-[12px] border-[1.4px] border-line-2 bg-paper px-3.5 py-2.5 text-[14px] outline-none focus:border-forest" />
              </div>
            </Field>
            <Field label="Food description">
              <textarea value={foodDescription} onChange={(e) => setFoodDescription(e.target.value)} rows={2}
                        placeholder='e.g. "6 trays chicken, 2 trays rice"'
                        className="w-full rounded-[12px] border-[1.4px] border-line-2 bg-paper px-3.5 py-2.5 text-[14px] outline-none focus:border-forest resize-none" />
            </Field>
            <Field label="Estimated quantity">
              <TextInput value={estimatedQuantity} onChange={setEstimatedQuantity} placeholder='e.g. "8 trays" or "2 bins"' />
            </Field>
            <Field label="Notes for the driver">
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
                        placeholder="parking, gate code, ring the doorbell, etc."
                        className="w-full rounded-[12px] border-[1.4px] border-line-2 bg-paper px-3.5 py-2.5 text-[14px] outline-none focus:border-forest resize-none" />
            </Field>
            {err && <div className="mt-3 text-[13px] text-clay font-bold">{err}</div>}
          </>
        )}
      </main>

      <StickyCTA tone="forest" loading={save.isPending}
                 onClick={() => { setErr(null); save.mutate(); }}>
        Save changes
      </StickyCTA>
    </div>
  );
}

function TextInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
           className="w-full rounded-[12px] border-[1.4px] border-line-2 bg-paper px-3.5 py-2.5 text-[14px] outline-none focus:border-forest" />
  );
}

function Field({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <div className="text-[10.5px] font-extrabold uppercase tracking-[.05em] text-muted mb-2">{label}</div>
      {children}
    </div>
  );
}

function defaultTime(offsetMinutes: number) {
  const d = new Date();
  d.setMinutes(d.getMinutes() + offsetMinutes);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
