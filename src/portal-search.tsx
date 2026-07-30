/**
 * Portal global search — lives in the CoordinatorPortal header. Searches
 * across volunteers, suppliers, neighborhoods, steady pickups, and recent
 * pickup_instances. Debounced 250ms. Click a result → jump to that tab.
 *
 * The results dropdown is rendered via a React Portal to document.body.
 * Rendering it inline (nested under the header flex/gap) hit a Chrome
 * compositor bug where the row text became invisible even though the DOM,
 * computed styles, and color were all correct. Portalling out of the
 * header ancestry sidesteps it and matches how every other production
 * dropdown/tooltip lib does anchor positioning.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, X, Users2, Store, MapPin, Repeat, Calendar } from 'lucide-react';
import { search } from './api';
import { cx } from './design';
import { fmtTime } from './time-format';

type Tab = 'live' | 'pickups' | 'volunteers' | 'suppliers' | 'steady' | 'neighborhoods' | 'coverage';

export function PortalSearchBar({ onPick }: { onPick: (tab: Tab, id?: number) => void }) {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement | null>(null);
  const [anchor, setAnchor] = useState<{ top: number; right: number } | null>(null);

  // 250ms debounce so we don't hammer the API on every keystroke
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  // Close on outside click — since the dropdown is portalled, we also allow
  // clicks inside our own portalled panel by tagging it with a data attribute.
  // The full-screen backdrop below is the primary mechanism; this doc-level
  // handler is a belt-and-suspenders for keyboard-driven closes / edge cases.
  useEffect(() => {
    function onDoc(e: Event) {
      const t = e.target as HTMLElement;
      if (wrap.current?.contains(t)) return;
      if (t.closest?.('[data-portal-search-panel]')) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    // Listen for pointerdown (covers touch + mouse + pen uniformly on Chrome,
    // Safari 13+, and every modern tablet). Fall back to mousedown for older
    // browsers. Touchstart as a belt-and-suspenders backstop.
    document.addEventListener('pointerdown', onDoc, true);
    document.addEventListener('mousedown', onDoc, true);
    document.addEventListener('touchstart', onDoc, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDoc, true);
      document.removeEventListener('mousedown', onDoc, true);
      document.removeEventListener('touchstart', onDoc, true);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  // Recompute the dropdown's anchor rect any time the input's position may
  // have moved (window resize, scroll, opening the dropdown).
  useLayoutEffect(() => {
    if (!open) return;
    function reposition() {
      const r = wrap.current?.getBoundingClientRect();
      if (r) setAnchor({ top: r.bottom + 8, right: window.innerWidth - r.right });
    }
    reposition();
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open]);

  const enabled = debounced.length >= 2;
  const res = useQuery({
    queryKey: ['portal-search', debounced],
    queryFn:  () => search.all(debounced),
    enabled,
    staleTime: 30_000,
  });
  const data = res.data?.data;

  function go(tab: Tab, id?: number) {
    setOpen(false);
    setQ('');
    onPick(tab, id);
  }

  const counts = data ? {
    v: data.volunteers.length,
    s: data.suppliers.length,
    n: data.neighborhoods.length,
    st: data.steadyPickups.length,
    p: data.pickups.length,
  } : { v: 0, s: 0, n: 0, st: 0, p: 0 };
  const total = counts.v + counts.s + counts.n + counts.st + counts.p;

  return (
    <div ref={wrap} className="relative">
      <div className="flex items-center gap-2 bg-paper border border-line rounded-[12px] px-3 py-2 w-[280px] focus-within:border-forest focus-within:ring-2 focus-within:ring-forest/15">
        <Search size={15} className="text-muted shrink-0" />
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Search drivers, stores, locations…"
          className="flex-1 bg-transparent outline-none text-[13.5px] placeholder:text-muted"
        />
        {q && (
          <button onClick={() => { setQ(''); setOpen(false); }}
                  className="haptic grid h-6 w-6 place-items-center rounded-full text-muted hover:bg-cream">
            <X size={13} />
          </button>
        )}
      </div>

      {open && enabled && anchor && createPortal(
        <>
          {/* Full-viewport backdrop under the panel. Any click that isn't on
              the panel or the search wrapper hits this transparent layer and
              closes the dropdown — guaranteeing the map / other UI can never
              be permanently blocked by an invisible dropdown. */}
          <div
            onPointerDown={(e) => {
              const t = e.target as HTMLElement;
              // Let clicks that land on the search wrapper (input, X, etc.)
              // bubble normally so typing / clearing still works.
              if (wrap.current?.contains(t)) return;
              setOpen(false);
            }}
            onTouchStart={(e) => {
              const t = e.target as HTMLElement;
              if (wrap.current?.contains(t)) return;
              setOpen(false);
            }}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 9998,
              background: 'transparent',
              // Ensure the backdrop actually captures pointer/touch events
              // on tablets (Chrome for Android + iPad Safari sometimes skip
              // events on transparent divs unless touch-action is explicit).
              touchAction: 'none',
            }}
          />
          <div
            data-portal-search-panel
            style={{
              position: 'fixed',
              top: anchor.top,
              right: anchor.right,
              width: 380,
              maxWidth: 'calc(100vw - 32px)',
              maxHeight: '70vh',
              zIndex: 9999,
              // Force GPU compositor + isolate stacking context so Chrome
              // paints the rows every time. Previous invisible-text
              // regressions traced to this class of compositor bug.
              transform: 'translateZ(0)',
              willChange: 'transform',
              backfaceVisibility: 'hidden',
              isolation: 'isolate',
              // Explicit background so an empty panel still looks like a
              // panel (not a phantom rectangle blocking the map).
              background: '#FFFFFF',
              border: '1px solid #EAE3D4',
              borderRadius: 14,
              boxShadow: '0 20px 40px rgba(28,42,33,0.15), 0 4px 12px rgba(28,42,33,0.08)',
              overflowY: 'auto',
            }}
          >
            {res.isLoading ? (
              <div className="text-[13px] text-muted py-6 text-center">Searching…</div>
            ) : total === 0 ? (
              <div className="text-[13px] text-muted py-6 text-center">No matches for "{debounced}"</div>
            ) : (
              <div className="py-1">
                {data!.volunteers.length > 0 && (
                  <Section icon={<Users2 size={13} />} title={`Drivers · ${data!.volunteers.length}`}>
                    {data!.volunteers.map((v) => {
                      const name = [v.firstName, v.lastName].filter(Boolean).join(' ').trim();
                      const primary = name || v.phone || v.area || '';
                      if (!primary) return null;
                      return (
                        <Row key={`v${v.id}`} onClick={() => go('volunteers', v.id)}
                             primary={primary}
                             secondary={[v.phone, v.area].filter(Boolean).join(' · ')} />
                      );
                    })}
                  </Section>
                )}
                {data!.suppliers.length > 0 && (
                  <Section icon={<Store size={13} />} title={`Stores · ${data!.suppliers.length}`}>
                    {data!.suppliers.map((s) => {
                      const primary = s.name || s.city || '';
                      if (!primary) return null;
                      return (
                        <Row key={`s${s.id}`} onClick={() => go('suppliers', s.id)}
                             primary={primary}
                             secondary={[s.type, s.city].filter(Boolean).join(' · ')} />
                      );
                    })}
                  </Section>
                )}
                {data!.neighborhoods.length > 0 && (
                  <Section icon={<MapPin size={13} />} title={`Neighborhoods · ${data!.neighborhoods.length}`}>
                    {data!.neighborhoods.map((n) => {
                      if (!n.name) return null;
                      return (
                        <Row key={`n${n.id}`} onClick={() => go('neighborhoods', n.id)}
                             primary={n.name} secondary={n.slug || ''} />
                      );
                    })}
                  </Section>
                )}
                {data!.steadyPickups.length > 0 && (
                  <Section icon={<Repeat size={13} />} title={`Steady templates · ${data!.steadyPickups.length}`}>
                    {data!.steadyPickups.map((sp) => (
                      <Row key={`sp${sp.id}`} onClick={() => go('steady', sp.id)}
                           primary={sp.name ?? `Steady #${sp.id}`} secondary="" />
                    ))}
                  </Section>
                )}
                {data!.pickups.length > 0 && (
                  <Section icon={<Calendar size={13} />} title={`Pickups · ${data!.pickups.length}`}>
                    {data!.pickups.map((p) => (
                      <Row key={`p${p.id}`} onClick={() => go('pickups', p.id)}
                           primary={`${p.supplier ?? 'Pickup'} · ${fmtTime(p.scheduledTime?.slice(0, 5))}`}
                           secondary={`${p.scheduledDate?.slice(0, 10)} · ${p.status}${p.food ? ` · ${p.food.slice(0, 40)}` : ''}`} />
                    ))}
                  </Section>
                )}
              </div>
            )}
          </div>
        </>,
        document.body
      )}
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="px-4 py-2 text-[11.5px] font-extrabold uppercase tracking-[.06em] text-muted bg-cream/50 border-b border-line flex items-center gap-1.5">
        {icon} {title}
      </div>
      <div>{children}</div>
    </div>
  );
}

function Row({ primary, secondary, onClick }: { primary: string; secondary: string; onClick: () => void }) {
  // Explicit overflow styles instead of `truncate` — the Tailwind utility
  // combo (whiteSpace: nowrap + textOverflow: ellipsis + overflow: hidden)
  // has repeatedly triggered a Chrome compositor bug that leaves the text
  // invisible while its box still takes space, so the panel became a
  // pointer-blocking empty rectangle. Force paint via opacity: 1 + inline
  // color and skip ellipsis (wrap instead — search rows are short).
  return (
    <button onClick={onClick}
            className={cx('w-full text-left px-4 py-2.5 border-b border-line/60 last:border-b-0 hover:bg-cream/40 haptic')}>
      <div style={{ fontWeight: 700, fontSize: '13.5px', color: '#1C2A21', opacity: 1, wordBreak: 'break-word' }}>{primary}</div>
      {secondary && (
        <div style={{ fontSize: '11.5px', color: '#6E7C70', opacity: 1, wordBreak: 'break-word', marginTop: 2 }}>{secondary}</div>
      )}
    </button>
  );
}
