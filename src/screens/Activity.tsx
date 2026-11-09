/**
 * Activity — the four-metric tracker, now backed by /api/me/my-trips.
 * Toggle for This month vs All time, four colour-coded metric tiles in a
 * 2×2 grid, then a Recent log. **No badges, streaks, or
 * gamification** per the spec.
 * Nov 3 Yakov: no Hours tile (three tiles: pickups / miles / stores). Miles are automatic
 * (pickup place → 3 Regina drop-off center; the API fills them), drivers aren't asked.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Truck, Route, Store } from 'lucide-react';
import { volunteer, type ActivityRow, type AuthUser } from '../api';
import { AppBar, Avatar, FadeUp, Skeleton, cx } from '../design';
import { fmtDateTimeFull } from '../time-format';

type Scope = 'month' | 'all';

export function Activity({ user }: { user: AuthUser }) {
  const [scope, setScope] = useState<Scope>('all');
  const q = useQuery({ queryKey: ['activity', scope], queryFn: () => volunteer.activity(scope) });

  const stats = q.data?.stats ?? { pickups: 0, miles: 0, minutes: 0, stores: 0 };
  const rows  = q.data?.data ?? [];

  return (
    <div className="min-h-screen pb-[80px]">
      <AppBar title="My Activity" right={<Avatar initials={(user.firstName?.[0] ?? '') + (user.lastName?.[0] ?? '')} />} />

      <main className="px-5">
        <FadeUp>
          {/* Oct 9 client: friendly heading, no "Volunteer" label. */}
          <div className="font-display font-semibold text-[22px]">Your pickups</div>
          <div className="text-[14px] text-muted">Thank you, {user.firstName || 'friend'}!</div>
        </FadeUp>

        <div className="mt-3 mb-4 bg-[#F3EFE4] border border-line rounded-[11px] p-[3px] flex">
          {([['month', 'This month'], ['all', 'All time']] as const).map(([k, label]) => (
            <button key={k} onClick={() => setScope(k)}
                    className={cx('flex-1 text-[15px] font-bold min-h-[44px] rounded-[8px] transition', // Oct 9 client: 44px tap target
                                  scope === k ? 'bg-paper text-forest shadow-soft' : 'text-muted')}>
              {label}
            </button>
          ))}
        </div>

        {q.isLoading ? (
          <div className="grid grid-cols-3 gap-2.5"><Skeleton className="h-32 rounded-[18px]" /><Skeleton className="h-32 rounded-[18px]" /><Skeleton className="h-32 rounded-[18px]" /></div>
        ) : (
          <div className="grid grid-cols-3 gap-2.5">
            {/* Oct 8: exactly four real numbers. "Families helped" and
                "Meals rescued" were estimates, so they are gone. */}
            <Metric tone="green" value={Number(stats.pickups) || 0}                  label="Pickups"
                    sub={scope === 'month' ? 'this month' : 'all time'}      icon={<Truck size={18} />} />
            <Metric tone="sky"   value={Math.round((Number(stats.miles) || 0) * 10) / 10} label="Miles"
                    sub="driven"                                               icon={<Route size={18} />} />
            <Metric tone="clay"  value={Number(stats.stores) || 0}                   label="Stores"
                    sub="picked up from"                                       icon={<Store size={18} />} />
            {/* Nov 3 Yakov: Hours tile removed. */}
          </div>
        )}

        <div className="flex justify-between items-center mt-5 mb-2 text-[13px] font-extrabold uppercase tracking-[.05em] text-muted">
          {/* Oct 9 client: Export link removed (drivers never need a CSV). */}
          Recent pickups
        </div>

        <div className="border border-line rounded-[16px] divide-y divide-line overflow-hidden bg-paper">
          {/* Oct 9 client: a failed load is not "no trips". */}
          {q.isError && (
            <div className="px-4 py-6 text-center">
              <div className="text-[15px] font-bold text-ink">Can't connect — check your signal.</div>
              <button onClick={() => q.refetch()} disabled={q.isFetching}
                      className="haptic mt-3 w-full min-h-[52px] rounded-[14px] bg-forest text-paper text-[17px] font-bold disabled:opacity-60">
                {q.isFetching ? 'Trying…' : 'Try again'}
              </button>
            </div>
          )}
          {!q.isLoading && !q.isError && rows.length === 0 &&<div className="px-4 py-6 text-center text-muted text-[15px]">No trips yet.</div>}
          {rows.slice(0, 14).map((r) => <LogRow key={r.id} r={r} />)}
        </div>
      </main>
    </div>
  );
}

function Metric({ tone, value, unit, label, sub, icon }: {
  tone: 'green' | 'sky' | 'clay' | 'amber';
  value: number; unit?: string; label: string; sub: string;
  icon: React.ReactNode;
}) {
  const styles: Record<string, { bg: string; ic: string; n: string }> = {
    green: { bg: 'bg-sage border-sage-line',          ic: 'bg-paper text-forest', n: 'text-forest' },
    sky:   { bg: 'bg-sky-soft border-[#C6DAE6]',      ic: 'bg-paper text-sky',    n: 'text-sky' },
    clay:  { bg: 'bg-clay-soft border-[#EED2BF]',     ic: 'bg-paper text-clay',   n: 'text-clay' },
    amber: { bg: 'bg-amber-soft border-[#F0DDA8]',    ic: 'bg-paper text-amber',  n: 'text-[#b9831f]' },
  };
  const s = styles[tone];
  return (
    <div className={cx('rounded-[18px] border p-3 min-w-0', s.bg)}>
      <span className={cx('grid h-[34px] w-[34px] place-items-center rounded-[10px] mb-3', s.ic)}>{icon}</span>
      <div className="font-display font-bold leading-none text-[26px]">
        <span className={s.n}>{value}</span>
        {unit && <span className="text-[14px] text-muted ml-1">{unit}</span>}
      </div>
      <div className="text-[13px] font-extrabold uppercase tracking-[.04em] text-muted mt-1.5">{label}</div>
      <div className="text-[13px] text-muted font-semibold mt-1">{sub}</div>
    </div>
  );
}

function LogRow({ r }: { r: ActivityRow }) {
  const when = fmtDateTimeFull(r.completed_at);
  return (
    <div className="flex items-center gap-3 px-3.5 py-3">
      <span className="grid h-[34px] w-[34px] place-items-center rounded-[10px] bg-[#F3EFE4] text-muted"><Store size={16} /></span>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-bold truncate">{r.store_name ?? 'Pickup'}</div>
        <div className="text-[13px] text-muted">{when}</div>
      </div>
      {/* Oct 14 client: no "— —" when miles / time weren't entered. */}
      {/* Nov 3 Yakov: miles only (automatic); no time. */}
      {r.miles != null && <div className="text-right">
        <div className="font-display font-bold text-[13px]">{`${Number(r.miles).toFixed(1)} mi`}</div>
      </div>}
    </div>
  );
}
