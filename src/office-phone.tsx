/**
 * Oct 20 client: the office phone (Reliable PBX) in the office portal. Does nothing until an
 * admin connects it (Settings → ☎️ Office phone).
 *  • Caller pop-up (bottom-right, 30 s): "📞 Moshe Klein #20 calling (ext 101)", their pickup
 *    today (or a store's pickup + driver), Open profile / Open pickup; unknown numbers get
 *    Add as driver / Add as store. Comes in on the Live Board's live stream (event 'office-call',
 *    passed on by CoordinatorPortal as the window event 'zlz:office-call'). No polling.
 *  • Click-to-call: when the PBX is connected and the ONE shared dispatch extension is set, every
 *    phone link (tel:) in the office portal rings the dispatch phone first, then dials (POST
 *    /api/pbx/call). The link's own click still runs, so calls are logged exactly as before.
 *    Otherwise the tel: link works as it always did. Add data-no-pbx to a link to skip this.
 */
import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { api } from './api';
import { playAlertBeep } from './office-alerts';

type PbxMe = { ready: boolean; ext: string | null; sandbox: boolean };
let me: PbxMe | null = null;
let meAt = 0;
async function loadMe(force = false): Promise<PbxMe | null> {
  if (!force && me && Date.now() - meAt < 5 * 60_000) return me;
  try { me = (await api<{ data: PbxMe }>('/api/pbx/me')).data; meAt = Date.now(); } catch { /* keep the last answer */ }
  return me;
}
/** Settings changed (extensions / connection): ask again. */
export function refreshOfficePhone() { void loadMe(true); }

type Notice = { id: number; text: string; ok: boolean };
let pushNotice: ((n: { text: string; ok: boolean }) => void) | null = null;
const digitsOf = (p: string) => decodeURIComponent(String(p ?? '')).replace(/[^\d+]/g, '');

/** Ring the dispatch phone, then dial `phone`. false = use this device's phone (tel:) instead. */
export async function officeCall(phone: string): Promise<boolean> {
  if (!me?.ready) return false;
  pushNotice?.({ text: 'Ringing the dispatch phone…', ok: true });
  try {
    const r = await api<{ data: { ext: string; calling: string; sandboxed: boolean } }>('/api/pbx/call', { method: 'POST', body: JSON.stringify({ to: phone }) });
    pushNotice?.({ text: `Ringing the dispatch phone (ext ${r.data.ext})… Pick it up and it calls ${r.data.calling}.`, ok: true });
    return true;
  } catch (e) {
    const err = e as Error & { status?: number; body?: any };
    if (err.status === 409) { void loadMe(true); return false; } // not set up for me any more
    if (err.status === 429) { pushNotice?.({ text: err.message, ok: false }); return true; }
    pushNotice?.({ text: `${err.message || 'The dispatch phone call didn’t go through.'} Using this device’s phone instead.`, ok: false });
    return false;
  }
}

/** A "Call back" button: the dispatch phone when possible, else this device's phone. */
export function callNumber(phone: string | null | undefined) {
  const p = digitsOf(phone ?? '');
  if (!p) return;
  void officeCall(p).then((ok) => { if (!ok) window.location.href = `tel:${p}`; });
}

type Match = { type: 'volunteer' | 'supplier' | 'donor'; id: number; name: string; unit: number | null };
type CallPop = {
  callId: number; title: string; from: string; from10: string | null; ext: string | null; dispatchLine?: boolean;
  callerName: string | null; match: Match | null; others: Array<{ type: string; id: number; label: string }>;
  context: string[]; pickupId: number | null; shownAt: number;
};
const POP_MS = 30_000;
const fire = (name: string, detail: Record<string, unknown>) => window.dispatchEvent(new CustomEvent(name, { detail, cancelable: true }));
const openMatch = (m: { type: string; id: number }) => {
  if (m.type === 'volunteer') fire('zlz:open-volunteer', { id: m.id, tab: 'overview' });
  else if (m.type === 'supplier') fire('zlz:open-store', { id: m.id });
  else fire('zlz:open-pickup', { id: m.id });
};

