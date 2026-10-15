/**
 * Oct 5 client (UI ideas 2, 3, 4): driver profile, store profile, suggested drivers.
 * Backend: apps/api/src/routes/profiles.ts
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, decodeEnc, loadFailText } from './api';
import { Tip } from './design';
import { uiConfirm, uiNotify } from './ui-dialogs';
import { fmtDay, fmtTimeEastern } from './time-format'; // Oct 11 client: activity list times
import { ResponseTimeLine } from './response-times'; // Oct 11 client: how fast they take pickups
import { VolunteerAppInviteBar } from './volunteer-app-invite'; // Oct 14 client: invite to the app

const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const fmtDate = (d: string | null | undefined, t?: string | null) => {
  if (!d) return '—';
  const dt = new Date(`${d}T${(t ?? '12:00').slice(0, 5)}:00`);
  const day = dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: dt.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined });
  return t ? `${day} · ${dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}` : day;
};

function Stat({ n, label, tone, tip }: { n: number | string; label: string; tone?: 'good' | 'bad' | 'warn'; tip?: string }) {
  const c = tone === 'good' ? 'text-forest' : tone === 'bad' ? 'text-clay' : tone === 'warn' ? 'text-[#9a7415]' : 'text-ink';
  return (
    <div className="rounded-[12px] border border-line bg-paper px-3 py-2 min-w-[92px]">
      <div className={`font-display text-[20px] leading-none ${c}`}>{n}</div>
      <div className="mt-1 text-[11px] font-bold text-muted">{label}{tip && <Tip text={tip} />}</div>
    </div>
  );
}

function DayBars({ days }: { days: number[] }) {
  const max = Math.max(1, ...days);
  return (
    <div className="flex items-end gap-1.5 h-[64px]">
      {days.map((n, i) => (
        <div key={i} className="flex flex-col items-center gap-1 flex-1">
          <div className="w-full rounded-t-[4px] bg-forest/70" style={{ height: `${Math.round((n / max) * 44) + (n ? 4 : 1)}px` }} title={`${n} on ${DAY[i]}`} />
          <div className="text-[10px] font-bold text-muted">{DAY[i]}</div>
        </div>
      ))}
    </div>
  );
}

function RecentList({ rows, who }: { rows: any[]; who: 'store' | 'drivers' }) {
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, 8);
  if (rows.length === 0) return <div className="text-[12.5px] text-muted">No pickups yet.</div>;
  return (
    <>
      <ul className="divide-y divide-line rounded-[12px] border border-line bg-paper">
        {shown.map((r) => (
          <li key={r.id} className="flex items-start justify-between gap-3 px-3 py-2">
            <div className="min-w-0">
              <div className="text-[13px] font-semibold text-ink truncate">{(who === 'store' ? r.store : r.drivers) || <span className="italic font-normal text-muted">No driver</span>}</div>
              <div className="text-[11.5px] text-muted">{fmtDate(r.date, r.time)} · #{r.ref_number ?? r.id}</div>
            </div>
            <div className="shrink-0 text-right text-[11.5px]">
              <div className="font-bold text-ink">{r.outcome_label ?? 'Still open'}</div>
              {String(r.outcome ?? '').startsWith('completed') && (
                <div className={r.kiosk_verified ? 'text-forest font-bold' : 'text-muted'}>{r.kiosk_verified ? '✓ Kiosk' : 'No kiosk'}</div>
              )}
            </div>
          </li>
        ))}
      </ul>
      {rows.length > 8 && (
        <button onClick={() => setAll(!all)} className="haptic mt-1 text-[12.5px] font-bold text-forest hover:underline">
          {all ? 'Show less' : `View all ${rows.length}`}
        </button>
      )}
    </>
  );
}

const H = ({ children }: { children: any }) => <div className="text-[11px] font-extrabold uppercase tracking-[.05em] text-muted mb-1.5">{children}</div>;

const plural = (u: string) => {
  const w = String(u || 'item').toLowerCase();
  return w.endsWith('s') ? w : w.endsWith('x') ? `${w}es` : `${w}s`;
};

/** Oct 8 client: "what does this store typically donate" — from kiosk drop-offs. */
function DonationSummary({ d }: { d: any }) {
  if (!d || d.visits === 0) {
    return <div className="text-[12.5px] text-muted">No kiosk drop-offs from this store yet.</div>;
  }
  const period = d.windowDays ? 'last 3 months' : 'all time';
  return (
    <div className="rounded-[12px] border border-line bg-paper px-3 py-2.5 space-y-1.5 text-[13px] text-ink">
      <div>
        <b>About {d.avgItems} items</b> per drop-off
        {d.units.length > 0 && (
          <span className="text-muted"> · {d.units.map((u: any) => `${u.pct}% ${plural(u.unit)}`).join(', ')}</span>
        )}
      </div>
      <div>
        {d.timesPerWeek >= 1
          ? <>About <b>{d.timesPerWeek} times a week</b></>
          : d.timesPerWeek > 0
            ? <>About <b>{Math.max(1, Math.round(d.timesPerWeek * 4.3))} times a month</b></>
            : <>No pickups or drop-offs in the last 3 months</>}
        <span className="text-muted"> · last drop-off {fmtDate(d.lastDropoff)}</span>
      </div>
      {d.categories.length > 0 && (
        <div>
          Mostly <b>{d.categories.map((c: any) => `${c.category} (${c.pct}%)`).join(', ')}</b>
          <Tip text={`Food types come from kiosk drop-offs up to ${fmtDate(d.categoriesUpTo)}. The kiosk stopped asking for the food type on Oct 7.`} />
        </div>
      )}
      <div className="text-[11px] text-muted">Based on {d.visits} kiosk drop-off{d.visits === 1 ? '' : 's'} ({period}).</div>
    </div>
  );
}

