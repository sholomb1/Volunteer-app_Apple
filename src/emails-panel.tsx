// Oct 7 client: Messaging → Emails. Write an email to one person, a few, or everyone,
// send now or schedule it; plus the automatic weekly emails. Also the friendly
// "steady pickups available" picture on the recruiting view.
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { Button, cx, SearchSelect, DateInput } from './design';
import { fmtTime } from './time-format';
import { uiConfirm } from './ui-dialogs';

type EmailRow = { kind: string; title: string; on: boolean; last: { at: string; count: number; sent: number } | null };
type Person = { id: number; name: string; email: string };
type Batch = { batch_id: string; subject: string; count: number; status: string; send_at: string | null; created_at: string };

const WHAT: Record<string, string> = {
  weekly_thanks: 'Sundays at 10 AM. Each driver who did a pickup that week gets a short thank-you.',
  weekly_needed: 'Sundays at 10 AM. All active volunteers get the steady pickups that still need a driver.',
};
const when = (iso: string) => new Date(iso).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' });
const TIMES = Array.from({ length: 4 * 17 }, (_, i) => { const m = 6 * 60 + i * 15; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; }); // 6 AM – 10:45 PM
const todayNY = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

export function EmailsPanel() {
  const q = useQuery({ queryKey: ['emails'], queryFn: () => api<{ data: { connected: boolean; emails: EmailRow[] } }>('/api/emails') });
  const d = q.data?.data;
  return (
    <div className="max-w-2xl space-y-5">
      {d && !d.connected && (
        <p className="rounded-[12px] border border-clay/30 bg-clay/10 px-4 py-2.5 text-[13px] text-clay font-semibold">
          Email isn’t connected yet, so nothing actually goes out. Emails are saved and you can see them below.
        </p>
      )}
      <Compose />
      <Outbox />
      <Automatic emails={d?.emails ?? []} />
    </div>
  );
}

