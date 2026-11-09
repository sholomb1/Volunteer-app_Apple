/**
 * Nov 2 client: "one extension for the whole dispatching … we have a few dispatchers". The dispatch line
 * (the extension the API key belongs to) forwards to whoever is dispatching: by the Dispatching Shifts
 * schedule, or "📲 I'm dispatching now", or an admin types a number. API: routes/pbx.ts (pbx-forward.ts).
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, isDispatcherLogin } from './api';
import { useDispatchLine } from './dispatch-line'; // Nov 4 client: "(ext. 103)"
import { useLeaveGuard } from './next-dispatcher'; // Nov 6 client: the next dispatcher hasn't signed in → ask first

type Base = { callOption: 'direct-dial' | 'click-to-call'; callingOption: 'phone' | 'app'; dialMethod: 'Normal' | 'Simultaneous'; confirm: boolean; smsNotification: 'selected' | 'all'; confirmed: boolean };
type Fwd = {
  state: { number: string | null; name: string | null; source: string | null; at: string | null; manualUntil: string | null; auto: boolean; backup: string | null; backupName: string | null; lastError: string | null };
  base: Base; now: string; target: { pretty: string; source: string }; myPhone: string | null;
  upcoming: Array<{ name: string; hasPhone: boolean; startsAt: string }>; isAdmin: boolean; sandbox: boolean;
};
const KEY = ['pbx-forward'];
const when = (iso: string | null) => iso ? new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: '2-digit' }) : '';
const btn = 'px-3 py-1.5 rounded-full text-[12.5px] font-bold border haptic disabled:opacity-50';
const input = 'w-full rounded-[10px] border border-line bg-paper px-3 py-2 text-[14px] text-ink';

export function useForward(enabled = true) {
  return useQuery({ queryKey: KEY, enabled, refetchInterval: 60_000, queryFn: () => api<{ data: Fwd }>('/api/pbx/forward'), retry: false });
}

/** "📲 I'm dispatching now" — for any office login (forwards the dispatch line to MY cell until the next shift). */
export function DispatchingNowButton({ className, msgClassName }: { className?: string; msgClassName?: string }) {
  const qc = useQueryClient();
  const dl = useDispatchLine();
  const [msg, setMsg] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: () => api<{ data: { now: string; until: string | null } }>('/api/pbx/forward', { method: 'POST', body: JSON.stringify({ me: true }) }),
    onSuccess: (r) => { setMsg(`Dispatch calls (${dl.short}) now go to ${r.data.now}${r.data.until ? ` until ${when(r.data.until)}` : ''}.`); qc.invalidateQueries({ queryKey: KEY }); },
    onError: (e: any) => setMsg(e?.body?.error || e?.message || "Couldn't switch."),
  });
  return (
    <span className="inline-flex flex-col gap-1">
      <button type="button" disabled={m.isPending} onClick={() => m.mutate()} title={`Forward the dispatch line, ${dl.full}, to my cell until the next shift`}
              className={className ?? `${btn} bg-forest text-paper border-forest`}>📲 I'm dispatching now</button>
      {msg && <span className={msgClassName ?? "text-[12px] text-ink"}>{msg}</span>}
    </span>
  );
}

/** Nov 5 client: "must have turn off forwarding by dispatch" — on the Dispatch strip. Admins: always (when on).
 *  A dispatcher: only when the calls go to his own cell. */
