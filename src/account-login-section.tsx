/**
 * Account-login provisioning UI — lives at the bottom of the Supplier and
 * Volunteer edit modals. Lets the coordinator set or reset the username +
 * password the user types into the rescue app. Username is usually a phone
 * (for drivers) or an email (for stores), but the backend takes either.
 *
 * The coordinator types the password; the backend hashes it; this code
 * never logs or echoes the password.
 */
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { KeyRound, Eye, EyeOff } from 'lucide-react';
import { adminCRUD } from './api';
import { cx } from './design';

export function AccountLoginSection({ kind, id, suggestedUsername }: {
  kind: 'supplier' | 'volunteer';
  id: number;
  suggestedUsername?: string;
}) {
  const [username, setUsername] = useState<string>(suggestedUsername ?? '');
  const [password, setPassword] = useState<string>('');
  const [show, setShow] = useState<boolean>(false);
  const [done, setDone] = useState<boolean>(false);

  const save = useMutation({
    mutationFn: () => kind === 'supplier'
      ? adminCRUD.setSupplierLogin(id, { username: username.trim(), password })
      : adminCRUD.setVolunteerLogin(id, { username: username.trim(), password }),
    onSuccess: () => { setDone(true); setPassword(''); setTimeout(() => setDone(false), 5000); },
  });

  const canSave = username.trim().length >= 3 && password.length >= 6 && !save.isPending;
  const wordKind = kind === 'supplier' ? 'store' : 'driver';

  return (
    <div className="mt-5 border-2 border-sky/15 bg-sky-soft/40 rounded-[16px] overflow-hidden">
      <div className="px-4 py-2.5 bg-[#3E6F8E] text-paper flex items-center gap-2">
        <KeyRound size={14} />
        <div className="text-[12px] font-extrabold uppercase tracking-[.08em]">Account login</div>
      </div>
      <div className="p-4">
        <p className="text-[12.5px] text-muted mb-3">
          Set the username and password this {wordKind} types into the rescue app. Saving overwrites any existing login.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
          <label className="flex flex-col">
            <span className="text-[11.5px] font-extrabold uppercase tracking-[.06em] text-muted block min-h-[2.6em] leading-[1.2em]">Username</span>
            <input type="text" autoComplete="off" value={username} onChange={(e) => setUsername(e.target.value)}
                   placeholder={kind === 'volunteer' ? 'phone, e.g. 8455551234' : 'email or phone'}
                   className="w-full rounded-[10px] border-[1.4px] border-line bg-paper px-3 py-2.5 text-[13.5px] outline-none focus:border-forest" />
            <span className="text-[11px] text-muted mt-1 block">3+ characters · phone or email.</span>
          </label>
          <label className="flex flex-col">
            <span className="text-[11.5px] font-extrabold uppercase tracking-[.06em] text-muted block min-h-[2.6em] leading-[1.2em]">Password</span>
            <div className="relative">
              <input type={show ? 'text' : 'password'} autoComplete="new-password"
                     value={password} onChange={(e) => setPassword(e.target.value)}
                     className="w-full rounded-[10px] border-[1.4px] border-line bg-paper pl-3 pr-10 py-2.5 text-[13.5px] outline-none focus:border-forest" />
              <button type="button" onClick={() => setShow((v) => !v)} title={show ? 'Hide' : 'Show'}
                      className="haptic absolute right-2 top-1/2 -translate-y-1/2 grid h-7 w-7 place-items-center rounded-full hover:bg-cream text-muted">
                {show ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <span className="text-[11px] text-muted mt-1 block">6+ characters · stored hashed.</span>
          </label>
        </div>

        {save.error && <p className="text-clay text-[12.5px] mt-3 font-bold">{(save.error as Error).message}</p>}
        {done       && <p className="text-forest text-[12.5px] mt-3 font-bold">✓ Login saved. The {wordKind} can sign in with these credentials now.</p>}

        <div className="mt-3 flex justify-end">
          <button onClick={() => save.mutate()} disabled={!canSave}
                  className={cx('haptic flex items-center gap-1.5 text-[13px] font-bold rounded-[10px] px-3 py-2',
                                canSave ? 'bg-forest text-paper shadow-ctag' : 'bg-line text-muted')}>
            <KeyRound size={13} /> {save.isPending ? 'Saving…' : 'Save login'}
          </button>
        </div>
      </div>
    </div>
  );
}
