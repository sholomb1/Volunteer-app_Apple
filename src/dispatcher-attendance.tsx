/**
 * Admin → Dispatchers → Attendance (client New UI Plan §6, Oct 2 2026).
 * Login status + last activity for every staff/dispatcher login, and every
 * shift from 7 days back to 7 days ahead with actual sign-in / sign-out and
 * a Late / Missed status. Read-only; data from GET /api/admin/dispatchers and
 * GET /api/shifts (zlz.shifts.signed_in_at / signed_out_at).
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { cx, SearchBar } from './design';

type Staff = { id: number; firstName: string | null; lastName: string | null; role: string; isActive: boolean; lastLoginAt: string | null; lastSeenAt?: string | null };
function presence(u: Staff, now: number): { label: string; tone: string } {
  if (!u.isActive) return { label: 'Disabled', tone: 'text-clay' };
  const seen = u.lastSeenAt ? new Date(u.lastSeenAt).getTime() : null;
  if (seen != null && now - seen <= 5 * 60_000) return { label: '🟢 Online now', tone: 'text-forest' };
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: ET }).format(new Date(now));
  if (seen != null && new Intl.DateTimeFormat('en-CA', { timeZone: ET }).format(new Date(seen)) === today) return { label: 'Active today', tone: 'text-forest' };
  return { label: 'Offline', tone: 'text-muted' };
}
type Shift = {
  id: number; volunteer_id: number; starts_at: string; ends_at: string; notes: string | null;
  signed_in_at: string | null; signed_out_at: string | null;
  first_name: string | null; last_name: string | null; unit_number: number | null;
};
type St = 'upcoming' | 'on_now' | 'signed_in' | 'late' | 'missed' | 'done';
const LATE_GRACE_MIN = 10;
const LABEL: Record<St, string> = { upcoming: 'Upcoming', on_now: 'On now — not signed in', signed_in: 'Signed in', late: 'Late', missed: 'Missed', done: 'Done' };
const TONE: Record<St, string> = {
  upcoming: 'bg-line/70 text-muted', on_now: 'bg-amber-soft text-[#9a7415]', signed_in: 'bg-sage text-forest',
  late: 'bg-amber-soft text-[#9a7415]', missed: 'bg-clay-soft text-clay', done: 'bg-sage text-forest',
};
function stateOf(s: Shift, now: number): St {
  const start = new Date(s.starts_at).getTime(), end = new Date(s.ends_at).getTime();
  const inAt = s.signed_in_at ? new Date(s.signed_in_at).getTime() : null;
  if (inAt != null) {
    if (inAt > start + LATE_GRACE_MIN * 60_000) return 'late';
    return s.signed_out_at || now > end ? 'done' : 'signed_in';
  }
  if (now > end) return 'missed';
  if (now >= start) return 'on_now';
  return 'upcoming';
}
const ET = 'America/New_York';
const fmtDT = (iso: string) => new Date(iso).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: ET });
const fmtT = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: ET });
const isoDay = (offset: number) => {
  const d = new Date(new Intl.DateTimeFormat('en-CA', { timeZone: ET }).format(new Date()) + 'T12:00:00');
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};

export function DispatcherAttendancePanel() {
  const [q, setQ] = useState('');
  const [only, setOnly] = useState<'' | 'late' | 'missed'>('');
  const staff = useQuery({ queryKey: ['admin-dispatchers-attendance'], queryFn: () => api<{ data: Staff[] }>('/api/admin/dispatchers'), refetchInterval: 60_000 });
  const from = isoDay(-7), to = isoDay(7);
  const shifts = useQuery({
    queryKey: ['shifts-attendance', from, to],
    queryFn: () => api<{ data: Shift[] }>(`/api/shifts?from=${from}&to=${to}`),
    refetchInterval: 60_000,
  });
  const now = Date.now();
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (shifts.data?.data ?? [])
      .map((s) => ({ s, st: stateOf(s, now) }))
      .filter(({ s, st }) => (!only || st === only) && (!needle || JSON.stringify(s).toLowerCase().includes(needle)));
  }, [shifts.data, q, only, now]);
  const all = (shifts.data?.data ?? []).map((s) => stateOf(s, now));
  const late = all.filter((x) => x === 'late').length;
  const missed = all.filter((x) => x === 'missed').length;
  const th = 'px-3 py-2 text-left text-[11px] font-extrabold uppercase tracking-[.05em] text-muted whitespace-nowrap';
  const chip = (on: boolean) => cx('haptic px-3 py-1.5 rounded-full text-[12px] font-bold border', on ? 'bg-forest text-paper border-forest' : 'bg-paper text-muted border-line');

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <div className="text-[11px] font-extrabold uppercase tracking-[.05em] text-muted">Logins · who's on now and last activity</div>
        <div className="rounded-[14px] border border-line bg-paper overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="border-b border-line"><tr>
              <th className={th}>Name</th><th className={th}>Role</th><th className={th}>Status</th><th className={th}>Last active</th><th className={th}>Last login</th>
            </tr></thead>
            <tbody>
              {(staff.data?.data ?? []).map((u) => (
                <tr key={u.id} className="border-b border-line/70">
                  <td className="px-3 py-2 font-bold">{[u.firstName, u.lastName].filter(Boolean).join(' ') || `User #${u.id}`}</td>
                  <td className="px-3 py-2 capitalize">{u.role}</td>
                  <td className={cx('px-3 py-2 font-bold whitespace-nowrap', presence(u, now).tone)}>{presence(u, now).label}</td>
                  <td className="px-3 py-2 text-muted whitespace-nowrap">{u.lastSeenAt ? fmtDT(u.lastSeenAt) : '—'}</td>
                  <td className="px-3 py-2 text-muted whitespace-nowrap">{u.lastLoginAt ? fmtDT(u.lastLoginAt) : 'Never'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <DutySection />
      <SessionsSection />

      <section className="space-y-2">
        <div className="text-[11px] font-extrabold uppercase tracking-[.05em] text-muted">Shifts · last 7 days to next 7 days</div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setOnly('')} className={chip(only === '')}>All</button>
          <button onClick={() => setOnly(only === 'late' ? '' : 'late')} className={chip(only === 'late')}>Late · {late}</button>
          <button onClick={() => setOnly(only === 'missed' ? '' : 'missed')} className={chip(only === 'missed')}>Missed · {missed}</button>
          <SearchBar value={q} onChange={setQ} placeholder="Search name, unit #, notes…" />
        </div>
        {shifts.isLoading ? <div className="text-[13px] text-muted">Loading…</div> :
         rows.length === 0 ? <div className="rounded-[14px] border border-line bg-paper px-4 py-3 text-[13px] text-muted">No shifts match.</div> : (
          <div className="rounded-[14px] border border-line bg-paper overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="border-b border-line"><tr>
                <th className={th}>Shift</th><th className={th}>Who</th><th className={th}>Signed in</th><th className={th}>Signed out</th><th className={th}>Status</th><th className={th}>Notes</th>
              </tr></thead>
              <tbody>
                {rows.map(({ s, st }) => (
                  <tr key={s.id} className="border-b border-line/70">
                    <td className="px-3 py-2 whitespace-nowrap">{fmtDT(s.starts_at)} – {fmtT(s.ends_at)}</td>
                    <td className="px-3 py-2 font-bold whitespace-nowrap">{[s.first_name, s.last_name].filter(Boolean).join(' ')}{s.unit_number != null ? ` #${s.unit_number}` : ''}</td>
                    <td className="px-3 py-2 text-muted">{s.signed_in_at ? fmtT(s.signed_in_at) : '—'}</td>
                    <td className="px-3 py-2 text-muted">{s.signed_out_at ? fmtT(s.signed_out_at) : '—'}</td>
                    <td className="px-3 py-2"><span className={cx('text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap', TONE[st])}>{LABEL[st]}</span></td>
                    <td className="px-3 py-2 text-muted">{s.notes ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="text-[11.5px] text-muted">
          Logging in to the portal during a shift (from 30 minutes before it starts) signs the shift in automatically;
          signing out of the portal during the shift signs it out. Late = signed in more than {LATE_GRACE_MIN} minutes after the start.
        </div>
      </section>
    </div>
  );
}

type Session = { id: number; userId: number; name: string | null; role: string; loginAt: string; lastSeenAt: string; logoutAt: string | null; endReason: string | null };
function SessionsSection() {
  const [who, setWho] = useState('');
  const q = useQuery({
    queryKey: ['admin-sessions'],
    queryFn: () => api<{ data: Session[] }>('/api/admin/sessions?days=7'),
    refetchInterval: 60_000,
  });
  const rows = (q.data?.data ?? []).filter((s) => !who.trim() || (s.name ?? '').toLowerCase().includes(who.trim().toLowerCase()));
  const th = 'px-3 py-2 text-left text-[11px] font-extrabold uppercase tracking-[.05em] text-muted whitespace-nowrap';
  const dur = (s: Session) => {
    const end = s.logoutAt ? new Date(s.logoutAt).getTime() : new Date(s.lastSeenAt).getTime();
    const min = Math.max(0, Math.round((end - new Date(s.loginAt).getTime()) / 60_000));
    return min < 60 ? `${min} min` : `${Math.floor(min / 60)}h ${min % 60}m`;
  };
  const how: Record<string, string> = { logout: 'Signed out', idle: 'Idle 15 min', new_login: 'Logged in again' };
  return (
    <section className="space-y-2">
      <div className="text-[11px] font-extrabold uppercase tracking-[.05em] text-muted">Log in / log out · last 7 days</div>
      <SearchBar value={who} onChange={setWho} placeholder="Search by name…" />
      {q.isLoading ? <div className="text-[13px] text-muted">Loading…</div> :
       rows.length === 0 ? <div className="rounded-[14px] border border-line bg-paper px-4 py-3 text-[13px] text-muted">No logins recorded yet.</div> : (
        <div className="rounded-[14px] border border-line bg-paper overflow-x-auto max-h-[420px] overflow-y-auto">
          <table className="w-full text-[13px]">
            <thead className="border-b border-line sticky top-0 bg-paper"><tr>
              <th className={th}>Who</th><th className={th}>Logged in</th><th className={th}>Logged out</th><th className={th}>Time on</th><th className={th}>How it ended</th>
            </tr></thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id} className="border-b border-line/70">
                  <td className="px-3 py-2 font-bold whitespace-nowrap">{s.name ?? `User #${s.userId}`} <span className="text-muted font-normal capitalize">· {s.role}</span></td>
                  <td className="px-3 py-2 whitespace-nowrap">{fmtDT(s.loginAt)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{s.logoutAt ? fmtDT(s.logoutAt) : <span className="text-forest font-bold">🟢 Still on</span>}</td>
                  <td className="px-3 py-2 text-muted whitespace-nowrap">{dur(s)}</td>
                  <td className="px-3 py-2 text-muted whitespace-nowrap">{s.endReason ? (how[s.endReason] ?? s.endReason) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

type DutyLog = { id: number; userId: number; name: string | null; role: string; onAt: string; offAt: string | null; offReason: string | null };
type DutyTotal = { userId: number; name: string | null; todayMin: number | null; rangeMin: number | null };
function DutySection() {
  const q = useQuery({
    queryKey: ['duty-history'],
    queryFn: () => api<{ data: { log: DutyLog[]; totals: DutyTotal[]; days: number } }>('/api/duty/history?days=7'),
    refetchInterval: 60_000,
  });
  const hm = (min: number | null | undefined) => { const m = Math.max(0, Number(min ?? 0)); return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`; };
  const why: Record<string, string> = { manual: 'Went off duty', idle: 'Idle 15 min', signed_out: 'Signed out of portal', new_on: 'Went on again' };
  const th = 'px-3 py-2 text-left text-[11px] font-extrabold uppercase tracking-[.05em] text-muted whitespace-nowrap';
  const log = q.data?.data.log ?? [];
  const totals = q.data?.data.totals ?? [];
  return (
    <section className="space-y-2">
      <div className="text-[11px] font-extrabold uppercase tracking-[.05em] text-muted">On duty · time logged in · last 7 days</div>
      {q.isLoading ? <div className="text-[13px] text-muted">Loading…</div> : totals.length === 0 ? (
        <div className="rounded-[14px] border border-line bg-paper px-4 py-3 text-[13px] text-muted">Nobody has gone on duty yet. Dispatchers use the "Go on duty" button at the top of the portal.</div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {totals.map((t) => (
              <div key={t.userId} className="rounded-[12px] border border-line bg-paper px-4 py-3">
                <div className="font-bold text-[13.5px]">{t.name ?? `User #${t.userId}`}</div>
                <div className="text-[12px] text-muted">Today: <b className="text-ink">{hm(t.todayMin)}</b> · 7 days: <b className="text-ink">{hm(t.rangeMin)}</b></div>
              </div>
            ))}
          </div>
          <div className="rounded-[14px] border border-line bg-paper overflow-x-auto max-h-[360px] overflow-y-auto">
            <table className="w-full text-[13px]">
              <thead className="border-b border-line sticky top-0 bg-paper"><tr>
                <th className={th}>Who</th><th className={th}>On duty</th><th className={th}>Off duty</th><th className={th}>Time on</th><th className={th}>How it ended</th>
              </tr></thead>
              <tbody>
                {log.map((d) => {
                  const end = d.offAt ? new Date(d.offAt).getTime() : Date.now();
                  return (
                    <tr key={d.id} className="border-b border-line/70">
                      <td className="px-3 py-2 font-bold whitespace-nowrap">{d.name ?? `User #${d.userId}`}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{fmtDT(d.onAt)}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{d.offAt ? fmtDT(d.offAt) : <span className="text-forest font-bold">🟢 On now</span>}</td>
                      <td className="px-3 py-2 text-muted whitespace-nowrap">{hm(Math.round((end - new Date(d.onAt).getTime()) / 60_000))}</td>
                      <td className="px-3 py-2 text-muted whitespace-nowrap">{d.offReason ? (why[d.offReason] ?? d.offReason) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
