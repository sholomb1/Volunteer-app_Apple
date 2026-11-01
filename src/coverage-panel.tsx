/**
 * Oct 30 client (Coverage map): "Why does it say zero by everyone? People who checked off
 * coverage areas on their application should show up here. Make the map and this panel
 * more friendly and more useful."
 *
 * The right-hand panel of the Coverage map: every area with "3 drivers · 5 stores" and a
 * color (0 drivers red, 1–2 orange, 3+ green). Tap an area → the drivers who cover it
 * (name, #, phone, last active, Call / Text) and its stores. A driver's areas = what the
 * office picked on the driver card, else what they checked on the application (API:
 * coverage-areas.ts). One API call (GET /api/neighborhoods/coverage) feeds this panel AND
 * the map (same query key), so opening the tab costs one request.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, MessageSquare, Phone } from 'lucide-react';
import { adminCRUD, type CoverageResponse, type CoverageStore, type NeighborhoodCoverage } from './api';
import { cx, SearchBar } from './design';
import { displayPhone, telHref, whenText } from './display';

/** One query for the panel + the map. */
export const COVERAGE_KEY = ['coverage'] as const;
export function useCoverage() {
  return useQuery<CoverageResponse>({ queryKey: COVERAGE_KEY, queryFn: adminCRUD.coverage, refetchInterval: 120_000, staleTime: 60_000 });
}

/** Map + panel colors (same on both). */
export const COVER_HEX: Record<'red' | 'orange' | 'green' | 'none', string> = {
  red: '#C8553D', orange: '#E0972A', green: '#2F7D4A', none: '#8A8F98',
};
export const COVER_WORD: Record<'red' | 'orange' | 'green', string> = {
  red: 'No drivers', orange: '1–2 drivers', green: '3+ drivers',
};

