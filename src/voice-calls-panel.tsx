/**
 * Oct 8 client: automatic phone calls when a texted pickup still has no driver.
 * Oct 19 client: "switch it on, make it reliable" — Settings → 📞 Phone calls:
 *   1. Connect Twilio (admins): Account SID, Auth Token (never shown again), the Twilio
 *      number, Test connection, Test call to my phone, the public address Twilio calls back.
 *   2. Office settings: On/Off, wait after the text, calls per round, minutes between
 *      rounds, most calls per pickup, calling hours. Last 7 days in numbers.
 *   3. Recent calls and how each went.
 * API: GET/PUT /api/admin/voice, GET/PUT/DELETE /api/admin/voice/connection,
 *      POST /api/admin/voice/connection/test, POST /api/admin/voice/test-call.
 */
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { cx } from './design';

type VoiceSettings = Record<'voice_enabled' | 'voice_after_min' | 'voice_wave_size' | 'voice_wave_gap_min' | 'voice_max_per_pickup' | 'voice_start_hour' | 'voice_end_hour', string>;
type Recent = { id: number; pickupId: number; ref: string | null; place?: string | null; at: string; name: string; code: string; label: string };
type Stats = { days: number; calls: number; answered: number; taken: number; voicemail: number; failed: number };
type VoiceData = { configured: boolean; sandbox: boolean; settings: VoiceSettings; recent: Recent[]; stats: Stats; fromPretty: string | null; canConnect: boolean; onCallNow: number };
type Conn = {
  source: 'env' | 'site' | 'none'; editable: boolean; sid: string | null; tokenHint: string | null; problem: string | null;
  from: string | null; fromPretty: string | null; baseUrl: string | null; baseSource: 'env' | 'saved' | 'none';
  suggestedBaseUrl: string | null; webhookExample: string; ready: boolean; sandbox: boolean;
};
type TestResult = { ok: true; account: string; trial: boolean; number: string | null; numberOk: boolean; voice: boolean; note: string | null } | { ok: false; reason: string };

const errText = (e: unknown) => (e as Error)?.message || 'Something went wrong. Try again.';
const input = 'w-full rounded-[10px] border border-line bg-paper px-3 py-2 text-[14px] text-ink';
const btn = 'px-3 py-1.5 rounded-full text-[12.5px] font-bold border haptic disabled:opacity-50';
const hourLabel = (h: string) => {
  const n = Number(h);
  if (!Number.isFinite(n)) return '';
  if (n === 0 || n === 24) return 'midnight';
  if (n === 12) return 'noon';
  return n < 12 ? `${n} AM` : `${n - 12} PM`;
};