export function ForwardOffButton({ className, msgClassName }: { className?: string; msgClassName?: string }) {
  const qc = useQueryClient();
  const dl = useDispatchLine();
  const q = useForward();
  const [msg, setMsg] = useState<string | null>(null);
  const v = q.data?.data as any;
  const m = useMutation({
    mutationFn: () => api<{ data: { now: string } }>('/api/pbx/forward', { method: 'POST', body: JSON.stringify({ off: true }) }),
    onSuccess: () => { setMsg(`Forwarding is off. Calls to ${dl.short} follow the rules set in the Reliable app.`); qc.invalidateQueries({ queryKey: KEY }); },
    onError: (e: any) => setMsg(e?.body?.error || e?.message || "Couldn't turn it off."),
  });
  const lg = useLeaveGuard();
  const s = v?.state;
  const on = !!s?.number;
  const mine = !!v?.myPhone && v.myPhone === s?.number;
  if (!on || !(v?.isAdmin || mine)) return msg ? <span className={msgClassName ?? 'text-[12px] text-ink'}>{msg}</span> : null;
  return (
    <span className="inline-flex flex-col gap-1">
      {lg.dialog}
      <button type="button" disabled={m.isPending}
              onClick={() => lg.guard(() => m.mutate(), () => { if (window.confirm(`Turn forwarding off? No cell rings: dispatch calls (${dl.short}) will follow the rules set in the Reliable app.`)) m.mutate(); })}
              className={className ?? `${btn} border-line text-ink bg-paper`}>Turn forwarding off</button>
      {msg && <span className={msgClassName ?? 'text-[12px] text-ink'}>{msg}</span>}
    </span>
  );
}

/** The green "Dispatch calls go to" card. Nov 5 client (simple Dispatch page): on Dispatch → Now it is the basic
 *  card for everyone (who gets the calls + "I'm dispatching now"); the admin forwarding controls show only with
 *  `setup` (Admin → Dispatch settings → Phone system). Who gets calls / overrides: Dispatch → 📅 Schedule. */
