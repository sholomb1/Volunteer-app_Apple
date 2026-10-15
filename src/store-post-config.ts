/**
 * Oct 14 client: store "Food ready" form — choices (office-editable via
 * Admin -> Settings -> Store post form; GET /api/me/store-post-form) and the
 * helpers that turn taps into the columns drivers already read:
 *   food_description   = "Fleishig · Cooked, Baked — chicken & rice"
 *   estimated_quantity = "6 trays · fits in one car"
 *   slots_capacity     = drivers needed (1-4)
 * Car size (per unit): count <= oneCar -> one car, <= trunk -> trunk full, more -> van / 2 cars.
 */
export type StoreFood = { emoji: string; label: string };
export type StoreUnit = { label: string; oneCar: number; trunk: number };
export type StorePostFormCfg = { foods: StoreFood[]; units: StoreUnit[]; kosher: string[]; showPhoto: boolean; showKosher: boolean };

export const STORE_POST_FORM_DEFAULTS: StorePostFormCfg = {
  foods: [
    { emoji: '🍲', label: 'Cooked' },
    { emoji: '🥖', label: 'Baked' },
    { emoji: '🥕', label: 'Fruit/Veg' },
    { emoji: '🥛', label: 'Dairy' },
    { emoji: '🍗', label: 'Meat' },
    { emoji: '🥫', label: 'Packaged' },
    { emoji: '🧃', label: 'Drinks' },
  ],
  units: [
    { label: 'Trays', oneCar: 8, trunk: 20 },
    { label: 'Boxes', oneCar: 6, trunk: 15 },
    { label: 'Bags',  oneCar: 6, trunk: 15 },
    { label: 'Pans',  oneCar: 8, trunk: 20 },
  ],
  kosher: ['Fleishig', 'Milchig', 'Pareve'],
  showPhoto: true,
  showKosher: true,
};

export type CarSize = 'car' | 'trunk' | 'van';
export const CAR_SIZE: Record<CarSize, { icon: string; label: string; short: string }> = {
  car:   { icon: '🚗', label: 'Fits in one car',      short: 'fits in one car' },
  trunk: { icon: '🚗', label: 'Car trunk full',       short: 'car trunk full' },
  van:   { icon: '🚐', label: 'Needs a van or 2 cars', short: 'needs a van or 2 cars' },
};
export function carSize(count: number, unit: StoreUnit | undefined): CarSize {
  const u = unit ?? STORE_POST_FORM_DEFAULTS.units[0]!;
  return count <= u.oneCar ? 'car' : count <= u.trunk ? 'trunk' : 'van';
}

/** "Trays" -> "1 tray" / "6 trays"; "Boxes" -> "1 box". */
export function unitWord(label: string, count: number) {
  const l = label.toLowerCase();
  if (count !== 1) return l;
  if (/(x|s|ch|sh)es$/.test(l)) return l.slice(0, -2);
  if (l.endsWith('s')) return l.slice(0, -1);
  return l;
}

export function composeFood(kosher: string, types: string[], detail: string) {
  const what = [types.join(', '), detail.trim()].filter(Boolean).join(' — ');
  return [kosher, what].filter(Boolean).join(' · ');
}
export function composeAmount(count: number, unit: StoreUnit | undefined) {
  if (!unit) return '';
  return `${count} ${unitWord(unit.label, count)} · ${CAR_SIZE[carSize(count, unit)].short}`;
}

/** "Same as last time": read the stored text back into taps. Old free-text posts land in "detail". */
export function parseLast(cfg: StorePostFormCfg, food: string, amount: string) {
  let rest = String(food ?? '').trim();
  let kosher = '';
  const k = cfg.kosher.find((x) => rest.toLowerCase().startsWith(x.toLowerCase() + ' · '));
  if (k) { kosher = k; rest = rest.slice(k.length + 3).trim(); }
  const types: string[] = [];
  let other = '';
  let detail = rest;
  const dash = rest.indexOf(' — ');
  const head = dash >= 0 ? rest.slice(0, dash) : rest;
  const tail = dash >= 0 ? rest.slice(dash + 3) : '';
  const parts = head.split(',').map((x) => x.trim()).filter(Boolean);
  const labels = new Map(cfg.foods.map((f) => [f.label.toLowerCase(), f.label]));
  if (parts.length && parts.every((p) => labels.has(p.toLowerCase()) || p.toLowerCase().startsWith('other: '))) {
    for (const p of parts) {
      if (p.toLowerCase().startsWith('other: ')) other = p.slice(7);
      else types.push(labels.get(p.toLowerCase())!);
    }
    detail = tail;
  }
  let count = 1;
  let unit: string | null = null;
  const m = String(amount ?? '').trim().match(/^(\d{1,2})\s+([^\s·]+)/);
  if (m) {
    const w = m[2]!.toLowerCase();
    const u = cfg.units.find((x) => x.label.toLowerCase() === w || unitWord(x.label, 1) === w);
    if (u) { count = Math.min(99, Math.max(1, Number(m[1]))); unit = u.label; }
  }
  return { kosher, types, other, detail, count, unit };
}
