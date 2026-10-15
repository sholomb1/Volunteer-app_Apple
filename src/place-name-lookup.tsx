/**
 * Oct 11 client: "If I type Evergreen as the store, it should find Evergreen's
 * location so I don't have to type the address."
 *
 * PlaceNameInput — a store-name box that suggests matching places around Monsey
 * (Google, through our API) as you type. Picking one hands back name, address,
 * city/state/zip, phone and map spot; ignoring the list just keeps what you typed.
 *
 * MissingLocationsModal — Suppliers → "Find missing locations": looks up active
 * stores with no map spot, the office ticks which matches to save.
 */
import { useEffect, useRef, useState } from 'react';
import { MapPin, X } from 'lucide-react';
import { API_BASE, api, getToken } from './api';

export type PickedPlace = {
  placeId: string; name: string; formatted: string;
  line1: string | null; city: string | null; state: string | null; zip: string | null;
  phone: string | null; lat: number | null; lng: number | null;
};
type Suggestion = { placeId: string; main: string; secondary: string };

function newToken(): string {
  const b = new Uint8Array(16);
  globalThis.crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

async function post<T>(path: string, body: unknown, office: boolean): Promise<T | null> {
  if (office) return api<T>(path, { method: 'POST', body: JSON.stringify(body) }).catch(() => null);
  const token = getToken();
  try {
    const r = await fetch((API_BASE || '').replace(/\/$/, '') + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
    if (!r.ok || !(r.headers.get('content-type') || '').includes('application/json')) return null;
    return (await r.json()) as T;
  } catch { return null; }
}

/** Drop the trailing ", USA" Google adds. */
export function shortAddress(p: PickedPlace): string {
  return (p.formatted || [p.line1, p.city, [p.state, p.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ')).replace(/,\s*USA$/, '');
}

export function PlaceNameInput({ value, onChange, onPick, office = false, className = '', placeholder, id, required }: {
  value: string; onChange: (v: string) => void; onPick: (p: PickedPlace) => void;
  /** true = office route (login required); false = public sign-up route (rate-limited). */
  office?: boolean; className?: string; placeholder?: string; id?: string; required?: boolean;
}) {
  const [list, setList] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const wrap = useRef<HTMLDivElement | null>(null);
  const timer = useRef<any>(null);
  const session = useRef(newToken());
  const seq = useRef(0);
  const base = office ? '/api/geocode/office' : '/api/geocode';

  useEffect(() => {
    function onDoc(e: Event) { if (!wrap.current?.contains(e.target as Node)) setOpen(false); }
    document.addEventListener('pointerdown', onDoc, true);
    return () => { document.removeEventListener('pointerdown', onDoc, true); if (timer.current) clearTimeout(timer.current); };
  }, []);

  function lookup(q: string) {
    if (q.trim().length < 3) { setList([]); setLoading(false); return; }
    const mine = ++seq.current;
    setLoading(true);
    void post<{ data: { suggestions: Suggestion[] } }>(`${base}/autocomplete`, { input: q.trim(), kind: 'place', sessionToken: session.current }, office)
      .then((d) => { if (mine === seq.current) setList((d?.data?.suggestions ?? []).slice(0, 5)); })
      .finally(() => { if (mine === seq.current) setLoading(false); });
  }

  function type(v: string) {
    onChange(v);
    setOpen(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => lookup(v), 350);
  }

  async function pick(s: Suggestion) {
    setOpen(false);
    setList([]);
    onChange(s.main);
    const d = await post<{ data: PickedPlace }>(`${base}/details`, { placeId: s.placeId, sessionToken: session.current }, office);
    session.current = newToken();
    if (d?.data) onPick({ ...d.data, name: d.data.name || s.main });
  }

  return (
    <div ref={wrap} className="relative">
      <input id={id} required={required} value={value} onChange={(e) => type(e.target.value)}
             onFocus={() => { if (list.length) setOpen(true); }}
             placeholder={placeholder} className={className} autoComplete="off" data-place-lookup="1" />
      {open && (list.length > 0 || loading) && (
        <div className="absolute left-0 right-0 mt-1.5 bg-paper border border-line rounded-[10px] shadow-lift z-[2100] max-h-[320px] overflow-y-auto">
          <div className="px-3 py-1.5 text-[11.5px] font-bold text-muted border-b border-line/60">
            {loading && !list.length ? 'Searching…' : 'Pick one to fill the address — or keep typing'}
          </div>
          {list.map((s) => (
            <button key={s.placeId} type="button" onClick={() => void pick(s)}
                    className="w-full text-left px-3 py-2 border-b border-line/60 last:border-b-0 hover:bg-cream/50 flex items-start gap-2 haptic">
              <MapPin size={13} className="text-forest mt-0.5 shrink-0" />
              <div className="min-w-0">
                <div className="font-bold text-[13px] text-ink truncate">{s.main}</div>
                {s.secondary && <div className="text-[11.5px] text-muted truncate">{s.secondary}</div>}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

type ReviewRow = {
  id: number; name: string; status: string | null;
  have: { addressLine1: string | null; city: string | null; contactPhone: string | null };
  match: { name: string; address: string; phone: string | null; lat: number | null; lng: number | null } | null;
  confident: boolean; why: string; willFill: string[];
};
const FILL_LABEL: Record<string, string> = {
  latitude: 'map spot', addressLine1: 'address', city: 'city', state: 'state', zip: 'zip', contactPhone: 'phone',
};

export function MissingLocationsModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [rows, setRows] = useState<ReviewRow[] | null>(null);
  const [ticked, setTicked] = useState<Set<number>>(new Set());
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let live = true;
    api<{ data: { rows: ReviewRow[]; failed: number } }>('/api/geocode/office/missing-locations', { method: 'POST', body: '{}' })
      .then((d) => {
        if (!live) return;
        setRows(d.data.rows);
        setTicked(new Set(d.data.rows.filter((r) => r.confident && r.willFill.includes('latitude')).map((r) => r.id)));
        if (d.data.failed) setErr(`${d.data.failed} lookups failed — try again later for those.`);
      })
      .catch((e) => { if (live) setErr(e?.message ?? 'Lookup failed'); });
    return () => { live = false; };
  }, []);

  async function save() {
    setBusy(true); setErr(null);
    try {
      const d = await api<{ data: { saved: number; skipped: number[] } }>('/api/geocode/office/missing-locations/save', { method: 'POST', body: JSON.stringify({ ids: [...ticked].map(Number) }) });
      setDone(`Saved ${d.data.saved} ${d.data.saved === 1 ? 'store' : 'stores'}${d.data.skipped.length ? ` (${d.data.skipped.length} skipped)` : ''}.`);
      onSaved();
    } catch (e: any) { setErr(e?.message ?? 'Save failed'); }
    finally { setBusy(false); }
  }

  const withMatch = (rows ?? []).filter((r) => r.match);
  const shown = showAll ? (rows ?? []) : withMatch;
  return (
    <div className="fixed inset-0 z-[2000] bg-ink/50 flex items-start justify-center pt-10 px-4">
      <div className="relative z-[2001] bg-paper rounded-[18px] shadow-lift border border-line w-full max-w-4xl max-h-[85vh] overflow-y-auto">
        <div className="sticky top-0 z-10 bg-paper border-b border-line px-5 py-3 flex items-center justify-between gap-3">
          <div className="font-display font-semibold text-[18px]">Find missing locations</div>
          <button onClick={onClose} className="haptic grid h-8 w-8 place-items-center rounded-full hover:bg-cream"><X size={17} /></button>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-[12.5px] text-muted">
            Stores with no map spot, and the best Google match around Monsey. Ticked = we're confident. Saving fills only empty fields
            (and the map spot) — nothing you already typed is changed.
          </p>
          {!rows && !err && <div className="text-[13px] text-muted">Looking up stores… (up to a minute)</div>}
          {err && <div className="text-[12.5px] text-clay font-bold">{err}</div>}
          {done && <div className="text-[13px] text-forest font-bold">{done}</div>}
          {rows && (
            <>
              <div className="flex items-center justify-between gap-2 flex-wrap text-[12px]">
                <span><b>{rows.length}</b> stores without a map spot · <b>{withMatch.length}</b> with a match · <b>{ticked.size}</b> ticked</span>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Show stores with no match too
                </label>
              </div>
              <div className="border border-line rounded-[12px] divide-y divide-line/70">
                {shown.map((r) => {
                  const can = !!r.match && r.willFill.includes('latitude') && r.why !== 'too far from Monsey';
                  return (
                    <label key={r.id} data-review-row={r.id} className={`flex items-start gap-3 px-3 py-2 text-[12.5px] ${can ? 'cursor-pointer hover:bg-cream/40' : 'opacity-60'}`}>
                      <input type="checkbox" className="mt-1" disabled={!can || !!done} checked={ticked.has(r.id)}
                             onChange={(e) => setTicked((t) => { const n = new Set(t); if (e.target.checked) n.add(r.id); else n.delete(r.id); return n; })} />
                      <div className="min-w-0 flex-1 grid sm:grid-cols-2 gap-x-4 gap-y-0.5">
                        <div className="min-w-0">
                          <div className="font-bold text-ink truncate">{r.name}</div>
                          <div className="text-muted truncate">{[r.have.addressLine1, r.have.city].filter(Boolean).join(', ') || 'No address'}{r.have.contactPhone ? ` · ${r.have.contactPhone}` : ''}</div>
                        </div>
                        <div className="min-w-0">
                          {r.match ? (
                            <>
                              <div className="font-semibold text-ink truncate">📍 {r.match.name}</div>
                              <div className="text-muted truncate">{r.match.address.replace(/,\s*USA$/, '')}{r.match.phone ? ` · ${r.match.phone}` : ''}</div>
                            </>
                          ) : <div className="text-muted">—</div>}
                          <div className={r.confident ? 'text-forest' : 'text-[#9a7415]'}>
                            {r.why}{r.willFill.length ? ` · fills: ${r.willFill.filter((k) => k !== 'longitude').map((k) => FILL_LABEL[k] ?? k).join(', ')}` : ''}
                          </div>
                        </div>
                      </div>
                    </label>
                  );
                })}
                {!shown.length && <div className="px-3 py-3 text-[12.5px] text-muted">Nothing to show.</div>}
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={onClose} className="haptic rounded-[10px] border border-line px-3 py-2 text-[12.5px] font-bold">Close</button>
                <button onClick={() => void save()} disabled={busy || !ticked.size || !!done}
                        className="haptic rounded-[10px] bg-forest px-3 py-2 text-[12.5px] font-bold text-paper disabled:opacity-50">
                  {busy ? 'Saving…' : `Save ticked (${ticked.size})`}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
