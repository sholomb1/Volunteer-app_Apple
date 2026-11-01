/**
 * Oct 23 client: a steady pickup's time can be "2 hours before candle lighting" (Fridays
 * and erev Yom Tov). Server rules: apps/api/src/candle-time.ts (saved per steady in
 * portal_settings 'steady_candle_time'; the materializer sets each Friday's time).
 *  • Steady form: "Time" = (•) Fixed time  ( ) Before candle lighting [2] h [0] m, with a
 *    live preview (GET /api/steady-candle-preview). Other weekdays of a mixed schedule keep
 *    the fixed time (both fields show then).
 *  • Lists (steady list, weekly calendar, store profile, flyer, weekly email) get
 *    `candle` = { label: '2 h before candles, Fridays', text: '2 h before candles, Fridays (Fri 3:45 PM)', time }.
 *  • Oct 23 client (2): "it should ask you if only Fridays or also erev Yom Tov" → under the
 *    candle option: (•) Fridays only  ( ) Fridays and erev Yom Tov (eveYomTov, default false).
 *    Fridays only: a weekday erev Yom Tov keeps the fixed time; a Friday erev Yom Tov still uses candles.
 */
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { cx } from './design';

export const CANDLE_MIN_OFFSET = 30;
export const CANDLE_MAX_OFFSET = 600;

/** What the API adds to a steady row when it's timed from candle lighting (null = fixed time). */
export type CandleInfo = { offsetMin: number; eveYomTov?: boolean; label: string; text: string; time: string | null; date: string | null; candles: string | null };
export type CandleSetting = { on: boolean; offsetMin: number; eveYomTov: boolean };
type CandleDay = { date: string; dow: string; time: string; candles: string; erevYomTov: boolean };
type CandlePreview = { offsetMin: number; eveYomTov?: boolean; label: string; thisFriday: CandleDay | null; next: CandleDay[]; winter: CandleDay | null; summer: CandleDay | null; erevYomTov: CandleDay | null };

