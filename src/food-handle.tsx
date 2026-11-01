/**
 * Oct 30 client: "Food to handle" — after a kiosk drop-off the center packages each item and adds
 * it to the ordering platform. One row per item (kiosk drop-off line) with two ticks + "Not usable /
 * thrown out" (with a short reason); "All packaged" / "All added" per drop-off; handled items fold
 * away. Red after 5 PM (Friday / erev Yom Tov: 2 hours before candle lighting). Notes on an item or a
 * whole drop-off (who + when; older notes on tap). Each drop-off shows what came out of it, and
 * "By store" shows it per store for the day / the week. Server: apps/api/src/food-handle.ts.
 *
 *   FoodHandlePanel   office portal menu "Food to handle" (also dispatchers), and the driver app
 *                     screen for Center Help people (FoodHandleScreen, route /food).
 *   FoodToHandleLink  driver app home: a button, only for Center Help people.
 *   PickupFoodResult  pickup page: "6 items · 5 packaged · 5 added to ordering · 1 thrown".
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { api } from './api';
import { cx } from './design';
import { uiNotify } from './ui-dialogs';
import { nyToday } from './time-format';
import { dayText, personShort, stripUnit, timeAt, whenAt } from './display';
import { tidyPlaceName } from './pickup-label';
import { DropoffStockLine } from './stock-link'; // Oct 30 client: "→ added to stock" per drop-off

type What = 'packaged' | 'added' | 'thrown';
type Tick = { by: number | null; byName: string | null; at: string; reason?: string | null } | null;
type Note = { text: string; by: number | null; byName: string | null; at: string; count: number } | null;
type Item = {
  id: number; dropoffId: number; day: string; at: string;
  category: string; description: string; quantity: number; unit: string;
  store: string | null; driver: string; unit_number: number | null;
  st: { packaged: Tick; added: Tick; thrown: Tick }; before: boolean; status: string; handled: boolean; late: boolean;
  note: Note; dropoffNote: Note;
};
type Counts = { waiting: number; notPackaged: number; notAdded: number; packagedNotAdded: number; thrown: number };
type Result = { items: number; packaged: number; added: number; thrown: number };
type StoreRow = Result & { store: string; dropoffs: number };
type Screen = {
  day: string; today: string; isToday: boolean; start: string; lateAt: string | null;
  items: Item[]; counts: Counts; top: string; canEdit: boolean;
  week: { in: number; packaged: number; added: number; thrown: number; from: string; line: string };
  dropoffs: Record<string, Result & { line: string }>;
  byStore: { day: StoreRow[]; week: StoreRow[] };
  reasons: string[];
};
type MarkBody = { ids?: number[]; dropoffId?: number; what: What; on: boolean; reason?: string | null };
type NoteBody = { itemId?: number; dropoffId?: number; text: string };

const shiftYmd = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const handledOf = (it: Item) => !!it.st.thrown || (!!it.st.packaged && !!it.st.added) || it.before;
const shortName = (full: string | null | undefined) => {
  const parts = stripUnit(full ?? '').split(/\s+/).filter(Boolean);
  return parts.length ? personShort(parts[0], parts.slice(1).join(' ')) : '';
};
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const itemLabel = (it: Item) => {
  if (it.category === 'Drop-off') return plural(it.quantity, 'item', 'items') + ' (not sorted)';
  const unit = it.quantity === 1 ? it.unit : (it.unit.endsWith('x') ? `${it.unit}es` : `${it.unit}s`);
  return `${it.quantity} ${unit} · ${it.category}`;
};
const storeOf = (it: Item) => (it.store ? tidyPlaceName(it.store) || it.store : 'Store not set');
const whoWhen = (t: { byName: string | null; at: string }) => {
  const who = t.byName === 'You' ? 'you' : shortName(t.byName);
  return `${who ? `${who} · ` : ''}${whenAt(t.at)}`;
};

/** Group items by drop-off, newest first (items come sorted). */
function groupItems(items: Item[]) {
  const out: Array<{ dropoffId: number; at: string; day: string; driver: string; stores: string[]; items: Item[]; note: Note }> = [];
  const by = new Map<number, (typeof out)[number]>();
  for (const it of items) {
    let g = by.get(it.dropoffId);
    if (!g) { g = { dropoffId: it.dropoffId, at: it.at, day: it.day, driver: it.driver, stores: [], items: [], note: it.dropoffNote }; by.set(it.dropoffId, g); out.push(g); }
    g.items.push(it);
    const s = storeOf(it);
    if (!g.stores.includes(s)) g.stores.push(s);
  }
  return out;
}
type Group = ReturnType<typeof groupItems>[number];

