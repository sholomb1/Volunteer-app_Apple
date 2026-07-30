/**
 * Activity — the four-metric tracker, now backed by /api/me/activity-log.
 * Toggle for This month vs All time, four colour-coded metric tiles in a
 * 2×2 grid, then a Recent log with Export CSV. **No badges, streaks, or
 * gamification** per the spec.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Truck, Route, Store, Clock, Users2, UtensilsCrossed } from 'lucide-react';
import { volunteer, type ActivityRow, type AuthUser } from '../api';
import { AppBar, Avatar, FadeUp, Skeleton, cx } from '../design';
import { fmtDateTimeFull } from '../time-format';

type Scope = 'month' | 'all';

export function Activity({ user }: { user: AuthUser }) {
  const [scope, setScope] = useState<Scope>('all');
  const q = useQuery({ queryKey: ['activity', scope], queryFn: () => volunteer.activity(scope) });

  const stats = q.data?.stats ?? { pickups: 0, miles: 0, minutes: 0, stores: 0, families: 0, meals: 0 } as any;
  const rows  = q.data?.data ?? [];

  return (
    <div className="min-h-screen pb-[80px]">
      <AppBar title="My Activity" right={<Avatar initials={(user.firstName?.[0] ?? '') + (user.lastName?.[0] ?? '')} />} />

      <main className="px-5">
        <FadeUp>
          <div className="font-display font-semibold text-[22px]">{user.firstName} {user.lastName}</div>
          <div className="text-[12.5px] text-muted">Volunteer · Spring Valley</div>
        </FadeUp>

        <div className="mt-3 mb-4 bg-[#F3EFE4] border border-line rounded-[11px] p-[3px] flex">
          {([['month', 'This month'], ['all', 'All time']] as const).map(([k, label]) => (
            <button key={k} onClick={() => setScope(k)}
                    className={cx('flex-1 text-[12px] font-bold py-2 rounded-[8px] transition',
                                  scope === k ? 'bg-paper text-forest shadow-soft' : 'text-muted')}>
              {label}
            </button>
          ))}
        </div>

        {q.isLoading ? (
          <div className="grid grid-cols-2 gap-3"><Skeleton className="h-32 rounded-[18px]" /><Skeleton className="h-32 rounded-[18px]" /><Skeleton className="h-32 rounded-[18px]" /><Skeleton className="h-32 rounded-[18px]" /></div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Metric tone="green" value={stats.pickups}                       label="Pickups"
                    sub={scope === 'month' ? 'this month' : 'all time'}      icon={<Truck size={18} />} />
            <Metric tone="sky"   value={Math.round(stats.miles * 10) / 10}    unit="mi" label="Miles driven"
                    sub={stats.pickups > 0 ? `~${Math.round(stats.miles / stats.pickups)} mi / pickup` : '—'}
                    icon={<Route size={18} />} />
            <Metric tone="clay"  value={stats.stores}                         label="Stores"
                    sub="picked up from"                                       icon={<Store size={18} />} />
            <Metric tone="amber" value={Math.round((stats.minutes / 60) * 10) / 10} unit="hrs" label="Hours"
                    sub={stats.pickups > 0 ? `~${Math.round(stats.minutes / stats.pickups)} min / pickup` : '—'}
                    icon={<Clock size={18} />} />
            {/* Impact tiles — non-metric estimates the driver actually cares about. */}
            <Metric tone="green" value={stats.families ?? stats.stores}        label="Families helped"
                    sub="distinct stores served"                                icon={<Users2 size={18} />} />
            <Metric tone="clay"  value={stats.meals ?? 0}                      label="Meals rescued"
                    sub="~15 meals per pickup"                                  icon={<UtensilsCrossed size={18} />} />
          </div>
        )}

        <div className="flex justify-between items-center mt-5 mb-2 text-[10.5px] font-extrabold uppercase tracking-[.05em] text-muted">
          Recent pickups <a href={exportCSV(rows)} download="zlz-activity.csv" className="text-forest text-[12px] font-bold normal-case tracking-normal">Export</a>
        </div>

        <div className="border border-line rounded-[16px] divide-y divide-line overflow-hidden bg-paper">
          {rows.length === 0 && <div className="px-4 py-6 text-center text-muted text-[13px]">No trips logged yet — complete a pickup and capture it.</div>}
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
    <div className={cx('rounded-[18px] border p-4', s.bg)}>
      <span className={cx('grid h-[34px] w-[34px] place-items-center rounded-[10px] mb-3', s.ic)}>{icon}</span>
      <div className="font-display font-bold leading-none text-[30px]">
        <span className={s.n}>{value}</span>
        {unit && <span className="text-[14px] text-muted ml-1">{unit}</span>}
      </div>
      <div className="text-[11px] font-extrabold uppercase tracking-[.04em] text-muted mt-1.5">{label}</div>
      <div className="text-[11px] text-muted font-semibold mt-1">{sub}</div>
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
        <div className="text-[11px] text-muted">{when}</div>
      </div>
      <div className="text-right">
        <div className="font-display font-bold text-[13px]">{r.miles != null ? `${Number(r.miles).toFixed(1)} mi` : '—'}</div>
        <div className="text-[11px] text-muted">{r.minutes != null ? `${Math.floor((r.minutes ?? 0) / 60)}h ${String((r.minutes ?? 0) % 60).padStart(2, '0')}m` : '—'}</div>
      </div>
    </div>
  );
}

function exportCSV(rows: ActivityRow[]) {
  const header = 'store,date,miles,minutes\n';
  const body   = rows.map((r) => [
    JSON.stringify(r.store_name ?? ''),
    new Date(r.completed_at).toISOString().slice(0, 10),
    r.miles ?? '',
    r.minutes ?? '',
  ].join(',')).join('\n');
  return 'data:text/csv;charset=utf-8,' + encodeURIComponent(header + body);
}
