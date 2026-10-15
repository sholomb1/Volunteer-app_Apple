/**
 * Oct 8 client: per-pickup "Send SMS". A second tap sent the pickup out twice.
 * If the pickup was already texted, the server says when; we show
 * "last sent at 8:32 PM (4 minutes ago) — send again?" and only re-send on OK.
 * Returns null when the office chose not to re-send.
 */
import { upcomingSms } from './api';
import { uiConfirm } from './ui-dialogs';

function ago(ms: number): string {
  const min = Math.max(0, Math.round(ms / 60_000));
  if (min < 1) return 'just now';
  if (min < 60) return `${min} minute${min === 1 ? '' : 's'} ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? '' : 's'} ago`;
}

export async function sendPickupNowConfirmed(id: number) {
  const first = (await upcomingSms.pickupSendNow(id)).data;
  if (!first.needsConfirm || !first.lastSentAt) return first;
  const at = new Date(first.lastSentAt);
  const sameDay = at.toLocaleDateString('en-US', { timeZone: 'America/New_York' }) === new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York' });
  const when = at.toLocaleString('en-US', {
    timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', hour12: true,
    ...(sameDay ? {} : { weekday: 'short', month: 'short', day: 'numeric' }),
  });
  const to = first.lastSentTo ? ` to ${first.lastSentTo} driver${first.lastSentTo === 1 ? '' : 's'}` : '';
  const ok = await uiConfirm(`This pickup was last texted at ${when} (${ago(Date.now() - at.getTime())})${to}.\n\nSend it again?`);
  if (!ok) return null;
  return (await upcomingSms.pickupSendNow(id, false, true)).data;
}