export function FoodHandlePanel({ compact = false }: { compact?: boolean }) {
  const today = nyToday();
  const [day, setDay] = useState(today);
  const [view, setView] = useState<'items' | 'stores'>('items');
  const [showHandled, setShowHandled] = useState(false);
  const qc = useQueryClient();
  const key = ['food-handle', day];
  const q = useQuery({
    queryKey: key, queryFn: () => api<{ data: Screen }>(`/api/food-handle?day=${day}`),
    refetchInterval: 30_000, refetchOnWindowFocus: true, staleTime: 5_000,
  });
  const s = q.data?.data;
  const mark = useMutation({
    mutationFn: (b: MarkBody) => api<{ data: { changed: number } }>('/api/food-handle/mark', { method: 'POST', body: JSON.stringify(b) }),
    // Instant: change the ticks on screen first, then reload from the server.
    onMutate: async (b) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<{ data: Screen }>(key);
      if (prev) {
        const now = new Date().toISOString();
        const items = prev.data.items.map((it) => {
          const hit = b.ids ? b.ids.includes(it.id) : it.dropoffId === b.dropoffId && (b.what === 'thrown' || !it.st.thrown);
          if (!hit) return it;
          const st = { ...it.st, [b.what]: b.on ? (it.st[b.what] ?? { by: null, byName: 'You', at: now, reason: b.reason ?? null }) : null };
          const n = { ...it, st };
          return { ...n, handled: handledOf(n) };
        });
        qc.setQueryData(key, { data: { ...prev.data, items } });
      }
      return { prev };
    },
    onError: (e: Error, _b, c) => { if (c?.prev) qc.setQueryData(key, c.prev); uiNotify(e.message || 'Could not save. Try again.', 'err'); },
    onSettled: () => qc.invalidateQueries({ queryKey: ['food-handle'] }),
  });
  const note = useMutation({
    mutationFn: (b: NoteBody) => api('/api/food-handle/note', { method: 'POST', body: JSON.stringify(b) }),
    onSuccess: () => uiNotify('Note saved.', 'ok'),
    onError: (e: Error) => uiNotify(e.message || 'Could not save the note.', 'err'),
    onSettled: () => { qc.invalidateQueries({ queryKey: ['food-handle'] }); qc.invalidateQueries({ queryKey: ['food-notes'] }); },
  });

  const lateAtMs = s?.lateAt ? Date.parse(s.lateAt) : null;
  const nowMs = Date.now();
  const lateOf = (it: Item) => !it.handled && (it.day < (s?.today ?? today) || (it.day === (s?.today ?? today) && lateAtMs != null && nowMs >= lateAtMs));
  const waiting = useMemo(() => groupItems((s?.items ?? []).filter((it) => !it.handled)), [s]);
  const handled = useMemo(() => groupItems((s?.items ?? []).filter((it) => it.handled)), [s]);
  const handledCount = (s?.items ?? []).filter((it) => it.handled).length;
  const counts = useMemo(() => {
    const c: Counts = { waiting: 0, notPackaged: 0, notAdded: 0, packagedNotAdded: 0, thrown: 0 };
    for (const it of s?.items ?? []) {
      if (it.st.thrown) { c.thrown++; continue; }
      if (it.handled) continue;
      c.waiting++;
      if (!it.st.packaged) c.notPackaged++; else { c.notAdded++; c.packagedNotAdded++; }
    }
    return c;
  }, [s]);
  const canEdit = !!s?.canEdit;
  const isToday = day === today;
  const dayLabel = isToday ? 'today' : day === shiftYmd(today, -1) ? 'yesterday' : dayText(day, today);
  const lateTime = s?.lateAt ? timeAt(s.lateAt) : null;
  const card = (g: Group, handledView = false) => (
    <DropoffCard key={g.dropoffId} g={g} today={s!.today} canEdit={canEdit} busy={mark.isPending || note.isPending}
                 result={s!.dropoffs[String(g.dropoffId)]} reasons={s!.reasons}
                 lateOf={handledView ? () => false : lateOf} onMark={(b) => mark.mutate(b)} onNote={(b) => note.mutate(b)} handledView={handledView} />
  );

  return (
    <div className={cx('space-y-3', compact ? '' : 'max-w-[980px]')} data-food-handle>
      <div className="rounded-[14px] border border-line bg-paper px-4 py-3 space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[220px]">
            <div className="font-display font-semibold text-[19px]">🥡 Food to handle{isToday ? '' : ` · ${dayLabel}`}</div>
            <div className="text-[13px] text-muted">Package each item, then add it to the ordering platform. Tick each one when it's done.</div>
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={() => setDay(shiftYmd(day, -1))} className="haptic min-h-[44px] rounded-[10px] border border-line bg-paper px-3 text-[13.5px] font-bold">‹ Day before</button>
            <input type="date" value={day} max={today} aria-label="Pick a day"
                   onChange={(e) => { const v = e.target.value; if (/^\d{4}-\d{2}-\d{2}$/.test(v)) setDay(v > today ? today : v); }}
                   className="min-h-[44px] rounded-[10px] border border-line bg-paper px-2 text-[13.5px] font-bold" />
            {!isToday && <button onClick={() => setDay(today)} className="haptic min-h-[44px] rounded-[10px] bg-forest px-3 text-[13.5px] font-bold text-paper">Today</button>}
          </div>
        </div>
        {s && (
          <div data-food-top className={cx('rounded-[10px] px-3 py-2 text-[15px] font-bold',
                                            counts.waiting === 0 ? 'bg-sage/50 text-forest' : 'bg-cream text-ink')}>
            {plural(counts.waiting, 'item', 'items')} waiting · {counts.packagedNotAdded} packaged, not yet in the ordering platform · {counts.thrown} thrown out
          </div>
        )}
        {s && (
          <div className="flex flex-wrap items-center gap-2">
            <div data-food-week className="flex-1 min-w-[220px] text-[12.5px] text-muted font-semibold">{s.week.line}</div>
            <div className="inline-flex rounded-[10px] border border-line overflow-hidden" role="tablist">
              {(['items', 'stores'] as const).map((v) => (
                <button key={v} onClick={() => setView(v)} data-food-view={v}
                        className={cx('haptic min-h-[40px] px-3 text-[13px] font-bold', view === v ? 'bg-forest text-paper' : 'bg-paper text-muted')}>
                  {v === 'items' ? 'Items' : 'By store'}
                </button>
              ))}
            </div>
          </div>
        )}
        {s && isToday && lateTime && counts.waiting > 0 && view === 'items' && (
          <div className="text-[12px] text-muted">Items not handled by {lateTime} turn red, and the office gets one text.</div>
        )}
      </div>

      {q.isLoading && <div className="rounded-[14px] border border-line bg-paper px-4 py-6 text-center text-muted">Loading…</div>}
      {q.isError && !s && (
        <div className="rounded-[14px] border border-clay/40 bg-clay-soft px-4 py-3 text-[13.5px] text-clay font-bold">
          Could not load the list. <button className="underline" onClick={() => q.refetch()}>Try again</button>
        </div>
      )}

      {s && view === 'stores' && <ByStore s={s} dayLabel={dayLabel} />}

      {s && view === 'items' && (
        <>
          {waiting.length === 0 && (
            <div className="rounded-[14px] border border-sage-line bg-sage/40 px-4 py-4 text-[15px] font-bold text-forest">
              ✓ {s.items.length === 0 ? `No food came in ${dayLabel}.` : `Everything from ${dayLabel} is handled.`}
            </div>
          )}
          {waiting.map((g) => card(g))}
          {handledCount > 0 && (
            <div className="rounded-[14px] border border-line bg-paper">
              <button onClick={() => setShowHandled(!showHandled)} data-food-handled-toggle
                      className="haptic w-full min-h-[52px] px-4 flex items-center justify-between text-left">
                <span className="font-bold text-[15px] text-forest">✓ Handled {dayLabel} ({handledCount})</span>
                <span className="text-[13px] text-muted font-bold">{showHandled ? 'Hide ▲' : 'Show ▼'}</span>
              </button>
              {showHandled && <div className="px-3 pb-3 space-y-3">{handled.map((g) => card(g, true))}</div>}
            </div>
          )}
        </>
      )}
    </div>
  );
}

