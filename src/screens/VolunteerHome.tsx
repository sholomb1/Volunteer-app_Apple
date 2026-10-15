/**
 * Volunteer Home — Oct 6 client redesign: your pickups today first (Navigate /
 * Call), then what's open now with a Take button, then one line for later &
 * tomorrow. The fake map, colored count boxes and 24-hour recap are gone;
 * location sharing moved to My profile.
 * Oct 14 client: the "Getting pickup texts" switch was misleading — now a short
 * status line with the real setting ("📩 Pickups by: Text · Quiet 10 PM–7 AM",
 * "Pickups by: WhatsApp", "Paused until Sun, Oct 19"), a quick Pause / Resume,
 * and Change → Settings. Open = the driver queue (pickups open 2 hours before
 * their time), so there is no "Later & tomorrow" line any more; the driver's
 * own upcoming pickups are under Coming up.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, MapPin } from 'lucide-react';
import { volunteer, centerHelp, CENTER_HELP_TASK_LABELS, FILTER_BLOCKED_TEXT, type CenterHelpInstance, type AuthUser, type MyPickup } from '../api';
import { AppBar, Avatar, FadeUp, Skeleton, cx } from '../design';
import { useLocationReporting, getTrackingEnabled, setTrackingEnabled } from '../location-reporter';
import { nyToday } from '../time-format';
import { DriverCard, useTakePickup, fmtWhenLine, storeName } from './driver-card';
import { uiConfirm } from '../ui-dialogs';
import { PauseSheet, PausedBox, REACH_SHORT, quietShort, useDriverSettings, usePause } from '../driver-settings'; // Oct 14 client

const DONE = new Set(['completed', 'delivered', 'cancelled', 'missed']);
// Oct 9 client: same "finished" rule as the Mine tab — the pickup is over, or
// this driver's part of it is done.
const isMineDone = (p: MyPickup) => DONE.has(p.status) || p.assignment_status === 'completed';
const shiftDay = (iso: string, n: number) => new Date(Date.parse(iso + 'T12:00:00Z') + n * 86400e3).toISOString().slice(0, 10);

export function VolunteerHome({ user }: { user: AuthUser }) {
  const nav = useNavigate();
  const open = useQuery({ queryKey: ['open'], queryFn: volunteer.open, refetchInterval: 15_000, refetchOnWindowFocus: true, staleTime: 5_000 });
  const mine = useQuery({ queryKey: ['mine'], queryFn: volunteer.mine, refetchOnWindowFocus: true, staleTime: 5_000 });
  const { take, busy } = useTakePickup();

  const today = nyToday();
  const initials  = (user.firstName?.[0] ?? '') + (user.lastName?.[0] ?? '');
  const firstName = user.firstName || 'friend';

  // Your pickups: anything you have that isn't finished, up to today (incl. last night's).
  const myOpen = (mine.data?.data ?? [])
    .filter((p: MyPickup) => !isMineDone(p))
    .sort((a, b) => (`${a.scheduled_date}${a.scheduled_time}` < `${b.scheduled_date}${b.scheduled_time}` ? -1 : 1));
  const myToday = myOpen.filter((p) => String(p.scheduled_date).slice(0, 10) <= today);
  // Oct 9 client: "Coming up" — your own pickups in the next 3 days (max 3).
  const comingUp = myOpen
    .filter((p) => { const d = String(p.scheduled_date).slice(0, 10); return d > today && d <= shiftDay(today, 3); })
    .slice(0, 3);
  // Oct 14 client: the Open list is the driver queue (a pickup opens 2 hours before its
  // time, late / reposted ones stay), so everything in it is "open now" — no Later line.
  const openNow = open.data?.data ?? [];
  const loadFailed = (open.isError && !open.data) || (mine.isError && !mine.data);

  // Oct 14 client: status line = the driver's real setting (Settings screen), with Pause.
  const settings = useDriverSettings();
  const st = settings.data?.data;
  const pause = usePause(st);
  const [pauseOpen, setPauseOpen] = useState(false);
  const quiet = quietShort(st);
  const statusLine = !st ? ''
    : pause.paused ? `⏸ ${pause.pausedLine}`
    : st.channel === 'none' ? '🔕 No pickup messages'
    : st.channel === 'app' ? '🔔 Pickups by: App only'
    : !st.smsOptIn && st.channel === 'text' ? '📩 Texts are turned off'
    : `📩 Pickups by: ${REACH_SHORT[st.channel]}${quiet ? ` · Quiet ${quiet}` : ''}`;

  return (
    <div className="min-h-screen pb-[80px]">
      <AppBar title="Zeh L'Zeh" right={<Avatar initials={initials} />} />
      <main className="px-5">
        <FadeUp>
          <div className="font-display font-semibold text-[24px] leading-tight">Shalom, {firstName}</div>
          {/* Oct 14 client: what really happens (Settings), not a misleading switch. */}
          {/* Oct 14 client: paused → what it means ("No pickup messages until …") + Resume now. */}
          {st && pause.paused && (
            <div data-home-status className="mt-2"><PausedBox pause={pause} onChange={() => nav('/settings')} /></div>
          )}
          {st && !pause.paused && (
            <div data-home-status className="mt-2 flex items-center gap-1.5 rounded-[14px] border border-line bg-paper pl-3.5 pr-1.5 py-1">
              <span className="flex-1 min-w-0 text-[15px] font-bold text-ink/85 leading-snug py-1.5">{statusLine}</span>
              {st.channel !== 'none' && (
                <button onClick={() => setPauseOpen(true)} disabled={pause.busy}
                        className="haptic shrink-0 min-h-[44px] px-3 rounded-[10px] border border-forest/40 bg-sage text-forest text-[15px] font-bold disabled:opacity-60">Pause</button>
              )}
              <button onClick={() => nav('/settings')}
                      className="haptic shrink-0 min-h-[44px] px-2.5 text-[15px] font-bold text-forest underline underline-offset-2">Change</button>
            </div>
          )}
        </FadeUp>

        {/* Oct 9 client: pause sheet — "for how long?" (Oct 14: shared with Settings) */}
        {pauseOpen && <PauseSheet onPick={pause.pauseFor} onClose={() => setPauseOpen(false)} busy={pause.busy} />}

        {/* Your pickups */}
        {myToday.length > 0 && (
          <FadeUp delay={0.04}>
            <SectionTitle>Your pickups</SectionTitle>
            <div className="space-y-2.5">
              {myToday.map((p) => (
                <DriverCard key={p.assignment_id ?? p.pickup_instance_id} p={p} mine onOpen={() => nav(`/pickup/mine/${p.pickup_instance_id}`)} />
              ))}
            </div>
          </FadeUp>
        )}

        {/* Oct 9 client: Coming up — your own pickups tomorrow and the next few days. */}
        {comingUp.length > 0 && (
          <FadeUp delay={0.06}>
            <SectionTitle>Coming up</SectionTitle>
            <div className="rounded-[16px] border border-line bg-paper divide-y divide-line overflow-hidden">
              {comingUp.map((p) => (
                <button key={p.assignment_id ?? p.pickup_instance_id} onClick={() => nav(`/pickup/mine/${p.pickup_instance_id}`)}
                        className="haptic w-full min-h-[48px] flex items-center justify-between gap-3 px-4 py-2.5 text-left">
                  <span className="min-w-0 text-[15px]">
                    <span className="font-bold text-forest">{fmtWhenLine(p.scheduled_date, p.scheduled_time).replace(' · ', ' ')}</span>
                    <span className="text-ink/80"> — {storeName(p)}</span>
                  </span>
                  <ArrowRight size={16} className="shrink-0 text-muted" />
                </button>
              ))}
            </div>
          </FadeUp>
        )}

        {/* Open now */}
        <FadeUp delay={0.08}>
          <SectionTitle>
            {open.isLoading ? 'Open now' : openNow.length === 0 ? 'Open now' : `Open now · ${openNow.length} need${openNow.length === 1 ? 's' : ''} a driver`}
          </SectionTitle>
          {open.isLoading ? (
            <div className="space-y-2.5">{[0, 1].map((i) => <Skeleton key={i} className="h-28 rounded-[16px]" />)}</div>
          ) : loadFailed ? (
            // Oct 9 client: no signal is not "nothing open".
            <LoadError onRetry={() => { open.refetch(); mine.refetch(); }} busy={open.isFetching || mine.isFetching} error={(open.isError && !open.data ? open.error : null) ?? mine.error} what="pickups" />
          ) : openNow.length === 0 ? (
            <div className="rounded-[16px] border border-line bg-paper px-4 py-6 text-center text-[13.5px] text-muted">
              Nothing open right now. We'll text you when something comes in.
            </div>
          ) : (
            <div className="space-y-2.5">
              {openNow.map((p) => (
                <DriverCard key={p.pickup_instance_id} p={p} busy={busy}
                            onOpen={() => nav(`/pickup/open/${p.pickup_instance_id}`)} onTake={() => take(p)} />
              ))}
            </div>
          )}
        </FadeUp>

        <FadeUp delay={0.12}>
          <CenterHelpSectionForVolunteer />
        </FadeUp>
      </main>
    </div>
  );
}

