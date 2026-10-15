/**
 * Oct 13 client: store texts on the office side.
 *  • Steady form: "Text the store: do you have food today?" switch + "Ask __ hours before"
 *    (off by default; saved per steady — PUT /api/steady-pickups/:id/food-check).
 *  • Pickup card: "Asked store 2:00 PM · waiting" / "Store said YES" / "Store said NO",
 *    "Send to drivers" / "Cancel today" while it's on hold, "Donor told 3:12 PM" and a
 *    "replied CANCEL" tag (from GET /api/pickup-instances → store_texts).
 */
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { uiConfirm, uiNotify } from './ui-dialogs';
import { cx } from './design';

// ---------------------------------------------------------------- steady form
export type FoodCheckSetting = { on: boolean; hours: number };

/** Loads the steady's switch; `save(id)` writes it (call after the steady itself is saved). */
export function useFoodCheckSetting(steadyId: number | null | undefined) {
  const q = useQuery({
    queryKey: ['steady-food-check', steadyId],
    queryFn: () => api<{ data: { on: boolean; leadMin: number } }>(`/api/steady-pickups/${steadyId}/food-check`),
    enabled: !!steadyId,
  });
  const [value, setValue] = useState<FoodCheckSetting>({ on: false, hours: 2 });
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    const d = q.data?.data;
    if (d && !touched) setValue({ on: !!d.on, hours: Math.round((Number(d.leadMin) || 120) / 30) / 2 });
  }, [q.data, touched]);
  const change = (v: FoodCheckSetting) => { setTouched(true); setValue(v); };
  const save = async (id: number) => {
    // Nothing to write for a new steady left off (off is the default).
    if (!touched && !q.data?.data?.on) return;
    await api(`/api/steady-pickups/${id}/food-check`, {
      method: 'PUT', body: JSON.stringify({ on: value.on, leadMin: Math.round(value.hours * 60) }),
    });
  };
  return { value, change, save };
}

