/**
 * Invite a dispatcher / staff login and choose their access (client Oct 2 2026).
 * - InviteStaffModal: name, phone, email, role, access sections → invite link
 *   (copy, or text it to them). They set their own password at /invite/<token>.
 * - AccessModal: change an existing login's access sections.
 * - AcceptInvite: the public "choose your password" page.
 * Backend: POST /api/admin-users/invite, POST /api/admin-users/:id/invite,
 * PATCH /api/admin-users/:id { accessSections }, GET/POST /api/auth/(invite|accept-invite).
 */
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, setAuth, dispatchers } from './api';
import { cx, SearchSelect } from './design';
import { IOS_APP_STORE_URL, PLAY_HTTPS_URL } from './app-version-check'; // Oct 14 client

export const ACCESS_SECTIONS: { key: string; label: string; hint: string }[] = [
  { key: 'live',       label: 'Live Board',      hint: 'Open pickups right now' },
  { key: 'pickups',    label: 'Pickups',         hint: 'All pickups, calendar, steady' },
  { key: 'volunteers', label: 'Volunteers',      hint: 'Driver records' },
  { key: 'suppliers',  label: 'Suppliers',       hint: 'Store / donor records' },
  { key: 'map',        label: 'Map View',        hint: 'Map of pickups & coverage' },
  { key: 'tasks',      label: 'Task Management', hint: 'Tasks, recruiting, prospects' },
  { key: 'reports',    label: 'Reports',         hint: 'All reports' },
  { key: 'messaging',  label: 'Messaging',       hint: 'SMS, WhatsApp, chats, broadcasts' },
  { key: 'admin',      label: 'Admin',           hint: 'Dispatchers, settings, holiday & SMS controls' },
];
const PRESETS: { key: string; label: string; sections: string[] | null }[] = [
  { key: 'dispatcher',     label: 'Dispatcher — Live Board, Pickups, Volunteers, Suppliers', sections: ['live', 'pickups', 'volunteers', 'suppliers'] },
  { key: 'dispatcher-msg', label: 'Dispatcher + Messaging', sections: ['live', 'pickups', 'volunteers', 'suppliers', 'messaging'] },
  { key: 'office',         label: 'Office staff — everything except Admin', sections: ACCESS_SECTIONS.filter((s) => s.key !== 'admin').map((s) => s.key) },
  { key: 'full',           label: 'Full access — everything', sections: ACCESS_SECTIONS.map((s) => s.key) },
];
const portalBase = () => window.location.origin + (((import.meta as any).env?.BASE_URL ?? '/').replace(/\/$/, ''));

function AccessPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const same = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((p) => (
          <button key={p.key} type="button" onClick={() => onChange(p.sections ?? [])}
                  className={cx('haptic rounded-full border px-3 py-1 text-[12px] font-bold',
                    same(value, p.sections ?? []) ? 'bg-forest text-paper border-forest' : 'bg-paper text-ink border-line hover:bg-cream')}>
            {p.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        {ACCESS_SECTIONS.map((s) => (
          <label key={s.key} className={cx('flex items-start gap-2 rounded-[10px] border px-3 py-2 cursor-pointer',
                                           value.includes(s.key) ? 'border-forest/40 bg-sage/40' : 'border-line bg-paper')}>
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-forest" checked={value.includes(s.key)}
                   onChange={(e) => onChange(e.target.checked ? [...value, s.key] : value.filter((x) => x !== s.key))} />
            <span><span className="block text-[13px] font-bold">{s.label}</span><span className="block text-[11px] text-muted">{s.hint}</span></span>
          </label>
        ))}
      </div>
    </div>
  );
}

function Shell({ title, onClose, children }: { title: string; onClose: () => void; children: any }) {
  return (
    <div className="fixed inset-0 z-[2100] bg-ink/50 flex items-start justify-center pt-10 px-4 overflow-y-auto">
      <div onClick={(e) => e.stopPropagation()} className="relative z-[2101] bg-paper rounded-[18px] shadow-lift border border-line w-full max-w-lg p-5 space-y-3 mb-10">
        <div className="flex items-center justify-between">
          <div className="font-display font-semibold text-[16px]">{title}</div>
          <button onClick={onClose} className="haptic grid h-8 w-8 place-items-center rounded-full hover:bg-cream text-muted">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

type AppLinks = { web: string; android: string | null; ios: string | null };
type InviteDone = { url: string; texted: boolean; username?: string; links?: AppLinks; textProblem?: string | null; sentTo?: string | null };
const fmtWhen = (x: string | null | undefined) => x
  ? new Date(x).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
  : '';

/** Oct 5 client: one line saying whether / when this person was invited. */
export function portalLoginStatus(pl: any | null | undefined): { text: string; tone: 'ok' | 'wait' | 'bad' | 'none' } {
  if (!pl) return { text: 'No portal login', tone: 'none' };
  if (pl.isActive === false) return { text: 'Portal login turned off', tone: 'bad' };
  if (pl.invitePending) return { text: `Invited ${fmtWhen(pl.invitedAt)} · not set up yet`, tone: 'wait' };
  if (pl.inviteExpired) return { text: `Invite expired · sent ${fmtWhen(pl.invitedAt)}`, tone: 'bad' };
  if (pl.lastLoginAt) return { text: `Portal login ✓ · last in ${fmtWhen(pl.lastSeenAt ?? pl.lastLoginAt)}`, tone: 'ok' };
  return { text: pl.invitedAt ? `Invited ${fmtWhen(pl.invitedAt)}` : 'Portal login ✓', tone: 'ok' };
}

function InviteResult({ done, onClose }: { done: InviteDone; onClose: () => void }) {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (k: string, v: string) => { void navigator.clipboard?.writeText(v); setCopied(k); };
  const row = (k: string, label: string, v: string) => (
    <div key={k}>
      <div className="text-[11px] font-bold text-muted">{label}</div>
      <div className="flex gap-2">
        <input readOnly value={v} className="flex-1 min-w-0 rounded-[10px] border border-line bg-cream/40 px-3 py-2 text-[12px] font-mono" />
        <button onClick={() => copy(k, v)} className="haptic rounded-[10px] bg-forest px-3 py-2 text-[12.5px] font-bold text-paper">{copied === k ? 'Copied' : 'Copy'}</button>
      </div>
    </div>
  );
  return (
    <div className="space-y-3">
      {done.texted
        ? <div className="rounded-[12px] bg-sage/50 border border-sage-line px-4 py-3 text-[13px]">✅ Texted to {done.sentTo ?? 'them'} — link, username and app links.</div>
        : <div className="rounded-[12px] bg-clay/10 border border-clay/40 px-4 py-3 text-[13px] text-clay font-semibold">⚠️ Not texted. {done.textProblem ?? 'Copy the link below and send it to them yourself.'}</div>}
      {done.username && <div className="text-[13px]">Username: <b className="font-mono">{done.username}</b></div>}
      {row('link', 'Set-password link (works 7 days)', done.url)}
      {done.links?.web && row('web', 'Portal on the web', done.links.web)}
      {done.links?.android && row('android', 'Android app (Google Play)', done.links.android)}
      {done.links?.ios && row('ios', 'iPhone app', done.links.ios)}
      <div className="text-[11.5px] text-muted">They open the link, choose a password, then sign in on the web or in the app with the username above.</div>
      <div className="flex justify-end"><button onClick={onClose} className="haptic rounded-[10px] border border-line px-4 py-2 text-[13px] font-bold">Done</button></div>
    </div>
  );
}

type Prefill = { firstName?: string | null; lastName?: string | null; phone?: string | null; email?: string | null; hasVolunteerLogin?: boolean };

export function InviteStaffModal({ onClose, prefill }: { onClose: () => void; prefill?: Prefill }) {
  const qc = useQueryClient();
  const [firstName, setFirst] = useState(prefill?.firstName ?? '');
  const [lastName, setLast] = useState(prefill?.lastName ?? '');
  const [phone, setPhone] = useState(prefill?.phone ?? '');
  const [email, setEmail] = useState(prefill?.email ?? '');
  const [username, setUsername] = useState('');
  const [hasVolLogin, setHasVolLogin] = useState(!!prefill?.hasVolunteerLogin);
  const [role, setRole] = useState<'dispatcher' | 'staff' | 'coordinator' | 'admin'>('dispatcher');
  const [sections, setSections] = useState<string[]>(PRESETS[0]!.sections!);
  const [sendText, setSendText] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<InviteDone | null>(null);
  // Oct 5 client: choose from the dispatcher roster (shows who was already invited).
  const roster = useQuery({ queryKey: ['invite-pick-dispatchers'], queryFn: dispatchers.list, enabled: !prefill });
  const people = (roster.data?.data ?? []) as any[];
  const pick = (p: any) => {
    setFirst(p.firstName ?? ''); setLast(p.lastName ?? ''); setPhone(p.phone ?? ''); setEmail(p.email ?? '');
    setHasVolLogin(p.userId != null);
  };
  const mut = useMutation({
    mutationFn: () => api<{ data: { inviteUrl: string; texted: boolean; username: string; links: AppLinks } }>('/api/admin-users/new-access', {
      method: 'POST',
      body: JSON.stringify({ firstName, lastName, phone, email: hasVolLogin ? '' : email, username, role, accessSections: sections, sendText }),
    }),
    onSuccess: (r) => {
      setDone({ url: r.data.inviteUrl, texted: r.data.texted, username: r.data.username, links: r.data.links, textProblem: (r.data as any).textProblem, sentTo: (r.data as any).sentTo });
      for (const k of ['admin-dispatchers', 'admin-dispatchers-attendance', 'dispatchers']) qc.invalidateQueries({ queryKey: [k] });
    },
    onError: (e: any) => setErr(e?.message || 'Invite failed'),
  });
  const inp = 'mt-1 w-full rounded-[10px] border border-line bg-paper px-3 py-2 text-[13px] font-normal';
  if (done) return <Shell title="Portal login created" onClose={onClose}><InviteResult done={done} onClose={onClose} /></Shell>;
  return (
    <Shell title="Create a portal login" onClose={onClose}>
      {!prefill && (
        <div className="block text-[12px] font-bold">Choose from dispatchers
          <div className="mt-1">
            <SearchSelect items={people} getKey={(p: any) => p.id}
                          getLabel={(p: any) => `${p.firstName} ${p.lastName}`}
                          getHint={(p: any) => `${p.phone ?? 'no phone'} · ${portalLoginStatus(p.portalLogin).text}`}
                          onPick={pick} placeholder={roster.isLoading ? 'Loading…' : 'Type a name or phone…'}
                          emptyText="No dispatcher matches — type the details below" />
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-[12px] font-bold">First name<input value={firstName} onChange={(e) => setFirst(e.target.value)} className={inp} /></label>
        <label className="block text-[12px] font-bold">Last name<input value={lastName} onChange={(e) => setLast(e.target.value)} className={inp} /></label>
        <label className="block text-[12px] font-bold">Cell phone<input value={phone} onChange={(e) => setPhone(e.target.value)} className={inp} placeholder="845-555-1234" /></label>
        <label className="block text-[12px] font-bold">Username
          <input value={username} onChange={(e) => setUsername(e.target.value)} className={inp}
                 placeholder={hasVolLogin ? 'blank = first.last' : (email.trim() ? 'blank = their email' : 'blank = their phone')} /></label>
        {!hasVolLogin && <label className="block text-[12px] font-bold col-span-2">Email (optional)<input value={email} onChange={(e) => setEmail(e.target.value)} className={inp} /></label>}
        <label className="block text-[12px] font-bold col-span-2">Role
          <select value={role} onChange={(e) => setRole(e.target.value as any)} className={inp}>
            <option value="dispatcher">Dispatcher</option><option value="staff">Office staff</option>
            <option value="coordinator">Coordinator</option><option value="admin">Admin</option>
          </select></label>
      </div>
      {hasVolLogin && (
        <div className="rounded-[10px] bg-amber-soft/60 border border-amber/40 px-3 py-2 text-[12px]">
          This person is also a volunteer and already uses their phone for the volunteer app. The portal login is
          separate and gets its own username, so both keep working.
        </div>
      )}
      <div className="text-[12px] font-bold">What can they open?</div>
      <AccessPicker value={sections} onChange={setSections} />
      <label className="flex items-center gap-2 text-[12.5px]">
        <input type="checkbox" checked={sendText} onChange={(e) => setSendText(e.target.checked)} className="h-4 w-4 accent-forest" />
        Text them the link, username and app links <span className="text-muted">(wording: Messaging → Groups → Message templates)</span>
      </label>
      {err && <div className="text-[12px] text-clay">{err}</div>}
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="haptic rounded-[10px] border border-line px-4 py-2 text-[13px] font-bold text-muted">Cancel</button>
        <button disabled={!firstName.trim() || (!phone.trim() && !email.trim() && !username.trim()) || sections.length === 0 || mut.isPending}
                onClick={() => { setErr(null); mut.mutate(); }}
                className="haptic rounded-[10px] bg-forest px-4 py-2 text-[13px] font-bold text-paper disabled:opacity-50">
          {mut.isPending ? 'Creating…' : 'Create login'}
        </button>
      </div>
    </Shell>
  );
}

type LoginUser = {
  id: number; firstName: string | null; lastName: string | null; accessSections?: string[] | null;
  invitePending?: boolean; phone?: string | null; username?: string | null; email?: string | null; role?: string | null;
};

/** Oct 5 client: edit a portal login (name, username, phone, role, access) and resend its link. */
export function AccessModal({ user, onClose }: { user: LoginUser; onClose: () => void }) {
  const qc = useQueryClient();
  const [firstName, setFirst] = useState(user.firstName ?? '');
  const [lastName, setLast] = useState(user.lastName ?? '');
  const [phone, setPhone] = useState(user.phone ?? '');
  const [username, setUsername] = useState(user.username ?? user.email ?? '');
  const [role, setRole] = useState(String(user.role ?? 'dispatcher'));
  const [sections, setSections] = useState<string[]>(user.accessSections ?? []);
  const [useDefault, setUseDefault] = useState(!user.accessSections);
  const [err, setErr] = useState<string | null>(null);
  const [resent, setResent] = useState<InviteDone | null>(null);
  const refresh = () => { for (const k of ['admin-dispatchers', 'admin-dispatchers-attendance', 'dispatchers']) qc.invalidateQueries({ queryKey: [k] }); };
  const save = useMutation({
    mutationFn: () => api(`/api/admin-users/${user.id}`, { method: 'PATCH', body: JSON.stringify({
      firstName: firstName.trim() || undefined, lastName, phone, username: username.trim() || undefined,
      role: ['admin', 'coordinator', 'staff', 'dispatcher'].includes(role) ? role : undefined,
      accessSections: useDefault ? null : sections }) }),
    onSuccess: () => { refresh(); onClose(); },
    onError: (e: any) => setErr(e?.message || 'Save failed'),
  });
  const resend = useMutation({
    mutationFn: () => api<{ data: { inviteUrl: string; texted: boolean; username: string; links: AppLinks } }>(`/api/admin-users/${user.id}/access-link`, {
      method: 'POST', body: JSON.stringify({ sendText: true, phone: phone || user.phone || undefined }) }),
    onSuccess: (r) => { refresh(); setResent({ url: r.data.inviteUrl, texted: r.data.texted, username: r.data.username, links: r.data.links, textProblem: (r.data as any).textProblem, sentTo: (r.data as any).sentTo }); },
    onError: (e: any) => setErr(e?.message || 'Could not create a new link'),
  });
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ');
  const inp = 'mt-1 w-full rounded-[10px] border border-line bg-paper px-3 py-2 text-[13px] font-normal';
  if (resent) return <Shell title={`New link for ${name}`} onClose={onClose}><InviteResult done={resent} onClose={onClose} /></Shell>;
  return (
    <Shell title={`Portal login — ${name}`} onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-[12px] font-bold">First name<input value={firstName} onChange={(e) => setFirst(e.target.value)} className={inp} /></label>
        <label className="block text-[12px] font-bold">Last name<input value={lastName} onChange={(e) => setLast(e.target.value)} className={inp} /></label>
        <label className="block text-[12px] font-bold">Username<input value={username} onChange={(e) => setUsername(e.target.value)} className={inp} /></label>
        <label className="block text-[12px] font-bold">Cell phone<input value={phone} onChange={(e) => setPhone(e.target.value)} className={inp} /></label>
        <label className="block text-[12px] font-bold col-span-2">Role
          <select value={role} onChange={(e) => setRole(e.target.value)} className={inp}>
            <option value="dispatcher">Dispatcher</option><option value="staff">Office staff</option>
            <option value="coordinator">Coordinator</option><option value="admin">Admin</option>
          </select></label>
      </div>
      <label className="flex items-center gap-2 text-[12.5px]">
        <input type="checkbox" checked={useDefault} onChange={(e) => setUseDefault(e.target.checked)} className="h-4 w-4 accent-forest" />
        Use the standard menu for their role
      </label>
      {!useDefault && <AccessPicker value={sections} onChange={setSections} />}
      {err && <div className="text-[12px] text-clay">{err}</div>}
      <div className="flex flex-wrap justify-between gap-2">
        <button onClick={() => resend.mutate()} disabled={resend.isPending}
                className="haptic rounded-[10px] border border-line px-3 py-2 text-[12.5px] font-bold text-forest">
          {resend.isPending ? '…' : user.invitePending ? 'Resend invite' : 'Send a new password link'}
        </button>
        <div className="flex gap-2">
          <button onClick={onClose} className="haptic rounded-[10px] border border-line px-4 py-2 text-[13px] font-bold text-muted">Cancel</button>
          <button disabled={(!useDefault && sections.length === 0) || !firstName.trim() || save.isPending} onClick={() => save.mutate()}
                  className="haptic rounded-[10px] bg-forest px-4 py-2 text-[13px] font-bold text-paper disabled:opacity-50">Save</button>
        </div>
      </div>
      <div className="text-[11.5px] text-muted">Changes apply the next time they open or refresh the portal. The new link is texted with their username and the app links.</div>
    </Shell>
  );
}

export function AcceptInvite() {
  const { token = '' } = useParams<{ token: string }>();
  const info = useQuery({
    queryKey: ['invite', token], retry: false,
    queryFn: () => api<{ data: { firstName: string; role: string; username: string; links?: { android: string; ios: string } } }>(`/api/auth/invite/${token}`),
  });
  // Oct 14 client: a volunteer sees "You're all set" with the app links instead of jumping into the web portal.
  const [allSet, setAllSet] = useState<{ token: string; user: any } | null>(null);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const accept = useMutation({
    mutationFn: () => api<{ token: string; user: any }>('/api/auth/accept-invite', { method: 'POST', body: JSON.stringify({ token, password: pw }) }),
    onSuccess: (r) => {
      if (String(r.user?.role) === 'volunteer') { setAllSet(r); return; }
      setAuth(r.token, r.user); window.location.href = portalBase() + '/';
    },
    onError: (e: any) => setErr(e?.message || 'Could not set your password'),
  });
  const inp = 'mt-1 w-full rounded-[12px] border border-line bg-paper px-3 py-2.5 text-[15px]';
  return (
    <div className="min-h-screen bg-cream flex items-start justify-center px-4 pt-16">
      <div className="w-full max-w-sm rounded-[18px] border border-line bg-paper p-6 space-y-4 shadow-card">
        <img src={`${(import.meta as any).env?.BASE_URL ?? '/'}zlz-logo-wordmark.png`} alt="Zeh L'Zeh" className="h-[72px] w-auto object-contain mx-auto" />
        {allSet ? <VolunteerAllSet username={info.data?.data.username ?? ''} links={info.data?.data.links}
                                   onWeb={() => { setAuth(allSet.token, allSet.user); window.location.href = portalBase() + '/'; }} /> :
         info.isLoading ? <div className="text-[14px] text-muted">Checking your invite…</div> :
         info.isError ? <div className="text-[14px] text-clay">{(info.error as Error)?.message || 'This invite link has expired. Ask the office for a new one.'}</div> : (
          <>
            <div className="text-[15px]">Welcome, <b>{info.data!.data.firstName}</b>! Choose a password to finish setting up your account.</div>
            <div className="text-[12.5px] text-muted">Your username: <b>{info.data!.data.username}</b></div>
            <label className="block text-[12.5px] font-bold">New password (at least 8 characters)
              <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} className={inp} autoComplete="new-password" /></label>
            <label className="block text-[12.5px] font-bold">Type it again
              <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} className={inp} autoComplete="new-password" /></label>
            {pw2 && pw !== pw2 && <div className="text-[12px] text-clay">The two passwords don't match.</div>}
            {err && <div className="text-[12px] text-clay">{err}</div>}
            <button disabled={pw.length < 8 || pw !== pw2 || accept.isPending} onClick={() => { setErr(null); accept.mutate(); }}
                    className="haptic w-full rounded-[12px] bg-forest px-4 py-3 text-[15px] font-bold text-paper disabled:opacity-50">
              {accept.isPending ? 'Setting up…' : 'Set password & sign in'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/** Oct 14 client: after a volunteer chooses a password — get the app and log in. */
function VolunteerAllSet({ username, links, onWeb }: { username: string; links?: { android: string; ios: string }; onWeb: () => void }) {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const isAndroid = /android/i.test(ua);
  const isIOS = /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1);
  const android = links?.android || PLAY_HTTPS_URL;
  const ios = links?.ios || IOS_APP_STORE_URL;
  const big = 'haptic block w-full rounded-[12px] bg-forest px-4 py-3 text-center text-[15px] font-bold text-paper';
  const small = 'haptic block w-full rounded-[12px] border border-forest/40 px-4 py-2.5 text-center text-[14px] font-bold text-forest';
  return (
    <div className="space-y-3" data-testid="invite-all-set">
      <div className="text-[18px] font-display font-semibold">You're all set ✅</div>
      <div className="text-[15px]">Open the Zeh L'Zeh app and log in with <b className="font-mono">{username}</b> and the password you just chose.</div>
      {isAndroid ? <a href={android} className={big}>Get the app on Google Play</a>
       : isIOS ? <a href={ios} className={big}>Get the app on the App Store</a>
       : (
        <>
          <a href={android} target="_blank" rel="noreferrer" className={small}>Android: Google Play</a>
          <a href={ios} target="_blank" rel="noreferrer" className={small}>iPhone: App Store</a>
        </>
      )}
      <button onClick={onWeb} className={isAndroid || isIOS ? small : big}>Use it on the web now</button>
    </div>
  );
}

/** Oct 5 client: give a store the app — one text with the links and simple steps. */
export function SupplierAppAccessButton({ supplier }: { supplier: { id: number; name: string; contactPhone?: string | null } }) {
  const st = useQuery({
    queryKey: ['supplier-app-access', supplier.id],
    queryFn: () => api<{ data: { hasLogin: boolean; username?: string; lastLoginAt?: string | null; pending?: boolean; expired?: boolean; invitedAt?: string | null } }>(`/api/suppliers/${supplier.id}/app-access`),
  });
  const [open, setOpen] = useState(false);
  const s = st.data?.data;
  const status = !s ? '' : !s.hasLogin ? 'No app login yet'
    : s.pending ? `App invite sent ${fmtWhen(s.invitedAt)} · not set up yet`
    : s.expired ? 'App invite expired'
    : s.lastLoginAt ? `Using the app · last in ${fmtWhen(s.lastLoginAt)}` : `App login: ${s.username}`;
  return (
    <>
      <span className="mr-auto self-center text-[12px] text-muted">{status}</span>
      <button onClick={() => setOpen(true)}
              className="haptic rounded-[10px] border border-forest/40 px-3 py-1.5 text-[12.5px] font-bold text-forest hover:bg-sage/60">
        {s?.hasLogin ? 'Resend app invite' : 'Give app access'}
      </button>
      {open && <SupplierAccessModal supplier={supplier} hasLogin={!!s?.hasLogin} onClose={() => { setOpen(false); void st.refetch(); }} />}
    </>
  );
}

function SupplierAccessModal({ supplier, hasLogin, onClose }: { supplier: { id: number; name: string; contactPhone?: string | null }; hasLogin: boolean; onClose: () => void }) {
  const [phone, setPhone] = useState(supplier.contactPhone ?? '');
  const [username, setUsername] = useState('');
  const [sendText, setSendText] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<InviteDone | null>(null);
  const mut = useMutation({
    mutationFn: () => api<{ data: { inviteUrl: string; texted: boolean; username: string; links: AppLinks; textProblem: string | null; sentTo: string | null } }>(
      `/api/suppliers/${supplier.id}/app-access`, { method: 'POST', body: JSON.stringify({ phone, username: hasLogin ? undefined : username, sendText }) }),
    onSuccess: (r) => setDone({ url: r.data.inviteUrl, texted: r.data.texted, username: r.data.username, links: r.data.links, textProblem: r.data.textProblem, sentTo: r.data.sentTo }),
    onError: (e: any) => setErr(e?.message || 'Could not create the app login'),
  });
  const inp = 'mt-1 w-full rounded-[10px] border border-line bg-paper px-3 py-2 text-[13px] font-normal';
  if (done) return <Shell title={`${supplier.name} — app access`} onClose={onClose}><InviteResult done={done} onClose={onClose} /></Shell>;
  return (
    <Shell title={`Give ${supplier.name} the app`} onClose={onClose}>
      <div className="text-[12.5px] text-muted">
        They get one text with their username, a link to set their own password, the app link, and simple steps.
        They only see their own store.
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-[12px] font-bold">Cell phone<input value={phone} onChange={(e) => setPhone(e.target.value)} className={inp} placeholder="845-555-1234" /></label>
        {!hasLogin && <label className="block text-[12px] font-bold">Username<input value={username} onChange={(e) => setUsername(e.target.value)} className={inp} placeholder="blank = their phone" /></label>}
      </div>
      <label className="flex items-center gap-2 text-[12.5px]">
        <input type="checkbox" checked={sendText} onChange={(e) => setSendText(e.target.checked)} className="h-4 w-4 accent-forest" />
        Text it to them <span className="text-muted">(wording: Messaging → Groups → Message templates)</span>
      </label>
      {err && <div className="text-[12px] text-clay">{err}</div>}
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="haptic rounded-[10px] border border-line px-4 py-2 text-[13px] font-bold text-muted">Cancel</button>
        <button disabled={mut.isPending || (sendText && phone.replace(/\D/g, '').length < 10)} onClick={() => { setErr(null); mut.mutate(); }}
                className="haptic rounded-[10px] bg-forest px-4 py-2 text-[13px] font-bold text-paper disabled:opacity-50">
          {mut.isPending ? 'Sending…' : hasLogin ? 'Send new link' : 'Send app invite'}
        </button>
      </div>
    </Shell>
  );
}
