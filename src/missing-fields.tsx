/**
 * Oct 29 client: "Form incomplete" didn't say WHAT was missing. One small helper for the office forms
 * (steady pickup, New / Edit pickup):
 *   - each missing field gets a red border and a small red line under it ("Pick a time");
 *   - the top message names them ("Missing: Days, Time");
 *   - the form scrolls to the first missing one;
 *   - the red goes away as soon as the field is filled (checks run on every render).
 * Red shows only after Save was pressed once.
 */
import { useState } from 'react';

export type FieldCheck = { key: string; label: string; message: string; ok: boolean };
export type MissingField = Omit<FieldCheck, 'ok'>;

/** Pure: the checks that fail, in form order. */
export function missingOf(checks: FieldCheck[]): MissingField[] {
  return checks.filter((c) => !c.ok).map(({ key, label, message }) => ({ key, label, message }));
}
/** Pure: "Missing: Days, Time" ('' when nothing is missing). */
export function missingSummary(m: MissingField[]): string {
  return m.length ? `Missing: ${m.map((x) => x.label).join(', ')}` : '';
}

/** Scroll the field marked data-field="<key>" into view (inside a scrolling modal too) and focus it. */
export function scrollToField(key: string): void {
  try {
    const el = document.querySelector<HTMLElement>(`[data-field="${key}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const input = el.querySelector<HTMLElement>('input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])');
    input?.focus({ preventScroll: true });
  } catch { /* no DOM (tests) */ }
}

/** Live checks for one form. `guard()` before saving: true = all there; false = red on, scrolled. */
export function useMissingFields(checks: FieldCheck[]) {
  const [tried, setTried] = useState(false);
  const missing = missingOf(checks);
  const shown = tried ? missing : [];
  return {
    /** The red line for a field, or undefined. */
    err: (key: string): string | undefined => shown.find((m) => m.key === key)?.message,
    /** "Missing: Days, Time" or ''. */
    summary: missingSummary(shown),
    guard: (): boolean => {
      if (missing.length === 0) return true;
      setTried(true);
      const first = missing[0]!.key;
      setTimeout(() => scrollToField(first), 0);
      return false;
    },
  };
}

/** The small red line under a missing field. */
export function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <p data-field-error className="mt-1 text-[11.5px] font-semibold text-clay">{msg}</p>;
}

/** Red border around a missing field's control (a wrapper, so any input / picker works). */
export const MISSING_RING = 'rounded-[10px] ring-2 ring-clay ring-offset-1';
