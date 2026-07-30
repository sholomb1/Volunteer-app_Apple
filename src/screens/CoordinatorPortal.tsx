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
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import L from 'leaflet';
import { useEffect, useRef } from 'react';
import { LayoutGrid, Calendar, Users, Store, BarChart3, LogOut, MessageSquare, Repeat, ClipboardList, Settings, MapPin, ShieldCheck, X } from 'lucide-react';
import { api, broadcast, canWrite, dm, getUser, location as locationApi, type SignupRow } from '../api';
import { SlotAvatars, SlotLabel, cx } from '../design';
import { ChatThread } from '../chat-thread';
import { SuppliersPanel, VolunteersPanel, SteadyPickupsPanel, SignInPanel, SettingsPanel, NeighborhoodsPanel, CoveragePanel, QuickPickupModal, ChangePasswordPanel, BroadcastPanel, SmsInboxPanel } from '../portal-sections';
import { RecruitingPanel } from '../crm-sections';
import { ReportsPanel } from '../reports-panel';
import { PortalSearchBar } from '../portal-search';
import { Plus, KeyRound, UserPlus2, Megaphone } from 'lucide-react';

type TabKey = 'live' | 'pickups' | 'volunteers' | 'suppliers' | 'reports' | 'chat-stores' | 'chat-volunteers' | 'sms-inbox' | 'steady' | 'signin' | 'settings' | 'neighborhoods' | 'coverage' | 'change-password' | 'recruiting' | 'broadcast';

const NAV_ITEMS: { key: TabKey; label: string; icon: any; section?: 'top' | 'chat' | 'admin' }[] = [
  { key: 'live',           label: 'Live Board',     icon: LayoutGrid,    section: 'top' },
  { key: 'pickups',        label: 'Pickups',        icon: Calendar,      section: 'top' },
  { key: 'volunteers',     label: 'Volunteers',     icon: Users,         section: 'top' },
  { key: 'suppliers',      label: 'Suppliers',      icon: Store,         section: 'top' },
  { key: 'steady',         label: 'Steady Pickups', icon: Repeat,        section: 'top' },
  { key: 'coverage',       label: 'Coverage',       icon: ShieldCheck,   section: 'top' },
  { key: 'recruiting',     label: 'Recruiting',     icon: UserPlus2,     section: 'top' },
  { key: 'reports',        label: 'Reports',        icon: BarChart3,     section: 'top' },
  { key: 'chat-stores',    label: 'Chat: Stores',   icon: MessageSquare, section: 'chat' },
  { key: 'chat-volunteers',label: 'Chat: Drivers',  icon: MessageSquare, section: 'chat' },
  { key: 'sms-inbox',      label: 'SMS Inbox',      icon: MessageSquare, section: 'chat' },
  { key: 'signin',         label: 'Office Sign-In', icon: ClipboardList, section: 'admin' },
  { key: 'neighborhoods',  label: 'Neighborhoods',  icon: MapPin,        section: 'admin' },
  { key: 'broadcast',      label: 'Broadcast',      icon: Megaphone,     section: 'admin' },
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
  must_pickup_by?: string | null;
  notes: string | null; food_description: string | null; slots_capacity: number;
  signups?: SignupRow[];
};
type Place = { id: number; name: string; status: string };

