/**
 * Coordinator-portal sections: Suppliers add/edit, Volunteers add/edit,
 * Steady Pickups, Sign-In sheet, Settings. Each is a self-contained panel
 * the portal renders in the right pane based on the active tab.
 *
 * All endpoints already existed in the volunteer-portal API — these panels
 * are pure UI wrappers around them, themed to the rescue-app design.
 */
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, X, Pencil, Trash2, Check, Eye } from 'lucide-react';
import { adminCRUD, api, canWrite, getUser, shifts as shiftsApi, volunteerGroups, type VolunteerGroup } from './api';
// Cached at module scope — role doesn't change during a session, and reading
// from every panel on every render churns for no reason.
const readOnly = !canWrite(getUser()?.role);
import { fmtTime } from './time-format';
import { Button, cx } from './design';
import { ContactRecruitingHistory, GiftsHistory } from './crm-sections';
import { AccountLoginSection } from './account-login-section';
import { NotificationsPanel } from './notifications-panel';
import { AdminUsersPanel } from './admin-users-panel';
import { AddressAutocomplete } from './address-autocomplete';
import { broadcast, kioskDevice, kioskSettings, pickupAlerts, portalReload, smsInbox, smsThreads, smsDispatchers, adminDispatchers, centerHelp, CENTER_HELP_TASK_LABELS, type CenterHelpTaskType, type CenterHelpTemplate, type CenterHelpInstance, type NotificationType, type PickupAlertRecipient, type SmsThreadRow, type SmsDispatcher, type AdminDispatcher } from './api';
import { useNavigate } from 'react-router-dom';
import { Send, Megaphone, Bell, MessageSquare, Phone } from 'lucide-react';
import { ChatThread } from './chat-thread';

// =============================== Field helpers ==============================

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <label className={cx('block', full && 'col-span-2')}>
      <span className="text-[10.5px] font-extrabold uppercase tracking-[.05em] text-muted">{label}</span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}
const inputCls = 'w-full rounded-[10px] border-[1.4px] border-line-2 bg-paper px-3 py-2.5 text-[13.5px] focus:border-forest focus:ring-2 focus:ring-forest/15 outline-none';

