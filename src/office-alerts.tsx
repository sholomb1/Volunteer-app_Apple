/**
 * Oct 11 client: dispatcher alerts in the office portal.
 *   • Bell with a red count in the header; click → recent alerts (last 24h), newest first.
 *   • New alert → a toast in the corner that stays until dismissed, with a short beep
 *     (Web Audio, no sound file). Mute is remembered on this computer.
 *   • "Turn on phone alerts" → subscribes this browser/phone to web push.
 * Replaces the old "New SMS reply" toast (text replies now come in as alerts).
 * Feed: GET /api/office-alerts (polled every 25s while the portal is open).
 * Oct 11 client: alerts clear themselves — the feed marks alerts that no longer need the
 * office (a driver took it, the text was answered/read) as handled. They leave the list
 * ("N handled — show") and the unread count, and their pop-ups are closed on this device.
 * Oct 12 client: Dismiss (×) on each alert and "Dismiss all" — the office says it's handled,
 * for everyone in the office (server-side); shown under handled as "Dismissed by <first name>" with Undo.
 */
import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, BellOff, X } from 'lucide-react';
import { api, getUser } from './api';
import { ensureWebPushSubscribed } from './web-push-client';
import { cx } from './design';

export type OfficeAlert = {
  id: number; kind: string; createdAt: string;
  title: string; body: string; url: string | null;
  pickupId: number | null; phone: string | null;
  handled?: boolean; // Oct 11 client: no longer needed
  dismissed?: boolean; dismissedBy?: string | null; // Oct 12 client: the office dismissed it
};

/** Oct 11 client: close this device's pop-ups (tag office_alert_<id>) for alerts that are handled. */
export async function closeHandledAlertNotifications(handledIds: Array<number | string>): Promise<number> {
  try {
    if (!handledIds.length || !('serviceWorker' in navigator)) return 0;
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg || typeof reg.getNotifications !== 'function') return 0;
    const tags = new Set(handledIds.map((id) => `office_alert_${id}`));
    let closed = 0;
    for (const n of await reg.getNotifications()) {
      if (n.tag && tags.has(n.tag)) { n.close(); closed++; }
    }
    return closed;
  } catch { return 0; }
}

const POLL_MS = 25_000;
const uidKey = () => String(getUser()?.id ?? 'me');
const lsGet = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };
const SEEN_KEY = () => `zlz-office-alerts-seen-${uidKey()}`;
const TOASTED_KEY = () => `zlz-office-alerts-toasted-${uidKey()}`;
const MUTE_KEY = 'zlz-office-alerts-muted';

const fmtTime = (iso: string) => new Date(iso).toLocaleString('en-US', {
  timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit',
});
const kindIcon = (k: string) =>
  k === 'reply' ? '📩' : k === 'reply_waiting' ? '⏰' : k === 'gave_back' ? '↩️'
  : k === 'food_check' || k === 'food_check_info' ? '🥖' : k === 'store_cancel' ? '✋'
  : k === 'bug_report' ? '🐞' : '🚗'; // Oct 13 client; Oct 14 client: problem report

// ---- Sound: two short beeps, made with the Web Audio API ----
let audioCtx: AudioContext | null = null;
function ctx(): AudioContext | null {
  try {
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC) return null;
    if (!audioCtx) audioCtx = new AC();
    return audioCtx;
  } catch { return null; }
}
export function playAlertBeep() {
  const c = ctx();
  if (!c) return;
  try {
    if (c.state === 'suspended') void c.resume();
    const t0 = c.currentTime + 0.02;
    [0, 0.22].forEach((d, i) => {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = 'sine';
      o.frequency.value = i === 0 ? 880 : 1175;
      g.gain.setValueAtTime(0.0001, t0 + d);
      g.gain.exponentialRampToValueAtTime(0.25, t0 + d + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.18);
      o.connect(g); g.connect(c.destination);
      o.start(t0 + d); o.stop(t0 + d + 0.2);
    });
  } catch { /* no sound is fine */ }
}

// ---- Phone alerts (web push) state ----
type PushState = 'on' | 'off' | 'blocked' | 'unsupported' | 'checking';
async function readPushState(): Promise<PushState> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  if (Notification.permission !== 'granted') return 'off';
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    return sub ? 'on' : 'off';
  } catch { return 'off'; }
}

