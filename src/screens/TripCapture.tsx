/**
 * Trip capture — second phone in mockup 02. Auto-filled from the pickup
 * trajectory: store name, miles, minutes. Every field is editable before
 * Save (auto-with-edit pattern). Writes to /api/me/my-trips idempotently.
 */
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeft, Route, Clock } from 'lucide-react';
import { volunteer, getUser } from '../api';
import { Avatar } from '../design';
import { driverError, useBack } from './driver-card';

export function TripCapture() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const back = useBack(); // Oct 9 client: opened from a notification → Back goes home
  const piId = Number(id);

  const mine = useQuery({ queryKey: ['mine'], queryFn: volunteer.mine });
  const pickup = mine.data?.data.find((p) => Number(p.pickup_instance_id) === piId);

  // Tier-1 fix (Aug 21): never seed made-up numbers. Blank fields are sent as
  // undefined and skipped by the backend.
  const [miles, setMiles] = useState<string>('');
  const [minutes, setMinutes] = useState<string>('');

  const save = useMutation({
    mutationFn: () => volunteer.saveActivity({
      pickupInstanceId: piId,
      miles:   miles   ? Number(miles)   : undefined,
      minutes: minutes ? Number(minutes) : undefined,
    }),
    onSuccess: () => nav('/you', { replace: true }),
  });

  if (!pickup && mine.isLoading) return <div className="p-6 text-center text-muted">Loading…</div>;

  const store = pickup?.suppliers || 'Pickup';

  return (
    <div className="min-h-screen flex flex-col">
      <div className="px-5 pt-3 pb-2 flex items-center justify-between">
        <button onClick={back} aria-label="Back" className="haptic grid h-11 w-11 place-items-center rounded-full bg-paper border border-line"><ArrowLeft size={20} /></button>
        <Avatar initials={((getUser()?.firstName?.[0] ?? '') + (getUser()?.lastName?.[0] ?? '')) || '·'} />
      </div>

      <main className="flex-1 px-5 pb-4">
        {/* Oct 8: no drawn route or "logged automatically" — nothing is tracked
            here. The driver may type miles/time, or just skip. */}
        <div className="rounded-[16px] bg-sage border border-sage-line px-4 py-3 text-center">
          <div className="font-display font-bold text-[20px] text-forest">Thank you! Delivery saved.</div>
          <div className="text-[15px] text-ink/80 mt-0.5 truncate">{store}</div>
        </div>

        <div className="mt-6 font-display font-semibold text-[22px]">How far did you drive? <span className="text-muted text-[17px] font-normal">(optional)</span></div>
        <p className="text-[15px] text-muted mt-1">This helps the office. You can skip it.</p>

        <div className="mt-4 space-y-3">
          <label className="flex items-center gap-3 rounded-[14px] border border-line bg-paper px-4 py-3">
            <span className="grid h-[36px] w-[36px] place-items-center rounded-[10px] bg-sky-soft text-sky shrink-0"><Route size={18} /></span>
            <span className="flex-1 text-[16px] font-bold">Miles</span>
            <input type="number" inputMode="decimal" step="0.1" min="0" value={miles} onChange={(e) => setMiles(e.target.value)}
                   placeholder="0"
                   className="w-24 text-right font-display font-bold text-[18px] bg-cream/70 px-2 py-2 rounded-md outline-none focus:ring-2 focus:ring-forest/30" />
          </label>
          <label className="flex items-center gap-3 rounded-[14px] border border-line bg-paper px-4 py-3">
            <span className="grid h-[36px] w-[36px] place-items-center rounded-[10px] bg-amber-soft text-amber shrink-0"><Clock size={18} /></span>
            <span className="flex-1 text-[16px] font-bold">Minutes</span>
            <input type="number" inputMode="numeric" min="0" value={minutes} onChange={(e) => setMinutes(e.target.value)}
                   placeholder="0"
                   className="w-24 text-right font-display font-bold text-[18px] bg-cream/70 px-2 py-2 rounded-md outline-none focus:ring-2 focus:ring-forest/30" />
          </label>
        </div>
        {save.error && <p className="text-[14px] font-bold text-clay mt-3">{driverError(save.error)}</p>}
      </main>

      <div className="sticky bottom-0 px-4 pb-safe pt-3 bg-cream flex gap-2">
        {/* Oct 9 client: one big Skip — it is the main button until they type miles or minutes. */}
        <button onClick={() => nav('/you', { replace: true })}
                className={(!miles && !minutes)
                  ? 'haptic flex-[2] min-h-[58px] rounded-[14px] bg-forest text-paper text-[19px] font-bold shadow-ctag'
                  : 'haptic flex-1 min-h-[54px] rounded-[14px] border-[1.5px] border-line-2 bg-paper text-[17px] font-bold text-ink'}>
          Skip
        </button>
        <button onClick={() => save.mutate()} disabled={save.isPending || (!miles && !minutes)}
                className={(!miles && !minutes)
                  ? 'haptic flex-1 min-h-[58px] rounded-[14px] border-[1.5px] border-line-2 bg-paper text-[17px] font-bold text-muted disabled:opacity-50'
                  : 'haptic flex-[2] min-h-[54px] rounded-[14px] bg-forest text-paper text-[17px] font-bold shadow-ctag disabled:opacity-50'}>
          {save.isPending ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}
