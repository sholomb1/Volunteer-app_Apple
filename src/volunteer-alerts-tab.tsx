/**
 * Oct 9 client: volunteer profile → "Alerts & schedule". Everything about the
 * messages and schedules one volunteer gets, in one place, and the office can
 * change it here: pickup texts on/off, text/WhatsApp, quiet hours, text
 * groups, uncovered-pickup alerts, on-call hours, steady pickups (add/remove),
 * steady reminders (on/off for this person + timing per steady pickup), and
 * what's coming up (pickups, reminders, scheduled texts).
 * API: routes/volunteer-alerts.ts (+ PATCH /steady-pickups/:id for timing).
 */
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { cx } from './design';
import { uiConfirm } from './ui-dialogs';
import { OnCallHoursEditor, RecentCalls } from './on-call';
import { OfficePauseReach } from './office-driver-app'; // Oct 14 client: same Pause + reach choice as the driver app
import { fmtTime } from './time-format';
import { QuietDaysPicker, liveTexting } from './quiet-days-picker'; // Oct 14 client: days for each quiet time

type Data = {
  volunteer: { id: string; firstName: string | null; smsOptIn: boolean; contactChannel: string; quietStart: string | null; quietEnd: string | null;
               steadyRemindersEnabled: boolean; doNotContact: boolean; doneRemindersEnabled: boolean; uncoveredAlerts: boolean; canBoth: boolean; status: string | null;
               appPickupTexts: string | null; appUncovered: string | null; appSteadyReminders: string | null; appReminderMinutes: string | null };
  groups: { id: number; name: string; isDefault: boolean; member: boolean; memberCount: number }[];
  steady: { id: string; label: string; time: string | null; active: boolean; reminderEnabled: boolean; reminderMinutes: number | null;
            everyDay: boolean; myDays: number[]; days: string[] | null; driverCount: number }[];
  allSteady: { id: string; label: string; time: string | null; missingDays: string[] | null }[];
  upcoming: { id: string; ref: string | null; date: string; time: string | null; label: string; steady: boolean; reminderAt: string | null; reminderSent: boolean }[];
  scheduled: { id: number; body: string; type: string; sendAt: string; recipientCount: number }[];
  quietWindows: { start: string; end: string; days?: number }[];  // Oct 14 client: + days
  rightNow: { getsPickupTexts: boolean; why: string[] };
  texting?: { texting: string; quiet: string | null; days: string | null; away: string | null; check: boolean };  // Oct 12 client
};

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_SHORT: Record<string, string> = { sunday: 'Sun', monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri', saturday: 'Sat' };
const REMINDER_CHOICES = [15, 30, 60, 90, 120, 180, 240];
const mins = (m: number) => (m % 60 === 0 ? `${m / 60} hr${m >= 120 ? 's' : ''}` : m > 60 ? `${Math.floor(m / 60)} hr ${m % 60} min` : `${m} min`);
const t12 = (t: string | null) => (t ? fmtTime(t) : '');
const dayLabel = (d: string) => {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const tmr = new Date(Date.now() + 86400e3).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  return d === today ? 'Today' : d === tmr ? 'Tomorrow' : new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
};
const box = 'rounded-[10px] border-[1.4px] border-line-2 bg-paper px-2.5 py-1.5 text-[13px] outline-none focus:border-forest';

function Card({ title, help, children }: { title: string; help?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[14px] border border-line bg-paper px-4 py-3">
      <div className="text-[14px] font-extrabold text-ink">{title}</div>
      {help && <div className="text-[12px] text-muted mb-2">{help}</div>}
      <div className={help ? '' : 'mt-2'}>{children}</div>
    </section>
  );
}

function Toggle({ on, onChange, disabled, label }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}
            className={cx('haptic relative inline-flex h-[26px] w-[46px] shrink-0 items-center rounded-full transition-colors disabled:opacity-50',
                          on ? 'bg-forest' : 'bg-line-2')}>
      <span className={cx('inline-block h-[20px] w-[20px] rounded-full bg-paper shadow transition-transform', on ? 'translate-x-[23px]' : 'translate-x-[3px]')} />
    </button>
  );
}

