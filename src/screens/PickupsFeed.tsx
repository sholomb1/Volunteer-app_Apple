/**
 * Pickups feed — Oct 6 client redesign: same simple card as Home.
 * Two tabs: Open / Mine. Grouped by day. Tap a card for details.
 */
import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { volunteer, getUser, type OpenPickup, type MyPickup } from '../api';
import { AppBar, Avatar, Skeleton, cx } from '../design';
import { nyToday, driverShowsNow } from '../time-format';
import { DriverCard, useTakePickup } from './driver-card';
import { LoadError } from './VolunteerHome';

const FINISHED = new Set(['completed', 'delivered', 'cancelled', 'missed']);

export function PickupsFeed() {
  const [params, setParams] = useSearchParams();
  const nav = useNavigate();
  const tab = (params.get('tab') ?? 'available') as 'available' | 'mine';

  // Live-poll so a pickup another driver just took drops off within seconds.
  const open = useQuery({ queryKey: ['open'], queryFn: volunteer.open, refetchInterval: 15_000, refetchOnWindowFocus: true, staleTime: 5_000 });
  const mine = useQuery({ queryKey: ['mine'], queryFn: volunteer.mine, refetchOnWindowFocus: true, staleTime: 5_000 });
  const { take, busy } = useTakePickup(() => setParams({ tab: 'mine' }));

  const me = getUser();
  const initials = ((me?.firstName?.[0] ?? '') + (me?.lastName?.[0] ?? '')) || '·';

  // Trust the backend's open window (6 hours past pickup time, across midnight).
  const openGroups = useMemo(() => groupByDate(open.data?.data ?? []), [open.data]);
  // Oct 8: Mine = not-finished first (today at the top, soonest first), then a
  // "Done" section with finished pickups, newest first.
  const { mineGroups, mineDone } = useMemo(() => {
    const all = (mine.data?.data ?? []).filter((p) => !['cancelled'].includes(p.status));
    const isDone = (p: MyPickup) => FINISHED.has(p.status) || p.assignment_status === 'completed';
    const today = nyToday();
    const groups = groupByDate(all.filter((p) => !isDone(p)));
    const rank = (k: string) => (k === today ? 0 : k > today ? 1 : 2);
    groups.sort((a, b) => rank(a.key) - rank(b.key) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    const done = all.filter(isDone).sort((a, b) =>
      (`${a.scheduled_date}${a.scheduled_time ?? ''}` < `${b.scheduled_date}${b.scheduled_time ?? ''}` ? 1 : -1));
    return { mineGroups: groups, mineDone: done };
  }, [mine.data]);

  return (
    <div className="min-h-screen pb-[80px]">
      <AppBar title="Pickups" right={<Avatar initials={initials} />} />

      <div className="mx-5 mt-1 bg-[#F3EFE4] border border-line rounded-[11px] p-[3px] flex">
        {(['available', 'mine'] as const).map((k) => (
          <button key={k} onClick={() => setParams({ tab: k })}
                  className={cx('flex-1 text-[15px] font-bold min-h-[44px] rounded-[8px] transition', tab === k ? 'bg-paper text-forest shadow-soft' : 'text-muted')}>
            {k === 'available' ? `Open${open.data ? ` (${open.data.data.length})` : ''}` : 'Mine'}
          </button>
        ))}
      </div>

      <main className="px-5 mt-2">
        {tab === 'available' ? (
          open.isLoading ? <FeedSkeleton /> :
          // Oct 9 client: a failed load says so (not "Nothing open").
          open.isError && !open.data ? <LoadError onRetry={() => open.refetch()} busy={open.isFetching} error={open.error} what="pickups" /> :
          openGroups.length === 0 ? <Empty body="Nothing open right now. We'll text you when something comes in." /> :
          openGroups.map((g) => (
            <section key={g.key} className="mb-2">
              <div className="text-[13px] font-extrabold uppercase tracking-[.06em] text-muted mt-4 mb-2">{g.label}</div>
              <div className="space-y-2.5">
                {(g.items as OpenPickup[]).map((p) => (
                  <DriverCard key={p.pickup_instance_id} p={p} busy={busy}
                              onOpen={() => nav(`/pickup/open/${p.pickup_instance_id}`)} onTake={() => take(p)} />
                ))}
              </div>
            </section>
          ))
        ) : (
          mine.isLoading ? <FeedSkeleton /> :
          mine.isError && !mine.data ? <LoadError onRetry={() => mine.refetch()} busy={mine.isFetching} error={mine.error} what="your pickups" /> :
          mineGroups.length === 0 && mineDone.length === 0 ? <Empty body="You haven't taken any pickups yet." /> :
          <>
            {mineGroups.length === 0 && <Empty body="Nothing to do right now." />}
            {mineGroups.map((g) => (
              <section key={g.key} className="mb-2">
                <div className="text-[14px] font-extrabold uppercase tracking-[.05em] text-muted mt-4 mb-2">{g.label}</div>
                <div className="space-y-2.5">
                  {(g.items as MyPickup[]).map((p) => (
                    <DriverCard key={p.assignment_id ?? p.pickup_instance_id} p={p} mine
                                onOpen={() => nav(`/pickup/mine/${p.pickup_instance_id}`)} />
                  ))}
                </div>
              </section>
            ))}
            {mineDone.length > 0 && (
              <section className="mb-2">
                <div className="text-[14px] font-extrabold uppercase tracking-[.05em] text-muted mt-6 mb-2">Done</div>
                <div className="space-y-2.5">
                  {mineDone.map((p) => (
                    <DriverCard key={p.assignment_id ?? p.pickup_instance_id} p={p} mine
                                onOpen={() => nav(`/pickup/mine/${p.pickup_instance_id}`)} />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function Empty({ body }: { body: string }) {
  return <div className="text-center py-12 text-muted text-[13.5px]">{body}</div>;
}
function FeedSkeleton() {
  return <div className="space-y-3 mt-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-28 rounded-[16px]" />)}</div>;
}

// Day headers in New York time: Today / Tomorrow / Yesterday / Wed, Oct 8.
function groupByDate<T extends { scheduled_date: string; scheduled_time?: string | null }>(items: T[]) {
  const today = nyToday();
  const shift = (iso: string, days: number) => new Date(Date.parse(iso + 'T12:00:00Z') + days * 86400e3).toISOString().slice(0, 10);
  const tomorrow = shift(today, 1), yesterday = shift(today, -1);
  const groups = new Map<string, { key: string; label: string; items: T[] }>();
  const sorted = [...items].sort((a, b) => (`${a.scheduled_date}${a.scheduled_time ?? ''}` < `${b.scheduled_date}${b.scheduled_time ?? ''}` ? -1 : 1));
  for (const it of sorted) {
    // Oct 13 client: a reposted / late pickup still to do sits under Today (it's "now").
    const key = driverShowsNow(it as any) ? today : String(it.scheduled_date).slice(0, 10);
    const pretty = new Date(key + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
    const label = key === today ? `Today · ${pretty}` : key === tomorrow ? `Tomorrow · ${pretty}` : key === yesterday ? `Yesterday · ${pretty}` : pretty;
    (groups.get(key) ?? groups.set(key, { key, label, items: [] }).get(key)!).items.push(it);
  }
  return Array.from(groups.values());
}
