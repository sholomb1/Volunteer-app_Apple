/**
 * Oct 14 client: the office does for a driver what the driver does in the app
 * (for drivers who can't use the app). SAME API handlers and SAME columns, so
 * whatever the office sets shows in the app and the other way round:
 *   - OfficePauseReach  (driver profile → Alerts & schedule): Pause (For today / A week /
 *     Until a date… / Until turned back on) + Resume now, and "How should we reach them?"
 *     (Text / WhatsApp / Both / App only / Nothing), with who set it and when.
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
import { api, type ReachChoice } from './api';
import { cx } from './design';
import { uiConfirm, uiNotify } from './ui-dialogs';
import {
  PauseSheet, PausedBox, REACH_OPTIONS, setByLine, settingsKey, settingsUrl, useDriverSettings, usePause, type DriverSettingsFull,
} from './driver-settings';
import { ApplicationPanel } from './screens/MyApplication';

export function OfficePauseReach({ volunteerId, name }: { volunteerId: number; name: string }) {
  const qc = useQueryClient();
  const q = useDriverSettings(volunteerId);
  const s = q.data?.data;
  const pause = usePause(s, volunteerId);
  const [pauseOpen, setPauseOpen] = useState(false);
  const save = useMutation({
    mutationFn: (channel: ReachChoice) => api<{ data: DriverSettingsFull }>(settingsUrl(volunteerId), { method: 'PUT', body: JSON.stringify({ channel }) }),
    onSuccess: (r) => {
      qc.setQueryData(settingsKey(volunteerId), r);
      qc.invalidateQueries({ queryKey: ['volunteer-alerts', volunteerId] });
      qc.invalidateQueries({ queryKey: ['admin-volunteers'] });
    },
    onError: (e: any) => uiNotify(e?.message ?? "Couldn't save", 'err'),
  });
  async function pick(v: ReachChoice) {
    if (!s || v === s.channel || save.isPending) return;
    if (v === 'none' && !(await uiConfirm(`${name} gets no pickup messages at all?`, { okLabel: 'Yes, nothing', cancelLabel: 'No' }))) return;
    save.mutate(v, { onSuccess: () => uiNotify(`Saved. ${name}: ${REACH_OPTIONS.find((o) => o.value === v)?.label}.`, 'ok') });
  }
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
      </div>
      <div>
        <div className="text-[13px] font-extrabold text-ink">How should we reach {name} about pickups?</div>
        <div className="text-[12px] text-muted mb-1.5">Same choice as in the driver's app (Settings).{chBy ? ` Last ${chBy}.` : ''}</div>
        <div className="flex flex-wrap gap-2" role="radiogroup">
          {REACH_OPTIONS.map((o) => {
            const on = s.channel === o.value;
            return (
              <button key={o.value} type="button" role="radio" aria-checked={on} onClick={() => void pick(o.value)} disabled={save.isPending} title={o.help}
                      className={cx('haptic rounded-[10px] border px-3 py-2 text-[13px] font-bold disabled:opacity-60',
                                    on ? 'border-forest bg-forest text-paper' : 'border-line bg-paper text-ink hover:border-forest')}>
                {o.icon} {o.label}
              </button>
            );
          })}
        </div>
      </div>
      <WhatsAppCheck volunteerId={volunteerId} name={name} channel={s.channel}
                     wa={(s as any).waStatus ?? null} bridge={(s as any).waBridge ?? null} />
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

function WhatsAppCheck({ volunteerId, name, channel, wa, bridge }: { volunteerId: number; name: string; channel: ReachChoice; wa: WaStatus | null; bridge: BridgeState | null }) {
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
  const onWa = channel === 'whatsapp' || channel === 'both';
  const when = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' }) : '');
  const result = testId == null ? null
    : !poll.data || st === 'queued' ? { tone: 'text-[#9a7415]', text: 'Test queued — waiting for the WhatsApp phone to send it…' }
    : st === 'claimed' ? { tone: 'text-[#9a7415]', text: 'The WhatsApp phone is sending it…' }
    : st === 'sent' ? { tone: 'text-forest', text: `✓ Test WhatsApp went through ${when(poll.data.sentAt)}.` }
    : { tone: 'text-clay', text: `✗ Test WhatsApp failed${poll.data.error ? ` (${poll.data.error})` : ''}.` };
  return (
    <div data-wa-check className="rounded-[12px] border border-line px-3 py-2 space-y-1.5">
      <div className="text-[13px] font-extrabold text-ink">WhatsApp status</div>
      <div className={cx('text-[13px] font-bold', waTone(shown))} data-wa-status>{shown?.label ?? '? Not confirmed yet'}</div>
      <div className="text-[12px] text-muted">
        From real events only (they messaged us on WhatsApp, or our WhatsApp went through) — not from what was chosen above.
        {onWa && !shown?.confirmed && ` Until it's confirmed, if WhatsApp can't be used ${name} gets a text instead.`}
      </div>
      {bridge && !bridge.ok && (
        <div className="text-[12px] font-bold text-[#9a7415]">⚠ {bridge.reason}. WhatsApp messages wait until it does; WhatsApp-only drivers get texts instead.</div>
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
