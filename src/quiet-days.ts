/**
 * Oct 14 client: days for each quiet time (migration 083) + the "Texting hours" line.
 *
 * ONE pure rule (no imports) used by the API (pickupTextDecision, textingHours, Who gets
 * texts, the office profile, "Will go to N drivers") AND, as an exact copy, by the app
 * (rescue-app/src/quiet-days.ts) so the "📱 Texting hours" line updates live while the
 * driver / office edits, before Save. Keep the two files identical (a test checks).
 *
 * Days are a bitmask, bit 0 = Sunday … bit 6 = Saturday (the same as volunteers.quiet_days).
 * 127 = every day (the default; null / 0 / anything odd also means every day).
 * The first quiet time lives in volunteers.sms_quiet_start/end/days, the others in
 * zlz.volunteer_quiet_windows (start_time, end_time, days).
 * A quiet time that crosses midnight belongs to the day it STARTS: "Thu 11 PM – 7 AM"
 * covers Thursday night into Friday morning (Friday 11 PM is not quiet unless Friday is picked).
 */

export const EVERY_DAY = 127;
export const MON_THU = 30;   // Mon Tue Wed Thu
export const SUN_THU = 31;   // Sun … Thu
export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_PLURAL = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export type QuietWindow = { start: string; end: string; days?: number | null };
export type QuietFacts = {
  sms_quiet_start: string | null;            // first quiet time ('HH:MM[:SS]'); no end = 7 AM
  sms_quiet_end: string | null;
  sms_quiet_days?: number | null;            // days of the first quiet time (083)
  extra_quiet: QuietWindow[];                // the other quiet times
  quiet_days: number | null;                 // whole days with no texts
  vacation_from: string | null;
  vacation_until: string | null;
};
/** One quiet time, ready to test. first = the sms_quiet_* one (its end minute counts too, like the old SQL BETWEEN). */
export type Win = { start: string; end: string; days: number; first: boolean };

/** 'HH:MM[:SS[.fff]]' → seconds since midnight. */
export function timeSecs(t: string): number {
  const [h, m, s] = String(t).split(':');
  return Number(h ?? 0) * 3600 + Number(m ?? 0) * 60 + Number(s ?? 0);
}

