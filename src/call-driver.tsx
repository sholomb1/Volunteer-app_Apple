/**
 * Oct 16 client (idea 8): one-tap "Call the driver" from a pickup card (Live Board)
 * and the pickup page. Tapping 📞 opens the phone (tel:, the driver's "best number
 * to call" = phone_primary) AND logs the call at once in the driver's call log
 * (POST /api/volunteers/:id/call-log, outcome 'calling', with the pickup). A small
 * "How did it go?" row (Answered / No answer / Left a message) then updates that
 * same entry (PATCH /api/volunteers/:id/call-log/:logId). The card shows
 * "Called 2:14 PM — No answer" under the driver. Same log as On call now, so the
 * calls show there and in the driver's Recent calls.
 * No new polling: reuses the On call now query (['on-call-calls-today'], 60 s).
 * Oct 22 client (dispatcher view): + "💬 Text" next to each driver — a short box to text that
 * driver (1:1, POST /api/sms/send-one), so a dispatcher can text the drivers on a pickup
 * right from its card. Shows in the driver's Messages / Driver messages → Texts.
 * Oct 22 client: the box starts "Hi Shmueli, about the Hive Deli pickup (4:00 PM): " (store, else donor /
 * contact, else the street; the day when not today) — never the internal pickup number (pickup-label.ts).
 * Callers pass `pickup`; without it (alert pop-up) the pickup is looked up once when Text is tapped.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, canWrite, getUser } from './api';
import { fmtTimeEastern } from './time-format';
import { displayPhone } from './display'; // Oct 23 client
import type { CallRow } from './on-call';
import { driverTextPrefill, type PickupLabelInput } from './pickup-label'; // Oct 22 client: name the pickup, never its id
import { useNightSend, ScheduledTexts, personalSched, refreshScheduled } from './late-night'; // Oct 23 client: late-night prompt

type Driver = { volunteer_id: number | string; first_name?: string | null; last_name?: string | null; phone?: string | null };
type Asking = { logId: number; volunteerId: number; name: string };
const FOLLOW_UPS: Array<[string, string]> = [['answered', 'Answered'], ['no_answer', 'No answer'], ['voicemail', 'Left message']];

export function useTodayCalls() {
  return useQuery({
    queryKey: ['on-call-calls-today'],
    queryFn: () => api<{ data: CallRow[] }>('/api/on-call/calls/today'),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

/** "Called 2:14 PM — No answer" (just "Called 2:14 PM" until they say how it went). */
export function calledLine(c: Pick<CallRow, 'occurredAt' | 'outcome' | 'byName'>, withBy = false): string {
  return `Called ${fmtTimeEastern(c.occurredAt)}${c.outcome && c.outcome !== 'Called' ? ` — ${c.outcome}` : ''}${withBy && c.byName ? ` (${c.byName})` : ''}`;
}

const telOf = (p: string) => p.replace(/[^\d+]/g, '');

