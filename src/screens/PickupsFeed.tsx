/**
 * Pickups feed — Karrot date-grouped feed with sign-up slot avatars + Claim.
 * Two top tabs: Available / My Pickups. Each row is a tap target → detail.
 */
import { useMemo } from 'react';
import { fmtTime } from '../time-format';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { volunteer, type OpenPickup, type MyPickup } from '../api';
import { AppBar, Avatar, ChatButton, Card, Skeleton, SlotAvatars, SlotLabel, StatusPill, cx } from '../design';

export function PickupsFeed() {
  const [params, setParams] = useSearchParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const tab = (params.get('tab') ?? 'available') as 'available' | 'mine';

  // fgh103 (Aug 17): live-poll + focus-refetch so a pickup another driver
  // just claimed drops off THIS driver's list within seconds — otherwise the
  // 30s global staleTime + no window-focus refetch let it linger long enough
  // to be double-tapped.
  const open = useQuery({ queryKey: ['open'], queryFn: volunteer.open, refetchInterval: 15_000, refetchOnWindowFocus: true, staleTime: 5_000 });
  const mine = useQuery({ queryKey: ['mine'], queryFn: volunteer.mine, refetchOnWindowFocus: true, staleTime: 5_000 });

  const signup = useMutation({
    mutationFn: (id: number) => volunteer.signup(id),
    onSuccess: () => { qc.invalidateQueries(); setParams({ tab: 'mine' }); },
  });

  // batch abc810 Aug 10 — Available Pickups shows TODAY only (NY local).
  // Future-dated pickups stay off this screen; coordinator Live Board still
  // shows multi-day. My Pickups keeps the full multi-day view.
  const todayNYIso = useMemo(() => nyLocalDateIso(new Date()), []);
  const openToday = useMemo(
    () => (open.data?.data ?? []).filter((p) => (p.scheduled_date ?? '').slice(0, 10) === todayNYIso),
    [open.data, todayNYIso],
  );
  const openGroups = useMemo(() => groupByDate(openToday), [openToday]);
  const mineGroups = useMemo(() => groupByDate(mine.data?.data ?? []), [mine.data]);

  return (
    <div className="min-h-screen pb-[80px]">
      <AppBar title={tab === 'available' ? 'Available Pickups' : 'My Pickups'} right={<Avatar initials="DG" />} />

      {/* Tabs */}
      <div className="mx-5 mt-1 bg-[#F3EFE4] border border-line rounded-[11px] p-[3px] flex">
        {(['available', 'mine'] as const).map((k) => (
          <button key={k} onClick={() => setParams({ tab: k })}
                  className={cx('flex-1 text-[12px] font-bold py-2 rounded-[8px] transition',
                                tab === k ? 'bg-paper text-forest shadow-soft' : 'text-muted')}>
            {k === 'available' ? 'Available' : 'My Pickups'}
          </button>
        ))}
      </div>

      <main className="px-4 mt-4">
        {tab === 'available' ? (
          open.isLoading ? <FeedSkeleton /> :
          openGroups.length === 0 ? <Empty body="No open pickups for today." /> :
          openGroups.map((g) => (
            <section key={g.key} className="mb-4">
              <div className="text-[11px] font-extrabold uppercase tracking-[0.05em] text-muted my-2.5">{g.label}</div>
              <div className="space-y-2.5">
                {(g.items as OpenPickup[]).map((p) => (
                  <PickupRow key={p.pickup_instance_id} p={p}
                    onOpen={() => nav(`/pickup/open/${p.pickup_instance_id}`)}
                    cta={<button className="bg-forest text-paper font-bold text-[12px] px-3.5 py-2 rounded-[10px] haptic"
                                 onClick={(e) => { e.stopPropagation(); signup.mutate(Number(p.pickup_instance_id)); }}>
                          {p.slots_capacity > 1 ? 'Sign up' : 'Claim'}
                        </button>}
                  />
                ))}
              </div>
            </section>
          ))
        ) : (
          mine.isLoading ? <FeedSkeleton /> :
          mineGroups.length === 0 ? <Empty body="No pickups on your plate. Check Available." /> :
          mineGroups.map((g) => (
            <section key={g.key} className="mb-4">
              <div className="text-[11px] font-extrabold uppercase tracking-[0.05em] text-muted my-2.5">{g.label}</div>
              <div className="space-y-2.5">
                {(g.items as MyPickup[]).map((p) => (
                  <PickupRow key={p.assignment_id} p={p}
                    onOpen={() => nav(`/pickup/mine/${p.pickup_instance_id}`)}
                    pill={<StatusPill status={p.status} />}
                    cta={<button className="bg-sage text-forest font-bold text-[12px] px-3.5 py-2 rounded-[10px] haptic"
                                 onClick={(e) => { e.stopPropagation(); nav(`/pickup/mine/${p.pickup_instance_id}`); }}>
                          Open
                        </button>}
                  />
                ))}
              </div>
            </section>
          ))
        )}
      </main>
    </div>
  );
}

