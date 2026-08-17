/**
 * Volunteer Home — Sharing-Excess "task-hub" cards layout from the mockup.
 * Three colour-coded cards (Available Pickups · My Pickups · Completed this
 * week) sit beneath a small map strip. Header is the Fraunces greeting.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Truck, Calendar, Check, MapPin } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { volunteer, centerHelp, CENTER_HELP_TASK_LABELS, type CenterHelpInstance, type AuthUser } from '../api';
import { AppBar, Avatar, FadeUp, Skeleton, cx } from '../design';
import { useLocationReporting, getTrackingEnabled, setTrackingEnabled, reportNow } from '../location-reporter';

export function VolunteerHome({ user }: { user: AuthUser }) {
  const nav = useNavigate();

  // fgh103 (Aug 17): live-poll so the "N available" tile stays current.
  const open = useQuery({ queryKey: ['open'], queryFn: volunteer.open, refetchInterval: 15_000, refetchOnWindowFocus: true, staleTime: 5_000 });
  const mine = useQuery({ queryKey: ['mine'], queryFn: volunteer.mine, refetchOnWindowFocus: true, staleTime: 5_000 });
  const hist = useQuery({ queryKey: ['history'], queryFn: volunteer.history });

  // batch abc810 Aug 10 — count only TODAY's open pickups so the home tile
  // matches the Available Pickups feed (which is today-only per spec 8b).
  const todayIsoNY = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const openCount  = open.data?.data.filter((p) => (p.scheduled_date ?? '').slice(0, 10) === todayIsoNY).length ?? 0;
  const mineCount  = mine.data?.data.filter((p) => p.status !== 'completed' && p.status !== 'cancelled').length ?? 0;
  const thisMonth  = hist.data?.stats.thisMonth ?? 0;
  const initials   = (user.firstName?.[0] ?? '') + (user.lastName?.[0] ?? '');
  const firstName  = user.firstName || 'friend';

  const [tracking, setTracking] = useState<boolean>(() => getTrackingEnabled());
  useEffect(() => {
    const onChange = (e: Event) => setTracking((e as CustomEvent).detail?.enabled === true);
    window.addEventListener('vp:tracking-changed', onChange as any);
    return () => window.removeEventListener('vp:tracking-changed', onChange as any);
  }, []);
  const trackingStatus = useLocationReporting(tracking);
  function toggleTracking() {
    const next = !tracking;
    setTrackingEnabled(next);
    setTracking(next);
  }
  // Available/Unavailable toggle. Drivers flip this from here when they're
  // on a break, vacation, etc. — it drives whether the office/agent sends
  // them new-pickup alerts and (in future) whether the office roster shows
  // them as claimable.
  const qc = useQueryClient();
  const avail = useQuery({ queryKey: ['availability'], queryFn: volunteer.availability });
  const setAvail = useMutation({
    mutationFn: (next: boolean) => volunteer.setAvailability(next),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['availability'] }),
  });
  const isAvailable = avail.data?.data?.isAvailable ?? true;

  const [oneShot, setOneShot] = useState<string | null>(null);
  const [showLocationDetails, setShowLocationDetails] = useState(false);
  async function sendNow() {
    setOneShot('Sending…');
    const r = await reportNow();
    setOneShot(r.ok ? '✓ Sent' : `✗ ${r.error}`);
    window.setTimeout(() => setOneShot(null), 5000);
  }

  return (
    <div className="min-h-screen pb-[80px]">
      <AppBar title="Zeh L'Zeh" right={<Avatar initials={initials} />} />

      <main className="px-5">
        <FadeUp>
          <div className="font-display font-semibold text-[23px] leading-tight">
            Shalom, <span>{firstName}</span>
          </div>
          <p className="text-[13px] text-muted mt-1.5">
            {openCount > 0
              ? `${openCount} pickup${openCount === 1 ? '' : 's'} near you still need a driver.`
              : 'No open pickups right now.'}
          </p>

          {/* Available / Unavailable toggle. */}
          <div className="mt-3 flex items-center justify-between rounded-[14px] border border-line bg-paper px-3.5 py-2.5">
            <div className="min-w-0">
              <div className="text-[13px] font-bold text-ink">
                {isAvailable ? "You're available for pickups" : 'You are unavailable'}
              </div>
              <div className="text-[11.5px] text-muted">
                {isAvailable
                  ? "You'll get alerts for new nearby pickups."
                  : "You won't be alerted until you switch back on."}
              </div>
            </div>
            <button onClick={() => setAvail.mutate(!isAvailable)} disabled={setAvail.isPending}
                    aria-label={isAvailable ? 'Set unavailable' : 'Set available'}
                    className={cx('relative w-[46px] h-[26px] rounded-full transition-colors shrink-0',
                                  isAvailable ? 'bg-forest' : 'bg-line')}>
              <span className={cx('absolute top-[3px] h-[20px] w-[20px] rounded-full bg-paper transition-all shadow-sm',
                                  isAvailable ? 'right-[3px]' : 'left-[3px]')} />
            </button>
          </div>
        </FadeUp>

        {/* Map strip */}
        <FadeUp delay={0.05}>
          <div className="mt-4 h-[96px] rounded-[18px] border border-line overflow-hidden relative"
               style={{
                 background: 'linear-gradient(0deg,rgba(44,90,59,.05),rgba(44,90,59,.05)),' +
                             'repeating-linear-gradient(0deg,#EEF3E9 0 1px,transparent 1px 22px),' +
                             'repeating-linear-gradient(90deg,#EEF3E9 0 1px,transparent 1px 22px),' +
                             '#F3F7EF',
               }}>
            <button onClick={() => nav('/map')} className="absolute inset-0 haptic">
              <span className="absolute inset-x-0 top-[42px] h-1.5 bg-[#E2E9DA]" />
              <span className="absolute top-0 bottom-0 left-[90px] w-1.5 bg-[#E2E9DA]" />
              <Pin x={64}  y={40} color="#D27A4C" />
              <Pin x={120} y={62} color="#2C5A3B" />
              <Pin x={206} y={34} color="#2C5A3B" />
            </button>
          </div>
        </FadeUp>

        {/* Live-location toggle — opt-in. When on, the office sees your last
            known location on the live map. Status line + Send-now button below
            so you can debug if it ever stops reporting. */}
        <FadeUp delay={0.08}>
          <div className={cx('mt-4 rounded-[14px] border',
                             tracking ? 'bg-sage border-sage-line' : 'bg-paper border-line')}>
            <button onClick={toggleTracking}
                    className="w-full px-4 py-3 flex items-center gap-3 haptic text-left">
              <span className={cx('grid h-10 w-10 place-items-center rounded-full',
                                  tracking ? 'bg-forest text-paper' : 'bg-cream text-muted')}>
                <MapPin size={18} />
              </span>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-[14.5px]">{tracking ? 'Sharing your location' : 'Share your location'}</div>
                <div className="text-[12.5px] text-muted">
                  {tracking ? 'Office sees you on the live map. Tap to stop.' : 'Let the office see you on the live map while the app is open.'}
                </div>
              </div>
              <span className={cx('relative inline-block w-10 h-6 rounded-full transition',
                                  tracking ? 'bg-forest' : 'bg-line')}>
                <span className={cx('absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-paper shadow transition',
                                    tracking && 'translate-x-4')} />
              </span>
            </button>

            {/* Status row — the raw "Last sent Xs ago · N total" was noise
                for drivers; hide it under a tap-to-expand affordance and only
                surface errors + the Send-now button by default. */}
            {(trackingStatus.lastError || oneShot || showLocationDetails) && (
              <div className={cx('border-t px-4 py-3 flex items-center gap-3 text-[13px]',
                                  tracking ? 'border-sage-line/60' : 'border-line')}>
                <div className="flex-1 min-w-0">
                  <div className={cx('font-bold truncate',
                                     trackingStatus.lastError ? 'text-clay'
                                     : trackingStatus.lastReportedAt ? 'text-forest'
                                     : 'text-muted')}>
                    {trackingStatus.lastError
                      ? `Last error: ${trackingStatus.lastError}`
                      : trackingStatus.lastReportedAt
                        ? `Last sent ${Math.max(0, Math.round((Date.now() - trackingStatus.lastReportedAt) / 1000))}s ago · ${trackingStatus.reportsSent} total`
                        : tracking
                          ? `Permission: ${trackingStatus.permission} · waiting for first GPS read`
                          : 'Tap Send now to test'}
                  </div>
                  {oneShot && <div className={cx('truncate mt-0.5 font-bold', oneShot.startsWith('✓') ? 'text-forest' : 'text-clay')}>{oneShot}</div>}
                </div>
                <button onClick={sendNow}
                        className="haptic shrink-0 bg-forest text-paper rounded-[10px] px-3.5 py-1.5 font-bold text-[12.5px] shadow-ctag">
                  Send now
                </button>
              </div>
            )}
            {!trackingStatus.lastError && !oneShot && (
              <button onClick={() => setShowLocationDetails((v) => !v)}
                      className={cx('haptic w-full border-t px-4 py-1.5 text-[11px] text-muted',
                                    tracking ? 'border-sage-line/60' : 'border-line')}>
                {showLocationDetails ? 'Hide details' : 'Details'}
              </button>
            )}
          </div>
        </FadeUp>

        {/* Task-hub cards */}
        <FadeUp delay={0.1} className="mt-4 space-y-2.5">
          <TaskCard tone="sage" title="Available Pickups" desc="Near you · refrigerated & dry"
                    count={open.isLoading ? null : openCount} onClick={() => nav('/pickups')}
                    icon={<Truck size={22} />} />

          <TaskCard tone="clay" title="My Pickups" desc={`${mineCount} active`}
                    count={mine.isLoading ? null : mineCount} onClick={() => nav('/pickups?tab=mine')}
                    icon={<Calendar size={22} />} />

          <TaskCard tone="paper" title="Completed this month" desc="Tracked in My Activity"
                    count={hist.isLoading ? null : thisMonth} onClick={() => nav('/you')}
                    icon={<Check size={22} strokeWidth={2.5} />} />
        </FadeUp>

        {/* batch abc801 Aug 9 — Center Help schedule: simple listing of the
            next 7 days of instances. Volunteer can sign up / cancel here. */}
        <FadeUp delay={0.14}>
          <CenterHelpSectionForVolunteer />
        </FadeUp>
      </main>
    </div>
  );
}

