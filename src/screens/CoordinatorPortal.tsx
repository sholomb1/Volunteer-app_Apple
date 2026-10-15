/**
 * Coordinator portal — desktop, matches mockup 03.
 *
 * Layout:  [forest-deep left nav 212px] [main: top bar + (map | feed pane)]
 * Nav:     Live Board / Pickups / Volunteers / Suppliers / Map / Reports
 *          + Places list with active/paused dots
 * Main:    map shows pickup pins; feed pane shows date-grouped pickups with
 *          slot avatars, status pills, assign-driver button.
 *
 * Role-gated to admin/coordinator. Mobile route /portal redirects to the
 * Volunteer home so this stays desktop-only as designed.
 */
import { DriverRepliesPanel, ExpiredReviewSection, NotCheckedInSection, CodeWordsPanel } from '../profiles'; // Oct 11 client: + Code words
import { uiConfirm, uiNotify } from '../ui-dialogs';
import { cancelledLine } from '../cancelled-by'; // Oct 14 client: who cancelled
import { useMemo, useState, Suspense } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import L from 'leaflet';
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { LayoutGrid, Calendar, Users, Store, BarChart3, LogOut, MessageSquare, ClipboardList, Settings, ShieldCheck, X, MapPin } from 'lucide-react';
import { adminCRUD, adminSmsPause, api, apiAssetUrl, getToken, setAuth, setSmsOverrideFor, smsOverrideUntil, broadcast, canSeeTab, canWrite, dispatcherShifts, dm, getUser, location as locationApi, smsThreads, onDuty, sse, uncoveredAlerts, upcomingSms, type DispShiftSlot, type DispWeeklyRow, type SignupRow } from '../api';
import { sendPickupNowConfirmed } from '../pickup-send-now';
import { smsReasonText, textedText } from '../sms-reason';
import { OnCallNowCard } from '../on-call';
import { cx, SearchBar, DateInput, DisplayToggles, Tip } from '../design';
import { ChatThread } from '../chat-thread';
import { SuppliersPanel, VolunteersPanel, SteadyPickupsPanel, AppUsagePanel, KioskActivityPanel, SettingsPanel, NeighborhoodsPanel, CoveragePanel, QuickPickupModal, ChangePasswordPanel, BroadcastPanel, SmsComposerPanel, SmsGroupsPanel, SmsThreadsPanel, SmsDispatchersPanel, DispatchersPanel, DispatchersRosterPanel, SupplierForm, SteadyForm, ShiftsPanel, CenterHelpStandalonePanel, UpcomingSmsPanel, WhatsappAdminPanel, WaThreadsPanel, JewishCalendarPanel } from '../portal-sections';
import { openVolunteerOnTab } from '../portal-sections'; // Oct 11 client
import { WhoGetsTextsPanel } from '../who-gets-texts'; // Oct 11 client: Messaging → Who gets texts
import { HowTextingWorksPanel } from '../texting-rules'; // Oct 14 client: Messaging → How texting works
import { PickupTextLines } from '../text-recipients'; // Oct 11 client: who got the pickup text; Oct 12: next text + times sent on the card
import { EmailsPanel } from '../emails-panel';
import { DonationsPanel } from '../donations-panel';
// Tabbed wrapper components consolidating the "Chat" and "Admin" sub-items
// (batch abc820 Aug 11 · nav consolidation). Defined below in this file.
import { ProspectsPanel, NeedsConfirmationSection } from '../prospects-and-confirmation';
import { RecruitingPanel } from '../crm-sections';
import { TasksPanel } from '../tasks-panel';
import { MyShiftPanel } from '../my-shift-panel';
import { DispatcherAttendancePanel } from '../dispatcher-attendance';
import { lazyNamed } from '../lazy-load';
// Oct 11 client: speed — Reports (charts) loads when opened.
const ReportsPanel = lazyNamed(() => import('../reports-panel'), 'ReportsPanel');
import { readCoordNav, writeCoordNav, patchCoordNav } from '../nav-state';
import { CalendarPanel } from './CalendarPanel';
import { AdminPickupDetail, RepostButton } from './AdminPickupDetail';
import { StorePhotoThumb } from '../store-photo'; // Oct 14 client
import { Plus, KeyRound, UserPlus2 } from 'lucide-react'; // Inbox: Food Donations nav (hidden Oct 8)
import { nyToday, fmtDateTimeEastern, fmtDay, repostedLabel, isPastDueNy } from '../time-format';
import { WhatsNewPanel } from '../whats-new';
import { StoreTextLines } from '../food-check'; // Oct 13 client: food check / donor told / CANCEL on the card
import { SignupsPanel, SignupsBadge } from '../signups-panel'; // Oct 11 client: New sign-ups inbox
import { OfficeAlertsBell, PhoneAlertsButton } from '../office-alerts'; // Oct 11 client: dispatcher alerts
import { HelpMenu } from '../help-guide'; // Oct 14 client: Help (?) — welcome tour + guide
import { ReportProblemLink } from '../report-problem'; // Oct 14 client: Report a problem
import { submittedByLabel } from '../submitted-by'; // Oct 14 client: who filled out the form

type TabKey = 'my-shift' | 'holiday-sms' | 'tasks' | 'calendar' | 'live' | 'pickups' | 'volunteers' | 'suppliers' | 'reports' | 'chat-stores' | 'chat-volunteers' | 'sms-combo' | 'dispatchers-combo' | 'steady' | 'shifts' | 'center-help' | 'settings' | 'neighborhoods' | 'coverage' | 'change-password' | 'recruiting' | 'prospects' | 'app-usage' | 'kiosk-activity' | 'driver-replies' | 'emails' | 'donations' | 'driver-messages' | 'whats-new' | 'signups' | 'who-gets-texts' | 'texting-rules'; // Oct 11 client: + New sign-ups, + Who gets texts; Oct 14 client: + How texting works
// Oct 9 client: one "Driver messages" inbox — Texts / App chat / Replies to pickup texts.
// Oct 11 client: + Code words (every word drivers can text, and who used it).
type DmSub = 'texts' | 'chat' | 'replies' | 'words';
const DM_SUBS: DmSub[] = ['texts', 'chat', 'replies', 'words'];
// The Driver messages page uses the same access as the pages it replaced.
// Oct 11 client: New sign-ups uses the same access as Drivers.
const tabPerm = (k: string) => ((k === 'driver-messages' || k === 'who-gets-texts' || k === 'texting-rules') ? 'driver-replies' : k === 'signups' ? 'volunteers' : k);

// Oct 11 client: hidden = never shown in any menu (old links still work and redirect).
const NAV_ITEMS: { key: TabKey; label: string; icon: any; section?: 'top' | 'chat' | 'admin'; hidden?: boolean }[] = [
  // client Aug 13 (C6) — Live Board is the default landing again; Calendar
  // sits as a secondary page after Pickups. Reversal of the Aug 12 change
  // that promoted Calendar to first — client asked for the original order.
  { key: 'live',           label: 'Live Board',     icon: LayoutGrid,    section: 'top' },
  { key: 'pickups',        label: 'Pickups',        icon: Calendar,      section: 'top' },
  // Oct 8: hidden until the donate@ inbox goes live (client). Uncomment to bring back.
  // { key: 'donations',      label: 'Food Donations', icon: Inbox,         section: 'top' }, // Oct 7 client
  // Oct 2 client fix (UI plan §3): Calendar + Steady Pickups now live inside
  // Pickups as views (Calendar / Recurring). Old #coord/calendar and
  // #coord/steady links are redirected below.
  { key: 'volunteers',     label: 'Drivers',        icon: Users,         section: 'top' }, // Oct 9 client: was "Volunteers" 
  { key: 'signups',        label: 'New sign-ups',   icon: UserPlus2,     section: 'top' }, // Oct 11 client: approve new drivers
  { key: 'suppliers',      label: 'Suppliers',      icon: Store,         section: 'top' },
  { key: 'prospects',      label: 'Prospects',      icon: UserPlus2,     section: 'top' },
  { key: 'shifts',         label: 'Dispatching Shifts', icon: Calendar,  section: 'top' },
  { key: 'center-help',    label: 'Center Help',    icon: Calendar,      section: 'top' },
  { key: 'coverage',       label: 'Coverage map',   icon: ShieldCheck,   section: 'top' }, // Oct 9 client: one name
  { key: 'my-shift',       label: 'My Shift',       icon: Calendar,      section: 'top' }, // Oct 2: dispatchers only
  { key: 'tasks',          label: 'Tasks & follow-ups', icon: ClipboardList, section: 'top' }, // Oct 2: Task Management (UI plan §6)
  { key: 'recruiting',     label: 'Recruiting',     icon: UserPlus2,     section: 'top' },
  { key: 'reports',        label: 'Reports',        icon: BarChart3,     section: 'top' },
  // Chat section — consolidated from 6+ items to 3.
  { key: 'chat-stores',    label: 'Chat: Stores',      icon: MessageSquare, section: 'chat' },
  { key: 'driver-messages',label: 'Driver messages',   icon: MessageSquare, section: 'chat' }, // Oct 9 client
  { key: 'who-gets-texts', label: 'Who gets texts',    icon: MessageSquare, section: 'chat' }, // Oct 11 client: everyone on/off texts and why
  { key: 'texting-rules',  label: 'How texting works', icon: MessageSquare, section: 'chat' }, // Oct 14 client: all the texting rules in plain words
  // Oct 11 client: only "Driver messages" shows in the menus; these two are its tabs now.
  { key: 'driver-replies', label: 'Driver replies',    icon: MessageSquare, section: 'chat', hidden: true }, // Oct 5 client
  { key: 'chat-volunteers',label: 'Chat: Drivers',     icon: MessageSquare, section: 'chat', hidden: true },
  { key: 'sms-combo',      label: 'SMS Composer & Broadcast', icon: MessageSquare, section: 'chat' },
  { key: 'emails',         label: 'Emails',            icon: MessageSquare, section: 'chat' }, // Oct 7 client
  // Admin section — Dispatchers combines "Manage dispatchers" + "Driver-reply SMS".
  { key: 'dispatchers-combo', label: 'Dispatchers',   icon: ShieldCheck,   section: 'admin' },
  // Aug 23 client fix 4: Office Sign-In removed from nav. Legacy tool the
  // client no longer uses; Kiosk Activity replaces it.
  { key: 'kiosk-activity', label: 'Kiosk Activity', icon: ClipboardList, section: 'admin' },
  { key: 'whats-new',      label: "What's new",     icon: ClipboardList, section: 'admin' }, // Oct 9 client: dated list of every update
  { key: 'app-usage',      label: 'App Usage',      icon: BarChart3,     section: 'admin' },
  // Oct 2 client fix: Neighborhoods tucked away under Admin (UI plan §9).
  { key: 'neighborhoods',  label: 'Neighborhoods',  icon: MapPin,        section: 'admin' },
  { key: 'holiday-sms',    label: 'Holiday & SMS Controls', icon: ShieldCheck, section: 'admin' }, // Oct 2 (UI plan §9)
  { key: 'settings',       label: 'Settings',       icon: Settings,      section: 'admin' },
  { key: 'change-password',label: 'Change password',icon: KeyRound,      section: 'admin' },
];

// Oct 2 client fix (UI plan §1): the nine-item main menu. Each item groups
// one or more existing sections; groups with several show a tab strip at the
// top of the page. NAV_ITEMS stays the source of truth for permissions,
// labels and URL-hash restore.
const NAV_GROUPS: { key: string; label: string; icon: any; tabs: TabKey[] }[] = [
  { key: 'live',       label: 'Live Board',      icon: LayoutGrid,    tabs: ['live'] },
  { key: 'pickups',    label: 'Pickups',         icon: Calendar,      tabs: ['pickups'] },
  // Oct 8: hidden until the donate@ inbox goes live (client). Uncomment to bring back.
  // { key: 'donations',  label: 'Food Donations',  icon: Inbox,         tabs: ['donations'] }, // Oct 7 client
  { key: 'volunteers', label: 'Drivers',         icon: Users,         tabs: ['volunteers', 'signups'] }, // Oct 11 client: + New sign-ups tab
  { key: 'suppliers',  label: 'Suppliers',       icon: Store,         tabs: ['suppliers'] },
  { key: 'map',        label: 'Coverage map',    icon: MapPin,        tabs: ['coverage'] },
  { key: 'myshift',    label: 'My Shift',        icon: Calendar,      tabs: ['my-shift'] },
  { key: 'tasks',      label: 'Tasks & follow-ups', icon: ClipboardList, tabs: ['tasks', 'recruiting', 'prospects'] },
  { key: 'reports',    label: 'Reports',         icon: BarChart3,     tabs: ['reports'] },
  // Oct 9 client: Driver replies + Chat: Drivers + SMS threads are one item with tabs inside.
  // Oct 11 client: back to ONE "Messaging" item (as before Oct 9); Driver messages is its first tab.
  { key: 'messaging',  label: 'Messaging',       icon: MessageSquare, tabs: ['driver-messages', 'who-gets-texts', 'texting-rules', 'chat-stores', 'sms-combo', 'emails'] }, // Oct 11 client: + Who gets texts; Oct 14 client: + How texting works
  // Oct 9 client: Change password lives only here (was also under Admin).
  { key: 'password',   label: 'Change password', icon: KeyRound,      tabs: ['change-password'] },
  { key: 'admin',      label: 'Admin',           icon: Settings,      tabs: ['dispatchers-combo', 'shifts', 'center-help', 'holiday-sms', 'kiosk-activity', 'app-usage', 'whats-new', 'settings', 'neighborhoods'] },
];
const groupOfTab = (t: TabKey) => NAV_GROUPS.find((g) => g.tabs.includes(t));
// Oct 5 client (declutter #5): Admin's 9 tabs shown as 3 groups.
const ADMIN_SUBGROUPS: { label: string; tabs: TabKey[] }[] = [
  { label: 'People',   tabs: ['dispatchers-combo', 'shifts', 'center-help'] },
  { label: 'Activity', tabs: ['kiosk-activity', 'app-usage', 'whats-new'] },
  { label: 'Settings', tabs: ['holiday-sms', 'settings', 'neighborhoods'] },
];

// Valid section keys for URL-hash restore (client Sep 2 refresh-persistence).
const VALID_TABS = new Set<TabKey>(NAV_ITEMS.map((it) => it.key));

type PiRow = {
  id: number; scheduled_date: string; scheduled_time: string; status: string;
  suppliers: string | null; supplier_address: string | null;
  supplier_city?: string | null; supplier_logo_url?: string | null;
  estimated_quantity?: string | null;
  // One-time-pickup fields (present when no supplier_id is attached to the row).
  contact_name: string | null; contact_phone: string | null;
  pickup_address: string | null;
  is_one_time?: boolean;
  // xyz122 test-mode flag: TRUE = coordinator created this as a dry-run.
  // Backend hides it from every driver-facing surface; the Live Board shows
  // a small TEST badge next to the label so the office can spot it.
  is_test?: boolean;
  ref_number?: string | null;
  posted_via_supplier?: boolean;
  requeued_at?: string | null; // Oct 13 client: last "Put back in queue" (audit_log 'requeue')
  must_pickup_by?: string | null;
  notes: string | null; food_description: string | null; slots_capacity: number;
  signups?: SignupRow[];
  // For instances materialized from a steady_pickup template: the template's
  // name (e.g. "Bites cafe"). Used as a card-label fallback when the template
  // has no supplier attached, so the card doesn't read as "One-time pickup."
  steady_pickup_id?: number | null;
  steady_name?: string | null;
  // Oct 2 client fix: closed-state details from the list API, used for the
  // "Completed – no kiosk sign-in" / "Needs review" / "Expired" labels.
  cancelled_at?: string | null;
  cancellation_reason?: string | null;
  completion_notes?: string | null;
};
type Place = { id: number; name: string; status: string };

