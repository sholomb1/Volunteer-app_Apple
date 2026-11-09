/**
 * Nov 3 client: ONE dispatcher inbox — "To do" on Dispatchers → Now and on the dispatcher's My Dispatch.
 * Missed calls not called back, office texts not answered, driver text / WhatsApp replies waiting, Food
 * Donations emails not handled, open office alerts — oldest first. Each row: what, who, how long it waits
 * (orange after 10 min, red after 30) and 📞 Call / 💬 Text / Open / ✓ Handled. Handled = gone for everyone
 * (who + when saved). API: GET /api/dispatch/todo, POST /api/dispatch/todo/handled (routes/dispatch.ts).
 * Asks every 30 s, only while the page is on screen.
 */
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, isDispatcherPreview } from './api';
import { callNumber } from './office-phone';
import { openOfficeText, fillTemplate, quickQueryKey, loadQuick } from './office-texts';
import { VoicemailListen } from './dispatch-voicemail'; // Nov 3 client

export type TodoItem = {
  key: string; kind: 'call' | 'office_text' | 'driver_text' | 'email' | 'alert' | 'voicemail' | 'checkin'; // Nov 3 client: + voicemail (admins only); Nov 5 client: + checkin
  vmId?: number;
  checkin?: { stage: 'text' | 'call'; fill: { name: string; store: string; time: string } }; // Nov 5 client: Dispatcher guide 5
  what: string; who: string; detail: string | null; since: string; phone: string | null;
  open: { type: 'volunteer' | 'supplier' | 'pickup' | 'email' | 'driver_messages' | 'office_texts'; id?: number } | null;
  alertIds?: number[];
  pickups?: CallerPickups | null; // Nov 3 client: the caller's pickup today
};
export type CallerPickups = { line: string; pickupId: number | null };

/** Nov 3 client: who's calling + their pickup — one plain line; tap opens the pickup. */
export function CallerPickupLine({ p, className }: { p: CallerPickups | null | undefined; className?: string }) {
  if (!p?.line) return null;
  const cls = className ?? 'text-[12.5px] text-ink';
  return p.pickupId
    ? <button type="button" data-caller-pickup onClick={() => fire('zlz:open-pickup', { id: p.pickupId })} className={`${cls} block text-left hover:underline`}>🚚 {p.line}</button>
    : <div data-caller-pickup className={cls}>🚚 {p.line}</div>;
}
type TodoData = { items: TodoItem[]; textsOk: boolean; at: string };

const ICON: Record<TodoItem['kind'], string> = { call: '📵', office_text: '💬', driver_text: '📩', email: '✉️', alert: '🔔', voicemail: '📼', checkin: '⏰' };
// Nov 5 client: the ready-made check-in (Admin can change it under 📝 Templates → Edit; this is the fallback)
const CHECKIN_TEXT = "Hi {name}, just checking in on the {store} pickup — is everything OK? – {me}, Zeh L'Zeh";
const fire = (name: string, detail?: Record<string, unknown>) => window.dispatchEvent(new CustomEvent(name, { detail, cancelable: true }));
export function waitLabel(min: number) {
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return h < 24 ? `${h}h ${min % 60}m` : `${Math.floor(h / 24)}d ${h % 24}h`;
}
const waitTone = (min: number) => (min >= 30 ? 'bg-clay text-paper' : min >= 10 ? 'bg-[#E8892B] text-paper' : 'bg-sage text-forest');

function openItem(i: TodoItem) {
  const o = i.open;
  if (!o) return;
  if (o.type === 'volunteer' && o.id) fire('zlz:open-volunteer', { id: o.id, tab: 'overview' });
  else if (o.type === 'supplier' && o.id) fire('zlz:open-store', { id: o.id });
  else if (o.type === 'pickup' && o.id) fire('zlz:open-pickup', { id: o.id });
  else if (o.type === 'email') fire('zlz:open-donations');
  else if (o.type === 'driver_messages') fire('zlz:open-driver-messages');
  else if (o.type === 'office_texts' && i.phone) openOfficeText(i.phone, i.who);
}

/** Nov 5 client: "take away the to-dos for right now by dispatch. Hide it, but let's remember it for later."
 *  ONE switch: false = no To do on Dispatch → Today / My Dispatch and no count on the "Dispatch" menu item (and the
 *  list isn't even asked for). The code below stays as it was — set true to bring it all back. */
export const SHOW_DISPATCH_TODO = false;

export function TodoPanel() {
  return SHOW_DISPATCH_TODO ? <TodoPanelShown /> : null;
}

