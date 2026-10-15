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
import { API_BASE, maybeForcePortalReload, getToken } from './api';

// Server-side proxy for Google Places autocomplete. Some tablet WebViews strip the
// Referer header, which breaks the browser-side call (Google's HTTP-referrer
// restriction returns 403). Routing through vp-api's /api/geocode/autocomplete
// side-steps that — the server sends a fixed Referer that satisfies the allowlist.
const PROXY_URL = (API_BASE || '').replace(/\/$/, '') + '/api/geocode/autocomplete';

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
  lookupName = '',
}: {
  value: string;
  onChange: (v: string) => void;
  onPick?: (info: { address: string; placeId: string }) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  /** Oct 6 client: the store name typed above — searched automatically when the address is still empty. */
  lookupName?: string;
}) {
  const [nameHint, setNameHint] = useState<string | null>(null);
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
    if (q.trim().length < 3) {
      setSuggestions([]);
      setLoading(false);
      return;
    }
    ensureFreshSession();
    setLoading(true);
    setError(null);
    // Oct 6 client: our own stores + addresses we picked up from before come first
    // (signed-in portal users only), then Google's suggestions. No warning box when
    // Google is unavailable — the box simply works as a plain text field.
    const token = getToken();
    const local: Promise<Suggestion[]> = token
      ? fetch((API_BASE || '').replace(/\/$/, '') + `/api/address-suggest?q=${encodeURIComponent(q)}`, { headers: { Authorization: `Bearer ${token}` } })
          .then((r) => (r.ok ? r.json() : { data: [] }))
          .then((d: any) => (d?.data ?? []).map((x: any) => ({ placeId: `local:${x.kind}:${x.full}`, main: x.main, secondary: x.secondary, full: x.full })))
          .catch(() => [])
      : Promise.resolve([]);
    const google: Promise<Suggestion[]> = fetch(PROXY_URL, {
      method: 'POST',
      // Oct 11 client: signed-in users skip the public per-IP lookup limit.
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ input: q, sessionToken: sessionRef.current.token }),
    })
      .then(async (r) => {
        maybeForcePortalReload(r.headers.get('X-Portal-Reload-Since'));
        if (!r.ok || !(r.headers.get('content-type') || '').includes('application/json')) return [];
        const data: any = await r.json();
        return (data?.data?.suggestions ?? []).map((p: any) => ({
          placeId: p.placeId, main: p.main ?? p.full ?? '', secondary: p.secondary ?? '', full: p.full ?? '',
        }));
      })
      .catch(() => []);
    Promise.all([local, google])
      .then(([l, g]) => {
        const seen = new Set(l.map((x) => x.full.toLowerCase()));
        setSuggestions([...l.slice(0, 4), ...g.filter((x) => !seen.has(x.full.toLowerCase()))].slice(0, 7));
      })
      .finally(() => setLoading(false));
  }

  function onInputChange(v: string) {
    setNameHint(null);
    onChange(v);
    setOpen(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(v), 220);
  }

  function pick(s: Suggestion) {
    onChange(s.full);
    onPick?.({ address: s.full, placeId: s.placeId.startsWith('local:') ? '' : s.placeId });
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
        onFocus={() => {
          const n = lookupName.trim();
          if (!value.trim() && n.length >= 3) { setNameHint(n); setOpen(true); fetchSuggestions(n); return; }
          if (value && suggestions.length > 0) setOpen(true);
        }}
        placeholder={placeholder}
        disabled={disabled}
        className={className}
        autoComplete="off"
      />
      {open && (suggestions.length > 0 || loading || error) && (
        <div className="absolute left-0 right-0 mt-1.5 bg-paper border border-line rounded-[10px] shadow-lift z-[2100] max-h-[320px] overflow-y-auto">
          {nameHint && suggestions.length > 0 && (
            <div className="px-3 py-1.5 text-[11.5px] font-bold text-muted border-b border-line/60">Places named “{nameHint}”</div>
          )}
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
