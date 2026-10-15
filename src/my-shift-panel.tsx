/**
 * My Shift (client New UI Plan §6, Oct 2 2026) — the dispatcher's own
 * simple shift screen instead of the admin roster: recent + upcoming shifts,
 * status (upcoming / on now / signed in / late / missed / done) and
 * Sign in / Sign out. Backend: GET /api/shifts/mine, POST /api/shifts/:id/action.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { cx } from './design';

type MyShift = {
  id: number; starts_at: string; ends_at: string; notes: string | null;
  signed_in_at: string | null; signed_out_at: string | null;
};
type ShiftState = 'upcoming' | 'on_now' | 'signed_in' | 'late' | 'missed' | 'done';

const LATE_GRACE_MIN = 10;
const STATE_LABEL: Record<ShiftState, string> = {
  upcoming: 'Upcoming', on_now: 'On now — sign in', signed_in: 'Signed in',
  late: 'Signed in late', missed: 'Missed', done: 'Done',
};
const STATE_TONE: Record<ShiftState, string> = {
  upcoming: 'bg-line/70 text-muted', on_now: 'bg-amber-soft text-[#9a7415]', signed_in: 'bg-sage text-forest',
  late: 'bg-amber-soft text-[#9a7415]', missed: 'bg-clay-soft text-clay', done: 'bg-sage text-forest',
};

function stateOf(s: MyShift, now: number): ShiftState {
  const start = new Date(s.starts_at).getTime();
  const end = new Date(s.ends_at).getTime();
  const inAt = s.signed_in_at ? new Date(s.signed_in_at).getTime() : null;
  if (inAt != null) {
    if (s.signed_out_at || now > end) return inAt > start + LATE_GRACE_MIN * 60_000 ? 'late' : 'done';
    return inAt > start + LATE_GRACE_MIN * 60_000 ? 'late' : 'signed_in';
  }
  if (now > end) return 'missed';
  if (now >= start - 30 * 60_000) return 'on_now';
  return 'upcoming';
}
const fmt = (iso: string) => new Date(iso).toLocaleString('en-US', {
  weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/New_York',
});
const fmtT = (iso: string) => new Date(iso).toLocaleTimeString('en-US', {
  hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/New_York',
});

export function MyShiftPanel() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['my-shifts'],
    queryFn: () => api<{ data: MyShift[]; volunteerLinked: boolean }>('/api/shifts/mine'),
    refetchInterval: 60_000,
  });
  const act = useMutation({
    mutationFn: ({ id, action }: { id: number; action: 'sign-in' | 'sign-out' }) =>
      api(`/api/shifts/${id}/action`, { method: 'POST', body: JSON.stringify({ action }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-shifts'] }),
    onError: (e: any) => alert(e?.message || 'Could not update the shift'),
  });
  const now = Date.now();
  const rows = q.data?.data ?? [];
  const current = rows.filter((s) => {
    const st = stateOf(s, now);
    return st === 'on_now' || ((st === 'signed_in' || st === 'late') && !s.signed_out_at && now <= new Date(s.ends_at).getTime());
  });
  const upcoming = rows.filter((s) => stateOf(s, now) === 'upcoming');
  const past = rows.filter((s) => new Date(s.ends_at).getTime() < now).reverse();

  if (q.isLoading) return <div className="text-[13px] text-muted">Loading your shifts…</div>;
  if (q.isError) return <div className="text-[13px] text-clay">Couldn't load your shifts.</div>;
  if (q.data && !q.data.volunteerLinked) {
    return (
      <div className="rounded-[14px] border border-line bg-paper px-4 py-3 text-[13px] text-muted">
        Your login isn't linked to a dispatcher profile yet, so there are no shifts to show. Ask the office to link it.
      </div>
    );
  }
  const card = (s: MyShift, actions: boolean) => {
    const st = stateOf(s, now);
    return (
      <div key={s.id} className="rounded-[14px] border border-line bg-paper px-4 py-3 flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[200px]">
          <div className="font-bold text-[14px]">{fmt(s.starts_at)} – {fmtT(s.ends_at)}</div>
          <div className="text-[11.5px] text-muted">
            {s.signed_in_at ? `Signed in ${fmtT(s.signed_in_at)}` : 'Not signed in'}
            {s.signed_out_at ? ` · Signed out ${fmtT(s.signed_out_at)}` : ''}
            {s.notes ? ` · ${s.notes}` : ''}
          </div>
        </div>
        <span className={cx('text-[11px] font-bold px-2.5 py-1 rounded-full', STATE_TONE[st])}>{STATE_LABEL[st]}</span>
        {actions && !s.signed_in_at && (
          <button disabled={act.isPending} onClick={() => act.mutate({ id: s.id, action: 'sign-in' })}
                  className="haptic rounded-[10px] bg-forest px-4 py-2 text-[13px] font-bold text-paper disabled:opacity-50">Sign in</button>
        )}
        {actions && s.signed_in_at && !s.signed_out_at && (
          <button disabled={act.isPending} onClick={() => act.mutate({ id: s.id, action: 'sign-out' })}
                  className="haptic rounded-[10px] border border-line px-4 py-2 text-[13px] font-bold text-forest disabled:opacity-50">Sign out</button>
        )}
      </div>
    );
  };
  const section = (title: string, list: MyShift[], actions: boolean, empty: string) => (
    <section className="space-y-2">
      <div className="text-[11px] font-extrabold uppercase tracking-[.05em] text-muted">{title}</div>
      {list.length === 0
        ? <div className="rounded-[14px] border border-line bg-paper px-4 py-3 text-[13px] text-muted">{empty}</div>
        : list.map((s) => card(s, actions))}
    </section>
  );
  return (
    <div className="space-y-5">
      {section('Now', current, true, 'No shift right now.')}
      {section('Coming up', upcoming, false, 'No upcoming shifts in the next two weeks.')}
      {section('Last 7 days', past, false, 'No shifts in the last week.')}
    </div>
  );
}
