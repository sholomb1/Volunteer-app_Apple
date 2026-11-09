/**
 * Nov 4 Yakov: center help punch in / punch out — the office side (Admin → People → Center Help).
 * People punch in / out on the kiosk (kiosk/center-help-card.tsx). Here:
 *   In the center now · Today · Hours, last 2 months (per person, with group size) · Fix a time.
 * Forgot to punch out = closed for them at the end of their shift (or 11 PM), marked "no punch-out";
 * the office can fix the time (or remove a mistaken punch).
 * API: GET /api/center-help/punches, POST /api/center-help/punches/:id/fix (vp-api routes/center-punch.ts).
 */
import { Fragment, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, canWrite, getUser } from './api';
import { cx } from './design';

const TZ = 'America/New_York';
type Visit = {
  id: number; volunteerId: number; name: string; unitNumber: number | null;
  inAt: string; outAt: string | null; groupSize: number; open: boolean; noPunchOut: boolean; fixed: boolean; minutes: number;
};
type Reply = { data: { now: string; today: string; days: number; sessions: Visit[] } };

const t12 = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });
const ymd = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ });
const hm24 = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });
const dayLabel = (iso: string) => new Date(iso).toLocaleDateString('en-US', { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric' });
export function dur(min: number): string {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m} min`;
  return m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m / 60} h`;
}
const hours = (min: number) => (Math.round(min / 6) / 10).toLocaleString('en-US', { maximumFractionDigits: 1 });

/** New York wall time 'YYYY-MM-DD' + 'HH:MM' → ISO (DST-safe). */
function nyIso(day: string, hhmm: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day), t = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m || !t) return null;
  const want = Date.UTC(+m[1], +m[2] - 1, +m[3], +t[1], +t[2]);
  let g = want + 5 * 3600e3;
  for (let i = 0; i < 3; i++) {
    const p = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date(g)).reduce((o, x) => ({ ...o, [x.type]: x.value }), {} as Record<string, string>);
    const seen = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
    if (seen === want) break;
    g += want - seen;
  }
  return new Date(g).toISOString();
}

const fix = (id: number, body: { inAt?: string; outAt?: string | null; groupSize?: number; remove?: boolean }) =>
  api<{ data: { ok: true } }>(`/api/center-help/punches/${id}/fix`, { method: 'POST', body: JSON.stringify(body) });

function Tag({ tone, children }: { tone: 'amber' | 'sage' | 'muted'; children: React.ReactNode }) {
  return <span className={cx('text-[10.5px] font-bold rounded-full px-2 py-[1px] whitespace-nowrap',
    tone === 'amber' ? 'bg-amber-soft text-[#7A5713]' : tone === 'sage' ? 'bg-sage text-forest' : 'bg-cream text-muted border border-line')}>{children}</span>;
}

function FixRow({ v, onDone }: { v: Visit; onDone: () => void }) {
  const qc = useQueryClient();
  const day = ymd(v.inAt);
  const [tin, setTin] = useState(hm24(v.inAt));
  const [tout, setTout] = useState(v.outAt && !v.open ? hm24(v.outAt) : '');
  const [g, setG] = useState(String(v.groupSize));
  const [err, setErr] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: (b: Parameters<typeof fix>[1]) => fix(v.id, b),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['center-punches'] }); onDone(); },
    onError: (e: Error) => setErr(e.message),
  });
  const save = () => {
    setErr(null);
    const inAt = nyIso(day, tin);
    const outAt = tout ? nyIso(day, tout) : null;
    if (!inAt || (tout && !outAt)) { setErr('Please type the times like 9:30 AM.'); return; }
    m.mutate({ inAt, outAt: tout ? outAt : (v.open ? undefined : null), groupSize: Math.max(1, Number(g) || 1) } as any);
  };
  const inp = 'border border-line rounded-[8px] px-2 py-1 bg-paper text-[13px]';
  return (
    <div className="rounded-[10px] border border-forest/40 bg-sage/30 px-3 py-2 mt-1 space-y-2">
      <div className="flex flex-wrap items-center gap-3 text-[12.5px]">
        <span className="font-bold text-ink">{dayLabel(v.inAt)}</span>
        <label className="flex items-center gap-1">In <input type="time" value={tin} onChange={(e) => setTin(e.target.value)} className={inp} /></label>
        <label className="flex items-center gap-1">Out <input type="time" value={tout} onChange={(e) => setTout(e.target.value)} className={inp} /></label>
        <label className="flex items-center gap-1">People <input type="number" min={1} max={500} value={g} onChange={(e) => setG(e.target.value)} className={cx(inp, 'w-[64px]')} /></label>
      </div>
      {err && <div className="text-clay text-[12px] font-semibold">{err}</div>}
      <div className="flex flex-wrap gap-2">
        <button onClick={save} disabled={m.isPending} className="haptic text-[12px] font-bold bg-forest text-paper px-3 py-1.5 rounded-[8px] disabled:opacity-50">{m.isPending ? 'Saving…' : 'Save'}</button>
        <button onClick={onDone} className="haptic text-[12px] font-bold text-muted px-3 py-1.5 rounded-[8px] border border-line">Cancel</button>
        <button onClick={() => { if (window.confirm(`Remove this visit (${dayLabel(v.inAt)}, ${t12(v.inAt)})? Only if it was a mistake.`)) m.mutate({ remove: true }); }}
                disabled={m.isPending} className="haptic ml-auto text-[12px] font-bold text-clay px-3 py-1.5 rounded-[8px]">Remove (mistake)</button>
      </div>
      <div className="text-[11px] text-muted">Times are New York time. Leave "Out" empty to keep them punched in.</div>
    </div>
  );
}

