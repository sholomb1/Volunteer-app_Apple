/**
 * Oct 30 client: New pickup with no store picked, but the address is a saved store's → that store.
 * Same rule as the API (vp-api src/store-by-address.ts — keep the two the same): the street line
 * (number + street; case, punctuation, Rd/Road, St/Street, Ave/Avenue... tidied) must be EXACTLY the
 * address of ONE active saved store. The server links it on save; this only shows the line first.
 */

const WORD: Record<string, string> = {
  road: 'rd', street: 'st', str: 'st', avenue: 'ave', av: 'ave', aven: 'ave', lane: 'ln', drive: 'dr', drv: 'dr',
  court: 'ct', crt: 'ct', place: 'pl', boulevard: 'blvd', blv: 'blvd', terrace: 'ter', terr: 'ter', circle: 'cir',
  parkway: 'pkwy', pky: 'pkwy', highway: 'hwy', route: 'rte', rt: 'rte', turnpike: 'tpke', tpk: 'tpke',
  square: 'sq', trail: 'trl', extension: 'ext', heights: 'hts', mount: 'mt', mountain: 'mtn', crescent: 'cres',
  north: 'n', south: 's', east: 'e', west: 'w', apartment: 'apt', suite: 'ste', unit: 'unit',
};
const SUFFIXES = new Set(['rd', 'st', 'ave', 'ln', 'dr', 'ct', 'pl', 'blvd', 'ter', 'cir', 'pkwy', 'hwy', 'tpke', 'sq', 'trl', 'way', 'ext', 'cres', 'loop', 'row', 'path', 'walk', 'pass', 'run', 'xing', 'plz']);
const TOWNS = ['monsey', 'spring valley', 'suffern', 'airmont', 'pomona', 'new city', 'nanuet', 'wesley hills', 'chestnut ridge',
  'montebello', 'new hempstead', 'viola', 'tallman', 'hillcrest', 'ramapo', 'kaser', 'new square', 'pearl river', 'haverstraw'];

/** "51 Carlton Road, Monsey, NY, USA" → "51 carlton rd"; null when it isn't a house number + street. */
export function streetKey(addr: unknown): string | null {
  const first = String(addr ?? '').split(',')[0] ?? '';
  let w = first.toLowerCase().replace(/['’`.]/g, '').split(/[^a-z0-9]+/).filter(Boolean).map((x) => WORD[x] ?? x);
  const hadComma = String(addr ?? '').includes(',');
  if (!hadComma) {
    for (let changed = true; changed && w.length > 2;) {
      changed = false;
      const last = w[w.length - 1]!;
      if (/^\d{5}(\d{4})?$/.test(last) && w.length > 2) { w = w.slice(0, -1); changed = true; continue; }
      if (['usa', 'us', 'ny'].includes(last)) { w = w.slice(0, -1); changed = true; continue; }
      if (w.length >= 2 && w[w.length - 2] === 'new' && last === 'york') { w = w.slice(0, -2); changed = true; continue; }
      for (const town of TOWNS) {
        const t = town.split(' ');
        if (w.length > t.length + 1 && t.every((x, i) => w[w.length - t.length + i] === x) && SUFFIXES.has(w[w.length - t.length - 1]!)) {
          w = w.slice(0, -t.length); changed = true; break;
        }
      }
    }
  }
  if (w.length < 2 || !/^\d+[a-z]?$/.test(w[0]!)) return null;
  return w.join(' ');
}

type StoreRow = { id: number | string; name: string; addressLine1?: string | null; address_line1?: string | null; status?: string | null };

/** The ONE active store at this street line, else null (none, or two or more). */
export function oneStoreAtAddress<T extends StoreRow>(addr: unknown, stores: T[]): T | null {
  const key = streetKey(addr);
  if (!key) return null;
  const hits = new Map<string, T>();
  for (const s of stores ?? []) {
    if (String(s.status ?? '') === 'awaiting_approval') continue;
    if (streetKey(s.addressLine1 ?? s.address_line1 ?? null) === key) hits.set(String(s.id), s);
  }
  return hits.size === 1 ? [...hits.values()][0]! : null;
}
