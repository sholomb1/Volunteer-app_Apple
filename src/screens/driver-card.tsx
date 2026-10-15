/**
 * Oct 6 client: one simple pickup card for the driver app (Home + Pickups).
 * Time · store, address, food, then "Needs 1 driver" + Take — or, for the
 * driver's own pickups, Navigate + Call. Tap the card for full details.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { volunteer, type OpenPickup, type MyPickup } from '../api';
import { fmtTime, nyToday, driverShowsNow } from '../time-format';
import { uiConfirm, uiNotify } from '../ui-dialogs';
import { Card, StatusPill, cx } from '../design';
import { DROPOFF } from '../dropoff';
import { StorePhotoThumb } from '../store-photo'; // Oct 14 client

export function shortAddress(a: string | null | undefined): string {
  if (!a) return '';
  return String(a).replace(/,?\s*(USA|United States)\.?\s*$/i, '').trim();
}
export function storeName(p: OpenPickup | MyPickup): string {
  // Oct 7 client: no store name → show the address, not a generic label.
  return p.suppliers || shortAddress(p.supplier_address) || (p.is_one_time ? 'One-time pickup' : 'Pickup');
}
function mapsLink(addr: string) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addr)}`;
}

/** Oct 9 client: never show "Failed to fetch" / "Load failed" to a driver. */
export const NO_SIGNAL_TEXT = "Can't connect — check your signal and try again.";
export function driverError(e: any, fallback = 'Something went wrong. Please try again.'): string {
  const msg = String(e?.message ?? '').trim();
  if (e?.status === 0 || e instanceof TypeError || /failed to fetch|load failed|network|can't reach the server/i.test(msg)) return NO_SIGNAL_TEXT;
  return msg || fallback;
}

/** Oct 9 client: Back from a notification has no history — go to driver home instead of nowhere. */
export function useBack() {
  const nav = useNavigate();
  const loc = useLocation();
  return () => {
    if (window.history.length <= 1 || loc.key === 'default') nav('/', { replace: true });
    else nav(-1);
  };
}

/** Oct 9 client: "Done — dropped off" from the card — one confirm, same call as the Delivered step. */
export function useFinishPickup() {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: (p: MyPickup) => volunteer.complete(p.assignment_id, {}),
    onSuccess: () => { qc.invalidateQueries(); uiNotify('Thank you! Delivery saved.', 'ok'); },
    onError: (e: any) => { qc.invalidateQueries({ queryKey: ['mine'] }); uiNotify(driverError(e), 'err'); },
  });
  async function finish(p: MyPickup) {
    const ok = await uiConfirm(`Done — dropped off?\n\n${storeName(p)}`, { okLabel: 'Yes, dropped off', cancelLabel: 'No' });
    if (ok) m.mutate(p);
  }
  return { finish, busy: m.isPending };
}

/** Oct 8: "Today · 3:30 PM" / "Tomorrow · 9:00 AM" / "Thu, Oct 9 · 9:00 AM" (New York day, 12-hour). */
export function fmtWhenLine(date: string | null | undefined, time: string | null | undefined, status?: string | null, keepTime = false): string {
  // Oct 13 client: a reposted / late pickup still to do is "now", not last night's time.
  if (!keepTime && driverShowsNow({ scheduled_date: date, scheduled_time: time, status })) return String(status) === 'picked_up' ? 'Now · take it to the drop-off' : 'Now · ready for pickup'; // Oct 14 client: was "ready for pickup" after Picked up
  const t = fmtTime(time ? String(time).slice(0, 5) : '');
  const key = date ? String(date).slice(0, 10) : '';
  let day = '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(key)) {
    const today = nyToday();
    const shift = (iso: string, n: number) => new Date(Date.parse(iso + 'T12:00:00Z') + n * 86400e3).toISOString().slice(0, 10);
    day = key === today ? 'Today'
      : key === shift(today, 1) ? 'Tomorrow'
      : key === shift(today, -1) ? 'Yesterday'
      : new Date(key + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
  }
  return [day, t].filter(Boolean).join(' · ');
}

// Oct 14 client: plain words, never the server's "already claimed by you".
function takeError(e: any): string {
  const m = String(e?.message ?? '');
  if (/already claimed by you|already signed up/i.test(m)) return 'This pickup is already yours. See Pickups → Mine.';
  if (/opens |isn't open yet/i.test(m)) return m; // Oct 14 client: "This pickup opens at 3:00 PM — we'll text you then."
  if (/already claimed|full|no longer|not open/i.test(m) || e?.status === 409) return 'Someone else just took it.';
  return driverError(e, 'Someone else just took it.');
}

type Takeable = Pick<OpenPickup, 'pickup_instance_id' | 'slots_capacity' | 'scheduled_date' | 'scheduled_time' | 'suppliers' | 'supplier_address' | 'is_one_time'>;

/** Take a pickup: one confirm, then claim (1 driver) or sign up (2+ drivers).
 *  Used by the cards AND the pickup detail screen so both work the same way. */
export function useTakePickup(onDone?: (p: Takeable) => void) {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: (p: Takeable) => ((p.slots_capacity ?? 1) > 1 ? volunteer.signup(Number(p.pickup_instance_id)) : volunteer.claim(Number(p.pickup_instance_id))),
    onSuccess: (_r, p) => { qc.invalidateQueries(); uiNotify("It's yours! You can find it under Your pickups.", 'ok'); onDone?.(p); },
    onError: (e: any) => { qc.invalidateQueries({ queryKey: ['open'] }); qc.invalidateQueries({ queryKey: ['mine'] }); uiNotify(takeError(e), 'err'); },
  });
  async function take(p: Takeable) {
    const when = fmtWhenLine(p.scheduled_date, p.scheduled_time);
    const ok = await uiConfirm(`Take this pickup?\n\n${storeName(p as OpenPickup)}${when ? `\n${when}` : ''}`,
                               { okLabel: "Yes, I'll take it", cancelLabel: 'No' });
    if (ok) m.mutate(p);
  }
  return { take, busy: m.isPending };
}

