/**
 * Oct 11 client: "Why did the new pickup only go out to 36 drivers?"
 * Tap the driver count on a pickup → who got the text, and why the others
 * didn't (grouped by reason). Data: GET /api/pickups/:id/text-recipients —
 * "got it" is the real send log; reasons are the sender's own rule.
 *
 * Oct 12 client: "When clicking on it, we should see who got texted THIS time,
 * who didn't, and who got texted this time that didn't get it before."
 * One chip per send (newest first, + All); for the chosen send: got it (with a
 * "new" tag), didn't (reasons at that send's time), got an earlier text but not this one.
 *
 * Oct 14 client: "too much information" — the popup now opens on a simple view (last text,
 * next text, folded "Who got it" / "Who didn't" / "Earlier texts"); "More details" = the view above.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { cx } from './design'; // Oct 14 client

type Person = { id: number; name: string; unit: string | null; textTo?: string }; // Oct 14 client: textTo = last 4 of the texting number (drivers with 2+ numbers)
// Oct 12 client: one entry per send (oldest first). Ids only; names in `people`.
type SkipRef = { id: number; code: string; reason?: string };
export type SendDetail = {
  at: string; count: number; source: string | null; kind: string; label: string;
  sent: number[]; newIds: number[]; earlierNotNow: number[]; skipped: SkipRef[];
  delivery?: Record<string, { code: string; label: string }>;  // Oct 14 client: what each driver actually got
  sentTo?: Record<string, string>;  // Oct 14 client: last 4 of the number this send went to (drivers with 2+ numbers)
};
export type TextRecipients = {
  pickupId: number;
  sentAt: string | null;
  group: { id: number; name: string } | null;
  totalMembers: number;
  sent: Person[];
  skipped: Array<Person & { code: string; reason: string }>;
  groups: Array<{ code: string; label: string; count: number; people: Array<Person & { reason: string }> }>;
  counts: Record<string, number>;
  appOnly: { count: number; withApp: number; gotAppAlert: number; note: string };
  sends: SendDetail[];
  all?: { sent: number[]; times: Record<string, number>; skipped: SkipRef[] };
  people?: Record<string, Person>;
  labels?: Record<string, string>;
  next?: NextText | null;
  note: string;
  waStatus?: Record<string, { label: string; confirmed: boolean; state: string }>;  // Oct 14 client: real WhatsApp status
  contact?: Record<string, string>;  // Oct 14 client: id → 'whatsapp' | 'both'
};

// Oct 14 client: colour of the "Text ✓ / WhatsApp ✓ / queued / failed" tag.
const deliveryTone = (code: string) =>
  code === 'wa' || code === 'text-wa' ? 'text-forest' : code === 'wa-queued' ? 'text-[#9a7415]'
  : code === 'wa-failed' || code === 'text-failed' ? 'text-clay' : code === 'wa-failed-texted' ? 'text-[#9a7415]' : 'text-muted';

// Oct 12 client: card lines — the next text that will list the pickup, and every text that already did.
export type NextText = { at: string | null; kind: 'hourly' | 'new-slot' | 'override' | 'with-next-new' | 'held' | 'paused' | 'none'; note: string; willGo: number | null; willGoNow: number | null };
// Oct 14 client: opensToDriversAt = still needs a driver, but drivers don't see it until then (driver queue window).
export type PickupTextInfo = { sends: Array<{ at: string; count: number }>; next: NextText | null; opensToDriversAt?: string | null };

// One request for every card on screen: cards ask within ~25 ms of each other and share one call.
let tiQueue = new Map<number, Array<(v: PickupTextInfo | null) => void>>();
let tiTimer: ReturnType<typeof setTimeout> | null = null;
function loadPickupTextInfo(id: number): Promise<PickupTextInfo | null> {
  return new Promise((resolve) => {
    tiQueue.set(id, [...(tiQueue.get(id) ?? []), resolve]);
    if (!tiTimer) tiTimer = setTimeout(flushPickupTextInfo, 25);
  });
}
function flushPickupTextInfo() {
  const q = tiQueue; tiQueue = new Map(); tiTimer = null;
  const ids = [...q.keys()];
  for (let i = 0; i < ids.length; i += 150) {
    const chunk = ids.slice(i, i + 150);
    api<{ data: { items: Record<string, PickupTextInfo> } }>(`/api/pickups/text-info?ids=${chunk.join(',')}`)
      .then((r) => { for (const id of chunk) for (const res of q.get(id) ?? []) res(r.data.items[String(id)] ?? null); })
      .catch(() => { for (const id of chunk) for (const res of q.get(id) ?? []) res(null); });
  }
}

/** Today: "9:00 AM"; this week: "Sun 10:05 PM"; later: "Oct 26 1:00 PM" (New York time). */
export function fmtSendTime(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const ymd = (x: Date) => x.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const time = d.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' });
  if (ymd(d) === ymd(now)) return time;
  const days = Math.abs(d.getTime() - now.getTime()) / 86400e3;
  return days < 6
    ? `${d.toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'short' })} ${time}`
    : `${d.toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' })} ${time}`;
}

