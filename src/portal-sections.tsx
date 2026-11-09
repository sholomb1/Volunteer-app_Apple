/**
 * Coordinator-portal sections: Suppliers add/edit, Volunteers add/edit,
 * Steady Pickups, Sign-In sheet, Settings. Each is a self-contained panel
 * the portal renders in the right pane based on the active tab.
 *
 * All endpoints already existed in the volunteer-portal API — these panels
 * are pure UI wrappers around them, themed to the rescue-app design.
 */
import { storeFillAddress, moveHighlight, enterPickIndex } from './store-autofill'; // Oct 16 client
import { streetKey, oneStoreAtAddress } from './store-by-address'; // Oct 30 client: no store + a saved store's address
import { uiConfirm } from './ui-dialogs';
import { usePersonRoles, rolesOf, RoleTags, RoleFilter, HelpsWithRow, hasRole, ROLE_TAGS, type RoleKey, type PersonRolesData } from './person-roles'; // Oct 29 client: roles
import { useFoodCheckSetting, FoodCheckBox, contactNoticePreview } from './food-check'; // Oct 13 client
import { useSteadyStoreReminder, SteadyStoreReminderBox } from './store-reminder'; // Nov 5 client: reminder to the store, per steady
import { SteadyOpenBox } from './steady-open'; // Nov 6 Yakov: usual driver off — open for others
import { useCandleSetting, useCandlePreview, PickupTimeChoice, steadyTimeText } from './candle-time'; // Oct 23 client: time from candle lighting
import { InviteStaffModal, AccessModal, ACCESS_SECTIONS, portalLoginStatus, SupplierAppAccessButton } from './staff-invite';
import { AppVersionsCard } from './app-versions-card'; // Oct 21 client: Settings -> Phone app versions
import { MessageTemplatesCard } from './message-templates-card';
import { StorePostFormCard } from './store-post-form-card'; // Oct 14 client
import { PrintLogCard } from './kiosk/print-log-card'; // Oct 31 client: label print log
import { CenterPunchPanel } from './center-punch-office'; // Nov 4 Yakov: center help punch in / out
import { openRingMeAt } from './office-phone'; // Nov 2 client: which phone rings for my Call buttons
import { TextButton } from './office-texts';
import { EmailButton } from './new-email'; // Nov 3 client
import { GoogleSignInSettingsCard } from './google-signin'; // Oct 31 client: Sign in with Google
import { AsanaSettingsPanel, AsanaPersonTab } from './asana-panel'; // Nov 3 client: Asana (volunteer coordinator)
import { OfficePhonePanel } from './office-phone-panel'; // Oct 20 client: ☎️ Office phone (Reliable PBX)
import { VoiceCallsPanel } from './voice-calls-panel'; // Oct 19 client: 📞 Phone calls (connect Twilio, settings, calls)
import { DriverOverview } from './profiles';
// Oct 11 client: store profile — Overview (At a glance, stats, drivers, schedule, texts) + Pickup history.
import { StoreProfileOverview, StorePickupHistory } from './store-profile';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, X, Pencil, Trash2, Check } from 'lucide-react';
import { adminCRUD, api, canWrite, canOfficeOnly, getUser, jewishCalendar, shifts as shiftsApi, volunteerGroups, testBroadcasts, waBridge, waThreads, whatsappAdmin, type HebcalBlock, type VolunteerGroup, type TestBroadcastRow, type WaThreadRow } from './api';
// Cached at module scope — role doesn't change during a session, and reading
// from every panel on every render churns for no reason.
// Oct 5 fix: evaluated on every render. It was a one-time constant computed
// before login, so every user (Site Admin too) looked read-only until a full reload.
function isReadOnly(): boolean { return !canWrite(getUser()?.role); }
// Oct 21 client (Yakov): office-only buttons (delete driver/store, steady schedules, templates, text groups) — hidden for dispatchers.
function isOfficeOnly(): boolean { return canOfficeOnly(getUser()?.role); }
import { fmtTime, fmtDateTimeEastern, fmtTimeEastern, fmtDay, nyToday } from './time-format';
import { smsReasonText, textedText } from './sms-reason';
import { Button, cx, SearchBar, DateInput, to12h } from './design';
import { DriverQueueHoursCard } from './texting-rules'; // Oct 14 client: driver queue window setting
import { EscalationSettingsCard } from './closeout'; // Oct 21 client: no-driver escalation settings
import { ContactRecruitingHistory, GiftsHistory } from './crm-sections';
import { AccountLoginSection } from './account-login-section';
import { NotificationsPanel } from './notifications-panel';
import { AdminUsersPanel } from './admin-users-panel';
import { AddressAutocomplete } from './address-autocomplete';
// Oct 11 client: type a store's name, pick it, address/phone/map spot fill in; Find missing locations.
import { PlaceNameInput, MissingLocationsModal, type PickedPlace } from './place-name-lookup';
import { TidyNamesModal } from './tidy-store-names'; // Oct 16 client: "Professional supplier names"
import { SleepingStoresModal } from './sleeping-stores'; // Oct 16 client (idea 5): 😴 Sleeping stores
import { FamilyPicker } from './family-picker';
import { DispatcherPicker, shortName, type PickPerson } from './dispatcher-picker'; // Nov 6 client
import { RunPickupForm, RunPlacesCard } from './runs'; // Oct 30 client: 🚚 Run to Lakewood / Fallsburg
import { isDispatcherLogin } from './api'; // Oct 22 client: dispatcher view
import { DriverMessagesTab } from './driver-messages-tab'; // Oct 22 client: dispatcher driver popup → Messages
import { useNightSend, ScheduledTexts, personalSched, refreshScheduled, OfficeScheduledRow, OfficeScheduledList } from './late-night'; // Oct 23 client: late-night prompt
// Oct 8 client: deliveries start at the office.
const OFFICE_ADDRESS = '3 Regina Road, Airmont, NY';
import { downloadNeededCalendar } from './emails-panel';
import { StorePhotoSettingCard } from './store-photo-setting'; // Oct 28 client
import { StockStoreNamesPanel } from './stock-link'; // Oct 30 client: Ordering portal store names
import { SendDriverNumbersButton } from './driver-numbers'; // Oct 25 client: "📨 Send driver numbers"
import { DriverAvatar, DriverPhotoRow, usePhotoMap } from './driver-photo'; // Oct 30 client: driver photos (office + dispatchers only)
import { MakeNameTagsButton } from './name-tags'; // Oct 30 client: 🪪 printable name tags
import { RecentCalls } from './on-call'; // Nov 3 client: the card's Notes tab shows the call log
import { COLOR_CARD } from './pickup-color'; // Oct 23 client: steady calendar uses the Live Board colors
import { tidyPlaceName } from './pickup-label';
import { dayAt, displayPhone, msgWhen, personFull, shortAddress, shortAddressOf, timeAt, whenAt, whenText } from './display'; // Oct 23 client: same style everywhere
import { Name, Phone as PhoneLink, StatusPill } from './display-ui';
import { cardNames, coverageColor, coverageLabel, dayHeader, driversShort, groupByDay, isDropOffRow, needCount, shortTime, startDay, stepDay, visibleDays, type CalColor } from './steady-calendar';
import { broadcast, kioskDevice, kioskSettings, portalReload, smsInbox, smsThreads, smsDispatchers, adminDispatchers, dispatchers, centerHelpPeople, upcomingSms, dropSchedule, nextThankYou, shabbosStatus, type NotificationType, type SmsThreadRow, type MsgChannel, type SmsDispatcher, type AdminDispatcher, type DispatcherRosterRow, type DispatcherCandidate, type CenterHelpPersonRow, type DispatcherShiftInfo, type UpcomingDropInfo, type LaterTodayGroup } from './api';
import { useNavigate } from 'react-router-dom';
import { readCoordNav, patchCoordNav } from './nav-state';
import { Send, Megaphone, Bell, MessageSquare, Phone } from 'lucide-react';
import { ChatThread } from './chat-thread';
import { VolunteerAlertsTab } from './volunteer-alerts-tab';
import { OfficeApplicationTab } from './office-driver-app'; // Oct 14 client: driver's application, editable by the office
import { ChangeHistoryTab } from './change-history'; // Oct 16 client: who changed what, from where
import { ShiftsWeekCalendar, ShiftsViewToggle, readShiftsView, type ShiftsView } from './shifts-calendar'; // Oct 13 client: shifts week calendar
import { ShiftsOfficeTools, askCancelShift, cancelShift } from './shifts-tools';
import { CenterHelpSchedule } from './center-help-schedule'; // Oct 16 client: Center Help calendar + Weekly template, same as the dispatcher // Oct 14 client: Weekly template + Clean up… + series cancel choice
import { SubmittedByRow, type SubmittedByState, parseSubmittedBy, submittedByValue, submittedByError, submittedByLabel, loadLastSubmittedBy, saveLastSubmittedBy } from './submitted-by'; // Oct 12 client
import { ExtraContactsEditor, readExtraContacts, extraContactsPayload, type ExtraContact } from './extra-contacts'; // Oct 12 client
import { PhoneListEditor, phonesStateFrom, phonesPayload, phonesError, callNumberOf, phonesLine, fmtPhone, type PhonesState } from './phone-list'; // Oct 14 client: more than one number
import { useMissingFields, FieldError, MISSING_RING } from './missing-fields'; // Oct 29 client: say exactly which fields are missing
import { DispatcherSettingsBox, DispatcherTextsEditor } from './dispatcher-prefs'; // Nov 5 client: per-dispatcher settings

// =============================== Field helpers ==============================

// Oct 29 client: `name` marks the field for "scroll to the first missing one"; `error` = red border + red line.
function Field({ label, children, full, name, error, hint }: { label: string; children: React.ReactNode; full?: boolean; name?: string; error?: string; hint?: string }) {
  return (
    <label data-field={name} className={cx('block', full && 'col-span-2')}>
      <span className={cx('text-[10.5px] font-extrabold uppercase tracking-[.05em]', error ? 'text-clay' : 'text-muted')}>{label}</span>
      {hint && <span className="ml-1.5 text-[11px] font-semibold text-muted">{hint}</span>}
      <div className={cx('mt-1.5', error && MISSING_RING)}>{children}</div>
      <FieldError msg={error} />
    </label>
  );
}
const inputCls = 'w-full rounded-[10px] border-[1.4px] border-line-2 bg-paper px-3 py-2.5 text-[13.5px] focus:border-forest focus:ring-2 focus:ring-forest/15 outline-none';

// =============================== Modal ======================================

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  // z-index must clear Leaflet's panes (200–700) and control container (~800)
  // so the edit dialog sits ABOVE the coordinator portal map.
  return (
    // Oct 7 client: clicking outside no longer closes (typed info was lost); use × / Cancel.
    <div className="fixed inset-0 z-[2000] bg-ink/50 flex items-start justify-center pt-16 px-4">
      <div onClick={(e) => e.stopPropagation()} className={cx('relative z-[2001] bg-paper rounded-[18px] shadow-lift border border-line w-full max-h-[80vh] overflow-y-auto', wide ? 'max-w-3xl' : 'max-w-md')}>
        {/* Oct 9: z-10 so switches / positioned items scroll UNDER the title bar. */}
        <div className="sticky top-0 z-10 bg-paper border-b border-line px-5 py-3 flex items-center justify-between">
          <div className="font-display font-semibold text-[18px]">{title}</div>
          <button onClick={onClose} className="haptic grid h-8 w-8 place-items-center rounded-full hover:bg-cream"><X size={17} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

// =============================== Suppliers ==================================

// "13:00, 14:30" → "1:00 PM, 2:30 PM" (client: 12-hour AM/PM only).
function fmtTimeList(v: string): string {
  return String(v).split(',').map((t) => fmtTime(t.trim())).join(', ');
}
const DAY_NAMES: Record<string, string> = {
  sunday: 'Sunday', monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday',
  thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday',
};

// Oct 2 client fix: read-only supplier view (row click), like the pickup view.
function SupplierViewModal({ s, onClose, onEdit }: { s: any; onClose: () => void; onEdit?: () => void }) {
  const contactPref = s.preferredContactMethod
    ? ({ call: 'Call', sms: 'SMS', push: 'Push (app)', whatsapp: 'WhatsApp' } as Record<string, string>)[s.preferredContactMethod] ?? s.preferredContactMethod
    : null;
  const days = String(s.pickupDays ?? '').split(',').map((d) => d.trim().toLowerCase()).filter(Boolean)
    .map((d) => DAY_NAMES[d] ?? d);
  const rows: [string, any][] = [
    ['Contact person', s.contactName ? <Name>{s.contactName}</Name> : null],
    ['Phone', s.contactPhone ? <PhoneLink phone={s.contactPhone} className="font-bold text-forest hover:underline" /> : null],
    ['Preferred contact', contactPref],
    ['Texts go by', s.contactChannel === 'whatsapp' ? 'WhatsApp' : 'SMS'],
    ['Address', shortAddressOf(s.addressLine1, s.city)],
    ['Neighborhood', s.neighborhoodName],
    ['Regular schedule', days.length || s.pickupTime
      ? `${days.join(', ')}${s.pickupTime ? ` at ${fmtTimeList(s.pickupTime)}` : ''}` : null],
    ['Regular drivers', s.pickupVolunteers],
    ['Pickup instructions', s.pickupInstructions],
    ['Restrictions', [s.refrigerationRequired ? 'Needs refrigeration' : null, s.loadingInstructions].filter(Boolean).join(' · ')],
    ['Typical donation', s.typicalDonation],
    ['Notes', s.notes],
  ];
  // Oct 11 client: tabs like the driver profile — Overview first, then the details, then pickup history.
  const [tab, setTab] = useState<'overview' | 'details' | 'history'>('overview');
  return (
    <Modal title={s.name} onClose={onClose} wide>
      <div className="flex gap-1.5 mb-3 border-b border-line pb-2">
        {(['overview', 'details', 'history'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
                  className={cx('haptic text-[12.5px] font-bold px-3 py-1.5 rounded-t-[8px]',
                                tab === t ? 'text-forest border-b-2 border-forest bg-sage/40' : 'text-muted hover:text-ink')}>
            {t === 'overview' ? 'Overview' : t === 'details' ? 'Details' : 'Pickup history'}
          </button>
        ))}
      </div>
      {tab === 'overview' && <StoreProfileOverview supplierId={Number(s.id)} />}
      {tab === 'history' && <StorePickupHistory supplierId={Number(s.id)} />}
      {tab === 'details' && <>
      <dl className="space-y-2">
        {rows.filter(([, v]) => v != null && v !== '').map(([k, v]) => (
          <div key={k} className="grid grid-cols-[150px_1fr] gap-3 items-start">
            <dt className="text-[12px] font-bold text-muted pt-0.5">{k}</dt>
            <dd className="text-[13.5px] text-ink whitespace-pre-wrap">{v}</dd>
          </div>
        ))}
      </dl>
      {/* Oct 11 client: the Oct 5 store stats moved to the Overview / Pickup history tabs. */}
      {s.intakePayload && <IntakeInfoCard payload={s.intakePayload} receivedAt={s.intakeReceivedAt} kind="supplier" />}
      </>}
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <EmailButton email={s.contactEmail} name={s.name} kind="store" />{/* Nov 3 client: email from the dispatch mailbox */}
        <SupplierAppAccessButton supplier={{ id: Number(s.id), name: s.name, contactPhone: s.contactPhone ?? null }} />
        <Button size="sm" variant="plain" onClick={onClose}>Close</Button>
        {onEdit && <Button size="sm" variant="forest" icon={<Pencil size={14} />} onClick={onEdit}>Edit</Button>}
      </div>
    </Modal>
  );
}

export function SuppliersPanel({ rows, refetch, openId, onOpenConsumed }: { rows: any[]; refetch: () => void; openId?: number | null; onOpenConsumed?: () => void }) {
  const [editing, setEditing] = useState<any | 'new' | null>(null);
  // Oct 2 client fix: clicking a supplier opens a read-only view (like
  // pickups); editing only happens from the pencil / the view's Edit button.
  const [viewing, setViewing] = useState<any | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  // Oct 11 client: Find missing locations (admin/staff/coordinator).
  const [findingMissing, setFindingMissing] = useState(false);
  const [tidyingNames, setTidyingNames] = useState(false); // Oct 16 client: ✨ Tidy store names (same roles)
  const [sleepingOpen, setSleepingOpen] = useState(false); // Oct 16 client (idea 5): 😴 Sleeping stores (same roles as Suppliers)
  const canFindMissing = ['admin', 'staff', 'coordinator'].includes(String(getUser()?.role ?? ''));
  // Open a specific supplier's edit modal when the search bar (or any parent)
  // passes an id via openId. Only consume when we actually found the row —
  // otherwise a search click that arrives before rows have loaded would
  // clear the openId and never open the modal.
  useEffect(() => {
    if (openId == null) return;
    const match = rows.find((s: any) => Number(s.id) === Number(openId));
    if (match) {
      setEditing(match);
      onOpenConsumed?.();
    }
  }, [openId, rows]);
  const delRow = useMutation({
    mutationFn: (id: number) => adminCRUD.deleteSupplier(id),
    onSettled: () => { setDeleting(null); refetch(); },
  });
  // Oct 9 client: stores that signed up on the public form wait for the office.
  const approve = useMutation({
    mutationFn: (id: number) => adminCRUD.patchSupplier(id, { status: 'active' }),
    onSettled: () => refetch(),
  });
  const waiting = rows.filter((s: any) => s.status === 'awaiting_approval');
  // Oct 2 client fix (UI plan §1): page-specific search (global header search removed).
  const [q, setQ] = useState('');
  const viewModal = viewing && (
    <SupplierViewModal s={viewing} onClose={() => setViewing(null)}
                       onEdit={isReadOnly() ? undefined : () => { setEditing(viewing); setViewing(null); }} />
  );
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    // Waiting-for-approval stores first so the office sees them.
    const byWaiting = (a: any, b: any) => Number(b.status === 'awaiting_approval') - Number(a.status === 'awaiting_approval');
    if (!needle) return [...rows].sort(byWaiting);
    return rows.filter((s: any) => [s.name, s.contactName, s.contactPhone, s.addressLine1, s.city, s.pickupInstructions, s.notes, s.neighborhoodName]
      .filter((x) => x != null).join(' ').toLowerCase().includes(needle));
  }, [rows, q]);
  return (
    <div className="space-y-3">
      <RegistrationLinkCard kind="supplier" />
      {waiting.length > 0 && (
        <div className="rounded-[12px] border border-amber/50 bg-amber-soft/50 px-4 py-2.5 text-[13px] text-ink">
          <b>{waiting.length} new {waiting.length === 1 ? 'store is' : 'stores are'} waiting for approval.</b> They don't show in store lists or on the kiosk until you press Approve.
        </div>
      )}
      {viewModal}
      <div className="relative">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search suppliers — name, contact, phone, address, notes…"
               className="w-full rounded-[12px] border border-line bg-paper pl-9 pr-9 py-2.5 text-[14px] outline-none focus:border-forest" />
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted">🔍</span>
        {q && <button onClick={() => setQ('')} title="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 haptic grid h-6 w-6 place-items-center rounded-full text-muted hover:bg-cream">✕</button>}
      </div>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-[11px] font-extrabold uppercase tracking-[.05em] text-muted">{shown.length}{shown.length !== rows.length ? ` of ${rows.length}` : ''} donors</div>
        <div className="flex items-center gap-2 flex-wrap">
          {canFindMissing && (
            <button onClick={() => setFindingMissing(true)} title="Look up stores that are not on the map yet"
                    className="haptic rounded-[10px] border border-line bg-paper px-3 py-1.5 text-[12.5px] font-bold text-ink hover:border-forest">📍 Find missing locations</button>
          )}
          {canFindMissing && (
            <button onClick={() => setTidyingNames(true)} title="Suggest full, professional store names (checked with Google)"
                    className="haptic rounded-[10px] border border-line bg-paper px-3 py-1.5 text-[12.5px] font-bold text-ink hover:border-forest">✨ Tidy store names</button>
          )}
          <button onClick={() => setSleepingOpen(true)} title="Stores that gave before but not lately — give them a call" data-open-sleeping
                  className="haptic rounded-[10px] border border-line bg-paper px-3 py-1.5 text-[12.5px] font-bold text-ink hover:border-forest">😴 Sleeping stores</button>
          {!isReadOnly() && <Button size="sm" variant="forest" icon={<Plus size={14} />} onClick={() => setEditing('new')}>New supplier</Button>}
        </div>
      </div>
      <div className="space-y-2">
        {shown.map((s) => (
          // Oct 2 client fix (UI plan §5): whole row opens the supplier; key
          // details (contact, address, instructions, restrictions, notes,
          // regular schedule) show without another click.
          <div key={s.id} onClick={() => setViewing(s)}
               className="cursor-pointer hover:shadow-card transition border border-line bg-paper rounded-[14px] px-4 py-3 flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-0.5">
              <div className="font-bold text-[13.5px] truncate">
                <Name>{s.name}</Name>
                {s.status === 'awaiting_approval' && (
                  <span className="ml-1.5 align-middle text-[10.5px] font-bold uppercase tracking-wide bg-amber-soft text-[#9a7415] px-1.5 py-0.5 rounded-full">Waiting for approval</span>
                )}
                {/* Oct 5 client: only when they actually told us a preferred method. */}
                {s.preferredContactMethod && (
                <span className="ml-1.5 align-middle text-[10.5px] font-bold uppercase tracking-wide bg-sky-soft text-sky-deep px-1.5 py-0.5 rounded-full">
                  {`prefers ${({ push: 'push', sms: 'SMS', whatsapp: 'WhatsApp', call: 'call' } as Record<string, string>)[s.preferredContactMethod] ?? s.preferredContactMethod}`}
                </span>
                )}
              </div>
              <div className="text-[11.5px] text-ink truncate">
                {s.contactName || s.contactPhone
                  ? <>{s.contactName && <Name>{s.contactName}</Name>}{s.contactName && s.contactPhone ? ' · ' : ''}{s.contactPhone && displayPhone(s.contactPhone)}</>
                  : 'No contact on file'}
              </div>
              <div className="text-[11px] text-muted truncate">📍 {shortAddressOf(s.addressLine1, s.city) || 'No address'}</div>
              {s.pickupInstructions && <div className="text-[11px] text-ink line-clamp-2">Instructions: {s.pickupInstructions}</div>}
              {(s.loadingInstructions || s.refrigerationRequired) && (
                <div className="text-[11px] text-clay line-clamp-2">
                  Restrictions: {[s.refrigerationRequired ? 'Needs refrigeration' : null, s.loadingInstructions].filter(Boolean).join(' · ')}
                </div>
              )}
              {s.notes && <div className="text-[11px] text-muted line-clamp-2">Notes: {s.notes}</div>}
              {(s.pickupDays || s.pickupTime) && (
                <div className="text-[11px] text-forest font-semibold truncate">
                  Regular: {String(s.pickupDays ?? '').split(',').filter(Boolean).map((d: string) => d.slice(0, 1).toUpperCase() + d.slice(1, 3)).join(', ')}
                  {s.pickupTime ? ` at ${fmtTimeList(s.pickupTime)}` : ''}
                  {s.pickupVolunteers ? ` · ${s.pickupVolunteers}` : ''}
                </div>
              )}
            </div>
            <div onClick={(e) => e.stopPropagation()} className="flex items-center gap-1.5 shrink-0">
              {!isReadOnly() && s.status === 'awaiting_approval' && (
                <button onClick={() => { void uiConfirm(`Approve ${s.name}? It will show in store lists and on the kiosk.`).then((ok) => { if (ok) approve.mutate(Number(s.id)); }); }}
                        disabled={approve.isPending && approve.variables === Number(s.id)}
                        className="haptic rounded-[10px] bg-forest px-3 py-1.5 text-[12.5px] font-bold text-paper disabled:opacity-50">Approve</button>
              )}
              {!isReadOnly() && (<button onClick={() => setEditing(s)} title={isReadOnly() ? 'View' : 'Edit'}
                      className="haptic grid h-8 w-8 place-items-center rounded-full bg-sage text-forest hover:bg-sage-line">
                <Pencil size={14} />
              </button>)}
              {isOfficeOnly() && (
                <button onClick={() => {
                          void uiConfirm(`Permanently delete ${s.name}? Linked pickups and steady templates at this supplier will be affected.`).then((ok) => { if (ok) {
                            setDeleting(s.id); delRow.mutate(s.id);
                          } });
                        }} title="Delete"
                        disabled={deleting === s.id}
                        className="haptic grid h-8 w-8 place-items-center rounded-full bg-clay-soft text-clay hover:bg-clay/20 disabled:opacity-40">
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      {editing && <SupplierForm row={editing === 'new' ? null : editing} onDone={() => { setEditing(null); refetch(); }} onCancel={() => setEditing(null)} />}
      {findingMissing && <MissingLocationsModal onClose={() => setFindingMissing(false)} onSaved={refetch} />}
      {tidyingNames && <TidyNamesModal onClose={() => setTidyingNames(false)} onSaved={refetch} />}
      {sleepingOpen && <SleepingStoresModal onClose={() => setSleepingOpen(false)} />}
    </div>
  );
}

export function SupplierForm({ row, onDone, onCancel, onCreated }: {
  row: any | null; onDone: () => void; onCancel: () => void;
  // Fires with the freshly-created supplier row when the form was in "new"
  // mode. Used by the inline "+ Add new supplier" flow from pickup forms to
  // auto-select the just-created supplier in the parent's dropdown.
  onCreated?: (row: any) => void;
}) {
  const [name, setName]          = useState(row?.name ?? '');
  const [contactName, setCN]     = useState(row?.contactName ?? '');
  const [contactPhone, setCP]    = useState(row?.contactPhone ?? '');
  const [addressLine1, setAddr]  = useState(row?.addressLine1 ?? '');
  const [city, setCity]          = useState(row?.city ?? '');
  // Oct 11 client: filled by the store-name lookup. coords: undefined = unchanged,
  // null = address retyped (clear it; the map looks it up again), else the picked spot.
  const [state, setState]        = useState(row?.state ?? '');
  const [zip, setZip]            = useState(row?.zip ?? '');
  const [coords, setCoords]      = useState<{ lat: number; lng: number } | null | undefined>(undefined);
  const [pickedFrom, setPickedFrom] = useState<string | null>(null);
  const hadCoords = row?.latitude != null && row?.longitude != null;
  function typeAddress(v: string) { setAddr(v); if (coords !== undefined || hadCoords) setCoords(null); setPickedFrom(null); }
  function pickPlace(p: PickedPlace) {
    // Picking is the user's choice: name + address fields take Google's; phone only if empty.
    if (p.name) setName(p.name);
    setAddr(p.line1 || (p.formatted || '').split(',')[0] || addressLine1);
    if (p.city) setCity(p.city);
    if (p.state) setState(p.state);
    if (p.zip) setZip(p.zip);
    if (p.phone && !String(contactPhone).trim()) setCP(p.phone);
    if (p.lat != null && p.lng != null) setCoords({ lat: p.lat, lng: p.lng });
    setPickedFrom((p.formatted || '').replace(/,\s*USA$/, ''));
  }
  const geo = coords === undefined ? {} : { latitude: coords?.lat ?? null, longitude: coords?.lng ?? null };
  const [pickupInstructions, setInstr] = useState(row?.pickupInstructions ?? '');
  const [typicalDonation, setTd] = useState(row?.typicalDonation ?? '');
  const [neighborhoodId, setNb]  = useState<number | null>(row?.neighborhoodId ?? null);
  // Aug 29 (WA parity): per-supplier channel — SMS or WhatsApp (no 'both').
  const [contactChannel, setContactChannel] = useState<'sms' | 'whatsapp'>(
    row?.contactChannel === 'whatsapp' ? 'whatsapp' : 'sms',
  );
  // Oct 2 client fix (UI plan §5): office-facing preferred contact method.
  const [preferredContact, setPreferredContact] = useState<string>(row?.preferredContactMethod ?? '');
  const optedInAt = row?.whatsappOptedInAt ?? row?.whatsapp_opted_in_at ?? null;
  const neighborhoods = useQuery({ queryKey: ['neighborhoods'], queryFn: adminCRUD.neighborhoods });

  const save = useMutation({
    mutationFn: () => row
      ? adminCRUD.patchSupplier(row.id, { name, contactName, contactPhone, addressLine1, city, state: state || null, zip: zip || null, ...geo, pickupInstructions, typicalDonation, neighborhoodId, contactChannel, preferredContactMethod: preferredContact || null })
      : adminCRUD.createSupplier({ name, contactName, contactPhone, addressLine1, city, state: state || null, zip: zip || null, ...geo, pickupInstructions, typicalDonation, neighborhoodId, contactChannel, preferredContactMethod: preferredContact || null }),
    onSuccess: (res: any) => {
      if (!row && onCreated && res?.data) onCreated(res.data);
      onDone();
    },
  });
  const del = useMutation({ mutationFn: () => adminCRUD.deleteSupplier(row.id), onSuccess: onDone });

  return (
    <Modal title={row ? `Edit ${row.name}` : 'New supplier'} onClose={onCancel}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Name" full>
          <PlaceNameInput office value={name} onChange={setName} onPick={pickPlace} className={inputCls}
                          placeholder='Type the store name, e.g. "Evergreen"' />
        </Field>
        <Field label="Contact name"><input value={contactName} onChange={(e) => setCN(e.target.value)} className={inputCls} /></Field>
        <Field label="Contact phone"><input value={contactPhone} onChange={(e) => setCP(e.target.value)} className={inputCls} /></Field>
        <Field label="Preferred contact">
          <select value={preferredContact} onChange={(e) => setPreferredContact(e.target.value)} className={inputCls}>
            <option value="">Not set</option>
            <option value="call">Call</option>
            <option value="sms">SMS</option>
            <option value="push">Push (app)</option>
            <option value="whatsapp">WhatsApp</option>
          </select>
        </Field>
        <Field label="Address" full>
          <AddressAutocomplete value={addressLine1} onChange={typeAddress} lookupName={name} placeholder="Start typing… suggestions from Google" className={inputCls} />
          {coords && <div className="text-[11.5px] text-forest mt-1" data-picked-place="1">📍 On the map: {pickedFrom || `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`}</div>}
          {coords === null && <div className="text-[11.5px] text-muted mt-1">Address changed — the map spot will be looked up again.</div>}
        </Field>
        <Field label="City"><input value={city} onChange={(e) => setCity(e.target.value)} className={inputCls} /></Field>
        <Field label="State / Zip">
          <div className="flex gap-2">
            <input value={state} onChange={(e) => setState(e.target.value)} placeholder="NY" className={cx(inputCls, 'w-[70px]')} />
            <input value={zip} onChange={(e) => setZip(e.target.value)} placeholder="10952" className={inputCls} />
          </div>
        </Field>
        <Field label="Neighborhood" full>
          <select value={neighborhoodId ?? ''} onChange={(e) => setNb(e.target.value ? Number(e.target.value) : null)} className={inputCls}>
            <option value="">— Not assigned —</option>
            {(neighborhoods.data?.data ?? []).filter((n) => n.status === 'active').map((n) => (
              <option key={n.id} value={n.id}>{n.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Pickup instructions" full><textarea rows={2} value={pickupInstructions} onChange={(e) => setInstr(e.target.value)} className={inputCls} placeholder="gate codes, door, etc." /></Field>
        <Field label="What they typically donate" full><textarea rows={2} value={typicalDonation} onChange={(e) => setTd(e.target.value)} className={inputCls} placeholder='e.g. "6–8 trays of pasta"' /></Field>

        {/* Aug 29 (WA parity): contact channel. Suppliers use SMS or WhatsApp
            — never both. */}
        <Field label="Contact channel" full>
          <div className="flex flex-wrap items-center gap-2">
            {(['sms', 'whatsapp'] as const).map((opt) => (
              <button key={opt} type="button" onClick={() => setContactChannel(opt)}
                      className={cx('rounded-[10px] border-[2px] px-3 py-1.5 text-[13px] font-bold',
                        contactChannel === opt ? 'bg-forest text-paper border-forest' : 'bg-paper text-ink border-line hover:border-forest')}>
                {opt === 'sms' ? 'SMS (text)' : 'WhatsApp'}
              </button>
            ))}
          </div>
          {contactChannel === 'whatsapp' && !optedInAt && (
            <p className="text-[11.5px] text-amber-700 italic mt-1">
              WhatsApp opt-in pending — saving will send a Yes/No welcome message on WhatsApp; the contact must tap Yes to receive further notifications.
            </p>
          )}
          {contactChannel === 'whatsapp' && optedInAt && (
            <p className="text-[11.5px] text-forest italic mt-1">
              ✓ WhatsApp opted in on {fmtDay(optedInAt)}.
            </p>
          )}
        </Field>
      </div>
      {row && (
        <AccountLoginSection kind="supplier" id={row.id} suggestedUsername={contactPhone || ''} />
      )}
      {row?.intakePayload && (
        <IntakeInfoCard payload={row.intakePayload} receivedAt={row.intakeReceivedAt} kind="supplier" />
      )}
      {row && (
        <ContactRecruitingHistory targetType="supplier" targetId={row.id} targetName={row.name} />
      )}
      {row && (
        <GiftsHistory targetType="supplier" targetId={row.id} targetName={row.name} />
      )}
      {(save.error || del.error) && <p className="text-clay text-[12px] mt-3">{((save.error || del.error) as Error).message}</p>}
      <div className="flex items-center justify-between mt-4">
        {row && isOfficeOnly() ? (
          <button onClick={() => { void uiConfirm(`Permanently delete ${row.name}? This removes it and any linked pickups/steady templates only at this supplier.`).then((ok) => { if (ok) { del.mutate(); } }); }}
                  className="haptic flex items-center gap-1.5 text-clay text-[12.5px] font-bold border border-clay/40 px-3 py-2 rounded-[10px] hover:bg-clay-soft">
            <Trash2 size={13} /> {del.isPending ? 'Deleting…' : 'Delete'}
          </button>
        ) : <span />}
        <div className="flex gap-2">
          <Button size="sm" variant="plain" onClick={onCancel}>Cancel</Button>
          <Button size="sm" loading={save.isPending} onClick={() => save.mutate()}>{row ? 'Save' : 'Create'}</Button>
        </div>
      </div>
    </Modal>
  );
}

// =============================== Volunteers =================================

// Sep 9 client (#C3.4 + C2): the Volunteers page dropdown now reflects
// the volunteer_status options configured in Settings (option_items,
// category='volunteer_status'). The status column that C2 gates on IS
// the field this dropdown edits — no more separate hardcoded
// application_status enum.
type AppStatus = string;
const STATUS_TONE: Record<string, { bg: string; fg: string }> = {
  new:            { bg: 'bg-line',       fg: 'text-ink'       },
  active:         { bg: 'bg-sage',       fg: 'text-forest'    },
  temporary:      { bg: 'bg-sage',       fg: 'text-forest'    },
  vip:            { bg: 'bg-sky-soft',   fg: 'text-sky-deep'  },
  inactive:       { bg: 'bg-amber-soft', fg: 'text-[#9a7415]' },
  past_archived:  { bg: 'bg-clay-soft',  fg: 'text-clay'      },
  do_not_contact: { bg: 'bg-clay-soft',  fg: 'text-clay'      },
  alumni:         { bg: 'bg-line',       fg: 'text-muted'     },
  pending:        { bg: 'bg-line',       fg: 'text-ink'       },
  contacted:      { bg: 'bg-amber-soft', fg: 'text-[#9a7415]' },
  approved:       { bg: 'bg-sage',       fg: 'text-forest'    },
  assigned:       { bg: 'bg-sky-soft',   fg: 'text-sky-deep'  },
};

export function VolunteersPanel({ rows, refetch, openId, onOpenConsumed }: { rows: any[]; refetch: () => void; openId?: number | null; onOpenConsumed?: () => void }) {
  const [editing, setEditing] = useState<any | 'new' | null>(null);
  const [viewing, setViewing] = useState<any | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  // §3: sort + application-status filter + bulk select.
  // Oct 22 client (dispatcher view): a dispatcher sees names, unit # and phone only — no status, filters, export, edit.
  const disp = isDispatcherLogin();
  const [sort, setSort] = useState<'submitted_desc' | 'submitted_asc' | 'name'>(disp ? 'name' : 'submitted_desc');
  // Oct 2 client fix (UI plan §1): page-specific search (global header search removed).
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState<Set<AppStatus>>(new Set());
  // Oct 29 client: roles — tags next to names + a filter by role.
  const rolesQ = usePersonRoles();
  const roleData = rolesQ.data?.data;
  const [roleFilter, setRoleFilter] = useState<RoleKey | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [exporting, setExporting] = useState(false);
  // tier3 Aug 23 — replace blocking alert() for export failures with a
  // non-modal flash toast. Auto-clears after 5s.
  const [flash, setFlash] = useState<{ tone: 'ok' | 'err'; msg: string } | null>(null);
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 5000);
    return () => clearTimeout(t);
  }, [flash]);
  const qc = useQueryClient();
  // Sep 9 client (#C3.4): status writes go to the main `status` column
  // (which is what C2 gates on for messaging + login). Options come from
  // the Settings-configured volunteer_status list — no hardcoded enum.
  const patchStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      adminCRUD.patchVolunteer(id, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-volunteers'] }),
  });
  const volStatusOptionsQ = useQuery({
    queryKey: ['options', 'volunteer_status'],
    queryFn:  () => adminCRUD.options('volunteer_status'),
    staleTime: 5 * 60 * 1000,
  });
  const VOL_STATUS_OPTIONS: Array<{ value: string; label: string }> = (
    (volStatusOptionsQ.data?.data ?? []) as any[]
  )
    .filter((o: any) => o.isActive !== false && o.is_active !== false)
    .sort((a: any, b: any) => Number(a.sortOrder ?? a.sort_order ?? 0) - Number(b.sortOrder ?? b.sort_order ?? 0))
    .map((o: any) => ({ value: String(o.value ?? '').toLowerCase(), label: String(o.label ?? '') }));
  // Open a specific volunteer's edit modal when the search bar (or any parent)
  // passes an id via openId. Only consume when we actually found the row —
  // otherwise a search click that arrives before rows have loaded would
  // clear the openId and never open the modal.
  useEffect(() => {
    if (openId == null) return;
    const match = rows.find((v: any) => Number(v.id) === Number(openId));
    if (match) {
      // Oct 11 client: Who gets texts opens the driver's profile (Alerts & schedule), not the edit form.
      if (nextVolunteerTab || disp) setViewing(match); else setEditing(match);
      onOpenConsumed?.();
    }
  }, [openId, rows]);
  const delRow = useMutation({
    mutationFn: (id: number) => adminCRUD.deleteVolunteer(id),
    onSettled: () => { setDeleting(null); refetch(); },
  });

  // Per-status counts across the loaded set — displayed on the filter chips.
  const counts = useMemo(() => {
    // Oct 2 client fix: count EVERY status — the old fixed four-key map
    // silently dropped active / vip / temporary / inactive / past_archived.
    const acc: Record<AppStatus, number> = { new: 0, contacted: 0, approved: 0, assigned: 0 };
    for (const v of rows) {
      // Sep 9 client regression fix: read the volunteer_status column
      // (v.status), not the legacy 4-value applicationStatus enum. Prior
      // dropdown wrote to v.status but this read kept showing 'new' from
      // applicationStatus after every refresh.
      const s = String(v.status ?? v.applicationStatus ?? 'new').toLowerCase() as AppStatus;
      acc[s] = (acc[s] ?? 0) + 1;
    }
    return { total: rows.length, ...acc };
  }, [rows]);

  // Client-side filter + sort. Server-side would be more scalable but keeps
  // the initial list query stable; office roster is a few hundred rows tops.
  const view = useMemo(() => {
    let out = rows;
    if (statusFilter.size > 0) out = out.filter((v) => statusFilter.has(String(v.status ?? v.applicationStatus ?? 'new').toLowerCase() as AppStatus));
    if (roleFilter) out = out.filter((v: any) => hasRole(rolesOf(roleData, Number(v.id)), roleFilter)); // Oct 29 client
    const needle = q.trim().toLowerCase();
    if (needle) out = out.filter((v: any) => [v.firstName, v.lastName, v.unitNumber, v.phonePrimary, v.email, v.homeAddress, v.locationArea, v.status]
      .filter((x) => x != null).join(' ').toLowerCase().includes(needle));
    const submittedMs = (v: any) => new Date(v.intakeReceivedAt ?? v.intakeDate ?? 0).getTime() || 0;
    return [...out].sort((a: any, b: any) => {
      if (sort === 'name') return (a.lastName ?? '').localeCompare(b.lastName ?? '');
      const cmp = submittedMs(b) - submittedMs(a);
      return sort === 'submitted_asc' ? -cmp : cmp;
    });
  }, [rows, statusFilter, sort, q, roleFilter, roleData]);
  const roleCounts = useMemo(() => {
    const acc: Partial<Record<RoleKey, number>> = {};
    for (const v of rows) {
      const r = rolesOf(roleData, Number(v.id));
      for (const t of ROLE_TAGS) if (hasRole(r, t.key)) acc[t.key] = (acc[t.key] ?? 0) + 1;
    }
    return acc;
  }, [rows, roleData]);

  function toggleStatus(s: AppStatus) {
    const next = new Set(statusFilter);
    if (next.has(s)) next.delete(s); else next.add(s);
    setStatusFilter(next);
  }
  const photoMap = usePhotoMap(); // Oct 30 client: small round photo on each row (office + dispatchers only)
  function toggleSelected(id: number) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  }
  async function doExport(mode: 'selected' | 'all', format: 'xlsx' | 'txt' = 'xlsx') {
    setExporting(true);
    try {
      const body: any = mode === 'selected'
        ? { ids: Array.from(selected), format }
        : { ids: 'all' as const, applicationStatus: Array.from(statusFilter).join(',') || undefined, format };
      await adminCRUD.exportVolunteers(body);
    } catch (e: any) {
      setFlash({ tone: 'err', msg: 'Export failed: ' + (e?.message || 'unknown error') });
    } finally { setExporting(false); }
  }

  return (
    <div className="space-y-3">
      {!disp && <RegistrationLinkCard kind="volunteer" />}
      {flash && (
        <div className={cx('rounded-[10px] px-3 py-2 text-[13px] font-bold',
                            flash.tone === 'ok' ? 'bg-sage text-forest border border-sage-line' : 'bg-clay-soft text-clay border border-clay/30')}>
          {flash.msg}
        </div>
      )}
      <div className="relative">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={disp ? 'Search drivers — name, unit #, phone…' : 'Search volunteers — name, unit #, phone, email, address…'}
               className="w-full rounded-[12px] border border-line bg-paper pl-9 pr-9 py-2.5 text-[14px] outline-none focus:border-forest" />
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted">🔍</span>
        {q && <button onClick={() => setQ('')} title="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 haptic grid h-6 w-6 place-items-center rounded-full text-muted hover:bg-cream">✕</button>}
      </div>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-[11px] font-extrabold uppercase tracking-[.05em] text-muted">
          {view.length} {view.length === 1 ? 'driver' : 'drivers'}
          {(statusFilter.size > 0 || roleFilter) && ` (filtered from ${rows.length})`}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {!disp && <select value={sort} onChange={(e) => setSort(e.target.value as any)}
                  className="text-[12px] border border-line rounded-[8px] px-2 py-1 bg-paper">
            <option value="submitted_desc">Sort: Newest first</option>
            <option value="submitted_asc">Sort: Oldest first</option>
            <option value="name">Sort: Last name</option>
          </select>}
          {!isReadOnly() && !disp && <Button size="sm" variant="forest" icon={<Plus size={14} />} onClick={() => setEditing('new')}>New volunteer</Button>}
        </div>
      </div>

      {/* Oct 29 client: filter by role (On the fly / Steady / In center / Dispatcher / Lakewood / Fallsburg). */}
      {roleData && <div className="rounded-[12px] border border-line bg-paper px-3 py-2">
        <RoleFilter value={roleFilter} onChange={setRoleFilter} counts={roleCounts} showDispatcher={roleData.canDispatcher} />
      </div>}
      {/* Filter chips + bulk-export bar. Sep 9 client (#C3.4): chips
          are the Settings-configured volunteer_status options, not a
          hardcoded 4-list. Falls back to the legacy 4 while options
          are loading. */}
      {!disp && <div className="flex flex-wrap items-center gap-1.5 rounded-[12px] border border-line bg-paper px-3 py-2">
        {(VOL_STATUS_OPTIONS.length > 0
          ? VOL_STATUS_OPTIONS.map((o) => o.value)
          : (['new', 'contacted', 'approved', 'assigned'] as AppStatus[])
        ).map((s) => {
          const on = statusFilter.has(s);
          const style = (STATUS_TONE[String(s || "").toLowerCase()] ?? { bg: "bg-line", fg: "text-ink" });
          const label = VOL_STATUS_OPTIONS.find((o) => o.value === s)?.label
                      ?? String(s).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
          return (
            <button key={s} onClick={() => toggleStatus(s)}
                    className={cx('haptic text-[12px] font-bold px-2.5 py-1 rounded-full border inline-flex items-baseline gap-1.5',
                                  on ? 'bg-forest text-paper border-forest' : `${style.bg} ${style.fg} border-line hover:brightness-95`)}>
              <span>{label}</span>
              <span className={cx('text-[10.5px] font-extrabold', on ? 'text-paper/85' : 'opacity-80')}>{(counts as any)[s] ?? 0}</span>
            </button>
          );
        })}
        {statusFilter.size > 0 && (
          <button onClick={() => setStatusFilter(new Set())}
                  className="haptic text-[11.5px] font-bold text-forest underline underline-offset-2 ml-1">
            Clear
          </button>
        )}
        <div className="ml-auto flex items-center gap-2">
          {selected.size > 0 && (
            <span className="text-[11.5px] font-bold text-muted">{selected.size} selected</span>
          )}
          {/* Oct 25 client: text each ticked driver his own number (office only, not dispatchers / viewers) */}
          {isOfficeOnly() && !isReadOnly() && <SendDriverNumbersButton selectedIds={Array.from(selected)} />}
          {/* Oct 30 client: ID-card name tags (photo, name, unit #, role, QR for the kiosk) for the ticked drivers */}
          {isOfficeOnly() && <MakeNameTagsButton ids={Array.from(selected).map(Number)} />}
          <button onClick={() => doExport(selected.size > 0 ? 'selected' : 'all', 'xlsx')} disabled={exporting}
                  className="haptic text-[12px] font-bold bg-forest text-paper px-3 py-1.5 rounded-[8px] shadow-ctag disabled:opacity-50">
            {exporting ? 'Exporting…' : selected.size > 0 ? `Export ${selected.size} as Excel` : 'Export all as Excel'}
          </button>
          <button onClick={() => doExport(selected.size > 0 ? 'selected' : 'all', 'txt')} disabled={exporting}
                  title="Plain-text block export (one field per line)"
                  className="haptic text-[11.5px] font-bold text-forest underline underline-offset-2 disabled:opacity-50">
            or as text
          </button>
        </div>
      </div>}

      <div className="space-y-2">
        {view.map((v) => {
          // Sep 9 client regression fix: read the volunteer_status column
      // (v.status), not the legacy 4-value applicationStatus enum. Prior
      // dropdown wrote to v.status but this read kept showing 'new' from
      // applicationStatus after every refresh.
      const s = String(v.status ?? v.applicationStatus ?? 'new').toLowerCase() as AppStatus;
          const style = (STATUS_TONE[String(s || "").toLowerCase()] ?? { bg: "bg-line", fg: "text-ink" });
          const submitted = v.intakeReceivedAt || v.intakeDate;
          const submittedLabel = submitted ? fmtDay(submitted) : null; // Oct 23 client: one date format
          return (
            // Oct 2 client fix (UI plan §5): whole row opens the full record
            // (eye button removed); controls stop the click from bubbling.
            <div key={v.id} onClick={() => setViewing(v)}
                 className="cursor-pointer hover:shadow-card transition border border-line bg-paper rounded-[14px] px-4 py-3 flex flex-wrap sm:flex-nowrap items-center justify-between gap-x-3 gap-y-2">
              {!disp && <label onClick={(e) => e.stopPropagation()} className="grid place-items-center w-6 h-6 cursor-pointer">
                <input type="checkbox" checked={selected.has(v.id)}
                       onChange={() => toggleSelected(v.id)}
                       className="h-4 w-4 accent-forest" />
              </label>}
              {photoMap && <DriverAvatar url={photoMap[String(v.id)]} first={v.firstName} last={v.lastName} size={34} />}
              <div className={cx('min-w-0 flex-1 sm:basis-0', photoMap ? 'basis-[calc(100%-5.25rem)]' : 'basis-[calc(100%-2.25rem)]')}>
                <div className="font-bold text-[13.5px] truncate">
                  {/* Oct 23 client: a Hebrew name kept the "#128" on the wrong side — isolate the name's direction */}
                  <bdi dir="auto">{`${v.firstName ?? ''} ${v.lastName ?? ''}`.trim()}</bdi>
                  {v.unitNumber != null && (
                    <span className="ml-1.5 text-muted font-semibold text-[11.5px]">#{v.unitNumber}</span>
                  )}
                  <RoleTags r={rolesOf(roleData, Number(v.id))} className="ml-1.5 align-middle" />{/* Oct 29 client: roles */}
                </div>
                <div className="text-[11.5px] text-ink truncate">
                  {v.phonePrimary ? fmtPhone(v.phonePrimary) : '—'}{v.email ? ` · ${v.email}` : ''}
                  {v.preferredContactMethod && (
                  <span className="ml-1.5 text-[10.5px] font-bold uppercase tracking-wide bg-sky-soft text-sky-deep px-1.5 py-0.5 rounded-full"
                        title="Preferred contact method">
                    {`prefers ${({ push: 'push', sms: 'SMS', whatsapp: 'WhatsApp', call: 'call' } as Record<string, string>)[v.preferredContactMethod] ?? v.preferredContactMethod}`}
                  </span>
                  )}
                </div>
                {!disp && <div className="text-[11px] text-muted truncate">
                  {/* Oct 23 client: shorter, consistent address (no ", NY 10952, USA") */}
                  {shortAddress(v.homeAddress) || v.locationArea || 'No address'}
                  {submittedLabel && ` · applied ${submittedLabel}`}
                </div>}
              </div>
              {!disp && <select value={s} onClick={(e) => e.stopPropagation()}
                      onChange={(e) => patchStatus.mutate({ id: v.id, status: e.target.value })}
                      disabled={isReadOnly() || (patchStatus.isPending && patchStatus.variables?.id === v.id)}
                      className={cx('ml-9 sm:ml-0 text-[11.5px] font-bold px-2 py-1 rounded-full border-0 focus:ring-2 focus:ring-forest', style.bg, style.fg)}
                      title="Set volunteer status">
                {VOL_STATUS_OPTIONS.length === 0 && <option value={s}>{String(s || 'new').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</option>}
                {VOL_STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>}
              <div onClick={(e) => e.stopPropagation()} className="flex items-center gap-1.5 shrink-0">
                {!disp && <button onClick={() => setEditing(v)} title="Edit"
                        className="haptic grid h-8 w-8 place-items-center rounded-full bg-sage text-forest hover:bg-sage-line">
                  <Pencil size={14} />
                </button>}
                {isOfficeOnly() && <button onClick={() => {
                          void uiConfirm(`Remove ${v.firstName} ${v.lastName} from the roster? Their past pickup history is preserved.`).then((ok) => { if (ok) {
                            setDeleting(v.id); delRow.mutate(v.id);
                          } });
                        }} title="Remove from roster"
                        disabled={deleting === v.id}
                        className="haptic grid h-8 w-8 place-items-center rounded-full bg-clay-soft text-clay hover:bg-clay/20 disabled:opacity-40">
                  <Trash2 size={14} />
                </button>}
              </div>
            </div>
          );
        })}
      </div>
      {editing && <VolunteerForm row={editing === 'new' ? null : editing} onDone={() => { setEditing(null); refetch(); }} onCancel={() => setEditing(null)} />}
      {viewing && <VolunteerViewModal row={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

/**
 * Read-only modal that shows the full sign-up information the volunteer
 * submitted. No form fields, no save button, no accidental edits — for
 * office/managers who just want to look at what someone answered.
 */
// Oct 11 client: Messaging → Who gets texts opens a driver straight on Alerts & schedule.
// Nov 3 client: the card has 5 tabs now (Overview · Settings · History · About them · Notes). Old tab names
// still work: alerts → Settings, application/info → About them, changes → History (Changes), asana → Notes.
type OldVolTab = 'overview' | 'alerts' | 'application' | 'info' | 'history' | 'changes' | 'asana' | 'settings' | 'about' | 'notes';
let nextVolunteerTab: OldVolTab | null = null;
export function openVolunteerOnTab(t: OldVolTab) { nextVolunteerTab = t; }
const VOL_TAB_OF: Record<OldVolTab, 'overview' | 'settings' | 'history' | 'about' | 'notes'> = {
  overview: 'overview', alerts: 'settings', settings: 'settings', application: 'about', info: 'about', about: 'about',
  history: 'history', changes: 'history', asana: 'notes', notes: 'notes' };
const VOL_TAB_LABEL: Record<string, string> = { overview: 'Overview', settings: 'Settings', history: 'History', about: 'About them', notes: 'Notes', messages: 'Messages' };
function VolunteerViewModal({ row, onClose }: { row: any; onClose: () => void }) {
  // Oct 5 client (idea 2): driver profile overview first.
  // Oct 22 client (dispatcher view): a dispatcher login gets ONLY Pickup history and Messages.
  const dispView = isDispatcherLogin();
  const [histView, setHistView] = useState<'pickups' | 'changes'>(() => (nextVolunteerTab === 'changes' ? 'changes' : 'pickups'));
  const [tab, setTab] = useState<'overview' | 'settings' | 'history' | 'about' | 'notes' | 'messages'>(() => { const t = VOL_TAB_OF[nextVolunteerTab ?? 'overview'] ?? 'overview'; nextVolunteerTab = null; return dispView ? 'history' : t; });
  const [moreOpen, setMoreOpen] = useState(false); // Nov 3 client: "More ▾" (Ring me at… · Make name tag)
  const [histAll, setHistAll] = useState(false); // Nov 3 client: newest 5 pickups, then "Show more"
  const [unitInput, setUnitInput] = useState<string>(row.unitNumber != null ? String(row.unitNumber) : '');
  const [unitSaving, setUnitSaving] = useState(false);
  const [unitMsg, setUnitMsg] = useState<string>('');
  const qc = useQueryClient();
  async function saveUnit() {
    const n = unitInput.trim() === '' ? null : Number(unitInput);
    if (n !== null && (!Number.isInteger(n) || n < 1 || n > 9999)) { setUnitMsg('1–9999 or empty'); return; }
    setUnitSaving(true); setUnitMsg('');
    try {
      await adminCRUD.patchVolunteer(Number(row.id), { unitNumber: n });
      setUnitMsg('Saved');
      qc.invalidateQueries({ queryKey: ['admin-volunteers'] });
    } catch (e: any) {
      const msg = `${e?.message ?? e} ${e?.body?.error ?? ''}`;
      setUnitMsg(/duplicate|unique|already/i.test(msg) ? 'Unit # already used' : 'Save failed');
    } finally { setUnitSaving(false); }
  }
  const history = useQuery({
    queryKey: ['vol-history', row.id],
    queryFn: () => api<{ data: any[] }>(`/api/volunteers/${row.id}/history`),
    enabled: tab === 'history',
  });
  // Existing signup form asks "What type of loads can you handle?" (loadType)
  // with heavy / light / other — that IS the lifting-ability answer. Also
  // fall back to hasLifting/lifting for older payloads or future rewordings.
  const lifting = (() => {
    const p = row.intakePayload || {};
    const raw = p.hasLifting ?? p.lifting ?? p.loadType;
    if (!raw) return null;
    if (raw === 'heavy') return 'Heavy loads';
    if (raw === 'light') return 'Light loads only';
    if (raw === 'other') return `Other${p.loadOther ? `: ${p.loadOther}` : ''}`;
    return String(raw);
  })();

  // Bucket the history rows into office-facing status counts for the header.
  // Oct 7 client: count the driver's own part — a pickup they gave back is
  // "Gave back" even if someone else finished it. Office-cancelled pickups
  // are already left out by the API.
  const gaveBack = (r: any) => ['declined', 'cancelled'].includes(String(r.assignment_status ?? '').toLowerCase());
  const totals = { completed: 0, missed: 0, assigned: 0, gaveBack: 0 };
  for (const r of (history.data?.data ?? [])) {
    const s = String(r.status ?? '').toLowerCase();
    if (gaveBack(r)) totals.gaveBack++;
    else if (s === 'completed' || s === 'delivered') totals.completed++;
    else if (s === 'missed') totals.missed++;
    else totals.assigned++;
  }
  // Nov 3 client: Pickup history + Change history share one History tab — a small "Pickups / Changes" switch.
  const histToggle = (
    <div className="mb-3 inline-flex rounded-full border border-line bg-cream/60 p-0.5 text-[12px] font-bold">
      {(['pickups', 'changes'] as const).map((v) => (
        <button key={v} type="button" onClick={() => setHistView(v)}
                className={cx('haptic rounded-full px-3 py-1', histView === v ? 'bg-forest text-paper' : 'text-muted hover:text-ink')}>
          {v === 'pickups' ? 'Pickups' : 'Changes'}
        </button>
      ))}
    </div>
  );

  return (
    <Modal title={`${row.firstName ?? ''} ${row.lastName ?? ''}${row.unitNumber != null ? ` · #${row.unitNumber}` : ''}`.trim()} onClose={onClose} wide>
      {/* Oct 29 client: roles — 4 ticks (+ Lakewood / Fallsburg). Office changes them; dispatchers only see them. */}
      {/* Oct 30 client: the driver's photo (office changes / removes it; dispatchers only see it) + 🪪 name tag */}
      <DriverPhotoRow volunteerId={Number(row.id)} firstName={row.firstName} lastName={row.lastName}
                      extra={<div className="flex flex-wrap items-center gap-2">
                        {/* Nov 2 client: "I don't see the button to call someone" — rings the dispatch phone first (office-phone.tsx), else the device's phone. */}
                        {row.phonePrimary && (
                          <a href={`tel:${String(row.phonePrimary).replace(/[^\d+]/g, '')}`} data-driver-call
                             className="haptic shrink-0 inline-flex items-center gap-1 rounded-[10px] bg-forest text-paper px-3 py-1.5 text-[13px] font-bold">📞 Call</a>
                        )}
                        {row.phonePrimary && <TextButton phone={row.phonePrimary} />}{/* Nov 2 client: text from the office number */}
                        <EmailButton email={row.email} name={`${row.firstName ?? ''} ${row.lastName ?? ''}`.trim()} kind="driver" />{/* Nov 3 client: email from the dispatch mailbox */}
                        {/* Nov 3 client: "too full" — Ring me at… and Make name tag moved into a small More ▾ menu. */}
                        <div className="relative shrink-0">
                          <button type="button" onClick={() => setMoreOpen((o) => !o)} aria-expanded={moreOpen}
                                  className="haptic rounded-[10px] border border-line bg-paper px-3 py-1.5 text-[12.5px] font-bold text-ink hover:bg-sage">More ▾</button>
                          {moreOpen && <div className="fixed inset-0 z-40" onClick={() => setMoreOpen(false)} />}
                          {/* stays mounted (only hidden) so the name-tag sheet it opens stays open */}
                          <div onClickCapture={() => setMoreOpen(false)}
                               className={cx('absolute right-0 z-50 mt-1 flex w-max flex-col items-stretch gap-1 rounded-[10px] border border-line bg-paper p-1.5 shadow-card', !moreOpen && 'hidden')}>
                            <button type="button" onClick={() => openRingMeAt()} className="haptic rounded-[8px] px-3 py-1.5 text-left text-[12.5px] font-bold text-ink hover:bg-sage">Ring me at…</button>
                            {isOfficeOnly() && <MakeNameTagsButton ids={[Number(row.id)]} label="🪪 Make name tag"
                                                                    className="haptic rounded-[8px] px-3 py-1.5 text-left text-[12.5px] font-bold text-ink hover:bg-sage" />}
                          </div>
                        </div>
                      </div>} />
      <HelpsWithRow driver={{ id: Number(row.id), firstName: row.firstName, lastName: row.lastName, phonePrimary: row.phonePrimary, email: row.email }} />
      <div className="flex flex-wrap gap-1.5 mb-3 border-b border-line pb-2">
        {/* Nov 3 client: 7 tabs → 5. Notes = Asana (admins) + calls; everyone in the office sees it. */}
        {((dispView ? ['history', 'messages'] : ['overview', 'settings', 'history', 'about', 'notes']) as Array<typeof tab>).map((t) => (
          <button key={t} onClick={() => setTab(t)}
                  className={cx('haptic text-[12.5px] font-bold px-3 py-1.5 rounded-t-[8px]',
                                tab === t ? 'text-forest border-b-2 border-forest bg-sage/40' : 'text-muted hover:text-ink')}>
            {dispView && t === 'history' ? 'Pickup history' : VOL_TAB_LABEL[t]}
          </button>
        ))}
      </div>

      {tab === 'notes' ? (
        <div className="space-y-5">
          {isOfficeOnly() && <AsanaPersonTab volunteerId={Number(row.id)} />}
          {/* Oct 11 client: calls the office made to this driver (was on Alerts & schedule → On call). */}
          <div className={cx(isOfficeOnly() && 'border-t border-line pt-4')}>
            <RecentCalls volunteerId={Number(row.id)} name={row.firstName || 'the driver'} />
          </div>
        </div>
      ) : tab === 'messages' ? (
        // Oct 22 client: texts + app chat + WhatsApp in one conversation, with a box to send.
        <DriverMessagesTab volunteerId={Number(row.id)} phone={row.phonePrimary} firstName={row.firstName} />
      ) : tab === 'overview' ? (
        <DriverOverview volunteerId={Number(row.id)} phone={row.phonePrimary} firstName={row.firstName} />
      ) : tab === 'settings' ? (
        // Oct 9 client: everything about this volunteer's texts, reminders and schedules.
        <VolunteerAlertsTab volunteerId={Number(row.id)} />
      ) : tab === 'history' && !dispView && histView === 'changes' ? (
        <>
          {histToggle}
          {/* Oct 16 client: every change to this driver — who, where, what (change-history.tsx). */}
          <ChangeHistoryTab volunteerId={Number(row.id)} />
        </>
      ) : tab === 'about' ? (
        <>
          {/* Nov 3 client: Application + Sign-up info in one tab, one under the other. */}
          <h3 className="mb-2 text-[14px] font-extrabold text-ink">Application</h3>
          {/* Oct 14 client: the same "My application" view + Edit answers as the driver app (same API). */}
          <OfficeApplicationTab volunteerId={Number(row.id)} name={row.firstName || 'the driver'} />
          <h3 className="mb-2 mt-6 border-t border-line pt-4 text-[14px] font-extrabold text-ink">Sign-up info</h3>
          <div className="space-y-2 text-[13px]">
            <div className="grid grid-cols-[140px_1fr] gap-3">
              <div className="text-[11.5px] font-bold text-muted">Phone</div>
              {/* Oct 14 client: call number + where texts go (+ other numbers) */}
              <div>
                <div>{phonesLine(row.phones, row.phonePrimary)}</div>
                {(row.phones?.numbers ?? []).length > 1 && (
                  <div className="text-[11.5px] text-muted mt-0.5">
                    {(row.phones.numbers as any[]).map((n) => `${fmtPhone(n.phone)}${n.label ? ` (${n.label})` : ''}${n.call ? ' · call' : ''}${n.text ? ' · texts' : ''}`).join('  |  ')}
                  </div>
                )}
              </div>
            </div>
            {row.email && (
              <div className="grid grid-cols-[140px_1fr] gap-3">
                <div className="text-[11.5px] font-bold text-muted">Email</div>
                <div>{row.email}</div>
              </div>
            )}
            {row.locationArea && (
              <div className="grid grid-cols-[140px_1fr] gap-3">
                <div className="text-[11.5px] font-bold text-muted">Area</div>
                <div>{row.locationArea}</div>
              </div>
            )}
            {row.vehicleType && (
              <div className="grid grid-cols-[140px_1fr] gap-3">
                <div className="text-[11.5px] font-bold text-muted">Vehicle</div>
                <div>{row.vehicleType}</div>
              </div>
            )}
            <div className="grid grid-cols-[140px_1fr] gap-3">
              <div className="text-[11.5px] font-bold text-muted">Lifting ability</div>
              <div>{lifting ?? <span className="text-muted italic">not answered on sign-up</span>}</div>
            </div>
            <div className="grid grid-cols-[140px_1fr] gap-3">
              <div className="text-[11.5px] font-bold text-muted">Status</div>
              <div className="uppercase text-[11px] font-extrabold tracking-wider">{row.status ?? '—'}</div>
            </div>
            <div className="grid grid-cols-[140px_1fr] gap-3">
              <div className="text-[11.5px] font-bold text-muted">Unit #</div>
              <div className="flex items-center gap-2">
                <input type="number" min={1} max={9999} value={unitInput}
                       onChange={(e) => setUnitInput(e.target.value)}
                       className="w-[80px] rounded-[8px] border border-line bg-cream/60 px-2 py-1 text-[13px]" />
                <button onClick={saveUnit} disabled={unitSaving}
                        className="haptic text-[11.5px] font-bold px-2.5 py-1 rounded-[8px] bg-forest text-paper disabled:opacity-50">
                  {unitSaving ? 'Saving…' : 'Save'}
                </button>
                {unitMsg && <span className={cx('text-[11.5px]', unitMsg === 'Saved' ? 'text-forest' : 'text-clay')}>{unitMsg}</span>}
              </div>
            </div>
            <DriverAreasRow row={row} />
          </div>
          {row.intakePayload
            ? <IntakeInfoCard payload={row.intakePayload} receivedAt={row.intakeReceivedAt} kind="volunteer" />
            : <div className="mt-5 rounded-[14px] border border-line bg-cream/60 px-4 py-3 text-[12.5px] text-muted">
                No sign-up form on file for this volunteer (they were added directly by the office).
              </div>}
        </>
      ) : (
        <>
          {!dispView && histToggle}
          <div className="grid grid-cols-4 gap-2 mb-3">
            <div className="rounded-[10px] bg-sage border border-sage-line px-3 py-2 text-center">
              <div className="font-display font-bold text-[20px] text-forest leading-none">{totals.completed}</div>
              <div className="text-[10.5px] font-extrabold uppercase tracking-[.06em] text-forest mt-0.5">Done</div>
            </div>
            <div className="rounded-[10px] bg-sky-soft border border-sky/40 px-3 py-2 text-center">
              <div className="font-display font-bold text-[20px] text-sky-deep leading-none">{totals.assigned}</div>
              <div className="text-[10.5px] font-extrabold uppercase tracking-[.06em] text-sky-deep mt-0.5">Assigned</div>
            </div>
            <div className="rounded-[10px] bg-clay-soft border border-clay/40 px-3 py-2 text-center">
              <div className="font-display font-bold text-[20px] text-clay leading-none">{totals.missed}</div>
              <div className="text-[10.5px] font-extrabold uppercase tracking-[.06em] text-clay mt-0.5">Missed</div>
            </div>
            <div className="rounded-[10px] bg-line/50 border border-line px-3 py-2 text-center">
              <div className="font-display font-bold text-[20px] text-muted leading-none">{totals.gaveBack}</div>
              <div className="text-[10.5px] font-extrabold uppercase tracking-[.06em] text-muted mt-0.5">Gave back</div>
            </div>
          </div>
          {history.isLoading && <div className="text-[13px] text-muted">Loading…</div>}
          {history.data?.data?.length === 0 && (
            <div className="text-[13px] text-muted italic">No pickups on record.</div>
          )}
          <div className="space-y-1.5 max-h-[420px] overflow-y-auto">
            {(history.data?.data ?? []).slice(0, dispView || histAll ? undefined : 5).map((h: any) => (
              <div key={h.id} className="rounded-[10px] border border-line bg-paper px-3 py-2 text-[12.5px] flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-bold truncate"><Name>{tidyPlaceName(h.suppliers || h.place) || 'One-time pickup'}</Name></div>
                  <div className="text-[11px] text-muted">{whenText(String(h.scheduled_date ?? '').slice(0, 10), h.scheduled_time) || '—'}</div>
                </div>
                {/* Oct 23 client: the one status pill (same words + colors as the Live Board) */}
                {gaveBack(h)
                  ? <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-cream text-muted border border-line whitespace-nowrap">Gave back</span>
                  : <StatusPill of={{ ...h, slots_remaining: null, signups: [h] /* this driver is on it */ }} />}
              </div>
            ))}
          </div>
          {!dispView && (history.data?.data?.length ?? 0) > 5 && (
            <button type="button" onClick={() => setHistAll(!histAll)} className="haptic mt-1.5 text-[12.5px] font-bold text-forest hover:underline">
              {histAll ? 'Show less' : `Show more (${history.data!.data.length})`}
            </button>
          )}
        </>
      )}

      <div className="flex justify-end mt-4">
        <Button size="sm" variant="plain" onClick={onClose}>Close</Button>
      </div>
    </Modal>
  );
}

/**
 * Oct 30 client (Coverage map): "Areas" on the driver card. Starts with what the office
 * picked, else what the driver checked on the application. Saving stores the office's
 * pick (the driver's neighborhood list); clearing all goes back to the application answers.
 */
function DriverAreasRow({ row }: { row: any }) {
  const qc = useQueryClient();
  const neighborhoods = useQuery({ queryKey: ['neighborhoods'], queryFn: adminCRUD.neighborhoods });
  const start: number[] = (row.areaIds ?? row.neighborhoodIds ?? []).map(Number);
  const [ids, setIds] = useState<number[]>(start);
  const [source, setSource] = useState<string>(row.areaSource ?? ((row.neighborhoodIds ?? []).length ? 'office' : 'none'));
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const readOnly = isReadOnly();
  const dirty = [...ids].sort().join(',') !== [...start].sort().join(',');
  const active = (neighborhoods.data?.data ?? []).filter((n) => n.status === 'active');
  const unmatched: string[] = row.areaUnmatched ?? [];
  async function save() {
    setBusy(true); setMsg('');
    try {
      await adminCRUD.patchVolunteer(Number(row.id), { neighborhoodIds: ids });
      setMsg('Saved'); setSource(ids.length ? 'office' : 'application');
      qc.invalidateQueries({ queryKey: ['admin-volunteers'] });
      qc.invalidateQueries({ queryKey: ['coverage'] });
    } catch { setMsg('Save failed'); } finally { setBusy(false); }
  }
  return (
    <div className="grid grid-cols-[140px_1fr] gap-3" data-driver-areas>
      <div className="text-[11.5px] font-bold text-muted">Areas</div>
      <div>
        <div className="flex flex-wrap gap-1.5">
          {active.map((n) => {
            const on = ids.includes(n.id);
            return (
              <button type="button" key={n.id} disabled={readOnly}
                      onClick={() => { setMsg(''); setIds((p) => (p.includes(n.id) ? p.filter((x) => x !== n.id) : [...p, n.id])); }}
                      className={cx('text-[12px] font-bold px-2.5 py-1 rounded-full border transition haptic disabled:cursor-default',
                        on ? 'bg-forest text-paper border-forest' : 'bg-paper text-ink border-line hover:border-forest')}>
                {n.name}
              </button>
            );
          })}
          {neighborhoods.isLoading && <span className="text-[11px] text-muted">Loading areas…</span>}
        </div>
        <div className="flex items-center gap-2 mt-1.5">
          {!readOnly && (
            <button type="button" onClick={save} disabled={busy || !dirty}
                    className="haptic text-[11.5px] font-bold px-2.5 py-1 rounded-[8px] bg-forest text-paper disabled:opacity-40">
              {busy ? 'Saving…' : 'Save areas'}
            </button>
          )}
          {msg && <span className={cx('text-[11.5px]', msg === 'Saved' ? 'text-forest' : 'text-clay')}>{msg}</span>}
          <span className="text-[11px] text-muted">
            {source === 'application' ? 'From their application.' : source === 'office' ? 'Set by the office. Clear all to use their application answers.' : 'Not set yet.'}
          </span>
        </div>
        {unmatched.length > 0 && (
          <div className="text-[11px] text-muted mt-1">They also wrote: {unmatched.map((u) => `“${u}”`).join(', ')}</div>
        )}
      </div>
    </div>
  );
}

function VolunteerForm({ row, onDone, onCancel }: { row: any | null; onDone: () => void; onCancel: () => void }) {
  const [firstName, setFN]    = useState(row?.firstName ?? '');
  const [lastName, setLN]     = useState(row?.lastName ?? '');
  // Oct 14 client: more than one number — which gets texts, which is best to call.
  const [phones, setPhones] = useState<PhonesState>(() => phonesStateFrom(row?.phones, row?.phonePrimary));
  const phonePrimary = callNumberOf(phones);
  const phonesErr = phonesError(phones);
  const [email, setEmail]     = useState(row?.email ?? '');
  const [locationArea, setLA] = useState(row?.locationArea ?? '');
  const [hasCar, setHasCar]   = useState<boolean>(row?.hasCar ?? true);
  const [wantsSteadyPickup, setSteady] = useState<boolean>(row?.wantsSteadyPickup ?? false);
  // Oct 30 client: start from the driver's areas (office pick, else their application);
  // only saved when changed, so an unrelated edit doesn't freeze the application answers.
  const startNbIds: number[] = (row?.areaIds ?? row?.neighborhoodIds ?? []).map(Number);
  const [neighborhoodIds, setNbIds] = useState<number[]>(startNbIds);
  const nbChanged = [...neighborhoodIds].sort().join(',') !== [...startNbIds].sort().join(',');
  // batch abc800 Aug 9 — per-volunteer SMS quiet hours (NY local).
  const initQS = (row?.smsQuietStart ?? row?.sms_quiet_start ?? '') as string;
  const initQE = (row?.smsQuietEnd   ?? row?.sms_quiet_end   ?? '') as string;
  const [quietStart, setQuietStart] = useState<string>(initQS ? initQS.slice(0, 5) : '');
  const [quietEnd,   setQuietEnd]   = useState<string>(initQE ? initQE.slice(0, 5) : '');
  // Aug 29 (WA parity): per-volunteer channel — SMS or WhatsApp. Admin/dispatcher
  // volunteers can also be 'both' (receive on both channels).
  const [contactChannel, setContactChannel] = useState<'sms' | 'whatsapp' | 'both'>(
    (row?.contactChannel === 'whatsapp' || row?.contactChannel === 'both' || row?.contactChannel === 'sms')
      ? row.contactChannel : 'sms',
  );
  // Aug 31 (Both-rule): 'both' only for admin/dispatcher/coordinator/staff.
  // Role now comes from the /volunteers list projection (Aug 31 backend
  // change JOINs zlz.users). Fall back to userRole for older callers.
  const roleAllowsBoth = ((): boolean => {
    const r = String(row?.role ?? row?.userRole ?? '').toLowerCase();
    return r === 'admin' || r === 'dispatcher' || r === 'coordinator' || r === 'staff';
  })();
  const optedInAt = row?.whatsappOptedInAt ?? row?.whatsapp_opted_in_at ?? null;
  // Oct 2 client fix (UI plan §5): how the office prefers to reach them.
  const [preferredContact, setPreferredContact] = useState<string>(row?.preferredContactMethod ?? '');
  const neighborhoods = useQuery({ queryKey: ['neighborhoods'], queryFn: adminCRUD.neighborhoods });
  const toggleNb = (id: number) => setNbIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const save = useMutation({
    mutationFn: () => {
      // batch abc811 Aug 10 — restored two-field quiet-hours window
      // (FROM/UNTIL). Wrap around midnight is supported by the SQL gate.
      const smsQuietStart = quietStart ? quietStart : null;
      const smsQuietEnd   = quietEnd   ? quietEnd   : null;
      if (phonesErr) throw new Error(phonesErr);
      const phonesBody = phonesPayload(phones);
      return row
        ? adminCRUD.patchVolunteer(row.id, { firstName, lastName, phonePrimary: phonePrimary || null, phones: phonesBody, email: email || null, locationArea, hasCar, wantsSteadyPickup, neighborhoodIds: nbChanged ? neighborhoodIds : undefined, smsQuietStart, smsQuietEnd, contactChannel, preferredContactMethod: preferredContact || null })
        : adminCRUD.createVolunteer({ firstName, lastName, phonePrimary: phonePrimary || null, phones: phonesBody, email: email || null, locationArea, hasCar, wantsSteadyPickup, neighborhoodIds, smsQuietStart, smsQuietEnd, contactChannel, preferredContactMethod: preferredContact || null });
    },
    onSuccess: onDone,
  });
  const del = useMutation({ mutationFn: () => adminCRUD.deleteVolunteer(row.id), onSuccess: onDone });

  return (
    <Modal title={row ? `Edit ${row.firstName} ${row.lastName}` : 'New volunteer'} onClose={onCancel}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="First name"><input value={firstName} onChange={(e) => setFN(e.target.value)} className={inputCls} /></Field>
        <Field label="Last name"><input value={lastName} onChange={(e) => setLN(e.target.value)} className={inputCls} /></Field>
        <Field label="Email"><input value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} /></Field>
        {/* Oct 14 client: phone list (up to 3) + Texts go to / Best number to call */}
        <Field label="Phone numbers" full>
          <PhoneListEditor value={phones} onChange={setPhones} idPrefix={`vf-${row?.id ?? 'new'}`} />
          {phonesErr && <p className="text-clay text-[12px] font-bold mt-1">{phonesErr}</p>}
        </Field>
        <Field label="Preferred contact">
          <select value={preferredContact} onChange={(e) => setPreferredContact(e.target.value)} className={inputCls}>
            <option value="">Not set</option>
            <option value="call">Call</option>
            <option value="sms">SMS</option>
            <option value="push">Push (app)</option>
            <option value="whatsapp">WhatsApp</option>
          </select>
        </Field>
        <Field label="Area (notes)" full><input value={locationArea} onChange={(e) => setLA(e.target.value)} className={inputCls} placeholder="Spring Valley / Monsey / Suffern…" /></Field>
        <Field label="Areas they cover" full>
          <div className="flex flex-wrap gap-1.5">
            {(neighborhoods.data?.data ?? []).filter((n) => n.status === 'active').map((n) => {
              const on = neighborhoodIds.includes(n.id);
              return (
                <button type="button" key={n.id} onClick={() => toggleNb(n.id)}
                        className={cx('text-[12px] font-bold px-3 py-1.5 rounded-full border transition haptic',
                          on ? 'bg-forest text-paper border-forest' : 'bg-paper text-ink border-line hover:border-forest')}>
                  {n.name}
                </button>
              );
            })}
            {neighborhoods.isLoading && <span className="text-[11px] text-muted">Loading neighborhoods…</span>}
            {neighborhoods.isError && <span className="text-[11px] text-clay">Couldn't load neighborhoods. <button type="button" onClick={() => neighborhoods.refetch()} className="underline font-bold">Try again</button></span>}
            {neighborhoods.isSuccess && (neighborhoods.data?.data ?? []).length === 0 && (
              <span className="text-[11px] text-muted">No neighborhoods yet — add them under Admin → Neighborhoods.</span>
            )}
          </div>
        </Field>
        <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={hasCar} onChange={(e) => setHasCar(e.target.checked)} className="accent-forest h-4 w-4" /> Has car</label>
        <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={wantsSteadyPickup} onChange={(e) => setSteady(e.target.checked)} className="accent-forest h-4 w-4" /> Wants steady pickup</label>

        {/* Aug 29 (WA parity): contact channel selector. Volunteers are SMS
            or WhatsApp; admin/dispatcher role unlocks "both". */}
        <Field label="Contact channel" full>
          <div className="flex flex-wrap items-center gap-2">
            {(['sms', 'whatsapp'] as const).map((opt) => (
              <button key={opt} type="button" onClick={() => setContactChannel(opt)}
                      className={cx('rounded-[10px] border-[2px] px-3 py-1.5 text-[13px] font-bold',
                        contactChannel === opt ? 'bg-forest text-paper border-forest' : 'bg-paper text-ink border-line hover:border-forest')}>
                {opt === 'sms' ? 'SMS (text)' : 'WhatsApp'}
              </button>
            ))}
            {roleAllowsBoth && (
              <button type="button" onClick={() => setContactChannel('both')}
                      className={cx('rounded-[10px] border-[2px] px-3 py-1.5 text-[13px] font-bold',
                        contactChannel === 'both' ? 'bg-forest text-paper border-forest' : 'bg-paper text-ink border-line hover:border-forest')}>
                Both
              </button>
            )}
          </div>
          {contactChannel !== 'sms' && !optedInAt && (
            <p className="text-[11.5px] text-amber-700 italic mt-1">
              WhatsApp opt-in pending — saving will send a Yes/No welcome message on WhatsApp; they must tap Yes to receive further notifications.
            </p>
          )}
          {contactChannel !== 'sms' && optedInAt && (
            <p className="text-[11.5px] text-forest italic mt-1">
              ✓ WhatsApp opted in on {fmtDay(optedInAt)}.
            </p>
          )}
        </Field>
        {/* batch abc811 Aug 10 — two-field quiet-hours window (FROM/UNTIL).
            Wrap around midnight is supported (e.g. 11pm – 7am). */}
        <Field label="Quiet hours (NY time)" full>
          <div className="flex items-center gap-2 flex-wrap">
            <label className="flex items-center gap-1.5 text-[12px] font-semibold text-muted">
              From
              <input type="time" value={quietStart}
                     onChange={(e) => setQuietStart(e.target.value)}
                     className={inputCls + ' w-32'} />
            </label>
            <label className="flex items-center gap-1.5 text-[12px] font-semibold text-muted">
              Until
              <input type="time" value={quietEnd}
                     onChange={(e) => setQuietEnd(e.target.value)}
                     className={inputCls + ' w-32'} />
            </label>
            {(quietStart || quietEnd) ? (
              <button type="button" onClick={() => { setQuietStart(''); setQuietEnd(''); }}
                      className="haptic text-[12px] font-bold text-clay border border-clay/40 px-2.5 py-1.5 rounded-[8px] hover:bg-clay/10">
                Clear
              </button>
            ) : (
              <span className="text-[12px] text-muted italic">Anytime OK</span>
            )}
          </div>
          <p className="text-[11px] text-muted italic mt-1">Auto-texts pause during this window. Wrap around midnight is supported (e.g. 11pm – 7am).</p>
        </Field>
      </div>
      {row && (
        <AccountLoginSection kind="volunteer" id={row.id} suggestedUsername={phonePrimary || ''} />
      )}
      {row?.intakePayload && (
        <IntakeInfoCard payload={row.intakePayload} receivedAt={row.intakeReceivedAt} kind="volunteer" />
      )}
      {row && (
        <ContactRecruitingHistory targetType="volunteer" targetId={row.id} targetName={`${row.firstName} ${row.lastName}`} />
      )}
      {row && (
        <GiftsHistory targetType="volunteer" targetId={row.id} targetName={`${row.firstName} ${row.lastName}`} />
      )}
      {(save.error || del.error) && <p className="text-clay text-[12px] mt-3">{((save.error || del.error) as Error).message}</p>}
      <div className="flex items-center justify-between mt-4">
        {row && isOfficeOnly() ? (
          <button onClick={() => { void uiConfirm(`Hide ${row.firstName} from the roster? (Soft delete)`).then((ok) => { if (ok) { del.mutate(); } }); }}
                  className="haptic flex items-center gap-1.5 text-clay text-[12.5px] font-bold border border-clay/40 px-3 py-2 rounded-[10px] hover:bg-clay-soft">
            <Trash2 size={13} /> {del.isPending ? 'Deleting…' : 'Remove'}
          </button>
        ) : <span />}
        <div className="flex gap-2">
          <Button size="sm" variant="plain" onClick={onCancel}>Cancel</Button>
          <Button size="sm" loading={save.isPending} onClick={() => save.mutate()}>{row ? 'Save' : 'Create'}</Button>
        </div>
      </div>
    </Modal>
  );
}

// =============================== Steady pickups =============================

// Consolidated brief #13 (Aug 18): weekly recruiting / coverage grid. Shows
// every recurring slot with its coverage status so the office can distinguish
// "this week is covered" from "this slot has a committed steady driver."
// Oct 23 client: neater calendar — tap a card to open that steady pickup, one short line per card
// ("9:00 AM · The Hive"), Live Board colors instead of word tags, smaller cards, empty days hidden,
// "⚠️ 3 need driver" in the day header, filter chips dim the rest, phone = one day with ◀ ▶ / swipe.
function useNarrow(maxPx: number) {
  const mq = `(max-width: ${maxPx}px)`;
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(mq).matches);
  useEffect(() => {
    const m = window.matchMedia?.(mq);
    if (!m) return;
    const on = () => setNarrow(m.matches);
    on();
    m.addEventListener?.('change', on);
    return () => m.removeEventListener?.('change', on);
  }, [mq]);
  return narrow;
}
type CovFilter = 'all' | 'needs_steady_driver' | 'ending_soon' | 'future_scheduled' | 'temporarily_covered' | 'committed' | 'paused';
const CAL_KEY: Array<[CalColor, string]> = [
  ['green', 'Has a steady driver'], ['red', 'Needs a steady driver'], ['orange', 'Covered this week only'], ['grey', 'Paused or drop-off'],
];
function WeeklyCoveragePanel({ onOpen }: { onOpen?: (steadyId: number) => void }) {
  const q = useQuery({ queryKey: ['weekly-coverage'], queryFn: adminCRUD.steadyWeeklyCoverage, refetchInterval: 60_000 });
  const rows = q.data?.data ?? [];
  const [statusFilter, setStatusFilter] = useState<CovFilter>('all');
  const [query, setQuery] = useState('');
  const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const byDay = useMemo(() => groupByDay(rows), [rows]);
  const days = useMemo(() => visibleDays(byDay), [byDay]);
  const totals = useMemo(() => rows.reduce((m, r) => { m[r.coverage_status] = (m[r.coverage_status] ?? 0) + 1; return m; }, {} as Record<string, number>), [rows]);
  const hasFuture = (totals.future_scheduled ?? 0) > 0;
  const qq = query.trim().toLowerCase();
  const filterOn = statusFilter !== 'all' || !!qq;
  const matches = (r: (typeof rows)[number]) => {
    if (statusFilter !== 'all' && r.coverage_status !== statusFilter) return false;
    if (qq && !`${r.name ?? ''} ${r.suppliers ?? ''} ${(r.driver_names ?? []).join(' ')}`.toLowerCase().includes(qq)) return false;
    return true;
  };
  const narrow = useNarrow(1023); // phone / small tablet: one day at a time
  const todayDow = new Date(`${nyToday()}T12:00:00`).getDay();
  const [phoneDay, setPhoneDay] = useState<number | null>(null);
  const shownPhoneDay = phoneDay != null && days.includes(phoneDay) ? phoneDay : startDay(days, todayDow);
  const touchX = useRef<number | null>(null);

  const card = (r: (typeof rows)[number], dow: number) => {
    const color = coverageColor(r);
    const tone = COLOR_CARD[color];
    const { title, sub } = cardNames(r.name, r.suppliers, tidyPlaceName);
    const drv = driversShort(r.driver_names);
    const ending = r.coverage_status === 'ending_soon';
    const drop = isDropOffRow(r);
    const second = [drv, sub].filter(Boolean).join(' · ');
    const dim = filterOn && !matches(r);
    const hit = filterOn && !dim;
    const tip = [
      `${r.candle ? r.candle.text : shortTime(r.pickup_time)} ${r.name ?? ''}`.trim(), // Oct 23 client: candle lighting
      r.suppliers && r.suppliers !== r.name ? `Store: ${r.suppliers}` : '',
      coverageLabel(r.coverage_status) + (drop ? ' · Drop-off (only counts when they show up)' : ''),
      (r.driver_names ?? []).length ? `Driver: ${(r.driver_names ?? []).join(', ')}` : '',
      onOpen ? 'Click to open' : '',
    ].filter(Boolean).join('\n');
    return (
      <button key={`${r.steady_pickup_id}-${dow}`} type="button" title={tip}
              data-cal-card={color} data-status={r.coverage_status} data-dim={dim ? '1' : undefined}
              onClick={onOpen ? () => onOpen(r.steady_pickup_id) : undefined}
              className={cx('relative block w-full text-left rounded-[7px] border overflow-hidden pl-2.5 pr-1.5 py-[3px] leading-tight transition-opacity',
                            tone.card, onOpen ? 'cursor-pointer hover:brightness-[.97]' : 'cursor-default',
                            hit && 'ring-2 ring-forest/70')}
              style={dim ? { opacity: 0.25 } : undefined}>
        <span aria-hidden className={cx('absolute left-0 top-0 bottom-0 w-[4px]', tone.bar)} />
        <div className="flex items-baseline gap-1 min-w-0 text-[12px]">
          <span className="shrink-0 tabular-nums text-muted font-semibold text-[11px]">{r.candle?.time ? `🕯️ ${shortTime(r.candle.time)}` : (shortTime(r.pickup_time) || '—')}</span>
          <span className="text-muted">·</span>
          <span className="font-bold text-ink truncate">{title}</span>
          {ending && <span className="shrink-0 ml-auto" aria-label="Ending soon">⏳</span>}
        </div>
        {r.candle && <div data-candle className="text-[10.5px] truncate font-semibold text-amber-700 dark:text-amber-400">{r.candle.label}</div>}
        {second && <div className={cx('text-[10.5px] truncate', drv ? 'text-forest-deep' : 'text-muted')}>{second}</div>}
      </button>
    );
  };
  const dayCol = (dow: number, phone = false) => {
    const list = byDay[dow] ?? [];
    const need = needCount(list);
    return (
      <div key={dow} className={cx(!phone && 'border-l border-line first:border-l-0 min-w-0')}>
        {!phone && (
          <div className="px-2 py-1.5 text-[11px] font-extrabold uppercase tracking-wider text-forest bg-cream/30 whitespace-nowrap overflow-hidden text-ellipsis" title={dayHeader(DAY_ABBR[dow]!, list)}>
            {DAY_ABBR[dow]} <span className="text-muted font-semibold">· {list.length}</span>
            {need > 0 && <span className="text-red-700 dark:text-red-400 normal-case tracking-normal"> · ⚠️ {need} need driver</span>}
          </div>
        )}
        <div className="p-1.5 space-y-1">{list.map((r) => card(r, dow))}</div>
      </div>
    );
  };

  return (
    <div data-testid="steady-calendar" className="rounded-[14px] border border-line bg-paper overflow-hidden">
      <div className="px-4 py-3 border-b border-line flex items-center justify-between gap-3 flex-wrap">
        <div className="text-[13px] font-extrabold text-ink">Weekly coverage · recruiting view</div>
        <input value={query} onChange={(e) => setQuery(e.target.value)}
               placeholder="Search name, store or driver…"
               className="min-w-[180px] flex-1 rounded-[8px] border border-line px-2.5 py-1.5 text-[13px] outline-none focus:border-forest bg-paper" />
        {/* Oct 7 client: a clean picture of the pickups that need a steady driver, to put in an email. */}
        {/* Oct 27 client: a day someone took just this week still has no STEADY driver — it belongs on the recruiting flyer (Hive Friday was left off). */}
        <button type="button" onClick={() => void downloadNeededCalendar(rows.filter((r) => FLYER_STATUSES.has(String(r.coverage_status))))}
                disabled={!rows.some((r) => FLYER_STATUSES.has(String(r.coverage_status)))}
                className="haptic shrink-0 px-3 py-1.5 rounded-[8px] border border-forest text-forest text-[12.5px] font-bold hover:bg-sage disabled:opacity-40">
          ⬇ Download flyer · steady pickups needed
        </button>
      </div>
      <div className="px-4 py-2 border-b border-line flex flex-wrap gap-1.5">
        {(['all', 'needs_steady_driver', 'ending_soon', 'temporarily_covered', 'future_scheduled', 'committed', 'paused'] as const).map((s) => (
          <button key={s} type="button" onClick={() => setStatusFilter((cur) => (cur === s ? 'all' : s))} data-chip={s}
                  className={cx('px-2.5 py-1 rounded-full text-[11.5px] font-bold border',
                    statusFilter === s ? 'bg-forest text-paper border-forest' : 'bg-paper text-muted border-line hover:text-ink')}>
            {s === 'all' ? 'All' : coverageLabel(s)}
            {s !== 'all' && totals[s] ? <span className="ml-1 opacity-70">· {totals[s]}</span> : null}
          </button>
        ))}
      </div>
      <div className="px-4 py-1.5 border-b border-line flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
        {CAL_KEY.map(([c, l]) => (
          <span key={c} className="inline-flex items-center gap-1"><span className={cx('inline-block w-2.5 h-2.5 rounded-[3px]', COLOR_CARD[c].bar)} />{l}</span>
        ))}
        {hasFuture && <span className="inline-flex items-center gap-1"><span className={cx('inline-block w-2.5 h-2.5 rounded-[3px] border border-line-2', COLOR_CARD.neutral.bar)} />A driver starts later</span>}
        <span>⏳ Ending soon</span>
        {onOpen && <span className="ml-auto italic">{narrow ? 'Tap' : 'Click'} a card to open it</span>}
      </div>
      {q.isLoading && <div className="px-4 py-6 text-[13px] text-muted italic">Loading coverage…</div>}
      {!q.isLoading && rows.length === 0 && (
        <div className="px-4 py-6 text-[13px] text-muted italic text-center">No steady pickups yet.</div>
      )}
      {!q.isLoading && rows.length > 0 && filterOn && !rows.some(matches) && (
        <div className="px-4 py-2 text-[12px] text-muted italic text-center border-b border-line">No slots match this filter.</div>
      )}
      {!q.isLoading && rows.length > 0 && !narrow && (
        <div data-testid="steady-cal-week" className="grid" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
          {days.map((dow) => dayCol(dow))}
        </div>
      )}
      {!q.isLoading && rows.length > 0 && narrow && (
        <div data-testid="steady-cal-day"
             onTouchStart={(e) => { touchX.current = e.touches[0]?.clientX ?? null; }}
             onTouchEnd={(e) => {
               const x0 = touchX.current; touchX.current = null;
               const x1 = e.changedTouches[0]?.clientX;
               if (x0 == null || x1 == null || Math.abs(x1 - x0) < 50) return;
               setPhoneDay(stepDay(days, shownPhoneDay, x1 < x0 ? 1 : -1));
             }}>
          <div className="flex items-center justify-between gap-2 px-2 py-1.5 bg-cream/30 border-b border-line">
            <button type="button" aria-label="Previous day" onClick={() => setPhoneDay(stepDay(days, shownPhoneDay, -1))}
                    className="haptic grid h-8 w-8 place-items-center rounded-full border border-line bg-paper text-forest font-bold">◀</button>
            <div className="text-center min-w-0">
              <div className="text-[12.5px] font-extrabold uppercase tracking-wider text-forest">
                {DAY_ABBR[shownPhoneDay]}{shownPhoneDay === todayDow ? ' · today' : ''} <span className="text-muted font-semibold">· {(byDay[shownPhoneDay] ?? []).length}</span>
              </div>
              {needCount(byDay[shownPhoneDay] ?? []) > 0 && (
                <div className="text-[11.5px] font-bold text-red-700 dark:text-red-400">⚠️ {needCount(byDay[shownPhoneDay] ?? [])} need driver</div>
              )}
            </div>
            <button type="button" aria-label="Next day" onClick={() => setPhoneDay(stepDay(days, shownPhoneDay, 1))}
                    className="haptic grid h-8 w-8 place-items-center rounded-full border border-line bg-paper text-forest font-bold">▶</button>
          </div>
          {dayCol(shownPhoneDay, true)}
        </div>
      )}
    </div>
  );
}

// tier2 Aug 21 — normalise "who's assigned to this steady" across whatever
// shape the backend actually returns for it. Different backend revisions have
// shipped this as `volunteer_names` (string[]), `volunteers` (either a joined
// string or an array of {first_name,last_name} objects), `drivers` (same),
// `default_drivers` (joined objects with first_name/last_name), or
// `assignments` (per-day objects). We accept them all so both the search and
// the row rendering keep working through backend drift.
function driverNamesForSteady(p: any): string[] {
  const asName = (v: any): string => {
    if (v == null) return '';
    if (typeof v === 'string') return v;
    if (typeof v === 'object') {
      const fn = v.first_name ?? v.firstName ?? '';
      const ln = v.last_name  ?? v.lastName  ?? '';
      const nm = `${fn} ${ln}`.trim();
      if (nm) return nm;
      return String(v.name ?? '').trim();
    }
    return String(v);
  };
  const collect = (val: any): string[] => {
    if (val == null) return [];
    if (Array.isArray(val)) return val.map(asName).filter(Boolean);
    if (typeof val === 'string') return val.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
    return [];
  };
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (arr: string[]) => { for (const n of arr) { const k = n.toLowerCase(); if (n && !seen.has(k)) { seen.add(k); out.push(n); } } };
  push(collect(p?.volunteer_names));
  push(collect(p?.volunteers));
  push(collect(p?.drivers));
  push(collect(p?.driver_names));
  push(collect(p?.assigned_volunteers));
  push(collect(p?.assignments));
  push(collect(p?.default_drivers));
  return out;
}

export function SteadyPickupsPanel() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin-steady'], queryFn: adminCRUD.steady });
  const [editing, setEditing] = useState<any | 'new' | null>(null);
  const rows: any[] = q.data?.data ?? [];
  // Consolidated brief #5 (Aug 17): search/sort/filter across steady
  // templates. Search matches name, supplier, day names, and any assigned
  // volunteer name. Sort by name/day/supplier ascending or descending.
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'day' | 'supplier'>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  // Consolidated brief #2 (Aug 18): filter by template_status. 'all' shows
  // everything; the default 'active' matches the old behaviour (paused +
  // inactive were previously invisible via is_active gate).
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'paused' | 'inactive'>('active');
  // Oct 22 client: drop-off steady pickups ("only counts when they show up") have their own tab.
  const [kind, setKind] = useState<'regular' | 'dropoff'>('regular');
  const isDrop = (p: any) => String(p?.pickup_type ?? '') === 'dropoff';
  // Oct 30 client: 🏠 steady delivery to a family (shown with the regular steady pickups).
  const isSteadyDlv = (p: any) => String(p?.pickup_type ?? '') === 'delivery';
  const shortFrom = (a: unknown) => (!a || String(a) === OFFICE_ADDRESS ? '3 Regina' : String(a).replace(/,?\s*(NY|New York)\b.*$/i, '').trim());
  const dropCount = rows.filter((p) => isDrop(p) && (p.template_status ?? 'active') !== 'inactive').length;
  // tier3 Aug 23 — per-row busy set. Previously `setStatus` was one shared
  // mutation whose `isPending` flag couldn't distinguish which row was
  // in-flight, so clicking Pause on row A would leave Archive on row B fully
  // clickable and vice-versa. Track the pending row ids here and gate each
  // row's own action buttons individually.
  const [busySteady, setBusySteady] = useState<Set<number>>(new Set());
  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: 'active' | 'paused' | 'inactive' }) => {
      const r = await adminCRUD.setSteadyStatus(id, status);
      // Oct 2 client fix: archiving cancels already-generated open pickups
      // (without a driver); reactivating refreshes them.
      await api(`/api/steady-pickups/${id}/apply-to-future`, { method: 'POST', body: JSON.stringify({ fromDate: null }) });
      qc.invalidateQueries({ queryKey: ['admin-pickups'] });
      return r;
    },
    onMutate: ({ id }) => setBusySteady((s) => { const n = new Set(s); n.add(id); return n; }),
    onSettled: (_data, _err, vars) => {
      setBusySteady((s) => { const n = new Set(s); if (vars) n.delete(vars.id); return n; });
      qc.invalidateQueries({ queryKey: ['admin-steady'] });
    },
  });
  const _DOW_ORDER: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
  const filteredRows = useMemo(() => {
    const qq = query.trim().toLowerCase();
    const byKind = rows.filter((p) => isDrop(p) === (kind === 'dropoff'));
    const byStatus = statusFilter === 'all'
      ? byKind
      : byKind.filter((p) => (p.template_status ?? 'active') === statusFilter);
    const filtered = qq
      ? byStatus.filter((p) => {
          const hay = [
            p.name ?? '',
            p.suppliers ?? '',
            isSteadyDlv(p) ? `${p.delivery_label ?? ''} delivery` : '', // Oct 30 client
            (p.days ?? []).join(' '),
            // tier2 Aug 21 — the row ships assigned drivers under one of a
            // handful of shapes depending on backend build (volunteer_names,
            // volunteers, drivers, default_drivers, assignments). The prior
            // search only checked `volunteer_names` and silently missed
            // matches everywhere else. `driverNamesForSteady` collapses them
            // all so search matches whatever the row actually contains.
            driverNamesForSteady(p).join(' '),
          ].join(' ').toLowerCase();
          return hay.includes(qq);
        })
      : byStatus.slice();
    filtered.sort((a, b) => {
      let av = '', bv = '';
      if (sortBy === 'name')     { av = String(a.name ?? '').toLowerCase();      bv = String(b.name ?? '').toLowerCase(); }
      else if (sortBy === 'supplier') { av = String(a.suppliers ?? '').toLowerCase(); bv = String(b.suppliers ?? '').toLowerCase(); }
      else if (sortBy === 'day') {
        const ad = (a.days ?? [])[0] ?? '';
        const bd = (b.days ?? [])[0] ?? '';
        av = String(_DOW_ORDER[ad] ?? 99);
        bv = String(_DOW_ORDER[bd] ?? 99);
      }
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return filtered;
    // Bug 2 fix (Aug 19): statusFilter was missing from the deps array, so
    // switching to the Paused / Inactive tab did not recompute the filtered
    // list — the memo stayed stuck on the previously-rendered slice, which
    // read as "the Paused tab is broken and the button does nothing".
  }, [rows, query, sortBy, sortDir, statusFilter, kind]);

  return (
    <div className="space-y-3">
      {/* Oct 13 client: "New steady pickup" at the top right of the Steady tab (was below the coverage + link cards). */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-[11px] font-extrabold uppercase tracking-[.05em] text-muted">
          {filteredRows.length}{query ? ` of ${rows.length}` : ''} {kind === 'dropoff' ? 'drop-offs' : 'steady pickups'}
        </div>
        {isOfficeOnly()
          ? <Button size="sm" variant="forest" icon={<Plus size={14} />} onClick={() => setEditing('new')}>New steady pickup</Button>
          : <span className="text-[12px] text-muted">View only. To add or change a steady pickup, ask the office.</span>}{/* Oct 21 client */}
      </div>
      {/* Oct 22 client: regular steady pickups vs drop-offs (they come when they have food). */}
      <div data-steady-kind className="flex items-center gap-1.5 border-b border-line">
        {([['regular', 'Steady pickups'], ['dropoff', `Drop-offs (when they have food)${dropCount ? ` · ${dropCount}` : ''}`]] as const).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setKind(k)}
                  className={cx('haptic px-3 py-2 text-[13px] font-bold border-b-2 -mb-px whitespace-nowrap',
                                kind === k ? 'border-forest text-forest' : 'border-transparent text-muted hover:text-ink')}>{l}</button>
        ))}
      </div>
      {kind === 'dropoff' && (
        <div className="rounded-[12px] border border-line bg-cream/50 px-3 py-2 text-[12.5px] text-muted">
          Places that come only when they have extra food (for example a school). No one is texted to go. When someone signs in at the kiosk for the place, it counts as a drop-off. Set days are optional; a set day nobody came is just "no drop-off", not missed.
        </div>
      )}
      {/* Oct 23 client: tap a card in the calendar to open that steady pickup (office, same as the list's ✏️). */}
      {kind === 'regular' && <WeeklyCoveragePanel onOpen={isOfficeOnly() ? (id) => { const p = rows.find((x) => Number(x.id) === Number(id)); if (p) setEditing(p); } : undefined} />}
      {kind === 'regular' && <RegistrationLinkCard kind="steady-pickup" />}
      {kind === 'regular' && <RegistrationLinkCard kind="one-time-pickup" />}
      <div className="flex items-center gap-2 flex-wrap">
        <input value={query} onChange={(e) => setQuery(e.target.value)}
               placeholder="Search name, supplier, volunteer, day…"
               className="flex-1 min-w-[180px] rounded-[8px] border border-line px-2.5 py-1.5 text-[13px] bg-paper outline-none focus:border-forest" />
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)}
                className="rounded-[8px] border border-line px-2 py-1.5 text-[12.5px] bg-paper">
          <option value="name">Sort: Name</option>
          <option value="day">Sort: Day</option>
          <option value="supplier">Sort: Supplier</option>
        </select>
        <button type="button" onClick={() => setSortDir((d) => d === 'asc' ? 'desc' : 'asc')}
                className="rounded-[8px] border border-line px-2 py-1.5 text-[12.5px] bg-paper font-bold"
                title="Toggle sort direction">
          {sortDir === 'asc' ? 'A→Z' : 'Z→A'}
        </button>
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        {(['all', 'active', ...(rows.some((r) => r.template_status === 'paused') ? ['paused' as const] : []), 'inactive'] as const).map((s) => (
          <button key={s} type="button" onClick={() => setStatusFilter(s)}
                  className={cx('px-2.5 py-1 rounded-full text-[11.5px] font-bold border capitalize',
                    statusFilter === s
                      ? 'bg-forest text-paper border-forest'
                      : 'bg-paper text-muted border-line hover:text-ink')}>
            {s === 'inactive' ? 'archived' : s}
          </button>
        ))}
      </div>
      {q.isLoading ? <div className="text-[13px] text-muted">Loading…</div> :
       rows.length === 0 ? <div className="text-[13px] text-muted">No steady pickups yet. Create one to generate weekly occurrences.</div> :
       filteredRows.length === 0 ? <div className="text-[13px] text-muted italic">{kind === 'dropoff' && !query.trim() ? 'No drop-offs yet. Tick "Only counts when they show up" on a steady pickup to list it here.' : `No steady pickups match "${query}".`}</div> :
       <div className="space-y-2">
         {filteredRows.map((p) => {
           const ts = String(p.template_status ?? 'active');
           const pillCls =
             ts === 'active'   ? 'bg-sage text-forest'
             : ts === 'paused' ? 'bg-amber/20 text-amber-700'
             :                   'bg-muted/15 text-muted';
           return (
             <div key={p.id} className={cx('border border-line bg-paper rounded-[14px] px-4 py-3 flex items-center justify-between gap-3', ts !== 'active' && 'opacity-70')}>
               <div className="min-w-0 flex items-center gap-2">
                 <span className={cx('px-2 py-0.5 rounded-full text-[10.5px] font-extrabold uppercase tracking-wider shrink-0', pillCls)}>{ts}</span>
                 {isDrop(p) && <span className="px-2 py-0.5 rounded-full text-[10.5px] font-extrabold uppercase tracking-wider shrink-0 bg-line/60 text-muted" title="Only counts when they show up. Not texted to drivers.">Drop-off</span>}
                 {/* Oct 30 client: 🏠 steady delivery to a family — first name / town only in the list. */}
                 {isSteadyDlv(p) && <span data-steady-delivery-tag className="px-2 py-0.5 rounded-full text-[10.5px] font-extrabold uppercase tracking-wider shrink-0 bg-sage text-forest" title="Delivery from the center to a family">🏠 Delivery</span>}
                 <div className="min-w-0">
                   <div className="font-bold text-[13.5px] truncate">{isSteadyDlv(p) ? (p.delivery_label || 'Delivery to a family') : p.name}</div>
                   {isDrop(p) ? (
                     <div className="text-[11px] text-muted truncate" data-dropoff-stats>
                       {/* Oct 29 client: drop-off places: how often they came, not days / time */}
                       {dropOffStatsText(p)}{p.days?.length ? ` · usually ${p.days.map((d: string) => d.slice(0, 1).toUpperCase() + d.slice(1, 3)).join(', ')}` : ''} · {p.suppliers || 'no store'}
                     </div>
                   ) : (
                   <div className="text-[11px] text-muted truncate">
                     {p.days?.join(', ') ?? '—'} · {steadyTimeText(fmtTime(p.pickup_time?.slice(0, 5)) || '—', p.candle, (Number(p.days_of_week_mask ?? 0) & ~32) !== 0) /* Oct 23 client: candle lighting */} · {isSteadyDlv(p) ? `from ${shortFrom(p.delivery_from)}` : (p.suppliers || 'no supplier')}
                   </div>
                   )}
                   {/* tier2 Aug 21 — surface who's on the template. Data comes
                       from the /api/steady-pickups payload; the panel used to
                       silently drop it. If the backend didn't ship any name
                       for this row, hide the line so we don't paint an empty
                       stub. */}
                   {(() => {
                     const drivers = driverNamesForSteady(p);
                     if (drivers.length === 0) return null;
                     return (
                       <div className="text-[11px] text-forest-deep truncate mt-0.5">
                         <span className="text-muted font-semibold">Drivers:</span>{' '}
                         {drivers.join(', ')}
                       </div>
                     );
                   })()}
                 </div>
               </div>
               {isOfficeOnly() && (() => { // Oct 21 client: Archive / Reactivate / Edit = office only
                 const rowBusy = busySteady.has(p.id);
                 return (
               <div className="flex items-center gap-1.5 shrink-0">
                 {/* Oct 2 client fix (UI plan §3): Pause removed — use Archive. */}
                 {ts === 'paused' && (
                   <button onClick={() => setStatus.mutate({ id: p.id, status: 'active' })}
                           disabled={rowBusy}
                           className="haptic text-[11.5px] font-bold text-forest hover:bg-sage px-2 py-1 rounded-full disabled:opacity-40 disabled:cursor-not-allowed">
                     Resume
                   </button>
                 )}
                 {ts !== 'inactive' ? (
                   <button onClick={() => setStatus.mutate({ id: p.id, status: 'inactive' })}
                           disabled={rowBusy}
                           className="haptic text-[11.5px] font-bold text-muted hover:text-clay hover:bg-clay/10 px-2 py-1 rounded-full disabled:opacity-40 disabled:cursor-not-allowed"
                           title="Deactivate — archive; hides from lists unless filter is Inactive/All">
                     Archive
                   </button>
                 ) : (
                   <button onClick={() => setStatus.mutate({ id: p.id, status: 'active' })}
                           disabled={rowBusy}
                           className="haptic text-[11.5px] font-bold text-forest hover:bg-sage px-2 py-1 rounded-full disabled:opacity-40 disabled:cursor-not-allowed">
                     Reactivate
                   </button>
                 )}
                 <button onClick={() => setEditing(p)} disabled={rowBusy}
                         className="haptic grid h-8 w-8 place-items-center rounded-full bg-sage text-forest hover:bg-sage-line disabled:opacity-40 disabled:cursor-not-allowed"><Pencil size={14} /></button>
               </div>
                 );
               })()}
             </div>
           );
         })}
       </div>}
      {editing && <SteadyForm row={editing === 'new' ? null : editing} dropOff={kind === 'dropoff'} onDone={() => { setEditing(null); qc.invalidateQueries({ queryKey: ['admin-steady'] }); qc.invalidateQueries({ queryKey: ['admin-pickups'] }); }} onCancel={() => setEditing(null)} />}
    </div>
  );
}

/** Oct 29 client: Drop-offs tab line, e.g. "3 drop-offs this month · last: Tue Oct 27, 2:10 PM". */
export function dropOffStatsText(p: { dropoffs_this_month?: number | string | null; last_dropoff_at?: string | null }): string {
  const n = Number(p.dropoffs_this_month ?? 0) || 0;
  const head = `${n} drop-off${n === 1 ? '' : 's'} this month`;
  // Postgres text ("2026-10-27 18:10:03.53+00") → ISO, so every browser reads it.
  const iso = String(p.last_dropoff_at ?? '').trim().replace(' ', 'T').replace(/(\.\d{3})\d+/, '$1').replace(/([+-]\d{2})$/, '$1:00');
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return `${head} · none yet`;
  const day = d.toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric' }).replace(/,/g, '');
  const time = d.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' });
  return `${head} · last: ${day}, ${time}`;
}

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
export function SteadyForm({ row, applyFrom, onDone, onCancel, dropOff }: { row: any | null; applyFrom?: string | null; onDone: () => void; onCancel: () => void; dropOff?: boolean }) {
  // Oct 13 client: "Text the store: do you have food today?" (off by default, saved per steady).
  const foodCheck = useFoodCheckSetting(row?.id ?? null);
  // Oct 23 client: "2 hours before candle lighting" on Fridays / erev Yom Tov (saved per steady).
  const candle = useCandleSetting(row?.id ?? null);
  const [name, setName] = useState(row?.name ?? '');
  // Oct 29 client: a drop-off place may have no time (saved as 00:00, shown blank).
  const [pickupTime, setTime] = useState(() => {
    const isDropRow = row ? String(row.pickup_type ?? '') === 'dropoff' : !!dropOff;
    const t = String(row?.pickup_time ?? (isDropRow ? '' : '14:00')).slice(0, 5);
    return isDropRow && t === '00:00' ? '' : t;
  });
  const [days, setDays] = useState<string[]>(row?.days ?? []);
  const candlePrev = useCandlePreview(candle.value.offsetMin, candle.value.on, candle.value.eveYomTov);
  // Friday-only candle steady: its fixed time (used only on a Friday that is Yom Tov) = this Friday's time.
  const candleFriOnly = candle.value.on && days.length > 0 && days.every((d) => d === 'friday');
  const savePickupTime = candleFriOnly && candlePrev.data?.data.thisFriday ? candlePrev.data.data.thisFriday.time : pickupTime;
  const [supplierId, setSupplierId] = useState<string>(row?.supplier_id ? String(row.supplier_id) : '');
  // Nov 5 client: "I want it in the steady profile. Each steady should have this." (off by default)
  const storeReminder = useSteadyStoreReminder(row?.id ?? null, supplierId);
  // Fork M · client Aug 6 — reminder + unassigned auto-broadcast toggles.
  // Oct 22 client: "Only counts when they show up" (drop-off when they have food) — never texted, reminders off by default.
  const [dropOffOnly, setDropOffOnly] = useState<boolean>(row ? String(row.pickup_type ?? '') === 'dropoff' : !!dropOff);
  // Oct 30 client: 🏠 steady delivery to a family — from the center (editable) to a saved family, same picker
  // as a one-time delivery. No store, no "ask the store", no drop-off box. Days / time / drivers as usual.
  const [isDelivery, setIsDelivery] = useState<boolean>(row ? String(row.pickup_type ?? '') === 'delivery' : false);
  const [familyId, setFamilyId] = useState<number | ''>(row?.delivery_recipient_id ? Number(row.delivery_recipient_id) : '');
  const [deliveryFrom, setDeliveryFrom] = useState<string>(row?.delivery_from ?? OFFICE_ADDRESS);
  const [reminderEnabled, setReminderEnabled]         = useState<boolean>(row?.reminder_enabled ?? !dropOff);
  const [reminderMinutes, setReminderMinutes]         = useState<number>(row?.reminder_minutes_before ?? 60);
  const [autoBroadcastEnabled] = useState<boolean>(row?.auto_broadcast_enabled ?? true);
  const [autoBroadcastMinutes] = useState<number>(row?.auto_broadcast_minutes_before ?? 30);
  // Fork S · client Aug 7 — occasional pickup that needs dispatcher confirmation
  // per-day. When enabled, materialized pickup_instances land in
  // status='pending_confirmation' and appear on the Live Board's "Needs
  // confirmation" pinned block until Confirm or Decline is clicked.
  const [needsConfirmation, setNeedsConfirmation] = useState<boolean>(row?.needs_confirmation ?? false);
  const [confirmationLead, setConfirmationLead]   = useState<number>(row?.confirmation_lead_minutes ?? 240);
  // Client Aug 7 item 1 — steady contact/access details that propagate onto
  // every generated pickup_instance (and into the driver TY body).
  const [contactName, setContactName]   = useState<string>(row?.contact_name ?? '');
  const [contactPhone, setContactPhone] = useState<string>(row?.contact_phone ?? '');
  const [pickupInstr, setPickupInstr]   = useState<string>(row?.pickup_instructions ?? '');
  // batch abc799 Aug 9 — steady templates can require >1 driver, and the
  // permanently-assigned driver set is a multi-picker (replaces the legacy
  // single volunteerId path in the UI; server accepts both for back-compat).
  const [driversNeeded, setDriversNeeded] = useState<number>(row?.drivers_needed ?? 1);
  const [assignedIds, setAssignedIds]     = useState<Array<number | ''>>(() => {
    const arr = (row?.volunteer_ids ?? []) as any[];
    const clean = arr.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n > 0);
    return clean.length > 0 ? clean : [''];
  });
  const qc = useQueryClient();
  const suppliers = useQuery({ queryKey: ['admin-suppliers'], queryFn: () => api<{ data: any[] }>('/api/suppliers?limit=500&logo=url') });
  const [showNewSupplier, setShowNewSupplier] = useState(false);

  // Fork J · client Aug 4 — per-day default drivers. Map dow(0-6) → volunteerId ('' = unset).
  const volunteersQ = useQuery({ queryKey: ['admin-volunteers'], queryFn: () => api<{ data: any[] }>('/api/volunteers?limit=500') });
  // Oct 29 client: roles — people with 📅 Steady off show last, greyed, in the steady driver pickers (nobody is removed).
  const rolesQ = usePersonRoles();
  const notSteady = useMemo(() => new Set(Object.entries(rolesQ.data?.data.roles ?? {}).filter(([, r]) => !r.steady).map(([k]) => Number(k))), [rolesQ.data]);
  const steadyVols = useMemo(() => [...(volunteersQ.data?.data ?? [])].sort((a: any, b: any) => Number(notSteady.has(Number(a.id))) - Number(notSteady.has(Number(b.id)))), [volunteersQ.data, notSteady]);
  const existingDefaultsQ = useQuery({
    queryKey: ['steady-default-drivers', row?.id],
    queryFn: () => adminCRUD.steadyDefaultDrivers.list(row!.id),
    enabled: !!row?.id,
  });
  // Consolidated brief #10 (Aug 18): recommended drivers — dispatcher-only
  // suggestions surfaced when coverage is needed. No auto-assignment.
  const existingRecommendedQ = useQuery({
    queryKey: ['steady-recommended-drivers', row?.id],
    queryFn: () => adminCRUD.steadyRecommendedDrivers.list(row!.id),
    enabled: !!row?.id,
  });
  const [recommendedIds, setRecommendedIds] = useState<number[]>([]);
  useEffect(() => {
    setRecommendedIds((existingRecommendedQ.data?.data ?? []).map((r) => Number(r.volunteer_id)).filter(Boolean));
  }, [existingRecommendedQ.data]);
  const [defaultDrivers, setDefaultDrivers] = useState<Record<number, string>>({});
  // Consolidated brief #3 (Aug 18): each per-day pick carries optional dates
  // so "one driver until Sept 25, another starts Sept 25" is expressible
  // without hard-deleting rows. Blank = open-ended in that direction.
  const [perDayFrom, setPerDayFrom] = useState<Record<number, string>>({});
  const [perDayTo,   setPerDayTo]   = useState<Record<number, string>>({});
  // abc870 (Aug 17): when the client uses different regulars per day, the
  // per-day picker below writes into steady_pickup_default_drivers; the
  // materializer already honors these on generation. Default this toggle ON
  // when the loaded template already has per-day assignments so an edit
  // doesn't silently collapse them into the flat list.
  const [perDayMode, setPerDayMode] = useState<boolean>(false);
  useEffect(() => {
    const map: Record<number, string> = {};
    const from: Record<number, string> = {};
    const to:   Record<number, string> = {};
    for (const r of (existingDefaultsQ.data?.data ?? [])) {
      map[r.day_of_week] = String(r.volunteer_id);
      if (r.effective_from) from[r.day_of_week] = String(r.effective_from).slice(0, 10);
      if (r.effective_to)   to[r.day_of_week]   = String(r.effective_to).slice(0, 10);
    }
    setDefaultDrivers(map);
    setPerDayFrom(from);
    setPerDayTo(to);
    if (Object.keys(map).length > 0) setPerDayMode(true);
  }, [existingDefaultsQ.data]);
  // day-of-week ordering (Sun=0..Sat=6). Show per-day pickers only for days
  // the template actually runs on.
  const _DOW_LABELS: Array<[string, number]> = [
    ['Sun', 0], ['Mon', 1], ['Tue', 2], ['Wed', 3], ['Thu', 4], ['Fri', 5], ['Sat', 6],
  ];

  function toggleDay(d: string) { setDays((arr) => arr.includes(d) ? arr.filter((x) => x !== d) : [...arr, d]); }

  // Oct 29 client: say exactly which fields are missing. Drop-off places ("Only counts when they show up")
  // don't need days or a time ("we should still have the option of selecting days, but we should not have to").
  const miss = useMissingFields([
    { key: 'steady-store', label: 'Store', message: 'Store or place is needed', ok: isDelivery || !!supplierId || !!row?.supplier_id },
    { key: 'steady-family', label: 'Family', message: 'Pick the family this delivery goes to', ok: !isDelivery || typeof familyId === 'number' }, // Oct 30 client
    { key: 'steady-days', label: 'Days', message: 'Pick at least one day', ok: dropOffOnly || days.length > 0 },
    { key: 'steady-time', label: 'Time', message: 'Pick a time', ok: dropOffOnly || candle.value.on || !!pickupTime },
  ]);

  const save = useMutation({
    mutationFn: async () => {
      // abc870 (Aug 17): the two driver-assignment modes are mutually
      // exclusive. In per-day mode the flat volunteerIds list is intentionally
      // wiped so the materializer's flat-insert doesn't add unwanted co-drivers
      // to every day; per-day-only entries feed the DOW-scoped insert. In
      // same-driver mode the reverse: default_drivers is cleared to a single
      // canonical source of truth.
      if (!candle.valid) throw new Error('Before candle lighting: at least 30 minutes (and at most 10 hours).'); // Oct 23 client
      const flatIds = assignedIds.map((v) => Number(v)).filter((n) => Number.isInteger(n) && n > 0);
      const perDay = Object.entries(defaultDrivers)
        .filter(([dow, vid]) => vid !== '' && days.includes(DAYS[Number(dow)]))
        .map(([dow, vid]) => ({
          dayOfWeek:     Number(dow),
          volunteerId:   Number(vid),
          effectiveFrom: perDayFrom[Number(dow)] ? perDayFrom[Number(dow)] : null,
          effectiveTo:   perDayTo[Number(dow)]   ? perDayTo[Number(dow)]   : null,
        }));
      const extra = {
        reminderEnabled, reminderMinutesBefore: Number(reminderMinutes),
        // Oct 22 client: drop-off steady pickup. Oct 30 client: 🏠 steady delivery to a family.
        pickupType: isDelivery ? 'delivery' : dropOffOnly ? 'dropoff' : 'steady',
        ...(isDelivery ? { deliveryRecipientId: typeof familyId === 'number' ? familyId : null, deliveryFrom: deliveryFrom.trim() || OFFICE_ADDRESS } : {}),
        autoBroadcastEnabled, autoBroadcastMinutesBefore: Number(autoBroadcastMinutes),
        needsConfirmation, confirmationLeadMinutes: Number(confirmationLead),
        // A delivery's phone is the family's (sent only to the driver who takes it).
        contactName: isDelivery ? null : (contactName || null),
        contactPhone: isDelivery ? null : (contactPhone || null),
        pickupInstructions: pickupInstr || null,
        driversNeeded: Number(driversNeeded) || 1,
        volunteerIds: perDayMode ? [] : flatIds,
      };
      // Oct 29 client: a drop-off place saved without a time keeps 00:00 (shown blank).
      const timeToSave = dropOffOnly && !savePickupTime ? '00:00' : savePickupTime;
      if (isDelivery && typeof familyId !== 'number') throw new Error('Pick the family this delivery goes to (or add a new family).'); // Oct 30 client
      const supToSave = isDelivery ? undefined : (supplierId ? Number(supplierId) : undefined); // a delivery has no store (server clears it)
      const savedRes = row
        ? await adminCRUD.patchSteady(row.id, { name, pickupTime: timeToSave, days, supplierId: supToSave, ...extra })
        : await adminCRUD.createSteady({ name, pickupTime: timeToSave, days, supplierId: supToSave, ...extra });
      const savedId = (savedRes as any)?.data?.id ?? row?.id;
      // Oct 22 client: ticking "Only counts when they show up" turns this place's past missed days
      // (last 60 days, nobody came) into "No drop-off today". Tell the office how many.
      const relabeled = Number((savedRes as any)?.dropoffRelabeled ?? 0);
      if (relabeled > 0) {
        alert(`Ticked. ${relabeled} past missed day${relabeled === 1 ? '' : 's'} for ${name.trim() || 'this place'} ${relabeled === 1 ? 'was' : 'were'} changed to "No drop-off today".`);
      }
      if (savedId) {
        // Oct 20 client (speed): independent saves, sent together (were one after another).
        await Promise.all([
          adminCRUD.steadyDefaultDrivers.replace(Number(savedId), perDayMode ? perDay : []),
          // Consolidated brief #10 (Aug 18): persist recommended drivers.
          adminCRUD.steadyRecommendedDrivers.replace(Number(savedId), recommendedIds),
          foodCheck.save(Number(savedId)), // Oct 13 client
          candle.save(Number(savedId)), // Oct 23 client (before apply-to-future below, which uses it)
          storeReminder.save(Number(savedId)), // Nov 5 client
        ]);
      }
      // Oct 2 client fix (UI plan §3): push the edited template onto pickups
      // that were already generated (the materializer runs 21 days ahead and
      // never revisits them). applyFrom = "this and all future" date; omitted
      // = "complete recurring schedule" (from today).
      if (row && savedId) {
        const r = await api<{ data: { updated: number; cancelled: number; offScheduleWithDriver: number; refilled?: number } }>(
          `/api/steady-pickups/${Number(savedId)}/apply-to-future`,
          { method: 'POST', body: JSON.stringify({ fromDate: applyFrom ?? null }) });
        const a = r.data;
        const back = Number(a.refilled ?? 0); // Oct 30 client (Hatzlacha): days cancelled earlier, on the schedule again
        if (a.cancelled > 0 || a.offScheduleWithDriver > 0 || back > 0) {
          alert(`Schedule saved. ${a.updated} upcoming pickup(s) updated.`
            + (back > 0 ? `\n${back} day(s) cancelled earlier are back on the schedule.` : '')
            + (a.cancelled > 0 ? `\n${a.cancelled} upcoming pickup(s) no longer on the schedule were cancelled.` : '')
            + (a.offScheduleWithDriver > 0 ? `\n${a.offScheduleWithDriver} pickup(s) no longer on the schedule still have a driver — please review them in Pickups.` : ''));
        }
      }
      return savedRes;
    },
    onSuccess: onDone,
  });
  const del = useMutation({ mutationFn: () => adminCRUD.deleteSteady(row.id), onSuccess: onDone });

  return (
    <Modal title={row ? (applyFrom ? `Edit ${row.name} · from ${applyFrom} on` : `Edit ${row.name} · whole schedule`) : 'New steady pickup'} onClose={onCancel}>
      <div className="grid grid-cols-2 gap-3">
        {miss.summary && <div data-missing-summary className="col-span-2 rounded-[10px] border border-clay/50 bg-clay/10 px-3 py-2 text-[13px] font-bold text-clay">{miss.summary}</div>}
        <Field label="Name" full><input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder={isDelivery ? 'Leave blank for "Delivery to <first name>"' : 'e.g. "Hive Tuesday afternoon"'} /></Field>
        {/* Oct 30 client: 🏠 steady delivery to a family (from the center to a saved family). */}
        {!dropOffOnly && (
          <Field label="Delivery" full>
            <div data-steady-delivery className={cx('rounded-[10px] border px-3 py-2', isDelivery ? 'border-forest/50 bg-sage/40' : 'border-line bg-cream/30')}>
              <label className="flex items-center gap-2 text-[13px]">
                <input type="checkbox" className="accent-forest h-4 w-4"
                       checked={isDelivery}
                       onChange={(e) => {
                         const on = e.target.checked;
                         setIsDelivery(on);
                         if (on) { setDropOffOnly(false); if (foodCheck.value.on) foodCheck.change({ ...foodCheck.value, on: false }); }
                         if (on && !deliveryFrom.trim()) setDeliveryFrom(OFFICE_ADDRESS);
                       }} />
                <span className="font-bold">🏠 This is a delivery to a family</span>
              </label>
              <p className="text-[11.5px] text-muted mt-1.5">
                {isDelivery
                  ? 'Every day on the schedule is a delivery from the center to this family. Drivers see only the street until they take it; the driver who takes it gets the address, phone and notes and finishes it with DONE / Delivered.'
                  : 'For a family that gets food on set days (from the center, 3 Regina, unless you change it).'}
              </p>
            </div>
          </Field>
        )}
        {isDelivery && (
          <>
            <Field label="Deliver to (family)" full name="steady-family" error={miss.err('steady-family')}>
              <FamilyPicker value={familyId} onChange={setFamilyId} />
              <div className="text-[11.5px] text-muted italic mt-1">Drivers only see the street until they take it.</div>
            </Field>
            <Field label="From (pick up at)" full>
              <input value={deliveryFrom} onChange={(e) => setDeliveryFrom(e.target.value)} placeholder={OFFICE_ADDRESS} className={inputCls} />
            </Field>
          </>
        )}
        {/* Oct 29 client: the drop-off box first, so ticking it shows only what a drop-off place needs. */}
        {!isDelivery && (
        <Field label="Only counts when they show up" full>
          <div data-dropoff-only className={cx('rounded-[10px] border px-3 py-2', dropOffOnly ? 'border-forest/50 bg-sage/40' : 'border-line bg-cream/30')}>
            <label className="flex items-center gap-2 text-[13px]">
              <input type="checkbox" className="accent-forest h-4 w-4"
                     checked={dropOffOnly}
                     onChange={(e) => { setDropOffOnly(e.target.checked); if (e.target.checked) setReminderEnabled(false); }} />
              <span className="font-bold">Only counts when they show up (drop-off when they have food)</span>
            </label>
            <p className="text-[11.5px] text-muted mt-1.5">
              {dropOffOnly
                ? 'No one is texted to go. When someone signs in at the kiosk for this place, it counts as a drop-off (the kiosk makes it on the spot). Days and time are optional.'
                : "For places that come only when they have extra. No one is texted to go; days without a kiosk sign-in are just 'no drop-off', not missed."}
            </p>
          </div>
        </Field>
        )}
        <Field label="Pickup time" full name="steady-time" error={miss.err('steady-time')}
               hint={dropOffOnly ? 'Optional: only if they usually come at a set time' : undefined}>
          {/* Oct 23 client: fixed time, or before candle lighting (+ fixed time for other weekdays) */}
          {/* Oct 29 client: "you took away a lot of things" — the full time choice stays for drop-off places too */}
          <PickupTimeChoice value={candle.value} onChange={candle.change} pickupTime={pickupTime} onPickupTime={setTime} days={days} preview={candlePrev.data?.data} />
        </Field>
        {!isDelivery && (
        <Field label={dropOffOnly ? 'Store / place' : 'Supplier'} full name="steady-store" error={miss.err('steady-store')}>
          <div className="flex gap-2">
            <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={inputCls + ' flex-1'}>
              <option value="">{row ? '— Leave unchanged —' : '—'}</option>
              {suppliers.data?.data.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <button type="button" onClick={() => setShowNewSupplier(true)}
                    className="haptic shrink-0 rounded-[10px] border-2 border-forest bg-sage/40 text-forest font-bold text-[13px] px-3 py-2 hover:bg-sage/60 whitespace-nowrap">
              + Add new supplier
            </button>
          </div>
        </Field>
        )}
        <Field label="Days of the week" full name="steady-days" error={miss.err('steady-days')}
               hint={dropOffOnly ? 'Optional: only if they usually come on set days' : undefined}>
          <div className="flex flex-wrap gap-1.5">
            {DAYS.map((d) => (
              <button key={d} type="button" onClick={() => toggleDay(d)}
                      className={cx('chip', days.includes(d) && 'on')}>
                {d.slice(0, 3).toUpperCase()}
              </button>
            ))}
          </div>
        </Field>
        {/* Oct 30 client: a delivery's phone + notes come from the saved family (only to the driver who takes it). */}
        {!isDelivery && (<>
        <Field label="Contact name (goes to driver on accept)">
          <input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Person we can reach"
                 className={inputCls} />
        </Field>
        <Field label="Contact phone (goes to driver on accept)">
          <input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="(845) 555-1234"
                 className={inputCls} />
        </Field>
        </>)}
        <Field label={isDelivery ? 'Notes for the driver (shown only after they take it)' : 'Pickup instructions / access details (goes to driver on accept)'} full>
          <textarea rows={2} value={pickupInstr} onChange={(e) => setPickupInstr(e.target.value)}
                    placeholder={isDelivery ? 'e.g. "Two boxes from the fridge by the door."' : 'e.g. "Loading dock on the side. Ring the bell twice."'}
                    className={inputCls} />
        </Field>
        {/* Oct 29 client: "You took away options for drivers" — every setting stays visible, also for drop-off places. */}
        {(<>
        {/* batch abc799 Aug 9 — drivers_needed + multi-driver assignment. */}
        <Field label="Drivers needed">
          <input type="number" min={1} max={20} value={driversNeeded}
                 onChange={(e) => setDriversNeeded(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
                 className={inputCls + ' w-24 text-center'} />
          {/* Oct 23 client: a steady pickup set to 2 by mistake showed "needs 1 more" every day. */}
          {Number(driversNeeded) > 1 && (
            <span className="ml-2 text-[12px] font-semibold text-[#9a7415]" data-testid="drivers-needed-hint">Each day will ask for {Number(driversNeeded)} drivers.</span>
          )}
        </Field>
        <Field label="Assigned drivers (regulars)" full>
          <div className="rounded-[10px] border border-line bg-cream/30 divide-y divide-line">
            {/* abc870 (Aug 17): toggle between "same driver every day" (flat
                list → steady_pickup_volunteers) and "different driver each
                day" (per-DOW picker → steady_pickup_default_drivers). */}
            <div className="px-3 py-2 flex items-center gap-2 text-[12.5px] font-bold text-ink/80">
              <input type="checkbox" className="accent-forest h-3.5 w-3.5"
                     checked={perDayMode}
                     onChange={(e) => setPerDayMode(e.target.checked)} />
              <span>Different drivers per day of week</span>
            </div>
            {!perDayMode && assignedIds.map((vid, idx) => (
              <div key={idx} className="flex items-center gap-2 px-3 py-2">
                <div className="flex-1 min-w-0">
                  <VolunteerPicker
                    volunteers={steadyVols} dimIds={notSteady} dimNote="not Steady"
                    value={vid === '' ? '' : Number(vid)}
                    onChange={(n) => setAssignedIds((arr) => arr.map((x, i) => i === idx ? (n === '' ? '' : Number(n)) : x))}
                  />
                </div>
                {assignedIds.length > 1 && (
                  <button type="button"
                          onClick={() => setAssignedIds((arr) => arr.filter((_, i) => i !== idx))}
                          className="haptic grid h-8 w-8 place-items-center rounded-full bg-clay-soft text-clay hover:bg-clay/20"
                          title="Remove this driver">
                    <X size={13} />
                  </button>
                )}
              </div>
            ))}
            {!perDayMode && (
              <div className="px-3 py-2">
                <button type="button"
                        onClick={() => setAssignedIds((arr) => [...arr, ''])}
                        className="haptic text-[12px] font-bold text-forest flex items-center gap-1.5">
                  <Plus size={13} /> Add another driver
                </button>
              </div>
            )}
            {perDayMode && _DOW_LABELS.filter(([, dow]) => days.includes(DAYS[dow])).map(([label, dow]) => (
              <div key={dow} className="px-3 py-2 space-y-1.5">
                <div className="flex items-center gap-3">
                  <div className="w-14 text-[12.5px] font-extrabold uppercase tracking-wider text-forest shrink-0">{label}</div>
                  <div className="flex-1 min-w-0">
                    <VolunteerPicker
                      volunteers={steadyVols} dimIds={notSteady} dimNote="not Steady"
                      value={defaultDrivers[dow] ? Number(defaultDrivers[dow]) : ''}
                      onChange={(n) => setDefaultDrivers((m) => ({ ...m, [dow]: n === '' ? '' : String(n) }))}
                    />
                  </div>
                </div>
                {defaultDrivers[dow] && (
                  <div className="flex items-center gap-2 pl-[3.75rem] text-[11.5px] text-muted">
                    <span>From</span>
                    <input type="date" value={perDayFrom[dow] ?? ''}
                           onChange={(e) => setPerDayFrom((m) => ({ ...m, [dow]: e.target.value }))}
                           className="rounded-[6px] border border-line px-1.5 py-0.5 text-[11.5px] bg-paper" />
                    <span>Until</span>
                    <input type="date" value={perDayTo[dow] ?? ''}
                           onChange={(e) => setPerDayTo((m) => ({ ...m, [dow]: e.target.value }))}
                           className="rounded-[6px] border border-line px-1.5 py-0.5 text-[11.5px] bg-paper" />
                    <span className="italic text-muted/70">(blank = open-ended)</span>
                  </div>
                )}
              </div>
            ))}
            {perDayMode && days.length === 0 && (
              <p className="px-3 py-2 text-[12px] text-muted italic">Pick days of the week above first.</p>
            )}
            <p className="text-[11px] text-muted px-3 py-2 italic">
              {perDayMode
                ? 'Each generated pickup will be pre-assigned to the driver for that day.'
                : 'Every generated pickup will be pre-assigned to these drivers (status "assigned"). Set Drivers needed above to match how many should be on each occurrence.'}
            </p>
          </div>
        </Field>
        <Field label="Recommended drivers (shown first, tagged Recommended, when assigning a driver)" full>
          <div className="rounded-[10px] border border-line bg-cream/30 divide-y divide-line">
            {recommendedIds.map((vid, idx) => (
              <div key={idx} className="flex items-center gap-2 px-3 py-2">
                <div className="flex-1 min-w-0">
                  <VolunteerPicker
                    volunteers={steadyVols} dimIds={notSteady} dimNote="not Steady"
                    value={vid || ''}
                    onChange={(n) => setRecommendedIds((arr) => arr.map((x, i) => i === idx ? (Number(n) || 0) : x).filter(Boolean))}
                  />
                </div>
                <button type="button"
                        onClick={() => setRecommendedIds((arr) => arr.filter((_, i) => i !== idx))}
                        className="haptic grid h-8 w-8 place-items-center rounded-full bg-clay-soft text-clay hover:bg-clay/20"
                        title="Remove">
                  <X size={13} />
                </button>
              </div>
            ))}
            <div className="px-3 py-2">
              <button type="button"
                      onClick={() => setRecommendedIds((arr) => [...arr, 0])}
                      className="haptic text-[12px] font-bold text-forest flex items-center gap-1.5">
                <Plus size={13} /> Add a recommendation
              </button>
            </div>
            <p className="text-[11px] text-muted px-3 py-2 italic">
              Suggestions only — not auto-assigned. Shown to dispatchers when the pickup needs coverage so they can reach out.
            </p>
          </div>
        </Field>
        <Field label="Driver reminder SMS" full>
          <div className="rounded-[10px] border border-line bg-cream/30 px-3 py-2">
            <label className="flex items-center gap-2 text-[13px]">
              <input type="checkbox" className="accent-forest h-4 w-4"
                     checked={reminderEnabled}
                     onChange={(e) => setReminderEnabled(e.target.checked)} />
              <span>Text assigned drivers a reminder before the pickup</span>
            </label>
            <div className={cx('mt-2 flex items-center gap-2 text-[12.5px]', !reminderEnabled && 'opacity-40')}>
              <span>Send</span>
              <input type="number" min={0} max={1440} step={5} disabled={!reminderEnabled}
                     value={reminderMinutes}
                     onChange={(e) => setReminderMinutes(Number(e.target.value))}
                     className={inputCls + ' w-24 text-center'} />
              <span>minutes before start</span>
            </div>
            <p className="text-[11px] text-muted italic mt-2">
              Example: "Reminder about your weekly {name || 'Evergreen'} pickup on Monday at {pickupTime ? (() => { const [h, m] = pickupTime.split(':'); const hn = Number(h); return `${((hn + 11) % 12) + 1}:${m} ${hn >= 12 ? 'PM' : 'AM'}`; })() : '10:00 PM'}. Thanks!"
            </p>
          </div>
        </Field>
        {/* Oct 9 client: removed "Auto-broadcast if unassigned" — it did nothing (server switch off since Aug 19);
            a steady pickup with no driver is already in the open-pickup texts. Saved values are sent back unchanged. */}
        <Field label="Occasional / needs confirmation" full>
          <div className="rounded-[10px] border border-line bg-cream/30 px-3 py-2">
            <label className="flex items-center gap-2 text-[13px]">
              <input type="checkbox" className="accent-forest h-4 w-4"
                     checked={needsConfirmation}
                     onChange={(e) => setNeedsConfirmation(e.target.checked)} />
              <span>This is an occasional pickup — dispatch decides Yes/No each day</span>
            </label>
            <div className={cx('mt-2 flex items-center gap-2 text-[12.5px]', !needsConfirmation && 'opacity-40')}>
              <span>Remind dispatch</span>
              <input type="number" min={0} max={1440} step={30} disabled={!needsConfirmation}
                     value={confirmationLead}
                     onChange={(e) => setConfirmationLead(Number(e.target.value))}
                     className={inputCls + ' w-24 text-center'} />
              <span>minutes before start (one SMS to the office)</span>
            </div>
            <p className="text-[11px] text-muted italic mt-2">
              Days you didn't Confirm are cancelled automatically? <b>No.</b> They stay pinned on the Live Board until you Confirm or Decline. Confirm broadcasts to drivers; Decline cancels the day.
            </p>
          </div>
        </Field>
        {/* Oct 13 client: ask the store "food today?" — YES → drivers, NO → cancel today, no answer → office calls. */}
        {!isDelivery && ( /* Oct 30 client: a delivery has no store to ask */
        <Field label="Ask the store first" full>
          <FoodCheckBox value={foodCheck.value} onChange={foodCheck.change} pickupTime={savePickupTime} />
        </Field>
        )}
        {/* Nov 5 client: text the store a reminder before each pickup of this steady (moved here from the store profile). */}
        {!isDelivery && !dropOffOnly && (
        <Field label="Remind the store before pickup" full>
          <SteadyStoreReminderBox value={storeReminder.value} onChange={storeReminder.change} info={storeReminder.info} pickupTime={savePickupTime} />
        </Field>
        )}
        {/* Nov 6 Yakov: "pause his steady pickup — it should be open for others" (not his texts). */}
        {row?.id && !dropOffOnly && (
        <Field label="🚗 Usual driver off — open for others" full>
          <SteadyOpenBox steadyId={Number(row.id)} />
        </Field>
        )}
        <Field label="Default driver by day (auto-assigned when generated)" full>
          <div className="rounded-[10px] border border-line bg-cream/30 divide-y divide-line">
            {DOW_LABELS.map((lbl, dow) => {
              const activeDay = days.includes(DAYS[dow]);
              return (
                <div key={dow} className={cx('flex items-center gap-3 px-3 py-2', !activeDay && 'opacity-45')}>
                  <span className="w-10 font-bold text-[12.5px]">{lbl}</span>
                  <select
                    className={cx(inputCls, 'flex-1 text-[13px]')}
                    value={defaultDrivers[dow] ?? ''}
                    onChange={(e) => setDefaultDrivers((m) => ({ ...m, [dow]: e.target.value }))}
                    disabled={!activeDay}
                  >
                    <option value="">— none (manual assign) —</option>
                    {(volunteersQ.data?.data ?? [])
                      .filter((v: any) => !v.deletedAt && v.status !== 'inactive')
                      .sort((a: any, b: any) => (a.lastName ?? '').localeCompare(b.lastName ?? ''))
                      .sort((a: any, b: any) => Number(notSteady.has(Number(a.id))) - Number(notSteady.has(Number(b.id)))) // Oct 29 client: not Steady last
                      .map((v: any) => (
                        <option key={v.id} value={v.id}>
                          {v.firstName} {v.lastName}{v.unitNumber != null ? ` · #${v.unitNumber}` : ''}{notSteady.has(Number(v.id)) ? ' (not Steady)' : ''}
                        </option>
                      ))}
                  </select>
                </div>
              );
            })}
            <p className="text-[11px] text-muted px-3 py-2 italic">
              Set a driver per day and the materializer will pre-fill them onto each generated pickup with status "pending" — they still confirm via SMS or the app.
            </p>
          </div>
        </Field>
        </>)}
      </div>
      {miss.summary && <p className="text-clay text-[12px] font-bold mt-3">{miss.summary}</p>}
      {(save.error || del.error) && <p className="text-clay text-[12px] mt-3">{((save.error || del.error) as Error).message}</p>}
      <div className="flex items-center justify-between mt-4">
        {row ? (
          <button onClick={() => { void uiConfirm(`Delete steady pickup ${row.name}? Future generated occurrences are unlinked.`).then((ok) => { if (ok) { del.mutate(); } }); }}
                  className="haptic flex items-center gap-1.5 text-clay text-[12.5px] font-bold border border-clay/40 px-3 py-2 rounded-[10px]">
            <Trash2 size={13} /> {del.isPending ? 'Deleting…' : 'Delete'}
          </button>
        ) : <span />}
        <div className="flex gap-2">
          <Button size="sm" variant="plain" onClick={onCancel}>Cancel</Button>
          <Button size="sm" loading={save.isPending} onClick={() => { if (miss.guard()) save.mutate(); }}>{row ? 'Save' : 'Create'}</Button>
        </div>
      </div>
      {showNewSupplier && (
        <SupplierForm row={null}
          onCancel={() => setShowNewSupplier(false)}
          onCreated={async (newRow) => {
            await qc.invalidateQueries({ queryKey: ['admin-suppliers'] });
            await suppliers.refetch();
            if (newRow?.id) setSupplierId(String(newRow.id));
          }}
          onDone={() => setShowNewSupplier(false)} />
      )}
    </Modal>
  );
}

// =============================== Sign-In sheet ==============================

/**
 * Office sign-in — volunteers sign in when they drop off food and report what
 * they picked up. Multiple pickup rows per sign-in: location + supplier.
 */
export function SignInPanel() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin-signins'], queryFn: adminCRUD.signins });
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('');
  const [pickups, setPickups] = useState<{ location: string; supplier: string }[]>([{ location: '', supplier: '' }]);
  const [notes, setNotes] = useState('');
  const suppliers = useQuery({ queryKey: ['admin-suppliers'], queryFn: () => api<{ data: any[] }>('/api/suppliers?limit=500&logo=url') });

  const save = useMutation({
    mutationFn: () => adminCRUD.createSignin({
      name, unitNumber: unit || null,
      notes: notes.trim() || null,
      pickups: pickups.filter((p) => p.location || p.supplier),
    }),
    onSuccess: () => {
      setName(''); setUnit(''); setPickups([{ location: '', supplier: '' }]); setNotes('');
      qc.invalidateQueries({ queryKey: ['admin-signins'] });
    },
  });

  return (
    <div className="space-y-4">
      <div className="border border-line bg-paper rounded-[14px] p-4 space-y-3">
        <div className="text-[11px] font-extrabold uppercase tracking-[.05em] text-muted">New sign-in</div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Volunteer name" full><input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} /></Field>
          <Field label="Unit number (3 Regina)"><input value={unit} onChange={(e) => setUnit(e.target.value)} className={inputCls} /></Field>
        </div>
        <div>
          <div className="text-[10.5px] font-extrabold uppercase tracking-[.05em] text-muted mb-2">Pickups dropped off</div>
          <div className="space-y-2">
            {pickups.map((p, i) => (
              <div key={i} className="flex gap-2">
                <input list="signin-suppliers" placeholder="Supplier"
                       value={p.supplier} onChange={(e) => setPickups((arr) => arr.map((x, j) => j === i ? { ...x, supplier: e.target.value } : x))}
                       className={cx(inputCls, 'flex-1')} />
                <input placeholder="Location / shelf"
                       value={p.location} onChange={(e) => setPickups((arr) => arr.map((x, j) => j === i ? { ...x, location: e.target.value } : x))}
                       className={cx(inputCls, 'flex-1')} />
                {pickups.length > 1 && (
                  <button onClick={() => setPickups((arr) => arr.filter((_, j) => j !== i))}
                          className="haptic grid h-10 w-10 place-items-center rounded-full bg-clay-soft text-clay"><X size={14} /></button>
                )}
              </div>
            ))}
            <button onClick={() => setPickups((arr) => [...arr, { location: '', supplier: '' }])}
                    className="haptic text-[12px] font-bold text-forest mt-1 flex items-center gap-1.5"><Plus size={13} /> Add another pickup</button>
          </div>
          <datalist id="signin-suppliers">
            {(suppliers.data?.data ?? []).map((s: any) => <option key={s.id} value={s.name} />)}
          </datalist>
        </div>
        <div>
          <div className="text-[10.5px] font-extrabold uppercase tracking-[.05em] text-muted mb-2">Notes</div>
          <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)}
                    placeholder="Anything the office should know — issues at the store, items that need to be flagged, follow-ups, etc."
                    className={cx(inputCls, 'resize-y min-h-[72px]')} />
        </div>
        {save.error && <p className="text-clay text-[12px]">{(save.error as Error).message}</p>}
        <Button size="md" loading={save.isPending} disabled={!name.trim()} onClick={() => save.mutate()} icon={<Check size={15} />}>
          Save sign-in
        </Button>
      </div>

      <div>
        <div className="text-[11px] font-extrabold uppercase tracking-[.05em] text-muted mb-2">Recent</div>
        {q.isLoading ? <div className="text-[13px] text-muted">Loading…</div> :
         (q.data?.data ?? []).length === 0 ? <div className="text-[13px] text-muted">No sign-ins yet.</div> :
         <div className="space-y-2">
           {(q.data?.data ?? []).slice(0, 30).map((s: any) => (
             <div key={s.id} className="border border-line bg-paper rounded-[14px] px-4 py-2.5 flex items-start justify-between gap-3">
               <div className="min-w-0">
                 <div className="font-bold text-[13.5px] truncate"><Name>{s.name}</Name></div>
                 <div className="text-[11px] text-muted">{fmtDateTimeEastern(s.signedInAt ?? s.createdAt)}</div>
                 {Array.isArray(s.pickups) && s.pickups.length > 0 && (
                   <div className="text-[11.5px] text-ink mt-1">{s.pickups.map((p: any) => `${p.supplier ?? ''}${p.location ? ` (${p.location})` : ''}`.trim()).filter(Boolean).join(' · ')}</div>
                 )}
               </div>
             </div>
           ))}
         </div>}
      </div>
    </div>
  );
}

// ============================= Kiosk Activity ================================

/**
 * Kiosk Activity — live feed of drop-off kiosk sign-ins (zlz.office_dropoffs).
 * Distinct from the older `Office Sign-In` manual sheet (which reads from the
 * near-empty `zlz.office_signins` table). Shows every driver who signed into
 * the kiosk with their unit #, arrival time, items dropped, and labels-printed
 * status per line. Search + day-window filter + 15s auto-refresh.
 */
// Aug 23 client: dedicated Kiosk Activity date-range XLSX download.
// Backend: /api/dropoff/activity/export?from=&to=&q=
function KioskActivityExportModal({ initialQuery, onClose }: {
  initialQuery: string; onClose: () => void;
}) {
  const nyTodayISO = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
  const nyOffsetISO = (days: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' })
    .format(new Date(Date.now() + days * 86400_000));
  const [from, setFrom] = useState(nyOffsetISO(-7));
  const [to, setTo] = useState(nyTodayISO());
  const [qFilter, setQFilter] = useState(initialQuery);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const run = async () => {
    setBusy(true); setErr(null);
    try {
      const { API_BASE, getToken } = await import('./api');
      const token = getToken();
      const url = `${API_BASE.replace(/\/$/, '')}/api/dropoff/log/export`
        + `?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
        + (qFilter.trim() ? `&q=${encodeURIComponent(qFilter.trim())}` : '');
      const r = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error((body as any).error || `${r.status} ${r.statusText}`);
      }
      const blob = await r.blob();
      const dl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = dl;
      a.download = `zlz-kiosk-activity-${from}-to-${to}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(dl), 5000);
      onClose();
    } catch (e: any) {
      setErr(e?.message || 'Download failed');
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-ink/40 p-4">
      <div className="w-[440px] max-w-full bg-paper rounded-[16px] shadow-lift border border-line p-5"
           onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="font-display font-bold text-[18px] text-ink">Download kiosk activity</div>
            <div className="text-[12px] text-muted mt-0.5">
              Pick any date range. Includes name, unit #, sign-in / finish, supplier, items, labels printed.
            </div>
          </div>
          <button onClick={onClose} className="haptic text-muted hover:text-ink" aria-label="Close">✕</button>
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
        <label className="block mt-3">
          <span className="text-[11px] font-extrabold uppercase tracking-[.05em] text-muted">Filter (name / unit #)</span>
          <input type="text" value={qFilter} onChange={(e) => setQFilter(e.target.value)}
                 placeholder="Leave blank for all"
                 className="mt-1 w-full rounded-[10px] border border-line bg-cream px-3 py-2 text-[13px]" />
        </label>
        {err && (
          <div className="mt-3 text-[12px] text-clay bg-clay/10 border border-clay/30 rounded-[8px] px-3 py-2">
            {err}
          </div>
        )}
        <div className="mt-5 flex items-center justify-end gap-2">
          <button onClick={onClose} disabled={busy}
                  className="haptic text-[12.5px] font-bold px-3 py-2 rounded-[10px] border border-line text-ink disabled:opacity-50">
            Cancel
          </button>
          <button onClick={run} disabled={busy || !from || !to || from > to}
                  className="haptic text-[12.5px] font-bold px-3 py-2 rounded-[10px] bg-forest text-paper shadow-ctag disabled:opacity-50">
            {busy ? 'Downloading…' : 'Download .xlsx'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function KioskActivityPanel() {
  const [days, setDays] = useState<number>(7);
  const [q_search, setSearch] = useState('');
  const [kioskExportOpen, setKioskExportOpen] = useState(false);
  const q = useQuery({
    queryKey: ['admin-kiosk-activity', days],
    queryFn: () => adminCRUD.kioskActivity(days, 200),
    refetchInterval: 15_000,
  });
  const rows = (q.data?.data ?? []);
  const summary = (q.data as any)?.summary ?? { today: 0, past_7d: 0, past_30d: 0, total: 0 };

  const filtered = rows.filter((r) => {
    const s = q_search.trim().toLowerCase();
    if (!s) return true;
    const name = `${r.v_first ?? ''} ${r.v_last ?? ''}`.trim() || r.volunteer_name || '';
    const unit = String(r.v_unit ?? r.unit_number ?? '');
    if (name.toLowerCase().includes(s) || unit.includes(s)) return true;
    return r.lines.some((l) => (l.supplier_name ?? '').toLowerCase().includes(s)
                            || (l.category ?? '').toLowerCase().includes(s)
                            || (l.description ?? '').toLowerCase().includes(s));
  });

  // Oct 9 client: "Thu, Oct 9 · 2:30 PM".
  const fmt = (iso: string | null) => iso ? whenAt(iso) : '—'; // Oct 23 client: one date + time format

  return (
    <div className="space-y-4">
      <PrintLogCard />{/* Oct 31 client: label print log */}
      <div className="flex flex-wrap gap-2">
        <div className="border border-emerald-300 bg-emerald-100 text-emerald-800 rounded-[12px] px-3 py-2 text-[12px] font-bold">
          <span className="text-[16px] font-extrabold tracking-tight">{(summary as any).today ?? 0}</span>
          <span className="ml-1.5 font-semibold">Today</span>
        </div>
        <div className="border border-lime-300 bg-lime-100 text-lime-800 rounded-[12px] px-3 py-2 text-[12px] font-bold">
          <span className="text-[16px] font-extrabold tracking-tight">{(summary as any).past_7d ?? 0}</span>
          <span className="ml-1.5 font-semibold">Past 7 days</span>
        </div>
        <div className="border border-amber-300 bg-amber-100 text-amber-800 rounded-[12px] px-3 py-2 text-[12px] font-bold">
          <span className="text-[16px] font-extrabold tracking-tight">{(summary as any).past_30d ?? 0}</span>
          <span className="ml-1.5 font-semibold">Past 30 days</span>
        </div>
        <div className="border border-neutral-300 bg-neutral-200 text-neutral-700 rounded-[12px] px-3 py-2 text-[12px] font-bold">
          <span className="text-[16px] font-extrabold tracking-tight">{(summary as any).total ?? 0}</span>
          <span className="ml-1.5 font-semibold">All time</span>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <input value={q_search} onChange={(e) => setSearch(e.target.value)}
               placeholder="Search name, unit #, supplier, category…"
               className="border border-line rounded-[10px] px-3 py-2 text-[13px] w-full max-w-[340px]" />
        <label className="text-[12px] text-muted flex items-center gap-2">
          <span>Window:</span>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))}
                  className="border border-line rounded-[8px] px-2 py-1 text-[13px] bg-paper">
            <option value={1}>Today</option>
            <option value={7}>Past 7 days</option>
            <option value={30}>Past 30 days</option>
            <option value={90}>Past 90 days</option>
          </select>
        </label>
        <button onClick={() => q.refetch()} className="text-[12px] font-bold text-forest hover:underline">Refresh</button>
        <div className="flex-1" />
        <button onClick={() => setKioskExportOpen(true)}
                className="text-[12px] font-bold text-forest border border-forest/40 rounded-[8px] px-3 py-1.5 hover:bg-forest hover:text-paper haptic">
          ⬇ Download .xlsx
        </button>
      </div>

      {kioskExportOpen && (
        <KioskActivityExportModal
          initialQuery={q_search.trim()}
          onClose={() => setKioskExportOpen(false)}
        />
      )}

      {q.isLoading ? <div className="text-[13px] text-muted">Loading…</div> :
       filtered.length === 0 ? <div className="text-[13px] text-muted">No kiosk sign-ins in this window.</div> :
       <div className="space-y-2">
         {filtered.map((r) => {
           const name = `${r.v_first ?? ''} ${r.v_last ?? ''}`.trim() || r.volunteer_name;
           const printedAny = r.lines.some((l) => !!l.labels_printed_at);
           const inProgress = !r.completed_at;
           // tier2 Aug 21 — an in-progress row older than 2h is effectively
           // abandoned (kiosk was left with an open session). Render "abandoned"
           // as a muted grey pill instead of the loud amber "in progress" so
           // stale rows stop screaming for attention forever.
           const startedMs = r.started_at ? new Date(r.started_at).getTime() : 0;
           const abandoned = inProgress && startedMs > 0 &&
             (Date.now() - startedMs) > 2 * 60 * 60 * 1000;
           // tier2 Aug 21 — "guest" is truly guest ONLY when there's no linked
           // volunteer_id. The previous logic keyed off `time_issues`, which
           // holds free-form kiosk warnings ("clock skew", "no unit picked"...)
           // and misflagged real volunteers as guests.
           const isGuest = r.volunteer_id == null;
           return (
             <div key={r.id} className="border border-line bg-paper rounded-[14px] px-4 py-3">
               <div className="flex items-start justify-between gap-3">
                 <div className="min-w-0">
                   <div className="font-bold text-[14px] truncate">
                     <Name>{name}</Name>{/* Oct 23 client: unit numbers only in the Drivers list (search by # still works) */}
                     {inProgress && !abandoned && <span className="ml-2 border border-amber-300 bg-amber-100 text-amber-800 text-[10.5px] font-bold px-1.5 py-0.5 rounded-[6px] uppercase">in progress</span>}
                     {abandoned && <span className="ml-2 border border-neutral-300 bg-neutral-100 text-neutral-500 text-[10.5px] font-bold px-1.5 py-0.5 rounded-[6px] uppercase">abandoned</span>}
                     {isGuest && <span className="ml-2 border border-neutral-300 bg-neutral-100 text-neutral-700 text-[10.5px] font-bold px-1.5 py-0.5 rounded-[6px]">guest</span>}
                   </div>
                   <div className="text-[11.5px] text-muted mt-0.5">
                     Signed in {fmt(r.started_at)}
                     {r.completed_at && <> · Finished {fmt(r.completed_at)}</>}
                     <> · {r.line_count} line{r.line_count === 1 ? '' : 's'}</>
                     {r.supplier_count > 0 && <> · {r.supplier_count} supplier{r.supplier_count === 1 ? '' : 's'}</>}
                     {r.item_qty_total > 0 && <> · {r.item_qty_total} item{r.item_qty_total === 1 ? '' : 's'}</>}
                     {printedAny && <> · <span className="text-forest font-semibold">labels printed</span></>}
                   </div>
                   {r.time_issues && <div className="text-[11.5px] text-muted mt-1 italic">{r.time_issues}</div>}
                   {r.notes && <div className="text-[11.5px] text-ink mt-1">{r.notes}</div>}
                 </div>
               </div>
               {r.lines.length > 0 && (
                 <div className="mt-2 border-t border-line pt-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                   {r.lines.map((l) => (
                     <div key={l.id} className="flex items-center gap-2 text-[12.5px]">
                       <span className="tabular-nums font-bold w-8 text-right">{l.quantity}</span>
                       <span className="text-muted">{l.unit}</span>
                       <span className="truncate">{l.description}</span>
                       {l.supplier_name && <span className="text-muted">· {l.supplier_name}</span>}
                       {l.labels_printed_at && <span className="text-forest">🖨</span>}
                     </div>
                   ))}
                 </div>
               )}
             </div>
           );
         })}
       </div>}

      <p className="text-[11px] text-muted">
        Data auto-refreshes every 15s. Rows come from <code>zlz.office_dropoffs</code> — the actual kiosk write path.
        The older Office Sign-In tab reads a different table (<code>zlz.office_signins</code>) that the kiosk hasn't touched since June.
      </p>
    </div>
  );
}

// ================================ App Usage =================================
// Oct 21 client: moved to app-usage-panel.tsx (totals, days used, old version, filters).
export { AppUsagePanel } from './app-usage-panel';

// =============================== Settings ===================================

/**
 * Settings — manage the option_items lookup so admins can rename/add/remove
 * statuses, types, urgency levels, container kinds, etc.
 */
const CATEGORIES = [
  { key: 'pickup_status',     label: 'Pickup statuses' },
  { key: 'pickup_type',       label: 'Pickup types' },
  { key: 'urgency_level',     label: 'Urgency levels' },
  { key: 'volunteer_status',  label: 'Volunteer statuses' },
  { key: 'supplier_status',   label: 'Supplier statuses' },
  // tier3 Aug 23 — supplier_type wasn't editable from Settings at all; add it
  // so the office can maintain the store/caterer/bakery/simcha/mosad/other
  // dropdown values without hitting SQL. Values default to the six above when
  // the category is empty (see below).
  { key: 'supplier_type',     label: 'Supplier types' },
  { key: 'volunteer_question', label: 'Driver sign-up questions' },
  { key: 'supplier_question',  label: 'Store sign-up questions' },
];
// tier3 Aug 23 — hardcoded fallback seed values shown to the editor when the
// supplier_type category has never been populated in the DB. Purely UI-side —
// it doesn't write to the DB unless the coordinator adds them via the panel.
const SUPPLIER_TYPE_SUGGESTIONS = ['store', 'caterer', 'bakery', 'simcha', 'mosad', 'other'];

export function SettingsPanel() {
  const [active, setActive] = useState<string>('options');
  // tier3 Aug 23 — the chip list used to render ALL categories, including any
  // that had zero rows in option_items. Fetch each category once and filter
  // out the empty ones so the editor only sees categories that actually have
  // (or intentionally need — see supplier_type) values.
  const categoryQueries = useQueries({
    queries: CATEGORIES.map((c) => ({
      queryKey: ['admin-options', c.key],
      queryFn:  () => adminCRUD.options(c.key),
      staleTime: 30_000,
    })),
  });
  const visibleCategories = useMemo(() => CATEGORIES.filter((c, i) => {
    // supplier_type is always shown even when empty so the office can seed it
    // from the SUPPLIER_TYPE_SUGGESTIONS list; every other category is hidden
    // when it has no rows.
    if (c.key === 'supplier_type') return true;
    const q = categoryQueries[i];
    if (!q || q.isLoading) return true; // avoid flicker while loading
    return (q.data?.data?.length ?? 0) > 0;
  }), [categoryQueries.map((q) => q.data?.data?.length ?? 0).join('|')]);
  const [optionCat, setOptionCat] = useState<string>(CATEGORIES[0]!.key);
  // If the currently-selected chip got filtered out, jump to the first
  // visible one so we don't render a stranded empty pane.
  useEffect(() => {
    if (visibleCategories.length === 0) return;
    if (!visibleCategories.some((c) => c.key === optionCat)) {
      setOptionCat(visibleCategories[0]!.key);
    }
  }, [visibleCategories, optionCat]);
  return (
    <div className="space-y-4">
      <div className="text-[11px] font-extrabold uppercase tracking-[.05em] text-muted">Admin settings</div>
      {/* Portal-wide force refresh — always visible so it's one click away
          from any tab, since it's the "we just shipped a fix, pull it now
          on every tablet" action. */}
      <ForcePortalReloadCard />
      <DriverQueueHoursCard />{/* Oct 14 client: drivers see a pickup N hours before its time */}
      <StorePhotoSettingCard />{/* Oct 28 client: the store's photo goes with the driver's details */}
      <AppVersionsCard />{/* Oct 21 client: force phone app updates */}
      <GoogleSignInSettingsCard />{/* Oct 31 client: Sign in with Google */}
      <EscalationSettingsCard />{/* Oct 21 client: no-driver escalation steps + Escalation contacts */}
      <RunPlacesCard />{/* Oct 30 client: Lakewood / Fallsburg location addresses (runs) */}
      <div className="flex flex-wrap gap-1.5">
        <button onClick={() => setActive('options')} className={cx('chip', active === 'options' && 'on')}>Status & type lists</button>
        <button onClick={() => setActive('notifications')} className={cx('chip', active === 'notifications' && 'on')}>SMS notifications</button>
        <button onClick={() => setActive('admins')} className={cx('chip', active === 'admins' && 'on')}>Admin users</button>
        <button onClick={() => setActive('kiosk')} className={cx('chip', active === 'kiosk' && 'on')}>Kiosk mode</button>
        <button onClick={() => setActive('voice')} className={cx('chip', active === 'voice' && 'on')}>📞 Phone calls</button>
        <button onClick={() => setActive('pbx')} className={cx('chip', active === 'pbx' && 'on')}>☎️ Office phone</button>{/* Oct 20 client */}
        <button onClick={() => setActive('asana')} className={cx('chip', active === 'asana' && 'on')}>Asana</button>{/* Nov 3 client */}
        <button onClick={() => setActive('storeform')} className={cx('chip', active === 'storeform' && 'on')}>Store post form</button>{/* Oct 14 client */}
        <button onClick={() => setActive('stocknames')} className={cx('chip', active === 'stocknames' && 'on')}>Ordering portal store names</button>{/* Oct 30 client */}
      </div>
      {active === 'options' ? (
        <>
          <div className="flex flex-wrap gap-1.5">
            {visibleCategories.map((c) => (
              <button key={c.key} onClick={() => setOptionCat(c.key)}
                      className={cx('chip', optionCat === c.key && 'on')}>{c.label}</button>
            ))}
          </div>
          <OptionsForCategory category={optionCat} />
        </>
      ) : active === 'notifications' ? (
        <NotificationsPanel />
      ) : active === 'admins' ? (
        <AdminUsersPanel />
      ) : active === 'kiosk' ? (
        <KioskModePanel />
      ) : active === 'storeform' ? (
        <StorePostFormCard />
      ) : active === 'stocknames' ? (
        <StockStoreNamesPanel />
      ) : active === 'pbx' ? (
        <OfficePhonePanel />
      ) : active === 'asana' ? (
        <AsanaSettingsPanel />
      ) : (
        <VoiceCallsPanel />
      )}
    </div>
  );
}

/**
 * Force every portal tablet / browser to hard-refresh on the next API
 * response after the click. Server bumps `X-Portal-Reload-Since`; every
 * client's fetch wrapper detects a newer epoch than it's seen, unregisters
 * service workers, clears CacheStorage, and reloads with a cache-buster.
 * Meant for exactly this case: "we shipped a fix — pull it now, everywhere."
 */
function ForcePortalReloadCard() {
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [err, setErr]   = useState<string | null>(null);

  async function bump() {
    if (!(await uiConfirm('Force EVERY logged-in portal browser and tablet to refresh now?\n\nUsers on the kiosk in the middle of a drop-off are skipped and picked up on their next boot.'))) return;
    setBusy(true); setErr(null); setFlash(null);
    try {
      const r = await portalReload.bump();
      setFlash(`Bumped. All portal tabs will refresh on their next API call. Epoch: ${r.data.reloadSince}`);
    } catch (e: any) {
      setErr(e?.message || 'Could not bump portal reload epoch.');
    } finally { setBusy(false); }
  }

  return (
    <div className="rounded-[14px] border border-clay/30 bg-clay/5 p-4 text-[13px] text-ink space-y-2">
      <div className="font-extrabold text-[14px] text-clay-deep">Force refresh on every device</div>
      <p className="leading-snug">
        Kicks every open portal tab/tablet into a hard reload (clears the service worker + cache and reloads with a cache-buster). Use after a critical fix so nobody's stuck on the old bundle.
      </p>
      {err && <div className="text-clay font-bold bg-clay/10 rounded-[10px] px-3 py-2">{err}</div>}
      {flash && <div className="text-forest font-bold bg-sage/40 rounded-[10px] px-3 py-2">{flash}</div>}
      <Button size="sm" variant="clay" loading={busy} onClick={bump}>Force refresh everyone now</Button>
    </div>
  );
}

/**
 * Oct 11 client: Settings -> Kiosk. The old per-device "Make this device a
 * permanent kiosk" switch is gone; kiosk mode is now started on the kiosk page
 * itself (gear -> Start kiosk mode -> kiosk PIN). Here: how-to, "Open the kiosk"
 * (fetches the secret, admin-only, and just navigates - nothing is stored on
 * this device) and "Copy kiosk link". PIN change card below.
 */
function KioskModePanel() {
  const nav = useNavigate();
  const [busy, setBusy] = useState<'open' | 'copy' | null>(null);
  const [err, setErr]   = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Oct 11 client: kiosk secret from the server (admin-only call).
  async function getSecret(): Promise<string | null> {
    const r = await kioskDevice.fetchSecret();
    if (!r.data.secret) {
      setErr('Kiosk secret not configured on the server (KIOSK_SECRET env var).');
      return null;
    }
    return r.data.secret;
  }
  async function openKiosk() {
    setBusy('open'); setErr(null);
    try {
      const secret = await getSecret();
      if (secret) nav(`/kiosk/${encodeURIComponent(secret)}`);
    } catch (e: any) {
      setErr(e?.message || 'Could not open the kiosk.');
    } finally { setBusy(null); }
  }
  async function copyLink() {
    setBusy('copy'); setErr(null); setCopied(false);
    try {
      const secret = await getSecret();
      if (!secret) return;
      const b = import.meta.env.BASE_URL || '/';
      const base = b.startsWith('/') ? b.replace(/\/?$/, '/') : '/rescue/';
      const url = `${window.location.origin}${base}kiosk/${encodeURIComponent(secret)}`;
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e: any) {
      setErr(e?.message || 'Could not copy the kiosk link.');
    } finally { setBusy(null); }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-[14px] border border-sage-line bg-sage/40 p-4 text-[13px] text-forest">
        <div className="font-extrabold text-[14px] mb-1">Drop-off kiosk</div>
        <p className="leading-snug">
          To run the drop-off kiosk on a tablet: open the kiosk, tap <b>⚙</b> (bottom-left) → <b>Start kiosk mode</b>, enter the kiosk PIN. Tap <b>🔒</b> + PIN to exit. For a full lock, add it to the Home Screen and turn on App pinning (Android) / Guided Access (iPad).
        </p>
      </div>
      {err && <div className="text-clay text-[13px] font-bold bg-clay/10 rounded-[10px] px-3 py-2">{err}</div>}
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" variant="forest" loading={busy === 'open'} onClick={openKiosk}>Open the kiosk</Button>
        <Button size="sm" variant="plain" loading={busy === 'copy'} onClick={copyLink}>{copied ? 'Copied' : 'Copy kiosk link'}</Button>
      </div>
      <KioskAdminPinCard />
    </div>
  );
}

/**
 * Coordinator UI for the admin PIN that gates the kiosk Admin Panel.
 * Digits only, 4-12 long. Server writes to zlz.portal_settings.kiosk_admin_pin.
 */
function KioskAdminPinCard() {
  const q = useQuery({ queryKey: ['kiosk-settings'], queryFn: kioskSettings.get });
  const qc = useQueryClient();
  const [pin, setPin] = useState('');
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (q.data?.data.adminPin != null) setPin(q.data.data.adminPin); }, [q.data]);
  const save = useMutation({
    mutationFn: () => kioskSettings.save(pin.trim()),
    onSuccess: () => { setErr(null); qc.invalidateQueries({ queryKey: ['kiosk-settings'] }); },
    onError:   (e: any) => setErr(e?.message || 'save failed'),
  });
  const valid = /^\d{4,12}$/.test(pin.trim());

  return (
    <div className="rounded-[14px] border border-line bg-paper p-4">
      <div className="font-extrabold text-[14px] mb-1">Kiosk admin PIN</div>
      <div className="text-[12.5px] text-muted leading-snug mb-3">
        Volunteers open the Admin Panel from Help (?) → Admin, then enter this PIN. 4–12 digits.
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 12))}
               inputMode="numeric" autoComplete="off"
               className="border border-line rounded-[10px] px-3 py-2 text-[15px] w-[160px] font-mono tracking-widest text-center"
               placeholder="1234" />
        <Button size="sm" variant="forest" disabled={!valid || save.isPending || pin.trim() === (q.data?.data.adminPin ?? '')}
                onClick={() => save.mutate()}>
          {save.isPending ? 'Saving…' : 'Save PIN'}
        </Button>
        {q.isLoading && <span className="text-[12px] text-muted">Loading…</span>}
        {!valid && pin && <span className="text-[12px] text-clay">Digits only, 4-12 chars.</span>}
        {err && <span className="text-[12px] text-clay font-bold">{err}</span>}
      </div>
    </div>
  );
}

function OptionsForCategory({ category }: { category: string }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin-options', category], queryFn: () => adminCRUD.options(category) });
  const [adding, setAdding] = useState(false);
  const [newValue, setNewValue] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const rows = (q.data?.data ?? []) as any[];

  const create = useMutation({
    mutationFn: () => adminCRUD.createOption({ category, value: newValue, label: newLabel || newValue }),
    onSuccess: () => { setAdding(false); setNewValue(''); setNewLabel(''); qc.invalidateQueries({ queryKey: ['admin-options', category] }); },
  });
  // tier3 Aug 23 — one-tap seed for supplier_type when the DB has nothing.
  const seedSupplierType = useMutation({
    mutationFn: (value: string) =>
      adminCRUD.createOption({ category: 'supplier_type', value, label: value[0]!.toUpperCase() + value.slice(1) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-options', 'supplier_type'] }),
  });
  const missingSupplierTypes = category === 'supplier_type'
    ? SUPPLIER_TYPE_SUGGESTIONS.filter((v) => !rows.some((r) => String(r.value).toLowerCase() === v))
    : [];

  return (
    <div className="border border-line bg-paper rounded-[14px] overflow-hidden">
      {category === 'supplier_type' && missingSupplierTypes.length > 0 && (
        <div className="border-b border-line bg-sage/25 px-3 py-2.5 text-[12px] text-forest-deep">
          <div className="font-extrabold uppercase tracking-[.04em] text-[10.5px] text-muted mb-1.5">Quick-add supplier types</div>
          <div className="flex flex-wrap gap-1.5">
            {missingSupplierTypes.map((v) => (
              <button key={v} type="button" onClick={() => seedSupplierType.mutate(v)}
                      disabled={seedSupplierType.isPending}
                      className="haptic text-[12px] font-bold text-forest bg-paper border border-sage-line rounded-full px-2.5 py-1 hover:bg-sage/50 disabled:opacity-50">
                + {v}
              </button>
            ))}
          </div>
        </div>
      )}
      {rows.map((o) => <OptionRow key={o.id} row={o} category={category} onChanged={() => qc.invalidateQueries({ queryKey: ['admin-options', category] })} />)}
      {adding ? (
        <div className="border-t border-line p-3 grid grid-cols-2 gap-2">
          <input className={inputCls} value={newValue} onChange={(e) => setNewValue(e.target.value)} placeholder="value (e.g. en_route)" />
          <input className={inputCls} value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="label (e.g. En route)" />
          <div className="col-span-2 flex justify-end gap-2">
            <Button size="sm" variant="plain" onClick={() => setAdding(false)}>Cancel</Button>
            <Button size="sm" loading={create.isPending} disabled={!newValue.trim()} onClick={() => create.mutate()}>Add</Button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="haptic w-full border-t border-line py-2.5 text-[12.5px] font-bold text-forest flex items-center justify-center gap-1.5">
          <Plus size={13} /> Add option
        </button>
      )}
    </div>
  );
}

function OptionRow({ row, category, onChanged }: { row: any; category: string; onChanged: () => void }) {
  const [label, setLabel] = useState(row.label);
  const [dirty, setDirty] = useState(false);
  useEffect(() => { setLabel(row.label); setDirty(false); }, [row.id, row.label]);

  const patch = useMutation({ mutationFn: () => adminCRUD.patchOption(row.id, { label }), onSuccess: () => { onChanged(); setDirty(false); } });
  const del   = useMutation({ mutationFn: () => adminCRUD.deleteOption(row.id), onSuccess: onChanged });

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-line last:border-b-0">
      <span className="text-[11px] font-mono text-muted w-[110px] truncate">{row.value}</span>
      <input value={label} onChange={(e) => { setLabel(e.target.value); setDirty(true); }} className={cx(inputCls, 'flex-1 !py-1.5 !text-[12.5px]')} />
      {dirty && <button onClick={() => patch.mutate()} className="haptic text-forest text-[12px] font-bold px-2 py-1 rounded-[8px] bg-sage">Save</button>}
      <button onClick={() => { void uiConfirm(`Remove "${row.value}" from ${category}?`).then((ok) => { if (ok) { del.mutate(); } }); }}
              className="haptic text-clay grid h-7 w-7 place-items-center rounded-full hover:bg-clay-soft"><Trash2 size={13} /></button>
    </div>
  );
}

// =============================== Neighborhoods ==============================

export function NeighborhoodsPanel() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['neighborhoods'], queryFn: adminCRUD.neighborhoods });
  const [newName, setNewName] = useState('');
  const create = useMutation({
    mutationFn: () => adminCRUD.createNeighborhood({ name: newName.trim() }),
    onSuccess: () => { setNewName(''); qc.invalidateQueries({ queryKey: ['neighborhoods'] }); },
  });
  // Oct 2 client fix: page search.
  const [nq, setNq] = useState('');
  const rows = q.data?.data ?? [];

  return (
    <div className="space-y-3">
      <div className="text-[11px] font-extrabold uppercase tracking-[.05em] text-muted">{rows.length} neighborhoods</div>
      <SearchBar value={nq} onChange={setNq} placeholder="Search neighborhoods…" />

      <form onSubmit={(e) => { e.preventDefault(); if (newName.trim()) create.mutate(); }}
            className="flex items-center gap-2">
        <input value={newName} onChange={(e) => setNewName(e.target.value)}
               placeholder="e.g. Spring Valley"
               className={cx(inputCls, '!py-2 !text-[13px] flex-1')} />
        <Button size="sm" variant="forest" icon={<Plus size={14} />}
                loading={create.isPending} onClick={() => create.mutate()}
                disabled={!newName.trim()}>Add</Button>
      </form>
      {create.error && <p className="text-clay text-[12px]">{(create.error as Error).message}</p>}

      <div className="rounded-[14px] border border-line bg-paper overflow-hidden">
        {rows.length === 0 && <div className="text-[13px] text-muted px-4 py-6 text-center">No neighborhoods yet.</div>}
        {rows.filter((n) => !nq.trim() || JSON.stringify(n).toLowerCase().includes(nq.trim().toLowerCase())).map((n) => <NeighborhoodRow key={n.id} row={n} onChanged={() => qc.invalidateQueries({ queryKey: ['neighborhoods'] })} />)}
      </div>
    </div>
  );
}

function NeighborhoodRow({ row, onChanged }: { row: any; onChanged: () => void }) {
  const [name, setName] = useState(row.name);
  // tier3 Aug 23 — sort_order UI. Editable number input; single Save fires
  // PATCH for whichever fields the user changed. Backend endpoint (T3-A) is
  // being wired to accept `sort_order` snake-case, so we bypass the typed
  // adminCRUD wrapper for that field and hit the endpoint directly.
  const initialSort = Number(row.sortOrder ?? row.sort_order ?? 0);
  const [sortOrder, setSortOrder] = useState<number>(initialSort);
  const [nameDirty, setNameDirty] = useState(false);
  const [sortDirty, setSortDirty] = useState(false);
  useEffect(() => {
    setName(row.name); setNameDirty(false);
    setSortOrder(Number(row.sortOrder ?? row.sort_order ?? 0)); setSortDirty(false);
  }, [row.id, row.name, row.sortOrder, row.sort_order]);
  const dirty = nameDirty || sortDirty;
  const patch = useMutation({
    mutationFn: async () => {
      if (nameDirty) await adminCRUD.patchNeighborhood(row.id, { name });
      if (sortDirty) {
        // Send both camelCase and snake_case so we're compatible with whichever
        // shape the backend patch route settles on.
        await api(`/api/neighborhoods/${row.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ sort_order: sortOrder, sortOrder }),
        });
      }
    },
    onSuccess: () => { onChanged(); setNameDirty(false); setSortDirty(false); },
  });
  const archive = useMutation({ mutationFn: () => adminCRUD.patchNeighborhood(row.id, { status: row.status === 'active' ? 'archived' : 'active' }), onSuccess: onChanged });
  const del = useMutation({ mutationFn: () => adminCRUD.deleteNeighborhood(row.id), onSuccess: onChanged });
  // tier3 Aug 23 — any in-flight mutation on this row disables the row's OWN
  // action buttons to block double-clicks / racing patches.
  const rowBusy = patch.isPending || archive.isPending || del.isPending;

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-line last:border-b-0">
      <span className={cx('inline-block w-2 h-2 rounded-full shrink-0', row.status === 'active' ? 'bg-forest' : 'bg-line')} />
      <input value={name} onChange={(e) => { setName(e.target.value); setNameDirty(true); }}
             disabled={rowBusy}
             className={cx(inputCls, 'flex-1 !py-1.5 !text-[12.5px] disabled:opacity-60')} />
      <label className="flex items-center gap-1 text-[10.5px] font-extrabold uppercase tracking-[.04em] text-muted shrink-0" title="Sort order — lower numbers appear first">
        <span>#</span>
        <input type="number" value={sortOrder}
               onChange={(e) => { setSortOrder(Number(e.target.value) || 0); setSortDirty(true); }}
               disabled={rowBusy}
               className={cx(inputCls, '!py-1 !px-1.5 !text-[12px] w-[62px] text-center disabled:opacity-60')} />
      </label>
      {dirty && (
        <button onClick={() => patch.mutate()} disabled={rowBusy}
                className="haptic text-forest text-[12px] font-bold px-2 py-1 rounded-[8px] bg-sage disabled:opacity-40 disabled:cursor-not-allowed">
          {patch.isPending ? 'Saving…' : 'Save'}
        </button>
      )}
      <button onClick={() => archive.mutate()} title={row.status === 'active' ? 'Archive' : 'Restore'}
              disabled={rowBusy}
              className="haptic text-[11.5px] font-bold text-muted px-2 py-1 rounded-[8px] hover:bg-cream disabled:opacity-40 disabled:cursor-not-allowed">
        {row.status === 'active' ? 'Archive' : 'Restore'}
      </button>
      <button onClick={() => { void uiConfirm(`Delete "${row.name}" permanently? Suppliers in this neighborhood become unassigned; volunteer assignments are removed.`).then((ok) => { if (ok) { del.mutate(); } }); }}
              disabled={rowBusy}
              className="haptic text-clay grid h-7 w-7 place-items-center rounded-full hover:bg-clay-soft disabled:opacity-40 disabled:cursor-not-allowed"><Trash2 size={13} /></button>
    </div>
  );
}

// =============================== Coverage ===================================

// Oct 30 client: the Coverage panel moved to coverage-panel.tsx (counts drivers from
// their application answers + the office's pick; tap an area → drivers + stores).
export { CoveragePanel } from './coverage-panel';

// =============================== Sign-up Info Cards ==========================

/**
 * Renders the raw answers a supplier / volunteer gave in the public sign-up
 * questionnaire (intake_payload JSONB). Shown inside the edit modal so the
 * coordinator can see WHAT THE PERSON TYPED, not just what got normalized
 * into the columns.
 */
export function IntakeInfoCard({ payload, receivedAt, kind }: {
  payload: any | null | undefined;
  receivedAt: string | null | undefined;
  kind: 'supplier' | 'volunteer';
}) {
  if (!payload || typeof payload !== 'object') return null;

  const groups = kind === 'supplier' ? SUPPLIER_GROUPS : VOLUNTEER_GROUPS;
  const dt = receivedAt ? new Date(receivedAt) : null;

  return (
    <div className="mt-5 border-2 border-forest/15 bg-sage/30 rounded-[16px] overflow-hidden">
      <div className="px-4 py-2.5 bg-forest text-paper flex items-center justify-between">
        <div className="text-[12px] font-extrabold uppercase tracking-[.08em]">Sign-up info card</div>
        {dt && (
          <div className="text-[11px] font-bold opacity-80">
            Received {fmtDay(dt)} {fmtTimeEastern(dt)}
          </div>
        )}
      </div>
      <div className="p-4 space-y-4">
        {groups.map((g) => {
          // Field keys may be dotted (e.g. "dispatching.days"), so use getPath
          // to walk into nested payload objects. Hide fields where the value
          // is missing/empty; hide the whole group if nothing survives.
          const visible = g.fields
            .map((f) => ({ f, v: getPath(payload, f.key) }))
            .filter(({ v }) => hasValue(v));
          if (visible.length === 0) return null;
          return (
            <div key={g.title}>
              <div className="text-[10.5px] font-extrabold uppercase tracking-[.06em] text-forest mb-1.5">{g.title}</div>
              <dl className="space-y-1.5">
                {visible.map(({ f, v }) => (
                  <div key={f.key} className="grid grid-cols-[140px_1fr] gap-3 items-start">
                    <dt className="text-[11.5px] font-bold text-muted pt-0.5">{f.label}</dt>
                    <dd className="text-[13px] text-ink">{f.render ? f.render(v) : to12h(String(v))}</dd>
                  </div>
                ))}
              </dl>
            </div>
          );
        })}
        {/* Oct 2 client fix (UI plan §5): View Full Application — every
            question the applicant answered, with the exact submitted answer
            (the groups above are a curated summary). */}
        <details className="rounded-[12px] border border-forest/20 bg-paper">
          <summary className="cursor-pointer px-3 py-2 text-[12px] font-extrabold text-forest">View full application (every answer, as submitted)</summary>
          <dl className="px-3 pb-3 space-y-1.5">
            {kind === 'volunteer' && !('contactMethods' in payload) && !('maritalStatus' in payload)
              && String(receivedAt ?? '') >= '2026-08-01' && (
              <div className="rounded-[10px] bg-clay-soft/60 px-3 py-2 text-[12px] text-clay">
                This sign-up arrived while the server was not saving the full form (Aug – Oct 2, 2026).
                Only the answers below were kept — the rest of the questions need to be asked again.
              </div>
            )}
            {flattenAnswers(payload).map(([k, v]) => (
              <div key={k} className="grid grid-cols-[180px_1fr] gap-3 items-start">
                <dt className="text-[11.5px] font-bold text-muted pt-0.5 break-words">{k}</dt>
                <dd className="text-[13px] text-ink whitespace-pre-wrap break-words">{to12h(v)}</dd>
              </div>
            ))}
          </dl>
        </details>
      </div>
    </div>
  );
}

// Oct 2 client: show the form's question wording, not field names.
const ANSWER_LABELS: Record<string, string> = {
  firstName: 'First name', lastName: 'Last name', phone: 'Phone number', email: 'Email address',
  homeAddress: 'Home address', homeNeighborhood: 'Home address / neighborhood', maritalStatus: 'Marital status',
  reference: 'Reference — someone who knows you', name: 'Name', number: 'Phone number', relationship: 'Relationship',
  appAccess: 'Do you have access to use our volunteer app?', contactMethods: 'How should we contact you?',
  contactMethod: 'Main contact method', notificationMethod: 'Primary notification method',
  smsQuietStart: 'Quiet hours — from', smsQuietEnd: 'Quiet hours — until',
  pickupInterest: 'I am interested in', vehicleCapacity: 'Vehicle — approximate pickup capacity',
  loadType: 'What type of loads can you handle?', loadOther: 'Other type of load',
  availableTimes: 'What times are you usually available?', preferredDayTime: 'Preferred day or time',
  flexibleContact: 'In case of need, can we contact you at a different time?',
  areas: 'Which areas can you serve?', areaOther: 'Other area',
  dispatching: 'Dispatching', centerStocking: 'Center help',
  days: 'Available days', shifts: 'Available shifts', commitment: 'How many shifts can you commit to?',
  tasks: 'I would like to help with', hoursPerShift: 'Hours per shift', times: 'What time of day?',
  anythingElse: "Anything else you'd like us to know?", feedback: 'Suggestions or feedback to improve the program',
  pickupsPerWeek: 'Pickups per week', daysTimesAvailable: 'Days / times available', emergencyContact: 'Emergency contact',
  neighborhoodIds: 'Neighborhoods', extraAnswers: 'Extra questions',
  storeName: 'Store name', address: 'Address', hoursAvailable: 'Hours available for pickup',
  latestPickupCutoff: 'Latest pickup time', parking: 'Parking', arrivalLocation: 'Where should drivers arrive?',
  loadHelp: 'Can staff help load?', avgQuantity: 'Average quantity', foodTypes: 'Food types',
  coldChainNotes: 'Refrigeration / cold-chain notes', primaryContactName: 'Primary contact name',
  primaryContactPhone: 'Primary contact phone', backupContactName: 'Backup contact name',
  backupContactPhone: 'Backup contact phone', frequency: 'How often',
  // Oct 9 client: new sign-up questions.
  onCallSlots: 'Can we call you when a pickup is waiting? (days and hours)',
  wantsPickupTexts: 'Do you want texts when a pickup needs a driver?',
  wantsUncoveredAlerts: 'Also text you when a pickup still has no driver (urgent)?',
  wantsSteadyReminders: 'Reminder text before a regular (steady) pickup?',
  steadyReminderMinutes: 'Reminder — minutes before',
  // Oct 9 client: store sign-up questions.
  textsOk: 'OK to text you when a driver is on the way?',
  driverDirections: 'Where should the driver park and go in?',
  latestPickupCutoffText: 'Latest pickup time', preferredContactMethod: 'Best way to reach you',
  // Oct 30 client: runs to Lakewood / Fallsburg.
  travelPlaces: 'Do you ever drive to Lakewood or Fallsburg?', travelDays: 'Lakewood / Fallsburg — which days usually?',
};
function answerLabel(k: string): string {
  return ANSWER_LABELS[k] ?? k.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}
function flattenAnswers(obj: any, prefix = ''): [string, string][] {
  const out: [string, string][] = [];
  for (const [k, v] of Object.entries(obj ?? {})) {
    const key = prefix ? `${prefix} › ${answerLabel(k)}` : answerLabel(k);
    if (v && typeof v === 'object' && !Array.isArray(v)) out.push(...flattenAnswers(v, key));
    // Oct 9: lists of objects (on-call hours) read as "monday 21:00 01:00", not [object Object].
    else out.push([key, Array.isArray(v) ? (v.length ? v.map((e) => (e && typeof e === 'object' ? Object.values(e).join(' ') : String(e))).join(', ') : '(blank)') : v == null || v === '' ? '(blank)' : String(v)]);
  }
  return out;
}

function hasValue(v: any) {
  if (v === null || v === undefined || v === '') return false;
  if (Array.isArray(v) && v.length === 0) return false;
  return true;
}
function pretty(v: string) { return v.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()); }
function joinList(arr: any) { return Array.isArray(arr) ? arr.map(pretty).join(', ') : String(arr); }

type IntakeField = { key: string; label: string; render?: (v: any) => string };
type IntakeGroup = { title: string; fields: IntakeField[] };

// Oct 9 client: groups match the short store sign-up (store, contact incl.
// email + texts OK + backup, the food). Old-form answers still show under
// "Older questions" for stores that signed up before Oct 9.
const SUPPLIER_GROUPS: IntakeGroup[] = [
  { title: 'Store details', fields: [
    { key: 'storeName',          label: 'Store name' },
    { key: 'address',            label: 'Address' },
    { key: 'driverDirections',   label: 'Park & go in' },
  ]},
  { title: 'Contact', fields: [
    { key: 'primaryContactName', label: 'Contact' },
    { key: 'primaryContactPhone',label: 'Phone' },
    { key: 'email',              label: 'Email' },
    { key: 'textsOk',            label: 'Texts OK?', render: pretty },
    { key: 'backupContactName',  label: 'Backup contact' },
    { key: 'backupContactPhone', label: 'Backup phone' },
  ]},
  { title: 'The food', fields: [
    { key: 'foodTypes',          label: 'Food types', render: joinList },
    { key: 'avgQuantity',        label: 'About how much' },
  ]},
  { title: 'Older questions', fields: [
    { key: 'hoursAvailable',     label: 'Days & hours' },
    { key: 'latestPickupCutoffText', label: 'Latest cutoff' },
    { key: 'parking',            label: 'Parking' },
    { key: 'arrivalLocation',    label: 'On arrival' },
    { key: 'loadHelp',           label: 'Load help', render: pretty },
    { key: 'coldChainNotes',     label: 'Cold-chain notes' },
    { key: 'preferredContactMethod', label: 'Best way to reach', render: pretty },
    { key: 'frequency',          label: 'Frequency', render: pretty },
  ]},
];

// Reach into nested payload keys like `dispatching.days` so the admin card can
// break out every sub-field as its own row instead of one crammed line.
function getPath(obj: any, path: string) {
  return path.split('.').reduce<any>((acc, k) => (acc == null ? acc : acc[k]), obj);
}

const VOLUNTEER_GROUPS: IntakeGroup[] = [
  { title: 'Contact', fields: [
    { key: 'firstName',                     label: 'First name' },
    { key: 'lastName',                      label: 'Last name' },
    { key: 'phone',                         label: 'Phone' },
    { key: 'email',                         label: 'Email' },
    { key: 'homeAddress',                   label: 'Home address' },
    { key: 'homeNeighborhood',              label: 'Home base' },
    { key: 'emergencyContact',              label: 'Emergency contact' },
    { key: 'maritalStatus',                 label: 'Marital status', render: pretty },
  ]},
  { title: 'Reference', fields: [
    { key: 'reference.name',                label: 'Name' },
    { key: 'reference.number',              label: 'Phone' },
    { key: 'reference.relationship',        label: 'Relationship' },
  ]},
  { title: 'App & communication', fields: [
    { key: 'appAccess',                     label: 'Has app access?',    render: pretty },
    { key: 'contactMethods',                label: 'Contact methods',    render: joinList },
    { key: 'contactMethod',                 label: 'Contact method (legacy)', render: pretty },
    { key: 'notificationMethod',            label: 'Notify by (legacy)', render: pretty },
  ]},
  // Oct 9 client: texts, reminders and on-call answers.
  { title: 'Texts, reminders & on call', fields: [
    { key: 'wantsPickupTexts',              label: 'Pickup texts?',       render: pretty },
    { key: 'wantsUncoveredAlerts',          label: 'Urgent no-driver texts?', render: pretty },
    { key: 'wantsSteadyReminders',          label: 'Steady reminders?',   render: pretty },
    { key: 'steadyReminderMinutes',         label: 'Reminder before', render: (v) => `${v} minutes` },
    { key: 'smsQuietStart',                 label: 'Quiet from',          render: (v) => to12h(String(v)) },
    { key: 'smsQuietEnd',                   label: 'Quiet until',         render: (v) => to12h(String(v)) },
    { key: 'onCallSlots',                   label: 'OK to call', render: (v) => (Array.isArray(v) ? v.map((o: any) => `${pretty(String(o.day))} ${to12h(String(o.start))}–${to12h(String(o.end))}`).join(', ') : String(v)) },
  ]},
  { title: 'Pickup preferences', fields: [
    { key: 'pickupInterest',                label: 'Interested in',      render: pretty },
    { key: 'vehicleType',                   label: 'Vehicle',            render: pretty },
    { key: 'vehicleCapacity',               label: 'Capacity',           render: pretty },
    { key: 'loadType',                      label: 'Loads',              render: pretty },
    { key: 'loadOther',                     label: 'Load — other' },
    { key: 'refrigeratedHandling',          label: 'Refrigerated OK',    render: pretty },
    { key: 'liftHeavier',                   label: 'Lift',               render: pretty },
  ]},
  { title: 'Availability', fields: [
    { key: 'availableTimes',                label: 'Times available',     render: joinList },
    { key: 'preferredDayTime',              label: 'Preferred day / time' },
    { key: 'flexibleContact',               label: 'Flex contact time',   render: pretty },
    { key: 'pickupsPerWeek',                label: 'Per week (legacy)' },
    { key: 'daysTimesAvailable',            label: 'Days/times (legacy)' },
    { key: 'extraPickupOk',                 label: 'Extra pickup OK',     render: pretty },
    { key: 'moreOnDayOk',                   label: 'More on day OK',      render: pretty },
    { key: 'reliablyOnTime',                label: 'Reliably on time',    render: pretty },
  ]},
  { title: 'Service area', fields: [
    { key: 'areas',                         label: 'Areas',               render: joinList },
    { key: 'areaOther',                     label: 'Area — other' },
  ]},
  // Oct 30 client: runs to our Lakewood / Fallsburg locations (sets the 🚚 tags).
  { title: 'Lakewood / Fallsburg', fields: [
    { key: 'travelPlaces',                  label: 'Drives to',           render: joinList },
    { key: 'travelDays',                    label: 'Which days usually' },
  ]},
  { title: 'Dispatching (opt-in)', fields: [
    { key: 'dispatching.days',              label: 'Available days',      render: joinList },
    { key: 'dispatching.shifts',            label: 'Available shifts',    render: joinList },
    { key: 'dispatching.commitment',        label: 'Shifts committed', render: (v) => `${v} shift${String(v) === '1' ? '' : 's'}` },
  ]},
  { title: 'Center Stocking (opt-in)', fields: [
    { key: 'centerStocking.tasks',          label: 'Tasks',               render: joinList },
    { key: 'centerStocking.hoursPerShift',  label: 'Hours per shift', render: (v) => `${v} hours` },
    { key: 'centerStocking.days',           label: 'Available days',      render: joinList },
    { key: 'centerStocking.times',          label: 'Available times',     render: joinList },
  ]},
  { title: 'Suggestions & Feedback', fields: [
    { key: 'anythingElse',                  label: 'Anything else' },
    { key: 'feedback',                      label: 'Feedback' },
  ]},
  { title: 'Other', fields: [
    { key: 'gasCompensation',               label: 'Gas comp',            render: pretty },
  ]},
];

/**
 * Type-to-search supplier picker. Replaces the plain <select> in the pickup
 * forms so office staff can jump to a supplier by typing part of the name
 * or city instead of scrolling a 100+ item dropdown. Selection is by id,
 * mirroring the <select> contract so the parent state doesn't change shape.
 */
// =============================== Quick-add pickup ===========================

/**
 * Modal for the coordinator to quickly add a one-time pickup that's not tied
 * to a steady-pickup template. Either picks an existing supplier or types in
 * a one-time donor's address. Optionally pre-assigns a driver in one step.
 */
// Oct 11 client: New pickup — fields filled from the chosen store, and the store's address as one line.
type AutoKey = 'donor' | 'addr' | 'cn' | 'cp' | 'pi' | 'food';
type StoreFound = { name: string; address: string; line1: string | null; city: string | null; state: string | null; zip: string | null; phone: string | null };
function storeAddressLine(s: any): string {
  const line1 = String(s?.addressLine1 ?? s?.address_line1 ?? '').trim();
  const city = String(s?.city ?? '').trim();
  if (!line1) return '';
  return city && !line1.toLowerCase().includes(city.toLowerCase()) ? `${line1}, ${city}` : line1;
}

// Oct 11 client: "It should suggest both and ask us: use one of these, or another one?" —
// past contacts (+ the address/notes used with them) for the typed store/name/address/phone,
// most used first. Served by GET /api/pickups/past-contacts.
type PastOpt = { key: string; name: string | null; phone: string | null; uses: number; lastDate: string | null; address: string | null; instructions: string | null; isStore: boolean; place?: string | null;
                 extraContacts?: Array<{ name: string | null; phone: string }> };
const phoneDigits = (v: any) => String(v ?? '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
// Oct 12 client: "845-422-0191" in the "Used before" list (other shapes shown as typed).
const dashPhone = (v: any) => { const d = phoneDigits(v); return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : String(v ?? '').trim(); };
const normText = (v: any) => String(v ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
function pastOptMatches(o: PastOpt, name: string, phone: string): boolean {
  if (o.phone) return phoneDigits(o.phone) === phoneDigits(phone) && (!o.name || !name.trim() || normText(o.name) === normText(name));
  return !!o.name && normText(o.name) === normText(name) && !phone.trim();
}

export function QuickPickupModal({ pickup, duplicateFrom, onClose, onDone, title }: { pickup?: any | null; duplicateFrom?: any | null; onClose: () => void; onDone: () => void; title?: string }) { // Nov 1 client: + title (pickup from a donation email)
  const editing = !!pickup;
  // Oct 2 client fix (UI plan §3 Duplicate): prefill supplier, address,
  // contacts, instructions, details, time and driver count from another
  // pickup, but create a NEW pickup dated today with no drivers.
  const src: any = pickup ?? duplicateFrom ?? null;
  const prefill = !!src;
  const now = new Date();
  // abc899 (Aug 20): the previous fix (abc881) did a toLocaleString → new Date
  // round-trip which STILL parsed in the browser's local zone. At 10:19 PM EDT
  // that flipped the date to tomorrow UTC. Format the NY-local date directly
  // with Intl.DateTimeFormat('en-CA') which yields YYYY-MM-DD in one step, no
  // Date reparse. Verified: at 10:19 PM EDT Aug 20, returns "2026-08-20".
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(now);
  // Default to *right now* (HH:MM) — for walk-ins the pickup goes on the queue
  // immediately. If a coordinator needs a future slot they can just edit the
  // time field. Previously we defaulted to the next round hour, which pushed
  // 8:30 arrivals to a 9:00 pickup for no good reason.
  const nowHHMM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const qc = useQueryClient();
  const suppliers = useQuery({ queryKey: ['admin-suppliers'], queryFn: () => api<{ data: any[] }>('/api/suppliers?limit=500&logo=url') });
  const volunteers = useQuery({ queryKey: ['admin-volunteers'], queryFn: () => api<{ data: any[] }>('/api/volunteers?limit=500') });
  const groups = useQuery({ queryKey: ['sms-groups'], queryFn: () => volunteerGroups.list(), enabled: !editing });
  const groupList: VolunteerGroup[] = (groups.data as any)?.data ?? [];
  const defaultGroup = groupList.find((g) => g.is_default_broadcast) ?? groupList[0];
  // batch abc820 Aug 11 — "Send to drivers" is a single checkbox that gates
  // the whole broadcast section. Default ON at create-time (this is the
  // dispatcher's typical workflow); OFF at edit-time (no re-broadcast).
  // Oct 12 client: default UNTICKED — a new pickup is texted at the top of the hour before its
  // time (9:53 PM → 9:00 PM). Ticked = text it now (the old behaviour).
  const [sendToDrivers, setSendToDrivers] = useState<boolean>(false);
  const [noTextNow, setNoTextNow] = useState<boolean>(false); // Oct 14 client
  const [smsGroupId, setSmsGroupId] = useState<number | ''>('');
  useEffect(() => { if (!editing && defaultGroup && smsGroupId === '') setSmsGroupId(defaultGroup.id); }, [editing, defaultGroup?.id]);

  // For an editing modal, find the supplier id from the comma-joined name(s) on the row.
  const initialSupId = (() => {
    if (!prefill) return '' as number | '';
    const list = suppliers.data?.data ?? [];
    const firstName = (src.suppliers ?? '').split(',')[0]?.trim();
    const match = list.find((s: any) => s.name === firstName);
    // Oct 11 client: ids come from the API as strings — a string id skipped the store fill.
    return (match ? Number(match.id) : '') as number | '';
  })();
  const initialSignups: any[] = editing ? (pickup.signups ?? []) : [];
  const initialVIds: number[] = initialSignups.map((s: any) => Number(s.volunteer_id)).filter(Number.isFinite);

  const [date, setDate]         = useState<string>(editing ? String(pickup.scheduled_date).slice(0, 10) : today);
  // Oct 5 client: Duplicate starts at the current time; only Edit keeps the pickup's own time.
  const [time, setTime]         = useState<string>(editing ? String(pickup.scheduled_time ?? '').slice(0, 5) : nowHHMM);
  // Oct 12 client: when the new-pickup text goes out if "Text drivers now" stays unticked —
  // the top of the pickup's hour (exactly 1:00 PM → 1:00 PM), right away once that hour has come.
  // Same rule as the server (new-pickup-slot.ts); on Shabbos the server waits until after.
  const textSlot = (() => {
    const hh = /^(\d{1,2}):/.exec(time ?? '')?.[1];
    if (!date || hh == null) return null;
    const slot = `${date} ${hh.padStart(2, '0')}:00`;
    const nowNy = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
    if (slot <= nowNy.slice(0, 16)) return { now: true, label: '' };
    return { now: false, label: whenText(date, `${String(Number(hh)).padStart(2, '0')}:00`, today) }; // Oct 23 client: one format
  })();
  const [supplierId, setSupId]  = useState<number | ''>(initialSupId);
  // Client Aug 7 item 2: donorName is the PUBLIC "store / hall" name that
  // shows on the driver SMS; contactName is the INTERNAL person name that
  // is never surfaced to drivers.
  const [donorName, setDonor]   = useState<string>(prefill ? (src.donor_name ?? '') : '');
  const [foodDescription, setFood] = useState<string>(prefill ? (src.food_description ?? '') : '');
  // Nov 6 client: "which caterer the food is coming from" (optional; prints on the kiosk labels).
  const initialCaterer = String(src?.caterer ?? '').trim();
  const [caterer, setCaterer] = useState<string>(prefill ? initialCaterer : '');
  const catererNames = useQuery({ queryKey: ['caterer-names'], staleTime: 5 * 60_000,
    queryFn: () => api<{ data: string[] }>('/api/pickup-instances/caterer-names') });
  const [pickupAddress, setAddr] = useState<string>(prefill ? (src.pickup_address ?? src.supplier_address ?? '') : '');
  // Feature 3 (notes split): "Instructions for Volunteer" = driver-facing
  // pickup_instructions (fold in any legacy special_instructions, also
  // driver-facing). Internal office notes get their OWN field below and are
  // never sent to volunteers.
  const [pickupInstructions, setPI] = useState<string>(prefill
    ? [src.pickup_instructions, src.special_instructions].filter(Boolean).join('\n').trim()
    : '');
  const [notes, setNotes] = useState<string>(prefill ? (src.notes ?? '') : '');
  const [contactName, setCN]    = useState<string>(prefill ? (src.contact_name ?? '') : '');
  const [contactPhone, setCP]   = useState<string>(prefill ? (src.contact_phone ?? '') : '');
  // Oct 12 client: "+ Add another contact" — up to 3 more (name optional + phone).
  const [extraContacts, setExtrasRaw] = useState<ExtraContact[]>(prefill ? readExtraContacts(src.extra_contacts) : []);
  const extrasTouched = useRef(false);
  const setExtras = (v: ExtraContact[]) => { extrasTouched.current = true; setExtrasRaw(v); };
  const [urgency, setUrgency]   = useState<'normal' | 'urgent'>(prefill && src.urgency_level === 'urgent' ? 'urgent' : 'normal');
  const [slotsCapacity, setSlots] = useState<number>(prefill ? Number(src.slots_capacity ?? 1) : 1);
  // Per-slot driver pickers. Length always tracks slotsCapacity via effect
  // below so adjusting Drivers Needed adds/removes rows in place.
  const [driverPicks, setDriverPicks] = useState<Array<number | ''>>(() => {
    const arr: Array<number | ''> = Array.from({ length: 1 }, () => '' as const);
    initialVIds.slice(0, 5).forEach((id, i) => { arr[i] = id; });
    return arr;
  });
  useEffect(() => {
    setDriverPicks((prev) => {
      const next = prev.slice(0, slotsCapacity);
      while (next.length < slotsCapacity) next.push('');
      return next;
    });
  }, [slotsCapacity]);

  // Admin-control additions (kept as separate state so the edit surface still
  // reaches everything). Contact-email removed from the form per spec.
  const [status, setStatus]     = useState<string>(editing ? String(pickup.status ?? '') : '');
  const toLocalInput = (ts: any) => {
    if (!ts) return '';
    const d = new Date(ts); if (isNaN(d.getTime())) return '';
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  };
  // Oct 6 client: hidden option — how long drivers keep getting this pickup after its
  // time (default 6 hours). Saved as must_pickup_by = pickup time + N hours.
  const [offerHours, setOfferHours] = useState<string>(() => {
    if (!editing || !pickup?.must_pickup_by || !pickup?.scheduled_date) return '';
    const start = new Date(`${String(pickup.scheduled_date).slice(0, 10)}T${String(pickup.scheduled_time ?? '00:00').slice(0, 5)}:00`);
    const h = Math.round((new Date(pickup.must_pickup_by).getTime() - start.getTime()) / 3600e3);
    return Number.isFinite(h) && h > 0 && h !== 6 ? String(h) : '';
  });
  void toLocalInput;
  const [showMore, setShowMore]   = useState(false);
  // xyz122 test-mode: office coordinators tick this to create a pickup that
  // will NOT be broadcast to real drivers. Backend logs the intended body to
  // test_broadcast_log; nothing goes out via SMS/push. Never editable after
  // create — flag is set once at insert time.
  const [isTest, setIsTest]       = useState<boolean>(editing ? !!pickup.is_test : false);
  // Oct 12 client: "Form submitted by" — required on a new pickup (default = this browser's
  // last choice). Edit shows the saved value; old pickups with none are not blocked.
  const [subBy, setSubBy] = useState<SubmittedByState>(() => (editing ? parseSubmittedBy(pickup.submitted_by) : loadLastSubmittedBy()));
  // Aug 26 client ask: optional Small/Large marker. Both unchecked = null (default).
  const [size, setSize] = useState<'small' | 'large' | null>(
    prefill && (src?.size === 'small' || src?.size === 'large') ? src.size : null,
  );
  // Oct 8 client: Deliveries — from 3 Regina (the office) to a saved family.
  const [isDelivery, setIsDelivery] = useState<boolean>(prefill ? (src?.pickup_type === 'delivery' || !!src?.destination_recipient_id) : false);
  const [familyId, setFamilyId] = useState<number | ''>(prefill && src?.destination_recipient_id ? Number(src.destination_recipient_id) : '');
  function chooseDelivery(on: boolean) {
    setIsDelivery(on);
    if (on) {
      setSupId('');
      if (!pickupAddress.trim()) setAddr(OFFICE_ADDRESS);
    } else if (pickupAddress === OFFICE_ADDRESS) {
      setAddr('');
    }
  }

  // Auto-fill from supplier selection. Tracks which fields the user has
  // manually touched so we DON'T clobber those on subsequent supplier
  // selections. Empty user input counts as "not touched" and lets auto-fill run.
  // Aug 26: also track pickup-instructions + food-description so the
  // last-used-values fetch below can pre-populate them without clobbering
  // anything the office has already typed.
  const touchedRef = useRef<{ donor: boolean; addr: boolean; cn: boolean; cp: boolean; pi: boolean; food: boolean }>({
    donor: !!(prefill && src?.donor_name),
    addr:  !!(prefill && (src?.pickup_address || src?.supplier_address)),
    cn:    !!(prefill && src?.contact_name),
    cp:    !!(prefill && src?.contact_phone),
    pi:    !!(prefill && src?.pickup_instructions),
    food:  !!(prefill && src?.food_description),
  });
  // Oct 11 client: "When I choose a saved store in New pickup, it never helped me — I still had
  // to type the address." The supplier list sends addressLine1 / contactName / contactPhone
  // (camelCase) but this read address_line1 / contact_name / contact_phone, so only the name
  // (and a bare city) filled. Now: fill from the store, and when the office switches to another
  // store, replace whatever the last store filled in (never what the office typed).
  const autoRef = useRef<Record<AutoKey, string>>({ donor: '', addr: '', cn: '', cp: '', pi: '', food: '' });
  const canFill = (k: AutoKey, cur: string) => (!cur && !touchedRef.current[k]) || (!!cur && cur === autoRef.current[k]);
  // Oct 11 client: what the office TYPED (not what was auto-filled) drives the "Used before"
  // lookup, so filling from a suggestion doesn't re-run it. contactChosenRef = the office
  // picked a suggestion for this store (or for typed info), so nothing auto-replaces it.
  const [typedQ, setTypedQ] = useState<{ name: string; addr: string; phone: string; contact: string }>({ name: '', addr: '', phone: '', contact: '' });
  const typed = (k: 'name' | 'addr' | 'phone' | 'contact', v: string) => setTypedQ((p) => (p[k] === v ? p : { ...p, [k]: v }));
  const contactChosenRef = useRef<number | 'typed' | null>(null);
  const selectedStore: any = typeof supplierId === 'number'
    ? (suppliers.data?.data ?? []).find((r: any) => Number(r.id) === supplierId) : undefined;
  const storeAddr = storeAddressLine(selectedStore);
  // Oct 16 client: "Stamford Yeshiva - 51 Carlton Rd" with no saved address → fill "51 Carlton Rd".
  const fillAddr = storeFillAddress(storeAddr, selectedStore?.name);
  useEffect(() => {
    if (typeof supplierId !== 'number') return;
    const s = selectedStore;
    if (!s) return;
    const fill = (k: AutoKey, cur: string, val: string, set: (v: string) => void) => {
      if (canFill(k, cur)) { set(val); autoRef.current[k] = val; }
    };
    fill('donor', donorName, String(s.name ?? ''), setDonor);
    fill('addr', pickupAddress, fillAddr, setAddr);
    fill('cn', contactName, String(s.contactName ?? ''), setCN);
    fill('cp', contactPhone, String(s.contactPhone ?? ''), setCP);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplierId, suppliers.data]);

  // Aug 26 client ask: when picking a supplier we have used before, offer
  // the notes/instructions used previously (steady template if any, else
  // most recent instance). The office can edit or clear before saving —
  // we only populate empty, un-touched fields. Endpoint returns null values
  // when there is no prior data, which naturally leaves the form blank.
  useEffect(() => {
    if (typeof supplierId !== 'number' || !date) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await api<{ data: {
          pickupInstructions:  string | null;
          foodDescription:     string | null;
          specialInstructions: string | null;
          contactName:         string | null;
          contactPhone:        string | null;
          source:              'steady' | 'instance' | null;
        } }>(`/api/suppliers/${supplierId}/last-pickup-defaults?date=${encodeURIComponent(date)}`);
        const d = r?.data;
        if (!d || cancelled) return;
        // Oct 11 client: read the CURRENT value (the store fill above may have just set it).
        // Fills empty fields, or replaces what the previous store filled; never what was typed.
        const put = (k: AutoKey, val: string | null | undefined, set: (f: (p: string) => string) => void) => set((prev) => {
          const mine = !!prev && prev === autoRef.current[k];
          if (!mine && (prev || touchedRef.current[k])) return prev;
          const next = String(val ?? '');
          if (!next && !mine) return prev;
          autoRef.current[k] = next;
          return next;
        });
        put('pi',   d.pickupInstructions, setPI);
        put('food', d.foodDescription,    setFood);
        // Oct 11 client: the contact now defaults to the MOST USED past contact ("Used before" below).
      } catch { /* silent — auto-fill is best-effort */ }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplierId, date]);

  // When loading suppliers list resolves AFTER first render, re-sync the id.
  useEffect(() => {
    if (prefill && supplierId === '' && suppliers.data?.data?.length) {
      const list = suppliers.data.data;
      const firstName = (src.suppliers ?? '').split(',')[0]?.trim();
      const match = list.find((s: any) => s.name === firstName);
      if (match) setSupId(Number(match.id)); // Oct 11 client: number, not the API's string id
    }
  }, [editing, suppliers.data, pickup]);

  // Oct 11 client: the store's address shows as one line ("📍 59 NY-59, Monsey · change");
  // "change" opens the normal box for a one-off address on this pickup only.
  const [addrOpen, setAddrOpen] = useState(false);
  const addrWrap = useRef<HTMLDivElement | null>(null);
  useEffect(() => { setAddrOpen(false); setSavePick(null); }, [supplierId]);
  const showAddrLine = !isDelivery && !addrOpen && !!storeAddr && pickupAddress === storeAddr;
  function openAddrBox() {
    setAddrOpen(true);
    setTimeout(() => { const i = addrWrap.current?.querySelector('input'); i?.focus(); i?.select(); }, 0);
  }
  // Oct 11 client: a saved store with NO address is looked up by its name (office route, same
  // Monsey-area + confidence rules as Find missing locations). "Use this" fills the pickup and
  // saves the address to the store so it's never asked again.
  const [lookup, setLookup] = useState<{ id: number; state: 'loading' | 'found' | 'none' | 'saving' | 'dismissed' | 'used'; found?: StoreFound; err?: string } | null>(null);
  useEffect(() => {
    const id = supplierId;
    if (isDelivery || typeof id !== 'number' || !selectedStore || storeAddr) { setLookup(null); return; }
    let live = true;
    setLookup({ id, state: 'loading' });
    api<{ data: { found: StoreFound | null } }>('/api/geocode/office/store-lookup', { method: 'POST', body: JSON.stringify({ supplierId: id }) })
      .then((d) => { if (live) setLookup(d?.data?.found ? { id, state: 'found', found: d.data.found } : { id, state: 'none' }); })
      .catch(() => { if (live) setLookup({ id, state: 'none' }); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplierId, isDelivery, !!selectedStore, storeAddr]);
  const showFound = !!lookup && lookup.id === supplierId && (lookup.state === 'found' || lookup.state === 'saving') && !pickupAddress.trim() && !addrOpen;
  async function useFound() {
    if (!lookup?.found || typeof supplierId !== 'number') return;
    const id = supplierId, f = lookup.found;
    setLookup({ id, state: 'saving', found: f });
    const line = storeAddressLine({ addressLine1: f.line1, city: f.city }) || f.address;
    setAddr(line); autoRef.current.addr = line;
    try {
      const r = await api<{ data: { saved: boolean; store?: any; why?: string } }>('/api/geocode/office/store-lookup/save', { method: 'POST', body: JSON.stringify({ supplierId: id }) });
      const st = r?.data?.store;
      const l2 = storeAddressLine(st);
      if (l2) { setAddr((prev) => (prev === line ? l2 : prev)); autoRef.current.addr = l2; }
      setLookup({ id, state: 'used', found: f, err: r?.data?.saved ? undefined : 'Not saved to the store — it is still on this pickup.' });
      qc.invalidateQueries({ queryKey: ['admin-suppliers'] });
    } catch {
      setLookup({ id, state: 'used', found: f, err: 'Not saved to the store — it is still on this pickup.' });
    }
  }
  // Oct 11 client: no confident match — when the office picks a Google address for a store
  // with no address, offer "Save this address to <store>" (saved when the pickup is saved).
  const [savePick, setSavePick] = useState<{ placeId: string; address: string; on: boolean } | null>(null);
  const showSavePick = !!savePick && !isDelivery && typeof supplierId === 'number' && !!selectedStore && !storeAddr && savePick.address === pickupAddress;

  // Oct 11 client: "Used before" — debounced lookup by store id, else typed name / address /
  // phone / contact name (server tries them in that order, last ~12 months).
  const pastQs = (() => {
    const qs = new URLSearchParams();
    if (typeof supplierId === 'number') { qs.set('supplierId', String(supplierId)); return qs.toString(); }
    if (normText(typedQ.name).length >= 4) qs.set('name', typedQ.name.trim());
    if (normText(typedQ.addr).length >= 6) qs.set('address', typedQ.addr.trim());
    if (phoneDigits(typedQ.phone).length >= 7) qs.set('phone', typedQ.phone.trim());
    if (normText(typedQ.contact).length >= 4) qs.set('contact', typedQ.contact.trim());
    return qs.toString();
  })();
  const [pastKey, setPastKey] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setPastKey(pastQs), typeof supplierId === 'number' ? 0 : 450);
    return () => clearTimeout(t);
  }, [pastQs, supplierId]);
  const pastQ = useQuery({
    queryKey: ['past-contacts', pastKey],
    queryFn: () => api<{ data: { matchedBy: string | null; options: PastOpt[] } }>(`/api/pickups/past-contacts?${pastKey}`),
    enabled: !!pastKey && !isDelivery,
    staleTime: 60_000,
  });
  const pastFor = pastKey === pastQs ? pastKey : '';
  const pastOpts: PastOpt[] = (pastFor && !isDelivery ? pastQ.data?.data?.options : null) ?? [];
  const storeMode = typeof supplierId === 'number';
  const showPast = pastOpts.length >= 2 || (!storeMode && pastOpts.length >= 1);
  const pastSel = pastOpts.find((o) => pastOptMatches(o, contactName, contactPhone))?.key ?? 'other';
  const [pastMore, setPastMore] = useState(false);
  useEffect(() => { setPastMore(false); }, [pastFor]);
  // A picked store: default to the most used contact (fields it auto-filled only, never typed ones).
  useEffect(() => {
    if (editing || !storeMode || !pastOpts.length || contactChosenRef.current === supplierId) return;
    const top = pastOpts[0];
    const n = String(top.name ?? ''), ph = String(top.phone ?? '');
    if (canFill('cn', contactName) && canFill('cp', contactPhone)) {
      setCN(n); setCP(ph); autoRef.current.cn = n; autoRef.current.cp = ph;
      if (!extrasTouched.current) setExtrasRaw(readExtraContacts(top.extraContacts)); // Oct 12 client
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pastQ.data, pastFor]);
  const contactNameRef = useRef<HTMLInputElement | null>(null);
  function choosePast(o: PastOpt | null) {
    contactChosenRef.current = typeof supplierId === 'number' ? supplierId : 'typed';
    if (!o) {
      setCN(''); setCP(''); autoRef.current.cn = ''; autoRef.current.cp = '';
      setExtras([]);
      touchedRef.current.cn = true; touchedRef.current.cp = true;
      setTimeout(() => contactNameRef.current?.focus(), 0);
      return;
    }
    const n = String(o.name ?? ''), ph = String(o.phone ?? '');
    setCN(n); setCP(ph); autoRef.current.cn = n; autoRef.current.cp = ph;
    setExtras(readExtraContacts(o.extraContacts)); // Oct 12 client: the other contacts used with this one
    // The address used with this contact — unless a saved store's own address is in use.
    if (o.address && !(storeMode && storeAddr && pickupAddress === storeAddr)) { setAddr(o.address); autoRef.current.addr = o.address; }
    // Its notes — only into an empty (or auto-filled) instructions box.
    if (o.instructions && (!pickupInstructions.trim() || pickupInstructions === autoRef.current.pi)) { setPI(o.instructions); autoRef.current.pi = o.instructions; }
  }

  const isOneTime = supplierId === '';
  // Oct 30 client ("Bender" at 51 Carlton Road = Stamford Yeshiva): no store picked, but the address is ONE
  // saved store's → the server links that store on save; say so here. Matched on this page from the store
  // list already loaded (no request); only when that list isn't there (or is cut off), one small request.
  const addrKey = !isDelivery && isOneTime && !(editing && pickup?.steady_pickup_id) ? streetKey(pickupAddress) : null;
  const supList: any[] | undefined = suppliers.data?.data;
  const supListFull = !!supList && Number((suppliers.data as any)?.total ?? supList.length) <= supList.length;
  const addrStoreLocal = addrKey && supListFull ? oneStoreAtAddress(pickupAddress, supList!) : null;
  const [addrKeyQ, setAddrKeyQ] = useState<string | null>(null);
  useEffect(() => { const t = setTimeout(() => setAddrKeyQ(addrKey), 400); return () => clearTimeout(t); }, [addrKey]);
  const addrStoreQ = useQuery({
    queryKey: ['store-at-address', addrKeyQ],
    queryFn: () => api<{ data: { id: number; name: string } | null }>(`/api/pickup-instances/store-at-address?address=${encodeURIComponent(pickupAddress)}`),
    enabled: !!addrKeyQ && addrKeyQ === addrKey && !supListFull && !suppliers.isLoading,
    staleTime: 60_000,
  });
  const addrStore: { id: number | string; name: string } | null = addrKey
    ? (supListFull ? addrStoreLocal : (addrKeyQ === addrKey ? addrStoreQ.data?.data ?? null : null)) : null;
  // "Not this store": kept for this address only (typing another address asks again).
  const [notThisStore, setNotThisStore] = useState<string | null>(null);
  const addrStoreOn = !!addrStore && notThisStore !== addrKey;
  // Oct 14 client: "Text the contact when a driver is on the way" — per pickup. null = not touched:
  // one-time → unticked ("until we are ready"); a store → ticked only if that store's switch is on.
  const initialCN: boolean = editing ? !!pickup.contact_notice : false;
  const [contactNotice, setContactNotice] = useState<boolean | null>(editing ? initialCN : null);
  const cnStore = useQuery({ queryKey: ['sup-store-texts', supplierId], enabled: !editing && typeof supplierId === 'number',
    queryFn: () => api<{ data: { onTheWay?: boolean } }>(`/api/suppliers/${supplierId}/store-texts`) });
  const cnOn: boolean = contactNotice ?? (typeof supplierId === 'number' && !!(cnStore.data as any)?.data?.onTheWay);
  const cnStoreRow: any = typeof supplierId === 'number' ? (suppliers.data?.data ?? []).find((s: any) => Number(s.id) === supplierId) : null;
  const cnPhone = String((cnStoreRow?.contactPhone ?? cnStoreRow?.contact_phone) || contactPhone || '');
  // First non-empty driver pick, used for the create-time single volunteerId
  // the backend accepts. Additional pickers get attached after creation via
  // the pickup-volunteers add endpoint.
  const primaryDriverId = driverPicks.find((v) => typeof v === 'number') as number | undefined;
  const extraDriverIds  = driverPicks.filter((v, i): v is number => typeof v === 'number' && v !== primaryDriverId && i > driverPicks.indexOf(primaryDriverId as number));

  // Oct 25 client: "it circled ... we pressed it again, and the pickup came in twice". The moment Save
  // is pressed it is locked (a second click / Enter in the same instant does nothing) and stays locked
  // once saved; only an error unlocks it. The server also refuses the same pickup twice in 2 minutes.
  const submittingRef = useRef(false);
  const openAfterRef = useRef<number | null>(null); // a repeat: open the pickup that was already added
  // Oct 8: one ticket per form — a double-tap on Save can't make two pickups.
  const [clientRequestId] = useState(() => (globalThis.crypto as any)?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const payload = () => ({
    clientRequestId: editing ? undefined : clientRequestId,
    submittedBy: submittedByValue(subBy) ?? '', // Oct 12 client; Oct 14: always sent so the server knows this page asks it
    scheduledDate: date,
    scheduledTime: time.length === 5 ? `${time}:00` : time,
    supplierId: !isDelivery && typeof supplierId === 'number' ? supplierId : undefined,
    // Oct 30 client: "Not this store" pressed for this address → the server doesn't link it.
    noStoreLink: !!addrStore && notThisStore === addrKey ? true : undefined,
    isOneTime: isDelivery ? true : isOneTime,
    pickupType: isDelivery ? 'delivery' : isOneTime ? 'one_time' : (editing ? undefined : 'extra'),
    // Oct 8: the family a delivery goes to (cleared if switched back to a pickup).
    destinationRecipientId: isDelivery ? (typeof familyId === 'number' ? familyId : null) : (editing ? null : undefined),
    urgencyLevel: urgency,
    slotsCapacity,
    donorName:     donorName || null,
    contactName:   contactName || null,
    contactPhone:  contactPhone || null,
    // Oct 14 client: per-pickup contact text (edit: only when changed).
    contactNotice: isDelivery ? undefined : (editing ? (cnOn !== initialCN ? cnOn : undefined) : cnOn),
    // Oct 12 client: other contacts. An edit opened from a row without them leaves them as they are.
    extraContacts: editing && !extrasTouched.current && !('extra_contacts' in (pickup ?? {}))
      ? undefined : extraContactsPayload(extraContacts),
    // Contact email removed from the form; explicit null keeps the column
    // consistent for existing rows on edit.
    contactEmail:  null,
    pickupAddress: pickupAddress || null,
    // Feature 3 (notes split): volunteer-facing instructions and internal
    // office notes are now separate fields. special_instructions is folded
    // into pickupInstructions (both driver-facing), so it stays null; notes
    // now carries the admin-only text and is persisted (was previously nulled).
    pickupInstructions:  pickupInstructions || null,
    specialInstructions: null,
    notes:               notes || null,
    foodDescription: foodDescription || null,
    // Nov 6 client: edit sends it only when changed ('' = take it off).
    caterer: editing ? (caterer.trim() !== initialCaterer ? caterer.trim() : undefined) : (caterer.trim() || undefined),
    size,
    mustPickupBy: offerHours && date && time
      ? new Date(new Date(`${date}T${time.slice(0, 5)}:00`).getTime() + Number(offerHours) * 3600e3).toISOString()
      : (editing ? null : undefined),
    ...(editing
      ? {
          status: status || undefined,
          volunteerId: (typeof primaryDriverId === 'number' && !initialVIds.includes(primaryDriverId))
            ? primaryDriverId : undefined,
        }
      : {
          volunteerId: primaryDriverId,
          autoBroadcast: sendToDrivers,
          noTextNow: textSlot?.now ? noTextNow : undefined, // Oct 14 client
          smsGroupId: (sendToDrivers && typeof smsGroupId === 'number') ? smsGroupId : undefined,
          // xyz122: flag the pickup as test-mode. Backend suppresses ALL
          // driver-facing SMS and logs the intended body to test_broadcast_log.
          isTest,
        }),
  });

  // Feature 1 (repeat a previous pickup) — fill the form with descriptive
  // fields from the most-recent matching pickup. NEVER copies date/time/
  // must_pickup_by. Supplier selected → /suppliers/:id/last-pickup-defaults
  // (steady template or last instance); one-time (address/store typed, no
  // supplier) → /pickup-instances/previous. Prompts before overwriting.
  const [prevBusy, setPrevBusy] = useState(false);
  async function applyPreviousInfo() {
    setPrevBusy(true);
    try {
      let d: any = null;
      if (typeof supplierId === 'number') {
        const r = await api<{ data: any }>(`/api/suppliers/${supplierId}/last-pickup-defaults?date=${encodeURIComponent(date)}`);
        d = r?.data;
      } else if (pickupAddress.trim() || donorName.trim() || phoneDigits(contactPhone).length >= 7 || contactName.trim().length >= 3) {
        // Oct 12 client: "I typed only the phone and pressed it — nothing came up." The server
        // tries address > store name > phone > contact name and uses the first that matches.
        const qs = new URLSearchParams();
        if (pickupAddress.trim()) qs.set('address', pickupAddress.trim());
        if (donorName.trim())     qs.set('donor', donorName.trim());
        if (phoneDigits(contactPhone).length >= 7) qs.set('phone', contactPhone.trim());
        if (contactName.trim().length >= 3) qs.set('contact', contactName.trim());
        const r = await api<{ data: any }>(`/api/pickup-instances/previous?${qs.toString()}`);
        d = r?.data;
      } else {
        alert('Type a store, address, phone or contact name first.');
        return;
      }
      if (!d || d.source == null) { alert('No previous pickup found for this store, address, phone or contact name.'); return; }
      if (!(await uiConfirm('Previous pickup found. Use the same information?\n\nThe date and time you set will NOT be changed.'))) return;
      if (d.donorName)     { setDonor(String(d.donorName));    touchedRef.current.donor = true; }
      if (d.pickupAddress) { setAddr(String(d.pickupAddress)); touchedRef.current.addr = true; }
      if (d.contactName)   { setCN(String(d.contactName));     touchedRef.current.cn = true; }
      if (d.contactPhone)  { setCP(String(d.contactPhone));    touchedRef.current.cp = true; }
      if (Array.isArray(d.extraContacts) && d.extraContacts.length) setExtras(readExtraContacts(d.extraContacts)); // Oct 12 client
      if (d.foodDescription) { setFood(String(d.foodDescription)); touchedRef.current.food = true; }
      const instr = [d.pickupInstructions, d.specialInstructions].filter(Boolean).join('\n');
      if (instr) { setPI(instr); touchedRef.current.pi = true; }
      if (typeof d.slotsCapacity === 'number' && d.slotsCapacity > 0) {
        setSlots(Math.max(1, Math.min(5, Number(d.slotsCapacity))));
      }
      // Oct 12 client: found through a saved store (e.g. the store's phone) → pick that store too.
      if (typeof supplierId !== 'number' && !isDelivery && d.supplierId != null
          && (suppliers.data?.data ?? []).some((x: any) => Number(x.id) === Number(d.supplierId))) {
        setSupId(Number(d.supplierId));
      }
    } catch {
      alert('Could not load previous pickup info.');
    } finally {
      setPrevBusy(false);
    }
  }

  const save = useMutation({
    mutationFn: async () => {
      if (isDelivery && typeof familyId !== 'number') throw new Error('Pick the family this delivery goes to (or add a new family).');
      { const sbErr = submittedByError(subBy, !editing); if (sbErr) throw new Error(sbErr); } // Oct 12 client
      const res: any = editing
        ? await adminCRUD.patchPickup(pickup.id, payload())
        : await adminCRUD.createPickup(payload());
      if (!editing) saveLastSubmittedBy(subBy); // Oct 12 client: default for the next new pickup
      if (caterer.trim()) void qc.invalidateQueries({ queryKey: ['caterer-names'] }); // Nov 6 client: a new name joins the suggestions
      // Oct 25 client: a repeat ("already added a moment ago") — nothing more to add to it.
      if (!editing && (res?.duplicate || res?.repeated)) return res;
      // Oct 11 client: "Save this address to <store>" (ticked) — after the pickup itself saved.
      // Oct 25 client (speed): Save no longer waits for it (a Google lookup); it finishes on its own.
      if (showSavePick && savePick?.on && typeof supplierId === 'number') {
        void api('/api/geocode/office/store-lookup/save', { method: 'POST', body: JSON.stringify({ supplierId, placeId: savePick.placeId }) })
          .then(() => qc.invalidateQueries({ queryKey: ['admin-suppliers'] }))
          .catch(() => { /* the pickup is saved; the store can be fixed in Suppliers */ });
      }
      // Add any additional drivers beyond the primary. Only relevant at
      // create-time (edit-mode uses the DriverPickerModal to manage drivers).
      // Oct 25 client (speed): all at once, not one after another.
      if (!editing && extraDriverIds.length > 0) {
        const newId = res?.data?.id ?? res?.id;
        if (Number.isFinite(newId)) {
          await Promise.all(extraDriverIds.map((vid) => api(`/api/pickup-instances/${newId}/volunteers`, {
            method: 'POST', body: JSON.stringify({ volunteerId: vid }),
          }).catch(() => { /* non-fatal — dispatcher can retry from board */ })));
        }
      }
      return res;
    },
    onError: () => { submittingRef.current = false; }, // Oct 25 client: an error unlocks Save (same ticket: still one pickup)
    onSuccess: (res: any) => {
      // Oct 25 client: the server already had this pickup (pressed twice / filled in again) — say so and open it.
      if (!editing && (res?.duplicate || res?.repeated)) {
        const firstId = Number(res?.data?.id);
        openAfterRef.current = Number.isInteger(firstId) && firstId > 0 ? firstId : null;
        setPostSaveFlash({ tone: 'warn', msg: `${res?.message || 'This pickup was already added a moment ago.'}${openAfterRef.current ? ' Opening it…' : ''}` });
        return;
      }
      // Auto-broadcast result toast — client Aug 3: "everyone in the selected
      // group should automatically receive the standard 'Anyone available…'
      // message". tier3 Aug 23: was three blocking alert() calls; now surfaces
      // as an inline flash inside the modal, then auto-closes after 3s.
      const ab = res?.autoBroadcast;
      if (ab) {
        // xyz122: test-mode returns testMode:true — show the simulated
        // recipient count and remind the office nothing actually went out.
        if (ab.testMode) {
          const wouldTo = Number(ab.skipped ?? 0);
          setPostSaveFlash({ tone: 'warn', msg: `🧪 Test pickup created — NO SMS sent. Would have gone to ${wouldTo} driver${wouldTo === 1 ? '' : 's'}. See /admin/test-broadcasts for the preview body.` });
          return;
        }
        // Oct 12 client: saved for later — say when it will be texted (not "Texted to N").
        else if (ab.reason === 'deferred') { setPostSaveFlash({ tone: 'ok', msg: `✓ Saved. Will be texted at ${ab.textAtLabel || 'the top of the hour before its time'}.` }); return; }
        // Oct 20 client: the save answers right away; the texts go on in the background.
        else if (ab.reason === 'sending') { setPostSaveFlash({ tone: 'ok', msg: `✓ Saved. ${ab.note || 'Texting drivers now — see "Who got the text" in a minute.'}` }); return; }
        else if (ab.sent > 0)   { setPostSaveFlash({ tone: 'ok',   msg: `✓ ${textedText(ab.sent, ab.attempted)}` }); return; }
        else if (ab.reason)     { setPostSaveFlash({ tone: 'warn', msg: smsReasonText(ab.reason) }); return; }
      }
      onDone();
    },
  });
  // tier3 Aug 23 — post-save flash. When populated, we defer onDone by ~3s so
  // the office sees the broadcast outcome instead of the modal snapping shut.
  const [postSaveFlash, setPostSaveFlash] = useState<{ tone: 'ok' | 'warn'; msg: string } | null>(null);
  useEffect(() => {
    if (!postSaveFlash) return;
    const openId = openAfterRef.current;
    const t = setTimeout(() => {
      onDone();
      // Oct 25 client: a repeat opens the pickup that was already added (CoordinatorPortal listens).
      if (openId) window.dispatchEvent(new CustomEvent('zlz:open-pickup', { detail: { id: openId } }));
    }, openId ? 1800 : 3200);
    return () => clearTimeout(t);
  }, [postSaveFlash]);
  // Oct 25 client: one press = one save. The ref blocks a second click / Enter before React re-renders.
  // Oct 29 client: say exactly which fields are missing (red border + red line, "Missing: Date, Time", scroll).
  const miss = useMissingFields([
    { key: 'pickup-date', label: 'Date', message: 'Pick a date', ok: !!date },
    { key: 'pickup-time', label: 'Time', message: 'Pick a time', ok: !!time },
    { key: 'pickup-family', label: 'Family', message: 'Pick the family this delivery goes to', ok: !isDelivery || typeof familyId === 'number' },
    { key: 'pickup-where', label: 'Store or address', message: 'Store or address is needed',
      ok: isDelivery || typeof supplierId === 'number' || !!String(pickupAddress ?? '').trim() },
    { key: 'pickup-subby', label: 'Form submitted by', message: submittedByError(subBy, !editing) ?? '', ok: !submittedByError(subBy, !editing) },
  ]);
  const submit = () => {
    if (submittingRef.current || save.isPending || save.isSuccess) return;
    if (!miss.guard()) return;
    submittingRef.current = true;
    save.mutate();
  };
  const del = useMutation({
    mutationFn: () => adminCRUD.deletePickup(pickup.id),
    onSuccess: onDone,
  });

  // ── Inline "Add new supplier" mini-form (shown inside the Supplier dropdown).
  const [showInlineNewSupplier, setShowInlineNewSupplier] = useState(false);
  // Oct 30 client: "🚚 Run to Lakewood / Fallsburg" (new pickups only) — its own short form (runs.tsx).
  const [runMode, setRunMode] = useState(false);
  const kindRow = (
    <div className="col-span-2 flex flex-wrap gap-2" data-pickup-kind>
      {([false, true] as const).map((d) => (
        <button key={String(d)} type="button" onClick={() => { setRunMode(false); chooseDelivery(d); }}
                className={cx('rounded-[999px] border-[2px] px-4 py-1.5 text-[13px] font-bold transition',
                  !runMode && isDelivery === d ? 'bg-forest text-paper border-forest' : 'bg-paper text-ink border-line hover:border-forest')}>
          {d ? 'Delivery (from 3 Regina to a family)' : 'Pickup'}
        </button>
      ))}
      {!editing && (
        <button type="button" data-kind-run onClick={() => setRunMode(true)}
                className={cx('rounded-[999px] border-[2px] px-4 py-1.5 text-[13px] font-bold transition',
                  runMode ? 'bg-forest text-paper border-forest' : 'bg-paper text-ink border-line hover:border-forest')}>
          🚚 Run to Lakewood / Fallsburg
        </button>
      )}
    </div>
  );
  if (runMode && !editing) {
    return (
      <Modal title="New run to Lakewood / Fallsburg" onClose={onClose} wide>
        <div className="grid grid-cols-2 gap-3 mb-3">{kindRow}</div>
        <RunPickupForm onDone={onDone} onClose={onClose} />
      </Modal>
    );
  }

  return (
    <Modal title={title ?? (editing ? `Edit pickup · ${pickup.suppliers || 'one-time'}` : duplicateFrom ? 'Duplicate pickup' : 'New pickup')} onClose={onClose} wide>
      <div className="grid grid-cols-2 gap-3">
        {/* 1. Date / scheduled time */}
        {miss.summary && <div data-missing-summary className="col-span-2 rounded-[10px] border border-clay/50 bg-clay/10 px-3 py-2 text-[13px] font-bold text-clay">{miss.summary}</div>}
        <Field label="Date" name="pickup-date" error={miss.err('pickup-date')}><DateInput value={date} onChange={setDate} className={inputCls} /></Field>
        <Field label="Time" name="pickup-time" error={miss.err('pickup-time')}><input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inputCls} /></Field>

        {/* Oct 8 client: Pickup vs Delivery (from 3 Regina to a family). Oct 30 client: + 🚚 Run to Lakewood / Fallsburg. */}
        {kindRow}

        {isDelivery && (
          <Field label="Deliver to (family)" full name="pickup-family" error={miss.err('pickup-family')}>
            <FamilyPicker value={familyId} onChange={setFamilyId} />
            {/* Oct 14 client: delivery privacy */}
            <div className="text-[11.5px] text-muted italic mt-1">Drivers only see the street until they take it.</div>
          </Field>
        )}

        {/* 2. Supplier (searchable + inline "Add new supplier") */}
        {!isDelivery && (
        <Field label="Supplier" full>
          <SupplierComboboxWithAdd
            suppliers={suppliers.data?.data ?? []}
            value={supplierId} onChange={(v) => setSupId(v)}
            onAddNew={() => setShowInlineNewSupplier(true)}
          />
        </Field>
        )}

        {/* 3. Store / Hall Name */}
        {!isDelivery && (
        <Field label="Store / Hall Name" full>
          <input value={donorName}
                 onChange={(e) => { touchedRef.current.donor = true; setDonor(e.target.value); typed('name', e.target.value); }}
                 placeholder="e.g. Kroger Airmont, Bites Cafe, Chabad Center"
                 className={inputCls} />
          <div className="text-[11.5px] text-muted italic mt-1">
            Only fill this if it's actually a store, business, or hall — this name is sent to volunteers.
            For individual donors, use Contact Name instead.
          </div>
        </Field>
        )}

        {/* 4. Contact Name / Contact Phone (one row) */}
        <Field label="Contact Name">
          <input value={contactName} ref={contactNameRef}
                 onChange={(e) => { touchedRef.current.cn = true; setCN(e.target.value); typed('contact', e.target.value); }}
                 className={inputCls}  placeholder="Person we can reach if the driver has trouble" />
        </Field>
        <Field label={isDelivery ? "Family's phone (shown only after they take it)" : 'Contact Phone'}>{/* Oct 14 client */}
          <input value={contactPhone}
                 onChange={(e) => { touchedRef.current.cp = true; setCP(e.target.value); typed('phone', e.target.value); }}
                 className={inputCls} />
        </Field>
        {/* Oct 12 client: some donors give two (or more) phone numbers. */}
        <div className="col-span-2 -mt-1">
          <ExtraContactsEditor value={extraContacts} onChange={setExtras} inputCls={inputCls} />
        </div>
        {/* Oct 11 client: "Used before" — past contacts, most used first; or someone else. */}
        {showPast && (
          <div data-past-contacts className="col-span-2 -mt-1 rounded-[10px] border border-line bg-cream/40 px-3 py-2">
            <div className="text-[10.5px] font-extrabold uppercase tracking-[.05em] text-muted">Used before</div>
            <div className="mt-1 flex flex-col gap-0.5" role="radiogroup">
              {[...(pastMore ? pastOpts : pastOpts.slice(0, 3)).map((o) => ({ key: o.key, o })), { key: 'other', o: null as PastOpt | null }].map(({ key, o }) => {
                const on = pastSel === key;
                // Oct 12 client: "(no name) · 845-422-0191 · Sleepy Hollow Hotel" — pickups with no contact name count too.
                const label = o ? (o.name || (o.isStore ? 'Store phone' : '(no name)')) : 'Someone else / type new';
                const place = o && !storeMode && o.place && normText(o.place) !== normText(o.name) ? o.place : '';
                const extra = o ? [o.isStore && o.name ? 'store' : '', o.uses > 0 ? `used ${o.uses}×` : (o.isStore ? 'store' : '')].filter(Boolean).join(' · ') : '';
                const showAddr = !!o?.address && !(storeMode && !!storeAddr);
                return (
                  <button key={key} type="button" role="radio" aria-checked={on} onClick={() => choosePast(o)}
                          className={cx('haptic flex items-start gap-2 rounded-[8px] px-1.5 py-1 text-left text-[12.5px] hover:bg-paper', on && 'bg-paper')}>
                    <span className={cx('mt-[3px] inline-block h-3 w-3 shrink-0 rounded-full border-[1.5px]', on ? 'border-forest bg-forest shadow-[inset_0_0_0_2px_white]' : 'border-line-2 bg-paper')} />
                    <span className="min-w-0">
                      <span className={cx('text-ink', on && 'font-bold')}>{label}</span>
                      {o?.phone && <span className="text-ink"> · {dashPhone(o.phone)}</span>}
                      {place && <span className="text-ink"> · {place}</span>}
                      {extra && <span className="text-muted"> · {extra}</span>}
                      {!!o?.extraContacts?.length && (
                        <span className="block truncate text-[11.5px] text-muted">also: {o.extraContacts.map((c) => [c.name, dashPhone(c.phone)].filter(Boolean).join(' · ')).join('; ')}</span>
                      )}
                      {showAddr && <span className="block truncate text-[11.5px] text-muted">📍 {o!.address}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
            {pastOpts.length > 3 && (
              <button type="button" onClick={() => setPastMore((v) => !v)}
                      className="haptic mt-0.5 text-[11.5px] font-bold text-forest underline underline-offset-2">
                {pastMore ? 'Show less' : `Show more (${pastOpts.length - 3})`}
              </button>
            )}
          </div>
        )}

        {/* 5. Pickup Address */}
        <Field label={isDelivery ? 'From (pick up at)' : 'Pickup Address'} full name="pickup-where" error={miss.err('pickup-where')}>
          {/* Oct 11 client: saved store with an address → one line + change. */}
          {showAddrLine ? (
            <div data-store-address className="flex items-center gap-2 flex-wrap rounded-[10px] border border-line bg-cream/40 px-3 py-2 text-[13.5px]">
              <span className="text-ink">📍 {storeAddr}</span>
              <span className="text-muted">·</span>
              <button type="button" onClick={openAddrBox} className="haptic text-forest font-bold underline underline-offset-2">change</button>
            </div>
          ) : showFound && lookup?.found ? (
            <div data-store-found className="rounded-[10px] border border-forest/40 bg-sage/30 px-3 py-2 text-[13px]">
              <div className="text-ink"><b>Found:</b> {lookup.found.name}, {lookup.found.address}{lookup.found.phone ? <span className="text-muted"> · {lookup.found.phone}</span> : null}</div>
              <div className="mt-1.5 flex items-center gap-2">
                <button type="button" onClick={() => void useFound()} disabled={lookup.state === 'saving'}
                        className="haptic rounded-[8px] bg-forest px-3 py-1 text-[12.5px] font-bold text-paper disabled:opacity-60">
                  {lookup.state === 'saving' ? 'Saving…' : 'Use this ✓'}
                </button>
                <button type="button" onClick={() => setLookup({ ...lookup, state: 'dismissed' })}
                        className="haptic rounded-[8px] border border-line px-3 py-1 text-[12.5px] font-bold text-muted">Not right</button>
                <span className="text-[11.5px] text-muted">Saved to {selectedStore?.name ?? 'the store'} so you won't type it again.</span>
              </div>
            </div>
          ) : (
            <div ref={addrWrap}>
              <AddressAutocomplete value={pickupAddress} lookupName={donorName}
                                   onChange={(v) => { touchedRef.current.addr = true; setAddr(v); typed('addr', v); if (savePick && v !== savePick.address) setSavePick(null); }}
                                   onPick={(info) => {
                                     // Oct 28 client: "When I search in Maps the name of a store … it should place the name as the supplier."
                                     if (info.name && !donorName.trim() && typeof supplierId !== 'number') { setDonor(info.name); touchedRef.current.donor = true; }
                                     if (typeof supplierId === 'number' && selectedStore && !storeAddr && info.placeId) setSavePick({ placeId: info.placeId, address: info.address, on: true });
                                     else setSavePick(null);
                                   }}
                                   placeholder="Start typing… suggestions from Google"
                                   className={inputCls} />
              {lookup?.state === 'loading' && lookup.id === supplierId && !pickupAddress.trim() && (
                <div className="text-[11.5px] text-muted italic mt-1">Looking up {selectedStore?.name ?? 'the store'}'s address…</div>
              )}
              {lookup?.state === 'used' && lookup.err && <div className="text-[11.5px] text-clay mt-1">{lookup.err}</div>}
              {showSavePick && savePick && (
                <label data-save-pick className="mt-1 flex items-center gap-1.5 text-[12px] text-ink cursor-pointer">
                  <input type="checkbox" checked={savePick.on} onChange={(e) => setSavePick({ ...savePick, on: e.target.checked })} />
                  Save this address to {selectedStore?.name}
                </label>
              )}
              {addrStore && (
                <div data-store-by-address className="mt-1 text-[12px]">
                  {addrStoreOn ? (
                    <span className="text-forest">
                      This is {addrStore.name}'s address — linked to {addrStore.name}{' '}
                      <button type="button" onClick={() => setNotThisStore(addrKey)}
                              className="haptic font-bold text-muted underline underline-offset-2">Not this store</button>
                    </span>
                  ) : (
                    <span className="text-muted">
                      Not linked to {addrStore.name}{' '}
                      <button type="button" onClick={() => setNotThisStore(null)}
                              className="haptic font-bold text-forest underline underline-offset-2">Link it</button>
                    </span>
                  )}
                </div>
              )}
              {addrOpen && !!storeAddr && pickupAddress !== storeAddr && (
                <button type="button" onClick={() => { setAddr(storeAddr); autoRef.current.addr = storeAddr; setAddrOpen(false); }}
                        className="haptic mt-1 text-[11.5px] font-bold text-forest underline underline-offset-2">Use the store's address ({storeAddr})</button>
              )}
            </div>
          )}
        </Field>

        {/* Feature 1 — Repeat a previous pickup */}
        <div className="col-span-2 -mt-1">
          <button type="button" onClick={applyPreviousInfo} disabled={prevBusy}
                  className="haptic inline-flex items-center gap-1.5 rounded-[10px] border border-forest/40 bg-forest-soft/40 px-3 py-1.5 text-[12.5px] font-bold text-forest hover:bg-forest-soft disabled:opacity-50">
            {prevBusy ? 'Looking…' : '↻ Use info from a previous pickup'}
          </button>
          <div className="text-[11.5px] text-muted italic mt-1">
            Fills store, address, instructions, food, contact &amp; drivers from the most recent matching pickup — date &amp; time stay as you set them.
          </div>
        </div>

        {/* 6. Pickup Details (was Food Description) */}
        <Field label="Pickup Details" full>
          <textarea rows={2} value={foodDescription}
                    onChange={(e) => { touchedRef.current.food = true; setFood(e.target.value); }}
                    placeholder='e.g. "8 catering trays, mostly chicken & rice"' className={inputCls} />
        </Field>

        {/* Nov 6 client: which caterer (mainly one-time / event pickups). Prints on the kiosk labels. */}
        <Field label="Caterer (optional)" full hint="If the food is from a caterer. It prints on the food labels at the center.">
          <input value={caterer} onChange={(e) => setCaterer(e.target.value)} maxLength={120} list="caterer-names"
                 placeholder='e.g. "Gourmet Glatt"' className={inputCls} data-caterer autoComplete="off" />
          <datalist id="caterer-names">
            {(catererNames.data?.data ?? []).map((n) => <option key={n} value={n} />)}
          </datalist>
        </Field>

        {/* 6b. Aug 26 client: optional size marker — Small/Large. Both may
                stay unchecked; not required. Click a selected chip to unset. */}
        <Field label="Size — optional" full>
          <div className="flex gap-2">
            {(['small', 'large'] as const).map((opt) => {
              const on = size === opt;
              return (
                <button key={opt} type="button"
                        onClick={() => setSize(on ? null : opt)}
                        className={cx(
                          'rounded-[999px] border-[2px] px-4 py-1.5 text-[13px] font-bold transition',
                          on
                            ? 'bg-forest text-paper border-forest'
                            : 'bg-paper text-ink border-line hover:border-forest',
                        )}>
                  {opt === 'small' ? 'Small' : 'Large'}
                </button>
              );
            })}
            {size !== null && (
              <button type="button" onClick={() => setSize(null)}
                      className="text-[11.5px] text-muted underline underline-offset-2 ml-1">
                clear
              </button>
            )}
          </div>
        </Field>

        {/* 7. Drivers Needed */}
        <Field label="Drivers Needed" full>
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setSlots((n) => Math.max(1, n - 1))}
                    className="haptic grid h-9 w-9 place-items-center rounded-full border border-line bg-paper text-muted hover:bg-cream">−</button>
            <span className="font-display font-bold text-[20px] text-forest w-6 text-center">{slotsCapacity}</span>
            <button type="button" onClick={() => setSlots((n) => Math.min(5, n + 1))}
                    className="haptic grid h-9 w-9 place-items-center rounded-full border border-line bg-paper text-forest hover:bg-cream">+</button>
            <span className="text-[12px] text-muted">
              {slotsCapacity === 1 ? 'single-driver pickup' : `${slotsCapacity}-driver pickup`}
            </span>
          </div>
        </Field>

        {/* 8. Assign Driver(s) — one picker per slot */}
        <Field label={editing && ['completed', 'delivered', 'missed'].includes(String(pickup?.status ?? '').toLowerCase()) ? 'Driver who did it' : 'Assign Driver(s) — optional'} full>
          {/* Oct 28 client (Yakov): a closed pickup — the driver picked here gets the credit; no texts. */}
          {editing && ['completed', 'delivered', 'missed'].includes(String(pickup?.status ?? '').toLowerCase()) && (
            <div data-testid="closed-driver-hint" className="mb-1.5 text-[11.5px] text-forest font-semibold">
              This pickup is closed. The driver you pick gets the credit (the one before loses it){String(pickup?.status ?? '').toLowerCase() === 'missed' ? ' and it becomes Done' : ''}. No texts are sent.
            </div>
          )}
          <div className="space-y-1.5">
            {driverPicks.map((val, i) => (
              <VolunteerPicker
                key={i}
                volunteers={(volunteers.data?.data ?? []).filter((v: any) => !v.deletedAt && v.status !== 'inactive')}
                value={val}
                onChange={(v) => setDriverPicks((prev) => prev.map((x, idx) => idx === i ? v : x))}
                placeholder={`Driver ${i + 1} — leave blank to auto-fill`}
              />
            ))}
          </div>
        </Field>

        {/* 9. Instructions for Volunteer (driver-facing) */}
        <Field label={isDelivery ? 'Notes for the driver (shown only after they take it)' : 'Instructions for Volunteer — optional'} full>{/* Oct 14 client */}
          <textarea rows={3} value={pickupInstructions}
                    onChange={(e) => { touchedRef.current.pi = true; setPI(e.target.value); }}
                    placeholder='e.g. "Loading dock on the side. Ring the bell twice. Gate code 4567."'
                    className={inputCls} />
          <div className="text-[11.5px] text-muted italic mt-1">
            {isDelivery ? 'Only the driver who takes the delivery sees this (and the family\'s address and phone).' : 'Shown to the volunteer — access notes, gate codes, and anything the driver needs to know.'}
          </div>
        </Field>

        {/* 9b. Internal Office Notes (admin only — never sent to volunteers) */}
        <Field label="Internal Office Notes — optional" full>
          <textarea rows={2} value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder='Private notes for the office only.'
                    className={inputCls} />
          <div className="text-[11.5px] text-muted italic mt-1">
            Admin only — never sent to volunteers.
          </div>
        </Field>

        {/* Status (edit-only) — remains here so admins can still change lifecycle. */}
        {editing && (
          <Field label="Status" full>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputCls}>
              {['pending','scheduled','confirmed','in_progress','completed','cancelled','missed']
                .map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
            </select>
          </Field>
        )}
      </div>

      {/* 10. Send to drivers — checkbox gate + inline group selector */}
      {!editing && groupList.length > 0 && (
        <div className="mt-4 rounded-[12px] border border-forest/30 bg-forest-soft/40 px-3 py-2.5">
          {/* Oct 12 client: unticked = texted at the top of the hour before its time; its hour has come = right away. */}
          {textSlot?.now ? (
            // Oct 14 client: was a locked tick ("Texts drivers right away"); the office can now untick it.
            <label className="flex items-center gap-2 cursor-pointer" data-qa="text-now-slot">
              <input type="checkbox" checked={!noTextNow} onChange={(e) => setNoTextNow(!e.target.checked)} className="accent-forest h-4 w-4" />
              <span className="text-[13px] font-bold text-ink">Text drivers now</span>
              {noTextNow && <span className="text-[12px] text-muted">— not texted now; it goes out with the next pickup text and shows in PICKUPS / the app</span>}
            </label>
          ) : (
            <label className="flex items-center gap-2 cursor-pointer" data-qa="text-now-slot">
              <input type="checkbox" checked={sendToDrivers} onChange={(e) => setSendToDrivers(e.target.checked)}
                     className="accent-forest h-4 w-4" />
              <span className="text-[13px] font-bold text-ink">Text drivers now{textSlot ? ` (don't wait until ${textSlot.label})` : ''}</span>
            </label>
          )}
          {!sendToDrivers && !textSlot?.now && (
            <div className="mt-1 pl-6 text-[12px] text-muted">
              {textSlot ? `Texted to drivers at ${textSlot.label}, the top of the hour before its time.` : 'Texted to drivers at the top of the hour before its time.'} Drivers see it any time they text PICKUPS.
            </div>
          )}
          {sendToDrivers && (
            <div className="mt-2 flex items-center gap-2 pl-6">
              <span className="text-[11.5px] text-muted shrink-0">Send to</span>
              <select value={smsGroupId === '' ? '' : String(smsGroupId)}
                      onChange={(e) => setSmsGroupId(e.target.value === '' ? '' : Number(e.target.value))}
                      className={inputCls + ' py-1 text-[12.5px] flex-1'}>
                {groupList.map((g) => (
                  <option key={g.id} value={g.id}>{g.name} ({g.member_count})</option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {/* Oct 14 client: per-pickup "Text the contact when a driver is on the way" + the exact text. */}
      {!isDelivery && (
        <div className="mt-3 rounded-[12px] border border-line px-3 py-2.5" data-qa="contact-notice">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={cnOn} onChange={(e) => setContactNotice(e.target.checked)}
                   className="accent-forest h-4 w-4" data-qa="contact-notice-box" />
            <span className="text-[13px] font-bold text-ink">Text the contact when a driver is on the way</span>
          </label>
          <div className="mt-1 pl-6 text-[12px] text-muted" data-qa="contact-notice-preview">{contactNoticePreview(cnPhone, pickupAddress)}</div>
        </div>
      )}

      {/* More options — Urgency + how long to keep offering (collapsed by default). */}
      <div className="mt-4">
        <button type="button" onClick={() => setShowMore((v) => !v)}
                className="haptic text-[12px] font-bold text-forest hover:underline">
          {showMore ? '− Hide more options' : '+ More options'}
        </button>
        {showMore && (
          <div className="mt-2 grid grid-cols-2 gap-3">
            <Field label="Urgency">
              <select value={urgency} onChange={(e) => setUrgency(e.target.value as any)} className={inputCls}>
                <option value="normal">Normal</option>
                <option value="urgent">Urgent</option>
              </select>
            </Field>
            <Field label="Keep offering to drivers for">
              <select value={offerHours} onChange={(e) => setOfferHours(e.target.value)} className={inputCls}>
                <option value="">6 hours after the pickup time (standard)</option>
                {/* Oct 6 client: no choices shorter than the standard 6 hours (an older pickup's own value still shows). */}
                {[...new Set([8, 10, 12, 24, ...(offerHours && !['8', '10', '12', '24'].includes(offerHours) ? [Number(offerHours)] : [])])].sort((a, b) => a - b)
                  .map((h) => <option key={h} value={String(h)}>{h} {h === 1 ? 'hour' : 'hours'} after the pickup time</option>)}
              </select>
            </Field>
          </div>
        )}
      </div>

      {/* Oct 12 client: "Form submitted by" — who filled out this form. */}
      <div className="mt-4" data-field="pickup-subby">
        <div className={cx('text-[12px] font-bold mb-1.5', miss.err('pickup-subby') ? 'text-clay' : 'text-ink')}>Form submitted by{!editing && <span className="text-clay"> *</span>}</div>
        <div className={cx(miss.err('pickup-subby') && MISSING_RING)}>
        <SubmittedByRow value={subBy} onChange={setSubBy}
                        savedNote={editing && !parseSubmittedBy(pickup.submitted_by).choice ? (submittedByLabel(pickup.submitted_by) || null) : null} />
        </div>
        <FieldError msg={miss.err('pickup-subby')} />
      </div>

      {/* xyz122: test / dry-run toggle — office coordinators tick this to
          create a pickup that will NEVER be broadcast to real drivers.
          Only shown on the CREATE surface (not edit). */}
      {!editing && (
        <label className="mt-4 flex items-start gap-2 rounded-[10px] border border-amber/40 bg-amber/10 px-3 py-2 cursor-pointer">
          <input type="checkbox" checked={isTest} onChange={(e) => setIsTest(e.target.checked)}
                 className="mt-0.5 accent-amber h-4 w-4" />
          <span>
            <span className="text-[12.5px] font-bold text-ink">🧪 Test pickup (won't send SMS or appear to drivers)</span>
            <span className="block text-[11px] text-muted mt-0.5">
              Runs the create + broadcast pipeline end-to-end but logs the intended message body to <b>/admin/test-broadcasts</b> instead of texting real drivers. Use for QA — the pickup stays on the board with a TEST badge but never reaches drivers.
            </span>
          </span>
        </label>
      )}

      {miss.summary && <p className="text-clay text-[12px] font-bold mt-3">{miss.summary}</p>}
      {(save.error || del.error) && <p className="text-clay text-[12px] mt-3">{((save.error || del.error) as Error).message}</p>}
      {/* Oct 25 client: the "Saved" note sits right above the button (it was at the top of the long
          form, out of sight, so the office thought it didn't go and pressed again). */}
      {postSaveFlash && (
        <div role="status" data-testid="pickup-save-flash"
             className={cx('mt-4 rounded-[10px] px-3 py-2 text-[13px] font-bold whitespace-pre-line',
                            postSaveFlash.tone === 'ok'
                              ? 'bg-sage text-forest border border-sage-line'
                              : 'bg-amber/15 text-[#9a7415] border border-amber/30')}>
          {postSaveFlash.msg}
        </div>
      )}
      <div className="flex items-center justify-between mt-4">
        {editing ? (
          <button onClick={() => { void uiConfirm(`Delete this pickup? This removes it and any driver assignments.`).then((ok) => { if (ok) { del.mutate(); } }); }}
                  className="haptic flex items-center gap-1.5 text-clay text-[12.5px] font-bold border border-clay/40 px-3 py-2 rounded-[10px] hover:bg-clay-soft">
            <Trash2 size={13} /> {del.isPending ? 'Deleting…' : 'Delete pickup'}
          </button>
        ) : <span />}
        <div className="flex gap-2">
          <Button size="sm" variant="plain" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={save.isPending} disabled={save.isPending || save.isSuccess}
                  onClick={submit} icon={<Plus size={14} />} data-testid="pickup-save">
            {save.isPending ? 'Saving…' : save.isSuccess ? 'Saved ✓' : editing ? 'Save changes' : 'Create pickup'}
          </Button>
        </div>
      </div>

      {/* Inline "Add new supplier" — creates the supplier and auto-selects it
          without closing the pickup form. Uses the same SupplierForm component
          the standalone flow uses; SupplierForm calls onCreated when the new
          row lands and we set supplierId so the pickup form picks it up. */}
      {showInlineNewSupplier && (
        <SupplierForm row={null}
          onCancel={() => setShowInlineNewSupplier(false)}
          onCreated={(created: any) => {
            setShowInlineNewSupplier(false);
            if (created?.id != null) {
              // Trigger auto-fill by resetting touched flags where the user hasn't
              // typed anything yet, then set the supplier id.
              if (!donorName) touchedRef.current.donor = false;
              if (!pickupAddress) touchedRef.current.addr = false;
              if (!contactName) touchedRef.current.cn = false;
              if (!contactPhone) touchedRef.current.cp = false;
              setSupId(Number(created.id));
            }
            qc.invalidateQueries({ queryKey: ['admin-suppliers'] });
          }}
          onDone={() => { setShowInlineNewSupplier(false); qc.invalidateQueries({ queryKey: ['admin-suppliers'] }); }}
        />
      )}
    </Modal>
  );
}

/**
 * Supplier picker used inside the Pickup form. Same behavior as
 * SupplierCombobox but adds a persistent "+ Add new supplier" row at the
 * top of the dropdown that fires `onAddNew` — the parent opens an inline
 * SupplierForm and auto-selects the created row on success.
 */
function SupplierComboboxWithAdd({ suppliers, value, onChange, onAddNew }: {
  suppliers: any[]; value: number | ''; onChange: (v: number | '') => void; onAddNew: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  // Oct 11 client: ids come from the API as strings — compare as numbers (the box showed empty).
  const selected = suppliers.find((s) => Number(s.id) === value);
  const displayValue = open ? q : (selected ? `${selected.name}${selected.city ? ` · ${selected.city}` : ''}` : '');
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    const all = suppliers.filter((s: any) => !!s?.name);
    if (!t) return all.slice(0, 200);
    return all.filter((s: any) => `${s.name} ${s.city ?? ''}`.toLowerCase().includes(t)).slice(0, 60);
  }, [q, suppliers]);
  // Oct 16 client: arrow keys + Enter pick a store (Enter used to leave only the typed letters).
  const [hi, setHi] = useState(-1);
  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault(); setOpen(true);
      setHi((h) => moveHighlight(h, e.key === 'ArrowDown' ? 1 : -1, list.length));
    } else if (e.key === 'Enter' && open) {
      e.preventDefault();
      const i = enterPickIndex(hi, list.length, q);
      if (i >= 0) { onChange(Number(list[i].id)); setOpen(false); setQ(''); setHi(-1); (e.target as HTMLInputElement).blur(); }
    } else if (e.key === 'Escape' && open) {
      e.preventDefault(); e.stopPropagation(); setOpen(false); setQ(''); setHi(-1);
    }
  }
  return (
    <div className="relative flex-1">
      <input value={displayValue}
             onFocus={() => { setOpen(true); setQ(''); setHi(-1); }}
             onChange={(e) => { setOpen(true); setQ(e.target.value); setHi(-1); }}
             onKeyDown={onKey}
             onBlur={() => setTimeout(() => setOpen(false), 200)}
             placeholder="Type to search suppliers, or add a new one"
             className={inputCls + ' w-full'} />
      {open && (
        <div className="absolute z-30 left-0 right-0 mt-1 max-h-[280px] overflow-y-auto rounded-[10px] border border-line bg-paper shadow-lift">
          <button type="button"
                  onMouseDown={(e) => { e.preventDefault(); setOpen(false); setQ(''); onAddNew(); }}
                  className="w-full text-left px-3 py-2 text-[13px] font-bold text-forest bg-sage/30 hover:bg-sage/50 border-b border-line flex items-center gap-1.5">
            <Plus size={13} /> Add new supplier
          </button>
          <button type="button"
                  onMouseDown={(e) => { e.preventDefault(); onChange(''); setOpen(false); setQ(''); }}
                  className="w-full text-left px-3 py-2 text-[13px] font-bold text-muted hover:bg-cream/60 border-b border-line">
            — One-time donor (not in list) —
          </button>
          {list.map((s: any, i: number) => (
            <button key={s.id} type="button"
                    ref={i === hi ? (el) => el?.scrollIntoView({ block: 'nearest' }) : undefined}
                    onMouseDown={(e) => { e.preventDefault(); onChange(Number(s.id)); setOpen(false); setQ(''); }}
                    className={cx('w-full text-left px-3 py-2 text-[13.5px] hover:bg-cream/60 border-b border-line last:border-b-0',
                                  i === hi && 'bg-cream/80 ring-2 ring-inset ring-forest/40',
                                  Number(s.id) === value && 'bg-sage/40 font-bold')}>
              {s.name}{s.city ? <span className="text-muted"> · {s.city}</span> : null}
            </button>
          ))}
          {list.length === 0 && (
            <div className="px-3 py-3 text-[12.5px] text-muted">No matches. Try fewer letters or add a new supplier above.</div>
          )}
        </div>
      )}
    </div>
  );
}

// =============================== Change Password ============================

export function ChangePasswordPanel() {
  const [cur, setCur] = useState('');
  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');
  const [done, setDone] = useState(false);
  const change = useMutation({
    mutationFn: async () => {
      const { auth } = await import('./api');
      return auth.changePassword(cur, pw1);
    },
    onSuccess: () => { setDone(true); setCur(''); setPw1(''); setPw2(''); },
  });
  const tooShort  = pw1.length > 0 && pw1.length < 8;
  const mismatch  = pw2.length > 0 && pw1 !== pw2;
  const canSubmit = cur.length > 0 && pw1.length >= 8 && pw1 === pw2 && !change.isPending;

  return (
    <div className="space-y-3 max-w-md">
      <div className="text-[13px] font-extrabold uppercase tracking-[.06em] text-muted">Change my password</div>
      <p className="text-[13.5px] text-muted">
        Prove the current password, then pick a new one (8+ characters). After saving you stay logged in on this device.
      </p>

      <form onSubmit={(e) => { e.preventDefault(); if (canSubmit) change.mutate(); }} className="space-y-3 mt-2">
        <Field label="Current password">
          <input type="password" autoComplete="current-password"
                 value={cur} onChange={(e) => setCur(e.target.value)}
                 className={inputCls} />
        </Field>
        <Field label="New password">
          <input type="password" autoComplete="new-password"
                 value={pw1} onChange={(e) => setPw1(e.target.value)}
                 className={inputCls} />
          {tooShort && <p className="text-clay text-[12px] mt-1">Must be at least 8 characters.</p>}
        </Field>
        <Field label="Confirm new password">
          <input type="password" autoComplete="new-password"
                 value={pw2} onChange={(e) => setPw2(e.target.value)}
                 className={inputCls} />
          {mismatch && <p className="text-clay text-[12px] mt-1">Passwords don't match.</p>}
        </Field>

        {change.error && <p className="text-clay text-[13px]">{(change.error as Error).message}</p>}
        {done       && <p className="text-forest text-[13px] font-bold">✓ Password updated.</p>}

        {/* tier2 Aug 21 — button was double-submitting because it had both an
            onClick AND was inside a form with onSubmit that also fires
            change.mutate. Rely on form onSubmit only, and make this button a
            true submit trigger so Enter in a password field also works. */}
        <Button type="submit" size="md" variant="forest" loading={change.isPending}
                disabled={!canSubmit}>
          Save new password
        </Button>
      </form>
    </div>
  );
}

// =============================== Registration link card =====================

/**
 * Public sign-up URL surfaced inside the portal so the recruiter can hand it
 * out (paste into a message, open it on a phone, point a prospect at it).
 * Copy + Open buttons; switches text by kind.
 */
type LinkKind = 'volunteer' | 'supplier' | 'one-time-pickup' | 'steady-pickup';
export function RegistrationLinkCard({ kind }: { kind: LinkKind }) {
  const path =
    kind === 'volunteer' ? 'vol-registration' :
    kind === 'supplier'  ? 'sup-registration' :
    kind === 'one-time-pickup' ? 'one-time-pickup' :
                                 'steady-pickup';
  const url = `${window.location.origin}/rescue/${path}`;
  const [copied, setCopied] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {}
  }
  const label =
    kind === 'volunteer' ? 'Share this link with prospective drivers — they fill out the volunteer questionnaire and the entry lands in this list.' :
    kind === 'supplier'  ? 'Share this link with prospective donor stores — they fill out the supplier questionnaire and the entry lands in this list.' :
    kind === 'one-time-pickup' ? 'Share this link with someone with food ready right now — they fill in the details and the pickup appears in the portal as pending.' :
                                 'Share this link with a donor who can give consistently — they pick days + time and the steady template appears as pending.';
  const accent =
    kind === 'volunteer' ? 'border-forest/40 bg-sage' :
    kind === 'supplier'  ? 'border-clay/30 bg-clay-soft/40' :
    kind === 'one-time-pickup' ? 'border-amber/40 bg-amber-soft' :
                                 'border-sky/30 bg-sky-soft';
  const dotColor =
    kind === 'volunteer' ? 'bg-forest' :
    kind === 'supplier'  ? 'bg-clay' :
    kind === 'one-time-pickup' ? 'bg-amber' :
                                 'bg-sky';
  const heading =
    kind === 'volunteer' ? 'Volunteer sign-up link' :
    kind === 'supplier'  ? 'Supplier sign-up link' :
    kind === 'one-time-pickup' ? 'One-time pickup link' :
                                 'Steady pickup link';
  return (
    <div className={cx('rounded-[14px] border-2 px-4 py-3 mb-3', accent)}>
      <div className="flex items-center gap-2 mb-2">
        <span className={cx('inline-block h-2 w-2 rounded-full', dotColor)} />
        <div className="text-[12px] font-extrabold uppercase tracking-[.06em] text-ink">{heading}</div>
      </div>
      <p className="text-[12.5px] text-muted mb-2">{label}</p>
      <div className="flex items-center gap-2">
        <code className="flex-1 min-w-0 truncate bg-paper border border-line rounded-[10px] px-3 py-2 text-[12.5px] font-mono text-ink">
          {url}
        </code>
        <button onClick={copy}
                className="haptic shrink-0 bg-forest text-paper text-[12.5px] font-bold rounded-[10px] px-3 py-2">
          {copied ? '✓ Copied' : 'Copy'}
        </button>
        <a href={url} target="_blank" rel="noreferrer"
           className="haptic shrink-0 bg-paper border border-line text-ink text-[12.5px] font-bold rounded-[10px] px-3 py-2 hover:border-forest">
          Open
        </a>
      </div>
    </div>
  );
}

// =============================== Broadcast ==================================

const AUDIENCE_LABEL: Record<string, string> = {
  all_drivers:   'All drivers',
  all_stores:    'All stores',
  all_users:     'Everyone (drivers + stores + office)',
  specific_user: 'One specific person',
};

/**
 * SMS Inbox — surfaces recent inbound SMS replies (the [SMS]-prefixed rows
 * the webhook threads into direct_messages) so a coordinator can eyeball
 * driver traffic without hunting through every driver chat. Clicking a row
 * opens the full ChatThread with that driver — replies from that thread go
 * back to the driver as SMS via the same notifyDirectRecipient path used
 * by the driver-chat tab.
 */
export function SmsInboxPanel() {
  const [selected, setSelected] = useState<{ userId: number; name: string; phone: string | null } | null>(null);
  const inbox = useQuery({
    queryKey: ['sms-inbox'],
    queryFn: () => smsInbox.list(),
    refetchInterval: 30_000, // Nov 3 client: speed (was 20 s)
  });

  if (selected) {
    return (
      <div className="flex flex-col h-[calc(100vh-180px)]">
        <button onClick={() => setSelected(null)} className="self-start text-[12px] text-forest font-bold mb-2 hover:underline">
          ← Back to SMS inbox
        </button>
        <ChatThread userId={selected.userId} title={selected.name}
                    subtitle={selected.phone ? `SMS · ${displayPhone(selected.phone)}` : 'SMS'} color="#3E6F8E" />
      </div>
    );
  }

  const rows = inbox.data?.data ?? [];
  // Group by sender so the panel shows one line per driver — most recent
  // first, with the message body as a preview. Clicking opens the full
  // thread with that driver.
  type Row = typeof rows[number];
  const bySender = new Map<number, Row>();
  for (const r of rows) if (!bySender.has(r.from_user_id)) bySender.set(r.from_user_id, r);
  const threads = Array.from(bySender.values());

  return (
    <div className="space-y-3">
      <div className="text-[11px] font-extrabold uppercase tracking-[.05em] text-muted mb-1">
        Recent SMS replies · last 30 days
      </div>
      <div className="rounded-[14px] border border-sage-line bg-sage/40 p-3 text-[12px] text-forest font-bold">
        These are text-message replies drivers sent to our office number. Tap one to reply — the driver receives your reply as an SMS.
      </div>
      {inbox.isLoading && <div className="text-[13px] text-muted">Loading…</div>}
      {!inbox.isLoading && threads.length === 0 && (
        <div className="text-[13px] text-muted">No SMS replies in the last 30 days.</div>
      )}
      {threads.map((r) => {
        const name = `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim() || 'Unknown driver';
        const body = String(r.body || '').replace(/^\[SMS\]\s*/, '');
        return (
          <button key={r.id}
                  onClick={() => setSelected({ userId: r.from_user_id, name, phone: r.phone })}
                  className="haptic w-full text-left rounded-[14px] border border-line bg-paper p-3 hover:border-forest transition">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-full bg-sky/20 text-sky flex items-center justify-center shrink-0">
                <MessageSquare size={16} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[13.5px] font-extrabold text-ink truncate"><Name>{name}</Name></div>
                  <div className="text-[11px] text-muted shrink-0">{msgWhen(r.created_at)}</div>
                </div>
                {r.phone && (
                  <div className="flex items-center gap-1 text-[11px] text-muted mt-0.5">
                    <Phone size={10} /> {displayPhone(r.phone)}
                  </div>
                )}
                <div className="text-[12.5px] text-ink/85 mt-1 line-clamp-2">{body}</div>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}


/**
 * Broadcast panel — coordinator sends a custom notification to one person or
 * a whole audience (all drivers, all stores, everyone). Types are reusable
 * templates: define once and pick from the dropdown next time. Editing the
 * title/body before sending is always allowed.
 */
/**
 * §E — Dispatcher shift schedule. Simple list view (grouped by day) with a
 * new-shift form + per-row sign-in / sign-out. A backend sweeper enqueues a
 * 5-min-before SMS reminder into scheduled_sms so drivers get pinged before
 * their shift.
 */
// Shifts calendar constants (Fork J · client Aug 4). Three coverage slots
// per day; the grid is 7 days × 3 slots = 21 cells / week. Empty cells show
// a "+ Fill" action that opens NewShiftForm pre-loaded with day+time.
// Aug 13: buckets widened to cover 24h so pre-dawn shifts (e.g. Moshe
// Applegrad steady 5:25 AM) and late-night shifts still render — previously
// hours 0-7 and 21-23 returned null from slotForShift and the taken cell
// still showed "+ Fill" (client abc835).
const SHIFT_SLOTS: Array<{ key: 'morning' | 'afternoon' | 'evening'; label: string; startHour: number; endHour: number; defaultHour: number }> = [
  { key: 'morning',   label: 'Morning',   startHour:  0, endHour: 12, defaultHour:  8 },
  { key: 'afternoon', label: 'Afternoon', startHour: 12, endHour: 17, defaultHour: 13 },
  { key: 'evening',   label: 'Evening',   startHour: 17, endHour: 24, defaultHour: 17 },
];
function slotForShift(sh: any): 'morning' | 'afternoon' | 'evening' | null {
  const h = new Date(sh.starts_at).getHours();
  for (const s of SHIFT_SLOTS) if (h >= s.startHour && h < s.endHour) return s.key;
  return null;
}
function startOfWeek(d: Date): Date {
  const out = new Date(d); out.setHours(0, 0, 0, 0);
  out.setDate(out.getDate() - out.getDay()); // Sunday
  return out;
}
// LOCAL yyyy-mm-dd — must NOT use toISOString() because that converts to UTC
// and a Thursday evening shift can jump into Friday's grid cell (client Aug 4 bug).
function localDateKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export function ShiftsPanel() {
  const qc = useQueryClient();
  const [showNew, setShowNew] = useState(false);
  const [prefillStart, setPrefillStart] = useState<string | null>(null);
  const [editShift, setEditShift] = useState<any | null>(null);
  const [weekAnchor, setWeekAnchor] = useState<Date>(() => startOfWeek(new Date()));
  const list = useQuery({ queryKey: ['shifts'], queryFn: () => shiftsApi.list(), refetchInterval: 30_000 });
  const actMut = useMutation({
    mutationFn: ({ id, action }: { id: number; action: 'sign-in' | 'sign-out' }) => shiftsApi.action(id, action),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shifts'] }),
  });
  const cancelMut = useMutation({
    mutationFn: ({ id, scope }: { id: number; scope: 'one' | 'future' }) => cancelShift(id, scope), // Oct 14 client
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shifts'] }),
  });
  // Group by day.
  // Oct 2 client fix: page search.
  const [sq, setSq] = useState('');
  // Oct 13 client: Calendar | List toggle (Calendar default, remembered per device).
  const [shiftsView, setShiftsView] = useState<ShiftsView>(() => readShiftsView());
  const groups = useMemo(() => {
    const out = new Map<string, any[]>();
    for (const s of (list.data?.data ?? []).filter((x: any) => !sq.trim() || JSON.stringify(x).toLowerCase().includes(sq.trim().toLowerCase()))) {
      const day = dayAt(s.starts_at); // Oct 23 client: "Thu Oct 23"
      if (!out.has(day)) out.set(day, []);
      out.get(day)!.push(s);
    }
    return Array.from(out.entries());
  }, [list.data, sq]);

  // Week-grid map: { "yyyy-mm-dd|slotKey": shift[] }.
  const weekEnd = new Date(weekAnchor); weekEnd.setDate(weekEnd.getDate() + 7);
  const weekShifts = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const s of (list.data?.data ?? [])) {
      const startsMs = new Date(s.starts_at).getTime();
      if (startsMs < weekAnchor.getTime() || startsMs >= weekEnd.getTime()) continue;
      const dateKey = localDateKey(new Date(s.starts_at)); // LOCAL day, not UTC
      const slot = slotForShift(s);
      if (!slot) continue;
      const k = `${dateKey}|${slot}`;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(s);
    }
    return map;
  }, [list.data, weekAnchor.getTime()]);
  const daysInWeek = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekAnchor); d.setDate(d.getDate() + i); return d;
  });
  const totalSlots = 21;
  const filledSlots = Array.from(weekShifts.values()).filter((arr) => arr.length > 0).length;
  const coveragePct = Math.round((filledSlots / totalSlots) * 100);
  const coverageTone = coveragePct >= 75 ? 'bg-sage text-forest' : coveragePct >= 40 ? 'bg-amber-soft text-[#9a7415]' : 'bg-clay-soft text-clay';
  const weekLabel = `${weekAnchor.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} — ${new Date(weekEnd.getTime() - 86400000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

  function openFillForSlot(day: Date, slot: typeof SHIFT_SLOTS[number]) {
    // Aug 12: emit LOCAL yyyy-mm-ddTHH:mm — NOT toISOString(), which converts
    // NY-local to UTC and would make "8 AM Morning" click show as 12 PM in
    // the datetime-local input (and save into the Afternoon bucket).
    const d = new Date(day); d.setHours(slot.defaultHour, 0, 0, 0);
    const p = (n: number) => String(n).padStart(2, '0');
    setPrefillStart(`${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`);
    setShowNew(true);
  }

  return (
    <div className="space-y-3">
      <div className="rounded-[14px] border border-sage-line bg-sage/40 p-3 text-[12.5px] text-forest">
        <b>Shift schedule.</b> Add shifts for your dispatchers / drivers.
        A reminder SMS fires automatically <b>5 minutes before</b> the shift starts.
      </div>
      <SearchBar value={sq} onChange={setSq} placeholder="Search shifts — name, unit #, notes…" />

      {/* abc891 (Aug 20) — Dispatcher roster embedded above the weekly grid.
          Client verbatim: "Wanna add list of dispatchers here even if
          unassigned yet". Shares the ['dispatcher-roster'] query with the
          Dispatchers → Roster & SMS page, so no double-fetch. The "+ Add
          Dispatcher" button lives inside DispatchersRosterPanel. */}
      <details className="rounded-[14px] border border-line bg-paper" open>
        <summary className="cursor-pointer px-4 py-2.5 flex items-center gap-2 haptic hover:bg-cream/50 list-none">
          <span className="font-display font-bold text-[14px] text-ink">Dispatcher roster</span>
          <span className="text-[11.5px] text-muted">— everyone available, assigned or on-deck</span>
          <span className="ml-auto text-[11px] text-muted">click to collapse</span>
        </summary>
        <div className="px-4 pb-4 pt-1 border-t border-line/60">
          <DispatchersRosterPanel />
        </div>
      </details>

      {/* Oct 13 client: "see the shifts as a calendar like the pickups". */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <ShiftsViewToggle value={shiftsView} onChange={setShiftsView} />
          {/* Oct 14 client: "an easy way to edit the shifts template" + "clean up all the existing shifts" (office only). */}
          <ShiftsOfficeTools />
        </div>
        {shiftsView === 'calendar' && !isReadOnly() && <Button size="sm" variant="forest" icon={<Plus size={14} />} onClick={() => { setPrefillStart(null); setShowNew(true); }}>New shift</Button>}
      </div>
      {shiftsView === 'calendar' && (
        <ShiftsWeekCalendar search={sq} canEdit={!isReadOnly()}
                            onNew={(pre) => { setPrefillStart(pre); setShowNew(true); }}
                            actions={{
                              onEdit: (sh) => setEditShift(sh),
                              onSignIn: (sh) => actMut.mutate({ id: sh.id, action: 'sign-in' }),
                              onSignOut: (sh) => actMut.mutate({ id: sh.id, action: 'sign-out' }),
                              // Same confirm as the list's Cancel button.
                              onCancel: (sh) => { void askCancelShift(sh).then((scope) => { if (scope) { cancelMut.mutate({ id: sh.id, scope }); } }); },
                            }} />
      )}
      {shiftsView === 'list' && (<>
      {/* Week grid — 7 days × 3 slots. Fork J · client Aug 4. */}
      <div className="rounded-[14px] border border-line bg-paper p-3">
        <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            <button onClick={() => { const d = new Date(weekAnchor); d.setDate(d.getDate() - 7); setWeekAnchor(d); }}
                    className="haptic text-[12.5px] font-bold border border-line rounded-[8px] px-2 py-1 hover:bg-cream/60">◀</button>
            <button onClick={() => setWeekAnchor(startOfWeek(new Date()))}
                    className="haptic text-[12px] font-bold border border-line rounded-[8px] px-2.5 py-1 hover:bg-cream/60">This week</button>
            <button onClick={() => { const d = new Date(weekAnchor); d.setDate(d.getDate() + 7); setWeekAnchor(d); }}
                    className="haptic text-[12.5px] font-bold border border-line rounded-[8px] px-2 py-1 hover:bg-cream/60">▶</button>
            <span className="text-[12.5px] text-muted ml-1">{weekLabel}</span>
          </div>
          <div className={cx('text-[11.5px] font-extrabold px-2.5 py-1 rounded-full', coverageTone)}>
            {filledSlots} / {totalSlots} slots covered · {coveragePct}%
          </div>
        </div>
        <div className="grid grid-cols-[64px_repeat(7,1fr)] gap-1 text-[11.5px]">
          <div />
          {daysInWeek.map((d) => (
            <div key={d.toISOString()} className="font-extrabold uppercase tracking-[.05em] text-muted text-center py-1">
              {d.toLocaleDateString('en-US', { weekday: 'short' })}<br />
              <span className="text-ink text-[12px] font-bold">{d.getDate()}</span>
            </div>
          ))}
          {SHIFT_SLOTS.map((slot) => (
            <Fragment key={slot.key}>
              <div className="font-bold text-muted py-1.5 text-right pr-1 text-[11px]">{slot.label}</div>
              {daysInWeek.map((day) => {
                const dateKey = localDateKey(day); // LOCAL day, matches shift bucketing
                const cellShifts = weekShifts.get(`${dateKey}|${slot.key}`) ?? [];
                if (cellShifts.length === 0) {
                  return (
                    <button key={dateKey + slot.key} onClick={() => openFillForSlot(day, slot)}
                            className="haptic border border-dashed border-line/70 rounded-[8px] py-2 text-muted text-[10.5px] hover:bg-cream/50 hover:text-forest">
                      + Fill
                    </button>
                  );
                }
                return (
                  <div key={dateKey + slot.key} className="rounded-[8px] bg-sage/40 text-forest-deep border border-sage-line px-1.5 py-1 space-y-0.5">
                    {cellShifts.map((sh: any) => {
                      const first = String(sh.first_name || '').trim();
                      const last  = String(sh.last_name  || '').trim();
                      const lastInitial = last ? `${last.charAt(0)}.` : '';
                      const shown = first
                        ? `${first}${lastInitial ? ' ' + lastInitial : ''}`
                        : (last ? last : 'Taken');
                      return (
                        <button key={sh.id}
                                onClick={() => setEditShift(sh)}
                                title="Click to edit or cancel this shift"
                                className="haptic w-full text-left truncate text-[11px] font-bold text-forest-deep hover:underline">
                          <Name>{shown}</Name>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-[11px] font-extrabold uppercase tracking-[.05em] text-muted">
          {groups.reduce((s, [, rows]) => s + rows.length, 0)} upcoming (next 30 days)
        </div>
        {!isReadOnly() && <Button size="sm" variant="forest" icon={<Plus size={14} />} onClick={() => { setPrefillStart(null); setShowNew(true); }}>New shift</Button>}
      </div>
      {list.isLoading && <div className="text-[13px] text-muted">Loading…</div>}
      {groups.length === 0 && !list.isLoading && (
        <div className="text-[13px] text-muted italic">No shifts on the calendar yet.</div>
      )}
      {groups.map(([day, rows]) => (
        <div key={day}>
          <div className="text-[11px] font-extrabold uppercase tracking-[.05em] text-muted mb-1.5">{day}</div>
          <div className="space-y-1.5">
            {rows.map((sh: any) => {
              const start = timeAt(sh.starts_at); // Oct 23 client: New York time, one format
              const end   = timeAt(sh.ends_at);
              return (
                <div key={sh.id} className="rounded-[10px] border border-line bg-paper px-3 py-2 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-[13.5px] flex items-center gap-1.5 flex-wrap">
                      <span><Name first={sh.first_name} last={sh.last_name} /></span>
                      {sh.recurring_shift_id != null && (
                        <span className="text-[10px] font-extrabold uppercase tracking-[.05em] bg-sage text-forest px-1.5 py-[1px] rounded-full">Series</span>
                      )}
                    </div>
                    <div className="text-[11.5px] text-muted">
                      {start} — {end}
                      {sh.notes ? ` · ${sh.notes}` : ''}
                      {sh.signed_in_at && ` · signed in ${timeAt(sh.signed_in_at)}`}
                      {sh.signed_out_at && ` · signed out ${timeAt(sh.signed_out_at)}`}
                      {sh.reminder_sent_at && <span className="ml-1 text-forest">· 📩 reminder queued</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {!sh.signed_in_at && !sh.signed_out_at && (
                      <button onClick={() => actMut.mutate({ id: sh.id, action: 'sign-in' })}
                              className="haptic text-[11.5px] font-bold text-forest border border-forest/40 bg-sage/40 px-2 py-1 rounded-[8px]">
                        Sign in
                      </button>
                    )}
                    {sh.signed_in_at && !sh.signed_out_at && (
                      <button onClick={() => actMut.mutate({ id: sh.id, action: 'sign-out' })}
                              className="haptic text-[11.5px] font-bold text-clay border border-clay/40 bg-clay-soft/60 px-2 py-1 rounded-[8px]">
                        Sign out
                      </button>
                    )}
                    <button onClick={() => setEditShift(sh)}
                            className="haptic text-forest text-[10.5px] font-bold border border-line px-2 py-1 rounded-[8px] hover:bg-cream">
                      Edit
                    </button>
                    <button onClick={() => { void askCancelShift(sh).then((scope) => { if (scope) { cancelMut.mutate({ id: sh.id, scope }); } }); }}
                            className="haptic text-clay text-[10.5px] font-bold px-2 py-1 rounded-[8px] hover:bg-clay/10">
                      Cancel
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      </>)}
      {showNew && <NewShiftForm prefillStart={prefillStart} onDone={() => { setShowNew(false); setPrefillStart(null); qc.invalidateQueries({ queryKey: ['shifts'] }); }} onCancel={() => { setShowNew(false); setPrefillStart(null); }} />}
      {editShift && <EditShiftForm shift={editShift}
                                    onDone={() => { setEditShift(null); qc.invalidateQueries({ queryKey: ['shifts'] }); }}
                                    onCancelForm={() => setEditShift(null)}
                                    onDeleted={() => { setEditShift(null); qc.invalidateQueries({ queryKey: ['shifts'] }); }} />}

      {/* batch abc812 Aug 10 — Center Help moved out to its own top-level
          "Center Help" nav item; no longer a sub-section under Shifts. */}
    </div>
  );
}

// batch abc812 Aug 10 — export a standalone wrapper so CoordinatorPortal
// can mount CenterHelp as its own top-level page. Keeps the visual shell
// (title, padding) consistent with other panels.
export function CenterHelpStandalonePanel() {
  const [sq, setSq] = useState(''); // Oct 16 client: page search, like Shifts
  return (
    <div className="mt-2 space-y-3">
      {/* Oct 15 client (Yakov): list of people willing to help in the center, like the Dispatcher roster on Shifts. */}
      <details className="rounded-[14px] border border-line bg-paper" open>
        <summary className="cursor-pointer px-4 py-2.5 flex items-center gap-2 haptic hover:bg-cream/50 list-none">
          <span className="font-display font-bold text-[14px] text-ink">People willing to help in the center</span>
          <span className="text-[11.5px] text-muted">— drivers or typed names</span>
          <span className="ml-auto text-[11px] text-muted">click to collapse</span>
        </summary>
        <div className="px-4 pb-4 pt-1 border-t border-line/60">
          <CenterHelpPeoplePanel />
        </div>
      </details>
      {/* Nov 4 Yakov: punch in / out at the kiosk — who's in now, today, hours of the last 2 months, fix a time. */}
      <details className="rounded-[14px] border border-line bg-paper" open>
        <summary className="cursor-pointer px-4 py-2.5 flex items-center gap-2 haptic hover:bg-cream/50 list-none">
          <span className="font-display font-bold text-[14px] text-ink">Punch in / out (kiosk)</span>
          <span className="text-[11.5px] text-muted">— who's in now, today, hours of the last 2 months</span>
          <span className="ml-auto text-[11px] text-muted">click to collapse</span>
        </summary>
        <div className="px-4 pb-4 pt-2 border-t border-line/60">
          <CenterPunchPanel />
        </div>
      </details>
      {/* Oct 16 client: "make the calendar view as well ... really the same as the dispatcher". */}
      <SearchBar value={sq} onChange={setSq} placeholder="Search center help — task, name, notes, open…" />
      <CenterHelpSchedule search={sq} />
    </div>
  );
}

// ============================================================================
// Oct 15 client (Yakov): "a place to add names of people who say they're willing
// to help in the Center, same as by dispatcher". Like the Dispatcher roster:
// pick a driver from the directory, or type a name (+ phone). Notes, edit, remove.
// ============================================================================
function AddCenterHelperModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [mode, setMode] = useState<'driver' | 'typed'>('driver');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [added, setAdded] = useState<string | null>(null);
  const cand = useQuery({
    queryKey: ['center-help-people-candidates', q],
    queryFn: () => centerHelpPeople.candidates(q),
    enabled: mode === 'driver',
  });
  const add = useMutation({
    mutationFn: (body: { volunteerId?: number; name?: string; phone?: string | null; notes?: string | null; label: string }) =>
      centerHelpPeople.add({ volunteerId: body.volunteerId, name: body.name, phone: body.phone, notes: body.notes }),
    onSuccess: (_d, v) => {
      setErr(null);
      setAdded(v.label);
      setNotes('');
      if (v.volunteerId == null) { setName(''); setPhone(''); }
      qc.invalidateQueries({ queryKey: ['center-help-people'] });
      qc.invalidateQueries({ queryKey: ['person-roles'] }); // Oct 29 client: 🏠 In center tick
      qc.invalidateQueries({ queryKey: ['center-help-people-candidates'] });
    },
    onError: (e: Error) => setErr(e.message),
  });
  const rows: DispatcherCandidate[] = cand.data?.data ?? [];
  const tabCls = (on: boolean) => cx('haptic text-[12.5px] font-bold px-3 py-1.5 rounded-[8px] border',
    on ? 'bg-forest text-paper border-forest' : 'border-line text-muted hover:text-ink');
  return (
    <div className="fixed inset-0 z-50 bg-ink/40 flex items-start sm:items-center justify-center p-3 sm:p-6">
      <div className="bg-paper rounded-[16px] shadow-2xl w-full max-w-[520px] max-h-[85vh] flex flex-col overflow-hidden"
           onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-line flex items-center justify-between">
          <div className="font-display font-bold text-[17px] text-ink">Add someone for center help</div>
          <button onClick={onClose} className="text-muted hover:text-ink text-[20px] leading-none">×</button>
        </div>
        <div className="px-4 py-3 border-b border-line space-y-2">
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => { setMode('driver'); setErr(null); }} className={tabCls(mode === 'driver')}>Pick a driver</button>
            <button onClick={() => { setMode('typed'); setErr(null); }} className={tabCls(mode === 'typed')}>Type a name</button>
          </div>
          {mode === 'driver' && (
            <input value={q} onChange={(e) => setQ(e.target.value)}
                   placeholder="Search by name, phone, or unit #" autoFocus
                   className="w-full border border-line rounded-[10px] px-3 py-2 bg-paper text-[14px]" />
          )}
          {mode === 'typed' && (
            <div className="space-y-2">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (e.g. Weiss)" autoFocus
                     maxLength={120} className="w-full border border-line rounded-[10px] px-3 py-2 bg-paper text-[14px]" />
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone (optional)" inputMode="tel"
                     maxLength={40} className="w-full border border-line rounded-[10px] px-3 py-2 bg-paper text-[14px]" />
            </div>
          )}
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={500}
                    placeholder="Notes (optional) — e.g. which days, packing or cleaning"
                    className="w-full border border-line rounded-[10px] px-3 py-2 bg-paper text-[13px]" />
          <div className="text-[11.5px] text-muted">
            {mode === 'driver'
              ? 'Pick anyone in the volunteer directory. The notes above are saved with them.'
              : 'For someone who is not in the drivers list. Name is needed; phone and notes are optional.'}
          </div>
          {added && !err && (
            <div className="rounded-[8px] border border-sage-line bg-sage/40 text-forest px-2.5 py-1.5 text-[12px] font-semibold">
              Added {added}.
            </div>
          )}
          {err && (
            <div className="rounded-[8px] border border-clay/40 bg-clay-soft/50 text-clay px-2.5 py-1.5 text-[12px] font-semibold">{err}</div>
          )}
        </div>
        {mode === 'driver' ? (
          <div className="flex-1 overflow-y-auto">
            {cand.isLoading && <div className="p-4 text-[13px] text-muted">Loading…</div>}
            {!cand.isLoading && rows.length === 0 && (
              <div className="p-6 text-center text-[13px] text-muted italic">
                {q ? `No matches for "${q}". Use "Type a name" to add them anyway.` : 'No volunteers available to add.'}
              </div>
            )}
            <ul className="divide-y divide-line">
              {rows.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <div className="font-bold text-[14px] text-ink flex items-center gap-2 flex-wrap">
                      <span><Name first={r.firstName} last={r.lastName} /></span>
                      {r.unitNumber != null && <span className="text-muted font-semibold text-[11.5px]">#{r.unitNumber}</span>}
                    </div>
                    <div className="text-[12px] text-muted truncate">{r.phone ? displayPhone(r.phone) : 'no phone'}{r.email ? ` · ${r.email}` : ''}</div>
                  </div>
                  <button onClick={() => add.mutate({ volunteerId: Number(r.id), notes: notes.trim() || null, label: `${r.firstName} ${r.lastName}` })}
                          disabled={add.isPending}
                          className="haptic text-[12px] font-bold bg-forest text-paper px-3 py-1.5 rounded-[8px] shadow-ctag disabled:opacity-50">
                    {add.isPending && add.variables?.volunteerId === Number(r.id) ? 'Adding…' : 'Add'}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="px-4 py-3 flex justify-end">
            <button onClick={() => add.mutate({ name: name.trim(), phone: phone.trim() || null, notes: notes.trim() || null, label: name.trim() })}
                    disabled={add.isPending || !name.trim()}
                    className="haptic text-[13px] font-bold bg-forest text-paper px-4 py-2 rounded-[10px] shadow-ctag disabled:opacity-50">
              {add.isPending ? 'Adding…' : 'Add to list'}
            </button>
          </div>
        )}
        <div className="px-4 py-2.5 border-t border-line flex justify-end">
          <button onClick={onClose} className="haptic text-[12.5px] font-bold text-muted hover:text-ink px-3 py-1.5 rounded-[8px]">Done</button>
        </div>
      </div>
    </div>
  );
}

function CenterHelperCard({ row, onRemove, busy, roleData }: { row: CenterHelpPersonRow; onRemove: (r: CenterHelpPersonRow) => void; busy: boolean; roleData?: PersonRolesData }) {
  const qc = useQueryClient();
  const roles = rolesOf(roleData, row.volunteerId); // Oct 29 client: roles
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(row.name);
  const [phone, setPhone] = useState(row.phone ?? '');
  const [notes, setNotes] = useState(row.notes ?? '');
  const [err, setErr] = useState<string | null>(null);
  const typed = row.source === 'typed';
  const save = useMutation({
    mutationFn: () => centerHelpPeople.update(row.id, typed
      ? { name: name.trim(), phone: phone.trim() || null, notes: notes.trim() || null }
      : { notes: notes.trim() || null }),
    onSuccess: () => { setErr(null); setEditing(false); qc.invalidateQueries({ queryKey: ['center-help-people'] }); },
    onError: (e: Error) => setErr(e.message),
  });
  const startEdit = () => { setName(row.name); setPhone(row.phone ?? ''); setNotes(row.notes ?? ''); setErr(null); setEditing(true); };
  return (
    <div className="rounded-[12px] border border-line bg-paper px-3 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-bold text-[14px] text-ink flex items-center gap-2 flex-wrap">
            <span className="truncate"><Name>{row.name}</Name></span>
            {/* Oct 29 client: a driver shows his role tags (🏠 In center first) instead of the plain "Driver" tag. */}
            {typed || row.driverRemoved || !roles ? (
              <span className={cx('text-[10.5px] font-bold rounded-full px-2 py-0.5',
                                  typed ? 'text-muted bg-line/60' : 'text-forest bg-sage/60')}>
                {typed ? 'Typed name' : row.driverRemoved ? 'Driver (removed)' : 'Driver'}
              </span>
            ) : <RoleTags r={{ ...roles, center: true }} first="center" />}
          </div>
          {!editing && (
            <>
              <div className="text-[12px] text-muted mt-0.5">{row.phone ? displayPhone(row.phone) : 'no phone'}</div>
              {row.notes && <div className="text-[12px] text-ink/80 italic mt-0.5 whitespace-pre-wrap">{row.notes}</div>}
            </>
          )}
        </div>
        {!editing && (
          <div className="flex items-center gap-1.5 shrink-0">
            <button onClick={startEdit}
                    className="haptic text-forest text-[11px] font-bold px-2.5 py-1 rounded-[8px] border border-forest/40 hover:bg-sage/60">
              Edit
            </button>
            <button onClick={() => onRemove(row)} disabled={busy}
                    className="haptic px-2 py-1 text-[12.5px] font-bold text-clay hover:underline disabled:opacity-50">
              Remove
            </button>
          </div>
        )}
      </div>
      {editing && (
        <div className="mt-2 space-y-1.5">
          {typed && (
            <>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" maxLength={120}
                     className="w-full border border-line rounded-[8px] px-2.5 py-1.5 bg-paper text-[13px]" />
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone (optional)" inputMode="tel" maxLength={40}
                     className="w-full border border-line rounded-[8px] px-2.5 py-1.5 bg-paper text-[13px]" />
            </>
          )}
          {!typed && <div className="text-[11.5px] text-muted">Name and phone come from the driver's profile.</div>}
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={500} placeholder="Notes (optional)"
                    className="w-full border border-line rounded-[8px] px-2.5 py-1.5 bg-paper text-[13px]" />
          {err && <div className="text-clay text-[12px] font-semibold">{err}</div>}
          <div className="flex justify-end gap-2">
            <button onClick={() => setEditing(false)} className="haptic text-[12px] font-bold text-muted hover:text-ink px-3 py-1.5 rounded-[8px]">Cancel</button>
            <button onClick={() => save.mutate()} disabled={save.isPending || (typed && !name.trim())}
                    className="haptic text-[12px] font-bold bg-forest text-paper px-3 py-1.5 rounded-[8px] shadow-ctag disabled:opacity-50">
              {save.isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function CenterHelpPeoplePanel() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['center-help-people'], queryFn: () => centerHelpPeople.list(), refetchInterval: 60_000 });
  const rolesQ = usePersonRoles(); // Oct 29 client: role tags instead of "Driver"
  const [showAdd, setShowAdd] = useState(false);
  const [mutErr, setMutErr] = useState<string | null>(null);
  const del = useMutation({
    mutationFn: (id: number) => centerHelpPeople.remove(id),
    onSuccess: () => {
      setMutErr(null);
      qc.invalidateQueries({ queryKey: ['center-help-people'] });
      qc.invalidateQueries({ queryKey: ['person-roles'] }); // Oct 29 client: 🏠 In center tick
      qc.invalidateQueries({ queryKey: ['center-help-people-candidates'] });
    },
    onError: (e: Error) => setMutErr(`Remove failed: ${e.message}`),
  });
  const rows: CenterHelpPersonRow[] = q.data?.data ?? [];
  const remove = (r: CenterHelpPersonRow) => {
    void uiConfirm(`Remove ${r.name} from the center help list?`).then((ok) => { if (ok) del.mutate(r.id); });
  };
  return (
    <div className="space-y-3">
      <div className="rounded-[12px] border border-line bg-sage-soft/40 px-3 py-2 flex items-start justify-between gap-3 flex-wrap">
        <div className="text-[12.5px] text-forest-deep min-w-0 flex-1">
          <b>People willing to help in the center.</b> Add someone the moment they say they can help:
          pick a driver, or type a name if they are not in the drivers list. They show first when you
          put people on a center help shift below.
        </div>
        <button onClick={() => setShowAdd(true)}
                className="haptic text-[13px] font-bold bg-forest text-paper px-4 py-2 rounded-[10px] shadow-ctag whitespace-nowrap">
          + Add person
        </button>
      </div>
      {q.isLoading && <div className="text-[13px] text-muted">Loading…</div>}
      {q.error != null && <div className="text-clay text-[13px]">Failed to load the list: {(q.error as Error).message}</div>}
      {mutErr && (
        <div className="rounded-[10px] border border-clay/40 bg-clay-soft/50 text-clay px-3 py-2 text-[12.5px] font-semibold flex items-start justify-between gap-2">
          <span>{mutErr}</span>
          <button onClick={() => setMutErr(null)} className="haptic text-clay/70 hover:text-clay text-[16px] leading-none">×</button>
        </div>
      )}
      {!q.isLoading && q.error == null && rows.length === 0 && (
        <div className="rounded-[12px] border border-line bg-cream/40 px-4 py-6 text-center text-muted text-[13px] italic">
          No one on the list yet. Click <b>+ Add person</b> to add someone.
        </div>
      )}
      {rows.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {rows.map((r) => (
            <CenterHelperCard key={r.id} row={r} onRemove={remove} busy={del.isPending && del.variables === r.id} roleData={rolesQ.data?.data} />
          ))}
        </div>
      )}
      {showAdd && <AddCenterHelperModal onClose={() => setShowAdd(false)} />}
    </div>
  );
}

// Oct 16 client: the old Center Help week grid + task list + template form + assign
// modal were replaced by center-help-schedule.tsx (calendar, list, Weekly template).

function VolunteerPicker({ volunteers, value, onChange, placeholder = '— pick a person —', dimIds, dimNote }: {
  volunteers: any[];
  value: number | '';
  onChange: (id: number | '') => void;
  placeholder?: string;
  /** Oct 29 client: shown greyed with a note (e.g. 📅 Steady off), still pickable. */
  dimIds?: Set<number>;
  dimNote?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);
  const selected = volunteers.find(v => Number(v.id) === Number(value));
  const label = selected
    ? `${selected.firstName ?? ''} ${selected.lastName ?? ''}`.trim()
      + (selected.unitNumber != null ? ` #${selected.unitNumber}` : '')
      + (selected.phonePrimary ? ` · ${displayPhone(selected.phonePrimary)}` : '')
    : '';
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);
  const digits = (s: string) => (s || '').replace(/\D+/g, '');
  const qq = q.trim().toLowerCase();
  const qDigits = digits(q);
  const filtered = !qq
    ? volunteers.slice(0, 200)
    : volunteers.filter((v: any) => {
        const nm = `${v.firstName ?? ''} ${v.lastName ?? ''}`.toLowerCase();
        const ph = digits(v.phonePrimary || '');
        const un = v.unitNumber != null ? String(v.unitNumber) : '';
        return nm.includes(qq) || (qDigits && ph.includes(qDigits)) || un === qq;
      }).slice(0, 200);
  return (
    <div className="relative" ref={wrapRef}>
      <input
        type="text"
        value={open ? q : label}
        placeholder={placeholder}
        onFocus={() => { setOpen(true); setQ(''); }}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        className="w-full border border-line rounded-[8px] px-2 py-1.5 bg-paper text-[13px]"
      />
      {open && (
        <div className="absolute z-30 mt-1 left-0 right-0 max-h-64 overflow-auto bg-paper border border-line rounded-[10px] shadow-lg">
          <button type="button"
                  onMouseDown={(e) => { e.preventDefault(); onChange(''); setOpen(false); }}
                  className="w-full text-left px-3 py-2 text-[12.5px] text-muted hover:bg-cream/70 border-b border-line">
            {placeholder}
          </button>
          {filtered.length === 0 ? (
            <div className="px-3 py-3 text-[12.5px] text-muted italic">No matches</div>
          ) : filtered.map((v: any) => {
            const nm = `${v.firstName ?? ''} ${v.lastName ?? ''}`.trim();
            const un = v.unitNumber != null ? ` #${v.unitNumber}` : '';
            const ph = v.phonePrimary ? ` · ${displayPhone(v.phonePrimary)}` : '';
            const dim = !!dimIds?.has(Number(v.id));
            return (
              <button key={v.id} type="button"
                      onMouseDown={(e) => { e.preventDefault(); onChange(Number(v.id)); setOpen(false); }}
                      className={cx('w-full text-left px-3 py-2 text-[13px] hover:bg-cream/70',
                                    dim && 'text-muted opacity-60',
                                    Number(v.id) === Number(value) && 'bg-sage/40 font-bold')}>
<bdi dir="auto">{nm}</bdi>{un}{ph}{dim && dimNote ? <span className="ml-1 text-[11px] italic">({dimNote})</span> : null}{v._onDeck ? <span className="ml-1.5 rounded-full bg-sage px-1.5 py-px text-[10.5px] font-bold text-forest">on deck</span> : null}{v._noLogin ? <span className="ml-1.5 text-[10.5px] text-muted">no dispatcher login yet</span> : null}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Oct 14 client: the shift pickers list current dispatchers only (+ whoever is
// already on the shift). Until the roster loads, show everyone.
// Nov 5 client: "offer dispatchers on deck first" — On Deck / Available (no shift now or in 24 h, like the Roster)
// first, with a small "on deck" tag (_onDeck), then the rest. On deck = can really dispatch (canDispatch: a
// dispatcher / office login); the ones with no dispatcher login yet come last (_noLogin).
// Nov 6 client: the friendly dispatcher picker (dispatcher-picker.tsx) — avatars, "Moshe A.", tags, groups.
function ShiftDispatcherPicker({ vols, roster, value, onChange }: { vols: any[]; value: number | ''; onChange: (id: number | '') => void;
  roster: Array<{ id: number; firstName?: string; lastName?: string; phone?: string | null; currentShift?: unknown; nextShift?: unknown; canDispatch?: boolean }> | undefined }) {
  const people = useMemo<PickPerson[]>(() => {
    const fromVol = (v: any): PickPerson => ({ id: Number(v.id), name: shortName(v.firstName, v.lastName), search: `${v.firstName ?? ''} ${v.lastName ?? ''} ${String(v.phonePrimary ?? '').replace(/\D/g, '')}`, noCell: !v.phonePrimary });
    if (!roster) return vols.map(fromVol); // until the roster loads, show everyone (as before)
    const list: PickPerson[] = roster.map((r) => ({ id: Number(r.id), name: shortName(r.firstName, r.lastName), search: `${r.firstName ?? ''} ${r.lastName ?? ''} ${String(r.phone ?? '').replace(/\D/g, '')}`,
      onDeck: r.canDispatch !== false && r.currentShift == null && !(r.nextShift && Date.parse(String((r.nextShift as any).startsAt ?? (r.nextShift as any).starts_at ?? '')) < Date.now() + 24 * 3600e3), onShiftNow: r.currentShift != null, noCell: !r.phone, noLogin: r.canDispatch === false }));
    // whoever is already on the shift stays pickable
    if (value !== '' && !list.some((p) => p.id === Number(value))) { const v = vols.find((x) => Number(x.id) === Number(value)); if (v) list.push(fromVol(v)); }
    return list;
  }, [vols, roster, value]);
  return <DispatcherPicker people={people} value={value === '' ? null : Number(value)} onChange={(v) => onChange(typeof v === 'number' ? v : '')} ariaLabel="Dispatcher" testId="shift-dispatcher" />;
}
function EditShiftForm({ shift, onDone, onCancelForm, onDeleted }: {
  shift: any; onDone: () => void; onCancelForm: () => void; onDeleted: () => void;
}) {
  const qc = useQueryClient();
  const vols = useQuery({ queryKey: ['admin-volunteers'], queryFn: () => api<{ data: any[] }>('/api/volunteers?limit=500') });
  // Oct 14 client: shifts are for current dispatchers only (others were junk on the list).
  const roster = useQuery({ queryKey: ['dispatcher-roster'], queryFn: () => dispatchers.list(), refetchInterval: 60_000 });
  const initStart = new Date(shift.starts_at);
  const initEnd   = new Date(shift.ends_at);
  const toLocalDT = (d: Date) => {
    // yyyy-MM-ddTHH:mm for datetime-local input
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const [volunteerId, setVid]   = useState<number | ''>(shift.volunteer_id ?? '');
  const [startsAt, setStartsAt] = useState(toLocalDT(initStart));
  const [endsAt,   setEndsAt]   = useState(toLocalDT(initEnd));
  const [notes,    setNotes]    = useState<string>(shift.notes ?? '');
  const [err, setErr] = useState<string | null>(null);
  const patchMut = useMutation({
    mutationFn: () => shiftsApi.update(Number(shift.id), {
      volunteerId: volunteerId ? Number(volunteerId) : undefined,
      startsAt: new Date(startsAt).toISOString(),
      endsAt:   new Date(endsAt).toISOString(),
      notes: notes.trim() || null,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['shifts'] }); onDone(); },
    onError:   (e: any) => setErr(e?.message || 'update failed'),
  });
  const cancelMut = useMutation({
    mutationFn: (scope: 'one' | 'future') => cancelShift(Number(shift.id), scope), // Oct 14 client
    onSuccess: () => onDeleted(),
  });
  const seriesNote = shift.recurring_shift_id != null;
  return (
    <Modal title="Edit shift" onClose={onCancelForm}>
      <div className="space-y-3">
        {seriesNote && (
          <div className="text-[11.5px] text-muted italic border-l-2 border-line pl-2">
            This shift belongs to a weekly series. Editing here changes only THIS instance.
            To change every week, use <b>Weekly template</b>; <b>Cancel shift</b> can also stop this and all future ones.
          </div>
        )}
        <div>
          <label className="block text-[11px] font-extrabold uppercase tracking-[.05em] text-muted mb-1">Volunteer</label>
          <ShiftDispatcherPicker vols={vols.data?.data ?? []} roster={roster.data?.data} value={volunteerId} onChange={setVid} />

        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[11px] font-extrabold uppercase tracking-[.05em] text-muted mb-1">Starts at</label>
            <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)}
                   className="w-full border border-line rounded-[8px] px-2 py-1.5 bg-paper text-[13px]" />
          </div>
          <div>
            <label className="block text-[11px] font-extrabold uppercase tracking-[.05em] text-muted mb-1">Ends at</label>
            <input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)}
                   className="w-full border border-line rounded-[8px] px-2 py-1.5 bg-paper text-[13px]" />
          </div>
        </div>
        <div>
          <label className="block text-[11px] font-extrabold uppercase tracking-[.05em] text-muted mb-1">Notes</label>
          <input value={notes} onChange={(e) => setNotes(e.target.value)}
                 placeholder="Optional"
                 className="w-full border border-line rounded-[8px] px-2 py-1.5 bg-paper text-[13px]" />
        </div>
        {err && <div className="text-[12px] text-clay font-bold">{err}</div>}
        {/* tier3 Aug 23 — while either mutation is in-flight, disable BOTH
            row action buttons so the office can't stack a save on top of a
            pending cancel (or vice-versa). */}
        {(() => { const rowBusy = patchMut.isPending || cancelMut.isPending; return (
        <div className="flex items-center justify-between pt-1">
          <button onClick={() => { void askCancelShift(shift).then((scope) => { if (scope) { cancelMut.mutate(scope); } }); }}
                  disabled={rowBusy}
                  className="haptic text-clay text-[12px] font-bold px-3 py-1.5 rounded-[8px] border border-clay/40 hover:bg-clay/10 disabled:opacity-40 disabled:cursor-not-allowed">
            {cancelMut.isPending ? 'Cancelling…' : 'Cancel shift'}
          </button>
          <div className="flex items-center gap-2">
            <button onClick={onCancelForm}
                    className="haptic text-[12px] font-bold text-muted px-3 py-1.5">Close</button>
            <button onClick={() => patchMut.mutate()} disabled={rowBusy}
                    className="haptic text-[12px] font-bold bg-forest text-paper px-3 py-1.5 rounded-[8px] shadow-ctag disabled:opacity-50">
              {patchMut.isPending ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
        ); })()}
      </div>
    </Modal>
  );
}

function NewShiftForm({ prefillStart, onDone, onCancel }: { prefillStart?: string | null; onDone: () => void; onCancel: () => void }) {
  const [volunteerId, setVid] = useState<number | ''>('');
  // STEADY is the default per client Aug 4. One-time available for exceptions.
  const [mode, setMode] = useState<'steady' | 'once'>('steady');
  // Prefill from calendar cell (a specific date+time). We use that to guess
  // both a good dayOfWeek (for steady) and startsAt/endsAt (for once).
  const prefill = prefillStart ? new Date(prefillStart) : null;
  const [dayOfWeek, setDow] = useState<number>(prefill ? prefill.getDay() : new Date().getDay());
  const [startTime, setStartTime] = useState<string>(() => {
    if (prefill) return `${String(prefill.getHours()).padStart(2, '0')}:${String(prefill.getMinutes()).padStart(2, '0')}`;
    return '09:00';
  });
  const [endTime, setEndTime] = useState<string>(() => {
    const base = prefill ? new Date(prefill) : new Date(Date.now() + 4 * 60 * 60 * 1000);
    if (prefill) base.setHours(base.getHours() + 4);
    return `${String(base.getHours()).padStart(2, '0')}:${String(base.getMinutes()).padStart(2, '0')}`;
  });
  const [startsAt, setStartsAt] = useState<string>(() => {
    if (prefillStart) return prefillStart;
    const d = new Date(Date.now() + 60 * 60 * 1000);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  });
  const [endsAt, setEndsAt] = useState<string>(() => {
    const base = prefillStart ? new Date(prefillStart) : new Date(Date.now() + 3 * 60 * 60 * 1000);
    if (prefillStart) base.setHours(base.getHours() + 4);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${base.getFullYear()}-${p(base.getMonth()+1)}-${p(base.getDate())}T${p(base.getHours())}:${p(base.getMinutes())}`;
  });
  const [notes, setNotes] = useState('');
  const volunteers = useQuery({ queryKey: ['admin-volunteers'], queryFn: () => api<{ data: any[] }>('/api/volunteers?limit=500') });
  const roster = useQuery({ queryKey: ['dispatcher-roster'], queryFn: () => dispatchers.list(), refetchInterval: 60_000 }); // Oct 14 client
  const DOW_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const save = useMutation({
    mutationFn: () => mode === 'steady'
      ? shiftsApi.create({
          volunteerId: Number(volunteerId),
          isSteady: true,
          dayOfWeek,
          startTime,
          endTime,
          notes: notes.trim() || null,
        })
      : shiftsApi.create({
          volunteerId: Number(volunteerId),
          isSteady: false,
          startsAt: new Date(startsAt).toISOString(),
          endsAt: new Date(endsAt).toISOString(),
          notes: notes.trim() || null,
        }),
    onSuccess: onDone,
  });
  return (
    <Modal title="New shift" onClose={onCancel}>
      {/* Steady vs one-time — steady is the default. Client Aug 4:
          "Most dispatcher shifts repeat weekly." */}
      <div className="flex items-center gap-1 bg-cream/60 border border-line rounded-[10px] p-1 mb-3 w-fit">
        <button type="button" onClick={() => setMode('steady')}
                className={cx('haptic text-[12.5px] font-bold px-3 py-1.5 rounded-[8px]',
                              mode === 'steady' ? 'bg-forest text-paper' : 'text-muted hover:text-forest')}>
          Every week{/* Nov 6 Yakov: same words as the Assign popup (was "Steady (weekly)") */}
        </button>
        <button type="button" onClick={() => setMode('once')}
                className={cx('haptic text-[12.5px] font-bold px-3 py-1.5 rounded-[8px]',
                              mode === 'once' ? 'bg-forest text-paper' : 'text-muted hover:text-forest')}>
          Just this once
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Volunteer / dispatcher" full>
          <ShiftDispatcherPicker vols={volunteers.data?.data ?? []} roster={roster.data?.data} value={volunteerId} onChange={setVid} />

        </Field>
        {mode === 'steady' ? (
          <>
            <Field label="Day of week" full>
              <select value={dayOfWeek} onChange={(e) => setDow(Number(e.target.value))} className={inputCls}>
                {DOW_LABELS.map((label, i) => (
                  <option key={i} value={i}>{label}</option>
                ))}
              </select>
            </Field>
            <Field label="Start time">
              <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className={inputCls} />
            </Field>
            <Field label="End time">
              <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className={inputCls} />
            </Field>
          </>
        ) : (
          <>
            <Field label="Starts">
              <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Ends">
              <input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className={inputCls} />
            </Field>
          </>
        )}
        <Field label="Notes (optional)" full>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} placeholder="e.g. dispatcher shift · office phone" />
        </Field>
      </div>
      {mode === 'steady' && (
        <p className="text-[11.5px] text-muted mt-2">Repeats every {DOW_LABELS[dayOfWeek]} at {fmtTime(startTime)}–{fmtTime(endTime)} until cancelled.</p>
      )}
      {save.error && <p className="text-clay text-[12px] mt-3">{(save.error as Error).message}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Button size="sm" variant="plain" onClick={onCancel}>Cancel</Button>
        <Button size="sm" loading={save.isPending}
                disabled={!volunteerId || !startsAt || !endsAt}
                onClick={() => save.mutate()}>
          Create shift
        </Button>
      </div>
    </Modal>
  );
}

/**
 * upsms (Aug 20) — "Upcoming SMS" coordinator panel.
 *
 * Shows the next automatic consolidated broadcast (hourly 8am-9pm NY-local; Oct 12 client: was 9am +
 * off-cycle top-of-hour rules) with the trips it will include, and four
 * controls: Send Now / Cancel / Send Earlier / Send Later.
 *
 * Backend: /api/sms/upcoming-drop (+ /send-now, /cancel-next, /uncancel,
 * /reschedule). Every mutation supports a dryRun preview so nothing goes out
 * accidentally during testing — see the "Preview" pill next to Send Now.
 */
// Aug 21 — Shabbos indicator. Reads /api/sms/shabbos-status every minute.
function ShabbosBanner() {
  const q = useQuery({
    queryKey: ['shabbos-status'],
    queryFn: () => shabbosStatus.get(),
    refetchInterval: 60_000,
  });
  const active = q.data?.data?.active;
  if (!active) return null;
  return (
    <div className="rounded-[10px] border border-amber/60 bg-amber/15 px-3 py-2 text-[13px] text-forest-deep font-bold flex items-center gap-2">
      <span>🕯️</span>
      <span>Shabbos quiet — all automatic SMS paused until Saturday 10:00 PM. Manual Send Now still works.</span>
    </div>
  );
}

// Aug 21 — Next thank-you scheduler. Shows the next fire time (auto-computed
// with the Fri-5pm rule) and lets the operator override it.
function NextThankYouSection() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['next-thank-you'],
    queryFn: () => nextThankYou.get(),
    refetchInterval: 60_000,
  });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const info = q.data?.data;

  const openEdit = () => {
    if (!info) return;
    // Prefill the datetime-local input with NY-local rendering of the current
    // scheduled time (or the user's override).
    const src = info.override ?? info.scheduledFor;
    const d   = new Date(src);
    const pad = (n: number) => String(n).padStart(2, '0');
    // Convert to NY-local YYYY-MM-DDTHH:MM for the input control.
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(d);
    const map: Record<string, string> = {};
    for (const p of parts) map[p.type] = p.value;
    setDraft(`${map.year}-${map.month}-${map.day}T${pad(parseInt(map.hour ?? '0', 10))}:${map.minute}`);
    setEditing(true);
  };

  const saveMut = useMutation({
    mutationFn: (iso: string | null) => nextThankYou.put(iso),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['next-thank-you'] }); setEditing(false); },
  });

  const submitOverride = () => {
    if (!draft) return;
    // Parse the datetime-local string as NY wall-clock and convert to ISO.
    // Simplest correct approach: append the current NY offset for that instant.
    const naive = new Date(draft); // interpreted as browser-local; we'll correct.
    // Compute the NY-hour delta.
    const nyHH = parseInt(new Intl.DateTimeFormat('en-GB', { timeZone: 'America/New_York', hour12: false, hour: '2-digit' }).format(naive), 10);
    const localHH = naive.getHours();
    const iso = new Date(naive.getTime() - (nyHH - localHH) * 3600_000).toISOString();
    saveMut.mutate(iso);
  };

  const clearOverride = () => saveMut.mutate(null);

  if (q.isLoading || !info) {
    return <div className="rounded-[14px] border border-line bg-paper px-4 py-3 text-[12.5px] text-muted">Loading next thank-you…</div>;
  }

  return (
    <div className="rounded-[14px] border border-line bg-paper px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-extrabold uppercase tracking-[.08em] text-muted mb-1">
            Next thank-you SMS {info.isOverride && <span className="text-clay">· overridden</span>}
          </div>
          <div className="font-display font-bold text-[17px] text-ink">
            {fmtDateTimeEastern(info.scheduledFor)}
          </div>
          <div className="text-[11.5px] text-muted mt-1">
            Fridays fire at 5:00 PM (before Shabbos). Other days at 10:00 PM NY.
          </div>
        </div>
        {!editing && (
          <button onClick={openEdit}
                  className="shrink-0 rounded-full border border-forest text-forest px-3 py-1.5 text-[12px] font-bold haptic">
            Edit time
          </button>
        )}
      </div>

      {editing && (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="text-[11.5px] text-muted">
            <div className="mb-1 font-semibold">Next thank-you (NY time)</div>
            <input type="datetime-local" value={draft} onChange={(e) => setDraft(e.target.value)}
                   className="rounded-[10px] border border-line px-3 py-2 text-[13px] outline-none focus:border-forest" />
          </label>
          <button onClick={submitOverride} disabled={!draft || saveMut.isPending}
                  className="rounded-[10px] bg-forest text-paper px-3 py-2 text-[12.5px] font-bold haptic disabled:opacity-40">
            Save override
          </button>
          {info.isOverride && (
            <button onClick={clearOverride} disabled={saveMut.isPending}
                    className="rounded-[10px] border border-line px-3 py-2 text-[12.5px] font-bold haptic">
              Clear override
            </button>
          )}
          <button onClick={() => setEditing(false)} disabled={saveMut.isPending}
                  className="rounded-[10px] border border-line px-3 py-2 text-[12.5px] haptic">
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * tier2 Aug 21 — datetime-local helpers anchored to New York.
 *
 * `<input type="datetime-local">` yields naked "YYYY-MM-DDTHH:MM" strings with
 * no timezone attached. `new Date(str).toISOString()` interprets them in the
 * BROWSER's timezone — fine for a coordinator sitting in NY, wrong for anyone
 * VPN'd in from another time zone (they'd schedule a drop hours off from what
 * the input said). These helpers force NY-local semantics on both directions.
 *
 * `nyLocalInputToISO('2026-08-21T15:30')` returns the UTC ISO instant that
 * corresponds to 3:30 PM Eastern on 2026-08-21, no matter where the client
 * clock is. `nyDateTimeLocalNow(offsetMs)` returns a NY-local
 * "YYYY-MM-DDTHH:MM" string suitable for prefilling / min / max attrs.
 */
function nyDateTimeLocalNow(offsetMs: number = 0): string {
  const d = new Date(Date.now() + offsetMs);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  // en-CA gives "24" for midnight hour; normalize back to "00".
  const hr = get('hour') === '24' ? '00' : get('hour');
  return `${get('year')}-${get('month')}-${get('day')}T${hr}:${get('minute')}`;
}
function nyLocalInputToISO(input: string): string {
  const [datePart, timePart = '00:00'] = String(input).split('T');
  const [y, mo, d] = datePart.split('-').map(Number);
  const [h, mi] = timePart.split(':').map(Number);
  const wantMs = Date.UTC(y, (mo || 1) - 1, d || 1, h || 0, mi || 0);
  // Ask what NY wall clock this UTC instant maps to, then use the delta to
  // correct our guess. Works across DST automatically.
  const guess = new Date(wantMs);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(guess);
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const gh = g('hour') === 24 ? 0 : g('hour');
  const nyMs = Date.UTC(g('year'), g('month') - 1, g('day'), gh, g('minute'));
  const offset = wantMs - nyMs;
  return new Date(wantMs + offset).toISOString();
}

export function UpcomingSmsPanel() {
  const qc = useQueryClient();
  // tier1-abcSN Aug 20 — added 'warn' tone so Send Now can honestly signal
  // "no eligible recipients" instead of lying with a green success toast.
  const [flash, setFlash] = useState<{ tone: 'ok' | 'warn' | 'err'; msg: string } | null>(null);
  const [previewOpen, setPreviewOpen] = useState<{ body: string; recipients?: number } | null>(null);
  const [rescheduleAt, setRescheduleAt] = useState<string>('');
  const [rescheduleOpen, setRescheduleOpen] = useState<null | 'earlier' | 'later'>(null);

  const info = useQuery({
    queryKey: ['upcoming-drop'],
    queryFn: () => upcomingSms.get(),
    refetchInterval: 30_000,
  });

  const data: UpcomingDropInfo | undefined = info.data?.data;

  const sendNowMut = useMutation({
    mutationFn: (dryRun: boolean) => upcomingSms.sendNow(dryRun),
    onSuccess: (res, dryRun) => {
      const d = res.data;
      if (dryRun) {
        setPreviewOpen({ body: d.preview ?? '(no preview body)', recipients: d.recipients });
      } else {
        // tier1-abcSN Aug 20 — inspect the response shape instead of assuming
        // any 2xx means "sent". Backend returns { sent, pickups, skipped?, ... }
        // and sent === 0 covers all the "not really delivered" cases:
        // already broadcast this drop, everyone's in quiet hours, or the
        // driver group is empty. Show amber warn instead of green success.
        const sent = typeof d.sent === 'number' ? d.sent : 0;
        if (sent > 0) {
          setFlash({
            tone: 'ok',
            msg: `${textedText(sent, d.recipients)}${d.skipped ? ` ${smsReasonText(d.skipped)}` : ''}`,
          });
        } else {
          setFlash({
            tone: (d as any).background ? 'ok' : 'warn', // Oct 20 client: texting in the background
            msg: d.skipped ? smsReasonText(d.skipped) : 'No eligible recipients (already sent this drop, quiet hours, or no drivers in group).',
          });
        }
      }
      qc.invalidateQueries({ queryKey: ['upcoming-drop'] });
      qc.invalidateQueries({ queryKey: ['admin-pickups'] });
    },
    onError: (e: Error) => setFlash({ tone: 'err', msg: e.message }),
  });

  const cancelMut = useMutation({
    mutationFn: () => upcomingSms.cancelNext(),
    onSuccess: (res) => {
      setFlash({ tone: 'ok', msg: `Next scheduled drop cancelled (until ${fmtDateTimeEastern(res.data.cancelledUntil)})` });
      qc.invalidateQueries({ queryKey: ['upcoming-drop'] });
    },
    onError: (e: Error) => setFlash({ tone: 'err', msg: e.message }),
  });

  const uncancelMut = useMutation({
    mutationFn: () => upcomingSms.uncancel(),
    onSuccess: () => {
      setFlash({ tone: 'ok', msg: 'Cancellation cleared — schedule resumed' });
      qc.invalidateQueries({ queryKey: ['upcoming-drop'] });
    },
    onError: (e: Error) => setFlash({ tone: 'err', msg: e.message }),
  });

  const rescheduleMut = useMutation({
    mutationFn: (iso: string) => upcomingSms.reschedule(iso),
    onSuccess: (res) => {
      setFlash({ tone: 'ok', msg: `Next drop rescheduled to ${fmtDateTimeEastern(res.data.overrideAt)}` });
      setRescheduleOpen(null); setRescheduleAt('');
      qc.invalidateQueries({ queryKey: ['upcoming-drop'] });
    },
    onError: (e: Error) => setFlash({ tone: 'err', msg: e.message }),
  });

  const nextWhenLabel = (() => {
    if (!data?.scheduledFor) return '—';
    const d = new Date(data.scheduledFor);
    const now = Date.now();
    const diffMin = Math.round((d.getTime() - now) / 60_000);
    const abs = whenAt(d); // Oct 23 client: one date + time format
    if (diffMin < 0) return `${abs} (overdue)`;
    if (diffMin < 60) return `${abs} · in ${diffMin} min`;
    const h = Math.floor(diffMin / 60), m = diffMin % 60;
    return `${abs} · in ${h}h ${m}m`;
  })();

  // Compute default datetime-local strings (yyyy-MM-ddTHH:mm) for earlier/later.
  // tier2 Aug 21 — express the prefilled time in NY-local wall clock so a
  // coordinator on a laptop with a non-NY system clock still sees "3:30 PM"
  // meaning 3:30 PM Eastern, matching what the sweeper actually fires on.
  const defaultForDialog = (dir: 'earlier' | 'later'): string => {
    const baseMs = data?.scheduledFor ? Date.parse(data.scheduledFor) : Date.now() + 30 * 60_000;
    const shiftMs = (dir === 'earlier' ? -30 : 30) * 60_000;
    const targetMs = baseMs + shiftMs;
    // Never propose the past.
    const safeMs = targetMs > Date.now() ? targetMs : Date.now() + 10 * 60_000;
    return nyDateTimeLocalNow(safeMs - Date.now());
  };

  const openReschedule = (dir: 'earlier' | 'later') => {
    setRescheduleOpen(dir);
    setRescheduleAt(defaultForDialog(dir));
  };

  const cancelled = !!data?.cancelledUntil && Date.now() < Date.parse(data.cancelledUntil);
  const override  = !!data?.overrideAt;
  const dryRunLive = !!data?.dryRunActive;

  return (
    <div className="space-y-3">
      <div className="flex items-baseline gap-2">
        <div className="font-display font-bold text-[18px] text-forest">Upcoming SMS</div>
        <div className="text-[12.5px] text-muted">Next automatic broadcast to the default driver group.</div>
      </div>

      {dryRunLive && (
        <div className="rounded-[10px] border border-amber/50 bg-amber/10 px-3 py-2 text-[12.5px] text-forest-deep font-semibold">
          Server-wide DRY RUN is active (SMS_DROP_DRY_RUN=true) — no SMS will go out even from Send Now.
        </div>
      )}

      <ShabbosBanner />
      <OfficeScheduledList />{/* Oct 23 client: scheduled texts (incl. late-night "Schedule for 8:00 AM") */}
      <NextThankYouSection />

      {info.isLoading && <div className="text-[12.5px] text-muted">Loading…</div>}
      {info.isError && <div className="text-[12.5px] text-clay">Failed to load upcoming drop.</div>}

      {data && (
        <>
          <div className="rounded-[14px] border border-line bg-paper p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] font-extrabold uppercase tracking-[.08em] text-muted mb-1">
                  {data.kind === 'scheduled' ? 'Scheduled drop' :
                   data.kind === 'off-cycle' ? 'Off-cycle drop (unposted pickup)' :
                   data.kind === 'override'  ? 'Coordinator override' :
                   data.kind === 'cancelled' ? 'Cancelled' : 'No upcoming drop'}
                </div>
                <div className="font-display font-bold text-[20px] text-ink">{nextWhenLabel}</div>
                <div className="text-[12.5px] text-muted mt-1">{data.reason}</div>
                {/* Oct 2 client: hourly texts only go out when something is new. */}
                {/* Oct 8 client: the server now says whether it will skip, using the
                    same rule as the actual send (this used to be guessed here and
                    could say "skipped" while the text went out). */}
                {((data as any).willSkip ?? (data.includedPickups.length > 0 && data.includedPickups.every((p: any) => p.already_broadcast))) && (
                  <div className="mt-2 rounded-[10px] bg-amber-soft px-3 py-2 text-[12.5px] font-bold text-[#9a7415]">
                    Nothing new since the last text, so this hourly text will be skipped. If a new pickup comes in before then, it will go out.
                  </div>
                )}
                {cancelled && (
                  <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-clay-soft border border-clay/40 text-clay px-2.5 py-1 text-[11.5px] font-bold">
                    Scheduled drop cancelled until {fmtDateTimeEastern(data.cancelledUntil!)}
                    <button onClick={() => uncancelMut.mutate()} disabled={uncancelMut.isPending}
                            className="ml-1 font-extrabold underline haptic">Uncancel</button>
                  </div>
                )}
                {override && (
                  <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-sky/10 border border-sky/40 text-sky px-2.5 py-1 text-[11.5px] font-bold">
                    Override set for {fmtDateTimeEastern(data.overrideAt!)}
                  </div>
                )}
              </div>
              <div className="text-right shrink-0">
                <div className="text-[11px] font-extrabold uppercase tracking-[.08em] text-muted">Trips included</div>
                <div className="font-display font-bold text-[28px] text-forest leading-none mt-1">{data.includedPickups.length}</div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button onClick={() => sendNowMut.mutate(false)} loading={sendNowMut.isPending && sendNowMut.variables === false}>
                Send Now
              </Button>
              <button onClick={() => sendNowMut.mutate(true)} disabled={sendNowMut.isPending}
                      className="text-[12.5px] font-bold border border-sky/40 bg-sky/10 text-sky rounded-[10px] px-3 py-2 haptic hover:bg-sky/15">
                Preview (dry-run)
              </button>
              <button onClick={() => cancelMut.mutate()} disabled={cancelMut.isPending || !data.scheduledFor}
                      className="text-[12.5px] font-bold border border-clay/40 text-clay rounded-[10px] px-3 py-2 haptic hover:bg-clay/10">
                Cancel next
              </button>
              <button onClick={() => openReschedule('earlier')}
                      className="text-[12.5px] font-bold border border-line text-ink rounded-[10px] px-3 py-2 haptic hover:bg-cream">
                Send Earlier
              </button>
              <button onClick={() => openReschedule('later')}
                      className="text-[12.5px] font-bold border border-line text-ink rounded-[10px] px-3 py-2 haptic hover:bg-cream">
                Send Later
              </button>
            </div>

            {flash && (
              // tier1-abcSN Aug 20 — three tones so the toast can honestly
              // report "sent" (green), "no eligible recipients" (amber warn),
              // and hard errors (clay).
              <div className={cx('mt-2 rounded-[8px] px-3 py-2 text-[12.5px] font-semibold',
                flash.tone === 'ok'
                  ? 'bg-sage border border-sage-line text-forest-deep'
                  : flash.tone === 'warn'
                    ? 'bg-amber/15 border border-amber/50 text-forest-deep'
                    : 'bg-clay-soft border border-clay/30 text-clay')}>
                {flash.msg}
              </div>
            )}
          </div>

          {Array.isArray((data as any).excludedPickups) && (data as any).excludedPickups.length > 0 && (
            <details className="rounded-[14px] border border-line bg-paper">
              <summary className="cursor-pointer px-4 py-2.5 font-display font-bold text-[14px] text-ink">
                Not in this text — and why ({(data as any).excludedPickups.length})
              </summary>
              <div className="divide-y divide-line">
                {(data as any).excludedPickups.map((x: any) => (
                  <div key={x.id} className="px-4 py-2 flex items-center gap-3 text-[12.5px]">
                    <span className="flex-1 min-w-0 truncate font-bold">{x.label}</span>
                    <span className="shrink-0 text-forest font-bold">{x.time ? fmtTime(x.time) : '—'}</span>
                    <span className="shrink-0 text-muted max-w-[45%] text-right">{x.why}</span>
                  </div>
                ))}
              </div>
            </details>
          )}
          <div className="rounded-[14px] border border-line bg-paper">
            <div className="px-4 py-2.5 border-b border-line font-display font-bold text-[14px] text-ink">
              Included trips
              {data.includedPickups.length === 0 && <span className="ml-2 text-[12px] text-muted font-normal">— no open uncovered pickups right now</span>}
            </div>
            <div className="divide-y divide-line">
              {data.includedPickups.map((p) => (
                <div key={p.id} className="px-4 py-2.5 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-display font-bold text-[13.5px] text-ink truncate">
                      {p.supplier_name ?? p.donor_name ?? '(no donor)'}
                    </div>
                    <div className="text-[11.5px] text-muted truncate">{p.address ?? '(no address)'}</div>
                    {(p as any).slots_remaining != null && (
                      <div className="text-[11px] text-clay font-semibold">
                        Included — {(p as any).slots_remaining} {(p as any).slots_remaining === 1 ? 'driver' : 'drivers'} still needed
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[12px] font-bold text-forest">{p.time ? fmtTime(p.time) : '—'}</div>
                    <div className="text-[10.5px] text-muted">
                      {p.scheduled_date === nyToday() ? 'today' : (p.scheduled_date ?? '')}
                    </div>
                  </div>
                  {p.already_broadcast && (
                    <span title="This pickup was included in a prior drop; it will be re-sent."
                          className="ml-2 text-[10px] font-bold uppercase tracking-wider bg-cream border border-line text-muted px-1.5 py-0.5 rounded-full">
                      re-send
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* abc890 (Aug 20) — "Later today" — every remaining scheduled drop
              hour for today, showing which OPEN pickups are queued to go out
              in each. Sections stay visible even when empty (0 trips) so
              coordinators can see the whole day at a glance.
              tier1-abcSN Aug 21 — pass allDropHours so each section can
              defensively re-filter its pickups to its own window
              (windowUntilForFireHour) instead of trusting stale bundle data
              if the backend ever slips and returns pickups past the boundary. */}
          {data.laterTodayPickups && data.laterTodayPickups.length > 0 && (
            <div className="rounded-[14px] border border-line bg-paper">
              <div className="px-4 py-2.5 border-b border-line font-display font-bold text-[14px] text-ink flex items-baseline gap-2">
                Rest of today
                <span className="text-[11.5px] text-muted font-normal">— what fires in each remaining drop</span>
              </div>
              <div className="divide-y divide-line">
                {data.laterTodayPickups.map((grp) => (
                  <LaterDropSection key={String(grp.dropHour ?? 'null')} group={grp} allDropHours={data.dropHours ?? []} />
                ))}
              </div>
            </div>
          )}

          {/* abc890 (Aug 20) — settings section: permanently change the drop
              schedule (persists in portal_settings.scheduled_drop_hours). */}
          <DropScheduleSettings />

          {data.lastScheduledDropAt && (
            <div className="text-[11.5px] text-muted">
              Last scheduled drop fired {fmtDateTimeEastern(data.lastScheduledDropAt)}.
            </div>
          )}
        </>
      )}

      {rescheduleOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4">
          <div className="bg-paper rounded-[14px] shadow-2xl w-full max-w-md p-4" onClick={(e) => e.stopPropagation()}>
            <div className="font-display font-bold text-[16px] mb-2">
              {rescheduleOpen === 'earlier' ? 'Send earlier' : 'Send later'}
            </div>
            <div className="text-[12.5px] text-muted mb-3">
              Pick a new time. The sweeper will fire the drop once at (or after) this time and then clear the override.
            </div>
            {/* tier2 Aug 21 — min = now (NY-local), max = 30 days out. Prior
                input had no upper bound and a stray keystroke could schedule
                a drop into next year. */}
            <input type="datetime-local" value={rescheduleAt} onChange={(e) => setRescheduleAt(e.target.value)}
                   min={nyDateTimeLocalNow(0)}
                   max={nyDateTimeLocalNow(30 * 24 * 60 * 60_000)}
                   className="w-full border border-line rounded-[10px] px-3 py-2 text-[13.5px]" />
            <div className="text-[11px] text-muted mt-1">Time is New York (Eastern). Max 30 days ahead.</div>
            <div className="mt-3 flex items-center justify-end gap-2">
              <button onClick={() => setRescheduleOpen(null)}
                      className="text-[12.5px] font-bold border border-line px-3 py-2 rounded-[10px] haptic hover:bg-cream">
                Cancel
              </button>
              <Button onClick={() => {
                if (!rescheduleAt) return;
                // tier2 Aug 21 — parse the picker value as NY wall time
                // rather than browser-local; see nyLocalInputToISO comment.
                const iso = nyLocalInputToISO(rescheduleAt);
                rescheduleMut.mutate(iso);
              }} loading={rescheduleMut.isPending}>
                Reschedule
              </Button>
            </div>
          </div>
        </div>
      )}

      {previewOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4" onClick={() => setPreviewOpen(null)}>
          <div className="bg-paper rounded-[14px] shadow-2xl w-full max-w-lg p-4" onClick={(e) => e.stopPropagation()}>
            <div className="font-display font-bold text-[16px] mb-2">Preview — dry run</div>
            <div className="text-[12px] text-muted mb-2">
              Would go to <b>{previewOpen.recipients ?? 0}</b> driver{previewOpen.recipients === 1 ? '' : 's'} in the Default text group. No SMS sent.
            </div>
            <pre className="whitespace-pre-wrap text-[12.5px] text-ink bg-cream border border-line rounded-[10px] px-3 py-3 max-h-[50vh] overflow-auto font-mono">{previewOpen.body}</pre>
            <div className="mt-3 flex items-center justify-end">
              <Button onClick={() => setPreviewOpen(null)}>Close</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * tier1-abcSN Aug 21 — upper hour bound (exclusive) for a drop that fires at
 * `fireHour`. The drop covers pickups from fireHour:00 up to (but NOT
 * including) the next scheduled drop hour that day. The final drop of the
 * day covers everything through 23:59 (returned as 24). Keeps the FE panel
 * honest even if the backend ever slips and returns a pickup past the
 * boundary — mirrors the same bound the backend sweeper uses.
 */
function windowUntilForFireHour(fireHour: number, allDropHours: number[]): number {
  const sorted = Array.from(new Set(allDropHours.filter((h) => Number.isInteger(h) && h >= 0 && h <= 23)))
    .sort((a, b) => a - b);
  const idx = sorted.indexOf(fireHour);
  if (idx === -1) return 24;
  if (idx === sorted.length - 1) return 24; // last drop covers till end of day
  return sorted[idx + 1];
}

/** "HH:MM" or "HH:MM:SS" → hour int; null-safe. */
function hourOfPickupTime(t: string | null | undefined): number | null {
  if (!t) return null;
  const first = String(t).split(':')[0];
  const h = Number(first);
  return Number.isFinite(h) ? h : null;
}

/**
 * abc890 (Aug 20) — one "Later today" bucket in UpcomingSmsPanel.
 * Collapsed by default (name + count); click to expand the pickup list.
 * tier1-abcSN Aug 21 — defensively filter group.pickups to only those whose
 * scheduled hour actually falls in [dropHour, windowUntilForFireHour).
 * Backend abc890 already does this, but if it ever drifts we refuse to
 * mis-label a pickup as "queued for this drop" when it belongs to the next.
 */
function LaterDropSection({ group, allDropHours }: { group: LaterTodayGroup; allDropHours: number[] }) {
  const [open, setOpen] = useState(false);
  const filteredPickups = (() => {
    if (group.dropHour == null) return group.pickups;
    const upper = windowUntilForFireHour(group.dropHour, allDropHours);
    return group.pickups.filter((p) => {
      const h = hourOfPickupTime(p.time);
      if (h == null) return true; // unknown time — trust backend rather than drop it
      return h >= group.dropHour! && h < upper;
    });
  })();
  const count = filteredPickups.length;
  const isEmpty = count === 0;
  const label = `${group.dropLabel} (${count} trip${count === 1 ? '' : 's'})`;
  return (
    <div>
      <button onClick={() => !isEmpty && setOpen((v) => !v)}
              disabled={isEmpty}
              className={cx('w-full text-left px-4 py-2.5 flex items-center gap-2 haptic',
                            isEmpty ? 'cursor-default opacity-70' : 'hover:bg-cream/50')}>
        <span className={cx('inline-block w-4 text-center text-muted text-[11px]', isEmpty && 'invisible')}>
          {open ? '▾' : '▸'}
        </span>
        <span className="font-bold text-[13px] text-ink">{label}</span>
        {isEmpty && <span className="text-[11.5px] text-muted ml-1">— nothing queued</span>}
      </button>
      {open && !isEmpty && (
        <div className="divide-y divide-line border-t border-line/60 bg-cream/30">
          {filteredPickups.map((p) => (
            <div key={p.id} className="px-6 py-2 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="font-display font-bold text-[13px] text-ink truncate">
                  {p.supplier_name ?? p.donor_name ?? '(no donor)'}
                </div>
                <div className="text-[11.5px] text-muted truncate">{p.address ?? '(no address)'}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-[12px] font-bold text-forest">{p.time ? fmtTime(p.time) : '—'}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * abc890 (Aug 20) — "⚙ Drop schedule" settings section.
 * Reads/writes the configurable NY-local drop hours (persisted in
 * zlz.portal_settings.scheduled_drop_hours). Sweeper re-reads on every tick,
 * so a save takes effect within ~5 minutes without a redeploy.
 */
function DropScheduleSettings() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string>('');
  const [flash, setFlash] = useState<{ tone: 'ok' | 'err'; msg: string } | null>(null);

  const q = useQuery({
    queryKey: ['drop-schedule'],
    queryFn: () => dropSchedule.get(),
    // Only pull the schedule when the user opens the section — cheap either
    // way, but keeps the network chatter honest.
    enabled: open,
  });

  useEffect(() => {
    if (q.data?.data?.hours) setDraft(q.data.data.hours.join(', '));
  }, [q.data]);

  const save = useMutation({
    mutationFn: (hours: number[]) => dropSchedule.put(hours),
    onSuccess: (res) => {
      setFlash({ tone: 'ok', msg: `Saved — new drop schedule: ${res.data.hours.map(hourLabelNY).join(', ')}` });
      qc.invalidateQueries({ queryKey: ['drop-schedule'] });
      qc.invalidateQueries({ queryKey: ['upcoming-drop'] });
    },
    onError: (e: Error) => setFlash({ tone: 'err', msg: e.message }),
  });

  function hourLabelNY(hh: number): string {
    const suffix = hh >= 12 ? 'PM' : 'AM';
    const h12 = hh % 12 === 0 ? 12 : hh % 12;
    return `${h12} ${suffix}`;
  }

  function onSave() {
    const parsed = draft
      .split(',')
      .map((s) => Number(String(s).trim()))
      .filter((n) => Number.isInteger(n) && n >= 0 && n <= 23);
    const uniq = Array.from(new Set(parsed)).sort((a, b) => a - b);
    if (uniq.length === 0) {
      setFlash({ tone: 'err', msg: 'Enter at least one valid hour (0-23), comma-separated.' });
      return;
    }
    save.mutate(uniq);
  }

  const currentHours = q.data?.data?.hours ?? [];

  return (
    <div className="rounded-[14px] border border-line bg-paper">
      <button onClick={() => setOpen((v) => !v)}
              className="w-full text-left px-4 py-2.5 flex items-center gap-2 hover:bg-cream/50 haptic">
        <span className="w-4 text-center text-muted text-[11px]">{open ? '▾' : '▸'}</span>
        <span className="font-display font-bold text-[14px] text-ink">Drop schedule</span>
        <span className="text-[11.5px] text-muted">— when the automatic broadcasts fire</span>
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 space-y-3 border-t border-line/60">
          {q.isLoading && <div className="text-[12px] text-muted">Loading current schedule…</div>}
          {!q.isLoading && (
            <>
              <div className="text-[12.5px] text-muted">
                Current schedule fires at <b className="text-ink">
                  {currentHours.length > 0 ? currentHours.map(hourLabelNY).join(', ') : '—'}
                </b> NY-local.
              </div>
              <label className="block">
                <div className="text-[11.5px] font-bold text-ink mb-1">
                  Hours (0-23, comma-separated, NY-local)
                </div>
                <input type="text"
                       value={draft}
                       onChange={(e) => setDraft(e.target.value)}
                       placeholder="9, 13, 17, 21"
                       className="w-full border border-line rounded-[10px] px-3 py-2 text-[13.5px] font-mono" />
                <div className="text-[11px] text-muted mt-1">
                  Example: <code>9, 13, 17, 21</code> = 9 AM, 1 PM, 5 PM, 9 PM. Saved values are deduped and sorted.
                  Off-cycle top-of-hour drops still fire when a truly-new open pickup is waiting.
                </div>
              </label>
              <div className="flex items-center gap-2">
                <Button onClick={onSave} loading={save.isPending}>Save schedule</Button>
                <button onClick={() => setDraft(currentHours.join(', '))}
                        className="text-[12px] font-bold border border-line text-ink rounded-[10px] px-3 py-2 haptic hover:bg-cream">
                  Reset
                </button>
              </div>
              {flash && (
                <div className={cx('rounded-[8px] px-3 py-2 text-[12.5px] font-semibold',
                                    flash.tone === 'ok' ? 'bg-sage border border-sage-line text-forest-deep' : 'bg-clay-soft border border-clay/30 text-clay')}>
                  {flash.msg}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * §5 — Office SMS composer. Two clearly-distinguished modes via a colored
 * ribbon so office staff can never accidentally cross the streams between a
 * pickup dispatch SMS (with reply codes) and a general-purpose one.
 *
 * "Pickup SMS" tab has a one-tap "Send all open pickups for today" button
 * (§2.5). "Other SMS" is a plain textarea + recipient picker.
 */
export function SmsComposerPanel() {
  const [mode, setMode] = useState<'pickup' | 'other' | 'store'>('pickup');
  const [storeIds, setStoreIds] = useState<Set<number>>(new Set());
  const [body, setBody] = useState('');
  const [recipientMode, setRecipientMode] = useState<'all' | 'specific'>('all');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [flash, setFlash] = useState<{ tone: 'ok' | 'err'; msg: string } | null>(null);
  const [q, setQ] = useState('');
  const [confirmingSend, setConfirmingSend] = useState<null | {
    kind: 'broadcast' | 'send-all-open' | 'schedule';
    recipients: number; body: string; sendAt?: string;
  }>(null);
  // §5.2: templates + scheduled sends.
  const [templateId, setTemplateId] = useState<number | ''>('');
  const [scheduleAt, setScheduleAt] = useState<string>(''); // local datetime-input value (yyyy-MM-ddTHH:mm)
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const qc = useQueryClient();

  // tier2 Aug 21 — the composer needs the FULL roster to broadcast to. The
  // shared 'admin-volunteers'/'admin-suppliers' queries elsewhere in the
  // portal cap at 500 (fine for edit modals); the composer silently dropped
  // anyone past 500. Fetch under a distinct queryKey so raising the cap
  // doesn't force every other panel to lug 2000 rows too.
  const volunteers = useQuery({
    queryKey: ['admin-volunteers-composer'],
    queryFn:  () => api<{ data: any[] }>('/api/volunteers?limit=2000'),
  });
  const suppliers = useQuery({
    queryKey: ['admin-suppliers-composer'],
    queryFn:  () => api<{ data: any[] }>('/api/suppliers?limit=2000&logo=url'),
    enabled:  mode === 'store',
  });
  const templates = useQuery({
    queryKey: ['sms-templates'],
    queryFn:  () => broadcast.listTemplates(),
  });
  const scheduled = useQuery({
    queryKey: ['sms-scheduled'],
    queryFn:  () => broadcast.listScheduled(),
    refetchInterval: 30_000,
  });

  const eligible = useMemo(() => (volunteers.data?.data ?? [])
    .filter((v: any) => !v.deletedAt && v.status !== 'inactive'), [volunteers.data]);
  const filtered = useMemo(() => {
    if (!q.trim()) return eligible;
    const hay = q.trim().toLowerCase();
    return eligible.filter((v: any) => `${v.firstName} ${v.lastName} ${v.phonePrimary ?? ''} ${v.locationArea ?? ''}`.toLowerCase().includes(hay));
  }, [eligible, q]);
  const recipientCount = recipientMode === 'all' ? eligible.length : selected.size;

  const broadcastMut = useMutation({
    mutationFn: () => broadcast.smsBroadcast({
      body: body.trim(),
      volunteerIds: recipientMode === 'specific' ? Array.from(selected) : undefined,
    }),
    onSuccess: (res: any) => {
      // Oct 14 client: a long send finishes in the background (texts go out one person at a time).
      setFlash({ tone: 'ok', msg: res?.data?.background ? String(res.data.note ?? 'Still sending.') : `Sent to ${res?.data?.sent ?? '?'} · ${res?.data?.failed ? `${res.data.failed} failed` : 'all delivered'}` });
      setBody(''); setConfirmingSend(null);
    },
    onError: (e: Error) => { setFlash({ tone: 'err', msg: e.message }); setConfirmingSend(null); },
  });
  const scheduleMut = useMutation({
    mutationFn: () => broadcast.scheduleSms({
      body: body.trim(),
      messageType: (mode === 'store' ? 'other' : mode) as 'pickup' | 'other',
      volunteerIds: recipientMode === 'specific' ? Array.from(selected) : undefined,
      // tier2 Aug 21 — was `new Date(scheduleAt).toISOString()`, which parsed
      // the picker value as browser-local. Coordinators dialing in from a
      // non-NY laptop would schedule drops offset by their tz delta from ET.
      // Force NY-local semantics via nyLocalInputToISO.
      sendAt: nyLocalInputToISO(scheduleAt),
    }),
    onSuccess: () => {
      setFlash({ tone: 'ok', msg: `Scheduled for ${fmtDateTimeEastern(nyLocalInputToISO(scheduleAt))}` });
      setBody(''); setScheduleAt(''); setConfirmingSend(null);
      qc.invalidateQueries({ queryKey: ['sms-scheduled'] });
    },
    onError: (e: Error) => { setFlash({ tone: 'err', msg: e.message }); setConfirmingSend(null); },
  });
  const saveTemplateMut = useMutation({
    mutationFn: () => broadcast.createTemplate({
      name: templateName.trim(), body: body.trim(),
      messageType: (mode === 'store' ? 'other' : mode) as 'pickup' | 'other',
    }),
    onSuccess: () => {
      setFlash({ tone: 'ok', msg: `Template "${templateName}" saved` });
      setSaveTemplateOpen(false); setTemplateName('');
      qc.invalidateQueries({ queryKey: ['sms-templates'] });
    },
    onError: (e: Error) => setFlash({ tone: 'err', msg: e.message }),
  });
  const cancelScheduledMut = useMutation({
    mutationFn: (id: number) => broadcast.cancelScheduled(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sms-scheduled'] }); },
  });
  // Oct 23 client: "Send now" late at night (10 PM – 8 AM) asks first: send anyway, or schedule it.
  const nightGroup = useNightSend({
    send: () => broadcastMut.mutateAsync(),
    schedule: (iso: string) => broadcast.scheduleSms({
      body: body.trim(), messageType: (mode === 'store' ? 'other' : mode) as 'pickup' | 'other',
      volunteerIds: recipientMode === 'specific' ? Array.from(selected) : undefined, sendAt: iso,
    }),
    onScheduled: (label) => { setFlash({ tone: 'ok', msg: `Scheduled for ${label}` }); setBody(''); setConfirmingSend(null); qc.invalidateQueries({ queryKey: ['sms-scheduled'] }); },
    onError: () => { /* broadcastMut shows it */ },
    localCheck: true,
  });
  const nightStore = useNightSend({ send: () => storeBroadcastMut.mutateAsync(), onError: () => { /* storeBroadcastMut shows it */ }, localCheck: true });
  const storeBroadcastMut = useMutation({
    mutationFn: () => broadcast.storeBroadcast({
      body: body.trim(), supplierIds: Array.from(storeIds),
    }),
    onSuccess: (res: any) => {
      setFlash({ tone: 'ok', msg: res?.data?.background ? String(res.data.note ?? 'Sending now.') : `Sent to ${res?.data?.sent ?? '?'} store${res?.data?.sent === 1 ? '' : 's'}` }); // Oct 20 client
      setBody(''); setStoreIds(new Set()); setConfirmingSend(null);
    },
    onError: (e: Error) => { setFlash({ tone: 'err', msg: e.message }); setConfirmingSend(null); },
  });

  // When template picked, drop its body into the composer.
  useEffect(() => {
    if (templateId === '') return;
    const t = (templates.data?.data ?? []).find((x: any) => x.id === Number(templateId));
    if (t) { setBody(t.body); setMode(t.message_type); }
  }, [templateId, templates.data]);
  const sendAllOpenMut = useMutation({
    mutationFn: () => broadcast.sendAllOpen({
      volunteerIds: recipientMode === 'specific' ? Array.from(selected) : undefined,
    }),
    onSuccess: (res: any) => {
      const d = res?.data;
      setFlash({ tone: 'ok', msg: d?.note ? d.note : `${d?.openPickups} pickup${d?.openPickups === 1 ? '' : 's'} broadcast to ${d?.sent} driver${d?.sent === 1 ? '' : 's'}` });
      setConfirmingSend(null);
    },
    onError: (e: Error) => { setFlash({ tone: 'err', msg: e.message }); setConfirmingSend(null); },
  });

  function toggle(id: number) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  }

  const ribbon = mode === 'pickup'
    ? { bg: 'bg-forest text-paper', label: 'Pickup SMS', sub: 'Part of the volunteer-dispatch flow. Reply-with-code parses back to a pickup.' }
    : mode === 'store'
      ? { bg: 'bg-sky text-paper',    label: 'Store SMS',  sub: 'Message to the supplier/store\'s contact phone. Replies land in SMS Threads.' }
      : { bg: 'bg-clay text-paper',   label: 'Other SMS',  sub: 'General office SMS. Replies land in SMS Threads, no pickup wiring.' };

  return (
    <div className={cx('space-y-3 rounded-[14px] overflow-hidden border',
                       mode === 'pickup' ? 'border-forest/40 bg-sage/20'
                     : mode === 'store'  ? 'border-sky/40 bg-sky-soft/40'
                     :                     'border-clay/40 bg-clay-soft/40')}>
      {/* Message-type ribbon */}
      <div className={cx('px-4 py-2', ribbon.bg)}>
        <div className="text-[13px] font-extrabold">{ribbon.label}</div>
        <div className="text-[11.5px] opacity-90">{ribbon.sub}</div>
      </div>

      {/* Mode segmenter */}
      <div className="flex gap-1.5 px-3">
        {(['pickup', 'store', 'other'] as const).map((m) => (
          <button key={m} onClick={() => setMode(m)}
                  className={cx('haptic text-[12.5px] font-bold px-3 py-1.5 rounded-full border-2',
                                m === mode
                                  ? m === 'pickup' ? 'bg-forest text-paper border-forest'
                                  : m === 'store'  ? 'bg-sky text-paper border-sky'
                                  :                  'bg-clay text-paper border-clay'
                                  : 'bg-paper text-ink border-line hover:brightness-95')}>
            {m === 'pickup' ? 'Pickup SMS' : m === 'store' ? 'Store SMS' : 'Other SMS'}
          </button>
        ))}
      </div>

      {/* Recipients (Volunteer picker for pickup/other; Supplier picker for store) */}
      {mode === 'store' ? (
        <div className="px-3 space-y-2">
          <div className="text-[11px] font-extrabold uppercase tracking-[.05em] text-muted">Store recipient(s)</div>
          <div className="rounded-[10px] border border-line bg-paper max-h-[240px] overflow-y-auto">
            <input value={q} onChange={(e) => setQ(e.target.value)}
                   placeholder="Search suppliers by name, city, contact…"
                   className="w-full sticky top-0 z-10 bg-paper text-[13px] outline-none px-3 py-2 border-b border-line" />
            {(suppliers.data?.data ?? [])
              .filter((s: any) => s.contactPhone || s.contact_phone)
              // tier2 Aug 21 — don't include suppliers the office already
              // marked inactive/paused/archived; the backend silently drops
              // those from the send anyway, so the composer was showing them
              // just to have them fail. `active`, `is_active`, and a
              // status !== 'inactive' cover the shapes different backend
              // revisions have used.
              .filter((s: any) => s.active !== false
                               && s.is_active !== false
                               && s.status !== 'inactive'
                               && s.status !== 'archived'
                               && !s.deletedAt && !s.deleted_at)
              .filter((s: any) => {
                if (!q.trim()) return true;
                const hay = `${s.name ?? ''} ${s.city ?? ''} ${s.contactName ?? s.contact_name ?? ''} ${s.contactPhone ?? s.contact_phone ?? ''}`.toLowerCase();
                return hay.includes(q.trim().toLowerCase());
              })
              .slice(0, 200)
              .map((s: any) => {
                const on = storeIds.has(s.id);
                return (
                  <button key={s.id} onClick={() => {
                            const next = new Set(storeIds);
                            on ? next.delete(s.id) : next.add(s.id);
                            setStoreIds(next);
                          }}
                          className={cx('w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-cream/40 border-b border-line last:border-b-0',
                                        on && 'bg-sky-soft/50')}>
                    <input type="checkbox" checked={on} readOnly className="h-4 w-4 accent-sky-deep" />
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-[13px] truncate"><Name>{s.name}</Name></div>
                      <div className="text-[11px] text-muted truncate">{(s.contactPhone ?? s.contact_phone) ? displayPhone(s.contactPhone ?? s.contact_phone) : '—'}{s.city ? ` · ${shortAddress(s.city)}` : ''}</div>
                    </div>
                  </button>
                );
              })}
          </div>
          <div className="text-[11.5px] text-muted italic">
            {storeIds.size} store{storeIds.size === 1 ? '' : 's'} selected · only stores with a contact phone appear
          </div>
        </div>
      ) : (
      <div className="px-3 space-y-2">
        <div className="text-[11px] font-extrabold uppercase tracking-[.05em] text-muted">Recipients</div>
        <div className="flex gap-1.5">
          <button onClick={() => setRecipientMode('all')}
                  className={cx('haptic text-[12px] font-bold px-3 py-1 rounded-full border',
                                recipientMode === 'all' ? 'bg-forest text-paper border-forest' : 'bg-paper text-ink border-line')}>
            All opted-in drivers ({eligible.length})
          </button>
          <button onClick={() => setRecipientMode('specific')}
                  className={cx('haptic text-[12px] font-bold px-3 py-1 rounded-full border',
                                recipientMode === 'specific' ? 'bg-forest text-paper border-forest' : 'bg-paper text-ink border-line')}>
            Pick individuals ({selected.size})
          </button>
        </div>
        {recipientMode === 'specific' && (
          <div className="rounded-[10px] border border-line bg-paper max-h-[220px] overflow-y-auto">
            <input value={q} onChange={(e) => setQ(e.target.value)}
                   placeholder="Search drivers by name / phone / area…"
                   className="w-full sticky top-0 z-10 bg-paper text-[13px] outline-none px-3 py-2 border-b border-line" />
            {/* tier2 Aug 21 — surface the display cap so a coordinator sees
                "narrow your search" rather than assuming the missing person
                just isn't in the system. */}
            {filtered.length > 200 && (
              <div className="px-3 py-1.5 text-[11.5px] text-muted bg-cream/60 border-b border-line italic">
                Showing first 200 of {filtered.length}. Type to narrow.
              </div>
            )}
            {filtered.slice(0, 200).map((v: any) => {
              const on = selected.has(v.id);
              return (
                <button key={v.id} onClick={() => toggle(v.id)}
                        className={cx('w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-cream/40 border-b border-line last:border-b-0',
                                      on && 'bg-sage/50')}>
                  <input type="checkbox" checked={on} readOnly className="h-4 w-4 accent-forest" />
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-[13px] truncate"><Name first={v.firstName} last={v.lastName} /></div>
                    <div className="text-[11px] text-muted truncate">{v.phonePrimary ? displayPhone(v.phonePrimary) : '—'} · {v.locationArea ?? 'no area'}</div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
      )}

      {/* Composer / actions */}
      <div className="px-3 pb-3">
        {mode === 'store' ? (
          <div className="space-y-2">
            <div className="text-[11px] font-extrabold uppercase tracking-[.05em] text-muted">Message ({body.length} chars)</div>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5}
                      placeholder="Message to selected store(s)…"
                      className="w-full rounded-[10px] border border-line bg-paper px-3 py-2 text-[13.5px] outline-none focus:border-forest resize-none" />
            <button onClick={() => setConfirmingSend({ kind: 'broadcast', recipients: storeIds.size, body: body.trim() })}
                    disabled={!body.trim() || storeIds.size === 0}
                    className="w-full haptic text-[14px] font-extrabold bg-sky text-paper px-4 py-3 rounded-[10px] shadow-ctag disabled:opacity-50">
              Send to {storeIds.size} store{storeIds.size === 1 ? '' : 's'}
            </button>
          </div>
        ) : mode === 'pickup' ? (
          <div className="space-y-2">
            <div className="rounded-[10px] border border-forest/30 bg-paper p-3 text-[12.5px] text-ink">
              One-tap broadcast of every "Volunteer Needed" pickup for today, with a reply code per pickup.
              Drivers can reply <b>PICKUPS</b> anytime to re-list, or reply with a code to claim.
            </div>
            {/* tier1-abcSN Aug 21 — "up to" prefix. `recipientCount` is
                every opted-in driver, but the backend dedups anyone who
                already got today's drop / is in quiet hours / has no phone,
                so the actual send count is <= this number. Correct number
                comes back in the mutation response (see toast).
                TODO: once /api/sms/upcoming-drop returns a real
                `recipientCount`, fetch it here and drop the "up to". */}
            <button onClick={() => setConfirmingSend({ kind: 'send-all-open', recipients: recipientCount, body: '(auto-generated from today\'s open pickups)' })}
                    disabled={recipientCount === 0}
                    className="w-full haptic text-[14px] font-extrabold bg-forest text-paper px-4 py-3 rounded-[10px] shadow-ctag disabled:opacity-50">
              📨 Send all open pickups to up to {recipientCount} driver{recipientCount === 1 ? '' : 's'}
            </button>
            <div className="text-[11.5px] text-muted italic px-1">
              To message drivers about a single specific pickup, use the "SMS" button on the pickup card in Live Board or Pickups.
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Template picker */}
            <div className="flex items-center gap-2">
              <select value={templateId === '' ? '' : String(templateId)}
                      onChange={(e) => setTemplateId(e.target.value === '' ? '' : Number(e.target.value))}
                      className="flex-1 text-[12.5px] border border-line rounded-[8px] px-2 py-1.5 bg-paper">
                <option value="">— No template —</option>
                {(templates.data?.data ?? []).filter((t: any) => t.message_type === mode).map((t: any) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              {isOfficeOnly() && <button onClick={() => { setSaveTemplateOpen(true); setTemplateName(''); }}
                      disabled={!body.trim()}
                      className="haptic text-[12px] font-bold text-forest border border-forest bg-sage/40 px-3 py-1.5 rounded-[8px] disabled:opacity-50">
                Save as template…
              </button>}{/* Oct 21 client: templates = office only */}
            </div>

            <div className="text-[11px] font-extrabold uppercase tracking-[.05em] text-muted">Message ({body.length} chars)</div>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5}
                      placeholder="Type your message here…"
                      className="w-full rounded-[10px] border border-line bg-paper px-3 py-2 text-[13.5px] outline-none focus:border-forest resize-none" />

            {/* Schedule toggle */}
            <div className="flex items-center gap-2 text-[12px] flex-wrap">
              <label className="inline-flex items-center gap-1.5">
                <input type="checkbox" checked={!!scheduleAt}
                       onChange={(e) => setScheduleAt(e.target.checked ? defaultLocalPlusHour() : '')}
                       className="h-4 w-4 accent-forest" />
                <span className="font-bold">Schedule for later</span>
              </label>
              {/* tier2 Aug 21 — max = 30 days out so a stray keystroke can't
                  schedule an SMS drop into next year; min = now so we don't
                  let the coordinator pick a past instant. Times are NY. */}
              {scheduleAt && (
                <>
                  <input type="datetime-local" value={scheduleAt}
                         onChange={(e) => setScheduleAt(e.target.value)}
                         min={nyDateTimeLocalNow(0)}
                         max={nyDateTimeLocalNow(30 * 24 * 60 * 60_000)}
                         className="border border-line rounded-[8px] px-2 py-1 bg-paper text-[12px]" />
                  <span className="text-[11px] text-muted italic">NY time · max 30 days out</span>
                </>
              )}
            </div>

            <button onClick={() => setConfirmingSend(scheduleAt
                        ? { kind: 'schedule', recipients: recipientCount, body: body.trim(), sendAt: scheduleAt }
                        : { kind: 'broadcast', recipients: recipientCount, body: body.trim() })}
                    disabled={!body.trim() || recipientCount === 0
                      // tier2 Aug 21 — validate the scheduleAt as NY-local
                      // (matching how we submit it), not browser-local.
                      || (scheduleAt !== '' && Date.parse(nyLocalInputToISO(scheduleAt)) < Date.now())
                      || (scheduleAt !== '' && Date.parse(nyLocalInputToISO(scheduleAt)) > Date.now() + 30 * 24 * 60 * 60_000)}
                    className="w-full haptic text-[14px] font-extrabold bg-clay text-paper px-4 py-3 rounded-[10px] shadow-ctag disabled:opacity-50">
              {scheduleAt
                ? `Schedule for ${fmtDateTimeEastern(nyLocalInputToISO(scheduleAt))} · ${recipientCount} driver${recipientCount === 1 ? '' : 's'}`
                : `Send now to ${recipientCount} driver${recipientCount === 1 ? '' : 's'}`}
            </button>
          </div>
        )}

        {/* Pending scheduled sends */}
        {(scheduled.data?.data ?? []).length > 0 && (
          <div className="mt-3 rounded-[10px] border border-line bg-paper p-3">
            <div className="text-[11px] font-extrabold uppercase tracking-[.05em] text-muted mb-2">Scheduled for later</div>
            <div className="space-y-1.5">
              {(scheduled.data?.data ?? []).map((s: any) => (
                <OfficeScheduledRow key={s.id} s={s} onChanged={() => refreshScheduled(qc)}
                  onCancelGroup={(id) => { void uiConfirm(`Cancel the text scheduled for ${fmtDateTimeEastern(s.send_at)}?\n\nIt won't go out.`).then((ok) => { if (ok) cancelScheduledMut.mutate(id); }); }} />
              ))}
            </div>
          </div>
        )}
        {flash && (
          <div className={cx('mt-3 rounded-[10px] px-3 py-2 text-[12.5px] font-bold',
                             flash.tone === 'ok' ? 'bg-sage text-forest' : 'bg-clay-soft text-clay')}>
            {flash.msg}
          </div>
        )}
      </div>

      {/* Confirmation modal — always reprints message type + recipient count
          so cross-stream mistakes get caught before the send. */}
      {confirmingSend && (
        <Modal title={confirmingSend.kind === 'schedule' ? 'Schedule SMS?' : 'Send SMS?'} onClose={() => setConfirmingSend(null)}>
          <div className={cx('rounded-[10px] px-3 py-2 mb-3', ribbon.bg)}>
            <div className="text-[13px] font-extrabold">
              You are about to {confirmingSend.kind === 'schedule' ? 'schedule' : 'send'} an {ribbon.label}.
            </div>
            {confirmingSend.sendAt && (
              <div className="text-[11.5px] mt-0.5 opacity-90">
                {/* tier2 Aug 21 — sendAt is a NY-local datetime-local string;
                    render as NY so what the confirm modal shows matches what
                    actually goes on the wire. */}
                Delivery: {fmtDateTimeEastern(nyLocalInputToISO(confirmingSend.sendAt))} (NY)
              </div>
            )}
          </div>
          {/* tier1-abcSN Aug 21 — send-all-open dedups server-side (drivers
              who already got today's drop / in quiet hours / no phone are
              skipped) so the displayed count is an upper bound, not the
              actual number of texts that will go out. Other kinds
              (broadcast/schedule/store) send to every selected recipient. */}
          <div className="text-[13px] mb-2">
            <b>Recipients:</b>{' '}
            {confirmingSend.kind === 'send-all-open' ? 'up to ' : ''}
            {confirmingSend.recipients} driver{confirmingSend.recipients === 1 ? '' : 's'}
          </div>
          {confirmingSend.kind === 'send-all-open' && (
            <div className="text-[11.5px] text-muted italic mb-2 -mt-1">
              Actual sends may be lower — drivers already texted this drop, in quiet hours, or without a phone are skipped.
            </div>
          )}
          <pre className="text-[12px] bg-cream/60 p-3 rounded-[8px] whitespace-pre-wrap max-h-[280px] overflow-y-auto">{confirmingSend.body}</pre>
          <div className="mt-3 flex justify-end gap-2">
            <Button size="sm" variant="plain" onClick={() => setConfirmingSend(null)}>Cancel</Button>
            <Button size="sm"
                    loading={broadcastMut.isPending || sendAllOpenMut.isPending || scheduleMut.isPending || storeBroadcastMut.isPending || nightGroup.busy || nightStore.busy}
                    onClick={() => {
                      if (confirmingSend.kind === 'send-all-open') sendAllOpenMut.mutate();
                      else if (confirmingSend.kind === 'schedule') scheduleMut.mutate();
                      else if (mode === 'store') void nightStore.start();
                      else void nightGroup.start();
                    }}>
              {confirmingSend.kind === 'schedule' ? 'Confirm + schedule' : 'Confirm + send'}
            </Button>
          </div>
        </Modal>
      )}
      {nightGroup.prompt}
      {nightStore.prompt}
      {saveTemplateOpen && (
        <Modal title="Save as SMS template" onClose={() => setSaveTemplateOpen(false)}>
          <Field label="Template name" full>
            <input value={templateName} onChange={(e) => setTemplateName(e.target.value)} autoFocus
                   className={inputCls} placeholder='e.g. "Snow delay"' />
          </Field>
          <div className="text-[11.5px] text-muted mt-1">Saved under: <b>{mode === 'pickup' ? 'Pickup SMS' : 'Other SMS'}</b></div>
          <div className="mt-3 flex justify-end gap-2">
            <Button size="sm" variant="plain" onClick={() => setSaveTemplateOpen(false)}>Cancel</Button>
            <Button size="sm" loading={saveTemplateMut.isPending}
                    disabled={!templateName.trim()}
                    onClick={() => saveTemplateMut.mutate()}>
              Save template
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// tier2 Aug 21 — prefill the schedule picker with "now + 1h", but expressed
// in NY-local wall clock, matching the semantics we use when the picker's
// value flows through nyLocalInputToISO on submit. Prior implementation used
// browser-local, which made non-NY coordinators see the wrong prefill.
function defaultLocalPlusHour(): string {
  return nyDateTimeLocalNow(60 * 60 * 1000);
}

export function BroadcastPanel() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'send' | 'types'>('send');

  const typesQ = useQuery<{ data: NotificationType[] }>({
    queryKey: ['notification-types'],
    queryFn:  () => broadcast.listTypes(),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 border-b border-line pb-2">
        <TabBtn active={tab === 'send'}  onClick={() => setTab('send')}  icon={<Send size={13} />}      label="Send" />
        {isOfficeOnly() && <TabBtn active={tab === 'types'} onClick={() => setTab('types')} icon={<Megaphone size={13} />} label="Types" />}{/* Oct 21 client: notification types = office only */}
      </div>
      {tab === 'send'
        ? <SendBroadcast types={typesQ.data?.data ?? []} typesLoading={typesQ.isLoading} />
        : <TypesLibrary types={typesQ.data?.data ?? []} loading={typesQ.isLoading}
                        refetch={() => qc.invalidateQueries({ queryKey: ['notification-types'] })} />}
    </div>
  );
}

function TabBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button onClick={onClick}
            className={cx('haptic flex items-center gap-1.5 px-3 py-1.5 text-[12.5px] font-bold rounded-t-[8px]',
                          active ? 'text-forest border-b-2 border-forest bg-sage/40' : 'text-muted hover:text-ink')}>
      {icon} {label}
    </button>
  );
}

function SendBroadcast({ types, typesLoading }: { types: NotificationType[]; typesLoading: boolean }) {
  const [typeId, setTypeId] = useState<number | ''>('');
  const [title, setTitle]   = useState('');
  const [body, setBody]     = useState('');
  const [audience, setAudience] = useState<'all_drivers' | 'all_stores' | 'all_users' | 'specific_user'>('all_drivers');
  const [targetUserId, setTUI]  = useState<number | ''>('');
  const [flash, setFlash] = useState<{ tone: 'ok' | 'err'; msg: string } | null>(null);

  // When admin picks a saved type, pre-fill title/body/audience from it.
  useEffect(() => {
    if (typeId === '') return;
    const t = types.find((x) => x.id === Number(typeId));
    if (!t) return;
    setTitle(t.defaultTitle);
    setBody(t.defaultBody);
    setAudience(t.audienceType);
  }, [typeId, types]);

  const users = useQuery<{ data: any[] }>({
    queryKey: ['broadcast-user-picker'],
    // Correct endpoint is /api/admin-users (dash, not slash). The wrong path
    // returned 404 → the "Pick a user" dropdown was empty.
    queryFn:  () => api<{ data: any[] }>('/api/admin-users'),
    enabled:  audience === 'specific_user',
  });

  const send = useMutation({
    mutationFn: () => broadcast.send({
      notificationTypeId: typeId === '' ? null : Number(typeId),
      title, body, audienceType: audience,
      targetUserId: audience === 'specific_user' ? (targetUserId === '' ? null : Number(targetUserId)) : null,
    }),
    onSuccess: (res: any) => {
      setFlash({ tone: 'ok', msg: `Sent to ${res?.data?.sent ?? '?'} user${(res?.data?.sent ?? 0) === 1 ? '' : 's'}.` });
      setTitle(''); setBody(''); setTypeId('');
    },
    onError: (e: Error) => setFlash({ tone: 'err', msg: e.message }),
  });

  const disabled = !title.trim() || !body.trim() || send.isPending ||
                   (audience === 'specific_user' && !targetUserId);

  return (
    <div className="space-y-3 max-w-xl">
      <div className="rounded-[14px] border border-sage-line bg-sage/40 p-3 text-[12px] text-forest">
        <span className="font-bold">Broadcast</span> — sends a push notification to the audience below. Pick a saved type to pre-fill, or type a one-off message.
      </div>

      <Field label="Type (optional — pre-fills below)" full>
        <select value={typeId === '' ? '' : String(typeId)}
                onChange={(e) => setTypeId(e.target.value === '' ? '' : Number(e.target.value))}
                className={inputCls}>
          <option value="">— One-off message (no template) —</option>
          {typesLoading && <option disabled>Loading types…</option>}
          {types.filter((t) => t.active).map((t) => (
            <option key={t.id} value={t.id}>{t.name} · {AUDIENCE_LABEL[t.audienceType] ?? t.audienceType}</option>
          ))}
        </select>
      </Field>

      <Field label="Audience" full>
        <select value={audience} onChange={(e) => setAudience(e.target.value as any)} className={inputCls}>
          {(Object.keys(AUDIENCE_LABEL) as Array<keyof typeof AUDIENCE_LABEL>).map((k) => (
            <option key={k} value={k}>{AUDIENCE_LABEL[k]}</option>
          ))}
        </select>
      </Field>

      {audience === 'specific_user' && (
        <Field label="Recipient" full>
          <select value={targetUserId === '' ? '' : String(targetUserId)}
                  onChange={(e) => setTUI(e.target.value === '' ? '' : Number(e.target.value))}
                  className={inputCls}>
            <option value="">— Pick a user —</option>
            {(users.data?.data ?? []).map((u: any) => (
              <option key={u.id} value={u.id}>{u.first_name ?? u.firstName} {u.last_name ?? u.lastName} · {u.role}</option>
            ))}
          </select>
        </Field>
      )}

      <Field label="Title" full>
        <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls}
               placeholder="e.g. Weather alert - deliveries delayed" maxLength={200} />
      </Field>

      <Field label="Message" full>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} className={inputCls}
                  placeholder="Everything the recipient needs to know. Line breaks are OK." maxLength={2000} />
      </Field>

      {flash && (
        <div className={cx('rounded-[10px] px-3 py-2 text-[12.5px] font-bold',
                           flash.tone === 'ok' ? 'bg-sage text-forest' : 'bg-clay-soft text-clay')}>
          {flash.msg}
        </div>
      )}

      <div className="flex justify-end">
        <Button size="sm" variant="forest" icon={<Send size={13} />}
                onClick={() => { setFlash(null); send.mutate(); }} disabled={disabled}>
          {send.isPending ? 'Sending…' : 'Send now'}
        </Button>
      </div>
    </div>
  );
}

function TypesLibrary({ types, loading, refetch }: { types: NotificationType[]; loading: boolean; refetch: () => void }) {
  const [editing, setEditing] = useState<NotificationType | 'new' | null>(null);
  const del = useMutation({
    mutationFn: (id: number) => broadcast.deleteType(id),
    onSuccess: refetch,
  });
  return (
    <div className="space-y-3 max-w-3xl">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-extrabold uppercase tracking-[.05em] text-muted">
          {loading ? 'Loading…' : `${types.length} saved type${types.length === 1 ? '' : 's'}`}
        </div>
        <Button size="sm" variant="forest" icon={<Plus size={14} />} onClick={() => setEditing('new')}>New type</Button>
      </div>
      <div className="space-y-2">
        {types.map((t) => (
          <div key={t.id} className="border border-line bg-paper rounded-[14px] px-4 py-3 flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <Bell size={13} className="text-forest" />
                <div className="font-bold text-[13.5px]">{t.name}</div>
                {!t.active && <span className="text-[10px] font-bold uppercase text-muted bg-line rounded-full px-2 py-0.5">inactive</span>}
                <span className="text-[10px] font-bold uppercase text-muted bg-cream rounded-full px-2 py-0.5">
                  {AUDIENCE_LABEL[t.audienceType] ?? t.audienceType}
                </span>
              </div>
              <div className="text-[11.5px] text-muted mt-1"><b>Title:</b> {t.defaultTitle}</div>
              <div className="text-[11.5px] text-muted mt-0.5 line-clamp-2 whitespace-pre-line">{t.defaultBody}</div>
              {t.description && <div className="text-[10.5px] text-muted mt-1 italic">{t.description}</div>}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button onClick={() => setEditing(t)} title="Edit"
                      className="haptic grid h-8 w-8 place-items-center rounded-full bg-sage text-forest hover:bg-sage-line">
                <Pencil size={14} />
              </button>
              <button onClick={() => { void uiConfirm(`Delete "${t.name}"?`).then((ok) => { if (ok) { del.mutate(t.id); } }); }} title="Delete"
                      className="haptic grid h-8 w-8 place-items-center rounded-full bg-clay-soft text-clay hover:bg-clay/20">
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
        {!loading && types.length === 0 && (
          <div className="text-[13px] text-muted italic p-4 text-center border border-dashed border-line rounded-[14px]">
            No saved types yet. Click "New type" to add your first template.
          </div>
        )}
      </div>
      {editing && (
        <TypeEditor row={editing === 'new' ? null : editing}
                    onDone={() => { setEditing(null); refetch(); }}
                    onCancel={() => setEditing(null)} />
      )}
    </div>
  );
}

function TypeEditor({ row, onDone, onCancel }: { row: NotificationType | null; onDone: () => void; onCancel: () => void }) {
  const [name, setName] = useState(row?.name ?? '');
  const [description, setDescription] = useState(row?.description ?? '');
  const [defaultTitle, setTitle] = useState(row?.defaultTitle ?? '');
  const [defaultBody, setBody]   = useState(row?.defaultBody ?? '');
  const [audienceType, setAudience] = useState<NotificationType['audienceType']>(row?.audienceType ?? 'all_drivers');
  const [active, setActive] = useState(row?.active ?? true);

  const save = useMutation({
    mutationFn: () => row
      ? broadcast.updateType(row.id, { name, description, defaultTitle, defaultBody, audienceType, active })
      : broadcast.createType({ name, description, defaultTitle, defaultBody, audienceType, active }),
    onSuccess: onDone,
  });

  return (
    <Modal title={row ? `Edit "${row.name}"` : 'New notification type'} onClose={onCancel}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Name" full>
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls}
                 placeholder="e.g. Weather alert" maxLength={120} />
        </Field>
        <Field label="Short description" full>
          <input value={description ?? ''} onChange={(e) => setDescription(e.target.value)} className={inputCls}
                 placeholder="What this type is for (internal note)" maxLength={500} />
        </Field>
        <Field label="Default audience" full>
          <select value={audienceType} onChange={(e) => setAudience(e.target.value as any)} className={inputCls}>
            {(Object.keys(AUDIENCE_LABEL) as Array<keyof typeof AUDIENCE_LABEL>).map((k) => (
              <option key={k} value={k}>{AUDIENCE_LABEL[k]}</option>
            ))}
          </select>
        </Field>
        <Field label="Default title" full>
          <input value={defaultTitle} onChange={(e) => setTitle(e.target.value)} className={inputCls}
                 placeholder="Weather alert - deliveries delayed" maxLength={200} />
        </Field>
        <Field label="Default message" full>
          <textarea value={defaultBody} onChange={(e) => setBody(e.target.value)} rows={4} className={inputCls}
                    placeholder="Longer body - the coordinator can still edit before sending." maxLength={2000} />
        </Field>
        <label className="flex items-center gap-2 text-[13px] col-span-2">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="accent-forest h-4 w-4" />
          Active - shows up in the Send picker
        </label>
      </div>
      {save.error && <p className="text-clay text-[12px] mt-3">{(save.error as Error).message}</p>}
      <div className="flex items-center justify-end gap-2 mt-4">
        <Button size="sm" variant="plain" onClick={onCancel}>Cancel</Button>
        <Button size="sm" variant="forest" icon={<Check size={13} />}
                onClick={() => save.mutate()}
                disabled={!name.trim() || !defaultTitle.trim() || !defaultBody.trim() || save.isPending}>
          {save.isPending ? 'Saving…' : (row ? 'Save changes' : 'Create type')}
        </Button>
      </div>
    </Modal>
  );
}

// ============================================================================
// SMS Broadcast Groups — client Aug 3: "How do I access whose in the automatic
// SMS groups? I want to choose volunteers especially for testing."
// ============================================================================
export function SmsGroupsPanel() {
  const qc = useQueryClient();
  const groupsQ = useQuery({ queryKey: ['sms-groups'], queryFn: () => volunteerGroups.list() });
  const volsQ   = useQuery({ queryKey: ['admin-volunteers'], queryFn: () => api<{ data: any[] }>('/api/volunteers') });
  // Aug 29 (WA parity): pseudo-group entry for "WhatsApp opt-ins" — pulls
  // its member list from the WA admin status endpoint so the office can see
  // WA-channel members in the same panel where they view SMS groups.
  const waStatusQ = useQuery({ queryKey: ['wa-admin-status'], queryFn: () => whatsappAdmin.status(), refetchInterval: 60_000 });
  const [openId, setOpenId] = useState<number | null | 'whatsapp'>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDefault, setNewDefault] = useState(false);

  const createM = useMutation({
    mutationFn: () => volunteerGroups.create({ name: newName.trim(), isDefaultBroadcast: newDefault }),
    onSuccess: (r) => { setCreating(false); setNewName(''); setNewDefault(false); setOpenId(Number(r.data.id)); qc.invalidateQueries({ queryKey: ['sms-groups'] }); },
  });
  const groups = groupsQ.data?.data ?? [];
  // Oct 2 client fix: page search.
  const [gq, setGq] = useState('');
  const open = typeof openId === 'number' ? groups.find((g) => Number(g.id) === openId) : null;
  const waVols = waStatusQ.data?.data?.volunteers ?? [];
  const waSups = waStatusQ.data?.data?.suppliers ?? [];
  const waCount = waVols.length + waSups.length;

  return (
    <div className="space-y-3">
      {isOfficeOnly() && <MessageTemplatesCard />}{/* Oct 21 client: message templates = office only */}
      <div className="flex items-center justify-between">
        <div>
          <div className="font-display font-semibold text-[16px]">Text groups</div>
          <div className="text-[12px] text-muted">Choose which drivers get the auto-SMS when a new pickup is created. The <em>Default text group</em> is used when a pickup is saved with "Auto-notify" on but no group selected.</div>
        </div>
        {isOfficeOnly() && <Button size="sm" variant="forest" icon={<Plus size={13} />} onClick={() => setCreating(true)}>New group</Button>}
      </div>

      {creating && (
        <div className="rounded-[12px] border border-line bg-cream/50 p-3 flex items-end gap-2">
          <label className="flex-1 text-[12px] font-bold text-muted">Name
            <input value={newName} onChange={(e) => setNewName(e.target.value)}
                   className="w-full mt-1 rounded-[8px] border border-line bg-paper px-2 py-1 text-[13px]" />
          </label>
          <label className="flex items-center gap-1.5 text-[12.5px] pb-1.5">
            <input type="checkbox" checked={newDefault} onChange={(e) => setNewDefault(e.target.checked)} />
            <span>Default text group</span>
          </label>
          <Button size="sm" variant="forest" onClick={() => createM.mutate()} disabled={!newName.trim() || createM.isPending}>
            {createM.isPending ? 'Creating…' : 'Create'}
          </Button>
          <Button size="sm" variant="plain" onClick={() => setCreating(false)}>Cancel</Button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-3">
        <div className="rounded-[14px] border border-line bg-paper divide-y divide-line/70 overflow-hidden">
          {/* Aug 29 (WA parity): virtual "WhatsApp" group. Membership is
              anyone whose contact_channel is whatsapp/both — driven by the
              volunteer/supplier record, not a manual group roster. */}
          <button onClick={() => setOpenId('whatsapp')}
                  className={cx('w-full text-left px-3 py-2.5',
                    openId === 'whatsapp' ? 'bg-sky/20' : 'hover:bg-cream/50')}>
            <div className="flex items-center justify-between gap-2">
              <div className="font-bold text-[13px] truncate">WhatsApp</div>
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-sky-deep bg-sky/20 px-1.5 py-0.5 rounded">Channel</span>
            </div>
            <div className="text-[11.5px] text-muted mt-0.5">{waCount} opted-in contact{waCount === 1 ? '' : 's'}</div>
          </button>
          <div className="p-2"><SearchBar value={gq} onChange={setGq} placeholder="Search groups…" /></div>
          {groups.length === 0 && <div className="p-4 text-[12.5px] text-muted italic">No SMS groups yet.</div>}
          {groups.filter((g) => !gq.trim() || JSON.stringify(g).toLowerCase().includes(gq.trim().toLowerCase())).map((g) => (
            <button key={g.id} onClick={() => setOpenId(Number(g.id))}
                    className={cx('w-full text-left px-3 py-2.5', openId === Number(g.id) ? 'bg-sage/40' : 'hover:bg-cream/50')}>
              <div className="flex items-center justify-between gap-2">
                <div className="font-bold text-[13px] truncate">{g.name}</div>
                {g.is_default_broadcast && <span className="text-[10px] font-extrabold uppercase tracking-wider text-forest bg-sage/70 px-1.5 py-0.5 rounded">Default</span>}
              </div>
              <div className="text-[11.5px] text-muted mt-0.5">{g.member_count} member{g.member_count === 1 ? '' : 's'}</div>
            </button>
          ))}
        </div>
        <div className="rounded-[14px] border border-line bg-paper p-3 min-h-[240px]">
          {openId === 'whatsapp' ? (
            <WhatsappMembersDetail volunteers={waVols} suppliers={waSups} loading={waStatusQ.isLoading} />
          ) : !open ? (
            <div className="text-[12.5px] text-muted italic h-full flex items-center justify-center">Pick a group on the left to view + edit its members.</div>
          ) : (
            <SmsGroupDetail groupId={Number(open.id)} groupName={open.name} isDefault={open.is_default_broadcast}
                            allVolunteers={volsQ.data?.data ?? []}
                            onDone={() => { setOpenId(null); qc.invalidateQueries({ queryKey: ['sms-groups'] }); }} />
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Aug 29 (WA parity): detail view for the virtual "WhatsApp" group inside
 * SmsGroupsPanel. Add-new (Aug 30) flips a volunteer or supplier's
 * contact_channel to WhatsApp and auto-fires the welcome template.
 */
function WhatsappMembersDetail({ volunteers, suppliers, loading }: {
  volunteers: any[]; suppliers: any[]; loading: boolean;
}) {
  const qc = useQueryClient();
  const fmt = (iso: string | null | undefined) => iso ? fmtDateTimeEastern(iso) : '—';
  const total = volunteers.length + suppliers.length;
  const [addOpen, setAddOpen] = useState(false);
  const [pickKind, setPickKind] = useState<'volunteer' | 'supplier'>('volunteer');
  const [pickQuery, setPickQuery] = useState('');
  // Aug 31: "Also keep SMS" — volunteer-only. Sets contact_channel=both so
  // admin/dispatcher/staff can receive on WhatsApp AND text at the same time
  // (useful for testing before rollout).
  const [addBoth, setAddBoth] = useState(false);
  // Sep 15 client: do NOT auto-send welcome unless the office ticks this.
  const [sendWelcome, setSendWelcome] = useState(false);
  const allVolsQ = useQuery({ queryKey: ['admin-volunteers'], queryFn: () => api<{ data: any[] }>('/api/volunteers'), enabled: addOpen });
  const allSupsQ = useQuery({ queryKey: ['admin-suppliers'], queryFn: () => api<{ data: any[] }>('/api/suppliers?limit=500&logo=url'), enabled: addOpen });
  // Sep 14: with wa-bridge (no Meta Cloud consent enforcement), a contact
  // can be re-added at any time — bridge just re-sends the welcome. Keeping
  // the sets around for a subtle "(already listed)" hint but no longer
  // filtering them out of the picker.
  const existingVolIds = new Set(volunteers.map((v) => Number(v.id)));
  const existingSupIds = new Set(suppliers.map((s) => Number(s.id)));

  const addM = useMutation({
    mutationFn: (body: { kind: 'volunteer' | 'supplier'; id: number; both?: boolean; sendWelcome?: boolean }) => whatsappAdmin.addMember(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wa-admin-status'] });
      qc.invalidateQueries({ queryKey: ['admin-volunteers'] });
      qc.invalidateQueries({ queryKey: ['admin-suppliers'] });
    },
  });
  const removeM = useMutation({
    mutationFn: (body: { kind: 'volunteer' | 'supplier'; id: number }) => whatsappAdmin.removeMember(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wa-admin-status'] }),
  });
  const resetPendingM = useMutation({
    mutationFn: (body: { kind: 'volunteer' | 'supplier'; id: number }) => whatsappAdmin.resetPending(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wa-admin-status'] }),
  });

  const eligibleForBoth = (role: string | null | undefined) => {
    const r = String(role ?? '').toLowerCase();
    return r === 'admin' || r === 'dispatcher' || r === 'coordinator' || r === 'staff';
  };
  type PickRow = { id: number; label: string; sublabel: string; kind: 'volunteer' | 'supplier'; role: string | null };
  const searchable = ((): PickRow[] => {
    const q = pickQuery.trim().toLowerCase();
    if (pickKind === 'volunteer') {
      return (allVolsQ.data?.data ?? [])
        .filter((v: any) => !q || `${v.firstName ?? ''} ${v.lastName ?? ''} ${v.phonePrimary ?? ''}`.toLowerCase().includes(q))
        .slice(0, 25)
        .map((v: any) => ({
          id: Number(v.id),
          label: `${v.firstName ?? ''} ${v.lastName ?? ''}`.trim(),
          sublabel: [v.phonePrimary ? displayPhone(v.phonePrimary) : '—', v.role ? `role: ${v.role}` : null, existingVolIds.has(Number(v.id)) ? 'already listed — click to re-add' : null].filter(Boolean).join(' · '),
          kind: 'volunteer' as const,
          role: v.role ?? null,
        }));
    }
    return (allSupsQ.data?.data ?? [])
      .filter((s: any) => !q || `${s.name ?? ''} ${s.contactName ?? ''} ${s.contactPhone ?? ''}`.toLowerCase().includes(q))
      .slice(0, 25)
      .map((s: any) => ({ id: Number(s.id), label: s.name ?? '(no name)', sublabel: [s.contactPhone ? displayPhone(s.contactPhone) : '—', existingSupIds.has(Number(s.id)) ? 'already listed — click to re-add' : null].filter(Boolean).join(' · '), kind: 'supplier' as const, role: null }));
  })();

  if (loading) return <div className="text-[12.5px] text-muted italic">Loading…</div>;
  return (
    <div className="space-y-3">
      <div className="flex items-baseline gap-2">
        <div className="font-display font-semibold text-[16px]">WhatsApp opt-ins</div>
        <div className="text-[12px] text-muted">{total} contact{total === 1 ? '' : 's'}</div>
        <div className="ml-auto">
          <Button size="sm" variant="forest" icon={<Plus size={13} />} onClick={() => setAddOpen((v) => !v)}>
            {addOpen ? 'Cancel' : 'Add new'}
          </Button>
        </div>
      </div>
      <div className="text-[11.5px] text-muted italic">
        Adding a contact here flips their channel to WhatsApp and sends the welcome opt-in message. They must tap Yes to receive further messages.
      </div>

      {addOpen && (
        <div className="rounded-[12px] border border-line bg-cream/40 p-3 space-y-2">
          <div className="flex items-center gap-2">
            {(['volunteer', 'supplier'] as const).map((k) => (
              <button key={k} type="button" onClick={() => setPickKind(k)}
                      className={cx('rounded-[8px] px-3 py-1 text-[12.5px] font-bold border',
                        pickKind === k ? 'bg-forest text-paper border-forest' : 'bg-paper text-ink border-line hover:border-forest')}>
                {k === 'volunteer' ? 'Volunteer' : 'Supplier'}
              </button>
            ))}
            <input value={pickQuery} onChange={(e) => setPickQuery(e.target.value)}
                   placeholder={`Search ${pickKind}s by name or phone…`}
                   className="flex-1 border border-line rounded-[8px] px-2 py-1 text-[13px] bg-paper" />
          </div>
          {pickKind === 'volunteer' && (
            <label className="flex items-center gap-2 text-[12px] font-bold text-ink cursor-pointer">
              <input type="checkbox" checked={addBoth} onChange={(e) => setAddBoth(e.target.checked)} />
              Also keep SMS on <span className="font-normal text-muted">— receive on WhatsApp <em>and</em> text (use for admin/dispatcher, or to A/B test yourself before rollout)</span>
            </label>
          )}
          <label className="flex items-center gap-2 text-[12px] font-bold text-clay cursor-pointer">
            <input type="checkbox" checked={sendWelcome} onChange={(e) => setSendWelcome(e.target.checked)} />
            Send welcome opt-in message on add <span className="font-normal text-muted">— off by default; tick only when you want the contact to receive the Yes/No template.</span>
          </label>
          <div className="rounded-[8px] border border-line bg-paper max-h-[240px] overflow-auto divide-y divide-line/60">
            {searchable.length === 0 && (
              <div className="p-3 text-[12px] text-muted italic">No matches for your search.</div>
            )}
            {searchable.map((row) => {
              const wantsBoth = addBoth && row.kind === 'volunteer';
              const canBoth = row.kind === 'volunteer' && eligibleForBoth(row.role);
              const bothBlocked = wantsBoth && !canBoth;
              return (
                <button key={row.id}
                        onClick={() => addM.mutate({ kind: row.kind, id: row.id, both: wantsBoth && canBoth, sendWelcome })}
                        disabled={addM.isPending || bothBlocked}
                        title={bothBlocked ? 'Both requires an admin/dispatcher/coordinator/staff role' : ''}
                        className={cx('w-full text-left px-3 py-2 flex items-center gap-2 disabled:opacity-40',
                          bothBlocked ? 'bg-line/40 cursor-not-allowed' : 'hover:bg-cream/50')}>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-[12.5px] text-ink truncate">{row.label}</div>
                    <div className="text-[11px] text-muted truncate">{row.sublabel}</div>
                  </div>
                  <span className={cx('text-[11px] font-bold', bothBlocked ? 'text-muted' : 'text-forest')}>
                    {bothBlocked ? 'not eligible for Both' : (wantsBoth ? '+ Add (both)' : '+ Add')}
                  </span>
                </button>
              );
            })}
          </div>
          {addM.isError && <div className="text-[11.5px] text-clay">{(addM.error as Error).message}</div>}
        </div>
      )}
      <div className="rounded-[10px] border border-line divide-y divide-line/70">
        {volunteers.length === 0 && suppliers.length === 0 && (
          <div className="p-4 text-[12.5px] text-muted italic">No opted-in WhatsApp contacts yet.</div>
        )}
        {volunteers.map((v) => (
          <div key={`v-${v.id}`} className="px-3 py-2 flex items-center gap-3 text-[12.5px]">
            <div className="flex-1 min-w-0">
              <div className="font-bold text-ink truncate"><Name first={v.first_name} last={v.last_name} /> <span className="text-[10px] font-extrabold uppercase tracking-wider text-forest bg-sage/70 px-1.5 py-0.5 rounded ml-1">Volunteer</span></div>
              <div className="text-[11.5px] text-muted truncate">{v.phone_primary ? displayPhone(v.phone_primary) : '—'} · channel: {v.contact_channel}</div>
            </div>
            <div className="text-right shrink-0">
              {v.whatsapp_opted_in_at
                ? <span className="text-forest font-bold">✓ opted in</span>
                : <span className="text-amber-700 font-bold">pending Yes</span>}
              <div className="text-[10.5px] text-muted">last inbound: {fmt(v.whatsapp_last_inbound_at)}</div>
            </div>
            <div className={cx('shrink-0 w-20 text-center text-[10.5px] font-bold px-1.5 py-0.5 rounded-full',
              v.window_open ? 'bg-sage text-forest' : 'bg-line text-muted')}>
              {v.window_open ? '24h open' : '24h closed'}
            </div>
            <div className="shrink-0 flex items-center gap-1">
              {!v.whatsapp_opted_in_at && (
                <button
                  onClick={() => { void uiConfirm(`Reset ${v.first_name} ${v.last_name}'s pending opt-in? They can go through the Yes flow again.`).then((ok) => { if (ok) { resetPendingM.mutate({ kind: 'volunteer', id: v.id }); } }); }}
                  disabled={resetPendingM.isPending}
                  className="haptic text-[11px] font-bold text-amber-700 border border-amber-700/50 hover:bg-amber-700/10 rounded-[6px] px-2 py-0.5 disabled:opacity-40">
                  Reset
                </button>
              )}
              <button
                onClick={() => { void uiConfirm(`Remove ${v.first_name} ${v.last_name} from the WhatsApp list? Their channel goes back to SMS. No message is sent.`).then((ok) => { if (ok) { removeM.mutate({ kind: 'volunteer', id: v.id }); } }); }}
                disabled={removeM.isPending}
                className="haptic text-[11px] font-bold text-clay border border-clay/50 hover:bg-clay/10 rounded-[6px] px-2 py-0.5 disabled:opacity-40">
                Remove
              </button>
            </div>
          </div>
        ))}
        {suppliers.map((s) => (
          <div key={`s-${s.id}`} className="px-3 py-2 flex items-center gap-3 text-[12.5px]">
            <div className="flex-1 min-w-0">
              <div className="font-bold text-ink truncate"><Name>{s.name}</Name> <span className="text-[10px] font-extrabold uppercase tracking-wider text-sky-deep bg-sky/20 px-1.5 py-0.5 rounded ml-1">Supplier</span></div>
              <div className="text-[11.5px] text-muted truncate">{s.contact_name ? <Name>{s.contact_name}</Name> : '—'} · {s.contact_phone ? displayPhone(s.contact_phone) : '—'}</div>
            </div>
            <div className="text-right shrink-0">
              {s.whatsapp_opted_in_at
                ? <span className="text-forest font-bold">✓ opted in</span>
                : <span className="text-amber-700 font-bold">pending Yes</span>}
              <div className="text-[10.5px] text-muted">last inbound: {fmt(s.whatsapp_last_inbound_at)}</div>
            </div>
            <div className={cx('shrink-0 w-20 text-center text-[10.5px] font-bold px-1.5 py-0.5 rounded-full',
              s.window_open ? 'bg-sage text-forest' : 'bg-line text-muted')}>
              {s.window_open ? '24h open' : '24h closed'}
            </div>
            <div className="shrink-0 flex items-center gap-1">
              {!s.whatsapp_opted_in_at && (
                <button
                  onClick={() => { void uiConfirm(`Reset ${s.name}'s pending opt-in?`).then((ok) => { if (ok) { resetPendingM.mutate({ kind: 'supplier', id: s.id }); } }); }}
                  disabled={resetPendingM.isPending}
                  className="haptic text-[11px] font-bold text-amber-700 border border-amber-700/50 hover:bg-amber-700/10 rounded-[6px] px-2 py-0.5 disabled:opacity-40">
                  Reset
                </button>
              )}
              <button
                onClick={() => { void uiConfirm(`Remove ${s.name} from the WhatsApp list? Channel goes back to SMS.`).then((ok) => { if (ok) { removeM.mutate({ kind: 'supplier', id: s.id }); } }); }}
                disabled={removeM.isPending}
                className="haptic text-[11px] font-bold text-clay border border-clay/50 hover:bg-clay/10 rounded-[6px] px-2 py-0.5 disabled:opacity-40">
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * batch abc800 Aug 9 — one row inside SmsGroupDetail with inline quiet-hours
 * editing. Saves via adminCRUD.patchVolunteer since quiet hours belong to the
 * volunteer record, not the group. `m.sms_quiet_start` / `m.sms_quiet_end`
 * come as "HH:MM" strings from the group-detail query (see volunteer-groups.ts).
 */
function GroupMemberRow({ m, groupName, onRemove, onSaved }: {
  m: any; groupName: string; onRemove?: () => void; onSaved: () => void;
}) {
  const [qs, setQs] = useState<string>(m.sms_quiet_start ?? '');
  // batch abc811 Aug 10 — restored two-field quiet-hours (FROM/UNTIL).
  const [qe, setQe] = useState<string>(m.sms_quiet_end ?? '');
  const [busy, setBusy] = useState(false);
  const dirty = (qs || '') !== (m.sms_quiet_start ?? '') || (qe || '') !== (m.sms_quiet_end ?? '');
  async function save() {
    setBusy(true);
    try {
      const smsQuietStart = qs ? qs : null;
      const smsQuietEnd   = qe ? qe : null;
      await adminCRUD.patchVolunteer(Number(m.id), {
        smsQuietStart,
        smsQuietEnd,
      });
      onSaved();
    } finally { setBusy(false); }
  }
  return (
    <div className="px-3 py-2 flex items-center gap-2 hover:bg-cream/40 flex-wrap">
      <div className="flex-1 min-w-[140px]">
        <div className="font-bold text-[13px] truncate">
          <Name first={m.first_name} last={m.last_name} />
        </div>
        <div className="text-[11.5px] text-muted">{m.phone_primary ? displayPhone(m.phone_primary) : '—'}</div>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-[10.5px] font-extrabold uppercase tracking-[.04em] text-muted">Quiet</span>
        <span className="text-[10.5px] font-semibold text-muted">FROM</span>
        <input type="time" value={qs} onChange={(e) => setQs(e.target.value)}
               className="w-24 border border-line rounded-[6px] px-1.5 py-1 text-[12px] bg-paper" />
        <span className="text-[10.5px] font-semibold text-muted">UNTIL</span>
        <input type="time" value={qe} onChange={(e) => setQe(e.target.value)}
               className="w-24 border border-line rounded-[6px] px-1.5 py-1 text-[12px] bg-paper" />
        {(qs || qe) ? (
          <button type="button" title="Clear"
                  onClick={() => { setQs(''); setQe(''); }}
                  className="haptic text-[11px] font-bold text-clay px-1.5 py-1 rounded hover:bg-clay/10">
            Clear
          </button>
        ) : (
          <span className="text-[11px] text-muted italic">Anytime</span>
        )}
        {dirty && (
          <button type="button" onClick={save} disabled={busy}
                  className="haptic text-[11.5px] font-bold text-forest border border-forest/40 bg-sage/40 px-2 py-1 rounded-[6px] disabled:opacity-50">
            {busy ? 'Saving…' : 'Save'}
          </button>
        )}
      </div>
      {onRemove && <button onClick={() => { void uiConfirm(`Remove ${m.first_name} from "${groupName}"?`).then((ok) => { if (ok) { onRemove(); } }); }}
              className="haptic text-[11.5px] text-clay font-bold px-2 py-1 rounded hover:bg-clay/10">
        Remove
      </button>}
    </div>
  );
}

function SmsGroupDetail({ groupId, groupName, isDefault, allVolunteers, onDone }:
  { groupId: number; groupName: string; isDefault: boolean; allVolunteers: any[]; onDone: () => void }) {
  const qc = useQueryClient();
  const office = isOfficeOnly(); // Oct 21 client: who is in a text group = office only
  const detail = useQuery({ queryKey: ['sms-group', groupId], queryFn: () => volunteerGroups.get(groupId) });
  const members = detail.data?.data?.members ?? [];
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameVal, setRenameVal] = useState(groupName);
  const [defToggle, setDefToggle] = useState(isDefault);
  const [addPick, setAddPick] = useState('');
  const [pickedIds, setPickedIds] = useState<Set<number>>(new Set());
  // Oct 5 client: ask whether to send the welcome text when adding people.
  const [sendWelcome, setSendWelcome] = useState(true);
  const [addMsg, setAddMsg] = useState<string | null>(null);

  const patchM  = useMutation({
    mutationFn: () => volunteerGroups.patch(groupId, { name: renameVal.trim(), isDefaultBroadcast: defToggle }),
    onSuccess: () => { setRenameOpen(false); qc.invalidateQueries({ queryKey: ['sms-groups'] }); qc.invalidateQueries({ queryKey: ['sms-group', groupId] }); },
  });
  const addM   = useMutation({
    mutationFn: () => volunteerGroups.addMembers(groupId, Array.from(pickedIds), sendWelcome),
    onSuccess: (r) => {
      const d = r.data;
      setAddMsg(`Added ${d.added}.` + (d.welcomeRequested ? (d.welcomeSending ? ' Sending the welcome text now.' : d.welcomed ? ` Welcome text sent to ${d.welcomed}.` : ' Welcome text did not go out (texting paused, or no phone).') : '')); // Oct 20 client: welcomeSending
      setPickedIds(new Set()); setAddPick(''); qc.invalidateQueries({ queryKey: ['sms-group', groupId] }); qc.invalidateQueries({ queryKey: ['sms-groups'] });
    },
  });
  const rmM   = useMutation({
    mutationFn: (vid: number) => volunteerGroups.removeMember(groupId, vid),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sms-group', groupId] }); qc.invalidateQueries({ queryKey: ['sms-groups'] }); },
  });
  const delM   = useMutation({
    mutationFn: () => volunteerGroups.remove(groupId),
    onSuccess: () => { onDone(); qc.invalidateQueries({ queryKey: ['sms-groups'] }); },
  });

  const memberIds = new Set(members.map((m: any) => Number(m.id)));
  const candidates = useMemo(() => {
    const q = addPick.trim().toLowerCase();
    const list = allVolunteers.filter((v: any) => !memberIds.has(Number(v.id)));
    if (!q) return list.slice(0, 20);
    return list.filter((v: any) => `${v.firstName} ${v.lastName} ${v.phonePrimary ?? ''}`.toLowerCase().includes(q)).slice(0, 20);
  }, [allVolunteers, addPick, memberIds]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          {renameOpen ? (
            <div className="flex items-center gap-2">
              <input value={renameVal} onChange={(e) => setRenameVal(e.target.value)}
                     className="rounded-[8px] border border-line bg-paper px-2 py-1 text-[14px] font-bold" />
              <label className="flex items-center gap-1 text-[11.5px]">
                <input type="checkbox" checked={defToggle} onChange={(e) => setDefToggle(e.target.checked)} />
                Default
              </label>
              <Button size="sm" variant="forest" onClick={() => patchM.mutate()} disabled={!renameVal.trim() || patchM.isPending}>Save</Button>
              <Button size="sm" variant="plain" onClick={() => { setRenameOpen(false); setRenameVal(groupName); setDefToggle(isDefault); }}>Cancel</Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <div className="font-display font-semibold text-[16px]">{groupName}</div>
              {isDefault && <span className="text-[10px] font-extrabold uppercase tracking-wider text-forest bg-sage/70 px-1.5 py-0.5 rounded">Default</span>}
            </div>
          )}
          <div className="text-[12px] text-muted mt-0.5">{members.length} member{members.length === 1 ? '' : 's'}</div>
        </div>
        {!renameOpen && office && (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="plain" icon={<Pencil size={13} />} onClick={() => setRenameOpen(true)}>Rename</Button>
            <Button size="sm" variant="plain" icon={<Trash2 size={13} />}
                    onClick={() => { void uiConfirm(`Delete group "${groupName}"? Members are NOT deleted.`).then((ok) => { if (ok) { delM.mutate(); } }); }}>
              Delete
            </Button>
          </div>
        )}
      </div>

      <div className="rounded-[10px] border border-line divide-y divide-line/70 overflow-hidden">
        {members.length === 0 && <div className="px-3 py-2.5 text-[12.5px] text-muted italic">No members yet — add drivers below.</div>}
        {members.map((m: any) => (
          <GroupMemberRow key={m.id} m={m} groupName={groupName}
                          onRemove={office ? () => rmM.mutate(Number(m.id)) : undefined}
                          onSaved={() => { qc.invalidateQueries({ queryKey: ['sms-group', groupId] }); }} />
        ))}
      </div>

      {!office ? (
        <div className="text-[12px] italic text-muted">Only the office can change who is in a text group.</div>
      ) : <div>
        <div className="text-[11.5px] font-bold text-muted mb-1">Add members</div>
        <div className="flex items-center gap-2 mb-2">
          <input value={addPick} onChange={(e) => setAddPick(e.target.value)}
                 placeholder="Search by name or phone…"
                 className="flex-1 rounded-[8px] border border-line bg-paper px-2 py-1.5 text-[13px]" />
          <Button size="sm" variant="forest" icon={<Plus size={13} />}
                  onClick={() => addM.mutate()}
                  disabled={pickedIds.size === 0 || addM.isPending}>
            {addM.isPending ? 'Adding…' : `Add ${pickedIds.size || ''}`.trim()}
          </Button>
        </div>
        <label className="flex items-center gap-2 mb-2 text-[12.5px]">
          <input type="checkbox" checked={sendWelcome} onChange={(e) => setSendWelcome(e.target.checked)} className="h-4 w-4 accent-forest" />
          Send them the welcome texts <span className="text-muted">(welcome + how it works — edit under Message templates below)</span>
        </label>
        {addMsg && <div className="mb-2 text-[12px] font-semibold text-forest">{addMsg}</div>}
        <div className="rounded-[10px] border border-line divide-y divide-line/70 max-h-[220px] overflow-y-auto">
          {candidates.length === 0 && <div className="px-3 py-2.5 text-[12.5px] text-muted italic">No candidates match.</div>}
          {candidates.map((v: any) => {
            const picked = pickedIds.has(Number(v.id));
            return (
              <label key={v.id} className={cx('px-3 py-2 flex items-center gap-2 cursor-pointer', picked ? 'bg-sage/40' : 'hover:bg-cream/40')}>
                <input type="checkbox" checked={picked}
                       onChange={(e) => setPickedIds((s) => { const n = new Set(s); if (e.target.checked) n.add(Number(v.id)); else n.delete(Number(v.id)); return n; })} />
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-[13px] truncate">
                    <Name first={v.firstName} last={v.lastName} />
                  </div>
                  <div className="text-[11.5px] text-muted">{v.phonePrimary ? displayPhone(v.phonePrimary) : '—'}</div>
                </div>
              </label>
            );
          })}
        </div>
      </div>}
    </div>
  );
}

// ============================================================================
// WhatsApp admin — Aug 29 (WA parity). Lives inside the SMS combo panel so
// the office manages both channels from one place. Reads /api/whatsapp/admin/status.
// ============================================================================
export function WhatsappAdminPanel() {
  const q = useQuery({
    queryKey: ['wa-admin-status'],
    queryFn: () => whatsappAdmin.status(),
    refetchInterval: 60_000,
  });
  const d = q.data?.data;
  // Sep 13 2026: bridge status + test-send. Independent of Meta Cloud API.
  const bridgeQ = useQuery({
    queryKey: ['wa-bridge-status'],
    queryFn: () => waBridge.status(),
    refetchInterval: 30_000,
  });
  const [testPhone, setTestPhone] = useState('');
  const [testText, setTestText]  = useState('ZLZ bridge test — please ignore.');
  const [testMsg, setTestMsg]    = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [testPic, setTestPic]    = useState(false); // Oct 27 client: "send a test picture to my number"
  const testSendMut = useNightSend({ // Oct 23 client: late at night asks first
    send: (c: boolean) => waBridge.send({ phone: testPhone.trim(), text: testText.trim(), ...(c ? { confirmNight: true } : {}),
      ...(testPic ? { mediaUrl: 'https://staging.zehlzeh.org/rescue/icon-512.png', mediaType: 'image/png', mediaName: 'zehlzeh.png' } : {}) }),
    onSent: (res) => {
      setTestMsg({ tone: 'ok', text: `Queued as bridge id #${res.id}. Watch WhatsApp Business on the tablet — should send in ~5 seconds.` });
      bridgeQ.refetch();
    },
    onError: (err: any) => setTestMsg({ tone: 'err', text: err?.message || 'Send failed' }),
  });
  const fmt = (iso: string | null | undefined) => iso ? fmtDateTimeEastern(iso) : '—';

  if (q.isLoading) return <div className="text-[12.5px] text-muted p-3">Loading WhatsApp status…</div>;
  if (q.isError)   return <div className="text-[12.5px] text-clay p-3">Failed to load WhatsApp status.</div>;
  if (!d)          return null;

  const templates: Array<any> = (d.templates?.data ?? []) as any[];
  const approved  = templates.filter((t) => t.status === 'APPROVED');
  const pending   = templates.filter((t) => t.status === 'PENDING');
  const rejected  = templates.filter((t) => t.status === 'REJECTED');

  const totalWa = d.volunteers.length + d.suppliers.length;
  const optedIn = [...d.volunteers, ...d.suppliers].filter((r) => !!r.whatsapp_opted_in_at).length;
  const inWindow = [...d.volunteers, ...d.suppliers].filter((r) => r.window_open).length;

  const bs = bridgeQ.data?.data;
  return (
    <div className="space-y-4">
      {/* Sep 13 2026: Bridge test-send + status. This is the ANDROID BRIDGE
          path (WhatsApp Business app on the tablet), independent of Meta
          Cloud API (which is DISCONNECTED below). */}
      <div className="rounded-[14px] border border-forest/40 bg-sage/20 p-4">
        <div className="flex items-baseline justify-between mb-2">
          <div>
            <div className="font-display font-bold text-[15px] text-forest">WhatsApp Bridge (tablet)</div>
            {bs?.wa_bridge_number && (
              <div className="text-[12.5px] text-ink mt-0.5">
                <span className="text-muted">Connected number:</span> <b>{bs.wa_bridge_number}</b>
              </div>
            )}
          </div>
          <div className="text-[11.5px] text-muted">
            {bs
              ? `Queued: ${bs.queued} · Claimed: ${bs.claimed} · Sent: ${bs.sent} · Failed: ${bs.failed}`
              : 'Loading…'}
          </div>
        </div>
        <div className="text-[12.5px] text-muted mb-3">
          Sends via the tablet's WA Business app. Bridge polls every 5s.
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col">
            <label className="text-[11px] uppercase tracking-wider text-muted mb-1">Phone (10 digits)</label>
            <input value={testPhone} onChange={(e) => setTestPhone(e.target.value)}
              placeholder="8455982798"
              className="border border-line rounded-[8px] px-2.5 py-1.5 text-[13px] w-44 bg-paper" />
          </div>
          <div className="flex flex-col flex-1 min-w-[240px]">
            <label className="text-[11px] uppercase tracking-wider text-muted mb-1">Message</label>
            <input value={testText} onChange={(e) => setTestText(e.target.value)}
              className="border border-line rounded-[8px] px-2.5 py-1.5 text-[13px] bg-paper" />
          </div>
          <label className="flex items-center gap-1.5 text-[12.5px] font-bold text-ink pb-1.5">
            <input type="checkbox" checked={testPic} onChange={(e) => setTestPic(e.target.checked)} /> 📷 With a test picture
          </label>
          <button
            onClick={() => { setTestMsg(null); void testSendMut.start(); }}
            disabled={!testPhone.trim() || !testText.trim() || testSendMut.busy}
            className="haptic bg-forest text-paper font-bold text-[13px] rounded-[8px] px-4 py-1.5 disabled:opacity-40">
            {testSendMut.busy ? 'Queuing…' : 'Send test'}
          </button>
        </div>
        {testSendMut.prompt}
        {testMsg && (
          <div className={cx('mt-2 text-[12.5px] font-bold',
            testMsg.tone === 'ok' ? 'text-forest' : 'text-clay')}>
            {testMsg.text}
          </div>
        )}
      </div>

      {/* --- Templates card --- */}
      <div className="rounded-[14px] border border-line bg-paper p-4">
        <div className="font-display font-bold text-[15px] text-ink mb-2">Message templates</div>
        <div className="grid grid-cols-3 gap-3 text-[12.5px]">
          <div>
            <div className="font-bold text-forest mb-1">Approved · {approved.length}</div>
            {approved.map((t) => (
              <div key={t.id} className="font-mono text-[11.5px] text-ink truncate">{t.name} <span className="text-muted">({t.category})</span></div>
            ))}
            {approved.length === 0 && <div className="text-muted italic text-[11.5px]">none</div>}
          </div>
          <div>
            <div className="font-bold text-amber-700 mb-1">Pending · {pending.length}</div>
            {pending.map((t) => (
              <div key={t.id} className="font-mono text-[11.5px] text-ink truncate">{t.name} <span className="text-muted">({t.category})</span></div>
            ))}
            {pending.length === 0 && <div className="text-muted italic text-[11.5px]">none</div>}
          </div>
          <div>
            <div className="font-bold text-clay mb-1">Rejected · {rejected.length}</div>
            {rejected.map((t) => (
              <div key={t.id} className="font-mono text-[11.5px] text-ink truncate">{t.name} <span className="text-muted">({t.category})</span></div>
            ))}
            {rejected.length === 0 && <div className="text-muted italic text-[11.5px]">none</div>}
          </div>
        </div>
      </div>

      {/* --- Roster stats --- */}
      <div className="rounded-[14px] border border-line bg-paper p-4">
        <div className="grid grid-cols-4 gap-3 text-center">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted">On WA channel</div>
            <div className="font-display font-bold text-[24px] text-forest">{totalWa}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted">Opted in</div>
            <div className="font-display font-bold text-[24px] text-forest">{optedIn}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted">In 24h window</div>
            <div className="font-display font-bold text-[24px] text-forest">{inWindow}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted">Queued msgs</div>
            <div className="font-display font-bold text-[24px] text-forest">{d.pending_queue.pending_count}</div>
          </div>
        </div>
      </div>

      {/* --- Volunteers on WA --- */}
      <div className="rounded-[14px] border border-line bg-paper">
        <div className="px-4 py-2.5 border-b border-line font-display font-bold text-[14px] text-ink">
          Volunteers on WhatsApp <span className="text-[11.5px] text-muted font-normal">— {d.volunteers.length}</span>
        </div>
        {d.volunteers.length === 0 ? (
          <div className="p-4 text-[12.5px] text-muted italic">Nobody yet. Set a volunteer's Contact channel to WhatsApp in their profile to onboard them.</div>
        ) : (
          <div className="divide-y divide-line">
            {d.volunteers.map((v) => (
              <div key={v.id} className="px-4 py-2 flex items-center gap-3 text-[12.5px]">
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-ink truncate"><Name first={v.first_name} last={v.last_name} /></div>
                  <div className="text-[11.5px] text-muted truncate">{v.phone_primary ? displayPhone(v.phone_primary) : '—'} · channel: {v.contact_channel}</div>
                </div>
                <div className="text-right shrink-0">
                  {v.whatsapp_opted_in_at
                    ? <span className="text-forest font-bold">✓ opted in</span>
                    : <span className="text-amber-700 font-bold">pending Yes</span>}
                  <div className="text-[11px] text-muted">last inbound: {fmt(v.whatsapp_last_inbound_at)}</div>
                </div>
                <div className={cx('shrink-0 w-16 text-center text-[11px] font-bold px-2 py-0.5 rounded-full',
                  v.window_open ? 'bg-sage text-forest' : 'bg-line text-muted')}>
                  {v.window_open ? 'window open' : 'window closed'}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* --- Suppliers on WA --- */}
      <div className="rounded-[14px] border border-line bg-paper">
        <div className="px-4 py-2.5 border-b border-line font-display font-bold text-[14px] text-ink">
          Suppliers on WhatsApp <span className="text-[11.5px] text-muted font-normal">— {d.suppliers.length}</span>
        </div>
        {d.suppliers.length === 0 ? (
          <div className="p-4 text-[12.5px] text-muted italic">Nobody yet. Set a supplier's Contact channel to WhatsApp in their profile to onboard them.</div>
        ) : (
          <div className="divide-y divide-line">
            {d.suppliers.map((s) => (
              <div key={s.id} className="px-4 py-2 flex items-center gap-3 text-[12.5px]">
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-ink truncate"><Name>{s.name}</Name></div>
                  <div className="text-[11.5px] text-muted truncate">{s.contact_name ? <Name>{s.contact_name}</Name> : '—'} · {s.contact_phone ? displayPhone(s.contact_phone) : '—'}</div>
                </div>
                <div className="text-right shrink-0">
                  {s.whatsapp_opted_in_at
                    ? <span className="text-forest font-bold">✓ opted in</span>
                    : <span className="text-amber-700 font-bold">pending Yes</span>}
                  <div className="text-[11px] text-muted">last inbound: {fmt(s.whatsapp_last_inbound_at)}</div>
                </div>
                <div className={cx('shrink-0 w-16 text-center text-[11px] font-bold px-2 py-0.5 rounded-full',
                  s.window_open ? 'bg-sage text-forest' : 'bg-line text-muted')}>
                  {s.window_open ? 'window open' : 'window closed'}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// SMS Threads — client Aug 3: "where can dispatcher chat on the portal via
// SMS to someone, where can we follow that". Backed by /api/sms/threads.
// ============================================================================
export function SmsThreadsPanel() {
  const qc = useQueryClient();
  const [includeShop, setIncludeShop] = useState(false);
  // Client Sep 2: the inbox was flooded with automated pickup broadcasts /
  // reminders / thank-yous, burying real replies. Default to REAL conversations
  // only (threads with at least one inbound message); the toggle reveals the
  // automated, outbound-only threads too. Server-side filtered so automated
  // threads don't crowd real ones out of the 200-row cap.
  // Oct 14 client: "Show all auto there as well" — automated texts shown by default.
  const [includeAutomated, setIncludeAutomated] = useState(true);
  // Oct 28 client: WhatsApp conversations in the same list (one row per person), each tagged Text / WhatsApp.
  const listQ = useQuery({
    queryKey: ['sms-threads', includeShop ? 'all' : 'volunteer', includeAutomated ? 'auto' : 'real', 'wa'],
    queryFn: () => smsThreads.list({ includeShop, includeAutomated, withWa: true }),
    // abc866 (Aug 17): also refetch on window focus + treat data as stale
    // immediately so a coordinator who returns to the tab sees the name
    // freshly joined against the volunteer directory — the previous config
    // only re-polled every 30s and could show a phone-only row for the
    // brief window between the SMS landing and the volunteer being named.
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    refetchOnMount: 'always',
    staleTime: 0,
  });
  // Refresh-persistence (client Sep 2): restore the open conversation from the
  // URL hash (#coord/sms-combo/threads/<phone>) and keep it in sync so a reload
  // reopens the same thread instead of dropping back to the list.
  const [openPhone, setOpenPhone] = useState<string | null>(() => {
    const n = readCoordNav();
    return (n.tab === 'sms-combo' && n.sub === 'threads' && n.thread) ? n.thread : null;
  });
  useEffect(() => {
    patchCoordNav({ thread: openPhone || undefined });
  }, [openPhone]);
  // Consolidated brief #4 (Aug 17): search SMS threads by name / phone /
  // partial. Filter is client-side across the already-loaded rows — fast on
  // typing and no backend round-trip.
  const [query, setQuery] = useState('');
  const rows: SmsThreadRow[] = listQ.data?.data ?? [];
  // Count of automated (outbound-only) threads hidden by the default filter,
  // surfaced in the toggle label so ops know how many are tucked away.
  const hiddenAutomated = Number(listQ.data?.meta?.hidden ?? 0);
  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    const digits = q.replace(/\D/g, '');
    return rows.filter((t) => {
      const name = `${t.first_name ?? ''} ${t.last_name ?? ''}`.toLowerCase();
      if (name.includes(q)) return true;
      if (digits && t.phone.includes(digits)) return true;
      if (String(t.unit_number ?? '').includes(q)) return true;
      if ((t.last_body ?? '').toLowerCase().includes(q)) return true;
      return false;
    });
  }, [rows, query]);

  // tier2 Aug 21 — removed the auto-select-first-thread effect. It was
  // firing `markRead` on the top conversation the second the panel mounted,
  // which meant a coordinator opening the tab to triage new inbound SMS
  // would silently clear the first row's unread badge before they'd even
  // seen it. Selection is now driven only by an explicit click.
  // Consolidated brief #1 (Aug 18): mark the opened thread as read (and only
  // that thread — global unread count updates on the next poll).
  const markRead = useMutation({
    mutationFn: (phone: string) => smsThreads.markRead(phone),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sms-threads'] }),
  });
  useEffect(() => {
    if (openPhone) markRead.mutate(openPhone);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openPhone]);
  const unreadTotal = rows.reduce((n, r) => n + Number(r.unread_in_count ?? 0), 0);

  return (
    <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-3 h-[calc(100vh-180px)] min-h-[400px]">
      <div className="rounded-[14px] border border-line bg-paper overflow-hidden flex flex-col min-h-0">
        <div className="px-3 py-2 border-b border-line/70 flex items-center justify-between gap-2 shrink-0">
          <div className="text-[11.5px] font-extrabold uppercase tracking-wider text-muted flex items-center gap-1.5">
            <span title="Texts and WhatsApp together: each conversation and message says which">Conversations {filteredRows.length ? `· ${filteredRows.length}${query ? ` of ${rows.length}` : ''}` : ''}</span>
            {unreadTotal > 0 && (
              <span className="bg-clay text-paper px-1.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-normal">
                {unreadTotal} new
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <label className="flex items-center gap-1.5 text-[11px] text-muted cursor-pointer whitespace-nowrap"
                   title="Show automated broadcasts, reminders and thank-you texts (outbound-only threads with no reply). On by default; untick to see only real conversations.">
              <input type="checkbox" checked={includeAutomated} onChange={(e) => setIncludeAutomated(e.target.checked)}
                     className="h-3.5 w-3.5 accent-forest" />
              Show automated{!includeAutomated && hiddenAutomated > 0 ? ` (${hiddenAutomated} hidden)` : ''}
            </label>
            <label className="flex items-center gap-1.5 text-[11px] text-muted cursor-pointer whitespace-nowrap"
                   title="Include the shop-order pipeline messages (donor orders, product confirms, etc.).">
              <input type="checkbox" checked={includeShop} onChange={(e) => setIncludeShop(e.target.checked)}
                     className="h-3.5 w-3.5 accent-forest" />
              Show shop msgs
            </label>
          </div>
        </div>
        <div className="px-3 py-2 border-b border-line/70 shrink-0">
          <input value={query} onChange={(e) => setQuery(e.target.value)}
                 placeholder="Search name, phone, unit #, message…"
                 className="w-full rounded-[8px] border border-line px-2.5 py-1.5 text-[13px] outline-none focus:border-forest" />
        </div>
        <div className="divide-y divide-line/70 overflow-y-auto flex-1 min-h-0">
          {filteredRows.length === 0 && (
            <div className="px-3 py-6 text-[12.5px] text-muted italic text-center">
              {rows.length === 0 ? 'No conversations yet.' : `No matches for "${query}".`}
            </div>
          )}
          {filteredRows.map((t) => {
            const name = t.first_name ? `${t.first_name} ${t.last_name ?? ''}`.trim() : displayPhone(t.phone);
            const unread = Number(t.unread_in_count ?? 0);
            return (
              <button key={t.phone} onClick={() => setOpenPhone(t.phone)}
                      className={cx('w-full text-left px-3 py-2.5',
                        openPhone === t.phone ? 'bg-sage/40'
                          : unread > 0 ? 'bg-clay/5 hover:bg-clay/10'
                          : 'hover:bg-cream/50')}>
                <div className="flex items-baseline justify-between gap-2">
                  <div className={cx('text-[13px] truncate flex items-center gap-1.5',
                    unread > 0 ? 'font-extrabold text-ink' : 'font-bold')}>
                    {unread > 0 && <span className="inline-block w-2 h-2 rounded-full bg-clay shrink-0" />}
                    <span className="truncate"><Name>{name}</Name></span>
                  </div>
                  <div className="text-[10.5px] text-muted whitespace-nowrap flex items-center gap-1">
                    {unread > 0 && <span className="bg-clay text-paper px-1.5 rounded-full text-[10px] font-extrabold">{unread}</span>}
                    <span>{msgWhen(t.last_at)}</span>
                  </div>
                </div>
                <div className="text-[11.5px] text-muted mt-0.5 flex items-center gap-1.5">
                  <span>{displayPhone(t.phone)}</span>
                  {/* Oct 28 client: how he last wrote to us */}
                  {t.last_in_channel === 'whatsapp' && <span className="text-[#128C4A] font-bold">· replied on WhatsApp</span>}
                </div>
                {t.last_body && (
                  <div className="flex items-center gap-1.5 mt-1 min-w-0">
                    <ChannelPill channel={t.last_channel} />
                    <div className={cx('text-[12px] truncate', unread > 0 ? 'text-ink font-semibold' : 'text-ink/80')}>{t.last_body}</div>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
      <div className="rounded-[14px] border border-line bg-paper flex flex-col min-h-0 overflow-hidden">
        {!openPhone ? (
          <div className="flex-1 flex items-center justify-center text-[12.5px] text-muted italic">Pick a conversation on the left.</div>
        ) : (
          <SmsThread phone={openPhone} includeShop={includeShop} onSent={() => { qc.invalidateQueries({ queryKey: ['sms-threads'] }); qc.invalidateQueries({ queryKey: ['sms-thread', openPhone] }); }} />
        )}
      </div>
    </div>
  );
}

// Oct 28 client: every conversation and message says how it came — green "WhatsApp" / grey "Text".
export function ChannelPill({ channel, className }: { channel?: MsgChannel | null; className?: string }) {
  const wa = channel === 'whatsapp';
  return (
    <span className={cx('shrink-0 inline-flex items-center px-1.5 py-[1px] rounded-full text-[10px] font-extrabold leading-[14px]',
      wa ? 'bg-[#25D366] text-white' : 'bg-line text-ink/70', className)}>
      {wa ? 'WhatsApp' : 'Text'}
    </span>
  );
}

function SmsThread({ phone, onSent, includeShop = false }: { phone: string; onSent: () => void; includeShop?: boolean }) {
  // Oct 11 client: newest 500 by default; "Show all" loads up to 5000.
  const [showAll, setShowAll] = useState(false);
  // Oct 28 client: the reply goes back the way he last wrote; the dispatcher can switch Text / WhatsApp.
  const [pickedChannel, setPickedChannel] = useState<MsgChannel | null>(null);
  useEffect(() => { setShowAll(false); setPickedChannel(null); }, [phone]);
  const detailQ = useQuery({
    queryKey: ['sms-thread', phone, includeShop ? 'all' : 'volunteer', showAll ? 'full' : 'recent', 'wa'],
    queryFn: () => smsThreads.get(phone, { includeShop, limit: showAll ? 5000 : undefined, withWa: true }),
    refetchInterval: 30_000, // Nov 3 client: speed (was 15 s)
  });
  const [body, setBody] = useState('');
  const qc = useQueryClient();
  const [sendNote, setSendNote] = useState<string | null>(null);
  const d = detailQ.data?.data;
  const channel: MsgChannel = pickedChannel ?? d?.replyChannel ?? 'text';
  const viaWa = channel === 'whatsapp';
  const waTo = d?.waTo ?? phone;
  // Oct 23 client: late at night "It's 1:12 AM. Send now, or schedule it?" (late-night.tsx).
  const sendM = useNightSend<unknown>({
    send: (c: boolean) => viaWa
      ? waBridge.send({ phone: waTo, text: body.trim(), ...(c ? { confirmNight: true } : {}) })
      : smsThreads.send(phone, body.trim(), c),
    schedule: (iso: string) => personalSched.create(viaWa ? { kind: 'wa', phone: waTo, text: body.trim() } : { kind: 'sms', phone, text: body.trim() }, iso),
    onSent: () => {
      setBody(''); setSendNote(viaWa ? 'Sent to the WhatsApp phone. It shows here as "queued" until the phone sends it.' : null);
      onSent(); detailQ.refetch();
    },
    onScheduled: () => { setBody(''); setSendNote(null); refreshScheduled(qc); }, // the ⏰ line shows above
    onError: (e: any) => setSendNote(`⚠️ ${e?.message || 'Not sent'}`),
  });
  const msgs = d?.messages ?? [];
  const contact = d?.contact;
  const name = contact ? personFull(contact.first_name, contact.last_name) : displayPhone(phone); // Oct 23 client: no unit # outside the Drivers list

  // Aug 23 client fix 3: auto-scroll to bottom when the thread opens or new
  // messages arrive. Without this, opening a long conversation shows the
  // OLDEST message and the coord has to scroll down to see recent replies.
  const scrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs.length, phone]);

  return (
    <>
      <div className="px-4 py-2.5 border-b border-line/70 flex items-center justify-between gap-2">
        <div>
          <div className="font-bold text-[14px]"><Name>{name}</Name></div>
          <div className="text-[11.5px] text-muted">{(d?.numbers ?? []).length > 1 // Oct 14 client: the driver's numbers in one conversation
            ? `All ${d!.numbers!.length} numbers: ${d!.numbers!.map((n) => fmtPhone(n)).join(', ')} · replies go to ${fmtPhone(d?.textTo ?? phone)}`
            : displayPhone(phone)}</div>
        </div>
        <div className="text-[11.5px] text-muted">
          {(d?.total ?? msgs.length) > msgs.length
            ? <>Newest {msgs.length} of {d?.total} · <button type="button" onClick={() => setShowAll(true)} className="font-bold text-forest underline">Show all</button></>
            : <>{msgs.length} message{msgs.length === 1 ? '' : 's'}</>}
        </div>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-2 bg-cream/40">
        {msgs.length === 0 && <div className="text-[12.5px] text-muted italic text-center py-8">No messages yet.</div>}
        {msgs.map((m) => (
          <div key={m.mkey ?? m.id} className={cx('flex', m.direction === 'out' ? 'justify-end' : 'justify-start')}>
            <div className={cx('max-w-[80%] rounded-[14px] px-3 py-2',
                m.direction === 'out' ? 'bg-forest text-paper' : 'bg-paper border border-line')}>
              <div className="text-[13px] whitespace-pre-wrap break-words">{m.body}</div>
              <div className={cx('text-[10.5px] mt-1 flex items-center gap-1.5 flex-wrap', m.direction === 'out' ? 'text-paper/70' : 'text-muted')}>
                {/* Oct 28 client: how it came / went */}
                <ChannelPill channel={m.channel} />
                {/* tier2 Aug 21 — was rendering in the browser's local tz,
                    which turned the log into a lie for anyone RDP'd in from
                    outside Eastern. Anchor to NY like the rest of the portal. */}
                <span>
                  {msgWhen(m.created_at)}
                  {(d?.numbers ?? []).length > 1 && m.phone_last10 ? ` · ${m.direction === 'out' ? 'to' : 'from'} …${String(m.phone_last10).slice(-4)}` : ''}
                </span>
                {m.direction === 'out' && m.status && m.status !== 'sent' && (
                  <span className={cx('font-bold', m.status === 'failed' ? 'text-amber-200' : 'text-paper/90')}>
                    · {m.status === 'failed' ? 'not sent' : 'waiting for the WhatsApp phone'}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
      <ScheduledTexts filter={{ phone, volunteerId: contact?.id != null ? Number(contact.id) : null }} className="border-t border-line/70 px-3 py-2 bg-paper" />
      {sendNote && <div className="border-t border-line/70 px-3 py-1.5 text-[12px] font-semibold">{sendNote}</div>}
      {sendM.prompt}
      <div className="border-t border-line/70 p-3 space-y-2">
        {/* Oct 28 client: reply the same way he wrote; a switch to pick Text / WhatsApp. */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="inline-flex rounded-full border border-line bg-cream/40 p-0.5" role="radiogroup" aria-label="Send by">
            {(['text', 'whatsapp'] as MsgChannel[]).map((c) => (
              <button key={c} type="button" role="radio" aria-checked={channel === c}
                      onClick={() => { setPickedChannel(c); setSendNote(null); }}
                      className={cx('haptic px-3 py-1 rounded-full text-[12px] font-bold',
                        channel === c ? (c === 'whatsapp' ? 'bg-[#25D366] text-white' : 'bg-ink/80 text-paper') : 'text-muted hover:text-ink')}>
                {c === 'whatsapp' ? 'WhatsApp' : 'Text'}
              </button>
            ))}
          </div>
          <div className={cx('text-[12px] font-bold', viaWa ? 'text-[#128C4A]' : 'text-ink/70')}>
            Will send by {viaWa ? 'WhatsApp' : 'text'}
            {d?.replyChannel && channel === d.replyChannel
              ? <span className="font-normal text-muted"> · the way {contact?.first_name || 'they'} last wrote</span> : null}
          </div>
        </div>
        <div className="flex items-end gap-2">
          <textarea value={body} onChange={(e) => { setBody(e.target.value); setSendNote(null); }} rows={2}
                    placeholder={viaWa ? 'Type a WhatsApp reply…' : 'Type a text reply…'}
                    className="flex-1 rounded-[10px] border border-line bg-paper px-3 py-2 text-[13px] resize-none" />
          <Button size="sm" variant="forest" icon={<Send size={13} />}
                  onClick={() => { void sendM.start(); }} disabled={!body.trim() || sendM.busy}>
            {sendM.busy ? 'Sending…' : 'Send'}
          </Button>
        </div>
      </div>
    </>
  );
}


// ============================ SMS Dispatchers Panel ==========================

/**
 * Fork M · client Aug 6 — "Where do we select which dispatchers have SMS
 * access?" Any phone here receives SMS notifications for driver replies AND
 * can reply privately to a driver using `*NN <message>` from their phone.
 */
export function SmsDispatchersPanel() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['sms-dispatchers'], queryFn: () => smsDispatchers.list() });
  const [phone, setPhone] = useState('');
  const [label, setLabel] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const add = useMutation({
    mutationFn: () => smsDispatchers.add({ phone: phone.trim(), label: label.trim() || null }),
    onSuccess: () => { setPhone(''); setLabel(''); setErr(null); qc.invalidateQueries({ queryKey: ['sms-dispatchers'] }); },
    onError: (e: any) => setErr(e?.message || 'failed to add'),
  });
  const del = useMutation({
    mutationFn: (p: string) => smsDispatchers.remove(p),
    onSuccess: () => { setErr(null); qc.invalidateQueries({ queryKey: ['sms-dispatchers'] }); },
    // tier2 Aug 21 — reuse the panel's existing `err` state so remove
    // failures surface next to the add form instead of being silent.
    onError: (e: any) => setErr(e?.message || 'failed to remove'),
  });
  const rows: SmsDispatcher[] = q.data?.data ?? [];
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4">
      <div>
        <div className="rounded-[12px] border border-line bg-sage-soft/40 px-3 py-2 mb-3">
          <div className="text-[12.5px] text-forest-deep">
            <b>Dispatchers on this list</b> receive SMS notifications for driver replies and can
            reply privately to a driver by texting <code>*NN &lt;your message&gt;</code> from their phone.
            The <code>*NN</code> prefix is stripped — only the message text reaches the driver.
          </div>
        </div>
        {q.isLoading && <div className="text-[13px] text-muted">Loading…</div>}
        {!q.isLoading && rows.length === 0 && (
          <div className="text-[13px] text-muted italic">No dispatchers yet — add one on the right.</div>
        )}
        <div className="space-y-1.5">
          {rows.map((d) => (
            <div key={d.id} className="rounded-[10px] border border-line bg-paper px-3 py-2 flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="font-bold text-[13.5px] flex items-center gap-2 flex-wrap">
                  {d.matched_volunteer?.name ? (
                    <>
                      <span><Name>{d.matched_volunteer.name}</Name></span>
                    </>
                  ) : (
                    <span><Name>{d.label ?? 'Dispatcher'}</Name></span>
                  )}
                  <span className="text-muted font-normal text-[12px]">·</span>
                  <span className="text-[12px] text-muted">{displayPhone(d.phone)}</span>
                </div>
                {d.label && d.matched_volunteer?.name && (
                  <div className="text-[11.5px] text-muted">{d.label}</div>
                )}
              </div>
              <button onClick={() => { void uiConfirm(`Remove ${d.matched_volunteer?.name ?? d.phone} from dispatchers?`).then((ok) => { if (ok) { del.mutate(d.phone); } }); }}
                      className="haptic px-2 py-1 text-[12.5px] font-bold text-clay hover:underline">
                Remove
              </button>
            </div>
          ))}
        </div>
      </div>
      <div>
        <div className="rounded-[12px] border border-line bg-paper px-3 py-3 space-y-2">
          <div className="font-bold text-[13.5px]">Add a dispatcher</div>
          <div>
            <label className="block text-[11px] font-extrabold uppercase tracking-[.05em] text-muted mb-1">Phone</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)}
                   placeholder="(845) 555-1234"
                   className="w-full border border-line rounded-[8px] px-2 py-1.5 bg-paper text-[13px]" />
          </div>
          <div>
            <label className="block text-[11px] font-extrabold uppercase tracking-[.05em] text-muted mb-1">Label (optional)</label>
            <input value={label} onChange={(e) => setLabel(e.target.value)}
                   placeholder="e.g. Office landline"
                   className="w-full border border-line rounded-[8px] px-2 py-1.5 bg-paper text-[13px]" />
          </div>
          {err && <div className="text-[12px] text-clay font-bold">{err}</div>}
          <div className="flex justify-end">
            <button onClick={() => add.mutate()} disabled={!phone.trim() || add.isPending}
                    className="haptic text-[12px] font-bold bg-forest text-paper px-3 py-1.5 rounded-[8px] shadow-ctag disabled:opacity-50">
              {add.isPending ? 'Adding…' : 'Add dispatcher'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Dispatcher Roster (client Aug 20 overhaul).
 *
 * WHY: previously, "dispatcher" was implicit — anyone with a staff-role user
 * account, or anyone who happened to have a shift, showed up. Client's
 * ask: adding someone as a dispatcher must NOT require an assignment; the
 * roster is the person, the shift is separate. "I can be a dispatcher
 * right now" is a one-tap add.
 *
 * WHAT: person-first roster split into two columns.
 *   • On Deck / Available — no shift now and none coming up (Nov 6 client).
 *   • Assigned            — on shift now OR any shift coming up; shows the
 *                            shift window and any notes (the "trip /
 *                            responsibility" per client wording).
 * Actual shift-assignment happens in the existing Shifts UI — this panel
 * only manages who is ON THE LIST.
 */
function fmtShiftWindow(s: DispatcherShiftInfo): string {
  const start = new Date(s.startsAt);
  const end   = new Date(s.endsAt);
  // Oct 23 client: one date + time format (New York)
  const sameDay = dayAt(start) === dayAt(end);
  return sameDay ? `${dayAt(start)} · ${timeAt(start)} – ${timeAt(end)}` : `${whenAt(start)} → ${whenAt(end)}`;
}

function AddDispatcherModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const cand = useQuery({
    queryKey: ['dispatcher-candidates', q],
    queryFn: () => dispatchers.candidates(q),
  });
  // tier2 Aug 21 — bubble up the add failure so a 409 / role-mismatch shows
  // in the modal instead of the "Adding…" button quietly reverting.
  const [addErr, setAddErr] = useState<string | null>(null);
  const add = useMutation({
    mutationFn: (id: number) => dispatchers.add(id),
    onSuccess: () => {
      setAddErr(null);
      qc.invalidateQueries({ queryKey: ['dispatcher-roster'] });
      qc.invalidateQueries({ queryKey: ['dispatcher-candidates'] });
    },
    onError: (e: Error) => setAddErr(e.message),
  });
  const rows: DispatcherCandidate[] = cand.data?.data ?? [];
  return (
    <div className="fixed inset-0 z-50 bg-ink/40 flex items-start sm:items-center justify-center p-3 sm:p-6">
      <div className="bg-paper rounded-[16px] shadow-2xl w-full max-w-[520px] max-h-[85vh] flex flex-col overflow-hidden"
           onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-line flex items-center justify-between">
          <div className="font-display font-bold text-[17px] text-ink">Add dispatcher</div>
          <button onClick={onClose} className="text-muted hover:text-ink text-[20px] leading-none">×</button>
        </div>
        <div className="px-4 py-3 border-b border-line">
          <input value={q} onChange={(e) => setQ(e.target.value)}
                 placeholder="Search by name, phone, or unit #"
                 autoFocus
                 className="w-full border border-line rounded-[10px] px-3 py-2 bg-paper text-[14px]" />
          <div className="mt-2 text-[11.5px] text-muted">
            Pick anyone in the volunteer directory. They'll appear in the dispatcher roster
            immediately — no shift needed. You can assign a shift later in the Shifts panel.
          </div>
          {addErr && (
            <div className="mt-2 rounded-[8px] border border-clay/40 bg-clay-soft/50 text-clay px-2.5 py-1.5 text-[12px] font-semibold">
              {addErr}
            </div>
          )}
        </div>
        <div className="flex-1 overflow-y-auto">
          {cand.isLoading && <div className="p-4 text-[13px] text-muted">Loading…</div>}
          {!cand.isLoading && rows.length === 0 && (
            <div className="p-6 text-center text-[13px] text-muted italic">
              {q ? `No matches for "${q}".` : 'No volunteers available to add.'}
            </div>
          )}
          <ul className="divide-y divide-line">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <div className="font-bold text-[14px] text-ink flex items-center gap-2 flex-wrap">
                    <span><Name first={r.firstName} last={r.lastName} /></span>
                    {r.unitNumber != null && (
                      <span className="text-muted font-semibold text-[11.5px]">#{r.unitNumber}</span>
                    )}
                  </div>
                  <div className="text-[12px] text-muted truncate">
                    {r.phone ? displayPhone(r.phone) : 'no phone'}{r.email ? ` · ${r.email}` : ''}
                  </div>
                </div>
                <button onClick={() => add.mutate(r.id)}
                        disabled={add.isPending}
                        className="haptic text-[12px] font-bold bg-forest text-paper px-3 py-1.5 rounded-[8px] shadow-ctag disabled:opacity-50">
                  {add.isPending && add.variables === r.id ? 'Adding…' : 'Add'}
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="px-4 py-2.5 border-t border-line flex justify-end">
          <button onClick={onClose}
                  className="haptic text-[12.5px] font-bold text-muted hover:text-ink px-3 py-1.5 rounded-[8px]">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function DispatcherCard({
  row, onRemove, busy,
}: {
  row: DispatcherRosterRow;
  onRemove: (id: number, name: string) => void;
  busy: boolean;
}) {
  const shift = row.currentShift ?? row.nextShift;
  const isNow = row.currentShift != null;
  // Oct 5 client: invite this person to the portal right from the roster.
  // Oct 5: a volunteer-app login is NOT a portal login — they get a separate one.
  const [inviting, setInviting] = useState(false);
  const [editing, setEditing] = useState(false);
  const pl = row.portalLogin ?? null;
  const plStatus = portalLoginStatus(pl);
  return (
    <div className="rounded-[12px] border border-line bg-paper px-3 py-2.5">
      {inviting && <InviteStaffModal onClose={() => setInviting(false)}
                                     prefill={{ firstName: row.firstName, lastName: row.lastName, phone: row.phone, email: (row as any).email ?? null, hasVolunteerLogin: row.userId != null,
                                                volunteerId: row.id /* Oct 29 client: one login - upgrade his own login */ }} />}
      {editing && pl && <AccessModal onClose={() => setEditing(false)}
                                     user={{ id: pl.id, firstName: row.firstName, lastName: row.lastName, phone: row.phone, username: pl.username,
                                             role: pl.role, accessSections: pl.accessSections, invitePending: !!(pl.invitePending || pl.inviteExpired),
                                             driverLogin: row.userId != null && Number(row.userId) === Number(pl.id) /* Oct 29 client: one login */ }} />}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-bold text-[14px] text-ink flex items-center gap-2 flex-wrap">
            <span className="truncate"><Name first={row.firstName} last={row.lastName} /></span>
            {isNow && (
              <span className="inline-flex items-center gap-1 text-[10.5px] font-extrabold uppercase tracking-[.05em] text-forest bg-sage/60 rounded-full px-2 py-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-forest animate-pulse"></span>
                On shift
              </span>
            )}
          </div>
          <div className="text-[12px] text-muted mt-0.5">
            {row.phone ? displayPhone(row.phone) : 'no phone'}{pl?.username ? ` · username ${pl.username}` : ''}
          </div>
          <div className={cx('mt-1 inline-block text-[10.5px] font-bold rounded-full px-2 py-0.5',
                             plStatus.tone === 'ok' ? 'text-forest bg-sage/60' : plStatus.tone === 'wait' ? 'text-[#9a7415] bg-amber-soft' :
                             plStatus.tone === 'bad' ? 'text-clay bg-clay/10' : 'text-muted bg-line/60')}>
            {plStatus.text}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {pl
            ? <button onClick={() => setEditing(true)}
                      className="haptic text-forest text-[11px] font-bold px-2.5 py-1 rounded-[8px] border border-forest/40 hover:bg-sage/60">
                {pl.invitePending || pl.inviteExpired ? 'Edit / resend' : 'Edit login'}
              </button>
            : <button onClick={() => setInviting(true)} data-testid="make-dispatcher"
                      className="haptic text-forest text-[11px] font-bold px-2.5 py-1 rounded-[8px] border border-forest/40 hover:bg-sage/60">
                {row.userId != null ? 'Turn on dispatcher (same login)' : 'Create portal login'}{/* Oct 29 client: one login */}
              </button>}
          <button onClick={() => onRemove(row.id, `${row.firstName} ${row.lastName}`)}
                  disabled={busy}
                  className="haptic px-2 py-1 text-[12.5px] font-bold text-clay hover:underline disabled:opacity-50">
            Remove
          </button>
        </div>
      </div>
      {shift && (
        <div className="mt-2 rounded-[8px] bg-sage-soft/40 border border-sage-line/60 px-2.5 py-1.5">
          <div className="text-[10.5px] font-extrabold uppercase tracking-[.05em] text-forest-deep">
            {isNow ? 'Current shift' : 'Next up'}
          </div>
          <div className="text-[12.5px] text-ink font-semibold">{fmtShiftWindow(shift)}</div>
          {shift.notes && (
            <div className="text-[12px] text-muted italic mt-0.5">{shift.notes}</div>
          )}
        </div>
      )}
      <DispatcherSettingsBox volunteerId={row.id} first={row.firstName} />{/* Nov 5 client */}
    </div>
  );
}

export function DispatchersRosterPanel() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['dispatcher-roster'],
    queryFn: () => dispatchers.list(),
    refetchInterval: 60_000,
  });
  const [showAdd, setShowAdd] = useState(false);
  // tier2 Aug 21 — surface the remove-dispatcher failure instead of silently
  // swallowing it. Previous version had no onError, so a 403/500 looked
  // identical to a success.
  const [mutErr, setMutErr] = useState<string | null>(null);
  const del = useMutation({
    mutationFn: (id: number) => dispatchers.remove(id),
    onSuccess: () => {
      setMutErr(null);
      qc.invalidateQueries({ queryKey: ['dispatcher-roster'] });
      qc.invalidateQueries({ queryKey: ['dispatcher-candidates'] });
    },
    onError: (e: Error) => setMutErr(`Remove failed: ${e.message}`),
  });

  const rows: DispatcherRosterRow[] = q.data?.data ?? [];
  const assigned = rows.filter((r) => r.currentShift != null || r.nextShift != null);
  // Nov 5 client: On Deck = only people who can really dispatch (a dispatcher / office login: canDispatch). The ones
  // who only ticked "Dispatcher" under Helps with go in a small folded list (nobody's data is changed).
  const free     = rows.filter((r) => r.currentShift == null && r.nextShift == null);
  const onDeck   = free.filter((r) => r.canDispatch !== false);
  const noLogin  = free.filter((r) => r.canDispatch === false);

  const remove = (id: number, name: string) => {
    void uiConfirm(`Remove ${name} from the dispatcher roster?\n\nAny scheduled shifts stay on the calendar — this only takes them off the list. If their own app login is a dispatcher login, it goes back to a driver login (same username and password).`).then((ok) => { if (ok) {
      del.mutate(id);
    } });
  };

  // Oct 5 client: invite a login (with access level) right from the roster.
  const [invitingFromRoster, setInvitingFromRoster] = useState(false);
  return (
    <div className="space-y-4">
      {invitingFromRoster && <InviteStaffModal onClose={() => setInvitingFromRoster(false)} />}
      <div className="rounded-[12px] border border-line bg-sage-soft/40 px-3 py-2 flex items-start justify-between gap-3 flex-wrap">
        <div className="text-[12.5px] text-forest-deep min-w-0 flex-1">
          <b>Dispatcher roster.</b> Anyone here is available to dispatch, whether or not
          they have a shift right now. Add someone the moment they say they can help;
          scheduling their shift is a separate step in the <b>Shifts</b> panel.
        </div>
        <button onClick={() => setInvitingFromRoster(true)}
                className="haptic text-[13px] font-bold border border-forest text-forest px-4 py-2 rounded-[10px] whitespace-nowrap mr-2">
          + Invite someone (login)
        </button>
        <button onClick={() => setShowAdd(true)}
                className="haptic text-[13px] font-bold bg-forest text-paper px-4 py-2 rounded-[10px] shadow-ctag whitespace-nowrap">
          + Add Dispatcher
        </button>
      </div>
      <DispatcherTextsEditor />{/* Nov 5 client: the reminder / thank-you texts */}

      {q.isLoading && <div className="text-[13px] text-muted">Loading…</div>}
      {q.error != null && (
        <div className="text-clay text-[13px]">Failed to load roster: {(q.error as Error).message}</div>
      )}
      {mutErr && (
        <div className="rounded-[10px] border border-clay/40 bg-clay-soft/50 text-clay px-3 py-2 text-[12.5px] font-semibold flex items-start justify-between gap-2">
          <span>{mutErr}</span>
          <button onClick={() => setMutErr(null)} className="haptic text-clay/70 hover:text-clay text-[16px] leading-none">×</button>
        </div>
      )}

      {!q.isLoading && rows.length === 0 && (
        <div className="rounded-[12px] border border-line bg-cream/40 px-4 py-8 text-center text-muted text-[13px] italic">
          No dispatchers on the roster yet. Click <b>+ Add Dispatcher</b> to add one.
        </div>
      )}

      {!q.isLoading && rows.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <section>
            <div className="flex items-baseline justify-between mb-1.5 border-b-2 border-forest/20 pb-1">
              <h3 className="font-display font-bold text-[15px] text-forest">Assigned</h3>
              <span className="text-[11.5px] text-muted font-semibold">{assigned.length}</span>
            </div>
            {assigned.length === 0 ? (
              <div className="text-[12.5px] text-muted italic px-1 py-2">
                No one has a shift scheduled yet.
              </div>
            ) : (
              <div className="space-y-2">
                {assigned.map((r) => (
                  <DispatcherCard key={r.id} row={r} onRemove={remove}
                                  busy={del.isPending && del.variables === r.id} />
                ))}
              </div>
            )}
          </section>

          <section>
            <div className="flex items-baseline justify-between mb-1.5 border-b-2 border-line pb-1">
              <h3 className="font-display font-bold text-[15px] text-ink">On Deck / Available</h3>
              <span className="text-[11.5px] text-muted font-semibold">{onDeck.length}</span>
            </div>
            {onDeck.length === 0 ? (
              <div className="text-[12.5px] text-muted italic px-1 py-2">
                No one else with a dispatcher login is free right now.
              </div>
            ) : (
              <div className="space-y-2">
                {onDeck.map((r) => (
                  <DispatcherCard key={r.id} row={r} onRemove={remove}
                                  busy={del.isPending && del.variables === r.id} />
                ))}
              </div>
            )}
          </section>
        </div>
      )}
      {!q.isLoading && noLogin.length > 0 && (
        <details className="rounded-[12px] border border-line bg-cream/40" data-roster-no-login>
          <summary className="cursor-pointer select-none px-3 py-2 text-[13px] font-bold text-muted">
            Interested in dispatching — no dispatcher login yet ({noLogin.length})
          </summary>
          <div className="px-3 pb-3 space-y-2">
            <div className="text-[12px] text-muted">They ticked "Dispatcher" but can't dispatch yet. Give them a login to put them On Deck.</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {noLogin.map((r) => (
                <DispatcherCard key={r.id} row={r} onRemove={remove}
                                busy={del.isPending && del.variables === r.id} />
              ))}
            </div>
          </div>
        </details>
      )}

      {showAdd && <AddDispatcherModal onClose={() => setShowAdd(false)} />}
    </div>
  );
}

/**
 * Fork R (client Aug 7) — Dispatcher management page. One row per user with
 * a staff-level role, showing:
 *   • name, email, role
 *   • phone (from user OR linked volunteer)
 *   • SMS-dispatcher checkbox (toggles sms_notification_prefs)
 *   • last seen (users.last_login_at)
 *   • recent activity (SMS in/out past 7 days for their phone)
 *   • role change dropdown + disable button (writes to zlz.users via /api/admin-users/:id)
 *
 * Data: GET /api/admin/dispatchers returns the joined roster.
 */
export function DispatchersPanel() {
  const qc = useQueryClient();
  // tier2 Aug 21 — every mutation on this panel was silently swallowing failures
  // (server 4xx/5xx would just do nothing to the UI). Surface them via a local
  // banner so the coordinator sees a "role change failed" instead of assuming
  // the click worked and moving on.
  const [mutErr, setMutErr] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['admin-dispatchers'], queryFn: () => adminDispatchers.list(), refetchInterval: 60_000 });
  const toggleSms = useMutation({
    mutationFn: async ({ phone, enable }: { phone: string; enable: boolean }) => {
      if (enable) return smsDispatchers.add({ phone, label: null });
      return smsDispatchers.remove(phone);
    },
    onSuccess: () => { setMutErr(null); qc.invalidateQueries({ queryKey: ['admin-dispatchers'] }); },
    onError: (e: Error) => setMutErr(`SMS access toggle failed: ${e.message}`),
  });
  const patchRole = useMutation({
    mutationFn: ({ id, role }: { id: number; role: string }) =>
      api<{ data: any }>(`/api/admin-users/${id}`, { method: 'PATCH', body: JSON.stringify({ role }) }),
    onSuccess: () => { setMutErr(null); qc.invalidateQueries({ queryKey: ['admin-dispatchers'] }); },
    onError: (e: Error) => setMutErr(`Role change failed: ${e.message}`),
  });
  const disable = useMutation({
    mutationFn: (id: number) => api<{ data: any }>(`/api/admin-users/${id}`, { method: 'DELETE' }),
    onSuccess: () => { setMutErr(null); qc.invalidateQueries({ queryKey: ['admin-dispatchers'] }); },
    onError: (e: Error) => setMutErr(`Disable failed: ${e.message}`),
  });

  const rows: AdminDispatcher[] = q.data?.data ?? [];
  // Oct 2 client: invite + per-login access levels.
  const [inviting, setInviting] = useState(false);
  const [accessFor, setAccessFor] = useState<any | null>(null);
  const fmtLast = (iso: string | null) => {
    if (!iso) return 'never';
    return whenAt(iso) || 'never'; // Oct 23 client: one date + time format
  };
  return (
    <div className="space-y-3">
      <div className="rounded-[12px] border border-line bg-sage-soft/40 px-3 py-2">
        <div className="text-[12.5px] text-forest-deep">
          <b>Dispatchers</b> — every user with staff-level access. Toggle <b>SMS access</b> to control
          who receives inbound driver replies and can send <code>*NN &lt;msg&gt;</code> replies. Role change writes to
          the users table.
        </div>
      </div>
      <div className="flex justify-end">
        <button onClick={() => setInviting(true)}
                className="haptic rounded-[10px] bg-forest px-4 py-2 text-[13px] font-bold text-paper shadow-ctag hover:brightness-110">
          + Invite someone
        </button>
      </div>
      {inviting && <InviteStaffModal onClose={() => setInviting(false)} />}
      {accessFor && <AccessModal user={accessFor} onClose={() => setAccessFor(null)} />}
      {q.isLoading && <div className="text-[13px] text-muted">Loading…</div>}
      {!q.isLoading && rows.length === 0 && (
        <div className="text-[13px] text-muted italic">No staff users yet.</div>
      )}
      {mutErr && (
        <div className="rounded-[10px] border border-clay/40 bg-clay-soft/50 text-clay px-3 py-2 text-[12.5px] font-semibold flex items-start justify-between gap-2">
          <span>{mutErr}</span>
          <button onClick={() => setMutErr(null)} className="haptic text-clay/70 hover:text-clay text-[16px] leading-none">×</button>
        </div>
      )}
      <div className="overflow-x-auto">
      <table className="min-w-full text-[13px]">
        <thead>
          <tr className="text-left text-[11px] font-extrabold uppercase tracking-[.05em] text-muted border-b border-line">
            <th className="py-2 pr-3">Name</th>
            <th className="py-2 pr-3">Email</th>
            <th className="py-2 pr-3">Role</th>
            <th className="py-2 pr-3">Phone</th>
            <th className="py-2 pr-3">SMS access</th>
            <th className="py-2 pr-3">Last seen</th>
            <th className="py-2 pr-3">Past 7d (in / out)</th>
            <th className="py-2 pr-3">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => (
            <tr key={d.id} className={cx('border-b border-line/60', !d.isActive && 'opacity-50')}>
              <td className="py-2 pr-3 font-bold">
                {d.firstName} {d.lastName}
                {(d as any).invitePending && <span className="ml-1.5 text-[10.5px] font-bold bg-amber-soft text-[#9a7415] px-1.5 py-0.5 rounded-full">invite pending</span>}
                <div className="text-[11px] font-normal text-muted">
                  {(d as any).accessSections ? `Access: ${((d as any).accessSections as string[]).map((k) => ACCESS_SECTIONS.find((x) => x.key === k)?.label ?? k).join(', ')}` : 'Access: standard for role'}
                </div>
              </td>
              <td className="py-2 pr-3 text-muted">{d.email ?? '—'}</td>
              <td className="py-2 pr-3">
                <select value={d.role} onChange={(e) => patchRole.mutate({ id: d.id, role: e.target.value })}
                        className="border border-line rounded-[6px] px-1.5 py-0.5 bg-paper text-[12px]">
                  <option value="admin">admin</option>
                  <option value="coordinator">coordinator</option>
                  <option value="staff">staff</option>
                  <option value="dispatcher">dispatcher</option>
                </select>
              </td>
              <td className="py-2 pr-3 text-muted">{d.phone ? displayPhone(d.phone) : '—'}</td>
              <td className="py-2 pr-3">
                <input type="checkbox" checked={d.smsDispatcher}
                       disabled={!d.phone || toggleSms.isPending}
                       onChange={(e) => d.phone && toggleSms.mutate({ phone: d.phone, enable: e.target.checked })}
                       className="accent-forest h-4 w-4" />
              </td>
              <td className="py-2 pr-3 text-muted">{fmtLast(d.lastLoginAt)}</td>
              <td className="py-2 pr-3 text-muted">{d.inLast7} / {d.outLast7}</td>
              <td className="py-2 pr-3">
                <button onClick={() => setAccessFor(d)}
                        className="haptic text-forest text-[11px] font-bold px-2 py-1 rounded-[6px] hover:bg-sage mr-1">
                  Access
                </button>
                {d.isActive ? (
                  <button onClick={() => { void uiConfirm(`Disable ${d.firstName} ${d.lastName}?`).then((ok) => { if (ok) { disable.mutate(d.id); } }); }}
                          className="haptic text-clay text-[11px] font-bold px-2 py-1 rounded-[6px] hover:bg-clay/10">
                    Disable
                  </button>
                ) : (
                  <span className="text-[11px] text-muted italic">disabled</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}

/**
 * xyz122 — /admin/test-broadcasts page.
 * Read-only list of the last 20 simulated broadcasts (created by ticking
 * the "🧪 Test pickup" checkbox on the QuickPickupModal). Shows the pickup
 * ref #, the recipient count that WOULD have been texted, the intended
 * SMS body, and when it happened.
 */
export function TestBroadcastsPage() {
  const q = useQuery({
    queryKey: ['test-broadcasts'],
    queryFn: testBroadcasts.list,
    refetchInterval: 15_000,
  });
  const rows: TestBroadcastRow[] = q.data?.data ?? [];
  return (
    <div className="p-6 max-w-[880px] mx-auto">
      <div className="flex items-center gap-3 mb-1">
        <span className="text-[22px]">🧪</span>
        <h1 className="font-display font-bold text-[22px] text-ink">Test broadcasts</h1>
      </div>
      <p className="text-[13px] text-muted mb-5">
        Every pickup created with the <b>Test pickup</b> checkbox lands here. Real drivers
        never got these messages — this is what the SMS body <em>would have</em> looked like,
        and how many people it would have reached.
      </p>
      {q.isLoading && <div className="text-muted text-[13px]">Loading…</div>}
      {q.error != null && <div className="text-clay text-[13px]">Failed to load: {(q.error as Error).message}</div>}
      {!q.isLoading && rows.length === 0 && (
        <div className="rounded-[12px] border border-line bg-cream/40 px-4 py-6 text-center text-muted text-[13px]">
          No test broadcasts yet. Create a pickup with the <b>🧪 Test pickup</b> checkbox to see it here.
        </div>
      )}
      <div className="space-y-3">
        {rows.map((r) => (
          <div key={r.id} className="rounded-[12px] border border-line bg-paper p-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[12.5px] text-muted">
                  {/* Oct 22 client: by name / address, never the pickup number */}
                  <span className="font-bold text-ink">{r.donor_name ? <Name>{r.donor_name}</Name> : null}{r.donor_name && r.pickup_address ? ' · ' : ''}{shortAddress(r.pickup_address)}{!r.donor_name && !r.pickup_address ? 'Pickup' : ''}</span>
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-[11px] uppercase tracking-wider text-muted font-bold">Would go to</div>
                <div className="font-display font-bold text-[18px] text-forest">{r.would_have_gone_to}</div>
              </div>
            </div>
            <pre className="mt-2 rounded-[8px] bg-cream border border-line px-3 py-2 text-[12.5px] whitespace-pre-wrap font-mono text-ink">{r.body}</pre>
            <div className="mt-1.5 text-[11px] text-muted">{fmtDateTimeEastern(r.created_at)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Sep 15 client #2 — WhatsApp Threads: mirror of SMS Threads reading from
// wa_bridge_inbound + wa_bridge_outbound. Each thread shows in/out counts,
// bridge send status (queued/claimed/sent/failed) so ops can see whether
// a WA message actually left the tablet or is stuck.
export function WaThreadsPanel() {
  const [openPhone, setOpenPhone] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const q = useQuery({
    queryKey: ['wa-threads'],
    queryFn: () => waThreads.list(),
    refetchInterval: 30_000, // Nov 3 client: speed (was 20 s)
    refetchOnWindowFocus: true,
  });
  const rows = q.data?.data ?? [];
  const filtered = useMemo(() => {
    const s = query.trim().toLowerCase();
    if (!s) return rows;
    const digits = s.replace(/\D/g, '');
    return rows.filter((r) => {
      const name = `${r.first_name ?? ''} ${r.last_name ?? ''}`.toLowerCase();
      if (name.includes(s)) return true;
      if (digits && r.phone.includes(digits)) return true;
      if (String(r.unit_number ?? '').includes(s)) return true;
      if ((r.last_body ?? '').toLowerCase().includes(s)) return true;
      return false;
    });
  }, [rows, query]);
  return (
    <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-3 h-[calc(100vh-220px)] min-h-[400px]">
      <div className="rounded-[14px] border border-line bg-paper overflow-hidden flex flex-col min-h-0">
        <div className="px-3 py-2 border-b border-line/70 shrink-0 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[11.5px] font-extrabold uppercase tracking-wider text-muted">
              WhatsApp threads {filtered.length ? `· ${filtered.length}${query ? ` of ${rows.length}` : ''}` : ''}
            </div>
            {rows.some((r) => r.failed_count > 0) && (
              <span className="bg-clay text-paper px-1.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-normal">
                {rows.reduce((n, r) => n + Number(r.failed_count ?? 0), 0)} failed
              </span>
            )}
          </div>
          <div className="text-[11.5px] text-forest-deep bg-sage-soft/50 rounded-[8px] px-2 py-1"> {/* Oct 28 client */}
            WhatsApp now also shows in <b>Messaging → Driver messages</b>, together with texts. This page shows the WhatsApp phone's send status.
          </div>
          <input value={query} onChange={(e) => setQuery(e.target.value)}
                 placeholder="Search name or phone…"
                 className="w-full border border-line rounded-[8px] px-2 py-1 text-[13px] bg-cream/30" />
        </div>
        <div className="flex-1 overflow-y-auto">
          {q.isLoading && <div className="p-3 text-[12.5px] text-muted italic">Loading…</div>}
          {!q.isLoading && filtered.length === 0 && (
            <div className="p-3 text-[12.5px] text-muted italic">No WhatsApp conversations yet.</div>
          )}
          {filtered.map((r: WaThreadRow) => {
            const nm = [r.first_name, r.last_name].filter(Boolean).join(' ').trim();
            const isOpen = openPhone === r.phone;
            const arrow = r.last_direction === 'out' ? '↑' : '↓';
            const statusColor = r.last_direction === 'out' && r.last_status === 'failed' ? 'text-clay'
              : r.last_direction === 'out' && r.last_status === 'sent'   ? 'text-forest'
              : r.last_direction === 'out' && r.last_status === 'queued' ? 'text-amber-700'
              : 'text-muted';
            return (
              <button key={r.phone} onClick={() => setOpenPhone(r.phone)}
                      className={cx('w-full text-left px-3 py-2 border-b border-line/50 hover:bg-cream/50 flex items-start gap-2',
                        isOpen ? 'bg-sage/30' : '')}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-[13px] text-ink truncate">{nm ? <Name>{nm}</Name> : displayPhone(r.phone)}</span>
                    {r.failed_count > 0 && <span className="text-clay text-[10px] font-bold">✗{r.failed_count}</span>}
                  </div>
                  <div className={cx('text-[11.5px] truncate', statusColor)}>
                    {arrow} {r.last_body ?? '(no body)'}
                    {r.last_direction === 'out' && r.last_status && ` · ${r.last_status}`}
                  </div>
                </div>
                <div className="shrink-0 text-[10.5px] text-muted whitespace-nowrap">
                  {msgWhen(r.last_at)}
                </div>
              </button>
            );
          })}
        </div>
      </div>
      <div className="rounded-[14px] border border-line bg-paper overflow-hidden flex flex-col min-h-0">
        {openPhone
          ? <WaThreadDetail phone={openPhone} />
          : <div className="flex-1 flex items-center justify-center text-[12.5px] text-muted italic">Pick a conversation on the left.</div>}
      </div>
    </div>
  );
}

function WaThreadDetail({ phone }: { phone: string }) {
  const [text, setText] = useState('');
  const [msg, setMsg]   = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['wa-thread', phone],
    queryFn:  () => waThreads.get(phone),
    refetchInterval: 30_000, // Nov 3 client: speed (was 15 s)
  });
  // Oct 23 client: late at night "Send now, or schedule it?" (late-night.tsx).
  const sendMut = useNightSend({
    send: (c: boolean) => waBridge.send({ phone, text: text.trim(), ...(c ? { confirmNight: true } : {}) }),
    schedule: (iso: string) => personalSched.create({ kind: 'wa', phone, text: text.trim() }, iso),
    onScheduled: () => { setMsg(null); setText(''); refreshScheduled(qc); }, // the ⏰ line shows below
    onSent: (r) => {
      setMsg({ tone: 'ok', text: `Queued as bridge id #${r.id}. Watch the tablet.` });
      setText('');
      qc.invalidateQueries({ queryKey: ['wa-thread', phone] });
      qc.invalidateQueries({ queryKey: ['wa-threads'] });
    },
    onError: (err: any) => setMsg({ tone: 'err', text: err?.message || 'Send failed' }),
  });
  const d = q.data?.data;
  const nm = d?.volunteer ? `${d.volunteer.first_name} ${d.volunteer.last_name}`.trim() : displayPhone(phone);
  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-4 py-2 border-b border-line flex items-center justify-between shrink-0">
        <div>
          <div className="font-bold text-[14px] text-ink"><Name>{nm}</Name></div>
          <div className="text-[11.5px] text-muted">{displayPhone(phone)}</div>
        </div>
        <div className="text-[11px] text-muted">{d?.messages.length ?? 0} messages</div>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5">
        {q.isLoading && <div className="text-[12.5px] text-muted italic">Loading…</div>}
        {d?.messages.map((m) => (
          <div key={`${m.direction}-${m.id}`} className={cx('max-w-[85%] rounded-[12px] px-3 py-1.5 text-[13px]',
            m.direction === 'in' ? 'bg-sage/30 text-ink' : 'ml-auto bg-forest text-paper')}>
            <div className="whitespace-pre-wrap break-words">{m.body || <span className="italic opacity-60">(no text)</span>}</div>
            <div className={cx('text-[10.5px] mt-0.5 flex items-center gap-1.5',
              m.direction === 'in' ? 'text-muted' : 'text-paper/70')}>
              <span>{msgWhen(m.created_at)}</span>
              {m.direction === 'out' && m.status && (
                <span className={cx('font-bold',
                  m.status === 'failed' ? 'text-clay' :
                  m.status === 'sent'   ? 'text-cream' :
                  m.status === 'queued' ? 'text-amber-200' : '')}>
                  · {m.status}
                </span>
              )}
              {m.direction === 'out' && m.error && <span className="text-clay">· {m.error}</span>}
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-line px-3 py-2 shrink-0 space-y-2">
        <div className="flex items-end gap-2">
          <textarea value={text} onChange={(e) => setText(e.target.value)}
                    placeholder="Reply via WhatsApp bridge…"
                    rows={2}
                    className="flex-1 border border-line rounded-[8px] px-2 py-1.5 text-[13px] bg-paper resize-none" />
          <button onClick={() => { setMsg(null); void sendMut.start(); }}
                  disabled={!text.trim() || sendMut.busy}
                  className="haptic bg-forest text-paper font-bold text-[13px] rounded-[8px] px-4 py-2 disabled:opacity-40">
            {sendMut.busy ? 'Sending…' : 'Send'}
          </button>
        </div>
        <ScheduledTexts filter={{ phone }} />
        {sendMut.prompt}
        {msg && (
          <div className={cx('text-[11.5px] font-bold',
            msg.tone === 'ok' ? 'text-forest' : 'text-clay')}>{msg.text}</div>
        )}
      </div>
    </div>
  );
}


// Sep 15 client #3b: read-only Hebcal viewer showing every Shabbos + Yom Tov
// window over a date range. Admin edit/override is a follow-up.
export function JewishCalendarPanel() {
  const nowY = new Date().toISOString().slice(0, 4);
  const [fromDate, setFromDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [toDate,   setToDate]   = useState<string>(new Date(Date.now() + 180 * 86_400_000).toISOString().slice(0, 10));
  const q = useQuery({
    queryKey: ['jewish-calendar', fromDate, toDate],
    queryFn:  () => jewishCalendar.list(fromDate, toDate),
  });
  const blocks: HebcalBlock[] = q.data?.data?.blocks ?? [];
  const yt = blocks.filter((b) => b.kind === 'yom_tov');
  const sh = blocks.filter((b) => b.kind === 'shabbos');
  return (
    <div className="space-y-3">
      <div className="rounded-[14px] border border-line bg-paper p-4 space-y-2">
        <div className="font-display font-bold text-[15px] text-forest">Jewish calendar</div>
        <div className="text-[12.5px] text-muted">
          Computed live from <b>@hebcal/core</b> ({q.data?.data?.location ?? 'Monsey, NY'}). Same library used by thedailysicha.
          Admin edit + override + audit log is a follow-up; today this is read-only.
        </div>
        <div className="flex items-center gap-2 text-[13px] flex-wrap">
          <label className="flex items-center gap-1.5">From <DateInput value={fromDate} onChange={setFromDate} className="border border-line rounded-[6px] px-2 py-1" /></label>
          <label className="flex items-center gap-1.5">To <DateInput value={toDate} onChange={setToDate} className="border border-line rounded-[6px] px-2 py-1" /></label>
          <span className="text-muted text-[11.5px]">· {blocks.length} windows ({yt.length} Yom Tov, {sh.length} Shabbos)</span>
        </div>
      </div>
      <div className="rounded-[14px] border border-line bg-paper overflow-hidden">
        <table className="w-full text-[12.5px]">
          <thead className="bg-cream/60 uppercase tracking-wider text-[10.5px] font-extrabold text-muted">
            <tr>
              <th className="text-left px-3 py-1.5">Kind</th>
              <th className="text-left px-3 py-1.5">Name</th>
              <th className="text-left px-3 py-1.5">Starts (NY)</th>
              <th className="text-left px-3 py-1.5">Ends (NY)</th>
            </tr>
          </thead>
          <tbody>
            {q.isLoading && <tr><td colSpan={4} className="p-4 text-center italic text-muted">Loading…</td></tr>}
            {blocks.map((b, i) => (
              <tr key={i} className={cx('border-t border-line/50', b.kind === 'yom_tov' ? 'bg-clay/5' : '')}>
                <td className="px-3 py-1.5 font-bold">
                  {b.kind === 'yom_tov' ? <span className="text-clay">Yom Tov</span> : <span className="text-forest">Shabbos</span>}
                </td>
                <td className="px-3 py-1.5 text-ink">{b.name}</td>
                <td className="px-3 py-1.5 whitespace-nowrap text-muted">{b.startNyLocal}</td>
                <td className="px-3 py-1.5 whitespace-nowrap text-muted">{b.endNyLocal}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {nowY && <div className="text-[11px] text-muted italic">Location: Monsey, NY. Candle-lighting -18 min before sundown; havdala 50 min after.</div>}
    </div>
  );
}

// Oct 27 client: days with no steady driver (incl. covered only this week) go on the "steady pickups needed" flyer.
const FLYER_STATUSES = new Set(['needs_steady_driver', 'temporarily_covered']);