export function DispatchForwardCard({ setup = false }: { setup?: boolean } = {}) {
  const qc = useQueryClient();
  const q = useForward();
  const dl = useDispatchLine();
  const [baseEdit, setBaseEdit] = useState<Base | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const done = (t: string) => { setMsg(t); qc.invalidateQueries({ queryKey: KEY }); };
  const fail = (e: any) => setMsg(e?.body?.error || e?.message || 'Something went wrong.');
  const base = useMutation({ mutationFn: (b: Base) => api('/api/admin/pbx/forward-base', { method: 'PUT', body: JSON.stringify(b) }),
    onSuccess: () => { setBaseEdit(null); done('Phone options confirmed.'); }, onError: fail });
  const v0 = q.data?.data;
  const v = v0 && isDispatcherLogin() ? { ...v0, isAdmin: false } : v0; // Nov 4 Yakov: the admins' Dispatcher view shows the dispatcher's box
  if (!v) return null;
  const s = v.state;
  const b = baseEdit ?? v.base;
  const sel = (k: keyof Base, opts: Array<[string, string]>) => (
    <select value={String(b[k])} onChange={(e) => setBaseEdit({ ...b, [k]: k === 'confirm' ? e.target.value === 'true' : e.target.value } as Base)}
            className="rounded-[8px] border border-line bg-paper px-2 py-1 text-[13px]">
      {opts.map(([val, label]) => <option key={val} value={val}>{label}</option>)}
    </select>
  );
  const srcText = s.source === 'shift' ? 'by the shift schedule' : s.source === 'override' ? `override of the schedule${s.manualUntil ? ` · until ${when(s.manualUntil)}` : ''}` : s.source === 'backup' ? 'backup — nobody on shift'
    : s.source === 'manual' ? `picked by hand${s.manualUntil ? ` · until ${when(s.manualUntil)}` : ''}` : '';
  const on = !!s.number;
  // Nov 2 client: dispatchers see who, not the phone number (the backup can be a manager's personal cell).
  const [nm, ph] = on ? [s.name || (s.source === 'backup' ? 'Backup' : 'Cell'), v.isAdmin && s.source !== 'backup' && s.number !== s.backup ? v.now.replace(s.name ?? '', '').trim() : ''] : ['Nobody', `Only the dispatch line (${dl.short}) rings`];
  return (
    <section className="rounded-[18px] border border-line bg-paper overflow-hidden">
      {/* Nov 2 client: "make the dispatcher screen better" — one big, calm status card */}
      <div className={`px-5 py-4 ${on ? 'bg-forest text-paper' : 'bg-cream text-ink'}`}>
        <div className={`text-[11px] font-extrabold uppercase tracking-[.14em] ${on ? 'text-paper/70' : 'text-muted'}`}>Dispatch calls go to</div>
        <div className="flex flex-wrap items-end gap-x-3 gap-y-1 mt-1">
          <div className="font-display text-[26px] leading-none font-semibold">{nm}</div>
          <div className={`text-[15px] font-bold ${on ? 'text-paper/90' : 'text-muted'}`}>{ph}</div>
        </div>
        {srcText && <div className={`text-[12.5px] mt-1.5 ${on ? 'text-paper/75' : 'text-muted'}`}>{srcText}</div>}
        <div className={`text-[12.5px] mt-1 ${on ? 'text-paper/75' : 'text-muted'}`}>Calls to {dl.full}</div>
        {s.lastError && <div className="mt-2 rounded-[8px] bg-clay/90 text-paper text-[12.5px] font-bold px-2.5 py-1.5">Last switch failed: {s.lastError}</div>}
        {v.sandbox && <div className="text-[11.5px] mt-1 opacity-75">Test site: nothing is changed on the real phone system.</div>}
      </div>
      <div className="px-5 py-3 flex flex-wrap items-center gap-2 border-b border-line">
        <DispatchingNowButton />
        {v.upcoming.length > 0 && (
          <span className="text-[12px] text-muted ml-auto">Next: {v.upcoming.slice(0, 2).map((u) => `${u.name} ${when(u.startsAt)}${u.hasPhone ? '' : ' (no cell!)'}`).join(' · ')}</span>
        )}
      </div>
      {!setup && v.isAdmin && (
        <div className="px-5 py-2 text-[12px] text-muted">
          Admins: to change where calls go, open{' '}
          <button type="button" data-testid="open-dispatch-setup" onClick={() => window.dispatchEvent(new CustomEvent('zlz:open-dispatch-setup', { detail: { sub: 'who' } }))}
                  className="font-bold text-forest underline">the Dispatch page</button>.
        </div>
      )}
      {setup && v.isAdmin && (
        <div className="px-5 py-3 space-y-3">
          {(!v.base.confirmed || baseEdit) ? (
            <div className="rounded-[12px] border border-amber/50 bg-amber-soft px-3 py-2.5 space-y-2 text-[13px]">
              <div className="font-bold">One time: the phone options of the dispatch extension ({dl.short}) — copy them from its Reliable Settings page</div>
              <div className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1.5 items-center">
                <span>Click to call</span>{sel('callOption', [['direct-dial', 'Direct Dial'], ['click-to-call', 'Click to Call']])}
                <span>Calling option</span>{sel('callingOption', [['app', 'Dial through application'], ['phone', 'Desk phone']])}
                <span>Ring the cell</span>{sel('dialMethod', [['Normal', 'After ringing the desk phone'], ['Simultaneous', 'Together with the desk phone']])}
                <span>Request confirmation</span>{sel('confirm', [['true', 'On'], ['false', 'Off']])}
                <span>Chat notifications for</span>{sel('smsNotification', [['selected', 'Selected Caller Id'], ['all', 'All numbers']])}
              </div>
              <button type="button" disabled={base.isPending} onClick={() => base.mutate(b)} className={`${btn} bg-forest text-paper border-forest`}>These match — save</button>
            </div>
          ) : null}
          {/* Nov 5 client: who gets the calls, the schedule switch, the backup and overrides moved to Dispatch → 📅 Schedule */}
          <div className="text-[13px] text-ink">
            To change who gets dispatch calls (the regular schedule, overrides, turn forwarding off), open{' '}
            <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('zlz:open-dispatch-setup', { detail: { sub: 'who' } }))}
                    className="font-bold text-forest underline">the Dispatch page</button>.
          </div>
          {v.base.confirmed && !baseEdit && (
            <div className="text-[12px] text-muted">Phone options kept: {b.callOption === 'direct-dial' ? 'Direct Dial' : 'Click to Call'} · {b.callingOption === 'app' ? 'dial through application' : 'desk phone'} · cell rings {b.dialMethod === 'Normal' ? 'after the desk phone' : 'together'} · confirmation {b.confirm ? 'on' : 'off'}. <button className="underline" onClick={() => setBaseEdit(v.base)}>Change</button></div>
          )}
        </div>
      )}
      {msg && <div className="px-5 pb-3 text-[12.5px] font-bold text-ink">{msg}</div>}
    </section>
  );
}