/** "Turn on phone alerts" with the current state (On / Off / Blocked by the browser). */
export function PhoneAlertsButton({ compact = false }: { compact?: boolean }) {
  const [state, setState] = useState<PushState>('checking');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { void readPushState().then(setState); }, []);
  const turnOn = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await ensureWebPushSubscribed();
      if (!r.ok) setMsg(r.reason === 'permission-denied'
        ? 'The browser blocked it. Allow notifications for this site in the browser settings, then try again.'
        : "Couldn't turn on alerts in this browser.");
    } catch { setMsg("Couldn't turn on alerts. Try again."); }
    setState(await readPushState());
    setBusy(false);
  };
  const label = state === 'on' ? 'On' : state === 'blocked' ? 'Blocked by the browser'
    : state === 'unsupported' ? 'Not available here' : state === 'checking' ? '…' : 'Off';
  return (
    <div className={cx('rounded-[12px] border border-line bg-cream/60', compact ? 'p-3' : 'p-4')}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="font-bold text-[13.5px]">Phone alerts</div>
        <span className={cx('text-[11px] font-extrabold uppercase tracking-[.05em] px-2 py-0.5 rounded-full',
          state === 'on' ? 'bg-forest text-paper' : state === 'blocked' ? 'bg-clay-soft text-clay' : 'bg-line text-muted')}>
          {label}
        </span>
        {state !== 'on' && state !== 'unsupported' && state !== 'checking' && (
          <button onClick={() => void turnOn()} disabled={busy}
                  className="haptic ml-auto text-[12.5px] font-bold bg-forest text-paper px-3 py-1.5 rounded-[8px] disabled:opacity-60">
            {busy ? 'Working…' : 'Turn on phone alerts'}
          </button>
        )}
      </div>
      <div className="text-[12px] text-muted mt-1.5 leading-snug">
        {state === 'on'
          ? 'This browser gets an alert when a text needs the office or something waits too long.'
          : 'On your phone: open the portal in Chrome/Safari, add it to the Home Screen, then tap Turn on phone alerts.'}
        {state === 'blocked' && ' Notifications are blocked: allow them for this site in the browser settings.'}
      </div>
      {msg && <div className="text-[12px] text-clay mt-1.5">{msg}</div>}
    </div>
  );
}

