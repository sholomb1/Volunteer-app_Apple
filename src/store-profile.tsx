/**
 * Oct 11 client: store (supplier) profile — "the same type of information like
 * we have with the drivers", without crowding it. Mirrors the driver profile
 * (profiles.tsx DriverOverview + DriverGlance).
 * Backend: apps/api/src/routes/store-profile.ts — GET /api/suppliers/:id/glance
 * (verdict rules are documented there). History tab: GET /api/suppliers/:id/profile.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, decodeEnc, loadFailText } from './api';
import { Tip } from './design';
import { fmtDay, fmtTimeEastern } from './time-format';
import { ResponseTimeLine } from './response-times'; // Oct 11 client: how fast a driver takes their pickups

const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** "Thu, Oct 9" (+ " · 2:00 PM" when a time is given). */
const fmtDate = (d: string | null | undefined, t?: string | null) => {
  if (!d) return '—';
  const dt = new Date(`${d}T${(t ?? '12:00').slice(0, 5)}:00`);
  const day = dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: dt.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined });
  return t ? `${day} · ${dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}` : day;
};
const minText = (m: number) => (m < 1 ? 'under a minute' : m < 60 ? `${m} min` : m < 48 * 60 ? `${Math.round(m / 6) / 10} hr` : `${Math.round(m / 1440)} days`);

const H = ({ children }: { children: any }) => <div className="text-[11px] font-extrabold uppercase tracking-[.05em] text-muted mb-1.5">{children}</div>;

function Stat({ n, label, sub, tone, tip }: { n: number | string; label: string; sub?: string; tone?: 'good' | 'bad' | 'warn'; tip?: string }) {
  const c = tone === 'good' ? 'text-forest' : tone === 'bad' ? 'text-clay' : tone === 'warn' ? 'text-[#9a7415]' : 'text-ink';
  return (
    <div className="rounded-[12px] border border-line bg-paper px-3 py-2 min-w-[92px]">
      <div className={`font-display text-[20px] leading-none ${c}`}>{n}</div>
      <div className="mt-1 text-[11px] font-bold text-muted">{label}{tip && <Tip text={tip} />}</div>
      {sub && <div className="text-[10.5px] text-muted">{sub}</div>}
    </div>
  );
}

function DayBars({ days }: { days: number[] }) {
  const max = Math.max(1, ...days);
  return (
    <div className="flex items-end gap-1.5 h-[64px]">
      {days.map((n, i) => (
        <div key={i} className="flex flex-col items-center gap-1 flex-1">
          <div className="w-full rounded-t-[4px] bg-forest/70" style={{ height: `${Math.round((n / max) * 44) + (n ? 4 : 1)}px` }} title={`${n} on ${DAY[i]}`} />
          <div className="text-[10px] font-bold text-muted">{DAY[i]}</div>
        </div>
      ))}
    </div>
  );
}

const plural = (u: string) => {
  const w = String(u || 'item').toLowerCase();
  return w.endsWith('s') ? w : w.endsWith('x') ? `${w}es` : `${w}s`;
};

/** Oct 8 client: "what does this store typically donate" — from kiosk drop-offs. */
function DonationSummary({ d }: { d: any }) {
  if (!d || d.visits === 0) return <div className="text-[12.5px] text-muted">No kiosk drop-offs from this store yet.</div>;
  const period = d.windowDays ? 'last 3 months' : 'all time';
  return (
    <div className="rounded-[12px] border border-line bg-paper px-3 py-2.5 space-y-1.5 text-[13px] text-ink">
      <div>
        <b>About {d.avgItems} items</b> per drop-off
        {d.units.length > 0 && <span className="text-muted"> · {d.units.map((u: any) => `${u.pct}% ${plural(u.unit)}`).join(', ')}</span>}
      </div>
      <div>
        {d.timesPerWeek >= 1 ? <>About <b>{d.timesPerWeek} times a week</b></>
          : d.timesPerWeek > 0 ? <>About <b>{Math.max(1, Math.round(d.timesPerWeek * 4.3))} times a month</b></>
          : <>No pickups or drop-offs in the last 3 months</>}
        <span className="text-muted"> · last drop-off {fmtDate(d.lastDropoff)}</span>
      </div>
      {d.categories.length > 0 && (
        <div>
          Mostly <b>{d.categories.map((c: any) => `${c.category} (${c.pct}%)`).join(', ')}</b>
          <Tip text={`Food types come from kiosk drop-offs up to ${fmtDate(d.categoriesUpTo)}. The kiosk stopped asking for the food type on Oct 7.`} />
        </div>
      )}
      <div className="text-[11px] text-muted">Based on {d.visits} kiosk drop-off{d.visits === 1 ? '' : 's'} ({period}).</div>
    </div>
  );
}

