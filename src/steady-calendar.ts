/**
 * Oct 23 client: the Steady "Weekly coverage" calendar, neater. One short line per card
 * ("9:00 AM · The Hive"), one color per card (the Live Board tokens, src/pickup-color.ts),
 * the driver as "Moshe K. +1", empty days hidden, day headers with "⚠️ 3 need driver".
 * Pure: no React, no imports (the caller passes the tidy-name function from src/pickup-label.ts).
 * Tests: scripts/steady-calendar.test.mjs.
 */
export type CoverageStatus = 'committed' | 'ending_soon' | 'future_scheduled' | 'temporarily_covered' | 'needs_steady_driver' | 'paused';
export type CoverageRow = {
  steady_pickup_id: number; name: string | null; suppliers: string | null; pickup_time: string | null;
  day_of_week: number; coverage_status: CoverageStatus | string; pickup_type?: string | null; driver_names?: string[] | null;
  /** Oct 23 client: a Friday timed from candle lighting (time = this Friday's). */
  candle?: { time: string | null; label: string; text: string } | null;
};
export type CalColor = 'green' | 'red' | 'orange' | 'grey' | 'neutral';

export const COVERAGE_LABEL: Record<CoverageStatus, string> = {
  committed: 'Committed',
  ending_soon: 'Ending soon',
  future_scheduled: 'Future scheduled',
  temporarily_covered: 'Covered this week only',
  needs_steady_driver: 'Needs steady driver',
  paused: 'Paused',
};
export const coverageLabel = (s: string): string => COVERAGE_LABEL[s as CoverageStatus] ?? COVERAGE_LABEL.needs_steady_driver;

export const isDropOffRow = (r: Pick<CoverageRow, 'pickup_type'>) => String(r.pickup_type ?? '') === 'dropoff';

/** green = has a steady driver, red = needs one, orange = covered this week only, grey = paused or drop-off, neutral = a driver starts later. */
export function coverageColor(r: Pick<CoverageRow, 'coverage_status' | 'pickup_type'>): CalColor {
  const s = String(r.coverage_status);
  if (s === 'paused' || isDropOffRow(r)) return 'grey';
  if (s === 'committed' || s === 'ending_soon') return 'green';
  if (s === 'temporarily_covered') return 'orange';
  if (s === 'future_scheduled') return 'neutral';
  return 'red';
}

const norm = (s: unknown) => String(s ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/**
 * The card's name: the steady name, and the store only when it says something new.
 * "Bravo" + "Bravo Pizza (K)" → "Bravo Pizza (K)" (the more complete one); "Hive Deli" + "Hive Deli" → "Hive Deli";
 * "The Hive" + "Hive Discount Store" → title "The Hive", sub "Hive Discount Store".
 */
export function cardNames(name: string | null | undefined, suppliers: string | null | undefined, tidy: (s: string) => string = (s) => s.trim()): { title: string; sub: string } {
  const n = tidy(String(name ?? ''));
  const s = tidy(String(suppliers ?? ''));
  if (!s) return { title: n, sub: '' };
  if (!n) return { title: s, sub: '' };
  const a = norm(n); const b = norm(s);
  if (a === b) return { title: s.length >= n.length ? s : n, sub: '' };
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  if (shorter.length >= 3 && longer.includes(shorter)) return { title: b.length >= a.length ? s : n, sub: '' };
  return { title: n, sub: s };
}

/**
 * Oct 28 client: the "steady pickups needed" flyer shows ONE clear name per pickup. Same rule as the
 * calendar card (cardNames), and also "The Hive" + "Hive Discount Store" is one place (a leading "The"
 * doesn't count) → "Hive Discount Store". Different places keep the store as the second line.
 */
export function flyerNames(name: string | null | undefined, suppliers: string | null | undefined, tidy: (s: string) => string = (s) => s.trim()): { title: string; sub: string } {
  const base = cardNames(name, suppliers, tidy);
  if (!base.sub) return base;
  const noThe = (s: string | null | undefined) => String(s ?? '').replace(/^\s*the\s+/i, '');
  if (cardNames(noThe(name), noThe(suppliers), tidy).sub) return base;
  const n = tidy(String(name ?? '')); const s = tidy(String(suppliers ?? ''));
  return { title: s.length >= n.length ? s : n, sub: '' };
}

/** "" | "Moshe K." | "Moshe K. +1". */
export function driversShort(names: string[] | null | undefined): string {
  const list = (names ?? []).map((x) => String(x ?? '').trim()).filter(Boolean);
  if (list.length === 0) return '';
  return list.length === 1 ? list[0]! : `${list[0]} +${list.length - 1}`;
}

/** "09:00:00" → "9:00 AM". */
export function shortTime(t: string | null | undefined): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t ?? '').trim());
  if (!m) return '';
  const h = Number(m[1]);
  return `${h % 12 === 0 ? 12 : h % 12}:${m[2]} ${h >= 12 ? 'PM' : 'AM'}`;
}

/** Rows per day (0 = Sunday), each day sorted by time (no time last), then name. */
export function groupByDay<T extends CoverageRow>(rows: T[]): T[][] {
  const out: T[][] = [[], [], [], [], [], [], []];
  for (const r of rows) { const d = Number(r.day_of_week); if (d >= 0 && d <= 6) out[d]!.push(r); }
  const key = (r: T) => String(r.candle?.time ?? r.pickup_time ?? '99:99'); // Oct 23 client: candle Fridays by this week's time
  for (const day of out) day.sort((a, b) => key(a).localeCompare(key(b)) || String(a.name ?? '').localeCompare(String(b.name ?? '')));
  return out;
}

/** Days that have at least one card (an empty day, like Saturday, is hidden). */
export const visibleDays = (byDay: unknown[][]): number[] => byDay.map((d, i) => (d.length > 0 ? i : -1)).filter((i) => i >= 0);

export const needCount = (rows: CoverageRow[]) => rows.filter((r) => r.coverage_status === 'needs_steady_driver').length;

/** "TUE · 11 · ⚠️ 3 need driver" (the warning only when > 0). */
export function dayHeader(abbr: string, rows: CoverageRow[]): string {
  const need = needCount(rows);
  return `${abbr.toUpperCase()} · ${rows.length}${need > 0 ? ` · ⚠️ ${need} need driver` : ''}`;
}

/** The phone opens on today; when today has nothing, the next day that has something. */
export function startDay(days: number[], todayDow: number): number {
  if (days.length === 0) return todayDow;
  for (let k = 0; k < 7; k++) { const d = (todayDow + k) % 7; if (days.includes(d)) return d; }
  return days[0]!;
}

/** ◀ ▶ on the phone: the previous / next visible day (wraps around the week). */
export function stepDay(days: number[], current: number, dir: 1 | -1): number {
  if (days.length === 0) return current;
  const i = days.indexOf(current);
  if (i < 0) return startDay(days, current);
  return days[(i + dir + days.length) % days.length]!;
}