/** Bell + list + toasts. */
export function OfficeAlertsBell({ onOpenPickup, onOpenMessages }: {
  onOpenPickup: (id: number) => void;
  onOpenMessages: (phone: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [muted, setMuted] = useState(() => lsGet(MUTE_KEY) === '1');
  const [seenId, setSeenId] = useState(() => Number(lsGet(SEEN_KEY()) ?? 0) || 0);
  const [toasts, setToasts] = useState<OfficeAlert[]>([]);
  const [showHandled, setShowHandled] = useState(false); // Oct 11 client
  const toastedRef = useRef<number | null>(null);
  const mountedAt = useRef(Date.now());
  const boxRef = useRef<HTMLDivElement | null>(null);

  const q = useQuery<{ data: OfficeAlert[] }>({
    queryKey: ['office-alerts'],
    queryFn: () => api('/api/office-alerts'),
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: true,
  });
  const rows = q.data?.data ?? [];
  const qc = useQueryClient();
  // Oct 12 client: Dismiss / Dismiss all / Undo — saved on the server (for everyone in the office).
  // Right away here: mark them handled (leaves the list + count, toast and pop-up close), then refetch.
  const markLocal = (ids: number[], dismissed: boolean) => {
    const set = new Set(ids);
    qc.setQueryData<{ data: OfficeAlert[] }>(['office-alerts'], (old) => old && ({
      ...old,
      data: old.data.map((r) => (set.has(r.id) ? { ...r, handled: dismissed, dismissed, dismissedBy: null } : r)),
    }));
  };
  const dismiss = async (ids: number[], all = false) => {
    if (!ids.length) return;
    markLocal(ids, true);
    setToasts((t) => t.filter((x) => !ids.includes(x.id)));
    void closeHandledAlertNotifications(ids);
    try {
      if (all) await api('/api/office-alerts/dismiss-all', { method: 'POST', body: JSON.stringify({ ids }) });
      else await api(`/api/office-alerts/${ids[0]}/dismiss`, { method: 'POST' });
    } catch { /* the refetch shows the real state */ }
    void q.refetch();
  };
  const undoDismiss = async (id: number) => {
    try { await api(`/api/office-alerts/${id}/undismiss`, { method: 'POST' }); } catch { /* refetch shows it */ }
    void q.refetch();
  };
  // Oct 11 client: handled alerts (no longer needed) are hidden behind "N handled — show".
  const liveRows = rows.filter((r) => !r.handled);
  const handledRows = rows.filter((r) => r.handled);

  // Oct 11 client: handled → drop its toast and close its pop-up on this device
  // (on every feed refresh, and when the page comes back into view).
  useEffect(() => {
    if (!q.data) return;
    const ids = new Set(handledRows.map((r) => r.id));
    if (!ids.size) return;
    setToasts((t) => (t.some((x) => ids.has(x.id)) ? t.filter((x) => !ids.has(x.id)) : t));
    void closeHandledAlertNotifications([...ids]);
  }, [q.data]);
  useEffect(() => {
    const back = () => { if (document.visibilityState === 'visible') void q.refetch(); };
    document.addEventListener('visibilitychange', back);
    window.addEventListener('focus', back);
    return () => { document.removeEventListener('visibilitychange', back); window.removeEventListener('focus', back); };
  }, []);

  // Browsers only allow sound after the page was clicked once — warm up on first click.
  useEffect(() => {
    const warm = () => { const c = ctx(); if (c && c.state === 'suspended') void c.resume(); };
    window.addEventListener('pointerdown', warm, { once: true });
    return () => window.removeEventListener('pointerdown', warm);
  }, []);

  // New alerts → toast + beep. First load: only alerts newer than page open (or never shown here).
  useEffect(() => {
    if (!q.data) return;
    if (toastedRef.current === null) {
      const stored = Number(lsGet(TOASTED_KEY()) ?? 0) || 0;
      const preMount = rows.filter((r) => new Date(r.createdAt).getTime() <= mountedAt.current).map((r) => r.id);
      toastedRef.current = Math.max(stored, ...preMount, 0);
    }
    const freshAll = rows.filter((r) => r.id > (toastedRef.current ?? 0)).sort((a, b) => a.id - b.id);
    if (!freshAll.length) return;
    toastedRef.current = freshAll[freshAll.length - 1]!.id;
    lsSet(TOASTED_KEY(), String(toastedRef.current));
    const fresh = freshAll.filter((r) => !r.handled); // Oct 11 client: already handled → no pop-up
    if (!fresh.length) return;
    setToasts((t) => [...fresh.reverse(), ...t].slice(0, 6));
    if (!muted) playAlertBeep();
  }, [q.data]);

  // Close the list on outside click.
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const unread = liveRows.filter((r) => r.id > seenId).length; // Oct 11 client: only still-needed ones
  const markAllSeen = () => {
    const top = rows[0]?.id ?? seenId;
    if (top > seenId) { setSeenId(top); lsSet(SEEN_KEY(), String(top)); }
  };
  const toggleMute = () => { const v = !muted; setMuted(v); lsSet(MUTE_KEY, v ? '1' : '0'); if (!v) playAlertBeep(); };
  const go = (a: OfficeAlert) => {
    // Oct 14 client: a problem report opens the Problem reports list (Help menu).
    if (a.kind === 'bug_report') window.dispatchEvent(new Event('zlz:problem-reports'));
    else if (a.pickupId) onOpenPickup(Number(a.pickupId));
    else onOpenMessages(a.phone);
    setToasts((t) => t.filter((x) => x.id !== a.id));
    setOpen(false);
  };

  return (
    <div className="relative" ref={boxRef}>
      <button onClick={() => { setOpen((v) => !v); if (!open) markAllSeen(); }}
              aria-label={unread ? `${unread} new alerts` : 'Alerts'}
              title="Alerts"
              className="haptic relative grid h-9 w-9 place-items-center rounded-full border border-line bg-paper hover:bg-cream">
        {muted ? <BellOff size={17} /> : <Bell size={17} />}
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 inline-grid place-items-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-paper text-[10.5px] font-extrabold">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 z-[2500] w-[min(360px,calc(100vw-24px))] rounded-[14px] border border-line bg-paper shadow-lift">
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-line">
            <div className="font-bold text-[14px] flex-1">Alerts <span className="text-muted font-semibold text-[12px]">· last 24 hours</span></div>
            {liveRows.length >= 2 && ( // Oct 12 client
              <button onClick={() => void dismiss(liveRows.map((r) => r.id), true)}
                      className="haptic text-[12px] font-bold text-muted px-2 py-1 rounded-[8px] hover:bg-cream">
                Dismiss all
              </button>
            )}
            <button onClick={toggleMute} className="haptic text-[12px] font-bold text-muted px-2 py-1 rounded-[8px] hover:bg-cream">
              {muted ? 'Sound off' : 'Sound on'}
            </button>
          </div>
          <div className="max-h-[50vh] overflow-y-auto">
            {liveRows.length === 0 && (
              <div className="px-3 py-4 text-[13px] text-muted">{handledRows.length ? 'Nothing needs you right now.' : 'No alerts.'}</div>
            )}
            {(showHandled ? rows : liveRows).map((a) => (
              <div key={a.id} data-alert-id={a.id} className="flex items-stretch border-b border-line/60">
                <button onClick={() => go(a)}
                        className={cx('flex-1 min-w-0 text-left flex gap-2 pl-3 pr-1 py-2.5 hover:bg-cream/60', a.handled && 'opacity-55')}>
                  <span className="text-[16px] leading-5">{kindIcon(a.kind)}</span>
                  <span className="flex-1 min-w-0">
                    <span className="flex items-baseline gap-2">
                      <span className="font-bold text-[13px] truncate flex-1">{a.title}</span>
                      <span className="text-[11px] text-muted whitespace-nowrap">{fmtTime(a.createdAt)}</span>
                    </span>
                    <span className="block text-[12.5px] text-muted truncate">
                      {a.handled ? (a.dismissed ? `Dismissed${a.dismissedBy ? ` by ${a.dismissedBy}` : ''} · ` : 'Handled · ') : ''}{a.body}
                    </span>
                  </span>
                </button>
                {/* Oct 12 client: Dismiss (open alerts) / Undo (dismissed ones) */}
                {!a.handled && (
                  <button onClick={() => void dismiss([a.id])} title="Dismiss" aria-label="Dismiss"
                          className="haptic shrink-0 px-2.5 text-muted hover:text-ink hover:bg-cream/60"><X size={15} /></button>
                )}
                {a.handled && a.dismissed && (
                  <button onClick={() => void undoDismiss(a.id)}
                          className="haptic shrink-0 px-3 text-[12px] font-bold text-sky hover:bg-cream/60">Undo</button>
                )}
              </div>
            ))}
            {handledRows.length > 0 && (
              <button onClick={() => setShowHandled((v) => !v)}
                      className="haptic w-full text-left px-3 py-2 text-[12px] font-bold text-muted hover:bg-cream/60">
                {showHandled ? 'Hide handled' : `${handledRows.length} handled — show`}
              </button>
            )}
          </div>
          <div className="p-3"><PhoneAlertsButton compact /></div>
        </div>
      )}

      {/* Toasts: upper-right, stay until dismissed. */}
      {toasts.length > 0 && (
        <div className="fixed top-4 right-4 z-[3000] flex flex-col gap-2 w-[min(360px,calc(100vw-32px))]">
          {toasts.slice(0, 3).map((a) => (
            <div key={a.id} className="rounded-[14px] border-2 border-sky bg-paper shadow-lift p-4">
              <div className="flex items-start gap-2">
                <div className="text-[18px]">{kindIcon(a.kind)}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-[14px]">{a.title}</div>
                  <div className="text-[13px] text-ink mt-1 whitespace-pre-wrap break-words">{a.body}</div>
                  <div className="flex gap-2 mt-3">
                    <button onClick={() => go(a)}
                            className="haptic text-[12px] font-bold bg-sky text-paper px-3 py-1.5 rounded-[8px]">
                      {a.kind === 'bug_report' ? 'Open problem reports →' : a.pickupId ? 'Open pickup →' : 'Open driver messages →'}{/* Oct 14 client */}
                    </button>
                    <button onClick={() => setToasts((t) => t.filter((x) => x.id !== a.id))}
                            className="haptic text-[12px] font-bold text-muted px-3 py-1.5 rounded-[8px] hover:bg-cream/60">
                      Dismiss
                    </button>
                  </div>
                </div>
                <button onClick={() => setToasts((t) => t.filter((x) => x.id !== a.id))} aria-label="Dismiss"
                        className="haptic text-muted hover:text-ink"><X size={16} /></button>
              </div>
            </div>
          ))}
          {toasts.length > 3 && (
            <button onClick={() => setToasts([])}
                    className="haptic self-end text-[12px] font-bold bg-paper border border-line rounded-full px-3 py-1 shadow-soft">
              +{toasts.length - 3} more · Dismiss all
            </button>
          )}
        </div>
      )}
    </div>
  );
}