// Oct 14 client: the API's 404 "no volunteer profile (linked to this login)" = this login has
// no driver record. Only THAT may say "not connected"; any other failure says what went wrong.
export const NOT_LINKED_TEXT = "Your login isn't connected to your volunteer profile yet. Please call the office.";
export function isNotLinked(err: unknown): boolean {
  const e = err as { status?: number; message?: string; body?: { error?: string } } | null | undefined;
  return e?.status === 404 && /no volunteer profile/i.test(`${e?.body?.error ?? ''} ${e?.message ?? ''}`);
}

/** Oct 9 client: shown when a load fails — never "Nothing open".
 *  Oct 14 client: pass `error` to say the real reason (no signal / internet filter / not connected / server message). */
export function LoadError({ onRetry, busy, error, what }: { onRetry: () => void; busy?: boolean; error?: unknown; what?: string }) {
  const e = error as (Error & { status?: number; filterBlocked?: boolean }) | null | undefined;
  const msg = String(e?.message ?? '').trim();
  const notLinked = isNotLinked(e);
  const noSignal = !e || e.status === 0 || e instanceof TypeError || /failed to fetch|load failed|network|can't reach the server/i.test(msg);
  const text = notLinked ? NOT_LINKED_TEXT
    : e?.filterBlocked ? FILTER_BLOCKED_TEXT
    : noSignal ? "Can't connect — check your signal."
    : `Couldn't load ${what ?? 'this'} — ${(msg || 'something went wrong').replace(/\.$/, '')}.`;
  return (
    <div className="rounded-[16px] border border-line bg-paper px-4 py-6 text-center mt-3">
      <div className="text-[16px] font-bold text-ink">{text}</div>
      {!notLinked && (
        <button onClick={onRetry} disabled={busy}
                className="haptic mt-3 w-full min-h-[52px] rounded-[14px] bg-forest text-paper text-[17px] font-bold disabled:opacity-60">
          {busy ? 'Trying…' : 'Try again'}
        </button>
      )}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="text-[14px] font-extrabold uppercase tracking-[.05em] text-muted mt-5 mb-2">{children}</div>;
}

/** Oct 6: "Share your location" moved here from Home — shown on My profile. */
export function LocationShareCard() {
  const [tracking, setTracking] = useState<boolean>(() => getTrackingEnabled());
  useEffect(() => {
    const onChange = (e: Event) => setTracking((e as CustomEvent).detail?.enabled === true);
    window.addEventListener('vp:tracking-changed', onChange as any);
    return () => window.removeEventListener('vp:tracking-changed', onChange as any);
  }, []);
  const status = useLocationReporting(tracking);
  function toggle() { const next = !tracking; setTrackingEnabled(next); setTracking(next); }
  return (
    <button onClick={toggle}
            className={cx('haptic w-full mt-3 rounded-[14px] border px-4 py-3 flex items-center gap-3 text-left',
                          tracking ? 'bg-sage border-sage-line' : 'bg-paper border-line')}>
      <span className={cx('grid h-9 w-9 place-items-center rounded-full shrink-0', tracking ? 'bg-forest text-paper' : 'bg-cream text-muted')}>
        <MapPin size={17} />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block font-bold text-[14px]">{tracking ? 'Sharing your location' : 'Share your location'}</span>
        <span className={cx('block text-[13px]', status.lastError ? 'text-clay' : 'text-muted')}>
          {status.lastError ? `Problem: ${status.lastError}` : tracking ? 'The office sees you on the map while the app is open.' : 'Off. Tap to let the office see you on the map.'}
        </span>
      </span>
      <span className={cx('relative inline-block w-10 h-6 rounded-full transition shrink-0', tracking ? 'bg-forest' : 'bg-line')}>
        <span className={cx('absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-paper shadow transition', tracking && 'translate-x-4')} />
      </span>
    </button>
  );
}

// batch abc801 Aug 9 — Center Help schedule (only shows when there is something).
function CenterHelpSectionForVolunteer() {
  const qc = useQueryClient();
  const from = nyToday();
  const to  = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(Date.now() + 7 * 86400e3));
  const q = useQuery({ queryKey: ['ch-vol-instances', from, to], queryFn: () => centerHelp.instances(from, to), refetchInterval: 60_000 });
  const signup = useMutation({ mutationFn: (id: number) => centerHelp.signupSelf(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['ch-vol-instances', from, to] }) });
  const cancel = useMutation({ mutationFn: (id: number) => centerHelp.cancelSelf(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['ch-vol-instances', from, to] }) });
  const now = Date.now();
  const list = (q.data?.data ?? []).filter((i) => new Date(i.starts_at).getTime() > now).slice(0, 10);
  if (q.isLoading || list.length === 0) return null;
  return (
    <div className="mt-5">
      <SectionTitle>Center help — next 7 days</SectionTitle>
      <div className="space-y-2">
        {list.map((inst) => <CHRow key={inst.id} inst={inst} onSignup={() => signup.mutate(inst.id)} onCancel={() => cancel.mutate(inst.id)} busy={signup.isPending || cancel.isPending} />)}
      </div>
    </div>
  );
}