export function VoiceCallsPanel() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['admin-voice'],
    queryFn: () => api<VoiceData>('/api/admin/voice'),
    refetchInterval: 30_000,
  });
  const [draft, setDraft] = useState<VoiceSettings | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { if (q.data && !draft) setDraft(q.data.settings); }, [q.data, draft]);
  const save = useMutation({
    mutationFn: (s: Partial<VoiceSettings>) => api<{ settings: VoiceSettings }>('/api/admin/voice', { method: 'PUT', body: JSON.stringify(s) }),
    onMutate: () => setMsg(null),
    onSuccess: (r) => { setDraft(r.settings); setMsg({ ok: true, text: 'Saved ✓' }); qc.invalidateQueries({ queryKey: ['admin-voice'] }); },
    onError: (e) => setMsg({ ok: false, text: errText(e) }),
  });
  if (q.isError) return <div className="text-[13px] text-clay font-bold">{errText(q.error)}</div>;
  if (!q.data || !draft) return <div className="text-[13px] text-muted">Loading…</div>;
  const d = q.data;
  const on = draft.voice_enabled === '1';
  const st = d.stats;
  const numField = (k: keyof VoiceSettings, label: string, suffix: string, hint?: string) => (
    <label className="flex items-center justify-between gap-3 py-1.5 text-[13.5px]">
      <span>{label}{hint && <span className="block text-[11.5px] text-muted">{hint}</span>}</span>
      <span className="flex items-center gap-1.5">
        <input type="number" min={0} max={999} value={draft[k]} disabled={!d.canConnect}
               onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
               className="w-[72px] rounded-[8px] border border-line bg-cream/60 px-2 py-1 text-[13px] text-right" />
        <span className="text-muted text-[12px] w-[60px]">{suffix}</span>
      </span>
    </label>
  );
  return (
    <div className="space-y-4" data-testid="voice-calls-panel">
      {d.canConnect && <TwilioConnectionBox />}

      <div className="rounded-[14px] border border-line bg-paper p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="font-display font-semibold text-[16px]">📞 Call drivers when a pickup isn't taken</div>
            <div className="text-[12.5px] text-muted mt-0.5">
              After the text goes out, if nobody takes the pickup, drivers who are on call right now get a phone call:
              “Press 1 to take it.” They then get the usual details text.
            </div>
          </div>
          <button onClick={() => save.mutate({ voice_enabled: on ? '0' : '1' })} disabled={!d.canConnect || (!on && !d.configured) || save.isPending}
                  className={cx('haptic shrink-0 rounded-full px-4 py-2 text-[13px] font-bold disabled:opacity-50', on ? 'bg-forest text-paper' : 'bg-line text-ink')}
                  data-testid="voice-onoff">
            {on ? 'On' : 'Off'}
          </button>
        </div>
        {!d.configured && (
          <div className="mt-3 rounded-[10px] bg-amber-soft border border-amber/40 px-3 py-2 text-[12.5px]">
            Off: Twilio isn't connected yet. {d.canConnect ? 'Connect it in the box above, then turn this On.' : 'An admin needs to connect it first.'}
          </div>
        )}
        {d.sandbox && (
          <div className="mt-3 rounded-[10px] bg-sky-soft border border-sky/30 px-3 py-2 text-[12.5px]">
            Test site: every call goes to the sandbox phone, and only one call per round is placed.
          </div>
        )}
        <div className="mt-3 text-[13px]" data-testid="voice-stats">
          <b>Last 7 days:</b> {st.calls} call{st.calls === 1 ? '' : 's'}, {st.answered} answered, {st.taken} pickup{st.taken === 1 ? '' : 's'} taken by phone
          {st.voicemail > 0 && <span className="text-muted"> · {st.voicemail} voicemail</span>}
          {st.failed > 0 && <span className="text-clay font-bold"> · {st.failed} failed</span>}
          <span className="block text-[12px] text-muted">On call right now: {d.onCallNow} driver{d.onCallNow === 1 ? '' : 's'}{d.fromPretty ? ` · calls come from ${d.fromPretty}` : ''}</span>
        </div>
        <div className="mt-3 divide-y divide-line/60">
          {numField('voice_after_min', 'Start calling this long after the text', 'minutes')}
          {numField('voice_wave_size', 'Drivers called per round', 'people')}
          {numField('voice_wave_gap_min', 'Wait between rounds', 'minutes')}
          {numField('voice_max_per_pickup', 'Most calls for one pickup', 'calls')}
          {numField('voice_start_hour', 'Calls from (0–23)', hourLabel(draft.voice_start_hour))}
          {numField('voice_end_hour', 'No calls from (1–24)', hourLabel(draft.voice_end_hour))}
        </div>
        {d.canConnect && (
          <div className="mt-3 flex items-center gap-3">
            <button onClick={() => { const { voice_enabled: _e, ...rest } = draft; save.mutate(rest); }} disabled={save.isPending}
                    className="haptic rounded-[10px] bg-forest px-4 py-2 text-[13px] font-bold text-paper disabled:opacity-50">Save</button>
            {msg && <span className={cx('text-[12.5px] font-bold', msg.ok ? 'text-forest' : 'text-clay')} role="status">{msg.text}</span>}
          </div>
        )}
        <div className="mt-2 text-[11.5px] text-muted">
          Who gets a call: only drivers who are <b>on call right now</b> (their answer to “When can we call you?”) and who also get the pickup texts
          (not paused, away, in quiet hours, or STOP). “Please don't call” and drivers who never answered are never called.
          Drivers who usually do that store are called first, then the most active. Nobody is called twice for the same pickup,
          it stops the moment the pickup is covered, and never on Shabbos or Yom Tov.
        </div>
      </div>

      <div className="rounded-[14px] border border-line bg-paper p-4">
        <div className="text-[12px] font-extrabold uppercase tracking-[.05em] text-muted mb-2">Recent calls</div>
        {d.recent.length === 0 ? <div className="text-[13px] text-muted">No calls yet.</div> : (
          <div className="space-y-1">
            {d.recent.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 text-[13px]">
                <span className="truncate"><b>{r.name || 'Unknown'}</b> <span className="text-muted">· {r.place || 'pickup'}</span></span>
                <span className={cx('shrink-0 text-right', r.code === 'pressed1' ? 'text-forest font-bold' : r.code === 'failed' ? 'text-clay' : 'text-muted')}>
                  {r.label} · {new Date(r.at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })}
                </span>
              </div>
            ))}
          </div>
        )}
        <div className="mt-2 text-[11.5px] text-muted">Each call is also in the driver's call log, and on the pickup under “Who got the text”.</div>
      </div>
    </div>
  );
}