function Compose() {
  const qc = useQueryClient();
  const people = useQuery({ queryKey: ['email-people'], queryFn: () => api<{ data: Person[] }>('/api/emails/people') });
  const all = people.data?.data ?? [];
  const [to, setTo] = useState<Person[]>([]);
  const [everyone, setEveryone] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [withList, setWithList] = useState(false);
  const [later, setLater] = useState(false);
  const [date, setDate] = useState(todayNY());
  const [time, setTime] = useState('10:00');
  const [done, setDone] = useState<string | null>(null);

  const send = useMutation({
    mutationFn: () => api<{ data: { count: number; status: string } }>('/api/emails/send', { method: 'POST', body: JSON.stringify({
      volunteerIds: everyone ? 'all' : to.map((p) => p.id), subject, body, includeNeeded: withList,
      sendAt: later ? `${date} ${time}` : null }) }),
    onSuccess: (r) => {
      const n = r.data.count;
      setDone(later ? `Scheduled for ${n} ${n === 1 ? 'person' : 'people'} — ${new Date(`${date}T12:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} at ${fmtTime(time)}.`
                    : r.data.status === 'sent' ? `Sent to ${n}.` : `Saved for ${n} — it goes out once email is connected.`);
      setTo([]); setEveryone(false); setSubject(''); setBody(''); setWithList(false); setLater(false);
      qc.invalidateQueries({ queryKey: ['email-outbox'] });
    },
  });
  const count = everyone ? all.length : to.length;
  const ready = count > 0 && subject.trim() && (body.trim() || withList) && !send.isPending;

  return (
    <section className="rounded-[14px] border border-line bg-paper p-4 space-y-3">
      <h2 className="font-display font-semibold text-[19px] text-ink">New email</h2>

      <div>
        <div className="text-[12px] font-bold text-muted mb-1">To</div>
        {everyone ? (
          <div className="flex items-center gap-2 text-[13.5px]">
            <span className="px-2.5 py-1 rounded-full bg-sage text-forest font-bold">All active volunteers · {all.length}</span>
            <button className="text-[12.5px] font-bold text-muted hover:text-ink" onClick={() => setEveryone(false)}>Change</button>
          </div>
        ) : (
          <>
            {to.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {to.map((p) => (
                  <span key={p.id} className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-sage text-forest text-[12.5px] font-bold">
                    {p.name}
                    <button aria-label={`Remove ${p.name}`} className="ml-0.5 text-forest/70 hover:text-forest" onClick={() => setTo(to.filter((x) => x.id !== p.id))}>×</button>
                  </span>
                ))}
              </div>
            )}
            <SearchSelect key={to.length} items={all.filter((p) => !to.some((x) => x.id === p.id))}
                          getKey={(p) => p.id} getLabel={(p) => p.name} getHint={(p) => p.email}
                          onPick={(p) => setTo([...to, p])} placeholder="Type a name to add…" emptyText="No one by that name with an email" />
            <button className="mt-1.5 text-[12.5px] font-bold text-forest hover:underline" onClick={() => { setEveryone(true); setTo([]); }}>
              Or send to all active volunteers
            </button>
          </>
        )}
      </div>

      <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject"
             className="w-full rounded-[10px] border border-line px-3 py-2 text-[14px] outline-none focus:border-forest" />
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} placeholder="Write your message… (each person’s name is added at the top: “Hi Moshe,”)"
                className="w-full rounded-[10px] border border-line px-3 py-2 text-[14px] outline-none focus:border-forest" />

      <label className="flex items-center gap-2 text-[13.5px] text-ink">
        <input type="checkbox" checked={withList} onChange={(e) => setWithList(e.target.checked)} />
        Add the list of steady pickups that need a driver
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-full border border-line p-0.5 text-[12.5px] font-bold">
          <button className={cx('px-3 py-1 rounded-full', !later ? 'bg-forest text-paper' : 'text-muted')} onClick={() => setLater(false)}>Send now</button>
          <button className={cx('px-3 py-1 rounded-full', later ? 'bg-forest text-paper' : 'text-muted')} onClick={() => setLater(true)}>Schedule</button>
        </div>
        {later && (
          <>
            <DateInput value={date} min={todayNY()} onChange={setDate} />
            <div className="w-[130px]">
              <SearchSelect key={time} items={TIMES} getKey={(t) => t} getLabel={(t) => fmtTime(t)} onPick={setTime} placeholder={fmtTime(time)} />
            </div>
          </>
        )}
      </div>

      {send.error && <p className="text-clay text-[12.5px]">{(send.error as Error).message}</p>}
      {done && <p className="text-forest text-[13px] font-semibold">✓ {done}</p>}
      <div className="flex items-center justify-end gap-2">
        <PreviewButton subject={subject} body={body} withList={withList} />
        <Button size="sm" disabled={!ready} loading={send.isPending} onClick={() => { setDone(null); send.mutate(); }}>
          {later ? 'Schedule' : 'Send'}{count > 0 ? ` to ${count}` : ''}
        </Button>
      </div>
    </section>
  );
}

function PreviewButton({ subject, body, withList }: { subject: string; body: string; withList: boolean }) {
  const [html, setHtml] = useState<string | null>(null);
  const load = useMutation({
    mutationFn: () => api<{ data: { html: string } }>('/api/emails/compose-preview', { method: 'POST', body: JSON.stringify({ subject, body, includeNeeded: withList }) }),
    onSuccess: (r) => setHtml(r.data.html),
  });
  return (
    <>
      <Button size="sm" variant="plain" disabled={!subject.trim() && !body.trim()} onClick={() => load.mutate()}>Preview</Button>
      {html && <HtmlModal title={subject || 'Preview'} html={html} onClose={() => setHtml(null)} />}
    </>
  );
}

function Outbox() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['email-outbox'], queryFn: () => api<{ data: Batch[] }>('/api/emails/outbox'), refetchInterval: 60_000 });
  const cancel = useMutation({
    mutationFn: (id: string) => api(`/api/emails/batch/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['email-outbox'] }),
  });
  const rows = q.data?.data ?? [];
  if (rows.length === 0) return null;
  const label = (b: Batch) => b.status === 'scheduled' ? `Scheduled · ${when(b.send_at!)}`
    : b.status === 'sent' ? `Sent · ${when(b.created_at)}`
    : b.status === 'failed' ? `Didn’t send · ${when(b.created_at)}`
    : `Saved, not sent · ${when(b.created_at)}`;
  return (
    <section className="rounded-[14px] border border-line bg-paper">
      <h2 className="px-4 pt-3 pb-1 font-display font-semibold text-[17px] text-ink">Sent & scheduled</h2>
      <ul>
        {rows.map((b) => (
          <li key={b.batch_id} className="px-4 py-2.5 border-t border-line flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[13.5px] font-bold text-ink truncate">{b.subject}</div>
              <div className={cx('text-[12px]', b.status === 'failed' ? 'text-clay' : 'text-muted')}>{label(b)} · {b.count} {b.count === 1 ? 'person' : 'people'}</div>
            </div>
            {b.status === 'scheduled' && (
              <button className="text-[12.5px] font-bold text-clay hover:underline shrink-0"
                      onClick={() => { void uiConfirm(`Cancel the scheduled email "${b.subject}"?\n\nIt won't go out to the ${b.count} ${b.count === 1 ? 'person' : 'people'}.`).then((ok) => { if (ok) cancel.mutate(b.batch_id); }); }}>Cancel</button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Automatic({ emails }: { emails: EmailRow[] }) {
  const qc = useQueryClient();
  const toggle = useMutation({
    mutationFn: (a: { kind: string; on: boolean }) => api(`/api/emails/${a.kind}`, { method: 'PUT', body: JSON.stringify({ on: a.on }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['emails'] }),
  });
  const [preview, setPreview] = useState<string | null>(null);
  if (emails.length === 0) return null;
  return (
    <section className="rounded-[14px] border border-line bg-paper">
      <h2 className="px-4 pt-3 pb-1 font-display font-semibold text-[17px] text-ink">Automatic emails</h2>
      {emails.map((e) => (
        <div key={e.kind} className="px-4 py-3 border-t border-line flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-bold text-[14px] text-ink">{e.title}</div>
            <p className="text-[12.5px] text-muted mt-0.5">{WHAT[e.kind]}</p>
            <button className="mt-1 text-[12.5px] font-bold text-forest hover:underline" onClick={() => setPreview(e.kind)}>See it</button>
          </div>
          <button type="button" role="switch" aria-checked={e.on} onClick={() => toggle.mutate({ kind: e.kind, on: !e.on })}
                  className={cx('shrink-0 px-3 py-1.5 rounded-full text-[12.5px] font-bold border haptic',
                    e.on ? 'bg-forest text-paper border-forest' : 'bg-paper text-muted border-line')}>
            {e.on ? 'On' : 'Off'}
          </button>
        </div>
      ))}
      {preview && <AutoPreview kind={preview} onClose={() => setPreview(null)} />}
    </section>
  );
}

function AutoPreview({ kind, onClose }: { kind: string; onClose: () => void }) {
  const q = useQuery({
    queryKey: ['email-preview', kind],
    queryFn: () => api<{ data: { count: number; subject: string | null; to: string | null; html: string | null } }>(`/api/emails/${kind}/preview`),
  });
  const d = q.data?.data;
  const note = !d ? 'Loading…' : d.count === 0 ? 'Nobody would get this right now.' : `Goes to ${d.count} ${d.count === 1 ? 'person' : 'people'}. Shown as ${d.to} sees it.`;
  return <HtmlModal title={d?.subject ?? 'Preview'} note={note} html={d?.html ?? null} onClose={onClose} />;
}

function HtmlModal({ title, note, html, onClose }: { title: string; note?: string; html: string | null; onClose: () => void }) {
  return (
    <div onClick={onClose} className="fixed inset-0 z-[2000] bg-ink/50 flex items-start justify-center pt-10 px-4">
      <div onClick={(e) => e.stopPropagation()} className="bg-paper rounded-[18px] shadow-lift border border-line w-full max-w-[680px] max-h-[88vh] flex flex-col overflow-hidden">
        <div className="px-5 py-3 border-b border-line flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="font-bold text-[15px] text-ink truncate">{title}</div>
            {note && <div className="text-[12px] text-muted">{note}</div>}
          </div>
          <button onClick={onClose} className="text-[13px] font-bold text-muted px-2 py-1 rounded hover:bg-cream">Close</button>
        </div>
        {html && <iframe title="Email preview" srcDoc={html} className="w-full flex-1 min-h-[60vh] bg-white" sandbox="" />}
      </div>
    </div>
  );
}

// ---------- A friendly picture of the steady pickups that need a driver, to send out ----------

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function loadImg(src: string): Promise<HTMLImageElement | null> {
  return new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
}

export async function downloadNeededCalendar(rows: Array<{ name: string; suppliers?: string | null; pickup_time?: string | null; day_of_week: number }>) {
  const days = [0, 1, 2, 3, 4, 5, 6].filter((d) => rows.some((r) => Number(r.day_of_week) === d));
  if (days.length === 0) return;
  const [logo, van] = await Promise.all([
    loadImg(`${(import.meta as any).env?.BASE_URL ?? '/'}zlz-logo-wordmark.png`),
    loadImg(`${(import.meta as any).env?.BASE_URL ?? '/'}steady-van.png`),
  ]);
  const S = 2;                       // sharp on phones and retina screens
  const pad = 32, gap = 12, dayH = 44, cardH = 66, foot = 60;
  const colW = Math.max(220, (820 - pad * 2 - (days.length - 1) * gap) / days.length);
  const W = pad * 2 + days.length * colW + (days.length - 1) * gap;
  const most = Math.max(...days.map((d) => rows.filter((r) => Number(r.day_of_week) === d).length));
  const top = 190, head = top + 96;
  const H = head + dayH + most * (cardH + gap) + foot;
  const c = document.createElement('canvas');
  c.width = W * S; c.height = H * S;
  const g = c.getContext('2d')!;
  g.scale(S, S);
  const font = (w: number, px: number) => `${w} ${px}px Arial, Helvetica, sans-serif`;
  const fit = (t: string, max: number) => { let s = t; while (s.length > 1 && g.measureText(s).width > max) s = s.slice(0, -1); return s === t ? t : s.trimEnd() + '…'; };
  const round = (x: number, y: number, w: number, h: number, r: number) => {
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  };

  g.fillStyle = '#fbf8f2'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#1f4d3a'; g.fillRect(0, 0, W, 8);
  // logo on the left, the van on the right
  if (logo) { const h = 96, w = (logo.width / logo.height) * h; g.drawImage(logo, pad, 40, w, h); }
  if (van) { const w = 300, h = (van.height / van.width) * w; g.drawImage(van, W - pad - w, 16, w, h); }
  g.fillStyle = '#1f4d3a'; g.font = font(700, 28);
  g.fillText(fit('Updated list of steady pickups available', W - pad * 2), pad, top + 36);
  g.fillStyle = '#5b6459'; g.font = font(400, 17);
  g.fillText(fit('Let us know if any work for you, or if you’d like more information.', W - pad * 2), pad, top + 68);

  days.forEach((d, i) => {
    const x = pad + i * (colW + gap);
    let y = head;
    round(x, y, colW, 32, 16); g.fillStyle = '#e4efe6'; g.fill();
    g.fillStyle = '#1f4d3a'; g.font = font(700, 14);
    g.fillText(`EVERY ${DAY_NAMES[d].toUpperCase()}`, x + 14, y + 21);
    y += dayH;
    for (const r of rows.filter((rr) => Number(rr.day_of_week) === d)) {
      round(x, y, colW, cardH, 12); g.fillStyle = '#ffffff'; g.fill();
      g.strokeStyle = '#e6e0d3'; g.lineWidth = 1; g.stroke();
      g.fillStyle = '#1f2a24'; g.font = font(700, 16); g.fillText(fit(r.name, colW - 26), x + 14, y + 27);
      const sub = r.suppliers && r.suppliers !== r.name ? r.suppliers : '';
      const time = r.pickup_time ? fmtTime(String(r.pickup_time).slice(0, 5)) : '';
      g.fillStyle = '#5b6459'; g.font = font(400, 14);
      g.fillText(fit([time, sub].filter(Boolean).join(' · '), colW - 26), x + 14, y + 50);
      y += cardH + gap;
    }
  });
  g.fillStyle = '#8a8f86'; g.font = font(400, 13);
  g.fillText(`Zeh L’Zeh · Updated ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`, pad, H - 26);

  const a = document.createElement('a');
  a.download = 'steady-pickups-available.png';
  a.href = c.toDataURL('image/png');
  a.click();
}