/** '15:45' → '3:45 PM'. */
export function fmt12(hm: string | null | undefined): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(hm ?? ''));
  if (!m) return '';
  const h = Number(m[1]);
  return `${h % 12 === 0 ? 12 : h % 12}:${m[2]} ${h >= 12 ? 'PM' : 'AM'}`;
}
const fmtDate = (ymd: string) => new Date(`${ymd}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/**
 * The steady's time in a list:
 *   Friday only  → "2 h before candles, Fridays (Fri 3:45 PM)"
 *   mixed        → "4:00 PM · 2 h before candles, Fridays (3:45 PM)"
 */
export function steadyTimeText(fixed12: string, candle: CandleInfo | null | undefined, hasOtherDays: boolean): string {
  if (!candle) return fixed12;
  if (!hasOtherDays) return candle.text;
  return `${fixed12 || '—'} · ${candle.label}${candle.time ? ` (${fmt12(candle.time)})` : ''}`;
}

/** Loads the steady's candle setting; `save(id)` writes it (call after the steady itself is saved). */
export function useCandleSetting(steadyId: number | null | undefined) {
  const q = useQuery({
    queryKey: ['steady-candle-time', steadyId],
    queryFn: () => api<{ data: { on: boolean; offsetMin: number; eveYomTov?: boolean } }>(`/api/steady-pickups/${steadyId}/candle-time`),
    enabled: !!steadyId,
  });
  const [value, setValue] = useState<CandleSetting>({ on: false, offsetMin: 120, eveYomTov: false });
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    const d = q.data?.data;
    if (d && !touched) setValue({ on: !!d.on, offsetMin: Number(d.offsetMin) || 120, eveYomTov: d.eveYomTov === true });
  }, [q.data, touched]);
  const change = (v: CandleSetting) => { setTouched(true); setValue(v); };
  const valid = !value.on || (value.offsetMin >= CANDLE_MIN_OFFSET && value.offsetMin <= CANDLE_MAX_OFFSET);
  const save = async (id: number) => {
    // Nothing to write for a steady left on a fixed time.
    if (!touched && !q.data?.data?.on) return;
    await api(`/api/steady-pickups/${id}/candle-time`, { method: 'PUT', body: JSON.stringify(value) });
  };
  return { value, change, save, valid };
}

export function useCandlePreview(offsetMin: number, enabled: boolean, eveYomTov = false) {
  const ok = enabled && offsetMin >= CANDLE_MIN_OFFSET && offsetMin <= CANDLE_MAX_OFFSET;
  return useQuery({
    queryKey: ['steady-candle-preview', offsetMin, eveYomTov],
    queryFn: () => api<{ data: CandlePreview }>(`/api/steady-candle-preview?offsetMin=${offsetMin}&eveYomTov=${eveYomTov ? 1 : 0}`),
    enabled: ok,
    staleTime: 10 * 60_000,
  });
}

const inCls = 'rounded-[10px] border border-line bg-paper px-2 py-1.5 text-[13px]';

/** The steady form's "Time": fixed time, or before candle lighting (+ the fixed time for other weekdays). */
export function PickupTimeChoice({ value, onChange, pickupTime, onPickupTime, days, preview }: {
  value: CandleSetting; onChange: (v: CandleSetting) => void;
  pickupTime: string; onPickupTime: (t: string) => void;
  days: string[]; preview: CandlePreview | null | undefined;
}) {
  const hasFri = days.includes('friday');
  const others = days.filter((d) => d !== 'friday');
  const h = Math.floor(value.offsetMin / 60); const m = value.offsetMin % 60;
  const setHM = (hh: number, mm: number) => onChange({ ...value, offsetMin: Math.max(0, Math.min(10, hh)) * 60 + mm });
  const tooSoon = value.on && value.offsetMin < CANDLE_MIN_OFFSET;
  const cap = (s: string) => s.slice(0, 1).toUpperCase() + s.slice(1, 3);
  return (
    <div className="space-y-2" data-testid="pickup-time-choice">
      <label className="flex items-center gap-2 text-[13px]">
        <input type="radio" name="time-mode" className="accent-forest h-4 w-4" checked={!value.on} onChange={() => onChange({ ...value, on: false })} />
        <span className="font-semibold">Fixed time</span>
        {!value.on && <input type="time" value={pickupTime} onChange={(e) => onPickupTime(e.target.value)} className={inCls} />}
      </label>
      <label className="flex flex-wrap items-center gap-2 text-[13px]">
        <input type="radio" name="time-mode" className="accent-forest h-4 w-4" checked={value.on} onChange={() => onChange({ ...value, on: true })} />
        <span className="font-semibold">Before candle lighting</span>
        <input type="number" min={0} max={10} value={h} disabled={!value.on} data-testid="candle-hours"
               onChange={(e) => setHM(Number(e.target.value) || 0, m)} className={cx(inCls, 'w-16 text-center', !value.on && 'opacity-40')} />
        <span className={cx(!value.on && 'opacity-40')}>h</span>
        <select value={m} disabled={!value.on} data-testid="candle-minutes"
                onChange={(e) => setHM(h, Number(e.target.value))} className={cx(inCls, !value.on && 'opacity-40')}>
          {Array.from({ length: 12 }, (_, i) => i * 5).map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
        <span className={cx(!value.on && 'opacity-40')}>m</span>
      </label>
      {value.on && (
        <div className="ml-6 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]" data-testid="candle-days">
          <label className="flex items-center gap-2">
            <input type="radio" name="candle-days" className="accent-forest h-4 w-4" checked={!value.eveYomTov} onChange={() => onChange({ ...value, eveYomTov: false })} />
            <span>Fridays only</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="candle-days" className="accent-forest h-4 w-4" checked={value.eveYomTov} onChange={() => onChange({ ...value, eveYomTov: true })} />
            <span>Fridays and erev Yom Tov</span>
          </label>
        </div>
      )}
      {value.on && (
        <div className="ml-6 rounded-[10px] border border-line bg-cream/30 px-3 py-2 text-[12.5px] space-y-1" data-testid="candle-preview">
          {tooSoon ? (
            <div className="font-semibold text-clay">At least 30 minutes before candle lighting.</div>
          ) : !preview ? (
            <div className="text-muted italic">Working out the times…</div>
          ) : (
            <>
              {preview.thisFriday && (
                <div><b>This Friday: {fmt12(preview.thisFriday.time)}</b> <span className="text-muted">(candles {fmt12(preview.thisFriday.candles)})</span></div>
              )}
              {preview.next.length > 1 && (
                <div className="text-muted">Then: {preview.next.slice(1).map((d) => `${fmtDate(d.date)} ${fmt12(d.time)}`).join(' · ')}</div>
              )}
              <div className="text-muted">
                {preview.winter && <>Winter Fridays ~{fmt12(preview.winter.time)}</>}
                {preview.winter && preview.summer && ' · '}
                {preview.summer && <>Summer Fridays ~{fmt12(preview.summer.time)}</>}
              </div>
              {value.eveYomTov && preview.erevYomTov && (
                <div className="text-muted">Erev Yom Tov too, if it's one of its days: {preview.erevYomTov.dow} {fmtDate(preview.erevYomTov.date)} {fmt12(preview.erevYomTov.time)}</div>
              )}
            </>
          )}
          {!hasFri && <div className="text-[11.5px] text-clay">{value.eveYomTov ? 'Applies on Fridays and erev Yom Tov.' : 'Applies on Fridays only.'} Tick FRI below for every Friday.</div>}
          {others.length > 0 && (
            <label className="flex flex-wrap items-center gap-2 pt-1 text-[13px]">
              <span className="font-semibold">{others.map(cap).join(', ')} at</span>
              <input type="time" value={pickupTime} onChange={(e) => onPickupTime(e.target.value)} className={inCls} />
            </label>
          )}
          <div className="text-[11px] text-muted italic">Rounded down to 5 minutes. Upcoming days that were already made move to the new time (never past days, done or cancelled ones, or a day you changed by hand).</div>
        </div>
      )}
    </div>
  );
}
