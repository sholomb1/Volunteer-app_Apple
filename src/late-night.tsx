/**
 * Oct 23 client: a text typed by hand at 2:02 AM woke a driver. "If you send out a text late at
 * night, it should tell you it's whatever time, it's 1 a.m. Would you like to send it now, or would
 * you like to schedule it for later?"
 *
 * Every office / dispatcher box that sends a PERSONAL text by hand (💬 Text on pickup cards and the
 * pickup page, the driver popup's Messages, Driver messages → Texts, WhatsApp replies, "Text them"
 * on problem reports, "Ask driver: dropped off?") sends through useNightSend(). Between 10 PM and
 * 8 AM New York time (NIGHT_START_HOUR / NIGHT_END_HOUR — the same numbers as the API's
 * late-night.ts) the server answers 409 instead of sending, and the app shows:
 *   "It's 1:12 AM. Send now, or schedule it?"
 *   [Send now anyway] [Schedule for 8:00 AM] [Pick a time…] [Cancel]
 * On Shabbos / Yom Tov only scheduling is offered. "Send now anyway" re-sends with
 * { confirmNight: true }. Scheduling uses the scheduled-texts list (POST /api/sms/personal-scheduled);
 * the conversation then shows "⏰ Scheduled for 8:00 AM" with Send now / Cancel (ScheduledTexts),
 * and Messaging → Upcoming lists it for the office (OfficeScheduledRow).
 * Group screens (SMS composer) don't get a 409 from the server; they ask first (localCheck).
 */
import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { uiConfirm } from './ui-dialogs';

/** Late night = 10 PM … */
export const NIGHT_START_HOUR = 22;
/** … to 8 AM (New York). Same numbers as the API (late-night.ts). */
export const NIGHT_END_HOUR = 8;
const TZ = 'America/New_York';

export type LateInfo = {
  kind: 'night' | 'shabbos'; now: string; holyName: string | null; canSendNow: boolean;
  next: string; nextLabel: string; nightStart: number; nightEnd: number;
};
export type PersonalKind = 'sms' | 'wa' | 'bug' | 'ask';
export type PersonalSpec = { kind: PersonalKind; text?: string; phone?: string | null; reportId?: number; pickupId?: number; aboutPickupId?: number | null };
export type PersonalInfo = { kind: PersonalKind; text: string; phone?: string | null; name?: string | null; volunteerId?: number | null; reportId?: number | null; pickupId?: number | null };
export type ScheduledRow = { id: number; send_at: string; body: string; by_name?: string | null; personal: PersonalInfo | null };
export type ScheduledFilter = { phone?: string | null; volunteerId?: number | null; reportId?: number | null; pickupId?: number | null };

/** The NY hour (0–23). */
export function nyHour(d: Date = new Date()): number {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', hourCycle: 'h23' }).format(d)) % 24;
}
export function isNightNY(d: Date = new Date()): boolean {
  const h = nyHour(d);
  return h >= NIGHT_START_HOUR || h < NIGHT_END_HOUR;
}
/** The 409 "late at night / Shabbos" answer from the server, or null. */
export function lateInfoOf(e: any): LateInfo | null {
  return e?.status === 409 && e?.body?.lateNight ? (e.body.lateNight as LateInfo) : null;
}
const nyYmd = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: TZ });
const addDays = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
/** The instant of NY wall time ymd + "HH:MM" (DST-safe). */
export function nyWallISO(ymd: string, hhmm: string): string {
  const [y, mo, d] = ymd.split('-').map(Number);
  const [h, mi] = hhmm.split(':').map(Number);
  const want = Date.UTC(y!, (mo || 1) - 1, d || 1, h || 0, mi || 0);
  let t = want + 5 * 3_600_000;
  for (let i = 0; i < 3; i++) {
    const p = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(t));
    const g = (k: string) => Number(p.find((x) => x.type === k)?.value);
    const shown = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour') % 24, g('minute'));
    if (shown === want) break;
    t += want - shown;
  }
  return new Date(t).toISOString();
}
/** "8:00 AM", "8:00 AM tomorrow", "Sun, Oct 25, 8:00 AM" (New York). */
export function whenLabel(iso: string, now: Date = new Date()): string {
  const t = new Date(iso);
  const clock = t.toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });
  const a = nyYmd(now); const b = nyYmd(t);
  if (a === b) return clock;
  if (b === addDays(a, 1)) return `${clock} tomorrow`;
  return `${t.toLocaleDateString('en-US', { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric' })}, ${clock}`;
}

