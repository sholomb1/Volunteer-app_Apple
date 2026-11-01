/**
 * Oct 25 client: "📨 Send driver numbers" (office Drivers list). Each picked driver gets his own text:
 *   "Hi Moshe! Your personal Zeh L'Zeh number is #36. When you see #36 in our messages, that's you.
 *    Thanks for being on the team!"
 * Uses the ticked drivers, or "Select all with a number". Preview first (the exact text for the first
 * person + "Send to 42 drivers. Skipped: …"), then Send. The server sends in the background, one
 * personal text per driver (logged in Reports → SMS delivery as driver-number). Late at night /
 * Shabbos the usual "Send now or schedule?" prompt opens (late-night.tsx). A driver who got it in
 * the last 24 h is skipped unless "Send again" is ticked. Office only (admin / coordinator / staff).
 * API: POST /api/driver-numbers/preview and /send (vp-api routes/driver-numbers.ts).
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from './api';
import { useNightSend } from './late-night';

type Who = { ids?: number[]; all?: boolean };
type Preview = {
  count: number;
  sample: { name: string; text: string } | null;
  skipped: Record<'noNumber' | 'noPhone' | 'stopped' | 'inactive' | 'recent', number>;
  words: { sendTo: string; skipped: string };
};
type SendResult = { data: { sending?: number; scheduled?: number; sendAt?: string } };

export const driverNumbersApi = {
  preview: (who: Who, again: boolean) =>
    api<{ data: Preview }>('/api/driver-numbers/preview', { method: 'POST', body: JSON.stringify({ ...who, again }) }),
  send: (who: Who, again: boolean, extra: { confirmNight?: boolean; sendAt?: string } = {}) =>
    api<SendResult>('/api/driver-numbers/send', { method: 'POST', body: JSON.stringify({ ...who, again, ...extra }) }),
};

const plural = (n: number) => `${n} driver${n === 1 ? '' : 's'}`;

/** The button + its window. selectedIds = the ticked drivers in the list. */
export function SendDriverNumbersButton({ selectedIds }: { selectedIds: number[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" data-send-driver-numbers onClick={() => setOpen(true)}
              className="haptic text-[12px] font-bold border border-forest/50 bg-paper text-forest px-3 py-1.5 rounded-[8px] hover:bg-sage/40">
        📨 Send driver numbers{selectedIds.length > 0 ? ` (${selectedIds.length})` : ''}
      </button>
      {open && <SendDriverNumbersModal selectedIds={selectedIds} onClose={() => setOpen(false)} />}
    </>
  );
}

export function SendDriverNumbersModal({ selectedIds, onClose }: { selectedIds: number[]; onClose: () => void }) {
  const [mode, setMode] = useState<'ticked' | 'all' | null>(selectedIds.length > 0 ? 'ticked' : null);
  const [again, setAgain] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const who: Who | null = mode === 'all' ? { all: true } : mode === 'ticked' ? { ids: selectedIds } : null;
  const whoKey = mode === 'all' ? 'all' : selectedIds.join(',');
  const scheduledN = useRef(0);

  useEffect(() => {
    if (!who) return;
    let live = true;
    setLoading(true); setErr(null);
    driverNumbersApi.preview(who, again)
      .then((r) => { if (live) setPreview(r.data); })
      .catch((e: any) => { if (live) { setPreview(null); setErr(e?.message || "Couldn't load the preview."); } })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, whoKey, again]);

  const n = preview?.count ?? 0;
  const night = useNightSend<SendResult>({
    send: (confirmNight) => driverNumbersApi.send(who ?? {}, again, confirmNight ? { confirmNight: true } : {}),
    schedule: async (iso) => {
      const r = await driverNumbersApi.send(who ?? {}, again, { sendAt: iso });
      scheduledN.current = Number(r.data.scheduled ?? 0);
    },
    onSent: (r) => setDone(`Texting ${plural(Number(r.data.sending ?? n))}… see results in Reports → SMS delivery`),
    onScheduled: (label) => setDone(`⏰ Scheduled for ${label}: ${plural(scheduledN.current)}. You can see them in Messaging → Upcoming.`),
    onError: (e) => setErr(e?.message || 'Not sent. Please try again.'),
  });

  const box = 'rounded-[12px] border border-line bg-cream/40 px-3 py-2';
  return createPortal(
    <div data-driver-numbers-modal className="fixed inset-0 z-[80] grid place-items-center bg-black/35 p-4"
         onClick={(e) => { if (e.target === e.currentTarget && !night.busy) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label="Send driver numbers"
           className="w-full max-w-[460px] space-y-3 rounded-[16px] border border-line bg-paper p-4 shadow-xl">
        <div className="flex items-start justify-between gap-2">
          <div className="font-display text-[17px] font-bold text-ink">📨 Send driver numbers</div>
          <button type="button" onClick={onClose} disabled={night.busy} title="Close"
                  className="haptic grid h-7 w-7 place-items-center rounded-full text-muted hover:bg-cream">✕</button>
        </div>

        {done ? (
          <div className="space-y-3">
            <div data-driver-numbers-done className="rounded-[12px] border border-sage-line bg-sage px-3 py-2 text-[13.5px] font-bold text-forest">{done}</div>
            <button type="button" onClick={onClose} className="haptic w-full rounded-[10px] bg-forest px-3 py-2 text-[13.5px] font-bold text-paper">Close</button>
          </div>
        ) : (
          <>
            <div className="text-[13px] text-ink">
              {mode === 'ticked' && <>Using the <b>{plural(selectedIds.length)}</b> you ticked.</>}
              {mode === 'all' && <>Every driver who has a number.</>}
              {mode === null && <>No drivers are ticked. Tick drivers in the list, or:</>}
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {mode !== 'all' && (
                  <button type="button" data-driver-numbers-all onClick={() => { setMode('all'); setPreview(null); }}
                          className="haptic rounded-[8px] border border-forest/50 bg-paper px-2.5 py-1 text-[12px] font-bold text-forest hover:bg-sage/40">Select all with a number</button>
                )}
                {mode === 'all' && selectedIds.length > 0 && (
                  <button type="button" onClick={() => { setMode('ticked'); setPreview(null); }}
                          className="haptic rounded-[8px] border border-line bg-paper px-2.5 py-1 text-[12px] font-bold text-muted hover:text-ink">Use only the {plural(selectedIds.length)} I ticked</button>
                )}
              </div>
            </div>

            {mode && (
              <>
                <div className={box}>
                  <div className="text-[11px] font-extrabold uppercase tracking-[.05em] text-muted">
                    The text{preview?.sample?.name ? ` (for ${preview.sample.name})` : ''}
                  </div>
                  <div data-driver-numbers-sample className="mt-1 whitespace-pre-wrap text-[13.5px] text-ink">
                    {loading && !preview ? 'Loading…' : preview?.sample ? `“${preview.sample.text}”` : 'Nobody to text.'}
                  </div>
                  {preview?.sample && <div className="mt-1 text-[11.5px] text-muted">Each driver gets his own first name and number.</div>}
                </div>
                {preview && (
                  <div data-driver-numbers-count className="text-[13.5px] text-ink">
                    <b>{preview.words.sendTo}</b> <span className="text-muted">{preview.words.skipped}</span>
                  </div>
                )}
                <label className="flex items-start gap-2 text-[12.5px] text-ink">
                  <input type="checkbox" data-driver-numbers-again checked={again} onChange={(e) => setAgain(e.target.checked)} className="mt-0.5 h-4 w-4 accent-forest" />
                  <span>Send again <span className="text-muted">(also to drivers who got it in the last 24 hours)</span></span>
                </label>
              </>
            )}

            {err && <div className="rounded-[10px] bg-clay-soft px-3 py-1.5 text-[12.5px] font-bold text-clay">{err}</div>}
            <div className="flex gap-1.5">
              <button type="button" onClick={onClose} disabled={night.busy}
                      className="haptic rounded-[10px] border border-line bg-paper px-3 py-2 text-[13px] font-bold text-muted">Cancel</button>
              <button type="button" data-driver-numbers-send disabled={!mode || loading || n === 0 || night.busy}
                      onClick={() => { setErr(null); void night.start(); }}
                      className="haptic flex-1 rounded-[10px] bg-forest px-3 py-2 text-[13.5px] font-bold text-paper disabled:opacity-50">
                {night.busy ? 'Sending…' : n > 0 ? `Send to ${plural(n)}` : 'Send'}
              </button>
            </div>
          </>
        )}
        {night.prompt}
      </div>
    </div>,
    document.body,
  );
}
