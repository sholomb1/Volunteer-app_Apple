/**
 * Centralized time formatting for the rescue app.
 *
 * Anchors:
 *  • All "wall-clock" times (pickup.scheduled_time, "10:00") render as
 *    12-hour with AM/PM ("10:00 AM"). The DB stores these as TIME without
 *    timezone — they're already Eastern.
 *  • All UTC timestamps (timestamptz columns: chat created_at, etc.) render
 *    in Eastern time. `America/New_York` is used because it auto-handles
 *    DST (EST = UTC-5 in winter, EDT = UTC-4 in summer). The user asked for
 *    "GMT-5" — that maps to Eastern; using the named zone keeps it correct
 *    year-round instead of drifting an hour every spring/fall.
 */
const TZ = 'America/New_York';

/** "14:00" or "14:00:00" → "2:00 PM". Empty input passes through unchanged. */
export function fmtTime(t: string | null | undefined): string {
  if (!t || !String(t).includes(':')) return String(t ?? '');
  const [hh, mm] = String(t).split(':');
  const h = parseInt(hh ?? '0', 10);
  if (!Number.isFinite(h)) return String(t);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${mm} ${ampm}`;
}

/** ISO timestamp → "2:00 PM" in Eastern time. */
export function fmtTimeEastern(iso: string | Date | null | undefined): string {
  if (!iso) return '';
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: TZ });
}

/** ISO timestamp → "Jun 14, 2:30 PM" in Eastern time. */
export function fmtDateTimeEastern(iso: string | Date | null | undefined): string {
  if (!iso) return '';
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
    hour12: true, timeZone: TZ,
  });
}

/** ISO date string (YYYY-MM-DD) → "Sat, Jun 14" in Eastern time. */
export function fmtDateEastern(iso: string | Date | null | undefined): string {
  if (!iso) return '';
  const d = iso instanceof Date ? iso
        : typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(iso + 'T12:00:00Z')
        : new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    timeZone: TZ,
  });
}

/** Oct 9: date → "Thu, Oct 9" in Eastern time; adds ", 2025" only when it's
 *  not the current year. Accepts YYYY-MM-DD or any timestamp. */
export function fmtDay(iso: string | Date | null | undefined): string {
  const s = fmtDateEastern(iso);
  if (!s) return '';
  const d = iso instanceof Date ? iso
        : typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(iso + 'T12:00:00Z')
        : new Date(iso as string);
  const y = new Intl.DateTimeFormat('en-US', { year: 'numeric', timeZone: TZ }).format(d);
  const nowY = new Intl.DateTimeFormat('en-US', { year: 'numeric', timeZone: TZ }).format(new Date());
  return y === nowY ? s : `${s}, ${y}`;
}

/** Combined "Sat, Jun 14 · 2:30 PM" — used on pickup cards and feeds. */
export function fmtDateTimeFull(iso: string | Date | null | undefined): string {
  if (!iso) return '';
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
    hour12: true, timeZone: TZ,
  });
}

/** Today's date (YYYY-MM-DD) anchored to New York. Use this instead of
 *  `new Date().toISOString().slice(0, 10)` — that reports UTC, which rolls
 *  the day over at 8 PM NY (EDT) / 7 PM NY (EST). */
export function nyToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
}

// Oct 13 client: "It shouldn't show a time if it's in the queue waiting — it's a pickup from now.
// But for us (office) it should show that it was reposted."
/** New York wall clock right now, 'YYYY-MM-DD HH:MM'. */
export function nyWallNow(): string {
  return new Date().toLocaleString('sv-SE', { timeZone: TZ }).slice(0, 16);
}
/** True once a pickup's date + time (New York) has come. No date or time → false. */
export function isPastDueNy(date: string | null | undefined, time: string | null | undefined): boolean {
  const d = date ? String(date).slice(0, 10) : '';
  const m = /^(\d{1,2}):(\d{2})/.exec(String(time ?? ''));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !m) return false;
  return `${d} ${m[1]!.padStart(2, '0')}:${m[2]}` <= nyWallNow();
}
const DONE_FOR_DRIVER = ['completed', 'delivered', 'cancelled', 'missed'];
/** Drivers see "Now" (not the old time) for a pickup still to do whose time has passed —
 *  reposted, or still open after its time. Finished ones keep their time. */
export function driverShowsNow(p: { scheduled_date?: string | null; scheduled_time?: string | null; status?: string | null }): boolean {
  return !DONE_FOR_DRIVER.includes(String(p.status ?? '').toLowerCase()) && isPastDueNy(p.scheduled_date, p.scheduled_time);
}
/** Office tag: "Reposted 3:20 PM · was Mon 10:36 PM" (another day: "Reposted Mon 3:20 PM · …"). */
export function repostedLabel(at: string, date: string | null | undefined, time: string | null | undefined): string {
  const when = new Date(at);
  let r = '';
  if (!Number.isNaN(when.getTime())) {
    const sameDay = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(when) === nyToday();
    r = sameDay ? fmtTimeEastern(when)
      : when.toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: TZ });
  }
  const key = date ? String(date).slice(0, 10) : '';
  const d = /^\d{4}-\d{2}-\d{2}$/.test(key) ? new Date(key + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }) : '';
  const t = fmtTime(time ? String(time).slice(0, 5) : '');
  const was = [d, t].filter(Boolean).join(' ');
  return `Reposted${r ? ` ${r}` : ''}${was ? ` · was ${was}` : ''}`;
}