function VisitLine({ v, canFix, showName, editing, setEditing }: { v: Visit; canFix: boolean; showName?: boolean; editing: number | null; setEditing: (n: number | null) => void }) {
  return (
    <li className="py-1.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
        {showName && <span className="font-bold text-ink min-w-[150px]">{v.name}{v.unitNumber != null && <span className="text-muted font-semibold text-[11.5px]"> #{v.unitNumber}</span>}</span>}
        <span className="text-muted min-w-[92px]">{dayLabel(v.inAt)}</span>
        <span className="text-ink">{t12(v.inAt)} – {v.open ? 'now' : v.outAt ? t12(v.outAt) : '…'}</span>
        <span className="font-bold text-forest">{dur(v.minutes)}{v.open ? ' so far' : ''}</span>
        {v.groupSize > 1 && <Tag tone="sage">group of {v.groupSize}</Tag>}
        {v.noPunchOut && <Tag tone="amber">no punch-out</Tag>}
        {v.fixed && <Tag tone="muted">fixed by office</Tag>}
        {canFix && editing !== v.id && (
          <button onClick={() => setEditing(v.id)} className="haptic ml-auto text-[11.5px] font-bold text-forest underline underline-offset-2">Fix time</button>
        )}
      </div>
      {editing === v.id && <FixRow v={v} onDone={() => setEditing(null)} />}
    </li>
  );
}

export function CenterPunchPanel() {
  const qc = useQueryClient();
  const canFix = canWrite(getUser()?.role);
  const q = useQuery({ queryKey: ['center-punches'], queryFn: () => api<Reply>('/api/center-help/punches?days=60'), refetchInterval: 60_000 });
  const [editing, setEditing] = useState<number | null>(null);
  const [openPerson, setOpenPerson] = useState<number | null>(null);
  const out = useMutation({
    mutationFn: (v: Visit) => fix(v.id, { outAt: new Date().toISOString() }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['center-punches'] }),
  });
  const d = q.data?.data;
  const visits = d?.sessions ?? [];
  const inNow = visits.filter((v) => v.open);
  const today = visits.filter((v) => !v.open && ymd(v.inAt) === (d?.today ?? ''));
  const people = useMemo(() => {
    const m = new Map<number, { id: number; name: string; unitNumber: number | null; visits: Visit[]; minutes: number; personMinutes: number; maxGroup: number }>();
    for (const v of visits) {
      const p = m.get(v.volunteerId) ?? { id: v.volunteerId, name: v.name, unitNumber: v.unitNumber, visits: [], minutes: 0, personMinutes: 0, maxGroup: 1 };
      p.visits.push(v); p.minutes += v.minutes; p.personMinutes += v.minutes * v.groupSize; p.maxGroup = Math.max(p.maxGroup, v.groupSize);
      m.set(v.volunteerId, p);
    }
    return [...m.values()].sort((a, b) => b.minutes - a.minutes);
  }, [visits]);
  const totalMin = people.reduce((n, p) => n + p.minutes, 0);
  const totalPersonMin = people.reduce((n, p) => n + p.personMinutes, 0);

  if (q.isLoading) return <div className="text-[13px] text-muted py-2">Loading…</div>;
  if (q.isError) return <div className="text-[13px] text-clay py-2">Could not load the punches. Please refresh.</div>;
  return (
    <div className="space-y-4" data-center-punches>
      <div className="text-[12px] text-muted">
        People on the center help list sign in on the kiosk with their 4 digits (or name tag) and tap Punch in / Punch out.
        Forgot to punch out = closed at the end of their shift (or 11 PM) and marked "no punch-out". You can fix any time here.
      </div>
      <section>
        <div className="font-display font-bold text-[14px] text-ink mb-1">In the center now <span className="text-muted font-semibold text-[12px]">({inNow.length}{inNow.some((v) => v.groupSize > 1) ? ` · ${inNow.reduce((n, v) => n + v.groupSize, 0)} people with their groups` : ''})</span></div>
        {inNow.length === 0 ? <div className="text-[13px] text-muted italic">Nobody is punched in right now.</div> : (
          <ul className="divide-y divide-line/60">
            {inNow.map((v) => (
              <Fragment key={v.id}>
                <VisitLine v={v} canFix={canFix} showName editing={editing} setEditing={setEditing} />
                {canFix && editing !== v.id && (
                  <li className="pb-1.5 -mt-1"><button onClick={() => out.mutate(v)} disabled={out.isPending}
                          className="haptic text-[11.5px] font-bold bg-paper border border-line px-2.5 py-1 rounded-[8px] text-ink disabled:opacity-50">Punch out now</button></li>
                )}
              </Fragment>
            ))}
          </ul>
        )}
      </section>
      <section>
        <div className="font-display font-bold text-[14px] text-ink mb-1">Earlier today</div>
        {today.length === 0 ? <div className="text-[13px] text-muted italic">No finished visits yet today.</div> : (
          <ul className="divide-y divide-line/60">{today.map((v) => <VisitLine key={v.id} v={v} canFix={canFix} showName editing={editing} setEditing={setEditing} />)}</ul>
        )}
      </section>
      <section>
        <div className="font-display font-bold text-[14px] text-ink mb-1">
          Hours, last 2 months <span className="text-muted font-semibold text-[12px]">· {hours(totalMin)} h{totalPersonMin > totalMin ? ` · ${hours(totalPersonMin)} people-hours with groups` : ''}</span>
        </div>
        {people.length === 0 ? <div className="text-[13px] text-muted italic">No punches yet.</div> : (
          <div className="rounded-[10px] border border-line overflow-hidden">
            <div className="grid grid-cols-[1fr_70px_80px_120px] gap-2 px-3 py-1.5 bg-cream text-[11px] font-bold text-muted uppercase tracking-wide">
              <span>Person</span><span className="text-right">Visits</span><span className="text-right">Hours</span><span className="text-right">With group</span>
            </div>
            {people.map((p) => (
              <div key={p.id} className="border-t border-line/70">
                <button onClick={() => setOpenPerson(openPerson === p.id ? null : p.id)}
                        className="haptic w-full grid grid-cols-[1fr_70px_80px_120px] gap-2 px-3 py-2 text-left text-[13px] hover:bg-cream/50">
                  <span className="font-bold text-ink truncate">{openPerson === p.id ? '▾' : '▸'} {p.name}{p.unitNumber != null && <span className="text-muted font-semibold text-[11.5px]"> #{p.unitNumber}</span>}</span>
                  <span className="text-right">{p.visits.length}</span>
                  <span className="text-right font-bold text-forest">{hours(p.minutes)} h</span>
                  <span className="text-right text-muted">{p.personMinutes > p.minutes ? `${hours(p.personMinutes)} people-h` : '—'}</span>
                </button>
                {openPerson === p.id && (
                  <ul className="px-3 pb-2 divide-y divide-line/50">
                    {p.visits.map((v) => <VisitLine key={v.id} v={v} canFix={canFix} editing={editing} setEditing={setEditing} />)}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
        <div className="text-[11px] text-muted mt-1">"With group" = hours × the number of people they came with (people-hours).</div>
      </section>
    </div>
  );
}
