/**
 * Oct 28 client: sign in with your PHONE NUMBER and a 4-digit code sent by text.
 *   phone box -> "We texted you a 4-digit code" (4 big boxes, number keypad, sends by itself on the
 *   4th digit, "Send again" after 30 s, "Wrong number? Change it") -> (several logins on one phone:
 *   "Sign in as: Driver / Dispatcher") -> signed in.
 * The same flow is "Forgot password? Get a code by text" (mode 'forgot'): it ends on "Set a new password".
 * After a code sign-in drivers land on Settings with a small "Want a password too? Set one" card
 * (PasswordOfferCard, shown for 24 hours, can be skipped).
 * Direct link for emails: https://staging.zehlzeh.org/rescue/?phone=1 (or /rescue/phone).
 * API: POST /api/auth/phone-code/start, /api/auth/phone-code/verify, /api/auth/set-password.
 */
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, KeyRound, Smartphone } from 'lucide-react';
import { api, getUser, setAuth, setSandboxAvailable, type AuthUser } from './api';

const CODE_AT_KEY = 'zlz_code_signin_at';
const OFFER_DONE_KEY = 'zlz_pw_offer_done';
const OFFER_HOURS = 24; // the API allows set-password this long after a code sign-in

/** Opened from the email link: /rescue/?phone=1 or /rescue/phone */
export function isPhoneLink(pathname: string, search: string): boolean {
  return /(^|\/)phone\/?$/.test(pathname) || new URLSearchParams(search).get('phone') === '1';
}

function markCodeSignIn() {
  try { localStorage.setItem(CODE_AT_KEY, String(Date.now())); localStorage.removeItem(OFFER_DONE_KEY); } catch { /* storage blocked */ }
}
function markOfferDone() {
  try { localStorage.setItem(OFFER_DONE_KEY, '1'); } catch { /* storage blocked */ }
}
/** Show "Want a password too?": signed in by a code in the last 24 hours, not set / skipped yet. */
export function passwordOfferDue(now = Date.now()): boolean {
  try {
    if (localStorage.getItem(OFFER_DONE_KEY) === '1') return false;
    const at = Number(localStorage.getItem(CODE_AT_KEY) || 0);
    return at > 0 && now - at < OFFER_HOURS * 3600_000;
  } catch { return false; }
}

const digits10 = (s: string) => { let d = s.replace(/\D/g, ''); if (d.length === 11 && d.startsWith('1')) d = d.slice(1); return d; };
const fmt = (d: string) => (d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : d);

const inputCls = 'mt-1.5 w-full rounded-[12px] border-[1.4px] border-line-2 bg-paper px-3.5 py-3.5 text-[18px] font-semibold focus:border-forest focus:ring-4 focus:ring-forest/15 outline-none transition';
const mainBtn = 'haptic w-full bg-forest text-paper rounded-[14px] py-4 font-bold text-[17px] shadow-ctag flex items-center justify-center gap-2 disabled:opacity-50';
const linkBtn = 'haptic w-full py-2.5 text-[15.5px] font-bold text-forest disabled:text-muted';
const errCls = 'text-[15px] font-bold text-clay bg-clay-soft rounded-[10px] px-3 py-2.5';

type SignInReply = { token: string; user: AuthUser; sandboxAvailable?: boolean; codeSignIn?: boolean };
type VerifyReply = SignInReply | { data: { choose: Array<{ key: string; label: string }> } };

