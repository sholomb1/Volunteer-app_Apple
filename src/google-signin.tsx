/**
 * Oct 31 client: "Can I login to our app with Gmail?" — the "Sign in with Google" button (website
 * only; Google doesn't allow its sign-in inside the phone app's web view) and the admin Settings
 * card where the Google client ID is pasted. The API checks Google's answer (api google-signin.ts)
 * and lets in only the login whose email is that Gmail.
 */
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, setAuth, setSandboxAvailable, type AuthUser } from './api';

const GSI_SRC = 'https://accounts.google.com/gsi/client';
const isNativeApp = () => !!(window as any).Capacitor?.isNativePlatform?.();

let gsiLoading: Promise<void> | null = null;
function loadGsi(): Promise<void> {
  if ((window as any).google?.accounts?.id) return Promise.resolve();
  if (!gsiLoading) {
    gsiLoading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = GSI_SRC; s.async = true; s.defer = true;
      s.onload = () => resolve();
      s.onerror = () => { gsiLoading = null; reject(new Error('Google sign-in could not load.')); };
      document.head.appendChild(s);
    });
  }
  return gsiLoading;
}

function useGoogleClientId(): string | null {
  const q = useQuery({
    queryKey: ['google-signin-config'], enabled: !isNativeApp(), staleTime: 10 * 60_000, retry: false,
    queryFn: () => api<{ data: { clientId: string | null } }>('/api/auth/google-config'),
  });
  return q.data?.data?.clientId ?? null;
}

/** "Sign in with Google" + the "or" line. Nothing at all until an admin turns it on. */
export function GoogleSignInButton({ onAuthed }: { onAuthed: (u: AuthUser) => void }) {
  const clientId = useGoogleClientId();
  const box = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const done = useRef(onAuthed);
  done.current = onAuthed;

  useEffect(() => {
    if (!clientId || !box.current) return;
    let gone = false;
    loadGsi().then(() => {
      if (gone || !box.current) return;
      const g = (window as any).google.accounts.id;
      g.initialize({
        client_id: clientId, ux_mode: 'popup', auto_select: false, cancel_on_tap_outside: true,
        callback: async (resp: { credential?: string }) => {
          if (!resp?.credential) return;
          setErr(null); setBusy(true);
          try {
            const r = await api<{ token: string; user: AuthUser; sandboxAvailable?: boolean }>('/api/auth/google', {
              method: 'POST', body: JSON.stringify({ credential: resp.credential }),
            });
            setAuth(r.token, r.user);
            setSandboxAvailable(!!r.sandboxAvailable);
            done.current(r.user);
          } catch (e: any) {
            setErr(e?.body?.message || e?.body?.error || e?.message || "Google sign-in didn't work. Please try again.");
          } finally { setBusy(false); }
        },
      });
      box.current.innerHTML = '';
      g.renderButton(box.current, { theme: 'outline', size: 'large', text: 'signin_with', shape: 'pill', width: Math.min(360, box.current.clientWidth || 320) });
    }).catch((e) => { if (!gone) setErr(e?.message || 'Google sign-in could not load.'); });
    return () => { gone = true; };
  }, [clientId]);

  if (!clientId) return null;
  return (
    <div className="mt-4">
      <div ref={box} className="flex justify-center min-h-[44px]" />
      {busy && <div className="text-center text-[14px] text-muted mt-2">Signing in…</div>}
      {err && <div className="text-center text-[14px] font-bold text-clay mt-2">{err}</div>}
    </div>
  );
}

/** Settings → "Sign in with Google" (admins): paste the client ID from Google Cloud. */
export function GoogleSignInSettingsCard() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['google-signin-config'], queryFn: () => api<{ data: { clientId: string | null } }>('/api/auth/google-config') });
  const current = q.data?.data?.clientId ?? '';
  const [val, setVal] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (clientId: string) => api<{ data: { clientId: string | null } }>('/api/admin/google-signin', { method: 'PUT', body: JSON.stringify({ clientId }) }),
    onSuccess: (r) => { qc.setQueryData(['google-signin-config'], r); setVal(null); setMsg(r.data.clientId ? 'Saved. The button now shows on the sign-in page.' : 'Turned off.'); },
    onError: (e: any) => setMsg(e?.message || "Couldn't save."),
  });
  const v = val ?? current;
  return (
    <div className="rounded-[14px] border border-line bg-paper p-4">
      <div className="font-bold text-[15px]">🔐 Sign in with Google</div>
      <div className="text-[13px] text-muted mt-0.5">
        Adds a "Sign in with Google" button to the website sign-in page. Only someone whose Gmail is the email on their
        login gets in. Paste the Google <b>client ID</b> (ends with .apps.googleusercontent.com). Empty = off.
      </div>
      <div className="flex flex-wrap gap-2 mt-3">
        <input value={v} onChange={(e) => { setVal(e.target.value); setMsg(null); }} placeholder="1234…-abc….apps.googleusercontent.com"
               className="flex-1 min-w-[240px] rounded-[10px] border border-line px-3 py-2 text-[14px]" />
        <button type="button" disabled={save.isPending || v.trim() === current} onClick={() => save.mutate(v.trim())}
                className="rounded-[10px] bg-forest text-paper px-4 py-2 text-[14px] font-bold disabled:opacity-50">Save</button>
      </div>
      <div className="text-[12.5px] mt-2">
        {current ? <span className="text-forest font-bold">✓ On</span> : <span className="text-muted">Off</span>}
        {msg && <span className="ml-2 text-ink">{msg}</span>}
      </div>
    </div>
  );
}