export const personalSched = {
  create: (spec: PersonalSpec, sendAt: string) =>
    api<{ data: ScheduledRow }>('/api/sms/personal-scheduled', { method: 'POST', body: JSON.stringify({ ...spec, sendAt }) }),
  list: (f: ScheduledFilter) => {
    const qs = new URLSearchParams();
    if (f.phone) qs.set('phone', String(f.phone));
    if (f.volunteerId != null) qs.set('volunteerId', String(f.volunteerId));
    if (f.reportId != null) qs.set('reportId', String(f.reportId));
    if (f.pickupId != null) qs.set('pickupId', String(f.pickupId));
    return api<{ data: ScheduledRow[] }>(`/api/sms/personal-scheduled?${qs.toString()}`);
  },
  cancel: (id: number) => api(`/api/sms/personal-scheduled/${id}`, { method: 'DELETE' }),
  sendNow: (id: number, confirmNight: boolean) =>
    api(`/api/sms/personal-scheduled/${id}/send-now`, { method: 'POST', body: JSON.stringify(confirmNight ? { confirmNight: true } : {}) }),
  check: (at?: string) => api<{ data: { late: LateInfo | null; atProblem: string | null } }>(`/api/sms/quiet-now${at ? `?at=${encodeURIComponent(at)}` : ''}`),
};

