/**
 * Nov 3 client: one-tap call notes. After a 📞 Call from the app (office-phone.tsx) and on call rows
 * (Dispatchers → Now / Calls): Will take it · No answer · Can't · Left message · Other… (+ a short note,
 * + which of today's pickups). A driver's note goes in his call log; a store / donor / unknown number is
 * kept for the office. POST /api/dispatch/call-note (routes/dispatch.ts).
 */
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

// Nov 5 client (Dispatcher guide 3): + "🚫 Doesn't want calls" — saved like the others; the office is told (his settings are not changed)
const CHOICES: Array<[string, string]> = [['will_take', 'Will take it'], ['no_answer', 'No answer'], ['cant', "Can't"], ['voicemail', 'Left message'], ['no_calls', "🚫 Doesn't want calls"], ['other', 'Other…']];
type Ctx = { who: { label: string; type: string } | null; pickups: Array<{ id: number; label: string; mine: boolean }> };

export function CallNoteBar({ phone, scId, onSaved, onClose, title }: { phone: string; scId?: number | null; onSaved?: (label: string) => void; onClose?: () => void; title?: string }) {
  const qc = useQueryClient();
  const [pick, setPick] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [pickupId, setPickupId] = useState<number | ''>('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const ctx = useQuery({ queryKey: ['call-note-ctx', phone], staleTime: 60_000, enabled: !!pick || !!title,
    queryFn: () => api<{ data: Ctx }>(`/api/dispatch/call-note/context?phone=${phone}`) });
  const save = async (outcome: string) => {
    if (outcome === 'other' && !note.trim()) { setErr('Write a short note.'); return; }
    setBusy(true); setErr(null);
    try {
      const r = await api<{ data: { outcome: string; savedTo: string; told?: boolean } }>('/api/dispatch/call-note', { method: 'POST',
        body: JSON.stringify({ phone, outcome, note: note.trim() || null, pickupId: pickupId || null, scId: scId ?? null }) });
      setDone(`✓ ${r.data.outcome}${note.trim() ? ` — ${note.trim()}` : ''}${r.data.savedTo === 'driver' ? ' (in his call log)' : ''}${r.data.told ? '. The office was told, to update his settings.' : ''}`);
      qc.invalidateQueries({ queryKey: ['pbx-calls'] });
      onSaved?.(r.data.outcome);
    } catch (e: any) { setErr(e?.body?.error || e?.message || "Couldn't save."); } finally { setBusy(false); }
  };
  if (done) return <div className="text-[12.5px] font-bold text-forest" data-call-note-saved>{done}</div>;
  const chip = 'haptic rounded-full border px-2.5 py-1 text-[12px] font-bold';
  return (
    <div className="space-y-1.5" data-call-note>
      {title && <div className="text-[12.5px] font-bold text-ink">{title.replace('{who}', ctx.data?.data.who?.label ?? (/^\d{10}$/.test(phone) ? `(${phone.slice(0, 3)}) ${phone.slice(3, 6)}-${phone.slice(6)}` : phone))}</div>}
      <div className="flex flex-wrap items-center gap-1.5">
        {CHOICES.map(([k, label]) => (
          <button key={k} type="button" disabled={busy} onClick={() => { // one tap saves; with the note box open, tap = choose, then Save
                    if (pick === k && k !== 'other') void save(k); else if (k === 'other' || pick) setPick(k); else void save(k);
                  }}
                  className={`${chip} ${pick === k ? 'bg-forest text-paper border-forest' : 'bg-paper text-forest border-forest/40'}`}>{label}</button>
        ))}
        <button type="button" onClick={() => setPick(pick ? null : 'more')} className="text-[11.5px] font-bold text-muted underline">{pick ? 'Less' : '+ note / pickup'}</button>
        {onClose && <button type="button" onClick={onClose} className="text-[11.5px] font-bold text-muted ml-auto">Skip</button>}
      </div>
      {pick && (
        <div className="flex flex-wrap items-center gap-1.5">
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="Short note (optional)"
                 className="flex-1 min-w-[160px] rounded-[8px] border border-line bg-paper px-2 py-1 text-[12.5px]" />
          {(ctx.data?.data.pickups.length ?? 0) > 0 && (
            <select value={pickupId} onChange={(e) => setPickupId(e.target.value ? Number(e.target.value) : '')} className="rounded-[8px] border border-line bg-paper px-2 py-1 text-[12.5px] max-w-[220px]">
              <option value="">About which pickup? (optional)</option>
              {ctx.data!.data.pickups.map((p) => <option key={p.id} value={p.id}>{p.mine ? '★ ' : ''}{p.label}</option>)}
            </select>
          )}
          {pick !== 'more' && <button type="button" disabled={busy} onClick={() => void save(pick)} className="haptic rounded-[8px] bg-forest text-paper px-3 py-1 text-[12.5px] font-bold">Save</button>}
        </div>
      )}
      {err && <div className="text-[12px] text-clay font-bold">{err}</div>}
    </div>
  );
}
