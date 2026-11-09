/**
 * Nov 3 client: TEXT A WHOLE PICKUP — 💬 Text on a pickup (pickup page + Live Board card): Driver / Store / Both.
 * Opens the office-text pop-up with a ready message from the pickup, picked by its status (still finding a
 * driver / driver set / on the way / picked up), using the text templates (admins edit them with the others).
 * "Both" opens the store's text, then the driver's — two separate texts, each looked at and sent by hand.
 * Nothing is sent automatically. API: GET /api/pbx/sms/fill?pickupId=, GET /api/pbx/sms/quick-replies.
 */
import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { openOfficeText, fillTemplate, quickQueryKey, loadQuick, type FillData, type TextTemplate } from './office-texts';

const USE: Record<string, { store: string; driver: string }> = {
  'needs a driver': { store: 'store_none', driver: 'driver_set' },
  'driver set': { store: 'store_set', driver: 'driver_set' },
  'driver on the way': { store: 'store_way', driver: 'driver_way' },
  'picked up': { store: 'store_done', driver: 'driver_done' },
};
function pickTemplate(list: TextTemplate[], status: string | null, to: 'store' | 'driver'): TextTemplate | null {
  if (status === 'cancelled') return list.find((t) => /cancel/i.test(t.name)) ?? null;
  const use = USE[status ?? '']?.[to] ?? (to === 'store' ? 'store_none' : 'driver_set');
  return list.find((t) => t.use === use) ?? null;
}

/** Nov 4 client: "on the left side, like text to driver or text to store" — a one-tap link straight to that text. */
export function PickupTextLink({ pickupId, to, label, className }: { pickupId: number; to: 'driver' | 'store'; label: string; className?: string }) {
  return <PickupTextButton pickupId={pickupId} direct={to} label={label} className={className} />;
}

export function PickupTextButton({ pickupId, className, direct, label }: { pickupId: number; className?: string; direct?: 'driver' | 'store'; label?: string }) {
  const qc = useQueryClient();
  const [menu, setMenu] = useState(false);
  const [info, setInfo] = useState<FillData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!menu) return;
    const h = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setMenu(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [menu]);
  const load = () => qc.fetchQuery({ queryKey: ['pickup-fill', pickupId], staleTime: 30_000, queryFn: () => api<{ data: FillData }>(`/api/pbx/sms/fill?pickupId=${pickupId}`) }).then((r) => r.data);
  const toggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (direct) { void go(direct); return; }
    if (menu) { setMenu(false); return; }
    setErr(null); setMenu(true);
    try { setInfo(await load()); } catch { setErr("Couldn't load the pickup."); }
  };
  const go = async (to: 'store' | 'driver' | 'both') => {
    setMenu(false);
    try {
      const [f, q] = await Promise.all([load(), qc.fetchQuery({ queryKey: quickQueryKey, staleTime: 5 * 60_000, queryFn: loadQuick })]);
      const list = q.data.templates ?? [];
      const msg = (who: 'store' | 'driver') => {
        const t = pickTemplate(list, f.status, who);
        const name = who === 'store' ? f.store?.first ?? '' : f.driver?.first ?? '';
        return t ? fillTemplate(t.text, { ...f.fill, name }) : '';
      };
      const store = f.store ? { phone: f.store.phone, who: f.store.name, draft: msg('store') } : null;
      const driver = f.driver ? { phone: f.driver.phone, who: f.driver.name, draft: msg('driver') } : null;
      if (direct && to === 'store' && !store) { setErr('This store has no phone number.'); setMenu(true); return; }
      if (direct && to === 'driver' && !driver) { setErr('No driver on this pickup yet.'); setMenu(true); return; }
      if (to === 'store' && store) openOfficeText(store.phone, store.who, store.draft);
      else if (to === 'driver' && driver) openOfficeText(driver.phone, driver.who, driver.draft);
      else if (to === 'both' && store && driver) openOfficeText(store.phone, store.who, store.draft, driver);
    } catch { setErr("Couldn't load the pickup."); }
  };
  const item = 'block w-full text-left px-3 py-2 text-[13px] hover:bg-cream/70 disabled:opacity-40 disabled:hover:bg-transparent';
  return (
    <span ref={box} className="relative inline-block" onClick={(e) => e.stopPropagation()}>
      <button type="button" onClick={(e) => void toggle(e)} data-pickup-text
              className={className ?? 'haptic inline-flex items-center gap-1.5 text-[12.5px] font-bold text-forest bg-paper border border-forest/40 px-3 py-2 rounded-[8px]'}>{label ?? '💬 Text'}</button>
      {menu && (
        <div className="absolute right-0 top-full mt-1 z-[60] w-[230px] rounded-[12px] border border-line bg-paper shadow-lift py-1 text-left" data-pickup-text-menu>
          <div className="px-3 pt-1 pb-1.5 text-[11.5px] text-muted">A ready message opens — you check it and press Send.</div>
          {!info && !err && <div className="px-3 py-2 text-[13px] text-muted">Loading…</div>}
          {err && <div className="px-3 py-2 text-[13px] text-clay">{err}</div>}
          {info && (<>
            <button type="button" disabled={!info.driver} onClick={() => void go('driver')} className={item}>🚗 Driver{info.driver ? ` — ${info.driver.name}` : ' (no driver yet)'}</button>
            <button type="button" disabled={!info.store} onClick={() => void go('store')} className={item}>🏪 Store{info.store ? ` — ${info.store.name}` : ' (no phone number)'}</button>
            <button type="button" disabled={!info.store || !info.driver} onClick={() => void go('both')} className={item}>Both (store first, then driver)</button>
          </>)}
        </div>
      )}
    </span>
  );
}