// batch abc801 Aug 9 — small compact listing of upcoming center-help tasks
// for the volunteer. Sign up or cancel inline. Nothing fancy.
function CenterHelpSectionForVolunteer() {
  const qc = useQueryClient();
  const to  = new Date(Date.now() + 7 * 86400e3).toISOString().slice(0, 10);
  const from = new Date().toISOString().slice(0, 10);
  const q = useQuery({
    queryKey: ['ch-vol-instances', from, to],
    queryFn:  () => centerHelp.instances(from, to),
    refetchInterval: 60_000,
  });
  const signup = useMutation({
    mutationFn: (id: number) => centerHelp.signupSelf(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ch-vol-instances', from, to] }),
  });
  const cancel = useMutation({
    mutationFn: (id: number) => centerHelp.cancelSelf(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ch-vol-instances', from, to] }),
  });
  const now = Date.now();
  const list = (q.data?.data ?? []).filter((i) => new Date(i.starts_at).getTime() > now).slice(0, 10);
  if (q.isLoading) return null;
  if (list.length === 0) return null;
  return (
    <div className="mt-5">
      <div className="text-[11px] font-extrabold uppercase tracking-[.05em] text-muted mb-1.5">Center help — next 7 days</div>
      <div className="space-y-2">
        {list.map((inst) => <CHRow key={inst.id} inst={inst} onSignup={() => signup.mutate(inst.id)} onCancel={() => cancel.mutate(inst.id)} busy={signup.isPending || cancel.isPending} />)}
      </div>
    </div>
  );
}

function CHRow({ inst, onSignup, onCancel, busy }: { inst: CenterHelpInstance; onSignup: () => void; onCancel: () => void; busy: boolean }) {
  const label = CENTER_HELP_TASK_LABELS[inst.task_type] ?? inst.task_type;
  const when  = new Date(inst.starts_at).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
  const filled = inst.signup_count;
  const target = inst.volunteers_needed;
  const short  = filled < target;
  const iAmIn  = inst.is_me === true;
  return (
    <div className="rounded-[14px] border border-line bg-paper px-3.5 py-2.5 flex items-center justify-between gap-3">
      <div className="min-w-0 flex-1">
        <div className="font-bold text-[13.5px] truncate">{label}</div>
        <div className="text-[11.5px] text-muted truncate">
          {when} · <span className={cx('font-extrabold', short ? 'text-clay' : 'text-forest')}>{filled} of {target} filled</span>
        </div>
      </div>
      {iAmIn ? (
        <button disabled={busy} onClick={onCancel}
                className="haptic text-[11.5px] font-bold text-clay border border-clay/40 px-3 py-1.5 rounded-[10px] disabled:opacity-50">
          Signed up ✓
        </button>
      ) : (
        <button disabled={busy || filled >= target} onClick={onSignup}
                className="haptic text-[11.5px] font-bold text-forest border border-forest/40 bg-sage/40 px-3 py-1.5 rounded-[10px] disabled:opacity-50">
          + Sign up
        </button>
      )}
    </div>
  );
}

function Pin({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" className="absolute" style={{ left: x, top: y, transform: 'translate(-50%, -100%)', filter: 'drop-shadow(0 3px 3px rgba(0,0,0,.18))' }}>
      <path d="M12 2C8 2 5 5 5 9c0 5 7 13 7 13s7-8 7-13c0-4-3-7-7-7z" fill={color} />
    </svg>
  );
}

const TC_TONE: Record<string, { bg: string; ic: string; cn: string }> = {
  sage:  { bg: 'bg-sage border-sage-line',           ic: 'bg-paper text-forest', cn: 'text-forest' },
  clay:  { bg: 'bg-clay-soft border-[#EED2BF]',      ic: 'bg-paper text-clay',   cn: 'text-clay' },
  paper: { bg: 'bg-paper border-line',               ic: 'bg-amber-soft text-amber', cn: 'text-amber' },
};

function TaskCard({ tone, title, desc, count, icon, onClick }: {
  tone: 'sage' | 'clay' | 'paper';
  title: string; desc: string; count: number | null;
  icon: React.ReactNode; onClick: () => void;
}) {
  const t = TC_TONE[tone];
  return (
    <button onClick={onClick}
      className={cx('haptic w-full text-left flex items-center gap-3.5 rounded-[18px] border px-4 py-4 transition hover:-translate-y-0.5 hover:shadow-card', t.bg)}>
      <span className={cx('grid h-[42px] w-[42px] place-items-center rounded-[12px] shrink-0', t.ic)}>{icon}</span>
      <span className="flex-1 min-w-0">
        <span className="block font-display font-semibold text-[16px] leading-tight">{title}</span>
        <span className="block text-[12px] text-muted mt-0.5">{desc}</span>
      </span>
      {count === null
        ? <Skeleton className="h-6 w-8 rounded-md" />
        : <span className={cx('font-display font-bold text-[22px] leading-none', t.cn)}>{count}</span>}
      <ArrowRight size={16} className="text-muted ml-1" />
    </button>
  );
}
