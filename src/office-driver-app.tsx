/**
 * Oct 14 client: the office does for a driver what the driver does in the app
 * (for drivers who can't use the app). SAME API handlers and SAME columns, so
 * whatever the office sets shows in the app and the other way round:
 *   - OfficePauseReach  (driver profile → Alerts & schedule): Pause (For today / A week /
 *     Until a date… / Until turned back on) + Resume now, and "How should we reach them?"
 *     (Oct 28 client: the driver's three ticks — App notifications / WhatsApp / Text message,
 *     any mix or none; was Text / WhatsApp / Both / App only / Nothing), with who set it and when.
 *     API: GET/PUT /api/volunteers/:id/settings (= /api/me/settings for the driver).
 *   - Oct 14 client: under the reach choice, "WhatsApp status" from REAL events only (messaged us on
 *     WhatsApp / our WhatsApp went through / failed / not confirmed) and "Send test WhatsApp" (one line
 *     through the WhatsApp phone; the sandbox phone on dev) with its result. API: waStatus / waBridge on
 *     GET /api/volunteers/:id/settings; POST /api/volunteers/:id/test-whatsapp, GET …/test-whatsapp/:qid.
 *   - OfficeApplicationTab (driver profile → Application): the driver's "My application"
 *     view + "Edit answers" (same form, incl. "When can we call you?").
 *     API: GET/PUT /api/volunteers/:id/application (= /api/me/application).
 */
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type AlertChoices, type WaConfirmInfo } from './api';
import { cx } from './design';
import {
  AlertTicks, PauseSheet, PausedBox, alertsOf, setByLine, settingsKey, useDriverSettings, usePause,
} from './driver-settings';
import { ApplicationPanel } from './screens/MyApplication';
import { LastChanged } from './change-history'; // Oct 16 client: "Last changed by … · when"

export function OfficePauseReach({ volunteerId, name }: { volunteerId: number; name: string }) {
  const q = useDriverSettings(volunteerId);
  const s = q.data?.data;
  const pause = usePause(s, volunteerId, name);
  const [pauseOpen, setPauseOpen] = useState(false);
  if (q.isLoading) return <div className="text-[13px] text-muted">Loading…</div>;
  if (!s) return <div className="text-[13px] text-clay">Couldn't load. <button onClick={() => q.refetch()} className="underline font-bold">Try again</button></div>;
  const chBy = setByLine(s.channelSetBy);
  return (
    <div className="space-y-3" data-office-pause-reach>
      <div>
        <div className="text-[13px] font-extrabold text-ink mb-1.5">Pause</div>
        {pause.paused ? <PausedBox pause={pause} office /> : (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-[12px] border border-line px-3 py-2">
            <span className="text-[13.5px] text-ink">Not paused — {name} gets pickup messages as chosen below.</span>
            <button onClick={() => setPauseOpen(true)} disabled={pause.busy}
                    className="haptic rounded-[10px] border border-forest/40 bg-sage px-3 py-2 text-[13px] font-bold text-forest disabled:opacity-60">Pause…</button>
          </div>
        )}
        <LastChanged volunteerId={volunteerId} field="pause" />
      </div>
      <div>
        <div className="text-[13px] font-extrabold text-ink">How should we reach {name} about pickups?</div>
        <div className="text-[12px] text-muted mb-1.5">Same ticks as in the driver's app (Settings). Any mix, or none.{chBy ? ` Last ${chBy}.` : ''}</div>
        {/* Oct 28 client: the driver's three ticks (same API call and columns as the app). */}
        <AlertTicks s={s} volunteerId={volunteerId} name={name} compact />
      </div>
      <WhatsAppCheck volunteerId={volunteerId} name={name} alerts={alertsOf(s)}
                     wa={(s as any).waStatus ?? null} bridge={(s as any).waBridge ?? null} confirm={s.waConfirm ?? null} />
      {pauseOpen && <PauseSheet onPick={pause.pauseFor} onClose={() => setPauseOpen(false)} busy={pause.busy} />}
    </div>
  );
}

