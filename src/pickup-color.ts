/**
 * Oct 21 client: "Cleaner Live Board" — one simple color per pickup card.
 *   green   = covered and fine (all its drivers, on the way, or done … done is grey, see below)
 *   red     = needs attention (still needs drivers and its time is near / past, a store CANCEL
 *             that didn't cancel it, a held "food today?" check with no answer, a confirmation
 *             still pending after its time)
 *   orange  = needs confirmation today (confirmation_state 'pending'), from 3 hours before its time
 *   grey    = finished or cancelled
 *   neutral = open, not urgent yet
 *   hidden  = needs confirmation but more than 3 hours away (not on the board yet)
 * Pure: no React, no dates read here (the caller passes nowMs). Tests: scripts/pickup-color.test.mjs.
 */
import { STATUS } from './display.ts'; // .ts: node --test loads this file directly

export type PickupColor ='green' | 'red' | 'orange' | 'grey' | 'neutral' | 'hidden';

export type PickupColorInput = {
  status: string | null | undefined;
  cancelled: boolean;            // cancelled_at set
  confirmationPending: boolean;  // confirmation_state 'pending' (held: no driver texts yet)
  startMs: number;               // scheduled date + time
  nowMs: number;
  need: number;                  // driver spots still open (0 = covered)
  storeCancelOpen?: boolean;     // store / donor replied CANCEL and it was NOT cancelled
  foodCheckAlert?: boolean;      // held "food today?" with no answer — call the store
  dropOffOnly?: boolean;         // Oct 22 client: steady "only counts when they show up" — never needs attention
};

/** Minutes before its time a pickup with no driver turns red (the 30-min escalation step). */
export const RED_BEFORE_MIN = 30;
/** Hours before its time a needs-confirmation pickup shows on the board (orange). */
export const CONFIRM_SHOW_HOURS = 3;

const FINISHED = new Set(['completed', 'delivered', 'cancelled', 'missed', 'expired']);

export function pickupColor(p: PickupColorInput): PickupColor {
  const s = String(p.status ?? '').toLowerCase();
  if (p.cancelled || FINISHED.has(s)) return 'grey';
  if (p.storeCancelOpen) return 'red';
  if (p.dropOffOnly) return 'grey'; // Oct 22 client: drop-off days are quiet (nobody goes there)
  const minsToStart = (p.startMs - p.nowMs) / 60_000;
  if (p.confirmationPending) {
    if (p.foodCheckAlert || minsToStart <= 0) return 'red';
    return minsToStart <= CONFIRM_SHOW_HOURS * 60 ? 'orange' : 'hidden';
  }
  if (p.foodCheckAlert) return 'red';
  if (s === 'picked_up' || s === 'en_route') return 'green';
  if (p.need > 0) return minsToStart <= RED_BEFORE_MIN ? 'red' : 'neutral';
  return 'green';
}

/** Card classes per color: a left color bar + a light tint (design tokens only). */
export const COLOR_CARD: Record<Exclude<PickupColor, 'hidden'>, { bar: string; card: string; label: string }> = {
  green:   { bar: 'bg-forest',  card: 'border-sage-line bg-sage/70',        label: 'Covered' },
  red:     { bar: 'bg-red-600', card: 'border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/40',         label: 'Needs attention' },
  orange:  { bar: 'bg-amber',   card: 'border-amber/60 bg-amber-soft/60',   label: 'Needs confirmation' },
  grey:    { bar: 'bg-line-2',  card: 'border-line bg-cream/70',            label: 'Finished' },
  neutral: { bar: 'bg-line',    card: 'border-line bg-paper',               label: 'Open' },
};

/**
 * Oct 22 client: finished / cancelled rows stay on the Live Board ("Hide finished" hides them) but are not
 * grey: a white card, light border, and a small muted pill — "✓ Done 2:40 PM", "✓ Done · no kiosk",
 * "Cancelled", "Missed", "Expired". A drop-off steady day (quiet, nobody goes) shows its own label.
 */
export type FinishedKind = 'done' | 'nokiosk' | 'cancelled' | 'missed' | 'expired' | 'quiet';
export function finishedPill(x: {
  status: string | null | undefined; cancelled: boolean; cancelReason?: string | null;
  noKiosk?: boolean; doneAt?: string | null; openLabel?: string;
}): { kind: FinishedKind; text: string; cls: string } {
  // Oct 23 client ("same style everywhere"): words + colors from the one map (src/display.ts STATUS).
  const s = String(x.status ?? '').toLowerCase();
  const reason = String(x.cancelReason ?? '');
  if (s === 'cancelled' || (x.cancelled && s !== 'missed')) {
    return reason === 'No drop-off today' || reason === 'drop-off place: no set days' // Oct 29 client
      ? { kind: 'cancelled', text: STATUS.no_dropoff.word, cls: STATUS.no_dropoff.pill }
      : { kind: 'cancelled', text: STATUS.cancelled.word, cls: STATUS.cancelled.pill };
  }
  if (s === 'missed' || s === 'expired') {
    return /^expired|no driver claimed/i.test(reason) || s === 'expired'
      ? { kind: 'expired', text: STATUS.expired.word, cls: STATUS.expired.pill } : { kind: 'missed', text: STATUS.missed.word, cls: STATUS.missed.pill };
  }
  if (s === 'completed' || s === 'delivered') {
    if (x.noKiosk) return { kind: 'nokiosk', text: `✓ ${STATUS.nokiosk.word}`, cls: STATUS.nokiosk.pill };
    const t = x.doneAt ? new Date(x.doneAt) : null;
    const at = t && !Number.isNaN(t.getTime()) ? t.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' }) : '';
    return { kind: 'done', text: at ? `✓ ${STATUS.done.word} ${at}` : `✓ ${STATUS.done.word}`, cls: STATUS.done.pill };
  }
  return { kind: 'quiet', text: x.openLabel || 'Drop-off day', cls: STATUS.cancelled.pill };
}

/** "just now" / "12 min ago" / "1 h 5 min ago" / "3 h ago". */
export function agoText(atMs: number, nowMs: number): string {
  const m = Math.max(0, Math.floor((nowMs - atMs) / 60_000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  return h >= 3 || m % 60 === 0 ? `${h} h ago` : `${h} h ${m % 60} min ago`;
}
