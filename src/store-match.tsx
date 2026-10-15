/**
 * Oct 11 client: public pickup forms recognize a store we already work with.
 * "Is this Evergreen 59, 59 NY-59 Monsey? Use it ✓ / No". Business info only
 * (id, business name, business address, store phone) from
 * GET /api/public/store-match — never contact people or past pickups.
 */
import { useEffect, useState } from 'react';
import { api } from './api';

export type StoreMatch = { id: number; name: string; address: string; phone: string | null };

/** Looks up the typed store name (debounced). null = nothing to suggest. */
export function useStoreMatch(name: string, enabled: boolean): StoreMatch | null {
  const [match, setMatch] = useState<StoreMatch | null>(null);
  useEffect(() => {
    const t = name.trim();
    if (!enabled || t.replace(/[^a-z0-9]/gi, '').length < 4) { setMatch(null); return; }
    let live = true;
    const h = setTimeout(() => {
      api<{ data: { match: StoreMatch | null } }>(`/api/public/store-match?name=${encodeURIComponent(t)}`)
        .then((r) => { if (live) setMatch(r?.data?.match ?? null); })
        .catch(() => { if (live) setMatch(null); });
    }, 500);
    return () => { live = false; clearTimeout(h); };
  }, [name, enabled]);
  return match;
}

export function StoreMatchPrompt({ match, onUse, onNo }: { match: StoreMatch; onUse: () => void; onNo: () => void }) {
  return (
    <div data-store-match className="mt-2 rounded-[12px] border-[1.4px] border-forest/40 bg-sage/30 px-3.5 py-2.5 text-[14px]">
      <div className="text-ink">Is this <b>{match.name}</b>, {match.address}?</div>
      <div className="mt-2 flex gap-2">
        <button type="button" onClick={onUse}
                className="min-h-[40px] rounded-[10px] bg-forest px-4 text-[14px] font-bold text-paper">Use it ✓</button>
        <button type="button" onClick={onNo}
                className="min-h-[40px] rounded-[10px] border border-line bg-paper px-4 text-[14px] font-bold text-muted">No</button>
      </div>
    </div>
  );
}