/** Panel ↔ map: tapping an area on one side opens / shows it on the other. */
export const COVERAGE_FOCUS_EVENT = 'zlz-coverage-focus'; // panel → map: { id }
export const COVERAGE_OPEN_EVENT = 'zlz-coverage-open';   // map → panel: { id }
export function emitCoverage(name: string, id: number) {
  try { window.dispatchEvent(new CustomEvent(name, { detail: { id } })); } catch { /* old browser */ }
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "today" / "yesterday" / "5 days ago" / "Sep 3" / "not yet". */
export function lastActiveText(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return 'not yet';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'not yet';
  const ny = (x: Date) => x.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const days = Math.round((Date.parse(ny(now)) - Date.parse(ny(d))) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  return d.toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', year: days > 300 ? 'numeric' : undefined });
}

/** "2026-11-04 12:00" → "Wed Nov 4 · 12:00 PM" / "tomorrow 9:00 AM". */
export function nextPickupText(s: string | null | undefined): string {
  if (!s) return '';
  const [ymd, hm] = String(s).split(' ');
  return whenText(ymd, hm);
}

function smsHref(p: string | null | undefined): string {
  return telHref(p).replace(/^tel:/, 'sms:');
}

function CountDot({ row }: { row: NeighborhoodCoverage }) {
  return (
    <span className="grid h-9 w-9 place-items-center rounded-full text-[13px] font-extrabold shrink-0 text-white"
          style={{ background: COVER_HEX[row.color] }}
          title={COVER_WORD[row.color]}>
      {row.volunteerCount}
    </span>
  );
}

function StoreLine({ s }: { s: CoverageStore }) {
  const next = nextPickupText(s.nextPickup);
  return (
    <div className="px-3 py-2 text-[12.5px]">
      <div className="font-bold"><bdi dir="auto">{s.name}</bdi></div>
      {s.address && <div className="text-[11.5px] text-muted">{s.address}</div>}
      <div className="text-[11.5px] text-muted">
        {next ? <>Next pickup: <span className="text-ink font-semibold">{next}</span></> : 'No pickup coming up'}
        {s.usualDrivers.length > 0 && <> · Usually: <span className="text-ink">{s.usualDrivers.join(', ')}</span></>}
      </div>
    </div>
  );
}

function AreaDetail({ row }: { row: NeighborhoodCoverage }) {
  return (
    <div className="bg-cream/60 border-t border-line px-3 py-3 space-y-3" data-area-detail={row.name}>
      <div>
        <div className="text-[11px] font-extrabold uppercase tracking-[.05em] text-muted mb-1.5">
          Drivers who cover {row.name} · {row.drivers.length}
        </div>
        {row.drivers.length === 0 ? (
          <div className="text-[12.5px] text-clay font-semibold">No drivers yet. Ask drivers who live nearby, or add this area on a driver's card (Info tab → Areas).</div>
        ) : (
          <div className="rounded-[10px] border border-line bg-paper divide-y divide-line">
            {row.drivers.map((d) => (
              <div key={d.id} className="flex items-center gap-2 px-3 py-2">
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-bold truncate">
                    <bdi dir="auto">{d.name}</bdi>{d.unit != null && <span className="text-muted font-semibold"> · #{d.unit}</span>}
                  </div>
                  <div className="text-[11.5px] text-muted">
                    {d.phone ? displayPhone(d.phone) : 'no phone'} · active {lastActiveText(d.lastActive)}
                    {d.from === 'office' && <span title="The office picked this area on the driver's card"> · set by office</span>}
                  </div>
                </div>
                {d.phone && (
                  <>
                    <a href={telHref(d.phone)} className="haptic inline-flex items-center gap-1 text-[12px] font-bold px-2.5 py-1.5 rounded-full bg-forest text-paper">
                      <Phone size={12} /> Call
                    </a>
                    <a href={smsHref(d.phone)} className="haptic inline-flex items-center gap-1 text-[12px] font-bold px-2.5 py-1.5 rounded-full border border-forest text-forest bg-paper">
                      <MessageSquare size={12} /> Text
                    </a>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      <div>
        <div className="text-[11px] font-extrabold uppercase tracking-[.05em] text-muted mb-1.5">
          Stores in {row.name} · {row.stores.length}
        </div>
        {row.stores.length === 0 ? (
          <div className="text-[12.5px] text-muted">No stores here yet.</div>
        ) : (
          <div className="rounded-[10px] border border-line bg-paper divide-y divide-line">
            {row.stores.map((s) => <StoreLine key={s.id} s={s} />)}
          </div>
        )}
      </div>
    </div>
  );
}

export function CoveragePanel() {
  const q = useCoverage();
  const rows = useMemo(() => q.data?.data ?? [], [q.data]);
  const [mq, setMq] = useState('');
  const [openId, setOpenId] = useState<number | null>(null);
  const [showNoArea, setShowNoArea] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  // Map → panel: a tap on an area circle opens it here.
  useEffect(() => {
    const on = (e: Event) => {
      const id = Number((e as CustomEvent).detail?.id);
      if (!Number.isFinite(id)) return;
      setOpenId(id); setMq('');
      setTimeout(() => listRef.current?.querySelector(`[data-area-id="${id}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 50);
    };
    window.addEventListener(COVERAGE_OPEN_EVENT, on);
    return () => window.removeEventListener(COVERAGE_OPEN_EVENT, on);
  }, []);

  if (q.isLoading) return <div className="text-[13px] text-muted">Loading coverage…</div>;
  if (q.isError) return (
    <div className="text-[13px] text-clay">Couldn't load coverage. <button type="button" className="underline font-bold" onClick={() => q.refetch()}>Try again</button></div>
  );

  const needs = rows.filter((r) => r.color !== 'green');
  const totals = q.data?.totals;
  const unmatched = q.data?.unmatched ?? [];
  const noArea = q.data?.storesWithoutArea ?? [];
  const query = mq.trim().toLowerCase();
  const shown = rows.filter((r) => !query
    || r.name.toLowerCase().includes(query)
    || r.drivers.some((d) => d.name.toLowerCase().includes(query) || String(d.unit ?? '') === query.replace('#', ''))
    || r.stores.some((s) => s.name.toLowerCase().includes(query)));

  const toggle = (id: number) => {
    setOpenId((cur) => (cur === id ? null : id));
    emitCoverage(COVERAGE_FOCUS_EVENT, id);
  };

  return (
    <div className="space-y-4" data-coverage-panel>
      <div>
        <div className="text-[11px] font-extrabold uppercase tracking-[.05em] text-muted">Drivers by area</div>
        {totals && (
          <div className="text-[12.5px] text-ink mt-1">
            {totals.driversWithAreas} of {totals.drivers} active drivers said which areas they cover.
            <span className="text-muted"> Tap an area to see its drivers and stores.</span>
          </div>
        )}
        <div className="flex flex-wrap gap-3 mt-2 text-[11.5px] text-muted">
          {(['red', 'orange', 'green'] as const).map((c) => (
            <span key={c} className="inline-flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-full" style={{ background: COVER_HEX[c] }} />{COVER_WORD[c]}
            </span>
          ))}
        </div>
      </div>

      {needs.length > 0 && (
        <div className="rounded-[14px] border border-clay/40 bg-clay-soft/60 px-4 py-3">
          <div className="text-[12px] font-extrabold text-clay uppercase tracking-[.05em] mb-1.5">Needs more drivers</div>
          <div className="flex flex-wrap gap-1.5">
            {needs.map((r) => (
              <button key={r.id} type="button" onClick={() => { setMq(''); setOpenId(r.id); emitCoverage(COVERAGE_FOCUS_EVENT, r.id); }}
                      className="haptic inline-flex items-center gap-1.5 text-[12px] font-bold px-2.5 py-1 rounded-full bg-paper border border-line">
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: COVER_HEX[r.color] }} />
                {r.name} · {plural(r.volunteerCount, 'driver')}
              </button>
            ))}
          </div>
        </div>
      )}

      <SearchBar value={mq} onChange={setMq} placeholder="Search areas, drivers, stores…" />

      <div ref={listRef} className="rounded-[14px] border border-line bg-paper overflow-hidden">
        {rows.length === 0 && <div className="text-[13px] text-muted px-4 py-6 text-center">No areas yet. Add them under Admin → Neighborhoods.</div>}
        {rows.length > 0 && shown.length === 0 && <div className="text-[13px] text-muted px-4 py-6 text-center">Nothing matches “{mq}”.</div>}
        {shown.map((r) => {
          const open = openId === r.id;
          return (
            <div key={r.id} data-area-id={r.id} className="border-b border-line last:border-b-0">
              <button type="button" onClick={() => toggle(r.id)} aria-expanded={open}
                      className={cx('haptic w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-cream/60', open && 'bg-cream/60')}>
                <CountDot row={r} />
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-[14px] truncate">{r.name}</div>
                  <div className="text-[12px] text-muted">{plural(r.volunteerCount, 'driver')} · {plural(r.supplierCount, 'store')}</div>
                </div>
                <span className="text-[11px] font-bold py-1 px-2.5 rounded-full text-white whitespace-nowrap" style={{ background: COVER_HEX[r.color] }}>
                  {COVER_WORD[r.color]}
                </span>
                <ChevronDown size={16} className={cx('text-muted transition-transform shrink-0', open && 'rotate-180')} />
              </button>
              {open && <AreaDetail row={r} />}
            </div>
          );
        })}
      </div>

      {unmatched.length > 0 && (
        <div className="rounded-[14px] border border-line bg-paper px-4 py-3">
          <div className="text-[11px] font-extrabold uppercase tracking-[.05em] text-muted mb-1">Answers that don't match an area</div>
          <div className="text-[11.5px] text-muted mb-2">What drivers typed on the application. Add the area on their card, or add a new area under Admin → Neighborhoods.</div>
          <div className="space-y-1">
            {unmatched.map((u) => (
              <div key={u.id} className="text-[12.5px]">
                <span className="font-bold"><bdi dir="auto">{u.name}</bdi></span>{u.unit != null && <span className="text-muted"> · #{u.unit}</span>}: {u.answers.map((a) => `“${a}”`).join(', ')}
              </div>
            ))}
          </div>
        </div>
      )}

      {noArea.length > 0 && (
        <div className="rounded-[14px] border border-line bg-paper px-4 py-3">
          <button type="button" onClick={() => setShowNoArea((v) => !v)} className="haptic w-full flex items-center justify-between text-left">
            <span className="text-[12.5px]"><span className="font-bold">{plural(noArea.length, 'store')}</span> <span className="text-muted">not in any area yet (set the neighborhood on the store).</span></span>
            <ChevronDown size={16} className={cx('text-muted transition-transform shrink-0', showNoArea && 'rotate-180')} />
          </button>
          {showNoArea && (
            <div className="mt-2 rounded-[10px] border border-line divide-y divide-line max-h-[320px] overflow-y-auto">
              {noArea.map((s) => <StoreLine key={s.id} s={s} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
