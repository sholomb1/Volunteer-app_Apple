/**
 * Oct 14 client: shared bits for the driver app Settings screen and the Home
 * status line — how we reach the driver about pickups (Text / WhatsApp / Both /
 * App only / Nothing), and Pause (for today / a week / until I turn it back on /
 * Oct 14: until a date — "Paused until Sun, Oct 20", ends by itself).
 * API: GET/PUT /api/me/settings (apps/api/src/routes/me-settings.ts).
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type DriverSettings, type ReachChoice } from './api';
import { DateInput } from './design';
import { nyToday } from './time-format';
import { uiNotify } from './ui-dialogs';
import { driverError } from './screens/driver-card';

export const REACH_OPTIONS: Array<{ value: ReachChoice; icon: string; label: string; help: string; isNew?: boolean }> = [
  { value: 'text',     icon: '📱', label: 'Text messages',          help: 'Pickup texts to your phone.' },
  { value: 'whatsapp', icon: '💬', label: 'WhatsApp',               help: 'Pickup messages on WhatsApp instead of texts.', isNew: true },
  { value: 'both',     icon: '📲', label: 'Both',                   help: 'Texts and WhatsApp.', isNew: true },
  { value: 'app',      icon: '🔔', label: 'App notifications only', help: 'Only alerts from this app. No texts.' },
  { value: 'none',     icon: '🔕', label: 'Nothing',                help: 'No pickup messages. You can still open the app and take pickups.' },
];
export const REACH_SHORT: Record<ReachChoice, string> = {
  text: 'Text', whatsapp: 'WhatsApp', both: 'Text + WhatsApp', app: 'App only', none: 'Nothing',
};

export const shiftDay = (iso: string, n: number) => new Date(Date.parse(iso + 'T12:00:00Z') + n * 86400e3).toISOString().slice(0, 10);
export const prettyDay = (iso: string) => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
const day10 = (v: string | null | undefined) => (v ? String(v).slice(0, 10) : null);

// Oct 14 client: the office uses the same settings for a driver (volunteerId) — same API
// handler (/api/volunteers/:id/settings), same columns, so both sides always agree.
export type SetBy = { by: 'driver' | 'office'; name: string | null; at: string };
export type DriverSettingsFull = DriverSettings & { pauseSetBy?: SetBy | null; channelSetBy?: SetBy | null };
export const settingsUrl = (volunteerId?: number) => (volunteerId != null ? `/api/volunteers/${volunteerId}/settings` : '/api/me/settings');
export const settingsKey = (volunteerId?: number) => (volunteerId != null ? ['vol-settings', volunteerId] : ['me-settings']);
/** "set by the driver in the app on Oct 14" / "set by the office (Chaya) on Oct 14". */
export function setByLine(sb: SetBy | null | undefined): string {
  if (!sb) return '';
  const on = new Date(sb.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' });
  return sb.by === 'office' ? `set by the office${sb.name ? ` (${sb.name})` : ''} on ${on}` : `set by the driver in the app on ${on}`;
}

export function useDriverSettings(volunteerId?: number) {
  return useQuery({ queryKey: settingsKey(volunteerId), queryFn: () => api<{ data: DriverSettingsFull }>(settingsUrl(volunteerId)), staleTime: 30_000, refetchOnWindowFocus: true });
}

/** Quiet hours as "10 PM–7 AM, 1 PM–3 PM" (from the server's "🌙 Quiet: …" line). */
export function quietShort(s: DriverSettings | undefined): string {
  const q = s?.texting?.quiet;
  return q ? q.replace(/^🌙\s*Quiet:\s*/, '').replace(/ – /g, '–') : '';
}

/** Pause: Away dates (today / a week) or the "until I turn it back on" switch (is_available). */
export function usePause(s: DriverSettingsFull | DriverSettings | undefined, volunteerId?: number) {
  const qc = useQueryClient();
  const today = nyToday();
  const office = volunteerId != null;
  const refresh = () => {
    qc.invalidateQueries({ queryKey: settingsKey(volunteerId) });
    if (office) { qc.invalidateQueries({ queryKey: ['volunteer-alerts', volunteerId] }); qc.invalidateQueries({ queryKey: ['admin-volunteers'] }); }
    else { qc.invalidateQueries({ queryKey: ['availability'] }); qc.invalidateQueries({ queryKey: ['volunteer-self'] }); }
  };
  const fail = (e: unknown) => uiNotify(driverError(e, "Couldn't save, try again."), 'err');
  const put = (body: Record<string, unknown>) => api<{ data: DriverSettingsFull }>(settingsUrl(volunteerId), { method: 'PUT', body: JSON.stringify(body) });
  const setAway = useMutation({
    mutationFn: (r: { vacationFrom?: string | null; vacationUntil?: string | null; isAvailable?: boolean }) => put(r),
    onSuccess: (r) => { qc.setQueryData(settingsKey(volunteerId), r); refresh(); },
    onError: fail,
  });
  // Oct 14 client: "Until turned back on" / Resume now go through the same settings call
  // (the old /me/availability call sent a field that route ignored).
  const setAvail = useMutation({
    mutationFn: (on: boolean) => put({ isAvailable: on }),
    onSuccess: (r) => { qc.setQueryData(settingsKey(volunteerId), r); refresh(); },
    onError: fail,
  });

  const awayFrom = day10(s?.vacationFrom);
  const awayUntil = day10(s?.vacationUntil);
  const awayNow = !!(awayFrom || awayUntil) && (!awayFrom || awayFrom <= today) && (!awayUntil || today <= awayUntil);
  const until = s?.unavailableUntil ? new Date(s.unavailableUntil) : null;
  const officeUntil = !!until && until.getTime() > Date.now();
  const switchedOff = !!s && (!s.isAvailable || officeUntil);
  const paused = awayNow || switchedOff;
  // "until Thu, Oct 16" = the day messages start again (Away dates are inclusive).
  const resumeOn: string | null = switchedOff
    ? (officeUntil ? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(until!) : null)
    : awayUntil ? shiftDay(awayUntil, 1) : null;
  const pausedLine = switchedOff
    ? (officeUntil ? `Paused until ${until!.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/New_York' })}` : 'Paused until you turn it back on')
    : !awayUntil ? 'Paused'
    : awayUntil === today ? 'Paused for today'
    : `Paused until ${prettyDay(shiftDay(awayUntil, 1))}`;
  // Oct 14 client: say plainly what Pause means.
  const pauseMeaning = office
    ? `No pickup messages until ${resumeOn ? prettyDay(resumeOn) : 'turned back on'}. They can still open the app and take pickups.`
    : `No pickup messages until ${resumeOn ? prettyDay(resumeOn) : 'you turn them back on'}. You can still open the app and take pickups.`;
  const setBy = setByLine((s as DriverSettingsFull | undefined)?.pauseSetBy);
  function resume() {
    // Resume now — one call: messages back on (+ clears today's Away dates).
    setAway.mutate({ isAvailable: true, ...(awayNow ? { vacationFrom: null, vacationUntil: null } : {}) });
  }
  // Oct 14 client: "Until a date…" — stored like "For a week" (Away from today through the
  // day before the chosen date), so it ends by itself: messages start again on that date.
  function pauseFor(kind: PauseChoice) {
    if (typeof kind === 'object') setAway.mutate({ vacationFrom: today, vacationUntil: shiftDay(kind.until, -1) });
    else if (kind === 'today') setAway.mutate({ vacationFrom: today, vacationUntil: today });
    else if (kind === 'week') setAway.mutate({ vacationFrom: today, vacationUntil: shiftDay(today, 6) });
    else setAvail.mutate(false);
  }
  return { paused, pausedLine: office && pausedLine === 'Paused until you turn it back on' ? 'Paused until turned back on' : pausedLine,
           pauseMeaning, setBy, resume, pauseFor, busy: setAway.isPending || setAvail.isPending };
}

/** Oct 14 client: { until: 'YYYY-MM-DD' } = the date pickup messages start again. */
export type PauseChoice = 'today' | 'week' | 'off' | { until: string };
const PAUSE_MAX_DAYS = 183; // about 6 months

/** "Pause pickup messages — for how long?" bottom sheet. */
export function PauseSheet({ onPick, onClose, busy }: { onPick: (k: PauseChoice) => void; onClose: () => void; busy?: boolean }) {
  // Oct 14 client: "Until a date…" → a date box (tomorrow … ~6 months).
  const today = nyToday();
  const minDay = shiftDay(today, 1), maxDay = shiftDay(today, PAUSE_MAX_DAYS);
  const [pickDate, setPickDate] = useState(false);
  const [date, setDate] = useState('');
  const dateOk = !!date && date >= minDay && date <= maxDay;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div data-pause-sheet className="w-full max-w-md rounded-t-[22px] bg-paper px-5 pt-5 pb-[calc(20px+env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
        <div className="font-display font-semibold text-[20px] mb-1">Pause pickup messages</div>
        <div className="text-[15px] text-muted mb-3">No new pickup messages while paused. You can still open the app and take pickups. Messages about pickups you already took still come.</div>
        {pickDate ? (
          <div className="space-y-2.5">
            <label className="block">
              <div className="text-[15px] font-bold text-ink mb-1">Pause until</div>
              <DateInput value={date} onChange={setDate} min={minDay} max={maxDay}
                         className="w-full rounded-[12px] border-[1.4px] border-line bg-paper px-3.5 py-3 text-[16px] outline-none focus:border-forest" />
            </label>
            <div className={dateOk ? 'rounded-[12px] bg-sage/50 border border-sage-line px-3.5 py-2.5 text-[15px] text-ink leading-snug' : 'text-[14px] text-muted'}>
              {dateOk
                ? <>No pickup messages until <b>{prettyDay(date)}</b>. They start again that day by themselves.</>
                : date ? `Pick a day from ${prettyDay(minDay)} to ${prettyDay(maxDay)}.` : 'Pick the day messages should start again.'}
            </div>
            <button onClick={() => { if (dateOk) { onPick({ until: date }); onClose(); } }} disabled={busy || !dateOk}
                    className="haptic w-full min-h-[52px] rounded-[14px] bg-forest text-paper text-[17px] font-bold disabled:opacity-50">
              {dateOk ? `Pause until ${prettyDay(date)}` : 'Pause'}
            </button>
            <button onClick={() => setPickDate(false)} className="haptic w-full min-h-[52px] rounded-[14px] text-muted text-[16px] font-bold">
              Back
            </button>
          </div>
        ) : (
          <div className="space-y-2.5">
            {([['today', 'For today'], ['week', 'For a week'], ['off', 'Until I turn it back on']] as const).map(([k, label]) => (
              <button key={k} onClick={() => { onPick(k); onClose(); }} disabled={busy}
                      className="haptic w-full min-h-[52px] rounded-[14px] border border-forest/40 bg-sage text-forest text-[17px] font-bold disabled:opacity-60">
                {label}
              </button>
            ))}
            <button onClick={() => setPickDate(true)} disabled={busy}
                    className="haptic w-full min-h-[52px] rounded-[14px] border border-forest/40 bg-sage text-forest text-[17px] font-bold disabled:opacity-60">
              Until a date…
            </button>
            <button onClick={onClose} className="haptic w-full min-h-[52px] rounded-[14px] text-muted text-[16px] font-bold">
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Oct 14 client: what Pause means + "Resume now" (Home and Settings). */
// Oct 14 client: the office sees who paused and when; the driver sees it only when the office did it.
export function PausedBox({ pause, onChange, office = false }: { pause: ReturnType<typeof usePause>; onChange?: () => void; office?: boolean }) {
  const showSetBy = !!pause.setBy && (office || pause.setBy.startsWith('set by the office'));
  return (
    <div data-paused-box className="rounded-[14px] border border-amber/50 bg-amber-soft px-3.5 py-3">
      <div className="flex items-center gap-2">
        <span className="flex-1 min-w-0 text-[16px] font-bold text-ink">⏸ {pause.pausedLine}{showSetBy && <span className="font-normal text-ink/75"> — {pause.setBy}</span>}</span>
        {onChange && (
          <button onClick={onChange} className="haptic shrink-0 min-h-[44px] px-2 text-[15px] font-bold text-forest underline underline-offset-2">Change</button>
        )}
      </div>
      <div className="mt-0.5 text-[15px] text-ink/85 leading-snug">{pause.pauseMeaning}</div>
      <button onClick={pause.resume} disabled={pause.busy}
              className="haptic mt-2.5 w-full min-h-[48px] rounded-[12px] bg-forest text-paper text-[16px] font-bold disabled:opacity-60">Resume now</button>
    </div>
  );
}

/** Small "new" tag (WhatsApp is still being tested by the owner). */
// Oct 14 client: "new" tags go away by themselves 2 weeks after go-live (Oct 28, 2026).
export const NEW_TAGS_UNTIL = '2026-10-28';
export function NewTag() {
  if (new Date().toISOString().slice(0, 10) >= NEW_TAGS_UNTIL) return null;
  return <span className="ml-1.5 inline-block rounded-full bg-clay px-2 py-0.5 align-middle text-[11px] font-extrabold uppercase tracking-[.05em] text-paper">new</span>;
}
