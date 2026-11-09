/**
 * Nov 6 client: after Away dates are saved (driver Settings, Pause for today / a week / until a date,
 * Resume now, or the office on the driver's card), a STEADY driver is asked:
 *   "You have steady pickups on those days (Hive Deli Tue, Nov 10, …). Would you like your pickups
 *    to go out to another driver for those days?"
 * Yes → he is taken off those days only (like "not available today") and they are open for the
 * group as usual. No → he stays on them. The office gets the same question about the driver.
 * After the dates are cleared / shortened: "Put you back on your steady pickups for those days?"
 * (only days still open with no other driver). Drivers on text only (no app) get it via the office.
 * API: GET/POST /api/me/settings/away-steady, /api/volunteers/:id/settings/away-steady
 * (apps/api/src/steady-away.ts).
 */
import type { QueryClient } from '@tanstack/react-query';
import { api } from './api';
import { uiConfirm, uiNotify } from './ui-dialogs';

export type AwayDay = { date: string; time: string | null; place: string };
type AwayState = { away: { from: string; to: string } | null; onIt: AwayDay[]; back: AwayDay[] };

const url = (volunteerId?: number) => (volunteerId != null ? `/api/volunteers/${volunteerId}/settings/away-steady` : '/api/me/settings/away-steady');
const dayWord = (iso: string) => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });

/** "Hive Deli Tue, Nov 10, Hive Deli Thu, Nov 12 and 3 more". */
export function awayDaysLine(days: AwayDay[], max = 4): string {
  const shown = days.slice(0, max).map((d) => `${d.place} ${dayWord(d.date)}`);
  const more = days.length - shown.length;
  return shown.join(', ') + (more > 0 ? ` and ${more} more` : '');
}

let asking = false;

/** Call after Away dates were saved. Asks only when there is something to ask. */
export async function askAwaySteady(qc: QueryClient, volunteerId?: number, name?: string): Promise<void> {
  if (asking) return;
  asking = true;
  try {
    const office = volunteerId != null;
    const who = name || 'This driver';
    let s: AwayState;
    try { s = (await api<{ data: AwayState }>(url(volunteerId))).data; } catch { return; }
    let choice: 'release' | 'back' | null = null;
    if (s.onIt.length > 0) {
      const msg = office
        ? `${who} has steady pickups on those days (${awayDaysLine(s.onIt)}).\n\nWould you like them to go out to another driver for those days?`
        : `You have steady pickups on those days (${awayDaysLine(s.onIt)}).\n\nWould you like your pickups to go out to another driver for those days?`;
      if (await uiConfirm(msg, { okLabel: 'Yes, give them to another driver', cancelLabel: office ? `No, keep ${name || 'them'} on` : "No, I'll do them" })) choice = 'release';
    } else if (s.back.length > 0) {
      const msg = office
        ? `Put ${name || 'this driver'} back on the steady pickups for those days?\n\n${awayDaysLine(s.back)}`
        : `Put you back on your steady pickups for those days?\n\n${awayDaysLine(s.back)}`;
      if (await uiConfirm(msg, { okLabel: office ? 'Yes, put them back' : 'Yes, put me back', cancelLabel: 'No' })) choice = 'back';
    }
    if (!choice) return;
    try {
      await api(url(volunteerId), { method: 'POST', body: JSON.stringify({ choice }) });
      uiNotify(choice === 'release'
        ? (office ? `Done. ${who}'s steady pickups on those days will go out to other drivers.` : 'Done. Your steady pickups on those days will go out to other drivers.')
        : (office ? `Done. ${who} is back on those steady pickups.` : "Done. You're back on your steady pickups."), 'ok');
      void qc.invalidateQueries();
    } catch {
      uiNotify("Couldn't save, try again.", 'err');
    }
  } finally {
    asking = false;
  }
}
