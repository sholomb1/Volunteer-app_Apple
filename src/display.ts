/**
 * Oct 23 client: "Same style everywhere: the same short names (no 'NY, USA', no numbers), the same
 * phone format and the same colors on every screen. One pass across the whole app."
 *
 * ONE place for how things LOOK on screen (display only: saved data, CSV exports and the texts
 * drivers receive are unchanged):
 *   displayPhone   "8453561637" / "+18453561637" / "(845) 356-1637" → "845-356-1637" (tel: links keep E.164)
 *   shortAddress   "8 Hershel Terrace, Monsey, NY 10952, USA" → "8 Hershel Terrace, Monsey"
 *   personShort    "Yermia H."   ·   personFull "Yermia Halberstam" (render inside <bdi dir="auto">)
 *   STATUS         one map of status words + pill colors (Done / Done (no kiosk) / Cancelled / …)
 *   whenText       "4:00 PM" today · "tomorrow 9:00 AM" · "Thu Oct 23 · 4:00 PM"
 * Pure: no React (tests: scripts/display.test.mjs). React bits live in src/display-ui.tsx.
 */

const clean = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim();

// ---------------- Phones ----------------

/** A typed number -> 10 digits, or '' when it isn't a 10-digit US number (a leading 1 is dropped). */
export function digits10(p: unknown): string {
  let d = String(p ?? '').replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('1')) d = d.slice(1);
  return d.length === 10 ? d : '';
}
/** "845-356-1637" for any US number; anything else is shown as typed. */
export function displayPhone(p: unknown): string {
  const d = digits10(p);
  return d ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : clean(p);
}
/** The tel: link (E.164 when it's a US number). */
export function telHref(p: unknown): string {
  const d = digits10(p);
  return d ? `tel:+1${d}` : `tel:${String(p ?? '').replace(/[^\d+]/g, '')}`;
}

// ---------------- Addresses ----------------

const COUNTRY = /^(USA|US|U\.S\.A?\.?|United States( of America)?)$/i;
const STATE = /^(NY|N\.Y\.|New York|NJ|New Jersey|CT|Connecticut)$/i;
const ZIP = /^\d{5}(-\d{4})?$/;
const COUNTY = /^[A-Za-z .]+ County$/i;

/**
 * Street + town, no state / zip / country:
 *   "8 Hershel Terrace, Monsey, NY 10952, USA" → "8 Hershel Terrace, Monsey"
 *   "21 Elener Lane, Spring Valley, NY, USA"   → "21 Elener Lane, Spring Valley"
 *   "17 Ravenna Dr, Monsey NY 10952"           → "17 Ravenna Dr, Monsey"
 */
export function shortAddress(a: string | null | undefined): string {
  const parts = clean(a).split(',').map((s) => s.trim()).filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    let p = parts[i]!;
    if (i > 0) {
      if (COUNTRY.test(p) || ZIP.test(p) || COUNTY.test(p)) continue;
      // "NY 10952" / "New York 10952" / "NY"
      const sz = /^(.*?)\s*\b(NY|N\.Y\.|New York|NJ|CT)\b\.?\s*(\d{5}(-\d{4})?)?$/i.exec(p);
      if (STATE.test(p)) continue;
      if (sz && (sz[3] || STATE.test(sz[2]!))) {
        // "Monsey NY 10952" → "Monsey"; "NY 10952" → drop
        p = sz[1]!.trim();
        if (!p) continue;
      }
      p = p.replace(/\s+\d{5}(-\d{4})?$/, '').trim();
      if (!p) continue;
    }
    if (!out.includes(p)) out.push(p);
  }
  return out.join(', ');
}
/** Street only ("17 Ravenna Dr") — for a pickup's name when nothing else names it. */
export function streetOnly(a: string | null | undefined): string {
  return shortAddress(a).split(',')[0]!.trim();
}
/** Short address from separate fields (address_line1 + city). */
export function shortAddressOf(line1: string | null | undefined, city?: string | null): string {
  return shortAddress([line1, city].map(clean).filter(Boolean).join(', '));
}

// ---------------- People ----------------

