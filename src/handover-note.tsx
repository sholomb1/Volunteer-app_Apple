/**
 * Nov 5 client (Dispatcher guide, End-of-Shift Handover): "📝 Handover note" on Dispatch → Now and My Dispatch.
 * The dispatcher writes what the next one needs to know (open pickups, pending calls, follow-ups). The newest
 * note shows at the top until someone taps ✓ Read (who + when saved). The last 10 can be opened.
 * API: GET /api/dispatch/handover, POST /api/dispatch/handover { text }, POST /api/dispatch/handover/read { id }.
 * Asks every 60 s, only while the page is on screen.
 */
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { callNumber } from './office-phone'; // Nov 6 client: call / text the writer
import { openOfficeText } from './office-texts';

type Read = { uid: number | null; name: string; at: string };
// Nov 6 client: + phone (the writer's cell; new notes only), hideNumber = a manager's personal cell: Call / Text only, no number.
type Note = { id: number; text: string; uid: number | null; name: string; at: string; reads: Read[]; phone?: string | null; hideNumber?: boolean };
type Data = { notes: Note[]; unreadId: number | null; me: number | null };
const KEY = ['dispatch-handover'];

const when = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const day = d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const t = d.toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' });
  return day === today ? `today ${t}` : `${d.toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric' })}, ${t}`;
};
const pretty = (p: string) => `(${p.slice(0, 3)}) ${p.slice(3, 6)}-${p.slice(6)}`;
/** Nov 6 client ("the unit number, name and phone number of the person who wrote it, in case the next person has
 *  questions"): "From Moshe A. #20 · (845) 555-0101 · 📞 Call · 💬 Text". Old notes (no phone) just show the name. */
function Writer({ n, from = false }: { n: Note; from?: boolean }) {
  const p = n.phone && /^\d{10}$/.test(n.phone) ? n.phone : null;
  const link = 'font-bold text-forest underline haptic';
  return (
    <span data-handover-writer>
      {from ? 'From ' : ''}{n.name}
      {p && !n.hideNumber && <> · <span className="tabular-nums" data-writer-phone>{pretty(p)}</span></>}
      {p && <> · <button type="button" onClick={() => callNumber(p)} className={link} data-writer-call>📞 Call</button>
        {' · '}<button type="button" onClick={() => openOfficeText(p, n.name)} className={link} data-writer-text>💬 Text</button></>}
    </span>
  );
}
const readLine = (n: Note) => (n.reads.length ? `Read by ${n.reads.map((r) => `${r.name} (${when(r.at)})`).join(', ')}` : 'Not read yet');

/** Nov 5 client (one simple Dispatch screen): `compact` = show the card only while there is an unread note (or while
 *  writing); the "📝 Write handover note" link in the top strip bumps `writeSignal` to open the writing box. */
export function HandoverNote({ compact = false, writeSignal = 0 }: { compact?: boolean; writeSignal?: number } = {}) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: KEY, refetchInterval: 60_000, refetchIntervalInBackground: false,
    queryFn: () => api<{ data: Data }>('/api/dispatch/handover') });
  const [writing, setWriting] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [past, setPast] = useState(false);
  const d = q.data?.data;
  const unread = d?.notes.find((n) => n.id === d.unreadId) ?? null;
  const mine = !!unread && unread.uid != null && unread.uid === d?.me;
  const post = async (path: string, body: unknown) => {
    setBusy(true); setErr(null);
    try {
      const r = await api<{ data: Data }>(path, { method: 'POST', body: JSON.stringify(body) });
      qc.setQueryData(KEY, r);
      return true;
    } catch (e: any) { setErr(e?.body?.error || e?.message || "Couldn't save. Try again."); return false; } finally { setBusy(false); }
  };
  const save = async () => { if (await post('/api/dispatch/handover', { text })) { setText(''); setWriting(false); } };
  const btn = 'haptic rounded-[10px] px-3 py-1.5 text-[12.5px] font-bold';
  useEffect(() => { if (writeSignal > 0) setWriting(true); }, [writeSignal]);
  // Someone else's newest note not read yet (my own note waiting for the next dispatcher doesn't need the card).
  if (compact && !writing && !err && !(unread && !mine)) return null;
  return (
    <section className="rounded-[18px] border border-line bg-paper p-5 space-y-3" data-handover>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-display font-semibold text-[17px] text-ink mr-auto">📝 Handover note</h3>
        {!writing && <button type="button" onClick={() => setWriting(true)} className={`${btn} border border-forest/40 text-forest bg-paper`}>✍️ Write a note</button>}
      </div>
      {!d && <div className="text-[13px] text-muted">{q.isError ? "Couldn't load the notes." : 'Loading…'}</div>}
      {unread && (
        <div className="rounded-[14px] border-2 border-[#E8892B] bg-[#FFF4E5] p-3 space-y-1.5" data-handover-unread>
          <div className="text-[12px] font-bold text-[#9A4F00]"><Writer n={unread} from /> · {when(unread.at)}{mine ? ' · waiting for the next dispatcher to read it' : ''}</div>
          <div className="whitespace-pre-wrap text-[14px] text-ink">{unread.text}</div>
          {!mine && <button type="button" disabled={busy} onClick={() => void post('/api/dispatch/handover/read', { id: unread.id })} className={`${btn} bg-forest text-paper`}>✓ Read</button>}
        </div>
      )}
      {d && !unread && !writing && <div className="text-[13px] text-muted">No new note. Before you finish your shift, write what the next dispatcher needs to know.</div>}
      {writing && (
        <div className="space-y-2">
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} maxLength={1500} autoFocus
                    placeholder="What does the next dispatcher need to know? Open pickups, calls to return, follow-ups, anything urgent…"
                    className="w-full rounded-[12px] border border-line bg-paper px-3 py-2 text-[14px]" />
          <div className="flex items-center gap-2">
            <button type="button" disabled={busy || !text.trim()} onClick={() => void save()} className={`${btn} bg-forest text-paper disabled:opacity-40`}>Save note</button>
            <button type="button" onClick={() => { setWriting(false); setText(''); setErr(null); }} className={`${btn} text-muted`}>Cancel</button>
            <span className="text-[11.5px] text-muted ml-auto">The next dispatcher sees it at the top until they tap ✓ Read.</span>
          </div>
        </div>
      )}
      {err && <div className="text-[12.5px] text-clay font-bold">{err}</div>}
      {d && d.notes.length > 0 && (
        <div>
          <button type="button" onClick={() => setPast((v) => !v)} className="text-[12.5px] font-bold text-forest underline">{past ? 'Hide earlier notes' : `Earlier notes (${d.notes.length})`}</button>
          {past && (
            <div className="mt-2 divide-y divide-line/70" data-handover-list>
              {d.notes.map((n) => (
                <div key={n.id} className="py-2">
                  <div className="text-[12px] font-bold text-ink"><Writer n={n} /> · {when(n.at)}</div>
                  <div className="whitespace-pre-wrap text-[13px] text-ink/85">{n.text}</div>
                  <div className="text-[11.5px] text-muted">{readLine(n)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