export function PhoneCodeFlow({ mode, onCancel, onSignedIn }: {
  mode: 'signin' | 'forgot';
  onCancel: () => void;
  /** after = 'settings' (driver code sign-in) or 'home' */
  onSignedIn: (u: AuthUser) => void;
}) {
  const [step, setStep] = useState<'phone' | 'code' | 'choose' | 'password'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sentAt, setSentAt] = useState(0);
  const [wait, setWait] = useState(30);
  const [now, setNow] = useState(Date.now());
  const [choices, setChoices] = useState<Array<{ key: string; label: string }>>([]);
  const [signedIn, setSignedIn] = useState<AuthUser | null>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const d10 = digits10(phone);

  // "Send again in 0:23" countdown (only while the code screen is open).
  useEffect(() => {
    if (step !== 'code') return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [step]);
  const left = Math.max(0, Math.ceil((sentAt + wait * 1000 - now) / 1000));

  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault();
    if (d10.length !== 10) { setErr('Please type your 10-digit phone number.'); return; }
    setErr(null); setBusy(true);
    try {
      const r = await api<{ data: { message: string; resendSeconds?: number } }>('/api/auth/phone-code/start', { method: 'POST', body: JSON.stringify({ phone: d10 }) });
      setNote(r.data.message); setWait(r.data.resendSeconds ?? 30); setSentAt(Date.now()); setNow(Date.now());
      setCode(''); setStep('code');
      setTimeout(() => codeRef.current?.focus(), 50);
    } catch (e: any) { setErr(String(e?.message || 'Something went wrong. Please call the office.')); }
    finally { setBusy(false); }
  }

  function done(res: SignInReply) {
    setAuth(res.token, res.user);
    setSandboxAvailable(!!res.sandboxAvailable);
    markCodeSignIn();
    if (mode === 'forgot') { setSignedIn(res.user); setStep('password'); return; }
    onSignedIn(res.user);
  }

  async function verify(c: string, as?: string) {
    if (busy) return;
    setErr(null); setBusy(true);
    try {
      const r = await api<VerifyReply>('/api/auth/phone-code/verify', { method: 'POST', body: JSON.stringify({ phone: d10, code: c, ...(as ? { as } : {}) }) });
      if ('data' in r && r.data?.choose) { setChoices(r.data.choose); setStep('choose'); return; }
      done(r as SignInReply);
    } catch (e: any) {
      setErr(String(e?.message || 'Something went wrong. Please try again.'));
      if (step === 'code') { setCode(''); setTimeout(() => codeRef.current?.focus(), 50); }
    } finally { setBusy(false); }
  }

  const title = mode === 'forgot' ? 'Forgot password?' : 'Sign in with your phone';

  if (step === 'password' && signedIn) {
    return (
      <div className="rounded-[16px] border-[1.4px] border-forest/40 bg-paper px-4 py-5" data-testid="phone-flow">
        <div className="text-[20px] font-extrabold text-ink flex items-center gap-2"><KeyRound size={20} className="text-forest" /> Set a new password</div>
        <p className="mt-1 text-[15px] text-muted">You're signed in. Choose a new password (8 or more letters or numbers).</p>
        <SetPasswordForm onDone={() => onSignedIn(getUser() ?? signedIn)} onSkip={() => onSignedIn(signedIn)} skipLabel="Skip for now" />
      </div>
    );
  }

  return (
    <div className="rounded-[16px] border-[1.4px] border-forest/40 bg-paper px-4 py-5" data-testid="phone-flow">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => (step === 'phone' ? onCancel() : (setStep('phone'), setErr(null)))} aria-label="Back"
                className="haptic grid h-[40px] w-[40px] shrink-0 place-items-center rounded-full border border-line bg-paper"><ArrowLeft size={18} /></button>
        <div className="text-[19px] font-extrabold text-ink">{title}</div>
      </div>

      {step === 'phone' && (
        <form onSubmit={sendCode} className="mt-3 space-y-3">
          <label className="block">
            <span className="block text-[16px] font-bold text-ink">Your phone number</span>
            <span className="block text-[14px] text-muted">We'll text you a 4-digit code.</span>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" inputMode="tel" placeholder="845-555-1234" autoFocus
                   data-testid="phone-input" className={inputCls} />
          </label>
          {err && <p className={errCls}>{err}</p>}
          <button type="submit" disabled={busy} className={mainBtn}>{busy ? 'Sending…' : 'Text me a code'}</button>
        </form>
      )}

      {step === 'code' && (
        <div className="mt-3 space-y-3">
          <div>
            <div className="text-[17px] font-bold text-ink">We texted you a 4-digit code</div>
            <div className="text-[15px] text-muted">to {fmt(d10)}</div>
          </div>
          <CodeBoxes value={code} inputRef={codeRef} disabled={busy}
                     onChange={(v) => { setCode(v); setErr(null); if (v.length === 4) void verify(v); }} />
          {busy && <p className="text-[15px] text-muted text-center">Checking…</p>}
          {err && <p className={errCls} data-testid="code-error">{err}</p>}
          {note && !err && <p className="text-[14px] text-muted">{note}</p>}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" disabled={left > 0 || busy} onClick={() => void sendCode()} className={linkBtn}>
              {left > 0 ? `Send again in 0:${String(left).padStart(2, '0')}` : 'Send again'}
            </button>
            <button type="button" onClick={() => { setStep('phone'); setErr(null); setCode(''); }} className={linkBtn}>Wrong number? Change it</button>
          </div>
        </div>
      )}

      {step === 'choose' && (
        <div className="mt-3 space-y-2.5">
          <div className="text-[17px] font-bold text-ink">Sign in as:</div>
          {choices.map((c) => (
            <button key={c.key} type="button" disabled={busy} onClick={() => void verify(code, c.key)}
                    className="haptic w-full rounded-[14px] border-[1.4px] border-forest/50 bg-paper py-4 text-[17px] font-extrabold text-forest disabled:opacity-50">
              {c.label}
            </button>
          ))}
          {err && <p className={errCls}>{err}</p>}
        </div>
      )}
    </div>
  );
}

