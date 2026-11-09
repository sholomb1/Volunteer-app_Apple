/**
 * Nov 3 client: "Find a driver" on an open pickup (pickup page in the office). A ranked list of drivers who may
 * be texted now (their settings, away / paused / quiet times are respected), best first, with the why in plain
 * words ("2.1 mi away · on call now · says yes 7 of 10"). 📞 Call rings through the office phone; 💬 Text opens
 * a ready message about the store and time — nothing is sent until you press Send.
 * API: GET /api/dispatch/find-driver/:pickupId (routes/dispatch.ts).
 */
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { callNumber } from './office-phone';
import { openOfficeText } from './office-texts';

type Row = { volunteerId: number; name: string; first: string; phone: string | null; miles: number | null; onCall: boolean; today: number; why: string };
type Data = { pickup: { label: string; place: string; time: string | null; today: boolean; located: boolean }; rows: Row[]; skipped: Array<{ reason: string; n: number }> };

export function readyMessage(first: string, place: string, time: string | null, today: boolean) {
  // the sender's name is added under it by the first-text-of-the-day sign-off
  return `Hi ${first || 'there'}, can you do a pickup at ${place}${time ? ` at ${time}` : ''}${today ? ' today' : ''}? Please reply here. Thank you!`;
}

export function FindDriverButton({ pickupId, className }: { pickupId: number; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} data-find-driver
              className={className ?? 'haptic inline-flex items-center gap-1.5 text-[12.5px] font-bold text-forest bg-paper border border-forest/40 px-3 py-2 rounded-[8px]'}>
        🔎 Find a driver
      </button>
      {open && <DriverFinderModal pickupId={pickupId} onClose={() => setOpen(false)} />}
    </>
  );
}

export function DriverFinderModal({ pickupId, onClose }: { pickupId: number; onClose: () => void }) {
  const q = useQuery({ queryKey: ['find-driver', pickupId], staleTime: 60_000,
    queryFn: () => api<{ data: Data }>(`/api/dispatch/find-driver/${pickupId}`) });
  const d = q.data?.data;
  const [showAll, setShowAll] = useState(false);
  const rows = d ? (showAll ? d.rows : d.rows.slice(0, 10)) : [];
  const btn = 'haptic shrink-0 rounded-[10px] px-3 py-1.5 text-[12.5px] font-bold';
  return createPortal(
    <div className="fixed inset-0 z-[2100] flex items-end sm:items-center justify-center bg-ink/40 p-0 sm:p-4" onClick={onClose}>
      <div className="w-full sm:max-w-[640px] max-h-[90vh] overflow-y-auto rounded-t-[18px] sm:rounded-[18px] bg-paper p-5 shadow-xl" onClick={(e) => e.stopPropagation()} data-driver-finder>
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="font-display font-semibold text-[18px] text-ink">🔎 Find a driver</h3>
            {d && <div className="text-[13px] text-muted">{d.pickup.label}{d.pickup.today ? ' · today' : ''}</div>}
          </div>
          <button type="button" onClick={onClose} className="text-[13px] font-bold text-muted">✕ Close</button>
        </div>
        <div className="text-[12px] text-muted mt-1">Best first: close by, on call now, says yes often and fast, not busy today. Only drivers we may text now. Nothing is sent until you press Send.</div>
        {!d && <div className="text-[13px] text-muted mt-3">{q.isError ? ((q.error as any)?.body?.error || "Couldn't load the drivers.") : 'Looking…'}</div>}
        {d && !d.pickup.located && <div className="text-[12px] text-clay font-bold mt-2">This pickup has no map spot, so distance isn't used.</div>}
        {d && d.rows.length === 0 && <div className="text-[13px] text-muted mt-3">No driver can be texted right now.</div>}
        <div className="divide-y divide-line/70 mt-2">
          {rows.map((r, i) => (
            <div key={r.volunteerId} className="py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5" data-finder-row>
              <span className="w-[22px] text-[13px] font-bold text-muted">{i + 1}.</span>
              <div className="min-w-0 flex-1 basis-[240px]">
                <button type="button" onClick={() => { window.dispatchEvent(new CustomEvent('zlz:open-volunteer', { detail: { id: r.volunteerId, tab: 'overview' }, cancelable: true })); onClose(); }}
                        className="font-bold text-[14px] text-ink hover:underline text-left">{r.name}</button>
                <div className="text-[12.5px] text-muted">{r.why}</div>
              </div>
              {r.phone && <span className="flex gap-1.5">
                <button type="button" onClick={() => callNumber(r.phone)} className={`${btn} bg-forest text-paper`}>📞 Call</button>
                <button type="button" onClick={() => openOfficeText(r.phone, r.name, readyMessage(r.first, d!.pickup.place, d!.pickup.time, d!.pickup.today))}
                        className={`${btn} border border-forest/40 text-forest bg-paper`}>💬 Text</button>
              </span>}
            </div>
          ))}
        </div>
        {d && d.rows.length > 10 && !showAll && <button type="button" onClick={() => setShowAll(true)} className="mt-2 text-[12.5px] font-bold text-forest underline">Show {d.rows.length - 10} more</button>}
        {d && d.skipped.length > 0 && (
          <div className="mt-3 text-[12px] text-muted">Not listed (can't be texted now): {d.skipped.map((s) => `${s.reason} ${s.n}`).join(' · ')}</div>
        )}
      </div>
    </div>, document.body);
}
