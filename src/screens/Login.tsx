import { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Phone, MessageSquare, Mail, KeyRound } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { login, NETWORK_ERROR_TEXT, type AuthUser } from '../api';
import { PhoneCodeFlow, isPhoneLink } from '../phone-sign-in'; // Oct 28 client
import { FadeUp } from '../design';
import { ConnectionCheck } from '../connection-check';
import { GoogleSignInButton } from '../google-signin'; // Oct 31 client: Sign in with Google

// Oct 8: the office line (no office phone constant existed in the app before).
const OFFICE_PHONE = '(845) 363-5323';
const OFFICE_TEL = 'tel:+18453635323';
const OFFICE_SMS = 'sms:+18453635323';
const OFFICE_EMAIL = 'office@zehlzeh.org';

export function Login({ onAuthed }: { onAuthed: (u: AuthUser) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Oct 28 client: "📱 Sign in with my phone number" (a 4-digit code by text) and
  // "Forgot password? Get a code by text" (same flow, ends on "Set a new password").
  // Replaces the Oct 22 "Forgot or reset password?" link box (old /welcome links still work).
  // The email link /rescue/?phone=1 (or /rescue/phone) opens straight to the phone box.
  const location = useLocation();
  const navigate = useNavigate();
  const [phoneFlow, setPhoneFlow] = useState<null | 'signin' | 'forgot'>(() => (isPhoneLink(location.pathname, location.search) ? 'signin' : null));
  function closePhoneFlow() {
    setPhoneFlow(null);
    if (isPhoneLink(location.pathname, location.search)) navigate('/', { replace: true });
  }
  function codeSignedIn(u: AuthUser) {
    // Drivers land on Settings after a code sign-in (with "Want a password too?"); office on their start page.
    navigate(phoneFlow === 'signin' && u.role === 'volunteer' ? '/settings' : '/', { replace: true });
    onAuthed(u);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!username || !password) { setErr('Please type your phone number and password.'); return; }
    setErr(null); setBusy(true);
    try { onAuthed(await login(username, password)); }
    catch (e: any) {
      const msg = String(e?.message ?? '');
      // Keep "no internet" / "server busy" messages; everything else = wrong login.
      const isConnection = msg === NETWORK_ERROR_TEXT || /reach the server|busy|restarting|too many|went wrong on our side/i.test(msg);
      setErr(isConnection ? msg : 'Wrong phone or password. Try again, or call the office.');
    }
    finally { setBusy(false); }
  }

  return (
    <div className="min-h-screen px-6 pt-safe pb-12 max-w-md mx-auto">
      <FadeUp className="pt-4">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', damping: 14, stiffness: 220 }}
          className="inline-block">
          {/* Oct 5 client: real Zeh L'Zeh logo. */}
          <img src={`${(import.meta as any).env?.BASE_URL ?? '/'}zlz-logo-wordmark.png`} alt="Zeh L'Zeh — on table placed, saved from waste" className="h-[88px] w-auto object-contain" />
        </motion.div>
      </FadeUp>

      <FadeUp delay={0.1} className="mt-10">
        <div className="eyebrow">Zeh L'Zeh · זה לזה</div>
        <h1 className="font-display font-semibold text-[44px] leading-[1.04] tracking-[-0.02em] mt-2 text-balance">
          One pickup,<br/>
          <span className="accent-italic">one to another.</span>
        </h1>
        <p className="text-muted text-[15px] mt-4 max-w-[34ch]">
          Sign in to rescue food in your neighborhood.
        </p>
      </FadeUp>

      <FadeUp delay={0.18} className="mt-9">
        {phoneFlow ? (
          <PhoneCodeFlow key={phoneFlow} mode={phoneFlow} onCancel={closePhoneFlow} onSignedIn={codeSignedIn} />
        ) : (<>
        <button type="button" data-testid="phone-signin-open" onClick={() => setPhoneFlow('signin')}
                className="haptic w-full bg-forest text-paper rounded-[16px] px-4 py-5 shadow-ctag flex flex-col items-center justify-center text-center">
          <span className="text-[19px] font-extrabold">📱 Sign in with my phone number</span>
          <span className="text-[14px] text-paper/85 mt-0.5">We text you a 4-digit code. No password needed.</span>
        </button>
        <GoogleSignInButton onAuthed={onAuthed} />{/* Oct 31 client: website only, when an admin turned it on */}
        <div className="my-5 flex items-center gap-3 text-[14px] font-bold text-muted">
          <span className="h-px flex-1 bg-line-2" />or sign in with a password<span className="h-px flex-1 bg-line-2" />
        </div>
        <form onSubmit={submit} className="space-y-3">
          <label className="block">
            <span className="block text-[15px] font-bold text-ink">Phone number <span className="font-normal text-muted">(or email)</span></span>
            <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" inputMode="text"
                   autoCapitalize="none" autoCorrect="off" spellCheck={false}
                   className="mt-1.5 w-full rounded-[12px] border-[1.4px] border-line-2 bg-paper px-3.5 py-3.5 text-[17px] font-semibold focus:border-forest focus:ring-4 focus:ring-forest/15 outline-none transition" />
          </label>
          <label className="block">
            <span className="block text-[15px] font-bold text-ink">Password</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password"
                   className="mt-1.5 w-full rounded-[12px] border-[1.4px] border-line-2 bg-paper px-3.5 py-3.5 text-[17px] font-semibold focus:border-forest focus:ring-4 focus:ring-forest/15 outline-none transition" />
          </label>
          {err && <p className="text-[15px] font-bold text-clay bg-clay-soft rounded-[10px] px-3 py-2.5">{err}</p>}
          <button type="submit" disabled={busy}
                  className="haptic w-full bg-paper text-forest border-[1.6px] border-forest rounded-[14px] py-4 font-bold text-[17px] flex items-center justify-center gap-2 disabled:opacity-50">
            {busy ? 'Signing in…' : <>Sign in <ArrowRight size={18} /></>}
          </button>
        </form>

        <button type="button" data-testid="forgot-open" onClick={() => setPhoneFlow('forgot')}
                className="haptic mt-4 w-full flex items-center justify-center gap-2 min-h-[52px] rounded-[14px] border-[1.4px] border-forest/40 bg-paper px-4 py-2 text-[16px] font-bold text-forest">
          <KeyRound size={18} /> Forgot password? Get a code by text
        </button>
        </>)}
        <a href={OFFICE_TEL}
           className="haptic mt-3 flex flex-col items-center justify-center min-h-[52px] rounded-[14px] border-[1.4px] border-line-2 bg-paper px-4 py-2 text-center">
          <span className="text-[16px] font-bold text-forest">Forgot password? Call the office</span>
          <span className="text-[14px] text-muted">{OFFICE_PHONE}</span>
        </a>
        {/* Oct 22 client (Yakov): "New user? Apply here" + "Contact us" for people who download the app without a login. */}
        <Link to="/vol-registration"
              className="haptic mt-3 flex flex-col items-center justify-center min-h-[56px] rounded-[14px] bg-sage border border-sage-line px-4 py-2 text-center">
          <span className="text-[17px] font-extrabold text-forest">New volunteer? Apply here</span>
          <span className="text-[14px] text-muted">Fill out a short form — no login needed</span>
        </Link>
        <div className="mt-3 rounded-[14px] border-[1.4px] border-line-2 bg-paper px-4 py-3">
          <div className="text-[15px] font-bold text-ink text-center">Contact us</div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <a href={OFFICE_TEL} className="haptic flex flex-col items-center gap-1 rounded-[12px] border border-line py-2 text-[14px] font-bold text-forest"><Phone size={18} />Call</a>
            <a href={OFFICE_SMS} className="haptic flex flex-col items-center gap-1 rounded-[12px] border border-line py-2 text-[14px] font-bold text-forest"><MessageSquare size={18} />Text</a>
            <a href={`mailto:${OFFICE_EMAIL}`} className="haptic flex flex-col items-center gap-1 rounded-[12px] border border-line py-2 text-[14px] font-bold text-forest"><Mail size={18} />Email</a>
          </div>
          <div className="mt-1.5 text-center text-[13px] text-muted">{OFFICE_PHONE} · {OFFICE_EMAIL}</div>
        </div>

        <ConnectionCheck />
      </FadeUp>
    </div>
  );
}
