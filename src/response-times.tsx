/**
 * Oct 11 client: "how long it usually takes to respond" — one line on the driver /
 * store "At a glance" with a View all list. Backend + exact rules:
 * apps/api/src/routes/response-times.ts (GET /api/volunteers/:id/response-times,
 * GET /api/suppliers/:id/response-times).
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, loadFailText } from './api';
import { Tip } from './design';
import { fmtDay, fmtTimeEastern } from './time-format';

type Row = {
  pickupId: number; ref: string | null; date: string; driverId: number; driver: string; store: string;
  offeredAt: string; offeredBy: 'text' | 'posted'; tookAt: string; minutes: number; gaveBack: boolean;
};
type Data = { minutes: number | null; count: number; days: number; rows: Row[] };

/** 7 → "7 min", 125 → "2 hr 5 min", 3000 → "2 days 2 hr". */
export function afterText(min: number): string {
  const m = Math.round(min);
  if (m < 1) return 'under a minute';
  if (m < 60) return `${m} min`;
  if (m < 24 * 60) { const h = Math.floor(m / 60), r = m % 60; return r ? `${h} hr ${r} min` : `${h} hr`; }
  const d = Math.floor(m / 1440), h = Math.round((m % 1440) / 60);
  return `${d} day${d === 1 ? '' : 's'}${h ? ` ${h} hr` : ''}`;
}

const TIP = 'From when the pickup was first texted to drivers (or posted, if it was never texted) until the driver took it. '
  + 'Middle value over the last 90 days. Office assignments, test pickups, cancelled pickups and waits over 7 days are left out.';

export function ResponseTimeLine({ kind, id }: { kind: 'driver' | 'store'; id: number }) {
  const path = kind === 'driver' ? `/api/volunteers/${id}/response-times` : `/api/suppliers/${id}/response-times`;
  const q = useQuery({ queryKey: ['response-times', kind, id], queryFn: () => api<{ data: Data }>(path) });
  const [open, setOpen] = useState(false);
  if (q.isLoading) return null;
  if (q.isError || !q.data?.data) return <div className="text-[12px] text-clay">{loadFailText("Couldn't load how fast pickups get taken", q.error)}</div>;
  const d = q.data.data;
  if (d.minutes == null || d.count < 1) return <div className="text-[12px] text-muted">{kind === 'driver' ? 'Takes pickups: not enough pickups yet.' : 'Time to get a driver: not enough pickups yet.'}</div>;
  const n = `${d.count} pickup${d.count === 1 ? '' : 's'}`;
  return (
    <div>
      <div className="text-[12.5px] text-ink">
        {kind === 'driver' ? 'Usually takes a pickup within ' : 'Usually taken within '}
        <b>{afterText(d.minutes)}</b> <span className="text-muted">(based on {n})</span>
        <Tip text={TIP} />
        {' '}<button onClick={() => setOpen(!open)} className="haptic text-[12.5px] font-bold text-forest hover:underline">{open ? 'Hide' : 'View all'}</button>
      </div>
      {open && (
        <ul className="mt-1 max-h-[340px] overflow-y-auto divide-y divide-line rounded-[10px] border border-line bg-cream/40">
          {d.rows.map((r) => (
            <li key={`${r.pickupId}-${r.driverId}`} className="flex items-start justify-between gap-3 px-2.5 py-1.5 text-[12px]">
              <div className="min-w-0">
                <div className="font-semibold text-ink truncate">
                  {fmtDay(r.offeredAt)} · {kind === 'driver' ? r.store : (r.driver || 'Driver')}
                  {r.gaveBack && <span className="font-normal text-muted"> (gave it back later)</span>}
                </div>
                <div className="text-muted">
                  {r.offeredBy === 'text' ? 'Texted' : 'Posted'} {fmtTimeEastern(r.offeredAt)} · took it {fmtDay(r.tookAt) !== fmtDay(r.offeredAt) ? `${fmtDay(r.tookAt)} ` : ''}{fmtTimeEastern(r.tookAt)} · #{r.ref ?? r.pickupId}
                </div>
              </div>
              <div className="shrink-0 font-bold text-ink">{afterText(r.minutes)}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}