/** "9 PM" / "9:30 PM" */
export function fmtClock(t: string): string {
  const secs = timeSecs(t);
  const h = Math.floor(secs / 3600) % 24;
  const m = Math.floor((secs % 3600) / 60);
  const ap = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12} ${ap}` : `${h12}:${String(m).padStart(2, '0')} ${ap}`;
}
const fmtMin = (min: number) => fmtClock(`${Math.floor((min % 1440) / 60)}:${min % 60}`);

/** null / 0 / out of range → every day. */
export function normDays(d: unknown): number {
  const n = Number(d);
  return Number.isInteger(n) && n >= 1 && n <= 127 ? n : EVERY_DAY;
}
export function dayOn(days: unknown, dow: number): boolean {
  return (normDays(days) & (1 << (((dow % 7) + 7) % 7))) !== 0;
}

/** "Every day", "Mon–Thu", "Sun–Thu", "Fri–Sun", "Mon, Wed, Fri". */
export function daysLabel(days: unknown): string {
  const d = normDays(days);
  if (d === EVERY_DAY) return 'Every day';
  // Week from Monday, or from Sunday when Sunday is picked and Saturday isn't (Sun–Thu).
  const order = (d & 1) && !(d & 64) ? [0, 1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5, 6, 0];
  const parts: string[] = [];
  let run: number[] = [];
  const flush = () => {
    if (run.length >= 3) parts.push(`${DAY_SHORT[run[0]!]}–${DAY_SHORT[run[run.length - 1]!]}`);
    else for (const x of run) parts.push(DAY_SHORT[x]!);
    run = [];
  };
  for (const x of order) { if (d & (1 << x)) run.push(x); else flush(); }
  flush();
  return parts.join(', ');
}

/** Is NY time `secs` on NY weekday `dow` inside this quiet time? Same start and end = no quiet time. */
export function inWindow(w: Win, dow: number, secs: number): boolean {
  const s = timeSecs(w.start);
  const e = timeSecs(w.end);
  if (s === e) return false;
  if (s < e) return secs >= s && (w.first ? secs <= e : secs < e) && dayOn(w.days, dow);
  if (secs >= s) return dayOn(w.days, dow);                               // started tonight
  if (w.first ? secs <= e : secs < e) return dayOn(w.days, dow + 6);      // started last night
  return false;
}

/** Did this quiet time really end on NY weekday `dow` (the catch-up text after quiet ends)? */
export function windowEndsOn(w: { start: string; end: string; days?: number | null }, dow: number): boolean {
  const s = timeSecs(w.start), e = timeSecs(w.end);
  if (s === e) return false;
  return s < e ? dayOn(w.days, dow) : dayOn(w.days, dow + 6);
}

/** All of a driver's quiet times, the first one first. */
export function windowsOf(m: Pick<QuietFacts, 'sms_quiet_start' | 'sms_quiet_end' | 'sms_quiet_days' | 'extra_quiet'>): Win[] {
  const out: Win[] = [];
  if (m.sms_quiet_start) out.push({ start: m.sms_quiet_start, end: m.sms_quiet_end ?? '07:00', days: normDays(m.sms_quiet_days), first: true });
  for (const w of m.extra_quiet ?? []) if (w && w.start && w.end) out.push({ start: w.start, end: w.end, days: normDays(w.days), first: false });
  return out;
}

/** "10 PM–7 AM" or "11 PM–7 AM (Mon–Thu)" (for reasons like "Quiet hours …"). */
export function windowLabel(w: { start: string; end: string; days?: number | null }): string {
  const d = normDays(w.days);
  return `${fmtClock(w.start)}–${fmtClock(w.end)}${d === EVERY_DAY ? '' : ` (${daysLabel(d)})`}`;
}

function fmtYmd(ymd: string): string {
  const [, mo, d] = ymd.split('-').map(Number);
  return `${MONTHS[(mo ?? 1) - 1]} ${d}`;
}
function toYmd(v: unknown): string | null {
  if (v == null || v === '') return null;
  if (v instanceof Date) return new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC' }).format(v);
  return String(v).slice(0, 10);
}

/**
 * Oct 12 client: show a driver's TEXTING hours first (when pickup texts can
 * reach them = every minute outside all their quiet times), quiet hours under it:
 *   texting "📱 Texting hours: 7 AM – 1 PM, 3 PM – 10 PM"   quiet "🌙 Quiet: 10 PM – 7 AM, 1 PM – 3 PM"
 * Quiet times may cross midnight and overlap; touching ones merge. Quiet 12+
 * hours a day (often set backwards) → "only 9 PM – 1:30 AM — check?".
 * Quiet days → "No texts Sundays"; away → "Away until Oct 20".
 * Oct 14 client: when the quiet times are not every day, per day, grouped:
 *   "📱 Texting hours: Mon until 11 PM; Tue–Thu 7 AM – 11 PM; Fri from 7 AM; Sat–Sun all day"
 *   "🌙 Quiet: 11 PM – 7 AM · Mon–Thu"
 */
export function textingHours(
  m: Pick<QuietFacts, 'sms_quiet_start' | 'sms_quiet_end' | 'sms_quiet_days' | 'extra_quiet' | 'quiet_days' | 'vacation_from' | 'vacation_until'>,
  todayYmd: string,
): { texting: string; quiet: string | null; days: string | null; away: string | null; check: boolean; quietMinutes: number } {
  const wins = windowsOf(m).filter((w) => timeSecs(w.start) !== timeSecs(w.end));
  const uniform = wins.every((w) => w.days === EVERY_DAY);
  let texting: string;
  let quiet: string | null;
  let quietMinutes: number;
  let check: boolean;
  if (uniform) {
    const quietMin = new Array<boolean>(1440).fill(false);
    for (const w of wins) {
      const s = Math.floor(timeSecs(w.start) / 60) % 1440; const e = Math.floor(timeSecs(w.end) / 60) % 1440;
      if (s === e) continue;
      for (let i = s; i !== e; i = (i + 1) % 1440) quietMin[i] = true;
    }
    quietMinutes = quietMin.filter(Boolean).length;
    // Runs around the clock: start at a minute where quiet ↔ texting changes.
    const runs: Array<{ start: number; len: number; quiet: boolean }> = [];
    const pivot = quietMin.findIndex((q, i) => q !== quietMin[(i + 1439) % 1440]);
    if (pivot >= 0) {
      for (let k = 0; k < 1440; k++) {
        const i = (pivot + k) % 1440;
        const last = runs[runs.length - 1];
        if (last && last.quiet === quietMin[i]) last.len++;
        else runs.push({ start: i, len: 1, quiet: quietMin[i]! });
      }
    }
    const span = (r: { start: number; len: number }) => `${fmtMin(r.start)} – ${fmtMin(r.start + r.len)}`;
    const textRuns = runs.filter((r) => !r.quiet).sort((a, b) => a.start - b.start);
    const firstText = textRuns[0]?.start ?? 0;
    // Quiet list starts with the quiet time that ends when texting starts (the night), then in order.
    const quietRuns = runs.filter((r) => r.quiet).sort((a, b) => ((a.start + a.len - firstText + 2880) % 1440) - ((b.start + b.len - firstText + 2880) % 1440));
    check = quietMinutes >= 12 * 60;
    texting = quietMinutes === 0 ? '📱 Texting hours: all day'
      : quietMinutes >= 1440 ? '📱 Texting hours: none — check?'
      : `📱 Texting hours: ${check ? 'only ' : ''}${textRuns.map(span).join(', ')}${check ? ' — check?' : ''}`;
    quiet = quietMinutes === 0 ? null : `🌙 Quiet: ${quietMinutes >= 1440 ? 'all day' : quietRuns.map(span).join(', ')}`;
  } else {
    // Oct 14 client: each calendar day on its own (a night quiet time spills into the next morning).
    const dayText: string[] = [];
    quietMinutes = 0;
    for (let dow = 0; dow < 7; dow++) {
      const q = new Array<boolean>(1440);
      for (let i = 0; i < 1440; i++) q[i] = wins.some((w) => inWindow(w, dow, i * 60 + 30));
      const n = q.filter(Boolean).length;
      quietMinutes = Math.max(quietMinutes, n);
      if (n === 0) { dayText.push('all day'); continue; }
      if (n === 1440) { dayText.push('none'); continue; }
      const parts: string[] = [];
      for (let i = 0; i < 1440;) {
        if (q[i]) { i++; continue; }
        let j = i; while (j < 1440 && !q[j]) j++;
        parts.push(i === 0 ? `until ${fmtMin(j)}` : j === 1440 ? `from ${fmtMin(i)}` : `${fmtMin(i)} – ${fmtMin(j)}`);
        i = j;
      }
      dayText.push(parts.join(', '));
    }
    check = quietMinutes >= 12 * 60;
    const groups: Array<{ text: string; mask: number }> = [];
    for (const dow of [1, 2, 3, 4, 5, 6, 0]) {
      const t = dayText[dow]!;
      const g = groups.find((x) => x.text === t);
      if (g) g.mask |= 1 << dow; else groups.push({ text: t, mask: 1 << dow });
    }
    texting = groups.length === 1
      ? `📱 Texting hours: ${groups[0]!.text}${check ? ' — check?' : ''}`
      : `📱 Texting hours: ${groups.map((g) => `${daysLabel(g.mask)} ${g.text}`).join('; ')}${check ? ' — check?' : ''}`;
    quiet = `🌙 Quiet: ${wins.map((w) => `${fmtClock(w.start)} – ${fmtClock(w.end)}${w.days === EVERY_DAY ? '' : ` · ${daysLabel(w.days)}`}`).join(', ')}`;
  }

  const qd = Number(m.quiet_days ?? 0);
  const dayNames = DAY_PLURAL.filter((_, i) => qd & (1 << i));
  const days = dayNames.length === 0 ? null
    : `No texts ${dayNames.length === 1 ? dayNames[0] : `${dayNames.slice(0, -1).join(', ')} and ${dayNames[dayNames.length - 1]}`}`;

  const vf = toYmd(m.vacation_from);
  const vu = toYmd(m.vacation_until);
  let away: string | null = null;
  if ((vf || vu) && !(vu && vu < todayYmd)) {
    away = vf && vf > todayYmd ? `Away ${fmtYmd(vf)}${vu ? ` – ${fmtYmd(vu)}` : ' (no end date)'}`
      : vu ? `Away until ${fmtYmd(vu)}` : 'Away (no end date)';
  }
  return { texting, quiet, days, away, check, quietMinutes };
}
