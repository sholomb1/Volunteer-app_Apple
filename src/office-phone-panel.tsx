/**
 * Oct 20 client: Settings → ☎️ Office phone (Reliable PBX). Admins only.
 *   1. Connect: client ID + client secret (saved locked, never shown again), Test connection
 *      (lists the extensions and office numbers), Disconnect.
 *   2. Calls from the app: the office number calls come from + the ONE shared dispatch extension
 *      (whoever is dispatching uses that phone; every office user's 📞 Call rings it).
 *   3. Phone events into the app: Subscribe webhooks (incoming / missed / texts / voicemail).
 * API: GET /api/admin/pbx, PUT/DELETE /api/admin/pbx/connection, POST /api/admin/pbx/test,
 *      GET /api/admin/pbx/lists, PUT /api/admin/pbx/settings, POST /api/admin/pbx/subscribe.
 */
import { dispatchLine } from './dispatch-line'; // Nov 4 client: "(ext. 103)"
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { cx } from './design';
import { refreshOfficePhone } from './office-phone';
import { DispatchForwardCard, FwdKeyCard } from './dispatch-forward'; // Nov 2 client: dispatch forwarding

type Lists = {
  me: { ext: string | null; name: string | null };
  extensions: Array<{ ext: string; name: string; state: string | null }>;
  dids: Array<{ number: string; pretty: string; note: string | null }>;
};
type View = {
  source: 'env' | 'site' | 'none'; editable: boolean; connected: boolean;
  clientId: string | null; secretHint: string | null; problem: string | null;
  callerId: string | null; callerIdPretty: string | null;
  dispatchExt: string | null; dispatchExtName: string | null;
  hooks: Array<{ slug: string; label: string; subscribed: boolean; at: string | null }>;
  baseUrl: string | null; suggestedBaseUrl: string | null;
  status: { lastEventAt: string | null; lastEventType: string | null; healthAt: string | null; healthOk: boolean | null; healthProblem: string | null; tokenExt: string | null; tokenExtName: string | null };
  sandbox: boolean;
};

const errText = (e: unknown) => (e as Error)?.message || 'Something went wrong. Try again.';
const input = 'w-full rounded-[10px] border border-line bg-paper px-3 py-2 text-[14px] text-ink';
const btn = 'px-3 py-1.5 rounded-full text-[12.5px] font-bold border haptic disabled:opacity-50';
const box = 'rounded-[14px] border border-line bg-paper p-4 space-y-3';
const h3 = 'font-display font-semibold text-[16px] text-ink';
const fmtWhen = (iso: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  return d.toLocaleString('en-US', { timeZone: 'America/New_York', ...(sameDay ? {} : { month: 'short', day: 'numeric' }), hour: 'numeric', minute: '2-digit' });
};

