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