/** The small prompt: "It's 1:12 AM. Send now, or schedule it?" */
export function NightPrompt({ info, schedulable, busy, err, onSendNow, onSchedule, onCancel }: {
  info: LateInfo; schedulable: boolean; busy: boolean; err: string | null;
  onSendNow: () => void; onSchedule: (iso: string) => void; onCancel: () => void;
}) {
  const today = nyYmd(new Date());
  const [picking, setPicking] = useState(false);
  const [day, setDay] = useState(addDays(today, 1));
  const [time, setTime] = useState('09:00');
  const [pickErr, setPickErr] = useState<string | null>(null);
  const shabbos = info.kind === 'shabbos';
  const title = shabbos
    ? `It's ${info.holyName ?? 'Shabbos'}. Texts can't go out now — schedule it?`
    : `It's ${info.now}. Send now, or schedule it?`;
  const savePicked = () => {
    if (!day || !/^\d{1,2}:\d{2}$/.test(time)) { setPickErr('Pick a date and time.'); return; }
    const iso = nyWallISO(day, time);
    const h = Number(time.split(':')[0]);
    if (h >= NIGHT_START_HOUR || h < NIGHT_END_HOUR) { setPickErr('That is late at night (10 PM – 8 AM). Pick a time between 8 AM and 10 PM.'); return; }
    if (Date.parse(iso) < Date.now()) { setPickErr('That time has passed. Pick a later time.'); return; }
    setPickErr(null);
    onSchedule(iso);
  };
  const btn = 'haptic w-full rounded-[10px] px-3 py-2 text-[13.5px] font-bold disabled:opacity-50';
  return createPortal(
    <div data-night-prompt className="fixed inset-0 z-[90] grid place-items-center bg-black/35 p-4" onClick={(e) => { e.stopPropagation(); if (e.target === e.currentTarget && !busy) onCancel(); }}>
      <div role="dialog" aria-modal="true" aria-label={title} className="w-full max-w-[380px] space-y-3 rounded-[16px] border border-line bg-paper p-4 shadow-xl">
        <div className="flex items-start gap-2">
          <span className="text-[22px] leading-none" aria-hidden>{shabbos ? '🕯' : '🌙'}</span>
          <div>
            <div className="font-display text-[16px] font-bold text-ink">{title}</div>
            <div className="mt-0.5 text-[12.5px] text-muted">
              {shabbos ? 'It will go out after Shabbos / Yom Tov.' : 'Late at night (10 PM – 8 AM) a text can wake them up.'}
            </div>
          </div>
        </div>
        {!picking ? (
          <div className="space-y-1.5">
            {info.canSendNow && (
              <button type="button" data-night-send disabled={busy} onClick={onSendNow}
                      className={`${btn} border border-clay/60 bg-paper text-clay hover:bg-clay/10`}>{busy ? 'Sending…' : 'Send now anyway'}</button>
            )}
            {schedulable && (
              <button type="button" data-night-next disabled={busy} onClick={() => onSchedule(info.next)}
                      className={`${btn} bg-forest text-paper`}>⏰ Schedule for {info.nextLabel}</button>
            )}
            {schedulable && (
              <button type="button" data-night-pick disabled={busy} onClick={() => { setPicking(true); setPickErr(null); }}
                      className={`${btn} border border-forest/50 bg-paper text-forest hover:bg-sage/40`}>Pick a time…</button>
            )}
            <button type="button" data-night-cancel disabled={busy} onClick={onCancel}
                    className={`${btn} border border-line bg-paper text-muted hover:text-ink`}>Cancel</button>
          </div>
        ) : (
          <div data-night-picker className="space-y-2">
            <div className="text-[12.5px] font-bold text-ink">When should it go out?</div>
            <div className="flex gap-2">
              <input type="date" value={day} min={today} max={addDays(today, 30)} onChange={(e) => { setDay(e.target.value); setPickErr(null); }}
                     className="min-w-0 flex-1 rounded-[10px] border border-line bg-paper px-2 py-1.5 text-[13.5px]" />
              <input type="time" value={time} step={300} onChange={(e) => { setTime(e.target.value); setPickErr(null); }}
                     className="w-[120px] rounded-[10px] border border-line bg-paper px-2 py-1.5 text-[13.5px]" />
            </div>
            <div className="text-[11.5px] text-muted">New York time · 8 AM to 10 PM · not on Shabbos or Yom Tov</div>
            <div className="flex gap-1.5">
              <button type="button" disabled={busy} onClick={() => { setPicking(false); setPickErr(null); }}
                      className="haptic rounded-[10px] border border-line bg-paper px-3 py-2 text-[13px] font-bold text-muted">Back</button>
              <button type="button" data-night-pick-save disabled={busy} onClick={savePicked}
                      className="haptic flex-1 rounded-[10px] bg-forest px-3 py-2 text-[13px] font-bold text-paper disabled:opacity-50">{busy ? 'Saving…' : 'Schedule'}</button>
            </div>
          </div>
        )}
        {(pickErr || err) && <div data-night-err className="rounded-[10px] bg-clay-soft px-3 py-1.5 text-[12.5px] font-bold text-clay">{pickErr || err}</div>}
      </div>
    </div>,
    document.body,
  );
}

/**
 * Send through the late-night check. start() sends; if the server says it's late (409) or
 * (localCheck, group screens) the NY clock says so, the prompt opens instead.
 *   send(confirmNight)  — the real send (pass confirmNight on to the server)
 *   schedule(iso)       — schedule it (omit = only "Send now anyway" / "Cancel")
 */
