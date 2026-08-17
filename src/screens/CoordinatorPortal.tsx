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
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import L from 'leaflet';
import { useEffect, useRef } from 'react';
import { LayoutGrid, Calendar, Users, Store, BarChart3, LogOut, MessageSquare, Repeat, ClipboardList, Settings, MapPin, ShieldCheck, X } from 'lucide-react';
import { api, broadcast, canWrite, dm, getUser, location as locationApi, smsInbox, type SignupRow } from '../api';
import { SlotAvatars, SlotLabel, cx } from '../design';
import { ChatThread } from '../chat-thread';
import { SuppliersPanel, VolunteersPanel, SteadyPickupsPanel, SignInPanel, SettingsPanel, NeighborhoodsPanel, CoveragePanel, QuickPickupModal, ChangePasswordPanel, BroadcastPanel, SmsComposerPanel, SmsGroupsPanel, SmsThreadsPanel, SmsDispatchersPanel, DispatchersPanel, SupplierForm, SteadyForm, ShiftsPanel, CenterHelpStandalonePanel } from '../portal-sections';
// Tabbed wrapper components consolidating the "Chat" and "Admin" sub-items
// (batch abc820 Aug 11 · nav consolidation). Defined below in this file.
import { ProspectsPanel, NeedsConfirmationSection } from '../prospects-and-confirmation';
import { RecruitingPanel } from '../crm-sections';
import { ReportsPanel } from '../reports-panel';
import { PortalSearchBar } from '../portal-search';
import { CalendarPanel } from './CalendarPanel';
import { AdminPickupDetail } from './AdminPickupDetail';
import { Plus, KeyRound, UserPlus2 } from 'lucide-react';

type TabKey = 'calendar' | 'live' | 'pickups' | 'volunteers' | 'suppliers' | 'reports' | 'chat-stores' | 'chat-volunteers' | 'sms-combo' | 'dispatchers-combo' | 'steady' | 'shifts' | 'center-help' | 'signin' | 'settings' | 'neighborhoods' | 'coverage' | 'change-password' | 'recruiting' | 'prospects';

const NAV_ITEMS: { key: TabKey; label: string; icon: any; section?: 'top' | 'chat' | 'admin' }[] = [
  // client Aug 13 (C6) — Live Board is the default landing again; Calendar
  // sits as a secondary page after Pickups. Reversal of the Aug 12 change
  // that promoted Calendar to first — client asked for the original order.
  { key: 'live',           label: 'Live Board',     icon: LayoutGrid,    section: 'top' },
  { key: 'pickups',        label: 'Pickups',        icon: Calendar,      section: 'top' },
  { key: 'calendar',       label: 'Calendar',       icon: Calendar,      section: 'top' },
  { key: 'volunteers',     label: 'Volunteers',     icon: Users,         section: 'top' },
  { key: 'suppliers',      label: 'Suppliers',      icon: Store,         section: 'top' },
  { key: 'prospects',      label: 'Prospects',      icon: UserPlus2,     section: 'top' },
  { key: 'steady',         label: 'Steady Pickups', icon: Repeat,        section: 'top' },
  { key: 'shifts',         label: 'Dispatching Shifts', icon: Calendar,  section: 'top' },
  { key: 'center-help',    label: 'Center Help',    icon: Calendar,      section: 'top' },
  { key: 'coverage',       label: 'Coverage',       icon: ShieldCheck,   section: 'top' },
  { key: 'recruiting',     label: 'Recruiting',     icon: UserPlus2,     section: 'top' },
  { key: 'reports',        label: 'Reports',        icon: BarChart3,     section: 'top' },
  // Chat section — consolidated from 6+ items to 3.
  { key: 'chat-stores',    label: 'Chat: Stores',      icon: MessageSquare, section: 'chat' },
  { key: 'chat-volunteers',label: 'Chat: Drivers',     icon: MessageSquare, section: 'chat' },
  { key: 'sms-combo',      label: 'SMS Composer & Broadcast', icon: MessageSquare, section: 'chat' },
  // Admin section — Dispatchers combines "Manage dispatchers" + "Driver-reply SMS".
  { key: 'dispatchers-combo', label: 'Dispatchers',   icon: ShieldCheck,   section: 'admin' },
  { key: 'signin',         label: 'Office Sign-In', icon: ClipboardList, section: 'admin' },
  { key: 'neighborhoods',  label: 'Neighborhoods',  icon: MapPin,        section: 'admin' },
  { key: 'settings',       label: 'Settings',       icon: Settings,      section: 'admin' },
  { key: 'change-password',label: 'Change password',icon: KeyRound,      section: 'admin' },
];

type PiRow = {
  id: number; scheduled_date: string; scheduled_time: string; status: string;
  suppliers: string | null; supplier_address: string | null;
  supplier_city?: string | null; supplier_logo_url?: string | null;
  estimated_quantity?: string | null;
  // One-time-pickup fields (present when no supplier_id is attached to the row).
  contact_name: string | null; contact_phone: string | null;
  pickup_address: string | null;
  is_one_time?: boolean;
  posted_via_supplier?: boolean;
  must_pickup_by?: string | null;
  notes: string | null; food_description: string | null; slots_capacity: number;
  signups?: SignupRow[];
  // For instances materialized from a steady_pickup template: the template's
  // name (e.g. "Bites cafe"). Used as a card-label fallback when the template
  // has no supplier attached, so the card doesn't read as "One-time pickup."
  steady_pickup_id?: number | null;
  steady_name?: string | null;
};
type Place = { id: number; name: string; status: string };