export function CoordinatorPortal() {
  // Oct 14 client: phone tap sizes for the office only (index.css body.zlz-office).
  useEffect(() => { document.body.classList.add('zlz-office'); return () => document.body.classList.remove('zlz-office'); }, []);
  const user = getUser();
  // Read-only staff (viewer / read_only) can browse the portal but can't
  // trigger writes. Hide destructive/creation UI when write isn't allowed.
  const writeOk = canWrite(user?.role);
  // Sep 4: dispatcher role-scoping. Hide donations/reports/admin-settings
  // panels for role='dispatcher' — server enforces the same, this is UX.
  const visibleNav = NAV_ITEMS.filter((it) => canSeeTab(user?.role, tabPerm(it.key)));
  const visibleTabs = new Set<TabKey>(visibleNav.map((it) => it.key));
  const isDispatcherRole = String(user?.role ?? '').toLowerCase() === 'dispatcher'
    || (Array.isArray(user?.accessSections) && user!.accessSections!.length > 0 && !user!.accessSections!.includes('admin'));
  const visibleGroups = NAV_GROUPS
    // Oct 11 client: hidden items (old Driver replies / Chat: Drivers) never reach the sidebar or phone menu.
    .map((g) => ({ ...g, tabs: g.key === 'admin' && isDispatcherRole ? [] : g.tabs.filter((t) => visibleTabs.has(t) && !NAV_ITEMS.find((it) => it.key === t)?.hidden) }))
    .filter((g) => g.tabs.length > 0);
  // C1 Aug 13 — pickup detail is now a modal (see modalPickupId), no route
  // navigation from Live Board rows. useNavigate() call removed.
  const qc   = useQueryClient();
  // Refresh-persistence (client Sep 2): restore the section from the URL hash
  // so a reload stays put instead of bouncing to the Live Board. See nav-state.
  const [tab, setTab] = useState<TabKey>(() => {
    const n = readCoordNav();
    const legacy = n.tab === 'calendar' || n.tab === 'steady';
    const wanted = legacy ? 'pickups'
      : (n.tab && VALID_TABS.has(n.tab as TabKey)) ? (n.tab as TabKey) : 'live';
    // Sep 4: if the deep-link points at a tab this role can't see, fall
    // back to a tab this role CAN see. Sep 10: dispatchers can't see
    // 'live' either, so pick the first allowed tab (Members) for them.
    if (canSeeTab(user?.role, tabPerm(wanted))) return wanted;
    if (canSeeTab(user?.role, 'live')) return 'live';
    return 'volunteers';
  });
  // Issue #17 Aug 10: hide fully-covered pickups from the default Live Board;
  // dispatcher can toggle "Show covered" to reveal them.
  const [showCoveredOnLive, setShowCoveredOnLive] = useState(false);
  const [pickerFor, setPickerFor] = useState<PiRow | null>(null);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [editingPickup, setEditingPickup] = useState<PiRow | null>(null);
  const [duplicatingPickup, setDuplicatingPickup] = useState<PiRow | null>(null);
  // Oct 2 client fix (UI plan §3): editing a recurring occurrence asks
  // "this occurrence / this and all future / complete schedule".
  const [recurringEditFor, setRecurringEditFor] = useState<PiRow | null>(null);
  const [steadyEdit, setSteadyEdit] = useState<{ row: any; applyFrom: string | null } | null>(null);
  const steadyTemplates = useQuery({ queryKey: ['admin-steady'], queryFn: adminCRUD.steady, enabled: recurringEditFor != null });
  const editPickup = (p: PiRow) => (p.steady_pickup_id != null ? setRecurringEditFor(p) : setEditingPickup(p));
  // C1 Aug 13 — click a pickup row/card → open detail as a modal in place
  // rather than navigating to /admin/pickup/:id. Preserves scroll + context.
  const [modalPickupId, setModalPickupId] = useState<number | null>(null);
  // Per-pickup SMS modal removed — SMS is now managed from the dedicated
  // SMS Composer / SMS Groups / SMS Threads tabs.
  const [smsPickup] = useState<PiRow | null>(null);
  // 3-way "New…" dropdown in the header: one-time pickup, steady pickup, new
  // supplier. Also drives the standalone "New supplier" flow so it lives
  // outside the pickup form now.
  const [showNewSupplierStandalone, setShowNewSupplierStandalone] = useState(false);
  const [showNewSteady, setShowNewSteady] = useState(false);
  // client Aug 12 — schedule .xlsx download modal (date-range picker).
  const [showScheduleDownload, setShowScheduleDownload] = useState(false);
  // When a search result is picked, we jump to the matching tab AND stash the id
  // so the tab's panel can open that entity's edit modal on mount.
  const [openPersonId, setOpenPersonId] = useState<number | null>(null);
  // Oct 12 client: a name in the who-got-the-text popup opens that driver's Alerts & schedule tab.
  useEffect(() => {
    const h = (e: Event) => {
      const id = Number((e as CustomEvent).detail?.id);
      if (!Number.isInteger(id) || id <= 0) return;
      e.preventDefault();
      openVolunteerOnTab('alerts'); setModalPickupId(null); setTab('volunteers' as TabKey); setOpenPersonId(id);
    };
    window.addEventListener('zlz:open-volunteer', h);
    return () => window.removeEventListener('zlz:open-volunteer', h);
  }, []);
  // batch abc820 · Pickups tab tabstrip (Needs attention / Upcoming /
  // Completed / History) replaces the old office-status chip filter + date
  // focus. Sub-tab lives here so it survives while the user scrolls entities
  // in and out.
  // Oct 2 client fix: one search bar at the top of Pickups (all views) and on the Live Board.
  const [pickupSearch, setPickupSearch] = useState('');
  // Oct 2 client: clicking a "needs you" card shows ONLY the pickups behind it.
  const [liveFocus, setLiveFocus] = useState<{ label: string; ids: number[] } | null>(null);
  // Oct 2: pick up access-level changes without a re-login.
  const [, setAccessRev] = useState(0);
  useEffect(() => {
    api<{ user: any }>('/api/auth/me').then((r) => {
      const cur = getUser();
      if (!cur || !r?.user) return;
      const next = r.user.accessSections ?? null;
      if (JSON.stringify(cur.accessSections ?? null) !== JSON.stringify(next)) {
        setAuth(getToken(), { ...cur, accessSections: next });
        setAccessRev((n) => n + 1);
      }
    }).catch(() => {});
  }, []);
  // Oct 9 client: Driver messages inbox tab (Texts / App chat / Replies to pickup texts).
  const [dmSub, setDmSub] = useState<DmSub>(() => {
    const n = readCoordNav();
    if (n.tab === 'driver-replies') return 'replies';
    if (n.tab === 'chat-volunteers') return 'chat';
    return n.tab === 'driver-messages' && DM_SUBS.includes(n.sub as DmSub) ? (n.sub as DmSub) : 'texts';
  });
  const openDriverMessages = (s: DmSub) => { setDmSub(s); setTab('driver-messages'); };
  const [pickupsSubTab, setPickupsSubTab] = useState<PickupsSubTab>(() => {
    const n = readCoordNav();
    if (n.tab === 'calendar') return 'calendar';
    if (n.tab === 'steady') return 'recurring';
    const valid: PickupsSubTab[] = ['today', 'list', 'calendar', 'history', 'recurring', 'attention'];
    return (n.tab === 'pickups' && valid.includes(n.sub as PickupsSubTab))
      ? (n.sub as PickupsSubTab) : 'today';
  });
  // Any remaining setTab('calendar' | 'steady') (search results, sidebar,
  // reports links) lands on the matching Pickups view instead.
  useEffect(() => {
    if (tab === 'calendar') { setTab('pickups'); setPickupsSubTab('calendar'); }
    else if (tab === 'steady') { setTab('pickups'); setPickupsSubTab('recurring'); }
    // Oct 9 client: old Driver replies / Chat: Drivers links open the Driver messages inbox.
    else if (tab === 'driver-replies') openDriverMessages('replies');
    else if (tab === 'chat-volunteers') openDriverMessages('chat');
  }, [tab]);
  // Oct 2 client: each page's search is its own — clear it on leaving.
  useEffect(() => { setPickupSearch(''); setLiveFocus(null); }, [tab, pickupsSubTab]);

  // Keep the URL hash in step with the active section + Pickups sub-tab. The
  // full-write only happens when the SECTION changes (clears deeper levels a
  // different section shouldn't carry); a sub-tab change within Pickups just
  // patches its segment. Child panels (SMS combo, Dispatchers, SMS threads)
  // own their own deeper segments and won't be clobbered here — prevTabRef
  // starts equal to `tab`, so the initial mount doesn't overwrite a hash the
  // children are still restoring from.
  const [lastInGroup, setLastInGroup] = useState<Record<string, TabKey>>({});
  useEffect(() => {
    const g = groupOfTab(tab);
    if (g) setLastInGroup((m) => (m[g.key] === tab ? m : { ...m, [g.key]: tab }));
  }, [tab]);
  const openGroup = (g: { key: string; tabs: TabKey[] }) => setTab(lastInGroup[g.key] && g.tabs.includes(lastInGroup[g.key]!) ? lastInGroup[g.key]! : g.tabs[0]!);
  const currentGroup = visibleGroups.find((g) => g.tabs.includes(tab));
  const prevTabRef = useRef<TabKey>(tab);
  useEffect(() => {
    if (prevTabRef.current !== tab) {
      prevTabRef.current = tab;
      writeCoordNav({ tab, sub: tab === 'pickups' ? pickupsSubTab : tab === 'driver-messages' ? dmSub : undefined });
    } else if (tab === 'pickups') {
      patchCoordNav({ sub: pickupsSubTab });
    } else if (tab === 'driver-messages') {
      patchCoordNav({ sub: dmSub });
    }
  }, [tab, pickupsSubTab, dmSub]);

  // Pickups feed range: today through +7d for the live board is fine on its
  // own, but the Pickups tab's Completed/History sub-tabs need up to 60 days
  // back. Widen the shared fetch so both surfaces work off one cache entry.
  // NY-anchored — toISOString().slice(0,10) reports UTC and rolls the day
  // over at 8 PM NY (EDT), hiding evening pickups from tonight's board.
  const today    = nyToday();
  const fromDate = new Date(Date.now() - 60 * 86400e3).toISOString().slice(0, 10);
  const inAMonth = new Date(Date.now() + 30 * 86400e3).toISOString().slice(0, 10);
  // Oct 11 client: speed — openSince=yesterday: the server sends every row from
  // yesterday on, but older rows only while still open / needing review (the
  // only old rows the Live Board, Waiting, Needs attention and the counts use).
  // Was the whole 90 days (~1.2 MB). History / List have their own range fetch.
  const pickups = useQuery({
    queryKey: ['admin-pickups', today],
    queryFn:  () => api<{ data: PiRow[] }>(`/api/pickup-instances?from=${fromDate}&to=${inAMonth}&openSince=${shiftDay(today, -1)}`),
    // abc881 (Aug 19): admin was seeing claimed pickups still bucketed under
    // "Looking for a driver" because the query only refreshed on manual
    // reload. Poll every 30s so an SMS-claim / app-claim from another surface
    // shows up in the admin's Live Board within a normal glance.
    // Oct 11 client: speed — 60s; the live stream (below) refreshes on every change.
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
  const suppliers = useQuery({
    queryKey: ['admin-suppliers'],
    queryFn:  () => api<{ data: any[] }>('/api/suppliers?limit=500&logo=url'),
  });
  // Oct 11 client: speed — fetch the Reports file in the background so its first open is instant.
  useEffect(() => { const t = setTimeout(() => { void ReportsPanel.preload(); }, 4000); return () => clearTimeout(t); }, []);
  const volunteers = useQuery({
    queryKey: ['admin-volunteers'],
    queryFn:  () => api<{ data: any[] }>('/api/volunteers?limit=500'),
  });

  // abc882 (Aug 19): real-time push. Opens a Server-Sent Events connection to
  // /api/pickup-events/stream so claim/release/assign/reschedule/dismiss/
  // broadcast events invalidate ['admin-pickups'] the instant the DB commits
  // instead of waiting for the 30s poll. Poll stays as fallback in case the
  // stream is torn down for a long time.
  //
  // Reconnect: EventSource has native reconnect, but on hard failures (401 for
  // an expired nonce, network death) we manually re-open with exponential
  // backoff capped at 30s. `liveOpen` drives the little green/grey dot next
  // to the Live Board title so dispatch knows the wire is warm.
  const [liveOpen, setLiveOpen] = useState(false);
  useEffect(() => {
    const staff = canWrite(user?.role) || user?.role === 'viewer';
    if (!staff) return;
    let es: EventSource | null = null;
    let cancelled = false;
    let backoff = 1000;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    // Tier-2 fix #9: the dot used to flip grey on the first error event and
    // strobe every time EventSource wobbled — even though its own reconnect
    // was still winning. Only flip grey after N consecutive failures so
    // normal transient noise (a single reconnect blip) stays green.
    const ERROR_STREAK_TO_GREY = 3;
    let errorStreak = 0;

    const connect = async () => {
      if (cancelled) return;
      try {
        es = await sse.connectPickupEvents();
        // Oct 8: unmounted while connecting — close it, or the stream leaks.
        if (cancelled) { es.close(); es = null; return; }
        es.addEventListener('open', () => {
          backoff = 1000;
          errorStreak = 0;
          setLiveOpen(true);
        });
        es.addEventListener('pickup-changed', () => {
          // Any real event = the wire is warm. Reset the failure streak so a
          // burst of activity doesn't leave stale error credit lying around.
          errorStreak = 0;
          setLiveOpen(true);
          qc.invalidateQueries({ queryKey: ['admin-pickups'] });
        });
        es.addEventListener('error', () => {
          errorStreak++;
          if (errorStreak >= ERROR_STREAK_TO_GREY) setLiveOpen(false);
          // EventSource will try its own reconnect first — only escalate to a
          // manual re-open if the socket has closed permanently.
          if (es && es.readyState === EventSource.CLOSED) {
            try { es.close(); } catch { /* already closed */ }
            es = null;
            const delay = backoff;
            backoff = Math.min(backoff * 2, 30_000);
            retryTimer = setTimeout(connect, delay);
          }
        });
      } catch {
        errorStreak++;
        if (errorStreak >= ERROR_STREAK_TO_GREY) setLiveOpen(false);
        const delay = backoff;
        backoff = Math.min(backoff * 2, 30_000);
        retryTimer = setTimeout(connect, delay);
      }
    };
    void connect();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (es) { try { es.close(); } catch { /* ignore */ } }
      setLiveOpen(false);
    };
    // qc + user role are stable for the tab's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const supplierPlaces: Place[] = (suppliers.data?.data ?? []).slice(0, 200).map((s: any) => ({
    id: s.id, name: s.name, status: s.status ?? 'active',
  }));

  // Determines what the map and feed pane render. Live = everything; the
  // entity tabs narrow to one type. Reports/Map have their own treatment.
  const showPickups    = tab === 'live' || tab === 'pickups' || tab === 'coverage';
  const showSuppliers  = tab === 'live' || tab === 'suppliers' || tab === 'coverage';
  const showVolunteers = tab === 'live' || tab === 'volunteers' || tab === 'coverage';

  // Consolidated brief #8 (Aug 18): the map only belongs on the Live Board.
  // On Volunteers / Suppliers / Pickups management screens the person or
  // location details are what the user actually scans; the previous map
  // squeezed those into a narrow column and added no operational value.
  // Oct 2 client fix (UI plan §2): map removed from the Live Board so pickup
  // cards use the full width; it lives on Coverage (future "Map View").
  const mapTabs: TabKey[] = ['coverage'];
  const showMap = mapTabs.includes(tab);

  // Right-pane feed: Live Board shows the REST OF TODAY (from now onward
  // through end of day). Client feedback said the previous 6-hour rolling
  // window looked empty even when there were pickups later today. The
  // Pickups tab still shows the whole 7-day window for planning.
  //
  // batch abc812 Aug 10 — Overdue-and-unresolved pickups (scheduled_time
  // in the past, status NOT completed/delivered/cancelled) stay on the
  // list until resolved even if they fall outside the -30m window.
  // Previously the header badge counted them but the filter hid them,
  // producing "All quiet for now" while an overdue pickup was still open.
  const allPickups = pickups.data?.data ?? [];
  const nowDate = new Date();
  const nowMs2 = nowDate.getTime();
  const endOfTodayMs = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate(), 23, 59, 59).getTime();
  // client Aug 12 — 'missed' joins the closed-set. The 15-min auto-missed
  // sweeper (backend: auto-missed-sweeper.ts) flips old orphan pickups to
  // 'missed', which should drop them from Needs-a-Driver / Live board /
  // attention count everywhere the same way cancelled does.
  const DONE_STATUSES = ['completed', 'delivered', 'cancelled', 'missed'];
  const livePickups = allPickups.filter((p) => {
    const status = String(p.status || '').toLowerCase();
    // abc884 (Aug 19 AM): cancelled/completed/delivered/missed must be
    // excluded from the Live Board — Bobov Yeshiva stayed on "Rest of Today"
    // even after the steady-cancel cascade because this filter only checked
    // DONE_STATUSES for the overdue branch, not for the in-window branch.
    if (DONE_STATUSES.includes(status)) return false;
    // Oct 2 client fix (UI plan §2): Live Board must never show cancelled,
    // picked-up, or test pickups as open. Mirrors the cancelled_at / is_test
    // exclusions the header counters already use.
    if (status === 'picked_up') return false;
    if ((p as any).cancelled_at) return false;
    if (p.is_test) return false;
    const when = new Date(p.scheduled_date.slice(0,10) + 'T' + (p.scheduled_time || '00:00:00')).getTime();
    const inWindow = when >= (nowMs2 - 30 * 60_000) && when <= endOfTodayMs;
    const isOverdueUnresolved = when < nowMs2;
    return inWindow || isOverdueUnresolved;
  });
  // §1: Live Board keeps its 6-hour rolling window (unchanged).
  // Aug 24 client fix (count/list mismatch on Needs attention): the sub-tab
  // count and the sub-tab list must be derived from the SAME evaluation so
  // "1 in badge → 0 in list" (or vice-versa) cannot happen. Prior code had
  // two independent useMemos (feedPickups + pickupsSubCounts) with different
  // deps; if a driver signup landed between their reruns, only one saw it.
  // Fix: compute each sub-tab's list ONCE, then derive count = length.
  const attentionList = useMemo(() => {
    const nowMs3 = Date.now();
    return allPickups.filter((p) => {
      // Oct 2 client fix: roster-only pickups the sweeper closed for review
      // land here so the office can confirm them one by one.
      // Oct 9 client: never test pickups (same as the Live Board).
      if (p.is_test) return false;
      if (officeStatusOf(p) === 'review') return true;
      const status = String(p.status || '').toLowerCase();
      if (DONE_STATUSES.includes(status)) return false;
      // Oct 9 client: cancelled ones are closed (same as the Live Board).
      if ((p as any).cancelled_at) return false;
      // Oct 7 client: store posts need a driver like any pickup (no skip).
      const activeSignups = ((p as any).signups ?? [])
        .filter((s: any) => !s.released_at).length;
      if (activeSignups > 0) return false;
      const startMs = new Date(p.scheduled_date.slice(0,10) + 'T' + (p.scheduled_time || '00:00:00')).getTime();
      const windowEndMs = (p as any).must_pickup_by
        ? new Date((p as any).must_pickup_by).getTime()
        : startMs + 60 * 60_000;
      return windowEndMs < nowMs3;
    });
  }, [allPickups]);
  const upcomingList = useMemo(() => {
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayStartMs = todayStart.getTime();
    return allPickups
      .filter((p) => {
        const status = String(p.status || '').toLowerCase();
        if (DONE_STATUSES.includes(status)) return false;
        const dayMs = new Date(p.scheduled_date.slice(0,10) + 'T00:00:00').getTime();
        return dayMs >= todayStartMs;
      })
      .sort((a, b) => (a.scheduled_date + a.scheduled_time).localeCompare(b.scheduled_date + b.scheduled_time));
  }, [allPickups]);
  const completedList = useMemo(() => {
    return allPickups
      .filter((p) => {
        const status = String(p.status || '').toLowerCase();
        return status === 'completed' || status === 'delivered';
      })
      .sort((a, b) => (b.scheduled_date + b.scheduled_time).localeCompare(a.scheduled_date + a.scheduled_time));
  }, [allPickups]);
  const historyList = useMemo(() => {
    const sixtyDaysAgo = Date.now() - 60 * 86400e3;
    return allPickups
      .filter((p) => {
        const dayMs = new Date(p.scheduled_date.slice(0,10) + 'T00:00:00').getTime();
        return dayMs >= sixtyDaysAgo;
      })
      .sort((a, b) => (b.scheduled_date + b.scheduled_time).localeCompare(a.scheduled_date + a.scheduled_time));
  }, [allPickups]);

  // Oct 2 client fix (UI plan §3): Pickups opens on Today — every pickup
  // scheduled today, any status, test rows excluded.
  const todayList = useMemo(() => {
    const t = nyToday();
    return allPickups
      // Oct 13 client: a reposted pickup still open shows under Today too (first).
      .filter((p) => (String(p.scheduled_date).slice(0, 10) === t || showsUnderToday(p)) && !p.is_test)
      .sort((a, b) => (showsUnderToday(a) ? '' : String(a.scheduled_time)).localeCompare(showsUnderToday(b) ? '' : String(b.scheduled_time)));
  }, [allPickups]);

  const feedPickups = useMemo(() => {
    if (tab === 'live') {
      if (showCoveredOnLive) return livePickups;
      return livePickups.filter((p) => {
        const need = Number((p as any).slots_capacity ?? 1) || 1;
        // Oct 2 client fix: released (driver-cancelled) signups no longer
        // count as filled, so a reopened slot shows back up on the board.
        const filled = ((p as any).signups ?? []).filter((s: any) => !s.released_at).length;
        return filled < need;
      });
    }
    if (tab !== 'pickups') return allPickups;
    if (pickupsSubTab === 'attention') return attentionList;
    if (pickupsSubTab === 'today') return todayList;
    // list / history / calendar / recurring render their own panels.
    return [];
  }, [tab, livePickups, allPickups, showCoveredOnLive, pickupsSubTab, attentionList, todayList]);

  // Counts derive from the SAME arrays the feed uses — count and list can no
  // longer disagree.
  const pickupsSubCounts = useMemo(() => ({
    attention: attentionList.length,
    upcoming: upcomingList.length,
    completed: completedList.length,
    history: historyList.length,
    today: todayList.length,
  }), [attentionList, upcomingList, completedList, historyList, todayList]);

  // Subtitle count = pickups NOT yet completed within the current feed scope
  // (§1.3 — Completed pickups must not remain in the upcoming count).
  const upcomingCount = useMemo(
    () => feedPickups.filter((p) => {
      const os = officeStatusOf(p);
      return !CLOSED_OFFICE_STATUSES.includes(os);
    }).length,
    [feedPickups]
  );

  const searchedFeed = useMemo(() => {
    const base = tab === 'live' && liveFocus
      ? allPickups.filter((p) => liveFocus.ids.includes(Number(p.id)))
      : feedPickups;
    const needle = pickupSearch.trim().toLowerCase();
    return needle ? base.filter((p) => pickupHaystack(p).includes(needle)) : base;
  }, [feedPickups, pickupSearch, liveFocus, allPickups, tab]);
  const groups = useMemo(() => groupByDate(searchedFeed), [searchedFeed]);

  // Operational counters for the Live Board tiles.
  const nowMs = Date.now();
  // abc901 (Aug 21): "Waiting" chip must reconcile EXACTLY with the Pickups
  // → attention sub-tab list it links to. Previously used a smaller closed-set
  // (missing 'missed') and counted any signup row (including released ones),
  // producing 68 vs. a list of 2. Now mirrors pickupsSubCounts.attention:
  // DONE_STATUSES (incl. 'missed'), only ACTIVE signups block, past-window,
  // and not supplier-posted.
  const overdueCount = allPickups.filter((p) => {
    const status = String(p.status || '').toLowerCase();
    if (DONE_STATUSES.includes(status)) return false;
    if ((p as any).cancelled_at) return false;
    // Oct 7 client: store posts now use the standard open window, so they
    // can be overdue like any pickup (was skipped, client abc792).
    // Tier-2 fix #10: xyz122 test/dry-run pickups leak into the operational
    // "Waiting" chip — office was seeing a red count for rows that are hidden
    // from every driver-facing surface.
    if (p.is_test) return false;
    const activeSignups = ((p as any).signups ?? [])
      .filter((s: any) => !s.released_at).length;
    if (activeSignups > 0) return false;
    const startMs = new Date(p.scheduled_date.slice(0, 10) + 'T' + (p.scheduled_time || '00:00:00')).getTime();
    const endMs   = p.must_pickup_by ? new Date(p.must_pickup_by).getTime() : startMs + 60 * 60_000;
    return endMs < nowMs;
  }).length;
  // abc901 (Aug 21): "Unassigned · 7d" was including cancelled + missed +
  // completed pickups because the filter only checked signup count. Add the
  // same DONE_STATUSES + cancelled_at exclusion the upcoming list uses.
  const unassignedThisWeek = allPickups.filter((p) => {
    const status = String(p.status || '').toLowerCase();
    if (DONE_STATUSES.includes(status)) return false;
    if ((p as any).cancelled_at) return false;
    // Tier-2 fix #10: exclude test/dry-run pickups from the header count so
    // the chip reflects real driver-facing work.
    if (p.is_test) return false;
    const activeSignups = ((p as any).signups ?? [])
      .filter((s: any) => !s.released_at).length;
    if (activeSignups > 0) return false;
    const startMs = new Date(p.scheduled_date.slice(0, 10) + 'T' + (p.scheduled_time || '00:00:00')).getTime();
    return startMs >= nowMs && startMs <= nowMs + 7 * 24 * 3600e3;
  }).length;

  // Oct 5: header count buttons removed; counts kept for future use.
  void overdueCount; void unassignedThisWeek;

  async function signOut() {
    if (!(await uiConfirm('Sign out?'))) return;
    // Oct 2 client: tell the server so the session (and a current shift) is closed.
    api('/api/auth/logout', { method: 'POST' }).catch(() => {}).finally(() => { localStorage.clear(); window.location.reload(); });
  }

  // Oct 11 client: the old "New SMS reply" toaster is now part of the dispatcher alerts
  // (OfficeAlertsBell in the header): text replies, waiting pickups, gave-backs — one pop-up + sound.
  const [phoneMenu, setPhoneMenu] = useState(false);

  return (
    <div className="min-h-screen bg-cream flex">
      {/* LEFT NAV */}
      <aside className="zlz-keep-light w-[280px] bg-forest-deep text-[#cfe0c8] flex-col shrink-0 hidden lg:flex lg:sticky lg:top-0 lg:self-start lg:h-screen">
        {/* Oct 5 client: real Zeh L'Zeh logo. */}
        <div className="px-3 pt-4 pb-3">
          <div className="rounded-[14px] bg-paper px-3 py-2 flex items-center justify-center">
            <img src={`${(import.meta as any).env?.BASE_URL ?? '/'}zlz-logo-wordmark.png`} alt="Zeh L'Zeh — on table placed, saved from waste" className="h-[64px] w-auto object-contain" />
          </div>
        </div>
        <nav className="px-3 mt-2 flex-1 overflow-y-auto">
          {visibleGroups.map((g) => (
            <button key={g.key} onClick={() => openGroup(g)}
                    className={cx('w-full flex items-center gap-3 px-3 py-3 rounded-[10px] text-[15px] font-bold haptic relative',
                                  g.tabs.includes(tab) ? 'bg-paper/15 text-paper' : 'text-[#cfe0c8] hover:bg-paper/5')}>
              <g.icon size={20} />
              {g.label}
              {g.key === 'messaging' && <DriverMessagesBadge />}
              {g.key === 'volunteers' && <SignupsBadge />}{/* Oct 11 client: new sign-ups waiting */}
            </button>
          ))}

          {/* Context list — adapts to the active tab. On Live Board this is
              Places (suppliers). On Pickups it's the live pickup list, on
              Volunteers the volunteer roster, on Suppliers the donor roster. */}
          <SidebarContextList tab={tab}
                              suppliers={supplierPlaces}
                              suppliersLoading={suppliers.isLoading}
                              volunteers={volunteers.data?.data ?? []}
                              volunteersLoading={volunteers.isLoading}
                              livePickups={livePickups}
                              onPick={(t: TabKey) => setTab(t)} />
        </nav>

        <div className="px-3 py-3 border-t border-paper/10">
          <ReportProblemLink />{/* Oct 14 client */}
          <button onClick={signOut} className="w-full flex items-center gap-2 px-3 py-2 rounded-[10px] text-[12px] font-bold text-[#a9c2a0] hover:bg-paper/5 haptic">
            <LogOut size={15} /> Sign out
          </button>
        </div>
      </aside>

      {/* MAIN */}
      <main className="flex-1 min-w-0 flex flex-col">
        <SmsPausedGlobalBanner onOpen={() => setTab('holiday-sms')} />
        {/* Oct 2 client fix (UI plan §1): the sidebar is desktop-only, so
            tablets and phones had no menu at all. Scrollable menu bar. */}
        {/* Oct 6 client: on a phone, one bar with the logo, the page you're on, and a ☰ menu. */}
        <nav className="zlz-keep-light lg:hidden relative bg-forest-deep px-2 py-2">
          <div className="flex items-center gap-2">
            <span className="shrink-0 rounded-[9px] bg-paper px-2 py-1">
              <img src={`${(import.meta as any).env?.BASE_URL ?? '/'}zlz-logo-wordmark.png`} alt="Zeh L'Zeh" className="h-[28px] w-auto object-contain" />
            </span>
            <span className="flex-1 min-w-0 truncate text-paper font-bold text-[15px]">{groupOfTab(tab)?.label ?? TAB_TITLE[tab]}</span>
            <button onClick={() => setPhoneMenu((v) => !v)} aria-label="Menu"
                    className="haptic shrink-0 h-10 w-10 grid place-items-center rounded-[9px] bg-paper/15 text-paper text-[20px] font-bold">
              {phoneMenu ? '✕' : '☰'}
            </button>
          </div>
          {phoneMenu && (
            <div className="absolute left-0 right-0 top-full z-[1500] bg-forest-deep border-t border-paper/10 px-2 pb-3 pt-1 shadow-lift">
              {visibleGroups.map((g) => (
                <button key={g.key} onClick={() => { setPhoneMenu(false); openGroup(g); }}
                        className={cx('w-full flex items-center gap-3 px-3 py-3 rounded-[10px] text-[15px] font-bold haptic',
                                      g.tabs.includes(tab) ? 'bg-paper/15 text-paper' : 'text-[#cfe0c8]')}>
                  <g.icon size={18} /> {g.label}
                  {g.key === 'messaging' && <DriverMessagesBadge />}
                  {g.key === 'volunteers' && <SignupsBadge />}{/* Oct 11 client: new sign-ups waiting */}
                </button>
              ))}
              {/* Oct 14 client: Report a problem */}
              <ReportProblemLink onClick={() => setPhoneMenu(false)}
                                 className="w-full flex items-center gap-3 px-3 py-3 rounded-[10px] text-[14px] font-bold text-[#a9c2a0] haptic" />
              <button onClick={signOut} className="w-full flex items-center gap-3 px-3 py-3 rounded-[10px] text-[14px] font-bold text-[#a9c2a0] haptic">
                <LogOut size={16} /> Sign out
              </button>
            </div>
          )}
        </nav>
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 sm:px-6 py-4 border-b border-line bg-paper">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 min-w-0">
            <div>
              <div className="font-display font-semibold text-[20px] tracking-[-0.01em] flex items-center gap-2">
                {TAB_TITLE[tab]}
                {tab === 'live' && (
                  <span
                    aria-label={liveOpen ? 'Live updates connected' : 'Live updates disconnected — polling'}
                    title={liveOpen ? 'Live updates: connected' : 'Live updates: disconnected (still checking every minute)'}
                    className={cx(
                      'inline-block h-2.5 w-2.5 rounded-full',
                      liveOpen
                        ? 'bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.15)]'
                        : 'bg-neutral-400/60',
                    )}
                  />
                )}
              </div>
              <div className="text-[12.5px] text-muted">
                {TAB_SUB[tab]}
                {/* abc889 (Aug 20): the "N upcoming" trailer was a shifts-tab
                    stat that leaked into every other page's header. Only
                    surface it where it's contextually meaningful.
                    xyz127 (Aug 23): on the Pickups tab specifically, using
                    the current-tab-filtered `upcomingCount` produced a
                    misleading "0 upcoming" whenever the visible sub-tab
                    happened to be empty (e.g. Attention=0) even though 193
                    pickups sat in the Upcoming sub-tab. Use the real
                    unfiltered count from pickupsSubCounts on that tab. */}
                {tab === 'pickups' && (
                  <> · {pickupsSubCounts.upcoming} upcoming</>
                )}
                {tab === 'shifts' && (
                  <> · {upcomingCount} upcoming</>
                )}
              </div>
            </div>
            {tab === 'live' && (
              <div className="flex flex-wrap items-center gap-2">
                {/* Oct 9 client: small "Waiting N" chip — jumps to Pickups → Needs attention
                    (same list, so the number always matches). */}
                {pickupsSubCounts.attention > 0 && (
                  <button onClick={() => { setTab('pickups'); setPickupsSubTab('attention'); }}
                          title="Past their time and still no driver — open Needs attention"
                          className="haptic inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-clay/40 bg-clay-soft px-3 py-1 text-[12.5px] font-bold text-clay hover:brightness-95">
                    Waiting {pickupsSubCounts.attention}
                  </button>
                )}
                {/* Oct 5 client: one line each, plain words; covered = a real switch. */}
                {/* Oct 5 client: overdue / need-a-driver count buttons removed ("Remove"). */}
                <label className="inline-flex items-center gap-2 whitespace-nowrap cursor-pointer select-none text-[12.5px] font-semibold text-muted px-1">
                  <span role="switch" aria-checked={showCoveredOnLive} tabIndex={0}
                        onClick={() => setShowCoveredOnLive((v) => !v)}
                        onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setShowCoveredOnLive((v) => !v); } }}
                        className={cx('relative inline-block h-5 w-9 rounded-full transition', showCoveredOnLive ? 'bg-forest' : 'bg-line')}>
                    <span className={cx('absolute top-0.5 h-4 w-4 rounded-full bg-paper shadow transition-all', showCoveredOnLive ? 'left-[18px]' : 'left-0.5')} />
                  </span>
                  <span onClick={() => setShowCoveredOnLive((v) => !v)}>Show covered pickups</span>
                </label>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            {/* Oct 2 client fix (UI plan §1): global New / search / download
                removed — each page has its own add, search and export. */}
            {tab === 'live' && writeOk && (
              <button onClick={() => setShowQuickAdd(true)}
                      className="haptic inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-forest text-paper px-4 py-1.5 text-[12.5px] font-bold shadow-ctag hover:brightness-110">
                <Plus size={14} /> Add Pickup
              </button>
            )}
            {/* Oct 5 client: "Remove" — Go on duty button taken out of the header. */}
            {false && <DutyToggle />}
            {/* Oct 11 client: dispatcher alerts — bell, pop-ups with sound, phone alerts. */}
            <OfficeAlertsBell onOpenPickup={(id) => setModalPickupId(id)} onOpenMessages={() => openDriverMessages('texts')} />
            {/* Oct 14 client: Help (?) — welcome tour, guide, Report a problem */}
            <HelpMenu tabs={visibleGroups.flatMap((g) => g.tabs)} writeOk={writeOk}
                      pageLabel={`${TAB_TITLE[tab] ?? tab}${tab === 'pickups' ? ` (${pickupsSubTab})` : tab === 'driver-messages' ? ` (${dmSub})` : ''}`}
                      onOpenTab={(t, s) => { setTab(t as TabKey); if (t === 'pickups' && s) setPickupsSubTab(s as PickupsSubTab); if (t === 'driver-messages' && s) setDmSub(s as DmSub); }} />
            <DisplayToggles />
            <span className="text-[12.5px] text-muted whitespace-nowrap">{user?.firstName} {user?.lastName}</span>
            {!writeOk && <span className="text-[10.5px] font-extrabold uppercase tracking-[.06em] text-muted bg-line/70 px-2 py-0.5 rounded-full" title="Your role is view-only">Read-only</span>}
          </div>
        </div>

        {/* Split: map + feed (the map only shows on dispatch tabs; on admin/
            chat/settings/etc. the right pane takes the full width). */}
        <div className="flex-1 flex flex-col lg:flex-row min-h-0">
          {/* Sep 11 fix: hide the map on tablet/phone (< lg=1024px). On
              narrow viewports the map + fixed 480px sidebar overlapped
              or overflowed, and clicks on pickup cards landed on the map
              instead of the card. Desktop layout unchanged. */}
          {showMap && (
            <div className="h-[55vh] lg:h-auto lg:flex-1 border-b lg:border-b-0 lg:border-r border-line">
              <CoordMap
                rows={showPickups ? (pickups.data?.data ?? []) : []}
                suppliers={showSuppliers ? (suppliers.data?.data ?? []) : []}
                showVolunteers={showVolunteers}
                onOpen={(id) => setModalPickupId(id)} />
            </div>
          )}

          <div className={cx('overflow-y-auto px-5 py-5 bg-cream/50',
                             showMap ? 'flex-1 min-w-0 lg:flex-none lg:w-[480px] lg:shrink-0' : 'flex-1 min-w-0')}>
            {/* Fork S · Aug 7 — occasional pickups awaiting dispatcher
                confirm/decline. Only rendered on the Live Board; returns null
                when nothing needs confirmation today. */}
            {currentGroup?.key === 'admin' && (
              <div className="mb-2 flex items-center gap-1.5">
                {ADMIN_SUBGROUPS.map((g) => {
                  const shown = g.tabs.filter((t) => currentGroup.tabs.includes(t));
                  if (shown.length === 0) return null;
                  const on = shown.includes(tab);
                  return (
                    <button key={g.label} onClick={() => { if (!on) setTab(shown[0]!); }}
                            className={cx('haptic rounded-full px-3.5 py-1.5 text-[13px] font-bold',
                                          on ? 'bg-forest text-paper' : 'bg-paper border border-line text-muted hover:text-ink')}>
                      {g.label}
                    </button>
                  );
                })}
              </div>
            )}
            {currentGroup && currentGroup.tabs.length > 1 && (
              <div className="mb-4 flex items-center gap-1.5 border-b border-line overflow-x-auto">
                {(currentGroup.key === 'admin'
                    ? (ADMIN_SUBGROUPS.find((g) => g.tabs.includes(tab))?.tabs ?? []).filter((t) => currentGroup.tabs.includes(t))
                    : currentGroup.tabs).map((t) => (
                  <button key={t} onClick={() => setTab(t)}
                          className={cx('haptic px-3 py-2 text-[13px] font-bold border-b-2 -mb-px whitespace-nowrap inline-flex items-center gap-1.5',
                                        tab === t ? 'border-forest text-forest' : 'border-transparent text-muted hover:text-ink')}>
                    {NAV_ITEMS.find((it) => it.key === t)?.label ?? t}
                    {t === 'chat-stores' && <UnreadBadge kind="stores" />}
                    {t === 'chat-volunteers' && <UnreadBadge kind="volunteers" />}
                    {t === 'signups' && <SignupsBadge />}
                  </button>
                ))}
              </div>
            )}
            {tab === 'live' && <PickupSearchBar value={pickupSearch} onChange={setPickupSearch} />}
            {/* Oct 5 client (declutter #3): on duty + what needs you, one short line. */}
            {tab === 'live' && (
              <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px]">
                <OnDutyNow />
                {!liveFocus && <OnDutyBanner setTab={setTab} onFocus={setLiveFocus} />}
              </div>
            )}
            {tab === 'live' && liveFocus && (
              <div className="mb-4 rounded-[14px] border border-forest/30 bg-sage/50 px-4 py-3 flex flex-wrap items-center gap-3">
                <span className="flex-1 text-[14px] text-ink">
                  Showing only the {liveFocus.ids.length} {liveFocus.ids.length === 1 ? 'pickup that' : 'pickups that'} {liveFocus.label}.
                </span>
                <button onClick={() => setLiveFocus(null)}
                        className="haptic rounded-[10px] bg-forest px-3 py-1.5 text-[12.5px] font-bold text-paper">Show everything</button>
              </div>
            )}
            {tab === 'live' && <div id="needs-confirmation-anchor"><NeedsConfirmationSection /></div>}
            {/* Oct 5 client: expired with no driver — a person decides (food still there?). */}
            {tab === 'live' && <ExpiredReviewSection />}
            {tab === 'live' && <NotCheckedInSection />}
            {/* Oct 8 client: drivers happy to be called right now. */}
            {tab === 'live' && !liveFocus && <OnCallNowCard onOpenPerson={(id) => { setTab('volunteers' as TabKey); setOpenPersonId(id); }} />}
            {tab === 'live' && !liveFocus && (
              <UsuallyActiveNow onOpenPerson={(id) => { setTab('volunteers' as TabKey); setOpenPersonId(id); }} />
            )}
            {tab === 'calendar' ? (
              <CalendarPanel onOpenScheduleDownload={() => setShowScheduleDownload(true)}
                             onNavigateTab={(t, id) => { setTab(t as TabKey); if (id != null) setOpenPersonId(id); }}
                             onOpenPickup={(id) => setModalPickupId(id)} />
            ) : tab === 'suppliers' ? (
              <SuppliersPanel rows={suppliers.data?.data ?? []} refetch={() => suppliers.refetch()}
                              openId={openPersonId} onOpenConsumed={() => setOpenPersonId(null)} />
            ) : tab === 'volunteers' ? (
              <VolunteersPanel rows={volunteers.data?.data ?? []} refetch={() => volunteers.refetch()}
                               openId={openPersonId} onOpenConsumed={() => setOpenPersonId(null)} />
            ) : tab === 'signups' ? (
              <SignupsPanel /> // Oct 11 client: New sign-ups inbox
            ) : tab === 'steady' ? (
              <SteadyPickupsPanel />
            ) : tab === 'shifts' ? (
              <ShiftsPanel />
            ) : tab === 'center-help' ? (
              <CenterHelpStandalonePanel />
            ) : tab === 'app-usage' ? (
              <AppUsagePanel />
            ) : tab === 'whats-new' ? (
              <WhatsNewPanel />
            ) : tab === 'kiosk-activity' ? (
              <KioskActivityPanel />
            ) : tab === 'settings' ? (
              <div className="space-y-4"><PhoneAlertsButton />{/* Oct 11 client */}<SettingsPanel /></div>
            ) : tab === 'donations' ? (
              <DonationsPanel canEdit={canWrite(user?.role)} />
            ) : tab === 'emails' ? (
              <EmailsPanel />
            ) : tab === 'neighborhoods' ? (
              <NeighborhoodsPanel />
            ) : tab === 'change-password' ? (
              <ChangePasswordPanel />
            ) : tab === 'my-shift' ? (
              <div className="space-y-4"><PhoneAlertsButton />{/* Oct 11 client */}<MyShiftPanel /></div>
            ) : tab === 'holiday-sms' ? (
              <div className="space-y-3"><SmsPauseBanner /><JewishCalendarPanel /></div>
            ) : tab === 'tasks' ? (
              <TasksPanel />
            ) : tab === 'recruiting' ? (
              <RecruitingPanel />
            ) : tab === 'coverage' ? (
              <CoveragePanel />
            ) : tab === 'reports' ? (
              <Suspense fallback={<div className="text-[13px] text-muted">Loading…</div>}>
                <ReportsPanel onNavigateTab={(t) => setTab(t as TabKey)} />
              </Suspense>
            ) : tab === 'driver-messages' ? (
              <DriverMessagesPanel sub={dmSub} onSub={setDmSub}
                                   onOpenPerson={(id, kind) => { setTab(kind === 'store' ? 'suppliers' : 'volunteers'); setOpenPersonId(id); }} />
            ) : tab === 'who-gets-texts' ? (
              <WhoGetsTextsPanel onOpenPerson={(id) => { openVolunteerOnTab('alerts'); setTab('volunteers'); setOpenPersonId(id); }} />
            ) : tab === 'texting-rules' ? (
              <HowTextingWorksPanel onOpenCodeWords={() => openDriverMessages('words')} />
            ) : tab === 'driver-replies' ? (
              <DriverRepliesPanel />
            ) : tab === 'chat-stores' ? (
              <ChatList kind="stores" />
            ) : tab === 'chat-volunteers' ? (
              <ChatList kind="volunteers" />
            ) : tab === 'sms-combo' ? (
              <SmsComboPanel />
            ) : tab === 'dispatchers-combo' ? (
              <DispatchersComboPanel />
            ) : tab === 'prospects' ? (
              <ProspectsPanel />
            ) : pickups.isLoading ? (
              <div className="text-[13px] text-muted">Loading…</div>
            ) : tab === 'pickups' ? (
              // ── Pickups tab: always-visible sub-tabstrip. Empty state per
              //    sub-tab renders as a small quiet card so the tabs stay
              //    clickable / visible even when the current bucket is empty.
              <>
                <PickupSearchBar value={pickupSearch} onChange={setPickupSearch} />
                <PickupsSubTabStrip current={pickupsSubTab} onChange={setPickupsSubTab} counts={pickupsSubCounts} />
                {pickupsSubTab === 'calendar' ? (
                  <CalendarPanel onOpenScheduleDownload={() => setShowScheduleDownload(true)}
                                 onNavigateTab={(t, id) => { setTab(t as TabKey); if (id != null) setOpenPersonId(id); }}
                                 onOpenPickup={(id) => setModalPickupId(id)} />
                ) : pickupsSubTab === 'recurring' ? (
                  <SteadyPickupsPanel />
                ) : pickupsSubTab === 'list' || pickupsSubTab === 'history' ? (
                  <PickupsRangeView key={pickupsSubTab} mode={pickupsSubTab} search={pickupSearch}
                                    onOpen={(id) => setModalPickupId(id)}
                                    onAssign={writeOk ? (p) => setPickerFor(p) : undefined}
                                    onEdit={writeOk ? (p) => editPickup(p) : undefined}
                                    onDuplicate={writeOk ? (p) => setDuplicatingPickup(p) : undefined}
                                    onAdd={writeOk ? () => setShowQuickAdd(true) : undefined} />
                ) : groups.length === 0 ? (
                  <div className="rounded-[14px] border border-line bg-paper px-4 py-3 text-[13px] text-muted">
                    {PICKUPS_SUB_EMPTY[pickupsSubTab]}
                  </div>
                ) : (
                  groups.map((g) => (
                    <section key={g.key} className={cx('mb-5', (g as any).overdue && 'p-3 rounded-[14px] bg-amber/5 border border-amber/40')}>
                      <div className={cx('text-[11px] font-extrabold uppercase tracking-[.05em] mb-2.5',
                                          (g as any).overdue ? 'text-forest-deep' : 'text-muted')}>
                        {g.label}
                      </div>
                      <div className="space-y-2.5">
                        {g.items.map((p) => (
                          <CoordRow key={p.id} p={p}
                                    onAssign={writeOk ? () => setPickerFor(p) : () => {}}
                                    onOpen={() => setModalPickupId(p.id)}
                                    onEdit={writeOk ? () => editPickup(p) : undefined}
                                    onDuplicate={writeOk ? () => setDuplicatingPickup(p) : undefined}
                                    allowDriverCancel={writeOk} />
                        ))}
                      </div>
                    </section>
                  ))
                )}
              </>
            ) : groups.length === 0 ? (
              <div className="text-center py-16">
                <div className="mx-auto h-16 w-16 rounded-2xl bg-sage grid place-items-center mb-4">
                  <LayoutGrid size={30} className="text-forest" />
                </div>
                <div className="font-display font-semibold text-[18px] text-ink">
                  {tab === 'live' ? (livePickups.length > 0 ? 'All covered! 🎉' : 'All quiet for now') : 'No pickups scheduled'}
                </div>
                <p className="text-[13.5px] text-muted mt-2 max-w-[38ch] mx-auto">
                  {tab === 'live'
                    ? (livePickups.length > 0 ? 'Every pickup left today has a driver. Thank you!' : 'Nothing left for today. Switch to Pickups for the 7-day view.')
                    : 'No pickups in the next 7 days. Try widening the range from the Pickups tab.'}
                </p>
                {writeOk && (
                  <button onClick={() => setShowQuickAdd(true)}
                          className="haptic mt-5 inline-flex items-center gap-1.5 text-[12.5px] font-bold bg-forest text-paper rounded-[10px] px-3.5 py-2 shadow-ctag hover:brightness-110">
                    <Plus size={13} /> New pickup
                  </button>
                )}
              </div>
            ) : (
              <>
                {tab === 'live' && (
                  <div id="live-pickups-feed" className="text-[13.5px] font-bold text-ink mb-3 scroll-mt-4">
                    {/* Tier-2 fix #7: N was livePickups (pre-coverage filter),
                        M was allPickups (whole 60-day+30-day range, unrelated
                        to "rest of today"). Now: N = actually-shown feed rows,
                        M = all rest-of-today active pickups. So "3 of 6" reads
                        as "3 shown, 6 exist in scope" (the other 3 are covered
                        and hidden by default). */}
                    {showCoveredOnLive
                      ? `All ${livePickups.length} ${livePickups.length === 1 ? 'pickup' : 'pickups'} left today`
                      : (() => {
                          // Oct 5 client: friendly greeting with today's count.
                          const h = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23' }).format(new Date()));
                          const hi = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
                          const who = String((user as any)?.firstName ?? '').trim();
                          const n = feedPickups.length;
                          return `${hi}${who ? `, ${who}` : ''} — ${n} ${n === 1 ? 'pickup still needs' : 'pickups still need'} a driver today`
                            + (livePickups.length > n ? ` · ${livePickups.length - n} covered` : '');
                        })()}
                  </div>
                )}
                {groups.map((g) => (
                  <section key={g.key} className={cx('mb-5', (g as any).overdue && 'p-3 rounded-[14px] bg-amber/5 border border-amber/40')}>
                    <div className={cx('text-[11px] font-extrabold uppercase tracking-[.05em] mb-2.5',
                                        (g as any).overdue ? 'text-forest-deep' : 'text-muted')}>
                      {g.label}
                    </div>
                    <div className="space-y-2.5">
                      {g.items.map((p) => (
                        <CoordRow key={p.id} p={p}
                                  onAssign={writeOk ? () => setPickerFor(p) : () => {}}
                                  onOpen={() => setModalPickupId(p.id)}
                                  onEdit={writeOk ? () => editPickup(p) : undefined} />
                      ))}
                    </div>
                  </section>
                ))}
              </>
            )}
          </div>
        </div>
      </main>

      {pickerFor && (
        <DriverPickerModal
          pickup={pickerFor}
          volunteers={volunteers.data?.data ?? []}
          onClose={() => setPickerFor(null)}
          onChanged={() => { qc.invalidateQueries({ queryKey: ['admin-pickups'] }); }}
        />
      )}

      {showQuickAdd && (
        <QuickPickupModal
          onClose={() => setShowQuickAdd(false)}
          onDone={() => { setShowQuickAdd(false); qc.invalidateQueries({ queryKey: ['admin-pickups'] }); }}
        />
      )}

      {recurringEditFor && (
        <RecurringEditChoiceModal
          p={recurringEditFor}
          loading={steadyTemplates.isLoading}
          onOccurrence={() => { setEditingPickup(recurringEditFor); setRecurringEditFor(null); }}
          onSchedule={(fromThisDate) => {
            const row = ((steadyTemplates.data as any)?.data ?? []).find((r: any) => Number(r.id) === Number(recurringEditFor.steady_pickup_id));
            if (!row) { alert("Couldn't load this steady schedule. Edit it from Pickups → Steady."); return; }
            setSteadyEdit({ row, applyFrom: fromThisDate ? String(recurringEditFor.scheduled_date).slice(0, 10) : null });
            setRecurringEditFor(null);
          }}
          onClose={() => setRecurringEditFor(null)} />
      )}
      {steadyEdit && (
        <SteadyForm row={steadyEdit.row} applyFrom={steadyEdit.applyFrom}
          onCancel={() => setSteadyEdit(null)}
          onDone={() => { setSteadyEdit(null); qc.invalidateQueries({ queryKey: ['admin-steady'] }); qc.invalidateQueries({ queryKey: ['admin-pickups'] }); qc.invalidateQueries({ queryKey: ['admin-pickups-range'] }); }} />
      )}
      {duplicatingPickup && (
        <QuickPickupModal
          duplicateFrom={duplicatingPickup}
          onClose={() => setDuplicatingPickup(null)}
          onDone={() => { setDuplicatingPickup(null); qc.invalidateQueries({ queryKey: ['admin-pickups'] }); qc.invalidateQueries({ queryKey: ['admin-pickups-range'] }); }}
        />
      )}
      {editingPickup && (
        <QuickPickupModal
          pickup={editingPickup}
          onClose={() => setEditingPickup(null)}
          onDone={() => { setEditingPickup(null); qc.invalidateQueries({ queryKey: ['admin-pickups'] }); }}
        />
      )}

      {/* Per-pickup SMS modal render removed alongside the card button — see setSmsPickup note above. */}
      {smsPickup && null}

      {showNewSupplierStandalone && (
        <SupplierForm row={null}
          onCancel={() => setShowNewSupplierStandalone(false)}
          onDone={() => { setShowNewSupplierStandalone(false); qc.invalidateQueries({ queryKey: ['admin-suppliers'] }); }} />
      )}

      {showNewSteady && (
        <SteadyForm row={null}
          onCancel={() => setShowNewSteady(false)}
          onDone={() => { setShowNewSteady(false); qc.invalidateQueries({ queryKey: ['admin-steady'] }); qc.invalidateQueries({ queryKey: ['admin-pickups'] }); }} />
      )}

      {showScheduleDownload && (
        <ScheduleDownloadModal onClose={() => setShowScheduleDownload(false)} />
      )}

      {/* C1 Aug 13 — pickup detail rendered in a full-screen modal so office
          staff never leave the Live Board. Click backdrop or × to close. The
          /admin/pickup/:id deep-link route still works (AdminPickupDetail
          falls back to useParams when no pickupIdOverride prop is given). */}
      {modalPickupId != null && (
        <div className="fixed inset-0 z-[2000] bg-ink/60 flex items-start justify-center p-4 sm:p-6 overflow-y-auto">
          <div onClick={(e) => e.stopPropagation()}
               className="relative bg-paper rounded-[18px] shadow-lift w-full max-w-[1000px] my-4">
            <button onClick={() => setModalPickupId(null)}
                    className="haptic absolute top-3 right-3 z-10 grid h-9 w-9 place-items-center rounded-full bg-cream border border-line hover:bg-paper"
                    aria-label="Close pickup detail">
              <X size={18} />
            </button>
            <AdminPickupDetail pickupIdOverride={modalPickupId} onClose={() => setModalPickupId(null)} />
          </div>
        </div>
      )}


    </div>
  );
}