export function OfficePhonePanel() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin-pbx'], queryFn: () => api<{ data: View }>('/api/admin/pbx'), refetchInterval: 60_000 });
  const v = q.data?.data;
  const listsQ = useQuery({
    queryKey: ['admin-pbx-lists'], enabled: !!v?.connected, staleTime: 5 * 60_000,
    queryFn: () => api<{ data: Lists | null; error?: string | null }>('/api/admin/pbx/lists'),
  });
  const [lists, setLists] = useState<Lists | null>(null);
  useEffect(() => { if (listsQ.data?.data) setLists(listsQ.data.data); }, [listsQ.data]);

  const [clientId, setClientId] = useState<string | null>(null);
  const [secret, setSecret] = useState('');
  const [callerId, setCallerId] = useState<string | null>(null);
  const [dispatchExt, setDispatchExt] = useState<string | null>(null);
  const [base, setBase] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; where: string } | null>(null);

  const done = (data: View, text: string, where: string) => {
    qc.setQueryData(['admin-pbx'], { data });
    setMsg({ ok: true, text, where });
    refreshOfficePhone();
  };
  const fail = (where: string) => (e: unknown) => setMsg({ ok: false, text: errText(e), where });

  const save = useMutation({
    mutationFn: () => api<{ data: View; note: string | null }>('/api/admin/pbx/connection', { method: 'PUT', body: JSON.stringify({ clientId: (clientId ?? v?.clientId ?? '').trim(), clientSecret: secret.trim() }) }),
    onMutate: () => setMsg(null),
    onSuccess: (r) => { setClientId(null); setSecret(''); done(r.data, r.note ?? 'Saved ✓ Now press Test connection.', 'connect'); qc.invalidateQueries({ queryKey: ['admin-pbx-lists'] }); },
    onError: fail('connect'),
  });
  const test = useMutation({
    mutationFn: () => api<{ data: ({ ok: true } & Lists) | { ok: false; reason: string } }>('/api/admin/pbx/test', { method: 'POST' }),
    onMutate: () => setMsg(null),
    onSuccess: (r) => {
      if (!r.data.ok) { setMsg({ ok: false, text: (r.data as { reason: string }).reason, where: 'connect' }); return; }
      const l = r.data as Lists;
      setLists(l);
      setMsg({ ok: true, where: 'connect', text: `Connected ✓${l.me.ext ? ` · this login is ext ${l.me.ext}${l.me.name ? ` (${l.me.name})` : ''}` : ''} · ${l.extensions.length} extensions · ${l.dids.length} office numbers` });
      qc.invalidateQueries({ queryKey: ['admin-pbx'] });
    },
    onError: fail('connect'),
  });
  const disconnect = useMutation({
    mutationFn: () => api<{ data: View }>('/api/admin/pbx/connection', { method: 'DELETE' }),
    onMutate: () => setMsg(null),
    onSuccess: (r) => { setLists(null); done(r.data, 'Disconnected. Call buttons use this device’s phone again.', 'connect'); },
    onError: fail('connect'),
  });
  const saveSettings = useMutation({
    mutationFn: (body: Record<string, unknown>) => api<{ data: View }>('/api/admin/pbx/settings', { method: 'PUT', body: JSON.stringify(body) }),
    onMutate: () => setMsg(null),
    onSuccess: (r) => { setCallerId(null); setDispatchExt(null); done(r.data, 'Saved ✓', 'caller'); },
    onError: fail('caller'),
  });
  const subscribe = useMutation({
    mutationFn: () => api<{ data: View; failed: string[] }>('/api/admin/pbx/subscribe', { method: 'POST', body: JSON.stringify({ baseUrl: (base ?? '').trim() }) }),
    onMutate: () => setMsg(null),
    onSuccess: (r) => { setBase(null); done(r.data, r.failed.length ? `Partly done. ${r.failed.join(' ')}` : 'Subscribed ✓ Calls, missed calls, texts and voicemails now come into the app.', 'hooks'); },
    onError: fail('hooks'),
  });
  const busy = save.isPending || test.isPending || disconnect.isPending || saveSettings.isPending || subscribe.isPending;

  if (q.isError) return <div className="text-[13px] text-clay font-bold">{errText(q.error)}</div>;
  if (!v) return <div className="text-[13px] text-muted">Loading…</div>;

  const idVal = clientId ?? v.clientId ?? '';
  const callerVal = callerId ?? v.callerId ?? '';
  const extVal = dispatchExt ?? v.dispatchExt ?? '';
  const baseVal = base ?? v.baseUrl ?? v.suggestedBaseUrl ?? '';
  const note = (where: string) => msg && msg.where === where
    ? <p className={cx('text-[13px] font-bold', msg.ok ? 'text-forest' : 'text-clay')} role="status">{msg.text}</p> : null;
  const last = fmtWhen(v.status.lastEventAt);
  const dids = lists?.dids ?? [];
  const extList = lists?.extensions ?? [];

  return (
    <div className="space-y-4" data-testid="office-phone">
      <section className={box}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className={h3}>☎️ Office phone (Reliable PBX)</h3>
          <span className={cx('text-[12px] font-bold', v.connected ? 'text-forest' : 'text-muted')}>
            {v.connected ? `Connected ✓${last ? ` · last call event ${last}` : ' · no call events yet'}` : 'Not connected'}
          </span>
        </div>
        <p className="text-[12.5px] text-muted">
          Connect the office phone system so the office sees who is calling, missed calls and voicemails come in as alerts,
          every call is written in the driver’s or store’s call log, and the 📞 Call buttons ring the dispatch line, {dispatchLine(v.dispatchExt).full}.
          Until it is connected nothing changes: Call buttons open this device’s phone as before.
        </p>
        {v.connected && v.status.healthOk === false && v.status.healthProblem && (
          <p className="text-[13px] font-bold text-clay">Needs a look: {v.status.healthProblem}</p>
        )}
        {!v.editable ? (
          <p className="text-[13px] text-ink">Set on the server (can’t change here): client ID <b>{v.clientId}</b>{v.secretHint ? ` · secret ending in ${v.secretHint}` : ''}. Ask Sholo to change it.</p>
        ) : (
          <>
            <p className="text-[12.5px] text-muted">
              In Reliable PBX (log in as an Admin) make <b>API credentials</b> (developer client). Copy the <b>client ID</b> and the
              <b> client secret</b> (it is shown only once). The secret is saved locked and never shown again.
            </p>
            <label className="block space-y-1">
              <span className="text-[12.5px] font-bold text-ink">Client ID</span>
              <input className={input} autoComplete="off" spellCheck={false} value={idVal} placeholder="8683be78-0edd-46b9-…" onChange={(e) => setClientId(e.target.value)} />
            </label>
            <label className="block space-y-1">
              <span className="text-[12.5px] font-bold text-ink">Client secret</span>
              <input className={input} type="password" autoComplete="new-password" value={secret}
                     placeholder={v.secretHint ? 'Leave empty to keep the saved one' : 'Paste the client secret'} onChange={(e) => setSecret(e.target.value)} />
              {v.secretHint && !secret && <span className="block text-[12px] text-forest font-bold">saved ✓ · ending in {v.secretHint}</span>}
              {v.problem && <span className="block text-[12px] text-clay font-bold">{v.problem}</span>}
            </label>
          </>
        )}
        <div className="flex flex-wrap gap-2">
          {v.editable && (
            <button type="button" disabled={busy || !idVal.trim() || (!secret.trim() && !v.secretHint)} onClick={() => save.mutate()} className={cx(btn, 'bg-forest text-paper border-forest')}>
              {save.isPending ? 'Saving…' : 'Save'}
            </button>
          )}
          <button type="button" disabled={busy || !v.connected} onClick={() => test.mutate()} className={cx(btn, 'bg-paper text-ink border-line')}>
            {test.isPending ? 'Testing… (up to 10 s)' : 'Test connection'}
          </button>
          {v.source === 'site' && (
            <button type="button" disabled={busy}
                    onClick={() => { if (window.confirm(`Disconnect the office phone? Pop-ups, missed-call alerts and dispatch line (${dispatchLine(v.dispatchExt).short}) calling stop.`)) disconnect.mutate(); }}
                    className={cx(btn, 'bg-paper text-clay border-clay/40')}>Disconnect</button>
          )}
        </div>
        {note('connect')}
      </section>

      <section className={cx(box, !v.connected && 'opacity-60')}>
        <h3 className={h3}>Calls from the app</h3>
        <p className="text-[12.5px] text-muted">
          One shared dispatch line — {dispatchLine(v.dispatchExt).full}: whoever is dispatching uses it. When anyone in the office presses 📞 Call, the dispatch
          line rings first; pick it up and it calls the person, who sees the office number.
        </p>
        <label className="block space-y-1">
          <span className="text-[12.5px] font-bold text-ink">Dispatch extension</span>
          <select className={cx(input, 'max-w-[320px]')} value={extVal} disabled={!v.connected} onChange={(e) => setDispatchExt(e.target.value)}>
            <option value="">{extList.length ? 'Pick the dispatch extension' : v.connected ? 'Press Test connection to load the extensions' : 'Connect first'}</option>
            {extVal && !extList.some((x) => x.ext === extVal) && <option value={extVal}>Ext {extVal}{v.dispatchExtName ? ` — ${v.dispatchExtName}` : ''}</option>}
            {extList.map((x) => <option key={x.ext} value={x.ext}>{x.ext} — {x.name}</option>)}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-[12.5px] font-bold text-ink">Office number calls come from</span>
          <select className={cx(input, 'max-w-[320px]')} value={callerVal} disabled={!v.connected} onChange={(e) => setCallerId(e.target.value)}>
            <option value="">{dids.length ? 'Pick the office number' : v.connected ? 'Press Test connection to load the numbers' : 'Connect first'}</option>
            {callerVal && !dids.some((d) => d.number === callerVal) && <option value={callerVal}>{v.callerIdPretty ?? callerVal}</option>}
            {dids.map((d) => <option key={d.number} value={d.number}>{d.pretty}{d.note ? ` — ${d.note}` : ''}</option>)}
          </select>
        </label>
        <button type="button" disabled={busy || !v.connected || (callerId == null && dispatchExt == null)}
                onClick={() => saveSettings.mutate({ callerId: callerVal, dispatchExt: extVal })} className={cx(btn, 'bg-forest text-paper border-forest')}>Save</button>
        {!v.dispatchExt || !v.callerId ? <p className="text-[12px] text-muted">Until both are saved, 📞 Call buttons open this device’s phone as before.</p> : null}
        {note('caller')}
      </section>

      {v.connected && <FwdKeyCard />}{/* Nov 2 client: second key (forwarding) */}
      {v.connected && <DispatchForwardCard setup />}{/* Nov 2 client; Nov 5 client: the admin forwarding controls live here now */}

      <section className={cx(box, !v.connected && 'opacity-60')}>
        <h3 className={h3}>Phone events into the app</h3>
        <ul className="text-[13px] space-y-0.5">
          {v.hooks.map((h) => (
            <li key={h.slug} className={h.subscribed ? 'text-forest font-bold' : 'text-muted'}>
              {h.subscribed ? '✓' : '–'} {h.label}{h.subscribed && h.at ? <span className="font-normal text-muted"> · since {fmtWhen(h.at)}</span> : null}
            </li>
          ))}
        </ul>
        <label className="block space-y-1">
          <span className="text-[12.5px] font-bold text-ink">Public address of this site’s API <span className="font-normal text-muted">(check it)</span></span>
          <input className={input} autoComplete="off" spellCheck={false} value={baseVal} disabled={!v.connected} placeholder="https://…/rescue-api" onChange={(e) => setBase(e.target.value)} />
          <span className="block text-[11.5px] text-muted">Reliable PBX sends each call to {baseVal || 'https://…'}/api/pbx/webhook/… — it must open from the internet with https.</span>
        </label>
        <p className="text-[12px] text-clay font-bold">
          Only one site can get these events. Subscribing here moves them from any other site{v.sandbox ? ' — this is the TEST site, so do it on the live site only, unless Sholo says so.' : '.'}
        </p>
        <button type="button" disabled={busy || !v.connected} onClick={() => { if (window.confirm('Subscribe the phone events again? Reliable will send calls to THIS site only.')) subscribe.mutate(); }} className={cx(btn, 'bg-forest text-paper border-forest')}>
          {subscribe.isPending ? 'Subscribing… (up to 40 s)' : v.hooks.some((h) => h.subscribed) ? 'Subscribe webhooks again' : 'Subscribe webhooks'}
        </button>
        {note('hooks')}
      </section>

      {v.sandbox && <p className="text-[12px] text-muted">Test site: a 📞 Call through the dispatch line ({dispatchLine(v.dispatchExt).short}) always dials the sandbox phone, whatever number you pressed.</p>}
    </div>
  );
}
