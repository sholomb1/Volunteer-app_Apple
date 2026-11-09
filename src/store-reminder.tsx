/**
 * Nov 2 client: "the store should get a reminder about a pickup … customize the message … how long
 * before". Nov 5 client: "I don't want it in the store's profile. I want it in the steady profile.
 * Each steady should have this." → Steady form → "⏰ Remind the store before pickup": on/off, how long
 * before, the message (with {time} and {store}), a preview, and which store phone it goes to.
 * Off by default. Saved with the steady (save(id) after the steady itself is saved).
 * API: apps/api/src/store-reminder.ts (GET/PUT /api/steady-pickups/:id/store-reminder).
 */
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { cx } from './design';

type Rem = { on: boolean; minutes: number; text: string; defaultText: string; storeName?: string; hasStore?: boolean; preview: string; phone: string | null; textsOff: boolean };
export type SteadyStoreReminder = { on: boolean; minutes: number; text: string };
const CHOICES: Array<[number, string]> = [[30, '30 minutes'], [60, '1 hour'], [90, '1½ hours'], [120, '2 hours'], [180, '3 hours'], [240, '4 hours']];
export const DEFAULT_STORE_REMINDER_TEXT = "Zeh L'Zeh: Reminder — our driver is coming for your food today at {time}. Please have it packed and ready. Thank you!";

/** Loads the steady's reminder (and the picked store's phone); `save(id)` writes it. */
export function useSteadyStoreReminder(steadyId: number | null | undefined, supplierId: string | number | null | undefined) {
  const sup = Number(supplierId) || 0;
  const q = useQuery({
    queryKey: ['steady-store-reminder', steadyId ?? 0, sup],
    queryFn: () => api<{ data: Rem }>(`/api/steady-pickups/${steadyId ?? 0}/store-reminder${sup ? `?supplierId=${sup}` : ''}`),
    staleTime: 30_000,
  });
  const [value, setValue] = useState<SteadyStoreReminder>({ on: false, minutes: 120, text: DEFAULT_STORE_REMINDER_TEXT });
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    const d = q.data?.data;
    if (d && !touched) setValue({ on: !!d.on, minutes: d.minutes || 120, text: d.text || d.defaultText });
  }, [q.data, touched]);
  const change = (v: SteadyStoreReminder) => { setTouched(true); setValue(v); };
  const save = async (id: number) => {
    // Nothing to write when it was never touched (off is the default; an existing setting stays as it is).
    if (!touched) return;
    await api(`/api/steady-pickups/${id}/store-reminder`, {
      method: 'PUT', body: JSON.stringify({ on: value.on, minutes: value.minutes, text: value.text.trim() || DEFAULT_STORE_REMINDER_TEXT }),
    });
  };
  return { value, change, save, info: q.data?.data };
}

/** "4:00 PM" for a "16:00" pickup time (blank time → 4:00 PM, as an example). */
function time12(t?: string): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(t ?? '');
  const h = m ? Number(m[1]) : 16; const mi = m ? m[2] : '00';
  return `${((h + 11) % 12) + 1}:${mi} ${h >= 12 ? 'PM' : 'AM'}`;
}

function prettyPhone(p: string): string {
  const d = p.replace(/\D/g, '').slice(-10);
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : p;
}

export function SteadyStoreReminderBox({ value, onChange, info, pickupTime, storeName }:
    { value: SteadyStoreReminder; onChange: (v: SteadyStoreReminder) => void; info?: Rem; pickupTime?: string; storeName?: string }) {
  const name = storeName || info?.storeName || '';
  const filled = (value.text.trim() || DEFAULT_STORE_REMINDER_TEXT)
    .replace(/\{time\}/gi, time12(pickupTime)).replace(/\{store\}/gi, name || 'the store');
  const preview = /zeh l.?zeh/i.test(filled) ? filled : `Zeh L'Zeh: ${filled}`;
  const goesTo = !info ? null
    : !info.hasStore ? 'Pick the store above first.'
    : !info.phone ? 'No store phone saved — the store gets only the app pop-up.'
    : info.textsOff ? 'This store has texts off — app pop-up only.'
    : `Goes to ${name || 'the store'}: ${prettyPhone(info.phone)}`;
  return (
    <div className="rounded-[10px] border border-line bg-cream/30 px-3 py-2 space-y-2" data-testid="steady-store-reminder">
      <label className="flex items-center gap-2 text-[13px]">
        <input type="checkbox" className="accent-forest h-4 w-4" checked={value.on}
               onChange={(e) => onChange({ ...value, on: e.target.checked })} />
        <span>⏰ Text the store a reminder before each pickup</span>
      </label>
      <div className={cx('space-y-2', !value.on && 'opacity-40')}>
        <label className="block">
          <span className="text-[11.5px] font-bold text-muted">How long before the pickup</span>
          <select value={value.minutes} disabled={!value.on} onChange={(e) => onChange({ ...value, minutes: Number(e.target.value) })}
                  className="mt-0.5 block w-full rounded-[8px] border border-line bg-paper px-2 py-1.5 text-[13px]">
            {CHOICES.map(([n, l]) => <option key={n} value={n}>{l}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-[11.5px] font-bold text-muted">The message (use {'{time}'} for the pickup time, {'{store}'} for the store name)</span>
          <textarea value={value.text} disabled={!value.on} onChange={(e) => onChange({ ...value, text: e.target.value })} rows={3} maxLength={300}
                    className="mt-0.5 block w-full rounded-[8px] border border-line bg-paper p-2 text-[13px]" />
        </label>
        {value.on && value.text !== DEFAULT_STORE_REMINDER_TEXT && (
          <button type="button" onClick={() => onChange({ ...value, text: DEFAULT_STORE_REMINDER_TEXT })}
                  className="text-[11.5px] font-bold text-muted underline">Use the standard message</button>
        )}
        <div className="text-[11.5px] text-muted">Example: <span className="text-ink">{preview}</span></div>
        {goesTo && <div className="text-[11.5px] font-semibold text-ink">📱 {goesTo}</div>}
      </div>
      <p className="text-[11px] text-muted italic">
        One text per pickup. Not on Shabbos / Yom Tov. Not for a cancelled or finished pickup.
      </p>
    </div>
  );
}