export function useNightSend<T>(o: {
  send: (confirmNight: boolean) => Promise<T>;
  schedule?: ((sendAtISO: string) => Promise<unknown>) | null;
  onSent?: (r: T) => void;
  onScheduled?: (label: string) => void;
  onError?: (e: any) => void;
  localCheck?: boolean;
}) {
  const ref = useRef(o); ref.current = o;
  const [info, setInfo] = useState<LateInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async (confirmNight: boolean) => {
    setBusy(true); setErr(null);
    try {
      const r = await ref.current.send(confirmNight);
      setInfo(null);
      ref.current.onSent?.(r);
    } catch (e: any) {
      const li = lateInfoOf(e);
      if (li) setInfo(li);
      else if (confirmNight && info) setErr(e?.message || 'Not sent');
      else { setInfo(null); ref.current.onError?.(e); }
    } finally { setBusy(false); }
  };
  const start = async () => {
    if (busy) return;
    if (ref.current.localCheck && isNightNY()) {
      setBusy(true);
      try {
        const r = await personalSched.check();
        if (r.data.late) { setErr(null); setInfo(r.data.late); return; }
      } catch { /* can't ask: send as before */ } finally { setBusy(false); }
    }
    await run(false);
  };
  const schedule = async (iso: string) => {
    const fn = ref.current.schedule;
    if (!fn) return;
    setBusy(true); setErr(null);
    try {
      const chk = await personalSched.check(iso).catch(() => null);
      if (chk?.data.atProblem) { setErr(chk.data.atProblem); return; }
      await fn(iso);
      setInfo(null);
      ref.current.onScheduled?.(whenLabel(iso));
    } catch (e: any) {
      setErr(e?.message || "Couldn't schedule it. Please try again.");
    } finally { setBusy(false); }
  };
  const prompt = info ? (
    <NightPrompt info={info} schedulable={!!o.schedule} busy={busy} err={err}
                 onSendNow={() => { void run(true); }} onSchedule={(iso) => { void schedule(iso); }}
                 onCancel={() => { setInfo(null); setErr(null); }} />
  ) : null;
  return { start, busy, prompt, open: !!info };
}

/** One scheduled personal text: "⏰ Scheduled for 8:00 AM" + Send now + Cancel. */
function ScheduledLine({ row, onChanged, showWho }: { row: ScheduledRow; onChanged: () => void; showWho?: boolean }) {
  const [note, setNote] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const p = row.personal;
  const now = useNightSend({
    send: (c) => personalSched.sendNow(row.id, c),
    onSent: () => onChanged(),
    onError: (e) => { setNote(`⚠️ ${e?.message || 'Not sent'}`); onChanged(); },
  });
  const cancel = async () => {
    setCancelling(true); setNote(null);
    try { await personalSched.cancel(row.id); onChanged(); }
    catch (e: any) { setNote(`⚠️ ${e?.message || "Couldn't cancel"}`); onChanged(); }
    finally { setCancelling(false); }
  };
  const what = p?.kind === 'ask' ? 'Ask' : p?.kind === 'wa' ? 'WhatsApp' : 'Text';
  return (
    <div data-scheduled-text={row.id} className="rounded-[10px] border border-sky/40 bg-sky-soft/50 px-2.5 py-1.5 text-[12.5px]">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-bold text-sky-deep">⏰ Scheduled for {whenLabel(row.send_at)}</span>
        <span className="text-muted">{what}{showWho && p?.name ? ` to ${p.name}` : ''}{row.by_name ? ` · by ${row.by_name}` : ''}</span>
        <span className="ml-auto flex gap-1.5">
          <button type="button" data-scheduled-send={row.id} disabled={now.busy || cancelling} onClick={() => { setNote(null); void now.start(); }}
                  className="haptic rounded-[8px] bg-forest px-2.5 py-1 text-[12px] font-bold text-paper disabled:opacity-50">{now.busy ? 'Sending…' : 'Send now'}</button>
          <button type="button" data-scheduled-cancel={row.id} disabled={now.busy || cancelling} onClick={() => { void cancel(); }}
                  className="haptic rounded-[8px] border border-clay/60 bg-paper px-2.5 py-1 text-[12px] font-bold text-clay disabled:opacity-50">{cancelling ? '…' : 'Cancel'}</button>
        </span>
      </div>
      {p?.text && <div className="mt-0.5 whitespace-pre-wrap text-ink">“{p.text}”</div>}
      {note && <div className="mt-0.5 font-semibold text-clay">{note}</div>}
      {now.prompt}
    </div>
  );
}