/**
 * Driver picker — supports adding additional drivers (so a single pickup can
 * have 2+ volunteers), removing a specific assignment, and a confirmation
 * step whenever the coordinator picks someone while there's already an
 * existing driver. The confirmation guards against mistakenly DOUBLING a
 * pickup that should have just one driver.
 */
/**
 * PickupSmsModal — office picks drivers, sees a templated SMS preview, then
 * sends. Uses /api/sms/pickup-broadcast which formats the message with all the
 * store/where/when/what fields and appends "Reply <pickup number> to accept".
 */
// Kept exported so tsc (noUnusedLocals) doesn't drop the definition and so a
// future re-enable of per-pickup SMS is a one-line render change.
export function PickupSmsModal({ pickup, volunteers, onClose }: {
  pickup: PiRow; volunteers: any[]; onClose: () => void;
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [q, setQ] = useState('');
  const [extraNote, setExtraNote] = useState('');
  const [status, setStatus] = useState<string | null>(null);

  const send = useMutation({
    mutationFn: () => broadcast.pickupSms({
      pickupIds: [pickup.id],
      volunteerIds: [...selected],
      extraNote: extraNote.trim() || null,
    }),
    onSuccess: (res) => {
      setStatus(`Sent to ${res.data.sent}${res.data.failed ? ` · ${res.data.failed} failed` : ''}`);
      setTimeout(onClose, 2000);
    },
    onError: (e: any) => setStatus(e?.message ?? 'send failed'),
  });

  const filtered = volunteers
    .filter((v) => !v.deletedAt && v.status !== 'inactive' && v.isAvailable !== false)
    .filter((v) => {
      if (!q.trim()) return true;
      const hay = `${v.firstName} ${v.lastName} ${v.phonePrimary ?? ''} ${v.locationArea ?? ''}`.toLowerCase();
      return hay.includes(q.trim().toLowerCase());
    })
    .slice(0, 200);

  function toggle(id: number) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  }

  return (
    <div className="fixed inset-0 z-[2000] bg-ink/50 flex items-start justify-center pt-16 px-4">
      <div onClick={(e) => e.stopPropagation()}
           className="relative z-[2001] bg-paper rounded-[18px] shadow-lift border border-line w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
        <div className="px-5 py-3 border-b border-line">
          <div className="font-display font-semibold text-[18px]">Text pickup to drivers</div>
          <div className="text-[12px] text-muted mt-0.5">
            {pickup.suppliers || pickup.contact_name || 'Pickup'} · {fmtDay(String(pickup.scheduled_date).slice(0, 10))} · {fmtTime(pickup.scheduled_time?.slice(0, 5) ?? '')}
          </div>
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter drivers by name, area, phone…"
               className="mx-4 mt-3 mb-2 rounded-[10px] border border-line px-3 py-2 text-[13.5px] outline-none focus:border-forest" />
        <div className="flex-1 overflow-y-auto px-2 py-1 border-t border-line">
          {filtered.map((v) => {
            const on = selected.has(v.id);
            return (
              <button key={v.id} onClick={() => toggle(v.id)}
                      className={cx('w-full flex items-center gap-3 px-3 py-2 text-left rounded-[10px] hover:bg-cream/40 haptic',
                                    on && 'bg-sage/50')}>
                <input type="checkbox" checked={on} readOnly className="h-4 w-4 accent-forest" />
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-[13.5px] truncate">
                    {v.firstName} {v.lastName}
                    {(v as any).unitNumber != null && <span className="ml-1.5 text-muted font-semibold text-[11.5px]">#{(v as any).unitNumber}</span>}
                  </div>
                  <div className="text-[11.5px] text-muted truncate">{v.phonePrimary ?? '—'} · {v.locationArea ?? 'no area'}</div>
                </div>
              </button>
            );
          })}
          {filtered.length === 0 && <div className="text-center text-muted text-[12.5px] py-6">No drivers match.</div>}
        </div>
        <div className="border-t border-line px-4 py-3 space-y-2">
          <textarea value={extraNote} onChange={(e) => setExtraNote(e.target.value)} rows={2}
                    placeholder="Optional note appended to the SMS…"
                    className="w-full rounded-[10px] border border-line px-3 py-2 text-[13px] outline-none focus:border-forest resize-none" />
          <div className="text-[11px] text-muted italic">
            SMS will include store, address, time, food, drop-off location, and "Reply &lt;pickup number&gt; to accept" (e.g. "Reply 359").
          </div>
          {status && <div className={cx('text-[12px] font-bold', send.error ? 'text-clay' : 'text-forest')}>{status}</div>}
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-bold text-muted">{selected.size} selected</span>
            <div className="flex gap-2">
              <button onClick={onClose} className="haptic text-[12.5px] font-bold border border-line px-3 py-2 rounded-[10px]">Cancel</button>
              <button onClick={() => send.mutate()} disabled={selected.size === 0 || send.isPending}
                      className="haptic text-[12.5px] font-bold bg-forest text-paper px-4 py-2 rounded-[10px] shadow-ctag disabled:opacity-50">
                {send.isPending ? 'Sending…' : `Send SMS to ${selected.size}`}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function DriverPickerModal({ pickup, volunteers, onClose, onChanged }: {
  pickup: PiRow; volunteers: any[]; onClose: () => void; onChanged: () => void;
}) {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [pending, setPending] = useState<{ v: any; taken?: string[] } | null>(null); // confirmation target
  // Oct 9 client: say so when a change didn't save (was silent).
  const [err, setErr] = useState<string | null>(null);
  const why = (e: any) => e?.message || 'please try again';

  const addMut = useMutation({
    mutationFn: (a: { vid: number; extra?: boolean; v?: any }) => api(`/api/pickup-instances/${pickup.id}/volunteers`,
      { method: 'POST', body: JSON.stringify({ volunteerId: a.vid, extra: a.extra === true }) }),
    onMutate: () => setErr(null),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-pickups'] }); onChanged(); onClose(); },
    // Someone already took it in the app or by text — ask before adding a second driver.
    onError: (e: any, a) => {
      if (e?.body?.error === 'already_covered') {
        const v = a.v ?? pool.find((x) => Number(x.id) === a.vid);
        if (v) { setPending({ v, taken: e.body.taken ?? [] }); return; }
      }
      setErr(`Couldn't add the driver — ${why(e)}`);
    },
  });
  const removeMut = useMutation({
    mutationFn: (vid: number) => api<any>(`/api/pickup-instances/${pickup.id}/volunteers/${vid}`, { method: 'DELETE' }),
    onMutate: () => setErr(null),
    // Oct 11 client: say what happened — driver told + pickup re-sent as new (or why not).
    onSuccess: (r: any) => { qc.invalidateQueries({ queryKey: ['admin-pickups'] }); onChanged(); const n = r?.data?.driverRemoved?.notice; if (n) uiNotify(n, Number(r?.data?.driverRemoved?.resend?.sent ?? 0) > 0 ? 'ok' : 'info'); },
    onError: (e: any) => setErr(`Couldn't remove the driver — ${why(e)}`),
  });
  const slotsMut = useMutation({
    mutationFn: (n: number) => api(`/api/pickup-instances/${pickup.id}`,
      { method: 'PATCH', body: JSON.stringify({ slotsCapacity: n }) }),
    onMutate: () => setErr(null),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-pickups'] }); onChanged(); },
    onError: (e: any) => setErr(`Couldn't change the number of drivers — ${why(e)}`),
  });

  const current = pickup.signups ?? [];
  const currentIds = new Set(current.map((s: any) => Number(s.volunteer_id)));

  // Oct 9 client: the whole list (no 80 cap), best picks first —
  //   1. the steady pickup's recommended drivers ("Recommended")
  //   2. on call now   3. did this store before   4. most active in the last 30 days   5. everyone else A–Z.
  // New / inactive / do-not-contact drivers are hidden unless searched for or "Show everyone".
  const [showAll, setShowAll] = useState(false);
  const statsQ = useQuery({
    queryKey: ['picker-volunteers', pickup.id],
    queryFn: () => api<{ data: any[] }>(`/api/volunteers?limit=500&forPickup=${pickup.id}`),
  });
  const onCallQ = useQuery({
    queryKey: ['on-call-now'],
    queryFn: () => api<{ data: Array<{ volunteerId: string }> }>('/api/on-call/now'),
    retry: false,
  });
  const steadyId = pickup.steady_pickup_id ?? null;
  const recQ = useQuery({
    queryKey: ['steady-recommended-drivers', steadyId],
    queryFn: () => adminCRUD.steadyRecommendedDrivers.list(Number(steadyId)),
    enabled: steadyId != null,
    retry: false,
  });
  const pool: any[] = statsQ.data?.data ?? volunteers;
  const onCall = new Set((onCallQ.data?.data ?? []).map((r) => Number(r.volunteerId)));
  const recIds = (recQ.data?.data ?? []).map((r) => Number(r.volunteer_id));
  const rec = new Set(recIds);
  const HIDDEN = ['new', 'inactive', 'do_not_contact', 'do not contact', 'past_archived', 'alumni'];
  const isHidden = (v: any) => HIDDEN.includes(String(v.status ?? '').toLowerCase());
  const needle = q.trim().toLowerCase();
  const unitQ = /^#?\s*\d{1,4}$/.test(needle) ? Number(needle.replace(/\D/g, '')) : null;
  const matches = (v: any) => {
    if (!needle) return true;
    if (unitQ != null) {                       // "#93" = unit 93; "93" = unit 93 (or a phone with those digits)
      if (Number(v.unitNumber) === unitQ) return true;
      const digits = needle.replace(/\D/g, '');
      return !needle.startsWith('#') && digits.length >= 3 && String(v.phonePrimary ?? '').replace(/\D/g, '').includes(digits);
    }
    return `${v.firstName} ${v.lastName} ${v.phonePrimary ?? ''} ${v.locationArea ?? ''}`.toLowerCase().includes(needle);
  };
  const rankOf = (v: any) => rec.has(Number(v.id)) ? 0 : onCall.has(Number(v.id)) ? 1
    : Number(v.storeTrips ?? 0) > 0 ? 2 : Number(v.trips30d ?? 0) > 0 ? 3 : 4;
  const nameOf = (v: any) => `${v.firstName ?? ''} ${v.lastName ?? ''}`.trim().toLowerCase();
  const live = pool.filter((v) => !v.deletedAt);
  const hiddenCount = live.filter((v) => isHidden(v) && !rec.has(Number(v.id))).length;
  const filtered = live
    .filter((v) => showAll || !!needle || rec.has(Number(v.id)) || !isHidden(v))
    .filter(matches)
    .sort((a, b) => {
      const ra = rankOf(a), rb = rankOf(b);
      if (ra !== rb) return ra - rb;
      if (ra === 0) return recIds.indexOf(Number(a.id)) - recIds.indexOf(Number(b.id));
      if (ra === 2 && b.storeTrips !== a.storeTrips) return Number(b.storeTrips) - Number(a.storeTrips);
      if ((ra === 2 || ra === 3) && b.trips30d !== a.trips30d) return Number(b.trips30d ?? 0) - Number(a.trips30d ?? 0);
      return nameOf(a).localeCompare(nameOf(b));
    });

  const slotsNeeded = pickup.slots_capacity ?? 1;
  function handlePick(v: any) {
    if (currentIds.has(v.id)) return;             // already on it
    // No confirm while we're still under the planned driver count — that's
    // exactly what was scheduled. Confirm only when going BEYOND the plan
    // (e.g. pickup set for 1 driver but coordinator adds a second).
    if (current.length < slotsNeeded) {
      addMut.mutate({ vid: v.id, v });
      return;
    }
    setPending({ v });
  }
  // Oct 13 client: "+ Someone not on our list" — record an outside helper the office called
  // (or reuse whoever has that phone), then add them like any driver.
  const [ohOpen, setOhOpen] = useState(false);
  const [ohName, setOhName] = useState('');
  const [ohPhone, setOhPhone] = useState('');
  const [ohOutside, setOhOutside] = useState(true);
  const [ohErr, setOhErr] = useState<string | null>(null);
  const ohDigits = (() => { const d = ohPhone.replace(/\D/g, ''); return d.length === 11 && d.startsWith('1') ? d.slice(1) : d; })();
  const ohMut = useMutation({
    mutationFn: () => api<{ data: { id: number; firstName: string; lastName: string; unitNumber: number | null; status: string; reused: boolean; outsideHelper: boolean } }>(
      '/api/outside-helpers', { method: 'POST', body: JSON.stringify({ name: ohName.trim(), phone: ohDigits, outsideHelper: ohOutside, pickupId: Number(pickup.id) }) }),
    onMutate: () => { setOhErr(null); setErr(null); },
    onSuccess: (r) => {
      const h = r.data;
      qc.invalidateQueries({ queryKey: ['picker-volunteers'] });
      qc.invalidateQueries({ queryKey: ['who-gets-texts'] });
      const nm = `${h.firstName} ${h.lastName === '-' ? '' : h.lastName}`.trim();
      if (currentIds.has(h.id)) { setOhErr(`${nm} is already on this pickup.`); return; }
      if (h.reused) uiNotify(h.outsideHelper ? `${nm} was already saved as an outside helper — adding them.` : `That phone is ${nm}${h.unitNumber != null ? ` #${h.unitNumber}` : ''}, already on our list — adding them.`, 'info');
      setOhOpen(false); setOhName(''); setOhPhone(''); setOhOutside(true);
      handlePick({ id: h.id, firstName: h.firstName, lastName: h.lastName, unitNumber: h.unitNumber, status: h.status });
    },
    onError: (e: any) => setOhErr(e?.body?.message || e?.message || "Couldn't save. Try again."),
  });
  const ohValid = ohName.trim().length > 0 && ohDigits.length === 10;
  function confirmAdd() {
    if (!pending) return;
    addMut.mutate({ vid: pending.v.id, extra: true, v: pending.v });
    setPending(null);
  }

  return (
    <div className="fixed inset-0 z-[2000] bg-ink/50 flex items-start justify-center pt-16 px-4">
      <div onClick={(e) => e.stopPropagation()}
           className="relative z-[2001] bg-paper rounded-[18px] shadow-lift border border-line w-full max-w-md max-h-[85vh] overflow-hidden flex flex-col">
        <div className="px-5 py-3 border-b border-line">
          <div className="font-display font-semibold text-[18px]">Drivers on this pickup</div>
          <div className="text-[12px] text-muted mt-0.5">
            {pickup.suppliers || 'Pickup'} · {fmtDay(String(pickup.scheduled_date).slice(0, 10))} · {fmtTime(pickup.scheduled_time?.slice(0, 5) ?? '')}
          </div>
          <div className="mt-2.5 flex items-center gap-2">
            <span className="text-[11.5px] font-bold text-muted">Drivers needed:</span>
            <div className="flex items-center gap-1.5 bg-cream/60 rounded-full border border-line px-1.5 py-0.5">
              <button onClick={() => slotsMut.mutate(Math.max(1, (pickup.slots_capacity ?? 1) - 1))}
                      disabled={slotsMut.isPending || (pickup.slots_capacity ?? 1) <= 1}
                      className="grid h-6 w-6 place-items-center rounded-full text-muted hover:bg-paper disabled:opacity-40 haptic">−</button>
              <span className="font-display font-bold text-[14px] text-forest w-5 text-center">{pickup.slots_capacity ?? 1}</span>
              {/* Tier-2 fix #12: Math.min(20, …) already clamped the value
                  server-side, but the button itself stayed clickable at the
                  cap. Disable at 20 so the UI reflects the real ceiling. */}
              <button onClick={() => slotsMut.mutate(Math.min(20, (pickup.slots_capacity ?? 1) + 1))}
                      disabled={slotsMut.isPending || (pickup.slots_capacity ?? 1) >= 20}
                      className="grid h-6 w-6 place-items-center rounded-full text-forest hover:bg-paper disabled:opacity-40 haptic">+</button>
            </div>
            {slotsMut.isPending && <span className="text-[11px] text-muted">saving…</span>}
          </div>
        </div>
        {err && <div role="alert" className="px-4 py-2 border-b border-clay/30 bg-clay-soft text-[12.5px] font-bold text-clay">{err}</div>}

        {/* Currently assigned, with remove buttons */}
        {current.length > 0 && (
          <div className="px-4 py-3 border-b border-line bg-sage/30">
            <div className="text-[10.5px] font-extrabold uppercase tracking-[.05em] text-forest mb-2">Currently assigned</div>
            <div className="space-y-1.5">
              {current.map((s: any) => {
                const color = driverHue(`${s.first_name} ${s.last_name}`);
                return (
                  <div key={s.volunteer_id} className="flex items-center gap-2 bg-paper rounded-[10px] border border-sage-line px-2.5 py-1.5">
                    <span className="grid h-7 w-7 place-items-center rounded-full text-paper text-[10px] font-bold shrink-0" style={{ background: color }}>
                      {(s.first_name?.[0] ?? '') + (s.last_name?.[0] ?? '')}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-[13px] truncate">
                        {s.first_name} {s.last_name}
                        {s.unit_number != null && <span className="ml-1.5 text-muted font-semibold text-[11px]">#{s.unit_number}</span>}
                      </div>
                      <div className="text-[10.5px] text-muted">{s.role === 'backup' ? 'Backup' : 'Primary'} · {s.assignment_status}</div>
                    </div>
                    <button onClick={() => { void uiConfirm(`Remove ${s.first_name} ${s.last_name} from this pickup?\n\nThey get a text that they're off it, and if the pickup now needs a driver it is texted to drivers again as new.`).then((ok) => { if (ok) { removeMut.mutate(Number(s.volunteer_id)); } }); }}
                            className="text-clay grid h-7 w-7 place-items-center rounded-full hover:bg-clay-soft haptic">
                      <X size={13} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="p-3 border-b border-line">
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, unit # (#93), phone, area…"
                 className="w-full rounded-[10px] border-[1.4px] border-line bg-paper px-3 py-2.5 text-[13.5px] outline-none focus:border-forest" />
          {hiddenCount > 0 && (
            <label className="mt-2 flex items-center gap-2 text-[12px] font-semibold text-muted cursor-pointer select-none">
              <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} className="h-4 w-4 accent-forest" />
              Show everyone ({hiddenCount} new, inactive or do-not-contact {hiddenCount === 1 ? 'driver' : 'drivers'} hidden)
            </label>
          )}
        </div>
        {/* Oct 13 client: record someone who isn't on our list (an outside helper who covered it). */}
        <div className="border-b border-line">
          {!ohOpen ? (
            <button type="button" onClick={() => { setOhOpen(true); setOhErr(null); if (!ohName && q.trim() && !/\d/.test(q)) setOhName(q.trim()); }}
                    className="w-full text-left px-4 py-2.5 text-[13px] font-bold text-forest hover:bg-cream/40 haptic">
              + Someone not on our list
            </button>
          ) : (
            <div className="px-4 py-3 bg-cream/40 space-y-2">
              <div className="text-[12.5px] font-bold text-ink">Someone not on our list</div>
              <input value={ohName} onChange={(e) => setOhName(e.target.value)} placeholder="Name" aria-label="Name"
                     className="w-full rounded-[10px] border-[1.4px] border-line bg-paper px-3 py-2 text-[13.5px] outline-none focus:border-forest" />
              <input value={ohPhone} onChange={(e) => setOhPhone(e.target.value)} placeholder="Phone (10 digits)" aria-label="Phone" inputMode="tel"
                     className="w-full rounded-[10px] border-[1.4px] border-line bg-paper px-3 py-2 text-[13.5px] outline-none focus:border-forest" />
              {ohPhone.trim() !== '' && ohDigits.length !== 10 && <div className="text-[11.5px] text-clay">Phone must be 10 digits.</div>}
              <label className="flex items-center gap-2 text-[12.5px] font-semibold text-ink cursor-pointer select-none">
                <input type="checkbox" checked={ohOutside} onChange={(e) => setOhOutside(e.target.checked)} className="h-4 w-4 accent-forest" />
                Outside helper (don't add to texts)
              </label>
              {!ohOutside && <div className="text-[11.5px] text-muted">They'll be saved as a volunteer (active). They are not added to any text group.</div>}
              {ohErr && <div role="alert" className="text-[12px] font-bold text-clay">{ohErr}</div>}
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => { setOhOpen(false); setOhErr(null); }}
                        className="haptic text-[12.5px] font-bold text-muted px-3 py-1.5 rounded-[10px] hover:bg-cream">Cancel</button>
                <button type="button" onClick={() => ohMut.mutate()} disabled={!ohValid || ohMut.isPending || addMut.isPending}
                        className="haptic text-[12.5px] font-bold text-paper bg-forest px-3 py-1.5 rounded-[10px] shadow-ctag disabled:opacity-50">
                  {ohMut.isPending ? 'Saving…' : 'Save and add to pickup'}
                </button>
              </div>
            </div>
          )}
        </div>
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="text-[13px] text-muted text-center py-8">No drivers match.</div>
          ) : filtered.map((v) => {
            const color = driverHue(`${v.firstName} ${v.lastName}`);
            const already = currentIds.has(v.id);
            return (
              <button key={v.id} onClick={() => handlePick(v)} disabled={already || addMut.isPending}
                      className={cx('w-full text-left px-4 py-3 border-b border-line last:border-b-0 haptic flex items-center gap-3',
                                    already ? 'bg-cream/60 cursor-not-allowed' : 'hover:bg-cream/40')}>
                <span className="grid h-9 w-9 place-items-center rounded-full text-paper text-[11px] font-bold shrink-0" style={{ background: color }}>
                  {(v.firstName?.[0] ?? '') + (v.lastName?.[0] ?? '')}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-[13.5px] truncate">
                    {v.firstName} {v.lastName}
                    {(v as any).unitNumber != null && <span className="ml-1.5 text-muted font-semibold text-[11.5px]">#{(v as any).unitNumber}</span>}
                  </div>
                  <div className="text-[11px] text-muted truncate">
                    {[v.phonePrimary, v.locationArea].filter(Boolean).join(' · ')}
                  </div>
                  {/* Oct 9 client: why they're near the top. */}
                  <div className="mt-0.5 flex flex-wrap gap-1">
                    {rec.has(Number(v.id)) && <span className="text-[10px] font-extrabold py-0.5 px-1.5 rounded-full bg-forest text-paper">Recommended</span>}
                    {onCall.has(Number(v.id)) && <span className="text-[10px] font-bold py-0.5 px-1.5 rounded-full bg-sky-soft text-sky-deep">On call now</span>}
                    {Number(v.storeTrips ?? 0) > 0 && <span className="text-[10px] font-bold py-0.5 px-1.5 rounded-full bg-sage text-forest">Did this pickup {v.storeTrips}×</span>}
                    {Number(v.trips30d ?? 0) > 0 && <span className="text-[10px] font-bold py-0.5 px-1.5 rounded-full bg-line/70 text-muted">{v.trips30d} in 30 days</span>}
                    {isHidden(v) && <span className="text-[10px] font-bold py-0.5 px-1.5 rounded-full bg-clay-soft text-clay">{String(v.status).replace(/_/g, ' ')}</span>}
                    {String(v.status ?? '').toLowerCase() === 'outside_helper' && <span className="text-[10px] font-bold py-0.5 px-1.5 rounded-full bg-amber-soft text-[#8a6011]">Outside helper</span>}{/* Oct 13 client */}
                  </div>
                </div>
                {already ? (
                  <span className="text-[10.5px] font-bold py-0.5 px-2 rounded-full bg-sage text-forest">On pickup</span>
                ) : v.hasCar ? (
                  <span className="text-[10.5px] font-bold py-0.5 px-2 rounded-full bg-sage text-forest">Has car</span>
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="px-4 py-2 border-t border-line bg-cream/40 text-[11.5px] text-muted">
          Tip — adding more drivers than planned ({slotsNeeded}) requires confirmation.
        </div>
      </div>

      {/* Confirmation overlay — gates the 2nd+ driver add. */}
      {pending && (
        <div onClick={(e) => { e.stopPropagation(); setPending(null); }}
             className="fixed inset-0 z-[2100] bg-ink/60 flex items-center justify-center px-4">
          <div onClick={(e) => e.stopPropagation()}
               className="bg-paper rounded-[18px] shadow-lift border border-line w-full max-w-sm p-5">
            <div className="font-display font-semibold text-[18px]">Add an extra driver?</div>
            <p className="text-[13px] text-ink mt-2">
              <span className="font-bold">{pickup.suppliers || 'This pickup'}</span> is set for{' '}
              <span className="font-bold">{slotsNeeded} driver{slotsNeeded === 1 ? '' : 's'}</span> and already has{' '}
              <span className="font-bold">
                {pending.taken ? pending.taken.join(', ')
                  : current.map((s: any) => `${s.first_name} ${s.last_name}${s.unit_number != null ? ` #${s.unit_number}` : ''}`).join(', ')}
              </span>{' '}
              assigned. Adding <span className="font-bold">{pending.v.firstName} {pending.v.lastName}</span> will mean{' '}
              <span className="font-bold">{(pending.taken?.length ?? current.length) + 1} drivers</span> on this pickup — one more than planned.
            </p>
            <p className="text-[12px] text-muted mt-2">If you really need more drivers, bump "Drivers needed" first to plan it explicitly, or click below to add this one as an extra.</p>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setPending(null)}
                      className="haptic text-[13px] font-bold text-muted px-3 py-2 rounded-[10px] hover:bg-cream">
                Cancel
              </button>
              <button onClick={confirmAdd} disabled={addMut.isPending}
                      className="haptic text-[13px] font-bold text-paper bg-forest px-3 py-2 rounded-[10px] shadow-ctag disabled:opacity-50">
                {addMut.isPending ? 'Adding…' : 'Yes, add as extra driver'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Visual section break in the left nav. The horizontal rule + colored,
 * italicized label make it obvious at a glance where Operations ends and
 * Chat / Admin begins (the previous flat all-sage layout blurred them).
 */
// Oct 2: SectionDivider removed — sidebar is the nine-item menu now (UI plan §1).

const TAB_TITLE: Record<string, string> = {
  calendar: 'Calendar',
  live: 'Live Board', pickups: 'Pickups', volunteers: 'Drivers',
  suppliers: 'Suppliers', reports: 'Reports',
  'chat-stores': 'Chat with Stores', 'chat-volunteers': 'Chat with Drivers', 'driver-replies': 'Driver replies',
  'driver-messages': 'Driver messages', signups: 'New sign-ups', // Oct 11 client
  'who-gets-texts': 'Who gets texts', // Oct 11 client
  'texting-rules': 'How texting works', // Oct 14 client
  steady: 'Steady Pickups', shifts: 'Dispatching Shifts', 'center-help': 'Center Help', 'kiosk-activity': 'Kiosk Activity', 'whats-new': "What's new", 'app-usage': 'App Usage', settings: 'Settings',
  neighborhoods: 'Neighborhoods', coverage: 'Coverage map',
  'change-password': 'Change password',
  recruiting: 'Recruiting',
  tasks: 'Tasks & follow-ups',
  'holiday-sms': 'Holiday & SMS Controls',
  'my-shift': 'My Shift',
  'sms-combo': 'SMS Composer & Broadcast',
  'dispatchers-combo': 'Dispatchers',
  prospects: 'Prospects',
};
// Tier-2 fix #2: `live` subtitle was baked at module init, so the weekday /
// date string stayed frozen on the value the page had when the module first
// loaded. Compute it lazily via a getter so every render sees today's date.
const TAB_SUB: Record<string, string> & { live: string } = {
  calendar: 'Unified schedule — pickups, dispatcher shifts, center help',
  get live() {
    return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) + ' · rest of today';
  },
  pickups: 'Today, upcoming and past pickups', volunteers: 'Roster & availability',
  suppliers: 'Donors & status', reports: 'Pickup counts & driver activity',
  'chat-stores': 'In-app direct messages',
  'driver-replies': 'Every pickup text from drivers, and what happened',
  'driver-messages': 'Texts, app chat and replies to pickup texts — all in one place',
  'chat-volunteers': 'In-app direct messages',
  steady: 'Steady pickup schedules',
  shifts: 'Dispatcher & driver shifts — 5-min-before reminders auto-fire',
  signin: 'Drop-off sign-in sheet',
  'app-usage': 'Who is actually opening the mobile app — last seen, platform, version',
  'kiosk-activity': 'Live feed of drop-off kiosk sign-ins — driver, unit, items, labels printed',
  'whats-new': 'Every update with its date and when it went live',
  neighborhoods: 'Wesley Hills, Pomona, Monsey Center, New Square, …',
  coverage: 'Open and assigned pickups, suppliers and driver coverage',
  'change-password': 'Update your own portal login',
  recruiting: 'Calls, texts & follow-ups with volunteers and suppliers',
  tasks: 'Tasks, recruiting and follow-ups — assignee, due date, priority, history',
  'holiday-sms': 'Pause all texts (automatic and manual) · Shabbos / Yom Tov blackout windows',
  'my-shift': 'Your dispatching shifts — sign in when your shift starts',
  'sms-combo': 'Compose · groups · broadcast · WhatsApp',
  'dispatchers-combo': 'Roster (On Deck / Assigned) · SMS access · staff roles',
  settings: 'Admin · option lookups',
  prospects: 'Potential stores · pipeline · convert to supplier',
};

function CoordMap({ rows, suppliers, showVolunteers, onOpen }: { rows: PiRow[]; suppliers: any[]; showVolunteers: boolean; onOpen: (id: number) => void }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);

  // Real driver positions reported from the APK via POST /api/me/location.
  // Polled every 30s while the map is visible.
  const driverPositions = useQuery({
    queryKey: ['driver-locations'],
    queryFn:  () => locationApi.driverLocations(),
    refetchInterval: showVolunteers ? 30_000 : false,
    enabled: showVolunteers,
  });

  useEffect(() => {
    if (!ref.current || mapRef.current) return;
    const m = L.map(ref.current, { zoomControl: false, zoomDelta: 0.5, attributionControl: false }).setView([41.115, -74.069], 12);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap contributors' }).addTo(m);
    // Explicit topright placement so zoom controls don't collide with the
    // topleft legend panel (long-standing overlay bug fix).
    L.control.zoom({ position: 'topright' }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    mapRef.current = m;
    return () => { m.remove(); mapRef.current = null; layer.current = null; };
  }, []);

  useEffect(() => {
    const m = mapRef.current; const lyr = layer.current;
    if (!m || !lyr) return;
    lyr.clearLayers();

    // abc871 (Aug 17): the map used to plot every one of ~300 pickups in the
    // dataset AND up to 30 suppliers, each at a Math.random() offset. Result
    // was a wall of pins across Monsey that told the dispatcher nothing.
    //
    // Now: only actionable pickups (unresolved, today + tomorrow), and only
    // suppliers that actually appear in that scoped set. Positions are hashed
    // from the supplier name so pins are stable across re-renders and the
    // same donor lands in the same spot every time.
    const _hash = (s: string) => {
      let h = 5381;
      for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
      return h;
    };
    const _pinFor = (key: string): [number, number] => {
      const h = _hash(key || 'x');
      // Deterministic offset from Monsey center. Two independent axes from
      // upper and lower halves of the 32-bit hash so lat/lng aren't correlated.
      const rx = ((h >>> 0) % 10000) / 10000 - 0.5;
      const ry = ((h >>> 16) % 10000) / 10000 - 0.5;
      return [41.115 + rx * 0.06, -74.069 + ry * 0.10];
    };
    // Tier-3 fix: two suppliers (or two pickups) with the same name-derived
    // key would land on identical coords — only one pin would appear on the
    // map because Leaflet stacks them perfectly. Track claims and nudge each
    // duplicate by a small lat epsilon so all pins stay clickable and visible.
    const _used = new Map<string, number>();
    const _uniquePinFor = (key: string): [number, number] => {
      const [lat, lng] = _pinFor(key);
      const bucket = `${lat.toFixed(5)},${lng.toFixed(5)}`;
      const n = _used.get(bucket) ?? 0;
      _used.set(bucket, n + 1);
      // ~5.5m per 0.00005 lat — enough to separate markers visually without
      // moving them off the donor's neighborhood.
      return [lat + n * 0.00005, lng + n * 0.00005];
    };
    const _todayNY = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const _tomorrowNY = new Date(Date.now() + 86_400_000).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const _actionable = rows.filter((p) => {
      const d = String(p.scheduled_date ?? '').slice(0, 10);
      if (d !== _todayNY && d !== _tomorrowNY) return false;
      const s = String(p.status ?? '').toLowerCase();
      if (['completed', 'delivered', 'cancelled', 'missed'].includes(s)) return false;
      return true;
    });
    const _supplierNamesOnMap = new Set(_actionable.map((p) => p.suppliers).filter(Boolean));
    const _suppliersInScope = suppliers.filter((s: any) => _supplierNamesOnMap.has(s.name));

    // Suppliers (donor sites) — small square markers, colored per supplier so
    // a single donor has one color identity across Places list, map, and feed.
    _suppliersInScope.forEach((s: any) => {
      const color = supplierHue(s.name ?? String(s.id));
      const initial = String(s.name ?? 'S').trim().slice(0, 1).toUpperCase();
      const [lat, lng] = _uniquePinFor('supplier:' + (s.name ?? String(s.id)));
      const html = `<div style="width:22px;height:22px;background:${color};border:2px solid #fff;border-radius:5px;display:grid;place-items:center;color:#fff;font-weight:800;font-size:11px;box-shadow:0 3px 6px rgba(0,0,0,.25)">${initial}</div>`;
      L.marker([lat, lng], { icon: L.divIcon({ html, className: '', iconSize: [22, 22], iconAnchor: [11, 11] }) }).addTo(lyr);
    });

    // Pickups — teardrop pins with a "P" label, color = supplier color so
    // each pickup carries its donor's color identity. Status shows on a
    // small indicator ring inside the pin.
    _actionable.forEach((p) => {
      const color = p.suppliers ? supplierHue(p.suppliers) : '#2C5A3B';
      const html = `<div style="position:relative;width:30px;height:36px;filter:drop-shadow(0 4px 4px rgba(0,0,0,.28))">
        <svg width="30" height="36" viewBox="0 0 24 28" fill="${color}"><path d="M12 2C7.5 2 4 5.5 4 10c0 6 8 16 8 16s8-10 8-16c0-4.5-3.5-8-8-8z"/></svg>
        <span style="position:absolute;inset:2px 0 0 0;display:grid;place-items:center;color:#fff;font-weight:800;font-size:11px">P</span>
      </div>`;
      const [lat, lng] = _uniquePinFor('pickup:' + (p.suppliers ?? String(p.id)));
      L.marker([lat, lng], { icon: L.divIcon({ html, className: '', iconSize: [30, 36], iconAnchor: [15, 36] }) })
        .on('click', () => onOpen(p.id))
        .addTo(lyr);
    });

    // Drivers — circular badge with initials. Color = driverHue(name) so the
    // same person carries one color across the Places list, the feed pill,
    // and this marker. Tooltip on hover shows "Reported X min ago".
    if (showVolunteers) {
      (driverPositions.data?.data ?? []).forEach((d) => {
        const fullName = `${d.first_name} ${d.last_name}`;
        const color = driverHue(fullName);
        const initials = ((d.first_name?.[0] ?? '') + (d.last_name?.[0] ?? '')).toUpperCase();
        const lat = Number(d.lat); const lng = Number(d.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
        const ageMin = Math.max(0, Math.round((Date.now() - new Date(d.reported_at).getTime()) / 60000));
        const stale = ageMin > 10;
        const html = `<div style="position:relative;width:36px;height:36px">
          <div style="position:absolute;inset:-6px;border-radius:50%;background:${color};opacity:${stale ? 0.10 : 0.20}"></div>
          <div style="position:absolute;inset:0;border-radius:50%;background:${color};border:3px solid #fff;display:grid;place-items:center;color:#fff;font-weight:800;font-size:12px;box-shadow:0 3px 8px rgba(0,0,0,.30);${stale ? 'opacity:0.7;filter:grayscale(0.4);' : ''}">${initials}</div>
        </div>`;
        L.marker([lat, lng], { icon: L.divIcon({ html, className: '', iconSize: [36, 36], iconAnchor: [18, 18] }) })
          .bindTooltip(`${fullName} · ${ageMin === 0 ? 'just now' : `${ageMin} min ago`}`, { direction: 'top' })
          .addTo(lyr);
      });
    }
  }, [rows, suppliers, onOpen, showVolunteers, driverPositions.data]);

  return (
    <div className="w-full h-full relative" style={{ background: '#F4F8F0' }}>
      <div ref={ref} className="w-full h-full" />
      {/* Legend — explains the symbology to the coordinator */}
      <div className="absolute top-3 left-3 z-[400] bg-paper rounded-[12px] border border-line shadow-card px-3 py-2 text-[11px]">
        <div className="font-extrabold uppercase tracking-[.05em] text-muted mb-1.5">Legend</div>
        <div className="flex items-center gap-2 mb-1">
          <span className="inline-grid place-items-center w-[18px] h-[22px] text-paper font-extrabold text-[10px] rounded-sm" style={{ background: '#2C5A3B', clipPath: 'polygon(50% 100%, 0 40%, 25% 0, 75% 0, 100% 40%)' }}>P</span>
          <span className="text-ink font-semibold">Pickup</span>
        </div>
        <div className="flex items-center gap-2 mb-1">
          <span className="inline-grid place-items-center w-[18px] h-[18px] text-paper font-extrabold text-[10px] rounded-[4px]" style={{ background: '#3E6F8E' }}>S</span>
          <span className="text-ink font-semibold">Supplier</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-grid place-items-center w-[18px] h-[18px] text-paper font-extrabold text-[10px] rounded-full border-2 border-white" style={{ background: '#D27A4C' }}>D</span>
          <span className="text-ink font-semibold">Driver <span className="text-muted italic">(live GPS)</span></span>
        </div>
      </div>
    </div>
  );
}

function CoordRow({ p, onAssign, onOpen, onEdit, onDuplicate, allowDriverCancel }: { p: PiRow; onAssign: () => void; onOpen: () => void; onEdit?: () => void; onDuplicate?: () => void; allowDriverCancel?: boolean }) {
  const time = fmtTime(p.scheduled_time?.slice(0, 5) ?? '');
  // Oct 13 client: reposted → a "Reposted" tag with when + the real time; past its time it reads "Now".
  const _repost = repostOpen(p);
  const _repostNow = _repost && isPastDueNy(p.scheduled_date, p.scheduled_time);
  const [showDismiss, setShowDismiss] = useState(false);
  // Oct 6 client: on a phone, show the main buttons; the rest behind "More".
  const [moreActs, setMoreActs] = useState(false);
  const [showSendChoice, setShowSendChoice] = useState(false);
  const [showDriverCancel, setShowDriverCancel] = useState(false);
  const [showMoreDrivers, setShowMoreDrivers] = useState(false);
  const qc = useQueryClient();
  // upsms (Aug 20): per-pickup "Send now" broadcast. Only shows on Needs-a-
  // Driver cards (no signups, not supplier-posted, not resolved). Confirms
  // before firing so a mis-tap doesn't blast the group.
  const sendNowMut = useMutation({
    // Oct 8: real sends go through sendPickupNowConfirmed (asks before re-sending).
    mutationFn: async (dryRun: boolean) => (dryRun
      ? (await upcomingSms.pickupSendNow(Number((p as any).id), true)).data
      : await sendPickupNowConfirmed(Number((p as any).id))),
    onSuccess: (d, dryRun) => {
      if (!d) return; // office chose not to re-send
      // Oct 9 client: in-page notices, not browser alert boxes.
      if (dryRun) {
        uiNotify(`Preview (dry run) — would go to ${d.wouldGoTo ?? 0} driver(s):\n\n${d.preview ?? '(no preview body)'}`, 'info');
      } else if (d.reason && !d.sent) {
        uiNotify(smsReasonText(d.reason), 'info');
      } else {
        uiNotify(`${textedText(d.sent, d.attempted)}${d.code ? ` (reply code: ${d.code})` : ''}`, 'ok');
      }
      qc.invalidateQueries({ queryKey: ['admin-pickups'] });
      qc.invalidateQueries({ queryKey: ['upcoming-drop'] });
    },
    onError: (e: Error) => uiNotify(`Send now failed: ${e.message}`, 'err'),
  });
  // Issue #13/14/15 Aug 10 — a pickup with no driver yet isn't "overdue",
  // it's "looking for a driver". Show wait time in a calm/warm chip.
  // Truly late (has an assigned driver but past window) keeps the red tone.
  const _statusLower = String(p.status || '').toLowerCase();
  const _startMs = new Date(p.scheduled_date.slice(0, 10) + 'T' + (p.scheduled_time || '00:00:00')).getTime();
  const _resolved = ['completed', 'delivered', 'cancelled'].includes(_statusLower);
  const _hasPrimary = ((p as any).signups ?? []).some((s: any) => !s.role || s.role === 'primary');
  const _mustByMs = (p as any).must_pickup_by ? new Date((p as any).must_pickup_by).getTime() : null;
  const _nowMs = Date.now();
  // "Wait since" — for supplier-posted, that's when they posted (created_at).
  // For scheduled pickups, once the scheduled time passes we've been "looking"
  // since then.
  //
  // abc855 → abc863 (Aug 14/16): a pickup whose scheduled_time is in the
  // future should NEVER show a wait counter — regardless of whether it was
  // posted by a supplier or a coordinator. Earlier version only guarded
  // scheduled (non-supplier) pickups; client kept seeing "9h 50m" on
  // supplier-posted futures.
  const _isSupplierPosted = !!(p as any).posted_via_supplier;
  const _isFutureScheduled = _nowMs < _startMs;
  const _waitStartMs = _repostNow && p.requeued_at ? new Date(p.requeued_at).getTime() // Oct 13 client: waiting since reposted
    : _isSupplierPosted && (p as any).created_at
    ? new Date((p as any).created_at).getTime()
    : _startMs;
  const _waitMin = _isFutureScheduled ? 0 : Math.max(0, Math.round((_nowMs - _waitStartMs) / 60_000));
  // abc820 (Aug 11): cap displayed wait time so a stale row from weeks ago
  // doesn't scream "1445h 37m" — anything > 24h reads as "24h+".
  const _waitLabel = _isFutureScheduled
    ? `starts at ${fmtTime((p.scheduled_time || '').slice(0, 5))}`
    : _waitMin < 60
    ? `${_waitMin} min`
    : _waitMin < 24 * 60
    ? `${Math.floor(_waitMin / 60)}h ${_waitMin % 60}m`
    : '24h+';
  // Issue #17 Aug 10: fully-covered pickups get NO warning, no red border —
  // if the coordinator has already filled the slots, dispatch is done.
  // Truly late fires only when there's a driver AND the drop-off must-by is
  // past AND still not picked up (a real problem the dispatcher can act on).
  // Any past-scheduled + assigned pickup that hasn't hit must_pickup_by yet
  // reads calm.
  const _slotsNeeded = Number((p as any).slots_capacity ?? 1) || 1;
  const _slotsFilled = ((p as any).signups ?? []).length;
  const isFullyCovered = _slotsFilled >= _slotsNeeded;
  // Oct 7 client: store posts included in late / looking-for-driver too.
  const isTrulyLate = !_resolved && !isFullyCovered
    && _mustByMs != null && _nowMs > _mustByMs
    && _hasPrimary && !['picked_up', 'delivered'].includes(_statusLower);
  // Looking for a driver = unassigned + past the scheduled start.
  const isLookingForDriver = !_resolved && !isFullyCovered
    && _nowMs > _startMs;
  // (isTrulyLate + isLookingForDriver together replace the old single "isOverdue"
  // flag — each drives its own visual treatment below.)
  // Oct 2 review item 2: drivers beyond the slots needed are standby backups
  // (primary first), so a 1-driver pickup never reads "2 drivers".
  const _cap = Number((p as any).slots_capacity ?? 1) || 1;
  const _allDrivers = [...(p.signups ?? [])]
    .sort((a: any, b: any) => (a.role === 'backup' ? 1 : 0) - (b.role === 'backup' ? 1 : 0))
    .map((s) => ({
      initials: (s.first_name?.[0] ?? '') + (s.last_name?.[0] ?? ''),
      full: `${s.first_name} ${s.last_name}${s.unit_number != null ? ` #${s.unit_number}` : ''}`,
    }));
  const filled = _allDrivers.slice(0, _cap);
  const backups = _allDrivers.slice(_cap);
  // §1: the row's status pill uses the office-facing label ("Volunteer Needed"
  // etc.) instead of the raw DB status ("scheduled" / "confirmed" / ...).
  const office = officeStatusOf(p);
  const spill = OFFICE_SPILL[office];
  // Oct 11 client: a cancelled pickup (office "Dismiss", store cancel, …) showed
  // no tag and still offered "Assign driver" in History. Show "Cancelled".
  const _cancelled = _statusLower === 'cancelled' || !!(p as any).cancelled_at;
  // Left stripe = supplier color (same as map marker + Places list dot) so
  // every visual surface uses one identity per donor.
  const stripeColor = p.suppliers ? supplierHue(p.suppliers) : null;
  // Prefer donor identity for the headline; then the steady_pickups template
  // name (e.g. "Bites cafe" for instances materialized from a template that
  // has no supplier attached yet); then contact_name / pickup_address so
  // one-time pickups don't read as anonymous "Pickup".
  // Oct 8 client: deliveries (from 3 Regina to a family) lead with the family.
  const _dlv = (p as any).delivery_to_name as string | null | undefined;
  const primaryLabel = _dlv ? `Delivery to ${_dlv}` : (p.suppliers || p.steady_name || p.contact_name || p.pickup_address || 'One-time pickup');
  // Secondary line: food description, then address/notes. Address is worth
  // its own line when different from the primary label, so the driver knows
  // WHERE to go at a glance.
  const foodLine = p.food_description || null;
  const contactLine = !p.suppliers && p.contact_phone && p.contact_name !== primaryLabel
    ? `${p.contact_name ? p.contact_name + ' · ' : ''}${p.contact_phone}`
    : null;
  // Oct 7 client: one time on the card, never a "2:00 PM–10:00 PM" range
  // (the end was just how long drivers keep getting offered it). Store posts
  // also show when they came in.
  const cameInLine = (() => {
    if (!(p as any).posted_via_supplier || !(p as any).created_at) return null;
    try {
      return new Date((p as any).created_at).toLocaleTimeString('en-US',
        { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/New_York' });
    } catch { return null; }
  })();
  // Oct 8 client: red flag when a store posted 15+ minutes ago and still has no driver.
  const storeWaitMin = (() => {
    if (!(p as any).posted_via_supplier || !(p as any).created_at || _resolved || isFullyCovered) return 0;
    if (((p as any).signups ?? []).some((s: any) => !s.released_at)) return 0;
    const m = Math.round((_nowMs - new Date((p as any).created_at).getTime()) / 60_000);
    return m >= 15 ? m : 0;
  })();
  // Address for the card: xyz126 (Aug 20) — a user-specified pickup_address
  // ALWAYS wins over the supplier's stored address. Reason: for one-off
  // events (e.g. a supplier-anchored hall booking a specific venue for one
  // pickup), the coordinator picks a Google Places result that differs from
  // the supplier's default address. Previously the render short-circuited on
  // supplier_address and hid the manually-picked address entirely.
  const displayAddress = (() => {
    if (_dlv) return `${(p as any).delivery_to_address || 'no address'}  ·  from ${p.pickup_address || '3 Regina Road'}`;
    if (p.pickup_address && p.pickup_address.trim()) return p.pickup_address;
    if (p.supplier_address) {
      return p.supplier_city ? `${p.supplier_address}, ${p.supplier_city}` : p.supplier_address;
    }
    return null;
  })();
  const showAddress = displayAddress && displayAddress !== primaryLabel;
  // Oct 2 client fix (UI plan §1–§2 "neater cards"): info on the left, every
  // action in one fixed right-hand column in the same order on every card
  // (Assign driver · Edit · Send SMS · Dismiss, + Driver cancel / Duplicate on
  // Pickups views). On phones the actions drop below as a 2-column grid.
  const btn = 'w-full text-[12px] font-bold border px-2.5 py-1.5 rounded-[9px] haptic text-center whitespace-nowrap';
  // Item 4: the server's remaining-slot count (same rule as every SMS).
  const _srvRemaining = (p as any).slots_remaining;
  const needDrivers = _resolved ? 0
    : _srvRemaining != null ? Math.max(0, Number(_srvRemaining))
    : (!isFullyCovered ? _slotsNeeded - _slotsFilled : 0);
  return (
    <div onClick={onOpen} className={cx(
        'haptic cursor-pointer bg-paper rounded-[14px] overflow-hidden hover:shadow-card transition',
        isTrulyLate ? 'border-2 border-clay' : needDrivers > 0 ? 'border border-amber/60' : 'border border-line')}>
      <div className="flex">
        {/* Oct 6 client: no color stripe — keep cards clean. */}
        {false && stripeColor && <div className="w-1.5 shrink-0" style={{ background: stripeColor! }} />}
        <div className="flex-1 min-w-0 p-3.5 sm:grid sm:grid-cols-[1fr_136px] sm:gap-4">
          {/* LEFT — what / where / when / who */}
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              <span className="font-display font-bold text-[14px] text-forest">
                {_repostNow ? 'Now' : time}
              </span>
              {/* Oct 13 client: the office sees it was reposted, when, and the time it was for. */}
              {_repost && p.requeued_at && (
                <span className="inline-flex items-center font-extrabold text-forest bg-sage border border-sage-line rounded-full px-2 py-0.5"
                      title="Put back in the queue. Drivers see it as now, not its old time.">🔁 {repostedLabel(p.requeued_at, p.scheduled_date, p.scheduled_time)}</span>
              )}
              {cameInLine && <span className="font-bold text-muted">store posted {cameInLine}</span>}
              {storeWaitMin > 0 && (
                <span className="inline-flex items-center font-extrabold text-paper bg-clay rounded-full px-2 py-0.5">
                  No driver yet · {storeWaitMin < 60 ? `${storeWaitMin} min` : `${Math.floor(storeWaitMin / 60)}h ${storeWaitMin % 60}m`}
                </span>
              )}
              <span className="font-extrabold tracking-wider text-muted">#{p.ref_number ?? p.id}</span>
              {(p as any).reply_code != null && (
                <><span className="inline-flex items-center font-bold text-sky-deep bg-sky-soft rounded-full px-2 py-0.5">Text code {(p as any).reply_code}<Tip text="The number drivers see in their text. They reply with it to take the pickup." /></span></>
              )}
              {_dlv
                ? <span className="font-extrabold tracking-wider bg-sage text-forest px-1.5 py-0.5 rounded-full">🚚 DELIVERY</span>
                : p.steady_pickup_id != null
                ? <span className="font-extrabold tracking-wider bg-sky-soft text-sky-deep px-1.5 py-0.5 rounded-full">STEADY</span>
                : <span className="font-extrabold tracking-wider bg-amber-soft text-[#9a7415] px-1.5 py-0.5 rounded-full">ONE-TIME</span>}
              {/* Oct 13 client: food a store sent through its app — clear at a glance. */}
              {(p as any).posted_via_supplier && <span className="font-extrabold tracking-wider bg-[#EFE4F6] text-[#6B3B8C] px-1.5 py-0.5 rounded-full" title="The store sent this through its app">📱 STORE APP</span>}
              {/* Oct 14 client: who filled out the form (Store app already has its own badge). */}
              {(() => {
                const sb = String((p as any).submitted_by ?? '').trim();
                if (sb === 'Store app' || (p as any).posted_via_supplier) return null;
                // Oct 14 client: always show it, so the office is never left guessing.
                if (!sb) return <span className="font-bold bg-line/40 text-muted/80 px-1.5 py-0.5 rounded-full" title="Who filled out the form wasn't recorded">✍️ Not recorded</span>;
                return <span className="font-bold bg-line/60 text-muted px-1.5 py-0.5 rounded-full" title="Form filled out by">✍️ {/^Text\b/.test(sb) ? 'By text' : submittedByLabel(sb)}</span>;
              })()}
              {p.is_test && <span className="font-extrabold tracking-wider bg-amber/20 text-forest-deep px-1.5 py-0.5 rounded-full">🧪 TEST</span>}
              {_cancelled ? (
                // Oct 14 client: who cancelled it and when, small and grey under the pill (+ the reason).
                <span className="inline-flex flex-col items-start leading-tight">
                  <span title={String((p as any).cancellation_reason ?? '').replace(/^dismissed:\s*/i, '') || undefined}
                        className="font-bold px-2 py-0.5 rounded-full bg-line/70 text-muted">Cancelled</span>
                  {cancelledLine(p, true) && (
                    <span className="mt-0.5 max-w-[280px] truncate text-[11px] font-normal text-muted" title={cancelledLine(p, true)}>{cancelledLine(p, true)}</span>
                  )}
                </span>
              ) : office !== 'need' && office !== 'assigned' && (
                <span className={cx('font-bold px-2 py-0.5 rounded-full', spill.bg, spill.fg)}>{spill.label}</span>
              )}
              {/* Oct 5: kiosk verification shown separately from the outcome. */}
              {office === 'complete' && (
                (p as any).kiosk_verified
                  ? <span className="font-bold px-2 py-0.5 rounded-full bg-sage text-forest">✓ Kiosk</span>
                  : <span className="font-bold px-2 py-0.5 rounded-full bg-line/70 text-muted">No kiosk</span>
              )}
              {isTrulyLate && (
                <span className="font-bold uppercase tracking-wide bg-clay text-paper px-2 py-0.5 rounded-full">Late · {_waitLabel}</span>
              )}
            </div>
            <div className="font-display font-bold text-[16px] text-ink leading-tight truncate">{primaryLabel}</div>
            {showAddress && <div className="text-[12px] text-muted truncate">📍 {displayAddress}</div>}
            {contactLine && <div className="text-[12px] text-muted truncate">☎ {contactLine}</div>}
            {/* Oct 14 client: 📷 thumbnail of the store's photo next to the food line (tap = large). */}
            {(p as any).store_photo_url ? (
              <div className="flex items-center gap-2 min-w-0 my-0.5">
                <StorePhotoThumb url={(p as any).store_photo_url} size={40} />
                {foodLine && <div className="text-[12px] text-ink truncate min-w-0">{foodLine}{p.estimated_quantity ? ` · ${p.estimated_quantity}` : ''}</div>}
              </div>
            ) : foodLine && <div className="text-[12px] text-ink truncate">{foodLine}{p.estimated_quantity ? ` · ${p.estimated_quantity}` : ''}</div>}
            {((p as any).pickup_instructions || (p as any).special_instructions) && (
              <div className="text-[12px] text-forest-deep font-semibold line-clamp-2">
                ⚠ {[(p as any).pickup_instructions, (p as any).special_instructions].filter(Boolean).filter((x: string, i: number, a: string[]) => a.indexOf(x) === i).join(' · ')}
              </div>
            )}
            {!foodLine && !showAddress && !contactLine && p.notes && (
              <div className="text-[12px] text-muted line-clamp-2">{p.notes}</div>
            )}
            <div className="pt-0.5 text-[12px] font-bold">
              {filled.length > 0 && (
                <span className="inline-flex items-center gap-1.5 text-forest">
                  <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: driverHue(filled[0]!.full) }} />
                  {filled.map((f) => f.full).join(', ')}
                </span>
              )}
              {backups.length > 0 && (
                <span className="ml-2 text-muted font-semibold">Backup: {backups.map((b) => b.full).join(', ')}</span>
              )}
              {needDrivers > 0 && (
                <span className={cx('text-clay', filled.length > 0 && 'ml-2')}>
                  Needs {needDrivers} {needDrivers === 1 ? 'driver' : 'drivers'}
                  {isLookingForDriver && !isTrulyLate ? ` · waiting ${_waitLabel}` : ''}
                </span>
              )}
            </div>
            {/* Oct 12 client: how many drivers the next text will reach and when; how many times it was sent. Tap = who got it. */}
            {((needDrivers > 0 && !_cancelled) || (p as any).reply_code != null) && (
              <PickupTextLines pickupId={Number(p.id)}
                               sig={`${(p as any).auto_broadcast_sent_at ?? ''}|${needDrivers}|${p.status ?? ''}|${(p as any).reply_code ?? ''}|${_cancelled ? 1 : 0}`} />
            )}
            {/* Oct 13 client: "Asked store 2:00 PM · waiting" / "Store said YES" / "Donor told 3:12 PM" / CANCEL tag. */}
            <StoreTextLines p={p} />
          </div>

          {/* RIGHT — actions, fixed order */}
          <div onClick={(e) => e.stopPropagation()}
               className="mt-3 sm:mt-0 grid grid-cols-2 sm:grid-cols-1 gap-1.5 content-start">
            {!_cancelled && (filled.length === 0 || (!isFullyCovered && !_resolved)) && (
              <button onClick={onAssign} className={cx(btn, 'text-forest border-sage-line bg-sage')}>
                {filled.length === 0 ? 'Assign driver' : '+ Add driver'}
              </button>
            )}
            {/* Oct 2 client: ask for more drivers even when the pickup is covered. */}
            {allowDriverCancel && !_resolved && (
              <button onClick={() => setShowMoreDrivers(true)} className={cx(btn, 'border-sage-line text-forest hover:bg-sage/60', moreActs ? '' : 'hidden sm:block')}
                      title="Add another driver or open more driver slots">Need more drivers</button>
            )}
            {onEdit && (
              <button onClick={onEdit} className={cx(btn, 'border-line text-ink hover:bg-cream', moreActs ? '' : 'hidden sm:block')} title="Edit, reschedule, reassign">Edit</button>
            )}
            {/* Oct 9 client: expired with no driver — repost it right from the card. */}
            {office === 'expired' && (
              <RepostButton pickupId={Number(p.id)} className={cx(btn, 'border-forest/50 text-forest hover:bg-sage/60')} />
            )}
            {/* Oct 7 client: Send SMS on store posts too. */}
            {needDrivers > 0 && (
              <button onClick={() => setShowSendChoice(true)} disabled={sendNowMut.isPending}
                      className={cx(btn, 'border-sky/40 text-sky hover:bg-sky/10', sendNowMut.isPending && 'bg-sky/15 animate-pulse')}
                      title="Text drivers about this pickup, or about every open pickup">
                {sendNowMut.isPending ? 'Sending…' : 'Send SMS'}
              </button>
            )}
            {!_resolved && (
              <button onClick={() => setShowDismiss(true)} className={cx(btn, 'border-clay/40 text-clay hover:bg-clay/10', moreActs ? '' : 'hidden sm:block')}
                      title="Close this pickup with a reason">Dismiss</button>
            )}
            {allowDriverCancel && filled.length > 0 && !_resolved && (
              <button onClick={() => setShowDriverCancel(true)} className={cx(btn, 'border-clay/40 text-clay hover:bg-clay/10', moreActs ? '' : 'hidden sm:block')}
                      title="A driver can't make it — record why and reopen their slot">Driver cancel</button>
            )}
            {onDuplicate && (
              <button onClick={onDuplicate} className={cx(btn, 'border-line text-ink hover:bg-cream', moreActs ? '' : 'hidden sm:block')}
                      title="Copy this pickup to a new date / time">Duplicate</button>
            )}
            {(onEdit || onDuplicate || !_resolved) && (
              <button onClick={() => setMoreActs((v) => !v)} className={cx(btn, 'sm:hidden col-span-2 border-line text-muted')}>
                {moreActs ? 'Fewer options' : 'More options…'}
              </button>
            )}
          </div>
        </div>
      </div>
      {showDismiss && createPortal(
        <DismissPickupModal p={p} onClose={() => setShowDismiss(false)} />,
        document.body,
      )}
      {showMoreDrivers && createPortal(
        <NeedMoreDriversModal p={p}
          onAddSpecific={() => { setShowMoreDrivers(false); onAssign(); }}
          onOpened={(textNow) => { setShowMoreDrivers(false); if (textNow) setShowSendChoice(true); }}
          onClose={() => setShowMoreDrivers(false)} />,
        document.body,
      )}
      {showDriverCancel && createPortal(
        <DriverCancelModal p={p} onClose={() => setShowDriverCancel(false)} />,
        document.body,
      )}
      {showSendChoice && createPortal(
        <SendSmsChoiceModal p={p}
                            onSendThis={() => { setShowSendChoice(false); sendNowMut.mutate(false); }}
                            onClose={() => setShowSendChoice(false)} />,
        document.body,
      )}
    </div>
  );
}

// Oct 2 client fix (UI plan §2): Send SMS asks what to send. "All open" is a
// mass text, so it shows a dry-run count first and needs a second OK.
function SendSmsChoiceModal({ p, onSendThis, onClose }: { p: any; onSendThis: () => void; onClose: () => void }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Oct 14 client: name the pickup (e.g. "Hive Discount Store · 9:00 AM") instead of its id,
  // and show how many open pickups "send all" would include.
  const pickupName = String(p.suppliers || p.steady_name || p.donor_name || p.contact_name || 'This pickup').trim();
  const pickupTime = p.scheduled_time ? fmtTime(String(p.scheduled_time).slice(0, 5)) : '';
  const openCount = useQuery({ queryKey: ['send-all-preview'], queryFn: async () => (await upcomingSms.sendNow(true)).data, staleTime: 30_000 });
  const nOpen = openCount.data?.pickups;
  async function sendAll() {
    setBusy(true); setErr(null);
    try {
      const preview = (await upcomingSms.sendNow(true)).data;
      if (!preview.pickups) { alert('There are no open pickups to send right now.'); onClose(); return; }
      const who = preview.recipients != null ? ` to ${preview.recipients} driver(s)` : '';
      if (!(await uiConfirm(`Send ${preview.pickups} open pickup(s)${who} now?`))) { setBusy(false); return; }
      const d = (await upcomingSms.sendNow(false)).data;
      alert(d.skipped ? smsReasonText(d.skipped) : textedText(d.sent, d.recipients));
      qc.invalidateQueries({ queryKey: ['admin-pickups'] });
      qc.invalidateQueries({ queryKey: ['upcoming-drop'] });
      onClose();
    } catch (e: any) {
      setErr(e?.message || 'Send failed'); setBusy(false);
    }
  }
  return (
    <div className="fixed inset-0 z-[2100] bg-ink/50 flex items-start justify-center pt-16 px-4">
      <div onClick={(e) => e.stopPropagation()} className="relative z-[2101] bg-paper rounded-[18px] shadow-lift border border-line w-full max-w-sm p-5 space-y-3">
        <div className="font-display font-semibold text-[16px]">Send SMS</div>
        <div className="text-[12.5px] text-muted">What should drivers be texted about?</div>
        <button disabled={busy} onClick={onSendThis}
                className="haptic w-full text-left rounded-[12px] border border-sky/40 px-4 py-3 hover:bg-sky/10">
          <div className="text-[13px] font-extrabold text-sky-deep">Send only this pickup</div>
          <div className="text-[11px] text-muted">{pickupName}{pickupTime ? ` · ${pickupTime}` : ''}</div>
        </button>
        <button disabled={busy} onClick={sendAll}
                className="haptic w-full text-left rounded-[12px] border border-sky/40 px-4 py-3 hover:bg-sky/10">
          <div className="text-[13px] font-extrabold text-sky-deep">{busy ? 'Checking…' : `Send all currently open pickups${typeof nOpen === 'number' ? ` (${nOpen})` : ''}`}</div>
          <div className="text-[11px] text-muted">Shows how many first and asks again before sending.</div>
        </button>
        {err && <div className="text-[12px] text-clay">{err}</div>}
        <button onClick={onClose} className="haptic w-full rounded-[12px] border border-line px-4 py-2.5 text-[13px] font-bold text-muted hover:bg-cream">Cancel</button>
      </div>
    </div>
  );
}

// Oct 2 client fix (UI plan §4 "Driver cancellation"): cancel ONE driver,
// record why, keep the history, reopen only that slot (backend:
// POST /pickup-instances/:id/driver-cancel).
const DRIVER_CANCEL_REASONS = ['Driver unavailable / sick', 'Car trouble', 'Schedule conflict', 'No reason given', 'Other'];
function RecurringEditChoiceModal({ p, loading, onOccurrence, onSchedule, onClose }: {
  p: PiRow; loading: boolean;
  onOccurrence: () => void; onSchedule: (fromThisDate: boolean) => void; onClose: () => void;
}) {
  const day = new Date(String(p.scheduled_date).slice(0, 10) + 'T12:00:00')
    .toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  const opt = 'haptic w-full text-left rounded-[12px] border border-line px-4 py-3 hover:bg-cream/60 disabled:opacity-50';
  return (
    <div className="fixed inset-0 z-[2100] bg-ink/50 flex items-start justify-center pt-16 px-4">
      <div onClick={(e) => e.stopPropagation()} className="relative z-[2101] bg-paper rounded-[18px] shadow-lift border border-line w-full max-w-sm p-5 space-y-3">
        <div className="font-display font-semibold text-[16px]">Edit steady pickup</div>
        <div className="text-[12.5px] text-muted">{p.steady_name || p.suppliers || 'Steady pickup'} · {day}</div>
        <button onClick={onOccurrence} className={opt}>
          <div className="text-[13px] font-extrabold text-forest">This occurrence only</div>
          <div className="text-[11px] text-muted">Change just the {day} pickup.</div>
        </button>
        {/* Oct 2 client: for today's pickup the two schedule options were
            identical, so only one shows; for a later pickup the wording says
            exactly which pickups change. */}
        {/* Oct 5 client: "merge 2 and 3" — one schedule option. */}
        <button disabled={loading} onClick={() => onSchedule(true)} className={opt}>
          <div className="text-[13px] font-extrabold text-forest">This and all future pickups</div>
          <div className="text-[11px] text-muted">Changes the steady schedule and every upcoming pickup from {day} on. Earlier pickups stay as they are.</div>
        </button>
        <div className="text-[11px] text-muted">Completed, cancelled and past pickups are never changed.</div>
        <button onClick={onClose} className="haptic w-full rounded-[12px] border border-line px-4 py-2.5 text-[13px] font-bold text-muted hover:bg-cream">Cancel</button>
      </div>
    </div>
  );
}

// Oct 2 client: "need more drivers" — add a specific driver now, or open
// N more slots (pickup goes back to needing drivers; optionally text drivers).
function NeedMoreDriversModal({ p, onAddSpecific, onOpened, onClose }: {
  p: PiRow; onAddSpecific: () => void; onOpened: (textNow: boolean) => void; onClose: () => void;
}) {
  const qc = useQueryClient();
  const current = Number((p as any).slots_capacity ?? 1) || 1;
  const [more, setMore] = useState(1);
  const [textNow, setTextNow] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const mut = useMutation({
    mutationFn: () => adminCRUD.patchPickup(Number(p.id), { slotsCapacity: Math.min(20, current + more) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-pickups'] });
      qc.invalidateQueries({ queryKey: ['admin-pickups-range'] });
      onOpened(textNow);
    },
    onError: (e: any) => setErr(e?.message || 'Could not update the pickup'),
  });
  return (
    <div className="fixed inset-0 z-[2100] bg-ink/50 flex items-start justify-center pt-16 px-4">
      <div onClick={(e) => e.stopPropagation()} className="relative z-[2101] bg-paper rounded-[18px] shadow-lift border border-line w-full max-w-sm p-5 space-y-3">
        <div className="font-display font-semibold text-[16px]">Need more drivers</div>
        <div className="text-[12.5px] text-muted">{p.suppliers || p.steady_name || 'Pickup'} · now needs {current} {current === 1 ? 'driver' : 'drivers'}</div>
        <button onClick={onAddSpecific}
                className="haptic w-full text-left rounded-[12px] border border-line px-4 py-3 hover:bg-cream/60">
          <div className="text-[13px] font-extrabold text-forest">Add a specific driver now</div>
          <div className="text-[11px] text-muted">Pick the driver from the list.</div>
        </button>
        <div className="rounded-[12px] border border-line px-4 py-3 space-y-2">
          <div className="text-[13px] font-extrabold text-forest">Open more driver slots</div>
          <label className="flex items-center gap-2 text-[12.5px]">
            Add
            <select value={more} onChange={(e) => setMore(Number(e.target.value))}
                    className="rounded-[8px] border border-line bg-paper px-2 py-1">
              {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            more → needs {Math.min(20, current + more)} in total
          </label>
          <label className="flex items-center gap-2 text-[12.5px]">
            <input type="checkbox" checked={textNow} onChange={(e) => setTextNow(e.target.checked)} className="h-4 w-4 accent-forest" />
            Text drivers about it right after
          </label>
          {err && <div className="text-[12px] text-clay">{err}</div>}
          <button disabled={mut.isPending} onClick={() => mut.mutate()}
                  className="haptic w-full rounded-[10px] bg-forest px-4 py-2 text-[13px] font-bold text-paper disabled:opacity-50">
            {mut.isPending ? 'Saving…' : `Open ${more} more ${more === 1 ? 'slot' : 'slots'}`}
          </button>
        </div>
        <button onClick={onClose} className="haptic w-full rounded-[12px] border border-line px-4 py-2.5 text-[13px] font-bold text-muted hover:bg-cream">Cancel</button>
      </div>
    </div>
  );
}

function DriverCancelModal({ p, onClose }: { p: PiRow; onClose: () => void }) {
  const qc = useQueryClient();
  const drivers = (p.signups ?? []).map((s: any) => ({
    id: Number(s.volunteer_id),
    name: `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim() + (s.unit_number != null ? ` #${s.unit_number}` : ''),
  })).filter((d) => Number.isFinite(d.id));
  const [vid, setVid] = useState<number | ''>(drivers.length === 1 ? drivers[0]!.id : '');
  const [reason, setReason] = useState(DRIVER_CANCEL_REASONS[0]!);
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  // Oct 11 client: tell the driver + text drivers now (both on unless unticked).
  const [tellDriver, setTellDriver] = useState(true);
  const [textNow, setTextNow] = useState(true);
  const fullReason = reason === 'Other' ? note.trim() : (note.trim() ? `${reason} — ${note.trim()}` : reason);
  const canSubmit = vid !== '' && fullReason.length > 0;
  const mut = useMutation({
    mutationFn: () => api<any>(`/api/pickup-instances/${p.id}/driver-cancel`, {
      method: 'POST', body: JSON.stringify({ volunteerId: vid, reason: fullReason, tellDriver, textNow }),
    }),
    onSuccess: (r: any) => {
      const n = r?.data?.driverRemoved?.notice; if (n) uiNotify(n, Number(r?.data?.driverRemoved?.resend?.sent ?? 0) > 0 ? 'ok' : 'info');
      qc.invalidateQueries({ queryKey: ['admin-pickups'] });
      qc.invalidateQueries({ queryKey: ['admin-pickups-range'] });
      onClose();
    },
    onError: (e: any) => setErr(e?.message || 'Driver cancel failed'),
  });
  return (
    <div className="fixed inset-0 z-[2100] bg-ink/50 flex items-start justify-center pt-16 px-4">
      <div onClick={(e) => e.stopPropagation()} className="relative z-[2101] bg-paper rounded-[18px] shadow-lift border border-line w-full max-w-md p-5 space-y-4">
        <div className="font-display font-semibold text-[16px]">Driver cancel</div>
        <div className="text-[12.5px] text-muted">
          The driver comes off this pickup and gets a short text that they're off it. If the pickup now needs a driver,
          it is texted to drivers again right away as a new pickup. The cancellation is kept in the pickup's history.
        </div>
        <label className="block text-[12px] font-bold">Driver
          <select value={vid} onChange={(e) => setVid(e.target.value ? Number(e.target.value) : '')}
                  className="mt-1 w-full rounded-[10px] border border-line bg-paper px-3 py-2 text-[13px] font-normal">
            {drivers.length !== 1 && <option value="">Choose driver…</option>}
            {drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </label>
        <label className="block text-[12px] font-bold">Reason
          <select value={reason} onChange={(e) => setReason(e.target.value)}
                  className="mt-1 w-full rounded-[10px] border border-line bg-paper px-3 py-2 text-[13px] font-normal">
            {DRIVER_CANCEL_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
        <label className="block text-[12px] font-bold">{reason === 'Other' ? 'Details (required)' : 'Details (optional)'}
          <input value={note} onChange={(e) => setNote(e.target.value)}
                 className="mt-1 w-full rounded-[10px] border border-line bg-paper px-3 py-2 text-[13px] font-normal" />
        </label>
        <label className="flex items-center gap-2 text-[12.5px]">
          <input type="checkbox" checked={tellDriver} onChange={(e) => setTellDriver(e.target.checked)} className="h-4 w-4 accent-forest" />
          Tell {drivers.find((d) => d.id === vid)?.name.replace(/ #\d+$/, '') || 'the driver'} by text
        </label>
        <label className="flex items-center gap-2 text-[12.5px]">
          <input type="checkbox" checked={textNow} onChange={(e) => setTextNow(e.target.checked)} className="h-4 w-4 accent-forest" />
          Text drivers now
        </label>
        {err && <div className="text-[12px] text-clay">{err}</div>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="haptic rounded-[10px] border border-line px-4 py-2 text-[13px] font-bold text-muted hover:bg-cream">Back</button>
          <button disabled={!canSubmit || mut.isPending} onClick={() => mut.mutate()}
                  className="haptic rounded-[10px] bg-clay px-4 py-2 text-[13px] font-bold text-paper disabled:opacity-50">
            {mut.isPending ? 'Saving…' : 'Cancel this driver'}
          </button>
        </div>
      </div>
    </div>
  );
}

function DismissPickupModal({ p, onClose }: { p: any; onClose: () => void }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState<'no_longer_needed' | 'food_dropped_off' | 'other'>('no_longer_needed');
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const canSubmit = reason !== 'other' || note.trim().length > 0;
  const mut = useMutation({
    mutationFn: () => api(`/api/pickup-instances/${p.id}/dismiss`, {
      method: 'POST',
      body: JSON.stringify({ reason, note: note.trim() || null }),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-pickups'] }); onClose(); },
    onError: (e: any) => setErr(e?.message || 'Dismiss failed'),
  });
  return (
    <div className="fixed inset-0 z-[2100] bg-ink/50 flex items-start justify-center pt-16 px-4">
      <div onClick={(e) => e.stopPropagation()} className="relative z-[2101] bg-paper rounded-[18px] shadow-lift border border-line w-full max-w-md">
        <div className="sticky top-0 bg-paper border-b border-line px-5 py-3 flex items-center justify-between">
          <div className="font-display font-semibold text-[16px]">Dismiss pickup</div>
          <button onClick={onClose} className="haptic grid h-8 w-8 place-items-center rounded-full hover:bg-cream text-muted">✕</button>
        </div>
        <div className="p-5 space-y-4">
          <div className="text-[13px] text-muted">Closes this pickup and stops texting for a driver. Stays in history with your reason.</div>
          <fieldset className="space-y-2">
            <legend className="text-[12px] font-extrabold uppercase tracking-[.05em] text-muted mb-1">Reason</legend>
            {([
              ['no_longer_needed', 'No longer needed'],
              ['food_dropped_off', 'Food was dropped off'],
              ['other', 'Other (add a note)'],
            ] as const).map(([val, label]) => (
              <label key={val} className={cx('flex items-center gap-2 rounded-[10px] border px-3 py-2 cursor-pointer',
                reason === val ? 'border-forest bg-sage/40' : 'border-line hover:bg-cream/60')}>
                <input type="radio" name="dismiss-reason" checked={reason === val}
                       onChange={() => setReason(val)} />
                <span className="text-[13.5px] font-bold text-ink">{label}</span>
              </label>
            ))}
          </fieldset>
          <div>
            <label className="block text-[11px] font-extrabold uppercase tracking-[.05em] text-muted mb-1">
              Note {reason === 'other' && <span className="text-clay normal-case">(required)</span>}
            </label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3}
                      placeholder={reason === 'other' ? 'Please explain…' : 'Optional detail'}
                      className="w-full border border-line rounded-[10px] px-3 py-2 bg-paper text-[13.5px]" />
          </div>
          {err && <div className="text-[12px] text-clay font-bold">{err}</div>}
          <div className="flex items-center justify-between pt-1">
            <button onClick={onClose} className="haptic text-[12.5px] font-bold text-muted px-3 py-2">Cancel</button>
            <button onClick={() => mut.mutate()} disabled={!canSubmit || mut.isPending}
                    className="haptic text-[12.5px] font-bold bg-clay text-paper px-3 py-2 rounded-[10px] disabled:opacity-40">
              {mut.isPending ? 'Dismissing…' : 'Dismiss pickup'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Sidebar context list — its content depends on the active tab so the
 * coordinator's left rail is always relevant to what they're looking at.
 *  - Live Board: Places (donors)
 *  - Pickups:    upcoming pickup names (within the day window)
 *  - Volunteers: volunteer roster
 *  - Suppliers:  donor list
 *  - Chats:      whomever's in that conversation list
 */
function SidebarContextList({
  tab, suppliers, suppliersLoading, volunteers, volunteersLoading, livePickups,
}: {
  tab: TabKey;
  suppliers: Place[]; suppliersLoading: boolean;
  volunteers: any[]; volunteersLoading: boolean;
  livePickups: PiRow[];
  onPick: (t: TabKey) => void;
}) {
  // Tier-2 fix #11: the old code fell through to a "Places" header on every
  // tab that didn't match a specific case (steady / shifts / center-help /
  // coverage / signin / kiosk-activity / settings / etc.), which read as
  // "suppliers panel is loading" even though nothing beneath it ever rendered.
  // Only show the sidebar list block for tabs it actually belongs on.
  const LIST_TABS: TabKey[] = [
    'live', 'pickups', 'volunteers', 'suppliers',
    'chat-stores', 'chat-volunteers', 'reports',
  ];
  if (!LIST_TABS.includes(tab)) return null;

  const head =
    tab === 'pickups'         ? 'Active pickups' :
    tab === 'volunteers'      ? 'Drivers' :
    tab === 'suppliers'       ? 'Donors' :
    tab === 'chat-stores'     ? 'Stores' :
    tab === 'chat-volunteers' ? 'Drivers' :
    tab === 'reports'         ? 'Reports' :
    'Places';

  return (
    <>
      <div className="text-[10px] font-extrabold uppercase tracking-[.08em] text-[#7fa078] mt-5 mb-2 px-3">{head}</div>

      {/* Tier-3: scroll instead of 14-row silent cap. */}
      <div className="max-h-[42vh] overflow-y-auto">
        {(tab === 'pickups' || tab === 'live') && (
          <PickupSidebar pickups={livePickups} loading={false} />
        )}
        {(tab === 'volunteers' || tab === 'chat-volunteers') && (
          <PeopleSidebar people={volunteers} loading={volunteersLoading} kind="volunteer" />
        )}
        {(tab === 'suppliers' || tab === 'chat-stores') && (
          <PeopleSidebar people={[]} loading={false} kind="supplier" suppliers={suppliers} suppliersLoading={suppliersLoading} />
        )}
        {tab === 'reports' && (
          <div className="text-[11.5px] text-[#7fa078] px-3">Coming soon</div>
        )}
      </div>
    </>
  );
}

function PickupSidebar({ pickups, loading }: { pickups: PiRow[]; loading: boolean }) {
  if (loading) return <div className="text-[11.5px] text-[#7fa078] px-3">Loading…</div>;
  if (pickups.length === 0) return <div className="text-[11.5px] text-[#7fa078] px-3">No active pickups</div>;
  return <>{pickups.slice(0, 200).map((p) => {
    const color = p.suppliers ? supplierHue(p.suppliers) : '#C7CEC2';
    return (
      <div key={p.id} className="flex items-center gap-2 px-3 py-1.5 text-[12.5px]">
        <span className="h-2.5 w-2.5 rounded-sm shrink-0 ring-1 ring-white/20" style={{ background: color }} />
        <span className="truncate flex-1 text-paper">{p.suppliers || 'Pickup'}</span>
        <span className="text-[10.5px] text-[#7fa078] font-bold tabular-nums">{fmtTime(p.scheduled_time?.slice(0,5) ?? '')}</span>
      </div>
    );
  })}</>;
}

function PeopleSidebar({ people, loading, kind, suppliers, suppliersLoading }: {
  people: any[]; loading: boolean; kind: 'volunteer' | 'supplier';
  suppliers?: Place[]; suppliersLoading?: boolean;
}) {
  if (kind === 'supplier') {
    if (suppliersLoading) return <div className="text-[11.5px] text-[#7fa078] px-3">Loading…</div>;
    return <>{(suppliers ?? []).map((p) => {
      const dotColor = supplierHue(p.name);
      const nameClass = p.status === 'paused'
        ? 'text-[#7fa078] line-through opacity-70'
        : p.status === 'pending'
        ? 'text-amber'
        : 'text-paper';
      const label = p.status === 'paused' ? 'paused' : p.status === 'pending' ? 'pending' : '';
      return (
        <div key={p.id} className="flex items-center gap-2 px-3 py-1.5 text-[12.5px]">
          <span className="h-2.5 w-2.5 rounded-sm shrink-0 ring-1 ring-white/20" style={{ background: dotColor }} />
          <span className={cx('truncate flex-1', nameClass)}>{p.name}</span>
          {label && <span className="text-[9.5px] uppercase tracking-wider text-[#7fa078] font-bold">{label}</span>}
        </div>
      );
    })}</>;
  }
  if (loading) return <div className="text-[11.5px] text-[#7fa078] px-3">Loading…</div>;
  return <>{people.slice(0, 20).map((v) => (
    <div key={v.id} className="flex items-center gap-2 px-3 py-1.5 text-[12.5px]">
      <span className="h-2.5 w-2.5 rounded-full shrink-0 ring-1 ring-white/20"
            style={{ background: driverHue(`${v.firstName} ${v.lastName}`) }} />
      <span className="truncate flex-1 text-paper">
        {v.firstName} {v.lastName}
        {(v as any).unitNumber != null && <span className="ml-1 text-[#a5c69d] font-semibold text-[11.5px]">#{(v as any).unitNumber}</span>}
      </span>
    </div>
  ))}</>;
}

/**
 * In-app chat list — coordinator picks a store or driver from the left list,
 * the right pane shows the live ChatThread. **In-app only** — no SMS, phone,
 * or email shortcuts (per product spec: communication must round-trip through
 * the app so it's logged and visible on both ends).
 */
/**
 * Compact unread-count pill for sidebar tabs. Polls /me/dm/unread every 20s
 * so a new incoming message shows up without a hard refresh. When kind is
 * provided we filter to that contact list's peers; without kind it shows the
 * total. Returns null when there's nothing unread.
 */
// Consolidated brief #15 (Aug 18): dispatcher-on-duty action summary at the
// top of the Live Board. Answers "what requires my attention right now?" —
// uncovered pickups, pickups within 30 min, unread SMS, pending
// confirmations. Only shows when there's actually something to act on.
function OnDutyBanner({ setTab, onFocus }: { setTab: (t: TabKey) => void; onFocus: (f: { label: string; ids: number[] }) => void }) {
  const q = useQuery({
    queryKey: ['on-duty-summary'],
    queryFn: () => onDuty.summary(),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
  const s = q.data?.data;
  if (!s) return null;
  const total = Number(s.pickups_need_driver) + Number(s.unread_sms) + Number(s.pickups_within_30m) + Number(s.pending_confirmation);
  if (total === 0) return null;
  // abc900 (Aug 20): each chip is a button that jumps to the relevant surface.
  // Prior version was a plain <span> — clicking it did nothing.
  // abc901 (Aug 21): the "within 30 min" chip was pointed at the confirmation
  // anchor, which is unrelated — it should scroll to the Live Board's
  // "rest of today" pickup list where imminent pickups actually appear.
  const scrollToConfirm = () => {
    document.getElementById('needs-confirmation-anchor')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  // Oct 5 client (declutter #3): short clickable items on one line.
  const n1 = (n: number, one: string, many: string) => (n === 1 ? one : many);
  const items: Array<{ key: string; n: number; text: string; tone: string; onClick: () => void }> = [
    { key: 'soon', n: Number(s.pickups_within_30m), tone: 'text-clay',
      text: `⏰ ${s.pickups_within_30m} ${n1(Number(s.pickups_within_30m), 'starts', 'start')} within 30 min`,
      onClick: () => onFocus({ label: (Number(s.pickups_within_30m) === 1 ? 'starts' : 'start') + ' in the next 30 minutes', ids: (s.pickups_within_30m_ids ?? []).map(Number) }) },
    { key: 'driver', n: Number(s.pickups_need_driver), tone: 'text-clay',
      text: `🚗 ${s.pickups_need_driver} overdue, ${n1(Number(s.pickups_need_driver), 'needs', 'need')} a driver`,
      onClick: () => onFocus({ label: (Number(s.pickups_need_driver) === 1 ? 'needs' : 'need') + ' a driver', ids: (s.pickups_need_driver_ids ?? []).map(Number) }) },
    { key: 'sms', n: Number(s.unread_sms), tone: 'text-ink',
      text: `💬 ${s.unread_sms} new ${n1(Number(s.unread_sms), 'reply', 'replies')}`, onClick: () => setTab('driver-messages') },
    { key: 'confirm', n: Number(s.pending_confirmation), tone: 'text-ink',
      text: `✋ ${s.pending_confirmation} to confirm`, onClick: scrollToConfirm },
  ];
  return (
    <>
      {items.filter((c) => c.n > 0).map((c) => (
        <button key={c.key} type="button" onClick={c.onClick}
                className={cx('haptic font-semibold underline-offset-2 hover:underline', c.tone)}>
          {c.text}
        </button>
      ))}
    </>
  );
}

// Consolidated brief #1 (Aug 18): SMS Threads unread count for the sidebar
// SMS Composer tab. Polls every 30s.
function SmsUnreadBadge() {
  const q = useQuery({
    queryKey: ['sms-unread-count'],
    queryFn: () => smsThreads.unreadCount(),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
  const total = q.data?.data?.total ?? 0;
  if (!total) return null;
  return <span className="ml-auto inline-grid place-items-center min-w-[20px] h-[20px] px-1.5 rounded-full bg-red-500 text-paper text-[11px] font-extrabold">{total > 99 ? '99+' : total}</span>;
}

// Oct 9 client: ONE unread count for the Driver messages sidebar item —
// unread texts + unread app chat messages.
function DriverMessagesBadge() {
  const sms = useQuery({ queryKey: ['sms-unread-count'], queryFn: () => smsThreads.unreadCount(), refetchInterval: 30_000, refetchOnWindowFocus: true });
  const chat = useQuery<{ data: { total: number; byPeer: Array<{ peerUserId: number; unread: number }> } }>({ queryKey: ['dm-unread'], queryFn: () => dm.unread(), refetchInterval: 20_000 });
  const total = Number(sms.data?.data?.total ?? 0) + Number(chat.data?.data?.total ?? 0);
  if (!total) return null;
  return <span className="ml-auto inline-grid place-items-center min-w-[20px] h-[20px] px-1.5 rounded-full bg-red-500 text-paper text-[11px] font-extrabold">{total > 99 ? '99+' : total}</span>;
}

// Oct 9 client: one "Driver messages" inbox. Each tab is the existing panel, unchanged.
function DriverMessagesPanel({ sub, onSub, onOpenPerson }: { sub: DmSub; onSub: (s: DmSub) => void; onOpenPerson?: (id: number, kind: 'driver' | 'store') => void }) {
  const tabs: { key: DmSub; label: string; badge?: any }[] = [
    { key: 'texts',   label: 'Texts',   badge: <SmsUnreadBadge /> },
    { key: 'chat',    label: 'App chat', badge: <UnreadBadge kind="volunteers" /> },
    { key: 'replies', label: 'Replies to pickup texts' },
    { key: 'words',   label: 'Code words' }, // Oct 11 client
  ];
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 border-b border-line overflow-x-auto">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => onSub(t.key)}
                  className={cx('haptic px-3 py-2 text-[13px] font-bold border-b-2 -mb-px whitespace-nowrap inline-flex items-center gap-1.5',
                                sub === t.key ? 'border-forest text-forest' : 'border-transparent text-muted hover:text-ink')}>
            {t.label}{t.badge}
          </button>
        ))}
      </div>
      {sub === 'texts' ? <SmsThreadsPanel /> : sub === 'chat' ? <ChatList kind="volunteers" />
        : sub === 'words' ? <CodeWordsPanel onOpenPerson={onOpenPerson} /> : <DriverRepliesPanel />}
    </div>
  );
}

function UnreadBadge({ kind, peerUserId }: { kind?: 'stores' | 'volunteers'; peerUserId?: number }) {
  const unread = useQuery<{ data: { total: number; byPeer: Array<{ peerUserId: number; unread: number }> } }>({
    queryKey: ['dm-unread'],
    queryFn:  () => dm.unread(),
    refetchInterval: 20_000,
  });
  // Peer-specific badge (one row in the chat list).
  if (peerUserId != null) {
    const row = unread.data?.data?.byPeer?.find((p) => Number(p.peerUserId) === peerUserId);
    if (!row || !row.unread) return null;
    return <span className="inline-grid place-items-center min-w-[18px] h-[18px] px-1.5 rounded-full bg-red-500 text-paper text-[10.5px] font-extrabold">{row.unread > 99 ? '99+' : row.unread}</span>;
  }
  // Filtered-to-kind badge needs to know which peers count. We don't have that
  // detail in the unread payload alone, so fall back to total. (Refining
  // per-kind would require joining peer role on the server — fine to add later.)
  const total = unread.data?.data?.total ?? 0;
  void kind;
  if (!total) return null;
  return <span className="ml-auto inline-grid place-items-center min-w-[20px] h-[20px] px-1.5 rounded-full bg-red-500 text-paper text-[11px] font-extrabold">{total > 99 ? '99+' : total}</span>;
}

/** Human-friendly relative time like "2m", "45m", "3h", "yesterday", "Mar 4" */
function relTime(iso: string): string {
  const d = new Date(iso);
  const ms = Date.now() - d.getTime();
  if (isNaN(ms)) return '';
  const min = Math.floor(ms / 60_000);
  if (min < 1) return 'now';
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 2) return 'yesterday';
  if (day < 7) return `${day}d`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function ChatList({ kind }: { kind: 'stores' | 'volunteers' }) {
  const [selected, setSelected] = useState<{ userId: number; name: string; color: string } | null>(null);
  const contacts = useQuery<{ data: any[] }>({
    queryKey: ['dm-contacts', kind],
    queryFn:  () => (kind === 'stores' ? dm.suppliers() : dm.volunteers()) as Promise<{ data: any[] }>,
  });
  // Last-message preview per peer for the chat list (replaces "Tap to open chat").
  const threadsQ = useQuery({ queryKey: ['dm-threads'], queryFn: dm.threads, refetchInterval: 20_000 });
  const threadByPeer = (threadsQ.data?.data?.threads ?? []).reduce(
    (acc: Record<number, { lastBody: string; lastAt: string; lastFromMe: boolean; unread: number }>, t) => {
      acc[Number(t.peerUserId)] = t; return acc;
    }, {} as Record<number, { lastBody: string; lastAt: string; lastFromMe: boolean; unread: number }>);
  // API returns rows with snake_case (first_name/last_name) for office/volunteer kinds.
  // user_id can be null for volunteers/suppliers not yet linked to a user — filter those
  // out so the row is never rendered as "undefined undefined" and never produces a dead click.
  const allRows = contacts.data?.data ?? [];
  // Sort so the most recently active conversations float to the top. Rows the
  // coordinator has never exchanged messages with drop to the bottom in stable
  // alphabetical order. Unread bumps to the very top so a fresh message from
  // driver #4 doesn't get lost behind a stale conversation with driver #1.
  const rows = allRows
    .filter((r: any) => r.user_id != null)
    .slice()
    .sort((a: any, b: any) => {
      const ta = threadByPeer[a.user_id];
      const tb = threadByPeer[b.user_id];
      const aUnread = (ta?.unread ?? 0) > 0 ? 1 : 0;
      const bUnread = (tb?.unread ?? 0) > 0 ? 1 : 0;
      if (aUnread !== bUnread) return bUnread - aUnread;   // unread first
      const atA = ta?.lastAt ?? '';
      const atB = tb?.lastAt ?? '';
      if (atA && !atB) return -1;                          // any activity first
      if (!atA && atB) return 1;
      if (atA && atB && atA !== atB) return atB.localeCompare(atA); // newest first
      const na = ((a.first_name ?? a.firstName ?? a.name ?? '') + ' ' + (a.last_name ?? a.lastName ?? '')).trim().toLowerCase();
      const nb = ((b.first_name ?? b.firstName ?? b.name ?? '') + ' ' + (b.last_name ?? b.lastName ?? '')).trim().toLowerCase();
      return na.localeCompare(nb);
    });
  const unlinkedCount = allRows.length - rows.length;
  // Oct 2 client fix: page search.
  const [cq, setCq] = useState('');
  const shownRows = cq.trim() ? rows.filter((r: any) => JSON.stringify(r).toLowerCase().includes(cq.trim().toLowerCase())) : rows;

  if (contacts.isLoading) return <div className="text-[13px] text-muted">Loading…</div>;
  if (rows.length === 0) return <div className="text-[13px] text-muted">No {kind === 'stores' ? 'stores' : 'drivers'} linked to a user account yet.</div>;

  if (selected) {
    return (
      <div className="flex flex-col h-[calc(100vh-180px)]">
        <button onClick={() => setSelected(null)} className="self-start text-[12px] text-forest font-bold mb-2 hover:underline">
          ← Back to {kind === 'stores' ? 'stores' : 'drivers'}
        </button>
        <ChatThread userId={selected.userId} title={selected.name}
                    subtitle={kind === 'stores' ? 'Store contact' : 'Driver'} color={selected.color} />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="text-[11px] font-extrabold uppercase tracking-[.05em] text-muted mb-1">
        {kind === 'stores' ? 'In-app messages · stores' : 'In-app messages · drivers'}
      </div>
      <SearchBar value={cq} onChange={setCq} placeholder="Search by name…" />
      <div className="rounded-[14px] border border-sage-line bg-sage/40 p-3 text-[12px] text-forest font-bold mb-3">
        In-app only — messages appear in the recipient's app inbox. No SMS, phone, or email.
      </div>
      {shownRows.map((r: any) => {
        const first = r.first_name ?? r.firstName ?? '';
        const last  = r.last_name  ?? r.lastName  ?? '';
        const name  = kind === 'stores' ? (r.name ?? `${first} ${last}`.trim()) : `${first} ${last}`.trim();
        const color = kind === 'stores' ? supplierHue(name) : driverHue(name);
        const initials = kind === 'stores'
          ? (name.split(' ').map((w: string) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?')
          : ((first[0] ?? '') + (last[0] ?? '') || '?');
        const rowKey = `${kind}-${r.id ?? r.user_id ?? r.supplier_id ?? r.volunteer_id ?? name}`;
        const thread = threadByPeer[r.user_id];
        const preview = thread?.lastBody ? `${thread.lastFromMe ? 'You: ' : ''}${thread.lastBody}` : 'Tap to open chat';
        const hasUnread = (thread?.unread ?? 0) > 0;
        // "when" text next to preview — relative time for chat rows
        const whenText = thread?.lastAt ? relTime(thread.lastAt) : '';
        return (
          <button key={rowKey} onClick={() => setSelected({ userId: r.user_id, name, color })}
                  className={cx('w-full text-left border rounded-[14px] overflow-hidden haptic transition',
                                hasUnread ? 'border-red-400 bg-red-50/70 hover:bg-red-50' : 'border-line bg-paper hover:bg-cream/40')}>
            <div className="flex">
              <div className="w-1.5 shrink-0" style={{ background: color }} />
              <div className="flex-1 px-3.5 py-2.5 flex items-center justify-between gap-2">
                <div className="min-w-0 flex items-center gap-2">
                  <div className="relative shrink-0">
                    {kind === 'stores' && r.logo_url
                      ? <img src={apiAssetUrl(r.logo_url)} alt="" loading="lazy" className="h-9 w-9 rounded-full object-cover border border-line bg-paper" />
                      : <span className="grid h-9 w-9 place-items-center rounded-full text-paper text-[11px] font-bold"
                              style={{ background: color }}>
                          {initials}
                        </span>}
                    {hasUnread && (
                      <span aria-label="unread" className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-red-500 ring-2 ring-paper" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="font-bold text-[13.5px] truncate flex items-center gap-1.5">
                      {name || 'Unknown'}
                      <UnreadBadge peerUserId={r.user_id} />
                    </div>
                    <div className={cx('text-[11px] truncate', hasUnread ? 'text-ink font-semibold' : 'text-muted')}>{preview}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {whenText && <span className={cx('text-[10.5px] font-semibold', hasUnread ? 'text-red-600' : 'text-muted')}>{whenText}</span>}
                  <MessageSquare size={16} className={hasUnread ? 'text-red-500' : 'text-forest'} />
                </div>
              </div>
            </div>
          </button>
        );
      })}
      {unlinkedCount > 0 && (
        <div className="text-[11px] text-muted pt-2">
          {unlinkedCount} {kind === 'stores' ? 'store' : 'driver'}{unlinkedCount === 1 ? '' : 's'} not yet linked to a user account — invite them from {kind === 'stores' ? 'Suppliers' : 'Drivers'} to enable chat.
        </div>
      )}
    </div>
  );
}

/** Supplier color identity — same name → same color, anywhere. */
const SUPPLIER_PALETTE = [
  '#D27A4C', // clay
  '#3E6F8E', // sky
  '#7C3AED', // amethyst
  '#0F766E', // teal-deep
  '#CA8A04', // amber
  '#DB2777', // rose
  '#0E7490', // ocean
  '#854D0E', // copper
  '#16A34A', // emerald
  '#9333EA', // violet
  '#E11D48', // rose-dark
  '#0284C7', // sky-deep
];
function supplierHue(name: string) {
  let h = 0; for (let i = 0; i < (name ?? '').length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return SUPPLIER_PALETTE[h % SUPPLIER_PALETTE.length]!;
}

/** Driver color (a separate palette so it's distinguishable from suppliers). */
const DRIVER_PALETTE = [
  '#2C5A3B', // forest
  '#1E40AF', // indigo-deep
  '#92400E', // brown
  '#155E75', // teal-dark
  '#831843', // wine
  '#3F6212', // moss
  '#7E22CE', // violet-deep
  '#0F172A', // ink-blue
];
function driverHue(name: string) {
  let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return DRIVER_PALETTE[h % DRIVER_PALETTE.length]!;
}

// Office-facing status labels from the "Volunteer Portal Improvement Requests"
// PDF (§1). Derived from the DB lifecycle + signup count. Keep the DB `status`
// column untouched — office labels are a pure UI derivation so we don't have
// to migrate anything and drivers still see their own status pipeline.
//
// - Volunteer Needed: still open, nobody signed up.
// - Assigned:         at least one driver on it.
// - On the Way:       en_route or picked_up (per the user's call — in_progress
//                     doesn't count; the app writes it before the driver has
//                     actually departed).
// - Completed:        completed or delivered.
type OfficeStatus = 'need' | 'assigned' | 'onway' | 'complete' | 'complete_nokiosk' | 'review' | 'expired' | 'missed';
const CLOSED_OFFICE_STATUSES: OfficeStatus[] = ['complete', 'complete_nokiosk', 'review', 'expired', 'missed'];
function officeStatusOf(p: PiRow): OfficeStatus {
  // Oct 2 review items 1–2: the server's shared outcome (outcome.ts) decides,
  // so Live Board, Pickups, Calendar, History and Reports always agree.
  const oc = (p as any).outcome as string | null | undefined;
  if (oc === 'taken') return 'complete_nokiosk'; // Oct 6: taken — not checked in
  if (oc === 'completed') return 'complete';
  if (oc === 'expired') return 'expired';
  if (oc === 'needs_review') return 'review';
  if (oc === 'missed_confirmed') return 'missed';
  const s = String(p.status || '').toLowerCase();
  // client Aug 12 — 'missed' gets its own muted-red chip so History rows
  // read at a glance. It still counts as closed everywhere else via
  // DONE_STATUSES.
  // Oct 2 client fix (UI plan §4): the auto-missed sweeper keeps these rows
  // in 'missed' internally so SMS paths treat them as closed, but only a
  // confirmed miss should read "Missed" — roster-only rows read "Needs
  // review" and no-driver rows read "Expired – no driver".
  if (s === 'missed') {
    const reason = String(p.cancellation_reason || '').toLowerCase();
    if (reason.startsWith('needs review'))                          return 'review';
    if (reason.startsWith('expired') || reason.includes('no driver claimed')) return 'expired';
    return 'missed';
  }
  if (s === 'completed' || s === 'delivered') {
    return String(p.completion_notes || '').startsWith('auto: accepted') && !(p as any).kiosk_verified ? 'complete_nokiosk' : 'complete';
  }
  if (s === 'en_route' || s === 'picked_up')  return 'onway';
  return (p.signups?.length ?? 0) > 0 ? 'assigned' : 'need';
}
const OFFICE_SPILL: Record<OfficeStatus, { bg: string; fg: string; label: string }> = {
  need:     { bg: 'bg-clay-soft',  fg: 'text-clay',       label: 'Needs a driver' },
  assigned: { bg: 'bg-sky-soft',   fg: 'text-sky-deep',   label: 'Driver on it' },
  onway:    { bg: 'bg-amber-soft', fg: 'text-[#9a7415]',  label: 'On the Way' },
  complete: { bg: 'bg-sage',       fg: 'text-forest',     label: 'Completed' },
  complete_nokiosk: { bg: 'bg-amber-soft', fg: 'text-[#9a7415]', label: 'Taken, no kiosk sign-in' },
  review:   { bg: 'bg-amber-soft', fg: 'text-[#9a7415]',  label: 'Needs review' },
  expired:  { bg: 'bg-clay/10',    fg: 'text-clay',       label: 'Expired — no driver' },
  missed:   { bg: 'bg-clay/10',    fg: 'text-clay',       label: 'Confirmed missed' },
};

/**
 * batch abc820 · Pickups-tab sub-tab strip. Always visible so tabs stay
 * clickable even when the current bucket is empty. Each tab shows its
 * count as a small badge; per-tab empty state is a quiet card rendered
 * by the parent (see PICKUPS_SUB_EMPTY).
 */
// Oct 2 client fix (UI plan §3): unified Pickups views.
type PickupsSubTab = 'today' | 'list' | 'calendar' | 'history' | 'recurring' | 'attention';
const PICKUPS_SUB_EMPTY: Record<PickupsSubTab, string> = {
  today:     'No pickups scheduled for today.',
  list:      'No pickups match these dates and filters.',
  calendar:  '',
  history:   'No past pickups match these dates and filters.',
  recurring: '',
  attention: 'No pickups need attention right now.',
};
// Oct 2 client fix (UI plan §3): List / History views of the unified Pickups
// section. Any date range (own fetch, not limited to the shared 60-day cache),
// search across every field shown on the row, filters, and CSV export of
// exactly what is filtered.
function shiftDay(iso: string, days: number): string {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
function rowDrivers(p: PiRow): string[] {
  return (p.signups ?? []).map((s) => `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim()).filter(Boolean);
}
// Oct 13 client: where a pickup came from (export "Source"). Office and the public form look the same in the data.
function pickupSource(p: PiRow): string {
  if (p.posted_via_supplier) return 'Store app';
  if (/^Added by text/i.test(String(p.notes ?? ''))) return 'Text';
  if (p.steady_pickup_id != null) return 'Steady schedule';
  return 'Office / public form';
}
function rowLabel(p: PiRow): string {
  return p.suppliers || p.steady_name || p.contact_name || p.pickup_address || 'One-time pickup';
}
// Everything shown on a pickup card, lower-cased, for search.
function pickupHaystack(p: PiRow): string {
  const os = String(p.status || '').toLowerCase() === 'cancelled' ? 'cancelled' : officeStatusOf(p);
  return [
    p.ref_number, p.id, p.suppliers, p.steady_name, p.supplier_address, p.supplier_city,
    p.pickup_address, p.contact_name, p.contact_phone, p.food_description, p.estimated_quantity,
    p.notes, (p as any).special_instructions, (p as any).pickup_instructions,
    os === 'cancelled' ? 'Cancelled' : OFFICE_SPILL[os].label,
    ...(p.signups ?? []).map((s) => `${s.first_name ?? ''} ${s.last_name ?? ''} ${s.unit_number ?? ''}`),
    p.steady_pickup_id != null ? 'steady' : 'one-time', p.scheduled_date, fmtTime(String(p.scheduled_time ?? '').slice(0, 5)),
  ].filter((v) => v != null && v !== '').join(' ').toLowerCase();
}
function PickupSearchBar({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="mb-3 relative">
      <input value={value} onChange={(e) => onChange(e.target.value)}
             placeholder="Search pickups — store, address, driver, ref #, food, notes…"
             className="w-full rounded-[12px] border border-line bg-paper pl-9 pr-9 py-2.5 text-[14px] outline-none focus:border-forest" />
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted">🔍</span>
      {value && (
        <button onClick={() => onChange('')} title="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 haptic grid h-6 w-6 place-items-center rounded-full text-muted hover:bg-cream">✕</button>
      )}
    </div>
  );
}

function PickupsRangeView({ mode, search, onOpen, onAssign, onEdit, onDuplicate, onAdd }: {
  mode: 'list' | 'history';
  search: string;
  onOpen: (id: number) => void;
  onAssign?: (p: PiRow) => void;
  onEdit?: (p: PiRow) => void;
  onDuplicate?: (p: PiRow) => void;
  onAdd?: () => void;
}) {
  const today = nyToday();
  const [from, setFrom] = useState(mode === 'list' ? today : shiftDay(today, -30));
  const [to, setTo]     = useState(mode === 'list' ? shiftDay(today, 7) : shiftDay(today, -1));
  const q = search;
  const [status, setStatus] = useState<'' | OfficeStatus | 'cancelled'>('');
  const [kind, setKind] = useState<'' | 'steady' | 'one-time'>('');
  const [supplier, setSupplier] = useState('');
  const [driver, setDriver] = useState('');
  const [verify, setVerify] = useState<'' | 'kiosk' | 'nokiosk'>('');
  const rangeQ = useQuery({
    queryKey: ['admin-pickups-range', from, to],
    queryFn: () => api<{ data: PiRow[] }>(`/api/pickup-instances?from=${from}&to=${to}`),
    enabled: !!from && !!to && from <= to,
  });
  const rows = useMemo(() => (rangeQ.data?.data ?? []).filter((p) => !p.is_test), [rangeQ.data]);
  const supplierOptions = useMemo(() => [...new Set(rows.map(rowLabel))].sort(), [rows]);
  const driverOptions = useMemo(() => [...new Set(rows.flatMap(rowDrivers))].sort(), [rows]);
  const statusOf = (p: PiRow) => String(p.status || '').toLowerCase() === 'cancelled' ? 'cancelled' : officeStatusOf(p);
  const statusLabelOf = (p: PiRow) => { const s = statusOf(p); return s === 'cancelled' ? 'Cancelled' : OFFICE_SPILL[s].label; };
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out = rows.filter((p) => {
      const os = statusOf(p);
      if (status && os !== status) return false;
      if (kind === 'steady' && p.steady_pickup_id == null) return false;
      if (kind === 'one-time' && p.steady_pickup_id != null) return false;
      if (supplier && rowLabel(p) !== supplier) return false;
      if (driver && !rowDrivers(p).includes(driver)) return false;
      if (verify === 'nokiosk' && os !== 'complete_nokiosk') return false;
      if (verify === 'kiosk' && os !== 'complete') return false;
      if (!needle) return true;
      return pickupHaystack(p).includes(needle);
    });
    const key = (p: PiRow) => String(p.scheduled_date).slice(0, 10) + String(p.scheduled_time);
    return out.sort((a, b) => mode === 'list' ? key(a).localeCompare(key(b)) : key(b).localeCompare(key(a)));
  }, [rows, q, status, kind, supplier, driver, verify, mode]);
  // Oct 11 client: speed — show 50 pickups at a time ("Show more"); a long
  // History range used to draw thousands of cards at once. Day headers keep
  // the day's full count; export still covers everything filtered.
  const PAGE = 50;
  const [shown, setShown] = useState(PAGE);
  useEffect(() => { setShown(PAGE); }, [q, status, kind, supplier, driver, verify, from, to]);
  const dayTotals = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of filtered) { const d = String(p.scheduled_date).slice(0, 10); m.set(d, (m.get(d) ?? 0) + 1); }
    return m;
  }, [filtered]);
  const byDay = useMemo(() => {
    const m = new Map<string, PiRow[]>();
    for (const p of filtered.slice(0, shown)) {
      const d = String(p.scheduled_date).slice(0, 10);
      if (!m.has(d)) m.set(d, []);
      m.get(d)!.push(p);
    }
    return [...m.entries()];
  }, [filtered, shown]);
  function exportCsv() {
    const esc = (v: unknown) => { const t = String(v ?? ''); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
    const head = ['Ref #', 'Date', 'Time', 'Supplier / pickup', 'Type', 'Source', 'Status', 'Drivers', 'Address', 'Food', 'Instructions', 'Notes'];
    const lines = filtered.map((p) => [
      p.ref_number ?? p.id, String(p.scheduled_date).slice(0, 10), fmtTime(String(p.scheduled_time ?? '').slice(0, 5)),
      rowLabel(p), p.steady_pickup_id != null ? 'Steady' : 'One-Time', pickupSource(p), statusLabelOf(p), rowDrivers(p).join('; '),
      p.pickup_address || [p.supplier_address, p.supplier_city].filter(Boolean).join(', '),
      p.food_description, (p as any).special_instructions, p.notes,
    ].map(esc).join(','));
    const blob = new Blob(['﻿' + [head.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `pickups-${mode}-${from}-to-${to}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  const sel = 'rounded-[9px] border border-line bg-paper px-2 py-1.5 text-[12px]';
  const dayLabel = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="text-[11.5px] text-muted flex items-center gap-1">From
          <DateInput value={from} onChange={setFrom} className={sel} /></label>
        <label className="text-[11.5px] text-muted flex items-center gap-1">To
          <DateInput value={to} onChange={setTo} className={sel} /></label>
        <button onClick={exportCsv} disabled={filtered.length === 0}
                className="haptic rounded-[10px] border border-line bg-paper px-3 py-1.5 text-[12px] font-bold text-forest-deep hover:bg-cream disabled:opacity-50">
          ↓ Export
        </button>
        {onAdd && (
          <button onClick={onAdd}
                  className="haptic inline-flex items-center gap-1 rounded-[10px] bg-forest px-3 py-1.5 text-[12px] font-bold text-paper shadow-ctag hover:brightness-110">
            <Plus size={13} /> Add Pickup
          </button>
        )}
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select value={status} onChange={(e) => setStatus(e.target.value as any)} className={sel}>
          <option value="">All statuses</option>
          {(Object.keys(OFFICE_SPILL) as OfficeStatus[]).map((k) => <option key={k} value={k}>{({ complete: 'Completed — marked done', complete_nokiosk: 'Taken, no kiosk sign-in' } as Record<string, string>)[k] ?? OFFICE_SPILL[k].label}</option>)}
          <option value="cancelled">Cancelled</option>
        </select>
        <select value={kind} onChange={(e) => setKind(e.target.value as any)} className={sel}>
          <option value="">Steady + One-Time</option>
          <option value="steady">Steady only</option>
          <option value="one-time">One-Time only</option>
        </select>
        <select value={supplier} onChange={(e) => setSupplier(e.target.value)} className={cx(sel, 'max-w-[200px]')}>
          <option value="">All suppliers</option>
          {supplierOptions.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
        <select value={driver} onChange={(e) => setDriver(e.target.value)} className={cx(sel, 'max-w-[200px]')}>
          <option value="">All drivers</option>
          {driverOptions.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
        <select value={verify} onChange={(e) => setVerify(e.target.value as any)} className={sel}>
          <option value="">Any verification</option>
          <option value="kiosk">Completed – verified</option>
          <option value="nokiosk">Taken, no kiosk sign-in</option>
        </select>
        <span className="text-[11.5px] text-muted ml-auto">{rangeQ.isFetching ? 'Loading…' : `${filtered.length} of ${rows.length} pickups`}</span>
      </div>
      {from > to ? (
        <div className="rounded-[14px] border border-line bg-paper px-4 py-3 text-[13px] text-clay">The From date is after the To date.</div>
      ) : rangeQ.isError ? (
        <div className="rounded-[14px] border border-line bg-paper px-4 py-3 text-[13px] text-clay">
          Couldn't load pickups. <button onClick={() => rangeQ.refetch()} className="font-bold underline">Try again</button>
        </div>
      ) : !rangeQ.isFetching && byDay.length === 0 ? (
        <div className="rounded-[14px] border border-line bg-paper px-4 py-3 text-[13px] text-muted">{PICKUPS_SUB_EMPTY[mode]}</div>
      ) : (
        byDay.map(([d, items]) => (
          <section key={d} className="mb-5">
            <div className="text-[11px] font-extrabold uppercase tracking-[.05em] mb-2.5 text-muted">{dayLabel(d)} · {dayTotals.get(d) ?? items.length}</div>
            <div className="space-y-2.5">
              {items.map((p) => (
                <CoordRow key={p.id} p={p}
                          onAssign={onAssign ? () => onAssign(p) : () => {}}
                          onOpen={() => onOpen(Number(p.id))}
                          onEdit={onEdit ? () => onEdit(p) : undefined}
                          onDuplicate={onDuplicate ? () => onDuplicate(p) : undefined}
                          allowDriverCancel={!!onEdit} />
              ))}
            </div>
          </section>
        ))
      )}
      {filtered.length > shown && !(from > to) && !rangeQ.isError && (
        <div className="mt-2 mb-6 text-center">
          <button onClick={() => setShown((n) => n + PAGE)}
                  className="haptic rounded-[10px] border border-line bg-paper px-4 py-2 text-[13px] font-bold text-forest-deep hover:bg-cream">
            Show more ({filtered.length - shown} more)
          </button>
        </div>
      )}
    </div>
  );
}

function PickupsSubTabStrip({
  current, onChange, counts,
}: {
  current: PickupsSubTab;
  onChange: (t: PickupsSubTab) => void;
  counts: { attention: number; upcoming: number; completed: number; history: number; today: number };
}) {
  const tabs: { key: PickupsSubTab; label: string; count?: number; accent?: boolean }[] = [
    { key: 'today',     label: 'Today',              count: counts.today },
    { key: 'list',      label: 'List' },
    { key: 'calendar',  label: 'Calendar' },
    { key: 'history',   label: 'History' },
    { key: 'recurring', label: 'Steady' },
    { key: 'attention', label: 'Needs attention',    count: counts.attention, accent: counts.attention > 0 },
  ];
  return (
    <div className="mb-4 flex items-center gap-1.5 border-b border-line overflow-x-auto">
      {tabs.map((t) => {
        const on = current === t.key;
        return (
          <button key={t.key} onClick={() => onChange(t.key)}
                  className={cx('haptic px-3 py-2 text-[13px] font-bold border-b-2 -mb-px transition inline-flex items-baseline gap-1.5',
                    on
                      ? t.key === 'attention'
                        ? 'border-clay text-clay'
                        : 'border-forest text-forest'
                      : t.accent
                        ? 'border-transparent text-clay hover:text-clay'
                        : 'border-transparent text-muted hover:text-ink')}>
            <span className="whitespace-nowrap">{t.label}</span>
            {t.count != null && (
              <span className={cx('text-[10.5px] font-extrabold px-1.5 rounded-full',
                                  on
                                    ? t.key === 'attention' ? 'bg-clay/10 text-clay' : 'bg-forest/10 text-forest'
                                    : t.accent ? 'bg-clay/10 text-clay' : 'bg-line/70 text-muted')}>
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function groupByDate(items: PiRow[]) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  const now = Date.now();
  // "Overdue / Needs attention" — pickups whose scheduled start has passed and
  // are still open (not completed / cancelled). Surfaced above the date groups
  // so dispatch never misses one.
  const overdue: PiRow[] = [];
  const dated: PiRow[] = [];
  for (const it of items) {
    const status = String(it.status || '').toLowerCase();
    // Oct 9 client: missed / expired are closed too (same as the Live Board).
    const closed = ['completed', 'delivered', 'cancelled', 'missed'].includes(status) || !!it.cancelled_at
      || CLOSED_OFFICE_STATUSES.includes(officeStatusOf(it));
    const hasDriver = (it.signups?.length ?? 0) > 0;
    if (!closed && !hasDriver) {
      const startMs = new Date(it.scheduled_date.slice(0, 10) + 'T' +
        (it.scheduled_time || '00:00:00')).getTime();
      const windowEnd = it.must_pickup_by ? new Date(it.must_pickup_by).getTime() : startMs + 60 * 60_000;
      if (windowEnd < now) { overdue.push(it); continue; }
    }
    dated.push(it);
  }
  const groups = new Map<string, { key: string; label: string; items: PiRow[]; overdue?: boolean }>();
  if (overdue.length) {
    groups.set('__overdue__', { key: '__overdue__', label: `Looking for a driver · ${overdue.length} pending`, items: overdue, overdue: true });
  }
  for (const it of dated) {
    // Oct 13 client: a reposted pickup still open goes under TODAY, not its old date.
    const d = showsUnderToday(it) ? new Date(today) : new Date(it.scheduled_date.slice(0, 10) + 'T00:00:00');
    let label: string;
    if (sameDay(d, today)) label = 'Today · ' + d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    else if (sameDay(d, tomorrow)) label = 'Tomorrow · ' + d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    else label = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    const key = d.toISOString().slice(0, 10);
    (groups.get(key) ?? groups.set(key, { key, label, items: [] }).get(key)!).items.push(it);
  }
  // Oct 13 client: reposted ones first under Today.
  for (const g of groups.values()) g.items.sort((a, b) => Number(showsUnderToday(b)) - Number(showsUnderToday(a)));
  return Array.from(groups.values());
}
// Oct 13 client: a reposted pickup ("Put back in queue") that's still open.
function repostOpen(it: PiRow): boolean {
  if (!it.requeued_at) return false;
  const status = String(it.status || '').toLowerCase();
  if (['completed', 'delivered', 'cancelled', 'missed'].includes(status) || !!it.cancelled_at) return false;
  return !CLOSED_OFFICE_STATUSES.includes(officeStatusOf(it));
}
// Oct 13 client: a reposted pickup from an earlier day belongs under TODAY (drivers see "now").
function showsUnderToday(it: PiRow): boolean {
  return repostOpen(it) && String(it.scheduled_date).slice(0, 10) < nyToday();
}
function sameDay(a: Date, b: Date) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
function fmtTime(t: string) {
  if (!t || !t.includes(':')) return t;
  const [hh, mm] = t.split(':'); const h = parseInt(hh ?? '0', 10);
  const ampm = h >= 12 ? 'PM' : 'AM'; const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${mm} ${ampm}`;
}

/**
 * SmsComboPanel — one nav entry ("SMS Composer & Broadcast") with an internal
 * tabstrip that surfaces the four previously-separate items:
 *   Compose | Threads | Groups | Broadcast
 * Each tab renders the existing panel component unchanged (no rewrite).
 */
type SmsSubTab = 'upcoming' | 'compose' | 'threads' | 'groups' | 'broadcast' | 'whatsapp' | 'wa-threads' | 'jewish-calendar';
function SmsComboPanel() {
  // upsms (Aug 20): "Upcoming" surfaces the next scheduled consolidated drop
  // and the four controls (Send Now / Cancel / Send Earlier / Send Later).
  // It's the first tab so coordinators land on the pending broadcast state
  // rather than the compose textarea.
  // Refresh-persistence: restore the SMS sub-tab from the URL hash and keep it
  // in sync. On a sub-tab CHANGE we clear the deeper thread segment (the new
  // sub-tab has no open conversation); on the initial mount (prevSubRef starts
  // equal) we leave the thread segment alone so SmsThreadsPanel can restore it.
  const [sub, setSub] = useState<SmsSubTab>(() => {
    const n = readCoordNav();
    const valid: SmsSubTab[] = ['upcoming', 'compose', 'threads', 'groups', 'broadcast', 'whatsapp', 'wa-threads', 'jewish-calendar'];
    // Oct 9 client: SMS threads moved to Driver messages → Texts.
    return (n.tab === 'sms-combo' && valid.includes(n.sub as SmsSubTab) && n.sub !== 'threads')
      ? (n.sub as SmsSubTab) : 'upcoming';
  });
  const prevSubRef = useRef<SmsSubTab>(sub);
  useEffect(() => {
    const changed = prevSubRef.current !== sub;
    prevSubRef.current = sub;
    patchCoordNav(changed ? { sub, thread: undefined } : { sub });
  }, [sub]);
  const tabs: { key: SmsSubTab; label: string }[] = [
    { key: 'upcoming',   label: 'Upcoming' },
    { key: 'compose',    label: 'Compose' },
    { key: 'groups',     label: 'Groups' },
    { key: 'broadcast',  label: 'Broadcast (push)' },
    { key: 'whatsapp',   label: 'WhatsApp' },
    { key: 'wa-threads', label: 'WA threads' },
  ];
  return (
    <div className="space-y-3">
      <SmsPauseBanner />
      <div className="flex items-center gap-1.5 border-b border-line">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setSub(t.key)}
                  className={cx('px-3 py-2 text-[13px] font-bold border-b-2 -mb-px transition haptic',
                    sub === t.key
                      ? 'border-forest text-forest'
                      : 'border-transparent text-muted hover:text-ink')}>
            {t.label}
          </button>
        ))}
      </div>
      <div>
        {sub === 'upcoming'  && <UpcomingSmsPanel />}
        {sub === 'compose'   && <SmsComposerPanel />}
        {sub === 'threads'   && <SmsThreadsPanel />}
        {sub === 'groups'    && <SmsGroupsPanel />}
        {sub === 'broadcast' && <BroadcastPanel />}
        {sub === 'whatsapp'  && <WhatsappAdminPanel />}
        {sub === 'wa-threads' && <WaThreadsPanel />}
        {sub === 'jewish-calendar' && <JewishCalendarPanel />}
      </div>
    </div>
  );
}

// Sep 15 client #2 — master pause switch shown at the top of every SMS
// Composer tab. Red banner + Resume button when paused; small calm strip
// with a Pause button when live. Manual "Send Now" from the office is
// unaffected by the pause — this only stops the automatic sweepers.
// Oct 2 client fix (UI plan §9): while automatic SMS is paused, every page
// shows it — who paused, when, and where to resume. Silent for roles that
// can't read the pause status.
// Oct 2 client: portal "on duty" login (replaces phone-queue tracking).
function DutyToggle() {
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ['duty-me'], queryFn: () => api<{ data: { onDuty: boolean; onAt: string | null } }>('/api/duty/me'), refetchInterval: 60_000, retry: false });
  const m = useMutation({
    mutationFn: (on: boolean) => api(on ? '/api/duty/on' : '/api/duty/off', { method: 'POST' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['duty-me'] }); qc.invalidateQueries({ queryKey: ['duty-now'] }); qc.invalidateQueries({ queryKey: ['duty-history'] }); },
  });
  if (!me.data) return null;
  const on = me.data.data.onDuty;
  // Oct 5 client: dispatchers are on duty automatically while logged in.
  if (String(getUser()?.role ?? '').toLowerCase() === 'dispatcher') {
    return (
      <span title="Dispatchers are on duty automatically while logged in. Signing out or 15 minutes without activity takes you off duty."
            className="inline-flex items-center rounded-full bg-sage px-3 py-1.5 text-[12px] font-bold text-forest whitespace-nowrap">
        🟢 On duty (automatic)
      </span>
    );
  }
  const since = me.data.data.onAt ? new Date(me.data.data.onAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : '';
  return on ? (
    <button onClick={() => m.mutate(false)} disabled={m.isPending}
            title="You're on duty — click to go off duty"
            className="haptic rounded-full bg-forest px-3 py-1.5 text-[12px] font-bold text-paper whitespace-nowrap">
      🟢 On duty{since ? ` since ${since}` : ''} · Go off
    </button>
  ) : (
    <button onClick={() => m.mutate(true)} disabled={m.isPending}
            className="haptic rounded-full border border-forest px-3 py-1.5 text-[12px] font-bold text-forest whitespace-nowrap hover:bg-sage">
      Go on duty
    </button>
  );
}
// Oct 7 client: "It's Sunday 5 PM — who's usually out now?" Typical activity
// for this weekday + hour over the last 12 weeks (GET /api/dashboard/typical-now).
type TypicalNow = {
  weeks: number; dow: number; hour: number; daysWithActivity: number;
  hours: Array<{ hr: number; avg: number }>;
  topDow: Array<{ id: number; name: string; days: number }>;
  topHour: Array<{ id: number; name: string; days: number }>;
};
const DOW_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Shabbos'];
const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? 'AM' : 'PM'}`;
// Oct 9 client: removed the "Need a driver? Text these drivers" box (not clear enough).
function UsuallyActiveNow({ onOpenPerson }: { onOpenPerson: (id: number) => void }) {
  const [open, setOpen] = useState(false);
  const q = useQuery({
    queryKey: ['dashboard-typical-now'],
    queryFn: () => api<TypicalNow>('/api/dashboard/typical-now'),
    refetchInterval: 15 * 60_000,
  });
  const d = q.data;
  if (!d) return null;
  const day = DOW_NAMES[d.dow] ?? '';
  const now = d.hours.find((h) => h.hr === d.hour)?.avg ?? 0;
  // Next busiest hour later today, so the office can see a rush coming.
  const later = d.hours.filter((h) => h.hr > d.hour && h.avg > 0).sort((a, b) => b.avg - a.avg)[0];
  const thin = d.daysWithActivity < 3;
  // Oct 8 client: plain words, never "0.1 drivers".
  const howMany = (a: number) => a < 0.5 ? 'usually quiet' : a < 1.5 ? 'usually about 1 driver out' : `usually about ${Math.round(a)} drivers out`;
  const max = Math.max(0.1, ...d.hours.map((h) => h.avg));
  const shown = d.hours.filter((h) => h.hr >= 7 && h.hr <= 23);
  const names = (list: TypicalNow['topDow']) => list.length === 0
    ? <span className="italic text-muted">no one yet</span>
    : list.map((v, i) => (
        <span key={v.id}>
          {i > 0 && ', '}
          <button onClick={() => onOpenPerson(v.id)} className="font-semibold text-ink hover:text-forest hover:underline">{v.name}</button>
          <span className="text-muted"> ({v.days})</span>
        </span>
      ));
  return (
    <div className="mb-4 rounded-[14px] border border-line bg-paper">
      <button onClick={() => setOpen(!open)} className="haptic flex w-full flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-left">
        <span className="text-[13px] text-ink">
          <b>{day} · {hourLabel(d.hour)}</b>
          {thin
            ? <span className="text-muted"> — not enough history for {day}s yet</span>
            : <> — <b>{howMany(now)}</b> at this hour
                {later && <span className="text-muted"> · busiest later today: {hourLabel(later.hr)}</span>}</>}
        </span>
        <span className="text-[12px] font-bold text-forest">{open ? 'Hide' : 'Who usually?'}</span>
      </button>
      {open && (
        <div className="border-t border-line px-4 py-3 space-y-3">
          <div>
            <div className="text-[11.5px] font-extrabold uppercase tracking-[.05em] text-muted mb-1.5">
              How busy a {day} usually is, hour by hour (last {d.weeks} weeks)
            </div>
            <div className="flex items-end gap-[3px] h-[56px]">
              {shown.map((h) => (
                <div key={h.hr} className="flex-1 flex flex-col items-center justify-end h-full"
                     title={`${hourLabel(h.hr)}: ${howMany(h.avg)}`}>
                  <div className={cx('w-full rounded-t-[3px]', h.hr === d.hour ? 'bg-forest' : 'bg-sage-line')}
                       style={{ height: `${Math.max(h.avg > 0 ? 8 : 2, (h.avg / max) * 100)}%` }} />
                </div>
              ))}
            </div>
            <div className="flex gap-[3px] mt-1">
              {shown.map((h) => (
                <div key={h.hr} className={cx('flex-1 text-center text-[9.5px] tabular-nums', h.hr === d.hour ? 'text-forest font-bold' : 'text-muted')}>
                  {h.hr % 3 === 0 || h.hr === d.hour ? hourLabel(h.hr).replace(' ', '') : ''}
                </div>
              ))}
            </div>
          </div>
          <div className="text-[12.5px] leading-relaxed">
            <span className="text-muted">Often out on {day}s: </span>{names(d.topDow)}
          </div>
          <div className="text-[12.5px] leading-relaxed">
            <span className="text-muted">Often out around {hourLabel(d.hour)}: </span>{names(d.topHour)}
          </div>
          <div className="text-[11px] text-muted">On-the-fly pickups only — steady pickups (a driver's own school or store) aren't counted. Number = how many days they were out. Tap a name to open the profile.</div>
        </div>
      )}
    </div>
  );
}

function OnDutyNow() {
  const q = useQuery({ queryKey: ['duty-now'], queryFn: () => api<{ data: { userId: number; name: string | null; onAt: string }[] }>('/api/duty/now'), refetchInterval: 60_000, retry: false });
  const rows = q.data?.data ?? [];
  if (!q.data) return null;
  return rows.length === 0
    ? <span className="text-clay font-bold">Nobody on duty</span>
    : <span className="text-ink">🟢 On duty: <b>{rows.map((r) => r.name ?? 'Someone').join(', ')}</b></span>;
}

function SmsPausedGlobalBanner({ onOpen }: { onOpen: () => void }) {
  const q = useQuery({
    queryKey: ['admin-sms-pause'],
    queryFn: () => adminSmsPause.status(),
    refetchInterval: 20_000,
    retry: false,
  });
  if (!q.data?.paused) return null;
  const at = q.data.pausedAt ? fmtDateTimeEastern(q.data.pausedAt) : null;
  return (
    <div className="bg-clay text-paper px-4 py-2 text-[13px] font-bold flex flex-wrap items-center gap-x-3 gap-y-1">
      <span>⏸ ALL messages are PAUSED — automatic and manual{at ? ` · since ${at}` : ''}{q.data.pausedBy ? ` by ${q.data.pausedBy}` : ''}{q.data.resumeAt ? ` · resumes ${new Date(q.data.resumeAt).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', hour12: true })}` : ' · until someone resumes'}.</span>
      <button onClick={onOpen} className="haptic underline">Open Holiday &amp; SMS Controls to resume</button>
    </div>
  );
}

// Oct 5 (review items 7 + 12): effective sending mode + pause ALL messages.
function SendingModeLine() {
  const q = useQuery({ queryKey: ['sms-sending-mode'], queryFn: () => adminSmsPause.mode(), refetchInterval: 30_000, retry: false });
  const m = q.data?.data;
  if (!m) return null;
  const parts: { text: string; tone: string }[] = [];
  if (m.yomTov) parts.push({ text: `🕯 Yom Tov (${m.yomTov}): NO messages go out, manual included`, tone: 'text-clay' });
  else if (m.paused) parts.push({ text: '⏸ Paused: no messages go out (admin override only)', tone: 'text-clay' });
  else if (m.shabbosQuiet) parts.push({ text: '🕯 Shabbos: automatic messages wait; manual still sends', tone: 'text-[#9a7415]' });
  if (!m.providerConfigured) parts.push({ text: 'SMS provider not configured — nothing can send', tone: 'text-clay' });
  if (m.sandbox) parts.push({ text: 'TEST MODE — every message is redirected to the sandbox phone, not real recipients', tone: 'text-[#9a7415]' });
  else parts.push({ text: 'LIVE — messages go to real recipients', tone: 'text-forest' });
  parts.push(m.scheduledDryRun
    ? { text: 'Hourly automatic texts: SIMULATED only (dry-run setting on the server — nothing is sent)', tone: 'text-[#9a7415]' }
    : { text: 'Hourly automatic texts: ON', tone: 'text-forest' });
  return (
    <div className="rounded-[10px] border border-line bg-paper px-3 py-2 text-[12px] space-y-0.5">
      <div className="text-[10.5px] font-extrabold uppercase tracking-[.06em] text-muted">Sending mode right now</div>
      {parts.map((p) => <div key={p.text} className={cx('font-semibold', p.tone)}>{p.text}</div>)}
    </div>
  );
}

function SmsPauseBanner() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin-sms-pause'], queryFn: () => adminSmsPause.status(), refetchInterval: 20_000 });
  const [until, setUntil] = useState<'none' | '1h' | '3h' | 'morning' | 'custom'>('none');
  // Oct 5 client: "allow custom date time as well".
  const [customAt, setCustomAt] = useState('');
  const [, force] = useState(0);
  const m = useMutation({
    mutationFn: ({ paused, resumeAt }: { paused: boolean; resumeAt?: string | null }) => adminSmsPause.set(paused, resumeAt),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-sms-pause'] }); qc.invalidateQueries({ queryKey: ['sms-sending-mode'] }); },
  });
  if (q.isLoading || !q.data) return <div className="text-[11.5px] text-muted px-2">Checking message status…</div>;
  const resumeIso = () => {
    const d = new Date();
    if (until === '1h') return new Date(d.getTime() + 3600e3).toISOString();
    if (until === '3h') return new Date(d.getTime() + 3 * 3600e3).toISOString();
    if (until === 'morning') { const t = new Date(d); t.setDate(t.getDate() + 1); t.setHours(9, 0, 0, 0); return t.toISOString(); } // Oct 12 client: texting day starts 8 AM // Oct 14 client: back to 9 AM
    if (until === 'custom') { const t = new Date(customAt); return Number.isFinite(t.getTime()) ? t.toISOString() : null; }
    return null;
  };
  const overrideLeft = Math.max(0, Math.round((smsOverrideUntil() - Date.now()) / 60_000));
  if (q.data.paused) {
    const at = q.data.pausedAt ? new Date(q.data.pausedAt).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', hour12: true }) : '';
    const res = q.data.resumeAt ? new Date(q.data.resumeAt).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }) : null;
    return (
      <div className="space-y-2">
        <div className="rounded-[12px] border-2 border-clay bg-clay/10 p-3 flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[220px]">
            <div className="font-display font-bold text-[15px] text-clay">ALL messages are PAUSED — automatic and manual</div>
            <div className="text-[12px] text-ink mt-0.5">
              Paused {at}{q.data.pausedBy ? ` by ${q.data.pausedBy}` : ''}. {res ? `Resumes automatically ${res}.` : 'Stays paused until someone resumes.'}
            </div>
          </div>
          <button onClick={() => { void uiConfirm('Resume ALL messages now?').then((ok) => { if (ok) { m.mutate({ paused: false }); } }); }} disabled={m.isPending}
                  className="haptic bg-forest text-paper font-bold text-[13px] rounded-[8px] px-4 py-2 disabled:opacity-40">
            {m.isPending ? 'Resuming…' : 'Resume messages'}
          </button>
        </div>
        <div className="rounded-[10px] border border-line bg-paper px-3 py-2 flex flex-wrap items-center gap-2 text-[12px]">
          {overrideLeft > 0
            ? <span className="font-bold text-[#9a7415]">Your manual sends are allowed for {overrideLeft} more min (logged).</span>
            : <span className="text-muted">Need to send something urgent? Admins can allow their own sends for 10 minutes — every one is logged.</span>}
          {overrideLeft === 0 && (
            <button onClick={() => { void uiConfirm('Allow YOUR manual sends for 10 minutes while paused? Every send is logged with your name.').then((ok) => { if (ok) { setSmsOverrideFor(10); force((n) => n + 1); } }); }}
                    className="haptic rounded-[8px] border border-clay px-3 py-1 font-bold text-clay hover:bg-clay/10">Allow my sends for 10 min</button>
          )}
        </div>
        <SendingModeLine />
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <div className="rounded-[10px] border border-line bg-cream/40 px-3 py-2 flex flex-wrap items-center gap-2">
        <div className="flex-1 text-[12px] text-muted min-w-[200px]">
          <span className="font-bold text-forest">Messages are ON.</span> Pausing stops <b>every</b> message — automatic and manual.
        </div>
        <select value={until} onChange={(e) => setUntil(e.target.value as any)} className="rounded-[8px] border border-line bg-paper px-2 py-1 text-[12px]">
          <option value="none">until I resume</option>
          <option value="1h">for 1 hour</option>
          <option value="3h">for 3 hours</option>
          <option value="morning">until tomorrow 9 AM</option>{/* Oct 14 client: was 8 AM */}
          <option value="custom">until a date & time…</option>
        </select>
        {until === 'custom' && (
          <input type="datetime-local" value={customAt} onChange={(e) => setCustomAt(e.target.value)}
                 min={(() => { const n = new Date(Date.now() - new Date().getTimezoneOffset() * 60000); return n.toISOString().slice(0, 16); })()}
                 className="rounded-[8px] border border-line bg-paper px-2 py-1 text-[12px]" />
        )}
        <button onClick={() => { void uiConfirm('Pause ALL messages (automatic and manual) now?').then((ok) => { if (ok) { m.mutate({ paused: true, resumeAt: resumeIso() }); } }); }}
                disabled={m.isPending || (until === 'custom' && !(new Date(customAt).getTime() > Date.now()))}
                className="haptic bg-paper border border-clay text-clay font-bold text-[12px] rounded-[8px] px-3 py-1 disabled:opacity-40 hover:bg-clay/10">
          {m.isPending ? 'Pausing…' : 'Pause all messages'}
        </button>
      </div>
      <SendingModeLine />
    </div>
  );
}

/**
 * DispatchersComboPanel — one nav entry ("Dispatchers").
 *
 * Restructured Aug 20 per client spec: the top-of-panel view is now the
 * *dispatcher roster* — a person-first list you can add to independent of
 * any shift. Below the roster we keep the Driver-reply SMS access list.
 * The old "Staff & roles" grid (role changes, disable) is preserved as a
 * secondary tab; it manages login accounts, which is a distinct concern.
 *
 *   Roster & SMS  →  DispatchersRosterPanel  +  SmsDispatchersPanel
 *   Staff & roles →  DispatchersPanel        (login-account admin)
 */
// Oct 5 client (declutter): 6 tabs → 3. Old links (calendar, template,
// alerts, staff, attendance) still open the right tab.
type DispSubTab = 'roster' | 'shifts' | 'logins';
const DISP_OLD_SUB: Record<string, DispSubTab> = {
  roster: 'roster', alerts: 'roster', calendar: 'shifts', template: 'shifts', shifts: 'shifts',
  staff: 'logins', attendance: 'logins', logins: 'logins',
};
function DispatchersComboPanel() {
  // Refresh-persistence: restore the Dispatchers sub-tab from the URL hash.
  const [sub, setSub] = useState<DispSubTab>(() => {
    const n = readCoordNav();
    return (n.tab === 'dispatchers-combo' && n.sub && DISP_OLD_SUB[n.sub as string]) ? DISP_OLD_SUB[n.sub as string]! : 'roster';
  });
  useEffect(() => { patchCoordNav({ sub }); }, [sub]);
  const tabs: { key: DispSubTab; label: string }[] = [
    { key: 'roster', label: 'Roster' },
    { key: 'shifts', label: 'Shifts' },
    { key: 'logins', label: 'Logins & attendance' },
  ];
  const Section = ({ title, hint, children }: { title: string; hint?: string; children: any }) => (
    <div className="pt-4 border-t border-line">
      <div className="mb-2">
        <h3 className="font-display font-bold text-[15px] text-ink">{title}</h3>
        {hint && <div className="text-[11.5px] text-muted">{hint}</div>}
      </div>
      {children}
    </div>
  );
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 border-b border-line">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setSub(t.key)}
                  className={cx('px-3 py-2 text-[13px] font-bold border-b-2 -mb-px transition haptic',
                    sub === t.key
                      ? 'border-forest text-forest'
                      : 'border-transparent text-muted hover:text-ink')}>
            {t.label}
          </button>
        ))}
      </div>
      {sub === 'roster' && (
        <div className="space-y-6">
          <DispatchersRosterPanel />
          <Section title="Who gets driver replies" hint="These phones get driver text replies and can answer with *NN <message>.">
            <SmsDispatchersPanel />
          </Section>
          <Section title="Who gets the 90-minute alert" hint="Texted when a pickup is 90 minutes away and still has no driver.">
            <UncoveredAlertsPanel />
          </Section>
        </div>
      )}
      {sub === 'shifts' && (
        <div className="space-y-6">
          <DispatcherWeeklyCalendar />
          <Section title="Weekly shift template" hint="The repeating weekly plan the calendar is built from.">
            <DispatcherShiftTemplate />
          </Section>
        </div>
      )}
      {sub === 'logins' && (
        <div className="space-y-6">
          <DispatcherAttendancePanel />
          <Section title="Staff logins & roles">
            <DispatchersPanel />
          </Section>
        </div>
      )}
    </div>
  );
}

// Sep 4 client feature: manage the 90-min uncovered pickup alert group.
function UncoveredAlertsPanel() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['uncovered-alert-members'], queryFn: uncoveredAlerts.list });
  const rows = q.data?.data ?? [];
  const [addQuery, setAddQuery] = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const allVols = useQuery({
    queryKey: ['admin-volunteers'],
    queryFn: () => api<{ data: any[] }>('/api/volunteers'),
    enabled: showPicker,
  });
  const existingIds = new Set(rows.map((r) => Number(r.volunteerId)));
  const searchable = ((allVols.data?.data ?? []) as any[])
    .filter((v: any) => !existingIds.has(Number(v.id)))
    .filter((v: any) => !addQuery || `${v.firstName ?? ''} ${v.lastName ?? ''} ${v.phonePrimary ?? ''}`.toLowerCase().includes(addQuery.toLowerCase()))
    .slice(0, 30);
  const addM = useMutation({
    mutationFn: (id: number) => uncoveredAlerts.add(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['uncovered-alert-members'] }); setAddQuery(''); },
  });
  const removeM = useMutation({
    mutationFn: (id: number) => uncoveredAlerts.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['uncovered-alert-members'] }),
  });

  return (
    <div className="space-y-3">
      <div className="bg-paper border border-line rounded-[14px] p-4 text-[12.5px] text-muted">
        <div className="font-display font-bold text-[15px] text-ink mb-1">90-minute uncovered-pickup alerts</div>
        <p>
          When a pickup has been posted for 90 minutes and still isn't fully covered, everyone in this group receives an SMS:
          <em> "Uncovered 90 min: [donor] · [address] · [date time]. Still open — please cover if you can."</em>
        </p>
        <p className="mt-1">
          One alert per uncovered episode — if it gets covered and then re-opens, the 90-minute clock restarts. Multi-driver pickups are only "covered" once every slot is filled. Shabbos/message-blackout rules apply.
        </p>
      </div>

      <div className="bg-paper border border-line rounded-[14px] overflow-hidden">
        <div className="px-4 py-2.5 border-b border-line flex items-center justify-between">
          <div className="text-[13px] font-extrabold uppercase tracking-[.06em] text-muted">
            {rows.length} member{rows.length === 1 ? '' : 's'} in alert group
          </div>
          <button onClick={() => setShowPicker((v) => !v)}
                  className="haptic text-[12.5px] font-bold text-paper bg-forest rounded-[8px] px-3 py-1.5 hover:bg-forest-deep">
            {showPicker ? 'Close picker' : '+ Add person'}
          </button>
        </div>

        {showPicker && (
          <div className="p-3 border-b border-line bg-cream/40 space-y-2">
            <input value={addQuery} onChange={(e) => setAddQuery(e.target.value)}
                   placeholder="Search volunteers by name or phone…"
                   className="w-full border border-line rounded-[8px] px-2 py-1.5 text-[13px] bg-paper" />
            <div className="max-h-[240px] overflow-auto rounded-[8px] border border-line bg-paper divide-y divide-line/60">
              {allVols.isLoading && <div className="p-3 text-[12px] text-muted italic">Loading volunteers…</div>}
              {searchable.length === 0 && !allVols.isLoading && <div className="p-3 text-[12px] text-muted italic">No matches.</div>}
              {searchable.map((v: any) => (
                <button key={v.id} onClick={() => addM.mutate(Number(v.id))} disabled={addM.isPending}
                        className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-cream/50 disabled:opacity-40">
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-[12.5px] text-ink truncate">{v.firstName} {v.lastName}{v.unitNumber != null ? ` · #${v.unitNumber}` : ''}</div>
                    <div className="text-[11px] text-muted truncate">{v.phonePrimary ?? '—'}</div>
                  </div>
                  <span className="text-[11px] font-bold text-forest">+ Add</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {q.isLoading ? (
          <div className="text-[13.5px] text-muted py-8 text-center">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="text-[13.5px] text-muted py-8 text-center">Nobody in this group yet. Add anyone who should get an SMS when pickups stay open past 90 minutes.</div>
        ) : (
          <div className="divide-y divide-line/70">
            {rows.map((m) => (
              <div key={m.volunteerId} className="px-4 py-2.5 flex items-center gap-3 text-[13px]">
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-ink truncate">{m.firstName} {m.lastName}{m.unitNumber != null ? ` · #${m.unitNumber}` : ''}</div>
                  <div className="text-[11.5px] text-muted truncate">{m.phone ?? '—'} · added {fmtDay(m.addedAt)}</div>
                </div>
                <button onClick={() => { void uiConfirm(`Remove ${m.firstName} ${m.lastName} from the 90-min alert group?`).then((ok) => { if (ok) { removeM.mutate(m.volunteerId); } }); }}
                        className="haptic text-[12.5px] font-bold text-clay hover:underline">Remove</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Sep 4: dispatcher weekly coverage calendar + template editor ----
function ny(d: Date): Date {
  return new Date(d.toLocaleString('en-US', { timeZone: 'America/New_York' }));
}
function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function sundayOfWeek(anyDate: Date): string {
  const nyD = ny(anyDate);
  nyD.setDate(nyD.getDate() - nyD.getDay());
  return isoDate(nyD);
}
function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map((x) => Number(x));
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}
function fmt12(hhmm: string): string {
  const [h, m] = hhmm.split(':').map((x) => Number(x));
  const ap = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, '0')} ${ap}`;
}
const ROSTER_DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Motzei Shabbos'];

function DispatcherWeeklyCalendar() {
  const qc = useQueryClient();
  const [weekStart, setWeekStart] = useState<string>(() => sundayOfWeek(new Date()));
  const q = useQuery({
    queryKey: ['disp-weekly', weekStart],
    queryFn: () => dispatcherShifts.weekly(weekStart),
  });
  const rows = q.data?.data ?? [];
  const covered = q.data?.covered ?? 0;
  const total = q.data?.total ?? 0;

  const [assignFor, setAssignFor] = useState<DispWeeklyRow | null>(null);

  const bySection: Record<string, DispWeeklyRow[]> = {};
  for (const r of rows) {
    const key = r.section === 'friday' ? 'friday'
              : r.section === 'motzei_shabbos' ? 'motzei_shabbos'
              : `daily-${r.rosterDow}`;
    (bySection[key] ??= []).push(r);
  }
  const weekEnd = addDays(weekStart, 6);

  return (
    <div className="space-y-4">
      <div className="bg-paper border border-line rounded-[14px] p-4 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <button onClick={() => setWeekStart(addDays(weekStart, -7))}
                  className="haptic text-[12.5px] font-bold text-forest bg-sage/60 hover:bg-sage rounded-full px-3 py-1">← Prev</button>
          <button onClick={() => setWeekStart(sundayOfWeek(new Date()))}
                  className="haptic text-[12.5px] font-bold text-forest bg-sage/60 hover:bg-sage rounded-full px-3 py-1">This week</button>
          <button onClick={() => setWeekStart(addDays(weekStart, 7))}
                  className="haptic text-[12.5px] font-bold text-forest bg-sage/60 hover:bg-sage rounded-full px-3 py-1">Next →</button>
          <span className="text-[12.5px] text-muted ml-1">{weekStart} → {weekEnd}</span>
        </div>
        <div className="text-[13px] font-extrabold uppercase tracking-[.06em] text-muted">
          {q.isLoading ? 'Loading…' : `${covered} of ${total} shifts covered`}
        </div>
      </div>

      {q.isLoading ? (
        <div className="text-center py-10 text-muted text-[13.5px]">Loading…</div>
      ) : total === 0 ? (
        <div className="text-center py-10 text-muted text-[13.5px]">No shift template yet. Set one up on the Shift template tab.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {[0, 1, 2, 3, 4].map((d) => (
            <DispDayCard key={`d-${d}`} label={ROSTER_DAY_LABELS[d]} rows={bySection[`daily-${d}`] ?? []} onAssign={setAssignFor} onUnassign={(r) => dispatcherShifts.unassign(r.shiftId!).then(() => qc.invalidateQueries({ queryKey: ['disp-weekly'] }))} />
          ))}
          <DispDayCard label="Friday" rows={bySection['friday'] ?? []} onAssign={setAssignFor} onUnassign={(r) => dispatcherShifts.unassign(r.shiftId!).then(() => qc.invalidateQueries({ queryKey: ['disp-weekly'] }))} />
          <DispDayCard label="Motzei Shabbos" rows={bySection['motzei_shabbos'] ?? []} onAssign={setAssignFor} onUnassign={(r) => dispatcherShifts.unassign(r.shiftId!).then(() => qc.invalidateQueries({ queryKey: ['disp-weekly'] }))} />
        </div>
      )}

      {assignFor && (
        <AssignDispatcherModal row={assignFor} weekStart={weekStart}
                               onClose={() => setAssignFor(null)}
                               onSaved={() => { setAssignFor(null); qc.invalidateQueries({ queryKey: ['disp-weekly'] }); }} />
      )}
    </div>
  );
}

function DispDayCard({ label, rows, onAssign, onUnassign }: {
  label: string; rows: DispWeeklyRow[];
  onAssign: (r: DispWeeklyRow) => void;
  onUnassign: (r: DispWeeklyRow) => void;
}) {
  return (
    <div className="bg-paper border border-line rounded-[14px] overflow-hidden">
      <div className="px-3 py-2 border-b border-line bg-cream/50">
        <div className="font-display font-bold text-[15px] text-ink">{label}</div>
      </div>
      <div className="divide-y divide-line/70">
        {rows.length === 0 && <div className="p-3 text-[12.5px] text-muted italic">No shifts.</div>}
        {rows.map((r) => (
          <div key={r.slotId} className="px-3 py-2 flex items-center gap-2 text-[13px]">
            <div className="tabular-nums text-muted w-[135px] shrink-0">{fmt12(r.startTime)} – {fmt12(r.endTime)}</div>
            <div className="flex-1 min-w-0">
              {r.volunteerId ? (
                <div>
                  <div className="font-bold text-ink truncate">{r.firstName} {r.lastName}</div>
                  {r.phone && <div className="text-[11px] text-muted truncate">{r.phone}</div>}
                </div>
              ) : (
                <div className="font-bold text-clay">Open — needs dispatcher</div>
              )}
            </div>
            {r.volunteerId ? (
              <button onClick={() => { void uiConfirm(`Release ${r.firstName} ${r.lastName} from this shift?\n\n${label} · ${fmt12(r.startTime)} – ${fmt12(r.endTime)}`, { okLabel: 'Yes, release', cancelLabel: 'Go back' }).then((ok) => { if (ok) onUnassign(r); }); }}
                      className="haptic text-[11.5px] font-bold text-muted hover:text-clay">Release</button>
            ) : (
              <button onClick={() => onAssign(r)}
                      className="haptic text-[11.5px] font-bold text-paper bg-forest rounded-[8px] px-2 py-1 hover:bg-forest-deep">Assign</button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function AssignDispatcherModal({ row, weekStart, onClose, onSaved }: {
  row: DispWeeklyRow; weekStart: string; onClose: () => void; onSaved: () => void;
}) {
  const dq = useQuery({ queryKey: ['dispatchers-roster'], queryFn: () => api<{ data: any[] }>('/api/dispatchers') });
  const [q, setQ] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const roster = (dq.data?.data ?? []) as any[];
  const filtered = roster
    .filter((p: any) => {
      const s = `${p.firstName ?? p.first_name ?? ''} ${p.lastName ?? p.last_name ?? ''} ${p.phonePrimary ?? p.phone_primary ?? ''}`.toLowerCase();
      return !q || s.includes(q.toLowerCase());
    })
    .slice(0, 40);
  const assignM = useMutation({
    mutationFn: (volunteerId: number) => dispatcherShifts.assign({ slotId: row.slotId, weekStart, volunteerId }),
    onSuccess: () => onSaved(),
    onError: (e: any) => setErr(e?.message || 'failed'),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-paper rounded-[16px] border border-line max-w-md w-full max-h-[80vh] overflow-hidden flex flex-col"
           onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-line flex items-start justify-between gap-3">
          <div>
            <div className="font-display font-bold text-[17px] text-ink">Assign dispatcher</div>
            <div className="text-[12px] text-muted">{fmt12(row.startTime)} – {fmt12(row.endTime)} · {new Date(row.startAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/New_York' })}</div>
          </div>
          <button onClick={onClose} className="haptic text-muted hover:text-ink text-[22px] leading-none px-1">×</button>
        </div>
        <div className="p-3">
          <input value={q} onChange={(e) => setQ(e.target.value)}
                 placeholder="Search dispatchers…"
                 className="w-full border border-line rounded-[8px] px-2 py-1.5 text-[13px] bg-paper" />
        </div>
        <div className="overflow-y-auto px-3 pb-3 space-y-1">
          {dq.isLoading && <div className="text-[12.5px] text-muted italic">Loading roster…</div>}
          {filtered.length === 0 && !dq.isLoading && <div className="text-[12.5px] text-muted italic">No matches.</div>}
          {filtered.map((p: any) => {
            const id = Number(p.id ?? p.volunteerId);
            const first = p.firstName ?? p.first_name ?? '';
            const last = p.lastName ?? p.last_name ?? '';
            const phone = p.phonePrimary ?? p.phone_primary ?? '';
            return (
              <button key={id} onClick={() => assignM.mutate(id)} disabled={assignM.isPending}
                      className="w-full text-left px-3 py-2 flex items-center gap-2 rounded-[8px] hover:bg-cream/60 disabled:opacity-40">
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-[13px] text-ink truncate">{first} {last}</div>
                  <div className="text-[11.5px] text-muted truncate">{phone}</div>
                </div>
                <span className="text-[11px] font-bold text-forest">Assign →</span>
              </button>
            );
          })}
          {err && <div className="text-[12.5px] text-clay">{err}</div>}
        </div>
      </div>
    </div>
  );
}

function DispatcherShiftTemplate() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['disp-slots'], queryFn: () => dispatcherShifts.listSlots() });
  const rows = q.data?.data ?? [];

  const patchM = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<Omit<DispShiftSlot, 'id'>> }) => dispatcherShifts.patchSlot(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['disp-slots'] }),
  });
  const delM = useMutation({
    mutationFn: (id: number) => dispatcherShifts.deleteSlot(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['disp-slots'] }); qc.invalidateQueries({ queryKey: ['disp-weekly'] }); },
  });
  const addM = useMutation({
    mutationFn: (body: Omit<DispShiftSlot, 'id'>) => dispatcherShifts.createSlot(body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['disp-slots'] }); qc.invalidateQueries({ queryKey: ['disp-weekly'] }); },
  });

  const grouped: Record<string, DispShiftSlot[]> = {};
  for (const s of rows) {
    const key = s.section === 'friday' ? 'friday'
              : s.section === 'motzei_shabbos' ? 'motzei_shabbos'
              : `daily-${s.rosterDow}`;
    (grouped[key] ??= []).push(s);
  }

  const th = 'px-3 py-2 font-extrabold uppercase text-[11px] tracking-[.06em] text-muted text-left';
  const timeCls = 'border border-line rounded-[6px] px-2 py-1 text-[12.5px] bg-paper tabular-nums w-[140px] min-w-[140px]'; // Oct 2: was 95px — AM/PM was cut off

  const dailyDows = [0, 1, 2, 3, 4];
  return (
    <div className="space-y-4">
      <div className="bg-paper border border-line rounded-[14px] p-3 text-[12.5px] text-muted">
        The weekly calendar renders every active slot below. Edit start/end times inline, toggle active, or use <strong>+ Add slot</strong> at the bottom of each section.
      </div>

      {dailyDows.map((d) => (
        <TemplateSection key={`daily-${d}`}
          title={`${ROSTER_DAY_LABELS[d]} — Daily coverage`}
          rows={grouped[`daily-${d}`] ?? []}
          onPatch={(id, body) => patchM.mutate({ id, body })}
          onDelete={(id) => { void uiConfirm('Delete this slot?').then((ok) => { if (ok) { delM.mutate(id); } }); }}
          onAdd={(body) => addM.mutate({ ...body, section: 'daily', rosterDow: d, startDow: d, wrapsNextDay: false, sortOrder: 999, isActive: true })}
          th={th} timeCls={timeCls} />
      ))}
      <TemplateSection title="Friday"
        rows={grouped['friday'] ?? []}
        onPatch={(id, body) => patchM.mutate({ id, body })}
        onDelete={(id) => { void uiConfirm('Delete this slot?').then((ok) => { if (ok) { delM.mutate(id); } }); }}
        onAdd={(body) => addM.mutate({ ...body, section: 'friday', rosterDow: 5, startDow: 5, wrapsNextDay: false, sortOrder: 999, isActive: true })}
        th={th} timeCls={timeCls} />
      <TemplateSection title="Motzei Shabbos"
        rows={grouped['motzei_shabbos'] ?? []}
        onPatch={(id, body) => patchM.mutate({ id, body })}
        onDelete={(id) => { void uiConfirm('Delete this slot?').then((ok) => { if (ok) { delM.mutate(id); } }); }}
        onAdd={(body) => addM.mutate({ ...body, section: 'motzei_shabbos', rosterDow: 6, startDow: 6, wrapsNextDay: false, sortOrder: 999, isActive: true })}
        th={th} timeCls={timeCls} />
    </div>
  );
}

function TemplateSection({ title, rows, onPatch, onDelete, onAdd, th, timeCls }: {
  title: string; rows: DispShiftSlot[];
  onPatch: (id: number, body: Partial<Omit<DispShiftSlot, 'id'>>) => void;
  onDelete: (id: number) => void;
  onAdd: (body: { startTime: string; endTime: string }) => void;
  th: string; timeCls: string;
}) {
  const [newStart, setNewStart] = useState('');
  const [newEnd, setNewEnd] = useState('');
  return (
    <div className="bg-paper border border-line rounded-[14px] overflow-hidden">
      <div className="px-4 py-2 border-b border-line bg-cream/50 font-display font-bold text-[15px] text-ink">{title}</div>
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-line/70">
            <th className={th}>Start</th>
            <th className={th}>End</th>
            <th className={th}>Wraps</th>
            <th className={th}>Active</th>
            <th className={th}></th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={5} className="px-4 py-3 text-[12.5px] text-muted italic">No slots.</td></tr>}
          {rows.map((s) => (
            <tr key={s.id} className="border-b border-line/60">
              <td className="px-3 py-1.5">
                <input type="time" defaultValue={s.startTime} onBlur={(e) => e.target.value !== s.startTime && onPatch(s.id, { startTime: e.target.value })} className={timeCls} />
              </td>
              <td className="px-3 py-1.5">
                <input type="time" defaultValue={s.endTime} onBlur={(e) => e.target.value !== s.endTime && onPatch(s.id, { endTime: e.target.value })} className={timeCls} />
              </td>
              <td className="px-3 py-1.5">
                <input type="checkbox" checked={s.wrapsNextDay} onChange={(e) => onPatch(s.id, { wrapsNextDay: e.target.checked })} />
              </td>
              <td className="px-3 py-1.5">
                <input type="checkbox" checked={s.isActive} onChange={(e) => onPatch(s.id, { isActive: e.target.checked })} />
              </td>
              <td className="px-3 py-1.5 text-right">
                <button onClick={() => onDelete(s.id)} className="haptic text-[12.5px] font-bold text-clay hover:underline">Delete</button>
              </td>
            </tr>
          ))}
          <tr className="bg-cream/30">
            <td className="px-3 py-1.5"><input type="time" value={newStart} onChange={(e) => setNewStart(e.target.value)} className={timeCls} /></td>
            <td className="px-3 py-1.5"><input type="time" value={newEnd} onChange={(e) => setNewEnd(e.target.value)} className={timeCls} /></td>
            <td className="px-3 py-1.5 text-[11px] text-muted">(auto)</td>
            <td className="px-3 py-1.5"></td>
            <td className="px-3 py-1.5 text-right">
              <button onClick={() => {
                if (!newStart || !newEnd) return;
                onAdd({ startTime: newStart, endTime: newEnd });
                setNewStart(''); setNewEnd('');
              }}
                      className="haptic text-[11.5px] font-bold text-paper bg-forest rounded-[8px] px-3 py-1 hover:bg-forest-deep">+ Add slot</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/**
 * ScheduleDownloadModal — client Aug 12.
 *
 * Simple date-range picker over /api/admin/schedule-export. Fetches with
 * the JWT auth header (window.location.href can't set headers), then
 * hands the returned .xlsx blob to the browser as a download.
 * Default range: today to today + 14 days (NY-local wall clock).
 */
function ScheduleDownloadModal({ onClose }: { onClose: () => void }) {
  const todayISO = (() => {
    const s = new Date().toLocaleDateString('en-CA', {
      year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'America/New_York',
    });
    return s;
  })();
  const plus14ISO = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toLocaleDateString('en-CA', {
      year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'America/New_York',
    });
  })();
  const [from, setFrom] = useState(todayISO);
  const [to,   setTo]   = useState(plus14ISO);
  const [busy, setBusy] = useState(false);
  const [err,  setErr]  = useState<string | null>(null);

  async function run() {
    setBusy(true); setErr(null);
    try {
      // Reuse the shared API_BASE + JWT so /rescue-api proxying works
      // identically on staging (web) and native (Capacitor).
      const { API_BASE, getToken } = await import('../api');
      const token = getToken();
      const r = await fetch(
        `${API_BASE.replace(/\/$/, '')}/api/admin/schedule-export?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error((body as any).error || `${r.status} ${r.statusText}`);
      }
      const blob = await r.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `zlz-schedule-${from}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5_000);
      onClose();
    } catch (e: any) {
      setErr(e?.message || 'Download failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-ink/40 p-4">
      <div className="w-[420px] max-w-full bg-paper rounded-[16px] shadow-lift border border-line p-5"
           onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="font-display font-bold text-[18px] text-ink">Download schedule</div>
            <div className="text-[12px] text-muted mt-0.5">
              Pickups, steady templates, dispatcher &amp; center-help shifts — as one .xlsx.
            </div>
          </div>
          <button onClick={onClose} className="haptic text-muted hover:text-ink" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-[11px] font-extrabold uppercase tracking-[.05em] text-muted">From</span>
            <DateInput value={from} onChange={setFrom}
                   className="mt-1 w-full rounded-[10px] border border-line bg-cream px-3 py-2 text-[13px]" />
          </label>
          <label className="block">
            <span className="text-[11px] font-extrabold uppercase tracking-[.05em] text-muted">To</span>
            <DateInput value={to} onChange={setTo}
                   className="mt-1 w-full rounded-[10px] border border-line bg-cream px-3 py-2 text-[13px]" />
          </label>
        </div>
        {err && (
          <div className="mt-3 text-[12px] text-clay bg-clay/10 border border-clay/30 rounded-[8px] px-3 py-2">
            {err}
          </div>
        )}
        <div className="mt-5 flex items-center justify-end gap-2">
          <button onClick={onClose} disabled={busy}
                  className="haptic text-[12.5px] font-bold px-3 py-2 rounded-[10px] border border-line text-ink hover:bg-cream disabled:opacity-50">
            Cancel
          </button>
          <button onClick={run} disabled={busy || !from || !to || from > to}
                  className="haptic text-[12.5px] font-bold px-3 py-2 rounded-[10px] bg-forest text-paper shadow-ctag hover:brightness-110 disabled:opacity-50">
            {busy ? 'Downloading…' : 'Download .xlsx'}
          </button>
        </div>
      </div>
    </div>
  );
}