/** "Yermia H." — first name + last initial, no unit number. */
export function personShort(first: string | null | undefined, last: string | null | undefined): string {
  const f = clean(first);
  const l = clean(last);
  if (!f) return l;
  return l ? `${f} ${Array.from(l)[0]!.toUpperCase()}.` : f;
}
/** "Yermia Halberstam" (render it inside <bdi dir="auto"> so Hebrew reads right). */
export function personFull(first: string | null | undefined, last: string | null | undefined): string {
  return [clean(first), clean(last)].filter(Boolean).join(' ');
}
/** "Eli G #15" / "Moshe K. (#20)" / "Yossi Braun #7" → without the unit number. */
export function stripUnit(name: string | null | undefined): string {
  return clean(String(name ?? '').replace(/\s*\(#\d+\)|\s*#\d+\b/g, ''));
}

// ---------------- Statuses ----------------

export type StatusKey =
  | 'done' | 'nokiosk' | 'cancelled' | 'no_dropoff' | 'missed' | 'expired'
  | 'needs_driver' | 'covered' | 'needs_confirmation' | 'on_the_way' | 'review';

/** One map of words + colors (pill = border + text + soft background; dot = small marker). */
export const STATUS: Record<StatusKey, { word: string; icon: string; pill: string; text: string }> = {
  done:               { word: 'Done',               icon: '✓', pill: 'border-sage-line bg-sage text-forest',            text: 'text-forest' },
  nokiosk:            { word: 'Done (no kiosk)',    icon: '✓', pill: 'border-amber/50 bg-amber-soft text-[#9a7415]',    text: 'text-[#9a7415]' },
  cancelled:          { word: 'Cancelled',          icon: '✕', pill: 'border-line bg-cream text-muted',                 text: 'text-muted' },
  no_dropoff:         { word: 'No drop-off today',  icon: '✕', pill: 'border-line bg-cream text-muted',                 text: 'text-muted' },
  missed:             { word: 'Missed',             icon: '!', pill: 'border-clay/30 bg-clay-soft text-clay',           text: 'text-clay' },
  expired:            { word: 'Expired',            icon: '–', pill: 'border-line bg-cream text-muted',                 text: 'text-muted' },
  needs_driver:       { word: 'Needs a driver',     icon: '!', pill: 'border-clay/30 bg-clay-soft text-clay',           text: 'text-clay' },
  covered:            { word: 'Covered',            icon: '✓', pill: 'border-sky/30 bg-sky-soft text-sky-deep',         text: 'text-sky-deep' },
  needs_confirmation: { word: 'Needs confirmation', icon: '?', pill: 'border-amber/50 bg-amber-soft text-[#9a7415]',    text: 'text-[#9a7415]' },
  on_the_way:         { word: 'On the way',         icon: '→', pill: 'border-amber/50 bg-amber-soft text-[#9a7415]',    text: 'text-[#9a7415]' },
  review:             { word: 'Needs review',       icon: '?', pill: 'border-amber/50 bg-amber-soft text-[#9a7415]',    text: 'text-[#9a7415]' },
};

export type StatusInput = {
  status?: string | null;
  cancelled_at?: string | null;
  cancellation_reason?: string | null;
  outcome?: string | null;
  completion_notes?: string | null;
  kiosk_verified?: boolean | null;
  confirmation_state?: string | null;
  signups?: unknown[] | null;
  slots_remaining?: number | null;
  /** an outcome label from the API ("Completed – verified", "Taken", "Expired – no driver", …) */
  outcome_label?: string | null;
};

/** The one status of a pickup, from whatever fields the list has. */
export function statusKeyOf(p: StatusInput): StatusKey {
  const s = clean(p.status).toLowerCase();
  const oc = clean(p.outcome).toLowerCase();
  const reason = clean(p.cancellation_reason);
  const label = clean(p.outcome_label).toLowerCase();
  if (s === 'cancelled' || (p.cancelled_at && s !== 'missed') || oc === 'cancelled' || /^(cancel|no drop-off)/.test(label)) {
    return /^no drop-off today/i.test(reason) || /^no drop-off/.test(label) ? 'no_dropoff' : 'cancelled';
  }
  if (oc === 'taken' || /^taken|no kiosk/.test(label)) return 'nokiosk';
  if (oc === 'expired' || /^expired/.test(label)) return 'expired';
  if (oc === 'needs_review' || /^needs review/.test(label)) return 'review';
  if (oc === 'missed_confirmed' || /^missed/.test(label)) return 'missed';
  if (oc.startsWith('completed') || /^completed|^done/.test(label)) return 'done';
  if (s === 'missed' || s === 'expired') {
    const r = reason.toLowerCase();
    if (r.startsWith('needs review')) return 'review';
    if (s === 'expired' || r.startsWith('expired') || r.includes('no driver claimed')) return 'expired';
    return 'missed';
  }
  if (s === 'completed' || s === 'delivered') {
    return clean(p.completion_notes).startsWith('auto: accepted') && !p.kiosk_verified ? 'nokiosk' : 'done';
  }
  if (s === 'en_route' || s === 'picked_up' || s === 'in_progress') return 'on_the_way';
  if (clean(p.confirmation_state).toLowerCase() === 'pending') return 'needs_confirmation';
  if (p.slots_remaining != null) return Number(p.slots_remaining) > 0 ? 'needs_driver' : 'covered';
  return (p.signups?.length ?? 0) > 0 ? 'covered' : 'needs_driver';
}

/** A status word as text ("Done", "Cancelled", …). */
export function statusWord(k: StatusKey): string { return STATUS[k].word; }

// ---------------- Dates + times ----------------

const NY = 'America/New_York';
/** Today in New York, YYYY-MM-DD. */
export function todayYmd(now: Date = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: NY });
}
/** "16:00" / "16:00:00" → "4:00 PM" ('' when not a time). */
export function time12(t: string | null | undefined): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(clean(t));
  if (!m) return '';
  const h = Number(m[1]);
  return `${h % 12 === 0 ? 12 : h % 12}:${m[2]} ${h >= 12 ? 'PM' : 'AM'}`;
}
/** "2026-10-23" → "Thu Oct 23" (adds the year when it isn't this year's). */
export function dayText(ymd: string | null | undefined, today: string = todayYmd()): string {
  const d = clean(ymd).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return '';
  const dt = new Date(`${d}T12:00:00Z`);
  const s = dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }).replace(',', '');
  return d.slice(0, 4) === today.slice(0, 4) ? s : `${s}, ${d.slice(0, 4)}`;
}
/** '' today, "tomorrow", "yesterday", else "Thu Oct 23". */
export function dayWord(ymd: string | null | undefined, today: string = todayYmd()): string {
  const d = clean(ymd).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || d === today) return '';
  const diff = Math.round((Date.parse(`${d}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);
  if (diff === 1) return 'tomorrow';
  if (diff === -1) return 'yesterday';
  return dayText(d, today);
}
/**
 * A date (YYYY-MM-DD) + wall-clock time (HH:MM) the one way:
 *   "4:00 PM" (today) · "tomorrow 9:00 AM" · "yesterday 9:00 AM" · "Thu Oct 23 · 4:00 PM" · "Thu Oct 23" (no time)
 */
export function whenText(ymd: string | null | undefined, hm?: string | null, today: string = todayYmd()): string {
  const t = time12(hm);
  const day = dayWord(ymd, today);
  if (!day) return t || (clean(ymd) ? 'today' : '');
  if (!t) return day;
  return /^(tomorrow|yesterday)$/.test(day) ? `${day} ${t}` : `${day} · ${t}`;
}
/** The New York date + time of a timestamp. */
export function nyParts(at: string | number | Date): { ymd: string; hm: string } | null {
  const d = at instanceof Date ? at : new Date(at);
  if (Number.isNaN(d.getTime())) return null;
  const ymd = d.toLocaleDateString('en-CA', { timeZone: NY });
  const hm = d.toLocaleTimeString('en-GB', { timeZone: NY, hour: '2-digit', minute: '2-digit', hour12: false });
  return { ymd, hm: hm.replace(/^24/, '00') };
}
/** A timestamp the one way ("4:00 PM" / "tomorrow 9:00 AM" / "Thu Oct 23 · 4:00 PM"); '' when empty or bad. */
export function whenAt(at: string | number | Date | null | undefined, today: string = todayYmd()): string {
  if (at == null || at === '') return '';
  const p = nyParts(at);
  return p ? whenText(p.ymd, p.hm, today) : '';
}
/** The New York time of a timestamp ("4:00 PM"). */
export function timeAt(at: string | number | Date | null | undefined): string {
  if (at == null || at === '') return '';
  const p = nyParts(at);
  return p ? time12(p.hm) : '';
}
/**
 * Oct 27 client ("Always write date"): when a message was sent, the one way for every
 * conversation (bubbles + message rows): always the day + time, also for today —
 * "Tue Oct 27 · 6:42 PM"; another year adds it: "Mon Dec 30, 2025 · 6:42 PM". New York time.
 */
export function msgWhen(at: string | number | Date | null | undefined, today: string = todayYmd()): string {
  if (at == null || at === '') return '';
  const p = nyParts(at);
  return p ? `${dayText(p.ymd, today)} · ${time12(p.hm)}` : '';
}
/** The New York day of a timestamp ("Thu Oct 23"). */
export function dayAt(at: string | number | Date | null | undefined, today: string = todayYmd()): string {
  if (at == null || at === '') return '';
  const p = nyParts(at);
  return p ? dayText(p.ymd, today) : '';
}
