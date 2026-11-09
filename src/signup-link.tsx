/**
 * Nov 4 Yakov: "Dispatchers should be able to send the link for a person who wants to volunteer."
 * Drivers page header: "📨 Send sign-up link" (office and dispatchers). Type the person's phone (and name),
 * then "💬 Text it" opens the office text pop-up (office-texts.tsx) with a ready message — nothing is sent
 * until you press Send there. "Copy link" copies the public volunteer form (the login screen's
 * "New volunteer? Apply here" — route /vol-registration).
 */
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { getUser } from './api';
import { openOfficeText } from './office-texts';

// Always the LIVE site: the person opens it on their own phone.
export const VOLUNTEER_SIGNUP_URL = 'https://staging.zehlzeh.org/rescue/vol-registration';

export function signupLinkText(name: string): string {
  const me = String(getUser()?.firstName ?? '').trim();
  const hi = name.trim() ? `Hi ${name.trim()}!` : 'Hi!';
  return `${hi} Thanks for wanting to help Zeh L'Zeh. Sign up to volunteer here (it takes a few minutes): ${VOLUNTEER_SIGNUP_URL}\n– ${me ? `${me}, ` : ''}Zeh L'Zeh`;
}

const pill = 'haptic inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-[12.5px] font-bold shadow-ctag';

export function SendSignupLinkButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" data-testid="send-signup-link" title="Text or copy the volunteer sign-up link"
              onClick={() => setOpen(true)} className={`${pill} border-forest/40 bg-paper text-forest hover:bg-sage/60`}>
        <span aria-hidden>📨</span> Send sign-up link
      </button>
      {open && <SignupLinkBox onClose={() => setOpen(false)} />}
    </>
  );
}

function SignupLinkBox({ onClose }: { onClose: () => void }) {
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [copied, setCopied] = useState(false);
  const digits = phone.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
  const phoneOk = digits.length === 10;
  const text = () => { if (!phoneOk) return; openOfficeText(digits, name.trim() || null, signupLinkText(name)); onClose(); };
  const copy = async () => {
    try { await navigator.clipboard.writeText(VOLUNTEER_SIGNUP_URL); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* old browser */ }
  };
  const input = 'w-full rounded-[10px] border border-line bg-paper px-3 py-2 text-[14px] text-ink focus:outline-none focus:border-forest';
  return createPortal(
    <div className="fixed inset-0 z-[80] bg-black/40 grid place-items-center p-4" onClick={onClose}>
      <div role="dialog" aria-label="Send the sign-up link" data-signup-link-box
           className="w-full max-w-[420px] rounded-[18px] bg-paper p-5 shadow-xl space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <h3 className="font-display font-semibold text-[18px] text-ink mr-auto">📨 Send the sign-up link</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="haptic px-2 text-[18px] text-muted">✕</button>
        </div>
        <p className="text-[13px] text-muted">For someone who wants to volunteer. A ready text opens; check it, then press Send.</p>
        <label className="block">
          <span className="text-[12.5px] font-bold text-ink">Phone number</span>
          <input autoFocus type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(845) 555-1234"
                 onKeyDown={(e) => { if (e.key === 'Enter') text(); }} className={input} />
        </label>
        <label className="block">
          <span className="text-[12.5px] font-bold text-ink">Name <span className="font-normal text-muted">(if you know it)</span></span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="First name"
                 onKeyDown={(e) => { if (e.key === 'Enter') text(); }} className={input} />
        </label>
        {phone.trim() !== '' && !phoneOk && <div className="text-[12.5px] text-clay font-bold">Type a 10-digit phone number.</div>}
        <div className="rounded-[10px] border border-line bg-cream/60 px-3 py-2 text-[12.5px] text-ink whitespace-pre-line">{signupLinkText(name)}</div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" data-testid="signup-link-text" disabled={!phoneOk} onClick={text}
                  className="haptic rounded-full bg-forest text-paper px-4 py-2 text-[13px] font-bold disabled:opacity-40">💬 Text it</button>
          <button type="button" data-testid="signup-link-copy" onClick={() => void copy()}
                  className="haptic rounded-full border border-line bg-paper px-4 py-2 text-[13px] font-bold text-ink hover:border-forest">{copied ? '✓ Copied' : '🔗 Copy link'}</button>
        </div>
        <div className="text-[11.5px] text-muted break-all">{VOLUNTEER_SIGNUP_URL}</div>
      </div>
    </div>,
    document.body,
  );
}