function Line({ label, sub, children }: { label: React.ReactNode; sub?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line py-2 last:border-b-0">
      <div className="min-w-0">
        <div className="text-[13.5px] font-bold text-ink">{label}</div>
        {sub && <div className="text-[12px] text-muted">{sub}</div>}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

export function VolunteerAlertsTab({ volunteerId }: { volunteerId: number }) {
  const qc = useQueryClient();
  const key = ['volunteer-alerts', volunteerId];
  const q = useQuery({ queryKey: key, queryFn: () => api<{ data: Data }>(`/api/volunteers/${volunteerId}/alerts`) });
  const [err, setErr] = useState<string | null>(null);
  const [quiet, setQuiet] = useState<{ start: string; end: string; days?: number }[] | null>(null);
  const [addSp, setAddSp] = useState('');
  // Oct 9 client: list the steady pickups missing a driver first; "Show all" for the rest.
  const [showAllSteady, setShowAllSteady] = useState(false);
  const d = q.data?.data;
  // Reset the editable copy whenever the saved quiet times change (after Save too).
  useEffect(() => { if (d) setQuiet(d.quietWindows.map((w) => ({ ...w }))); }, [JSON.stringify(d?.quietWindows ?? null)]);

  const done = () => { setErr(null); qc.invalidateQueries({ queryKey: key }); qc.invalidateQueries({ queryKey: ['admin-volunteers'] }); qc.invalidateQueries({ queryKey: ['vol-settings', volunteerId] }); };
  const fail = (e: any) => setErr(e?.message ?? 'Could not save');
  const patch = useMutation({
    mutationFn: (body: Record<string, unknown>) => api(`/api/volunteers/${volunteerId}/alerts`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: done, onError: fail,
  });
  const group = useMutation({
    mutationFn: (x: { id: number | 'uncovered'; member: boolean }) =>
      api(`/api/volunteers/${volunteerId}/alerts/groups/${x.id}`, { method: 'PUT', body: JSON.stringify({ member: x.member }) }),
    onSuccess: done, onError: fail,
  });
  const steadyAdd = useMutation({
    mutationFn: (spId: number) => api(`/api/volunteers/${volunteerId}/alerts/steady`, { method: 'POST', body: JSON.stringify({ steadyPickupId: spId }) }),
    onSuccess: () => { setAddSp(''); done(); }, onError: fail,
  });
  const steadyRemove = useMutation({
    mutationFn: (spId: string) => api(`/api/volunteers/${volunteerId}/alerts/steady/${spId}`, { method: 'DELETE' }),
    onSuccess: done, onError: fail,
  });
  const steadyReminder = useMutation({
    mutationFn: (x: { spId: string; enabled: boolean; minutes?: number }) => api(`/api/steady-pickups/${x.spId}`, {
      method: 'PATCH', body: JSON.stringify({ reminderEnabled: x.enabled, ...(x.minutes ? { reminderMinutesBefore: x.minutes } : {}) }),
    }),
    onSuccess: done, onError: fail,
  });
  const unschedule = useMutation({
    mutationFn: (smsId: number) => api(`/api/volunteers/${volunteerId}/alerts/scheduled/${smsId}`, { method: 'DELETE' }),
    onSuccess: done, onError: fail,
  });

  if (q.isLoading) return <div className="text-[13px] text-muted">Loading…</div>;
  if (q.isError || !d) return <div className="text-[13px] text-clay">Couldn't load. <button onClick={() => q.refetch()} className="underline font-bold">Try again</button></div>;
  const v = d.volunteer;
  const name = v.firstName || 'This volunteer';
  const busy = patch.isPending || group.isPending;
  // What they answered on the sign-up application (shown next to the matching switch).
  const asked = (a: string | null, extra = '') => (a ? `On the application: ${a === 'yes' ? 'Yes' : 'No'}${extra}` : null);
  const mineIds = new Set(d.steady.map((s) => s.id));
  const quietDirty = quiet !== null && JSON.stringify(quiet) !== JSON.stringify(d.quietWindows);
  const quietBad = (quiet ?? []).some((w) => !w.start || !w.end || w.start === w.end);
  // Oct 14 client: the texting-hours line follows what is on screen (before Save); saved = the server's line.
  const shownTexting = quietDirty
    ? liveTexting(quiet ?? [], Number((v as any).quietDays ?? 0), (v as any).awayFrom ?? null, (v as any).awayUntil ?? null)
    : d.texting;

  return (
    <div className="space-y-3">
      {err && <div className="rounded-[10px] bg-clay/10 px-3 py-2 text-[13px] font-bold text-clay">{err}</div>}

      {/* Oct 14 client: Pause + "How should we reach them?" — exactly the driver app's options, same storage. */}
      <Card title="Pause & how we reach them" help="For drivers who can't use the app. The driver sees the same in the app (Settings), and changes there show here.">
        <OfficePauseReach volunteerId={volunteerId} name={name} />
      </Card>

      {/* Oct 9 client: say plainly whether they really get the pickup texts. */}
      <div className={cx('rounded-[14px] border px-4 py-3 text-[13.5px]',
                         d.rightNow.getsPickupTexts ? 'border-forest/30 bg-sage/40 text-ink' : 'border-clay/40 bg-clay/10 text-ink')}>
        <b>{d.rightNow.getsPickupTexts ? `✅ ${name} gets the texts about open pickups.` : `🚫 ${name} does NOT get the texts about open pickups right now.`}</b>
        {!d.rightNow.getsPickupTexts && (
          <ul className="mt-1 list-disc pl-5 text-[12.5px] text-muted">
            {d.rightNow.why.map((w) => <li key={w}>{w}</li>)}
          </ul>
        )}
      </div>

      <Card title="Messages" help={`How ${name} hears from us.`}>
        <Line label="Allow automatic texts" sub="Off = no texts from the system at all (pickups, reminders, alerts). On only allows them — see the line above for whether pickup texts really go out. The office can always text by hand.">
          <Toggle label="Allow automatic texts" on={v.smsOptIn} disabled={busy} onChange={(on) => patch.mutate({ smsOptIn: on })} />
        </Line>
        <Line label={'"Did you drop it off?" text'}
              sub={v.doneRemindersEnabled
                ? 'On — if they took a pickup and didn\'t sign in at the kiosk, they get one text a couple of hours later asking them to reply "<code> DONE".'
                : 'Off — no text when they forget to sign in at the kiosk.'}>
          <Toggle label="Did you drop it off text" on={v.doneRemindersEnabled} disabled={busy} onChange={(on) => patch.mutate({ doneRemindersEnabled: on })} />
        </Line>
        <Line label="Send by">
          {(['sms', 'whatsapp', ...(v.canBoth || v.contactChannel === 'both' ? ['both'] : [])] as const).map((c) => (
            <button key={c} disabled={busy} onClick={() => c !== v.contactChannel && patch.mutate({ contactChannel: c })}
                    className={cx('haptic rounded-[10px] border px-3 py-1.5 text-[12.5px] font-bold',
                                  v.contactChannel === c ? 'border-forest bg-forest text-paper' : 'border-line bg-paper text-ink hover:bg-cream')}>
              {c === 'sms' ? 'Text' : c === 'whatsapp' ? 'WhatsApp' : 'Both'}
            </button>
          ))}
        </Line>
        {/* Oct 9 client: more than one quiet time (e.g. 1–4 PM and 11 PM–7 AM). */}
        <div className="border-b border-line py-2 last:border-b-0">
          <div className="text-[13.5px] font-bold text-ink">Quiet times</div>
          {/* Oct 12 client: texting hours first, quiet hours under them in grey (as saved). */}
          {shownTexting && (
            <div data-texting-line className="my-1 text-[13px] leading-snug">
              <div className={cx('font-bold', shownTexting.check ? 'text-[#9a7415]' : 'text-ink')}>
                {shownTexting.texting}{quietDirty && <span className="ml-1.5 text-[11.5px] font-bold text-clay">(not saved yet)</span>}
              </div>
              {shownTexting.quiet && <div className="text-muted">{shownTexting.quiet}</div>}
              {shownTexting.days && <div className="text-muted">{shownTexting.days}</div>}
              {shownTexting.away && <div className="text-muted">{shownTexting.away}</div>}
            </div>
          )}
          <div className="text-[12px] text-muted mb-1.5">No automatic texts during these times, on the days picked for each. Can cross midnight (e.g. 11 PM – 7 AM; the day is the night it starts).</div>
          {(quiet ?? []).length === 0 && <div className="text-[13px] italic text-muted">None — texts can come any time.</div>}
          {(quiet ?? []).map((w, i) => (
            <div key={i} data-quiet-row className="py-1">
              <div className="flex flex-wrap items-center gap-2">
                <input type="time" className={box} value={w.start} onChange={(e) => setQuiet((quiet ?? []).map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))} />
                <span className="text-[12px] text-muted">to</span>
                <input type="time" className={box} value={w.end} onChange={(e) => setQuiet((quiet ?? []).map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))} />
                <button disabled={busy} onClick={() => setQuiet((quiet ?? []).filter((_, j) => j !== i))}
                        className="haptic text-[12.5px] font-bold text-clay hover:underline">Remove</button>
              </div>
              {/* Oct 14 client: which days this quiet time is on. */}
              <QuietDaysPicker value={w.days} disabled={busy} onChange={(days) => setQuiet((quiet ?? []).map((x, j) => (j === i ? { ...x, days } : x)))} />
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2 pt-1.5">
            {(quiet ?? []).length < 6 && (
              <button type="button" onClick={() => setQuiet([...(quiet ?? []), { start: '23:00', end: '07:00', days: 127 }])}
                      className="haptic rounded-[10px] border border-forest/40 px-3 py-1.5 text-[12.5px] font-bold text-forest">+ Add quiet time</button>
            )}
            {quietDirty && (
              <button disabled={busy || quietBad} onClick={() => patch.mutate({ quietWindows: quiet ?? [] })}
                      className="haptic rounded-[10px] bg-forest px-3 py-1.5 text-[12.5px] font-bold text-paper disabled:opacity-50">Save quiet times</button>
            )}
            {quietBad && <span className="text-[12px] font-bold text-clay">Pick a start and an end time (not the same).</span>}
          </div>
        </div>
      </Card>

      <Card title="Text groups" help={`Every group, and whether ${name} is in it.${!v.smsOptIn ? ' (Automatic texts are turned off, so no group texts reach them now.)' : ''}`}>
        {d.groups.map((g) => (
          <Line key={g.id}
                label={<>{g.name}{g.isDefault && <span className="ml-1.5 rounded-full bg-sage px-2 py-0.5 text-[10.5px] font-extrabold uppercase tracking-[.04em] text-forest">default</span>}</>}
                sub={<>{g.isDefault ? 'Gets the texts about open pickups. ' : ''}{g.memberCount} {g.memberCount === 1 ? 'person' : 'people'}
                      {g.isDefault && asked(v.appPickupTexts) ? ` · ${asked(v.appPickupTexts)}` : ''}</>}>
            <Toggle label={g.name} on={g.member} disabled={busy} onChange={(on) => group.mutate({ id: g.id, member: on })} />
          </Line>
        ))}
        <Line label="Urgent: pickup still has no driver"
              sub={<>Gets a text when a pickup is still without a driver.{asked(v.appUncovered) ? ` · ${asked(v.appUncovered)}` : ''}</>}>
          <Toggle label="Uncovered-pickup alerts" on={v.uncoveredAlerts} disabled={busy} onChange={(on) => group.mutate({ id: 'uncovered', member: on })} />
        </Line>
      </Card>

      <Card title="Steady pickups" help={`The steady pickups ${name} does. Changes reach the upcoming pickups within about 15 minutes.`}>
        <Line label="Reminder texts for steady pickups"
              sub={<>{v.steadyRemindersEnabled ? 'On — gets a text before each steady pickup.' : 'Off — no reminder texts for steady pickups.'}
                    {asked(v.appSteadyReminders, v.appSteadyReminders === 'yes' && v.appReminderMinutes ? `, ${mins(Number(v.appReminderMinutes))} before` : '')
                      ? ` · ${asked(v.appSteadyReminders, v.appSteadyReminders === 'yes' && v.appReminderMinutes ? `, ${mins(Number(v.appReminderMinutes))} before` : '')}` : ''}</>}>
          <Toggle label="Steady reminders" on={v.steadyRemindersEnabled} disabled={busy} onChange={async (on) => {
                    // Oct 9 client: do-not-contact drivers get no steady reminders unless the office confirms.
                    if (on && v.doNotContact && !(await uiConfirm(`${name} is set to "Do not contact". Turn on steady pickup reminders anyway?`))) return;
                    patch.mutate({ steadyRemindersEnabled: on });
                  }} />
        </Line>
        {d.steady.length === 0 && <div className="py-2 text-[13px] italic text-muted">Not on any steady pickup.</div>}
        {d.steady.map((s) => {
          const days = s.everyDay ? (s.days ?? []).map((x) => DAY_SHORT[x] ?? x).join(', ') : s.myDays.map((n) => DOW[n]).join(', ');
          return (
            <Line key={s.id}
                  label={<>{s.label}{!s.active && <span className="ml-1.5 text-[11px] font-bold text-muted">(paused)</span>}</>}
                  sub={<>{days}{s.time ? ` · ${t12(s.time)}` : ''}{!s.everyDay && ' · only these days'}{s.driverCount > 1 && ` · ${s.driverCount} drivers`}</>}>
              <select className={box} disabled={steadyReminder.isPending || !v.steadyRemindersEnabled}
                      title={s.driverCount > 1 ? `Reminder time is the same for all ${s.driverCount} drivers on this pickup` : undefined}
                      value={s.reminderEnabled ? String(s.reminderMinutes ?? 60) : 'off'}
                      onChange={(e) => steadyReminder.mutate(e.target.value === 'off'
                        ? { spId: s.id, enabled: false }
                        : { spId: s.id, enabled: true, minutes: Number(e.target.value) })}>
                <option value="off">No reminder</option>
                {[...new Set([...REMINDER_CHOICES, s.reminderMinutes ?? 60])].sort((a, b) => a - b).map((m) => (
                  <option key={m} value={m}>Remind {mins(m)} before</option>
                ))}
              </select>
              <button disabled={steadyRemove.isPending}
                      onClick={async () => { if (await uiConfirm(`Take ${name} off ${s.label}?`)) steadyRemove.mutate(s.id); }}
                      className="haptic px-1 text-[12.5px] font-bold text-clay hover:underline disabled:opacity-50">Remove</button>
            </Line>
          );
        })}
        {(() => {
          const choices = d.allSteady.filter((s) => !mineIds.has(s.id));
          const needing = choices.filter((s) => s.missingDays?.length);
          const shown = showAllSteady ? choices : needing;
          const opt = (s: Data['allSteady'][number]) => (
            <option key={s.id} value={s.id}>
              {s.label}{s.time ? ` · ${t12(s.time)}` : ''}{s.missingDays?.length ? ` — needs a driver: ${s.missingDays.map((x) => DAY_SHORT[x] ?? x).join(', ')}` : ''}
            </option>
          );
          return (
            <>
              <div className="flex flex-wrap items-center gap-2 pt-2">
                <select className={cx(box, 'min-w-0 flex-1')} value={addSp} onChange={(e) => setAddSp(e.target.value)}>
                  <option value="">{showAllSteady ? 'Add to a steady pickup…' : needing.length ? `Add to a steady pickup that needs a driver (${needing.length})…` : 'No steady pickup needs a driver right now'}</option>
                  {showAllSteady && needing.length > 0 ? (
                    <>
                      <optgroup label="Needs a driver">{needing.map(opt)}</optgroup>
                      <optgroup label="Already has drivers">{choices.filter((s) => !s.missingDays?.length).map(opt)}</optgroup>
                    </>
                  ) : shown.map(opt)}
                </select>
                <button disabled={!addSp || steadyAdd.isPending} onClick={() => steadyAdd.mutate(Number(addSp))}
                        className="haptic rounded-[10px] bg-forest px-3 py-1.5 text-[12.5px] font-bold text-paper disabled:opacity-50">
                  {steadyAdd.isPending ? 'Adding…' : 'Add'}
                </button>
              </div>
              <button type="button" onClick={() => { setShowAllSteady(!showAllSteady); setAddSp(''); }}
                      className="haptic mt-1.5 text-[12.5px] font-bold text-forest hover:underline">
                {showAllSteady ? 'Show only the ones that need a driver' : `Show all steady pickups (${choices.length})`}
              </button>
            </>
          );
        })()}
        <div className="mt-1 text-[11.5px] text-muted">Reminder time is set per steady pickup — if others drive it too, it changes for them as well.</div>
      </Card>

      <Card title="On call" help="">
        <OnCallHoursEditor endpoint={`/api/volunteers/${volunteerId}/on-call`} title="" who={`${name} is`} />
        {/* Oct 11 client: calls the office made to this driver (logged from the Live Board or here). */}
        <div className="mt-3 border-t border-line pt-3">
          <RecentCalls volunteerId={volunteerId} name={name} />
        </div>
      </Card>

      <Card title="Coming up (next 2 weeks)" help="Pickups they're on, and the reminder texts they'll get.">
        {d.upcoming.length === 0 ? <div className="text-[13px] italic text-muted">Nothing scheduled.</div> : (
          <ul className="divide-y divide-line">
            {d.upcoming.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5 text-[13px]">
                <span><b>{dayLabel(p.date)}</b>{p.time ? ` · ${t12(p.time)}` : ''} — {p.label}{p.steady && <span className="text-muted"> · steady</span>}</span>
                <span className="text-[12px] text-muted">
                  {p.reminderSent ? '✓ reminder sent' : p.reminderAt ? `reminder ${t12(p.reminderAt.slice(11, 16))}` : p.steady ? 'no reminder' : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
        {d.scheduled.length > 0 && (
          <div className="mt-3">
            <div className="text-[12px] font-extrabold uppercase tracking-[.05em] text-muted mb-1">Scheduled texts to {name}</div>
            <ul className="divide-y divide-line">
              {d.scheduled.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5 text-[13px]">
                  <span className="min-w-0 flex-1">
                    <b>{new Date(m.sendAt).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/New_York' })}</b>
                    <span className="text-muted"> · to {m.recipientCount} {m.recipientCount === 1 ? 'person' : 'people'}</span>
                    <div className="truncate text-[12px] text-muted">{m.body}</div>
                  </span>
                  <button disabled={unschedule.isPending}
                          onClick={async () => { if (await uiConfirm(`Don't send this text to ${name}?`)) unschedule.mutate(m.id); }}
                          className="haptic px-1 text-[12.5px] font-bold text-clay">Don't send to {name}</button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>
    </div>
  );
}