// Oct 14 client: "Can we see if a driver actually has WhatsApp — based on real things, not what they chose?"
export type WaStatus = { state: 'inbound' | 'sent' | 'failed' | 'unknown'; confirmed: boolean; label: string; at: string | null; queuedSince?: string | null };
type BridgeState = { ok: boolean; reason: string | null };
type TestStatus = { status: string; error: string | null; sentAt: string | null; attempts: number; waStatus: WaStatus | null };

export const waTone = (w: { state: string } | null | undefined) =>
  !w ? 'text-muted' : w.state === 'failed' ? 'text-clay' : w.state === 'unknown' ? 'text-muted' : 'text-forest';

function WhatsAppCheck({ volunteerId, name, alerts, wa, bridge, confirm }: { volunteerId: number; name: string; alerts: AlertChoices; wa: WaStatus | null; bridge: BridgeState | null; confirm?: WaConfirmInfo | null }) {
  const qc = useQueryClient();
  const [testId, setTestId] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const send = useMutation({
    mutationFn: () => api<{ data: { id: number; status: string } }>(`/api/volunteers/${volunteerId}/test-whatsapp`, { method: 'POST', body: '{}' }),
    onSuccess: (r) => { setErr(null); setTestId(r.data.id); },
    onError: (e: any) => { setTestId(null); setErr(e?.message ?? "Couldn't send the test"); },
  });
  const poll = useQuery({
    queryKey: ['wa-test', volunteerId, testId],
    enabled: testId != null,
    queryFn: () => api<{ data: TestStatus }>(`/api/volunteers/${volunteerId}/test-whatsapp/${testId}`).then((r) => r.data),
    refetchInterval: (q) => { const st = q.state.data?.status; return !st || st === 'queued' || st === 'claimed' ? 4000 : false; },
  });
  const st = poll.data?.status;
  // A final answer changes the driver's WhatsApp status — reload it.
  useEffect(() => { if (st === 'sent' || st === 'failed') qc.invalidateQueries({ queryKey: settingsKey(volunteerId) }); }, [st]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = poll.data?.waStatus ?? wa;
  const onWa = alerts.whatsapp;
  const when = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' }) : '');
  const result = testId == null ? null
    : !poll.data || st === 'queued' ? { tone: 'text-[#9a7415]', text: 'Test queued — waiting for the WhatsApp phone to send it…' }
    : st === 'claimed' ? { tone: 'text-[#9a7415]', text: 'The WhatsApp phone is sending it…' }
    : st === 'sent' ? { tone: 'text-forest', text: `✓ Test WhatsApp went through ${when(poll.data.sentAt)}.` }
    : { tone: 'text-clay', text: `✗ Test WhatsApp failed${poll.data.error ? ` (${poll.data.error})` : ''}.` };
  return (
    <div data-wa-check className="rounded-[12px] border border-line px-3 py-2 space-y-1.5">
      <div className="text-[13px] font-extrabold text-ink">WhatsApp status</div>
      {onWa && confirm?.chose && <WaConfirmLine volunteerId={volunteerId} name={name} c={confirm} />}
      <div className={cx('text-[13px] font-bold', waTone(shown))} data-wa-status>{shown?.label ?? '? Not confirmed yet'}</div>
      <div className="text-[12px] text-muted">
        From real events only (they messaged us on WhatsApp, or our WhatsApp went through) — not from what was chosen above.
        {onWa && !shown?.confirmed && (alerts.text
          ? ` Until it's confirmed, ${name} still gets the texts.`
          : ` Until it's confirmed, if WhatsApp can't be used ${name} gets a text instead.`)}
      </div>
      {bridge && !bridge.ok && (
        <div className="text-[12px] font-bold text-[#9a7415]">⚠ {bridge.reason}. WhatsApp-only drivers get their pickup messages as texts until it does.</div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => { setTestId(null); send.mutate(); }} disabled={send.isPending || st === 'queued' || st === 'claimed'}
                className="haptic rounded-[10px] border border-forest/40 bg-sage px-3 py-2 text-[13px] font-bold text-forest disabled:opacity-60">
          {send.isPending ? 'Sending…' : 'Send test WhatsApp'}
        </button>
        <span className="text-[12px] text-muted">One line: "this is a test WhatsApp from the office".</span>
      </div>
      {result && <div className={cx('text-[12.5px] font-bold', result.tone)} data-wa-test-result>{result.text}</div>}
      {err && <div className="text-[12.5px] font-bold text-clay">{err}</div>}
    </div>
  );
}

// Oct 30 client: confirm WhatsApp — "WhatsApp: ✅ working / ⏳ waiting for him to say hi (asked Oct 30) /
// ❌ last WhatsApp failed", and "Send the WhatsApp link again" (office only; the confirm text now).
const shortDay = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' });
export function WaConfirmLine({ volunteerId, name, c }: { volunteerId: number; name: string; c: WaConfirmInfo }) {
  const qc = useQueryClient();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const first = (name || 'the driver').trim().split(/\s+/)[0];
  const again = useMutation({
    mutationFn: () => api<{ data: { ok: boolean } }>(`/api/volunteers/${volunteerId}/wa-confirm-ask`, { method: 'POST', body: '{}' }),
    onSuccess: () => { setMsg({ ok: true, text: `✓ Texted ${first} the WhatsApp link.` }); qc.invalidateQueries({ queryKey: settingsKey(volunteerId) }); },
    onError: (e: any) => setMsg({ ok: false, text: e?.message ?? "Couldn't send it" }),
  });
  const asked = c.askedAt ? ` (asked ${shortDay(c.askedAt)})` : '';
  const line = c.state === 'working' ? '✅ working'
    : c.state === 'failed' ? `❌ last WhatsApp failed${c.askedAt ? ` · waiting for ${first} to say hi${asked}` : ''}`
    : `⏳ waiting for ${first} to say hi${asked}`;
  const tone = c.state === 'working' ? 'text-forest' : c.state === 'failed' ? 'text-clay' : 'text-[#9a7415]';
  return (
    <div data-wa-confirm={c.state ?? 'none'} className="rounded-[10px] bg-paper/60 border border-line px-2.5 py-2 space-y-1">
      <div className={cx('text-[14px] font-extrabold', tone)}>WhatsApp: {line}</div>
      {!c.confirmed && (
        <>
          <div className="text-[12px] text-muted leading-snug">
            No WhatsApp copies until {first} says hi to us on WhatsApp — {first} gets texts meanwhile.{' '}
            {c.asks > 0 ? `We texted ${first} the link${c.asks > 1 ? ` ${c.asks} times` : ''}; it turns on by itself when the hi comes in.`
              : 'The link text goes out by itself (not at night or on Shabbos).'}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => { setMsg(null); again.mutate(); }} disabled={again.isPending} data-wa-confirm-again
                    className="haptic rounded-[9px] border border-forest/40 bg-sage px-2.5 py-1.5 text-[12.5px] font-bold text-forest disabled:opacity-60">
              {again.isPending ? 'Sending…' : c.askedAt ? 'Send the WhatsApp link again' : 'Send the WhatsApp link'}
            </button>
            <span className="text-[11.5px] text-muted">A text: "tap here and press Send".</span>
          </div>
          {msg && <div className={cx('text-[12.5px] font-bold', msg.ok ? 'text-forest' : 'text-clay')}>{msg.text}</div>}
        </>
      )}
    </div>
  );
}

export function OfficeApplicationTab({ volunteerId, name }: { volunteerId: number; name: string }) {
  const [editing, setEditing] = useState(false);
  return (
    <div id={`office-application-${volunteerId}`} className="max-w-[640px]" data-office-application>
      <div className="mb-2 text-[12.5px] text-muted">
        The driver's answers from the sign-up form — the same page the driver sees in the app (My application).
        Edit them here for a driver who can't use the app; it changes the same settings (e.g. call hours).
      </div>
      <ApplicationPanel volunteerId={volunteerId} name={name} editing={editing} setEditing={setEditing} />
    </div>
  );
}
