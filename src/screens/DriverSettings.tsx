/**
 * Oct 14 client: "The volunteer should have a Settings option." One screen,
 * plain words, for everything about how we reach the driver:
 *   - How should we reach you about pickups? Oct 28 client: three ticks — 📱 App notifications,
 *     🟢 WhatsApp, 💬 Text message — any mix, or none (warned first; was Text / WhatsApp / Both / App only / Nothing)
 *   - Pause (for today / a week / until I turn it back on / Oct 14: until a date)
 *   - Quiet times (texting hours shown first), quiet days, away dates
 *   - Phone calls (Oct 14: Anytime / Only at these times / Please don't call — the same
 *     question and the same on-call hours as My application)
 *   - Steady pickup reminders on/off, "Allow text messages at all"
 *   - Text commands
 * Reached from the ☰ menu, My profile, and the Home status line ("Change").
 * API: GET/PUT /api/me/settings; on-call hours: /api/me/on-call (unchanged).
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, X } from 'lucide-react';
import { api, driverSettings, type DriverSettings as Settings } from '../api';
import { DateInput, FadeUp, cx, setUnsavedGuard, confirmLeaveIfUnsaved } from '../design';
import { ANYTIME_SLOTS, CALL_QUESTION, CallWhenPicker, OnCallHoursEditor, callAnswerOf, type CallWhen } from '../on-call';
import { TextCommandsCard } from '../text-commands-card';
import { uiConfirm, uiNotify } from '../ui-dialogs';
import { driverError } from './driver-card';
import { LoadError } from './VolunteerHome';
import { AlertTicks, PauseSheet, PausedBox, alertsOf, useDriverSettings, usePause } from '../driver-settings';
import { QuietDaysPicker, liveTexting } from '../quiet-days-picker'; // Oct 14 client: days for each quiet time
import { normDays } from '../quiet-days';
import { askAwaySteady } from '../away-steady'; // Nov 6 client: away → give steady pickups to another driver?
import { PasswordOfferCard } from '../phone-sign-in'; // Oct 28 client: after a text-code sign-in
import { HelpsWithLine } from '../person-roles'; // Oct 29 client: roles

const ME_ON_CALL = '/api/me/on-call';

const inputCls = 'w-full rounded-[12px] border-[1.4px] border-line bg-paper px-3.5 py-3 text-[16px] outline-none focus:border-forest';
const timeCls = 'w-full min-w-0 rounded-[12px] border-[1.4px] border-line bg-paper px-2 py-3 text-[16px] outline-none focus:border-forest';
const DOW_LABELS =['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']; // bit 0 = Sunday (same as the server)
type Win = { start: string; end: string; days: number }; // Oct 14 client: + days (bit 0 = Sunday)

export function DriverSettings() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const q = useDriverSettings();
  const s = q.data?.data;
  const pause = usePause(s);
  const [pauseOpen, setPauseOpen] = useState(false);

  const save = useMutation({
    mutationFn: (body: Parameters<typeof driverSettings.save>[0]) => driverSettings.save(body),
    onSuccess: (r) => { qc.setQueryData(['me-settings'], r); qc.invalidateQueries({ queryKey: ['volunteer-self'] }); },
    onError: (e) => uiNotify(driverError(e, "Couldn't save, try again."), 'err'),
  });

  // Quiet times / quiet days / away: edited together, one Save.
  const [wins, setWins] = useState<Win[] | null>(null);
  const [days, setDays] = useState(0);
  const [awayFrom, setAwayFrom] = useState('');
  const [awayUntil, setAwayUntil] = useState('');
  const [base, setBase] = useState<string | null>(null);
  const [onCallDirty, setOnCallDirty] = useState(false);
  function loadFrom(x: Settings) {
    const w = x.quietWindows.map((q) => ({ start: q.start.slice(0, 5), end: q.end.slice(0, 5), days: normDays(q.days) }));
    const f = (x.vacationFrom ?? '').slice(0, 10), u = (x.vacationUntil ?? '').slice(0, 10);
    setWins(w); setDays(x.quietDays); setAwayFrom(f); setAwayUntil(u); setBase(JSON.stringify([w, x.quietDays, f, u]));
  }
  const quietDirty = base !== null && JSON.stringify([wins, days, awayFrom, awayUntil]) !== base;
  // Fresh server values show unless the driver is in the middle of an edit.
  useEffect(() => { if (s && !quietDirty) loadFrom(s); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [s]);
  const quietBad = (wins ?? []).some((w) => !w.start || !w.end || w.start === w.end);
  useEffect(() => { setUnsavedGuard(quietDirty || onCallDirty); }, [quietDirty, onCallDirty]);
  useEffect(() => () => setUnsavedGuard(false), []);

  function saveQuiet() {
    const awayChanged = !!s && (awayFrom !== (s.vacationFrom ?? '').slice(0, 10) || awayUntil !== (s.vacationUntil ?? '').slice(0, 10));
    save.mutate({ quietWindows: wins ?? [], quietDays: days, vacationFrom: awayFrom || null, vacationUntil: awayUntil || null },
      { onSuccess: (r) => {
        loadFrom(r.data); uiNotify('Saved.', 'ok');
        if (awayChanged) void askAwaySteady(qc); // Nov 6 client: steady pickups on the Away days?
      } });
  }
  // Oct 14 client: phone calls — Anytime / Only at these times / Please don't call, read from
  // and saved to the on-call hours (same list as My application and the office).
  const callsQ = useQuery({ queryKey: ['on-call', ME_ON_CALL], queryFn: () => api<{ data: Array<{ day: string; start: string; end: string; note?: string | null }>; callWhen?: string }>(ME_ON_CALL) });
  // Oct 14 client: never answered → nothing picked + "Not answered yet" (was "Please don't call").
  const callAns = callsQ.data ? callAnswerOf(callsQ.data.callWhen, callsQ.data.data) : null;
  const callSaved: CallWhen | null = callAns === 'unanswered' ? null : callAns;
  const [pickTimes, setPickTimes] = useState(false);
  const callShown: CallWhen | null = pickTimes ? 'times' : callSaved;
  const setCalls = useMutation({
    // Oct 14 client: + callWhen — the API remembers the pick (so "Please don't call" is a real answer).
    mutationFn: (body: { slots: Array<{ day: string; start: string; end: string }>; callWhen: CallWhen }) =>
      api<{ data: Array<{ day: string; start: string; end: string; note?: string | null }>; callWhen?: string }>(ME_ON_CALL, { method: 'PUT', body: JSON.stringify(body) }),
    onSuccess: (r) => {
      qc.setQueryData(['on-call', ME_ON_CALL], r);
      qc.invalidateQueries({ queryKey: ['on-call-now'] });
      qc.invalidateQueries({ queryKey: ['me-application'] });
    },
    onError: (e) => uiNotify(driverError(e, "Couldn't save, try again."), 'err'),
  });
  async function pickCalls(v: CallWhen) {
    if (v === 'times') { setPickTimes(true); return; }
    if (onCallDirty && !(await uiConfirm('Your call hours are not saved yet. Drop them?', { okLabel: 'Yes, drop them', cancelLabel: 'No' }))) return;
    setPickTimes(false); setOnCallDirty(false);
    if (v === callSaved) return;
    if (v === 'never' && !(await uiConfirm("No phone calls about pickups?\n\nWe will remove your call hours.", { okLabel: "Yes, don't call", cancelLabel: 'No' }))) return;
    setCalls.mutate({ slots: v === 'anytime' ? ANYTIME_SLOTS : [], callWhen: v }, {
      onSuccess: () => uiNotify(v === 'anytime' ? 'Saved. We may call you anytime.' : "Saved. We won't call you.", 'ok'),
    });
  }
  const backHome = async () => { if (await confirmLeaveIfUnsaved()) { if (window.history.length <= 1) nav('/', { replace: true }); else nav(-1); } };

  return (
    <div className="min-h-screen pb-[80px]">
      <div className="flex items-center gap-3 px-5 py-3">
        <button onClick={() => void backHome()} aria-label="Back"
                className="haptic grid h-[44px] w-[44px] place-items-center rounded-full bg-paper border border-line">
          <ArrowLeft size={20} />
        </button>
        <div className="font-display font-semibold text-[20px]">Settings</div>
      </div>
      <main className="px-5">
        {q.isLoading ? <p className="text-muted text-center py-10">Loading…</p>
          : !s ? <LoadError onRetry={() => q.refetch()} busy={q.isFetching} error={q.error} what="your settings" />
          : (
          <FadeUp>
            {/* Oct 28 client: after a text-code sign-in — optional "Want a password too? Set one". */}
            <PasswordOfferCard />
            {/* Oct 29 client: read-only "You help with: On the fly, Steady" (the office sets it). */}
            <HelpsWithLine />
            {/* 1. How we reach you */}
            <Card title="How should we reach you about pickups?">
              {/* Oct 28 client: tick one, two, all three — or none (warned first). */}
              <div className="text-[14px] text-muted leading-snug">Tick one, two or all three.</div>
              <AlertTicks s={s} />
              {alertsOf(s).whatsapp && (
                <Note>
                  WhatsApp is new — we are still testing it.{!s.waConfirm && !s.whatsappReady && ' To start getting WhatsApp messages, send us one WhatsApp message first.'}
                  {!alertsOf(s).text && " If WhatsApp doesn't reach you, you get the message as a text instead."}
                </Note>
              )}
              {/* Oct 30 client: confirm WhatsApp — not confirmed yet: one tap opens WhatsApp with "Hi Zeh L'Zeh" ready to send. */}
              {alertsOf(s).whatsapp && s.waConfirm?.chose && !s.waConfirm.confirmed && (
                <div data-wa-confirm-note className="mt-2 rounded-[12px] border border-forest/40 bg-sage/40 px-3.5 py-3">
                  <div className="text-[16px] font-bold text-ink leading-snug">Tap to turn on WhatsApp: open WhatsApp and say hi to us</div>
                  <div className="mt-0.5 text-[14px] text-muted leading-snug">Then press Send. Until then we'll keep texting you.</div>
                  <a href={s.waConfirm.link} target="_blank" rel="noopener noreferrer"
                     className="haptic mt-2 flex min-h-[48px] items-center justify-center gap-2 rounded-[12px] bg-forest px-4 text-[16px] font-bold text-paper">
                    🟢 Open WhatsApp and say hi
                  </a>
                </div>
              )}
              {!s.smsOptIn && (
                <Note warn>All texts are off for you (STOP). Tap "Turn texts back on" below to get texts again.</Note>
              )}
              <div className="mt-2 text-[14px] text-muted leading-snug">Messages about pickups you already took (changes, cancellations) still come by text.</div>
              {/* Oct 29 client: "things later on are being repeated" — the old "Allow text messages" switch moved here as one small line. */}
              {s.smsOptIn ? (
                <button type="button" disabled={save.isPending}
                        onClick={async () => { if (await uiConfirm('Turn off ALL text messages?\n\nYou will not get texts even about pickups you took.', { okLabel: 'Turn off', cancelLabel: 'Keep on' })) save.mutate({ smsOptIn: false }); }}
                        className="haptic mt-1 min-h-[40px] text-left text-[14px] font-bold text-clay underline underline-offset-2 disabled:opacity-60">Stop all texts, even about pickups I took</button>
              ) : (
                <button type="button" disabled={save.isPending} onClick={() => save.mutate({ smsOptIn: true })}
                        className="haptic mt-1 min-h-[44px] rounded-[10px] border border-forest bg-sage px-3.5 text-[15px] font-bold text-forest disabled:opacity-60">Turn texts back on</button>
              )}
            </Card>

            {/* 2. Pause — Nov 2 client: no big Pause up top ("the first thing they see, they think: why not?").
                Only while paused it shows here (with Resume); otherwise a small link at the bottom of Settings. */}
            {pause.paused && (
              <Card title="Paused">
                <PausedBox pause={pause} />
              </Card>
            )}

            {/* 3. Quiet times */}
            <Card title="Quiet times">
              {/* Oct 14 client: follows what is on screen (before Save); saved = the server's line. */}
              {(() => {
                const t = quietDirty ? liveTexting(wins ?? [], days, awayFrom, awayUntil) : s.texting;
                return (
                  <div data-texting-line className="rounded-[12px] bg-cream/70 border border-line px-3.5 py-2.5 text-[15px] leading-snug">
                    <div className="font-bold text-ink">{t.texting}</div>
                    {t.quiet && <div className="text-ink/80">{t.quiet}</div>}
                    {t.days && <div className="text-ink/80">🗓 {t.days}</div>}
                    {t.away && <div className="text-ink/80">✈️ {t.away}</div>}
                    {quietDirty && <div className="mt-0.5 text-[13px] font-bold text-clay">Not saved yet</div>}
                  </div>
                );
              })()}
              <SubLabel>Quiet hours <span className="font-normal">— no pickup messages during these hours</span></SubLabel>
              <div className="space-y-2">
                {(wins ?? []).length === 0 && <div className="text-[15px] text-muted italic">No quiet hours.</div>}
                {(wins ?? []).map((w, i) => (
                  <div key={i} data-quiet-row>
                  {/* Fits a 390px phone: two times, "to", and a round × (was cut off). */}
                  <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] items-center gap-1.5">
                    <input type="time" aria-label="Quiet from" value={w.start} onChange={(e) => setWins((wins ?? []).map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))} className={timeCls} />
                    <span className="text-[14px] text-muted">to</span>
                    <input type="time" aria-label="Quiet until" value={w.end} onChange={(e) => setWins((wins ?? []).map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))} className={timeCls} />
                    <button type="button" onClick={() => setWins((wins ?? []).filter((_, j) => j !== i))} aria-label="Remove these quiet hours"
                            className="haptic grid h-[44px] w-[44px] place-items-center rounded-full border border-clay/40 text-clay"><X size={18} /></button>
                  </div>
                  {/* Oct 14 client: which days these quiet hours are on. */}
                  <QuietDaysPicker big value={w.days} onChange={(d) => setWins((wins ?? []).map((x, j) => (j === i ? { ...x, days: d } : x)))} />
                  </div>
                ))}
                {(wins ?? []).length < 6 && (
                  <button type="button" onClick={() => setWins([...(wins ?? []), (wins ?? []).length === 0 ? { start: '22:00', end: '07:00', days: 127 } : { start: '13:00', end: '15:00', days: 127 }])}
                          className="haptic min-h-[44px] rounded-[10px] border border-forest/40 px-3.5 text-[15px] font-bold text-forest">+ Add quiet hours</button>
                )}
                {quietBad && <div className="text-[14px] font-bold text-clay">Pick a start and an end time (they can't be the same).</div>}
              </div>
              <SubLabel>Quiet days <span className="font-normal">— tap a day to get no pickup messages that day</span></SubLabel>
              <div className="flex flex-wrap gap-2">
                {DOW_LABELS.map((label, idx) => {
                  const on = (days & (1 << idx)) !== 0;
                  return (
                    <button key={label} type="button" onClick={() => setDays(days ^ (1 << idx))} aria-pressed={on}
                            className={cx('haptic min-h-[44px] min-w-[52px] px-3.5 rounded-[10px] border-[1.4px] text-[15px] font-bold', on ? 'border-forest bg-sage/50 text-forest' : 'border-line bg-paper text-ink')}>
                      {label}
                    </button>
                  );
                })}
              </div>
              <SubLabel>Away <span className="font-normal">— no pickup messages between these dates</span></SubLabel>
              <div className="grid grid-cols-2 gap-3">
                <label className="block"><div className="text-[14px] font-bold text-muted mb-1">From</div>
                  <DateInput value={awayFrom} onChange={setAwayFrom} className={inputCls} /></label>
                <label className="block"><div className="text-[14px] font-bold text-muted mb-1">Until</div>
                  <DateInput value={awayUntil} onChange={setAwayUntil} className={inputCls} /></label>
              </div>
              {(awayFrom || awayUntil) && (
                <button type="button" onClick={() => { setAwayFrom(''); setAwayUntil(''); }} className="haptic mt-1 min-h-[44px] text-[15px] font-bold text-clay">Clear away dates</button>
              )}
              {quietDirty && (
                <div className="mt-3 flex items-center gap-3 rounded-[12px] border border-line bg-paper px-3 py-2">
                  <span className="flex-1 text-[15px] font-bold text-ink">Not saved yet</span>
                  <button onClick={() => loadFrom(s)}
                          className="haptic min-h-[44px] px-3 text-[15px] font-bold text-muted">Undo</button>
                  <button onClick={saveQuiet} disabled={save.isPending || quietBad}
                          className="haptic min-h-[44px] px-5 rounded-[12px] bg-forest text-paper text-[16px] font-bold disabled:opacity-50">{save.isPending ? 'Saving…' : 'Save'}</button>
                </div>
              )}
            </Card>

            {/* 4. Phone calls — Oct 14 client: the same question as the application, the same hours. */}
            <Card title="Phone calls">
              <div className="text-[16px] font-bold text-ink leading-snug">{CALL_QUESTION}</div>
              {!callsQ.data ? <div className="text-[14px] text-muted">Loading…</div> : (
                <>
                  {callAns === 'unanswered' && !callShown && <div className="text-[14px] text-muted italic">Not answered yet.</div>}
                  <CallWhenPicker value={callShown ?? undefined} onChange={(v) => void pickCalls(v)} disabled={setCalls.isPending} name="settings" />
                  {callShown === 'times' && (
                    <div className="pt-2">
                      <OnCallHoursEditor key={callSaved === 'times' ? 'saved' : 'new'} endpoint={ME_ON_CALL} title="" who="you are" big onDirty={setOnCallDirty}
                                         startRows={callSaved === 'times' ? undefined : [{ day: 'weekdays', start: '09:00', end: '17:00', note: '' }]}
                                         onSaved={() => setPickTimes(false)} />
                    </div>
                  )}
                  {callShown === 'anytime' && <div className="text-[14px] text-muted leading-snug">The office may call you any day, any hour, when a pickup needs a driver.</div>}
                  {callShown === 'never' && <div className="text-[14px] text-muted leading-snug">We won't call you about pickups.</div>}
                </>
              )}
            </Card>

            {/* 5. Steady reminders (Oct 29 client: "Allow text messages" moved up into "How should we reach you") */}
            <Card title="Other messages">
              <Toggle on={s.steadyReminders} disabled={save.isPending}
                      label="Steady pickup reminders"
                      sub={s.steadyReminders ? 'On — a text before each steady pickup you do.' : 'Off — no reminder before steady pickups.'}
                      onChange={(on) => save.mutate({ steadyReminders: on })} />
            </Card>

            <TextCommandsCard />

            {/* Nov 2 client: Pause is a quiet link at the very bottom, not a big button. */}
            {!pause.paused && (
              <button type="button" onClick={() => setPauseOpen(true)} disabled={pause.busy}
                      className="haptic mt-6 block w-full text-center text-[13px] text-muted underline underline-offset-2 disabled:opacity-60">
                Need a break? Pause pickup messages
              </button>
            )}

            {/* Nov 3 Yakov: no "My application" / "My profile" rows at the bottom. */}
          </FadeUp>
        )}
      </main>
      {pauseOpen && <PauseSheet onPick={pause.pauseFor} onClose={() => setPauseOpen(false)} busy={pause.busy} />}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5">
      <div className="text-[13px] font-extrabold uppercase tracking-[.06em] text-forest mb-2">{title}</div>
      <div className="rounded-[16px] border border-line bg-paper px-4 py-3.5 space-y-2">{children}</div>
    </section>
  );
}
function SubLabel({ children }: { children: React.ReactNode }) {
  return <div className="pt-2 text-[15px] font-bold text-ink">{children}</div>;
}
function Note({ children, warn }: { children: React.ReactNode; warn?: boolean }) {
  return <div className={cx('mt-2 rounded-[12px] px-3.5 py-2.5 text-[15px] leading-snug', warn ? 'bg-clay/10 border border-clay/30 text-clay font-bold' : 'bg-amber-soft border border-amber/40 text-ink')}>{children}</div>;
}
function Toggle({ on, label, sub, onChange, disabled }: { on: boolean; label: string; sub: string; onChange: (on: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} disabled={disabled} onClick={() => onChange(!on)}
            className="haptic w-full flex items-center gap-3 text-left min-h-[56px] py-1 disabled:opacity-60">
      <span className="flex-1 min-w-0">
        <span className="block text-[16px] font-bold text-ink">{label}</span>
        <span className="block text-[14px] text-muted leading-snug">{sub}</span>
      </span>
      <span className={cx('relative inline-block w-12 h-7 rounded-full transition-colors shrink-0', on ? 'bg-forest' : 'bg-line')}>
        <span className={cx('absolute top-[3px] h-[22px] w-[22px] rounded-full bg-paper shadow-sm transition-all', on ? 'right-[3px]' : 'left-[3px]')} />
      </span>
    </button>
  );
}