/** Oct 11 client: "At a glance" — a 3-line summary of what this driver has been
 *  doing (texts, tries, pickups, app, calls) so a recruiter sees it at once, plus
 *  the full activity list folded underneath. Lines are built by the API
 *  (GET /api/volunteers/:id/glance — the verdict rules are documented there). */
function DriverGlance({ volunteerId }: { volunteerId: number }) {
  // Oct 11 client: ?enc=1 → base64 reply, so a network content filter can't read (and swap out) it.
  const q = useQuery({ queryKey: ['vol-activity', volunteerId], queryFn: async () => {
    return decodeEnc<{ data: any }>(await api(`/api/volunteers/${volunteerId}/glance?enc=1`));
  } });
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(50);
  if (q.isLoading) return <div className="text-[13px] text-muted">Loading activity…</div>;
  // Oct 11: say why it failed (helps when it happens on someone's device).
  if (q.isError || !q.data?.data?.summary) return (
    <div className="text-[13px] text-clay">{loadFailText("Couldn't load the activity", q.error)} <button onClick={() => q.refetch()} className="underline font-bold">Try again</button></div>
  );
  const d = q.data!.data;
  const s = d.summary;
  const events: { at: string; kind: string; text: string }[] = d.events ?? [];
  const rows = events.slice(0, shown);
  return (
    <div>
      <div className="rounded-[12px] border border-line bg-paper px-3 py-2.5 space-y-1">
        <H>At a glance</H>
        <div className="text-[13.5px] font-semibold text-ink">{s.verdict}</div>
        {s.signals.length > 0 && <div className="text-[12.5px] text-ink">{s.signals.join(' · ')}</div>}
        <div className="text-[12px] text-muted">{s.last30}</div>
        {/* Oct 11 client: how long they usually take to take a pickup + View all */}
        <ResponseTimeLine kind="driver" id={volunteerId} />
      </div>
      {events.length > 0 && (
        <button onClick={() => setOpen(!open)} className="haptic mt-1 text-[12.5px] font-bold text-forest hover:underline">
          {open ? 'Hide activity' : `Show all activity (${events.length})`}
        </button>
      )}
      {open && (
        <>
          <ul className="mt-1 divide-y divide-line rounded-[12px] border border-line bg-paper">
            {rows.map((e, i) => {
              const day = fmtDay(e.at);
              const sameDay = i > 0 && fmtDay(rows[i - 1]!.at) === day;
              return (
                <li key={`${e.at}-${i}`} className="flex gap-2 px-3 py-1.5 text-[12.5px]">
                  <span className="w-[130px] shrink-0 text-muted">{sameDay ? '' : `${day} · `}{fmtTimeEastern(e.at)}</span>
                  <span className="min-w-0 text-ink">— {e.text}</span>
                </li>
              );
            })}
          </ul>
          {events.length > shown && (
            <button onClick={() => setShown(shown + 50)} className="haptic mt-1 text-[12.5px] font-bold text-forest hover:underline">Show more</button>
          )}
          <div className="mt-1 text-[11px] text-muted">Last 90 days, newest first (up to 100).</div>
        </>
      )}
    </div>
  );
}

/** Driver profile (idea 2). */
/** Oct 13 client: outside helper (not one of our volunteers) — badge + "Make a volunteer" (asks about the Default group first). */
function OutsideHelperBar({ volunteerId }: { volunteerId: number }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['vol-status', volunteerId], queryFn: () => api<{ data: any }>(`/api/volunteers/${volunteerId}`) });
  const make = useMutation({
    mutationFn: (addToDefaultGroup: boolean) => api<{ data: { unitNumber: number | null; addedToGroup: string | null } }>(
      `/api/outside-helpers/${volunteerId}/make-volunteer`, { method: 'POST', body: JSON.stringify({ addToDefaultGroup }) }),
    onSuccess: (r) => {
      uiNotify(`Now a volunteer${r.data.unitNumber != null ? ` (#${r.data.unitNumber})` : ''}.${r.data.addedToGroup ? ` Added to the ${r.data.addedToGroup}.` : ' Not in any text group yet.'}`, 'ok');
      for (const k of ['vol-status', 'volunteers', 'admin-volunteers', 'picker-volunteers', 'who-gets-texts', 'vol-profile']) qc.invalidateQueries({ queryKey: [k] });
    },
    onError: (e: any) => uiNotify(e?.body?.message || "Couldn't change it. Try again.", 'err'),
  });
  const v = q.data?.data;
  if (!v || String(v.status ?? '').trim().toLowerCase() !== 'outside_helper') return null;
  const nm = `${v.firstName ?? ''} ${v.lastName === '-' ? '' : (v.lastName ?? '')}`.trim() || 'them';
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-[12px] border border-amber/40 bg-amber-soft px-3 py-2.5">
      <span className="rounded-full bg-paper px-2 py-0.5 text-[11px] font-extrabold text-[#8a6011]">Outside helper</span>
      <span className="flex-1 min-w-[180px] text-[12.5px] text-ink">Not one of our volunteers. Never gets our texts and isn't in any text group.</span>
      <button type="button" disabled={make.isPending}
              onClick={async () => {
                if (!(await uiConfirm(`Make ${nm} a volunteer? Their status changes to "active" and they get a unit number.`, { okLabel: 'Make a volunteer' }))) return;
                const add = await uiConfirm(`Also add ${nm} to the Default text group now? They will start getting pickup texts.`, { okLabel: 'Yes, add to group', cancelLabel: 'Not now' });
                make.mutate(add);
              }}
              className="haptic rounded-[10px] bg-forest px-3 py-1.5 text-[12.5px] font-bold text-paper disabled:opacity-50">{make.isPending ? 'Saving…' : 'Make a volunteer'}</button>
    </div>
  );
}