/** Mounted once in the office portal: pop-ups, click-to-call (dispatch phone), small "ringing" notes. */
export function OfficePhone() {
  const [pops, setPops] = useState<CallPop[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);

  useEffect(() => {
    void loadMe();
    const t = setInterval(() => { void loadMe(true); }, 10 * 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    pushNotice = (n) => {
      const id = Date.now() + Math.random();
      setNotices((l) => [...l.filter((x) => x.text !== n.text).slice(-1), { ...n, id }]);
      setTimeout(() => setNotices((l) => l.filter((x) => x.id !== id)), 8000);
    };
    return () => { pushNotice = null; };
  }, []);

  // Click-to-call: catch tel: links before the browser opens the phone app (capture phase),
  // without stopping the link's own click (that is what writes the call log).
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (!me?.ready || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.('a[href^="tel:"]') as HTMLAnchorElement | null;
      if (!a || a.closest('[data-no-pbx]')) return;
      const num = digitsOf(a.getAttribute('href')!.slice(4));
      if (!num) return;
      e.preventDefault();
      void officeCall(num).then((ok) => { if (!ok) window.location.href = `tel:${num}`; });
    };
    document.addEventListener('click', h, true);
    return () => document.removeEventListener('click', h, true);
  }, []);

  // Caller pop-ups.
  useEffect(() => {
    const h = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (!d || !d.callId) return;
      setPops((l) => [{ ...d, context: Array.isArray(d.context) ? d.context : [], others: Array.isArray(d.others) ? d.others : [], shownAt: Date.now() },
        ...l.filter((x) => x.callId !== d.callId)].slice(0, 3));
      let muted = false;
      try { muted = localStorage.getItem('zlz-office-alerts-muted') === '1'; } catch { /* private mode */ }
      if (!muted) playAlertBeep();
    };
    window.addEventListener('zlz:office-call', h);
    return () => window.removeEventListener('zlz:office-call', h);
  }, []);
  useEffect(() => {
    if (!pops.length) return;
    const t = setInterval(() => setPops((l) => l.filter((p) => Date.now() - p.shownAt < POP_MS)), 1000);
    return () => clearInterval(t);
  }, [pops.length]);

  const close = (id: number) => setPops((l) => l.filter((p) => p.callId !== id));
  const addAs = (kind: 'driver' | 'store', p: CallPop) => {
    try { void navigator.clipboard?.writeText(p.from10 ?? p.from); } catch { /* no clipboard */ }
    fire(kind === 'driver' ? 'zlz:add-driver' : 'zlz:add-store', { phone: p.from10 ?? p.from });
    pushNotice?.({ text: `Number ${p.from} copied — paste it in the form.`, ok: true });
    close(p.callId);
  };

  if (!pops.length && !notices.length) return null;
  const btn = 'haptic text-[12px] font-bold px-3 py-1.5 rounded-[8px]';
  return (
    <div className="fixed bottom-4 right-4 z-[3000] flex flex-col items-end gap-2 w-[min(380px,calc(100vw-32px))]" data-office-phone>
      {notices.map((n) => (
        <div key={n.id} role="status" className={`rounded-[12px] border px-3 py-2 text-[13px] font-bold shadow-lift bg-paper ${n.ok ? 'border-forest/40 text-forest' : 'border-clay/40 text-clay'}`}>{n.text}</div>
      ))}
      {pops.map((p) => (
        <div key={p.callId} data-call-pop={p.callId} className="w-full rounded-[14px] border-2 border-forest bg-paper shadow-lift p-4">
          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <div className="font-bold text-[14.5px] text-ink">{p.title}</div>
              <div className="text-[12px] text-muted mt-0.5">
                {p.from}{p.callerName && !p.match ? ` · ${p.callerName}` : ''}{p.dispatchLine ? ' · dispatch line' : ''}
              </div>
              {p.context.map((l, i) => <div key={i} className="text-[13px] text-ink mt-1">{l}</div>)}
              {p.others.length > 0 && <div className="text-[12px] text-muted mt-1">Same number: {p.others.map((o) => o.label).join(', ')}</div>}
              <div className="flex flex-wrap gap-2 mt-3">
                {p.match && <button onClick={() => { openMatch(p.match!); close(p.callId); }} className={`${btn} bg-forest text-paper`}>{p.match.type === 'donor' ? 'Open donor pickup' : 'Open profile'}</button>}
                {p.pickupId && p.match?.type !== 'donor' && <button onClick={() => { fire('zlz:open-pickup', { id: p.pickupId! }); close(p.callId); }} className={`${btn} border border-forest/40 text-forest bg-paper`}>Open pickup</button>}
                {!p.match && p.from10 && <>
                  <button onClick={() => addAs('driver', p)} className={`${btn} bg-forest text-paper`}>Add as driver</button>
                  <button onClick={() => addAs('store', p)} className={`${btn} border border-forest/40 text-forest bg-paper`}>Add as store</button>
                </>}
              </div>
            </div>
            <button onClick={() => close(p.callId)} aria-label="Close" className="haptic text-muted hover:text-ink"><X size={16} /></button>
          </div>
        </div>
      ))}
    </div>
  );
}