// =============================== Modal ======================================

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  // z-index must clear Leaflet's panes (200–700) and control container (~800)
  // so the edit dialog sits ABOVE the coordinator portal map.
  return (
    <div onClick={onClose} className="fixed inset-0 z-[2000] bg-ink/50 flex items-start justify-center pt-16 px-4">
      <div onClick={(e) => e.stopPropagation()} className={cx('relative z-[2001] bg-paper rounded-[18px] shadow-lift border border-line w-full max-h-[80vh] overflow-y-auto', wide ? 'max-w-3xl' : 'max-w-md')}>
        <div className="sticky top-0 bg-paper border-b border-line px-5 py-3 flex items-center justify-between">
          <div className="font-display font-semibold text-[18px]">{title}</div>
          <button onClick={onClose} className="haptic grid h-8 w-8 place-items-center rounded-full hover:bg-cream"><X size={17} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

// =============================== Suppliers ==================================

export function SuppliersPanel({ rows, refetch, openId, onOpenConsumed }: { rows: any[]; refetch: () => void; openId?: number | null; onOpenConsumed?: () => void }) {
  const [editing, setEditing] = useState<any | 'new' | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
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
  return (
    <div className="space-y-3">
      <RegistrationLinkCard kind="supplier" />
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-extrabold uppercase tracking-[.05em] text-muted">{rows.length} donors</div>
        {!readOnly && <Button size="sm" variant="forest" icon={<Plus size={14} />} onClick={() => setEditing('new')}>New supplier</Button>}
      </div>
      <div className="space-y-2">
        {rows.map((s) => (
          <div key={s.id} className="border border-line bg-paper rounded-[14px] px-4 py-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="font-bold text-[13.5px] truncate">{s.name}</div>
              <div className="text-[11px] text-muted truncate">{[s.addressLine1, s.city].filter(Boolean).join(', ')}</div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button onClick={() => setEditing(s)} title={readOnly ? 'View' : 'Edit'}
                      className="haptic grid h-8 w-8 place-items-center rounded-full bg-sage text-forest hover:bg-sage-line">
                <Pencil size={14} />
              </button>
              {!readOnly && (
                <button onClick={() => {
                          if (confirm(`Permanently delete ${s.name}? Linked pickups and steady templates at this supplier will be affected.`)) {
                            setDeleting(s.id); delRow.mutate(s.id);
                          }
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
  const [pickupInstructions, setInstr] = useState(row?.pickupInstructions ?? '');
  const [typicalDonation, setTd] = useState(row?.typicalDonation ?? '');
  const [neighborhoodId, setNb]  = useState<number | null>(row?.neighborhoodId ?? null);
  const neighborhoods = useQuery({ queryKey: ['neighborhoods'], queryFn: adminCRUD.neighborhoods });

  const save = useMutation({
    mutationFn: () => row
      ? adminCRUD.patchSupplier(row.id, { name, contactName, contactPhone, addressLine1, city, pickupInstructions, typicalDonation, neighborhoodId })
      : adminCRUD.createSupplier({ name, contactName, contactPhone, addressLine1, city, pickupInstructions, typicalDonation, neighborhoodId }),
    onSuccess: (res: any) => {
      if (!row && onCreated && res?.data) onCreated(res.data);
      onDone();
    },
  });
  const del = useMutation({ mutationFn: () => adminCRUD.deleteSupplier(row.id), onSuccess: onDone });

  return (
    <Modal title={row ? `Edit ${row.name}` : 'New supplier'} onClose={onCancel}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Name" full><input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} /></Field>
        <Field label="Contact name"><input value={contactName} onChange={(e) => setCN(e.target.value)} className={inputCls} /></Field>
        <Field label="Contact phone"><input value={contactPhone} onChange={(e) => setCP(e.target.value)} className={inputCls} /></Field>
        <Field label="Address" full><AddressAutocomplete value={addressLine1} onChange={setAddr} placeholder="Start typing… suggestions from Google" className={inputCls} /></Field>
        <Field label="City"><input value={city} onChange={(e) => setCity(e.target.value)} className={inputCls} /></Field>
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
        {row ? (
          <button onClick={() => { if (confirm(`Permanently delete ${row.name}? This removes it and any linked pickups/steady templates only at this supplier.`)) del.mutate(); }}
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

type AppStatus = 'new' | 'contacted' | 'approved' | 'assigned';
const APP_STATUS_STYLE: Record<AppStatus, { bg: string; fg: string; label: string }> = {
  new:       { bg: 'bg-line',       fg: 'text-ink',        label: 'New' },
  contacted: { bg: 'bg-amber-soft', fg: 'text-[#9a7415]',  label: 'Contacted' },
  approved:  { bg: 'bg-sage',       fg: 'text-forest',     label: 'Approved' },
  assigned:  { bg: 'bg-sky-soft',   fg: 'text-sky-deep',   label: 'Assigned' },
};

export function VolunteersPanel({ rows, refetch, openId, onOpenConsumed }: { rows: any[]; refetch: () => void; openId?: number | null; onOpenConsumed?: () => void }) {
  const [editing, setEditing] = useState<any | 'new' | null>(null);
  const [viewing, setViewing] = useState<any | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  // §3: sort + application-status filter + bulk select.
  const [sort, setSort] = useState<'submitted_desc' | 'submitted_asc' | 'name'>('submitted_desc');
  const [statusFilter, setStatusFilter] = useState<Set<AppStatus>>(new Set());
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [exporting, setExporting] = useState(false);
  const qc = useQueryClient();
  const patchStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: AppStatus }) => adminCRUD.setApplicationStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-volunteers'] }),
  });
  // Open a specific volunteer's edit modal when the search bar (or any parent)
  // passes an id via openId. Only consume when we actually found the row —
  // otherwise a search click that arrives before rows have loaded would
  // clear the openId and never open the modal.
  useEffect(() => {
    if (openId == null) return;
    const match = rows.find((v: any) => Number(v.id) === Number(openId));
    if (match) {
      setEditing(match);
      onOpenConsumed?.();
    }
  }, [openId, rows]);
  const delRow = useMutation({
    mutationFn: (id: number) => adminCRUD.deleteVolunteer(id),
    onSettled: () => { setDeleting(null); refetch(); },
  });

  // Per-status counts across the loaded set — displayed on the filter chips.
  const counts = useMemo(() => {
    const acc: Record<AppStatus, number> = { new: 0, contacted: 0, approved: 0, assigned: 0 };
    for (const v of rows) {
      const s = (v.applicationStatus ?? 'new') as AppStatus;
      if (s in acc) acc[s]++;
    }
    return { total: rows.length, ...acc };
  }, [rows]);

  // Client-side filter + sort. Server-side would be more scalable but keeps
  // the initial list query stable; office roster is a few hundred rows tops.
  const view = useMemo(() => {
    let out = rows;
    if (statusFilter.size > 0) out = out.filter((v) => statusFilter.has((v.applicationStatus ?? 'new') as AppStatus));
    const submittedMs = (v: any) => new Date(v.intakeReceivedAt ?? v.intakeDate ?? 0).getTime() || 0;
    return [...out].sort((a: any, b: any) => {
      if (sort === 'name') return (a.lastName ?? '').localeCompare(b.lastName ?? '');
      const cmp = submittedMs(b) - submittedMs(a);
      return sort === 'submitted_asc' ? -cmp : cmp;
    });
  }, [rows, statusFilter, sort]);

  function toggleStatus(s: AppStatus) {
    const next = new Set(statusFilter);
    if (next.has(s)) next.delete(s); else next.add(s);
    setStatusFilter(next);
  }
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
      alert('Export failed: ' + (e?.message || 'unknown error'));
    } finally { setExporting(false); }
  }

  return (
    <div className="space-y-3">
      <RegistrationLinkCard kind="volunteer" />
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-[11px] font-extrabold uppercase tracking-[.05em] text-muted">
          {view.length} {view.length === 1 ? 'driver' : 'drivers'}
          {statusFilter.size > 0 && ` (filtered from ${rows.length})`}
        </div>
        <div className="flex items-center gap-2">
          <select value={sort} onChange={(e) => setSort(e.target.value as any)}
                  className="text-[12px] border border-line rounded-[8px] px-2 py-1 bg-paper">
            <option value="submitted_desc">Sort: Newest first</option>
            <option value="submitted_asc">Sort: Oldest first</option>
            <option value="name">Sort: Last name</option>
          </select>
          {!readOnly && <Button size="sm" variant="forest" icon={<Plus size={14} />} onClick={() => setEditing('new')}>New volunteer</Button>}
        </div>
      </div>

      {/* Filter chips + bulk-export bar */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-[12px] border border-line bg-paper px-3 py-2">
        {(['new', 'contacted', 'approved', 'assigned'] as AppStatus[]).map((s) => {
          const on = statusFilter.has(s);
          const style = APP_STATUS_STYLE[s];
          return (
            <button key={s} onClick={() => toggleStatus(s)}
                    className={cx('haptic text-[12px] font-bold px-2.5 py-1 rounded-full border inline-flex items-baseline gap-1.5',
                                  on ? 'bg-forest text-paper border-forest' : `${style.bg} ${style.fg} border-line hover:brightness-95`)}>
              <span>{style.label}</span>
              <span className={cx('text-[10.5px] font-extrabold', on ? 'text-paper/85' : 'opacity-80')}>{counts[s]}</span>
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
      </div>

      <div className="space-y-2">
        {view.map((v) => {
          const s = (v.applicationStatus ?? 'new') as AppStatus;
          const style = APP_STATUS_STYLE[s];
          const submitted = v.intakeReceivedAt || v.intakeDate;
          const submittedLabel = submitted ? new Date(submitted).toLocaleDateString('en-US',
            { month: 'short', day: 'numeric', year: 'numeric' }) : null;
          return (
            <div key={v.id} className="border border-line bg-paper rounded-[14px] px-4 py-3 flex items-center justify-between gap-3">
              <label className="grid place-items-center w-6 h-6 cursor-pointer">
                <input type="checkbox" checked={selected.has(v.id)}
                       onChange={() => toggleSelected(v.id)}
                       className="h-4 w-4 accent-forest" />
              </label>
              <div className="min-w-0 flex-1">
                <div className="font-bold text-[13.5px] truncate">
                  {v.firstName} {v.lastName}
                  {v.unitNumber != null && (
                    <span className="ml-1.5 text-muted font-semibold text-[11.5px]">#{v.unitNumber}</span>
                  )}
                </div>
                <div className="text-[11px] text-muted truncate">
                  {v.phonePrimary ?? '—'} {v.locationArea ? `· ${v.locationArea}` : ''}
                  {submittedLabel && ` · applied ${submittedLabel}`}
                </div>
              </div>
              <select value={s}
                      onChange={(e) => patchStatus.mutate({ id: v.id, status: e.target.value as AppStatus })}
                      disabled={readOnly || (patchStatus.isPending && patchStatus.variables?.id === v.id)}
                      className={cx('text-[11.5px] font-bold px-2 py-1 rounded-full border-0 focus:ring-2 focus:ring-forest', style.bg, style.fg)}
                      title="Set follow-up status">
                <option value="new">New</option>
                <option value="contacted">Contacted</option>
                <option value="approved">Approved</option>
                <option value="assigned">Assigned</option>
              </select>
              <div className="flex items-center gap-1.5 shrink-0">
                <button onClick={() => setViewing(v)} title="View full sign-up info"
                        className="haptic grid h-8 w-8 place-items-center rounded-full bg-cream text-ink hover:bg-line">
                  <Eye size={14} />
                </button>
                <button onClick={() => setEditing(v)} title="Edit"
                        className="haptic grid h-8 w-8 place-items-center rounded-full bg-sage text-forest hover:bg-sage-line">
                  <Pencil size={14} />
                </button>
                <button onClick={() => {
                          if (confirm(`Remove ${v.firstName} ${v.lastName} from the roster? Their past pickup history is preserved.`)) {
                            setDeleting(v.id); delRow.mutate(v.id);
                          }
                        }} title="Remove from roster"
                        disabled={deleting === v.id}
                        className="haptic grid h-8 w-8 place-items-center rounded-full bg-clay-soft text-clay hover:bg-clay/20 disabled:opacity-40">
                  <Trash2 size={14} />
                </button>
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
function VolunteerViewModal({ row, onClose }: { row: any; onClose: () => void }) {
  const [tab, setTab] = useState<'info' | 'history'>('info');
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
      const msg = String(e?.message ?? e);
      setUnitMsg(/duplicate|unique/i.test(msg) ? 'Unit # already used' : 'Save failed');
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
  const totals = { completed: 0, missed: 0, assigned: 0, cancelled: 0 };
  for (const r of (history.data?.data ?? [])) {
    const s = String(r.status ?? '').toLowerCase();
    if (s === 'completed' || s === 'delivered') totals.completed++;
    else if (s === 'missed') totals.missed++;
    else if (s === 'cancelled') totals.cancelled++;
    else totals.assigned++;
  }

  return (
    <Modal title={`${row.firstName ?? ''} ${row.lastName ?? ''}${row.unitNumber != null ? ` · #${row.unitNumber}` : ''} — Sign-up info`.trim()} onClose={onClose} wide>
      <div className="flex gap-1.5 mb-3 border-b border-line pb-2">
        {(['info', 'history'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
                  className={cx('haptic text-[12.5px] font-bold px-3 py-1.5 rounded-t-[8px]',
                                tab === t ? 'text-forest border-b-2 border-forest bg-sage/40' : 'text-muted hover:text-ink')}>
            {t === 'info' ? 'Sign-up info' : 'Pickup history'}
          </button>
        ))}
      </div>

      {tab === 'info' ? (
        <>
          <div className="space-y-2 text-[13px]">
            <div className="grid grid-cols-[140px_1fr] gap-3">
              <div className="text-[11.5px] font-bold text-muted">Phone</div>
              <div>{row.phonePrimary ?? '—'}</div>
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
          </div>
          {row.intakePayload
            ? <IntakeInfoCard payload={row.intakePayload} receivedAt={row.intakeReceivedAt} kind="volunteer" />
            : <div className="mt-5 rounded-[14px] border border-line bg-cream/60 px-4 py-3 text-[12.5px] text-muted">
                No sign-up form on file for this volunteer (they were added directly by the office).
              </div>}
        </>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-2 mb-3">
            <div className="rounded-[10px] bg-sage border border-sage-line px-3 py-2 text-center">
              <div className="font-display font-bold text-[20px] text-forest leading-none">{totals.completed}</div>
              <div className="text-[10.5px] font-extrabold uppercase tracking-[.06em] text-forest mt-0.5">Completed</div>
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
              <div className="font-display font-bold text-[20px] text-muted leading-none">{totals.cancelled}</div>
              <div className="text-[10.5px] font-extrabold uppercase tracking-[.06em] text-muted mt-0.5">Cancelled</div>
            </div>
          </div>
          {history.isLoading && <div className="text-[13px] text-muted">Loading…</div>}
          {history.data?.data?.length === 0 && (
            <div className="text-[13px] text-muted italic">No pickups on record.</div>
          )}
          <div className="space-y-1.5 max-h-[420px] overflow-y-auto">
            {(history.data?.data ?? []).map((h: any) => (
              <div key={h.id} className="rounded-[10px] border border-line bg-paper px-3 py-2 text-[12.5px] flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-bold truncate">{h.suppliers || 'One-time pickup'}</div>
                  <div className="text-[11px] text-muted">{h.scheduled_date} @ {String(h.scheduled_time ?? '').slice(0,5)}</div>
                </div>
                <span className="text-[10.5px] font-extrabold uppercase tracking-[.06em] px-2 py-0.5 rounded-full bg-cream text-ink border border-line whitespace-nowrap">
                  {h.status}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="flex justify-end mt-4">
        <Button size="sm" variant="plain" onClick={onClose}>Close</Button>
      </div>
    </Modal>
  );
}

function VolunteerForm({ row, onDone, onCancel }: { row: any | null; onDone: () => void; onCancel: () => void }) {
  const [firstName, setFN]    = useState(row?.firstName ?? '');
  const [lastName, setLN]     = useState(row?.lastName ?? '');
  const [phonePrimary, setPh] = useState(row?.phonePrimary ?? '');
  const [email, setEmail]     = useState(row?.email ?? '');
  const [locationArea, setLA] = useState(row?.locationArea ?? '');
  const [hasCar, setHasCar]   = useState<boolean>(row?.hasCar ?? true);
  const [wantsSteadyPickup, setSteady] = useState<boolean>(row?.wantsSteadyPickup ?? false);
  const [neighborhoodIds, setNbIds] = useState<number[]>(row?.neighborhoodIds ?? []);
  // batch abc800 Aug 9 — per-volunteer SMS quiet hours (NY local).
  const initQS = (row?.smsQuietStart ?? row?.sms_quiet_start ?? '') as string;
  const initQE = (row?.smsQuietEnd   ?? row?.sms_quiet_end   ?? '') as string;
  const [quietStart, setQuietStart] = useState<string>(initQS ? initQS.slice(0, 5) : '');
  const [quietEnd,   setQuietEnd]   = useState<string>(initQE ? initQE.slice(0, 5) : '');
  const neighborhoods = useQuery({ queryKey: ['neighborhoods'], queryFn: adminCRUD.neighborhoods });
  const toggleNb = (id: number) => setNbIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const save = useMutation({
    mutationFn: () => {
      // batch abc811 Aug 10 — restored two-field quiet-hours window
      // (FROM/UNTIL). Wrap around midnight is supported by the SQL gate.
      const smsQuietStart = quietStart ? quietStart : null;
      const smsQuietEnd   = quietEnd   ? quietEnd   : null;
      return row
        ? adminCRUD.patchVolunteer(row.id, { firstName, lastName, phonePrimary, email: email || null, locationArea, hasCar, wantsSteadyPickup, neighborhoodIds, smsQuietStart, smsQuietEnd })
        : adminCRUD.createVolunteer({ firstName, lastName, phonePrimary, email: email || null, locationArea, hasCar, wantsSteadyPickup, neighborhoodIds, smsQuietStart, smsQuietEnd });
    },
    onSuccess: onDone,
  });
  const del = useMutation({ mutationFn: () => adminCRUD.deleteVolunteer(row.id), onSuccess: onDone });

  return (
    <Modal title={row ? `Edit ${row.firstName} ${row.lastName}` : 'New volunteer'} onClose={onCancel}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="First name"><input value={firstName} onChange={(e) => setFN(e.target.value)} className={inputCls} /></Field>
        <Field label="Last name"><input value={lastName} onChange={(e) => setLN(e.target.value)} className={inputCls} /></Field>
        <Field label="Phone"><input value={phonePrimary} onChange={(e) => setPh(e.target.value)} className={inputCls} /></Field>
        <Field label="Email"><input value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} /></Field>
        <Field label="Area (notes)" full><input value={locationArea} onChange={(e) => setLA(e.target.value)} className={inputCls} placeholder="Spring Valley / Monsey / Suffern…" /></Field>
        <Field label="Neighborhoods they can serve" full>
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
            {(neighborhoods.data?.data ?? []).length === 0 && (
              <span className="text-[11px] text-muted">No neighborhoods yet — add them in Settings → Neighborhoods.</span>
            )}
          </div>
        </Field>
        <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={hasCar} onChange={(e) => setHasCar(e.target.checked)} className="accent-forest h-4 w-4" /> Has car</label>
        <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={wantsSteadyPickup} onChange={(e) => setSteady(e.target.checked)} className="accent-forest h-4 w-4" /> Wants steady pickup</label>
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
        {row ? (
          <button onClick={() => { if (confirm(`Hide ${row.firstName} from the roster? (Soft delete)`)) del.mutate(); }}
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

export function SteadyPickupsPanel() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin-steady'], queryFn: adminCRUD.steady });
  const [editing, setEditing] = useState<any | 'new' | null>(null);
  const rows = q.data?.data ?? [];

  return (
    <div className="space-y-3">
      <RegistrationLinkCard kind="steady-pickup" />
      <RegistrationLinkCard kind="one-time-pickup" />
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-extrabold uppercase tracking-[.05em] text-muted">{rows.length} recurring templates</div>
        {!readOnly && <Button size="sm" variant="forest" icon={<Plus size={14} />} onClick={() => setEditing('new')}>New steady pickup</Button>}
      </div>
      {q.isLoading ? <div className="text-[13px] text-muted">Loading…</div> :
       rows.length === 0 ? <div className="text-[13px] text-muted">No steady pickups yet. Create one to generate weekly occurrences.</div> :
       <div className="space-y-2">
         {rows.map((p) => (
           <div key={p.id} className="border border-line bg-paper rounded-[14px] px-4 py-3 flex items-center justify-between gap-3">
             <div className="min-w-0">
               <div className="font-bold text-[13.5px] truncate">{p.name}</div>
               <div className="text-[11px] text-muted truncate">
                 {p.days?.join(', ') ?? '—'} · {fmtTime(p.pickup_time?.slice(0, 5)) || '—'} · {p.suppliers || 'no supplier'}
               </div>
             </div>
             <button onClick={() => setEditing(p)} className="haptic grid h-8 w-8 place-items-center rounded-full bg-sage text-forest hover:bg-sage-line shrink-0"><Pencil size={14} /></button>
           </div>
         ))}
       </div>}
      {editing && <SteadyForm row={editing === 'new' ? null : editing} onDone={() => { setEditing(null); qc.invalidateQueries({ queryKey: ['admin-steady'] }); }} onCancel={() => setEditing(null)} />}
    </div>
  );
}

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
export function SteadyForm({ row, onDone, onCancel }: { row: any | null; onDone: () => void; onCancel: () => void }) {
  const [name, setName] = useState(row?.name ?? '');
  const [pickupTime, setTime] = useState((row?.pickup_time ?? '14:00').slice(0, 5));
  const [days, setDays] = useState<string[]>(row?.days ?? []);
  const [supplierId, setSupplierId] = useState<string>(row?.supplier_id ? String(row.supplier_id) : '');
  // Fork M · client Aug 6 — reminder + unassigned auto-broadcast toggles.
  const [reminderEnabled, setReminderEnabled]         = useState<boolean>(row?.reminder_enabled ?? true);
  const [reminderMinutes, setReminderMinutes]         = useState<number>(row?.reminder_minutes_before ?? 60);
  const [autoBroadcastEnabled, setAutoBroadcastEnabled] = useState<boolean>(row?.auto_broadcast_enabled ?? true);
  const [autoBroadcastMinutes, setAutoBroadcastMinutes] = useState<number>(row?.auto_broadcast_minutes_before ?? 30);
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
  const suppliers = useQuery({ queryKey: ['admin-suppliers'], queryFn: () => api<{ data: any[] }>('/api/suppliers?limit=500') });
  const [showNewSupplier, setShowNewSupplier] = useState(false);

  // Fork J · client Aug 4 — per-day default drivers. Map dow(0-6) → volunteerId ('' = unset).
  const volunteersQ = useQuery({ queryKey: ['admin-volunteers'], queryFn: () => api<{ data: any[] }>('/api/volunteers?limit=500') });
  const existingDefaultsQ = useQuery({
    queryKey: ['steady-default-drivers', row?.id],
    queryFn: () => adminCRUD.steadyDefaultDrivers.list(row!.id),
    enabled: !!row?.id,
  });
  const [defaultDrivers, setDefaultDrivers] = useState<Record<number, string>>({});
  useEffect(() => {
    const map: Record<number, string> = {};
    for (const r of (existingDefaultsQ.data?.data ?? [])) map[r.day_of_week] = String(r.volunteer_id);
    setDefaultDrivers(map);
  }, [existingDefaultsQ.data]);

  function toggleDay(d: string) { setDays((arr) => arr.includes(d) ? arr.filter((x) => x !== d) : [...arr, d]); }

  const save = useMutation({
    mutationFn: async () => {
      // batch abc799 Aug 9 — drivers_needed capacity + multi-driver array.
      const cleanIds = assignedIds.map((v) => Number(v)).filter((n) => Number.isInteger(n) && n > 0);
      const extra = {
        reminderEnabled, reminderMinutesBefore: Number(reminderMinutes),
        autoBroadcastEnabled, autoBroadcastMinutesBefore: Number(autoBroadcastMinutes),
        needsConfirmation, confirmationLeadMinutes: Number(confirmationLead),
        contactName: contactName || null,
        contactPhone: contactPhone || null,
        pickupInstructions: pickupInstr || null,
        driversNeeded: Number(driversNeeded) || 1,
        volunteerIds: cleanIds,
      };
      const savedRes = row
        ? await adminCRUD.patchSteady(row.id, { name, pickupTime, days, supplierId: supplierId ? Number(supplierId) : undefined, ...extra })
        : await adminCRUD.createSteady({ name, pickupTime, days, supplierId: supplierId ? Number(supplierId) : undefined, ...extra });
      const savedId = (savedRes as any)?.data?.id ?? row?.id;
      if (savedId) {
        const assignments = Object.entries(defaultDrivers)
          .filter(([, vid]) => vid !== '')
          .map(([dow, vid]) => ({ dayOfWeek: Number(dow), volunteerId: Number(vid) }));
        await adminCRUD.steadyDefaultDrivers.replace(Number(savedId), assignments);
      }
      return savedRes;
    },
    onSuccess: onDone,
  });
  const del = useMutation({ mutationFn: () => adminCRUD.deleteSteady(row.id), onSuccess: onDone });

  return (
    <Modal title={row ? `Edit ${row.name}` : 'New steady pickup'} onClose={onCancel}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Name" full><input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder='e.g. "Hive Tuesday afternoon"' /></Field>
        <Field label="Pickup time"><input type="time" value={pickupTime} onChange={(e) => setTime(e.target.value)} className={inputCls} /></Field>
        <Field label="Supplier" full>
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
        <Field label="Days of the week" full>
          <div className="flex flex-wrap gap-1.5">
            {DAYS.map((d) => (
              <button key={d} type="button" onClick={() => toggleDay(d)}
                      className={cx('chip', days.includes(d) && 'on')}>
                {d.slice(0, 3).toUpperCase()}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Contact name (goes to driver on accept)">
          <input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Person we can reach"
                 className={inputCls} />
        </Field>
        <Field label="Contact phone (goes to driver on accept)">
          <input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="(845) 555-1234"
                 className={inputCls} />
        </Field>
        <Field label="Pickup instructions / access details (goes to driver on accept)" full>
          <textarea rows={2} value={pickupInstr} onChange={(e) => setPickupInstr(e.target.value)}
                    placeholder='e.g. "Loading dock on the side. Ring the bell twice."'
                    className={inputCls} />
        </Field>
        {/* batch abc799 Aug 9 — drivers_needed + multi-driver assignment. */}
        <Field label="Drivers needed">
          <input type="number" min={1} max={20} value={driversNeeded}
                 onChange={(e) => setDriversNeeded(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
                 className={inputCls + ' w-24 text-center'} />
        </Field>
        <Field label="Assigned drivers (regulars)" full>
          <div className="rounded-[10px] border border-line bg-cream/30 divide-y divide-line">
            {assignedIds.map((vid, idx) => (
              <div key={idx} className="flex items-center gap-2 px-3 py-2">
                <div className="flex-1 min-w-0">
                  <VolunteerPicker
                    volunteers={volunteersQ.data?.data ?? []}
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
            <div className="px-3 py-2">
              <button type="button"
                      onClick={() => setAssignedIds((arr) => [...arr, ''])}
                      className="haptic text-[12px] font-bold text-forest flex items-center gap-1.5">
                <Plus size={13} /> Add another driver
              </button>
            </div>
            <p className="text-[11px] text-muted px-3 py-2 italic">
              Every generated pickup will be pre-assigned to these drivers (status &quot;assigned&quot;). Set Drivers needed above to match how many should be on each occurrence.
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
        <Field label="Auto-broadcast if unassigned" full>
          <div className="rounded-[10px] border border-line bg-cream/30 px-3 py-2">
            <label className="flex items-center gap-2 text-[13px]">
              <input type="checkbox" className="accent-forest h-4 w-4"
                     checked={autoBroadcastEnabled}
                     onChange={(e) => setAutoBroadcastEnabled(e.target.checked)} />
              <span>If no driver is assigned before pickup time, auto-broadcast to the default group</span>
            </label>
            <div className={cx('mt-2 flex items-center gap-2 text-[12.5px]', !autoBroadcastEnabled && 'opacity-40')}>
              <span>Broadcast</span>
              <input type="number" min={0} max={720} step={5} disabled={!autoBroadcastEnabled}
                     value={autoBroadcastMinutes}
                     onChange={(e) => setAutoBroadcastMinutes(Number(e.target.value))}
                     className={inputCls + ' w-24 text-center'} />
              <span>minutes before start</span>
            </div>
          </div>
        </Field>
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
                      .map((v: any) => (
                        <option key={v.id} value={v.id}>
                          {v.firstName} {v.lastName}{v.unitNumber != null ? ` · #${v.unitNumber}` : ''}
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
      </div>
      {(save.error || del.error) && <p className="text-clay text-[12px] mt-3">{((save.error || del.error) as Error).message}</p>}
      <div className="flex items-center justify-between mt-4">
        {row ? (
          <button onClick={() => { if (confirm(`Delete steady pickup ${row.name}? Future generated occurrences are unlinked.`)) del.mutate(); }}
                  className="haptic flex items-center gap-1.5 text-clay text-[12.5px] font-bold border border-clay/40 px-3 py-2 rounded-[10px]">
            <Trash2 size={13} /> {del.isPending ? 'Deleting…' : 'Delete'}
          </button>
        ) : <span />}
        <div className="flex gap-2">
          <Button size="sm" variant="plain" onClick={onCancel}>Cancel</Button>
          <Button size="sm" loading={save.isPending} onClick={() => save.mutate()}>{row ? 'Save' : 'Create'}</Button>
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
  const suppliers = useQuery({ queryKey: ['admin-suppliers'], queryFn: () => api<{ data: any[] }>('/api/suppliers?limit=500') });

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
                 <div className="font-bold text-[13.5px] truncate">{s.name} {s.unitNumber ? <span className="text-muted font-semibold">· #{s.unitNumber}</span> : null}</div>
                 <div className="text-[11px] text-muted">{new Date(s.signedInAt ?? s.createdAt).toLocaleString()}</div>
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
  { key: 'volunteer_question', label: 'Driver sign-up questions' },
  { key: 'supplier_question',  label: 'Store sign-up questions' },
];

export function SettingsPanel() {
  const [active, setActive] = useState<string>('options');
  const [optionCat, setOptionCat] = useState<string>(CATEGORIES[0]!.key);
  return (
    <div className="space-y-4">
      <div className="text-[11px] font-extrabold uppercase tracking-[.05em] text-muted">Admin settings</div>
      {/* Portal-wide force refresh — always visible so it's one click away
          from any tab, since it's the "we just shipped a fix, pull it now
          on every tablet" action. */}
      <ForcePortalReloadCard />
      <div className="flex flex-wrap gap-1.5">
        <button onClick={() => setActive('options')} className={cx('chip', active === 'options' && 'on')}>Status & type lists</button>
        <button onClick={() => setActive('notifications')} className={cx('chip', active === 'notifications' && 'on')}>SMS notifications</button>
        <button onClick={() => setActive('admins')} className={cx('chip', active === 'admins' && 'on')}>Admin users</button>
        <button onClick={() => setActive('kiosk')} className={cx('chip', active === 'kiosk' && 'on')}>Kiosk mode</button>
        <button onClick={() => setActive('autosms')} className={cx('chip', active === 'autosms' && 'on')}>Auto SMS</button>
      </div>
      {active === 'options' ? (
        <>
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map((c) => (
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
      ) : (
        <PickupAlertsPanel />
      )}
    </div>
  );
}

/**
 * Manages the "always-notified" list of drivers who auto-receive an SMS
 * when a new pickup is created. Drivers can be added or removed here;
 * the fan-out is fire-and-forget from the pickup-create endpoint.
 */
function PickupAlertsPanel() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['pickup-alerts'], queryFn: pickupAlerts.list });
  const volsQ = useQuery({
    queryKey: ['pickup-alerts-vol-picker'],
    queryFn:  () => api<{ data: any[] }>('/api/volunteers?limit=1000'),
  });
  const [pickVolId, setPickVolId] = useState<number | ''>('');
  const [err, setErr] = useState<string | null>(null);
  const add = useMutation({
    mutationFn: (vid: number) => pickupAlerts.add(vid),
    onSuccess: () => { setPickVolId(''); setErr(null); qc.invalidateQueries({ queryKey: ['pickup-alerts'] }); },
    onError:   (e: any) => setErr(e?.message ?? 'add failed'),
  });
  const remove = useMutation({
    mutationFn: (id: number) => pickupAlerts.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pickup-alerts'] }),
    onError:   (e: any) => setErr(e?.message ?? 'remove failed'),
  });

  const currentIds = new Set((list.data?.data ?? []).map((r) => r.volunteerId));
  const candidates = (volsQ.data?.data ?? [])
    .filter((v: any) => !v.deletedAt && !currentIds.has(Number(v.id)) && v.phonePrimary)
    .sort((a: any, b: any) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));

  return (
    <div className="space-y-4">
      <div className="rounded-[14px] border border-sage-line bg-sage/40 p-4 text-[13px] text-forest">
        <div className="font-extrabold text-[14px] mb-1">Auto SMS on new pickup</div>
        <p className="leading-snug">
          When any coordinator creates a new pickup, every driver in this list is texted a summary with "Reply YES to accept." Keep it to your rotating on-call / hotshot group — for a one-off blast to more drivers, use <b>Broadcast</b> instead.
        </p>
        <p className="leading-snug mt-2">
          Drivers only receive the auto-SMS if they have a phone on file and haven't opted out.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select value={pickVolId} onChange={(e) => setPickVolId(e.target.value ? Number(e.target.value) : '')}
                className={cx(inputCls, 'max-w-[420px]')}>
          <option value="">— Pick a driver to add —</option>
          {candidates.map((v: any) => (
            <option key={v.id} value={v.id}>
              {v.firstName} {v.lastName}{v.unitNumber != null ? ` · #${v.unitNumber}` : ''}{v.phonePrimary ? ` · ${v.phonePrimary}` : ''}{v.locationArea ? ` · ${v.locationArea}` : ''}
            </option>
          ))}
        </select>
        <Button size="sm" variant="forest" icon={<Plus size={14} />}
                loading={add.isPending} disabled={!pickVolId}
                onClick={() => pickVolId && add.mutate(pickVolId)}>Add</Button>
      </div>
      {err && <div className="text-clay text-[13px] font-bold bg-clay/10 rounded-[10px] px-3 py-2">{err}</div>}

      <div className="rounded-[14px] border border-line bg-paper overflow-hidden">
        {list.isLoading ? (
          <div className="text-[13px] text-muted px-4 py-6 text-center">Loading…</div>
        ) : (list.data?.data ?? []).length === 0 ? (
          <div className="text-[13.5px] text-muted px-4 py-6 text-center">
            No drivers set up yet. Pick one above to start the on-call group.
          </div>
        ) : (
          (list.data!.data as PickupAlertRecipient[]).map((r) => (
            <div key={r.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-line/60 last:border-b-0">
              <div className="flex-1 min-w-0">
                <div className="font-bold text-[13.5px] text-ink truncate">{r.name}</div>
                <div className="text-[11.5px] text-muted mt-0.5">
                  {r.phone ?? 'no phone'} {!r.smsOptIn && <span className="ml-2 text-clay font-bold">(SMS opted out — will NOT receive)</span>}
                </div>
              </div>
              <button onClick={() => { if (confirm(`Remove ${r.name} from the auto-SMS list?`)) remove.mutate(r.id); }}
                      className="haptic grid h-8 w-8 place-items-center rounded-full bg-clay-soft text-clay hover:bg-clay/20">
                <Trash2 size={13} />
              </button>
            </div>
          ))
        )}
      </div>
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
    if (!confirm('Force EVERY logged-in portal browser and tablet to refresh now?\n\nUsers on the kiosk in the middle of a drop-off are skipped and picked up on their next boot.')) return;
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
 * Kiosk mode toggle for the current device. Enabling stores the shared
 * kiosk secret in localStorage on this device; App.tsx's Root() redirects
 * every visit to /kiosk/<secret> until it's cleared. Any other device
 * (with a different localStorage) continues to see the normal portal.
 */
function KioskModePanel() {
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState<string | null>(null);
  const [enabled, setEnabled] = useState<boolean>(() => !!kioskDevice.getSecret());

  async function enable() {
    setBusy(true); setErr(null);
    try {
      const r = await kioskDevice.fetchSecret();
      if (!r.data.secret) {
        setErr('Kiosk secret not configured on the server (KIOSK_SECRET env var).');
        return;
      }
      kioskDevice.setSecret(r.data.secret);
      setEnabled(true);
      nav(`/kiosk/${r.data.secret}`, { replace: true });
    } catch (e: any) {
      setErr(e?.message || 'Could not enable kiosk mode.');
    } finally { setBusy(false); }
  }
  function disable() {
    kioskDevice.clear();
    setEnabled(false);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-[14px] border border-sage-line bg-sage/40 p-4 text-[13px] text-forest">
        <div className="font-extrabold text-[14px] mb-1">Kiosk mode on this device</div>
        <p className="leading-snug">
          When on, this device shows the office drop-off kiosk instead of the normal portal. Any other device (phone, laptop, another tablet) still signs in as usual — kiosk mode is per-device and lives in this browser's local storage.
        </p>
        <p className="leading-snug mt-2">
          To exit kiosk mode on the kiosk, tap the <b>?</b> button (top-right) → <b>Admin</b>, enter the admin PIN, then use the Exit Kiosk Mode action inside the Admin Panel.
        </p>
      </div>
      {err && <div className="text-clay text-[13px] font-bold bg-clay/10 rounded-[10px] px-3 py-2">{err}</div>}
      <div className="flex items-center gap-3">
        {enabled ? (
          <>
            <div className="flex items-center gap-2 rounded-full bg-forest text-paper px-4 py-2 text-[13px] font-extrabold">
              <span className="w-2 h-2 rounded-full bg-paper" /> Kiosk mode is ON for this device
            </div>
            <Button size="sm" variant="plain" onClick={disable}>Turn off on this device</Button>
          </>
        ) : (
          <>
            <div className="text-[13px] text-muted">Kiosk mode is off. This device shows the normal portal.</div>
            <Button size="sm" variant="forest" loading={busy} onClick={enable}>Make this device the kiosk</Button>
          </>
        )}
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

  return (
    <div className="border border-line bg-paper rounded-[14px] overflow-hidden">
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
      <button onClick={() => { if (confirm(`Remove "${row.value}" from ${category}?`)) del.mutate(); }}
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
  const rows = q.data?.data ?? [];

  return (
    <div className="space-y-3">
      <div className="text-[11px] font-extrabold uppercase tracking-[.05em] text-muted">{rows.length} neighborhoods</div>

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
        {rows.map((n) => <NeighborhoodRow key={n.id} row={n} onChanged={() => qc.invalidateQueries({ queryKey: ['neighborhoods'] })} />)}
      </div>
    </div>
  );
}

function NeighborhoodRow({ row, onChanged }: { row: any; onChanged: () => void }) {
  const [name, setName] = useState(row.name);
  const [dirty, setDirty] = useState(false);
  useEffect(() => { setName(row.name); setDirty(false); }, [row.id, row.name]);
  const patch = useMutation({ mutationFn: () => adminCRUD.patchNeighborhood(row.id, { name }), onSuccess: () => { onChanged(); setDirty(false); } });
  const archive = useMutation({ mutationFn: () => adminCRUD.patchNeighborhood(row.id, { status: row.status === 'active' ? 'archived' : 'active' }), onSuccess: onChanged });
  const del = useMutation({ mutationFn: () => adminCRUD.deleteNeighborhood(row.id), onSuccess: onChanged });

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-line last:border-b-0">
      <span className={cx('inline-block w-2 h-2 rounded-full shrink-0', row.status === 'active' ? 'bg-forest' : 'bg-line')} />
      <input value={name} onChange={(e) => { setName(e.target.value); setDirty(true); }}
             className={cx(inputCls, 'flex-1 !py-1.5 !text-[12.5px]')} />
      {dirty && <button onClick={() => patch.mutate()} className="haptic text-forest text-[12px] font-bold px-2 py-1 rounded-[8px] bg-sage">Save</button>}
      <button onClick={() => archive.mutate()} title={row.status === 'active' ? 'Archive' : 'Restore'}
              className="haptic text-[11.5px] font-bold text-muted px-2 py-1 rounded-[8px] hover:bg-cream">
        {row.status === 'active' ? 'Archive' : 'Restore'}
      </button>
      <button onClick={() => { if (confirm(`Delete "${row.name}" permanently? Suppliers in this neighborhood become unassigned; volunteer assignments are removed.`)) del.mutate(); }}
              className="haptic text-clay grid h-7 w-7 place-items-center rounded-full hover:bg-clay-soft"><Trash2 size={13} /></button>
    </div>
  );
}

// =============================== Coverage ===================================

export function CoveragePanel() {
  const q = useQuery({ queryKey: ['coverage'], queryFn: adminCRUD.coverage, refetchInterval: 30000 });
  const rows = q.data?.data ?? [];
  const low = rows.filter((r) => r.coverage === 'none' || r.coverage === 'low');

  if (q.isLoading) return <div className="text-[13px] text-muted">Loading coverage…</div>;

  return (
    <div className="space-y-4">
      <div className="text-[11px] font-extrabold uppercase tracking-[.05em] text-muted">Volunteer coverage by neighborhood</div>

      {low.length > 0 && (
        <div className="rounded-[14px] border border-clay/40 bg-clay-soft/60 px-4 py-3">
          <div className="text-[12px] font-extrabold text-clay uppercase tracking-[.05em] mb-1">Low coverage — needs more drivers</div>
          <div className="text-[13px] text-ink">
            {low.map((r) => r.name).join(' · ')}
          </div>
        </div>
      )}

      <div className="rounded-[14px] border border-line bg-paper overflow-hidden">
        {rows.length === 0 && <div className="text-[13px] text-muted px-4 py-6 text-center">No neighborhoods configured yet.</div>}
        {rows.map((r) => (
          <div key={r.id} className="flex items-center gap-3 px-4 py-3 border-b border-line last:border-b-0">
            <span className={cx('grid h-8 w-8 place-items-center rounded-full text-[11px] font-extrabold shrink-0',
              r.coverage === 'healthy' ? 'bg-sage text-forest'
              : r.coverage === 'ok'    ? 'bg-amber-soft text-[#9a7415]'
              :                          'bg-clay-soft text-clay')}>
              {r.volunteerCount}
            </span>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-[13.5px] truncate">{r.name}</div>
              <div className="text-[11px] text-muted">{r.supplierCount} {r.supplierCount === 1 ? 'store' : 'stores'} · {r.volunteerCount} {r.volunteerCount === 1 ? 'driver' : 'drivers'}</div>
            </div>
            <span className={cx('text-[10.5px] font-bold py-1 px-2.5 rounded-full uppercase tracking-[.04em]',
              r.coverage === 'healthy' ? 'bg-sage text-forest'
              : r.coverage === 'ok'    ? 'bg-amber-soft text-[#9a7415]'
              : r.coverage === 'low'   ? 'bg-clay-soft text-clay'
              :                          'bg-clay text-paper')}>
              {r.coverage}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

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
            Received {dt.toLocaleDateString()} {dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
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
                    <dd className="text-[13px] text-ink">{f.render ? f.render(v) : String(v)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          );
        })}
      </div>
    </div>
  );
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

const SUPPLIER_GROUPS: IntakeGroup[] = [
  { title: 'Store details', fields: [
    { key: 'storeName',          label: 'Store name' },
    { key: 'address',            label: 'Address' },
    { key: 'hoursAvailable',     label: 'Days & hours' },
  ]},
  { title: 'Pickup logistics', fields: [
    { key: 'latestPickupCutoff', label: 'Latest cutoff' },
    { key: 'parking',            label: 'Parking' },
    { key: 'arrivalLocation',    label: 'On arrival' },
    { key: 'loadHelp',           label: 'Load help', render: pretty },
  ]},
  { title: 'About the donation', fields: [
    { key: 'avgQuantity',        label: 'Avg quantity' },
    { key: 'foodTypes',          label: 'Food types', render: joinList },
    { key: 'coldChainNotes',     label: 'Cold-chain notes' },
  ]},
  { title: 'Contact', fields: [
    { key: 'primaryContactName', label: 'Primary contact' },
    { key: 'primaryContactPhone',label: 'Primary phone' },
    { key: 'backupContactName',  label: 'Backup contact' },
    { key: 'backupContactPhone', label: 'Backup phone' },
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
export function QuickPickupModal({ pickup, onClose, onDone }: { pickup?: any | null; onClose: () => void; onDone: () => void }) {
  const editing = !!pickup;
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  // Default to *right now* (HH:MM) — for walk-ins the pickup goes on the queue
  // immediately. If a coordinator needs a future slot they can just edit the
  // time field. Previously we defaulted to the next round hour, which pushed
  // 8:30 arrivals to a 9:00 pickup for no good reason.
  const nowHHMM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const qc = useQueryClient();
  const suppliers = useQuery({ queryKey: ['admin-suppliers'], queryFn: () => api<{ data: any[] }>('/api/suppliers?limit=500') });
  const volunteers = useQuery({ queryKey: ['admin-volunteers'], queryFn: () => api<{ data: any[] }>('/api/volunteers?limit=500') });
  const groups = useQuery({ queryKey: ['sms-groups'], queryFn: () => volunteerGroups.list(), enabled: !editing });
  const groupList: VolunteerGroup[] = (groups.data as any)?.data ?? [];
  const defaultGroup = groupList.find((g) => g.is_default_broadcast) ?? groupList[0];
  // batch abc820 Aug 11 — "Send to drivers" is a single checkbox that gates
  // the whole broadcast section. Default ON at create-time (this is the
  // dispatcher's typical workflow); OFF at edit-time (no re-broadcast).
  const [sendToDrivers, setSendToDrivers] = useState<boolean>(!editing);
  const [smsGroupId, setSmsGroupId] = useState<number | ''>('');
  useEffect(() => { if (!editing && defaultGroup && smsGroupId === '') setSmsGroupId(defaultGroup.id); }, [editing, defaultGroup?.id]);

  // For an editing modal, find the supplier id from the comma-joined name(s) on the row.
  const initialSupId = (() => {
    if (!editing) return '' as number | '';
    const list = suppliers.data?.data ?? [];
    const firstName = (pickup.suppliers ?? '').split(',')[0]?.trim();
    const match = list.find((s: any) => s.name === firstName);
    return (match?.id as number | undefined) ?? ('' as number | '');
  })();
  const initialSignups: any[] = editing ? (pickup.signups ?? []) : [];
  const initialVIds: number[] = initialSignups.map((s: any) => Number(s.volunteer_id)).filter(Number.isFinite);

  const [date, setDate]         = useState<string>(editing ? String(pickup.scheduled_date).slice(0, 10) : today);
  const [time, setTime]         = useState<string>(editing ? String(pickup.scheduled_time ?? '').slice(0, 5) : nowHHMM);
  const [supplierId, setSupId]  = useState<number | ''>(initialSupId);
  // Client Aug 7 item 2: donorName is the PUBLIC "store / hall" name that
  // shows on the driver SMS; contactName is the INTERNAL person name that
  // is never surfaced to drivers.
  const [donorName, setDonor]   = useState<string>(editing ? (pickup.donor_name ?? '') : '');
  const [foodDescription, setFood] = useState<string>(editing ? (pickup.food_description ?? '') : '');
  const [pickupAddress, setAddr] = useState<string>(editing ? (pickup.pickup_address ?? pickup.supplier_address ?? '') : '');
  // batch abc820 Aug 11 — Access + Pickup Instructions + Special Instructions
  // + Notes collapsed into a single "Pickup Instructions / Notes" textarea.
  // On save we persist to `pickupInstructions` and NULL out the others.
  const [pickupInstructions, setPI] = useState<string>(editing
    ? [pickup.pickup_instructions, pickup.special_instructions, pickup.notes].filter(Boolean).join('\n').trim()
    : '');
  const [contactName, setCN]    = useState<string>(editing ? (pickup.contact_name ?? '') : '');
  const [contactPhone, setCP]   = useState<string>(editing ? (pickup.contact_phone ?? '') : '');
  const [urgency, setUrgency]   = useState<'normal' | 'urgent'>(editing && pickup.urgency_level === 'urgent' ? 'urgent' : 'normal');
  const [slotsCapacity, setSlots] = useState<number>(editing ? Number(pickup.slots_capacity ?? 1) : 1);
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
  const [mustPickupBy, setMustBy] = useState<string>(editing ? toLocalInput(pickup.must_pickup_by) : '');
  const [showMore, setShowMore]   = useState(false);

  // Auto-fill from supplier selection. Tracks which fields the user has
  // manually touched so we DON'T clobber those on subsequent supplier
  // selections. Empty user input counts as "not touched" and lets auto-fill run.
  const touchedRef = useRef<{ donor: boolean; addr: boolean; cn: boolean; cp: boolean }>({
    donor: !!(editing && pickup?.donor_name),
    addr:  !!(editing && (pickup?.pickup_address || pickup?.supplier_address)),
    cn:    !!(editing && pickup?.contact_name),
    cp:    !!(editing && pickup?.contact_phone),
  });
  useEffect(() => {
    if (typeof supplierId !== 'number') return;
    const s = (suppliers.data?.data ?? []).find((r: any) => Number(r.id) === supplierId);
    if (!s) return;
    if (!touchedRef.current.donor && !donorName) setDonor(String(s.name || ''));
    if (!touchedRef.current.addr && !pickupAddress) {
      const addr = [s.address_line1, s.city].filter(Boolean).join(', ');
      if (addr) setAddr(addr);
    }
    if (!touchedRef.current.cn && !contactName) setCN(String(s.contact_name ?? ''));
    if (!touchedRef.current.cp && !contactPhone) setCP(String(s.contact_phone ?? ''));
  }, [supplierId, suppliers.data]);

  // When loading suppliers list resolves AFTER first render, re-sync the id.
  useEffect(() => {
    if (editing && supplierId === '' && suppliers.data?.data?.length) {
      const list = suppliers.data.data;
      const firstName = (pickup.suppliers ?? '').split(',')[0]?.trim();
      const match = list.find((s: any) => s.name === firstName);
      if (match) setSupId(match.id);
    }
  }, [editing, suppliers.data, pickup]);

  const isOneTime = supplierId === '';
  // First non-empty driver pick, used for the create-time single volunteerId
  // the backend accepts. Additional pickers get attached after creation via
  // the pickup-volunteers add endpoint.
  const primaryDriverId = driverPicks.find((v) => typeof v === 'number') as number | undefined;
  const extraDriverIds  = driverPicks.filter((v, i): v is number => typeof v === 'number' && v !== primaryDriverId && i > driverPicks.indexOf(primaryDriverId as number));

  const payload = () => ({
    scheduledDate: date,
    scheduledTime: time.length === 5 ? `${time}:00` : time,
    supplierId: typeof supplierId === 'number' ? supplierId : undefined,
    isOneTime,
    pickupType: isOneTime ? 'one_time' : (editing ? undefined : 'extra'),
    urgencyLevel: urgency,
    slotsCapacity,
    donorName:     donorName || null,
    contactName:   contactName || null,
    contactPhone:  contactPhone || null,
    // Contact email removed from the form; explicit null keeps the column
    // consistent for existing rows on edit.
    contactEmail:  null,
    pickupAddress: pickupAddress || null,
    // Combined instructions live in pickupInstructions; null out the others
    // so the driver-facing surface never shows stale duplicates.
    pickupInstructions:  pickupInstructions || null,
    specialInstructions: null,
    notes:               null,
    foodDescription: foodDescription || null,
    mustPickupBy: mustPickupBy ? new Date(mustPickupBy).toISOString() : (editing ? null : undefined),
    ...(editing
      ? {
          status: status || undefined,
          volunteerId: (typeof primaryDriverId === 'number' && !initialVIds.includes(primaryDriverId))
            ? primaryDriverId : undefined,
        }
      : {
          volunteerId: primaryDriverId,
          autoBroadcast: sendToDrivers,
          smsGroupId: (sendToDrivers && typeof smsGroupId === 'number') ? smsGroupId : undefined,
        }),
  });

  const save = useMutation({
    mutationFn: async () => {
      const res: any = editing
        ? await adminCRUD.patchPickup(pickup.id, payload())
        : await adminCRUD.createPickup(payload());
      // Add any additional drivers beyond the primary. Only relevant at
      // create-time (edit-mode uses the DriverPickerModal to manage drivers).
      if (!editing && extraDriverIds.length > 0) {
        const newId = res?.data?.id ?? res?.id;
        if (Number.isFinite(newId)) {
          for (const vid of extraDriverIds) {
            try {
              await api(`/api/pickup-instances/${newId}/volunteers`, {
                method: 'POST', body: JSON.stringify({ volunteerId: vid }),
              });
            } catch { /* non-fatal — dispatcher can retry from board */ }
          }
        }
      }
      return res;
    },
    onSuccess: (res: any) => {
      // Auto-broadcast result toast — client Aug 3: "everyone in the selected
      // group should automatically receive the standard 'Anyone available…'
      // message". Non-blocking, closes the modal either way.
      const ab = res?.autoBroadcast;
      if (ab) {
        const to = ab.groupName ? ` to ${ab.groupName}` : '';
        if (ab.sent > 0)      alert(`✓ Broadcast sent${to}: ${ab.sent} of ${ab.attempted} drivers`);
        else if (ab.reason)   alert(`Auto-broadcast: ${ab.reason}${to} — no SMS sent`);
      }
      onDone();
    },
  });
  const del = useMutation({
    mutationFn: () => adminCRUD.deletePickup(pickup.id),
    onSuccess: onDone,
  });

  // ── Inline "Add new supplier" mini-form (shown inside the Supplier dropdown).
  const [showInlineNewSupplier, setShowInlineNewSupplier] = useState(false);

  return (
    <Modal title={editing ? `Edit pickup · ${pickup.suppliers || 'one-time'}` : 'New pickup'} onClose={onClose} wide>
      <div className="grid grid-cols-2 gap-3">
        {/* 1. Date / scheduled time */}
        <Field label="Date"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} /></Field>
        <Field label="Time"><input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inputCls} /></Field>

        {/* 2. Supplier (searchable + inline "Add new supplier") */}
        <Field label="Supplier" full>
          <SupplierComboboxWithAdd
            suppliers={suppliers.data?.data ?? []}
            value={supplierId} onChange={(v) => setSupId(v)}
            onAddNew={() => setShowInlineNewSupplier(true)}
          />
        </Field>

        {/* 3. Store / Hall Name */}
        <Field label="Store / Hall Name" full>
          <input value={donorName}
                 onChange={(e) => { touchedRef.current.donor = true; setDonor(e.target.value); }}
                 placeholder="e.g. Kroger Airmont, Bites Cafe, Chabad Center"
                 className={inputCls} />
          <div className="text-[11.5px] text-muted italic mt-1">
            Only fill this if it's actually a store, business, or hall — this name is sent to volunteers.
            For individual donors, use Contact Name instead.
          </div>
        </Field>

        {/* 4. Contact Name / Contact Phone (one row) */}
        <Field label="Contact Name">
          <input value={contactName}
                 onChange={(e) => { touchedRef.current.cn = true; setCN(e.target.value); }}
                 className={inputCls} />
        </Field>
        <Field label="Contact Phone">
          <input value={contactPhone}
                 onChange={(e) => { touchedRef.current.cp = true; setCP(e.target.value); }}
                 className={inputCls} />
        </Field>

        {/* 5. Pickup Address */}
        <Field label="Pickup Address" full>
          <AddressAutocomplete value={pickupAddress}
                               onChange={(v) => { touchedRef.current.addr = true; setAddr(v); }}
                               placeholder="Start typing… suggestions from Google"
                               className={inputCls} />
        </Field>

        {/* 6. Pickup Details (was Food Description) */}
        <Field label="Pickup Details" full>
          <textarea rows={2} value={foodDescription} onChange={(e) => setFood(e.target.value)}
                    placeholder='e.g. "8 catering trays, mostly chicken & rice"' className={inputCls} />
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
        <Field label="Assign Driver(s) — optional" full>
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

        {/* 9. Combined Pickup Instructions / Notes */}
        <Field label="Pickup Instructions / Notes — optional" full>
          <textarea rows={3} value={pickupInstructions} onChange={(e) => setPI(e.target.value)}
                    placeholder='e.g. "Loading dock on the side. Ring the bell twice. Gate code 4567."'
                    className={inputCls} />
          <div className="text-[11.5px] text-muted italic mt-1">
            One place for access notes, special instructions, and anything else the driver needs to know.
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
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={sendToDrivers} onChange={(e) => setSendToDrivers(e.target.checked)}
                   className="accent-forest h-4 w-4" />
            <span className="text-[13px] font-bold text-ink">Send to drivers</span>
          </label>
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

      {/* More options — Urgency + Must Pick Up By (collapsed by default). */}
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
            <Field label="Must Pick Up By">
              <input type="datetime-local" value={mustPickupBy} onChange={(e) => setMustBy(e.target.value)} className={inputCls} />
            </Field>
          </div>
        )}
      </div>

      {(save.error || del.error) && <p className="text-clay text-[12px] mt-3">{((save.error || del.error) as Error).message}</p>}
      <div className="flex items-center justify-between mt-4">
        {editing ? (
          <button onClick={() => { if (confirm(`Delete this pickup? This removes it and any driver assignments.`)) del.mutate(); }}
                  className="haptic flex items-center gap-1.5 text-clay text-[12.5px] font-bold border border-clay/40 px-3 py-2 rounded-[10px] hover:bg-clay-soft">
            <Trash2 size={13} /> {del.isPending ? 'Deleting…' : 'Delete pickup'}
          </button>
        ) : <span />}
        <div className="flex gap-2">
          <Button size="sm" variant="plain" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={save.isPending} disabled={!date || !time}
                  onClick={() => save.mutate()} icon={<Plus size={14} />}>
            {editing ? 'Save changes' : 'Create pickup'}
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
  const selected = suppliers.find((s) => s.id === value);
  const displayValue = open ? q : (selected ? `${selected.name}${selected.city ? ` · ${selected.city}` : ''}` : '');
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    const all = suppliers.filter((s: any) => !!s?.name);
    if (!t) return all.slice(0, 200);
    return all.filter((s: any) => `${s.name} ${s.city ?? ''}`.toLowerCase().includes(t)).slice(0, 60);
  }, [q, suppliers]);
  return (
    <div className="relative flex-1">
      <input value={displayValue}
             onFocus={() => { setOpen(true); setQ(''); }}
             onChange={(e) => { setOpen(true); setQ(e.target.value); }}
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
          {list.map((s: any) => (
            <button key={s.id} type="button"
                    onMouseDown={(e) => { e.preventDefault(); onChange(Number(s.id)); setOpen(false); setQ(''); }}
                    className={cx('w-full text-left px-3 py-2 text-[13.5px] hover:bg-cream/60 border-b border-line last:border-b-0',
                                  s.id === value && 'bg-sage/40 font-bold')}>
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

        <Button size="md" variant="forest" loading={change.isPending}
                disabled={!canSubmit} onClick={() => change.mutate()}>
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
    refetchInterval: 20_000,
  });

  if (selected) {
    return (
      <div className="flex flex-col h-[calc(100vh-180px)]">
        <button onClick={() => setSelected(null)} className="self-start text-[12px] text-forest font-bold mb-2 hover:underline">
          ← Back to SMS inbox
        </button>
        <ChatThread userId={selected.userId} title={selected.name}
                    subtitle={selected.phone ? `SMS · ${selected.phone}` : 'SMS'} color="#3E6F8E" />
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
                  <div className="text-[13.5px] font-extrabold text-ink truncate">{name}</div>
                  <div className="text-[11px] text-muted shrink-0">{formatSmsAgo(r.created_at)}</div>
                </div>
                {r.phone && (
                  <div className="flex items-center gap-1 text-[11px] text-muted mt-0.5">
                    <Phone size={10} /> {r.phone}
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

function formatSmsAgo(iso: string) {
  const d = new Date(iso);
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
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
    mutationFn: (id: number) => shiftsApi.cancel(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shifts'] }),
  });
  // Group by day.
  const groups = useMemo(() => {
    const out = new Map<string, any[]>();
    for (const s of (list.data?.data ?? [])) {
      const day = new Date(s.starts_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      if (!out.has(day)) out.set(day, []);
      out.get(day)!.push(s);
    }
    return Array.from(out.entries());
  }, [list.data]);

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
                          {shown}{sh.unit_number != null ? ` #${sh.unit_number}` : ''}
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
        {!readOnly && <Button size="sm" variant="forest" icon={<Plus size={14} />} onClick={() => { setPrefillStart(null); setShowNew(true); }}>New shift</Button>}
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
              const start = new Date(sh.starts_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
              const end   = new Date(sh.ends_at  ).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
              return (
                <div key={sh.id} className="rounded-[10px] border border-line bg-paper px-3 py-2 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-[13.5px] flex items-center gap-1.5 flex-wrap">
                      <span>{sh.first_name} {sh.last_name}</span>
                      {sh.unit_number != null && <span className="text-muted font-semibold text-[11.5px]">#{sh.unit_number}</span>}
                      {sh.recurring_shift_id != null && (
                        <span className="text-[10px] font-extrabold uppercase tracking-[.05em] bg-sage text-forest px-1.5 py-[1px] rounded-full">Series</span>
                      )}
                    </div>
                    <div className="text-[11.5px] text-muted">
                      {start} — {end}
                      {sh.notes ? ` · ${sh.notes}` : ''}
                      {sh.signed_in_at && ` · signed in ${new Date(sh.signed_in_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`}
                      {sh.signed_out_at && ` · signed out ${new Date(sh.signed_out_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`}
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
                    <button onClick={() => { if (confirm(`Cancel this shift?`)) cancelMut.mutate(sh.id); }}
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
  return (
    <div className="mt-2">
      <CenterHelpSection />
    </div>
  );
}

// ============================================================================
// batch abc801 Aug 9 — Center Help schedule (packing, stocking, deliveries,
// cleaning, other). Templates → auto-generated instances (14 days out) with
// 5-min-before SMS reminders. Backed by /api/center-help/*.
// ============================================================================
function CenterHelpSection() {
  const qc = useQueryClient();
  const [weekAnchor, setWeekAnchor] = useState<Date>(() => startOfWeek(new Date()));
  const [showNew, setShowNew] = useState(false);
  const [editTpl, setEditTpl] = useState<CenterHelpTemplate | null>(null);
  const [assignInst, setAssignInst] = useState<CenterHelpInstance | null>(null);
  const weekEnd = new Date(weekAnchor); weekEnd.setDate(weekEnd.getDate() + 7);
  const from = weekAnchor.toISOString().slice(0, 10);
  const to   = new Date(weekEnd.getTime() - 86400000).toISOString().slice(0, 10);
  const tplQ = useQuery({ queryKey: ['center-help-templates'], queryFn: () => centerHelp.templates() });
  const instQ = useQuery({
    queryKey: ['center-help-instances', from, to],
    queryFn:  () => centerHelp.instances(from, to),
    refetchInterval: 30_000,
  });
  const templates = tplQ.data?.data ?? [];
  const instances = instQ.data?.data ?? [];

  const daysInWeek = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekAnchor); d.setDate(d.getDate() + i); return d;
  });
  const byDay = useMemo(() => {
    const map = new Map<string, CenterHelpInstance[]>();
    for (const inst of instances) {
      const dk = localDateKey(new Date(inst.starts_at));
      if (!map.has(dk)) map.set(dk, []);
      map.get(dk)!.push(inst);
    }
    for (const arr of map.values()) arr.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    return map;
  }, [instances]);

  const weekLabel = `${weekAnchor.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} — ${new Date(weekEnd.getTime() - 86400000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

  return (
    <div className="space-y-3">
      <div className="rounded-[14px] border border-sage-line bg-sage/40 p-3 text-[12.5px] text-forest">
        <b>Center help schedule.</b> Add tasks at the center — volunteers can sign up, and a reminder SMS fires <b>5 minutes before</b> each shift starts.
      </div>

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
          <div className="text-[11.5px] font-extrabold uppercase tracking-[.05em] text-muted">Center help</div>
        </div>

        <div className="grid grid-cols-7 gap-1.5">
          {daysInWeek.map((d) => {
            const dk = localDateKey(d);
            const dayInstances = byDay.get(dk) ?? [];
            return (
              <div key={dk} className="rounded-[10px] border border-line bg-cream/30 min-h-[110px] p-1.5">
                <div className="font-extrabold uppercase tracking-[.05em] text-muted text-center text-[10.5px] mb-1">
                  {d.toLocaleDateString('en-US', { weekday: 'short' })} <span className="text-ink font-bold">{d.getDate()}</span>
                </div>
                <div className="space-y-1">
                  {dayInstances.length === 0 && (
                    <div className="text-[10.5px] text-muted italic text-center pt-2">No tasks</div>
                  )}
                  {dayInstances.map((inst) => {
                    const label = CENTER_HELP_TASK_LABELS[inst.task_type] ?? inst.task_type;
                    const start = new Date(inst.starts_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
                    const end   = new Date(inst.ends_at  ).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
                    const filled = inst.signup_count;
                    const target = inst.volunteers_needed;
                    const short  = filled < target;
                    return (
                      <div key={inst.id} className="rounded-[8px] border border-line bg-paper px-1.5 py-1">
                        <div className="font-bold text-[11.5px] truncate">{label}</div>
                        <div className={cx('text-[10.5px] font-extrabold', short ? 'text-clay' : 'text-forest')}>
                          {filled} of {target} filled
                        </div>
                        <div className="text-[10.5px] text-muted">{start} – {end}</div>
                        {inst.signups.length > 0 && (
                          <div className="text-[10px] text-muted truncate mt-0.5">
                            {inst.signups.map((s) => `${s.first_name}${s.unit_number != null ? ` #${s.unit_number}` : ''}`).join(', ')}
                          </div>
                        )}
                        {!readOnly && (
                          <div className="flex items-center gap-1 mt-1">
                            <button onClick={() => setAssignInst(inst)}
                                    className="haptic text-[10.5px] font-bold text-forest border border-forest/40 bg-sage/40 px-1.5 py-0.5 rounded-[6px] hover:bg-sage/60">
                              Assign
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-[11px] font-extrabold uppercase tracking-[.05em] text-muted">
          {templates.length} template{templates.length === 1 ? '' : 's'}
        </div>
        {!readOnly && <Button size="sm" variant="forest" icon={<Plus size={14} />} onClick={() => setShowNew(true)}>+ New task</Button>}
      </div>
      {tplQ.isLoading ? <div className="text-[13px] text-muted">Loading…</div> :
       templates.length === 0 ? <div className="text-[13px] text-muted italic">No center-help tasks yet. Add one to schedule regular help.</div> :
       <div className="space-y-2">
         {templates.map((t) => {
           const label = CENTER_HELP_TASK_LABELS[t.task_type] ?? t.task_type;
           const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][t.day_of_week] ?? '';
           return (
             <div key={t.id} className="border border-line bg-paper rounded-[14px] px-4 py-3 flex items-center justify-between gap-3">
               <div className="min-w-0">
                 <div className="font-bold text-[13.5px] truncate">{label}</div>
                 <div className="text-[11px] text-muted truncate">
                   {dow} · {t.start_time?.slice(0, 5)} – {t.end_time?.slice(0, 5)} · needs {t.volunteers_needed} · {t.volunteer_ids?.length ?? 0} pre-assigned
                 </div>
               </div>
               {!readOnly && (
                 <button onClick={() => setEditTpl(t)} className="haptic grid h-8 w-8 place-items-center rounded-full bg-sage text-forest hover:bg-sage-line shrink-0">
                   <Pencil size={14} />
                 </button>
               )}
             </div>
           );
         })}
       </div>}

      {(showNew || editTpl) && (
        <CenterHelpTemplateForm
          row={editTpl}
          onDone={() => { setShowNew(false); setEditTpl(null); qc.invalidateQueries({ queryKey: ['center-help-templates'] }); qc.invalidateQueries({ queryKey: ['center-help-instances', from, to] }); }}
          onCancel={() => { setShowNew(false); setEditTpl(null); }}
        />
      )}
      {assignInst && (
        <CenterHelpAssignModal
          instance={assignInst}
          onDone={() => { setAssignInst(null); qc.invalidateQueries({ queryKey: ['center-help-instances', from, to] }); }}
          onCancel={() => setAssignInst(null)}
        />
      )}
    </div>
  );
}

function CenterHelpTemplateForm({ row, onDone, onCancel }: { row: CenterHelpTemplate | null; onDone: () => void; onCancel: () => void }) {
  const [taskType, setTaskType] = useState<CenterHelpTaskType>((row?.task_type as CenterHelpTaskType) ?? 'packing_orders');
  const [dayOfWeek, setDow]     = useState<number>(row?.day_of_week ?? 1);
  const [startTime, setStart]   = useState<string>((row?.start_time ?? '09:00').slice(0, 5));
  const [endTime, setEnd]       = useState<string>((row?.end_time   ?? '11:00').slice(0, 5));
  const [need, setNeed]         = useState<number>(row?.volunteers_needed ?? 1);
  const [isRecurring, setRec]   = useState<boolean>(row?.is_recurring ?? true);
  const [notes, setNotes]       = useState<string>(row?.notes ?? '');
  const [assignedIds, setIds]   = useState<Array<number | ''>>(() => {
    const arr = row?.volunteer_ids ?? [];
    return arr.length > 0 ? arr.map((n) => Number(n)) : [''];
  });
  const vols = useQuery({ queryKey: ['admin-volunteers'], queryFn: () => api<{ data: any[] }>('/api/volunteers?limit=500') });
  const save = useMutation({
    mutationFn: () => {
      const cleanIds = assignedIds.map((v) => Number(v)).filter((n) => Number.isInteger(n) && n > 0);
      const body = {
        taskType, dayOfWeek, startTime, endTime,
        volunteersNeeded: Math.max(1, Number(need) || 1),
        isRecurring, notes: notes || null,
        volunteerIds: cleanIds,
      };
      return row ? centerHelp.patchTemplate(row.id, body) : centerHelp.createTemplate(body);
    },
    onSuccess: onDone,
  });
  const del = useMutation({ mutationFn: () => centerHelp.deleteTemplate(row!.id), onSuccess: onDone });
  return (
    <Modal title={row ? 'Edit center-help task' : 'New center-help task'} onClose={onCancel}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Task">
          <select value={taskType} onChange={(e) => setTaskType(e.target.value as CenterHelpTaskType)} className={inputCls}>
            {Object.entries(CENTER_HELP_TASK_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Day of the week">
          <select value={dayOfWeek} onChange={(e) => setDow(Number(e.target.value))} className={inputCls}>
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => <option key={i} value={i}>{d}</option>)}
          </select>
        </Field>
        <Field label="Start time"><input type="time" value={startTime} onChange={(e) => setStart(e.target.value)} className={inputCls} /></Field>
        <Field label="End time"><input type="time" value={endTime} onChange={(e) => setEnd(e.target.value)} className={inputCls} /></Field>
        <Field label="Volunteers needed">
          <input type="number" min={1} max={50} value={need}
                 onChange={(e) => setNeed(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
                 className={inputCls + ' w-24 text-center'} />
        </Field>
        <label className="flex items-center gap-2 text-[13px] mt-6">
          <input type="checkbox" className="accent-forest h-4 w-4"
                 checked={isRecurring} onChange={(e) => setRec(e.target.checked)} />
          Recurring (auto-generate weekly)
        </label>
        <Field label="Notes" full>
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} placeholder="Optional — anything volunteers should know" />
        </Field>
        <Field label="Pre-assigned volunteers (auto-signed-up on generation)" full>
          <div className="rounded-[10px] border border-line bg-cream/30 divide-y divide-line">
            {assignedIds.map((vid, idx) => (
              <div key={idx} className="flex items-center gap-2 px-3 py-2">
                <div className="flex-1 min-w-0">
                  <VolunteerPicker
                    volunteers={vols.data?.data ?? []}
                    value={vid === '' ? '' : Number(vid)}
                    onChange={(n) => setIds((arr) => arr.map((x, i) => i === idx ? (n === '' ? '' : Number(n)) : x))}
                  />
                </div>
                {assignedIds.length > 1 && (
                  <button type="button"
                          onClick={() => setIds((arr) => arr.filter((_, i) => i !== idx))}
                          className="haptic grid h-8 w-8 place-items-center rounded-full bg-clay-soft text-clay hover:bg-clay/20">
                    <X size={13} />
                  </button>
                )}
              </div>
            ))}
            <div className="px-3 py-2">
              <button type="button" onClick={() => setIds((arr) => [...arr, ''])}
                      className="haptic text-[12px] font-bold text-forest flex items-center gap-1.5">
                <Plus size={13} /> Add another volunteer
              </button>
            </div>
          </div>
        </Field>
      </div>
      {(save.error || del.error) && <p className="text-clay text-[12px] mt-3">{((save.error || del.error) as Error).message}</p>}
      <div className="flex items-center justify-between mt-4">
        {row ? (
          <button onClick={() => { if (confirm(`Delete this task template? Future not-yet-fired occurrences will be cancelled.`)) del.mutate(); }}
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

function CenterHelpAssignModal({ instance, onDone, onCancel }: { instance: CenterHelpInstance; onDone: () => void; onCancel: () => void }) {
  const [pick, setPick] = useState<number | ''>('');
  const vols = useQuery({ queryKey: ['admin-volunteers'], queryFn: () => api<{ data: any[] }>('/api/volunteers?limit=500') });
  const doAssign = useMutation({
    mutationFn: () => centerHelp.assign(instance.id, [Number(pick)]),
    onSuccess: onDone,
  });
  const label = CENTER_HELP_TASK_LABELS[instance.task_type] ?? instance.task_type;
  const when  = new Date(instance.starts_at).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', hour12: true });
  return (
    <Modal title={`Assign volunteer to ${label} (${when})`} onClose={onCancel}>
      <div className="space-y-3">
        <div>
          <label className="block text-[11px] font-extrabold uppercase tracking-[.05em] text-muted mb-1">Volunteer</label>
          <VolunteerPicker
            volunteers={vols.data?.data ?? []}
            value={pick}
            onChange={setPick}
          />
        </div>
        {instance.signups.length > 0 && (
          <div className="text-[11.5px] text-muted">
            Already signed up: {instance.signups.map((s) => `${s.first_name} ${s.last_name}`).join(', ')}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="plain" onClick={onCancel}>Cancel</Button>
          <Button size="sm" loading={doAssign.isPending} disabled={pick === ''} onClick={() => doAssign.mutate()}>Assign</Button>
        </div>
      </div>
    </Modal>
  );
}

function VolunteerPicker({ volunteers, value, onChange, placeholder = '— pick a person —' }: {
  volunteers: any[];
  value: number | '';
  onChange: (id: number | '') => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);
  const selected = volunteers.find(v => Number(v.id) === Number(value));
  const label = selected
    ? `${selected.firstName ?? ''} ${selected.lastName ?? ''}`.trim()
      + (selected.unitNumber != null ? ` #${selected.unitNumber}` : '')
      + (selected.phonePrimary ? ` · ${selected.phonePrimary}` : '')
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
            const ph = v.phonePrimary ? ` · ${v.phonePrimary}` : '';
            return (
              <button key={v.id} type="button"
                      onMouseDown={(e) => { e.preventDefault(); onChange(Number(v.id)); setOpen(false); }}
                      className={cx('w-full text-left px-3 py-2 text-[13px] hover:bg-cream/70',
                                    Number(v.id) === Number(value) && 'bg-sage/40 font-bold')}>
                {nm}{un}{ph}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function EditShiftForm({ shift, onDone, onCancelForm, onDeleted }: {
  shift: any; onDone: () => void; onCancelForm: () => void; onDeleted: () => void;
}) {
  const qc = useQueryClient();
  const vols = useQuery({ queryKey: ['admin-volunteers'], queryFn: () => api<{ data: any[] }>('/api/volunteers?limit=500') });
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
    mutationFn: () => shiftsApi.cancel(Number(shift.id)),
    onSuccess: () => onDeleted(),
  });
  const seriesNote = shift.recurring_shift_id != null;
  return (
    <Modal title="Edit shift" onClose={onCancelForm}>
      <div className="space-y-3">
        {seriesNote && (
          <div className="text-[11.5px] text-muted italic border-l-2 border-line pl-2">
            This shift belongs to a weekly series. Editing here changes only THIS instance.
            To change every future occurrence, cancel the series and create a new one.
          </div>
        )}
        <div>
          <label className="block text-[11px] font-extrabold uppercase tracking-[.05em] text-muted mb-1">Volunteer</label>
          <VolunteerPicker
            volunteers={vols.data?.data ?? []}
            value={volunteerId}
            onChange={setVid}
          />
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
        <div className="flex items-center justify-between pt-1">
          <button onClick={() => { if (confirm('Cancel this shift?')) cancelMut.mutate(); }}
                  className="haptic text-clay text-[12px] font-bold px-3 py-1.5 rounded-[8px] border border-clay/40 hover:bg-clay/10">
            Cancel shift
          </button>
          <div className="flex items-center gap-2">
            <button onClick={onCancelForm}
                    className="haptic text-[12px] font-bold text-muted px-3 py-1.5">Close</button>
            <button onClick={() => patchMut.mutate()} disabled={patchMut.isPending}
                    className="haptic text-[12px] font-bold bg-forest text-paper px-3 py-1.5 rounded-[8px] shadow-ctag disabled:opacity-50">
              {patchMut.isPending ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
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
          Steady (weekly)
        </button>
        <button type="button" onClick={() => setMode('once')}
                className={cx('haptic text-[12.5px] font-bold px-3 py-1.5 rounded-[8px]',
                              mode === 'once' ? 'bg-forest text-paper' : 'text-muted hover:text-forest')}>
          One-time
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Volunteer / dispatcher" full>
          <VolunteerPicker
            volunteers={volunteers.data?.data ?? []}
            value={volunteerId}
            onChange={setVid}
          />
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

  const volunteers = useQuery({
    queryKey: ['admin-volunteers'],
    queryFn:  () => api<{ data: any[] }>('/api/volunteers?limit=500'),
  });
  const suppliers = useQuery({
    queryKey: ['admin-suppliers'],
    queryFn:  () => api<{ data: any[] }>('/api/suppliers?limit=500'),
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
      setFlash({ tone: 'ok', msg: `Sent to ${res?.data?.sent ?? '?'} · ${res?.data?.failed ? `${res.data.failed} failed` : 'all delivered'}` });
      setBody(''); setConfirmingSend(null);
    },
    onError: (e: Error) => { setFlash({ tone: 'err', msg: e.message }); setConfirmingSend(null); },
  });
  const scheduleMut = useMutation({
    mutationFn: () => broadcast.scheduleSms({
      body: body.trim(),
      messageType: (mode === 'store' ? 'other' : mode) as 'pickup' | 'other',
      volunteerIds: recipientMode === 'specific' ? Array.from(selected) : undefined,
      // datetime-local → convert to ISO with the browser's timezone.
      sendAt: new Date(scheduleAt).toISOString(),
    }),
    onSuccess: () => {
      setFlash({ tone: 'ok', msg: `Scheduled for ${new Date(scheduleAt).toLocaleString()}` });
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
  const storeBroadcastMut = useMutation({
    mutationFn: () => broadcast.storeBroadcast({
      body: body.trim(), supplierIds: Array.from(storeIds),
    }),
    onSuccess: (res: any) => {
      setFlash({ tone: 'ok', msg: `Sent to ${res?.data?.sent ?? '?'} store${res?.data?.sent === 1 ? '' : 's'}` });
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
                      <div className="font-bold text-[13px] truncate">{s.name}</div>
                      <div className="text-[11px] text-muted truncate">{s.contactPhone ?? s.contact_phone ?? '—'}{s.city ? ` · ${s.city}` : ''}</div>
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
            {filtered.slice(0, 200).map((v: any) => {
              const on = selected.has(v.id);
              return (
                <button key={v.id} onClick={() => toggle(v.id)}
                        className={cx('w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-cream/40 border-b border-line last:border-b-0',
                                      on && 'bg-sage/50')}>
                  <input type="checkbox" checked={on} readOnly className="h-4 w-4 accent-forest" />
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-[13px] truncate">{v.firstName} {v.lastName}{v.unitNumber != null && <span className="ml-1.5 text-muted font-semibold text-[11.5px]">#{v.unitNumber}</span>}</div>
                    <div className="text-[11px] text-muted truncate">{v.phonePrimary ?? '—'} · {v.locationArea ?? 'no area'}</div>
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
            <button onClick={() => setConfirmingSend({ kind: 'send-all-open', recipients: recipientCount, body: '(auto-generated from today\'s open pickups)' })}
                    disabled={recipientCount === 0}
                    className="w-full haptic text-[14px] font-extrabold bg-forest text-paper px-4 py-3 rounded-[10px] shadow-ctag disabled:opacity-50">
              📨 Send all open pickups to {recipientCount} driver{recipientCount === 1 ? '' : 's'}
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
              <button onClick={() => { setSaveTemplateOpen(true); setTemplateName(''); }}
                      disabled={!body.trim()}
                      className="haptic text-[12px] font-bold text-forest border border-forest bg-sage/40 px-3 py-1.5 rounded-[8px] disabled:opacity-50">
                Save as template…
              </button>
            </div>

            <div className="text-[11px] font-extrabold uppercase tracking-[.05em] text-muted">Message ({body.length} chars)</div>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5}
                      placeholder="Type your message here…"
                      className="w-full rounded-[10px] border border-line bg-paper px-3 py-2 text-[13.5px] outline-none focus:border-forest resize-none" />

            {/* Schedule toggle */}
            <div className="flex items-center gap-2 text-[12px]">
              <label className="inline-flex items-center gap-1.5">
                <input type="checkbox" checked={!!scheduleAt}
                       onChange={(e) => setScheduleAt(e.target.checked ? defaultLocalPlusHour() : '')}
                       className="h-4 w-4 accent-forest" />
                <span className="font-bold">Schedule for later</span>
              </label>
              {scheduleAt && (
                <input type="datetime-local" value={scheduleAt}
                       onChange={(e) => setScheduleAt(e.target.value)}
                       className="border border-line rounded-[8px] px-2 py-1 bg-paper text-[12px]" />
              )}
            </div>

            <button onClick={() => setConfirmingSend(scheduleAt
                        ? { kind: 'schedule', recipients: recipientCount, body: body.trim(), sendAt: scheduleAt }
                        : { kind: 'broadcast', recipients: recipientCount, body: body.trim() })}
                    disabled={!body.trim() || recipientCount === 0 || (scheduleAt !== '' && new Date(scheduleAt).getTime() < Date.now())}
                    className="w-full haptic text-[14px] font-extrabold bg-clay text-paper px-4 py-3 rounded-[10px] shadow-ctag disabled:opacity-50">
              {scheduleAt
                ? `Schedule for ${new Date(scheduleAt).toLocaleString()} · ${recipientCount} driver${recipientCount === 1 ? '' : 's'}`
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
                <div key={s.id} className="flex items-center gap-2 text-[12px]">
                  <span className="font-bold text-forest whitespace-nowrap">{new Date(s.send_at).toLocaleString()}</span>
                  <span className="flex-1 min-w-0 truncate text-ink">{s.body}</span>
                  <button onClick={() => cancelScheduledMut.mutate(s.id)}
                          className="haptic text-clay font-bold text-[11px] px-2 py-0.5 rounded hover:bg-clay/10">
                    Cancel
                  </button>
                </div>
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
                Delivery: {new Date(confirmingSend.sendAt).toLocaleString()}
              </div>
            )}
          </div>
          <div className="text-[13px] mb-2">
            <b>Recipients:</b> {confirmingSend.recipients} driver{confirmingSend.recipients === 1 ? '' : 's'}
          </div>
          <pre className="text-[12px] bg-cream/60 p-3 rounded-[8px] whitespace-pre-wrap max-h-[280px] overflow-y-auto">{confirmingSend.body}</pre>
          <div className="mt-3 flex justify-end gap-2">
            <Button size="sm" variant="plain" onClick={() => setConfirmingSend(null)}>Cancel</Button>
            <Button size="sm"
                    loading={broadcastMut.isPending || sendAllOpenMut.isPending || scheduleMut.isPending || storeBroadcastMut.isPending}
                    onClick={() => {
                      if (confirmingSend.kind === 'send-all-open') sendAllOpenMut.mutate();
                      else if (confirmingSend.kind === 'schedule') scheduleMut.mutate();
                      else if (mode === 'store') storeBroadcastMut.mutate();
                      else broadcastMut.mutate();
                    }}>
              {confirmingSend.kind === 'schedule' ? 'Confirm + schedule' : 'Confirm + send'}
            </Button>
          </div>
        </Modal>
      )}
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

function defaultLocalPlusHour(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
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
        <TabBtn active={tab === 'types'} onClick={() => setTab('types')} icon={<Megaphone size={13} />} label="Types" />
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
              <button onClick={() => { if (confirm(`Delete "${t.name}"?`)) del.mutate(t.id); }} title="Delete"
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
  const [openId, setOpenId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDefault, setNewDefault] = useState(false);

  const createM = useMutation({
    mutationFn: () => volunteerGroups.create({ name: newName.trim(), isDefaultBroadcast: newDefault }),
    onSuccess: (r) => { setCreating(false); setNewName(''); setNewDefault(false); setOpenId(Number(r.data.id)); qc.invalidateQueries({ queryKey: ['sms-groups'] }); },
  });
  const groups = groupsQ.data?.data ?? [];
  const open = openId ? groups.find((g) => Number(g.id) === openId) : null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-display font-semibold text-[16px]">SMS broadcast groups</div>
          <div className="text-[12px] text-muted">Choose which drivers get the auto-SMS when a new pickup is created. The <em>default</em> group is used when a pickup is saved with "Auto-notify" on but no group selected.</div>
        </div>
        <Button size="sm" variant="forest" icon={<Plus size={13} />} onClick={() => setCreating(true)}>New group</Button>
      </div>

      {creating && (
        <div className="rounded-[12px] border border-line bg-cream/50 p-3 flex items-end gap-2">
          <label className="flex-1 text-[12px] font-bold text-muted">Name
            <input value={newName} onChange={(e) => setNewName(e.target.value)}
                   className="w-full mt-1 rounded-[8px] border border-line bg-paper px-2 py-1 text-[13px]" />
          </label>
          <label className="flex items-center gap-1.5 text-[12.5px] pb-1.5">
            <input type="checkbox" checked={newDefault} onChange={(e) => setNewDefault(e.target.checked)} />
            <span>Default broadcast group</span>
          </label>
          <Button size="sm" variant="forest" onClick={() => createM.mutate()} disabled={!newName.trim() || createM.isPending}>
            {createM.isPending ? 'Creating…' : 'Create'}
          </Button>
          <Button size="sm" variant="plain" onClick={() => setCreating(false)}>Cancel</Button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-3">
        <div className="rounded-[14px] border border-line bg-paper divide-y divide-line/70 overflow-hidden">
          {groups.length === 0 && <div className="p-4 text-[12.5px] text-muted italic">No groups yet.</div>}
          {groups.map((g) => (
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
          {!open ? (
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
 * batch abc800 Aug 9 — one row inside SmsGroupDetail with inline quiet-hours
 * editing. Saves via adminCRUD.patchVolunteer since quiet hours belong to the
 * volunteer record, not the group. `m.sms_quiet_start` / `m.sms_quiet_end`
 * come as "HH:MM" strings from the group-detail query (see volunteer-groups.ts).
 */
function GroupMemberRow({ m, groupName, onRemove, onSaved }: {
  m: any; groupName: string; onRemove: () => void; onSaved: () => void;
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
          {m.first_name} {m.last_name}
          {m.unit_number != null && <span className="ml-1.5 text-muted font-semibold text-[11.5px]">#{m.unit_number}</span>}
        </div>
        <div className="text-[11.5px] text-muted">{m.phone_primary ?? '—'}</div>
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
      <button onClick={() => { if (confirm(`Remove ${m.first_name} from "${groupName}"?`)) onRemove(); }}
              className="haptic text-[11.5px] text-clay font-bold px-2 py-1 rounded hover:bg-clay/10">
        Remove
      </button>
    </div>
  );
}

function SmsGroupDetail({ groupId, groupName, isDefault, allVolunteers, onDone }:
  { groupId: number; groupName: string; isDefault: boolean; allVolunteers: any[]; onDone: () => void }) {
  const qc = useQueryClient();
  const detail = useQuery({ queryKey: ['sms-group', groupId], queryFn: () => volunteerGroups.get(groupId) });
  const members = detail.data?.data?.members ?? [];
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameVal, setRenameVal] = useState(groupName);
  const [defToggle, setDefToggle] = useState(isDefault);
  const [addPick, setAddPick] = useState('');
  const [pickedIds, setPickedIds] = useState<Set<number>>(new Set());

  const patchM  = useMutation({
    mutationFn: () => volunteerGroups.patch(groupId, { name: renameVal.trim(), isDefaultBroadcast: defToggle }),
    onSuccess: () => { setRenameOpen(false); qc.invalidateQueries({ queryKey: ['sms-groups'] }); qc.invalidateQueries({ queryKey: ['sms-group', groupId] }); },
  });
  const addM   = useMutation({
    mutationFn: () => volunteerGroups.addMembers(groupId, Array.from(pickedIds)),
    onSuccess: () => { setPickedIds(new Set()); setAddPick(''); qc.invalidateQueries({ queryKey: ['sms-group', groupId] }); qc.invalidateQueries({ queryKey: ['sms-groups'] }); },
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
        {!renameOpen && (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="plain" icon={<Pencil size={13} />} onClick={() => setRenameOpen(true)}>Rename</Button>
            <Button size="sm" variant="plain" icon={<Trash2 size={13} />}
                    onClick={() => { if (confirm(`Delete group "${groupName}"? Members are NOT deleted.`)) delM.mutate(); }}>
              Delete
            </Button>
          </div>
        )}
      </div>

      <div className="rounded-[10px] border border-line divide-y divide-line/70 overflow-hidden">
        {members.length === 0 && <div className="px-3 py-2.5 text-[12.5px] text-muted italic">No members yet — add drivers below.</div>}
        {members.map((m: any) => (
          <GroupMemberRow key={m.id} m={m} groupName={groupName}
                          onRemove={() => rmM.mutate(Number(m.id))}
                          onSaved={() => { qc.invalidateQueries({ queryKey: ['sms-group', groupId] }); }} />
        ))}
      </div>

      <div>
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
                    {v.firstName} {v.lastName}
                    {v.unitNumber != null && <span className="ml-1.5 text-muted font-semibold text-[11.5px]">#{v.unitNumber}</span>}
                  </div>
                  <div className="text-[11.5px] text-muted">{v.phonePrimary ?? '—'}</div>
                </div>
              </label>
            );
          })}
        </div>
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
  const listQ = useQuery({
    queryKey: ['sms-threads', includeShop ? 'all' : 'volunteer'],
    queryFn: () => smsThreads.list({ includeShop }),
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
  const [openPhone, setOpenPhone] = useState<string | null>(null);
  const rows: SmsThreadRow[] = listQ.data?.data ?? [];

  useEffect(() => {
    if (!openPhone && rows.length > 0) setOpenPhone(rows[0].phone);
  }, [rows, openPhone]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-3 h-[calc(100vh-180px)] min-h-[400px]">
      <div className="rounded-[14px] border border-line bg-paper overflow-hidden flex flex-col min-h-0">
        <div className="px-3 py-2 border-b border-line/70 flex items-center justify-between gap-2 shrink-0">
          <div className="text-[11.5px] font-extrabold uppercase tracking-wider text-muted">
            Conversations {rows.length ? `· ${rows.length}` : ''}
          </div>
          <label className="flex items-center gap-1.5 text-[11px] text-muted cursor-pointer whitespace-nowrap"
                 title="Include the shop-order pipeline messages (donor orders, product confirms, etc.).">
            <input type="checkbox" checked={includeShop} onChange={(e) => setIncludeShop(e.target.checked)}
                   className="h-3.5 w-3.5 accent-forest" />
            Show shop msgs
          </label>
        </div>
        <div className="divide-y divide-line/70 overflow-y-auto flex-1 min-h-0">
          {rows.length === 0 && <div className="px-3 py-6 text-[12.5px] text-muted italic text-center">No SMS conversations yet.</div>}
          {rows.map((t) => {
            const name = t.first_name ? `${t.first_name} ${t.last_name ?? ''}`.trim() : t.phone;
            return (
              <button key={t.phone} onClick={() => setOpenPhone(t.phone)}
                      className={cx('w-full text-left px-3 py-2.5', openPhone === t.phone ? 'bg-sage/40' : 'hover:bg-cream/50')}>
                <div className="flex items-baseline justify-between gap-2">
                  <div className="font-bold text-[13px] truncate">
                    {name}
                    {t.unit_number != null && <span className="ml-1.5 text-muted font-semibold text-[11.5px]">#{t.unit_number}</span>}
                  </div>
                  <div className="text-[10.5px] text-muted whitespace-nowrap">{fmtRelative(t.last_at)}</div>
                </div>
                <div className="text-[11.5px] text-muted mt-0.5">{t.phone}</div>
                {t.last_body && <div className="text-[12px] text-ink/80 truncate mt-1">{t.last_body}</div>}
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

function SmsThread({ phone, onSent, includeShop = false }: { phone: string; onSent: () => void; includeShop?: boolean }) {
  const detailQ = useQuery({
    queryKey: ['sms-thread', phone, includeShop ? 'all' : 'volunteer'],
    queryFn: () => smsThreads.get(phone, { includeShop }),
    refetchInterval: 15_000,
  });
  const [body, setBody] = useState('');
  const sendM = useMutation({
    mutationFn: () => smsThreads.send(phone, body.trim()),
    onSuccess: () => { setBody(''); onSent(); detailQ.refetch(); },
  });
  const d = detailQ.data?.data;
  const msgs = d?.messages ?? [];
  const contact = d?.contact;
  const name = contact ? `${contact.first_name} ${contact.last_name}${contact.unit_number != null ? ` · #${contact.unit_number}` : ''}` : phone;

  return (
    <>
      <div className="px-4 py-2.5 border-b border-line/70 flex items-center justify-between gap-2">
        <div>
          <div className="font-bold text-[14px]">{name}</div>
          <div className="text-[11.5px] text-muted">{phone}</div>
        </div>
        <div className="text-[11.5px] text-muted">{msgs.length} message{msgs.length === 1 ? '' : 's'}</div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 bg-cream/40">
        {msgs.length === 0 && <div className="text-[12.5px] text-muted italic text-center py-8">No messages yet.</div>}
        {msgs.map((m) => (
          <div key={m.id} className={cx('flex', m.direction === 'out' ? 'justify-end' : 'justify-start')}>
            <div className={cx('max-w-[80%] rounded-[14px] px-3 py-2',
                m.direction === 'out' ? 'bg-forest text-paper' : 'bg-paper border border-line')}>
              <div className="text-[13px] whitespace-pre-wrap break-words">{m.body}</div>
              <div className={cx('text-[10.5px] mt-1', m.direction === 'out' ? 'text-paper/70' : 'text-muted')}>
                {new Date(m.created_at).toLocaleString()}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-line/70 p-3 flex items-end gap-2">
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2}
                  placeholder="Type an SMS reply…"
                  className="flex-1 rounded-[10px] border border-line bg-paper px-3 py-2 text-[13px] resize-none" />
        <Button size="sm" variant="forest" icon={<Send size={13} />}
                onClick={() => sendM.mutate()} disabled={!body.trim() || sendM.isPending}>
          {sendM.isPending ? 'Sending…' : 'Send'}
        </Button>
      </div>
    </>
  );
}

function fmtRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return 'now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sms-dispatchers'] }),
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
                      <span>{d.matched_volunteer.name}</span>
                      {d.matched_volunteer.unit_number != null && (
                        <span className="text-muted font-semibold text-[11.5px]">#{d.matched_volunteer.unit_number}</span>
                      )}
                    </>
                  ) : (
                    <span>{d.label ?? 'Dispatcher'}</span>
                  )}
                  <span className="text-muted font-normal text-[12px]">·</span>
                  <span className="text-[12px] text-muted">{d.phone}</span>
                </div>
                {d.label && d.matched_volunteer?.name && (
                  <div className="text-[11.5px] text-muted">{d.label}</div>
                )}
              </div>
              <button onClick={() => { if (confirm(`Remove ${d.matched_volunteer?.name ?? d.phone} from dispatchers?`)) del.mutate(d.phone); }}
                      className="haptic text-clay text-[10.5px] font-bold px-2 py-1 rounded-[8px] hover:bg-clay/10">
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
  const q = useQuery({ queryKey: ['admin-dispatchers'], queryFn: () => adminDispatchers.list(), refetchInterval: 60_000 });
  const toggleSms = useMutation({
    mutationFn: async ({ phone, enable }: { phone: string; enable: boolean }) => {
      if (enable) return smsDispatchers.add({ phone, label: null });
      return smsDispatchers.remove(phone);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-dispatchers'] }),
  });
  const patchRole = useMutation({
    mutationFn: ({ id, role }: { id: number; role: string }) =>
      api<{ data: any }>(`/api/admin-users/${id}`, { method: 'PATCH', body: JSON.stringify({ role }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-dispatchers'] }),
  });
  const disable = useMutation({
    mutationFn: (id: number) => api<{ data: any }>(`/api/admin-users/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-dispatchers'] }),
  });

  const rows: AdminDispatcher[] = q.data?.data ?? [];
  const fmtLast = (iso: string | null) => {
    if (!iso) return 'never';
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
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
      {q.isLoading && <div className="text-[13px] text-muted">Loading…</div>}
      {!q.isLoading && rows.length === 0 && (
        <div className="text-[13px] text-muted italic">No staff users yet.</div>
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
              <td className="py-2 pr-3 font-bold">{d.firstName} {d.lastName}</td>
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
              <td className="py-2 pr-3 text-muted">{d.phone ?? '—'}</td>
              <td className="py-2 pr-3">
                <input type="checkbox" checked={d.smsDispatcher}
                       disabled={!d.phone || toggleSms.isPending}
                       onChange={(e) => d.phone && toggleSms.mutate({ phone: d.phone, enable: e.target.checked })}
                       className="accent-forest h-4 w-4" />
              </td>
              <td className="py-2 pr-3 text-muted">{fmtLast(d.lastLoginAt)}</td>
              <td className="py-2 pr-3 text-muted">{d.inLast7} / {d.outLast7}</td>
              <td className="py-2 pr-3">
                {d.isActive ? (
                  <button onClick={() => { if (confirm(`Disable ${d.firstName} ${d.lastName}?`)) disable.mutate(d.id); }}
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