export function DriverCallButtons({ pickupId, pickupRef, pickup, drivers, big }: {
  pickupId: number; pickupRef?: string | null; drivers: Driver[]; big?: boolean;
  pickup?: PickupLabelInput | null; // Oct 22 client: names the pickup in the Text box
}) {
  const qc = useQueryClient();
  const calls = useTodayCalls();
  const key = String(pickupRef ?? pickupId);
  const canCall = canWrite(getUser()?.role);
  const [asking, setAsking] = useState<Asking | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // Oct 22 client: text one driver about this pickup.
  const [texting, setTexting] = useState<{ id: number; name: string; phone: string } | null>(null);
  const [txtMsg, setTxtMsg] = useState('');
  const [txtNote, setTxtNote] = useState<string | null>(null);
  // Oct 23 client: late at night "It's 1:12 AM. Send now, or schedule it?" (late-night.tsx).
  const sendText = useNightSend({
    send: (c: boolean) => api('/api/sms/send-one', { method: 'POST', body: JSON.stringify({ phone: texting!.phone, body: txtMsg.trim(), ...(c ? { confirmNight: true } : {}) }) }),
    schedule: (iso: string) => personalSched.create({ kind: 'sms', phone: texting!.phone, text: txtMsg.trim(), aboutPickupId: Number(pickupId) || null }, iso),
    onSent: () => { setTxtNote(`✅ Sent to ${texting!.name}.`); setTxtMsg(''); qc.invalidateQueries({ queryKey: ['sms-convo', texting!.id] }); qc.invalidateQueries({ queryKey: ['sms-threads'] }); },
    onScheduled: () => { setTxtNote(null); setTxtMsg(''); refreshScheduled(qc); }, // the ⏰ line shows below
    onError: (e: Error) => setTxtNote(`⚠️ ${e.message || 'Not sent'}`),
  });
  const refresh = (vid: number) => {
    qc.invalidateQueries({ queryKey: ['on-call-calls-today'] });
    qc.invalidateQueries({ queryKey: ['call-log', vid] });
    qc.invalidateQueries({ queryKey: ['crm-history', 'volunteer', vid] });
  };
  const start = useMutation({
    mutationFn: (d: { id: number; name: string }) => api<{ data: CallRow }>(`/api/volunteers/${d.id}/call-log`, {
      method: 'POST', body: JSON.stringify({ outcome: 'calling', pickupId: Number(pickupId) }),
    }),
    onSuccess: (r, d) => { setErr(null); setAsking({ logId: r.data.id, volunteerId: d.id, name: d.name }); refresh(d.id); },
    onError: (e: Error) => setErr(`The call was not logged: ${e.message}`),
  });
  const finish = useMutation({
    mutationFn: (outcome: string) => api<{ data: CallRow }>(`/api/volunteers/${asking!.volunteerId}/call-log/${asking!.logId}`, {
      method: 'PATCH', body: JSON.stringify({ outcome }),
    }),
    onSuccess: () => { const vid = asking!.volunteerId; setAsking(null); refresh(vid); },
    onError: (e: Error) => setErr(e.message),
  });
  // Oct 22 client: open the Text box with the pickup's name ("about the Hive Deli pickup (4:00 PM): ").
  const openText = async (vid: number, name: string, phone: string) => {
    setTexting({ id: vid, name, phone }); setTxtNote(null);
    const generic = driverTextPrefill(name, null);
    if (pickup) { setTxtMsg((m) => m || driverTextPrefill(name, pickup)); return; }
    setTxtMsg((m) => m || generic);
    try {
      const row = await qc.fetchQuery({
        queryKey: ['admin-pickup-single', pickupId], staleTime: 60_000,
        queryFn: async () => (await api<{ data: PickupLabelInput }>(`/api/pickup-instances/${pickupId}`)).data ?? null,
      });
      if (row) setTxtMsg((m) => (!m || m === generic ? driverTextPrefill(name, row) : m));
    } catch { /* keep "about your pickup" */ }
  };
  const list = drivers.filter((d) => d && d.volunteer_id != null);
  if (!list.length) return null;
  const lastFor = (vid: number) => (calls.data?.data ?? []).find((c) => c.volunteerId === vid && c.pickupRef === key);
  const txt = big ? 'text-[13px]' : 'text-[12px]';
  return (
    <div data-call-driver={pickupId} onClick={(e) => e.stopPropagation()} className="space-y-1">
      {list.map((d) => {
        const vid = Number(d.volunteer_id);
        const name = String(d.first_name ?? '').trim() || 'driver';
        const last = lastFor(vid);
        return (
          <div key={vid} className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 ${txt}`}>
            {d.phone ? (
              <a href={`tel:${telOf(d.phone)}`} data-call-btn={vid}
                 onClick={(e) => { e.stopPropagation(); if (canCall && !start.isPending) start.mutate({ id: vid, name }); }}
                 title={`Call ${name} (${displayPhone(d.phone)}). The call is written in the call log.`}
                 className={`haptic inline-flex items-center gap-1 rounded-[9px] border border-forest/40 bg-paper px-2.5 ${big ? 'py-1.5' : 'py-1'} font-bold text-forest hover:bg-sage/60`}>
                📞 Call {name}
              </a>
            ) : (
              <span className="text-muted">{name}: no phone on file</span>
            )}
            {d.phone && canCall && (
              <button type="button" data-text-btn={vid}
                      onClick={(e) => { e.stopPropagation(); void openText(vid, name, String(d.phone)); }}
                      title={`Text ${name} (1:1). It shows in Driver messages → Texts.`}
                      className={`haptic inline-flex items-center gap-1 rounded-[9px] border border-sky/40 bg-paper px-2.5 ${big ? 'py-1.5' : 'py-1'} font-bold text-sky-deep hover:bg-sky/10`}>
                💬 Text {name}
              </button>
            )}
            {last && <span data-called-line={vid} className="font-bold text-forest">{calledLine(last, big)}</span>}
          </div>
        );
      })}
      {asking && (
        <div data-call-followup className={`flex flex-wrap items-center gap-1.5 rounded-[10px] border border-line bg-cream/50 px-2 py-1.5 ${txt}`}>
          <span className="font-bold text-ink">How did it go with {asking.name}?</span>
          {FOLLOW_UPS.map(([k, l]) => (
            <button key={k} type="button" disabled={finish.isPending} onClick={() => finish.mutate(k)}
                    className="haptic rounded-full border border-line bg-paper px-2.5 py-1 font-bold text-ink hover:border-forest disabled:opacity-50">{l}</button>
          ))}
          <button type="button" onClick={() => setAsking(null)} title="Close (the call stays logged)" className="haptic px-1.5 font-bold text-muted">✕</button>
        </div>
      )}
      {texting && (
        <div data-text-box className={`space-y-1 rounded-[10px] border border-sky/40 bg-sky-soft/40 px-2 py-1.5 ${txt}`}>
          <div className="flex items-center justify-between gap-2">
            <span className="font-bold text-ink">Text {texting.name}</span>
            <button type="button" onClick={() => { setTexting(null); setTxtMsg(''); }} title="Close" className="haptic px-1.5 font-bold text-muted">✕</button>
          </div>
          <div className="flex gap-1.5">
            <input value={txtMsg} onChange={(e) => { setTxtMsg(e.target.value); setTxtNote(null); }}
                   onKeyDown={(e) => { if (e.key === 'Enter' && txtMsg.trim() && !sendText.busy) void sendText.start(); }}
                   className="flex-1 min-w-0 rounded-[8px] border border-line bg-paper px-2 py-1 text-[12.5px]" />
            <button type="button" data-text-send disabled={!txtMsg.trim() || sendText.busy} onClick={() => { void sendText.start(); }}
                    className="haptic rounded-[8px] bg-forest px-3 py-1 font-bold text-paper disabled:opacity-50">{sendText.busy ? 'Sending…' : 'Send'}</button>
          </div>
          {txtNote && <div className="font-semibold">{txtNote}</div>}
          <ScheduledTexts filter={{ volunteerId: texting.id, phone: texting.phone }} />
          {sendText.prompt}
        </div>
      )}
      {err && <div className={`${txt} font-bold text-clay`}>{err}</div>}
    </div>
  );
}