export function nextTextLine(n: NextText | null | undefined): string | null {
  if (!n) return null;
  if (n.at) return `Will go to ${n.willGo ?? 0} driver${n.willGo === 1 ? '' : 's'} at ${fmtSendTime(n.at)}`;
  if (n.kind === 'with-next-new') return `Next text: with the next new pickup${n.willGoNow != null ? ` (${n.willGoNow} drivers now)` : ''}`;
  if (n.kind === 'held') return 'On hold — not texted until the office sends it';
  if (n.kind === 'paused') return 'All texts paused — not texted until resumed';
  return n.note;
}

/**
 * Oct 12 client: lines on a pickup card / the pickup page; tap → the who-got-it popup.
 * Oct 14 client: "The new texting info is very messy and hard to follow" — ONE short line:
 *   "📤 Texted 4× · last 8:29 PM to 55" / "📤 Not texted yet" / "📤 Opens to drivers at 3:00 PM".
 * The next text moved into the popup. `sig` changes when the card's data does (refetch).
 */
export function PickupTextLines({ pickupId, sig = '', className = '' }: { pickupId: number; sig?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const bucket = Math.floor(Date.now() / 300_000);   // all cards refresh together every 5 min
  const q = useQuery({ queryKey: ['pickup-text-info', pickupId, sig, bucket], queryFn: () => loadPickupTextInfo(pickupId), staleTime: 300_000 });
  const d = q.data;
  if (!d) return null;
  // Oct 14 client: "Opens to drivers at 3:00 PM" while drivers can't see it yet.
  const opens = d.opensToDriversAt && Date.parse(d.opensToDriversAt) > Date.now() ? d.opensToDriversAt : null;
  const last = d.sends[d.sends.length - 1];
  if (!last && !d.next && !opens) return null;
  const n = d.sends.length;
  const hold = d.next?.kind === 'held' ? ' · on hold' : d.next?.kind === 'paused' ? ' · texts paused' : '';
  const line = opens ? `Opens to drivers at ${fmtSendTime(opens)}`
    : last ? `Texted ${n === 1 ? 'once' : `${n}×`} · ${n === 1 ? '' : 'last '}${fmtSendTime(last.at)} to ${last.count}`
    : `Not texted yet${hold}`;
  return (
    <>
      <div role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); setOpen(true); }} title="Who got the text"
           onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); setOpen(true); } }}
           className={`haptic block max-w-full min-w-0 text-left text-[11.5px] leading-snug cursor-pointer ${className}`} data-testid="text-line">
        <span className={cx('block truncate', opens ? 'font-semibold text-[#9a7415]' : 'text-muted')}>
          📤 <span className="underline decoration-dotted underline-offset-2">{line}</span>
        </span>
      </div>
      {open && createPortal(<TextRecipientsPopup pickupId={pickupId} onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}

export function fetchTextRecipients(pickupId: number, at?: string) {
  return api<{ data: TextRecipients }>(`/api/pickups/${pickupId}/text-recipients${at ? `?at=${encodeURIComponent(at)}` : ''}`).then((r) => r.data);
}

function fmtWhen(iso: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
}
const who = (p: Person) => `${p.name}${p.unit ? ` #${p.unit}` : ''}`;

/** The driver count as a link. eager = fetch now to show "Texted to 36 drivers". */
export function TextedDriversLink({ pickupId, eager = false, className = '' }: { pickupId: number; eager?: boolean; className?: string }) {
  const [open, setOpen] = useState(false);
  const q = useQuery({ queryKey: ['text-recipients', pickupId], queryFn: () => fetchTextRecipients(pickupId), enabled: eager || open, staleTime: 30_000 });
  const d = q.data;
  const label = !eager ? 'Who got the text?'
    : !d ? 'Texted to … drivers'
    : d.sentAt ? `Texted to ${d.sent.length} driver${d.sent.length === 1 ? '' : 's'}`
    : 'Not texted yet';
  if (eager && d && !d.sentAt) return null;   // never texted: nothing to show on the pickup page
  return (
    <>
      <button type="button" onClick={(e) => { e.stopPropagation(); setOpen(true); }}
              className={`haptic underline decoration-dotted underline-offset-2 font-bold text-sky-deep ${className}`}>
        {label}
      </button>
      {/* On <body>: the link sits inside a one-line title / a clickable card. */}
      {open && createPortal(<TextRecipientsPopup pickupId={pickupId} onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}

/**
 * Oct 12 client: tap a name → that driver's Alerts & schedule tab. The office
 * portal listens for this event (CoordinatorPortal); returns true when handled.
 */
export function openDriverAlerts(id: number): boolean {
  const ev = new CustomEvent('zlz:open-volunteer', { detail: { id, tab: 'alerts' }, cancelable: true });
  return !window.dispatchEvent(ev);
}

/** Group skipped people by reason, biggest group first. */
function byReason(list: SkipRef[], labels: Record<string, string>) {
  const m = new Map<string, { code: string; label: string; people: SkipRef[] }>();
  for (const s of list) {
    if (!m.has(s.code)) m.set(s.code, { code: s.code, label: labels[s.code] ?? s.reason ?? s.code, people: [] });
    m.get(s.code)!.people.push(s);
  }
  return [...m.values()].sort((a, b) => b.people.length - a.people.length);
}

// Oct 14 client: a closed-by-default section in the simple popup.
function Fold({ title, tone = '', testid, children }: { title: string; tone?: string; testid?: string; children: ReactNode }) {
  const [on, setOn] = useState(false);
  return (
    <div className="rounded-[10px] border border-line" data-testid={testid}>
      <button type="button" onClick={() => setOn(!on)} aria-expanded={on}
              className="haptic w-full flex items-center justify-between gap-2 px-3 py-2 text-left">
        <span className={cx('font-bold text-[14px]', tone)}>{title}</span>
        <span className="text-[12px] text-muted shrink-0">{on ? 'Hide' : 'Show'}</span>
      </button>
      {on && <div className="px-3 pb-2.5">{children}</div>}
    </div>
  );
}
const FAILED_CODES = new Set(['wa-failed', 'text-failed']);

export function TextRecipientsPopup({ pickupId, initialAt, onClose }: { pickupId: number; initialAt?: string; onClose: () => void }) {
  // Oct 12 client: '' = newest send; 'all' = every send combined; else a send's time.
  const [sel, setSel] = useState<string>(initialAt ?? '');
  const [showGot, setShowGot] = useState(false);
  const [more, setMore] = useState(false);   // Oct 14 client: simple view first; "More details" = the full view
  const q = useQuery({ queryKey: ['text-recipients', pickupId, ''], queryFn: () => fetchTextRecipients(pickupId), staleTime: 30_000 });
  const d = q.data;
  const people = d?.people ?? {};
  const labels = d?.labels ?? {};
  const name = (id: number) => { const p = people[String(id)]; return p ? who(p) : `Driver ${id}`; };
  const sends = d?.sends ?? [];
  const newestFirst = useMemo(() => [...sends].reverse(), [sends]);

  // The chosen send: exact time, else the closest one (the card's times are the same sends).
  const idx = useMemo(() => {
    if (sends.length === 0 || sel === 'all') return -1;
    if (!sel) return sends.length - 1;
    const want = new Date(sel).getTime();
    let best = sends.length - 1;
    sends.forEach((s, i) => { if (Math.abs(new Date(s.at).getTime() - want) < Math.abs(new Date(sends[best]!.at).getTime() - want)) best = i; });
    return best;
  }, [sends, sel]);
  const cur = idx >= 0 ? sends[idx]! : null;
  const isAll = !!d && sends.length > 0 && sel === 'all';
  const neverTexted = !!d && sends.length === 0;

  const gotIds = cur ? cur.sent : isAll ? (d?.all?.sent ?? []) : [];
  const newSet = new Set(cur && idx > 0 ? cur.newIds : []);
  const gotSorted = [...gotIds].sort((a, b) => Number(newSet.has(b)) - Number(newSet.has(a)));
  const skippedList: SkipRef[] = cur ? cur.skipped : (d?.all?.skipped ?? []);
  const skipById = new Map(skippedList.map((s) => [s.id, s]));
  const reasonGroups = byReason(skippedList, labels);
  const earlier = cur && idx > 0 ? cur.earlierNotNow : [];

  const pick = (id: number) => { if (openDriverAlerts(id)) onClose(); };
  // Oct 14 client: what each driver actually got this time (real logs), + their real WhatsApp status.
  const dl = (id: number) => cur?.delivery?.[String(id)] ?? null;
  const waOf = (id: number) => d?.waStatus?.[String(id)] ?? null;
  const dlCounts = (() => {
    const m = new Map<string, { label: string; code: string; n: number }>();
    for (const id of gotIds) { const x = dl(id); if (!x) continue; const k = x.label; m.set(k, { ...x, n: (m.get(k)?.n ?? 0) + 1 }); }
    return [...m.values()].sort((a, b) => b.n - a.n);
  })();
  // Oct 14 client: simple view — failed sends are counted apart from "got it".
  const failedIds = cur ? cur.sent.filter((id) => FAILED_CODES.has(dl(id)?.code ?? '')) : [];
  const okIds = cur ? cur.sent.filter((id) => !FAILED_CODES.has(dl(id)?.code ?? '')) : [];
  const isLast = idx === sends.length - 1;
  const nextLine = nextTextLine(d?.next);
  const NameBtn = ({ id, tag }: { id: number; tag?: string }) => (
    <button type="button" onClick={() => pick(id)} title={waOf(id) ? `Open Alerts & schedule — WhatsApp: ${waOf(id)!.label}` : 'Open Alerts & schedule'}
            className="haptic font-semibold text-left hover:underline">
      {name(id)}{tag && <span className="ml-1 align-middle text-[9.5px] font-bold uppercase tracking-wide bg-sky-soft text-sky-deep px-1 py-[1px] rounded-full">{tag}</span>}
    </button>
  );

  return (
    <div onClick={(e) => { e.stopPropagation(); onClose(); }}
         className="fixed inset-0 z-[2100] bg-ink/50 flex items-start justify-center pt-14 px-4 overflow-y-auto whitespace-normal text-left font-sans font-normal">
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Who got the text"
           className="w-full max-w-[440px] bg-paper rounded-[14px] border border-line shadow-card p-4 mb-10 text-ink cursor-default">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-display font-bold text-[18px]">Who got the text</div>
            {more && d && (
              <div className="text-[12.5px] text-muted mt-0.5">
                {d.group?.name ?? 'Text group'} · {d.totalMembers} in the group
                {neverTexted ? ' · not texted yet' : ` · sent ${sends.length === 1 ? 'once' : `${sends.length}×`}`}
              </div>
            )}
          </div>
          <button type="button" onClick={onClose} className="haptic text-muted font-bold text-[20px] leading-none px-1" aria-label="Close">×</button>
        </div>

        {more && nextLine && <div className="text-[12.5px] font-semibold text-sky-deep mt-1">{nextLine}</div>}
        {q.isLoading && <div className="text-[13px] text-muted mt-3">Loading…</div>}
        {q.isError && <div className="text-[13px] text-clay font-bold mt-3">Couldn't load. Try again.</div>}

        {/* Oct 14 client: simple view — the last text first, the lists folded away. */}
        {d && !more && (
          <div className="mt-2 space-y-2.5" data-testid="text-simple">
            {neverTexted ? (
              <div className="text-[17px] font-bold leading-snug">Not texted yet</div>
            ) : cur && (
              <div className="text-[17px] font-bold leading-snug" data-testid="last-summary">
                {isLast ? 'Last text' : 'Text'}: {fmtSendTime(cur.at)} — <span className="text-forest">{okIds.length} got it</span>
                {' · '}<span className="text-clay">{skippedList.length} didn't</span>
                {failedIds.length > 0 && <>{' · '}<span className="text-clay">{failedIds.length} failed</span></>}
              </div>
            )}
            {cur && !isLast && (
              <button type="button" onClick={() => setSel('')} className="haptic text-[12.5px] font-semibold text-sky-deep underline">Back to the last text</button>
            )}
            {nextLine && <div className="text-[12.5px] text-muted">{nextLine}</div>}
            <div key={cur?.at ?? 'none'} className="space-y-2">
              {!neverTexted && (
                <Fold title={`Who got it (${okIds.length})`} tone="text-forest" testid="fold-got">
                  <div className="text-[12.5px] leading-snug flex flex-wrap gap-x-2.5 gap-y-1">
                    {okIds.length === 0 ? '—' : okIds.map((id) => (
                      <span key={id} className="inline-flex items-baseline gap-1">
                        <NameBtn id={id} />
                        {dl(id) && <span className={cx('text-[11px] font-bold', deliveryTone(dl(id)!.code))} data-delivery>{dl(id)!.label}</span>}
                      </span>
                    ))}
                  </div>
                </Fold>
              )}
              <Fold title={neverTexted ? `Who wouldn't get it now (${skippedList.length})`
                           : `Who didn't get it (${skippedList.length}${failedIds.length ? ` + ${failedIds.length} failed` : ''})`}
                    tone="text-clay" testid="fold-didnt">
                <div className="space-y-2">
                  {skippedList.length === 0 && failedIds.length === 0 && <div className="text-[12.5px] text-muted">Everyone in the group got it.</div>}
                  {failedIds.length > 0 && (
                    <div>
                      <div className="text-[13px] font-bold text-clay">Failed to send <span className="text-muted">{failedIds.length}</span></div>
                      <div className="text-[12.5px] leading-snug flex flex-wrap gap-x-2.5 gap-y-1">
                        {failedIds.map((id) => (
                          <span key={id} className="inline-flex items-baseline gap-1">
                            <NameBtn id={id} />
                            <span className={cx('text-[11px] font-bold', deliveryTone(dl(id)!.code))} data-delivery>{dl(id)!.label}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {reasonGroups.map((g) => (
                    <div key={g.code}>
                      <div className="text-[13px] font-bold">{g.label} <span className="text-muted">{g.people.length}</span></div>
                      <div className="text-[12.5px] leading-snug flex flex-wrap gap-x-2.5 gap-y-1">
                        {g.people.map((p) => (
                          <span key={p.id} className="inline-flex items-baseline gap-1" title={p.reason && p.reason !== g.label ? p.reason : undefined}>
                            <NameBtn id={p.id} />
                            {g.code === 'whatsapp_only' && waOf(p.id) && <span className="text-[11px] text-muted">{waOf(p.id)!.label}</span>}
                            {/* Oct 14 client: "What does that mean?" — show which status (e.g. "do not contact") */}
                            {g.code === 'status' && p.reason && <span className="text-[11px] text-muted">({p.reason.replace(/^Status:\s*/i, '')})</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </Fold>
              {sends.length > 1 && (
                <Fold title={`Earlier texts (${sends.length - 1})`} testid="fold-earlier">
                  <ul className="space-y-1">
                    {newestFirst.filter((s) => s.at !== cur?.at).map((s) => (
                      <li key={s.at}>
                        <button type="button" onClick={() => setSel(s.at)} className="haptic text-[12.5px] font-semibold underline decoration-dotted underline-offset-2 hover:text-sky-deep">
                          {fmtSendTime(s.at)} · {s.count} driver{s.count === 1 ? '' : 's'}
                        </button>
                      </li>
                    ))}
                  </ul>
                </Fold>
              )}
            </div>
            <button type="button" onClick={() => setMore(true)} className="haptic text-[12px] text-muted underline">More details</button>
          </div>
        )}

        {/* Oct 12 client: one chip per send, newest first, then All. */}
        {more && d && sends.length > 0 && (
          <div className="mt-2 -mx-1 px-1 flex gap-1.5 overflow-x-auto pb-1" data-testid="send-chips">
            {newestFirst.map((s) => {
              const on = cur?.at === s.at;
              return (
                <button key={s.at} type="button" onClick={() => { setSel(s.at); setShowGot(false); }}
                        className={`haptic shrink-0 rounded-full border px-2.5 py-1 text-[12px] font-bold whitespace-nowrap ${on ? 'bg-sky-soft text-ink border-sky' : 'bg-paper text-ink border-line'}`} aria-pressed={on}>
                  {fmtSendTime(s.at)} · {s.count}
                </button>
              );
            })}
            {sends.length > 1 && (
              <button type="button" onClick={() => { setSel('all'); setShowGot(false); }}
                      className={`haptic shrink-0 rounded-full border px-2.5 py-1 text-[12px] font-bold whitespace-nowrap ${isAll ? 'bg-sky-soft text-ink border-sky' : 'bg-paper text-ink border-line'}`} aria-pressed={isAll}>
                All
              </button>
            )}
          </div>
        )}

        {more && d && cur && (
          <div className="mt-1 text-[12.5px] text-muted" data-testid="send-head">
            {fmtWhen(cur.at)} · {cur.count} driver{cur.count === 1 ? '' : 's'}{cur.label ? ` · ${cur.label}` : ''}
          </div>
        )}
        {more && d && cur && (
          <div className="mt-0.5 text-[12.5px] font-semibold text-ink" data-testid="send-summary">
            {idx === 0 ? 'First text for this pickup'
              : [`${cur.newIds.length} new ${cur.newIds.length === 1 ? 'person' : 'people'} this time`,
                 ...(earlier.length ? [`${earlier.length} got it before but not now`] : [])].join(' · ')}
          </div>
        )}
        {more && isAll && <div className="mt-1 text-[12.5px] text-muted">Every text combined · {d!.all?.sent.length ?? 0} got at least one</div>}

        {more && d && (
          <div className="mt-3 space-y-3">
            {neverTexted && (
              <div className="text-[12.5px] text-muted">This pickup wasn't texted. Below: who would be skipped right now, and why.</div>
            )}
            {!neverTexted && (
              <div>
                <button type="button" onClick={() => setShowGot(!showGot)} className="haptic w-full flex items-center justify-between text-left">
                  <span className="font-bold text-[14px] text-forest">
                    {isAll ? 'Got at least one' : 'Got it this time'} ({gotIds.length})
                    {newSet.size > 0 && <span className="ml-1.5 text-[12px] font-semibold text-sky-deep">{newSet.size} new</span>}
                  </span>
                  <span className="text-[12px] text-muted">{showGot ? 'Hide' : 'Show names'}</span>
                </button>
                {dlCounts.length > 0 && (
                  <div className="mt-0.5 text-[12px] leading-snug" data-testid="delivery-counts">
                    {dlCounts.map((x, i) => (
                      <span key={x.label}>{i > 0 ? ' · ' : ''}<span className={cx('font-bold', deliveryTone(x.code))}>{x.label}</span> {x.n}</span>
                    ))}
                  </div>
                )}
                {showGot && (
                  <div className="mt-1 text-[12.5px] leading-snug text-ink flex flex-wrap gap-x-2 gap-y-0.5">
                    {gotSorted.length === 0 ? '—' : gotSorted.map((id) => (
                      <span key={id} className="inline-flex items-baseline gap-1">
                        <NameBtn id={id}
                                 tag={newSet.has(id) ? 'new' : isAll && (d.all?.times[String(id)] ?? 0) > 1 ? `${d.all?.times[String(id)]}×` : undefined} />
                        {dl(id) && <span className={cx('text-[11px] font-bold', deliveryTone(dl(id)!.code))} data-delivery>{dl(id)!.label}</span>}
                        {/* Oct 14 client: which of the driver's numbers it went to */}
                        {(cur?.sentTo?.[String(id)] ?? people[String(id)]?.textTo) && <span className="text-[11px] text-muted" title="The number this text went to">to …{cur?.sentTo?.[String(id)] ?? people[String(id)]?.textTo}</span>}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div>
              <div className="font-bold text-[14px] text-clay">
                {neverTexted ? 'Would not get it' : isAll ? 'Never got one' : 'Didn\'t get it this time'} ({skippedList.length})
              </div>
              {skippedList.length === 0 && <div className="text-[12.5px] text-muted mt-1">Everyone in the group got it.</div>}
              <div className="mt-1 space-y-1.5">
                {reasonGroups.map((g) => (
                  <div key={g.code} className="rounded-[10px] border border-line px-2.5 py-1.5">
                    <div className="flex items-center justify-between gap-2 text-[13px] font-bold">
                      <span>{g.label}</span><span className="text-muted">{g.people.length}</span>
                    </div>
                    <ul className="mt-0.5 space-y-0.5">
                      {g.people.map((p) => (
                        <li key={p.id} className="text-[12.5px] leading-snug">
                          <NameBtn id={p.id} />
                          {p.reason && p.reason !== g.label && <span className="text-muted"> — {p.reason}</span>}
                          {g.code === 'whatsapp_only' && waOf(p.id) && <span className="text-muted"> · {waOf(p.id)!.label}</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
            {/* Oct 12 client: got an earlier text for this pickup, but not this one. */}
            {earlier.length > 0 && (
              <div>
                <div className="font-bold text-[14px] text-ink">Got an earlier text but not this one ({earlier.length})</div>
                <ul className="mt-1 space-y-0.5">
                  {earlier.map((id) => {
                    const s = skipById.get(id);
                    const why = s ? (s.reason ?? labels[s.code] ?? s.code) : 'Not in the group now';
                    return (
                      <li key={id} className="text-[12.5px] leading-snug">
                        <NameBtn id={id} /><span className="text-muted"> — {why}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            {d.appOnly.count > 0 && (
              <div className="text-[12px] text-muted">
                App only: {d.appOnly.count} driver{d.appOnly.count === 1 ? '' : 's'} ({d.appOnly.withApp} with the app). {d.appOnly.note}
              </div>
            )}
            <div className="text-[11.5px] text-muted">{d.note}</div>
            <button type="button" onClick={() => { setMore(false); if (sel === 'all') setSel(''); }} className="haptic text-[12px] text-muted underline">Simple view</button>
          </div>
        )}
      </div>
    </div>
  );
}
