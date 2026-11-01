/**
 * Oct 29 client: Reports -> App usage -> "📲 Remind old versions to update (N)".
 * N = drivers whose last phone-app open (last 30 days) was on an older version than the
 * newest Android / iPhone version (the website never counts). Pressing it shows the exact
 * push (editable), the count by platform, who it goes to, and Send.
 * Server: GET /api/admin/update-reminder, POST /api/admin/update-reminder/send
 * (admin / staff / coordinator; one reminder per person per 3 days; obeys Pause / Shabbos /
 * Yom Tov; refused on the dev box). Tapping the push opens the store page for that phone.
 */
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminCRUD, type UpdateReminderView } from './api';
import { cx } from './design';

const nyWhen = (iso: string) => new Date(iso).toLocaleString('en-US', {
  timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
});
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const phoneName = (p: string) => (p === 'ios' ? 'iPhone' : 'Android');

/** "last sent Oct 29, 3:10 PM to 8 people" */
export function lastSentLine(last: UpdateReminderView['last']): string | null {
  if (!last) return null;
  return `last sent ${nyWhen(last.at)} to ${plural(last.people, 'person', 'people')}${last.by ? ` (by ${last.by})` : ''}`;
}

export function UpdateReminderButton() {
  const q = useQuery({ queryKey: ['admin-update-reminder'], queryFn: adminCRUD.updateReminder, refetchInterval: 60_000 });
  const [open, setOpen] = useState(false);
  const v = q.data?.data;
  const n = v?.count ?? 0;
  const last = lastSentLine(v?.last ?? null);
  return (
    <>
      <span className="inline-flex items-center gap-2">
        {last && <span className="text-[11.5px] text-muted" data-testid="update-reminder-last">{last}</span>}
        <button onClick={() => setOpen(true)} disabled={!v || !n} data-testid="update-reminder-btn"
                className="haptic rounded-[10px] border border-forest/40 px-3 py-1.5 text-[12px] font-bold text-forest hover:bg-sage/60 disabled:opacity-50">
          📲 Remind old versions to update ({n})
        </button>
      </span>
      {open && v && <UpdateReminderModal view={v} onClose={() => { setOpen(false); void q.refetch(); }} />}
    </>
  );
}

