/**
 * Nov 6 client: "Can we get a more neat thing for this?" (the plain "Who" dropdown) — one friendly dispatcher
 * picker for every place a dispatcher is chosen: Put someone on right now, Plan a change for later, the
 * Assign dispatcher popup and the New / Edit shift forms.
 *   <DispatcherPicker>  a button (avatar + "Moshe A.") → a pop-over (desktop) or a bottom sheet (phone)
 *   <DispatcherList>    the search + list itself (also used inline, e.g. in the Assign dispatcher popup)
 * Rows: avatar initials, the name (proper capitals: "Baruch R."), small tags: on deck (green), on shift now,
 * calls off (muted; with `forCalls` it can't be picked, a tap says why), no cell (orange; same with `forCalls`).
 * Groups: On deck, Other dispatchers, then a folded "No dispatcher login yet (N)".
 * `allowNumber`: a last row "➕ Type a phone number…" (value 'other'; the caller shows the number + name inputs).
 * Keyboard: ↑ ↓ Enter Esc; closes on an outside click. No new package.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export type PickPerson = {
  id: number;
  name: string;
  /** full name etc., only for the search */
  search?: string;
  onDeck?: boolean;
  onShiftNow?: boolean;
  noCalls?: boolean;
  noCell?: boolean;
  noLogin?: boolean;
};
export type PickValue = number | 'other' | null;