/** The scheduled personal texts of one conversation (a driver / phone, a problem report or a pickup). */
export function ScheduledTexts({ filter, showWho, className }: { filter: ScheduledFilter; showWho?: boolean; className?: string }) {
  const qc = useQueryClient();
  const enabled = !!filter.phone || filter.volunteerId != null || filter.reportId != null || filter.pickupId != null;
  const key = ['personal-scheduled', filter.phone ?? null, filter.volunteerId ?? null, filter.reportId ?? null, filter.pickupId ?? null];
  const q = useQuery({ queryKey: key, enabled, queryFn: () => personalSched.list(filter), refetchInterval: 60_000, staleTime: 15_000 });
  const rows = q.data?.data ?? [];
  if (!rows.length) return null;
  const changed = () => {
    qc.invalidateQueries({ queryKey: ['personal-scheduled'] });
    qc.invalidateQueries({ queryKey: ['sms-scheduled'] });
    for (const k of ['sms-convo', 'sms-thread', 'sms-threads', 'wa-thread', 'not-checked-in']) qc.invalidateQueries({ queryKey: [k] });
  };
  return (
    <div data-scheduled-texts className={`space-y-1 ${className ?? ''}`}>
      {rows.map((r) => <ScheduledLine key={r.id} row={r} onChanged={changed} showWho={showWho} />)}
    </div>
  );
}

/** After scheduling: refresh the lists that show it. */
export function refreshScheduled(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['personal-scheduled'] });
  qc.invalidateQueries({ queryKey: ['sms-scheduled'] });
}

/** Messaging → Upcoming / the SMS composer list: one scheduled text (personal or group). */
export function OfficeScheduledRow({ s, onCancelGroup, onChanged }: { s: any; onCancelGroup: (id: number) => void; onChanged: () => void }) {
  if (s?.personal) return <ScheduledLine row={s as ScheduledRow} onChanged={onChanged} showWho />;
  return (
    <div className="flex items-center gap-2 text-[12px]">
      <span className="whitespace-nowrap font-bold text-forest">{whenLabel(s.send_at)}</span>
      <span className="min-w-0 flex-1 truncate text-ink">{s.body}</span>
      <button onClick={() => onCancelGroup(Number(s.id))} className="haptic rounded px-2 py-0.5 text-[11px] font-bold text-clay hover:bg-clay/10">Cancel</button>
    </div>
  );
}

/** Messaging → Upcoming: every scheduled text (personal ones with Send now / Cancel). */
export function OfficeScheduledList() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['sms-scheduled'], queryFn: () => api<{ data: any[] }>('/api/sms/scheduled'), refetchInterval: 30_000, retry: false });
  const rows = q.data?.data ?? [];
  if (!rows.length) return null;
  const changed = () => { qc.invalidateQueries({ queryKey: ['sms-scheduled'] }); qc.invalidateQueries({ queryKey: ['personal-scheduled'] }); };
  const cancelGroup = async (id: number) => {
    if (!(await uiConfirm("Cancel this scheduled text?\n\nIt won't go out."))) return;
    try { await api(`/api/sms/scheduled/${id}`, { method: 'DELETE' }); } catch { /* already gone */ }
    changed();
  };
  return (
    <div data-office-scheduled className="space-y-2 rounded-[14px] border border-line bg-paper p-3">
      <div className="text-[11px] font-extrabold uppercase tracking-[.05em] text-muted">Scheduled texts</div>
      {rows.map((s) => <OfficeScheduledRow key={s.id} s={s} onChanged={changed} onCancelGroup={(id) => { void cancelGroup(id); }} />)}
    </div>
  );
}