/** 4 big boxes over one real input (number keypad, iPhone/Android code autofill). */
function CodeBoxes({ value, onChange, inputRef, disabled }: {
  value: string; onChange: (v: string) => void; inputRef: React.RefObject<HTMLInputElement | null>; disabled?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div className="relative" onClick={() => inputRef.current?.focus()}>
      <input ref={inputRef} value={value} disabled={disabled} aria-label="4-digit code" data-testid="code-input"
             inputMode="numeric" pattern="[0-9]*" autoComplete="one-time-code" maxLength={4}
             onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
             onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 4))}
             className="absolute inset-0 h-full w-full opacity-0 text-[16px]" />
      <div className="grid grid-cols-4 gap-3" aria-hidden>
        {[0, 1, 2, 3].map((i) => {
          const active = focused && (i === value.length || (i === 3 && value.length === 4));
          return (
            <div key={i}
                 className={`h-[68px] rounded-[14px] border-[2px] bg-paper grid place-items-center text-[32px] font-extrabold text-ink tabular-nums ${active ? 'border-forest ring-4 ring-forest/15' : 'border-line-2'}`}>
              {value[i] ?? ''}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Set / change the password after a code sign-in (POST /api/auth/set-password). */
export function SetPasswordForm({ onDone, onSkip, skipLabel = 'Not now' }: { onDone: () => void; onSkip?: () => void; skipLabel?: string }) {
  const [pw, setPw] = useState('');
  const [show, setShow] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (pw.trim().length < 8) { setErr('Password must be at least 8 characters.'); return; }
    setErr(null); setBusy(true);
    try {
      const r = await api<SignInReply>('/api/auth/set-password', { method: 'POST', body: JSON.stringify({ newPassword: pw }) });
      setAuth(r.token, { ...(getUser() ?? {}), ...r.user } as AuthUser);
      markOfferDone();
      setSaved(true);
      setTimeout(onDone, 900);
    } catch (e: any) { setErr(String(e?.message || 'Something went wrong. Please try again.')); }
    finally { setBusy(false); }
  }
  if (saved) return <p className="mt-3 text-[16px] font-bold text-forest bg-sage border border-sage-line rounded-[10px] px-3 py-3" data-testid="pw-saved">Saved. Next time you can sign in with your phone number and this password.</p>;
  return (
    <form onSubmit={save} className="mt-3 space-y-3" data-testid="set-password">
      <label className="block">
        <span className="block text-[16px] font-bold text-ink">New password</span>
        <div className="relative">
          <input type={show ? 'text' : 'password'} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password"
                 className={inputCls + ' pr-[72px]'} />
          <button type="button" onClick={() => setShow((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-[38%] px-2 py-1 text-[14px] font-bold text-forest">{show ? 'Hide' : 'Show'}</button>
        </div>
        <span className="block mt-1 text-[13.5px] text-muted">At least 8 letters or numbers.</span>
      </label>
      {err && <p className={errCls}>{err}</p>}
      <button type="submit" disabled={busy} className={mainBtn}>{busy ? 'Saving…' : 'Save password'}</button>
      {onSkip && <button type="button" onClick={() => { markOfferDone(); onSkip(); }} className={linkBtn + ' text-muted'}>{skipLabel}</button>}
    </form>
  );
}

/** Settings: "Want a password too? Set one" — only after a code sign-in (24 hours), can be skipped. */
export function PasswordOfferCard() {
  const [show, setShow] = useState(() => passwordOfferDue());
  const [open, setOpen] = useState(false);
  if (!show) return null;
  return (
    <section className="mt-1 mb-4 rounded-[16px] border-[1.4px] border-forest/30 bg-sage px-4 py-3.5" data-testid="pw-offer">
      <div className="flex items-start gap-3">
        <Smartphone size={22} className="mt-0.5 shrink-0 text-forest" />
        <div className="flex-1">
          <div className="text-[16.5px] font-extrabold text-ink">Want a password too?</div>
          <div className="text-[14.5px] text-muted leading-snug">You can always sign in with a text code. A password is optional.</div>
        </div>
      </div>
      {open ? (
        <SetPasswordForm onDone={() => setShow(false)} onSkip={() => setShow(false)} />
      ) : (
        <div className="mt-3 flex gap-2">
          <button type="button" onClick={() => setOpen(true)} className="haptic flex-1 rounded-[12px] bg-forest py-3 text-[16px] font-bold text-paper">Set one</button>
          <button type="button" onClick={() => { markOfferDone(); setShow(false); }} className="haptic flex-1 rounded-[12px] border-[1.4px] border-line-2 bg-paper py-3 text-[16px] font-bold text-muted">Not now</button>
        </div>
      )}
    </section>
  );
}
