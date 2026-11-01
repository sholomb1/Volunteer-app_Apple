/**
 * Oct 22 client (dispatcher view, agreed Oct 21): the driver popup's "Messages" tab for a
 * dispatcher login — the WHOLE two-way conversation with this driver in one list:
 * texts (GET /api/volunteers/:id/conversation, all his numbers), app chat
 * (GET /api/me/dm/:userId) and WhatsApp (GET /api/wa/threads/:phone), newest at the bottom,
 * each message marked Text / App / WhatsApp. A box under it sends a new message by text,
 * app chat (if he has the app) or WhatsApp (if he writes on WhatsApp).
 * No stats, no settings, nothing else about the driver.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, dm, waBridge, waThreads } from './api';
import { msgWhen } from './display';
import { useNightSend, ScheduledTexts, personalSched, refreshScheduled } from './late-night'; // Oct 23 client: late-night prompt

type Msg = { key: string; at: string; out: boolean; body: string; via: 'Text' | 'App' | 'WhatsApp'; auto?: boolean; failed?: boolean };
type Via = 'text' | 'app' | 'wa';
const VIA_LABEL: Record<Via, string> = { text: 'Text', app: 'App chat', wa: 'WhatsApp' };
const last10 = (p?: string | null) => String(p ?? '').replace(/\D/g, '').slice(-10);
const when = (x: string) => msgWhen(x); // Oct 27 client: "Always write date"

export function DriverMessagesTab({ volunteerId, phone, firstName }: { volunteerId: number; phone?: string | null; firstName?: string | null }) {
  const qc = useQueryClient();
  const p10 = last10(phone);
  const texts = useQuery({
    queryKey: ['sms-convo', volunteerId],
    queryFn: () => api<{ data: { id: number; direction: string; auto?: boolean; body: string; created_at: string }[] }>(`/api/volunteers/${volunteerId}/conversation`),
    refetchInterval: 30_000,
  });
  const contacts = useQuery({ queryKey: ['dm-contacts', 'volunteers'], queryFn: () => dm.volunteers(), staleTime: 5 * 60_000 });
  const userId = (contacts.data?.data ?? []).find((c) => Number(c.volunteer_id) === volunteerId)?.user_id ?? null;
  const chat = useQuery({
    queryKey: ['dm-messages', userId], enabled: userId != null,
    queryFn: () => dm.messages(Number(userId)), refetchInterval: 30_000,
  });
  const wa = useQuery({
    queryKey: ['wa-thread', p10], enabled: p10.length === 10,
    queryFn: () => waThreads.get(p10), refetchInterval: 30_000, retry: false,
  });

  const msgs: Msg[] = useMemo(() => {
    const out: Msg[] = [];
    for (const m of texts.data?.data ?? []) out.push({ key: `t${m.id}`, at: m.created_at, out: m.direction === 'out', body: m.body, via: 'Text', auto: !!m.auto });
    for (const m of chat.data?.data ?? []) out.push({ key: `a${m.id}`, at: m.created_at, out: Number(m.from_user_id) !== Number(userId), body: m.body, via: 'App' });
    for (const m of wa.data?.data?.messages ?? []) out.push({ key: `w${m.id}`, at: m.created_at, out: m.direction === 'out', body: m.body, via: 'WhatsApp', failed: m.status === 'failed' });
    return out.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  }, [texts.data, chat.data, wa.data, userId]);

  const hasWa = (wa.data?.data?.messages ?? []).length > 0;
  const channels: Via[] = [...(p10 ? ['text' as Via] : []), ...(userId != null ? ['app' as Via] : []), ...(hasWa ? ['wa' as Via] : [])];
  const [via, setVia] = useState<Via>('text');
  const cur: Via = channels.includes(via) ? via : (channels[0] ?? 'text');
  const [msg, setMsg] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  // Oct 23 client: texts / WhatsApp late at night ask "Send now, or schedule it?" first (app chat doesn't).
  const send = useNightSend<unknown>({
    send: async (c: boolean) => {
      const body = msg.trim();
      if (cur === 'app') return dm.send(Number(userId), body);
      if (cur === 'wa') return waBridge.send({ phone: p10, text: body, ...(c ? { confirmNight: true } : {}) });
      return api('/api/sms/send-one', { method: 'POST', body: JSON.stringify({ phone, body, ...(c ? { confirmNight: true } : {}) }) });
    },
    schedule: cur === 'app' ? null : (iso: string) => personalSched.create({ kind: cur === 'wa' ? 'wa' : 'sms', phone: cur === 'wa' ? p10 : (phone || p10), text: msg.trim() }, iso),
    onScheduled: () => { setNote(null); setMsg(''); refreshScheduled(qc); }, // the ⏰ line shows above
    onSent: () => {
      setNote(`✅ Sent by ${VIA_LABEL[cur]}.`); setMsg('');
      for (const k of [['sms-convo', volunteerId], ['dm-messages', userId], ['wa-thread', p10], ['sms-threads']]) qc.invalidateQueries({ queryKey: k });
    },
    onError: (e: any) => setNote(`⚠️ ${e?.message || 'Not sent'}`),
  });

  const loading = texts.isLoading || (userId != null && chat.isLoading);
  // Newest at the bottom: open scrolled to the latest message.
  const boxRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => { const el = boxRef.current; if (el) el.scrollTop = el.scrollHeight; }, [msgs.length, loading]);
  const him = (firstName || '').trim() || 'Driver';
  const shown = all ? msgs : msgs.slice(-30);
  return (
    <div data-driver-messages className="space-y-2">
      {loading ? <div className="text-[12.5px] text-muted">Loading messages…</div>
        : texts.isError ? <div className="text-[12.5px] text-clay">Couldn't load the messages. <button onClick={() => texts.refetch()} className="underline font-bold">Try again</button></div>
        : msgs.length === 0 ? <div className="text-[12.5px] text-muted">No messages with {him} yet.</div> : (
        <>
          {msgs.length > shown.length && (
            <button onClick={() => setAll(true)} className="haptic text-[12.5px] font-bold text-forest hover:underline">Show all {msgs.length} messages</button>
          )}
          <div ref={boxRef} className="space-y-1.5 rounded-[12px] border border-line bg-cream/40 p-2.5 max-h-[380px] overflow-y-auto">
            {shown.map((m) => (
              <div key={m.key} className={`flex ${m.out ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[82%] rounded-[12px] px-3 py-1.5 ${m.out ? 'bg-forest text-paper' : 'bg-paper border border-line text-ink'}`}>
                  <div className="whitespace-pre-wrap text-[12.5px]">{m.body}</div>
                  <div className={`mt-0.5 text-[10.5px] ${m.out ? 'text-paper/75' : 'text-muted'}`}>
                    <b>{m.out ? 'Us' : him}</b>{m.out && m.auto ? ' (automatic)' : ''} · {m.via} · {when(m.at)}{m.failed ? ' · not delivered' : ''}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      <ScheduledTexts filter={{ volunteerId, phone: p10 || null }} />{/* Oct 23 client: "⏰ Scheduled for 8:00 AM" */}
      {channels.length > 0 ? (
        <div className="space-y-1.5">
          {channels.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
              <span className="font-bold text-muted">Send by</span>
              {channels.map((c) => (
                <button key={c} type="button" onClick={() => setVia(c)}
                        className={`haptic rounded-full border px-2.5 py-1 font-bold ${cur === c ? 'border-forest bg-forest text-paper' : 'border-line bg-paper text-ink hover:border-forest'}`}>{VIA_LABEL[c]}</button>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <input value={msg} onChange={(e) => { setMsg(e.target.value); setNote(null); }} placeholder={`Message ${him} by ${VIA_LABEL[cur].toLowerCase()}…`}
                   onKeyDown={(e) => { if (e.key === 'Enter' && msg.trim() && !send.busy) void send.start(); }}
                   className="flex-1 min-w-0 rounded-[10px] border border-line bg-paper px-3 py-2 text-[13px]" />
            <button disabled={!msg.trim() || send.busy} onClick={() => { void send.start(); }}
                    className="haptic rounded-[10px] bg-forest px-4 py-2 text-[13px] font-bold text-paper disabled:opacity-50">{send.busy ? 'Sending…' : 'Send'}</button>
          </div>
          {note && <div className="text-[12px] font-semibold">{note}</div>}
          {send.prompt}
        </div>
      ) : <div className="text-[12px] text-muted">No phone number or app on file, so there's no way to message {him} from here.</div>}
    </div>
  );
}
