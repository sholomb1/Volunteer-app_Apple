/**
 * Oct 14 client: office Help — a "?" button in the portal header with
 *   • Welcome tour: 5–8 short steps (Next / Back / Skip), the real menu item
 *     is circled when it's on screen. Opens by itself once per user (saved on
 *     the server: GET /api/help/state, POST /api/help/tour-seen; plus localStorage).
 *   • Guide: every part of the office portal THIS user can see, 2–4 plain
 *     bullets each, with an "Open" button that goes there.
 *   • Report a problem (report-problem.tsx), and for admins: Problem reports.
 * Only the menu items in `tabs` (the user's visible menu) get a section.
 * Oct 14 client: a "NEW" badge + soft pulse on the ? button, and (desktop) a
 *   one-time hint "New: Help, guide & report a problem", until this user opens
 *   the ? menu once (server: GET /api/help/state newSeen, POST /api/help/new-seen;
 *   plus localStorage). The × on the hint only closes the hint.
 * Oct 14 client: "✨ What's new" in the ? menu for everyone (the What's new list in
 *   a pop-up; "Coming soon" releases only for admins). Each user's newest viewed
 *   liveAt is saved (GET /api/help/state whatsNewSeenAt, POST /api/help/whats-new-seen;
 *   plus localStorage) → "3 new" on the menu item and a dot on the ? button.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { api, getUser } from './api';
import { cx } from './design';
import { ReportProblemHost, openReportProblem, setReportPage, ProblemReportsModal } from './report-problem';
import { WhatsNewPanel, latestLiveAt, unseenCount } from './whats-new'; // Oct 14 client

type Bullet = string | { t: string; need?: string; admin?: boolean; write?: boolean };
type Section = {
  key: string; icon: string; title: string;
  tabs: string[];                         // shown if the user can see any of these
  open?: { tab: string; sub?: string; label?: string };
  bullets: Bullet[];
  links?: { tab: string; sub?: string; label: string }[];
  whatsNew?: boolean;                     // Oct 14 client: everyone; button opens What's new
};

const SECTIONS: Section[] = [
  {
    key: 'live', icon: '📋', title: 'Live Board', tabs: ['live'], open: { tab: 'live' },
    bullets: [
      'Every open pickup is a card. Tap a card to open the pickup. "Show covered pickups" also shows pickups that already have a driver.',
      'Tags on a card: ONE-TIME = a single pickup. STEADY = it repeats. 📱 STORE APP = the store sent it from its app. Reposted = it was put back in the queue (with when).',
      '"Will go to 23 drivers at 9:00 AM" = the next text. "Sent 2×" = drivers were already texted twice. Tap it to see who got the text, and why others did not.',
      { t: 'Buttons: Assign driver, Edit, Send SMS (asks before texting again), Repost (for a pickup whose time passed), Dismiss (close it, with a reason). "Waiting 3" at the top = past their time and still no driver.', write: true },
    ],
  },
  {
    key: 'new-pickup', icon: '➕', title: 'New pickup', tabs: ['live'], open: { tab: 'live', label: 'Go to Live Board' },
    bullets: [
      { t: 'Live Board → "+ Add Pickup" (top right).', write: true },
      'Type the store name and pick it: name, address and phone fill in. If it was used before, past contacts and addresses show — pick one or type someone else.',
      '"Use info from a previous pickup" copies an old pickup. You can find it by store, phone number or contact name.',
      '1-hour rule: a new pickup is texted at the top of the hour before its time (9:53 PM → 9:00 PM), or right away if that time passed. Tick "Text drivers now" to send it now.',
    ],
  },
  {
    key: 'pickup-drivers', icon: '🚗', title: 'Drivers on this pickup', tabs: ['live', 'pickups'],
    bullets: [
      '"Assign driver" (or "+ Add driver") shows everyone: recommended, on call and regulars first. Search by name or unit #.',
      'Taking a driver off a pickup texts the driver, and the pickup goes out again as new.',
      '"+ Someone not on our list": write down an outside helper who did the pickup. They never get our texts. One tap makes them a volunteer.',
    ],
  },
  {
    key: 'pickups', icon: '📅', title: 'Pickups', tabs: ['pickups'], open: { tab: 'pickups', sub: 'today' },
    bullets: [
      'Tabs: Today · List · Calendar · History (old pickups, 50 at a time, "Show more") · Steady (pickups that repeat) · Needs attention (time passed, no driver).',
      { t: 'Steady → "New steady pickup" (top right) adds a pickup that repeats every week. Edit a steady one: this time only, this and later, or the whole schedule.', write: true },
      'Food check: a steady pickup can text the store "Do you have food today?". YES sends it to drivers, NO cancels today, no answer = an alert to call the store.',
      { t: 'Duplicate copies a pickup to a new date and time.', write: true },
    ],
    links: [
      { tab: 'pickups', sub: 'attention', label: 'Needs attention' },
      { tab: 'pickups', sub: 'recurring', label: 'Steady' },
      { tab: 'pickups', sub: 'calendar', label: 'Calendar' },
    ],
  },
  {
    key: 'drivers', icon: '👥', title: 'Drivers', tabs: ['volunteers'], open: { tab: 'volunteers' },
    bullets: [
      'Tap a driver to open the profile: Overview (At a glance = a one-line summary and the last 30 days), Alerts & schedule, Sign-up info, Pickup history.',
      'Alerts & schedule: does this driver get pickup texts, and if not, why. Text groups, quiet times, away dates, steady pickups.',
      'On-call hours = "happy to be called". Pick "Weekdays (Mon–Thu)" or "Every day", or one day. "On call now" on the Live Board lists them; press "Log call" after you call.',
      { t: 'New sign-ups: new drivers waiting for review. Approve (Active + Default text group) or Not now.', need: 'signups' },
    ],
    links: [{ tab: 'signups', label: 'New sign-ups' }],
  },
  {
    key: 'suppliers', icon: '🏪', title: 'Suppliers (stores)', tabs: ['suppliers'], open: { tab: 'suppliers' },
    bullets: [
      'Tap a store for its profile: At a glance, usual drivers, days, steady schedule, what they usually give.',
      { t: 'New stores from the public form wait for you: press Approve to show them in store lists and on the kiosk.', write: true },
      { t: '"📍 Find missing locations" puts stores with no map spot on the map. You approve each one.', admin: true },
      'Texts to the store ("driver on the way", "picked up") have switches in each store profile. They are off unless you turn them on.',
    ],
  },
  {
    key: 'messaging', icon: '💬', title: 'Messaging', tabs: ['driver-messages', 'who-gets-texts', 'chat-stores', 'sms-combo', 'emails', 'texting-rules'],
    open: { tab: 'driver-messages', sub: 'texts' },
    bullets: [
      { t: 'Driver messages: Texts, App chat, Replies to pickup texts, and Code words (every word drivers can text — PICKUPS, INFO, DONE, CANCEL, STOP… — and who used it).', need: 'driver-messages' },
      { t: 'Who gets texts: who gets a text right now and who is quiet now, and why. "By time of day" shows any hour. Turn texts back on in one tap.', need: 'who-gets-texts' },
      { t: 'SMS Composer & Broadcast: "Upcoming" shows when the next automatic pickup text goes out. Compose a text to drivers or a group.', need: 'sms-combo' },
      { t: 'Emails: write a New email, Send now or Schedule it. "Automatic emails" lists the ones the system sends.', need: 'emails' },
    ],
    links: [
      { tab: 'driver-messages', sub: 'words', label: 'Code words' },
      { tab: 'who-gets-texts', label: 'Who gets texts' },
      { tab: 'texting-rules', label: 'How texting works' },
      { tab: 'sms-combo', label: 'Next text time (Upcoming)' },
    ],
  },
  {
    key: 'alerts', icon: '🔔', title: 'Alerts (the bell)', tabs: ['live', 'pickups', 'volunteers', 'suppliers', 'my-shift'],
    bullets: [
      'The bell at the top: a new text reply, a driver gave a pickup back, a store post with no driver after 15 min, a pickup starting within an hour with no driver, a reply not opened in 10 min.',
      'A new alert pops up with a beep. Tap it to open the pickup or the message.',
      'Alerts clear by themselves once handled (a driver took it, the text was answered). Dismiss / Dismiss all clears them for everyone in the office. Undo if it was a mistake.',
      '"Turn on phone alerts" is in the bell menu (on a phone, add the portal to the Home Screen first).',
    ],
  },
  {
    key: 'myshift', icon: '🕘', title: 'My Shift', tabs: ['my-shift'], open: { tab: 'my-shift' },
    bullets: [
      'Press Sign in when your shift starts, and Sign out when it ends.',
      'Phone alerts go to whoever is on duty, so sign in when you work.',
    ],
  },
  {
    key: 'shifts', icon: '🗓️', title: 'Dispatching Shifts', tabs: ['shifts'], open: { tab: 'shifts' },
    bullets: [
      'See the shifts as a week Calendar or a List. Open shifts (no dispatcher) are marked.',
      '"New shift" adds one shift. A Series repeats every week.',
      'Click a shift to edit or cancel it. A dispatcher can Sign in / Sign out of a shift.',
      'Dispatcher roster: who dispatches and their shifts.',
    ],
  },
  {
    key: 'tasks', icon: '✅', title: 'Tasks & follow-ups', tabs: ['tasks'], open: { tab: 'tasks' },
    bullets: [
      'One list of office to-dos: who it is for, due date, priority, notes and history.',
      'Problem reports from "Report a problem" show here too, titled "Bug report: …". Mark them Done when fixed.',
    ],
  },
  {
    key: 'reports', icon: '📊', title: 'Reports', tabs: ['reports'], open: { tab: 'reports' },
    bullets: [
      'Pick the dates (This week, This month, Last month, This year, All time, or From–To) and the status.',
      'The numbers at the top always match the filters. Search by store or driver.',
      'Export CSV downloads the list for Excel.',
    ],
  },
  {
    key: 'kiosk', icon: '🖥️', title: 'Kiosk', tabs: ['kiosk-activity', 'settings'],
    bullets: [
      'Drivers record their drop-off on the kiosk tablet.',
      'Kiosk mode: ⚙ on the kiosk start screen → Start kiosk mode (PIN). To leave it, tap 🔒 and enter the PIN.',
      { t: 'Admin → Settings: "Open the kiosk" and "Copy kiosk link". Admin → Activity → Kiosk Activity: every drop-off.', admin: true },
    ],
    links: [{ tab: 'kiosk-activity', label: 'Kiosk Activity' }, { tab: 'settings', label: 'Settings' }],
  },
  // Oct 14 client: "See what changed" → What's new (for everyone).
  {
    key: 'whats-new', icon: '✨', title: 'See what changed', tabs: [], whatsNew: true,
    bullets: [
      '"✨ What\'s new" in the ? menu lists every update to the portal, newest first, with the day it went live.',
      'A small dot on the ? button means there are updates you have not seen yet; the menu shows how many ("3 new"). Updates since your last look have a "New" tag.',
      'Tap an update with an arrow to read more about it.',
    ],
  },
  {
    key: 'help', icon: '❓', title: 'Help and Report a problem', tabs: ['change-password'],
    bullets: [
      'The ? button at the top opens this Guide and the short tour again.',
      'Something not working? "Report a problem" (in the ? menu, or at the bottom of the menu). Write what happened. The page and your device are sent by themselves.',
      'Your password: "Change password" in the menu.',
    ],
  },
];

const TOUR: { title: string; text: string; target?: string; need?: string }[] = [
  { title: "Welcome to the office portal 👋", text: 'This short tour shows the main parts. It takes 1 minute. You can open it again any time from the ? button at the top.' },
  { title: 'The menu', text: 'Everything is in the menu on the left (on a phone: ☰ at the top). You only see the parts you have access to.', target: 'nav' },
  { title: 'Live Board', text: 'All open pickups as cards. Tap a card to open it. Assign a driver, Edit, Send SMS or Dismiss right from the card.', target: 'Live Board', need: 'live' },
  { title: 'Pickups', text: 'Today, List, Calendar, History, Steady (repeating) and Needs attention (no driver yet).', target: 'Pickups', need: 'pickups' },
  { title: 'Drivers', text: 'Every driver: who gets texts and why, quiet times, on-call hours, and new sign-ups to approve.', target: 'Drivers', need: 'volunteers' },
  { title: 'Messaging', text: 'Driver texts and chat, code words, who gets texts, and sending texts.', target: 'Messaging', need: 'driver-messages' },
  { title: 'Alerts', text: 'The bell rings when something needs you: a reply, a driver gave a pickup back, a pickup with no driver. Dismiss when done.', target: 'bell' },
  // Oct 14 client: the last step points at the ? button.
  { title: 'Help any time', text: 'You can always find this guide here: the ? button at the top. It has this tour, the full Guide, and "Report a problem" if something does not work.', target: 'help' },
];

const ADMIN_ROLES = ['admin', 'staff', 'coordinator'];
const lsGet = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };
const seenKey = () => `zlz-help-tour-seen-${getUser()?.id ?? 'me'}`;
// Oct 14 client: "NEW" badge on the ? button (until the menu is opened once) + the hint's ×.
const newKey = () => `zlz-help-new-seen-${getUser()?.id ?? 'me'}`;
const hintKey = () => `zlz-help-hint-closed-${getUser()?.id ?? 'me'}`;
// Oct 14 client: newest "What's new" liveAt this user has viewed ('YYYY-MM-DDTHH:MM').
const wnKey = () => `zlz-whats-new-seen-${getUser()?.id ?? 'me'}`;
const STAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const laterStamp = (a: string | null | undefined, b: string | null | undefined) => {
  const x = a && STAMP.test(a) ? a : null; const y = b && STAMP.test(b) ? b : null;
  return !x ? y : !y ? x : (x > y ? x : y);
};
const NEW_CSS = `
@keyframes zlzHelpPulse { 0% { box-shadow: 0 0 0 0 rgb(var(--c-clay) / .55); } 70% { box-shadow: 0 0 0 9px rgb(var(--c-clay) / 0); } 100% { box-shadow: 0 0 0 0 rgb(var(--c-clay) / 0); } }
.zlz-help-pulse { animation: zlzHelpPulse 2.4s ease-out infinite; }
@media (prefers-reduced-motion: reduce) { .zlz-help-pulse { animation: none; box-shadow: 0 0 0 2px rgb(var(--c-clay) / .6); } }
`;

export function HelpMenu({ tabs, writeOk, pageLabel, onOpenTab }: {
  tabs: string[];                 // the tabs in this user's menu
  writeOk: boolean;
  pageLabel: string;              // page the user is on (sent with problem reports)
  onOpenTab: (tab: string, sub?: string) => void;
}) {
  const user = getUser();
  const isAdmin = ADMIN_ROLES.includes(String(user?.role ?? '').toLowerCase()) && tabs.includes('dispatchers-combo');
  const [menu, setMenu] = useState(false);
  const [view, setView] = useState<'tour' | 'guide' | 'reports' | 'whats-new' | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  // Oct 14 client: "NEW" badge + pulse, and the one-time hint (desktop).
  const [isNew, setIsNew] = useState(false);
  const [hint, setHint] = useState(false);
  // Oct 14 client: What's new — seen stamp (server + this device), and the stamp from
  // before this opening (items newer than it get a "New" tag in the pop-up).
  const [wnSeen, setWnSeen] = useState<string | null>(() => laterStamp(lsGet(wnKey()), null));
  const [wnReady, setWnReady] = useState(false);
  const [wnSince, setWnSince] = useState<string | null>(null);
  const unseen = wnReady ? unseenCount(wnSeen) : 0;
  useEffect(() => { setReportPage(pageLabel); }, [pageLabel]);
  // The bell's problem-report alert opens the list (office-alerts.tsx).
  useEffect(() => {
    const h = () => { if (isAdmin) setView('reports'); };
    window.addEventListener('zlz:problem-reports', h);
    return () => window.removeEventListener('zlz:problem-reports', h);
  }, [isAdmin]);

  // First time this user opens the portal (after this release): the tour, once.
  // Oct 14 client: the same call also says if the "NEW" badge was already seen.
  useEffect(() => {
    const tourDone = !!lsGet(seenKey());
    const newDone = !!lsGet(newKey());
    // Oct 14 client: always ask now (What's new seen stamp); tour/badge only if not done here.
    let alive = true;
    const showNew = () => { setIsNew(true); setHint(!lsGet(hintKey())); };
    api<{ tourSeen: boolean; newSeen?: boolean; whatsNewSeenAt?: string | null }>('/api/help/state')
      .then((r) => {
        if (!alive) return;
        if (!tourDone) {
          if (r?.tourSeen) lsSet(seenKey(), '1');
          else setView((v) => v ?? 'tour');
        }
        if (!newDone) {
          if (r?.newSeen) lsSet(newKey(), '1');
          else showNew();
        }
        // Oct 14 client: What's new — the later of the server and this device; resend if the server is behind.
        const srv = laterStamp(r?.whatsNewSeenAt, null);
        const loc = laterStamp(lsGet(wnKey()), null);
        const best = laterStamp(srv, loc);
        setWnSeen(best); setWnReady(true);
        if (best && best !== srv) api('/api/help/whats-new-seen', { method: 'POST', body: JSON.stringify({ seenAt: best }) }).catch(() => {});
      })
      .catch(() => { if (alive) { if (!newDone) showNew(); setWnReady(true); } /* offline: tour next time; badge + What's new from localStorage */ });
    return () => { alive = false; };
  }, []);
  const markNewSeen = () => {
    setIsNew(false); setHint(false);
    if (lsGet(newKey())) return;
    lsSet(newKey(), '1');
    api('/api/help/new-seen', { method: 'POST' }).catch(() => {});
  };
  const closeHint = () => { setHint(false); lsSet(hintKey(), '1'); };
  // Oct 14 client: open What's new → everything live is now seen.
  const openWhatsNew = () => {
    setMenu(false);
    setWnSince(wnSeen);
    setView('whats-new');
    const top = latestLiveAt();
    if (top && (!wnSeen || top > wnSeen)) {
      setWnSeen(top); lsSet(wnKey(), top);
      api('/api/help/whats-new-seen', { method: 'POST', body: JSON.stringify({ seenAt: top }) }).catch(() => {});
    }
  };
  const markSeen = () => {
    if (lsGet(seenKey())) return;
    lsSet(seenKey(), '1');
    api('/api/help/tour-seen', { method: 'POST' }).catch(() => {});
  };

  useEffect(() => {
    if (!menu) return;
    const h = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setMenu(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [menu]);

  const item = 'w-full text-left px-3 py-2 rounded-[9px] text-[14px] font-bold text-ink hover:bg-cream flex items-center gap-2';
  return (
    <div className="relative" ref={boxRef}>
      <button data-help-button onClick={() => { if (isNew) markNewSeen(); setMenu((v) => !v); }}
              aria-label={(isNew ? 'Help (new)' : 'Help') + (unseen > 0 ? `, ${unseen} new updates` : '')} title="Help"
              className={cx('haptic grid h-9 w-9 place-items-center rounded-full border border-line bg-paper hover:bg-cream text-[16px] font-extrabold text-ink', isNew && 'zlz-help-pulse')}>
        ?
      </button>
      {/* Oct 14 client: dot = What's new has updates this user hasn't seen (separate from NEW). */}
      {unseen > 0 && (
        <span data-help-wn-dot aria-hidden="true"
              className="pointer-events-none absolute -top-0.5 -left-0.5 h-2.5 w-2.5 rounded-full bg-clay ring-2 ring-paper" />
      )}
      {/* Oct 14 client: "NEW" badge + pulse until the ? menu is opened once. */}
      {isNew && (
        <>
          <style>{NEW_CSS}</style>
          <span data-help-new-badge aria-hidden="true"
                className="pointer-events-none absolute -top-2 -right-3 rounded-full bg-clay px-1.5 text-[9.5px] font-extrabold leading-[15px] tracking-[.04em] text-white shadow-sm">
            NEW
          </span>
        </>
      )}
      {/* Oct 14 client: one-time hint next to the ? (desktop only). */}
      {isNew && hint && !menu && (
        <div data-help-new-hint role="status"
             className="hidden md:flex absolute right-0 top-full mt-2.5 z-[1500] items-center gap-2 whitespace-nowrap rounded-[10px] bg-ink text-paper pl-3 pr-1.5 py-1.5 text-[12.5px] font-bold shadow-lift">
          <span className="absolute -top-1 right-3.5 h-2.5 w-2.5 rotate-45 bg-ink" aria-hidden="true" />
          <span>New: Help, guide &amp; report a problem</span>
          <button onClick={closeHint} aria-label="Close hint" className="haptic grid h-6 w-6 place-items-center rounded-full text-[14px] leading-none hover:bg-white/15">×</button>
        </div>
      )}
      {menu && (
        <div className="absolute right-0 top-full mt-2 z-[1600] w-[240px] rounded-[12px] border border-line bg-paper shadow-lift p-1.5">
          <button className={item} onClick={() => { setMenu(false); setView('guide'); }}>📖 Guide: how to use the portal</button>
          {/* Oct 14 client: What's new for everyone, with the unseen count. */}
          <button className={item} data-help-whats-new onClick={openWhatsNew}>
            <span>✨ What&apos;s new</span>
            {unseen > 0 && <span data-help-wn-count className="ml-auto shrink-0 rounded-full bg-clay px-2 py-0.5 text-[11px] font-extrabold leading-[15px] text-white">{unseen > 9 ? '9+' : unseen} new</span>} {/* Oct 14 client: cap 9+ */}
          </button>
          <button className={item} onClick={() => { setMenu(false); setView('tour'); }}>👋 Welcome tour</button>
          <button className={item} onClick={() => { setMenu(false); openReportProblem(); }}>🐞 Report a problem</button>
          {isAdmin && <button className={item} onClick={() => { setMenu(false); setView('reports'); }}>📥 Problem reports</button>}
        </div>
      )}
      {view === 'tour' && <TourModal tabs={tabs} onClose={() => { markSeen(); setView(null); }} onGuide={() => { markSeen(); setView('guide'); }} />}
      {view === 'guide' && (
        <GuideModal tabs={tabs} isAdmin={isAdmin} writeOk={writeOk} role={String(user?.role ?? '')}
                    onClose={() => setView(null)}
                    onGo={(t, s) => { setView(null); onOpenTab(t, s); }}
                    onTour={() => setView('tour')}
                    onWhatsNew={openWhatsNew} />
      )}
      {view === 'whats-new' && <WhatsNewModal isAdmin={isAdmin} newSince={wnSince} onClose={() => setView(null)} />}
      {view === 'reports' && <ProblemReportsModal onClose={() => setView(null)} onOpenTasks={tabs.includes('tasks') ? () => { setView(null); onOpenTab('tasks'); } : undefined} />}
      <ReportProblemHost />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tour
// ---------------------------------------------------------------------------
function findTarget(target?: string): HTMLElement | null {
  if (!target) return null;
  const visible = (el: Element | null): el is HTMLElement => !!el && (el as HTMLElement).offsetParent !== null
    && (el as HTMLElement).getBoundingClientRect().width > 0;
  if (target === 'help') { const el = document.querySelector('[data-help-button]'); return visible(el) ? el : null; }
  if (target === 'bell') { const el = document.querySelector('button[title="Alerts"]'); return visible(el) ? el : null; }
  if (target === 'nav') { const el = document.querySelector('aside nav'); return visible(el) ? el : null; }
  for (const b of Array.from(document.querySelectorAll('aside nav button'))) {
    if (visible(b) && (b.textContent ?? '').trim().startsWith(target)) return b;
  }
  return null;
}

function TourModal({ tabs, onClose, onGuide }: { tabs: string[]; onClose: () => void; onGuide: () => void }) {
  const steps = useMemo(() => TOUR.filter((s) => !s.need || tabs.includes(s.need)), [tabs]);
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const step = steps[Math.min(i, steps.length - 1)]!;
  const last = i >= steps.length - 1;
  useLayoutEffect(() => {
    const upd = () => setRect(findTarget(step.target)?.getBoundingClientRect() ?? null);
    upd();
    window.addEventListener('resize', upd);
    return () => window.removeEventListener('resize', upd);
  }, [i, step.target]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') setI((n) => Math.min(n + 1, steps.length - 1));
      else if (e.key === 'ArrowLeft') setI((n) => Math.max(n - 1, 0));
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [steps.length]);

  // Card next to the circled item when there is room, else in the middle.
  const W = 360;
  let pos: CSSProperties ={ left: '50%', top: '50%', transform: 'translate(-50%, -50%)' };
  if (rect && window.innerWidth >= 700) {
    if (rect.right + W + 32 < window.innerWidth && rect.left < window.innerWidth / 3) {
      pos = { left: rect.right + 20, top: Math.max(16, Math.min(rect.top - 20, window.innerHeight - 300)) };
    } else if (rect.bottom + 260 < window.innerHeight) {
      pos = { left: Math.max(16, Math.min(rect.right - W, window.innerWidth - W - 16)), top: rect.bottom + 16 };
    }
  }
  const pad = 6;
  return createPortal(
    <div className="fixed inset-0 z-[3000]" role="dialog" aria-modal="true" aria-label="Welcome tour" data-help-tour>
      {rect ? (
        <div className="fixed rounded-[12px] ring-4 ring-amber pointer-events-none transition-all"
             style={{ left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2,
                      boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)' }} />
      ) : <div className="fixed inset-0 bg-black/45" />}
      <div className="fixed w-[min(360px,calc(100vw-24px))] rounded-[16px] bg-paper border border-line shadow-lift p-5" style={pos}>
        <div className="text-[11.5px] font-extrabold uppercase tracking-[.06em] text-muted">Step {i + 1} of {steps.length}</div>
        <div className="mt-1 font-display font-semibold text-[19px] text-ink">{step.title}</div>
        <div className="mt-2 text-[14.5px] leading-[1.45] text-ink">{step.text}</div>
        <div className="mt-3 flex gap-1">
          {steps.map((_, n) => <span key={n} className={cx('h-1.5 flex-1 rounded-full', n <= i ? 'bg-forest' : 'bg-line')} />)}
        </div>
        <div className="mt-4 flex items-center gap-2">
          <button onClick={onClose} className="haptic text-[13px] font-bold text-muted hover:text-ink px-1">Skip</button>
          <span className="flex-1" />
          {i > 0 && <button onClick={() => setI(i - 1)} className="haptic rounded-[10px] border border-line px-3 py-1.5 text-[13.5px] font-bold text-ink hover:bg-cream">Back</button>}
          {last ? (
            <>
              <button onClick={onGuide} className="haptic rounded-[10px] border border-forest px-3 py-1.5 text-[13.5px] font-bold text-forest hover:bg-sage/50">Open the Guide</button>
              <button onClick={onClose} className="haptic rounded-[10px] bg-forest px-4 py-1.5 text-[13.5px] font-bold text-paper">Done</button>
            </>
          ) : (
            <button onClick={() => setI(i + 1)} className="haptic rounded-[10px] bg-forest px-4 py-1.5 text-[13.5px] font-bold text-paper">Next</button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// Guide
// ---------------------------------------------------------------------------
function GuideModal({ tabs, isAdmin, writeOk, role, onClose, onGo, onTour, onWhatsNew }: {
  tabs: string[]; isAdmin: boolean; writeOk: boolean; role: string;
  onClose: () => void; onGo: (tab: string, sub?: string) => void; onTour: () => void;
  onWhatsNew?: () => void;   // Oct 14 client
}) {
  const [q, setQ] = useState('');
  const has = (t: string) => tabs.includes(t);
  const sections = useMemo(() => SECTIONS
    .filter((s) => s.whatsNew || s.tabs.some(has)) // Oct 14 client: What's new is for everyone
    .map((s) => ({
      ...s,
      bullets: s.bullets.map((b) => (typeof b === 'string' ? { t: b } : b))
        .filter((b) => (!b.need || has(b.need)) && (!b.admin || isAdmin) && (!b.write || writeOk)),
      links: (s.links ?? []).filter((l) => has(l.tab)),
      open: s.open && has(s.open.tab) ? s.open : undefined,
    }))
    .filter((s) => s.bullets.length > 0)
    .filter((s) => {
      const n = q.trim().toLowerCase();
      return !n || s.title.toLowerCase().includes(n) || s.bullets.some((b) => b.t.toLowerCase().includes(n));
    }), [tabs, isAdmin, writeOk, q]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);
  const roleName = role === 'dispatcher' ? 'Dispatcher' : role === 'admin' ? 'Admin' : role ? role[0]!.toUpperCase() + role.slice(1) : 'Office';
  const jump = (key: string) => document.getElementById(`help-sec-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return createPortal(
    <div className="fixed inset-0 z-[3000] bg-black/40 grid place-items-center p-2 sm:p-4" role="dialog" aria-modal="true" aria-label="How to use the office portal" data-help-guide>
      <div className="w-full max-w-[860px] h-[94vh] flex flex-col rounded-[16px] bg-paper shadow-lift border border-line">
        <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3 border-b border-line">
          <div>
            <div className="font-display font-semibold text-[20px] text-ink">📖 How to use the office portal</div>
            <div className="text-[12.5px] text-muted">You are signed in as <b>{roleName}</b>. This guide shows only the parts you can use.</div>
          </div>
          <button onClick={onClose} aria-label="Close" className="haptic h-9 w-9 shrink-0 grid place-items-center rounded-full hover:bg-cream text-[18px]">✕</button>
        </div>
        <div className="px-5 py-3 flex flex-wrap items-center gap-2 border-b border-line">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the guide…" aria-label="Search the guide"
                 className="flex-1 min-w-[180px] rounded-[10px] border border-line bg-paper px-3 py-1.5 text-[14px] focus:outline-none focus:border-forest" />
          <button onClick={onTour} className="haptic rounded-[10px] border border-line px-3 py-1.5 text-[13px] font-bold text-ink hover:bg-cream">👋 Tour</button>
          <button onClick={() => { onClose(); openReportProblem(); }} className="haptic rounded-[10px] border border-line px-3 py-1.5 text-[13px] font-bold text-ink hover:bg-cream">🐞 Report a problem</button>
        </div>
        <div className="flex-1 min-h-0 flex">
          <nav className="hidden md:block w-[210px] shrink-0 overflow-y-auto border-r border-line p-2">
            {sections.map((s) => (
              <button key={s.key} onClick={() => jump(s.key)} className="w-full text-left px-2.5 py-1.5 rounded-[8px] text-[13.5px] font-bold text-ink hover:bg-cream">
                <span className="mr-1.5">{s.icon}</span>{s.title}
              </button>
            ))}
          </nav>
          <div className="flex-1 min-w-0 overflow-y-auto px-5 py-4 space-y-4">
            {sections.length === 0 && <div className="text-[14px] text-muted">Nothing found for "{q}".</div>}
            {sections.map((s) => (
              <section key={s.key} id={`help-sec-${s.key}`} className="rounded-[14px] border border-line bg-paper px-4 py-3 scroll-mt-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-display font-semibold text-[17px] text-ink"><span className="mr-1.5">{s.icon}</span>{s.title}</h3>
                  <span className="flex-1" />
                  {s.open && (
                    <button onClick={() => onGo(s.open!.tab, s.open!.sub)}
                            className="haptic rounded-[9px] bg-forest px-3 py-1 text-[12.5px] font-bold text-paper">{s.open.label ?? 'Open'} →</button>
                  )}
                  {s.whatsNew && onWhatsNew && (
                    <button onClick={onWhatsNew}
                            className="haptic rounded-[9px] bg-forest px-3 py-1 text-[12.5px] font-bold text-paper">Open What&apos;s new →</button>
                  )}
                </div>
                <ul className="mt-2 space-y-1.5 text-[14.5px] leading-[1.45] text-ink list-disc pl-5">
                  {s.bullets.map((b, n) => <li key={n}>{b.t}</li>)}
                </ul>
                {s.links.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {s.links.map((l) => (
                      <button key={l.label} onClick={() => onGo(l.tab, l.sub)}
                              className="haptic rounded-full border border-forest/40 bg-sage/40 px-3 py-1 text-[12.5px] font-bold text-forest hover:bg-sage">
                        {l.label} →
                      </button>
                    ))}
                  </div>
                )}
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// Oct 14 client: What's new (the same list as Admin → Activity → What's new), read-only.
// ---------------------------------------------------------------------------
function WhatsNewModal({ isAdmin, newSince, onClose }: { isAdmin: boolean; newSince: string | null; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);
  return createPortal(
    <div className="fixed inset-0 z-[3000] bg-black/40 grid place-items-center p-2 sm:p-4" role="dialog" aria-modal="true" aria-label="What's new" data-help-whats-new-modal
         onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-[860px] h-[94vh] flex flex-col rounded-[16px] bg-paper shadow-lift border border-line">
        <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3 border-b border-line">
          <div>
            <div className="font-display font-semibold text-[20px] text-ink">✨ What&apos;s new</div>
            <div className="text-[12.5px] text-muted">Every update to the portal, newest first. &quot;New&quot; = came out since you last looked.</div>
          </div>
          <button onClick={onClose} aria-label="Close" className="haptic h-9 w-9 shrink-0 grid place-items-center rounded-full hover:bg-cream text-[18px]">✕</button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto bg-cream/30 px-3 py-3 sm:px-5 sm:py-4">
          <WhatsNewPanel mode="menu" showComingSoon={isAdmin} isAdmin={isAdmin} newSince={newSince} />
        </div>
      </div>
    </div>,
    document.body,
  );
}
