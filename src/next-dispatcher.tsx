/**
 * Nov 6 client: "Let's say my shift is from 6 to 8. We want to make sure the next dispatcher comes on at 8. If I don't
 * see the next dispatcher logged on, I should see it somewhere and have to call him. Maybe when I [end my shift / sign out,
 * warn me]…"
 *  - NextDispatcherBanner (top of Dispatch / My Dispatch): from 10 min before the shift ends until 30 min after, when the
 *    next shift's dispatcher hasn't signed in: "Dovid L. starts at 8:00 PM and hasn't signed in yet — please call him"
 *    with 📞 Call / 💬 Text (a ready text; nothing is sent until Send). No one scheduled next: "No one is scheduled after
 *    you — tell the office". Dispatchers see their own shift only; office logins see every shift. The number is never shown.
 *  - useLeaveGuard: "Turn forwarding off" / Sign out of the shift / Sign out while the next one hasn't signed in →
 *    "Dovid L. (next shift) hasn't signed in yet. Call him before you go?" [📞 Call] [Turn off anyway] [Cancel].
 * API: GET /api/pbx/next-check (routes/pbx.ts; rules: apps/api/src/next-dispatcher.ts).
 */
import { useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, isDispatcherLogin } from './api';
import { callNumber } from './office-phone';
import { openOfficeText } from './office-texts';

export type NextItem = { kind: 'late' | 'none'; mine: boolean; banner: boolean; who: string; endsAt: string; line: string;
  next: { name: string; startsAt: string; draft: string; phone: string | null } | null };
const KEY = ['next-check'];
const load = () => api<{ data: { items: NextItem[] } }>('/api/pbx/next-check');
const btn = 'haptic rounded-full px-3.5 py-1.5 text-[13px] font-bold';

export function NextDispatcherBanner() {
  const q = useQuery({ queryKey: KEY, queryFn: load, refetchInterval: 60_000, refetchIntervalInBackground: false, retry: false });
  const disp = isDispatcherLogin();
  const items = (q.data?.data.items ?? []).filter((x) => x.banner && (x.mine || !disp));
  if (!items.length) return null;
  return (
    <div className="space-y-2" data-next-banner>
      {items.map((x, i) => (
        <section key={`${x.kind}-${x.next?.startsAt ?? x.endsAt}-${i}`} role="alert"
                 className="rounded-[14px] border-2 border-[#E8892B] bg-[#FFF4E5] px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-2" data-next-item={x.kind}>
          <span className="text-[15px] font-bold text-[#9A4F00] mr-auto">⚠️ {x.line}</span>
          {x.next?.phone && <>
            <button type="button" onClick={() => callNumber(x.next!.phone)} className={`${btn} bg-forest text-paper`} data-next-call>📞 Call</button>
            <button type="button" onClick={() => openOfficeText(x.next!.phone, x.next!.name, x.next!.draft)} className={`${btn} border border-forest/40 text-forest bg-paper`} data-next-text>💬 Text</button>
          </>}
        </section>
      ))}
    </div>
  );
}

/** Before the dispatcher on shift leaves (turns forwarding off / signs out): the next one hasn't signed in → ask first.
 *  guard(go): runs go() at once when nothing is wrong (or the check can't load); else shows the question —
 *  [📞 Call] calls him (and stays), [anyway] runs go(), [Cancel] does nothing. */
export function useLeaveGuard(anywayLabel = 'Turn off anyway'): { guard: (go: () => void, otherwise?: () => void) => void; dialog: ReactNode } {
  const qc = useQueryClient();
  const [ask, setAsk] = useState<{ x: NextItem; go: () => void } | null>(null);
  const guard = (go: () => void, otherwise?: () => void) => {
    void qc.fetchQuery({ queryKey: KEY, queryFn: load, staleTime: 20_000 }).then((r) => {
      const x = r.data.items.find((i) => i.mine && i.kind === 'late' && i.next);
      if (x) setAsk({ x, go }); else (otherwise ?? go)();
    }).catch(() => (otherwise ?? go)());
  };
  const n = ask?.x.next;
  const dialog = ask && n ? (
    <div onClick={() => setAsk(null)} className="fixed inset-0 z-[5000] bg-ink/50 flex items-start justify-center pt-24 px-4" data-leave-guard>
      <div role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-[18px] border border-line bg-paper p-5 shadow-lift space-y-3">
        <div className="text-[18px] font-bold text-ink">{n.name} (next shift) hasn't signed in yet. Call him before you go?</div>
        <div className="flex flex-col gap-2 pt-1">
          {n.phone && <button type="button" autoFocus onClick={() => { callNumber(n.phone); setAsk(null); }} className="haptic min-h-[48px] rounded-[10px] bg-forest text-paper text-[16px] font-bold" data-guard-call>📞 Call</button>}
          <button type="button" onClick={() => { const g = ask.go; setAsk(null); g(); }} className="haptic min-h-[48px] rounded-[10px] border border-clay/50 text-clay text-[16px] font-bold" data-guard-anyway>{anywayLabel}</button>
          <button type="button" onClick={() => setAsk(null)} className="haptic min-h-[44px] rounded-[10px] border border-line text-muted text-[15px] font-bold">Cancel</button>
        </div>
      </div>
    </div>
  ) : null;
  return { guard, dialog };
}