/**
 * Oct 14 client: days for each quiet time. Under every quiet time row (office Alerts &
 * schedule, driver Settings, the volunteer application): "Every day" (default) /
 * "Weekdays (Mon–Thu)" / "Sun–Thu" / "Pick days" (7 toggles). Bitmask, bit 0 = Sunday
 * (same as the server, quiet-days.ts). A quiet time that crosses midnight belongs to the
 * day it starts (Thu 11 PM – 7 AM = Thursday night into Friday morning).
 *
 * liveTexting() = the server's textingHours() run on what is on screen (same file,
 * quiet-days.ts), so "📱 Texting hours" changes as soon as a time or a day is changed,
 * before Save. After Save the server's own line is shown again.
 */
import { useState } from 'react';
import { cx } from './design';
import { DAY_SHORT, EVERY_DAY, MON_THU, SUN_THU, normDays, textingHours } from './quiet-days';

const PRESETS: Array<{ v: number; label: string }> = [
  { v: EVERY_DAY, label: 'Every day' },
  { v: MON_THU, label: 'Weekdays (Mon–Thu)' },
  { v: SUN_THU, label: 'Sun–Thu' },
];

export function QuietDaysPicker({ value, onChange, big, disabled }: {
  value: number | null | undefined;
  onChange: (days: number) => void;
  big?: boolean;          // driver app / application: bigger tap targets
  disabled?: boolean;
}) {
  const d = normDays(value);
  const [pickOpen, setPickOpen] = useState(false);
  const isPreset = PRESETS.some((p) => p.v === d);
  const picking = pickOpen || !isPreset;
  const btn = (on: boolean) => cx('haptic rounded-[10px] border-[1.4px] font-bold disabled:opacity-50',
    big ? 'min-h-[40px] px-3 text-[14px]' : 'px-2.5 py-1 text-[12px]',
    on ? 'border-forest bg-sage/50 text-forest' : 'border-line bg-paper text-ink');
  return (
    <div data-quiet-days className="mt-1">
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Days">
        {PRESETS.map((p) => {
          const on = !picking && d === p.v;
          return (
            <button key={p.v} type="button" role="radio" aria-checked={on} disabled={disabled}
                    onClick={() => { setPickOpen(false); onChange(p.v); }} className={btn(on)}>{p.label}</button>
          );
        })}
        <button type="button" role="radio" aria-checked={picking} disabled={disabled} onClick={() => setPickOpen(true)} className={btn(picking)}>Pick days</button>
      </div>
      {picking && (
        <div className="mt-1.5 flex flex-wrap gap-1" aria-label="Pick the days">
          {[0, 1, 2, 3, 4, 5, 6].map((i) => {
            const on = (d & (1 << i)) !== 0;
            return (
              <button key={i} type="button" aria-pressed={on} disabled={disabled}
                      // At least one day stays picked (no days = no quiet time: remove the row instead).
                      onClick={() => { const n = d ^ (1 << i); if (n) onChange(n); }}
                      className={cx(btn(on), big ? 'min-w-[46px]' : 'min-w-[38px]')}>{DAY_SHORT[i]}</button>
            );
          })}
        </div>
      )}
    </div>
  );
}

const nyTodayYmd = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

/** The "📱 Texting hours" lines for what is on screen (first row = the first quiet time). */
export function liveTexting(
  wins: Array<{ start: string; end: string; days?: number | null }>,
  quietDays: number,
  awayFrom?: string | null,
  awayUntil?: string | null,
) {
  const ok = wins.filter((w) => w.start && w.end);
  const [first, ...rest] = ok;
  return textingHours({
    sms_quiet_start: first?.start ?? null, sms_quiet_end: first?.end ?? null, sms_quiet_days: first?.days ?? EVERY_DAY,
    extra_quiet: rest.map((w) => ({ start: w.start, end: w.end, days: w.days ?? EVERY_DAY })),
    quiet_days: quietDays, vacation_from: awayFrom || null, vacation_until: awayUntil || null,
  }, nyTodayYmd());
}