type SortKey = 'store' | 'dropoffs' | 'items' | 'packaged' | 'added' | 'thrown';
function ByStore({ s, dayLabel }: { s: Screen; dayLabel: string }) {
  const [scope, setScope] = useState<'day' | 'week'>('day');
  const [sort, setSort] = useState<{ k: SortKey; desc: boolean }>({ k: 'items', desc: true });
  const rows = [...(scope === 'day' ? s.byStore.day : s.byStore.week)].sort((a, b) => {
    const d = sort.k === 'store' ? a.store.localeCompare(b.store) : (a[sort.k] as number) - (b[sort.k] as number);
    return (sort.desc ? -d : d) || a.store.localeCompare(b.store);
  });
  const cols: Array<[SortKey, string]> = [['store', 'Store'], ['dropoffs', 'Drop-offs'], ['items', 'Items'], ['packaged', 'Packaged'], ['added', 'Added'], ['thrown', 'Thrown']];
  const total = rows.reduce((t, r) => ({ d: t.d + r.dropoffs, i: t.i + r.items, p: t.p + r.packaged, a: t.a + r.added, x: t.x + r.thrown }), { d: 0, i: 0, p: 0, a: 0, x: 0 });
  return (
    <div className="rounded-[14px] border border-line bg-paper overflow-hidden" data-food-bystore>
      <div className="px-4 py-2.5 flex flex-wrap items-center gap-2 bg-cream/60">
        <div className="flex-1 font-bold text-[15px]">What came out of it, by store</div>
        <div className="inline-flex rounded-[10px] border border-line overflow-hidden">
          {(['day', 'week'] as const).map((v) => (
            <button key={v} onClick={() => setScope(v)}
                    className={cx('haptic min-h-[40px] px-3 text-[13px] font-bold', scope === v ? 'bg-forest text-paper' : 'bg-paper text-muted')}>
              {v === 'day' ? (dayLabel === 'today' ? 'Today' : dayLabel) : 'This week'}
            </button>
          ))}
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="px-4 py-4 text-[14px] text-muted">No drop-offs {scope === 'day' ? dayLabel : 'this week'}.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[14px]">
            <thead>
              <tr className="text-left text-[12px] text-muted">
                {cols.map(([k, label]) => (
                  <th key={k} className={cx('px-3 py-2 font-bold', k !== 'store' && 'text-right')}>
                    <button className="haptic font-bold hover:text-ink"
                            onClick={() => setSort((o) => ({ k, desc: o.k === k ? !o.desc : k !== 'store' }))}>
                      {label}{sort.k === k ? (sort.desc ? ' ▼' : ' ▲') : ''}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.store} title={`${r.store}: ${r.dropoffs} drop-off${r.dropoffs === 1 ? '' : 's'} · ${r.items} items · ${r.added} added · ${r.thrown} thrown`}>
                  <td className="px-3 py-2.5 font-bold">{tidyPlaceName(r.store) || r.store}</td>
                  <td className="px-3 py-2.5 text-right">{r.dropoffs}</td>
                  <td className="px-3 py-2.5 text-right font-bold">{r.items}</td>
                  <td className="px-3 py-2.5 text-right">{r.packaged}</td>
                  <td className="px-3 py-2.5 text-right text-forest font-bold">{r.added}</td>
                  <td className={cx('px-3 py-2.5 text-right', r.thrown ? 'text-clay font-bold' : 'text-muted')}>{r.thrown}</td>
                </tr>
              ))}
              <tr className="bg-cream/50 font-bold">
                <td className="px-3 py-2.5">All stores</td>
                <td className="px-3 py-2.5 text-right">{total.d}</td>
                <td className="px-3 py-2.5 text-right">{total.i}</td>
                <td className="px-3 py-2.5 text-right">{total.p}</td>
                <td className="px-3 py-2.5 text-right">{total.a}</td>
                <td className="px-3 py-2.5 text-right">{total.x}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <div className="px-4 py-2 text-[11.5px] text-muted">"Added" = a volunteer ticked "Added to the ordering platform".</div>
    </div>
  );
}