function TodoPanelShown() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['dispatch-todo'], refetchInterval: 30_000, refetchIntervalInBackground: false,
    queryFn: () => api<{ data: TodoData }>('/api/dispatch/todo') });
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => { if (document.visibilityState === 'visible') tick((x) => x + 1); }, 30_000); return () => clearInterval(t); }, []);
  const [err, setErr] = useState<string | null>(null);
  const d = q.data?.data;
  const handled = async (i: TodoItem) => {
    setErr(null);
    qc.setQueryData<{ data: TodoData }>(['dispatch-todo'], (old) => old && ({ data: { ...old.data, items: old.data.items.filter((x) => x.key !== i.key) } }));
    try { await api('/api/dispatch/todo/handled', { method: 'POST', body: JSON.stringify({ key: i.key, alertIds: i.alertIds ?? [] }) }); qc.invalidateQueries({ queryKey: ['office-alerts'] }); if (i.vmId) qc.invalidateQueries({ queryKey: ['pbx-voicemail'] }); }
    catch (e: any) { setErr(e?.body?.error || "Couldn't save. Try again."); void q.refetch(); }
  };
  // Nov 5 client: 💬 Text on a check-in opens the "Driver check-in" text for him, filled in (nothing is sent until Send)
  const textCheckin = async (i: TodoItem) => {
    let tpl = CHECKIN_TEXT;
    try { tpl = (await qc.fetchQuery({ queryKey: quickQueryKey, staleTime: 5 * 60_000, queryFn: loadQuick })).data.templates?.find((t) => t.use === 'driver_checkin')?.text || tpl; } catch { /* fallback */ }
    openOfficeText(i.phone, i.who || i.checkin?.fill.name || null, fillTemplate(tpl, i.checkin?.fill ?? {}));
  };
  const items = (d?.items ?? []).filter((i) => !(i.vmId && isDispatcherPreview())); // Nov 4 Yakov: Dispatcher view = no voicemail (admins only)
  const btn = 'haptic shrink-0 rounded-[10px] px-2.5 py-1.5 text-[12.5px] font-bold';
  // Nov 5 client (one simple Dispatch screen): nothing waiting = one short line.
  if (d && items.length === 0 && !err) return (
    <div className="rounded-[14px] border border-line bg-paper px-4 py-2.5 text-[14px] font-bold text-forest" data-todo data-todo-clear>
      ✅ To do: All clear ✓{!d.textsOk && <span className="ml-2 text-[11.5px] font-normal text-muted">(office texts couldn't be checked right now)</span>}
    </div>
  );
  return (
    <section className="rounded-[18px] border border-line bg-paper p-5 space-y-3" data-todo>
      <div className="flex items-center gap-2">
        <h3 className="font-display font-semibold text-[17px] text-ink mr-auto">✅ To do {items.length > 0 && <span className="ml-1 rounded-full bg-clay text-paper text-[12px] font-bold px-2 py-0.5 align-middle">{items.length}</span>}</h3>
        <span className="text-[11.5px] text-muted">Oldest first</span>
      </div>
      {!d && <div className="text-[13px] text-muted">{q.isError ? "Couldn't load the list." : 'Loading…'}</div>}
      {d && items.length === 0 && <div className="text-[13px] text-forest font-bold">Nothing waiting. 👍</div>}
      {d && !d.textsOk && <div className="text-[11.5px] text-muted">Office texts couldn't be checked right now.</div>}
      <div className="divide-y divide-line/70">
        {items.map((i) => {
          const min = Math.max(0, Math.round((Date.now() - Date.parse(i.since)) / 60_000));
          return (
            <div key={i.key} className="py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5" data-todo-row={i.kind}>
              <span className="text-[17px] w-[22px]">{ICON[i.kind]}</span>
              <div className="min-w-0 flex-1 basis-[220px]">
                <div className="text-[13.5px]"><span className="font-bold text-ink">{i.what}</span>{i.who && <span className="text-ink"> · {i.who}</span>}</div>
                {i.detail && <div className="text-[12.5px] text-muted truncate">{i.detail}</div>}
                <CallerPickupLine p={i.pickups} />{/* Nov 3 client */}
                {i.vmId && <VoicemailListen id={i.vmId} />}{/* Nov 3 client: admins only (only they get voicemail rows) */}
              </div>
              <span className={`rounded-full px-2 py-0.5 text-[12px] font-bold ${waitTone(min)}`} title="Waiting">⏱ {waitLabel(min)}</span>
              <span className="flex flex-wrap gap-1.5">
                {i.checkin ? (<>{/* Nov 5 client: step 1 = 💬 Text the check-in; step 2 (no answer 30 min) = 📞 Call */}
                  {i.phone && i.checkin.stage === 'text' && <button type="button" data-checkin-text onClick={() => void textCheckin(i)} className={`${btn} bg-forest text-paper`}>💬 Text</button>}
                  {i.phone && i.checkin.stage === 'call' && <button type="button" data-checkin-call onClick={() => callNumber(i.phone)} className={`${btn} bg-forest text-paper`}>📞 Call</button>}
                </>) : (<>
                {i.phone && <button type="button" onClick={() => callNumber(i.phone)} className={`${btn} bg-forest text-paper`}>📞 Call</button>}
                {i.phone && <button type="button" onClick={() => openOfficeText(i.phone, i.who)} className={`${btn} border border-forest/40 text-forest bg-paper`}>💬 Text</button>}
                </>)}
                {i.open && i.open.type !== 'office_texts' && <button type="button" onClick={() => openItem(i)} className={`${btn} border border-line text-ink bg-paper`}>Open</button>}
                <button type="button" onClick={() => void handled(i)} className={`${btn} border border-line text-muted bg-paper hover:text-forest`}>✓ Handled</button>
              </span>
            </div>
          );
        })}
      </div>
      {err && <div className="text-[12.5px] text-clay font-bold">{err}</div>}
    </section>
  );
}

/** Nov 3 client: count of waiting To do items, for the "Dispatch" menu item (same cached list as the To do tab). */
export function TodoBadge() {
  return SHOW_DISPATCH_TODO ? <TodoBadgeShown /> : null;
}
function TodoBadgeShown() {
  const q = useQuery({ queryKey: ['dispatch-todo'], refetchInterval: 60_000, refetchIntervalInBackground: false,
    queryFn: () => api<{ data: TodoData }>('/api/dispatch/todo') });
  const n = q.data?.data?.items?.length ?? 0;
  if (!n) return null;
  return <span className="ml-auto inline-grid place-items-center min-w-[20px] h-[20px] px-1.5 rounded-full bg-red-500 text-paper text-[11px] font-extrabold">{n > 99 ? '99+' : n}</span>;
}
