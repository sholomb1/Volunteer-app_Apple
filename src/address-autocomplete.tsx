/**
 * AddressAutocomplete — a text input with Google Places (New) autocomplete
 * suggestions in a dropdown as the user types. Locked-down at build time to
 * an HTTP-referrer-restricted key (VITE_GOOGLE_PLACES_KEY).
 *
 * Session tokens: we generate one per address-entry "session" so the whole
 * typing-then-picking sequence is billed as a single Google session (~$0.017
 * for autocomplete). A new token is minted after each pick or after 3
 * minutes of idle, per Google's session-token guidance.
 *
 * The component is intentionally UNCONTROLLED-ish: it takes a `value` +
 * `onChange` (like a plain input) and calls `onChange(text)` on every
 * keystroke. When a suggestion is picked, it fires `onChange(fullAddress)`
 * and, if provided, `onPick({ address, placeId })` for consumers that want
 * to store the Google place_id alongside the free-text address.
 */
import { useEffect, useRef, useState } from 'react';
import { MapPin } from 'lucide-react';

const PLACES_KEY = (import.meta as any).env?.VITE_GOOGLE_PLACES_KEY as string | undefined;
const PLACES_URL = 'https://places.googleapis.com/v1/places:autocomplete';

type Suggestion = {
  placeId: string;
  main: string;
  secondary: string;
  full: string;
};

// Minimal UUID v4 for the session token (no external dependency).
function uuid(): string {
  const b = new Uint8Array(16);
  (globalThis.crypto ?? require('crypto').webcrypto).getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}

export function AddressAutocomplete({
  value,
  onChange,
  onPick,
  placeholder = 'Street, city',
  className = '',
  disabled = false,
}: {
  value: string;
  onChange: (v: string) => void;
  onPick?: (info: { address: string; placeId: string }) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionRef = useRef<{ token: string; startedAt: number }>({ token: uuid(), startedAt: Date.now() });
  const wrap = useRef<HTMLDivElement | null>(null);
  const debounceRef = useRef<any>(null);

  // Rotate the session token if it's older than 3 minutes so we don't ride
  // one dead session for a whole workday.
  function ensureFreshSession() {
    if (Date.now() - sessionRef.current.startedAt > 3 * 60_000) {
      sessionRef.current = { token: uuid(), startedAt: Date.now() };
    }
  }

  // Close the dropdown on outside click / touch. Listen for pointer + touch
  // + mouse so tablets and touch-only Chromebooks close reliably.
  useEffect(() => {
    function onDoc(e: Event) {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('pointerdown', onDoc, true);
    document.addEventListener('mousedown', onDoc, true);
    document.addEventListener('touchstart', onDoc, true);
    return () => {
      document.removeEventListener('pointerdown', onDoc, true);
      document.removeEventListener('mousedown', onDoc, true);
      document.removeEventListener('touchstart', onDoc, true);
    };
  }, []);

  function fetchSuggestions(q: string) {
    if (!PLACES_KEY) {
      setError('Address suggestions unavailable (missing API key)');
      return;
    }
    if (q.trim().length < 3) {
      setSuggestions([]);
      setLoading(false);
      return;
    }
    ensureFreshSession();
    setLoading(true);
    setError(null);
    fetch(PLACES_URL, {
      method: 'POST',
      // Force the browser to send the FULL current URL as Referer instead of
      // just the origin. Google's HTTP-referrer key restriction is a glob
      // (e.g. staging.zehlzeh.org/*), and the origin-only Referer that
      // strict-origin-when-cross-origin produces (bare hostname, no path)
      // doesn't match the * — Google returns 403. Full-URL referrer matches
      // the same pattern that curl-with-referrer works under.
      referrerPolicy: 'no-referrer-when-downgrade',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': PLACES_KEY,
      },
      body: JSON.stringify({
        input: q,
        sessionToken: sessionRef.current.token,
        // Bias toward the US; the app is for Monsey/Rockland-area food rescue.
        includedRegionCodes: ['us'],
      }),
    })
      .then((r) => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((data: any) => {
        const list: Suggestion[] = (data?.suggestions ?? [])
          .map((s: any) => s.placePrediction)
          .filter(Boolean)
          .map((p: any) => ({
            placeId:   p.placeId,
            main:      p.structuredFormat?.mainText?.text ?? p.text?.text ?? '',
            secondary: p.structuredFormat?.secondaryText?.text ?? '',
            full:      p.text?.text ?? '',
          }));
        setSuggestions(list.slice(0, 6));
      })
      .catch((e) => setError(String(e?.message ?? e)))
      .finally(() => setLoading(false));
  }

  function onInputChange(v: string) {
    onChange(v);
    setOpen(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(v), 220);
  }

  function pick(s: Suggestion) {
    onChange(s.full);
    onPick?.({ address: s.full, placeId: s.placeId });
    setOpen(false);
    setSuggestions([]);
    // Google recommends a fresh session token after each pick.
    sessionRef.current = { token: uuid(), startedAt: Date.now() };
  }

  return (
    <div ref={wrap} className="relative">
      <input
        value={value}
        onChange={(e) => onInputChange(e.target.value)}
        onFocus={() => value && suggestions.length > 0 && setOpen(true)}
        placeholder={placeholder}
        disabled={disabled}
        className={className}
        autoComplete="off"
      />
      {open && (suggestions.length > 0 || loading || error) && (
        <div className="absolute left-0 right-0 mt-1.5 bg-paper border border-line rounded-[10px] shadow-lift z-[2100] max-h-[320px] overflow-y-auto">
          {loading && suggestions.length === 0 && (
            <div className="px-3 py-2 text-[12.5px] text-muted">Searching…</div>
          )}
          {error && (
            <div className="px-3 py-2 text-[12.5px] text-clay">{error}</div>
          )}
          {suggestions.map((s) => (
            <button
              key={s.placeId}
              type="button"
              onClick={() => pick(s)}
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