export function FoodCheckBox({ value, onChange, pickupTime }: { value: FoodCheckSetting; onChange: (v: FoodCheckSetting) => void; pickupTime?: string }) {
  const askAt = (() => {
    const m = /^(\d{1,2}):(\d{2})/.exec(pickupTime ?? '');
    if (!m) return null;
    let t = Number(m[1]) * 60 + Number(m[2]) - Math.round(value.hours * 60);
    if (t < 8 * 60) t = 8 * 60;
    const h = Math.floor(t / 60); const mi = t % 60;
    return `${((h + 11) % 12) + 1}:${String(mi).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
  })();
  return (
    <div className="rounded-[10px] border border-line bg-cream/30 px-3 py-2" data-testid="food-check-box">
      <label className="flex items-center gap-2 text-[13px]">
        <input type="checkbox" className="accent-forest h-4 w-4" checked={value.on}
               onChange={(e) => onChange({ ...value, on: e.target.checked })} />
        <span>Text the store: "Do you have food today?"</span>
      </label>
      <div className={cx('mt-2 flex items-center gap-2 text-[12.5px]', !value.on && 'opacity-40')}>
        <span>Ask</span>
        <input type="number" min={1} max={12} step={0.5} disabled={!value.on} value={value.hours}
               onChange={(e) => onChange({ ...value, hours: Math.max(1, Math.min(12, Number(e.target.value) || 2)) })}
               className="w-20 rounded-[10px] border border-line bg-paper px-2 py-1.5 text-center text-[13px]" />
        <span>hours before the pickup{value.on && askAt ? ` (about ${askAt})` : ''}</span>
      </div>
      <p className="text-[11px] text-muted italic mt-2">
        Drivers aren't texted until the store answers. YES → sent to drivers. NO → today is cancelled.
        No answer by 30 minutes before → it stays on hold and the office gets an alert to call the store.
        Texts go 8 AM–10 PM, never on Shabbos / Yom Tov.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------- pickup card
/** Oct 14 client: "Driver Moshe told 8:05 AM" (the steady driver was texted after the store answered). */
export function driverToldLine(d: { at: string; kind?: string | null; names?: string[] | null } | null | undefined): string | null {
  const names = (d?.names ?? []).filter(Boolean);
  if (!d?.at || names.length === 0) return null;
  const at = new Date(d.at);
  const when = Number.isNaN(at.getTime()) ? '' : at.toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' });
  return `${names.length > 1 ? 'Drivers' : 'Driver'} ${names.join(', ')} told${d.kind === 'no' ? ' (no pickup)' : ''} ${when}`.trim();
}

type StoreTexts = {
  held?: boolean;
  food?: { action: string; at: string; c: any } | null;
  told?: { action: string; at: string } | null;
  cancel?: { at: string; kind: string | null; cancelled?: boolean | null; pickedUp?: boolean | null } | null; // Oct 14 client: cancelled automatically?
  driver?: { at: string; kind: string | null; names?: string[] | null } | null; // Oct 14 client
} | null | undefined;

const fmtNy = (iso: string | null | undefined) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' });
};

/** "Asked store 2:00 PM · waiting" / "Store said YES" / "Store said NO" … (null = nothing to show). */
export function foodCheckLine(food: { action: string; c?: any } | null | undefined, held: boolean): { text: string; tone: 'wait' | 'ok' | 'no' | 'alert' } | null {
  if (!food?.action) return null;
  const c = food.c ?? {};
  switch (food.action) {
    case 'food_check_hold': return { text: c.askAt ? `Will ask the store "food today?" at ${fmtNy(c.askAt)}` : 'Will ask the store "food today?"', tone: 'wait' };
    case 'food_check_asked': return { text: held ? `Asked store ${fmtNy(c.askedAt)} · waiting` : `Asked store ${fmtNy(c.askedAt)}`, tone: 'wait' };
    case 'food_check_no_answer': return { text: held ? `Asked store ${fmtNy(c.askedAt)} · no answer — call them` : `Asked store ${fmtNy(c.askedAt)} · no answer`, tone: held ? 'alert' : 'wait' };
    case 'food_check_skipped': return { text: held ? `Couldn't ask the store (${c.reasonText ?? 'no time'}) — call them` : `Didn't ask the store (${c.reasonText ?? 'no time'})`, tone: held ? 'alert' : 'wait' };
    case 'food_check_answer': return c.answer === 'yes' ? { text: 'Store said YES', tone: 'ok' } : { text: 'Store said NO — today cancelled', tone: 'no' };
    case 'food_check_office': return c.action === 'send' ? { text: 'Office sent it to drivers', tone: 'ok' } : { text: 'Office cancelled today', tone: 'no' };
    default: return null;
  }
}

const TONE: Record<string, string> = {
  wait: 'bg-amber-soft text-[#9a7415]',
  ok: 'bg-sage text-forest',
  no: 'bg-line/70 text-muted',
  alert: 'bg-clay text-paper',
};

// Oct 14 client: per-pickup "Text the contact when a driver is on the way" (server: contact-notice.ts).
export const CONTACT_NOTICE_TEXT = "Zeh L'Zeh: A driver accepted your pickup and will be there soon. If it's no longer needed, reply CANCEL. Thanks!";
/** Grey preview under the form's checkbox: '(845) 422-0191 · "Zeh L'Zeh: A driver accepted …"'. */
export function contactNoticePreview(phone: string | null | undefined): string {
  const d = String(phone ?? '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
  const shown = d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : (String(phone ?? '').trim() || 'Add a Contact Phone above to use this') /* Oct 14 client: was "No phone yet" */;
  return `${shown} · "${CONTACT_NOTICE_TEXT}"`;
}
/** Oct 14 client: card / pickup page line while the contact is still to be told. */
export function contactNoticeShown(p: any): boolean {
  if (!p?.contact_notice || p?.store_texts?.told) return false;
  return !['completed', 'delivered', 'picked_up', 'cancelled', 'missed'].includes(String(p?.status ?? ''));
}
export function ContactNoticeLine({ p }: { p: any }) {
  if (!contactNoticeShown(p)) return null;
  return <div className="text-[11.5px] text-muted" data-testid="contact-notice-line">📲 Contact will be texted when a driver accepts</div>;
}

export function StoreTextLines({ p }: { p: any }) {
  const st: StoreTexts = p?.store_texts;
  const qc = useQueryClient();
  const held = !!st?.held;
  const food = foodCheckLine(st?.food, held);
  const act = useMutation({
    mutationFn: (what: 'send' | 'cancel') => api(`/api/pickup-instances/${p.id}/food-check/${what}`, { method: 'POST', body: '{}' }),
    onSuccess: (_d, what) => {
      uiNotify(what === 'send' ? 'Sent. The steady driver is told; open spots go to drivers (normal new-pickup timing).' : 'Cancelled for today. No driver texts.', 'ok');
      qc.invalidateQueries({ queryKey: ['admin-pickups'] });
      qc.invalidateQueries({ queryKey: ['needs-confirmation'] });
    },
    onError: (e: Error) => uiNotify(e.message, 'err'),
  });
  const driverTold = driverToldLine(st?.driver);
  const cnShow = contactNoticeShown(p); // Oct 14 client
  if (!food && !st?.told && !st?.cancel && !driverTold && !cnShow) return null;
  const who = st?.told?.action === 'store_ontheway_text' ? 'Store' : 'Donor';
  return (
    <div className="pt-0.5 space-y-1" data-testid="store-text-lines" onClick={(e) => e.stopPropagation()}>
      {food && (
        <div className="flex flex-wrap items-center gap-1.5 text-[11.5px]">
          <span className={cx('inline-flex items-center font-bold rounded-full px-2 py-0.5', TONE[food.tone])}>🥖 {food.text}</span>
          {held && st?.food?.action !== 'food_check_answer' && (
            <>
              <button disabled={act.isPending} onClick={() => act.mutate('send')}
                      className="haptic text-[11.5px] font-extrabold px-2.5 py-1 rounded-[9px] bg-forest text-paper hover:brightness-110 disabled:opacity-50">
                Send to drivers
              </button>
              <button disabled={act.isPending}
                      onClick={() => { void uiConfirm('Cancel this pickup for today? Drivers are not texted.').then((ok) => { if (ok) act.mutate('cancel'); }); }}
                      className="haptic text-[11.5px] font-extrabold px-2.5 py-1 rounded-[9px] border border-clay text-clay hover:bg-clay-soft disabled:opacity-50">
                Cancel today
              </button>
            </>
          )}
        </div>
      )}
      {driverTold && <div className="text-[11.5px] font-semibold text-muted" data-testid="driver-told">🚐 {driverTold}</div>}
      {cnShow && <ContactNoticeLine p={p} />}
      {(st?.told || st?.cancel) && (
        <div className="flex flex-wrap items-center gap-1.5 text-[11.5px]">
          {st?.told && <span className="font-semibold text-muted">📲 {who} told {fmtNy(st.told.at)}</span>}
          {st?.cancel && (
            <span className="inline-flex items-center font-extrabold text-paper bg-clay rounded-full px-2 py-0.5"
                  title={st.cancel.cancelled
                    ? 'They texted CANCEL after being told a driver is coming. The pickup was cancelled automatically and the driver was texted — please call the driver to make sure he got it.'
                    : st.cancel.cancelled === false
                      ? 'They texted CANCEL, but the food was already picked up, so the pickup was NOT cancelled — please check with them.'
                      : 'They texted CANCEL after being told a driver is coming.'}>
              ✋ {st.cancel.kind === 'store' ? 'Store' : 'Donor'} replied CANCEL {fmtNy(st.cancel.at)}{st.cancel.cancelled ? ' · cancelled' : st.cancel.cancelled === false ? ' · NOT cancelled (picked up)' : ''}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