export function DriverCard({ p, mine, onOpen, onTake, busy }: {
  p: OpenPickup | MyPickup;
  mine?: boolean;
  onOpen: () => void;
  onTake?: () => void;
  busy?: boolean;
}) {
  const time = driverShowsNow(p) ? 'Now' : (fmtTime(p.scheduled_time?.slice(0, 5)) || ''); // Oct 13 client: reposted / late → "Now"
  const addr = shortAddress(p.supplier_address);
  // Oct 14 client: once picked up, Navigate goes to the drop-off (a delivery: the family), not back to the store.
  const pickedUp = p.status === 'picked_up';
  const navAddr = pickedUp ? (String((p as any).delivery_to_address || '') || DROPOFF.address) : (p.supplier_address || addr);
  const food = p.food_description || p.estimated_quantity || '';
  const cap = p.slots_capacity || 1;
  const need = Math.max(0, cap - (p.signups?.length ?? 0));
  const phone = (p.supplier_phone || '').split(',')[0].trim();
  const finished = ['completed', 'delivered', 'cancelled', 'missed'].includes(p.status);
  // Oct 9 client: one-tap finish on the driver's own pickup (today or earlier, already said yes to).
  const { finish, busy: finishing } = useFinishPickup();
  const mp = p as MyPickup;
  const canFinish = !!mine && !finished && mp.assignment_status === 'accepted'
    && !!p.scheduled_date && String(p.scheduled_date).slice(0, 10) <= nyToday();
  return (
    <Card onClick={onOpen} className="!p-4">
      <div className="flex items-baseline gap-2 min-w-0">
        {time && <span className="font-display font-bold text-[15px] text-forest shrink-0">{time}</span>}
        <span className="font-bold text-[15px] text-ink truncate">{storeName(p)}</span>
        {mine && <span className="ml-auto shrink-0"><StatusPill status={p.status} /></span>}
      </div>
      {addr && <div className="text-[13px] text-ink/75 mt-1 truncate">{addr}</div>}
      {/* Oct 14 client: small 📷 thumbnail when the store added a photo (tap = full screen). */}
      {p.store_photo_url ? (
        <div className="flex items-center gap-2 mt-1 min-w-0">
          <StorePhotoThumb url={p.store_photo_url} size={36} />
          {food && <div className="text-[13px] text-muted line-clamp-1 min-w-0">{food}</div>}
        </div>
      ) : food && <div className="text-[13px] text-muted mt-0.5 line-clamp-1">{food}</div>}
      {!(mine && finished) && <div className="mt-3 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
        {mine ? (
          <>
            {(addr || pickedUp) && (
              <a href={mapsLink(navAddr)} target="_blank" rel="noreferrer"
                 className="haptic flex-1 text-center bg-forest text-paper font-bold text-[15px] min-h-[44px] flex items-center justify-center rounded-[11px]">{pickedUp ? 'Go to drop-off' : 'Navigate'}</a>
            )}
            {phone && (
              <a href={`tel:${phone.replace(/[^\d+]/g, '')}`}
                 className="haptic flex-1 text-center bg-sage text-forest font-bold text-[15px] min-h-[44px] flex items-center justify-center rounded-[11px] border border-sage-line">Call</a>
            )}
            {!addr && !pickedUp && !phone && (
              <button onClick={onOpen} className="haptic flex-1 bg-sage text-forest font-bold text-[15px] min-h-[44px] flex items-center justify-center rounded-[11px]">Open</button>
            )}
          </>
        ) : (
          <>
            <span className={cx('flex-1 text-[13px] font-bold', need > 0 ? 'text-clay' : 'text-forest')}>
              {need === 0 ? 'Covered' : cap > 1 && need < cap ? `Needs ${need} more` : `Needs ${need} driver${need === 1 ? '' : 's'}`}
            </span>
            {onTake && need > 0 && (
              <button onClick={onTake} disabled={busy}
                      className="haptic bg-forest text-paper font-bold text-[15px] px-5 min-h-[44px] rounded-[11px] disabled:opacity-50">
                Take this pickup
              </button>
            )}
          </>
        )}
      </div>}
      {canFinish && (
        <div className="mt-2" onClick={(e) => e.stopPropagation()}>
          <button onClick={() => void finish(mp)} disabled={finishing}
                  className="haptic w-full min-h-[44px] rounded-[11px] border-[1.5px] border-forest bg-paper text-forest font-bold text-[15px] disabled:opacity-50">
            {finishing ? 'Saving…' : 'Done — dropped off'}
          </button>
        </div>
      )}
    </Card>
  );
}
