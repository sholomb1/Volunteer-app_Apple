/**
 * Oct 23 client: "✓ Only needs N driver(s)" + the cancel / dismiss warning.
 *
 * Some steady pickups were set to 2 drivers by mistake. The Live Board showed them red
 * "needs 1 more", so the office CANCELLED whole pickups that already had a driver.
 *  - The button (Live Board card + pickup page), shown when a pickup still needs drivers AND
 *    already has one: "Just today" (this pickup only) or "Every week" (steady: the steady
 *    pickup + its upcoming days). POST /api/pickup-instances/:id/drivers-needed. Texts nobody.
 *  - Cancel / Dismiss of a pickup with a driver on it warns first and offers the button.
 */
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { uiNotify } from './ui-dialogs';
import { pickupPlace } from './pickup-label';

export type DriversNeededScope = 'day' | 'steady';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type P = any; // a pickup row (Live Board PiRow or the pickup page row)

export const driversWord = (n: number) => (n === 1 ? 'driver' : 'drivers');
export const onlyNeedsLabel = (n: number) => `Only needs ${n} ${driversWord(n)}`;

/** Drivers on the pickup (same rule as the server: needed − still needs), else the sign-ups. */
export function driversOnOf(p: P): number {
  const cap = Math.max(1, Number(p.slots_capacity ?? 1) || 1);
  const rem = p.slots_remaining;
  if (rem != null && Number.isFinite(Number(rem))) return Math.max(0, cap - Math.max(0, Number(rem)));
  return (p.signups ?? []).length;
}
/** Names of the drivers on it ("Moshe Klein", "Moshe Klein and Dovid Weiss"). */
export function driverNamesOf(p: P): string {
  const cap = Math.max(1, Number(p.slots_capacity ?? 1) || 1);
  const names = [...(p.signups ?? [])]
    .sort((a: any, b: any) => (a.role === 'backup' ? 1 : 0) - (b.role === 'backup' ? 1 : 0))
    .slice(0, Math.max(cap, 1))
    .map((s: any) => `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim()).filter(Boolean);
  if (names.length <= 1) return names[0] ?? 'A driver';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export function setDriversNeeded(id: number, count: number, scope: DriversNeededScope) {
  return api<{ data: { from: number; to: number; steady: { daysChanged: number } | null } }>(
    `/api/pickup-instances/${id}/drivers-needed`, { method: 'POST', body: JSON.stringify({ count, scope }) });
}

/** Does the change + refreshes the board / pickup page + a short notice. */
export function useSetDriversNeeded() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<DriversNeededScope | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const run = async (p: P, count: number, scope: DriversNeededScope): Promise<boolean> => {
    setBusy(scope); setErr(null);
    try {
      const r = await setDriversNeeded(Number(p.id), count, scope);
      for (const k of [['admin-pickups'], ['admin-pickups-range'], ['admin-pickup-single', Number(p.id)], ['admin-pickup-detail', Number(p.id)], ['weekly-coverage'], ['steady-pickups']]) {
        void qc.invalidateQueries({ queryKey: k });
      }
      const days = r?.data?.steady?.daysChanged ?? 0;
      uiNotify(scope === 'steady'
        ? `Now needs ${count} ${driversWord(count)}, every week.${days ? ` ${days} upcoming ${days === 1 ? 'day' : 'days'} changed too.` : ''}`
        : `Now needs ${count} ${driversWord(count)} (just today).`, 'ok');
      return true;
    } catch (e: any) {
      setErr(e?.message || 'Could not change it');
      return false;
    } finally { setBusy(null); }
  };
  return { run, busy, err };
}

/** The "Just today, or every week?" box. */
export function OnlyNeedsModal({ p, have, onClose, onDone }: { p: P; have: number; onClose: () => void; onDone?: () => void }) {
  const { run, busy, err } = useSetDriversNeeded();
  const steady = p.steady_pickup_id != null;
  const cap = Math.max(1, Number(p.slots_capacity ?? 1) || 1);
  const place = pickupPlace(p as any) || 'This pickup';
  const go = async (scope: DriversNeededScope) => { if (await run(p, have, scope)) { onClose(); onDone?.(); } };
  const opt = 'haptic w-full text-left rounded-[12px] border border-line px-4 py-3 hover:bg-cream/60 disabled:opacity-50';
  return createPortal(
    <div className="fixed inset-0 z-[2150] bg-ink/50 flex items-start justify-center pt-16 px-4" onClick={onClose} data-testid="only-needs-modal">
      <div onClick={(e) => e.stopPropagation()} className="relative bg-paper rounded-[18px] shadow-lift border border-line w-full max-w-sm p-5 space-y-3">
        <div className="font-display font-semibold text-[16px]">{onlyNeedsLabel(have)}</div>
        <div className="text-[12.5px] text-muted">{place} asks for {cap} {driversWord(cap)}. {driverNamesOf(p)} {have === 1 ? 'is' : 'are'} on it.</div>
        <div className="text-[13px] font-bold text-ink">Just today, or every week?</div>
        <button className={opt} disabled={!!busy} onClick={() => void go('day')}>
          <div className="text-[13px] font-extrabold text-forest">{busy === 'day' ? 'Saving…' : 'Just today'}</div>
          <div className="text-[11.5px] text-muted">This pickup only. It stops asking for more drivers.</div>
        </button>
        {steady && (
          <button className={opt} disabled={!!busy} onClick={() => void go('steady')}>
            <div className="text-[13px] font-extrabold text-forest">{busy === 'steady' ? 'Saving…' : 'Every week'}</div>
            <div className="text-[11.5px] text-muted">The steady pickup needs {have} {driversWord(have)} from now on. Upcoming days that ask for more go down to {have} (never below the drivers already on a day).</div>
          </button>
        )}
        <div className="text-[11.5px] text-muted">Nobody gets a text.</div>
        {err && <div className="text-[12px] text-clay font-bold">{err}</div>}
        <button onClick={onClose} className="haptic w-full rounded-[12px] border border-line px-4 py-2.5 text-[13px] font-bold text-muted hover:bg-cream">Go back</button>
      </div>
    </div>,
    document.body,
  );
}

/** Show the button? Still needs drivers AND already has at least one. */
export function showOnlyNeeds(p: P, resolved: boolean): boolean {
  if (resolved || p.cancelled_at) return false;
  const have = driversOnOf(p);
  const cap = Math.max(1, Number(p.slots_capacity ?? 1) || 1);
  return have >= 1 && have < cap;
}

/** "✓ Only needs N driver(s)" — the button + its box. */
export function OnlyNeedsButton({ p, className }: { p: P; className?: string }) {
  const [open, setOpen] = useState(false);
  const have = driversOnOf(p);
  return (
    <>
      <button onClick={(e) => { e.stopPropagation(); setOpen(true); }} className={className} data-testid="only-needs-btn"
              title="The drivers already on it are enough: stop asking for more">✓ {onlyNeedsLabel(have)}</button>
      {open && <OnlyNeedsModal p={p} have={have} onClose={() => setOpen(false)} />}
    </>
  );
}

/** The warning shown before cancelling / dismissing a pickup that has a driver on it. */
export function CancelDriverWarning({ p, cancelWord = 'Cancelling', notTold = "the driver isn't told", onFewerDone, onCancelAnyway, onBack, anywayLabel = 'Cancel the pickup anyway' }: {
  p: P; cancelWord?: string; notTold?: string; onFewerDone: () => void; onCancelAnyway: () => void; onBack: () => void; anywayLabel?: string;
}) {
  const { run, busy, err } = useSetDriversNeeded();
  const have = driversOnOf(p);
  const fewer = showOnlyNeeds(p, false);
  const names = driverNamesOf(p);
  return (
    <div className="space-y-3" data-testid="cancel-driver-warning">
      <div className="rounded-[12px] border border-clay/40 bg-clay-soft px-4 py-3 text-[13px] text-ink">
        <b>{names}</b> {have > 1 ? 'are' : 'is'} assigned to this pickup. {cancelWord} removes the whole pickup ({notTold}).
        {fewer && <> If you only need fewer drivers, use '{onlyNeedsLabel(have)}' instead.</>}
      </div>
      {err && <div className="text-[12px] text-clay font-bold">{err}</div>}
      <div className="flex flex-col gap-2">
        {fewer && (
          <button disabled={!!busy} onClick={async () => { if (await run(p, have, 'day')) onFewerDone(); }}
                  className="haptic w-full rounded-[10px] bg-forest px-4 py-2 text-[13px] font-bold text-paper disabled:opacity-50">
            {busy ? 'Saving…' : onlyNeedsLabel(have)}
          </button>
        )}
        <button disabled={!!busy} onClick={onCancelAnyway}
                className="haptic w-full rounded-[10px] border border-clay/50 px-4 py-2 text-[13px] font-bold text-clay hover:bg-clay/10 disabled:opacity-50">{anywayLabel}</button>
        <button onClick={onBack} className="haptic w-full rounded-[10px] border border-line px-4 py-2 text-[13px] font-bold text-muted hover:bg-cream">Go back</button>
      </div>
    </div>
  );
}

/** The same warning as its own box (pickup page "Cancel pickup"). */
export function CancelDriverWarningModal(props: Parameters<typeof CancelDriverWarning>[0]) {
  return createPortal(
    <div className="fixed inset-0 z-[2150] bg-ink/50 flex items-start justify-center pt-16 px-4" onClick={props.onBack}>
      <div onClick={(e) => e.stopPropagation()} className="relative bg-paper rounded-[18px] shadow-lift border border-line w-full max-w-sm p-5 space-y-3">
        <div className="font-display font-semibold text-[16px]">Cancel this pickup?</div>
        <CancelDriverWarning {...props} />
      </div>
    </div>,
    document.body,
  );
}