function DropoffCard({ g, today, canEdit, busy, result, reasons, lateOf, onMark, onNote, handledView = false }: {
  g: Group; today: string; canEdit: boolean; busy: boolean; result?: Result & { line: string }; reasons: string[];
  lateOf: (it: Item) => boolean; onMark: (b: MarkBody) => void; onNote: (b: NoteBody) => void; handledView?: boolean;
}) {
  const live = g.items.filter((it) => !it.st.thrown);
  const needPack = live.filter((it) => !it.st.packaged).length;
  const needAdd = live.filter((it) => !it.st.added).length;
  const anyLate = g.items.some(lateOf);
  const when = g.day === today ? timeAt(g.at) : `${dayText(g.day, today)} · ${timeAt(g.at)}`;
  const driver = shortName(g.driver);
  return (
    <div data-food-dropoff={g.dropoffId}
         className={cx('rounded-[14px] border bg-paper overflow-hidden', anyLate ? 'border-clay' : 'border-line')}>
      <div className={cx('px-4 py-2.5 space-y-1', anyLate ? 'bg-clay-soft' : 'bg-cream/60')}>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex-1 min-w-[220px] text-[15px]">
            <span className="font-bold">{g.stores.join(' + ')}</span>
            <span className="text-muted"> · {when}{driver ? ` · driver ${driver}` : ''}</span>
          </div>
          {canEdit && !handledView && (
            <div className="flex gap-1.5">
              {needPack > 0 && (
                <button disabled={busy} onClick={() => onMark({ dropoffId: g.dropoffId, what: 'packaged', on: true })}
                        className="haptic min-h-[44px] rounded-[10px] border border-forest/40 bg-paper px-3 text-[13.5px] font-bold text-forest disabled:opacity-50">✓ All packaged</button>
              )}
              {needAdd > 0 && (
                <button disabled={busy} onClick={() => onMark({ dropoffId: g.dropoffId, what: 'added', on: true })}
                        className="haptic min-h-[44px] rounded-[10px] border border-forest/40 bg-paper px-3 text-[13.5px] font-bold text-forest disabled:opacity-50">✓ All added</button>
              )}
            </div>
          )}
        </div>
        <div data-food-result className="text-[13px] font-bold text-forest">
          {result ? result.line : plural(g.items.length, 'item', 'items')}
        </div>
        <DropoffStockLine dropoffId={g.dropoffId} />
        <NoteLine note={g.note} target={{ dropoffId: g.dropoffId }} canEdit={canEdit} busy={busy} onNote={onNote} label="Note on this drop-off" />
      </div>
      <div className="divide-y divide-line">
        {g.items.map((it) => <ItemRow key={it.id} it={it} late={lateOf(it)} canEdit={canEdit} busy={busy} reasons={reasons} onMark={onMark} onNote={onNote} />)}
      </div>
    </div>
  );
}

