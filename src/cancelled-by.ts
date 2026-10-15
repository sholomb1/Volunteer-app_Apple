// Oct 14 client: a cancelled pickup says who cancelled it and when —
// "by Chaya · Oct 14, 2:14 PM", "by the store (app)", "auto (expired)".
// The API sends cancelled_by = { source, role, name } (see pickup-cancel-log.ts).
export type CancelledBy = { source?: string | null; role?: string | null; name?: string | null } | null | undefined;

export function cancelledByText(by: CancelledBy): string | null {
  if (!by || !by.role) return null;
  const name = String(by.name ?? '').trim();
  const src = String(by.source ?? '');
  if (by.role === 'auto') return src === 'auto-schedule' ? 'auto (day taken off the schedule)' : 'auto (expired)';
  if (by.role === 'store') return `by ${name || 'the store'}${src === 'store-text' ? ' (text)' : src === 'store-app' ? ' (app)' : ''}`;
  if (by.role === 'driver') return name ? `by ${name} (driver)` : 'by the driver';
  if (by.role === 'office') return `by ${name || 'the office'}`;
  return null;
}

export function cancelledWhen(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/New_York' });
}

/** Reason worth showing (not one that just repeats who did it). */
export function cancelReasonText(reason: string | null | undefined): string | null {
  const r = String(reason ?? '').replace(/^dismissed:\s*/i, '').trim();
  if (!r || /^cancelled by (store|admin)$/i.test(r)) return null;
  return r;
}

/** "by Chaya · Oct 14, 2:14 PM" (+ " — reason" when withReason). Past rows with no record: just the time. */
export function cancelledLine(p: any, withReason = false): string {
  const parts = [cancelledByText(p?.cancelled_by), cancelledWhen(p?.cancelled_at)].filter(Boolean).join(' · ');
  const why = withReason ? cancelReasonText(p?.cancellation_reason) : null;
  return [parts, why].filter(Boolean).join(' — ');
}