export function DriverOverview({ volunteerId, phone, firstName }: { volunteerId: number; phone?: string | null; firstName?: string | null }) {
  const q = useQuery({ queryKey: ['vol-profile', volunteerId], queryFn: () => api<{ data: any }>(`/api/volunteers/${volunteerId}/profile`) });
  const qcd = useQueryClient();
  const [msg, setMsg] = useState('');
  const [sent, setSent] = useState<string | null>(null);
  const send = useMutation({
    mutationFn: () => api('/api/sms/send-one', { method: 'POST', body: JSON.stringify({ phone, body: msg.trim() }) }),
    onSuccess: () => { setSent('✅ Sent.'); setMsg(''); qcd.invalidateQueries({ queryKey: ['sms-convo'] }); },
    onError: (e: any) => setSent(`⚠️ ${e?.message || 'Not sent'}`),
  });
  if (q.isLoading) return <div className="text-[13px] text-muted">Loading…</div>;
  if (q.isError) return <div className="text-[13px] text-clay">Couldn't load. <button onClick={() => q.refetch()} className="underline font-bold">Try again</button></div>;
  const d = q.data!.data;
  const t = d.totals;
  return (
    <div className="space-y-4">
      <OutsideHelperBar volunteerId={volunteerId} />{/* Oct 13 client */}
      <VolunteerAppInviteBar volunteerId={volunteerId} name={firstName || 'this driver'} />{/* Oct 14 client */}
      {/* Oct 11 client: short "At a glance" summary + folded full activity, above the stats. */}
      <DriverGlance volunteerId={volunteerId} />
      <div className="flex flex-wrap gap-2">
        <Stat n={t.completed} label="Completed" tone="good" tip="Signed in at the kiosk, or marked done by the office." />
        <Stat n={t.taken ?? 0} label="Not checked in" tone={(t.taken ?? 0) ? 'warn' : undefined} tip="Pickups they took but never signed in at the office kiosk." />
        <Stat n={t.upcoming} label="Coming up" tip="Pickups they're on from today forward." />
        <Stat n={d.reliability == null ? '—' : `${d.reliability}%`} label="Reliability" tone={d.reliability == null ? undefined : d.reliability >= 85 ? 'good' : d.reliability >= 65 ? 'warn' : 'bad'}
              tip={`Of the pickups they took, how many they kept (did not give back): ${t.completed + (t.taken ?? 0)} of ${t.completed + (t.taken ?? 0) + t.driverCancels + t.released}.`} />
        <Stat n={t.driverCancels + t.released} label="Gave back" tone={t.driverCancels + t.released ? 'bad' : undefined}
              tip="Pickups they took and then gave back (cancelled, or released in the app)." />
      </div>
      <div className="text-[12px] text-muted">
        Last completed pickup: <b className="text-ink">{fmtDate(d.lastDone)}</b>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <H>Usual stores</H>
          {d.topStores.length === 0 ? <div className="text-[12.5px] text-muted">None yet.</div> : (
            <div className="flex flex-wrap gap-1.5">
              {d.topStores.map((s: any) => (
                <span key={s.name} className="rounded-full border border-line bg-paper px-2.5 py-1 text-[12px]">
                  <b>{s.name}</b> <span className="text-muted">× {s.count}</span>
                </span>
              ))}
            </div>
          )}
        </div>
        <div>
          <H>Days they drive</H>
          <DayBars days={d.days} />
        </div>
      </div>
      {/* Oct 9 client: on-call hours moved to the Alerts & schedule tab (one place). */}
      {phone && (
        <div>
          <H>Texts with {firstName || 'them'}</H>
          <SmsConversation volunteerId={volunteerId} firstName={firstName} />
          <div className="mt-2 flex gap-2">
            <input value={msg} onChange={(e) => { setMsg(e.target.value); setSent(null); }} placeholder="Type a message…"
                   onKeyDown={(e) => { if (e.key === 'Enter' && msg.trim() && !send.isPending) send.mutate(); }}
                   className="flex-1 min-w-0 rounded-[10px] border border-line bg-paper px-3 py-2 text-[13px]" />
            <button disabled={!msg.trim() || send.isPending} onClick={() => send.mutate()}
                    className="haptic rounded-[10px] bg-forest px-4 py-2 text-[13px] font-bold text-paper disabled:opacity-50">{send.isPending ? 'Sending…' : 'Send'}</button>
          </div>
          {sent && <div className="mt-1 text-[12px] font-semibold">{sent}</div>}
        </div>
      )}
      <div>
        <H>Pickup history</H>
        <RecentList rows={d.recent} who="store" />
      </div>
    </div>
  );
}

/** Oct 5 client: the text conversation with this driver (newest at the bottom).
 *  Oct 14 client: the FULL two-way conversation (his texts, our typed and automatic
 *  replies) by all his numbers — the same as Driver messages → Texts. */