/** Latest note (who · when), "+ Note" to add one, older notes on tap. */
function NoteLine({ note, target, canEdit, busy, onNote, label }: {
  note: Note; target: { itemId?: number; dropoffId?: number }; canEdit: boolean; busy: boolean; onNote: (b: NoteBody) => void; label: string;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [older, setOlder] = useState(false);
  const qs = target.itemId ? `item=${target.itemId}` : `dropoff=${target.dropoffId}`;
  const hist = useQuery({
    queryKey: ['food-notes', qs], enabled: older,
    queryFn: () => api<{ data: Array<{ text: string; byName: string | null; at: string }> }>(`/api/food-handle/notes?${qs}`),
  });
  if (!note && !canEdit) return null;
  return (
    <div className="text-[12.5px]" data-food-note={target.itemId ? `item-${target.itemId}` : `dropoff-${target.dropoffId}`}>
      {note && (
        <div className="flex flex-wrap items-baseline gap-x-1.5">
          <span className="text-ink">📝 {note.text}</span>
          <span className="text-muted">— {whoWhen(note)}</span>
          {note.count > 1 && (
            <button onClick={() => setOlder(!older)} className="haptic text-forest font-bold underline">
              {older ? 'hide older' : `${note.count - 1} older`}
            </button>
          )}
        </div>
      )}
      {older && (hist.data?.data ?? []).slice(1).map((n, i) => (
        <div key={i} className="pl-5 text-muted">· {n.text} — {whoWhen(n)}</div>
      ))}
      {canEdit && !open && (
        <button onClick={() => setOpen(true)} className="haptic mt-0.5 text-[12.5px] font-bold text-muted hover:text-forest">+ {note ? 'Add a note' : label}</button>
      )}
      {canEdit && open && (
        <div className="mt-1 flex flex-wrap gap-1.5">
          <input autoFocus value={text} maxLength={300} onChange={(e) => setText(e.target.value)}
                 onKeyDown={(e) => { if (e.key === 'Enter' && text.trim()) { onNote({ ...target, text }); setText(''); setOpen(false); } }}
                 placeholder="Why not packaged, how it was packaged…"
                 className="flex-1 min-w-[200px] min-h-[44px] rounded-[10px] border border-line bg-paper px-3 text-[14px]" />
          <button disabled={busy || !text.trim()} onClick={() => { onNote({ ...target, text }); setText(''); setOpen(false); }}
                  className="haptic min-h-[44px] rounded-[10px] bg-forest px-3 text-[13.5px] font-bold text-paper disabled:opacity-50">Save note</button>
          <button onClick={() => { setOpen(false); setText(''); }} className="haptic min-h-[44px] px-2 text-[13px] font-bold text-muted">Cancel</button>
        </div>
      )}
    </div>
  );
}

function ItemRow({ it, late, canEdit, busy, reasons, onMark, onNote }: {
  it: Item; late: boolean; canEdit: boolean; busy: boolean; reasons: string[];
  onMark: (b: MarkBody) => void; onNote: (b: NoteBody) => void;
}) {
  const [asking, setAsking] = useState(false);
  const [other, setOther] = useState('');
  const thrown = it.st.thrown;
  const toggle = (what: What) => onMark({ ids: [it.id], what, on: !it.st[what] });
  const throwOut = (reason: string | null) => { onMark({ ids: [it.id], what: 'thrown', on: true, reason }); setAsking(false); setOther(''); };
  const tickBtn = (what: 'packaged' | 'added', label: string) => {
    const on = !!it.st[what];
    return (
      <button disabled={!canEdit || busy || !!thrown} onClick={() => toggle(what)} data-food-tick={what}
              title={on ? 'Tap to undo' : undefined}
              className={cx('haptic min-h-[52px] min-w-[150px] flex-1 sm:flex-none rounded-[12px] border px-3 py-1.5 text-left disabled:cursor-default',
                            on ? 'border-forest bg-sage text-forest' : late ? 'border-clay/60 bg-paper text-ink' : 'border-line bg-paper text-ink',
                            thrown && 'opacity-40')}>
        <span className="block text-[15px] font-bold leading-tight">{on ? '☑' : '☐'} {label}</span>
        {on && <span className="block text-[11.5px] text-forest/80 leading-tight">{whoWhen(it.st[what]!)}</span>}
      </button>
    );
  };
  return (
    <div data-food-item={it.id} data-late={late ? '1' : undefined}
         className={cx('px-4 py-2.5 space-y-1.5', late && 'bg-clay-soft/60')}>
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="flex-1 min-w-[180px]">
          <div className={cx('text-[16px] font-bold', late ? 'text-clay' : 'text-ink', thrown && 'line-through text-muted')}>{itemLabel(it)}</div>
          <div className="text-[12.5px] text-muted">
            {storeOf(it)}
            {it.description && it.category !== 'Drop-off' ? ` · ${it.description}` : ''}
            {it.before && !it.st.packaged && !it.st.added && !thrown ? ' · came in before this list started' : ''}
            {late && !thrown ? ' · not handled yet' : ''}
          </div>
          {thrown && (
            <div className="text-[12.5px] font-bold text-clay">🗑 Thrown out{thrown.reason ? `: ${thrown.reason}` : ''} — {whoWhen(thrown)}</div>
          )}
        </div>
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          {tickBtn('packaged', 'Packaged')}
          {tickBtn('added', 'Added to the ordering platform')}
          {canEdit && (
            <button disabled={busy} onClick={() => (thrown ? toggle('thrown') : setAsking(!asking))} data-food-tick="thrown"
                    className={cx('haptic min-h-[52px] rounded-[12px] border px-3 text-[13px] font-bold',
                                  thrown || asking ? 'border-clay bg-clay-soft text-clay' : 'border-line bg-paper text-muted')}>
              {thrown ? 'Undo thrown out' : 'Not usable / thrown out'}
            </button>
          )}
        </div>
      </div>
      {asking && !thrown && (
        <div className="rounded-[12px] border border-clay/40 bg-clay-soft/50 px-3 py-2 space-y-1.5" data-food-reason>
          <div className="text-[13px] font-bold text-clay">Why is it thrown out? (helps us see what happens with each store)</div>
          <div className="flex flex-wrap gap-1.5">
            {reasons.map((r) => (
              <button key={r} disabled={busy} onClick={() => throwOut(r)}
                      className="haptic min-h-[44px] rounded-[10px] border border-clay/50 bg-paper px-3 text-[13.5px] font-bold text-clay">{r}</button>
            ))}
            <input value={other} maxLength={120} onChange={(e) => setOther(e.target.value)} placeholder="Other reason…"
                   className="min-w-[160px] flex-1 min-h-[44px] rounded-[10px] border border-line bg-paper px-3 text-[14px]" />
            <button disabled={busy} onClick={() => throwOut(other.trim() || null)}
                    className="haptic min-h-[44px] rounded-[10px] bg-clay px-3 text-[13.5px] font-bold text-paper">{other.trim() ? 'Throw out' : 'Throw out, no reason'}</button>
            <button onClick={() => { setAsking(false); setOther(''); }} className="haptic min-h-[44px] px-2 text-[13px] font-bold text-muted">Cancel</button>
          </div>
        </div>
      )}
      <NoteLine note={it.note} target={{ itemId: it.id }} canEdit={canEdit} busy={busy} onNote={onNote} label="Note" />
    </div>
  );
}

/** Driver app (Center Help people): the same list on its own screen. Route /food. */
export function FoodHandleScreen() {
  const nav = useNavigate();
  return (
    <div className="min-h-screen pb-[80px]">
      <div className="flex items-center gap-3 px-5 py-3">
        <button onClick={() => nav('/')} aria-label="Back"
                className="haptic grid h-[44px] w-[44px] place-items-center rounded-full bg-paper border border-line">
          <ArrowLeft size={20} />
        </button>
        <div className="font-display font-semibold text-[20px]">Food to handle</div>
      </div>
      <main className="px-3"><FoodHandlePanel compact /></main>
    </div>
  );
}

/** Driver app home: only Center Help people (and office logins) see this button. */
export function FoodToHandleLink() {
  const nav = useNavigate();
  const q = useQuery({
    queryKey: ['food-handle-access'], queryFn: () => api<{ data: { access: 'write' | 'read' | null } }>('/api/food-handle/access'),
    staleTime: 30 * 60_000, retry: false,
  });
  if (!q.data?.data?.access) return null;
  return (
    <button onClick={() => nav('/food')} data-food-link
            className="haptic w-full mt-5 rounded-[14px] border border-line bg-paper px-4 py-3 flex items-center gap-3 text-left">
      <span className="text-[24px]">🥡</span>
      <span className="flex-1">
        <span className="block font-bold text-[15px]">Food to handle</span>
        <span className="block text-[13px] text-muted">Tick each item when it's packaged and added to the ordering platform.</span>
      </span>
      <span className="text-muted font-bold">›</span>
    </button>
  );
}

/** Pickup page: what came out of this pickup's kiosk drop-off (nothing when there was none). */
export function PickupFoodResult({ pickupId }: { pickupId: number }) {
  const q = useQuery({
    queryKey: ['food-handle-pickup', pickupId], enabled: pickupId > 0, staleTime: 30_000, retry: false,
    queryFn: () => api<{ data: (Result & { line: string; store: string | null; before: boolean }) | null }>(`/api/food-handle/pickup/${pickupId}`),
  });
  const r = q.data?.data;
  if (!r) return null;
  const line = r.before && !r.packaged && !r.added && !r.thrown
    ? `${plural(r.items, 'item', 'items')} dropped off (before the Food to handle list started)`
    : r.line.replace(r.store ? `${r.store} · ` : '', '');
  return (
    <div data-food-pickup-result className="rounded-[12px] border border-sage-line bg-sage/40 px-3 py-2 text-[13.5px]">
      <span className="font-bold text-forest">🥡 What came out of it: </span>{line}
    </div>
  );
}