/** Nov 2 client: the main connection can be an admin login (104: live calls, texts, history); forwarding is
 *  written with the dispatch extension's own key (103). Phone settings → "Dispatch line key". */
export function FwdKeyCard() {
  const qc = useQueryClient();
  const dl = useDispatchLine();
  const q = useQuery({ queryKey: ['pbx-fwd-key'], queryFn: () => api<{ data: { saved: boolean; clientId: string | null; ext: string | null; name?: string | null; error?: string | null } }>('/api/admin/pbx/fwd-key') });
  const [id, setId] = useState('');
  const [sec, setSec] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (b: Record<string, unknown>) => api<{ data: { saved: boolean; ext?: string | null } }>('/api/admin/pbx/fwd-key', { method: 'PUT', body: JSON.stringify(b) }),
    onSuccess: (r) => { setId(''); setSec(''); setMsg(r.data.saved ? `Saved ✓ — this key is ext ${r.data.ext ?? '?'}` : 'Removed.'); qc.invalidateQueries({ queryKey: ['pbx-fwd-key'] }); },
    onError: (e: any) => setMsg(e?.body?.error || e?.message || "Couldn't save."),
  });
  const v = q.data?.data;
  return (
    <section className="rounded-[14px] border border-line bg-paper p-4 space-y-2">
      <h3 className="font-display font-semibold text-[16px] text-ink">🔑 Dispatch line key ({dl.short}, forwarding only)</h3>
      <p className="text-[12.5px] text-muted">Use this when the main connection above is an admin login (like 104) — so the app gets every call and text live — while forwarding is changed with the dispatch extension's own key ({dl.short}). Make the key while signed in to Reliable as the dispatch extension, {dl.full}.</p>
      <div className="text-[13px]">{v?.saved ? <span className="text-forest font-bold">Saved ✓ · key of ext {v.ext ?? '?'}{v.name ? ` (${v.name})` : ''}{v.error ? ` — ${v.error}` : ''}</span> : <span className="text-muted">Not set — forwarding uses the main key.</span>}</div>
      <div className="flex flex-wrap gap-2">
        <input className={input + ' flex-1 min-w-[180px]'} value={id} onChange={(e) => setId(e.target.value)} placeholder="Client ID" autoComplete="off" />
        <input className={input + ' flex-1 min-w-[180px]'} value={sec} onChange={(e) => setSec(e.target.value)} placeholder="Client secret" type="password" autoComplete="off" />
        <button type="button" disabled={save.isPending || !id.trim() || !sec.trim()} onClick={() => save.mutate({ clientId: id.trim(), clientSecret: sec.trim() })} className={`${btn} bg-forest text-paper border-forest`}>Save</button>
        {v?.saved && <button type="button" onClick={() => { if (window.confirm(`Remove the dispatch line key (${dl.short})? Forwarding will use the main key.`)) save.mutate({ remove: true }); }} className={`${btn} border-clay/40 text-clay bg-paper`}>Remove</button>}
      </div>
      {msg && <div className="text-[12.5px] font-bold text-ink">{msg}</div>}
    </section>
  );
}