/** "baruch r." → "Baruch R."; "david  s" → "David S" */
export function niceName(s: string | null | undefined): string {
  return String(s ?? '').trim().replace(/\s+/g, ' ').split(' ')
    .map((w) => (w ? w.charAt(0).toLocaleUpperCase() + w.slice(1) : w)).join(' ');
}
/** first name + last initial: "Moshe A." */
export function shortName(first?: string | null, last?: string | null): string {
  const f = niceName(first), l = niceName(last);
  return l ? `${f} ${l.charAt(0)}.`.trim() : f;
}
function initials(name: string) {
  const p = name.replace(/[^\p{L}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] ?? '?') + (p[1]?.[0] ?? '')).toUpperCase();
}
const TONES = ['bg-sage text-forest', 'bg-sky-soft text-sky', 'bg-amber-soft text-[#9a5a12]', 'bg-cream text-ink'];
function tone(name: string) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return TONES[h % TONES.length];
}
export function Avatar({ name, size = 30, dim = false }: { name: string; size?: number; dim?: boolean }) {
  return (
    <span aria-hidden className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold border border-line/70 ${tone(name)} ${dim ? 'opacity-50' : ''}`}
          style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}>{initials(name)}</span>
  );
}

const tagCls = 'rounded-full px-1.5 py-px text-[10.5px] font-bold whitespace-nowrap';
function Tags({ p }: { p: PickPerson }) {
  return (
    <span className="flex flex-wrap gap-1">
      {p.onDeck && <span className={`${tagCls} bg-sage text-forest`}>on deck</span>}
      {p.onShiftNow && <span className={`${tagCls} bg-sky-soft text-sky`}>on shift now</span>}
      {p.noCalls && <span className={`${tagCls} bg-cream text-muted border border-line`}>calls off</span>}
      {p.noCell && <span className={`${tagCls} bg-amber-soft text-[#9a5a12]`}>no cell</span>}
    </span>
  );
}
/** why this person can't get calls (null = he can) */
function whyNot(p: PickPerson, forCalls: boolean): string | null {
  if (!forCalls) return null;
  if (p.noCalls) return `${p.name} turned off "Gets dispatch calls", so calls can't go to him. He can turn it back on in his settings.`;
  if (p.noCell) return `${p.name} has no cell number on file, so calls can't go to him. Add it on the Roster first.`;
  return null;
}

type Row = { kind: 'person'; p: PickPerson } | { kind: 'number' } | { kind: 'fold' };

/** The search box + the grouped list. `onPick` gets a person id or 'other'. */
export function DispatcherList({ people, value, onPick, forCalls = false, allowNumber = false, autoFocus = true, onEscape, busy = false, maxHeight }: {
  people: PickPerson[]; value?: PickValue; onPick: (v: number | 'other') => void; forCalls?: boolean; allowNumber?: boolean;
  autoFocus?: boolean; onEscape?: () => void; busy?: boolean; maxHeight?: number | string;
}) {
  const [q, setQ] = useState('');
  const [openLater, setOpenLater] = useState(false);
  const [note, setNote] = useState<{ id: number; text: string } | null>(null);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const qq = q.trim().toLowerCase();
  const { deck, rest, later } = useMemo(() => {
    const hit = (p: PickPerson) => !qq || `${p.name} ${p.search ?? ''}`.toLowerCase().includes(qq);
    const m = people.filter(hit);
    return { deck: m.filter((p) => p.onDeck && !p.noLogin), rest: m.filter((p) => !p.onDeck && !p.noLogin), later: m.filter((p) => p.noLogin) };
  }, [people, qq]);
  const showLater = openLater || (!!qq && later.length > 0);
  // the rows the keyboard walks through, in screen order
  const rows: Row[] = [
    ...deck.map((p): Row => ({ kind: 'person', p })), ...rest.map((p): Row => ({ kind: 'person', p })),
    ...(later.length ? [{ kind: 'fold' } as Row] : []), ...(showLater ? later.map((p): Row => ({ kind: 'person', p })) : []),
    ...(allowNumber ? [{ kind: 'number' } as Row] : []),
  ];
  useEffect(() => { setActive(0); }, [qq]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-row="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);
  const choose = (r: Row | undefined) => {
    if (!r || busy) return;
    if (r.kind === 'fold') return setOpenLater((x) => !x);
    if (r.kind === 'number') return onPick('other');
    const why = whyNot(r.p, forCalls);
    if (why) return setNote(note?.id === r.p.id ? null : { id: r.p.id, text: why });
    onPick(r.p.id);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(rows.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(rows[active]); }
    else if (e.key === 'Escape' && onEscape) { e.preventDefault(); e.stopPropagation(); onEscape(); }
  };
  let i = -1;
  const personRow = (p: PickPerson) => {
    const idx = ++i;
    const why = whyNot(p, forCalls);
    const sel = value === p.id;
    return (
      <div key={p.id}>
        <button type="button" role="option" aria-selected={sel} aria-disabled={!!why || undefined} data-row={idx} data-pick-id={p.id}
                onMouseEnter={() => setActive(idx)} onClick={() => { setActive(idx); choose({ kind: 'person', p }); }}
                className={`w-full flex items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left transition ${active === idx ? 'bg-cream' : ''} ${sel ? 'ring-1 ring-forest/40 bg-sage/30' : ''}`}>
          <Avatar name={p.name} dim={!!why} />
          <span className="min-w-0 flex-1">
            <span className={`block truncate text-[14px] font-bold ${why ? 'text-muted' : 'text-ink'}`}><bdi dir="auto">{p.name}</bdi></span>
            <Tags p={p} />
          </span>
          {sel && <span className="text-forest font-bold text-[15px]" aria-hidden>✓</span>}
        </button>
        {note?.id === p.id && <div className="mx-2.5 mb-1.5 rounded-[8px] bg-cream border border-line px-2.5 py-1.5 text-[12.5px] text-ink" role="status">{note.text}</div>}
      </div>
    );
  };
  const head = (t: string) => <div className="px-2.5 pt-2.5 pb-1 text-[10.5px] font-extrabold uppercase tracking-[.12em] text-muted">{t}</div>;
  const nothing = deck.length + rest.length + later.length === 0;
  return (
    <div className="flex min-h-0 flex-col" onKeyDown={onKey}>
      <div className="p-2 border-b border-line">
        <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus={autoFocus} placeholder="🔍 Search by name…" aria-label="Search dispatchers"
               role="combobox" aria-expanded aria-controls="disp-pick-list" data-pick-search
               className="w-full rounded-[10px] border border-line bg-paper px-3 py-2 text-[14px] text-ink" />
      </div>
      <div ref={listRef} id="disp-pick-list" role="listbox" className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5" style={{ maxHeight }}>
        {deck.length > 0 && <>{head('On deck')}{deck.map(personRow)}</>}
        {rest.length > 0 && <>{head(deck.length ? 'Other dispatchers' : 'Dispatchers')}{rest.map(personRow)}</>}
        {later.length > 0 && (() => {
          const idx = ++i;
          return (
            <button type="button" data-row={idx} onMouseEnter={() => setActive(idx)} onClick={() => { setActive(idx); setOpenLater((x) => !x); }} aria-expanded={showLater}
                    className={`mt-1 w-full rounded-[10px] px-2.5 py-2 text-left text-[12.5px] font-bold text-muted ${active === idx ? 'bg-cream' : ''}`}>
              {showLater ? '▾' : '▸'} No dispatcher login yet ({later.length})
            </button>
          );
        })()}
        {showLater && later.map(personRow)}
        {nothing && <div className="px-3 py-4 text-center text-[13px] text-muted">No one by that name.</div>}
        {allowNumber && (() => {
          const idx = ++i;
          return (
            <button type="button" data-row={idx} data-pick-number onMouseEnter={() => setActive(idx)} onClick={() => { setActive(idx); onPick('other'); }}
                    className={`mt-1 w-full flex items-center gap-2.5 rounded-[10px] border-t border-line px-2.5 py-2.5 text-left text-[14px] font-bold text-forest ${active === idx ? 'bg-cream' : ''} ${value === 'other' ? 'bg-sage/30' : ''}`}>
              <span className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-full border border-dashed border-forest/50 text-[15px]" aria-hidden>➕</span>
              Type a phone number…
            </button>
          );
        })()}
      </div>
    </div>
  );
}

const PHONE = '(max-width: 639px)';
/** The button + the pop-over / bottom sheet. */
export function DispatcherPicker({ people, value, onChange, forCalls = false, allowNumber = false, placeholder = 'Choose a dispatcher…', testId, ariaLabel = 'Who', footer }: {
  people: PickPerson[]; value: PickValue; onChange: (v: PickValue) => void; forCalls?: boolean; allowNumber?: boolean;
  placeholder?: string; testId?: string; ariaLabel?: string; footer?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [phone, setPhone] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(PHONE).matches);
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number; width: number; maxH: number } | null>(null);
  const chosen = typeof value === 'number' ? people.find((p) => p.id === value) ?? null : null;

  const place = () => {
    const b = btnRef.current?.getBoundingClientRect();
    if (!b) return;
    const vw = window.innerWidth, vh = window.innerHeight;
    const width = Math.min(Math.max(b.width, 320), 440, vw - 16);
    const left = Math.max(8, Math.min(b.left, vw - width - 8));
    const below = vh - b.bottom - 12, above = b.top - 12;
    if (below >= 300 || below >= above) setPos({ left, top: b.bottom + 6, width, maxH: Math.min(440, below) });
    else setPos({ left, bottom: vh - b.top + 6, width, maxH: Math.min(440, above) });
  };
  useLayoutEffect(() => {
    if (!open) return;
    const ph = !!window.matchMedia?.(PHONE).matches;
    setPhone(ph);
    if (!ph) place();
    const onMove = () => { if (!window.matchMedia?.(PHONE).matches) place(); };
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    return () => { window.removeEventListener('resize', onMove); window.removeEventListener('scroll', onMove, true); };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', h);
    document.addEventListener('touchstart', h);
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('touchstart', h); };
  }, [open]);
  const close = () => { setOpen(false); btnRef.current?.focus(); };
  const pick = (v: number | 'other') => { onChange(v); close(); };

  const list = (maxHeight: number | string) => (
    <DispatcherList people={people} value={value} onPick={pick} forCalls={forCalls} allowNumber={allowNumber} onEscape={close} maxHeight={maxHeight} autoFocus={!phone} />
  );
  return (
    <>
      <button ref={btnRef} type="button" aria-haspopup="listbox" aria-expanded={open} aria-label={ariaLabel} data-testid={testId} data-disp-picker
              onClick={() => setOpen((x) => !x)}
              onKeyDown={(e) => { if (!open && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setOpen(true); } }}
              className={`w-full flex items-center gap-2.5 rounded-[12px] border bg-paper px-2.5 py-1.5 text-left haptic transition ${open ? 'border-forest ring-2 ring-forest/20' : 'border-line hover:border-forest/50'}`}>
        {chosen ? <Avatar name={chosen.name} size={28} /> : value === 'other'
          ? <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-dashed border-forest/50 text-[13px]" aria-hidden>📞</span>
          : <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-dashed border-line text-muted text-[14px]" aria-hidden>?</span>}
        <span className="min-w-0 flex-1">
          {chosen ? <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5"><span className="text-[14.5px] font-bold text-ink truncate"><bdi dir="auto">{chosen.name}</bdi></span><Tags p={chosen} /></span>
            : value === 'other' ? <span className="text-[14.5px] font-bold text-ink">A phone number</span>
            : <span className="text-[14.5px] text-muted">{placeholder}</span>}
        </span>
        <span className={`text-muted text-[12px] transition ${open ? 'rotate-180' : ''}`} aria-hidden>▼</span>
      </button>
      {footer}
      {open && createPortal(phone ? (
        <div className="fixed inset-0 z-[2100] flex items-end bg-black/35" data-pick-sheet>
          <div ref={panelRef} role="dialog" aria-label="Choose a dispatcher" className="w-full rounded-t-[20px] border-t border-line bg-paper shadow-2xl flex flex-col max-h-[82vh] pb-[env(safe-area-inset-bottom)]">
            <span className="mx-auto mt-2 h-1 w-10 rounded-full bg-line" aria-hidden />
            <div className="flex items-center justify-between px-4 pt-1.5 pb-1">
              <span className="font-display font-semibold text-[16px] text-ink">Choose a dispatcher</span>
              <button type="button" onClick={close} className="text-[22px] leading-none text-muted px-1" aria-label="Close">×</button>
            </div>
            {list('calc(82vh - 110px)')}
          </div>
        </div>
      ) : pos && (
        <div ref={panelRef} role="dialog" aria-label="Choose a dispatcher" data-pick-pop
             className="fixed z-[2100] rounded-[14px] border border-line bg-paper shadow-xl flex flex-col overflow-hidden"
             style={{ left: pos.left, top: pos.top, bottom: pos.bottom, width: pos.width, maxHeight: pos.maxH }}>
          {list(pos.maxH - 56)}
        </div>
      ), document.body)}
    </>
  );
}