function CHRow({ inst, onSignup, onCancel, busy }: { inst: CenterHelpInstance; onSignup: () => void; onCancel: () => void; busy: boolean }) {
  const label = CENTER_HELP_TASK_LABELS[inst.task_type] ?? inst.task_type;
  const when  = new Date(inst.starts_at).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/New_York' });
  const filled = inst.signup_count;
  const target = inst.volunteers_needed;
  const iAmIn  = inst.is_me === true;
  return (
    <div className="rounded-[14px] border border-line bg-paper px-3.5 py-2.5 flex items-center justify-between gap-3">
      <div className="min-w-0 flex-1">
        <div className="font-bold text-[15px] truncate">{label}</div>
        <div className="text-[13px] text-muted truncate">
          {when} · <span className={cx('font-extrabold', filled < target ? 'text-clay' : 'text-forest')}>{filled} of {target} filled</span>
        </div>
      </div>
      {iAmIn ? (
        <button disabled={busy}
                onClick={async () => { if (await uiConfirm(`Cancel your spot?\n\n${label} · ${when}`, { okLabel: 'Yes, cancel it', cancelLabel: 'No, keep it' })) onCancel(); }}
                className="haptic shrink-0 min-h-[44px] text-[14px] font-bold text-forest border border-forest/40 bg-sage px-3 rounded-[10px] disabled:opacity-50">Signed up ✓</button>
      ) : (
        <button disabled={busy || filled >= target} onClick={onSignup} className="haptic shrink-0 min-h-[44px] text-[14px] font-bold text-paper bg-forest px-4 rounded-[10px] disabled:opacity-50">Sign up</button>
      )}
    </div>
  );
}