export function CoordinatorPortal() {
  const user = getUser();
  // Read-only staff (viewer / read_only) can browse the portal but can't
  // trigger writes. Hide destructive/creation UI when write isn't allowed.
  const writeOk = canWrite(user?.role);
  const nav  = useNavigate();
  const qc   = useQueryClient();
  const [tab, setTab] = useState<TabKey>('live');
  const [pickerFor, setPickerFor] = useState<PiRow | null>(null);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [editingPickup, setEditingPickup] = useState<PiRow | null>(null);
  const [smsPickup, setSmsPickup] = useState<PiRow | null>(null);
  // When a search result is picked, we jump to the matching tab AND stash the id
  // so the tab's panel can open that entity's edit modal on mount.
  const [openPersonId, setOpenPersonId] = useState<number | null>(null);

  // Today + tomorrow's pickups for the live board
  const today    = new Date().toISOString().slice(0, 10);
  const inAWeek  = new Date(Date.now() + 7 * 86400e3).toISOString().slice(0, 10);
  const pickups = useQuery({
    queryKey: ['admin-pickups', today],
    queryFn:  () => api<{ data: PiRow[] }>(`/api/pickup-instances?from=${today}&to=${inAWeek}`),
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

  // Right-pane feed: filter to the next 6 hours so the coordinator sees
  // what's actually in flight, not the whole week. Live Board view applies
  // the 6-hour window; the Pickups tab still shows the next 7 days for
  // longer-horizon planning.
  const sixHoursOut = new Date(Date.now() + 6 * 3600e3);
  const allPickups = pickups.data?.data ?? [];
  const livePickups = allPickups.filter((p) => {
    const when = new Date(p.scheduled_date.slice(0,10) + 'T' + (p.scheduled_time || '00:00:00'));
    return when >= new Date(Date.now() - 30 * 60_000) && when <= sixHoursOut;
  });
  const feedPickups = tab === 'live' ? livePickups : allPickups;

  const groups = useMemo(() => groupByDate(feedPickups), [feedPickups]);

  // Operational counters for the Live Board tiles.
  const nowMs = Date.now();
  const overdueCount = allPickups.filter((p) => {
    const status = String(p.status || '').toLowerCase();
    if (['completed', 'delivered', 'cancelled'].includes(status)) return false;
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

  return (
    <div className="min-h-screen bg-cream flex">
      {/* LEFT NAV */}
      <aside className="w-[280px] bg-forest-deep text-[#cfe0c8] flex flex-col shrink-0">
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
              <div className="text-[12.5px] text-muted">{TAB_SUB[tab]} · {pickups.data?.data.length ?? 0} pickups loaded</div>
            </div>
            {tab === 'live' && (overdueCount > 0 || unassignedThisWeek > 0) && (
              <div className="flex items-center gap-2">
                {overdueCount > 0 && (
                  <button onClick={() => setTab('pickups')}
                          title="Filter to unassigned pickups"
                          className="haptic flex items-baseline gap-1.5 rounded-[10px] bg-clay-soft border border-clay/30 px-2.5 py-1">
                    <span className="font-display font-bold text-[15px] text-clay leading-none">{overdueCount}</span>
                    <span className="text-[10.5px] font-extrabold uppercase tracking-[.06em] text-clay">Overdue</span>
                  </button>
                )}
                {unassignedThisWeek > 0 && (
                  <button onClick={() => setTab('pickups')}
                          className="haptic flex items-baseline gap-1.5 rounded-[10px] bg-amber-soft border border-amber/40 px-2.5 py-1">
                    <span className="font-display font-bold text-[15px] text-[#9a7415] leading-none">{unassignedThisWeek}</span>
                    <span className="text-[10.5px] font-extrabold uppercase tracking-[.06em] text-[#9a7415]">Unassigned · 7d</span>
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            <PortalSearchBar onPick={(t, id) => { setTab(t as TabKey); setOpenPersonId(id ?? null); }} />
            {writeOk && (
              <button onClick={() => setShowQuickAdd(true)}
                      className="haptic flex items-center gap-1.5 text-[12.5px] font-bold bg-forest text-paper rounded-[10px] px-3 py-2 shadow-ctag hover:brightness-110">
                <Plus size={14} /> New pickup
              </button>
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
                onOpen={(id) => nav(`/pickup/mine/${id}`)} />
            </div>
          )}

          <div className={cx('overflow-y-auto px-5 py-5 bg-cream/50',
                             showMap ? 'w-[480px] shrink-0' : 'flex-1 min-w-0')}>
            {tab === 'suppliers' ? (
              <SuppliersPanel rows={suppliers.data?.data ?? []} refetch={() => suppliers.refetch()}
                              openId={openPersonId} onOpenConsumed={() => setOpenPersonId(null)} />
            ) : tab === 'volunteers' ? (
              <VolunteersPanel rows={volunteers.data?.data ?? []} refetch={() => volunteers.refetch()}
                               openId={openPersonId} onOpenConsumed={() => setOpenPersonId(null)} />
            ) : tab === 'steady' ? (
              <SteadyPickupsPanel />
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
            ) : tab === 'sms-inbox' ? (
              <SmsInboxPanel />
            ) : tab === 'broadcast' ? (
              <BroadcastPanel />
            ) : pickups.isLoading ? (
              <div className="text-[13px] text-muted">Loading…</div>
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
                    ? 'No pickups in the next 6 hours. Board will update as soon as anything is posted.'
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
                    Showing pickups in the next 6 hours · {livePickups.length} of {allPickups.length}
                  </div>
                )}
                {groups.map((g) => (
                  <section key={g.key} className={cx('mb-5', (g as any).overdue && 'p-3 rounded-[14px] bg-clay-soft/50 border border-clay/30')}>
                    <div className={cx('text-[11px] font-extrabold uppercase tracking-[.05em] mb-2.5',
                                        (g as any).overdue ? 'text-clay' : 'text-muted')}>
                      {(g as any).overdue && '⚠️ '}{g.label}
                    </div>
                    <div className="space-y-2.5">
                      {g.items.map((p) => (
                        <CoordRow key={p.id} p={p}
                                  onAssign={writeOk ? () => setPickerFor(p) : () => {}}
                                  onOpen={() => nav(`/pickup/mine/${p.id}`)}
                                  onEdit={writeOk ? () => setEditingPickup(p) : undefined}
                                  onSms={writeOk ? () => setSmsPickup(p) : undefined} />
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

      {smsPickup && (
        <PickupSmsModal
          pickup={smsPickup}
          volunteers={volunteers.data?.data ?? []}
          onClose={() => setSmsPickup(null)} />
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
function PickupSmsModal({ pickup, volunteers, onClose }: {
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
                  <div className="font-bold text-[13.5px] truncate">{v.firstName} {v.lastName}</div>
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

function DriverPickerModal({ pickup, volunteers, onClose, onChanged }: {
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
                      <div className="font-bold text-[13px] truncate">{s.first_name} {s.last_name}</div>
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
                  <div className="font-bold text-[13.5px] truncate">{v.firstName} {v.lastName}</div>
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
                {current.map((s: any) => `${s.first_name} ${s.last_name}`).join(', ')}
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
  live: 'Live Board', pickups: 'Pickups', volunteers: 'Volunteers',
  suppliers: 'Suppliers', reports: 'Reports',
  'chat-stores': 'Chat with Stores', 'chat-volunteers': 'Chat with Drivers',
  steady: 'Steady Pickups', signin: 'Office Sign-In', settings: 'Settings',
  neighborhoods: 'Neighborhoods', coverage: 'Coverage',
  'change-password': 'Change password',
  recruiting: 'Recruiting',
  broadcast: 'Broadcast',
};
const TAB_SUB: Record<string, string> = {
  live: 'Next 6 hours · ' + new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }),
  pickups: 'All upcoming pickups', volunteers: 'Roster & availability',
  suppliers: 'Donors & status', reports: 'Hours, miles, weight',
  'chat-stores': 'In-app direct messages',
  'chat-volunteers': 'In-app direct messages',
  steady: 'Recurring pickup templates',
  signin: 'Drop-off sign-in sheet',
  neighborhoods: 'Wesley Hills, Pomona, Monsey Center, New Square, …',
  coverage: 'Volunteer coverage per neighborhood',
  'change-password': 'Update your own portal login',
  recruiting: 'Calls, texts & follow-ups with volunteers and suppliers',
  settings: 'Admin · option lookups',
  broadcast: 'Send push notifications · manage saved types',
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
        <div className="flex items-center gap-2">
          <span className="inline-grid place-items-center w-[18px] h-[18px] text-paper font-extrabold text-[10px] rounded-[4px]" style={{ background: '#3E6F8E' }}>S</span>
          <span className="text-ink font-semibold">Supplier</span>
        </div>
      </div>
    </div>
  );
}

function CoordRow({ p, onAssign, onOpen, onEdit, onSms }: { p: PiRow; onAssign: () => void; onOpen: () => void; onEdit?: () => void; onSms?: () => void }) {
  const time = fmtTime(p.scheduled_time?.slice(0, 5) ?? '');
  const filled = (p.signups ?? []).map((s) => ({ initials: (s.first_name?.[0] ?? '') + (s.last_name?.[0] ?? ''), full: `${s.first_name} ${s.last_name}` }));
  const spill = SPILL[p.status] ?? { bg: 'bg-line', fg: 'text-muted', label: p.status };
  // Left stripe = supplier color (same as map marker + Places list dot) so
  // every visual surface uses one identity per donor.
  const stripeColor = p.suppliers ? supplierHue(p.suppliers) : null;
  // Prefer donor identity for the headline; fall back to contact_name or
  // pickup_address so one-time pickups don't read as anonymous "Pickup".
  const primaryLabel = p.suppliers || p.contact_name || p.pickup_address || 'One-time pickup';
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
        { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' });
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
    <div onClick={onOpen} className="haptic cursor-pointer border border-line bg-paper rounded-[14px] overflow-hidden hover:-translate-y-0.5 hover:shadow-card transition">
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
                <span className="grid h-10 w-10 place-items-center rounded-[8px] shrink-0 bg-clay-soft text-clay font-display font-bold text-[15px]">?</span>
              )}
              <span className="font-display font-bold text-[16px] text-ink truncate flex-1 min-w-0 leading-tight">
                {primaryLabel}
              </span>
            </div>
            <div className="text-right shrink-0">
              <div className="font-display font-bold text-[15px] text-forest">{windowLine ? time : time}</div>
              {windowLine && <div className="text-[10.5px] text-muted -mt-0.5">to {windowLine.split(' - ')[1]}</div>}
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
              <button onClick={(e) => { e.stopPropagation(); onAssign(); }}
                      className={cx('text-[11.5px] font-bold border px-2.5 py-1 rounded-[9px] haptic',
                                    filled.length === 0
                                      ? 'text-forest border-sage-line bg-sage'
                                      : 'text-forest border-sage-line bg-sage')}>
                {filled.length === 0 ? 'Assign driver' : '+ Add driver'}
              </button>
              {onSms && (
                <button onClick={(e) => { e.stopPropagation(); onSms(); }}
                        className="text-[11.5px] font-bold border border-sky/40 bg-sky-soft/60 text-sky-deep px-2.5 py-1 rounded-[9px] haptic hover:bg-sky-soft"
                        title="Text pickup details to selected drivers">
                  📨 SMS
                </button>
              )}
              {onEdit && (
                <button onClick={(e) => { e.stopPropagation(); onEdit(); }}
                        className="text-[11.5px] font-bold border border-line px-2.5 py-1 rounded-[9px] haptic text-ink hover:bg-cream"
                        title="Edit, reschedule, reassign">
                  Edit
                </button>
              )}
            </div>
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
      <span className="truncate flex-1 text-paper">{v.firstName} {v.lastName}</span>
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

const SPILL: Record<string, { bg: string; fg: string; label: string }> = {
  pending:     { bg: 'bg-amber-soft', fg: 'text-[#9a7415]', label: 'Just posted' },
  scheduled:   { bg: 'bg-sky-soft',   fg: 'text-sky',       label: 'Scheduled' },
  confirmed:   { bg: 'bg-sage',       fg: 'text-forest',    label: 'Claimed' },
  in_progress: { bg: 'bg-clay-soft',  fg: 'text-clay',      label: 'En route' },
  en_route:    { bg: 'bg-clay-soft',  fg: 'text-clay',      label: 'En route' },
  picked_up:   { bg: 'bg-clay-soft',  fg: 'text-clay',      label: 'Picked up' },
  delivered:   { bg: 'bg-sage',       fg: 'text-forest',    label: 'Delivered' },
  completed:   { bg: 'bg-sage',       fg: 'text-forest',    label: 'Completed' },
  cancelled:   { bg: 'bg-line',       fg: 'text-muted',     label: 'Cancelled' },
  missed:      { bg: 'bg-clay-soft',  fg: 'text-clay',      label: 'Missed' },
};

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
    if (!closed) {
      const startMs = new Date(it.scheduled_date.slice(0, 10) + 'T' +
        (it.scheduled_time || '00:00:00')).getTime();
      const windowEnd = it.must_pickup_by ? new Date(it.must_pickup_by).getTime() : startMs + 60 * 60_000;
      if (windowEnd < now) { overdue.push(it); continue; }
    }
    dated.push(it);
  }
  const groups = new Map<string, { key: string; label: string; items: PiRow[]; overdue?: boolean }>();
  if (overdue.length) {
    groups.set('__overdue__', { key: '__overdue__', label: `Needs attention · ${overdue.length} overdue`, items: overdue, overdue: true });
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