function SmsConversation({ volunteerId, firstName }: { volunteerId: number; firstName?: string | null }) {
  const q = useQuery({
    queryKey: ['sms-convo', volunteerId],
    queryFn: () => api<{ data: { id: number; direction: string; from?: 'them' | 'us'; auto?: boolean; body: string; created_at: string; phone?: string }[] }>(`/api/volunteers/${volunteerId}/conversation`),
    refetchInterval: 30_000,
  });
  const [all, setAll] = useState(false);
  if (q.isLoading) return <div className="text-[12.5px] text-muted">Loading texts…</div>;
  if (q.isError) return <div className="text-[12.5px] text-clay">Couldn't load the texts. <button onClick={() => q.refetch()} className="underline font-bold">Try again</button></div>;
  const msgs = q.data?.data ?? [];
  if (msgs.length === 0) return <div className="text-[12.5px] text-muted">No texts yet.</div>;
  const him = (firstName || '').trim() || 'Them';
  const shown = all ? msgs : msgs.slice(-5);
  const manyNumbers = new Set(msgs.map((m) => m.phone).filter(Boolean)).size > 1; // Oct 14 client: label which number
  const when = (x: string) => new Date(x).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
  return (
    <div>
      {msgs.length > 5 && (
        <button onClick={() => setAll(!all)} className="haptic mb-1 text-[12.5px] font-bold text-forest hover:underline">
          {all ? 'Show only the latest' : `View all ${msgs.length} texts`}
        </button>
      )}
      <div className={`space-y-1.5 rounded-[12px] border border-line bg-cream/40 p-2.5 ${all ? 'max-h-[360px] overflow-y-auto' : ''}`}>
        {shown.map((m) => {
          const out = m.direction === 'out';
          return (
            <div key={m.id} className={`flex ${out ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-[12px] px-3 py-1.5 ${out ? 'bg-forest text-paper' : 'bg-paper border border-line text-ink'}`}>
                <div className="whitespace-pre-wrap text-[12.5px]">{m.body}</div>
                <div className={`mt-0.5 text-[10.5px] ${out ? 'text-paper/70' : 'text-muted'}`}><b>{out ? 'Us' : him}</b>{out && m.auto ? ' (automatic)' : ''} · {when(m.created_at)}{manyNumbers && m.phone ? ` · ${out ? 'to' : 'from'} …${m.phone.slice(-4)}` : ''}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Oct 5 client: expired pickups wait here for a person — food still there? */
type Expired = { id: number; ref_number: string | null; date: string; time: string | null; label: string; address: string | null; phone: string | null; steady: boolean };
export function ExpiredReviewSection() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['expired-to-review'], queryFn: () => api<{ data: Expired[] }>('/api/pickup-instances/expired-to-review'), refetchInterval: 60_000 });
  const rows = q.data?.data ?? [];
  if (rows.length === 0) return null;
  const refresh = () => { for (const k of ['expired-to-review', 'admin-pickups', 'admin-pickups-range']) qc.invalidateQueries({ queryKey: [k] }); };
  return (
    <div className="mb-4 rounded-[14px] border border-clay/40 bg-clay/5">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-clay/30 px-4 py-2.5">
        <div className="text-[12px] font-extrabold uppercase tracking-[.05em] text-clay">
          Food still there? · {rows.length} {rows.length === 1 ? 'pickup' : 'pickups'} expired with no driver
        </div>
        <div className="text-[11px] text-clay/80">No driver took these in 6 hours. Check with the donor, then choose.</div>
      </div>
      {rows.map((r) => <ExpiredRow key={r.id} r={r} onDone={refresh} />)}
    </div>
  );
}
function ExpiredRow({ r, onDone }: { r: Expired; onDone: () => void }) {
  const [msg, setMsg] = useState<string | null>(null);
  // Oct 9 client: ask whether to text drivers now or just put it back in the queue.
  const [asking, setAsking] = useState(false);
  const keep = useMutation({
    mutationFn: (textNow: boolean) => api<{ data: { sent: number; skipped: string | null } }>(`/api/pickup-instances/${r.id}/requeue`, { method: 'POST', body: JSON.stringify({ textNow }) }),
    onSuccess: (x) => { setMsg(x.data.skipped === 'not-texted' ? 'Back in the queue — no text sent.' : x.data.sent > 0 || x.data.skipped === 'dry-run' ? 'Reposted — texted to drivers.' : String(x.data.skipped ?? '').startsWith('quiet') ? 'Reposted — goes out at 9 AM.' : 'Reposted.'); setTimeout(onDone, 1500); },
    onError: (e: any) => setMsg(`⚠️ ${e?.message || 'Could not reopen'}`),
  });
  const close = useMutation({
    mutationFn: () => api(`/api/pickup-instances/${r.id}/close-expired`, { method: 'POST' }),
    onSuccess: () => { setMsg('Closed.'); setTimeout(onDone, 1200); },
    onError: (e: any) => setMsg(`⚠️ ${e?.message || 'Could not close'}`),
  });
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const when = (r.date !== today ? new Date(`${r.date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short' }) + ' ' : '')
    + (r.time ? new Date(`2000-01-01T${r.time}:00`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : '');
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-clay/20 px-4 py-2.5 last:border-b-0">
      <div className="min-w-0">
        <div className="truncate font-display text-[14px] font-semibold text-ink">
          {r.label} <span className="font-sans text-[11.5px] font-bold text-muted">#{r.ref_number ?? r.id}{r.steady ? ' · steady' : ''}</span>
        </div>
        <div className="flex flex-wrap gap-x-3 text-[11.5px] text-muted">
          <span className="font-bold text-ink">{when}</span>
          {r.address && <span className="truncate">{r.address}</span>}
          {r.phone && <a href={`tel:${r.phone}`} className="font-bold text-forest hover:underline">{r.phone}</a>}
        </div>
      </div>
      {msg ? <div className="text-[12px] font-semibold text-forest">{msg}</div> : asking ? (
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <span className="text-[11.5px] font-bold text-ink">Text drivers now?</span>
          <button onClick={() => keep.mutate(true)} disabled={keep.isPending}
                  className="haptic rounded-[10px] bg-forest px-3 py-1.5 text-[11.5px] font-extrabold text-paper hover:brightness-110 disabled:opacity-50">
            {keep.isPending && keep.variables ? '…' : 'Yes, text now'}
          </button>
          <button onClick={() => keep.mutate(false)} disabled={keep.isPending}
                  className="haptic rounded-[10px] border border-forest/50 px-3 py-1.5 text-[11.5px] font-extrabold text-forest hover:bg-sage/60 disabled:opacity-50">
            {keep.isPending && !keep.variables ? '…' : 'No, just the queue'}
          </button>
          <button onClick={() => setAsking(false)} disabled={keep.isPending} className="haptic px-1.5 text-[11.5px] font-bold text-muted">Back</button>
        </div>
      ) : (
        <div className="flex shrink-0 items-center gap-1.5">
          <button onClick={() => setAsking(true)} disabled={close.isPending}
                  className="haptic rounded-[10px] bg-forest px-3 py-1.5 text-[11.5px] font-extrabold text-paper hover:brightness-110 disabled:opacity-50">
            Food's still there — repost
          </button>
          <button onClick={() => close.mutate()} disabled={keep.isPending || close.isPending}
                  className="haptic rounded-[10px] border border-clay px-3 py-1.5 text-[11.5px] font-extrabold text-clay hover:bg-clay-soft disabled:opacity-50">
            {close.isPending ? '…' : "Food's gone — close"}
          </button>
        </div>
      )}
    </div>
  );
}

/** Oct 6 client: taken but not checked in — settle with Mark done / Mark missed. */
type Taken = { id: number; ref_number: string | null; date: string; time: string | null; label: string; drivers: string };
// Oct 9 client: last 7 or 30 days, "Mark all done", and a one-driver view (from Rewards).
export function NotCheckedInSection({ driver, startOpen }: { driver?: string; startOpen?: boolean } = {}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(!!startOpen);
  const [days, setDays] = useState<7 | 30>(driver ? 30 : 7);
  const [bulk, setBulk] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['not-checked-in', 30], queryFn: () => api<{ data: Taken[] }>('/api/pickup-instances/not-checked-in?days=30'), refetchInterval: 120_000 });
  const all = q.data?.data ?? [];
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const since = (() => { const d = new Date(`${today}T12:00:00`); d.setDate(d.getDate() - days); return d.toLocaleDateString('en-CA'); })();
  const rows = all.filter((r) => r.date >= since && (!driver || String(r.drivers ?? '').split(', ').includes(driver)));
  const refresh = () => { for (const k of ['not-checked-in', 'admin-pickups', 'admin-pickups-range', 'gas-milestones']) qc.invalidateQueries({ queryKey: [k] }); };
  if (all.length === 0 && !driver) return null;
  async function markAll() {
    const list = rows;
    if (!list.length) return;
    if (!(await uiConfirm(`Mark these ${list.length} ${list.length === 1 ? 'pickup' : 'pickups'} as done?\n\nOnly if you know they all happened.`, { okLabel: 'Yes, mark done' }))) return;
    let ok = 0, failed = 0;
    for (const r of list) {
      setBulk(`Marking ${ok + failed + 1} of ${list.length}…`);
      // Same call as the Mark done button on each row.
      try { await api(`/api/pickup-instances/${r.id}/mark-done`, { method: 'POST' }); ok++; } catch { failed++; }
    }
    setBulk(`Marked ${ok} done.${failed ? ` ${failed} couldn't be saved (already settled?).` : ''}`);
    refresh();
  }
  const rangeBtn = (d: 7 | 30) => (
    <button key={d} onClick={() => setDays(d)}
            className={`haptic rounded-full px-2.5 py-0.5 text-[11.5px] font-bold ${days === d ? 'bg-[#9a7415] text-paper' : 'border border-amber/60 text-[#9a7415]'}`}>
      Last {d} days
    </button>
  );
  return (
    <div className="mb-4 rounded-[14px] border border-amber/50 bg-amber-soft/40">
      <button onClick={() => setOpen(!open)} className="haptic flex w-full flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-left">
        <span className="text-[12px] font-extrabold uppercase tracking-[.05em] text-[#9a7415]">
          Did these happen? · {rows.length} taken with no kiosk sign-in{driver ? ` · ${driver}` : ''} (last {days} days)
        </span>
        <span className="text-[12px] font-bold text-forest">{open ? 'Hide' : 'Review'}</span>
      </button>
      {open && (
        <>
          <div className="border-t border-amber/40 px-4 py-2 flex flex-wrap items-center gap-2 text-[11.5px] text-[#9a7415]">
            <span className="flex-1 min-w-[200px]">A driver took these but never signed in at the kiosk. If you know, mark them done or missed.</span>
            {rangeBtn(7)}{rangeBtn(30)}
            {rows.length > 0 && (
              <button onClick={() => void markAll()} disabled={bulk?.startsWith('Marking')}
                      className="haptic rounded-[10px] bg-forest px-3 py-1 text-[11.5px] font-extrabold text-paper disabled:opacity-50">
                Mark all {rows.length} done
              </button>
            )}
          </div>
          {bulk && <div className="border-t border-amber/30 px-4 py-2 text-[12px] font-semibold text-forest">{bulk}</div>}
          {all.length >= 200 && <div className="border-t border-amber/30 px-4 py-1.5 text-[11.5px] text-muted">Showing the newest 200. Settle these and the rest will show.</div>}
          {rows.length === 0 && <div className="border-t border-amber/30 px-4 py-2.5 text-[12.5px] text-muted">Nothing waiting{driver ? ` for ${driver}` : ''} in the last {days} days.</div>}
          {rows.map((r) => <TakenRow key={r.id} r={r} onDone={refresh} />)}
        </>
      )}
    </div>
  );
}
function TakenRow({ r, onDone }: { r: Taken; onDone: () => void }) {
  const [msg, setMsg] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: (done: boolean) => api(`/api/pickup-instances/${r.id}/${done ? 'mark-done' : 'mark-missed'}`, { method: 'POST' }),
    onSuccess: (_x, done) => { setMsg(done ? 'Marked done.' : 'Marked missed.'); setTimeout(onDone, 1200); },
    onError: (e: any) => setMsg(`⚠️ ${e?.message || 'Could not save'}`),
  });
  const when = new Date(`${r.date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    + (r.time ? ' · ' + new Date(`2000-01-01T${r.time}:00`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : '');
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-amber/30 px-4 py-2.5">
      <div className="min-w-0">
        <div className="truncate font-display text-[14px] font-semibold text-ink">{r.label} <span className="font-sans text-[11.5px] font-bold text-muted">#{r.ref_number ?? r.id}</span></div>
        <div className="text-[11.5px] text-muted"><b className="text-ink">{when}</b>{r.drivers ? ` · ${r.drivers}` : ''}</div>
      </div>
      {msg ? <div className="text-[12px] font-semibold text-forest">{msg}</div> : (
        <div className="flex shrink-0 gap-1.5">
          <button disabled={m.isPending} onClick={() => m.mutate(true)} className="haptic rounded-[10px] bg-forest px-3 py-1.5 text-[11.5px] font-extrabold text-paper disabled:opacity-50">Mark done</button>
          <button disabled={m.isPending} onClick={() => { void uiConfirm(`Mark ${r.label} #${r.ref_number ?? r.id} as missed?\n\nIt will count as not done.`, { okLabel: 'Yes, mark missed' }).then((ok) => { if (ok) m.mutate(false); }); }} className="haptic rounded-[10px] border border-clay px-3 py-1.5 text-[11.5px] font-extrabold text-clay disabled:opacity-50">Mark missed</button>
        </div>
      )}
    </div>
  );
}

/** Oct 5 client: every driver text about pickups and what happened. */
type Reply = { id: number; at: string; phone: string; name: string | null; body: string; outcome: string; label: string; pickup: { id: number; ref: string | null; store: string; date: string } | null };
const OUTCOMES: [string, string][] = [['', 'All'], ['took', 'Took it'], ['late', 'Too late'], ['wrong', 'Wrong code'], ['list', 'Asked for the list'], ['info', 'Asked for details']];
const TONE: Record<string, string> = { took: 'text-forest', late: 'text-clay', wrong: 'text-clay', list: 'text-muted', info: 'text-muted', code: 'text-muted' };
export function DriverRepliesPanel() {
  const [days, setDays] = useState(30);
  const [f, setF] = useState('');
  const [q, setQ] = useState('');
  const r = useQuery({ queryKey: ['driver-replies', days], queryFn: () => api<{ data: Reply[] }>(`/api/sms/driver-replies?days=${days}`), refetchInterval: 60_000 });
  const rows = r.data?.data ?? [];
  const count = (k: string) => (k ? rows.filter((x) => x.outcome === k).length : rows.length);
  const s = q.trim().toLowerCase();
  const shown = rows.filter((x) => (!f || x.outcome === f) && (!s || `${x.name ?? ''} ${x.phone} ${x.body} ${x.pickup?.store ?? ''} ${x.pickup?.ref ?? ''}`.toLowerCase().includes(s)));
  const when = (x: string) => new Date(x).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {OUTCOMES.map(([k, label]) => (
          <button key={k} onClick={() => setF(k)}
                  className={`haptic rounded-full px-3 py-1 text-[12.5px] font-bold ${f === k ? 'bg-forest text-paper' : 'border border-line bg-paper text-muted hover:text-ink'}`}>
            {label} <span className="opacity-70">{count(k)}</span>
          </button>
        ))}
        <select value={days} onChange={(e) => setDays(Number(e.target.value))}
                className="ml-auto rounded-[10px] border border-line bg-paper px-2 py-1.5 text-[12.5px]">
          <option value={1}>Today</option><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option>
        </select>
      </div>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, phone, store, pickup #…"
             className="w-full rounded-[12px] border border-line bg-paper px-3 py-2 text-[13px]" />
      {r.isLoading ? <div className="text-[13px] text-muted">Loading…</div> :
       r.isError ? <div className="text-[13px] text-clay">Couldn't load. <button onClick={() => r.refetch()} className="underline font-bold">Try again</button></div> :
       shown.length === 0 ? <div className="text-[13px] text-muted">{rows.length === 0 ? 'No driver texts in this time. Try a longer time range.' : 'No texts match.'}</div> : (
        <ul className="divide-y divide-line rounded-[14px] border border-line bg-paper">
          {shown.slice(0, 300).map((x) => (
            <li key={x.id} className="flex items-start justify-between gap-3 px-4 py-2.5">
              <div className="min-w-0">
                <div className="text-[13.5px] font-bold text-ink">{x.name ?? x.phone}</div>
                <div className="text-[12px] text-muted truncate">
                  “{x.body.trim()}”{x.pickup ? ` · ${x.pickup.store} #${x.pickup.ref ?? x.pickup.id}` : ''}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className={`text-[12.5px] font-bold ${TONE[x.outcome] ?? 'text-ink'}`}>{x.label}</div>
                <div className="text-[11px] text-muted">{when(x.at)}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Oct 11 client: Driver messages → Code words — every word people can text us,
 *  what it does, who can use it, and who used it in the last 90 days. */
type CodeWordPerson = { name: string; unit: number | null; volunteerId: number | null; supplierId: number | null; count: number };
// Oct 14 client: who = list (Drivers / Stores / Donors / Dispatchers / Automatic); the list lives in apps/api/src/code-words.ts.
type CodeWord = { key: string; words: string[]; who: string[] | string; told: 'yes' | 'no' | 'dispatchers' | 'auto'; what: string;
  used: number; people: number; lastUsed: string | null; top: CodeWordPerson[] };
const TOLD_LABEL: Record<CodeWord['told'], string> = {
  yes: 'Yes', no: 'Not told to drivers (works if they type it)', dispatchers: 'Dispatchers only', auto: 'Automatic',
};
const WHO_TABS = ['All', 'Drivers', 'Stores', 'Donors', 'Dispatchers'] as const; // Oct 14 client
const WHO_STYLE: Record<string, string> = {
  Drivers: 'bg-sage text-forest', Stores: 'bg-amber-soft text-[#9a7415]', Donors: 'bg-clay-soft text-clay',
  Dispatchers: 'bg-sky-soft text-sky-deep', Automatic: 'bg-cream text-muted',
};
const whoList = (w: CodeWord): string[] => (Array.isArray(w.who) ? w.who : String(w.who ?? '').split(/,| and /).map((x) => x.trim()).filter(Boolean));
export function CodeWordsPanel({ onOpenPerson }: { onOpenPerson?: (id: number, kind: 'driver' | 'store') => void }) {
  // ?enc=1 → base64 reply, so a network content filter can't read (and swap out) it.
  const q = useQuery({ queryKey: ['code-words'], refetchInterval: 5 * 60_000, queryFn: async () => {
    return decodeEnc<{ data: { days: number; texts: number; words: CodeWord[] } }>(await api('/api/sms/code-words?enc=1'));
  } });
  const [open, setOpen] = useState<string | null>(null);
  const [whoTab, setWhoTab] = useState<(typeof WHO_TABS)[number]>('All'); // Oct 14 client
  const day = (x: string | null) => (x ? new Date(x).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' }) : '—');
  const d = q.data?.data;
  return (
    <div className="space-y-3">
      <div className="rounded-[12px] border border-line bg-paper px-4 py-3 text-[13px] text-ink">
        Every word drivers, stores, donors and dispatchers can text us, what it does, and who can use it.
        Drivers' DONE and CANCEL work but aren't mentioned in our texts. Any other text goes to the office.
        <div className="text-[11.5px] text-muted mt-1">Used = texts in the last {d?.days ?? 90} days (store and donor answers are counted by the phone they came from). Tap a word to see who used it most.</div>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Who can use it">
        {WHO_TABS.map((t) => (
          <button key={t} type="button" onClick={() => setWhoTab(t)} aria-pressed={whoTab === t}
                  className={`haptic rounded-full border px-3 py-1.5 text-[12.5px] font-bold ${whoTab === t ? 'border-forest bg-forest text-paper' : 'border-line bg-paper text-ink hover:bg-cream'}`}>
            {t}
          </button>
        ))}
      </div>
      {q.isLoading ? <div className="text-[13px] text-muted">Loading…</div> :
       q.isError || !d ? <div className="text-[13px] text-clay">{loadFailText("Couldn't load", q.error)} <button onClick={() => q.refetch()} className="underline font-bold">Try again</button></div> : (
        <ul className="divide-y divide-line rounded-[14px] border border-line bg-paper">
          {d.words.filter((w) => whoTab === 'All' || whoList(w).includes(whoTab)).map((w) => (
            <li key={w.key}>
              <button onClick={() => setOpen(open === w.key ? null : w.key)} className="haptic w-full text-left px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[14px] font-extrabold text-ink">{w.words[0]}</div>
                    {w.words.length > 1 && <div className="text-[11.5px] text-muted">also: {w.words.slice(1).join(' · ')}</div>}
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-[13px] font-bold text-ink">{w.used} used</div>
                    <div className="text-[11px] text-muted">{w.people} {w.people === 1 ? 'person' : 'people'} · last {day(w.lastUsed)}</div>
                  </div>
                </div>
                <div className="mt-1 text-[12.5px] text-ink">{w.what}</div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11.5px] text-muted">
                  <span className="font-bold">Who can use it:</span>
                  {whoList(w).map((x) => (
                    <span key={x} className={`rounded-full px-2 py-0.5 text-[10.5px] font-extrabold uppercase tracking-[.04em] ${WHO_STYLE[x] ?? 'bg-cream text-ink'}`}>{x}</span>
                  ))}
                  <span>· Told in our texts: <span className={w.told === 'no' ? 'font-bold text-clay' : ''}>{TOLD_LABEL[w.told]}</span></span>
                </div>
              </button>
              {open === w.key && (
                <div className="px-4 pb-3">
                  {w.top.length === 0 ? <div className="text-[12px] text-muted">Nobody used it in the last {d.days} days.</div> : (
                    <ul className="space-y-1">
                      {w.top.map((t, i) => {
                        const id = t.volunteerId ?? t.supplierId;
                        const label = <>{t.name}{t.unit != null ? ` #${t.unit}` : ''}</>;
                        return (
                          <li key={i} className="flex items-center justify-between gap-2 text-[12.5px]">
                            {id != null && onOpenPerson
                              ? <button onClick={() => onOpenPerson(id, t.volunteerId != null ? 'driver' : 'store')} className="haptic font-bold text-forest underline text-left">{label}</button>
                              : <span className="font-bold">{label}</span>}
                            <span className="text-muted">× {t.count}</span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Store profile (idea 3). */
export function StoreOverview({ supplierId }: { supplierId: number }) {
  const q = useQuery({ queryKey: ['sup-profile', supplierId], queryFn: () => api<{ data: any }>(`/api/suppliers/${supplierId}/profile`) });
  if (q.isLoading) return <div className="text-[13px] text-muted mt-4">Loading pickup history…</div>;
  if (q.isError) return <div className="text-[13px] text-clay mt-4">Couldn't load. <button onClick={() => q.refetch()} className="underline font-bold">Try again</button></div>;
  const d = q.data!.data;
  const t = d.totals;
  return (
    <div className="mt-5 space-y-4 border-t border-line pt-4">
      <div className="flex flex-wrap gap-2">
        <Stat n={t.total} label="Pickups" />
        <Stat n={t.completed} label="Completed" tone="good" tip="Signed in at the kiosk, or marked done by the office." />
        <Stat n={t.taken ?? 0} label="Not checked in" tone={(t.taken ?? 0) ? 'warn' : undefined} tip="A driver took these but never signed in at the office kiosk." />
        <Stat n={t.missed} label="Missed / no driver" tone={t.missed ? 'bad' : undefined} tip="Pickups that passed with no driver, or were marked missed." />
        <Stat n={t.cancelled} label="Cancelled" />
        <Stat n={t.upcoming} label="Coming up" tip="Scheduled pickups from today forward. Steady pickups are added 3 weeks ahead." />
      </div>
      <div>
        <H>What they usually give</H>
        <DonationSummary d={d.donations} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <H>Who usually covers it</H>
          {d.topDrivers.length === 0 ? <div className="text-[12.5px] text-muted">Nobody yet.</div> : (
            <ul className="space-y-1">
              {d.topDrivers.map((v: any) => (
                <li key={v.id} className="flex items-center justify-between gap-2 text-[12.5px]">
                  <span><b>{v.name}</b> <span className="text-muted">× {v.count}</span></span>
                  <span className="text-muted">last {fmtDate(v.last)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <H>Pickup days</H>
          <DayBars days={d.days} />
        </div>
      </div>
      <div>
        <H>Pickups at this store</H>
        <RecentList rows={d.recent} who="drivers" />
      </div>
    </div>
  );
}

/** Suggested drivers (idea 4) — shown on an uncovered pickup. */
export function SuggestedDriversCard({ pickupId }: { pickupId: number }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['suggested-drivers', pickupId], queryFn: () => api<{ data: any[] }>(`/api/pickup-instances/${pickupId}/suggested-drivers`) });
  const [done, setDone] = useState<Record<number, string>>({});
  const ask = useMutation({
    mutationFn: (vid: number) => api<{ data: { code: number } }>(`/api/pickup-instances/${pickupId}/ask-driver`, { method: 'POST', body: JSON.stringify({ volunteerId: vid }) }),
    onSuccess: (r, vid) => setDone((m) => ({ ...m, [vid]: `Texted — they reply ${r.data.code} to accept` })),
    onError: (e: any, vid) => setDone((m) => ({ ...m, [vid]: `⚠️ ${e?.message || 'Not sent'}` })),
  });
  const assign = useMutation({
    mutationFn: (vid: number) => api(`/api/pickup-instances/${pickupId}/volunteers`, { method: 'POST', body: JSON.stringify({ volunteerId: vid }) }),
    onSuccess: (_r, vid) => {
      setDone((m) => ({ ...m, [vid]: '✅ Assigned' }));
      for (const k of ['admin-pickup', 'admin-pickups', 'admin-pickups-range', 'suggested-drivers']) qc.invalidateQueries({ queryKey: [k] });
    },
    onError: (e: any, vid) => setDone((m) => ({ ...m, [vid]: e?.body?.error === 'already_covered'
      ? `⚠️ Already taken by ${(e.body.taken ?? []).join(', ')}. To add a second driver, use Assign.`
      : `⚠️ ${e?.message || 'Could not assign'}` })),
  });
  const rows = q.data?.data ?? [];
  if (q.isLoading || rows.length === 0) return null;
  return (
    <section className="rounded-[14px] border border-forest/30 bg-sage/30 px-4 py-3">
      <h2 className="text-[11px] font-extrabold uppercase tracking-[.05em] text-forest-deep mb-2">Suggested drivers — they covered this place before</h2>
      <ul className="space-y-2">
        {rows.map((v) => (
          <li key={v.id} className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[13.5px] font-bold text-ink">{v.name}{v.unit_number != null && <span className="ml-1 text-muted font-semibold text-[11.5px]">#{v.unit_number}</span>}</div>
              <div className="text-[11.5px] text-muted">Covered it {v.count}× · last {fmtDate(v.last)}{v.phone ? ` · ${v.phone}` : ''}</div>
              {done[v.id] && <div className="text-[11.5px] font-semibold text-forest">{done[v.id]}</div>}
            </div>
            <div className="flex gap-1.5 shrink-0">
              {v.phone && (
                <button disabled={ask.isPending} onClick={() => ask.mutate(v.id)}
                        className="haptic rounded-[10px] border border-forest/40 bg-paper px-3 py-1.5 text-[12px] font-bold text-forest disabled:opacity-50">Ask them</button>
              )}
              <button disabled={assign.isPending} onClick={() => assign.mutate(v.id)}
                      className="haptic rounded-[10px] bg-forest px-3 py-1.5 text-[12px] font-bold text-paper disabled:opacity-50">Assign</button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
