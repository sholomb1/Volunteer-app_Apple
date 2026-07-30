/**
 * Supplier "Post a Pickup" — chip selectors (multi-select for food type and
 * container, each with an "Other" free-text), quantity slider up to 100,
 * ready-from/ready-till window, refrigerated toggle, custom notes, optional
 * photo, clay CTA at the bottom.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Camera } from 'lucide-react';
import { supplier, type AuthUser } from '../api';
import { AppBar, Avatar, StickyCTA, cx } from '../design';

const FOOD_TYPES = ['Produce', 'Bakery', 'Dairy', 'Prepared', 'Dry goods', 'Other'];
const CONTAINERS = ['Boxes', 'Bags', 'Trays', 'Crates', 'Other'];

export function SupplierPost({ user }: { user: AuthUser }) {
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
  const [refrigerated, setRefrigerated] = useState<boolean>(false);
  const [notes, setNotes] = useState<string>('');

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
    if (refrigerated) parts.push('refrigerated');
    if (notes.trim())  parts.push(notes.trim());
    return parts.join(' · ');
  })();

  const notify = useMutation({
    mutationFn: () => supplier.notify({
      kind: 'ready',
      time: readyFrom,
      readyTill: readyTill && readyTill > readyFrom ? readyTill : undefined,
      notes: noteText,
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

        {/* Refrigerated */}
        <div className="mt-4 rounded-[12px] border-[1.4px] border-line-2 px-3.5 py-3 flex items-center justify-between">
          <div>
            <div className="font-bold text-[13px]">Refrigerated</div>
            <div className="text-[11px] text-muted">Tell the driver to bring a cooler</div>
          </div>
          <button onClick={() => setRefrigerated((v) => !v)} aria-label="Refrigerated"
                  className={cx('relative w-[42px] h-[24px] rounded-full transition-colors',
                                refrigerated ? 'bg-forest' : 'bg-line')}>
            <span className={cx('absolute top-[3px] h-[18px] w-[18px] rounded-full bg-paper transition-all',
                                refrigerated ? 'right-[3px]' : 'left-[3px]')} />
          </button>
        </div>

        {/* Custom notes */}
        <Field label="Notes for the driver (optional)">
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
                    placeholder="Loading dock around back, ring bell, please bring crates back…"
                    className="w-full rounded-[12px] border-[1.4px] border-line-2 bg-paper px-3.5 py-2.5 text-[14px] outline-none focus:border-forest resize-none" />
        </Field>

        {/* Photo */}
        <button type="button"
                className="mt-3 w-full border-[1.6px] border-dashed border-line-2 rounded-[14px] h-[74px] grid place-items-center text-muted text-[12px] font-semibold gap-1.5">
          <Camera size={20} />
          Add a photo
        </button>
      </main>

      <StickyCTA tone="forest" loading={notify.isPending} onClick={() => notify.mutate()}>
        Post pickup → notify drivers
      </StickyCTA>
    </div>
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
