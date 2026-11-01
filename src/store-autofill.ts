// Oct 16 client: New pickup — picking a saved store fills everything we know about it.
// Pure helpers (tested in scripts/store-autofill.test.mjs).

/** "Stamford Yeshiva - 51 Carlton Rd" -> "51 Carlton Rd". Only a part after " - " that starts
 *  with a house number counts ("Borov - Guttesman" -> ""). */
export function addressFromStoreName(name: unknown): string {
  const m = /\s[-–—]\s*(\d+[A-Za-z]?\s+[A-Za-z].*)$/.exec(String(name ?? '').trim());
  return m ? m[1].trim() : '';
}

/** The store's saved address line ("51 Carlton Road, Monsey"), else the address in its name. */
export function storeFillAddress(saved: string, name: unknown): string {
  return saved.trim() || addressFromStoreName(name);
}

/** Supplier list keyboard: move the highlighted row (-1 = none) by delta, within 0..len-1. */
export function moveHighlight(hi: number, delta: number, len: number): number {
  if (len <= 0) return -1;
  if (hi < 0) return delta > 0 ? 0 : len - 1;
  return Math.max(0, Math.min(len - 1, hi + delta));
}

/** Enter: the highlighted row, else the first match once something is typed; -1 = nothing. */
export function enterPickIndex(hi: number, len: number, typed: string): number {
  if (len <= 0) return -1;
  if (hi >= 0 && hi < len) return hi;
  return typed.trim() ? 0 : -1;
}