export function CoordinatorPortal() {
  const user = getUser();
  // Read-only staff (viewer / read_only) can browse the portal but can't
  // trigger writes. Hide destructive/creation UI when write isn't allowed.
  const writeOk = canWrite(user?.role);
  // C1 Aug 13 — pickup detail is now a modal (see modalPickupId), no route
  // navigation from Live Board rows. useNavigate() call removed.
  const qc   = useQueryClient();
  const [tab, setTab] = useState<TabKey>('live');
  // Issue #17 Aug 10: hide fully-covered pickups from the default Live Board;
  // dispatcher can toggle "Show covered" to reveal them.
  const [showCoveredOnLive, setShowCoveredOnLive] = useState(false);
  const [pickerFor, setPickerFor] = useState<PiRow | null>(null);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [editingPickup, setEditingPickup] = useState<PiRow | null>(null);
  // C1 Aug 13 — click a pickup row/card → open detail as a modal in place
  // rather than navigating to /admin/pickup/:id. Preserves scroll + context.
  const [modalPickupId, setModalPickupId] = useState<number | null>(null);
  // Per-pickup SMS modal removed — SMS is now managed from the dedicated
  // SMS Composer / SMS Groups / SMS Threads tabs.
  const [smsPickup] = useState<PiRow | null>(null);
  // 3-way "New…" dropdown in the header: one-time pickup, steady pickup, new
  // supplier. Also drives the standalone "New supplier" flow so it lives
  // outside the pickup form now.
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const [showNewSupplierStandalone, setShowNewSupplierStandalone] = useState(false);
  const [showNewSteady, setShowNewSteady] = useState(false);
  // client Aug 12 — schedule .xlsx download modal (date-range picker).
  const [showScheduleDownload, setShowScheduleDownload] = useState(false);
  // When a search result is picked, we jump to the matching tab AND stash the id
  // so the tab's panel can open that entity's edit modal on mount.
  const [openPersonId, setOpenPersonId] = useState<number | null>(null);
  // batch abc820 · Pickups tab tabstrip (Needs attention / Upcoming /
  // Completed / History) replaces the old office-status chip filter + date
  // focus. Sub-tab lives here so it survives while the user scrolls entities
  // in and out.
  const [pickupsSubTab, setPickupsSubTab] = useState<PickupsSubTab>('attention');

  // Pickups feed range: today through +7d for the live board is fine on its
  // own, but the Pickups tab's Completed/History sub-tabs need up to 60 days
  // back. Widen the shared fetch so both surfaces work off one cache entry.
  const today    = new Date().toISOString().slice(0, 10);
  const fromDate = new Date(Date.now() - 60 * 86400e3).toISOString().slice(0, 10);
  const inAMonth = new Date(Date.now() + 30 * 86400e3).toISOString().slice(0, 10);
  const pickups = useQuery({
    queryKey: ['admin-pickups', today],
    queryFn:  () => api<{ data: PiRow[] }>(`/api/pickup-instances?from=${fromDate}&to=${inAMonth}`),
  });
  const suppliers = useQuery({
    queryKey: ['admin-suppliers'],
    queryFn:  () => api<{ data: any[] }>('/api/suppliers?limit=500'),
  });
  const volunteers = useQuery({
    queryKey: ['admin-volunteers'],
    queryFn:  () => api<{ data: any[] }>('/api/volunteers?limit=500'),
  });


  const supplierPlaces: Place[] = (suppliers.data?.data ?? []).slice(0, 14).map((s: any) => ({
    id: s.id, name: s.name, status: s.status ?? 'active',
  }));

  // Determines what the map and feed pane render. Live = everything; the
  // entity tabs narrow to one type. Reports/Map have their own treatment.
  const showPickups    = tab === 'live' || tab === 'pickups';
  const showSuppliers  = tab === 'live' || tab === 'suppliers';
  const showVolunteers = tab === 'live' || tab === 'volunteers';

  // The map only belongs on geographic / dispatch tabs. Admin, chat, settings,
  // reports, etc. get the full right pane width — no map underneath.
  const mapTabs: TabKey[] = ['live', 'pickups', 'volunteers', 'suppliers', 'coverage'];
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
    const when = new Date(p.scheduled_date.slice(0,10) + 'T' + (p.scheduled_time || '00:00:00')).getTime();
    const inWindow = when >= (nowMs2 - 30 * 60_000) && when <= endOfTodayMs;
    // Overdue-and-unresolved override — always keep visible.
    const isOverdueUnresolved = when < nowMs2 && !DONE_STATUSES.includes(status);
    return inWindow || isOverdueUnresolved;
  });
  // §1: Live Board keeps its 6-hour rolling window (unchanged). The Pickups
  // tab now respects the office-status chip filter + date focus + the new
  // sub-tab (Needs attention / Upcoming / Completed / History).
  const feedPickups = useMemo(() => {
    if (tab === 'live') {
      // Live Board only sees "today from now onward" (livePickups pre-filtered).
      if (showCoveredOnLive) return livePickups;
      // Hide fully-covered pickups from default Live Board (Issue #17).
      return livePickups.filter((p) => {
        const need = Number((p as any).slots_capacity ?? 1) || 1;
        const filled = ((p as any).signups ?? []).length;
        return filled < need;
      });
    }
    if (tab !== 'pickups') {
      // No other tab drives this feed anymore — return raw list for safety.
      return allPickups;
    }
    // ── Pickups tab: sub-tab drives the filter. ───────────────────────────
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayStartMs = todayStart.getTime();
    const nowMs3 = Date.now();
    const sixtyDaysAgo = nowMs3 - 60 * 86400e3;
    if (pickupsSubTab === 'attention') {
      // abc820 (Aug 11): "Needs attention" = the same rule the section header
      // uses ("Looking for a driver · N pending") — not closed, no driver
      // signed up, not supplier-posted, window has passed. This lines the
      // tab count up with what dispatch actually needs to act on.
      return allPickups.filter((p) => {
        const status = String(p.status || '').toLowerCase();
        if (DONE_STATUSES.includes(status)) return false;
        if ((p as any).posted_via_supplier) return false;
        const activeSignups = ((p as any).signups ?? [])
          .filter((s: any) => !s.released_at).length;
        if (activeSignups > 0) return false;
        const startMs = new Date(p.scheduled_date.slice(0,10) + 'T' + (p.scheduled_time || '00:00:00')).getTime();
        const windowEndMs = (p as any).must_pickup_by
          ? new Date((p as any).must_pickup_by).getTime()
          : startMs + 60 * 60_000;
        return windowEndMs < nowMs3;
      });
    }
    if (pickupsSubTab === 'upcoming') {
      return allPickups
        .filter((p) => {
          const status = String(p.status || '').toLowerCase();
          if (DONE_STATUSES.includes(status)) return false;
          const dayMs = new Date(p.scheduled_date.slice(0,10) + 'T00:00:00').getTime();
          return dayMs >= todayStartMs;
        })
        .sort((a, b) => (a.scheduled_date + a.scheduled_time).localeCompare(b.scheduled_date + b.scheduled_time));
    }
    if (pickupsSubTab === 'completed') {
      return allPickups
        .filter((p) => {
          const status = String(p.status || '').toLowerCase();
          return status === 'completed' || status === 'delivered';
        })
        .sort((a, b) => (b.scheduled_date + b.scheduled_time).localeCompare(a.scheduled_date + a.scheduled_time));
    }
    // history — everything in the last 60 days, most recent first.
    return allPickups
      .filter((p) => {
        const dayMs = new Date(p.scheduled_date.slice(0,10) + 'T00:00:00').getTime();
        return dayMs >= sixtyDaysAgo;
      })
      .sort((a, b) => (b.scheduled_date + b.scheduled_time).localeCompare(a.scheduled_date + a.scheduled_time));
  }, [tab, livePickups, allPickups, showCoveredOnLive, pickupsSubTab]);

  // Counts per sub-tab, driven off allPickups so the strip always shows
  // accurate badges (even when the current sub-tab is empty).
  const pickupsSubCounts = useMemo(() => {
    const nowMs3 = Date.now();
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayStartMs = todayStart.getTime();
    const sixtyDaysAgo = nowMs3 - 60 * 86400e3;
    // abc820 (Aug 11): attention count uses the same "Looking for a driver ·
    // N pending" rule as the section header — not closed, no active signup,
    // not supplier-posted, past window.
    let attention = 0, upcoming = 0, completed = 0, history = 0;
    for (const p of allPickups) {
      const status = String(p.status || '').toLowerCase();
      const isDone = DONE_STATUSES.includes(status);
      if (!isDone && !(p as any).posted_via_supplier) {
        const activeSignups = ((p as any).signups ?? [])
          .filter((s: any) => !s.released_at).length;
        if (activeSignups === 0) {
          const startMs = new Date(p.scheduled_date.slice(0,10) + 'T' + (p.scheduled_time || '00:00:00')).getTime();
          const windowEndMs = (p as any).must_pickup_by
            ? new Date((p as any).must_pickup_by).getTime()
            : startMs + 60 * 60_000;
          if (windowEndMs < nowMs3) attention++;
        }
      }
      if (!isDone) {
        const dayMs = new Date(p.scheduled_date.slice(0,10) + 'T00:00:00').getTime();
        if (dayMs >= todayStartMs) upcoming++;
      }
      if (status === 'completed' || status === 'delivered') completed++;
      const dayMs = new Date(p.scheduled_date.slice(0,10) + 'T00:00:00').getTime();
      if (dayMs >= sixtyDaysAgo) history++;
    }
    return { attention, upcoming, completed, history };
  }, [allPickups]);

  // Subtitle count = pickups NOT yet completed within the current feed scope
  // (§1.3 — Completed pickups must not remain in the upcoming count).
  const upcomingCount = useMemo(
    () => feedPickups.filter((p) => {
      const os = officeStatusOf(p);
      return os !== 'complete' && os !== 'missed';
    }).length,
    [feedPickups]
  );

  const groups = useMemo(() => groupByDate(feedPickups), [feedPickups]);

  // Operational counters for the Live Board tiles.
  const nowMs = Date.now();
  const overdueCount = allPickups.filter((p) => {
    const status = String(p.status || '').toLowerCase();
    if (['completed', 'delivered', 'cancelled'].includes(status)) return false;
    if ((p.signups?.length ?? 0) > 0) return false;
    // Supplier-posted pickups don't have a real end-of-window — just show
    // "open calls", never mark them overdue (client abc792).
    if (p.posted_via_supplier) return false;
    const startMs = new Date(p.scheduled_date.slice(0, 10) + 'T' + (p.scheduled_time || '00:00:00')).getTime();
    const endMs   = p.must_pickup_by ? new Date(p.must_pickup_by).getTime() : startMs + 60 * 60_000;
    return endMs < nowMs;
  }).length;
  const unassignedThisWeek = allPickups.filter((p) => {
    if ((p.signups?.length ?? 0) > 0) return false;
    const startMs = new Date(p.scheduled_date.slice(0, 10) + 'T' + (p.scheduled_time || '00:00:00')).getTime();
    return startMs >= nowMs && startMs <= nowMs + 7 * 24 * 3600e3;
  }).length;

  function signOut() { if (confirm('Sign out?')) { localStorage.clear(); window.location.reload(); } }

  // Live SMS-reply toaster. Polls /admin/sms-inbox every 20s; when the highest
  // seen id increases, pop a toast. First poll seeds the baseline so we don't
  // toast historical replies on page load.
  const [replyToast, setReplyToast] = useState<{ id: number; who: string; body: string } | null>(null);
  const seenSinceIdRef = useRef<number | null>(null);
  const inboxQ = useQuery({
    queryKey: ['sms-inbox-toast'],
    queryFn: () => smsInbox.list(),
    refetchInterval: 20_000,
  });
  useEffect(() => {
    const rows = inboxQ.data?.data ?? [];
    const top = rows[0];
    if (!top) return;
    if (seenSinceIdRef.current === null) { seenSinceIdRef.current = top.id; return; }
    if (top.id > seenSinceIdRef.current) {
      seenSinceIdRef.current = top.id;
      const nm = `${top.first_name ?? ''} ${top.last_name ?? ''}`.trim();
      const who = (nm ? `${nm}${top.unit_number != null ? ` #${top.unit_number}` : ''}` : (top.phone ?? 'Unknown'));
      setReplyToast({ id: top.id, who, body: top.body.replace(/^\[SMS\]\s*/, '').slice(0, 240) });
    }
  }, [inboxQ.data]);

  return (
    <div className="min-h-screen bg-cream flex">
      {/* LEFT NAV */}
      <aside className="w-[280px] bg-forest-deep text-[#cfe0c8] flex-col shrink-0 hidden lg:flex lg:sticky lg:top-0 lg:self-start lg:h-screen">
        <div className="px-3 pt-4 pb-3 flex items-center gap-3">
          <span className="grid h-[38px] w-[38px] place-items-center rounded-[9px] bg-paper text-forest font-display font-extrabold text-[17px]">ז</span>
          <span className="text-paper font-display font-semibold text-[17px]">Zeh L'Zeh</span>
        </div>
        <nav className="px-3 mt-2 flex-1 overflow-y-auto">
          {/* Section 1 — Operations (default sage green text). */}
          {NAV_ITEMS.filter((it) => it.section === 'top').map((it) => (
            <button key={it.key} onClick={() => setTab(it.key)}
                    className={cx('w-full flex items-center gap-3 px-3 py-3 rounded-[10px] text-[15px] font-bold haptic',
                                  tab === it.key ? 'bg-paper/15 text-paper' : 'text-[#cfe0c8] hover:bg-paper/5')}>
              <it.icon size={20} />
              {it.label}
            </button>
          ))}

          {/* Section 2 — Chat (sky tint, italic header, divider). */}
          <SectionDivider label="Chat" tone="sky" />
          {NAV_ITEMS.filter((it) => it.section === 'chat').map((it) => (
            <button key={it.key} onClick={() => setTab(it.key)}
                    className={cx('w-full flex items-center gap-3 px-3 py-3 rounded-[10px] text-[15px] font-bold haptic relative',
                                  tab === it.key ? 'bg-paper/15 text-paper' : 'text-[#b8d3e0] hover:bg-paper/5')}>
              <it.icon size={20} />
              {it.label}
              <UnreadBadge kind={it.key === 'chat-stores' ? 'stores' : 'volunteers'} />
            </button>
          ))}

          {/* Section 3 — Admin (amber tint, italic header, divider). */}
          <SectionDivider label="Admin" tone="amber" />
          {NAV_ITEMS.filter((it) => it.section === 'admin').map((it) => (
            <button key={it.key} onClick={() => setTab(it.key)}
                    className={cx('w-full flex items-center gap-3 px-3 py-3 rounded-[10px] text-[15px] font-bold haptic',
                                  tab === it.key ? 'bg-paper/15 text-paper' : 'text-[#e6c98a] hover:bg-paper/5')}>
              <it.icon size={20} />
              {it.label}
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
          <button onClick={signOut} className="w-full flex items-center gap-2 px-3 py-2 rounded-[10px] text-[12px] font-bold text-[#a9c2a0] hover:bg-paper/5 haptic">
            <LogOut size={15} /> Sign out
          </button>
        </div>
      </aside>

      {/* MAIN */}
      <main className="flex-1 min-w-0 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-line bg-paper">
          <div className="flex items-baseline gap-4">
            <div>
              <div className="font-display font-semibold text-[20px] tracking-[-0.01em]">{TAB_TITLE[tab]}</div>
              <div className="text-[12.5px] text-muted">{TAB_SUB[tab]} · {upcomingCount} upcoming</div>
            </div>
            {tab === 'live' && (
              <div className="flex items-center gap-2">
                {overdueCount > 0 && (
                  <button onClick={() => setTab('pickups')}
                          title="Filter to pickups waiting for a driver"
                          className="haptic flex items-baseline gap-1.5 rounded-[10px] bg-amber/10 border border-amber/40 px-2.5 py-1">
                    <span className="font-display font-bold text-[15px] text-forest-deep leading-none">{overdueCount}</span>
                    <span className="text-[10.5px] font-extrabold uppercase tracking-[.06em] text-forest-deep">Waiting</span>
                  </button>
                )}
                {unassignedThisWeek > 0 && (
                  <button onClick={() => setTab('pickups')}
                          className="haptic flex items-baseline gap-1.5 rounded-[10px] bg-amber-soft border border-amber/40 px-2.5 py-1">
                    <span className="font-display font-bold text-[15px] text-[#9a7415] leading-none">{unassignedThisWeek}</span>
                    <span className="text-[10.5px] font-extrabold uppercase tracking-[.06em] text-[#9a7415]">Unassigned · 7d</span>
                  </button>
                )}
                {/* Issue #17 — reveal covered pickups when needed. Default hidden. */}
                <button onClick={() => setShowCoveredOnLive((v) => !v)}
                        title={showCoveredOnLive ? 'Hide fully-covered pickups' : 'Also show fully-covered pickups'}
                        className={cx('haptic flex items-baseline gap-1.5 rounded-[10px] px-2.5 py-1 border',
                          showCoveredOnLive
                            ? 'bg-sage border-forest/30 text-forest-deep'
                            : 'bg-cream border-line text-muted hover:text-forest-deep')}>
                  <span className="text-[10.5px] font-extrabold uppercase tracking-[.06em]">
                    {showCoveredOnLive ? '✓ Showing covered' : 'Show covered'}
                  </span>
                </button>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            <PortalSearchBar onPick={(t, id) => { setTab(t as TabKey); setOpenPersonId(id ?? null); }} />
            {/* client Aug 12 — schedule .xlsx download. Visible to all staff
                (read-only + write); it's a report, not a write action. */}
            <button onClick={() => setShowScheduleDownload(true)}
                    title="Download the schedule as an Excel file (pickups, steady templates, dispatcher + center-help shifts)"
                    className="haptic flex items-center gap-1.5 text-[12px] font-bold bg-paper border border-line text-forest-deep rounded-[10px] px-3 py-2 hover:bg-cream">
              <span aria-hidden>↓</span> Download schedule
            </button>
            {writeOk && (
              <div className="relative">
                <button onClick={() => setNewMenuOpen((v) => !v)}
                        className="haptic flex items-center gap-1.5 text-[12.5px] font-bold bg-forest text-paper rounded-[10px] px-3 py-2 shadow-ctag hover:brightness-110">
                  <Plus size={14} /> New… ▾
                </button>
                {newMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setNewMenuOpen(false)} />
                    <div className="absolute right-0 top-full mt-1 z-50 min-w-[220px] rounded-[12px] border border-line bg-paper shadow-lift overflow-hidden">
                      <button onClick={() => { setNewMenuOpen(false); setShowQuickAdd(true); }}
                              className="w-full text-left px-4 py-3 hover:bg-cream/60 border-b border-line">
                        <div className="text-[13px] font-extrabold text-forest">One-time pickup</div>
                        <div className="text-[11px] text-muted mt-0.5">Add a walk-in or ad-hoc pickup for today.</div>
                      </button>
                      <button onClick={() => { setNewMenuOpen(false); setShowNewSteady(true); }}
                              className="w-full text-left px-4 py-3 hover:bg-cream/60 border-b border-line">
                        <div className="text-[13px] font-extrabold text-forest">Steady pickup (recurring)</div>
                        <div className="text-[11px] text-muted mt-0.5">A weekly schedule that auto-generates future pickups.</div>
                      </button>
                      <button onClick={() => { setNewMenuOpen(false); setShowNewSupplierStandalone(true); }}
                              className="w-full text-left px-4 py-3 hover:bg-cream/60">
                        <div className="text-[13px] font-extrabold text-forest">New supplier</div>
                        <div className="text-[11px] text-muted mt-0.5">Add a store / caterer / donor. Doesn't create a pickup.</div>
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
            <span className="text-[11px] font-bold py-1.5 px-3 rounded-full bg-clay-soft text-clay">● Live</span>
            <span className="text-[12.5px] text-muted">{user?.firstName} {user?.lastName}</span>
            {!writeOk && <span className="text-[10.5px] font-extrabold uppercase tracking-[.06em] text-muted bg-line/70 px-2 py-0.5 rounded-full" title="Your role is view-only">Read-only</span>}
          </div>
        </div>

        {/* Split: map + feed (the map only shows on dispatch tabs; on admin/
            chat/settings/etc. the right pane takes the full width). */}
        <div className="flex-1 flex min-h-0">
          {showMap && (
            <div className="flex-1 border-r border-line">
              <CoordMap
                rows={showPickups ? (pickups.data?.data ?? []) : []}
                suppliers={showSuppliers ? (suppliers.data?.data ?? []) : []}
                showVolunteers={showVolunteers}
                onOpen={(id) => setModalPickupId(id)} />
            </div>
          )}

          <div className={cx('overflow-y-auto px-5 py-5 bg-cream/50',
                             showMap ? 'w-[480px] shrink-0' : 'flex-1 min-w-0')}>
            {/* Fork S · Aug 7 — occasional pickups awaiting dispatcher
                confirm/decline. Only rendered on the Live Board; returns null
                when nothing needs confirmation today. */}
            {tab === 'live' && <NeedsConfirmationSection />}
            {tab === 'calendar' ? (
              <CalendarPanel onOpenScheduleDownload={() => setShowScheduleDownload(true)}
                             onNavigateTab={(t, id) => { setTab(t as TabKey); if (id != null) setOpenPersonId(id); }} />
            ) : tab === 'suppliers' ? (
              <SuppliersPanel rows={suppliers.data?.data ?? []} refetch={() => suppliers.refetch()}
                              openId={openPersonId} onOpenConsumed={() => setOpenPersonId(null)} />
            ) : tab === 'volunteers' ? (
              <VolunteersPanel rows={volunteers.data?.data ?? []} refetch={() => volunteers.refetch()}
                               openId={openPersonId} onOpenConsumed={() => setOpenPersonId(null)} />
            ) : tab === 'steady' ? (
              <SteadyPickupsPanel />
            ) : tab === 'shifts' ? (
              <ShiftsPanel />
            ) : tab === 'center-help' ? (
              <CenterHelpStandalonePanel />
            ) : tab === 'signin' ? (
              <SignInPanel />
            ) : tab === 'settings' ? (
              <SettingsPanel />
            ) : tab === 'neighborhoods' ? (
              <NeighborhoodsPanel />
            ) : tab === 'change-password' ? (
              <ChangePasswordPanel />
            ) : tab === 'recruiting' ? (
              <RecruitingPanel />
            ) : tab === 'coverage' ? (
              <CoveragePanel />
            ) : tab === 'reports' ? (
              <ReportsPanel />
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
                <PickupsSubTabStrip current={pickupsSubTab} onChange={setPickupsSubTab} counts={pickupsSubCounts} />
                {groups.length === 0 ? (
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
                                    onEdit={writeOk ? () => setEditingPickup(p) : undefined} />
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
                  {tab === 'live' ? 'All quiet for now' : 'No pickups scheduled'}
                </div>
                <p className="text-[13.5px] text-muted mt-2 max-w-[38ch] mx-auto">
                  {tab === 'live'
                    ? 'Nothing left for today. Switch to Pickups for the 7-day view.'
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
                  <div className="text-[11px] font-extrabold uppercase tracking-[.05em] text-clay mb-3">
                    Showing the rest of today · {livePickups.length} of {allPickups.length}
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
                                  onEdit={writeOk ? () => setEditingPickup(p) : undefined} />
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
        <div onClick={() => setModalPickupId(null)}
             className="fixed inset-0 z-[2000] bg-ink/60 flex items-start justify-center p-4 sm:p-6 overflow-y-auto">
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

      {/* SMS-reply live toaster (upper-right). Clicking jumps to the inbox. */}
      {replyToast && (
        <div className="fixed top-4 right-4 z-[3000] w-[360px] rounded-[14px] border-2 border-sky bg-paper shadow-lift p-4 animate-in fade-in slide-in-from-top-4">
          <div className="flex items-start gap-2">
            <div className="text-[18px]">📩</div>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-extrabold uppercase tracking-[.05em] text-sky-deep">New SMS reply</div>
              <div className="font-bold text-[14px] mt-0.5">{replyToast.who}</div>
              <div className="text-[13px] text-ink mt-1 whitespace-pre-wrap">{replyToast.body}</div>
              <div className="flex gap-2 mt-3">
                <button onClick={() => { setTab('sms-combo'); setReplyToast(null); }}
                        className="haptic text-[12px] font-bold bg-sky text-paper px-3 py-1.5 rounded-[8px]">
                  Open threads →
                </button>
                <button onClick={() => setReplyToast(null)}
                        className="haptic text-[12px] font-bold text-muted px-3 py-1.5 rounded-[8px] hover:bg-cream/60">
                  Dismiss
                </button>
              </div>
            </div>
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
 * store/where/when/what fields and appends "Reply YES to accept".
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
    <div onClick={onClose} className="fixed inset-0 z-[2000] bg-ink/50 flex items-start justify-center pt-16 px-4">
      <div onClick={(e) => e.stopPropagation()}
           className="relative z-[2001] bg-paper rounded-[18px] shadow-lift border border-line w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
        <div className="px-5 py-3 border-b border-line">
          <div className="font-display font-semibold text-[18px]">Text pickup to drivers</div>
          <div className="text-[12px] text-muted mt-0.5">
            {pickup.suppliers || pickup.contact_name || 'Pickup'} · {pickup.scheduled_date} {fmtTime(pickup.scheduled_time?.slice(0, 5) ?? '')}
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
            SMS will include store, address, time, food, drop-off location, and "Reply YES to accept."
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
  const [pending, setPending] = useState<{ v: any } | null>(null); // confirmation target

  const addMut = useMutation({
    mutationFn: (vid: number) => api(`/api/pickup-instances/${pickup.id}/volunteers`,
      { method: 'POST', body: JSON.stringify({ volunteerId: vid }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-pickups'] }); onChanged(); onClose(); },
  });
  const removeMut = useMutation({
    mutationFn: (vid: number) => api(`/api/pickup-instances/${pickup.id}/volunteers/${vid}`, { method: 'DELETE' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-pickups'] }); onChanged(); },
  });
  const slotsMut = useMutation({
    mutationFn: (n: number) => api(`/api/pickup-instances/${pickup.id}`,
      { method: 'PATCH', body: JSON.stringify({ slotsCapacity: n }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-pickups'] }); onChanged(); },
  });

  const current = pickup.signups ?? [];
  const currentIds = new Set(current.map((s: any) => Number(s.volunteer_id)));

  const filtered = volunteers
    .filter((v) => !v.deletedAt && v.status !== 'inactive')
    .filter((v) => {
      if (!q.trim()) return true;
      const hay = `${v.firstName} ${v.lastName} ${v.phonePrimary ?? ''} ${v.locationArea ?? ''}`.toLowerCase();
      return hay.includes(q.trim().toLowerCase());
    })
    .slice(0, 80);

  const slotsNeeded = pickup.slots_capacity ?? 1;
  function handlePick(v: any) {
    if (currentIds.has(v.id)) return;             // already on it
    // No confirm while we're still under the planned driver count — that's
    // exactly what was scheduled. Confirm only when going BEYOND the plan
    // (e.g. pickup set for 1 driver but coordinator adds a second).
    if (current.length < slotsNeeded) {
      addMut.mutate(v.id);
      return;
    }
    setPending({ v });
  }
  function confirmAdd() {
    if (!pending) return;
    addMut.mutate(pending.v.id);
    setPending(null);
  }

  return (
    <div onClick={onClose} className="fixed inset-0 z-[2000] bg-ink/50 flex items-start justify-center pt-16 px-4">
      <div onClick={(e) => e.stopPropagation()}
           className="relative z-[2001] bg-paper rounded-[18px] shadow-lift border border-line w-full max-w-md max-h-[85vh] overflow-hidden flex flex-col">
        <div className="px-5 py-3 border-b border-line">
          <div className="font-display font-semibold text-[18px]">Drivers on this pickup</div>
          <div className="text-[12px] text-muted mt-0.5">
            {pickup.suppliers || 'Pickup'} · {pickup.scheduled_date} {fmtTime(pickup.scheduled_time?.slice(0, 5) ?? '')}
          </div>
          <div className="mt-2.5 flex items-center gap-2">
            <span className="text-[11.5px] font-bold text-muted">Drivers needed:</span>
            <div className="flex items-center gap-1.5 bg-cream/60 rounded-full border border-line px-1.5 py-0.5">
              <button onClick={() => slotsMut.mutate(Math.max(1, (pickup.slots_capacity ?? 1) - 1))}
                      disabled={slotsMut.isPending || (pickup.slots_capacity ?? 1) <= 1}
                      className="grid h-6 w-6 place-items-center rounded-full text-muted hover:bg-paper disabled:opacity-40 haptic">−</button>
              <span className="font-display font-bold text-[14px] text-forest w-5 text-center">{pickup.slots_capacity ?? 1}</span>
              <button onClick={() => slotsMut.mutate(Math.min(20, (pickup.slots_capacity ?? 1) + 1))}
                      disabled={slotsMut.isPending}
                      className="grid h-6 w-6 place-items-center rounded-full text-forest hover:bg-paper haptic">+</button>
            </div>
            {slotsMut.isPending && <span className="text-[11px] text-muted">saving…</span>}
          </div>
        </div>

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
                    <button onClick={() => { if (confirm(`Remove ${s.first_name} ${s.last_name} from this pickup?`)) removeMut.mutate(Number(s.volunteer_id)); }}
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
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search drivers by name, phone, area…"
                 className="w-full rounded-[10px] border-[1.4px] border-line bg-paper px-3 py-2.5 text-[13.5px] outline-none focus:border-forest" />
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
                {current.map((s: any) => `${s.first_name} ${s.last_name}${s.unit_number != null ? ` #${s.unit_number}` : ''}`).join(', ')}
              </span>{' '}
              assigned. Adding <span className="font-bold">{pending.v.firstName} {pending.v.lastName}</span> will mean{' '}
              <span className="font-bold">{current.length + 1} drivers</span> on this pickup — one more than planned.
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
function SectionDivider({ label, tone }: { label: string; tone: 'sky' | 'amber' }) {
  const text = tone === 'sky' ? 'text-[#a3c8d9]' : 'text-[#e6c98a]';
  const line = tone === 'sky' ? 'bg-[#a3c8d9]/30' : 'bg-[#e6c98a]/30';
  return (
    <div className="mt-5 mb-2 px-3">
      <div className={cx('h-[1.5px] w-full mb-2', line)} />
      <div className={cx('font-display italic text-[13.5px] font-semibold tracking-[.04em]', text)}>{label}</div>
    </div>
  );
}

const TAB_TITLE: Record<string, string> = {
  calendar: 'Calendar',
  live: 'Live Board', pickups: 'Pickups', volunteers: 'Volunteers',
  suppliers: 'Suppliers', reports: 'Reports',
  'chat-stores': 'Chat with Stores', 'chat-volunteers': 'Chat with Drivers',
  steady: 'Steady Pickups', shifts: 'Dispatching Shifts', 'center-help': 'Center Help', signin: 'Office Sign-In', settings: 'Settings',
  neighborhoods: 'Neighborhoods', coverage: 'Coverage',
  'change-password': 'Change password',
  recruiting: 'Recruiting',
  'sms-combo': 'SMS Composer & Broadcast',
  'dispatchers-combo': 'Dispatchers',
  prospects: 'Prospects',
};
const TAB_SUB: Record<string, string> = {
  calendar: 'Unified schedule — pickups, dispatcher shifts, center help',
  live: 'Next 6 hours · ' + new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }),
  pickups: 'All upcoming pickups', volunteers: 'Roster & availability',
  suppliers: 'Donors & status', reports: 'Hours, miles, weight',
  'chat-stores': 'In-app direct messages',
  'chat-volunteers': 'In-app direct messages',
  steady: 'Recurring pickup templates',
  shifts: 'Dispatcher & driver shifts — 5-min-before reminders auto-fire',
  signin: 'Drop-off sign-in sheet',
  neighborhoods: 'Wesley Hills, Pomona, Monsey Center, New Square, …',
  coverage: 'Volunteer coverage per neighborhood',
  'change-password': 'Update your own portal login',
  recruiting: 'Calls, texts & follow-ups with volunteers and suppliers',
  'sms-combo': 'Compose · threads · groups · broadcast — all SMS in one place',
  'dispatchers-combo': 'Staff & roles · SMS access',
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
    const m = L.map(ref.current, { zoomControl: true, zoomDelta: 0.5, attributionControl: false }).setView([41.115, -74.069], 12);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { maxZoom: 19 }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    mapRef.current = m;
    return () => { m.remove(); mapRef.current = null; layer.current = null; };
  }, []);

  useEffect(() => {
    const m = mapRef.current; const lyr = layer.current;
    if (!m || !lyr) return;
    lyr.clearLayers();

    // Suppliers (donor sites) — small square markers, colored per supplier so
    // a single donor has one color identity across Places list, map, and feed.
    suppliers.slice(0, 30).forEach((s: any) => {
      const color = supplierHue(s.name ?? String(s.id));
      const initial = String(s.name ?? 'S').trim().slice(0, 1).toUpperCase();
      const lat = 41.115 + (Math.random() - 0.5) * 0.06;
      const lng = -74.069 + (Math.random() - 0.5) * 0.10;
      const html = `<div style="width:22px;height:22px;background:${color};border:2px solid #fff;border-radius:5px;display:grid;place-items:center;color:#fff;font-weight:800;font-size:11px;box-shadow:0 3px 6px rgba(0,0,0,.25)">${initial}</div>`;
      L.marker([lat, lng], { icon: L.divIcon({ html, className: '', iconSize: [22, 22], iconAnchor: [11, 11] }) }).addTo(lyr);
    });

    // Pickups — teardrop pins with a "P" label, color = supplier color so
    // each pickup carries its donor's color identity. Status shows on a
    // small indicator ring inside the pin.
    rows.forEach((p) => {
      const color = p.suppliers ? supplierHue(p.suppliers) : '#2C5A3B';
      const html = `<div style="position:relative;width:30px;height:36px;filter:drop-shadow(0 4px 4px rgba(0,0,0,.28))">
        <svg width="30" height="36" viewBox="0 0 24 28" fill="${color}"><path d="M12 2C7.5 2 4 5.5 4 10c0 6 8 16 8 16s8-10 8-16c0-4.5-3.5-8-8-8z"/></svg>
        <span style="position:absolute;inset:2px 0 0 0;display:grid;place-items:center;color:#fff;font-weight:800;font-size:11px">P</span>
      </div>`;
      const lat = 41.115 + (Math.random() - 0.5) * 0.06;
      const lng = -74.069 + (Math.random() - 0.5) * 0.10;
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

function CoordRow({ p, onAssign, onOpen, onEdit }: { p: PiRow; onAssign: () => void; onOpen: () => void; onEdit?: () => void }) {
  const time = fmtTime(p.scheduled_time?.slice(0, 5) ?? '');
  const [showDismiss, setShowDismiss] = useState(false);
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
  const _waitStartMs = _isSupplierPosted && (p as any).created_at
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
  const isTrulyLate = !_resolved && !isFullyCovered && !(p as any).posted_via_supplier
    && _mustByMs != null && _nowMs > _mustByMs
    && _hasPrimary && !['picked_up', 'delivered'].includes(_statusLower);
  // Looking for a driver = unassigned + past the scheduled start.
  const isLookingForDriver = !_resolved && !isFullyCovered && !(p as any).posted_via_supplier
    && _nowMs > _startMs;
  // (isTrulyLate + isLookingForDriver together replace the old single "isOverdue"
  // flag — each drives its own visual treatment below.)
  const filled = (p.signups ?? []).map((s) => ({
    initials: (s.first_name?.[0] ?? '') + (s.last_name?.[0] ?? ''),
    full: `${s.first_name} ${s.last_name}${s.unit_number != null ? ` #${s.unit_number}` : ''}`,
  }));
  // §1: the row's status pill uses the office-facing label ("Volunteer Needed"
  // etc.) instead of the raw DB status ("scheduled" / "confirmed" / ...).
  const office = officeStatusOf(p);
  const spill = OFFICE_SPILL[office];
  // Left stripe = supplier color (same as map marker + Places list dot) so
  // every visual surface uses one identity per donor.
  const stripeColor = p.suppliers ? supplierHue(p.suppliers) : null;
  // Prefer donor identity for the headline; then the steady_pickups template
  // name (e.g. "Bites cafe" for instances materialized from a template that
  // has no supplier attached yet); then contact_name / pickup_address so
  // one-time pickups don't read as anonymous "Pickup".
  const primaryLabel = p.suppliers || p.steady_name || p.contact_name || p.pickup_address || 'One-time pickup';
  // Secondary line: food description, then address/notes. Address is worth
  // its own line when different from the primary label, so the driver knows
  // WHERE to go at a glance.
  const foodLine = p.food_description || null;
  const contactLine = !p.suppliers && p.contact_phone && p.contact_name !== primaryLabel
    ? `${p.contact_name ? p.contact_name + ' · ' : ''}${p.contact_phone}`
    : null;
  // Pickup window — combine scheduled_time and must_pickup_by into a
  // human-readable range, e.g. "2:00 PM - 4:00 PM".
  const windowLine = (() => {
    if (!p.must_pickup_by) return null;
    const start = fmtTime(p.scheduled_time?.slice(0, 5) ?? '');
    try {
      const end = new Date(p.must_pickup_by).toLocaleTimeString('en-US',
        { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/New_York' });
      return start && end ? `${start} - ${end}` : null;
    } catch { return null; }
  })();
  // Address for the card: supplier address + city, or the one-time pickup
  // address. Always shown when known, per the PDF's "always display full
  // address" rule.
  const displayAddress = (() => {
    if (p.supplier_address) {
      return p.supplier_city ? `${p.supplier_address}, ${p.supplier_city}` : p.supplier_address;
    }
    return p.pickup_address || null;
  })();
  const showAddress = displayAddress && displayAddress !== primaryLabel;
  return (
    <div onClick={onOpen} className={cx(
        'haptic cursor-pointer bg-paper rounded-[14px] overflow-hidden hover:-translate-y-0.5 hover:shadow-card transition',
        isTrulyLate
          ? 'border-2 border-clay ring-2 ring-clay/40'      // Needs attention (assigned driver + late)
          : isLookingForDriver
          ? 'border border-amber/50'                        // Looking for a driver — calm/warm
          : office === 'need'
          ? 'border border-amber/50'                        // Volunteer Needed — calm/warm
          : 'border border-line')}>
      <div className="flex">
        {stripeColor && <div className="w-1.5 shrink-0" style={{ background: stripeColor }} />}
        <div className="flex-1 p-3.5">
          <div className="flex justify-between items-start gap-2">
            <div className="flex items-center gap-2.5 flex-1 min-w-0">
              {p.supplier_logo_url ? (
                <img src={p.supplier_logo_url} alt="" className="h-10 w-10 rounded-[8px] object-cover border border-line shrink-0 bg-paper" />
              ) : stripeColor ? (
                <span className="grid h-10 w-10 place-items-center rounded-[8px] shrink-0 text-paper font-display font-bold text-[15px]" style={{ background: stripeColor }}>
                  {primaryLabel.charAt(0).toUpperCase()}
                </span>
              ) : (
                <span className="grid h-10 w-10 place-items-center rounded-[8px] shrink-0 bg-cream text-muted border border-line">
                  <Store size={18} strokeWidth={1.6} />
                </span>
              )}
              <span className="font-display font-bold text-[16px] text-ink truncate flex-1 min-w-0 leading-tight">
                {primaryLabel}
              </span>
              {isTrulyLate ? (
                <span className="shrink-0 inline-flex items-center gap-1 bg-clay text-paper font-bold text-[10.5px] uppercase tracking-wide px-2 py-0.5 rounded-full">
                  Needs attention · {_waitLabel}
                </span>
              ) : isLookingForDriver ? (
                <span className="shrink-0 inline-flex items-center gap-1 bg-amber/15 text-forest-deep border border-amber/50 font-semibold text-[10.5px] px-2 py-0.5 rounded-full">
                  Looking for a driver · {_waitLabel}
                </span>
              ) : null}
            </div>
            <div className="text-right shrink-0">
              {p.posted_via_supplier ? (
                <>
                  <div className="text-[9.5px] uppercase tracking-[.05em] text-muted font-bold">Posted</div>
                  <div className="font-display font-bold text-[15px] text-forest">{time}</div>
                </>
              ) : (
                <>
                  <div className="font-display font-bold text-[15px] text-forest">{time}</div>
                  {windowLine && <div className="text-[10.5px] text-muted -mt-0.5">to {windowLine.split(' - ')[1]}</div>}
                </>
              )}
            </div>
          </div>
          {foodLine && <div className="text-[12px] text-ink mt-1.5 line-clamp-1 font-semibold">{foodLine}{p.estimated_quantity ? ` · ${p.estimated_quantity}` : ''}</div>}
          {showAddress && <div className="text-[11.5px] text-muted mt-0.5 line-clamp-1">📍 {displayAddress}</div>}
          {contactLine && <div className="text-[11.5px] text-muted mt-0.5 line-clamp-1">☎ {contactLine}</div>}
          {!foodLine && !showAddress && !contactLine && p.notes && (
            <div className="text-[11.5px] text-muted mt-1 line-clamp-2">{p.notes}</div>
          )}

          {/* Driver line — always rendered. Pill is forest when assigned, clay
              when the slot is still open so the coordinator can see who needs
              a driver at a glance. */}
          <div className="mt-2 flex items-center gap-2">
            {filled.length > 0 ? (
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-sage border border-sage-line">
                <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: driverHue(filled[0]!.full) }} />
                <span className="font-bold text-[12px] text-forest">{filled.map(f => f.full).join(', ')}</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-clay-soft border border-clay/30">
                <span className="inline-block w-2 h-2 rounded-full bg-clay" />
                <span className="font-bold text-[12px] text-clay">No driver assigned</span>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between mt-3">
            <div className="flex items-center">
              <SlotAvatars filled={filled} capacity={p.slots_capacity || 1} size={22} />
              <SlotLabel filled={filled.length} capacity={p.slots_capacity || 1} />
            </div>
            <div className="flex items-center gap-2">
              <span className={cx('text-[10.5px] font-bold py-1 px-2.5 rounded-full', spill.bg, spill.fg)}>{spill.label}</span>
              {/* Hide the "+ Add driver" button when the pickup is already
                  fully covered OR when it's completed / delivered / cancelled.
                  Only show when the slot count is still short. Assign-driver
                  (empty state) always shows. */}
              {(filled.length === 0 || (!isFullyCovered && !_resolved)) && (
                <button onClick={(e) => { e.stopPropagation(); onAssign(); }}
                        className={cx('text-[11.5px] font-bold border px-2.5 py-1 rounded-[9px] haptic',
                                      filled.length === 0
                                        ? 'text-forest border-sage-line bg-sage'
                                        : 'text-forest border-sage-line bg-sage')}>
                  {filled.length === 0 ? 'Assign driver' : '+ Add driver'}
                </button>
              )}
              {onEdit && (
                <button onClick={(e) => { e.stopPropagation(); onEdit(); }}
                        className="text-[11.5px] font-bold border border-line px-2.5 py-1 rounded-[9px] haptic text-ink hover:bg-cream"
                        title="Edit, reschedule, reassign">
                  Edit
                </button>
              )}
              {/* Client Aug 12: Dismiss on still-open, unassigned Needs-a-Driver
                  rows — closes broadcast codes + cancels with a reason we can see
                  later in history. */}
              {filled.length === 0 && !_resolved && (
                <button onClick={(e) => { e.stopPropagation(); setShowDismiss(true); }}
                        className="text-[11.5px] font-bold border border-clay/40 px-2.5 py-1 rounded-[9px] haptic text-clay hover:bg-clay/10"
                        title="Close this pickup with a reason">
                  Dismiss
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
      {showDismiss && (
        <DismissPickupModal p={p} onClose={() => setShowDismiss(false)} />
      )}
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
    <div onClick={onClose} className="fixed inset-0 z-[2100] bg-ink/50 flex items-start justify-center pt-16 px-4">
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
  const head =
    tab === 'pickups'         ? 'Active pickups' :
    tab === 'volunteers'      ? 'Drivers' :
    tab === 'suppliers'       ? 'Donors' :
    tab === 'chat-stores'     ? 'Stores' :
    tab === 'chat-volunteers' ? 'Drivers' :
    'Places';

  return (
    <>
      <div className="text-[10px] font-extrabold uppercase tracking-[.08em] text-[#7fa078] mt-5 mb-2 px-3">{head}</div>

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
    </>
  );
}

function PickupSidebar({ pickups, loading }: { pickups: PiRow[]; loading: boolean }) {
  if (loading) return <div className="text-[11.5px] text-[#7fa078] px-3">Loading…</div>;
  if (pickups.length === 0) return <div className="text-[11.5px] text-[#7fa078] px-3">No active pickups</div>;
  return <>{pickups.slice(0, 14).map((p) => {
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
      <div className="rounded-[14px] border border-sage-line bg-sage/40 p-3 text-[12px] text-forest font-bold mb-3">
        In-app only — messages appear in the recipient's app inbox. No SMS, phone, or email.
      </div>
      {rows.map((r: any) => {
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
                      ? <img src={r.logo_url} alt="" className="h-9 w-9 rounded-full object-cover border border-line bg-paper" />
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
type OfficeStatus = 'need' | 'assigned' | 'onway' | 'complete' | 'missed';
function officeStatusOf(p: PiRow): OfficeStatus {
  const s = String(p.status || '').toLowerCase();
  // client Aug 12 — 'missed' gets its own muted-red chip so History rows
  // read at a glance. It still counts as closed everywhere else via
  // DONE_STATUSES.
  if (s === 'missed')                         return 'missed';
  if (s === 'completed' || s === 'delivered') return 'complete';
  if (s === 'en_route' || s === 'picked_up')  return 'onway';
  return (p.signups?.length ?? 0) > 0 ? 'assigned' : 'need';
}
const OFFICE_SPILL: Record<OfficeStatus, { bg: string; fg: string; label: string }> = {
  need:     { bg: 'bg-clay-soft',  fg: 'text-clay',       label: 'Volunteer Needed' },
  assigned: { bg: 'bg-sky-soft',   fg: 'text-sky-deep',   label: 'Assigned' },
  onway:    { bg: 'bg-amber-soft', fg: 'text-[#9a7415]',  label: 'On the Way' },
  complete: { bg: 'bg-sage',       fg: 'text-forest',     label: 'Completed' },
  missed:   { bg: 'bg-clay/10',    fg: 'text-clay',       label: 'Missed' },
};

/**
 * batch abc820 · Pickups-tab sub-tab strip. Always visible so tabs stay
 * clickable even when the current bucket is empty. Each tab shows its
 * count as a small badge; per-tab empty state is a quiet card rendered
 * by the parent (see PICKUPS_SUB_EMPTY).
 */
type PickupsSubTab = 'attention' | 'upcoming' | 'completed' | 'history';
const PICKUPS_SUB_EMPTY: Record<PickupsSubTab, string> = {
  attention: 'No pickups need attention right now.',
  upcoming:  'No upcoming pickups scheduled.',
  completed: 'No completed pickups to show yet.',
  history:   'No pickups in the last 60 days.',
};
function PickupsSubTabStrip({
  current, onChange, counts,
}: {
  current: PickupsSubTab;
  onChange: (t: PickupsSubTab) => void;
  counts: { attention: number; upcoming: number; completed: number; history: number };
}) {
  const tabs: { key: PickupsSubTab; label: string; count: number; accent?: boolean }[] = [
    { key: 'attention', label: 'Needs attention', count: counts.attention, accent: counts.attention > 0 },
    { key: 'upcoming',  label: 'Upcoming',        count: counts.upcoming },
    { key: 'completed', label: 'Completed',       count: counts.completed },
    { key: 'history',   label: 'History',         count: counts.history },
  ];
  return (
    <div className="mb-4 flex items-center gap-1.5 border-b border-line">
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
            <span>{t.label}</span>
            <span className={cx('text-[10.5px] font-extrabold px-1.5 rounded-full',
                                on
                                  ? t.key === 'attention' ? 'bg-clay/10 text-clay' : 'bg-forest/10 text-forest'
                                  : t.accent ? 'bg-clay/10 text-clay' : 'bg-line/70 text-muted')}>
              {t.count}
            </span>
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
    const closed = status === 'completed' || status === 'delivered' || status === 'cancelled';
    const hasDriver = (it.signups?.length ?? 0) > 0;
    if (!closed && !hasDriver && !it.posted_via_supplier) {
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
    const d = new Date(it.scheduled_date.slice(0, 10) + 'T00:00:00');
    let label: string;
    if (sameDay(d, today)) label = 'Today · ' + d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    else if (sameDay(d, tomorrow)) label = 'Tomorrow · ' + d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    else label = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    const key = d.toISOString().slice(0, 10);
    (groups.get(key) ?? groups.set(key, { key, label, items: [] }).get(key)!).items.push(it);
  }
  return Array.from(groups.values());
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
type SmsSubTab = 'compose' | 'threads' | 'groups' | 'broadcast';
function SmsComboPanel() {
  const [sub, setSub] = useState<SmsSubTab>('compose');
  const tabs: { key: SmsSubTab; label: string }[] = [
    { key: 'compose',   label: 'Compose' },
    { key: 'threads',   label: 'Threads' },
    { key: 'groups',    label: 'Groups' },
    { key: 'broadcast', label: 'Broadcast (push)' },
  ];
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
      <div>
        {sub === 'compose'   && <SmsComposerPanel />}
        {sub === 'threads'   && <SmsThreadsPanel />}
        {sub === 'groups'    && <SmsGroupsPanel />}
        {sub === 'broadcast' && <BroadcastPanel />}
      </div>
    </div>
  );
}

/**
 * DispatchersComboPanel — one nav entry ("Dispatchers") with two tabs:
 *   Staff & roles  →  DispatchersPanel (roster + role + disable)
 *   SMS access     →  SmsDispatchersPanel (*NN reply-access list)
 */
type DispSubTab = 'staff' | 'sms';
function DispatchersComboPanel() {
  const [sub, setSub] = useState<DispSubTab>('staff');
  const tabs: { key: DispSubTab; label: string }[] = [
    { key: 'staff', label: 'Staff & roles' },
    { key: 'sms',   label: 'SMS access (*NN)' },
  ];
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
      <div>
        {sub === 'staff' && <DispatchersPanel />}
        {sub === 'sms'   && <SmsDispatchersPanel />}
      </div>
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
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-ink/40 p-4" onClick={onClose}>
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
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
                   className="mt-1 w-full rounded-[10px] border border-line bg-cream px-3 py-2 text-[13px]" />
          </label>
          <label className="block">
            <span className="text-[11px] font-extrabold uppercase tracking-[.05em] text-muted">To</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
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