// Oct 19 client: connect Twilio from the site (admins only).
function TwilioConnectionBox() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin-voice-connection'], queryFn: () => api<{ data: Conn }>('/api/admin/voice/connection') });
  const c = q.data?.data;
  const [sid, setSid] = useState<string | null>(null);
  const [token, setToken] = useState('');
  const [from, setFrom] = useState<string | null>(null);
  const [base, setBase] = useState<string | null>(null);
  const [myPhone, setMyPhone] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const sidVal = sid ?? c?.sid ?? '';
  const fromVal = from ?? c?.fromPretty ?? '';
  const baseVal = base ?? c?.baseUrl ?? c?.suggestedBaseUrl ?? '';
  const done = (data: Conn, text: string) => {
    qc.setQueryData(['admin-voice-connection'], { data });
    qc.invalidateQueries({ queryKey: ['admin-voice'] });
    setSid(null); setToken(''); setFrom(null); setBase(null);
    setMsg({ ok: true, text });
  };
  const test = useMutation({
    mutationFn: () => api<{ data: TestResult }>('/api/admin/voice/connection/test', { method: 'POST', body: JSON.stringify({ sid: sidVal.trim(), token: token.trim(), from: fromVal.trim() }) }),
    onMutate: () => setMsg(null),
    onSuccess: (r) => setMsg(r.data.ok
      ? { ok: r.data.numberOk || !r.data.number, text: `Connected ✓ ${r.data.account}${r.data.number ? (r.data.numberOk ? ` · ${r.data.number} is in this account${r.data.voice ? ' and can call' : ''}` : '') : ''}${r.data.note ? `. ${r.data.note}` : ''}` }
      : { ok: false, text: r.data.reason }),
    onError: (e) => setMsg({ ok: false, text: errText(e) }),
  });
  const save = useMutation({
    mutationFn: () => api<{ data: Conn }>('/api/admin/voice/connection', { method: 'PUT', body: JSON.stringify({ sid: sidVal.trim(), token: token.trim(), from: fromVal.trim(), baseUrl: base != null ? base.trim() : '' }) }),
    onMutate: () => setMsg(null),
    onSuccess: (r) => done(r.data, 'Saved ✓ Now press “Test call to my phone”, then turn calls On below.'),
    onError: (e) => setMsg({ ok: false, text: errText(e) }),
  });
  const disconnect = useMutation({
    mutationFn: () => api<{ data: Conn }>('/api/admin/voice/connection', { method: 'DELETE' }),
    onMutate: () => setMsg(null),
    onSuccess: (r) => done(r.data, 'Disconnected. Automatic calls are off.'),
    onError: (e) => setMsg({ ok: false, text: errText(e) }),
  });
  const call = useMutation({
    mutationFn: () => api<{ data: { ok: true; calling: string; sandbox: boolean } }>('/api/admin/voice/test-call', { method: 'POST', body: JSON.stringify({ to: myPhone.trim() }) }),
    onMutate: () => setMsg(null),
    onSuccess: (r) => setMsg({ ok: true, text: `Calling ${r.data.calling} now… Answer it to hear a sample pickup call.` }),
    onError: (e) => setMsg({ ok: false, text: errText(e) }),
  });
  const busy = test.isPending || save.isPending || disconnect.isPending || call.isPending;
  const canSave = !!sidVal.trim() && (!!token.trim() || !!c?.tokenHint) && !!fromVal.trim();

  return (
    <section className="rounded-[14px] border border-line bg-paper p-4 space-y-3" data-testid="voice-connection">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-display font-semibold text-[16px] text-ink">Connect Twilio (the phone line)</h3>
        {c && <span className={cx('text-[12px] font-bold', c.ready ? 'text-forest' : 'text-muted')}>{c.ready ? 'Connected ✓' : 'Not connected'}</span>}
      </div>
      {!c ? (
        <p className="text-[13px] text-muted">{q.isError ? errText(q.error) : 'Loading…'}</p>
      ) : (
        <>
          {!c.editable ? (
            <p className="text-[13px] text-ink">
              Set on the server (can’t change here): account <span className="font-bold">{c.sid}</span>
              {c.tokenHint ? ` · Auth Token ending in ${c.tokenHint}` : ''}. Ask Sholo to change it.
            </p>
          ) : (
            <>
              <p className="text-[12.5px] text-muted">
                In the Twilio console (console.twilio.com): copy the <b>Account SID</b> and <b>Auth Token</b> from the home page,
                and the <b>phone number</b> from Phone Numbers → Active numbers. The Auth Token is saved locked and never shown again.
              </p>
              <label className="block space-y-1">
                <span className="text-[12.5px] font-bold text-ink">Account SID</span>
                <input className={input} autoComplete="off" spellCheck={false} value={sidVal} placeholder="AC…"
                       onChange={(e) => setSid(e.target.value)} />
              </label>
              <label className="block space-y-1">
                <span className="text-[12.5px] font-bold text-ink">Auth Token</span>
                <input className={input} type="password" autoComplete="new-password" value={token}
                       placeholder={c.tokenHint ? 'Leave empty to keep the saved one' : '32 letters and numbers'}
                       onChange={(e) => setToken(e.target.value)} />
                {c.tokenHint && !token && <span className="block text-[12px] text-forest font-bold">saved ✓ · ending in {c.tokenHint}</span>}
                {c.problem && <span className="block text-[12px] text-clay font-bold">{c.problem}</span>}
              </label>
            </>
          )}
          <label className="block space-y-1">
            <span className="text-[12.5px] font-bold text-ink">Twilio phone number <span className="font-normal text-muted">(calls come from this number)</span></span>
            <input className={input} type="tel" autoComplete="off" value={fromVal} placeholder="(845) 555-1234"
                   onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="block space-y-1">
            <span className="text-[12.5px] font-bold text-ink">Public address Twilio calls back <span className="font-normal text-muted">(check it)</span></span>
            <input className={input} autoComplete="off" spellCheck={false} value={baseVal} disabled={c.baseSource === 'env'}
                   placeholder="https://…/rescue-api" onChange={(e) => setBase(e.target.value)} />
            <span className="block text-[11.5px] text-muted">
              {c.baseSource === 'env' ? 'Set on the server.' : c.baseSource === 'saved' ? 'Saved.' : 'Filled in from this site; saved when you press Save.'}
              {' '}Twilio asks this address what to say, e.g. {c.webhookExample}. It must open from the internet with https.
            </span>
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy || !sidVal.trim() || (!token.trim() && !c.tokenHint)} onClick={() => test.mutate()}
                    className={cx(btn, 'bg-paper text-ink border-line')} data-testid="voice-test-connection">
              {test.isPending ? 'Testing… (up to 10 s)' : 'Test connection'}
            </button>
            <button type="button" disabled={busy || !canSave} onClick={() => save.mutate()}
                    className={cx(btn, 'bg-forest text-paper border-forest')}>
              {save.isPending ? 'Saving…' : 'Save'}
            </button>
            {c.source === 'site' && (
              <button type="button" disabled={busy}
                      onClick={() => { if (window.confirm('Disconnect Twilio? Automatic calls will stop.')) disconnect.mutate(); }}
                      className={cx(btn, 'bg-paper text-clay border-clay/40')}>
                Disconnect
              </button>
            )}
          </div>
          <div className="rounded-[10px] border border-line/70 bg-cream/40 p-3 space-y-2">
            <div className="text-[12.5px] font-bold text-ink">Test call to my phone</div>
            <div className="text-[12px] text-muted">
              Calls you with a sample pickup message so you can hear it. Nothing is taken.
              {c.sandbox && <b> On the test site the call goes to the sandbox phone, whatever number you type.</b>}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input className={cx(input, 'max-w-[200px]')} type="tel" autoComplete="tel" value={myPhone} placeholder="My phone number"
                     onChange={(e) => setMyPhone(e.target.value)} />
              <button type="button" disabled={busy || !c.ready || !myPhone.trim()} onClick={() => call.mutate()}
                      className={cx(btn, 'bg-paper text-ink border-line')} data-testid="voice-test-call">
                {call.isPending ? 'Calling…' : 'Test call to my phone'}
              </button>
            </div>
            {!c.ready && <div className="text-[11.5px] text-muted">Save the connection first.</div>}
          </div>
        </>
      )}
      {msg && <p className={cx('text-[13px] font-bold', msg.ok ? 'text-forest' : 'text-clay')} role="status">{msg.text}</p>}
    </section>
  );
}
