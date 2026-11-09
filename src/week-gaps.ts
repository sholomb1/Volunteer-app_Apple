/**
 * Nov 6 Yakov: in Dispatch → Schedule → "This week" every day showed the same chip "Sat 9:30 PM – Fri 1:16 AM No one"
 * (one long gap over the whole week, printed on every day it touched). Each day now shows only its own part of a gap,
 * cut to that day's row (6 AM – 2 AM), and a day with nobody on it at all says so in one short line.
 * Pure (no React) so scripts/week-gaps.test.mjs can check it.
 */
export type Span = { from: number; to: number };

/** The part of a "no one scheduled" gap on one day's row [dayStart, barEnd); null when under `minMs` (default 15 min). */
export function clipGap(g: Span, dayStart: number, barEnd: number, minMs = 15 * 60e3): Span | null {
  const from = Math.max(g.from, dayStart), to = Math.min(g.to, barEnd);
  return to - from >= minMs ? { from, to } : null;
}

/** One line when the day's gaps (already clipped) cover its whole row with nobody on shift / put on by hand:
 *  "No one scheduled all day", or today from now on "No one scheduled the rest of the day". Otherwise null
 *  (the gaps show with their times, e.g. Friday "9:30 AM – 7 PM No one"). */
export function noOneLabel(gaps: Span[], someoneOn: boolean, dayStart: number, barEnd: number, now: number): string | null {
  if (someoneOn || gaps.length === 0) return null;
  const s = [...gaps].sort((a, b) => a.from - b.from);
  let end = s[0]!.from;
  for (const g of s) { if (g.from > end + 60e3) return null; end = Math.max(end, g.to); }
  if (end < barEnd - 60e3) return null;
  if (s[0]!.from <= dayStart + 60e3) return 'No one scheduled all day';
  if (s[0]!.from <= now + 60e3) return 'No one scheduled the rest of the day';
  return null;
}
