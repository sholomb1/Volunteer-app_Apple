/**
 * Oct 22 client: "We should never only go by the numbers because we don't know them. Always use
 * the pickup name, or the address if it's not a supplier." ONE helper for how a pickup is named
 * to the office: "Hive Discount Store · 9:00 AM" (store), else the donor / contact name, else the
 * short street address ("17 Ravenna Dr"), plus the time; "tomorrow" / the day when it isn't today.
 * Never an internal id. Pure: no React (tests: scripts/pickup-label.test.mjs).
 */
import { shortAddress as displayShortAddress, whenText } from './display.ts'; // .ts: node --test loads this file directly

export type PickupLabelInput = {
  suppliers?: string | null;      // store name(s) on Live Board / Pickups rows
  store?: string | null;          // other lists call it store / label / supplier_name
  label?: string | null;
  supplier_name?: string | null;
  steady_name?: string | null;
  donor_name?: string | null;
  contact_name?: string | null;
  pickup_address?: string | null;
  address?: string | null;
  scheduled_date?: string | null; // YYYY-MM-DD (New York)
  scheduled_time?: string | null; // HH:MM[:SS] (New York wall clock)
  date?: string | null;
  time?: string | null;
};

const clean = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim();
// Placeholder words some lists send instead of a name.
const JUNK = /^(one-time pickup|pickup|unknown|n\/a|-|—)$/i;
// Nov 2 client: a "name" with no letters (like "000") is not a name — fall through to the address.
const named = (s: unknown) => { const t = clean(s); return t && !JUNK.test(t) && /\p{L}/u.test(t) ? t : ''; };

/**
 * Oct 22 client ("need all this stuff to be neater"): a tidy name for lists.
 * "Stamford Yeshiva - 51 Carlton Rd" → "Stamford Yeshiva"; "21 Elener Lane, Spring Valley, NY, USA" → "21 Elener Lane".
 */
export function tidyPlaceName(s: string | null | undefined): string {
  let t = clean(s);
  if (!t) return '';
  const cut = t.replace(/\s+[-–—|]\s+\d+[A-Za-z]?\s+[A-Za-z].*$/, '').trim();
  if (cut) t = cut;
  if (/,\s*(NY|New York|NJ|CT)\b|,\s*(USA|United States)\s*$/i.test(t)) t = shortAddress(t) || t;
  return t;
}
const nice = (s: unknown) => tidyPlaceName(named(s));

/** "21 Elener Lane, Spring Valley, NY 10977, USA" → "21 Elener Lane, Spring Valley" (address lines on cards). */
export function tidyAddress(a: string | null | undefined): string {
  return displayShortAddress(a); // Oct 23 client: the one short-address rule (src/display.ts)
}

/** Driver as the office lists them: "Yermia H." (first name + last initial, no unit number). */
export function driverShort(first: string | null | undefined, last: string | null | undefined): string {
  const f = clean(first);
  const l = clean(last);
  if (!f) return l;
  return l ? `${f} ${l[0]!.toUpperCase()}.` : f;
}

/** "17 Ravenna Dr, Monsey, NY 10952, USA" → "17 Ravenna Dr". */
export function shortAddress(a: string | null | undefined): string {
  const t = clean(a).replace(/,?\s*(USA|United States)$/i, '');
  return clean(t.split(',')[0]);
}

/** Store name, else donor / contact name, else the short street address; null when nothing is known. */
export function pickupPlace(p: PickupLabelInput): string | null {
  return nice(p.suppliers) || nice(p.store) || nice(p.supplier_name) || nice(p.label) || nice(p.steady_name)
    || nice(p.donor_name) || nice(p.contact_name) || shortAddress(p.pickup_address ?? p.address) || null;
}

/** "16:00" / "16:00:00" → "4:00 PM". */
export function time12(t: string | null | undefined): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(clean(t));
  if (!m) return '';
  const h = Number(m[1]);
  return `${h % 12 === 0 ? 12 : h % 12}:${m[2]} ${h >= 12 ? 'PM' : 'AM'}`;
}

/** Today's date in New York, YYYY-MM-DD. */
export function nyYmd(now: Date = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

/** '' for today, "tomorrow", "yesterday", "Thu" (within a week), else "Oct 30". */
export function dayWordFor(date: string | null | undefined, todayYmd: string): string {
  const d = clean(date).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || d === todayYmd) return '';
  const diff = Math.round((Date.parse(`${d}T12:00:00Z`) - Date.parse(`${todayYmd}T12:00:00Z`)) / 86_400_000);
  if (diff === 1) return 'tomorrow';
  if (diff === -1) return 'yesterday';
  const dt = new Date(`${d}T12:00:00Z`);
  return Math.abs(diff) <= 6
    ? dt.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })
    : dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** Oct 23 client: the one format — "4:00 PM", "tomorrow 4:00 PM", "Thu Oct 23 · 4:00 PM" (or just the day). */
export function pickupWhen(p: PickupLabelInput, todayYmd: string = nyYmd()): string {
  const d = p.scheduled_date ?? p.date;
  const t = p.scheduled_time ?? p.time;
  if (!d) return time12(t);
  return whenText(d, t, todayYmd);
}
/** The words the "💬 Text <driver>" box has always used ("Thu 4:00 PM") — texts drivers get stay as they were. */
function textWhen(p: PickupLabelInput, todayYmd: string): string {
  const t = time12(p.scheduled_time ?? p.time);
  const day = dayWordFor(p.scheduled_date ?? p.date, todayYmd);
  return [day, t].filter(Boolean).join(' ');
}

/** "Hive Discount Store · 9:00 AM" / "17 Ravenna Dr · tomorrow 9:00 AM" / "Pickup · 9:00 AM". */
export function pickupLabel(p: PickupLabelInput, todayYmd: string = nyYmd()): string {
  const when = pickupWhen(p, todayYmd);
  return [pickupPlace(p) ?? 'Pickup', when].filter(Boolean).join(' · ');
}

/** Old saved texts (call logs) say "pickup #1089376 (Bites cafe)" — show "Bites cafe" instead. */
export function hidePickupIds(s: string | null | undefined): string {
  return String(s ?? '')
    .replace(/\bpickup #\d+ \(([^)]*)\)/gi, '$1')
    .replace(/\bpickup #\d+\b/gi, 'a pickup');
}

/**
 * The "💬 Text <driver>" box's first words:
 *   "Hi Shmueli, about the Hive Deli pickup (4:00 PM): "  ·  "(Thu 4:00 PM)" when not today
 *   "Hi Shmueli, about your pickup (4:00 PM): " when nothing names it. Never an id.
 */
export function driverTextPrefill(firstName: string | null | undefined, p: PickupLabelInput | null | undefined, todayYmd: string = nyYmd()): string {
  const name = clean(firstName) || 'there';
  const place = p ? pickupPlace(p) : null;
  const when = p ? textWhen(p, todayYmd) : '';
  return `Hi ${name}, about ${place ? `the ${place} pickup` : 'your pickup'}${when ? ` (${when})` : ''}: `;
}
