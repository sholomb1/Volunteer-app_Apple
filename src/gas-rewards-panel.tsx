/**
 * Oct 8 client: Reports → Rewards. Pickups in each driver's own 30-day period
 * (starts at their first done pickup): 4+ = $10 ice cream gift card,
 * 8+ = $25 gas card (office can change it). Each reward once per period;
 * giving the ice cream doesn't restart the count (Oct 9).
 * Office only (drivers don't see it). Shows who's due, a Give button that
 * records it in the rewards ledger, who's on the way, and what was given.
 * Counts Completed pickups (kiosk sign-in, office marked done, or the driver
 * replied DONE).
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Gift } from 'lucide-react';
import { api, canWrite, getUser } from './api';
import { Button, cx } from './design';
import { uiConfirm } from './ui-dialogs';
import { NotCheckedInSection } from './profiles';

// Oct 9 client: key = the reward's stable id (renaming can't make it payable twice).
type Tier = { count: number; amountUsd: number; label: string; key?: string };
type Rule = { windowDays: number; tiers: Tier[] };
type DriverRow = {
  volunteerId: number; name: string; unitNumber: string | null; phone: string | null;
  completed: number; notCheckedIn: number; lastDone: string | null; lastGiven: string | null;
  periodStart: string | null; periodEnd: string | null;
  due: DueItem[]; dueTier: number; nextLabel: string | null; toNext: number;
};
type DueItem = { tier: number; periodStart: string; periodEnd: string; completed: number };
type GivenRow = { id: number; volunteerName: string; amountUsd: string; givenAt: string; reason: string | null; givenByName: string | null };

const money = (n: number | string) => `$${Number(n).toFixed(Number(n) % 1 ? 2 : 0)}`;
const fmtDay = (d: string | null) => (d ? new Date(`${String(d).slice(0, 10)}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
const input = 'rounded-[10px] border-[1.4px] border-line bg-paper px-3 py-2 text-[14px] outline-none focus:border-forest';

function RuleForm({ current, onDone }: { current: Rule; onDone: () => void }) {
  const qc = useQueryClient();
  const [days, setDays] = useState(String(current.windowDays));
  const [tiers, setTiers] = useState(current.tiers.map((t) => ({ count: String(t.count), amount: String(t.amountUsd), label: t.label, key: t.key, was: t.label })));
  const [err, setErr] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => api('/api/gas-milestones/settings', {
      method: 'PUT', body: JSON.stringify({
        windowDays: Number(days),
        tiers: tiers.map((t) => ({ count: Number(t.count), amountUsd: Number(t.amount), label: t.label.trim(), ...(t.key ? { key: t.key } : {}) })),
      }),
    }),
    onSuccess: () => { setErr(null); qc.invalidateQueries({ queryKey: ['gas-milestones'] }); onDone(); },
    onError: (e: any) => setErr(e?.message ?? 'Could not save'),
  });
  const set = (i: number, k: 'count' | 'amount' | 'label', v: string) => setTiers((ts) => ts.map((t, j) => (j === i ? { ...t, [k]: v } : t)));
  return (
    <div className="rounded-[14px] border border-sage-line bg-sage/40 p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-[14px]">
        Each driver's period is <input type="number" min={1} value={days} onChange={(e) => setDays(e.target.value)} className={input + ' w-[80px]'} /> days (starts at their first pickup)
      </div>
      {tiers.map((t, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2 text-[14px]">
          <input type="number" min={1} value={t.count} onChange={(e) => set(i, 'count', e.target.value)} className={input + ' w-[70px]'} />
          or more pickups = $
          <input type="number" min={0} step="0.01" value={t.amount} onChange={(e) => set(i, 'amount', e.target.value)} className={input + ' w-[80px]'} />
          <input value={t.label} onChange={(e) => set(i, 'label', e.target.value)} className={input + ' w-[200px]'} placeholder="e.g. Gas card" />
          {/* Oct 9 client: rewards are matched by a hidden id, not the name. */}
          {t.was && t.label.trim() && t.label.trim() !== t.was && (
            <span className="text-[12px] font-semibold text-forest">Renaming is fine — past rewards still count.</span>
          )}
        </div>
      ))}
      {err && <div className="text-clay text-[13px] font-bold">{err}</div>}
      <div className="flex gap-2">
        <Button size="sm" variant="forest" loading={save.isPending} onClick={() => save.mutate()}>Save</Button>
        <Button size="sm" variant="plain" onClick={onDone}>Cancel</Button>
      </div>
    </div>
  );
}