function PickupRow({ p, onOpen, pill, cta }: {
  p: OpenPickup | MyPickup;
  onOpen: () => void;
  pill?: React.ReactNode;
  cta: React.ReactNode;
}) {
  const store = p.suppliers || (p.is_one_time ? 'One-time donor' : 'Pickup');
  const desc  = p.food_description || p.notes || '';
  const time  = p.scheduled_time?.slice(0, 5) ?? '—';
  // abc837 Aug 13 — client wants the pickup address on the card too so drivers
  // can size up distance/route at a glance without opening the detail page.
  const address = shortAddress(p.supplier_address);
  const urgent = p.urgency_level === 'high';
  const filled = p.signups.map((s) => ({ initials: (s.first_name?.[0] ?? '') + (s.last_name?.[0] ?? '') }));
  // batch abc810 Aug 10 — "Later today" chip when scheduled_time is
  // still in the future today (NY local).
  const laterToday = isLaterTodayNY(p.scheduled_date, p.scheduled_time);
  return (
    <Card onClick={onOpen} className="!p-3.5 hover:-translate-y-0.5 transition">
      <div className="flex items-baseline gap-3">
        <span className="font-display font-bold text-[14px] text-forest">{fmtTime(time)}</span>
        <span className="font-bold text-[13.5px] truncate">{store}</span>
        {/* C3 Aug 13 — small ref# chip so drivers can quote it to the office. */}
        {p.ref_number && <span className="text-[10.5px] font-extrabold tracking-wider bg-cream border border-line text-muted px-1.5 py-0.5 rounded-full">#{p.ref_number}</span>}
        {laterToday && !pill && (
          <span className="ml-auto inline-flex items-center gap-1 bg-clay/15 text-clay font-bold text-[11px] uppercase tracking-wide px-2 py-0.5 rounded-full">
            Later today · {fmtTime(time)}
          </span>
        )}
        {urgent && !pill && !laterToday && <span className="ml-auto inline-block w-2 h-2 rounded-full bg-clay animate-pulse" />}
        {pill && <span className="ml-auto">{pill}</span>}
      </div>
      {address && <div className="text-[12px] text-forest/80 mt-1 leading-snug truncate">📍 {address}</div>}
      {desc && <div className="text-[12px] text-muted mt-1 leading-snug line-clamp-2">{desc}</div>}
      <div className="flex items-center justify-between mt-3">
        <div className="flex items-center">
          <SlotAvatars filled={filled} capacity={p.slots_capacity || 1} />
          <SlotLabel filled={filled.length} capacity={p.slots_capacity || 1} />
        </div>
        <div className="flex items-center gap-2">
          <span onClick={(e) => e.stopPropagation()}><ChatButton /></span>
          {cta}
        </div>
      </div>
    </Card>
  );
}

// abc837 Aug 13 — strip trailing ", USA" / ", United States" so a single-line
// address stays readable on narrow phone widths; return '' for nullish.
function shortAddress(a: string | null | undefined): string {
  if (!a) return '';
  return String(a).replace(/,?\s*(USA|United States)\.?\s*$/i, '').trim();
}

// batch abc810 Aug 10 — NY-local "today" helpers.
function nyLocalDateIso(d: Date): string {
  // en-CA gives YYYY-MM-DD which is directly comparable to backend date-only.
  return d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}
function isLaterTodayNY(scheduledDate: string | null | undefined, scheduledTime: string | null | undefined): boolean {
  if (!scheduledDate || !scheduledTime) return false;
  const todayIso = nyLocalDateIso(new Date());
  if (scheduledDate.slice(0, 10) !== todayIso) return false;
  // Compare scheduled_time (HH:MM[:SS]) against current NY wall-clock HH:MM.
  const nowHHMM = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/New_York' });
  return scheduledTime.slice(0, 5) > nowHHMM;
}


function Empty({ body }: { body: string }) {
  return <div className="text-center py-12 text-muted text-[13px]">{body}</div>;
}
function FeedSkeleton() {
  return <div className="space-y-3">{[0,1,2].map((i) => <Skeleton key={i} className="h-24 rounded-[16px]" />)}</div>;
}

function groupByDate<T extends { scheduled_date: string }>(items: T[]) {
  const today = new Date(); today.setHours(0,0,0,0);
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  const groups = new Map<string, { key: string; label: string; items: T[] }>();
  for (const it of items) {
    const d = new Date(it.scheduled_date.slice(0, 10) + 'T00:00:00');
    let label: string;
    if (sameDay(d, today)) label = 'Today · ' + d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    else if (sameDay(d, tomorrow)) label = 'Tomorrow · ' + d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    else label = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    const key = d.toISOString().slice(0, 10);
    (groups.get(key) ?? groups.set(key, { key, label, items: [] }).get(key)!).items.push(it);
  }
  return Array.from(groups.values());
}
function sameDay(a: Date, b: Date) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
