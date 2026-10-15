import { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { login, type AuthUser } from '../api';
import { FadeUp } from '../design';
import { ConnectionCheck } from '../connection-check';

export function Login({ onAuthed }: { onAuthed: (u: AuthUser) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!username || !password) { setErr('Enter your phone or email + password.'); return; }
    setErr(null); setBusy(true);
    try { onAuthed(await login(username, password)); }
    catch (e: any) { setErr(e?.message ?? 'Sign in failed'); }
    finally { setBusy(false); }
  }

  return (
    <div className="min-h-screen px-6 pt-safe pb-12 max-w-md mx-auto">
      <FadeUp className="pt-4">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', damping: 14, stiffness: 220 }}
          className="grid h-[46px] w-[46px] place-items-center rounded-[13px] bg-forest text-paper font-display font-extrabold text-[20px] shadow-ctag">
          ז
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
        <form onSubmit={submit} className="space-y-3">
          <label className="block">
            <span className="eyebrow">Phone or email</span>
            <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" inputMode="email"
                   className="mt-1.5 w-full rounded-[12px] border-[1.4px] border-line-2 bg-paper px-3.5 py-3 text-[15px] font-semibold focus:border-forest focus:ring-4 focus:ring-forest/15 outline-none transition" />
          </label>
          <label className="block">
            <span className="eyebrow">Password</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password"
                   className="mt-1.5 w-full rounded-[12px] border-[1.4px] border-line-2 bg-paper px-3.5 py-3 text-[15px] font-semibold focus:border-forest focus:ring-4 focus:ring-forest/15 outline-none transition" />
          </label>
          {err && <p className="text-sm font-bold text-clay bg-clay-soft rounded-[10px] px-3 py-2">{err}</p>}
          <button type="submit" disabled={busy}
                  className="haptic w-full bg-forest text-paper rounded-[14px] py-4 font-bold text-[15px] shadow-ctag flex items-center justify-center gap-2 disabled:opacity-50">
            {busy ? 'Signing in…' : <>Sign in <ArrowRight size={18} /></>}
          </button>
        </form>

        <p className="text-center text-[12.5px] text-muted mt-6">
          New here?{' '}
          <a className="text-forest font-bold underline-offset-4 hover:underline"
             href="mailto:office@zehlzeh.org?subject=Zeh%20L'Zeh%20Rescue%20-%20New%20account">
            Contact your coordinator
          </a>
        </p>

        <ConnectionCheck />
      </FadeUp>
    </div>
  );
}