function UpdateReminderModal({ view, onClose }: { view: UpdateReminderView; onClose: () => void }) {
  const [v, setV] = useState(view);
  const [title, setTitle] = useState(view.title);
  const [body, setBody] = useState(view.body);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !sending) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, sending]);

  const latest = [v.latest.android && `Android ${v.latest.android.name}`, v.latest.ios && `iPhone ${v.latest.ios.name}`].filter(Boolean).join(' · ');
  const canSend = !v.blocked && v.sendCount > 0 && title.trim() !== '' && body.trim() !== '' && !sending && !result?.ok;

  async function send() {
    if (!canSend) return;
    setSending(true); setResult(null);
    try {
      const r = await adminCRUD.sendUpdateReminder(title, body);
      setV(r.data.view);
      setResult(r.data.sent > 0
        ? { ok: true, text: `✅ Sent to ${plural(r.data.sent, 'person', 'people')}.` }
        : { ok: false, text: r.data.message ?? 'Nobody to remind right now.' });
    } catch (e: any) {
      setResult({ ok: false, text: `⚠️ ${e?.message || 'Not sent.'}` });
    } finally { setSending(false); }
  }

  return (
    <div className="fixed inset-0 z-[2100] bg-ink/50 flex items-start justify-center pt-10 px-4 overflow-y-auto" onClick={() => { if (!sending) onClose(); }}>
      <div onClick={(e) => e.stopPropagation()} data-testid="update-reminder-modal"
           className="relative z-[2101] bg-paper rounded-[18px] shadow-lift border border-line w-full max-w-lg p-5 space-y-3 mb-10">
        <div className="flex items-center justify-between">
          <div className="font-display font-semibold text-[16px]">📲 Remind old versions to update</div>
          <button onClick={onClose} disabled={sending} aria-label="Close" className="haptic grid h-8 w-8 place-items-center rounded-full hover:bg-cream text-muted">✕</button>
        </div>

        <div className="text-[13px]">
          <div className="font-extrabold text-ink">
            {plural(v.count, 'person is', 'people are')} on an old version: {v.byPlatform.android} Android · {v.byPlatform.ios} iPhone
          </div>
          <div className="text-[12px] text-muted">Newest: {latest || '—'}. Counted from each driver's last app open in the last 30 days. The website doesn't count.</div>
        </div>

        {/* What the phone shows */}
        <div className="rounded-[14px] bg-cream border border-line p-3" data-testid="update-reminder-preview">
          <div className="text-[10.5px] uppercase tracking-[.12em] font-extrabold text-muted mb-1.5">Preview: what their phone shows</div>
          <div className="rounded-[12px] bg-paper shadow-lift border border-line px-3 py-2 flex gap-2.5 items-start">
            <div className="h-8 w-8 shrink-0 rounded-[8px] bg-forest text-paper grid place-items-center text-[13px] font-extrabold">Z</div>
            <div className="min-w-0">
              <div className="text-[13px] font-extrabold text-ink break-words">{title || ' '}</div>
              <div className="text-[12.5px] text-ink/80 break-words">{body || ' '}</div>
            </div>
          </div>
          <div className="mt-1.5 text-[11.5px] text-muted">
            Tapping it opens the store: Android → <a className="underline" href={v.links.android} target="_blank" rel="noopener noreferrer">Google Play</a>,
            iPhone → <a className="underline" href={v.links.ios} target="_blank" rel="noopener noreferrer">App Store</a>.
          </div>
        </div>

        <label className="block text-[12px] font-bold text-muted">Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} disabled={sending || !!result?.ok}
                 data-testid="update-reminder-title"
                 className="mt-1 w-full border border-line rounded-[10px] px-3 py-2 text-[13px] font-semibold text-ink" />
        </label>
        <label className="block text-[12px] font-bold text-muted">Message
          <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={300} rows={2} disabled={sending || !!result?.ok}
                    data-testid="update-reminder-body"
                    className="mt-1 w-full border border-line rounded-[10px] px-3 py-2 text-[13px] text-ink" />
        </label>

        <div className="text-[12.5px] space-y-0.5">
          <div className="font-bold text-ink">
            Gets it now: {plural(v.sendCount, 'person', 'people')} ({v.sendByPlatform.android} Android · {v.sendByPlatform.ios} iPhone)
          </div>
          {v.noPush > 0 && <div className="text-muted">{plural(v.noPush, 'person has', 'people have')} no notifications set up on the phone — they won't get it.</div>}
          {v.recentlyReminded > 0 && <div className="text-muted">{plural(v.recentlyReminded, 'person was', 'people were')} already reminded in the last {v.guardDays} days — skipped.</div>}
          <div className="text-muted">One reminder per person every {v.guardDays} days at most. Not sent during Pause, Shabbos or Yom Tov.</div>
          {lastSentLine(v.last) && <div className="text-muted">Reminder {lastSentLine(v.last)}.</div>}
        </div>

        <details className="text-[12px]">
          <summary className="cursor-pointer font-bold text-muted">Who ({v.people.length})</summary>
          <div className="mt-1 max-h-[180px] overflow-y-auto rounded-[10px] border border-line divide-y divide-line">
            {v.people.map((p) => (
              <div key={p.volunteerId} className="flex items-center gap-2 px-3 py-1">
                <span className="font-bold"><bdi dir="auto">{p.name}</bdi></span>
                <span className="text-muted">{phoneName(p.platform)} {p.version}</span>
                <span className={cx('ml-auto', p.canPush && !p.remindedAt ? 'text-forest' : 'text-muted')}>
                  {p.remindedAt && Date.now() - new Date(p.remindedAt).getTime() < v.guardDays * 86400e3
                    ? `reminded ${nyWhen(p.remindedAt)}` : p.canPush ? 'gets it' : 'no notifications'}
                </span>
              </div>
            ))}
          </div>
        </details>

        {v.blocked && (
          <div className="rounded-[10px] border border-amber-300 bg-amber-50 px-3 py-2 text-[12.5px] font-semibold text-amber-900" data-testid="update-reminder-blocked">
            {v.blocked}
          </div>
        )}
        {result && (
          <div className={cx('text-[12.5px] font-semibold', result.ok ? 'text-forest' : 'text-clay')} data-testid="update-reminder-result">{result.text}</div>
        )}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} disabled={sending} className="haptic rounded-[10px] border border-line px-4 py-2 text-[13px] font-bold text-muted">
            {result?.ok ? 'Close' : 'Cancel'}
          </button>
          <button onClick={send} disabled={!canSend} data-testid="update-reminder-send"
                  className="haptic rounded-[10px] bg-forest px-4 py-2 text-[13px] font-bold text-paper disabled:opacity-50">
            {sending ? 'Sending…' : `Send to ${plural(v.sendCount, 'person', 'people')}`}
          </button>
        </div>
      </div>
    </div>
  );
}
