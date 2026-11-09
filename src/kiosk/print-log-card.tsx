/**
 * Oct 31 client: "Can you see how the labels actually print? Is there a way that we can log it and see it?"
 * Office → Kiosk Activity → Printed labels: every kiosk print (from the new kiosk app build on): who, which
 * store, how many printed, the path (straight to the printer / via the server / print dialog), any error,
 * and the first label as it was sent. It shows what was SENT, not the paper itself.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { whenAt } from '../display';

type Face = { store: string[]; date: string; kind: string; container: string; count: string; caterer?: boolean; sub?: string }; // Nov 6 client: + caterer
type Row = {
  id: number; at: string; driver: string | null; transport: 'tcp' | 'relay' | 'browser' | 'none'; ok: boolean;
  printed: number; total: number; stopped?: boolean; error?: string | null; layout?: string; faces?: Face[]; commands?: string | null;
};
const PATH: Record<Row['transport'], string> = {
  tcp: 'straight to the printer', relay: 'through the server', browser: 'print dialog', none: 'no printer found',
};

function MiniLabel({ f }: { f: Face }) {
  return (
    <div className="shrink-0 w-[132px] h-[132px] rounded-full border-2 border-ink/70 bg-white flex flex-col items-center justify-center text-center leading-tight px-3">
      {f.store.map((s, i) => <div key={i} className="text-[10px] font-bold truncate max-w-full">{s}</div>)}
      {f.sub && <div className="text-[8.5px] truncate max-w-full">{f.sub}</div>}
      <div className="text-[9px] text-muted">{f.date}</div>
      <div className="text-[13px] font-extrabold mt-0.5">{f.kind}</div>
      {f.container && <div className="text-[10px] font-bold">{f.container}</div>}
      <div className="text-[10px] font-bold">{f.count}</div>
    </div>
  );
}

export function PrintLogCard() {
  const [open, setOpen] = useState(false);
  const [cmd, setCmd] = useState<number | null>(null);
  const q = useQuery({
    queryKey: ['kiosk-print-log'], enabled: open, refetchInterval: open ? 30_000 : false,
    queryFn: () => api<{ data: Row[] }>('/api/admin/kiosk-print-log'),
  });
  const rows = q.data?.data ?? [];
  return (
    <div className="rounded-[14px] border border-line bg-paper">
      <button type="button" onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between px-4 py-3 text-left">
        <span>
          <span className="font-bold text-[15px]">🖨️ Printed labels</span>
          <span className="block text-[12px] text-muted">Each kiosk print: what was sent to the label printer and what happened.</span>
        </span>
        <span className="text-muted font-bold">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="border-t border-line px-4 py-3 space-y-3">
          {q.isLoading ? <div className="text-[13px] text-muted">Loading…</div>
            : q.isError ? <div className="text-[13px] text-clay">Couldn't load the print log.</div>
            : rows.length === 0 ? <div className="text-[13px] text-muted">No prints logged yet. The kiosk tablet starts logging with the next app build.</div>
            : rows.map((r) => {
              const f = r.faces?.[0];
              const result = r.ok
                ? (r.stopped ? `${r.printed} of ${r.total} printed, then "Don't need labels"` : `${r.printed} of ${r.total} printed`)
                : `Didn't print (${r.printed} of ${r.total})${r.error ? ` — ${r.error}` : ''}`;
              return (
                <div key={r.id} className="flex gap-3 items-start border-b border-line/70 pb-3 last:border-0">
                  {f && <MiniLabel f={f} />}
                  <div className="min-w-0 text-[13px]">
                    <div className="font-bold">{whenAt(r.at)}{r.driver ? ` · ${r.driver}` : ''}</div>
                    {f && <div className="text-muted">{f.caterer ? `🍽 Caterer: ${f.store.join(' ')}${f.sub ? ` · ${f.sub}` : ''}` : f.store.join(' ')}</div>}
                    <div className={r.ok ? 'text-forest font-bold' : 'text-clay font-bold'}>{r.ok ? '✓ ' : '⚠️ '}{result}</div>
                    <div className="text-muted">Sent {PATH[r.transport] ?? r.transport}{r.layout ? ` · ${r.layout === 'round' ? 'new round label' : 'old label'}` : ''}</div>
                    {r.commands && (
                      <button type="button" onClick={() => setCmd(cmd === r.id ? null : r.id)} className="text-[12px] underline text-muted mt-1">
                        {cmd === r.id ? 'Hide printer commands' : 'Show printer commands'}
                      </button>
                    )}
                    {cmd === r.id && r.commands && (
                      <pre className="mt-1 text-[10px] bg-cream rounded-[8px] p-2 whitespace-pre-wrap break-all">{r.commands}</pre>
                    )}
                  </div>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