export function GasRewardsReport() {
  const qc = useQueryClient();
  const editable = canWrite(getUser()?.role);
  const [editRule, setEditRule] = useState(false);
  const [showAll, setShowAll] = useState(false);
  // Oct 9 client: "Mark done" next to a driver's Not checked in count.
  const [settleFor, setSettleFor] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['gas-milestones'], queryFn: () => api<{ data: { rule: Rule; drivers: DriverRow[] } }>('/api/gas-milestones') });
  const history = useQuery({ queryKey: ['gas-rewards-history'], queryFn: () => api<{ data: GivenRow[] }>('/api/gas-rewards') });
  const give = useMutation({
    mutationFn: (x: { volunteerId: number; tier: number; periodStart: string }) => api('/api/gas-milestones/give', { method: 'POST', body: JSON.stringify(x) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['gas-milestones'] });
      qc.invalidateQueries({ queryKey: ['gas-rewards-history'] });
    },
  });

  if (q.isLoading) return <div className="text-[13px] text-muted">Loading…</div>;
  if (q.isError) return <div className="text-[13px] text-clay">Couldn't load. <button onClick={() => q.refetch()} className="underline font-bold">Try again</button></div>;
  const { rule, drivers } = q.data!.data;
  const due = drivers.flatMap((d) => d.due.map((x) => ({ d, x })));
  const others = drivers.filter((d) => d.dueTier < 0);
  const shown = showAll ? others : others.slice(0, 15);
  const given = (history.data?.data ?? []).filter((r) => /^Reward(:|\[)/.test(String(r.reason ?? '')));
  const period = (s: string | null, e: string | null) => (s && e ? `${fmtDay(s).replace(/, \d{4}$/, '')} – ${fmtDay(e)}` : '—');

  async function onGive(d: DriverRow, x: DueItem) {
    const t = rule.tiers[x.tier]!;
    if (await uiConfirm(`Give ${d.name} a ${money(t.amountUsd)} ${t.label}?\n\n${x.completed} pickups in their period ${period(x.periodStart, x.periodEnd)}.`)) {
      give.mutate({ volunteerId: Number(d.volunteerId), tier: Number(x.tier), periodStart: String(x.periodStart).slice(0, 10) }); // Oct 14 client: ids came as text
    }
  }

  return (
    <div className="space-y-4">
      {editRule ? <RuleForm current={rule} onDone={() => setEditRule(false)} /> : (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-[14px] border border-line bg-paper px-4 py-3">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px] text-ink">
            <Gift size={16} className="text-forest" />
            Pickups in each driver's {rule.windowDays}-day period:
            {rule.tiers.map((t, i) => (
              <span key={i}><b>{t.count}+</b> = {money(t.amountUsd)} {t.label}{i < rule.tiers.length - 1 ? ' ·' : ''}</span>
            ))}
          </div>
          {editable && <Button size="sm" variant="plain" onClick={() => setEditRule(true)}>Change</Button>}
        </div>
      )}

      <div>
        <div className="text-[13px] font-extrabold uppercase tracking-[.06em] text-muted mb-1.5">Due a reward ({due.length})</div>
        {due.length === 0 ? (
          <div className="text-[13px] text-muted rounded-[12px] border border-line bg-paper px-4 py-4">Nobody is due right now.</div>
        ) : (
          <ul className="divide-y divide-line rounded-[12px] border border-line bg-paper">
            {due.map(({ d, x }) => {
              const t = rule.tiers[x.tier]!;
              const current = x.periodStart === d.periodStart;
              return (
                <li key={`${d.volunteerId}-${x.periodStart}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <div className="text-[14px] font-bold text-ink">{d.name}{d.unitNumber ? <span className="text-muted font-normal"> · #{d.unitNumber}</span> : null}</div>
                    <div className="text-[12px] text-muted">
                      {x.completed} pickups · {current ? 'period' : 'last period'} {period(x.periodStart, x.periodEnd)}
                      {current && d.nextLabel ? ` · ${d.toNext} more for ${d.nextLabel}` : ''}
                      {d.lastGiven ? ` · last reward ${fmtDay(d.lastGiven)}` : ''}
                    </div>
                  </div>
                  {editable && (
                    <Button size="sm" variant="forest"
                            loading={give.isPending && give.variables?.volunteerId === d.volunteerId && give.variables?.periodStart === x.periodStart}
                            onClick={() => onGive(d, x)}>Give {money(t.amountUsd)} {t.label}</Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {give.isError && <div className="text-clay text-[13px] font-bold mt-1">{(give.error as Error).message}</div>}
      </div>

      <div>
        <div className="text-[13px] font-extrabold uppercase tracking-[.06em] text-muted mb-1.5">On the way</div>
        {others.length === 0 ? <div className="text-[13px] text-muted">No other drivers yet.</div> : (
          <>
            <div className="overflow-x-auto rounded-[12px] border border-line bg-paper">
              <table className="w-full text-[13px]">
                <thead className="text-left text-[11.5px] text-muted bg-cream">
                  <tr><th className="px-3 py-2">Driver</th><th className="px-3 py-2">Pickups this period</th><th className="px-3 py-2">Period</th><th className="px-3 py-2">To next reward</th><th className="px-3 py-2">Not checked in</th><th className="px-3 py-2">Last reward</th></tr>
                </thead>
                <tbody>
                  {shown.map((d) => (
                    <tr key={d.volunteerId} className="border-t border-line">
                      <td className="px-3 py-2 font-semibold">{d.name}</td>
                      <td className="px-3 py-2">{d.completed}</td>
                      <td className="px-3 py-2 text-muted whitespace-nowrap">{d.periodStart ? period(d.periodStart, d.periodEnd) : 'starts at next pickup'}</td>
                      <td className="px-3 py-2">{d.nextLabel ? `${d.toNext} more → ${d.nextLabel}` : '—'}</td>
                      <td className={cx('px-3 py-2 whitespace-nowrap', d.notCheckedIn > 0 && 'text-[#9a7415] font-bold')}>
                        {d.notCheckedIn || '—'}
                        {editable && d.notCheckedIn > 0 && (
                          <button onClick={() => { const who = `${d.name}${d.unitNumber ? ` #${d.unitNumber}` : ''}`; setSettleFor(settleFor === who ? null : who); }}
                                  className="haptic ml-2 text-[12px] font-bold text-forest hover:underline">Mark done</button>
                        )}
                      </td>
                      <td className="px-3 py-2 text-muted">{fmtDay(d.lastGiven)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {others.length > 15 && (
              <button onClick={() => setShowAll(!showAll)} className="haptic mt-1 text-[12.5px] font-bold text-forest hover:underline">
                {showAll ? 'Show less' : `View all ${others.length}`}
              </button>
            )}
            <div className="text-[11.5px] text-muted mt-1">"Not checked in" = took the pickup but no kiosk sign-in and no DONE reply yet. These don't count until one of those happens or the office marks them done.</div>
            {settleFor && (
              <div className="mt-3">
                <div className="mb-1 flex justify-end"><button onClick={() => setSettleFor(null)} className="haptic text-[12px] font-bold text-muted hover:text-ink">Close ✕</button></div>
                <NotCheckedInSection key={settleFor} driver={settleFor} startOpen />
              </div>
            )}
          </>
        )}
      </div>

      <div>
        <div className="text-[13px] font-extrabold uppercase tracking-[.06em] text-muted mb-1.5">Given</div>
        {given.length === 0 ? <div className="text-[13px] text-muted">Nothing given yet.</div> : (
          <ul className="divide-y divide-line rounded-[12px] border border-line bg-paper">
            {given.slice(0, 30).map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 text-[13px]">
                <span><b>{r.volunteerName}</b> <span className="text-muted">· {r.reason?.replace(/^Reward(\[\w+\])?: /, '')}</span></span>
                <span className="text-muted">{money(r.amountUsd)} · {fmtDay(r.givenAt)}{r.givenByName ? ` · by ${r.givenByName}` : ''}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
