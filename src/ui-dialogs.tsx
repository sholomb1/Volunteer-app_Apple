/**
 * In-page confirmations + notices (client Oct 5 UI pass, item 2).
 * Replaces the browser's grey confirm()/alert() boxes:
 *   uiConfirm(message) → Promise<boolean>   (red button for destructive actions)
 *   uiNotify(message, tone?)                 (small notice, top-right, auto-hides)
 * <DialogHost/> is mounted once at the app root (main.tsx); window.alert is
 * routed to uiNotify there so every remaining alert() becomes a notice.
 */
import { useEffect, useState } from 'react';

type Ask = { id: number; message: string; resolve: (ok: boolean) => void; okLabel?: string; cancelLabel?: string };
/** Optional button words for one confirm (default: "OK" / "Go back"). */
export type ConfirmLabels = { okLabel?: string; cancelLabel?: string };
type Note = { id: number; message: string; tone: 'ok' | 'err' | 'info' };

let seq = 0;
let asks: Ask[] = [];
let notes: Note[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());

export function uiConfirm(message: string, labels?: ConfirmLabels): Promise<boolean> {
  return new Promise((resolve) => {
    asks = [...asks, { id: ++seq, message: String(message), resolve, okLabel: labels?.okLabel, cancelLabel: labels?.cancelLabel }];
    emit();
  });
}

export function uiNotify(message: string, tone?: 'ok' | 'err' | 'info'): void {
  const text = String(message);
  const t = tone ?? (/fail|error|could not|couldn't|not sent|no sms sent|invalid|denied/i.test(text) ? 'err' : 'ok');
  const n = { id: ++seq, message: text, tone: t };
  notes = [...notes, n];
  emit();
  setTimeout(() => { notes = notes.filter((x) => x.id !== n.id); emit(); }, t === 'err' ? 9000 : 5000);
}

const DANGER = /\b(delete|remove|cancel|disable|deactivate|dismiss|decline|pause|permanently|hide|reset|sign out|un-assigned|unavailable)\b/i;

export function DialogHost() {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force((n) => n + 1);
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, []);
  const ask = asks[0];
  const answer = (ok: boolean) => {
    if (!ask) return;
    asks = asks.slice(1);
    emit();
    ask.resolve(ok);
  };
  useEffect(() => {
    if (!ask) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') answer(false); if (e.key === 'Enter') answer(true); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  const danger = ask ? (!ask.okLabel && DANGER.test(ask.message)) : false;
  const big = !!(ask?.okLabel || ask?.cancelLabel);
  const [first, ...rest] = (ask?.message ?? '').split(/\n\s*\n/);
  return (
    <>
      {ask && (
        <div onClick={() => answer(false)} className="fixed inset-0 z-[5000] bg-ink/50 flex items-start justify-center pt-24 px-4">
          <div role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}
               className="w-full max-w-sm rounded-[18px] border border-line bg-paper p-5 shadow-lift space-y-3">
            <div className={(big ? 'text-[18px]' : 'text-[15px]') + ' font-bold text-ink whitespace-pre-wrap'}>{first}</div>
            {rest.length > 0 && <div className={(big ? 'text-[15px]' : 'text-[13px]') + ' text-muted whitespace-pre-wrap'}>{rest.join('\n\n')}</div>}
            <div className="flex justify-end gap-2 pt-1">
              <button autoFocus={danger} onClick={() => answer(false)}
                      className={'haptic rounded-[10px] border border-line font-bold text-muted hover:bg-cream ' + (big ? 'flex-1 min-h-[48px] px-4 text-[16px]' : 'px-4 py-2 text-[13px]')}>
                {ask.cancelLabel ?? 'Go back'}
              </button>
              <button autoFocus={!danger} onClick={() => answer(true)}
                      className={'haptic rounded-[10px] font-bold text-paper ' + (danger ? 'bg-clay ' : 'bg-forest ') + (big ? 'flex-1 min-h-[48px] px-4 text-[16px]' : 'px-4 py-2 text-[13px]')}>
                {ask.okLabel ?? (danger ? 'Yes, do it' : 'OK')}
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="fixed top-3 right-3 z-[5001] flex flex-col gap-2 max-w-[92vw] w-[360px] pointer-events-none">
        {notes.map((n) => (
          <div key={n.id}
               className={'pointer-events-auto rounded-[12px] border px-4 py-3 text-[13px] shadow-lift whitespace-pre-wrap '
                 + (n.tone === 'err' ? 'bg-clay-soft border-clay/40 text-clay' : n.tone === 'info' ? 'bg-paper border-line text-ink' : 'bg-sage border-sage-line text-forest-deep')}>
            <div className="flex items-start gap-2">
              <span className="flex-1">{n.message}</span>
              <button onClick={() => { notes = notes.filter((x) => x.id !== n.id); emit(); }} className="text-muted hover:text-ink">✕</button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
