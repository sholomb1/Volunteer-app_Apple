/**
 * Oct 16 client: "we should have logs on each change, who did it."
 * Driver profile → "Change history": every change to the driver's settings and profile,
 * newest first — when (New York time), who ("Driver (app)", "Office: Chaya Cohen",
 * "Text STOP from 845-…", "System"), where (Driver app / Office site / Text message /
 * Automatic) and what changed ("Phone calls: Don't call → Any time").
 * Also <LastChanged field="pause|calls|reach" />: "Last changed by … · Oct 14, 1:53 AM"
 * under a setting.
 * API: GET /api/volunteers/:id/change-history (apps/api/src/routes/change-history.ts).
 */
import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { cx } from './design';

type Item = { field: string; label: string; from: string | null; to: string };
type Entry = { id: number; at: string; who: string; where: string; items: Item[]; note?: string | null; old: boolean };
type Last = { who: string; where: string; at: string } | null;
type Reply = { data: Entry[]; last: { pause: Last; calls: Last; reach: Last }; since: string | null };

export const changeHistoryKey = (volunteerId: number) => ['change-history', volunteerId];

/** "Wed, Oct 14, 1:53 PM" (New York). */
export function nyWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** The driver's history; reloads after any save made while the profile is open. */
export function useChangeHistory(volunteerId: number) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: changeHistoryKey(volunteerId),
    queryFn: () => api<Reply>(`/api/volunteers/${volunteerId}/change-history`),
    staleTime: 0,
  });
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    const off = qc.getMutationCache().subscribe((ev: any) => {
      if (ev?.type === 'updated' && ev?.action?.type === 'success') {
        clearTimeout(t);
        t = setTimeout(() => { void qc.invalidateQueries({ queryKey: changeHistoryKey(volunteerId) }); }, 400);
      }
    });
    return () => { off(); clearTimeout(t); };
  }, [qc, volunteerId]);
  return q;
}

/** "Last changed by Office: Chaya Cohen · Wed, Oct 14, 1:53 PM" under a setting. */
export function LastChanged({ volunteerId, field, className }: { volunteerId: number; field: 'pause' | 'calls' | 'reach'; className?: string }) {
  const q = useChangeHistory(volunteerId);
  const l = q.data?.last?.[field];
  if (!l) return null;
  return (
    <div data-last-changed={field} className={cx('text-[11.5px] text-muted mt-1', className)}>
      Last changed by {l.who} · {nyWhen(l.at)}
    </div>
  );
}

const WHERE_TONE: Record<string, string> = {
  'Driver app': 'bg-sky-soft text-sky-deep border-sky/40',
  'Office site': 'bg-sage text-forest border-sage-line',
  'Text message': 'bg-[#fff4d6] text-[#9a7415] border-[#e8d49a]',
  'Automatic': 'bg-line/50 text-muted border-line',
};

export function ChangeHistoryTab({ volunteerId }: { volunteerId: number }) {
  const q = useChangeHistory(volunteerId);
  if (q.isLoading) return <div className="text-[13px] text-muted">Loading…</div>;
  if (q.isError || !q.data) return <div className="text-[13px] text-clay">Couldn't load. <button onClick={() => q.refetch()} className="underline font-bold">Try again</button></div>;
  const rows = q.data.data;
  return (
    <div data-change-history className="space-y-2">
      <div className="text-[12.5px] text-muted">
        Every change to this driver's settings and profile — who did it, from where, and what changed. Newest first, New York time.
        {q.data.since ? ` Full details from ${nyWhen(q.data.since)}; older entries show what was kept then.` : ' Older entries show what was kept then.'}
      </div>
      {rows.length === 0 && <div className="text-[13px] text-muted italic">No changes recorded yet.</div>}
      <div className="space-y-1.5 max-h-[460px] overflow-y-auto pr-1">
        {rows.map((e) => (
          <div key={e.id} data-change-row className={cx('rounded-[10px] border border-line bg-paper px-3 py-2 text-[12.5px]', e.old && 'bg-cream/50')}>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-bold text-ink">{nyWhen(e.at)}</span>
              <span className="text-ink">{e.who}</span>
              <span className={cx('text-[10.5px] font-extrabold uppercase tracking-[.05em] px-2 py-0.5 rounded-full border', WHERE_TONE[e.where] ?? 'bg-cream text-ink border-line')}>{e.where}</span>
            </div>
            {e.items.length > 0 && (
              <ul className="mt-1 space-y-0.5">
                {e.items.map((i, k) => (
                  <li key={k} className="text-ink">
                    <span className="font-bold">{i.label}:</span>{' '}
                    {i.from != null ? <><span className="text-muted">{i.from}</span> → <span>{i.to}</span></> : <span>{i.to}</span>}
                  </li>
                ))}
              </ul>
            )}
            {e.note && <div className={cx('mt-0.5 text-[11.5px]', e.old ? 'text-muted italic' : 'text-muted')}>{e.note}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
