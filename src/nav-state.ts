/**
 * Coordinator-portal URL-hash sync.
 *
 * Client ask (Sep 2): refreshing the browser inside the portal bounced the
 * user back to the Home / Live Board. The portal is a single SPA route whose
 * section + sub-tab + open conversation all lived in component `useState`, so
 * a reload reset them to defaults.
 *
 * This keeps a small, deep-linkable slug in the URL hash:
 *
 *     #coord/<tab>[/<sub>[/<thread>]]
 *   e.g.  #coord/sms-combo/threads/8453762748
 *         #coord/pickups/upcoming
 *
 * Each state level restores itself from the hash on mount and writes its own
 * segment on change (via history.replaceState so the back button isn't spammed
 * and no extra history entries pile up). Unknown/empty hash → normal defaults.
 */
export type CoordNav = { tab?: string; sub?: string; thread?: string };

/** Parse the current coordinator nav out of the URL hash. */
export function readCoordNav(): CoordNav {
  try {
    const raw = window.location.hash.replace(/^#\/?/, '');
    if (!raw.startsWith('coord')) return {};
    const parts = raw.split('/').map((p) => {
      try { return decodeURIComponent(p); } catch { return p; }
    });
    return {
      tab: parts[1] || undefined,
      sub: parts[2] || undefined,
      thread: parts[3] || undefined,
    };
  } catch {
    return {};
  }
}

function build(nav: CoordNav): string {
  let h = 'coord';
  if (nav.tab) h += '/' + encodeURIComponent(nav.tab);
  if (nav.tab && nav.sub) h += '/' + encodeURIComponent(nav.sub);
  if (nav.tab && nav.sub && nav.thread) h += '/' + encodeURIComponent(nav.thread);
  return '#' + h;
}

/**
 * Replace the whole coordinator nav slug. Use on a SECTION switch — it clears
 * deeper levels (sub / thread) unless they're explicitly supplied.
 */
export function writeCoordNav(nav: CoordNav): void {
  try {
    const target = build(nav);
    if (window.location.hash !== target) {
      window.history.replaceState(null, '', target);
    }
  } catch {
    /* replaceState can throw in exotic sandboxes — nav sync is best-effort */
  }
}

/**
 * Merge a partial change into the current nav. Use from child panels that own
 * a single segment (sub-tab, open conversation) so they don't wipe the levels
 * owned by other components. Pass `undefined` for a key to clear that level.
 */
export function patchCoordNav(patch: CoordNav): void {
  writeCoordNav({ ...readCoordNav(), ...patch });
}