/** Texts with the store's contact phone (newest at the bottom). */
function StoreTexts({ texts, total }: { texts: { id: number; direction: string; body: string; at: string }[]; total: number }) {
  const [all, setAll] = useState(false);
  if (texts.length === 0) return <div className="text-[12.5px] text-muted">No texts with this store in the last 3 months.</div>;
  const shown = all ? texts : texts.slice(-5);
  const when = (x: string) => `${fmtDay(x)} · ${fmtTimeEastern(x)}`;
  return (
    <div>
      {texts.length > 5 && (
        <button onClick={() => setAll(!all)} className="haptic mb-1 text-[12.5px] font-bold text-forest hover:underline">
          {all ? 'Show only the latest' : `View all ${texts.length}${total > texts.length ? ` (newest of ${total})` : ''}`}
        </button>
      )}
      <div className={`space-y-1.5 rounded-[12px] border border-line bg-cream/40 p-2.5 ${all ? 'max-h-[360px] overflow-y-auto' : ''}`}>
        {shown.map((m) => {
          const out = m.direction === 'out';
          return (
            <div key={m.id} className={`flex ${out ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-[12px] px-3 py-1.5 ${out ? 'bg-forest text-paper' : 'bg-paper border border-line text-ink'}`}>
                <div className="whitespace-pre-wrap text-[12.5px]">{m.body}</div>
                <div className={`mt-0.5 text-[10.5px] ${out ? 'text-paper/70' : 'text-muted'}`}>{out ? 'Us' : 'Store'} · {when(m.at)}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Oct 11 client: per-store switches for our automatic texts to the store. Both off by default.
// Oct 11 client: + the store's own choice from its app (how it wants each notice).
type StoreTexts = { pickedUp: boolean; onTheWay: boolean; storeChoice?: { pickedUp: string; onTheWay: string } };
function StoreTextSwitches({ supplierId }: { supplierId: number }) {
  const qc = useQueryClient();
  const key = ['sup-store-texts', supplierId];
  const q = useQuery({ queryKey: key, queryFn: () => api<{ data: StoreTexts }>(`/api/suppliers/${supplierId}/store-texts`) });
  const mut = useMutation({
    mutationFn: (body: Partial<StoreTexts>) => api<{ data: StoreTexts }>(`/api/suppliers/${supplierId}/store-texts`, { method: 'PUT', body: JSON.stringify(body) }),
    onSuccess: (r) => qc.setQueryData(key, r),
  });
  const v = q.data?.data;
  if (!v) return null;
  const row = (label: string, field: 'pickedUp' | 'onTheWay') => (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="text-[12.5px] font-semibold text-ink">{label}</div>
        <div className="text-[11px] text-muted">
          {!v[field] && "Off — not in use yet. "}{v.storeChoice && <>Store's choice: {v.storeChoice[field]}</>}
        </div>
      </div>
      <button type="button" role="switch" aria-checked={v[field]} aria-label={label} disabled={mut.isPending}
              onClick={() => mut.mutate({ [field]: !v[field] })}
              className={`haptic shrink-0 px-3 py-1 rounded-full text-[12px] font-bold border ${v[field] ? 'bg-forest text-paper border-forest' : 'bg-paper text-muted border-line'}`}>
        {v[field] ? 'On' : 'Off'}
      </button>
    </div>
  );
  return (
    <div className="mt-2 space-y-1.5 rounded-[12px] border border-line bg-paper px-3 py-2">
      {row('Tell them when a driver is on the way', 'onTheWay')}
      {row('Tell them when their food is picked up', 'pickedUp')}
      {mut.isError && <div className="text-[11.5px] text-clay">{loadFailText("Couldn't save", mut.error)}</div>}
    </div>
  );
}

/** Store profile "Overview" tab: At a glance + stats + drivers + days + steady schedule + texts + events. */
export function StoreProfileOverview({ supplierId }: { supplierId: number }) {
  const q = useQuery({
    queryKey: ['sup-glance', supplierId],
    // Oct 11 client: ?enc=1 → base64 reply, so the owner's network filter can't read (and swap out) it.
    queryFn: async () => {
      return decodeEnc<{ data: any }>(await api(`/api/suppliers/${supplierId}/glance?enc=1`));
    },
  });
  const [open, setOpen] = useState(false);
  const [shownN, setShownN] = useState(50);
  if (q.isLoading) return <div className="text-[13px] text-muted">Loading the store profile…</div>;
  // say why it failed (helps when it happens on someone's device)
  if (q.isError || !q.data?.data?.summary) return (
    <div className="text-[13px] text-clay">{loadFailText("Couldn't load the store profile", q.error)} <button onClick={() => q.refetch()} className="underline font-bold">Try again</button></div>
  );
  const d = q.data!.data;
  const s = d.summary;
  const a = d.totals.all, m = d.totals.last30;
  const events: { at: string; kind: string; text: string }[] = d.events ?? [];
  const rows = events.slice(0, shownN);
  const rel = d.reliability;
  return (
    <div className="space-y-4">
      <div className="rounded-[12px] border border-line bg-paper px-3 py-2.5 space-y-1">
        <H>At a glance</H>
        <div className="text-[13.5px] font-semibold text-ink">{s.verdict}</div>
        {s.signals.length > 0 && <div className="text-[12.5px] text-ink">{s.signals.join(' · ')}</div>}
        <div className="text-[12px] text-muted">{s.last30}</div>
        {/* Oct 11 client: how long until a driver usually takes their pickups + View all */}
        <ResponseTimeLine kind="store" id={supplierId} />
      </div>

      <div className="flex flex-wrap gap-2">
        <Stat n={a.done} label="Done" sub={`30 days: ${m.done}`} tone="good" tip="Signed in at the kiosk, or marked done by the office." />
        <Stat n={a.notCheckedIn} label="Not checked in" sub={`30 days: ${m.notCheckedIn}`} tone={a.notCheckedIn ? 'warn' : undefined} tip="A driver took these but never signed in at the office kiosk." />
        <Stat n={a.noDriver} label="No driver came" sub={`30 days: ${m.noDriver}`} tone={a.noDriver ? 'bad' : undefined} tip="The time passed and no driver took it." />
        <Stat n={a.cancelled} label="Cancelled" sub={`30 days: ${m.cancelled}`} />
        <Stat n={rel == null ? '—' : `${rel}%`} label="Picked up" tone={rel == null ? undefined : rel >= 85 ? 'good' : rel >= 65 ? 'warn' : 'bad'}
              sub={m.reliability == null ? undefined : `30 days: ${m.reliability}%`}
              tip={`Of their pickups that are over (not cancelled), how many a driver picked up: ${a.done + a.notCheckedIn} of ${a.settled}.`} />
        <Stat n={a.upcoming} label="Coming up" tip="Scheduled pickups from today forward. Steady pickups are added 3 weeks ahead." />
      </div>
      <div className="text-[12px] text-muted">
        Last pickup: <b className="text-ink">{fmtDate(d.lastPickup)}</b>
        {d.readyBy && <> · usually ready by <b className="text-ink">{d.readyBy}</b></>}
        {d.minutesToDriver != null && <> · a driver takes their posts in about <b className="text-ink">{minText(d.minutesToDriver)}</b>
          <Tip text={`Middle value over ${d.minutesToDriverBasis} one-time / posted pickup${d.minutesToDriverBasis === 1 ? '' : 's'} in the last 30 days: from posting to the first driver taking it.`} /></>}
        {d.storeApp?.hasLogin && <> · store app {d.storeApp.lastOpenedAt ? <>opened <b className="text-ink">{fmtDay(d.storeApp.lastOpenedAt)}</b></> : 'never opened'}</>}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <H>Usual drivers</H>
          {d.usualDrivers.length === 0 ? <div className="text-[12.5px] text-muted">Nobody yet.</div> : (
            <div className="flex flex-wrap gap-1.5">
              {d.usualDrivers.map((v: any) => (
                <span key={v.id} className="rounded-full border border-line bg-paper px-2.5 py-1 text-[12px]" title={`Last ${fmtDate(v.last)}${v.count30 ? ` · ${v.count30} in 30 days` : ''}`}>
                  <b>{v.name}</b> <span className="text-muted">× {v.count}</span>
                </span>
              ))}
            </div>
          )}
        </div>
        <div>
          <H>Days they give</H>
          <DayBars days={d.days} />
        </div>
      </div>

      {d.steady.length > 0 && (
        <div>
          <H>Steady schedule</H>
          <ul className="divide-y divide-line rounded-[12px] border border-line bg-paper">
            {d.steady.map((x: any) => (
              <li key={x.id} className="px-3 py-2 text-[12.5px]">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-semibold text-ink">{x.days}{x.time ? ` at ${x.time}` : ''}{x.paused && <span className="ml-1.5 rounded-full bg-cream px-2 py-0.5 text-[10.5px] font-bold text-muted">Paused</span>}</span>
                  <span className="text-muted">{x.name}</span>
                </div>
                <div className="text-ink">
                  {x.drivers.length ? x.drivers.map((r: any) => `${r.name}${r.days === 'every day' ? '' : ` (${r.days})`}`).join(', ') : <span className="text-muted">No set driver</span>}
                  {x.noDriverDays && x.drivers.length > 0 && <span className="text-clay font-semibold"> · no driver {x.noDriverDays}</span>}
                </div>
                {!x.paused && x.openNext7 > 0 && <div className="text-[11.5px] font-bold text-clay">{x.openNext7} in the next 7 days still need a driver</div>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <H>What they usually give</H>
        <DonationSummary d={d.donations} />
      </div>

      <div>
        <H>Texts with the store</H>
        {!d.phone ? <div className="text-[12.5px] text-muted">No contact phone on file.</div> : <>
          <StoreTexts texts={d.texts ?? []} total={d.textsTotal ?? 0} />
          {d.phoneSharedWithDriver && <div className="mt-1 text-[11px] text-muted">This phone is also {d.phoneSharedWithDriver}'s (driver) — their driver texts are left out.</div>}
        </>}
        <StoreTextSwitches supplierId={supplierId} />
      </div>

      <div>
        {events.length > 0 ? (
          <button onClick={() => setOpen(!open)} className="haptic text-[12.5px] font-bold text-forest hover:underline">
            {open ? 'Hide the full list' : `Show all (${events.length})`}
          </button>
        ) : <div className="text-[12.5px] text-muted">Nothing in the last 90 days.</div>}
        {open && (
          <>
            <ul className="mt-1 divide-y divide-line rounded-[12px] border border-line bg-paper">
              {rows.map((e, i) => {
                const day = fmtDay(e.at);
                const sameDay = i > 0 && fmtDay(rows[i - 1]!.at) === day;
                return (
                  <li key={`${e.at}-${i}`} className="flex gap-2 px-3 py-1.5 text-[12.5px]">
                    <span className="w-[130px] shrink-0 text-muted">{sameDay ? '' : `${day} · `}{fmtTimeEastern(e.at)}</span>
                    <span className="min-w-0 text-ink">— {e.text}</span>
                  </li>
                );
              })}
            </ul>
            {events.length > shownN && (
              <button onClick={() => setShownN(shownN + 50)} className="haptic mt-1 text-[12.5px] font-bold text-forest hover:underline">Show more</button>
            )}
            <div className="mt-1 text-[11px] text-muted">Last 90 days, newest first (up to 100).</div>
          </>
        )}
      </div>
    </div>
  );
}

/** Store profile "Pickup history" tab — every pickup at this store (newest first, up to 400). */
export function StorePickupHistory({ supplierId }: { supplierId: number }) {
  const q = useQuery({ queryKey: ['sup-profile', supplierId], queryFn: () => api<{ data: any }>(`/api/suppliers/${supplierId}/profile`) });
  const [all, setAll] = useState(false);
  if (q.isLoading) return <div className="text-[13px] text-muted">Loading pickup history…</div>;
  if (q.isError) return <div className="text-[13px] text-clay">{loadFailText("Couldn't load", q.error)} <button onClick={() => q.refetch()} className="underline font-bold">Try again</button></div>;
  const rows: any[] = q.data?.data?.recent ?? [];
  if (rows.length === 0) return <div className="text-[12.5px] text-muted">No pickups yet.</div>;
  const shown = all ? rows : rows.slice(0, 20);
  return (
    <>
      <ul className="divide-y divide-line rounded-[12px] border border-line bg-paper">
        {shown.map((r) => (
          <li key={r.id} className="flex items-start justify-between gap-3 px-3 py-2">
            <div className="min-w-0">
              <div className="text-[13px] font-semibold text-ink truncate">{r.drivers || <span className="italic font-normal text-muted">No driver</span>}</div>
              <div className="text-[11.5px] text-muted">{fmtDate(r.date, r.time)} · #{r.ref_number ?? r.id}</div>
            </div>
            <div className="shrink-0 text-right text-[11.5px]">
              <div className="font-bold text-ink">{r.outcome_label ?? 'Still open'}</div>
              {String(r.outcome ?? '').startsWith('completed') && (
                <div className={r.kiosk_verified ? 'text-forest font-bold' : 'text-muted'}>{r.kiosk_verified ? '✓ Kiosk' : 'No kiosk'}</div>
              )}
            </div>
          </li>
        ))}
      </ul>
      {rows.length > 20 && (
        <button onClick={() => setAll(!all)} className="haptic mt-1 text-[12.5px] font-bold text-forest hover:underline">
          {all ? 'Show less' : `View all ${rows.length}`}
        </button>
      )}
    </>
  );
}
